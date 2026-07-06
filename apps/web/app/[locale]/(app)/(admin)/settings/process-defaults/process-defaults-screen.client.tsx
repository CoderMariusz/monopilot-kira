'use client';

/**
 * W2-T1 — Unified Settings "Processes" screen (client island).
 *
 * One screen backed by npd_process_defaults (+ npd_process_default_roles) with
 * "Reference"."ManufacturingOperations" as the name + suffix vocabulary (the
 * old Settings→Process defaults screen, folded together with the process
 * vocabulary per the 2026-07-06 consolidation; the reference-A "Processes"
 * screen retires in W2-T2). Per LOCKED owner decisions:
 *
 *  - Roles × headcount editor (role dropdown from labor_rates role groups);
 *    crew cost/h = Σ(headcount × rate_per_hour) is AUTO-COMPUTED and shown
 *    live + readonly, with a manual override toggle on top (standard_cost is
 *    derived-with-override; cost_overridden persists so an override survives
 *    later labor-rate changes).
 *  - Setup cost (entered), Throughput/h + UoM, Yield %.
 *  - Prefix auto-numbered per ManufacturingOperations.process_suffix
 *    (PREP-01, PREP-02, …) when left blank; manual override allowed.
 *  - Read-only per-product rates from npd_wip_processes (throughput / setup /
 *    yield per prod_detail) are SURFACED, not re-modeled.
 *
 * RBAC (settings.org.update) is resolved server-side and threaded in as
 * `canManage`; the action re-checks the permission regardless. No raw UUIDs in
 * the rendered DOM. All four UI states render (loading / empty / error /
 * data + permission-denied).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/manufacturing-ops.jsx:186-260';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type ProcessDefaultRole = {
  roleGroup: string;
  defaultHeadcount: number;
};

export type RoleGroupRate = { roleGroup: string; ratePerHour: number };

export type ProcessProductRate = {
  productCode: string;
  throughputPerHour: number | null;
  throughputUom: string | null;
  setupCost: number;
  yieldPct: number;
};

export type ProcessDefaultRow = {
  operationId: string;
  operationName: string;
  processSuffix: string;
  prefix: string | null;
  standardCost: number;
  costOverridden: boolean;
  defaultDurationHours: number;
  setupCost: number;
  throughputPerHour: number | null;
  throughputUom: string | null;
  yieldPct: number;
  roles: ProcessDefaultRole[];
  productRates: ProcessProductRate[];
};

export type UpsertProcessDefaultsInput = {
  operationId: string;
  standardCost: number;
  costOverridden: boolean;
  defaultDurationHours: number;
  setupCost: number;
  throughputPerHour: number | null;
  throughputUom: string | null;
  yieldPct: number;
  prefix: string;
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
  columnPrefix: string;
  columnOperation: string;
  columnStandardCost: string;
  columnSetupCost: string;
  columnThroughput: string;
  columnYield: string;
  columnDuration: string;
  columnRoles: string;
  columnActions: string;
  edit: string;
  noRoles: string;
  durationUnit: string;
  headcountUnit: string;
  overriddenBadge: string;
  dialogEditTitle: string;
  fieldPrefix: string;
  fieldPrefixHelp: string;
  fieldStandardCost: string;
  fieldStandardCostHelp: string;
  overrideCost: string;
  computedCost: string;
  fieldDuration: string;
  fieldDurationHelp: string;
  fieldSetupCost: string;
  fieldSetupCostHelp: string;
  fieldThroughput: string;
  fieldThroughputUom: string;
  fieldThroughputHelp: string;
  fieldYield: string;
  fieldYieldHelp: string;
  rolesTitle: string;
  rolesEmpty: string;
  fieldRoleGroup: string;
  fieldHeadcount: string;
  addRole: string;
  removeRole: string;
  productRatesTitle: string;
  productRatesNote: string;
  productRatesEmpty: string;
  productRatesProduct: string;
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
  processSuffix: string;
  prefix: string;
  standardCost: string;
  costOverridden: boolean;
  defaultDurationHours: string;
  setupCost: string;
  throughputPerHour: string;
  throughputUom: string;
  yieldPct: string;
  roles: RoleDraft[];
  productRates: ProcessProductRate[];
};

function toDraft(row: ProcessDefaultRow): Draft {
  return {
    operationId: row.operationId,
    operationName: row.operationName,
    processSuffix: row.processSuffix,
    prefix: row.prefix ?? '',
    standardCost: String(row.standardCost),
    costOverridden: row.costOverridden,
    defaultDurationHours: String(row.defaultDurationHours),
    setupCost: String(row.setupCost),
    throughputPerHour: row.throughputPerHour === null ? '' : String(row.throughputPerHour),
    throughputUom: row.throughputUom ?? '',
    yieldPct: String(row.yieldPct),
    roles: row.roles.map((role) => ({
      roleGroup: role.roleGroup,
      headcount: String(role.defaultHeadcount),
    })),
    productRates: row.productRates,
  };
}

/** Live crew cost/h = Σ(headcount × rate) over valid role rows. */
function computeCrewCost(roles: RoleDraft[], rateByLowerGroup: Map<string, number>): number {
  let sum = 0;
  for (const role of roles) {
    const headcount = Number(role.headcount);
    if (role.roleGroup.trim() === '' || !Number.isFinite(headcount) || headcount <= 0) continue;
    sum += headcount * (rateByLowerGroup.get(role.roleGroup.trim().toLowerCase()) ?? 0);
  }
  return Number(sum.toFixed(4));
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
  roleGroupRates = [],
}: {
  initialRows: ProcessDefaultRow[];
  labels: ProcessDefaultsLabels;
  canManage: boolean;
  upsertProcessDefaults: (input: UpsertProcessDefaultsInput) => Promise<UpsertProcessDefaultsResult>;
  state?: PageState;
  /** Distinct labor_rates role groups + effective rates — dropdown options AND the live cost math. */
  roleGroupRates?: RoleGroupRate[];
}) {
  const [rows, setRows] = React.useState<ProcessDefaultRow[]>(() => [...initialRows]);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, setPending] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const numberFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  const roleGroupOptions = roleGroupRates.map((rate) => rate.roleGroup);
  const rateByLowerGroup = new Map(roleGroupRates.map((rate) => [rate.roleGroup.toLowerCase(), rate.ratePerHour]));

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

    const computedCost = computeCrewCost(draft.roles, rateByLowerGroup);
    const manualCost = Number(draft.standardCost);
    const standardCost = draft.costOverridden ? manualCost : computedCost;
    const defaultDurationHours = Number(draft.defaultDurationHours);
    const setupCost = Number(draft.setupCost);
    const yieldPct = Number(draft.yieldPct);
    const throughputPerHour = draft.throughputPerHour.trim() === '' ? null : Number(draft.throughputPerHour);
    if (
      !Number.isFinite(standardCost) ||
      standardCost < 0 ||
      !Number.isFinite(defaultDurationHours) ||
      defaultDurationHours < 0 ||
      !Number.isFinite(setupCost) ||
      setupCost < 0 ||
      !Number.isFinite(yieldPct) ||
      yieldPct <= 0 ||
      yieldPct > 100 ||
      (throughputPerHour !== null && (!Number.isFinite(throughputPerHour) || throughputPerHour < 0))
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

    const prefix = draft.prefix.trim();
    const throughputUom = draft.throughputUom.trim() === '' ? null : draft.throughputUom.trim();

    setPending(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const result = await upsertProcessDefaults({
        operationId: draft.operationId,
        standardCost,
        costOverridden: draft.costOverridden,
        defaultDurationHours,
        setupCost,
        throughputPerHour,
        throughputUom,
        yieldPct,
        prefix,
        roles,
      });
      if (!result.ok) {
        setActionError(labels.saveFailed);
        return;
      }
      setRows((current) =>
        current.map((row) =>
          row.operationId === draft.operationId
            ? {
                ...row,
                // ponytail: an auto-assigned prefix (blank input, first save) only
                // appears after reload — the action doesn't return it. Fine for now.
                prefix: prefix !== '' ? prefix : row.prefix,
                standardCost,
                costOverridden: draft.costOverridden,
                defaultDurationHours,
                setupCost,
                throughputPerHour,
                throughputUom,
                yieldPct,
                roles,
              }
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
  const draftComputedCost = draft ? computeCrewCost(draft.roles, rateByLowerGroup) : 0;

  return (
    <main
      data-testid="settings-process-defaults-screen"
      data-screen="settings-process-defaults-list"
      data-prototype-source={PROTOTYPE_SOURCE}
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
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/30 p-4"
        >
          <div className="my-8 w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
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
                htmlFor="process-default-prefix"
              >
                {labels.fieldPrefix}
                <Input
                  id="process-default-prefix"
                  aria-label={labels.fieldPrefix}
                  type="text"
                  value={draft.prefix}
                  placeholder={`${draft.processSuffix}-01`}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    patchDraft({ prefix: value });
                  }}
                  disabled={pending}
                />
                <span className="text-[11px] font-normal normal-case text-slate-500">
                  {labels.fieldPrefixHelp.replace('{suffix}', draft.processSuffix)}
                </span>
              </label>

              <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {labels.fieldStandardCost}
                </legend>
                <label
                  className="flex items-center gap-2 text-xs font-normal text-slate-700"
                  htmlFor="process-default-cost-override"
                >
                  <input
                    id="process-default-cost-override"
                    data-testid="process-default-cost-override"
                    type="checkbox"
                    checked={draft.costOverridden}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              costOverridden: checked,
                              // Seed the manual field from the live computed value when
                              // switching to override, so the admin edits from truth.
                              standardCost: checked
                                ? String(computeCrewCost(current.roles, rateByLowerGroup))
                                : current.standardCost,
                            }
                          : current,
                      );
                    }}
                    disabled={pending}
                  />
                  {labels.overrideCost}
                </label>
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
                    value={draft.costOverridden ? draft.standardCost : String(draftComputedCost)}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      patchDraft({ standardCost: value });
                    }}
                    readOnly={!draft.costOverridden}
                    disabled={pending || !draft.costOverridden}
                    required={draft.costOverridden}
                  />
                  <span className="text-[11px] font-normal normal-case text-slate-500">
                    {labels.fieldStandardCostHelp}
                  </span>
                </label>
                <p
                  className="text-[11px] text-slate-500"
                  data-testid="process-default-computed-cost"
                  aria-live="polite"
                >
                  {labels.computedCost.replace('{cost}', numberFmt.format(draftComputedCost))}
                </p>
              </fieldset>

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

              <div className="grid grid-cols-2 gap-3">
                <label
                  className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  htmlFor="process-default-setup-cost"
                >
                  {labels.fieldSetupCost}
                  <Input
                    id="process-default-setup-cost"
                    aria-label={labels.fieldSetupCost}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={draft.setupCost}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      patchDraft({ setupCost: value });
                    }}
                    required
                    disabled={pending}
                  />
                  <span className="text-[11px] font-normal normal-case text-slate-500">
                    {labels.fieldSetupCostHelp}
                  </span>
                </label>
                <label
                  className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  htmlFor="process-default-yield"
                >
                  {labels.fieldYield}
                  <Input
                    id="process-default-yield"
                    aria-label={labels.fieldYield}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="any"
                    value={draft.yieldPct}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      patchDraft({ yieldPct: value });
                    }}
                    required
                    disabled={pending}
                  />
                  <span className="text-[11px] font-normal normal-case text-slate-500">
                    {labels.fieldYieldHelp}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label
                  className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  htmlFor="process-default-throughput"
                >
                  {labels.fieldThroughput}
                  <Input
                    id="process-default-throughput"
                    aria-label={labels.fieldThroughput}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={draft.throughputPerHour}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      patchDraft({ throughputPerHour: value });
                    }}
                    disabled={pending}
                  />
                  <span className="text-[11px] font-normal normal-case text-slate-500">
                    {labels.fieldThroughputHelp}
                  </span>
                </label>
                <label
                  className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
                  htmlFor="process-default-throughput-uom"
                >
                  {labels.fieldThroughputUom}
                  <Input
                    id="process-default-throughput-uom"
                    aria-label={labels.fieldThroughputUom}
                    type="text"
                    value={draft.throughputUom}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      patchDraft({ throughputUom: value });
                    }}
                    disabled={pending}
                  />
                </label>
              </div>

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
                          <select
                            id={`process-default-role-group-${index}`}
                            aria-label={`${labels.fieldRoleGroup} ${index + 1}`}
                            className="form-input"
                            value={role.roleGroup}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              patchRoleRow(index, { roleGroup: value });
                            }}
                            disabled={pending}
                          >
                            <option value="">—</option>
                            {/* legacy free-text value not in labor_rates: keep it renderable/selectable */}
                            {role.roleGroup !== '' && !roleGroupOptions.includes(role.roleGroup) ? (
                              <option value={role.roleGroup}>{role.roleGroup}</option>
                            ) : null}
                            {roleGroupOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
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

              <fieldset
                className="grid gap-2 rounded-lg border border-slate-200 p-3"
                data-testid="process-default-product-rates"
              >
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {labels.productRatesTitle}
                </legend>
                <p className="text-[11px] text-slate-500">{labels.productRatesNote}</p>
                {draft.productRates.length === 0 ? (
                  <p className="text-xs text-slate-500" data-testid="process-default-product-rates-empty">
                    {labels.productRatesEmpty}
                  </p>
                ) : (
                  <ul className="grid gap-1">
                    {draft.productRates.map((rate, index) => (
                      <li
                        key={`${rate.productCode}-${index}`}
                        className="flex flex-wrap items-baseline gap-2 text-xs text-slate-700"
                        data-testid="process-default-product-rate-row"
                      >
                        <span className="font-mono font-semibold">{rate.productCode}</span>
                        <span className="tabular-nums">
                          {rate.throughputPerHour !== null
                            ? `${numberFmt.format(rate.throughputPerHour)} ${rate.throughputUom ?? ''}/h`
                            : '—'}
                        </span>
                        <span className="tabular-nums">{labels.columnSetupCost}: {numberFmt.format(rate.setupCost)}</span>
                        <span className="tabular-nums">{labels.columnYield}: {numberFmt.format(rate.yieldPct)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
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
                    {labels.columnPrefix}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3">
                    {labels.columnOperation}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">
                    {labels.columnStandardCost}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">
                    {labels.columnSetupCost}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">
                    {labels.columnThroughput}
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3 text-right">
                    {labels.columnYield}
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
                    <TableCell className="px-4 py-3 font-mono text-sm font-semibold">
                      {row.prefix ?? '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-medium text-slate-950">
                      {row.operationName}{' '}
                      <Badge variant="muted">{row.processSuffix}</Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                      {numberFmt.format(row.standardCost)}
                      {row.costOverridden ? (
                        <>
                          {' '}
                          <Badge variant="muted" data-testid="process-default-overridden-badge">
                            {labels.overriddenBadge}
                          </Badge>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                      {numberFmt.format(row.setupCost)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                      {row.throughputPerHour !== null
                        ? `${numberFmt.format(row.throughputPerHour)}${row.throughputUom ? ` ${row.throughputUom}` : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right font-mono text-sm tabular-nums">
                      {numberFmt.format(row.yieldPct)}%
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
