import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ApiError, EmailCreatorApiService, Usage } from './email-creator-api.service';

const BASE = `${ environment.backendURL }/email-creator`;
const USAGE: Usage = { used: 3, limit: 10, remaining: 7 };

describe( 'EmailCreatorApiService', () => {
  let api: EmailCreatorApiService;
  let http: HttpTestingController;

  beforeEach( () => {
    TestBed.configureTestingModule( {
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getIdToken: () => Promise.resolve( 'id-token-123' ) } },
      ],
    } );
    api = TestBed.inject( EmailCreatorApiService );
    http = TestBed.inject( HttpTestingController );
  } );

  afterEach( () => http.verify() );

  /** The request goes out after the token resolves, so wait a tick before expecting it. */
  async function expectRequest ( method: string, path: string ) {
    await Promise.resolve();
    await Promise.resolve();
    const req = http.expectOne( `${ BASE }/${ path }` );
    expect( req.request.method ).toBe( method );
    expect( req.request.headers.get( 'Authorization' ) ).toBe( 'Bearer id-token-123' );
    return req;
  }

  it( 'getUsage unwraps the usage object', async () => {
    const result = api.getUsage();
    ( await expectRequest( 'GET', 'usage' ) ).flush( { usage: USAGE } );
    expect( await result ).toEqual( USAGE );
  } );

  it( 'chat posts the conversation', async () => {
    const messages = [ { role: 'user' as const, text: 'A fall sale email', images: [] } ];
    const result = api.chat( messages );
    const req = await expectRequest( 'POST', 'chat' );
    expect( req.request.body ).toEqual( { messages } );
    req.flush( { action: 'ask', reply: 'What is the offer?', usage: USAGE } );
    expect( ( await result ).action ).toBe( 'ask' );
  } );

  it( 'generate sends the brief, image refs and the email being revised', async () => {
    const result = api.generate( 'brief', [ { id: 'a', name: 'logo.png' } ], '<p>old</p>' );
    const req = await expectRequest( 'POST', 'generate' );
    expect( req.request.body ).toEqual( { brief: 'brief', images: [ { id: 'a', name: 'logo.png' } ], currentHtml: '<p>old</p>' } );
    req.flush( { email: { subject: 's', preheader: 'p', html: '<p>new</p>', notes: [] }, usage: USAGE } );
    expect( ( await result ).email.html ).toBe( '<p>new</p>' );
  } );

  it( 'hostImage posts the data URL', async () => {
    const result = api.hostImage( 'data:image/png;base64,AA' );
    const req = await expectRequest( 'POST', 'host-image' );
    expect( req.request.body ).toEqual( { dataUrl: 'data:image/png;base64,AA' } );
    req.flush( { url: 'https://cdn/x.png', expiresAt: '2026-11-13' } );
    expect( ( await result ).url ).toBe( 'https://cdn/x.png' );
  } );

  it( 'getAccount returns usage and whether Maya can write', async () => {
    const result = api.getAccount();
    ( await expectRequest( 'GET', 'usage' ) ).flush( { usage: USAGE, canAskMaya: true } );
    expect( await result ).toEqual( jasmine.objectContaining( { usage: USAGE, canAskMaya: true } ) );
  } );

  describe( 'Maya', () => {
    it( 'mayaCopy posts the request', async () => {
      const result = api.mayaCopy( 'Announce our fall menu' );
      const req = await expectRequest( 'POST', 'maya-copy' );
      expect( req.request.body ).toEqual( { request: 'Announce our fall menu' } );
      req.flush( { copy: { subject: 's', body: 'b' }, reply: 'Here you go.' } );
      expect( await result ).toEqual( jasmine.objectContaining( { copy: { subject: 's', body: 'b' }, reply: 'Here you go.' } ) );
    } );

    it( 'mayaEmail fetches the document and unwraps the email', async () => {
      const result = api.mayaEmail( 'doc/1' );
      const req = await expectRequest( 'GET', 'maya-email/doc%2F1' );
      const email = { id: 'doc/1', subject: 's', preheader: '', brief: 'b', html: '<html></html>', images: [], skippedImages: 0 };
      req.flush( { email } );
      expect( await result ).toEqual( email );
    } );
  } );

  describe( 'Outreach handoff', () => {
    it( 'handoffCheck posts the subject and HTML', async () => {
      const result = api.handoffCheck( 'Hi {{firstName}}', '<p>{{eventDate}}</p>' );
      const req = await expectRequest( 'POST', 'handoff/check' );
      expect( req.request.body ).toEqual( { subject: 'Hi {{firstName}}', html: '<p>{{eventDate}}</p>' } );
      req.flush( {
        canSendWithOutreach: true,
        fillIns: { catalyst: [ { token: 'eventDate', label: 'Event date' } ], composer: [] },
      } );
      expect( ( await result ).fillIns.catalyst[ 0 ].token ).toBe( 'eventDate' );
    } );

    it( 'handoff posts the target, email and fill-ins', async () => {
      const request = {
        target: 'catalyst' as const,
        subject: 's',
        preheader: 'p',
        html: '<p>{{eventDate}}</p>',
        fills: { eventDate: 'Nov 3' },
      };
      const result = api.handoff( request );
      const req = await expectRequest( 'POST', 'handoff' );
      expect( req.request.body ).toEqual( request );
      req.flush( { id: 'h1', url: 'https://outreach/email-processor?draftHandoff=h1' } );
      expect( await result ).toEqual( { id: 'h1', url: 'https://outreach/email-processor?draftHandoff=h1' } );
    } );
  } );

  describe( 'errors', () => {
    async function failWith ( status: number, body: object | null ): Promise<ApiError> {
      const result = api.getUsage();
      ( await expectRequest( 'GET', 'usage' ) ).flush( body, { status, statusText: 'x' } );
      try {
        await result;
      } catch ( error ) {
        return error as ApiError;
      }
      throw new Error( 'expected the request to fail' );
    }

    it( 'uses the backend message and status', async () => {
      const error = await failWith( 400, { message: 'Brief is required.' } );
      expect( error ).toEqual( jasmine.any( ApiError ) );
      expect( error.message ).toBe( 'Brief is required.' );
      expect( error.status ).toBe( 400 );
    } );

    it( 'explains a 413 in plain words', async () => {
      const error = await failWith( 413, {} );
      expect( error.message ).toBe( 'That request was too large. Try fewer or smaller images.' );
    } );

    it( 'falls back to a generic message', async () => {
      const error = await failWith( 500, null );
      expect( error.message ).toBe( 'Something went wrong. Please try again.' );
    } );

    it( 'reports a network failure as a connection problem', async () => {
      const result = api.getUsage();
      ( await expectRequest( 'GET', 'usage' ) ).error( new ProgressEvent( 'error' ), { status: 0 } );
      await expectAsync( result ).toBeRejectedWith( jasmine.objectContaining( {
        message: 'Could not reach TODD. Check your connection and try again.',
        status: 0,
      } ) );
    } );

    it( 'carries usage and the pack to offer on a 429', async () => {
      const usage = { ...USAGE, remaining: 0, pack: 'emails-5' };
      const error = await failWith( 429, { message: 'Daily limit reached.', usage } );
      expect( error.usage ).toEqual( usage );
      expect( error.pack ).toBe( 'emails-5' );
    } );

    it( 'prefers an explicit pack over the one in usage', async () => {
      const error = await failWith( 429, { message: 'x', pack: 'images-10', usage: { ...USAGE, pack: 'emails-5' } } );
      expect( error.pack ).toBe( 'images-10' );
    } );

    it( 'offers no pack when none is for sale', async () => {
      const error = await failWith( 429, { message: 'x', usage: USAGE } );
      expect( error.pack ).toBeUndefined();
    } );
  } );
} );
