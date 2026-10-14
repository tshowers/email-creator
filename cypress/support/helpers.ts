/** Shared stubs for the signed-in end-to-end tests (see cypress/support/e2e.ts). */
export const API = 'https://api.taliferro.tech/api/email-creator';
export const BILLING = 'https://api.taliferro.tech/api/billing/checkout-credits';

export interface Usage {
  used: number;
  limit: number;
  remaining: number;
  credits?: number;
  hostedImageCredits?: number;
  pack?: string;
  hostedImagePack?: string;
}

export const USAGE: Usage = { used: 1, limit: 10, remaining: 9, credits: 0, pack: 'email_5' };
export const NONE_LEFT: Usage = { used: 10, limit: 10, remaining: 0, credits: 0, pack: 'email_5' };

/** A real 1x1 PNG, so the app's image preparation can decode it. */
export const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
export const PNG_DATA_URL = `data:image/png;base64,${ PNG_BASE64 }`;

export function pngFile ( fileName = 'logo.png' ): Cypress.FileReferenceObject {
  return { contents: Cypress.Buffer.from( PNG_BASE64, 'base64' ), fileName, mimeType: 'image/png', lastModified: Date.now() };
}

export function emailHtml ( body: string ): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Email</title></head><body>${ body }</body></html>`;
}

/** Opens the app as a signed-in user (AuthService's Cypress-only stand-in). */
export function visitSignedIn ( path = '/', { usage = USAGE, canAskMaya = false }: { usage?: Usage; canAskMaya?: boolean } = {} ): void {
  cy.intercept( 'GET', `${ API }/usage`, { success: true, usage, canAskMaya } ).as( 'usage' );
  cy.visit( path, {
    onBeforeLoad ( win ) {
      win.localStorage.setItem( 'email_creator_e2e_user', JSON.stringify( { uid: 'e2e-user', displayName: 'Ty Showers', email: 'ty@example.com' } ) );
    },
  } );
  cy.wait( '@usage' );
}

/** TODD's next chat turn: asks a question. */
export function stubAsk ( reply: string, usage: Usage = USAGE ): void {
  cy.intercept( 'POST', `${ API }/chat`, { success: true, action: 'ask', reply, usage } ).as( 'chat' );
}

/** TODD's next chat turn: designs the email from `brief`. */
export function stubPlan ( brief: string, { imageIds = [] as string[], baseEmailId = null as string | null, reply = 'On it - designing your email now.' } = {} ): void {
  cy.intercept( 'POST', `${ API }/chat`, { success: true, action: 'generate', reply, brief, imageIds, baseEmailId, usage: USAGE } ).as( 'chat' );
}

export function stubGenerate ( email: { subject: string; preheader?: string; html: string; notes?: string[] }, usage: Usage = { ...USAGE, used: 2, remaining: 8 } ): void {
  cy.intercept( 'POST', `${ API }/generate`, {
    success: true,
    email: { preheader: '', notes: [], ...email },
    usage,
  } ).as( 'generate' );
}

/** Types a message and sends it with Enter. */
export function say ( text: string ): void {
  cy.get( '.composer textarea' ).type( `${ text }{enter}` );
}

/** The rendered email inside the preview iframe. */
export function previewBody (): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.get( 'iframe.preview-frame' ).its( '0.contentDocument.body' ).should( 'not.be.empty' ).then( cy.wrap );
}

/** Asks for and receives one designed email - the starting point for most tests. */
export function makeEmail ( { subject = 'Fall loaves are here', body = '<h1>Fall loaves</h1><p>Pumpkin sourdough is back.</p>' } = {} ): void {
  stubPlan( 'A fall bakery email' );
  stubGenerate( { subject, preheader: 'Pumpkin is back', html: emailHtml( body ) } );
  say( 'A fall email for my bakery' );
  cy.wait( [ '@chat', '@generate' ] );
  cy.get( '.email-meta' ).should( 'contain.text', subject );
}
