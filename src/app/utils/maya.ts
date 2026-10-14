import type { MayaCopy } from '../services/email-creator-api.service';
import { dataUrlToBytes } from './image-files';

/** Maya's work page links here as ?mayaEmail=<Docs document id> ("Edit in Email Creator"). */
export const MAYA_EMAIL_PARAM = 'mayaEmail';
export const MAYA_PRICING_URL = 'https://maya.taliferro.tech/pricing';

/**
 * Maya's copy as the chat message TODD reads: it says the words are final,
 * so TODD designs them instead of asking questions or rewriting them.
 */
export function mayaCopyMessage ( copy: MayaCopy ): string {
  const lines = [ 'Maya, our Marketing Director, wrote this copy. Design the email using it as written:', '' ];
  if ( copy.subject ) lines.push( `Subject: ${ copy.subject }`, '' );
  lines.push( copy.body );
  if ( copy.callToAction?.label ) {
    lines.push( '', `Call to action: ${ copy.callToAction.label }${ copy.callToAction.url ? ` (${ copy.callToAction.url })` : '' }` );
  }
  if ( copy.audience ) lines.push( `Audience: ${ copy.audience }` );
  if ( copy.tone ) lines.push( `Tone: ${ copy.tone }` );
  return lines.join( '\n' );
}

/** A data URL as a File, so a Maya image goes through the same prepareUpload as a user's. */
export function dataUrlToFile ( dataUrl: string, name: string ): File {
  const type = dataUrl.slice( 5, dataUrl.indexOf( ';' ) );
  return new File( [ dataUrlToBytes( dataUrl ) ], name, { type } );
}
