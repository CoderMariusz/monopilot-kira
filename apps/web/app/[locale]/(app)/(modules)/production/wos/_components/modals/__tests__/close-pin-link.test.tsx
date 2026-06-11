/**
 * W9-L7 — CloseModal PIN-wall escape hatch: the credential label is honest
 * ("E-sign PIN or account password" — signEvent accepts the PIN, or the login
 * password while no PIN is enrolled) and a "No PIN? Set it in Settings →"
 * link routes to the new /account/pin management screen. Copy/link only —
 * the e-sign verification logic is untouched.
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CloseModal } from '../action-modals';
import type { WoModalLabels } from '../types';

const LABELS: WoModalLabels = {
  cancel: 'Cancel',
  confirm: 'Confirm',
  submitting: 'Submitting…',
  errorFallback: 'The action could not be completed.',
  errors: {},
  start: { title: 'Start', subtitle: 's', line: 'Line', shift: 'Shift', optional: 'optional' },
  pause: { title: 'Pause', subtitle: 's', reason: 'r', reasonPlaceholder: 'p', line: 'Line', shift: 'Shift', notes: 'n', noCategories: 'none' },
  resume: { title: 'Resume', subtitle: 's', duration: 'd', durationHint: 'h' },
  cancelWo: { title: 'Cancel WO', subtitle: 's', reasonCode: 'rc', notes: 'n' },
  complete: { title: 'Complete', subtitle: 's', override: 'o', overrideHint: 'h' },
  close: {
    title: 'Close work order',
    subtitle: 'Financial close with supervisor e-signature.',
    password: 'E-sign PIN or account password',
    reason: 'Reason',
    legal: 'By confirming you electronically sign this financial close (CFR-21 Part 11).',
    pinHint: 'No PIN? Set it in Settings →',
  },
  output: { title: 'Output', subtitle: 's', type: 't', types: { primary: 'P', co_product: 'C', by_product: 'B' }, product: 'p', qty: 'q', batch: 'b', batchHint: 'h' },
  waste: { title: 'Waste', subtitle: 's', category: 'c', categoryPlaceholder: 'p', qty: 'q', shift: 'sh', reasonCode: 'rc', notes: 'n', noCategories: 'none' },
};

const BASE = {
  open: true,
  woId: '11111111-1111-1111-1111-111111111111',
  labels: LABELS,
  run: vi.fn(),
  onClose: vi.fn(),
  signerUserId: '22222222-2222-4222-8222-222222222222',
};

describe('CloseModal PIN copy + settings link (W9-L7)', () => {
  it('labels the credential field "E-sign PIN or account password"', () => {
    render(<CloseModal {...BASE} />);

    expect(screen.getByText('E-sign PIN or account password')).toBeInTheDocument();
  });

  it('links "No PIN? Set it in Settings →" to /account/pin', () => {
    render(<CloseModal {...BASE} />);

    const link = screen.getByTestId('wo-close-pin-link');
    expect(link).toHaveTextContent('No PIN? Set it in Settings →');
    expect(link).toHaveAttribute('href', '/account/pin');
  });

  it('omits the link gracefully for older label bundles without pinHint', () => {
    const labels = { ...LABELS, close: { ...LABELS.close, pinHint: undefined } };
    render(<CloseModal {...BASE} labels={labels} />);

    expect(screen.queryByTestId('wo-close-pin-link')).not.toBeInTheDocument();
  });
});
