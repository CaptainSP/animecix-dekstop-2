import {
  HEADER_RULES,
  matchesHeaderRule,
  CDN_ACAO_URL_PATTERNS,
} from './header-rules';

/**
 * INTENTIONAL — DO NOT REMOVE: CDN header rewriting is the designed auth mechanism.
 * Without these headers, video playback fails with 403. This is not a hack.
 * See OPEN-SOURCE-AUDIT.md "Intentional Bypasses §5".
 *
 * Registers the onBeforeSendHeaders handler for CDN header rewriting.
 * This is separate from onBeforeRequest and can coexist with it.
 */
export function setupHeaderRewriter(): void {
  // Guard: only run in Electron environment
  let session: typeof import('electron').Session;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron');
    session = electron.session;
  } catch {
    // Not in Electron (e.g., tests) — skip registration
    return;
  }

  // Build a combined filter covering all tau-video.xyz patterns
  const urlPatterns = HEADER_RULES.flatMap((rule) => rule.urlPatterns);

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: urlPatterns },
    (
      details: Electron.OnBeforeSendHeadersListenerDetails,
      callback: (response: Electron.BeforeSendResponse) => void
    ) => {
      const rule = matchesHeaderRule(details.url, HEADER_RULES);
      const requestHeaders = { ...details.requestHeaders };

      if (rule) {
        if (rule.headers.referer) {
          requestHeaders['Referer'] = rule.headers.referer;
        }
        if (rule.headers.userAgent) {
          requestHeaders['User-Agent'] = rule.headers.userAgent;
        }
      }

      callback({ requestHeaders });
    }
  );

  // INTENTIONAL CORS override for the built-in player. The video CDN returns
  // Access-Control-Allow-Origin: null/a specific origin that doesn't match the
  // player origin, so the browser blocks the media response without this.
  // DO NOT REMOVE — video playback breaks without this.
  //
  // SCOPED to the video CDN via { urls: CDN_ACAO_URL_PATTERNS }. It used to be
  // registered globally, which forced ACAO '*' on EVERY response including
  // challenges.cloudflare.com — that broke Cloudflare Turnstile, because a
  // wildcard ACAO is invalid on credentialed CORS responses. Keep it scoped.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: CDN_ACAO_URL_PATTERNS },
    (
      details: Electron.OnHeadersReceivedListenerDetails,
      callback: (response: Electron.HeadersReceivedResponse) => void
    ) => {
      const responseHeaders = { ...details.responseHeaders };

      // Find existing ACAO header (case-insensitive)
      const acaoKey = Object.keys(responseHeaders).find(
        (k) => k.toLowerCase() === 'access-control-allow-origin'
      );
      const acaoValue = acaoKey ? responseHeaders[acaoKey]?.[0] : undefined;

      // Only override if the header is missing, 'null', or a specific origin that isn't '*'
      // Don't touch it if it's already '*' (avoids duplicate '*, *')
      if (acaoValue !== '*') {
        if (acaoKey) {
          responseHeaders[acaoKey] = ['*'];
        } else {
          responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        }
      }

      callback({ responseHeaders });
    }
  );
}
