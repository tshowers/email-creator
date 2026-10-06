// SYNCED FROM taliferro-ui/menu-component - edit it there, then run
// taliferro-ui/menu-component/sync.sh. This app's own menu items are in
// platform-menu.config.ts next to this file.
import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import packageJson from '../../../../package.json';

import {
  MENU_COMPANY, MENU_TODD_PROFILE_URL, MenuIconName, MenuSection, MenuLink, MenuProduct, menuAccountLinks, menuIconSvg, menuInitials, menuMatches, menuProductsFor, menuSectionFor,
} from '@taliferro/ui/platform/universal-menu.model';
import { PLATFORM_MENU_CONFIG } from './platform-menu.config';

/**
 * The universal menu (design_handoff_outreach 3, 6a/6b): This app | Products
 * | Account, with search. Identical in every Taliferro web product - only
 * platform-menu.config.ts differs. The look is in
 * @taliferro/ui/styles/universal-menu.css (imported in styles.css).
 */
@Component( {
  selector: 'app-platform-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './platform-menu.component.html',
} )
export class PlatformMenuComponent {
  @Input() isLoggedIn = false;
  @Input() isAdmin = false;
  @Input() userName = '';
  @Input() userEmail = '';
  /** Hide the Menu pill when the page shows its own trigger and calls open(). */
  @Input() showTrigger = true;
  @Output() readonly signOut = new EventEmitter<void>();
  @Output() readonly signIn = new EventEmitter<void>();

  @ViewChild( 'search' ) private searchInput?: ElementRef<HTMLInputElement>;
  /** The overlay renders inside the trigger's container; lift it to <body> so it always sits on top. */
  @ViewChild( 'layer' ) set layer ( ref: ElementRef<HTMLElement> | undefined ) {
    if ( ref && typeof document !== 'undefined' ) document.body.appendChild( ref.nativeElement );
  }

  readonly config = PLATFORM_MENU_CONFIG;
  readonly products: MenuProduct[] = menuProductsFor( this.config.app );
  readonly accountLinks: MenuLink[] = menuAccountLinks( this.config.app );
  readonly company = MENU_COMPANY;
  readonly toddProfileUrl = MENU_TODD_PROFILE_URL;
  readonly version = String( ( packageJson as { version?: string } ).version || '' ).trim();

  isOpen = false;
  query = '';

  private readonly sanitizer = inject( DomSanitizer );
  private readonly router = inject( Router );
  private readonly iconCache = new Map<string, SafeHtml>();

  /** The part of the app you're in, when the app splits its left column by page. */
  get section (): MenuSection | undefined { return menuSectionFor( this.config.sections, this.router.url ); }
  get appTitle (): string { return this.section?.title || this.config.name; }
  get appItems (): MenuLink[] {
    return ( this.section?.items || this.config.items ).filter( ( item ) => menuMatches( this.query, item.label, item.keywords ) );
  }
  get secondaryItems (): MenuLink[] { return ( this.config.secondaryItems || [] ).filter( ( item ) => menuMatches( this.query, item.label, item.keywords ) ); }
  get visibleProducts (): MenuProduct[] { return this.products.filter( ( product ) => menuMatches( this.query, product.label ) ); }
  get visibleAccount (): MenuLink[] { return this.accountLinks.filter( ( item ) => menuMatches( this.query, item.label, item.keywords ) ); }
  get hasAppColumn (): boolean { return ( this.section?.items || this.config.items ).length > 0 || !!this.config.secondaryItems?.length; }
  get noResults (): boolean {
    return !!this.query && !this.appItems.length && !this.secondaryItems.length && !this.visibleProducts.length && !this.visibleAccount.length;
  }
  get initials (): string { return menuInitials( this.userName || this.userEmail ); }

  icon ( name: MenuIconName, size = 20 ): SafeHtml {
    const key = `${ name }:${ size }`;
    if ( !this.iconCache.has( key ) ) this.iconCache.set( key, this.sanitizer.bypassSecurityTrustHtml( menuIconSvg( name, size ) ) );
    return this.iconCache.get( key )!;
  }

  open (): void {
    this.isOpen = true;
    this.query = '';
    setTimeout( () => this.searchInput?.nativeElement.focus(), 0 );
  }

  close (): void {
    this.isOpen = false;
  }

  toggle (): void {
    if ( this.isOpen ) this.close(); else this.open();
  }

  onSignOut (): void {
    this.close();
    this.signOut.emit();
  }

  onSignIn (): void {
    this.close();
    if ( this.config.signInRoute ) void this.router.navigateByUrl( this.config.signInRoute );
    else this.signIn.emit();
  }

  /** Enter in search opens the first match. */
  openFirstMatch (): void {
    const link = [...this.appItems, ...this.secondaryItems][0];
    if ( link?.route ) {
      this.close();
      void this.router.navigateByUrl( link.route );
      return;
    }
    const url = link?.url || this.visibleProducts[0]?.url || this.visibleAccount[0]?.url;
    if ( url ) {
      this.close();
      window.location.href = url;
    }
  }

  /** ⌘K opens it; once open, typing goes to search; Escape closes. */
  @HostListener( 'document:keydown', ['$event'] )
  onKeydown ( event: KeyboardEvent ): void {
    if ( ( event.metaKey || event.ctrlKey ) && event.key.toLowerCase() === 'k' ) {
      event.preventDefault();
      this.toggle();
      return;
    }
    if ( !this.isOpen ) return;
    if ( event.key === 'Escape' ) {
      this.close();
      return;
    }
    const input = this.searchInput?.nativeElement;
    if ( input && document.activeElement !== input && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey ) {
      input.focus();
    }
  }

  trackByLabel ( _index: number, item: { label: string } ): string {
    return item.label;
  }
}
