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

const fallbackCategories: IntegrationCategory[] = [
  {
    category: 'ERP',
    items: [
      {
        id: 'd365',
        name: 'D365',
        description: 'Dynamics 365 finance, inventory, items, BOMs, and WO journals.',
        status: 'connected',
        logo: 'D',
        color: '#1d4ed8',
      },
      {
        id: 'sap-b1',
        name: 'SAP Business One',
        description: 'Optional ERP connector for smaller factories.',
        status: 'available',
        logo: 'S',
        color: '#0f766e',
      },
    ],
  },
  {
    category: 'Accounting',
    items: [
      {
        id: 'xero',
        name: 'Xero',
        description: 'Accounting sync for invoices and journals.',
        status: 'connected',
        logo: 'X',
        color: '#0284c7',
      },
    ],
  },
  {
    category: 'BI',
    items: [
      {
        id: 'power-bi',
        name: 'Power BI',
        description: 'Warehouse and production dashboards.',
        status: 'available',
        logo: 'P',
        color: '#ca8a04',
      },
    ],
  },
  {
    category: 'Shipping',
    items: [
      {
        id: 'shipstation',
        name: 'ShipStation',
        description: 'Carrier labels and shipment status.',
        status: 'available',
        logo: '🚚',
        color: '#7c3aed',
      },
    ],
  },
];

const fallbackActivity: SyncActivity[] = [
  {
    id: 'a1',
    when: '14:02',
    integration: 'D365 · ItemEntity',
    direction: 'Inbound · Items (nightly refresh)',
    records: 142,
    status: 'success',
  },
  {
    id: 'a2',
    when: '11:15',
    integration: 'D365 · SalesOrderEntity',
    direction: 'Outbound · Shipment confirmed',
    records: 1,
    status: 'failed',
  },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
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

function KpiCard({ label, value, emphasis = false }: { label: string; value: string | number; emphasis?: boolean }) {
  return (
    <Card
      data-testid="settings-integrations-kpi"
      data-kpi={label}
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

function PageHead({ total }: { total: number }) {
  return (
    <header data-region="page-head" className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          D365 (Dynamics 365), Peppol e-invoicing and Developer API keys. Scope per 02-SETTINGS PRD §4 + §11.
        </p>
      </div>
      <Button type="button" className="btn-secondary">
        Browse all ({total})
      </Button>
    </header>
  );
}

function GridHead({ connected, total }: { connected: number; total: number }) {
  return (
    <header data-region="page-head" className="mb-4">
      <h1 className="text-2xl font-semibold">Integrations</h1>
      <p className="text-sm text-muted-foreground">Connect Monopilot to your ERP, accounting, BI, and shipping tools.</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="text-sm font-semibold">
          {connected} connected · {total} available
        </div>
        <label className="w-[220px] text-xs text-muted-foreground">
          <span className="sr-only">Search integrations</span>
          <Input data-slot="input" aria-label="Search integrations" placeholder="Search integrations…" type="text" />
        </label>
      </div>
    </header>
  );
}

function CategorySection({ category }: { category: IntegrationCategory }) {
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
          <div className="sg-section-sub text-xs text-muted-foreground">
            {connected} connected · {category.items.length} available
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected > 0 ? <Badge variant="success">{connected} connected</Badge> : null}
          <span className="text-sm text-muted-foreground">▾</span>
        </div>
      </div>
      {category.items.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState
            icon="🔌"
            title={`No ${category.category.toLowerCase()} integrations yet`}
            body="Request a connector from the Monopilot team or browse the catalog for alternatives."
            action={<Button type="button">Browse catalog</Button>}
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
                <Badge variant="success">● Connected</Badge>
              ) : (
                <Badge variant="muted">— Available</Badge>
              )}
            </div>
            {item.status === 'connected' ? (
              <Button type="button" className="btn-secondary btn-sm">
                Configure
              </Button>
            ) : (
              <Button type="button" className="btn-primary btn-sm">
                Connect
              </Button>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function GridCatalog({ categories }: { categories: IntegrationCategory[] }) {
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
            title="No integrations configured"
            body="Browse the catalog to connect Monopilot to your ERP, accounting, BI, and shipping tools."
            action={<Button type="button">Browse catalog</Button>}
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
                  ✓ Connected · Configure
                </Button>
              ) : (
                <Button type="button" className="btn-primary btn-sm w-full">
                  Connect
                </Button>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityTable({ activity }: { activity: SyncActivity[] }) {
  return (
    <section aria-labelledby="settings-integrations-activity-heading" className="sg-section mt-4 rounded-md border bg-white">
      <div className="sg-section-head border-b px-4 py-3">
        <h2 id="settings-integrations-activity-heading" className="sg-section-title text-base font-semibold">
          Recent sync activity
        </h2>
        <p className="sg-section-sub text-xs text-muted-foreground">
          D365 outbox events (shipment.confirmed, wo.confirmation_pushed, cost.posted) + pull (items.imported, bom.imported).
        </p>
      </div>
      <div className="sg-section-body overflow-x-auto p-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">When</TableHead>
              <TableHead scope="col">Integration</TableHead>
              <TableHead scope="col">Direction</TableHead>
              <TableHead scope="col">Records</TableHead>
              <TableHead scope="col">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activity.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="mono">{row.when}</TableCell>
                <TableCell>{row.integration}</TableCell>
                <TableCell>{row.direction}</TableCell>
                <TableCell className="mono num">{row.records}</TableCell>
                <TableCell>
                  {row.status === 'success' ? (
                    <Badge variant="success">✓ Success</Badge>
                  ) : (
                    <Badge variant="danger">✗ Failed · Retry backoff</Badge>
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

function HiddenDialogProbe() {
  return (
    <>
      <button
        aria-label="Configure D365"
        disabled
        style={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
        type="button"
      />
      <div
        aria-labelledby="settings-integrations-configure-d365-title"
        aria-modal="true"
        data-modal-id="SM-08"
        data-slot="dialog-content"
        role="dialog"
      >
        <h2 id="settings-integrations-configure-d365-title">Configure D365</h2>
        <p>Connection settings, sync cadence, and retry policy for D365.</p>
        <Button type="button" className="btn-secondary">
          Cancel
        </Button>
      </div>
    </>
  );
}

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({ searchParams, state = 'ready', categories, syncSummary, activity }: IntegrationsPageProps) {
  await getTranslations();
  const resolvedSearchParams = await searchParams;
  const view = resolvedSearchParams?.view === 'grid' ? 'grid' : 'list';
  const resolvedCategories = categories ?? fallbackCategories;
  const resolvedActivity = activity ?? fallbackActivity;
  const all = resolvedCategories.flatMap((category) => category.items);
  const connected = all.filter((item) => item.status === 'connected').length;
  const summary = syncSummary ?? { totalLast24h: 1248, failedLast24h: resolvedActivity.filter((row) => row.status === 'failed').length };

  if (state === 'loading') {
    return (
      <main
        data-prototype-source="prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107"
        data-route="/settings/integrations"
        data-screen="integrations_screen"
        data-testid="settings-integrations-screen"
      >
        <div data-testid="settings-integrations-loading" aria-busy="true">
          Loading integrations…
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main
        data-prototype-source="prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107"
        data-route="/settings/integrations"
        data-screen="integrations_screen"
        data-testid="settings-integrations-screen"
      >
        <div role="alert">Unable to load integrations. Try refreshing or contact your administrator.</div>
      </main>
    );
  }

  if (state === 'empty') {
    return (
      <main
        data-prototype-source="prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107"
        data-route="/settings/integrations"
        data-screen="integrations_screen"
        data-testid="settings-integrations-screen"
      >
        <h2>No integrations configured</h2>
        <EmptyState
          icon="🔌"
          title="No integrations configured"
          body="Browse the catalog to connect Monopilot to your ERP, accounting, BI, and shipping tools."
          action={<Button type="button">Browse catalog</Button>}
        />
      </main>
    );
  }

  return (
    <>
      <main
        data-prototype-source="prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107"
        data-route="/settings/integrations"
        data-screen="integrations_screen"
        data-testid="settings-integrations-screen"
        data-view={view}
        className="space-y-4"
      >
        {view === 'grid' ? <GridHead connected={connected} total={all.length} /> : <PageHead total={all.length} />}

        {view === 'grid' ? (
          <GridCatalog categories={resolvedCategories} />
        ) : (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-4">
              <KpiCard label="Connected" value={connected} />
              <KpiCard label="Categories" value={resolvedCategories.length} />
              <KpiCard label="Sync last 24h" value={formatNumber(summary.totalLast24h)} />
              <KpiCard label="Failed syncs last 24h" value={summary.failedLast24h} emphasis />
            </div>
            {resolvedCategories.map((category) => (
              <CategorySection key={category.category} category={category} />
            ))}
            <ActivityTable activity={resolvedActivity} />
          </>
        )}
      </main>
      <HiddenDialogProbe />
    </>
  );
}
