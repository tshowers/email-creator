export const ACCEPTED_IMAGE_TYPES = [ 'image/png', 'image/jpeg', 'image/webp', 'image/gif' ];
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
// 2x the 600px email width, so images stay sharp on retina screens.
const EMAIL_MAX_DIMENSION = 1200;
const THUMBNAIL_MAX_DIMENSION = 512;
// PNGs (logos, often transparent) stay PNG when small enough; anything
// bigger becomes JPEG so the email stays light.
const MAX_PNG_EMAIL_BYTES = 800 * 1024;
// GIFs are passed through untouched so animation survives, if they're small.
const MAX_GIF_EMAIL_BYTES = 2 * 1024 * 1024;

export interface PreparedImage {
  /** Email-ready version (PNG/JPEG/GIF, at most 1200px) used in the email itself. */
  dataUrl: string;
  /** Small JPEG so TODD can see the image cheaply. */
  thumbnail: string;
  width: number;
  height: number;
}

export async function prepareUpload ( file: File ): Promise<PreparedImage> {
  if ( !ACCEPTED_IMAGE_TYPES.includes( file.type ) ) {
    throw new Error( `${ file.name } isn't a PNG, JPEG, WebP, or GIF image.` );
  }
  if ( file.size > MAX_SOURCE_BYTES ) {
    throw new Error( `${ file.name } is larger than 20 MB.` );
  }
  const original = await readAsDataUrl( file );
  const image = await loadImage( original );
  const thumbnail = encode( image, THUMBNAIL_MAX_DIMENSION, 'image/jpeg', 0.8 ).dataUrl;

  if ( file.type === 'image/gif' && file.size <= MAX_GIF_EMAIL_BYTES ) {
    return { dataUrl: original, thumbnail, width: image.naturalWidth, height: image.naturalHeight };
  }
  // WebP isn't safe in Outlook, and GIFs too big to keep become stills.
  const png = file.type === 'image/png' ? encode( image, EMAIL_MAX_DIMENSION, 'image/png' ) : null;
  const encoded = png && approximateBytes( png.dataUrl ) <= MAX_PNG_EMAIL_BYTES ?
    png :
    encode( image, EMAIL_MAX_DIMENSION, 'image/jpeg', 0.88 );
  return { ...encoded, thumbnail };
}

export function extensionFor ( dataUrl: string ): string {
  const type = dataUrl.slice( 5, dataUrl.indexOf( ';' ) );
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[ type ] || 'png';
}

export function dataUrlToBytes ( dataUrl: string ): Uint8Array {
  const binary = atob( dataUrl.slice( dataUrl.indexOf( ',' ) + 1 ) );
  const bytes = new Uint8Array( binary.length );
  for ( let i = 0; i < binary.length; i++ ) bytes[ i ] = binary.charCodeAt( i );
  return bytes;
}

function readAsDataUrl ( file: File ): Promise<string> {
  return new Promise( ( resolve, reject ) => {
    const reader = new FileReader();
    reader.onload = () => resolve( String( reader.result ) );
    reader.onerror = () => reject( new Error( `Couldn't read ${ file.name }.` ) );
    reader.readAsDataURL( file );
  } );
}

function loadImage ( src: string ): Promise<HTMLImageElement> {
  return new Promise( ( resolve, reject ) => {
    const image = new Image();
    image.onload = () => resolve( image );
    image.onerror = () => reject( new Error( "Couldn't open that image." ) );
    image.src = src;
  } );
}

function encode (
  image: HTMLImageElement,
  maxDimension: number,
  type: string,
  quality?: number,
): { dataUrl: string; width: number; height: number } {
  const scale = Math.min( 1, maxDimension / Math.max( image.naturalWidth, image.naturalHeight ) );
  const canvas = document.createElement( 'canvas' );
  canvas.width = Math.max( 1, Math.round( image.naturalWidth * scale ) );
  canvas.height = Math.max( 1, Math.round( image.naturalHeight * scale ) );
  const context = canvas.getContext( '2d' )!;
  if ( type === 'image/jpeg' ) {
    // JPEG has no alpha; paint transparent areas white instead of black.
    context.fillStyle = '#ffffff';
    context.fillRect( 0, 0, canvas.width, canvas.height );
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage( image, 0, 0, canvas.width, canvas.height );
  return { dataUrl: canvas.toDataURL( type, quality ), width: canvas.width, height: canvas.height };
}

function approximateBytes ( dataUrl: string ): number {
  const base64 = dataUrl.slice( dataUrl.indexOf( ',' ) + 1 );
  return Math.floor( base64.length * 3 / 4 );
}
