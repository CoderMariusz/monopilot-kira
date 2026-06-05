/**
 * 08-Production E1 — START service (T-017).
 *
 * READY/planned → in_progress, with the factory-release preflight + the
 * materialization side-effects that ONLY happen at start:
 *   1. Factory-release preflight: read active_bom_header_id / active_factory_spec_id
 *      from the work_orders SNAPSHOT (migration 176). NEVER re-read the current
 *      BOM/spec (Forbidden pattern: auto-select newer BOM/spec at START).
 *   2. Freeze the BOM via the T-025 snapshot service (apps/web/lib/technical/bom/
 *      snapshot.ts) — idempotent per (org, wo, bom_header).
 *   3. Allergen changeover gate hook: when the WO snapshot demands segregation
 *      (segregation_required), START is HARD-BLOCKED until a dual-sign completes.
 *      Full dual-sign is a stub seam (09-quality/E7 wire the ATP+PIN flow); the
 *      hard-block itself is unbypassable here.
 *   4. Materialize wo_outputs rows from each schedule_outputs row for the WO
 *      (output_role → output_type 1:1; planning 'byproduct' → production
 *      'by_product'). 08-production is the CANONICAL owner of wo_outputs.
 *   5. Apply the state transition (append wo_events + CAS-materialize status).
 *   6. Emit production.wo.started in the SAME txn.
 *
 * holdsGuard seam: START itself does not consume an LP, but the 09-quality
 * consume gate is checked against each materialized output's LP (none at start)
 * — the contract is documented in holds-guard.ts and enforced on consume/output.
 */

import { createHash } from 'node:crypto';

import { createBomSnapshot } from '../technical/bom/snapshot';
import { holdsGuard } from './holds-guard';
import {
  EventType,
  type ProductionContext,
  type ProductionResult,
  fail,
  hasPermission,
  writeOutbox,
} from './shared';
import { applyTransition } from './wo-state-machine';

/** planning output_role → production output_type (canonical 1:1, §9.4). */
const OUTPUT_ROLE_TO_TYPE: Record<string, 'primary' | 'co_product' | 'by_product'> = {
  primary: 'primary',
  co_product: 'co_product',
  byproduct: 'by_product',
};

export type StartWoInput = {
  woId: string;
  transactionId: string;
  /** Operator/line/shift telemetry captured on the event + execution context. */
  lineId?: string | null;
  shiftId?: string | null;
};

export type StartWoData = {
  woId: string;
  status: 'in_progress';
  startedAt: string | null;
  bomSnapshotId: string;
  outputsMaterialized: number;
  allergenGateRequired: boolean;
};

type WoSnapshotRow = {
  id: string;
  active_bom_header_id: string | null;
  active_factory_spec_id: string | null;
  allergen_profile_snapshot: { segregation_required?: boolean } | null;
};

/**
 * Start a WO. MUST be invoked inside `withOrgContext(...)` (the caller opens the
 * txn and passes the app-role client as `ctx.client`).
 */
export async function startWo(
  ctx: ProductionContext,
  input: StartWoInput,
): Promise<ProductionResult<StartWoData>> {
  // RBAC: production.wo.start (migration-185 seed grants this to admin + operator).
  if (!(await hasPermission(ctx, 'production.wo.start'))) return fail('forbidden');

  const client = ctx.client;

  // (1) Factory-release preflight — read the WO SNAPSHOT, never the live BOM/spec.
  const woRes = await client.query<WoSnapshotRow>(
    `select id, active_bom_header_id, active_factory_spec_id, allergen_profile_snapshot
       from public.work_orders
      where org_id = app.current_org_id() and id = $1::uuid`,
    [input.woId],
  );
  const wo = woRes.rows[0];
  if (!wo) return fail('not_found');
  if (!wo.active_bom_header_id || !wo.active_factory_spec_id) {
    return fail('invalid_state_transition', {
      message: 'WO has no factory-release snapshot (active_bom_header_id / active_factory_spec_id)',
      details: { code: 'factory_release_missing' },
    });
  }

  // (3) Allergen changeover gate hook — hard-block when segregation is required.
  // Full dual-sign (ATP + PIN) is wired by E7 (T-043/T-048); the hard-block is
  // unbypassable here (no override surface).
  const segregationRequired = wo.allergen_profile_snapshot?.segregation_required === true;
  if (segregationRequired) {
    return fail('allergen_changeover_required', {
      message: 'allergen changeover segregation required — dual-sign gate must clear before START',
      details: { code: 'segregation_required' },
    });
  }

  // (2) Freeze the BOM (T-025) — idempotent per (org, wo, bom_header).
  let bomSnapshotId: string;
  try {
    const snapshot = await createBomSnapshot(ctx, {
      woId: input.woId,
      bomHeaderId: wo.active_bom_header_id,
    });
    bomSnapshotId = snapshot.id;
  } catch (err) {
    return fail('persistence_failed', {
      message: err instanceof Error ? err.message : String(err),
      details: { code: 'bom_snapshot_failed' },
    });
  }

  // (4) Materialize wo_outputs from schedule_outputs (canonical owner = 08).
  const planned = await client.query<{
    id: string;
    product_id: string;
    output_role: string;
    expected_qty: string;
    uom: string;
  }>(
    `select id, product_id, output_role, expected_qty, uom
       from public.schedule_outputs
      where org_id = app.current_org_id() and planned_wo_id = $1::uuid
      order by output_role asc`,
    [input.woId],
  );

  let outputsMaterialized = 0;
  for (const row of planned.rows) {
    const outputType = OUTPUT_ROLE_TO_TYPE[row.output_role];
    if (!outputType) continue;

    // holdsGuard seam: no LP exists yet at materialization, but the gate is the
    // documented insertion point for the consume/output path (lpId null = pass).
    const hold = await holdsGuard(ctx, { lpId: null });
    if (hold) {
      await writeOutbox(ctx, {
        eventType: EventType.PRODUCTION_CONSUME_BLOCKED,
        aggregateType: 'work_order',
        aggregateId: input.woId,
        payload: { woId: input.woId, holdId: hold.holdId },
      });
      return fail('quality_hold_active', { details: { holdId: hold.holdId } });
    }

    // Deterministic per-(WO, output_role) transaction_id so a retried START never
    // double-inserts an output row (UNIQUE(transaction_id) on wo_outputs).
    const outputTxnId = deriveOutputTxnId(input.transactionId, row.id);
    const inserted = await client.query<{ id: string }>(
      `insert into public.wo_outputs
         (org_id, transaction_id, wo_id, output_type, product_id, batch_number, qty_kg, uom,
          qa_status, registered_by, created_by)
       values (app.current_org_id(), $1::uuid, $2::uuid, $3, $4::uuid,
               $5, $6::numeric, $7, 'PENDING', $8::uuid, $8::uuid)
       on conflict (transaction_id) do nothing
       returning id`,
      [
        outputTxnId,
        input.woId,
        outputType,
        row.product_id,
        deriveBatchNumber(input.woId, row.output_role),
        row.expected_qty,
        row.uom,
        ctx.userId,
      ],
    );
    if (inserted.rows.length > 0) outputsMaterialized += 1;
  }

  // (5) Apply the lifecycle transition (append wo_events + CAS-materialize status).
  const transition = await applyTransition(ctx, {
    woId: input.woId,
    verb: 'start',
    transactionId: input.transactionId,
    context: {
      lineId: input.lineId ?? null,
      shiftId: input.shiftId ?? null,
      bomSnapshotId,
      activeBomHeaderId: wo.active_bom_header_id,
      activeFactorySpecId: wo.active_factory_spec_id,
    },
  });
  if (!transition.ok) return transition;

  // (6) Emit production.wo.started in the SAME txn.
  await writeOutbox(ctx, {
    eventType: EventType.PRODUCTION_WO_STARTED,
    aggregateType: 'work_order',
    aggregateId: input.woId,
    payload: {
      woId: input.woId,
      bomSnapshotId,
      activeBomHeaderId: wo.active_bom_header_id,
      activeFactorySpecId: wo.active_factory_spec_id,
      outputsMaterialized,
      startedAt: transition.data.startedAt,
    },
  });

  return {
    ok: true,
    data: {
      woId: input.woId,
      status: 'in_progress',
      startedAt: transition.data.startedAt,
      bomSnapshotId,
      outputsMaterialized,
      allergenGateRequired: false,
    },
  };
}

/** Stable UUID-v5-ish derivation: per-(start txn, schedule_output) output txn id. */
function deriveOutputTxnId(startTxnId: string, scheduleOutputId: string): string {
  // Deterministic: hash the two ids into a UUID so a retried START reuses the
  // same wo_outputs.transaction_id (idempotent materialization, R14).
  return uuidFromSeed(`${startTxnId}:${scheduleOutputId}`);
}

function deriveBatchNumber(woId: string, outputRole: string): string {
  return `WO-${woId.slice(0, 8)}-${outputRole.toUpperCase()}`;
}

/** Deterministic name-based UUID (RFC-4122 v5 style, SHA-1) — no external dep. */
function uuidFromSeed(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  // Force version 5 + RFC variant bits.
  const v = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${(
    (parseInt(h.slice(16, 18), 16) & 0x3f) |
    0x80
  )
    .toString(16)
    .padStart(2, '0')}${h.slice(18, 20)}-${h.slice(20, 32)}`;
  return v;
}
