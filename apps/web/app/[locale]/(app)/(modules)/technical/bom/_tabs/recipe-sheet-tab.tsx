'use client';

/**
 * T-044 — UI: TEC-084 Recipe Sheet print view.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-detail.jsx:551-603
 *     (SheetTab — printable recipe sheet: Print/PDF actions, header + subhead,
 *      ingredient table, process steps, allergens/notes)
 *
 * A print-formatted recipe sheet built from REAL BOM data (header + lines from
 * the shared SSOT, passed down by the detail page — no mocks). The Print action
 * calls `window.print()`. App chrome is hidden on print via Tailwind `print:`
 * utilities (the toolbar carries `print:hidden`; the sheet itself is the only
 * printed region). INDUSTRY-CONFIG layout variants (bakery / meat / pharma) are
 * selected by the FG's `ext_jsonb.industry` value resolved server-side (default
 * 'meat'); the variant only swaps section labels, never the data.
 *
 * Red-lines: PDF export is out of scope (the prototype's ⇩ PDF button is omitted);
 * sensitive `private_jsonb` is NEVER rendered on the sheet (the caller passes only
 * the public recipe view); FG canonical (no FA labels); no inline layout styles
 * (Tailwind only); no raw <select>; every visible string is an injected label.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';

export type RecipeIndustry = 'meat' | 'bakery' | 'pharma';

export type RecipeLine = {
  id: string;
  code: string;
  name: string | null;
  quantity: string;
  uom: string;
  /** Percent of batch, pre-formatted, or null when not applicable. */
  pct: string | null;
  operationName: string | null;
};

export type RecipeSheetData = {
  productCode: string;
  productName: string | null;
  version: number;
  yieldPct: string;
  approvedByName: string | null;
  approvedAt: string | null;
  lines: RecipeLine[];
  /** Public, non-sensitive notes / allergen summary (never private_jsonb). */
  notes: string | null;
};

export type RecipeSheetLabels = {
  print: string;
  subhead: string; // "BOM {code} · v{version} · Yield {yield}% · Approved {approved}"
  ingredientsTitle: string;
  processTitle: string;
  notesTitle: string;
  colCode: string;
  colName: string;
  colQty: string;
  colPct: string;
  emptyLines: string;
  approvedBy: string;
  pendingApproval: string;
};

/**
 * Per-industry section-label overrides. Only labels change — the underlying real
 * data is identical across variants.
 */
export type IndustrySectionLabels = {
  ingredientsTitle: string;
  processTitle: string;
};

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function RecipeSheetTab({
  data,
  labels,
  industry = 'meat',
  industryLabels,
}: {
  data: RecipeSheetData;
  labels: RecipeSheetLabels;
  industry?: RecipeIndustry;
  /** Optional per-industry section-label overrides (bakery/pharma). */
  industryLabels?: Partial<Record<RecipeIndustry, IndustrySectionLabels>>;
}) {
  const sectionLabels = industryLabels?.[industry];
  const ingredientsTitle = sectionLabels?.ingredientsTitle ?? labels.ingredientsTitle;
  const processTitle = sectionLabels?.processTitle ?? labels.processTitle;

  const approvedText = data.approvedByName
    ? `${labels.approvedBy} ${data.approvedByName}`
    : labels.pendingApproval;

  const processSteps = data.lines
    .filter((l) => Boolean(l.operationName && l.operationName.trim()))
    .map((l) => ({ id: l.id, op: l.operationName as string, code: l.code }));

  return (
    <div data-testid="recipe-sheet-tab" data-industry={industry}>
      {/* Toolbar — hidden when printing */}
      <div className="mb-3 flex justify-end gap-2 print:hidden">
        <Button
          type="button"
          data-testid="recipe-sheet-print-button"
          className="btn-secondary btn-sm"
          onClick={() => window.print()}
        >
          {labels.print}
        </Button>
      </div>

      {/* The printable sheet */}
      <article
        data-testid="recipe-sheet"
        className="recipe-sheet mx-auto max-w-3xl rounded-xl border bg-white p-8 text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none"
      >
        <h1 className="text-2xl font-semibold tracking-tight">{data.productName ?? data.productCode}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {interpolate(labels.subhead, {
            code: data.productCode,
            version: data.version,
            yield: Number(data.yieldPct).toFixed(0),
            approved: approvedText,
          })}
        </p>

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide">{ingredientsTitle}</h3>
        {data.lines.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{labels.emptyLines}</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 pr-2 font-medium">{labels.colCode}</th>
                <th scope="col" className="py-1 pr-2 font-medium">{labels.colName}</th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">{labels.colQty}</th>
                <th scope="col" className="py-1 text-right font-medium">{labels.colPct}</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.id} data-testid="recipe-sheet-line" className="border-b border-slate-100">
                  <td className="py-1 pr-2 font-mono text-xs">{l.code}</td>
                  <td className="py-1 pr-2">{l.name ?? '—'}</td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">
                    {l.quantity} {l.uom}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums">{l.pct ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {processSteps.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide">{processTitle}</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
              {processSteps.map((s) => (
                <li key={s.id} data-testid="recipe-sheet-step">
                  <span className="font-medium">{s.op}</span>{' '}
                  <span className="font-mono text-xs text-muted-foreground">({s.code})</span>
                </li>
              ))}
            </ol>
          </>
        ) : null}

        {data.notes ? (
          <>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide">{labels.notesTitle}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {data.notes}
            </p>
          </>
        ) : null}
      </article>
    </div>
  );
}

export default RecipeSheetTab;
