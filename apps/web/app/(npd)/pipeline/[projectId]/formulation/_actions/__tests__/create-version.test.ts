import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INGREDIENT_CLONE_BUSINESS_COLUMNS,
  VERSION_CLONE_BUSINESS_COLUMNS,
} from '../create-version-clone-columns';
import { createFormulationVersion } from '../create-version';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const FORMULATION_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_VERSION_ID = '55555555-5555-4555-8555-555555555555';
const NEW_VERSION_ID = '66666666-6666-4666-8666-666666666666';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let grantedPermissions: Set<string>;
let client: QueryClient;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const normalized = normalize(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: grantedPermissions.has('npd.formulation.create_draft') ? [{ ok: true }] : [] };
      }

      if (normalized.includes('from public.formulations f') && normalized.includes('for update')) {
        return {
          rows: [{ id: FORMULATION_ID, current_version_id: SOURCE_VERSION_ID }],
        };
      }

      if (normalized.includes('coalesce(max(version_number)')) {
        return { rows: [{ n: 2 }] };
      }

      if (normalized.includes('insert into public.formulation_versions')) {
        return { rows: [{ id: NEW_VERSION_ID, version_number: 2 }] };
      }

      if (normalized.includes('insert into public.formulation_ingredients')) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('update public.formulations')) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('insert into public.formulation_audit_log')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [] };
    }),
  };
}

beforeEach(() => {
  grantedPermissions = new Set(['npd.formulation.create_draft']);
  client = makeClient();
});

describe('createFormulationVersion', () => {
  it('clones every business column on version header and ingredient rows', async () => {
    const result = await createFormulationVersion({ projectId: PROJECT_ID });
    expect(result).toEqual({
      ok: true,
      data: { versionId: NEW_VERSION_ID, versionNumber: 2 },
    });

    const versionInsert = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.formulation_versions'),
    );
    expect(versionInsert).toBeDefined();
    const versionSql = normalize(String(versionInsert?.[0] ?? ''));
    for (const column of VERSION_CLONE_BUSINESS_COLUMNS) {
      expect(versionSql).toContain(column);
    }
    expect(versionSql).toContain('processing_overhead_pct');

    const ingredientInsert = client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('insert into public.formulation_ingredients'),
    );
    expect(ingredientInsert).toBeDefined();
    const ingredientSql = normalize(String(ingredientInsert?.[0] ?? ''));
    for (const column of INGREDIENT_CLONE_BUSINESS_COLUMNS) {
      expect(ingredientSql).toContain(column);
    }
    expect(ingredientSql).toContain('cost_currency');
    expect(ingredientSql).toContain('substitute_item_id');
    expect(ingredientSql).toContain('wip_definition_id');
    expect(ingredientSql).toContain('npd_wip_process_id');
  });

  it('forbids without npd.formulation.create_draft', async () => {
    grantedPermissions.clear();
    const result = await createFormulationVersion({ projectId: PROJECT_ID });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });
});
