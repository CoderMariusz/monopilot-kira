/**
 * Pure list filtering/sorting for the WIP library table (L10 vitest target).
 */

import type { WipDefinitionListItem, WipStatus } from './wip-definition-contract';

export type WipListStatusFilter = 'active' | 'archived';

export function filterWipDefinitions(
  definitions: WipDefinitionListItem[],
  opts: { statusFilter: WipListStatusFilter; query: string },
): WipDefinitionListItem[] {
  const q = opts.query.trim().toLowerCase();
  return definitions
    .filter((row) => matchesStatusFilter(row.status, opts.statusFilter))
    .filter((row) => {
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.itemCode ?? '').toLowerCase().includes(q) ||
        row.baseUom.toLowerCase().includes(q)
      );
    })
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function matchesStatusFilter(status: WipStatus, filter: WipListStatusFilter): boolean {
  if (filter === 'active') return status === 'active' || status === 'draft';
  return status === 'archived';
}

export function countByStatusFilter(
  definitions: WipDefinitionListItem[],
): Record<WipListStatusFilter, number> {
  return {
    active: definitions.filter((d) => matchesStatusFilter(d.status, 'active')).length,
    archived: definitions.filter((d) => matchesStatusFilter(d.status, 'archived')).length,
  };
}
