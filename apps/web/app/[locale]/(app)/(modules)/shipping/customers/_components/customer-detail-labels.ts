/**
 * Wave-shipping — Customer detail label builder.
 */
import type { CustomerAddressModalLabels } from './customer-address-modal';
import type { EditCustomerLabels } from './edit-customer-modal';
import type { CustomerDetailLabels } from './customer-detail-view';

export type Translate = (key: string) => string;

export function buildCustomerDetailLabels(t: Translate): CustomerDetailLabels {
  const category = {
    retail: t('category.retail'),
    wholesale: t('category.wholesale'),
    distributor: t('category.distributor'),
  };

  const edit: EditCustomerLabels = {
    title: t('detail.edit.title'),
    subtitle: t('detail.edit.subtitle'),
    codeLabel: t('create.codeLabel'),
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
    submit: t('detail.edit.submit'),
    submitting: t('detail.edit.submitting'),
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
  };

  const addressModal: CustomerAddressModalLabels = {
    createTitle: t('detail.addresses.modal.createTitle'),
    editTitle: t('detail.addresses.modal.editTitle'),
    subtitle: t('detail.addresses.modal.subtitle'),
    typeLabel: t('detail.addresses.modal.typeLabel'),
    typeOptions: {
      shipping: t('detail.addresses.type.shipping'),
      billing: t('detail.addresses.type.billing'),
    },
    defaultLabel: t('detail.addresses.modal.defaultLabel'),
    defaultHelp: t('detail.addresses.modal.defaultHelp'),
    line1Label: t('detail.addresses.modal.line1Label'),
    line1Placeholder: t('detail.addresses.modal.line1Placeholder'),
    line2Label: t('detail.addresses.modal.line2Label'),
    line2Placeholder: t('detail.addresses.modal.line2Placeholder'),
    cityLabel: t('detail.addresses.modal.cityLabel'),
    cityPlaceholder: t('detail.addresses.modal.cityPlaceholder'),
    stateLabel: t('detail.addresses.modal.stateLabel'),
    statePlaceholder: t('detail.addresses.modal.statePlaceholder'),
    postalLabel: t('detail.addresses.modal.postalLabel'),
    postalPlaceholder: t('detail.addresses.modal.postalPlaceholder'),
    countryLabel: t('detail.addresses.modal.countryLabel'),
    countryPlaceholder: t('detail.addresses.modal.countryPlaceholder'),
    notesLabel: t('detail.addresses.modal.notesLabel'),
    notesPlaceholder: t('detail.addresses.modal.notesPlaceholder'),
    submitCreate: t('detail.addresses.modal.submitCreate'),
    submitEdit: t('detail.addresses.modal.submitEdit'),
    submitting: t('detail.addresses.modal.submitting'),
    cancel: t('create.cancel'),
    errors: {
      line1Required: t('detail.addresses.modal.errors.line1Required'),
      cityRequired: t('detail.addresses.modal.errors.cityRequired'),
      postalRequired: t('detail.addresses.modal.errors.postalRequired'),
      countryInvalid: t('detail.addresses.modal.errors.countryInvalid'),
      invalid_input: t('errors.invalid_input'),
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };

  return {
    status: {
      active: t('status.active'),
      inactive: t('status.inactive'),
    },
    category,
    backToList: t('detail.backToList'),
    tabs: {
      profile: t('detail.tabs.profile'),
      addresses: t('detail.tabs.addresses'),
    },
    actions: {
      edit: t('detail.actions.edit'),
      deactivate: t('detail.actions.deactivate'),
      reactivate: t('detail.actions.reactivate'),
      pending: t('detail.actions.pending'),
    },
    profile: {
      identityTitle: t('detail.profile.identityTitle'),
      statsTitle: t('detail.profile.statsTitle'),
      fields: {
        code: t('detail.profile.fields.code'),
        name: t('detail.profile.fields.name'),
        category: t('detail.profile.fields.category'),
        email: t('detail.profile.fields.email'),
        phone: t('detail.profile.fields.phone'),
        taxId: t('detail.profile.fields.taxId'),
        creditLimit: t('detail.profile.fields.creditLimit'),
        active: t('detail.profile.fields.active'),
        createdAt: t('detail.profile.fields.createdAt'),
        updatedAt: t('detail.profile.fields.updatedAt'),
      },
      stats: {
        addressCount: t('detail.profile.stats.addressCount'),
        shippingAddressCount: t('detail.profile.stats.shippingAddressCount'),
      },
      noLimit: t('list.noLimit'),
      yes: t('detail.profile.yes'),
      no: t('detail.profile.no'),
    },
    addresses: {
      title: t('detail.addresses.title'),
      add: t('detail.addresses.add'),
      hint: t('detail.addresses.hint'),
      empty: t('detail.addresses.empty'),
      columns: {
        type: t('detail.addresses.columns.type'),
        default: t('detail.addresses.columns.default'),
        line1: t('detail.addresses.columns.line1'),
        city: t('detail.addresses.columns.city'),
        postal: t('detail.addresses.columns.postal'),
        country: t('detail.addresses.columns.country'),
        actions: t('detail.addresses.columns.actions'),
      },
      type: {
        shipping: t('detail.addresses.type.shipping'),
        billing: t('detail.addresses.type.billing'),
      },
      defaultStar: t('detail.addresses.defaultStar'),
      notDefault: t('detail.addresses.notDefault'),
      edit: t('detail.addresses.edit'),
      deactivate: t('detail.addresses.deactivate'),
      setDefault: t('detail.addresses.setDefault'),
      pending: t('detail.addresses.pending'),
      errors: {
        forbidden: t('errors.forbidden'),
        not_found: t('errors.not_found'),
        persistence_failed: t('errors.persistence_failed'),
      },
    },
    edit,
    addressModal,
  };
}
