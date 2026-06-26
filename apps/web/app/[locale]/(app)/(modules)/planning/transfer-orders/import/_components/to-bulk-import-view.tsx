'use client';

/**
 * Transfer-Order bulk import — thin TO-specific wrapper over the shared
 * BulkImportView (apps/web/lib/import/_components/bulk-import-view.tsx). It only
 * binds the TO labels → generic labels + the TO valid-rows columns, then forwards
 * the shipped previewToImport / confirmToImport seams. All flow + the five UI
 * states live in the shared view; this carries no permission prop (RBAC is the
 * page host's server-side gate).
 */
import React from 'react';

import { BulkImportView } from '../../../../../../../../lib/import/_components/bulk-import-view';
import type { ImportError } from '../../../../../../../../lib/import/po-import-validator';
import type { PreviewToRow } from '../../../../../../../../lib/import/to-import-validator';

import { buildToColumns, type ToBulkImportLabels } from './to-bulk-import-columns';

export type ToBulkImportViewProps = {
  backHref: string;
  labels: ToBulkImportLabels;
  previewAction: (formData: FormData) => Promise<{ valid: PreviewToRow[]; errors: ImportError[] }>;
  confirmAction: (rows: PreviewToRow[]) => Promise<{ created: number; errors: ImportError[] }>;
};

export function ToBulkImportView({ backHref, labels, previewAction, confirmAction }: ToBulkImportViewProps) {
  const columns = React.useMemo(() => buildToColumns(labels), [labels]);
  return (
    <BulkImportView<PreviewToRow>
      testidPrefix="to-bulk-import"
      backHref={backHref}
      labels={labels}
      columns={columns}
      previewAction={previewAction}
      confirmAction={confirmAction}
    />
  );
}
