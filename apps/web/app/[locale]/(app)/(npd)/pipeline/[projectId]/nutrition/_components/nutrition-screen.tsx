'use client';

/**
 * T-074 — NutritionScreen (nutrition_screen prototype).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:4-80 (NutritionScreen)
 *
 * Translation notes (from the prototype / prototype-index-npd.json#nutrition_screen):
 *   - static `rows` mock              → server-derived public.nutrition_profiles (page.tsx, withOrgContext / RLS)
 *   - <table> nutrient declaration    → @monopilot/ui Table primitives (raw <table> is a red-line)
 *   - badge OK / At limit             → @monopilot/ui Badge + TEXT label (color is never the sole signal — a11y)
 *   - Nutri-Score A-E visual scale    → server-read public.nutri_score_results.grade; active letter marked + sr text
 *   - allergen declaration sub-table  → server-read public.nutrition_allergens (presence enum)
 *   - "Export CSV"                    → client CSV download (7 rows + header) — read-only, no server write
 *   - "Generate label PDF"            → disabled stub (Phase C4 deferred per risk_red_lines)
 *
 * Read-only screen. No mutations, no optimistic state. RBAC (`permission_denied`)
 * is resolved server-side in page.tsx and never trusted from the client.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type NutrientStatus = 'ok' | 'warn';
export type NutriGrade = 'A' | 'B' | 'C' | 'D' | 'E';
export type AllergenPresence = 'contains' | 'may_contain' | 'free_from' | 'unknown';

export type NutritionRow = {
  nutrientCode: string;
  label: string;
  unit: string;
  /** Decimal-string values (never floats) — bound straight from NUMERIC columns. */
  per100g: string;
  perPortion: string;
  status: NutrientStatus;
};

export type AllergenRow = {
  allergenCode: string;
  sourceIngredient: string | null;
  presence: AllergenPresence;
};

export type NutritionScreenData = {
  productCode: string;
  rows: NutritionRow[];
  grade: NutriGrade | null;
  allergens: AllergenRow[];
};

/**
 * Compute-NutriScore Server Action (legacy actions tree, `nutrition/_actions/compute.ts`
 * → `computeNutrition`). Persists nutrition_profiles + nutri_score_results. RBAC is
 * resolved server-side in page.tsx (the action is only threaded when the user can
 * write); errors are surfaced inline (e.g. missing ingredient nutrition data).
 */
export type ComputeNutriScoreAction = (input: {
  projectId: string;
  formulationVersionId: string;
  portionGrams?: string;
}) => Promise<{ ok: true } | { ok: false; error: string; message?: string }>;

export type NutritionLabels = {
  title: string;
  subtitle: string;
  exportCsv: string;
  generateLabel: string;
  generateLabelDisabledHint: string;
  colNutrient: string;
  colPer100g: string;
  colPerPortion: string;
  colStatus: string;
  statusOk: string;
  statusWarn: string;
  allergenTitle: string;
  allergenColAllergen: string;
  allergenColSource: string;
  allergenColPresence: string;
  presenceContains: string;
  presenceMayContain: string;
  presenceFreeFrom: string;
  presenceUnknown: string;
  allergenEmpty: string;
  nutriScoreTitle: string;
  /** ICU-ish "Nutri-Score grade {grade}" — {grade} replaced client-side. */
  nutriScoreGradeLabel: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  /** Compute NutriScore action (C2) — empty-state CTA + recompute affordance. */
  computeNutriScore: string;
  recomputeNutriScore: string;
  computing: string;
  /** Generic + specific compute error messages (the action's code/message is surfaced). */
  computeError: string;
  computeErrorNotFound: string;
};

const GRADES: NutriGrade[] = ['A', 'B', 'C', 'D', 'E'];

function statusVariant(status: NutrientStatus): BadgeVariant {
  return status === 'warn' ? 'warning' : 'success';
}

/** Design-system tone class (single-dash `.badge-*` in globals.css carry colour;
 *  the @monopilot/ui Badge BEM variants are unstyled). */
function statusToneClass(status: NutrientStatus): string {
  return status === 'warn' ? 'badge-amber' : 'badge-green';
}

const PRESENCE_TONE_CLASS: Record<AllergenPresence, string> = {
  contains: 'badge-red',
  may_contain: 'badge-amber',
  free_from: 'badge-green',
  unknown: 'badge-gray',
};

function statusText(status: NutrientStatus, labels: NutritionLabels): string {
  return status === 'warn' ? labels.statusWarn : labels.statusOk;
}

function presenceText(presence: AllergenPresence, labels: NutritionLabels): string {
  switch (presence) {
    case 'contains':
      return labels.presenceContains;
    case 'may_contain':
      return labels.presenceMayContain;
    case 'free_from':
      return labels.presenceFreeFrom;
    default:
      return labels.presenceUnknown;
  }
}

function presenceVariant(presence: AllergenPresence): BadgeVariant {
  switch (presence) {
    case 'contains':
      return 'danger';
    case 'may_contain':
      return 'warning';
    case 'free_from':
      return 'success';
    default:
      return 'muted';
  }
}

/** Per-grade background tint, mirroring the prototype's A→E green-to-red scale. */
function gradeTone(grade: NutriGrade): string {
  switch (grade) {
    case 'A':
      return 'bg-emerald-500';
    case 'B':
      return 'bg-lime-500';
    case 'C':
      return 'bg-amber-500';
    case 'D':
      return 'bg-orange-500';
    default:
      return 'bg-red-600';
  }
}

function formatValue(value: string, unit: string): string {
  return `${value} ${unit}`.trim();
}

/** Build a CSV string: header + 7 nutrient rows (nutrient, per_100g, per_portion). */
export function buildNutritionCsv(rows: NutritionRow[], labels: NutritionLabels): string {
  const header = ['nutrient', 'per_100g', 'per_portion'];
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.label, formatValue(r.per100g, r.unit), formatValue(r.perPortion, r.unit)].map(escape).join(','),
    );
  }
  void labels;
  return lines.join('\n');
}

function StateNotice({ state, labels }: { state: PageState; labels: NutritionLabels }) {
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
        <div className="empty-state-icon" aria-hidden="true">🥗</div>
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

export function NutritionScreen({
  state = 'ready',
  data,
  labels,
  projectId,
  formulationVersionId,
  defaultPortionGrams,
  computeAction,
  onRefresh,
}: {
  state?: PageState;
  data: NutritionScreenData | null;
  labels: NutritionLabels;
  /** Project + current formulation version — needed to compute the NutriScore (C2). */
  projectId?: string;
  formulationVersionId?: string | null;
  /** Default portion size in grams, sourced from npd_projects.pack_weight_g when present. */
  defaultPortionGrams?: string | null;
  /** Compute-NutriScore Server Action (injected only when the user can write). */
  computeAction?: ComputeNutriScoreAction;
  /** Server refresh after a successful compute. Test seam overrides router.refresh. */
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const refresh = React.useCallback(() => {
    if (onRefresh) onRefresh();
    else router?.refresh?.();
  }, [onRefresh, router]);

  type ComputeStatus = 'idle' | 'computing' | 'computed' | 'error';
  const [computeStatus, setComputeStatus] = React.useState<ComputeStatus>('idle');
  const [computeError, setComputeError] = React.useState<string>('');
  const [portionGrams, setPortionGrams] = React.useState(defaultPortionGrams ?? '');

  const canCompute = !!computeAction && !!projectId && !!formulationVersionId;
  const portionInput = portionGrams.trim();

  const runCompute = React.useCallback(() => {
    if (!computeAction || !projectId || !formulationVersionId || computeStatus === 'computing') {
      return;
    }
    setComputeStatus('computing');
    setComputeError('');
    void (async () => {
      try {
        const result = await computeAction({
          projectId,
          formulationVersionId,
          ...(portionInput.length > 0 ? { portionGrams: portionInput } : {}),
        });
        if (result.ok) {
          setComputeStatus('computed');
          refresh();
        } else {
          setComputeStatus('error');
          // Surface the action's message when present (e.g. ingredient nutrition
          // data missing), else a localized fallback by code.
          setComputeError(
            result.message ||
              (result.error === 'not_found' ? labels.computeErrorNotFound : labels.computeError),
          );
        }
      } catch {
        setComputeStatus('error');
        setComputeError(labels.computeError);
      }
    })();
  }, [computeAction, projectId, formulationVersionId, portionInput, computeStatus, refresh, labels.computeError, labels.computeErrorNotFound]);

  function handleExportCsv() {
    if (!data) return;
    const csv = buildNutritionCsv(data.rows, labels);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition-${data.productCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const gradeAnnouncement = (grade: NutriGrade) =>
    labels.nutriScoreGradeLabel.replace('{grade}', grade);

  return (
    <main
      data-testid="nutrition-screen"
      aria-labelledby="nutrition-title"
      className="mx-auto w-full max-w-5xl space-y-4 p-6"
    >
      <header className="page-head flex flex-wrap items-start justify-between gap-4" data-region="page-head">
        <div>
          <nav aria-label="breadcrumb" className="breadcrumb">
            NPD / {labels.title}
          </nav>
          <h1 id="nutrition-title" className="page-title mt-1">
            {labels.title}
          </h1>
          <p className="mt-1 text-sm muted">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-end justify-end gap-2">
          {/* C2 — recompute affordance when data already exists (ready state). */}
          {state === 'ready' && canCompute ? (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Portion (g)</span>
              <Input
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={portionGrams}
                onChange={(event) => setPortionGrams(event.currentTarget.value)}
                aria-label="Portion (g)"
                className="h-8 w-24"
                data-testid="nutrition-portion-grams"
              />
            </label>
          ) : null}
          {state === 'ready' && canCompute ? (
            <Button
              type="button"
              onClick={runCompute}
              disabled={computeStatus === 'computing'}
              aria-label={labels.recomputeNutriScore}
              className="btn-secondary btn-sm"
              data-status={computeStatus}
              data-testid="nutrition-recompute"
            >
              {computeStatus === 'computing' ? labels.computing : labels.recomputeNutriScore}
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={handleExportCsv}
            disabled={state !== 'ready'}
            aria-label={labels.exportCsv}
            className="btn-ghost btn-sm"
          >
            {labels.exportCsv}
          </Button>
          <Button
            type="button"
            disabled
            aria-label={labels.generateLabel}
            title={labels.generateLabelDisabledHint}
            className="btn-secondary btn-sm"
          >
            {labels.generateLabel}
          </Button>
        </div>
      </header>

      {computeStatus === 'error' && computeError ? (
        <div role="alert" className="alert alert-red" data-testid="nutrition-compute-error">
          {computeError}
        </div>
      ) : null}

      {state !== 'ready' || !data ? (
        <div className="space-y-3">
          <StateNotice state={state === 'ready' ? 'empty' : state} labels={labels} />
          {/* C2 — Compute NutriScore CTA in the empty state (write-gated server-side). */}
          {(state === 'empty' || state === 'ready') && canCompute ? (
            <div className="flex flex-wrap items-end justify-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span>Portion (g)</span>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  inputMode="decimal"
                  value={portionGrams}
                  onChange={(event) => setPortionGrams(event.currentTarget.value)}
                  aria-label="Portion (g)"
                  className="h-9 w-28"
                  data-testid="nutrition-portion-grams"
                />
              </label>
              <Button
                type="button"
                className="btn-primary"
                onClick={runCompute}
                disabled={computeStatus === 'computing'}
                data-status={computeStatus}
                data-testid="nutrition-compute"
              >
                {computeStatus === 'computing' ? labels.computing : labels.computeNutriScore}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table data-testid="nutrition-table">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">{labels.colNutrient}</TableHead>
                    <TableHead scope="col">{labels.colPer100g}</TableHead>
                    <TableHead scope="col">{labels.colPerPortion}</TableHead>
                    <TableHead scope="col">{labels.colStatus}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.nutrientCode} data-testid="nutrition-row">
                      <TableCell className="font-medium" data-testid="nutrient-label">
                        {row.label}
                      </TableCell>
                      <TableCell className="mono">{formatValue(row.per100g, row.unit)}</TableCell>
                      <TableCell className="mono muted">
                        {formatValue(row.perPortion, row.unit)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusVariant(row.status)}
                          className={statusToneClass(row.status)}
                          data-status={row.status}
                        >
                          {statusText(row.status, labels)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="allergen-card">
              <CardHeader>
                <CardTitle>{labels.allergenTitle}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.allergens.length === 0 ? (
                  <p className="p-4 text-sm muted">{labels.allergenEmpty}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">{labels.allergenColAllergen}</TableHead>
                        <TableHead scope="col">{labels.allergenColSource}</TableHead>
                        <TableHead scope="col">{labels.allergenColPresence}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.allergens.map((a) => (
                        <TableRow key={a.allergenCode} data-testid="allergen-row">
                          <TableCell className="font-medium capitalize">{a.allergenCode}</TableCell>
                          <TableCell className="muted">
                            {a.sourceIngredient ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={presenceVariant(a.presence)}
                              className={PRESENCE_TONE_CLASS[a.presence]}
                              data-presence={a.presence}
                            >
                              {presenceText(a.presence, labels)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card data-testid="nutri-score-card">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>{labels.nutriScoreTitle}</CardTitle>
                {/* C2 — recompute right next to the grade so a D/E warning is fixable
                    in place (the page-header affordance is easy to miss). Same action,
                    same pending/refresh path as the empty-state CTA. Render-gated on the
                    write-only action being threaded server-side. */}
                {computeAction !== undefined ? (
                  <Button
                    type="button"
                    className="btn-primary btn-sm"
                    onClick={runCompute}
                    disabled={computeStatus === 'computing'}
                    aria-label={labels.recomputeNutriScore}
                    data-status={computeStatus}
                    data-testid="nutrition-recompute-card"
                  >
                    {computeStatus === 'computing' ? labels.computing : labels.recomputeNutriScore}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-5 py-2">
                  <div className="flex gap-1" role="group" aria-label={labels.nutriScoreTitle}>
                    {GRADES.map((g) => {
                      const active = data.grade === g;
                      return (
                        <span
                          key={g}
                          data-testid={`nutri-grade-${g}`}
                          data-active={active ? 'true' : 'false'}
                          className={[
                            'flex h-12 w-9 items-center justify-center rounded font-bold text-white',
                            gradeTone(g),
                            active ? 'scale-110 ring-2 ring-slate-900/40' : 'opacity-50',
                          ].join(' ')}
                        >
                          <span aria-hidden="true">{g}</span>
                        </span>
                      );
                    })}
                  </div>
                  {data.grade ? (
                    <div>
                      <div
                        className="text-3xl font-bold"
                        data-testid="nutri-grade-active-letter"
                        aria-hidden="true"
                      >
                        {data.grade}
                      </div>
                      <span className="sr-only">{gradeAnnouncement(data.grade)}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-500">{labels.empty}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
