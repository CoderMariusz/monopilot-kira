/**
 * Wave E8 — /scheduler/changeover-matrix RTL tests.
 *
 * Prototype parity anchor:
 *   prototypes/design/Monopilot Design System/planning-ext/matrix-screens.jsx:1-247
 *     (N×N from→to grid, editable cell, save). Honest deltas in the deviation
 *     log: backend contract is changeover_minutes + requires_cleaning per cell
 *     (no versions / per-line overrides / review queue in this slice).
 *
 * Asserts: the grid renders one row/column per profile key; clicking a cell
 * opens the editor; saving calls upsertChangeoverMatrixEntry with the exact
 * allergen_from/allergen_to/changeover_minutes/requires_cleaning payload;
 * empty + error states; i18n.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../../i18n/en.json';
import plMessages from '../../../../../../i18n/pl.json';
import roMessages from '../../../../../../i18n/ro.json';
import ukMessages from '../../../../../../i18n/uk.json';

import { ChangeoverMatrixEditor, type ChangeoverMatrixLabels } from '../_components/changeover-matrix-editor';
import type { UpsertChangeoverMatrixEntryResult, ChangeoverMatrixEntry } from '../_actions/scheduler-types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

const en = (enMessages as Record<string, any>).Scheduler.matrix;

const labels: ChangeoverMatrixLabels = en;

const PROFILES = ['CONTAINS_GLUTEN', 'GLUTEN_FREE', 'STANDARD'];

function entry(over: Partial<ChangeoverMatrixEntry> & { allergen_from: string; allergen_to: string }): ChangeoverMatrixEntry {
  return {
    id: `cm-${over.allergen_from}-${over.allergen_to}`,
    org_id: 'org',
    site_id: null,
    version_id: 'v1',
    line_id: null,
    changeover_minutes: 45,
    requires_cleaning: true,
    requires_atp: false,
    risk_level: 'medium',
    notes: null,
    created_at: '2026-06-24T08:00:00.000Z',
    updated_at: '2026-06-24T08:00:00.000Z',
    ...over,
  };
}

const ENTRIES: ChangeoverMatrixEntry[] = [
  entry({ allergen_from: 'GLUTEN_FREE', allergen_to: 'CONTAINS_GLUTEN', changeover_minutes: 45, requires_cleaning: true }),
  entry({ allergen_from: 'CONTAINS_GLUTEN', allergen_to: 'GLUTEN_FREE', changeover_minutes: 60, requires_cleaning: true }),
];

function renderEditor(opts: {
  profileKeys?: string[];
  entries?: ChangeoverMatrixEntry[];
  upsertAction?: (input: any) => Promise<UpsertChangeoverMatrixEntryResult>;
} = {}) {
  const upsertAction =
    opts.upsertAction ??
    vi.fn(async (input: Partial<ChangeoverMatrixEntry>) => ({
      ok: true as const,
      entry: entry({
        allergen_from: input.allergen_from!,
        allergen_to: input.allergen_to!,
        changeover_minutes: Number(input.changeover_minutes),
        requires_cleaning: Boolean(input.requires_cleaning),
      }),
    }));
  render(
    <ChangeoverMatrixEditor
      labels={labels}
      profileKeys={opts.profileKeys ?? PROFILES}
      entries={opts.entries ?? ENTRIES}
      upsertAction={upsertAction}
    />,
  );
  return { upsertAction };
}

beforeEach(() => {
  refresh.mockClear();
});

describe('ChangeoverMatrixEditor — grid', () => {
  it('renders one row and column per profile key', () => {
    renderEditor();
    for (const p of PROFILES) {
      expect(screen.getByTestId(`matrix-col-${p}`)).toBeInTheDocument();
      expect(screen.getByTestId(`matrix-row-${p}`)).toBeInTheDocument();
    }
  });

  it('shows the cost for a defined off-diagonal cell', () => {
    renderEditor();
    expect(screen.getByTestId('matrix-cell-GLUTEN_FREE-CONTAINS_GLUTEN')).toHaveTextContent('45');
  });

  it('renders the empty-state add-pair form when there are no profiles', () => {
    renderEditor({ profileKeys: [], entries: [] });
    expect(screen.getByTestId('matrix-empty')).toBeInTheDocument();
    expect(screen.getByTestId('matrix-add-from')).toBeInTheDocument();
    expect(screen.getByTestId('matrix-add-submit')).toBeInTheDocument();
  });

  it('submits the first changeover pair from the empty state', async () => {
    const { upsertAction } = renderEditor({ profileKeys: [], entries: [] });

    fireEvent.change(screen.getByTestId('matrix-add-from'), { target: { value: 'GLUTEN_FREE' } });
    fireEvent.change(screen.getByTestId('matrix-add-to'), { target: { value: 'CONTAINS_GLUTEN' } });
    fireEvent.change(screen.getByTestId('matrix-add-cost'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('matrix-add-submit'));

    await waitFor(() => expect(upsertAction).toHaveBeenCalledWith({
      allergen_from: 'GLUTEN_FREE',
      allergen_to: 'CONTAINS_GLUTEN',
      changeover_minutes: 30,
      requires_cleaning: false,
      risk_level: 'low',
    }));
  });
});

describe('ChangeoverMatrixEditor — edit a cell', () => {
  it('opens the cell editor and saves the exact payload', async () => {
    const { upsertAction } = renderEditor();

    fireEvent.click(screen.getByTestId('matrix-cell-GLUTEN_FREE-STANDARD'));
    expect(await screen.findByTestId('matrix-cell-save')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('matrix-cost-input'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('matrix-wash-toggle'));
    fireEvent.click(screen.getByTestId('matrix-cell-save'));

    await waitFor(() => expect(upsertAction).toHaveBeenCalledTimes(1));
    expect(upsertAction).toHaveBeenCalledWith({
      allergen_from: 'GLUTEN_FREE',
      allergen_to: 'STANDARD',
      changeover_minutes: 30,
      requires_cleaning: true,
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('does not open the editor for a diagonal (same from/to) cell', () => {
    renderEditor();
    fireEvent.click(screen.getByTestId('matrix-cell-STANDARD-STANDARD'));
    expect(screen.queryByTestId('matrix-cell-save')).not.toBeInTheDocument();
  });

  it('surfaces a save error inline', async () => {
    const upsertAction = vi.fn(async () => ({ ok: false as const, error: 'persistence_failed' as const }));
    renderEditor({ upsertAction });

    fireEvent.click(screen.getByTestId('matrix-cell-GLUTEN_FREE-STANDARD'));
    fireEvent.change(await screen.findByTestId('matrix-cost-input'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('matrix-cell-save'));

    expect(await screen.findByTestId('matrix-cell-error')).toHaveTextContent(
      en.errors.persistence_failed,
    );
  });
});

describe('i18n — Scheduler.matrix locale parity', () => {
  it('defines Scheduler.matrix in all four locales', () => {
    for (const messages of [enMessages, plMessages, roMessages, ukMessages]) {
      const matrix = (messages as Record<string, any>).Scheduler.matrix;
      expect(matrix.title).toBeTruthy();
      expect(matrix.cellModalTitle).toBeTruthy();
      expect(matrix.washRequired).toBeTruthy();
      expect(matrix.errors.persistence_failed).toBeTruthy();
    }
    expect((plMessages as Record<string, any>).Scheduler.matrix.title).not.toBe(
      (enMessages as Record<string, any>).Scheduler.matrix.title,
    );
  });
});
