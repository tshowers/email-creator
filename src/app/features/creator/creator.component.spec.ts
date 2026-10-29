import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ApiError, EmailCreatorApiService, Usage } from '../../services/email-creator-api.service';
import { PlatformMenuComponent } from '../../shared/platform-menu/platform-menu.component';
import { MAYA_PRICING_URL } from '../../utils/maya';
import { CreatorComponent } from './creator.component';

@Component( { selector: 'app-platform-menu', standalone: true, template: '' } )
class PlatformMenuStubComponent {
  @Input() isLoggedIn = false;
  @Input() userName = '';
  @Input() userEmail = '';
  @Output() signIn = new EventEmitter<void>();
  @Output() signOut = new EventEmitter<void>();
}

const USAGE: Usage = { used: 1, limit: 10, remaining: 9 };
const EMAIL_HTML = '<!DOCTYPE html><html><body><img src="todd-image:m1" alt="logo"><p>Fall loaves</p></body></html>';

function pngDataUrl (): string {
  const canvas = document.createElement( 'canvas' );
  canvas.width = 40;
  canvas.height = 20;
  canvas.getContext( '2d' )!.fillRect( 0, 0, 40, 20 );
  return canvas.toDataURL( 'image/png' );
}

describe( 'CreatorComponent and Maya', () => {
  let fixture: ComponentFixture<CreatorComponent>;
  let component: CreatorComponent;
  let api: jasmine.SpyObj<EmailCreatorApiService>;
  const startUrl = location.pathname + location.search;

  async function create ( { canAskMaya = true, query = '' } = {} ): Promise<void> {
    api.getAccount.and.resolveTo( { usage: USAGE, canAskMaya } );
    history.replaceState( history.state, '', location.pathname + query );
    fixture = TestBed.createComponent( CreatorComponent );
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Lets queued promises (API calls, image decoding) finish, then re-renders. */
  async function settle (): Promise<void> {
    for ( let i = 0; i < 5; i++ ) {
      await new Promise( ( resolve ) => setTimeout( resolve, 20 ) );
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  function el<T extends Element = HTMLElement> ( selector: string ): T | null {
    return fixture.nativeElement.querySelector( selector );
  }

  beforeEach( async () => {
    api = jasmine.createSpyObj<EmailCreatorApiService>( 'EmailCreatorApiService', [
      'getAccount', 'getUsage', 'chat', 'generate', 'mayaCopy', 'mayaEmail', 'hostImage', 'handoffCheck', 'handoff', 'buyCredits',
    ] );
    api.chat.and.resolveTo( { action: 'generate', reply: 'Designing it now.', brief: 'The brief', imageIds: [], baseEmailId: null, usage: USAGE } );
    api.generate.and.resolveTo( { email: { subject: 'Fall loaves are here', preheader: 'p', html: '<html><body>x</body></html>', notes: [] }, usage: USAGE } );

    await TestBed.configureTestingModule( {
      imports: [ CreatorComponent ],
      providers: [
        provideRouter( [] ),
        { provide: EmailCreatorApiService, useValue: api },
        { provide: AuthService, useValue: { user: signal( { displayName: 'Ty', email: 'ty@example.com' } ), signIn: jasmine.createSpy( 'signIn' ), signOut: jasmine.createSpy( 'signOut' ) } },
      ],
    } )
      .overrideComponent( CreatorComponent, { remove: { imports: [ PlatformMenuComponent ] }, add: { imports: [ PlatformMenuStubComponent ] } } )
      .compileComponents();
  } );

  afterEach( () => history.replaceState( history.state, '', startUrl ) );

  describe( 'Ask Maya to write it', () => {
    it( 'sends the request to Maya, shows her copy as hers, and TODD designs it', async () => {
      api.mayaCopy.and.resolveTo( {
        copy: { subject: 'Fall loaves are here', body: 'Hi {{firstName}}, pumpkin sourdough is back.', callToAction: { label: 'Order ahead' } },
        reply: 'I kept it short.',
      } );
      await create();
      component.draft.set( 'Announce our fall menu' );
      fixture.detectChanges();
      el<HTMLButtonElement>( 'button.ask-maya' )!.click();
      await settle();

      expect( api.mayaCopy ).toHaveBeenCalledOnceWith( 'Announce our fall menu' );
      const payload = api.chat.calls.mostRecent().args[ 0 ];
      expect( payload.map( ( message ) => message.role ) ).toEqual( [ 'user', 'user' ] );
      expect( payload[ 0 ].text ).toBe( 'Announce our fall menu' );
      expect( payload[ 1 ].text ).toContain( 'The Marketing Assistant wrote this copy' );
      expect( payload[ 1 ].text ).toContain( 'Hi {{firstName}}, pumpkin sourdough is back.' );
      expect( api.generate ).toHaveBeenCalledTimes( 1 );

      expect( el( '.row-maya .todd-text' )!.textContent ).toContain( 'I kept it short.' );
      expect( el( '.maya-subject' )!.textContent ).toContain( 'Fall loaves are here' );
      expect( el( '.maya-cta' )!.textContent ).toContain( 'Order ahead' );
      expect( component.draft() ).toBe( '' );
    } );

    it( 'needs something typed first', async () => {
      await create();
      expect( el<HTMLButtonElement>( 'button.ask-maya' )!.disabled ).toBeTrue();
      await component.askMaya();
      expect( api.mayaCopy ).not.toHaveBeenCalled();
    } );

    it( 'links to Maya\'s pricing when the workspace doesn\'t have Maya', async () => {
      await create( { canAskMaya: false } );
      expect( el( 'button.ask-maya' ) ).toBeNull();
      expect( el<HTMLAnchorElement>( 'a.ask-maya' )!.href ).toBe( MAYA_PRICING_URL );
    } );

    it( 'explains a refusal and switches to the pricing link', async () => {
      api.mayaCopy.and.rejectWith( new ApiError( 'The Marketing Assistant writes emails for workspaces with the Marketing Assistant app subscription.', 403 ) );
      await create();
      component.draft.set( 'Announce our fall menu' );
      await component.askMaya();
      fixture.detectChanges();

      expect( component.notice() ).toContain( 'Marketing Assistant app subscription' );
      expect( api.chat ).not.toHaveBeenCalled();
      expect( el( 'a.ask-maya' ) ).not.toBeNull();
      expect( component.thinking() ).toBeFalse();
    } );
  } );

  describe( 'Edit in Email Creator (?mayaEmail=)', () => {
    it( 'opens Maya\'s design with its images and clears the link', async () => {
      api.mayaEmail.and.resolveTo( {
        id: 'd1', subject: 'Fall loaves', preheader: 'Pumpkin is back', brief: 'Maya\'s brief', html: EMAIL_HTML,
        images: [ { id: 'm1', name: 'logo.png', dataUrl: pngDataUrl() } ], skippedImages: 0,
      } );
      await create( { query: '?mayaEmail=d1' } );
      await settle();

      expect( api.mayaEmail ).toHaveBeenCalledOnceWith( 'd1' );
      expect( location.search ).toBe( '' );
      const email = component.selectedEmail()!;
      expect( email ).toEqual( jasmine.objectContaining( { subject: 'Fall loaves', preheader: 'Pumpkin is back', html: EMAIL_HTML, brief: 'Maya\'s brief' } ) );
      expect( component.messages()[ 0 ].images.map( ( image ) => image.id ) ).toEqual( [ 'm1' ] );
      expect( component.messages()[ 0 ].images[ 0 ].dataUrl.startsWith( 'data:image/png' ) ).toBeTrue();
      expect( component.notice() ).toBe( '' );
    } );

    it( 'revises it like any other email: the current HTML and its images go to the generator', async () => {
      api.mayaEmail.and.resolveTo( {
        id: 'd1', subject: 'Fall loaves', preheader: '', brief: 'b', html: EMAIL_HTML,
        images: [ { id: 'm1', name: 'logo.png', dataUrl: pngDataUrl() } ], skippedImages: 0,
      } );
      await create( { query: '?mayaEmail=d1' } );
      await settle();
      const opened = component.selectedEmail()!;
      api.chat.and.resolveTo( { action: 'generate', reply: 'Shortening it.', brief: 'Shorter', imageIds: [], baseEmailId: opened.id, usage: USAGE } );

      component.draft.set( 'Shorter' );
      await component.send();

      const payload = api.chat.calls.mostRecent().args[ 0 ];
      expect( payload[ 1 ].email ).toEqual( { id: opened.id, subject: 'Fall loaves', brief: 'b' } );
      const [ brief, images, currentHtml ] = api.generate.calls.mostRecent().args;
      expect( brief ).toBe( 'Shorter' );
      expect( currentHtml ).toBe( EMAIL_HTML );
      expect( images.map( ( image ) => image.id ) ).toEqual( [ 'm1' ] );
    } );

    it( 'says when images couldn\'t come along', async () => {
      api.mayaEmail.and.resolveTo( {
        id: 'd1', subject: 'Fall loaves', preheader: '', brief: '', html: EMAIL_HTML,
        images: [ { id: 'm2', name: 'broken.png', dataUrl: 'data:image/png;base64,AAAA' } ], skippedImages: 1,
      } );
      await create( { query: '?mayaEmail=d1' } );
      await settle();

      expect( component.notice() ).toContain( '2 images from the Marketing Assistant\'s email couldn\'t be brought along' );
      expect( component.selectedEmail()!.brief ).toBe( 'The email "Fall loaves" that the Marketing Assistant designed.' );
    } );

    it( 'shows the error when the email can\'t be opened', async () => {
      api.mayaEmail.and.rejectWith( new ApiError( 'That email wasn\'t found in your Docs.', 404 ) );
      await create( { query: '?mayaEmail=missing' } );
      await settle();

      expect( component.notice() ).toBe( 'That email wasn\'t found in your Docs.' );
      expect( component.messages() ).toEqual( [] );
      expect( component.thinking() ).toBeFalse();
    } );

    it( 'does nothing without the link', async () => {
      await create();
      await settle();
      expect( api.mayaEmail ).not.toHaveBeenCalled();
    } );
  } );
} );
