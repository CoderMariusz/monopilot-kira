/**
 * Item wizard labels — PLAIN module (NO 'use client').
 *
 * Lives outside the wizard component on purpose: the items list + detail
 * pages dereference DEFAULT_WIZARD_LABELS server-side, and importing a
 * non-component export from a 'use client' module turns it into a client
 * reference proxy under the Vercel turbopack build (live crash digests
 * 2219404667 / 1606090766 — local builds and jsdom tests never catch it).
 */
import { CANONICAL_UOMS, type ItemsActionError, type ItemType, type OutputUom } from '../_actions/shared';

export type ItemWizardLabels = {
  title: string;
  subtitle: string;
  cancel: string;
  back: string;
  next: string;
  create: string;
  creating: string;
  steps: { basic: string; classification: string; weight: string; review: string };
  fields: {
    itemCode: string;
    itemCodeHelp: string;
    name: string;
    description: string;
    itemType: string;
    status: string;
    uomBase: string;
    uomSecondary: string;
    productGroup: string;
    weightMode: string;
    nominalWeight: string;
    tareWeight: string;
    grossWeightMax: string;
    gs1Gtin: string;
    varianceTolerance: string;
    shelfLifeDays: string;
    shelfLifeMode: string;
    // Pack hierarchy / output unit.
    packaging: string;
    outputUom: string;
    netQtyPerEach: string;
    eachPerBox: string;
    boxesPerPallet: string;
    listPriceGbp: string;
  };
  /** Localized labels for the item-type select (rm/ingredient/…/co_product/byproduct/packaging). */
  typeLabels: Record<ItemType, string>;
  /** Localized labels for the canonical base-UoM list (kg/g/l/ml/szt). */
  uomLabels: Record<(typeof CANONICAL_UOMS)[number], string>;
  /** Empty-option label for the optional secondary UoM select. */
  uomNone: string;
  /** Localized labels for the output-unit select (base/each/box). */
  outputUomLabels: Record<OutputUom, string>;
  /** Section sub-help under the packaging block. */
  packagingHelp: string;
  catchHint: string;
  /** Wizard-only helper shown under the "Intermediate" item type — "= WIP (work in progress)". */
  intermediateHint: string;
  review: { ready: string; packaging: string };
  errors: {
    codeRequired: string;
    nameRequired: string;
    uomRequired: string;
    netRequired: string;
    eachPerBoxRequired: string;
  };
  actionErrors: Record<ItemsActionError, string>;
};

export const DEFAULT_WIZARD_LABELS: ItemWizardLabels = {
  title: 'Create item',
  subtitle: 'Universal item master — links to BOM, spec and allergen matrix.',
  cancel: 'Cancel',
  back: 'Back',
  next: 'Next',
  create: 'Create item',
  creating: 'Creating…',
  steps: { basic: 'Basic info', classification: 'Classification', weight: 'Weight & shelf life', review: 'Review & create' },
  fields: {
    itemCode: 'Item code',
    itemCodeHelp: 'Alphanumeric with . _ - separators. Unique per organization.',
    name: 'Name',
    description: 'Short description',
    itemType: 'Item type',
    status: 'Status',
    uomBase: 'Base UoM',
    uomSecondary: 'Secondary UoM',
    productGroup: 'Product group',
    weightMode: 'Weight mode',
    nominalWeight: 'Nominal weight',
    tareWeight: 'Tare weight',
    grossWeightMax: 'Gross weight max',
    gs1Gtin: 'GS1 GTIN',
    varianceTolerance: 'Variance tolerance (%)',
    shelfLifeDays: 'Shelf life (days)',
    shelfLifeMode: 'Shelf-life mode',
    packaging: 'Packaging / output unit',
    outputUom: 'Output unit',
    netQtyPerEach: 'Net content per each',
    eachPerBox: 'Each per box',
    boxesPerPallet: 'Boxes per pallet',
    listPriceGbp: 'List price',
  },
  typeLabels: {
    rm: 'Raw material',
    ingredient: 'Ingredient',
    intermediate: 'Intermediate',
    fg: 'Finished good',
    co_product: 'Co-product',
    byproduct: 'By-product',
    packaging: 'Packaging',
  },
  uomLabels: {
    kg: 'kg',
    g: 'g',
    l: 'l',
    ml: 'ml',
    szt: 'pcs (each)',
  },
  uomNone: '—',
  outputUomLabels: {
    base: 'Base unit',
    each: 'Each (piece)',
    box: 'Box',
  },
  packagingHelp: 'How Planning orders WOs and production registers output for this item.',
  catchHint: 'Catch weight requires nominal weight, gross weight max and a variance tolerance.',
  intermediateHint: '= WIP (work in progress)',
  review: { ready: 'Ready to create. An audit record will be logged.', packaging: 'Pack hierarchy' },
  errors: {
    codeRequired: 'Item code is required (min 1 char).',
    nameRequired: 'Name is required (min 1 char).',
    uomRequired: 'Base UoM is required.',
    netRequired: 'Net content per each is required (> 0) for Each / Box output.',
    eachPerBoxRequired: 'Each per box is required (> 0) for Box output.',
  },
  actionErrors: {
    already_exists: 'An item with that code already exists in this organization.',
    forbidden: 'You do not have permission to perform this action.',
    invalid_input: 'Please check the values and try again.',
    not_found: 'That item no longer exists.',
    persistence_failed: 'Could not save. Please try again.',
  },
};

/** Structural translator shape — avoids importing next-intl/server here (this
 *  module is shared with the client wizard). */
type WizardTranslator = {
  (key: string, values?: Record<string, string | number | Date>): string;
  has(key: string): boolean;
};

/**
 * Resolves the wizard label bundle from the `technical.items` namespace,
 * falling back to DEFAULT_WIZARD_LABELS for keys not yet in the live catalog
 * (the UOM pack-hierarchy keys are merged from _meta/i18n-staging/item-uom.json).
 */
export function buildWizardLabels(t: WizardTranslator): ItemWizardLabels {
  const D = DEFAULT_WIZARD_LABELS;
  const has = (key: string) => {
    try {
      return t.has(key);
    } catch {
      return false;
    }
  };
  const get = (key: string, fallback: string) => (has(key) ? t(key) : fallback);

  return {
    title: t('create.title'),
    subtitle: t('create.subtitle'),
    cancel: t('create.cancel'),
    back: t('create.back'),
    next: t('create.next'),
    create: t('create.create'),
    creating: t('create.creating'),
    steps: {
      basic: t('create.steps.basic'),
      classification: t('create.steps.classification'),
      weight: t('create.steps.weight'),
      review: t('create.steps.review'),
    },
    fields: {
      itemCode: t('create.fields.itemCode'),
      itemCodeHelp: t('create.fields.itemCodeHelp'),
      name: t('create.fields.name'),
      description: t('create.fields.description'),
      itemType: t('create.fields.itemType'),
      status: t('create.fields.status'),
      uomBase: t('create.fields.uomBase'),
      uomSecondary: t('create.fields.uomSecondary'),
      productGroup: t('create.fields.productGroup'),
      weightMode: t('create.fields.weightMode'),
      nominalWeight: t('create.fields.nominalWeight'),
      tareWeight: t('create.fields.tareWeight'),
      grossWeightMax: t('create.fields.grossWeightMax'),
      gs1Gtin: t('create.fields.gs1Gtin'),
      varianceTolerance: t('create.fields.varianceTolerance'),
      shelfLifeDays: t('create.fields.shelfLifeDays'),
      shelfLifeMode: t('create.fields.shelfLifeMode'),
      packaging: get('create.fields.packaging', D.fields.packaging),
      outputUom: get('create.fields.outputUom', D.fields.outputUom),
      netQtyPerEach: get('create.fields.netQtyPerEach', D.fields.netQtyPerEach),
      eachPerBox: get('create.fields.eachPerBox', D.fields.eachPerBox),
      boxesPerPallet: get('create.fields.boxesPerPallet', D.fields.boxesPerPallet),
      listPriceGbp: get('create.fields.listPriceGbp', D.fields.listPriceGbp),
    },
    typeLabels: {
      rm: get('create.typeLabels.rm', D.typeLabels.rm),
      ingredient: get('create.typeLabels.ingredient', D.typeLabels.ingredient),
      intermediate: get('create.typeLabels.intermediate', D.typeLabels.intermediate),
      fg: get('create.typeLabels.fg', D.typeLabels.fg),
      co_product: get('create.typeLabels.co_product', D.typeLabels.co_product),
      byproduct: get('create.typeLabels.byproduct', D.typeLabels.byproduct),
      packaging: get('create.typeLabels.packaging', D.typeLabels.packaging),
    },
    uomLabels: {
      kg: get('create.uomLabels.kg', D.uomLabels.kg),
      g: get('create.uomLabels.g', D.uomLabels.g),
      l: get('create.uomLabels.l', D.uomLabels.l),
      ml: get('create.uomLabels.ml', D.uomLabels.ml),
      szt: get('create.uomLabels.szt', D.uomLabels.szt),
    },
    uomNone: get('create.uomNone', D.uomNone),
    outputUomLabels: {
      base: get('create.outputUomLabels.base', D.outputUomLabels.base),
      each: get('create.outputUomLabels.each', D.outputUomLabels.each),
      box: get('create.outputUomLabels.box', D.outputUomLabels.box),
    },
    packagingHelp: get('create.packagingHelp', D.packagingHelp),
    catchHint: t('create.catchHint'),
    intermediateHint: t('create.intermediateHint'),
    review: {
      ready: t('create.review.ready'),
      packaging: get('create.review.packaging', D.review.packaging),
    },
    errors: {
      codeRequired: t('create.errors.codeRequired'),
      nameRequired: t('create.errors.nameRequired'),
      uomRequired: t('create.errors.uomRequired'),
      netRequired: get('create.errors.netRequired', D.errors.netRequired),
      eachPerBoxRequired: get('create.errors.eachPerBoxRequired', D.errors.eachPerBoxRequired),
    },
    actionErrors: {
      already_exists: t('errors.already_exists'),
      forbidden: t('errors.forbidden'),
      invalid_input: t('errors.invalid_input'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };
}
