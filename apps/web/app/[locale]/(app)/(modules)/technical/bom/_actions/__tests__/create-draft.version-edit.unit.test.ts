import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_HEADER_ID = '33333333-3333-4333-8333-333333333333';
const DRAFT_HEADER_ID = '44444444-4444-4444-8444-444444444444';

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

function makeClient(editCalls: { decision: string }[]): {
  calls: QueryCall[];
  query: ReturnType<typeof vi.fn>;
} {
  const calls: QueryCall[] = [];
  let editIndex = 0;
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalize(sql);
    if (n.includes('from public.bom_headers header') && n.includes('header.status')) {
      return { rows: [{ status: 'active' }], rowCount: 1 };
    }
    if (n.includes('header.product_id')) {
      return { rows: [{ product_id: 'FG-1' }], rowCount: 1 };
    }
    if (n.includes('from public.bom_headers header') && n.includes('for update')) {
      return { rows: [{ id: DRAFT_HEADER_ID }], rowCount: 1 };
    }
    if (n.includes('bom_request_version_edit')) {
      const row = editCalls[editIndex] ?? editCalls[editCalls.length - 1]!;
      editIndex += 1;
      return {
        rows: [
          {
            decision: row.decision,
            bom_header_id: DRAFT_HEADER_ID,
            status: 'in_review',
            version: 3,
            supersedes_bom_header_id: SOURCE_HEADER_ID,
          },
        ],
        rowCount: 1,
      };
    }
    if (n.includes('from public.product') && n.includes('product_code')) {
      return { rows: [{ product_code: 'FG-1' }], rowCount: 1 };
    }
    if (n.includes('from public.bom_headers') && n.includes('active')) return { rows: [], rowCount: 0 };
    if (n.includes('from public.items') && n.includes('item_code')) {
      return { rows: [{ item_code: 'FG-1', name: 'FG', status: 'active', item_type: 'fg' }], rowCount: 1 };
    }
    if (n.startsWith('update public.bom_headers header')) return { rows: [], rowCount: 1 };
    if (n.startsWith('delete from public.bom_lines')) return { rows: [], rowCount: 1 };
    if (n.startsWith('delete from public.bom_co_products')) return { rows: [], rowCount: 1 };
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

describe('createBomDraft clone-on-write lineage (N-20)', () => {
  it('routes immutable-version forks through bom_request_version_edit with supersedes lineage', async () => {
    const client = makeClient([{ decision: 'cloned' }]);
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { createBomDraft } = await import('../create-draft');
    const result = await createBomDraft({
      productId: 'FG-1',
      sourceBomHeaderId: SOURCE_HEADER_ID,
      lines: [{ componentCode: 'RM-1', quantity: 1, uom: 'kg' }],
    });

    expect(result).toEqual({ ok: true, data: { id: DRAFT_HEADER_ID, version: 3, warnings: [] } });
    expect(client.calls.some((call) => normalize(call.sql).includes('bom_request_version_edit'))).toBe(true);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('insert into public.bom_headers'))).toBe(false);
  });

  it('reuses the same in-flight draft when bom_request_version_edit returns existing', async () => {
    const client = makeClient([{ decision: 'existing' }, { decision: 'existing' }]);
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { createBomDraft } = await import('../create-draft');
    const payload = {
      productId: 'FG-1',
      sourceBomHeaderId: SOURCE_HEADER_ID,
      lines: [{ componentCode: 'RM-1', quantity: 1, uom: 'kg' }],
    };
    const first = await createBomDraft(payload);
    const second = await createBomDraft(payload);

    expect(first).toEqual({ ok: true, data: { id: DRAFT_HEADER_ID, version: 3, warnings: [] } });
    expect(second).toEqual({ ok: true, data: { id: DRAFT_HEADER_ID, version: 3, warnings: [] } });
    expect(client.calls.filter((call) => normalize(call.sql).includes('bom_request_version_edit'))).toHaveLength(2);
  });
});

describe('ensureBomVersionEditDraft idempotency (N-20)', () => {
  it('returns the canonical draft id from bom_request_version_edit', async () => {
    const client = makeClient([{ decision: 'existing' }]);
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { ensureBomVersionEditDraft } = await import('../request-version-edit');
    const result = await ensureBomVersionEditDraft({ sourceBomHeaderId: SOURCE_HEADER_ID });

    expect(result).toEqual({
      ok: true,
      data: {
        id: DRAFT_HEADER_ID,
        version: 3,
        decision: 'existing',
        supersedesBomHeaderId: SOURCE_HEADER_ID,
      },
    });
  });
});
