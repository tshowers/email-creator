// SYNCED FROM taliferro-ui/also-from-us-component - edit it there, then run
// taliferro-ui/also-from-us-component/sync.sh.
import { isPlatformBrowser } from '@angular/common';
import { Component, Input, OnInit, PLATFORM_ID, inject } from '@angular/core';

import { MenuProduct, ProductKey, menuProductsFor } from '@taliferro/ui/platform/universal-menu.model';
import { PLATFORM_MENU_CONFIG } from '../platform-menu/platform-menu.config';

/**
 * "Also from us <logo> Product" beside "Powered by TODD" on a landing page:
 * a different product, picked at random, on every visit. Never this app, and
 * never Ask TODD (TODD is already in the line).
 *
 *   <a appAlsoFromUs></a>
 *   <a appAlsoFromUs [skip]="['music']"></a>   (the page links Music itself)
 *
 * Prerendered pages hold it hidden until the browser has picked, so the
 * build's pick never flashes first. The logo is .um-logo from universal-menu.css.
 */
@Component( {
  selector: 'a[appAlsoFromUs]',
  standalone: true,
  template: `Also from us <span class="um-logo" [attr.data-app]="product.key" aria-hidden="true"></span><strong>{{ product.label }}</strong>`,
  host: {
    '[attr.href]': 'product.url',
    target: '_blank',
    rel: 'noopener',
    '[style.visibility]': 'picked ? null : "hidden"',
  },
} )
export class AlsoFromUsComponent implements OnInit {
  /** Products this page already links to. */
  @Input() skip: ProductKey[] = [];

  product!: MenuProduct;
  picked = false;

  private readonly isBrowser = isPlatformBrowser( inject( PLATFORM_ID ) );

  ngOnInit (): void {
    const choices = menuProductsFor( PLATFORM_MENU_CONFIG.app ).filter( ( product ) => product.key !== 'ask-todd' && !this.skip.includes( product.key ) );
    this.picked = this.isBrowser;
    this.product = this.isBrowser ? choices[Math.floor( Math.random() * choices.length )] : choices[0];
  }
}
