/**
 * Viewport-aware geometry for a portaled dropdown panel anchored to a trigger.
 *
 * Every picker/listbox in this app portals itself to <body> and positions with
 * `position: fixed` against the trigger's viewport rect. Seven call sites had
 * copied the same half-measure: the HORIZONTAL axis was clamped to the window,
 * the VERTICAL axis was not — `top: rect.bottom + 4`, no flip, no cap. On a
 * 1280x720 laptop a trigger low on the page pushed the option list below the
 * fold; because the panel is `fixed` AND re-anchors to the trigger on scroll,
 * the user could never bring an option into view and the click had no target.
 *
 * Proven in the database, not on screen: at 1280x720 the ingredient-picker click
 * timed out and `formulation_ingredients` stayed at 0 rows across 11 runs; at
 * 1280x1600 the same click landed in ~50 ms and the row persisted.
 *
 * This is the one place that math lives now — see anchoredPanel.test.ts.
 */

export type AnchoredPanelPosition = {
  left: number;
  /** Panel width, clamped so it cannot exceed the viewport. */
  width: number;
  /** Cap for content-sized panels that set `minWidth` instead of `width`. */
  maxWidth: number;
  /** Set when the panel opens downward; `undefined` when it flips up. */
  top?: number;
  /** Set when the panel flips up — it then grows from the trigger's top edge. */
  bottom?: number;
  /** Space actually free on the chosen side. Pair with `overflow-y: auto`. */
  maxHeight: number;
  placement: 'top' | 'bottom';
};

export type AnchoredPanelOptions = {
  /** Desired panel width; defaults to the anchor's width. */
  width?: number;
  /** Distance between the anchor edge and the panel. */
  gap?: number;
  /** Minimum distance kept from every viewport edge. */
  margin?: number;
  /**
   * Free space below the trigger under which the panel flips up. Set it to the
   * panel's natural height so a panel that fits below never moves.
   */
  minHeight?: number;
};

export function anchoredPanelPosition(
  anchor: { top: number; bottom: number; left: number; width: number },
  options: AnchoredPanelOptions = {},
): AnchoredPanelPosition {
  const gap = options.gap ?? 4;
  const margin = options.margin ?? 12;
  // ponytail: one default for every picker instead of a per-call-site knob.
  // 320px ~= the natural height of these panels (search input + 16rem list +
  // footer), so a panel that would have rendered whole below the trigger keeps
  // its previous position and never gains a scrollbar.
  const minHeight = options.minHeight ?? 320;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const maxWidth = Math.max(0, viewportWidth - margin * 2);
  const width = Math.min(options.width ?? anchor.width, maxWidth);
  const left = Math.max(margin, Math.min(anchor.left, viewportWidth - width - margin));

  const spaceBelow = viewportHeight - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;

  // Flip only when the panel genuinely cannot show below AND there is more room
  // above — the case that already worked keeps byte-identical geometry.
  if (spaceBelow < minHeight && spaceAbove > spaceBelow) {
    return {
      left,
      width,
      maxWidth,
      // Anchoring the BOTTOM edge lets the panel grow upward without measuring
      // its (async, content-dependent) height.
      bottom: viewportHeight - anchor.top + gap,
      maxHeight: Math.max(0, spaceAbove),
      placement: 'top',
    };
  }

  return {
    left,
    width,
    maxWidth,
    top: anchor.bottom + gap,
    maxHeight: Math.max(0, spaceBelow),
    placement: 'bottom',
  };
}
