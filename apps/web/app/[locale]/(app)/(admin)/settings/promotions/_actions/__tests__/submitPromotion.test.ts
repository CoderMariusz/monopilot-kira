import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitPromotion } from '../submitPromotion';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '11111111-1111-4111-8111-111111111111';

type QueryCall = { sql: string; params: readonly unknown[] };

let queries: QueryCall[];
let insertRows: { id: string; status: string }[];

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }> } }) => Promise<unknown>) =>
      action({
        userId: USER_ID,
        orgId: ORG_ID,
        client: {
          query: async (sql: string, params: readonly unknown[] = []) => {
            queries.push({ sql, params });
            if (sql.includes('from public.user_roles')) {
              return { rows: [{ ok: true }], rowCount: 1 };
            }
            if (sql.includes('insert into public.tenant_migrations')) {
              return { rows: insertRows, rowCount: insertRows.length };
            }
            return { rows: [], rowCount: 0 };
          },
        },
      }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  queries = [];
  insertRows = [{ id: 'tm-new', status: 'scheduled' }];
});

describe('submitPromotion', () => {
  it('uses the scheduled-row partial unique conflict target', async () => {
    const result = await submitPromotion({
      artefact: 'rules.new_variance',
      target: 'L2-local',
      from: 'L3-tenant',
      reason: 'Audit-ready reason',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: 'tm-new',
        status: 'scheduled',
        artefact: 'rules.new_variance',
        target: 'L2-local',
      },
    });
    const insert = queries.find((query) => normalize(query.sql).startsWith('insert into public.tenant_migrations'));
    expect(normalize(insert?.sql ?? '')).toContain(
      "on conflict (org_id, component) where status = 'scheduled' do nothing returning id::text, status",
    );
  });

  it('returns already_scheduled when the conflict path inserts no row', async () => {
    insertRows = [];

    const result = await submitPromotion({
      artefact: 'rules.new_variance',
      target: 'L2-local',
      from: 'L3-tenant',
      reason: 'Audit-ready reason',
    });

    expect(result).toEqual({
      ok: false,
      error: 'already_scheduled',
      message: 'A promotion is already scheduled for this artefact.',
    });
  });
});
