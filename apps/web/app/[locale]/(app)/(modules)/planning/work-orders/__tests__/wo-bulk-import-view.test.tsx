/**
 * @vitest-environment jsdom
 *
 * Bulk WO import view — thin client wiring around the shipped actions
 *   apps/web/lib/import/wo-import-validator.ts → previewWoImport(formData)
 *   apps/web/lib/import/wo-import-actions.ts    → confirmWoImport(rows)
 *
 * NO prototype exists — parity is by REUSE of the planning list conventions
 * (wo-list-view.tsx) and a 1:1 mirror of the shipped PO import view. This suite
 * tests the REAL WoBulkImportView (its WO column config + the shared BulkImportView)
 * and asserts that reuse + the flow + states, mirroring the PO import test.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WoBulkImportView } from '../import/_components/wo-bulk-import-view';
import type { WoBulkImportLabels } from '../import/_components/wo-bulk-import-columns';
import type { ImportError } from '../../../../../../../lib/import/po-import-validator';
import type { PreviewWoRow } from '../../../../../../../lib/import/wo-import-validator';

afterEach(cleanup);

const LABELS: WoBulkImportLabels = {
  fileLabel: 'CSV file',
  fileHelp: 'Upload a CSV of work order lines.',
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
  createdCount: '{n} work order(s) created.',
  createErrorsTitle: 'Create errors',
  backToList: 'Back to work orders',
  columns: {
    row: 'Row',
    woNumber: 'WO number',
    item: 'Item',
    qty: 'Qty',
    uom: 'UoM',
    routing: 'Routing',
    scheduled: 'Scheduled',
  },
  errorColumns: { row: 'Row', column: 'Column', message: 'Message' },
};

function validRow(n: number, over: Partial<PreviewWoRow> = {}): PreviewWoRow {
  return {
    rowNumber: n,
    supplierCode: '',
    supplierId: '',
    itemCode: `FG-${n}`,
    itemId: `item-${n}`,
    qty: '100',
    uom: 'base',
    unitPrice: '0',
    woNumber: `WO-${n}`,
    routingId: undefined,
    scheduledStartTime: '2026-12-31',
    ...over,
  };
}

const PREVIEW_MIXED = {
  valid: [validRow(1), validRow(2)],
  errors: [
    { rowNumber: 3, column: 'item_code', message: 'Item/product code "FG-X" was not found.' },
    { rowNumber: 4, column: 'qty', message: 'Quantity must be greater than 0.' },
  ] satisfies ImportError[],
};

const PREVIEW_ALL_INVALID = {
  valid: [] as PreviewWoRow[],
  errors: [{ rowNumber: 1, column: 'uom', message: 'UoM "x" is not valid for item code "FG-1".' }] satisfies ImportError[],
};

function renderView(over: Partial<React.ComponentProps<typeof WoBulkImportView>> = {}) {
  return render(
    <WoBulkImportView
      backHref="/en/planning/work-orders"
      labels={LABELS}
      previewAction={vi.fn(async () => PREVIEW_MIXED)}
      confirmAction={vi.fn()}
      {...over}
    />,
  );
}

function pickCsv(text = 'item_code,qty,uom\nFG-1,100,base') {
  const file = new File([text], 'wo.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  fireEvent.change(screen.getByTestId('wo-bulk-import-file'), { target: { files: [file] } });
}

describe('WO bulk import view (mirror of the PO import screen — no prototype)', () => {
  it('Preview is disabled until a file is picked (empty state)', () => {
    renderView({ previewAction: vi.fn() });
    expect(screen.getByTestId('wo-bulk-import-preview')).toBeDisabled();
  });

  it('the primary CTA reuses the shared Button btn--primary convention (parity)', () => {
    renderView({ previewAction: vi.fn() });
    const preview = screen.getByTestId('wo-bulk-import-preview');
    expect(preview).toHaveClass('btn');
    expect(preview).toHaveClass('btn--primary');
  });

  it('picking a file then Preview calls previewWoImport with FormData carrying the file', async () => {
    const previewAction = vi.fn<(fd: FormData) => Promise<typeof PREVIEW_MIXED>>(async () => PREVIEW_MIXED);
    renderView({ previewAction });

    pickCsv();
    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('wo-bulk-import-preview'));

    await waitFor(() => expect(previewAction).toHaveBeenCalledTimes(1));
    const arg = previewAction.mock.calls[0]![0];
    expect(arg).toBeInstanceOf(FormData);
    expect(arg.get('file')).toBeInstanceOf(File);
  });

  it('renders valid rows (with WO-specific WO#/routing columns) + a separated errors list', async () => {
    renderView();
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('wo-bulk-import-preview'));

    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-valid-table')).toBeInTheDocument());
    expect(screen.getByTestId('wo-bulk-import-valid-table')).toHaveClass('w-full');
    expect(screen.getAllByTestId('wo-bulk-import-valid-row')).toHaveLength(2);
    expect(screen.getByTestId('wo-bulk-import-valid-count')).toHaveTextContent('2 valid row(s)');

    const table = screen.getByTestId('wo-bulk-import-valid-table');
    expect(table).toHaveTextContent('WO number');
    expect(table).toHaveTextContent('Routing');
    expect(table).toHaveTextContent('WO-1');

    const errorsTable = screen.getByTestId('wo-bulk-import-errors-table');
    expect(errorsTable).toHaveTextContent('item_code');
    expect(errorsTable).toHaveTextContent('qty');
    expect(screen.getByTestId('wo-bulk-import-errors-count')).toHaveTextContent('2 error(s)');

    expect(screen.getByTestId('wo-bulk-import-confirm')).not.toBeDisabled();
  });

  it('Confirm is disabled when the preview has zero valid rows (error/empty state)', async () => {
    renderView({ previewAction: vi.fn(async () => PREVIEW_ALL_INVALID) });
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('wo-bulk-import-preview'));

    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-no-valid')).toBeInTheDocument());
    expect(screen.getByTestId('wo-bulk-import-confirm')).toBeDisabled();
    expect(screen.getByTestId('wo-bulk-import-errors-table')).toHaveTextContent('uom');
  });

  it('Confirm calls confirmWoImport with the valid rows and shows created count + create errors', async () => {
    const createErrors: ImportError[] = [
      { rowNumber: 2, column: 'wo_number', message: 'Could not create work order: persistence_failed.' },
    ];
    const confirmAction = vi.fn<(rows: PreviewWoRow[]) => Promise<{ created: number; errors: ImportError[] }>>(
      async () => ({ created: 1, errors: createErrors }),
    );
    renderView({ confirmAction });

    pickCsv();
    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('wo-bulk-import-preview'));
    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-confirm')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('wo-bulk-import-confirm'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    expect(confirmAction.mock.calls[0]![0]).toEqual(PREVIEW_MIXED.valid);

    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-created')).toBeInTheDocument());
    expect(screen.getByTestId('wo-bulk-import-created')).toHaveTextContent('1 work order(s) created.');
    expect(screen.getByTestId('wo-bulk-import-create-errors-table')).toHaveTextContent('persistence_failed');
    expect(screen.getByTestId('wo-bulk-import-back')).toBeInTheDocument();
  });

  it('surfaces an alert when previewWoImport throws (error state)', async () => {
    renderView({
      previewAction: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('wo-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('wo-bulk-import-preview'));
    await waitFor(() =>
      expect(screen.getByTestId('wo-bulk-import-preview-error')).toHaveTextContent('Could not preview'),
    );
  });
});
