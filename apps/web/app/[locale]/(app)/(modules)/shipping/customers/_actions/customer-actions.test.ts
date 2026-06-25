import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCustomer } from './customer-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';

let client: QueryClient;
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];

const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath }));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queryLog.push({ sql, params });
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.startsWith('select max((substring(customer_code')) {
        return { rows: [{ max_seq: 4 }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.customers')) {
        return {
          rows: [
            {
              id: CUSTOMER_ID,
              customer_code: params[0],
              name: params[1],
              email: params[2],
              phone: params[3],
              tax_id: params[4],
              category: params[5],
              credit_limit_gbp: params[6],
              is_active: params[7],
              created_at: '2026-06-25T10:00:00.000Z',
              updated_at: '2026-06-25T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
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
    expect(normalize(insert!.sql)).toContain('(org_id, customer_code, name, email, phone, tax_id, category, credit_limit_gbp, is_active, created_by, updated_by)');
    expect(normalize(insert!.sql)).toContain('values (app.current_org_id(), $1, $2');
    expect(insert!.params).toEqual([
      'CUST-2026-00005',
      'Acme Retail',
      null,
      null,
      null,
      'retail',
      null,
      true,
      USER_ID,
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/shipping');
    expect(revalidatePath).toHaveBeenCalledWith('/shipping/customers');
  });
});
