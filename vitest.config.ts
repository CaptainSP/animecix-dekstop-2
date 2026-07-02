import { defineConfig } from 'vitest/config';

// Public, non-secret defaults injected into import.meta.env for the test run.
// The suite asserts these exact values (animecix.tv, tau-video.xyz, the public
// Discord client id), so tests must stay deterministic regardless of whether a
// local .env or CI secrets are present. This keeps the suite green on fork PRs,
// where GitHub does not expose repository secrets. Real .env / process.env
// values still win when they are set (Vite loads .env after this).
const TEST_ENV = {
  VITE_API_BASE_URL: 'https://tau-video.xyz',
  VITE_CDN_DOMAIN: 'tau-video.xyz',
  VITE_SITE_URL: 'https://animecix.tv',
  VITE_DISCORD_CLIENT_ID: '921684324141641728',
};

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    globals: true,
    env: TEST_ENV,
  },
});
