'use client';

/**
 * 03-technical Routing list + edit modal (TEC-060, T-051) and Routing cost
 * preview + resource utilization (TEC-062, T-052) client island.
 *
 * Prototype parity:
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:4-34
 *     (`RoutingsScreen`, TEC) — the routing list table (Code / name / linked /
 *     steps / updated). Here scoped to a selected item's routing VERSIONS, which
 *     matches the product-detail Routing tab
 *     (other-screens.jsx:1270-1287: Version / Operations / Total time / Status /
 *     Effective from / Approved by + "+ New routing version").
 *   - prototypes/design/Monopilot Design System/technical/modals.jsx:271-304
 *     (`RoutingStepAddModal`) — the per-operation editor (operation name, work
 *     center/line/machine, setup, run). Translated to shadcn `<Select>` (raw
 *     `<select>` is a red-line) with an ordered op list (op_no contiguous).
 *   - prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *     (`CostingScreen`, TEC-013) — the cost breakdown panel, reused for the
 *     routing cost preview (per-op setup/run/total) + a resource utilization
 *     view (cost share per line/machine).
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * NUMERIC-exact: costs come from routingCostPreview (SQL NUMERIC, returned as
 * strings) and are displayed verbatim — never via JS float on a cost.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { approveRouting, publishRouting } from '../_actions/approve-routing';
import { createRouting } from '../_actions/create-routing';
import { listRoutings } from '../_actions/list-routings';
import { routingCostPreview } from '../_actions/cost-preview';
import type { RoutingCostPreviewResult } from '../_actions/cost-preview-shared';
import type { RoutingActionError, RoutingStatus, RoutingSummary } from '../_actions/shared';
import { updateRouting } from '../_actions/update-routing';
import type { ResourceOption, RoutingItemOption } from '../_actions/list-routing-items';
import { formatCost } from '../../cost/_components/numeric';

const STATUS_VARIANT: Record<RoutingStatus, BadgeVariant> = {
  draft: 'muted',
  approved: 'info',
  active: 'success',
  superseded: 'warning',
};

const STATUS_LABEL: Record<RoutingStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  active: 'Active',
  superseded: 'Superseded',
};

function errorLabel(error: RoutingActionError): string {
  switch (error) {
    case 'forbidden':
      return 'You do not have permission to author routings.';
    case 'invalid_input':
      return 'Please check the operation values and try again.';
    case 'not_found':
      return 'That item or routing no longer exists.';
    case 'already_exists':
      return 'A routing with that version already exists for this item.';
    case 'invalid_state':
      return 'Only a draft routing may be edited or transitioned that way.';
    case 'v_tec_60_sequence_gap':
      return 'Operation numbers must be contiguous from 1 (V-TEC-60).';
    case 'v_tec_61_no_resource':
      return 'Every operation must bind a line or machine (V-TEC-61).';
    case 'v_tec_62_zero_run_time':
      return 'Production operations need a run time greater than 0 (V-TEC-62).';
    case 'v_tec_63_unknown_operation':
      return 'An operation name is not in the manufacturing-operations reference (V-TEC-63).';
    default:
      return 'Could not save the routing. Please try again.';
  }
}

// ── Local accessible dialog (same pattern as items/cost client islands) ────────
function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    contentRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16"
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
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-white p-5 text-sm shadow-lg outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button type="button" aria-label="Close" className="text-muted-foreground" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
        <div className="mt-4 flex justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}

// ── Operation form row (RoutingStepAddModal:284-301) ───────────────────────────
type OpForm = {
  opName: string;
  opCode: string;
  resourceKind: 'line' | 'machine';
  resourceId: string;
  setupTimeMin: string;
  runTimePerUnitSec: string;
  costPerHour: string;
  manufacturingOperationName: string;
};

function emptyOp(): OpForm {
  return {
    opName: '',
    opCode: '',
    resourceKind: 'line',
    resourceId: '',
    setupTimeMin: '0',
    runTimePerUnitSec: '',
    costPerHour: '',
    manufacturingOperationName: '',
  };
}

function RoutingEditModal({
  itemId,
  lines,
  machines,
  operationNames,
  onClose,
  onSaved,
  existing,
}: {
  itemId: string;
  lines: ResourceOption[];
  machines: ResourceOption[];
  operationNames: string[];
  onClose: () => void;
  onSaved: () => void;
  existing: RoutingSummary | null;
}) {
  const [ops, setOps] = React.useState<OpForm[]>([emptyOp()]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const lineOptions = lines.map((l) => ({ value: l.id, label: `${l.code} · ${l.name}` }));
  const machineOptions = machines.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` }));
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
      lineId: op.resourceKind === 'line' ? op.resourceId || null : null,
      machineId: op.resourceKind === 'machine' ? op.resourceId || null : null,
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
      else setError(errorLabel(result.error));
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={existing ? `Edit routing v${existing.version}` : 'New routing'}
      footer={
        <>
          <Button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="btn-primary" form="technical-routing-form" disabled={pending}>
            Save routing
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Operations run in order (op 1 → n). Each operation binds a line or a machine (V-TEC-61) and a
        manufacturing-operation name from the reference (V-TEC-63).
      </p>
      <form id="technical-routing-form" className="space-y-4" onSubmit={onSubmit}>
        {ops.map((op, index) => {
          const resourceOptions = op.resourceKind === 'line' ? lineOptions : machineOptions;
          return (
            <div key={index} className="rounded-lg border bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Operation {index + 1}</span>
                {ops.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-red-600 hover:underline"
                    onClick={() => removeOp(index)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Operation name
                  <Input
                    required
                    value={op.opName}
                    onChange={(e) => updateOp(index, { opName: e.currentTarget.value })}
                    placeholder="e.g. Smoking — phase 2"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Op code
                  <Input
                    className="font-mono"
                    value={op.opCode}
                    onChange={(e) => updateOp(index, { opCode: e.currentTarget.value })}
                    placeholder="auto"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Resource type
                  <Select
                    value={op.resourceKind}
                    onValueChange={(v) => updateOp(index, { resourceKind: v as 'line' | 'machine', resourceId: '' })}
                    options={[
                      { value: 'line', label: 'Production line' },
                      { value: 'machine', label: 'Machine / equipment' },
                    ]}
                    aria-label={`Operation ${index + 1} resource type`}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  {op.resourceKind === 'line' ? 'Line' : 'Machine'}
                  <Select
                    value={op.resourceId}
                    onValueChange={(v) => updateOp(index, { resourceId: v })}
                    options={resourceOptions}
                    placeholder={resourceOptions.length ? 'Select…' : 'None configured'}
                    aria-label={`Operation ${index + 1} resource`}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Manufacturing operation
                  <Select
                    value={op.manufacturingOperationName}
                    onValueChange={(v) => updateOp(index, { manufacturingOperationName: v })}
                    options={opNameOptions}
                    placeholder={opNameOptions.length ? 'Select…' : 'None configured'}
                    aria-label={`Operation ${index + 1} manufacturing operation`}
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Setup (min)
                    <Input
                      type="number"
                      min={0}
                      className="font-mono"
                      value={op.setupTimeMin}
                      onChange={(e) => updateOp(index, { setupTimeMin: e.currentTarget.value })}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    Run (s/unit)
                    <Input
                      inputMode="decimal"
                      className="font-mono"
                      value={op.runTimePerUnitSec}
                      onChange={(e) => updateOp(index, { runTimePerUnitSec: e.currentTarget.value })}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    Cost/h
                    <Input
                      inputMode="decimal"
                      className="font-mono"
                      value={op.costPerHour}
                      onChange={(e) => updateOp(index, { costPerHour: e.currentTarget.value })}
                    />
                  </label>
                </div>
              </div>
            </div>
          );
        })}
        <button type="button" className="text-sm font-medium text-blue-600 hover:underline" onClick={addOp}>
          + Add operation
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

// ── T-052: Cost preview + resource utilization panel ───────────────────────────
function CostPreviewPanel({ routing }: { routing: RoutingSummary }) {
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
  // Resource utilization = cost share per operation (proxy for line/machine load).
  const totalNum = data ? Number(data.totalCost) : 0;

  return (
    <Card className="rounded-xl border bg-white shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Cost preview · v{routing.version}</h3>
            <p className="text-xs text-muted-foreground">
              Cost = Σ (setup/60 + run·volume/3600) × rate. NUMERIC-exact.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="block text-xs font-medium text-slate-700">
              Volume (units)
              <Input
                inputMode="numeric"
                className="w-28 font-mono"
                value={volume}
                onChange={(e) => setVolume(e.currentTarget.value)}
              />
            </label>
            <Button type="button" className="btn-secondary" onClick={run} disabled={pending}>
              {pending ? 'Computing…' : 'Compute cost'}
            </Button>
          </div>
        </div>

        {preview && !preview.ok ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorLabel(preview.error)}
          </p>
        ) : null}

        {data ? (
          <>
            <Table aria-label={`Cost preview operations v${routing.version}`}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Op</TableHead>
                  <TableHead scope="col">Operation</TableHead>
                  <TableHead scope="col" className="text-right">
                    Setup cost
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Run cost
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Op cost
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.operations.map((op) => (
                  <TableRow key={op.opNo}>
                    <TableCell className="font-mono text-sm">{op.opNo}</TableCell>
                    <TableCell>{op.opName}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatCost(op.setupCost)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatCost(op.runCost)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      {formatCost(op.opCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between rounded-md bg-slate-50 px-4 py-2 text-sm">
              <strong>Total routing cost @ {data.volume} units</strong>
              <strong className="font-mono tabular-nums" data-testid="routing-total-cost">
                {formatCost(data.totalCost)}
              </strong>
            </div>

            {/* Resource utilization: per-op cost share bars (CostingScreen breakdown). */}
            <div className="space-y-2">
              <strong className="text-sm">Resource utilization (cost share)</strong>
              {data.operations.map((op) => {
                const opNum = Number(op.opCost);
                const pct = totalNum > 0 ? Math.round((opNum / totalNum) * 100) : 0;
                return (
                  <div key={op.opNo}>
                    <div className="flex justify-between text-xs">
                      <span>
                        {op.opNo}. {op.opName}
                      </span>
                      <span className="font-mono">{pct}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded bg-slate-100">
                      <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Routing version list (RoutingsScreen + product-detail Routing tab) ─────────
function RoutingRowActions({
  routing,
  canWrite,
  canApprove,
  onEdit,
  onChanged,
}: {
  routing: RoutingSummary;
  canWrite: boolean;
  canApprove: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = React.useTransition();

  function transition(fn: typeof approveRouting) {
    startTransition(async () => {
      const result = await fn({ routingId: routing.id });
      if (result.ok) onChanged();
    });
  }

  return (
    <span className="flex justify-end gap-2">
      {canWrite && routing.status === 'draft' ? (
        <button type="button" className="font-medium text-blue-600 hover:underline" onClick={onEdit}>
          Edit
        </button>
      ) : null}
      {canApprove && routing.status === 'draft' ? (
        <button
          type="button"
          className="font-medium text-emerald-700 hover:underline disabled:opacity-50"
          disabled={pending}
          onClick={() => transition(approveRouting)}
        >
          Approve
        </button>
      ) : null}
      {canApprove && routing.status === 'approved' ? (
        <button
          type="button"
          className="font-medium text-emerald-700 hover:underline disabled:opacity-50"
          disabled={pending}
          onClick={() => transition(publishRouting)}
        >
          Publish
        </button>
      ) : null}
      {routing.status !== 'draft' && routing.status !== 'approved' ? (
        <span className="text-muted-foreground">—</span>
      ) : null}
    </span>
  );
}

export function RoutingsManager({
  items,
  lines,
  machines,
  operationNames,
  canWrite,
  canApprove,
}: {
  items: RoutingItemOption[];
  lines: ResourceOption[];
  machines: ResourceOption[];
  operationNames: string[];
  canWrite: boolean;
  canApprove: boolean;
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
    <div className="flex flex-col gap-6">
      <Card className="rounded-xl border bg-white shadow-sm">
        <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
          <label className="block text-sm font-medium text-slate-700">
            Item
            <div className="mt-1 w-80">
              <Select
                value={selectedId}
                onValueChange={setSelectedId}
                options={itemOptions}
                placeholder="Select an item…"
                aria-label="Select item"
              />
            </div>
          </label>
          {canWrite && selectedId ? (
            <Button
              type="button"
              className="btn-primary"
              data-modal-id="TEC-ROUTING-ADD"
              onClick={() => setCreateOpen(true)}
            >
              + New routing
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!selectedId ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            Select an item to view its routings.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardContent className="px-6 py-8">
            <div className="h-24 animate-pulse rounded-md bg-slate-100" aria-label="Loading routings" />
          </CardContent>
        </Card>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          Unable to load routings. Please try again.
        </div>
      ) : routings.length === 0 ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            No routings yet for this item.
            {canWrite ? ' Create the first routing version to define its operations.' : ''}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="rounded-xl border bg-white shadow-sm">
            <CardContent className="p-0">
              <Table aria-label="Routing versions">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Version</TableHead>
                    <TableHead scope="col" className="text-right">
                      Operations
                    </TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Effective from</TableHead>
                    <TableHead scope="col">Effective to</TableHead>
                    <TableHead scope="col" className="text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routings.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">v{r.version}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.operationCount}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.effectiveFrom}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.effectiveTo ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <RoutingRowActions
                          routing={r}
                          canWrite={canWrite}
                          canApprove={canApprove}
                          onEdit={() => setEditing(r)}
                          onChanged={refreshAll}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {activeOrLatest ? <CostPreviewPanel routing={activeOrLatest} /> : null}
        </>
      )}

      {!canWrite ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          You can view routings but do not have permission to author them (technical.bom.create).
        </div>
      ) : null}

      {createOpen && selectedId ? (
        <RoutingEditModal
          itemId={selectedId}
          lines={lines}
          machines={machines}
          operationNames={operationNames}
          existing={null}
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
          machines={machines}
          operationNames={operationNames}
          existing={editing}
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
