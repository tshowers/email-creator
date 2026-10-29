import { makeEmail, visitSignedIn } from '../support/helpers';

describe( 'Signing in and out', () => {
  it( 'sends a signed-out visitor to TODD\'s login, keeping a Maya link for afterwards', () => {
    cy.intercept( 'https://todd.taliferro.tech/login*', { body: '<html><body>TODD login</body></html>' } ).as( 'login' );
    cy.visit( '/?mayaEmail=d1' );
    cy.contains( 'button', 'Sign in with 16Ahead' ).click();

    cy.wait( '@login' ).then( ( { request } ) => {
      const url = new URL( request.url );
      expect( url.searchParams.get( 'client' ) ).to.equal( 'email-creator-web-local' );
      expect( url.searchParams.get( 'state' ) ).to.match( /^[0-9a-f-]{36}$/ );
    } );
  } );

  it( 'stores the return URL and state for the callback before leaving', () => {
    cy.intercept( 'https://todd.taliferro.tech/login*', { body: '<html></html>' } ).as( 'login' );
    cy.visit( '/?mayaEmail=d1' );
    cy.contains( 'button', 'Sign in with 16Ahead' ).click();
    cy.wait( '@login' ).then( ( { request } ) => {
      const state = new URL( request.url ).searchParams.get( 'state' );
      // Back on Email Creator (same tab), the pending login is waiting for the callback.
      cy.visit( '/help' );
      cy.window().then( ( win ) => {
        const pending = JSON.parse( win.sessionStorage.getItem( 'email_creator_hosted_login_pending' ) || '{}' );
        expect( pending ).to.deep.equal( { state, returnUrl: '/?mayaEmail=d1' } );
      } );
    } );
  } );

  it( 'refuses a sign-in callback that wasn\'t started here', () => {
    cy.visit( '/auth/callback?token=forged&state=not-mine' );
    cy.contains( 'This sign-in link is invalid or expired. Please try signing in again.' );
  } );

  it( 'signs out from the menu, after confirming when there are emails', () => {
    visitSignedIn();
    makeEmail();
    cy.window().then( ( win ) => cy.stub( win, 'confirm' ).as( 'confirm' ).returns( true ) );
    cy.get( '.platform-menu-trigger' ).click();
    cy.contains( '.um-account button', 'Sign out' ).click();
    cy.get( '@confirm' ).should( 'have.been.calledWith', 'Sign out? Emails you haven\'t downloaded will be gone.' );
    cy.contains( 'button', 'Sign in with 16Ahead' ).should( 'be.visible' );
  } );
} );
