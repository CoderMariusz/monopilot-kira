import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCustomerContact,
  deactivateCustomerContact,
  setPrimaryCustomerContact,
  updateCustomerContact,
} from './customer-contact-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const CONTACT_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];
let hasPermission = true;
let customerExists = true;

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

function contactRow(over: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    customer_id: CUSTOMER_ID,
    name: 'Jane Doe',
    title: 'Buyer',
    email: 'jane@example.com',
    phone: '+441234567890',
    is_primary: false,
    created_at: '2026-06-25T10:00:00.000Z',
    updated_at: '2026-06-25T10:00:00.000Z',
    ...over,
  };
}

const validContactInput = {
  customerId: CUSTOMER_ID,
  name: 'Jane Doe',
  email: 'jane@example.com',
  isPrimary: false,
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
      if (q.includes('select id::text as id') && q.includes('from public.customer_contacts')) {
        return { rows: [{ id: CONTACT_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_contacts') && q.includes('is_primary = false') && !q.includes('deleted_at')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('insert into public.customer_contacts')) {
        return { rows: [contactRow({ name: params[1], is_primary: params[5] })], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_contacts') && q.includes('set name = $3')) {
        return { rows: [contactRow({ name: params[2], is_primary: params[6] })], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_contacts') && q.includes('deleted_at = now()')) {
        return { rows: [{ id: CONTACT_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_contacts') && q.includes('is_primary = true')) {
        return { rows: [contactRow({ is_primary: true })], rowCount: 1 };
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
  client = makeClient();
  revalidatePath.mockClear();
});

describe('createCustomerContact', () => {
  it('creates a contact with org scope and audit row', async () => {
    const result = await createCustomerContact(validContactInput);
    expect(result.ok).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).startsWith('insert into public.customer_contacts'))).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).startsWith('insert into public.audit_events'))).toBe(true);
  });

  it('rejects invalid email before org context', async () => {
    const result = await createCustomerContact({ ...validContactInput, email: 'not-an-email' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(queryLog).toEqual([]);
  });
});

describe('setPrimaryCustomerContact', () => {
  it('clears other primaries then sets the selected contact primary', async () => {
    const result = await setPrimaryCustomerContact({ customerId: CUSTOMER_ID, contactId: CONTACT_ID });
    expect(result.ok).toBe(true);
    expect(queryLog.filter((e) => normalize(e.sql).includes('is_primary = false'))).toHaveLength(1);
    expect(queryLog.some((e) => normalize(e.sql).includes('is_primary = true'))).toBe(true);
  });
});

describe('deactivateCustomerContact', () => {
  it('soft-deletes the contact and clears primary flag', async () => {
    const result = await deactivateCustomerContact({ customerId: CUSTOMER_ID, contactId: CONTACT_ID });
    expect(result.ok).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).includes('deleted_at = now()'))).toBe(true);
  });
});

describe('updateCustomerContact', () => {
  it('returns forbidden when RBAC denies write', async () => {
    hasPermission = false;
    const result = await updateCustomerContact({ ...validContactInput, contactId: CONTACT_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('forbidden');
  });
});
