'use client';

/**
 * DEFECT-8 — Role management surface (Create role + per-role Permissions editor).
 *
 * Mounted by RolesScreen. Renders ONLY when role-admin actions are wired and the
 * operator can manage roles. System roles render the permission grid read-only
 * with a lock note (their grants are owned by migrations, never editable here).
 *
 * Five UI states: pending (Save/Create disabled + "saving…"), field errors,
 * permission-denied (the whole surface is hidden when !canManageRoles — RolesScreen
 * already shows the read-only banner), optimistic (the just-saved set is reflected
 * immediately in the role meta), and the editor's own per-group empty/loading.
 */

import React, { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@monopilot/ui/Button';
import { Checkbox } from '@monopilot/ui/Checkbox';

import { PERMISSION_GROUPS } from './permission-catalog';
import { PermissionEnforcementBadge } from './permission-enforcement-badge';

export type EditableRole = {
  /** roles.id (uuid) — required to edit/list permissions. */
  roleId: string;
  code: string;
  name: string;
  /** roles.is_system OR an owner/admin-family code: grid is read-only. */
  isSystem: boolean;
};

export type CreateRoleFn = (input: { code: string; name: string; description?: string }) => Promise<
  { ok: true; data: { roleId: string; code: string } } | { ok: false; error: string }
>;
export type ListRolePermissionsFn = (roleId: string) => Promise<
  { ok: true; permissions: string[] } | { ok: false; error: string }
>;
export type SetRolePermissionsFn = (input: { roleId: string; permissions: string[] }) => Promise<
  { ok: true; data: { roleId: string; count: number } } | { ok: false; error: string }
>;

export type RoleEditorProps = {
  roles: EditableRole[];
  createRole: CreateRoleFn;
  listRolePermissions: ListRolePermissionsFn;
  setRolePermissions: SetRolePermissionsFn;
  /** Called after a successful create/save so the parent can refresh. */
  onChanged?: () => void;
};

const ROLE_CODE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

function Overlay({ onClose, labelledById, children }: { onClose: () => void; labelledById: string; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        className="modal-box wide"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function CreateRoleDialog({
  createRole,
  onClose,
  onChanged,
}: {
  createRole: CreateRoleFn;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const t = useTranslations('settings.roles.editor');
  const tv = useTranslations('settings.roles.editor.errors');
  const titleId = useId();
  const codeId = useId();
  const nameId = useId();
  const descId = useId();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; name?: string; form?: string }>({});

  async function submit() {
    const nextErrors: typeof errors = {};
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode || !ROLE_CODE_RE.test(trimmedCode) || trimmedCode.length > 64) nextErrors.code = tv('invalid_code');
    if (!trimmedName) nextErrors.name = tv('name_required');
    setErrors(nextErrors);
    if (nextErrors.code || nextErrors.name) return;

    setPending(true);
    const result = await createRole({ code: trimmedCode, name: trimmedName, description: description.trim() || undefined });
    setPending(false);
    if (result.ok) {
      onChanged?.();
      onClose();
      return;
    }
    setErrors({ form: tv(result.error) });
  }

  return (
    <Overlay onClose={onClose} labelledById={titleId}>
      <div className="modal-head">
        <h2 id={titleId} className="modal-title">{t('create_title')}</h2>
        <button type="button" className="modal-close" aria-label={t('close')} onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">
        <div className="space-y-4">
          {errors.form ? <p role="alert" className="alert alert-red">{errors.form}</p> : null}
          <div className="ff">
            <label htmlFor={codeId}>{t('field_code')} <span className="req">*</span></label>
            <input
              id={codeId}
              type="text"
              value={code}
              autoFocus
              className="form-input mono"
              placeholder="qa_reviewer"
              aria-invalid={errors.code ? true : undefined}
              aria-describedby={errors.code ? `${codeId}-err` : undefined}
              onChange={(event) => setCode(event.target.value)}
            />
            <p className="muted mt-1 text-xs">{t('code_hint')}</p>
            {errors.code ? <p id={`${codeId}-err`} role="alert" className="text-xs" style={{ color: 'var(--red-600)' }}>{errors.code}</p> : null}
          </div>
          <div className="ff">
            <label htmlFor={nameId}>{t('field_name')} <span className="req">*</span></label>
            <input
              id={nameId}
              type="text"
              value={name}
              className="form-input"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${nameId}-err` : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {errors.name ? <p id={`${nameId}-err`} role="alert" className="text-xs" style={{ color: 'var(--red-600)' }}>{errors.name}</p> : null}
          </div>
          <div className="ff">
            <label htmlFor={descId}>{t('field_description')}</label>
            <textarea id={descId} value={description} className="form-input" style={{ minHeight: 72 }} onChange={(event) => setDescription(event.target.value)} />
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <Button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={pending}>{t('cancel')}</Button>
        <Button type="button" className="btn-primary btn-sm" onClick={submit} disabled={pending} aria-busy={pending || undefined}>
          {pending ? t('creating') : t('create_submit')}
        </Button>
      </div>
    </Overlay>
  );
}

function PermissionsEditorDialog({
  role,
  listRolePermissions,
  setRolePermissions,
  onClose,
  onChanged,
}: {
  role: EditableRole;
  listRolePermissions: ListRolePermissionsFn;
  setRolePermissions: SetRolePermissionsFn;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const t = useTranslations('settings.roles.editor');
  const tg = useTranslations('settings.roles.editor.groups');
  const tv = useTranslations('settings.roles.editor.errors');
  const titleId = useId();
  const readOnly = role.isSystem;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    listRolePermissions(role.roleId).then((result) => {
      if (!active) return;
      if (result.ok) setGranted(new Set(result.permissions));
      else setLoadError(true);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [role.roleId, listRolePermissions]);

  function toggle(permission: string, next: boolean) {
    setGranted((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(permission);
      else copy.delete(permission);
      return copy;
    });
  }

  function toggleGroup(permissions: readonly string[], next: boolean) {
    setGranted((prev) => {
      const copy = new Set(prev);
      for (const permission of permissions) {
        if (next) copy.add(permission);
        else copy.delete(permission);
      }
      return copy;
    });
  }

  async function save() {
    setPending(true);
    setSaveError(null);
    const result = await setRolePermissions({ roleId: role.roleId, permissions: [...granted] });
    setPending(false);
    if (result.ok) {
      onChanged?.();
      onClose();
      return;
    }
    setSaveError(tv(result.error));
  }

  const totalSelected = granted.size;

  return (
    <Overlay onClose={onClose} labelledById={titleId}>
      <div className="modal-head">
        <h2 id={titleId} className="modal-title">{t('permissions_title', { role: role.name })}</h2>
        <button type="button" className="modal-close" aria-label={t('close')} onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">
        {readOnly ? (
          <p role="note" className="alert alert-amber" data-testid="role-editor-locked">
            {t('system_locked')}
          </p>
        ) : null}
        {saveError ? <p role="alert" className="alert alert-red">{saveError}</p> : null}
        {loading ? (
          <p role="status" aria-busy="true" className="muted text-sm">{t('loading')}</p>
        ) : loadError ? (
          <p role="alert" className="alert alert-red">{t('load_error')}</p>
        ) : (
          <div className="space-y-4">
            <p className="muted text-sm">{t('selected_count', { count: totalSelected })}</p>
            {PERMISSION_GROUPS.map((group) => {
              const allSelected = group.permissions.every((permission) => granted.has(permission));
              const groupLabel = tg(group.id);
              return (
                <section key={group.id} role="group" aria-label={groupLabel} className="card" style={{ margin: 0 }}>
                  <div className="flex items-center justify-between">
                    <h3 className="card-title">{groupLabel}</h3>
                    {!readOnly ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => toggleGroup(group.permissions, !allSelected)}
                      >
                        {allSelected ? t('clear_all') : t('select_all')}
                      </button>
                    ) : null}
                  </div>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {group.permissions.map((permission) => {
                      const checked = granted.has(permission);
                      return (
                        <li key={permission} className="flex items-center gap-2">
                          <Checkbox
                            checked={checked}
                            disabled={readOnly}
                            aria-label={permission}
                            onCheckedChange={(next) => toggle(permission, next)}
                          />
                          <code className="mono text-xs">{permission}</code>
                          <PermissionEnforcementBadge permission={permission} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <Button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={pending}>{t('close')}</Button>
        {!readOnly ? (
          <Button
            type="button"
            className="btn-primary btn-sm"
            onClick={save}
            disabled={pending || loading || loadError}
            aria-busy={pending || undefined}
          >
            {pending ? t('saving') : t('save')}
          </Button>
        ) : null}
      </div>
    </Overlay>
  );
}

export default function RoleEditor({ roles, createRole, listRolePermissions, setRolePermissions, onChanged }: RoleEditorProps) {
  const t = useTranslations('settings.roles.editor');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<EditableRole | null>(null);
  const rolesById = useMemo(() => new Map(roles.map((role) => [role.roleId, role])), [roles]);

  return (
    <div data-testid="role-editor" className="flex flex-wrap items-center gap-2">
      <Button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
        {t('create_button')}
      </Button>
      <details className="text-sm">
        <summary className="muted cursor-pointer">{t('edit_permissions_help')}</summary>
        <ul className="mt-2 space-y-1">
          {roles.map((role) => (
            <li key={role.roleId} className="flex items-center justify-between gap-3">
              <span className="mono text-xs">{role.code}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditingRole(rolesById.get(role.roleId) ?? role)}
              >
                {t('permissions_button')}
              </button>
            </li>
          ))}
        </ul>
      </details>

      {createOpen ? (
        <CreateRoleDialog createRole={createRole} onClose={() => setCreateOpen(false)} onChanged={onChanged} />
      ) : null}
      {editingRole ? (
        <PermissionsEditorDialog
          role={editingRole}
          listRolePermissions={listRolePermissions}
          setRolePermissions={setRolePermissions}
          onClose={() => setEditingRole(null)}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  );
}
