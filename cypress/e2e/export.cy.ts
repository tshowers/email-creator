import { API, emailHtml, makeEmail, pngFile, say, stubGenerate, stubPlan, visitSignedIn } from '../support/helpers';

const HOSTED_URL = 'https://firebasestorage.googleapis.com/v0/b/taliferrotech.appspot.com/o/email-creator%2Flogo.png?alt=media';
const DOWNLOADS = 'cypress/downloads';

/** An email that uses one attached image (u1). */
function makeEmailWithLogo ( subject: string ): void {
  cy.get( 'input[type="file"]' ).selectFile( pngFile( 'Company Logo.png' ), { force: true } );
  stubPlan( 'Use u1 as the logo', { imageIds: [ 'u1' ] } );
  stubGenerate( { subject, html: emailHtml( '<img src="todd-image:u1" alt="logo"><p>Hello</p>' ) } );
  say( 'An email with my logo' );
  cy.wait( '@generate' );
  cy.get( '.email-meta' ).should( 'contain.text', subject );
}

function stubHosting (): void {
  cy.intercept( 'POST', `${ API }/host-image`, { success: true, url: HOSTED_URL, expiresAt: '2026-11-13T12:00:00Z' } ).as( 'host' );
}

describe( 'Exporting an email', () => {
  beforeEach( () => visitSignedIn() );

  it( 'downloads an email without images as one HTML file', () => {
    makeEmail( { subject: 'Plain email' } );
    cy.contains( '.toolbar button', 'Download HTML' ).click();
    cy.readFile( `${ DOWNLOADS }/plain-email.html` ).should( 'contain', '<h1>Fall loaves</h1>' );
    cy.get( '.more-row' ).should( 'not.exist' );
  } );

  it( 'copies the HTML of an email without images', () => {
    makeEmail();
    cy.window().then( ( win ) => cy.stub( win.navigator.clipboard, 'writeText' ).as( 'copy' ).resolves() );
    cy.contains( '.toolbar button', 'Copy HTML' ).click();
    cy.get( '@copy' ).should( 'have.been.calledOnce' ).its( 'firstCall.args.0' ).should( 'contain', '<h1>Fall loaves</h1>' );
    cy.get( '.notice' ).should( 'contain.text', 'HTML copied.' );
  } );

  it( 'hosts the images for Download HTML, once, and says until when they work', () => {
    makeEmailWithLogo( 'Hosted logo' );
    stubHosting();
    cy.contains( '.toolbar button', 'Download HTML' ).click();
    cy.wait( '@host' ).its( 'request.body.dataUrl' ).should( 'match', /^data:image\/png;base64,/ );
    cy.readFile( `${ DOWNLOADS }/hosted-logo.html` ).should( 'contain', `src="${ HOSTED_URL }"` ).and( 'not.contain', 'todd-image:' );
    cy.get( '.notice' ).should( 'contain.text', 'The image links in this email work until November 13, 2026' );

    // Copy HTML reuses the hosted image instead of uploading it again.
    cy.window().then( ( win ) => cy.stub( win.navigator.clipboard, 'writeText' ).as( 'copy' ).resolves() );
    cy.contains( '.toolbar button', 'Copy HTML' ).click();
    cy.get( '@copy' ).its( 'firstCall.args.0' ).should( 'contain', HOSTED_URL );
    cy.get( '@host.all' ).should( 'have.length', 1 );
  } );

  it( 'downloads a .zip with an images folder', () => {
    makeEmailWithLogo( 'Zip logo' );
    cy.contains( '.more-row button', 'Download .zip' ).click();
    cy.readFile( `${ DOWNLOADS }/zip-logo.zip`, 'binary' ).should( ( zip ) => {
      expect( zip.slice( 0, 2 ) ).to.equal( 'PK' );
      expect( zip ).to.contain( 'email.html' );
      expect( zip ).to.contain( 'images/company-logo.png' );
    } );
  } );

  it( 'downloads one file with the images built in', () => {
    makeEmailWithLogo( 'Single logo' );
    cy.contains( '.more-row button', 'Single file' ).click();
    cy.readFile( `${ DOWNLOADS }/single-logo.html` ).should( 'match', /src="data:image\/png;base64,[^"]+"/ );
  } );

  it( 'offers more hosted images when today\'s hosting runs out', () => {
    makeEmailWithLogo( 'Limit logo' );
    cy.intercept( 'POST', `${ API }/host-image`, {
      statusCode: 429,
      body: { message: 'Your workspace has used today\'s free image hosting.', pack: 'hosted_image_200' },
    } ).as( 'host' );
    cy.contains( '.toolbar button', 'Download HTML' ).click();
    cy.wait( '@host' );
    cy.get( '.notice' ).should( 'contain.text', 'used today\'s free image hosting' );
    cy.get( '[data-cy="buy-hosting-credits"]' ).should( 'be.visible' );
  } );
} );
