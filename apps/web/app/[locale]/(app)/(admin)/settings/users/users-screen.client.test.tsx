import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ALL_PERMISSIONS } from '../../../../../../../../packages/rbac/src/permissions.enum';

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

// Mock ONLY the browser download side-effect; keep the real toCsv / isoDateStamp
// so the CSV shape + filename stamp assertions exercise production code.
const downloadCsvMock = vi.hoisted(() => vi.fn((_content: string, filename: string) => filename));
vi.mock('../../../../../../lib/shared/download', async (importActual) => {
  const actual = await importActual<typeof import('../../../../../../lib/shared/download')>();
  return { ...actual, downloadCsv: downloadCsvMock };
});

import SettingsUsersScreen, {
  type PermissionCell,
  type PermissionModuleSummary,
  type SettingsUsersScreenProps,
  type UsersScreenData,
  type UsersScreenLabels,
} from './users-screen.client';

type AssignRoleAction = (input: { targetUserId: string; roleId: string }) => Promise<
  | { ok: true; data: { targetUserId: string; roleId: string } }
  | { ok: false; error: string }
>;

type ResetPasswordAction = (input: { userId: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

type AssignUserSitesAction = (input: { userId: string; siteIds: string[] }) => Promise<
  | { ok: true; data: { userId: string; siteIds: string[] } }
  | { ok: false; error: string }
>;

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
  tableHeaders: { name: 'Name', email: 'Email', role: 'Role', site: 'Site', mfa: 'MFA', lastLogin: 'Last login', lastActive: 'Last active', status: 'Status', actions: 'Actions' },
  mfaEnrolled: 'Enrolled',
  mfaNotEnrolled: 'Not enrolled',
  lastLoginNever: 'Never',
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
  assignSites: 'Assign sites',
  assignSitesUnavailable: 'Site assignment unavailable',
  assignSitesDialogTitle: 'Assign sites',
  assignSitesDialogSubtitle: 'Choose which sites this user can see and select.',
  assignSitesHelp: 'The user will only see the selected sites.',
  assignSitesEmptyHint: 'No sites selected — the user can see ALL sites (unrestricted).',
  noOrgSites: 'No sites are configured for this organization yet.',
  saveSites: 'Save sites',
  sitesAssignmentSuccess: 'Site access updated.',
  sitesAssignmentFailed: 'Site assignment failed: {error}.',
};

function permissionGroupId(permission: string): string {
  return permission.split('.')[0] ?? permission;
}

function permissionGroupLabel(groupId: string): string {
  return groupId
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function permissionGroups(): Array<PermissionModuleSummary & { permissions: string[] }> {
  const groups = new Map<string, string[]>();
  for (const permission of ALL_PERMISSIONS) {
    const groupId = permissionGroupId(permission);
    const permissions = groups.get(groupId) ?? [];
    permissions.push(permission);
    groups.set(groupId, permissions);
  }
  return Array.from(groups, ([id, permissions]) => ({ id, label: permissionGroupLabel(id), permissions }));
}

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
      assignedSiteIds: ['site-krk'],
      lastLogin: '2026-05-20 08:00',
      mfaEnrolled: true,
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
      site: 'All sites',
      assignedSiteIds: [],
      lastLogin: '—',
      mfaEnrolled: false,
      lastActive: '2026-05-19 10:30',
      status: 'active',
    },
  ],
  siteOptions: [
    { id: 'site-krk', name: 'Kraków HQ' },
    { id: 'site-wro', name: 'Wrocław' },
  ],
  modules: [
    { id: 'npd', label: 'NPD' },
    { id: 'planning', label: 'Planning' },
    { id: 'quality', label: 'Quality' },
  ],
  permissions: {
    npd: { 'role-admin': 'admin', 'role-manager': 'rw', 'role-operator': 'r', 'role-viewer': 'none' },
    planning: { 'role-admin': 'admin', 'role-manager': 'rw', 'role-operator': 'r', 'role-viewer': 'none' },
    quality: { 'role-admin': 'admin', 'role-manager': 'rw', 'role-operator': 'r', 'role-viewer': 'none' },
  },
  kpis: { activeUsers: 2, invitedUsers: 0, disabledUsers: 0, seatLimit: 50 },
  canInviteUsers: true,
  canAssignRoles: true,
};

function renderScreen(overrides: Partial<SettingsUsersScreenProps & { assignRoleAction: AssignRoleAction; resetPasswordAction: ResetPasswordAction; assignUserSitesAction: AssignUserSitesAction }> = {}) {
  const Screen = SettingsUsersScreen as React.ComponentType<SettingsUsersScreenProps & { assignRoleAction?: AssignRoleAction; resetPasswordAction?: ResetPasswordAction; assignUserSitesAction?: AssignUserSitesAction }>;
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

  it('renders the real per-user Site column: an assigned site name, and "All sites" for an unassigned user', () => {
    renderScreen({ assignUserSitesAction: vi.fn() });

    // Maria has one assigned site → its name is shown (not a hardcoded "All sites").
    const mariaRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    expect(within(mariaRow).getByText('Kraków HQ')).toBeVisible();
    // Ola has ZERO assignments → falls back to the "All sites" unrestricted label.
    const olaRow = screen.getByRole('row', { name: /Ola Operator ola@example\.com/i });
    expect(within(olaRow).getByText('All sites')).toBeVisible();
  });

  it('opens the Assign sites dialog pre-checked to the user\'s current assignments and persists the new set through the Server Action', async () => {
    const user = userEvent.setup();
    const assignUserSitesAction = vi.fn().mockResolvedValue({ ok: true, data: { userId: 'user-maria', siteIds: ['site-krk', 'site-wro'] } });
    renderScreen({ assignUserSitesAction });

    const mariaRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    await user.click(within(mariaRow).getByRole('button', { name: /assign sites for maria manager/i }));

    const dialog = await screen.findByRole('dialog', { name: /assign sites/i });
    // Pre-checked to the current assignment (Kraków HQ), Wrocław unchecked.
    const krk = within(dialog).getByRole('checkbox', { name: 'Kraków HQ' });
    const wro = within(dialog).getByRole('checkbox', { name: 'Wrocław' });
    expect(krk).toBeChecked();
    expect(wro).not.toBeChecked();

    // Add Wrocław, then save → the FULL set is the authoritative payload.
    await user.click(wro);
    await user.click(within(dialog).getByRole('button', { name: /save sites/i }));

    expect(assignUserSitesAction).toHaveBeenCalledWith({ userId: 'user-maria', siteIds: ['site-krk', 'site-wro'] });
    expect(screen.getByRole('status')).toHaveTextContent(/site access updated/i);
  });

  it('treats an emptied Assign sites selection as unassign-all (empty payload = unrestricted)', async () => {
    const user = userEvent.setup();
    const assignUserSitesAction = vi.fn().mockResolvedValue({ ok: true, data: { userId: 'user-maria', siteIds: [] } });
    renderScreen({ assignUserSitesAction });

    const mariaRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    await user.click(within(mariaRow).getByRole('button', { name: /assign sites for maria manager/i }));
    const dialog = await screen.findByRole('dialog', { name: /assign sites/i });

    // Uncheck the only assigned site → empty set.
    await user.click(within(dialog).getByRole('checkbox', { name: 'Kraków HQ' }));
    expect(within(dialog).getByText(/can see ALL sites/i)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: /save sites/i }));

    expect(assignUserSitesAction).toHaveBeenCalledWith({ userId: 'user-maria', siteIds: [] });
  });

  it('keeps the Assign sites affordance fail-closed (disabled) when no assign-sites action is wired', () => {
    renderScreen();

    const mariaRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    const assignControl = within(mariaRow).getByRole('button', { name: /site assignment unavailable for maria manager/i });
    expect(assignControl).toBeDisabled();
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

  it('renders every permission module group with real role columns and denied cells for a minimal role', () => {
    const groups = permissionGroups();
    const modules = groups.map(({ id, label }) => ({ id, label }));
    const permissions = Object.fromEntries(
      groups.map((group) => [
        group.id,
        {
          'role-admin': 'admin' satisfies PermissionCell,
          'role-viewer': 'none' satisfies PermissionCell,
        },
      ]),
    );

    renderScreen({
      data: {
        ...data,
        roles: [
          { id: 'role-admin', code: 'admin', label: 'Admin', category: 'Admin' },
          { id: 'role-viewer', code: 'viewer', label: 'Viewer', category: 'Viewer' },
        ],
        modules,
        permissions,
      },
    });

    const matrix = screen.getByRole('table', { name: /role permissions/i });
    const rows = within(matrix).getAllByRole('row').slice(1);
    expect(groups).toHaveLength(24);
    expect(rows).toHaveLength(groups.length);
    expect(within(matrix).getByRole('columnheader', { name: 'Admin' })).toBeVisible();
    expect(within(matrix).getByRole('columnheader', { name: 'Viewer' })).toBeVisible();

    for (const row of rows) {
      const cells = within(row).getAllByRole('cell');
      expect(cells).toHaveLength(3);
      expect(cells[1]).not.toHaveTextContent('–');
      expect(within(cells[1]).queryByLabelText('No access')).not.toBeInTheDocument();
      expect(cells[2]).toHaveTextContent('–');
      expect(within(cells[2]).getByLabelText('No access')).toBeVisible();
    }
  });
});

type DeactivateUserAction = (input: { userId: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

const deactivateLabels: Partial<UsersScreenLabels> = {
  deactivate: 'Deactivate',
  deactivateUnavailable: 'Deactivation unavailable',
  deactivateDialogTitle: 'Deactivate user',
  deactivateDialogBody: '{name} will be signed out and blocked from signing in.',
  deactivateConfirm: 'Deactivate user',
  deactivating: 'Deactivating…',
  deactivateSuccess: 'User deactivated.',
  deactivateFailed: 'Could not deactivate the user: {error}.',
  deactivateSelf: 'You cannot deactivate your own account.',
};

describe('SettingsUsersScreen MFA + last-login columns (F2-C1 item 3)', () => {
  it('shows MFA-enrolled status and last-login per user in the table', () => {
    renderScreen();

    const mariaRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    // Maria: MFA enrolled + a real last-login stamp.
    expect(within(mariaRow).getByTestId('settings-user-mfa')).toHaveAttribute('data-mfa', 'enrolled');
    expect(within(mariaRow).getByText('2026-05-20 08:00')).toBeVisible();

    // Ola: not enrolled + never-logged-in fallback (lastLogin === '—' → "Never").
    const olaRow = screen.getByRole('row', { name: /Ola Operator ola@example\.com/i });
    expect(within(olaRow).getByTestId('settings-user-mfa')).toHaveAttribute('data-mfa', 'not-enrolled');
    expect(within(olaRow).getByText('Never')).toBeVisible();
  });
});

describe('SettingsUsersScreen deactivate flow (F2-C1 item 2)', () => {
  it('keeps the Deactivate control fail-closed (disabled) when no deactivate action / permission is wired', () => {
    renderScreen();

    const mariaRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    const control = within(mariaRow).getByRole('button', { name: /deactivation unavailable for maria manager/i });
    expect(control).toBeDisabled();
  });

  it('opens a confirm dialog and deactivates the user through the injected Server Action, then marks them visibly distinct', async () => {
    const user = userEvent.setup();
    const deactivateUserAction = vi.fn().mockResolvedValue({ ok: true }) as DeactivateUserAction;
    renderScreen({
      data: { ...data, canDeactivateUsers: true } as UsersScreenData,
      labels: { ...labels, ...deactivateLabels } as UsersScreenLabels,
      deactivateUserAction,
    } as Partial<SettingsUsersScreenProps>);

    const mariaRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    await user.click(within(mariaRow).getByRole('button', { name: /^deactivate maria manager$/i }));

    // Confirm dialog names the target, then confirm.
    const dialog = await screen.findByRole('dialog', { name: /deactivate user/i });
    expect(within(dialog).getByText(/Maria Manager will be signed out/i)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: /^deactivate user$/i }));

    expect(deactivateUserAction).toHaveBeenCalledWith({ userId: 'user-maria' });

    // Success toast + the row is now visibly the disabled status (optimistic).
    expect(await screen.findByRole('status')).toHaveTextContent(/deactivated/i);
    const disabledRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    expect(disabledRow).toHaveAttribute('data-status', 'disabled');
    expect(within(disabledRow).getByText('✕ Disabled')).toBeVisible();
    // A deactivated user no longer offers a Deactivate button.
    expect(within(disabledRow).queryByRole('button', { name: /^deactivate maria manager$/i })).not.toBeInTheDocument();
  });

  it('surfaces a self-deactivation guard message when the action rejects it', async () => {
    const user = userEvent.setup();
    const deactivateUserAction = vi.fn().mockResolvedValue({ ok: false, error: 'self_deactivation' }) as DeactivateUserAction;
    renderScreen({
      data: { ...data, canDeactivateUsers: true } as UsersScreenData,
      labels: { ...labels, ...deactivateLabels } as UsersScreenLabels,
      deactivateUserAction,
    } as Partial<SettingsUsersScreenProps>);

    const mariaRow = screen.getByRole('row', { name: /Maria Manager maria@example\.com/i });
    await user.click(within(mariaRow).getByRole('button', { name: /^deactivate maria manager$/i }));
    const dialog = await screen.findByRole('dialog', { name: /deactivate user/i });
    await user.click(within(dialog).getByRole('button', { name: /^deactivate user$/i }));

    // The self-deactivation guard is surfaced (both the dialog inline error and
    // the page feedback banner name it).
    const guards = await screen.findAllByText(/cannot deactivate your own account/i);
    expect(guards.length).toBeGreaterThan(0);
    // Not marked disabled — the action failed.
    expect(screen.getByRole('row', { name: /Maria Manager maria@example\.com/i })).toHaveAttribute('data-status', 'active');
  });
});

describe('SettingsUsersScreen CSV export shape (F2-C1 item 4)', () => {
  it('exports email, name, role, sites, MFA, last login, status columns for the visible users', async () => {
    const user = userEvent.setup();
    // Capture the CSV the screen hands to the shared downloadCsv helper.
    downloadCsvMock.mockClear();

    renderScreen();
    await user.click(screen.getByRole('button', { name: /^export$/i }));
    await screen.findByRole('status');

    expect(downloadCsvMock).toHaveBeenCalledTimes(1);
    const [csv, filename] = downloadCsvMock.mock.calls[0] as [string, string];
    expect(filename).toMatch(/^settings-users-\d{4}-\d{2}-\d{2}\.csv$/);

    const [header, mariaLine, olaLine] = csv.split('\r\n');
    // Task column order: email, name, role(s), sites, MFA, last login, status.
    expect(header).toBe('Email,Name,Role,Site,MFA,Last login,Status');
    // Maria: enrolled MFA + real last-login stamp + active status.
    expect(mariaLine).toBe('maria@example.com,Maria Manager,Manager,Kraków HQ,Enrolled,2026-05-20 08:00,● Active');
    // Ola: not enrolled + never-logged-in dash + all-sites.
    expect(olaLine).toContain('ola@example.com');
    expect(olaLine).toContain('Not enrolled');
  });
});
