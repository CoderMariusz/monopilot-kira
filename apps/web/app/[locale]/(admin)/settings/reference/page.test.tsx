/**
 * @vitest-environment jsdom
 * T-067 / SET-050 — Reference Data screen RED contract.
 *
 * These tests pin the production behavior for the localized AppShell route
 * /en/settings/reference against reference_data_screen in
 * prototypes/design/Monopilot Design System/settings/admin-screens.jsx:561-621.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ReferenceColumn = {
  key: string;
  label: string;
  type: 'text' | 'boolean' | 'badge';
};

type ReferenceTable = {
  code: string;
  name: string;
  desc: string;
  marker: 'UNIVERSAL' | 'TENANT';
  rows: number;
  updated: string;
  columns: ReferenceColumn[];
};

type ReferenceRow = {
  rowId: string;
  rowKey: string;
  values: Record<string, string | boolean>;
};

type ReferenceDataLabels = {
  title: string;
  subtitle: string;
  importCsv: string;
  exportCsv: string;
  addRow: string;
  edit: string;
  delete: string;
  rowsSuffix: string;
  updatedPrefix: string;
  loading: string;
  empty: string;
  error: string;
};

type ReferenceDataScreenProps = {
  tables: ReferenceTable[];
  selectedTableCode: string;
  rowsByTable: Record<string, ReferenceRow[]>;
  labels: ReferenceDataLabels;
  state?: 'ready' | 'loading' | 'empty' | 'error';
};

type ReferenceDataScreenComponent = React.ComponentType<ReferenceDataScreenProps>;

const routeDir = path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/reference');

const labels: ReferenceDataLabels = {
  title: 'Reference data',
  subtitle: 'Allergen families, UoM, currency, country ISO — configuration tables.',
  importCsv: 'Import CSV',
  exportCsv: 'Export CSV',
  addRow: '+ Add row',
  edit: 'Edit',
  delete: 'Delete',
  rowsSuffix: 'rows',
  updatedPrefix: 'Updated',
  loading: 'Loading reference data…',
  empty: 'No reference rows configured for this table.',
  error: 'Unable to load reference data.',
};

const tables: ReferenceTable[] = [
  {
    code: 'allergens_reference',
    name: 'Allergens reference',
    desc: 'Schema-driven allergen family reference data.',
    marker: 'UNIVERSAL',
    rows: 2,
    updated: '2026-05-20',
    columns: [
      { key: 'allergen_code', label: 'Allergen code', type: 'badge' },
      { key: 'display_name', label: 'Display name', type: 'text' },
      { key: 'eu_disclosure_text', label: 'EU disclosure text', type: 'text' },
      { key: 'risk_level', label: 'Risk level', type: 'badge' },
      { key: 'is_enabled', label: 'Enabled', type: 'boolean' },
    ],
  },
  {
    code: 'uom_reference',
    name: 'Units of measure',
    desc: 'Mass and count units used in planning and production.',
    marker: 'TENANT',
    rows: 3,
    updated: '2026-05-18',
    columns: [
      { key: 'code', label: 'Code', type: 'badge' },
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'active', label: 'Active', type: 'boolean' },
    ],
  },
];

const rowsByTable: Record<string, ReferenceRow[]> = {
  allergens_reference: [
    {
      rowId: 'row-milk',
      rowKey: 'MILK',
      values: {
        allergen_code: 'MILK',
        display_name: 'Milk protein',
        eu_disclosure_text: 'Contains milk and dairy derivatives',
        risk_level: 'major',
        is_enabled: true,
      },
    },
  ],
  uom_reference: [],
};

function MissingReferenceDataScreen() {
  return <main data-testid="settings-reference-data-screen" />;
}

async function importMaybe(target: string) {
  return import(/* @vite-ignore */ target).catch(() => null);
}

async function loadReferenceDataScreen(): Promise<ReferenceDataScreenComponent> {
  const mod = await importMaybe(path.join(routeDir, 'reference-data-screen.client.tsx'));
  return ((mod as { default?: ReferenceDataScreenComponent; ReferenceDataScreen?: ReferenceDataScreenComponent } | null)
    ?.ReferenceDataScreen ??
    (mod as { default?: ReferenceDataScreenComponent } | null)?.default ??
    MissingReferenceDataScreen) as ReferenceDataScreenComponent;
}

async function renderReferenceData(overrides: Partial<ReferenceDataScreenProps> = {}) {
  const Screen = await loadReferenceDataScreen();
  const props: ReferenceDataScreenProps = {
    tables,
    selectedTableCode: 'allergens_reference',
    rowsByTable,
    labels,
    state: 'ready',
    ...overrides,
  };

  render(React.createElement(Screen, props));
  return props;
}

function assertDialogA11y(dialog: HTMLElement, modalId: 'SM-10' | 'SM-11') {
  expect(dialog).toHaveAttribute('role', 'dialog');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAttribute('data-modal-id', modalId);
  expect(dialog).toHaveAccessibleName();
}

function focusableNames() {
  return Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'))
    .map((element) => element.getAttribute('aria-label') || element.textContent?.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

describe('SET-050 Reference Data screen prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('is wired under the localized AppShell Settings route as a Server Component with a client leaf and next-intl labels', async () => {
    const pagePath = path.join(routeDir, 'page.tsx');
    const clientPath = path.join(routeDir, 'reference-data-screen.client.tsx');

    await expect(
      fs.access(pagePath),
      'SET-050 must be implemented at apps/web/app/[locale]/(app)/(admin)/settings/reference/page.tsx for /en/settings/reference AppShell routing',
    ).resolves.toBeUndefined();
    await expect(fs.access(clientPath), 'SET-050 must expose a client leaf for card selection and Dialog interactions').resolves.toBeUndefined();

    const [pageSource, clientSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(clientPath, 'utf8'),
    ]);

    expect(pageSource).not.toMatch(/^['"]use client['"]/);
    expect(pageSource).toContain('getTranslations');
    expect(pageSource).toContain('settings.reference_data');
    expect(pageSource).toContain('reference-data-screen.client');
    expect(clientSource).toMatch(/['"]use client['"]/);
    expect(clientSource).not.toContain('@radix-ui/react-dialog');
  });

  it('renders prototype regions, action order, shadcn primitive slots, card order, and keyboard focus order', async () => {
    await renderReferenceData();

    const root = screen.getByTestId('settings-reference-data-screen');
    expect(within(root).getByRole('heading', { name: /^reference data$/i })).toBeInTheDocument();
    expect(within(root).getByText(/allergen families, uom, currency, country iso/i)).toBeInTheDocument();

    const actions = within(root).getByTestId('reference-data-actions');
    const orderedActions = [
      within(actions).getByRole('link', { name: /import csv/i }),
      ...within(actions).getAllByRole('button'),
    ];
    expect(orderedActions.map((element) => element.textContent?.trim())).toEqual([
      'Import CSV',
      'Export CSV',
      '+ Add row',
    ]);

    const cardGrid = within(root).getByTestId('reference-table-card-grid');
    expect(within(cardGrid).getAllByRole('button').map((card) => card.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Allergens reference Schema-driven allergen family reference data. UNIVERSAL 2 rows Updated 2026-05-20',
      'Units of measure Mass and count units used in planning and production. TENANT 3 rows Updated 2026-05-18',
    ]);
    expect(cardGrid.querySelectorAll('[data-slot="card"]')).toHaveLength(2);

    const section = within(root).getByRole('region', { name: /allergens reference/i });
    expect(section).toHaveTextContent(/schema-driven allergen family reference data/i);
    expect(within(section).getByRole('table', { name: /allergens reference/i })).toHaveAttribute('data-slot', 'table');
    expect(root.querySelectorAll('[data-slot="button"]').length).toBeGreaterThanOrEqual(5);

    expect(focusableNames()).toEqual([
      'Import CSV',
      'Export CSV',
      '+ Add row',
      'Allergens reference Schema-driven allergen family reference data. UNIVERSAL 2 rows Updated 2026-05-20',
      'Units of measure Mass and count units used in planning and production. TENANT 3 rows Updated 2026-05-18',
      'Edit MILK',
      'Delete MILK',
    ]);
  });

  it("uses reference_tables.columns metadata for allergens_reference instead of a hard-coded allergen branch", async () => {
    await renderReferenceData();

    const grid = screen.getByRole('table', { name: /allergens reference/i });
    expect(within(grid).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Allergen code',
      'Display name',
      'EU disclosure text',
      'Risk level',
      'Enabled',
      'Actions',
    ]);
    expect(within(grid).queryByRole('columnheader', { name: /^Name \(EN\)$/i })).not.toBeInTheDocument();
    expect(within(grid).queryByRole('columnheader', { name: /^Name \(PL\)$/i })).not.toBeInTheDocument();

    const milkRow = within(grid).getByRole('row', { name: /milk milk protein contains milk and dairy derivatives major enabled/i });
    expect(within(milkRow).getByText('major')).toBeInTheDocument();
    expect(within(milkRow).getByText(/enabled/i)).toHaveAccessibleName(/enabled/i);
  });

  it('routes Import CSV to the selected table wizard and invokes SM-11/SM-10 dialogs from the same triggers as the prototype', async () => {
    const user = userEvent.setup();
    await renderReferenceData();

    const importCsv = screen.getByRole('link', { name: /import csv/i });
    expect(importCsv).toHaveAttribute('href', '/settings/reference/allergens_reference/import');
    await user.click(importCsv);

    await user.click(screen.getByRole('button', { name: /\+ add row/i }));
    assertDialogA11y(screen.getByRole('dialog', { name: /reference row/i }), 'SM-11');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /edit milk/i }));
    assertDialogA11y(screen.getByRole('dialog', { name: /edit row.*milk/i }), 'SM-11');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /delete milk/i }));
    assertDialogA11y(screen.getByRole('dialog', { name: /delete.*milk/i }), 'SM-10');
  });

  it('renders loading, empty, and error states loudly without skipping verification', async () => {
    await renderReferenceData({ state: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading reference data…');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    cleanup();

    await renderReferenceData({ rowsByTable: { allergens_reference: [], uom_reference: [] }, state: 'empty' });
    expect(screen.getByRole('status')).toHaveTextContent('No reference rows configured for this table.');
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    cleanup();

    await renderReferenceData({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load reference data.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
