import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';

import { AuthService } from '../../services/auth.service';
import {
  ApiError,
  EmailCreatorApiService,
  EmailTemplate,
  FillIn,
  HandoffTarget,
  RenderedTemplate,
  TemplateCatalog,
  TemplateState,
  Usage,
} from '../../services/email-creator-api.service';
import { prepareUpload } from '../../utils/image-files';
import { track } from '../../utils/analytics';
import { ASK_PLACEHOLDERS, applyWritten, carryOver, editorGroups, neededLabels } from '../../utils/templates';
import { PlatformMenuComponent } from '../../shared/platform-menu/platform-menu.component';
import { PROFILE_URL, TemplatePickerComponent } from './template-picker.component';

type PreviewWidth = 'desktop' | 'mobile';

interface SendStep {
  target: HandoffTarget | null;
  checking: boolean;
  canSend: boolean | null;
  fillIns: FillIn[];
  values: Record<string, string>;
  working: boolean;
  openUrl: string;
  error: string;
}

const OUTREACH_PRICING_URL = 'https://outreach.16ahead.com/pricing';
const RENDER_DELAY_MS = 350;
const TARGETS: { id: HandoffTarget; label: string; detail: string }[] = [
  { id: 'catalyst', label: 'Many people', detail: 'Catalyst: pick contacts, each gets their own copy' },
  { id: 'composer', label: 'One person', detail: 'Email Composer' },
  { id: 'drips', label: 'A drip', detail: 'Ready in Drips to schedule' },
];

/**
 * Email templates in Email Creator (Ty, 2026-11-05; design_handoff_16ahead_
 * email_templates mockups 01-02). /templates picks one; /templates/:id edits
 * it: the words on the left (or "Write it for me"), the email as it will look
 * on the right, then Send test, Save to Docs, or on to Outreach.
 * /templates/:id?doc=<id> reopens one saved in Docs.
 */
@Component( {
  selector: 'app-templates',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ NgTemplateOutlet, RouterLink, PlatformMenuComponent, TemplatePickerComponent ],
  templateUrl: './templates.component.html',
  styleUrl: './templates.component.css',
} )
export class TemplatesComponent {
  private readonly api = inject( EmailCreatorApiService );
  private readonly sanitizer = inject( DomSanitizer );
  private readonly route = inject( ActivatedRoute );
  private readonly router = inject( Router );
  readonly auth = inject( AuthService );

  private readonly params = toSignal( this.route.paramMap, { initialValue: this.route.snapshot.paramMap } );
  private readonly query = toSignal( this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap } );

  readonly profileUrl = PROFILE_URL;
  readonly pricingUrl = OUTREACH_PRICING_URL;
  readonly targets = TARGETS;

  readonly catalog = signal<TemplateCatalog | null>( null );
  readonly loadError = signal( '' );
  readonly templateId = computed( () => this.params().get( 'id' ) || '' );
  readonly template = computed<EmailTemplate | null>( () => this.catalog()?.templates.find( ( t ) => t.id === this.templateId() ) || null );
  readonly pickerOpen = signal( false );
  readonly showPicker = computed( () => !!this.catalog() && ( !this.templateId() || this.pickerOpen() ) );

  readonly content = signal<Record<string, string>>( {} );
  readonly hidden = signal<string[]>( [] );
  readonly needs = signal<string[]>( [] );
  readonly openSection = signal( '' );
  readonly documentId = signal( '' );
  readonly dirty = signal( false );

  readonly ask = signal( '' );
  readonly writing = signal( false );
  readonly writerNote = signal( '' );
  readonly usage = signal<Usage | null>( null );

  readonly rendered = signal<RenderedTemplate | null>( null );
  readonly previewHtml = signal<SafeHtml | null>( null );
  readonly previewWidth = signal<PreviewWidth>( 'desktop' );
  readonly uploading = signal( '' );
  readonly saving = signal( false );
  readonly testing = signal( false );
  readonly notice = signal( '' );
  readonly error = signal( '' );
  readonly send = signal<SendStep | null>( null );

  readonly problems = computed( () => this.catalog()?.problems || [] );
  readonly brandName = computed( () => this.catalog()?.brand.name || '' );
  readonly askPlaceholder = computed( () => ASK_PLACEHOLDERS[ this.templateId() ] || 'What is this email about?' );
  readonly groups = computed( () => {
    const t = this.template();
    return t ? editorGroups( t, this.content(), this.hidden(), new Set( this.needs() ) ) : [];
  } );
  readonly alwaysGroups = computed( () => this.groups().filter( ( g ) => !g.optional && g.fields.length ) );
  readonly optionalGroups = computed( () => this.groups().filter( ( g ) => g.optional ).map( ( g ) => ( { ...g, open: g.on && this.openSection() === g.id } ) ) );
  readonly subject = computed( () => this.content()[ 'email.subject' ] || '' );
  readonly subjectNeeded = computed( () => this.needs().includes( 'email.subject' ) );
  readonly preheaderNeeded = computed( () => this.needs().includes( 'email.preheader' ) );
  readonly preheader = computed( () => this.content()[ 'email.preheader' ] || '' );
  readonly warnings = computed( () => this.rendered()?.warnings || [] );
  readonly busy = computed( () => this.writing() || this.saving() || this.testing() || !!this.send()?.working );
  readonly canWrite = computed( () => !this.busy() && !!this.ask().trim() );
  readonly sendReady = computed( () => {
    const step = this.send();
    return !!step && step.canSend === true && step.fillIns.every( ( f ) => ( step.values[ f.token ] || '' ).trim() );
  } );

  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private renderSeq = 0;
  private loadedKey = '';

  constructor () {
    effect( () => {
      if ( this.auth.user() && !this.catalog() ) void this.loadCatalog();
    } );
    // A template (or a saved email) opened: its words go in the form once.
    effect( () => {
      const t = this.template();
      const doc = this.query().get( 'doc' ) || '';
      if ( !t ) return;
      const key = `${ t.id }|${ doc }`;
      if ( key === this.loadedKey ) return;
      this.loadedKey = key;
      if ( doc && doc !== this.documentId() ) void this.openSaved( doc );
      else if ( !doc ) this.startTemplate( t );
    } );
    // The preview follows the form, a moment after typing stops.
    effect( () => {
      const t = this.template();
      const state = { templateId: t?.id || '', content: this.content(), hidden: this.hidden() };
      if ( !t ) return;
      if ( this.renderTimer ) clearTimeout( this.renderTimer );
      this.renderTimer = setTimeout( () => void this.renderPreview( state ), RENDER_DELAY_MS );
    } );
    inject( DestroyRef ).onDestroy( () => this.renderTimer && clearTimeout( this.renderTimer ) );
  }

  @HostListener( 'window:beforeunload', [ '$event' ] )
  onBeforeUnload ( event: BeforeUnloadEvent ): void {
    if ( this.dirty() ) event.preventDefault();
  }

  // ---- picking ----

  choose ( id: string ): void {
    const next = this.catalog()?.templates.find( ( t ) => t.id === id );
    this.pickerOpen.set( false );
    if ( !next || id === this.templateId() ) return;
    // Changing template keeps what fits (the subject, preview text, same-named fields); a first pick starts from its example words.
    this.content.set( this.template() ? carryOver( this.content(), next ) : { ...next.starter } );
    this.loadedKey = `${ id }|`;
    this.hidden.set( [] );
    this.needs.set( [] );
    this.writerNote.set( '' );
    this.openSection.set( '' );
    this.documentId.set( '' );
    track( 'template_chosen' );
    void this.router.navigate( [ '/templates', id ] );
  }

  blank (): void {
    void this.router.navigate( [ '/' ] );
  }

  closePicker (): void {
    if ( this.templateId() ) this.pickerOpen.set( false );
    else void this.router.navigate( [ '/' ] );
  }

  // ---- the form ----

  setField ( key: string, event: Event ): void {
    const value = ( event.target as HTMLInputElement | HTMLTextAreaElement ).value;
    this.content.update( ( all ) => ( { ...all, [ key ]: value } ) );
    if ( value.trim() ) this.needs.update( ( list ) => list.filter( ( k ) => k !== key ) );
    this.dirty.set( true );
  }

  setAsk ( event: Event ): void {
    this.ask.set( ( event.target as HTMLTextAreaElement ).value );
  }

  toggleSection ( id: string ): void {
    const off = this.hidden().includes( id );
    this.hidden.update( ( list ) => ( off ? list.filter( ( name ) => name !== id ) : [ ...list, id ] ) );
    if ( !off && this.openSection() === id ) this.openSection.set( '' );
    this.dirty.set( true );
  }

  editSection ( id: string ): void {
    if ( this.hidden().includes( id ) ) this.hidden.update( ( list ) => list.filter( ( name ) => name !== id ) );
    this.openSection.set( this.openSection() === id ? '' : id );
  }

  async uploadImage ( key: string, input: HTMLInputElement ): Promise<void> {
    const file = input.files?.[ 0 ];
    input.value = '';
    if ( !file ) return;
    this.uploading.set( key );
    this.error.set( '' );
    try {
      const prepared = await prepareUpload( file );
      const altKey = key.replace( /image_url$/, 'image_alt' );
      const alt = this.content()[ altKey ] || file.name.replace( /\.[a-z0-9]+$/i, '' );
      const { url } = await this.api.uploadTemplateImage( prepared.dataUrl, alt );
      this.content.update( ( all ) => ( { ...all, [ key ]: url, [ altKey ]: all[ altKey ] || alt } ) );
      this.dirty.set( true );
    } catch ( error ) {
      this.error.set( this.message( error, 'Couldn’t add that picture.' ) );
    } finally {
      this.uploading.set( '' );
    }
  }

  removeImage ( key: string ): void {
    this.content.update( ( all ) => ( { ...all, [ key ]: '' } ) );
    this.dirty.set( true );
  }

  async write (): Promise<void> {
    const t = this.template();
    if ( !t || !this.ask().trim() || this.writing() ) return;
    this.writing.set( true );
    this.error.set( '' );
    try {
      const out = await this.api.writeTemplate( t.id, this.ask(), this.hidden() );
      this.content.set( applyWritten( this.content(), out.content, out.needs ) );
      this.needs.set( out.needs );
      this.usage.set( out.usage );
      const missing = out.needs.length ? ` Still yours to fill in: ${ neededLabels( t, out.needs ) }.` : '';
      this.writerNote.set( `${ out.reply || 'Written for your business.' }${ missing }` );
      this.dirty.set( true );
      track( 'template_written' );
    } catch ( error ) {
      this.error.set( this.message( error, 'The words couldn’t be written just now.' ) );
    } finally {
      this.writing.set( false );
    }
  }

  // ---- finishing ----

  async sendTest (): Promise<void> {
    this.testing.set( true );
    this.error.set( '' );
    this.notice.set( '' );
    try {
      await this.api.sendTemplateTest( this.state() );
      this.notice.set( `Test sent to ${ this.auth.user()?.email || 'you' }.` );
      track( 'template_test_sent' );
    } catch ( error ) {
      this.error.set( this.message( error, 'Couldn’t send the test.' ) );
    } finally {
      this.testing.set( false );
    }
  }

  async save (): Promise<void> {
    this.saving.set( true );
    this.error.set( '' );
    this.notice.set( '' );
    try {
      const saved = await this.api.saveTemplate( this.state(), this.documentId() );
      this.documentId.set( saved.documentId );
      this.loadedKey = `${ this.templateId() }|${ saved.documentId }`;
      void this.router.navigate( [], { relativeTo: this.route, queryParams: { doc: saved.documentId }, replaceUrl: true } );
      this.dirty.set( false );
      this.notice.set( `Saved to Docs as “${ saved.title }”.` );
      track( 'template_saved' );
    } catch ( error ) {
      this.error.set( this.message( error, 'Couldn’t save to Docs.' ) );
    } finally {
      this.saving.set( false );
    }
  }

  openSend (): void {
    this.error.set( '' );
    this.send.set( { target: null, checking: false, canSend: null, fillIns: [], values: {}, working: false, openUrl: '', error: '' } );
  }

  closeSend (): void {
    this.send.set( null );
  }

  async pickTarget ( target: HandoffTarget ): Promise<void> {
    this.send.set( { target, checking: true, canSend: null, fillIns: [], values: {}, working: false, openUrl: '', error: '' } );
    try {
      const finished = await this.api.renderTemplate( this.state(), { strict: true } );
      const check = await this.api.handoffCheck( finished.subject, finished.html );
      this.patchSend( { checking: false, canSend: check.canSendWithOutreach, fillIns: check.fillIns[ target ] || [] } );
    } catch ( error ) {
      this.patchSend( { checking: false, canSend: null, error: this.message( error, 'Couldn’t check this email.' ) } );
    }
  }

  setFill ( token: string, event: Event ): void {
    const value = ( event.target as HTMLInputElement ).value;
    const step = this.send();
    if ( step ) this.patchSend( { values: { ...step.values, [ token ]: value } } );
  }

  async handOff (): Promise<void> {
    const step = this.send();
    if ( !step?.target || !this.sendReady() ) return;
    this.patchSend( { working: true, error: '' } );
    try {
      const finished = await this.api.renderTemplate( this.state(), { strict: true } );
      const { url } = await this.api.handoff( { target: step.target, subject: finished.subject, preheader: finished.preheader, html: finished.html, fills: step.values } );
      this.patchSend( { working: false, openUrl: url } );
      track( 'template_handoff' );
    } catch ( error ) {
      this.patchSend( { working: false, error: this.message( error, 'Couldn’t send this to Outreach.' ) } );
    }
  }

  // ---- loading ----

  private async loadCatalog (): Promise<void> {
    try {
      this.catalog.set( await this.api.getTemplates() );
    } catch ( error ) {
      this.loadError.set( this.message( error, 'The templates couldn’t load.' ) );
    }
  }

  /** Opened straight from a link: the template's example words. */
  private startTemplate ( t: EmailTemplate ): void {
    this.content.set( { ...t.starter } );
    this.hidden.set( [] );
    this.needs.set( [] );
    this.writerNote.set( '' );
    this.openSection.set( '' );
    this.documentId.set( '' );
  }

  private async openSaved ( id: string ): Promise<void> {
    try {
      const saved = await this.api.openSavedTemplate( id );
      this.documentId.set( saved.documentId );
      this.loadedKey = `${ saved.templateId }|${ saved.documentId }`;
      this.content.set( saved.content );
      this.hidden.set( saved.hidden );
      this.dirty.set( false );
      if ( saved.templateId !== this.templateId() ) {
        void this.router.navigate( [ '/templates', saved.templateId ], { queryParams: { doc: saved.documentId }, replaceUrl: true } );
      }
    } catch ( error ) {
      this.error.set( this.message( error, 'Couldn’t open that email.' ) );
    }
  }

  private async renderPreview ( state: TemplateState ): Promise<void> {
    const seq = ++this.renderSeq;
    try {
      const out = await this.api.renderTemplate( state );
      if ( seq !== this.renderSeq ) return;
      this.rendered.set( out );
      this.previewHtml.set( this.sanitizer.bypassSecurityTrustHtml( out.html ) );
    } catch ( error ) {
      if ( seq === this.renderSeq ) this.error.set( this.message( error, 'The preview couldn’t update.' ) );
    }
  }

  private state (): TemplateState {
    return { templateId: this.templateId(), content: this.content(), hidden: this.hidden() };
  }

  private patchSend ( patch: Partial<SendStep> ): void {
    this.send.update( ( step ) => ( step ? { ...step, ...patch } : step ) );
  }

  private message ( error: unknown, fallback: string ): string {
    if ( error instanceof ApiError || error instanceof Error ) return error.message || fallback;
    return fallback;
  }
}
