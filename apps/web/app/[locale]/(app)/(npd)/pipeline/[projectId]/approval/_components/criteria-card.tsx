'use client';

/**
 * T-079 — CriteriaCard (the 7-criteria gates-summary card of ApprovalScreen).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:434-451
 *   (the "Approval gates" card: header count badges + per-gate status circle rows)
 *
 * Translation notes (prototype → production):
 *   - gates[] mock array                       → REAL C1-C7 evaluation from the merged T-078
 *                                                evaluateApprovalCriteria Server Action (org-scoped, RLS);
 *                                                this island NEVER queries the DB (risk red-line).
 *   - status circle ✓ / ! / ○                  → status glyph + variant Badge; colour is ALWAYS paired with
 *                                                a glyph + visible text label (a11y: never colour-only).
 *   - "5 pass / 1 warn / 2 pending" badges      → derived counts in the card header (i18n ICU-style labels).
 *   - per-gate "View" ghost button             → optional per-criterion affordance (no-op shell; the criterion
 *                                                detail lives on its owning stage screen).
 *
 * Sensory (C4) is consumed as a Technical-owned read-model status (pass / warn /
 * pending / not_required) — this screen never reads NPD sensory tables.
 */

import React from 'react';
import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';

export type ApprovalCriterionKey = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7';
export type ApprovalCriterionStatus = 'pass' | 'warn' | 'pending' | 'not_required';

/** Canonical render order for the seven approval criteria. */
export const CRITERIA_ORDER: readonly ApprovalCriterionKey[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'] as const;

export type CriteriaLabels = {
  title: string;
  subtitle: string;
  countPass: string;
  countWarn: string;
  countPending: string;
  view: string;
  statusPass: string;
  statusWarn: string;
  statusPending: string;
  statusNotRequired: string;
  c1Name: string;
  c2Name: string;
  c3Name: string;
  c4Name: string;
  c5Name: string;
  c6Name: string;
  c7Name: string;
  c1Detail: string;
  c2Detail: string;
  c3Detail: string;
  c4Detail: string;
  c5Detail: string;
  c6Detail: string;
  c7Detail: string;
};

function criterionName(key: ApprovalCriterionKey, labels: CriteriaLabels): string {
  return labels[`${key.toLowerCase() as 'c1'}Name` as keyof CriteriaLabels] as string;
}

function criterionDetail(key: ApprovalCriterionKey, labels: CriteriaLabels): string {
  return labels[`${key.toLowerCase() as 'c1'}Detail` as keyof CriteriaLabels] as string;
}

function statusVariant(status: ApprovalCriterionStatus): BadgeVariant {
  switch (status) {
    case 'pass':
      return 'success';
    case 'warn':
      return 'warning';
    case 'not_required':
      return 'muted';
    default:
      return 'secondary';
  }
}

function statusGlyph(status: ApprovalCriterionStatus): string {
  switch (status) {
    case 'pass':
      return '✓';
    case 'warn':
      return '!';
    case 'not_required':
      return '–';
    default:
      return '○';
  }
}

function statusLabel(status: ApprovalCriterionStatus, labels: CriteriaLabels): string {
  switch (status) {
    case 'pass':
      return labels.statusPass;
    case 'warn':
      return labels.statusWarn;
    case 'not_required':
      return labels.statusNotRequired;
    default:
      return labels.statusPending;
  }
}

/** Counts used both for the header badges and (by the parent) for Submit gating. */
export function tallyCriteria(
  criteria: Record<ApprovalCriterionKey, ApprovalCriterionStatus>,
): { pass: number; warn: number; pending: number; notRequired: number; allSatisfied: boolean } {
  let pass = 0;
  let warn = 0;
  let pending = 0;
  let notRequired = 0;
  for (const key of CRITERIA_ORDER) {
    switch (criteria[key]) {
      case 'pass':
        pass += 1;
        break;
      case 'warn':
        warn += 1;
        break;
      case 'not_required':
        notRequired += 1;
        break;
      default:
        pending += 1;
    }
  }
  // Satisfied for submission = no warn and no pending (pass or not_required only).
  const allSatisfied = warn === 0 && pending === 0;
  return { pass, warn, pending, notRequired, allSatisfied };
}

function StatusBadge({ status, labels }: { status: ApprovalCriterionStatus; labels: CriteriaLabels }) {
  const label = statusLabel(status, labels);
  return (
    <Badge variant={statusVariant(status)} data-testid="criterion-status-badge" data-status={status} aria-label={label}>
      <span aria-hidden="true">{statusGlyph(status)}</span> {label}
    </Badge>
  );
}

export function CriteriaCard({
  criteria,
  labels,
}: {
  criteria: Record<ApprovalCriterionKey, ApprovalCriterionStatus>;
  labels: CriteriaLabels;
}) {
  const counts = tallyCriteria(criteria);
  return (
    <Card data-testid="approval-gates-card" className="space-y-3 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{labels.title}</h2>
          <p className="text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="criteria-counts">
          <Badge variant="success" data-testid="count-pass">
            <span aria-hidden="true">✓</span> {labels.countPass.replace('{count}', String(counts.pass))}
          </Badge>
          <Badge variant="warning" data-testid="count-warn">
            <span aria-hidden="true">!</span> {labels.countWarn.replace('{count}', String(counts.warn))}
          </Badge>
          <Badge variant="secondary" data-testid="count-pending">
            <span aria-hidden="true">○</span> {labels.countPending.replace('{count}', String(counts.pending))}
          </Badge>
        </div>
      </header>

      <ul className="list-none divide-y divide-slate-100 p-0">
        {CRITERIA_ORDER.map((key) => {
          const status = criteria[key];
          return (
            <li
              key={key}
              data-testid={`criterion-row-${key}`}
              data-criterion={key}
              data-status={status}
              className="flex items-center gap-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  status === 'pass'
                    ? 'bg-emerald-600 text-white'
                    : status === 'warn'
                      ? 'bg-amber-500 text-white'
                      : status === 'not_required'
                        ? 'bg-slate-200 text-slate-500'
                        : 'bg-slate-100 text-slate-400',
                ].join(' ')}
              >
                {statusGlyph(status)}
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">
                  <span className="mr-1.5 font-mono text-xs text-slate-400">{key}</span>
                  {criterionName(key, labels)}
                </div>
                <div className="text-xs text-slate-500">{criterionDetail(key, labels)}</div>
              </div>
              <StatusBadge status={status} labels={labels} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default CriteriaCard;
