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
  // Per-criterion "how to satisfy" hints — surfaced only while the criterion is
  // pending/warn so the approver can navigate to the owning stage and resolve it.
  c1Hint: string;
  c2Hint: string;
  c3Hint: string;
  c4Hint: string;
  c5Hint: string;
  c6Hint: string;
  c7Hint: string;
  fixLink: string;
};

/**
 * Project-relative (or absolute) hrefs that take the approver to the stage that
 * owns each criterion so a `pending`/`warn` row is actionable. Built server-side
 * in page.tsx (locale + product_code aware); omitted for criteria with no in-app
 * remediation (e.g. C4 sensory, which is a Technical-owned read-model).
 */
export type CriterionLinks = Partial<Record<ApprovalCriterionKey, string>>;

function criterionName(key: ApprovalCriterionKey, labels: CriteriaLabels): string {
  return labels[`${key.toLowerCase() as 'c1'}Name` as keyof CriteriaLabels] as string;
}

function criterionDetail(key: ApprovalCriterionKey, labels: CriteriaLabels): string {
  return labels[`${key.toLowerCase() as 'c1'}Detail` as keyof CriteriaLabels] as string;
}

function criterionHint(key: ApprovalCriterionKey, labels: CriteriaLabels): string {
  return labels[`${key.toLowerCase() as 'c1'}Hint` as keyof CriteriaLabels] as string;
}

/** A criterion is unsatisfied (and therefore actionable) when it is pending or warn. */
function isUnsatisfied(status: ApprovalCriterionStatus): boolean {
  return status === 'pending' || status === 'warn';
}

/** Design-system 5-tone badge class (globals `.badge-*`). */
function statusBadgeTone(status: ApprovalCriterionStatus): string {
  switch (status) {
    case 'pass':
      return 'badge-green';
    case 'warn':
      return 'badge-amber';
    case 'not_required':
      return 'badge-gray';
    default:
      return 'badge-gray';
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
    <span
      data-slot="badge"
      className={`badge ${statusBadgeTone(status)}`}
      data-testid="criterion-status-badge"
      data-status={status}
      aria-label={label}
    >
      <span aria-hidden="true">{statusGlyph(status)}</span> {label}
    </span>
  );
}

export function CriteriaCard({
  criteria,
  labels,
  links,
}: {
  criteria: Record<ApprovalCriterionKey, ApprovalCriterionStatus>;
  labels: CriteriaLabels;
  links?: CriterionLinks;
}) {
  const counts = tallyCriteria(criteria);
  return (
    <div data-slot="card" data-testid="approval-gates-card" className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>
            {labels.title}
          </h2>
          <p className="muted" style={{ fontSize: 12 }}>
            {labels.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="criteria-counts">
          <span data-slot="badge" className="badge badge-green" data-testid="count-pass">
            <span aria-hidden="true">✓</span> {labels.countPass.replace('{count}', String(counts.pass))}
          </span>
          <span data-slot="badge" className="badge badge-amber" data-testid="count-warn">
            <span aria-hidden="true">!</span> {labels.countWarn.replace('{count}', String(counts.warn))}
          </span>
          <span data-slot="badge" className="badge badge-gray" data-testid="count-pending">
            <span aria-hidden="true">○</span> {labels.countPending.replace('{count}', String(counts.pending))}
          </span>
        </div>
      </div>

      <ul className="list-none p-0" style={{ margin: 0 }}>
        {CRITERIA_ORDER.map((key) => {
          const status = criteria[key];
          const unsatisfied = isUnsatisfied(status);
          const hint = criterionHint(key, labels);
          const href = links?.[key];
          return (
            <li
              key={key}
              data-testid={`criterion-row-${key}`}
              data-criterion={key}
              data-status={status}
              className="flex items-center gap-3"
              style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}
            >
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center justify-center"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  fontSize: 12,
                  fontWeight: 700,
                  color: status === 'not_required' || status === 'pending' ? 'var(--muted)' : '#fff',
                  background:
                    status === 'pass'
                      ? 'var(--green)'
                      : status === 'warn'
                        ? 'var(--amber)'
                        : 'var(--gray-100)',
                }}
              >
                {statusGlyph(status)}
              </span>
              <div className="flex-1">
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  <span className="mono muted" style={{ marginRight: 6 }}>
                    {key}
                  </span>
                  {criterionName(key, labels)}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {criterionDetail(key, labels)}
                </div>
                {unsatisfied && hint ? (
                  <div
                    data-testid={`criterion-hint-${key}`}
                    className="muted"
                    style={{ fontSize: 12, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}
                  >
                    <span aria-hidden="true">→</span>
                    <span>{hint}</span>
                    {href ? (
                      <a
                        data-testid={`criterion-fix-link-${key}`}
                        href={href}
                        className="link"
                        style={{ fontWeight: 500 }}
                      >
                        {labels.fixLink}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <StatusBadge status={status} labels={labels} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default CriteriaCard;
