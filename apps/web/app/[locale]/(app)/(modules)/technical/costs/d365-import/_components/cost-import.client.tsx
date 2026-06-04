'use client';

/**
 * T-089 — TEC-052 Cost Import from D365 (presentational + trigger client).
 *
 * Parity anchor (layout-primitive, spec-driven):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:551-648
 *   (cost_import_d365_screen) — D365-disabled banner that keeps the rest of
 *   Technical usable, KPI tiles, diff table with Δ% colour-coding, and a sign-off
 *   ReasonInput required on |Δ| >= 5% before Apply. PRD §0/§5/§17 is canonical.
 *
 * R15: local cost history is source of truth; D365 is optional and never blocks
 * factory release. Applying never overwrites in place — the trigger enqueues an
 * append-only pull job (source='d365_sync'). NUMERIC-exact: cost + Δ% strings are
 * surfaced verbatim from the server (no JS float math on a cost value here).
 *
 * Inline prototype styles → Tailwind; raw <select>/<input> → @monopilot/ui;
 * Δ colour is paired with sign + value text (never colour-only). All strings i18n.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { Badge } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';
import Textarea from '@monopilot/ui/Textarea';

import type { CostDiffRow } from '../_actions/load-d365-cost-import';
import { triggerCostImport } from '../_actions/trigger-cost-import';

export type CostImportCopy = {
  disabledBanner: string;
  settingsLink: string;
  settingsHref: string;
  sourceOfTruthNote: string;
  kpi: { connector: string; connectorValue: string; pulled: string; changed: string; over5: string };
  signoffLabel: string;
  signoffHelp: string;
  signoffPlaceholder: string;
  apply: string;
  applying: string;
  applied: (jobId: string) => string;
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
  canTrigger,
  rows,
  counts,
  copy,
}: {
  d365Enabled: boolean;
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
        setFeedback({ kind: 'ok', text: res.duplicate ? copy.duplicate : copy.applied(res.jobId.slice(0, 8)) });
      } else if (res.error === 'forbidden') {
        setFeedback({ kind: 'error', text: copy.triggerForbidden });
      } else {
        setFeedback({ kind: 'error', text: copy.triggerError });
      }
    });
  };

  // ── D365 disabled: banner only; the rest of Technical stays usable. ──────────
  if (!d365Enabled) {
    return (
      <div data-screen="technical-d365-cost-import" className="flex flex-col gap-4">
        <div
          role="note"
          data-testid="d365-cost-import-disabled"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
        >
          {copy.disabledBanner}{' '}
          <Link href={copy.settingsHref} data-testid="d365-cost-import-settings-link" className="font-medium text-sky-700 underline">
            {copy.settingsLink}
          </Link>
        </div>
        <div
          role="note"
          data-testid="d365-cost-import-sot-note"
          className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900"
        >
          {copy.sourceOfTruthNote}
        </div>
      </div>
    );
  }

  return (
    <div data-screen="technical-d365-cost-import" className="flex flex-col gap-4">
      {/* KPI strip. */}
      <div data-testid="d365-cost-import-kpis" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">{copy.kpi.connector}</span>
          <span className="mt-1 block text-lg font-semibold text-emerald-700">{copy.kpi.connectorValue}</span>
        </Card>
        <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">{copy.kpi.pulled}</span>
          <span className="mt-1 block text-2xl font-semibold tabular-nums text-slate-950">{rows.length}</span>
        </Card>
        <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">{copy.kpi.changed}</span>
          <span className="mt-1 block text-2xl font-semibold tabular-nums text-amber-700">{counts.changed}</span>
        </Card>
        <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-medium text-slate-500">{copy.kpi.over5}</span>
          <span className="mt-1 block text-2xl font-semibold tabular-nums text-red-700">{counts.over5}</span>
        </Card>
      </div>

      <div
        role="note"
        data-testid="d365-cost-import-sot-note"
        className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900"
      >
        {copy.sourceOfTruthNote}
      </div>

      {/* Diff table. */}
      <Card data-testid="d365-cost-import-diff" className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm">
        {rows.length === 0 ? (
          <div data-testid="d365-cost-import-empty" className="px-4 py-8 text-center text-sm text-slate-500">
            {copy.empty}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{copy.col.code}</TableHead>
                <TableHead scope="col">{copy.col.name}</TableHead>
                <TableHead scope="col" className="text-right">{copy.col.current}</TableHead>
                <TableHead scope="col" className="text-right">{copy.col.incoming}</TableHead>
                <TableHead scope="col" className="text-right">{copy.col.delta}</TableHead>
                <TableHead scope="col">{copy.col.source}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const deltaNum = r.deltaPct != null ? Number(r.deltaPct) : null;
                const tone =
                  deltaNum == null || deltaNum === 0
                    ? 'text-slate-500'
                    : deltaNum > 0
                      ? 'text-red-700'
                      : 'text-emerald-700';
                const sign = deltaNum != null && deltaNum > 0 ? '+' : '';
                return (
                  <TableRow
                    key={r.itemId}
                    data-testid={`d365-cost-import-row-${r.itemCode}`}
                    data-needs-signoff={r.needsSignoff ? 'true' : 'false'}
                  >
                    <TableCell className="font-mono text-xs">{r.itemCode}</TableCell>
                    <TableCell className="text-sm">{r.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.current ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{r.incoming ?? '—'}</TableCell>
                    <TableCell className={`text-right font-mono text-sm font-semibold ${tone}`}>
                      {deltaNum != null ? `${sign}${r.deltaPct}%` : copy.noChange}
                      {r.needsSignoff ? <span className="ml-1 align-middle"><Badge variant="danger">!</Badge></span> : null}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-500">{r.source ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Confirm import: sign-off reason + Apply. */}
      <Card data-testid="d365-cost-import-confirm" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label htmlFor="d365-cost-import-reason" className="mt-1 block text-sm font-medium text-slate-900">
          {copy.signoffLabel}
        </label>
        <p id="d365-cost-import-reason-help" className="mt-1 text-xs text-slate-500">
          {copy.signoffHelp}
        </p>
        <div className="mt-2">
          <Textarea
            id="d365-cost-import-reason"
            data-testid="d365-cost-import-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby="d365-cost-import-reason-help"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder={copy.signoffPlaceholder}
            rows={2}
          />
        </div>
        {anyOver5 && !reasonOk ? (
          <p data-testid="d365-cost-import-reason-required" className="mt-1 text-xs text-amber-700">
            {copy.signoffHelp}
          </p>
        ) : null}
        {feedback ? (
          <p
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            data-testid="d365-cost-import-feedback"
            className={[
              'mt-3 rounded-lg px-3 py-2 text-xs',
              feedback.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
            ].join(' ')}
          >
            {feedback.text}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            data-testid="d365-cost-import-apply"
            disabled={applyDisabled}
            aria-disabled={applyDisabled}
            onClick={onApply}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? copy.applying : copy.apply}
          </button>
        </div>
      </Card>
    </div>
  );
}
