/**
 * T-017 — Allergen profile CRUD: REAL DB-backed integration tests.
 *
 * Drives upsertProfile / deleteProfile / listProfiles through the real
 * withOrgContext app_user transaction (RLS via app.current_org_id()) using the
 * NEXT_SERVER_ACTION_* env-stub. Owner SQL seeds + asserts persisted rows.
 *
 * Acceptance criteria (task T-017):
 *   AC1 allergen_code not in Reference."Allergens" → 422 V-TEC-40
 *   AC2 source='manual_override' without reason → 422 V-TEC-42
 *   AC3 DELETE manual_override row → audit_log action='allergen.delete' w/ old payload
 *   AC4 user without technical.allergens.edit → 403
 *
 * Skips when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withOrgContext } from '../../lib/auth/with-org-context';
import type { OrgActionContext, QueryClient } from '../../lib/technical/allergens/shared';
import { deleteProfile, listProfiles, upsertProfile } from '../../lib/technical/allergens/service';
import {
  cleanup,
  createItem,
  databaseUrl,
  makeSeed,
  seedFixtures,
  withActionActor,
  type AllergenSeed,
} from './allergen-test-helpers';

const run = databaseUrl ? describe : describe.skip;
const seed: AllergenSeed = makeSeed();
let owner: pg.Pool;

// Run a service call inside the real org context (RLS app_user txn).
function inCtx<T>(userId: string, orgId: string, fn: (ctx: OrgActionContext) => Promise<T>): Promise<T> {
  return withActionActor(userId, orgId, () =>
    withOrgContext(({ userId: u, orgId: o, client }) =>
      fn({ userId: u, orgId: o, client: client as unknown as QueryClient }),
    ),
  );
}

run('T-017 allergen profile CRUD (RLS + RBAC, real DB)', () => {
  let rmItemId: string;

  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool for seed/assert
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedFixtures(owner, seed);
    rmItemId = await createItem(owner, seed.orgAId, `RM-${randomUUID().slice(0, 8)}`, 'rm');
  });

  afterAll(async () => {
    if (owner) {
      await cleanup(owner, seed).catch(() => undefined);
      await owner.end();
    }
  });

  it('AC1: allergen_code not in Reference."Allergens" → invalid_allergen_code (422 V-TEC-40)', async () => {
    const itemCode = await ownerItemCode(rmItemId);
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertProfile(ctx, { itemCode, allergenCode: 'NOT-A-REAL-ALLERGEN', source: 'brief_declared' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_allergen_code');

    // No row persisted.
    const persisted = await owner.query(
      `select 1 from public.item_allergen_profiles where item_id = $1 and allergen_code = 'NOT-A-REAL-ALLERGEN'`,
      [rmItemId],
    );
    expect(persisted.rowCount).toBe(0);
  });

  it('AC2: source=manual_override without reason → override_reason_required (422 V-TEC-42)', async () => {
    const itemCode = await ownerItemCode(rmItemId);
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertProfile(ctx, { itemCode, allergenCode: 'milk', source: 'manual_override' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('override_reason_required');
  });

  it('happy path: create cascaded-source row, then manual override appends history + audit override', async () => {
    const itemCode = await ownerItemCode(rmItemId);
    // create (non-override)
    const created = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertProfile(ctx, { itemCode, allergenCode: 'gluten', source: 'brief_declared', intensity: 'contains' }),
    );
    expect(created.ok).toBe(true);

    const createAudit = await owner.query(
      `select action from public.audit_log
        where org_id = $1 and resource_id = $2 and action = 'allergen.create'`,
      [seed.orgAId, `${rmItemId}:gluten`],
    );
    expect(createAudit.rowCount).toBe(1);

    // manual override with reason → appends override-history + audit 'allergen.override'
    const overridden = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertProfile(ctx, {
        itemCode,
        allergenCode: 'gluten',
        source: 'manual_override',
        intensity: 'may_contain',
        reason: 'QA reviewed supplier dossier',
      }),
    );
    expect(overridden.ok).toBe(true);

    const ovr = await owner.query(
      `select action, reason from public.item_allergen_profile_overrides
        where org_id = $1 and item_id = $2 and allergen_code = 'gluten'`,
      [seed.orgAId, rmItemId],
    );
    expect(ovr.rowCount).toBe(1);
    expect(ovr.rows[0]?.action).toBe('set');
    expect(ovr.rows[0]?.reason).toBe('QA reviewed supplier dossier');

    const ovrAudit = await owner.query(
      `select action from public.audit_log
        where org_id = $1 and resource_id = $2 and action = 'allergen.override'`,
      [seed.orgAId, `${rmItemId}:gluten`],
    );
    expect(ovrAudit.rowCount).toBe(1);

    // The current row reflects the override (source=manual_override, reason set).
    const list = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) => listProfiles(ctx, itemCode));
    expect(list.ok).toBe(true);
    if (list.ok) {
      const row = list.data.find((r) => r.allergenCode === 'gluten');
      expect(row?.source).toBe('manual_override');
      expect(row?.manualOverrideReason).toBe('QA reviewed supplier dossier');
    }
  });

  it('AC3: DELETE manual_override row → audit_log action=allergen.delete with old payload', async () => {
    const itemCode = await ownerItemCode(rmItemId);
    // seed an override row to delete
    await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertProfile(ctx, {
        itemCode,
        allergenCode: 'eggs',
        source: 'manual_override',
        intensity: 'contains',
        reason: 'to be deleted',
      }),
    );

    const deleted = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      deleteProfile(ctx, { itemCode, allergenCode: 'eggs' }),
    );
    expect(deleted.ok).toBe(true);

    const delAudit = await owner.query<{ action: string; before_state: { allergenCode?: string } }>(
      `select action, before_state from public.audit_log
        where org_id = $1 and resource_id = $2 and action = 'allergen.delete'`,
      [seed.orgAId, `${rmItemId}:eggs`],
    );
    expect(delAudit.rowCount).toBe(1);
    expect(delAudit.rows[0]?.before_state?.allergenCode).toBe('eggs');

    // Row gone from current state.
    const gone = await owner.query(
      `select 1 from public.item_allergen_profiles where item_id = $1 and allergen_code = 'eggs'`,
      [rmItemId],
    );
    expect(gone.rowCount).toBe(0);

    // Append-only ledger preserved 'set' + 'clear' rows.
    const ledger = await owner.query(
      `select action from public.item_allergen_profile_overrides
        where org_id = $1 and item_id = $2 and allergen_code = 'eggs' order by overridden_at`,
      [seed.orgAId, rmItemId],
    );
    expect(ledger.rows.map((r) => r.action)).toEqual(['set', 'clear']);
  });

  it('AC4: user without technical.allergens.edit → forbidden (403)', async () => {
    const itemCode = await ownerItemCode(rmItemId);
    const res = await inCtx(seed.viewerAUserId, seed.orgAId, (ctx) =>
      upsertProfile(ctx, { itemCode, allergenCode: 'milk', source: 'brief_declared' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('forbidden');
  });

  it('org isolation: Org B cannot resolve Org A item (not_found via RLS)', async () => {
    const itemCode = await ownerItemCode(rmItemId);
    const res = await inCtx(seed.adminBUserId, seed.orgBId, (ctx) =>
      upsertProfile(ctx, { itemCode, allergenCode: 'milk', source: 'brief_declared' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('not_found');
  });

  // helper: resolve current item_code for the seeded RM item (owner read)
  async function ownerItemCode(itemId: string): Promise<string> {
    const { rows } = await owner.query<{ item_code: string }>(
      `select item_code from public.items where id = $1`,
      [itemId],
    );
    return rows[0]!.item_code;
  }
});
