/**
 * T-018 — Manufacturing-operation allergen additions CRUD: REAL DB tests.
 *
 * Acceptance criteria (task T-018):
 *   AC1 manufacturing_operation_name not in Reference."ManufacturingOperations"
 *       → invalid_manufacturing_operation (422 V-TEC-63)
 *   AC2 valid POST → row appears via GET for that operation name
 *   AC3 DELETE → audit_log action='manufacturing_op.allergen.delete'
 *
 * The org-insert trigger seeds operations Mix/Fill/Seal/Label for the new org.
 * Skips when DATABASE_URL is unset.
 */
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withOrgContext } from '../../lib/auth/with-org-context';
import type { OrgActionContext, QueryClient } from '../../lib/technical/allergens/shared';
import {
  deleteMfgOpAllergen,
  listMfgOpAllergens,
  upsertMfgOpAllergen,
} from '../../lib/technical/allergens/manufacturing-op';
import {
  cleanup,
  databaseUrl,
  makeSeed,
  seedFixtures,
  withActionActor,
  type AllergenSeed,
} from './allergen-test-helpers';

const run = databaseUrl ? describe : describe.skip;
const seed: AllergenSeed = makeSeed();
let owner: pg.Pool;

function inCtx<T>(userId: string, orgId: string, fn: (ctx: OrgActionContext) => Promise<T>): Promise<T> {
  return withActionActor(userId, orgId, () =>
    withOrgContext(({ userId: u, orgId: o, client }) =>
      fn({ userId: u, orgId: o, client: client as unknown as QueryClient }),
    ),
  );
}

run('T-018 manufacturing-op allergen additions CRUD (RLS + RBAC, real DB)', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- integration owner pool
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedFixtures(owner, seed);
  });

  afterAll(async () => {
    if (owner) {
      await cleanup(owner, seed).catch(() => undefined);
      await owner.end();
    }
  });

  it('AC1: operation not in Reference table → invalid_manufacturing_operation (422 V-TEC-63)', async () => {
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertMfgOpAllergen(ctx, { manufacturingOperationName: 'NonExistentOp', allergenCode: 'milk' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_manufacturing_operation');

    const persisted = await owner.query(
      `select 1 from public.manufacturing_operation_allergen_additions
        where org_id = $1 and manufacturing_operation_name = 'NonExistentOp'`,
      [seed.orgAId],
    );
    expect(persisted.rowCount).toBe(0);
  });

  it('AC1b: allergen_code not in Reference."Allergens" → invalid_allergen_code', async () => {
    const res = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertMfgOpAllergen(ctx, { manufacturingOperationName: 'Mix', allergenCode: 'NOPE' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_allergen_code');
  });

  it('AC2: valid POST → GET returns the row for that operation', async () => {
    const created = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertMfgOpAllergen(ctx, {
        manufacturingOperationName: 'Mix',
        allergenCode: 'milk',
        reason: 'shared mixer carryover',
      }),
    );
    expect(created.ok).toBe(true);

    const listed = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) => listMfgOpAllergens(ctx, 'Mix'));
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data.some((r) => r.allergenCode === 'milk' && r.manufacturingOperationName === 'Mix')).toBe(true);
    }

    const createAudit = await owner.query(
      `select action from public.audit_log
        where org_id = $1 and action = 'manufacturing_op.allergen.create' and resource_id = 'Mix:milk'`,
      [seed.orgAId],
    );
    expect(createAudit.rowCount).toBe(1);
  });

  it('upsert: re-POST same key updates reason (no duplicate)', async () => {
    await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertMfgOpAllergen(ctx, { manufacturingOperationName: 'Seal', allergenCode: 'soybeans', reason: 'v1' }),
    );
    await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertMfgOpAllergen(ctx, { manufacturingOperationName: 'Seal', allergenCode: 'soybeans', reason: 'v2' }),
    );
    const rows = await owner.query<{ reason: string }>(
      `select reason from public.manufacturing_operation_allergen_additions
        where org_id = $1 and manufacturing_operation_name = 'Seal' and allergen_code = 'soybeans'`,
      [seed.orgAId],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.reason).toBe('v2');
  });

  it('AC3: DELETE → audit_log action=manufacturing_op.allergen.delete', async () => {
    await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      upsertMfgOpAllergen(ctx, { manufacturingOperationName: 'Fill', allergenCode: 'eggs' }),
    );
    const del = await inCtx(seed.adminAUserId, seed.orgAId, (ctx) =>
      deleteMfgOpAllergen(ctx, { manufacturingOperationName: 'Fill', allergenCode: 'eggs' }),
    );
    expect(del.ok).toBe(true);

    const delAudit = await owner.query(
      `select action from public.audit_log
        where org_id = $1 and action = 'manufacturing_op.allergen.delete' and resource_id = 'Fill:eggs'`,
      [seed.orgAId],
    );
    expect(delAudit.rowCount).toBe(1);

    const gone = await owner.query(
      `select 1 from public.manufacturing_operation_allergen_additions
        where org_id = $1 and manufacturing_operation_name = 'Fill' and allergen_code = 'eggs'`,
      [seed.orgAId],
    );
    expect(gone.rowCount).toBe(0);
  });

  it('RBAC: viewer without technical.allergens.edit → forbidden', async () => {
    const res = await inCtx(seed.viewerAUserId, seed.orgAId, (ctx) =>
      upsertMfgOpAllergen(ctx, { manufacturingOperationName: 'Mix', allergenCode: 'milk' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('forbidden');
  });
});
