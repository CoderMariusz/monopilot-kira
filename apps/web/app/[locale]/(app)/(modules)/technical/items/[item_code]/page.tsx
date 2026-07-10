/**
 * T-034 — TEC-012 Item Detail page (RSC).
 *
 * Real Supabase-backed detail view of ONE public.items row (org-scoped via
 * getItem → withOrgContext + RLS, `app.current_org_id()`). Renders the 8-tab
 * detail shell (overview wired from the real row; the other seven deferred until
 * their owning slices land), the localized header, and RBAC-gated Edit / Deactivate
 * actions. This route unblocks every per-item deep-link (previously 404).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:354-477 (`MaterialDetailScreen`, TEC-004) — PageHeader
 * (title `code · name`, breadcrumb, sub, actions) + `tabs-bar` + per-tab panels.
 * Extended to the PRD TEC-012 8-tab contract (docs/prd/03-TECHNICAL-PRD.md:630).
 *
 * States: ready (overview + tabs), not-found (no row for code), error (load
 * failed), permission-denied (Edit/Deactivate hidden when the caller lacks
 * technical.items.{edit,deactivate}). i18n: technical.items.detail/create/
 * deactivate namespaces (en/pl/ro/uk).
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getItem } from '../_actions/get-item';
import type { ItemStatus, ItemType } from '../_actions/shared';
import { ItemDetailActions } from './_components/item-detail-actions';
import { ItemDetailTabs, type ItemDetailTabsLabels } from './_components/item-detail-tabs';
import { ItemOverviewTab, type ItemOverviewLabels } from './_components/item-overview-tab';
import { AllergensTabServer } from './_components/allergens-tab-server';
import { buildAllergensTabLabels } from './_components/allergen-labels';
import { NutritionTabServer } from './_components/nutrition-tab-server';
import { buildNutritionTabLabels } from './_components/nutrition-labels';
import {
  BomTab,
  CostTab,
  RoutingTab,
  LabTab,
  D365Tab,
  SupplierSpecsTab,
} from './_components/item-data-tabs';
import { buildDataTabLabels } from './_components/item-data-tab-labels';
import { loadBomTab, loadCostTab, loadRoutingTab, loadLabTab, loadD365Tab } from './_actions/tab-data';
import { listSupplierSpecs } from './_actions/list-supplier-specs';
import {
  SupplierSpecAdd,
  type SupplierOption,
  type SupplierSpecAddLabels,
} from './_components/supplier-spec-add.client';
import {
  createItemSupplierSpec,
  deactivateItemSupplierSpec,
  updateItemSupplierSpec,
} from '../_actions/supplier-spec-actions';
import { uploadSupplierSpecDoc } from '../_actions/upload-supplier-spec-doc';
import {
  SupplierSpecRowActions,
  type SupplierSpecRowActionsLabels,
} from './_components/supplier-spec-row-actions.client';
import { listSuppliers } from '../../../planning/suppliers/_actions/actions';
import { listActiveProductCategories } from '../../../../../../../actions/reference/product-categories/list';
import type { DeactivateLabels } from '../_components/deactivate-modal';
import { buildTransitionLabels } from '../_components/item-transition-labels';
import { buildWizardLabels } from '../_components/item-wizard-labels';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<ItemStatus, BadgeVariant> = {
  draft: 'muted',
  active: 'success',
  deprecated: 'warning',
  blocked: 'danger',
};

// English fallbacks for the type/status labels — the localized maps come from the
// wizard label bundle (create.typeLabels.* / create.statusLabels.*), see below.
const TYPE_LABEL: Record<ItemType, string> = {
  rm: 'Raw material',
  ingredient: 'Ingredient',
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
  packaging: 'Packaging',
};

type PageProps = {
  params: Promise<{ locale: string; item_code: string }>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: {
    query<T = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: T[]; rowCount?: number | null }>;
  };
};

/**
 * Resolves whether the caller may create BOMs (`technical.bom.create`), so the FG
 * item-detail BOM tab only shows the "+ New BOM" CTA when the action would
 * actually succeed. Server-side only — never trusted from the client.
 */
async function resolveCanCreateBom(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp
             on rp.role_id = r.id and rp.permission = 'technical.bom.create'
          where ur.user_id = $1::uuid and ur.org_id = $2::uuid
            and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? 'technical.bom.create')
          limit 1`,
        [ctx.userId, ctx.orgId],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

export default async function TechnicalItemDetailPage({ params }: PageProps) {
  const { locale, item_code: rawCode } = await params;
  const itemCode = decodeURIComponent(rawCode);

  const t = await getTranslations('technical.items');
  const tItems = await getTranslations('items');
  const result = await getItem(itemCode);

  // ── not-found / error states ────────────────────────────────────────────────
  if (result.state === 'not_found' || result.state === 'error') {
    const isError = result.state === 'error';
    return (
      <main data-screen="technical-item-detail" className="flex w-full flex-col gap-4 px-6 py-6">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href="../items">{t('detail.breadcrumb')}</Link> / <span className="font-mono">{itemCode}</span>
        </nav>
        <div role="alert" className={isError ? 'alert alert-red' : 'card'}>
          {isError ? (
            <div className="alert-title">{t('detail.error')}</div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-title">{t('detail.notFound')}</div>
              <div className="empty-state-body">{t('detail.notFoundBody', { code: itemCode })}</div>
              <div className="empty-state-action">
                <Link href="../items" className="btn btn-secondary">
                  {t('detail.back')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  const { item, canEdit, canDeactivate } = result;

  // ── localized label bundles for the client islands ──────────────────────────
  const tabsLabels: ItemDetailTabsLabels = {
    tablistLabel: t('detail.tablistLabel'),
    tabs: {
      overview: t('detail.tabs.overview'),
      bom: t('detail.tabs.bom'),
      allergens: t('detail.tabs.allergens'),
      nutrition: t('detail.tabs.nutrition'),
      cost: t('detail.tabs.cost'),
      routing: t('detail.tabs.routing'),
      supplierSpecs: t('detail.tabs.supplierSpecs'),
      labResults: t('detail.tabs.labResults'),
      d365: t('detail.tabs.d365'),
    },
    deferred: t('detail.deferred'),
    deferredBody: t('detail.deferredBody'),
  };

  // UOM pack-hierarchy overview keys are staged in _meta/i18n-staging/item-uom.json
  // until merged into the live catalog; guard so a missing key falls back to the
  // English default instead of leaking the raw key path.
  const ovHas = (key: string) => {
    try {
      return t.has(key);
    } catch {
      return false;
    }
  };

  const overviewLabels: ItemOverviewLabels = {
    identification: t('detail.overview.identification'),
    commercial: t('detail.overview.commercial'),
    code: t('detail.overview.code'),
    name: t('detail.overview.name'),
    type: t('detail.overview.type'),
    status: t('detail.overview.status'),
    uomBase: t('detail.overview.uomBase'),
    uomSecondary: t('detail.overview.uomSecondary'),
    productGroup: t('detail.overview.productGroup'),
    description: t('detail.overview.description'),
    weightMode: t('detail.overview.weightMode'),
    nominalWeight: t('detail.overview.nominalWeight'),
    tareWeight: t('detail.overview.tareWeight'),
    grossWeightMax: t('detail.overview.grossWeightMax'),
    gs1Gtin: t('detail.overview.gs1Gtin'),
    varianceTolerance: t('detail.overview.varianceTolerance'),
    shelfLife: t('detail.overview.shelfLife'),
    costPerKg: ovHas('detail.overview.costPerKg') ? t('detail.overview.costPerKg') : 'Standard cost',
    supplierPrice: ovHas('detail.overview.supplierPrice') ? t('detail.overview.supplierPrice') : 'Supplier price (buy)',
    effectiveCost: ovHas('detail.overview.effectiveCost') ? t('detail.overview.effectiveCost') : 'Effective cost (source)',
    effectiveCostSourceLabels: {
      cost_history: ovHas('detail.overview.effectiveCostSource.cost_history') ? t('detail.overview.effectiveCostSource.cost_history') : 'Cost history',
      supplier_spec: ovHas('detail.overview.effectiveCostSource.supplier_spec') ? t('detail.overview.effectiveCostSource.supplier_spec') : 'Supplier spec',
      list_price: ovHas('detail.overview.effectiveCostSource.list_price') ? t('detail.overview.effectiveCostSource.list_price') : 'List price',
      none: ovHas('detail.overview.effectiveCostSource.none') ? t('detail.overview.effectiveCostSource.none') : 'None',
    },
    listPrice: ovHas('detail.overview.listPrice') ? t('detail.overview.listPrice') : 'Sell price (list)',
    updated: t('detail.overview.updated'),
    none: t('detail.overview.none'),
    outputUom: ovHas('detail.overview.outputUom') ? t('detail.overview.outputUom') : 'Output unit',
    netQtyPerEach: ovHas('detail.overview.netQtyPerEach') ? t('detail.overview.netQtyPerEach') : 'Net content per each',
    eachPerBox: ovHas('detail.overview.eachPerBox') ? t('detail.overview.eachPerBox') : 'Each per box',
    boxesPerPallet: ovHas('detail.overview.boxesPerPallet') ? t('detail.overview.boxesPerPallet') : 'Boxes per pallet',
    packHierarchy: ovHas('detail.overview.packHierarchy') ? t('detail.overview.packHierarchy') : 'Pack hierarchy',
    outputUomLabels: {
      base: ovHas('detail.overview.outputUomLabels.base') ? t('detail.overview.outputUomLabels.base') : 'Base unit',
      each: ovHas('detail.overview.outputUomLabels.each') ? t('detail.overview.outputUomLabels.each') : 'Each (piece)',
      box: ovHas('detail.overview.outputUomLabels.box') ? t('detail.overview.outputUomLabels.box') : 'Box',
    },
  };

  const wizardLabels = buildWizardLabels(t);
  wizardLabels.fields.listPriceGbp = tItems('list_price_gbp_label');
  const transitionLabels = buildTransitionLabels(t);

  // Localized type/status value labels for the Overview Identification card —
  // reuse the wizard bundle (create.typeLabels.* / create.statusLabels.*).
  overviewLabels.typeLabels = wizardLabels.typeLabels;
  overviewLabels.statusLabels = wizardLabels.statusLabels;

  const deactivateLabels: DeactivateLabels = {
    title: t('deactivate.title'),
    // {code}/{name} placeholders interpolated client-side — t.raw avoids next-intl FORMATTING_ERROR.
    subtitle: t.raw('deactivate.subtitle'),
    warning: t.raw('deactivate.warning'),
    reason: t('deactivate.reason'),
    reasonRequired: t('deactivate.reasonRequired'),
    reasons: {
      discontinued: t('deactivate.reasons.discontinued'),
      recipe_change: t('deactivate.reasons.recipe_change'),
      d365_mismatch: t('deactivate.reasons.d365_mismatch'),
      other: t('deactivate.reasons.other'),
    },
    notes: t('deactivate.notes'),
    notesRequired: t('deactivate.notesRequired'),
    confirmLabel: t.raw('deactivate.confirmLabel'),
    confirmMismatch: t('deactivate.confirmMismatch'),
    cancel: t('deactivate.cancel'),
    confirm: t('deactivate.confirm'),
    deactivating: t('deactivate.deactivating'),
    actionErrors: {
      already_exists: t('errors.already_exists'),
      forbidden: t('errors.forbidden'),
      invalid_input: t('errors.invalid_input'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
      invalid_category: t.has('errors.invalid_category') ? t('errors.invalid_category') : 'Choose an active product category or leave blank.',
      item_type_immutable: t.has('errors.item_type_immutable')
        ? t('errors.item_type_immutable')
        : 'Item type cannot change once the item is active or referenced by BOMs, factory specs, or work orders.',
    },
  };

  // ── deferred-tab data: real Supabase reads under withOrgContext + RLS ────────
  const [
    dataTabLabels,
    allergensTabLabels,
    nutritionTabLabels,
    bomData,
    costData,
    routingData,
    labData,
    d365Data,
    supplierSpecsData,
    canCreateBom,
    suppliersResult,
    categoriesResult,
  ] = await Promise.all([
    buildDataTabLabels(locale),
    buildAllergensTabLabels(locale),
    buildNutritionTabLabels(locale),
    loadBomTab(item.itemCode),
    loadCostTab(item.itemCode),
    loadRoutingTab(item.itemCode),
    loadLabTab(item.itemCode),
    loadD365Tab(item.itemCode),
    listSupplierSpecs(item.itemCode),
    resolveCanCreateBom(),
    // Read-only reuse of the planning suppliers master for the "+ Add supplier"
    // Select. The action re-validates RBAC server-side before any write.
    listSuppliers({ limit: 200 }),
    canEdit ? listActiveProductCategories() : Promise.resolve({ ok: false as const, error: 'persistence_failed' as const }),
  ]);

  // ── "+ Add supplier" modal: lets an item NOT born in NPD attach/approve a
  // supplier_spec. Writing an approved+active row clears the BOM readiness gates
  // SUPPLIER_NOT_APPROVED / SUPPLIER_SPEC_NOT_ACTIVE for this item.
  const supplierOptions: SupplierOption[] = suppliersResult.ok
    ? suppliersResult.data.map((s) => ({ id: s.id, code: s.code, name: s.name, currency: s.currency }))
    : [];
  const categoryOptions =
    categoriesResult.ok === true
      ? categoriesResult.data.map((c) => ({ value: c.code, label: c.label }))
      : [];

  const a = (key: string, fallback: string, namespace = 'add'): string => {
    const dotted = `detail.dataTabs.supplier.${namespace}.${key}`;
    try {
      return t.has(dotted) ? t(dotted) : fallback;
    } catch {
      return fallback;
    }
  };
  const supplierAddLabels: SupplierSpecAddLabels = {
    cta: a('cta', '+ Add supplier'),
    title: a('title', 'Add supplier specification'),
    subtitle: a('subtitle', 'Attach an approved supplier spec so this item clears the BOM supplier-readiness gates.'),
    supplier: a('supplier', 'Supplier'),
    supplierPlaceholder: a('supplierPlaceholder', 'Select a supplier'),
    specVersion: a('specVersion', 'Spec version'),
    issuedDate: a('issuedDate', 'Issued date'),
    effectiveFrom: a('effectiveFrom', 'Effective from'),
    expiryDate: a('expiryDate', 'Expiry date'),
    approveNow: a('approveNow', 'Approve now (activates the spec and clears the readiness warnings)'),
    unitPrice: a('unitPrice', 'Unit price'),
    unitPricePlaceholder: a('unitPricePlaceholder', '0.00'),
    priceCurrency: a('priceCurrency', 'Currency'),
    priceCurrencyPlaceholder: a('priceCurrencyPlaceholder', 'e.g. GBP'),
    document: a('document', 'Spec document'),
    documentHint: a('documentHint', 'Optional. PDF or image, attached after the spec is created.'),
    uploading: a('uploading', 'Uploading document…'),
    uploadFailed: a('uploadFailed', 'The spec was saved, but the document upload failed. Try attaching it again from Edit.'),
    submit: a('submit', 'Add supplier'),
    submitting: a('submitting', 'Adding…'),
    cancel: a('cancel', 'Cancel'),
    success: a('success', 'Supplier specification added. BOM readiness warnings for this item are now cleared.'),
    successUpdated: a('successUpdated', 'Supplier specification refreshed for this item.'),
    noSuppliers: a('noSuppliers', 'No suppliers found. Create a supplier in Planning first.'),
    forbidden: a('forbidden', 'You do not have permission to add a supplier to this item.'),
    errors: {
      invalid_input: a('errors.invalid_input', 'Please check the supplier and dates and try again.'),
      forbidden: a('forbidden', 'You do not have permission to add a supplier to this item.'),
      item_not_found: a('errors.item_not_found', 'This item no longer exists.'),
      supplier_not_found: a('errors.supplier_not_found', 'The selected supplier could not be found.'),
      already_exists: a('errors.already_exists', 'An approved supplier spec already exists for this supplier and item.'),
      persistence_failed: a('errors.persistence_failed', 'Could not save the supplier specification. Please try again.'),
      load_failed: a('errors.load_failed', 'Could not load suppliers. Please try again.'),
    },
  };

  const supplierRowActionsLabels: SupplierSpecRowActionsLabels = {
    edit: a('edit', 'Edit', 'rowActions'),
    deactivate: a('deactivate', 'Deactivate', 'rowActions'),
    editTitle: a('editTitle', 'Edit supplier specification', 'rowActions'),
    editSubtitle: a('editSubtitle', 'Update supplier spec dates, version, and approval state.', 'rowActions'),
    specVersion: a('specVersion', 'Spec version', 'rowActions'),
    issuedDate: a('issuedDate', 'Issued date', 'rowActions'),
    effectiveFrom: a('effectiveFrom', 'Effective from', 'rowActions'),
    expiryDate: a('expiryDate', 'Expiry date', 'rowActions'),
    approveNow: a('approveNow', 'Approve now (sets active and approved)', 'rowActions'),
    unitPrice: a('unitPrice', 'Unit price', 'rowActions'),
    unitPricePlaceholder: a('unitPricePlaceholder', '0.00', 'rowActions'),
    priceCurrency: a('priceCurrency', 'Currency', 'rowActions'),
    priceCurrencyPlaceholder: a('priceCurrencyPlaceholder', 'e.g. GBP', 'rowActions'),
    document: a('document', 'Spec document', 'rowActions'),
    documentHint: a('documentHint', 'Optional. PDF or image — replaces the current document.', 'rowActions'),
    documentCurrent: a('documentCurrent', 'Current document:', 'rowActions'),
    documentView: a('documentView', 'View', 'rowActions'),
    uploading: a('uploading', 'Uploading document…', 'rowActions'),
    uploadFailed: a('uploadFailed', 'Changes saved, but the document upload failed. Try attaching it again.', 'rowActions'),
    submit: a('submit', 'Save changes', 'rowActions'),
    submitting: a('submitting', 'Saving…', 'rowActions'),
    cancel: a('cancel', 'Cancel', 'rowActions'),
    success: a('success', 'Supplier specification updated.', 'rowActions'),
    deactivateTitle: a('deactivateTitle', 'Deactivate supplier specification', 'rowActions'),
    deactivateBody: a('deactivateBody', 'This will supersede the supplier specification for this item.', 'rowActions'),
    deactivateWarnActive: a(
      'deactivateWarnActive',
      'This spec is currently active and approved. Deactivating it may reintroduce supplier-readiness warnings.',
      'rowActions',
    ),
    deactivateConfirm: a('deactivateConfirm', 'Deactivate', 'rowActions'),
    deactivateCancel: a('deactivateCancel', 'Cancel', 'rowActions'),
    deactivateSuccess: a('deactivateSuccess', 'Supplier specification deactivated.', 'rowActions'),
    errors: {
      invalid_input: a('errors.invalid_input', 'Please check the supplier and dates and try again.'),
      forbidden: a('forbidden', 'You do not have permission to add a supplier to this item.'),
      item_not_found: a('errors.item_not_found', 'This item no longer exists.'),
      supplier_not_found: a('errors.supplier_not_found', 'The selected supplier could not be found.'),
      already_exists: a('errors.already_exists', 'An approved supplier spec already exists for this supplier and item.'),
      persistence_failed: a('errors.persistence_failed', 'Could not save the supplier specification. Please try again.'),
    },
  };

  const supplierAddAction = (
    <SupplierSpecAdd
      itemCode={item.itemCode}
      canEdit={canEdit}
      suppliers={supplierOptions}
      labels={supplierAddLabels}
      addSupplierSpec={createItemSupplierSpec}
      uploadSupplierSpecDoc={uploadSupplierSpecDoc}
    />
  );

  // Item-detail BOM tab "+ New BOM" CTA: only a finished good gets a BOM, and only
  // when the caller may create. Routes to the BOM list with this FG preselected
  // (`?new=<code>`) so the FG picker opens with it chosen — avoids the per-FG
  // detail route 404 that occurs when no BOM header exists yet.
  const isFinishedGood = item.itemType === 'fg';
  // Absolute locale-less href (middleware redirects to the locale) — relative `../bom`
  // resolved differently depending on the rendering context and produced stray
  // /<locale>/bom prefetch 404s.
  const createBomHref = `/technical/bom?new=${encodeURIComponent(item.itemCode)}`;
  const bomCreateCtaKey = 'detail.dataTabs.bom.createCta';
  const bomCreateCtaResolved = t(bomCreateCtaKey);
  const bomCreateCta =
    bomCreateCtaResolved === bomCreateCtaKey || bomCreateCtaResolved.endsWith('.createCta')
      ? '+ New BOM'
      : bomCreateCtaResolved;

  // Per-row "Open BOM →" deep-link label (keys staged in bom-row-actions.json).
  // Resolve with the same has-guard fallback so a missing bundle key never throws.
  const openBomKey = 'detail.dataTabs.bom.openBom';
  const openBomResolved = t(openBomKey);
  const openBomLabel =
    openBomResolved === openBomKey || openBomResolved.endsWith('.openBom')
      ? 'Open BOM →'
      : openBomResolved;

  return (
    <main data-screen="technical-item-detail" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="../items">{t('detail.breadcrumb')}</Link> /{' '}
        <span className="font-mono">{item.itemCode}</span>
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <span className="mono text-shell-muted">{item.itemCode}</span>
            <span className="text-slate-400">·</span>
            <span>{item.name}</span>
            <Badge variant={STATUS_VARIANT[item.status]}>
              {wizardLabels.statusLabels[item.status] ?? item.status}
            </Badge>
          </h1>
          <p className="helper mt-1 max-w-3xl">
            {t('detail.subtitle', { type: wizardLabels.typeLabels[item.itemType] ?? TYPE_LABEL[item.itemType] })}
          </p>
        </div>
        <ItemDetailActions
          item={item}
          canEdit={canEdit}
          canDeactivate={canDeactivate}
          editLabel={t('detail.edit')}
          deactivateLabel={t('detail.deactivate')}
          wizardLabels={wizardLabels}
          deactivateLabels={deactivateLabels}
          transitionLabels={transitionLabels}
          categoryOptions={categoryOptions}
        />
      </header>

      <ItemDetailTabs
        itemCode={item.itemCode}
        labels={tabsLabels}
        panels={{
          overview: <ItemOverviewTab item={item} labels={overviewLabels} />,
          allergens: <AllergensTabServer itemCode={item.itemCode} labels={allergensTabLabels} />,
          nutrition: (
            <NutritionTabServer
              itemCode={item.itemCode}
              itemType={item.itemType}
              canEdit={canEdit}
              labels={nutritionTabLabels}
            />
          ),
          bom: (
            <BomTab
              data={bomData}
              labels={{ ...dataTabLabels.bom, createCta: bomCreateCta, openBom: openBomLabel }}
              isFinishedGood={isFinishedGood}
              canCreateBom={canCreateBom}
              createBomHref={createBomHref}
              itemCode={item.itemCode}
            />
          ),
          cost: <CostTab data={costData} labels={dataTabLabels.cost} />,
          routing: <RoutingTab data={routingData} labels={dataTabLabels.routing} />,
          labResults: <LabTab data={labData} labels={dataTabLabels.lab} />,
          d365: <D365Tab data={d365Data} labels={dataTabLabels.d365} />,
          supplierSpecs: (
            <SupplierSpecsTab
              data={supplierSpecsData}
              labels={dataTabLabels.supplier}
              addAction={supplierAddAction}
              rowActions={
                canEdit
                  ? (spec) => (
                      <SupplierSpecRowActions
                        spec={spec}
                        labels={supplierRowActionsLabels}
                        updateSpec={updateItemSupplierSpec}
                        deactivateSpec={deactivateItemSupplierSpec}
                        uploadSupplierSpecDoc={uploadSupplierSpecDoc}
                      />
                    )
                  : undefined
              }
            />
          ),
        }}
      />
    </main>
  );
}
