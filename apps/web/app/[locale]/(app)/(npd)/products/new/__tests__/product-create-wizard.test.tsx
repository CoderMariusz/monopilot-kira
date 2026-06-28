/**
 * @vitest-environment jsdom
 *
 * Product create wizard (onboarding SET-004 entry) — returnTo flow test.
 *
 * Regression: the onboarding "first product" step linked to /products/new, which
 * had no route, so next-intl localized it to /{locale}/products/new and Next.js
 * 404'd — the user was dropped out of onboarding. This route now renders the real
 * FG-create wizard and, on success/cancel, returns to a SAFE `returnTo` path.
 *
 * Asserts:
 *  - the wizard renders the FG create modal open;
 *  - a successful create navigates back to the (sanitized) returnTo path;
 *  - cancel navigates back to returnTo;
 *  - an unsafe returnTo (open-redirect / protocol-relative) is ignored and the
 *    flow falls back to the locale FA route;
 *  - with no returnTo, a successful create lands on the new FG detail route.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

import { ProductCreateWizard } from '../product-create-wizard.client';
import type { FaCreateLabels } from '../../../fg/_components/fa-create-modal';

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

const LABELS: FaCreateLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  fieldProductCode: 'lbl.fieldProductCode',
  fieldProductCodeHint: 'lbl.fieldProductCodeHint',
  fieldProductName: 'lbl.fieldProductName',
  fieldProductNameHint: 'lbl.fieldProductNameHint',
  rangeHint: 'lbl.rangeHint',
  cancel: 'lbl.cancel',
  create: 'lbl.create',
  creating: 'lbl.creating',
  errorV01: 'lbl.errorV01',
  errorV02: 'lbl.errorV02',
  errorDuplicate: 'lbl.errorDuplicate',
  errorGeneric: 'lbl.errorGeneric',
};

async function fillAndCreate(user: ReturnType<typeof userEvent.setup>) {
  const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
  await user.clear(code);
  await user.type(code, 'FA5609');
  await user.type(screen.getByLabelText(new RegExp(LABELS.fieldProductName)), 'Pulled Chicken Shawarma');
  await user.click(screen.getByRole('button', { name: LABELS.create }));
}

describe('ProductCreateWizard — onboarding returnTo flow', () => {
  it('renders the FG create modal open', () => {
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(<ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" returnTo="%2Fonboarding%2Fwo" />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('returns to the (decoded) returnTo path after a successful create', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(<ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" returnTo="%2Fonboarding%2Fwo" />);

    await fillAndCreate(user);

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ productCode: 'FA5609', productName: 'Pulled Chicken Shawarma' }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/onboarding/wo'));
  });

  it('returns to returnTo on cancel', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(<ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" returnTo="%2Fonboarding%2Fwo" />);

    await user.click(screen.getByRole('button', { name: LABELS.cancel }));
    expect(pushMock).toHaveBeenCalledWith('/onboarding/wo');
  });

  it('ignores an unsafe protocol-relative returnTo and falls back to /{locale}/fa', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(<ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" returnTo="%2F%2Fevil.example.com" />);

    await fillAndCreate(user);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/fa/FA5609'));
  });

  it('ignores a backslash open-redirect (/\\evil.example.com) and falls back to /{locale}/fa', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    // "%2F%5Cevil.example.com" decodes to "/\evil.example.com", which URL parsers
    // normalize into "https://evil.example.com/".
    render(<ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" returnTo="%2F%5Cevil.example.com" />);

    await fillAndCreate(user);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/fa/FA5609'));
  });

  it('ignores a tab/control-char open-redirect (/%09//evil) and falls back to /{locale}/fa', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    // "%2F%09%2F%2Fevil.example.com" decodes to "/\t//evil.example.com".
    render(
      <ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" returnTo="%2F%09%2F%2Fevil.example.com" />,
    );

    await fillAndCreate(user);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/fa/FA5609'));
  });

  it('lands on the new FG detail route when no returnTo is provided', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ productCode: 'FA5609' }));
    render(<ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" />);

    await fillAndCreate(user);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/fa/FA5609'));
  });

  it('accepts a non-FA product code (prefix is no longer hardcoded to FA)', async () => {
    const user = userEvent.setup();
    // The prefix becomes configurable in product settings, so a code without the
    // legacy 'FA' prefix must validate and submit. V02 (Product Name) still applies.
    const action = vi.fn(async () => ({ productCode: 'WIDGET1' }));
    render(<ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" returnTo="%2Fonboarding%2Fwo" />);

    const code = screen.getByLabelText(new RegExp(LABELS.fieldProductCode));
    await user.clear(code);
    await user.type(code, 'WIDGET1');
    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldProductName)), 'Generic Widget');

    const createBtn = screen.getByRole('button', { name: LABELS.create });
    await waitFor(() => expect(createBtn).toBeEnabled());
    await user.click(createBtn);

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ productCode: 'WIDGET1', productName: 'Generic Widget' }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/onboarding/wo'));
  });

  it('still rejects an empty product code (V01 minimal: code required)', async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ productCode: 'WIDGET1' }));
    render(<ProductCreateWizard labels={LABELS} createFaAction={action} locale="en" />);

    // Only fill the name; leave the (now empty by default) code blank.
    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldProductName)), 'Generic Widget');

    expect(screen.getByRole('button', { name: LABELS.create })).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });
});
