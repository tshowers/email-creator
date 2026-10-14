import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface Usage {
  used: number;
  limit: number;
  remaining: number;
  /** Prepaid emails, spent once today's free ones are gone (never expire). */
  credits?: number;
  hostedImageCredits?: number;
  /** Credit packs to offer when the free allowance and credits run out. */
  pack?: string;
  hostedImagePack?: string;
}

/** An attached image as the backend sees it: metadata plus an optional small thumbnail. */
export interface ImageRef {
  id: string;
  name?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
}

/** What the backend sees of the conversation - text, image references, and generated-email summaries. */
export interface ChatMessagePayload {
  role: 'user' | 'assistant';
  text: string;
  images: ImageRef[];
  email?: { id: string; subject: string; brief: string };
}

export interface ChatTurnResponse {
  action: 'ask' | 'generate' | 'limit';
  reply: string;
  brief?: string;
  imageIds?: string[];
  baseEmailId?: string | null;
  usage: Usage;
}

export interface GeneratedEmail {
  subject: string;
  preheader: string;
  /** Uses src="todd-image:<id>" for attached images; see utils/email-export. */
  html: string;
  notes: string[];
}

export interface GenerateResponse {
  email: GeneratedEmail;
  usage: Usage;
}

export interface HostedImage {
  url: string;
  expiresAt: string;
}

export class ApiError extends Error {
  /** `pack`: the credit pack that would let this request through (429s only). */
  constructor ( message: string, readonly status: number, readonly usage?: Usage, readonly pack?: string ) {
    super( message );
  }
}

/** The words Maya wrote for an email ("Ask Maya to write it"); TODD designs them. */
export interface MayaCopy {
  subject: string;
  body: string;
  callToAction?: { label: string; url?: string };
  audience?: string;
  tone?: string;
}

/** An email Maya designed, opened here to revise ("Edit in Email Creator"). */
export interface MayaEmail {
  id: string;
  subject: string;
  preheader: string;
  brief: string;
  /** Library images are already swapped for todd-image:<id> placeholders. */
  html: string;
  images: { id: string; name: string; dataUrl: string }[];
  /** Images that couldn't be brought along; the next revision drops them. */
  skippedImages: number;
}

export type HandoffTarget = 'catalyst' | 'composer';

export interface FillIn {
  token: string;
  label: string;
}

export interface HandoffCheck {
  canSendWithOutreach: boolean;
  fillIns: Record<HandoffTarget, FillIn[]>;
}

export interface HandoffRequest {
  target: HandoffTarget;
  subject: string;
  preheader: string;
  html: string;
  fills: Record<string, string>;
}

@Injectable( { providedIn: 'root' } )
export class EmailCreatorApiService {
  private readonly http = inject( HttpClient );
  private readonly auth = inject( AuthService );
  private readonly baseUrl = `${ environment.backendURL }/email-creator`;

  async getUsage (): Promise<Usage> {
    const result = await this.request<{ usage: Usage }>( 'GET', 'usage' );
    return result.usage;
  }

  /** Usage plus whether this workspace can ask Maya to write (the Maya subscription). */
  getAccount (): Promise<{ usage: Usage; canAskMaya: boolean }> {
    return this.request<{ usage: Usage; canAskMaya: boolean }>( 'GET', 'usage' );
  }

  /** Maya writes the copy; it doesn't use one of the day's emails. */
  mayaCopy ( request: string ): Promise<{ copy: MayaCopy; reply: string }> {
    return this.request<{ copy: MayaCopy; reply: string }>( 'POST', 'maya-copy', { request } );
  }

  async mayaEmail ( documentId: string ): Promise<MayaEmail> {
    const result = await this.request<{ email: MayaEmail }>( 'GET', `maya-email/${ encodeURIComponent( documentId ) }` );
    return result.email;
  }

  chat ( messages: ChatMessagePayload[] ): Promise<ChatTurnResponse> {
    return this.request<ChatTurnResponse>( 'POST', 'chat', { messages } );
  }

  generate ( brief: string, images: ImageRef[], currentHtml?: string ): Promise<GenerateResponse> {
    return this.request<GenerateResponse>( 'POST', 'generate', { brief, images, currentHtml } );
  }

  hostImage ( dataUrl: string ): Promise<HostedImage> {
    return this.request<HostedImage>( 'POST', 'host-image', { dataUrl } );
  }

  /** Can this workspace send with Outreach, and what must be filled in first? */
  handoffCheck ( subject: string, html: string ): Promise<HandoffCheck> {
    return this.request<HandoffCheck>( 'POST', 'handoff/check', { subject, html } );
  }

  /** Hands the finished email to Catalyst (many) or the Email Composer (one). */
  handoff ( request: HandoffRequest ): Promise<{ id: string; url: string }> {
    return this.request<{ id: string; url: string }>( 'POST', 'handoff', request );
  }

  /**
   * Opens Stripe Checkout for a credit pack in `tab` (opened synchronously in
   * the click, so the browser allows it) - or this tab if it was blocked.
   * Credits are added by Stripe's webhook, so callers poll getUsage().
   */
  async buyCredits ( pack: string, tab: Window | null ): Promise<void> {
    const token = await this.auth.getIdToken();
    const headers = new HttpHeaders( { Authorization: `Bearer ${ token }` } );
    let url = '';
    try {
      const res = await firstValueFrom( this.http.post<{ url: string }>( `${ environment.backendURL }/billing/checkout-credits`, {
        pack,
        returnUrl: `${ location.origin }${ location.pathname }`,
      }, { headers } ) );
      url = res.url;
    } catch ( error ) {
      tab?.close();
      const message = error instanceof HttpErrorResponse ? error.error?.message : '';
      throw new Error( message || 'Checkout couldn’t start. Please try again.' );
    }
    if ( tab && !tab.closed ) tab.location.href = url;
    else location.assign( url );
  }

  private async request<T> ( method: 'GET' | 'POST', path: string, body?: unknown ): Promise<T> {
    const token = await this.auth.getIdToken();
    const headers = new HttpHeaders( { Authorization: `Bearer ${ token }` } );
    const url = `${ this.baseUrl }/${ path }`;
    try {
      return await firstValueFrom(
        method === 'GET' ? this.http.get<T>( url, { headers } ) : this.http.post<T>( url, body, { headers } ),
      );
    } catch ( error ) {
      if ( error instanceof HttpErrorResponse ) {
        const message = error.status === 0 ?
          'Could not reach TODD. Check your connection and try again.' :
          error.status === 413 ?
            'That request was too large. Try fewer or smaller images.' :
            error.error?.message || 'Something went wrong. Please try again.';
        throw new ApiError( message, error.status, error.error?.usage, error.error?.pack || error.error?.usage?.pack );
      }
      throw error;
    }
  }
}
