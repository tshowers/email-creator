import { API, emailHtml, makeEmail, pngFile, say, stubGenerate, stubPlan, visitSignedIn } from '../support/helpers';

const CATALYST_URL = 'https://outreach.16ahead.com/email-processor?emailCreatorHandoff=h1';
const COMPOSER_URL = 'https://outreach.16ahead.com/compose-email?emailCreatorHandoff=h2';
const HOSTED_URL = 'https://firebasestorage.googleapis.com/v0/b/taliferrotech.appspot.com/o/email-creator%2Flogo.png?alt=media';

function stubCheck ( canSendWithOutreach: boolean, fillIns: { catalyst?: { token: string; label: string }[]; composer?: { token: string; label: string }[] } = {} ): void {
  cy.intercept( 'POST', `${ API }/handoff/check`, {
    success: true,
    canSendWithOutreach,
    fillIns: { catalyst: fillIns.catalyst || [], composer: fillIns.composer || [], drips: [] },
  } ).as( 'check' );
}

describe( 'Sending with Outreach', () => {
  beforeEach( () => visitSignedIn() );

  it( 'hands an email with nothing to fill in straight to Catalyst', () => {
    makeEmail();
    stubCheck( true );
    cy.intercept( 'POST', `${ API }/handoff`, { success: true, id: 'h1', url: CATALYST_URL } ).as( 'handoff' );
    cy.contains( 'button', 'Send to many - Catalyst' ).click();

    cy.wait( '@check' ).its( 'request.body' ).should( 'deep.include', { subject: 'Fall loaves are here' } );
    cy.wait( '@handoff' ).its( 'request.body' ).then( ( body ) => {
      expect( body ).to.deep.include( { target: 'catalyst', subject: 'Fall loaves are here', preheader: 'Pumpkin is back', fills: {} } );
      expect( body.html ).to.contain( '<h1>Fall loaves</h1>' );
    } );
    cy.get( '.send-panel' ).should( 'contain.text', 'each contact gets their own name and company' );
    cy.contains( '.send-panel a', 'Open Catalyst' )
      .should( 'have.attr', 'href', CATALYST_URL )
      .and( 'have.attr', 'target', '_blank' )
      .invoke( 'removeAttr', 'target' ).invoke( 'attr', 'href', '#' ).click();
    cy.get( '.send-panel' ).should( 'not.exist' );
  } );

  it( 'asks for the fill-ins first when sending to one person', () => {
    makeEmail();
    stubCheck( true, { composer: [ { token: 'firstName', label: 'Recipient\'s first name' }, { token: 'eventDate', label: 'Event date' } ] } );
    cy.intercept( 'POST', `${ API }/handoff`, { success: true, id: 'h2', url: COMPOSER_URL } ).as( 'handoff' );
    cy.contains( 'button', 'Send to one - Email Composer' ).click();
    cy.wait( '@check' );

    cy.get( '.send-panel .fill' ).should( 'have.length', 2 );
    cy.contains( '.send-panel button', 'Continue to Email Composer' ).should( 'be.disabled' );
    cy.contains( '.fill', 'Recipient\'s first name' ).find( 'input' ).type( 'Dana' );
    cy.contains( '.send-panel button', 'Continue to Email Composer' ).should( 'be.disabled' );
    cy.contains( '.fill', 'Event date' ).find( 'input' ).type( 'Nov 12' );
    cy.contains( '.send-panel button', 'Continue to Email Composer' ).click();

    cy.wait( '@handoff' ).its( 'request.body' ).should( 'deep.include', { target: 'composer', fills: { firstName: 'Dana', eventDate: 'Nov 12' } } );
    cy.contains( '.send-panel a', 'Open Email Composer' ).should( 'have.attr', 'href', COMPOSER_URL );
  } );

  it( 'hosts the images before handing off, so Outreach gets real image links', () => {
    cy.get( 'input[type="file"]' ).selectFile( pngFile(), { force: true } );
    stubPlan( 'Use u1', { imageIds: [ 'u1' ] } );
    stubGenerate( { subject: 'With logo', html: emailHtml( '<img src="todd-image:u1" alt="logo">' ) } );
    say( 'An email with my logo' );
    cy.wait( '@generate' );

    stubCheck( true );
    cy.intercept( 'POST', `${ API }/host-image`, { success: true, url: HOSTED_URL, expiresAt: '2026-11-13T12:00:00Z' } ).as( 'host' );
    cy.intercept( 'POST', `${ API }/handoff`, { success: true, id: 'h1', url: CATALYST_URL } ).as( 'handoff' );
    cy.contains( 'button', 'Send to many - Catalyst' ).click();
    cy.wait( '@host' );
    cy.wait( '@handoff' ).its( 'request.body.html' ).should( 'contain', `src="${ HOSTED_URL }"` ).and( 'not.contain', 'todd-image:' );
  } );

  it( 'sends an email to Drips, where it waits in Ready', () => {
    makeEmail();
    stubCheck( true );
    const dripUrl = 'https://outreach.16ahead.com/drips/d1';
    cy.intercept( 'POST', `${ API }/handoff`, { success: true, id: 'd1', url: dripUrl } ).as( 'handoff' );
    cy.contains( 'button', 'Send over time - Drips' ).should( 'contain.text', 'one person at a time, for up to 30 days' ).click();
    cy.wait( '@handoff' ).its( 'request.body' ).should( 'deep.include', { target: 'drips', subject: 'Fall loaves are here', fills: {} } );
    cy.get( '.send-panel' ).should( 'contain.text', 'Ready in Drips. Pick who gets it and how fast, then turn it on.' );
    cy.contains( '.send-panel a', 'Open Drips' ).should( 'have.attr', 'href', dripUrl ).and( 'have.attr', 'target', '_blank' );
  } );

  it( 'points to Outreach pricing without the subscription', () => {
    makeEmail();
    stubCheck( false );
    cy.contains( 'button', 'Send to many - Catalyst' ).click();
    cy.wait( '@check' );
    cy.get( '.send-panel' ).should( 'contain.text', 'Sending needs the Outreach app subscription. Downloading stays free.' );
    cy.contains( '.send-panel a', 'See Outreach pricing' ).should( 'have.attr', 'href', 'https://outreach.16ahead.com/pricing' );
  } );

  it( 'shows why a handoff failed and can be cancelled', () => {
    makeEmail();
    stubCheck( true, { catalyst: [ { token: 'eventDate', label: 'Event date' } ] } );
    cy.intercept( 'POST', `${ API }/handoff`, { statusCode: 400, body: { message: 'Fill in Event date first.' } } ).as( 'handoff' );
    cy.contains( 'button', 'Send to many - Catalyst' ).click();
    cy.contains( '.fill', 'Event date' ).find( 'input' ).type( ' ' );
    cy.contains( '.send-panel button', 'Continue to Catalyst' ).should( 'be.disabled' );
    cy.contains( '.fill', 'Event date' ).find( 'input' ).type( 'Nov 12' );
    cy.contains( '.send-panel button', 'Continue to Catalyst' ).click();
    cy.wait( '@handoff' );
    cy.get( '.send-error' ).should( 'have.text', 'Fill in Event date first.' );

    cy.contains( '.send-panel button', 'Cancel' ).click();
    cy.get( '.send-panel' ).should( 'not.exist' );
  } );

  it( 'shows an error when the check fails', () => {
    makeEmail();
    cy.intercept( 'POST', `${ API }/handoff/check`, { statusCode: 500, body: { message: 'Couldn\'t check this email. Please try again.' } } ).as( 'check' );
    cy.contains( 'button', 'Send to one - Email Composer' ).click();
    cy.wait( '@check' );
    cy.get( '.send-error' ).should( 'have.text', 'Couldn\'t check this email. Please try again.' );
  } );
} );
