'use client';

/**
 * WH-014 — Lot genealogy & traceability (client island).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/warehouse/
 *   other-screens.jsx:280-374 (WhGenealogy, data-prototype-label:
 *   genealogy_traceability_page):
 *     LP search box                                        → other-screens.jsx:302
 *     empty prompt (forward/backward explainer)            → other-screens.jsx:316-325
 *     trace canvas: chain of gen-nodes, depth + op tag,
 *       focal LP highlighted as the root                   → other-screens.jsx:346-361
 *
 * This island owns ONLY the search box (client-side filter of the page-preloaded,
 * org-scoped LP list) + the pick→navigate interaction; it pushes ?lp=<id> to the
 * URL so the RSC page re-runs traceGenealogy server-side (no client-trusted data,
 * no client data fetch). The rendered trace (ancestors → focal → descendants) is
 * passed down already computed.
 *
 * DEVIATIONS (red-lines, honest):
 *   - The prototype's Forward/Backward/Full-trace pills + depth slider + FSMA-204
 *     export + scan button (other-screens.jsx:296-313,363-369) are DEFERRED:
 *     traceGenealogy returns BOTH directions cycle-safe in one call (ancestors +
 *     self + descendants), so we render the full bidirectional trace and label the
 *     directions instead of toggling. Export/scan have no backing action.
 *   - The summary bar's batch / query-time / FEFO-compliance fields
 *     (other-screens.jsx:329-344) are OMITTED: traceGenealogy nodes carry
 *     lpNumber/itemCode/qty/status/createdAt only — no batch, timing or FEFO data
 *     is exposed, so nothing is fabricated.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';

import type { GenealogyNode } from '../../_actions/shared';
import type { LicensePlateListItem } from '../../_actions/shared';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  reserved: 'info',
  allocated: 'info',
  received: 'muted',
  quarantine: 'warning',
  consumed: 'secondary',
  blocked: 'danger',
  // mig 294 — terminal state for pallets voided by an output correction (Wave R2).
  destroyed: 'danger',
};

export type GenealogyLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  noResults: string;
  prompt: string;
  promptHint: string;
  emptyTrace: string;
  ancestorsLabel: string;
  focalLabel: string;
  descendantsLabel: string;
  depthLabel: string;
  capNote: string;
  nodesFound: string;
  nodesFoundPlural: string;
  openLp: string;
  status: Record<string, string>;
};

export type GenealogyTreeProps = {
  /** Page-preloaded, org-scoped LP list for the search box (capped — listLPs). */
  searchPool: LicensePlateListItem[];
  /** The selected LP id (from ?lp=) — null until one is picked. */
  selectedLpId: string | null;
  /** Pre-computed trace for selectedLpId (ancestors → self → descendants). */
  nodes: GenealogyNode[] | null;
  labels: GenealogyLabels;
  locale: string;
  basePath: string;
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'muted'} className="text-[10px]">
      {label}
    </Badge>
  );
}

function GenNode({
  node,
  locale,
  labels,
  highlighted,
}: {
  node: GenealogyNode;
  locale: string;
  labels: GenealogyLabels;
  highlighted: boolean;
}) {
  return (
    <li
      data-testid={`gen-node-${node.lpId}`}
      data-direction={node.direction}
      className={[
        'flex items-center gap-3 rounded-lg border px-4 py-2.5',
        highlighted
          ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-300'
          : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/${locale}/warehouse/license-plates/${node.lpId}`}
          data-testid={`gen-lp-link-${node.lpId}`}
          className="font-mono text-sm font-semibold text-sky-700 hover:underline"
        >
          {node.lpNumber}
        </Link>
        <span className="text-[11px] text-slate-500">
          {node.itemCode ?? ''}
          {node.itemCode ? ' · ' : ''}
          {labels.depthLabel.replace('{depth}', String(node.depth))}
        </span>
      </div>
      <span className="ml-auto font-mono text-xs tabular-nums text-slate-600">
        {node.quantity} {node.uom}
      </span>
      <StatusBadge status={node.status} label={labels.status[node.status] ?? node.status} />
    </li>
  );
}

export function GenealogyTreeClient({
  searchPool,
  selectedLpId,
  nodes,
  labels,
  locale,
  basePath,
}: GenealogyTreeProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return [];
    return searchPool
      .filter(
        (lp) =>
          lp.lpNumber.toLowerCase().includes(q) ||
          (lp.batchNumber ?? '').toLowerCase().includes(q) ||
          (lp.itemCode ?? '').toLowerCase().includes(q) ||
          (lp.itemName ?? '').toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [searchPool, search]);

  function pick(lpId: string) {
    router.push(`${basePath}?lp=${encodeURIComponent(lpId)}`);
  }

  const ancestors = nodes?.filter((n) => n.direction === 'ancestor') ?? [];
  const focal = nodes?.find((n) => n.direction === 'self') ?? null;
  const descendants = nodes?.filter((n) => n.direction === 'descendant') ?? [];
  const total = nodes?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Search box (parity other-screens.jsx:302). */}
      <Card className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="gen-search"
          className="w-full max-w-md rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        {search.trim() !== '' ? (
          matches.length === 0 ? (
            <p data-testid="gen-search-empty" className="px-1 text-xs text-slate-500">
              {labels.noResults}
            </p>
          ) : (
            <ul data-testid="gen-search-results" className="flex flex-col gap-1">
              {matches.map((lp) => (
                <li key={lp.id}>
                  <button
                    type="button"
                    data-testid={`gen-search-result-${lp.id}`}
                    onClick={() => pick(lp.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-mono font-semibold text-sky-700">{lp.lpNumber}</span>
                    <span className="truncate text-xs text-slate-500">
                      {lp.itemCode ?? ''} {lp.itemName ?? ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>

      {/* Prompt — nothing selected yet (parity other-screens.jsx:316-325). */}
      {!selectedLpId ? (
        <Card
          data-testid="gen-prompt"
          data-state="empty"
          className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"
        >
          <p className="text-sm font-medium text-slate-700">{labels.prompt}</p>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-slate-500">{labels.promptHint}</p>
        </Card>
      ) : total <= 1 && focal && ancestors.length === 0 && descendants.length === 0 ? (
        // Selected, traced, but no links yet (only the focal node).
        <>
          <ul data-testid="gen-focal-only" className="flex flex-col gap-2">
            <GenNode node={focal} locale={locale} labels={labels} highlighted />
          </ul>
          <Card
            data-testid="gen-empty-trace"
            className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500"
          >
            {labels.emptyTrace}
          </Card>
        </>
      ) : nodes ? (
        <div data-testid="gen-canvas" className="flex flex-col gap-3">
          <p data-testid="gen-nodes-found" className="text-xs text-slate-500">
            {(total === 1 ? labels.nodesFound : labels.nodesFoundPlural).replace('{count}', String(total))}
            {' · '}
            {labels.capNote}
          </p>

          {/* Ancestors above (parity: upstream chain). */}
          {ancestors.length > 0 ? (
            <section data-testid="gen-ancestors">
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {labels.ancestorsLabel}
              </h2>
              <ul className="flex flex-col gap-2">
                {ancestors.map((n) => (
                  <GenNode key={`a-${n.lpId}`} node={n} locale={locale} labels={labels} highlighted={false} />
                ))}
              </ul>
            </section>
          ) : null}

          {/* Focal LP highlighted (parity root node, other-screens.jsx:348). */}
          {focal ? (
            <section data-testid="gen-focal">
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-sky-500">
                {labels.focalLabel}
              </h2>
              <ul className="flex flex-col gap-2">
                <GenNode node={focal} locale={locale} labels={labels} highlighted />
              </ul>
            </section>
          ) : null}

          {/* Descendants below (parity: downstream chain). */}
          {descendants.length > 0 ? (
            <section data-testid="gen-descendants">
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {labels.descendantsLabel}
              </h2>
              <ul className="flex flex-col gap-2">
                {descendants.map((n) => (
                  <GenNode key={`d-${n.lpId}`} node={n} locale={locale} labels={labels} highlighted={false} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
