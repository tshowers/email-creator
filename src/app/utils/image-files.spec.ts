import { dataUrlToBytes, extensionFor, prepareUpload } from './image-files';

/** Draws a solid image in a canvas and returns it as a File of the given type. */
async function imageFile ( name: string, type: string, width: number, height: number ): Promise<File> {
  const canvas = document.createElement( 'canvas' );
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext( '2d' )!;
  context.fillStyle = '#3366cc';
  context.fillRect( 0, 0, width, height );
  const blob = await new Promise<Blob>( ( resolve ) => canvas.toBlob( ( b ) => resolve( b! ), type ) );
  return new File( [ blob ], name, { type } );
}

describe( 'image-files', () => {
  describe( 'extensionFor', () => {
    it( 'maps each accepted type to its extension', () => {
      expect( extensionFor( 'data:image/png;base64,AA' ) ).toBe( 'png' );
      expect( extensionFor( 'data:image/jpeg;base64,AA' ) ).toBe( 'jpg' );
      expect( extensionFor( 'data:image/gif;base64,AA' ) ).toBe( 'gif' );
      expect( extensionFor( 'data:image/webp;base64,AA' ) ).toBe( 'webp' );
    } );

    it( 'falls back to png for anything else', () => {
      expect( extensionFor( 'data:image/svg+xml;base64,AA' ) ).toBe( 'png' );
    } );
  } );

  describe( 'dataUrlToBytes', () => {
    it( 'decodes the base64 payload', () => {
      expect( Array.from( dataUrlToBytes( 'data:text/plain;base64,SGk=' ) ) ).toEqual( [ 0x48, 0x69 ] );
    } );
  } );

  describe( 'prepareUpload', () => {
    it( 'rejects types other than PNG, JPEG, WebP and GIF', async () => {
      const file = new File( [ '<svg/>' ], 'logo.svg', { type: 'image/svg+xml' } );
      await expectAsync( prepareUpload( file ) ).toBeRejectedWithError( /logo\.svg isn't a PNG, JPEG, WebP, or GIF/ );
    } );

    it( 'rejects files over 20 MB', async () => {
      const file = new File( [ new Uint8Array( 20 * 1024 * 1024 + 1 ) ], 'huge.png', { type: 'image/png' } );
      await expectAsync( prepareUpload( file ) ).toBeRejectedWithError( /huge\.png is larger than 20 MB/ );
    } );

    it( 'rejects a file that is not really an image', async () => {
      const file = new File( [ 'not an image' ], 'fake.png', { type: 'image/png' } );
      await expectAsync( prepareUpload( file ) ).toBeRejectedWithError( "Couldn't open that image." );
    } );

    it( 'keeps a small PNG as PNG, at its own size', async () => {
      const result = await prepareUpload( await imageFile( 'logo.png', 'image/png', 300, 100 ) );
      expect( result.dataUrl.startsWith( 'data:image/png' ) ).toBeTrue();
      expect( [ result.width, result.height ] ).toEqual( [ 300, 100 ] );
      expect( result.thumbnail.startsWith( 'data:image/jpeg' ) ).toBeTrue();
    } );

    it( 'scales large images down to 1200px on the long side', async () => {
      const result = await prepareUpload( await imageFile( 'hero.jpg', 'image/jpeg', 2400, 1200 ) );
      expect( [ result.width, result.height ] ).toEqual( [ 1200, 600 ] );
      expect( result.dataUrl.startsWith( 'data:image/jpeg' ) ).toBeTrue();
    } );

    it( 'converts WebP to JPEG, which Outlook can show', async () => {
      const result = await prepareUpload( await imageFile( 'photo.webp', 'image/webp', 200, 200 ) );
      expect( result.dataUrl.startsWith( 'data:image/jpeg' ) ).toBeTrue();
    } );
  } );
} );
