import { beforeEach, describe, expect, it, vi } from 'vitest';

const withOrgContextMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const HEADER_ID = '11111111-1111-4111-8111-111111111111';
const LINE_ID = '22222222-2222-4222-8222-222222222222';

type ClientOptions = {
  headerStatus?: string;
};

function makeClient(options: ClientOptions = {}) {
  const headerStatus = options.headerStatus ?? 'draft';
  const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];

  const client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params });
      const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (n.includes('reference"."manufacturingoperations')) {
        const names = (params?.[0] as string[] | undefined) ?? [];
        const known = new Set(['Mixing', 'Packing']);
        return {
          rows: names.filter((name) => known.has(name)).map((operation_name) => ({ operation_name })),
        };
      }
      if (n.includes('from public.bom_headers h')) {
        return { rows: [{ id: HEADER_ID, product_id: 'FG-900', status: headerStatus }] };
      }
      if (n.includes('from public.bom_lines') && n.includes('limit 1')) {
        return {
          rows: [
            {
              id: LINE_ID,
              quantity: '1.000',
              uom: 'kg',
              manufacturing_operation_name: 'Packing',
            },
          ],
        };
      }
      if (n.startsWith('update public.bom_lines')) return { rowCount: 1 };
      if (n.startsWith('insert into public.audit_log')) return { rows: [] };

      throw new Error(`Unhandled SQL: ${n}`);
    }),
  };

  return { client, calls };
}

function install(client: ReturnType<typeof makeClient>['client']) {
  withOrgContextMock.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
    callback({
      userId: '33333333-3333-4333-8333-333333333333',
      orgId: '44444444-4444-4444-8444-444444444444',
      client,
    }),
  );
}

describe('C046 — updateBomLine versioning / operation guard', () => {
  beforeEach(() => {
    withOrgContextMock.mockReset();
    vi.resetModules();
  });

  it('refuses to mutate lines on an active BOM (clone-on-write red-line)', async () => {
    const { client } = makeClient({ headerStatus: 'active' });
    install(client);

    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({
      bomHeaderId: HEADER_ID,
      lineId: LINE_ID,
      qty: '2.5',
      manufacturingOperationName: 'Packing',
    });

    expect(res).toMatchObject({ ok: false, error: 'bom_not_editable' });
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringMatching(/^update public\.bom_lines/i),
      expect.anything(),
    );
  });

  it('persists manufacturingOperationName via the controlled field, not free-text notes', async () => {
    const { client, calls } = makeClient({ headerStatus: 'draft' });
    install(client);

    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({
      bomHeaderId: HEADER_ID,
      lineId: LINE_ID,
      qty: '2.5',
      manufacturingOperationName: 'Packing',
    });

    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = calls.find((c) => c.sql.toLowerCase().startsWith('update public.bom_lines'));
    expect(upd?.params).toEqual([HEADER_ID, LINE_ID, '2.5', null, 'Packing']);
  });

  it('rejects an arbitrary manufacturing operation with V-TEC-63 and performs zero writes', async () => {
    const { client, calls } = makeClient({ headerStatus: 'draft' });
    install(client);

    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({
      bomHeaderId: HEADER_ID,
      lineId: LINE_ID,
      qty: '2.5',
      manufacturingOperationName: 'Totally-Fake-Op',
    });

    expect(res).toMatchObject({
      ok: false,
      error: 'validation_failed',
      code: 'V-TEC-63',
      message: expect.stringContaining('Totally-Fake-Op'),
    });
    expect(calls.some((c) => c.sql.toLowerCase().startsWith('update public.bom_lines'))).toBe(false);
    expect(calls.some((c) => c.sql.toLowerCase().startsWith('insert into public.audit_log'))).toBe(false);
  });

  it('editing an active BOM forks through ensureBomVersionEditDraft; the source stays immutable and the draft requires approval', async () => {
    const SOURCE_HEADER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const DRAFT_HEADER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];

    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        calls.push({ sql, params });
        const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();

        if (n.includes('from public.user_roles')) return { rows: [{ ok: true }] };
        if (n.includes('header.status') && n.includes('sourcebomheaderid')) {
          return { rows: [{ status: 'active' }] };
        }
        if (n.includes('bom_request_version_edit')) {
          return {
            rows: [
              {
                decision: 'cloned',
                bom_header_id: DRAFT_HEADER_ID,
                status: 'in_review',
                version: 2,
                supersedes_bom_header_id: SOURCE_HEADER_ID,
              },
            ],
          };
        }
        if (n.includes('from public.bom_headers h')) {
          return { rows: [{ id: SOURCE_HEADER_ID, product_id: 'FG-900', status: 'active' }] };
        }
        if (n.includes('reference"."manufacturingoperations')) {
          return { rows: [{ operation_name: 'Packing' }] };
        }
        if (n.includes('from public.bom_lines') && n.includes('limit 1')) {
          return {
            rows: [
              {
                id: LINE_ID,
                quantity: '1.000',
                uom: 'kg',
                manufacturing_operation_name: 'Packing',
              },
            ],
          };
        }
        if (n.startsWith('update public.bom_lines')) return { rowCount: 1 };
        if (n.startsWith('insert into public.audit_log')) return { rows: [] };

        throw new Error(`Unhandled SQL: ${n}`);
      }),
    };

    install(client);

    const { ensureBomVersionEditDraft } = await import('../request-version-edit');
    const fork = await ensureBomVersionEditDraft({ sourceBomHeaderId: SOURCE_HEADER_ID });
    expect(fork).toEqual({
      ok: true,
      data: {
        id: DRAFT_HEADER_ID,
        version: 2,
        decision: 'cloned',
        supersedesBomHeaderId: SOURCE_HEADER_ID,
      },
    });
    expect(calls.some((c) => c.sql.toLowerCase().includes('bom_request_version_edit'))).toBe(true);

    const { updateBomLine } = await import('../line-actions');
    const blocked = await updateBomLine({
      bomHeaderId: SOURCE_HEADER_ID,
      lineId: LINE_ID,
      qty: '9',
      manufacturingOperationName: 'Packing',
    });
    expect(blocked).toMatchObject({ ok: false, error: 'bom_not_editable' });

    client.query.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params });
      const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (n.includes('from public.bom_headers h')) {
        return { rows: [{ id: DRAFT_HEADER_ID, product_id: 'FG-900', status: 'in_review' }] };
      }
      if (n.includes('reference"."manufacturingoperations')) {
        return { rows: [{ operation_name: 'Packing' }] };
      }
      if (n.includes('from public.bom_lines') && n.includes('limit 1')) {
        return {
          rows: [
            {
              id: LINE_ID,
              quantity: '1.000',
              uom: 'kg',
              manufacturing_operation_name: 'Packing',
            },
          ],
        };
      }
      if (n.startsWith('update public.bom_lines')) return { rowCount: 1 };
      if (n.startsWith('insert into public.audit_log')) return { rows: [] };
      throw new Error(`Unhandled SQL: ${n}`);
    });

    const onDraft = await updateBomLine({
      bomHeaderId: DRAFT_HEADER_ID,
      lineId: LINE_ID,
      qty: '2.5',
      manufacturingOperationName: 'Packing',
    });
    expect(onDraft).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: DRAFT_HEADER_ID } });
  });
});
