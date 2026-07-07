import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WIZARD_LABELS,
  buildWizardLabels,
  formatItemActionError,
  formatSupplierSpecWarning,
} from '../item-wizard-labels';

const passthroughT = Object.assign((key: string) => key, { has: () => false });

describe('item wizard labels', () => {
  it('formatItemActionError names the item code on already_exists', () => {
    const msg = formatItemActionError(DEFAULT_WIZARD_LABELS, 'already_exists', { itemCode: 'RM-42' });
    expect(msg).toContain('RM-42');
    expect(msg).toContain('earlier attempt');
  });

  it('formatItemActionError falls back to generic already_exists without a code', () => {
    expect(formatItemActionError(DEFAULT_WIZARD_LABELS, 'already_exists')).toBe(
      DEFAULT_WIZARD_LABELS.actionErrorsGeneric.already_exists,
    );
  });

  it('formatSupplierSpecWarning returns the static supplier-spec warning', () => {
    expect(formatSupplierSpecWarning(DEFAULT_WIZARD_LABELS)).toBe(
      'Item created but supplier price NOT saved.',
    );
  });

  it('built labels work with the pure formatters', () => {
    const labels = buildWizardLabels(passthroughT);
    expect(formatItemActionError(labels, 'already_exists', { itemCode: 'FG-1' })).toContain('FG-1');
    expect(formatSupplierSpecWarning(labels)).toBe(DEFAULT_WIZARD_LABELS.warnings.supplierSpecNotSaved);
  });

  it('label bundles are RSC-serializable (no function values anywhere)', () => {
    // Regression for prod digest 3501436087: the labels object crosses the
    // server→client boundary on /technical/items; a function field crashes
    // the whole page ("Functions cannot be passed directly to Client Components").
    const assertNoFunctions = (value: unknown, path: string): void => {
      expect(typeof value, path).not.toBe('function');
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) assertNoFunctions(v, `${path}.${k}`);
      }
    };
    assertNoFunctions(DEFAULT_WIZARD_LABELS, 'DEFAULT_WIZARD_LABELS');
    assertNoFunctions(buildWizardLabels(passthroughT), 'buildWizardLabels');
  });
});
