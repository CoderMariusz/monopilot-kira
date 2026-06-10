/**
 * @vitest-environment jsdom
 *
 * TAXONOMY lane — parity evidence for the Materials list 4th Packaging type tab.
 * Anchor: prototypes/design/Monopilot Design System/technical/other-screens.jsx:304-352
 * (MaterialsListScreen — pills incl. Packaging, typeTag.packaging = badge-amber).
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it } from 'vitest';

import { MaterialsTableClient, type MaterialsTableLabels } from '../materials-table.client';
import type { ItemListItem } from '../../../items/_actions/shared';

const OUT = join(__dirname, '../../../../../../../../../../_meta/parity-evidence/taxonomy-materials');
function dump(name: string, html: string) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), `<!doctype html><html><body>${html}</body></html>`, 'utf8');
}

const labels: MaterialsTableLabels = {
  tabAll: 'All', searchPlaceholder: 'Search…', searchAria: 'Search materials',
  colCode: 'Code', colName: 'Name', colType: 'Type', colUom: 'UoM', colCost: 'Cost / base UoM (zł)',
  colUpdated: 'Updated', colStatus: 'Status',
  noMatchTitle: 'No materials match your filters', noMatchBody: 'Adjust filters.',
  countSummary: '{shown} of {total} materials',
  typeLabels: { rm: 'Raw material', intermediate: 'Intermediate', packaging: 'Packaging' },
  statusLabels: { draft: 'Draft', active: 'Active', deprecated: 'Deprecated', blocked: 'Blocked' },
};
const typeTabs: Array<{ key: 'all' | ItemListItem['itemType']; label: string }> = [
  { key: 'all', label: 'All' }, { key: 'rm', label: 'Raw materials' },
  { key: 'intermediate', label: 'Intermediates' }, { key: 'packaging', label: 'Packaging' },
];
const items: ItemListItem[] = [
  { id: '1', itemCode: 'RM-1001', name: 'Pork shoulder', itemType: 'rm', status: 'active', uomBase: 'kg', weightMode: 'fixed', costPerKg: '12.5', updatedAt: '2026-06-01T00:00:00Z', allergens: [], bomCount: 0, d365SyncStatus: null },
  { id: '3', itemCode: 'PM-2001', name: 'Vacuum pouch', itemType: 'packaging', status: 'active', uomBase: 'ea', weightMode: 'fixed', costPerKg: '0.08', updatedAt: '2026-06-02T00:00:00Z', allergens: [], bomCount: 0, d365SyncStatus: null },
];

afterEach(cleanup);

describe('Materials packaging tab — parity evidence', () => {
  it('captures the all view and the packaging-filtered view', async () => {
    const user = userEvent.setup();
    const { container } = render(<MaterialsTableClient items={items} typeTabs={typeTabs} labels={labels} />);
    dump('all-with-packaging-row.html', container.innerHTML);
    await user.click(screen.getByRole('tab', { name: /Packaging/ }));
    dump('packaging-filtered.html', container.innerHTML);
  });
});
