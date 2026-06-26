/**
 * @vitest-environment jsdom
 *
 * Bulk TO import view — thin client wiring around the shipped actions
 *   apps/web/lib/import/to-import-validator.ts → previewToImport(formData)
 *   apps/web/lib/import/to-import-actions.ts    → confirmToImport(rows)
 *
 * NO prototype exists — parity is by REUSE of the planning list conventions
 * (to-list-view.tsx) and a 1:1 mirror of the shipped PO import view. This suite
 * tests the REAL ToBulkImportView (its TO column config + the shared BulkImportView)
 * and asserts that reuse + the flow + states, mirroring the PO import test:
 *   - parity: the primary CTA uses the shared @monopilot/ui/Button (btn +
 *     btn--primary), and the valid-rows table reuses the dense bordered
 *     `rounded-xl border border-slate-200` (w-full) chrome.
 *   - flow: pick file → Preview calls previewToImport(FormData) → valid rows table
 *     + a separated per-row errors list → Confirm (disabled when zero valid rows)
 *     calls confirmToImport(validRows) → created count + create errors.
 *   - i18n: labels are injected (the i18n→labels mapping is the page host's job).
 *   - RBAC: enforced server-side; the page host renders a denied panel — this island
 *     never trusts a client flag (it carries no permission prop).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToBulkImportView } from '../import/_components/to-bulk-import-view';
import type { ToBulkImportLabels } from '../import/_components/to-bulk-import-columns';
import type { ImportError } from '../../../../../../../lib/import/po-import-validator';
import type { PreviewToRow } from '../../../../../../../lib/import/to-import-validator';

afterEach(cleanup);

const LABELS: ToBulkImportLabels = {
  fileLabel: 'CSV file',
  fileHelp: 'Upload a CSV of transfer order lines.',
  selectedFile: 'Selected file',
  preview: 'Preview',
  previewing: 'Previewing…',
  confirm: 'Confirm import',
  confirming: 'Importing…',
  reset: 'Reset',
  previewError: 'Could not preview the file. Please retry.',
  confirmError: 'The import could not be completed. Please retry.',
  validTitle: 'Valid rows',
  validCount: '{n} valid row(s)',
  errorsTitle: 'Row errors',
  errorsCount: '{n} error(s)',
  noValidRows: 'No valid rows to import.',
  noErrors: 'No row errors.',
  createdTitle: 'Import complete.',
  createdCount: '{n} transfer order(s) created.',
  createErrorsTitle: 'Create errors',
  backToList: 'Back to transfer orders',
  columns: {
    row: 'Row',
    toNumber: 'TO number',
    fromSite: 'From site',
    toSite: 'To site',
    item: 'Item',
    qty: 'Qty',
    uom: 'UoM',
    scheduled: 'Scheduled',
  },
  errorColumns: { row: 'Row', column: 'Column', message: 'Message' },
};

function validRow(n: number, over: Partial<PreviewToRow> = {}): PreviewToRow {
  return {
    rowNumber: n,
    supplierCode: '',
    supplierId: '',
    itemCode: `RM-${n}`,
    itemId: `item-${n}`,
    qty: '100',
    uom: 'kg',
    unitPrice: '0',
    toNumber: `TO-${n}`,
    fromSite: 'WH-A',
    fromSiteId: 'wh-a',
    toSite: 'WH-B',
    toSiteId: 'wh-b',
    scheduledDate: '2026-12-31',
    ...over,
  };
}

const PREVIEW_MIXED = {
  valid: [validRow(1), validRow(2)],
  errors: [
    { rowNumber: 3, column: 'from_site', message: 'Source site "WH-X" was not found.' },
    { rowNumber: 4, column: 'qty', message: 'Quantity must be greater than 0.' },
  ] satisfies ImportError[],
};

const PREVIEW_ALL_INVALID = {
  valid: [] as PreviewToRow[],
  errors: [{ rowNumber: 1, column: 'item_code', message: 'Item/product code "RM-X" was not found.' }] satisfies ImportError[],
};

function renderView(over: Partial<React.ComponentProps<typeof ToBulkImportView>> = {}) {
  return render(
    <ToBulkImportView
      backHref="/en/planning/transfer-orders"
      labels={LABELS}
      previewAction={vi.fn(async () => PREVIEW_MIXED)}
      confirmAction={vi.fn()}
      {...over}
    />,
  );
}

function pickCsv(text = 'from_site,to_site,item_code,qty,uom\nWH-A,WH-B,RM-1,100,kg') {
  const file = new File([text], 'to.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  fireEvent.change(screen.getByTestId('to-bulk-import-file'), { target: { files: [file] } });
}

describe('TO bulk import view (mirror of the PO import screen — no prototype)', () => {
  it('Preview is disabled until a file is picked (empty state)', () => {
    renderView({ previewAction: vi.fn() });
    expect(screen.getByTestId('to-bulk-import-preview')).toBeDisabled();
  });

  it('the primary CTA reuses the shared Button btn--primary convention (parity)', () => {
    renderView({ previewAction: vi.fn() });
    const preview = screen.getByTestId('to-bulk-import-preview');
    expect(preview).toHaveClass('btn');
    expect(preview).toHaveClass('btn--primary');
  });

  it('picking a file then Preview calls previewToImport with FormData carrying the file', async () => {
    const previewAction = vi.fn<(fd: FormData) => Promise<typeof PREVIEW_MIXED>>(async () => PREVIEW_MIXED);
    renderView({ previewAction });

    pickCsv();
    await waitFor(() => expect(screen.getByTestId('to-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('to-bulk-import-preview'));

    await waitFor(() => expect(previewAction).toHaveBeenCalledTimes(1));
    const arg = previewAction.mock.calls[0]![0];
    expect(arg).toBeInstanceOf(FormData);
    expect(arg.get('file')).toBeInstanceOf(File);
  });

  it('renders valid rows (with TO-specific from/to-site columns) + a separated errors list', async () => {
    renderView();
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('to-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('to-bulk-import-preview'));

    await waitFor(() => expect(screen.getByTestId('to-bulk-import-valid-table')).toBeInTheDocument());
    expect(screen.getByTestId('to-bulk-import-valid-table')).toHaveClass('w-full');
    expect(screen.getAllByTestId('to-bulk-import-valid-row')).toHaveLength(2);
    expect(screen.getByTestId('to-bulk-import-valid-count')).toHaveTextContent('2 valid row(s)');

    const table = screen.getByTestId('to-bulk-import-valid-table');
    expect(table).toHaveTextContent('From site');
    expect(table).toHaveTextContent('To site');
    expect(table).toHaveTextContent('WH-A');
    expect(table).toHaveTextContent('WH-B');

    const errorsTable = screen.getByTestId('to-bulk-import-errors-table');
    expect(errorsTable).toHaveTextContent('from_site');
    expect(errorsTable).toHaveTextContent('qty');
    expect(screen.getByTestId('to-bulk-import-errors-count')).toHaveTextContent('2 error(s)');

    expect(screen.getByTestId('to-bulk-import-confirm')).not.toBeDisabled();
  });

  it('Confirm is disabled when the preview has zero valid rows (error/empty state)', async () => {
    renderView({ previewAction: vi.fn(async () => PREVIEW_ALL_INVALID) });
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('to-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('to-bulk-import-preview'));

    await waitFor(() => expect(screen.getByTestId('to-bulk-import-no-valid')).toBeInTheDocument());
    expect(screen.getByTestId('to-bulk-import-confirm')).toBeDisabled();
    expect(screen.getByTestId('to-bulk-import-errors-table')).toHaveTextContent('item_code');
  });

  it('Confirm calls confirmToImport with the valid rows and shows created count + create errors', async () => {
    const createErrors: ImportError[] = [
      { rowNumber: 2, column: 'to_number', message: 'Could not create transfer order: persistence_failed.' },
    ];
    const confirmAction = vi.fn<(rows: PreviewToRow[]) => Promise<{ created: number; errors: ImportError[] }>>(
      async () => ({ created: 1, errors: createErrors }),
    );
    renderView({ confirmAction });

    pickCsv();
    await waitFor(() => expect(screen.getByTestId('to-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('to-bulk-import-preview'));
    await waitFor(() => expect(screen.getByTestId('to-bulk-import-confirm')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('to-bulk-import-confirm'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    expect(confirmAction.mock.calls[0]![0]).toEqual(PREVIEW_MIXED.valid);

    await waitFor(() => expect(screen.getByTestId('to-bulk-import-created')).toBeInTheDocument());
    expect(screen.getByTestId('to-bulk-import-created')).toHaveTextContent('1 transfer order(s) created.');
    expect(screen.getByTestId('to-bulk-import-create-errors-table')).toHaveTextContent('persistence_failed');
    expect(screen.getByTestId('to-bulk-import-back')).toBeInTheDocument();
  });

  it('surfaces an alert when previewToImport throws (error state)', async () => {
    renderView({
      previewAction: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('to-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('to-bulk-import-preview'));
    await waitFor(() =>
      expect(screen.getByTestId('to-bulk-import-preview-error')).toHaveTextContent('Could not preview'),
    );
  });
});
