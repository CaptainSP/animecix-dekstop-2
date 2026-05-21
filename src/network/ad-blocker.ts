import { fileURLToPath } from 'url';
import * as path from 'path';
import { promises as fsp } from 'fs';
import * as ABPFilterParser from 'abp-filter-parser';
import { app } from 'electron';

// Resolve __dirname in ESM contexts
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Safely retrieves an environment variable from Vite's import.meta.env.
 * Handles cases where the variable is undefined, the literal string "undefined",
 * or an empty string. Returns the provided default value when the env var is
 * unusable. This function works even if import.meta.env itself is missing (e.g.,
 * when the file is executed directly in Electron without Vite).
 */
export function getEnvVariable(key: string, defaultValue: string): string {
  // Prefer Vite's import.meta.env, fallback to Node's process.env for Electron main.
  const envSource = (typeof import.meta !== 'undefined' && (import.meta as any).env) || (typeof process !== 'undefined' ? process.env : {});
  const raw = envSource[key];
  if (typeof raw !== 'string') return defaultValue;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'undefined') return defaultValue;
  return trimmed;
}

function hostnameMatches(hostname: string, allowed: string): boolean {
  if (!allowed) return false;
  return hostname === allowed || hostname.endsWith('.' + allowed);
}

/**
 * Pure function: returns true if the URL belongs to a first‑party domain that must never be blocked.
 * Supports exact domain and sub‑domain matches for both the main site and CDN.
 */
export function isWhitelisted(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // If the URL cannot be parsed, be safe and do not treat it as whitelisted.
    return false;
  }
  return hostnameMatches(hostname, SITE_DOMAIN) || hostnameMatches(hostname, CDN_DOMAIN);
}

// First‑party domains (derived from Vite env)
export const DEFAULT_SITE_URL = 'https://animecix.tv';
export const DEFAULT_CDN_DOMAIN = 'tau-video.xyz';

// First‑party domains (derived from Vite env with defaults)
const SITE_DOMAIN = (() => {
  try {
    const siteUrl = getEnvVariable('VITE_SITE_URL', DEFAULT_SITE_URL);
    return new URL(siteUrl).hostname;
  } catch {
    console.warn('[AdBlocker] VITE_SITE_URL not set or invalid, using default');
    return new URL(DEFAULT_SITE_URL).hostname;
  }
})();
const CDN_DOMAIN = (() => {
  try {
    const rawCdn = getEnvVariable('VITE_CDN_DOMAIN', DEFAULT_CDN_DOMAIN);
    // Strip any protocol prefix and extract hostname.
    const normalized = new URL(`https://${rawCdn.replace(/^https?:\/\//, '')}`).hostname;
    return normalized;
  } catch {
    console.warn('[AdBlocker] VITE_CDN_DOMAIN not set or invalid, using default');
    return new URL(`https://${DEFAULT_CDN_DOMAIN.replace(/^https?:\/\//, '')}`).hostname;
  }
})();

export class AdBlocker {
  private filterData: ABPFilterParser.FilterData = {};
  private filtersLoaded = false;

  constructor() {
    // No eager loading – callers decide when to load filters (e.g., on app start).
  }

  /**
   * Downloads EasyList/EasyPrivacy filter lists (if not cached) and parses them.
   * Remote URLs are the official EasyList mirrors. Cached copies are stored under the
   * userData directory (`app.getPath('userData')/adblock-filters`). If download fails,
   * the bundled copies are used as a fallback.
   */
  async loadFilterLists(): Promise<void> {
    const cacheDir = path.join(app.getPath('userData'), 'adblock-filters');
    const filterDir = path.join(__dirname, 'filter-lists'); // bundled fallback location
    // Ensure cache directory exists
    try {
      await fsp.mkdir(cacheDir, { recursive: true });
    } catch (e) {
      console.warn('[AdBlocker] Could not create cache directory:', e);
    }

    const lists = [
      {
        name: 'easylist.txt',
        url: 'https://easylist.to/easylist/easylist.txt',
      },
      {
        name: 'easyprivacy.txt',
        url: 'https://easylist.to/easylist/easyprivacy.txt',
      },
    ];
    let loadedAny = false; // track if any filter was successfully parsed

    for (const list of lists) {
      const cachedPath = path.join(cacheDir, list.name);
      let text: string | undefined;
      // Try to load from cache first
      try {
        // Ensure file exists and is fresh (7 days)
        await fsp.access(cachedPath);
        const stat = await fsp.stat(cachedPath);
        const age = Date.now() - stat.mtimeMs;
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        if (age > SEVEN_DAYS_MS) {
          // Stale cache – ignore and trigger download
          console.debug(`[AdBlocker] Cache stale for ${list.name} (age ${(age/1000/60/60/24).toFixed(1)} days); redownloading.`);
          text = undefined;
        } else {
          text = await fsp.readFile(cachedPath, 'utf8');
        }
      } catch (e) {
        // Cache miss or read error – will attempt download
        console.debug(`[AdBlocker] Cache miss or read error for ${list.name}:`, e);
      }

      // If not cached, attempt download
      if (!text) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(list.url, { signal: controller.signal });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          text = await response.text();
          // Basic validation: ensure we received a real filter list
          if (!text.includes('[Adblock') || text.length < 1000) {
            throw new Error('Invalid filter list content');
          }
          if (text) {
            await fsp.writeFile(cachedPath, text, 'utf8');
          }
        } catch (e) {
          console.warn(`[AdBlocker] Download failed for ${list.name}:`, e);
        } finally {
          clearTimeout(timeoutId);
        }
      }

      // Fallback to bundled version if still missing
      if (!text) {
        const bundledPath = path.join(filterDir, list.name);
        try {
          text = await fsp.readFile(bundledPath, 'utf8');
        } catch (e) {
          console.warn(`[AdBlocker] Could not load bundled ${list.name}:`, e);
          continue;
        }
      }
      // Parse the filter text safely
      try {
        ABPFilterParser.parse(text, this.filterData);
        loadedAny = true;
      } catch (e) {
        console.warn(`[AdBlocker] Failed to parse ${list.name}:`, e);
      }
    }

    this.filtersLoaded = loadedAny;
  }

  /**
   * Load test filter rules directly from a string (for unit tests).
   * This avoids needing the bundled EasyList files in the test environment.
   */
  loadTestFilters(filterText: string): void {
    this.filterData = {};
    ABPFilterParser.parse(filterText, this.filterData);
    this.filtersLoaded = true;
  }

  /**
   * Returns true if the URL should be blocked.
   * First‑party whitelisting and safe‑guarding against malformed URLs are applied.
   */
  shouldBlock(url: string): boolean {
    // Whitelist: never block first‑party domains
    if (isWhitelisted(url)) {
      return false;
    }

    // If filters are not loaded, be permissive
    if (!this.filtersLoaded) {
      return false;
    }

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      // If we cannot parse the URL, do not block – better safe than crash
      return false;
    }

    try {
      // ABP parser can use the domain option for correct matching of rules that rely on domain context.
      return ABPFilterParser.matches(this.filterData, url, { domain: hostname });
    } catch {
      // Defensive: malformed filter data should not crash the app.
      return false;
    }
  }
}
