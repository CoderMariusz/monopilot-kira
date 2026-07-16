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
 *   3. Allergen changeover gate (two prongs, both unbypassable, both emitting
 *      the canonical 'changeover_signoff_required' code — C4/F6):
 *      (3a) an OPEN medium+ changeover_events row on the WO's line (line key
 *           resolved uuid↔code via production_lines — C4/F1) blocks START until
 *           the dual-sign completes;
 *      (3b) the WO snapshot's segregation_required flag blocks START even when
 *           no changeover_events row was ever logged (no event ≠ no risk).
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
import {
  EventType,
  type ProductionContext,
  type ProductionResult,
  fail,
  hasPermission,
  writeOutbox,
} from './shared';
import {
  assertUpstreamWipReady,
  upstreamWipNotReadyMessage,
} from '../planning/upstream-wip-dependency-gate';
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
  site_id: string | null;
  item_type_at_creation: string;
  active_bom_header_id: string | null;
  active_factory_spec_id: string | null;
  allergen_profile_snapshot: { segregation_required?: boolean } | null;
  production_line_id: string | null;
};

/** Upstream WIP stages mirror Planning release — BOM snapshot only, no factory spec. */
function isIntermediateWipStage(itemTypeAtCreation: string): boolean {
  return itemTypeAtCreation === 'intermediate';
}

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
      `select id, site_id::text as site_id, item_type_at_creation,
              active_bom_header_id, active_factory_spec_id, allergen_profile_snapshot,
              production_line_id::text
       from public.work_orders
      where org_id = app.current_org_id() and id = $1::uuid`,
    [input.woId],
  );
  const wo = woRes.rows[0];
  if (!wo) return fail('not_found');
  const activeBomHeaderId = wo.active_bom_header_id;
  const activeFactorySpecId = wo.active_factory_spec_id;
  const wipStage = isIntermediateWipStage(wo.item_type_at_creation);
  const missingBom = !activeBomHeaderId;
  const missingFactorySpec = !wipStage && !activeFactorySpecId;
  if (missingBom || missingFactorySpec) {
    return fail('wo_snapshot_missing', {
      message: wipStage
        ? 'WO has no BOM release snapshot; release the work order again in Planning to bind its approved BOM before start.'
        : 'WO has no factory-release snapshot; release the work order again in Planning to bind its approved BOM and factory spec before start.',
      details: {
        code: 'wo_snapshot_missing',
        missing: {
          activeBomHeader: missingBom,
          activeFactorySpec: missingFactorySpec,
        },
        remediation: 'release_work_order',
        itemTypeAtCreation: wo.item_type_at_creation,
      },
    });
  }

  const snapshotBinding = await validateReleasedSnapshotBindings(client, {
    site_id: wo.site_id,
    active_bom_header_id: activeBomHeaderId,
    active_factory_spec_id: activeFactorySpecId,
    requires_factory_spec: !wipStage,
  });
  if (!snapshotBinding.ok) return snapshotBinding;

  const upstreamGate = await assertUpstreamWipReady(client, input.woId, 'start');
  if (upstreamGate) {
    return fail('upstream_wip_not_ready', {
      message: upstreamWipNotReadyMessage(upstreamGate),
      details: upstreamGate,
    });
  }

  // (3) Allergen changeover gate — hard-block when this WO's line has an
  // incomplete allergen-relevant changeover. changeover_events has no boolean
  // allergen flag; risk_level is the migrated classifier, so medium+ is gated.
  //
  // Line identity (C4/F1): changeover_events.line_id is TEXT and legacy rows may
  // hold a production_lines CODE while starts pass the line UUID. The write side
  // (createChangeoverEvent) now always persists production_lines.id::text, and
  // this read side ALSO resolves the start's line key through production_lines
  // so a code-keyed legacy changeover still gates a uuid-keyed start (and vice
  // versa). The raw-equality branch is kept for free-text legacy rows that never
  // resolved to a production_lines row.
  //
  // Staleness (C4/F4 — DECIDED): the block is intentionally UNBOUNDED in time.
  // BRCGS safety-first: an unsigned medium+ changeover blocks the line forever;
  // the escape hatch is signing it in the changeovers UI, never a timeout.
  // The gate predicate (dual_sign_off_status not in ('complete','completed'))
  // implies dual_sign_off_status <> 'complete', so the partial index
  // idx_changeover_open_signoff (migration 280) supports this lookup.
  const blockedChangeoverId = await findOpenLineChangeover(
    client,
    input.lineId ?? null,
    wo.production_line_id,
  );
  if (blockedChangeoverId) {
    // C4/F6: 'changeover_signoff_required' is the canonical code on BOTH the
    // desktop (route-helpers passthrough) and scanner paths. The legacy outer
    // code 'allergen_changeover_required' (100eb4be, 2026-06-05) stays in the
    // ProductionError union + UI label maps but is no longer emitted.
    return fail('changeover_signoff_required', {
      message: 'allergen changeover segregation required — dual-sign gate must clear before START',
      details: {
        code: 'changeover_signoff_required',
        legacyCode: 'allergen_changeover_required',
        changeoverId: blockedChangeoverId,
      },
    });
  }

  // (3b) Snapshot segregation hard-block — the ORIGINAL (pre-C4) gate, kept
  // alongside the changeover_events gate above: when the WO's
  // allergen_profile_snapshot demands segregation, START stays HARD-BLOCKED even
  // if nobody has logged a changeover_events row yet (no event ≠ no risk).
  // Unbypassable here (no override surface); the escape hatch is recording +
  // dual-signing the changeover. Emits the same canonical C4/F6 code —
  // details.code distinguishes the trigger for the UI.
  if (wo.allergen_profile_snapshot?.segregation_required === true) {
    return fail('changeover_signoff_required', {
      message: 'allergen changeover segregation required — dual-sign gate must clear before START',
      details: {
        code: 'segregation_required',
        legacyCode: 'allergen_changeover_required',
      },
    });
  }

  // (2) Freeze the BOM (T-025) — idempotent per (org, wo, bom_header).
  let bomSnapshotId: string;
  try {
    const snapshot = await createBomSnapshot(ctx, {
      woId: input.woId,
      bomHeaderId: activeBomHeaderId,
    });
    bomSnapshotId = snapshot.id;
  } catch (err) {
    return fail('persistence_failed', {
      message: err instanceof Error ? err.message : String(err),
      details: { code: 'bom_snapshot_failed' },
    });
  }

  // (5) Apply the lifecycle transition FIRST (validates state + CAS-materialize status +
  // append wo_events). A second START against an already-started WO fails HERE and returns
  // BEFORE any wo_outputs are written, so no orphan/duplicate output rows can commit on a
  // rejected transition (Codex Gate-4 round-2). A CAS miss throws → full txn rollback.
  const transition = await applyTransition(ctx, {
    woId: input.woId,
    verb: 'start',
    transactionId: input.transactionId,
    context: {
      lineId: input.lineId ?? null,
      shiftId: input.shiftId ?? null,
      bomSnapshotId,
      activeBomHeaderId,
      activeFactorySpecId,
    },
  });
  if (!transition.ok) return transition;

  // (4) Materialize wo_outputs from schedule_outputs (canonical owner = 08) — only AFTER a
  // confirmed START transition. Any failure below throws and rolls back the whole txn
  // (including the START event), so outputs and state never diverge.
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

    // Deterministic per-(WO, schedule_output) transaction_id — stable across START retries
    // (NOT derived from the variable start transactionId) so a re-issued START with a fresh
    // transactionId can never double-insert an output row (UNIQUE(transaction_id) on wo_outputs).
    const outputTxnId = deriveOutputTxnId(input.woId, row.id);
    const inserted = await client.query<{ id: string }>(
      // Stamp placeholder outputs with the WO's site_id (same contract as register-output /
      // record-waste). When the WO has no site, site_id stays NULL.
      // qty_kg = 0: the materialized row is a PLACEHOLDER for the planned
      // output role — actual produced kg arrive via register-output rows.
      // Materializing with expected_qty made recorded output == planned the
      // moment the WO started (live E2E: 100/100 kg at start, 150% after the
      // first real registration), so progress/yield were meaningless.
      `insert into public.wo_outputs
         (org_id, site_id, transaction_id, wo_id, output_type, product_id, batch_number, qty_kg, uom,
          qa_status, registered_by, created_by)
       values (app.current_org_id(), $8::uuid, $1::uuid, $2::uuid, $3, $4::uuid,
               $5, 0, $6,
               case
                 when exists (
                   select 1
                     from public.v_active_holds h
                    where h.org_id = app.current_org_id()
                      and h.reference_type = 'wo'
                      and h.reference_id = $2::uuid
                 ) then 'ON_HOLD'
                 else 'PENDING'
               end,
               $7::uuid, $7::uuid)
       on conflict (transaction_id) do nothing
       returning id`,
      [
        outputTxnId,
        input.woId,
        outputType,
        row.product_id,
        deriveBatchNumber(input.woId, row.output_role),
        row.uom,
        ctx.userId,
        wo.site_id,
      ],
    );
    if (inserted.rows.length > 0) outputsMaterialized += 1;
  }

  // (6) Emit production.wo.started in the SAME txn.
  await writeOutbox(ctx, {
    eventType: EventType.PRODUCTION_WO_STARTED,
    aggregateType: 'work_order',
    aggregateId: input.woId,
    payload: {
      woId: input.woId,
      bomSnapshotId,
      activeBomHeaderId,
      activeFactorySpecId,
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

/** Stable UUID-v5-ish derivation: per-(WO, schedule_output) output txn id. */
function deriveOutputTxnId(woId: string, scheduleOutputId: string): string {
  // Deterministic over (woId, scheduleOutputId) — NOT the variable start transactionId — so any
  // re-issued START reuses the same wo_outputs.transaction_id (idempotent materialization, R14;
  // closes the Codex round-2 duplicate-output-on-fresh-transactionId hole).
  return uuidFromSeed(`${woId}:${scheduleOutputId}`);
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

/**
 * Gate 3a's SINGLE owner: the open-allergen-changeover predicate for a line.
 * Used by startWo AND by the WO-detail loader's proactive callout — keep ONE
 * definition (F-D11 lesson: inline-duplicated gate predicates drift).
 *
 * Line identity: changeover_events.line_id is TEXT; rows written by
 * createChangeoverEvent hold production_lines.id::text, legacy rows may hold a
 * line CODE or free text — both branches are matched (see gate (3) commentary).
 * Returns the newest blocking changeover_events id, or null when the line is clear.
 */
export async function findOpenLineChangeover(
  client: ProductionContext['client'],
  lineKey: string | null,
  fallbackLineKey: string | null,
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `select ce.id::text
       from public.changeover_events ce
       left join public.production_lines pl
         on pl.org_id = ce.org_id
        and (pl.id::text = coalesce($1::text, $2::text) or pl.code = coalesce($1::text, $2::text))
      where ce.org_id = app.current_org_id()
        and (
          ce.line_id = coalesce($1::text, $2::text)
          or (pl.id is not null and (ce.line_id = pl.id::text or ce.line_id = pl.code))
        )
        and ce.risk_level in ('medium', 'high', 'segregated')
        and ce.dual_sign_off_status not in ('complete', 'completed')
      order by ce.created_at desc
      limit 1`,
    [lineKey, fallbackLineKey],
  );
  return res.rows[0]?.id ?? null;
}

type ReleasedSnapshotWo = {
  site_id: string | null;
  active_bom_header_id: string;
  active_factory_spec_id: string | null;
  requires_factory_spec: boolean;
};

type ReleasedSnapshotBindingRow = {
  bom_exists: boolean;
  spec_exists: boolean;
  spec_site_id: string | null;
  spec_bom_header_id: string | null;
};

/**
 * Confirms the WO's factory-release snapshot still points at real BOM/spec rows and
 * never binds a cross-site factory spec. START must not self-heal or re-base to the
 * newest active BOM/spec — callers only reach here when the WO already carries snapshot ids.
 */
async function validateReleasedSnapshotBindings(
  client: ProductionContext['client'],
  wo: ReleasedSnapshotWo,
): Promise<ProductionResult<void>> {
  const bindingRes = await client.query<ReleasedSnapshotBindingRow>(
    `select
       exists (
         select 1
           from public.bom_headers bh
          where bh.org_id = app.current_org_id()
            and bh.id = $1::uuid
       ) as bom_exists,
       fs.id is not null as spec_exists,
       fs.site_id::text as spec_site_id,
       fs.bom_header_id::text as spec_bom_header_id
     from (select 1) anchor
     left join public.factory_specs fs
       on fs.org_id = app.current_org_id()
      and fs.id = $2::uuid`,
    [wo.active_bom_header_id, wo.active_factory_spec_id],
  );
  const binding = bindingRes.rows[0];
  if (!binding?.bom_exists) {
    return fail('factory_release_incomplete', {
      message: 'WO factory-release snapshot references a missing BOM',
      details: {
        code: 'release_snapshot_orphan',
        bomExists: false,
        specExists: wo.requires_factory_spec ? binding?.spec_exists === true : null,
      },
    });
  }
  if (wo.requires_factory_spec && !binding.spec_exists) {
    return fail('factory_release_incomplete', {
      message: 'WO factory-release snapshot references a missing factory spec',
      details: {
        code: 'release_snapshot_orphan',
        bomExists: true,
        specExists: false,
      },
    });
  }
  if (
    wo.requires_factory_spec &&
    wo.site_id &&
    binding.spec_site_id &&
    binding.spec_site_id !== wo.site_id
  ) {
    return fail('factory_release_incomplete', {
      message: 'WO factory-release snapshot binds a factory spec from a different site',
      details: {
        code: 'cross_site_factory_spec',
        woSiteId: wo.site_id,
        specSiteId: binding.spec_site_id,
      },
    });
  }
  if (
    wo.requires_factory_spec &&
    binding.spec_bom_header_id &&
    binding.spec_bom_header_id !== wo.active_bom_header_id
  ) {
    return fail('factory_release_incomplete', {
      message: 'WO factory-release snapshot BOM/spec bundle is inconsistent',
      details: {
        code: 'bom_spec_bundle_mismatch',
        activeBomHeaderId: wo.active_bom_header_id,
        specBomHeaderId: binding.spec_bom_header_id,
      },
    });
  }
  return { ok: true, data: undefined };
}
