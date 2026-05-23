/**
 * T-051 / SM-05 — PromoteToL2Modal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:262-375
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type PromotionPreview = {
  before: string;
  after: string;
  affectedRows: number;
  affectedLabel?: string;
  l3OverridesPreserved: boolean;
};

type PromotionCandidate = {
  id: string;
  artefact: string;
  from: 'L3-tenant' | 'L2-local';
  to: 'L2-local' | 'L1-core';
  diff: string;
};

type PromotionResult =
  | { ok: true; promotionId: string }
  | { ok: false; error: 'PROMOTION_REQUIRES_ADMIN' | 'PREVIEW_UPGRADE_FAILED' | string };

type PromoteToL2ModalProps = {
  isAdmin: boolean;
  defaultOpen?: boolean;
  promotion?: PromotionCandidate;
  previewUpgrade: (input: { artefact: string; target: 'L2-local' | 'L1-core' }) => Promise<PromotionPreview>;
  submitPromotion: (input: {
    artefact: string;
    target: 'L2-local' | 'L1-core';
    reason: string;
    preview: PromotionPreview;
  }) => Promise<PromotionResult>;
  onOpenChange?: (open: boolean) => void;
};

const preview: PromotionPreview = {
  before: '{\n  "tier": "L3-tenant",\n  "variance_threshold": 0.05\n}',
  after: '{\n  "tier": "L2-local",\n  "variance_threshold": 0.10\n}',
  affectedRows: 37,
  affectedLabel: 'tenants',
  l3OverridesPreserved: true,
};

async function loadPromoteToL2Modal() {
  const target = './promote-to-l2-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/promote-to-l2-modal.tsx should exist and export SM-05 PromoteToL2Modal',
  ).not.toBeNull();

  const component = module?.PromoteToL2Modal ?? module?.default;
  expect(component, 'PromoteToL2Modal must be exported as a renderable React component').toEqual(
    expect.any(Function),
  );

  return component as React.ComponentType<PromoteToL2ModalProps>;
}

async function renderPromoteToL2Modal(overrides: Partial<PromoteToL2ModalProps> = {}) {
  const PromoteToL2Modal = await loadPromoteToL2Modal();
  const props: PromoteToL2ModalProps = {
    isAdmin: true,
    defaultOpen: true,
    previewUpgrade: vi.fn().mockResolvedValue(preview),
    submitPromotion: vi.fn().mockResolvedValue({ ok: true, promotionId: 'promotion-001' }),
    onOpenChange: vi.fn(),
    ...overrides,
  };

  const rtl = render(<PromoteToL2Modal {...props} />);
  return { ...rtl, props };
}

function getDialog() {
  return screen.getByRole('dialog', { name: /start l1→l2→l3 promotion|promotion prm-/i });
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name) => !/^close$/i.test(name));
}

function modalOutline(dialog: HTMLElement) {
  const scoped = within(dialog);
  return {
    testId: dialog.closest('[data-testid="promote-to-l2-modal"]')?.getAttribute('data-testid'),
    title: scoped.getByRole('heading', { name: /start l1→l2→l3 promotion/i }).textContent,
    stepLabels: ['Select artefact', 'Preview diff', 'Confirm + reason'].map(
      (label) => scoped.getByText(label).textContent,
    ),
    currentStep: scoped.getByText('Select artefact').getAttribute('aria-current'),
    fieldLabels: [
      scoped.getByLabelText(/artefact to promote/i).getAttribute('placeholder'),
      scoped.getByRole('combobox', { name: /target stage/i }).getAttribute('aria-label') ?? 'Target stage',
    ],
    footerButtons: visibleFooterButtonNames(dialog),
    nativeSelectCount: dialog.querySelectorAll('select').length,
  };
}

describe('SM-05 PromoteToL2Modal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the wizard structure, shadcn primitives, disabled rules, focus order, and RTL outline snapshot', async () => {
    const user = userEvent.setup();
    const { container } = await renderPromoteToL2Modal();

    const dialog = getDialog();
    const scoped = within(dialog);
    const artefact = scoped.getByRole('textbox', { name: /artefact to promote/i });
    const target = scoped.getByRole('combobox', { name: /target stage/i });
    const cancel = scoped.getByRole('button', { name: /^cancel$/i });
    const next = scoped.getByRole('button', { name: /next: preview/i });

    expect(dialog.closest('[data-testid="promote-to-l2-modal"]')).toBeTruthy();
    expect(artefact.closest('[data-slot="input"]')).toBeTruthy();
    expect(target.closest('[data-slot="select-trigger"]')).toBeTruthy();
    expect(cancel.closest('[data-slot="button"]')).toBeTruthy();
    expect(next.closest('[data-slot="button"]')).toBeTruthy();
    expect(next).toBeDisabled();
    expect(scoped.getByText(/l1 promotions are reviewed by monopilot sre/i)).toBeInTheDocument();

    expect(modalOutline(dialog)).toMatchInlineSnapshot(`
      {
        "currentStep": "step",
        "fieldLabels": [
          "rules.cycle_count_variance_v1",
          "Target stage",
        ],
        "footerButtons": [
          "Cancel",
          "Next: preview →",
        ],
        "nativeSelectCount": 0,
        "stepLabels": [
          "Select artefact",
          "Preview diff",
          "Confirm + reason",
        ],
        "testId": "promote-to-l2-modal",
        "title": "Start L1→L2→L3 promotion",
      }
    `);

    expect(artefact).toHaveFocus();
    await user.type(artefact, 'ru');
    expect(next).toBeDisabled();
    await user.type(artefact, 'les.cycle_count_variance_v1');
    expect(next).toBeEnabled();
    await user.tab();
    expect(target).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(next).toHaveFocus();

    await assertModalA11y(container);
  });

  it('keeps the trigger disabled for non-admin users and does not open SM-05', async () => {
    const user = userEvent.setup();
    await renderPromoteToL2Modal({ isAdmin: false, defaultOpen: false });

    const trigger = screen.getByRole('button', { name: /promote to l2|start promotion/i });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-controls', 'SM-05');

    await user.click(trigger);

    expect(screen.queryByTestId('promote-to-l2-modal')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /start l1→l2→l3 promotion/i })).not.toBeInTheDocument();
  });

  it('renders the diff step from previewUpgrade data and never hardcodes the prototype 12-tenant impact', async () => {
    const user = userEvent.setup();
    const previewUpgrade = vi.fn().mockResolvedValue(preview);
    await renderPromoteToL2Modal({ previewUpgrade });

    const dialog = getDialog();
    const scoped = within(dialog);
    await user.type(scoped.getByRole('textbox', { name: /artefact to promote/i }), 'rules.cycle_count_variance_v1');
    await user.click(scoped.getByRole('button', { name: /next: preview/i }));

    await waitFor(() =>
      expect(previewUpgrade).toHaveBeenCalledWith({
        artefact: 'rules.cycle_count_variance_v1',
        target: 'L2-local',
      }),
    );

    expect(await scoped.findByText(/current \(before\)/i)).toBeInTheDocument();
    expect(scoped.getByText(/target \(l2-local\)/i)).toBeInTheDocument();
    expect(scoped.getByText(/"tier": "L3-tenant"/i)).toBeInTheDocument();
    expect(scoped.getByText(/"tier": "L2-local"/i)).toBeInTheDocument();

    const impact = scoped.getByRole('status', { name: /promotion impact/i });
    expect(impact).toHaveTextContent('37 tenants');
    expect(impact).toHaveTextContent(/existing l3 overrides will be preserved/i);
    expect(impact).not.toHaveTextContent('12 tenants');
  });

  it('renders preview loading/error states and gates final submission on a 10 character audit reason', async () => {
    const user = userEvent.setup();
    const previewUpgrade = vi
      .fn()
      .mockRejectedValueOnce(new Error('preview unavailable'))
      .mockResolvedValueOnce(preview);
    const submitPromotion = vi.fn().mockResolvedValue({ ok: true, promotionId: 'promotion-001' });
    await renderPromoteToL2Modal({ previewUpgrade, submitPromotion });

    const dialog = getDialog();
    const scoped = within(dialog);
    const artefact = scoped.getByRole('textbox', { name: /artefact to promote/i });
    await user.type(artefact, 'rules.cycle_count_variance_v1');
    await user.click(scoped.getByRole('button', { name: /next: preview/i }));

    expect(scoped.getByRole('status', { name: /loading promotion preview/i })).toBeInTheDocument();
    expect(await scoped.findByRole('alert')).toHaveTextContent('PREVIEW_UPGRADE_FAILED');
    await user.click(scoped.getByRole('button', { name: /retry preview/i }));
    await scoped.findByRole('status', { name: /promotion impact/i });
    await user.click(scoped.getByRole('button', { name: /next: confirm/i }));

    expect(scoped.getByText('Artefact')).toBeInTheDocument();
    expect(scoped.getByText('From → To')).toBeInTheDocument();
    expect(scoped.getByText('Affects')).toBeInTheDocument();

    const reason = scoped.getByRole('textbox', { name: /justification \(audit-logged\)/i });
    const submit = scoped.getByRole('button', { name: /submit promotion/i });
    expect(reason.closest('[data-slot="textarea"]')).toBeTruthy();
    expect(submit).toBeDisabled();

    await user.type(reason, 'Too short');
    expect(submit).toBeDisabled();
    await user.type(reason, ' because cycle count governance is ready');
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(scoped.getByRole('button', { name: /submitting/i })).toBeDisabled();
    await waitFor(() =>
      expect(submitPromotion).toHaveBeenCalledWith({
        artefact: 'rules.cycle_count_variance_v1',
        target: 'L2-local',
        reason: 'Too short because cycle count governance is ready',
        preview,
      }),
    );
  });
});
