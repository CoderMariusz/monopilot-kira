'use client';

/**
 * T-089 — TEC-052 Cost Import from D365 (presentational + trigger client).
 *
 * RELOCATED 2026-06-05 into Settings › Integrations › D365 (old path
 * technical/costs/d365-import/_components/cost-import.client.tsx) AND polished to
 * the LOCKED design system (MON-design-system): canonical `.kpi` 3px-accent tiles
 * with Inter values (never mono), `.card` surfaces (no shadow), dense raw
 * `.table`, codes in `.mono`, `.alert` banners, `.btn .btn-primary` Apply (always
 * `--blue`, never a black surface), `.empty-state` for the diff. Behaviour,
 * server actions and NUMERIC-exact cost handling are unchanged.
 *
 * Parity anchor (layout-primitive, spec-driven):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:551-648
 *   (cost_import_d365_screen) — D365-disabled banner that keeps the rest of the
 *   surface usable, KPI tiles, diff table with Δ% colour-coding, and a sign-off
 *   ReasonInput required on |Δ| >= 5% before Apply. PRD §0/§5/§17 is canonical.
 *
 * R15: local cost history is source of truth; D365 is optional and never blocks
 * factory release. Applying never overwrites in place — the trigger enqueues an
 * append-only pull job (source='d365_sync'). NUMERIC-exact: cost + Δ% strings are
 * surfaced verbatim from the server (no JS float math on a cost value here).
 * Δ colour is paired with sign + value text (never colour-only). All strings i18n.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';

import Textarea from '@monopilot/ui/Textarea';

import type { CostDiffRow } from '../_actions/load-d365-cost-import';
import { triggerCostImport } from '../_actions/trigger-cost-import';

export type CostImportCopy = {
  disabledBanner: string;
  exportOnlyBanner: string;
  mappingLink: string;
  mappingHref: string;
  settingsLink: string;
  settingsHref: string;
  sourceOfTruthNote: string;
  kpi: { connector: string; connectorValue: string; pulled: string; changed: string; over5: string };
  signoffLabel: string;
  signoffHelp: string;
  signoffPlaceholder: string;
  apply: string;
  applying: string;
  /** Template string with a literal `{jobId}` placeholder (RSC-serializable). */
  applied: string;
  duplicate: string;
  triggerForbidden: string;
  triggerError: string;
  col: { code: string; name: string; current: string; incoming: string; delta: string; source: string };
  empty: string;
  noChange: string;
};

const REASON_MIN = 10;

export function CostImport({
  d365Enabled,
  exportOnly = false,
  canTrigger,
  rows,
  counts,
  copy,
}: {
  d365Enabled: boolean;
  exportOnly?: boolean;
  canTrigger: boolean;
  rows: CostDiffRow[];
  counts: { changed: number; over5: number; same: number };
  copy: CostImportCopy;
}) {
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const anyOver5 = counts.over5 > 0;
  // Sign-off reason is required only when at least one row needs it.
  const reasonOk = anyOver5 ? reason.trim().length >= REASON_MIN : true;
  const applyDisabled = !d365Enabled || !canTrigger || rows.length === 0 || !reasonOk || pending;

  const onApply = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await triggerCostImport({ reason: reason.trim() || 'D365 cost import (no high-variance rows)' });
      if (res.ok) {
        setFeedback({ kind: 'ok', text: res.duplicate ? copy.duplicate : copy.applied.replace('{jobId}', res.jobId.slice(0, 8)) });
      } else if (res.error === 'forbidden') {
        setFeedback({ kind: 'error', text: copy.triggerForbidden });
      } else if (res.error === 'export_only_violation') {
        setFeedback({ kind: 'error', text: copy.exportOnlyBanner });
      } else {
        setFeedback({ kind: 'error', text: copy.triggerError });
      }
    });
  };

  // ── R15 export-only: inbound cost import is blocked even when D365 is enabled. ─
  if (exportOnly) {
    return (
      <div data-screen="settings-d365-cost-import" className="flex flex-col gap-3">
        <div role="note" data-testid="d365-cost-import-export-only" className="alert alert-amber" style={{ marginBottom: 0 }}>
          {copy.exportOnlyBanner}{' '}
          <Link
            href={copy.mappingHref}
            data-testid="d365-cost-import-mapping-link"
            style={{ color: 'var(--blue)', fontWeight: 500 }}
          >
            {copy.mappingLink}
          </Link>
        </div>
        <div role="note" data-testid="d365-cost-import-sot-note" className="alert alert-blue" style={{ marginBottom: 0 }}>
          {copy.sourceOfTruthNote}
        </div>
      </div>
    );
  }

  // ── D365 disabled: banner only; the rest of Settings stays usable. ───────────
  if (!d365Enabled) {
    return (
      <div data-screen="settings-d365-cost-import" className="flex flex-col gap-3">
        <div role="note" data-testid="d365-cost-import-disabled" className="alert alert-amber" style={{ marginBottom: 0 }}>
          {copy.disabledBanner}{' '}
          <Link
            href={copy.settingsHref}
            data-testid="d365-cost-import-settings-link"
            style={{ color: 'var(--blue)', fontWeight: 500 }}
          >
            {copy.settingsLink}
          </Link>
        </div>
        <div role="note" data-testid="d365-cost-import-sot-note" className="alert alert-blue" style={{ marginBottom: 0 }}>
          {copy.sourceOfTruthNote}
        </div>
      </div>
    );
  }

  return (
    <div data-screen="settings-d365-cost-import" className="flex flex-col gap-4">
      {/* KPI strip — canonical 3px-accent tiles, Inter values. */}
      <div data-testid="d365-cost-import-kpis" className="kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi green">
          <div className="kpi-label">{copy.kpi.connector}</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>
            {copy.kpi.connectorValue}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{copy.kpi.pulled}</div>
          <div className="kpi-value">{rows.length}</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">{copy.kpi.changed}</div>
          <div className="kpi-value">{counts.changed}</div>
        </div>
        <div className="kpi red">
          <div className="kpi-label">{copy.kpi.over5}</div>
          <div className="kpi-value">{counts.over5}</div>
        </div>
      </div>

      <div role="note" data-testid="d365-cost-import-sot-note" className="alert alert-blue" style={{ marginBottom: 0 }}>
        {copy.sourceOfTruthNote}
      </div>

      {/* Diff table. */}
      <div data-testid="d365-cost-import-diff" className="card" style={{ padding: 0, marginBottom: 0, overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <div data-testid="d365-cost-import-empty" className="empty-state">
            <div className="empty-state-icon">🔄</div>
            <div className="empty-state-body" style={{ marginBottom: 0 }}>
              {copy.empty}
            </div>
          </div>
        ) : (
          <table aria-label={copy.kpi.pulled}>
            <thead>
              <tr>
                <th scope="col">{copy.col.code}</th>
                <th scope="col">{copy.col.name}</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  {copy.col.current}
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  {copy.col.incoming}
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  {copy.col.delta}
                </th>
                <th scope="col">{copy.col.source}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const deltaNum = r.deltaPct != null ? Number(r.deltaPct) : null;
                const tone =
                  deltaNum == null || deltaNum === 0
                    ? 'var(--muted)'
                    : deltaNum > 0
                      ? 'var(--red)'
                      : 'var(--green)';
                const sign = deltaNum != null && deltaNum > 0 ? '+' : '';
                return (
                  <tr
                    key={r.itemId}
                    data-testid={`d365-cost-import-row-${r.itemCode}`}
                    data-needs-signoff={r.needsSignoff ? 'true' : 'false'}
                  >
                    <td className="mono">{r.itemCode}</td>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {r.current ?? '—'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {r.incoming ?? '—'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: tone }}>
                      {deltaNum != null ? `${sign}${r.deltaPct}%` : copy.noChange}
                      {r.needsSignoff ? <span className="badge badge-red" style={{ marginLeft: 6 }}>!</span> : null}
                    </td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>
                      {r.source ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm import: sign-off reason + Apply. */}
      <div data-testid="d365-cost-import-confirm" className="card" style={{ marginBottom: 0 }}>
        <label htmlFor="d365-cost-import-reason" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
          {copy.signoffLabel}
        </label>
        <p id="d365-cost-import-reason-help" className="helper" style={{ marginTop: 4 }}>
          {copy.signoffHelp}
        </p>
        <div style={{ marginTop: 8 }}>
          <Textarea
            id="d365-cost-import-reason"
            data-testid="d365-cost-import-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby="d365-cost-import-reason-help"
            className="form-input"
            placeholder={copy.signoffPlaceholder}
            rows={2}
          />
        </div>
        {anyOver5 && !reasonOk ? (
          <p data-testid="d365-cost-import-reason-required" className="helper" style={{ marginTop: 4, color: 'var(--amber-700)' }}>
            {copy.signoffHelp}
          </p>
        ) : null}
        {feedback ? (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            data-testid="d365-cost-import-feedback"
            className={`alert ${feedback.kind === 'error' ? 'alert-red' : 'alert-green'}`}
            style={{ marginTop: 12, marginBottom: 0 }}
          >
            {feedback.text}
          </div>
        ) : null}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="d365-cost-import-apply"
            disabled={applyDisabled}
            aria-disabled={applyDisabled}
            onClick={onApply}
            className="btn btn-primary"
          >
            {pending ? copy.applying : copy.apply}
          </button>
        </div>
      </div>
    </div>
  );
}
