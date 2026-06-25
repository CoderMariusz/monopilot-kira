'use client';

/**
 * T-040 — TEC-023 BOM Version Diff view (client renderer).
 *
 * Prototype parity:
 *   `prototypes/design/Monopilot Design System/technical/bom-detail.jsx:373-468`
 *   (bom_versions_tab) — the compare/diff panel: a `diff-row` grid of
 *   `before → arrow → after` rows grouped by field, with add (＋), remove (−)
 *   and change (→) markers. Translated to a side-by-side table with the design
 *   color tokens: added = success (green), removed = destructive (red),
 *   changed = warning (amber).
 *
 * Consumes the structured `BomDiff` produced by the real `diffBomVersions`
 * (T-015) Server Action via a SINGLE GET — no repeated backend calls. This
 * component is presentational only (the fetch happens in the Server Component
 * page that wraps it).
 */

import React from 'react';
import { useTranslations } from 'next-intl';

import { downloadCsv, isoDateStamp, toCsv } from '../../../../../../../lib/shared/download';
import type { BomDiff, NumericChange } from '../_actions/diff';

function isEmptyDiff(diff: BomDiff): boolean {
  return (
    diff.header.length === 0 &&
    diff.lines.added.length === 0 &&
    diff.lines.removed.length === 0 &&
    diff.lines.changed.length === 0 &&
    diff.co_products.added.length === 0 &&
    diff.co_products.removed.length === 0 &&
    diff.co_products.changed.length === 0
  );
}

function NumericCell({ change }: { change?: NumericChange }) {
  if (!change) return <span className="text-slate-400">—</span>;
  const pct = change.percentChange == null ? '' : ` (${change.percentChange > 0 ? '+' : ''}${change.percentChange}%)`;
  return (
    <span className="font-mono">
      <span className="text-slate-500">{change.from}</span>
      <span className="mx-1 text-slate-400">→</span>
      <span className="font-medium text-amber-700">{change.to}</span>
      <span className="text-[11px] text-amber-600">{pct}</span>
    </span>
  );
}

export function BomVersionDiff({
  diff,
  fromVersion,
  toVersion,
}: {
  diff: BomDiff;
  fromVersion: number;
  toVersion: number;
}) {
  const t = useTranslations('technical.bom.diff');
  const exportLabel = 'Export CSV';
  const exportAriaLabel = 'Export BOM version diff to CSV';

  if (isEmptyDiff(diff)) {
    return (
      <div
        data-state="empty"
        className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-white px-6 py-16 text-center text-slate-500"
      >
        <p className="text-sm font-medium">{t('noDifferences')}</p>
      </div>
    );
  }

  function onExportCsv() {
    const rows: (string | number | null | undefined)[][] = [];
    const addChange = (
      section: string,
      change: string,
      item: string,
      attribute: string,
      before: string | null | undefined,
      after: string | null | undefined,
    ) => {
      rows.push([section, change, item, attribute, before, after]);
    };
    const addNumericChange = (
      section: string,
      change: string,
      item: string,
      attribute: string,
      numeric: NumericChange,
    ) => {
      addChange(section, change, item, attribute, numeric.from, numeric.to);
    };

    for (const h of diff.header) {
      addChange(t('headerChanges'), t('changed'), h.field, h.field, h.from, h.to);
    }
    for (const line of diff.lines.added) {
      addChange(t('lines'), t('added'), line.componentCode, t('quantity'), null, `${line.quantity} ${line.uom}`);
    }
    for (const line of diff.lines.removed) {
      addChange(t('lines'), t('removed'), line.componentCode, t('quantity'), `${line.quantity} ${line.uom}`, null);
    }
    for (const line of diff.lines.changed) {
      if (line.quantity) addNumericChange(t('lines'), t('changed'), line.componentCode, t('quantity'), line.quantity);
      if (line.scrapPct) addNumericChange(t('lines'), t('changed'), line.componentCode, t('scrap'), line.scrapPct);
      if (line.uom) addChange(t('lines'), t('changed'), line.componentCode, t('uom'), line.uom.from, line.uom.to);
      if (line.componentType) {
        addChange(t('lines'), t('changed'), line.componentCode, t('type'), line.componentType.from ?? '—', line.componentType.to ?? '—');
      }
    }
    for (const coProduct of diff.co_products.added) {
      addChange(t('coProducts'), t('added'), coProduct.coProductItemId, t('quantity'), null, `${coProduct.quantity} ${coProduct.uom}`);
    }
    for (const coProduct of diff.co_products.removed) {
      addChange(t('coProducts'), t('removed'), coProduct.coProductItemId, t('quantity'), `${coProduct.quantity} ${coProduct.uom}`, null);
    }
    for (const coProduct of diff.co_products.changed) {
      if (coProduct.quantity) addNumericChange(t('coProducts'), t('changed'), coProduct.key, t('quantity'), coProduct.quantity);
      if (coProduct.allocationPct) addNumericChange(t('coProducts'), t('changed'), coProduct.key, t('allocation'), coProduct.allocationPct);
      if (coProduct.uom) addChange(t('coProducts'), t('changed'), coProduct.key, t('uom'), coProduct.uom.from, coProduct.uom.to);
    }

    downloadCsv(
      toCsv(['Section', 'Change', 'Item / field', 'Attribute', 'Before', 'After'], rows),
      `technical-bom-version-diff-v${fromVersion}-to-v${toVersion}-${isoDateStamp()}.csv`,
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wide text-slate-500" role="status">
        <span>{t('subtitle', { from: fromVersion, to: toVersion })}</span>
        <button type="button" className="btn btn-secondary btn-sm normal-case tracking-normal" aria-label={exportAriaLabel} onClick={onExportCsv}>
          {exportLabel}
        </button>
      </header>

      {/* Header field changes */}
      {diff.header.length > 0 ? (
        <section aria-labelledby="diff-header">
          <h3 id="diff-header" className="mb-2 text-sm font-semibold text-slate-700">
            {t('headerChanges')}
          </h3>
          <div className="overflow-hidden rounded-md border">
            {diff.header.map((h) => (
              <div
                key={h.field}
                className="grid grid-cols-[160px_1fr_24px_1fr] items-center gap-2 border-b bg-amber-50/40 px-3 py-2 text-[13px] last:border-b-0"
              >
                <span className="text-slate-500">{h.field}</span>
                <span className="font-mono text-slate-500">{h.from}</span>
                <span className="text-center text-slate-400">→</span>
                <span className="font-mono font-medium text-amber-700">{h.to}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Components (lines) */}
      <DiffSection
        title={t('lines')}
        added={diff.lines.added.map((l) => ({ key: l.id, code: l.componentCode, qty: l.quantity, uom: l.uom }))}
        removed={diff.lines.removed.map((l) => ({ key: l.id, code: l.componentCode, qty: l.quantity, uom: l.uom }))}
        changed={diff.lines.changed.map((c) => ({
          key: c.key,
          code: c.componentCode,
          rows: [
            c.quantity ? { label: t('quantity'), change: c.quantity } : null,
            c.scrapPct ? { label: t('scrap'), change: c.scrapPct } : null,
          ].filter(Boolean) as { label: string; change: NumericChange }[],
          plain: [
            c.uom ? { label: t('uom'), from: c.uom.from, to: c.uom.to } : null,
            c.componentType ? { label: t('type'), from: c.componentType.from ?? '—', to: c.componentType.to ?? '—' } : null,
          ].filter(Boolean) as { label: string; from: string; to: string }[],
        }))}
        labels={{ added: t('added'), removed: t('removed'), changed: t('changed') }}
      />

      {/* Co-products */}
      <DiffSection
        title={t('coProducts')}
        added={diff.co_products.added.map((c) => ({ key: c.id, code: c.coProductItemId, qty: c.quantity, uom: c.uom }))}
        removed={diff.co_products.removed.map((c) => ({ key: c.id, code: c.coProductItemId, qty: c.quantity, uom: c.uom }))}
        changed={diff.co_products.changed.map((c) => ({
          key: c.key,
          code: c.key,
          rows: [
            c.quantity ? { label: t('quantity'), change: c.quantity } : null,
            c.allocationPct ? { label: t('allocation'), change: c.allocationPct } : null,
          ].filter(Boolean) as { label: string; change: NumericChange }[],
          plain: [c.uom ? { label: t('uom'), from: c.uom.from, to: c.uom.to } : null].filter(Boolean) as {
            label: string;
            from: string;
            to: string;
          }[],
        }))}
        labels={{ added: t('added'), removed: t('removed'), changed: t('changed') }}
      />
    </div>
  );
}

type AddRemoveRow = { key: string; code: string; qty: string; uom: string };
type ChangedRow = {
  key: string;
  code: string;
  rows: { label: string; change: NumericChange }[];
  plain: { label: string; from: string; to: string }[];
};

function DiffSection({
  title,
  added,
  removed,
  changed,
  labels,
}: {
  title: string;
  added: AddRemoveRow[];
  removed: AddRemoveRow[];
  changed: ChangedRow[];
  labels: { added: string; removed: string; changed: string };
}) {
  if (added.length === 0 && removed.length === 0 && changed.length === 0) return null;
  return (
    <section aria-label={title}>
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-3">
        {added.length > 0 ? (
          <div data-region="added" className="rounded-md border border-green-200 bg-green-50/50">
            <div className="border-b border-green-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-green-700">
              ＋ {labels.added}
            </div>
            {added.map((r) => (
              <div key={r.key} className="grid grid-cols-[140px_1fr] gap-2 px-3 py-1.5 text-[13px] text-green-800">
                <span className="font-mono">{r.code}</span>
                <span className="font-mono text-green-600">
                  {r.qty} {r.uom}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {removed.length > 0 ? (
          <div data-region="removed" className="rounded-md border border-red-200 bg-red-50/50">
            <div className="border-b border-red-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-700">
              − {labels.removed}
            </div>
            {removed.map((r) => (
              <div key={r.key} className="grid grid-cols-[140px_1fr] gap-2 px-3 py-1.5 text-[13px] text-red-800 line-through">
                <span className="font-mono">{r.code}</span>
                <span className="font-mono text-red-600">
                  {r.qty} {r.uom}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {changed.length > 0 ? (
          <div data-region="changed" className="rounded-md border border-amber-200 bg-amber-50/40">
            <div className="border-b border-amber-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
              → {labels.changed}
            </div>
            {changed.map((c) => (
              <div key={c.key} className="border-b border-amber-100 px-3 py-2 last:border-b-0">
                <div className="mb-1 font-mono text-[13px] font-medium text-slate-700">{c.code}</div>
                <div className="space-y-1 pl-3">
                  {c.rows.map((row) => (
                    <div key={row.label} className="grid grid-cols-[120px_1fr] items-center gap-2 text-[13px]">
                      <span className="text-slate-500">{row.label}</span>
                      <NumericCell change={row.change} />
                    </div>
                  ))}
                  {c.plain.map((row) => (
                    <div key={row.label} className="grid grid-cols-[120px_1fr] items-center gap-2 text-[13px]">
                      <span className="text-slate-500">{row.label}</span>
                      <span className="font-mono">
                        <span className="text-slate-500">{row.from}</span>
                        <span className="mx-1 text-slate-400">→</span>
                        <span className="font-medium text-amber-700">{row.to}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
