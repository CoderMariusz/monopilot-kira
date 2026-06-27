'use client';

/**
 * WH-018 — Locations hierarchy (client island).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/warehouse/
 *   other-screens.jsx:156-279 (WhLocations, data-prototype-label:
 *   locations_hierarchy_page):
 *     ltree-backed location tree (warehouse → zone → bin), per-node code mono +
 *       name + type chip + level + LP count               → other-screens.jsx:178-194
 *     search filters the tree                              → (filter-bar pattern)
 *     "Add location" / inline edit modal (Admin)           → other-screens.jsx:173,206
 *
 * Presentational only: receives already-loaded, org-scoped location rows (from
 * listLocations) + a derived LP-count map + resolved labels, and owns ONLY the
 * search state. No data fetching, no permission logic, no write actions.
 *
 * DEVIATIONS (red-lines, honest):
 *   - The prototype renders a true ltree depth (warehouse → zone → bin) with a
 *     selected-node detail card, bin-occupancy mini-grid and an "LPs at this
 *     location" table (other-screens.jsx:196-274). The consumed read
 *     (warehouse/_actions/location-read-actions.ts listLocations) returns ONLY
 *     the leaf code/name + warehouse — it does NOT expose parent_id / level /
 *     path — so the deeper zone→bin nesting and the detail/occupancy panes are
 *     DEFERRED. We render the honest two-level tree the read supports: warehouse
 *     group → its locations (code-sorted). Re-nesting requires the path column to
 *     be added to listLocations, which is owned by the T2 action lane.
 *   - Inline add/edit/deactivate (other-screens.jsx:173,206) is DEFERRED: location
 *     CRUD lives in Settings → Infrastructure. The "Manage locations →" link is the
 *     honest path. We never render a write control this screen cannot back.
 *   - LP counts are DERIVED client-side from the passed LP list (capped — see the
 *     cap note) because listLocations carries no count; honest undercount is noted.
 *   - The prototype's per-node type chip (storage/transit/receiving/…,
 *     other-screens.jsx:181,204) is OMITTED: listLocations does NOT return
 *     location_type, so there is no honest value to render. (The type/level keys
 *     stay in the staged bundle for when the read is widened by the action lane.)
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Card } from '@monopilot/ui/Card';

import type { LocationOption } from '../../_actions/location-read-actions';

export type LocationsTreeLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  empty: string;
  emptyFiltered: string;
  manageLink: string;
  manageHint: string;
  rowsLabel: string;
  lpCountLabel: string;
  lpCountLabelPlural: string;
  lpCountCapNote: string;
  warehouseUnassigned: string;
  siteUnassigned: string;
  levelLabel: string;
  deferredNote: string;
};

export type LocationsTreeProps = {
  locations: LocationOption[];
  /** Map of location code → LP count, derived from the page's capped listLPs read. */
  lpCountByCode: Record<string, number>;
  /** Honest cap that produced lpCountByCode (e.g. 500), surfaced in the note. */
  lpCountCap: number;
  labels: LocationsTreeLabels;
  manageHref: string;
};

type WarehouseGroup = {
  warehouseId: string;
  warehouseCode: string | null;
  warehouseName: string | null;
  siteCode: string | null;
  siteName: string | null;
  locations: LocationOption[];
};

function groupByWarehouse(locations: LocationOption[]): WarehouseGroup[] {
  const byWh = new Map<string, WarehouseGroup>();
  for (const loc of locations) {
    const key = loc.warehouseId || '__none__';
    let group = byWh.get(key);
    if (!group) {
      group = {
        warehouseId: loc.warehouseId,
        warehouseCode: loc.warehouseCode,
        warehouseName: loc.warehouseName,
        siteCode: loc.siteCode,
        siteName: loc.siteName,
        locations: [],
      };
      byWh.set(key, group);
    }
    group.locations.push(loc);
  }
  const groups = Array.from(byWh.values());
  for (const g of groups) {
    g.locations.sort((a, b) => a.code.localeCompare(b.code));
  }
  groups.sort((a, b) => (a.warehouseCode ?? '').localeCompare(b.warehouseCode ?? ''));
  return groups;
}

export function LocationsTreeClient({
  locations,
  lpCountByCode,
  lpCountCap,
  labels,
  manageHref,
}: LocationsTreeProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === '') return locations;
    return locations.filter(
      (l) =>
        l.code.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        (l.warehouseCode ?? '').toLowerCase().includes(q) ||
        (l.warehouseName ?? '').toLowerCase().includes(q),
    );
  }, [locations, search]);

  const groups = useMemo(() => groupByWarehouse(filtered), [filtered]);

  function lpCountLabel(count: number): string {
    const tpl = count === 1 ? labels.lpCountLabel : labels.lpCountLabelPlural;
    return tpl.replace('{count}', String(count));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar + manage link (parity other-screens.jsx:173 — but edits are deferred to settings). */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="locations-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />
        <span className="text-xs text-slate-500" data-testid="locations-rows">
          {labels.rowsLabel.replace('{count}', String(filtered.length))}
        </span>
        <Link
          href={manageHref}
          data-testid="locations-manage-link"
          title={labels.manageHint}
          className="ml-auto rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {labels.manageLink}
        </Link>
      </Card>

      {/* Honest cap note for derived LP counts (deviation). */}
      <p data-testid="locations-cap-note" className="text-[11px] text-slate-400">
        {labels.lpCountCapNote.replace('{cap}', String(lpCountCap))}
      </p>

      {locations.length === 0 ? (
        <Card
          data-testid="locations-empty"
          data-state="empty"
          className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500"
        >
          {labels.empty}
        </Card>
      ) : filtered.length === 0 ? (
        <Card
          data-testid="locations-empty-filtered"
          className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500"
        >
          {labels.emptyFiltered}
        </Card>
      ) : (
        <div data-testid="locations-tree" role="tree" aria-label={labels.searchLabel} className="flex flex-col gap-4">
          {groups.map((group) => (
            <Card
              key={group.warehouseId || '__none__'}
              data-testid={`locations-wh-${group.warehouseId || 'none'}`}
              role="treeitem"
              aria-expanded="true"
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              {/* Warehouse root node (parity level-0 node, other-screens.jsx:188 weight 700). */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                <span className="font-mono text-xs font-bold text-slate-900">
                  {group.warehouseCode ?? labels.warehouseUnassigned}
                </span>
                {group.warehouseName ? (
                  <span className="text-xs text-slate-500">{group.warehouseName}</span>
                ) : null}
                <span
                  className="rounded-full border border-slate-200 px-1.5 text-[11px] text-slate-500"
                  data-testid={`locations-site-${group.warehouseId || 'none'}`}
                >
                  {group.siteCode
                    ? group.siteName && group.siteName !== group.siteCode
                      ? `${group.siteCode} — ${group.siteName}`
                      : group.siteCode
                    : labels.siteUnassigned}
                </span>
                <span className="ml-auto rounded-full bg-slate-200 px-1.5 text-[11px] tabular-nums text-slate-600">
                  {group.locations.length}
                </span>
              </div>

              {/* Child location nodes (parity per-node row, other-screens.jsx:183-191). */}
              <ul role="group" className="divide-y divide-slate-50">
                {group.locations.map((loc) => {
                  const count = lpCountByCode[loc.code] ?? 0;
                  return (
                    <li
                      key={loc.id}
                      role="treeitem"
                      data-testid={`locations-node-${loc.id}`}
                      className="flex items-center gap-3 px-4 py-2 pl-8"
                    >
                      <span className="font-mono text-[11px] font-medium text-slate-800" data-testid={`locations-code-${loc.id}`}>
                        {loc.code}
                      </span>
                      <span className="text-[11px] text-slate-500">{loc.name}</span>
                      <span className="rounded-full border border-slate-200 px-1.5 font-mono text-[11px] text-slate-500" data-testid={`locations-warehouse-${loc.id}`}>
                        {loc.warehouseCode ?? loc.warehouseName ?? labels.warehouseUnassigned}
                      </span>
                      <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600" data-testid={`locations-count-${loc.id}`}>
                        {lpCountLabel(count)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {/* Honest red-line: inline edits deferred to settings. */}
      <p data-testid="locations-deferred-note" className="text-[11px] text-slate-400">
        {labels.deferredNote}
      </p>
    </div>
  );
}
