'use client';

/**
 * Work-Order bulk import — thin WO-specific wrapper over the shared BulkImportView
 * (apps/web/lib/import/_components/bulk-import-view.tsx). It only binds the WO
 * labels → generic labels + the WO valid-rows columns, then forwards the shipped
 * previewWoImport / confirmWoImport seams. All flow + the five UI states live in
 * the shared view; this carries no permission prop (RBAC is the page host's
 * server-side gate).
 */
import React from 'react';

import { BulkImportView } from '../../../../../../../../lib/import/_components/bulk-import-view';
import type { ImportError } from '../../../../../../../../lib/import/po-import-validator';
import type { PreviewWoRow } from '../../../../../../../../lib/import/wo-import-validator';

import { buildWoColumns, type WoBulkImportLabels } from './wo-bulk-import-columns';

export type WoBulkImportViewProps = {
  backHref: string;
  labels: WoBulkImportLabels;
  previewAction: (formData: FormData) => Promise<{ valid: PreviewWoRow[]; errors: ImportError[] }>;
  confirmAction: (rows: PreviewWoRow[]) => Promise<{ created: number; errors: ImportError[] }>;
};

export function WoBulkImportView({ backHref, labels, previewAction, confirmAction }: WoBulkImportViewProps) {
  const columns = React.useMemo(() => buildWoColumns(labels), [labels]);
  return (
    <BulkImportView<PreviewWoRow>
      testidPrefix="wo-bulk-import"
      backHref={backHref}
      labels={labels}
      columns={columns}
      previewAction={previewAction}
      confirmAction={confirmAction}
    />
  );
}
