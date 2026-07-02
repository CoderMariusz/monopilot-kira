import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCustomer,
  getCustomer,
  listCustomers,
  setCustomerActive,
  updateCustomer,
} from './customer-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const ADDRESS_ID = '44444444-4444-4444-8444-444444444444';

let client: QueryClient;
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];
let hasPermission = true;

const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: revalidatePath }));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function customerRow(over: Record<string, unknown> = {}) {
  return {
    id: CUSTOMER_ID,
    customer_code: 'CUST-2026-00001',
    name: 'Acme Retail',
    email: 'orders@acme.test',
    phone: null,
    tax_id: null,
    category: 'retail',
    credit_limit_gbp: null,
    is_active: true,
    address_count: 2,
    created_at: '2026-06-25T10:00:00.000Z',
    updated_at: '2026-06-25T10:00:00.000Z',
    ...over,
  };
}

function addressRow(over: Record<string, unknown> = {}) {
  return {
    id: ADDRESS_ID,
    customer_id: CUSTOMER_ID,
    address_type: 'shipping',
    is_default: true,
    address_line1: '1 High St',
    address_line2: null,
    city: 'London',
    state: null,
    postal_code: 'SW1A 1AA',
    country_iso2: 'GB',
    notes: null,
    created_at: '2026-06-25T10:00:00.000Z',
    updated_at: '2026-06-25T10:00:00.000Z',
    ...over,
  };
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return hasPermission ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (q.startsWith('select max((substring(customer_code')) {
        return { rows: [{ max_seq: 4 }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.customers')) {
        return { rows: [customerRow({ id: CUSTOMER_ID, customer_code: params[0], name: params[1] })], rowCount: 1 };
      }
      if (q.startsWith('update public.customers') && q.includes('is_active = $2')) {
        return { rows: [customerRow({ is_active: params[1] })], rowCount: 1 };
      }
      if (q.startsWith('update public.customers') && q.includes('customer_code = $2')) {
        return { rows: [customerRow({ name: params[2], customer_code: params[1] })], rowCount: 1 };
      }
      if (q.includes('from public.customers c') && q.includes('address_count')) {
        if (q.includes('where c.id = $1::uuid')) {
          return { rows: [customerRow()], rowCount: 1 };
        }
        return { rows: [customerRow(), customerRow({ id: 'other', customer_code: 'CUST-2026-00002', name: 'Other' })], rowCount: 2 };
      }
      if (q.includes('from public.customer_addresses') && q.includes('customer_id = $1::uuid')) {
        return { rows: [addressRow()], rowCount: 1 };
      }
      if (q.startsWith('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

beforeEach(() => {
  queryLog = [];
  hasPermission = true;
  client = makeClient();
  revalidatePath.mockClear();
});

describe('createCustomer', () => {
  it('rejects a missing name before opening org context', async () => {
    const result = await createCustomer({ category: 'retail', isActive: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(queryLog).toEqual([]);
  });

  it('inserts an org-scoped customer through app.current_org_id() and returns the id', async () => {
    const result = await createCustomer({ name: 'Acme Retail', category: 'retail', isActive: true });
    expect(result).toMatchObject({ ok: true, id: CUSTOMER_ID });
    const insert = queryLog.find((entry) => normalize(entry.sql).startsWith('insert into public.customers'));
    expect(insert, 'customer insert query').toBeTruthy();
    expect(normalize(insert!.sql)).toContain('values (app.current_org_id(), $1, $2');
  });
});

describe('listCustomers', () => {
  it('returns address counts from an org-scoped subquery', async () => {
    const result = await listCustomers();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]?.addressCount).toBe(2);
    }
    const list = queryLog.find((entry) => normalize(entry.sql).includes('address_count'));
    expect(list, 'list with address_count').toBeTruthy();
    expect(normalize(list!.sql)).toContain('app.current_org_id()');
  });
});

describe('getCustomer', () => {
  it('rejects invalid uuid before org context', async () => {
    const result = await getCustomer('not-a-uuid');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(queryLog).toEqual([]);
  });

  it('loads customer and addresses scoped to app.current_org_id()', async () => {
    const result = await getCustomer(CUSTOMER_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.addresses).toHaveLength(1);
      expect(result.data.addresses[0]?.addressLine1).toBe('1 High St');
    }
    expect(queryLog.some((e) => normalize(e.sql).includes('from public.customer_addresses'))).toBe(true);
  });
});

describe('updateCustomer', () => {
  it('rejects invalid input before org context', async () => {
    const result = await updateCustomer({ customerId: 'bad', code: 'X', name: 'Y', category: 'retail', isActive: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(queryLog).toEqual([]);
  });

  it('returns forbidden when ship.so.create is missing', async () => {
    hasPermission = false;
    const result = await updateCustomer({
      customerId: CUSTOMER_ID,
      code: 'CUST-2026-00001',
      name: 'Updated',
      category: 'retail',
      isActive: true,
    });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('updates through org-scoped where clause', async () => {
    const result = await updateCustomer({
      customerId: CUSTOMER_ID,
      code: 'CUST-2026-00001',
      name: 'Updated Name',
      category: 'wholesale',
      isActive: true,
    });
    expect(result.ok).toBe(true);
    const update = queryLog.find((e) => normalize(e.sql).startsWith('update public.customers'));
    expect(normalize(update!.sql)).toContain('org_id = app.current_org_id()');
  });
});

describe('setCustomerActive', () => {
  it('toggles is_active with permission gate ship.so.create', async () => {
    hasPermission = false;
    const denied = await setCustomerActive({ customerId: CUSTOMER_ID, isActive: false });
    expect(denied).toEqual({ ok: false, error: 'forbidden' });

    hasPermission = true;
    const result = await setCustomerActive({ customerId: CUSTOMER_ID, isActive: false });
    expect(result.ok).toBe(true);
    const update = queryLog.find((e) => normalize(e.sql).includes('is_active = $2'));
    expect(update?.params?.[1]).toBe(false);
  });
});
