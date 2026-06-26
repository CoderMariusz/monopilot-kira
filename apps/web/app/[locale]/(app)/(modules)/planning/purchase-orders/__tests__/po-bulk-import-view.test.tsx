/**
 * @vitest-environment jsdom
 *
 * Bulk PO import view — thin client wiring around the shipped actions
 *   apps/web/lib/import/po-import-actions.ts
 *     previewBulkImportPo(formData) / confirmBulkImportPo(rows)
 *
 * NO prototype exists for this screen — parity is by REUSE of the existing PO list
 * conventions (po-list-view.tsx). This suite asserts that reuse + the flow + states:
 *   - parity: the primary CTAs use the shared @monopilot/ui/Button which renders the
 *     `btn` + `btn--primary` / `btn--secondary` modifier classes (the convention the
 *     PO pages already use), and the valid-rows table reuses the dense bordered
 *     `rounded-xl border border-slate-200` chrome.
 *   - flow: pick file → Preview calls previewBulkImportPo(FormData) → valid rows
 *     table + a clearly separated per-row errors list → Confirm (disabled when zero
 *     valid rows) calls confirmBulkImportPo(validRows) → created count + create errors.
 *   - i18n: labels are injected (the i18n→labels mapping is the page host's job).
 *   - RBAC: enforced server-side; the page host renders a denied panel — this island
 *     never trusts a client flag (asserted at the page-shape level by reuse of
 *     canImportPurchaseOrders; the island carries no permission prop).
 *
 * Labels are injected directly (same pattern as the Wave E-IO po-bulk-import test).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PoBulkImportView, type PoBulkImportLabels } from '../_components/po-bulk-import-view';
import type { ImportError, PreviewResult, PreviewRow } from '../../../../../../../lib/import/po-import-validator';

afterEach(cleanup);

const LABELS: PoBulkImportLabels = {
  fileLabel: 'CSV file',
  fileHelp: 'Upload a CSV of purchase order lines.',
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
  createdCount: '{n} purchase order(s) created.',
  createErrorsTitle: 'Create errors',
  backToList: 'Back to purchase orders',
  columns: {
    row: 'Row',
    supplier: 'Supplier',
    item: 'Item',
    qty: 'Qty',
    uom: 'UoM',
    unitPrice: 'Unit price',
    currency: 'Currency',
    expected: 'Expected',
  },
  errorColumns: { row: 'Row', column: 'Column', message: 'Message' },
};

function validRow(n: number, over: Partial<PreviewRow> = {}): PreviewRow {
  return {
    rowNumber: n,
    supplierCode: `SUP-${n}`,
    supplierId: `sup-${n}`,
    itemCode: `RM-${n}`,
    itemId: `item-${n}`,
    qty: '100',
    uom: 'kg',
    unitPrice: '2.5',
    currency: 'EUR',
    expectedDelivery: '2026-12-31',
    ...over,
  };
}

const PREVIEW_MIXED: PreviewResult = {
  valid: [validRow(1), validRow(2)],
  errors: [
    { rowNumber: 3, column: 'supplier_code', message: 'Supplier code "SUP-X" was not found.' },
    { rowNumber: 4, column: 'qty', message: 'Quantity must be greater than 0.' },
  ],
};

const PREVIEW_ALL_INVALID: PreviewResult = {
  valid: [],
  errors: [{ rowNumber: 1, column: 'item_code', message: 'Item/product code "RM-X" was not found.' }],
};

function pickCsv(text = 'supplier_code,item_code,qty,uom\nSUP-1,RM-1,100,kg') {
  const file = new File([text], 'po.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  fireEvent.change(screen.getByTestId('po-bulk-import-file'), { target: { files: [file] } });
}

describe('PO bulk import view (reuse of PO list conventions — no prototype)', () => {
  it('Preview is disabled until a file is picked (empty state)', () => {
    render(
      <PoBulkImportView locale="en" labels={LABELS} previewAction={vi.fn()} confirmAction={vi.fn()} />,
    );
    expect(screen.getByTestId('po-bulk-import-preview')).toBeDisabled();
  });

  it('the primary CTA reuses the shared Button btn--primary convention (parity)', () => {
    render(
      <PoBulkImportView locale="en" labels={LABELS} previewAction={vi.fn()} confirmAction={vi.fn()} />,
    );
    const preview = screen.getByTestId('po-bulk-import-preview');
    expect(preview).toHaveClass('btn');
    expect(preview).toHaveClass('btn--primary');
  });

  it('picking a file then Preview calls previewBulkImportPo with FormData carrying the file', async () => {
    const previewAction = vi.fn<(fd: FormData) => Promise<PreviewResult>>(async () => PREVIEW_MIXED);
    render(
      <PoBulkImportView locale="en" labels={LABELS} previewAction={previewAction} confirmAction={vi.fn()} />,
    );

    pickCsv();
    await waitFor(() => expect(screen.getByTestId('po-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('po-bulk-import-preview'));

    await waitFor(() => expect(previewAction).toHaveBeenCalledTimes(1));
    const arg = previewAction.mock.calls[0]![0];
    expect(arg).toBeInstanceOf(FormData);
    expect(arg.get('file')).toBeInstanceOf(File);
  });

  it('renders valid rows in a bordered table + a separated per-row errors list', async () => {
    render(
      <PoBulkImportView
        locale="en"
        labels={LABELS}
        previewAction={vi.fn(async () => PREVIEW_MIXED)}
        confirmAction={vi.fn()}
      />,
    );
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('po-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('po-bulk-import-preview'));

    // Valid rows table (dense bordered chrome reused from the PO list).
    await waitFor(() => expect(screen.getByTestId('po-bulk-import-valid-table')).toBeInTheDocument());
    expect(screen.getByTestId('po-bulk-import-valid-table')).toHaveClass('w-full');
    expect(screen.getAllByTestId('po-bulk-import-valid-row')).toHaveLength(2);
    expect(screen.getByTestId('po-bulk-import-valid-count')).toHaveTextContent('2 valid row(s)');

    // Errors are in a CLEARLY SEPARATED list, not interleaved with the valid rows.
    const errorsTable = screen.getByTestId('po-bulk-import-errors-table');
    expect(errorsTable).toHaveTextContent('supplier_code');
    expect(errorsTable).toHaveTextContent('qty');
    expect(screen.getByTestId('po-bulk-import-errors-count')).toHaveTextContent('2 error(s)');

    // Confirm enabled because there are valid rows.
    expect(screen.getByTestId('po-bulk-import-confirm')).not.toBeDisabled();
  });

  it('Confirm is disabled when the preview has zero valid rows (error/empty state)', async () => {
    render(
      <PoBulkImportView
        locale="en"
        labels={LABELS}
        previewAction={vi.fn(async () => PREVIEW_ALL_INVALID)}
        confirmAction={vi.fn()}
      />,
    );
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('po-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('po-bulk-import-preview'));

    await waitFor(() => expect(screen.getByTestId('po-bulk-import-no-valid')).toBeInTheDocument());
    expect(screen.getByTestId('po-bulk-import-confirm')).toBeDisabled();
    expect(screen.getByTestId('po-bulk-import-errors-table')).toHaveTextContent('item_code');
  });

  it('Confirm calls confirmBulkImportPo with the valid rows and shows created count + create errors', async () => {
    const createErrors: ImportError[] = [
      { rowNumber: 2, column: 'supplier_code', message: 'Could not create purchase order: persistence_failed.' },
    ];
    const confirmAction = vi.fn<(rows: PreviewRow[]) => Promise<{ created: number; errors: ImportError[] }>>(
      async () => ({ created: 1, errors: createErrors }),
    );
    render(
      <PoBulkImportView
        locale="en"
        labels={LABELS}
        previewAction={vi.fn(async () => PREVIEW_MIXED)}
        confirmAction={confirmAction}
      />,
    );

    pickCsv();
    await waitFor(() => expect(screen.getByTestId('po-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('po-bulk-import-preview'));
    await waitFor(() => expect(screen.getByTestId('po-bulk-import-confirm')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('po-bulk-import-confirm'));

    await waitFor(() => expect(confirmAction).toHaveBeenCalledTimes(1));
    // Called with exactly the previewed valid rows (not the raw file).
    expect(confirmAction.mock.calls[0]![0]).toEqual(PREVIEW_MIXED.valid);

    await waitFor(() => expect(screen.getByTestId('po-bulk-import-created')).toBeInTheDocument());
    expect(screen.getByTestId('po-bulk-import-created')).toHaveTextContent('1 purchase order(s) created.');
    expect(screen.getByTestId('po-bulk-import-create-errors-table')).toHaveTextContent('persistence_failed');
    expect(screen.getByTestId('po-bulk-import-back')).toBeInTheDocument();
  });

  it('surfaces an alert when previewBulkImportPo throws (error state)', async () => {
    render(
      <PoBulkImportView
        locale="en"
        labels={LABELS}
        previewAction={vi.fn(async () => {
          throw new Error('boom');
        })}
        confirmAction={vi.fn()}
      />,
    );
    pickCsv();
    await waitFor(() => expect(screen.getByTestId('po-bulk-import-preview')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('po-bulk-import-preview'));
    await waitFor(() => expect(screen.getByTestId('po-bulk-import-preview-error')).toHaveTextContent('Could not preview'));
  });
});
