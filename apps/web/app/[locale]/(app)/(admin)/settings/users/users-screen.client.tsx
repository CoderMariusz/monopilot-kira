'use client';

import React, { useMemo, useState } from 'react';

import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';

import { downloadCsv, isoDateStamp, toCsv as buildCsv } from '../../../../../../lib/shared/download';
import { PasswordResetModal } from '../../../../../../components/settings/modals/password-reset-modal';
import { AssignSitesDialog } from './_components/AssignSitesDialog';
import { DeactivateUserDialog, type DeactivateUserAction } from './_components/DeactivateUserDialog';
import { ReactivateUserDialog, type ReactivateUserAction } from './_components/ReactivateUserDialog';
import { ResetUserMfaDialog, type ResetUserMfaAction } from './_components/ResetUserMfaDialog';
import { InviteDialog } from './_components/InviteDialog';
import { KpiTile } from './_components/KpiTile';
import { Pill } from './_components/Pill';
import { RoleAssignDialog } from './_components/RoleAssignDialog';

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
  /** Authoritative last sign-in timestamp (users.last_login_at), or "—" when never. */
  lastLogin: string;
  /** True when the user has an enrolled TOTP authenticator (public.mfa_secrets). */
  mfaEnrolled: boolean;
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
  canDeactivateUsers?: boolean;
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
    mfa: string;
    lastLogin: string;
    lastActive: string;
    status: string;
    actions: string;
  };
  mfaEnrolled: string;
  mfaNotEnrolled: string;
  lastLoginNever: string;
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
  // ── Deactivate user (F2-C1) ────────────────────────────────────────────────
  deactivate?: string;
  deactivateUnavailable?: string;
  deactivateDialogTitle?: string;
  deactivateDialogBody?: string;
  deactivateConfirm?: string;
  deactivating?: string;
  deactivateSuccess?: string;
  deactivateFailed?: string;
  deactivateSelf?: string;
  // ── Reactivate user (F4-H10) ───────────────────────────────────────────────
  reactivate?: string;
  reactivateUnavailable?: string;
  reactivateDialogTitle?: string;
  reactivateDialogBody?: string;
  reactivateConfirm?: string;
  reactivating?: string;
  reactivateSuccess?: string;
  reactivateFailed?: string;
  // ── Admin MFA reset (F4-H10) ─────────────────────────────────────────────
  resetMfa?: string;
  resetMfaUnavailable?: string;
  resetMfaDialogTitle?: string;
  resetMfaDialogBody?: string;
  resetMfaReason?: string;
  resetMfaReasonPlaceholder?: string;
  resetMfaReasonRequired?: string;
  resetMfaConfirm?: string;
  resettingMfa?: string;
  resetMfaSuccess?: string;
  resetMfaFailed?: string;
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
  deactivateUserAction?: DeactivateUserAction;
  reactivateUserAction?: ReactivateUserAction;
  resetUserMfaAction?: ResetUserMfaAction;
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

function permissionTitle(permission: PermissionCell, labels: UsersScreenLabels) {
  return labels.permissionLabels[permission];
}

function MfaBadge({ enrolled, labels }: { enrolled: boolean; labels: UsersScreenLabels }) {
  const text = enrolled ? (labels.mfaEnrolled ?? 'Enrolled') : (labels.mfaNotEnrolled ?? 'Not enrolled');
  return (
    <span
      data-testid="settings-user-mfa"
      data-mfa={enrolled ? 'enrolled' : 'not-enrolled'}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        enrolled ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
      }`}
    >
      <span aria-hidden="true">{enrolled ? '🔐' : '—'}</span>
      {text}
    </span>
  );
}

export function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)), template);
}

/**
 * Build the user-register CSV. Columns (task F2-C1, item 4): email, name,
 * role(s), sites, MFA, last login, status. Reuses the shared RFC-4180
 * `toCsv` helper (lib/shared/download) so quoting/CRLF stay consistent with the
 * other export screens. `resolveStatus` lets the caller fold optimistic
 * deactivations into the exported status.
 */
function buildUsersCsv(
  users: SettingsUser[],
  labels: UsersScreenLabels,
  resolveStatus: (user: SettingsUser) => UserStatus,
  resolveMfaEnrolled: (user: SettingsUser) => boolean,
): string {
  const header = [
    labels.tableHeaders.email,
    labels.tableHeaders.name,
    labels.tableHeaders.role,
    labels.tableHeaders.site,
    labels.tableHeaders.mfa,
    labels.tableHeaders.lastLogin,
    labels.tableHeaders.status,
  ];
  const rows = users.map((user) => [
    user.email,
    user.name,
    user.roleLabel,
    user.site,
    resolveMfaEnrolled(user) ? (labels.mfaEnrolled ?? 'Enrolled') : (labels.mfaNotEnrolled ?? 'Not enrolled'),
    user.lastLogin,
    labels.statuses[resolveStatus(user)],
  ]);
  return buildCsv(header, rows);
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
  deactivateUserAction,
  reactivateUserAction,
  resetUserMfaAction,
}: SettingsUsersScreenProps) {
  const [selectedRole, setSelectedRole] = useState<RoleFilter>(normalizeRoleFilter(searchParams?.role));
  const [view, setView] = useState<UsersView>(normalizeView(searchParams?.view));
  const [query, setQuery] = useState(searchParams?.q ?? '');
  const [showInvite, setShowInvite] = useState(false);
  const [roleAssignmentDraft, setRoleAssignmentDraft] = useState<{ user: SettingsUser; roleId: string } | null>(null);
  const [siteAssignmentUser, setSiteAssignmentUser] = useState<SettingsUser | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<SettingsUser | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<SettingsUser | null>(null);
  const [reactivateUser, setReactivateUser] = useState<SettingsUser | null>(null);
  const [resetMfaUser, setResetMfaUser] = useState<SettingsUser | null>(null);
  // Optimistic: ids the caller just deactivated — flip them to "disabled" in the
  // list without a full reload; the server row is already updated by the action.
  const [optimisticDeactivated, setOptimisticDeactivated] = useState<Set<string>>(() => new Set());
  const [optimisticReactivated, setOptimisticReactivated] = useState<Set<string>>(() => new Set());
  const [optimisticMfaCleared, setOptimisticMfaCleared] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<{ kind: 'status' | 'alert'; message: string } | null>(null);

  const canAssignSites = data.canAssignRoles && Boolean(assignUserSitesAction);
  const canDeactivate = Boolean(data.canDeactivateUsers) && Boolean(deactivateUserAction);
  const canReactivate = Boolean(data.canDeactivateUsers) && Boolean(reactivateUserAction);
  const canResetMfa = Boolean(data.canDeactivateUsers) && Boolean(resetUserMfaAction);

  function openDeactivate(user: SettingsUser) {
    if (!canDeactivate) {
      setFeedback({ kind: 'alert', message: labels.deactivateUnavailable ?? 'Deactivation unavailable' });
      return;
    }
    setDeactivateUser(user);
  }

  function handleDeactivated(userId: string) {
    setOptimisticDeactivated((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
    setOptimisticReactivated((prev) => {
      if (!prev.has(userId)) return prev;
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    setFeedback({ kind: 'status', message: labels.deactivateSuccess ?? 'User deactivated.' });
  }

  function handleReactivated(userId: string) {
    setOptimisticReactivated((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
    setOptimisticDeactivated((prev) => {
      if (!prev.has(userId)) return prev;
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
    setFeedback({ kind: 'status', message: labels.reactivateSuccess ?? 'User reactivated.' });
  }

  function handleMfaReset(userId: string) {
    setOptimisticMfaCleared((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
    setFeedback({ kind: 'status', message: labels.resetMfaSuccess ?? 'MFA enrollment cleared.' });
  }

  function effectiveStatus(user: SettingsUser): UserStatus {
    if (optimisticReactivated.has(user.id)) return 'active';
    if (optimisticDeactivated.has(user.id)) return 'disabled';
    return user.status;
  }

  function effectiveMfaEnrolled(user: SettingsUser): boolean {
    if (optimisticMfaCleared.has(user.id)) return false;
    return user.mfaEnrolled;
  }

  function openReactivate(user: SettingsUser) {
    if (!canReactivate) {
      setFeedback({ kind: 'alert', message: labels.reactivateUnavailable ?? 'Reactivation unavailable' });
      return;
    }
    setReactivateUser(user);
  }

  function openResetMfa(user: SettingsUser) {
    if (!canResetMfa) {
      setFeedback({ kind: 'alert', message: labels.resetMfaUnavailable ?? 'MFA reset unavailable' });
      return;
    }
    setResetMfaUser(user);
  }

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
    const csv = buildUsersCsv(visibleUsers, labels, effectiveStatus, effectiveMfaEnrolled);
    downloadCsv(csv, `settings-users-${isoDateStamp()}.csv`);
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
              {visibleUsers.map((user) => {
                const status = effectiveStatus(user);
                const isDisabled = status === 'disabled';
                return (
                <article
                  key={user.id}
                  data-testid="settings-user-card"
                  data-role-code={user.roleCode}
                  data-status={status}
                  className={`rounded-xl border p-4 ${isDisabled ? 'bg-slate-50 opacity-70' : ''}`}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{user.initials}</div>
                    <Pill toneKey={status}>{labels.statuses[status]}</Pill>
                  </div>
                  <div className={`font-semibold ${isDisabled ? 'line-through text-slate-400' : ''}`}>{user.name}</div>
                  <div className="mb-3 text-sm text-muted-foreground">{user.email}</div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Pill toneKey={user.roleCategory}>
                      <span data-testid="settings-user-role-pill">{user.roleLabel}</span>
                    </Pill>
                    <Pill toneKey="site">{user.site}</Pill>
                    <MfaBadge enrolled={effectiveMfaEnrolled(user)} labels={labels} />
                  </div>
                  <div className="border-t pt-2 text-xs text-muted-foreground">
                    {labels.tableHeaders.lastLogin}: {user.lastLogin === '—' ? (labels.lastLoginNever ?? '—') : user.lastLogin}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
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
                    {isDisabled ? (
                      <Button
                        type="button"
                        className="text-xs"
                        data-testid="reactivate-user-button"
                        disabled={!canReactivate}
                        aria-label={canReactivate
                          ? `${labels.reactivate ?? 'Reactivate'} ${user.name}`
                          : `${labels.reactivateUnavailable ?? 'Reactivation unavailable'} for ${user.name}`}
                        onClick={() => openReactivate(user)}
                      >
                        {labels.reactivate ?? 'Reactivate'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="text-xs text-red-700"
                        data-testid="deactivate-user-button"
                        disabled={!canDeactivate}
                        aria-label={canDeactivate
                          ? `${labels.deactivate ?? 'Deactivate'} ${user.name}`
                          : `${labels.deactivateUnavailable ?? 'Deactivation unavailable'} for ${user.name}`}
                        onClick={() => openDeactivate(user)}
                      >
                        {labels.deactivate ?? 'Deactivate'}
                      </Button>
                    )}
                    {effectiveMfaEnrolled(user) ? (
                      <Button
                        type="button"
                        className="text-xs text-red-700"
                        data-testid="reset-user-mfa-button"
                        disabled={!canResetMfa}
                        aria-label={canResetMfa
                          ? `${labels.resetMfa ?? 'Reset MFA'} for ${user.name}`
                          : `${labels.resetMfaUnavailable ?? 'MFA reset unavailable'} for ${user.name}`}
                        onClick={() => openResetMfa(user)}
                      >
                        {labels.resetMfa ?? 'Reset MFA'}
                      </Button>
                    ) : null}
                  </div>
                </article>
                );
              })}
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
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.mfa}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.lastLogin}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.status}</th>
                    <th scope="col" className="p-2 text-left">{labels.tableHeaders.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => {
                    const status = effectiveStatus(user);
                    const isDisabled = status === 'disabled';
                    return (
                    <tr
                      key={user.id}
                      data-status={status}
                      className={`border-t ${isDisabled ? 'bg-slate-50 text-slate-400 opacity-70' : ''}`}
                    >
                      <td className="p-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{user.initials}</div>
                      </td>
                      <td className={`p-2 font-medium ${isDisabled ? 'line-through' : ''}`}>{user.name}</td>
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
                      <td className="p-2"><MfaBadge enrolled={effectiveMfaEnrolled(user)} labels={labels} /></td>
                      <td className="p-2 text-muted-foreground">
                        {user.lastLogin === '—' ? (labels.lastLoginNever ?? '—') : user.lastLogin}
                      </td>
                      <td className="p-2"><Pill toneKey={status}>{labels.statuses[status]}</Pill></td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
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
                          {isDisabled ? (
                            <Button
                              type="button"
                              className="text-xs"
                              data-testid="reactivate-user-button"
                              disabled={!canReactivate}
                              aria-label={canReactivate
                                ? `${labels.reactivate ?? 'Reactivate'} ${user.name}`
                                : `${labels.reactivateUnavailable ?? 'Reactivation unavailable'} for ${user.name}`}
                              onClick={() => openReactivate(user)}
                            >
                              {labels.reactivate ?? 'Reactivate'}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              className="text-xs text-red-700"
                              data-testid="deactivate-user-button"
                              disabled={!canDeactivate}
                              aria-label={canDeactivate
                                ? `${labels.deactivate ?? 'Deactivate'} ${user.name}`
                                : `${labels.deactivateUnavailable ?? 'Deactivation unavailable'} for ${user.name}`}
                              onClick={() => openDeactivate(user)}
                            >
                              {labels.deactivate ?? 'Deactivate'}
                            </Button>
                          )}
                          {effectiveMfaEnrolled(user) ? (
                            <Button
                              type="button"
                              className="text-xs text-red-700"
                              data-testid="reset-user-mfa-button"
                              disabled={!canResetMfa}
                              aria-label={canResetMfa
                                ? `${labels.resetMfa ?? 'Reset MFA'} for ${user.name}`
                                : `${labels.resetMfaUnavailable ?? 'MFA reset unavailable'} for ${user.name}`}
                              onClick={() => openResetMfa(user)}
                            >
                              {labels.resetMfa ?? 'Reset MFA'}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
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
      <DeactivateUserDialog
        open={Boolean(deactivateUser)}
        user={deactivateUser ? { id: deactivateUser.id, name: deactivateUser.name, email: deactivateUser.email } : null}
        labels={{
          title: labels.deactivateDialogTitle ?? 'Deactivate user',
          body: labels.deactivateDialogBody ?? '{name} will be signed out and blocked from signing in. Their history is retained.',
          confirm: labels.deactivateConfirm ?? 'Deactivate user',
          deactivating: labels.deactivating ?? 'Deactivating…',
          cancel: labels.cancel,
          failed: labels.deactivateFailed ?? 'Could not deactivate the user: {error}.',
          self: labels.deactivateSelf ?? 'You cannot deactivate your own account.',
        }}
        deactivateUserAction={deactivateUserAction}
        onClose={() => setDeactivateUser(null)}
        onDeactivated={handleDeactivated}
        onFeedback={setFeedback}
      />
      <ReactivateUserDialog
        open={Boolean(reactivateUser)}
        user={reactivateUser ? { id: reactivateUser.id, name: reactivateUser.name, email: reactivateUser.email } : null}
        labels={{
          title: labels.reactivateDialogTitle ?? 'Reactivate user',
          body: labels.reactivateDialogBody ?? '{name} will be able to sign in again.',
          confirm: labels.reactivateConfirm ?? 'Reactivate user',
          reactivating: labels.reactivating ?? 'Reactivating…',
          cancel: labels.cancel,
          failed: labels.reactivateFailed ?? 'Could not reactivate the user: {error}.',
        }}
        reactivateUserAction={reactivateUserAction}
        onClose={() => setReactivateUser(null)}
        onReactivated={handleReactivated}
        onFeedback={setFeedback}
      />
      <ResetUserMfaDialog
        open={Boolean(resetMfaUser)}
        user={resetMfaUser ? { id: resetMfaUser.id, name: resetMfaUser.name, email: resetMfaUser.email } : null}
        labels={{
          title: labels.resetMfaDialogTitle ?? 'Reset MFA',
          body: labels.resetMfaDialogBody ?? 'Clear MFA enrollment for {name}. They must enroll again at next login.',
          reason: labels.resetMfaReason ?? 'Reason',
          reasonPlaceholder: labels.resetMfaReasonPlaceholder ?? 'Lost authenticator, device reset…',
          reasonRequired: labels.resetMfaReasonRequired ?? 'Enter a short reason (at least 3 characters).',
          confirm: labels.resetMfaConfirm ?? 'Reset MFA',
          resetting: labels.resettingMfa ?? 'Resetting…',
          cancel: labels.cancel,
          failed: labels.resetMfaFailed ?? 'Could not reset MFA: {error}.',
        }}
        resetUserMfaAction={resetUserMfaAction}
        onClose={() => setResetMfaUser(null)}
        onReset={handleMfaReset}
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
