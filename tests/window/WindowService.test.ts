import { describe, it, expect, vi } from 'vitest';

// WindowService imports electron at module top-level; in the node test env we
// only exercise the pure buildBrowserUserAgent helper, so a bare mock is enough.
vi.mock('electron', () => ({
  app: {},
  BrowserWindow: class {},
  screen: {},
  shell: {},
}));

import { buildBrowserUserAgent } from '../../src/window/WindowService';

describe('WindowService', () => {
  it.todo('creates frameless BrowserWindow (SHELL-01)');
  it.todo('loads animecix.tv URL (SHELL-03)');
  it.todo('restores saved window bounds on creation');
  it.todo('persists window bounds on resize/move');
  it.todo('sets contextIsolation:true and nodeIntegration:false');
});

describe('buildBrowserUserAgent (Turnstile-safe UA)', () => {
  // Representative Electron 41 default UA (Chromium 136) with app-name token.
  const ELECTRON_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) AnimeciX/0.1.26 Chrome/136.0.0.0 Electron/41.0.0 Safari/537.36';

  it('strips the Electron token', () => {
    expect(buildBrowserUserAgent(ELECTRON_UA)).not.toMatch(/Electron/i);
  });

  it('strips the app-name token', () => {
    expect(buildBrowserUserAgent(ELECTRON_UA)).not.toMatch(/AnimeciX/i);
  });

  it('keeps a plain Chrome / Safari signature', () => {
    const ua = buildBrowserUserAgent(ELECTRON_UA);
    expect(ua).toMatch(/Chrome\//);
    expect(ua).toMatch(/Safari\/537\.36/);
    expect(ua).toContain('(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
  });

  it('is a no-op on an already-plain Chrome UA', () => {
    const chromeUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
    expect(buildBrowserUserAgent(chromeUa)).toBe(chromeUa);
  });
});
