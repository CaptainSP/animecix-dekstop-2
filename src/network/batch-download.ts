import type { WebContents } from 'electron';
import { BATCH_DOWNLOAD_SCRIPT } from './batch-download-script';

// Batch download ("Toplu İndir") injection.
//
// The site is a client-rendered Angular SPA, so its component state is not
// reachable from outside. Instead we inject a self-contained script (see
// batch-download-script.ts) into the title page that:
//   1. Adds a floating "Toplu İndir" button.
//   2. Fetches the season/episode list from the site's own API
//      (/secure/titles/{id}) — same-origin fetch carries the session cookie,
//      so the injected script sees exactly what the logged-in site renders.
//   3. Shows a season-by-season episode picker with per-season and global
//      "select all" checkboxes.
//   4. For each selected episode, resolves the tau video id from the embed
//      URL, fetches video data via window.animecix.fetchVideoData (main
//      process fetch, no CORS), picks the best MP4 quality, and enqueues the
//      download via window.animecix.downloadVideo.
//
// Injection points:
//   - did-finish-load: initial page load (SSR shell).
//   - did-navigate: full navigations between routes.
//   - did-navigate-in-page: Angular router pushState navigations (SPA).
//
// The script is idempotent (guards on window.__animecixBatchDownload), so
// re-injecting after every navigation is safe.

/** Pure function: returns true when the URL is an animecix.tv title page. */
export function isTitlePageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return /^\/titles\/\d+/.test(path) && !path.includes('/edit');
  } catch {
    return false;
  }
}

/**
 * Registers navigation listeners that inject the batch download script into
 * title pages. Safe to call once per window; the script re-checks the URL on
 * every navigation.
 */
export function setupBatchDownloadInjection(webContents: WebContents): void {
  const inject = (): void => {
    if (!webContents.isDestroyed() && isTitlePageUrl(webContents.getURL())) {
      // Non-fatal: injection may fail on in-flight navigations.
      webContents.executeJavaScript(BATCH_DOWNLOAD_SCRIPT, true).catch(() => { /* ignore */ });
    }
  };

  webContents.on('did-finish-load', inject);
  webContents.on('did-navigate', inject);
  webContents.on('did-navigate-in-page', inject);
}
