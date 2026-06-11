/**
 * @vitest-environment jsdom
 * Wave 5 (Class D build-now) — /settings/processes schema-driven reference screen.
 *
 * Proves the route reads REAL reference_tables data via withOrgContext (no
 * injected props, no hardcoded array) and renders the shared reference-data
 * screen — never the SettingsRouteStub. Parity source: the reference-data
 * screen at settings/reference (admin-screens.jsx:561-621 reference_data_screen).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withOrgContext: vi.fn(),
  upsertReferenceRow: vi.fn(),
  softDeleteReferenceRow: vi.fn(),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: mocks.withOrgContext,
}));

vi.mock('../../../../../../actions/reference/upsert', () => ({
  upsertReferenceRow: mocks.upsertReferenceRow,
}));

vi.mock('../../../../../../actions/reference/soft-delete', () => ({
  softDeleteReferenceRow: mocks.softDeleteReferenceRow,
}));

type FakeRow = Record<string, unknown>;
type DbScript = { schema: FakeRow[]; rows: FakeRow[]; canEdit: boolean };

function wireLiveRead(script: DbScript) {
  mocks.withOrgContext.mockImplementation(
    async (action: (ctx: { userId: string; orgId: string; client: unknown }) => Promise<unknown>) => {
      const client = {
        query: async (sql: string) => {
          if (/from\s+public\.reference_schemas/i.test(sql)) {
            return { rows: script.schema, rowCount: script.schema.length };
          }
          if (/count\(\*\)\s+as\s+row_count/i.test(sql)) {
            return {
              rows: script.rows.length
                ? [{ table_code: 'processes', row_count: script.rows.length, updated_at: '2026-06-01T00:00:00.000Z' }]
                : [],
              rowCount: script.rows.length ? 1 : 0,
            };
          }
          if (/from\s+public\.reference_tables/i.test(sql)) {
            return { rows: script.rows, rowCount: script.rows.length };
          }
          if (/public\.role_permissions/i.test(sql)) {
            return script.canEdit ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: 0 };
        },
      };
      return action({ userId: 'proc-user', orgId: 'proc-org', client });
    },
  );
}

// Mirrors the seeded reference.processes schema (packages/db/seeds/reference-schemas.sql:120
// / migration 073): category is an enum whose validation_json.enum_values is the
// closed set the upsert Server Action validates against.
const liveSchema: FakeRow[] = [
  { table_code: 'reference.processes', column_code: 'process_code', data_type: 'text', presentation_json: { label: 'Process code' }, validation_json: { required: true } },
  { table_code: 'reference.processes', column_code: 'name', data_type: 'text', presentation_json: { label: 'Name' }, validation_json: { required: true } },
  {
    table_code: 'reference.processes',
    column_code: 'category',
    data_type: 'enum',
    presentation_json: { label: 'Category' },
    validation_json: { required: false, enum_values: ['preparation', 'processing', 'packaging', 'quality', 'logistics'] },
  },
  {
    table_code: 'reference.processes',
    column_code: 'cost_mode',
    data_type: 'enum',
    presentation_json: { label: 'Cost mode' },
    validation_json: { required: true, enum_values: ['per_hour', 'per_run'] },
  },
  { table_code: 'reference.processes', column_code: 'cost_rate', data_type: 'number', presentation_json: { label: 'Rate' }, validation_json: { required: false, min: 0, scale: 2 } },
  { table_code: 'reference.processes', column_code: 'currency', data_type: 'text', presentation_json: { label: 'Currency' }, validation_json: { required: true, pattern: '^[A-Z]{3}$' } },
];

const liveRows: FakeRow[] = [
  { table_code: 'processes', row_key: 'MIXING', row_data: { process_code: 'MIXING', name: 'Ingredient mixing', category: 'preparation', cost_mode: 'per_hour', cost_rate: '12.00', currency: 'EUR' }, version: 1, is_active: true, updated_at: '2026-06-01T00:00:00.000Z' },
  { table_code: 'processes', row_key: 'COOKING', row_data: { process_code: 'COOKING', name: 'Thermal processing / cooking', category: 'processing', cost_mode: 'per_run', cost_rate: '30.00', currency: 'EUR' }, version: 1, is_active: true, updated_at: '2026-06-01T00:00:00.000Z' },
];

async function renderPage() {
  const mod = (await import(/* @vite-ignore */ './page')) as { default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode> };
  const node = await mod.default({ params: Promise.resolve({ locale: 'en' }) });
  return render(React.createElement(React.Fragment, null, node));
}

afterEach(() => cleanup());

describe('/settings/processes schema-driven reference screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withOrgContext.mockReset();
  });

  it('reads real reference_tables rows via withOrgContext and renders them (not the SettingsRouteStub)', async () => {
    wireLiveRead({ schema: liveSchema, rows: liveRows, canEdit: true });
    const { container } = await renderPage();

    expect(mocks.withOrgContext, 'page must read through the org-scoped HOF, not a hardcoded array').toHaveBeenCalled();
    expect(container.querySelector('[data-testid^="settings-route-stub-"]')).toBeNull();

    const table = screen.getByRole('table');
    expect(within(table).getByText('MIXING')).toBeInTheDocument();
    expect(within(table).getByText('Ingredient mixing')).toBeInTheDocument();
    expect(within(table).getByText('12.00 EUR / h')).toBeInTheDocument();
    expect(within(table).getByText('COOKING')).toBeInTheDocument();
    expect(within(table).getByText('30.00 EUR / run')).toBeInTheDocument();
  });

  it('falls back to the empty state (no stub, no fabricated rows) when org context is unavailable', async () => {
    mocks.withOrgContext.mockRejectedValueOnce(new Error('org context unavailable'));
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid^="settings-route-stub-"]')).toBeNull();
    expect(screen.queryByText('MIXING')).not.toBeInTheDocument();
  });

  it('opens the add-process modal with translated labels and saves through the reference upsert action', async () => {
    const user = userEvent.setup();
    mocks.upsertReferenceRow.mockResolvedValueOnce({ ok: true, data: { tableCode: 'processes', rowKey: 'BLENDING' } });
    wireLiveRead({ schema: liveSchema, rows: [], canEdit: true });

    await renderPage();

    await user.click(screen.getByRole('button', { name: /add process/i }));

    const dialog = await screen.findByTestId('ref-row-edit-modal');
    expect(dialog).toHaveAccessibleName('Add process step');
    expect(within(dialog).getByText('Reference table · processes')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent(/settings\.processes/);

    await user.type(within(dialog).getByLabelText('Key'), 'BLENDING');
    await user.type(within(dialog).getByLabelText('Process code'), 'BLENDING');
    await user.type(within(dialog).getByLabelText('Name'), 'Ingredient blending');

    // BUG 1: Category is a dropdown of the schema enum_values, not a free textbox —
    // selecting a valid value is the only way to set it, so invalid_input is
    // impossible by construction.
    const categoryField = within(dialog).getByTestId('ref-row-field-category');
    expect(within(categoryField).queryByRole('textbox'), 'Category must not be a free-text input').toBeNull();
    const categoryCombobox = within(categoryField).getByRole('combobox');
    expect(categoryCombobox).toBeInTheDocument();
    await user.click(categoryCombobox);
    await user.click(await screen.findByRole('option', { name: /preparation/i }));

    const costModeField = within(dialog).getByTestId('ref-row-field-cost_mode');
    expect(within(costModeField).queryByRole('textbox'), 'Cost mode must be a Select, not free text').toBeNull();
    await user.click(within(costModeField).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /per hour/i }));
    await user.type(within(dialog).getByLabelText('Rate'), '12.50');
    await user.type(within(dialog).getByLabelText('Currency'), 'EUR');

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(mocks.upsertReferenceRow).toHaveBeenCalledWith({
      tableCode: 'processes',
      rowKey: 'BLENDING',
      rowData: {
        process_code: 'BLENDING',
        name: 'Ingredient blending',
        category: 'preparation',
        cost_mode: 'per_hour',
        cost_rate: 12.5,
        currency: 'EUR',
      },
    });
  });

  it('renders the Category field as a dropdown limited to the schema enum_values (no free text)', async () => {
    const user = userEvent.setup();
    wireLiveRead({
      schema: [
        { table_code: 'reference.processes', column_code: 'process_code', data_type: 'text', presentation_json: { label: 'Process code' } },
        { table_code: 'reference.processes', column_code: 'name', data_type: 'text', presentation_json: { label: 'Name' } },
        {
          table_code: 'reference.processes',
          column_code: 'category',
          data_type: 'enum',
          presentation_json: { label: 'Category' },
          validation_json: { required: false, enum_values: ['preparation', 'processing', 'packaging', 'quality', 'logistics'] },
        },
        {
          table_code: 'reference.processes',
          column_code: 'cost_mode',
          data_type: 'enum',
          presentation_json: { label: 'Cost mode' },
          validation_json: { required: true, enum_values: ['per_hour', 'per_run'] },
        },
        { table_code: 'reference.processes', column_code: 'cost_rate', data_type: 'number', presentation_json: { label: 'Rate' }, validation_json: { required: false } },
        { table_code: 'reference.processes', column_code: 'currency', data_type: 'text', presentation_json: { label: 'Currency' }, validation_json: { required: true } },
      ],
      rows: [],
      canEdit: true,
    });

    await renderPage();
    await user.click(screen.getByRole('button', { name: /add process/i }));
    const dialog = await screen.findByTestId('ref-row-edit-modal');
    const categoryField = within(dialog).getByTestId('ref-row-field-category');

    // Exactly the five seeded/zod-validated categories — no more, no less.
    await user.click(within(categoryField).getByRole('combobox'));
    const options = await screen.findAllByRole('option');
    const optionValues = options.map((o) => o.getAttribute('data-value'));
    expect(optionValues).toEqual(['preparation', 'processing', 'packaging', 'quality', 'logistics']);
    expect(within(categoryField).queryByRole('textbox')).toBeNull();
    expect(within(dialog).getByTestId('ref-row-field-cost_mode')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Rate')).toHaveAttribute('type', 'number');
  });

  it('defines every settings.processes key used by the shared reference CRUD modal in all runtime locales', () => {
    const requiredKeys = [
      'title',
      'subtitle',
      'importCsv',
      'exportCsv',
      'addRow',
      'edit',
      'delete',
      'rowsSuffix',
      'updatedPrefix',
      'loading',
      'empty',
      'error',
      'permissionDenied',
      'actions',
      'enabled',
      'disabled',
      'yes',
      'no',
      'rowKey',
      'rowKeyHelp',
      'modal.edit.title',
      'modal.edit.editTitle',
      'modal.edit.referenceTable',
      'modal.edit.cancel',
      'modal.edit.save',
      'modal.edit.saving',
      'modal.edit.loading',
      'modal.edit.loadingLabel',
      'modal.edit.noSchema',
      'modal.edit.rowKeyInvalid',
      'modal.edit.rowKeyRequired',
      'modal.edit.minChars',
      'modal.edit.selectPlaceholder',
      'modal.edit.saveFailed',
      'modal.delete.title',
      'modal.delete.cancel',
      'modal.delete.confirmLabel',
      'modal.delete.confirmButton',
      'modal.delete.deleting',
      'modal.delete.confirmCheckbox',
      'modal.delete.warning',
      'modal.delete.affectedRows',
      'modal.delete.precheckError',
      'modal.delete.submitFailed',
      'modal.delete.success',
      'cost_mode.options.per_hour',
      'cost_mode.options.per_run',
    ];

    for (const locale of ['en', 'pl', 'ro', 'uk']) {
      const runtime = JSON.parse(readFileSync(join(process.cwd(), 'i18n', `${locale}.json`), 'utf8')) as Record<string, unknown>;
      const settingsBundle = JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, '02-settings.json'), 'utf8')) as Record<string, unknown>;

      for (const source of [runtime.settings, settingsBundle]) {
        for (const key of requiredKeys) {
          const value = key.split('.').reduce<unknown>((node, segment) => {
            if (!node || typeof node !== 'object') return undefined;
            return (node as Record<string, unknown>)[segment];
          }, (source as Record<string, unknown>).processes);

          expect(value, `${locale} settings.processes.${key} must be translated`).toEqual(expect.any(String));
          expect(value, `${locale} settings.processes.${key} must not leak a raw key`).not.toMatch(/^settings\.processes/);
        }
      }
    }
  });

  it('defines a localized label for every category enum value in all runtime locales (BUG 1)', () => {
    const categoryValues = ['preparation', 'processing', 'packaging', 'quality', 'logistics'];
    for (const locale of ['en', 'pl', 'ro', 'uk']) {
      const runtime = JSON.parse(readFileSync(join(process.cwd(), 'i18n', `${locale}.json`), 'utf8')) as Record<string, unknown>;
      const processes = (runtime.settings as Record<string, unknown>).processes as Record<string, unknown>;
      const category = processes.category as Record<string, unknown> | undefined;
      const options = category?.options as Record<string, unknown> | undefined;
      for (const value of categoryValues) {
        expect(options?.[value], `${locale} settings.processes.category.options.${value} must be translated`).toEqual(expect.any(String));
      }
    }
  });
});
