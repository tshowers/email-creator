import { strToU8, zipSync } from 'fflate';
import { dataUrlToBytes, extensionFor } from './image-files';

/** Must match IMAGE_SRC_PREFIX in todd-backend's emailCreator.service.js. */
const IMAGE_SRC_PATTERN = /todd-image:([A-Za-z0-9_-]+)/g;

export interface ExportImage {
  id: string;
  name?: string;
  dataUrl: string;
}

/** Ids of the attached images an email's HTML actually uses. */
export function imageIdsIn ( html: string ): string[] {
  return [ ...new Set( [ ...html.matchAll( IMAGE_SRC_PATTERN ) ].map( ( match ) => match[ 1 ] ) ) ];
}

/** Swaps each todd-image:<id> placeholder for a real src. Unknown ids are left alone. */
export function resolveImages ( html: string, srcFor: ( id: string ) => string | undefined ): string {
  return html.replace( IMAGE_SRC_PATTERN, ( placeholder, id: string ) => srcFor( id ) ?? placeholder );
}

/** Images embedded as data URLs: one self-contained file (some inboxes block these). */
export function embeddedHtml ( html: string, images: ExportImage[] ): string {
  const byId = new Map( images.map( ( image ) => [ image.id, image.dataUrl ] ) );
  return resolveImages( html, ( id ) => byId.get( id ) );
}

/** email.html plus an images/ folder, ready to upload to an email platform. */
export function buildZip ( html: string, images: ExportImage[] ): Uint8Array {
  const used = new Set( imageIdsIn( html ) );
  const paths = new Map<string, string>();
  const files: Record<string, Uint8Array> = {};
  const taken = new Set<string>();

  for ( const image of images.filter( ( candidate ) => used.has( candidate.id ) ) ) {
    const base = slugify( image.name?.replace( /\.[^.]+$/, '' ) || '' ) || `image-${ image.id }`;
    let name = `${ base }.${ extensionFor( image.dataUrl ) }`;
    for ( let n = 2; taken.has( name ); n++ ) name = `${ base }-${ n }.${ extensionFor( image.dataUrl ) }`;
    taken.add( name );
    paths.set( image.id, `images/${ name }` );
    files[ `images/${ name }` ] = dataUrlToBytes( image.dataUrl );
  }
  files[ 'email.html' ] = strToU8( resolveImages( html, ( id ) => paths.get( id ) ) );
  return zipSync( files, { level: 6 } );
}

export function filenameFor ( subject: string ): string {
  return slugify( subject ).slice( 0, 60 ) || 'todd-email';
}

export function downloadBlob ( data: BlobPart, type: string, filename: string ): void {
  const url = URL.createObjectURL( new Blob( [ data ], { type } ) );
  const link = document.createElement( 'a' );
  link.href = url;
  link.download = filename;
  document.body.appendChild( link );
  link.click();
  link.remove();
  setTimeout( () => URL.revokeObjectURL( url ), 1000 );
}

/**
 * The preview iframe has no scripts; links open in a new tab instead of
 * navigating the frame away from the email.
 */
export function previewDocument ( html: string ): string {
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test( html ) ? html.replace( /<head[^>]*>/i, ( head ) => head + base ) : base + html;
}

function slugify ( value: string ): string {
  return value.toLowerCase().replace( /[^a-z0-9]+/g, '-' ).replace( /^-+|-+$/g, '' );
}
