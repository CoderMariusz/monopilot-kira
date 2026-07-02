/**
 * Wave-shipping — Customer label builder.
 *
 * The real i18n keys for this screen live in the shared base bundle
 * apps/web/i18n/<locale>.json under Shipping.customers.* (en + pl real, ro/uk
 * mirror en per the repo's two-real-locale policy). This builder turns a
 * next-intl-style translate function (t) into the flat label bag the client
 * view + modal consume, so the RTL tests can exercise it with a tiny tree-backed
 * translator without importing the RSC page's 'use server' action chain.
 */
import type { CustomerListLabels } from './customer-list-view';

/** Minimal translate function shape: t('a.b.c') → string. Matches next-intl's `t`. */
export type Translate = (key: string) => string;

export function buildCustomerListLabels(t: Translate): CustomerListLabels {
  const category = {
    retail: t('category.retail'),
    wholesale: t('category.wholesale'),
    distributor: t('category.distributor'),
  };
  return {
    newCustomer: t('list.newCustomer'),
    searchPlaceholder: t('list.searchPlaceholder'),
    rowsCount: t('list.rowsCount'),
    showing: t('list.showing'),
    tabs: {
      all: t('list.tabs.all'),
      active: t('list.tabs.active'),
      inactive: t('list.tabs.inactive'),
    },
    status: {
      active: t('status.active'),
      inactive: t('status.inactive'),
    },
    category,
    columns: {
      name: t('list.columns.name'),
      code: t('list.columns.code'),
      category: t('list.columns.category'),
      creditLimit: t('list.columns.creditLimit'),
      email: t('list.columns.email'),
      addressCount: t('list.columns.addressCount'),
      status: t('list.columns.status'),
      actions: t('list.columns.actions'),
    },
    view: t('list.view'),
    noLimit: t('list.noLimit'),
    empty: {
      title: t('list.empty.title'),
      body: t('list.empty.body'),
      clear: t('list.empty.clear'),
    },
    kpis: {
      total: t('kpis.total'),
      totalSub: t('kpis.totalSub'),
      active: t('kpis.active'),
      activeSub: t('kpis.activeSub'),
      inactive: t('kpis.inactive'),
      inactiveSub: t('kpis.inactiveSub'),
      withCredit: t('kpis.withCredit'),
      withCreditSub: t('kpis.withCreditSub'),
    },
    create: {
      title: t('create.title'),
      subtitle: t('create.subtitle'),
      codeLabel: t('create.codeLabel'),
      codeHelp: t('create.codeHelp'),
      codePlaceholder: t('create.codePlaceholder'),
      categoryLabel: t('create.categoryLabel'),
      categoryOptions: category,
      nameLabel: t('create.nameLabel'),
      namePlaceholder: t('create.namePlaceholder'),
      emailLabel: t('create.emailLabel'),
      emailPlaceholder: t('create.emailPlaceholder'),
      phoneLabel: t('create.phoneLabel'),
      phonePlaceholder: t('create.phonePlaceholder'),
      taxIdLabel: t('create.taxIdLabel'),
      taxIdPlaceholder: t('create.taxIdPlaceholder'),
      creditLimitLabel: t('create.creditLimitLabel'),
      creditLimitHelp: t('create.creditLimitHelp'),
      creditLimitPlaceholder: t('create.creditLimitPlaceholder'),
      activeLabel: t('create.activeLabel'),
      activeHelp: t('create.activeHelp'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      errors: {
        nameRequired: t('create.errors.nameRequired'),
        emailInvalid: t('create.errors.emailInvalid'),
        creditLimitInvalid: t('create.errors.creditLimitInvalid'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        not_found: t('errors.not_found'),
        already_exists: t('errors.already_exists'),
        address_in_use: t('errors.address_in_use'),
        persistence_failed: t('errors.persistence_failed'),
      },
    },
  };
}
