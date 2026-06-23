/**
 * Wave E-IO (decision #6) — Bulk import hub (/planning/import).
 *
 * A spec-driven hub that fronts the bulk-import flows for Planning documents.
 * Today it ships the Purchase Order importer (live backend:
 * ../purchase-orders/_actions/import-po.ts → validatePoImport / commitPoImport);
 * the Transfer Order and Work Order cards are honest "coming soon" placeholders
 * (a parallel lane builds import-to.ts / import-wo.ts) — disabled, with a tooltip
 * (title) explaining why.
 *
 * Structural reference (NOT 1:1 visual): the locked spec-driven bulk-import
 * wizard primitive
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`) — re-applied for the PO domain; the hub card grid
 *   mirrors the Planning landing nav cards (planning/page.tsx). See
 *   _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Data: REAL Supabase-backed PO import actions (imported, never authored). RBAC
 * for the PO importer is enforced server-side (npd.planning.write) — resolved
 * once here via canImportPurchaseOrders() so the page renders the wizard or a
 * permission-denied panel WITHOUT trusting any client flag (never render-then-
 * disable). No raw UUID is rendered.
 *
 * UI states: loading (RSC awaits the gate; no client skeleton needed — the page
 * renders once resolved), empty (the wizard's own empty/upload state), error
 * (parse/commit failures surface inside the wizard as an alert, never a 500),
 * permission-denied (the denied panel below), optimistic (busy CTAs in the
 * wizard's transitions).
 */

import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { validatePoImport, commitPoImport } from '../purchase-orders/_actions/import-po';
import { validateToImport, commitToImport, type ToImportRow, type ToImportResult } from '../transfer-orders/_actions/import-to';
import { validateWoImport, commitWoImport, type WoImportRow, type WoImportResult } from '../work-orders/_actions/import-wo';
import { canImportPurchaseOrders } from './_actions/can-import-po';
import {
  EntityImportCard,
  type EntityImportCardLabels,
} from './_components/entity-import-card.client';
import type {
  EntityImportWizardLabels,
  PreviewColumn,
} from './_components/entity-import-wizard.client';
import { PoImportCard, type PoImportCardLabels } from './_components/po-import-card.client';
import { PO_IMPORT_COLUMNS } from './_lib/parse-po-csv';
import { TO_IMPORT_COLUMNS, TO_IMPORT_SPEC } from './_lib/to-spec';
import { WO_IMPORT_COLUMNS, WO_IMPORT_SPEC } from './_lib/wo-spec';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ source?: string }>;
};

function buildPoCardLabels(t: Translator): PoImportCardLabels {
  return {
    cardTitle: t('po.cardTitle'),
    cardDesc: t('po.cardDesc'),
    downloadTemplate: t('po.downloadTemplate'),
    importFile: t('po.importFile'),
    templateColumns: `${t('po.templateColumnsLabel')}: ${PO_IMPORT_COLUMNS.join(', ')}`,
    wizard: {
      stepUpload: t('wizard.steps.upload'),
      stepValidate: t('wizard.steps.validate'),
      stepPreview: t('wizard.steps.preview'),
      stepResult: t('wizard.steps.result'),
      uploadTitle: t('wizard.upload.title'),
      fileLabel: t('wizard.upload.fileLabel'),
      orgScopedNote: t('wizard.upload.orgScopedNote'),
      selectedFile: t('wizard.upload.selectedFile'),
      validateCta: t('wizard.upload.validateCta'),
      validateTitle: t('wizard.validate.title'),
      counter: t('wizard.validate.counter'),
      rowsInFile: t('wizard.validate.rowsInFile'),
      okKpi: t('wizard.validate.okKpi'),
      errorsKpi: t('wizard.validate.errorsKpi'),
      colRow: t('wizard.validate.colRow'),
      colStatus: t('wizard.validate.colStatus'),
      colColumn: t('wizard.validate.colColumn'),
      colIssue: t('wizard.validate.colIssue'),
      statusOk: t('wizard.validate.statusOk'),
      statusError: t('wizard.validate.statusError'),
      noRowErrors: t('wizard.validate.noRowErrors'),
      downloadErrorReport: t('wizard.validate.downloadErrorReport'),
      previewTitle: t('wizard.preview.title'),
      posToCreate: t('wizard.preview.posToCreate'),
      colExternalRef: t('wizard.preview.colExternalRef'),
      colSupplier: t('wizard.preview.colSupplier'),
      colLines: t('wizard.preview.colLines'),
      modeLabel: t('wizard.preview.modeLabel'),
      modeAllOrNothing: t('wizard.preview.modeAllOrNothing'),
      modeSkipInvalid: t('wizard.preview.modeSkipInvalid'),
      modeHelpAllOrNothing: t('wizard.preview.modeHelpAllOrNothing'),
      modeHelpSkipInvalid: t('wizard.preview.modeHelpSkipInvalid'),
      commitCta: t('wizard.preview.commitCta'),
      resultTitle: t('wizard.result.title'),
      createdKpi: t('wizard.result.createdKpi'),
      skippedKpi: t('wizard.result.skippedKpi'),
      failedKpi: t('wizard.result.failedKpi'),
      createdHeading: t('wizard.result.createdHeading'),
      skippedHeading: t('wizard.result.skippedHeading'),
      noCreated: t('wizard.result.noCreated'),
      viewPo: t('wizard.result.viewPo'),
      backCta: t('wizard.backCta'),
      parseFailed: t('wizard.errors.parseFailed'),
      headerMismatch: t('wizard.errors.headerMismatch'),
      forbidden: t('wizard.errors.forbidden'),
      commitFailed: t('wizard.errors.commitFailed'),
      importAnother: t('wizard.result.importAnother'),
    },
  };
}

/**
 * Resolve the generic wizard labels shared by TO + WO. Per-entity overrides
 * (the document noun for the "{n} ... to create" KPI, the created/result list
 * heading + CTA, and — for WO — the UoM-conversion column header) come from the
 * entity's own i18n sub-namespace so the generic wizard stays domain-agnostic.
 */
function buildEntityWizardLabels(
  t: Translator,
  entity: 'to' | 'wo',
  conversionLabel: string,
): EntityImportWizardLabels {
  return {
    stepUpload: t('entityWizard.steps.upload'),
    stepValidate: t('entityWizard.steps.validate'),
    stepPreview: t('entityWizard.steps.preview'),
    stepResult: t('entityWizard.steps.result'),
    uploadTitle: t('entityWizard.upload.title'),
    fileLabel: t('entityWizard.upload.fileLabel'),
    orgScopedNote: t('entityWizard.upload.orgScopedNote'),
    selectedFile: t('entityWizard.upload.selectedFile'),
    validateCta: t('entityWizard.upload.validateCta'),
    validateTitle: t('entityWizard.validate.title'),
    counter: t('entityWizard.validate.counter'),
    rowsInFile: t('entityWizard.validate.rowsInFile'),
    okKpi: t('entityWizard.validate.okKpi'),
    errorsKpi: t('entityWizard.validate.errorsKpi'),
    colRow: t('entityWizard.validate.colRow'),
    colStatus: t('entityWizard.validate.colStatus'),
    colColumn: t('entityWizard.validate.colColumn'),
    colIssue: t('entityWizard.validate.colIssue'),
    colConversion: conversionLabel,
    statusOk: t('entityWizard.validate.statusOk'),
    statusError: t('entityWizard.validate.statusError'),
    noRowErrors: t('entityWizard.validate.noRowErrors'),
    downloadErrorReport: t('entityWizard.validate.downloadErrorReport'),
    previewTitle: t('entityWizard.preview.title'),
    docsToCreate: t(`${entity}.docsToCreate`),
    colLines: t('entityWizard.preview.colLines'),
    modeLabel: t('entityWizard.preview.modeLabel'),
    modeAllOrNothing: t('entityWizard.preview.modeAllOrNothing'),
    modeSkipInvalid: t('entityWizard.preview.modeSkipInvalid'),
    modeHelpAllOrNothing: t('entityWizard.preview.modeHelpAllOrNothing'),
    modeHelpSkipInvalid: t('entityWizard.preview.modeHelpSkipInvalid'),
    commitCta: t('entityWizard.preview.commitCta'),
    resultTitle: t('entityWizard.result.title'),
    createdKpi: t('entityWizard.result.createdKpi'),
    skippedKpi: t('entityWizard.result.skippedKpi'),
    failedKpi: t('entityWizard.result.failedKpi'),
    createdHeading: t(`${entity}.createdHeading`),
    skippedHeading: t('entityWizard.result.skippedHeading'),
    noCreated: t(`${entity}.noCreated`),
    viewList: t(`${entity}.viewList`),
    backCta: t('entityWizard.backCta'),
    parseFailed: t('entityWizard.errors.parseFailed'),
    headerMismatch: t('entityWizard.errors.headerMismatch'),
    forbidden: t(`${entity}.forbidden`),
    commitFailed: t('entityWizard.errors.commitFailed'),
    importAnother: t('entityWizard.result.importAnother'),
  };
}

function buildToCardLabels(t: Translator): EntityImportCardLabels {
  return {
    cardTitle: t('to.cardTitle'),
    cardDesc: t('to.cardDesc'),
    downloadTemplate: t('to.downloadTemplate'),
    importFile: t('to.importFile'),
    templateColumns: `${t('to.templateColumnsLabel')}: ${TO_IMPORT_COLUMNS.join(', ')}`,
    wizard: buildEntityWizardLabels(t, 'to', t('entityWizard.validate.colIssue')),
  };
}

function buildWoCardLabels(t: Translator): EntityImportCardLabels {
  return {
    cardTitle: t('wo.cardTitle'),
    cardDesc: t('wo.cardDesc'),
    downloadTemplate: t('wo.downloadTemplate'),
    importFile: t('wo.importFile'),
    templateColumns: `${t('wo.templateColumnsLabel')}: ${WO_IMPORT_COLUMNS.join(', ')}`,
    wizard: buildEntityWizardLabels(t, 'wo', t('wo.colConversion')),
  };
}

function toPreviewColumns(t: Translator): PreviewColumn<ToImportRow>[] {
  return [
    { key: 'external_ref', label: t('entityWizard.preview.colExternalRef'), value: (r) => r.external_ref ?? '', mono: true },
    { key: 'from', label: t('to.colFromWarehouse'), value: (r) => r.from_warehouse_code ?? '', mono: true },
    { key: 'to', label: t('to.colToWarehouse'), value: (r) => r.to_warehouse_code ?? '', mono: true },
  ];
}

function woPreviewColumns(t: Translator): PreviewColumn<WoImportRow>[] {
  return [
    { key: 'external_ref', label: t('entityWizard.preview.colExternalRef'), value: (r) => r.external_ref ?? '', mono: true },
    { key: 'fg', label: t('wo.colFinishedGood'), value: (r) => r.fg_code ?? '', mono: true },
    { key: 'qty', label: t('wo.colQuantity'), value: (r) => `${r.qty} ${r.uom ?? ''}`.trim() },
  ];
}

export default async function PlanningImportHubPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations('Planning.import');

  // All three importers gate on the same planning-write permission, resolved
  // once server-side (fail-closed). The actions re-check on every call.
  const canImport = await canImportPurchaseOrders();
  const poLabels = buildPoCardLabels(t);
  const toLabels = buildToCardLabels(t);
  const woLabels = buildWoCardLabels(t);

  return (
    <main
      data-screen="planning-import-hub"
      data-testid="planning-import-hub"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.planning') }, { label: t('breadcrumb.import') }]}
      />

      {canImport ? (
        <div className="flex flex-col gap-4">
          <PoImportCard
            locale={locale}
            labels={poLabels}
            autoOpen={sp.source === 'po'}
            validateAction={validatePoImport}
            commitAction={commitPoImport}
          />
          <EntityImportCard<ToImportRow, ToImportResult['created'][number]>
            locale={locale}
            testid="to"
            labels={toLabels}
            spec={TO_IMPORT_SPEC}
            showConversion={false}
            previewColumns={toPreviewColumns(t)}
            createdNumber={(c) => c.to_number}
            createdHref={(c, base) => `${base}?q=${encodeURIComponent(c.to_number)}`}
            listPath="/planning/transfer-orders"
            templateFilename="to-import-template.csv"
            errorReportFilename="to-import-errors.csv"
            autoOpen={sp.source === 'to'}
            validateAction={validateToImport}
            commitAction={commitToImport}
          />
          <EntityImportCard<WoImportRow, WoImportResult['created'][number]>
            locale={locale}
            testid="wo"
            labels={woLabels}
            spec={WO_IMPORT_SPEC}
            showConversion
            previewColumns={woPreviewColumns(t)}
            createdNumber={(c) => c.wo_number}
            createdHref={(c, base) => `${base}?q=${encodeURIComponent(c.wo_number)}`}
            listPath="/planning/work-orders"
            templateFilename="wo-import-template.csv"
            errorReportFilename="wo-import-errors.csv"
            autoOpen={sp.source === 'wo'}
            validateAction={validateWoImport}
            commitAction={commitWoImport}
          />
        </div>
      ) : (
        <div
          role="note"
          data-testid="planning-import-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('denied')}
        </div>
      )}
    </main>
  );
}
