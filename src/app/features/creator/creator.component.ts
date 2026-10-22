import { Component, ElementRef, HostListener, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../../services/auth.service';
import {
  ApiError,
  ChatMessagePayload,
  EmailCreatorApiService,
  FillIn,
  HandoffTarget,
  GeneratedEmail,
  HostedImage,
  ImageRef,
  MayaCopy,
  Usage,
} from '../../services/email-creator-api.service';
import {
  buildZip,
  downloadBlob,
  embeddedHtml,
  filenameFor,
  imageIdsIn,
  previewDocument,
  resolveImages,
} from '../../utils/email-export';
import { ACCEPTED_IMAGE_TYPES, prepareUpload } from '../../utils/image-files';
import { track } from '../../utils/analytics';
import { MAYA_EMAIL_PARAM, MAYA_PRICING_URL, dataUrlToFile, mayaCopyMessage } from '../../utils/maya';
import { PlatformMenuComponent } from '../../shared/platform-menu/platform-menu.component';
import { SiteFooterComponent } from '../../shared/site-footer/site-footer.component';
import { AlsoFromUsComponent } from '../../shared/also-from-us/also-from-us.component';

interface ChatImage {
  id: string;
  name: string;
  /** Email-ready image (see prepareUpload). */
  dataUrl: string;
  thumbnail: string;
  width: number;
  height: number;
}

interface EmailPlan {
  brief: string;
  imageIds: string[];
  baseEmailId: string | null;
}

interface EmailDraft {
  id: string;
  subject: string;
  preheader: string;
  /** Uses todd-image:<id> placeholders; resolved per download format. */
  html: string;
  notes: string[];
  brief: string;
  /** Built once so the iframe isn't reloaded on every change detection. */
  preview: SafeHtml;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  images: ChatImage[];
  plan?: EmailPlan;
  email?: EmailDraft;
  generating?: boolean;
  error?: string;
  /** Copy Maya wrote: shown as hers; TODD reads `text` (mayaCopyMessage). */
  maya?: { reply: string; copy: MayaCopy };
}

type PreviewWidth = 'desktop' | 'mobile';

/** The "Send with Outreach" step for one email. */
interface SendPanel {
  emailId: string;
  target: HandoffTarget;
  /** Null while checking. */
  canSend: boolean | null;
  fillIns: FillIn[];
  values: Record<string, string>;
  working: boolean;
  error: string;
  /** Set once the handoff is ready; the user opens it in a new tab. */
  openUrl: string;
}

const OUTREACH_PRICING_URL = 'https://outreach.taliferro.tech/pricing';
const TARGET_NAMES: Record<HandoffTarget, string> = { catalyst: 'Catalyst', composer: 'Email Composer' };

// Only the most recent uploads are sent to the chat model as thumbnails;
// older ones are still referenced by id so TODD knows they exist.
const MAX_THUMBNAILS_PER_TURN = 6;
const MAX_ATTACHMENTS_PER_MESSAGE = 6;

/**
 * The whole app: a chat with TODD that ends in a designed HTML email.
 * Everything - uploads, emails, the conversation - lives in these signals and
 * nowhere else, so it's gone when the tab closes. The one exception is the
 * "hosted images" download, which uploads the email's images for 30 days.
 */
@Component( {
  selector: 'app-creator',
  standalone: true,
  imports: [ AlsoFromUsComponent, SiteFooterComponent,  FormsModule, RouterLink, PlatformMenuComponent ],
  templateUrl: './creator.component.html',
  styleUrl: './creator.component.css',
} )
export class CreatorComponent {
  private readonly api = inject( EmailCreatorApiService );
  private readonly sanitizer = inject( DomSanitizer );
  readonly auth = inject( AuthService );

  readonly acceptedTypes = ACCEPTED_IMAGE_TYPES.join( ',' );
  readonly suggestions = [
    'A monthly newsletter for my bakery with a featured item and a 10% off coupon',
    'Announce our new product launch to customers - I\'ll attach our logo',
    'A professional follow-up to a client after today\'s meeting, with next steps',
  ];

  readonly messages = signal<ChatMessage[]>( [] );
  readonly attachments = signal<ChatImage[]>( [] );
  readonly draft = signal( '' );
  readonly thinking = signal( false );
  readonly dragging = signal( false );
  readonly notice = signal( '' );
  readonly usage = signal<Usage | null>( null );
  readonly previewWidths = signal<Record<string, PreviewWidth>>( {} );
  /** Email id whose export is running (hosting images can take a moment). */
  readonly exporting = signal<string | null>( null );
  readonly sendPanel = signal<SendPanel | null>( null );
  readonly pricingUrl = OUTREACH_PRICING_URL;
  readonly mayaPricingUrl = MAYA_PRICING_URL;
  /** The workspace has Maya, so "Ask Maya to write it" works (else it links to pricing). */
  readonly canAskMaya = signal( false );
  readonly targetNames = TARGET_NAMES;

  readonly generating = computed( () => this.messages().some( ( message ) => message.generating ) );
  readonly busy = computed( () => this.thinking() || this.generating() );
  readonly canSend = computed( () =>
    !this.busy() && ( this.draft().trim().length > 0 || this.attachments().length > 0 ) );
  readonly canSendToMaya = computed( () => !this.busy() && this.draft().trim().length > 0 );
  readonly hasEmails = computed( () => this.messages().some( ( message ) => message.email ) );

  /** Every email made in this chat, oldest first. */
  readonly emails = computed( () => this.messages().flatMap( ( message ) => message.email ? [message.email] : [] ) );
  /** The email shown in the right panel (design 7c). Null means the newest. */
  readonly selectedEmailId = signal<string | null>( null );
  readonly selectedEmail = computed( () => {
    const list = this.emails();
    return list.find( ( email ) => email.id === this.selectedEmailId() ) ?? list[list.length - 1] ?? null;
  } );
  /** The panel shows the rendered email or its HTML. */
  readonly panelView = signal<'preview' | 'html'>( 'preview' );
  /** Out of free emails today AND prepaid credits - the composer offers "Buy more". */
  readonly noneLeft = computed( () => this.usage()?.remaining === 0 && !( this.usage()?.credits || 0 ) );
  /** Set when image hosting hit its limit: the hosted-image pack to offer. */
  readonly hostingPack = signal( '' );
  /** 'waiting' while Stripe checkout is open in its own tab. */
  readonly buying = signal<'idle' | 'starting' | 'waiting'>( 'idle' );
  /** Quick changes offered under the newest email. */
  readonly quickChanges = ['Shorter', 'Make it more formal', 'Add a call-to-action button'];

  private readonly scroller = viewChild<ElementRef<HTMLElement>>( 'scroller' );
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>( 'composer' );
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>( 'fileInput' );

  /** Images already uploaded for the hosted download, so a second download doesn't re-upload. */
  private readonly hosted = new Map<string, HostedImage>();
  private nextUploadId = 1;
  private nextEmailId = 1;
  private dragDepth = 0;
  private mayaLinkHandled = false;

  constructor () {
    effect( () => {
      this.emails().length;
      this.selectedEmailId.set( null );
    } );
    effect( () => {
      if ( !this.auth.user() ) return;
      void this.refreshUsage();
      void this.openMayaEmailFromLink();
    } );
    this.handleReturnFromCheckout();
  }

  /** Buys a credit pack. Checkout opens in a new tab so the emails here aren't lost. */
  async buyMore ( pack = this.usage()?.pack || '' ): Promise<void> {
    if ( !pack ) return;
    const balance = (): number => pack === this.usage()?.hostedImagePack ? this.usage()?.hostedImageCredits || 0 : this.usage()?.credits || 0;
    const before = balance();
    const tab = window.open( '', '_blank' );
    this.buying.set( 'starting' );
    try {
      await this.api.buyCredits( pack, tab );
    } catch ( error ) {
      this.buying.set( 'idle' );
      this.notice.set( error instanceof Error ? error.message : 'Checkout couldn’t start.' );
      return;
    }
    if ( !tab ) return;
    this.buying.set( 'waiting' );
    track( 'credits_checkout_started', { pack } );
    const until = Date.now() + 20 * 60 * 1000;
    while ( this.buying() === 'waiting' && Date.now() < until ) {
      await new Promise( ( resolve ) => setTimeout( resolve, 3000 ) );
      await this.refreshUsage();
      if ( balance() > before ) {
        this.buying.set( 'idle' );
        this.hostingPack.set( '' );
        this.notice.set( 'Thanks! Your credits were added.' );
        return;
      }
    }
    this.buying.set( 'idle' );
  }

  /** TODD Suite ($99/mo, @taliferro/ui TODD_SUITE): every TODD app and 10x the free emails every day. */
  async buySuite (): Promise<void> {
    const before = this.usage()?.limit || 0;
    const tab = window.open( '', '_blank' );
    this.buying.set( 'starting' );
    try {
      await this.api.buySuite( tab );
    } catch ( error ) {
      this.buying.set( 'idle' );
      this.notice.set( error instanceof Error ? error.message : 'Checkout couldn’t start.' );
      return;
    }
    if ( !tab ) return;
    this.buying.set( 'waiting' );
    track( 'suite_checkout_started', { from: 'email-creator' } );
    const until = Date.now() + 20 * 60 * 1000;
    while ( this.buying() === 'waiting' && Date.now() < until ) {
      await new Promise( ( resolve ) => setTimeout( resolve, 3000 ) );
      await this.refreshUsage();
      if ( ( this.usage()?.limit || 0 ) > before ) {
        this.buying.set( 'idle' );
        this.notice.set( 'Thanks! TODD Suite is on: every TODD app, and 10x the free emails every day.' );
        return;
      }
    }
    this.buying.set( 'idle' );
  }

  cancelBuying (): void {
    this.buying.set( 'idle' );
  }

  /** Stripe returns here with ?checkout=...; the checkout tab closes itself. */
  private handleReturnFromCheckout (): void {
    if ( typeof window === 'undefined' ) return;
    const params = new URLSearchParams( location.search );
    if ( !params.get( 'checkout' ) ) return;
    const success = params.get( 'checkout' ) === 'success';
    history.replaceState( history.state, '', location.pathname );
    if ( success && window.opener ) {
      window.close();
      return;
    }
    if ( success ) this.notice.set( 'Thanks! Your credits will appear in a moment.' );
  }

  /** Nothing is saved, so warn before the tab takes the emails with it. */
  @HostListener( 'window:beforeunload', [ '$event' ] )
  onBeforeUnload ( event: BeforeUnloadEvent ): void {
    if ( this.hasEmails() ) event.preventDefault();
  }

  @HostListener( 'window:paste', [ '$event' ] )
  onPaste ( event: ClipboardEvent ): void {
    const files = Array.from( event.clipboardData?.files || [] ).filter( ( file ) => file.type.startsWith( 'image/' ) );
    if ( files.length && this.auth.user() ) {
      event.preventDefault();
      void this.addFiles( files );
    }
  }

  @HostListener( 'window:dragenter', [ '$event' ] )
  onDragEnter ( event: DragEvent ): void {
    if ( !this.auth.user() || !event.dataTransfer?.types.includes( 'Files' ) ) return;
    this.dragDepth++;
    this.dragging.set( true );
  }

  @HostListener( 'window:dragleave' )
  onDragLeave (): void {
    this.dragDepth = Math.max( 0, this.dragDepth - 1 );
    if ( !this.dragDepth ) this.dragging.set( false );
  }

  @HostListener( 'window:dragover', [ '$event' ] )
  onDragOver ( event: DragEvent ): void {
    event.preventDefault();
  }

  @HostListener( 'window:drop', [ '$event' ] )
  onDrop ( event: DragEvent ): void {
    event.preventDefault();
    this.dragDepth = 0;
    this.dragging.set( false );
    if ( this.auth.user() ) void this.addFiles( Array.from( event.dataTransfer?.files || [] ) );
  }

  openFilePicker (): void {
    this.fileInput()?.nativeElement.click();
  }

  onFilesPicked ( input: HTMLInputElement ): void {
    void this.addFiles( Array.from( input.files || [] ) );
    input.value = '';
  }

  removeAttachment ( id: string ): void {
    this.attachments.update( ( list ) => list.filter( ( image ) => image.id !== id ) );
  }

  useSuggestion ( text: string ): void {
    this.draft.set( text );
    this.composer()?.nativeElement.focus();
  }

  onComposerKeydown ( event: KeyboardEvent ): void {
    if ( event.key === 'Enter' && !event.shiftKey && !event.isComposing ) {
      event.preventDefault();
      void this.send();
    }
  }

  autoGrow ( textarea: HTMLTextAreaElement ): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${ Math.min( textarea.scrollHeight, 220 ) }px`;
  }

  async send (): Promise<void> {
    if ( !this.canSend() ) return;
    this.postDraft();
    await this.runTurn();
  }

  /**
   * "Ask Maya to write it": the request goes to Maya, her copy joins the
   * chat as hers, and TODD designs it from there like any other turn.
   */
  async askMaya (): Promise<void> {
    if ( !this.canSendToMaya() ) return;
    const request = this.postDraft();
    this.thinking.set( true );
    try {
      const { copy, reply } = await this.api.mayaCopy( request );
      this.messages.update( ( list ) => [ ...list, { role: 'user', text: mayaCopyMessage( copy ), images: [], maya: { reply, copy } } ] );
      track( 'maya_copy_written' );
    } catch ( error ) {
      this.thinking.set( false );
      if ( error instanceof ApiError && error.status === 403 ) this.canAskMaya.set( false );
      this.handleError( error );
      return;
    }
    await this.runTurn();
  }

  /** Moves the composer's text and attachments into the chat; returns the text. */
  private postDraft (): string {
    const text = this.draft().trim();
    this.notice.set( '' );
    this.messages.update( ( list ) => [ ...list, { role: 'user', text, images: this.attachments() } ] );
    this.draft.set( '' );
    this.attachments.set( [] );
    const composer = this.composer()?.nativeElement;
    if ( composer ) this.autoGrow( composer );
    this.scrollToBottom();
    return text;
  }

  /** Asks TODD for the next step in the chat, and designs the email when it's ready. */
  private async runTurn (): Promise<void> {
    this.thinking.set( true );
    try {
      const turn = await this.api.chat( this.toPayload( this.messages() ) );
      this.usage.set( turn.usage );
      const plan = turn.action === 'generate' && turn.brief ? {
        brief: turn.brief,
        imageIds: turn.imageIds || [],
        baseEmailId: turn.baseEmailId || null,
      } : undefined;
      this.messages.update( ( list ) => [ ...list, { role: 'assistant', text: turn.reply, images: [], plan } ] );
      this.thinking.set( false );
      this.scrollToBottom();
      if ( plan ) await this.generate( this.messages().length - 1 );
    } catch ( error ) {
      this.thinking.set( false );
      this.handleError( error );
    }
  }

  /** Runs (or retries) the email planned on the assistant message at `index`. */
  async generate ( index: number ): Promise<void> {
    const plan = this.messages()[ index ]?.plan;
    if ( !plan ) return;
    this.patchMessage( index, { generating: true, error: undefined } );
    this.scrollToBottom();

    try {
      const base = plan.baseEmailId ? this.findEmail( plan.baseEmailId ) : undefined;
      // A revision keeps the images the current email already uses.
      const imageIds = [ ...new Set( [ ...plan.imageIds, ...( base ? imageIdsIn( base.html ) : [] ) ] ) ];
      const images: ImageRef[] = imageIds
        .map( ( id ) => this.findImage( id ) )
        .filter( ( image ): image is ChatImage => !!image )
        .map( ( { id, name, width, height, thumbnail } ) => ( { id, name, width, height, thumbnail } ) );

      const result = await this.api.generate( plan.brief, images, base?.html );
      this.usage.set( result.usage );
      this.patchMessage( index, { generating: false, email: this.toDraft( result.email, plan.brief ) } );
      track( 'email_created', { revision: !!base } );
      this.scrollToBottom();
    } catch ( error ) {
      if ( error instanceof ApiError && error.usage ) this.usage.set( error.usage );
      const message = error instanceof Error ? error.message : 'Email generation failed.';
      this.patchMessage( index, { generating: false, error: message } );
      if ( error instanceof ApiError && error.status === 401 ) this.handleError( error );
    }
  }

  previewWidth ( email: EmailDraft ): PreviewWidth {
    return this.previewWidths()[ email.id ] || 'desktop';
  }

  setPreviewWidth ( email: EmailDraft, width: PreviewWidth, frame: HTMLIFrameElement ): void {
    this.previewWidths.update( ( widths ) => ( { ...widths, [ email.id ]: width } ) );
    setTimeout( () => this.fitFrame( frame ) );
  }

  /** Sizes the preview to the email so the page scrolls, not the iframe. */
  fitFrame ( frame: HTMLIFrameElement ): void {
    const document = frame.contentDocument;
    if ( !document?.documentElement ) return;
    frame.style.height = '0px';
    frame.style.height = `${ document.documentElement.scrollHeight }px`;
  }

  usesImages ( email: EmailDraft ): boolean {
    return imageIdsIn( email.html ).length > 0;
  }

  async downloadHosted ( email: EmailDraft ): Promise<void> {
    await this.runExport( email, async () => {
      const html = await this.hostedHtml( email );
      track( 'email_downloaded' );
      downloadBlob( html, 'text/html', `${ filenameFor( email.subject ) }.html` );
    } );
  }

  async downloadZip ( email: EmailDraft ): Promise<void> {
    await this.runExport( email, async () => {
      track( 'email_downloaded' );
      downloadBlob( buildZip( email.html, this.allImages() ), 'application/zip', `${ filenameFor( email.subject ) }.zip` );
    } );
  }

  async downloadSingleFile ( email: EmailDraft ): Promise<void> {
    await this.runExport( email, async () => {
      const html = embeddedHtml( email.html, this.allImages() );
      track( 'email_downloaded' );
      downloadBlob( html, 'text/html', `${ filenameFor( email.subject ) }.html` );
    } );
  }

  /** Copies the version that works when pasted anywhere: hosted images, if it has any. */
  async copyHtml ( email: EmailDraft ): Promise<void> {
    await this.runExport( email, async () => {
      const html = this.usesImages( email ) ? await this.hostedHtml( email ) : email.html;
      await navigator.clipboard.writeText( html );
      if ( !this.usesImages( email ) ) this.notice.set( 'HTML copied.' );
    } );
  }

  /**
   * Starts handing this email to Outreach: checks the Outreach subscription
   * and what the user must fill in (facts TODD wasn't given, and - for one
   * recipient - their details). With nothing to fill in, prepares it straight away.
   */
  async openSend ( email: EmailDraft, target: HandoffTarget ): Promise<void> {
    const panel: SendPanel = { emailId: email.id, target, canSend: null, fillIns: [], values: {}, working: true, error: '', openUrl: '' };
    this.sendPanel.set( panel );
    try {
      const check = await this.api.handoffCheck( email.subject, email.html );
      const fillIns = check.fillIns[ target ] || [];
      this.sendPanel.set( { ...panel, canSend: check.canSendWithOutreach, fillIns, working: false } );
      if ( check.canSendWithOutreach && fillIns.length === 0 ) await this.prepareSend( email );
    } catch ( error ) {
      this.sendPanel.set( { ...panel, canSend: null, working: false, error: error instanceof Error ? error.message : 'Something went wrong.' } );
    }
  }

  setFill ( token: string, value: string ): void {
    const panel = this.sendPanel();
    if ( panel ) this.sendPanel.set( { ...panel, values: { ...panel.values, [ token ]: value } } );
  }

  fillsComplete ( panel: SendPanel ): boolean {
    return panel.fillIns.every( ( item ) => ( panel.values[ item.token ] || '' ).trim().length > 0 );
  }

  /** Uploads the images (if any) and saves the email for Outreach to open. */
  async prepareSend ( email: EmailDraft ): Promise<void> {
    const panel = this.sendPanel();
    if ( !panel || panel.working || !this.fillsComplete( panel ) ) return;
    this.sendPanel.set( { ...panel, working: true, error: '' } );
    try {
      const html = this.usesImages( email ) ? await this.hostedHtml( email ) : email.html;
      const result = await this.api.handoff( {
        target: panel.target, subject: email.subject, preheader: email.preheader, html, fills: panel.values,
      } );
      this.sendPanel.set( { ...panel, working: false, openUrl: result.url } );
    } catch ( error ) {
      this.sendPanel.set( { ...panel, working: false, error: error instanceof Error ? error.message : 'Something went wrong.' } );
    }
  }

  closeSend (): void {
    this.sendPanel.set( null );
  }

  /** A link card in the chat shows that version in the panel. */
  showEmail ( email: EmailDraft ): void {
    this.selectedEmailId.set( email.id );
    this.panelView.set( 'preview' );
  }

  isNewestEmail ( email: EmailDraft ): boolean {
    const list = this.emails();
    return list[list.length - 1] === email;
  }

  /** A quick-change chip sends that request as the next message. */
  requestChange ( text: string ): void {
    this.draft.set( text );
    void this.send();
  }

  /** Download HTML: hosted images when the email has any, else one file. */
  downloadPrimary ( email: EmailDraft ): Promise<void> {
    return this.usesImages( email ) ? this.downloadHosted( email ) : this.downloadSingleFile( email );
  }

  startOver (): void {
    if ( this.hasEmails() && !confirm( 'Start over? Emails you haven\'t downloaded will be gone.' ) ) return;
    this.messages.set( [] );
    this.attachments.set( [] );
    this.draft.set( '' );
    this.notice.set( '' );
    this.hosted.clear();
    this.selectedEmailId.set( null );
  }

  async signOut (): Promise<void> {
    if ( this.hasEmails() && !confirm( 'Sign out? Emails you haven\'t downloaded will be gone.' ) ) return;
    this.messages.set( [] );
    this.attachments.set( [] );
    this.hosted.clear();
    await this.auth.signOut();
  }

  /**
   * "Edit in Email Creator" from Maya's work page (?mayaEmail=<id>): her
   * design opens as the chat's current email, with its images attached, so
   * the next message revises it.
   */
  private async openMayaEmailFromLink (): Promise<void> {
    if ( this.mayaLinkHandled || typeof window === 'undefined' ) return;
    const id = new URLSearchParams( location.search ).get( MAYA_EMAIL_PARAM );
    if ( !id ) return;
    this.mayaLinkHandled = true;
    history.replaceState( history.state, '', location.pathname );
    this.thinking.set( true );
    try {
      const email = await this.api.mayaEmail( id );
      let skipped = email.skippedImages;
      const images: ChatImage[] = [];
      for ( const image of email.images ) {
        try {
          images.push( { id: image.id, name: image.name, ...await prepareUpload( dataUrlToFile( image.dataUrl, image.name ) ) } );
        } catch {
          skipped++;
        }
      }
      const subject = email.subject || 'Your email';
      this.messages.update( ( list ) => [
        ...list,
        { role: 'user', text: `Edit the email Maya designed: "${ subject }"`, images },
        { role: 'assistant', text: 'Here\'s the email Maya designed. Tell me what to change.', images: [] },
      ] );
      const draft = this.toDraft( { subject, preheader: email.preheader, html: email.html, notes: [] },
        email.brief || `The email "${ subject }" that Maya designed.` );
      this.patchMessage( this.messages().length - 1, { email: draft } );
      if ( skipped ) {
        this.notice.set( `${ skipped === 1 ? 'One image' : `${ skipped } images` } from Maya's email couldn't be brought along; asking for a change will leave ${ skipped === 1 ? 'it' : 'them' } out.` );
      }
      track( 'maya_email_opened' );
      this.scrollToBottom();
    } catch ( error ) {
      this.handleError( error );
    } finally {
      this.thinking.set( false );
    }
  }

  private toDraft ( email: GeneratedEmail, brief: string ): EmailDraft {
    return {
      id: `e${ this.nextEmailId++ }`,
      ...email,
      brief,
      // Built after the images it uses are in the chat, so the preview can show them.
      preview: this.sanitizer.bypassSecurityTrustHtml( previewDocument( embeddedHtml( email.html, this.allImages() ) ) ),
    };
  }

  private async runExport ( email: EmailDraft, work: () => Promise<void> ): Promise<void> {
    if ( this.exporting() ) return;
    this.exporting.set( email.id );
    try {
      await work();
    } catch ( error ) {
      if ( error instanceof ApiError && error.status === 429 && error.pack ) this.hostingPack.set( error.pack );
      this.handleError( error );
    } finally {
      this.exporting.set( null );
    }
  }

  /** Uploads the email's images (once each) and returns HTML pointing at them. */
  private async hostedHtml ( email: EmailDraft ): Promise<string> {
    for ( const id of imageIdsIn( email.html ) ) {
      const image = this.findImage( id );
      if ( image && !this.hosted.has( id ) ) this.hosted.set( id, await this.api.hostImage( image.dataUrl ) );
    }
    const expiries = imageIdsIn( email.html ).map( ( id ) => this.hosted.get( id )?.expiresAt ).filter( Boolean ) as string[];
    if ( expiries.length ) {
      const earliest = new Date( Math.min( ...expiries.map( ( value ) => Date.parse( value ) ) ) );
      const date = earliest.toLocaleDateString( undefined, { month: 'long', day: 'numeric', year: 'numeric' } );
      this.notice.set( `Done. The image links in this email work until ${ date }; send it before then.` );
    }
    return resolveImages( email.html, ( id ) => this.hosted.get( id )?.url );
  }

  private async addFiles ( files: File[] ): Promise<void> {
    const room = MAX_ATTACHMENTS_PER_MESSAGE - this.attachments().length;
    if ( files.length > room ) {
      this.notice.set( `You can attach up to ${ MAX_ATTACHMENTS_PER_MESSAGE } images per message.` );
    }
    for ( const file of files.slice( 0, Math.max( 0, room ) ) ) {
      try {
        const prepared = await prepareUpload( file );
        this.attachments.update( ( list ) => [
          ...list,
          { id: `u${ this.nextUploadId++ }`, name: file.name, ...prepared },
        ] );
      } catch ( error ) {
        this.notice.set( error instanceof Error ? error.message : 'Could not attach that file.' );
      }
    }
  }

  private toPayload ( messages: ChatMessage[] ): ChatMessagePayload[] {
    const recentUploadIds = new Set(
      messages.flatMap( ( message ) => message.images ).slice( -MAX_THUMBNAILS_PER_TURN ).map( ( image ) => image.id ),
    );
    return messages.map( ( message ) => ( {
      role: message.role,
      text: message.text,
      images: message.images.map( ( image ) => ( {
        id: image.id,
        name: image.name,
        width: image.width,
        height: image.height,
        thumbnail: recentUploadIds.has( image.id ) ? image.thumbnail : undefined,
      } ) ),
      email: message.email ?
        { id: message.email.id, subject: message.email.subject, brief: message.email.brief } :
        undefined,
    } ) );
  }

  private allImages (): ChatImage[] {
    return this.messages().flatMap( ( message ) => message.images );
  }

  private findImage ( id: string ): ChatImage | undefined {
    return this.allImages().find( ( image ) => image.id === id );
  }

  private findEmail ( id: string ): EmailDraft | undefined {
    return this.messages().find( ( message ) => message.email?.id === id )?.email;
  }

  private patchMessage ( index: number, patch: Partial<ChatMessage> ): void {
    this.messages.update( ( list ) => list.map( ( message, i ) => ( i === index ? { ...message, ...patch } : message ) ) );
  }

  private async refreshUsage (): Promise<void> {
    try {
      const account = await this.api.getAccount();
      this.usage.set( account.usage );
      this.canAskMaya.set( !!account.canAskMaya );
    } catch {
      // Usage is informational; the backend still enforces the limit.
    }
  }

  private handleError ( error: unknown ): void {
    if ( error instanceof ApiError && error.status === 401 ) {
      this.notice.set( 'Your session expired. Sign in again to keep going.' );
      return;
    }
    this.notice.set( error instanceof Error ? error.message : 'Something went wrong. Please try again.' );
  }

  private scrollToBottom (): void {
    setTimeout( () => {
      const element = this.scroller()?.nativeElement;
      element?.scrollTo( { top: element.scrollHeight, behavior: 'smooth' } );
    } );
  }
}
