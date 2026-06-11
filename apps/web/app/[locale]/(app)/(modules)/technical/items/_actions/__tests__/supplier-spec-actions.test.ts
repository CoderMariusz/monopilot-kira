import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  validateRmUsability,
  type RmSupplierSpecInput,
} from '../../../../../../../../lib/technical/rm-usability';

type Call = { sql: string; params: readonly unknown[] };

const ctx = {
  orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  grantedPerms: new Set<string>(),
  itemId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as string | null,
  supplierCode: 'SUP-XYZ' as string | null,
  // simulate whether an active+approved row already exists (for the !approve dup guard)
  hasActiveApproved: false,
  calls: [] as Call[],
  // captured INSERT params + the inserted/updated flag we hand back
  insertedFlag: true,
};

function fakeClient() {
  return {
    async query(sql: string, params: readonly unknown[] = []) {
      ctx.calls.push({ sql, params });
      const s = sql.replace(/\s+/g, ' ').toLowerCase();

      if (s.includes('from public.user_roles ur')) {
        const perm = params[2] as string;
        return { rows: ctx.grantedPerms.has(perm) ? [{ ok: true }] : [] };
      }
      if (s.includes('from public.items')) {
        return { rows: ctx.itemId ? [{ id: ctx.itemId }] : [] };
      }
      if (s.includes('from public.suppliers')) {
        return { rows: ctx.supplierCode ? [{ code: ctx.supplierCode }] : [] };
      }
      // the !approve duplicate guard select
      if (s.includes('from public.supplier_specs') && s.includes('lifecycle_status = \'active\'')) {
        return { rows: ctx.hasActiveApproved ? [{ id: 'dup' }] : [] };
      }
      if (s.includes('insert into public.supplier_specs')) {
        return { rows: [{ id: 'spec-1', inserted: ctx.insertedFlag }] };
      }
      if (s.includes('into public.audit_log')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({ orgId: ctx.orgId, userId: ctx.userId, sessionToken: 't', client: fakeClient() }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { ITEMS_EDIT_PERMISSION } from '../shared';
import { createItemSupplierSpec } from '../supplier-spec-actions';

beforeEach(() => {
  ctx.grantedPerms = new Set<string>([ITEMS_EDIT_PERMISSION]);
  ctx.itemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  ctx.supplierCode = 'SUP-XYZ';
  ctx.hasActiveApproved = false;
  ctx.insertedFlag = true;
  ctx.calls = [];
});
afterEach(() => vi.clearAllMocks());

const baseInput = {
  itemCode: 'RM-1',
  supplierId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  specVersion: 'v1',
  effectiveFrom: '2026-01-01',
  expiryDate: '2031-01-01',
  approveNow: true,
};

/** Reconstruct the RmSupplierSpecInput the rm-usability service reads from the
 *  exact columns the action's INSERT wrote. */
function specInputFromInsert(insert: Call): RmSupplierSpecInput {
  // INSERT column order: org_id, item_id, supplier_code, supplier_status,
  // spec_version, issued_date, effective_from, expiry_date, lifecycle_status,
  // review_status, cost_review_blocked(false), spec_review_blocked(false), uploaded_by
  const p = insert.params;
  return {
    supplierCode: String(p[1]), // supplier_code positional in values list = $2 → params[1]
    supplierStatus: String(p[2]),
    specVersion: undefined as never, // not read by rm-usability
    lifecycleStatus: String(p[7]),
    reviewStatus: String(p[8]),
    effectiveFrom: (p[5] as string | null) ?? null,
    expiryDate: (p[6] as string | null) ?? null,
    costReviewBlocked: false,
    specReviewBlocked: false,
  } as unknown as RmSupplierSpecInput;
}

describe('createItemSupplierSpec', () => {
  it('rejects when the caller lacks technical.items.edit (forbidden)', async () => {
    ctx.grantedPerms = new Set<string>();
    const res = await createItemSupplierSpec(baseInput);
    expect(res).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns item_not_found when the item_code does not resolve', async () => {
    ctx.itemId = null;
    const res = await createItemSupplierSpec(baseInput);
    expect(res).toEqual({ ok: false, error: 'item_not_found' });
  });

  it('returns supplier_not_found when the supplierId does not resolve', async () => {
    ctx.supplierCode = null;
    const res = await createItemSupplierSpec(baseInput);
    expect(res).toEqual({ ok: false, error: 'supplier_not_found' });
  });

  it('rejects invalid input (bad uuid / expiry before effective)', async () => {
    expect((await createItemSupplierSpec({ ...baseInput, supplierId: 'not-a-uuid' })).ok).toBe(false);
    const bad = await createItemSupplierSpec({ ...baseInput, effectiveFrom: '2031-01-01', expiryDate: '2026-01-01' });
    expect(bad).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  it('writes an APPROVED+ACTIVE row whose columns SATISFY the rm-usability supplier gates', async () => {
    const res = await createItemSupplierSpec(baseInput);
    expect(res.ok).toBe(true);

    const insert = ctx.calls.find((c) =>
      c.sql.replace(/\s+/g, ' ').toLowerCase().includes('insert into public.supplier_specs'),
    );
    expect(insert).toBeDefined();

    // Assert the literal written status columns the predicate reads.
    const p = insert!.params;
    expect(p[2]).toBe('approved'); // supplier_status → SUPPLIER_NOT_APPROVED gate
    expect(p[7]).toBe('active'); // lifecycle_status
    expect(p[8]).toBe('approved'); // review_status

    // Run the REAL usability service against those exact columns: both supplier
    // reasons must be GREEN (out of blockingReasons) in the hard-block context.
    const spec = specInputFromInsert(insert!);
    const verdict = validateRmUsability({
      context: 'factory_spec_approval', // the hard-block seam
      item: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'active' },
      supplier: spec,
      rmAllergens: [],
      targetFgForbiddenAllergens: [],
      qcRelease: { required: false },
      now: new Date('2026-06-11T00:00:00Z'),
    });
    expect(verdict.blockingReasons).not.toContain('SUPPLIER_NOT_APPROVED');
    expect(verdict.blockingReasons).not.toContain('SUPPLIER_SPEC_NOT_ACTIVE');
  });

  it('writes pending/draft when approveNow=false (warnings stay — nothing silently approved)', async () => {
    const res = await createItemSupplierSpec({ ...baseInput, approveNow: false });
    expect(res.ok).toBe(true);
    const insert = ctx.calls.find((c) =>
      c.sql.replace(/\s+/g, ' ').toLowerCase().includes('insert into public.supplier_specs'),
    )!;
    expect(insert.params[2]).toBe('pending'); // supplier_status
    expect(insert.params[7]).toBe('draft'); // lifecycle_status
    expect(insert.params[8]).toBe('pending'); // review_status

    const spec = specInputFromInsert(insert);
    const verdict = validateRmUsability({
      context: 'factory_spec_approval',
      item: { id: 'x', status: 'active' },
      supplier: spec,
      rmAllergens: [],
      targetFgForbiddenAllergens: [],
      qcRelease: { required: false },
      now: new Date('2026-06-11T00:00:00Z'),
    });
    expect(verdict.blockingReasons).toContain('SUPPLIER_NOT_APPROVED');
    expect(verdict.blockingReasons).toContain('SUPPLIER_SPEC_NOT_ACTIVE');
  });

  it('is idempotent-honest: !approve with an existing active+approved row → already_exists', async () => {
    ctx.hasActiveApproved = true;
    const res = await createItemSupplierSpec({ ...baseInput, approveNow: false });
    expect(res).toEqual({ ok: false, error: 'already_exists' });
  });

  it('reports updated=true when the upsert hit the partial-unique conflict (xmax != 0)', async () => {
    ctx.insertedFlag = false; // DO UPDATE path
    const res = await createItemSupplierSpec(baseInput);
    expect(res).toMatchObject({ ok: true, data: { updated: true } });
  });
});
