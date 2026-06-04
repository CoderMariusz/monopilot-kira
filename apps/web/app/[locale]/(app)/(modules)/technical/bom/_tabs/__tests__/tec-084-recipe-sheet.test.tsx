/**
 * @vitest-environment jsdom
 * T-044 — TEC-084 Recipe Sheet print view — component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-detail.jsx:551-603
 *
 * Asserts: parity (header + ingredient table + manufacturing-op steps + notes),
 * the Print action calls window.print, and the INDUSTRY-CONFIG variant (bakery)
 * swaps section labels. FG canonical (no FA labels); private data never leaks
 * (only the public `notes` is passed by the caller).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RecipeSheetTab,
  type RecipeSheetData,
  type RecipeSheetLabels,
} from '../recipe-sheet-tab';

afterEach(() => cleanup());

const LABELS: RecipeSheetLabels = {
  print: 'Print',
  subhead: 'BOM {code} · v{version} · Yield {yield}% · {approved}',
  ingredientsTitle: 'Ingredients',
  processTitle: 'Process',
  notesTitle: 'Allergens & notes',
  colCode: 'Code',
  colName: 'Ingredient',
  colQty: 'Qty',
  colPct: '%',
  emptyLines: 'This BOM version has no ingredient lines.',
  approvedBy: 'Approved by',
  pendingApproval: 'Pending approval',
};

const DATA: RecipeSheetData = {
  productCode: 'FG-1001',
  productName: 'Kielbasa slaska 450g',
  version: 7,
  yieldPct: '91.000',
  approvedByName: 'A. Majewska',
  approvedAt: '2026-04-14T10:00:00.000Z',
  lines: [
    { id: 'l1', code: 'R-1001', name: 'Wieprzowina kl. II', quantity: '540', uom: 'g', pct: '54.0', operationName: 'Mince' },
    { id: 'l2', code: 'R-1002', name: 'Slonina', quantity: '220', uom: 'g', pct: '22.0', operationName: null },
  ],
  notes: 'May contain traces of mustard. Shelf life 21 days.',
};

describe('RecipeSheetTab — parity', () => {
  it('renders the header, subhead, ingredient table rows and process steps', () => {
    render(<RecipeSheetTab data={DATA} labels={LABELS} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kielbasa slaska 450g');
    expect(screen.getByText(/BOM FG-1001 · v7 · Yield 91% · Approved by A. Majewska/)).toBeInTheDocument();
    expect(screen.getAllByTestId('recipe-sheet-line')).toHaveLength(2);
    expect(screen.getByText('R-1001')).toBeInTheDocument();
    // process steps derived from manufacturing-op lines
    expect(screen.getAllByTestId('recipe-sheet-step')).toHaveLength(1);
    expect(screen.getByText('Allergens & notes')).toBeInTheDocument();
  });

  it('does not leak the legacy FA label', () => {
    const { container } = render(<RecipeSheetTab data={DATA} labels={LABELS} />);
    expect(container.textContent).not.toMatch(/Factory Article/i);
  });

  it('shows the empty copy when there are no ingredient lines', () => {
    render(<RecipeSheetTab data={{ ...DATA, lines: [] }} labels={LABELS} />);
    expect(screen.getByText(LABELS.emptyLines)).toBeInTheDocument();
  });
});

describe('RecipeSheetTab — print + industry variants', () => {
  it('calls window.print when Print is clicked', async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<RecipeSheetTab data={DATA} labels={LABELS} />);
    await user.click(screen.getByTestId('recipe-sheet-print-button'));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('uses bakery section labels when industry=bakery', () => {
    render(
      <RecipeSheetTab
        data={DATA}
        labels={LABELS}
        industry="bakery"
        industryLabels={{
          bakery: { ingredientsTitle: 'Recipe ingredients', processTitle: 'Method' },
        }}
      />,
    );
    expect(screen.getByTestId('recipe-sheet-tab')).toHaveAttribute('data-industry', 'bakery');
    expect(screen.getByText('Recipe ingredients')).toBeInTheDocument();
    expect(screen.getByText('Method')).toBeInTheDocument();
    // default meat labels are not shown
    expect(screen.queryByText('Ingredients')).toBeNull();
  });
});
