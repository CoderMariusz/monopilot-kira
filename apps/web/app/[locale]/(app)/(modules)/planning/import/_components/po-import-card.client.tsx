'use client';

/**
 * Wave E-IO (decision #6) — Bulk PO import hub: the PO card client island.
 *
 * Holds the two card actions and the wizard:
 *   - [Download template] → builds the CSV (header columns + one example row)
 *     entirely client-side and triggers a browser download (no Server Action).
 *   - [Import file] → reveals the 4-step PoImportWizard inline.
 *
 * Kept a Client island so the hub page stays a Server Component (RBAC gate +
 * i18n string resolution run on the server). The wizard's validate/commit
 * actions are passed through untouched (owned by the PO import T2 lane).
 */

import React from 'react';

import { downloadCsv } from '../../../../../../../lib/shared/download';
import { buildPoTemplateCsv } from '../_lib/parse-po-csv';
import { PoImportWizard, type PoImportLabels } from './po-import-wizard.client';
import type {
  PoImportRow,
  PoValidationResult,
  PoImportResult,
} from '../../purchase-orders/_actions/import-po';

export type PoImportCardLabels = {
  cardTitle: string;
  cardDesc: string;
  downloadTemplate: string;
  importFile: string;
  templateColumns: string;
  wizard: PoImportLabels;
};

export type PoImportCardProps = {
  locale: string;
  labels: PoImportCardLabels;
  /** Open the wizard immediately on mount (?source=po deep-link from the PO list). */
  autoOpen?: boolean;
  validateAction: (rows: PoImportRow[]) => Promise<PoValidationResult>;
  commitAction: (rows: PoImportRow[], options: { mode: 'all_or_nothing' | 'skip_invalid' }) => Promise<PoImportResult>;
};

export function PoImportCard({ locale, labels, autoOpen = false, validateAction, commitAction }: PoImportCardProps) {
  const [open, setOpen] = React.useState(autoOpen);

  const onDownloadTemplate = React.useCallback(() => {
    downloadCsv(buildPoTemplateCsv(), 'po-import-template.csv');
  }, []);

  return (
    <section className="card" style={{ padding: 18 }} data-testid="po-import-card" aria-labelledby="po-import-card-h">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="po-import-card-h" className="card-title">
            {labels.cardTitle}
          </h2>
          <p className="helper mt-1">{labels.cardDesc}</p>
          <p className="ff-help mono mt-2" data-testid="po-import-template-columns">
            {labels.templateColumns}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid="po-import-download-template"
            onClick={onDownloadTemplate}
          >
            {labels.downloadTemplate}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="po-import-open-wizard"
            onClick={() => setOpen(true)}
          >
            {labels.importFile}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-5">
          <PoImportWizard
            locale={locale}
            labels={labels.wizard}
            validateAction={validateAction}
            commitAction={commitAction}
          />
        </div>
      ) : null}
    </section>
  );
}
