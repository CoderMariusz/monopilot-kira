import { describe, expect, it } from 'vitest';

import { anchoredPanelPosition } from '../anchoredPanel';

/** Trigger rect helper — a 200x32 control whose bottom edge sits at `bottom`. */
const trigger = (bottom: number, left = 100) => ({
  top: bottom - 32,
  bottom,
  left,
  width: 200,
});

function viewport(width: number, height: number) {
  window.innerWidth = width;
  window.innerHeight = height;
}

describe('anchoredPanelPosition', () => {
  it('keeps the previous drop-down geometry when the panel fits below', () => {
    viewport(1280, 1600);
    const pos = anchoredPanelPosition(trigger(900), { width: 420 });
    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(904); // rect.bottom + gap — unchanged from before the fix
    expect(pos.bottom).toBeUndefined();
    expect(pos.left).toBe(100);
    // Enough headroom that the panel never gains a scrollbar it did not have.
    expect(pos.maxHeight).toBeGreaterThan(320);
  });

  it('flips above the trigger when the panel would fall below the fold', () => {
    // The regression: 1280x720 with the trigger low on the page.
    viewport(1280, 720);
    const pos = anchoredPanelPosition(trigger(680), { width: 420 });
    expect(pos.placement).toBe('top');
    expect(pos.top).toBeUndefined();
    // Bottom edge sits gap px above the trigger's top edge (648) → 656 from the
    // viewport bottom, i.e. y=64. The whole panel is on screen and clickable.
    expect(pos.bottom).toBe(720 - 648 + 4);
    expect(720 - pos.bottom! - pos.maxHeight).toBeGreaterThanOrEqual(12);
  });

  it('never lets the panel run past either viewport edge', () => {
    viewport(400, 500);
    const pos = anchoredPanelPosition(trigger(470, 380), { width: 420 });
    expect(pos.left).toBeGreaterThanOrEqual(12);
    expect(pos.left + pos.width).toBeLessThanOrEqual(400 - 12);
    expect(pos.maxWidth).toBe(400 - 24);
    const top = pos.placement === 'top' ? 500 - pos.bottom! - pos.maxHeight : pos.top!;
    expect(top).toBeGreaterThanOrEqual(12);
    expect(top + pos.maxHeight).toBeLessThanOrEqual(500 - 12);
  });

  it('stays below when there is no more room above (trigger at the very top)', () => {
    viewport(1280, 720);
    const pos = anchoredPanelPosition(trigger(40), { width: 420 });
    expect(pos.placement).toBe('bottom');
    expect(pos.top).toBe(44);
  });
});
