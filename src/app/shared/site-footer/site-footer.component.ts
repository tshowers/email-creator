// SYNCED FROM taliferro-ui/site-footer-component - edit it there, then run
// taliferro-ui/site-footer-component/sync.sh.
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { MENU_COMPANY, MENU_PRODUCTS } from '@taliferro/ui/platform/universal-menu.model';

/**
 * The landing-page footer, identical in every Taliferro web product. Plain
 * links, always in the page, so search engines can follow them (the
 * universal menu only renders once it's opened). The look is in
 * @taliferro/ui/styles/site-footer.css; put it last inside a `tt-page`
 * column so it sits at the bottom of the window on short pages.
 * Anything between the tags (an app's Help and About links) goes in the first row.
 */
@Component( {
  selector: 'app-site-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './site-footer.component.html',
} )
export class SiteFooterComponent {
  readonly company = MENU_COMPANY;
  readonly products = MENU_PRODUCTS;
  readonly phoneHref = 'tel:+1' + MENU_COMPANY.phone.replace( /\D/g, '' );
  readonly year = new Date().getFullYear();
}
