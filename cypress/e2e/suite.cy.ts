import { API, NONE_LEFT, USAGE, visitSignedIn } from '../support/helpers';

/**
 * TODD Suite ($99/mo, Ty 2026-10-21): every TODD app, and 10x the free
 * daily emails here. Offered beside the 5-pack once the day runs out; it is
 * sold by todd-backend /api/billing/checkout (product "suite") and switched
 * on by Stripe's webhook, so the page polls usage for the higher limit.
 */
const SUITE_CHECKOUT = 'https://api.taliferro.tech/api/billing/checkout';
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_suite';

describe( 'TODD Suite in Email Creator', () => {
  it( 'is only offered once the free emails and credits are gone', () => {
    visitSignedIn( '/', { usage: USAGE } );
    cy.get( '[data-cy="buy-suite"]' ).should( 'not.exist' );
  } );

  it( 'buys Suite in a new tab and notices the 10x allowance', () => {
    visitSignedIn( '/', { usage: NONE_LEFT } );
    const tab = { closed: false, location: { href: '' }, close: () => { tab.closed = true; } };
    cy.window().then( ( win ) => cy.stub( win, 'open' ).as( 'open' ).returns( tab ) );
    cy.intercept( 'POST', SUITE_CHECKOUT, { url: CHECKOUT_URL } ).as( 'checkout' );
    cy.clock( Date.now(), [ 'setTimeout' ] );

    cy.get( '[data-cy="buy-suite"]' ).should( 'contain.text', 'Get TODD Suite' ).click();
    cy.get( '@open' ).should( 'have.been.calledWith', '', '_blank' );
    cy.wait( '@checkout' ).then( ( { request } ) => {
      expect( request.body.product ).to.equal( 'suite' );
      expect( request.body.returnUrl ).to.match( /^http:\/\/localhost:\d+\/$/ );
      expect( request.headers[ 'authorization' ] ).to.equal( 'Bearer e2e-id-token' );
    } );
    cy.wrap( tab ).its( 'location.href' ).should( 'equal', CHECKOUT_URL );
    cy.get( '[data-cy="buy-credits-waiting"]' ).should( 'contain.text', 'Finish checkout in the new tab' );

    cy.intercept( 'GET', `${ API }/usage`, { success: true, usage: { ...NONE_LEFT, limit: 100, remaining: 90 }, canAskMaya: false } ).as( 'usage' );
    cy.tick( 3000 );
    cy.wait( '@usage' );
    cy.get( '.notice' ).should( 'contain.text', 'TODD Suite is on' );
    cy.get( '.usage' ).should( 'contain.text', '90 of 100 free left today' );
    cy.get( '.composer textarea' ).should( 'not.be.disabled' );
  } );

  it( 'says so when Suite checkout won\'t start, and closes the empty tab', () => {
    visitSignedIn( '/', { usage: NONE_LEFT } );
    const tab = { closed: false, location: { href: '' }, close: () => { tab.closed = true; } };
    cy.window().then( ( win ) => cy.stub( win, 'open' ).returns( tab ) );
    cy.intercept( 'POST', SUITE_CHECKOUT, { statusCode: 409, body: { code: 'ALREADY_ENTITLED', message: 'You already have TODD Suite.' } } ).as( 'checkout' );
    cy.get( '[data-cy="buy-suite"]' ).click();
    cy.wait( '@checkout' );
    cy.get( '.notice' ).should( 'contain.text', 'You already have TODD Suite.' );
    cy.wrap( tab ).its( 'closed' ).should( 'be.true' );
  } );
} );
