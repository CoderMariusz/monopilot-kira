/**
 * WAVE W11 — DIRECT stock-adjustment route (/warehouse/adjustments/new).
 *
 * Spec-driven; nearest reusable prototype = the warehouse M-03 stock-move modal
 * (prototypes/design/Monopilot Design System/warehouse/modals.jsx:396-499:
 * LP/item identity, an "adjustment" move type, qty, a reason-code dropdown,
 * reason text on "other", and a delta-pct approval gate). The form realises the
 * prototype's approval gate as the backend's BLOCKER-3 second-person SUPERVISOR
 * countersignature for decreases.
 *
 * Page GATE: getDirectAdjustFormContext (additive read, RBAC enforced
 * server-side) confirms the caller holds warehouse.stock.adjust — the same
 * elevated grant applyDirectAdjustment requires. On `forbidden` the page renders
 * an access-denied panel (never trusts a client flag); on `error` a failed-load
 * banner. The form's locations come from the org-scoped listLocations read.
 *
 * Mutation: applyDirectAdjustment (warehouse/_actions/direct-adjust-actions.ts,
 * backend lane — imported, never authored). It already returns a discriminated
 * result (never throws on a domain failure), so the page passes it straight to
 * the island; the island maps each error.code to PL/EN copy. searchItems /
 * searchEligibleSupervisors / listDecreaseLps power the item picker, the
 * supervisor combobox, and the decrease specific-LP picker.
 *
 * UI states: loading (Suspense skeleton), empty (no-locations panel inside the
 * island), error (failed read → banner), permission-denied (forbidden → denied
 * panel), optimistic (submit disabled + pending label, success banner with the
 * affected LP).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { applyDirectAdjustment } from '../../_actions/direct-adjust-actions';
import { listLocations } from '../../_actions/location-read-actions';
import {
  getDirectAdjustFormContext,
  listDecreaseLps,
  searchAdjustItems,
  searchEligibleSupervisors,
} from '../_actions/adjust-form-actions';
import { getAdjustmentsTranslator } from '../adjustments-labels';
import {
  DirectAdjustForm,
  type DirectAdjustFormLabels,
} from '../_components/direct-adjust-form.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

function buildLabels(t: ReturnType<typeof getAdjustmentsTranslator>): DirectAdjustFormLabels {
  return {
    intro: t('form.intro'),
    warnUseCount: t('form.warnUseCount'),
    location: t('form.locationLabel'),
    locationHelp: t('form.locationHelp'),
    locationPlaceholder: t('form.locationPlaceholder'),
    locationsEmpty: t('form.locationsEmpty'),
    warehouseResolved: t('form.warehouseResolved'),
    item: t('form.itemLabel'),
    itemHelp: t('form.itemHelp'),
    itemTrigger: t('form.itemTrigger'),
    itemSelected: t('form.itemSelected'),
    itemChange: t('form.itemChange'),
    itemSearchLabel: t('form.itemSearchLabel'),
    itemSearchPlaceholder: t('form.itemSearchPlaceholder'),
    itemSearchLoading: t('form.itemSearchLoading'),
    itemSearchEmpty: t('form.itemSearchEmpty'),
    itemSearchError: t('form.itemSearchError'),
    direction: t('form.directionLabel'),
    directionIncrease: t('form.directionIncrease'),
    directionDecrease: t('form.directionDecrease'),
    directionIncreaseHelp: t('form.directionIncreaseHelp'),
    directionDecreaseHelp: t('form.directionDecreaseHelp'),
    quantity: t('form.quantityLabel'),
    quantityPlaceholder: t('form.quantityPlaceholder'),
    uom: t('form.uomLabel'),
    uomPlaceholder: t('form.uomPlaceholder'),
    reason: t('form.reasonLabel'),
    reasonPlaceholder: t('form.reasonPlaceholder'),
    reasonCodes: {
      found_stock: t('form.reason.found_stock'),
      spillage_damage: t('form.reason.spillage_damage'),
      expiry_write_off: t('form.reason.expiry_write_off'),
      data_entry_error: t('form.reason.data_entry_error'),
      system_sync: t('form.reason.system_sync'),
      other: t('form.reason.other'),
    },
    reasonText: t('form.reasonTextLabel'),
    reasonTextHelp: t('form.reasonTextHelp'),
    reasonTextPlaceholder: t('form.reasonTextPlaceholder'),
    batch: t('form.batchLabel'),
    batchHelp: t('form.batchHelp'),
    batchPlaceholder: t('form.batchPlaceholder'),
    expiry: t('form.expiryLabel'),
    expiryHelp: t('form.expiryHelp'),
    lp: t('form.lpLabel'),
    lpHelp: t('form.lpHelp'),
    lpPlaceholder: t('form.lpPlaceholder'),
    lpAuto: t('form.lpAuto'),
    lpLoading: t('form.lpLoading'),
    lpEmpty: t('form.lpEmpty'),
    lpError: t('form.lpError'),
    submit: t('form.submit'),
    submitting: t('form.submitting'),
    validation: {
      locationRequired: t('form.validation.locationRequired'),
      itemRequired: t('form.validation.itemRequired'),
      quantityRequired: t('form.validation.quantityRequired'),
      uomRequired: t('form.validation.uomRequired'),
      reasonRequired: t('form.validation.reasonRequired'),
      reasonTextRequired: t('form.validation.reasonTextRequired'),
      passwordRequired: t('form.validation.passwordRequired'),
      supervisorRequired: t('form.validation.supervisorRequired'),
      supervisorPinRequired: t('form.validation.supervisorPinRequired'),
    },
    esign: {
      block: t('esign.block'),
      meaning: t('esign.meaning'),
      password: t('esign.password'),
      passwordPlaceholder: t('esign.passwordPlaceholder'),
      passwordHelp: t('esign.passwordHelp'),
    },
    supervisor: {
      block: t('supervisor.block'),
      meaning: t('supervisor.meaning'),
      selectLabel: t('supervisor.selectLabel'),
      selectHelp: t('supervisor.selectHelp'),
      selectTrigger: t('supervisor.selectTrigger'),
      searchLabel: t('supervisor.searchLabel'),
      searchPlaceholder: t('supervisor.searchPlaceholder'),
      searchLoading: t('supervisor.searchLoading'),
      searchEmpty: t('supervisor.searchEmpty'),
      searchError: t('supervisor.searchError'),
      selected: t('supervisor.selected'),
      change: t('supervisor.change'),
      pinLabel: t('supervisor.pinLabel'),
      pinPlaceholder: t('supervisor.pinPlaceholder'),
      pinHelp: t('supervisor.pinHelp'),
    },
    result: {
      successIncrease: t('result.successIncrease'),
      successDecrease: t('result.successDecrease'),
      affectedLp: t('result.affectedLp'),
      viewLp: t('result.viewLp'),
      another: t('result.another'),
    },
    errors: {
      forbidden: t('errors.forbidden'),
      supervisor_self_approval: t('errors.supervisor_self_approval'),
      supervisor_pin_required: t('errors.supervisor_pin_required'),
      supervisor_pin_invalid: t('errors.supervisor_pin_invalid'),
      supervisor_pin_not_enrolled: t('errors.supervisor_pin_not_enrolled'),
      supervisor_pin_locked: t('errors.supervisor_pin_locked'),
      supervisor_forbidden: t('errors.supervisor_forbidden'),
      insufficient_unreserved: t('errors.insufficient_unreserved'),
      insufficient_stock: t('errors.insufficient_stock'),
      use_count_session: t('errors.use_count_session'),
      invalid_quantity: t('errors.invalid_quantity'),
      invalid_expiry_date: t('errors.invalid_expiry_date'),
      invalid_input: t('errors.invalid_input'),
      esign_failed: t('errors.esign_failed'),
      error: t('errors.error'),
    },
  };
}

function FormSkeleton() {
  return (
    <div data-testid="adjust-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-12 w-full animate-pulse rounded-md bg-slate-100" />
      <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function FormContent({ locale }: { locale: string }) {
  const t = getAdjustmentsTranslator(locale);

  // Page GATE (RBAC server-side): the caller must hold warehouse.stock.adjust.
  const gate = await getDirectAdjustFormContext();
  if (!gate.ok) {
    const denied = gate.reason === 'forbidden';
    return (
      <div
        role={denied ? 'note' : 'alert'}
        data-testid={denied ? 'adjust-denied' : 'adjust-error'}
        data-state={denied ? 'permission-denied' : 'error'}
        className={
          denied
            ? 'rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800'
            : 'rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700'
        }
      >
        {denied ? t('page.denied') : t('page.error')}
      </div>
    );
  }

  // Locations for the picker (site + warehouse are derived from the choice).
  const locationsResult = await listLocations({ limit: 500 });
  const locations = locationsResult.ok ? locationsResult.data : [];

  return (
    <DirectAdjustForm
      locale={locale}
      labels={buildLabels(t)}
      locations={locations}
      applyAction={applyDirectAdjustment}
      searchItemsAction={searchAdjustItems}
      searchSupervisorsAction={searchEligibleSupervisors}
      listLpsAction={listDecreaseLps}
    />
  );
}

export default async function DirectAdjustNewPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getAdjustmentsTranslator(locale);

  return (
    <main
      data-screen="warehouse-stock-adjustment"
      data-prototype-label="warehouse_direct_adjustment"
      data-prototype-anchor="prototypes/design/Monopilot Design System/warehouse/modals.jsx:396-499"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        breadcrumb={[
          { label: t('page.breadcrumbWarehouse'), href: `/${locale}/warehouse` },
          { label: t('page.breadcrumbAdjustments') },
        ]}
      />
      <Suspense fallback={<FormSkeleton />}>
        <FormContent locale={locale} />
      </Suspense>
    </main>
  );
}
