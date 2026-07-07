import { signEvent } from '@monopilot/e-sign';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { approveReleaseBundle, type QueryClient } from '../release-bundle-service';

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({ signatureId: '99999999-9999-4999-8999-999999999999' })),
}));

const FACTORY_SPEC_ID = '11111111-1111-4111-8111-111111111111';
const BOM_HEADER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const ORG_ID = '55555555-5555-4555-8555-555555555555';
const PROJECT_ID = '66666666-6666-4666-8666-666666666666';
const RELEASE_STATUS_ID = '77777777-7777-4777-8777-777777777777';

const approveInput = {
  factorySpecId: FACTORY_SPEC_ID,
  bomHeaderId: BOM_HEADER_ID,
  pin: '135790',
  reason: 'factory release',
};

type FactorySpecRow = {
  id: string;
  fg_item_id: string;
  status: string;
  bom_header_id: string | null;
  bom_version: number | null;
};

type BomRow = {
  id: string;
  status: string;
  version: number;
  product_id: string | null;
  npd_project_id: string | null;
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createClient(options: { bomStatus: string; specBomVersion?: number; bomVersion?: number }) {
  const spec: FactorySpecRow = {
    id: FACTORY_SPEC_ID,
    fg_item_id: FG_ITEM_ID,
    status: 'in_review',
    bom_header_id: BOM_HEADER_ID,
    bom_version: options.specBomVersion ?? 7,
  };
  const bom: BomRow = {
    id: BOM_HEADER_ID,
    status: options.bomStatus,
    version: options.bomVersion ?? 7,
    product_id: 'FG-5101',
    npd_project_id: PROJECT_ID,
  };
  const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];

  const client: QueryClient = {
    async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) {
      calls.push({ sql, params });
      const n = normalize(sql);

      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }] as T[] };
      if (n.includes('from public.factory_specs') && n.startsWith('select')) {
        if (n.includes('for update')) {
          return { rows: (spec.status === 'in_review' ? [{ ...spec }] : []) as T[] };
        }
        return { rows: [{ ...spec }] as T[] };
      }
      if (n.includes('from public.bom_headers') && n.startsWith('select')) return { rows: [{ ...bom }] as T[] };
      if (n.includes('from public.bom_lines') && n.includes('count(*)::int as blocked')) {
        return { rows: [{ blocked: 0 }] as T[] };
      }
      // F2 — FG↔product consistency probe: the spec's FG item carries the BOM's
      // product code in this fixture (fg_item_id ↔ 'FG-5101').
      if (n.includes('from public.items i') && n.includes('i.item_code = $2')) {
        return { rows: (params?.[0] === FG_ITEM_ID && params?.[1] === bom.product_id ? [{ ok: true }] : []) as T[] };
      }
      if (n.startsWith('update public.factory_specs') && n.includes("set status = 'superseded'")) {
        return { rows: [] as T[] };
      }
      if (n.startsWith('update public.factory_specs')) {
        if (spec.status !== 'in_review') return { rows: [] as T[] };
        spec.status = 'approved_for_factory';
        spec.bom_header_id = params?.[1] as string;
        spec.bom_version = params?.[2] as number;
        return { rows: [{ id: spec.id }] as T[] };
      }
      if (n.startsWith('update public.bom_headers')) {
        if (bom.status !== 'draft' && bom.status !== 'in_review') return { rows: [] as T[] };
        bom.status = 'technical_approved';
        return { rows: [{ id: bom.id }] as T[] };
      }
      if (n.startsWith('insert into public.outbox_events')) return { rows: [{ id: 100 }] as T[] };
      if (n.startsWith('update public.factory_release_status')) return { rows: [{ id: RELEASE_STATUS_ID }] as T[] };
      if (n.startsWith('insert into public.audit_log')) return { rows: [] as T[] };

      throw new Error(`Unhandled SQL: ${n}`);
    },
  };

  return { client, calls, spec, bom };
}

function ctx(client: QueryClient) {
  return { userId: USER_ID, orgId: ORG_ID, client };
}

describe('release bundle approval BOM status compatibility', () => {
  beforeEach(() => {
    vi.mocked(signEvent).mockClear();
  });

  it('approves a bundle with an active BOM without regressing the BOM status', async () => {
    const { client, calls, bom } = createClient({ bomStatus: 'active' });

    const result = await approveReleaseBundle(ctx(client), approveInput);

    expect(result).toMatchObject({
      ok: true,
      data: {
        factorySpecId: FACTORY_SPEC_ID,
        bomHeaderId: BOM_HEADER_ID,
        factorySpecStatus: 'approved_for_factory',
        bomStatus: 'active',
        factoryReleaseStatusId: RELEASE_STATUS_ID,
      },
    });
    expect(bom.status).toBe('active');
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.bom_headers'))).toBe(false);
    expect(calls.find((call) => normalize(call.sql).startsWith('update public.factory_release_status'))?.params).toEqual([
      ORG_ID,
      PROJECT_ID,
      'FG-5101',
      BOM_HEADER_ID,
      FACTORY_SPEC_ID,
      USER_ID,
      100,
    ]);
  });

  it('approves a bundle with a technical_approved BOM without rewriting the BOM status', async () => {
    const { client, calls, bom } = createClient({ bomStatus: 'technical_approved' });

    const result = await approveReleaseBundle(ctx(client), approveInput);

    expect(result).toMatchObject({ ok: true, data: { bomStatus: 'technical_approved' } });
    expect(bom.status).toBe('technical_approved');
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.bom_headers'))).toBe(false);
  });

  it('still moves a draft BOM to technical_approved during bundle approval', async () => {
    const { client, calls, bom } = createClient({ bomStatus: 'draft' });

    const result = await approveReleaseBundle(ctx(client), approveInput);

    expect(result).toMatchObject({ ok: true, data: { bomStatus: 'technical_approved' } });
    expect(bom.status).toBe('technical_approved');
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.bom_headers'))).toBe(true);
  });

  it('rejects a spec/BOM version mismatch before signing or mutating', async () => {
    const { client, calls } = createClient({ bomStatus: 'active', specBomVersion: 6, bomVersion: 7 });

    const result = await approveReleaseBundle(ctx(client), approveInput);

    expect(result).toMatchObject({ ok: false, error: 'invalid_state' });
    expect(vi.mocked(signEvent)).not.toHaveBeenCalled();
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.factory_specs'))).toBe(false);
    expect(calls.some((call) => normalize(call.sql).startsWith('update public.bom_headers'))).toBe(false);
  });

  it('does not supersede prior factory-usable specs when the target approval update fails', async () => {
    const { client, calls, spec } = createClient({ bomStatus: 'active' });
    const originalQuery = client.query.bind(client);
    client.query = async (sql, params) => {
      const n = normalize(sql);
      if (
        n.startsWith('update public.factory_specs') &&
        n.includes("set status = 'approved_for_factory'")
      ) {
        return { rows: [] };
      }
      return originalQuery(sql, params);
    };

    const result = await approveReleaseBundle(ctx(client), approveInput);

    expect(result).toMatchObject({ ok: false, error: 'invalid_state', message: 'factory_spec no longer in_review' });
    expect(spec.status).toBe('in_review');
    expect(calls.some((call) => normalize(call.sql).includes("set status = 'superseded'"))).toBe(false);
  });

  it('supersedes prior factory-usable specs only after the target approval update succeeds', async () => {
    const { client, calls } = createClient({ bomStatus: 'active' });

    const result = await approveReleaseBundle(ctx(client), approveInput);

    expect(result.ok).toBe(true);
    const approveIdx = calls.findIndex(
      (call) =>
        normalize(call.sql).startsWith('update public.factory_specs') &&
        normalize(call.sql).includes("set status = 'approved_for_factory'"),
    );
    const supersedeIdx = calls.findIndex((call) => normalize(call.sql).includes("set status = 'superseded'"));
    expect(approveIdx).toBeGreaterThanOrEqual(0);
    expect(supersedeIdx).toBeGreaterThan(approveIdx);
  });
});
