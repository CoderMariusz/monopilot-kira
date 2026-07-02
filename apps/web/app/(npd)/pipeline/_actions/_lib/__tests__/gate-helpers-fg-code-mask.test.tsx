import { describe, expect, it, vi } from 'vitest';

import {
  createFgCandidate,
  peekSuggestedFgCandidateCode,
  type GateProjectRow,
} from '../gate-helpers';
import type { OrgContextLike, QueryResult } from '../../shared';

const ORG_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '10000000-0000-4000-8000-000000000002';
const PROJECT_ID = '10000000-0000-4000-8000-000000000003';

type QueryHandler = (sql: string, params?: readonly unknown[]) => QueryResult;

function makeProject(overrides: Partial<GateProjectRow> = {}): GateProjectRow {
  return {
    id: PROJECT_ID,
    code: 'NPD-123',
    name: 'Masked FG',
    type: 'single',
    current_gate: 'G2',
    current_stage: 'recipe',
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

function createCandidateHandler(codeMaskRow: QueryResult['rows'][number] | null): QueryHandler {
  return (sql) => {
    if (sql.includes('update public.org_document_settings')) {
      return { rows: codeMaskRow ? [codeMaskRow] : [] };
    }
    if (sql.includes('from public.formulations')) return { rows: [] };
    if (sql.includes('from public.npd_projects')) return { rows: [] };
    if (sql.includes('from public.product')) return { rows: [] };
    if (sql.includes('insert into public.product')) return { rows: [{ product_code: 'ignored-by-test' }] };
    if (sql.includes('update public.npd_projects')) return { rows: [] };
    if (sql.includes('update public.formulations')) return { rows: [] };
    if (sql.includes('update public.items')) return { rows: [] };
    if (sql.includes('from public.items')) return { rows: [{ id: 'item-1' }] };
    if (sql.includes('insert into public.factory_specs')) return { rows: [{ id: 'spec-1' }], rowCount: 1 };
    if (sql.includes('insert into public.outbox_events')) return { rows: [] };
    throw new Error(`unexpected query: ${sql}`);
  };
}

describe('FG candidate code-mask generation', () => {
  it('createFgCandidate uses the fg mask code when nextEntityCode is configured', async () => {
    const ctx = makeCtx(createCandidateHandler({ old_seq: 7, code_mask: 'FGxxxx' }));

    const result = await createFgCandidate(ctx, makeProject());

    expect(result).toMatchObject({ productCode: 'FG0007', created: true, mapped: true });
    expect(ctx.queries.some((sql) => sql.includes('update public.org_document_settings'))).toBe(true);
    expect(ctx.queries.some((sql) => sql.includes('insert into public.product'))).toBe(true);
  });

  it.each([
    ['entity_code_settings_missing', null],
    ['entity_code_mask_missing', { old_seq: 7, code_mask: null }],
  ])('createFgCandidate falls back to FG-<number> (NPD prefix stripped) when nextEntityCode throws %s', async (_label, row) => {
    const ctx = makeCtx(createCandidateHandler(row));

    const result = await createFgCandidate(ctx, makeProject());

    // Plan→FG: NPD-123 → FG-123 (the "NPD-" project prefix is dropped, not carried into the FG code).
    expect(result).toMatchObject({ productCode: 'FG-123', created: true, mapped: true });
  });

  it('suggested-code peek renders the fg mask without incrementing next_seq', async () => {
    const ctx = makeCtx((sql) => {
      if (sql.includes('update public.org_document_settings')) {
        throw new Error('peek must not increment next_seq');
      }
      if (sql.includes('from public.org_document_settings')) {
        return { rows: [{ next_seq: 42, code_mask: 'FGxxxx' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const suggestedCode = await peekSuggestedFgCandidateCode(ctx.client, ORG_ID, 'NPD-123');

    expect(suggestedCode).toBe('FG0042');
    expect(ctx.queries).toHaveLength(1);
    expect(ctx.queries[0]).toContain('select next_seq, code_mask');
  });
});
