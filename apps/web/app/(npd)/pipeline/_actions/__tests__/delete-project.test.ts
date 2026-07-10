import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

const PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const withOrgContextMock = vi.hoisted(() => vi.fn());
const queryMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

vi.mock('../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

const { deleteProject } = await import('../delete-project');

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function calls(): QueryCall[] {
  return queryMock.mock.calls.map(([sql, params]) => ({ sql, params: params ?? [] }));
}

describe('deleteProject (N-42)', () => {
  beforeEach(() => {
    queryMock.mockReset();
    withOrgContextMock.mockReset();
    withOrgContextMock.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
      callback({
        userId: USER_ID,
        orgId: ORG_ID,
        client: { query: queryMock },
      }),
    );
  });

  it('stamps gate_approvals, deletes the project, and emits npd.project.deleted atomically', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('as ok')) {
        return { rows: [{ ok: true }] };
      }
      if (q.startsWith('select id, code') && q.includes('from public.npd_projects')) {
        return { rows: [{ id: PROJECT_ID, code: 'NPD-DEL-001' }] };
      }
      if (q.startsWith('update public.gate_approvals')) return { rows: [] };
      if (q.startsWith('delete from public.npd_projects')) {
        return { rows: [{ id: PROJECT_ID, code: 'NPD-DEL-001' }] };
      }
      if (q.startsWith('insert into public.outbox_events')) return { rows: [] };
      return { rows: [] };
    });

    const result = await deleteProject({ projectId: PROJECT_ID });

    expect(result).toEqual({ ok: true });
    expect(calls().some((c) => c.sql.includes('update public.gate_approvals') && c.params[1] === 'NPD-DEL-001')).toBe(
      true,
    );
    const outbox = calls().find((c) => c.sql.includes('insert into public.outbox_events'));
    expect(outbox?.params[0]).toBe('npd.project.deleted');
    expect(JSON.parse(String(outbox?.params[2]))).toMatchObject({
      project_id: PROJECT_ID,
      code: 'NPD-DEL-001',
    });
    expect(calls().some((c) => c.sql.includes('savepoint'))).toBe(false);
  });

  it('rolls back the delete when the outbox insert fails', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('as ok')) {
        return { rows: [{ ok: true }] };
      }
      if (q.startsWith('select id, code')) return { rows: [{ id: PROJECT_ID, code: 'NPD-DEL-002' }] };
      if (q.startsWith('update public.gate_approvals')) return { rows: [] };
      if (q.startsWith('delete from public.npd_projects')) {
        return { rows: [{ id: PROJECT_ID, code: 'NPD-DEL-002' }] };
      }
      if (q.startsWith('insert into public.outbox_events')) {
        throw new Error('outbox check violation');
      }
      return { rows: [] };
    });

    const result = await deleteProject({ projectId: PROJECT_ID });
    expect(result).toEqual({ ok: false, error: 'PERSISTENCE_FAILED' });
  });
});
