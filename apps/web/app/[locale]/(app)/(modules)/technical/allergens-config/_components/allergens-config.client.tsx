'use client';

/**
 * T-048 — TEC-042 Manufacturing-op allergen additions + TEC-043 Contamination
 * risk matrix (client island).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:111-159
 *   (`AllergenScreen`, allergen_matrix_screen) — sticky-header product/line ×
 *   allergen grid with color-coded presence cells and the Contains / May contain /
 *   Absent legend. The prototype's product rows become production-line rows (the
 *   contamination matrix is line/machine-scoped per migration 161); cell color
 *   maps to risk_level (high=red, medium=amber, low/segregated=neutral).
 *
 * The grid is the contamination-risk matrix; a second card lists manufacturing-op
 * allergen additions. Inline edit is via a per-cell <Select> popover (shadcn
 * Select — no raw <select>); the coverage-gap banner surfaces V-TEC-43 missing
 * combinations and never silently drops them. Writes call the real saveRiskCell /
 * saveMfgOpAddition Server Actions; the page is read-only without
 * technical.allergens.edit.
 *
 * Five UI states: loading / empty / error / permission-denied / ready+optimistic.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type {
  AllergensConfigData,
  AllergenRefCol,
  LineRow,
  RiskCell,
} from '../_actions/load-config';

export type AllergensConfigState = 'ready' | 'empty' | 'error' | 'loading' | 'permission_denied';

export const RISK_LEVELS = ['high', 'medium', 'low', 'segregated'] as const;
export type RiskLevelValue = (typeof RISK_LEVELS)[number] | 'none';

export type AllergensConfigLabels = {
  title: string;
  subtitle: string;
  tabMatrix: string;
  tabOps: string;
  colLine: string;
  legendContains: string;
  legendMayContain: string;
  legendAbsent: string;
  gapBanner: string;
  gapLink: string;
  riskLevel: Record<string, string>;
  riskNone: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  readOnlyTag: string;
  opsTitle: string;
  opsColOperation: string;
  opsColAllergen: string;
  opsColReason: string;
  opsEmpty: string;
  saveError: string;
  cellAria: string;
};

// risk_level → cell badge variant (mirrors prototype red/amber/neutral legend).
const RISK_VARIANT: Record<string, 'danger' | 'warning' | 'muted' | 'secondary'> = {
  high: 'danger',
  medium: 'warning',
  low: 'secondary',
  segregated: 'muted',
};

export type AllergensConfigProps = {
  data: AllergensConfigData | null;
  labels: AllergensConfigLabels;
  state: AllergensConfigState;
  canEdit: boolean;
  saveRiskAction?: (input: {
    lineId: string;
    allergenCode: string;
    riskLevel: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  removeRiskAction?: (input: { id: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
};

function riskIndex(risks: RiskCell[]): Map<string, RiskCell> {
  const map = new Map<string, RiskCell>();
  for (const r of risks) map.set(`${r.lineId}::${r.allergenCode}`, r);
  return map;
}

function RiskMatrix({
  lines,
  allergens,
  risks,
  labels,
  canEdit,
  onChange,
}: {
  lines: LineRow[];
  allergens: AllergenRefCol[];
  risks: RiskCell[];
  labels: AllergensConfigLabels;
  canEdit: boolean;
  onChange: (lineId: string, allergenCode: string, level: RiskLevelValue, existing?: RiskCell) => void;
}) {
  const idx = riskIndex(risks);
  const options = [
    { value: 'none', label: labels.riskNone },
    ...RISK_LEVELS.map((v) => ({ value: v, label: labels.riskLevel[v] ?? v })),
  ];

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <Table aria-label={labels.title} className="min-w-max">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="sticky left-0 z-10 bg-white">
              {labels.colLine}
            </TableHead>
            {allergens.map((a) => (
              <TableHead key={a.allergenCode} scope="col" className="text-center text-xs">
                {a.allergenName}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id} data-testid={`risk-row-${line.id}`}>
              <TableCell className="sticky left-0 z-10 bg-white font-medium">{line.name}</TableCell>
              {allergens.map((a) => {
                const cell = idx.get(`${line.id}::${a.allergenCode}`);
                const level: RiskLevelValue = (cell?.riskLevel as RiskLevelValue) ?? 'none';
                const testId = `risk-cell-${line.id}-${a.allergenCode}`;
                if (!canEdit) {
                  return (
                    <TableCell key={a.allergenCode} className="text-center" data-testid={testId}>
                      {cell ? (
                        <Badge variant={RISK_VARIANT[cell.riskLevel] ?? 'muted'}>
                          {labels.riskLevel[cell.riskLevel] ?? cell.riskLevel}
                        </Badge>
                      ) : (
                        <span aria-hidden className="text-muted-foreground">
                          ·
                        </span>
                      )}
                    </TableCell>
                  );
                }
                return (
                  <TableCell key={a.allergenCode} className="p-1 text-center" data-testid={testId}>
                    <Select
                      value={level}
                      onValueChange={(v) =>
                        onChange(line.id, a.allergenCode, v as RiskLevelValue, cell)
                      }
                      options={options}
                      aria-label={`${labels.cellAria} ${line.name} ${a.allergenName}`}
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AllergensConfig({
  data,
  labels,
  state,
  canEdit,
  saveRiskAction,
  removeRiskAction,
}: AllergensConfigProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<'matrix' | 'ops'>('matrix');
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();

  if (state === 'loading') {
    return (
      <div data-testid="allergens-config" data-state="loading" className="space-y-3">
        <div role="status" className="text-sm text-muted-foreground">
          {labels.loading}
        </div>
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }
  if (state === 'permission_denied' && !data) {
    return (
      <div data-testid="allergens-config" data-state="permission_denied">
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          {labels.forbidden}
        </div>
      </div>
    );
  }
  if (state === 'error' || !data) {
    return (
      <div data-testid="allergens-config" data-state="error">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {labels.error}
        </div>
      </div>
    );
  }

  function handleCellChange(
    lineId: string,
    allergenCode: string,
    level: RiskLevelValue,
    existing?: RiskCell,
  ) {
    setError(null);
    startTransition(async () => {
      let result: { ok: true } | { ok: false; error: string };
      if (level === 'none') {
        if (!existing || !removeRiskAction) return;
        result = await removeRiskAction({ id: existing.id });
      } else {
        if (!saveRiskAction) return;
        result = await saveRiskAction({ lineId, allergenCode, riskLevel: level });
      }
      if (result.ok) {
        router.refresh();
      } else {
        setError(labels.saveError);
      }
    });
  }

  const isEmpty =
    data.lines.length === 0 && data.operations.length === 0 && data.mfgOpAdditions.length === 0;

  return (
    <div data-testid="allergens-config" data-state={state} className="space-y-4">
      {!canEdit ? (
        <Badge variant="muted" data-testid="allergens-config-readonly">
          {labels.readOnlyTag}
        </Badge>
      ) : null}

      {data.coverageGapCount > 0 ? (
        <div
          role="alert"
          data-testid="coverage-gap-banner"
          className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800"
        >
          <span>
            {labels.gapBanner.replace('{count}', String(data.coverageGapCount))}
          </span>
          <button
            type="button"
            data-testid="coverage-gap-link"
            className="font-medium text-amber-900 underline underline-offset-4"
            onClick={() => setTab('matrix')}
          >
            {labels.gapLink}
          </button>
        </div>
      ) : null}

      <nav className="flex gap-2" aria-label={labels.title}>
        <Button
          type="button"
          className={tab === 'matrix' ? 'btn-primary' : 'btn-secondary'}
          data-testid="tab-matrix"
          aria-pressed={tab === 'matrix'}
          onClick={() => setTab('matrix')}
        >
          {labels.tabMatrix}
        </Button>
        <Button
          type="button"
          className={tab === 'ops' ? 'btn-primary' : 'btn-secondary'}
          data-testid="tab-ops"
          aria-pressed={tab === 'ops'}
          onClick={() => setTab('ops')}
        >
          {labels.tabOps}
        </Button>
      </nav>

      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isEmpty ? (
        <div data-testid="allergens-config-empty" className="rounded-xl border bg-white px-6 py-6 text-sm">
          <p className="font-medium">{labels.empty}</p>
          <p className="mt-1 text-muted-foreground">{labels.emptyBody}</p>
        </div>
      ) : tab === 'matrix' ? (
        <div className="space-y-3" data-testid="matrix-panel">
          <RiskMatrix
            lines={data.lines}
            allergens={data.allergens}
            risks={data.risks}
            labels={labels}
            canEdit={canEdit}
            onChange={handleCellChange}
          />
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" data-testid="risk-legend">
            <span className="flex items-center gap-1">
              <Badge variant="danger">●</Badge> {labels.legendContains}
            </span>
            <span className="flex items-center gap-1">
              <Badge variant="warning">⚠</Badge> {labels.legendMayContain}
            </span>
            <span className="flex items-center gap-1">
              <Badge variant="muted">·</Badge> {labels.legendAbsent}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-white" data-testid="ops-panel">
          <header className="border-b px-5 py-4">
            <h2 className="text-base font-semibold tracking-tight">{labels.opsTitle}</h2>
          </header>
          {data.mfgOpAdditions.length === 0 ? (
            <p data-testid="ops-empty" className="px-5 py-6 text-sm text-muted-foreground">
              {labels.opsEmpty}
            </p>
          ) : (
            <Table aria-label={labels.opsTitle}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.opsColOperation}</TableHead>
                  <TableHead scope="col">{labels.opsColAllergen}</TableHead>
                  <TableHead scope="col">{labels.opsColReason}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.mfgOpAdditions.map((m) => (
                  <TableRow
                    key={`${m.manufacturingOperationName}-${m.allergenCode}`}
                    data-testid={`mfgop-row-${m.manufacturingOperationName}-${m.allergenCode}`}
                  >
                    <TableCell className="font-medium">{m.manufacturingOperationName}</TableCell>
                    <TableCell className="font-mono text-sm">{m.allergenCode}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
