import { describe, it, expect } from 'vitest';
import { isTitlePageUrl } from '../../src/network/batch-download';

describe('batch-download injection', () => {
  it('returns true for title list pages', () => {
    expect(
      isTitlePageUrl('https://animecix.tv/titles/12805/hell-mode-some-title')
    ).toBe(true);
  });

  it('returns true for plain title id pages', () => {
    expect(isTitlePageUrl('https://animecix.tv/titles/12805')).toBe(true);
  });

  it('returns false for title edit pages', () => {
    expect(
      isTitlePageUrl('https://animecix.tv/titles/12805/hell-mode/edit')
    ).toBe(false);
  });

  it('returns false for non-title pages', () => {
    expect(isTitlePageUrl('https://animecix.tv/')).toBe(false);
    expect(isTitlePageUrl('https://animecix.tv/browse')).toBe(false);
    expect(isTitlePageUrl('https://animecix.tv/people/42/some-name')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(isTitlePageUrl('not-a-url')).toBe(false);
  });
});
