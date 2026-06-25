'use client';

import React, { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import RoleEditor, {
  type CreateRoleFn,
  type EditableRole,
  type ListRolePermissionsFn,
  type SetRolePermissionsFn,
} from './_components/role-editor.client';

export type RoleCode =
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

export type SystemRole = {
  code: RoleCode;
  name: string;
  usersAssigned: number;
  scope: 'Full system' | 'Module-scoped' | 'Workflow-scoped' | 'Read-only';
};

export type PermissionStatus = 'enabled' | 'disabled_by_org_policy' | 'misconfigured_policy';

export type RolePermission = {
  name: string;
  group: 'Settings' | 'NPD workflow authorization' | 'Technical approval';
  directlyGrantedBySeed: boolean;
  status: PermissionStatus;
  policySummary?: string;
};

export type AssignableUser = {
  id: string;
  name: string;
  email: string;
  currentRoleCode: RoleCode;
};

export type AssignRole = (input: { userId: string; roleCode: RoleCode; reason: string }) => Promise<unknown> | unknown;

/**
 * DEFECT-8 — optional role-management wiring. When `roleAdmin` is provided AND
 * the operator can manage roles, the screen surfaces the "+ Create role" action
 * and the per-role module-grouped permission editor. `editableRoles` carries the
 * real roles.id + is_system flag (system roles render the grid read-only).
 */
export type RoleAdminWiring = {
  editableRoles: EditableRole[];
  createRole: CreateRoleFn;
  listRolePermissions: ListRolePermissionsFn;
  setRolePermissions: SetRolePermissionsFn;
  onChanged?: () => void;
};

export type RolesScreenProps = {
  /**
   * Real system-role rows resolved from public.roles via withOrgContext.
   * `undefined` means the server loader was not wired in this environment — we
   * render a loud unavailable-state alert and never invent seed/fixture data.
   */
  roles?: SystemRole[];
  permissionsByRole?: Record<RoleCode, RolePermission[]>;
  assignableUsers?: AssignableUser[];
  canManageRoles?: boolean;
  assignRole?: AssignRole;
  roleAdmin?: RoleAdminWiring;
};

const permissionGroups: RolePermission['group'][] = ['Settings', 'NPD workflow authorization', 'Technical approval'];

function statusLabel(status: PermissionStatus, t: (key: string) => string) {
  if (status === 'disabled_by_org_policy') return t('permissionStatus.orgPolicyBlock');
  if (status === 'misconfigured_policy') return t('permissionStatus.policyIssue');
  return t('permissionStatus.enabledByOrgPolicy');
}

function resolvedPolicySummary(permission: RolePermission, t: (key: string) => string) {
  if (permission.status === 'disabled_by_org_policy') return t('orgPolicyBlocksGrant');
  return permission.policySummary;
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' }) {
  const toneClass = {
    slate: 'badge-gray',
    green: 'badge-green',
    amber: 'badge-amber',
    red: 'badge-red',
    blue: 'badge-blue',
  }[tone];

  return <span className={`badge ${toneClass}`}>{children}</span>;
}

function DialogShell({
  title,
  children,
  footer,
  modalId,
  closeLabel,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  modalId?: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-modal-id={modalId}
        className="modal-box wide"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" className="modal-close" aria-label={closeLabel} onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

function PermissionsDialog({ role, permissions, onClose }: { role: SystemRole; permissions: RolePermission[]; onClose: () => void }) {
  const t = useTranslations('settings.roles');
  const searchId = useId();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const filtered = permissions.filter((permission) => {
    if (!normalized) return true;
    return `${permission.group} ${permission.name} ${permission.policySummary ?? ''}`.toLowerCase().includes(normalized);
  });

  return (
    <DialogShell title={t('permissionsTitle', { role: role.name })} closeLabel={t('closeDialog', { title: t('permissionsTitle', { role: role.name }) })} onClose={onClose}>
      <div className="space-y-4">
        {permissions.some((permission) => permission.status === 'disabled_by_org_policy') ? (
          <p className="alert alert-amber">
            {t('disabledByOrgPolicy')}
          </p>
        ) : null}
        <div className="ff">
          <label htmlFor={searchId}>{t('searchPermissions')}</label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="form-input"
            placeholder={t('filter_by_module_or_permission')}
          />
        </div>
        {permissionGroups.map((group) => {
          const groupPermissions = filtered.filter((permission) => permission.group === group);
          return (
            <section key={group} role="region" aria-label={t(`permissionGroups.${group}`)} className="card" style={{ margin: 0 }}>
              <h3 className="card-title">{t(`permissionGroups.${group}`)}</h3>
              {groupPermissions.length === 0 ? (
                <p className="muted mt-2 text-sm">{t('noPermissionsMatch')}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {groupPermissions.map((permission) => (
                    <li key={permission.name} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'var(--gray-050)' }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="mono rounded bg-white px-2 py-1 font-semibold" style={{ border: '1px solid var(--border)' }}>{permission.name}</code>
                        <Badge tone={permission.directlyGrantedBySeed ? 'green' : 'slate'}>
                          {permission.directlyGrantedBySeed ? t('directGrantByRoleSeed') : t('notDirectGrantByRoleSeed')}
                        </Badge>
                        <Badge tone={permission.status === 'enabled' ? 'green' : permission.status === 'misconfigured_policy' ? 'red' : 'amber'}>
                          {statusLabel(permission.status, t)}
                        </Badge>
                      </div>
                      {resolvedPolicySummary(permission, t) ? <p className="muted mt-2 text-sm">{resolvedPolicySummary(permission, t)}</p> : null}
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
  const t = useTranslations('settings.roles');
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
      title={t('assign_role')}
      modalId="SM-07"
      closeLabel={t('closeDialog', { title: t('assign_role') })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!valid}
            onClick={async () => {
              if (!selectedUser || !roleCode) return;
              await assignRole({ userId: selectedUser.id, roleCode, reason });
              onClose();
            }}
          >
            {t('assignRoleButton')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="ff">
          <label htmlFor={searchId}>{t('searchUser')}</label>
          <input
            id={searchId}
            type="text"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            className="form-input"
            placeholder={t('nameOrEmailPlaceholder')}
          />
        </div>
        <div role="listbox" aria-label={t('assignableUsers')} className="max-h-56 overflow-auto rounded-md border" style={{ borderColor: 'var(--border)' }}>
          {filteredUsers.length === 0 ? (
            <p className="muted px-3 py-2 text-sm">{t('noMatchingOrgMembers')}</p>
          ) : (
            filteredUsers.slice(0, 8).map((user) => (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={selectedUser?.id === user.id}
                className="flex w-full items-center justify-between border-t px-3 py-2 text-left first:border-t-0 aria-selected:bg-blue-50"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => {
                  setSelectedUser(user);
                  setRoleCode('');
                }}
              >
                <span>
                  <span className="block text-sm font-medium">{user.name}</span>
                  <span className="muted block text-xs">
                    {t('currentRole', { email: user.email, role: user.currentRoleCode })}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="ff">
          <label htmlFor={roleId}>
            {t('newRole')} <span className="req">*</span>
          </label>
          <select
            id={roleId}
            value={roleCode}
            onChange={(event) => setRoleCode(event.target.value as RoleCode)}
            className="form-input"
          >
            <option value="">{t('pickRole')}</option>
            {roles.map((role) => (
              <option key={role.code} value={role.code}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ff">
          <label htmlFor={reasonId}>{t('reason')}</label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="form-input"
            style={{ minHeight: 80 }}
          />
        </div>
        {selectedUser && roleCode ? (
          <p className="alert alert-blue">
            {t.rich('assigningPreview', {
              role: roleCode,
              name: selectedUser.name,
              previousRole: selectedUser.currentRoleCode,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        ) : null}
      </div>
    </DialogShell>
  );
}

/**
 * SET-011 Roles & Permissions presentational screen (migrated into the
 * canonical localized tree from the retired non-localized `(admin)/settings`
 * duplicate). Renders ONLY real data passed from the server loader — there is
 * no seed/fixture fallback. When `roles` is `undefined` the server loader was
 * not wired, so we render a loud unavailable-state alert.
 */
export default function RolesScreen(props: RolesScreenProps = {}) {
  const t = useTranslations('settings.roles');
  const rolesUnavailable = props.roles === undefined;
  const roles = props.roles ?? [];
  const permissionsByRole = props.permissionsByRole ?? ({} as Record<RoleCode, RolePermission[]>);
  const assignableUsers = props.assignableUsers ?? [];
  const canManageRoles = props.canManageRoles ?? false;
  const assignRole = props.assignRole ?? (() => ({ ok: false, error: 'not_wired' }));
  const roleAdmin = props.roleAdmin;
  const [permissionRole, setPermissionRole] = useState<SystemRole | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const totalUsers = useMemo(() => roles.reduce((total, role) => total + role.usersAssigned, 0), [roles]);

  if (rolesUnavailable) {
    return (
      <main className="space-y-5 p-6">
        <header>
          <p className="muted text-xs font-semibold uppercase tracking-wide">SET-011</p>
          <h1 className="page-title">{t('heading')}</h1>
        </header>
        <div role="alert" data-testid="settings-roles-unavailable" className="alert alert-amber">
          <strong className="alert-title">{t('unavailableTitle')}</strong>
          <p>{t('unavailableBody')}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="muted text-xs font-semibold uppercase tracking-wide">SET-011</p>
          <h1 className="page-title">{t('heading')}</h1>
          <p className="muted mt-1 text-sm">
            {t('subtitle')}
          </p>
        </div>
        {canManageRoles ? (
          <div className="flex flex-col items-end gap-2">
            <button type="button" className="btn btn-primary" onClick={() => setAssignOpen(true)}>
              {t('assign_role_to_user')}
            </button>
            {roleAdmin ? (
              <RoleEditor
                roles={roleAdmin.editableRoles}
                createRole={roleAdmin.createRole}
                listRolePermissions={roleAdmin.listRolePermissions}
                setRolePermissions={roleAdmin.setRolePermissions}
                onChanged={roleAdmin.onChanged}
              />
            ) : null}
          </div>
        ) : (
          <div className="alert alert-amber max-w-sm">
            {t('readOnlyAssignmentNotice')}
          </div>
        )}
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="kpi">
          <div className="kpi-label">{t('system_roles')}</div>
          <div className="kpi-value">{roles.length}</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">{t('assignedUsers')}</div>
          <div className="kpi-value">{totalUsers}</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">{t('permissionDepth')}</div>
          <div className="mt-1 text-sm font-semibold">{t('flatGroupsNoMatrix')}</div>
        </div>
      </div>

      <section className="card" style={{ margin: 0, padding: 0 }}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div role="tablist" aria-label="Role type">
            <button role="tab" aria-selected="true" type="button" className="btn btn-primary btn-sm">
              {t('system_roles_tab')}
            </button>
            <button role="tab" aria-selected="false" type="button" className="btn btn-secondary btn-sm ml-2" disabled>
              {t('customRoles')}
            </button>
          </div>
          <span className="muted text-xs">{t('customRolesSoon')}</span>
        </div>
        <div className="overflow-x-auto">
          <table aria-label={t('system_roles_table')} className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left" style={{ background: 'var(--gray-050)', borderColor: 'var(--border)' }}>
                <th scope="col" className="px-4 py-2 font-semibold">{t('columns.roleName')}</th>
                <th scope="col" className="px-4 py-2 font-semibold">{t('columns.code')}</th>
                <th scope="col" className="px-4 py-2 font-semibold">{t('columns.usersAssigned')}</th>
                <th scope="col" className="px-4 py-2 font-semibold">{t('columns.scope')}</th>
                <th scope="col" className="px-4 py-2 font-semibold">{t('columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr>
                  <td className="muted px-4 py-6 text-sm" colSpan={5}>
                    {t('noSystemRoles')}
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.code} className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-4 py-2 font-medium">{role.name}</td>
                    <td className="px-4 py-2"><code className="mono">{role.code}</code></td>
                    <td className="px-4 py-2">{role.usersAssigned}</td>
                    <td className="px-4 py-2">{!canManageRoles && role.scope === 'Read-only' ? t('readOnlyScope') : role.scope}</td>
                    <td className="px-4 py-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPermissionRole(role)}>
                        {t('viewPermissions')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
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
