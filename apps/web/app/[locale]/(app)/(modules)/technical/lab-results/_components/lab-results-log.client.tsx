'use client';

/**
 * T-088 — TEC-045 Lab Results Log (presentational client, read-only).
 *
 * Parity anchor (layout-primitive, spec-driven):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:451-546
 *   (lab_results_log_screen) — read-only banner + verdict filter pills + search +
 *   table with verdict pills, ATP RLU pass/fail bar, and an "Open in QA →"
 *   cross-link. PRD §0/§5/§17 is canonical.
 *
 * Ownership red-line: lab_results is Quality-owned. Technical READS ONLY — no
 * write/NCR/sign-off here. An add/request would delegate via the Quality bridge
 * or show QUALITY_BRIDGE_MISSING; this screen surfaces no write CTA.
 *
 * Pure props-in: all rows come from listLabResults (real Supabase). Local-only
 * filter/search state matches the prototype. Inline styles → Tailwind; raw table
 * → @monopilot/ui Table; verdict colour is never the sole signal (badge + text).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { LabResultLogRow } from '../_actions/list-lab-results';

const VERDICTS = ['all', 'pass', 'fail', 'inconclusive', 'pending', 'hold'] as const;
type VerdictFilter = (typeof VERDICTS)[number];

const verdictBadge: Record<string, BadgeVariant> = {
  pass: 'success',
  fail: 'danger',
  hold: 'danger',
  inconclusive: 'warning',
  pending: 'muted',
};

export type LabResultsCopy = {
  readOnlyNotice: string;
  openInQa: string;
  qaHref: string;
  searchPlaceholder: string;
  sourceNote: string;
  empty: string;
  verdictLabel: (v: VerdictFilter) => string;
  testTypeLabel: (t: string) => string;
  col: { labId: string; taken: string; fgLot: string; test: string; reading: string; verdict: string; action: string };
  rluUnit: string;
  thresholdLabel: (n: string) => string;
  qualitativeLabel: string;
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

export function LabResultsLog({ rows, copy }: { rows: LabResultLogRow[]; copy: LabResultsCopy }) {
  const [filter, setFilter] = useState<VerdictFilter>('all');
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.resultStatus] = (c[r.resultStatus] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.resultStatus !== filter) return false;
      if (!needle) return true;
      const hay = [r.id, r.itemCode ?? '', r.itemName ?? '', r.workOrderId ?? '', r.testCode ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, filter, q]);

  return (
    <div data-screen="technical-lab-results" className="flex flex-col gap-4">
      {/* Read-only federated read model — write/NCR/CoA live in 09-QUALITY. */}
      <div
        role="note"
        data-testid="lab-results-readonly-notice"
        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
      >
        {copy.readOnlyNotice}{' '}
        <Link href={copy.qaHref} data-testid="lab-results-qa-link" className="font-medium text-sky-700 underline">
          {copy.openInQa}
        </Link>
      </div>

      {/* Verdict filter pills + search. */}
      <div className="flex flex-wrap items-center gap-2">
        <div data-testid="lab-results-pills" className="flex flex-wrap gap-1.5">
          {VERDICTS.map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`lab-results-pill-${v}`}
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                filter === v
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {copy.verdictLabel(v)}
              <span className="tabular-nums opacity-60">{counts[v] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto w-64">
          <Input
            data-testid="lab-results-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
          />
        </div>
      </div>

      <Card data-testid="lab-results-table-card" className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm">
        {visible.length === 0 ? (
          <div data-testid="lab-results-empty" className="px-4 py-8 text-center text-sm text-slate-500">
            {copy.empty}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{copy.col.labId}</TableHead>
                <TableHead scope="col">{copy.col.taken}</TableHead>
                <TableHead scope="col">{copy.col.fgLot}</TableHead>
                <TableHead scope="col">{copy.col.test}</TableHead>
                <TableHead scope="col">{copy.col.reading}</TableHead>
                <TableHead scope="col">{copy.col.verdict}</TableHead>
                <TableHead scope="col">{copy.col.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const reading = r.resultValue;
                const threshold = r.thresholdRlu;
                const isAtp = r.testType === 'atp_swab' && reading != null;
                // NUMERIC-exact compare done as decimals via Number ONLY for the
                // bar geometry / pass-fail tint — the displayed value stays the
                // verbatim string and the verdict comes from Quality (resultStatus).
                const readingNum = reading != null ? Number(reading) : null;
                const thresholdNum = threshold != null ? Number(threshold) : null;
                const over =
                  readingNum != null && thresholdNum != null ? readingNum > thresholdNum : false;
                return (
                  <TableRow
                    key={r.id}
                    data-testid={`lab-results-row-${r.id}`}
                    data-verdict={r.resultStatus}
                  >
                    <TableCell className="font-mono text-xs">{r.id.slice(0, 12)}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{formatWhen(r.testedAt)}</TableCell>
                    <TableCell className="text-sm">
                      <span className="block">{r.itemCode ? `${r.itemCode} ${r.itemName ?? ''}`.trim() : '—'}</span>
                      <span className="mt-0.5 block font-mono text-xs text-slate-500">
                        {r.workOrderId ? r.workOrderId.slice(0, 12) : '—'}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="block">{copy.testTypeLabel(r.testType)}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-slate-500">{r.labProvider ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      {isAtp && readingNum != null ? (
                        <div data-testid={`lab-results-atp-${r.id}`}>
                          <div
                            className={`font-mono text-sm font-semibold ${over ? 'text-red-700' : 'text-emerald-700'}`}
                          >
                            {reading} {copy.rluUnit}
                          </div>
                          {thresholdNum != null ? (
                            <>
                              <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100">
                                <div
                                  className={`h-full ${over ? 'bg-red-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${Math.min(100, (readingNum / (thresholdNum * 1.5)) * 100)}%` }}
                                  aria-hidden="true"
                                />
                              </div>
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                {copy.thresholdLabel(threshold ?? '')}
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : reading != null ? (
                        <span className="font-mono text-sm">
                          {reading} {r.resultUnit ?? ''}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">{copy.qualitativeLabel}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={verdictBadge[r.resultStatus] ?? 'muted'}>
                        {copy.verdictLabel(r.resultStatus as VerdictFilter)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={r.qualityResultId ? `${copy.qaHref}?result=${encodeURIComponent(r.qualityResultId)}` : copy.qaHref}
                        data-testid={`lab-results-open-qa-${r.id}`}
                        className="text-sm font-medium text-sky-600 hover:text-sky-700"
                      >
                        {copy.openInQa}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <div
        role="note"
        data-testid="lab-results-source-note"
        className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900"
      >
        {copy.sourceNote}
      </div>
    </div>
  );
}
