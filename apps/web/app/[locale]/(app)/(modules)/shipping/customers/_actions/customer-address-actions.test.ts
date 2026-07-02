import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCustomerAddress,
  deactivateCustomerAddress,
  setDefaultShippingAddress,
  updateCustomerAddress,
} from './customer-address-actions';

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
let customerExists = true;
let addressType = 'shipping';
let liveRefCount = 0;

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

function addressRow(over: Record<string, unknown> = {}) {
  return {
    id: ADDRESS_ID,
    customer_id: CUSTOMER_ID,
    address_type: 'shipping',
    is_default: false,
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

const validAddressInput = {
  customerId: CUSTOMER_ID,
  addressType: 'shipping' as const,
  isDefault: false,
  addressLine1: '1 High St',
  city: 'London',
  postalCode: 'SW1A 1AA',
  countryIso2: 'GB',
};

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return hasPermission ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.customers') && q.includes('select true as ok')) {
        return customerExists ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (q.includes('select address_type') && q.includes('from public.customer_addresses')) {
        return { rows: [{ address_type: addressType }], rowCount: 1 };
      }
      if (q.includes('select') && q.includes('ref_count') && q.includes('sales_orders')) {
        return { rows: [{ ref_count: String(liveRefCount) }], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_addresses') && q.includes('deleted_at = now()')) {
        return { rows: [{ id: ADDRESS_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_addresses') && q.includes('is_default = false') && !q.includes('deleted_at')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('insert into public.customer_addresses')) {
        return { rows: [addressRow({ address_line1: params[3], is_default: params[2] })], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_addresses') && q.includes('address_type = $3')) {
        return { rows: [addressRow({ address_line1: params[4] })], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_addresses') && q.includes('is_default = true')) {
        return { rows: [addressRow({ is_default: true })], rowCount: 1 };
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
  customerExists = true;
  addressType = 'shipping';
  liveRefCount = 0;
  client = makeClient();
  revalidatePath.mockClear();
});

describe('createCustomerAddress', () => {
  it('rejects invalid country code before org context', async () => {
    const result = await createCustomerAddress({ ...validAddressInput, countryIso2: 'GBR' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(queryLog).toEqual([]);
  });

  it('returns forbidden without ship.so.create (seed 212:199)', async () => {
    hasPermission = false;
    const result = await createCustomerAddress(validAddressInput);
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('inserts with app.current_org_id() org scope', async () => {
    const result = await createCustomerAddress(validAddressInput);
    expect(result.ok).toBe(true);
    const insert = queryLog.find((e) => normalize(e.sql).startsWith('insert into public.customer_addresses'));
    expect(normalize(insert!.sql)).toContain('app.current_org_id()');
  });
});

describe('updateCustomerAddress', () => {
  it('returns not_found when customer is missing in org', async () => {
    customerExists = false;
    const result = await updateCustomerAddress({ ...validAddressInput, addressId: ADDRESS_ID });
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('updates through org_id = app.current_org_id()', async () => {
    const result = await updateCustomerAddress({
      ...validAddressInput,
      addressId: ADDRESS_ID,
      addressLine1: '2 Low St',
    });
    expect(result.ok).toBe(true);
    const update = queryLog.find((e) => normalize(e.sql).includes('address_type = $3'));
    expect(normalize(update!.sql)).toContain('org_id = app.current_org_id()');
  });
});

describe('deactivateCustomerAddress', () => {
  it('soft-deletes via deleted_at scoped to org', async () => {
    const result = await deactivateCustomerAddress({ customerId: CUSTOMER_ID, addressId: ADDRESS_ID });
    expect(result.ok).toBe(true);
    const update = queryLog.find((e) => normalize(e.sql).includes('deleted_at = now()'));
    expect(normalize(update!.sql)).toContain('org_id = app.current_org_id()');
  });

  // F4(b): deactivate blocked when a referencing SO exists
  it('returns address_in_use when live SO references the address', async () => {
    liveRefCount = 1;
    const result = await deactivateCustomerAddress({ customerId: CUSTOMER_ID, addressId: ADDRESS_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('address_in_use');
    // must NOT have issued the soft-delete update
    expect(queryLog.some((e) => normalize(e.sql).includes('deleted_at = now()'))).toBe(false);
  });

  it('allows deactivate when all references are terminal (ref_count = 0)', async () => {
    liveRefCount = 0;
    const result = await deactivateCustomerAddress({ customerId: CUSTOMER_ID, addressId: ADDRESS_ID });
    expect(result.ok).toBe(true);
  });
});

describe('setDefaultShippingAddress', () => {
  it('rejects billing addresses', async () => {
    addressType = 'billing';
    const result = await setDefaultShippingAddress({ customerId: CUSTOMER_ID, addressId: ADDRESS_ID });
    expect(result).toEqual({ ok: false, error: 'invalid_input' });
  });

  it('clears other defaults then sets shipping default', async () => {
    const result = await setDefaultShippingAddress({ customerId: CUSTOMER_ID, addressId: ADDRESS_ID });
    expect(result.ok).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).includes('is_default = false'))).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).includes('is_default = true'))).toBe(true);
  });

  // F4(c): 23505 on set-default maps to already_exists (UQ index fires if concurrent race)
  it('maps 23505 from the set-default write to already_exists', async () => {
    const pg23505 = Object.assign(new Error('duplicate key'), { code: '23505' });
    // override the client so the is_default=true update throws 23505
    client = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        queryLog.push({ sql, params });
        const q = normalize(sql);
        if (q.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
        if (q.includes('select address_type')) return { rows: [{ address_type: 'shipping' }], rowCount: 1 };
        if (q.includes('is_default = false') && !q.includes('deleted_at = now()')) return { rows: [], rowCount: 1 };
        if (q.includes('is_default = true')) throw pg23505;
        if (q.startsWith('insert into public.audit_events')) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };
    const result = await setDefaultShippingAddress({ customerId: CUSTOMER_ID, addressId: ADDRESS_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('already_exists');
  });
});

describe('updateCustomerAddress — clear-then-set rollback (F4a)', () => {
  // F4(a): when the target UPDATE affects 0 rows after clearDefault already ran,
  // the function must throw (not return ok:false), so withOrgContext rolls back.
  // The mock withOrgContext does not actually roll back, but we verify:
  //   (1) the result is not_found (thrown + caught correctly), AND
  //   (2) the is_default=false clear DID run before the failure — proving it
  //       would have been committed had we used `return` instead of `throw`.
  it('returns not_found (via Abort throw) when target row missing after clearDefault', async () => {
    // override so the UPDATE with address_type=$3 returns empty rows
    client = {
      query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
        queryLog.push({ sql, params });
        const q = normalize(sql);
        if (q.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
        if (q.includes('from public.customers') && q.includes('select true as ok')) return { rows: [{ ok: true }], rowCount: 1 };
        // clearDefaultForType runs first — succeeds (1 row)
        if (q.includes('is_default = false') && !q.includes('deleted_at = now()')) return { rows: [], rowCount: 1 };
        // the main UPDATE returns empty → triggers Abort throw
        if (q.includes('address_type = $3')) return { rows: [], rowCount: 0 };
        if (q.startsWith('insert into public.audit_events')) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    };
    const result = await updateCustomerAddress({
      ...validAddressInput,
      addressId: ADDRESS_ID,
      isDefault: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not_found');
    // clearDefault ran before the failure
    expect(queryLog.some((e) => normalize(e.sql).includes('is_default = false'))).toBe(true);
  });
});
