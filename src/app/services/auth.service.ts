import { Injectable, signal } from '@angular/core';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut, User } from 'firebase/auth';
import { environment } from '../../environments/environment';
import { hostedLoginUrl } from '@taliferro/ui/platform/hosted-login.model';

/**
 * Cypress only (cypress/support/e2e.ts): a stand-in signed-in user, so the
 * end-to-end tests drive the real app against a stubbed backend. Ignored in
 * production builds and whenever Cypress isn't running the page.
 */
export const E2E_USER_STORAGE_KEY = 'email_creator_e2e_user';

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
  private e2eUser = false;

  constructor () {
    // Prerendering (no browser): render the signed-out page for search engines.
    if ( typeof window === 'undefined' ) {
      this.user.set( null );
      return;
    }
    const e2eUser = this.readE2eUser();
    if ( e2eUser ) {
      this.e2eUser = true;
      this.user.set( e2eUser );
      return;
    }
    onAuthStateChanged( getAuth(), ( user ) => this.user.set( user ) );
  }

  /**
   * `state` is stashed with the return URL before leaving and checked again
   * in AuthCallbackComponent - a CSRF guard against a forged callback. It
   * comes back to the page you're on, query included, so a link like
   * ?mayaEmail=<id> still opens after sign-in.
   */
  signIn ( returnUrl = `${ window.location.pathname }${ window.location.search }` ): void {
    const state = crypto.randomUUID();
    sessionStorage.setItem( this.pendingLoginStorageKey, JSON.stringify( { state, returnUrl } ) );
    const isLocal = [ 'localhost', '127.0.0.1' ].includes( window.location.hostname );
    const client = isLocal ? 'email-creator-web-local' : 'email-creator-web';
    window.location.href = hostedLoginUrl( client, state );
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
    if ( this.e2eUser ) {
      this.user.set( null );
      return;
    }
    await signOut( getAuth() );
  }

  async getIdToken (): Promise<string> {
    if ( this.e2eUser ) return 'e2e-id-token';
    const user = getAuth().currentUser;
    if ( !user ) throw new Error( 'Not signed in.' );
    return user.getIdToken();
  }

  private readE2eUser (): User | null {
    if ( environment.production || !( 'Cypress' in window ) ) return null;
    try {
      const raw = localStorage.getItem( E2E_USER_STORAGE_KEY );
      return raw ? JSON.parse( raw ) as User : null;
    } catch {
      return null;
    }
  }
}
