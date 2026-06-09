'use client';

/**
 * Traceability search (TraceabilityScreen) — client island.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:694-773 (TraceabilityScreen). FSMA-204 / GS1-style trace:
 *   enter an LP, batch, lot or WO to see backward components / forward shipments.
 *   The prototype's backward/forward two-table layout is translated to a grouped,
 *   indented chain list (the cascade chain-timeline pattern at
 *   technical/allergens/cascade) because the reviewed backend
 *   (searchTraceability) returns a nodes+edges graph, not pre-split tables.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Read-only — RLS-scoped (any org user, no permission gate). Search input +
 * direction toggle (backward/forward/both) re-run the Server Action via
 * useTransition; nodes group by kind with edge relations labelled between.
 * Production tables are sparse, so the empty + no-results states must read
 * correctly with 0 nodes. Five UI states: loading / empty / error /
 * permission-denied (shared contract) / ready.
 */

import { useMemo, useState, useTransition } from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

export type TraceDirection = 'backward' | 'forward' | 'both';

export type TraceNodeKind =
  | 'license_plate'
  | 'wo_output'
  | 'wo_consumption'
  | 'work_order'
  | 'bom_line';

export type TraceRelation = 'contains' | 'consumed_by' | 'produced' | 'requires_component';

export type TraceNode = {
  nodeType: TraceNodeKind;
  id: string;
  label: string;
  itemId: string | null;
  itemCode: string | null;
  lotOrBatch: string | null;
  quantity: string | null;
  uom: string | null;
  status: string | null;
  occurredAt: string | null;
};

export type TraceEdge = {
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  relation: TraceRelation;
  quantity: string | null;
  uom: string | null;
};

export type SearchTraceabilityResult =
  | { ok: true; data: { nodes: TraceNode[]; edges: TraceEdge[] } }
  | { ok: false; error: string; message?: string };

export type SearchTraceabilityAction = (input: {
  query: string;
  direction?: TraceDirection;
  limit?: number;
}) => Promise<SearchTraceabilityResult>;

export type TraceabilityLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  search: string;
  directionLabel: string;
  directionBackward: string;
  directionForward: string;
  directionBoth: string;
  hint: string;
  prompt: string;
  promptBody: string;
  noResults: string;
  noResultsBody: string;
  error: string;
  denied: string;
  resultCount: string;
  kind: Record<TraceNodeKind, string>;
  relation: Record<TraceRelation, string>;
  qtyLabel: string;
  lotLabel: string;
  statusLabel: string;
};

// Canonical render order — backward (inputs) → process → forward (outputs).
const KIND_ORDER: TraceNodeKind[] = [
  'license_plate',
  'wo_consumption',
  'work_order',
  'bom_line',
  'wo_output',
];

const KIND_TONE: Record<TraceNodeKind, BadgeVariant> = {
  license_plate: 'info',
  wo_consumption: 'warning',
  work_order: 'secondary',
  bom_line: 'muted',
  wo_output: 'success',
};

export type TraceabilityState = 'prompt' | 'ready' | 'noResults' | 'error' | 'denied';

export type TraceabilityClientProps = {
  labels: TraceabilityLabels;
  searchAction: SearchTraceabilityAction;
};

export function TraceabilityClient({ labels, searchAction }: TraceabilityClientProps) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<TraceDirection>('both');
  const [state, setState] = useState<TraceabilityState>('prompt');
  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [edges, setEdges] = useState<TraceEdge[]>([]);

  function runSearch(dir?: TraceDirection) {
    const q = query.trim();
    if (q === '') {
      setState('prompt');
      return;
    }
    const d = dir ?? direction;
    startTransition(async () => {
      const result = await searchAction({ query: q, direction: d, limit: 50 });
      if (!result.ok) {
        setState('error');
        setNodes([]);
        setEdges([]);
        return;
      }
      setNodes(result.data.nodes);
      setEdges(result.data.edges);
      setState(result.data.nodes.length === 0 ? 'noResults' : 'ready');
    });
  }

  // Outgoing edges keyed by `${fromType}::${fromId}` so each node can show what
  // it links to (the chain "what's next" label).
  const edgesByFrom = useMemo(() => {
    const m = new Map<string, TraceEdge[]>();
    for (const e of edges) {
      const k = `${e.fromType}::${e.fromId}`;
      const arr = m.get(k);
      if (arr) arr.push(e);
      else m.set(k, [e]);
    }
    return m;
  }, [edges]);

  const grouped = useMemo(() => {
    const byKind = new Map<TraceNodeKind, TraceNode[]>();
    for (const n of nodes) {
      const arr = byKind.get(n.nodeType);
      if (arr) arr.push(n);
      else byKind.set(n.nodeType, [n]);
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      items: byKind.get(k) as TraceNode[],
    }));
  }, [nodes]);

  if (state === 'denied') {
    return (
      <div role="alert" data-testid="traceability-denied" className="alert alert-amber">
        <div className="alert-title">{labels.denied}</div>
      </div>
    );
  }

  const DIRECTIONS: { value: TraceDirection; label: string }[] = [
    { value: 'backward', label: labels.directionBackward },
    { value: 'forward', label: labels.directionForward },
    { value: 'both', label: labels.directionBoth },
  ];

  return (
    <div data-testid="traceability-screen" data-state={state} className="flex flex-col gap-4">
      {/* Search bar — query + direction toggle. */}
      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 14,
        }}
        data-testid="traceability-search-bar"
      >
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchLabel}
            data-testid="traceability-query"
            className="mono"
            style={{ flex: 1, minWidth: 240 }}
          />
          <span className="flex items-center gap-1" role="group" aria-label={labels.directionLabel}>
            {DIRECTIONS.map((d) => {
              const active = direction === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  data-testid={`traceability-direction-${d.value}`}
                  aria-pressed={active}
                  onClick={() => {
                    setDirection(d.value);
                    if (query.trim() !== '') runSearch(d.value);
                  }}
                  className={['btn', 'btn-sm', active ? 'btn-secondary' : 'btn-ghost'].join(' ')}
                >
                  {d.label}
                </button>
              );
            })}
          </span>
          <Button
            type="submit"
            className="btn-primary"
            data-testid="traceability-submit"
            disabled={pending || query.trim() === ''}
          >
            {labels.search}
          </Button>
        </form>
        <div className="text-xs text-muted-foreground" style={{ marginTop: 6 }}>
          {labels.hint}
        </div>
      </div>

      {state === 'error' ? (
        <div role="alert" data-testid="traceability-error" className="alert alert-red">
          <div className="alert-title">{labels.error}</div>
        </div>
      ) : null}

      {state === 'prompt' ? (
        <div data-testid="traceability-prompt" className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">⌕</span>
            <p className="empty-state-title">{labels.prompt}</p>
            <p className="empty-state-body">{labels.promptBody}</p>
          </div>
        </div>
      ) : null}

      {state === 'noResults' ? (
        <div data-testid="traceability-no-results" className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">∅</span>
            <p className="empty-state-title">{labels.noResults}</p>
            <p className="empty-state-body">{labels.noResultsBody}</p>
          </div>
        </div>
      ) : null}

      {state === 'ready' ? (
        <div
          className="flex flex-col gap-4"
          data-testid="traceability-results"
          aria-busy={pending ? 'true' : undefined}
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          <div className="text-xs text-muted-foreground" data-testid="traceability-count" aria-live="polite">
            {labels.resultCount.replace('{count}', String(nodes.length))}
          </div>

          {grouped.map((group) => (
            <section
              key={group.kind}
              data-testid={`traceability-group-${group.kind}`}
              style={{
                background: '#fff',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Badge tone={KIND_TONE[group.kind]}>{labels.kind[group.kind]}</Badge>
                <span className="text-xs text-muted-foreground">{group.items.length}</span>
              </div>

              {/* Indented chain list — one node per row with its outgoing edge labels. */}
              <div style={{ position: 'relative', padding: '12px 14px 12px 28px' }}>
                <div
                  style={{ position: 'absolute', left: 16, top: 16, bottom: 16, width: 2, background: 'var(--border)' }}
                  aria-hidden="true"
                />
                {group.items.map((n, i) => {
                  const out = edgesByFrom.get(`${n.nodeType}::${n.id}`) ?? [];
                  return (
                    <div
                      key={`${n.nodeType}-${n.id}-${i}`}
                      data-testid={`traceability-node-${n.nodeType}-${n.id}`}
                      style={{
                        position: 'relative',
                        marginBottom: i < group.items.length - 1 ? 12 : 0,
                        paddingLeft: 14,
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: -8,
                          top: 6,
                          width: 12,
                          height: 12,
                          background: '#fff',
                          border: '2px solid var(--blue)',
                          borderRadius: '50%',
                        }}
                        aria-hidden="true"
                      />
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                          {n.label}
                        </span>
                        {n.itemCode ? (
                          <span className="mono text-xs text-muted-foreground">· {n.itemCode}</span>
                        ) : null}
                        {n.status ? (
                          <Badge tone="muted" style={{ fontSize: 10 }}>
                            {labels.statusLabel}: {n.status}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground" style={{ marginTop: 2 }}>
                        {n.lotOrBatch ? (
                          <span>
                            {labels.lotLabel}: <span className="mono">{n.lotOrBatch}</span>{' '}
                          </span>
                        ) : null}
                        {n.quantity ? (
                          <span>
                            {labels.qtyLabel}: <span className="mono">{n.quantity}{n.uom ? ` ${n.uom}` : ''}</span>
                          </span>
                        ) : null}
                      </div>
                      {out.length > 0 ? (
                        <div
                          className="flex flex-wrap gap-1.5"
                          style={{ marginTop: 4 }}
                          data-testid={`traceability-edges-${n.nodeType}-${n.id}`}
                        >
                          {out.map((e, j) => (
                            <Badge
                              key={`${e.toType}-${e.toId}-${j}`}
                              tone="outline"
                              style={{ fontSize: 10 }}
                            >
                              → {labels.relation[e.relation]} · {labels.kind[e.toType as TraceNodeKind] ?? e.toType}
                              {e.quantity ? ` (${e.quantity}${e.uom ? ` ${e.uom}` : ''})` : ''}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
