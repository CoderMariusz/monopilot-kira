import { describe, expect, it } from 'vitest';

import { countByStatusFilter, filterWipDefinitions } from '../filter-wip-definitions';
import type { WipDefinitionListItem } from '../wip-definition-contract';

const SAMPLE: WipDefinitionListItem[] = [
  {
    id: '1',
    name: 'Zebra mix',
    baseUom: 'kg',
    version: 2,
    status: 'active',
    reusable: true,
    itemCode: 'WIP-001',
    processCount: 3,
    referencingProjects: 1,
  },
  {
    id: '2',
    name: 'Alpha base',
    baseUom: 'g',
    version: 1,
    status: 'draft',
    reusable: false,
    processCount: 0,
    referencingProjects: 0,
  },
  {
    id: '3',
    name: 'Retired dough',
    baseUom: 'kg',
    version: 4,
    status: 'archived',
    reusable: false,
    processCount: 2,
    referencingProjects: 0,
  },
];

describe('filterWipDefinitions', () => {
  it('keeps draft rows in the active filter and sorts by name', () => {
    const rows = filterWipDefinitions(SAMPLE, { statusFilter: 'active', query: '' });
    expect(rows.map((r) => r.name)).toEqual(['Alpha base', 'Zebra mix']);
  });

  it('returns only archived rows for the archived filter', () => {
    const rows = filterWipDefinitions(SAMPLE, { statusFilter: 'archived', query: '' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Retired dough');
  });

  it('matches item code and name case-insensitively', () => {
    const rows = filterWipDefinitions(SAMPLE, { statusFilter: 'active', query: 'wip-001' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('1');
  });
});

describe('countByStatusFilter', () => {
  it('counts draft under active and archived separately', () => {
    expect(countByStatusFilter(SAMPLE)).toEqual({ active: 2, archived: 1 });
  });
});
