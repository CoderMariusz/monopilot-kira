/**
 * T-052 / SM-06 — UserInviteModal (MODAL-INVITE-USER)
 *
 * RED phase: these RTL tests specify the prototype-backed Settings user invite modal.
 * They must fail until apps/web/components/settings/modals/user-invite-modal.tsx exists
 * and implements the SM-06 prototype contract from:
 * prototypes/design/Monopilot Design System/settings/modals.jsx:378-407.
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type InviteResult =
  | { ok: true; invitationId?: string }
  | { ok: false; error: 'EMAIL_INVALID' | 'SEAT_LIMIT_REACHED' | string };

type UserInviteModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: string[];
  inviteUser: (input: {
    email: string;
    fullName?: string;
    role: string;
    message?: string;
  }) => Promise<InviteResult>;
  rolesLoading?: boolean;
};

const roles = ['Operator', 'Supervisor', 'Admin'];

async function loadUserInviteModal() {
  const target = './user-invite-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/user-invite-modal.tsx should exist for T-052 / SM-06',
  ).not.toBeNull();

  const Component = module?.UserInviteModal ?? module?.default;
  expect(Component, 'UserInviteModal must export a renderable React component').toEqual(expect.any(Function));

  return Component as React.ComponentType<UserInviteModalProps>;
}

async function renderUserInviteModal(overrides?: Partial<UserInviteModalProps>) {
  const UserInviteModal = await loadUserInviteModal();
  const props: UserInviteModalProps = {
    open: true,
    onOpenChange: vi.fn(),
    roles,
    inviteUser: vi.fn().mockResolvedValue({ ok: true, invitationId: 'invite-001' }),
    ...overrides,
  };

  const rtl = render(React.createElement(UserInviteModal, props));
  return { ...rtl, props };
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name) => !/^close$/i.test(name));
}

describe('SM-06 UserInviteModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the SM-06 dialog fields, primitives, footer order, focus order, and a11y contract', async () => {
    const user = userEvent.setup();
    const { container } = await renderUserInviteModal();

    const dialog = screen.getByRole('dialog', { name: /invite team member/i });
    const email = within(dialog).getByRole('textbox', { name: /email address/i });
    const fullName = within(dialog).getByRole('textbox', { name: /full name \(optional\)/i });
    const role = within(dialog).getByRole('combobox', { name: /^role/i });
    const message = within(dialog).getByRole('textbox', { name: /custom message \(optional\)/i });
    const cancel = within(dialog).getByRole('button', { name: /^cancel$/i });
    const send = within(dialog).getByRole('button', { name: /^send invitation$/i });

    expect(email).toHaveAttribute('type', 'email');
    expect(email.closest('[data-slot="input"]')).toBeTruthy();
    expect(fullName.closest('[data-slot="input"]')).toBeTruthy();
    expect(message.closest('[data-slot="textarea"]')).toBeTruthy();
    expect(message).toHaveAttribute('maxlength', '500');
    expect(within(dialog).getByText(/included in the invitation email/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: 'Operator' })).toBeInTheDocument();
    expect(role).toHaveValue('Operator');
    expect(cancel.closest('[data-slot="button"]')).toBeTruthy();
    expect(send.closest('[data-slot="button"]')).toBeTruthy();
    expect(send).toBeDisabled();

    expect({
      dialogTitle: within(dialog).getByRole('heading', { name: /invite team member/i }).textContent,
      fieldLabels: [
        'Email address',
        'Full name (optional)',
        'Role',
        'Custom message (optional)',
      ],
      fieldRoles: ['textbox[type=email]', 'textbox', 'combobox', 'textbox[textarea]'],
      roleOptions: roles,
      footerButtons: visibleFooterButtonNames(dialog),
      sendDisabledUntilEmailValid: send.hasAttribute('disabled'),
    }).toMatchInlineSnapshot(`
      {
        "dialogTitle": "Invite team member",
        "fieldLabels": [
          "Email address",
          "Full name (optional)",
          "Role",
          "Custom message (optional)",
        ],
        "fieldRoles": [
          "textbox[type=email]",
          "textbox",
          "combobox",
          "textbox[textarea]",
        ],
        "footerButtons": [
          "Cancel",
          "Send invitation",
        ],
        "roleOptions": [
          "Operator",
          "Supervisor",
          "Admin",
        ],
        "sendDisabledUntilEmailValid": true,
      }
    `);

    expect(email).toHaveFocus();
    await user.type(email, 'new.user@example.com');
    await user.tab();
    expect(fullName).toHaveFocus();
    await user.tab();
    expect(role).toHaveFocus();
    await user.tab();
    expect(message).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(send).toHaveFocus();

    await assertModalA11y(container);
  });
});

describe('SM-06 UserInviteModal validation and server-action errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks invalid email submission with EMAIL_INVALID and does not call the invite action', async () => {
    const user = userEvent.setup();
    const inviteUser = vi.fn().mockResolvedValue({ ok: true });
    await renderUserInviteModal({ inviteUser });

    const dialog = screen.getByRole('dialog', { name: /invite team member/i });
    const email = within(dialog).getByRole('textbox', { name: /email address/i });
    const send = within(dialog).getByRole('button', { name: /^send invitation$/i });

    await user.type(email, 'not-an-email');
    await user.click(send);

    expect(inviteUser).not.toHaveBeenCalled();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('EMAIL_INVALID');
    expect(send).toBeDisabled();
  });

  it('shows a non-blocking Settings → Plan alert when the invite action returns SEAT_LIMIT_REACHED', async () => {
    const user = userEvent.setup();
    const inviteUser = vi.fn().mockResolvedValue({ ok: false, error: 'SEAT_LIMIT_REACHED' });
    const onOpenChange = vi.fn();
    await renderUserInviteModal({ inviteUser, onOpenChange });

    const dialog = screen.getByRole('dialog', { name: /invite team member/i });
    const email = within(dialog).getByRole('textbox', { name: /email address/i });
    const fullName = within(dialog).getByRole('textbox', { name: /full name \(optional\)/i });
    const message = within(dialog).getByRole('textbox', { name: /custom message \(optional\)/i });

    await user.type(email, 'new.operator@example.com');
    await user.type(fullName, 'New Operator');
    await user.type(message, 'Welcome to Apex Dairy.');
    await user.click(within(dialog).getByRole('button', { name: /^send invitation$/i }));

    expect(inviteUser).toHaveBeenCalledWith({
      email: 'new.operator@example.com',
      fullName: 'New Operator',
      role: 'Operator',
      message: 'Welcome to Apex Dairy.',
    });

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('SEAT_LIMIT_REACHED');
    expect(alert).toHaveTextContent('Settings → Plan');
    expect(email).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: /^cancel$/i })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
