import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(fileURLToPath(new URL('../inventory-browser.client.tsx', import.meta.url)), 'utf8');

describe('InventoryBrowserClient source contract', () => {
  it('renders total on-hand as the primary quantity and pickable as the secondary figure', () => {
    expect(SOURCE).toContain('formatQty(r.totalQty, r.uom)');
    expect(SOURCE).toContain('formatQty(r.pickableQty, r.uom)');
    expect(SOURCE).toContain('r.totalQty');
    expect(SOURCE).toContain('r.pickableQty');
    expect(SOURCE).toContain('labels.pickable');
  });

  it('does not keep the old available columns on the three pivot tables', () => {
    expect(SOURCE).not.toContain('labels.product.available');
    expect(SOURCE).not.toContain('labels.location.available');
    expect(SOURCE).not.toContain('labels.batch.available');
  });
});
