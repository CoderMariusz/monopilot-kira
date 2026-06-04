/**
 * @vitest-environment jsdom
 *
 * Parity-evidence emitter (T-033 / T-034 / T-035). Renders each new screen and
 * its UI states and writes a DOM snapshot to _meta/parity-evidence/technical-items-T033-T035/.
 * Not an assertion test — the structural/interaction assertions live in the
 * dedicated *.test.tsx files; this captures the parity-diff artifact required by
 * UI-PROTOTYPE-PARITY-POLICY (DOM snapshot vs the prototype anchor).
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/en/technical/items/RM-1001',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('../../_actions/create-item', () => ({ createItem: vi.fn() }));
vi.mock('../../_actions/update-item', () => ({ updateItem: vi.fn() }));
vi.mock('../../_actions/deactivate-item', () => ({ deactivateItem: vi.fn() }));

import { ItemWizard } from '../item-create-wizard';
import { DeactivateItemModal } from '../deactivate-modal';
import { ItemDetailTabs } from '../../[item_code]/_components/item-detail-tabs';
import { ItemOverviewTab, type ItemOverviewLabels } from '../../[item_code]/_components/item-overview-tab';
import type { ItemDetail } from '../../_actions/get-item';

const OUT = resolve(__dirname, '../../../../../../../../../../_meta/parity-evidence/technical-items-T033-T035');

function snap(name: string, html: string) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${name}.html`), `<!doctype html><meta charset="utf-8">\n${html}\n`);
}

const item: ItemDetail = {
  id: '1',
  itemCode: 'RM-1001',
  name: 'Pork shoulder',
  itemType: 'rm',
  status: 'active',
  description: 'Class II, skinless',
  productGroup: 'Meat',
  uomBase: 'kg',
  uomSecondary: null,
  weightMode: 'catch',
  nominalWeight: '0.25',
  grossWeightMax: '0.3',
  varianceTolerancePct: '5',
  shelfLifeDays: 21,
  shelfLifeMode: 'use_by',
  costPerKg: '12.5',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const overviewLabels: ItemOverviewLabels = {
  identification: 'Identification',
  commercial: 'Commercial & weight',
  code: 'Code',
  name: 'Name',
  type: 'Type',
  status: 'Status',
  uomBase: 'Base UoM',
  uomSecondary: 'Secondary UoM',
  productGroup: 'Product group',
  description: 'Description',
  weightMode: 'Weight mode',
  nominalWeight: 'Nominal weight',
  grossWeightMax: 'Gross weight max',
  varianceTolerance: 'Variance tolerance',
  shelfLife: 'Shelf life',
  costPerKg: 'Cost / kg',
  updated: 'Updated',
  none: '—',
};

afterEach(cleanup);

describe('technical items T-033/T-034/T-035 parity evidence', () => {
  it('T-034 item detail — overview (ready)', () => {
    const { container } = render(
      <ItemDetailTabs
        itemCode="RM-1001"
        panels={{ overview: <ItemOverviewTab item={item} labels={overviewLabels} /> }}
      />,
    );
    snap('T-034-item-detail-overview', container.innerHTML);
  });

  it('T-033 create wizard — basic step', () => {
    const { container } = render(<ItemWizard open onClose={() => {}} mode={{ kind: 'create' }} />);
    snap('T-033-create-wizard-basic', container.innerHTML);
  });

  it('T-035 deactivate modal', () => {
    const { container } = render(
      <DeactivateItemModal
        open
        onClose={() => {}}
        itemId="11111111-1111-1111-1111-111111111111"
        itemCode="RM-1001"
        itemName="Pork shoulder"
      />,
    );
    snap('T-035-deactivate-modal', container.innerHTML);
  });
});
