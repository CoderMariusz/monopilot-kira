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
const saveBriefDraftPath = resolve(repoRoot, 'apps/web/app/(npd)/brief/actions/save-brief-draft.ts');

const ORG_ID = '03100000-1111-4000-8111-000000000031';
const ACTOR_ID = '03100000-aaaa-4000-8aaa-000000000031';
const BRIEF_ID = '03100000-bbbb-4000-8bbb-000000000031';

type LineInput = {
  lineType: 'product' | 'component' | 'summary';
  lineIndex: number;
  product?: string;
  component?: string;
  volume?: string;
  weights?: string;
};

type SaveFields = {
  productName?: string;
  volume?: string;
  lines?: LineInput[];
};

type BriefRow = {
  brief_id: string;
  org_id: string;
  template: 'single_component' | 'multi_component';
  product_name: string | null;
  volume: string | null;
};

type LineRow = LineInput & { briefId: string; orgId: string };
type QueryCall = { sql: string; params: readonly unknown[] };
type FakeClient = {
  calls: QueryCall[];
  brief: BriefRow;
  lines: LineRow[];
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type SaveBriefDraft = (
  briefId: string,
  fields: SaveFields,
) => Promise<{ ok: true; briefId: string; linesSaved: number }>;

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
});

describe('T-031 saveBriefDraft Server Action', () => {
  it('throws WEIGHT_MISMATCH for multi-component summary weight outside 1 percent tolerance', async () => {
    const saveBriefDraft = await loadSaveBriefDraft();

    await expect(
      saveBriefDraft(BRIEF_ID, {
        lines: [
          { lineType: 'component', lineIndex: 1, component: 'Prosciutto', weights: '500' },
          { lineType: 'component', lineIndex: 2, component: 'Provolone', weights: '350' },
          { lineType: 'summary', lineIndex: 99, product: 'Platter total', weights: '1000' },
        ],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError', code: 'WEIGHT_MISMATCH' });

    expect(statementIndex('update public.brief')).toBe(-1);
    expect(statementIndex('delete from public.brief_lines')).toBe(-1);
  });

  it('rejects non-positive header and line volumes before persistence', async () => {
    const saveBriefDraft = await loadSaveBriefDraft();

    await expect(
      saveBriefDraft(BRIEF_ID, {
        volume: '0',
        lines: [{ lineType: 'product', lineIndex: 0, product: 'Duck Rillettes', volume: '-5' }],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError', code: 'VOLUME_POSITIVE' });

    expect(statementIndex('update public.brief')).toBe(-1);
  });

  it('updates brief header and replaces draft lines for valid weights and positive volumes', async () => {
    const saveBriefDraft = await loadSaveBriefDraft();

    const result = await saveBriefDraft(BRIEF_ID, {
      productName: 'Italian platter',
      volume: '1200',
      lines: [
        { lineType: 'product', lineIndex: 0, product: 'Italian platter', volume: '1200' },
        { lineType: 'component', lineIndex: 1, component: 'Prosciutto', weights: '500' },
        { lineType: 'component', lineIndex: 2, component: 'Provolone', weights: '495' },
        { lineType: 'summary', lineIndex: 99, product: 'Platter total', weights: '1000' },
      ],
    });

    expect(result).toEqual({ ok: true, briefId: BRIEF_ID, linesSaved: 4 });
    expect(currentClient.brief).toEqual(
      expect.objectContaining({
        brief_id: BRIEF_ID,
        product_name: 'Italian platter',
        volume: '1200',
      }),
    );
    expect(currentClient.lines).toHaveLength(4);
    expect(callBlob('from public.brief')).toContain('app.current_org_id()');
    expect(callBlob('delete from public.brief_lines')).toContain('app.current_org_id()');
    expect(_revalidatePath).toHaveBeenCalledWith(`/npd/brief/${BRIEF_ID}`);
  });
});

async function loadSaveBriefDraft(): Promise<SaveBriefDraft> {
  expect(existsSync(saveBriefDraftPath), 'save-brief-draft.ts must exist').toBe(true);
  const mod = (await import(saveBriefDraftPath)) as { saveBriefDraft?: SaveBriefDraft };
  if (typeof mod.saveBriefDraft !== 'function') expect.fail('save-brief-draft.ts must export saveBriefDraft(briefId, fields)');
  return mod.saveBriefDraft;
}

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: [],
    brief: {
      brief_id: BRIEF_ID,
      org_id: ORG_ID,
      template: 'multi_component',
      product_name: null,
      volume: null,
    },
    lines: [],
    query: async (sql: string, params: readonly unknown[] = []) => {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('from public.brief')) {
        return { rows: [client.brief], rowCount: 1 };
      }

      if (normalized.includes('update public.brief')) {
        client.brief.product_name = typeof params[0] === 'string' ? params[0] : null;
        client.brief.volume = typeof params[1] === 'string' ? params[1] : null;
        return { rows: [{ brief_id: BRIEF_ID }], rowCount: 1 };
      }

      if (normalized.includes('delete from public.brief_lines')) {
        client.lines = [];
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('insert into public.brief_lines')) {
        client.lines.push({
          briefId: String(params[0]),
          orgId: ORG_ID,
          lineType: params[1] as LineInput['lineType'],
          lineIndex: Number(params[2]),
          product: typeof params[3] === 'string' ? params[3] : undefined,
          volume: typeof params[4] === 'string' ? params[4] : undefined,
          component: typeof params[5] === 'string' ? params[5] : undefined,
          weights: typeof params[6] === 'string' ? params[6] : undefined,
        });
        return { rows: [{ id: `line-${client.lines.length}` }], rowCount: 1 };
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
