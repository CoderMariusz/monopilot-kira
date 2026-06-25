'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';

export type LegacyCloseoutWarningCode =
  | 'TRIAL_SHELF_LIFE_MISSING'
  | 'PILOT_WO_NOT_LINKED'
  | 'HANDOFF_BOM_NOT_APPROVED'
  | 'PACKAGING_MRP_INCOMPLETE'
  | 'ALREADY_CLOSED';

export type LegacyCloseoutStatus = {
  trial: boolean;
  pilot: boolean;
  handoff: boolean;
  packaging: boolean;
  warningCode?: LegacyCloseoutWarningCode | null;
};

/**
 * Localized chip labels. Reuses the existing Kanban stage labels (stageTrial /
 * stagePilot / stageHandoff / stagePackaging) so no new i18n keys are needed.
 * Defaults to English so test/legacy callers without labels still render.
 */
export type CloseoutPillLabels = {
  trial: string;
  pilot: string;
  handoff: string;
  packaging: string;
};

const DEFAULT_LABELS: CloseoutPillLabels = {
  trial: 'Trial',
  pilot: 'Pilot',
  handoff: 'Handoff',
  packaging: 'Packaging',
};

const INDICATOR_KEYS: Array<keyof CloseoutPillLabels> = ['trial', 'pilot', 'handoff', 'packaging'];

export function LaunchedCardCloseoutPill({
  status,
  labels = DEFAULT_LABELS,
}: {
  status: LegacyCloseoutStatus;
  labels?: CloseoutPillLabels;
}) {
  // The aria-label trails the (localized) chip names with a short, untranslated
  // role suffix so the group still reads as a status region to assistive tech.
  const ariaSuffix = 'closeout status';
  // Net-new element: the prototype has no Launched-card closeout pill. Closest
  // context is the Kanban card (npd/pipeline.jsx:19-52, @deprecated BL-NPD-02);
  // this 4-indicator pill is a documented extension, not a 1:1 parity port.
  return (
    <div
      data-testid="launched-closeout-pill"
      data-prototype-anchor="net-new:no-prototype-precedent (context: npd/pipeline.jsx:19-52)"
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1"
      aria-label={`${labels.trial} ${labels.pilot} ${labels.handoff} ${labels.packaging} ${ariaSuffix}`}
    >
      {INDICATOR_KEYS.map((key) => {
        const complete = status[key];
        return (
          <span
            key={key}
            data-testid={`closeout-dot-${key}`}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600"
          >
            <span
              aria-hidden="true"
              className={[
                'h-2 w-2 rounded-full',
                complete ? 'bg-emerald-500' : 'bg-amber-500',
              ].join(' ')}
            />
            {labels[key]}
          </span>
        );
      })}
      {status.warningCode ? (
        <Badge variant="warning" data-testid="closeout-warning-chip" className="ml-0.5 text-[10px]">
          {status.warningCode}
        </Badge>
      ) : null}
    </div>
  );
}

export default LaunchedCardCloseoutPill;
