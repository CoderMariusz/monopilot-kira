'use server';

/**
 * Wave-shipping — thin read/seam helpers for the Shipments screens.
 *
 * The reviewed write/read actions (createShipment / packLpIntoBox / getShipment /
 * listShipments) live in ../../_actions/pack-actions.ts and are imported verbatim —
 * never rewritten (owned by the parallel pack-actions lane). This module:
 *
 *   1. re-exports the action row/detail types so the client views depend on a
 *      _components-local barrel, not a deep relative path into pack-actions;
 *   2. adds ONE small org-scoped RBAC capability probe (getCreateShipmentCapability)
 *      so the SO-detail [Create shipment] button renders disabled + tooltip rather
 *      than failing on click when the user lacks ship.pack.close. The reviewed
 *      createShipment remains the source of truth and re-checks server-side; this is
 *      advisory UI gating only and is NEVER client-trusted.
 *
 * Runs inside withOrgContext (RLS: org_id = app.current_org_id()); no service-role
 * bypass, no mocks. Falls back deny-safe (all-false) on read failure.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

import type {
  ShipmentRow as ActionShipmentRow,
  ShipmentDetail as ActionShipmentDetail,
  ShipmentBoxDetail as ActionShipmentBoxDetail,
} from '../../_actions/pack-actions';

export type { ShipmentStatus } from '../../_actions/so-transitions';
export type { ShipmentBoxContentDetail } from '../../_actions/pack-actions';

/**
 * View box for the pack screen. The reviewed getShipment box (ActionShipmentBoxDetail)
 * carries boxNumber + sscc + contents but NOT the raw box id (deliberately — no raw
 * UUID leaves the server). We add an OPTIONAL `boxId` the page MAY set if a future
 * getShipment surfaces it, so the Pack-LP "choose existing box" path can target a box
 * by id. Currently undefined → the reviewed packLpIntoBox opens/extends a box itself.
 */
export type ShipmentBoxDetail = ActionShipmentBoxDetail & { boxId?: string };

/**
 * View row for the Shipments list. The reviewed listShipments row (ActionShipmentRow)
 * carries boxCount but NO total weight (no weight column is summed in the list query,
 * and weight is NOT touched here — pack-actions is owned by the parallel lane). We add
 * an OPTIONAL `weight` the page maps from the action result (currently always null —
 * documented parity deviation: the prototype's per-shipment weight has no backing feed
 * in listShipments). The view renders boxCount as the primary metric and a "—"
 * placeholder for weight until the action surfaces it.
 */
export type ShipmentRow = ActionShipmentRow & { weight: string | null };

/** View detail mirrors the action detail but with the weight-augmented row and the
 *  boxId-augmented boxes. */
export type ShipmentDetail = Omit<ActionShipmentDetail, 'shipment' | 'boxes'> & {
  shipment: ShipmentRow;
  boxes: ShipmentBoxDetail[];
};

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** ship.pack.close — gates the SO-detail [Create shipment] button (the reviewed
 *  createShipment requires this permission; see pack-actions.ts SHIP_PACK_CLOSE). */
const SHIP_PACK_CLOSE = 'ship.pack.close';

/** ship.so.cancel — gates the shipment-detail [Cancel shipment] button (the reviewed
 *  cancelShipment requires this permission; see cancelShipment.ts SHIP_SO_CANCEL). */
const SHIP_SO_CANCEL = 'ship.so.cancel';

export type CreateShipmentCapability = {
  /** Whether the caller holds ship.pack.close (create + pack permission). */
  canCreate: boolean;
};

export type CancelShipmentCapability = {
  /** Whether the caller holds ship.so.cancel (shipment cancel permission). */
  canCancel: boolean;
};

/**
 * Server-side RBAC probe for the [Create shipment] button. Mirrors the hasPermission()
 * shape inside pack-actions.ts: explicit userId/orgId params, a role that grants via
 * role_permissions rows OR the legacy roles.permissions jsonb array. Deny-safe on
 * failure. NEVER client-trusted — createShipment re-checks server-side.
 */
export async function getCreateShipmentCapability(): Promise<CreateShipmentCapability> {
  try {
    return await withOrgContext<CreateShipmentCapability>(async (ctx) => {
      const { rows } = await (ctx.client as unknown as QueryClient).query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, SHIP_PACK_CLOSE],
      );
      return { canCreate: rows.length > 0 };
    });
  } catch {
    return { canCreate: false };
  }
}

/**
 * Server-side RBAC probe for the shipment-detail [Cancel shipment] button. Mirrors
 * getCreateShipmentCapability / the hasPermission() shape inside cancelShipment.ts
 * (ship.so.cancel). Deny-safe on failure. NEVER client-trusted — the reviewed
 * cancelShipment re-checks server-side and blocks delivered/cancelled regardless.
 */
export async function getCancelShipmentCapability(): Promise<CancelShipmentCapability> {
  try {
    return await withOrgContext<CancelShipmentCapability>(async (ctx) => {
      const { rows } = await (ctx.client as unknown as QueryClient).query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, SHIP_SO_CANCEL],
      );
      return { canCancel: rows.length > 0 };
    });
  } catch {
    return { canCancel: false };
  }
}
