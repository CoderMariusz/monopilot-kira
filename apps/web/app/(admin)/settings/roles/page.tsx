'use client';

import React, { useId, useMemo, useState } from 'react';

type RoleCode =
  | 'owner'
  | 'admin'
  | 'npd_manager'
  | 'module_admin'
  | 'planner'
  | 'production_lead'
  | 'quality_lead'
  | 'warehouse_operator'
  | 'auditor'
  | 'viewer';

type SystemRole = {
  code: RoleCode;
  name: string;
  usersAssigned: number;
  scope: 'Full system' | 'Module-scoped' | 'Workflow-scoped' | 'Read-only';
};

type PermissionStatus = 'enabled' | 'disabled_by_org_policy' | 'misconfigured_policy';

type RolePermission = {
  name: string;
  group: 'Settings' | 'NPD workflow authorization' | 'Technical approval';
  directlyGrantedBySeed: boolean;
  status: PermissionStatus;
  policySummary?: string;
};

type AssignableUser = {
  id: string;
  name: string;
  email: string;
  currentRoleCode: RoleCode;
};

type AssignRole = (input: { userId: string; roleCode: RoleCode; reason: string }) => Promise<unknown> | unknown;

type RolesPageProps = {
  roles: SystemRole[];
  permissionsByRole: Record<RoleCode, RolePermission[]>;
  assignableUsers: AssignableUser[];
  canManageRoles: boolean;
  assignRole: AssignRole;
};

const defaultRoles: SystemRole[] = [
  { code: 'owner', name: 'Owner', usersAssigned: 1, scope: 'Full system' },
  { code: 'admin', name: 'Admin', usersAssigned: 2, scope: 'Full system' },
  { code: 'npd_manager', name: 'NPD Manager', usersAssigned: 3, scope: 'Workflow-scoped' },
  { code: 'module_admin', name: 'Module Admin', usersAssigned: 4, scope: 'Module-scoped' },
  { code: 'planner', name: 'Planner', usersAssigned: 5, scope: 'Module-scoped' },
  { code: 'production_lead', name: 'Production Lead', usersAssigned: 6, scope: 'Module-scoped' },
  { code: 'quality_lead', name: 'Quality Lead', usersAssigned: 7, scope: 'Module-scoped' },
  { code: 'warehouse_operator', name: 'Warehouse Operator', usersAssigned: 8, scope: 'Module-scoped' },
  { code: 'auditor', name: 'Auditor', usersAssigned: 9, scope: 'Read-only' },
  { code: 'viewer', name: 'Viewer', usersAssigned: 10, scope: 'Read-only' },
];

const defaultNpdPermissions: RolePermission[] = [
  {
    group: 'Settings',
    name: 'settings.roles.view',
    directlyGrantedBySeed: true,
    status: 'enabled',
    policySummary: 'System default grant from role seed.',
  },
  {
    group: 'Settings',
    name: 'settings.roles.assign',
    directlyGrantedBySeed: false,
    status: 'disabled_by_org_policy',
    policySummary: 'Role assignment is disabled by org authorization policy.',
  },
  {
    group: 'NPD workflow authorization',
    name: 'npd.released_product_edit.request',
    directlyGrantedBySeed: true,
    status: 'enabled',
    policySummary: 'Request workflow remains enabled by org policy.',
  },
  {
    group: 'NPD workflow authorization',
    name: 'npd.released_product_edit.authorize',
    directlyGrantedBySeed: true,
    status: 'disabled_by_org_policy',
    policySummary: 'Authorization policy is disabled for released-product edits.',
  },
  {
    group: 'Technical approval',
    name: 'technical.product_spec.approve',
    directlyGrantedBySeed: true,
    status: 'misconfigured_policy',
    policySummary: 'Technical approval policy is misconfigured: approver role seed is missing.',
  },
];

const defaultPermissionsByRole = defaultRoles.reduce<Record<RoleCode, RolePermission[]>>((acc, role) => {
  acc[role.code] = role.code === 'npd_manager'
    ? defaultNpdPermissions
    : [
        {
          group: 'Settings',
          name: 'settings.roles.view',
          directlyGrantedBySeed: true,
          status: 'enabled',
          policySummary: 'System default grant from role seed.',
        },
      ];
  return acc;
}, {} as Record<RoleCode, RolePermission[]>);

const defaultAssignableUsers: AssignableUser[] = [
  { id: 'user-nora', name: 'Nora NPD', email: 'nora.npd@example.test', currentRoleCode: 'viewer' },
  { id: 'user-ada', name: 'Ada Admin', email: 'ada.admin@example.test', currentRoleCode: 'admin' },
];

const permissionGroups: RolePermission['group'][] = ['Settings', 'NPD workflow authorization', 'Technical approval'];

function statusLabel(status: PermissionStatus) {
  if (status === 'disabled_by_org_policy') return 'Org policy block';
  if (status === 'misconfigured_policy') return 'Policy issue';
  return 'Enabled by org policy';
}

function resolvedPolicySummary(permission: RolePermission) {
  if (permission.status === 'disabled_by_org_policy') return 'Org policy blocks this workflow or assignment grant.';
  return permission.policySummary;
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  }[tone];

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}>{children}</span>;
}

function DialogShell({
  title,
  children,
  footer,
  modalId,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  modalId?: string;
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-modal-id={modalId}
        className="w-full max-w-3xl rounded-xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" className="rounded border px-2 py-1 text-sm" aria-label={`Close ${title}`} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 rounded-b-xl border-t bg-slate-50 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

function PermissionsDialog({ role, permissions, onClose }: { role: SystemRole; permissions: RolePermission[]; onClose: () => void }) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const filtered = permissions.filter((permission) => {
    if (!normalized) return true;
    return `${permission.group} ${permission.name} ${permission.policySummary ?? ''}`.toLowerCase().includes(normalized);
  });

  return (
    <DialogShell title={`Permissions — ${role.name}`} onClose={onClose}>
      <div className="space-y-4">
        {permissions.some((permission) => permission.status === 'disabled_by_org_policy') ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Disabled by org authorization policy
          </p>
        ) : null}
        <div>
          <label htmlFor={searchId} className="text-sm font-medium">
            Search permissions
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Filter by module or flat permission string"
          />
        </div>
        {permissionGroups.map((group) => {
          const groupPermissions = filtered.filter((permission) => permission.group === group);
          return (
            <section key={group} role="region" aria-label={group} className="rounded-xl border bg-white p-4">
              <h3 className="text-sm font-semibold">{group}</h3>
              {groupPermissions.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No flat permissions match this filter.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {groupPermissions.map((permission) => (
                    <li key={permission.name} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-900">{permission.name}</code>
                        <Badge tone={permission.directlyGrantedBySeed ? 'green' : 'slate'}>
                          {permission.directlyGrantedBySeed ? 'Direct grant by role seed' : 'Not directly granted by role seed'}
                        </Badge>
                        <Badge tone={permission.status === 'enabled' ? 'green' : permission.status === 'misconfigured_policy' ? 'red' : 'amber'}>
                          {statusLabel(permission.status)}
                        </Badge>
                      </div>
                      {resolvedPolicySummary(permission) ? <p className="mt-2 text-sm text-slate-600">{resolvedPolicySummary(permission)}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </DialogShell>
  );
}

function AssignRoleDialog({
  roles,
  users,
  assignRole,
  onClose,
}: {
  roles: SystemRole[];
  users: AssignableUser[];
  assignRole: AssignRole;
  onClose: () => void;
}) {
  const searchId = useId();
  const roleId = useId();
  const reasonId = useId();
  const [query, setQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AssignableUser | null>(null);
  const [roleCode, setRoleCode] = useState<RoleCode | ''>('');
  const [reason, setReason] = useState('');
  const filteredUsers = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()));
  const valid = selectedUser && roleCode && roleCode !== selectedUser.currentRoleCode && reason.trim().length > 0;

  return (
    <DialogShell
      title="Assign role"
      modalId="SM-07"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!valid}
            onClick={async () => {
              if (!selectedUser || !roleCode) return;
              await assignRole({ userId: selectedUser.id, roleCode, reason });
              onClose();
            }}
          >
            Assign role
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={searchId} className="text-sm font-medium">
            Search user
          </label>
          <input
            id={searchId}
            type="text"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Name or email…"
          />
        </div>
        <div role="listbox" aria-label="Assignable users" className="max-h-56 overflow-auto rounded-md border">
          {filteredUsers.slice(0, 8).map((user) => (
            <button
              key={user.id}
              type="button"
              role="option"
              aria-selected={selectedUser?.id === user.id}
              className="flex w-full items-center justify-between border-t px-3 py-2 text-left first:border-t-0 aria-selected:bg-blue-50"
              onClick={() => {
                setSelectedUser(user);
                setRoleCode('');
              }}
            >
              <span>
                <span className="block text-sm font-medium">{user.name}</span>
                <span className="block text-xs text-slate-500">
                  {user.email} · current: {user.currentRoleCode}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div>
          <label htmlFor={roleId} className="text-sm font-medium">
            New role
          </label>
          <select
            id={roleId}
            value={roleCode}
            onChange={(event) => setRoleCode(event.target.value as RoleCode)}
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">— pick role —</option>
            {roles.map((role) => (
              <option key={role.code} value={role.code}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={reasonId} className="text-sm font-medium">
            Reason
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 min-h-20 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        {selectedUser && roleCode ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            Assigning <strong>{roleCode}</strong> to <strong>{selectedUser.name}</strong>. Previous role{' '}
            <strong>{selectedUser.currentRoleCode}</strong> will be replaced.
          </p>
        ) : null}
      </div>
    </DialogShell>
  );
}

export default function RolesPage(props: Partial<RolesPageProps> = {}) {
  const roles = props.roles ?? defaultRoles;
  const permissionsByRole = props.permissionsByRole ?? defaultPermissionsByRole;
  const assignableUsers = props.assignableUsers ?? defaultAssignableUsers;
  const canManageRoles = props.canManageRoles ?? true;
  const assignRole = props.assignRole ?? (() => ({ ok: true }));
  const [permissionRole, setPermissionRole] = useState<SystemRole | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const totalUsers = useMemo(() => roles.reduce((total, role) => total + role.usersAssigned, 0), [roles]);

  return (
    <main className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">SET-011</p>
          <h1 className="text-3xl font-bold tracking-tight">Roles &amp; Permissions</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review seeded system roles, flat Settings/Auth-owned permissions, and org authorization policy state.
          </p>
        </div>
        {canManageRoles ? (
          <button type="button" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white" onClick={() => setAssignOpen(true)}>
            Assign Role to User
          </button>
        ) : (
          <div className="max-w-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Role assignment controls are hidden for this Read-only operator. Required permission: settings.roles.assign or settings.roles.manage.
          </div>
        )}
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">System roles</div>
          <div className="mt-1 text-2xl font-bold">{roles.length}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Assigned users</div>
          <div className="mt-1 text-2xl font-bold">{totalUsers}</div>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Permission depth</div>
          <div className="mt-1 text-sm font-semibold">Flat groups, no role × module matrix</div>
        </div>
      </div>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div role="tablist" aria-label="Role type">
            <button role="tab" aria-selected="true" type="button" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">
              System Roles
            </button>
            <button role="tab" aria-selected="false" type="button" className="ml-2 rounded-md border px-3 py-1.5 text-sm" disabled>
              Custom Roles
            </button>
          </div>
          <span className="text-xs text-slate-500">Custom Roles are enterprise Phase 3 — soon.</span>
        </div>
        <div className="overflow-x-auto">
          <table aria-label="System Roles" className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th scope="col" className="px-4 py-3 font-semibold">Role name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Code</th>
                <th scope="col" className="px-4 py-3 font-semibold">Users assigned</th>
                <th scope="col" className="px-4 py-3 font-semibold">Scope</th>
                <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.code} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{role.name}</td>
                  <td className="px-4 py-3"><code>{role.code}</code></td>
                  <td className="px-4 py-3">{role.usersAssigned}</td>
                  <td className="px-4 py-3">{!canManageRoles && role.scope === 'Read-only' ? 'Read only' : role.scope}</td>
                  <td className="px-4 py-3">
                    <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => setPermissionRole(role)}>
                      View Permissions
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {permissionRole ? (
        <PermissionsDialog
          role={permissionRole}
          permissions={permissionsByRole[permissionRole.code] ?? []}
          onClose={() => setPermissionRole(null)}
        />
      ) : null}
      {assignOpen ? <AssignRoleDialog roles={roles} users={assignableUsers} assignRole={assignRole} onClose={() => setAssignOpen(false)} /> : null}
    </main>
  );
}
