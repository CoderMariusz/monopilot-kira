/**
 * Shared helpers for the MRP → Fulfilment → Scanner E2E specs.
 *
 * These specs are LIVE, page-driven, and gated on PLAYWRIGHT_BASE_URL — when it
 * is unset (default in CI / an isolated worktree) every describe block SKIPS via
 * `test.skip(!baseURL, …)`. Playwright still collects them so `--list` works.
 *
 * signIn mirrors the copy-pasted helper in npd-full-lifecycle.spec.ts /
 * npd-project-gate-flow.spec.ts — hoisted here so the three sibling specs share
 * one authentication path instead of duplicating it three times.
 *
 * Credentials come from env only (red-line: no real secrets in test code):
 *   PLAYWRIGHT_ADMIN_EMAIL     (default admin@monopilot.test)
 *   PLAYWRIGHT_ADMIN_PASSWORD  (required for the live run)
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

export const baseURL = process.env.PLAYWRIGHT_BASE_URL;
export const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? 'admin@monopilot.test';
export const adminPassword = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? '';

/** Absolute URL against the live preview. Callers only run when baseURL is set. */
export function url(route: string): string {
  return `${baseURL ?? ''}${route}`;
}

/** Create an artifacts/<label> screenshot dir under apps/web/e2e. */
export function ensureArtifactDir(label: string): string {
  const dir = path.resolve(__dirname, '..', 'artifacts', label);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Sign in via /en/login using email + password. Waits for the redirect away
 * from /login to confirm the Supabase session took.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto(url('/en/login'), { waitUntil: 'domcontentloaded' });

  const emailInput = page.getByLabel(/work email/i).or(page.locator('input[type="email"]')).first();
  await emailInput.fill(adminEmail);

  const passwordInput = page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first();
  await passwordInput.fill(adminPassword);

  await page.getByRole('button', { name: /sign in|log in|submit/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15_000 });
}

/**
 * Parse a decimal-string quantity ("12.000", "1,234.5") into a number.
 * MRP/SO quantities are rendered as decimal strings (never floats server-side).
 */
export function parseQty(text: string | null | undefined): number {
  if (!text) return Number.NaN;
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  return cleaned === '' ? Number.NaN : Number(cleaned);
}
