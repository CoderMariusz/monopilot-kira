'use server';

import { randomUUID } from 'node:crypto';

import { hasPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';

const IMPORT_PERMISSION = 'settings.reference.import';
const REPORT_TTL_MS = 60 * 60 * 1000;

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
  action: 'insert' | 'update' | 'skip' | 'error';
  expectedVersion: number | null;
  previousData: Record<string, unknown> | null;
  error?: string;
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
  errors: Array<{ rowKey: string; message: string }>;
};

export type PreviewReferenceCsvImportResult =
  | {
      ok: true;
      data: {
        reportId: string;
        expiresAt: string;
        summary: ImportSummary;
        conflicts: Array<Record<string, unknown>>;
        errors: Array<{ rowKey: string; message: string }>;
      };
    }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'CSV_HEADER_MISMATCH' | 'persistence_failed';
      details?: { missingColumns?: string[]; unknownColumns?: string[] };
      message?: string;
    };

export type CommitReferenceCsvImportResult =
  | { ok: true; data: { summary: ImportSummary } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'report_not_found' | 'report_expired' | 'conflict_detected' | 'persistence_failed';
      conflictReport?: Array<Record<string, unknown>>;
      staleRows?: string[];
    };

export async function previewReferenceCsvImport(rawInput: unknown): Promise<PreviewReferenceCsvImportResult> {
  const input = parsePreviewInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<PreviewReferenceCsvImportResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, IMPORT_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const schemaColumns = await loadSchemaColumns(client, input.tableCode);
      if (schemaColumns.length === 0) return { ok: false, error: 'invalid_input', message: 'reference schema is not configured' };

      const parsed = parseCsv(input.csvText);
      if (parsed.ok === false) return { ok: false, error: 'invalid_input', message: parsed.message };

      const expectedHeaders = ['row_key', ...schemaColumns.map((column) => normalizeHeader(column.column_code))];
      const actualHeaders = parsed.headers.map(normalizeHeader);
      const missingColumns = expectedHeaders.filter((header) => !actualHeaders.includes(header));
      const unknownColumns = actualHeaders.filter((header) => !expectedHeaders.includes(header));
      if (missingColumns.length > 0 || unknownColumns.length > 0 || actualHeaders.length !== expectedHeaders.length) {
        return { ok: false, error: 'CSV_HEADER_MISMATCH', details: { missingColumns, unknownColumns } };
      }

      const records = buildCsvRecords(parsed.rows, parsed.headers, schemaColumns);
      const existingRows = await loadReferenceRows(client, input.tableCode);
      const existingByKey = new Map(existingRows.map((row) => [row.row_key, row]));
      const entries: PreviewEntry[] = [];
      const conflicts: Array<Record<string, unknown>> = [];
      const errors: Array<{ rowKey: string; message: string }> = [];
      const summary: ImportSummary = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

      for (const record of records) {
        const validationError = validateRecordAgainstSchema(record, schemaColumns);
        if (validationError) {
          entries.push({ ...record, action: 'error', expectedVersion: null, previousData: null, error: validationError });
          errors.push({ rowKey: record.rowKey, message: validationError });
          summary.errors += 1;
          continue;
        }
        const existing = existingByKey.get(record.rowKey);
        if (!existing) {
          entries.push({ ...record, action: 'insert', expectedVersion: null, previousData: null });
          summary.inserted += 1;
          continue;
        }

        const action = stableStringify(normalizeRecordData(existing.row_data)) === stableStringify(normalizeRecordData(record.rowData))
          ? 'skip'
          : 'update';
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
        errors,
      };

      await persistReport(client, { orgId, userId, report });
      return { ok: true, data: { reportId, expiresAt, summary, conflicts, errors } };
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

      const report = await loadReport(client, input.reportId);
      if (!report || report.orgId !== orgId) return { ok: false, error: 'report_not_found' };
      if (Date.parse(report.expiresAt) <= Date.now()) {
        await deleteReport(client, input.reportId);
        return { ok: false, error: 'report_expired' };
      }

      const schemaColumns = await loadSchemaColumns(client, report.tableCode);
      const expectedHeaders = ['row_key', ...schemaColumns.map((column) => normalizeHeader(column.column_code))];
      if (stableStringify(expectedHeaders) !== stableStringify(report.columns)) {
        return { ok: false, error: 'conflict_detected', staleRows: report.entries.map((entry) => entry.rowKey) };
      }

      const existingRows = await loadReferenceRows(client, report.tableCode);
      const existingByKey = new Map(existingRows.map((row) => [row.row_key, row]));
      const staleRows: string[] = [];
      const conflictReport: Array<Record<string, unknown>> = [];

      for (const entry of report.entries) {
        if (entry.action === 'error' || entry.action === 'skip') continue;
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
        if (entry.action === 'skip' || entry.action === 'error') continue;
        if (entry.action === 'insert') {
          await client.query<ReferenceRow>(
            `insert into public.reference_tables
               (org_id, table_code, row_key, row_data, display_order, created_by)
             values ($1::uuid, $2, $3, $4::jsonb, $5, $6::uuid)
             returning org_id, table_code, row_key, row_data, version, is_active, display_order`,
            [orgId, report.tableCode, entry.rowKey, JSON.stringify(entry.rowData), entry.displayOrder, userId],
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
            [report.tableCode, entry.rowKey, JSON.stringify(entry.rowData), entry.displayOrder, entry.expectedVersion],
          );
          if ((rowCount ?? rows.length) < 1) {
            return { ok: false, error: 'conflict_detected', staleRows: [entry.rowKey], conflictReport: [{ rowKey: entry.rowKey, row_key: entry.rowKey }] };
          }
        }
      }

      await refreshReferenceTableMv(client, orgId, report.tableCode);
      await writeAuditLog(client, {
        orgId,
        actorUserId: userId,
        action: 'reference.csv.commit',
        resourceId: report.tableCode,
        afterState: { summary: report.summary, reportId: report.reportId },
      });
      await writeOutbox(client, {
        orgId,
        eventType: 'reference.csv.committed',
        aggregateId: orgId,
        payload: { tableCode: report.tableCode, summary: report.summary, reportId: report.reportId },
      });
      await deleteReport(client, input.reportId);
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

async function loadSchemaColumns(client: QueryClient, tableCode: string): Promise<ReferenceSchemaColumn[]> {
  // reference_tables DATA rows use bare table codes such as "processes";
  // reference_schemas universal rows are seeded under "reference.processes".
  // Match both and prefer org-scoped overrides over universal L1 rows.
  const schemaTableCodes = tableCode.startsWith('reference.')
    ? [tableCode, tableCode.slice('reference.'.length)]
    : [tableCode, `reference.${tableCode}`];

  const { rows } = await client.query<ReferenceSchemaColumn>(
    `select distinct on (column_code)
            column_code, data_type, required_for_done, validation_json, presentation_json
       from public.reference_schemas
      where table_code = any($1::text[])
        and (org_id = app.current_org_id() or org_id is null)
        and deprecated_at is null
      order by column_code,
               org_id nulls last,
               case when (presentation_json->>'display_order') ~ '^-?[0-9]+$' then (presentation_json->>'display_order')::int else 0 end`,
    [schemaTableCodes],
  );
  return rows.sort((left, right) => {
    const leftOrder = presentationOrder(left);
    const rightOrder = presentationOrder(right);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.column_code.localeCompare(right.column_code);
  });
}

function presentationOrder(column: ReferenceSchemaColumn): number {
  const presentation = column.presentation_json;
  if (!presentation || typeof presentation !== 'object' || Array.isArray(presentation)) return 0;
  const value = (presentation as { display_order?: unknown }).display_order;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function loadReferenceRows(client: QueryClient, tableCode: string): Promise<ReferenceRow[]> {
  const { rows } = await client.query<ReferenceRow>(
    `select table_code, row_key, row_data, version, is_active, display_order
       from public.reference_tables
      where org_id = app.current_org_id()
        and table_code = $1
      order by display_order asc nulls last, row_key asc`,
    [tableCode],
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

function validateRecordAgainstSchema(record: CsvRecord, schemaColumns: ReferenceSchemaColumn[]): string | null {
  if (record.rowKey === '' || record.rowKey.length > 128) {
    return 'row_key must be 1–128 characters';
  }
  for (const column of schemaColumns) {
    const normalized = normalizeHeader(column.column_code);
    const value = record.rowData[normalized] ?? '';
    const required = Boolean(column.required_for_done ?? column.is_required ?? column.required);
    if (required && value === '') return `${column.column_code} is required`;
    if (value === '') continue;
    switch (column.data_type) {
      case 'number': {
        if (!Number.isFinite(Number(value))) return `${column.column_code} must be a number`;
        break;
      }
      case 'date': {
        if (Number.isNaN(Date.parse(value))) return `${column.column_code} must be a date`;
        break;
      }
      case 'enum': {
        const values = enumValues(column);
        if (values.length > 0 && !values.includes(value)) return `${column.column_code} must be one of ${values.join(', ')}`;
        break;
      }
      default:
        break;
    }
  }
  return null;
}

function enumValues(column: ReferenceSchemaColumn): string[] {
  const validation = column.validation_json;
  if (validation && typeof validation === 'object' && !Array.isArray(validation)) {
    const validationRecord = validation as Record<string, unknown>;
    if (Array.isArray(validationRecord.enum_values)) return validationRecord.enum_values.map(String);
    if (Array.isArray(validationRecord.values)) return validationRecord.values.map(String);
  }
  return [];
}

function toIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function parseCsv(csvText: string): { ok: true; headers: string[]; rows: Array<Record<string, string>> } | { ok: false; message: string } {
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

async function persistReport(
  client: QueryClient,
  params: { orgId: string; userId: string; report: StoredReport },
): Promise<void> {
  await client.query(
    `insert into public.reference_csv_import_reports
       (id, org_id, table_code, payload, expires_at, created_by)
     values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::timestamptz, $6::uuid)`,
    [
      params.report.reportId,
      params.orgId,
      params.report.tableCode,
      JSON.stringify(params.report),
      params.report.expiresAt,
      params.userId,
    ],
  );
}

async function loadReport(client: QueryClient, reportId: string): Promise<StoredReport | null> {
  const { rows } = await client.query<{ payload: unknown }>(
    `select payload
       from public.reference_csv_import_reports
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [reportId],
  );
  const payload = rows[0]?.payload;
  if (!payload) return null;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as StoredReport;
    } catch {
      return null;
    }
  }
  return payload as StoredReport;
}

async function deleteReport(client: QueryClient, reportId: string): Promise<void> {
  await client.query(
    `delete from public.reference_csv_import_reports
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [reportId],
  );
}

async function refreshReferenceTableMv(client: QueryClient, orgId: string, tableCode: string): Promise<void> {
  await client.query(`select app.refresh_reference_table_mv($1::uuid, $2)`, [orgId, tableCode]);
}

async function writeAuditLog(
  client: QueryClient,
  params: { orgId: string; actorUserId: string; action: string; resourceId: string; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'reference_table', $4, null, $5::jsonb, 'standard')`,
    [params.orgId, params.actorUserId, params.action, params.resourceId, JSON.stringify(params.afterState)],
  );
}

async function writeOutbox(
  client: QueryClient,
  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'reference_table', $3::uuid, $4::jsonb, 'settings-reference-csv-v1')`,
    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload)],
  );
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
