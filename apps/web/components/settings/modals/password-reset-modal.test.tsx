/**
 * T-055 / SM-09 — PasswordResetModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:492-510
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type PasswordResetUser = {
  id: string;
  name: string;
  email: string;
};

type PasswordResetResult =
  | { ok: true }
  | { ok: false; error: 'PERMISSION_DENIED' | 'RESET_EMAIL_FAILED' | string };

type PasswordResetModalProps = {
  open: boolean;
  user: PasswordResetUser;
  resetPassword: (input: { userId: string }) => Promise<PasswordResetResult>;
  onOpenChange: (open: boolean) => void;
};

const targetUser: PasswordResetUser = {
  id: 'user-ada',
  name: 'Ada Quality',
  email: 'ada.quality@example.com',
};

async function loadPasswordResetModal() {
  const target = './password-reset-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/password-reset-modal.tsx should exist and export SM-09 PasswordResetModal',
  ).not.toBeNull();

  const component = module?.PasswordResetModal ?? module?.default;
  expect(component, 'PasswordResetModal must be exported as a renderable React component').toEqual(expect.any(Function));
  return component as React.ComponentType<PasswordResetModalProps>;
}

async function renderPasswordResetModal(overrides: Partial<PasswordResetModalProps> = {}) {
  const PasswordResetModal = await loadPasswordResetModal();
  const props: PasswordResetModalProps = {
    open: true,
    user: targetUser,
    resetPassword: vi.fn().mockResolvedValue({ ok: true }),
    onOpenChange: vi.fn(),
    ...overrides,
  };

  render(<PasswordResetModal {...props} />);
  return props;
}

function getDialog() {
  return screen.getByRole('dialog', { name: /reset password\?/i });
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button: HTMLElement) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name: string) => !/^close$/i.test(name));
}

function modalOutline(dialog: HTMLElement) {
  const scoped = within(dialog);
  const alert = scoped.getByRole('alert');
  const ack = scoped.getByRole('checkbox', { name: /i understand this will revoke active sessions/i });
  const cancel = scoped.getByRole('button', { name: /^cancel$/i });
  const send = scoped.getByRole('button', { name: /^send reset link$/i });

  return {
    title: scoped.getByRole('heading', { name: /reset password\?/i }).textContent,
    size: dialog.getAttribute('data-size'),
    dismissibleCloseButtonCount: within(dialog).queryAllByRole('button', { name: /^close$/i }).length,
    alertText: alert.textContent?.replace(/\s+/g, ' ').trim(),
    alertPrimitive: alert.getAttribute('data-slot') ?? 'alert',
    checkboxPrimitive: ack.getAttribute('data-slot') ?? ack.closest('[data-slot="checkbox"]')?.getAttribute('data-slot'),
    footerButtons: visibleFooterButtonNames(dialog),
    destructiveConfirm:
      send.getAttribute('data-variant') === 'destructive' || send.className.includes('btn-danger'),
    confirmDisabledUntilAck: send.hasAttribute('disabled'),
    cancelPrimitive: cancel.closest('[data-slot="button"]')?.getAttribute('data-slot'),
    confirmPrimitive: send.closest('[data-slot="button"]')?.getAttribute('data-slot'),
  };
}

function assertModalA11y(dialog: HTMLElement) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAttribute('data-focus-trap', 'radix-dialog');
  expect(dialog).toHaveAttribute('data-size', 'sm');
  expect(within(dialog).queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument();
}

describe('SM-09 PasswordResetModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches the SM-09 destructive dialog structure, shadcn primitives, footer order, disabled rule, focus order, and RTL outline snapshot', async () => {
    const user = userEvent.setup();
    await renderPasswordResetModal();

    const dialog = getDialog();
    assertModalA11y(dialog);

    expect(modalOutline(dialog)).toMatchInlineSnapshot(`
      {
        "alertPrimitive": "alert",
        "alertText": "This will immediately invalidate Ada Quality's current password and email a reset link to ada.quality@example.com. Any active sessions for this user will be revoked.",
        "cancelPrimitive": "button",
        "checkboxPrimitive": "checkbox",
        "confirmDisabledUntilAck": true,
        "confirmPrimitive": "button",
        "destructiveConfirm": true,
        "dismissibleCloseButtonCount": 0,
        "footerButtons": [
          "Cancel",
          "Send reset link",
        ],
        "size": "sm",
        "title": "Reset password?",
      }
    `);

    const ack = within(dialog).getByRole('checkbox', { name: /i understand this will revoke active sessions/i });
    const cancel = within(dialog).getByRole('button', { name: /^cancel$/i });
    const send = within(dialog).getByRole('button', { name: /^send reset link$/i });

    expect(ack).toHaveFocus();
    await user.click(ack);
    expect(send).toBeEnabled();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(send).toHaveFocus();
  });
});

describe('SM-09 PasswordResetModal ack gate and Server Action behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks the destructive confirm while the acknowledgement checkbox is unchecked', async () => {
    const user = userEvent.setup();
    const resetPassword = vi.fn().mockResolvedValue({ ok: true });
    await renderPasswordResetModal({ resetPassword });

    const dialog = getDialog();
    const send = within(dialog).getByRole('button', { name: /^send reset link$/i });

    expect(send).toBeDisabled();
    await user.click(send);

    expect(resetPassword).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
  });

  it('shows a pending state, calls resetPassword, shows the success toast, and closes the modal after the action resolves', async () => {
    const user = userEvent.setup();
    let resolveReset!: (value: PasswordResetResult) => void;
    const resetPassword = vi.fn(
      () => new Promise<PasswordResetResult>((resolve) => {
        resolveReset = resolve;
      }),
    );
    const PasswordResetModal = await loadPasswordResetModal();

    function Harness() {
      const [open, setOpen] = React.useState(true);
      return <PasswordResetModal open={open} user={targetUser} resetPassword={resetPassword} onOpenChange={setOpen} />;
    }

    render(<Harness />);
    const dialog = getDialog();
    await user.click(within(dialog).getByRole('checkbox', { name: /i understand this will revoke active sessions/i }));
    await user.click(within(dialog).getByRole('button', { name: /^send reset link$/i }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ userId: 'user-ada' }));
    expect(within(dialog).getByRole('button', { name: /sending reset link/i })).toBeDisabled();

    resolveReset({ ok: true });

    expect(await screen.findByText('Password reset email sent')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /reset password\?/i })).not.toBeInTheDocument());
  });

  it('keeps the dialog open and renders a loud error state when resetPassword fails', async () => {
    const user = userEvent.setup();
    const resetPassword = vi.fn().mockResolvedValue({ ok: false, error: 'RESET_EMAIL_FAILED' });
    await renderPasswordResetModal({ resetPassword });

    const dialog = getDialog();
    await user.click(within(dialog).getByRole('checkbox', { name: /i understand this will revoke active sessions/i }));
    await user.click(within(dialog).getByRole('button', { name: /^send reset link$/i }));

    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith({ userId: 'user-ada' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('RESET_EMAIL_FAILED');
    expect(screen.getByRole('dialog', { name: /reset password\?/i })).toBeInTheDocument();
  });
});
