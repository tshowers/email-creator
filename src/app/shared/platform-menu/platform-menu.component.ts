// SYNCED FROM taliferro-ui/menu-component - edit it there, then run
// taliferro-ui/menu-component/sync.sh. This app's own menu items are in
// platform-menu.config.ts next to this file.
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import packageJson from '../../../../package.json';

import {
  MENU_COMPANY, MENU_TODD_PROFILE_URL, MenuIconName, MenuSection, MenuLink, MenuProduct, menuAccountLinks, menuAdminItems, menuIconSvg, menuInitials, menuMatches, menuProductsFor, menuSectionFor, MENU_PRODUCTS,
} from '@taliferro/ui/platform/universal-menu.model';
import type { SearchEntry } from '@taliferro/ui/platform/search-index.model';

/** The ⌘K index (every page of every product) loads on first use, not with the app. */
type SearchIndex = typeof import( '@taliferro/ui/platform/search-index.model' );
let searchIndexLoad: Promise<SearchIndex> | null = null;
const loadSearchIndex = (): Promise<SearchIndex> => ( searchIndexLoad ||= import( '@taliferro/ui/platform/search-index.model' ) );

/** One ⌘K result, precomputed for the template. */
interface SearchHit {
  entry: SearchEntry;
  label: string;
  siteName: string;
  url: string;
  /** Product icon (menu-icons/<key>); null for the company site. */
  glyph: string | null;
  tint: string;
}

const SEARCH_TINTS: Record<string, string> = Object.fromEntries( MENU_PRODUCTS.map( ( product ) => [product.key, product.tint] ) );
import { SoundService } from '../../services/sound.service';
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
  /** A workspace admin (or the master account): sees config.adminItems without access 'master'. */
  @Input() isAdmin = false;
  /** The Taliferro master account: sees every admin item. */
  @Input() isMaster = false;
  @Input() userName = '';
  @Input() userEmail = '';
  /** Hide the Menu pill when the page shows its own trigger and calls open(). */
  @Input() showTrigger = true;
  @Output() readonly signOut = new EventEmitter<void>();
  @Output() readonly signIn = new EventEmitter<void>();

  @ViewChild( 'search' ) private searchInput?: ElementRef<HTMLInputElement>;
  /** The overlay renders inside the trigger's container; lift it to <body> so it always sits on top. */
  @ViewChild( 'layer' ) set layer ( ref: ElementRef<HTMLElement> | undefined ) {
    // Angular re-runs this as the view changes; moving the node again would drop focus.
    if ( ref && typeof document !== 'undefined' && ref.nativeElement.parentElement !== document.body ) document.body.appendChild( ref.nativeElement );
  }
  @ViewChild( 'searchLayer' ) set searchLayer ( ref: ElementRef<HTMLElement> | undefined ) {
    if ( !ref || typeof document === 'undefined' || ref.nativeElement.parentElement === document.body ) return;
    document.body.appendChild( ref.nativeElement );
    // Moving the node drops focus; put it in the box once it's in place.
    setTimeout( () => this.focusSearch(), 0 );
  }
  @ViewChild( 'searchInput' ) private searchBox?: ElementRef<HTMLInputElement>;

  readonly config = PLATFORM_MENU_CONFIG;
  readonly products: MenuProduct[] = menuProductsFor( this.config.app );
  readonly accountLinks: MenuLink[] = menuAccountLinks( this.config.app );
  readonly company = MENU_COMPANY;
  readonly toddProfileUrl = MENU_TODD_PROFILE_URL;
  readonly version = String( ( packageJson as { version?: string } ).version || '' ).trim();

  isOpen = false;
  query = '';

  /** ⌘K: search every page of every product (@taliferro/ui/platform/search-index.model). */
  searchOpen = false;
  searchQuery = '';
  searchHits: SearchHit[] = [];
  searchActive = 0;
  private searchIndex: SearchIndex | null = null;

  private readonly sanitizer = inject( DomSanitizer );
  private readonly router = inject( Router );
  private readonly changeDetector = inject( ChangeDetectorRef );
  /** Also starts the app-wide button sound (the menu is in every app's root). */
  private readonly sound = inject( SoundService );
  private readonly iconCache = new Map<string, SafeHtml>();

  /** The part of the app you're in, when the app splits its left column by page. */
  get section (): MenuSection | undefined { return menuSectionFor( this.config.sections, this.router.url ); }
  get appTitle (): string { return this.section?.title || this.config.name; }
  get appItems (): MenuLink[] {
    return ( this.section?.items || this.config.items ).filter( ( item ) => menuMatches( this.query, item.label, item.keywords ) );
  }
  get adminItems (): MenuLink[] {
    if ( !this.isLoggedIn ) return [];
    return menuAdminItems( this.config.adminItems, this.isAdmin, this.isMaster ).filter( ( item ) => menuMatches( this.query, item.label, item.keywords ) );
  }
  get secondaryItems (): MenuLink[] { return ( this.config.secondaryItems || [] ).filter( ( item ) => menuMatches( this.query, item.label, item.keywords ) ); }
  get visibleProducts (): MenuProduct[] { return this.products.filter( ( product ) => menuMatches( this.query, product.label ) ); }
  get visibleAccount (): MenuLink[] { return this.accountLinks.filter( ( item ) => menuMatches( this.query, item.label, item.keywords ) ); }
  /** Apps without accounts (config.noSignIn) show no Account card while signed out. */
  get hasAccountCard (): boolean {
    return this.isLoggedIn || !this.config.noSignIn;
  }

  get hasAppColumn (): boolean {
    return ( this.section?.items || this.config.items ).length > 0 || !!this.config.secondaryItems?.length || this.adminItems.length > 0;
  }
  get noResults (): boolean {
    return !!this.query && !this.appItems.length && !this.secondaryItems.length && !this.adminItems.length && !this.visibleProducts.length && !this.visibleAccount.length;
  }
  get initials (): string { return menuInitials( this.userName || this.userEmail ); }

  icon ( name: MenuIconName, size = 20 ): SafeHtml {
    const key = `${ name }:${ size }`;
    if ( !this.iconCache.has( key ) ) this.iconCache.set( key, this.sanitizer.bypassSecurityTrustHtml( menuIconSvg( name, size ) ) );
    return this.iconCache.get( key )!;
  }

  open (): void {
    if ( !this.isOpen ) this.sound.playSound( 'toggleOn' );
    this.isOpen = true;
    this.query = '';
    setTimeout( () => this.searchInput?.nativeElement.focus(), 0 );
  }

  close (): void {
    if ( this.isOpen ) this.sound.playSound( 'toggleOff' );
    this.isOpen = false;
  }

  toggle (): void {
    if ( this.isOpen ) this.close(); else this.open();
  }

  openSearch (): void {
    this.close();
    if ( !this.searchOpen ) this.sound.playSound( 'toggleOn' );
    this.searchOpen = true;
    this.searchQuery = '';
    this.runSearch();
    setTimeout( () => this.focusSearch(), 0 );
    if ( !this.searchIndex ) {
      void loadSearchIndex().then( ( index ) => {
        this.searchIndex = index;
        this.runSearch();
        this.changeDetector.markForCheck();
        this.focusSearch();
      } );
    }
  }

  private focusSearch (): void {
    const box = this.searchBox?.nativeElement;
    if ( this.searchOpen && box && document.activeElement !== box ) box.focus();
  }

  closeSearch (): void {
    if ( this.searchOpen ) this.sound.playSound( 'toggleOff' );
    this.searchOpen = false;
  }

  runSearch (): void {
    const index = this.searchIndex;
    if ( !index ) {
      this.searchHits = [];
      return;
    }
    const entries = index.searchEntriesFor( this.isAdmin, this.isMaster );
    this.searchHits = index.searchEntries( entries, this.searchQuery, this.config.app ).map( ( entry ) => ( {
      entry,
      label: entry.label,
      siteName: index.SEARCH_SITE_NAMES[entry.site],
      url: index.searchEntryUrl( entry ),
      glyph: entry.site === 'company' ? null : entry.site === 'todd' ? 'ask-todd' : entry.site,
      tint: entry.site === 'todd' ? 'green' : SEARCH_TINTS[entry.site] || 'blue',
    } ) );
    this.searchActive = 0;
  }

  /** In this app: route in place. Another product (or a static page): load it. */
  goTo ( hit: SearchHit | undefined, event?: Event ): void {
    if ( !hit ) return;
    event?.preventDefault();
    this.closeSearch();
    if ( hit.entry.site === this.config.app && !hit.entry.staticPage ) {
      void this.router.navigateByUrl( hit.entry.path );
      return;
    }
    window.location.href = hit.url;
  }

  /** Other code (e.g. a page's own search icon) can open the search: window.dispatchEvent(new Event('tt-open-search')). */
  @HostListener( 'window:tt-open-search' )
  onOpenSearchRequest (): void {
    this.openSearch();
  }

  onSignOut (): void {
    this.close();
    this.signOut.emit();
  }

  onSignIn (): void {
    this.close();
    const signInRoute = this.config.signInRoute;
    if ( !signInRoute ) {
      this.signIn.emit();
      return;
    }
    // Come back to this page after signing in (not the app's default landing).
    const here = this.router.url;
    const returnUrl = here && !here.startsWith( signInRoute ) ? here : undefined;
    void this.router.navigate( [signInRoute], { queryParams: returnUrl ? { returnUrl } : {} } );
  }

  /** Enter in search opens the first match. */
  openFirstMatch (): void {
    const link = [...this.appItems, ...this.secondaryItems, ...this.adminItems][0];
    if ( link?.route ) {
      this.close();
      void this.router.navigate( [link.route], { queryParams: link.queryParams } );
      return;
    }
    const url = link?.url || this.visibleProducts[0]?.url || this.visibleAccount[0]?.url;
    if ( url ) {
      this.close();
      window.location.href = url;
    }
  }

  /** ⌘K opens the search (the Menu button opens the menu). Escape closes either. */
  @HostListener( 'document:keydown', ['$event'] )
  onKeydown ( event: KeyboardEvent ): void {
    if ( ( event.metaKey || event.ctrlKey ) && event.key.toLowerCase() === 'k' ) {
      event.preventDefault();
      if ( this.searchOpen ) this.closeSearch(); else this.openSearch();
      return;
    }
    if ( this.searchOpen ) {
      if ( event.key === 'Escape' ) {
        this.closeSearch();
      } else if ( event.key === 'ArrowDown' || event.key === 'ArrowUp' ) {
        event.preventDefault();
        const count = this.searchHits.length;
        if ( count ) this.searchActive = ( this.searchActive + ( event.key === 'ArrowDown' ? 1 : -1 ) + count ) % count;
      } else if ( event.key === 'Enter' ) {
        event.preventDefault();
        this.goTo( this.searchHits[this.searchActive] );
      }
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

  trackByUrl ( _index: number, hit: { url: string } ): string {
    return hit.url;
  }
}
