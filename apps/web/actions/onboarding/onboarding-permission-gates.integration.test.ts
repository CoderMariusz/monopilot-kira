import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TEST_PERSONAS } from '../../../../packages/db/seeds/test-personas.js';
import { withActionActor } from '../../app/(npd)/brief/actions/__tests__/brief-integration-helpers';

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

const databaseUrl = process.env.DATABASE_URL;

// Ten plik SIEJE i KASUJE dane, więc wolno mu jechać wyłącznie na klonie `monopilot_t2` —
// ten wymóg zostaje. Zmienia się tylko reakcja na jego niespełnienie.
//
// Poprzednio było tu `throw` na poziomie modułu. Vitest liczy to jako błąd ZBIERANIA, więc
// padał CAŁY plik, a razem z nim cała suita node `apps/web`. A ponieważ skrypt `test` spina
// obie suity operatorem `&&`, suita UI NIE URUCHAMIAŁA SIĘ WCALE (gotcha z CLAUDE.md).
// CI ma bazę `monopilot`, nie klon — czyli po wypchnięciu tego pliku CI kładło się w całości.
//
// UWAGA: to jest ŚWIADOME „zielone przez pominięcie" i długu z tego nie ukrywam — CI nie stawia
// klonu, więc te testy tam NIE CHODZĄ. Wybór jest między „nie chodzą one" a „nie chodzi nic",
// bo `throw` zabierał ze sobą całą resztę. Docelowo: CI ma tworzyć klon, wtedy warunek
// spełni się sam i nic tu nie trzeba zmieniać.
const wrongTarget = (['DATABASE_URL', 'DATABASE_URL_OWNER', 'DATABASE_URL_APP'] as const)
  .map((name) => process.env[name])
  .find((value) => value && new URL(value).pathname !== '/monopilot_t2');

const canRun = Boolean(databaseUrl) && !wrongTarget;
if (!canRun) {
  console.warn(
    '[onboarding-permission-gates] POMINIĘTE: wymaga DATABASE_URL wskazującego klon monopilot_t2. ' +
      `Aktualnie: ${databaseUrl ?? '(brak DATABASE_URL)'}`,
  );
}

const noAccessPersona = TEST_PERSONAS.find((persona) => persona.key === 'no_module_access');
const adminPersona = TEST_PERSONAS.find((persona) => persona.key === 'admin');
if (!noAccessPersona || !adminPersona) {
  throw new Error('TEST_PERSONAS must include no_module_access and admin');
}

const suffix = randomUUID().slice(0, 8).toUpperCase();
const deniedWarehouseCode = `F8-NW-${suffix}`;
const allowedWarehouseCode = `F8-AW-${suffix}`;
const deniedLocationCode = `F8-NL-${suffix}`;
const allowedLocationCode = `F8-AL-${suffix}`;

type OrganizationSnapshot = {
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  gs1_prefix: string | null;
  onboarding_state: Record<string, unknown>;
  onboarding_completed_at: Date | null;
  updated_at: Date;
};

let owner: pg.Pool;
let orgId: string;
let originalOrganization: OrganizationSnapshot;

async function setOnboardingState(currentStep: number, completedSteps: number[]): Promise<void> {
  await owner.query(
    `update public.organizations
        set onboarding_state = $2::jsonb,
            onboarding_completed_at = null,
            updated_at = now()
      where id = $1::uuid`,
    [
      orgId,
      JSON.stringify({
        current_step: currentStep,
        completed_steps: completedSteps,
        skipped_steps: [],
        started_at: '2026-07-30T08:00:00.000Z',
        last_activity_at: '2026-07-30T08:00:00.000Z',
        first_wo_at: null,
      }),
    ],
  );
}

async function readOrganization() {
  const { rows } = await owner.query<{
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    gs1_prefix: string | null;
    onboarding_state: Record<string, unknown>;
  }>(
    `select name, currency, locale, timezone, gs1_prefix, onboarding_state
       from public.organizations
      where id = $1::uuid`,
    [orgId],
  );
  return rows[0]!;
}

async function assertPersonaPermission(userId: string, expected: boolean): Promise<void> {
  const { rows } = await owner.query<{ allowed: boolean }>(
    `select exists (
       select 1
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
         left join public.role_permissions rp
           on rp.role_id = r.id
          and rp.permission = 'settings.onboarding.complete'
        where ur.user_id = $1::uuid
          and ur.org_id = $2::uuid
          and (
            rp.permission is not null
            or r.permissions ? 'settings.onboarding.complete'
          )
     ) as allowed`,
    [userId, orgId],
  );
  expect(rows[0]?.allowed).toBe(expected);
}

async function ensureWarehouseForLocation(): Promise<void> {
  const existing = await owner.query(
    `select 1 from public.warehouses where org_id = $1::uuid and code = $2 limit 1`,
    [orgId, allowedWarehouseCode],
  );
  if (existing.rows.length > 0) return;

  await setOnboardingState(2, [1]);
  const { createFirstWarehouse } = await import('./create-first-warehouse');
  const result = await withActionActor(adminPersona.userId, orgId, () =>
    createFirstWarehouse({
      orgId,
      name: `F8 allowed warehouse ${suffix}`,
      code: allowedWarehouseCode,
      type: 'raw',
      address: 'F8 integration fixture',
    }),
  );
  expect(result.ok).toBe(true);
}

describe.skipIf(!canRun)('onboarding permission gates — canonical personas + REAL monopilot_t2 DB', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- owner pool is fixture/assert/cleanup only; actions use app_user withOrgContext
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.APP_USER_PASSWORD = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

    const personas = await owner.query<{ id: string; org_id: string }>(
      `select id::text, org_id::text
         from public.users
        where id = any($1::uuid[])`,
      [[noAccessPersona.userId, adminPersona.userId]],
    );
    if (personas.rows.length !== 2 || personas.rows[0]?.org_id !== personas.rows[1]?.org_id) {
      throw new Error('Canonical no_module_access and admin personas must be seeded in the same test org');
    }
    orgId = personas.rows[0]!.org_id;

    const snapshot = await owner.query<OrganizationSnapshot>(
      `select name, currency, locale, timezone, gs1_prefix, onboarding_state,
              onboarding_completed_at, updated_at
         from public.organizations
        where id = $1::uuid`,
      [orgId],
    );
    if (!snapshot.rows[0]) throw new Error('Persona organization not found');
    originalOrganization = snapshot.rows[0];

    await assertPersonaPermission(noAccessPersona.userId, false);
    await assertPersonaPermission(adminPersona.userId, true);
  }, 120_000);

  afterAll(async () => {
    if (!owner) return;
    try {
      if (!orgId) return;
      await owner.query(
        `delete from public.locations
          where org_id = $1::uuid
            and code = any($2::text[])`,
        [orgId, [deniedLocationCode, allowedLocationCode]],
      );
      await owner.query(
        `delete from public.warehouses
          where org_id = $1::uuid
            and code = any($2::text[])`,
        [orgId, [deniedWarehouseCode, allowedWarehouseCode]],
      );
      if (originalOrganization) {
        await owner.query(
          `update public.organizations
              set name = $2,
                  currency = $3,
                  locale = $4,
                  timezone = $5,
                  gs1_prefix = $6,
                  onboarding_state = $7::jsonb,
                  onboarding_completed_at = $8::timestamptz,
                  updated_at = $9::timestamptz
            where id = $1::uuid`,
          [
            orgId,
            originalOrganization.name,
            originalOrganization.currency,
            originalOrganization.locale,
            originalOrganization.timezone,
            originalOrganization.gs1_prefix,
            JSON.stringify(originalOrganization.onboarding_state),
            originalOrganization.onboarding_completed_at,
            originalOrganization.updated_at,
          ],
        );
      }
    } finally {
      await owner.end();
    }
  });

  it('saveOrgProfile denies no_module_access without persistence and persists for admin', async () => {
    const { saveOrgProfile } = await import('./save-org-profile');
    await setOnboardingState(1, []);
    const before = await readOrganization();

    const denied = await withActionActor(noAccessPersona.userId, orgId, () =>
      saveOrgProfile({
        orgId,
        orgName: `F8 denied profile ${suffix}`,
        timezone: before.timezone,
        locale: before.locale,
        currency: before.currency,
        gs1Prefix: '5012345',
      }),
    );
    expect(denied).toMatchObject({ ok: false, error: 'PERSISTENCE_FAILED' });
    expect.soft(await readOrganization()).toEqual(before);

    const allowedName = `F8 allowed profile ${suffix}`;
    const allowed = await withActionActor(adminPersona.userId, orgId, () =>
      saveOrgProfile({
        orgId,
        orgName: allowedName,
        timezone: before.timezone,
        locale: before.locale,
        currency: before.currency,
        gs1Prefix: '5901234',
      }),
    );
    expect(allowed.ok).toBe(true);
    expect(await readOrganization()).toMatchObject({
      name: allowedName,
      gs1_prefix: '5901234',
      onboarding_state: expect.objectContaining({
        current_step: 2,
        completed_steps: [1],
      }),
    });
  });

  it('createFirstWarehouse denies no_module_access without a row and persists for admin', async () => {
    const { createFirstWarehouse } = await import('./create-first-warehouse');
    await setOnboardingState(2, [1]);
    const beforeState = (await readOrganization()).onboarding_state;

    const denied = await withActionActor(noAccessPersona.userId, orgId, () =>
      createFirstWarehouse({
        orgId,
        name: `F8 denied warehouse ${suffix}`,
        code: deniedWarehouseCode,
        type: 'raw',
        address: 'Must not persist',
      }),
    );
    expect(denied).toEqual({ ok: false, error: 'PERSISTENCE_FAILED' });
    const deniedPersisted = await owner.query<{ count: string }>(
      `select count(*)::text as count
         from public.warehouses
        where org_id = $1::uuid and code = $2`,
      [orgId, deniedWarehouseCode],
    );
    expect.soft(deniedPersisted.rows[0]?.count).toBe('0');
    expect.soft((await readOrganization()).onboarding_state).toEqual(beforeState);

    const allowed = await withActionActor(adminPersona.userId, orgId, () =>
      createFirstWarehouse({
        orgId,
        name: `F8 allowed warehouse ${suffix}`,
        code: allowedWarehouseCode,
        type: 'raw',
        address: 'Allowed persistence proof',
      }),
    );
    expect(allowed.ok).toBe(true);
    const allowedPersisted = await owner.query<{ id: string; name: string }>(
      `select id::text, name
         from public.warehouses
        where org_id = $1::uuid and code = $2`,
      [orgId, allowedWarehouseCode],
    );
    expect(allowedPersisted.rows[0]).toMatchObject({ name: `F8 allowed warehouse ${suffix}` });
    expect((await readOrganization()).onboarding_state).toMatchObject({
      current_step: 3,
      completed_steps: [1, 2],
    });
  });

  it('createFirstLocation denies no_module_access without a row and persists for admin', async () => {
    const { createFirstLocation } = await import('./create-first-location');
    await ensureWarehouseForLocation();
    await setOnboardingState(3, [1, 2]);
    const beforeState = (await readOrganization()).onboarding_state;

    const deniedPath = `${allowedWarehouseCode}/DENIED/AISLE/${deniedLocationCode}`;
    const denied = await withActionActor(noAccessPersona.userId, orgId, () =>
      createFirstLocation({
        orgId,
        warehouseCode: allowedWarehouseCode,
        path: deniedPath,
        pathSegments: [allowedWarehouseCode, 'DENIED', 'AISLE', deniedLocationCode],
        level: 4,
        zone: 'Denied zone',
        binCode: deniedLocationCode,
      }),
    );
    expect(denied).toEqual({ ok: false, error: 'PERSISTENCE_FAILED' });
    const deniedPersisted = await owner.query<{ count: string }>(
      `select count(*)::text as count
         from public.locations
        where org_id = $1::uuid and code = $2`,
      [orgId, deniedLocationCode],
    );
    expect.soft(deniedPersisted.rows[0]?.count).toBe('0');
    expect.soft((await readOrganization()).onboarding_state).toEqual(beforeState);

    const allowedPath = `${allowedWarehouseCode}/ALLOWED/AISLE/${allowedLocationCode}`;
    const allowed = await withActionActor(adminPersona.userId, orgId, () =>
      createFirstLocation({
        orgId,
        warehouseCode: allowedWarehouseCode,
        path: allowedPath,
        pathSegments: [allowedWarehouseCode, 'ALLOWED', 'AISLE', allowedLocationCode],
        level: 4,
        zone: 'Allowed zone',
        binCode: allowedLocationCode,
      }),
    );
    expect(allowed.ok).toBe(true);
    const allowedPersisted = await owner.query<{ id: string; path: string }>(
      `select id::text, path
         from public.locations
        where org_id = $1::uuid and code = $2`,
      [orgId, allowedLocationCode],
    );
    expect(allowedPersisted.rows[0]).toEqual({ id: allowed.ok ? allowed.locationId : '', path: allowedPath });
    expect((await readOrganization()).onboarding_state).toMatchObject({
      current_step: 4,
      completed_steps: [1, 2, 3],
    });
  });
});
