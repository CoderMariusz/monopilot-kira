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
import type { DeactivateLabels } from '../_components/deactivate-modal';
import type { ItemWizardLabels } from '../_components/item-create-wizard';

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<ItemStatus, BadgeVariant> = {
  draft: 'muted',
  active: 'success',
  deprecated: 'warning',
  blocked: 'danger',
};

const TYPE_LABEL: Record<ItemType, string> = {
  rm: 'Raw material',
  ingredient: 'Ingredient',
  intermediate: 'Intermediate',
  fg: 'Finished good',
  co_product: 'Co-product',
  byproduct: 'By-product',
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
      cost: t('detail.tabs.cost'),
      routing: t('detail.tabs.routing'),
      supplierSpecs: t('detail.tabs.supplierSpecs'),
      labResults: t('detail.tabs.labResults'),
      d365: t('detail.tabs.d365'),
    },
    deferred: t('detail.deferred'),
    deferredBody: t('detail.deferredBody'),
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
    grossWeightMax: t('detail.overview.grossWeightMax'),
    varianceTolerance: t('detail.overview.varianceTolerance'),
    shelfLife: t('detail.overview.shelfLife'),
    costPerKg: t('detail.overview.costPerKg'),
    updated: t('detail.overview.updated'),
    none: t('detail.overview.none'),
  };

  const wizardLabels: ItemWizardLabels = {
    title: t('create.title'),
    subtitle: t('create.subtitle'),
    cancel: t('create.cancel'),
    back: t('create.back'),
    next: t('create.next'),
    create: t('create.create'),
    creating: t('create.creating'),
    steps: {
      basic: t('create.steps.basic'),
      classification: t('create.steps.classification'),
      weight: t('create.steps.weight'),
      review: t('create.steps.review'),
    },
    fields: {
      itemCode: t('create.fields.itemCode'),
      itemCodeHelp: t('create.fields.itemCodeHelp'),
      name: t('create.fields.name'),
      description: t('create.fields.description'),
      itemType: t('create.fields.itemType'),
      status: t('create.fields.status'),
      uomBase: t('create.fields.uomBase'),
      uomSecondary: t('create.fields.uomSecondary'),
      productGroup: t('create.fields.productGroup'),
      weightMode: t('create.fields.weightMode'),
      nominalWeight: t('create.fields.nominalWeight'),
      grossWeightMax: t('create.fields.grossWeightMax'),
      varianceTolerance: t('create.fields.varianceTolerance'),
      shelfLifeDays: t('create.fields.shelfLifeDays'),
      shelfLifeMode: t('create.fields.shelfLifeMode'),
    },
    catchHint: t('create.catchHint'),
    review: { ready: t('create.review.ready') },
    errors: {
      codeRequired: t('create.errors.codeRequired'),
      nameRequired: t('create.errors.nameRequired'),
      uomRequired: t('create.errors.uomRequired'),
    },
    actionErrors: {
      already_exists: t('errors.already_exists'),
      forbidden: t('errors.forbidden'),
      invalid_input: t('errors.invalid_input'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };

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
    },
  };

  // ── deferred-tab data: real Supabase reads under withOrgContext + RLS ────────
  const [
    dataTabLabels,
    allergensTabLabels,
    bomData,
    costData,
    routingData,
    labData,
    d365Data,
    supplierSpecsData,
    canCreateBom,
  ] = await Promise.all([
    buildDataTabLabels(locale),
    buildAllergensTabLabels(locale),
    loadBomTab(item.itemCode),
    loadCostTab(item.itemCode),
    loadRoutingTab(item.itemCode),
    loadLabTab(item.itemCode),
    loadD365Tab(item.itemCode),
    listSupplierSpecs(item.itemCode),
    resolveCanCreateBom(),
  ]);

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
            <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
          </h1>
          <p className="helper mt-1 max-w-3xl">
            {t('detail.subtitle', { type: TYPE_LABEL[item.itemType] })}
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
        />
      </header>

      <ItemDetailTabs
        itemCode={item.itemCode}
        labels={tabsLabels}
        panels={{
          overview: <ItemOverviewTab item={item} labels={overviewLabels} />,
          allergens: <AllergensTabServer itemCode={item.itemCode} labels={allergensTabLabels} />,
          bom: (
            <BomTab
              data={bomData}
              labels={{ ...dataTabLabels.bom, createCta: bomCreateCta }}
              isFinishedGood={isFinishedGood}
              canCreateBom={canCreateBom}
              createBomHref={createBomHref}
            />
          ),
          cost: <CostTab data={costData} labels={dataTabLabels.cost} />,
          routing: <RoutingTab data={routingData} labels={dataTabLabels.routing} />,
          labResults: <LabTab data={labData} labels={dataTabLabels.lab} />,
          d365: <D365Tab data={d365Data} labels={dataTabLabels.d365} />,
          supplierSpecs: <SupplierSpecsTab data={supplierSpecsData} labels={dataTabLabels.supplier} />,
        }}
      />
    </main>
  );
}
