import { getTranslations } from 'next-intl/server';

import { getLinesForSite, readSitesSettingsData, type LineRow } from './_actions/sites';
import SitesScreen, { type SitesScreenLabels } from './sites-screen.client';

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
    importLines: t('import_lines'),
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

  const [labels, data] = await Promise.all([buildLabels(locale), readSitesSettingsData()]);

  async function loadLinesForSelectedSite(siteId: string): Promise<LineRow[]> {
    'use server';
    return getLinesForSite(data.org_id, siteId);
  }

  return (
    <SitesScreen
      sites={data.sites}
      initialSelectedSiteId={data.selected_site_id}
      initialLines={data.lines}
      canEdit={data.can_edit}
      labels={labels}
      loadLines={loadLinesForSelectedSite}
    />
  );
}
