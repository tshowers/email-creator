import { emailHtml, pngFile, say, stubGenerate, stubPlan, visitSignedIn } from '../support/helpers';

// A tall email, so the preview has real height to show (or lose).
const BODY = `<img src="todd-image:u1" alt="logo" width="200">${ '<p style="margin:0 0 16px">Pumpkin sourdough is back.</p>'.repeat( 30 ) }`;

const SIZES: [ string, number, number ][] = [
  [ 'a desktop window', 1440, 900 ],
  [ 'a narrow laptop window', 1000, 660 ],
  [ 'a phone', 390, 844 ],
];

describe( 'Layout', () => {
  for ( const [ name, width, height ] of SIZES ) {
    it( `shows the whole preview and every action on ${ name } (${ width }x${ height })`, () => {
      cy.viewport( width, height );
      visitSignedIn();
      cy.get( 'input[type="file"]' ).selectFile( pngFile(), { force: true } );
      stubPlan( 'Use u1 as the logo', { imageIds: [ 'u1' ] } );
      stubGenerate( { subject: 'Fall loaves', html: emailHtml( BODY ) } );
      say( 'A long email with my logo' );
      cy.wait( '@generate' );

      // The preview grows to the email instead of collapsing.
      cy.get( 'iframe.preview-frame' ).should( ( frame ) => expect( frame[ 0 ].getBoundingClientRect().height ).to.be.greaterThan( 600 ) );
      for ( const label of [ 'Download .zip', 'Single file', 'Send to many - Catalyst', 'Send to one - Email Composer' ] ) {
        cy.contains( 'button', label ).scrollIntoView().should( 'be.visible' );
      }
      // The composer stays reachable too.
      cy.get( '.composer textarea' ).scrollIntoView().should( 'be.visible' );
      cy.document().its( 'documentElement.scrollWidth' ).should( 'be.at.most', width );
    } );
  }

  it( 'puts the chat and the preview side by side on a desktop', () => {
    cy.viewport( 1440, 900 );
    visitSignedIn();
    stubPlan( 'b' );
    stubGenerate( { subject: 'Side by side', html: emailHtml( '<p>x</p>' ) } );
    say( 'An email' );
    cy.wait( '@generate' );
    cy.get( '.chat' ).then( ( chat ) => {
      cy.get( '.panel' ).should( ( panel ) => {
        expect( panel[ 0 ].getBoundingClientRect().left ).to.be.at.least( chat[ 0 ].getBoundingClientRect().right - 1 );
      } );
    } );
  } );
} );
