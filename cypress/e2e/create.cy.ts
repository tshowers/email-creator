import { API, USAGE, emailHtml, makeEmail, pngFile, previewBody, say, stubAsk, stubGenerate, stubPlan, visitSignedIn } from '../support/helpers';

describe( 'Creating an email', () => {
  beforeEach( () => visitSignedIn() );

  it( 'starts on the empty state with usage and suggestions', () => {
    cy.get( '.usage' ).should( 'contain.text', '9 of 10 free left today' );
    cy.contains( 'h1', 'What email should we create?' );
    cy.get( '.suggestion' ).should( 'have.length', 3 ).first().click();
    cy.get( '.composer textarea' ).should( 'have.value', 'A monthly newsletter for my bakery with a featured item and a 10% off coupon' );
  } );

  it( 'answers TODD\'s question, then designs the email and shows it', () => {
    stubAsk( 'What\'s the bakery called?' );
    say( 'A fall email for my bakery' );
    cy.wait( '@chat' ).its( 'request.body.messages' ).should( 'deep.equal', [ { role: 'user', text: 'A fall email for my bakery', images: [] } ] );
    cy.get( '.row-user .bubble' ).should( 'contain.text', 'A fall email for my bakery' );
    cy.get( '.todd-text' ).should( 'contain.text', 'What\'s the bakery called?' );

    stubPlan( 'Fall email for Rise Bakery', { reply: 'Designing it now.' } );
    stubGenerate( {
      subject: 'Fall loaves are here',
      preheader: 'Pumpkin is back',
      html: emailHtml( '<h1>Rise Bakery</h1><p>Pumpkin sourdough is back.</p>' ),
      notes: [ 'Fill in {{launchDate}}' ],
    } );
    say( 'Rise Bakery' );
    cy.wait( '@chat' ).its( 'request.body.messages' ).should( 'have.length', 3 );
    cy.wait( '@generate' ).its( 'request.body' ).should( 'deep.include', { brief: 'Fall email for Rise Bakery', images: [] } );

    cy.get( '.email-meta' ).should( 'contain.text', 'Fall loaves are here' ).and( 'contain.text', 'Pumpkin is back' );
    cy.get( '.notes' ).should( 'contain.text', 'Fill in {{launchDate}}' );
    cy.get( '.artifact' ).should( 'contain.text', 'Fall loaves are here' ).and( 'contain.text', 'Showing on the right' );
    cy.get( '.usage' ).should( 'contain.text', '8 of 10 free left today' );
    previewBody().should( 'contain.text', 'Pumpkin sourdough is back.' );
  } );

  it( 'switches between preview, HTML, desktop and mobile', () => {
    makeEmail();
    cy.get( '.preview-frame' ).should( 'not.have.class', 'mobile' );
    cy.get( 'button[aria-label="Mobile"]' ).click();
    cy.get( '.preview-frame' ).should( 'have.class', 'mobile' );
    cy.get( 'button[aria-label="Desktop"]' ).click();
    cy.get( '.preview-frame' ).should( 'not.have.class', 'mobile' );

    cy.contains( '.seg button', 'HTML' ).click();
    cy.get( 'pre.code' ).should( 'contain.text', '<h1>Fall loaves</h1>' );
    cy.get( '.preview-stage' ).should( 'not.be.visible' );
    cy.contains( '.seg button', 'Preview' ).click();
    cy.get( 'pre.code' ).should( 'not.exist' );
  } );

  it( 'revises the email with a quick change and keeps both versions', () => {
    makeEmail();
    stubPlan( 'Shorter version', { baseEmailId: 'e1' } );
    stubGenerate( { subject: 'Fall loaves (short)', html: emailHtml( '<p>Short.</p>' ) } );
    cy.contains( '.quick button', 'Shorter' ).click();

    cy.wait( '@chat' ).its( 'request.body.messages' ).then( ( messages ) => {
      expect( messages[ 1 ].email ).to.deep.equal( { id: 'e1', subject: 'Fall loaves are here', brief: 'A fall bakery email' } );
      expect( messages[ 2 ].text ).to.equal( 'Shorter' );
    } );
    cy.wait( '@generate' ).its( 'request.body.currentHtml' ).should( 'contain', '<h1>Fall loaves</h1>' );
    cy.get( '.email-meta' ).should( 'contain.text', 'Fall loaves (short)' );
    previewBody().should( 'contain.text', 'Short.' );

    cy.get( '.artifact' ).should( 'have.length', 2 ).first().click();
    cy.get( '.email-meta' ).should( 'contain.text', 'Fall loaves are here' );
    cy.get( '.artifact' ).first().should( 'contain.text', 'Showing on the right' );
  } );

  it( 'shows a failed design and retries it', () => {
    stubPlan( 'A fall bakery email' );
    cy.intercept( 'POST', `${ API }/generate`, { statusCode: 502, body: { message: 'Email generation failed. Please try again.' } } ).as( 'generate' );
    say( 'A fall email' );
    cy.wait( '@generate' );
    cy.get( '.error' ).should( 'contain.text', 'Email generation failed. Please try again.' );

    stubGenerate( { subject: 'Second try', html: emailHtml( '<p>Worked.</p>' ) } );
    cy.contains( '.error button', 'Try again' ).click();
    cy.wait( '@generate' );
    cy.get( '.error' ).should( 'not.exist' );
    cy.get( '.email-meta' ).should( 'contain.text', 'Second try' );
  } );

  it( 'shows a waiting state while TODD thinks and designs', () => {
    cy.intercept( 'POST', `${ API }/chat`, { delay: 400, body: { success: true, action: 'generate', reply: 'On it.', brief: 'b', imageIds: [], baseEmailId: null, usage: USAGE } } ).as( 'chat' );
    cy.intercept( 'POST', `${ API }/generate`, { delay: 400, body: { success: true, email: { subject: 's', preheader: '', html: emailHtml( 'x' ), notes: [] }, usage: USAGE } } ).as( 'generate' );
    say( 'An email' );
    cy.get( '[aria-label="16Ahead is thinking"]' ).should( 'be.visible' );
    cy.get( '.email-placeholder' ).should( 'contain.text', 'Writing and designing your email' );
    cy.get( '.composer .send' ).should( 'be.disabled' );
    cy.wait( '@generate' );
    cy.get( '.email-placeholder' ).should( 'not.exist' );
  } );

  it( 'reports a lost connection and an expired session', () => {
    cy.intercept( 'POST', `${ API }/chat`, { forceNetworkError: true } ).as( 'chat' );
    say( 'An email' );
    cy.get( '.notice' ).should( 'contain.text', 'Could not reach 16Ahead. Check your connection and try again.' );

    cy.intercept( 'POST', `${ API }/chat`, { statusCode: 401, body: { message: 'Unauthorized' } } ).as( 'chat' );
    say( 'Try again' );
    cy.get( '.notice' ).should( 'contain.text', 'Your session expired. Sign in again to keep going.' );
    cy.get( '.notice' ).contains( 'button', 'Sign in' ).should( 'be.visible' );
    cy.get( '.notice .dismiss' ).click();
    cy.get( '.notice' ).should( 'not.exist' );
  } );

  it( 'starts over only after confirming', () => {
    makeEmail();
    cy.window().then( ( win ) => cy.stub( win, 'confirm' ).as( 'confirm' ).returns( false ) );
    cy.contains( '.topbar button', 'New email' ).click();
    cy.get( '@confirm' ).should( 'have.been.calledWith', 'Start over? Emails you haven\'t downloaded will be gone.' );
    cy.get( '.artifact' ).should( 'have.length', 1 );

    cy.get<sinon.SinonStub>( '@confirm' ).invoke( 'returns', true );
    cy.contains( '.topbar button', 'New email' ).click();
    cy.get( '.artifact' ).should( 'not.exist' );
    cy.contains( 'h1', 'What email should we create?' );
  } );
} );

describe( 'Attaching images', () => {
  beforeEach( () => visitSignedIn() );

  it( 'sends an attached logo to TODD and builds it into the email', () => {
    cy.get( 'input[type="file"]' ).selectFile( pngFile( 'logo.png' ), { force: true } );
    cy.get( '.attachment img' ).should( 'have.attr', 'src' ).and( 'match', /^data:image\/jpeg/ );

    stubPlan( 'Use u1 as the logo', { imageIds: [ 'u1' ] } );
    stubGenerate( { subject: 'With logo', html: emailHtml( '<img src="todd-image:u1" alt="logo"><p>Hello</p>' ) } );
    say( 'An email with my logo' );

    cy.wait( '@chat' ).its( 'request.body.messages.0.images.0' ).then( ( image ) => {
      expect( image ).to.include( { id: 'u1', name: 'logo.png', width: 1, height: 1 } );
      expect( image.thumbnail ).to.match( /^data:image\/jpeg/ );
    } );
    cy.wait( '@generate' ).its( 'request.body.images' ).should( 'have.length', 1 ).its( '0.id' ).should( 'equal', 'u1' );
    cy.get( '.attachment' ).should( 'not.exist' );
    cy.get( '.user-image' ).should( 'contain.text', 'logo.png' );
    previewBody().find( 'img' ).should( 'have.attr', 'src' ).and( 'match', /^data:image\/png/ );
    cy.get( '.more-note' ).should( 'contain.text', 'hosts the images with 16Ahead for 30 days' );
  } );

  it( 'removes an attachment before sending', () => {
    cy.get( 'input[type="file"]' ).selectFile( pngFile(), { force: true } );
    cy.get( '.attachment' ).should( 'have.length', 1 );
    cy.get( '.attachment button[aria-label="Remove logo.png"]' ).click();
    cy.get( '.attachment' ).should( 'not.exist' );
  } );

  it( 'accepts images dropped on the page', () => {
    cy.get( 'body' ).selectFile( pngFile( 'dropped.png' ), { action: 'drag-drop' } );
    cy.get( '.attachment' ).should( 'have.length', 1 );
  } );

  it( 'refuses files that aren\'t images and more than six at once', () => {
    cy.get( 'input[type="file"]' ).selectFile( { contents: Cypress.Buffer.from( '<svg/>' ), fileName: 'logo.svg', mimeType: 'image/svg+xml' }, { force: true } );
    cy.get( '.notice' ).should( 'contain.text', 'logo.svg isn\'t a PNG, JPEG, WebP, or GIF image.' );

    cy.get( 'input[type="file"]' ).selectFile( [ 1, 2, 3, 4, 5, 6, 7 ].map( ( n ) => pngFile( `p${ n }.png` ) ), { force: true } );
    cy.get( '.notice' ).should( 'contain.text', 'You can attach up to 6 images per message.' );
    cy.get( '.attachment' ).should( 'have.length', 6 );
  } );
} );
