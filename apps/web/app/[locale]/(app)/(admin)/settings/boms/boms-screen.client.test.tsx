import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import enBase from '../../../../../../i18n/en.json';
import BomsScreen, { type BomsScreenLabels } from './boms-screen.client';
import type { BomRow, BomKpis, BomSettings } from './_actions/boms';

/**
 * Builds the screen labels from the real EN i18n bundle (settings.boms in
 * apps/web/i18n/en.json) so the test asserts the actual shipped copy — no
 * hand-written strings that could drift from the translations.
 */
const bomsMessages = (enBase as { settings: { boms: Record<string, string> } }).settings.boms;

function buildLabels(): BomsScreenLabels {
  const m = bomsMessages;
  return {
    title: m.title,
    subtitle: m.subtitle,
    kpiActive: m.kpi_active,
    kpiDraft: m.kpi_draft,
    kpiArchived: m.kpi_archived,
    tableTitle: m.table_title,
    emptyTable: m.empty_table,
    loadError: m.load_error,
    columns: {
      bomNumber: m.column_bom_number,
      product: m.column_product,
      version: m.column_version,
      ingredients: m.column_ingredients,
      lastUpdated: m.column_last_updated,
      status: m.column_status,
    },
    statusActive: m.status_active,
    statusDraft: m.status_draft,
    statusArchived: m.status_archived,
    settingsTitle: m.settings_title,
    settingsSubtitle: m.settings_subtitle,
    autoCalcLabel: m.auto_calc_label,
    autoCalcHint: m.auto_calc_hint,
    allergenLabel: m.allergen_label,
    allergenHint: m.allergen_hint,
    retentionLabel: m.retention_label,
    retentionHint: m.retention_hint,
    retentionAll: m.retention_all,
    save: m.save,
    saving: m.saving,
    saved: m.saved,
    saveErrorForbidden: m.save_error_forbidden,
    saveErrorGeneric: m.save_error_generic,
  };
}

const emptyKpis: BomKpis = { active: 0, draft: 0, archived: 0 };
const defaultSettings: BomSettings = {
  autoCalculateNutrition: true,
  requireAllergenReview: true,
  retention: '10',
};

const sampleRows: BomRow[] = [
  {
    id: '11111111-2222-3333-4444-555555555555',
    bomNumber: 'BOM-11111111',
    product: 'Tomato Passata 500g',
    version: 'v3',
    ingredientsCount: 7,
    lastUpdated: '2026-05-30',
    status: 'active',
  },
  {
    id: '66666666-7777-8888-9999-000000000000',
    bomNumber: 'BOM-66666666',
    product: 'Basil Pesto 200g',
    version: 'v1',
    ingredientsCount: 4,
    lastUpdated: '2026-04-12',
    status: 'draft',
  },
  {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    bomNumber: 'BOM-aaaaaaaa',
    product: 'Legacy Sauce 1L',
    version: 'v9',
    ingredientsCount: 12,
    lastUpdated: '2025-11-01',
    status: 'archived',
  },
];

function renderScreen(props: Partial<React.ComponentProps<typeof BomsScreen>> = {}) {
  return render(
    <BomsScreen
      rows={sampleRows}
      kpis={{ active: 1, draft: 1, archived: 1 }}
      settings={defaultSettings}
      canEdit
      labels={buildLabels()}
      {...props}
    />,
  );
}

describe('BomsScreen', () => {
  it('renders the PageHead inside the .sg-head structure', () => {
    const { container } = renderScreen();
    const head = container.querySelector('.sg-head');
    expect(head).toBeInTheDocument();
    expect(head?.querySelector('.sg-title')).toHaveTextContent('BOMs & recipes');
    expect(head?.querySelector('.sg-sub')).toBeInTheDocument();
  });

  it('renders an empty-state for the table when there are no BOMs', () => {
    renderScreen({ rows: [], kpis: emptyKpis });
    expect(screen.getByTestId('boms-table-empty')).toHaveTextContent('No BOMs have been created yet.');
    expect(screen.queryByTestId('boms-table')).not.toBeInTheDocument();
  });

  it('renders three KPI cards with their real counts using the .kpi classes', () => {
    const { container } = renderScreen({ kpis: { active: 42, draft: 6, archived: 18 } });

    const kpis = container.querySelectorAll('.kpi');
    expect(kpis).toHaveLength(3);

    const active = screen.getByTestId('boms-kpi-active');
    expect(within(active).getByText('Active BOMs')).toBeInTheDocument();
    expect(active.querySelector('.kpi-value')).toHaveTextContent('42');

    const draft = screen.getByTestId('boms-kpi-draft');
    expect(draft).toHaveClass('amber');
    expect(within(draft).getByText('Draft (NPD)')).toBeInTheDocument();
    expect(draft.querySelector('.kpi-value')).toHaveTextContent('6');

    const archived = screen.getByTestId('boms-kpi-archived');
    expect(within(archived).getByText('Archived')).toBeInTheDocument();
    expect(archived.querySelector('.kpi-value')).toHaveTextContent('18');
  });

  it('renders the BOMs table with the prototype columns and a row per BOM', () => {
    renderScreen();
    const table = screen.getByTestId('boms-table');

    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['BOM #', 'Product', 'Version', 'Ingredients', 'Last updated', 'Status']);

    expect(within(table).getByText('BOM-11111111')).toBeInTheDocument();
    expect(within(table).getByText('Tomato Passata 500g')).toBeInTheDocument();
    expect(within(table).getByText('Basil Pesto 200g')).toBeInTheDocument();

    // One status badge per row, mapped to the right tone class.
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(bodyRows).toHaveLength(3);
    expect(table.querySelector('.badge-green')).toHaveTextContent('Active');
    expect(table.querySelector('.badge-amber')).toHaveTextContent('Draft');
    expect(table.querySelector('.badge-gray')).toHaveTextContent('Archived');
  });

  it('renders the BOM settings Section with two toggles and the retention select', () => {
    const { container } = renderScreen();

    // The settings Section is the .sg-section that contains a foot (Save).
    const sections = container.querySelectorAll('.sg-section');
    expect(sections.length).toBeGreaterThanOrEqual(2);

    // Two .sg-toggle slider switches.
    const toggles = container.querySelectorAll('.sg-toggle');
    expect(toggles).toHaveLength(2);

    const autoCalc = screen.getByRole('checkbox', { name: 'Auto-calculate nutrition' });
    expect(autoCalc).toBeChecked();
    const allergen = screen.getByRole('checkbox', { name: 'Require allergen review' });
    expect(allergen).toBeChecked();

    // Retention select wired through the shared @monopilot/ui Select primitive.
    expect(screen.getByRole('combobox', { name: 'BOM version retention' })).toBeInTheDocument();

    // Save action lives in the grey .sg-section-foot.
    const foot = container.querySelector('.sg-section-foot');
    expect(foot).toBeInTheDocument();
    expect(within(foot as HTMLElement).getByTestId('boms-settings-save')).toHaveTextContent('Save changes');
  });

  it('uses the shared .sg-row / .sg-label / .sg-field structure for each setting row', () => {
    const { container } = renderScreen();
    const rows = container.querySelectorAll('.sg-row');
    // 2 toggle rows + 1 select row = 3 setting rows.
    expect(rows).toHaveLength(3);
    rows.forEach((row) => {
      expect(row.querySelector('.sg-label')).toBeInTheDocument();
      expect(row.querySelector('.sg-field')).toBeInTheDocument();
    });
  });

  it('toggles a setting and persists the draft via onSaveSettings', async () => {
    const user = userEvent.setup();
    const onSaveSettings = vi.fn(async (next: BomSettings) => ({ ok: true as const, settings: next }));

    renderScreen({ onSaveSettings });

    await user.click(screen.getByRole('checkbox', { name: 'Require allergen review' }));
    await user.click(screen.getByTestId('boms-settings-save'));

    expect(onSaveSettings).toHaveBeenCalledTimes(1);
    expect(onSaveSettings.mock.calls[0][0]).toMatchObject({
      autoCalculateNutrition: true,
      requireAllergenReview: false,
      retention: '10',
    });
    expect(await screen.findByTestId('boms-settings-saved')).toHaveTextContent('Settings saved.');
  });

  it('shows a forbidden error when the save action is rejected', async () => {
    const user = userEvent.setup();
    const onSaveSettings = vi.fn(async () => ({ ok: false as const, error: 'forbidden' as const }));

    renderScreen({ onSaveSettings });

    await user.click(screen.getByTestId('boms-settings-save'));

    const error = await screen.findByTestId('boms-settings-error');
    expect(error).toHaveTextContent('You do not have permission to change BOM settings.');
  });

  it('renders the loud load-error alert when the loaders failed', () => {
    renderScreen({ loadError: true, rows: [], kpis: emptyKpis });
    const alert = screen.getByTestId('boms-load-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('BOMs could not be loaded.');
  });

  it('carries the prototype-source anchor for parity tooling', () => {
    const { container } = renderScreen();
    const main = container.querySelector('main');
    expect(main).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/data-screens.jsx:55-103',
    );
  });
});
