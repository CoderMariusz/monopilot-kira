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
import { canImportPurchaseOrders, canImportTransferOrders, canImportWorkOrders } from './_actions/can-import-po';
import { EntityImportCard } from './_components/entity-import-card.client';
import { PoImportCard, type PoImportCardLabels } from './_components/po-import-card.client';
import { buildToImportCardProps, buildWoImportCardProps } from './_lib/import-hub-card-props';
import { PO_IMPORT_COLUMNS } from './_lib/parse-po-csv';

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

export default async function PlanningImportHubPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations('Planning.import');

  // All three importers gate on the same planning-write permission, resolved
  // once server-side (fail-closed). The actions re-check on every call.
  const [canImportPo, canImportTo, canImportWo] = await Promise.all([
    canImportPurchaseOrders(),
    canImportTransferOrders(),
    canImportWorkOrders(),
  ]);
  const canImportAny = canImportPo || canImportTo || canImportWo;
  const poLabels = buildPoCardLabels(t);
  const toCardProps = buildToImportCardProps(t, locale, sp.source === 'to');
  const woCardProps = buildWoImportCardProps(t, locale, sp.source === 'wo');

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

      {canImportAny ? (
        <div className="flex flex-col gap-4">
          {canImportPo ? (
            <PoImportCard
              locale={locale}
              labels={poLabels}
              autoOpen={sp.source === 'po'}
              validateAction={validatePoImport}
              commitAction={commitPoImport}
            />
          ) : null}
          {canImportTo ? (
            <EntityImportCard<ToImportRow, ToImportResult['created'][number]>
              {...toCardProps}
              validateAction={validateToImport}
              commitAction={commitToImport}
            />
          ) : null}
          {canImportWo ? (
            <EntityImportCard<WoImportRow, WoImportResult['created'][number]>
              {...woCardProps}
              validateAction={validateWoImport}
              commitAction={commitWoImport}
            />
          ) : null}
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
