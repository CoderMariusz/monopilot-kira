'use client';

/**
 * 03-technical Routing list + edit modal (TEC-060, T-051) and Routing cost
 * preview + resource utilization (TEC-062, T-052) client island.
 *
 * Prototype parity (MON-design-system — rebuilt lane A2):
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:4-34
 *     (`RoutingsScreen`) — dense `.card` + `.table` routing list (mono lead cell,
 *     5 semantic `.badge` tones), `.empty-state`, `.alert`.
 *   - prototypes/design/Monopilot Design System/technical/modals.jsx:271-304
 *     (`RoutingStepAddModal`) — the per-operation editor in a `.modal-*` styled
 *     dialog. Translated to shadcn `<Select>` (raw `<select>` is a red-line) with
 *     an ordered op list (op_no contiguous).
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *     (`CostingScreen`, TEC-013) — the cost breakdown panel reused for the routing
 *     cost preview (per-op setup/run/total) + resource-utilization bars.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * NUMERIC-exact: costs come from routingCostPreview (SQL NUMERIC, returned as
 * strings) and are displayed verbatim — never via JS float on a cost.
 *
 * All copy is injected via `labels` (i18n: technical.routings); the
 * ROUTINGS_DEFAULT_LABELS fallback is English for tests / RSC-less rendering.
 * Logic, Server Action calls and prop shapes are unchanged from the prior version.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Select } from '@monopilot/ui/Select';

import { approveRouting, publishRouting } from '../_actions/approve-routing';
import { createRouting } from '../_actions/create-routing';
import { listRoutings } from '../_actions/list-routings';
import { routingCostPreview } from '../_actions/cost-preview';
import type { RoutingCostPreviewResult } from '../_actions/cost-preview-shared';
import type { RoutingActionError, RoutingStatus, RoutingSummary } from '../_actions/shared';
import { updateRouting } from '../_actions/update-routing';
import type { ResourceOption, RoutingItemOption } from '../_actions/list-routing-items';
import { formatCost } from '../../cost/_components/numeric';

import { ROUTINGS_DEFAULT_LABELS, type RoutingsLabels } from './routings-labels';

// Back-compat re-export: tests and siblings import these from this module.
export { ROUTINGS_DEFAULT_LABELS, type RoutingsLabels };

// 5 semantic tones (MON-design-system rule 8): draft→neutral, approved→ok,
// active→ok, superseded→warn.
const STATUS_BADGE: Record<RoutingStatus, string> = {
  draft: 'badge-gray',
  approved: 'badge-green',
  active: 'badge-green',
  superseded: 'badge-amber',
};

const STATUS_GLYPH: Record<RoutingStatus, string> = {
  draft: '○',
  approved: '✓',
  active: '●',
  superseded: '⚠',
};

function statusLabel(status: RoutingStatus, labels: RoutingsLabels): string {
  switch (status) {
    case 'draft':
      return labels.statusDraft;
    case 'approved':
      return labels.statusApproved;
    case 'active':
      return labels.statusActive;
    case 'superseded':
      return labels.statusSuperseded;
  }
}

function errorLabel(error: RoutingActionError, labels: RoutingsLabels): string {
  switch (error) {
    case 'forbidden':
      return labels.errForbidden;
    case 'invalid_input':
      return labels.errInvalidInput;
    case 'not_found':
      return labels.errNotFound;
    case 'already_exists':
      return labels.errAlreadyExists;
    case 'invalid_state':
      return labels.errInvalidState;
    case 'v_tec_60_sequence_gap':
      return labels.errSequenceGap;
    case 'v_tec_61_no_resource':
      return labels.errNoResource;
    case 'v_tec_62_zero_run_time':
      return labels.errZeroRunTime;
    case 'v_tec_63_unknown_operation':
      return labels.errUnknownOperation;
    default:
      return labels.errGeneric;
  }
}

// ── Form field styled to .ff (uppercase caption above the control) ─────────────
// The control is nested inside the <label> so the caption is implicitly
// associated (getByLabelText works) and the `.ff label` rule provides the
// uppercase block caption. Port of the prototype `<Field>` (_shared).
function Field({
  label,
  children,
  htmlFor,
  className,
  style,
}: {
  label: string;
  children: React.ReactNode;
  /** id of the control the caption labels (enables getByLabelText). */
  htmlFor?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`ff${className ? ` ${className}` : ''}`} style={style}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

// ── Accessible dialog styled to .modal-* (MON-design-system) ───────────────────
function Dialog({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-box wide"
      >
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" aria-label={closeLabel} className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

// ── Operation form row (RoutingStepAddModal:284-301) ───────────────────────────
type OpForm = {
  opName: string;
  opCode: string;
  lineId: string;
  setupTimeMin: string;
  runTimePerUnitSec: string;
  costPerHour: string;
  manufacturingOperationName: string;
};

function emptyOp(): OpForm {
  return {
    opName: '',
    opCode: '',
    lineId: '',
    setupTimeMin: '0',
    runTimePerUnitSec: '',
    costPerHour: '',
    manufacturingOperationName: '',
  };
}

function opFormFromRouting(op: RoutingSummary['operations'][number]): OpForm {
  return {
    opName: op.opName,
    opCode: op.opCode,
    lineId: op.lineId,
    setupTimeMin: String(op.setupTimeMin),
    runTimePerUnitSec: op.runTimePerUnitSec ?? '',
    costPerHour: op.costPerHour ?? '',
    manufacturingOperationName: op.manufacturingOperationName,
  };
}

function RoutingEditModal({
  itemId,
  lines,
  operationNames,
  onClose,
  onSaved,
  existing,
  labels,
}: {
  itemId: string;
  lines: ResourceOption[];
  operationNames: string[];
  onClose: () => void;
  onSaved: () => void;
  existing: RoutingSummary | null;
  labels: RoutingsLabels;
}) {
  const [ops, setOps] = React.useState<OpForm[]>(() => {
    const persistedOps = existing?.operations ?? [];
    return persistedOps.length > 0 ? persistedOps.map(opFormFromRouting) : [emptyOp()];
  });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const lineOptions = lines.map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` }));
  const opNameOptions = operationNames.map((n) => ({ value: n, label: n }));

  function updateOp(index: number, patch: Partial<OpForm>) {
    setOps((prev) => prev.map((op, i) => (i === index ? { ...op, ...patch } : op)));
  }

  function addOp() {
    setOps((prev) => [...prev, emptyOp()]);
  }

  function removeOp(index: number) {
    setOps((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const operations = ops.map((op, i) => ({
      opNo: i + 1,
      opCode: op.opCode || `OP-${String(i + 1).padStart(2, '0')}`,
      opName: op.opName,
      lineId: op.lineId,
      setupTimeMin: Number(op.setupTimeMin) || 0,
      runTimePerUnitSec: op.runTimePerUnitSec || null,
      costPerHour: op.costPerHour || null,
      manufacturingOperationName: op.manufacturingOperationName,
      isProduction: true,
    }));
    startTransition(async () => {
      const result = existing
        ? await updateRouting({ routingId: existing.id, operations })
        : await createRouting({ itemId, operations });
      if (result.ok) onSaved();
      else setError(errorLabel(result.error, labels));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={labels.close}
      title={existing ? `${labels.modalEditTitlePrefix}${existing.version}` : labels.modalNewTitle}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {labels.cancel}
          </button>
          <button type="submit" className="btn btn-primary" form="technical-routing-form" disabled={pending}>
            {labels.saveRouting}
          </button>
        </>
      }
    >
      <p className="helper mb-3">{labels.modalIntro}</p>
      <form id="technical-routing-form" className="flex flex-col gap-4" onSubmit={onSubmit}>
        {ops.map((op, index) => (
            <div key={index} className="card" style={{ padding: 12 }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {labels.operationLabel}
                  {index + 1}
                </span>
                {ops.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-medium hover:underline"
                    style={{ color: 'var(--red)' }}
                    onClick={() => removeOp(index)}
                  >
                    {labels.remove}
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={labels.fOperationName} htmlFor={`op-name-${index}`}>
                  <input
                    id={`op-name-${index}`}
                    className="form-input"
                    required
                    value={op.opName}
                    onChange={(e) => updateOp(index, { opName: e.currentTarget.value })}
                    placeholder={labels.fOperationNamePlaceholder}
                  />
                </Field>
                <Field label={labels.fOpCode} htmlFor={`op-code-${index}`}>
                  <input
                    id={`op-code-${index}`}
                    className="form-input mono"
                    value={op.opCode}
                    onChange={(e) => updateOp(index, { opCode: e.currentTarget.value })}
                    placeholder={labels.fOpCodePlaceholder}
                  />
                </Field>
                <Field label={labels.fLine}>
                  <Select
                    value={op.lineId}
                    onValueChange={(v) => updateOp(index, { lineId: v })}
                    options={lineOptions}
                    placeholder={lineOptions.length ? labels.fSelect : labels.fNoneConfigured}
                    aria-label={`${labels.operationLabel}${index + 1} ${labels.fLine}`}
                  />
                </Field>
                <Field label={labels.fManufacturingOp}>
                  <Select
                    value={op.manufacturingOperationName}
                    onValueChange={(v) => updateOp(index, { manufacturingOperationName: v })}
                    options={opNameOptions}
                    placeholder={opNameOptions.length ? labels.fSelect : labels.fNoneConfigured}
                    aria-label={`${labels.operationLabel}${index + 1} ${labels.fManufacturingOp}`}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label={labels.fSetup} htmlFor={`op-setup-${index}`}>
                    <input
                      id={`op-setup-${index}`}
                      className="form-input mono"
                      type="number"
                      min={0}
                      value={op.setupTimeMin}
                      onChange={(e) => updateOp(index, { setupTimeMin: e.currentTarget.value })}
                    />
                  </Field>
                  <Field label={labels.fRun} htmlFor={`op-run-${index}`}>
                    <input
                      id={`op-run-${index}`}
                      className="form-input mono"
                      inputMode="decimal"
                      value={op.runTimePerUnitSec}
                      onChange={(e) => updateOp(index, { runTimePerUnitSec: e.currentTarget.value })}
                    />
                  </Field>
                  <Field label={labels.fCostPerHour} htmlFor={`op-cost-${index}`}>
                    <input
                      id={`op-cost-${index}`}
                      className="form-input mono"
                      inputMode="decimal"
                      value={op.costPerHour}
                      onChange={(e) => updateOp(index, { costPerHour: e.currentTarget.value })}
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        <button
          type="button"
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--blue)' }}
          onClick={addOp}
        >
          {labels.addOperation}
        </button>
      </form>
      {error ? (
        <div role="alert" className="alert alert-red mt-3">
          <div className="alert-title">{error}</div>
        </div>
      ) : null}
    </Dialog>
  );
}

// ── T-052: Cost preview + resource utilization panel ───────────────────────────
function CostPreviewPanel({ routing, labels }: { routing: RoutingSummary; labels: RoutingsLabels }) {
  const [volume, setVolume] = React.useState('100');
  const [preview, setPreview] = React.useState<RoutingCostPreviewResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  function run() {
    startTransition(async () => {
      const result = await routingCostPreview({ routingId: routing.id, volume });
      setPreview(result);
    });
  }

  const data = preview && preview.ok ? preview.data : null;
  const totalNum = data ? Number(data.totalCost) : 0;

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {labels.costTitlePrefix}
            {routing.version}
          </h3>
          <p className="helper">{labels.costFormula}</p>
        </div>
        <div className="flex items-end gap-2">
          <Field label={labels.volumeLabel} htmlFor="routing-volume">
            <input
              id="routing-volume"
              className="form-input mono"
              inputMode="numeric"
              style={{ width: 112 }}
              value={volume}
              onChange={(e) => setVolume(e.currentTarget.value)}
            />
          </Field>
          <button type="button" className="btn btn-secondary" onClick={run} disabled={pending}>
            {pending ? labels.computing : labels.computeCost}
          </button>
        </div>
      </div>

      {preview && !preview.ok ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{errorLabel(preview.error, labels)}</div>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table aria-label={`${labels.costPreviewTableLabelPrefix}${routing.version}`}>
              <thead>
                <tr>
                  <th scope="col">{labels.costColOp}</th>
                  <th scope="col">{labels.costColOperation}</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    {labels.costColSetup}
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    {labels.costColRun}
                  </th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    {labels.costColOpCost}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.operations.map((op) => (
                  <tr key={op.opNo}>
                    <td className="mono">{op.opNo}</td>
                    <td>{op.opName}</td>
                    <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                      {formatCost(op.setupCost)}
                    </td>
                    <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                      {formatCost(op.runCost)}
                    </td>
                    <td className="mono tabular-nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatCost(op.opCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="flex items-center justify-between rounded-md px-4 py-2 text-sm"
            style={{ background: 'var(--gray-050, #f1f5f9)' }}
          >
            <strong>
              {labels.costTotalPrefix}
              {data.volume}
              {labels.costTotalSuffix}
            </strong>
            <strong className="mono tabular-nums" data-testid="routing-total-cost">
              {formatCost(data.totalCost)}
            </strong>
          </div>

          {/* Resource utilization: per-op cost share bars (CostingScreen breakdown). */}
          <div className="flex flex-col gap-2">
            <strong className="text-sm">{labels.utilizationTitle}</strong>
            {data.operations.map((op) => {
              const opNum = Number(op.opCost);
              const pct = totalNum > 0 ? Math.round((opNum / totalNum) * 100) : 0;
              return (
                <div key={op.opNo}>
                  <div className="flex justify-between text-xs">
                    <span>
                      {op.opNo}. {op.opName}
                    </span>
                    <span className="mono">{pct}%</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Routing version list (RoutingsScreen + product-detail Routing tab) ─────────
function RoutingRowActions({
  routing,
  canWrite,
  canApprove,
  onEdit,
  onChanged,
  labels,
}: {
  routing: RoutingSummary;
  canWrite: boolean;
  canApprove: boolean;
  onEdit: () => void;
  onChanged: () => void;
  labels: RoutingsLabels;
}) {
  const [pending, startTransition] = React.useTransition();

  function transition(fn: typeof approveRouting) {
    startTransition(async () => {
      const result = await fn({ routingId: routing.id });
      if (result.ok) onChanged();
    });
  }

  return (
    <span className="flex justify-end gap-3">
      {canWrite && routing.status === 'draft' ? (
        <button
          type="button"
          className="font-medium hover:underline"
          style={{ color: 'var(--blue)' }}
          onClick={onEdit}
        >
          {labels.edit}
        </button>
      ) : null}
      {canApprove && routing.status === 'draft' ? (
        <button
          type="button"
          className="font-medium hover:underline disabled:opacity-50"
          style={{ color: 'var(--green-700)' }}
          disabled={pending}
          onClick={() => transition(approveRouting)}
        >
          {labels.approve}
        </button>
      ) : null}
      {canApprove && routing.status === 'approved' ? (
        <button
          type="button"
          className="font-medium hover:underline disabled:opacity-50"
          style={{ color: 'var(--green-700)' }}
          disabled={pending}
          onClick={() => transition(publishRouting)}
        >
          {labels.publish}
        </button>
      ) : null}
      {routing.status !== 'draft' && routing.status !== 'approved' ? <span className="muted">—</span> : null}
    </span>
  );
}

export function RoutingsManager({
  items,
  lines,
  operationNames,
  canWrite,
  canApprove,
  labels = ROUTINGS_DEFAULT_LABELS,
}: {
  items: RoutingItemOption[];
  lines: ResourceOption[];
  operationNames: string[];
  canWrite: boolean;
  canApprove: boolean;
  labels?: RoutingsLabels;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string>(items[0]?.id ?? '');
  const [routings, setRoutings] = React.useState<RoutingSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RoutingSummary | null>(null);

  const load = React.useCallback((itemId: string) => {
    if (!itemId) {
      setRoutings([]);
      return;
    }
    setLoading(true);
    setLoadError(false);
    void listRoutings({ itemId })
      .then((result) => {
        if (result.ok) setRoutings(result.data.routings);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load(selectedId);
  }, [selectedId, load]);

  const itemOptions = items.map((it) => ({ value: it.id, label: `${it.itemCode} · ${it.name}` }));
  const activeOrLatest =
    routings.find((r) => r.status === 'active') ?? routings.find((r) => r.status === 'approved') ?? routings[0] ?? null;

  function refreshAll() {
    load(selectedId);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-end justify-between gap-4">
        <Field label={labels.itemLabel} style={{ minWidth: 320 }}>
          <Select
            value={selectedId}
            onValueChange={setSelectedId}
            options={itemOptions}
            placeholder={labels.selectItemPlaceholder}
            aria-label={labels.itemLabel}
          />
        </Field>
        {canWrite && selectedId ? (
          <button
            type="button"
            className="btn btn-primary"
            data-modal-id="TEC-ROUTING-ADD"
            onClick={() => setCreateOpen(true)}
          >
            {labels.newRouting}
          </button>
        ) : null}
      </div>

      {!selectedId ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-icon">🧭</div>
            <div className="empty-state-body">{labels.selectItemPrompt}</div>
          </div>
        </div>
      ) : loading ? (
        <div role="status" aria-live="polite" className="card text-shell-muted text-sm">
          {labels.loadingRoutings}
        </div>
      ) : loadError ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{labels.loadError}</div>
        </div>
      ) : routings.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-state-icon">🧱</div>
            <div className="empty-state-title">{labels.emptyTitle}</div>
            <div className="empty-state-body">{canWrite ? labels.emptyBodyCanWrite : labels.emptyBody}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table aria-label={labels.versionsTableLabel}>
              <thead>
                <tr>
                  <th scope="col">{labels.colVersion}</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    {labels.colOperations}
                  </th>
                  <th scope="col">{labels.colStatus}</th>
                  <th scope="col">{labels.colEffectiveFrom}</th>
                  <th scope="col">{labels.colEffectiveTo}</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    {labels.colActions}
                  </th>
                </tr>
              </thead>
              <tbody>
                {routings.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">v{r.version}</td>
                    <td className="mono tabular-nums" style={{ textAlign: 'right' }}>
                      {r.operationCount}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[r.status]}`}>
                        {STATUS_GLYPH[r.status]} {statusLabel(r.status, labels)}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {r.effectiveFrom}
                    </td>
                    <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {r.effectiveTo ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <RoutingRowActions
                        routing={r}
                        canWrite={canWrite}
                        canApprove={canApprove}
                        onEdit={() => setEditing(r)}
                        onChanged={refreshAll}
                        labels={labels}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeOrLatest ? <CostPreviewPanel routing={activeOrLatest} labels={labels} /> : null}
        </>
      )}

      {!canWrite ? (
        <div role="alert" className="alert alert-amber">
          <div className="alert-title">{labels.permissionDenied}</div>
        </div>
      ) : null}

      {createOpen && selectedId ? (
        <RoutingEditModal
          itemId={selectedId}
          lines={lines}
          operationNames={operationNames}
          existing={null}
          labels={labels}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            refreshAll();
          }}
        />
      ) : null}

      {editing ? (
        <RoutingEditModal
          itemId={selectedId}
          lines={lines}
          operationNames={operationNames}
          existing={editing}
          labels={labels}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshAll();
          }}
        />
      ) : null}
    </div>
  );
}
