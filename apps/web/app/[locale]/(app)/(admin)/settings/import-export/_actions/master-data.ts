'use server';

/**
 * FLAG(settings-import-export-schema): local migration
 * packages/db/migrations/20260606_232_settings_import_export_labels.sql adds
 * public.import_export_jobs. Do not apply remotely from Codex; this action is
 * wired to the assumed local schema so the Settings master-data hub can read
 * real Supabase data through withOrgContext/RLS.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { orgId: string; client: QueryClient };

export type ImportableEntityKey = 'finished_goods' | 'components' | 'boms' | 'suppliers';
export type ImportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ImportableEntityRow = {
  key: ImportableEntityKey;
  label: string;
  row_count: number;
  last_imported_at: string | null;
};

export type ImportJobRow = {
  id: string;
  entity_key: ImportableEntityKey;
  entity_label: string;
  status: ImportJobStatus;
  rows_processed: number;
  rows_total: number;
  source_file_name: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ImportableEntitiesData = {
  org_id: string;
  entities: ImportableEntityRow[];
  recent_jobs: ImportJobRow[];
};

type CountRow = {
  finished_goods_count: number | string | null;
  components_count: number | string | null;
  boms_count: number | string | null;
  suppliers_count: number | string | null;
};

type LastImportRow = {
  target: ImportableEntityKey;
  last_imported_at: string | Date | null;
};

type ImportJobDbRow = {
  id: string;
  target: ImportableEntityKey;
  status: ImportJobStatus;
  progress_processed: number | string | null;
  progress_total: number | string | null;
  source_file_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
  completed_at: string | Date | null;
};

const ENTITY_LABELS: Record<ImportableEntityKey, string> = {
  finished_goods: 'Finished goods',
  components: 'Components',
  boms: 'BOMs',
  suppliers: 'Suppliers',
};

const ENTITY_KEYS: ImportableEntityKey[] = ['finished_goods', 'components', 'boms', 'suppliers'];

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoString(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapImportJob(row: ImportJobDbRow): ImportJobRow {
  return {
    id: row.id,
    entity_key: row.target,
    entity_label: ENTITY_LABELS[row.target],
    status: row.status,
    rows_processed: toNumber(row.progress_processed),
    rows_total: toNumber(row.progress_total),
    source_file_name: row.source_file_name ?? readFileName(row.metadata),
    created_at: toIsoString(row.created_at) ?? '',
    completed_at: toIsoString(row.completed_at),
  };
}

function readFileName(metadata: Record<string, unknown> | null): string | null {
  const value = metadata?.fileName ?? metadata?.sourceFileName;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function queryImportableEntities(context: OrgContextLike, orgId: string): Promise<ImportableEntitiesData> {
  if (context.orgId !== orgId) return { org_id: context.orgId, entities: [], recent_jobs: [] };

  const [{ rows: countRows }, { rows: lastImportRows }, { rows: recentJobRows }] = await Promise.all([
    context.client.query<CountRow>(
      `select
          (select count(*)::int
             from public.items i
            where i.org_id = app.current_org_id()
              and i.org_id = $1::uuid
              and i.item_type = 'fg') as finished_goods_count,
          (select count(*)::int
             from public.items i
            where i.org_id = app.current_org_id()
              and i.org_id = $1::uuid
              and i.item_type in ('rm', 'intermediate')) as components_count,
          (select count(*)::int
             from public.bom_headers h
            where h.org_id = app.current_org_id()
              and h.org_id = $1::uuid) as boms_count,
          (select count(distinct s.supplier_code)::int
             from public.supplier_specs s
            where s.org_id = app.current_org_id()
              and s.org_id = $1::uuid) as suppliers_count`,
      [orgId],
    ),
    context.client.query<LastImportRow>(
      `select target::text as target, max(created_at) as last_imported_at
         from public.import_export_jobs
        where org_id = app.current_org_id()
          and org_id = $1::uuid
          and kind = 'import'
          and status = 'completed'
          and target = any($2::text[])
        group by target`,
      [orgId, ENTITY_KEYS],
    ),
    context.client.query<ImportJobDbRow>(
      `select id::text,
              target::text as target,
              status,
              progress_processed,
              progress_total,
              source_file_name,
              metadata,
              created_at,
              completed_at
         from public.import_export_jobs
        where org_id = app.current_org_id()
          and org_id = $1::uuid
          and kind = 'import'
          and target = any($2::text[])
        order by created_at desc
        limit 12`,
      [orgId, ENTITY_KEYS],
    ),
  ]);

  const counts = countRows[0] ?? {
    finished_goods_count: 0,
    components_count: 0,
    boms_count: 0,
    suppliers_count: 0,
  };
  const lastImportByTarget = new Map(lastImportRows.map((row) => [row.target, toIsoString(row.last_imported_at)]));

  return {
    org_id: orgId,
    entities: [
      {
        key: 'finished_goods',
        label: ENTITY_LABELS.finished_goods,
        row_count: toNumber(counts.finished_goods_count),
        last_imported_at: lastImportByTarget.get('finished_goods') ?? null,
      },
      {
        key: 'components',
        label: ENTITY_LABELS.components,
        row_count: toNumber(counts.components_count),
        last_imported_at: lastImportByTarget.get('components') ?? null,
      },
      {
        key: 'boms',
        label: ENTITY_LABELS.boms,
        row_count: toNumber(counts.boms_count),
        last_imported_at: lastImportByTarget.get('boms') ?? null,
      },
      {
        key: 'suppliers',
        label: ENTITY_LABELS.suppliers,
        row_count: toNumber(counts.suppliers_count),
        last_imported_at: lastImportByTarget.get('suppliers') ?? null,
      },
    ],
    recent_jobs: recentJobRows.map(mapImportJob),
  };
}

export async function getImportableEntities(orgId: string): Promise<ImportableEntitiesData> {
  return withOrgContext<ImportableEntitiesData>(async (ctx): Promise<ImportableEntitiesData> =>
    queryImportableEntities(ctx as OrgContextLike, orgId),
  );
}
