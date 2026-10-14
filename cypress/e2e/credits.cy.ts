import { API, BILLING, NONE_LEFT, USAGE, emailHtml, say, stubPlan, visitSignedIn } from '../support/helpers';

const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_123';

describe( 'Daily limit and buying emails', () => {
  it( 'shows credits alongside the free allowance', () => {
    visitSignedIn( '/', { usage: { ...USAGE, credits: 3 } } );
    cy.get( '.usage' ).should( 'contain.text', '9 of 10 free left today · 3 bought' );
  } );

  it( 'stops the composer and offers a pack once everything is used', () => {
    visitSignedIn( '/', { usage: NONE_LEFT } );
    cy.get( '.usage' ).should( 'have.class', 'usage-empty' ).and( 'contain.text', '0 of 10 free left today' );
    cy.get( '.composer textarea' ).should( 'be.disabled' ).and( 'have.attr', 'placeholder', 'No emails left today. Buy more to keep going.' );
    cy.get( '[data-cy="buy-credits"]' ).should( 'contain.text', 'Buy 5 more emails' );
  } );

  it( 'offers no pack when none is for sale', () => {
    visitSignedIn( '/', { usage: { ...NONE_LEFT, pack: undefined } } );
    cy.get( '[data-cy="buy-credits"]' ).should( 'not.exist' );
  } );

  it( 'tells the user when TODD hits the limit mid-chat', () => {
    visitSignedIn();
    cy.intercept( 'POST', `${ API }/chat`, {
      success: true, action: 'limit', reply: 'Your workspace has used all 10 free emails for today.', canBuyCredits: true, usage: NONE_LEFT,
    } ).as( 'chat' );
    say( 'One more email' );
    cy.wait( '@chat' );
    cy.get( '.todd-text' ).should( 'contain.text', 'used all 10 free emails for today' );
    cy.get( '[data-cy="buy-credits"]' ).should( 'be.visible' );
    cy.get( '.composer textarea' ).should( 'be.disabled' );
  } );

  it( 'shows the limit when designing is refused', () => {
    visitSignedIn();
    stubPlan( 'brief' );
    cy.intercept( 'POST', `${ API }/generate`, {
      statusCode: 429, body: { message: 'Your workspace has used all 10 free emails for today.', usage: NONE_LEFT, canBuyCredits: true },
    } ).as( 'generate' );
    say( 'An email' );
    cy.wait( '@generate' );
    cy.get( '.error' ).should( 'contain.text', 'used all 10 free emails' ).find( 'button' ).should( 'not.exist' );
    cy.get( '[data-cy="buy-credits"]' ).should( 'be.visible' );
  } );

  it( 'buys a pack in a new tab and notices when the credits arrive', () => {
    visitSignedIn( '/', { usage: NONE_LEFT } );
    const tab = { closed: false, location: { href: '' }, close: () => { tab.closed = true; } };
    cy.window().then( ( win ) => cy.stub( win, 'open' ).as( 'open' ).returns( tab ) );
    cy.intercept( 'POST', BILLING, { url: CHECKOUT_URL } ).as( 'checkout' );
    cy.clock( Date.now(), [ 'setTimeout' ] );

    cy.get( '[data-cy="buy-credits"]' ).click();
    cy.get( '@open' ).should( 'have.been.calledWith', '', '_blank' );
    cy.wait( '@checkout' ).then( ( { request } ) => {
      expect( request.body.pack ).to.equal( 'email_5' );
      expect( request.body.returnUrl ).to.match( /^http:\/\/localhost:4200\/$/ );
      expect( request.headers[ 'authorization' ] ).to.equal( 'Bearer e2e-id-token' );
    } );
    cy.wrap( tab ).its( 'location.href' ).should( 'equal', CHECKOUT_URL );
    cy.get( '[data-cy="buy-credits-waiting"]' ).should( 'contain.text', 'Finish checkout in the new tab' );

    // Stripe's webhook adds the credits; the page polls usage until it sees them.
    cy.intercept( 'GET', `${ API }/usage`, { success: true, usage: { ...NONE_LEFT, credits: 5 }, canAskMaya: false } ).as( 'usage' );
    cy.tick( 3000 );
    cy.wait( '@usage' );
    cy.get( '.notice' ).should( 'contain.text', 'Thanks! Your credits were added.' );
    cy.get( '.usage' ).should( 'contain.text', '5 bought' );
    cy.get( '.composer textarea' ).should( 'not.be.disabled' );
  } );

  it( 'stops waiting when the user cancels, and reports a checkout that won\'t start', () => {
    visitSignedIn( '/', { usage: NONE_LEFT } );
    const tabs: { closed: boolean; location: { href: string }; close: () => void }[] = [];
    cy.window().then( ( win ) => cy.stub( win, 'open' ).callsFake( () => {
      const tab = { closed: false, location: { href: '' }, close: () => { tab.closed = true; } };
      tabs.push( tab );
      return tab;
    } ) );
    cy.intercept( 'POST', BILLING, { statusCode: 500, body: { message: 'Checkout is down.' } } ).as( 'checkout' );
    cy.get( '[data-cy="buy-credits"]' ).click();
    cy.wait( '@checkout' );
    cy.get( '.notice' ).should( 'contain.text', 'Checkout is down.' );
    cy.wrap( tabs ).its( '0.closed' ).should( 'be.true' );

    cy.intercept( 'POST', BILLING, { url: CHECKOUT_URL } ).as( 'checkout' );
    cy.get( '[data-cy="buy-credits"]' ).click();
    cy.get( '[data-cy="buy-credits-waiting"]' ).click();
    cy.get( '[data-cy="buy-credits"]' ).should( 'be.visible' );
  } );

  it( 'thanks the user when Stripe returns to this tab', () => {
    visitSignedIn( '/?checkout=success' );
    cy.get( '.notice' ).should( 'contain.text', 'Thanks! Your credits will appear in a moment.' );
    cy.location( 'search' ).should( 'equal', '' );
  } );

  it( 'designs normally from bought credits', () => {
    visitSignedIn( '/', { usage: { ...NONE_LEFT, credits: 2 } } );
    cy.get( '.composer textarea' ).should( 'not.be.disabled' );
    stubPlan( 'b' );
    cy.intercept( 'POST', `${ API }/generate`, {
      success: true, email: { subject: 'Paid for', preheader: '', html: emailHtml( '<p>x</p>' ), notes: [] }, usage: { ...NONE_LEFT, credits: 1 },
    } ).as( 'generate' );
    say( 'An email' );
    cy.wait( '@generate' );
    cy.get( '.usage' ).should( 'contain.text', '1 bought' );
  } );
} );
