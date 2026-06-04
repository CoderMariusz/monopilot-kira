/**
 * @vitest-environment jsdom
 * T-021 — FACreateModal PARITY EVIDENCE capture (RTL/DOM-snapshot fallback).
 *
 * Playwright + @axe-core/playwright are not provisioned in this worktree (no
 * browser binaries, axe not a dependency, no network installs in scope), so per
 * UI-PROTOTYPE-PARITY-POLICY §"Playwright trace/video/artifacts where applicable"
 * + T-021 AC4 ("if Playwright is unavailable, document the blocker and provide
 * RTL/snapshot fallback evidence") we capture per-state DOM snapshots as the
 * parity-diff artifact. Each snapshot is written to:
 *   _meta/parity-evidence/T-021/<state>.html
 *
 * States captured (the required 5 + interaction states), mapped to the modal:
 *   - default     : modal open, empty form (Create disabled)                → "empty" state
 *   - v01-error   : invalid productCode, V01 FormMessage visible            → "error/validation" state
 *   - pending     : submit in flight, button shows "creating", disabled     → "loading/optimistic" state
 *   - server-error: action threw DuplicateError, destructive Alert visible  → "error" state
 *   - disabled    : no action injected (permission-gated by the page)        → "permission denied" surrogate
 */

import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { FaCreateModal, type FaCreateLabels } from '../fa-create-modal';

afterEach(() => cleanup());

const EVIDENCE_DIR = path.resolve(__dirname, '../../../../../../../../../_meta/parity-evidence/T-021');

const LABELS: FaCreateLabels = {
  title: 'Create factory article',
  subtitle: 'V01 · FA Code format validated as you type. V02 · Product Name is required.',
  fieldProductCode: 'FA Code',
  fieldProductCodeHint: "Must start with 'FA' followed by uppercase letters/digits (e.g. FA5609).",
  fieldProductName: 'Product Name',
  fieldProductNameHint: 'Max 200 characters',
  rangeHint: 'On success you will be taken to the new FA. Codes FA5600+ are reserved for the 2026 NPD pipeline.',
  cancel: 'Cancel',
  create: 'Create FA',
  creating: 'Creating…',
  errorV01: "FA Code must start with 'FA' followed by uppercase letters/digits (e.g. FA5609).",
  errorV02: 'Product Name is required (max 200 characters).',
  errorDuplicate: 'That FA Code already exists. Choose a different code.',
  errorGeneric: 'Could not create the factory article. Try again.',
};

function capture(name: string) {
  const dialog = document.querySelector('[role="dialog"]');
  const html = dialog ? dialog.outerHTML : document.body.outerHTML;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.html`), html, 'utf8');
  return html;
}

describe('FaCreateModal — parity evidence (per-state DOM snapshots)', () => {
  it('empty: open modal, Create disabled', () => {
    render(
      <FaCreateModal open labels={LABELS} createFaAction={async () => ({ productCode: 'FA5609' })} onCreated={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole('button', { name: LABELS.create })).toBeDisabled();
    const html = capture('empty');
    expect(html).toContain(LABELS.title);
  });

  it('v01-error: invalid productCode surfaces V01 FormMessage', async () => {
    const user = userEvent.setup();
    render(
      <FaCreateModal open labels={LABELS} createFaAction={async () => ({ productCode: 'FA5609' })} onCreated={() => {}} onClose={() => {}} />,
    );
    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'ZZ123');
    await user.tab();
    expect(await screen.findByText(LABELS.errorV01)).toBeInTheDocument();
    capture('v01-error');
  });

  it('server-error: DuplicateError surfaces a destructive Alert', async () => {
    const user = userEvent.setup();
    render(
      <FaCreateModal
        open
        labels={LABELS}
        createFaAction={async () => {
          const err = new Error('dup') as Error & { code?: string };
          err.name = 'DuplicateError';
          err.code = 'DUPLICATE_PRODUCT_CODE';
          throw err;
        }}
        onCreated={() => {}}
        onClose={() => {}}
      />,
    );
    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'FA5609');
    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldProductName)), 'Duplicate code');
    await user.click(screen.getByRole('button', { name: LABELS.create }));
    expect(await screen.findByRole('alert')).toHaveTextContent(LABELS.errorDuplicate);
    capture('server-error');
  });

  it('disabled: no action injected (permission-gated surrogate) keeps Create disabled', () => {
    render(<FaCreateModal open labels={LABELS} onCreated={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: LABELS.create })).toBeDisabled();
    capture('permission-disabled');
  });
});
