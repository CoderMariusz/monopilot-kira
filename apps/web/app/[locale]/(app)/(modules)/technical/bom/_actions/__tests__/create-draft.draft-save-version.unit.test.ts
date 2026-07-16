import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_HEADER_ID = '33333333-3333-4333-8333-333333333333';
const NEW_HEADER_ID = '44444444-4444-4444-8444-444444444444';
const FG_ITEM_ID = '55555555-5555-4555-8555-555555555555';

type QueryCall = { sql: string; params: readonly unknown[] };

const runWithOrgContext = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>();
  return {
    ...actual,
    hasPermission: vi.fn(async () => true),
    validateBomLineRmUsability: vi.fn(async () => []),
    writeAudit: vi.fn(async () => undefined),
    writeOutbox: vi.fn(async () => undefined),
  };
});
vi.mock('../revalidate', () => ({ safeRevalidatePath: vi.fn() }));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(sourceStatus: string): {
  calls: QueryCall[];
  query: ReturnType<typeof vi.fn>;
} {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalize(sql);
    if (n.includes('parent_item_code')) {
      return {
        rows: [{ parent_item_code: 'FG-1', status: sourceStatus, version: 1 }],
        rowCount: 1,
      };
    }
    if (n.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
    if (n.includes('coalesce(max(version), 0) + 1') && n.includes('item_id = $1::uuid')) {
      return { rows: [{ next_version: 2 }], rowCount: 1 };
    }
    if (n.startsWith('insert into public.bom_headers') && n.includes('supersedes_bom_header_id')) {
      return { rows: [{ id: NEW_HEADER_ID }], rowCount: 1 };
    }
    if (n.includes("set status = 'archived'")) return { rows: [], rowCount: 1 };
    if (n.includes('from public.product') && n.includes('product_code')) {
      return { rows: [{ product_code: 'FG-1' }], rowCount: 1 };
    }
    if (n.includes('from public.bom_headers') && n.includes('active')) return { rows: [], rowCount: 0 };
    if (n.includes('from public.items') && n.includes('item_code')) {
      return {
        rows: [{ id: FG_ITEM_ID, item_code: 'FG-1', name: 'FG', status: 'active', item_type: 'fg' }],
        rowCount: 1,
      };
    }
    if (n.startsWith('insert into public.bom_lines')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.bom_co_products')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.audit_log')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
    throw new Error(`Unhandled SQL: ${n}`);
  });
  return { calls, query };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('createBomDraft draft save-version (C048)', () => {
  it('creates v2 draft and archives draft source without bom_request_version_edit', async () => {
    const client = makeClient('draft');
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { createBomDraft } = await import('../create-draft');
    const result = await createBomDraft({
      productId: 'FG-1',
      sourceBomHeaderId: SOURCE_HEADER_ID,
      notes: 'v2 — corrected component qty before review',
      lines: [{ componentCode: 'RM-1', quantity: 0.666667, uom: 'kg' }],
    });

    expect(result).toEqual({ ok: true, data: { id: NEW_HEADER_ID, version: 2, warnings: [] } });
    expect(client.calls.some((call) => normalize(call.sql).includes('bom_request_version_edit'))).toBe(false);
    expect(client.calls.some((call) => normalize(call.sql).includes("set status = 'archived'"))).toBe(true);
    const lineInsert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.bom_lines'));
    expect(lineInsert?.params?.[5]).toBe('0.666667');
  });

  it('returns invalid_state with message for superseded source (not generic persistence_failed)', async () => {
    const client = makeClient('superseded');
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { createBomDraft } = await import('../create-draft');
    const result = await createBomDraft({
      productId: 'FG-1',
      sourceBomHeaderId: SOURCE_HEADER_ID,
      lines: [{ componentCode: 'RM-1', quantity: 1, uom: 'kg' }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_state');
    expect(result.message).toMatch(/superseded/i);
    expect(client.calls.some((call) => normalize(call.sql).includes('bom_request_version_edit'))).toBe(false);
  });
});
