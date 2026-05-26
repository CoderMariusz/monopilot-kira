import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const productionModalCalls = vi.hoisted(() => ({
  invite: [] as Array<{ open: boolean; roles: string[] }>,
  roleAssign: [] as Array<{ open: boolean; users: Array<{ id: string; currentRoleLabel: string }>; roles: Array<{ id: string; label: string }> }>,
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

vi.mock('../../../../../../components/settings/modals/user-invite-modal', () => ({
  UserInviteModal: (props: { open: boolean; roles: string[]; onOpenChange: (open: boolean) => void }) => {
    productionModalCalls.invite.push({ open: props.open, roles: props.roles });
    if (!props.open) return null;
    return (
      <div role="dialog" aria-modal="true" aria-label="production invite modal">
        <p>Production UserInviteModal</p>
        <button type="button" onClick={() => props.onOpenChange(false)}>Close production invite</button>
      </div>
    );
  },
}));

vi.mock('../../../../../../components/settings/modals/role-assign-modal', () => ({
  RoleAssignModal: (props: {
    open: boolean;
    users: Array<{ id: string; currentRoleLabel: string }>;
    roles: Array<{ id: string; label: string }>;
    onOpenChange: (open: boolean) => void;
  }) => {
    productionModalCalls.roleAssign.push({ open: props.open, users: props.users, roles: props.roles });
    if (!props.open) return null;
    return (
      <div role="dialog" aria-modal="true" aria-label="production role assign modal">
        <p>Production RoleAssignModal</p>
        <p>Selected user {props.users[0]?.id}</p>
        <p>Role options {props.roles.map((role) => role.label).join(', ')}</p>
        <button type="button" onClick={() => props.onOpenChange(false)}>Close production role assign</button>
      </div>
    );
  },
}));

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
    productionModalCalls.invite.length = 0;
    productionModalCalls.roleAssign.length = 0;
    productionModalCalls.passwordReset.length = 0;
  });

  it('opens the production UserInviteModal from the route CTA and keeps the CTA fail-closed without invite permission', async () => {
    const user = userEvent.setup();
    const inviteUserAction = vi.fn().mockResolvedValue({ ok: true, data: { email: 'new@example.com', expiresAt: '2026-06-01T00:00:00Z' } });
    renderScreen({ inviteUserAction });

    await user.click(screen.getByRole('button', { name: /invite user/i }));
    expect(await screen.findByRole('dialog', { name: /production invite modal/i })).toBeVisible();
    expect(productionModalCalls.invite.at(-1)).toMatchObject({ open: true, roles: ['Admin', 'Manager', 'Operator', 'Viewer'] });

    renderScreen({
      data: { ...data, canInviteUsers: false } as UsersScreenData,
      inviteUserAction,
    });
    const disabledInvite = screen.getAllByRole('button', { name: /invite user/i }).at(-1);
    expect(disabledInvite).toBeDisabled();
    await user.click(disabledInvite!);
    expect(screen.queryAllByRole('dialog', { name: /production invite modal/i })).toHaveLength(1);
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

  it('opens the production RoleAssignModal for the selected user and passes role picker options/categories', async () => {
    const user = userEvent.setup();
    const assignRoleAction = vi.fn().mockResolvedValue({ ok: true, data: { targetUserId: 'user-maria', roleId: 'role-operator' } });
    renderScreen({ assignRoleAction });

    const row = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    await user.selectOptions(within(row).getByRole('combobox', { name: /Maria Manager Role/i }), 'role-operator');

    expect(await screen.findByRole('dialog', { name: /production role assign modal/i })).toBeVisible();
    expect(screen.getByText(/Selected user user-maria/i)).toBeVisible();
    expect(screen.getByText(/Role options Admin, Manager, Operator, Viewer/i)).toBeVisible();
    expect(productionModalCalls.roleAssign.at(-1)).toMatchObject({
      open: true,
      users: [expect.objectContaining({ id: 'user-maria', currentRoleLabel: 'Manager' })],
    });
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
});
