/**
 * P2-PLANNING — Supplier label resolver.
 *
 * The real i18n keys for this screen live in the staging file
 * `_meta/i18n-staging/suppliers.json` (Planning.suppliers.*). They are NOT yet
 * merged into apps/web/i18n/*.json — that merge is a separate, single-owner step
 * (this lane must not edit the shared i18n files). To keep the route renderable +
 * testable today, this helper resolves the Planning.suppliers namespace from
 * next-intl when present, and otherwise falls back to the staged en/pl tree
 * (ro/uk mirror en, matching the repo's two-real-locale policy).
 *
 * Once the staging keys are merged, `getTranslations('Planning.suppliers')` will
 * return the identical strings and this fallback becomes a no-op.
 */
import staging from '../../../../../../../../../_meta/i18n-staging/suppliers.json';

import type { SupplierListLabels } from './supplier-list-view';
import type { SupplierDetailLabels } from './supplier-detail-view';

type Tree = Record<string, unknown>;

const STAGED = staging as {
  en: { Planning: { suppliers: Tree } };
  pl: { Planning: { suppliers: Tree } };
};

export type SupplierMessages = ReturnType<typeof resolveSupplierMessages>;

function pickLocale(locale: string): Tree {
  // en/pl are real; ro/uk mirror en per the repo's two-locale policy.
  const lc = locale === 'pl' ? 'pl' : 'en';
  return STAGED[lc].Planning.suppliers;
}

/**
 * Returns the Planning.suppliers message subtree for the given locale, preferring
 * the next-intl messages (when the namespace has been merged) and otherwise the
 * staged tree. `intlMessages` is the resolved Planning.suppliers node from
 * next-intl (or undefined if not present yet).
 */
export function resolveSupplierMessages(locale: string, intlMessages: Tree | undefined): Tree {
  if (intlMessages && Object.keys(intlMessages).length > 0) return intlMessages;
  return pickLocale(locale);
}

/** Narrow helper: read a dotted path from a message tree with a literal fallback. */
export function msg(tree: Tree, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => (acc != null && typeof acc === 'object' ? (acc as Tree)[key] : undefined), tree);
  return typeof value === 'string' ? value : path;
}

/**
 * Build the list-screen label bag from a Planning.suppliers message tree.
 * Kept here (not in page.tsx) so the RTL tests can exercise it without importing
 * the RSC page's 'use server' action chain into the jsdom bundle.
 */
export function buildListLabels(m: Tree): SupplierListLabels {
  const statusOptions = {
    active: msg(m, 'status.active'),
    inactive: msg(m, 'status.inactive'),
    blocked: msg(m, 'status.blocked'),
  };
  return {
    newSupplier: msg(m, 'actions.newSupplier'),
    searchPlaceholder: msg(m, 'list.searchPlaceholder'),
    rowsCount: msg(m, 'list.rowsCount'),
    showing: msg(m, 'list.showing'),
    days: msg(m, 'kpis.days'),
    tabs: {
      all: msg(m, 'list.tabs.all'),
      active: msg(m, 'list.tabs.active'),
      inactive: msg(m, 'list.tabs.inactive'),
      blocked: msg(m, 'list.tabs.blocked'),
    },
    status: statusOptions,
    columns: {
      code: msg(m, 'list.columns.code'),
      name: msg(m, 'list.columns.name'),
      contact: msg(m, 'list.columns.contact'),
      currency: msg(m, 'list.columns.currency'),
      leadTime: msg(m, 'list.columns.leadTime'),
      status: msg(m, 'list.columns.status'),
      actions: msg(m, 'list.columns.actions'),
    },
    view: msg(m, 'list.view'),
    empty: {
      title: msg(m, 'list.empty.title'),
      body: msg(m, 'list.empty.body'),
      clear: msg(m, 'list.empty.clear'),
    },
    kpis: {
      active: msg(m, 'kpis.active'),
      activeSub: msg(m, 'kpis.activeSub'),
      inactive: msg(m, 'kpis.inactive'),
      inactiveSub: msg(m, 'kpis.inactiveSub'),
      blocked: msg(m, 'kpis.blocked'),
      blockedSub: msg(m, 'kpis.blockedSub'),
      avgLeadTime: msg(m, 'kpis.avgLeadTime'),
      avgLeadTimeSub: msg(m, 'kpis.avgLeadTimeSub'),
    },
    create: {
      title: msg(m, 'create.title'),
      subtitle: msg(m, 'create.subtitle'),
      codeLabel: msg(m, 'create.codeLabel'),
      codePlaceholder: msg(m, 'create.codePlaceholder'),
      nameLabel: msg(m, 'create.nameLabel'),
      namePlaceholder: msg(m, 'create.namePlaceholder'),
      currencyLabel: msg(m, 'create.currencyLabel'),
      leadTimeLabel: msg(m, 'create.leadTimeLabel'),
      leadTimePlaceholder: msg(m, 'create.leadTimePlaceholder'),
      statusLabel: msg(m, 'create.statusLabel'),
      statusOptions,
      emailLabel: msg(m, 'create.emailLabel'),
      emailPlaceholder: msg(m, 'create.emailPlaceholder'),
      phoneLabel: msg(m, 'create.phoneLabel'),
      phonePlaceholder: msg(m, 'create.phonePlaceholder'),
      countryLabel: msg(m, 'create.countryLabel'),
      countryPlaceholder: msg(m, 'create.countryPlaceholder'),
      notesLabel: msg(m, 'create.notesLabel'),
      notesPlaceholder: msg(m, 'create.notesPlaceholder'),
      submit: msg(m, 'create.submit'),
      submitting: msg(m, 'create.submitting'),
      cancel: msg(m, 'create.cancel'),
      errors: {
        codeRequired: msg(m, 'create.errors.codeRequired'),
        nameRequired: msg(m, 'create.errors.nameRequired'),
        currencyRequired: msg(m, 'create.errors.currencyRequired'),
        leadTimeRange: msg(m, 'create.errors.leadTimeRange'),
        emailInvalid: msg(m, 'create.errors.emailInvalid'),
        countryInvalid: msg(m, 'create.errors.countryInvalid'),
        invalid_input: msg(m, 'errors.invalid_input'),
        forbidden: msg(m, 'errors.forbidden'),
        not_found: msg(m, 'errors.not_found'),
        already_exists: msg(m, 'errors.already_exists'),
        invalid_state: msg(m, 'errors.invalid_state'),
        persistence_failed: msg(m, 'errors.persistence_failed'),
      },
    },
  };
}

/** Build the detail-screen label bag from a Planning.suppliers message tree. */
export function buildDetailLabels(m: Tree): SupplierDetailLabels {
  return {
    edit: msg(m, 'detail.edit'),
    status: {
      active: msg(m, 'status.active'),
      inactive: msg(m, 'status.inactive'),
      blocked: msg(m, 'status.blocked'),
    },
    info: {
      title: msg(m, 'detail.info.title'),
      code: msg(m, 'detail.info.code'),
      name: msg(m, 'detail.info.name'),
      currency: msg(m, 'detail.info.currency'),
      leadTime: msg(m, 'detail.info.leadTime'),
      status: msg(m, 'detail.info.status'),
      country: msg(m, 'detail.info.country'),
      email: msg(m, 'detail.info.email'),
      phone: msg(m, 'detail.info.phone'),
      paymentTerms: msg(m, 'detail.info.paymentTerms'),
      days: msg(m, 'detail.info.days'),
      none: msg(m, 'detail.info.none'),
    },
    notes: {
      title: msg(m, 'detail.notes.title'),
      empty: msg(m, 'detail.notes.empty'),
    },
    transitions: {
      title: msg(m, 'detail.transitions.title'),
      current: msg(m, 'detail.transitions.current'),
      activate: msg(m, 'detail.transitions.activate'),
      deactivate: msg(m, 'detail.transitions.deactivate'),
      block: msg(m, 'detail.transitions.block'),
      pending: msg(m, 'detail.transitions.pending'),
      hint: msg(m, 'detail.transitions.hint'),
      confirmDeactivate: msg(m, 'detail.transitions.confirmDeactivate'),
      confirmBlock: msg(m, 'detail.transitions.confirmBlock'),
      confirmActivate: msg(m, 'detail.transitions.confirmActivate'),
    },
    // Wave E9 — supplier scorecard deep link (falls back to the literal key if unstaged).
    scorecard: msg(m, 'detail.scorecard'),
    // Edit modal — mirrors the create modal's form fields + error keys; only the
    // chrome (title/subtitle/codeHint/submit) is edit-specific. `code` is read-only.
    edit_modal: {
      title: msg(m, 'edit.title'),
      subtitle: msg(m, 'edit.subtitle'),
      codeLabel: msg(m, 'create.codeLabel'),
      codeHint: msg(m, 'edit.codeHint'),
      nameLabel: msg(m, 'create.nameLabel'),
      namePlaceholder: msg(m, 'create.namePlaceholder'),
      currencyLabel: msg(m, 'create.currencyLabel'),
      leadTimeLabel: msg(m, 'create.leadTimeLabel'),
      leadTimePlaceholder: msg(m, 'create.leadTimePlaceholder'),
      emailLabel: msg(m, 'create.emailLabel'),
      emailPlaceholder: msg(m, 'create.emailPlaceholder'),
      phoneLabel: msg(m, 'create.phoneLabel'),
      phonePlaceholder: msg(m, 'create.phonePlaceholder'),
      countryLabel: msg(m, 'create.countryLabel'),
      countryPlaceholder: msg(m, 'create.countryPlaceholder'),
      notesLabel: msg(m, 'create.notesLabel'),
      notesPlaceholder: msg(m, 'create.notesPlaceholder'),
      submit: msg(m, 'edit.submit'),
      submitting: msg(m, 'edit.submitting'),
      cancel: msg(m, 'create.cancel'),
      errors: {
        nameRequired: msg(m, 'create.errors.nameRequired'),
        currencyRequired: msg(m, 'create.errors.currencyRequired'),
        leadTimeRange: msg(m, 'create.errors.leadTimeRange'),
        emailInvalid: msg(m, 'create.errors.emailInvalid'),
        countryInvalid: msg(m, 'create.errors.countryInvalid'),
        invalid_input: msg(m, 'errors.invalid_input'),
        forbidden: msg(m, 'errors.forbidden'),
        not_found: msg(m, 'errors.not_found'),
        already_exists: msg(m, 'errors.already_exists'),
        invalid_state: msg(m, 'errors.invalid_state'),
        persistence_failed: msg(m, 'errors.persistence_failed'),
      },
    },
    errors: {
      invalid_input: msg(m, 'errors.invalid_input'),
      forbidden: msg(m, 'errors.forbidden'),
      not_found: msg(m, 'errors.not_found'),
      already_exists: msg(m, 'errors.already_exists'),
      invalid_state: msg(m, 'errors.invalid_state'),
      persistence_failed: msg(m, 'errors.persistence_failed'),
    },
  };
}
