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
  lpCount?: number;
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
  | { ok: true; data: { id: string; path: string; level: number } }
  | { ok: false; error: UpsertLocationErrorCode };

export type DeleteLocationInput = { locationId: string; warehouseId: string };

export type DeleteLocationResult =
  | { ok: true; data: { locationId: string; warehouseId: string } }
  | { ok: false; error: string };
