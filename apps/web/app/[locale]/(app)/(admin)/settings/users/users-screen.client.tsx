'use client';

import React, { useMemo, useState, useTransition } from 'react';

import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import Textarea from '@monopilot/ui/Textarea';

export type RoleCategory = 'Admin' | 'Manager' | 'Operator' | 'Viewer';
export type UserStatus = 'active' | 'invited' | 'disabled';
export type PermissionCell = 'admin' | 'rw' | 'r' | 'none';
export type RoleFilter = 'all' | 'admin' | 'manager' | 'operator' | 'viewer';
export type UsersView = 'table' | 'cards';

export type SettingsUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  roleCode: string;
  roleId: string;
  roleLabel: string;
  roleCategory: RoleCategory;
  site: string;
  lastActive: string;
  status: UserStatus;
};

export type RoleSummary = {
  id: string;
  code: string;
  label: string;
  category: RoleCategory;
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
  modules: string[];
  permissions: Record<string, Record<RoleCategory, PermissionCell>>;
  kpis: UsersKpis;
  canInviteUsers: boolean;
  canAssignRoles: boolean;
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
  exportStatus: string;
};

export type InviteUserAction = (input: {
  email: string;
  name?: string;
  roleId: string;
  language?: string;
  redirectTo?: string;
}) => Promise<
  | { ok: true; data: { email: string; expiresAt: string } }
  | { ok: false; error: string }
>;

export type SettingsUsersScreenProps = {
  data: UsersScreenData;
  labels: UsersScreenLabels;
  searchParams?: UsersSearchParams;
  locale: string;
  inviteUserAction?: InviteUserAction;
};

const roleFilters: RoleFilter[] = ['all', 'admin', 'manager', 'operator', 'viewer'];
const permissionColumns: RoleCategory[] = ['Admin', 'Manager', 'Operator', 'Viewer'];
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
  onFeedback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: UsersScreenLabels;
  data: UsersScreenData;
  locale: string;
  inviteUserAction?: InviteUserAction;
  onFeedback: (feedback: { kind: 'status' | 'alert'; message: string } | null) => void;
}) {
  const defaultRoleId = data.roles.find((role) => role.category === 'Manager')?.id ?? data.roles[0]?.id ?? '';
  const sites = Array.from(new Set(data.users.map((user) => user.site))).filter(Boolean);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [isPending, startTransition] = useTransition();

  function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteUserAction || !email.trim() || !roleId) {
      onFeedback({ kind: 'alert', message: labels.invalidInvite });
      return;
    }

    startTransition(async () => {
      const result = await inviteUserAction({
        email: email.trim(),
        name: name.trim() || undefined,
        roleId,
        language: locale,
      });
      if (result.ok) {
        onFeedback({ kind: 'status', message: interpolate(labels.invitationSent, { email: result.data.email }) });
        setEmail('');
        setName('');
        onOpenChange(false);
        return;
      }
      onFeedback({ kind: 'alert', message: interpolate(labels.invitationFailed, { error: result.error }) });
    });
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" modalId="SM-06">
      <Modal.Header title={labels.inviteDialogTitle} />
      <form onSubmit={submitInvite}>
        <Modal.Body>
          <div className="space-y-4 px-5 py-4">
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
              <label className="block space-y-1 text-sm font-medium">
                <span>{labels.site}</span>
                <select className="w-full rounded-md border px-3 py-2 text-sm" defaultValue={sites[0] ?? labels.allSites}>
                  {(sites.length > 0 ? sites : [labels.allSites]).map((site) => (
                    <option key={site}>{site}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1 text-sm font-medium">
              <span>{labels.personalMessage}</span>
              <Textarea rows={2} placeholder={labels.personalMessagePlaceholder} />
            </label>
            <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              {labels.inviteHelp}
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">
            <Button type="button" onClick={() => onOpenChange(false)}>
              {labels.cancel}
            </Button>
            <Button type="submit" disabled={isPending || !inviteUserAction}>
              {labels.sendInvitation}
            </Button>
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default function SettingsUsersScreen({ data, labels, searchParams, locale, inviteUserAction }: SettingsUsersScreenProps) {
  const [selectedRole, setSelectedRole] = useState<RoleFilter>(normalizeRoleFilter(searchParams?.role));
  const [view, setView] = useState<UsersView>(normalizeView(searchParams?.view));
  const [query, setQuery] = useState(searchParams?.q ?? '');
  const [showInvite, setShowInvite] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'status' | 'alert'; message: string } | null>(null);

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

  const renderEmptyState = () => (
    <div role="status" className="rounded-lg border border-dashed p-8 text-center">
      <EmptyState
        icon="👥"
        title={interpolate(labels.noUsersTitle, { role: labels.emptyRoleName[selectedRole] })}
        body={labels.noUsersBody}
        action={(
          <Button type="button" className="mt-4" onClick={() => setShowInvite(true)} disabled={!data.canInviteUsers}>
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
            {interpolate(labels.summary, { users: data.users.length, roles: permissionColumns.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={exportVisibleUsers}>
            {labels.export}
          </Button>
          <Button type="button" onClick={() => setShowInvite(true)} disabled={!data.canInviteUsers}>
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
                            onChange={() => setFeedback({ kind: 'alert', message: labels.roleAssignmentUnavailable })}
                            className="rounded-md border px-2 py-1 text-xs disabled:bg-slate-50"
                          >
                            {data.roles.map((role) => (
                              <option key={role.id} value={role.id}>{role.label}</option>
                            ))}
                          </select>
                          <Pill toneKey={user.roleCategory}>{labels.roleCategoryLabels[user.roleCategory]}</Pill>
                        </div>
                      </td>
                      <td className="p-2">{user.site}</td>
                      <td className="p-2 text-muted-foreground">{user.lastActive}</td>
                      <td className="p-2"><Pill toneKey={user.status}>{labels.statuses[user.status]}</Pill></td>
                      <td className="p-2 text-muted-foreground">⋮</td>
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
                {permissionColumns.map((role) => (
                  <th key={role} scope="col" className="p-2 text-left">{labels.roleCategoryLabels[role]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.modules.map((module) => (
                <tr key={module} className="border-t">
                  <td className="p-2 font-medium">{module}</td>
                  {permissionColumns.map((role) => {
                    const permission = data.permissions[module]?.[role] ?? 'none';
                    return (
                      <td key={role} className="p-2">
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

      <InviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        labels={labels}
        data={data}
        locale={locale}
        inviteUserAction={inviteUserAction}
        onFeedback={setFeedback}
      />
    </main>
  );
}
