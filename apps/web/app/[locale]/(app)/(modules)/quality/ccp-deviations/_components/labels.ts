/**
 * Wave E3 — CCP Deviations register: label builders.
 *
 * Resolves the LIVE next-intl `quality.ccpDeviations` namespace
 * (apps/web/i18n/{en,pl,ro,uk}.json — real en + pl, ro/uk mirror EN per the
 * locale lesson) into the typed label objects the list + resolve client islands
 * consume. Lesson F-D08a: keys live in the live catalogs, NOT a staging bundle.
 *
 * A `Translator` is any `(key, values?) => string` — both next-intl's
 * `getTranslations('quality.ccpDeviations')` (RSC) and a vi.fn-backed test
 * translator satisfy it, so the RSC page and the RTL tests assert the same
 * resolved strings.
 */
import type { DeviationStatus, DeviationStatusFilter } from './ccp-deviations-contracts';
import { DEVIATION_STATUS_FILTERS } from './ccp-deviations-contracts';

export type Translator = (key: string, values?: Record<string, string | number>) => string;

const STATUSES: DeviationStatus[] = ['open', 'resolved'];

export type DeviationListLabels = {
  filterLabel: string;
  filter: Record<DeviationStatusFilter, string>;
  rowsLabel: string;
  resolveAction: string;
  resolveDisabled: string;
  noHold: string;
  noReading: string;
  emptyFiltered: string;
  status: Record<DeviationStatus, string>;
  columns: {
    ccp: string;
    reading: string;
    status: string;
    hold: string;
    openedAt: string;
    actions: string;
  };
};

export type DeviationEmptyLabels = {
  title: string;
  body: string;
  cta: string;
};

export type DeviationDeniedLabels = { title: string; body: string };
export type DeviationErrorLabels = { title: string; body: string };

export type DeviationResolveLabels = {
  title: string;
  subtitle: string;
  reading: string;
  actionTaken: string;
  actionTakenHelp: string;
  actionTakenPlaceholder: string;
  disposition: string;
  dispositionHelp: string;
  dispositionPlaceholder: string;
  esign: { title: string; meaning: string; password: string; passwordHelp: string; passwordPlaceholder: string };
  cancel: string;
  submit: string;
  submitting: string;
  formIncomplete: string;
  validation: { actionRequired: string; dispositionRequired: string; passwordRequired: string };
  error: string;
  success: string;
};

export function buildDeviationListLabels(t: Translator): DeviationListLabels {
  return {
    filterLabel: t('filter.label'),
    filter: Object.fromEntries(
      DEVIATION_STATUS_FILTERS.map((f) => [f, t(`filter.${f}`)]),
    ) as Record<DeviationStatusFilter, string>,
    rowsLabel: t('rowsLabel'),
    resolveAction: t('resolveAction'),
    resolveDisabled: t('resolveDisabled'),
    noHold: t('noHold'),
    noReading: t('noReading'),
    emptyFiltered: t('emptyFiltered'),
    status: Object.fromEntries(STATUSES.map((s) => [s, t(`status.${s}`)])) as Record<DeviationStatus, string>,
    columns: {
      ccp: t('columns.ccp'),
      reading: t('columns.reading'),
      status: t('columns.status'),
      hold: t('columns.hold'),
      openedAt: t('columns.openedAt'),
      actions: t('columns.actions'),
    },
  };
}

export function buildDeviationEmptyLabels(t: Translator): DeviationEmptyLabels {
  return { title: t('empty.title'), body: t('empty.body'), cta: t('empty.cta') };
}

export function buildDeviationDeniedLabels(t: Translator): DeviationDeniedLabels {
  return { title: t('denied.title'), body: t('denied.body') };
}

export function buildDeviationErrorLabels(t: Translator): DeviationErrorLabels {
  return { title: t('error.title'), body: t('error.body') };
}

export function buildDeviationResolveLabels(t: Translator): DeviationResolveLabels {
  return {
    title: t('resolveModal.title'),
    subtitle: t('resolveModal.subtitle'),
    reading: t('resolveModal.reading'),
    actionTaken: t('resolveModal.actionTaken'),
    actionTakenHelp: t('resolveModal.actionTakenHelp'),
    actionTakenPlaceholder: t('resolveModal.actionTakenPlaceholder'),
    disposition: t('resolveModal.disposition'),
    dispositionHelp: t('resolveModal.dispositionHelp'),
    dispositionPlaceholder: t('resolveModal.dispositionPlaceholder'),
    esign: {
      title: t('resolveModal.esign.title'),
      meaning: t('resolveModal.esign.meaning'),
      password: t('resolveModal.esign.password'),
      passwordHelp: t('resolveModal.esign.passwordHelp'),
      passwordPlaceholder: t('resolveModal.esign.passwordPlaceholder'),
    },
    cancel: t('resolveModal.cancel'),
    submit: t('resolveModal.submit'),
    submitting: t('resolveModal.submitting'),
    formIncomplete: t('resolveModal.formIncomplete'),
    validation: {
      actionRequired: t('resolveModal.validation.actionRequired'),
      dispositionRequired: t('resolveModal.validation.dispositionRequired'),
      passwordRequired: t('resolveModal.validation.passwordRequired'),
    },
    error: t('resolveModal.error'),
    success: t('resolveModal.success'),
  };
}
