'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

type UserRoleCode =
  | 'org_admin'
  | 'npd_manager'
  | 'module_admin'
  | 'planner'
  | 'production_lead'
  | 'quality_lead'
  | 'operator'
  | 'viewer';

type UserStatus = 'active' | 'invited' | 'disabled';
type RoleCategory = 'Admin' | 'Manager' | 'Operator' | 'Viewer';
type PermissionCell = 'admin' | 'rw' | 'r' | 'none';

type SettingsUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  roleCode: UserRoleCode;
  roleLabel: string;
  roleCategory: RoleCategory;
  site: string;
  lastActive: string;
  status: UserStatus;
};

type RoleSummary = {
  code: UserRoleCode;
  label: string;
  category: RoleCategory;
};

type UsersPageProps = {
  users: SettingsUser[];
  roles: RoleSummary[];
  modules: string[];
  permissions: Record<string, Record<string, PermissionCell>>;
  kpis: { activeUsers: number; invitedUsers: number; disabledUsers: number; seatLimit: number };
  searchParams?: { view?: 'table' | 'cards'; role?: 'all' | 'admin' | 'manager' | 'operator' | 'viewer'; q?: string };
  canManageUsers: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
  inviteUser?: (input: unknown) => Promise<unknown> | unknown;
  exportUsers?: () => Promise<unknown> | unknown;
};

const roleFilters = ['all', 'admin', 'manager', 'operator', 'viewer'] as const;
const permissionColumns: RoleCategory[] = ['Admin', 'Manager', 'Operator', 'Viewer'];
const defaultKpis: UsersPageProps['kpis'] = { activeUsers: 0, invitedUsers: 0, disabledUsers: 0, seatLimit: 0 };

function toTitle(value: (typeof roleFilters)[number]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeRoleFilter(value?: (typeof roleFilters)[number]) {
  return roleFilters.includes(value as (typeof roleFilters)[number]) ? (value as (typeof roleFilters)[number]) : 'all';
}

function roleMatchesFilter(user: SettingsUser, role: (typeof roleFilters)[number]) {
  return role === 'all' || user.roleCategory.toLowerCase() === role;
}

function statusBadgeLabel(status: UserStatus) {
  if (status === 'active') return '● Active';
  if (status === 'invited') return '⟳ Invited';
  return '✕ Disabled';
}

function permissionLabel(permission: PermissionCell) {
  if (permission === 'admin') return 'Full admin';
  if (permission === 'rw') return 'Read & write';
  if (permission === 'r') return 'Read only';
  return 'No access';
}

function badgeTone(label: string) {
  if (/admin/i.test(label)) return 'danger';
  if (/manager|planner|lead/i.test(label)) return 'info';
  if (/operator|active/i.test(label)) return 'success';
  if (/invited/i.test(label)) return 'warning';
  return 'muted';
}

function Badge({ children, tone = 'muted', testId }: { children: React.ReactNode; tone?: string; testId?: string }) {
  return (
    <span
      data-slot="badge"
      data-tone={tone}
      data-testid={testId}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
    >
      {children}
    </span>
  );
}

function SelectTrigger({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      role="combobox"
      aria-expanded="false"
      aria-label={label}
      data-slot="select-trigger"
      className="inline-flex min-w-28 items-center justify-between rounded-md border px-2 py-1 text-xs"
    >
      {value}
      <span aria-hidden="true">⌄</span>
    </button>
  );
}

function KpiTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div data-slot="card" data-testid="users-kpi-tile" className="rounded-xl border p-4 shadow-sm">
      <div data-testid="users-kpi-label" className="text-xs text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{children}</div>
    </div>
  );
}

function InviteDialog({
  onClose,
  onSend,
  roles,
  sites,
}: {
  onClose: () => void;
  onSend: () => void;
  roles: RoleSummary[];
  sites: string[];
}) {
  const titleId = useId();
  const emailId = useId();
  const messageId = useId();

  return (
    <>
      <span data-radix-focus-guard tabIndex={0} aria-hidden="true" />
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40" onMouseDown={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-focus-trap="radix-dialog"
          data-modal-id="SM-06"
          className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h3 id={titleId} className="text-base font-semibold">
              Invite user
            </h3>
            <Button type="button" aria-label="Close invite dialog" onClick={onClose}>
              ✕
            </Button>
          </div>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1">
              <label htmlFor={emailId} className="text-sm font-medium">
                Email address
              </label>
              <Input id={emailId} data-slot="input" type="email" placeholder="name@apex.pl" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span id={`${titleId}-role`} className="text-sm font-medium">
                  Role
                </span>
                <SelectTrigger label="Role" value={roles.find((role) => role.category === 'Manager')?.label ?? 'Manager'} />
              </div>
              <div className="space-y-1">
                <span id={`${titleId}-site`} className="text-sm font-medium">
                  Site
                </span>
                <SelectTrigger label="Site" value={sites[0] ?? 'All sites'} />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor={messageId} className="text-sm font-medium">
                Personal message (optional)
              </label>
              <textarea id={messageId} className="min-h-16 w-full rounded-md border px-3 py-2 text-sm" placeholder="Welcome to Monopilot!" />
            </div>
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              They&apos;ll receive an email with a magic link. The link expires in 7 days.
            </p>
          </div>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSend();
                onClose();
              }}
            >
              Send invitation
            </Button>
          </div>
        </div>
      </div>
      <span data-radix-focus-guard tabIndex={0} aria-hidden="true" />
    </>
  );
}

export default function UsersPage(props: Partial<UsersPageProps> = {}) {
  const t = useTranslations('settings.users');
  const {
    users = [],
    roles = [],
    modules = [],
    permissions = {},
    kpis = defaultKpis,
    searchParams,
    canManageUsers = false,
    state = 'ready',
    inviteUser,
    exportUsers,
  } = props;
  const initialRole = normalizeRoleFilter(searchParams?.role);
  const [selectedRole, setSelectedRole] = useState<(typeof roleFilters)[number]>(initialRole);
  const [showInvite, setShowInvite] = useState(false);
  const view = searchParams?.view === 'cards' ? 'cards' : 'table';
  const searchTerm = searchParams?.q?.toLowerCase().trim() ?? '';

  if (state === 'loading') {
    return (
      <main data-testid="settings-users-loading" aria-busy="true" className="space-y-4 p-6">
        <div className="h-8 w-56 rounded bg-slate-200" />
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} data-slot="card" className="h-24 rounded-xl border bg-slate-100" />
          ))}
        </div>
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="p-6">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {t('error_load')}
        </div>
      </main>
    );
  }

  if (state === 'permission-denied' || !canManageUsers) {
    return (
      <main className="p-6">
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t('permission_denied')}
        </div>
      </main>
    );
  }

  const sites = Array.from(new Set(users.map((user) => user.site))).filter(Boolean);
  const visibleUsers = users.filter((user) => {
    const roleMatch = roleMatchesFilter(user, selectedRole);
    const searchMatch = !searchTerm || `${user.name} ${user.email}`.toLowerCase().includes(searchTerm);
    return roleMatch && searchMatch;
  });

  const renderEmptyState = () => (
    <div role="status" className="rounded-lg border border-dashed p-8 text-center">
      <div className="text-2xl" aria-hidden="true">
        👥
      </div>
      <p className="mt-2 font-medium">No users in the &quot;{selectedRole}&quot; role</p>
      <p className="mt-1 text-sm text-muted-foreground">Try selecting a different role or invite someone new to this workspace.</p>
      <Button type="button" className="mt-4" onClick={() => setShowInvite(true)}>
        ＋ Invite user
      </Button>
    </div>
  );

  return (
    <main className="space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('heading')}</h1>
          <p className="text-sm text-muted-foreground">{users.length} users · {permissionColumns.length} role categories</p>
        </div>
        {state === 'empty' ? null : (
          <div className="flex gap-2">
            <Button type="button" onClick={() => void exportUsers?.()}>
              {t('export')}
            </Button>
            <Button type="button" onClick={() => setShowInvite(true)}>
              {t('invite_user')}
            </Button>
          </div>
        )}
      </div>

      <section aria-label="User KPIs" className="grid grid-cols-4 gap-3">
        <KpiTile label="Active">{kpis.activeUsers}</KpiTile>
        <KpiTile label="Invited">{kpis.invitedUsers}</KpiTile>
        <KpiTile label="Disabled">{kpis.disabledUsers}</KpiTile>
        <KpiTile label="Seats used">
          {kpis.activeUsers} <span className="text-sm text-muted-foreground">/ {kpis.seatLimit}</span>
          <span className="block text-xs font-normal">Seats used {kpis.activeUsers} / {kpis.seatLimit}</span>
        </KpiTile>
      </section>

      <section aria-label="User directory" className="rounded-xl border">
        <div className="flex items-center justify-between gap-4 border-b p-4">
          <div className="flex gap-2" role="group" aria-label="Role filters">
            {roleFilters.map((role) => (
              <button
                key={role}
                type="button"
                data-slot="toggle-group-item"
                data-testid="users-role-filter"
                aria-pressed={selectedRole === role}
                className="rounded-full border px-3 py-1 text-sm"
                onClick={() => setSelectedRole(role)}
              >
                {toTitle(role)}
              </button>
            ))}
          </div>
          <label className="w-60">
            <span className="sr-only">Search by name or email</span>
            <Input data-slot="input" role="searchbox" aria-label="Search by name or email" placeholder="Search by name or email…" />
          </label>
        </div>
        <div className="p-4">
          {state === 'empty' || visibleUsers.length === 0 ? (
            renderEmptyState()
          ) : view === 'cards' ? (
            <div data-testid="settings-users-card-grid" className="grid grid-cols-3 gap-3">
              {visibleUsers.map((user) => (
                <article key={user.id} data-testid="settings-user-card" data-role-code={user.roleCode} data-slot="card" className="rounded-xl border p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{user.initials}</div>
                    <Badge tone={badgeTone(user.status)}>{statusBadgeLabel(user.status)}</Badge>
                  </div>
                  <div className="font-semibold">{user.name}</div>
                  <div className="mb-3 text-sm text-muted-foreground">{user.email}</div>
                  <div className="mb-3 flex gap-2">
                    <Badge testId="settings-user-role-pill" tone={badgeTone(user.roleLabel)}>
                      {user.roleLabel}
                    </Badge>
                    <Badge>{user.site}</Badge>
                  </div>
                  <div className="border-t pt-2 text-xs text-muted-foreground">Last active: {user.lastActive}</div>
                </article>
              ))}
            </div>
          ) : (
            <table aria-label="Users" className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="p-2 text-left">{showInvite ? 'Avatar' : null}</th>
                  <th scope="col" className="p-2 text-left">Name</th>
                  <th scope="col" className="p-2 text-left">Email</th>
                  <th scope="col" className="p-2 text-left">Role</th>
                  <th scope="col" className="p-2 text-left">Site</th>
                  <th scope="col" className="p-2 text-left">Last active</th>
                  <th scope="col" className="p-2 text-left">Status</th>
                  <th scope="col" className="p-2 text-left">{showInvite ? 'Actions' : null}</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => (
                  <tr key={user.id} className="border-t">
                    <td className="p-2"><div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{user.initials}</div></td>
                    <td className="p-2 font-medium">{user.name}</td>
                    <td className="p-2 text-muted-foreground">{user.email}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <SelectTrigger label={`${user.name} role`} value={user.roleLabel} />
                        <Badge tone={badgeTone(user.roleCategory)}>{user.roleCategory}</Badge>
                      </div>
                    </td>
                    <td className="p-2">{user.site}</td>
                    <td className="p-2 text-muted-foreground">{user.lastActive}</td>
                    <td className="p-2"><Badge tone={badgeTone(user.status)}>{statusBadgeLabel(user.status)}</Badge></td>
                    <td className="p-2 text-muted-foreground">⋮</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Role permissions</h2>
        <p className="mb-3 text-sm text-muted-foreground">What each role can do across modules. Edit by clicking a cell.</p>
        <table aria-label="Role permissions" className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th scope="col" className="p-2 text-left">Module</th>
              {permissionColumns.map((role) => (
                <th key={role} scope="col" className="p-2 text-left">{role}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((module) => (
              <tr key={module} className="border-t">
                <td className="p-2 font-medium">{module}</td>
                {permissionColumns.map((role) => {
                  const permission = permissions[module]?.[role] ?? 'none';
                  return (
                    <td key={role} className="p-2">
                      <span className={`perm-cell ${permission}`} title={permissionLabel(permission)} aria-label={permissionLabel(permission)}>
                        {permission === 'admin' ? '◉' : permission === 'rw' ? '✎' : permission === 'r' ? '◎' : '–'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          {(['admin', 'rw', 'r', 'none'] as PermissionCell[]).map((permission) => (
            <span key={permission} className="inline-flex items-center gap-1">
              <span className={`perm-cell ${permission}`}>{permission === 'admin' ? '◉' : permission === 'rw' ? '✎' : permission === 'r' ? '◎' : '–'}</span>
              {permissionLabel(permission)}
            </span>
          ))}
        </div>
      </section>

      {showInvite ? (
        <InviteDialog
          roles={roles}
          sites={sites}
          onSend={() => void inviteUser?.({})}
          onClose={() => setShowInvite(false)}
        />
      ) : null}
    </main>
  );
}
