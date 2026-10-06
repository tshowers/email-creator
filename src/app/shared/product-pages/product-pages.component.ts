// SYNCED FROM taliferro-ui/product-pages-component - edit it there, then run sync.sh.
// Each app keeps its own product-pages.config.ts beside this file.
import { CommonModule } from '@angular/common';
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
  private readonly iconCache = new Map<string, SafeHtml>();
  private previous = { title: '', description: '' };

  /** Search engines read these from the prerendered HTML. */
  ngOnInit (): void {
    const { name, tagline, about } = this.content;
    const title = this.current === 'help' ? `${ name } Help: how to use ${ name }` : `About ${ name }: ${ tagline }`;
    const description = this.current === 'help'
      ? `How to use ${ name }: getting started in four steps, and answers to common questions. ${ tagline }`
      : about;
    this.previous = { title: this.title.getTitle(), description: this.meta.getTag( 'name="description"' )?.content || '' };
    this.title.setTitle( title );
    this.meta.updateTag( { name: 'description', content: description } );
    this.meta.updateTag( { property: 'og:title', content: title } );
    this.meta.updateTag( { property: 'og:description', content: description } );
  }

  /** Most app pages set no title of their own; put back what was there. */
  ngOnDestroy (): void {
    this.title.setTitle( this.previous.title );
    this.meta.updateTag( { name: 'description', content: this.previous.description } );
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
