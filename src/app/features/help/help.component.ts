import { Component } from '@angular/core';

import { ProductPagesComponent } from '../../shared/product-pages/product-pages.component';

/** Email Creator's Help: the shared template, then writing tips, download
 *  formats and more questions. Static (prerendered). */
@Component( {
  selector: 'app-help',
  standalone: true,
  imports: [ProductPagesComponent],
  templateUrl: './help.component.html',
} )
export class HelpComponent {
  readonly tips = [
    { title: 'Say who it’s for', copy: 'Customers, a client, your team: the audience changes the tone and the ask.' },
    { title: 'Give the facts', copy: 'Names, dates, prices, codes and links. TODD won’t invent them; it leaves a placeholder instead.' },
    { title: 'Attach your logo', copy: 'Use the + button, or drop images onto the page. TODD places them in the design.' },
    { title: 'Ask for changes', copy: 'Reply in plain words, such as “make the coupon bigger” or “shorter”. Every version stays in the chat.' },
  ];

  readonly formats = [
    { name: 'Download HTML', copy: 'TODD hosts your images for 30 days, so the email works pasted into any email tool.' },
    { name: 'Download .zip', copy: 'The HTML plus an images folder, for uploading to Mailchimp, Constant Contact and similar tools.' },
    { name: 'Single file', copy: 'Images built into the HTML. Easy to open and share, but many inboxes block these images.' },
    { name: 'Copy HTML', copy: 'For pasting into a code or HTML block.' },
  ];

  readonly questions = [
    { q: 'Can I send it from here?', a: 'Yes, with Outreach: send to many contacts with Catalyst, or to one person with the Email Composer. Sending needs the Outreach app subscription; downloading stays free.' },
    { q: 'What if the limit runs out?', a: 'The pill in the header shows how many emails are left today. The count resets at midnight Pacific time.' },
    { q: 'Can I see it on a phone?', a: 'Yes. Switch the preview between desktop and mobile with the buttons above the email.' },
    { q: 'What image files can I attach?', a: 'PNG, JPG, WEBP or GIF, up to 20 MB each. TODD resizes them for email automatically.' },
  ];
}
