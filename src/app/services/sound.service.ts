// SYNCED FROM taliferro-ui/sound - edit it there, then run
// taliferro-ui/sound/sync.sh.
import { Injectable } from '@angular/core';

/** Same names and files as the TODD site's SoundService, so ported calls keep working. */
const SOUNDS: Record<string, string> = {
  click: 'assets/sounds/button.wav',
  notification: 'assets/sounds/notification.wav',
  finished: 'assets/sounds/celebration.wav',
  alert: 'assets/sounds/alert.mp3',
  error: 'assets/sounds/caution.wav',
  tap: 'assets/sounds/tap_01.wav',
  open: 'assets/sounds/transition_up.wav',
  close: 'assets/sounds/transition_down.wav',
  toggleOn: 'assets/sounds/toggle_on.wav',
  toggleOff: 'assets/sounds/toggle_off.wav',
};

/** What counts as "a button was pushed". */
const BUTTON_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], a.btn, a.button';

/**
 * The app's sounds. Every button press plays `click` on its own (one
 * document listener, started by the universal menu); the menu plays
 * toggleOn/toggleOff and the notification service plays `notification`.
 * Mark a button (or a wrapper) `data-sound="off"` when it plays something
 * else or should stay quiet.
 *
 * Browsers block audio until the person interacts, so nothing loads or plays
 * before the first tap or key, and nothing runs while pages prerender.
 */
@Injectable( { providedIn: 'root' } )
export class SoundService {
  private readonly sounds: Record<string, HTMLAudioElement> = {};
  private unlocked = false;

  constructor () {
    if ( typeof document === 'undefined' || typeof Audio === 'undefined' ) return;
    const unlock = () => {
      if ( this.unlocked ) return;
      this.unlocked = true;
      for ( const [name, src] of Object.entries( SOUNDS ) ) {
        const audio = new Audio( src );
        audio.preload = 'auto';
        this.sounds[name] = audio;
      }
    };
    document.addEventListener( 'pointerdown', unlock, { passive: true, capture: true } );
    document.addEventListener( 'keydown', unlock, { passive: true, capture: true } );
    document.addEventListener( 'click', ( event ) => this.onClick( event ), { passive: true, capture: true } );
  }

  playSound ( name: string ): void {
    const audio = this.sounds[name];
    if ( !audio ) return;
    audio.currentTime = 0;
    audio.play().catch( ( error ) => {
      // Autoplay still blocked (no real interaction yet): stay quiet.
      if ( String( error?.name ) !== 'NotAllowedError' ) console.warn( `Sound ${ name } failed:`, error );
    } );
  }

  private onClick ( event: Event ): void {
    const target = event.target as Element | null;
    const button = target?.closest?.( BUTTON_SELECTOR );
    if ( !button || button.closest( '[data-sound="off"]' ) ) return;
    if ( ( button as HTMLButtonElement ).disabled || button.getAttribute( 'aria-disabled' ) === 'true' ) return;
    this.playSound( 'click' );
  }
}
