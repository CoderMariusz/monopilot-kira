'use client';

/**
 * T-043 — UI: TEC-083 BOM Graph (where-used).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-detail.jsx:471-544
 *     (GraphTab — column-flow material graph: raw materials → sub-BOMs → process
 *      → finished output, with a flow legend)
 *
 * A client-only visualisation of the shared BOM SSOT relationships for one FG,
 * built from REAL data (the bom_lines components of this BOM + the where-used
 * parents that reference this FG as a component — both loaded by the existing
 * detail-page loader, no mocks). Two directions:
 *   - "down"  (explode): FG → its component lines (children, layered by type).
 *   - "up"    (where-used / inverse): parent BOMs that consume this FG → FG.
 *
 * The direction toggle is a shadcn <Select> (raw <select> is a red-line). The
 * prototype's drag/pan/zoom and the multi-level sub-BOM expansion are layout
 * tuning (explicitly out of scope); we render the layered columns + arrows the
 * SSOT single-level model backs with real rows. No graph library is loaded on
 * the initial bundle (this component is client-only and uses plain layout — the
 * detail page mounts it lazily via React.lazy on the client when its tab opens).
 *
 * Red-lines: FG canonical (no FA labels); no inline styles (Tailwind only); no
 * raw <select>; @radix-ui only inside packages/ui; shared SSOT is the SoT.
 */

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

export type GraphDirection = 'down' | 'up';

export type GraphComponentNode = {
  id: string;
  code: string;
  /** RM / PM / WIP / FG (drives the layer/column). */
  type: string | null;
  quantity: string;
  uom: string;
  operationName: string | null;
};

export type GraphParentNode = {
  productId: string;
  productName: string | null;
  version: number;
  quantity: string;
  uom: string;
};

export type GraphData = {
  rootCode: string;
  rootName: string | null;
  components: GraphComponentNode[];
  parents: GraphParentNode[];
};

export type GraphTabLabels = {
  intro: string;
  directionLabel: string;
  directionDown: string;
  directionUp: string;
  layerRaw: string;
  layerSub: string;
  layerProcess: string;
  layerOutput: string;
  layerParents: string;
  emptyComponents: string;
  emptyParents: string;
  legendRaw: string;
  legendSub: string;
  legendProcess: string;
  legendOutput: string;
};

const RAW_TYPES = new Set(['RM', 'PM']);
const SUB_TYPES = new Set(['WIP', 'FG']);

function FlowArrow() {
  return (
    <div aria-hidden="true" className="flex items-center text-xl text-muted-foreground">
      →
    </div>
  );
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

export function BomGraphTab({
  data,
  labels,
  defaultDirection = 'down',
}: {
  data: GraphData;
  labels: GraphTabLabels;
  defaultDirection?: GraphDirection;
}) {
  const [direction, setDirection] = React.useState<GraphDirection>(defaultDirection);

  const raw = data.components.filter((c) => RAW_TYPES.has((c.type ?? '').toUpperCase()));
  const sub = data.components.filter((c) => SUB_TYPES.has((c.type ?? '').toUpperCase()));
  // Components with no recognised type fall back into the raw column so nothing
  // is dropped from the real data.
  const untyped = data.components.filter(
    (c) => !RAW_TYPES.has((c.type ?? '').toUpperCase()) && !SUB_TYPES.has((c.type ?? '').toUpperCase()),
  );
  const rawNodes = [...raw, ...untyped];

  const processOps = Array.from(
    new Set(
      data.components
        .map((c) => c.operationName)
        .filter((o): o is string => Boolean(o && o.trim())),
    ),
  );

  return (
    <div data-testid="bom-graph-tab" data-direction={direction}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-xs text-muted-foreground">{labels.intro}</p>
        <div className="flex items-center gap-2">
          <span id="bom-graph-direction-label" className="text-xs font-medium text-slate-700">
            {labels.directionLabel}
          </span>
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as GraphDirection)}
            aria-labelledby="bom-graph-direction-label"
          >
            <SelectTrigger aria-label={labels.directionLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="down">{labels.directionDown}</SelectItem>
              <SelectItem value="up">{labels.directionUp}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {direction === 'down' ? (
        <DownFlow
          data={data}
          rawNodes={rawNodes}
          subNodes={sub}
          processOps={processOps}
          labels={labels}
        />
      ) : (
        <UpFlow data={data} labels={labels} />
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-4 text-[11px] text-muted-foreground">
        <LegendDot className="border-l-sky-500 bg-sky-50" label={labels.legendSub} />
        <LegendDot className="border-l-amber-500 bg-amber-50" label={labels.legendProcess} />
        <LegendDot className="border-l-slate-400 bg-slate-50" label={labels.legendRaw} />
        <LegendDot className="border-l-green-500 bg-green-50" label={labels.legendOutput} />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 border-l-[3px] ${className}`} />
      {label}
    </span>
  );
}

/** Explode: raw materials → sub-BOMs → process → finished output (3+ layers). */
function DownFlow({
  data,
  rawNodes,
  subNodes,
  processOps,
  labels,
}: {
  data: GraphData;
  rawNodes: GraphComponentNode[];
  subNodes: GraphComponentNode[];
  processOps: string[];
  labels: GraphTabLabels;
}) {
  if (data.components.length === 0) {
    return (
      <div role="status" className="rounded-lg border bg-white px-6 py-10 text-sm text-muted-foreground">
        {labels.emptyComponents}
      </div>
    );
  }
  return (
    <div className="flex items-stretch gap-6 overflow-x-auto" data-testid="bom-graph-down">
      {/* Layer: raw materials */}
      <div className="flex min-w-[12rem] flex-col gap-1.5" data-testid="bom-graph-layer-raw">
        <ColumnHeader>{labels.layerRaw}</ColumnHeader>
        {rawNodes.map((n) => (
          <GraphNode key={n.id} testid="bom-graph-node-raw" className="border-l-slate-400">
            <span className="font-mono">{n.code}</span>
            <span className="float-right font-mono text-muted-foreground">
              {n.quantity} {n.uom}
            </span>
          </GraphNode>
        ))}
      </div>

      <FlowArrow />

      {/* Layer: sub-BOMs (WIP/FG components) */}
      <div className="flex min-w-[12rem] flex-col justify-center gap-1.5" data-testid="bom-graph-layer-sub">
        <ColumnHeader>{labels.layerSub}</ColumnHeader>
        {subNodes.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          subNodes.map((n) => (
            <GraphNode key={n.id} testid="bom-graph-node-sub" className="border-l-sky-500 bg-sky-50">
              <span className="font-mono">⊞ {n.code}</span>
              <span className="float-right font-mono text-muted-foreground">
                {n.quantity} {n.uom}
              </span>
            </GraphNode>
          ))
        )}
      </div>

      <FlowArrow />

      {/* Layer: process / manufacturing operations */}
      <div className="flex min-w-[12rem] flex-col justify-center gap-1.5" data-testid="bom-graph-layer-process">
        <ColumnHeader>{labels.layerProcess}</ColumnHeader>
        {processOps.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          processOps.map((op) => (
            <GraphNode key={op} testid="bom-graph-node-process" className="border-l-amber-500 bg-amber-50">
              {op}
            </GraphNode>
          ))
        )}
      </div>

      <FlowArrow />

      {/* Layer: finished output (the FG itself) */}
      <div className="flex min-w-[12rem] flex-col justify-center gap-1.5" data-testid="bom-graph-layer-output">
        <ColumnHeader>{labels.layerOutput}</ColumnHeader>
        <GraphNode testid="bom-graph-node-output" className="border-l-green-500 bg-green-50">
          ✓ {data.rootName ?? data.rootCode}
          <div className="font-mono text-[11px] text-muted-foreground">{data.rootCode}</div>
        </GraphNode>
      </div>
    </div>
  );
}

/** Where-used (inverse): parent BOMs that consume this FG → FG. */
function UpFlow({ data, labels }: { data: GraphData; labels: GraphTabLabels }) {
  if (data.parents.length === 0) {
    return (
      <div role="status" className="rounded-lg border bg-white px-6 py-10 text-sm text-muted-foreground">
        {labels.emptyParents}
      </div>
    );
  }
  return (
    <div className="flex items-stretch gap-6 overflow-x-auto" data-testid="bom-graph-up">
      {/* Layer: parent BOMs (where-used) */}
      <div className="flex min-w-[14rem] flex-col gap-1.5" data-testid="bom-graph-layer-parents">
        <ColumnHeader>{labels.layerParents}</ColumnHeader>
        {data.parents.map((p) => (
          <GraphNode key={p.productId} testid="bom-graph-node-parent" className="border-l-sky-500 bg-sky-50">
            <span className="font-mono">{p.productId}</span>
            {p.productName ? (
              <div className="text-[11px] font-normal text-muted-foreground">{p.productName}</div>
            ) : null}
            <span className="text-[11px] text-muted-foreground">
              <Badge variant="info" className="mt-1">
                v{p.version}
              </Badge>{' '}
              · {p.quantity} {p.uom}
            </span>
          </GraphNode>
        ))}
      </div>

      <FlowArrow />

      {/* Layer: the FG itself (the consumed component) */}
      <div className="flex min-w-[12rem] flex-col justify-center gap-1.5" data-testid="bom-graph-layer-output">
        <ColumnHeader>{labels.layerOutput}</ColumnHeader>
        <GraphNode testid="bom-graph-node-output" className="border-l-green-500 bg-green-50">
          ✓ {data.rootName ?? data.rootCode}
          <div className="font-mono text-[11px] text-muted-foreground">{data.rootCode}</div>
        </GraphNode>
      </div>
    </div>
  );
}

function GraphNode({
  children,
  className,
  testid,
}: {
  children: React.ReactNode;
  className?: string;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className={`rounded-md border border-slate-200 border-l-[3px] bg-white px-3 py-2 text-xs leading-tight text-slate-700 ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

export default BomGraphTab;
