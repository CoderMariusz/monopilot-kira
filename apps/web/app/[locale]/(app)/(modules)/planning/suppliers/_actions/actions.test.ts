import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupplier, getSupplier, listSuppliers, transitionSupplierStatus, updateSupplier } from './actions';
import type { QueryClient } from '../../_actions/procurement-shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333';

let client: QueryClient;
let allowPermission = true;
let supplierExists = true;

const revalidatePath = vi.fn();
vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SUPPLIER_ID,
    code: 'SUP-TEST-01',
    name: 'Test Supplier',
    contact_jsonb: { email: 'orders@example.test' },
    currency: 'EUR',
    lead_time_days: 5,
    status: 'active',
    notes: null,
    created_at: '2026-06-10T08:00:00.000Z',
    updated_at: '2026-06-10T08:00:00.000Z',
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }
      if (normalized.startsWith('select id, code, name')) {
        return { rows: supplierExists ? [row()] : [], rowCount: supplierExists ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.suppliers')) {
        return { rows: [row()], rowCount: 1 };
      }
      if (normalized.startsWith('select status from public.suppliers')) {
        return { rows: supplierExists ? [{ status: 'active' }] : [], rowCount: supplierExists ? 1 : 0 };
      }
      if (normalized.startsWith('update public.suppliers') && normalized.includes('set name =')) {
        return { rows: supplierExists ? [row({ code: 'SUP-TEST-02', name: 'Updated Supplier', lead_time_days: 7, notes: 'Updated notes' })] : [], rowCount: supplierExists ? 1 : 0 };
      }
      if (normalized.startsWith('update public.suppliers')) {
        return { rows: supplierExists ? [row({ status: 'blocked' })] : [], rowCount: supplierExists ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('planning suppliers actions', () => {
  beforeEach(() => {
    allowPermission = true;
    supplierExists = true;
    client = makeClient();
    revalidatePath.mockClear();
  });

  it('lists suppliers under app.current_org_id scope', async () => {
    const result = await listSuppliers({ status: 'active', q: 'SUP' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data[0]).toEqual(expect.objectContaining({ code: 'SUP-TEST-01', leadTimeDays: 5 }));
    expect(vi.mocked(client.query).mock.calls[0]?.[0]).toContain('app.current_org_id()');
  });

  it('gets one supplier or not_found', async () => {
    await expect(getSupplier(SUPPLIER_ID)).resolves.toEqual(expect.objectContaining({ ok: true }));
    supplierExists = false;
    await expect(getSupplier(SUPPLIER_ID)).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  it('creates suppliers with planning write permission and audit event', async () => {
    const result = await createSupplier({ code: 'SUP-TEST-01', name: 'Test Supplier', leadTimeDays: 5 });

    expect(result.ok).toBe(true);
    expect(vi.mocked(client.query).mock.calls.some(([sql]) => sql.includes('insert into public.audit_events'))).toBe(true);
  });

  it('revalidates the supplier list + detail paths after a create (family-a round-trip)', async () => {
    const result = await createSupplier({ code: 'SUP-TEST-01', name: 'Test Supplier', leadTimeDays: 5 });

    expect(result.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith('/planning/suppliers', 'page');
    expect(revalidatePath).toHaveBeenCalledWith(`/planning/suppliers/${SUPPLIER_ID}`, 'page');
  });

  it('revalidates the supplier paths after a status transition (family-a round-trip)', async () => {
    const result = await transitionSupplierStatus(SUPPLIER_ID, 'blocked');

    expect(result.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith('/planning/suppliers', 'page');
    expect(revalidatePath).toHaveBeenCalledWith(`/planning/suppliers/${SUPPLIER_ID}`, 'page');
  });

  it('rejects create when caller lacks planning write permission', async () => {
    allowPermission = false;
    await expect(createSupplier({ code: 'SUP-TEST-01', name: 'Test Supplier' })).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('updates suppliers with planning write permission and audit before/after payload', async () => {
    const result = await updateSupplier({
      id: SUPPLIER_ID,
      code: 'SUP-TEST-02',
      name: 'Updated Supplier',
      contact: { email: 'updated@example.test' },
      currency: 'EUR',
      leadTimeDays: 7,
      status: 'active',
      notes: 'Updated notes',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data).toEqual(expect.objectContaining({ code: 'SUP-TEST-02', name: 'Updated Supplier', leadTimeDays: 7 }));
    expect(
      vi.mocked(client.query).mock.calls.some(([sql, params]) => (
        sql.includes('insert into public.audit_events') && params?.[2] === 'planning.supplier.updated'
      )),
    ).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith('/planning/suppliers', 'page');
    expect(revalidatePath).toHaveBeenCalledWith(`/planning/suppliers/${SUPPLIER_ID}`, 'page');
  });

  it('rejects update when caller lacks planning write permission', async () => {
    allowPermission = false;
    await expect(updateSupplier({
      id: SUPPLIER_ID,
      code: 'SUP-TEST-02',
      name: 'Updated Supplier',
      leadTimeDays: 7,
    })).resolves.toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when updating a missing supplier', async () => {
    supplierExists = false;
    await expect(updateSupplier({
      id: SUPPLIER_ID,
      code: 'SUP-TEST-02',
      name: 'Updated Supplier',
      leadTimeDays: 7,
    })).resolves.toEqual({ ok: false, error: 'not_found' });
  });

  it('transitions supplier status with an audit before/after payload', async () => {
    const result = await transitionSupplierStatus(SUPPLIER_ID, 'blocked');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.status).toBe('blocked');
    expect(
      vi.mocked(client.query).mock.calls.some(([sql, params]) => (
        sql.includes('insert into public.audit_events') && params?.[2] === 'planning.supplier.status_changed'
      )),
    ).toBe(true);
  });
});
