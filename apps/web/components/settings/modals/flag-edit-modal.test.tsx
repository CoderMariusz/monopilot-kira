/**
 * T-048 / SM-02 — FlagEditModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:72-108
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

vi.mock('@monopilot/ui/Modal', async () => {
  type ModalShimProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    size?: string;
    modalId?: string;
    children: React.ReactNode;
  };

  function ModalShim({ open, size = 'md', modalId, children }: ModalShimProps) {
    if (!open) return null;
    return (
      <>
        <span data-radix-focus-guard="" />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="flag-edit-modal-title"
          data-focus-trap="radix-dialog"
          data-size={size}
          data-modal-id={modalId}
        >
          {children}
        </div>
        <span data-radix-focus-guard="" />
      </>
    );
  }

  ModalShim.Header = ({ title }: { title: string }) => <h2 id="flag-edit-modal-title">{title}</h2>;
  ModalShim.Body = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-body">{children}</div>;
  ModalShim.Footer = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-footer">{children}</div>;

  return { default: ModalShim };
});

type SettingsFlag = {
  id: string;
  code: string;
  desc: string;
  tenant: 'L1-core' | 'L2-site' | 'L3-org';
  on: boolean;
  rollout: number;
};

type FlagEditResult =
  | { ok: true; flagId: string; revalidatedPath: '/settings/flags' }
  | { ok: false; error: 'REASON_TOO_SHORT' | 'FLAG_SAVE_FAILED' | string };

type FlagEditModalProps = {
  open: boolean;
  flag?: SettingsFlag | null;
  loading?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  saveFlagChange: (input: {
    flagId: string;
    enabled: boolean;
    rollout: number;
    reason: string;
  }) => Promise<FlagEditResult>;
  onPromoteToL2: (input: {
    modalId: 'SM-05';
    flag: SettingsFlag;
    enabled: boolean;
    rollout: number;
    reason: string;
  }) => void;
};

const l2Flag: SettingsFlag = {
  id: 'flag-mrp-live',
  code: 'MRP_LIVE_REPLAN',
  desc: 'Allow planners to apply live MRP reschedule suggestions.',
  tenant: 'L2-site',
  on: true,
  rollout: 40,
};

const l1Flag: SettingsFlag = {
  id: 'flag-rbac-core',
  code: 'RBAC_CORE_LOCK',
  desc: 'Protect role/permission enforcement across all sites.',
  tenant: 'L1-core',
  on: false,
  rollout: 0,
};

async function loadFlagEditModal() {
  const target = './flag-edit-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/flag-edit-modal.tsx should exist and export SM-02 FlagEditModal',
  ).not.toBeNull();

  const component = module?.FlagEditModal ?? module?.default;
  expect(component, 'FlagEditModal must be exported as a renderable React component').toEqual(
    expect.any(Function),
  );
  return component as React.ComponentType<FlagEditModalProps>;
}

async function renderFlagEditModal(overrides: Partial<FlagEditModalProps> = {}) {
  const FlagEditModal = await loadFlagEditModal();
  const props: FlagEditModalProps = {
    open: true,
    flag: l2Flag,
    onOpenChange: vi.fn(),
    saveFlagChange: vi.fn().mockResolvedValue({
      ok: true,
      flagId: l2Flag.id,
      revalidatedPath: '/settings/flags',
    }),
    onPromoteToL2: vi.fn(),
    ...overrides,
  };

  const rtl = render(<FlagEditModal {...props} />);
  return { ...rtl, props };
}

function getDialog(name = /edit flag — MRP_LIVE_REPLAN/i) {
  return screen.getByRole('dialog', { name });
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button: HTMLElement) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name) => name && !/^close$/i.test(name));
}

function modalOutline(dialog: HTMLElement) {
  const scoped = within(dialog);
  const statusSwitch = scoped.getByRole('switch', { name: /status/i });
  const rollout = scoped.getByRole('slider', { name: /rollout %/i });
  const reason = scoped.getByRole('textbox', { name: /audit reason/i });
  const save = scoped.getByRole('button', { name: /^save change$/i });
  const root = screen.getByTestId('flag-edit-modal');

  return {
    modalId: dialog.getAttribute('data-modal-id'),
    rootTestId: root.getAttribute('data-testid'),
    size: dialog.getAttribute('data-size'),
    title: scoped.getByRole('heading', { name: /edit flag — MRP_LIVE_REPLAN/i }).textContent,
    subtitle: scoped.getByText(l2Flag.desc).textContent,
    sectionOrder: ['status', 'rollout', 'audit-reason', 'footer'],
    fieldLabels: ['Status', 'Rollout %', 'Audit reason'],
    fieldRoles: ['switch', 'slider[min=0,max=100]', 'textbox[textarea]'],
    footerButtons: visibleFooterButtonNames(dialog),
    primitiveSlots: {
      modalFocusTrap: dialog.getAttribute('data-focus-trap'),
      switch: statusSwitch.closest('[data-slot="switch"]')?.getAttribute('data-slot'),
      range: rollout.getAttribute('type') ?? rollout.getAttribute('role'),
      reason: reason.closest('[data-slot="textarea"]')?.getAttribute('data-slot'),
      reasonCounter: Boolean(scoped.getByTestId('reason-input-counter')),
      cancel: scoped.getByRole('button', { name: /^cancel$/i }).closest('[data-slot="button"]')?.getAttribute('data-slot'),
      save: save.closest('[data-slot="button"]')?.getAttribute('data-slot'),
      rawSelectCount: dialog.querySelectorAll('select').length,
    },
    initialValues: {
      enabled: statusSwitch.getAttribute('aria-checked'),
      rollout: rollout.getAttribute('aria-valuenow') ?? rollout.getAttribute('value'),
      reasonPlaceholder: reason.getAttribute('placeholder'),
      saveDisabledUntilReasonValid: save.hasAttribute('disabled'),
    },
  };
}

describe('SM-02 FlagEditModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the flag_edit_modal structure, shadcn/Radix primitives, footer order, disabled rule, focus order, and a11y contract', async () => {
    const user = userEvent.setup();
    const { container } = await renderFlagEditModal();

    const dialog = getDialog();
    expect(modalOutline(dialog)).toMatchInlineSnapshot(`
      {
        "fieldLabels": [
          "Status",
          "Rollout %",
          "Audit reason",
        ],
        "fieldRoles": [
          "switch",
          "slider[min=0,max=100]",
          "textbox[textarea]",
        ],
        "footerButtons": [
          "Cancel",
          "Save change",
        ],
        "initialValues": {
          "enabled": "true",
          "reasonPlaceholder": "Why is this flag changing? (audit-logged)",
          "rollout": "40",
          "saveDisabledUntilReasonValid": true,
        },
        "modalId": "SM-02",
        "primitiveSlots": {
          "cancel": "button",
          "modalFocusTrap": "radix-dialog",
          "range": "range",
          "rawSelectCount": 0,
          "reason": "textarea",
          "reasonCounter": true,
          "save": "button",
          "switch": "switch",
        },
        "rootTestId": "flag-edit-modal",
        "sectionOrder": [
          "status",
          "rollout",
          "audit-reason",
          "footer",
        ],
        "size": "default",
        "subtitle": "Allow planners to apply live MRP reschedule suggestions.",
        "title": "Edit flag — MRP_LIVE_REPLAN",
      }
    `);

    const source = readFileSync(`${process.cwd()}/components/settings/modals/flag-edit-modal.tsx`, 'utf8');
    expect(source).toContain("import Modal from '@monopilot/ui/Modal'");
    expect(source).toContain("import ReasonInput from '@monopilot/ui/ReasonInput'");
    expect(source).not.toContain('role="dialog"');
    expect(source).not.toContain('data-radix-focus-guard');
    expect(source).not.toContain("setAttribute('data-slot'");

    const scoped = within(dialog);
    const statusSwitch = scoped.getByRole('switch', { name: /status/i });
    const rollout = scoped.getByRole('slider', { name: /rollout %/i });
    const reason = scoped.getByRole('textbox', { name: /audit reason/i });
    const cancel = scoped.getByRole('button', { name: /^cancel$/i });
    const save = scoped.getByRole('button', { name: /^save change$/i });

    expect(statusSwitch).toHaveFocus();
    await user.tab();
    expect(rollout).toHaveFocus();
    await user.tab();
    expect(reason).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(save).toHaveFocus();

    await assertModalA11y(container);
  });

  it('renders loading, empty, and error states loudly instead of silently falling back to prototype globals', async () => {
    const { rerender, props } = await renderFlagEditModal({ flag: null, loading: true });

    let dialog = screen.getByRole('dialog', { name: /edit flag/i });
    expect(within(dialog).getByRole('status', { name: /loading feature flag/i })).toBeInTheDocument();
    expect(within(dialog).queryByText(l2Flag.code)).not.toBeInTheDocument();

    const FlagEditModal = await loadFlagEditModal();
    rerender(<FlagEditModal {...props} loading={false} flag={null} />);
    dialog = screen.getByRole('dialog', { name: /edit flag/i });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No feature flag selected');

    rerender(<FlagEditModal {...props} loading={false} flag={null} error="Feature flag registry unavailable" />);
    dialog = screen.getByRole('dialog', { name: /edit flag/i });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Feature flag registry unavailable');
  });
});

describe('SM-02 FlagEditModal validation and L1 promotion routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks submit with REASON_TOO_SHORT when the audit reason is shorter than 10 characters', async () => {
    const user = userEvent.setup();
    const saveFlagChange = vi.fn().mockResolvedValue({ ok: true });
    await renderFlagEditModal({ saveFlagChange });

    const dialog = getDialog();
    const reason = within(dialog).getByRole('textbox', { name: /audit reason/i });
    const save = within(dialog).getByRole('button', { name: /^save change$/i });

    await user.type(reason, 'too short');
    await user.click(save);

    expect(saveFlagChange).not.toHaveBeenCalled();
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('REASON_TOO_SHORT');
    expect(save).toBeDisabled();
  });

  it('routes L1-core flag saves to PromoteToL2Modal SM-05 instead of direct save', async () => {
    const user = userEvent.setup();
    const saveFlagChange = vi.fn().mockResolvedValue({ ok: true });
    const onPromoteToL2 = vi.fn();
    await renderFlagEditModal({ flag: l1Flag, saveFlagChange, onPromoteToL2 });

    const dialog = getDialog(/edit flag — RBAC_CORE_LOCK/i);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('L1-core flag');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('promotion workflow');

    await user.click(within(dialog).getByRole('switch', { name: /status/i }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /audit reason/i }),
      'Route L1 core changes through promotion workflow.',
    );
    await user.click(within(dialog).getByRole('button', { name: /^save change$/i }));

    expect(saveFlagChange).not.toHaveBeenCalled();
    expect(onPromoteToL2).toHaveBeenCalledWith({
      modalId: 'SM-05',
      flag: l1Flag,
      enabled: true,
      rollout: 0,
      reason: 'Route L1 core changes through promotion workflow.',
    });
  });
});
