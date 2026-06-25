/**
 * WAVE E5 — label builders for the yard screens.
 *
 * Each builder resolves the typed label object a client view needs from the
 * `Yard` next-intl namespace (en/pl real, ro/uk EN-mirrored). These label
 * objects contain FUNCTION-valued members (`minutes(count)`, `directionLabel`,
 * `statusLabel`, `directionOption`) that cannot cross the RSC boundary, so the
 * builders are invoked CLIENT-side: each `*.client.tsx` view calls
 * `useTranslations('Yard')` and runs the matching builder itself (never passing
 * the result as a server→client `labels` prop). Keeping the i18n wiring here
 * means every visible string flows through next-intl (no inline JSX strings) and
 * the label shapes stay in one place. The builders accept the `useTranslations`
 * return type, so they work unchanged on the client.
 */
import type { useTranslations } from 'next-intl';

import type { AppointmentDirection, AppointmentStatus } from './yard-shared';
import type { YardBoardLabels } from './yard-board.client';
import type { AppointmentsLabels } from './appointments-view.client';
import type { WeighbridgeLabels } from './weighbridge-view.client';
import type { DocksLabels } from '../../../(admin)/settings/infra/docks/docks-view.client';

/** Accept either the client `useTranslations` hook or the server translator. */
type Translator = ReturnType<typeof useTranslations>;

export function buildYardBoardLabels(t: Translator): YardBoardLabels {
  const directionLabel = (d: AppointmentDirection) => t(`direction.${d}`);
  const statusLabel = (s: AppointmentStatus) => t(`appointmentStatus.${s}`);
  return {
    appointmentsTitle: t('board.appointmentsTitle'),
    appointmentsEmpty: t('board.appointmentsEmpty'),
    onSiteTitle: t('board.onSiteTitle'),
    onSiteEmpty: t('board.onSiteEmpty'),
    gateInTitle: t('board.gateInTitle'),
    gateIn: t('board.gateIn'),
    gateInPending: t('board.gateInPending'),
    gateOut: t('board.gateOut'),
    gateOutPending: t('board.gateOutPending'),
    weigh: t('board.weigh'),
    manual: t('board.manual'),
    againstAppointment: t('board.againstAppointment'),
    noAppointment: t('board.noAppointment'),
    vehicleReg: t('board.vehicleReg'),
    trailerRef: t('board.trailerRef'),
    driverName: t('board.driverName'),
    carrier: t('board.carrier'),
    noCarrier: t('board.noCarrier'),
    reference: t('board.reference'),
    time: t('board.time'),
    dockDoor: t('board.dockDoor'),
    status: t('board.status'),
    minutes: (count: number) => t('board.minutes', { count }),
    vehicleRegRequired: t('board.vehicleRegRequired'),
    gateInFailed: t('board.gateInFailed'),
    gateOutFailed: t('board.gateOutFailed'),
    loading: t('board.loading'),
    denied: t('board.denied'),
    error: t('board.error'),
    cancel: t('appointments.modal.cancel'),
    directionLabel,
    statusLabel,
    weighFormTitle: t('weighbridge.formTitle'),
    grossLabel: t('weighbridge.grossLabel'),
    tareLabel: t('weighbridge.tareLabel'),
    netLabel: t('weighbridge.netLabel'),
    weighSubmit: t('weighbridge.submit'),
    weighSubmitting: t('weighbridge.submitting'),
    weighErrors: {
      grossInvalid: t('weighbridge.errors.grossInvalid'),
      tareInvalid: t('weighbridge.errors.tareInvalid'),
      netNegative: t('weighbridge.errors.netNegative'),
      invalid_input: t('weighbridge.errors.invalid_input'),
      forbidden: t('weighbridge.errors.forbidden'),
      not_found: t('weighbridge.errors.not_found'),
      overlap: t('weighbridge.errors.invalid_input'),
      persistence_failed: t('weighbridge.errors.persistence_failed'),
    },
  };
}

export function buildAppointmentsLabels(t: Translator): AppointmentsLabels {
  const directionLabel = (d: AppointmentDirection) => t(`direction.${d}`);
  const statusLabel = (s: AppointmentStatus) => t(`appointmentStatus.${s}`);
  return {
    loading: t('appointments.loading'),
    denied: t('appointments.denied'),
    error: t('appointments.error'),
    empty: t('appointments.empty'),
    book: t('appointments.book'),
    noDockDoors: t('appointments.noDockDoors'),
    viewDay: t('appointments.viewDay'),
    viewWeek: t('appointments.viewWeek'),
    previous: t('appointments.previous'),
    next: t('appointments.next'),
    today: t('appointments.today'),
    columns: {
      time: t('appointments.columns.time'),
      dockDoor: t('appointments.columns.dockDoor'),
      carrier: t('appointments.columns.carrier'),
      direction: t('appointments.columns.direction'),
      reference: t('appointments.columns.reference'),
      duration: t('appointments.columns.duration'),
      status: t('appointments.columns.status'),
    },
    noCarrier: t('appointments.modal.noCarrier'),
    minutes: (count: number) => t('board.minutes', { count }),
    directionLabel,
    statusLabel,
    modal: {
      title: t('appointments.modal.title'),
      dockDoorLabel: t('appointments.modal.dockDoorLabel'),
      carrierLabel: t('appointments.modal.carrierLabel'),
      noCarrier: t('appointments.modal.noCarrier'),
      directionLabel: t('appointments.modal.directionLabel'),
      referenceLabel: t('appointments.modal.referenceLabel'),
      scheduledAtLabel: t('appointments.modal.scheduledAtLabel'),
      durationLabel: t('appointments.modal.durationLabel'),
      submit: t('appointments.modal.submit'),
      submitting: t('appointments.modal.submitting'),
      cancel: t('appointments.modal.cancel'),
      directionOption: directionLabel,
      errors: {
        dockDoorRequired: t('appointments.modal.errors.dockDoorRequired'),
        scheduledAtRequired: t('appointments.modal.errors.scheduledAtRequired'),
        durationInvalid: t('appointments.modal.errors.durationInvalid'),
        invalid_input: t('appointments.modal.errors.invalid_input'),
        forbidden: t('appointments.modal.errors.forbidden'),
        not_found: t('appointments.modal.errors.not_found'),
        overlap: t('appointments.modal.errors.overlap'),
        already_exists: t('appointments.modal.errors.already_exists'),
        invalid_status: t('appointments.modal.errors.invalid_status'),
        persistence_failed: t('appointments.modal.errors.persistence_failed'),
      },
    },
  };
}

export function buildWeighbridgeLabels(t: Translator): WeighbridgeLabels {
  return {
    loading: t('weighbridge.loading'),
    denied: t('weighbridge.denied'),
    error: t('weighbridge.error'),
    formTitle: t('weighbridge.formTitle'),
    visitLabel: t('weighbridge.visitLabel'),
    noVisits: t('weighbridge.noVisits'),
    grossLabel: t('weighbridge.grossLabel'),
    tareLabel: t('weighbridge.tareLabel'),
    netLabel: t('weighbridge.netLabel'),
    submit: t('weighbridge.submit'),
    submitting: t('weighbridge.submitting'),
    recentTitle: t('weighbridge.recentTitle'),
    recentEmpty: t('weighbridge.recentEmpty'),
    columns: {
      vehicle: t('weighbridge.columns.vehicle'),
      carrier: t('weighbridge.columns.carrier'),
      gross: t('weighbridge.columns.gross'),
      tare: t('weighbridge.columns.tare'),
      net: t('weighbridge.columns.net'),
      weighedAt: t('weighbridge.columns.weighedAt'),
    },
    noCarrier: t('board.noCarrier'),
    errors: {
      visitRequired: t('weighbridge.errors.visitRequired'),
      grossInvalid: t('weighbridge.errors.grossInvalid'),
      tareInvalid: t('weighbridge.errors.tareInvalid'),
      netNegative: t('weighbridge.errors.netNegative'),
      invalid_input: t('weighbridge.errors.invalid_input'),
      forbidden: t('weighbridge.errors.forbidden'),
      not_found: t('weighbridge.errors.not_found'),
      persistence_failed: t('weighbridge.errors.persistence_failed'),
    },
  };
}

export function buildDocksLabels(t: Translator): DocksLabels {
  const directionLabel = (d: 'inbound' | 'outbound' | 'both') => t(`direction.${d}`);
  return {
    loading: t('docks.loading'),
    denied: t('docks.denied'),
    error: t('docks.error'),
    empty: t('docks.empty'),
    emptyHint: t('docks.emptyHint'),
    add: t('docks.add'),
    edit: t('docks.edit'),
    active: t('docks.active'),
    inactive: t('docks.inactive'),
    noWarehouse: t('docks.noWarehouse'),
    columns: {
      code: t('docks.columns.code'),
      name: t('docks.columns.name'),
      direction: t('docks.columns.direction'),
      warehouse: t('docks.columns.warehouse'),
      status: t('docks.columns.status'),
      actions: t('docks.columns.actions'),
    },
    directionLabel,
    modal: {
      titleAdd: t('docks.modal.titleAdd'),
      titleEdit: t('docks.modal.titleEdit'),
      codeLabel: t('docks.modal.codeLabel'),
      nameLabel: t('docks.modal.nameLabel'),
      directionLabel: t('docks.modal.directionLabel'),
      warehouseLabel: t('docks.modal.warehouseLabel'),
      noWarehouse: t('docks.modal.noWarehouse'),
      activeLabel: t('docks.modal.activeLabel'),
      submit: t('docks.modal.submit'),
      submitting: t('docks.modal.submitting'),
      cancel: t('docks.modal.cancel'),
      directionOption: directionLabel,
      errors: {
        codeRequired: t('docks.modal.errors.codeRequired'),
        invalid_input: t('docks.modal.errors.invalid_input'),
        forbidden: t('docks.modal.errors.forbidden'),
        not_found: t('docks.modal.errors.not_found'),
        already_exists: t('docks.modal.errors.already_exists'),
        persistence_failed: t('docks.modal.errors.persistence_failed'),
      },
    },
  };
}
