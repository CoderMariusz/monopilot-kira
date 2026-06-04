/**
 * T-025 — BOM snapshot at WO creation (ADR-002).
 *
 * The immutable-snapshot SERVICE that 08-PRODUCTION calls at Work-Order creation to
 * FREEZE the active shared-BOM (header + lines + co-products) into a single
 * `public.bom_snapshots` row keyed to the WO. Once captured, the WO executes against
 * this snapshot only — it never re-reads live `bom_headers`, so post-creation BOM edits
 * can never retroactively change a WO's recipe (ADR-002).
 *
 * Contract:
 *   - Runs inside a caller-supplied org-context transaction. 08-PRODUCTION's WO-creation
 *     Server Action opens it via `withOrgContext(...)` and passes the txn-bound client as
 *     `ctx.client`; every read/write is therefore RLS-scoped by `app.current_org_id()`.
 *     (Same caller-owned-context pattern as `release-bundle-service.ts`.)
 *   - `snapshot_json` shape MIRRORS the T-012 BOM detail API output: `{ header, lines,
 *     co_products }` — reusing the canonical mappers from the bom `_actions/shared.ts`
 *     so the frozen shape and the live-detail shape can never drift.
 *   - NUMERIC-exact: `quantity` / `allocation_pct` / `scrap_pct` / `yield_pct` are kept as
 *     their exact decimal STRINGS (the pg driver returns NUMERIC as text); no float coercion.
 *   - Idempotent per (org, work_order_id, bom_header_id): if a snapshot already exists for
 *     the pair it is returned unchanged — no second row is written.
 *
 * Red lines honoured:
 *   - Immutability: an existing snapshot is NEVER updated (the service only ever SELECTs or
 *     INSERTs; UPDATE/DELETE are additionally blocked by the migration-159 trigger +
 *     withheld privileges).
 *   - `private_jsonb` (and any private/internal columns) are never selected into the
 *     snapshot — only the public detail projection is captured.
 *   - FG is canonical; no FA-* identifiers introduced. Shared BOM SSOT is read directly.
 *   - `d365_*` are integration-only and are not part of the snapshot key.
 */

import {
  type BomDetailView,
  type OrgActionContext,
  type QueryClient,
  mapCoProduct,
  mapHeader,
  mapLine,
} from '../../../app/[locale]/(app)/(modules)/technical/bom/_actions/shared';

/** Error codes thrown by the snapshot service. */
export type BomSnapshotErrorCode = 'NO_ACTIVE_BOM' | 'BOM_NOT_FOUND';

/**
 * Domain error for the snapshot service. `code` is a closed set so callers
 * (08-PRODUCTION) can branch deterministically (e.g. NO_ACTIVE_BOM → block WO creation).
 */
export class BomSnapshotError extends Error {
  readonly code: BomSnapshotErrorCode;

  constructor(code: BomSnapshotErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BomSnapshotError';
    this.code = code;
  }
}

/** The frozen BOM payload stored in `bom_snapshots.snapshot_json`. */
export type BomSnapshotJson = BomDetailView & {
  /** Schema version of the snapshot envelope (bumped if the captured shape changes). */
  snapshotVersion: 1;
  /** BOM header version that was frozen (convenience mirror of header.version). */
  bomVersion: number;
};

/** The persisted snapshot row, returned to the caller. */
export type BomSnapshot = {
  id: string;
  orgId: string;
  workOrderId: string | null;
  bomHeaderId: string;
  snapshotJson: BomSnapshotJson;
  snapshotAt: string;
};

/**
 * Input to {@link createBomSnapshot}. Exactly one of `bomHeaderId` or `productId` must be
 * supplied:
 *   - `bomHeaderId` — freeze this explicit BOM version (08-PRODUCTION already resolved it).
 *   - `productId`   — resolve the FG's single `active` BOM version and freeze that;
 *                     throws `NO_ACTIVE_BOM` when the FG has no active BOM.
 */
export type CreateBomSnapshotInput =
  | { woId: string; bomHeaderId: string; productId?: undefined }
  | { woId: string; productId: string; bomHeaderId?: undefined };

type HeaderRowRaw = {
  id: string;
  product_id: string | null;
  npd_project_id: string | null;
  fa_code: string | null;
  origin_module: string;
  status: string;
  version: number;
  supersedes_bom_header_id: string | null;
  yield_pct: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  notes: string | null;
};

type SnapshotRowRaw = {
  id: string;
  org_id: string;
  work_order_id: string | null;
  bom_header_id: string;
  snapshot_json: BomSnapshotJson;
  snapshot_at: string | Date;
};

const HEADER_COLS = `id, product_id, npd_project_id, fa_code, origin_module, status, version,
  supersedes_bom_header_id, yield_pct, effective_from, effective_to, approved_by, approved_at, notes`;

function toIso(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapSnapshotRow(row: SnapshotRowRaw): BomSnapshot {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    workOrderId: row.work_order_id,
    bomHeaderId: String(row.bom_header_id),
    snapshotJson: row.snapshot_json,
    snapshotAt: toIso(row.snapshot_at),
  };
}

/** Resolves the FG's single `active` BOM header id, or throws NO_ACTIVE_BOM. */
async function resolveActiveBomHeaderId(client: QueryClient, productId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `select id
       from public.bom_headers
      where org_id = app.current_org_id()
        and product_id = $1
        and status = 'active'
      order by version desc
      limit 1`,
    [productId],
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new BomSnapshotError(
      'NO_ACTIVE_BOM',
      `No active BOM for product '${productId}' in this org`,
    );
  }
  return String(id);
}

/**
 * Builds the immutable `snapshot_json` for one BOM header by reading the header + lines +
 * co-products under RLS. Mirrors the T-012 detail projection 1:1 (no private columns).
 */
async function buildSnapshotJson(client: QueryClient, bomHeaderId: string): Promise<BomSnapshotJson> {
  const headerRes = await client.query<HeaderRowRaw>(
    `select ${HEADER_COLS}
       from public.bom_headers
      where org_id = app.current_org_id() and id = $1`,
    [bomHeaderId],
  );
  const headerRow = headerRes.rows[0];
  if (!headerRow) {
    // Should not happen under a resolved/active id, but guard the explicit-id path.
    throw new BomSnapshotError('BOM_NOT_FOUND', `BOM header ${bomHeaderId} not found in this org`);
  }

  const [linesRes, coProductsRes] = await Promise.all([
    client.query(
      `select id, line_no, item_id, component_code, component_type, quantity, uom, scrap_pct,
              manufacturing_operation_name, sequence, is_phantom
         from public.bom_lines
        where org_id = app.current_org_id() and bom_header_id = $1
        order by line_no asc`,
      [bomHeaderId],
    ),
    client.query(
      `select id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct
         from public.bom_co_products
        where org_id = app.current_org_id() and bom_header_id = $1
        order by created_at asc`,
      [bomHeaderId],
    ),
  ]);

  const header = mapHeader(headerRow as never);
  return {
    snapshotVersion: 1,
    bomVersion: header.version,
    header,
    lines: linesRes.rows.map((r) => mapLine(r as never)),
    co_products: coProductsRes.rows.map((r) => mapCoProduct(r as never)),
  };
}

/**
 * Freezes the active (or explicitly named) BOM for a Work Order into an immutable
 * `bom_snapshots` row. Idempotent per (org, work_order_id, bom_header_id): a re-call for
 * the same pair returns the existing row WITHOUT writing a new one (ADR-002).
 *
 * Throws {@link BomSnapshotError} with code `NO_ACTIVE_BOM` when `productId` is supplied
 * but the FG has no `active` BOM version.
 *
 * MUST be called inside an org-context transaction (08-PRODUCTION wraps the WO-creation
 * action in `withOrgContext`, so the snapshot commits atomically with the WO row).
 */
export async function createBomSnapshot(
  ctx: OrgActionContext,
  input: CreateBomSnapshotInput,
): Promise<BomSnapshot> {
  const { client } = ctx;

  const bomHeaderId =
    input.bomHeaderId ?? (await resolveActiveBomHeaderId(client, input.productId));

  // Idempotency: a snapshot already frozen for this (WO, BOM) pair is returned as-is.
  const existing = await client.query<SnapshotRowRaw>(
    `select id, org_id, work_order_id, bom_header_id, snapshot_json, snapshot_at
       from public.bom_snapshots
      where org_id = app.current_org_id()
        and work_order_id = $1
        and bom_header_id = $2
      limit 1`,
    [input.woId, bomHeaderId],
  );
  if (existing.rows[0]) {
    return mapSnapshotRow(existing.rows[0]);
  }

  const snapshotJson = await buildSnapshotJson(client, bomHeaderId);

  const inserted = await client.query<SnapshotRowRaw>(
    `insert into public.bom_snapshots (org_id, work_order_id, bom_header_id, snapshot_json)
     values (app.current_org_id(), $1, $2, $3::jsonb)
     returning id, org_id, work_order_id, bom_header_id, snapshot_json, snapshot_at`,
    [input.woId, bomHeaderId, JSON.stringify(snapshotJson)],
  );

  return mapSnapshotRow(inserted.rows[0]!);
}

/**
 * Returns the frozen BOM snapshot for a Work Order, or `null` when none exists (or it
 * belongs to another org — RLS scopes the read to `app.current_org_id()`). When more than
 * one snapshot exists for the WO, the most recent is returned.
 */
export async function getBomSnapshot(
  ctx: OrgActionContext,
  woId: string,
): Promise<BomSnapshot | null> {
  const { rows } = await ctx.client.query<SnapshotRowRaw>(
    `select id, org_id, work_order_id, bom_header_id, snapshot_json, snapshot_at
       from public.bom_snapshots
      where org_id = app.current_org_id() and work_order_id = $1
      order by snapshot_at desc
      limit 1`,
    [woId],
  );
  return rows[0] ? mapSnapshotRow(rows[0]) : null;
}
