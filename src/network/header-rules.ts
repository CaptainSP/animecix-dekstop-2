import { getEnvVariable } from './ad-blocker';

export interface HeaderRule {
  urlPatterns: string[];
  headers: {
    referer?: string;
    userAgent?: string;
  };
  purpose: string;
}

export const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0';

export const DEFAULT_CDN = 'tau-video.xyz';
export const CDN = getEnvVariable('VITE_CDN_DOMAIN', DEFAULT_CDN).replace(/^https?:\/\//, '');

export const HEADER_RULES: HeaderRule[] = [
  {
    urlPatterns: [`*://*.${CDN}/file/*`],
    headers: { referer: `https://${CDN}/`, userAgent: FIREFOX_UA },
    purpose: 'Video file CDN -- needs referer from embed page and Firefox UA to authorize',
  },
  {
    urlPatterns: [`*://*.${CDN}/api/*`],
    headers: { referer: `https://${CDN}/` },
    purpose: 'API requests -- needs referer for auth',
  },
];

/**
 * Pure function: check if a URL matches any rule (for testing and header rewriter).
 * Converts Electron URL pattern wildcards to regex and tests the given URL.
 */
// Cache compiled regexes for patterns to avoid repeated RegExp construction
const regexCache = new Map<string, RegExp>();

export function matchesHeaderRule(
  url: string,
  rules: HeaderRule[]
): HeaderRule | null {
  for (const rule of rules) {
    for (const pattern of rule.urlPatterns) {
      let regex = regexCache.get(pattern);
      if (!regex) {
        // Convert Electron URL pattern to regex.
        // Steps:
        //   1. Protect all * chars with a placeholder
        //   2. Escape all regex special chars (including dots)
        //   3. Replace scheme wildcard placeholder (___STAR___://) with [a-z]+://
        //   4. Replace remaining placeholders with .*
        //   5. Make subdomain wildcard optional (*.domain matches bare domain too)
        const regexStr =
          '^' +
          pattern
            .replace(/\*/g, '___STAR___')
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/___STAR___:\/\//g, '[a-z]+://')
            .replace(/___STAR___/g, '.*')
            .replace(/:\/\/\.\*\\\./g, '://(.*\\.)?') +
          '$';
        regex = new RegExp(regexStr);
        regexCache.set(pattern, regex);
      }
      if (regex.test(url)) return rule;
    }
  }
  return null;
}
