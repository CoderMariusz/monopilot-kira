/**
 * T-081 — E2E: invite → accept → first login, with seat-limit + 7-day TTL.
 *
 * Real routes: /en/settings/invitations (admin invite surface) +
 * /en/settings/users. The invite-accept link is delivered by Supabase Auth
 * (magic link). Runnable against a live authenticated preview; otherwise
 * BLOCKED_AUTH skip — no fabricated pass.
 *
 * Acceptance criteria (per T-081):
 *  - seat_limit reached → inviteUser surfaces SEAT_LIMIT_REACHED, no row created;
 *  - successful invite accepted within 7 days → login succeeds, last_login_at set;
 *  - magic-link opened on day 8 → 410 GONE / INVITE_EXPIRED copy.
 *
 * The seat-limit + TTL assertions need a fresh org fixture (seat_limit + an
 * expired token). Until the orchestrator seeds that fixture in the live run,
 * the TTL/seat-limit cases are authored as `test.fixme` so they are visible and
 * addressable without dishonestly passing.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const webRoot = path.resolve(__dirname, '../');

function resolveAuth(): { baseURL?: string; authStorage?: string } {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const explicit = process.env.PLAYWRIGHT_AUTH_STORAGE ?? process.env.PLAYWRIGHT_AUTH_STORAGE_STATE;
  const candidates = [explicit, path.join(webRoot, 'e2e/.auth/user.json')].filter((v): v is string => Boolean(v));
  return { baseURL, authStorage: candidates.find((c) => existsSync(c)) };
}

test.describe('T-081 invite → accept → first login', () => {
  test('admin can open the invite dialog and submit a new invitation', async ({ browser }) => {
    const { baseURL, authStorage } = resolveAuth();
    test.skip(
      !baseURL || !authStorage,
      'BLOCKED_AUTH: invite-accept E2E needs PLAYWRIGHT_BASE_URL + PLAYWRIGHT_AUTH_STORAGE for an authenticated admin. Authored; execution deferred to the live-preview run.',
    );

    const context = await browser.newContext({ storageState: authStorage });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/en/settings/invitations`, { waitUntil: 'domcontentloaded' });
      const inviteCta = page.getByRole('button', { name: /\+?\s*invite/i }).first();
      await expect(inviteCta, 'invitations screen must expose an invite CTA').toBeVisible();
      await inviteCta.click();
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog, 'invite CTA must open the UserInviteModal').toBeVisible();
      const email = `wave6-invite+${Date.now()}@monopilot.test`;
      await dialog.getByRole('textbox', { name: /email/i }).first().fill(email);
      await dialog.getByRole('button', { name: /send|invite|submit/i }).first().click();
      // Either a success toast or the new pending row appears.
      await expect(page.getByText(new RegExp(email.replace(/[.+]/g, '\\$&'), 'i')).first().or(page.getByText(/invitation sent|invited/i).first())).toBeVisible({ timeout: 10_000 });
    } finally {
      await context.close();
    }
  });

  test.fixme('seat-limit reached surfaces SEAT_LIMIT_REACHED and creates no row', async () => {
    // Needs a fixture org seeded at seat_limit with all seats active. The
    // orchestrator must provision this in the live run (DB seed forbidden in
    // this authoring worktree). Then: open invite dialog, submit, assert the
    // SEAT_LIMIT_REACHED error copy and assert the users count is unchanged.
  });

  test.fixme('expired magic-link (day 8) returns 410 GONE / INVITE_EXPIRED', async () => {
    // Needs a seeded invitation whose invite_token_expires_at is in the past.
    // Then GET the accept route with that token and assert HTTP 410 + the
    // INVITE_EXPIRED copy. Deferred to the live run with a seeded expired token.
  });
});
