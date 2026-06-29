'use client';

/**
 * NPD v2 S5a — Per-process production DEFAULTS settings screen (client island).
 *
 * Owner decision D9: an admin configures, PER manufacturing operation (process),
 * its DEFAULT standard cost + default duration + a small set of roles (role_group
 * + headcount). These defaults later pre-fill the NPD Production tab. Role RATES
 * themselves are NOT set here — they live in /settings/labor-rates; here we only
 * pick a role_group and a default headcount.
 *
 * Sibling-conformant with settings/labor-rates (labor-rates-screen.client): a
 * page head (eyebrow + title + subtitle) + a table of operations, each row
 * showing its standard cost + duration + role chips, with a per-operation Edit
 * affordance opening a modal (standardCost + defaultDurationHours + a roles
 * editor with add/remove rows). On save → upsertProcessDefaults; ok/error is
 * surfaced inline. All four UI states render (loading / empty / error /
 * data + permission-denied).
 *
 * No raw UUIDs: rows are keyed by operationId (data-* hook) but render
 * operationName / cost / duration / roles only. RBAC (settings.org.update) is
 * resolved server-side and threaded in as `canManage`; affordances are disabled
 * with a tooltip when absent and the action re-checks the permission regardless.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type ProcessDefaultRole = {
  roleGroup: string;
  defaultHeadcount: number;
};

export type ProcessDefaultRow = {
  operationId: string;
  operationName: string;
  standardCost: number;
  defaultDurationHours: number;
  roles: ProcessDefaultRole[];
};

export type UpsertProcessDefaultsInput = {
  operationId: string;
  standardCost: number;
  defaultDurationHours: number;
  roles: ProcessDefaultRole[];
};

export type UpsertProcessDefaultsResult = { ok: true } | { ok: false; error: string };

export type ProcessDefaultsLabels = {
  eyebrow: string;
  title: string;
  subtitle: string;
  sectionTitle: string;
  provenance: string;
  rolesNote: string;
  columnOperation: string;
  columnStandardCost: string;
  columnDuration: string;
  columnRoles: string;
  columnActions: string;
  edit: string;
  noRoles: string;
  durationUnit: string;
  headcountUnit: string;
  dialogEditTitle: string;
  fieldStandardCost: string;
  fieldStandardCostHelp: string;
  fieldDuration: string;
  fieldDurationHelp: string;
  rolesTitle: string;
  rolesEmpty: string;
  fieldRoleGroup: string;
  fieldHeadcount: string;
  addRole: string;
  removeRole: string;
  save: string;
  savePending: string;
  cancel: string;
  saveSuccess: string;
  saveFailed: string;
  invalidInput: string;
  insufficientPermission: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
};

type RoleDraft = {
  roleGroup: string;
  headcount: string;
};

type Draft = {
  operationId: string;
  operationName: string;
  standardCost: string;
  defaultDurationHours: string;
  roles: RoleDraft[];
};

function toDraft(row: ProcessDefaultRow): Draft {
  return {
    operationId: row.operationId,
    operationName: row.operationName,
    standardCost: String(row.standardCost),
    defaultDurationHours: String(row.defaultDurationHours),
    roles: row.roles.map((role) => ({
      roleGroup: role.roleGroup,
      headcount: String(role.defaultHeadcount),
    })),
  };
}

function StateNotice({ state, labels }: { state: PageState; labels: ProcessDefaultsLabels }) {
  if (state === 'loading') return <div role="status" aria-live="polite">{labels.loading}</div>;
  if (state === 'empty') return <div role="status">{labels.empty}</div>;
  if (state === 'error') return <div role="alert">{labels.error}</div>;
  if (state === 'permission_denied') return <div role="alert">{labels.forbidden}</div>;
  return null;
}

export default function ProcessDefaultsScreen({
  initialRows,
  labels,
  canManage,
  upsertProcessDefaults,
  state = 'ready',
}: {
  initialRows: ProcessDefaultRow[];
  labels: ProcessDefaultsLabels;
  canManage: boolean;
  upsertProcessDefaults: (input: UpsertProcessDefaultsInput) => Promise<UpsertProcessDefaultsResult>;
  state?: PageState;
}) {
  const [rows, setRows] = React.useState<ProcessDefaultRow[]>(() => [...initialRows]);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, setPending] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const numberFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

  function openEdit(row: ProcessDefaultRow) {
    if (!canManage) return;
    setDraft(toDraft(row));
    setActionError(null);
    setStatusMessage(null);
  }

  function closeDialog() {
    if (pending) return;
    setDraft(null);
    setActionError(null);
  }

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function addRoleRow() {
    setDraft((current) =>
      current ? { ...current, roles: [...current.roles, { roleGroup: '', headcount: '1' }] } : current,
    );
  }

  function removeRoleRow(index: number) {
    setDraft((current) =>
      current ? { ...current, roles: current.roles.filter((_, i) => i !== index) } : current,
    );
  }

  function patchRoleRow(index: number, patch: Partial<RoleDraft>) {
    setDraft((current) =>
      current
        ? { ...current, roles: current.roles.map((role, i) => (i === index ? { ...role, ...patch } : role)) }
        : current,
    );
  }

  async function submitDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !canManage || pending) return;

    const standardCost = Number(draft.standardCost);
    const defaultDurationHours = Number(draft.defaultDurationHours);
    if (
      !Number.isFinite(standardCost) ||
      standardCost < 0 ||
      !Number.isFinite(defaultDurationHours) ||
      defaultDurationHours < 0
    ) {
      setActionError(labels.invalidInput);
      return;
    }

    const roles: ProcessDefaultRole[] = [];
    for (const role of draft.roles) {
      const roleGroup = role.roleGroup.trim();
      const headcount = Number(role.headcount);
      if (roleGroup === '') continue;
      if (!Number.isInteger(headcount) || headcount < 0) {
        setActionError(labels.invalidInput);
        return;
      }
      roles.push({ roleGroup, defaultHeadcount: headcount });
    }

    setPending(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const result = await upsertProcessDefaults({
        operationId: draft.operationId,
        standardCost,
        defaultDurationHours,
        roles,
      });
      if (!result.ok) {
        setActionError(labels.saveFailed);
        return;
      }
      setRows((current) =>
        current.map((row) =>
          row.operationId === draft.operationId
            ? { ...row, standardCost, defaultDurationHours, roles }
            : row,
        ),
      );
      setStatusMessage(labels.saveSuccess);
      setDraft(null);
    } catch {
      setActionError(labels.saveFailed);
    } finally {
      setPending(false);
    }
  }

  const effectiveState: PageState = state === 'empty' && rows.length > 0 ? 'ready' : state;

  return (
    <main
      data-testid="settings-process-defaults-screen"
      data-screen="settings-process-defaults-list"
      aria-labelledby="settings-process-defaults-title"
      className="settings-screen settings-screen--process-defaults space-y-4"
    >
      <header className="flex items-start justify-between gap-4" data-region="page-head">
        <div>
          <p className="settings-eyebrow">{labels.eyebrow}</p>
          <h1 id="settings-process-defaults-title">{labels.title}</h1>
          <p className="muted">{labels.subtitle}</p>
        </div>
      </header>

      {statusMessage ? (
        <section
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm"
        >
          {statusMessage}
        </section>
      ) : null}

      <section
        className="settings-section rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        aria-labelledby="process-defaults-section-title"
      >
        <div className="settings-section__head">
          <h2 id="process-defaults-section-title">{labels.sectionTitle}</h2>
          <p className="muted text-sm">{labels.provenance}</p>
        </div>
        <p className="mt-2 text-xs text-slate-500" data-testid="process-defaults-roles-note">
          {labels.rolesNote}
        </p>
        {actionError && draft === null ? (
          <div role="alert" className="mt-3 text-sm text-red-700">
            {actionError}
          </div>
        ) : null}
      </section>

      {draft !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="process-default-dialog-title"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="process-default-dialog-title" className="text-lg font-semibold text-slate-950">
                {labels.dialogEditTitle.replace('{operation}', draft.operationName)}
              </h2>
              <Button
                type="button"
                variant="dry-run"
                aria-label={labels.cancel}
                onClick={closeDialog}
                disabled={pending}
              >
                x
              </Button>
            </div>
            <form onSubmit={(event) => void submitDraft(event)} className="mt-4 space-y-4">
              <label
                className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                htmlFor="process-default-standard-cost"
              >
                {labels.fieldStandardCost}
                <Input
                  id="process-default-standard-cost"
                  aria-label={labels.fieldStandardCost}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={draft.standardCost}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    patchDraft({ standardCost: value });
                  }}
                  required
                  disabled={pending}
                />
                <span className="text-[11px] font-normal normal-case text-slate-500">
                  {labels.fieldStandardCostHelp}
                </span>
              </label>

              <label
                className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                htmlFor="process-default-duration"
              >
                {labels.fieldDuration}
                <Input
                  id="process-default-duration"
                  aria-label={labels.fieldDuration}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.25"
                  value={draft.defaultDurationHours}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    patchDraft({ defaultDurationHours: value });
                  }}
                  required
                  disabled={pending}
                />
                <span className="text-[11px] font-normal normal-case text-slate-500">
                  {labels.fieldDurationHelp}
                </span>
              </label>

              <fieldset
                className="grid gap-2 rounded-lg border border-slate-200 p-3"
                data-testid="process-default-roles-editor"
              >
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {labels.rolesTitle}
                </legend>
                {draft.roles.length === 0 ? (
                  <p role="status" className="text-xs text-slate-500" data-testid="process-default-roles-empty">
                    {labels.rolesEmpty}
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {draft.roles.map((role, index) => (
                      <li
                        key={index}
                        className="flex items-end gap-2"
                        data-testid="process-default-role-row"
                      >
                        <label
                          className="grid flex-1 gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                          htmlFor={`process-default-role-group-${index}`}
                        >
                          {labels.fieldRoleGroup}
                          <Input
                            id={`process-default-role-group-${index}`}
                            aria-label={`${labels.fieldRoleGroup} ${index + 1}`}
                            value={role.roleGroup}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              patchRoleRow(index, { roleGroup: value });
                            }}
                            disabled={pending}
                          />
                        </label>
                        <label
                          className="grid w-24 gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                          htmlFor={`process-default-role-headcount-${index}`}
                        >
                          {labels.fieldHeadcount}
                          <Input
                            id={`process-default-role-headcount-${index}`}
                            aria-label={`${labels.fieldHeadcount} ${index + 1}`}
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={role.headcount}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              patchRoleRow(index, { headcount: value });
                            }}
                            disabled={pending}
                          />
                        </label>
                        <Button
                          type="button"
                          variant="dry-run"
                          aria-label={`${labels.removeRole} ${index + 1}`}
                          onClick={() => removeRoleRow(index)}
                          disabled={pending}
                        >
                          {labels.removeRole}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  type="button"
                  variant="dry-run"
                  onClick={addRoleRow}
                  disabled={pending}
                  data-testid="process-default-add-role"
                >
                  + {labels.addRole}
                </Button>
              </fieldset>

              {actionError ? (
                <div role="alert" className="text-sm text-red-700">
                  {actionError}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="dry-run" onClick={closeDialog} disabled={pending}>
                  {labels.cancel}
                </Button>
                <Button
                  type="submit"
                  className="btn-primary"
                  disabled={!canManage || pending}
                  aria-label={canManage ? labels.save : `${labels.save} — ${labels.insufficientPermission}`}
                >
                  {pending ? labels.savePending : labels.save}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <section
        className="rounded-xl border border-slate-200 bg-white shadow-sm"
        aria-labelledby="process-default-list-title"
      >
        <h2 id="process-default-list-title" className="sr-only">
          {labels.sectionTitle}
        </h2>
        {effectiveState === 'ready' ? (
          rows.length > 0 ? (
            <Table aria-label={labels.title} className="w-full border-collapse text-left text-sm">
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3">
                    {labels.columnOperation}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">
                    {labels.columnStandardCost}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">
                    {labels.columnDuration}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3">
                    {labels.columnRoles}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3">
                    {labels.columnActions}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <TableRow
                    key={row.operationId}
                    data-testid="settings-process-default-row"
                    data-operation-id={row.operationId}
                    className="align-top hover:bg-slate-50"
                  >
                    <TableCell className="px-4 py-3 font-medium text-slate-950">{row.operationName}</TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                      {numberFmt.format(row.standardCost)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                      {numberFmt.format(row.defaultDurationHours)} {labels.durationUnit}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {row.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.roles.map((role) => (
                            <Badge key={role.roleGroup} variant="muted">
                              {role.roleGroup} × {role.defaultHeadcount}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{labels.noRoles}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Button
                        type="button"
                        variant="dry-run"
                        disabled={!canManage}
                        title={!canManage ? labels.insufficientPermission : undefined}
                        aria-label={
                          canManage
                            ? `${labels.edit} ${row.operationName}`
                            : `${labels.edit} ${row.operationName} — ${labels.insufficientPermission}`
                        }
                        onClick={() => openEdit(row)}
                      >
                        {labels.edit}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-start gap-3 p-6">
              <p role="status" className="text-sm text-slate-600">
                {labels.empty}
              </p>
            </div>
          )
        ) : (
          <div className="p-4">
            <StateNotice state={effectiveState} labels={labels} />
          </div>
        )}
      </section>
    </main>
  );
}
