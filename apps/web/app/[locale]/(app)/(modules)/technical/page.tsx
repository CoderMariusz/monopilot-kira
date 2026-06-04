/**
 * T-036 — TEC-080 Technical Dashboard (module landing page).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:242-301 (TechDashboardScreen). Structural correspondence:
 *   - PageHeader "Technical dashboard" + breadcrumb         → other-screens.jsx:244-245
 *   - KPI strip (TEC_DASH_KPIS grid)                        → other-screens.jsx:246-248 (+ data.jsx:318-325, KPI tile bom-list.jsx:115-124)
 *   - 2-col area: Recent Changes + D365 Health/right rail   → other-screens.jsx:250-281
 *   - "Recent BOM changes" table                           → other-screens.jsx:283-299
 * The prototype's 6th tile + inline bar-chart/alerts are rolled into the
 * canonical 5-tile spec + the D365 Health card + Recent Changes; the bar-chart
 * (out of scope, "Real-time KPI streaming") is intentionally omitted (deviation
 * logged in closeout). All inline styles → Tailwind; all KPI numbers from real
 * Supabase reads via withOrgContext (no mocks). See `_meta/atomic-tasks/
 * UI-PROTOTYPE-PARITY-POLICY.md`.
 *
 * UI states: loading (Suspense skeleton), empty (zero tiles + empty timeline
 * copy), error (failed read → error banner), permission-denied (quick actions
 * gated by technical.items.create / technical.bom.create), optimistic — N/A
 * (read-only dashboard, no mutations).
 */
import Link from 'next/link';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { Card } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  getTechnicalDashboardKpis,
  type D365SyncStatus,
  type RecentChange,
} from './_actions/dashboard-kpis';
import { d365Tone, KpiStrip, type KpiTile } from './_components/kpi-strip';
import { RecentChangesPanel, type RecentChangeRow } from './_components/recent-changes';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type NavCard = { key: string; href: string };

// Nav cards → the Technical sub-areas. Paths are the canonical module routes;
// item-detail / bom / allergen / cost / factory-specs / sensory routes are
// owned by sibling agents — this page only links to them.
const NAV_CARDS: NavCard[] = [
  { key: 'items', href: '/technical/items' },
  { key: 'bom', href: '/technical/bom' },
  { key: 'allergen', href: '/technical/allergens-config' },
  { key: 'cost', href: '/technical/cost' },
  { key: 'routings', href: '/technical/routings' },
  { key: 'factorySpecs', href: '/technical/factory-specs' },
  { key: 'sensory', href: '/technical/sensory' },
  { key: 'compliance', href: '/technical/compliance' },
  { key: 'labResults', href: '/technical/lab-results' },
  { key: 'costImport', href: '/technical/costs/d365-import' },
  { key: 'shelfLife', href: '/technical/shelf-life' },
  { key: 'tooling', href: '/technical/tooling' },
  { key: 'bulkImport', href: '/technical/items/import' },
  { key: 'bomSnapshots', href: '/technical/boms/snapshots' },
  { key: 'd365', href: '/settings/integrations/d365' },
];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // Stable, locale-neutral YYYY-MM-DD HH:mm (UTC) — avoids hydration drift.
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
}

/** Skeleton placeholder matching the eventual layout (no CLS). */
function DashboardSkeleton() {
  return (
    <div data-testid="technical-dashboard-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

async function DashboardContent() {
  const t = await getTranslations('technical.dashboard');
  const result = await getTechnicalDashboardKpis();

  // ── Error state ─────────────────────────────────────────────────────────────
  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="technical-dashboard-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  const data = result.data;

  // ── KPI tiles (5, in prototype order) ──────────────────────────────────────
  const d365Label = (status: D365SyncStatus | null): string =>
    status ? t(`d365Status.${status}`) : t('d365Status.none');

  const tiles: KpiTile[] = [
    {
      key: 'active-items',
      label: t('kpi.activeItems.label'),
      value: data.activeItems.toLocaleString('en-US'),
      sub: t('kpi.activeItems.sub'),
      tone: 'default',
    },
    {
      key: 'pending-bom',
      label: t('kpi.pendingBom.label'),
      value: data.pendingBomApprovals.toLocaleString('en-US'),
      sub: t('kpi.pendingBom.sub'),
      tone: data.pendingBomApprovals > 0 ? 'info' : 'default',
    },
    {
      key: 'allergen-overrides',
      label: t('kpi.allergenOverrides.label'),
      value: data.openAllergenOverrides.toLocaleString('en-US'),
      sub: t('kpi.allergenOverrides.sub'),
      tone: data.openAllergenOverrides > 0 ? 'warning' : 'default',
    },
    {
      key: 'd365-sync',
      label: t('kpi.d365Sync.label'),
      value: d365Label(data.d365SyncStatus),
      sub: t('kpi.d365Sync.sub'),
      tone: d365Tone(data.d365SyncStatus),
    },
    {
      key: 'cost-review',
      label: t('kpi.costReview.label'),
      value: data.costReviewQueue.toLocaleString('en-US'),
      sub: t('kpi.costReview.sub'),
      tone: data.costReviewQueue > 0 ? 'danger' : 'default',
    },
  ];

  // ── Recent Changes rows ─────────────────────────────────────────────────────
  const resourceLabel = (rc: RecentChange): string => {
    const key = `resourceType.${rc.resourceType}`;
    const label = t(key);
    return label === key ? rc.resourceType : label;
  };
  const recentRows: RecentChangeRow[] = data.recentChanges.map((rc) => ({
    id: rc.id,
    when: formatWhen(rc.occurredAt),
    resourceLabel: resourceLabel(rc),
    actionLabel: rc.action,
    reference: rc.resourceId ? rc.resourceId.slice(0, 8) : '—',
  }));

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip tiles={tiles} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <RecentChangesPanel
          title={t('recentChanges.title')}
          rows={recentRows}
          emptyCopy={t('recentChanges.empty')}
          columnHeaders={{
            when: t('recentChanges.col.when'),
            resource: t('recentChanges.col.resource'),
            action: t('recentChanges.col.action'),
            reference: t('recentChanges.col.reference'),
          }}
        />

        {/* D365 Health + Quick Actions right rail */}
        <div className="flex flex-col gap-4">
          <Card
            data-testid="technical-d365-health"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-slate-900">{t('d365Health.title')}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {data.d365SyncStatus ? t(`d365Status.${data.d365SyncStatus}`) : t('d365Status.none')}
            </p>
            <Link
              href="/settings/integrations/d365"
              data-testid="technical-d365-health-link"
              className="mt-3 inline-flex text-sm font-medium text-sky-600 hover:text-sky-700"
            >
              {t('d365Health.open')}
            </Link>
          </Card>

          <Card
            data-testid="technical-quick-actions"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-slate-900">{t('quickActions.title')}</h2>
            <div className="mt-3 flex flex-col gap-2">
              {data.canCreateItem ? (
                <Link
                  href="/technical/items?modal=create"
                  data-testid="technical-quick-create-item"
                  className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  {t('quickActions.createItem')}
                </Link>
              ) : null}
              {data.canCreateBom ? (
                <Link
                  href="/technical/bom?modal=create"
                  data-testid="technical-quick-create-bom"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t('quickActions.createBom')}
                </Link>
              ) : null}
              {!data.canCreateItem && !data.canCreateBom ? (
                <p
                  role="note"
                  data-testid="technical-quick-actions-denied"
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                >
                  {t('quickActions.denied')}
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Nav cards → Technical sub-areas */}
      <nav aria-label={t('nav.label')} className="border-t border-slate-200 pt-6">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_CARDS.map((card) => (
            <li key={card.key}>
              <Link
                href={card.href}
                data-testid={`technical-nav-${card.key}`}
                className="flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-slate-100"
              >
                <span className="text-base font-semibold text-slate-950">{t(`nav.${card.key}.title`)}</span>
                <span className="mt-1 text-sm text-slate-600">{t(`nav.${card.key}.desc`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default async function TechnicalDashboardPage() {
  const t = await getTranslations('technical.dashboard');

  return (
    <main data-screen="technical-dashboard" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.dashboard') }]}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
