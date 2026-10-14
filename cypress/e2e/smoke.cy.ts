const SITE = 'https://emails.taliferro.tech';

describe( 'Email Creator smoke test', () => {
  it( 'loads the application', () => {
    cy.visit( '/' );
    cy.get( 'body' ).should( 'be.visible' );
  } );

  it( 'shows the signed-out home page with a way to sign in', () => {
    cy.visit( '/' );
    cy.get( 'h1' ).should( 'contain.text', 'What email should we create?' );
    cy.contains( 'button', 'Sign in with TODD' ).should( 'be.visible' );
    cy.get( 'link[rel="canonical"]' ).should( 'have.attr', 'href', `${ SITE }/` );
  } );

  it( 'links to Help and About from the footer', () => {
    cy.visit( '/' );
    cy.get( 'app-site-footer' ).contains( 'a', 'Help' ).should( 'have.attr', 'href', '/help' );
    cy.get( 'app-site-footer' ).contains( 'a', 'About' ).should( 'have.attr', 'href', '/about' );
  } );
} );

describe( 'Help and About pages', () => {
  for ( const page of [ 'help', 'about' ] ) {
    it( `/${ page } has its own heading, title and canonical URL`, () => {
      cy.visit( `/${ page }` );
      cy.get( 'h1.pp-h1' ).should( 'be.visible' );
      cy.title().should( 'match', page === 'help' ? /^Email Creator Help/ : /^About Email Creator/ );
      cy.get( 'link[rel="canonical"]' ).should( 'have.attr', 'href', `${ SITE }/${ page }` );
      cy.get( 'meta[property="og:url"]' ).should( 'have.attr', 'content', `${ SITE }/${ page }` );
    } );
  }

  it( 'About carries structured data for search engines', () => {
    cy.visit( '/about' );
    cy.get( 'script[type="application/ld+json"]' ).should( 'exist' );
  } );
} );

describe( 'Search engine files', () => {
  it( 'sitemap.xml lists the home, Help and About pages', () => {
    cy.request( '/sitemap.xml' ).then( ( response ) => {
      expect( response.status ).to.eq( 200 );
      const locs = [ ...String( response.body ).matchAll( /<loc>([^<]+)<\/loc>/g ) ].map( ( match ) => match[ 1 ] );
      expect( locs ).to.deep.eq( [ `${ SITE }/`, `${ SITE }/help`, `${ SITE }/about` ] );
    } );
  } );

  it( 'robots.txt allows crawling, hides the sign-in callback and points to the sitemap', () => {
    cy.request( '/robots.txt' ).then( ( response ) => {
      expect( response.status ).to.eq( 200 );
      expect( response.body ).to.contain( 'Allow: /' );
      expect( response.body ).to.contain( 'Disallow: /auth/callback' );
      expect( response.body ).to.contain( `Sitemap: ${ SITE }/sitemap.xml` );
    } );
  } );
} );
