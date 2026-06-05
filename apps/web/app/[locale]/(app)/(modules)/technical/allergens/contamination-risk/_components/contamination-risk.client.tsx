'use client';

/**
 * Contamination risk matrix (ContaminationRiskScreen) — client island.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:1485-1574 (ContaminationRiskScreen). KPI strip (high /
 *   medium / segregated / coverage) + a line × allergen risk grid with an
 *   edit-mode toggle, a colour-coded cell legend (H/M/L/S) and the 08-PRODUCTION
 *   changeover-gate note (PRD §10.5). The prototype's free <select> per cell is
 *   translated to a shadcn <Select> (no raw <select>).
 *
 * Backed by the EXISTING contamination service (lib/technical/allergens/
 * contamination.ts) via the load-config Server Actions (saveRiskCell /
 * removeRiskCell) — withOrgContext + RLS, no mocks. Writes gated on
 * technical.allergens.edit (re-checked server-side).
 *
 * Five UI states: loading / empty / error / permission-denied / ready (+optimistic
 * cell write via useTransition + router.refresh).
 */

import { type CSSProperties, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';

import type { AllergenRefCol, LineRow, RiskCell } from '../../../allergens-config/_actions/load-config';

export type ContaminationState = 'ready' | 'empty' | 'error' | 'denied';

export type RiskLevelValue = 'high' | 'medium' | 'low' | 'segregated' | 'none';

export type ContaminationLabels = {
  kpiHigh: string;
  kpiHighSub: string;
  kpiMedium: string;
  kpiMediumSub: string;
  kpiSegregated: string;
  kpiSegregatedSub: string;
  kpiCoverage: string;
  kpiCoverageSub: string;
  colLine: string;
  edit: string;
  done: string;
  riskLevel: Record<string, string>;
  riskNone: string;
  legendHigh: string;
  legendMedium: string;
  legendLow: string;
  legendSegregated: string;
  legendTitle: string;
  changeoverNote: string;
  empty: string;
  emptyBody: string;
  error: string;
  denied: string;
  readOnlyTag: string;
  saveError: string;
  cellAria: string;
};

type SaveResult = { ok: true } | { ok: false; error: string };

const RISK_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  high: { bg: 'var(--red)', fg: '#fff', label: 'H' },
  medium: { bg: 'var(--amber)', fg: '#fff', label: 'M' },
  low: { bg: 'var(--green)', fg: '#fff', label: 'L' },
  segregated: { bg: '#4b5563', fg: '#fff', label: 'S' },
};
const NONE_TONE = { bg: 'var(--gray-100)', fg: 'var(--muted)', label: '—' };

export type ContaminationProps = {
  state: ContaminationState;
  lines: LineRow[];
  allergens: AllergenRefCol[];
  risks: RiskCell[];
  canEdit: boolean;
  labels: ContaminationLabels;
  saveAction: (input: {
    lineId: string;
    allergenCode: string;
    riskLevel: string;
  }) => Promise<SaveResult>;
  removeAction: (input: { id: string }) => Promise<SaveResult>;
};

function cellBox(tone: { bg: string; fg: string }): CSSProperties {
  return {
    width: 28,
    height: 28,
    margin: '0 auto',
    borderRadius: 4,
    background: tone.bg,
    color: tone.fg,
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

export function ContaminationRisk({
  state,
  lines,
  allergens,
  risks,
  canEdit,
  labels,
  saveAction,
  removeAction,
}: ContaminationProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const riskByCell = useMemo(() => {
    const m = new Map<string, RiskCell>();
    for (const r of risks) m.set(`${r.lineId}::${r.allergenCode}`, r);
    return m;
  }, [risks]);

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0, segregated: 0 };
    for (const r of risks) {
      if (r.riskLevel in c) c[r.riskLevel as keyof typeof c] += 1;
    }
    return c;
  }, [risks]);

  if (state === 'denied') {
    return (
      <div role="alert" data-testid="contamination-denied" className="alert alert-amber">
        <div className="alert-title">{labels.denied}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" data-testid="contamination-error" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div data-testid="contamination-empty" className="card">
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">▦</span>
          <p className="empty-state-title">{labels.empty}</p>
          <p className="empty-state-body">{labels.emptyBody}</p>
        </div>
      </div>
    );
  }

  const options = [
    { value: 'none', label: labels.riskNone },
    ...(['high', 'medium', 'low', 'segregated'] as const).map((v) => ({
      value: v,
      label: labels.riskLevel[v] ?? v,
    })),
  ];

  function handleChange(lineId: string, allergenCode: string, level: RiskLevelValue, existing?: RiskCell) {
    setError(null);
    startTransition(async () => {
      let result: SaveResult;
      if (level === 'none') {
        if (!existing) return;
        result = await removeAction({ id: existing.id });
      } else {
        result = await saveAction({ lineId, allergenCode, riskLevel: level });
      }
      if (result.ok) router.refresh();
      else setError(labels.saveError);
    });
  }

  return (
    <div data-testid="contamination-risk" data-state={state} className="flex flex-col gap-3">
      {/* KPI strip — real counts. */}
      <div className="kpi-row" data-testid="contamination-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi red">
          <div className="kpi-label">{labels.kpiHigh}</div>
          <div className="kpi-value">{counts.high}</div>
          <div className="kpi-change text-muted-foreground">{labels.kpiHighSub}</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">{labels.kpiMedium}</div>
          <div className="kpi-value">{counts.medium}</div>
          <div className="kpi-change text-muted-foreground">{labels.kpiMediumSub}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{labels.kpiSegregated}</div>
          <div className="kpi-value">{counts.segregated}</div>
          <div className="kpi-change text-muted-foreground">{labels.kpiSegregatedSub}</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">{labels.kpiCoverage}</div>
          <div className="kpi-value">
            {lines.length}×{allergens.length}
          </div>
          <div className="kpi-change text-muted-foreground">{labels.kpiCoverageSub}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {!canEdit ? (
          <Badge variant="muted" data-testid="contamination-readonly">
            {labels.readOnlyTag}
          </Badge>
        ) : (
          <span />
        )}
        {canEdit ? (
          <Button
            type="button"
            className="btn-secondary"
            data-testid="contamination-edit-toggle"
            aria-pressed={editMode}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? labels.done : labels.edit}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="alert alert-red">
          {error}
        </p>
      ) : null}

      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'auto',
        }}
      >
        <table className="table" data-testid="contamination-table">
          <thead>
            <tr>
              <th scope="col" style={{ minWidth: 200, position: 'sticky', left: 0, background: '#fff', zIndex: 2 }}>
                {labels.colLine}
              </th>
              {allergens.map((a) => (
                <th
                  key={a.allergenCode}
                  scope="col"
                  title={a.allergenName}
                  style={{
                    textAlign: 'center',
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    padding: '8px 2px',
                    height: 90,
                    fontSize: 10,
                  }}
                >
                  {a.allergenName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} data-testid={`contamination-row-${line.id}`}>
                <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {line.code}
                  </div>
                  <div style={{ fontWeight: 500 }}>{line.name}</div>
                </td>
                {allergens.map((a) => {
                  const cell = riskByCell.get(`${line.id}::${a.allergenCode}`);
                  const level = (cell?.riskLevel as RiskLevelValue) ?? 'none';
                  const tone = cell ? RISK_TONE[cell.riskLevel] ?? NONE_TONE : NONE_TONE;
                  const testId = `contamination-cell-${line.id}-${a.allergenCode}`;
                  return (
                    <td key={a.allergenCode} style={{ textAlign: 'center', padding: 2 }} data-testid={testId}>
                      {editMode && canEdit ? (
                        <Select
                          value={level}
                          onValueChange={(v) => handleChange(line.id, a.allergenCode, v as RiskLevelValue, cell)}
                          options={options}
                          aria-label={`${labels.cellAria} ${line.name} ${a.allergenName}`}
                        />
                      ) : (
                        <div
                          title={`${a.allergenName} · ${cell ? labels.riskLevel[cell.riskLevel] ?? cell.riskLevel : labels.riskNone}`}
                          aria-label={`${a.allergenName}: ${cell ? labels.riskLevel[cell.riskLevel] ?? cell.riskLevel : labels.riskNone}`}
                          style={cellBox(tone)}
                          data-disabled={pending ? 'true' : undefined}
                        >
                          {tone.label}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs" data-testid="contamination-legend">
        <span className="uppercase text-muted-foreground" style={{ fontSize: 10 }}>
          {labels.legendTitle}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 16, height: 16, background: 'var(--red)', borderRadius: 3 }} aria-hidden="true" />
          <b>{labels.legendHigh}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 16, height: 16, background: 'var(--amber)', borderRadius: 3 }} aria-hidden="true" />
          <b>{labels.legendMedium}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 16, height: 16, background: 'var(--green)', borderRadius: 3 }} aria-hidden="true" />
          <b>{labels.legendLow}</b>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: 16, height: 16, background: '#4b5563', borderRadius: 3 }} aria-hidden="true" />
          <b>{labels.legendSegregated}</b>
        </span>
      </div>

      <div className="alert alert-blue" data-testid="contamination-changeover-note">
        <span aria-hidden="true">ⓘ</span> {labels.changeoverNote}
      </div>
    </div>
  );
}
