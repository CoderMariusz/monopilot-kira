'use client';

/**
 * 03-technical Nutrition panel (TEC-012, NEW) — client island (read-only).
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:480-535
 *   (NutritionScreen) — two-column layout: Macronutrients table (per 100 g) +
 *   "Allergens (14 EU declared)" table + the recomputed-from-BOM note.
 *
 * Real data only: the product picker + the panel come from the materialized NPD
 * nutrition read model via getNutritionPanel (Server Action). When the org has no
 * nutrition profiles the page renders an honest EmptyState — never a mock panel.
 * NUMERIC values are verbatim strings (no float). Allergen presence uses the 5
 * semantic badge tones (contains→bad, may_contain→warn, free_from→ok).
 */

import React from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';

import { Select } from '@monopilot/ui/Select';

import { getNutritionPanel } from '../_actions/list-nutrition';
import type {
  AllergenPresence,
  NutritionPanel,
  NutritionProductOption,
} from '../_actions/shared';

export type NutritionCopy = {
  selectLabel: string;
  selectPlaceholder: string;
  macrosTitle: string;
  per100g: string;
  perPortion: string;
  regulation: string;
  nutrient: string;
  allergensTitle: string;
  allergen: string;
  presenceCol: string;
  presence: Record<AllergenPresence, string>;
  noAllergens: string;
  noMacros: string;
  /** Template string with a literal `{when}` placeholder (RSC-serializable). */
  computedNote: string;
  computedNoteNoDate: string;
  loading: string;
  loadError: string;
  selectPrompt: string;
  /** Phase-3 NPD↔Technical shortcut — "Open NPD project →" link label. */
  openNpdProject: string;
};

// 5-tone semantic badges: contains → bad(red), may_contain → warn(amber),
// free_from → ok(green), unknown → neutral(gray).
const PRESENCE_BADGE: Record<AllergenPresence, string> = {
  contains: 'badge-red',
  may_contain: 'badge-amber',
  free_from: 'badge-green',
  unknown: 'badge-gray',
};

const PRESENCE_GLYPH: Record<AllergenPresence, string> = {
  contains: '●',
  may_contain: '⚠',
  free_from: '✓',
  unknown: '○',
};

// Row background tint for declared allergens (parity: other-screens.jsx:517).
const PRESENCE_ROW_BG: Partial<Record<AllergenPresence, string>> = {
  contains: 'var(--red-050a)',
  may_contain: 'var(--amber-050a)',
};

function PanelView({ panel, copy }: { panel: NutritionPanel; copy: NutritionCopy }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
        {/* Macronutrients */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="flex items-center justify-between text-sm font-semibold"
            style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}
          >
            <span>{copy.macrosTitle}</span>
            <span className="mono muted text-[11px]">{copy.per100g}</span>
          </div>
          {panel.macros.length === 0 ? (
            <div className="muted px-4 py-6 text-center text-sm">{copy.noMacros}</div>
          ) : (
            <table aria-label={copy.macrosTitle}>
              <thead>
                <tr>
                  <th scope="col">{copy.nutrient}</th>
                  <th scope="col" style={{ textAlign: 'right', width: 140 }}>
                    {copy.per100g}
                  </th>
                  <th scope="col" style={{ textAlign: 'right', width: 140 }}>
                    {copy.perPortion}
                  </th>
                  <th scope="col" style={{ width: 120 }}>
                    {copy.regulation}
                  </th>
                </tr>
              </thead>
              <tbody>
                {panel.macros.map((m) => (
                  <tr key={m.nutrientCode}>
                    <td style={{ fontWeight: 500 }}>{m.displayName}</td>
                    <td className="num mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {m.per100g} {m.unit}
                    </td>
                    <td className="num mono" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                      {m.perPortion ? `${m.perPortion} ${m.unit}` : '—'}
                    </td>
                    <td>
                      <span className="badge badge-gray">{m.regulation}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Allergens (14 EU declared) */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="text-sm font-semibold"
            style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}
          >
            {copy.allergensTitle}
          </div>
          {panel.allergens.length === 0 ? (
            <div className="muted px-4 py-6 text-center text-sm">{copy.noAllergens}</div>
          ) : (
            <table aria-label={copy.allergensTitle}>
              <thead>
                <tr>
                  <th scope="col">{copy.allergen}</th>
                  <th scope="col">{copy.presenceCol}</th>
                </tr>
              </thead>
              <tbody>
                {panel.allergens.map((a) => (
                  <tr
                    key={a.allergenCode}
                    data-presence={a.presence}
                    style={PRESENCE_ROW_BG[a.presence] ? { background: PRESENCE_ROW_BG[a.presence] } : undefined}
                  >
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td>
                      <span className={`badge ${PRESENCE_BADGE[a.presence]}`}>
                        <span aria-hidden="true" className="mr-1">
                          {PRESENCE_GLYPH[a.presence]}
                        </span>
                        {copy.presence[a.presence]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div role="note" className="alert alert-blue">
        ⓘ {panel.computedAt ? copy.computedNote.replace('{when}', panel.computedAt.slice(0, 10)) : copy.computedNoteNoDate}
      </div>
    </div>
  );
}

function PrintLabelView({ panel, copy }: { panel: NutritionPanel; copy: NutritionCopy }) {
  return (
    <section className="hidden print:block print:p-8 print:text-black" aria-label={copy.macrosTitle}>
      <div className="print:mx-auto print:max-w-[720px] print:font-sans">
        <div className="print:mb-4 print:border-b print:border-black print:pb-3">
          <div className="print:text-sm print:font-semibold print:uppercase print:tracking-normal">
            {panel.productCode}
          </div>
          <h1 className="print:mt-1 print:text-2xl print:font-bold">
            {panel.productName ?? panel.productCode}
          </h1>
          <div className="print:mt-2 print:text-sm">
            {panel.computedAt
              ? copy.computedNote.replace('{when}', panel.computedAt.slice(0, 10))
              : copy.computedNoteNoDate}
          </div>
        </div>

        <div className="print:mb-5">
          <h2 className="print:mb-2 print:text-xl print:font-bold">{copy.macrosTitle}</h2>
          <table className="print:w-full print:border-collapse print:text-sm" aria-label={copy.macrosTitle}>
            <thead>
              <tr>
                <th className="print:border print:border-black print:p-2 print:text-left" scope="col">
                  {copy.nutrient}
                </th>
                <th className="print:border print:border-black print:p-2 print:text-right" scope="col">
                  {copy.per100g}
                </th>
                <th className="print:border print:border-black print:p-2 print:text-right" scope="col">
                  {copy.perPortion}
                </th>
                <th className="print:border print:border-black print:p-2 print:text-left" scope="col">
                  {copy.regulation}
                </th>
              </tr>
            </thead>
            <tbody>
              {panel.macros.map((m) => (
                <tr key={m.nutrientCode}>
                  <td className="print:border print:border-black print:p-2 print:font-semibold">
                    {m.displayName}
                  </td>
                  <td className="print:border print:border-black print:p-2 print:text-right print:font-semibold">
                    {m.per100g} {m.unit}
                  </td>
                  <td className="print:border print:border-black print:p-2 print:text-right">
                    {m.perPortion ? `${m.perPortion} ${m.unit}` : '-'}
                  </td>
                  <td className="print:border print:border-black print:p-2">{m.regulation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="print:mb-2 print:text-xl print:font-bold">{copy.allergensTitle}</h2>
          {panel.allergens.length === 0 ? (
            <div className="print:border print:border-black print:p-3 print:text-sm">
              {copy.noAllergens}
            </div>
          ) : (
            <table className="print:w-full print:border-collapse print:text-sm" aria-label={copy.allergensTitle}>
              <thead>
                <tr>
                  <th className="print:border print:border-black print:p-2 print:text-left" scope="col">
                    {copy.allergen}
                  </th>
                  <th className="print:border print:border-black print:p-2 print:text-left" scope="col">
                    {copy.presenceCol}
                  </th>
                </tr>
              </thead>
              <tbody>
                {panel.allergens.map((a) => (
                  <tr key={a.allergenCode}>
                    <td className="print:border print:border-black print:p-2 print:font-semibold">
                      {a.name}
                    </td>
                    <td className="print:border print:border-black print:p-2">
                      {copy.presence[a.presence]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

export function NutritionPanelClient({
  products,
  copy,
}: {
  products: NutritionProductOption[];
  copy: NutritionCopy;
}) {
  const [selected, setSelected] = React.useState<string>(products[0]?.productCode ?? '');
  const [panel, setPanel] = React.useState<NutritionPanel | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [printReady, setPrintReady] = React.useState(false);

  const load = React.useCallback((productCode: string) => {
    if (!productCode) {
      setPanel(null);
      return;
    }
    setLoading(true);
    setLoadError(false);
    void getNutritionPanel(productCode)
      .then((result) => {
        if (result.ok) setPanel(result.panel);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load(selected);
  }, [selected, load]);

  React.useEffect(() => {
    const preparePrint = () => setPrintReady(true);
    const resetPrint = () => setPrintReady(false);
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', resetPrint);
    return () => {
      window.removeEventListener('beforeprint', preparePrint);
      window.removeEventListener('afterprint', resetPrint);
    };
  }, []);

  const options = products.map((p) => ({
    value: p.productCode,
    label: p.productName ? `${p.productCode} · ${p.productName}` : p.productCode,
  }));

  // Phase-3 NPD↔Technical shortcut: NPD project id mapped to the selected product
  // (server-resolved in the page loader). Null → no link is rendered.
  const selectedNpdProjectId =
    products.find((p) => p.productCode === selected)?.npdProjectId ?? null;

  return (
    <>
      <div className="flex flex-col gap-4 print:hidden" data-screen="technical-nutrition">
        <div className="card">
          <div className="flex flex-wrap items-end gap-4 p-4">
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
            {/* Phase-3 NPD↔Technical shortcut — read-level link to the source NPD
              project. Rendered ONLY when the selected product maps to an
              npd_projects row; omitted gracefully otherwise. prefetch={false}. */}
            {selectedNpdProjectId ? (
              <Link
                href={`/pipeline/${selectedNpdProjectId}`}
                prefetch={false}
                data-testid="technical-nutrition-npd-link"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                {copy.openNpdProject}
              </Link>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm ml-auto"
              onClick={() => {
                flushSync(() => setPrintReady(true));
                window.print();
              }}
              disabled={!panel}
            >
              Print label
            </button>
          </div>
        </div>

        {!selected ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">🥗</div>
              <div className="empty-state-body">{copy.selectPrompt}</div>
            </div>
          </div>
        ) : loading ? (
          <div className="card">
            <div className="px-6 py-8">
              <div
                className="h-32 animate-pulse rounded-md"
                style={{ background: 'var(--gray-100)' }}
                aria-label={copy.loading}
              />
            </div>
          </div>
        ) : loadError ? (
          <div role="alert" className="alert alert-red">
            <div className="alert-title">{copy.loadError}</div>
          </div>
        ) : panel ? (
          <PanelView panel={panel} copy={copy} />
        ) : null}
      </div>
      {panel && printReady ? <PrintLabelView panel={panel} copy={copy} /> : null}
    </>
  );
}
