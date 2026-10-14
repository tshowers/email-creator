// The end-to-end tests never reach the real TODD backend (it spends AI money
// and real credits): any API call a test hasn't stubbed fails loudly here.
// Tests register their own cy.intercept()s afterwards, which take priority.
beforeEach( () => {
  cy.intercept( 'https://api.taliferro.tech/**', ( req ) => {
    req.reply( 599, { message: `Unstubbed backend call in an e2e test: ${ req.method } ${ req.url }` } );
  } ).as( 'unstubbed' );
} );
