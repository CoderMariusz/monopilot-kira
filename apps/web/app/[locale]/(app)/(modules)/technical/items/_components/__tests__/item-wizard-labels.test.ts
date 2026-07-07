import { describe, expect, it } from 'vitest';

import { DEFAULT_WIZARD_LABELS, buildWizardLabels } from '../item-wizard-labels';

describe('item wizard labels', () => {
  it('formatActionError names the item code on already_exists', () => {
    const msg = DEFAULT_WIZARD_LABELS.formatActionError('already_exists', { itemCode: 'RM-42' });
    expect(msg).toContain('RM-42');
    expect(msg).toContain('earlier attempt');
  });

  it('formatActionError falls back to generic already_exists without a code', () => {
    expect(DEFAULT_WIZARD_LABELS.formatActionError('already_exists')).toBe(
      DEFAULT_WIZARD_LABELS.actionErrorsGeneric.already_exists,
    );
  });

  it('formatSupplierSpecWarning returns the static supplier-spec warning', () => {
    expect(DEFAULT_WIZARD_LABELS.formatSupplierSpecWarning()).toBe(
      'Item created but supplier price NOT saved.',
    );
  });

  it('buildWizardLabels exposes the same formatter hooks', () => {
    const labels = buildWizardLabels((key) => key);
    expect(labels.formatActionError('already_exists', { itemCode: 'FG-1' })).toContain('FG-1');
    expect(labels.formatSupplierSpecWarning()).toBe(DEFAULT_WIZARD_LABELS.warnings.supplierSpecNotSaved);
  });
});
