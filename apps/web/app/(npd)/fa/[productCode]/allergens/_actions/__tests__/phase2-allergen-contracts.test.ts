import { beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateApprovalCriteriaWithClient } from '../../../../../pipeline/[projectId]/approval/_actions/evaluate-core';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: mocks.query },
    }),
}));
vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

const PRODUCT_CODE = 'FG-NSA-ALLERGEN';

const permission = {
  source: 'none' as 'none' | 'role_permissions' | 'roles_json',
  engineCalls: 0,
};

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  vi.clearAllMocks();
  permission.source = 'none';
  permission.engineCalls = 0;
  mocks.query.mockImplementation(async (sql: string, params: readonly unknown[] = []) => {
    const query = normalized(sql);
    if (query.includes('from public.user_roles')) {
      const roleGrant =
        permission.source === 'role_permissions' &&
        query.includes('rp.permission is not null');
      const legacyGrant =
        permission.source === 'roles_json' &&
        query.includes("coalesce(r.permissions, '[]'::jsonb) ? $3");
      expect(params[2]).toBe('npd.allergen.write');
      return roleGrant || legacyGrant
        ? { rows: [{ ok: true }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (query.includes('public.update_fa_allergen_set')) {
      permission.engineCalls += 1;
      return {
        rows: [{
          product_code: PRODUCT_CODE,
          allergens: ['gluten'],
          may_contain: [],
          changed: false,
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
});

function approvalClient(options: { processedJob: boolean; declarationAccepted: boolean }) {
  return {
    async query<T>(sql: string) {
      const query = normalized(sql);
      if (query.includes('from public.product')) {
        return {
          rows: [{
            product_code: PRODUCT_CODE,
            allergens: [],
            may_contain: [],
            allergens_declaration_accepted: options.declarationAccepted,
          }] as T[],
        };
      }
      if (query.includes('from public.npd_projects')) {
        return { rows: [{ id: '33333333-3333-4333-8333-333333333333' }] as T[] };
      }
      if (query.includes('from public.formulations')) {
        return {
          rows: [{ locked_at: new Date('2026-07-30T10:00:00.000Z'), locked_version_id: null }] as T[],
        };
      }
      if (query.includes('from public.nutri_score_results')) {
        return { rows: [{ grade: 'B' }] as T[] };
      }
      if (query.includes('from public.costing_breakdowns')) {
        return { rows: [{ margin_pct: '25.00' }] as T[] };
      }
      if (query.includes('from public.allergen_cascade_rebuild_jobs')) {
        return { rows: [{ audited: options.processedJob }] as T[] };
      }
      if (query.includes('from public.risks')) {
        return { rows: [{ open_high_count: '0' }] as T[] };
      }
      if (query.includes('from public.compliance_docs')) {
        return {
          rows: [{ active_count: '1', expired_count: '0', invalid_count: '0' }] as T[],
        };
      }
      return { rows: [] as T[] };
    },
  };
}

describe('Phase 2 NPD allergen contracts', () => {
  it('NSA-068 accepts role_permissions or roles.permissions and rejects when both are absent', async () => {
    const { updateFaAllergenSet } = await import('../update-allergen-set');

    await expect(updateFaAllergenSet({ productCode: PRODUCT_CODE })).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(permission.engineCalls).toBe(0);

    permission.source = 'role_permissions';
    await expect(updateFaAllergenSet({ productCode: PRODUCT_CODE })).resolves.toMatchObject({
      ok: true,
      productCode: PRODUCT_CODE,
    });

    permission.source = 'roles_json';
    await expect(updateFaAllergenSet({ productCode: PRODUCT_CODE })).resolves.toMatchObject({
      ok: true,
      productCode: PRODUCT_CODE,
    });
    expect(permission.engineCalls).toBe(2);
  });

  it.each([
    { processedJob: true, declarationAccepted: false, expected: 'pass' },
    { processedJob: false, declarationAccepted: true, expected: 'pass' },
    { processedJob: false, declarationAccepted: false, expected: 'pending' },
  ])(
    'NSA-073 maps job=$processedJob/declaration=$declarationAccepted to C5=$expected',
    async ({ processedJob, declarationAccepted, expected }) => {
      const result = await evaluateApprovalCriteriaWithClient(
        approvalClient({ processedJob, declarationAccepted }),
        PRODUCT_CODE,
      );

      expect(result.ok).toBe(true);
      expect(result.ok ? result.data.C5 : null).toBe(expected);
    },
  );
});
