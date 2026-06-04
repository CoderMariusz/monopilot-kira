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

const INDICATORS: Array<{ key: keyof Pick<LegacyCloseoutStatus, 'trial' | 'pilot' | 'handoff' | 'packaging'>; label: string }> = [
  { key: 'trial', label: 'Trial' },
  { key: 'pilot', label: 'Pilot' },
  { key: 'handoff', label: 'Handoff' },
  { key: 'packaging', label: 'Packaging' },
];

export function LaunchedCardCloseoutPill({ status }: { status: LegacyCloseoutStatus }) {
  // Net-new element: the prototype has no Launched-card closeout pill. Closest
  // context is the Kanban card (npd/pipeline.jsx:19-52, @deprecated BL-NPD-02);
  // this 4-indicator pill is a documented extension, not a 1:1 parity port.
  return (
    <div
      data-testid="launched-closeout-pill"
      data-prototype-anchor="net-new:no-prototype-precedent (context: npd/pipeline.jsx:19-52)"
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1"
      aria-label="Trial Pilot Handoff Packaging closeout status"
    >
      {INDICATORS.map((indicator) => {
        const complete = status[indicator.key];
        return (
          <span
            key={indicator.key}
            data-testid={`closeout-dot-${indicator.key}`}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600"
          >
            <span
              aria-hidden="true"
              className={[
                'h-2 w-2 rounded-full',
                complete ? 'bg-emerald-500' : 'bg-amber-500',
              ].join(' ')}
            />
            {indicator.label}
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
