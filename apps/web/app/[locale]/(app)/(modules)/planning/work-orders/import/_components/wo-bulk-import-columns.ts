/**
 * Work-Order import — labels contract + valid-rows column config for the shared
 * BulkImportView. The generic view owns the file picker / preview / errors /
 * confirm chrome; this module supplies only the WO-specific table columns
 * (WO# / item / qty / uom / routing / scheduled) so the screen mirrors the PO
 * valid-rows table without forking the view.
 */
import type { ImportColumn } from '../../../../../../../../lib/import/_components/bulk-import-view';
import type { PreviewWoRow } from '../../../../../../../../lib/import/wo-import-validator';

export type WoBulkImportLabels = {
  fileLabel: string;
  fileHelp: string;
  selectedFile: string;
  preview: string;
  previewing: string;
  confirm: string;
  confirming: string;
  reset: string;
  previewError: string;
  confirmError: string;
  validTitle: string;
  validCount: string;
  errorsTitle: string;
  errorsCount: string;
  noValidRows: string;
  noErrors: string;
  createdTitle: string;
  createdCount: string;
  createErrorsTitle: string;
  backToList: string;
  columns: {
    row: string;
    woNumber: string;
    item: string;
    qty: string;
    uom: string;
    routing: string;
    scheduled: string;
  };
  errorColumns: {
    row: string;
    column: string;
    message: string;
  };
};

export function buildWoColumns(labels: WoBulkImportLabels): ImportColumn<PreviewWoRow>[] {
  return [
    { key: 'row', header: labels.columns.row, align: 'right', cell: (r) => r.rowNumber },
    { key: 'woNumber', header: labels.columns.woNumber, cell: (r) => r.woNumber ?? '—' },
    { key: 'item', header: labels.columns.item, cell: (r) => r.itemCode },
    { key: 'qty', header: labels.columns.qty, align: 'right', cell: (r) => r.qty },
    { key: 'uom', header: labels.columns.uom, cell: (r) => r.uom },
    { key: 'routing', header: labels.columns.routing, cell: (r) => r.routingId ?? '—' },
    { key: 'scheduled', header: labels.columns.scheduled, cell: (r) => r.scheduledStartTime ?? '—' },
  ];
}
