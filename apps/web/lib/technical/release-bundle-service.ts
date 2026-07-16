/**
 * T-080 — FactorySpec + shared-BOM bundle approval/rejection SERVICE.
 *
 * This is the atomic core of the Technical release bundle: a factory_spec version
 * (migration 165) is approved TOGETHER WITH a specific shared-BOM version (bom_headers,
 * migration 090/159) — never one side alone. It runs inside a caller-supplied
 * org-context transaction (the `'use server'` actions in
 * `apps/web/actions/technical/release-bundles/*.ts` open it via `withOrgContext`), so
 * every read/write is RLS-scoped by `app.current_org_id()` and every state change +
 * outbox row commits or rolls back as one unit.
 *
 * Behaviour (acceptance criteria):
 *   AC1  approve: factory_spec(in_review) + BOM(draft|in_review, RM-usable) → both move
 *        to canonical factory-usable status, linked by one evidence bundle id, and the
 *        Technical release adapter (T-081) sets the NPD soft uuid
 *        `factory_release_status.active_factory_spec_id` when the FG is NPD-originated.
 *   AC2  if the factory_spec fails its release blocker, the whole approval is rejected
 *        ATOMICALLY — neither factory_spec nor BOM is released.
 *   AC3  D365 disabled → local Technical release still works; D365 sync state is optional
 *        integration metadata and is never required to approve.
 *   AC4  released bundle edit → clone-on-write a new draft version; released rows stay
 *        immutable (guarded by `factory-spec-release-guards` + the migration-165 trigger).
 *   AC5  caller lacking the Technical approval permission → explicit authorization error.
 *
 * Red lines: shared BOM SSOT (no second BOM model / no NPD-owned factory_spec path);
 * never release only one side; D365 never required; never mutate an approved/released
 * row in place; FG canonical (no FA-* ids); `d365_item_id` is TEXT soft ref only.
 */

import { z } from 'zod';

import { hashESignSubject, signEvent } from '@monopilot/e-sign';
import {
  runTechnicalApprovalPreflight,
  readAuthorizationPolicy,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
} from '../../actions/authorization/preflight';
import {
  guardBusinessFieldEdit,
  guardStatusTransition,
} from './factory-spec-release-guards';
import { hasPermission } from '../auth/has-permission';
import { validateBomApprovalGuards } from '../../app/[locale]/(app)/(modules)/technical/bom/_actions/shared';

// ── RBAC permission gating the bundle approval (PRD 03-TECHNICAL §3) ───────────
// The bundle = factory_spec (internal product spec) + its BOM version. The
// product-spec approval string is the workflow-authorization permission seeded to the
// org-admin family by migration 154. Rejection requires the same approval authority.
export const FACTORY_SPEC_APPROVE_PERMISSION = 'technical.product_spec.approve';
export const BOM_APPROVE_PERMISSION = 'technical.bom.approve';

export const APP_VERSION = 'technical-release-bundle-v1';

// e-sign intent for the bundle approval (CFR 21 Part 11). Mirrors the existing
// `tech.fa.release` intent vocabulary in packages/e-sign/src/types.ts.
export const BUNDLE_APPROVE_INTENT = 'tech.fa.release';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export interface BundleServiceContext {
  userId: string;
  orgId: string;
  client: QueryClient;
}

export type BundleActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'invalid_state'
  | 'release_blocked'
  | 'released_record_immutable'
  | 'esign_failed'
  | 'persistence_failed';

/** Thrown after the first write when the txn must roll back; map to ActionResult outside `withOrgContext`. */
export class BundleApprovalRollbackError extends Error {
  readonly bundleError: BundleActionError;

  constructor(bundleError: BundleActionError, message: string) {
    super(message);
    this.name = 'BundleApprovalRollbackError';
    this.bundleError = bundleError;
  }
}

export interface ApproveBundleData {
  factorySpecId: string;
  bomHeaderId: string;
  factorySpecStatus: 'approved_for_factory' | 'in_review';
  bomStatus: 'technical_approved' | 'active' | 'draft' | 'in_review';
  evidenceBundleId: string;
  signatureId: string;
  /** Set when the FG is NPD-originated and the release adapter closed the loop. */
  factoryReleaseStatusId: string | null;
  /** Present while distinct approver signatures are still being collected. */
  approvalStatus?: 'pending' | 'complete';
  approvalsCollected?: number;
  approvalsRequired?: number;
}

export type ApproveBundleResult =
  | { ok: true; data: ApproveBundleData }
  | { ok: false; error: BundleActionError; message?: string };

export interface RejectBundleData {
  factorySpecId: string;
  bomHeaderId: string;
  factorySpecStatus: string;
  bomStatus: string;
}

export type RejectBundleResult =
  | { ok: true; data: RejectBundleData }
  | { ok: false; error: BundleActionError; message?: string };

// ── Input schemas ─────────────────────────────────────────────────────────────
export const ApproveBundleInput = z.object({
  factorySpecId: z.string().uuid(),
  bomHeaderId: z.string().uuid(),
  /** CFR 21 Part 11 e-signature PIN (server-verified; never persisted). */
  pin: z.string().min(1),
  /** Mandatory free-text reason for the approval signature. */
  reason: z.string().trim().min(1).max(512),
});
export type ApproveBundleInputType = z.infer<typeof ApproveBundleInput>;

export const RejectBundleInput = z.object({
  factorySpecId: z.string().uuid(),
  bomHeaderId: z.string().uuid(),
  reason: z.string().trim().min(1).max(512),
});
export type RejectBundleInputType = z.infer<typeof RejectBundleInput>;

function toPolicyNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

async function resolveRequiredBundleApprovers(client: QueryClient): Promise<number> {
  const policy = await readAuthorizationPolicy(client, TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY);
  const minApprovers = Math.max(1, toPolicyNumber(policy?.min_approvers ?? 1));
  const dualSign = Boolean(policy?.settings_json?.require_dual_sign_off);
  return dualSign ? Math.max(2, minApprovers) : minApprovers;
}

async function countDistinctBundleApprovals(
  client: QueryClient,
  subjectHash: string,
  nonce: string,
): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `select count(distinct signer_user_id)::int as n
       from public.e_sign_log
      where org_id = app.current_org_id()
        and intent = $1
        and subject_hash = $2
        and nonce = $3`,
    [BUNDLE_APPROVE_INTENT, subjectHash, nonce],
  );
  return rows[0]?.n ?? 0;
}

async function callerAlreadyApprovedBundle(
  client: QueryClient,
  signerUserId: string,
  subjectHash: string,
  nonce: string,
): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `select exists (
       select 1
         from public.e_sign_log
        where org_id = app.current_org_id()
          and signer_user_id = $1::uuid
          and intent = $2
          and subject_hash = $3
          and nonce = $4
     ) as exists`,
    [signerUserId, BUNDLE_APPROVE_INTENT, subjectHash, nonce],
  );
  return rows[0]?.exists === true;
}

function bundleApprovalSubject(spec: FactorySpecRow, bom: BomRow) {
  return {
    factorySpecId: spec.id,
    bomHeaderId: bom.id,
    fgItemId: spec.fg_item_id,
    bomVersion: bom.version,
  };
}

function bundleApprovalNonce(specId: string, bomId: string): string {
  return `${specId}:${bomId}:approve`;
}

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

type FactorySpecRow = {
  id: string;
  fg_item_id: string;
  status: string;
  bom_header_id: string | null;
  bom_version: number | null;
};

type BomRow = {
  id: string;
  status: string;
  version: number;
  product_id: string | null;
  npd_project_id: string | null;
};

async function loadFactorySpec(client: QueryClient, id: string): Promise<FactorySpecRow | null> {
  const { rows } = await client.query<FactorySpecRow>(
    `select id, fg_item_id, status, bom_header_id, bom_version
       from public.factory_specs
      where id = $1::uuid`,
    [id],
  );
  return rows[0] ?? null;
}

async function lockFactorySpecForApproval(client: QueryClient, id: string): Promise<FactorySpecRow | null> {
  const { rows } = await client.query<FactorySpecRow>(
    `select id, fg_item_id, status, bom_header_id, bom_version
       from public.factory_specs
      where id = $1::uuid
        and org_id = app.current_org_id()
      for update`,
    [id],
  );
  return rows[0] ?? null;
}

async function loadBom(client: QueryClient, id: string): Promise<BomRow | null> {
  const { rows } = await client.query<BomRow>(
    `select id, status, version, product_id, npd_project_id
       from public.bom_headers
      where id = $1::uuid`,
    [id],
  );
  return rows[0] ?? null;
}

async function lockBomForApproval(client: QueryClient, id: string): Promise<BomRow | null> {
  const { rows } = await client.query<BomRow>(
    `select id, status, version, product_id, npd_project_id
       from public.bom_headers
      where id = $1::uuid
        and org_id = app.current_org_id()
      for update`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * F2 — bundle-internal consistency: the factory_spec's FG item (fg_item_id →
 * items, org-scoped via RLS + the app.current_org_id() predicate) must carry
 * the SAME item_code the BOM names as its product (bom_headers.product_id is
 * the item_code TEXT, not a uuid). Callers only invoke this for a non-null
 * product_id (a NULL product carries no binding to verify).
 */
async function specFgMatchesBomProduct(
  client: QueryClient,
  fgItemId: string,
  bomProductId: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.items i
      where i.org_id = app.current_org_id()
        and i.id = $1::uuid
        and i.item_code = $2
      limit 1`,
    [fgItemId, bomProductId],
  );
  return rows.length > 0;
}

/**
 * RM usability gate for the BOM (red line: "BOM is draft/reviewable with passing RM
 * usability"). T-074 owns the full RM usability validator; here we apply the part that
 * is enforceable against the migrated schema: every BOM line that references an item
 * (item_id FK from migration 159) must point at an ACTIVE item. A line whose item is
 * deactivated/blocked makes the BOM non-usable and the bundle approval must fail
 * (release_blocked), not silently release.
 */
async function bomRmUsabilityFails(client: QueryClient, bomHeaderId: string): Promise<boolean> {
  const { rows } = await client.query<{ blocked: number }>(
    `select count(*)::int as blocked
       from public.bom_lines l
       join public.items i on i.id = l.item_id
      where l.bom_header_id = $1::uuid
        and i.status <> 'active'`,
    [bomHeaderId],
  );
  return (rows[0]?.blocked ?? 0) > 0;
}

/**
 * V-TEC-14 at factory_spec_approval context — the same sourcing gate direct BOM
 * approval uses (workflow.ts). Bundle approval must not report success when
 * component supplier/spec readiness would block standalone BOM approve.
 */
async function bomSourcingGateMessage(
  client: QueryClient,
  bom: BomRow,
  bomHeaderId: string,
): Promise<string | null> {
  if (!bom.product_id) return null;

  const { rows: lines } = await client.query<{ item_id: string | null; component_code: string }>(
    `select item_id, component_code
       from public.bom_lines
      where org_id = app.current_org_id()
        and bom_header_id = $1::uuid`,
    [bomHeaderId],
  );

  const guard = await validateBomApprovalGuards(
    client,
    bom.product_id,
    lines.map((line) => ({ itemId: line.item_id, componentCode: line.component_code })),
    { cycleBlockedMessage: 'BOM has a cycle; bundle cannot be approved' },
  );
  return guard.ok ? null : guard.message;
}

async function emitOutbox(
  client: QueryClient,
  params: {
    orgId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  },
): Promise<number> {
  const { rows } = await client.query<{ id: number | string }>(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, $3, $4, $5::jsonb, $6)
     returning id`,
    [
      params.orgId,
      params.eventType,
      params.aggregateType,
      params.aggregateId,
      JSON.stringify(params.payload),
      APP_VERSION,
    ],
  );
  const id = rows[0]?.id;
  const numeric = typeof id === 'string' ? Number(id) : id;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    throw new Error('failed to emit technical.factory_spec.approved');
  }
  return numeric;
}

async function writeAudit(
  client: QueryClient,
  params: {
    orgId: string;
    actorUserId: string;
    action: string;
    resourceId: string;
    afterState: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'factory_spec', $4, null, $5::jsonb, 'standard')`,
    [params.orgId, params.actorUserId, params.action, params.resourceId, JSON.stringify(params.afterState)],
  );
}

/**
 * Technical release adapter (T-081, DB side): close the loop with the NPD canonical
 * release model. When the FG is NPD-originated (the BOM carries an npd_project_id +
 * product_id) and an NPD `factory_release_status` row exists for that bundle, set its
 * SOFT uuid `active_factory_spec_id` (+ active_bom_header_id) and move it to the
 * canonical `approved_for_factory` value with the same evidence event. NO hard FK from
 * NPD to factory_specs — the column is a soft uuid (migration 125).
 *
 * Returns the factory_release_status id when the loop was closed, else null (a
 * pure-Technical FG with no NPD project has no release record to update).
 */
async function closeNpdReleaseLoop(
  client: QueryClient,
  params: {
    orgId: string;
    bom: BomRow;
    factorySpecId: string;
    releaseEventId: number;
    approvedBy: string;
  },
): Promise<string | null> {
  if (!params.bom.npd_project_id || !params.bom.product_id) return null;

  const { rows } = await client.query<{ id: string }>(
    `update public.factory_release_status
        set release_status = 'approved_for_factory',
            active_bom_header_id = $4::uuid,
            active_factory_spec_id = $5::uuid,
            factory_available_at = now(),
            factory_approved_by = $6::uuid,
            release_event_id = $7,
            release_blockers = '[]'::jsonb
      where org_id = $1::uuid
        and project_id = $2::uuid
        and product_code = $3
        and release_status in ('pending_npd_release', 'pending_technical_approval')
      returning id`,
    [
      params.orgId,
      params.bom.npd_project_id,
      params.bom.product_id,
      params.bom.id,
      params.factorySpecId,
      params.approvedBy,
      params.releaseEventId,
    ],
  );
  return rows[0]?.id ?? null;
}

/**
 * Approve the factory_spec + BOM bundle atomically. Must be called inside an org-context
 * transaction (the action wrapper provides it).
 */
export async function approveReleaseBundle(
  ctx: BundleServiceContext,
  rawInput: unknown,
): Promise<ApproveBundleResult> {
  const parsed = ApproveBundleInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  // AC5 — authorization preflight (Settings policy). Lacking the approval permission is
  // an explicit, non-leaky authorization error.
  if (!(await hasPermission(ctx, FACTORY_SPEC_APPROVE_PERMISSION))) {
    return { ok: false, error: 'forbidden' };
  }

  const spec = await loadFactorySpec(ctx.client, input.factorySpecId);
  const bom = await loadBom(ctx.client, input.bomHeaderId);
  // RLS scopes both SELECTs to the caller's org; a missing row is not_found (never leaks
  // cross-org existence).
  if (!spec || !bom) return { ok: false, error: 'not_found' };

  // AC4 — never mutate a factory-usable (immutable) row in place.
  const editGuard = guardBusinessFieldEdit(spec.status);
  if (!editGuard.ok && editGuard.code === 'RELEASED_RECORD_IMMUTABLE') {
    return { ok: false, error: 'released_record_immutable', message: editGuard.message };
  }

  // The bundle approval is the in_review → approved_for_factory transition.
  const transition = guardStatusTransition(spec.status, 'approved_for_factory');
  if (!transition.ok) {
    if (transition.code === 'RELEASED_RECORD_IMMUTABLE') {
      return { ok: false, error: 'released_record_immutable', message: transition.message };
    }
    return { ok: false, error: 'invalid_state', message: transition.message };
  }

  if (spec.bom_header_id !== bom.id || spec.bom_version !== bom.version) {
    return {
      ok: false,
      error: 'invalid_state',
      message: `factory_spec is paired to BOM ${spec.bom_header_id ?? 'none'} v${spec.bom_version ?? 'none'}; expected BOM ${bom.id} v${bom.version}`,
    };
  }

  // F2 (W9 cross-review HIGH): the spec's FG must BE the product the BOM
  // describes — spec.fg_item_id resolved through items (org-scoped) must carry
  // item_code = bom.product_id. Without this, a spec for product A could be
  // bundle-approved against product B's BOM and laundered into release evidence.
  // A pure-Technical BOM with product_id NULL (legacy fa_code identification)
  // carries no product binding to verify and is exempt — the reviewer's
  // mismatch scenario requires a non-null product on both sides.
  // FOLLOW-UP (noted, not in this fix): a DB-side trigger enforcing the same
  // invariant on factory_specs writes would make this tamper-proof at rest.
  if (bom.product_id !== null && !(await specFgMatchesBomProduct(ctx.client, spec.fg_item_id, bom.product_id))) {
    return {
      ok: false,
      error: 'invalid_state',
      message: `factory_spec FG item ${spec.fg_item_id} does not match the BOM product ${bom.product_id}`,
    };
  }

  // The BOM side must be either still approvable (draft/in_review) or already factory
  // usable (technical_approved/active). An already-active BOM must not be regressed.
  if (!['draft', 'in_review', 'technical_approved', 'active'].includes(bom.status)) {
    return {
      ok: false,
      error: 'invalid_state',
      message: `BOM ${bom.id} is ${bom.status}; the bundle requires a draft/in_review/technical_approved/active BOM`,
    };
  }

  // AC2 — release blocker on either side rejects the whole approval atomically. RM
  // usability is checked under row locks below so concurrent BOM edits cannot slip
  // inactive items in between validation and approval.

  try {
    const lockedSpec = await lockFactorySpecForApproval(ctx.client, spec.id);
    if (!lockedSpec || lockedSpec.status !== 'in_review') {
      return { ok: false, error: 'invalid_state', message: 'factory_spec no longer in_review' };
    }
    if (lockedSpec.bom_header_id !== bom.id || lockedSpec.bom_version !== bom.version) {
      return {
        ok: false,
        error: 'invalid_state',
        message: `factory_spec is paired to BOM ${lockedSpec.bom_header_id ?? 'none'} v${lockedSpec.bom_version ?? 'none'}; expected BOM ${bom.id} v${bom.version}`,
      };
    }

    const lockedBom = await lockBomForApproval(ctx.client, bom.id);
    if (!lockedBom) {
      return { ok: false, error: 'not_found' };
    }
    if (!['draft', 'in_review', 'technical_approved', 'active'].includes(lockedBom.status)) {
      return {
        ok: false,
        error: 'invalid_state',
        message: `BOM ${lockedBom.id} is ${lockedBom.status}; the bundle requires a draft/in_review/technical_approved/active BOM`,
      };
    }

    if (await bomRmUsabilityFails(ctx.client, lockedBom.id)) {
      return {
        ok: false,
        error: 'release_blocked',
        message: 'BOM has lines referencing inactive items (RM usability failed)',
      };
    }

    const sourcingBlocked = await bomSourcingGateMessage(ctx.client, lockedBom, lockedBom.id);
    if (sourcingBlocked) {
      return {
        ok: false,
        error: 'release_blocked',
        message: sourcingBlocked,
      };
    }

    const preflight = await runTechnicalApprovalPreflight({ client: ctx.client });
    if (!preflight.ok) {
      return {
        ok: false,
        error: 'forbidden',
        message: 'Technical product-spec approval policy is misconfigured',
      };
    }

    const approvalsRequired = await resolveRequiredBundleApprovers(ctx.client);
    const approvalSubject = bundleApprovalSubject(lockedSpec, lockedBom);
    const approvalNonce = bundleApprovalNonce(lockedSpec.id, lockedBom.id);
    const subjectHash = hashESignSubject(approvalSubject);

    if (await callerAlreadyApprovedBundle(ctx.client, ctx.userId, subjectHash, approvalNonce)) {
      return {
        ok: false,
        error: 'invalid_state',
        message: 'This approver has already signed this bundle; a distinct second approver is required',
      };
    }

    let signatureId: string;
    try {
      const receipt = await signEvent(
        {
          signerUserId: ctx.userId,
          pin: input.pin,
          intent: BUNDLE_APPROVE_INTENT,
          subject: approvalSubject,
          nonce: approvalNonce,
          reason: input.reason,
        },
        { client: ctx.client as never },
      );
      signatureId = receipt.signatureId;
    } catch (err) {
      throw err;
    }

    const approvalsCollected = await countDistinctBundleApprovals(ctx.client, subjectHash, approvalNonce);
    if (approvalsCollected < approvalsRequired) {
      await writeAudit(ctx.client, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        action: 'factory_spec.bundle_approval_recorded',
        resourceId: lockedSpec.id,
        afterState: {
          factorySpecId: lockedSpec.id,
          bomHeaderId: lockedBom.id,
          signatureId,
          approvalsCollected,
          approvalsRequired,
        },
      });

      return {
        ok: true,
        data: {
          factorySpecId: lockedSpec.id,
          bomHeaderId: lockedBom.id,
          factorySpecStatus: 'in_review',
          bomStatus: lockedBom.status as ApproveBundleData['bomStatus'],
          evidenceBundleId: signatureId,
          signatureId,
          factoryReleaseStatusId: null,
          approvalStatus: 'pending',
          approvalsCollected,
          approvalsRequired,
        },
      };
    }

    // All required distinct approvers have signed — perform the atomic factory-usable transition.
    const updatedSpec = await ctx.client.query<{ id: string }>(
      `update public.factory_specs
          set status = 'approved_for_factory',
              bom_header_id = $2::uuid,
              bom_version = $3::integer,
              approved_by = $4::uuid,
              approved_at = now()
        where id = $1::uuid
          and org_id = app.current_org_id()
          and status = 'in_review'
        returning id`,
      [spec.id, lockedBom.id, lockedBom.version, ctx.userId],
    );
    if (updatedSpec.rows.length === 0) {
      throw new BundleApprovalRollbackError('invalid_state', 'factory_spec no longer in_review');
    }

    const approvedBomStatus: 'technical_approved' | 'active' =
      lockedBom.status === 'active' ? 'active' : 'technical_approved';
    if (lockedBom.status === 'draft' || lockedBom.status === 'in_review') {
      const updatedBom = await ctx.client.query<{ id: string }>(
        `update public.bom_headers
            set status = 'technical_approved',
                approved_by = $2::uuid,
                approved_at = now()
          where id = $1::uuid
            and status in ('draft', 'in_review')
          returning id`,
        [lockedBom.id, ctx.userId],
      );
      if (updatedBom.rows.length === 0) {
        throw new BundleApprovalRollbackError('invalid_state', 'BOM no longer approvable');
      }
    }

    await ctx.client.query(
      `update public.factory_specs
          set status = 'superseded'
        where org_id = app.current_org_id()
          and fg_item_id = $1::uuid
          and status in ('approved_for_factory', 'released_to_factory')
          and id <> $2::uuid`,
      [spec.fg_item_id, spec.id],
    );

    const releaseEventId = await emitOutbox(ctx.client, {
      orgId: ctx.orgId,
      eventType: 'technical.factory_spec.approved',
      aggregateType: 'factory_spec',
      aggregateId: spec.id,
      payload: {
        factorySpecId: spec.id,
        bomHeaderId: lockedBom.id,
        bomVersion: lockedBom.version,
        fgItemId: spec.fg_item_id,
        signatureId,
        approvedBy: ctx.userId,
        approvalsCollected,
        approvalsRequired,
      },
    });

    const factoryReleaseStatusId = await closeNpdReleaseLoop(ctx.client, {
      orgId: ctx.orgId,
      bom: lockedBom,
      factorySpecId: spec.id,
      releaseEventId,
      approvedBy: ctx.userId,
    });

    await writeAudit(ctx.client, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: 'factory_spec.bundle_approved',
      resourceId: spec.id,
      afterState: {
        factorySpecId: spec.id,
        bomHeaderId: lockedBom.id,
        bomVersion: lockedBom.version,
        signatureId,
        releaseEventId,
        factoryReleaseStatusId,
        approvalsCollected,
        approvalsRequired,
      },
    });

    return {
      ok: true,
      data: {
        factorySpecId: spec.id,
        bomHeaderId: lockedBom.id,
        factorySpecStatus: 'approved_for_factory',
        bomStatus: approvedBomStatus,
        evidenceBundleId: signatureId,
        signatureId,
        factoryReleaseStatusId,
        approvalStatus: 'complete',
        approvalsCollected,
        approvalsRequired,
      },
    };
  } catch (err) {
    if (err instanceof BundleApprovalRollbackError) {
      throw err;
    }
    if (isPgError(err) && err.code === '23514') {
      throw err;
    }
    console.error('[technical/release-bundle] approve persistence_failed', {
      factorySpecId: input.factorySpecId,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Reject the bundle atomically: neither side is released. The factory_spec returns to a
 * working `draft` state (so it can be re-worked) and the BOM is left untouched in its
 * current draft/in_review state. No `technical.factory_spec.approved` event is emitted.
 */
export async function rejectReleaseBundle(
  ctx: BundleServiceContext,
  rawInput: unknown,
): Promise<RejectBundleResult> {
  const parsed = RejectBundleInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  if (!(await hasPermission(ctx, FACTORY_SPEC_APPROVE_PERMISSION))) {
    return { ok: false, error: 'forbidden' };
  }

  const spec = await loadFactorySpec(ctx.client, input.factorySpecId);
  const bom = await loadBom(ctx.client, input.bomHeaderId);
  if (!spec || !bom) return { ok: false, error: 'not_found' };

  // Cannot reject an already factory-usable bundle (immutable; clone-on-write instead).
  const editGuard = guardBusinessFieldEdit(spec.status);
  if (!editGuard.ok && editGuard.code === 'RELEASED_RECORD_IMMUTABLE') {
    return { ok: false, error: 'released_record_immutable', message: editGuard.message };
  }
  if (!['draft', 'in_review'].includes(spec.status)) {
    return { ok: false, error: 'invalid_state', message: `factory_spec is ${spec.status}` };
  }

  if (spec.bom_header_id !== input.bomHeaderId) {
    return {
      ok: false,
      error: 'invalid_state',
      message: `factory_spec is paired to BOM ${spec.bom_header_id ?? 'none'}; expected ${input.bomHeaderId}`,
    };
  }

  try {
    const updated = await ctx.client.query<{ id: string }>(
      `update public.factory_specs
          set status = 'draft'
        where id = $1::uuid
          and status in ('draft', 'in_review')
        returning id`,
      [spec.id],
    );
    if (updated.rows.length === 0) {
      return { ok: false, error: 'invalid_state', message: 'factory_spec no longer rejectable' };
    }

    await writeAudit(ctx.client, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: 'factory_spec.bundle_rejected',
      resourceId: spec.id,
      afterState: { factorySpecId: spec.id, bomHeaderId: bom.id, reason: input.reason },
    });

    return {
      ok: true,
      data: {
        factorySpecId: spec.id,
        bomHeaderId: bom.id,
        factorySpecStatus: 'draft',
        bomStatus: bom.status, // BOM left untouched — neither side released.
      },
    };
  } catch (err) {
    console.error('[technical/release-bundle] reject persistence_failed', {
      factorySpecId: input.factorySpecId,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
