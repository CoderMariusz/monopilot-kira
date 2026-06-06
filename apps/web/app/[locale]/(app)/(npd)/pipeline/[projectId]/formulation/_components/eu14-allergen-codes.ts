/**
 * EU FIC 1169/2011 — 14 mandatory allergen codes.
 *
 * Extracted into a PLAIN (non-'use client') module so Server Components can import
 * the real array. Previously this const lived in allergen-panel.tsx ('use client');
 * importing it into the formulation page (an RSC) made it a client-reference PROXY in
 * the production RSC bundle, so `for (const code of EU14_ALLERGEN_CODES)` threw and
 * crashed the page render (tsc/vitest don't catch this — only `next build`). Same
 * class of bug + fix as project-stages.ts (commit 5126bcdd).
 *
 * Codes match the Reference EU14 seed (identical order/codes to the T-040
 * AllergenCascadeWidget for cross-component parity).
 */
export const EU14_ALLERGEN_CODES = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

export type EU14Code = (typeof EU14_ALLERGEN_CODES)[number];
