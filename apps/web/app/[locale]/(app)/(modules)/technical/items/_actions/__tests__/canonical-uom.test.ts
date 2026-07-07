import { describe, expect, it } from 'vitest';

import { CANONICAL_UOMS, CreateItemInput } from '../shared';

describe('CANONICAL_UOMS / CreateItemInput uom_base', () => {
  it('accepts pcs and rejects legacy szt', () => {
    expect(CANONICAL_UOMS).toContain('pcs');
    expect(CANONICAL_UOMS).not.toContain('szt');

    const ok = CreateItemInput.safeParse({
      itemCode: 'PKG-1',
      name: 'Tray',
      itemType: 'packaging',
      uomBase: 'pcs',
    });
    expect(ok.success).toBe(true);

    const legacy = CreateItemInput.safeParse({
      itemCode: 'PKG-2',
      name: 'Tray',
      itemType: 'packaging',
      uomBase: 'szt',
    });
    expect(legacy.success).toBe(false);
  });

  it('rejects legacy ea as uom_base', () => {
    const legacy = CreateItemInput.safeParse({
      itemCode: 'PKG-3',
      name: 'Tray',
      itemType: 'packaging',
      uomBase: 'ea',
    });
    expect(legacy.success).toBe(false);
  });
});
