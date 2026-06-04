'use client';

/**
 * T-087 — TEC-031 Regulatory Compliance Dashboard (presentational client).
 *
 * Parity anchor (layout-primitive, spec-driven):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:359-446
 *   (regulatory_compliance_dashboard_screen) — per-regulation KPI strip + coverage
 *   bars + per-FG flag table with a "Route →" action that dispatches to the owning
 *   module (never auto-resolved here). PRD §0/§5/§17 is canonical.
 *
 * Pure props-in component (all data from loadCompliance via the server page); no
 * mocks. Inline prototype styles → Tailwind; raw table → @monopilot/ui Table;
 * status colour is never the sole signal (badge tone + text label). All visible
 * strings come through next-intl. FG canonical (no FA aliases).
 */

import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type {
  ComplianceFlag,
  RegulationCoverage,
  RegulationTone,
} from '../_actions/shared';

export type ComplianceCopy = {
  routingNotice: string;
  coverageTitle: string;
  flagsTitle: (count: number) => string;
  flagsHint: string;
  col: { fg: string; regulation: string; issue: string; severity: string; action: string };
  route: string;
  emptyTitle: string;
  emptyBody: string;
  regulationLabel: (code: RegulationCoverage['code']) => string;
  regulationScope: (code: RegulationCoverage['code']) => string;
  issueLabel: (key: ComplianceFlag['issueKey']) => string;
  remediationLabel: (key: ComplianceFlag['issueKey']) => string;
  severityLabel: (s: ComplianceFlag['severity']) => string;
  gapsLabel: (n: number) => string;
};

const toneBadge: Record<RegulationTone, BadgeVariant> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
};
const toneBar: Record<RegulationTone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};
const severityBadge: Record<ComplianceFlag['severity'], BadgeVariant> = {
  high: 'danger',
  medium: 'warning',
  low: 'muted',
};

export function ComplianceDashboard({
  regulations,
  flags,
  copy,
}: {
  regulations: RegulationCoverage[];
  flags: ComplianceFlag[];
  copy: ComplianceCopy;
}) {
  return (
    <div data-screen="technical-compliance" className="flex flex-col gap-4">
      {/* Routing-only notice — this is remediation routing, not legal advice. */}
      <div
        role="note"
        data-testid="compliance-routing-notice"
        className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900"
      >
        {copy.routingNotice}
      </div>

      {/* KPI strip — one tile per regulation (real coverage %). */}
      <div
        data-testid="compliance-kpi-strip"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {regulations.map((r) => (
          <Card
            key={r.code}
            data-testid={`compliance-kpi-${r.code}`}
            data-tone={r.tone}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <span className="text-xs font-medium text-slate-500">{copy.regulationLabel(r.code)}</span>
            <span className="mt-1 block text-2xl font-semibold tabular-nums text-slate-950">
              {r.coveragePct}%
            </span>
            <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <Badge variant={toneBadge[r.tone]}>{copy.gapsLabel(r.gaps)}</Badge>
            </span>
          </Card>
        ))}
      </div>

      {/* Coverage-by-regulation bars. */}
      <Card data-testid="compliance-coverage" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">{copy.coverageTitle}</h2>
        <div className="mt-3 flex flex-col gap-3">
          {regulations.map((r) => (
            <div key={r.code} data-testid={`compliance-bar-${r.code}`}>
              <div className="flex items-center justify-between text-xs">
                <span>
                  <span className="font-mono font-semibold text-slate-900">{copy.regulationLabel(r.code)}</span>
                  <span className="text-slate-500"> · {copy.regulationScope(r.code)}</span>
                </span>
                <span className="font-mono text-slate-700">
                  {r.covered}/{r.total} · <b>{r.coveragePct}%</b>
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full ${toneBar[r.tone]}`}
                  style={{ width: `${r.coveragePct}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Per-FG flags table with Route → action. */}
      <Card data-testid="compliance-flags" className="rounded-xl border border-slate-200 bg-white p-0 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">{copy.flagsTitle(flags.length)}</h2>
          <span className="text-xs text-slate-500">{copy.flagsHint}</span>
        </div>
        {flags.length === 0 ? (
          <div data-testid="compliance-flags-empty" className="px-4 py-8 text-center text-sm text-slate-500">
            {copy.emptyBody}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{copy.col.fg}</TableHead>
                <TableHead scope="col">{copy.col.regulation}</TableHead>
                <TableHead scope="col">{copy.col.issue}</TableHead>
                <TableHead scope="col">{copy.col.severity}</TableHead>
                <TableHead scope="col">{copy.col.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flags.map((f) => (
                <TableRow key={f.id} data-testid={`compliance-flag-${f.id}`} data-severity={f.severity}>
                  <TableCell className="font-mono text-xs">{f.fg}</TableCell>
                  <TableCell className="font-mono text-xs">{copy.regulationLabel(f.regulation)}</TableCell>
                  <TableCell className="text-sm">
                    <span className="block">{copy.issueLabel(f.issueKey)}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{copy.remediationLabel(f.issueKey)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={severityBadge[f.severity]}>{copy.severityLabel(f.severity)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={f.routeHref}
                      data-testid={`compliance-route-${f.id}`}
                      data-route-to={f.routeTo}
                      className="text-sm font-medium text-sky-600 hover:text-sky-700"
                    >
                      {copy.route}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
