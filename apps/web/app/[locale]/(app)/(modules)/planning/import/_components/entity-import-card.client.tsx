'use client';

/**
 * Wave E-IO — generic bulk-import hub card (Transfer Order / Work Order), the
 * sibling of the shipped PO card (po-import-card.client.tsx). Same two actions:
 *   - [Download template] → builds the CSV (header columns + one example row)
 *     entirely client-side and triggers a browser download (no Server Action).
 *   - [Import file] → reveals the 4-step generic EntityImportWizard inline.
 *
 * Kept a Client island so the hub page stays a Server Component (RBAC gate +
 * i18n string resolution run on the server). The wizard's validate/commit
 * actions are passed through untouched (owned by the TO/WO import T2 lanes).
 */

import React from 'react';

import { downloadCsv } from '../../../../../../../lib/shared/download';
import {
  resolveEntityImportSpec,
  resolvePreviewColumns,
  type EntityImportSpecId,
  type PreviewColumnDescriptor,
} from '../_lib/entity-import-registry';
import type { ToImportRow } from '../../transfer-orders/_actions/import-to';
import type { WoImportRow } from '../../work-orders/_actions/import-wo';
import { buildEntityTemplateCsv, type EntityCsvSpec } from '../_lib/parse-entity-csv';
import {
  EntityImportWizard,
  type CommitMode,
  type EntityCommitResponse,
  type EntityImportWizardLabels,
  type EntityValidationResponse,
} from './entity-import-wizard.client';

export type EntityImportCardLabels = {
  cardTitle: string;
  cardDesc: string;
  downloadTemplate: string;
  importFile: string;
  templateColumns: string;
  wizard: EntityImportWizardLabels;
};

export type EntityImportCardProps<TRow extends ToImportRow | WoImportRow, TCreated> = {
  locale: string;
  testid: string;
  labels: EntityImportCardLabels;
  entityKind: EntityImportSpecId;
  showConversion: boolean;
  previewColumnDescriptors: PreviewColumnDescriptor[];
  createdNumberField: string;
  listPath: string;
  templateFilename: string;
  errorReportFilename: string;
  autoOpen?: boolean;
  validateAction: (rows: TRow[]) => Promise<EntityValidationResponse>;
  commitAction: (rows: TRow[], options: { mode: CommitMode }) => Promise<EntityCommitResponse<TCreated>>;
};

export function EntityImportCard<TRow extends ToImportRow | WoImportRow, TCreated>(
  props: EntityImportCardProps<TRow, TCreated>,
) {
  const {
    locale,
    testid,
    labels,
    entityKind,
    showConversion,
    previewColumnDescriptors,
    createdNumberField,
    listPath,
    templateFilename,
    errorReportFilename,
    autoOpen = false,
    validateAction,
    commitAction,
  } = props;
  const [open, setOpen] = React.useState(autoOpen);
  const spec = React.useMemo((): EntityCsvSpec<TRow> => {
    if (entityKind === 'to') {
      return resolveEntityImportSpec('to') as unknown as EntityCsvSpec<TRow>;
    }
    return resolveEntityImportSpec('wo') as unknown as EntityCsvSpec<TRow>;
  }, [entityKind]);
  const previewColumns = React.useMemo(
    () => resolvePreviewColumns<TRow>(previewColumnDescriptors),
    [previewColumnDescriptors],
  );

  const onDownloadTemplate = React.useCallback(() => {
    downloadCsv(buildEntityTemplateCsv(spec), templateFilename);
  }, [spec, templateFilename]);

  return (
    <section
      className="card"
      style={{ padding: 18 }}
      data-testid={`${testid}-import-card`}
      aria-labelledby={`${testid}-import-card-h`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`${testid}-import-card-h`} className="card-title">
            {labels.cardTitle}
          </h2>
          <p className="helper mt-1">{labels.cardDesc}</p>
          <p className="ff-help mono mt-2" data-testid={`${testid}-import-template-columns`}>
            {labels.templateColumns}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            data-testid={`${testid}-import-download-template`}
            onClick={onDownloadTemplate}
          >
            {labels.downloadTemplate}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid={`${testid}-import-open-wizard`}
            onClick={() => setOpen(true)}
          >
            {labels.importFile}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-5">
          <EntityImportWizard
            locale={locale}
            testid={testid}
            labels={labels.wizard}
            spec={spec}
            showConversion={showConversion}
            previewColumns={previewColumns}
            createdNumberField={createdNumberField}
            listPath={listPath}
            errorReportFilename={errorReportFilename}
            validateAction={validateAction}
            commitAction={commitAction}
          />
        </div>
      ) : null}
    </section>
  );
}
