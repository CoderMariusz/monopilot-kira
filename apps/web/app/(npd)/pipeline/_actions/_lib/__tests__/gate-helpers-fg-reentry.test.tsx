import { describe, expect, it, vi } from 'vitest';

import {
  createFgCandidate,
  GateActionError,
  type GateProjectRow,
} from '../gate-helpers';
import type { OrgContextLike, QueryResult } from '../../shared';

const ORG_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '10000000-0000-4000-8000-000000000002';
const PROJECT_ID = '10000000-0000-4000-8000-000000000003';
const OTHER_PROJECT_ID = '10000000-0000-4000-8000-000000000099';
const FG_ITEM_ID = '10000000-0000-4000-8000-000000000010';

type QueryHandler = (sql: string, params?: readonly unknown[]) => QueryResult;

function makeProject(overrides: Partial<GateProjectRow> = {}): GateProjectRow {
  return {
    id: PROJECT_ID,
    code: 'NPD-123',
    name: 'Resume FG',
    type: 'single',
    current_gate: 'G3',
    current_stage: 'packaging',
    product_code: null,
    ...overrides,
  };
}

function makeCtx(handler: QueryHandler): OrgContextLike & { queries: string[] } {
  const queries: string[] = [];
  return {
    orgId: ORG_ID,
    userId: USER_ID,
    queries,
    client: {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        queries.push(sql);
        return handler(sql, params);
      }),
    },
  };
}

/** Idempotent repair side-effects for a fully-linked resume (no row changes). */
function fullyLinkedRepairHandler(
  productCode: string,
  overrides: Partial<{
    productExists: boolean;
    formulationBackfillRows: number;
    projectBackfillRows: number;
    itemLinkRows: number;
    factorySpecInsertRows: number;
  }> = {},
): QueryHandler {
  const {
    productExists = true,
    formulationBackfillRows = 0,
    projectBackfillRows = 0,
    itemLinkRows = 0,
    factorySpecInsertRows = 0,
  } = overrides;

  return (sql) => {
    if (sql.includes('update public.org_document_settings')) {
      throw new Error('next_seq must not be consumed on resume');
    }
    if (sql.includes('from public.formulations') && sql.includes('select product_code')) {
      return { rows: [] };
    }
    if (sql.includes('from public.product') && sql.includes('select')) {
      return productExists ? { rows: [{ product_code: productCode }] } : { rows: [] };
    }
    if (sql.includes('insert into public.product')) {
      return { rows: [{ product_code: productCode }], rowCount: 1 };
    }
    if (sql.includes('update public.npd_projects') && sql.includes('product_code')) {
      return { rows: [], rowCount: projectBackfillRows };
    }
    if (sql.includes('update public.formulations') && sql.includes('product_code')) {
      return { rows: [], rowCount: formulationBackfillRows };
    }
    if (sql.includes('update public.items') && sql.includes('npd_project_id')) {
      return { rows: [], rowCount: itemLinkRows };
    }
    if (sql.includes('from public.items') && sql.includes('select id')) {
      return { rows: [{ id: FG_ITEM_ID }] };
    }
    if (sql.includes('insert into public.factory_specs')) {
      return { rows: factorySpecInsertRows > 0 ? [{ id: 'spec-1' }] : [], rowCount: factorySpecInsertRows };
    }
    if (sql.includes('from public.npd_projects') && sql.includes('pack_weight_g')) {
      return { rows: [{ pack_weight_g: null, target_retail_price_eur: null, expected_volume: null, packs_per_case: null }] };
    }
    if (sql.includes('update public.product') && sql.includes('weight')) {
      return { rows: [] };
    }
    if (sql.includes('insert into public.outbox_events')) {
      return { rows: [] };
    }
    if (sql.includes('from public.npd_projects') && sql.includes('id <>')) {
      return { rows: [] };
    }
    throw new Error(`unexpected query: ${sql}`);
  };
}

describe('createFgCandidate — packaging re-entry', () => {
  it('returns the existing linked FG without burning next_seq when project.product_code is set', async () => {
    const ctx = makeCtx(fullyLinkedRepairHandler('FG0042'));

    const result = await createFgCandidate(ctx, makeProject({ product_code: 'FG0042' }));

    expect(result).toEqual({ productCode: 'FG0042', created: false, mapped: false });
    expect(ctx.queries.some((q) => q.includes('update public.org_document_settings'))).toBe(false);
    expect(ctx.queries.some((q) => q.includes('insert into public.product'))).toBe(false);
  });

  it('resumes when the caller passes the same requestedProductCode as the linked FG', async () => {
    const ctx = makeCtx(fullyLinkedRepairHandler('FG0099'));

    const result = await createFgCandidate(ctx, makeProject({ product_code: 'FG0099' }), 'FG0099');

    expect(result).toEqual({ productCode: 'FG0099', created: false, mapped: false });
    expect(ctx.queries.some((q) => q.includes('update public.org_document_settings'))).toBe(false);
  });

  it('repairs a partial link: backfills formulation and inserts the missing product without generating a new code', async () => {
    const ctx = makeCtx(
      fullyLinkedRepairHandler('FG0042', {
        productExists: false,
        formulationBackfillRows: 1,
        factorySpecInsertRows: 1,
      }),
    );

    const result = await createFgCandidate(ctx, makeProject({ product_code: 'FG0042' }));

    expect(result).toEqual({ productCode: 'FG0042', created: true, mapped: true });
    expect(ctx.queries.some((q) => q.includes('update public.org_document_settings'))).toBe(false);
    expect(ctx.queries.some((q) => q.includes('insert into public.product'))).toBe(true);
    expect(ctx.queries.some((q) => q.includes('update public.formulations'))).toBe(true);
    expect(ctx.queries.some((q) => q.includes('insert into public.factory_specs'))).toBe(true);
  });

  it('throws FG_LINK_MISMATCH when project and formulation product_code disagree', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = makeCtx((sql) => {
      if (sql.includes('from public.formulations') && sql.includes('select product_code')) {
        return { rows: [{ product_code: 'FG9999' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    await expect(
      createFgCandidate(ctx, makeProject({ product_code: 'FG0042' })),
    ).rejects.toMatchObject({ code: 'FG_LINK_MISMATCH', status: 409 });
    expect(warnSpy).toHaveBeenCalledWith(
      '[npd/gate-helpers] FG_LINK_MISMATCH',
      expect.objectContaining({
        projectProductCode: 'FG0042',
        formulationProductCode: 'FG9999',
      }),
    );
    warnSpy.mockRestore();
  });

  it('throws FG_ALREADY_LINKED when an explicit requested code belongs to another active project', async () => {
    const ctx = makeCtx((sql, params) => {
      if (sql.includes('from public.formulations')) return { rows: [] };
      if (sql.includes('from public.npd_projects') && sql.includes('id <>')) {
        expect(params?.[1]).toBe('FG7777');
        return { rows: [{ id: OTHER_PROJECT_ID, product_code: 'FG7777' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    await expect(createFgCandidate(ctx, makeProject(), 'FG7777')).rejects.toMatchObject({
      code: 'FG_ALREADY_LINKED',
      status: 409,
    });
    expect(ctx.queries.some((q) => q.includes('insert into public.product'))).toBe(false);
  });

  it('throws FG_ALREADY_LINKED when a linked project is re-entered with a different explicit code', async () => {
    const ctx = makeCtx((sql) => {
      if (sql.includes('update public.org_document_settings')) {
        throw new Error('next_seq must not be consumed when linked FG differs');
      }
      if (sql.includes('from public.formulations')) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    });

    await expect(
      createFgCandidate(ctx, makeProject({ product_code: 'FG0042' }), 'FG9999'),
    ).rejects.toBeInstanceOf(GateActionError);
  });
});
