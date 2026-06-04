import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));

const repoRoot = resolve(__dirname, '../../../../../../..');
const createBriefPath = resolve(repoRoot, 'apps/web/app/(npd)/brief/actions/create-brief.ts');

const ORG_ID = '03100000-1111-4000-8111-000000000031';
const ACTOR_ID = '03100000-aaaa-4000-8aaa-000000000031';
const BRIEF_ID = '03100000-bbbb-4000-8bbb-000000000031';
const PROJECT_ID = '03100000-cccc-4000-8ccc-000000000031';
const BRIEF_CREATE = 'brief.create';

type BriefRow = {
  brief_id: string;
  org_id: string;
  npd_project_id: string | null;
  template: 'single_component' | 'multi_component';
  dev_code: string;
};

type ProjectRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  type: string;
  current_gate: string;
  current_stage: string;
};

type BriefLineRow = {
  id: string;
  brief_id: string;
  org_id: string;
  line_type: string;
  line_index: number;
  dev_code: string | null;
};

type OutboxRow = {
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  dedup_key: string | null;
};

type QueryCall = { sql: string; params: readonly unknown[] };
type FakeClient = {
  calls: QueryCall[];
  actorPermissions: Set<string>;
  briefs: BriefRow[];
  briefLines: BriefLineRow[];
  projects: ProjectRow[];
  outbox: OutboxRow[];
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type CreateBrief = (
  template: 'single_component' | 'multi_component',
  devCode: string,
) => Promise<{ ok: true; briefId: string; npdProjectId: string; devCode: string }>;

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('T-031 createBrief Server Action', () => {
  it('creates a multi-component brief, product line, linked G0 NPD project, and ordered outbox events', async () => {
    currentClient.actorPermissions.add(BRIEF_CREATE);
    const createBrief = await loadCreateBrief();

    const result = await createBrief('multi_component', 'DEV26-052');

    expect(result).toEqual({
      ok: true,
      briefId: BRIEF_ID,
      npdProjectId: PROJECT_ID,
      devCode: 'DEV26-052',
    });
    expect(currentClient.briefs).toEqual([
      expect.objectContaining({
        brief_id: BRIEF_ID,
        org_id: ORG_ID,
        npd_project_id: PROJECT_ID,
        template: 'multi_component',
        dev_code: 'DEV26-052',
      }),
    ]);
    expect(currentClient.briefLines).toEqual([
      expect.objectContaining({
        brief_id: BRIEF_ID,
        org_id: ORG_ID,
        line_type: 'product',
        line_index: 0,
        dev_code: 'DEV26-052',
      }),
    ]);
    expect(currentClient.projects).toEqual([
      expect.objectContaining({
        id: PROJECT_ID,
        org_id: ORG_ID,
        code: 'DEV26-052',
        current_gate: 'G0',
        current_stage: 'brief',
      }),
    ]);
    expect(currentClient.outbox.map((event) => event.event_type)).toEqual([
      'brief.created',
      'npd.project.created',
    ]);
    expect(currentClient.outbox[0]).toEqual(
      expect.objectContaining({ aggregate_type: 'brief', aggregate_id: BRIEF_ID }),
    );
    expect(currentClient.outbox[1]).toEqual(
      expect.objectContaining({ aggregate_type: 'npd_project', aggregate_id: PROJECT_ID }),
    );
    expect(callBlob('insert into public.brief')).toContain('app.current_org_id()');
    expect(statementIndex('role_permissions')).toBeGreaterThanOrEqual(0);
    expect(_revalidatePath).toHaveBeenCalledWith('/npd/brief');
  });

  it('throws DEV_CODE_FORMAT before RBAC or persistence for invalid dev codes', async () => {
    const createBrief = await loadCreateBrief();

    await expect(createBrief('multi_component', 'DEV-XX')).rejects.toMatchObject({
      name: 'ValidationError',
      code: 'DEV_CODE_FORMAT',
    });
    expect(_withOrgContextRunner).not.toHaveBeenCalled();
    expect(currentClient.calls).toEqual([]);
  });

  it('is idempotent for same-org retries of the same dev code', async () => {
    currentClient.actorPermissions.add(BRIEF_CREATE);
    const createBrief = await loadCreateBrief();

    await createBrief('multi_component', 'DEV26-052');
    const retried = await createBrief('multi_component', 'DEV26-052');

    expect(retried).toEqual({
      ok: true,
      briefId: BRIEF_ID,
      npdProjectId: PROJECT_ID,
      devCode: 'DEV26-052',
    });
    expect(currentClient.briefs).toHaveLength(1);
    expect(currentClient.projects).toHaveLength(1);
    expect(currentClient.briefLines).toHaveLength(1);
    expect(currentClient.outbox).toHaveLength(2);
  });
});

async function loadCreateBrief(): Promise<CreateBrief> {
  expect(existsSync(createBriefPath), 'create-brief.ts must exist').toBe(true);
  const mod = (await import(createBriefPath)) as { createBrief?: CreateBrief };
  if (typeof mod.createBrief !== 'function') expect.fail('create-brief.ts must export createBrief(template, devCode)');
  return mod.createBrief;
}

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    actorPermissions: new Set<string>(),
    briefs: [],
    briefLines: [],
    projects: [],
    outbox: [],
    query: async (sql: string, params: readonly unknown[] = []) => {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('role_permissions')) {
        return client.actorPermissions.has(BRIEF_CREATE)
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from public.brief') && normalized.includes('dev_code')) {
        const found = client.briefs.find((row) => row.org_id === ORG_ID && row.dev_code === params[0]);
        return {
          rows: found
            ? [{ brief_id: found.brief_id, npd_project_id: found.npd_project_id, dev_code: found.dev_code }]
            : [],
          rowCount: found ? 1 : 0,
        };
      }

      if (normalized.includes('insert into public.brief ') || normalized.includes('insert into public.brief(')) {
        const row: BriefRow = {
          brief_id: BRIEF_ID,
          org_id: ORG_ID,
          npd_project_id: null,
          template: params[0] as BriefRow['template'],
          dev_code: String(params[1]),
        };
        client.briefs.push(row);
        return { rows: [{ brief_id: BRIEF_ID }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.brief_lines')) {
        const existing = client.briefLines.find(
          (row) => row.brief_id === params[0] && row.line_type === 'product' && row.line_index === 0,
        );
        if (existing) return { rows: [], rowCount: 0 };
        client.briefLines.push({
          id: '03100000-dddd-4000-8ddd-000000000031',
          brief_id: String(params[0]),
          org_id: ORG_ID,
          line_type: 'product',
          line_index: 0,
          dev_code: String(params[1]),
        });
        return { rows: [{ id: '03100000-dddd-4000-8ddd-000000000031' }], rowCount: 1 };
      }

      if (normalized.includes('insert into public.npd_projects')) {
        const existing = client.projects.find((row) => row.org_id === ORG_ID && row.code === params[0]);
        if (existing) return { rows: [{ id: existing.id }], rowCount: 1 };
        client.projects.push({
          id: PROJECT_ID,
          org_id: ORG_ID,
          code: String(params[0]),
          name: String(params[0]),
          type: String(params[1]),
          current_gate: 'G0',
          current_stage: 'brief',
        });
        return { rows: [{ id: PROJECT_ID }], rowCount: 1 };
      }

      if (normalized.includes('update public.brief')) {
        const brief = client.briefs.find((row) => row.brief_id === params[1]);
        if (brief) brief.npd_project_id = String(params[0]);
        return { rows: [], rowCount: brief ? 1 : 0 };
      }

      if (normalized.includes('insert into public.outbox_events')) {
        const dedupKey = typeof params[5] === 'string' ? params[5] : null;
        if (dedupKey && client.outbox.some((row) => row.dedup_key === dedupKey)) {
          return { rows: [], rowCount: 0 };
        }
        client.outbox.push({
          event_type: String(params[0]),
          aggregate_type: String(params[1]),
          aggregate_id: String(params[2]),
          payload: JSON.parse(String(params[3])) as Record<string, unknown>,
          dedup_key: dedupKey,
        });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function statementIndex(fragment: string): number {
  return currentClient.calls.findIndex((call) => call.sql.toLowerCase().includes(fragment.toLowerCase()));
}

function callBlob(fragment: string): string {
  const call = currentClient.calls[statementIndex(fragment)];
  return call?.sql.replace(/\s+/g, ' ') ?? '';
}
