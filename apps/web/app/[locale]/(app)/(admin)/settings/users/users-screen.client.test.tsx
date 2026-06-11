import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const productionModalCalls = vi.hoisted(() => ({
  passwordReset: [] as Array<{ open: boolean; user: { id: string; email: string } | null }>,
}));

vi.mock('@monopilot/ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock('@monopilot/ui/Input', () => ({
  default: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@monopilot/ui/Textarea', () => ({
  default: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock('@monopilot/ui/EmptyState', () => ({
  EmptyState: ({ icon, title, body, action }: { icon: string; title: string; body: string; action?: React.ReactNode }) => (
    <div>
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  ),
}));

vi.mock('@monopilot/ui/Modal', () => {
  function Header({ title }: { title: string }) {
    return <h2>{title}</h2>;
  }
  function Body({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }
  function Footer({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }
  function Modal({ open, children }: { open: boolean; children: React.ReactNode }) {
    if (!open) return null;
    const title = React.Children.toArray(children).find((child) => React.isValidElement<{ title?: string }>(child) && child.props.title);
    const label = React.isValidElement<{ title?: string }>(title) ? title.props.title : 'Dialog';
    return <div role="dialog" aria-modal="true" aria-label={label}>{children}</div>;
  }
  return { default: Object.assign(Modal, { Header, Body, Footer }) };
});

vi.mock('../../../../../../components/settings/modals/password-reset-modal', () => ({
  PasswordResetModal: (props: { open: boolean; user?: { id: string; email: string } | null; onOpenChange: (open: boolean) => void }) => {
    productionModalCalls.passwordReset.push({ open: props.open, user: props.user ?? null });
    if (!props.open || !props.user) return null;
    return (
      <div role="dialog" aria-modal="true" aria-label="production password reset modal">
        <p>Production PasswordResetModal</p>
        <p>Reset target {props.user.email}</p>
        <button type="button" onClick={() => props.onOpenChange(false)}>Close production password reset</button>
      </div>
    );
  },
}));

import SettingsUsersScreen, {
  type SettingsUsersScreenProps,
  type UsersScreenData,
  type UsersScreenLabels,
} from './users-screen.client';

type AssignRoleAction = (input: { targetUserId: string; roleId: string }) => Promise<
  | { ok: true; data: { targetUserId: string; roleId: string } }
  | { ok: false; error: string }
>;

type ResetPasswordAction = (input: { userId: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

const labels: UsersScreenLabels = {
  title: 'Users & roles',
  summary: '{users} users · {roles} roles',
  export: 'Export',
  inviteUser: 'Invite user',
  active: 'Active',
  invited: 'Invited',
  disabled: 'Disabled',
  seatsUsed: 'Seats used',
  seatsUnlimited: 'unlimited',
  userDirectory: 'User directory',
  roleFilters: { all: 'All', admin: 'Admin', manager: 'Manager', operator: 'Operator', viewer: 'Viewer' },
  tableView: 'Table',
  cardsView: 'Cards',
  viewToggle: 'View toggle',
  avatar: 'Avatar',
  searchLabel: 'Search by name or email',
  searchPlaceholder: 'Search by name or email…',
  noUsersTitle: 'No users in the "{role}" role',
  noUsersBody: 'Try selecting a different role or invite someone new to this workspace.',
  emptyRoleName: { all: 'all', admin: 'Admin', manager: 'Manager', operator: 'Operator', viewer: 'Viewer' },
  tableHeaders: { name: 'Name', email: 'Email', role: 'Role', site: 'Site', lastActive: 'Last active', status: 'Status', actions: 'Actions' },
  statuses: { active: '● Active', invited: '⟳ Invited', disabled: '✕ Disabled' },
  rolePermissions: 'Role permissions',
  rolePermissionsDescription: 'What each role can do across modules. Edit by clicking a cell.',
  module: 'Module',
  roleCategoryLabels: { Admin: 'Admin', Manager: 'Manager', Operator: 'Operator', Viewer: 'Viewer' },
  permissionLabels: { admin: 'Full admin', rw: 'Read & write', r: 'Read only', none: 'No access' },
  lastActivePrefix: 'Last active',
  inviteDialogTitle: 'Invite team member',
  closeInviteDialog: 'Close invite dialog',
  emailAddress: 'Email address',
  emailPlaceholder: 'name@apex.pl',
  nameOptional: 'Full name (optional)',
  role: 'Role',
  site: 'Site',
  allSites: 'All sites',
  personalMessage: 'Personal message (optional)',
  personalMessagePlaceholder: 'Welcome to Monopilot!',
  inviteHelp: "They'll receive an email with a magic link. The link expires in 7 days.",
  cancel: 'Cancel',
  sendInvitation: 'Send invitation',
  invitationSent: 'Invitation sent to {email}',
  invitationFailed: 'Invitation failed: {error}',
  invalidInvite: 'Enter a valid email and role.',
  loadError: 'Unable to load users.',
  permissionDenied: 'You do not have permission to manage users.',
  roleAssignmentUnavailable: 'Role assignment unavailable',
  exportStatus: 'Export prepared',
};

const data: UsersScreenData = {
  roles: [
    { id: 'role-admin', code: 'admin', label: 'Admin', category: 'Admin' },
    { id: 'role-manager', code: 'manager', label: 'Manager', category: 'Manager' },
    { id: 'role-operator', code: 'operator', label: 'Operator', category: 'Operator' },
    { id: 'role-viewer', code: 'viewer', label: 'Viewer', category: 'Viewer' },
  ],
  users: [
    {
      id: 'user-maria',
      name: 'Maria Manager',
      email: 'maria@example.com',
      initials: 'MM',
      roleCode: 'manager',
      roleId: 'role-manager',
      roleLabel: 'Manager',
      roleCategory: 'Manager',
      site: 'Kraków HQ',
      lastActive: '2026-05-20 08:00',
      status: 'active',
    },
    {
      id: 'user-ola',
      name: 'Ola Operator',
      email: 'ola@example.com',
      initials: 'OO',
      roleCode: 'operator',
      roleId: 'role-operator',
      roleLabel: 'Operator',
      roleCategory: 'Operator',
      site: 'Wrocław',
      lastActive: '2026-05-19 10:30',
      status: 'active',
    },
  ],
  modules: ['NPD', 'Planning', 'Quality'],
  permissions: {
    NPD: { Admin: 'admin', Manager: 'rw', Operator: 'r', Viewer: 'none' },
    Planning: { Admin: 'admin', Manager: 'rw', Operator: 'r', Viewer: 'none' },
    Quality: { Admin: 'admin', Manager: 'rw', Operator: 'r', Viewer: 'none' },
  },
  kpis: { activeUsers: 2, invitedUsers: 0, disabledUsers: 0, seatLimit: 50 },
  canInviteUsers: true,
  canAssignRoles: true,
};

function renderScreen(overrides: Partial<SettingsUsersScreenProps & { assignRoleAction: AssignRoleAction; resetPasswordAction: ResetPasswordAction }> = {}) {
  const Screen = SettingsUsersScreen as React.ComponentType<SettingsUsersScreenProps & { assignRoleAction?: AssignRoleAction; resetPasswordAction?: ResetPasswordAction }>;
  return render(
    <Screen
      data={data}
      labels={labels}
      locale="en"
      searchParams={{ view: 'table', role: 'all' }}
      inviteUserAction={vi.fn().mockResolvedValue({ ok: true, data: { email: 'new@example.com', expiresAt: '2026-06-01T00:00:00Z' } })}
      {...overrides}
    />,
  );
}

describe('SettingsUsersScreen invite and role assignment parity', () => {
  beforeEach(() => {
    productionModalCalls.passwordReset.length = 0;
  });

  it('opens a single invite dialog from the route CTA and keeps the CTA fail-closed without invite permission', async () => {
    const user = userEvent.setup();
    const inviteUserAction = vi.fn().mockResolvedValue({ ok: true, data: { email: 'new@example.com', expiresAt: '2026-06-01T00:00:00Z' } });
    const { unmount } = renderScreen({ inviteUserAction });

    // BUG 2: the route CTA must render with the prominent primary variant
    // (shared .btn-primary in globals.css), not the low-contrast bare .btn.
    const inviteCta = screen.getByRole('button', { name: /invite user/i });
    expect(inviteCta).toHaveClass('btn-primary');
    const exportCta = screen.getByRole('button', { name: /^export$/i });
    expect(exportCta).toHaveClass('btn-secondary');

    await user.click(inviteCta);
    // Exactly ONE invite dialog is rendered (the duplicate competing modal that
    // caused the focus war / close-on-click is gone).
    const dialogs = await screen.findAllByRole('dialog', { name: /invite team member/i });
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toBeVisible();
    unmount();

    renderScreen({
      data: { ...data, canInviteUsers: false } as UsersScreenData,
      inviteUserAction,
    });
    const disabledInvite = screen.getAllByRole('button', { name: /invite user/i }).at(-1);
    expect(disabledInvite).toBeDisabled();
    await user.click(disabledInvite!);
    expect(screen.queryAllByRole('dialog', { name: /invite team member/i })).toHaveLength(0);
  });

  it('keeps the invite dialog open while the user moves between fields and retains entered values', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    const dialog = await screen.findByRole('dialog', { name: /invite team member/i });

    // Field A: email
    const email = within(dialog).getByRole('textbox', { name: /email address/i });
    await user.type(email, 'new@example.com');
    // Click/type a SECOND field — previously this closed the modal.
    const message = within(dialog).getByRole('textbox', { name: /personal message/i });
    await user.click(message);
    await user.type(message, 'Welcome aboard');

    // Modal still open, single instance, and both values retained.
    const stillOpen = screen.getAllByRole('dialog', { name: /invite team member/i });
    expect(stillOpen).toHaveLength(1);
    expect(within(stillOpen[0]).getByRole('textbox', { name: /email address/i })).toHaveValue('new@example.com');
    expect(within(stillOpen[0]).getByRole('textbox', { name: /personal message/i })).toHaveValue('Welcome aboard');
  });

  it('submits Invite user dialog through the injected Server Action with role, site, and personal message metadata', async () => {
    const user = userEvent.setup();
    const inviteUserAction = vi.fn().mockResolvedValue({ ok: true, data: { email: 'new@example.com', expiresAt: '2026-06-01T00:00:00Z' } });
    renderScreen({ inviteUserAction });

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    const dialog = await screen.findByRole('dialog', { name: /invite team member/i });
    await user.type(within(dialog).getByRole('textbox', { name: /email address/i }), 'new@example.com');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /^role$/i }), 'role-operator');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /^site$/i }), 'Wrocław');
    await user.type(within(dialog).getByRole('textbox', { name: /personal message/i }), 'Welcome to the line team');
    await user.click(within(dialog).getByRole('button', { name: /send invitation/i }));

    expect(inviteUserAction).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      roleId: 'role-operator',
      site: 'Wrocław',
      personalMessage: 'Welcome to the line team',
      language: 'en',
    }));
  });

  it('opens a controlled Role assignment dialog and persists the selected user/role through the Server Action path', async () => {
    const user = userEvent.setup();
    const assignRoleAction = vi.fn().mockResolvedValue({ ok: true, data: { targetUserId: 'user-maria', roleId: 'role-operator' } });
    renderScreen({ assignRoleAction });

    const row = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    await user.selectOptions(within(row).getByRole('combobox', { name: /Maria Manager Role/i }), 'role-operator');

    const dialog = await screen.findByRole('dialog', { name: /assign role/i });
    expect(within(dialog).getByLabelText(/search user/i)).toHaveValue('Maria Manager');
    expect(within(dialog).getByRole('combobox', { name: /new role/i })).toHaveValue('role-operator');
    await user.click(within(dialog).getByRole('button', { name: /assign role/i }));

    expect(assignRoleAction).toHaveBeenCalledWith({ targetUserId: 'user-maria', roleId: 'role-operator' });
    expect(screen.getByRole('status')).toHaveTextContent(/role.*updated|assigned/i);
  });

  it('opens a single role-assign dialog for the selected user with the role picker options', async () => {
    const user = userEvent.setup();
    const assignRoleAction = vi.fn().mockResolvedValue({ ok: true, data: { targetUserId: 'user-maria', roleId: 'role-operator' } });
    renderScreen({ assignRoleAction });

    const row = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    await user.selectOptions(within(row).getByRole('combobox', { name: /Maria Manager Role/i }), 'role-operator');

    // Exactly ONE role-assign dialog (no competing duplicate modal).
    const dialogs = await screen.findAllByRole('dialog', { name: /assign role/i });
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs[0];
    expect(within(dialog).getByLabelText(/search user/i)).toHaveValue('Maria Manager');
    const rolePicker = within(dialog).getByRole('combobox', { name: /new role/i });
    expect(within(rolePicker).getByRole('option', { name: 'Admin' })).toBeInTheDocument();
    expect(within(rolePicker).getByRole('option', { name: 'Viewer' })).toBeInTheDocument();
  });

  it('opens PasswordResetModal from a visible per-user action when allowed', async () => {
    const user = userEvent.setup();
    const resetPasswordAction = vi.fn().mockResolvedValue({ ok: true });
    renderScreen({
      data: { ...data, canResetPasswords: true } as UsersScreenData,
      resetPasswordAction,
    });

    const row = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    await user.click(within(row).getByRole('button', { name: /reset password for maria manager/i }));

    expect(await screen.findByRole('dialog', { name: /production password reset modal/i })).toBeVisible();
    expect(screen.getByText(/Reset target maria@example\.com/i)).toBeVisible();
    expect(productionModalCalls.passwordReset.at(-1)).toMatchObject({
      open: true,
      user: expect.objectContaining({ id: 'user-maria', email: 'maria@example.com' }),
    });
  });

  it('shows an explicit disabled password reset state instead of a hidden or generic action when reset permission is unavailable', () => {
    renderScreen({ data: { ...data, canResetPasswords: false } as UsersScreenData });

    const row = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    const resetControl = within(row).getByRole('button', { name: /password reset unavailable for maria manager/i });
    expect(resetControl).toBeDisabled();
  });

  it('renders normal users data without raw settings i18n keys or the generic load-error panel', () => {
    renderScreen();

    expect(screen.getByRole('heading', { name: /users & roles/i })).toBeVisible();
    expect(screen.getByText('Maria Manager')).toBeVisible();
    expect(screen.queryByRole('alert', { name: /unable to load users/i })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/settings\.users_screen|settings\.[a-z0-9_.-]+/i);
  });

  it('does NOT offer the set-password toggle when the create-with-password action is not wired', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    const dialog = await screen.findByRole('dialog', { name: /invite team member/i });
    expect(within(dialog).queryByRole('checkbox', { name: /set password instead of sending invite/i })).not.toBeInTheDocument();
    // Default path still shows the email-invite submit button.
    expect(within(dialog).getByRole('button', { name: /send invitation/i })).toBeVisible();
  });

  it('creates a user with a set password (no email) through the admin action when the toggle is enabled', async () => {
    const user = userEvent.setup();
    const createUserWithPasswordAction = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { email: 'direct@example.com', userId: 'user-new' } });
    renderScreen({
      labels: {
        ...labels,
        setPasswordToggle: 'Set password instead of sending invite',
        password: 'Password',
        confirmPassword: 'Confirm password',
        createUserButton: 'Create user',
        userCreated: 'User {email} created.',
        passwordMismatch: 'Passwords do not match.',
      },
      createUserWithPasswordAction,
    } as Partial<SettingsUsersScreenProps>);

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    const dialog = await screen.findByRole('dialog', { name: /invite team member/i });

    // The invite path must NOT be weakened — send-invitation is the default.
    expect(within(dialog).getByRole('button', { name: /send invitation/i })).toBeVisible();

    await user.click(within(dialog).getByRole('checkbox', { name: /set password instead of sending invite/i }));
    await user.type(within(dialog).getByRole('textbox', { name: /email address/i }), 'direct@example.com');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /^role$/i }), 'role-operator');
    await user.type(within(dialog).getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.type(within(dialog).getByLabelText('Confirm password'), 'Sup3r-Str0ng-Pass!');
    await user.click(within(dialog).getByRole('button', { name: /create user/i }));

    expect(createUserWithPasswordAction).toHaveBeenCalledWith({
      email: 'direct@example.com',
      password: 'Sup3r-Str0ng-Pass!',
      name: undefined,
      roleId: 'role-operator',
      language: 'en',
    });
    expect(screen.getByRole('status')).toHaveTextContent(/created/i);
  });

  it('blocks submission and shows a mismatch alert when the two passwords differ', async () => {
    const user = userEvent.setup();
    const createUserWithPasswordAction = vi.fn();
    renderScreen({
      labels: {
        ...labels,
        setPasswordToggle: 'Set password instead of sending invite',
        password: 'Password',
        confirmPassword: 'Confirm password',
        createUserButton: 'Create user',
        passwordMismatch: 'Passwords do not match.',
      },
      createUserWithPasswordAction,
    } as Partial<SettingsUsersScreenProps>);

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    const dialog = await screen.findByRole('dialog', { name: /invite team member/i });
    await user.click(within(dialog).getByRole('checkbox', { name: /set password instead of sending invite/i }));
    await user.type(within(dialog).getByRole('textbox', { name: /email address/i }), 'direct@example.com');
    await user.type(within(dialog).getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.type(within(dialog).getByLabelText('Confirm password'), 'Different-Pass-99!');
    await user.click(within(dialog).getByRole('button', { name: /create user/i }));

    expect(createUserWithPasswordAction).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i);
  });

  it('shows the forbidden-role specific message (not the opaque invalid_input toast) when the action returns forbidden_role', async () => {
    // Regression: previously ALL action failures surfaced as "User creation failed: invalid_input"
    // even when the root cause was a forbidden system role — giving zero field-level guidance.
    // After the fix the modal must show the dedicated forbidden-role message.
    const user = userEvent.setup();
    const createUserWithPasswordAction = vi.fn().mockResolvedValue({ ok: false, error: 'forbidden_role' });
    renderScreen({
      labels: {
        ...labels,
        setPasswordToggle: 'Set password instead of sending invite',
        password: 'Password',
        confirmPassword: 'Confirm password',
        createUserButton: 'Create user',
        userCreationFailed: 'User creation failed: {error}',
        userCreationForbiddenRole: 'The selected role is a system role and cannot be assigned directly.',
      },
      createUserWithPasswordAction,
    } as Partial<SettingsUsersScreenProps>);

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    const dialog = await screen.findByRole('dialog', { name: /invite team member/i });
    await user.click(within(dialog).getByRole('checkbox', { name: /set password instead of sending invite/i }));
    await user.type(within(dialog).getByRole('textbox', { name: /email address/i }), 'admin2@example.com');
    await user.type(within(dialog).getByLabelText('Password'), 'Sup3r-Str0ng-Pass!');
    await user.type(within(dialog).getByLabelText('Confirm password'), 'Sup3r-Str0ng-Pass!');
    await user.click(within(dialog).getByRole('button', { name: /create user/i }));

    const alert = await screen.findByRole('alert');
    // Must show the specific forbidden-role message, NOT "invalid_input"
    expect(alert).toHaveTextContent(/system role.*cannot be assigned/i);
    expect(alert).not.toHaveTextContent(/invalid_input/i);
  });
});
