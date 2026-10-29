// SYNCED FROM taliferro-ui/product-pages-component - edit it there, then run sync.sh.
// Each app keeps its own product-pages.config.ts beside this file.
import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { DomSanitizer, Meta, SafeHtml, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterModule } from '@angular/router';
import packageJson from '../../../../package.json';

import { PRODUCT_PAGES, ProductPagesContent } from '@taliferro/ui/platform/product-pages.model';
import { MENU_COMPANY, MenuIconName, menuIconSvg } from '@taliferro/ui/platform/universal-menu.model';
import { PlatformMenuComponent } from '../platform-menu/platform-menu.component';
import { PRODUCT_PAGES_CONFIG } from './product-pages.config';

/**
 * The shared Help and About pages (design 12a-12d). Route to it with
 * `data: { page: 'help' }` / `{ page: 'about' }`, or host it from an app's
 * own page with `[page]` and project extra content below the standard
 * sections. Static: renders the same for everyone, so it prerenders.
 */
@Component( {
  selector: 'app-product-pages',
  standalone: true,
  imports: [CommonModule, RouterModule, PlatformMenuComponent],
  templateUrl: './product-pages.component.html',
} )
export class ProductPagesComponent implements OnInit, OnDestroy {
  @Input() page?: 'help' | 'about';

  readonly config = PRODUCT_PAGES_CONFIG;
  readonly content: ProductPagesContent = PRODUCT_PAGES[this.config.key]!;
  readonly company = MENU_COMPANY;
  readonly version = String( ( packageJson as { version?: string } ).version || '' ).trim();
  readonly terms = this.company.links.find( ( link ) => /terms/i.test( link.label ) );
  readonly privacy = this.company.links.find( ( link ) => /privacy policy/i.test( link.label ) );

  private readonly route = inject( ActivatedRoute );
  private readonly sanitizer = inject( DomSanitizer );
  private readonly title = inject( Title );
  private readonly meta = inject( Meta );
  private readonly document = inject( DOCUMENT );
  private readonly iconCache = new Map<string, SafeHtml>();
  private previous = { title: '', description: '', canonical: '', ogUrl: '' };
  private schemaScript?: HTMLScriptElement;

  /** Search engines read these from the prerendered HTML. */
  ngOnInit (): void {
    const { name, tagline, about } = this.content;
    const title = this.current === 'help' ? `${ name } Help: how to use ${ name }` : `About ${ name }: ${ tagline }`;
    const description = this.current === 'help'
      ? `How to use ${ name }: getting started in four steps, and answers to common questions. ${ tagline }`
      : about;
    const canonical = this.canonicalLink();
    this.previous = {
      title: this.title.getTitle(),
      description: this.meta.getTag( 'name="description"' )?.content || '',
      canonical: canonical?.getAttribute( 'href' ) || '',
      ogUrl: this.meta.getTag( 'property="og:url"' )?.content || '',
    };
    this.title.setTitle( title );
    this.meta.updateTag( { name: 'description', content: description } );
    this.meta.updateTag( { property: 'og:title', content: title } );
    this.meta.updateTag( { property: 'og:description', content: description } );
    this.meta.updateTag( { name: 'twitter:title', content: title } );
    this.meta.updateTag( { name: 'twitter:description', content: description } );

    // The app's index.html canonical names its home page; without a page URL
    // here, search engines treat Help and About as duplicates of home.
    const site = this.siteUrl( this.previous.canonical );
    if ( canonical && site ) {
      const url = `${ site }/${ this.current }`;
      canonical.setAttribute( 'href', url );
      this.meta.updateTag( { property: 'og:url', content: url } );
      if ( this.current === 'about' ) this.addStructuredData( site, about );
    }
  }

  /** Most app pages set no title of their own; put back what was there. */
  ngOnDestroy (): void {
    this.title.setTitle( this.previous.title );
    this.meta.updateTag( { name: 'description', content: this.previous.description } );
    if ( this.previous.canonical ) this.canonicalLink()?.setAttribute( 'href', this.previous.canonical );
    if ( this.previous.ogUrl ) this.meta.updateTag( { property: 'og:url', content: this.previous.ogUrl } );
    this.schemaScript?.remove();
  }

  private canonicalLink (): HTMLLinkElement | null {
    return this.document.head.querySelector( 'link[rel="canonical"]' );
  }

  /** "https://assistant.16ahead.com/" -> "https://assistant.16ahead.com". */
  private siteUrl ( href: string ): string {
    try {
      return new URL( href ).origin;
    } catch {
      return '';
    }
  }

  /** Who makes the product, and what it is, for search engines and AI assistants. */
  private addStructuredData ( site: string, description: string ): void {
    const organization = `${ this.company.url }/#organization`;
    const script = this.document.createElement( 'script' );
    script.type = 'application/ld+json';
    script.text = JSON.stringify( {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', '@id': organization, name: this.company.legalName, url: this.company.url },
        {
          '@type': 'SoftwareApplication',
          '@id': `${ site }/#software`,
          name: this.content.name,
          url: `${ site }/`,
          description,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          creator: { '@id': organization },
          publisher: { '@id': organization },
        },
      ],
    } );
    this.document.head.appendChild( script );
    this.schemaScript = script;
  }

  get current (): 'help' | 'about' {
    return this.page || ( this.route.snapshot.data['page'] === 'about' ? 'about' : 'help' );
  }

  icon ( name: MenuIconName, size = 18 ): SafeHtml {
    const key = `${ name }:${ size }`;
    let svg = this.iconCache.get( key );
    if ( !svg ) {
      svg = this.sanitizer.bypassSecurityTrustHtml( menuIconSvg( name, size ) );
      this.iconCache.set( key, svg );
    }
    return svg;
  }
}
