/**
 * @vitest-environment jsdom
 * UI-SET-006 — Reference Data route modal CRUD parity RED tests.
 * Prototype sources:
 * - settings/admin-screens.jsx:561-621 reference_data_screen
 * - settings/modals.jsx:535-572 ref_row_edit_modal
 * - settings/modals.jsx:513-532 delete_reference_data_modal
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  version: number;
  values: Record<string, string | boolean | number>;
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
  canEditReferenceData?: boolean;
  upsertReferenceRow?: (input: {
    tableCode: string;
    rowKey: string;
    rowData: Record<string, unknown>;
    expectedVersion?: number;
  }) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  softDeleteReferenceRow?: (input: {
    tableCode: string;
    rowKey: string;
    expectedVersion: number;
  }) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  onReferenceDataChanged?: () => void;
};

const routeDir = path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/reference');
const messageRoot = path.join(process.cwd(), 'messages');

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
    rows: 1,
    updated: '2026-05-20',
    columns: [
      { key: 'allergen_code', label: 'Allergen code', type: 'badge' },
      { key: 'display_name', label: 'Display name', type: 'text' },
      { key: 'eu_disclosure_text', label: 'EU disclosure text', type: 'text' },
      { key: 'risk_level', label: 'Risk level', type: 'badge' },
      { key: 'is_enabled', label: 'Enabled', type: 'boolean' },
    ],
  },
];

const rowsByTable: Record<string, ReferenceRow[]> = {
  allergens_reference: [
    {
      rowId: 'row-milk',
      rowKey: 'MILK',
      version: 7,
      values: {
        allergen_code: 'MILK',
        display_name: 'Milk protein',
        eu_disclosure_text: 'Contains milk and dairy derivatives',
        risk_level: 'major',
        is_enabled: true,
      },
    },
  ],
};

async function loadReferenceDataScreen(): Promise<React.ComponentType<ReferenceDataScreenProps>> {
  const mod = await import(/* @vite-ignore */ path.join(routeDir, 'reference-data-screen.client.tsx'));
  const component = (mod.ReferenceDataScreen ?? mod.default) as React.ComponentType<ReferenceDataScreenProps> | undefined;
  expect(component, 'ReferenceDataScreen must be exported from the localized AppShell route client leaf').toEqual(
    expect.any(Function),
  );
  if (!component) throw new Error('ReferenceDataScreen export missing');
  return component as React.ComponentType<ReferenceDataScreenProps>;
}

async function renderReferenceData(overrides: Partial<ReferenceDataScreenProps> = {}) {
  const Screen = await loadReferenceDataScreen();
  const props: ReferenceDataScreenProps = {
    tables,
    selectedTableCode: 'allergens_reference',
    rowsByTable,
    labels,
    state: 'ready',
    canEditReferenceData: true,
    upsertReferenceRow: vi.fn().mockResolvedValue({ ok: true, data: { tableCode: 'allergens_reference', rowKey: 'MILK' } }),
    softDeleteReferenceRow: vi.fn().mockResolvedValue({ ok: true, data: { tableCode: 'allergens_reference', rowKey: 'MILK' } }),
    onReferenceDataChanged: vi.fn(),
    ...overrides,
  };

  render(React.createElement(Screen, props));
  return props;
}

afterEach(() => cleanup());

describe('UI-SET-006 Reference Data route modal CRUD parity', () => {
  it('opens the shared RefRowEditModal from the row Edit affordance and persists through the upsert Server Action with refetch feedback', async () => {
    const user = userEvent.setup();
    const upsertReferenceRow = vi.fn().mockResolvedValue({ ok: true, data: { tableCode: 'allergens_reference', rowKey: 'MILK' } });
    const onReferenceDataChanged = vi.fn();
    await renderReferenceData({ upsertReferenceRow, onReferenceDataChanged });

    await user.click(screen.getByRole('button', { name: /edit milk/i }));

    const dialog = await screen.findByTestId('ref-row-edit-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-11');
    expect(dialog).toHaveAccessibleName(/edit row/i);

    const displayName = within(dialog).getByLabelText(/display name|name \(en\)/i) as HTMLInputElement;
    await user.clear(displayName);
    await user.type(displayName, 'Milk protein updated');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await expect(upsertReferenceRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableCode: 'allergens_reference',
        rowKey: 'MILK',
        expectedVersion: 7,
        rowData: expect.objectContaining({ display_name: 'Milk protein updated' }),
      }),
    );
    expect(onReferenceDataChanged).toHaveBeenCalledTimes(1);
  });

  it('opens the shared DeleteReferenceDataModal from Delete, requires exact confirmation, soft-deletes with RBAC action input, and refetches the table', async () => {
    const user = userEvent.setup();
    const softDeleteReferenceRow = vi.fn().mockResolvedValue({ ok: true, data: { tableCode: 'allergens_reference', rowKey: 'MILK' } });
    const onReferenceDataChanged = vi.fn();
    await renderReferenceData({ softDeleteReferenceRow, onReferenceDataChanged });

    await user.click(screen.getByRole('button', { name: /delete milk/i }));

    const dialog = await screen.findByTestId('delete-reference-data-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-10');
    expect(dialog).toHaveAccessibleName(/delete milk/i);

    await user.type(within(dialog).getByLabelText(/type DELETE to confirm/i), 'DELETE');
    await user.click(within(dialog).getByRole('checkbox', { name: /^confirm$/i }));
    await user.click(within(dialog).getByRole('button', { name: /^delete permanently$/i }));

    await expect(softDeleteReferenceRow).toHaveBeenCalledWith({
      tableCode: 'allergens_reference',
      rowKey: 'MILK',
      expectedVersion: 7,
    });
    expect(onReferenceDataChanged).toHaveBeenCalledTimes(1);
  });

  it('ships route and modal copy in en/pl/ro/uk under settings.reference_data so the UI never falls back to raw English literals', async () => {
    const requiredLeafKeys = [
      'title',
      'subtitle',
      'importCsv',
      'exportCsv',
      'addRow',
      'edit',
      'delete',
      'loading',
      'empty',
      'error',
      'modal.edit.title',
      'modal.edit.save',
      'modal.delete.title',
      'modal.delete.confirmLabel',
      'modal.delete.confirmButton',
      'modal.delete.success',
      'permissionDenied',
    ];

    for (const locale of ['en', 'pl', 'ro', 'uk']) {
      const source = JSON.parse(await fs.readFile(path.join(messageRoot, locale, '02-settings.json'), 'utf8')) as Record<string, unknown>;
      for (const leafKey of requiredLeafKeys) {
        const value = leafKey.split('.').reduce<unknown>((node, key) => {
          if (!node || typeof node !== 'object') return undefined;
          return (node as Record<string, unknown>)[key];
        }, source.reference_data);
        expect(value, `${locale}/02-settings.json must define reference_data.${leafKey}`).toEqual(expect.any(String));
      }
    }
  });
});
