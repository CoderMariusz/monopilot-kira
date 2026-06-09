'use client';

/**
 * 03-technical Recipe costing (TEC-013) — client island.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *   (CostingScreen) — KPI row (Std cost / Yield / Components / Costed lines) +
 *   a cost-breakdown bar list (per component) + the total + a yield note.
 *
 * Real data only: the product picker + the rolled-up cost come from getRecipeCost
 * (Server Action) summing Σ(line.quantity × items.cost_per_kg) in SQL NUMERIC. No
 * mocks; products with no costed lines render an honest empty panel. The
 * prototype's Target/Selling/Margin KPIs are NOT in Technical's schema (Finance-
 * owned), so they are replaced by the data-backed Yield / Components / Costed
 * KPIs — see the deviation log. NUMERIC values are verbatim strings (no float);
 * bar widths are the ONLY place Number() is used, for geometry only.
 */

import React from 'react';
import Link from 'next/link';

import { Select } from '@monopilot/ui/Select';

import { getRecipeCost, type RecipeCost } from '../_actions/list-recipe-cost';
import type { CostedProductOption } from '../_actions/list-recipe-cost';
import { formatCost } from './numeric';
import { downloadCsv, fileSafe, toCsv } from '../../../../../../../lib/shared/download';

export type RecipeCostCopy = {
  selectLabel: string;
  selectPlaceholder: string;
  selectPrompt: string;
  loading: string;
  loadError: string;
  kpiStdCost: string;
  kpiStdCostSub: string;
  kpiYield: string;
  kpiYieldSub: string;
  kpiComponents: string;
  kpiComponentsSub: string;
  kpiCosted: string;
  kpiCostedSub: string;
  breakdownTitle: string;
  totalLabel: string;
  noLines: string;
  noCost: string;
  /** Template with `{version}` / `{status}` placeholders — functions cannot cross the RSC boundary. */
  bomNote: string;
  uncosted: string;
  // "Export cost sheet" (prototype other-screens.jsx:547) + CSV column headers.
  exportCostSheet: string;
  csvComponent: string;
  csvComponentName: string;
  csvComponentType: string;
  csvQuantity: string;
  csvUom: string;
  csvUnitCost: string;
  csvLineCost: string;
  csvTotal: string;
  // Recompute confirm modal (prototype MODAL-10 · costRollupRecompute).
  recompute: string;
  recomputeTitle: string;
  recomputeIntro: string;
  recomputeNote: string;
  recomputeConfirm: string;
  cancel: string;
  /** Phase-3 NPD↔Technical shortcut — "See NPD costing →" link label. */
  seeNpdCosting: string;
};

// Breakdown bar tones — design tokens (golden rule #1: no hardcoded hex).
const BAR_TONES = [
  'var(--blue)',
  'var(--amber)',
  'var(--violet, #8b5cf6)',
  'var(--red)',
  'var(--green)',
  'var(--info)',
];

/**
 * Build the cost-sheet CSV from the rolled-up RecipeCost the screen already holds
 * (no extra fetch). Columns are the localized headers; values are the verbatim
 * NUMERIC decimal STRINGS (quantity / cost-per-kg / line cost) — never re-parsed
 * to a float. A trailing total row carries `totalMaterialCost`. RFC-4180 quoting
 * via the shared `toCsv`.
 */
export function buildCostSheetCsv(cost: RecipeCost, copy: RecipeCostCopy): string {
  const header = [
    copy.csvComponent,
    copy.csvComponentName,
    copy.csvComponentType,
    copy.csvQuantity,
    copy.csvUom,
    copy.csvUnitCost,
    copy.csvLineCost,
  ];
  const rows: Array<Array<string>> = cost.lines.map((l) => [
    l.componentCode,
    l.componentName ?? '',
    l.componentType ?? '',
    l.quantity,
    l.uom,
    l.unitCost ?? '',
    l.lineCost ?? '',
  ]);
  rows.push([copy.csvTotal, '', '', '', '', '', cost.totalMaterialCost ?? '']);
  return toCsv(header, rows);
}

// ── Local accessible dialog styled to .modal-* (same React-19/jsdom deviation as
//    the cost-manager island) — prototype MODAL-10 costRollupRecompute. ──────────
function Dialog({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  closeLabel: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={contentRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="modal-box outline-none">
        <div className="modal-head">
          <div>
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {subtitle ? <p className="helper mt-0.5">{subtitle}</p> : null}
          </div>
          <button type="button" aria-label={closeLabel} className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

// KPI tile = locked .kpi (1px border + 6px radius + 3px coloured bottom accent +
// value Inter 26/700). `accent` maps to the .kpi tone modifier classes.
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: 'green' | 'amber' | 'red' }) {
  return (
    <div className={`kpi${accent ? ` ${accent}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value tabular-nums">{value}</div>
      <div className="kpi-change muted">{sub}</div>
    </div>
  );
}

function CostView({ cost, copy }: { cost: RecipeCost; copy: RecipeCostCopy }) {
  const total = cost.totalMaterialCost;
  const totalNum = total != null ? Number(total) : 0;
  const costedLines = cost.lines.filter((l) => l.lineCost != null);

  return (
    <div className="flex flex-col gap-3.5">
      <section aria-label={copy.kpiStdCost} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={copy.kpiStdCost} value={formatCost(total)} sub={copy.kpiStdCostSub} />
        <Kpi label={copy.kpiYield} value={`${formatCost(cost.yieldPct, 1)}%`} sub={copy.kpiYieldSub} accent="green" />
        <Kpi label={copy.kpiComponents} value={String(cost.lines.length)} sub={copy.kpiComponentsSub} />
        <Kpi
          label={copy.kpiCosted}
          value={`${costedLines.length}/${cost.lines.length}`}
          sub={copy.kpiCostedSub}
          accent={costedLines.length === cost.lines.length ? 'green' : 'amber'}
        />
      </section>

      <div className="card">
        <div className="p-4">
          <strong className="text-sm">{copy.breakdownTitle}</strong>
          {cost.lines.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{copy.noLines}</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {cost.lines.map((line, i) => {
                const lineNum = line.lineCost != null ? Number(line.lineCost) : 0;
                const pct = totalNum > 0 && line.lineCost != null ? (lineNum / totalNum) * 100 : 0;
                const tone = BAR_TONES[i % BAR_TONES.length];
                return (
                  <div key={line.componentCode}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{line.componentCode}</span>
                        {line.componentName ? (
                          <span className="text-muted-foreground">{line.componentName}</span>
                        ) : null}
                        {line.componentType ? (
                          <span className="badge badge-gray">{line.componentType}</span>
                        ) : null}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {line.lineCost != null ? (
                          <>
                            {formatCost(line.lineCost)}{' '}
                            <span className="font-normal text-muted-foreground">· {pct.toFixed(1)}%</span>
                          </>
                        ) : (
                          <span className="font-normal" style={{ color: 'var(--amber-700)' }}>{copy.uncosted}</span>
                        )}
                      </span>
                    </div>
                    <div className="h-3.5 overflow-hidden rounded-sm" style={{ background: 'var(--gray-100)' }}>
                      <div className="h-full" style={{ width: `${pct}%`, background: tone }} aria-hidden="true" />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{line.quantity}</span> {line.uom}
                      {line.unitCost != null ? (
                        <>
                          {' '}
                          × <span className="font-mono">{formatCost(line.unitCost)}</span>/kg
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div
            className="mt-4 flex items-center justify-between rounded px-3 py-2.5 text-sm"
            style={{ background: 'var(--gray-050)' }}
          >
            <strong>{copy.totalLabel}</strong>
            <strong className="font-mono tabular-nums">{formatCost(total)}</strong>
          </div>
        </div>
      </div>

      <div role="note" className="alert alert-blue">
        ⓘ {copy.bomNote.replace('{version}', String(cost.bomVersion)).replace('{status}', cost.bomStatus)}
      </div>
    </div>
  );
}

export function RecipeCostClient({
  products,
  copy,
}: {
  products: CostedProductOption[];
  copy: RecipeCostCopy;
}) {
  const [selected, setSelected] = React.useState<string>(products[0]?.productCode ?? '');
  const [cost, setCost] = React.useState<RecipeCost | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [recomputeOpen, setRecomputeOpen] = React.useState(false);

  const load = React.useCallback((productCode: string) => {
    if (!productCode) {
      setCost(null);
      return;
    }
    setLoading(true);
    setLoadError(false);
    void getRecipeCost(productCode)
      .then((result) => {
        if (result.ok) setCost(result.cost);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load(selected);
  }, [selected, load]);

  const options = products.map((p) => ({
    value: p.productCode,
    label: p.name ? `${p.productCode} · ${p.name}` : p.productCode,
  }));

  // Phase-3 NPD↔Technical shortcut: the NPD project id mapped to the selected
  // product (server-resolved in the page loader). Null → no link is rendered.
  const selectedNpdProjectId =
    products.find((p) => p.productCode === selected)?.npdProjectId ?? null;

  return (
    <div className="flex flex-col gap-4" data-screen="technical-recipe-cost">
      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-4 p-4">
          <label className="label block">
            {copy.selectLabel}
            <div className="mt-1 w-80">
              <Select
                value={selected}
                onValueChange={setSelected}
                options={options}
                placeholder={copy.selectPlaceholder}
                aria-label={copy.selectLabel}
              />
            </div>
          </label>
          {selected ? (
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="technical-cost-export"
                disabled={!cost || cost.lines.length === 0}
                title={copy.exportCostSheet}
                onClick={() => {
                  if (!cost || cost.lines.length === 0) return;
                  downloadCsv(buildCostSheetCsv(cost, copy), `cost-sheet-${fileSafe(cost.productCode)}.csv`);
                }}
              >
                {copy.exportCostSheet}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                data-modal-id="TEC-COST-RECOMPUTE"
                onClick={() => setRecomputeOpen(true)}
              >
                ↻ {copy.recompute}
              </button>
              {/* Phase-3 NPD↔Technical shortcut — read-level link to the source
                  NPD project's costing screen. Rendered ONLY when the selected
                  product maps to an npd_projects row; omitted gracefully otherwise.
                  prefetch={false} per the project perf rule. */}
              {selectedNpdProjectId ? (
                <Link
                  href={`/pipeline/${selectedNpdProjectId}/costing`}
                  prefetch={false}
                  data-testid="technical-cost-npd-link"
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {copy.seeNpdCosting}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {!selected ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-body">{copy.selectPrompt}</div>
          </div>
        </div>
      ) : loading ? (
        <div className="card">
          <div className="px-6 py-8">
            <div
              className="h-40 animate-pulse rounded-md"
              style={{ background: 'var(--gray-100)' }}
              aria-label={copy.loading}
            />
          </div>
        </div>
      ) : loadError ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{copy.loadError}</div>
        </div>
      ) : cost ? (
        <CostView cost={cost} copy={copy} />
      ) : null}

      {recomputeOpen ? (
        <Dialog
          open
          onClose={() => setRecomputeOpen(false)}
          closeLabel={copy.cancel}
          title={copy.recomputeTitle}
          subtitle={copy.recomputeIntro}
          footer={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecomputeOpen(false)}>
                {copy.cancel}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  // Genuine re-roll: re-run the live BOM × current-rates roll-up
                  // for the selected product (no fake snapshot — the cost IS
                  // computed on every load from items.cost_per_kg).
                  setRecomputeOpen(false);
                  load(selected);
                }}
              >
                {copy.recomputeConfirm}
              </button>
            </>
          }
        >
          <div role="note" className="alert alert-blue" style={{ fontSize: 12 }}>
            ⓘ {copy.recomputeNote}
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
