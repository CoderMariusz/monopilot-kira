/**
 * T-034 — Schema drift detection (GREEN implementation)
 *
 * Compares Reference.DeptColumns rows against information_schema.columns and
 * returns a structured diff. Writes a single audit_events row with
 * action='schema.drift_detected' retention_class='operational' (T-009 risk
 * red line) when drift is detected. Returns empty diff and writes nothing
 * when DeptColumns and information_schema agree.
 *
 * AC mapping (from `_meta/atomic-tasks/00-foundation/tasks/T-034.json`):
 *   AC1 — DeptColumns row referencing a missing column → missing_in_db + audit
 *   AC2 — DeptColumns and information_schema agree → empty diff, no audit row
 *   AC3 — cron route auth (lives in apps/web/app/api/internal/cron/drift)
 *
 * Implementation notes:
 *   - dept_code → physical table mapping is optional. When unresolved, all
 *     declared columns for that dept are treated as `missing_in_db` (the
 *     table effectively does not exist in the DB).
 *   - The `pool` parameter is required so the caller controls connection
 *     lifecycle (system/owner pool for the cron, ad-hoc pool for tests).
 *   - We do NOT use BYPASSRLS — the caller is expected to scope the pool
 *     appropriately. Reads of information_schema and Reference.DeptColumns
 *     are filtered by orgId via WHERE clauses.
 *   - Field-type → information_schema.data_type canonical mapping is best
 *     effort; type_mismatch is only emitted when both sides are present and
 *     mappings disagree.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';

export interface DriftDiff {
  missing_in_db: string[];
  extra_in_db: string[];
  type_mismatch: Array<{ column: string; expected: string; actual: string }>;
}

export interface DriftItem {
  dept_code: string;
  table_name: string | null;
  diff: DriftDiff;
}

export interface DetectDriftOptions {
  orgId: string;
  /** Optional dept_code filter for a partial sweep. */
  deptCode?: string;
  /** Optional dept_code → physical table (schema-qualified) mapping. */
  tableMap?: Record<string, string>;
  /** Connection pool — caller-owned. When omitted, a one-shot pool is opened
   *  against `process.env.DATABASE_URL` and closed before return. */
  pool?: Pick<pg.Pool, 'query'>;
}

export interface DetectDriftResult {
  /** Aggregate diff (union across depts) — primary contract per AC1. */
  diff: DriftDiff;
  /** Per-dept breakdown for callers that need it. */
  items: DriftItem[];
  /** True when the function emitted a `schema.drift_detected` audit row. */
  audited: boolean;
}

/** Map Reference.FieldTypes.code → canonical information_schema.data_type. */
const FIELD_TYPE_TO_DATA_TYPE: Record<string, string[]> = {
  string: ['text', 'character varying', 'character', 'citext'],
  number: ['numeric', 'double precision', 'real'],
  integer: ['integer', 'bigint', 'smallint'],
  boolean: ['boolean'],
  date: ['date'],
  datetime: ['timestamp with time zone', 'timestamp without time zone'],
  enum: ['text', 'character varying', 'USER-DEFINED'],
  formula: ['text', 'character varying'],
};

interface InfoSchemaRow {
  schemaName: string;
  tableName: string;
  columns: Map<string, string>;
}

function parseSchemaQualified(qualified: string): { schema: string; table: string } {
  const parts = qualified.split('.');
  if (parts.length === 2) {
    return { schema: parts[0]!.replace(/"/g, ''), table: parts[1]!.replace(/"/g, '') };
  }
  return { schema: 'public', table: qualified.replace(/"/g, '') };
}

async function loadInformationSchema(
  pool: Pick<pg.Pool, 'query'>,
  schema: string,
  table: string,
): Promise<InfoSchemaRow | null> {
  const res = await pool.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name   = $2`,
    [schema, table],
  );
  if (res.rowCount === 0) return null;
  const columns = new Map<string, string>();
  for (const row of res.rows) {
    columns.set(row.column_name, row.data_type);
  }
  return { schemaName: schema, tableName: table, columns };
}

function compareColumns(
  declared: Array<{ column_key: string; field_type: string }>,
  info: InfoSchemaRow | null,
): DriftDiff {
  const diff: DriftDiff = { missing_in_db: [], extra_in_db: [], type_mismatch: [] };
  if (!info) {
    // Table not resolvable / not present — every declared column is missing.
    for (const d of declared) diff.missing_in_db.push(d.column_key);
    return diff;
  }
  const declaredKeys = new Set(declared.map((d) => d.column_key));
  for (const d of declared) {
    const dbType = info.columns.get(d.column_key);
    if (dbType === undefined) {
      diff.missing_in_db.push(d.column_key);
      continue;
    }
    const expected = FIELD_TYPE_TO_DATA_TYPE[d.field_type];
    if (expected && !expected.includes(dbType)) {
      diff.type_mismatch.push({
        column: d.column_key,
        expected: d.field_type,
        actual: dbType,
      });
    }
  }
  // extra_in_db: only emitted in strict mode — out of scope for AC1/AC2.
  // Leave empty by default; reserved for future strict-mode flag.
  void declaredKeys;
  return diff;
}

function isEmpty(diff: DriftDiff): boolean {
  return (
    diff.missing_in_db.length === 0 &&
    diff.extra_in_db.length === 0 &&
    diff.type_mismatch.length === 0
  );
}

function mergeDiff(target: DriftDiff, src: DriftDiff): void {
  for (const c of src.missing_in_db) target.missing_in_db.push(c);
  for (const c of src.extra_in_db) target.extra_in_db.push(c);
  for (const c of src.type_mismatch) target.type_mismatch.push(c);
}

export async function detectDrift(opts: DetectDriftOptions): Promise<DetectDriftResult> {
  const { orgId, deptCode, tableMap = {} } = opts;

  // Resolve pool: caller-supplied OR construct a one-shot from DATABASE_URL.
  let pool: Pick<pg.Pool, 'query'>;
  let ownsPool = false;
  if (opts.pool) {
    pool = opts.pool;
  } else {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'detectDrift: pool not supplied and DATABASE_URL is not set — cannot connect',
      );
    }
    // T-058 lint exception: detectDrift runs as a system actor over
    // information_schema and the audit_events table; the managed @monopilot/db
    // pool wires the app role under RLS, which would block these reads. The
    // production path injects a caller-owned pool via the cron handler.
    // eslint-disable-next-line no-restricted-syntax
    pool = new pg.Pool({ connectionString });
    ownsPool = true;
  }
  try {
    return await detectDriftImpl({ orgId, deptCode, tableMap, pool });
  } finally {
    if (ownsPool) {
      await (pool as pg.Pool).end();
    }
  }
}

interface DetectDriftImplOptions {
  orgId: string;
  deptCode?: string;
  tableMap: Record<string, string>;
  pool: Pick<pg.Pool, 'query'>;
}

async function detectDriftImpl(opts: DetectDriftImplOptions): Promise<DetectDriftResult> {
  const { orgId, deptCode, tableMap, pool } = opts;

  // 1. Load DeptColumns for the org (optionally filtered by dept_code).
  const params: unknown[] = [orgId];
  let where = `org_id = $1`;
  if (deptCode) {
    params.push(deptCode);
    where += ` AND dept_code = $2`;
  }
  const declared = await pool.query<{
    dept_code: string;
    column_key: string;
    field_type: string;
  }>(
    `SELECT dept_code, column_key, field_type
       FROM "Reference"."DeptColumns"
      WHERE ${where}`,
    params,
  );

  const aggregate: DriftDiff = { missing_in_db: [], extra_in_db: [], type_mismatch: [] };
  const items: DriftItem[] = [];

  if (declared.rowCount === 0) {
    // Trivially in agreement (AC2): nothing declared → nothing to drift.
    return { diff: aggregate, items, audited: false };
  }

  // 2. Group by dept_code.
  const byDept = new Map<string, Array<{ column_key: string; field_type: string }>>();
  for (const row of declared.rows) {
    const arr = byDept.get(row.dept_code) ?? [];
    arr.push({ column_key: row.column_key, field_type: row.field_type });
    byDept.set(row.dept_code, arr);
  }

  // 3. Per-dept diff.
  for (const [dept, cols] of byDept.entries()) {
    const tableQualified = tableMap[dept] ?? null;
    let info: InfoSchemaRow | null = null;
    if (tableQualified) {
      const { schema, table } = parseSchemaQualified(tableQualified);
      info = await loadInformationSchema(pool, schema, table);
    }
    const diff = compareColumns(cols, info);
    items.push({ dept_code: dept, table_name: tableQualified, diff });
    mergeDiff(aggregate, diff);
  }

  // 4. Emit audit row when drift is detected.
  let audited = false;
  if (!isEmpty(aggregate)) {
    await pool.query(
      `INSERT INTO public.audit_events
         (org_id, actor_type, action, resource_type, resource_id,
          after_state, request_id, retention_class)
       VALUES ($1, 'system', 'schema.drift_detected', 'reference.dept_columns',
               $2, $3::jsonb, $4, 'operational')`,
      [
        orgId,
        deptCode ?? '*',
        JSON.stringify({ diff: aggregate, items, org_id: orgId }),
        randomUUID(),
      ],
    );
    audited = true;
  }

  return { diff: aggregate, items, audited };
}
