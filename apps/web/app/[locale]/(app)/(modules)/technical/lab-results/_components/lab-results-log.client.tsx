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

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../../lib/shared/download';
import type { LabTestType } from '../../../../../../../lib/technical/lab/read-model';
import type { LabResultLogRow } from '../_actions/list-lab-results';

export const VERDICTS = ['all', 'pass', 'fail', 'inconclusive', 'pending', 'hold'] as const;
type VerdictFilter = (typeof VERDICTS)[number];

// 5-tone semantic badge mapping: pass → ok(green), fail/hold → bad(red),
// inconclusive → warn(amber), pending → neutral(gray).
const verdictBadge: Record<string, string> = {
  pass: 'badge-green',
  fail: 'badge-red',
  hold: 'badge-red',
  inconclusive: 'badge-amber',
  pending: 'badge-gray',
};

// Count-pill tone for the .tabs-counted filter.
const verdictTabTone: Record<string, string> = {
  all: '',
  pass: 'tone-ok',
  fail: 'tone-bad',
  hold: 'tone-bad',
  inconclusive: 'tone-warn',
  pending: 'tone-neutral',
};

export type LabResultsCopy = {
  readOnlyNotice: string;
  openInQa: string;
  qaHref: string;
  searchPlaceholder: string;
  sourceNote: string;
  empty: string;
  verdictLabel: Record<VerdictFilter, string>;
  testTypeLabel: Record<LabTestType, string>;
  col: { labId: string; taken: string; fgLot: string; test: string; reading: string; verdict: string; action: string };
  rluUnit: string;
  /** Template string with a literal `{value}` placeholder (RSC-serializable). */
  thresholdLabel: string;
  qualitativeLabel: string;
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

function formatReading(r: LabResultLogRow, copy: LabResultsCopy): string {
  if (r.resultValue == null) return copy.qualitativeLabel;
  if (r.testType === 'atp_swab') return `${r.resultValue} ${copy.rluUnit}`;
  return `${r.resultValue} ${r.resultUnit ?? ''}`.trim();
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

  const exportVisible = () => {
    downloadCsv(
      toCsv(
        [
          copy.col.labId,
          copy.col.taken,
          copy.col.fgLot,
          copy.col.test,
          copy.col.reading,
          copy.col.verdict,
          copy.col.action,
        ],
        visible.map((r) => [
          r.id.slice(0, 12),
          formatWhen(r.testedAt),
          [
            r.itemCode ? `${r.itemCode} ${r.itemName ?? ''}`.trim() : '—',
            r.workOrderId ? r.workOrderId.slice(0, 12) : '—',
          ].join(' / '),
          `${copy.testTypeLabel[r.testType]} / ${r.labProvider ?? '—'}`,
          formatReading(r, copy),
          copy.verdictLabel[r.resultStatus as VerdictFilter],
          copy.openInQa,
        ]),
      ),
      `technical-lab-results-${isoDateStamp()}.csv`,
    );
  };

  return (
    <div data-screen="technical-lab-results" className="flex flex-col gap-4">
      {/* Read-only federated read model — write/NCR/CoA live in 09-QUALITY. */}
      <div role="note" data-testid="lab-results-readonly-notice" className="alert alert-amber">
        <b>{copy.readOnlyNotice}</b>{' '}
        <Link href={copy.qaHref} data-testid="lab-results-qa-link" style={{ color: 'var(--blue)' }}>
          {copy.openInQa}
        </Link>
      </div>

      {/* Verdict filter — .tabs-counted with count pills + search. */}
      <div className="flex flex-wrap items-center gap-3">
        <div data-testid="lab-results-pills" className="tabs-counted" role="tablist" aria-label="Verdict">
          {VERDICTS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              data-testid={`lab-results-pill-${v}`}
              aria-selected={filter === v}
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
              className={`tabs-counted-tab${filter === v ? ' active' : ''}`}
            >
              <span>{copy.verdictLabel[v]}</span>
              <span className={`tabs-counted-pill ${verdictTabTone[v] ?? ''}`}>{counts[v] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto w-64">
          <input
            type="search"
            data-testid="lab-results-search"
            className="form-input mono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
          />
        </div>
        <a
          href="#"
          data-testid="lab-results-export-csv"
          onClick={(e) => {
            e.preventDefault();
            exportVisible();
          }}
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <span aria-hidden="true">⇩</span>
          <span>Export CSV</span>
        </a>
      </div>

      <div data-testid="lab-results-table-card" className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {visible.length === 0 ? (
          <div data-testid="lab-results-empty" className="empty-state">
            <div className="empty-state-icon">🧪</div>
            <div className="empty-state-body">{copy.empty}</div>
          </div>
        ) : (
          <table aria-label={copy.col.labId}>
            <thead>
              <tr>
                <th scope="col" style={{ width: 130 }}>
                  {copy.col.labId}
                </th>
                <th scope="col" style={{ width: 150 }}>
                  {copy.col.taken}
                </th>
                <th scope="col">{copy.col.fgLot}</th>
                <th scope="col">{copy.col.test}</th>
                <th scope="col" style={{ width: 150 }}>
                  {copy.col.reading}
                </th>
                <th scope="col" style={{ width: 110 }}>
                  {copy.col.verdict}
                </th>
                <th scope="col" style={{ width: 110 }}>
                  {copy.col.action}
                </th>
              </tr>
            </thead>
            <tbody>
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
                const failTint = r.resultStatus === 'fail' || r.resultStatus === 'hold';
                return (
                  <tr
                    key={r.id}
                    data-testid={`lab-results-row-${r.id}`}
                    data-verdict={r.resultStatus}
                    style={failTint ? { background: 'var(--red-050a)' } : undefined}
                  >
                    <td className="mono text-xs">{r.id.slice(0, 12)}</td>
                    <td className="mono text-xs" style={{ color: 'var(--muted)' }}>
                      {formatWhen(r.testedAt)}
                    </td>
                    <td className="text-sm">
                      <span className="block">{r.itemCode ? `${r.itemCode} ${r.itemName ?? ''}`.trim() : '—'}</span>
                      <span className="mono mt-0.5 block text-xs" style={{ color: 'var(--muted)' }}>
                        {r.workOrderId ? r.workOrderId.slice(0, 12) : '—'}
                      </span>
                    </td>
                    <td className="text-xs">
                      <span className="block">{copy.testTypeLabel[r.testType]}</span>
                      <span className="mono mt-0.5 block text-[11px]" style={{ color: 'var(--muted)' }}>
                        {r.labProvider ?? '—'}
                      </span>
                    </td>
                    <td>
                      {isAtp && readingNum != null ? (
                        <div data-testid={`lab-results-atp-${r.id}`}>
                          <div
                            className="mono text-sm font-semibold"
                            style={{ color: over ? 'var(--red-700)' : 'var(--green-700)' }}
                          >
                            {reading} {copy.rluUnit}
                          </div>
                          {thresholdNum != null ? (
                            <>
                              <div
                                className="mt-1 h-2 overflow-hidden rounded"
                                style={{ background: 'var(--gray-100)' }}
                              >
                                <div
                                  className="h-full"
                                  style={{
                                    width: `${Math.min(100, (readingNum / (thresholdNum * 1.5)) * 100)}%`,
                                    background: over ? 'var(--red)' : 'var(--green)',
                                  }}
                                  aria-hidden="true"
                                />
                              </div>
                              <div className="mt-0.5 text-[10px]" style={{ color: 'var(--muted)' }}>
                                {copy.thresholdLabel.replace('{value}', threshold ?? '')}
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : reading != null ? (
                        <span className="mono text-sm">
                          {reading} {r.resultUnit ?? ''}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          {copy.qualitativeLabel}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${verdictBadge[r.resultStatus] ?? 'badge-gray'}`}>
                        {copy.verdictLabel[r.resultStatus as VerdictFilter]}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={r.qualityResultId ? `${copy.qaHref}?result=${encodeURIComponent(r.qualityResultId)}` : copy.qaHref}
                        data-testid={`lab-results-open-qa-${r.id}`}
                        className="text-sm font-medium"
                        style={{ color: 'var(--blue)' }}
                      >
                        {copy.openInQa}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div role="note" data-testid="lab-results-source-note" className="alert alert-blue">
        {copy.sourceNote}
      </div>
    </div>
  );
}
