'use client';

/**
 * Fala-3 — SensoryScreen (sensory_screen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:259-350 (SensoryScreen)
 *
 * Translation notes (prototype-index-npd.json#sensory_screen):
 *   - header "Sensory panel — Trial T-0xx" + subtitle "N panelists · blind
 *     tasting · <date>" + "Export scores" pill              → Card head + Button
 *   - LEFT hand-rolled SVG radar (.radar-wrap)              → SensoryRadar (1:1 SVG)
 *   - RIGHT attribute <table> (ATTRIBUTE / SCORE /10 bar+number / vs benchmark ±)
 *                                                            → @monopilot/ui Table
 *   - low scores render the bar amber/red (score < 7.5 = amber, < 6 = red)
 *   - highlighted Overall summary row "✓ Above benchmark"   → highlighted table row
 *   - "Panelist comments" list (panelist code bold + quote) → second Card
 *
 * READ-ONLY (ownership boundary): sensory is owned by 03-Technical; this NPD stage
 * never writes sensory. No write affordance, no Server Action mutation. The
 * "Export scores" CTA is rendered for parity but is a layout-only, non-write
 * control (download of already-read scores) — disabled when there is no panel.
 *
 * Scores are rendered straight from NUMERIC decimal STRINGS (never JS floats). The
 * ONLY numeric coercions are layout-only (bar fill %, radar radius) and are never
 * persisted or shown as a value. RBAC (`permission_denied`) is resolved
 * server-side in page.tsx and is never trusted from the client.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { SensoryRadar, type SensoryRadarPoint } from './sensory-radar';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type SensoryAttributeView = {
  attributeName: string;
  /** Score /10 as a decimal STRING (NUMERIC); null = unscored. */
  scoreOutOf10: string | null;
  /** Signed ± delta vs benchmark as a decimal STRING; null = no benchmark. */
  vsBenchmark: string | null;
  displayOrder: number;
};

export type SensoryCommentView = {
  panelistCode: string;
  comment: string;
  displayOrder: number;
};

export type SensoryScreenData = {
  panelId: string;
  productCode: string;
  productName: string;
  panelDate: string | null;
  panelistCount: number | null;
  benchmarkProductCode: string | null;
  /** Overall panel score /10 as a decimal STRING; null = unset. */
  overallScore: string | null;
  status: string;
  attributes: SensoryAttributeView[];
  comments: SensoryCommentView[];
};

export type SensoryLabels = {
  title: string;
  /** "{count}" + "{date}" replaced client-side. */
  subtitle: string;
  exportScores: string;
  colAttribute: string;
  colScore: string;
  colVsBenchmark: string;
  overall: string;
  /** "{score}" replaced client-side. */
  aboveBenchmark: string;
  /** "{score}" replaced client-side. */
  belowBenchmark: string;
  commentsTitle: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
};

/** Display a decimal STRING score to 1 dp (string slicing, no float math). */
function formatScore(value: string | null): string {
  if (value === null) return '—';
  const negative = value.trim().startsWith('-');
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [intPart, fracRaw = ''] = unsigned.split('.');
  const frac = (fracRaw + '0').slice(0, 1);
  return `${negative ? '-' : ''}${intPart}.${frac}`;
}

/** Display a signed ± delta decimal STRING to 1 dp (no float math). */
function formatDelta(value: string | null): string {
  if (value === null) return '—';
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracRaw = ''] = unsigned.split('.');
  const frac = (fracRaw + '0').slice(0, 1);
  const sign = negative ? '-' : '+';
  return `${sign}${intPart}.${frac}`;
}

/** Layout-only fill % for the score bar (numeric is fine — NOT a value out). */
function barFillPct(score: string | null): number {
  if (score === null) return 0;
  const v = Number(score);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v * 10));
}

type ScoreTone = 'good' | 'low' | 'bad';

/** Tone for the score bar: >=7.5 green, >=6 amber (low), else red (bad). */
function scoreTone(score: string | null): ScoreTone {
  if (score === null) return 'bad';
  const v = Number(score);
  if (!Number.isFinite(v)) return 'bad';
  if (v >= 7.5) return 'good';
  if (v >= 6) return 'low';
  return 'bad';
}

function toneBarClass(tone: ScoreTone): string {
  switch (tone) {
    case 'good':
      return 'bg-emerald-500';
    case 'low':
      return 'bg-amber-500';
    default:
      return 'bg-red-500';
  }
}

/** Whether a ± delta string is non-negative (string-only, no float). */
function deltaNonNegative(value: string | null): boolean {
  if (value === null) return false;
  return !/^-(?!0(\.0+)?$)/.test(value.trim());
}

/** Replace `{token}` placeholders in an i18n string (no inline strings). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));
}

function StateNotice({ state, labels }: { state: PageState; labels: SensoryLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card empty-state">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card empty-state" data-testid="sensory-empty">
        <div className="empty-state-icon" aria-hidden="true">👅</div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red" data-testid="sensory-error">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red" data-testid="sensory-forbidden">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  return null;
}

export function SensoryScreen({
  state = 'ready',
  data,
  labels,
}: {
  state?: PageState;
  data: SensoryScreenData | null;
  labels: SensoryLabels;
}) {
  if (state !== 'ready' || !data) {
    return (
      <main
        data-testid="sensory-screen"
        aria-labelledby="sensory-title"
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <header>
          <h1 id="sensory-title" className="page-title">
            {labels.title}
          </h1>
        </header>
        <StateNotice state={state} labels={labels} />
      </main>
    );
  }

  const radarPoints: SensoryRadarPoint[] = data.attributes.map((a) => ({
    attribute: a.attributeName,
    score: a.scoreOutOf10,
  }));

  // Overall "✓ Above benchmark" decision (prototype's highlighted summary row).
  // A panel is shown above benchmark only when it scored against a benchmark
  // product AND it is not net-negative across attributes (at least one positive
  // ± and no all-negative set). String-only sign checks — no float math.
  const overallIsAbove = (() => {
    if (data.benchmarkProductCode === null) return false;
    let anyNeg = false;
    let anyPos = false;
    for (const a of data.attributes) {
      if (a.vsBenchmark === null) continue;
      if (deltaNonNegative(a.vsBenchmark)) anyPos = true;
      else anyNeg = true;
    }
    return anyPos || !anyNeg;
  })();

  return (
    <main
      data-testid="sensory-screen"
      aria-labelledby="sensory-title"
      className="mx-auto w-full max-w-6xl space-y-4 p-6"
    >
      <Card data-testid="sensory-panel-card">
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle id="sensory-title">
              {labels.title} — {data.productName}
            </CardTitle>
            <p className="mt-1 text-xs muted" data-testid="sensory-subtitle">
              {interpolate(labels.subtitle, {
                count: data.panelistCount !== null ? String(data.panelistCount) : '—',
                date: data.panelDate ?? '—',
              })}
            </p>
          </div>
          <Button type="button" className="btn-secondary btn-sm" data-testid="sensory-export">
            {labels.exportScores}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="shrink-0">
              <SensoryRadar points={radarPoints} />
            </div>

            <div className="min-w-0 flex-1">
              <Table data-testid="sensory-attr-table">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.colAttribute}</TableHead>
                    <TableHead scope="col">{labels.colScore}</TableHead>
                    <TableHead scope="col">{labels.colVsBenchmark}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.attributes.map((a) => {
                    const tone = scoreTone(a.scoreOutOf10);
                    const deltaPos = deltaNonNegative(a.vsBenchmark);
                    return (
                      <TableRow key={a.attributeName} data-testid="sensory-attr-row" data-tone={tone}>
                        <TableCell className="font-medium">{a.attributeName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="relative h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-slate-100"
                              role="img"
                              aria-label={`${a.attributeName}: ${formatScore(a.scoreOutOf10)} / 10`}
                            >
                              <span
                                aria-hidden="true"
                                data-testid="sensory-score-bar"
                                data-tone={tone}
                                className={['absolute inset-y-0 left-0 rounded-full', toneBarClass(tone)].join(' ')}
                                style={{ width: `${barFillPct(a.scoreOutOf10)}%` }}
                              />
                            </span>
                            <span className="font-mono text-xs tabular-nums">{formatScore(a.scoreOutOf10)}</span>
                          </div>
                        </TableCell>
                        <TableCell
                          className={[
                            'font-mono text-sm tabular-nums',
                            a.vsBenchmark === null
                              ? 'muted'
                              : deltaPos
                                ? 'text-emerald-600'
                                : 'muted',
                          ].join(' ')}
                          data-testid="sensory-vs-benchmark"
                        >
                          {formatDelta(a.vsBenchmark)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  <TableRow data-testid="sensory-overall-row" className="bg-slate-50">
                    <TableCell className="font-semibold">{labels.overall}</TableCell>
                    <TableCell className="font-mono font-semibold tabular-nums">
                      {formatScore(data.overallScore)} / 10
                    </TableCell>
                    <TableCell>
                      {overallIsAbove ? (
                        <Badge
                          variant="success"
                          className="badge-green"
                          data-testid="sensory-above-benchmark"
                        >
                          {interpolate(labels.aboveBenchmark, {
                            score: formatScore(data.overallScore),
                          })}
                        </Badge>
                      ) : (
                        <span className="muted font-mono text-sm" data-testid="sensory-below-benchmark">
                          {interpolate(labels.belowBenchmark, {
                            score: formatScore(data.overallScore),
                          })}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="sensory-comments-card">
        <CardHeader>
          <CardTitle>{labels.commentsTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.comments.length === 0 ? (
            <p className="text-sm muted">—</p>
          ) : (
            <ul className="space-y-2 text-sm leading-relaxed muted">
              {data.comments.map((c, i) => (
                <li key={`${c.panelistCode}-${i}`} data-testid="sensory-comment">
                  <strong className="text-slate-700">{c.panelistCode}:</strong>{' '}
                  <span>&ldquo;{c.comment}&rdquo;</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default SensoryScreen;
