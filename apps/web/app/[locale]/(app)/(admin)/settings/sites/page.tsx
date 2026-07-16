import { getTranslations } from 'next-intl/server';

import {
  createLine,
  createSite,
  getLinesForSite,
  readSitesSettingsData,
  updateLine,
  updateSiteSettings,
  type CreateLineInput,
  type CreateSiteInput,
  type LineRow,
  type SiteSettings,
  type UpdateLineInput,
} from './_actions/sites';
import SitesScreen, { type SitesModalLabels, type SitesScreenLabels } from './sites-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

const LABEL_NAMESPACE = 'settings.sites';

async function buildLabels(locale: string): Promise<SitesScreenLabels> {
  const t = await getTranslations({ locale, namespace: LABEL_NAMESPACE });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    addSite: t('add_site'),
    sitesTitle: t('sites_title'),
    mapRegionFallback: t('map_region_fallback'),
    primaryBadge: t('primary_badge'),
    siteMeta: t('site_meta'),
    edit: t('edit'),
    addLine: t('add_line'),
    emptySites: t('empty_sites'),
    emptyLines: t('empty_lines'),
    columns: {
      line: t('column_line'),
      type: t('column_type'),
      workers: t('column_workers'),
      status: t('column_status'),
    },
    statusActive: t('status_active'),
    statusMaintenance: t('status_maintenance'),
    siteSettingsTitle: t('site_settings_title'),
    primarySite: t('primary_site'),
    primarySiteHint: t('primary_site_hint'),
    operatingHours: t('operating_hours'),
    haccp: t('haccp'),
    haccpValid: t('haccp_valid'),
    haccpDisabled: t('haccp_disabled'),
    haccpExpires: t('haccp_expires'),
  };
}

async function buildModalLabels(locale: string): Promise<SitesModalLabels> {
  const t = await getTranslations({ locale, namespace: LABEL_NAMESPACE });
  return {
    addSiteTitle: t('modal.addSiteTitle'),
    addLineTitle: t('modal.addLineTitle'),
    editLineTitle: t('modal.editLineTitle'),
    editSiteSettingsTitle: t('modal.editSiteSettingsTitle'),
    fieldSiteCode: t('modal.fieldSiteCode'),
    fieldName: t('modal.fieldName'),
    fieldTimezone: t('modal.fieldTimezone'),
    fieldCountry: t('modal.fieldCountry'),
    fieldLegalEntity: t('modal.fieldLegalEntity'),
    fieldPrimary: t('modal.fieldPrimary'),
    fieldOperatingHours: t('modal.fieldOperatingHours'),
    fieldHaccpEnabled: t('modal.fieldHaccpEnabled'),
    fieldHaccpValidUntil: t('modal.fieldHaccpValidUntil'),
    fieldLineCode: t('modal.fieldLineCode'),
    fieldStatus: t('modal.fieldStatus'),
    statusActive: t('modal.statusActive'),
    statusMaintenance: t('modal.statusMaintenance'),
    statusInactive: t('modal.statusInactive'),
    required: t('modal.required'),
    cancel: t('modal.cancel'),
    save: t('modal.save'),
    saving: t('modal.saving'),
    errorRequired: t('modal.errorRequired'),
    errorDuplicate: t('modal.errorDuplicate'),
    errorWarehouseSiteMismatch: t('modal.errorWarehouseSiteMismatch'),
    errorForbidden: t('modal.errorForbidden'),
    errorGeneric: t('modal.errorGeneric'),
  };
}

/**
 * Server boundary for the canonical Sites & production lines screen.
 *
 * Loads the org-scoped sites (+ the first site's lines) via the real Supabase
 * data layer (`_actions/sites.ts`, `withOrgContext`) and hands them to the
 * client screen. Site selection in the client lazily fetches that site's lines
 * through the `loadLinesForSelectedSite` inline server action — passed by
 * reference (not wrapped in a closure) so Next.js can serialize it across the
 * RSC boundary.
 */
export default async function SitesSettingsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };

  const [labels, modalLabels, data] = await Promise.all([
    buildLabels(locale),
    buildModalLabels(locale),
    readSitesSettingsData(),
  ]);

  async function loadLinesForSelectedSite(siteId: string): Promise<LineRow[]> {
    'use server';
    return getLinesForSite(data.org_id, siteId);
  }

  // Inline server actions wrapping the canonical `_actions/sites.ts` mutations.
  // Each is `'use server'` and passed by reference so Next.js can serialize it
  // across the RSC boundary; the action re-verifies org + permission internally.
  async function createSiteAction(input: CreateSiteInput) {
    'use server';
    return createSite(input);
  }

  async function createLineAction(input: CreateLineInput) {
    'use server';
    return createLine(input);
  }

  async function updateLineAction(input: UpdateLineInput) {
    'use server';
    return updateLine(input);
  }

  async function updateSiteSettingsAction(orgId: string, siteId: string, settings: Partial<SiteSettings>) {
    'use server';
    return updateSiteSettings(orgId, siteId, settings);
  }

  return (
    <SitesScreen
      sites={data.sites}
      initialSelectedSiteId={data.selected_site_id}
      initialLines={data.lines}
      canEdit={data.can_edit}
      labels={labels}
      modalLabels={modalLabels}
      loadLines={loadLinesForSelectedSite}
      createSiteAction={createSiteAction}
      createLineAction={createLineAction}
      updateLineAction={updateLineAction}
      updateSiteSettingsAction={updateSiteSettingsAction}
    />
  );
}
