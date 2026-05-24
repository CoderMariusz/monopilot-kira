import { getTranslations } from 'next-intl/server';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

type IntegrationItem = {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'available';
  logo: string;
  color: string;
};

type IntegrationCategory = {
  category: string;
  items: IntegrationItem[];
};

type SyncActivity = {
  id: string;
  when: string;
  integration: string;
  direction: string;
  records: number;
  status: 'success' | 'failed';
};

type IntegrationsPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ view?: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  categories?: IntegrationCategory[];
  syncSummary?: { totalLast24h: number; failedLast24h: number };
  activity?: SyncActivity[];
};

type TranslationValues = Record<string, string | number>;
type Translator = (key: string, values?: TranslationValues) => string;

type IntegrationLabels = {
  title: string;
  subtitle: string;
  gridSubtitle: string;
  search: string;
  browseAll: (total: number) => string;
  connectedAvailable: (connected: number, total: number) => string;
  categorySummary: (connected: number, total: number) => string;
  connectedBadge: (connected: number) => string;
  kpiConnected: string;
  kpiCategories: string;
  kpiSyncLast24h: string;
  kpiFailedLast24h: string;
  loading: string;
  error: string;
  noIntegrationsConfigured: string;
  noCategoryIntegrations: (category: string) => string;
  emptyBody: string;
  emptyCategoryBody: string;
  browseCatalog: string;
  statusConnected: string;
  statusAvailable: string;
  configure: string;
  configureNamed: (name: string) => string;
  connect: string;
  connectedConfigure: string;
  activityTitle: string;
  activitySubtitle: string;
  columnWhen: string;
  columnIntegration: string;
  columnDirection: string;
  columnRecords: string;
  columnStatus: string;
  statusSuccess: string;
  statusFailedRetry: string;
};

// No production fallback catalog/activity rows. The default route renders the
// explicit empty state unless a live loader/test injects connector data.
const EMPTY_CATEGORIES: IntegrationCategory[] = [];
const EMPTY_ACTIVITY: SyncActivity[] = [];

function interpolate(template: string, values: TranslationValues = {}) {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? `{${name}}`));
}

function translate(t: Translator, key: string, fallback: string, values?: TranslationValues) {
  try {
    const value = t(key, values);
    if (value && value !== key) return value;
  } catch {
    // Locale message files for this new SET-110 namespace are outside this task's edit scope.
  }
  return interpolate(fallback, values);
}

async function getIntegrationLabels(locale: string): Promise<IntegrationLabels> {
  const t = (await getTranslations({ locale, namespace: 'settings.integrations_screen' })) as Translator;

  return {
    title: translate(t, 'title', 'Integrations'),
    subtitle: translate(
      t,
      'subtitle',
      'D365 (Dynamics 365), Peppol e-invoicing and Developer API keys. Scope per 02-SETTINGS PRD §4 + §11.',
    ),
    gridSubtitle: translate(t, 'gridSubtitle', 'Connect Monopilot to your ERP, accounting, BI, and shipping tools.'),
    search: translate(t, 'search', 'Search integrations'),
    browseAll: (total) => translate(t, 'browseAll', 'Browse all ({total})', { total }),
    connectedAvailable: (connected, total) =>
      translate(t, 'connectedAvailable', '{connected} connected · {total} available', { connected, total }),
    categorySummary: (connected, total) =>
      translate(t, 'categorySummary', '{connected} connected · {total} available', { connected, total }),
    connectedBadge: (connected) => translate(t, 'connectedBadge', '{connected} connected', { connected }),
    kpiConnected: translate(t, 'kpi.connected', 'Connected'),
    kpiCategories: translate(t, 'kpi.categories', 'Categories'),
    kpiSyncLast24h: translate(t, 'kpi.syncLast24h', 'Sync last 24h'),
    kpiFailedLast24h: translate(t, 'kpi.failedLast24h', 'Failed syncs last 24h'),
    loading: translate(t, 'states.loading', 'Loading integrations…'),
    error: translate(t, 'states.error', 'Unable to load integrations. Try refreshing or contact your administrator.'),
    noIntegrationsConfigured: translate(t, 'states.emptyTitle', 'No integrations configured'),
    noCategoryIntegrations: (category) =>
      translate(t, 'states.emptyCategoryTitle', 'No {category} integrations yet', { category: category.toLowerCase() }),
    emptyBody: translate(
      t,
      'states.emptyBody',
      'Browse the catalog to connect Monopilot to your ERP, accounting, BI, and shipping tools.',
    ),
    emptyCategoryBody: translate(
      t,
      'states.emptyCategoryBody',
      'Request a connector from the Monopilot team or browse the catalog for alternatives.',
    ),
    browseCatalog: translate(t, 'actions.browseCatalog', 'Browse catalog'),
    statusConnected: translate(t, 'status.connected', '● Connected'),
    statusAvailable: translate(t, 'status.available', '— Available'),
    configure: translate(t, 'actions.configure', 'Configure'),
    configureNamed: (name) => translate(t, 'actions.configureNamed', 'Configure {name}', { name }),
    connect: translate(t, 'actions.connect', 'Connect'),
    connectedConfigure: translate(t, 'actions.connectedConfigure', '✓ Connected · Configure'),
    activityTitle: translate(t, 'activity.title', 'Recent sync activity'),
    activitySubtitle: translate(
      t,
      'activity.subtitle',
      'D365 outbox events (shipment.confirmed, wo.confirmation_pushed, cost.posted) + pull (items.imported, bom.imported).',
    ),
    columnWhen: translate(t, 'activity.columns.when', 'When'),
    columnIntegration: translate(t, 'activity.columns.integration', 'Integration'),
    columnDirection: translate(t, 'activity.columns.direction', 'Direction'),
    columnRecords: translate(t, 'activity.columns.records', 'Records'),
    columnStatus: translate(t, 'activity.columns.status', 'Status'),
    statusSuccess: translate(t, 'status.success', '✓ Success'),
    statusFailedRetry: translate(t, 'status.failedRetry', '✗ Failed · Retry backoff'),
  };
}

function formatNumber(value: number, locale: string) {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

function integrationLogo(item: IntegrationItem) {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold text-white"
      style={{ background: item.color }}
    >
      {item.logo}
    </div>
  );
}

function kpiTestId(label: string) {
  return `settings-integrations-kpi-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function KpiCard({
  label,
  value,
  emphasis = false,
  prototypeDeviation,
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
  prototypeDeviation?: string;
}) {
  return (
    <Card
      data-testid="settings-integrations-kpi"
      data-kpi={label}
      data-prototype-deviation={prototypeDeviation}
      id={kpiTestId(label)}
      className={emphasis ? 'border-b-4 border-red-500' : undefined}
      style={{ margin: 0 }}
    >
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function PageHead({ total, labels }: { total: number; labels: IntegrationLabels }) {
  return (
    <header data-region="page-head" className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>
      <Button type="button" className="btn-secondary">
        {labels.browseAll(total)}
      </Button>
    </header>
  );
}

function GridHead({ connected, total, labels }: { connected: number; total: number; labels: IntegrationLabels }) {
  return (
    <header data-region="page-head" className="mb-4">
      <h1 className="text-2xl font-semibold">{labels.title}</h1>
      <p className="text-sm text-muted-foreground">{labels.gridSubtitle}</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="text-sm font-semibold">{labels.connectedAvailable(connected, total)}</div>
        <label className="w-[220px] text-xs text-muted-foreground">
          <span className="sr-only">{labels.search}</span>
          <Input aria-label={labels.search} placeholder={`${labels.search}…`} type="text" />
        </label>
      </div>
    </header>
  );
}

function CategorySection({ category, labels }: { category: IntegrationCategory; labels: IntegrationLabels }) {
  const connected = category.items.filter((item) => item.status === 'connected').length;
  const headingId = `settings-integrations-${category.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <section
      aria-labelledby={headingId}
      className="sg-section rounded-md border bg-white"
      data-testid="settings-integrations-category-section"
    >
      <div className="sg-section-head flex cursor-pointer items-center justify-between gap-4 border-b px-4 py-3">
        <div>
          <h2 id={headingId} className="sg-section-title text-base font-semibold">
            {category.category}
          </h2>
          <div className="sg-section-sub text-xs text-muted-foreground">{labels.categorySummary(connected, category.items.length)}</div>
        </div>
        <div className="flex items-center gap-2">
          {connected > 0 ? <Badge variant="success">{labels.connectedBadge(connected)}</Badge> : null}
          <span className="text-sm text-muted-foreground">▾</span>
        </div>
      </div>
      {category.items.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState
            icon="🔌"
            title={labels.noCategoryIntegrations(category.category)}
            body={labels.emptyCategoryBody}
            action={<Button type="button">{labels.browseCatalog}</Button>}
          />
        </div>
      ) : (
        category.items.map((item) => (
          <div key={item.id} className="int-row grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0">
            {integrationLogo(item)}
            <div>
              <div className="int-name text-sm font-semibold">{item.name}</div>
              <div className="int-desc text-xs text-muted-foreground">{item.description}</div>
            </div>
            <div>
              {item.status === 'connected' ? (
                <Badge variant="success">{labels.statusConnected}</Badge>
              ) : (
                <Badge variant="muted">{labels.statusAvailable}</Badge>
              )}
            </div>
            {item.status === 'connected' ? (
              <Button type="button" className="btn-secondary btn-sm">
                {labels.configure}
              </Button>
            ) : (
              <Button type="button" className="btn-primary btn-sm">
                {labels.connect}
              </Button>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function GridCatalog({ categories, labels }: { categories: IntegrationCategory[]; labels: IntegrationLabels }) {
  const all = categories.flatMap((category) => category.items.map((item) => ({ ...item, category: category.category })));

  return (
    <div className="sg-section rounded-md border bg-white">
      <div
        data-testid="settings-integrations-grid"
        data-layout="grid"
        className="sg-section-body grid gap-3 p-3 md:grid-cols-3"
        style={{ gridTemplateColumns: all.length === 0 ? '1fr' : undefined }}
      >
        {all.length === 0 ? (
          <EmptyState
            icon="🔌"
            title={labels.noIntegrationsConfigured}
            body={labels.emptyBody}
            action={<Button type="button">{labels.browseCatalog}</Button>}
          />
        ) : (
          all.map((item) => (
            <Card key={item.id} data-testid="settings-integration-grid-card" className="cursor-pointer p-3" style={{ margin: 0 }}>
              <div className="mb-2 flex gap-3">
                {integrationLogo(item)}
                <div>
                  <div className="text-sm font-semibold">{item.name}</div>
                  <div className="text-[11px] text-muted-foreground">{item.category}</div>
                </div>
              </div>
              <p className="mb-3 min-h-8 text-xs text-muted-foreground">{item.description}</p>
              {item.status === 'connected' ? (
                <Button type="button" className="btn-secondary btn-sm w-full">
                  {labels.connectedConfigure}
                </Button>
              ) : (
                <Button type="button" className="btn-primary btn-sm w-full">
                  {labels.connect}
                </Button>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityTable({ activity, labels, locale }: { activity: SyncActivity[]; labels: IntegrationLabels; locale: string }) {
  return (
    <section aria-labelledby="settings-integrations-activity-heading" className="sg-section mt-4 rounded-md border bg-white">
      <div className="sg-section-head border-b px-4 py-3">
        <h2 id="settings-integrations-activity-heading" className="sg-section-title text-base font-semibold">
          {labels.activityTitle}
        </h2>
        <p className="sg-section-sub text-xs text-muted-foreground">{labels.activitySubtitle}</p>
      </div>
      <div className="sg-section-body overflow-x-auto p-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{labels.columnWhen}</TableHead>
              <TableHead scope="col">{labels.columnIntegration}</TableHead>
              <TableHead scope="col">{labels.columnDirection}</TableHead>
              <TableHead scope="col">{labels.columnRecords}</TableHead>
              <TableHead scope="col">{labels.columnStatus}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activity.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="mono">{row.when}</TableCell>
                <TableCell>{row.integration}</TableCell>
                <TableCell>{row.direction}</TableCell>
                <TableCell className="mono num">{formatNumber(row.records, locale)}</TableCell>
                <TableCell>
                  {row.status === 'success' ? (
                    <Badge variant="success">{labels.statusSuccess}</Badge>
                  ) : (
                    <Badge variant="danger">{labels.statusFailedRetry}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({ params, searchParams, state, categories, syncSummary, activity }: IntegrationsPageProps) {
  const resolvedParams = await params;
  const locale = resolvedParams?.locale ?? 'en';
  const labels = await getIntegrationLabels(locale);
  const resolvedSearchParams = await searchParams;
  const view = resolvedSearchParams?.view === 'grid' ? 'grid' : 'list';
  const resolvedCategories = categories ?? EMPTY_CATEGORIES;
  const resolvedActivity = activity ?? EMPTY_ACTIVITY;
  const resolvedState = state ?? (resolvedCategories.length === 0 ? 'empty' : 'ready');
  const all = resolvedCategories.flatMap((category) => category.items);
  const connected = all.filter((item) => item.status === 'connected').length;
  const summary = syncSummary ?? { totalLast24h: 0, failedLast24h: resolvedActivity.filter((row) => row.status === 'failed').length };

  if (resolvedState === 'loading') {
    return (
      <main
        data-prototype-source="prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107"
        data-route="/settings/integrations"
        data-screen="integrations_screen"
        data-testid="settings-integrations-screen"
      >
        <div data-testid="settings-integrations-loading" aria-busy="true">
          {labels.loading}
        </div>
      </main>
    );
  }

  if (resolvedState === 'error') {
    return (
      <main
        data-prototype-source="prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107"
        data-route="/settings/integrations"
        data-screen="integrations_screen"
        data-testid="settings-integrations-screen"
      >
        <div role="alert">{labels.error}</div>
      </main>
    );
  }

  if (resolvedState === 'empty') {
    return (
      <main
        data-prototype-source="prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107"
        data-route="/settings/integrations"
        data-screen="integrations_screen"
        data-testid="settings-integrations-screen"
      >
        <h2>{labels.noIntegrationsConfigured}</h2>
        <EmptyState
          icon="🔌"
          title={labels.noIntegrationsConfigured}
          body={labels.emptyBody}
          action={<Button type="button">{labels.browseCatalog}</Button>}
        />
      </main>
    );
  }

  return (
    <main
      data-dialog-primitive="unavailable-in-ui-package"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107"
      data-route="/settings/integrations"
      data-screen="integrations_screen"
      data-testid="settings-integrations-screen"
      data-view={view}
      className="space-y-4"
    >
      {view === 'grid' ? <GridHead connected={connected} total={all.length} labels={labels} /> : <PageHead total={all.length} labels={labels} />}

      {view === 'grid' ? (
        <GridCatalog categories={resolvedCategories} labels={labels} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <KpiCard label={labels.kpiConnected} value={connected} />
            <KpiCard label={labels.kpiCategories} value={resolvedCategories.length} />
            <KpiCard label={labels.kpiSyncLast24h} value={formatNumber(summary.totalLast24h, locale)} />
            <KpiCard
              label={labels.kpiFailedLast24h}
              value={formatNumber(summary.failedLast24h, locale)}
              emphasis
              prototypeDeviation="Prototype KPI 'D365 DLQ (shipping)' is replaced by the production aggregate 'Failed syncs last 24h' required by SET-110 acceptance criteria."
            />
          </div>
          {resolvedCategories.map((category) => (
            <CategorySection key={category.category} category={category} labels={labels} />
          ))}
          <ActivityTable activity={resolvedActivity} labels={labels} locale={locale} />
        </>
      )}
    </main>
  );
}
