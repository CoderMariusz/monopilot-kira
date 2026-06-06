/**
 * @vitest-environment jsdom
 *
 * Formulations list (cross-FG) — RTL parity + interaction test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/formulation-screens.jsx:7-76 (FormulationList)
 *
 * Asserts the parity checklist (FG / Version / Status badge / Effective dates /
 * Items / Allergens columns + Open action), the FG filter + Status filter + search
 * narrowing the rows, the empty state, and the i18n-supplied labels (provided
 * inline here — the message JSON files are NOT edited by this task).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FormulationsList,
  type FormulationListRow,
  type FormulationsListLabels,
} from '../formulations-list';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/formulations',
}));

const LABELS: FormulationsListLabels = {
  title: 'Formulations',
  subtitle: 'Cross-FG view of all formulation versions',
  searchPlaceholder: 'Search FG code, name or version…',
  filterFg: 'Finished Good',
  filterStatus: 'Status',
  clearFilters: 'Clear filters',
  fgAll: 'All Finished Goods',
  statusAll: 'All statuses',
  statusDraft: 'Draft',
  statusSubmitted: 'Submitted for trial',
  statusLocked: 'Locked',
  colFg: 'Finished Good',
  colVersion: 'Version',
  colStatus: 'Status',
  colEffectiveFrom: 'Effective from',
  colEffectiveTo: 'Effective to',
  colItems: 'Items',
  colAllergens: 'Allergens',
  colActions: 'Actions',
  open: 'Open',
  current: 'current',
  none: '—',
  loading: 'Loading formulations…',
  empty: 'No formulations match your filters',
  emptyBody: 'Formulation versions are created from the recipe editor.',
  error: 'Unable to load formulations.',
  forbidden: 'You do not have permission to view formulations.',
};

const ROWS: FormulationListRow[] = [
  {
    versionId: 'ver-1',
    projectId: 'proj-aaa',
    fgCode: 'FG0001',
    fgName: 'Strawberry Yoghurt',
    version: 'v2',
    status: 'locked',
    effectiveFrom: '2026-03-01',
    effectiveTo: null,
    itemCount: 8,
    allergenSummary: 'milk, soya',
  },
  {
    versionId: 'ver-2',
    projectId: 'proj-bbb',
    fgCode: 'FG0002',
    fgName: 'Oat Bar',
    version: 'v1',
    status: 'draft',
    effectiveFrom: '2026-04-15',
    effectiveTo: null,
    itemCount: 5,
    allergenSummary: null,
  },
];

afterEach(cleanup);

describe('FormulationsList', () => {
  it('renders one row per formulation version from props (no hardcoded rows)', () => {
    render(<FormulationsList rows={ROWS} labels={LABELS} state="ready" />);

    expect(screen.getByTestId('formulations-row-ver-1')).toBeInTheDocument();
    expect(screen.getByTestId('formulations-row-ver-2')).toBeInTheDocument();

    // Parity columns: FG code+name link, version, status badge, dates, items, allergens.
    const row1 = within(screen.getByTestId('formulations-row-ver-1'));
    expect(row1.getByText('FG0001 — Strawberry Yoghurt')).toBeInTheDocument();
    expect(row1.getByText('v2')).toBeInTheDocument();
    expect(row1.getByText('Locked')).toBeInTheDocument();
    expect(row1.getByText('2026-03-01')).toBeInTheDocument();
    expect(row1.getByText('current')).toBeInTheDocument();
    expect(row1.getByText('8')).toBeInTheDocument();
    expect(row1.getByText('milk, soya')).toBeInTheDocument();
  });

  it('links each row into the existing per-project formulation editor', () => {
    render(<FormulationsList rows={ROWS} labels={LABELS} state="ready" />);
    const row1 = within(screen.getByTestId('formulations-row-ver-1'));
    const openLinks = row1.getAllByRole('link');
    expect(openLinks.some((a) => a.getAttribute('href') === '/en/pipeline/proj-aaa/formulation')).toBe(true);
  });

  it('filters by status via the shadcn Select (not a raw <select>)', () => {
    render(<FormulationsList rows={ROWS} labels={LABELS} state="ready" />);
    // No raw native <select> elements (red-line).
    expect(document.querySelector('select')).toBeNull();

    const statusTrigger = screen.getByRole('combobox', { name: 'Status' });
    fireEvent.click(statusTrigger);
    fireEvent.click(screen.getByRole('option', { name: 'Locked' }));

    expect(screen.getByTestId('formulations-row-ver-1')).toBeInTheDocument();
    expect(screen.queryByTestId('formulations-row-ver-2')).not.toBeInTheDocument();
  });

  it('filters by Finished Good via the FG Select', () => {
    render(<FormulationsList rows={ROWS} labels={LABELS} state="ready" />);

    const fgTrigger = screen.getByRole('combobox', { name: 'Finished Good' });
    fireEvent.click(fgTrigger);
    fireEvent.click(screen.getByRole('option', { name: 'FG0002 — Oat Bar' }));

    expect(screen.getByTestId('formulations-row-ver-2')).toBeInTheDocument();
    expect(screen.queryByTestId('formulations-row-ver-1')).not.toBeInTheDocument();
  });

  it('filters by free-text search across code, name and version', () => {
    render(<FormulationsList rows={ROWS} labels={LABELS} state="ready" />);

    fireEvent.change(screen.getByPlaceholderText('Search FG code, name or version…'), {
      target: { value: 'oat' },
    });

    expect(screen.getByTestId('formulations-row-ver-2')).toBeInTheDocument();
    expect(screen.queryByTestId('formulations-row-ver-1')).not.toBeInTheDocument();
  });

  it('shows the empty state when no rows match', () => {
    render(<FormulationsList rows={[]} labels={LABELS} state="empty" />);
    expect(screen.getByText('No formulations match your filters')).toBeInTheDocument();
  });

  it('shows the error state notice', () => {
    render(<FormulationsList rows={[]} labels={LABELS} state="error" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load formulations.');
  });

  it('shows the permission-denied notice', () => {
    render(<FormulationsList rows={[]} labels={LABELS} state="permission_denied" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You do not have permission to view formulations.',
    );
  });

  it('shows the loading notice', () => {
    render(<FormulationsList rows={[]} labels={LABELS} state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading formulations…');
  });
});
