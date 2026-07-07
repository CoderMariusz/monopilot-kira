/**
 * NPD PACKAGING stage — Server Action unit tests (zod + RBAC gate).
 *
 * `withOrgContext` is mocked with an in-memory fake client so these tests run
 * WITHOUT a database. They prove:
 *   - zod input validation (invalid_input, no DB touched),
 *   - the RBAC gate (caller lacking npd.packaging.write → forbidden BEFORE any
 *     write; caller lacking npd.packaging.read → forbidden on list),
 *   - the exact perm strings the actions CHECK (Gate-5 403 guard),
 *   - the happy path issues an audit_log INSERT in the same call,
 *   - cost_per_unit is bound as a decimal STRING ::numeric (never a JS float).
 *
 * The full RLS/persistence integration is covered by the DB-gated suites; this
 * suite is the deterministic, DB-free contract test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mutable fake client the mocked withOrgContext binds the action to ──────────
type Call = { sql: string; params: readonly unknown[] };

const ctx = {
  orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  // Toggle which permission strings the fake RBAC query returns true for.
  grantedPerms: new Set<string>(),
  // Whether the project lookup returns a row.
  projectExists: true,
  // Whether an existing component lookup returns a row (for update/delete).
  componentExists: true,
  // item_id returned by the UPDATE "before" SELECT (tests preserve-on-omit).
  existingItemId: null as string | null,
  // Whether packaging item lookup returns a packaging row.
  packagingItemExists: true,
  insertReturnsId: true,
  calls: [] as Call[],
};
const transactionEvents: string[] = [];

function fakeClient() {
  return {
    async query(sql: string, params: readonly unknown[] = []) {
      ctx.calls.push({ sql, params });
      const s = sql.replace(/\s+/g, ' ').toLowerCase();

      // RBAC permission probe: the permission string is the 3rd param ($3).
      if (s.includes('from public.user_roles ur')) {
        const perm = params[2] as string;
        return { rows: ctx.grantedPerms.has(perm) ? [{ ok: true }] : [] };
      }
      // Supplier FK validation probe.
      if (s.includes('from public.suppliers')) {
        const supplierId = params[0];
        if (supplierId === SUPPLIER_ID) {
          return { rows: [{ id: SUPPLIER_ID, code: 'Coveris' }] };
        }
        return { rows: [] };
      }
      // Legacy supplier probe before update.
      if (s.startsWith('select supplier_id::text as supplier_id')) {
        return { rows: [{ supplier_id: null, supplier_code: 'Coveris' }] };
      }
      // Project existence probe.
      if (s.includes('from public.npd_projects')) {
        return { rows: ctx.projectExists ? [{ id: 'proj', product_code: 'FA1', product_name: 'Ham' }] : [] };
      }
      // Packaging item validation probe.
      if (s.includes('from public.items')) {
        return { rows: ctx.packagingItemExists ? [{ id: params[0], item_type: 'packaging' }] : [] };
      }
      // Existing-component probe (update/delete "before" SELECT).
      if (s.startsWith('select id, tier, component_name')) {
        return {
          rows: ctx.componentExists
            ? [{ id: 'cmp', tier: 'primary', component_name: 'x', item_id: ctx.existingItemId }]
            : [],
        };
      }
      // INSERT / UPDATE / DELETE returning id.
      if (s.includes('returning id')) {
        return { rows: ctx.insertReturnsId ? [{ id: 'new-component-id' }] : [] };
      }
      // Listing query.
      if (s.includes('from public.packaging_components')) {
        return { rows: [] };
      }
      // audit_log INSERT (no returning).
      if (s.includes('into public.audit_log')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) => {
    try {
      const result = await action({
        orgId: ctx.orgId,
        userId: ctx.userId,
        sessionToken: 't',
        client: fakeClient(),
      });
      transactionEvents.push('COMMIT');
      return result;
    } catch (error) {
      transactionEvents.push('ROLLBACK');
      throw error;
    }
  },
}));

// next/cache revalidatePath is a no-op in this unit context.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { listPackagingComponents } from '../listPackagingComponents';
import { upsertPackagingComponent } from '../upsertPackagingComponent';
import { deletePackagingComponent } from '../deletePackagingComponent';
import { PACKAGING_READ_PERMISSION, PACKAGING_WRITE_PERMISSION } from '../shared';

const PROJECT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMPONENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SUPPLIER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

beforeEach(() => {
  ctx.grantedPerms = new Set<string>();
  ctx.projectExists = true;
  ctx.componentExists = true;
  ctx.existingItemId = null;
  ctx.packagingItemExists = true;
  ctx.insertReturnsId = true;
  ctx.calls = [];
  transactionEvents.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe('packaging perm strings — exact (Gate-5 403 guard)', () => {
  it('uses the BYTE-IDENTICAL seeded permission strings', () => {
    expect(PACKAGING_READ_PERMISSION).toBe('npd.packaging.read');
    expect(PACKAGING_WRITE_PERMISSION).toBe('npd.packaging.write');
  });
});

describe('listPackagingComponents — zod + RBAC', () => {
  it('returns invalid_input for a non-uuid projectId (no DB touched)', async () => {
    const res = await listPackagingComponents({ projectId: 'not-a-uuid' });
    expect(res).toEqual({ ok: false, error: 'invalid_input', message: expect.any(String) });
    expect(ctx.calls).toHaveLength(0);
  });

  it('returns forbidden when the caller lacks npd.packaging.read', async () => {
    const res = await listPackagingComponents({ projectId: PROJECT_ID });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    // The RBAC probe ran with the exact read string.
    expect(ctx.calls[0]?.params[2]).toBe('npd.packaging.read');
  });

  it('returns ok with read permission', async () => {
    ctx.grantedPerms.add(PACKAGING_READ_PERMISSION);
    const res = await listPackagingComponents({ projectId: PROJECT_ID });
    expect(res.ok).toBe(true);
  });
});

describe('upsertPackagingComponent — zod + RBAC', () => {
  const valid = {
    projectId: PROJECT_ID,
    tier: 'primary' as const,
    componentName: 'MAP tray',
    material: 'PET / PE 300µm',
    supplierId: SUPPLIER_ID,
    spec: '160×110×35mm',
    costPerUnit: '0.18',
    status: 'approved' as const,
  };

  it('rejects an invalid tier with invalid_input (no DB touched)', async () => {
    const res = await upsertPackagingComponent({ ...valid, tier: 'tertiary' });
    expect(res).toEqual({ ok: false, error: 'invalid_input', message: expect.any(String) });
    expect(ctx.calls).toHaveLength(0);
  });

  it('rejects a float-corrupting cost (must be a decimal string, but JS number → invalid_input)', async () => {
    const res = await upsertPackagingComponent({ ...valid, costPerUnit: 0.18 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_input');
  });

  it('returns forbidden when the caller lacks npd.packaging.write', async () => {
    const res = await upsertPackagingComponent(valid);
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(ctx.calls[0]?.params[2]).toBe('npd.packaging.write');
  });

  it('inserts + writes an audit_log row on the happy path (cost bound ::numeric as string)', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const res = await upsertPackagingComponent(valid);
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });

    const insert = ctx.calls.find((c) => /insert into public\.packaging_components/i.test(c.sql));
    expect(insert).toBeTruthy();
    // cost_per_unit was passed as the decimal STRING '0.18' (never a number).
    expect(insert!.params).toContain('0.18');
    expect(insert!.params).toContain(SUPPLIER_ID);
    expect(insert!.params).toContain('Coveris');

    const audit = ctx.calls.find((c) => /insert into\s+public\.audit_log/i.test(c.sql));
    expect(audit).toBeTruthy();
  });

  it('rejects a supplierId that is not in public.suppliers', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const res = await upsertPackagingComponent({
      ...valid,
      supplierId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });
    expect(res).toEqual({ ok: false, error: 'invalid_input' });
    expect(ctx.calls.some((c) => /insert into public\.packaging_components/i.test(c.sql))).toBe(false);
  });

  it('rejects free-text supplierCode on insert (supplier FK required)', async () => {
    const res = await upsertPackagingComponent({ ...valid, supplierId: null, supplierCode: 'Coveris' });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(ctx.calls).toHaveLength(0);
  });

  it('preserves a legacy supplier_code on update when legacySupplierCode is sent', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const res = await upsertPackagingComponent({
      ...valid,
      id: COMPONENT_ID,
      supplierId: null,
      legacySupplierCode: 'Coveris',
    });
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });
    const update = ctx.calls.find((c) => /update public\.packaging_components/i.test(c.sql));
    expect(update?.params).toContain('Coveris');
    expect(update?.params).toContain(null);
  });

  it('returns persistence_failed without audit when insert returns no id (rollback path)', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    ctx.insertReturnsId = false;
    const res = await upsertPackagingComponent(valid);
    expect(res).toEqual({ ok: false, error: 'persistence_failed' });
    expect(ctx.calls.some((c) => /insert into\s+public\.audit_log/i.test(c.sql))).toBe(false);
    expect(transactionEvents).toContain('ROLLBACK');
    expect(transactionEvents).not.toContain('COMMIT');
  });

  it('defaults scrap_pct to 0 when omitted and binds it ::numeric in the INSERT', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const res = await upsertPackagingComponent(valid); // no scrapPct → schema default 0
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });

    const insert = ctx.calls.find((c) => /insert into public\.packaging_components/i.test(c.sql));
    expect(insert).toBeTruthy();
    // The column is in the INSERT list and bound ::numeric.
    expect(insert!.sql).toContain('scrap_pct');
    expect(insert!.sql).toMatch(/\$9::numeric/);
    // Default value 0 is among the bound params.
    expect(insert!.params).toContain(0);
  });

  it('uses a legacy scrap_pct-only value as the unified Waste % alias in the INSERT', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    // String input is coerced by z.coerce.number() — mirrors the modal sending a number.
    const res = await upsertPackagingComponent({ ...valid, scrapPct: '2.5' });
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });

    const insert = ctx.calls.find((c) => /insert into public\.packaging_components/i.test(c.sql));
    expect(insert).toBeTruthy();
    // Bound to both scrap_pct and waste_pct.
    expect(insert!.params.filter((param) => param === 2.5)).toHaveLength(2);
  });

  it('rejects an out-of-range scrap_pct (>100) with invalid_input (no DB touched)', async () => {
    const res = await upsertPackagingComponent({ ...valid, scrapPct: 150 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('invalid_input');
    expect(ctx.calls).toHaveLength(0);
  });

  it('updates both scrap_pct and waste_pct from the single Waste % alias', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const existingItemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    ctx.existingItemId = existingItemId;

    const res = await upsertPackagingComponent({ ...valid, id: COMPONENT_ID, wastePct: 3 });
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });

    const update = ctx.calls.find((c) => /update public\.packaging_components/i.test(c.sql));
    expect(update).toBeTruthy();
    expect(update!.sql).toContain('scrap_pct');
    expect(update!.sql).toMatch(/scrap_pct\s*=\s*\$9::numeric/);
    expect(update!.sql).toContain('waste_pct');
    expect(update!.sql).toMatch(/waste_pct\s*=\s*\$10::numeric/);
    expect(update!.params.filter((param) => param === 3)).toHaveLength(2);
    // itemId omitted → preserve the catalog link from the before row ($14).
    expect(update!.params[13]).toBe(existingItemId);
  });

  it('clears item_id on UPDATE when itemId is explicitly null', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    ctx.existingItemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    const res = await upsertPackagingComponent({ ...valid, id: COMPONENT_ID, itemId: null });
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });

    const update = ctx.calls.find((c) => /update public\.packaging_components/i.test(c.sql));
    expect(update).toBeTruthy();
    expect(update!.params[13]).toBeNull();
  });

  it('defaults waste_pct to 0 when omitted and binds it ::numeric in the INSERT', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const res = await upsertPackagingComponent(valid);
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });

    const insert = ctx.calls.find((c) => /insert into public\.packaging_components/i.test(c.sql));
    expect(insert).toBeTruthy();
    expect(insert!.sql).toContain('waste_pct');
    expect(insert!.sql).toMatch(/\$10::numeric/);
    expect(insert!.params).toContain(0);
  });

  it('round-trips waste_pct into the INSERT', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const res = await upsertPackagingComponent({ ...valid, wastePct: '1.25' });
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });

    const insert = ctx.calls.find((c) => /insert into public\.packaging_components/i.test(c.sql));
    expect(insert).toBeTruthy();
    expect(insert!.params.filter((param) => param === 1.25)).toHaveLength(2);
  });

  it('validates optional itemId as a packaging item before writing', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    ctx.packagingItemExists = false;

    const res = await upsertPackagingComponent({
      ...valid,
      itemId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    });

    expect(res).toEqual({ ok: false, error: 'invalid_input' });
    expect(ctx.calls.some((c) => /insert into public\.packaging_components/i.test(c.sql))).toBe(false);
  });

  it('persists optional itemId to packaging_components.item_id', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const itemId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    const res = await upsertPackagingComponent({ ...valid, itemId });

    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });
    const validation = ctx.calls.find((c) => /from public\.items/i.test(c.sql));
    expect(validation?.params).toEqual([itemId]);

    const insert = ctx.calls.find((c) => /insert into public\.packaging_components/i.test(c.sql));
    expect(insert).toBeTruthy();
    expect(insert!.sql).toContain('item_id');
    expect(insert!.params).toContain(itemId);
  });
});

describe('deletePackagingComponent — zod + RBAC', () => {
  it('returns invalid_input for a non-uuid id', async () => {
    const res = await deletePackagingComponent({ id: 'x', projectId: PROJECT_ID });
    expect(res).toEqual({ ok: false, error: 'invalid_input', message: expect.any(String) });
    expect(ctx.calls).toHaveLength(0);
  });

  it('returns forbidden when the caller lacks npd.packaging.write', async () => {
    const res = await deletePackagingComponent({ id: COMPONENT_ID, projectId: PROJECT_ID });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(ctx.calls[0]?.params[2]).toBe('npd.packaging.write');
  });

  it('deletes + audits on the happy path', async () => {
    ctx.grantedPerms.add(PACKAGING_WRITE_PERMISSION);
    const res = await deletePackagingComponent({ id: COMPONENT_ID, projectId: PROJECT_ID });
    expect(res).toEqual({ ok: true, data: { id: 'new-component-id' } });
    expect(ctx.calls.find((c) => /insert into\s+public\.audit_log/i.test(c.sql))).toBeTruthy();
  });
});
