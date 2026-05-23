/**
 * @vitest-environment jsdom
 * T-066 / SET-030 — Schema Browser screen.
 *
 * RED phase: RTL tests specify the localized AppShell-backed production page
 * contract from prototypes/design/Monopilot Design System/settings/admin-screens.jsx:414-469.
 * This scoped RED file intentionally loads the canonical browser-visible route
 * under app/[locale]/(app)/(admin)/settings/schema.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    const labels: Record<string, string> = {
      title: 'Schema browser',
      subtitle: 'Read-only inspector for all column definitions, across L1/L2/L3 tiers.',
      exportSchemaCsv: 'Export schema CSV',
      promotionNotice:
        'Columns scoped L1 are read-only here — raise an L1 tier-promotion request via the schema promotion wizard (SM-05). L2/L3 columns can be edited.',
      promotionWizard: 'schema promotion wizard (SM-05)',
      tableFilter: 'Table',
      tierFilter: 'Tier',
      allTables: 'All tables',
      allTiers: 'All tiers',
      searchColumns: 'Search column code or label…',
      columnCount: '{count} columns',
      columnDefinitions: 'Column definitions',
      columnCode: 'Column code',
      label: 'Label',
      table: 'Table',
      dept: 'Dept',
      type: 'Type',
      tier: 'Tier',
      storage: 'Storage',
      required: 'Req',
      status: 'Status',
      version: 'v',
      actions: 'Actions',
      view: 'View →',
      edit: 'Edit →',
      loading: 'Loading schema columns…',
      empty: 'No schema columns found.',
      error: 'Unable to load schema columns.',
      usePromotionRequest: 'Use Promotion Request',
      close: 'Close',
    };
    return labels[key] ?? key;
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

type SchemaColumnTier = 'L1' | 'L2' | 'L3' | 'L4';
type UserRole = 'Admin' | 'Operator' | 'Viewer';

type SchemaColumnRow = {
  col: string;
  label: string;
  table: string;
  dept: string;
  type: string;
  tier: SchemaColumnTier;
  storage: string;
  req: boolean;
  status: 'active' | 'draft' | 'deprecated';
  version: number;
};

type SchemaPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  columns?: SchemaColumnRow[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  userRole?: UserRole;
  openModal?: (modalId: 'schemaView' | 'promoteToL2', payload?: { col: SchemaColumnRow }) => void;
  onEditColumn?: (columnCode: string) => void;
};

type SchemaPage = (props: SchemaPageProps) => React.ReactNode | Promise<React.ReactNode>;

const columns: SchemaColumnRow[] = [
  {
    col: 'pack_weight_kg',
    label: 'Pack weight',
    table: 'main_table',
    dept: 'Production',
    type: 'number',
    tier: 'L2',
    storage: 'Postgres numeric',
    req: true,
    status: 'active',
    version: 4,
  },
  {
    col: 'pack_label_template',
    label: 'Pack label template',
    table: 'main_table',
    dept: 'Packaging',
    type: 'text',
    tier: 'L3',
    storage: 'Postgres text',
    req: false,
    status: 'draft',
    version: 2,
  },
  {
    col: 'allergen_statement',
    label: 'Allergen statement',
    table: 'quality_table',
    dept: 'QC',
    type: 'text',
    tier: 'L2',
    storage: 'Postgres text',
    req: true,
    status: 'active',
    version: 6,
  },
  {
    col: 'finished_good_id',
    label: 'Finished good identifier',
    table: 'main_table',
    dept: 'Technical',
    type: 'uuid',
    tier: 'L1',
    storage: 'Postgres uuid',
    req: true,
    status: 'active',
    version: 9,
  },
];

async function loadSchemaPage(): Promise<SchemaPage> {
  try {
    const canonicalRouteModule = '../../../(app)/(admin)/settings/schema/page';
    const mod = await import(/* @vite-ignore */ canonicalRouteModule);
    expect(mod.default, 'SET-030 schema browser page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as SchemaPage;
  } catch {
    return function MissingSchemaBrowserPage() {
      return React.createElement('main', { 'data-testid': 'missing-schema-browser-page' });
    };
  }
}

async function renderSchemaPage(overrides: Partial<SchemaPageProps> = {}) {
  const Page = await loadSchemaPage();
  const props: SchemaPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    columns,
    state: 'ready',
    userRole: 'Admin',
    openModal: vi.fn(),
    onEditColumn: vi.fn(),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function regionOrder() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
    region.getAttribute('data-region'),
  );
}

function schemaTable() {
  return screen.getByRole('table', { name: /column definitions/i });
}

function bodyRows(table = schemaTable()) {
  return within(table).getAllByRole('row').slice(1);
}

function structuralSnapshot() {
  const table = schemaTable();
  return {
    regions: regionOrder(),
    actions: screen.getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean),
    filters: screen.getAllByRole('combobox').map((combobox) => combobox.getAttribute('aria-label')),
    search: screen.getByRole('searchbox', { name: /search column code or label/i }).getAttribute('placeholder'),
    headers: within(table).getAllByRole('columnheader').map((header) => header.textContent?.trim()),
    rows: bodyRows(table).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent?.trim())),
  };
}

async function chooseFilter(label: RegExp, value: string, optionLabel: RegExp) {
  const user = userEvent.setup();
  const filter = screen.getByRole('combobox', { name: label });
  if (filter.tagName === 'SELECT') {
    await user.selectOptions(filter, value);
    return;
  }
  await user.click(filter);
  await user.click(screen.getByRole('option', { name: optionLabel }));
}

function assertModalA11y(dialog: HTMLElement) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(/column/i);
  expect(within(dialog).getByRole('button', { name: /close/i })).toBeInTheDocument();
}

describe('SET-030 schema browser prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the prototype regions, shadcn primitives, actions, filters, table columns, modal trigger, and keyboard order', async () => {
    const user = userEvent.setup();
    const openModal = vi.fn();
    await renderSchemaPage({ openModal });

    expect(screen.getByTestId('settings-schema-browser-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^schema browser$/i })).toBeInTheDocument();
    expect(screen.getByText(/read-only inspector for all column definitions/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/schema promotion wizard \(SM-05\)/i);

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "actions": [
          "Export schema CSV",
          "View →",
          "Edit →",
          "View →",
          "Edit →",
          "View →",
          "Edit →",
          "View →",
          "Edit →",
        ],
        "filters": [
          "Table",
          "Tier",
        ],
        "headers": [
          "Column code",
          "Label",
          "Table",
          "Dept",
          "Type",
          "Tier",
          "Storage",
          "Req",
          "Status",
          "v",
          "Actions",
        ],
        "regions": [
          "page-head",
          "promotion-notice",
          "schema-filters",
          "column-definitions",
        ],
        "rows": [
          [
            "pack_weight_kg",
            "Pack weight",
            "main_table",
            "Production",
            "number",
            "L2",
            "Postgres numeric",
            "✓",
            "active",
            "v4",
            "View →Edit →",
          ],
          [
            "pack_label_template",
            "Pack label template",
            "main_table",
            "Packaging",
            "text",
            "L3",
            "Postgres text",
            "—",
            "draft",
            "v2",
            "View →Edit →",
          ],
          [
            "allergen_statement",
            "Allergen statement",
            "quality_table",
            "QC",
            "text",
            "L2",
            "Postgres text",
            "✓",
            "active",
            "v6",
            "View →Edit →",
          ],
          [
            "finished_good_id",
            "Finished good identifier",
            "main_table",
            "Technical",
            "uuid",
            "L1",
            "Postgres uuid",
            "✓",
            "active",
            "v9",
            "View →Edit →",
          ],
        ],
        "search": "Search column code or label…",
      }
    `);

    expect(document.querySelectorAll('select')).toHaveLength(0);
    expect(document.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(2);
    expect(document.querySelector('[data-slot="input"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="table"]')).toBeInTheDocument();
    expect(screen.getByText('4 columns')).toBeInTheDocument();

    const firstView = screen.getAllByRole('button', { name: /view/i })[0];
    expect(firstView).toHaveAttribute('data-modal-id', 'schemaView');
    await user.click(firstView);
    expect(openModal).toHaveBeenCalledWith('schemaView', { col: columns[0] });

    const dialog = screen.queryByRole('dialog');
    if (dialog) assertModalA11y(dialog);

    await user.tab();
    expect(screen.getByRole('button', { name: /export schema csv/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: /table/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: /tier/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('searchbox', { name: /search column code or label/i })).toHaveFocus();
  });

  it("applies table='main_table', tier='L2', search='pack' filters so only matching rows are listed", async () => {
    await renderSchemaPage({
      searchParams: Promise.resolve({ table: 'main_table', tier: 'L2', search: 'pack' }),
    });

    expect(screen.getByText('1 columns')).toBeInTheDocument();
    const visibleRows = bodyRows();
    expect(visibleRows).toHaveLength(1);
    expect(within(visibleRows[0]).getByText('pack_weight_kg')).toBeInTheDocument();
    expect(screen.queryByText('pack_label_template')).not.toBeInTheDocument();
    expect(screen.queryByText('allergen_statement')).not.toBeInTheDocument();
    expect(screen.queryByText('finished_good_id')).not.toBeInTheDocument();
  });

  it("disables non-Admin L1 edit links with tooltip 'Use Promotion Request' while leaving L2/L3 edit enabled", async () => {
    await renderSchemaPage({ userRole: 'Operator' });

    const l1Row = bodyRows().find((row) => row.textContent?.includes('finished_good_id'));
    expect(l1Row, 'Expected L1 schema row to render').toBeTruthy();
    const l1Edit = within(l1Row!).getByRole('button', { name: /edit/i });
    expect(l1Edit).toBeDisabled();
    expect(l1Edit).toHaveAccessibleDescription('Use Promotion Request');
    expect(within(l1Row!).getByText('Use Promotion Request')).toBeInTheDocument();

    const l2Row = bodyRows().find((row) => row.textContent?.includes('pack_weight_kg'));
    expect(l2Row, 'Expected L2 schema row to render').toBeTruthy();
    expect(within(l2Row!).getByRole('button', { name: /edit/i })).toBeEnabled();
  });

  it('renders loading, empty, and error states loudly instead of silently falling back to prototype globals', async () => {
    await renderSchemaPage({ state: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent(/loading schema columns/i);

    cleanup();
    await renderSchemaPage({ state: 'empty', columns: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/no schema columns/i);

    cleanup();
    await renderSchemaPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load schema columns/i);
  });

  it('updates visible rows through shadcn filter controls without raw select drift', async () => {
    const user = userEvent.setup();
    await renderSchemaPage();

    await chooseFilter(/table/i, 'main_table', /^main_table$/i);
    await chooseFilter(/tier/i, 'L2', /^L2$/i);
    await user.type(screen.getByRole('searchbox', { name: /search column code or label/i }), 'pack');

    expect(document.querySelectorAll('select')).toHaveLength(0);
    expect(screen.getByText('1 columns')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('pack_weight_kg')).toBeInTheDocument();
  });
});
