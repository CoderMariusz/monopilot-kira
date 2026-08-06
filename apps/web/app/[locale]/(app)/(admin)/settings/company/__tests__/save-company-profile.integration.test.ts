/**
 * SET-010 — Company profile save: REAL DB-backed round-trip.
 *
 * Drives saveCompanyProfile() through the real withOrgContext app_user
 * transaction (RLS via app.current_org_id()) against the local Postgres
 * (DATABASE_URL, migrated to >= 168). Proves the bug fix:
 *   - EVERY editable field (legal name, VAT/NIP, REGON, industry, address,
 *     contact, currency, timezone) is persisted to public.organizations and
 *     reads back on the next load — previously only name/timezone/currency
 *     were written and the rest silently vanished;
 *   - the outbox event settings.org.updated is emitted;
 *   - runtime zod validation rejects a malformed payload (the P2 nit);
 *   - a user without settings.org.update is forbidden.
 *
 * Skips automatically when DATABASE_URL is unset (mirrors the items-crud and
 * brief integration suites). Owner SQL is used only for seed, cleanup, and
 * persisted-row assertions.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  appUserPassword,
  databaseUrl,
  ensureAppUser,
  makeAppUserConnectionString,
  withActionActor,
  withAppOrg,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import type { SaveCompanyProfileInput } from '../company-profile-screen.client';
import { saveCompanyProfile } from '../_actions/company-profile';

const run = databaseUrl ? describe : describe.skip;

const UPDATE_PERMISSION = 'settings.org.update';

const seed = {
  tenantId: randomUUID(),
  orgId: randomUUID(),
  adminUserId: randomUUID(),
  viewerUserId: randomUUID(),
  adminRoleId: randomUUID(),
  viewerRoleId: randomUUID(),
};

let owner: pg.Pool;
let app: pg.Pool;

const fullInput: SaveCompanyProfileInput = {
  tradingName: 'Apex Foods Sp. z o.o.',
  legalName: 'Apex Foods Spółka z ograniczoną odpowiedzialnością',
  vat: 'PL5213456789',
  regon: '123456789',
  industry: 'Dairy',
  street: 'ul. Zakładowa 12',
  city: 'Kraków',
  zip: '30-690',
  country: 'Germany',
  email: 'office@apex.pl',
  phone: '+48 12 345 67 89',
  website: 'apex.pl',
  currency: 'PLN',
  timezone: 'Europe/Berlin',
  dateFormat: 'DD/MM/YYYY',
  gs1Prefix: '5901234',
};

async function seedFixtures(): Promise<void> {
  await ensureAppUser(owner);
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'Company IT Tenant', 'eu', 'https://company-it.example.test')
     on conflict (id) do nothing`,
    [seed.tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, slug, name, industry_code, currency, timezone)
     values ($1, $2, $3, 'Company IT Org', 'fmcg', 'EUR', 'Europe/Warsaw')
     on conflict (id) do nothing`,
    [seed.orgId, seed.tenantId, `company-it-${seed.orgId.slice(0, 8)}`],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system, display_order)
     values
       ($1, $2, 'company-admin-it', false, 'company-admin-it', 'Company Admin IT', $3::jsonb, false, 10),
       ($4, $2, 'company-viewer-it', false, 'company-viewer-it', 'Company Viewer IT', '[]'::jsonb, false, 11)
     on conflict (id) do nothing`,
    [seed.adminRoleId, seed.orgId, JSON.stringify([UPDATE_PERMISSION]), seed.viewerRoleId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, $2)
     on conflict (role_id, permission) do nothing`,
    [seed.adminRoleId, UPDATE_PERMISSION],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, name, role_id)
     values
       ($1, $2, $3, 'Company IT Admin', 'Company IT Admin', $4),
       ($5, $2, $6, 'Company IT Viewer', 'Company IT Viewer', $7)
     on conflict (id) do nothing`,
    [
      seed.adminUserId,
      seed.orgId,
      `company-admin-${seed.adminUserId}@example.test`,
      seed.adminRoleId,
      seed.viewerUserId,
      `company-viewer-${seed.viewerUserId}@example.test`,
      seed.viewerRoleId,
    ],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $3)
     on conflict (user_id, role_id) do nothing`,
    [seed.adminUserId, seed.adminRoleId, seed.orgId, seed.viewerUserId, seed.viewerRoleId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.sscc_counters where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.outbox_events where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.user_roles where org_id = $1`, [seed.orgId]);
  await owner.query(
    `delete from public.role_permissions where role_id in (select id from public.roles where org_id = $1)`,
    [seed.orgId],
  );
  await owner.query(`delete from public.users where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.roles where org_id = $1`, [seed.orgId]);
  await owner.query(`delete from public.organizations where id = $1`, [seed.orgId]);
  await owner.query(`delete from public.tenants where id = $1`, [seed.tenantId]);
}

run('SET-010 saveCompanyProfile round-trip (real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/cleanup/assert (mirrors items-crud.integration.test.ts)
    owner = new pg.Pool({ connectionString: databaseUrl });
    // Ensure withOrgContext's app pool authenticates as app_user against the
    // same DB (DATABASE_URL_APP is unset → it rewrites the username to app_user
    // and uses APP_USER_PASSWORD, which we align with the seeded role password).
    process.env.APP_USER_PASSWORD = appUserPassword;
    // sanity: confirm the app_user connection string is constructible
    expect(makeAppUserConnectionString()).toContain('app_user');
    // eslint-disable-next-line no-restricted-syntax -- app_user pool: proves generate_sscc() accepts the saved prefix
    app = new pg.Pool({ connectionString: makeAppUserConnectionString() });
    await seedFixtures();
  });

  afterAll(async () => {
    if (app) await app.end();
    if (owner) {
      await cleanup();
      await owner.end();
    }
  });

  it('leaves Pack blocked while the prefix is unset (the state this screen could not fix)', async () => {
    await expect(
      withAppOrg(owner, app, seed.orgId, (client) =>
        client.query(`select public.generate_sscc($1::uuid, 0)::text as sscc`, [seed.orgId]),
      ),
    ).rejects.toThrow(/V-SHIP-PACK-03 missing GS1 company prefix/);
  });

  it('persists ALL editable fields and reads them back', async () => {
    const result = await withActionActor(seed.adminUserId, seed.orgId, () => saveCompanyProfile(fullInput));

    expect(result.ok).toBe(true);
    expect(result.outboxEventType).toBe('settings.org.updated');
    // Returned profile reflects every field.
    expect(result.organization).toMatchObject({
      tradingName: fullInput.tradingName,
      legalName: fullInput.legalName,
      vat: fullInput.vat,
      regon: fullInput.regon,
      industry: fullInput.industry,
      street: fullInput.street,
      city: fullInput.city,
      zip: fullInput.zip,
      country: fullInput.country,
      email: fullInput.email,
      phone: fullInput.phone,
      website: fullInput.website,
      currency: fullInput.currency,
      timezone: fullInput.timezone,
    });

    // The persisted row (owner SQL, bypasses the in-memory result) proves the
    // write actually hit Postgres — this is what was broken before.
    const { rows } = await owner.query(
      `select name, legal_name, vat, regon, industry, street, city, zip, country,
              email, phone, website, currency, timezone, gs1_prefix
         from public.organizations where id = $1`,
      [seed.orgId],
    );
    // D1: gs1_prefix is what generate_sscc() reads; without it Pack dies with
    // "V-SHIP-PACK-03 missing GS1 company prefix" and the whole shipping flow stops.
    // It used to be settable ONLY through the onboarding wizard.
    expect(rows[0].gs1_prefix).toBe(fullInput.gs1Prefix);
    delete rows[0].gs1_prefix;
    expect(rows[0]).toEqual({
      name: fullInput.tradingName,
      legal_name: fullInput.legalName,
      vat: fullInput.vat,
      regon: fullInput.regon,
      industry: fullInput.industry,
      street: fullInput.street,
      city: fullInput.city,
      zip: fullInput.zip,
      country: fullInput.country,
      email: fullInput.email,
      phone: fullInput.phone,
      website: fullInput.website,
      currency: fullInput.currency,
      timezone: fullInput.timezone,
    });

    // ...and the saved prefix is actually USABLE: generate_sscc() (what Pack calls,
    // mig 459) now mints an SSCC instead of raising V-SHIP-PACK-03. A written column
    // would not prove that — a wrongly-shaped value still blocks packing.
    const { rows: sscc } = await withAppOrg(owner, app, seed.orgId, (client) =>
      client.query<{ sscc: string }>(`select public.generate_sscc($1::uuid, 0)::text as sscc`, [seed.orgId]),
    );
    expect(sscc[0].sscc).toMatch(/^05901234\d{9}\d$/);

    // Outbox event was emitted for the change.
    const { rows: events } = await owner.query(
      `select event_type from public.outbox_events
        where org_id = $1 and event_type = 'settings.org.updated'`,
      [seed.orgId],
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects an invalid payload at runtime (zod, P2 fix) without writing', async () => {
    const bad = { ...fullInput, tradingName: '' } as SaveCompanyProfileInput;
    const result = await withActionActor(seed.adminUserId, seed.orgId, () => saveCompanyProfile(bad));
    expect(result).toEqual({ ok: false, error: 'invalid' });

    // Row is unchanged from the previous successful save (trading name not blanked).
    const { rows } = await owner.query(`select name from public.organizations where id = $1`, [seed.orgId]);
    expect(rows[0].name).toBe(fullInput.tradingName);
  });

  it('rejects a GS1 prefix that is not exactly 7 digits, without writing', async () => {
    // Same shape generate_sscc() enforces (`^[0-9]{7}$`, migration 459) — reject at
    // the action so the operator learns now, not at Pack time.
    for (const bad of ['123', '12345678', '59012AB', ' 5901234x']) {
      const result = await withActionActor(seed.adminUserId, seed.orgId, () =>
        saveCompanyProfile({ ...fullInput, gs1Prefix: bad }),
      );
      expect(result).toEqual({ ok: false, error: 'invalid' });
    }

    const { rows } = await owner.query(`select gs1_prefix from public.organizations where id = $1`, [seed.orgId]);
    expect(rows[0].gs1_prefix).toBe(fullInput.gs1Prefix);
  });

  it('forbids a user without settings.org.update', async () => {
    const result = await withActionActor(seed.viewerUserId, seed.orgId, () =>
      saveCompanyProfile({ ...fullInput, tradingName: 'Viewer Should Not Persist', gs1Prefix: '9999999' }),
    );
    expect(result).toEqual({ ok: false, error: 'forbidden' });

    const { rows } = await owner.query(`select name, gs1_prefix from public.organizations where id = $1`, [
      seed.orgId,
    ]);
    expect(rows[0].name).toBe(fullInput.tradingName);
    expect(rows[0].gs1_prefix).toBe(fullInput.gs1Prefix);
  });
});
