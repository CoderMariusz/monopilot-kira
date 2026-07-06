import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ProductionContext, type QueryClient } from '../shared';
import { startWo } from '../start-wo';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '44444444-4444-4444-8444-444444444444';
const BOM_HEADER_ID = '55555555-5555-4555-8555-555555555555';
const FACTORY_SPEC_ID = '66666666-6666-4666-8666-666666666666';
const SCHEDULE_OUTPUT_ID = '77777777-7777-4777-8777-777777777777';
const PRODUCT_ID = '88888888-8888-4888-8888-888888888888';
const TXN_ID = '99999999-9999-4999-8999-999999999999';

let client: QueryClient;
let woSiteId: string | null = SITE_ID;
let activeBomHeaderId: string | null = BOM_HEADER_ID;
let activeFactorySpecId: string | null = FACTORY_SPEC_ID;
let factorySpecSiteId: string | null = SITE_ID;
let factorySpecBomHeaderId: string | null = BOM_HEADER_ID;
let placeholderSiteId: string | null | undefined;

vi.mock('../../technical/bom/snapshot', () => ({
  createBomSnapshot: vi.fn(async () => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })),
}));

vi.mock('../wo-state-machine', () => ({
  applyTransition: vi.fn(async () => ({
    ok: true,
    data: { startedAt: '2026-07-02T12:00:00.000Z' },
  })),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (q.includes('from public.work_orders') && q.startsWith('select')) {
        return {
          rows: [
            {
              id: WO_ID,
              site_id: woSiteId,
              active_bom_header_id: activeBomHeaderId,
              active_factory_spec_id: activeFactorySpecId,
              allergen_profile_snapshot: null,
              production_line_id: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('from public.bom_headers') || q.includes('from public.factory_specs')) {
        return {
          rows: [
            {
              bom_exists: activeBomHeaderId !== null,
              spec_exists: activeFactorySpecId !== null,
              spec_site_id: factorySpecSiteId,
              spec_bom_header_id: factorySpecBomHeaderId,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('from public.changeover_events')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.includes('from public.schedule_outputs')) {
        return {
          rows: [
            {
              id: SCHEDULE_OUTPUT_ID,
              product_id: PRODUCT_ID,
              output_role: 'primary',
              expected_qty: '100',
              uom: 'kg',
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('insert into public.wo_outputs')) {
        placeholderSiteId = params[7] === null ? null : String(params[7]);
        return { rows: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }], rowCount: 1 };
      }
      if (q.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
}

function makeCtx(): ProductionContext {
  return { userId: USER_ID, orgId: ORG_ID, client };
}

describe('startWo placeholder output site stamping', () => {
  beforeEach(() => {
    woSiteId = SITE_ID;
    activeBomHeaderId = BOM_HEADER_ID;
    activeFactorySpecId = FACTORY_SPEC_ID;
    factorySpecSiteId = SITE_ID;
    factorySpecBomHeaderId = BOM_HEADER_ID;
    placeholderSiteId = undefined;
    client = makeClient();
  });

  it('stamps materialized placeholder wo_outputs with the source WO site_id', async () => {
    const result = await startWo(makeCtx(), { woId: WO_ID, transactionId: TXN_ID });

    expect(result.ok).toBe(true);
    expect(placeholderSiteId).toBe(SITE_ID);
  });

  it('leaves placeholder wo_outputs.site_id null when the WO has no site', async () => {
    woSiteId = null;

    const result = await startWo(makeCtx(), { woId: WO_ID, transactionId: TXN_ID });

    expect(result.ok).toBe(true);
    expect(placeholderSiteId).toBeNull();
  });

  it('fails closed when the WO factory-release snapshot is missing and never self-heals at start', async () => {
    activeBomHeaderId = null;
    activeFactorySpecId = null;

    const result = await startWo(makeCtx(), { woId: WO_ID, transactionId: TXN_ID });

    expect(result).toMatchObject({
      ok: false,
      error: 'wo_snapshot_missing',
      status: 409,
      details: {
        code: 'wo_snapshot_missing',
        missing: { activeBomHeader: true, activeFactorySpec: true },
        remediation: 'release_work_order',
      },
    });
    expect(placeholderSiteId).toBeUndefined();
    expect(
      (client.query as ReturnType<typeof vi.fn>).mock.calls.some((call) =>
        normalize(String(call[0])).startsWith('update public.work_orders'),
      ),
    ).toBe(false);
  });

  it('rejects a cross-site factory spec binding on the WO snapshot', async () => {
    const OTHER_SITE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    factorySpecSiteId = OTHER_SITE;

    const result = await startWo(makeCtx(), { woId: WO_ID, transactionId: TXN_ID });

    expect(result).toMatchObject({
      ok: false,
      error: 'factory_release_incomplete',
      details: {
        code: 'cross_site_factory_spec',
        woSiteId: SITE_ID,
        specSiteId: OTHER_SITE,
      },
    });
    expect(placeholderSiteId).toBeUndefined();
  });
});
