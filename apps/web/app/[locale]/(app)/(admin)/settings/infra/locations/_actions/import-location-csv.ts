'use server';

/**
 * SET-014 / V-SET-60 — Module-level Server Action for locations CSV import.
 *
 * Extracted from page.tsx inline closure to fix the Next.js serialization
 * constraint: Server Actions passed to Client Components cannot close over
 * non-serializable values (functions). This file is the canonical owner of
 * the import action. The page.tsx binds the serializable params
 * (selectedWarehouseId, locale) via .bind() before passing it as the form
 * action prop.
 *
 * CSV format: name,warehouseId,parentPath,level,path
 * - name        : display name (required)
 * - warehouseId : UUID of the target warehouse (required)
 * - parentPath  : ltree path of the parent location, blank = root (optional)
 * - level       : integer depth (1 = warehouse root, 2 = zone, 3 = bin)
 * - path        : full ltree path for this location (required)
 *
 * Idempotent: duplicate rows (same org+code) are upserted (update in place).
 * Errors are reported per-row with row number, code, validation tag, and
 * message appended to the importMessage redirect param.
 */

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };

export type CsvLocationInput = {
  csvRowNumber: number;
  warehouseId: string;
  parentPath: string | null;
  name: string;
  level: number;
  path: string;
};

export type CsvLocationResult =
  | { ok: true; data?: unknown }
  | { ok: false; error?: { code?: string; rowNumber?: number; validation?: string; message?: string } };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UPDATE_PERMISSION = 'settings.infra.update';

const DEFAULT_IMPORT_ERROR = 'Row {row}: {code} ({validation}) {message}';
const DEFAULT_IMPORT_SUCCESS = 'Imported {count} location(s).';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLabel(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (label, [key, value]) => label.replace(`{${key}}`, String(value)),
    template,
  );
}

function locationCodeFromPath(path: string) {
  return path.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').slice(0, 64) || 'LOCATION';
}

function parseCsvText(text: string): CsvLocationInput[] {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = (headerLine ?? '').split(',').map((h) => h.trim());
  const indexOf = (name: string) => headers.indexOf(name);
  return lines.map((line, index) => {
    // Handle quoted fields so commas inside quotes don't split wrong
    const cells = splitCsvRow(line);
    const value = (name: string) => cells[indexOf(name)]?.trim() ?? '';
    const parentPath = value('parentPath');
    return {
      csvRowNumber: index + 1,
      warehouseId: value('warehouseId'),
      parentPath: parentPath.length > 0 ? parentPath : null,
      name: value('name'),
      level: Number.parseInt(value('level'), 10),
      path: value('path'),
    };
  });
}

/** Simple CSV row splitter that handles double-quoted fields. */
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

async function hasPermission(client: QueryClient, userId: string, orgId: string, permission: string) {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3 or r.code = any($4::text[]) or r.slug = any($4::text[]))
      limit 1`,
    [userId, orgId, permission, ['owner', 'admin', 'module_admin']],
  );
  return rows.length > 0;
}

async function importOneRow(input: CsvLocationInput): Promise<CsvLocationResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      if (!(await hasPermission(queryClient, userId, orgId, UPDATE_PERMISSION))) {
        return {
          ok: false,
          error: { code: 'FORBIDDEN', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: 'Missing settings.infra.update permission' },
        };
      }

      const parentPath = input.parentPath?.trim() || null;
      let parent: { id: string; level: number } | null = null;

      if (parentPath) {
        const { rows } = await queryClient.query<{ id: string; level: number }>(
          `select id, level
             from public.locations
            where org_id = app.current_org_id()
              and warehouse_id = $1::uuid
              and path = $2
            limit 1`,
          [input.warehouseId, parentPath],
        );
        parent = rows[0] ?? null;
        if (!parent) {
          return {
            ok: false,
            error: { code: 'INVALID_PARENT', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: `Parent path not found: ${parentPath}` },
          };
        }
        if (input.level !== parent.level + 1) {
          return {
            ok: false,
            error: { code: 'INVALID_PARENT_LEVEL', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: 'Level must equal parent level + 1' },
          };
        }
      } else if (input.level !== 1) {
        return {
          ok: false,
          error: { code: 'INVALID_PARENT_LEVEL', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: 'Root locations must use level 1' },
        };
      }

      const code = locationCodeFromPath(input.path);
      await queryClient.query(
        `insert into public.locations (org_id, warehouse_id, parent_id, code, name, location_type, level, path)
         values (app.current_org_id(), $1::uuid, $2::uuid, $3, $4, 'storage', $5::integer, $6)
         on conflict (org_id, code) do update set
           warehouse_id = excluded.warehouse_id,
           parent_id = excluded.parent_id,
           name = excluded.name,
           level = excluded.level,
           path = excluded.path`,
        [input.warehouseId, parent?.id ?? null, code, input.name, input.level, input.path],
      );

      await queryClient.query(
        `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, 'settings.location.imported', 'location', gen_random_uuid(), $2::jsonb, 'settings-infra-v1')`,
        [orgId, JSON.stringify({ warehouse_id: input.warehouseId, path: input.path, actor_user_id: userId })],
      );

      return { ok: true, data: { path: input.path } };
    });
  } catch (error) {
    console.error('[settings/infra/locations] import_row_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: { code: 'IMPORT_ERROR', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: 'Import failed' } };
  }
}

async function getImportLabels(locale: string): Promise<{ importError: string; importSuccess: string }> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.infra.locations' });
    const importError = (() => { try { const v = t('importError'); return v && v !== 'importError' && !v.includes('settings.infra.locations.') ? v : DEFAULT_IMPORT_ERROR; } catch { return DEFAULT_IMPORT_ERROR; } })();
    const importSuccess = (() => { try { const v = t('importSuccess'); return v && v !== 'importSuccess' && !v.includes('settings.infra.locations.') ? v : DEFAULT_IMPORT_SUCCESS; } catch { return DEFAULT_IMPORT_SUCCESS; } })();
    return { importError, importSuccess };
  } catch {
    return { importError: DEFAULT_IMPORT_ERROR, importSuccess: DEFAULT_IMPORT_SUCCESS };
  }
}

function buildRedirectHref(selectedWarehouseId: string, ok: boolean, message: string) {
  const params = new URLSearchParams();
  if (selectedWarehouseId !== 'all') params.set('warehouseId', selectedWarehouseId);
  params.set('importStatus', ok ? 'success' : 'error');
  params.set('importMessage', message);
  const query = params.toString();
  return query ? `?${query}` : '?';
}

// ---------------------------------------------------------------------------
// Public Server Action
// ---------------------------------------------------------------------------

/**
 * Form action for the locations CSV import form.
 *
 * Must be used with .bind():
 *   importLocationCsvAction.bind(null, selectedWarehouseId, locale)
 *
 * The bound params (selectedWarehouseId, locale) are serializable strings,
 * satisfying the Next.js Server Action serialization constraint.
 * FormData is the last argument, injected by the form submission.
 */
export async function importLocationCsvAction(
  selectedWarehouseId: string,
  locale: string,
  formData: FormData,
): Promise<void> {
  const file = formData.get('csvFile');
  if (!(file instanceof File) || file.size === 0) {
    redirect(buildRedirectHref(selectedWarehouseId, false, 'No CSV file selected.'));
  }

  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    console.error('[settings/infra/locations] csv_read_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    redirect(buildRedirectHref(selectedWarehouseId, false, 'Could not read CSV file.'));
  }

  const labels = await getImportLabels(locale);
  const rows = parseCsvText(text);

  if (rows.length === 0) {
    redirect(buildRedirectHref(selectedWarehouseId, false, 'CSV file contains no data rows.'));
  }

  const errors: string[] = [];
  for (const row of rows) {
    const result = await importOneRow(row);
    if (!result.ok) {
      const error = 'error' in result ? (result.error ?? {}) : {};
      errors.push(
        formatLabel(labels.importError, {
          row: error.rowNumber ?? row.csvRowNumber,
          code: error.code ?? 'IMPORT_ERROR',
          validation: error.validation ?? 'V-SET-60',
          message: error.message ?? '',
        }).trim(),
      );
    }
  }

  const ok = errors.length === 0;
  const message = ok
    ? formatLabel(labels.importSuccess, { count: rows.length })
    : errors.join('; ');

  redirect(buildRedirectHref(selectedWarehouseId, ok, message));
}
