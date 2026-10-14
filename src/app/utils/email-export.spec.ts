import { unzipSync, strFromU8 } from 'fflate';
import { buildZip, embeddedHtml, filenameFor, imageIdsIn, previewDocument, resolveImages } from './email-export';

// 1x1 transparent PNG and GIF.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

describe( 'email-export', () => {
  describe( 'imageIdsIn', () => {
    it( 'returns each placeholder id once, in order of first use', () => {
      const html = '<img src="todd-image:logo"><img src="todd-image:hero_1"><img src="todd-image:logo">';
      expect( imageIdsIn( html ) ).toEqual( [ 'logo', 'hero_1' ] );
    } );

    it( 'returns nothing when the email uses no attached images', () => {
      expect( imageIdsIn( '<img src="https://example.com/a.png">' ) ).toEqual( [] );
    } );

    it( 'can be called repeatedly (the global regex keeps no state between calls)', () => {
      const html = '<img src="todd-image:a">';
      expect( imageIdsIn( html ) ).toEqual( [ 'a' ] );
      expect( imageIdsIn( html ) ).toEqual( [ 'a' ] );
    } );
  } );

  describe( 'resolveImages', () => {
    it( 'replaces known ids and leaves unknown placeholders alone', () => {
      const html = '<img src="todd-image:a"><img src="todd-image:b">';
      const result = resolveImages( html, ( id ) => ( id === 'a' ? 'https://cdn/a.png' : undefined ) );
      expect( result ).toBe( '<img src="https://cdn/a.png"><img src="todd-image:b">' );
    } );

    it( 'leaves {{tokens}} untouched for Outreach to fill', () => {
      const html = '<p>Hi {{firstName}}</p><img src="todd-image:a">';
      expect( resolveImages( html, () => 'x.png' ) ).toBe( '<p>Hi {{firstName}}</p><img src="x.png">' );
    } );
  } );

  describe( 'embeddedHtml', () => {
    it( 'inlines each image as its data URL', () => {
      const html = embeddedHtml( '<img src="todd-image:a">', [ { id: 'a', dataUrl: PNG } ] );
      expect( html ).toBe( `<img src="${ PNG }">` );
    } );
  } );

  describe( 'buildZip', () => {
    function unzip ( zip: Uint8Array ): Record<string, Uint8Array> {
      return unzipSync( zip );
    }

    it( 'writes email.html pointing at files in images/', () => {
      const files = unzip( buildZip( '<img src="todd-image:a">', [ { id: 'a', name: 'Company Logo.png', dataUrl: PNG } ] ) );
      expect( Object.keys( files ).sort() ).toEqual( [ 'email.html', 'images/company-logo.png' ] );
      expect( strFromU8( files[ 'email.html' ] ) ).toBe( '<img src="images/company-logo.png">' );
    } );

    it( 'leaves out attached images the email does not use', () => {
      const files = unzip( buildZip( '<img src="todd-image:a">', [
        { id: 'a', name: 'a.png', dataUrl: PNG },
        { id: 'unused', name: 'unused.png', dataUrl: PNG },
      ] ) );
      expect( Object.keys( files ) ).not.toContain( 'images/unused.png' );
    } );

    it( 'numbers images that would share a file name', () => {
      const files = unzip( buildZip( '<img src="todd-image:a"><img src="todd-image:b">', [
        { id: 'a', name: 'photo.jpg', dataUrl: PNG },
        { id: 'b', name: 'photo.png', dataUrl: PNG },
      ] ) );
      expect( strFromU8( files[ 'email.html' ] ) ).toBe( '<img src="images/photo.png"><img src="images/photo-2.png">' );
    } );

    it( 'names unnamed images by id and uses the real image type for the extension', () => {
      const files = unzip( buildZip( '<img src="todd-image:x9">', [ { id: 'x9', dataUrl: GIF } ] ) );
      expect( Object.keys( files ) ).toContain( 'images/image-x9.gif' );
    } );

    it( 'stores the decoded image bytes, not the data URL', () => {
      const files = unzip( buildZip( '<img src="todd-image:a">', [ { id: 'a', name: 'a', dataUrl: PNG } ] ) );
      const bytes = files[ 'images/a.png' ];
      // PNG signature.
      expect( Array.from( bytes.slice( 0, 4 ) ) ).toEqual( [ 0x89, 0x50, 0x4e, 0x47 ] );
    } );
  } );

  describe( 'filenameFor', () => {
    it( 'slugifies the subject', () => {
      expect( filenameFor( 'Our Fall Offer — 20% off!' ) ).toBe( 'our-fall-offer-20-off' );
    } );

    it( 'caps the length at 60 characters', () => {
      expect( filenameFor( 'a'.repeat( 100 ) ).length ).toBe( 60 );
    } );

    it( 'falls back when the subject has no usable characters', () => {
      expect( filenameFor( '' ) ).toBe( 'todd-email' );
      expect( filenameFor( '🎉!!' ) ).toBe( 'todd-email' );
    } );
  } );

  describe( 'previewDocument', () => {
    it( 'adds <base target="_blank"> inside an existing <head>', () => {
      expect( previewDocument( '<html><head lang="en"><title>x</title></head></html>' ) )
        .toBe( '<html><head lang="en"><base target="_blank"><title>x</title></head></html>' );
    } );

    it( 'prepends it when there is no <head>', () => {
      expect( previewDocument( '<p>hi</p>' ) ).toBe( '<base target="_blank"><p>hi</p>' );
    } );
  } );
} );
