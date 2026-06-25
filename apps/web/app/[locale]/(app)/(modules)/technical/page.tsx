/**
 * T-036 — TEC-080 Technical Dashboard (module landing page).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:242-301 (TechDashboardScreen). Structural correspondence:
 *   - PageHeader "Technical dashboard" + breadcrumb + muted sub  → other-screens.jsx:244-245
 *   - KPI strip (TEC_DASH_KPIS grid, 3px accent, Inter values)   → other-screens.jsx:246-248 (+ data.jsx:318-325, KPI tile bom-list.jsx:115-124)
 *   - 2-col area: Recent Changes table + D365 Health/right rail  → other-screens.jsx:250-281
 *   - "Recent BOM changes" table (codes mono, neutral badges)    → other-screens.jsx:283-299
 *
 * Conformance to the LOCKED design system (MON-design-system): breadcrumb +
 * `.page-title` + one-line muted description, canonical `.kpi` 3px-accent tiles
 * (Inter 26/700 values, never mono), `.card` surfaces (no shadow / no gradient),
 * dense raw `.table`, `.btn`/`.btn-primary`/`.btn-secondary` actions (primary is
 * always `--blue`), 5 semantic badge tones, `.empty-state` for the timeline,
 * `.alert .alert-red` error banner. The prototype's bar-chart + static alert box
 * (out of scope, "real-time KPI streaming") are intentionally rolled into the
 * canonical 5-tile spec + the D365 Health card (deviation logged in closeout).
 * All KPI numbers + the timeline come from real Supabase reads via
 * withOrgContext — no mocks. See `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
 *
 * UI states: loading (Suspense skeleton), empty (zero tiles + empty timeline
 * copy), error (failed read → `.alert` banner), permission-denied (quick actions
 * gated by technical.items.create / technical.bom.create), optimistic — N/A
 * (read-only dashboard, no mutations).
 */
import Link from 'next/link';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

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

type TechnicalDashboardPageProps = {
  params: Promise<{ locale: string }>;
};

// Nav cards → the Technical sub-areas. Paths are the canonical module routes;
// item-detail / bom / allergen / cost / factory-specs / sensory routes are
// owned by sibling agents — this page only links to them. D365 now lives in
// Settings › Integrations (2026-06-05 relocation decision).
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

/** Skeleton placeholder matching the eventual layout (no CLS, no shadow). */
function DashboardSkeleton() {
  return (
    <div data-testid="technical-dashboard-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="kpi-row">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="kpi" style={{ height: 78, opacity: 0.4 }} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card" style={{ height: 256, opacity: 0.4 }} />
        <div className="card" style={{ height: 256, opacity: 0.4 }} />
      </div>
    </div>
  );
}

async function DashboardContent({ locale }: { locale: string }) {
  const t = await getTranslations('technical.dashboard');
  const result = await getTechnicalDashboardKpis();

  // ── Error state ─────────────────────────────────────────────────────────────
  if (!result.ok) {
    return (
      <div role="alert" data-testid="technical-dashboard-error" className="alert alert-red">
        <div className="alert-title">{t('error')}</div>
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
    <div className="flex flex-col gap-4">
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
          <div data-testid="technical-d365-health" className="card" style={{ marginBottom: 0 }}>
            <div className="card-head" style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>{t('d365Health.title')}</strong>
            </div>
            <p className="helper" style={{ marginTop: 0 }}>
              {data.d365SyncStatus ? t(`d365Status.${data.d365SyncStatus}`) : t('d365Status.none')}
            </p>
            <Link
              href={`/${locale}/settings/integrations/d365`}
              data-testid="technical-d365-health-link"
              style={{ color: 'var(--blue)', fontSize: 13, fontWeight: 500, marginTop: 10, display: 'inline-flex' }}
            >
              {t('d365Health.open')}
            </Link>
          </div>

          <div data-testid="technical-quick-actions" className="card" style={{ marginBottom: 0 }}>
            <div className="card-head" style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>{t('quickActions.title')}</strong>
            </div>
            <div className="flex flex-col gap-2">
              {data.canCreateItem ? (
                <Link
                  href={`/${locale}/technical/items?modal=create`}
                  data-testid="technical-quick-create-item"
                  className="btn btn-primary"
                  style={{ justifyContent: 'center' }}
                >
                  {t('quickActions.createItem')}
                </Link>
              ) : null}
              {data.canCreateBom ? (
                <Link
                  href={`/${locale}/technical/bom?modal=create`}
                  data-testid="technical-quick-create-bom"
                  className="btn btn-secondary"
                  style={{ justifyContent: 'center' }}
                >
                  {t('quickActions.createBom')}
                </Link>
              ) : null}
              {!data.canCreateItem && !data.canCreateBom ? (
                <div role="note" data-testid="technical-quick-actions-denied" className="alert alert-amber" style={{ marginBottom: 0 }}>
                  {t('quickActions.denied')}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Nav cards → Technical sub-areas */}
      <nav aria-label={t('nav.label')} style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {NAV_CARDS.map((card) => (
            <li key={card.key}>
              <Link
                href={`/${locale}${card.href}`}
                data-testid={`technical-nav-${card.key}`}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  marginBottom: 0,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t(`nav.${card.key}.title`)}</span>
                <span className="helper" style={{ marginTop: 4 }}>
                  {t(`nav.${card.key}.desc`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default async function TechnicalDashboardPage({ params }: TechnicalDashboardPageProps) {
  const { locale } = await params;
  const t = await getTranslations('technical.dashboard');

  return (
    <main data-screen="technical-dashboard" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {t('breadcrumb.technical')} / {t('breadcrumb.dashboard')}
      </nav>
      <header>
        <h1 className="page-title">{t('title')}</h1>
        <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
      </header>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent locale={locale} />
      </Suspense>
    </main>
  );
}
