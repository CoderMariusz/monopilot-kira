/**
 * @vitest-environment jsdom
 * UI-SET-010 — Schema browser route/modal parity RED tests.
 * Prototype anchors:
 * - prototypes/design/Monopilot Design System/settings/admin-screens.jsx:421-476
 * - prototypes/design/Monopilot Design System/settings/modals.jsx:111-138
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SchemaBrowserScreen, { type SchemaBrowserLabels, type SchemaColumnRow } from './schema-browser-screen.client';

const labels: SchemaBrowserLabels = {
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

const liveColumns: SchemaColumnRow[] = [
  {
    col: 'fg_item_id',
    label: 'Finished good item',
    table: 'products',
    dept: 'Technical',
    type: 'uuid',
    tier: 'L1',
    storage: 'Postgres',
    req: true,
    status: 'active',
    version: 7,
  },
  {
    col: 'pack_finish',
    label: 'Pack finish',
    table: 'main_table',
    dept: 'Packaging',
    type: 'enum',
    tier: 'L2',
    storage: 'tenant_variations',
    req: false,
    status: 'draft',
    version: 3,
  },
];

function renderSchemaBrowser(overrides: Partial<React.ComponentProps<typeof SchemaBrowserScreen>> = {}) {
  const props: React.ComponentProps<typeof SchemaBrowserScreen> = {
    columns: liveColumns,
    labels,
    initialSearchParams: {},
    state: 'ready',
    userRole: 'Operator',
    ...overrides,
  };
  return render(<SchemaBrowserScreen {...props} />);
}

describe('UI-SET-010 Schema browser route prototype parity', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the prototype table/filter/action surface plus truthful preview and new-column navigation targets', async () => {
    renderSchemaBrowser();

    expect(screen.getByRole('heading', { name: 'Schema browser' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/schema promotion wizard \(SM-05\)/i);
    expect(screen.getByRole('combobox', { name: 'Table' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tier' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search column code or label/i })).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Column definitions' });
    for (const heading of ['Column code', 'Label', 'Table', 'Dept', 'Type', 'Tier', 'Storage', 'Req', 'Status', 'v', 'Actions']) {
      expect(within(table).getByRole('columnheader', { name: heading })).toBeInTheDocument();
    }
    expect(within(table).getByText('fg_item_id')).toBeInTheDocument();
    expect(within(table).getByText('Pack finish')).toBeInTheDocument();
    expect(within(table).getByText('active')).toBeInTheDocument();
    expect(within(table).getByText('draft')).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: /view/i })).toHaveLength(2);

    expect(
      screen.getByRole('link', { name: /schema shadow preview|preview schema/i }),
      'Schema browser must expose the preview route promised by UI-SET-010, not only a hidden route.',
    ).toHaveAttribute('href', expect.stringMatching(/\/en\/settings\/schema\/preview$/));
    expect(
      screen.getByRole('link', { name: /new schema column|add schema column|column edit wizard/i }),
      'Schema browser must expose the new/edit wizard route while keeping mutation writes RBAC-gated.',
    ).toHaveAttribute('href', expect.stringMatching(/\/en\/settings\/schema\/new$/));
  });

  it('opens the shared SchemaViewModal with live row metadata instead of a local placeholder dialog', async () => {
    const user = userEvent.setup();
    renderSchemaBrowser();

    const row = screen.getByText('fg_item_id').closest('tr');
    expect(row).toBeTruthy();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /view/i }));

    const dialog = screen.getByRole('dialog', { name: /column — fg_item_id/i });
    expect(dialog).toHaveAttribute('data-testid', 'schema-view-modal');
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-03');
    expect(dialog).toHaveAttribute('data-size', 'wide');

    for (const [labelText, value] of [
      ['Column code', 'fg_item_id'],
      ['Label', 'Finished good item'],
      ['Table', 'products'],
      ['Dept', 'Technical'],
      ['Data type', 'uuid'],
      ['Tier', 'L1'],
      ['Storage', 'Postgres'],
      ['Required', 'Yes'],
      ['Status', 'active'],
      ['Schema version', 'v7'],
    ] as const) {
      const term = within(dialog).getByText(labelText, { selector: 'dt,[data-summary-label]' });
      const rowEl = term.closest('[data-summary-row]') ?? term.parentElement;
      expect(rowEl, `${labelText} should be grouped with its live value`).toHaveTextContent(value);
    }
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/schema promotion wizard \(SM-05\)/i);
  });

  it('defines Schema Browser and Schema View Modal copy in all supported locale message files', () => {
    const messageDir = join(process.cwd(), 'messages');
    const requiredNamespaces = ['schema_browser', 'schema_view_modal'];
    for (const locale of ['en', 'pl', 'ro', 'uk']) {
      const messages = JSON.parse(readFileSync(join(messageDir, locale, '02-settings.json'), 'utf8')) as Record<string, unknown>;
      for (const namespace of requiredNamespaces) {
        expect(
          messages[namespace],
          `${locale}/02-settings.json must define settings.${namespace} so route copy is explicit and not DEFAULT_LABELS fallback`,
        ).toEqual(expect.any(Object));
      }
    }
  });
});
