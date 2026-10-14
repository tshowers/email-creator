import { Injectable, signal } from '@angular/core';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut, User } from 'firebase/auth';

/**
 * Sign-in goes through TODD's hosted login (todd.taliferro.tech/login), the
 * same page Pulse, Network and the native apps use. This service only
 * starts that redirect, completes the callback, and exposes the session.
 */
@Injectable( { providedIn: 'root' } )
export class AuthService {
  /** undefined until Firebase reports the first auth state. */
  readonly user = signal<User | null | undefined>( undefined );

  private readonly pendingLoginStorageKey = 'email_creator_hosted_login_pending';

  constructor () {
    // Prerendering (no browser): render the signed-out page for search engines.
    if ( typeof window === 'undefined' ) {
      this.user.set( null );
      return;
    }
    onAuthStateChanged( getAuth(), ( user ) => this.user.set( user ) );
  }

  /**
   * `state` is stashed with the return URL before leaving and checked again
   * in AuthCallbackComponent - a CSRF guard against a forged callback. The
   * query is kept so a link like ?mayaEmail=<id> still opens after sign-in.
   */
  signIn ( returnUrl = `/${ window.location.search }` ): void {
    const state = crypto.randomUUID();
    sessionStorage.setItem( this.pendingLoginStorageKey, JSON.stringify( { state, returnUrl } ) );
    const isLocal = [ 'localhost', '127.0.0.1' ].includes( window.location.hostname );
    const client = isLocal ? 'email-creator-web-local' : 'email-creator-web';
    window.location.href = `https://todd.taliferro.tech/login?client=${ client }&state=${ state }`;
  }

  consumePendingLogin ( state: string | null ): { returnUrl?: string } | null {
    const raw = sessionStorage.getItem( this.pendingLoginStorageKey );
    sessionStorage.removeItem( this.pendingLoginStorageKey );
    if ( !raw ) return null;

    try {
      const pending = JSON.parse( raw ) as { state: string; returnUrl?: string };
      if ( !state || pending.state !== state ) return null;
      return { returnUrl: pending.returnUrl };
    } catch {
      return null;
    }
  }

  async completeSignIn ( token: string ): Promise<void> {
    await signInWithCustomToken( getAuth(), token );
  }

  async signOut (): Promise<void> {
    await signOut( getAuth() );
  }

  async getIdToken (): Promise<string> {
    const user = getAuth().currentUser;
    if ( !user ) throw new Error( 'Not signed in.' );
    return user.getIdToken();
  }
}
