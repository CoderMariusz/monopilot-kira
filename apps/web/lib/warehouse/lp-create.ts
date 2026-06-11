/**
 * Shared License-Plate creation helpers (W9-K-II — traceability chain close,
 * audit findings F-A04 / F-B08 / F-C05).
 *
 * Why this module exists: until wave 9 the ONLY license_plates writer in the
 * repo was the scanner GRN receive flow (lib/warehouse/scanner/receive-po.ts),
 * whose LP-number generator and default-warehouse resolution are PRIVATE to
 * that file. That file is owned by another wave-9 lane (do-not-touch), so the
 * two new LP producers (production output → register-output.ts, transfer-order
 * ship/receive → planning TO actions) share the SAME contracts here instead:
 *
 *   - makeLpNumber(): identical format to receive-po.ts makeLpNumber()
 *     (`LP-{epoch-ms}-{4 base36}`), so LP numbers are uniform across GRN /
 *     production / transfer origins. Uniqueness is enforced by the
 *     license_plates_org_warehouse_lp_number_uq index, not by this generator.
 *   - makeStockMoveNumber(): identical format to the scanner movement service
 *     (lib/warehouse/scanner/movement.ts — `SM-{txn-id-20}`), deterministic per
 *     transaction so a replayed move never mints a second move number.
 *   - resolveDefaultWarehouse(): the org default warehouse (is_default first,
 *     then oldest) + its first location (level asc, code asc) — the same
 *     "receiving default" receive-po.ts resolves, but expressed against
 *     app.current_org_id() because these callers run on the RLS app_user
 *     transaction (withOrgContext), not the scanner owner pool.
 *
 * Wave0 lock: org scope ONLY via app.current_org_id() (never raw
 * current_setting); every INSERT writes org_id = app.current_org_id().
 */

export type LpQueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Same format as the (private) generator in lib/warehouse/scanner/receive-po.ts. */
export function makeLpNumber(): string {
  return `LP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}`;
}

/** Same format as the (private) move-number derivation in lib/warehouse/scanner/movement.ts. */
export function makeStockMoveNumber(transactionId: string): string {
  return `SM-${transactionId.replaceAll('-', '').slice(0, 20).toUpperCase()}`;
}

export type DefaultWarehouse = {
  id: string;
  default_location_id: string | null;
};

/**
 * Org default warehouse + its first location. Mirrors receive-po.ts
 * resolveWarehouse() ordering exactly: is_default desc, created_at asc, id asc;
 * location = lowest (level, code) in that warehouse. Returns null when the org
 * has no warehouse configured (callers map this to a 409).
 */
export async function resolveDefaultWarehouse(client: LpQueryClient): Promise<DefaultWarehouse | null> {
  const { rows } = await client.query<DefaultWarehouse>(
    `select w.id,
            (select l.id
               from public.locations l
              where l.org_id = w.org_id
                and l.warehouse_id = w.id
              order by l.level asc, l.code asc
              limit 1) as default_location_id
       from public.warehouses w
      where w.org_id = app.current_org_id()
      order by w.is_default desc, w.created_at asc, w.id asc
      limit 1`,
  );
  return rows[0] ?? null;
}

/** First location (level asc, code asc) of a SPECIFIC warehouse, or null. */
export async function resolveDefaultLocation(
  client: LpQueryClient,
  warehouseId: string,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `select l.id
       from public.locations l
      where l.org_id = app.current_org_id()
        and l.warehouse_id = $1::uuid
      order by l.level asc, l.code asc
      limit 1`,
    [warehouseId],
  );
  return rows[0]?.id ?? null;
}
