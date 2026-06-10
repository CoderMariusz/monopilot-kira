'use client';

/**
 * P2-MODALS — per-row lifecycle action for the WO list (Start / Pause / Resume).
 *
 * Each row is its own little action surface: it owns its open-state and its
 * runner (woId-bound). The visible verb is chosen from the row's runtime status
 * and gated by the org-level permission bag (resolved server-side, shared across
 * rows). Pause needs a downtime category + line; Start/Resume need neither, so
 * the shared category list + the row's lineId are threaded in.
 *
 * Only Start (planned) / Pause (in_progress) / Resume (paused) are offered here —
 * the deeper actions (complete/close/output/waste) live on the detail screen.
 */

import { useState } from 'react';

import { canOfferAction } from './gating';
import { useWoAction } from './use-wo-action';
import { StartModal, PauseModal, ResumeModal } from './action-modals';
import type {
  WoActionKind,
  WoActionPermissions,
  WoModalLabels,
  WoReasonCategory,
} from './types';
import type { WoState } from '../../../_actions/get-wo-action-context';

export type WoListRowActionLabels = {
  start: string;
  pause: string;
  resume: string;
};

export function WoRowActions({
  locale,
  woId,
  status,
  lineId,
  permissions,
  rowLabels,
  modalLabels,
  downtimeCategories,
}: {
  locale: string;
  woId: string;
  /** Runtime status (list rows already carry the runtime vocabulary). */
  status: WoState;
  lineId: string | null;
  permissions: WoActionPermissions;
  rowLabels: WoListRowActionLabels;
  modalLabels: WoModalLabels;
  downtimeCategories: WoReasonCategory[];
}) {
  const [open, setOpen] = useState<WoActionKind | null>(null);
  const { run } = useWoAction(locale, woId);

  // Exactly one primary verb per row state (mirrors the prototype's single CTA).
  const verb: WoActionKind | null =
    canOfferAction('start', status, permissions)
      ? 'start'
      : canOfferAction('pause', status, permissions)
        ? 'pause'
        : canOfferAction('resume', status, permissions)
          ? 'resume'
          : null;

  if (!verb) return <span className="text-xs text-slate-300">—</span>;

  const label = verb === 'start' ? rowLabels.start : verb === 'pause' ? rowLabels.pause : rowLabels.resume;
  const close = () => setOpen(null);
  const base = { woId, labels: modalLabels, run, onClose: close };

  return (
    <>
      <button
        type="button"
        data-testid={`wo-row-action-${woId}`}
        onClick={() => setOpen(verb)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {label}
      </button>
      <StartModal open={open === 'start'} {...base} />
      <PauseModal open={open === 'pause'} {...base} categories={downtimeCategories} defaultLineId={lineId} />
      <ResumeModal open={open === 'resume'} {...base} />
    </>
  );
}
