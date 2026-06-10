'use client';

/**
 * TAXONOMY lane — Item Detail · Nutrition tab (client island).
 *
 * Mirrors the allergens-tab edit pattern (allergens-tab.client.tsx): a label
 * bundle resolved server-side, a Server Action injected as a prop seam, all five
 * UI states (loading / empty / error / permission-denied / ready+optimistic).
 *
 * Three modes, driven by the item's type (resolved server-side, never trusted
 * from the client):
 *   - 'edit'      → rm / ingredient / intermediate: a form over the 7 per-100 g
 *                   nutrient fields (decimal strings) + the EU-14 inherited-allergen
 *                   multi-pick. Loaded via getItemNutrition, Save → upsertNutrition.
 *   - 'readonly'  → fg: a read-only computed panel from public.nutrition_profiles
 *                   (the NPD-materialized read model). No write path.
 *   - 'na'        → packaging / co_product / byproduct: an honest empty state
 *                   ("Nutrition data is not applicable for this item type.").
 *
 * NUMERIC stays a STRING end-to-end (no float). No raw <select> — the allergen
 * multi-pick is a checkbox group (EU-14 is a fixed 14-item set).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import { EU14_CODES, type Eu14Code } from './nutrition-eu14';

export type NutritionTabMode = 'edit' | 'readonly' | 'na';
export type NutritionTabState = 'ready' | 'empty' | 'error' | 'loading' | 'permission_denied';

/** The 7 per-100 g nutrient slots — decimal STRINGS, exactly the backend schema. */
export const NUTRIENT_FIELDS = [
  'energy_kj',
  'fat_g',
  'saturates_g',
  'carbs_g',
  'sugars_g',
  'protein_g',
  'salt_g',
] as const;
export type NutrientField = (typeof NUTRIENT_FIELDS)[number];
export type NutritionValues = Record<NutrientField, string>;

export type NutritionEditData = {
  itemCode: string;
  nutrition: NutritionValues;
  allergensInherited: string[];
};

/** One row of the read-only FG computed panel (NUMERIC kept as string). */
export type NutritionReadonlyMacro = {
  nutrientCode: string;
  displayName: string;
  unit: string;
  per100g: string;
  perPortion: string;
};
export type NutritionReadonlyAllergen = { code: string; name: string; presence: string };
export type NutritionReadonlyData = {
  productName: string | null;
  computedAt: string | null;
  macros: NutritionReadonlyMacro[];
  allergens: NutritionReadonlyAllergen[];
};

export type NutritionSaveResult =
  | { ok: true }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export type NutritionTabLabels = {
  title: string;
  subtitle: string;
  perHundred: string;
  fields: Record<NutrientField, string>;
  allergensLegend: string;
  allergensHint: string;
  allergenNames: Record<string, string>;
  save: string;
  saving: string;
  saved: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  notApplicable: string;
  saveError: string;
  // readonly (fg) panel
  readonlyTitle: string;
  colNutrient: string;
  colPer100g: string;
  colPerPortion: string;
  colAllergen: string;
  colPresence: string;
  noComputed: string;
  computedNote: string; // "{when}" placeholder
  presence: Record<string, string>;
};

function emptyValues(): NutritionValues {
  return {
    energy_kj: '',
    fat_g: '',
    saturates_g: '',
    carbs_g: '',
    sugars_g: '',
    protein_g: '',
    salt_g: '',
  };
}

const DECIMAL_RE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export type NutritionTabProps = {
  mode: NutritionTabMode;
  state: NutritionTabState;
  itemCode: string;
  canEdit: boolean;
  labels: NutritionTabLabels;
  /** edit mode — loaded nutrition (null until none saved). */
  editData?: NutritionEditData | null;
  /** readonly (fg) mode — the materialized computed panel. */
  readonlyData?: NutritionReadonlyData | null;
  /** Server Action seam; injected so RTL can stub it. */
  saveAction?: (input: NutritionEditData) => Promise<NutritionSaveResult>;
};

const PRESENCE_BADGE: Record<string, string> = {
  contains: 'badge-red',
  may_contain: 'badge-amber',
  free_from: 'badge-green',
  unknown: 'badge-gray',
};

export function NutritionTab({
  mode,
  state,
  itemCode,
  canEdit,
  labels,
  editData,
  readonlyData,
  saveAction,
}: NutritionTabProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<NutritionValues>(
    () => editData?.nutrition ?? emptyValues(),
  );
  const [allergens, setAllergens] = React.useState<Set<string>>(
    () => new Set(editData?.allergensInherited ?? []),
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reseed when the server-loaded data changes (router.refresh after save).
  React.useEffect(() => {
    setValues(editData?.nutrition ?? emptyValues());
    setAllergens(new Set(editData?.allergensInherited ?? []));
  }, [editData]);

  if (state === 'loading') {
    return (
      <div data-testid="nutrition-tab" data-state="loading" className="space-y-3 p-1">
        <div role="status" className="text-sm text-muted-foreground">
          {labels.loading}
        </div>
        <div className="h-6 w-40 animate-pulse rounded bg-slate-100" />
        <div className="h-6 w-64 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (state === 'permission_denied') {
    return (
      <div data-testid="nutrition-tab" data-state="permission_denied" className="p-1">
        <div role="alert" className="alert alert-amber">
          {labels.forbidden}
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div data-testid="nutrition-tab" data-state="error" className="p-1">
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{labels.error}</div>
        </div>
      </div>
    );
  }

  // ── 'na': packaging / co_product / byproduct ──────────────────────────────────
  if (mode === 'na') {
    return (
      <div data-testid="nutrition-tab" data-mode="na" data-state="empty" className="p-1">
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-icon">🚫</div>
            <div className="empty-state-title">{labels.notApplicable}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── 'readonly': fg computed panel ─────────────────────────────────────────────
  if (mode === 'readonly') {
    const panel = readonlyData;
    if (!panel || (panel.macros.length === 0 && panel.allergens.length === 0)) {
      return (
        <div data-testid="nutrition-tab" data-mode="readonly" data-state="empty" className="p-1">
          <div className="card" style={{ padding: 0 }}>
            <div className="empty-state">
              <div className="empty-state-icon">🥗</div>
              <div className="empty-state-title">{labels.noComputed}</div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div data-testid="nutrition-tab" data-mode="readonly" data-state="ready" className="space-y-3 p-1">
        <header>
          <h2 className="text-base font-semibold tracking-tight">{labels.readonlyTitle}</h2>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
            {labels.subtitle}
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table aria-label={labels.readonlyTitle}>
              <thead>
                <tr>
                  <th scope="col">{labels.colNutrient}</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    {labels.colPer100g}
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    {labels.colPerPortion}
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
                      {m.perPortion} {m.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table aria-label={labels.allergensLegend}>
              <thead>
                <tr>
                  <th scope="col">{labels.colAllergen}</th>
                  <th scope="col">{labels.colPresence}</th>
                </tr>
              </thead>
              <tbody>
                {panel.allergens.map((a) => (
                  <tr key={a.code} data-presence={a.presence}>
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td>
                      <span className={`badge ${PRESENCE_BADGE[a.presence] ?? 'badge-gray'}`}>
                        {labels.presence[a.presence] ?? a.presence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div role="note" className="alert alert-blue">
          ⓘ{' '}
          {panel.computedAt
            ? labels.computedNote.replace('{when}', panel.computedAt.slice(0, 10))
            : labels.computedNote.replace('{when}', '—')}
        </div>
      </div>
    );
  }

  // ── 'edit': rm / ingredient / intermediate ────────────────────────────────────
  function set(field: NutrientField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function toggleAllergen(code: string) {
    setAllergens((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setSaved(false);
  }

  const invalidField = NUTRIENT_FIELDS.find((f) => {
    const v = values[f].trim();
    return v !== '' && !DECIMAL_RE.test(v);
  });
  const allFilled = NUTRIENT_FIELDS.every((f) => values[f].trim() !== '');
  const canSubmit = canEdit && allFilled && !invalidField && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !saveAction) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    const payload: NutritionEditData = {
      itemCode,
      nutrition: { ...values },
      allergensInherited: EU14_CODES.filter((c) => allergens.has(c)),
    };
    try {
      const result = await saveAction(payload);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(labels.saveError);
      }
    } catch {
      setError(labels.saveError);
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = !editData;

  return (
    <form
      data-testid="nutrition-tab"
      data-mode="edit"
      data-state={isEmpty ? 'empty' : 'ready'}
      className="space-y-4 p-1"
      onSubmit={handleSubmit}
    >
      <header>
        <h2 className="text-base font-semibold tracking-tight">{labels.title}</h2>
        <p className="mt-0.5 text-sm" style={{ color: 'var(--muted)' }}>
          {labels.subtitle}
        </p>
      </header>

      <fieldset className="card" disabled={!canEdit}>
        <legend className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {labels.perHundred}
        </legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {NUTRIENT_FIELDS.map((field) => (
            <div className="ff" key={field}>
              <label htmlFor={`nutr-${field}`}>{labels.fields[field]}</label>
              <Input
                id={`nutr-${field}`}
                name={field}
                inputMode="decimal"
                aria-label={labels.fields[field]}
                className="form-input"
                value={values[field]}
                data-testid={`nutr-${field}`}
                onChange={(ev) => set(field, ev.currentTarget.value)}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="card" disabled={!canEdit}>
        <legend className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {labels.allergensLegend}
        </legend>
        <p className="mt-0.5 mb-2 text-xs" style={{ color: 'var(--muted)' }}>
          {labels.allergensHint}
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {EU14_CODES.map((code: Eu14Code) => (
            <li key={code}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`allergen-${code}`}
                  checked={allergens.has(code)}
                  onChange={() => toggleAllergen(code)}
                  disabled={!canEdit}
                />
                <span>{labels.allergenNames[code] ?? code}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {error ? (
        <div role="alert" className="alert alert-red" data-testid="nutrition-error">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div role="status" className="alert alert-green" data-testid="nutrition-saved">
          {labels.saved}
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" className="btn-primary" disabled={!canSubmit} data-testid="nutrition-save">
            {saving ? labels.saving : labels.save}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export default NutritionTab;
