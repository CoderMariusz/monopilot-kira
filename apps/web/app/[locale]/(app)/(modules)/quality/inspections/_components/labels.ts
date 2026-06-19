/**
 * QA-005 / QA-005a / MODAL-INSPECTION-CREATE — label builders.
 *
 * Maps the staged `quality-inspections.json` bundle (resolved by
 * getQaInspectionsTranslator, the FIXED quality-holds loader pattern) into the
 * typed label props the client islands consume. Shared by the RSC pages and the
 * RTL tests so both assert the same resolved strings (and that en + pl never leak
 * a raw dotted key).
 */
import type { QaInspectionsTranslator } from '../../qa-inspections-labels';
import type { InspectionStatus, InspectionReferenceType } from './inspection-contracts';
import type { InspectionsListLabels, InspectionStatusTab } from './inspections-list.client';
import type { InspectionCreateLabels } from './inspection-create-modal.client';
import type { InspectionDetailLabels } from '../[inspectionId]/_components/inspection-detail.client';

export const INSPECTION_STATUSES: InspectionStatus[] = [
  'pending',
  'in_progress',
  'passed',
  'failed',
  'on_hold',
  'cancelled',
];

export const INSPECTION_TABS: InspectionStatusTab[] = [
  'all',
  'pending',
  'in_progress',
  'passed',
  'failed',
  'on_hold',
  'cancelled',
];

const REF_TYPES: InspectionReferenceType[] = ['lp', 'grn', 'wo_output'];

export function buildInspectionsListLabels(t: QaInspectionsTranslator): InspectionsListLabels {
  return {
    createInspection: t('list.createInspection'),
    searchPlaceholder: t('list.searchPlaceholder'),
    searchLabel: t('list.searchLabel'),
    rowsLabel: t('list.rowsLabel'),
    emptyAll: t('list.emptyAll'),
    emptyFiltered: t('list.emptyFiltered'),
    noProduct: t('list.noProduct'),
    unassigned: t('list.unassigned'),
    tab: Object.fromEntries(INSPECTION_TABS.map((k) => [k, t(`list.tabs.${k}`)])) as Record<
      InspectionStatusTab,
      string
    >,
    status: Object.fromEntries(
      INSPECTION_STATUSES.map((s) => [s, t(`list.status.${s}`)]),
    ) as Record<InspectionStatus, string>,
    columns: {
      inspectionNumber: t('list.columns.inspectionNumber'),
      reference: t('list.columns.reference'),
      product: t('list.columns.product'),
      status: t('list.columns.status'),
      assigned: t('list.columns.assigned'),
      due: t('list.columns.due'),
      created: t('list.columns.created'),
    },
  };
}

export function buildInspectionCreateLabels(t: QaInspectionsTranslator): InspectionCreateLabels {
  return {
    title: t('createModal.title'),
    subtitle: t('createModal.subtitle'),
    refType: t('createModal.refType'),
    refTypeOptions: Object.fromEntries(
      REF_TYPES.map((rt) => [rt, t(`createModal.refTypeOptions.${rt}`)]),
    ) as Record<InspectionReferenceType, string>,
    referenceId: t('createModal.referenceId'),
    referenceIdHelp: t('createModal.referenceIdHelp'),
    referenceIdPlaceholder: t('createModal.referenceIdPlaceholder'),
    assignee: t('createModal.assignee'),
    assigneeHelp: t('createModal.assigneeHelp'),
    assigneePlaceholder: t('createModal.assigneePlaceholder'),
    dueDate: t('createModal.dueDate'),
    notes: t('createModal.notes'),
    notesPlaceholder: t('createModal.notesPlaceholder'),
    cancel: t('createModal.cancel'),
    submit: t('createModal.submit'),
    submitting: t('createModal.submitting'),
    formIncomplete: 'Complete all required fields to continue.',
    validation: { referenceRequired: t('createModal.validation.referenceRequired') },
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
      refInputLabel: {
        grn: t('createModal.lookup.refInputLabel.grn'),
        wo_output: t('createModal.lookup.refInputLabel.wo_output'),
      },
      refInputHelp: {
        grn: t('createModal.lookup.refInputHelp.grn'),
        wo_output: t('createModal.lookup.refInputHelp.wo_output'),
      },
      refInputPlaceholder: {
        grn: t('createModal.lookup.refInputPlaceholder.grn'),
        wo_output: t('createModal.lookup.refInputPlaceholder.wo_output'),
      },
      unresolvedRef: t('createModal.lookup.unresolvedRef'),
      assigneeSearchPlaceholder: t('createModal.lookup.assigneeSearchPlaceholder'),
      assigneePickedChip: t('createModal.lookup.assigneePickedChip'),
      assigneeResultLine: t('createModal.lookup.assigneeResultLine'),
      assigneeNoMatches: t('createModal.lookup.assigneeNoMatches'),
    },
  };
}

export function buildInspectionDetailLabels(t: QaInspectionsTranslator): InspectionDetailLabels {
  return {
    backToInspections: t('detail.backToInspections'),
    signedBanner: t('detail.signedBanner'),
    header: {
      title: t('detail.header.title'),
      context: t('detail.header.context'),
      product: t('detail.header.product'),
      assigned: t('detail.header.assigned'),
      due: t('detail.header.due'),
      created: t('detail.header.created'),
      unassigned: t('detail.header.unassigned'),
    },
    params: {
      name: t('detail.params.name'),
      expected: t('detail.params.expected'),
      actual: t('detail.params.actual'),
      result: t('detail.params.result'),
      pass: t('detail.params.pass'),
      fail: t('detail.params.fail'),
      actualPlaceholder: t('detail.params.actualPlaceholder'),
      empty: t('detail.params.empty'),
      save: t('detail.params.save'),
      saving: t('detail.params.saving'),
      saved: t('detail.params.saved'),
      saveError: t('detail.params.saveError'),
      notes: t('detail.params.notes'),
      notesPlaceholder: t('detail.params.notesPlaceholder'),
      formIncomplete: 'Complete all required fields to continue.',
    },
    overall: {
      label: t('detail.overall.label'),
      pass: t('detail.overall.pass'),
      fail: t('detail.overall.fail'),
      pending: t('detail.overall.pending'),
      passBody: t('detail.overall.passBody'),
      failBody: t('detail.overall.failBody'),
      pendingBody: t('detail.overall.pendingBody'),
    },
    decision: {
      title: t('detail.decision.title'),
      pass: t('detail.decision.pass'),
      fail: t('detail.decision.fail'),
      hold: t('detail.decision.hold'),
      held: t('detail.decision.held'),
      holdLink: t('detail.decision.holdLink'),
      passed: t('detail.decision.passed'),
      failed: t('detail.decision.failed'),
    },
    esign: {
      title: t('detail.esign.title'),
      meaning: t('detail.esign.meaning'),
      password: t('detail.esign.password'),
      passwordHelp: t('detail.esign.passwordHelp'),
      passwordPlaceholder: t('detail.esign.passwordPlaceholder'),
      note: t('detail.esign.note'),
      notePlaceholder: t('detail.esign.notePlaceholder'),
      cancel: t('detail.esign.cancel'),
      submit: t('detail.esign.submit'),
      submitting: t('detail.esign.submitting'),
      formIncomplete: 'Complete all required fields to continue.',
      validation: { passwordRequired: t('detail.esign.validation.passwordRequired') },
      error: t('detail.esign.error'),
      success: t('detail.esign.success'),
    },
    status: Object.fromEntries(
      INSPECTION_STATUSES.map((s) => [s, t(`list.status.${s}`)]),
    ) as Record<InspectionStatus, string>,
  };
}
