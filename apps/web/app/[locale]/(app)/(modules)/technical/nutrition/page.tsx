/**
 * 03-technical Nutrition panel (TEC-012, NEW) — server page.
 *
 * Real Supabase-backed nutrition read model (org-scoped via withOrgContext + RLS).
 * The server component loads the set of products that have a materialized
 * nutrition profile; the client island renders the product picker and, per
 * selection, the macros + EU-14 allergen declarations (a second org-scoped read).
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:480-535
 *   (NutritionScreen) — Macronutrients + "Allergens (14 EU declared)" + the
 *   recomputed note. See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Ownership: the nutrition value is the NPD-MATERIALIZED read model; Technical
 * reads it READ-ONLY for FG/spec context. No write path, no mocks — when the org
 * has no profiles the page renders an honest EmptyState.
 *
 * UI states: loading (client skeleton on selection), empty (no profiles / no
 * panel rows), error (failed product read / failed panel read), permission-denied
 * (RLS org-scoped; cross-module write lives in NPD/Quality), optimistic — N/A
 * (read-only surface).
 */

import { getTranslations } from 'next-intl/server';

import { listNutritionProducts } from './_actions/list-nutrition';
import { NutritionPanelClient, type NutritionCopy } from './_components/nutrition-panel.client';

export const dynamic = 'force-dynamic';

export default async function TechnicalNutritionPage() {
  const t = await getTranslations('technical.nutrition');
  const { products, state } = await listNutritionProducts();

  const copy: NutritionCopy = {
    selectLabel: t('selectLabel'),
    selectPlaceholder: t('selectPlaceholder'),
    macrosTitle: t('macrosTitle'),
    per100g: t('per100g'),
    perPortion: t('perPortion'),
    regulation: t('regulation'),
    nutrient: t('nutrient'),
    allergensTitle: t('allergensTitle'),
    allergen: t('allergen'),
    presenceCol: t('presenceCol'),
    presence: {
      contains: t('presence.contains'),
      may_contain: t('presence.may_contain'),
      free_from: t('presence.free_from'),
      unknown: t('presence.unknown'),
    },
    noAllergens: t('noAllergens'),
    noMacros: t('noMacros'),
    computedNote: t('computedNote', { when: '{when}' }),
    computedNoteNoDate: t('computedNoteNoDate'),
    loading: t('loading'),
    loadError: t('loadError'),
    selectPrompt: t('selectPrompt'),
    openNpdProject: t('openNpdProject'),
  };

  return (
    <main data-screen="technical-nutrition-page" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {t('breadcrumb.technical')} / {t('breadcrumb.nutrition')}
      </nav>

      <header>
        <h1 className="page-title">{t('title')}</h1>
        <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
      </header>

      {state === 'error' ? (
        <div role="alert" data-testid="technical-nutrition-error" className="alert alert-red">
          <div className="alert-title">{t('state.error')}</div>
        </div>
      ) : state === 'empty' ? (
        <div className="card" data-testid="technical-nutrition-empty">
          <div className="empty-state">
            <div className="empty-state-icon">🥗</div>
            <div className="empty-state-title">{t('state.emptyTitle')}</div>
            <div className="empty-state-body">{t('state.emptyBody')}</div>
          </div>
        </div>
      ) : (
        <NutritionPanelClient products={products} copy={copy} />
      )}
    </main>
  );
}
