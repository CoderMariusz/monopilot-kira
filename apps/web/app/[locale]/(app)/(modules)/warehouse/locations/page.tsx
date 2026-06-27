/**
 * WH-018 — Locations hierarchy route (/warehouse/locations).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   other-screens.jsx:156-279 (WhLocations, data-prototype-label:
 *   locations_hierarchy_page) — ltree location tree (warehouse → zone → bin),
 *   per-node code/name/level/LP-count, search filter, and an Admin edit affordance.
 *   Per-region anchors + deviations live in
 *   locations/_components/locations-tree.client.tsx.
 *
 * Data: the reviewed listLocations read (warehouse/_actions/location-read-actions.ts,
 * imported never authored) for the tree, plus listLPs({ limit: 500 }) to DERIVE
 * per-location LP counts client-side (listLocations carries no count — the cap is
 * surfaced honestly in the client). Both run inside withOrgContext (RLS-scoped).
 * RBAC (warehouse.inventory.read) is enforced server-side inside the actions; a
 * `forbidden` result renders the permission panel and never trusts a client flag.
 *
 * Location CRUD is OWNED BY SETTINGS — this screen links to
 * /settings/infra/locations for edits (the prototype's inline edit modal is
 * red-lined as deferred in the client). No write actions are imported here.
 *
 * i18n: the `warehouse` namespace is not yet merged into next-intl, so labels are
 * resolved server-side from the staged warehouse-facility bundle via
 * getWhFacilityTranslator (en + pl real, EN fallback). No inline JSX strings.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (no locations), error
 * (failed read → banner), permission-denied (forbidden → panel). Optimistic — N/A
 * (read-only surface).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listLocations } from '../_actions/location-read-actions';
import { listLPs } from '../_actions/lp-actions';
import { getWhFacilityTranslator } from '../wh-facility-labels';
import { LocationsTreeClient, type LocationsTreeLabels } from './_components/locations-tree.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/warehouse/other-screens.jsx:156-279';

/** Honest cap for the derived LP counts (mirrors the listLPs read below). */
const LP_COUNT_CAP = 500;

function buildLabels(t: ReturnType<typeof getWhFacilityTranslator>): LocationsTreeLabels {
  return {
    searchPlaceholder: t('locations.searchPlaceholder'),
    searchLabel: t('locations.searchLabel'),
    empty: t('locations.empty'),
    emptyFiltered: t('locations.emptyFiltered'),
    manageLink: t('locations.manageLink'),
    manageHint: t('locations.manageHint'),
    rowsLabel: t('locations.rowsLabel'),
    lpCountLabel: t('locations.lpCountLabel'),
    lpCountLabelPlural: t('locations.lpCountLabelPlural'),
    lpCountCapNote: t('locations.lpCountCapNote'),
    warehouseUnassigned: t('locations.warehouseUnassigned'),
    siteUnassigned: t('locations.siteUnassigned'),
    levelLabel: t('locations.levelLabel'),
    deferredNote: t('locations.deferredNote'),
  };
}

function ListSkeleton() {
  return (
    <div data-testid="locations-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale }: { locale: string }) {
  const t = getWhFacilityTranslator(locale);
  const [locResult, lpResult] = await Promise.all([listLocations({ limit: 500 }), listLPs({ limit: LP_COUNT_CAP })]);

  // Permission-denied (server-resolved by the actions).
  if (
    (!locResult.ok && locResult.reason === 'forbidden') ||
    (!lpResult.ok && lpResult.reason === 'forbidden')
  ) {
    return (
      <div
        role="alert"
        data-testid="locations-denied"
        data-state="permission-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('locations.denied')}
      </div>
    );
  }

  // Error (the location read is required; a failed LP read only degrades counts).
  if (!locResult.ok) {
    return (
      <div
        role="alert"
        data-testid="locations-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('locations.error')}
      </div>
    );
  }

  // Derive per-location LP counts from the capped LP read (honest undercount).
  const lpCountByCode: Record<string, number> = {};
  if (lpResult.ok) {
    for (const lp of lpResult.data) {
      if (lp.locationCode) lpCountByCode[lp.locationCode] = (lpCountByCode[lp.locationCode] ?? 0) + 1;
    }
  }

  return (
    <LocationsTreeClient
      locations={locResult.data}
      lpCountByCode={lpCountByCode}
      lpCountCap={LP_COUNT_CAP}
      labels={buildLabels(t)}
      manageHref={`/${locale}/settings/infra/locations`}
    />
  );
}

export default async function LocationsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getWhFacilityTranslator(locale);

  return (
    <main
      data-screen="warehouse-locations"
      data-prototype-label="locations_hierarchy_page"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('locations.title')}
        subtitle={t('locations.subtitle')}
        breadcrumb={[
          { label: t('locations.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('locations.breadcrumb.locations') },
        ]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
