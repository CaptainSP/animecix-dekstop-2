import { describe, it, expect } from 'vitest';
import { shouldAnnounce, WHATS_NEW_SCRIPT } from './whats-new';

describe('whats-new announcement gating', () => {
  it('never announces on a fresh install', () => {
    expect(shouldAnnounce(true, null, '0.1.27')).toBe(false);
    expect(shouldAnnounce(true, '0.1.26', '0.1.27')).toBe(false);
  });

  it('announces when an existing install updates to a new version', () => {
    expect(shouldAnnounce(false, '0.1.26', '0.1.27')).toBe(true);
  });

  it('announces when an existing install has no recorded version (pre-feature DB)', () => {
    expect(shouldAnnounce(false, null, '0.1.27')).toBe(true);
  });

  it('does not re-announce for the same version', () => {
    expect(shouldAnnounce(false, '0.1.27', '0.1.27')).toBe(false);
  });
});

describe('whats-new injected script', () => {
  it('parses as valid JavaScript (no template-literal interpolation leaks)', () => {
    expect(() => new Function(WHATS_NEW_SCRIPT)).not.toThrow();
  });

  it('contains the batch download announcement copy', () => {
    expect(WHATS_NEW_SCRIPT).toContain('Toplu \u0130ndir');
    expect(WHATS_NEW_SCRIPT).toContain('Harika, anlad\u0131m');
  });
});
