import { getTranslations } from 'next-intl/server';

import { getBoms, getBomSettings, updateBomSettings, type BomSettings, type UpdateBomSettingsResult } from './_actions/boms';
import BomsScreen, { type BomsScreenLabels } from './boms-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

async function buildLabels(locale: string): Promise<BomsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.boms' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    kpiActive: t('kpi_active'),
    kpiDraft: t('kpi_draft'),
    kpiArchived: t('kpi_archived'),
    tableTitle: t('table_title'),
    emptyTable: t('empty_table'),
    loadError: t('load_error'),
    columns: {
      bomNumber: t('column_bom_number'),
      product: t('column_product'),
      version: t('column_version'),
      ingredients: t('column_ingredients'),
      lastUpdated: t('column_last_updated'),
      status: t('column_status'),
    },
    statusActive: t('status_active'),
    statusDraft: t('status_draft'),
    statusArchived: t('status_archived'),
    settingsTitle: t('settings_title'),
    settingsSubtitle: t('settings_subtitle'),
    autoCalcLabel: t('auto_calc_label'),
    autoCalcHint: t('auto_calc_hint'),
    allergenLabel: t('allergen_label'),
    allergenHint: t('allergen_hint'),
    retentionLabel: t('retention_label'),
    retentionHint: t('retention_hint'),
    retentionAll: t('retention_all'),
    save: t('save'),
    saving: t('saving'),
    saved: t('saved'),
    saveErrorForbidden: t('save_error_forbidden'),
    saveErrorGeneric: t('save_error_generic'),
  };
}

export default async function BomsSettingsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };

  // The loaders are individually try/catch'd and degrade to empty/default data,
  // so wrap the whole batch to detect a hard org-context failure and surface a
  // loud error state rather than a silently-empty screen.
  let loadError = false;
  let boms = { kpis: { active: 0, draft: 0, archived: 0 }, rows: [] as Awaited<ReturnType<typeof getBoms>>['rows'] };
  let settings: BomSettings = { autoCalculateNutrition: true, requireAllergenReview: true, retention: '10' };

  const [labels, bomsResult, settingsResult] = await Promise.allSettled([
    buildLabels(locale),
    getBoms(),
    getBomSettings(),
  ]);

  if (labels.status === 'rejected') {
    // i18n failure is unrecoverable for this render — re-throw to the error boundary.
    throw labels.reason;
  }
  if (bomsResult.status === 'fulfilled') {
    boms = bomsResult.value;
  } else {
    loadError = true;
  }
  if (settingsResult.status === 'fulfilled') {
    settings = settingsResult.value;
  } else {
    loadError = true;
  }

  async function onSaveSettings(next: BomSettings): Promise<UpdateBomSettingsResult> {
    'use server';
    return updateBomSettings(null, next);
  }

  return (
    <BomsScreen
      rows={boms.rows}
      kpis={boms.kpis}
      settings={settings}
      loadError={loadError}
      canEdit
      onSaveSettings={onSaveSettings}
      labels={labels.value}
    />
  );
}
