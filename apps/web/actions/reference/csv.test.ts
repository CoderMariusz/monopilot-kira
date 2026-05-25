import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
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

const repoRoot = resolve(__dirname, '../../../..');
const importCsvPath = resolve(repoRoot, 'apps/web/actions/reference/import-csv.ts');
const exportCsvPath = resolve(repoRoot, 'apps/web/actions/reference/export-csv.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_TOKEN = '33333333-3333-4333-8333-333333333333';
const TABLE_CODE = 'manufacturing_operations';

type Summary = { inserted: number; updated: number; skipped: number; errors: number };

type ImportPreviewResult =
  | {
      ok: true;
      data: {
        reportId: string;
        expiresAt?: string;
        summary: Summary;
        conflicts?: Array<Record<string, unknown>>;
        errors?: Array<{ rowKey: string; message: string }>;
      };
    }
  | { ok: false; error: string; details?: { missingColumns?: string[]; unknownColumns?: string[] } };

type ImportCommitResult =
  | { ok: true; data: { summary: Summary } }
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

type ImportReportRow = {
  id: string;
  payload: unknown;
  expires_at: string;
};

type FakeClient = {
  calls: QueryCall[];
  referenceRows: Map<string, ReferenceRow>;
  importReports: Map<string, ImportReportRow>;
  auditEntries: Array<{ action: string; resource_id: string }>;
  outboxEntries: Array<{ event_type: string }>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient([
    makeReferenceRow('MIX', { code: 'MIX', name: 'Mixing', display_order: '10' }, 3, true, 10),
    makeReferenceRow('PACK', { code: 'PACK', name: 'Packaging', display_order: '30' }, 3, true, 30),
    makeReferenceRow('OLD', { code: 'OLD', name: 'Inactive', display_order: '99' }, 1, false, 99),
  ]);
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: SESSION_TOKEN, client: currentClient }),
  );
});

describe('reference CSV Server Actions (T-022)', () => {
  it('rejects CSV whose header does not match reference_schemas.columns with the V-SET-23 CSV_HEADER_MISMATCH error code', async () => {
    const { previewReferenceCsvImport } = await loadImportCsvActions();

    const result = await previewReferenceCsvImport({
      tableCode: TABLE_CODE,
      csvText: ' row_key , CODE , title , display_order\nMIX,MIX,Mixing,10\n',
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'CSV_HEADER_MISMATCH',
      details: { missingColumns: ['name'], unknownColumns: ['title'] },
    });
    expect(referenceTableMutationCalls(), 'CSV_HEADER_MISMATCH preview must not write reference_tables rows').toHaveLength(0);
  });

  it('counts validation errors in summary.errors and stores them on the persistent report so commit can exclude them', async () => {
    const { previewReferenceCsvImport, commitReferenceCsvImport } = await loadImportCsvActions();

    const preview = await previewReferenceCsvImport({
      tableCode: TABLE_CODE,
      csvText: [
        'row_key,code,name,display_order',
        'NEW1,NEW1,New One,10',
        'NEW2,NEW2,New Two,20',
        'NEW3,NEW3,New Three,30',
        'MIX,MIX,Mixing,10',
        'PACK,PACK,Packing,30',
        'BADROW,BADCODE,,not_a_number',
      ].join('\n'),
    });

    expect(preview).toMatchObject({
      ok: true,
      data: { summary: { inserted: 3, updated: 1, skipped: 1, errors: 1 } },
    });
    if (preview.ok !== true) expect.fail('preview must succeed when only one row has validation errors');
    expect(preview.data.errors, 'preview must surface per-row errors').toEqual(
      expect.arrayContaining([expect.objectContaining({ rowKey: 'BADROW' })]),
    );
    expect(referenceTableMutationCalls(), 'preview must never write to reference_tables').toHaveLength(0);

    const commit = await commitReferenceCsvImport({ reportId: preview.data.reportId });
    expect(commit).toMatchObject({ ok: true, data: { summary: { inserted: 3, updated: 1, skipped: 1, errors: 1 } } });
    const insertCalls = currentClient.calls.filter((call) =>
      call.sql.replace(/\s+/g, ' ').toLowerCase().includes('insert into public.reference_tables'),
    );
    const updateCalls = currentClient.calls.filter((call) => {
      const normalized = call.sql.replace(/\s+/g, ' ').toLowerCase();
      return normalized.includes('update public.reference_tables') && !/is_active\s*=\s*false/.test(normalized);
    });
    expect(insertCalls, 'commit must persist exactly the 3 valid inserts').toHaveLength(3);
    expect(updateCalls, 'commit must persist exactly the 1 valid update').toHaveLength(1);
    expect(
      currentClient.auditEntries.some((entry) => entry.action === 'reference.csv.commit'),
      'commit must record an audit_log entry',
    ).toBe(true);
    expect(
      currentClient.outboxEntries.some((entry) => entry.event_type === 'reference.csv.committed'),
      'commit must enqueue an outbox event',
    ).toBe(true);
  });

  it('persists the preview report in a database table (not /tmp) so commit survives serverless scale-out', async () => {
    const { previewReferenceCsvImport } = await loadImportCsvActions();
    const preview = await previewReferenceCsvImport({
      tableCode: TABLE_CODE,
      csvText: 'row_key,code,name,display_order\nNEW,NEW,New,10',
    });
    expect(preview.ok).toBe(true);
    expect(
      currentClient.calls.some((call) =>
        call.sql.replace(/\s+/g, ' ').toLowerCase().includes('insert into public.reference_csv_import_reports'),
      ),
      'preview must persist report to reference_csv_import_reports table, not /tmp filesystem',
    ).toBe(true);

    const importCsvSource = readFileSync(importCsvPath, 'utf8');
    expect(
      /from\s+['"]node:os['"]/i.test(importCsvSource) || /tmpdir\s*\(/i.test(importCsvSource),
      'production import-csv.ts must not depend on os.tmpdir() for report storage (Vercel serverless safety)',
    ).toBe(false);
    expect(
      /from\s+['"]node:fs\/promises['"]/i.test(importCsvSource),
      'production import-csv.ts must not use node:fs/promises for report storage',
    ).toBe(false);
  });

  it('exports active reference rows as CSV with formula-injection-safe cells', async () => {
    currentClient.referenceRows.set(
      'EVIL',
      makeReferenceRow('EVIL', { code: '=cmd|"/c calc"!A1', name: '+SUM(1+1)', display_order: '40' }, 1, true, 40),
    );
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
    expect(csv, 'cell starting with = must be escaped to prevent CSV formula injection').not.toMatch(
      /^EVIL,=cmd/m,
    );
    expect(csv, 'cell starting with + must be escaped to prevent CSV formula injection').not.toMatch(
      /,\+SUM\(/,
    );
    expect(csv, 'escaped formula cells must be prefixed with a single quote inside quotes').toMatch(
      /'=cmd/,
    );
    expect(csv, 'escaped formula cells must be prefixed with a single quote inside quotes').toMatch(
      /'\+SUM/,
    );
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
  const importReports = new Map<string, ImportReportRow>();
  const auditEntries: Array<{ action: string; resource_id: string }> = [];
  const outboxEntries: Array<{ event_type: string }> = [];
  return {
    calls,
    referenceRows,
    importReports,
    auditEntries,
    outboxEntries,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('from public.user_roles') && normalized.includes('role_permissions')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }

      if (normalized.includes('from public.reference_schemas')) {
        return {
          rows: [
            { column_code: 'code', data_type: 'text', validation_json: { required: true }, presentation_json: { display_order: 1 } },
            { column_code: 'name', data_type: 'text', validation_json: { required: true }, presentation_json: { display_order: 2 } },
            { column_code: 'display_order', data_type: 'number', validation_json: {}, presentation_json: { display_order: 3 } },
          ],
          rowCount: 3,
        };
      }

      if (normalized.includes('insert into public.reference_csv_import_reports')) {
        const reportId = stringParam(params, /^[0-9a-f-]{8,}$/i) ?? `report-${importReports.size + 1}`;
        const payload = jsonLikeParam(params) ?? {};
        const expiresAtParam = stringParam(params, /^[0-9]{4}-/);
        importReports.set(reportId, {
          id: reportId,
          payload,
          expires_at: expiresAtParam ?? new Date(Date.now() + 3_600_000).toISOString(),
        });
        return { rows: [importReports.get(reportId)!], rowCount: 1 };
      }

      if (normalized.includes('delete from public.reference_csv_import_reports')) {
        const reportId = stringParam(params);
        if (reportId) importReports.delete(reportId);
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('from public.reference_csv_import_reports')) {
        const reportId = stringParam(params) ?? Array.from(importReports.keys())[0];
        const row = reportId ? importReports.get(reportId) : undefined;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (normalized.startsWith('insert into public.audit_log')) {
        const action = String(params[2] ?? '');
        const resourceId = String(params[3] ?? '');
        auditEntries.push({ action, resource_id: resourceId });
        return { rows: [{ id: auditEntries.length }], rowCount: 1 };
      }

      if (normalized.startsWith('insert into public.outbox_events')) {
        const eventType = String(params[1] ?? '');
        outboxEntries.push({ event_type: eventType });
        return { rows: [{ id: outboxEntries.length }], rowCount: 1 };
      }

      if (normalized.includes('from public.reference_tables') && !normalized.includes('insert')) {
        const rows = Array.from(referenceRows.values()).filter((row) => {
          const tableMatches = params.includes(row.table_code) || !params.some((param) => param === TABLE_CODE);
          const activeMatches = normalized.includes('is_active') ? row.is_active : true;
          return tableMatches && activeMatches;
        });
        return { rows, rowCount: rows.length };
      }

      if (normalized.includes('insert into public.reference_tables')) {
        const rowKey = stringParam(params, /^[A-Za-z0-9_-]+$/, [TABLE_CODE]) ?? `INSERTED_${referenceRows.size}`;
        referenceRows.set(rowKey, makeReferenceRow(rowKey, jsonLikeParam(params) ?? {}, 1, true));
        return { rows: [referenceRows.get(rowKey)!], rowCount: 1 };
      }

      if (normalized.includes('update public.reference_tables')) {
        const rowKey = stringParam(params, /^[A-Za-z0-9_-]+$/, [TABLE_CODE]);
        if (rowKey && referenceRows.has(rowKey)) {
          const current = referenceRows.get(rowKey)!;
          referenceRows.set(rowKey, { ...current, row_data: jsonLikeParam(params) ?? current.row_data, version: current.version + 1 });
          return { rows: [referenceRows.get(rowKey)!], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
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
      normalized.includes('update public.reference_tables') ||
      normalized.includes('delete from public.reference_tables')
    );
  });
}

function stringParam(params: unknown[], pattern?: RegExp, exclude: string[] = []): string | undefined {
  return params.find(
    (param): param is string => typeof param === 'string' && !exclude.includes(param) && (!pattern || pattern.test(param)),
  );
}

function jsonLikeParam(params: unknown[]): Record<string, unknown> | undefined {
  for (const param of params) {
    if (param && typeof param === 'object' && !Array.isArray(param)) return param as Record<string, unknown>;
    if (typeof param === 'string' && /^[{[]/.test(param.trim())) {
      try {
        const parsed = JSON.parse(param) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        // Non-JSON string; ignore and continue scanning params.
      }
    }
  }
  return undefined;
}
