import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCustomerAllergenRestriction,
  deleteCustomerAllergenRestriction,
  listAllergenReferenceOptions,
  updateCustomerAllergenRestriction,
} from './customer-allergen-actions';
import { shippingAllergenReferenceId } from './customer-allergen-reference';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_ID = '33333333-3333-4333-8333-333333333333';
const RESTRICTION_ID = '44444444-4444-4444-8444-444444444444';
const ALLERGEN_ID = shippingAllergenReferenceId(ORG_ID, 'milk');

let client: QueryClient;
let queryLog: Array<{ sql: string; params: readonly unknown[] }> = [];
let hasPermission = true;
let customerExists = true;
let allergenExists = true;

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Matches SQL against canonical `"Reference"."Allergens"` after normalize(). */
function referencesCanonicalAllergens(sql: string): boolean {
  return normalize(sql).includes('"reference"."allergens"');
}

function restrictionRow(over: Record<string, unknown> = {}) {
  return {
    id: RESTRICTION_ID,
    customer_id: CUSTOMER_ID,
    allergen_id: ALLERGEN_ID,
    allergen_name: 'Milk',
    restriction_type: 'refuses',
    notes: 'No dairy',
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
      if (q.includes('from public.customers') && q.includes('deleted_at is null')) {
        return customerExists ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.customer_allergen_restrictions car')) {
        return { rows: [restrictionRow()], rowCount: 1 };
      }
      if (referencesCanonicalAllergens(sql)) {
        if (q.includes('order by name asc')) {
          return {
            rows: [{ id: ALLERGEN_ID, name: 'Milk' }],
            rowCount: 1,
          };
        }
        return allergenExists ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (q.startsWith('insert into public.customer_allergen_restrictions')) {
        return { rows: [{ id: RESTRICTION_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_allergen_restrictions') && q.includes('set allergen_id')) {
        return { rows: [{ id: RESTRICTION_ID }], rowCount: 1 };
      }
      if (q.startsWith('update public.customer_allergen_restrictions') && q.includes('set deleted_at')) {
        return { rows: [{ id: RESTRICTION_ID }], rowCount: 1 };
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
  allergenExists = true;
  client = makeClient();
});

describe('listAllergenReferenceOptions', () => {
  it('returns canonical allergen ids resolved via shipping_allergen_reference_id', async () => {
    const result = await listAllergenReferenceOptions();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).toEqual([{ id: ALLERGEN_ID, name: 'Milk' }]);
    expect(result.data[0]?.id).toBe(shippingAllergenReferenceId(ORG_ID, 'milk'));

    const listQuery = queryLog.find(
      (entry) =>
        normalize(entry.sql).includes('shipping_allergen_reference_id') &&
        normalize(entry.sql).includes('order by name asc'),
    );
    expect(listQuery).toBeTruthy();
    expect(normalize(listQuery!.sql)).toMatch(
      /shipping_allergen_reference_id\s*\(\s*ra\.org_id\s*,\s*ra\.allergen_code\s*\)/,
    );
  });
});

describe('createCustomerAllergenRestriction', () => {
  it('inserts an org-scoped restriction and writes audit', async () => {
    const result = await createCustomerAllergenRestriction({
      customerId: CUSTOMER_ID,
      allergenId: ALLERGEN_ID,
      restrictionType: 'refuses',
      notes: 'No dairy',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.allergenName).toBe('Milk');
      expect(result.data.restrictionType).toBe('refuses');
    }
    const insert = queryLog.find((e) => normalize(e.sql).startsWith('insert into public.customer_allergen_restrictions'));
    expect(insert?.params?.[0]).toBe(CUSTOMER_ID);
    expect(queryLog.some((e) => normalize(e.sql).startsWith('insert into public.audit_events'))).toBe(true);
  });

  it('rejects unknown allergen reference before insert', async () => {
    allergenExists = false;
    const result = await createCustomerAllergenRestriction({
      customerId: CUSTOMER_ID,
      allergenId: ALLERGEN_ID,
      restrictionType: 'refuses',
    });
    expect(result).toEqual({ ok: false, error: 'invalid_input', message: 'Unknown allergen reference' });
    expect(
      queryLog.some(
        (e) =>
          normalize(e.sql).includes('shipping_allergen_reference_id') &&
          e.params?.[0] === ALLERGEN_ID,
      ),
    ).toBe(true);
    expect(queryLog.some((e) => normalize(e.sql).startsWith('insert into public.customer_allergen_restrictions'))).toBe(
      false,
    );
  });
});

describe('updateCustomerAllergenRestriction', () => {
  it('updates restriction through org-scoped where clause', async () => {
    const result = await updateCustomerAllergenRestriction({
      customerId: CUSTOMER_ID,
      restrictionId: RESTRICTION_ID,
      allergenId: ALLERGEN_ID,
      restrictionType: 'requires_decl',
    });
    expect(result.ok).toBe(true);
    const update = queryLog.find(
      (e) => normalize(e.sql).startsWith('update public.customer_allergen_restrictions') && e.params?.[3] === 'requires_decl',
    );
    expect(update).toBeTruthy();
    expect(normalize(update!.sql)).toContain('org_id = app.current_org_id()');
  });
});

describe('deleteCustomerAllergenRestriction', () => {
  it('soft-deletes restriction and writes audit', async () => {
    const result = await deleteCustomerAllergenRestriction({
      customerId: CUSTOMER_ID,
      restrictionId: RESTRICTION_ID,
    });
    expect(result).toEqual({ ok: true, data: { id: RESTRICTION_ID } });
    expect(queryLog.some((e) => normalize(e.sql).includes('set deleted_at = now()'))).toBe(true);
  });
});
