/**
 * 03-technical · TEC-014 Bulk Import CSV (T-085, spec-driven) page.
 *
 * Spec-driven Wave0 surface — PRD §6.5 + prototypes/design/03-TECHNICAL-UX.md are
 * canonical; layout-primitive prototype anchor
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:25-218
 *   (`bulk_import_csv_screen`). Does NOT claim 1:1 visual parity.
 *
 * Real Supabase-backed: the wizard consumes the org-scoped items API
 * (previewItemsImport / commitItemsImport → createItem / updateItem) under
 * withOrgContext + RLS. Permission-denied is rendered when the caller lacks
 * technical.items.create.
 */

import { getTranslations } from 'next-intl/server';

import { listItems } from '../_actions/list-items';
import { previewItemsImport } from './_actions/preview-import';
import { commitItemsImport } from './_actions/commit-import';
import { BulkImportWizard, type BulkImportLabels } from './_components/bulk-import-wizard.client';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function buildLabels(t: Translator): BulkImportLabels {
  return {
    stepUpload: t('steps.upload'),
    stepValidate: t('steps.validate'),
    stepDiff: t('steps.diff'),
    stepConfirm: t('steps.confirm'),
    scopeLabel: t('scope.label'),
    scopeFg: t('scope.fg'),
    scopeWip: t('scope.wip'),
    scopeRm: t('scope.rm'),
    scopeRmSupplier: t('scope.rmSupplier'),
    fileLabel: t('file.label'),
    filePlaceholder: t('file.placeholder'),
    orgScopedNote: t('orgScopedNote'),
    validateCta: t('cta.validate'),
    diffCta: t('cta.diff'),
    confirmCta: t('cta.confirm'),
    applyCta: t('cta.apply'),
    backCta: t('cta.back'),
    cancelCta: t('cta.cancel'),
    rowsInFile: t('kpi.rowsInFile'),
    errorsKpi: t('kpi.errors'),
    warningsKpi: t('kpi.warnings'),
    createKpi: t('kpi.create'),
    updateKpi: t('kpi.update'),
    noopKpi: t('kpi.noop'),
    colRow: t('col.row'),
    colSeverity: t('col.severity'),
    colColumn: t('col.column'),
    colIssue: t('col.issue'),
    colCode: t('col.code'),
    colOp: t('col.op'),
    colField: t('col.field'),
    colChange: t('col.change'),
    noIssues: t('noIssues'),
    reasonLabel: t('reason.label'),
    reasonPlaceholder: t('reason.placeholder'),
    reasonHelp: t('reason.help'),
    applied: t('applied'),
    forbidden: t('forbidden'),
    parseFailed: t('parseFailed'),
    supplierBlocker: t('supplierBlocker'),
  };
}

export default async function TechnicalItemsImportPage() {
  // Reuse the items list loader purely to resolve the create permission gate
  // (org-scoped under RLS) — the import surface itself never trusts the client.
  const { canCreate } = await listItems();
  const t = await getTranslations('technical.bulkImport');
  const labels = buildLabels(t);

  return (
    <main data-screen="technical-items-import-page" className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{t('breadcrumb')}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {canCreate ? (
        <BulkImportWizard labels={labels} previewAction={previewItemsImport} commitAction={commitItemsImport} />
      ) : (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          {t('permissionDenied')}
        </div>
      )}
    </main>
  );
}
