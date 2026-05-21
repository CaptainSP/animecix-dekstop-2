import { AdBlocker, isWhitelisted, getEnvVariable, DEFAULT_SITE_URL } from './ad-blocker';
import { getPlayerBaseUrl } from '../player/tau-localhost';

// Resolve the API base URL safely, falling back to the default site URL. Ensure no trailing slash.
const API_BASE_URL = getEnvVariable('VITE_API_BASE_URL', DEFAULT_SITE_URL).replace(/\/$/, '');
// First‑party domains are resolved inside ad-blocker with safe defaults.
// This file now relies on the shared `isWhitelisted` utility.
// No local constants are needed.

/**
 * Pure function: returns true if the URL should be redirected from the
 * tau-video.xyz embed page to the local tau-player:// protocol handler.
 * Only matches https://tau-video.xyz/embed/* and https://tau-video.xyz/embed-2/*
 */
export function isIframeRedirect(url: string): boolean {
  const base = API_BASE_URL;
  return (
    url.startsWith(base + '/embed/') ||
    url.startsWith(base + '/embed-2/')
  );
}

/**
 * Pure function: converts a tau-video.xyz embed URL to a tau-player://bundle URL.
 * Preserves the full pathname and query string.
 *
 * e.g. https://tau-video.xyz/embed/abc123?vid=1 -> tau-player://bundle/embed/abc123?vid=1
 */
export function buildRedirectUrl(url: string): string {
  const parsed = new URL(url);
  const base = getPlayerBaseUrl();
  if (base) {
    return `${base}${parsed.pathname}${parsed.search}`;
  }
  return `tau-player://bundle${parsed.pathname}${parsed.search}`;
}

/**
 * Returns true if the URL belongs to a first-party domain that must not be blocked.
 */
function isFirstParty(url: string): boolean {
  // Delegates to the centralized whitelist logic.
  return isWhitelisted(url);
}

/**
 * Registers the single combined onBeforeRequest handler on the default session.
 * Order of checks:
 *   1. Iframe redirect (tau-video.xyz/embed/* -> tau-player://bundle/*)
 *   2. First-party whitelist (animecix.tv, tau-video.xyz) -> pass through
 *   3. Ad blocker -> cancel if matched
 *   4. Pass through
 *
 * CRITICAL: Electron replaces the handler on each call to onBeforeRequest.
 * Only ONE handler must be registered — this function is the single registration point.
 */
export function setupRequestInterception(adBlocker: AdBlocker): void {
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

  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (
      details: Electron.OnBeforeRequestListenerDetails,
      callback: (response: Electron.Response) => void
    ) => {
      const { url } = details;

      // 1. Iframe redirect
      if (isIframeRedirect(url)) {
        callback({ redirectURL: buildRedirectUrl(url) });
        return;
      }

      // 2. First-party whitelist — never block animecix.tv or tau-video.xyz
      if (isFirstParty(url)) {
        callback({});
        return;
      }

      // 3. Ad blocker
      if (adBlocker && typeof adBlocker.shouldBlock === 'function' && adBlocker.shouldBlock(url)) {
        callback({ cancel: true });
        return;
      }

      // 4. Pass through
      callback({});
    }
  );
}
