'use client';

/**
 * T-082 — RiskRegisterScreen (SCR-12 Risk register, per-FA).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/docs-screens.jsx:56-106 (RiskRegisterScreen)
 *
 * Translation notes (from the prototype):
 *   - window.NPD_RISKS[fa.fa_code]      → server-side withOrgContext read of public.risks (page.tsx → listRisks)
 *   - badge(score) High/Med/Low helper  → RiskBucketBadge: score>=6 danger, >=3 warning, else muted (color + text)
 *   - statusBadge(status) Open/Mit/Closed→ shadcn Badge variants mapped from risks.state enum
 *   - openModal('riskAdd', {fa})         → RiskAddModal create mode (wired to createRisk action)
 *   - openModal('riskAdd', {fa, risk})   → RiskAddModal edit mode (wired to updateRisk action)
 *   - raw column layout                  → shadcn Table primitives
 *
 * Domain extension (MON-domain-npd V18): a High-bucket Open risk blocks `built`.
 * The screen surfaces a non-blocking advisory banner so the FA owner knows why the
 * D365 Builder / built transition will refuse — the enforcement itself lives server-side.
 *
 * RBAC: `canWrite` is resolved server-side (page.tsx) and never trusted from the
 * client — the Add-risk / Edit controls are omitted when false (no render-then-disable).
 */

import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { RiskAddModal } from './risk-add-modal';
import type { CreateRiskAction, UpdateRiskAction } from './risk-add-modal';
import type { RiskBucket, RiskRegisterLabels, RiskRow, RiskState } from './risk-types';

export type { RiskBucket, RiskRegisterLabels, RiskRow, RiskState } from './risk-types';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

const BUCKET_VALUES: RiskBucket[] = ['High', 'Med', 'Low'];
const STATE_VALUES: RiskState[] = ['Open', 'Mitigated', 'Closed'];

function bucketVariant(bucket: RiskBucket): BadgeVariant {
  switch (bucket) {
    case 'High':
      return 'danger';
    case 'Med':
      return 'warning';
    default:
      return 'muted';
  }
}

// Design-system badge tone class (the @monopilot/ui Badge BEM `.badge--*` variant is
// unstyled in globals.css; the explicit `.badge-{tone}` class carries the real color).
function bucketBadgeClass(bucket: RiskBucket): string {
  switch (bucket) {
    case 'High':
      return 'badge-red';
    case 'Med':
      return 'badge-amber';
    default:
      return 'badge-gray';
  }
}

function stateBadgeClass(state: RiskState): string {
  switch (state) {
    case 'Open':
      return 'badge-amber';
    case 'Mitigated':
      return 'badge-green';
    default:
      return 'badge-gray';
  }
}

function bucketLabel(bucket: RiskBucket, labels: RiskRegisterLabels): string {
  switch (bucket) {
    case 'High':
      return labels.bucketHigh;
    case 'Med':
      return labels.bucketMed;
    default:
      return labels.bucketLow;
  }
}

function stateVariant(state: RiskState): BadgeVariant {
  switch (state) {
    case 'Open':
      return 'warning';
    case 'Mitigated':
      return 'success';
    default:
      return 'muted';
  }
}

function stateLabel(state: RiskState, labels: RiskRegisterLabels): string {
  switch (state) {
    case 'Open':
      return labels.stateOpen;
    case 'Mitigated':
      return labels.stateMitigated;
    default:
      return labels.stateClosed;
  }
}

/** Bucket badge — color is paired with a text label so severity is never color-only (a11y). */
function RiskBucketBadge({ bucket, score, labels }: { bucket: RiskBucket; score: number; labels: RiskRegisterLabels }) {
  const label = bucketLabel(bucket, labels);
  return (
    <Badge
      variant={bucketVariant(bucket)}
      className={bucketBadgeClass(bucket)}
      data-testid="risk-bucket-badge"
      data-bucket={bucket}
      aria-label={`${label} · ${score}`}
    >
      {label} · {score}
    </Badge>
  );
}

function StateNotice({ state, labels }: { state: PageState; labels: RiskRegisterLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" className="muted" style={{ padding: 24, fontSize: 13 }}>
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" className="alert alert-red" style={{ margin: 16 }}>
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

type ModalIntent = { mode: 'create' } | { mode: 'edit'; risk: RiskRow };

export function RiskRegisterScreen({
  productCode,
  rows,
  labels,
  canWrite,
  state = 'ready',
  embedded = false,
  createRiskAction,
  updateRiskAction,
}: {
  productCode: string;
  rows: RiskRow[];
  labels: RiskRegisterLabels;
  canWrite: boolean;
  state?: PageState;
  /** When true, omit page-level landmark/chrome (mounted inside another page). */
  embedded?: boolean;
  createRiskAction?: CreateRiskAction;
  updateRiskAction?: UpdateRiskAction;
}) {
  const [stateFilter, setStateFilter] = React.useState('all');
  const [bucketFilter, setBucketFilter] = React.useState('all');
  const [modal, setModal] = React.useState<ModalIntent | null>(null);

  const filtered = React.useMemo(() => {
    return rows.filter((row) => {
      if (stateFilter !== 'all' && row.state !== stateFilter) return false;
      if (bucketFilter !== 'all' && row.bucket !== bucketFilter) return false;
      return true;
    });
  }, [rows, stateFilter, bucketFilter]);

  // V18 built-blocker: any High-bucket Open risk blocks the FA `built` transition.
  // Only meaningful once data is actually loaded (ready/empty) — never during
  // loading/error/permission_denied where the row set is not authoritative.
  const dataLoaded = state === 'ready' || state === 'empty';
  const builtBlocked = React.useMemo(
    () => dataLoaded && rows.some((row) => row.bucket === 'High' && row.state === 'Open'),
    [dataLoaded, rows],
  );

  function clearFilters() {
    setStateFilter('all');
    setBucketFilter('all');
  }

  const stateOptions = [
    { value: 'all', label: labels.stateAll },
    ...STATE_VALUES.map((value) => ({ value, label: stateLabel(value, labels) })),
  ];
  const bucketOptions = [
    { value: 'all', label: labels.bucketAll },
    ...BUCKET_VALUES.map((value) => ({ value, label: bucketLabel(value, labels) })),
  ];

  const showTable = dataLoaded;
  const Root = embedded ? 'section' : 'main';

  return (
    <Root
      data-testid="risk-register-screen"
      {...(embedded ? {} : { 'aria-labelledby': 'risk-register-title' })}
      className="card"
    >
      <div className="card-head">
        {embedded ? null : (
          <div>
            <nav aria-label="breadcrumb" className="muted" style={{ fontSize: 11 }}>
              NPD / <span className="mono">{productCode}</span> / {labels.title}
            </nav>
            <h1 id="risk-register-title" className="card-title" style={{ marginTop: 2 }}>
              {labels.title}
            </h1>
            <div className="muted" style={{ fontSize: 11 }}>{labels.subtitle}</div>
          </div>
        )}
        {canWrite ? (
          <Button
            type="button"
            className="btn-secondary btn-sm"
            aria-label={labels.addRisk}
            onClick={() => setModal({ mode: 'create' })}
          >
            {labels.addRisk}
          </Button>
        ) : null}
      </div>

      {builtBlocked ? (
        <div role="alert" data-testid="risk-built-blocker" className="alert alert-red">
          <span className="alert-title">{labels.builtBlocked}</span> — {labels.builtBlockedBody}
        </div>
      ) : null}

      <div
        role="group"
        aria-labelledby="risk-register-title"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}
      >
        <div className="ff" style={{ marginBottom: 0, minWidth: 160 }}>
          <label id="risk-bucket-label" htmlFor="risk-bucket-filter">{labels.filterBucket}</label>
          <Select value={bucketFilter} onValueChange={setBucketFilter} options={bucketOptions}>
            <SelectTrigger id="risk-bucket-filter" aria-label={labels.filterBucket}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {bucketOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ff" style={{ marginBottom: 0, minWidth: 160 }}>
          <label id="risk-state-label" htmlFor="risk-state-filter">{labels.filterState}</label>
          <Select value={stateFilter} onValueChange={setStateFilter} options={stateOptions}>
            <SelectTrigger id="risk-state-filter" aria-label={labels.filterState}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stateOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" className="btn-secondary btn-sm" onClick={clearFilters}>
          {labels.clearFilters}
        </Button>
      </div>

      {!showTable ? (
        <StateNotice state={state} labels={labels} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="⚠"
          title={labels.empty}
          body={labels.emptyBody}
          action={
            canWrite
              ? { label: labels.addRisk, onClick: () => setModal({ mode: 'create' }) }
              : { label: labels.clearFilters, onClick: clearFilters }
          }
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table aria-label={labels.title}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colScore}</TableHead>
                <TableHead scope="col">{labels.colDescription}</TableHead>
                <TableHead scope="col" style={{ textAlign: 'center' }}>{labels.colLikelihood}</TableHead>
                <TableHead scope="col" style={{ textAlign: 'center' }}>{labels.colImpact}</TableHead>
                <TableHead scope="col">{labels.colStatus}</TableHead>
                <TableHead scope="col">{labels.colOwner}</TableHead>
                <TableHead scope="col">{labels.colMitigation}</TableHead>
                <TableHead scope="col">{labels.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow
                  key={row.id}
                  data-testid={`risk-row-${row.id}`}
                  data-bucket={row.bucket}
                  data-state={row.state}
                >
                  <TableCell>
                    <RiskBucketBadge bucket={row.bucket} score={row.score} labels={labels} />
                  </TableCell>
                  <TableCell style={{ fontWeight: 500 }}>{row.title}</TableCell>
                  <TableCell className="mono" style={{ textAlign: 'center', fontSize: 12 }}>
                    {row.likelihood}
                  </TableCell>
                  <TableCell className="mono" style={{ textAlign: 'center', fontSize: 12 }}>
                    {row.impact}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={stateVariant(row.state)}
                      className={stateBadgeClass(row.state)}
                      aria-label={stateLabel(row.state, labels)}
                    >
                      {stateLabel(row.state, labels)}
                    </Badge>
                  </TableCell>
                  <TableCell className="muted" style={{ fontSize: 12 }}>
                    {row.owner ?? <span className="muted">—</span>}
                  </TableCell>
                  <TableCell className="muted" style={{ fontSize: 12 }}>
                    {row.mitigation ?? <span className="muted">—</span>}
                  </TableCell>
                  <TableCell style={{ whiteSpace: 'nowrap' }}>
                    {canWrite ? (
                      <Button
                        type="button"
                        className="btn-ghost btn-sm"
                        aria-label={`${labels.edit} ${row.title}`}
                        onClick={() => setModal({ mode: 'edit', risk: row })}
                      >
                        {labels.edit}
                      </Button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {modal ? (
        <RiskAddModal
          open
          mode={modal.mode}
          productCode={productCode}
          risk={modal.mode === 'edit' ? modal.risk : undefined}
          labels={labels}
          onClose={() => setModal(null)}
          createRiskAction={createRiskAction}
          updateRiskAction={updateRiskAction}
        />
      ) : null}
    </Root>
  );
}

export default RiskRegisterScreen;
