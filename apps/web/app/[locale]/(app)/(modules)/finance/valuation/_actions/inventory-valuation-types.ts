export type InventoryValuationRow = {
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  qtyOnHand: string;
  wac: string;
  totalValue: string;
  currency: string;
};

export type InventoryValuationGrandTotal = {
  currency: string;
  totalValue: string;
};

export type InventoryValuationUnvalued = {
  /** License plates excluded from valuation (missing cost and/or unconvertible UoM). */
  lpCount: number;
  /** Sum of raw LP quantities in each plate's stored UoM (mixed units — informational only). */
  qty: string;
};

export type InventoryValuation = {
  rows: InventoryValuationRow[];
  grandTotals: InventoryValuationGrandTotal[];
  unvalued: InventoryValuationUnvalued;
};

export type InventoryValuationResult =
  | { ok: true; data: InventoryValuation }
  | { ok: false; reason: 'forbidden' | 'error' };
