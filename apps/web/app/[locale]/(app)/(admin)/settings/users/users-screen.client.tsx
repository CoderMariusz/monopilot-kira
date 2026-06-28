'use client';

import React, { useMemo, useState, useTransition } from 'react';

import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';

import { PasswordResetModal } from '../../../../../../components/settings/modals/password-reset-modal';

export type RoleCategory = 'Admin' | 'Manager' | 'Operator' | 'Viewer';
export type UserStatus = 'active' | 'invited' | 'disabled';
export type PermissionCell = 'admin' | 'rw' | 'r' | 'none';
export type RoleFilter = 'all' | 'admin' | 'manager' | 'operator' | 'viewer';
export type UsersView = 'table' | 'cards';
export type PermissionModuleSummary = {
  id: string;
  label: string;
};

export type SettingsUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  roleCode: string;
  roleId: string;
  roleLabel: string;
  roleCategory: RoleCategory;
  /** Human-readable assigned-site label (site name(s) joined, or "All sites" when unassigned). */
  site: string;
  /** Authoritative ids of the user's currently-assigned org sites (empty = unrestricted). */
  assignedSiteIds: string[];
  lastActive: string;
  status: UserStatus;
};

export type RoleSummary = {
  id: string;
  code: string;
  label: string;
  category: RoleCategory;
};

export type SiteOption = {
  id: string;
  name: string;
};

export type UsersKpis = {
  activeUsers: number;
  invitedUsers: number;
  disabledUsers: number;
  seatLimit: number | null;
};

export type UsersScreenData = {
  users: SettingsUser[];
  roles: RoleSummary[];
  /** All active org sites — the admin assigns from this full list. */
  siteOptions: SiteOption[];
  modules: PermissionModuleSummary[];
  permissions: Record<string, Record<string, PermissionCell>>;
  kpis: UsersKpis;
  canInviteUsers: boolean;
  canAssignRoles: boolean;
  canResetPasswords?: boolean;
};

export type UsersSearchParams = {
  view?: UsersView;
  role?: RoleFilter;
  q?: string;
};

export type UsersScreenLabels = {
  title: string;
  summary: string;
  export: string;
  inviteUser: string;
  active: string;
  invited: string;
  disabled: string;
  seatsUsed: string;
  seatsUnlimited: string;
  userDirectory: string;
  roleFilters: Record<RoleFilter, string>;
  tableView: string;
  cardsView: string;
  viewToggle: string;
  avatar: string;
  searchLabel: string;
  searchPlaceholder: string;
  noUsersTitle: string;
  noUsersBody: string;
  emptyRoleName: Record<RoleFilter, string>;
  tableHeaders: {
    name: string;
    email: string;
    role: string;
    site: string;
    lastActive: string;
    status: string;
    actions: string;
  };
  statuses: Record<UserStatus, string>;
  rolePermissions: string;
  rolePermissionsDescription: string;
  module: string;
  roleCategoryLabels: Record<RoleCategory, string>;
  permissionLabels: Record<PermissionCell, string>;
  lastActivePrefix: string;
  inviteDialogTitle: string;
  closeInviteDialog: string;
  emailAddress: string;
  emailPlaceholder: string;
  nameOptional: string;
  role: string;
  site: string;
  allSites: string;
  personalMessage: string;
  personalMessagePlaceholder: string;
  inviteHelp: string;
  cancel: string;
  sendInvitation: string;
  invitationSent: string;
  invitationFailed: string;
  invalidInvite: string;
  loadError: string;
  permissionDenied: string;
  roleAssignmentUnavailable: string;
  assignRoleDialogTitle?: string;
  roleAssignmentSubtitle?: string;
  searchUser?: string;
  searchUserPlaceholder?: string;
  newRole?: string;
  pickRole?: string;
  roleAssignmentPreview?: string;
  roleAssignmentSuccess?: string;
  roleAssignmentFailed?: string;
  resetPassword?: string;
  resetPasswordUnavailable?: string;
  passwordResetSuccess?: string;
  passwordResetFailed?: string;
  exportStatus: string;
  setPasswordToggle?: string;
  setPasswordToggleHint?: string;
  password?: string;
  passwordPlaceholder?: string;
  confirmPassword?: string;
  confirmPasswordPlaceholder?: string;
  passwordStrengthHint?: string;
  passwordMismatch?: string;
  createUserButton?: string;
  createUserHelp?: string;
  userCreated?: string;
  userCreationFailed?: string;
  /** Shown when the chosen role is a privileged system role that cannot be self-served (forbidden_role). */
  userCreationForbiddenRole?: string;
  // ── Per-user site assignment (mig 381 user_sites) ──────────────────────────
  assignSites?: string;
  assignSitesUnavailable?: string;
  assignSitesDialogTitle?: string;
  assignSitesDialogSubtitle?: string;
  assignSitesHelp?: string;
  assignSitesEmptyHint?: string;
  noOrgSites?: string;
  saveSites?: string;
  sitesAssignmentSuccess?: string;
  sitesAssignmentFailed?: string;
};

export type InviteUserAction = (input: {
  email: string;
  name?: string;
  roleId: string;
  site?: string;
  personalMessage?: string;
  language?: string;
  redirectTo?: string;
}) => Promise<
  | { ok: true; data: { email: string; expiresAt: string } }
  | { ok: false; error: string }
>;

export type AssignRoleAction = (input: { targetUserId: string; roleId: string }) => Promise<
  | { ok: true; data: { targetUserId: string; roleId: string } }
  | { ok: false; error: string }
>;

export type AssignUserSitesAction = (input: { userId: string; siteIds: string[] }) => Promise<
  | { ok: true; data: { userId: string; siteIds: string[] } }
  | { ok: false; error: string }
>;

export type CreateUserWithPasswordAction = (input: {
  email: string;
  password: string;
  name?: string;
  roleId: string;
  language?: string;
}) => Promise<
  | { ok: true; data: { email: string; userId: string } }
  | { ok: false; error: string }
>;

export type ResetPasswordAction = (input: { userId: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

export type SettingsUsersScreenProps = {
  data: UsersScreenData;
  labels: UsersScreenLabels;
  searchParams?: UsersSearchParams;
  locale: string;
  inviteUserAction?: InviteUserAction;
  assignRoleAction?: AssignRoleAction;
  assignUserSitesAction?: AssignUserSitesAction;
  resetPasswordAction?: ResetPasswordAction;
  createUserWithPasswordAction?: CreateUserWithPasswordAction;
};

const roleFilters: RoleFilter[] = ['all', 'admin', 'manager', 'operator', 'viewer'];
const permissionGlyphs: Record<PermissionCell, string> = {
  admin: '◉',
  rw: '✎',
  r: '◎',
  none: '–',
};

function normalizeRoleFilter(value?: string): RoleFilter {
  return roleFilters.includes(value as RoleFilter) ? (value as RoleFilter) : 'all';
}

function normalizeView(value?: string): UsersView {
  return value === 'cards' ? 'cards' : 'table';
}

function roleMatchesFilter(user: SettingsUser, role: RoleFilter) {
  return role === 'all' || user.roleCategory.toLowerCase() === role;
}

function pillTone(value: string) {
  if (/admin/i.test(value)) return 'border-red-200 bg-red-50 text-red-800';
  if (/manager|planner|lead/i.test(value)) return 'border-blue-200 bg-blue-50 text-blue-800';
  if (/operator|active/i.test(value)) return 'border-green-200 bg-green-50 text-green-800';
  if (/invited/i.test(value)) return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function Pill({ children, toneKey }: { children: React.ReactNode; toneKey: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${pillTone(toneKey)}`}>
      {children}
    </span>
  );
}

function KpiTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div data-testid="users-kpi-tile" className="rounded-xl border bg-white p-4 shadow-sm">
      <div data-testid="users-kpi-label" className="text-xs text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{children}</div>
    </div>
  );
}

function permissionTitle(permission: PermissionCell, labels: UsersScreenLabels) {
  return labels.permissionLabels[permission];
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)), template);
}

function toCsv(users: SettingsUser[], labels: UsersScreenLabels) {
  const headers = [
    labels.tableHeaders.name,
    labels.tableHeaders.email,
    labels.tableHeaders.role,
    labels.tableHeaders.site,
    labels.tableHeaders.lastActive,
    labels.tableHeaders.status,
  ];
  const rows = users.map((user) => [
    user.name,
    user.email,
    user.roleLabel,
    user.site,
    user.lastActive,
    labels.statuses[user.status],
  ]);
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

function InviteDialog({
  open,
  onOpenChange,
  labels,
  data,
  locale,
  inviteUserAction,
  createUserWithPasswordAction,
  onFeedback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: UsersScreenLabels;
  data: UsersScreenData;
  locale: string;
  inviteUserAction?: InviteUserAction;
  createUserWithPasswordAction?: CreateUserWithPasswordAction;
  onFeedback: (feedback: { kind: 'status' | 'alert'; message: string } | null) => void;
}) {
  const defaultRoleId = data.roles.find((role) => role.category === 'Manager')?.id ?? data.roles[0]?.id ?? '';
  // Invite site picker draws from the real org sites (mig 381 source) when
  // available, falling back to the labels derived from the directory.
  const sites = data.siteOptions.length > 0
    ? data.siteOptions.map((site) => site.name)
    : Array.from(new Set(data.users.map((user) => user.site))).filter(Boolean);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [site, setSite] = useState(sites[0] ?? labels.allSites);
  const [personalMessage, setPersonalMessage] = useState('');
  // Admin-only alternative path: set a password directly instead of emailing
  // a magic-link invite. Only offered when the create-with-password action is
  // wired (which itself is gated on the same admin permission server-side).
  const [setPasswordMode, setSetPasswordMode] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPending, startTransition] = useTransition();

  const canSetPassword = Boolean(createUserWithPasswordAction);

  function resetForm() {
    setEmail('');
    setName('');
    setSite(sites[0] ?? labels.allSites);
    setPersonalMessage('');
    setPassword('');
    setConfirmPassword('');
  }

  function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (setPasswordMode) {
      if (!createUserWithPasswordAction || !email.trim() || !roleId || !password) {
        onFeedback({ kind: 'alert', message: labels.invalidInvite });
        return;
      }
      if (password !== confirmPassword) {
        onFeedback({ kind: 'alert', message: labels.passwordMismatch ?? 'Passwords do not match.' });
        return;
      }

      startTransition(async () => {
        const result = await createUserWithPasswordAction({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          roleId,
          language: locale,
        });
        if (result.ok) {
          onFeedback({
            kind: 'status',
            message: interpolate(labels.userCreated ?? 'User {email} created.', { email: result.data.email }),
          });
          resetForm();
          onOpenChange(false);
          return;
        }
        // forbidden_role has its own label so the user knows WHICH field is wrong
        const errorMessage = result.error === 'forbidden_role'
          ? (labels.userCreationForbiddenRole ?? 'The selected role cannot be assigned directly — choose a non-system role.')
          : interpolate(labels.userCreationFailed ?? 'User creation failed: {error}', { error: result.error });
        onFeedback({ kind: 'alert', message: errorMessage });
      });
      return;
    }

    if (!inviteUserAction || !email.trim() || !roleId) {
      onFeedback({ kind: 'alert', message: labels.invalidInvite });
      return;
    }

    startTransition(async () => {
      const result = await inviteUserAction({
        email: email.trim(),
        name: name.trim() || undefined,
        roleId,
        site: site && site !== labels.allSites ? site : undefined,
        personalMessage: personalMessage.trim() || undefined,
        language: locale,
      });
      if (result.ok) {
        onFeedback({ kind: 'status', message: interpolate(labels.invitationSent, { email: result.data.email }) });
        resetForm();
        onOpenChange(false);
        return;
      }
      onFeedback({ kind: 'alert', message: interpolate(labels.invitationFailed, { error: result.error }) });
    });
  }

  const submitDisabled = isPending || (setPasswordMode ? !createUserWithPasswordAction : !inviteUserAction);

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="SM-06">
      <Modal.Header title={labels.inviteDialogTitle} />
      <form onSubmit={submitInvite}>
        <Modal.Body>
          <div className="space-y-4 px-5 py-4">
            {canSetPassword ? (
              <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={setPasswordMode}
                  onChange={(event) => setSetPasswordMode(event.currentTarget.checked)}
                  aria-label={labels.setPasswordToggle ?? 'Set password instead of sending invite'}
                />
                <span>
                  <span className="font-medium">{labels.setPasswordToggle ?? 'Set password instead of sending invite'}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {labels.setPasswordToggleHint ?? 'Admin only — creates an active account immediately, no email sent.'}
                  </span>
                </span>
              </label>
            ) : null}
            <label className="block space-y-1 text-sm font-medium">
              <span>{labels.emailAddress}</span>
              <Input type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder={labels.emailPlaceholder} autoFocus required />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              <span>{labels.nameOptional}</span>
              <Input type="text" value={name} onChange={(event) => setName(event.currentTarget.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1 text-sm font-medium">
                <span>{labels.role}</span>
                <select
                  value={roleId}
                  onChange={(event) => setRoleId(event.currentTarget.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                >
                  {data.roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
              {!setPasswordMode ? (
                <label className="block space-y-1 text-sm font-medium">
                  <span>{labels.site}</span>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={site} onChange={(event) => setSite(event.currentTarget.value)}>
                    {(sites.length > 0 ? sites : [labels.allSites]).map((siteOption) => (
                      <option key={siteOption} value={siteOption}>{siteOption}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {setPasswordMode ? (
              <>
                <label className="block space-y-1 text-sm font-medium">
                  <span>{labels.password ?? 'Password'}</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    placeholder={labels.passwordPlaceholder ?? 'Set a strong password'}
                    required
                  />
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  <span>{labels.confirmPassword ?? 'Confirm password'}</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                    placeholder={labels.confirmPasswordPlaceholder ?? 'Re-enter the password'}
                    required
                  />
                </label>
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {labels.createUserHelp ?? 'The account is created active with this password. No email is sent.'}
                  {' '}
                  {labels.passwordStrengthHint ?? 'Use at least 12 characters with mixed letters, numbers, and symbols.'}
                </p>
              </>
            ) : (
              <>
                <label className="block space-y-1 text-sm font-medium">
                  <span>{labels.personalMessage}</span>
                  <Textarea rows={2} placeholder={labels.personalMessagePlaceholder} value={personalMessage} onChange={(event) => setPersonalMessage(event.currentTarget.value)} />
                </label>
                <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                  {labels.inviteHelp}
                </p>
              </>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary" disabled={submitDisabled}>
              {setPasswordMode ? (labels.createUserButton ?? 'Create user') : labels.sendInvitation}
            </Button>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function RoleAssignDialog({
  draft,
  onClose,
  labels,
  data,
  assignRoleAction,
  onFeedback,
}: {
  draft: { user: SettingsUser; roleId: string } | null;
  onClose: () => void;
  labels: UsersScreenLabels;
  data: UsersScreenData;
  assignRoleAction?: AssignRoleAction;
  onFeedback: (feedback: { kind: 'status' | 'alert'; message: string } | null) => void;
}) {
  const [roleId, setRoleId] = useState(draft?.roleId ?? '');
  const [isPending, startTransition] = useTransition();

  React.useEffect(() => {
    setRoleId(draft?.roleId ?? '');
  }, [draft?.roleId, draft?.user.id]);

  const title = labels.assignRoleDialogTitle ?? 'Assign role';
  const searchUser = labels.searchUser ?? 'Search user';
  const newRole = labels.newRole ?? 'New role';
  const pickRole = labels.pickRole ?? '— pick role —';
  const selectedRoleLabel = data.roles.find((role) => role.id === roleId)?.label ?? roleId;
  const preview = draft
    ? interpolate(labels.roleAssignmentPreview ?? 'Assigning {role} to {user}. Previous role {previousRole} will be replaced.', {
      role: selectedRoleLabel,
      user: draft.user.name,
      previousRole: draft.user.roleLabel,
    })
    : '';

  function submitAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !roleId || !assignRoleAction) {
      onFeedback({ kind: 'alert', message: labels.roleAssignmentUnavailable });
      return;
    }

    startTransition(async () => {
      const result = await assignRoleAction({ targetUserId: draft.user.id, roleId });
      if (result.ok) {
        onFeedback({ kind: 'status', message: labels.roleAssignmentSuccess ?? 'Role updated.' });
        onClose();
        return;
      }
      onFeedback({
        kind: 'alert',
        message: interpolate(labels.roleAssignmentFailed ?? 'Role assignment failed: {error}.', { error: result.error }),
      });
    });
  }

  return (
    <Modal open={Boolean(draft)} onOpenChange={(open) => { if (!open) onClose(); }} size="lg" modalId="SM-07">
      <Modal.Header title={title} />
      <p className="px-5 pt-2 text-sm text-muted-foreground">{labels.roleAssignmentSubtitle ?? 'Pick a user, then the new role.'}</p>
      <form onSubmit={submitAssignment}>
        <Modal.Body>
          <div className="space-y-4 px-5 py-4">
            <label className="block space-y-1 text-sm font-medium">
              <span>{searchUser}</span>
              <Input
                value={draft?.user.name ?? ''}
                placeholder={labels.searchUserPlaceholder ?? 'Name or email…'}
                readOnly
                autoFocus
              />
            </label>
            {draft ? (
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">
                    {draft.user.initials}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{draft.user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {draft.user.email} · current: {draft.user.roleLabel}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <label className="block space-y-1 text-sm font-medium">
              <span>{newRole}</span>
              <select
                aria-label={newRole}
                value={roleId}
                onChange={(event) => setRoleId(event.currentTarget.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                required
              >
                <option value="">{pickRole}</option>
                {data.roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
            </label>
            {draft && roleId && roleId !== draft.user.roleId ? (
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                {preview}
              </p>
            ) : null}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" className="btn-secondary" onClick={onClose}>{labels.cancel}</Button>
            <Button type="submit" className="btn-primary" disabled={isPending || !draft || !roleId || roleId === draft.user.roleId || !assignRoleAction}>
              {title}
            </Button>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function AssignSitesDialog({
  user,
  onClose,
  labels,
  siteOptions,
  assignUserSitesAction,
  onFeedback,
}: {
  user: SettingsUser | null;
  onClose: () => void;
  labels: UsersScreenLabels;
  siteOptions: SiteOption[];
  assignUserSitesAction?: AssignUserSitesAction;
  onFeedback: (feedback: { kind: 'status' | 'alert'; message: string } | null) => void;
}) {
  // Pre-check the user's current assignments; an empty set means "unrestricted"
  // (0 rows) which the help text explains. The selection set is the
  // authoritative payload — assignUserSites REPLACES the assignments.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  React.useEffect(() => {
    setSelected(new Set(user?.assignedSiteIds ?? []));
  }, [user?.id, user?.assignedSiteIds]);

  const title = labels.assignSitesDialogTitle ?? 'Assign sites';

  function toggle(siteId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(siteId);
      else next.delete(siteId);
      return next;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !assignUserSitesAction) {
      onFeedback({ kind: 'alert', message: labels.assignSitesUnavailable ?? 'Site assignment unavailable' });
      return;
    }
    const siteIds = siteOptions.map((site) => site.id).filter((id) => selected.has(id));
    startTransition(async () => {
      const result = await assignUserSitesAction({ userId: user.id, siteIds });
      if (result.ok) {
        onFeedback({ kind: 'status', message: labels.sitesAssignmentSuccess ?? 'Site access updated.' });
        onClose();
        return;
      }
      onFeedback({
        kind: 'alert',
        message: interpolate(labels.sitesAssignmentFailed ?? 'Site assignment failed: {error}.', { error: result.error }),
      });
    });
  }

  return (
    <Modal open={Boolean(user)} onOpenChange={(open) => { if (!open) onClose(); }} size="md" modalId="SM-08">
      <Modal.Header title={title} />
      <p className="px-5 pt-2 text-sm text-muted-foreground">{labels.assignSitesDialogSubtitle ?? 'Choose which sites this user can see and select.'}</p>
      <form onSubmit={submit}>
        <Modal.Body>
          <div className="space-y-4 px-5 py-4">
            {user ? (
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">
                    {user.initials}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {siteOptions.length === 0 ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
                {labels.noOrgSites ?? 'No sites are configured for this organization yet.'}
              </p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{labels.assignSites ?? 'Assign sites'}</legend>
                {siteOptions.map((site) => (
                  <label key={site.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(site.id)}
                      onChange={(event) => toggle(site.id, event.currentTarget.checked)}
                      aria-label={site.name}
                    />
                    <span>{site.name}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              {selected.size === 0
                ? (labels.assignSitesEmptyHint ?? 'No sites selected — the user can see ALL sites (unrestricted).')
                : (labels.assignSitesHelp ?? 'The user will only see the selected sites.')}
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" className="btn-secondary" onClick={onClose}>{labels.cancel}</Button>
            <Button type="submit" className="btn-primary" disabled={isPending || !user || !assignUserSitesAction}>
              {labels.saveSites ?? 'Save sites'}
            </Button>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default function SettingsUsersScreen({
  data,
  labels,
  searchParams,
  locale,
  inviteUserAction,
  assignRoleAction,
  assignUserSitesAction,
  resetPasswordAction,
  createUserWithPasswordAction,
}: SettingsUsersScreenProps) {
  const [selectedRole, setSelectedRole] = useState<RoleFilter>(normalizeRoleFilter(searchParams?.role));
  const [view, setView] = useState<UsersView>(normalizeView(searchParams?.view));
  const [query, setQuery] = useState(searchParams?.q ?? '');
  const [showInvite, setShowInvite] = useState(false);
  const [roleAssignmentDraft, setRoleAssignmentDraft] = useState<{ user: SettingsUser; roleId: string } | null>(null);
  const [siteAssignmentUser, setSiteAssignmentUser] = useState<SettingsUser | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<SettingsUser | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'status' | 'alert'; message: string } | null>(null);

  const canAssignSites = data.canAssignRoles && Boolean(assignUserSitesAction);

  function openSiteAssignment(user: SettingsUser) {
    if (!canAssignSites) {
      setFeedback({ kind: 'alert', message: labels.assignSitesUnavailable ?? 'Site assignment unavailable' });
      return;
    }
    setSiteAssignmentUser(user);
  }

  const visibleUsers = useMemo(() => {
    const searchTerm = query.toLowerCase().trim();
    return data.users.filter((user) => {
      const roleMatch = roleMatchesFilter(user, selectedRole);
      const searchMatch = !searchTerm || `${user.name} ${user.email}`.toLowerCase().includes(searchTerm);
      return roleMatch && searchMatch;
    });
  }, [data.users, query, selectedRole]);

  function exportVisibleUsers() {
    const csv = toCsv(visibleUsers, labels);
    if (typeof window !== 'undefined' && window.URL?.createObjectURL) {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'settings-users.csv';
      anchor.click();
      window.URL.revokeObjectURL(url);
    }
    setFeedback({ kind: 'status', message: labels.exportStatus });
  }

  const seatsUsedValue = data.kpis.seatLimit === null
    ? `${data.kpis.activeUsers} ${labels.seatsUnlimited}`
    : `${data.kpis.activeUsers} / ${data.kpis.seatLimit}`;

  function openInviteDialog() {
    if (!data.canInviteUsers) return;
    setShowInvite(true);
  }

  function openPasswordReset(user: SettingsUser) {
    if (!data.canResetPasswords || !resetPasswordAction) {
      setFeedback({ kind: 'alert', message: labels.resetPasswordUnavailable ?? 'Password reset unavailable' });
      return;
    }
    setPasswordResetUser(user);
  }

  const renderEmptyState = () => (
    <div role="status" className="rounded-lg border border-dashed p-8 text-center">
      <EmptyState
        icon="👥"
        title={interpolate(labels.noUsersTitle, { role: labels.emptyRoleName[selectedRole] })}
        body={labels.noUsersBody}
        action={(
          <Button type="button" className="btn-primary mt-4" onClick={openInviteDialog} disabled={!data.canInviteUsers}>
            {labels.inviteUser}
          </Button>
        )}
      />
    </div>
  );

  return (
    <main className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{labels.title}</h1>
          <p className="text-sm text-muted-foreground">
            {interpolate(labels.summary, { users: data.users.length, roles: data.roles.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" className="btn-secondary" onClick={exportVisibleUsers}>
            {labels.export}
          </Button>
          <Button type="button" className="btn-primary" onClick={openInviteDialog} disabled={!data.canInviteUsers}>
            + {labels.inviteUser}
          </Button>
        </div>
      </div>

      {feedback ? (
        <div
          role={feedback.kind}
          className={`rounded-lg border p-3 text-sm ${
            feedback.kind === 'alert' ? 'border-red-200 bg-red-50 text-red-900' : 'border-green-200 bg-green-50 text-green-900'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section aria-label="User KPIs" className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <KpiTile label={labels.active}>{data.kpis.activeUsers}</KpiTile>
        <KpiTile label={labels.invited}>{data.kpis.invitedUsers}</KpiTile>
        <KpiTile label={labels.disabled}>{data.kpis.disabledUsers}</KpiTile>
        <KpiTile label={labels.seatsUsed}>
          {data.kpis.activeUsers}{' '}
          <span className="text-sm text-muted-foreground">
            {data.kpis.seatLimit === null ? labels.seatsUnlimited : `/ ${data.kpis.seatLimit}`}
          </span>
          <span className="block text-xs font-normal">
            {labels.seatsUsed} {seatsUsedValue}
          </span>
        </KpiTile>
      </section>

      <section aria-label={labels.userDirectory} className="rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label={labels.userDirectory}>
            {roleFilters.map((role) => (
              <Button
                key={role}
                type="button"
                data-testid="users-role-filter"
                aria-pressed={selectedRole === role}
                className={`rounded-full border px-3 py-1 text-sm ${selectedRole === role ? 'bg-slate-900 text-white' : 'bg-white'}`}
                onClick={() => setSelectedRole(role)}
              >
                {labels.roleFilters[role]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="group" aria-label={labels.viewToggle}>
              <Button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
                {labels.tableView}
              </Button>
              <Button type="button" aria-pressed={view === 'cards'} onClick={() => setView('cards')}>
                {labels.cardsView}
              </Button>
            </div>
            <label className="w-60">
              <span className="sr-only">{labels.searchLabel}</span>
              <Input
                role="searchbox"
                aria-label={labels.searchLabel}
                placeholder={labels.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
          </div>
        </div>
        <div className="p-4">
          {visibleUsers.length === 0 ? (
            renderEmptyState()
          ) : view === 'cards' ? (
            <div data-testid="settings-users-card-grid" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {visibleUsers.map((user) => (
                <article key={user.id} data-testid="settings-user-card" data-role-code={user.roleCode} className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{user.initials}</div>
                    <Pill toneKey={user.status}>{labels.statuses[user.status]}</Pill>
                  </div>
                  <div className="font-semibold">{user.name}</div>
                  <div className="mb-3 text-sm text-muted-foreground">{user.email}</div>
                  <div className="mb-3 flex gap-2">
                    <Pill toneKey={user.roleCategory}>
                      <span data-testid="settings-user-role-pill">{user.roleLabel}</span>
                    </Pill>
                    <Pill toneKey="site">{user.site}</Pill>
                  </div>
                  <div className="border-t pt-2 text-xs text-muted-foreground">
                    {labels.lastActivePrefix}: {user.lastActive}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      className="text-xs"
                      disabled={!canAssignSites}
                      aria-label={canAssignSites
                        ? `${labels.assignSites ?? 'Assign sites'} for ${user.name}`
                        : `${labels.assignSitesUnavailable ?? 'Site assignment unavailable'} for ${user.name}`}
                      onClick={() => openSiteAssignment(user)}
                    >
                      {labels.assignSites ?? 'Assign sites'}
                    </Button>
                    <Button
                      type="button"
                      className="text-xs"
                      disabled={!data.canResetPasswords || !resetPasswordAction}
                      aria-label={data.canResetPasswords && resetPasswordAction
                        ? `${labels.resetPassword ?? 'Reset password'} for ${user.name}`
                        : `${labels.resetPasswordUnavailable ?? 'Password reset unavailable'} for ${user.name}`}
                      onClick={() => openPasswordReset(user)}
                    >
                      {labels.resetPassword ?? 'Reset password'}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table aria-label={labels.title} className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="w-10 p-2 text-left" aria-label={labels.avatar} />
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.name}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.email}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.role}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.site}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.lastActive}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.status}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user.id} className="border-t">
                      <td className="p-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{user.initials}</div>
                      </td>
                      <td className="p-2 font-medium">{user.name}</td>
                      <td className="p-2 text-muted-foreground">{user.email}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`${user.name} ${labels.tableHeaders.role}`}
                            value={user.roleId}
                            disabled={!data.canAssignRoles}
                            onChange={(event) => {
                              const nextRoleId = event.currentTarget.value;
                              if (!assignRoleAction || !data.canAssignRoles) {
                                setFeedback({ kind: 'alert', message: labels.roleAssignmentUnavailable });
                                return;
                              }
                              if (nextRoleId && nextRoleId !== user.roleId) {
                                setRoleAssignmentDraft({ user, roleId: nextRoleId });
                              }
                            }}
                            className="rounded-md border px-2 py-1 text-xs disabled:bg-slate-50"
                          >
                            {data.roles.map((role) => (
                              <option key={role.id} value={role.id}>{role.label}</option>
                            ))}
                          </select>
                          <Pill toneKey={user.roleCategory}>{labels.roleCategoryLabels[user.roleCategory]}</Pill>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span>{user.site}</span>
                          <Button
                            type="button"
                            className="text-xs"
                            disabled={!canAssignSites}
                            aria-label={canAssignSites
                              ? `${labels.assignSites ?? 'Assign sites'} for ${user.name}`
                              : `${labels.assignSitesUnavailable ?? 'Site assignment unavailable'} for ${user.name}`}
                            onClick={() => openSiteAssignment(user)}
                          >
                            {labels.assignSites ?? 'Assign sites'}
                          </Button>
                        </div>
                      </td>
                      <td className="p-2 text-muted-foreground">{user.lastActive}</td>
                      <td className="p-2"><Pill toneKey={user.status}>{labels.statuses[user.status]}</Pill></td>
                      <td className="p-2">
                        <Button
                          type="button"
                          className="text-xs"
                          disabled={!data.canResetPasswords || !resetPasswordAction}
                          aria-label={data.canResetPasswords && resetPasswordAction
                            ? `${labels.resetPassword ?? 'Reset password'} for ${user.name}`
                            : `${labels.resetPasswordUnavailable ?? 'Password reset unavailable'} for ${user.name}`}
                          onClick={() => openPasswordReset(user)}
                        >
                          {labels.resetPassword ?? 'Reset password'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold">{labels.rolePermissions}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{labels.rolePermissionsDescription}</p>
        <div className="overflow-x-auto">
          <table aria-label={labels.rolePermissions} className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="p-2 text-left">{labels.module}</th>
                {data.roles.map((role) => (
                  <th key={role.id} scope="col" className="p-2 text-left">{role.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.modules.map((module) => (
                <tr key={module.id} className="border-t">
                  <td className="p-2 font-medium">{module.label}</td>
                  {data.roles.map((role) => {
                    const permission = data.permissions[module.id]?.[role.id] ?? 'none';
                    return (
                      <td key={role.id} className="p-2">
                        <span className={`perm-cell ${permission}`} title={permissionTitle(permission, labels)} aria-label={permissionTitle(permission, labels)}>
                          {permissionGlyphs[permission]}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {(Object.keys(permissionGlyphs) as PermissionCell[]).map((permission) => (
            <span key={permission} className="inline-flex items-center gap-1">
              <span className={`perm-cell ${permission}`}>{permissionGlyphs[permission]}</span>
              {labels.permissionLabels[permission]}
            </span>
          ))}
        </div>
      </section>

      {/*
        Single invite + role-assign dialogs only. Previously this screen
        rendered BOTH the inline Radix InviteDialog/RoleAssignDialog AND the
        legacy UserInviteModal/RoleAssignModal at the same time. With two
        simultaneously-open, focus-trapped dialogs each Radix dialog treated a
        click inside the other dialog as an "interact outside" event and fired
        onOpenChange(false) — closing the modal as soon as the user moved to a
        second field. Keeping a single i18n-complete dialog removes the focus
        war and keeps the modal open through full form entry.
      */}
      <InviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        labels={labels}
        data={data}
        locale={locale}
        inviteUserAction={inviteUserAction}
        createUserWithPasswordAction={createUserWithPasswordAction}
        onFeedback={setFeedback}
      />
      <RoleAssignDialog
        draft={roleAssignmentDraft}
        onClose={() => setRoleAssignmentDraft(null)}
        labels={labels}
        data={data}
        assignRoleAction={assignRoleAction}
        onFeedback={setFeedback}
      />
      <AssignSitesDialog
        user={siteAssignmentUser}
        onClose={() => setSiteAssignmentUser(null)}
        labels={labels}
        siteOptions={data.siteOptions}
        assignUserSitesAction={assignUserSitesAction}
        onFeedback={setFeedback}
      />
      {passwordResetUser ? (
        <PasswordResetModal
          open={Boolean(passwordResetUser)}
          user={{ id: passwordResetUser.id, name: passwordResetUser.name, email: passwordResetUser.email }}
          resetPassword={async () => {
            if (!resetPasswordAction) return { ok: false, error: labels.resetPasswordUnavailable ?? 'Password reset unavailable' };
            const result = await resetPasswordAction({ userId: passwordResetUser.id });
            if (result.ok) {
              setFeedback({ kind: 'status', message: labels.passwordResetSuccess ?? 'Password reset email sent' });
              return { ok: true };
            }
            setFeedback({ kind: 'alert', message: interpolate(labels.passwordResetFailed ?? 'Password reset failed: {error}', { error: result.error }) });
            return { ok: false, error: result.error };
          }}
          onOpenChange={(open) => { if (!open) setPasswordResetUser(null); }}
        />
      ) : null}
    </main>
  );
}
