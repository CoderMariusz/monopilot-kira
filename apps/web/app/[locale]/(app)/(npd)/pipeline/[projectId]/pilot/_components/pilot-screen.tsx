'use client';

/**
 * NPD PILOT stage — PilotScreen (pilot_screen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:352-409 (PilotScreen)
 *
 * The prototype's lines 355-361 carry a "LEGACY — Phase 2 deprecation" banner.
 * That banner is INTENTIONALLY NOT translated: per the focused build mandate the
 * Pilot stage is a live production screen, so the banner is omitted.
 *
 * Parity checklist (translated to shadcn / @monopilot/ui — no verbatim JSX,
 * no raw <select>, no @radix-ui/* outside packages/ui):
 *   - blue info bar  "Scheduled pilot: <date> · <line> · <batch> · Supervisor"
 *   - "Pilot run plan" 4 label/value (LINE, BATCH SIZE, EXPECTED YIELD, DURATION)
 *   - "Material reservation" table (INGREDIENT, REQUIRED, AVAILABLE, RESERVED,
 *      STATUS badge "✓ Reserved" green / "⚠ Short" amber) + amber short callout
 *   - "Pilot checklist" (Checkbox items; checked = strikethrough)
 *
 * Money/qty render from NUMERIC decimal STRINGS (never JS floats). RBAC
 * (`permission_denied`) is resolved server-side in page.tsx and is never trusted
 * from the client. Writes go through the injected Server Action callbacks.
 */

import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import { Checkbox } from '@monopilot/ui/Checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type PilotMaterialStatus = 'reserved' | 'short';

export type PilotMaterialView = {
  id: string;
  ingredientCode: string;
  /** All qty fields are decimal STRINGS (bound straight from NUMERIC). */
  requiredKg: string | null;
  availableKg: string | null;
  reservedKg: string | null;
  /** Computed server-side: reserved >= required → 'reserved', else 'short'. */
  status: PilotMaterialStatus;
  /** Decimal STRING shortfall (required - reserved) when status === 'short'. */
  shortByKg: string | null;
};

export type PilotChecklistItemView = {
  id: string;
  label: string;
  isChecked: boolean;
  displayOrder: number;
};

export type PilotRunView = {
  id: string;
  projectId: string;
  plannedDate: string | null;
  line: string | null;
  /** Decimal STRINGS (NUMERIC). */
  batchSizeKg: string | null;
  expectedYieldPct: string | null;
  durationHours: string | null;
  supervisorName: string | null;
  status: 'planned' | 'in_progress' | 'completed';
};

export type PilotScreenData = {
  run: PilotRunView;
  materials: PilotMaterialView[];
  checklist: PilotChecklistItemView[];
  /** Total short across materials (decimal STRING) for the callout; null = none short. */
  totalShortKg: string | null;
};

export type PilotLabels = {
  title: string;
  breadcrumb: string;
  scheduledPilot: string;
  /** "{date} · {line} · {batch} · {supervisor}" placeholders. */
  scheduledPilotBody: string;
  supervisorLabel: string;
  noSupervisor: string;
  planTitle: string;
  colLine: string;
  colBatchSize: string;
  colExpectedYield: string;
  colDuration: string;
  unitKg: string;
  unitPct: string;
  unitHours: string;
  materialTitle: string;
  colIngredient: string;
  colRequired: string;
  colAvailable: string;
  colReserved: string;
  colStatus: string;
  statusReserved: string;
  /** "{shortBy}" placeholder. */
  statusShort: string;
  /** "{shortBy}" placeholder. */
  shortCallout: string;
  checklistTitle: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  notSet: string;
};

export type ToggleChecklistCall = { itemId: string; isChecked: boolean };
export type ToggleChecklistOutcome = { ok: boolean; error?: string };

/** Replace `{token}` placeholders in an i18n string (no inline strings). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => (k in vars ? vars[k] : `{${k}}`));
}

/** Format a decimal STRING qty with a unit; pure string work (no float math). */
function formatQty(value: string | null, unit: string, fallback: string): string {
  if (value === null || value.trim() === '') return fallback;
  const negative = value.trim().startsWith('-');
  const unsigned = negative ? value.trim().slice(1) : value.trim();
  const [intPart, fracRaw = ''] = unsigned.split('.');
  // Trim trailing zeros for display, but keep the exact integer/decimal text.
  const frac = fracRaw.replace(/0+$/, '');
  const body = frac ? `${intPart}.${frac}` : intPart;
  return `${negative ? '-' : ''}${body} ${unit}`;
}

function statusVariant(status: PilotMaterialStatus): BadgeVariant {
  return status === 'short' ? 'warning' : 'success';
}

function statusToneClass(status: PilotMaterialStatus): string {
  return status === 'short' ? 'badge-amber' : 'badge-green';
}

function StateNotice({ state, labels }: { state: PageState; labels: PilotLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="card empty-state">
        {labels.loading}
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon" aria-hidden="true">🧪</div>
        <div className="empty-state-title">{labels.empty}</div>
        <div className="empty-state-body">{labels.emptyBody}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red">
        <div className="alert-title">{labels.forbidden}</div>
      </div>
    );
  }
  return null;
}

export function PilotScreen({
  state = 'ready',
  data,
  labels,
  onToggleChecklistItem,
}: {
  state?: PageState;
  data: PilotScreenData | null;
  labels: PilotLabels;
  onToggleChecklistItem?: (call: ToggleChecklistCall) => Promise<ToggleChecklistOutcome>;
}) {
  // Optimistic checklist state keyed by item id (server is the source of truth).
  const [optimistic, setOptimistic] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    setOptimistic({});
  }, [data?.run.id]);

  if (state !== 'ready' || !data) {
    return (
      <main
        data-testid="pilot-screen"
        aria-labelledby="pilot-title"
        className="mx-auto w-full max-w-6xl space-y-4 p-6"
      >
        <header>
          <h1 id="pilot-title" className="page-title">
            {labels.title}
          </h1>
        </header>
        <StateNotice state={state} labels={labels} />
      </main>
    );
  }

  const { run, materials, checklist, totalShortKg } = data;

  const supervisor = run.supervisorName ?? labels.noSupervisor;
  const infoBatch = formatQty(run.batchSizeKg, labels.unitKg, labels.notSet);
  const scheduledBody = interpolate(labels.scheduledPilotBody, {
    date: run.plannedDate ?? labels.notSet,
    line: run.line ?? labels.notSet,
    batch: infoBatch,
    supervisor,
  });

  async function handleToggle(item: PilotChecklistItemView, next: boolean) {
    if (!onToggleChecklistItem) return;
    setOptimistic((prev) => ({ ...prev, [item.id]: next }));
    try {
      const result = await onToggleChecklistItem({ itemId: item.id, isChecked: next });
      if (!result.ok) {
        // Roll back on failure (server remains the source of truth).
        setOptimistic((prev) => ({ ...prev, [item.id]: item.isChecked }));
      }
    } catch {
      setOptimistic((prev) => ({ ...prev, [item.id]: item.isChecked }));
    }
  }

  return (
    <main
      data-testid="pilot-screen"
      aria-labelledby="pilot-title"
      className="mx-auto w-full max-w-6xl space-y-4 p-6"
    >
      <header className="page-head" data-region="page-head">
        <nav aria-label="breadcrumb" className="breadcrumb">
          {labels.breadcrumb}
        </nav>
        <h1 id="pilot-title" className="page-title mt-1">
          {labels.title}
        </h1>
      </header>

      {/* Blue info bar — prototype line 362. */}
      <div role="note" data-testid="pilot-info-bar" className="alert alert-blue">
        <strong>{labels.scheduledPilot}</strong> <span data-testid="pilot-info-body">{scheduledBody}</span>
      </div>

      {/* Pilot run plan — prototype lines 364-372. */}
      <Card data-testid="pilot-plan-card">
        <CardHeader>
          <CardTitle>{labels.planTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="pilot-plan-grid">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide muted">{labels.colLine}</div>
              <div className="font-medium">{run.line ?? labels.notSet}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide muted">{labels.colBatchSize}</div>
              <div className="mono font-medium">{formatQty(run.batchSizeKg, labels.unitKg, labels.notSet)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide muted">{labels.colExpectedYield}</div>
              <div className="mono font-medium">{formatQty(run.expectedYieldPct, labels.unitPct, labels.notSet)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide muted">{labels.colDuration}</div>
              <div className="mono font-medium">{formatQty(run.durationHours, labels.unitHours, labels.notSet)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Material reservation — prototype lines 374-389. */}
      <Card data-testid="pilot-material-card">
        <CardHeader>
          <CardTitle>{labels.materialTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="pilot-material-table">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colIngredient}</TableHead>
                <TableHead scope="col">{labels.colRequired}</TableHead>
                <TableHead scope="col">{labels.colAvailable}</TableHead>
                <TableHead scope="col">{labels.colReserved}</TableHead>
                <TableHead scope="col">{labels.colStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((m) => (
                <TableRow key={m.id} data-testid="pilot-material-row" data-status={m.status}>
                  <TableCell className="font-medium">{m.ingredientCode}</TableCell>
                  <TableCell className="mono tabular-nums">{formatQty(m.requiredKg, labels.unitKg, labels.notSet)}</TableCell>
                  <TableCell className="mono tabular-nums">{formatQty(m.availableKg, labels.unitKg, labels.notSet)}</TableCell>
                  <TableCell className="mono tabular-nums">{formatQty(m.reservedKg, labels.unitKg, labels.notSet)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={statusVariant(m.status)}
                      className={statusToneClass(m.status)}
                      data-status={m.status}
                      data-testid="pilot-material-status"
                    >
                      {m.status === 'short'
                        ? interpolate(labels.statusShort, {
                            shortBy: formatQty(m.shortByKg, labels.unitKg, ''),
                          }).trim()
                        : labels.statusReserved}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalShortKg ? (
            <div role="alert" data-testid="pilot-short-callout" className="alert alert-amber m-4">
              {interpolate(labels.shortCallout, {
                shortBy: formatQty(totalShortKg, labels.unitKg, ''),
              }).trim()}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Pilot checklist — prototype lines 391-407. */}
      <Card data-testid="pilot-checklist-card">
        <CardHeader>
          <CardTitle>{labels.checklistTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul data-testid="pilot-checklist" className="divide-y">
            {checklist.map((item) => {
              const checked = item.id in optimistic ? optimistic[item.id]! : item.isChecked;
              return (
                <li
                  key={item.id}
                  data-testid="pilot-checklist-item"
                  data-checked={checked}
                  className="flex items-center gap-3 py-2"
                >
                  <Checkbox
                    checked={checked}
                    disabled={!onToggleChecklistItem}
                    onCheckedChange={(next) => handleToggle(item, next)}
                    aria-label={item.label}
                  />
                  <span
                    className={checked ? 'muted line-through' : ''}
                    data-testid="pilot-checklist-label"
                  >
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}

export default PilotScreen;
