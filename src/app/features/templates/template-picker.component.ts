import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { EmailCreatorApiService, TemplateCatalog } from '../../services/email-creator-api.service';
import { TEMPLATE_FILTERS, TemplateFilter, filterTemplates } from '../../utils/templates';

export const PROFILE_URL = 'https://app.16ahead.com/update-profile';

/**
 * "Choose a template" (design_handoff_16ahead_email_templates, mockup 01):
 * Blank (describe it in the chat) plus the five designs, each previewed in
 * the person's own brand.
 */
@Component( {
  selector: 'app-template-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="picker" role="dialog" aria-labelledby="picker-title" data-cy="template-picker">
      <header class="head">
        <span class="mark"><span class="um-glyph" data-key="email-creator"></span></span>
        <div class="titles">
          <h1 id="picker-title">Choose a template</h1>
          <p class="brand-line">
            @if (brandName()) {
              Every template uses your brand: {{ brandName() }} · <span class="swatch" [style.background]="brandColor()"></span> {{ brandColor() }} ·
              <a [href]="profileUrl" target="_blank" rel="noopener" data-cy="edit-brand">Edit brand</a>
            } @else {
              <a [href]="profileUrl" target="_blank" rel="noopener" data-cy="edit-brand">Add your brand</a> (logo, colour, address) so every template uses it.
            }
          </p>
        </div>
        <div class="filters" role="tablist">
          @for (f of filters; track f.id) {
            <button type="button" class="filter" role="tab" [class.on]="filter() === f.id" [attr.aria-selected]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }}</button>
          }
          <button type="button" class="close" (click)="closed.emit()" aria-label="Close" data-cy="picker-close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>
      <div class="grid">
        @if (filter() === 'all') {
          <button type="button" class="card blank" (click)="blank.emit()" data-cy="template-blank">
            <span class="thumb"><span class="dashed">+</span></span>
            <span class="meta"><b>Blank</b><span>Describe the email and 16Ahead designs it from scratch.</span></span>
          </button>
        }
        @for (t of cards(); track t.id) {
          <button type="button" class="card" [class.current]="t.current" (click)="chosen.emit(t.id)" [attr.data-cy]="'template-' + t.id">
            <span class="thumb">
              @if (t.preview) {
                <iframe [srcdoc]="t.preview" title="" tabindex="-1" aria-hidden="true" sandbox=""></iframe>
              } @else {
                <span class="dots"><i></i><i></i><i></i></span>
              }
            </span>
            <span class="meta"><b>{{ t.name }}</b><span>{{ t.description }}</span><span class="use">Use</span></span>
          </button>
        }
      </div>
    </section>
  `,
  styles: [ `
    :host { display: block; }
    .picker { background: var(--bg); color: var(--text); border-radius: 28px; box-shadow: var(--shadow); overflow: hidden; }
    .head { display: flex; align-items: center; gap: 16px; padding: 24px 28px; border-bottom: 1px solid var(--surface2); flex-wrap: wrap; }
    .mark { width: 40px; height: 40px; display: grid; place-items: center; }
    .titles { flex: 1; min-width: 240px; }
    h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -.02em; }
    .brand-line { margin: 2px 0 0; color: var(--muted); font-size: 15px; }
    .brand-line a { color: var(--blue); font-weight: 700; text-decoration: none; }
    .swatch { display: inline-block; width: 11px; height: 11px; border-radius: 3px; vertical-align: -1px; }
    .filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .filter, .close { height: 40px; padding: 0 18px; border: 0; border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; font-weight: 600; font-size: 15px; cursor: pointer; }
    .filter.on { background: var(--text); color: var(--bg); }
    .close { width: 40px; padding: 0; display: grid; place-items: center; }
    .close svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; padding: 28px; }
    .card { display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; height: auto; padding: 0; border: 2px solid var(--surface2); border-radius: 20px; background: var(--bg); color: var(--text); text-align: left; font: inherit; cursor: pointer; overflow: hidden; }
    .card:hover, .card:focus-visible, .card.current { border-color: var(--blue); }
    .thumb { position: relative; align-self: stretch; width: 100%; display: grid; place-items: center; height: 250px; background: var(--surface); overflow: hidden; }
    .thumb iframe { position: absolute; top: 14px; left: 50%; width: 640px; height: 1100px; border: 0; transform: translateX(-50%) scale(.38); transform-origin: top center; pointer-events: none; background: #f6f6f4; }
    .dashed { display: grid; place-items: center; width: 60%; height: 80%; border: 2px dashed var(--muted); border-radius: 12px; color: var(--muted); font-size: 40px; font-weight: 300; opacity: .6; }
    .meta { position: relative; align-self: stretch; display: flex; flex-direction: column; gap: 4px; padding: 16px 18px 18px; }
    .meta b { font-size: 19px; font-weight: 800; }
    .meta > span { color: var(--muted); font-size: 14px; line-height: 1.4; padding-right: 64px; }
    .meta .use { position: absolute; right: 16px; top: 18px; padding: 6px 14px !important; border-radius: 999px; background: var(--blue); color: #fff !important; font-weight: 700; opacity: 0; }
    .card:hover .use, .card:focus-visible .use, .card.current .use { opacity: 1; }
    .dots { display: inline-flex; gap: 5px; }
    .dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); opacity: .5; }
    @media (max-width: 640px) {
      .head { padding: 18px 16px; }
      h1 { font-size: 24px; }
      .grid { padding: 16px; gap: 14px; grid-template-columns: 1fr; }
    }
  ` ],
} )
export class TemplatePickerComponent {
  private readonly api = inject( EmailCreatorApiService );
  private readonly sanitizer = inject( DomSanitizer );

  readonly catalog = input.required<TemplateCatalog>();
  /** The template open in the editor, if any. */
  readonly current = input( '' );
  readonly chosen = output<string>();
  readonly blank = output<void>();
  readonly closed = output<void>();

  readonly filters = TEMPLATE_FILTERS;
  readonly profileUrl = PROFILE_URL;
  readonly filter = signal<TemplateFilter>( 'all' );
  private readonly previews = signal<Record<string, SafeHtml>>( {} );

  readonly brandName = computed( () => this.catalog().brand.name );
  readonly brandColor = computed( () => this.catalog().brand.originalColor || this.catalog().brand.color );
  readonly cards = computed( () => {
    const previews = this.previews();
    return filterTemplates( this.catalog().templates, this.filter() ).map( ( t ) => ( {
      id: t.id, name: t.name, description: t.description, current: t.id === this.current(), preview: previews[ t.id ] || null,
    } ) );
  } );

  constructor () {
    // Each card shows the design with its example words, in this person's brand.
    effect( () => {
      const catalog = this.catalog();
      catalog.templates.forEach( ( t ) => {
        this.api.renderTemplate( { templateId: t.id, content: {}, hidden: [] }, { sample: true } )
          .then( ( out ) => this.previews.update( ( all ) => ( { ...all, [ t.id ]: this.sanitizer.bypassSecurityTrustHtml( out.html ) } ) ) )
          .catch( () => null );
      } );
    } );
  }
}
