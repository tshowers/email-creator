import { Component } from '@angular/core';

import { ProductPagesComponent } from '../../shared/product-pages/product-pages.component';

/** About Email Creator: the shared template, then what it's for and how it
 *  fits with the other TODD tools. Static (prerendered). */
@Component( {
  selector: 'app-about',
  standalone: true,
  imports: [ProductPagesComponent],
  templateUrl: './about.component.html',
} )
export class AboutComponent {
  readonly uses = [
    { title: 'Newsletters', copy: 'A monthly update with a featured item, news and an offer.' },
    { title: 'Announcements', copy: 'A launch, an event or a change customers should know about.' },
    { title: 'Business email', copy: 'A follow-up after a meeting, with clear next steps.' },
  ];
}
