import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

/**
 * TODD's hosted login sends the user back here with ?token=<custom token>&state=<...>.
 * The state must match what AuthService.signIn() stashed, or the callback is rejected.
 */
@Component( {
  selector: 'app-auth-callback',
  standalone: true,
  imports: [ RouterLink ],
  template: `
    <div class="callback">
      @if (errorMessage()) {
        <p>{{ errorMessage() }}</p>
        <a routerLink="/">Back to Email Creator</a>
      } @else {
        <p>Signing you in…</p>
      }
    </div>
  `,
  styles: `
    .callback {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 16px;
      text-align: center;
      color: var(--ec-muted);
    }
    a { color: var(--ec-primary); font-weight: 600; }
  `,
} )
export class AuthCallbackComponent implements OnInit {
  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );
  private readonly auth = inject( AuthService );

  readonly errorMessage = signal( '' );

  async ngOnInit (): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get( 'token' );
    const pending = this.auth.consumePendingLogin( this.route.snapshot.queryParamMap.get( 'state' ) );

    if ( !token || !pending ) {
      this.errorMessage.set( 'This sign-in link is invalid or expired. Please try signing in again.' );
      return;
    }

    try {
      await this.auth.completeSignIn( token );
      await this.router.navigateByUrl( pending.returnUrl || '/', { replaceUrl: true } );
    } catch ( error ) {
      this.errorMessage.set( error instanceof Error ? error.message : 'Sign-in failed. Please try again.' );
    }
  }
}
