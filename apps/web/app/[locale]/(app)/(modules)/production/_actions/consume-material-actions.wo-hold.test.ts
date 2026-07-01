import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordDesktopConsumption } from './consume-material-actions';
import type { QueryClient } from '../../../../../../lib/production/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const MATERIAL_ID = '44444444-4444-4444-8444-444444444444';
const LP_ID = '66666666-6666-4666-8666-666666666666';

let client: QueryClient;
let queries: Array<{ sql: string; params: readonly unknown[] }>;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
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
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (n.includes('from public.v_active_holds') && n.includes("reference_type = 'wo'")) {
        return {
          rows: [{ hold_id: 'hold-wo-1', reference_type: 'wo', reference_id: WO_ID }],
          rowCount: 1,
        };
      }
      if (n.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`unexpected query after WO hold gate: ${n}`);
    }),
  };
}

beforeEach(() => {
  queries = [];
  client = makeClient();
});

describe('recordDesktopConsumption — WO quality hold gate', () => {
  it('returns quality_hold_active, emits blocked telemetry, and does not mutate stock', async () => {
    const result = await recordDesktopConsumption({
      woId: WO_ID,
      materialId: MATERIAL_ID,
      qty: '2.500',
      lpId: LP_ID,
      clientOpId: 'op-held-wo',
    });

    expect(result).toEqual({ ok: false, reason: 'quality_hold_active' });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.license_plates'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.wo_materials'))).toBe(false);
    expect(queries.some((q) => normalize(q.sql).startsWith('insert into public.wo_material_consumption'))).toBe(false);

    const outbox = queries.find((q) => normalize(q.sql).startsWith('insert into public.outbox_events'));
    expect(outbox).toBeDefined();
    expect(outbox?.params[0]).toBe('production.consume.blocked');
  });
});
