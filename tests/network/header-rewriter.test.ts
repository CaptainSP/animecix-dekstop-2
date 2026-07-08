import { describe, it, expect } from 'vitest';
import {
  HEADER_RULES,
  matchesHeaderRule,
  FIREFOX_UA,
  CDN_ACAO_URL_PATTERNS,
  isVideoCdnUrl,
} from '../../src/network/header-rules';

describe('HeaderRewriterService', () => {
  it('HEADER_RULES array contains at least 2 rules', () => {
    expect(HEADER_RULES.length).toBeGreaterThanOrEqual(2);
  });

  it('sets referer and user-agent for tau-video.xyz/file/* requests', () => {
    const fileRule = HEADER_RULES.find((r) =>
      r.urlPatterns.some((p) => p.includes('/file/*'))
    );
    expect(fileRule).toBeDefined();
    expect(fileRule?.headers.referer).toBe('https://tau-video.xyz/');
    expect(fileRule?.headers.userAgent).toBe(FIREFOX_UA);
  });

  it('sets referer for tau-video.xyz/api/* requests', () => {
    const apiRule = HEADER_RULES.find((r) =>
      r.urlPatterns.some((p) => p.includes('/api/*'))
    );
    expect(apiRule).toBeDefined();
    expect(apiRule?.headers.referer).toBe('https://tau-video.xyz/');
  });

  it('HEADER_RULES contains a rule with urlPatterns including *://*.tau-video.xyz/file/*', () => {
    const hasFilePattern = HEADER_RULES.some((r) =>
      r.urlPatterns.includes('*://*.tau-video.xyz/file/*')
    );
    expect(hasFilePattern).toBe(true);
  });

  it('HEADER_RULES contains a rule with urlPatterns including *://*.tau-video.xyz/api/*', () => {
    const hasApiPattern = HEADER_RULES.some((r) =>
      r.urlPatterns.includes('*://*.tau-video.xyz/api/*')
    );
    expect(hasApiPattern).toBe(true);
  });

  it('matchesHeaderRule returns file rule for cdn.tau-video.xyz/file/video.mp4', () => {
    const match = matchesHeaderRule('https://cdn.tau-video.xyz/file/video.mp4', HEADER_RULES);
    expect(match).not.toBeNull();
    expect(match?.headers.referer).toBe('https://tau-video.xyz/');
    expect(match?.headers.userAgent).toBe(FIREFOX_UA);
  });

  it('matchesHeaderRule returns null for animecix.tv/api/auth (no match)', () => {
    const match = matchesHeaderRule('https://animecix.tv/api/auth', HEADER_RULES);
    expect(match).toBeNull();
  });

  it('does not modify headers for animecix.tv requests', () => {
    const match = matchesHeaderRule('https://animecix.tv/watch', HEADER_RULES);
    expect(match).toBeNull();
  });

  it('applyHeaders builds correct referer and user-agent for matched rules', () => {
    const match = matchesHeaderRule('https://cdn.tau-video.xyz/file/test.mp4', HEADER_RULES);
    expect(match).not.toBeNull();
    expect(match!.headers.referer).toBe('https://tau-video.xyz/');
    expect(match!.headers.userAgent).toBe(FIREFOX_UA);
  });
});

describe('ACAO override scope (Turnstile-safe)', () => {
  // Locks the scope so a future edit cannot silently re-globalize the override
  // and break Cloudflare Turnstile again.
  it('CDN_ACAO_URL_PATTERNS is scoped to the CDN only', () => {
    expect(CDN_ACAO_URL_PATTERNS).toEqual(['*://*.tau-video.xyz/*']);
  });

  it('isVideoCdnUrl is true for CDN file and api URLs', () => {
    expect(isVideoCdnUrl('https://cdn.tau-video.xyz/file/x.ts')).toBe(true);
    expect(isVideoCdnUrl('https://tau-video.xyz/api/video/1')).toBe(true);
  });

  it('isVideoCdnUrl is false for challenges.cloudflare.com (Turnstile must not be rewritten)', () => {
    expect(
      isVideoCdnUrl('https://challenges.cloudflare.com/turnstile/v0/api.js')
    ).toBe(false);
  });

  it('isVideoCdnUrl is false for the site origin and malformed input', () => {
    expect(isVideoCdnUrl('https://animecix.tv/register')).toBe(false);
    expect(isVideoCdnUrl('not a url')).toBe(false);
  });
});
