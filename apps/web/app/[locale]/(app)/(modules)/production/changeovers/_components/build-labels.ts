/**
 * B-2 — Resolve the changeovers screen label tree from a next-intl translator.
 * Server-only (called inside the RSC page with getTranslations('production.
 * changeovers')); the resolved objects are passed down to the client islands so
 * they carry no inline copy. Every key here MUST exist in en/pl/ro/uk.json.
 */
import type { ChangeoversScreenLabels } from './labels';

type T = (key: string) => string;

export function buildChangeoversLabels(t: T): ChangeoversScreenLabels {
  return {
    breadcrumb: {
      production: t('breadcrumb.production'),
      changeovers: t('breadcrumb.changeovers'),
    },
    list: {
      title: t('list.title'),
      subtitle: t('list.subtitle'),
      newButton: t('list.newButton'),
      filters: {
        all: t('list.filters.all'),
        pending: t('list.filters.pending'),
        first_signed: t('list.filters.first_signed'),
        complete: t('list.filters.complete'),
      },
      loading: t('list.loading'),
      empty: t('list.empty'),
      error: t('list.error'),
      denied: t('list.denied'),
      col: {
        line: t('list.col.line'),
        transition: t('list.col.transition'),
        cleaning: t('list.col.cleaning'),
        atp: t('list.col.atp'),
        status: t('list.col.status'),
        signers: t('list.col.signers'),
      },
      cleaningYes: t('list.cleaningYes'),
      cleaningNo: t('list.cleaningNo'),
      none: t('list.none'),
      status: {
        pending: t('list.status.pending'),
        first_signed: t('list.status.first_signed'),
        complete: t('list.status.complete'),
      },
      signerNone: t('list.signerNone'),
      reviewButton: t('list.reviewButton'),
    },
    create: {
      title: t('create.title'),
      subtitle: t('create.subtitle'),
      line: t('create.line'),
      linePlaceholder: t('create.linePlaceholder'),
      fromProduct: t('create.fromProduct'),
      toProduct: t('create.toProduct'),
      cleaning: t('create.cleaning'),
      atp: t('create.atp'),
      atpPlaceholder: t('create.atpPlaceholder'),
      notes: t('create.notes'),
      notesPlaceholder: t('create.notesPlaceholder'),
      cancel: t('create.cancel'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      picker: {
        trigger: t('create.picker.trigger'),
        searchLabel: t('create.picker.searchLabel'),
        searchPlaceholder: t('create.picker.searchPlaceholder'),
        loading: t('create.picker.loading'),
        empty: t('create.picker.empty'),
        cancel: t('create.picker.cancel'),
        error: t('create.picker.error'),
      },
      clearProduct: t('create.clearProduct'),
      validation: {
        lineRequired: t('create.validation.lineRequired'),
        toProductRequired: t('create.validation.toProductRequired'),
      },
      errors: {
        forbidden: t('create.errors.forbidden'),
        invalid_input: t('create.errors.invalid_input'),
        generic: t('create.errors.generic'),
      },
    },
    sign: {
      title: t('sign.title'),
      subtitle: t('sign.subtitle'),
      firstSlot: t('sign.firstSlot'),
      secondSlot: t('sign.secondSlot'),
      signedBy: t('sign.signedBy'),
      signedAt: t('sign.signedAt'),
      awaiting: t('sign.awaiting'),
      signFirst: t('sign.signFirst'),
      signSecond: t('sign.signSecond'),
      completeBanner: t('sign.completeBanner'),
      close: t('sign.close'),
      esign: {
        title: t('sign.esign.title'),
        meaning: t('sign.esign.meaning'),
        password: t('sign.esign.password'),
        passwordPlaceholder: t('sign.esign.passwordPlaceholder'),
        passwordHelp: t('sign.esign.passwordHelp'),
        submit: t('sign.esign.submit'),
        submitting: t('sign.esign.submitting'),
        cancel: t('sign.esign.cancel'),
        passwordRequired: t('sign.esign.passwordRequired'),
      },
      errors: {
        forbidden: t('sign.errors.forbidden'),
        wrong_role: t('sign.errors.wrong_role'),
        same_user: t('sign.errors.same_user'),
        same_user_rejected: t('sign.errors.same_user_rejected'),
        invalid_state: t('sign.errors.invalid_state'),
        cleaning_incomplete: t('sign.errors.cleaning_incomplete'),
        esign_failed: t('sign.errors.esign_failed'),
        generic: t('sign.errors.generic'),
      },
    },
  };
}
