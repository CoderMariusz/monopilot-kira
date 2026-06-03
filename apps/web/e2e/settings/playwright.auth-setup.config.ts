import { defineConfig, devices } from '@playwright/test';

/**
 * Tiny dedicated config to run the auth-storage generator
 * (apps/web/e2e/settings/auth.setup.ts). Kept separate from the root
 * playwright.config.ts (whose testMatch only collects *.spec.ts) so the setup
 * file is never pulled into the normal parity/flow suite yet stays runnable on
 * demand via `pnpm --filter web e2e:auth`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: '.',
  testMatch: ['auth.setup.ts'],
  use: { baseURL, ...devices['Desktop Chrome'] },
  reporter: 'list',
});
