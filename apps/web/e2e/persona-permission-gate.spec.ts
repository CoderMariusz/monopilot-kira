/**
 * Persona selection in the local harness — what it proves, and what it cannot.
 *
 * PROVES (falsifiable: if installHarnessAuthCookie stopped honouring `identity`,
 * both cases would render as the default harness admin and case 2 would fail):
 *   • layer 1 — the fake GoTrue answers /auth/v1/user with the persona that owns
 *     the bearer token in the session cookie;
 *   • layer 2 — the (app) layout renders the shell instead of redirect('/en/login');
 *   • layer 3 — withOrgContext resolved org_id from public.users FOR THIS uid, and
 *     the server-side RBAC read produced a DIFFERENT nav per persona. The topbar
 *     identity comes from loadShellIdentity() → public.users, not from the JWT.
 * Every UI expectation is cross-checked against the effective permissions read
 * straight out of Postgres in beforeAll.
 *
 * DOES **NOT** PROVE — and cannot today — the opposed pair on a WRITE action
 * ("denied persona changes nothing / permitted persona changes the row"). Two
 * independent blockers, both measured, neither caused by personas:
 *
 *  1. React never hydrates under this harness. Measured on /en/login and
 *     /en/planning/reorder-thresholds: `document` carries no `__reactContainer$`
 *     key, a real click on [data-testid=app-topbar-user-trigger] never flips its
 *     aria-expanded, and a useEffect-driven list stays in `loading` for 120 s.
 *     Identical with browser.newContext({ serviceWorkers: 'block' }); no page
 *     errors, no failed requests, no 4xx. Every onClick-driven Server Action —
 *     i.e. nearly every write in this app — is therefore unreachable in a browser.
 *  2. Only four Server Action forms in apps/web are progressively enhanced (they
 *     submit natively, so blocker 1 would not stop them), and none can show both
 *     sides:
 *       • (auth)/login — authentication, not a permission gate;
 *       • settings/infra/locations importCsvAction — submit AND file input are
 *         `disabled={!canImport}` (settings.infra.update), so a denied persona
 *         cannot submit without forcing a disabled control;
 *       • settings/schema/new publishColumnAction — submit is disabled whenever
 *         getTenantVariations() denies settings.org.read, which is every persona
 *         except admin. The 14 Apex roles that would fit (settings.org.read
 *         without settings.schema.edit) have ZERO users assigned;
 *       • settings/schema/preview publishShadowDraft — not disabled, but the
 *         PERMITTED side is impossible: callerHasSchemaAdmin (packages/schema-driven)
 *         requires role SLUG 'org.schema.admin' and no Apex user holds that role —
 *         the admin persona's role slug is 'admin'.
 *
 * Verdict: the write-gate counter-control is NOT achievable on today's data and
 * today's harness. Fix hydration first; then upsertReorderThreshold
 * (planning/_actions/reorder-thresholds.ts, gated on npd.planning.write, behind an
 * ungated "+ Add threshold" button) is the ready-made pair — admin holds that
 * permission, no_module_access does not, and public.reorder_thresholds is empty.
 *
 * Run: scripts/e2e-local.sh apps/web/e2e/persona-permission-gate.spec.ts
 * Prereq: personas seeded (packages/db/seeds/test-personas.ts) into the same DB.
 */
import { expect, test } from '@playwright/test';
import pg from 'pg';

import { HARNESS_ORG_ID, HARNESS_PERSONAS, type HarnessPersonaKey } from './_helpers/shell-parity';
import { signIn } from './_shared/parity-login';

const { Client } = pg;

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? '';
const isLocalHarnessRun = process.env.E2E_LOCAL === '1';
const ownerConnectionString = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL ?? '';

/** Ungated page (no page-level permission check) so the shell is the only variable. */
const ROUTE = '/en/planning/reorder-thresholds';
/** Ungated nav item (module-registry permission_key === null) — every identity sees it. */
const UNGATED_NAV = 'app-sidebar-item-dashboard';
/** Nav item behind mnt.* — admin has it, no_module_access has nothing. */
const GATED_NAV = 'app-sidebar-item-maintenance';

/** Effective permissions exactly as the app resolves them: role_permissions ∪ legacy roles.permissions. */
async function effectivePermissionCount(userId: string): Promise<number> {
  const client = new Client({ connectionString: ownerConnectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: string }>(
      `select count(distinct p.permission)::text as n
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
        cross join lateral (
          select rp.permission from public.role_permissions rp where rp.role_id = r.id
          union
          select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb))
        ) p
        where ur.user_id = $1::uuid and ur.org_id = $2::uuid`,
      [userId, HARNESS_ORG_ID],
    );
    return Number(rows[0]?.n ?? 0);
  } finally {
    await client.end();
  }
}

test.describe.serial('harness persona selection reaches every auth layer', () => {
  // Next dev compiles routes on demand; the first navigation dominates the budget.
  test.describe.configure({ timeout: 180_000 });

  test.skip(
    !isLocalHarnessRun || !baseURL || !ownerConnectionString,
    'Local-harness only: run via scripts/e2e-local.sh (needs E2E_LOCAL=1, PLAYWRIGHT_BASE_URL, DATABASE_URL_OWNER).',
  );

  test.beforeAll(async () => {
    // The database fact the two UI cases below must mirror. If the seed drifts,
    // this fails here instead of turning the browser assertions into a false green.
    expect(await effectivePermissionCount(HARNESS_PERSONAS.admin.userId)).toBeGreaterThan(0);
    expect(await effectivePermissionCount(HARNESS_PERSONAS.no_module_access.userId)).toBe(0);
  });

  for (const [identity, seesGatedNav] of [
    ['admin', true],
    ['no_module_access', false],
  ] as Array<[HarnessPersonaKey, boolean]>) {
    test(`${identity} is the identity the server resolves`, async ({ page }) => {
      await signIn(page, baseURL, 'en', identity);
      await page.goto(`${baseURL}${ROUTE}`, { waitUntil: 'domcontentloaded' });

      // Layer 2: the (app) layout got a user and did not redirect to /login.
      await expect(page.locator('[data-testid="app-shell"]').first()).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(ROUTE);

      // Layer 3a: the topbar label is loadShellIdentity() → public.users.name for
      // THIS uid, so the persona travelled all the way into an owner-pool read.
      await expect(page.getByTestId('app-topbar-user-trigger')).toHaveAttribute(
        'aria-label',
        new RegExp(HARNESS_PERSONAS[identity].name),
      );

      // Layer 3b: filterNavGroupsByPermissions resolved THIS persona's RBAC set.
      await expect(page.getByTestId(UNGATED_NAV)).toBeVisible();
      await expect(page.getByTestId(GATED_NAV)).toBeVisible({ visible: seesGatedNav });
    });
  }
});
