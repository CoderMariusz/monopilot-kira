'use client';

/**
 * T-107 — GateChecklistPanel (NPD-004 · Stage-Gate G0-G4 checklist).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/gate-screens.jsx:106-258 (GateChecklistPanel)
 *
 * Translation notes (prototype → production):
 *   - GATE_CHECKLISTS / overrides (mock state)   → REAL gate_checklist_items read server-side via the
 *                                                   T-057 getProject Server Action (org-scoped, RLS via
 *                                                   app.current_org_id()); the RSC parent (T-111) maps
 *                                                   getProject's `checklistByGate` into the `gates` prop.
 *                                                   This component is a pure Client island — it NEVER
 *                                                   queries the DB (risk red-line).
 *   - <input type="checkbox"> mock toggle         → @monopilot/ui Checkbox calling toggleGateChecklistItem
 *                                                   (Server Action owned by T-058 — imported as a prop,
 *                                                   never authored here) with useOptimistic feedback.
 *   - card-title / muted / mono inline strings    → i18n LABELS (npd.gateChecklist namespace) resolved by
 *                                                   the RSC parent and passed in as `labels`.
 *   - per-gate <div onClick toggleExpand>         → accessible Collapsible (button + aria-expanded; region
 *                                                   id wired via aria-controls), open state local to client.
 *   - category sub-header (BUSINESS/TECHNICAL/…)  → grouped <section> per category with TECHNICAL/BUSINESS/
 *                                                   COMPLIANCE sub-header + per-category done/total counts.
 *   - badge badge-blue / badge-red / badge-amber  → @monopilot/ui Badge (info/danger/warning) — every status
 *                                                   pairs color with a glyph + text (a11y: never color-only).
 *   - alert alert-amber / alert-green             → role="alert" notice with glyph + text (blocker / ready).
 *   - overall + per-gate progress div             → role="progressbar" with aria-valuenow/min/max + text %.
 *   - advance button gated by blockers            → disabled when blockers > 0; label switches to
 *                                                   "Request Approval" when requiresApproval; calls openModal.
 *
 * Required UI states: loading / empty / error / permission-denied (via `state`) + optimistic toggle.
 */

import React from 'react';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card } from '@monopilot/ui/Card';
import { Checkbox } from '@monopilot/ui/Checkbox';
import { EmptyState } from '@monopilot/ui/EmptyState';

// ——— Gate metadata (mirrors prototype GATE_INFO; static gate sequence is domain constant, not data) ———
export type GateKey = 'G0' | 'G1' | 'G2' | 'G3' | 'G4';
export type CategoryCode = 'TECHNICAL' | 'BUSINESS' | 'COMPLIANCE';
export type PanelState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export const GATE_ORDER: GateKey[] = ['G0', 'G1', 'G2', 'G3', 'G4'];

// Render order for category sub-headers within a gate (parity: TECHNICAL/BUSINESS/COMPLIANCE).
export const CATEGORY_ORDER: CategoryCode[] = ['TECHNICAL', 'BUSINESS', 'COMPLIANCE'];

export type ChecklistItemView = {
  id: string;
  text: string;
  required: boolean;
  done: boolean;
  category: CategoryCode | string;
  by: string | null;
  at: string | null;
  file: string | null;
  faDept?: string | null;
  faHref?: string | null;
};

export type GateView = {
  key: GateKey;
  label: string;
  items: ChecklistItemView[];
  /** percent of items done in this gate (0-100), computed by the RSC parent or derived below */
  pct: number;
  /** required-and-not-done items (blockers) for this gate */
  blockers: ChecklistItemView[];
  isCurrent: boolean;
  /** the next gate key, or null when this is the terminal gate (G4) */
  next: GateKey | null;
  /** human label of the next gate/stage */
  nextLabel: string | null;
  /** whether advancing this gate requires e-sign approval (G3/G4) */
  requiresApproval: boolean;
};

/** Server Action contract (owned by T-058 — imported by the parent, passed in here as a prop). */
export type ToggleGateChecklistItemAction = (
  itemId: string,
  done: boolean,
) => Promise<{ ok: true } | { ok: false; code: string }>;

export type OpenModalFn = (
  modal: 'gateApproval' | 'advanceGate',
  payload: { project: GateChecklistProject },
) => void;

export type GateChecklistProject = {
  id: string;
  code: string;
  name: string;
  currentGate: GateKey;
};

export type GateChecklistLabels = {
  title: string;
  currentGate: string;
  overallProgress: string;
  current: string;
  blockingBadge: string; // ICU plural: "{count, plural, ...}"
  notStarted: string;
  completedBy: string; // ICU: "Completed by {by} · {at}"
  required: string;
  optional: string;
  blocking: string;
  attach: string;
  catTechnical: string;
  catBusiness: string;
  catCompliance: string;
  blockerAlert: string; // ICU plural with {count} + {gate} + {gateLabel}
  readyAlert: string; // ICU with {gate} + {nextLabel}
  advance: string; // ICU "Advance to {gate}: {nextLabel} →"
  requestApproval: string;
  markLaunched: string;
  advanceTerminalHint: string;
  expand: string;
  collapse: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  faDerivedHint: string;
  faDerivedLocked: string;
};

function categoryLabel(category: string, labels: GateChecklistLabels): string {
  switch (category) {
    case 'TECHNICAL':
      return labels.catTechnical;
    case 'BUSINESS':
      return labels.catBusiness;
    case 'COMPLIANCE':
      return labels.catCompliance;
    default:
      return category;
  }
}

/** Stable category grouping for a gate's items, in canonical render order, falling back to any extras. */
function groupByCategory(items: ChecklistItemView[]): Array<{ code: string; items: ChecklistItemView[] }> {
  const seen = new Set<string>();
  const groups: Array<{ code: string; items: ChecklistItemView[] }> = [];
  for (const code of CATEGORY_ORDER) {
    const group = items.filter((i) => i.category === code);
    if (group.length > 0) {
      groups.push({ code, items: group });
      seen.add(code);
    }
  }
  // Any non-canonical categories preserve first-seen order after the known ones.
  for (const item of items) {
    if (!seen.has(item.category) && !CATEGORY_ORDER.includes(item.category as CategoryCode)) {
      seen.add(item.category);
      groups.push({ code: item.category, items: items.filter((i) => i.category === item.category) });
    }
  }
  return groups;
}

function pctOf(items: ChecklistItemView[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

// ——— state notice (loading / error / permission-denied) ———
function StateNotice({ state, labels }: { state: PanelState; labels: GateChecklistLabels }) {
  if (state === 'loading') {
    return (
      <div role="status" aria-live="polite" data-testid="gate-checklist-loading" className="p-6 text-sm text-slate-600">
        {labels.loading}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" data-testid="gate-checklist-error" className="p-6 text-sm text-red-700">
        {labels.error}
      </div>
    );
  }
  if (state === 'permission_denied') {
    return (
      <div role="alert" data-testid="gate-checklist-forbidden" className="p-6 text-sm text-red-700">
        {labels.forbidden}
      </div>
    );
  }
  return null;
}

// ——— overall progress bar (top card) ———
function ProgressBar({
  pct,
  label,
  testid,
}: {
  pct: number;
  label: string;
  testid: string;
}) {
  const complete = pct >= 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      data-testid={testid}
      data-complete={complete || undefined}
      className="flex items-center gap-2"
    >
      <div className="h-2 w-40 overflow-hidden rounded bg-slate-100">
        <div
          className={complete ? 'h-full bg-emerald-600' : 'h-full bg-blue-600'}
          style={{ width: `${pct}%`, transition: 'width 0.3s' }}
        />
      </div>
      <span className="font-mono text-xs font-semibold">{pct}%</span>
    </div>
  );
}

// ——— single checklist item row ———
function ChecklistItemRow({
  item,
  labels,
  canWrite,
  onToggle,
  pending,
}: {
  item: ChecklistItemView;
  labels: GateChecklistLabels;
  canWrite: boolean;
  onToggle: (item: ChecklistItemView) => void;
  pending: boolean;
}) {
  const isFaDerived = !!item.faDept;
  const isBlocking = item.required && !item.done;
  const metaId = `item-meta-${item.id}`;
  return (
    <li
      data-testid="gate-checklist-item"
      data-item-id={item.id}
      data-done={item.done || undefined}
      data-blocking={isBlocking || undefined}
      className={[
        'flex items-start gap-2.5 rounded-md border p-2 mb-1',
        isBlocking ? 'border-red-300 bg-red-50' : item.done ? 'border-slate-200 bg-emerald-50' : 'border-slate-200 bg-slate-50',
      ].join(' ')}
    >
      <Checkbox
        checked={item.done}
        disabled={isFaDerived || !canWrite || pending}
        onCheckedChange={isFaDerived ? undefined : () => onToggle(item)}
        aria-label={item.text}
        aria-describedby={metaId}
        data-testid="gate-checklist-checkbox"
        className="mt-0.5"
      />
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={[
              item.done ? 'font-normal line-through opacity-65' : 'font-medium',
              isBlocking ? 'text-red-800' : '',
            ].join(' ')}
          >
            {item.text}
          </span>
          <Badge variant={item.required ? 'info' : 'muted'} data-testid="gate-item-requirement-badge">
            {item.required ? labels.required : labels.optional}
          </Badge>
          {isBlocking && (
            <Badge variant="danger" data-testid="gate-item-blocking-badge">
              <span aria-hidden="true">⚠</span> {labels.blocking}
            </Badge>
          )}
          {isFaDerived && (
            <Badge variant="muted" data-testid="gate-item-fa-derived-badge">
              <span aria-hidden="true">🔒</span> {labels.faDerivedLocked}
            </Badge>
          )}
          {item.file && (
            <span className="text-xs text-slate-500" data-testid="gate-item-file">
              <span aria-hidden="true">📎</span> {item.file}
            </span>
          )}
        </div>
        <div id={metaId} className="mt-0.5 text-xs text-slate-500">
          {isFaDerived
            ? (
                <>
                  {labels.faDerivedHint}{' '}
                  {item.faHref ? (
                    <a
                      href={item.faHref}
                      className="font-medium text-blue-600 hover:text-blue-700"
                      data-testid="gate-item-fa-link"
                    >
                      {item.faDept}
                    </a>
                  ) : (
                    <span>{item.faDept}</span>
                  )}
                </>
              )
            : item.done && item.by
            ? labels.completedBy.replace('{by}', item.by).replace('{at}', item.at ?? '')
            : labels.notStarted}
        </div>
      </div>
      {/* Per-item "Attach" was removed (2026-06-09 modal-fix lane): no upload
          backend exists and the button was a pure no-op. Evidence attachments are
          backlogged — an honest UI shows no affordance until the backend lands. */}
    </li>
  );
}

// ——— a single (current or past) gate collapsible ———
function GateCollapsible({
  gate,
  labels,
  canWrite,
  onToggleItem,
  pendingIds,
}: {
  gate: GateView;
  labels: GateChecklistLabels;
  canWrite: boolean;
  onToggleItem: (item: ChecklistItemView) => void;
  pendingIds: Set<string>;
}) {
  // Default the current gate open (parity: expanded starts with the current gate).
  const [open, setOpen] = React.useState<boolean>(gate.isCurrent);
  const regionId = `gate-region-${gate.key}`;
  const done = gate.items.filter((i) => i.done).length;
  const pct = gate.pct;
  const complete = pct >= 100;
  const groups = groupByCategory(gate.items);

  return (
    <Card
      data-testid="gate-collapsible"
      data-gate={gate.key}
      data-current={gate.isCurrent || undefined}
      className={['mb-2', gate.isCurrent ? 'border-2 border-blue-600' : ''].join(' ')}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        data-testid="gate-collapsible-trigger"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span
          aria-hidden="true"
          className={[
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
            complete ? 'bg-emerald-600 text-white' : gate.isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500',
          ].join(' ')}
        >
          {complete ? '✓' : gate.key}
        </span>
        <span className="flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">
              {gate.key}: {gate.label}
            </span>
            {gate.isCurrent && (
              <Badge variant="info" data-testid="gate-current-badge">
                {labels.current}
              </Badge>
            )}
            {gate.isCurrent && gate.blockers.length > 0 && (
              <Badge variant="warning" data-testid="gate-blocking-count-badge">
                <span aria-hidden="true">⚠</span>{' '}
                {labels.blockingBadge.replace('{count}', String(gate.blockers.length))}
              </Badge>
            )}
          </span>
        </span>
        <span className="flex items-center gap-2.5">
          <ProgressBar pct={pct} label={`${gate.key} ${labels.overallProgress}`} testid={`gate-progress-${gate.key}`} />
          <span className="min-w-[52px] font-mono text-[11px] text-slate-500">
            {done}/{gate.items.length}
          </span>
          <span aria-hidden="true" className="text-[11px] text-slate-500">
            {open ? '▲' : '▼'}
          </span>
        </span>
      </button>

      {open && (
        <div id={regionId} data-testid="gate-collapsible-region" className="mt-3 border-t border-slate-200 pt-3">
          {groups.map((group) => {
            const catDone = group.items.filter((i) => i.done).length;
            return (
              <section key={group.code} data-testid="gate-category" data-category={group.code} className="mb-3.5">
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {categoryLabel(group.code, labels)} ({catDone}/{group.items.length})
                </h4>
                <ul className="list-none p-0">
                  {group.items.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      labels={labels}
                      canWrite={canWrite}
                      onToggle={onToggleItem}
                      pending={pendingIds.has(item.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function GateChecklistPanel({
  project,
  gates,
  labels,
  canWrite = false,
  state = 'ready',
  isTerminal = false,
  toggleGateChecklistItem,
  openModal,
}: {
  project: GateChecklistProject;
  gates: GateView[];
  labels: GateChecklistLabels;
  canWrite?: boolean;
  state?: PanelState;
  isTerminal?: boolean;
  toggleGateChecklistItem?: ToggleGateChecklistItemAction;
  openModal?: OpenModalFn;
}) {
  // Optimistic local override of item done-state (reconciled by the parent's revalidation).
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(() => new Set());

  // Apply optimistic overrides on top of the server-provided gates.
  const resolvedGates = React.useMemo<GateView[]>(() => {
    return gates.map((g) => {
      const items = g.items.map((i) => (i.id in overrides ? { ...i, done: overrides[i.id] } : i));
      return {
        ...g,
        items,
        pct: pctOf(items),
        blockers: items.filter((i) => i.required && !i.done),
      };
    });
  }, [gates, overrides]);

  const allItems = resolvedGates.flatMap((g) => g.items);
  const overallPct = pctOf(allItems);

  const currentGate = resolvedGates.find((g) => g.isCurrent) ?? resolvedGates[resolvedGates.length - 1];
  const currentBlockers = currentGate?.blockers ?? [];

  async function handleToggleItem(item: ChecklistItemView) {
    if (item.faDept) return;
    if (!canWrite || !toggleGateChecklistItem) return;
    const next = !item.done;
    setOverrides((prev) => ({ ...prev, [item.id]: next }));
    setPendingIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await toggleGateChecklistItem(item.id, next);
      if (!res.ok) {
        // Roll back the optimistic override on failure.
        setOverrides((prev) => {
          const copy = { ...prev };
          delete copy[item.id];
          return copy;
        });
      }
    } catch {
      setOverrides((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    } finally {
      setPendingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(item.id);
        return copy;
      });
    }
  }

  if (state !== 'ready') {
    return (
      <div data-testid="gate-checklist-panel">
        <StateNotice state={state} labels={labels} />
      </div>
    );
  }

  if (gates.length === 0 || allItems.length === 0) {
    return (
      <div data-testid="gate-checklist-panel">
        <EmptyState
          icon={<span aria-hidden="true">✓</span>}
          title={labels.empty}
          body={labels.emptyBody}
          action={<span />}
        />
      </div>
    );
  }

  // Split into rendered (current + past, newest-first) and future (grayed) gates.
  const currentIdx = currentGate ? GATE_ORDER.indexOf(currentGate.key) : GATE_ORDER.length - 1;
  const renderedKeys = GATE_ORDER.slice(0, currentIdx + 1).slice().reverse();
  const futureKeys = GATE_ORDER.slice(currentIdx + 1);
  const byKey = new Map(resolvedGates.map((g) => [g.key, g]));

  return (
    <div data-testid="gate-checklist-panel">
      {/* Top card: title + current gate + overall progress */}
      <Card className="mb-2.5" data-testid="gate-checklist-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">{labels.title}</h3>
            <p className="text-xs text-slate-500">
              {labels.currentGate}{' '}
              <strong>
                {currentGate?.key} — {currentGate?.label}
              </strong>
            </p>
          </div>
          <div className="text-right">
            <p className="mb-1 text-[11px] text-slate-500">{labels.overallProgress}</p>
            <ProgressBar pct={overallPct} label={labels.overallProgress} testid="gate-overall-progress" />
          </div>
        </div>
      </Card>

      {/* Current + past gates (newest first) */}
      {renderedKeys.map((key) => {
        const gate = byKey.get(key);
        if (!gate) return null;
        return (
          <GateCollapsible
            key={key}
            gate={gate}
            labels={labels}
            canWrite={canWrite}
            onToggleItem={handleToggleItem}
            pendingIds={pendingIds}
          />
        );
      })}

      {/* Future gates — grayed out, not started */}
      {futureKeys.map((key) => {
        const gate = byKey.get(key);
        return (
          <Card key={key} data-testid="gate-future" data-gate={key} className="mb-2 opacity-45">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500"
              >
                {key}
              </span>
              <span className="font-medium text-slate-500">
                {key}: {gate?.label ?? key}
              </span>
              <span className="ml-auto text-[11px] text-slate-500">{labels.notStarted}</span>
            </div>
          </Card>
        );
      })}

      {/* Footer: blocker / ready alert + advance / approval CTA */}
      {currentGate && (
        <Card className="mt-1" data-testid="gate-checklist-footer">
          {currentBlockers.length > 0 ? (
            <div role="alert" data-testid="gate-blocker-alert" className="alert alert-amber mb-3">
              <span aria-hidden="true">⚠</span>{' '}
              {labels.blockerAlert
                .replace('{count}', String(currentBlockers.length))
                .replace('{gate}', currentGate.next ?? '')
                .replace('{gateLabel}', currentGate.nextLabel ?? '')}
              <ul data-testid="gate-blocker-list" className="mt-2 list-disc pl-5">
                {currentBlockers.map((b) => (
                  <li key={b.id} data-testid="gate-blocker-list-item">
                    {b.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : currentGate.next ? (
            <div role="status" data-testid="gate-ready-alert" className="alert alert-green mb-3">
              <span aria-hidden="true">✓</span>{' '}
              {labels.readyAlert.replace('{gate}', currentGate.key).replace('{nextLabel}', currentGate.nextLabel ?? '')}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            {currentGate.next && (
              <Button
                type="button"
                data-testid="gate-advance-button"
                className={currentBlockers.length > 0 ? 'btn--secondary' : 'btn--primary'}
                disabled={currentBlockers.length > 0}
                onClick={() =>
                  openModal?.(currentGate.requiresApproval ? 'gateApproval' : 'advanceGate', { project })
                }
              >
                {currentGate.requiresApproval
                  ? labels.requestApproval
                  : labels.advance
                      .replace('{gate}', currentGate.next)
                      .replace('{nextLabel}', currentGate.nextLabel ?? '')}
              </Button>
            )}
            {!currentGate.next && currentBlockers.length === 0 && !isTerminal && (
              // Terminal G4 → launched. The launch is the same stage-native advance
              // the AdvanceGateModal performs (handoff → launched via advanceProjectGate);
              // we open that modal as the confirm + error surface so the server's
              // HANDOFF_BOM_NOT_APPROVED / ALREADY_CLOSED codes are shown inline, not
              // swallowed. (Decision: reuse the existing modal rather than thread a
              // second action + a new confirm dialog — the cheaper CORRECT option, and
              // it needs no new i18n keys, which are locked for this lane.)
              <Button
                type="button"
                className="btn--primary"
                data-testid="gate-mark-launched"
                onClick={() => openModal?.('advanceGate', { project })}
              >
                {labels.markLaunched}
              </Button>
            )}
            {isTerminal ? (
              <span
                className="badge badge-green"
                title={labels.advanceTerminalHint}
                data-testid="gate-advance-terminal"
              >
                {labels.advanceTerminalHint}
              </span>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}
