'use server';

/**
 * M-5 — Desktop material consumption for production WOs.
 *
 * The WO-detail Consumption tab's "Scan LP / Add" button was a permanently
 * DISABLED DeferredButton — `wo_materials.consumed_qty` (and the matching LP
 * decrement) could only be written from the handheld scanner consume route
 * (`apps/web/app/api/production/scanner/wos/[id]/consume/route.ts`). Desktop
 * operators need the same capability, so this Server Action reuses that route's
 * stock-mutating SQL. But unlike the scanner route (which owns its transaction and
 * can ROLLBACK before a late return), withOrgContext auto-commits on a plain return
 * — so every ok:false gate (including LP availability) MUST fire BEFORE the first
 * mutation, and any failure AFTER the first write THROWS to force a rollback:
 *   - LP availability gate + reserved-qty-safe LP decrement first,
 *   - then the conditional UPDATE of `wo_materials.consumed_qty`,
 *   - then the consumption-ledger insert (exactly-once) last.
 *
 * It does NOT touch the scanner routes, and it does NOT write `scanner_audit_log`
 * (that table is scanner-session-only: session_id/device_id provenance the
 * desktop has no analogue for).
 *
 * IDEMPOTENCY (documented, landed):
 *   The scanner achieves exactly-once via the `scanner_audit_log (org_id,
 *   client_op_id)` unique index. The desktop instead reuses the production
 *   ledger's own idempotency key: `wo_material_consumption.transaction_id` is a
 *   NOT-NULL UNIQUE column (migration 181, "R14 idempotency key"). We derive a
 *   DETERMINISTIC transaction_id from `(orgId, clientOpId)` (a namespaced
 *   UUIDv3 over `${orgId}:desktop-consume:${clientOpId}`), so a retried submit
 *   of the same `clientOpId` resolves to the SAME transaction_id. Inside the
 *   txn we (1) take a `pg_advisory_xact_lock` on `${orgId}:desktop-consume:
 *   ${clientOpId}` to serialize concurrent in-flight replays, then (2) probe the
 *   ledger for that transaction_id — a hit returns `{ replay: true }` WITHOUT
 *   re-decrementing stock; a miss performs the UPDATE(s) and inserts the ledger
 *   row LAST, so the row's UNIQUE constraint is the final exactly-once gate. The
 *   whole body runs inside `withOrgContext`'s single transaction, so any failure
 *   (including a unique-violation race) rolls back atomically.
 *
 * Permission gate: `production.consumption.write` via the canonical
 * `hasPermission` — the SAME gate the scanner route re-checks (review HIGH:
 * a stock-mutating endpoint must not be reachable without it).
 */
import { createHash } from 'node:crypto';

import { toMicro } from '../../../../../../lib/shared/decimal';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';
import { debitWac } from '../../../../../../lib/finance/upsert-wac';
import {
  isNilOrZeroLpId,
  normalizePersistedQuantity,
  resolveConsumptionLp,
} from '../../../../../../lib/production/consume-material-core';
import { assertWoNotOnHold } from '../../../../../../lib/production/holds-guard';
import { makeStockMoveNumber } from '../../../../../../lib/warehouse/lp-create';
import {
  APP_VERSION,
  emitConsumeBlocked,
  hasPermission,
  OUTPUT_RECORDABLE_STATES,
  QualityHoldError,
  readWoExecutionStatus,
  type ProductionContext,
  type QueryClient,
} from '../../../../../../lib/production/shared';

const CONSUMPTION_WRITE_PERMISSION = 'production.consumption.write';

export type RecordDesktopConsumptionInput = {
  woId: string;
  materialId: string;
  /** Decimal string in the material's UoM (never a JS number — precision). */
  qty: string;
  /** Optional license plate to decrement; omitted → consume without an LP. */
  lpId?: string | null;
  /** Required when consuming without an LP (manual/silo path audit reason). */
  reasonCode?: string | null;
  /** Client-generated idempotency token (deterministic replay key). */
  clientOpId: string;
};

export type OverconsumeWarning = {
  overconsumed: true;
  overPct: number;
  warnPct: number;
};

export type RecordDesktopConsumptionData = {
  materialId: string;
  consumedQty: string;
  uom: string;
  lpId: string | null;
  replay: boolean;
  /**
   * Two-tier over-consumption gate: present when the consumption landed ABOVE
   * the warn tier (`overconsume_warn_pct`) but at/below the approval tier
   * (`overconsume_threshold_pct`) — the write succeeded, the caller should
   * surface a non-blocking warning. Absent/undefined otherwise.
   */
  warning?: OverconsumeWarning;
};

export type ConsumableLp = {
  lpId: string;
  lpNumber: string;
  qty: string;
  uom: string;
  expiry: string | null;
};

export type ConsumeActionError =
  | 'forbidden'
  | 'invalid_material'
  | 'invalid_qty'
  | 'lp_unavailable'
  | 'lp_not_released'
  | 'lp_expired'
  | 'lp_locked'
  // Canonical T-064 holdsGuard rejection (lib/production/holds-guard.ts:5-9).
  | 'quality_hold_active'
  | 'reason_required'
  | 'overconsume_blocked'
  | 'wo_not_consumable'
  | 'invalid_input'
  | 'error';

export type ConsumeActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: ConsumeActionError; message?: string };

type MaterialGateRow = {
  id: string;
  product_id: string;
  substitute_item_id: string | null;
  material_name: string;
  required_qty: string;
  consumed_qty: string;
  uom: string;
  threshold_pct: string;
  warn_pct: string;
  over_limit: boolean;
  over_warn: boolean;
  over_pct: string | null;
};

function numericJson(value: string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Mirrors the scanner route's qty guard: positive decimal string, not zero. */
function isPositiveDecimalString(value: string): boolean {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  if (/^0+(\.0+)?$/.test(value)) return false;
  return true;
}

/**
 * Deterministic, namespaced UUIDv3 (RFC-4122-shaped) from a stable string. Used
 * as the `wo_material_consumption.transaction_id` so the same clientOpId always
 * maps to the same ledger key (the idempotency anchor). Not cryptographic — its
 * only job is collision-free determinism within an org's clientOpId space.
 */
function deterministicTransactionId(seed: string): string {
  const hex = createHash('md5').update(seed).digest('hex');
  // Set version (3) and RFC-4122 variant bits.
  const v = hex.slice(0, 12) + '3' + hex.slice(13, 16) + ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 32);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

function lpStateTransactionId(orgId: string, clientOpId: string): string {
  return deterministicTransactionId(`${orgId}:desktop-consume:lp-state:${clientOpId}`);
}

async function writeConsumeLedger(
  client: QueryClient,
  input: {
    orgId: string;
    userId: string;
    woId: string;
    materialId: string;
    lpId: string;
    qty: string;
    uom: string;
    siteId: string | null;
    locationId: string | null;
    fromState: string;
    toState: string;
    stockMoveTransactionId: string;
    lpStateTransactionId: string;
    consumptionId: string;
  },
): Promise<void> {
  await client.query(
    `insert into public.stock_moves (
       org_id, site_id, move_number, lp_id, move_type, from_location_id,
       quantity, uom, reason_code, reason_text, transaction_id, wo_id, wo_material_id,
       status, ext_jsonb, created_by, updated_by
     )
     values (
       app.current_org_id(), $1::uuid, $2, $3::uuid, 'consume_to_wo', $4::uuid,
       $5::numeric, $6, 'production_consume', 'Desktop WO material consumption',
       $7::uuid, $8::uuid, $9::uuid, 'completed', $10::jsonb, $11::uuid, $11::uuid
     )
     on conflict (org_id, transaction_id) do nothing`,
    [
      input.siteId,
      makeStockMoveNumber(input.stockMoveTransactionId),
      input.lpId,
      input.locationId,
      input.qty,
      input.uom,
      input.stockMoveTransactionId,
      input.woId,
      input.materialId,
      JSON.stringify({ source: 'desktop', wo_id: input.woId, consumption_id: input.consumptionId }),
      input.userId,
    ],
  );

  if (input.toState !== input.fromState) {
    await client.query(
      `insert into public.lp_state_history (
         org_id, site_id, lp_id, from_state, to_state, reason_code, reason_text,
         wo_id, transaction_id, ext_jsonb, created_by
       )
       values (
         app.current_org_id(), $1::uuid, $2::uuid, $3, $4, 'production_consume',
         'Desktop WO material consumption', $5::uuid, $6::uuid, $7::jsonb, $8::uuid
       )
       on conflict (org_id, transaction_id) do nothing`,
      [
        input.siteId,
        input.lpId,
        input.fromState,
        input.toState,
        input.woId,
        input.lpStateTransactionId,
        JSON.stringify({ source: 'desktop', wo_id: input.woId, qty: input.qty, uom: input.uom }),
        input.userId,
      ],
    );
  }
}

/**
 * FEFO-ordered consumable LP candidates for a WO material's product. Reads the
 * migration-191 `v_inventory_available` view (security_invoker; available =
 * quantity − reserved_qty, status='available', qa_status='released'), filtered
 * to the material's product_id + uom — MIRRORING the scanner lps route's query.
 */
export async function listConsumableLps(
  input: { woId: string; materialId: string },
): Promise<ConsumeActionResult<{ lps: ConsumableLp[] }>> {
  const woId = asTrimmed(input?.woId);
  const materialId = asTrimmed(input?.materialId);
  if (!woId || !isUuid(woId) || !materialId || !isUuid(materialId)) {
    return { ok: false, reason: 'invalid_input' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ConsumeActionResult<{ lps: ConsumableLp[] }>> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, CONSUMPTION_WRITE_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const materialRes = await ctx.client.query<{ product_id: string; substitute_item_id: string | null; uom: string }>(
        `select wm.product_id::text as product_id,
                bl.substitute_item_id::text as substitute_item_id,
                wm.uom
           from public.wo_materials wm
           left join public.bom_lines bl
             on bl.org_id = wm.org_id
            and bl.id = wm.bom_item_id
          where wm.org_id = app.current_org_id()
            and wm.wo_id = $1::uuid
            and wm.id = $2::uuid
          limit 1`,
        [woId, materialId],
      );
      const material = materialRes.rows[0];
      if (!material) return { ok: false, reason: 'invalid_material' };

      const lpRes = await ctx.client.query<{
        lp_id: string;
        lp_number: string;
        available_qty: string;
        uom: string;
        expiry_date: string | null;
      }>(
        `select lp_id::text as lp_id,
                lp_number,
                available_qty::text as available_qty,
                uom,
                to_char(expiry_date, 'YYYY-MM-DD') as expiry_date
           from public.v_inventory_available
          where org_id = app.current_org_id()
            and product_id = any($1::uuid[])
            and uom = $2
          order by expiry_date asc nulls last, lp_number asc
          limit 25`,
        [[material.product_id, material.substitute_item_id].filter(Boolean), material.uom],
      );

      return {
        ok: true,
        data: {
          lps: lpRes.rows.map((r) => ({
            lpId: r.lp_id,
            lpNumber: r.lp_number,
            qty: r.available_qty,
            uom: r.uom,
            expiry: r.expiry_date,
          })),
        },
      };
    });
  } catch (error) {
    console.error('[production] listConsumableLps failed', error);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Record a desktop material consumption against a WO. See module header for the
 * idempotency contract. Returns verbatim closed errors the modal maps to copy.
 */
export async function recordDesktopConsumption(
  input: RecordDesktopConsumptionInput,
): Promise<ConsumeActionResult<RecordDesktopConsumptionData>> {
  const woId = asTrimmed(input?.woId);
  const materialId = asTrimmed(input?.materialId);
  const rawQty = asTrimmed(input?.qty);
  const lpId = asTrimmed(input?.lpId);
  const reasonCode = asTrimmed(input?.reasonCode);
  const clientOpId = asTrimmed(input?.clientOpId);

  if (!woId || !isUuid(woId) || !materialId || !isUuid(materialId) || !clientOpId) {
    return { ok: false, reason: 'invalid_input' };
  }
  if (!rawQty || !isPositiveDecimalString(rawQty)) {
    return { ok: false, reason: 'invalid_qty' };
  }
  let qty: string;
  try {
    qty = normalizePersistedQuantity(rawQty);
  } catch {
    return { ok: false, reason: 'invalid_qty' };
  }
  if (lpId && (!isUuid(lpId) || isNilOrZeroLpId(lpId))) {
    return { ok: false, reason: 'invalid_input' };
  }
  if (!lpId && !reasonCode) {
    return { ok: false, reason: 'reason_required' };
  }

  try {
    const result = await withOrgContext(async ({ userId, orgId, client }): Promise<ConsumeActionResult<RecordDesktopConsumptionData>> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, CONSUMPTION_WRITE_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const txnId = deterministicTransactionId(`${orgId}:desktop-consume:${clientOpId}`);

      const woHoldGate = await assertWoNotOnHold(woId, ctx);
      if (!woHoldGate.ok) {
        await emitConsumeBlocked(
          ctx,
          new QualityHoldError({
            hold: woHoldGate.hold,
            woId,
            blockedPath: 'consume',
            transactionId: txnId,
            lpId: null,
            lotId: null,
          }),
        );
        return { ok: false, reason: 'quality_hold_active' };
      }

      // (1) Serialize concurrent in-flight replays of the same clientOpId.
      await ctx.client.query(`select pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [
        `${orgId}:desktop-consume:${clientOpId}`,
      ]);

      // (2) Idempotent replay probe — a prior commit for this txnId is a no-op.
      const replay = await ctx.client.query<{
        material_id: string;
        consumed_qty: string;
        uom: string;
        lp_id: string | null;
      }>(
        `select c.component_id::text as material_id,
                wm.consumed_qty::text as consumed_qty,
                wm.uom as uom,
                c.lp_id::text as lp_id
           from public.wo_material_consumption c
           join public.wo_materials wm
             on wm.org_id = c.org_id
            and wm.wo_id = c.wo_id
            and (
              ((c.ext_jsonb->>'materialId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                and wm.id = (c.ext_jsonb->>'materialId')::uuid)
              or ((c.ext_jsonb->>'materialId') is null and wm.product_id = c.component_id)
            )
          where c.org_id = app.current_org_id()
            and c.transaction_id = $1::uuid
          limit 1`,
        [txnId],
      );
      if (replay.rows[0]) {
        const r = replay.rows[0];
        return {
          ok: true,
          data: { materialId, consumedQty: r.consumed_qty, uom: r.uom, lpId: r.lp_id, replay: true },
        };
      }

      const executionStatus = await readWoExecutionStatus(ctx, woId);
      if (executionStatus === null || !OUTPUT_RECORDABLE_STATES.has(executionStatus)) {
        return {
          ok: false,
          reason: 'wo_not_consumable',
          message: `WO is ${executionStatus ?? 'not started'}.`,
        };
      }

      // (3) Two-tier over-consumption gate under the same transaction before
      // mutation — BOTH flags read in the same locked statement (mirrors the
      // scanner route): warn tier (overconsume_warn_pct, absent = 0) proceeds
      // with a warning; approve tier (overconsume_threshold_pct) blocks.
      const materialGateRes = await ctx.client.query<MaterialGateRow>(
        `with cfg as (
           select coalesce(
                    case
                      when (tv.feature_flags->>'overconsume_threshold_pct') ~ '^[0-9]+(\\.[0-9]+)?$'
                        then (tv.feature_flags->>'overconsume_threshold_pct')::numeric
                      else 0
                    end,
                    0
                  ) as threshold_pct,
                  coalesce(
                    case
                      when (tv.feature_flags->>'overconsume_warn_pct') ~ '^[0-9]+(\\.[0-9]+)?$'
                        then (tv.feature_flags->>'overconsume_warn_pct')::numeric
                      else 0
                    end,
                    0
                  ) as warn_pct
             from public.tenant_variations tv
            where tv.org_id = app.current_org_id()
         )
         select wm.id::text as id,
                wm.product_id::text as product_id,
                bl.substitute_item_id::text as substitute_item_id,
                wm.material_name,
                wm.required_qty::text as required_qty,
                wm.consumed_qty::text as consumed_qty,
                wm.uom,
                coalesce((select threshold_pct from cfg), 0)::text as threshold_pct,
                coalesce((select warn_pct from cfg), 0)::text as warn_pct,
                (wm.consumed_qty + $3::numeric)
                  > (wm.required_qty * (1 + coalesce((select threshold_pct from cfg), 0) / 100)) as over_limit,
                (wm.consumed_qty + $3::numeric)
                  > (wm.required_qty * (1 + coalesce((select warn_pct from cfg), 0) / 100)) as over_warn,
                case
                  when wm.required_qty > 0 then
                    (((wm.consumed_qty + $3::numeric) / wm.required_qty - 1) * 100)::text
                  else null
                end as over_pct
           from public.wo_materials wm
           left join public.bom_lines bl
             on bl.org_id = wm.org_id
            and bl.id = wm.bom_item_id
          where wm.org_id = app.current_org_id()
            and wm.wo_id = $1::uuid
            and wm.id = $2::uuid
            and $3::numeric > 0
          limit 1
          for update of wm`,
        [woId, materialId, qty],
      );
      const gate = materialGateRes.rows[0];
      if (!gate) {
        return { ok: false, reason: 'invalid_material' };
      }
      if (gate.over_limit) {
        return {
          ok: false,
          reason: 'overconsume_blocked',
          message: `Over-consumption blocked: required ${gate.required_qty} ${gate.uom}, consumed ${gate.consumed_qty} ${gate.uom}, attempted ${qty} ${gate.uom}, threshold ${gate.threshold_pct}%.`,
        };
      }
      // Between the tiers: proceed, but flag the ledger row + the response.
      const warnBand = gate.over_warn && !gate.over_limit;
      const warning: OverconsumeWarning | undefined = warnBand
        ? {
            overconsumed: true,
            overPct: numericJson(gate.over_pct),
            warnPct: numericJson(gate.warn_pct),
          }
        : undefined;

      const lpResolution = await resolveConsumptionLp(ctx, {
        explicitLpId: lpId,
        productIds: [gate.product_id, gate.substitute_item_id].filter((id): id is string => Boolean(id)),
        uom: gate.uom,
        qty,
      });
      if (!lpResolution.ok) {
        if (lpResolution.error === 'quality_hold_active') {
          await emitConsumeBlocked(
            ctx,
            new QualityHoldError({
              hold: lpResolution.hold!,
              woId,
              blockedPath: 'consume',
              transactionId: txnId,
              lpId: lpId ?? null,
              lotId: null,
            }),
          );
        }
        return {
          ok: false,
          reason: lpResolution.error === 'invalid_input' ? 'invalid_input' : lpResolution.error,
        };
      }

      const resolvedLpId = lpResolution.lpId;
      let consumedItemId = lpResolution.productId;
      const lpRes = await ctx.client.query<{ id: string; quantity: string }>(
        `update public.license_plates
            set quantity = quantity - $3::numeric,
                status = case when quantity - $3::numeric = 0 then 'consumed' else status end,
                consumed_by_wo_id = $4::uuid,
                updated_by = $5::uuid,
                updated_at = now()
          where org_id = $1::uuid
            and id = $2::uuid
            and product_id = any($6::uuid[])
            and uom = $7
            and quantity - $3::numeric >= reserved_qty
          returning id::text, quantity::text as quantity`,
        [orgId, resolvedLpId, qty, woId, userId, [gate.product_id, gate.substitute_item_id].filter(Boolean), gate.uom],
      );
      if (!lpRes.rows[0]) {
        return { ok: false, reason: 'lp_unavailable' };
      }

      const lpToState = toMicro(lpRes.rows[0].quantity) <= 0n ? 'consumed' : lpResolution.status;
      const lpLedgerInput: Omit<Parameters<typeof writeConsumeLedger>[1], 'consumptionId'> = {
        orgId,
        userId,
        woId,
        materialId: gate.id,
        lpId: resolvedLpId,
        qty,
        uom: gate.uom,
        siteId: lpResolution.siteId,
        locationId: lpResolution.locationId,
        fromState: lpResolution.status,
        toState: lpToState,
        stockMoveTransactionId: txnId,
        lpStateTransactionId: lpStateTransactionId(orgId, clientOpId),
      };

      // (4) Conditional UPDATE of consumed_qty — MIRRORS the scanner route.
      const materialRes = await ctx.client.query<{
        id: string;
        product_id: string;
        material_name: string;
        consumed_qty: string;
        uom: string;
      }>(
        `update public.wo_materials
            set consumed_qty = consumed_qty + $4::numeric
          where org_id = $1::uuid
            and wo_id = $2::uuid
            and id = $3::uuid
            and $4::numeric > 0
          returning id::text, product_id::text as product_id, material_name,
                    consumed_qty::text as consumed_qty, uom`,
        [orgId, woId, materialId, qty],
      );
      const material = materialRes.rows[0];
      if (!material) {
        throw new Error('recordDesktopConsumption: material update failed after material gate');
      }

      let fefoAdherence = lpResolution.fefoAutoResolved;
      if (!lpResolution.fefoAutoResolved) {
        const fefo = await ctx.client.query<{ violates: boolean }>(
          `select exists (
                    select 1
                      from public.v_inventory_available cand
                      join public.license_plates chosen
                        on chosen.id = $2::uuid
                       and chosen.org_id = app.current_org_id()
                     where cand.org_id = app.current_org_id()
                       and cand.product_id = $1::uuid
                       and cand.uom = $3
                       and cand.lp_id <> $2::uuid
                       and cand.expiry_date is not null
                       and (chosen.expiry_date is null
                            or cand.expiry_date < chosen.expiry_date)
                  ) as violates`,
          [consumedItemId, resolvedLpId, material.uom],
        );
        fefoAdherence = !(fefo.rows[0]?.violates ?? false);
      }

      // (5) Ledger row LAST — its UNIQUE(transaction_id) is the final
      // exactly-once gate (a racing replay that slipped past the probe trips
      // the constraint and rolls the whole txn back).
      const consumption = await ctx.client.query<{ id: string }>(
        `insert into public.wo_material_consumption
           (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom,
            operator_id, fefo_adherence_flag, ext_jsonb)
         values
           (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid,
            $4::uuid,
            $5::numeric, $6, $7::uuid, $8, $9::jsonb)
         returning id::text as id`,
        [
          txnId,
          woId,
          consumedItemId,
          resolvedLpId,
          qty,
          material.uom,
          userId,
          fefoAdherence,
          JSON.stringify({
            source: 'desktop',
            clientOpId,
            ...(reasonCode ? { reasonCode } : {}),
            materialId: material.id,
            materialName: material.material_name,
            ...(warning ? { warned: true, overPct: warning.overPct } : {}),
          }),
        ],
      );
      const consumptionId = consumption.rows[0]?.id;
      if (!consumptionId) {
        throw new Error('recordDesktopConsumption: consumption insert returned no id');
      }

      const wacDebit = await debitWac(ctx.client, {
        orgId,
        siteId: null,
        itemId: consumedItemId,
        qty,
        uom: material.uom,
        updatedBy: userId,
        sourceRef: {
          aggregateType: 'wo_material_consumption',
          aggregateId: consumptionId,
          dedupKey: `production-consume:${consumptionId}`,
        },
      });
      if (wacDebit.applied) {
        await ctx.client.query(
          `update public.wo_material_consumption
              set ext_jsonb = coalesce(ext_jsonb, '{}'::jsonb) || $2::jsonb
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [
            consumptionId,
            JSON.stringify({
              wac_qty_kg: wacDebit.qtyKg,
              wac_value: wacDebit.valueDebited,
              wac_avg_cost: wacDebit.avgCostUsed,
            }),
          ],
        );
      } else if (wacDebit.excluded === 'unresolved_uom') {
        await ctx.client.query(
          `update public.wo_material_consumption
              set ext_jsonb = coalesce(ext_jsonb, '{}'::jsonb) || $2::jsonb
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [
            consumptionId,
            JSON.stringify({
              wac_excluded: 'unresolved_uom',
              wac_uom: material.uom,
              wac_qty: qty,
            }),
          ],
        );
      }

      await writeConsumeLedger(ctx.client, {
        ...lpLedgerInput,
        consumptionId,
      });
      await emitMaterialConsumed(ctx.client, {
        aggregateId: consumptionId,
        woId,
        lpId: resolvedLpId,
        itemId: consumedItemId,
        qty,
        uom: material.uom,
        orgId,
        actor: userId,
      });

      return {
        ok: true,
        data: {
          materialId: material.id,
          consumedQty: material.consumed_qty,
          uom: material.uom,
          lpId: resolvedLpId,
          replay: false,
          ...(warning ? { warning } : {}),
        },
      };
    });

    if (result.ok && !result.data.replay) {
      revalidateLocalized('/production', 'page');
      revalidateLocalized(`/production/wos/${woId}`, 'page');
    }
    return result;
  } catch (error) {
    console.error('[production] recordDesktopConsumption failed', error);
    return { ok: false, reason: 'error' };
  }
}

async function emitMaterialConsumed(
  client: QueryClient,
  input: {
    aggregateId: string;
    woId: string;
    lpId: string;
    itemId: string;
    qty: string;
    uom: string;
    orgId: string;
    actor: string;
  },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1::text, $2::text, $3::uuid, $4::jsonb, $5::text)`,
    [
      'warehouse.material.consumed',
      'wo_material_consumption',
      input.aggregateId,
      JSON.stringify({
        wo_id: input.woId,
        lp_id: input.lpId,
        item_id: input.itemId,
        qty: input.qty,
        uom: input.uom,
        org_id: input.orgId,
        actor: input.actor,
      }),
      APP_VERSION,
    ],
  );
}
