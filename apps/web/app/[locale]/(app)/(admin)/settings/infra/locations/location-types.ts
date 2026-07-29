import type { UpsertLocationErrorCode } from './location-upsert-errors';

export type Warehouse = { id: string; code: string; name: string };

export type LocationRow = {
  id: string;
  warehouseId: string;
  parentId: string | null;
  code: string;
  name: string;
  level: number;
  path: string;
  locationType?: string | null;
  barcode?: string | null;
  isActive?: boolean;
  warehouseCode?: string | null;
  warehouseName?: string | null;
  siteCode?: string | null;
  siteName?: string | null;
  /**
   * R08-01 — live LPs parked here (page.tsx lp_counts CTE: every status but the terminal four).
   * REQUIRED on purpose. It used to be optional, and the save path rebuilt the row from the
   * dialog input alone — dropping the count silently, so the panel rendered "LPs here: 0" for a
   * location whose stock had not moved. A required field makes that omission a typecheck error
   * instead of a screen that contradicts itself.
   */
  lpCount: number;
};

export type UpsertLocationInput = {
  id?: string;
  warehouseId: string;
  parentId: string | null;
  code: string;
  name: string;
  level: number;
  locationType: string;
  active?: boolean;
  barcode?: string | null;
};

export type UpsertLocationResult =
  // `active` mirrors actions/infra/location.ts: the flag the server actually PERSISTED, which the
  // parent clamp / legacy carve-out can make differ from the requested one. The screen renders
  // this value so it never advertises an activity the row does not have.
  | { ok: true; data: { id: string; path: string; level: number; active: boolean } }
  | { ok: false; error: UpsertLocationErrorCode; lpCount?: number };

export type DeleteLocationInput = { locationId: string; warehouseId: string };

export type DeleteLocationResult =
  | { ok: true; data: { locationId: string; warehouseId: string } }
  | { ok: false; error: string };
