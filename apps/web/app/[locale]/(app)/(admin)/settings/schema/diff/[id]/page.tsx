import { getTranslations } from 'next-intl/server';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type PageSearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params?: Promise<{ locale?: string; id?: string }>;
  searchParams?: Promise<PageSearchParams>;
};

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type SchemaVersionRow = {
  migration_id?: string | null;
  column_id?: string | null;
  schema_column_id?: string | null;
  table_code?: string | null;
  table?: string | null;
  column_code?: string | null;
  col?: string | null;
  dept_code?: string | null;
  tier?: string | null;
  version?: number | string | null;
  v?: number | string | null;
  schema_version?: number | string | null;
  definition_json?: unknown;
  json?: unknown;
  changed_by?: string | null;
  deployed_by?: string | null;
  by?: string | null;
  changed_at?: string | Date | null;
  deployed_at?: string | Date | null;
  at?: string | Date | null;
  deploy_ref?: string | null;
};

type SchemaVersion = {
  migrationId: string;
  tableCode: string;
  columnCode: string;
  deptCode: string;
  tier: string;
  version: number;
  json: JsonRecord;
  changedBy: string;
  changedAt: string;
  deployRef: string;
};

type Labels = {
  title: string;
  subtitle: string;
  unifiedDiff: string;
  noPriorVersion: string;
  noPriorVersionBody: string;
  added: string;
  removed: string;
  changed: string;
  unchanged: string;
  changedBy: string;
  changedAt: string;
  deployRef: string;
  revertToPrevious: string;
  backToSchemaBrowser: string;
  forbiddenTitle: string;
  forbiddenBody: string;
  unableToLoadTitle: string;
  unableToLoadBody: string;
  unavailableTitle: string;
  noVersionsBody: string;
  compare: string;
  against: string;
  tier: string;
  path: string;
  before: string;
  current: string;
  change: string;
  settingsCrumb: string;
  schemaBrowserCrumb: string;
};

type JsonRecord = Record<string, unknown>;
type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';
type DiffRow = { path: string; before: unknown; after: unknown; status: DiffStatus };

const DEFAULT_LABELS: Labels = {
  title: 'Schema diff',
  subtitle: 'Side-by-side comparison of schema versions for a specific column.',
  unifiedDiff: 'Unified JSON deep diff',
  noPriorVersion: 'No prior version',
  noPriorVersionBody: 'This column is at version 1. There is nothing to compare against yet.',
  added: '{count} added',
  removed: '{count} removed',
  changed: '{count} changed',
  unchanged: '{count} unchanged',
  changedBy: 'Changed by',
  changedAt: 'Changed at',
  deployRef: 'Deploy ref',
  revertToPrevious: 'Revert to Version N-1',
  backToSchemaBrowser: 'Back to schema browser',
  forbiddenTitle: '403 — Forbidden',
  forbiddenBody: 'You do not have permission to view schema diffs.',
  unableToLoadTitle: 'Unable to load schema diff',
  unableToLoadBody: 'Schema version history is unavailable for this migration.',
  unavailableTitle: 'Schema diff unavailable',
  noVersionsBody: 'No schema versions were found for {id}.',
  compare: 'Compare',
  against: 'against',
  tier: 'Tier',
  path: 'Path',
  before: 'before',
  current: 'current',
  change: 'Change',
  settingsCrumb: 'Settings',
  schemaBrowserCrumb: 'Schema browser',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;
const SCHEMA_READ_PERMISSIONS = ['settings.schema.read', 'settings.schema.admin'];
const FORBIDDEN = 'forbidden' as const;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toNumber(value: number | string | null | undefined, fallback = 1) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return '—';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeJson(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function formatJson(value: unknown) {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  return JSON.stringify(value, null, 2);
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffJson(before: unknown, after: unknown, prefix = ''): DiffRow[] {
  const beforeRecord = isRecord(before) ? before : null;
  const afterRecord = isRecord(after) ? after : null;
  if (!beforeRecord || !afterRecord) {
    return jsonEqual(before, after) ? [] : [{ path: prefix || '$', before, after, status: 'changed' }];
  }

  const keys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])).sort();
  return keys.flatMap((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeRecord, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterRecord, key);
    if (!hasBefore) return [{ path, before: undefined, after: afterRecord[key], status: 'added' as const }];
    if (!hasAfter) return [{ path, before: beforeRecord[key], after: undefined, status: 'removed' as const }];
    if (isRecord(beforeRecord[key]) && isRecord(afterRecord[key])) return diffJson(beforeRecord[key], afterRecord[key], path);
    return jsonEqual(beforeRecord[key], afterRecord[key]) ? [] : [{ path, before: beforeRecord[key], after: afterRecord[key], status: 'changed' as const }];
  });
}

function countRows(rows: DiffRow[]) {
  return rows.reduce(
    (acc, row) => ({ ...acc, [row.status]: acc[row.status] + 1 }),
    { added: 0, removed: 0, changed: 0, unchanged: 0 } satisfies Record<DiffStatus, number>,
  );
}

function labelCount(template: string, count: number) {
  return template.includes('{count}') ? template.replace('{count}', String(count)) : `${count} ${template}`;
}

function interpolate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function badgeVariant(status: DiffStatus) {
  if (status === 'added') return 'success' as const;
  if (status === 'removed') return 'danger' as const;
  if (status === 'changed') return 'warning' as const;
  return 'muted' as const;
}

function mapRow(row: SchemaVersionRow, routeId: string): SchemaVersion {
  const version = toNumber(row.version ?? row.v ?? row.schema_version);
  const columnCode = row.column_code ?? row.col ?? row.schema_column_id ?? 'unknown_column';
  const tableCode = row.table_code ?? row.table ?? 'unknown_table';
  return {
    migrationId: row.migration_id ?? routeId,
    tableCode,
    columnCode,
    deptCode: row.dept_code ?? 'settings',
    tier: row.tier ?? 'L3',
    version,
    json: normalizeJson(row.definition_json ?? row.json),
    changedBy: row.changed_by ?? row.deployed_by ?? row.by ?? 'system',
    changedAt: toIso(row.changed_at ?? row.deployed_at ?? row.at),
    deployRef: row.deploy_ref ?? '—',
  };
}

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.schema_diff' });
    return LABEL_KEYS.reduce((acc, key) => {
      try {
        acc[key] = t(key, key.endsWith('ed') || key === 'unchanged' ? { count: '{count}' } : undefined);
      } catch {
        acc[key] = DEFAULT_LABELS[key];
      }
      return acc;
    }, { ...DEFAULT_LABELS });
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function requireSchemaReadPermission({ client, userId, orgId }: OrgActionContext): Promise<void> {
  const { rows } = await client.query<{ ok?: boolean; allowed?: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
          or lower(coalesce(r.code, '')) in ('owner', 'admin', 'org_admin')
        )
      limit 1`,
    [userId, orgId, SCHEMA_READ_PERMISSIONS],
  );
  if (rows.length === 0) throw FORBIDDEN;
}

async function readSchemaVersions(routeId: string): Promise<SchemaVersion[]> {
  return withOrgContext(async (ctx: OrgActionContext) => {
    const { client } = ctx;
    await requireSchemaReadPermission(ctx);
    const { rows } = await client.query<SchemaVersionRow>(
      `select sm.id::text as migration_id,
              rs.id::text as schema_column_id,
              rs.column_code,
              rs.table_code,
              rs.dept_code,
              rs.tier,
              rs.schema_version as version,
              jsonb_strip_nulls(jsonb_build_object(
                'data_type', rs.data_type,
                'required', rs.required_for_done,
                'validation', rs.validation_json,
                'presentation', rs.presentation_json,
                'storage', rs.storage,
                'dropdown_source', rs.dropdown_source,
                'blocking_rule', rs.blocking_rule
              )) as definition_json,
              coalesce(sm.approved_by::text, rs.created_by::text, 'system') as changed_by,
              coalesce(sm.executed_at, sm.approved_at, rs.created_at) as changed_at,
              coalesce(sm.result_notes, sm.migration_script, sm.status) as deploy_ref
         from public.schema_migrations sm
         join public.reference_schemas rs
           on rs.org_id = sm.org_id
          and rs.table_code = sm.table_code
          and coalesce(sm.column_code, rs.column_code) = rs.column_code
        where sm.org_id = app.current_org_id()
          and (sm.id::text = $1 or sm.result_notes = $1 or sm.migration_script = $1)
        order by rs.schema_version asc`,
      [routeId],
    );
    return rows.map((row) => mapRow(row, routeId)).sort((left, right) => left.version - right.version);
  });
}

function StateCard({ role, title, body }: { role: 'status' | 'alert'; title: string; body: string }) {
  return (
    <Card className="settings-schema-diff__state">
      <CardContent role={role}>
        <strong>{title}</strong>
        <p>{body}</p>
      </CardContent>
    </Card>
  );
}

function DiffValue({ value, status, side }: { value: unknown; status: DiffStatus; side: 'before' | 'after' }) {
  const removed = status === 'removed' && side === 'before';
  const addedOrChanged = (status === 'added' || status === 'changed') && side === 'after';
  return (
    <code className={[
      'settings-schema-diff__value',
      removed ? 'bg-red-50 text-red-800 line-through' : '',
      addedOrChanged ? 'bg-green-50 text-green-900' : '',
    ].filter(Boolean).join(' ')}>
      {formatJson(value)}
    </code>
  );
}

function VersionPanel({ title, version, rows, side }: { title: string; version: number; rows: DiffRow[]; side: 'before' | 'after' }) {
  return (
    <Card className="settings-schema-diff__panel">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Badge variant={side === 'before' ? 'muted' : 'success'}>v{version}</Badge>
      </CardHeader>
      <CardContent>
        <dl className="settings-schema-diff__json-list">
          {rows.map((row) => (
            <div key={`${side}-${row.path}`} className="settings-schema-diff__json-row">
              <dt>{row.path}</dt>
              <dd><DiffValue value={side === 'before' ? row.before : row.after} status={row.status} side={side} /></dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export default async function SchemaDiffPage(propsInput: PageProps) {
  const props = propsInput ?? {};
  const { locale = 'en', id = '' } = props.params ? await props.params : { locale: 'en', id: '' };
  const searchParams = props.searchParams ? await props.searchParams : {};
  const labels = await buildLabels(locale);
  const routeId = id || 'unknown';
  const toVersion = toNumber(one(searchParams.to), 0);
  const fromVersionParam = toNumber(one(searchParams.from), 0);

  let versions: SchemaVersion[] = [];
  let state: 'ready' | 'empty' | 'forbidden' | 'error' = 'ready';
  try {
    versions = await readSchemaVersions(routeId);
    if (versions.length === 0) state = 'empty';
  } catch (error) {
    state = error === FORBIDDEN ? 'forbidden' : 'error';
  }

  const current = versions.find((version) => version.version === toVersion) ?? versions.at(-1);
  const before = current
    ? versions.find((version) => version.version === (fromVersionParam || current.version - 1))
      ?? versions.filter((version) => version.version < current.version).at(-1)
    : undefined;
  const showNoPrior = state === 'ready' && (!current || current.version <= 1 || !before);
  const diffRows = state === 'ready' && current && before ? diffJson(before.json, current.json) : [];
  const counts = countRows(diffRows);
  const canRevert = current && before && current.tier !== 'L1' && versions.length >= 2 && current.version - before.version <= 3;
  const titleColumn = current?.columnCode ?? before?.columnCode ?? routeId;

  return (
    <main
      data-testid="settings-schema-diff-screen"
      data-screen="settings-schema-diff"
      data-route-template="/settings/schema/diff/:id"
      aria-labelledby="settings-schema-diff-title"
      className="settings-page settings-schema-diff space-y-4"
    >
      <header data-region="page-head" className="settings-page__head">
        <div>
          <nav aria-label="Breadcrumb" className="muted mono text-xs uppercase tracking-wide">
            {labels.settingsCrumb} / {labels.schemaBrowserCrumb} / {labels.title}: <span>{titleColumn}</span>
          </nav>
          <h1 id="settings-schema-diff-title">{labels.title} — <span className="mono">{titleColumn}</span></h1>
          <p>
            {labels.subtitle}{' '}
            {current ? <span className="muted mono">migration_id: {routeId} · table: {current.tableCode}</span> : null}
          </p>
        </div>
        <Button type="button" className="btn-secondary">← {labels.backToSchemaBrowser}</Button>
      </header>

      {state === 'forbidden' ? <StateCard role="alert" title={labels.forbiddenTitle} body={labels.forbiddenBody} /> : null}
      {state === 'error' ? <StateCard role="alert" title={labels.unableToLoadTitle} body={labels.unableToLoadBody} /> : null}
      {state === 'empty' ? <StateCard role="status" title={labels.unavailableTitle} body={interpolate(labels.noVersionsBody, { id: routeId })} /> : null}

      {state === 'ready' && current ? (
        <>
          <section className="sg-section settings-schema-diff__selector" aria-label="Version comparison">
            <div className="flex flex-wrap items-center gap-3">
              <span className="muted text-sm">{labels.compare}</span>
              <Badge variant="muted">v{before?.version ?? Math.max(1, current.version - 1)}</Badge>
              <span className="muted text-sm">{labels.against}</span>
              <Badge variant="success">v{current.version}</Badge>
              <span>{`v${before?.version ?? Math.max(1, current.version - 1)} → v${current.version}`}</span>
              <span className="muted mono text-xs">{current.tableCode} / {current.columnCode}</span>
            </div>
            {!showNoPrior ? (
              <div className="settings-schema-diff__badges flex flex-wrap gap-2" aria-label="Diff summary">
                <Badge variant="success">+ {labelCount(labels.added, counts.added)}</Badge>
                <Badge variant="danger">− {labelCount(labels.removed, counts.removed)}</Badge>
                <Badge variant="warning">~ {labelCount(labels.changed, counts.changed)}</Badge>
                <Badge variant="muted">{labelCount(labels.unchanged, counts.unchanged)}</Badge>
              </div>
            ) : null}
          </section>

          {showNoPrior ? (
            <StateCard role="status" title={labels.noPriorVersion} body={labels.noPriorVersionBody} />
          ) : before ? (
            <>
              <section className="settings-schema-diff__panels grid gap-3 md:grid-cols-2" aria-label="Side by side JSON panels">
                <VersionPanel title={`Version ${before.version} (before)`} version={before.version} rows={diffRows} side="before" />
                <VersionPanel title={`Version ${current.version} (current)`} version={current.version} rows={diffRows} side="after" />
              </section>

              <Card className="settings-schema-diff__metadata">
                <CardContent className="grid gap-3 md:grid-cols-4">
                  <div><div className="muted">{labels.changedBy}</div><strong>{current.changedBy}</strong></div>
                  <div><div className="muted">{labels.changedAt}</div><span className="mono">{current.changedAt}</span></div>
                  <div><div className="muted">{labels.tier}</div><Badge variant={current.tier === 'L1' ? 'info' : 'success'}>{current.tier}</Badge></div>
                  <div><div className="muted">{labels.deployRef}</div><span className="mono">{current.deployRef}</span></div>
                </CardContent>
              </Card>

              <section data-region="primary-content" aria-labelledby="settings-schema-diff-table-title">
                <Card>
                  <CardHeader>
                    <CardTitle id="settings-schema-diff-table-title">{labels.unifiedDiff}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table aria-label={labels.unifiedDiff}>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">{labels.path}</TableHead>
                          <TableHead scope="col">v{before.version} / {labels.before}</TableHead>
                          <TableHead scope="col">v{current.version} / {labels.current}</TableHead>
                          <TableHead scope="col">{labels.change}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {diffRows.map((row) => (
                          <TableRow key={row.path}>
                            <TableCell><code>{row.path}</code></TableCell>
                            <TableCell><DiffValue value={row.before} status={row.status} side="before" /></TableCell>
                            <TableCell><DiffValue value={row.after} status={row.status} side="after" /></TableCell>
                            <TableCell><Badge variant={badgeVariant(row.status)}>{row.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </section>

              {canRevert ? <Button type="button" className="btn-secondary">↺ {labels.revertToPrevious}</Button> : null}
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
