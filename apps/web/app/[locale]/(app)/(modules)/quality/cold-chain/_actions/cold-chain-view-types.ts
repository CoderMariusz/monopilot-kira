/**
 * Cold-chain viewer (gaps #9) — DTO contracts for the read-only landing.
 *
 * These are the UI-facing shapes (no `*_id` columns) returned by
 * listColdChainOverview. Kept in a NON-'use server' module so the client
 * island and its RTL test can import the types without importing the server
 * action (a 'use server' file only exports async functions).
 */

export type ColdChainTempRange = {
  id: string;
  itemCode: string;
  itemName: string;
  siteName: string | null;
  minTempC: number | null;
  maxTempC: number | null;
  requiresCheck: boolean;
};

export type ColdChainConditionCheck = {
  id: string;
  itemCode: string;
  itemName: string;
  siteName: string | null;
  measuredTempC: number | null;
  minTempC: number | null;
  maxTempC: number | null;
  inRange: boolean;
  reason: string | null;
  hasHold: boolean;
  /** ISO timestamp (checked_at). */
  checkedAt: string;
};

export type ColdChainListResult =
  | { ok: true; ranges: ColdChainTempRange[]; checks: ColdChainConditionCheck[] }
  | { ok: false; error: 'forbidden' | 'load_failed' };
