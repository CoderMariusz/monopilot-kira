import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updatePurchaseOrder } from '../actions';
import type { QueryClient } from '../../../_actions/procurement-shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PO_ID = '33333333-3333-4333-8333-333333333333';
const SUPPLIER_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function header(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PO_ID,
    po_number: 'PO-TEST-001',
    supplier_id: SUPPLIER_ID,
    supplier_code: 'SUP-TEST-01',
    supplier_name: 'Test Supplier',
    status: 'draft',
    expected_delivery: '2026-06-18',
    currency: 'EUR',
    notes: 'existing note',
    created_at: '2026-06-10T08:00:00.000Z',
    updated_at: '2026-06-10T08:00:00.000Z',
    ...overrides,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (normalized.includes('from public.purchase_orders po') && normalized.includes('for update of po')) {
        return { rows: [header()], rowCount: 1 };
      }
      if (normalized.startsWith('update public.purchase_orders')) {
        const expectedDeliveryPresent = params[6] === true;
        const notesPresent = params[7] === true;
        return {
          rows: [
            header({
              supplier_id: params[1] ?? SUPPLIER_ID,
              expected_delivery: expectedDeliveryPresent ? (params[2] === '' ? null : params[2]) : '2026-06-18',
              currency: params[3] ?? 'EUR',
              notes: notesPresent ? (params[4] === '' ? null : params[4]) : 'existing note',
            }),
          ],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('select l.id') && normalized.includes('left join public.items')) {
        return { rows: [], rowCount: 0 };
      }
      if (normalized.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

function purchaseOrderUpdateCall() {
  const call = vi.mocked(client.query).mock.calls.find(([sql]) => String(sql).trim().startsWith('update public.purchase_orders'));
  if (!call) throw new Error('missing purchase order update call');
  return call;
}

describe('planning purchase order nullable draft update fields', () => {
  beforeEach(() => {
    client = makeClient();
  });

  it('clears expectedDelivery and notes when empty strings are present', async () => {
    const result = await updatePurchaseOrder({ id: PO_ID, expectedDelivery: '', notes: '' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.expectedDelivery).toBeNull();
    expect(result.data.notes).toBeNull();

    const [sql, params] = purchaseOrderUpdateCall();
    expect(String(sql)).toContain("expected_delivery = case when $7::boolean then nullif($3, '')::date else expected_delivery end");
    expect(String(sql)).toContain("notes = case when $8::boolean then nullif($5, '') else notes end");
    expect(String(sql)).not.toContain('expected_delivery = coalesce');
    expect(String(sql)).not.toContain('notes = coalesce');
    expect(params).toEqual([PO_ID, null, '', null, '', USER_ID, true, true]);
  });

  it('keeps old expectedDelivery and notes when fields are omitted', async () => {
    const result = await updatePurchaseOrder({ id: PO_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.expectedDelivery).toBe('2026-06-18');
    expect(result.data.notes).toBe('existing note');

    const [, params] = purchaseOrderUpdateCall();
    expect(params).toEqual([PO_ID, null, null, null, null, USER_ID, false, false]);
  });

  it('sets expectedDelivery when a valid date is present', async () => {
    const result = await updatePurchaseOrder({ id: PO_ID, expectedDelivery: '2026-01-01' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.expectedDelivery).toBe('2026-01-01');

    const [, params] = purchaseOrderUpdateCall();
    expect(params).toEqual([PO_ID, null, '2026-01-01', null, null, USER_ID, true, false]);
  });
});
