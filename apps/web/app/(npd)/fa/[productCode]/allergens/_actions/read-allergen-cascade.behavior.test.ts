import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_CODE = 'FG-001';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

type QueryCall = { sql: string; params: unknown[] };

type FakeClient = {
  calls: QueryCall[];
  grantTechnicalWrite: boolean;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(grantTechnicalWrite: boolean): FakeClient {
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    grantTechnicalWrite,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.includes('from public.fa_allergen_cascade')) {
        return {
          rows: [{
            product_code: PRODUCT_CODE,
            derived_allergens: ['gluten'],
            published_allergens: ['gluten'],
            may_contain_allergens: [],
            conditional_process_allergens: [],
          }],
          rowCount: 1,
        };
      }

      if (norm.includes('from "reference"."allergens"')) {
        return {
          rows: [{ allergen_code: 'gluten', display_name: 'Gluten' }],
          rowCount: 1,
        };
      }

      if (norm.includes('from public.user_roles') && norm.includes('permission = any($3::text[])')) {
        const permissions = params[2] as string[];
        expect(permissions).toEqual(['npd.allergen.write', 'technical.write', 'quality.write']);
        if (!client.grantTechnicalWrite) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient(true);
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
  );
});

describe('readAllergenCascade — write gate mirrors setAllergenOverride RBAC (C1d)', () => {
  it('grants canWrite for technical.write only (no npd.allergen.write)', async () => {
    const { readAllergenCascade } = await import('./read-allergen-cascade');

    const result = await readAllergenCascade(PRODUCT_CODE, 'en');

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        productCode: PRODUCT_CODE,
        canWrite: true,
      }),
    });

    const permissionCall = currentClient.calls.find(
      (call) => call.sql.includes('permission = any($3::text[])'),
    );
    expect(permissionCall).toBeDefined();
    expect(permissionCall!.sql).toContain("r.code = 'npd_manager'");
    expect(permissionCall!.sql).toContain('coalesce(r.permissions');
    expect(permissionCall!.sql).toContain('?| $3::text[]');
  });

  it('denies canWrite when the user lacks all override write permissions', async () => {
    currentClient = makeClient(false);
    _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client: currentClient }),
    );

    const { readAllergenCascade } = await import('./read-allergen-cascade');
    const result = await readAllergenCascade(PRODUCT_CODE, 'en');

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ canWrite: false }),
    });
  });
});
