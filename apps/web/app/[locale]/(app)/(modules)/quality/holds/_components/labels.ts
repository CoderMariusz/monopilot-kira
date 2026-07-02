/**
 * QA-002 / QA-002a / MODAL-HOLD-CREATE / MODAL-HOLD-RELEASE — label builders.
 *
 * Maps the staged `quality-holds.json` bundle (resolved by getQaHoldsTranslator,
 * the FIXED warehouse loader pattern) into the typed label props the client
 * islands consume. Shared by the RSC pages and the RTL tests so both assert the
 * same resolved strings (and that en + pl never leak a raw dotted key).
 */
import type { QaHoldsTranslator } from '../../qa-holds-labels';
import type { HoldsListLabels, HoldRefType } from './holds-list.client';
import type { HoldCreateLabels } from './hold-create-modal.client';
import type { HoldReleaseLabels, ReleaseDisposition } from './hold-release-modal.client';
import type { HoldDetailLabels } from '../[holdId]/_components/hold-detail.client';

const REF_TYPES: HoldRefType[] = ['lp', 'batch', 'wo', 'po', 'grn'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'investigating', 'escalated', 'quarantined', 'released'];
const DISPOSITIONS: ReleaseDisposition[] = ['release', 'scrap', 'rework', 'partial'];

export function buildHoldsListLabels(t: QaHoldsTranslator): HoldsListLabels {
  return {
    searchPlaceholder: t('list.searchPlaceholder'),
    searchLabel: t('list.searchLabel'),
    rowsLabel: t('list.rowsLabel'),
    refTypeLabel: t('list.refTypeLabel'),
    refTypeAll: t('list.refTypeAll'),
    createHold: t('list.createHold'),
    noReason: t('list.noReason'),
    emptyAll: t('list.emptyAll'),
    emptyFiltered: t('list.emptyFiltered'),
    tab: {
      active: t('list.tabs.active'),
      released: t('list.tabs.released'),
      all: t('list.tabs.all'),
    },
    refType: Object.fromEntries(REF_TYPES.map((rt) => [rt, t(`list.refType.${rt}`)])) as Record<HoldRefType, string>,
    priority: Object.fromEntries(PRIORITIES.map((p) => [p, t(`list.priority.${p}`)])),
    status: Object.fromEntries(STATUSES.map((s) => [s, t(`list.status.${s}`)])),
    columns: {
      holdNumber: t('list.columns.holdNumber'),
      refType: t('list.columns.refType'),
      reference: t('list.columns.reference'),
      reason: t('list.columns.reason'),
      priority: t('list.columns.priority'),
      status: t('list.columns.status'),
      created: t('list.columns.created'),
      estRelease: t('list.columns.estRelease'),
    },
  };
}

export function buildHoldCreateLabels(t: QaHoldsTranslator): HoldCreateLabels {
  return {
    title: t('createModal.title'),
    subtitle: t('createModal.subtitle'),
    refType: t('createModal.refType'),
    refTypeHelp: t('createModal.refTypeHelp'),
    refTypeOptions: Object.fromEntries(REF_TYPES.map((rt) => [rt, t(`list.refType.${rt}`)])) as Record<HoldRefType, string>,
    referenceId: t('createModal.referenceId'),
    referenceIdHelp: t('createModal.referenceIdHelp'),
    referenceIdPlaceholder: t('createModal.referenceIdPlaceholder'),
    lpIds: t('createModal.lpIds'),
    lpIdsHelp: t('createModal.lpIdsHelp'),
    lpIdsPlaceholder: t('createModal.lpIdsPlaceholder'),
    reasonText: t('createModal.reasonText'),
    reasonTextHelp: t('createModal.reasonTextHelp'),
    reasonTextPlaceholder: t('createModal.reasonTextPlaceholder'),
    priority: t('createModal.priority'),
    priorityOptions: Object.fromEntries(PRIORITIES.map((p) => [p, t(`list.priority.${p}`)])),
    estRelease: t('createModal.estRelease'),
    criticalWarning: t('createModal.criticalWarning'),
    cancel: t('createModal.cancel'),
    submit: t('createModal.submit'),
    submitting: t('createModal.submitting'),
    formIncomplete: 'Complete all required fields to continue.',
    validation: {
      referenceRequired: t('createModal.validation.referenceRequired'),
      reasonRequired: t('createModal.validation.reasonRequired'),
    },
    error: t('createModal.error'),
    success: t('createModal.success'),
    lookup: {
      lpSearchLabel: t('createModal.lookup.lpSearchLabel'),
      lpSearchPlaceholder: t('createModal.lookup.lpSearchPlaceholder'),
      lpSearchHelp: t('createModal.lookup.lpSearchHelp'),
      searching: t('createModal.lookup.searching'),
      noMatches: t('createModal.lookup.noMatches'),
      pickedChip: t('createModal.lookup.pickedChip'),
      clearPick: t('createModal.lookup.clearPick'),
      resultLine: t('createModal.lookup.resultLine'),
      lpNumbersLabel: t('createModal.lookup.lpNumbersLabel'),
      lpNumbersHelp: t('createModal.lookup.lpNumbersHelp'),
      lpNumbersPlaceholder: t('createModal.lookup.lpNumbersPlaceholder'),
      unresolved: t('createModal.lookup.unresolved'),
      refTypeHelp: {
        lp: t('createModal.lookup.refTypeHelpLp'),
        batch: t('createModal.lookup.refTypeHelpBatch'),
        wo: t('createModal.lookup.refTypeHelpWo'),
        po: t('createModal.lookup.refTypeHelpPo'),
        grn: t('createModal.lookup.refTypeHelpGrn'),
      },
      refTypePlaceholder: {
        batch: t('createModal.lookup.batchPlaceholder'),
        wo: t('createModal.lookup.woPlaceholder'),
        po: t('createModal.lookup.poPlaceholder'),
        grn: t('createModal.lookup.grnPlaceholder'),
      },
      unresolvedRef: t('createModal.lookup.unresolvedRef'),
    },
  };
}

export function buildHoldReleaseLabels(t: QaHoldsTranslator): HoldReleaseLabels {
  return {
    title: t('releaseModal.title'),
    summary: {
      hold: t('releaseModal.summary.hold'),
      reference: t('releaseModal.summary.reference'),
      reason: t('releaseModal.summary.reason'),
      priority: t('releaseModal.summary.priority'),
    },
    disposition: t('releaseModal.disposition'),
    dispositionHelp: t('releaseModal.dispositionHelp'),
    dispositionPlaceholder: t('releaseModal.dispositionPlaceholder'),
    dispositionOptions: Object.fromEntries(
      DISPOSITIONS.map((d) => [d, t(`releaseModal.dispositionOptions.${d}`)]),
    ) as Record<ReleaseDisposition, string>,
    reasonText: t('releaseModal.reasonText'),
    reasonTextHelp: t('releaseModal.reasonTextHelp'),
    reasonTextPlaceholder: t('releaseModal.reasonTextPlaceholder'),
    sodWarning: t('releaseModal.sodWarning'),
    esign: {
      title: t('releaseModal.esign.title'),
      meaning: t('releaseModal.esign.meaning'),
      password: t('releaseModal.esign.password'),
      passwordHelp: t('releaseModal.esign.passwordHelp'),
      passwordPlaceholder: t('releaseModal.esign.passwordPlaceholder'),
    },
    cancel: t('releaseModal.cancel'),
    submit: t('releaseModal.submit'),
    submitting: t('releaseModal.submitting'),
    formIncomplete: 'Complete all required fields to continue.',
    validation: {
      dispositionRequired: t('releaseModal.validation.dispositionRequired'),
      reasonRequired: t('releaseModal.validation.reasonRequired'),
      passwordRequired: t('releaseModal.validation.passwordRequired'),
    },
    policyErrors: {
      second_signature_required: t.has('releaseModal.policyErrors.second_signature_required')
        ? t('releaseModal.policyErrors.second_signature_required')
        : 'This release requires a second e-signature under the configured sign-off policy.',
      signer_role_not_allowed: t.has('releaseModal.policyErrors.signer_role_not_allowed')
        ? t('releaseModal.policyErrors.signer_role_not_allowed')
        : 'Your role is not allowed to sign this release under the configured sign-off policy.',
    },
    error: t('releaseModal.error'),
    success: t('releaseModal.success'),
  };
}

export function buildHoldDetailLabels(t: QaHoldsTranslator): HoldDetailLabels {
  return {
    backToHolds: t('detail.backToHolds'),
    signedBanner: t('detail.signedBanner'),
    context: {
      title: t('detail.context.title'),
      reference: t('detail.context.reference'),
      reason: t('detail.context.reason'),
      priority: t('detail.context.priority'),
      disposition: t('detail.context.disposition'),
      created: t('detail.context.created'),
      estRelease: t('detail.context.estRelease'),
      dispositionPending: t('detail.context.dispositionPending'),
    },
    tabs: { items: t('detail.tabs.items'), ncrs: t('detail.tabs.ncrs') },
    items: {
      lp: t('detail.items.lp'),
      qtyHeld: t('detail.items.qtyHeld'),
      qtyReleased: t('detail.items.qtyReleased'),
      status: t('detail.items.status'),
      empty: t('detail.items.empty'),
    },
    ncrs: {
      ncrNumber: t('detail.ncrs.ncrNumber'),
      ncrTitle: t('detail.ncrs.ncrTitle'),
      severity: t('detail.ncrs.severity'),
      status: t('detail.ncrs.status'),
      empty: t('detail.ncrs.empty'),
    },
    actions: {
      title: t('detail.actions.title'),
      release: t('detail.actions.release'),
      sod: t('detail.actions.sod'),
    },
    refType: Object.fromEntries(REF_TYPES.map((rt) => [rt, t(`list.refType.${rt}`)])),
    priorityValues: Object.fromEntries(PRIORITIES.map((p) => [p, t(`list.priority.${p}`)])),
    statusValues: Object.fromEntries(STATUSES.map((s) => [s, t(`list.status.${s}`)])),
    noReason: t('list.noReason'),
    releaseLabels: buildHoldReleaseLabels(t),
  };
}
