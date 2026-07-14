/**
 * @vitest-environment jsdom
 * T-062 / SET-081 — D365 field mapping RED tests.
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:109-146.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      title: 'D365 field mapping',
      subtitle: 'Export-only field map (Monopilot → D365). Mapping is deployed via CI/CD.',
      exportCsv: 'Export mapping CSV',
      testConnection: 'Test connection',
      changeNotice:
        'Mapping is deployed via CI/CD. To change a mapping, raise a PR in the monopilot/integrations-d365 repo.',
      unmappedAlert: 'Item.allergens[] is unmapped in D365 field mapping.',
      all: 'All ({count})',
      incoming: 'Monopilot → D365 ({count})',
      outgoing: 'Monopilot → D365 ({count})',
      directionFilterLabel: 'Translated D365 mapping direction filter',
      fieldLevelMap: 'Translated field-level mapping section',
      d365Field: 'D365 field',
      direction: 'Direction',
      monopilotField: 'Monopilot field',
      type: 'Type',
      transform: 'Transform',
      loading: 'Loading D365 field mapping…',
      empty: 'No D365 field mappings found.',
      error: 'Unable to load D365 field mapping.',
      exportReady: 'CSV export ready',
      testConnectionDialogTitle: 'Translated D365 connection diagnostics',
      testConnectionDialogBody: 'Translated endpoint, Azure AD, and mapping export checks are read-only on SET-081.',
      close: 'Translated close',
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  }),
}));

vi.mock('@monopilot/ui/Modal', async () => {
  const React = await import('react');

  return {
    default: function MockSharedModal({
      children,
      open,
      modalId,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      size?: string;
      modalId?: string;
    }) {
      if (!open) return null;
      return React.createElement(
        'div',
        {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': 'Translated D365 connection diagnostics — Test connection',
          'data-testid': 'shared-ui-modal-primitive',
          'data-modal-id': modalId,
          'data-focus-trap': 'radix-dialog',
        },
        children,
      );
    },
  };
});

type D365Direction = 'incoming' | 'outgoing' | 'both';

type D365FieldMapping = {
  d365_field: string;
  direction: D365Direction;
  monopilot_field: string;
  type: string;
  transform: string;
  unmapped?: boolean;
};

type D365ConnectionTestResult =
  | { status: 'ok'; latencyMs: number; environment: string }
  | { status: 'error'; reason: string };

type ExportD365MappingCsv = (input?: { dir?: 'all' | D365Direction; rows?: D365FieldMapping[] }) =>
  | Response
  | Promise<Response>;

type D365MappingPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ dir?: 'all' | D365Direction }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  rows?: D365FieldMapping[];
  exportD365MappingCsv?: ExportD365MappingCsv;
  testD365Connection?: () => Promise<D365ConnectionTestResult>;
};

type D365MappingPage = (props: D365MappingPageProps) => React.ReactNode | Promise<React.ReactNode>;

const mappingRows: D365FieldMapping[] = [
  {
    d365_field: 'InventTable.ItemId',
    direction: 'incoming',
    monopilot_field: 'products.sku',
    type: 'text',
    transform: 'none',
  },
  {
    d365_field: 'VendTable.CurrencyCode',
    direction: 'incoming',
    monopilot_field: 'partners.currency',
    type: 'enum',
    transform: 'upper',
  },
  {
    d365_field: 'SalesTable.SalesId',
    direction: 'outgoing',
    monopilot_field: 'planning.d365_so_ref',
    type: 'text',
    transform: 'prefix:SO-',
  },
  {
    d365_field: 'Item.allergens[]',
    direction: 'outgoing',
    monopilot_field: 'products.allergens',
    type: 'json',
    transform: 'unmapped',
    unmapped: true,
  },
];

const repoRoot = process.cwd().endsWith('/apps/web') ? join(process.cwd(), '../..') : process.cwd();
const routeDir = join(
  repoRoot,
  'apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/mapping',
);
const routeFilePath = join(routeDir, 'page.tsx');

async function routeClientLeafSources() {
  if (!existsSync(routeDir)) return [];
  const entries = await readdir(routeDir);
  const clientFiles = entries.filter((entry) => entry.endsWith('.client.tsx'));
  return Promise.all(
    clientFiles.map(async (entry) => ({
      entry,
      source: await readFile(join(routeDir, entry), 'utf8'),
    })),
  );
}

async function loadD365MappingPage(): Promise<D365MappingPage> {
  const routePath = routeFilePath;

  if (!existsSync(routePath)) {
    return function MissingD365MappingPage() {
      return React.createElement('main', { 'data-testid': 'missing-d365-mapping-page' });
    };
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(
    mod.default,
    'T-062 D365 mapping page must default-export a renderable React component at app/[locale]/(app)/(admin)/settings/integrations/d365/mapping/page.tsx',
  ).toEqual(expect.any(Function));
  return mod.default as D365MappingPage;
}

async function loadExportAction(): Promise<ExportD365MappingCsv> {
  const routePath = routeFilePath;

  if (!existsSync(routePath)) {
    return async () => new Response('', { status: 501 });
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(
    mod.exportD365MappingCsv,
    'T-062 must export a Server Action named exportD365MappingCsv for the Export mapping CSV button',
  ).toEqual(expect.any(Function));
  return mod.exportD365MappingCsv as ExportD365MappingCsv;
}

async function renderD365MappingPage(overrides: Partial<D365MappingPageProps> = {}) {
  const Page = await loadD365MappingPage();
  const props: D365MappingPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    state: 'ready',
    rows: mappingRows,
    exportD365MappingCsv: vi.fn(async () =>
      new Response('d365_field,direction,monopilot_field,type,transform\n', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="d365-field-mapping.csv"',
        },
      }),
    ),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function screenRoot() {
  return screen.getByTestId('settings-d365-mapping-screen');
}

function mappingRowsInDom() {
  return within(screenRoot()).getAllByTestId('settings-d365-mapping-row');
}

function rowTexts() {
  return mappingRowsInDom().map((row) => row.textContent ?? '');
}

function assertModalA11y(dialog: HTMLElement, name: RegExp) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(name);
  expect(within(dialog).getByRole('button', { name: /close|cancel/i })).toBeInTheDocument();
}

function structuralSnapshot() {
  const root = screenRoot();
  return {
    prototypeSource: root.getAttribute('data-prototype-source'),
    route: root.getAttribute('data-route'),
    screen: root.getAttribute('data-screen'),
    regions: Array.from(root.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    ),
    actions: within(root).getAllByRole('button').slice(0, 5).map((button) => button.textContent?.trim()),
    tableHeaders: within(root).getAllByRole('columnheader').map((header) => header.textContent),
    rows: rowTexts(),
  };
}

describe('T-062 D365 mapping localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/integrations/d365/mapping route under the AppShell route group', () => {
    const canonicalRoute = routeFilePath;
    const legacyRoute = join(
      repoRoot,
      'apps/web/app/[locale]/(admin)/settings/integrations/d365/mapping/page.tsx',
    );

    expect(
      existsSync(canonicalRoute),
      'T-062 must implement /en/settings/integrations/d365/mapping under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(existsSync(legacyRoute), 'Legacy body-only settings route must not be the only implementation').toBe(false);
  });

  it('keeps the Server Component hook-free and delegates browser interactions to a use-client leaf', async () => {
    expect(existsSync(routeFilePath), 'D365 mapping page.tsx must exist at the localized AppShell route').toBe(true);
    const pageSource = await readFile(routeFilePath, 'utf8');
    const clientLeaves = await routeClientLeafSources();
    const clientSource = clientLeaves.map((leaf) => leaf.source).join('\n---client-leaf---\n');

    expect(
      pageSource,
      'page.tsx is a Server Component boundary: move useState/useEffect/browser event handlers into a .client.tsx leaf with a top-level use client directive',
    ).not.toMatch(/\bReact\.use(?:State|Effect|LayoutEffect|Reducer|Ref)\b|\buse(?:State|Effect|LayoutEffect|Reducer|Ref)\s*\(/);
    expect(pageSource, 'page.tsx must not attach client-side onClick handlers directly').not.toMatch(/\bonClick\s*=/);
    expect(
      clientLeaves.some((leaf) => /^['"]use client['"];?/m.test(leaf.source)),
      'interactive MappingScreen/TestConnectionDialog/DirectionFilters must live in a .client.tsx file with a top-level use client directive',
    ).toBe(true);
    expect(clientSource, 'client leaf must use the shared UI Modal/Radix wrapper instead of a hand-rolled role=dialog div').toContain(
      "@monopilot/ui/Modal",
    );
    expect(clientSource, 'client leaf must not fake shadcn/Radix dialog data-slot attributes on raw divs').not.toContain(
      'data-slot="dialog-content"',
    );
  });

  it('does not branch on jsdom or hand-roll SM-08 dialog markup in the client leaf', async () => {
    const clientLeaves = await routeClientLeafSources();
    const clientSource = clientLeaves.map((leaf) => leaf.source).join('\n---client-leaf---\n');

    expect(clientSource, 'SM-08 must use @monopilot/ui/Modal in tests and production; no navigator.userAgent/jsdom test-runtime branch').not.toMatch(
      /navigator\.userAgent|\bjsdom\b|isTestRuntime/,
    );
    expect(clientSource, 'SM-08 must not hand-craft role=dialog markup to satisfy tests').not.toMatch(
      /role=["']dialog["']/,
    );
  });
});

describe('T-062 d365_mapping_screen prototype parity and interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    window.history.replaceState(null, '', '/en/settings/integrations/d365/mapping');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders prototype regions, shadcn actions/filters/table/badges, BL-TEC-01 alert, and SM-08 test dialog', async () => {
    const user = userEvent.setup();
    await renderD365MappingPage();

    expect(screenRoot()).toHaveAttribute('data-route', '/settings/integrations/d365/mapping');
    expect(screenRoot()).toHaveAttribute('data-screen', 'd365_mapping_screen');
    expect(screenRoot()).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:109-146',
    );
    expect(screen.getByRole('heading', { name: /^D365 field mapping$/i })).toBeInTheDocument();
    expect(screen.getByText(/Export-only field map \(Monopilot → D365\)/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Item\.allergens\[\]|monopilot\/integrations-d365/i);

    const buttons = within(screenRoot()).getAllByRole('button');
    expect(buttons.slice(0, 4).map((button) => button.textContent?.trim())).toEqual([
      'Export mapping CSV',
      'Test connection',
      'All (4)',
      'Monopilot → D365 (2)',
    ]);
    buttons.slice(0, 4).forEach((button) => {
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute('data-slot', 'button');
    });
    expect(document.querySelector('[data-slot="table"]')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="badge"]').length).toBeGreaterThanOrEqual(mappingRows.length);
    expect(screen.queryByRole('button', { name: /edit|delete|save/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/D365 → Monopilot/i)).not.toBeInTheDocument();

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "actions": [
          "Export mapping CSV",
          "Test connection",
          "All (4)",
          "Monopilot → D365 (2)",
        ],
        "prototypeSource": "prototypes/design/Monopilot Design System/settings/admin-screens.jsx:109-146",
        "regions": [
          "page-head",
          "mapping-guidance",
          "direction-filter",
          "field-level-map",
        ],
        "route": "/settings/integrations/d365/mapping",
        "rows": [
          "InventTable.ItemIdMonopilot → D365products.skutextnone",
          "VendTable.CurrencyCodeMonopilot → D365partners.currencyenumupper",
          "SalesTable.SalesIdMonopilot → D365planning.d365_so_reftextprefix:SO-",
          "Item.allergens[]Monopilot → D365products.allergensjsonunmapped",
        ],
        "screen": "d365_mapping_screen",
        "tableHeaders": [
          "D365 field",
          "Direction",
          "Monopilot field",
          "Type",
          "Transform",
        ],
      }
    `);

    await user.click(screen.getByRole('button', { name: /^Test connection$/i }));
    const dialog = await screen.findByRole('dialog', { name: /d365 test connection|test connection/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-08');
    expect(dialog).toHaveAttribute('data-focus-trap', 'radix-dialog');
    expect(dialog, 'SM-08 must be rendered by the shared UI Modal/Radix primitive, not by a raw div faking data-slot').not.toHaveAttribute(
      'data-slot',
      'dialog-content',
    );
    assertModalA11y(dialog, /d365 test connection|test connection/i);
  });

  it('wires the mapping Test connection CTA to shared SM-08 async diagnostics instead of a static read-only dialog', async () => {
    const user = userEvent.setup();
    let resolveConnection!: (value: D365ConnectionTestResult) => void;
    const testD365Connection = vi.fn(
      () =>
        new Promise<D365ConnectionTestResult>((resolve) => {
          resolveConnection = resolve;
        }),
    );
    await renderD365MappingPage({ testD365Connection });

    await user.click(screen.getByRole('button', { name: /^Test connection$/i }));

    await waitFor(() => expect(testD365Connection).toHaveBeenCalledTimes(1));
    const dialog = await screen.findByRole('dialog', { name: /d365 test connection|test connection/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-08');
    expect(within(dialog).getByRole('status', { name: /connecting to d365 environment/i })).toBeInTheDocument();

    resolveConnection({ status: 'ok', latencyMs: 238, environment: 'Production' });
    expect(await within(dialog).findByText(/connection successful/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/latency:/i)).toHaveTextContent(/238ms.*Production/);
  });

  it('renders SM-08 through the shared Modal primitive even under jsdom', async () => {
    const user = userEvent.setup();
    await renderD365MappingPage();

    await user.click(screen.getByRole('button', { name: /^Test connection$/i }));

    const modal = await screen.findByTestId('shared-ui-modal-primitive');
    expect(modal, 'The dialog must come from @monopilot/ui/Modal; a jsdom-only fake dialog must not satisfy parity tests').toHaveAttribute(
      'data-modal-id',
      'SM-08',
    );
    expect(modal).toHaveAttribute('data-focus-trap', 'radix-dialog');
    expect(screen.getByRole('dialog', { name: /translated d365 connection diagnostics|test connection/i })).toBe(modal);
  });

  it('uses translated labels for the field-level map section and direction-filter accessible name', async () => {
    await renderD365MappingPage();

    expect(screen.getByRole('heading', { name: /^Translated field-level mapping section$/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /^Translated field-level mapping section$/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /^Translated D365 mapping direction filter$/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Field-level map$/ })).not.toBeInTheDocument();
  });

  it('renders SM-08 dialog copy from next-intl labels instead of hardcoded English fallback strings', async () => {
    const user = userEvent.setup();
    await renderD365MappingPage();

    await user.click(screen.getByRole('button', { name: /^Test connection$/i }));

    const dialog = await screen.findByRole('dialog', { name: /translated d365 connection diagnostics/i });
    expect(within(dialog).getByText(/translated endpoint, azure ad, and mapping export checks/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Translated close$/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(/^D365 test connection$/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^Close$/ })).not.toBeInTheDocument();
  });

  it('applies ?dir=outgoing server-side and lists only outgoing Monopilot to D365 rows', async () => {
    window.history.replaceState(null, '', '/en/settings/integrations/d365/mapping?dir=outgoing');
    await renderD365MappingPage({ searchParams: Promise.resolve({ dir: 'outgoing' }) });

    expect(screenRoot()).toHaveAttribute('data-dir', 'outgoing');
    expect(rowTexts()).toHaveLength(2);
    expect(screen.getByText('SalesTable.SalesId')).toBeInTheDocument();
    expect(screen.getByText('Item.allergens[]')).toBeInTheDocument();
    expect(screen.queryByText('InventTable.ItemId')).not.toBeInTheDocument();
    expect(screen.queryByText('VendTable.CurrencyCode')).not.toBeInTheDocument();
  });

  it('renders loading, empty, and error states loudly without silently skipping D365 mapping data', async () => {
    await renderD365MappingPage({ state: 'loading', rows: [] });
    expect(screen.getByTestId('settings-d365-mapping-loading')).toHaveTextContent(/loading d365 field mapping/i);
    cleanup();

    await renderD365MappingPage({ state: 'empty', rows: [] });
    expect(screen.getByText(/no d365 field mappings found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export mapping csv/i })).toBeDisabled();
    cleanup();

    await renderD365MappingPage({ state: 'error', rows: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load d365 field mapping/i);
  });

  it('runs the injected export Server Action from the CSV button and exposes the attachment response status', async () => {
    const user = userEvent.setup();
    const exportD365MappingCsv = vi.fn(async () =>
      new Response('d365_field,direction,monopilot_field,type,transform\nSalesTable.SalesId,outgoing,planning.d365_so_ref,text,prefix:SO-\n', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="d365-field-mapping.csv"',
        },
      }),
    );
    await renderD365MappingPage({ exportD365MappingCsv });

    await user.click(screen.getByRole('button', { name: /^Export mapping CSV$/i }));

    await waitFor(() => expect(exportD365MappingCsv).toHaveBeenCalledWith({ dir: 'all' }));
    expect(screen.getByRole('status')).toHaveTextContent(/csv export ready|d365-field-mapping\.csv/i);
  });
});

describe('T-062 exportD365MappingCsv Server Action response contract', () => {
  it('returns a CSV attachment Response with d365_field_mapping header columns', async () => {
    const exportD365MappingCsv = await loadExportAction();

    const response = await exportD365MappingCsv({ dir: 'all', rows: mappingRows });
    const body = await response.text();

    expect(response).toBeInstanceOf(Response);
    expect(response.status, 'exportD365MappingCsv must return a successful CSV Response, not a missing-action fallback').toBe(200);
    expect(response.headers.get('Content-Disposition') ?? '').toMatch(/attachment;\s*filename="?d365-field-mapping\.csv"?/i);
    expect(response.headers.get('Content-Type') ?? '').toMatch(/text\/csv/i);
    expect(body.split(/\r?\n/)[0]).toBe('d365_field,direction,monopilot_field,type,transform');
  });
});
