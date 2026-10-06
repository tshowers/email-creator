describe( 'Email Creator smoke test', () => {
  it( 'loads the application', () => {
    cy.visit( '/' );
    cy.get( 'body' ).should( 'be.visible' );
  } );
} );
