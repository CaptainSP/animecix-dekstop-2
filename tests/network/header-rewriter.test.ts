import { describe, it, expect } from 'vitest';
import { HEADER_RULES, matchesHeaderRule, FIREFOX_UA, CDN } from '../../src/network/header-rules';

describe('HeaderRewriterService', () => {
  it('HEADER_RULES array contains at least 2 rules', () => {
    expect(HEADER_RULES.length).toBeGreaterThanOrEqual(2);
  });

  it('sets referer and user-agent for CDN/file/* requests', () => {
    const fileRule = HEADER_RULES.find((r) =>
      r.urlPatterns.some((p) => p.includes('/file/*'))
    );
    expect(fileRule).toBeDefined();
    expect(fileRule?.headers.referer).toBe(`https://${CDN}/`);
    expect(fileRule?.headers.userAgent).toBe(FIREFOX_UA);
  });

  it('sets referer for CDN/api/* requests', () => {
    const apiRule = HEADER_RULES.find((r) =>
      r.urlPatterns.some((p) => p.includes('/api/*'))
    );
    expect(apiRule).toBeDefined();
    expect(apiRule?.headers.referer).toBe(`https://${CDN}/`);
  });

  it('HEADER_RULES contains a rule with urlPatterns including *://*.[CDN]/file/*', () => {
    const hasFilePattern = HEADER_RULES.some((r) =>
      r.urlPatterns.includes(`*://*.${CDN}/file/*`)
    );
    expect(hasFilePattern).toBe(true);
  });

  it('HEADER_RULES contains a rule with urlPatterns including *://*.[CDN]/api/*', () => {
    const hasApiPattern = HEADER_RULES.some((r) =>
      r.urlPatterns.includes(`*://*.${CDN}/api/*`)
    );
    expect(hasApiPattern).toBe(true);
  });

  it('matchesHeaderRule returns file rule for cdn.[CDN]/file/video.mp4', () => {
    const match = matchesHeaderRule(`https://cdn.${CDN}/file/video.mp4`, HEADER_RULES);
    expect(match).not.toBeNull();
    expect(match?.headers.referer).toBe(`https://${CDN}/`);
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
    const match = matchesHeaderRule(`https://cdn.${CDN}/file/test.mp4`, HEADER_RULES);
    expect(match).not.toBeNull();
    expect(match!.headers.referer).toBe(`https://${CDN}/`);
    expect(match!.headers.userAgent).toBe(FIREFOX_UA);
  });
});
