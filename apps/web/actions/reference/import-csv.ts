'use server';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { withOrgContext } from '../../lib/auth/with-org-context';

const IMPORT_PERMISSION = 'settings.reference.import';
const REPORT_TTL_MS = 60 * 60 * 1000;
const REPORT_DIR = join(tmpdir(), 'monopilot-reference-csv-imports');

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ReferenceSchemaColumn = {
  column_code: string;
  data_type?: string | null;
  required_for_done?: boolean | null;
  is_required?: boolean | null;
  required?: boolean | null;
  validation_json?: unknown;
  presentation_json?: unknown;
};

type ReferenceRow = {
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  version: number;
  is_active: boolean;
  display_order?: number | null;
};

type CsvRecord = {
  rowKey: string;
  rowData: Record<string, string>;
  displayOrder: number | null;
};

type PreviewEntry = CsvRecord & {
  action: 'insert' | 'update' | 'skip';
  expectedVersion: number | null;
  previousData: Record<string, unknown> | null;
};

type ImportSummary = { inserted: number; updated: number; skipped: number; errors: number };

type StoredReport = {
  reportId: string;
  orgId: string;
  tableCode: string;
  expiresAt: string;
  columns: string[];
  entries: PreviewEntry[];
  summary: ImportSummary;
  conflicts: Array<Record<string, unknown>>;
};

export type PreviewReferenceCsvImportResult =
  | { ok: true; data: { reportId: string; expiresAt: string; summary: ImportSummary; conflicts: Array<Record<string, unknown>> } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'invalid_header' | 'persistence_failed'; details?: { missingColumns?: string[]; unknownColumns?: string[] }; message?: string };

export type CommitReferenceCsvImportResult =
  | { ok: true; data: { summary: ImportSummary } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'report_not_found' | 'report_expired' | 'conflict_detected' | 'persistence_failed'; conflictReport?: Array<Record<string, unknown>>; staleRows?: string[] };

export async function previewReferenceCsvImport(rawInput: unknown): Promise<PreviewReferenceCsvImportResult> {
  const input = parsePreviewInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<PreviewReferenceCsvImportResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, IMPORT_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const schemaColumns = await loadSchemaColumns(client, input.tableCode);
      if (schemaColumns.length === 0) return { ok: false, error: 'invalid_input', message: 'reference schema is not configured' };

      const parsed = await parseCsv(input.csvText);
      if (parsed.ok === false) return { ok: false, error: 'invalid_input', message: parsed.message };

      const expectedHeaders = ['row_key', ...schemaColumns.map((column) => normalizeHeader(column.column_code))];
      const actualHeaders = parsed.headers.map(normalizeHeader);
      const missingColumns = expectedHeaders.filter((header) => !actualHeaders.includes(header));
      const unknownColumns = actualHeaders.filter((header) => !expectedHeaders.includes(header));
      if (missingColumns.length > 0 || unknownColumns.length > 0 || actualHeaders.length !== expectedHeaders.length) {
        return { ok: false, error: 'invalid_header', details: { missingColumns, unknownColumns } };
      }

      const records = buildCsvRecords(parsed.rows, parsed.headers, schemaColumns);
      const existingRows = await loadReferenceRows(client, input.tableCode, false);
      const existingByKey = new Map(existingRows.map((row) => [row.row_key, row]));
      const entries: PreviewEntry[] = [];
      const conflicts: Array<Record<string, unknown>> = [];
      const summary: ImportSummary = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

      for (const record of records) {
        const existing = existingByKey.get(record.rowKey);
        if (!existing) {
          entries.push({ ...record, action: 'insert', expectedVersion: null, previousData: null });
          summary.inserted += 1;
          continue;
        }

        const action = stableStringify(normalizeRecordData(existing.row_data)) === stableStringify(normalizeRecordData(record.rowData)) ? 'skip' : 'update';
        entries.push({ ...record, action, expectedVersion: Number(existing.version), previousData: existing.row_data });
        if (action === 'skip') {
          summary.skipped += 1;
        } else {
          summary.updated += 1;
          conflicts.push({ rowKey: record.rowKey, row_key: record.rowKey, action: 'update', currentVersion: existing.version });
        }
      }

      const reportId = randomUUID();
      const expiresAt = new Date(Date.now() + REPORT_TTL_MS).toISOString();
      const report: StoredReport = {
        reportId,
        orgId,
        tableCode: input.tableCode,
        expiresAt,
        columns: expectedHeaders,
        entries,
        summary,
        conflicts,
      };

      await persistReport(report);
      return { ok: true, data: { reportId, expiresAt, summary, conflicts } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function commitReferenceCsvImport(rawInput: unknown): Promise<CommitReferenceCsvImportResult> {
  const input = parseCommitInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<CommitReferenceCsvImportResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, IMPORT_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const report = await loadReport(input.reportId);
      if (!report || report.orgId !== orgId) return { ok: false, error: 'report_not_found' };
      if (Date.parse(report.expiresAt) <= Date.now()) {
        await deleteReport(input.reportId);
        return { ok: false, error: 'report_expired' };
      }

      const schemaColumns = await loadSchemaColumns(client, report.tableCode);
      const expectedHeaders = ['row_key', ...schemaColumns.map((column) => normalizeHeader(column.column_code))];
      if (stableStringify(expectedHeaders) !== stableStringify(report.columns)) {
        return { ok: false, error: 'conflict_detected', staleRows: report.entries.map((entry) => entry.rowKey) };
      }

      const existingRows = await loadReferenceRows(client, report.tableCode, false);
      const existingByKey = new Map(existingRows.map((row) => [row.row_key, row]));
      const staleRows: string[] = [];
      const conflictReport: Array<Record<string, unknown>> = [];

      for (const entry of report.entries) {
        const current = existingByKey.get(entry.rowKey);
        if (entry.action === 'insert') {
          if (current) staleRows.push(entry.rowKey);
          continue;
        }
        if (!current || Number(current.version) !== entry.expectedVersion) {
          staleRows.push(entry.rowKey);
          conflictReport.push({ rowKey: entry.rowKey, row_key: entry.rowKey, expectedVersion: entry.expectedVersion, currentVersion: current?.version ?? null });
        }
      }

      if (staleRows.length > 0) return { ok: false, error: 'conflict_detected', staleRows, conflictReport };

      for (const entry of report.entries) {
        if (entry.action === 'skip') continue;
        if (entry.action === 'insert') {
          await client.query<ReferenceRow>(
            `insert into public.reference_tables
               (org_id, table_code, row_key, row_data, display_order, created_by)
             values ($1::uuid, $2, $3, $4::jsonb, $5, $6::uuid)
             returning org_id, table_code, row_key, row_data, version, is_active, display_order`,
            [orgId, report.tableCode, entry.rowKey, entry.rowData, entry.displayOrder, userId],
          );
        } else {
          const { rows, rowCount } = await client.query<ReferenceRow>(
            `update public.reference_tables
                set row_data = $3::jsonb,
                    display_order = $4
              where org_id = app.current_org_id()
                and table_code = $1
                and row_key = $2
                and version = $5::integer
              returning org_id, table_code, row_key, row_data, version, is_active, display_order`,
            [report.tableCode, entry.rowKey, entry.rowData, entry.displayOrder, entry.expectedVersion],
          );
          if ((rowCount ?? rows.length) < 1) {
            return { ok: false, error: 'conflict_detected', staleRows: [entry.rowKey], conflictReport: [{ rowKey: entry.rowKey, row_key: entry.rowKey }] };
          }
        }
      }

      await refreshReferenceTableMv(client, orgId, report.tableCode);
      await deleteReport(input.reportId);
      return { ok: true, data: { summary: report.summary } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parsePreviewInput(raw: unknown): { tableCode: string; csvText: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { tableCode?: unknown; csvText?: unknown };
  const tableCode = normalizeCode(candidate.tableCode);
  if (!tableCode || typeof candidate.csvText !== 'string' || candidate.csvText.trim() === '') return null;
  return { tableCode, csvText: candidate.csvText };
}

function parseCommitInput(raw: unknown): { reportId: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const reportId = (raw as { reportId?: unknown }).reportId;
  return typeof reportId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(reportId) ? { reportId } : null;
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-z0-9_][a-z0-9_-]{0,63}$/i.test(trimmed) ? trimmed : null;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function loadSchemaColumns(client: QueryClient, tableCode: string): Promise<ReferenceSchemaColumn[]> {
  const { rows } = await client.query<ReferenceSchemaColumn>(
    `select column_code, data_type, required_for_done, validation_json, presentation_json
       from public.reference_schemas
      where org_id = app.current_org_id()
        and table_code = $1
        and deprecated_at is null
      order by coalesce((presentation_json->>'display_order')::integer, 0), column_code`,
    [tableCode],
  );
  return rows;
}

async function loadReferenceRows(client: QueryClient, tableCode: string, activeOnly: boolean): Promise<ReferenceRow[]> {
  const { rows } = await client.query<ReferenceRow>(
    `select table_code, row_key, row_data, version, is_active, display_order
       from public.reference_tables
      where org_id = app.current_org_id()
        and table_code = $1
        and ($2::boolean = false or is_active = true)
      order by display_order asc nulls last, row_key asc`,
    [tableCode, activeOnly],
  );
  return rows;
}

function buildCsvRecords(rows: Array<Record<string, string>>, originalHeaders: string[], schemaColumns: ReferenceSchemaColumn[]): CsvRecord[] {
  const headerLookup = new Map(originalHeaders.map((header) => [normalizeHeader(header), header]));
  return rows
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''))
    .map((row) => {
      const rowKeyHeader = headerLookup.get('row_key') ?? 'row_key';
      const rowKey = String(row[rowKeyHeader] ?? '').trim();
      const rowData: Record<string, string> = {};
      for (const column of schemaColumns) {
        const normalized = normalizeHeader(column.column_code);
        const originalHeader = headerLookup.get(normalized) ?? column.column_code;
        rowData[normalized] = String(row[originalHeader] ?? '').trim();
      }
      const displayOrder = toIntegerOrNull(rowData.display_order);
      return { rowKey, rowData, displayOrder };
    });
}

function toIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

async function parseCsv(csvText: string): Promise<{ ok: true; headers: string[]; rows: Array<Record<string, string>> } | { ok: false; message: string }> {
  const Papa = await loadPapaParse();
  if (Papa?.parse) {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, transformHeader: (header: string) => header });
    if (parsed.errors && parsed.errors.length > 0) return { ok: false, message: parsed.errors[0]?.message ?? 'invalid CSV' };
    return { ok: true, headers: parsed.meta.fields ?? [], rows: parsed.data as Array<Record<string, string>> };
  }
  return parseCsvFallback(csvText);
}

async function loadPapaParse(): Promise<{ parse?: (text: string, options: Record<string, unknown>) => { data: unknown[]; errors?: Array<{ message: string }>; meta: { fields?: string[] } } } | null> {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
    const mod = (await dynamicImport('papaparse')) as { default?: unknown };
    return (mod.default ?? mod) as { parse?: (text: string, options: Record<string, unknown>) => { data: unknown[]; errors?: Array<{ message: string }>; meta: { fields?: string[] } } };
  } catch {
    return null;
  }
}

function parseCsvFallback(csvText: string): { ok: true; headers: string[]; rows: Array<Record<string, string>> } | { ok: false; message: string } {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { ok: false, message: 'CSV is empty' };
  const headers = splitCsvLine(lines[0] ?? '');
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });
  return { ok: true, headers, rows };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

async function persistReport(report: StoredReport): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(reportPath(report.reportId), JSON.stringify(report), 'utf8');
}

async function loadReport(reportId: string): Promise<StoredReport | null> {
  try {
    const raw = await readFile(reportPath(reportId), 'utf8');
    return JSON.parse(raw) as StoredReport;
  } catch {
    return null;
  }
}

async function deleteReport(reportId: string): Promise<void> {
  await rm(reportPath(reportId), { force: true });
}

function reportPath(reportId: string): string {
  return join(REPORT_DIR, `${reportId}.json`);
}

async function refreshReferenceTableMv(client: QueryClient, orgId: string, tableCode: string): Promise<void> {
  await client.query(`select app.refresh_reference_table_mv($1::uuid, $2)`, [orgId, tableCode]);
}

function normalizeRecordData(value: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) normalized[normalizeHeader(key)] = entry === null || entry === undefined ? '' : String(entry).trim();
  return normalized;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
