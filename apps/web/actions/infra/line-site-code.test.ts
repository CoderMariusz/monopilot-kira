import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  findProductionLineByCodeAndSite,
  resolveProductionLineByCodeAndSite,
} from './line-resolve';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LINE_A_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LINE_B_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const EXISTING_LINE_ID = '99999999-9999-4999-8999-999999999999';

type StoredLine = {
  id: string;
  code: string;
  name: string;
  site_id: string | null;
  status: string;
};

const storedLines: StoredLine[] = [
  { id: LINE_A_ID, code: 'LINE01', name: 'Bake line', site_id: SITE_A, status: 'active' },
  { id: LINE_B_ID, code: 'LINE01', name: 'Tester line', site_id: SITE_B, status: 'active' },
];

function matchStoredLine(siteId: string | null, code: string, excludeId: string | null): StoredLine | undefined {
  const normalizedCode = code.trim().toUpperCase();
  return storedLines.find((line) => {
    if (siteId ? line.site_id !== siteId : line.site_id !== null) return false;
    if (line.code.toUpperCase() !== normalizedCode) return false;
    if (excludeId && line.id === excludeId) return false;
    return true;
  });
}

function makeClient() {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.production_lines') && normalized.includes('upper(code)')) {
        const hasSiteFilter = normalized.includes('site_id = $1::uuid');
        const siteId = hasSiteFilter ? String(params[0]) : null;
        const code = String(hasSiteFilter ? params[1] : params[0]);
        const excludeId = hasSiteFilter ? (params[2] == null ? null : String(params[2])) : (params[1] == null ? null : String(params[1]));
        const row = matchStoredLine(siteId, code, excludeId);
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('./_shared/outbox', () => ({
  writeSettingsInfraOutbox: vi.fn(async () => undefined),
}));

import { withOrgContext } from '../../lib/auth/with-org-context';
import { upsertLine } from './line';

type QueryHandler = (sql: string, params?: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount?: number };

function mockUpsertContext(queryHandler: QueryHandler) {
  vi.mocked(withOrgContext).mockImplementation(async (fn) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: vi.fn(async (sql: string, params?: readonly unknown[]) => queryHandler(sql, params)),
      },
    }),
  );
}

describe('C036 production line code scoped by site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedLines.length = 0;
    storedLines.push(
      { id: LINE_A_ID, code: 'LINE01', name: 'Bake line', site_id: SITE_A, status: 'active' },
      { id: LINE_B_ID, code: 'LINE01', name: 'Tester line', site_id: SITE_B, status: 'active' },
    );
  });

  it('resolves the correct line when the same code exists in different sites', async () => {
    const client = makeClient();

    await expect(resolveProductionLineByCodeAndSite(client, { code: 'line01', siteId: SITE_A })).resolves.toMatchObject({
      id: LINE_A_ID,
      code: 'LINE01',
    });
    await expect(resolveProductionLineByCodeAndSite(client, { code: 'LINE01', siteId: SITE_B })).resolves.toMatchObject({
      id: LINE_B_ID,
      code: 'LINE01',
    });
  });

  it('findProductionLineByCodeAndSite excludes the row being edited', async () => {
    const client = makeClient();
    const existing = await findProductionLineByCodeAndSite(client, {
      code: 'LINE01',
      siteId: SITE_A,
      excludeId: LINE_A_ID,
    });
    expect(existing).toBeNull();
  });

  it('rejects a duplicate code in the same site before insert', async () => {
    const calls: string[] = [];
    mockUpsertContext((sql) => {
      calls.push(sql);
      if (/from public\.production_lines/i.test(sql) && /upper\(code\)/i.test(sql)) {
        return { rows: [{ id: EXISTING_LINE_ID, code: 'LINE01', name: 'Existing', site_id: SITE_A, status: 'active' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await upsertLine({
      siteId: SITE_A,
      code: 'line01',
      name: 'Duplicate line',
      status: 'draft',
    });

    expect(result).toEqual({ ok: false, error: 'duplicate_code' });
    expect(calls.some((sql) => /insert into public\.production_lines/i.test(sql))).toBe(false);
  });

  it('allows the same code in a different site', async () => {
    const calls: string[] = [];
    mockUpsertContext((sql, params) => {
      calls.push(sql);
      if (/from public\.production_lines/i.test(sql) && /upper\(code\)/i.test(sql)) {
        const siteId = String(params?.[0] ?? '');
        if (siteId === SITE_B) return { rows: [], rowCount: 0 };
        return { rows: [{ id: LINE_A_ID, code: 'LINE01', name: 'Bake line', site_id: SITE_A, status: 'active' }], rowCount: 1 };
      }
      if (/insert into public\.production_lines/i.test(sql)) {
        return {
          rows: [{ id: '11111111-1111-4111-8111-111111111111', code: 'LINE01', name: 'Second site line', status: 'draft', default_output_location_id: null }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await upsertLine({
      siteId: SITE_B,
      code: 'LINE01',
      name: 'Second site line',
      status: 'draft',
    });

    expect(result).toEqual({ ok: true, data: { id: '11111111-1111-4111-8111-111111111111', status: 'draft' } });
    expect(calls.some((sql) => /insert into public\.production_lines/i.test(sql))).toBe(true);
  });
});
