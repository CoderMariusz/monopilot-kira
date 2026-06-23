/**
 * WH-003 — server-safe constants shared by the LP detail RSC page and the
 * client island.
 *
 * REGRESSION GUARD (live crash, error digest 1984471676): this module MUST NOT
 * carry a 'use client' directive. When a Server Component imports from a
 * 'use client' module, EVERY export — including plain const arrays — becomes a
 * client-reference proxy in the RSC module graph, so iterating it on the server
 * throws `TypeError: ... LP_DEFERRED_ACTIONS is not iterable` and 500s the page
 * (page.tsx buildLabels()). Keeping the runtime values here (no directive) lets
 * both layers import the real array.
 */

/** Action keys from the prototype's action group (lp-screens.jsx:310-317). */
export const LP_DETAIL_ACTIONS = [
  'split',
  'merge',
  'qa',
  'reserve',
  'move',
  'block',
  'unblock',
  'destroy',
] as const;
export type LpDetailAction = (typeof LP_DETAIL_ACTIONS)[number];

/** Prototype actions still rendered disabled because no backing action exists. */
export const LP_DEFERRED_ACTIONS = [
  'split',
  'merge',
  'destroy',
] as const;
export type LpDeferredAction = (typeof LP_DEFERRED_ACTIONS)[number];
