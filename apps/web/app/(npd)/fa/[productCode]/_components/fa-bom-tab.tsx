'use client';

/**
 * FaBomTab — SCR-03h "BOM (computed view)" FG detail tab (Lane 12).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:840-886 (FABOMTab)
 *   - card head: title "BOM (computed view)" + muted read-only note + an
 *     "Export BOM CSV" ghost button (the prototype's "Build D365 →" primary is
 *     NOT reproduced — D365 build is a write surface owned elsewhere; this tab is
 *     read-only).
 *   - table columns 1:1: Type (RM→blue / PM→violet badge) · Code (mono) · Name ·
 *     Qty (mono num) · Stage (muted) · Source (muted) · D365 status (✓ Found
 *     green / ⚠ No cost amber / ✗ Missing red).
 *
 * Translation notes (prototype → production):
 *   - the prototype's hardcoded `rows` array → the REAL org-scoped BOM read
 *     (get-fa-bom.ts → public.get_fa_bom + d365_import_cache, owned by this lane,
 *     imported by page.tsx — never authored in the client).
 *   - READ-ONLY: the shared bom_headers/bom_lines tables are Technical-owned for
 *     writes. This tab never mutates them. The empty state links to /technical/bom
 *     (the canonical write screens stay in Technical per the product decision —
 *     this is a shortcut, not a write surface).
 *
 * Export CSV: wires the previously-dead-code, fully-tested
 * `apps/web/app/(npd)/fa/actions/bom-export-csv.ts` (bom_export_csv → web
 * Response). The button reads the action's CSV body and triggers a client-side
 * blob download (the repo's established pattern — nutrition-screen / users-screen
 * / schema-browser). The action itself re-enforces npd.fa.read + npd.bom.export
 * server-side, so the button is convenience only.
 *
 * RBAC: `state === 'permission_denied'` is server-resolved (page.tsx, npd.fa.read,
 * the SAME gate every other FA tab uses) — never client-trusted.
 *
 * i18n: every visible string is a prop (npd.faBomTab namespace, resolved
 * server-side via the page picker). No inline English literals.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';

import type { FaBomLine, FaBomVersion } from '../_actions/fa-bom-types';

export type FaBomTabState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type FaBomTabLabels = {
  title: string;
  /** muted read-only note under the title. */
  readOnlyNote: string;
  /** Export CSV button label. */
  exportCsv: string;
  exporting: string;
  exportError: string;
  /** version header: "v{version} · {status} · {count} lines". */
  versionLine: string;
  /** Status label map (lowercased BOM header status → human label). */
  statusLabels: Record<string, string>;
  /** table column headers. */
  colType: string;
  colCode: string;
  colName: string;
  colQty: string;
  colStage: string;
  colSource: string;
  colD365: string;
  /** D365 status badge labels. */
  d365Found: string;
  d365NoCost: string;
  d365Missing: string;
  d365Empty: string;
  /** state notices. */
  loading: string;
  error: string;
  forbidden: string;
  /** empty state (no BOM) + the read-only Technical shortcut. */
  empty: string;
  emptyBody: string;
  technicalLink: string;
};

/** Test/wiring seam: the bom_export_csv Server Action (returns a web Response). */
export type BomExportCsvAction = (productCode: string) => Promise<Response>;

export type FaBomTabProps = {
  productCode: string;
  version: FaBomVersion | null;
  lines: FaBomLine[];
  labels: FaBomTabLabels;
  state?: FaBomTabState;
  /** Read-only Technical shortcut target (canonical write screens stay there). */
  technicalBomHref?: string;
  /** The dead-code bom_export_csv action, wired here for the Export CSV button. */
  onExportCsv?: BomExportCsvAction;
};

const DEFAULT_TECHNICAL_BOM_HREF = '/technical/bom';

function typeBadgeVariant(componentType: string): { className: string } {
  const t = componentType.toUpperCase();
  if (t === 'RM') return { className: 'badge badge-blue' };
  if (t === 'PM') return { className: 'badge badge-violet' };
  return { className: 'badge badge-gray' };
}

function D365Cell({
  status,
  labels,
}: {
  status: string;
  labels: FaBomTabLabels;
}) {
  const norm = status.trim().toLowerCase();
  if (norm === 'found') {
    return <span className="badge badge-green">✓ {labels.d365Found}</span>;
  }
  if (norm === 'no cost' || norm === 'nocost') {
    return <span className="badge badge-amber">⚠ {labels.d365NoCost}</span>;
  }
  if (norm === 'missing') {
    return <span className="badge badge-red">✗ {labels.d365Missing}</span>;
  }
  // 'Empty' / unknown → red-ish "not in D365" (prototype maps missing→red).
  return <span className="badge badge-red">✗ {labels.d365Empty}</span>;
}

function StateNotice({ state, labels }: { state: FaBomTabState; labels: FaBomTabLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700" data-testid="fa-bom-error">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="p-6 text-sm text-red-700" data-testid="fa-bom-forbidden">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

export function FaBomTab({
  productCode,
  version,
  lines,
  labels,
  state = 'ready',
  technicalBomHref = DEFAULT_TECHNICAL_BOM_HREF,
  onExportCsv,
}: FaBomTabProps) {
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState(false);

  async function handleExportCsv() {
    if (!onExportCsv || exporting) return;
    setExportError(false);
    setExporting(true);
    try {
      const response = await onExportCsv(productCode);
      const csv = await response.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${productCode.replace(/[^A-Za-z0-9_-]/g, '_')}-bom.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  if (state === 'loading' || state === 'error' || state === 'permission_denied') {
    return (
      <Card data-slot="card" data-testid="fa-bom-tab">
        <StateNotice state={state} labels={labels} />
      </Card>
    );
  }

  // Empty: no BOM header for this FG. Read-only note + Technical shortcut.
  if (state === 'empty' || version === null || lines.length === 0) {
    return (
      <Card data-slot="card" data-testid="fa-bom-tab">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-2 text-center" data-testid="fa-bom-empty">
            <p className="text-sm font-semibold text-slate-900">{labels.empty}</p>
            <p className="text-xs text-slate-600">{labels.emptyBody}</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{labels.readOnlyNote}</p>
            <a
              href={technicalBomHref}
              className="mt-1 text-sm font-medium text-[var(--blue)] underline-offset-2 hover:underline"
              data-testid="fa-bom-technical-link"
            >
              {labels.technicalLink} →
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  const versionLine = labels.versionLine
    .replace('{version}', String(version.version))
    .replace('{status}', labels.statusLabels[version.status.toLowerCase()] ?? version.status)
    .replace('{count}', String(version.lineCount));

  return (
    <Card data-slot="card" data-testid="fa-bom-tab">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-900">{labels.title}</div>
            <div className="text-[11px] text-[var(--muted)]" data-testid="fa-bom-readonly-note">
              {labels.readOnlyNote}
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted)]" data-testid="fa-bom-version">
              {versionLine}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onExportCsv ? (
              <Button
                type="button"
                className="btn-ghost btn-sm"
                onClick={handleExportCsv}
                disabled={exporting}
                data-testid="fa-bom-export"
              >
                {exporting ? labels.exporting : labels.exportCsv}
              </Button>
            ) : null}
            <a
              href={technicalBomHref}
              className="text-xs font-medium text-[var(--blue)] underline-offset-2 hover:underline"
              data-testid="fa-bom-technical-link"
            >
              {labels.technicalLink} →
            </a>
          </div>
        </div>
        {exportError ? (
          <div role="alert" className="mt-1 text-xs text-red-700" data-testid="fa-bom-export-error">
            {labels.exportError}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        <table data-testid="fa-bom-table">
          <thead>
            <tr>
              <th>{labels.colType}</th>
              <th>{labels.colCode}</th>
              <th>{labels.colName}</th>
              <th>{labels.colQty}</th>
              <th>{labels.colStage}</th>
              <th>{labels.colSource}</th>
              <th>{labels.colD365}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const badge = typeBadgeVariant(line.componentType);
              return (
                <tr key={`${line.componentCode}-${i}`} data-testid="fa-bom-row">
                  <td>
                    <span className={badge.className} style={{ fontSize: 9 }}>
                      {line.componentType || '—'}
                    </span>
                  </td>
                  <td className="mono">{line.componentCode}</td>
                  <td>{line.componentName}</td>
                  <td className="mono num">{line.quantity}</td>
                  <td className="muted">{line.processStage}</td>
                  <td className="muted">{line.source}</td>
                  <td>
                    <D365Cell status={line.d365Status} labels={labels} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default FaBomTab;
