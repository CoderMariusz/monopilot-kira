'use client';

/**
 * P2-MODALS — the WO action orchestrator the detail screen consumes.
 *
 * <WoActionsProvider> owns: the runner (locale/woId-bound fetch), which modal is
 * open, the state+permission gate, and the reference lists. It exposes:
 *   - <WoActionTrigger kind=… /> : a design-system button rendered ONLY when the
 *     action is state-legal AND permitted (gating.canOfferAction). Used by the
 *     header action bar and the per-tab buttons.
 *   - <WoActionModals/>          : renders ALL the action modals against the
 *     shared open-state (mounted once, near the screen root).
 *
 * Server-trust boundary: `status` is the runtime wo_executions.status and
 * `permissions` is the server-resolved RBAC bag — both from getWoActionContext.
 * The client never invents them; the route handler re-checks regardless.
 */

import { createContext, useContext, useMemo, useState } from 'react';

import { canOfferAction } from './gating';
import { useWoAction } from './use-wo-action';
import {
  StartModal,
  PauseModal,
  ResumeModal,
  CancelModal,
  CompleteModal,
  CloseModal,
  OutputModal,
  WasteModal,
  type OutputUomContext,
  type PrintFgLabelAction,
} from './action-modals';
import type {
  WoActionKind,
  WoActionPermissions,
  WoModalLabels,
  WoReasonCategory,
  WoWasteCategory,
  WoShiftOption,
  WoLineOption,
  WoState,
} from './types';

type WoActionsContextValue = {
  status: WoState | null;
  permissions: WoActionPermissions;
  labels: WoModalLabels;
  open: WoActionKind | null;
  setOpen: (kind: WoActionKind | null) => void;
};

const Ctx = createContext<WoActionsContextValue | null>(null);

function useWoActionsCtx(): WoActionsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('WoActionTrigger/WoActionModals must be inside <WoActionsProvider>');
  return ctx;
}

export type WoActionsProviderProps = {
  locale: string;
  woId: string;
  status: WoState | null;
  permissions: WoActionPermissions;
  labels: WoModalLabels;
  currentUserId: string;
  downtimeCategories: WoReasonCategory[];
  wasteCategories: WoWasteCategory[];
  /** Shift options for the Waste + Pause shift dropdowns (D8 — picker, mandatory). */
  shifts: WoShiftOption[];
  /** Org production lines for the Pause line dropdown (D8 — picker, mandatory). */
  lines: WoLineOption[];
  /** WO's line id (string) prefilled into the Pause modal. */
  defaultLineId: string | null;
  /** WO's FG product id prefilled into the Register-output modal. */
  defaultProductId: string | null;
  /**
   * P0-UOM — the WO's output-unit + read-only product identity for the
   * Register-output modal (threaded from the detail header). Null ⇒ the modal
   * falls back to base-kg entry.
   */
  outputUom?: OutputUomContext | null;
  /**
   * E1 — print the created FG LP label (printers `printLabel` adapter, threaded
   * from the RSC page). Optional + gated on the server-resolved settings.org.update
   * (`canPrintFgLabel`); absent/false ⇒ the success-state button is disabled.
   */
  printFgLabelAction?: PrintFgLabelAction;
  canPrintFgLabel?: boolean;
  children: React.ReactNode;
};

/** Context provider — also holds the shared open-state. */
export function WoActionsProvider(props: WoActionsProviderProps) {
  const [open, setOpen] = useState<WoActionKind | null>(null);
  const value = useMemo<WoActionsContextValue>(
    () => ({ status: props.status, permissions: props.permissions, labels: props.labels, open, setOpen }),
    [props.status, props.permissions, props.labels, open],
  );

  // The modal renderer + runner live here so they mount once.
  return (
    <Ctx.Provider value={value}>
      {props.children}
      <WoActionModals
        locale={props.locale}
        woId={props.woId}
        currentUserId={props.currentUserId}
        downtimeCategories={props.downtimeCategories}
        wasteCategories={props.wasteCategories}
        shifts={props.shifts}
        lines={props.lines}
        defaultLineId={props.defaultLineId}
        defaultProductId={props.defaultProductId}
        outputUom={props.outputUom ?? null}
        printFgLabelAction={props.printFgLabelAction}
        canPrintFgLabel={props.canPrintFgLabel ?? false}
      />
    </Ctx.Provider>
  );
}

/**
 * A single action button. Renders nothing when the action is not offerable for
 * the current state/permission (so the UI never shows a guaranteed-409 control).
 * `variant='header'` is the dense pill in the header bar; `variant='tab'` is the
 * per-tab CTA. `catchWeight` is an alias trigger that opens the output modal.
 */
export function WoActionTrigger({
  kind,
  label,
  variant = 'header',
  testid,
}: {
  kind: WoActionKind;
  label: string;
  variant?: 'header' | 'tab';
  testid?: string;
}) {
  const { status, permissions, setOpen } = useWoActionsCtx();
  if (!canOfferAction(kind, status, permissions)) return null;

  const className =
    variant === 'header'
      ? 'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
      : 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50';

  return (
    <button
      type="button"
      data-testid={testid ?? `wo-action-${kind}`}
      onClick={() => setOpen(kind)}
      className={className}
    >
      {label}
    </button>
  );
}

/** Renders every action modal against the shared open-state. */
function WoActionModals({
  locale,
  woId,
  currentUserId,
  downtimeCategories,
  wasteCategories,
  shifts,
  lines,
  defaultLineId,
  defaultProductId,
  outputUom,
  printFgLabelAction,
  canPrintFgLabel,
}: {
  locale: string;
  woId: string;
  currentUserId: string;
  downtimeCategories: WoReasonCategory[];
  wasteCategories: WoWasteCategory[];
  shifts: WoShiftOption[];
  lines: WoLineOption[];
  defaultLineId: string | null;
  defaultProductId: string | null;
  outputUom: OutputUomContext | null;
  printFgLabelAction?: PrintFgLabelAction;
  canPrintFgLabel: boolean;
}) {
  const { labels, open, setOpen } = useWoActionsCtx();
  const { run } = useWoAction(locale, woId);
  const close = () => setOpen(null);

  const base = { woId, labels, run, onClose: close };

  return (
    <>
      <StartModal open={open === 'start'} {...base} />
      <PauseModal
        open={open === 'pause'}
        {...base}
        categories={downtimeCategories}
        defaultLineId={defaultLineId}
        lines={lines}
        shifts={shifts}
      />
      <ResumeModal open={open === 'resume'} {...base} />
      <CancelModal open={open === 'cancel'} {...base} />
      <CompleteModal open={open === 'complete'} {...base} />
      <CloseModal open={open === 'close'} {...base} signerUserId={currentUserId} locale={locale} />
      <OutputModal
        open={open === 'output'}
        {...base}
        defaultProductId={defaultProductId}
        uom={outputUom}
        printLabelAction={printFgLabelAction}
        canPrintFgLabel={canPrintFgLabel}
      />
      <WasteModal open={open === 'waste'} {...base} categories={wasteCategories} shifts={shifts} />
    </>
  );
}
