export type ProductTempRange = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  minTempC: number;
  maxTempC: number;
  requiresCheck: boolean;
};

export type ListProductTempRangesResult =
  | { ok: true; ranges: ProductTempRange[] }
  | { ok: false; error: 'forbidden' | 'load_failed' };

export type UpsertProductTempRangeInput = {
  itemId: string;
  minTempC: number;
  maxTempC: number;
  requiresCheck: boolean;
};

export type UpsertProductTempRangeResult =
  | { ok: true; id: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type SubmitConditionCheckInput = {
  grnItemId?: string | null;
  lpId?: string | null;
  itemId: string;
  measuredTempC: number;
};

export type SubmitConditionCheckResult =
  | {
      ok: true;
      inRange: boolean;
      holdId?: string | null;
      holdNumber?: string | null;
    }
  | {
      ok: false;
      error: 'forbidden' | 'invalid_input' | 'no_range_configured' | 'persistence_failed';
    };

export type DeliveryConditionCheck = {
  id: string;
  orgId: string;
  siteId: string | null;
  grnItemId: string | null;
  lpId: string | null;
  itemId: string;
  measuredTempC: number;
  minTempC: number | null;
  maxTempC: number | null;
  inRange: boolean;
  reason: string | null;
  holdId: string | null;
  checkedBy: string;
  checkedAt: string;
};
