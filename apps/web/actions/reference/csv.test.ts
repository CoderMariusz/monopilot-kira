import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _reportFiles } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _reportFiles: new Map<string, string>(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (arg1: unknown, arg2?: unknown) => {
    const action = typeof arg1 === 'function' ? arg1 : arg2;
    if (typeof action !== 'function') throw new Error('withOrgContext mock expected an action callback');
    return _withOrgContextRunner(action as (ctx: unknown) => Promise<unknown>);
  }),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (arg1: unknown, arg2?: unknown) => {
    const action = typeof arg1 === 'function' ? arg1 : arg2;
    if (typeof action !== 'function') throw new Error('withOrgContext mock expected an action callback');
    return _withOrgContextRunner(action as (ctx: unknown) => Promise<unknown>);
  }),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (path: string | URL, data: string | Buffer) => {
      _reportFiles.set(String(path), Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
    }),
    readFile: vi.fn(async (path: string | URL) => {
      const key = String(path);
      const value = _reportFiles.get(key);
      if (value === undefined) throw new Error(`No transient import report stored at ${key}`);
      return value;
    }),
    rm: vi.fn(async () => undefined),
  };
});

const repoRoot = resolve(__dirname, '../../../..');
const importCsvPath = resolve(repoRoot, 'apps/web/actions/reference/import-csv.ts');
const exportCsvPath = resolve(repoRoot, 'apps/web/actions/reference/export-csv.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_TOKEN = '33333333-3333-4333-8333-333333333333';
const TABLE_CODE = 'manufacturing_operations';

type ImportPreviewResult =
  | {
      ok: true;
      data: {
        reportId: string;
        expiresAt?: string;
        summary: { inserted: number; updated: number; skipped: number; errors: number };
        conflicts?: Array<Record<string, unknown>>;
      };
    }
  | { ok: false; error: string; details?: { missingColumns?: string[]; unknownColumns?: string[] } };

type ImportCommitResult =
  | { ok: true; data: { summary: { inserted: number; updated: number; skipped: number; errors: number } } }
  | { ok: false; error: string; conflictReport?: Array<Record<string, unknown>>; staleRows?: string[] };

type ImportCsvActions = {
  previewReferenceCsvImport: (input: { tableCode: string; csvText: string }) => Promise<ImportPreviewResult>;
  commitReferenceCsvImport: (input: { reportId: string }) => Promise<ImportCommitResult>;
};

type ExportCsvActions = {
  exportReferenceCsv: (input: { tableCode: string }) => Promise<Response>;
};

type QueryCall = { sql: string; params: unknown[] };
type ReferenceRow = {
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  version: number;
  is_active: boolean;
  display_order?: number;
};
type FakeClient = {
  calls: QueryCall[];
  referenceRows: Map<string, ReferenceRow>;
  importReports: Map<string, Record<string, unknown>>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  _reportFiles.clear();
  currentClient = makeClient([
    makeReferenceRow('MIX', { code: 'MIX', name: 'Mixing', display_order: '10' }, 3, true, 10),
    makeReferenceRow('PACK', { code: 'PACK', name: 'Packaging', display_order: '30' }, 3, true, 30),
    makeReferenceRow('OLD', { code: 'OLD', name: 'Inactive', display_order: '99' }, 1, false, 99),
  ]);
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: SESSION_TOKEN, client: currentClient }),
  );
});

describe('reference CSV Server Actions (TASK-000144/T-022 RED)', () => {
  it('rejects CSV whose header does not exactly match row_key plus reference_schemas columns, after trim/case normalization', async () => {
    const { previewReferenceCsvImport } = await loadImportCsvActions();

    const result = await previewReferenceCsvImport({
      tableCode: TABLE_CODE,
      csvText: ' row_key , CODE , title , display_order\nMIX,MIX,Mixing,10\n',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid_header',
      details: { missingColumns: ['name'], unknownColumns: ['title'] },
    });
    expect(referenceTableMutationCalls(), 'invalid_header preview must not write reference_tables rows').toHaveLength(0);
  });

  it('previews insert/update/skip conflicts without committing, then commit re-validates current rows before writing', async () => {
    const { previewReferenceCsvImport, commitReferenceCsvImport } = await loadImportCsvActions();

    const preview = await previewReferenceCsvImport({
      tableCode: TABLE_CODE,
      csvText: [
        ' ROW_KEY , CODE , NAME , DISPLAY_ORDER ',
        'MIX,MIX,Mixing,10',
        'FILL,FILL,Filling,20',
        'PACK,PACK,Packing,30',
      ].join('\n'),
    });

    expect(preview).toMatchObject({
      ok: true,
      data: { summary: { inserted: 1, updated: 1, skipped: 1, errors: 0 } },
    });
    if (preview.ok !== true) {
      const error = 'error' in preview ? preview.error : 'unknown';
      expect.fail(`preview failed before commit assertions: ${error}`);
    }
    const previewData = preview.data;
    expect(previewData.reportId, 'preview must persist a transient report and return reportId').toEqual(expect.any(String));
    if (previewData.expiresAt) {
      const ttlMs = Date.parse(previewData.expiresAt) - Date.now();
      expect(ttlMs, 'preview report expiry must be at most 1 hour').toBeGreaterThan(0);
      expect(ttlMs, 'preview report expiry must be at most 1 hour').toBeLessThanOrEqual(3_660_000);
    }
    expect(referenceTableMutationCalls(), 'preview is review-only and must not insert/update reference_tables').toHaveLength(0);

    currentClient.referenceRows.set(
      'PACK',
      makeReferenceRow('PACK', { code: 'PACK', name: 'Pack line changed by another admin', display_order: '31' }, 4, true, 31),
    );
    const commit = await commitReferenceCsvImport({ reportId: previewData.reportId });

    expect(commit).toMatchObject({ ok: false, error: 'conflict_detected' });
    if (commit.ok === true) {
      expect.fail('commit must fail when a row changed after preview');
    }
    const staleRows = commit.staleRows ?? commit.conflictReport?.map((row) => row.rowKey ?? row.row_key);
    expect(staleRows, 'commit must report the row_key that changed since preview').toContain('PACK');
    expect(referenceTableMutationCalls(), 'stale commit must abort before reference_tables writes').toHaveLength(0);
  });

  it('exports active reference rows as a streamed CSV Response with schema-derived header and attachment disposition', async () => {
    const { exportReferenceCsv } = await loadExportCsvActions();

    const response = await exportReferenceCsv({ tableCode: TABLE_CODE });

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')?.toLowerCase()).toContain('text/csv');
    expect(response.headers.get('content-disposition')?.toLowerCase()).toContain('attachment');
    expect(response.headers.get('content-disposition')?.toLowerCase()).toContain(`${TABLE_CODE}.csv`);
    const csv = await response.text();
    expect(csv.split(/\r?\n/)[0]).toBe('row_key,code,name,display_order');
    expect(csv).toContain('MIX,MIX,Mixing,10');
    expect(csv).toContain('PACK,PACK,Packaging,30');
    expect(csv, 'export must include current active rows only').not.toContain('OLD,OLD,Inactive,99');
  });
});

async function loadImportCsvActions(): Promise<ImportCsvActions> {
  expect(
    existsSync(importCsvPath),
    'apps/web/actions/reference/import-csv.ts must exist and export previewReferenceCsvImport + commitReferenceCsvImport',
  ).toBe(true);
  const mod = (await import(importCsvPath)) as Partial<ImportCsvActions>;
  if (typeof mod.previewReferenceCsvImport !== 'function') {
    expect.fail('apps/web/actions/reference/import-csv.ts must export previewReferenceCsvImport(input)');
  }
  if (typeof mod.commitReferenceCsvImport !== 'function') {
    expect.fail('apps/web/actions/reference/import-csv.ts must export commitReferenceCsvImport(input)');
  }
  return mod as ImportCsvActions;
}

async function loadExportCsvActions(): Promise<ExportCsvActions> {
  expect(
    existsSync(exportCsvPath),
    'apps/web/actions/reference/export-csv.ts must exist and export exportReferenceCsv',
  ).toBe(true);
  const mod = (await import(exportCsvPath)) as Partial<ExportCsvActions>;
  if (typeof mod.exportReferenceCsv !== 'function') {
    expect.fail('apps/web/actions/reference/export-csv.ts must export exportReferenceCsv(input)');
  }
  return mod as ExportCsvActions;
}

function makeReferenceRow(
  rowKey: string,
  rowData: Record<string, unknown>,
  version: number,
  isActive = true,
  displayOrder = 0,
): ReferenceRow {
  return { table_code: TABLE_CODE, row_key: rowKey, row_data: rowData, version, is_active: isActive, display_order: displayOrder };
}

function makeClient(seedRows: ReferenceRow[]): FakeClient {
  const calls: QueryCall[] = [];
  const referenceRows = new Map(seedRows.map((row) => [row.row_key, row]));
  const importReports = new Map<string, Record<string, unknown>>();
  return {
    calls,
    referenceRows,
    importReports,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('from public.reference_schemas') || normalized.includes('from reference_schemas')) {
        return {
          rows: [
            { column_code: 'code', data_type: 'text', validation_json: { required: true }, presentation_json: { display_order: 1 } },
            { column_code: 'name', data_type: 'text', validation_json: { required: true }, presentation_json: { display_order: 2 } },
            { column_code: 'display_order', data_type: 'number', validation_json: {}, presentation_json: { display_order: 3 } },
          ],
          rowCount: 3,
        };
      }

      if (normalized.includes('insert into public.reference_csv_import_reports') || normalized.includes('insert into reference_csv_import_reports')) {
        const reportId = stringParam(params, /report|^[0-9a-f-]{36}$/i) ?? `report-${importReports.size + 1}`;
        const payload = jsonLikeParam(params) ?? {};
        importReports.set(reportId, { id: reportId, report_id: reportId, payload, report_json: payload, expires_at: new Date(Date.now() + 3_600_000).toISOString() });
        return { rows: [importReports.get(reportId)!], rowCount: 1 };
      }

      if (normalized.includes('from public.reference_csv_import_reports') || normalized.includes('from reference_csv_import_reports')) {
        const reportId = stringParam(params) ?? Array.from(importReports.keys())[0];
        const row = reportId ? importReports.get(reportId) : undefined;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.includes('from public.reference_tables') || normalized.includes('from reference_tables')) {
        const rows = Array.from(referenceRows.values()).filter((row) => {
          const tableMatches = params.includes(row.table_code) || !params.some((param) => param === TABLE_CODE);
          const activeMatches = normalized.includes('is_active') ? row.is_active : true;
          return tableMatches && activeMatches;
        });
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes('insert into public.reference_tables') || normalized.includes('insert into reference_tables')) {
        const rowKey = stringParam(params, /^[A-Z0-9_-]+$/) ?? `INSERTED_${referenceRows.size}`;
        referenceRows.set(rowKey, makeReferenceRow(rowKey, jsonLikeParam(params) ?? {}, 1, true));
        return { rows: [referenceRows.get(rowKey)!], rowCount: 1 };
      }

      if (normalized.includes('update public.reference_tables') || normalized.includes('update reference_tables')) {
        const rowKey = stringParam(params, /^[A-Z0-9_-]+$/);
        if (rowKey && referenceRows.has(rowKey)) {
          const current = referenceRows.get(rowKey)!;
          referenceRows.set(rowKey, { ...current, row_data: jsonLikeParam(params) ?? current.row_data, version: current.version + 1 });
          return { rows: [referenceRows.get(rowKey)!], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (normalized.includes('from public.roles') || normalized.includes('from roles') || normalized.includes('user_roles')) {
        return { rows: [{ slug: 'settings.admin' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

function referenceTableMutationCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => {
    const normalized = call.sql.replace(/\s+/g, ' ').toLowerCase();
    return (
      normalized.includes('insert into public.reference_tables') ||
      normalized.includes('insert into reference_tables') ||
      normalized.includes('update public.reference_tables') ||
      normalized.includes('update reference_tables') ||
      normalized.includes('delete from public.reference_tables') ||
      normalized.includes('delete from reference_tables')
    );
  });
}

function stringParam(params: unknown[], pattern?: RegExp): string | undefined {
  return params.find((param): param is string => typeof param === 'string' && (!pattern || pattern.test(param)));
}

function jsonLikeParam(params: unknown[]): Record<string, unknown> | undefined {
  for (const param of params) {
    if (param && typeof param === 'object' && !Array.isArray(param)) return param as Record<string, unknown>;
    if (typeof param === 'string' && /^[\[{]/.test(param.trim())) {
      try {
        const parsed = JSON.parse(param) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        // Keep scanning params; non-JSON strings are ordinary query params.
      }
    }
  }
  return undefined;
}
