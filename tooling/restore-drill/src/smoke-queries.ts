import type pg from 'pg';

export type SmokeQuery = {
  name: string;
  sql: string;
  assert: (rows: pg.QueryResultRow[]) => boolean;
};

function countValue(rows: pg.QueryResultRow[]): number {
  const raw = rows[0]?.['count'];
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(value) ? value : Number.NaN;
}

export const smokeQueries: SmokeQuery[] = [
  {
    name: 'schema_version',
    sql: `
      select count(*)::int
      from information_schema.tables
      where table_schema = 'public'
    `,
    assert: (rows) => countValue(rows) > 10,
  },
  {
    name: 'placeholder_r13_rls',
    sql: `
      select count(*)::int
      from pg_policies
      where schemaname = 'public'
        and tablename in ('lot', 'work_order', 'quality_event', 'shipment', 'bom_item')
    `,
    assert: (rows) => countValue(rows) >= 5,
  },
  {
    name: 'org_context_callable',
    sql: `select app.current_org_id() as org_id`,
    assert: (rows) => rows.length === 1 && rows[0]?.['org_id'] === null,
  },
  {
    name: 'audit_events_present',
    sql: `select count(*)::int from public.audit_events`,
    assert: (rows) => Number.isFinite(countValue(rows)),
  },
  {
    name: 'outbox_events_table_present',
    sql: `select 1 as present from public.outbox_events limit 1`,
    assert: () => true,
  },
];
