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
