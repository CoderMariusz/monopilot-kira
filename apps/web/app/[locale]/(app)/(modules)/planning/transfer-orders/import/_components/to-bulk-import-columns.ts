/**
 * Transfer-Order import — labels contract + valid-rows column config for the
 * shared BulkImportView. The generic view owns the file picker / preview / errors
 * / confirm chrome; this module supplies only the TO-specific table columns
 * (TO# / from-site / to-site / item / qty / uom / scheduled) so the screen mirrors
 * the PO valid-rows table without forking the view.
 */
import type { ImportColumn } from '../../../../../../../../lib/import/_components/bulk-import-view';
import type { PreviewToRow } from '../../../../../../../../lib/import/to-import-validator';

export type ToBulkImportLabels = {
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
    toNumber: string;
    fromSite: string;
    toSite: string;
    item: string;
    qty: string;
    uom: string;
    scheduled: string;
  };
  errorColumns: {
    row: string;
    column: string;
    message: string;
  };
};

export function buildToColumns(labels: ToBulkImportLabels): ImportColumn<PreviewToRow>[] {
  return [
    { key: 'row', header: labels.columns.row, align: 'right', cell: (r) => r.rowNumber },
    { key: 'toNumber', header: labels.columns.toNumber, cell: (r) => r.toNumber ?? '—' },
    { key: 'fromSite', header: labels.columns.fromSite, cell: (r) => r.fromSite },
    { key: 'toSite', header: labels.columns.toSite, cell: (r) => r.toSite },
    { key: 'item', header: labels.columns.item, cell: (r) => r.itemCode },
    { key: 'qty', header: labels.columns.qty, align: 'right', cell: (r) => r.qty },
    { key: 'uom', header: labels.columns.uom, cell: (r) => r.uom },
    { key: 'scheduled', header: labels.columns.scheduled, cell: (r) => r.scheduledDate ?? '—' },
  ];
}
