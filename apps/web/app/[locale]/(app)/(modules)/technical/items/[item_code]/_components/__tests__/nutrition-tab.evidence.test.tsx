/**
 * @vitest-environment jsdom
 *
 * TAXONOMY lane — parity evidence capture for the Nutrition tab.
 * Dumps the rendered DOM for each mode/state to _meta/parity-evidence/
 * taxonomy-nutrition/*.html (structural/visual/interaction parity artifacts).
 *
 * Spec-driven (prototype_match:false): nearest reusable patterns are the
 * allergens-tab edit shell (modals.jsx:309-347) and the read-only NutritionScreen
 * (other-screens.jsx:480-535). See the lane deviation log.
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { vi } from 'vitest';

import { NutritionTab } from '../nutrition-tab.client';
import { DEFAULT_NUTRITION_LABELS as L } from '../nutrition-labels';

const OUT = join(__dirname, '../../../../../../../../../../../_meta/parity-evidence/taxonomy-nutrition');

function dump(name: string, html: string) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), `<!doctype html><html><body>${html}</body></html>`, 'utf8');
}

afterEach(cleanup);

describe('Nutrition tab — parity evidence', () => {
  it('captures edit / readonly / na / states', () => {
    const edit = render(
      <NutritionTab mode="edit" state="ready" itemCode="RM-1" canEdit labels={L} editData={null} saveAction={vi.fn()} />,
    );
    dump('edit-empty-optimistic.html', edit.container.innerHTML);
    cleanup();

    const ro = render(
      <NutritionTab
        mode="readonly"
        state="ready"
        itemCode="FG-1"
        canEdit={false}
        labels={L}
        readonlyData={{
          productName: 'Sausage',
          computedAt: '2026-06-01T00:00:00Z',
          macros: [{ nutrientCode: 'energy_kj', displayName: 'Energy', unit: 'kJ', per100g: '1500', perPortion: '750' }],
          allergens: [{ code: 'A07', name: 'Milk', presence: 'contains' }],
        }}
      />,
    );
    dump('readonly-fg.html', ro.container.innerHTML);
    cleanup();

    dump('na.html', render(<NutritionTab mode="na" state="empty" itemCode="PM-1" canEdit={false} labels={L} />).container.innerHTML);
    cleanup();
    dump('loading.html', render(<NutritionTab mode="edit" state="loading" itemCode="RM-1" canEdit labels={L} />).container.innerHTML);
    cleanup();
    dump('error.html', render(<NutritionTab mode="edit" state="error" itemCode="RM-1" canEdit labels={L} />).container.innerHTML);
    cleanup();
    dump('permission-denied.html', render(<NutritionTab mode="edit" state="permission_denied" itemCode="RM-1" canEdit={false} labels={L} />).container.innerHTML);
  });
});
