/**
 * P-L1 — `/production/wos/[id]` WO Execution detail page (prototype wo-detail.jsx:4-530).
 *
 * The UI page lives at `/production/wos/[id]` (NOT `/production/work-orders/[id]`)
 * because `work-orders/[id]/route.ts` already owns that segment as the GET API
 * handler — a Route Handler and a page Component cannot coexist on one segment.
 * The list at `/production/wos` links rows here; the dashboard WO-list rows are
 * re-pointed here too.
 *
 * Server Component: gates + reads ALL eight tabs' org-scoped data via the
 * `getWorkOrderDetail` Server Action (production.oee.read), then hands view-models
 * + i18n labels to the presentational <WoDetailScreen> (owns active-tab state).
 *
 * UI states: loading (Suspense skeleton), empty (per-tab empty copy inside the
 * screen), error (live read failed → banner), permission-denied (forbidden →
 * denied panel), not-found (unknown / cross-org id → notFound()). Optimistic —
 * N/A (read-only; mutations are a follow-up lane).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getWorkOrderDetail } from '../../_actions/get-work-order-detail';
import { getWoActionContext } from '../../_actions/get-wo-action-context';
import { releaseWoOutputQa } from '../../_actions/output-qa-actions';
import { listConsumableLps, recordDesktopConsumption } from '../../_actions/consume-material-actions';
// E4B — desktop WO Labor tab. The clock-in/out + summary actions are OWNED by the
// labor backend lane (production/_actions/labor-actions.ts) — imported, never
// re-authored. RBAC (production.consumption.write / production.oee.read) is
// enforced inside each action; the page only resolves the affordance permission.
import {
  clockInToWo,
  clockOutFromWo,
  getWoLaborSummary,
  type ClockInToWoResult,
  type ClockOutFromWoResult,
} from '../../_actions/labor-actions';
import { reverseConsumptionAction, voidWasteEntryAction, voidWoOutputAction } from './void-actions-adapter';
import {
  WoDetailScreen,
  type WoDetailActions,
  type WoDetailLabels,
  type WoLaborState,
  type WoLaborSummaryView,
} from './_components/wo-detail-screen';
import type { VoidReasonCode } from './_components/void-correction-modal';
import { buildWoModalLabels } from '../../_actions/wo-modal-labels';
// E1 — FG label printing wired through the printers settings actions (mig 304).
// The action ONLY supports entityType:'lp' and re-enforces RBAC server-side.
import { printLabel } from '../../../../(admin)/settings/infra/printers/_actions/printers';
import {
  DisassemblyAbort,
  registerDisassemblyOutput,
} from '../../../../../../../lib/production/output/register-disassembly-output';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getActiveSiteId } from '../../../../../../../lib/site/site-context';
import {
  ProductionActionError,
  QualityHoldError,
  emitConsumeBlocked,
} from '../../../../../../../lib/production/shared';
import type {
  OutputPrintLabelInput,
  OutputPrintLabelResult,
} from '../_components/modals/action-modals';

export const dynamic = 'force-dynamic';

function WoDetailSkeleton() {
  return (
    <div data-testid="wo-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-10 w-full max-w-xl animate-pulse rounded-lg bg-slate-100" />
      <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

// E1 — the SAME permission the printers actions enforce (settings.org.update).
const PRINT_PERMISSION = 'settings.org.update';

type PrintQueryResult<T> = { rows: T[]; rowCount?: number | null };
type PrintQueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<PrintQueryResult<T>>;
};
type PrintOrgContextLike = { userId: string; orgId: string; client: PrintQueryClient };

// E7 — the disassembly service's OrgContextLike.client query shape (node-pg). The
// withOrgContext client satisfies it; we narrow via this alias at the call site.
type DisassemblyQueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/**
 * E1 — resolve settings.org.update server-side so the Register-output success
 * [Print FG label] button is rendered enabled/disabled honestly (never
 * render-then-disable leak; the action re-checks regardless). Failures degrade to
 * "no permission", never a 500.
 */
async function resolveCanPrintFg(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as PrintOrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, PRINT_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

/**
 * E1 — Server Action adapter: maps the printers `printLabel` PrintJobRow down to
 * the minimal {status, result_url} the output success state renders. The action
 * itself re-validates RBAC + the entity, so this is a thin import-only seam.
 */
async function printFgLabel(input: OutputPrintLabelInput): Promise<OutputPrintLabelResult> {
  'use server';
  const job = await printLabel({ entityType: input.entityType, entityId: input.entityId });
  return { status: job.status, result_url: job.result_url };
}

// E4B — the permission the labor clock-in/out actions enforce
// (production.consumption.write). Resolved server-side so the controls render
// honestly enabled/disabled (never render-then-hide); the action re-checks it.
const LABOR_WRITE_PERMISSION = 'production.consumption.write';

async function resolveCanManageLabor(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as PrintOrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, LABOR_WRITE_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

/**
 * E4B — thin Server Action adapters for the desktop Labor tab. `source` is pinned
 * to 'desktop' (the scanner uses a separate Bearer /api/scanner/labor slice). The
 * labor-actions re-validate RBAC server-side; these only narrow the input shape.
 */
async function clockInDesktop(input: { woId: string; source: 'desktop' }): Promise<ClockInToWoResult> {
  'use server';
  return clockInToWo({ woId: input.woId, source: 'desktop' });
}
async function clockOutDesktop(input: { woId: string }): Promise<ClockOutFromWoResult> {
  'use server';
  return clockOutFromWo({ woId: input.woId });
}

/**
 * E7 — Server Action adapter for disassembly registration. Runs the SAME
 * registerDisassemblyOutput service the disassembly-outputs route handler calls,
 * inside a fresh withOrgContext txn (RLS + org scope). RBAC
 * (production.output.write) + bom_type='disassembly' are re-validated inside the
 * service — this only narrows the input shape + maps the result union down to the
 * { ok } | { ok:false, errorCode } the modal renders (never leaks a raw UUID).
 */
async function registerDisassemblyOutputDesktop(input: {
  woId: string;
  inputLpId: string;
  outputs: Array<{ coProductItemId: string; qtyKg: string }>;
}): Promise<{ ok: true } | { ok: false; errorCode: string }> {
  'use server';
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const siteId = await getActiveSiteId();
      const result = await registerDisassemblyOutput(
        { userId, orgId, siteId, client: client as unknown as DisassemblyQueryClient },
        input,
      );
      return result.ok ? { ok: true } : { ok: false, errorCode: 'error' in result ? result.error : result.reason };
    });
  } catch (err) {
    if (err instanceof QualityHoldError) {
      try {
        await withOrgContext(async ({ userId, orgId, client }) => {
          await emitConsumeBlocked(
            { userId, orgId, client: client as unknown as DisassemblyQueryClient },
            err,
          );
        });
      } catch (emitErr) {
        console.error('[production/wos] disassembly_consume_blocked_emit_failed', {
          woId: input.woId,
          err: emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }
      return { ok: false, errorCode: 'quality_hold_active' };
    }
    if (err instanceof ProductionActionError) {
      return { ok: false, errorCode: err.code };
    }
    if (err instanceof DisassemblyAbort) {
      return { ok: false, errorCode: err.code };
    }
    throw err;
  }
}

async function WoDetailContent({ id, locale }: { id: string; locale: string }) {
  const t = await getTranslations('production.wos.detail');
  const wosT = await getTranslations('production.wos');
  const result = await getWorkOrderDetail(id);

  if (!result.ok && result.reason === 'not_found') {
    notFound();
  }

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="wo-detail-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('denied')}
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="wo-detail-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  const status = (k: string) => t(`status.${k}`);

  // M-5 — staged desktop-consume labels. Keys live in
  // _meta/i18n-staging/desktop-consume.json under
  // production.wos.detail.consumption.record.* until the bundle-merge lane folds
  // them in; guarded with `t.has` so a not-yet-merged bundle never throws (EN
  // fallbacks keep it honest live). Mirrors the catch-weight / wo-uom injection.
  const rec = (key: string, fallback: string): string =>
    t.has(`consumption.record.${key}`) ? t(`consumption.record.${key}`) : fallback;

  // C-R2 — void/correction labels. Real en+pl land in the bundle; guarded with
  // `t.has` + EN fallback so a not-yet-merged key never throws live (mirrors the
  // desktop-consume / catch-weight staging precedent).
  const vc = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
  const detailError = (code: string, fallback: string): string =>
    t.has(`errors.${code}`) ? t(`errors.${code}`) : fallback;

  const labels: WoDetailLabels = {
    status: {
      planned: status('planned'),
      in_progress: status('in_progress'),
      paused: status('paused'),
      completed: status('completed'),
      closed: status('closed'),
      cancelled: status('cancelled'),
    },
    deferredActionTitle: t('deferredActionTitle'),
    changeoverGate: {
      title: t('changeoverGate.title'),
      body: t('changeoverGate.body'),
      link: t('changeoverGate.link'),
    },
    overProduction: {
      badge: wosT('overProduction.badge'),
      tooltip: wosT('overProduction.tooltip'),
    },
    headerActions: {
      release: t('headerActions.release'),
      start: t('headerActions.start'),
      startReleaseHint: t('headerActions.startReleaseHint'),
      pause: t('headerActions.pause'),
      resume: t('headerActions.resume'),
      waste: t('headerActions.waste'),
      catchWeight: t('headerActions.catchWeight'),
      complete: t('headerActions.complete'),
      cancel: t('headerActions.cancel'),
      close: t('headerActions.close'),
    },
    tabs: {
      overview: t('tabs.overview'),
      consumption: t('tabs.consumption'),
      output: t('tabs.output'),
      waste: t('tabs.waste'),
      downtime: t('tabs.downtime'),
      qa: t('tabs.qa'),
      genealogy: t('tabs.genealogy'),
      labor: t('tabs.labor'),
      history: t('tabs.history'),
    },
    overview: {
      summaryTitle: t('overview.summaryTitle'),
      kpisTitle: t('overview.kpisTitle'),
      wo: t('overview.wo'),
      product: t('overview.product'),
      line: t('overview.line'),
      planned: t('overview.planned'),
      output: t('overview.output'),
      plannedWindow: t('overview.plannedWindow'),
      actualStart: t('overview.actualStart'),
      elapsed: t('overview.elapsed'),
      allergens: t('overview.allergens'),
      bomVersion: t('overview.bomVersion'),
      consumption: t('overview.consumption'),
      consumptionKpi: t('overview.consumptionKpi'),
      outputKpi: t('overview.outputKpi'),
      allergenYes: t('overview.allergenYes'),
      allergenNo: t('overview.allergenNo'),
      elapsedMin: t('overview.elapsedMin'),
    },
    consumption: {
      title: t('consumption.title'),
      empty: t('consumption.empty'),
      addAction: t('consumption.addAction'),
      col: {
        code: t('consumption.col.code'),
        component: t('consumption.col.component'),
        planned: t('consumption.col.planned'),
        consumed: t('consumption.col.consumed'),
        remaining: t('consumption.col.remaining'),
        progress: t('consumption.col.progress'),
      },
      record: {
        trigger: rec('trigger', 'Record consumption'),
        rowTrigger: rec('rowTrigger', 'Record'),
        title: rec('title', 'Record material consumption'),
        subtitle: rec(
          'subtitle',
          "Decrement on-hand stock for a BOM component. Pick a license plate (FEFO order) or record without one.",
        ),
        material: rec('material', 'Component'),
        materialPlaceholder: rec('materialPlaceholder', 'Select a component'),
        qty: rec('qty', 'Quantity'),
        qtyHint: rec('qtyHint', "Amount to consume, in the component's unit of measure."),
        lp: rec('lp', 'License plate (FEFO)'),
        lpLoading: rec('lpLoading', 'Loading license plates…'),
        lpEmpty: rec('lpEmpty', 'No license plates available for this component.'),
        lpError: rec('lpError', 'Unable to load license plates.'),
        lpNone: rec('lpNone', '— no LP —'),
        lpSuggested: rec('lpSuggested', 'suggested'),
        reasonCode: rec('reasonCode', 'Manual reason code'),
        reasonPlaceholder: rec('reasonPlaceholder', 'Required when recording without an LP'),
        submit: rec('submit', 'Record consumption'),
        submitting: rec('submitting', 'Recording…'),
        cancel: rec('cancel', 'Cancel'),
        formIncomplete: t('consumption.record.formIncomplete'),
        warningOver: rec('warningOver', 'Over required quantity by {pct}% — recorded and flagged.'),
        warningClose: rec('warningClose', 'Close'),
        errors: {
          forbidden: rec('errors.forbidden', 'You do not have permission to record consumption.'),
          lp_unavailable: rec(
            'errors.lp_unavailable',
            'That license plate no longer has enough free stock for this quantity.',
          ),
          lp_not_released: rec('errors.lp_not_released', 'That license plate has not been released by QA.'),
          lp_expired: rec('errors.lp_expired', 'That license plate is expired and cannot be consumed.'),
          lp_locked: rec('errors.lp_locked', 'That license plate is locked by another user.'),
          quality_hold_active: rec('errors.quality_hold_active', 'That license plate is on an active quality hold.'),
          reason_required: rec('errors.reason_required', 'Enter a reason code when recording without an LP.'),
          overconsume_blocked: detailError(
            'overconsume_blocked',
            'Consumption exceeds the configured approval threshold.',
          ),
          wo_not_consumable: detailError(
            'wo_not_consumable',
            'This work order is not in a state that accepts consumption.',
          ),
          invalid_input: detailError('invalid_input', 'Check the fields and try again.'),
          error: detailError('error', 'Unable to record consumption.'),
          invalid_material: rec('errors.invalid_material', 'This component is no longer valid for this work order.'),
          invalid_qty: rec('errors.invalid_qty', 'Enter a quantity greater than zero.'),
          unknown: detailError('unknown', 'The action could not be completed.'),
          generic: rec('errors.generic', 'Unable to record consumption.'),
        },
      },
    },
    output: {
      title: t('output.title'),
      empty: t('output.empty'),
      addAction: t('output.addAction'),
      col: {
        type: t('output.col.type'),
        product: t('output.col.product'),
        qty: t('output.col.qty'),
        batch: t('output.col.batch'),
        expiry: t('output.col.expiry'),
        qa: t('output.col.qa'),
        lp: t('output.col.lp'),
      },
      qaPass: t.has('output.qaPass') ? t('output.qaPass') : 'QA pass',
      qaFail: t.has('output.qaFail') ? t('output.qaFail') : 'QA fail',
      qaDenied: t.has('output.qaDenied') ? t('output.qaDenied') : 'You do not have permission to release output QA.',
      qaInvalidState: t.has('output.qaInvalidState') ? t('output.qaInvalidState') : 'This output is no longer pending QA.',
      qaError: t.has('output.qaError') ? t('output.qaError') : 'Unable to update output QA.',
      voidAction: vc('output.voidAction', 'Void output…'),
      noConsumptionBadge: vc('output.noConsumptionBadge', 'No consumption'),
      noConsumptionTooltip: vc(
        'output.noConsumptionTooltip',
        'No material consumption recorded for this WO — the output will have no genealogy/traceability link. Register consumption first, or continue.',
      ),
      noConsumptionContinue: vc('output.noConsumptionContinue', 'Continue anyway'),
    },
    disassembly: {
      triggerAction: vc('disassembly.triggerAction', 'Register disassembly outputs'),
      title: vc('disassembly.title', 'Register disassembly outputs'),
      subtitle: vc(
        'disassembly.subtitle',
        'Break the input license plate into its co-product cuts. Enter the actual yielded weight for each output — the input cost is allocated across them automatically.',
      ),
      inputLp: vc('disassembly.inputLp', 'Input license plate'),
      inputLpPlaceholder: vc('disassembly.inputLpPlaceholder', 'Select the input to break down'),
      inputLpEmpty: vc(
        'disassembly.inputLpEmpty',
        'No input has been consumed into this work order yet — record consumption of the input first.',
      ),
      outputsTitle: vc('disassembly.outputsTitle', 'Expected outputs'),
      outputsEmpty: vc(
        'disassembly.outputsEmpty',
        'This disassembly BOM has no co-product outputs configured.',
      ),
      allocation: vc('disassembly.allocation', '{pct}% allocation'),
      byproduct: vc('disassembly.byproduct', 'By-product'),
      qty: vc('disassembly.qty', 'Yielded quantity'),
      qtyHint: vc('disassembly.qtyHint', 'Actual weight of this cut, in {uom}.'),
      submit: vc('disassembly.submit', 'Register outputs'),
      submitting: vc('disassembly.submitting', 'Registering…'),
      cancel: vc('disassembly.cancel', 'Cancel'),
      formIncomplete: vc('disassembly.formIncomplete', 'Enter a positive quantity for every output.'),
      errors: {
        forbidden: vc(
          'disassembly.errors.forbidden',
          'You do not have permission to register disassembly outputs.',
        ),
        'not-disassembly': vc(
          'disassembly.errors.not-disassembly',
          'This work order is not a disassembly order.',
        ),
        'co-product-mismatch': vc(
          'disassembly.errors.co-product-mismatch',
          'The outputs do not match this disassembly BOM — refresh and retry.',
        ),
        'input-cost-missing': vc(
          'disassembly.errors.input-cost-missing',
          'The input license plate has no cost — set a cost for the input item before disassembly.',
        ),
        'invalid-input': vc('disassembly.errors.invalid-input', 'Check the fields and try again.'),
        'not-found': vc(
          'disassembly.errors.not-found',
          'This work order or its BOM no longer exists — refresh and retry.',
        ),
        'warehouse-not-configured': vc(
          'disassembly.errors.warehouse-not-configured',
          'No default warehouse is configured — set one before registering output.',
        ),
        generic: vc('disassembly.errors.generic', 'Unable to register disassembly outputs.'),
      },
    },
    waste: {
      title: t('waste.title'),
      empty: t('waste.empty'),
      addAction: t('waste.addAction'),
      totalLabel: t('waste.totalLabel', { kg: 0 }).replace('0', '{kg}'),
      col: {
        time: t('waste.col.time'),
        category: t('waste.col.category'),
        qty: t('waste.col.qty'),
        reason: t('waste.col.reason'),
      },
      voidAction: vc('waste.voidAction', 'Void entry…'),
    },
    voidCorrection: {
      outputTitle: vc('voidCorrection.outputTitle', 'Void output {batch}'),
      wasteTitle: vc('voidCorrection.wasteTitle', 'Void {category} waste entry'),
      intro: vc(
        'voidCorrection.intro',
        'Voiding records a reversing correction entry — the original row stays in the ledger, struck through, with the counter entry linked to it. Totals are recomputed on the server.',
      ),
      reasonCode: vc('voidCorrection.reasonCode', 'Reason'),
      reasonPlaceholder: vc('voidCorrection.reasonPlaceholder', 'Select a reason'),
      reasonOptions: {
        entry_error: vc('voidCorrection.reasonOptions.entry_error', 'Entry error'),
        wrong_quantity: vc('voidCorrection.reasonOptions.wrong_quantity', 'Wrong quantity'),
        wrong_batch: vc('voidCorrection.reasonOptions.wrong_batch', 'Wrong batch / lot'),
        wrong_product: vc('voidCorrection.reasonOptions.wrong_product', 'Wrong product'),
        other: vc('voidCorrection.reasonOptions.other', 'Other'),
      } satisfies Record<VoidReasonCode, string>,
      note: vc('voidCorrection.note', 'Note'),
      noteOptional: vc('voidCorrection.noteOptional', 'optional'),
      notePlaceholder: vc('voidCorrection.notePlaceholder', 'Add context for the correction'),
      closedWarning: vc(
        'voidCorrection.closedWarning',
        'Voiding on a closed order requires supervisor authorization.',
      ),
      esign: {
        title: vc('voidCorrection.esign.title', 'Electronic signature'),
        meaning: vc(
          'voidCorrection.esign.meaning',
          'Enter your e-sign PIN to sign this void — or your account password while you have no PIN enrolled. Your identity and the server time are recorded.',
        ),
        password: vc('voidCorrection.esign.password', 'E-sign PIN or account password'),
        passwordPlaceholder: vc('voidCorrection.esign.passwordPlaceholder', 'E-sign PIN or account password'),
        passwordHelp: vc(
          'voidCorrection.esign.passwordHelp',
          'Your account password is accepted only while you have no e-sign PIN enrolled.',
        ),
      },
      cancel: vc('voidCorrection.cancel', 'Cancel'),
      submit: vc('voidCorrection.submit', 'Void'),
      submitting: vc('voidCorrection.submitting', 'Voiding…'),
      formIncomplete: t('voidCorrection.formIncomplete'),
      errors: {
        forbidden: vc('voidCorrection.errors.forbidden', 'You do not have permission to void this record.'),
        not_found: vc('voidCorrection.errors.not_found', 'This record no longer exists — refresh and retry.'),
        invalid_state: vc(
          'voidCorrection.errors.invalid_state',
          'This output can no longer be voided in its current state.',
        ),
        invalid_input: vc('voidCorrection.errors.invalid_input', 'Check the fields and try again.'),
        lp_not_voidable: vc(
          'voidCorrection.errors.lp_not_voidable',
          "This output's pallet has already been released or allocated — it can no longer be voided directly.",
        ),
        already_corrected: vc(
          'voidCorrection.errors.already_corrected',
          'This record has already been voided.',
        ),
        esign_failed: vc('voidCorrection.errors.esign_failed', 'Signature failed — check your password and retry.'),
        persistence_failed: vc('voidCorrection.errors.persistence_failed', 'Unable to void this record.'),
        generic: vc('voidCorrection.errors.generic', 'Unable to void this record.'),
      },
      voidedBadge: vc('voidCorrection.voidedBadge', 'Voided'),
      correctionOfLabel: vc('voidCorrection.correctionOfLabel', 'Correction of #{ref}'),
    },
    downtime: {
      title: t('downtime.title'),
      empty: t('downtime.empty'),
      addAction: t('downtime.addAction'),
      openLabel: t('downtime.openLabel'),
      col: {
        category: t('downtime.col.category'),
        start: t('downtime.col.start'),
        end: t('downtime.col.end'),
        duration: t('downtime.col.duration'),
        reason: t('downtime.col.reason'),
      },
    },
    qa: {
      title: t('qa.title'),
      empty: t('qa.empty'),
      total: t('qa.total'),
      pass: t('qa.pass'),
      hold: t('qa.hold'),
      fail: t('qa.fail'),
    },
    labor: {
      title: t('labor.title'),
      empty: t('labor.empty'),
      loading: t('labor.loading'),
      error: t('labor.error'),
      forbidden: t('labor.forbidden'),
      clockIn: t('labor.clockIn'),
      clockOut: t('labor.clockOut'),
      clockingIn: t('labor.clockingIn'),
      clockingOut: t('labor.clockingOut'),
      clockInDenied: t('labor.clockInDenied'),
      clockOutDenied: t('labor.clockOutDenied'),
      totalHours: t('labor.totalHours'),
      totalCost: t('labor.totalCost'),
      noRate: t('labor.noRate'),
      noRateTooltip: t('labor.noRateTooltip'),
      disabledTooltip: t('labor.disabledTooltip'),
      col: {
        operator: t('labor.col.operator'),
        hours: t('labor.col.hours'),
        rate: t('labor.col.rate'),
        cost: t('labor.col.cost'),
      },
    },
    genealogy: {
      title: t('genealogy.title'),
      empty: t('genealogy.empty'),
      inputsLabel: t('genealogy.inputsLabel'),
      fefoOk: t('genealogy.fefoOk'),
      fefoDeviation: t('genealogy.fefoDeviation'),
      reverseAction: vc('genealogy.reverseAction', 'Reverse…'),
      reversedBadge: vc('genealogy.reversedBadge', 'Reversed'),
      correctionOfLabel: vc('genealogy.correctionOfLabel', 'Correction of #{ref}'),
    },
    reverseConsumption: {
      title: vc('reverseConsumption.title', 'Reverse consumption of {lp}'),
      intro: vc(
        'reverseConsumption.intro',
        'Reversing records a counter consumption entry that restores the consumed pallet — the original row stays in the ledger, struck through, with the counter entry linked to it. Stock and totals are recomputed on the server.',
      ),
      reasonCode: vc('reverseConsumption.reasonCode', 'Reason'),
      reasonPlaceholder: vc('reverseConsumption.reasonPlaceholder', 'Select a reason'),
      reasonOptions: {
        entry_error: vc('reverseConsumption.reasonOptions.entry_error', 'Entry error'),
        wrong_quantity: vc('reverseConsumption.reasonOptions.wrong_quantity', 'Wrong quantity'),
        wrong_batch: vc('reverseConsumption.reasonOptions.wrong_batch', 'Wrong batch / lot'),
        wrong_product: vc('reverseConsumption.reasonOptions.wrong_product', 'Wrong product'),
        other: vc('reverseConsumption.reasonOptions.other', 'Other'),
      } satisfies Record<VoidReasonCode, string>,
      note: vc('reverseConsumption.note', 'Note'),
      noteOptional: vc('reverseConsumption.noteOptional', 'optional'),
      notePlaceholder: vc('reverseConsumption.notePlaceholder', 'Add context for the reversal'),
      closedWarning: vc(
        'reverseConsumption.closedWarning',
        'Reversing consumption on a closed order requires supervisor authorization.',
      ),
      esign: {
        title: vc('reverseConsumption.esign.title', 'Electronic signature'),
        meaning: vc(
          'reverseConsumption.esign.meaning',
          'Enter your e-sign PIN to sign this reversal — or your account password while you have no PIN enrolled. Your identity and the server time are recorded.',
        ),
        password: vc('reverseConsumption.esign.password', 'E-sign PIN or account password'),
        passwordPlaceholder: vc('reverseConsumption.esign.passwordPlaceholder', 'E-sign PIN or account password'),
        passwordHelp: vc(
          'reverseConsumption.esign.passwordHelp',
          'Your account password is accepted only while you have no e-sign PIN enrolled.',
        ),
      },
      cancel: vc('reverseConsumption.cancel', 'Cancel'),
      submit: vc('reverseConsumption.submit', 'Reverse'),
      submitting: vc('reverseConsumption.submitting', 'Reversing…'),
      formIncomplete: t('reverseConsumption.formIncomplete'),
      errors: {
        forbidden: vc('reverseConsumption.errors.forbidden', 'You do not have permission to reverse this consumption.'),
        not_found: vc('reverseConsumption.errors.not_found', 'This consumption entry no longer exists — refresh and retry.'),
        already_corrected: vc('reverseConsumption.errors.already_corrected', 'This consumption has already been reversed.'),
        lp_not_restorable: vc(
          'reverseConsumption.errors.lp_not_restorable',
          'The consumed pallet has already been shipped or destroyed — this entry can no longer be reversed.',
        ),
        inconsistent_ledger: vc(
          'reverseConsumption.errors.inconsistent_ledger',
          'The stock ledger for this pallet is inconsistent — reversing was blocked to protect inventory. Ask a supervisor to review before retrying.',
        ),
        invalid_input: vc('reverseConsumption.errors.invalid_input', 'Check the fields and try again.'),
        esign_failed: vc('reverseConsumption.errors.esign_failed', 'Signature failed — check your password and retry.'),
        persistence_failed: vc('reverseConsumption.errors.persistence_failed', 'Unable to reverse this consumption.'),
        generic: vc('reverseConsumption.errors.generic', 'Unable to reverse this consumption.'),
      },
    },
    history: {
      title: t('history.title'),
      empty: t('history.empty'),
      sourceStatus: t('history.sourceStatus'),
      sourceExecution: t('history.sourceExecution'),
      col: {
        time: t('history.col.time'),
        source: t('history.col.source'),
        action: t('history.col.action'),
        transition: t('history.col.transition'),
        reason: t('history.col.reason'),
      },
    },
  };

  // Resolve the server-side action context (RBAC + runtime status + reference
  // lists + e-sign signer). A failed/forbidden read just hides the action bar —
  // the read-only screen still renders.
  const actionCtx = await getWoActionContext(id);
  const at = await getTranslations('production.wos.actions');

  let actions: WoDetailActions | null = null;
  if (actionCtx.ok) {
    const modalLabels = buildWoModalLabels((k) => at(k));
    const detailErrors = {
      invalid_input: detailError('invalid_input', 'Check the fields and try again.'),
      forbidden: detailError('forbidden', 'You do not have permission to perform this action.'),
      not_found: detailError('not_found', 'This work order or record no longer exists.'),
      wo_not_recordable: detailError(
        'wo_not_recordable',
        'The work order is not in a state that accepts this record.',
      ),
      quality_hold_active: detailError('quality_hold_active', 'Blocked by an active quality hold.'),
      already_recorded: detailError('already_recorded', 'This entry was already recorded.'),
      uom_conversion_unavailable: detailError(
        'uom_conversion_unavailable',
        'This product is missing the pack data needed to convert units.',
      ),
      invalid_reference: detailError('invalid_reference', 'An invalid reference was supplied.'),
      insufficient_input_for_output: detailError(
        'insufficient_input_for_output',
        'There is not enough posted input to register this output.',
      ),
      insufficient_lp_quantity: detailError(
        'insufficient_lp_quantity',
        'The selected license plate does not have enough quantity.',
      ),
      warehouse_not_configured: detailError(
        'warehouse_not_configured',
        'No warehouse is configured for output registration.',
      ),
      no_warehouse_for_site: detailError(
        'no_warehouse_for_site',
        'No warehouse is configured for your site.',
      ),
      persistence_failed: detailError('persistence_failed', 'Something went wrong saving the action. Please retry.'),
      network_error: detailError('network_error', 'Network error — please check your connection and retry.'),
      unknown: detailError('unknown', 'The action could not be completed.'),
    };
    modalLabels.errors = { ...modalLabels.errors, ...detailErrors };

    // P0-UOM — inject the staged output-unit labels + the conversion-unavailable
    // error onto the server-resolved labels object (keys live in
    // _meta/i18n-staging/wo-uom.json until the bundle-merge lane lands; guarded
    // with `at.has` so a not-yet-merged bundle never throws at runtime).
    const opt = (key: string): string | undefined => (at.has(key) ? at(key) : undefined);
    modalLabels.output.qtyUom = {
      base: opt('output.qtyUom.base') ?? modalLabels.output.qty,
      each: opt('output.qtyUom.each') ?? 'each',
      box: opt('output.qtyUom.box') ?? 'box',
    };
    modalLabels.output.actualWeight = opt('output.actualWeight') ?? 'Actual weight (kg)';
    modalLabels.output.actualWeightHint =
      opt('output.actualWeightHint') ?? 'Leave empty to use the nominal conversion.';
    modalLabels.output.conversionPreview =
      opt('output.conversionPreview') ?? '{qty} {unit} = {kg} {base}';
    if (!modalLabels.errors.uom_conversion_unavailable) {
      modalLabels.errors.uom_conversion_unavailable =
        opt('errors.uom_conversion_unavailable') ??
        'This product is missing the pack data needed to convert units — set it in Technical.';
    }

    // B-3 — inject the staged catch-weight per-unit capture labels (keys live in
    // _meta/i18n-staging/catch-weight.json until the bundle-merge lane folds them
    // into production.wos.actions.output.catchWeight.*). Guarded with `at.has` so
    // a not-yet-merged bundle never throws; EN fallbacks keep it honest live.
    modalLabels.output.catchWeight = {
      sectionTitle: opt('output.catchWeight.sectionTitle') ?? 'Per-unit weights (kg)',
      sectionHint:
        opt('output.catchWeight.sectionHint') ??
        'Catch-weight item — enter the actual scale reading for each unit.',
      unitLabel: opt('output.catchWeight.unitLabel') ?? 'Unit {n}',
      sumLabel: opt('output.catchWeight.sumLabel') ?? 'Σ {total} kg',
      tooMany:
        opt('output.catchWeight.tooMany') ??
        'Too many units to enter individually (max {max}). Reduce the quantity or register in smaller batches.',
      baseTextareaLabel:
        opt('output.catchWeight.baseTextareaLabel') ?? 'Per-unit weights (one per line, kg)',
      baseTextareaHint:
        opt('output.catchWeight.baseTextareaHint') ?? 'Enter one positive weight per line.',
      invalidWeights:
        opt('output.catchWeight.invalidWeights') ?? 'Every unit weight must be a positive number.',
    };

    // E1 — inject the Register-output success + [Print FG label] copy. Keys live
    // under production.wos.actions.output.print.* (real en+pl; ro/uk mirror EN).
    modalLabels.output.print = {
      successTitle: opt('output.print.successTitle') ?? 'Output registered',
      successBody:
        opt('output.print.successBody') ?? 'The finished-goods license plate was created.',
      lpLine: opt('output.print.lpLine') ?? 'FG label — {lp}',
      action: opt('output.print.action') ?? 'Print FG label',
      printing: opt('output.print.printing') ?? 'Printing…',
      queued: opt('output.print.queued') ?? 'Print job queued for the printer.',
      sent: opt('output.print.sent') ?? 'Label sent — download the rendered output below.',
      download: opt('output.print.download') ?? 'Download label',
      error:
        opt('output.print.error') ??
        'Label could not be printed. Try again or contact an administrator.',
      forbidden:
        opt('output.print.forbidden') ??
        'Insufficient permissions: settings.org.update is required to print labels.',
      close: opt('output.print.close') ?? 'Done',
    };
    modalLabels.output.mass_balance_warning =
      opt('output.mass_balance_warning') ??
      'Registered output ({outputKg} kg) requires approx {expectedKg} kg of components at {yieldPct}% yield, but {consumedKg} kg consumed so far.';

    actions = {
      locale,
      status: actionCtx.data.executionStatus,
      workOrderStatus: actionCtx.data.workOrderStatus,
      permissions: actionCtx.data.permissions,
      currentUserId: actionCtx.data.currentUserId,
      downtimeCategories: actionCtx.data.downtimeCategories,
      wasteCategories: actionCtx.data.wasteCategories,
      shifts: actionCtx.data.shifts,
      lines: actionCtx.data.lines,
      modalLabels,
      yieldGateGreen: actionCtx.data.yieldGateGreen,
    };
  }

  // E1 — only resolve the print permission when the action bar is offered at all
  // (no point querying for a read-only/forbidden viewer).
  const canPrintFgLabel = actions ? await resolveCanPrintFg() : false;

  // E4B — labor summary (getWoLaborSummary re-checks production.oee.read) + the
  // clock-in/out affordance permission. The summary read maps the typed error
  // union to the screen's state enum so the tab surfaces forbidden/error honestly
  // without leaking a raw UUID. canManageLabor is only resolved when the read-only
  // action context is absent-safe (we still query independently of the action bar).
  const [laborResult, canManageLabor] = await Promise.all([
    getWoLaborSummary(id),
    resolveCanManageLabor(),
  ]);
  let laborSummary: WoLaborSummaryView | null = null;
  let laborState: WoLaborState = 'ready';
  if (laborResult.ok) {
    laborSummary = laborResult.data;
  } else if (laborResult.error === 'forbidden') {
    laborState = 'forbidden';
  } else {
    laborState = 'error';
  }

  return (
    <WoDetailScreen
      data={result.data}
      labels={labels}
      actions={actions}
      changeoverGate={
        result.data.openChangeoverId ? { lineId: result.data.header.lineId } : null
      }
      releaseOutputQaAction={releaseWoOutputQa}
      recordConsumptionAction={recordDesktopConsumption}
      listConsumableLpsAction={listConsumableLps}
      voidWoOutputAction={voidWoOutputAction}
      voidWasteEntryAction={voidWasteEntryAction}
      reverseConsumptionAction={reverseConsumptionAction}
      registerDisassemblyOutputAction={registerDisassemblyOutputDesktop}
      printFgLabelAction={printFgLabel}
      canPrintFgLabel={canPrintFgLabel}
      laborSummary={laborSummary}
      laborState={laborState}
      canManageLabor={canManageLabor}
      clockInAction={clockInDesktop}
      clockOutAction={clockOutDesktop}
    />
  );
}

export default async function ProductionWoDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations('production.wos.detail');

  return (
    <main
      data-screen="production-wo-detail"
      data-prototype-label="wo_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        breadcrumb={[
          { label: t('breadcrumb.production'), href: `/${locale}/production` },
          { label: t('breadcrumb.workOrders'), href: `/${locale}/production/wos` },
        ]}
      />
      <Suspense fallback={<WoDetailSkeleton />}>
        <WoDetailContent id={id} locale={locale} />
      </Suspense>
    </main>
  );
}
