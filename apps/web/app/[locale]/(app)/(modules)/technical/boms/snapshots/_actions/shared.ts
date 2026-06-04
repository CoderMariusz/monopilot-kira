/**
 * 03-technical · TEC-025 BOM Snapshots Viewer (T-086, spec-driven): shared types
 * + RBAC helper. Plain (non-`'use server'`) module.
 *
 * Schema authority: packages/db/migrations/159-bom-items-fk-coproducts-snapshots.sql
 *   public.bom_snapshots (id, org_id, work_order_id, bom_header_id, snapshot_json,
 *   site_id, snapshot_at). Snapshots are IMMUTABLE (DB trigger + withheld
 *   update/delete grants) — this surface is strictly read-only.
 *
 * RBAC: BOM reads (list/detail) are not permission-gated beyond module access in
 * this codebase — RLS (`app.current_org_id()`) does the tenant isolation. The
 * snapshot viewer follows the same read model (no extra `technical.bom.*` gate;
 * snapshots are immutable so there is no write surface to gate). Cross-org reads
 * return zero rows via RLS.
 */

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Derived lifecycle status of a snapshot (read-only, computed). */
export type SnapshotStatus = 'in_use' | 'closed' | 'orphaned';

export type SnapshotRow = {
  id: string;
  workOrderId: string | null;
  bomHeaderId: string;
  bomVersion: number | null;
  productId: string | null;
  productName: string | null;
  lineCount: number;
  snapshotAt: string;
  status: SnapshotStatus;
};

/**
 * Raw row shape returned by {@link LIST_SNAPSHOTS_SQL}. Exported so the
 * integration test can run the literal production query and assert the mapping.
 */
export type SnapshotQueryRow = {
  id: string;
  work_order_id: string | null;
  bom_header_id: string;
  bom_version: number | null;
  product_id: string | null;
  product_name: string | null;
  line_count: number | string;
  snapshot_at: string | Date;
  header_exists: boolean;
  is_latest: boolean;
};

/**
 * The single source of truth for the BOM-snapshots list query. Lives here (a
 * plain, Next-free module) so the integration test can execute the EXACT SQL the
 * server action runs against a real Postgres + RLS (`app.current_org_id()`).
 *
 * Joins are org-scoped: `public.product` exposes `product_name` (NOT `name`) and
 * `bom_headers.product_id` is the text product_code. Derived status is computed
 * via a window function (latest snapshot per header = in_use; older = closed;
 * missing header = orphaned).
 */
export const LIST_SNAPSHOTS_SQL = `select
           s.id,
           s.work_order_id,
           s.bom_header_id,
           h.version as bom_version,
           h.product_id,
           p.product_name as product_name,
           coalesce(jsonb_array_length(s.snapshot_json -> 'lines'), 0) as line_count,
           s.snapshot_at,
           (h.id is not null) as header_exists,
           (s.id = first_value(s.id) over (
              partition by s.bom_header_id order by s.snapshot_at desc, s.id desc
           )) as is_latest
         from public.bom_snapshots s
         left join public.bom_headers h
           on h.id = s.bom_header_id and h.org_id = app.current_org_id()
         left join public.product p
           on p.product_code = h.product_id and p.org_id = app.current_org_id()
         where s.org_id = app.current_org_id()
         order by s.snapshot_at desc, s.id desc`;

/** Map a raw {@link SnapshotQueryRow} to the UI {@link SnapshotRow}. Pure. */
export function mapSnapshotRow(r: SnapshotQueryRow): SnapshotRow {
  let status: SnapshotStatus;
  if (!r.header_exists) status = 'orphaned';
  else if (r.is_latest) status = 'in_use';
  else status = 'closed';
  return {
    id: String(r.id),
    workOrderId: r.work_order_id ? String(r.work_order_id) : null,
    bomHeaderId: String(r.bom_header_id),
    bomVersion: r.bom_version === null ? null : Number(r.bom_version),
    productId: r.product_id,
    productName: r.product_name,
    lineCount: Number(r.line_count),
    snapshotAt: r.snapshot_at instanceof Date ? r.snapshot_at.toISOString() : String(r.snapshot_at),
    status,
  };
}

export type SnapshotDiffKind = 'noop' | 'chg' | 'add' | 'rem';

export type SnapshotDiffEntry = {
  kind: SnapshotDiffKind;
  path: string;
  frozen: string;
  current: string;
};

/**
 * Flatten a snapshot_json / current-BOM object into stable JSON-path → value
 * pairs, then diff. Pure (no DB) so it is unit-testable. Mirrors the prototype's
 * JSON-flatten diff (spec-driven-screens.jsx:307-354) — kinds noop/chg/add/rem.
 */
export function flattenJson(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = value === null ? 'null' : '';
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => Object.assign(out, flattenJson(v, `${prefix}[${i}]`)));
    return out;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${k}` : k;
      Object.assign(out, flattenJson(v, next));
    }
    return out;
  }
  out[prefix || '(root)'] = String(value);
  return out;
}

export function diffSnapshotVsCurrent(frozen: unknown, current: unknown): SnapshotDiffEntry[] {
  const a = flattenJson(frozen);
  const b = flattenJson(current);
  const paths = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  return paths.map((path) => {
    const inA = path in a;
    const inB = path in b;
    if (inA && inB) {
      return a[path] === b[path]
        ? { kind: 'noop' as const, path, frozen: a[path]!, current: b[path]! }
        : { kind: 'chg' as const, path, frozen: a[path]!, current: b[path]! };
    }
    if (inA) return { kind: 'rem' as const, path, frozen: a[path]!, current: '(removed)' };
    return { kind: 'add' as const, path, frozen: '—', current: b[path]! };
  });
}
