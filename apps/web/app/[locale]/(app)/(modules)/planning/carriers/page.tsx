/**
 * WAVE E9 — SCREEN /planning/carriers (mig 316 carriers / transport_lanes).
 *
 * Prototype anchor: NONE EXISTS — prototypes/design/Monopilot Design System/
 * planning/ and planning-ext/ contain no carriers/freight screen (same sweep as
 * /planning/reorder-thresholds and /planning/mrp: zero matches). Presentation
 * follows the locked MON-design-system conventions reused from sibling planning
 * screens (PageHeader + card/table/badge/empty-state + @monopilot/ui Modal forms),
 * so prototype_match = false (spec-driven; nearest pattern = plan_reorder_thresholds).
 *
 * Real data only: carrier + transport-lane list/upsert go through the org-scoped
 * Server Actions over public.carriers / public.transport_lanes (mig 316). RBAC is
 * enforced server-side inside the upsert actions (npd.planning.write).
 *
 * Desktop planning context — a normal @monopilot/ui Select is used for the mode /
 * cost-basis pickers (the raw-<select> red-line applies only to the scanner).
 *
 * UI states: loading, empty, error, permission-denied (list seam rejects →
 * denied note), optimistic (dialog pending → submit busy + disabled).
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  listCarriers,
  upsertCarrier,
  listTransportLanes,
  upsertTransportLane,
} from '../_actions/freight-actions';
import { CarriersView, type CarriersLabels } from './_components/carriers-view';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type CarriersPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function CarriersPage({ params }: CarriersPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Planning');

  const labels: CarriersLabels = {
    title: t('carriers.title'),
    addCarrier: t('carriers.addCarrier'),
    editCarrier: t('carriers.editCarrier'),
    loading: t('carriers.loading'),
    denied: t('carriers.denied'),
    error: t('carriers.error'),
    empty: t('carriers.empty'),
    emptyHint: t('carriers.emptyHint'),
    active: t('carriers.active'),
    inactive: t('carriers.inactive'),
    manageLanes: t('carriers.manageLanes'),
    noContact: t('carriers.noContact'),
    modes: {
      road: t('carriers.modes.road'),
      sea: t('carriers.modes.sea'),
      air: t('carriers.modes.air'),
      rail: t('carriers.modes.rail'),
      parcel: t('carriers.modes.parcel'),
    },
    costBases: {
      per_shipment: t('carriers.costBases.per_shipment'),
      per_kg: t('carriers.costBases.per_kg'),
      per_km: t('carriers.costBases.per_km'),
      per_pallet: t('carriers.costBases.per_pallet'),
    },
    columns: {
      code: t('carriers.columns.code'),
      name: t('carriers.columns.name'),
      mode: t('carriers.columns.mode'),
      contact: t('carriers.columns.contact'),
      status: t('carriers.columns.status'),
      actions: t('carriers.columns.actions'),
    },
    carrierModal: {
      titleAdd: t('carriers.carrierModal.titleAdd'),
      titleEdit: t('carriers.carrierModal.titleEdit'),
      codeLabel: t('carriers.carrierModal.codeLabel'),
      nameLabel: t('carriers.carrierModal.nameLabel'),
      modeLabel: t('carriers.carrierModal.modeLabel'),
      emailLabel: t('carriers.carrierModal.emailLabel'),
      phoneLabel: t('carriers.carrierModal.phoneLabel'),
      activeLabel: t('carriers.carrierModal.activeLabel'),
      submit: t('carriers.carrierModal.submit'),
      submitting: t('carriers.carrierModal.submitting'),
      cancel: t('carriers.carrierModal.cancel'),
      edit: t('carriers.carrierModal.edit'),
      errors: {
        codeRequired: t('carriers.carrierModal.errors.codeRequired'),
        nameRequired: t('carriers.carrierModal.errors.nameRequired'),
        emailInvalid: t('carriers.carrierModal.errors.emailInvalid'),
        invalid_input: t('carriers.carrierModal.errors.invalid_input'),
        forbidden: t('carriers.carrierModal.errors.forbidden'),
        not_found: t('carriers.carrierModal.errors.not_found'),
        already_exists: t('carriers.carrierModal.errors.already_exists'),
        persistence_failed: t('carriers.carrierModal.errors.persistence_failed'),
      },
    },
    lanes: {
      title: t('carriers.lanes.title'),
      addLane: t('carriers.lanes.addLane'),
      empty: t('carriers.lanes.empty'),
      days: t('carriers.lanes.days'),
      columns: {
        route: t('carriers.lanes.columns.route'),
        mode: t('carriers.lanes.columns.mode'),
        cost: t('carriers.lanes.columns.cost'),
        transit: t('carriers.lanes.columns.transit'),
        status: t('carriers.lanes.columns.status'),
        actions: t('carriers.lanes.columns.actions'),
      },
      edit: t('carriers.lanes.edit'),
      modal: {
        titleAdd: t('carriers.lanes.modal.titleAdd'),
        titleEdit: t('carriers.lanes.modal.titleEdit'),
        originLabel: t('carriers.lanes.modal.originLabel'),
        destinationLabel: t('carriers.lanes.modal.destinationLabel'),
        modeLabel: t('carriers.lanes.modal.modeLabel'),
        costBasisLabel: t('carriers.lanes.modal.costBasisLabel'),
        costAmountLabel: t('carriers.lanes.modal.costAmountLabel'),
        currencyLabel: t('carriers.lanes.modal.currencyLabel'),
        transitDaysLabel: t('carriers.lanes.modal.transitDaysLabel'),
        activeLabel: t('carriers.lanes.modal.activeLabel'),
        submit: t('carriers.lanes.modal.submit'),
        submitting: t('carriers.lanes.modal.submitting'),
        cancel: t('carriers.lanes.modal.cancel'),
        errors: {
          originRequired: t('carriers.lanes.modal.errors.originRequired'),
          destinationRequired: t('carriers.lanes.modal.errors.destinationRequired'),
          costInvalid: t('carriers.lanes.modal.errors.costInvalid'),
          invalid_input: t('carriers.lanes.modal.errors.invalid_input'),
          forbidden: t('carriers.lanes.modal.errors.forbidden'),
          not_found: t('carriers.lanes.modal.errors.not_found'),
          already_exists: t('carriers.lanes.modal.errors.already_exists'),
          persistence_failed: t('carriers.lanes.modal.errors.persistence_failed'),
        },
      },
    },
  };

  return (
    <main
      data-screen="planning-carriers"
      data-testid="planning-carriers-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('carriers.title')}
        subtitle={t('carriers.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('carriers.breadcrumb') },
        ]}
      />
      <CarriersView
        labels={labels}
        listCarriersAction={listCarriers}
        upsertCarrierAction={upsertCarrier}
        listLanesAction={listTransportLanes}
        upsertLaneAction={upsertTransportLane}
      />
    </main>
  );
}
