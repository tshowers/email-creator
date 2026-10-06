/** Sends a GA4 event when the Google tag in index.html has loaded; a no-op on the server. */
export function track ( name: string, params: Record<string, unknown> = {} ): void {
  const gtag = typeof window === 'undefined' ? undefined : ( window as { gtag?: ( ...args: unknown[] ) => void } ).gtag;
  if ( gtag ) gtag( 'event', name, params );
}
