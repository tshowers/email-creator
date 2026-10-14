import { API, PNG_DATA_URL, emailHtml, previewBody, say, stubGenerate, stubPlan, visitSignedIn } from '../support/helpers';

const MAYA_HTML = emailHtml( '<img src="todd-image:m1" alt="logo"><h1>Fall loaves</h1><p>From Maya.</p>' );

function stubMayaEmail ( overrides: Record<string, unknown> = {} ): void {
  cy.intercept( 'GET', `${ API }/maya-email/d1`, {
    success: true,
    email: {
      id: 'd1', subject: 'Fall loaves', preheader: 'Pumpkin is back', brief: 'Maya\'s brief', html: MAYA_HTML,
      images: [ { id: 'm1', name: 'logo.png', dataUrl: PNG_DATA_URL } ], skippedImages: 0, ...overrides,
    },
  } ).as( 'mayaEmail' );
}

describe( 'Ask Maya to write it', () => {
  it( 'Maya writes the copy, it shows as hers, and TODD designs it', () => {
    visitSignedIn( '/', { canAskMaya: true } );
    cy.get( 'button.ask-maya' ).should( 'be.disabled' );
    cy.intercept( 'POST', `${ API }/maya-copy`, {
      success: true,
      copy: { subject: 'Fall loaves are here', body: 'Hi {{firstName}},\n\nPumpkin sourdough is back.', callToAction: { label: 'Order ahead' } },
      reply: 'I kept it short.',
    } ).as( 'mayaCopy' );
    stubPlan( 'Design Maya\'s copy' );
    stubGenerate( { subject: 'Fall loaves are here', html: emailHtml( '<p>Hi {{firstName}}, pumpkin sourdough is back.</p>' ) } );

    cy.get( '.composer textarea' ).type( 'Announce our fall menu' );
    cy.get( 'button.ask-maya' ).click();

    cy.wait( '@mayaCopy' ).its( 'request.body' ).should( 'deep.equal', { request: 'Announce our fall menu' } );
    cy.wait( '@chat' ).its( 'request.body.messages' ).then( ( messages ) => {
      expect( messages ).to.have.length( 2 );
      expect( messages[ 1 ].role ).to.equal( 'user' );
      expect( messages[ 1 ].text ).to.contain( 'Maya, our Marketing Director, wrote this copy' );
    } );
    cy.wait( '@generate' );
    cy.get( '.row-maya' ).should( 'contain.text', 'Maya' ).and( 'contain.text', 'I kept it short.' );
    cy.get( '.maya-subject' ).should( 'have.text', 'Fall loaves are here' );
    cy.get( '.maya-cta' ).should( 'have.text', 'Order ahead' );
    previewBody().should( 'contain.text', 'pumpkin sourdough is back' );
  } );

  it( 'links to Maya\'s pricing for workspaces without Maya', () => {
    visitSignedIn( '/', { canAskMaya: false } );
    cy.get( 'button.ask-maya' ).should( 'not.exist' );
    cy.get( 'a.ask-maya' ).should( 'have.attr', 'href', 'https://maya.taliferro.tech/pricing' ).and( 'have.attr', 'target', '_blank' );
  } );

  it( 'switches to the pricing link if Maya refuses', () => {
    visitSignedIn( '/', { canAskMaya: true } );
    cy.intercept( 'POST', `${ API }/maya-copy`, {
      statusCode: 403, body: { message: 'Maya writes emails for workspaces with the Maya app subscription.' },
    } ).as( 'mayaCopy' );
    cy.get( '.composer textarea' ).type( 'Announce our fall menu' );
    cy.get( 'button.ask-maya' ).click();
    cy.wait( '@mayaCopy' );
    cy.get( '.notice' ).should( 'contain.text', 'Maya app subscription' );
    cy.get( 'a.ask-maya' ).should( 'be.visible' );
  } );
} );

describe( 'Edit in Email Creator (from Maya\'s work page)', () => {
  it( 'opens Maya\'s design with its images and revises it', () => {
    stubMayaEmail();
    visitSignedIn( '/?mayaEmail=d1' );
    cy.wait( '@mayaEmail' );
    cy.location( 'search' ).should( 'equal', '' );
    cy.get( '.todd-text' ).should( 'contain.text', 'Here\'s the email Maya designed. Tell me what to change.' );
    cy.get( '.user-image' ).should( 'contain.text', 'logo.png' );
    cy.get( '.email-meta' ).should( 'contain.text', 'Fall loaves' ).and( 'contain.text', 'Pumpkin is back' );
    previewBody().should( 'contain.text', 'From Maya.' ).find( 'img' ).should( 'have.attr', 'src' ).and( 'match', /^data:image\/png/ );

    stubPlan( 'Shorter', { baseEmailId: 'e1' } );
    stubGenerate( { subject: 'Fall loaves (short)', html: emailHtml( '<img src="todd-image:m1" alt="logo"><p>Short.</p>' ) } );
    say( 'Shorter' );
    cy.wait( '@chat' ).its( 'request.body.messages.1.email' ).should( 'deep.equal', { id: 'e1', subject: 'Fall loaves', brief: 'Maya\'s brief' } );
    cy.wait( '@generate' ).its( 'request.body' ).then( ( body ) => {
      expect( body.currentHtml ).to.equal( MAYA_HTML );
      expect( body.images.map( ( image: { id: string } ) => image.id ) ).to.deep.equal( [ 'm1' ] );
    } );
    previewBody().should( 'contain.text', 'Short.' );
  } );

  it( 'warns about images that couldn\'t come along', () => {
    stubMayaEmail( { images: [], skippedImages: 2 } );
    visitSignedIn( '/?mayaEmail=d1' );
    cy.wait( '@mayaEmail' );
    cy.get( '.notice' ).should( 'contain.text', '2 images from Maya\'s email couldn\'t be brought along' );
  } );

  it( 'reports an email that can\'t be opened', () => {
    cy.intercept( 'GET', `${ API }/maya-email/gone`, { statusCode: 404, body: { message: 'That email wasn\'t found in your Docs.' } } ).as( 'mayaEmail' );
    visitSignedIn( '/?mayaEmail=gone' );
    cy.wait( '@mayaEmail' );
    cy.get( '.notice' ).should( 'contain.text', 'That email wasn\'t found in your Docs.' );
    cy.contains( 'h1', 'What email should we create?' );
  } );
} );
