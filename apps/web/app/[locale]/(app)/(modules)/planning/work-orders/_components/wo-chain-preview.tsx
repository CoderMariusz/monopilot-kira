'use client';

/**
 * P2-PLANNING — production-chain tree preview.
 *
 * Prototype parity: reuses the hierarchy/tree idiom established by the infra
 * Locations screen (settings/infra/locations/location-tree-client.tsx:452-460):
 *   role="tree"/"treeitem"/"group", nested nodes indented by depth (marginLeft
 *   level*24px), a `▸`/`•` node marker, mono item codes, @monopilot/ui Badge pills,
 *   and the card chrome shared by wo-detail-view.tsx (rounded-xl border-slate-200
 *   bg-white; section head border-b border-slate-100 px-4 py-2 text-sm font-semibold).
 *   No new colours or components — same slate/blue palette + Badge variants.
 *
 * Root = the FG work order that will be created; children = the upstream WIP stages
 * (create-work-order-chain builds a flat FG→[W1..Wn]). Each node surfaces its
 * production line(s), process(es) + throughput_per_hour, the WIP it consumes and the
 * qty it must output — all read-only, from previewWorkOrderChain (a dry run, no write).
 *
 * i18n: this NEW surface ships with English defaults overridable via `labels`; the
 * bundle keys (apps/web/i18n/*.json) are a follow-up — flagged for the owner.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';

import type { ChainStage, PreviewWorkOrderChainResult } from '../_actions/chain-preview';

export type WoChainPreviewLabels = {
  title: string;
  subtitle: string;
  singleStageHint: string;
  loading: string;
  error: string;
  lineLabel: string;
  processLabel: string;
  throughputLabel: string;
  consumesLabel: string;
  outputsLabel: string;
  noLine: string;
  noProcess: string;
  perHour: string;
};

const DEFAULT_LABELS: WoChainPreviewLabels = {
  title: 'Production chain preview',
  subtitle: 'Stages that will be created for this finished good',
  singleStageHint: 'This finished good is made in a single stage — no upstream work orders.',
  loading: 'Building chain preview…',
  error: 'Could not build the chain preview.',
  lineLabel: 'Line',
  processLabel: 'Process',
  throughputLabel: 'Throughput',
  consumesLabel: 'Consumes',
  outputsLabel: 'Outputs',
  noLine: 'No routing line',
  noProcess: 'No process data',
  perHour: '/h',
};

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function StageNode({ stage, level, labels }: { stage: ChainStage; level: number; labels: WoChainPreviewLabels }) {
  const isRoot = stage.stageLabel === 'FG';
  const content = (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="w-5 text-center text-xs font-medium text-slate-500">
          {stage.children.length > 0 ? '▸' : '•'}
        </span>
        <Badge variant={isRoot ? 'info' : 'secondary'}>{stage.stageLabel}</Badge>
        <span className="font-mono text-xs font-semibold text-blue-700">{stage.itemCode}</span>
        <span className="text-xs text-slate-600">{stage.itemName}</span>
        <span className="ml-auto font-mono text-xs tabular-nums text-slate-800">
          {labels.outputsLabel}: {stage.requiredQty} {stage.uom}
        </span>
      </div>

      <div className="ml-7 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span className="uppercase tracking-wide text-slate-400">{labels.lineLabel}</span>
          {stage.lines.length > 0 ? (
            stage.lines.map((l) => (
              <Badge key={l.code} variant="outline">
                <span className="font-mono">{l.code}</span>
              </Badge>
            ))
          ) : (
            <span className="text-slate-400">{labels.noLine}</span>
          )}
        </span>

        <span className="flex flex-wrap items-center gap-1">
          <span className="uppercase tracking-wide text-slate-400">{labels.processLabel}</span>
          {stage.processes.length > 0 ? (
            stage.processes.map((p, i) => (
              <span key={`${p.name}-${i}`} className="flex items-center gap-1">
                <Badge variant="muted">{p.name}</Badge>
                {p.throughputPerHour != null ? (
                  <span className="font-mono tabular-nums text-slate-500">
                    {fmtNum(p.throughputPerHour)} {p.throughputUom ?? ''}
                    {labels.perHour}
                  </span>
                ) : null}
              </span>
            ))
          ) : (
            <span className="text-slate-400">{labels.noProcess}</span>
          )}
        </span>
      </div>

      {stage.consumes.length > 0 ? (
        <div className="ml-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="uppercase tracking-wide text-slate-400">{labels.consumesLabel}</span>
          {stage.consumes.map((c) => (
            <span key={c.itemCode} className="font-mono text-slate-600">
              {c.itemCode} <span className="tabular-nums text-slate-400">({c.requiredQty} {c.uom})</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  const nodeClass = `rounded-lg border px-3 py-2 ${isRoot ? 'border-blue-200 bg-blue-50/50' : 'border-slate-100 bg-slate-50'}`;

  return (
    <div
      role="treeitem"
      aria-level={level}
      aria-expanded={stage.children.length > 0 ? true : undefined}
      data-stage={stage.stageLabel}
      data-testid={`wo-chain-stage-${stage.stageLabel}`}
      className={nodeClass}
      style={{ marginLeft: `${Math.max(level - 1, 0) * 20}px` }}
    >
      {content}
      {stage.children.length > 0 ? (
        <div role="group" className="mt-2 space-y-2">
          {stage.children.map((child) => (
            <StageNode key={child.key} stage={child} level={level + 1} labels={labels} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Pure tree renderer for a resolved chain (used by tests + the fetching wrapper). */
export function WoChainTree({ root, labels: override }: { root: ChainStage; labels?: Partial<WoChainPreviewLabels> }) {
  const labels = { ...DEFAULT_LABELS, ...override };
  return (
    <div role="tree" aria-label={labels.title} data-testid="wo-chain-tree" className="space-y-2">
      <StageNode stage={root} level={1} labels={labels} />
    </div>
  );
}

/**
 * Self-fetching preview panel. Debounces the (productId, plannedQuantity) pair and
 * calls the dry-run action; renders nothing while the FG resolves to a single stage
 * (no upstream WOs) beyond a short hint, so the create modal stays quiet for simple
 * products and only grows the tree when a real multi-line routing exists.
 */
export function WoChainPreview({
  productId,
  plannedQuantity,
  previewChainAction,
  labels: override,
}: {
  productId: string | null;
  plannedQuantity: string;
  previewChainAction: (input: { productId: string; plannedQuantity: string }) => Promise<PreviewWorkOrderChainResult>;
  labels?: Partial<WoChainPreviewLabels>;
}) {
  const labels = { ...DEFAULT_LABELS, ...override };
  const [state, setState] = React.useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; result: Extract<PreviewWorkOrderChainResult, { ok: true }> }
  >({ kind: 'idle' });

  const valid = !!productId && /^\d+(?:\.\d{1,4})?$/.test(plannedQuantity.trim()) && Number(plannedQuantity) > 0;

  React.useEffect(() => {
    if (!valid || !productId) {
      setState({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    const handle = setTimeout(async () => {
      const result = await previewChainAction({ productId, plannedQuantity: plannedQuantity.trim() });
      if (cancelled) return;
      if (!result.ok) {
        // no_active_bom / not_found are honest "nothing to preview" states, not errors.
        setState(result.error === 'persistence_failed' || result.error === 'invalid_input' ? { kind: 'error' } : { kind: 'idle' });
        return;
      }
      setState({ kind: 'ready', result });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [valid, productId, plannedQuantity, previewChainAction]);

  if (state.kind === 'idle') return null;

  return (
    <section
      data-testid="wo-chain-preview"
      data-prototype-source="prototypes/design/Monopilot Design System/planning/wo-detail.jsx:321-401"
      className="rounded-xl border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-100 px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-800">{labels.title}</h3>
        <p className="text-xs text-slate-500">{labels.subtitle}</p>
      </div>
      <div className="px-4 py-3">
        {state.kind === 'loading' ? (
          <p className="py-4 text-center text-sm text-slate-400" data-testid="wo-chain-loading" aria-busy>
            {labels.loading}
          </p>
        ) : state.kind === 'error' ? (
          <p role="alert" className="py-4 text-center text-sm text-red-600" data-testid="wo-chain-error">
            {labels.error}
          </p>
        ) : !state.result.spansMultipleStages ? (
          <p className="py-2 text-sm text-slate-500" data-testid="wo-chain-single-stage">
            {labels.singleStageHint}
          </p>
        ) : (
          <WoChainTree root={state.result.root} labels={override} />
        )}
      </div>
    </section>
  );
}
