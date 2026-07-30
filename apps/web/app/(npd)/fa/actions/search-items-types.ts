export type ItemPickerOption = {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  status: string;
  /** Misleading legacy name — amount is whatever v_item_effective_cost resolves (GBP on prod). */
  costPerKgEur: string | null;
  /** ISO-4217 from v_item_effective_cost.currency; null when cost is unknown. */
  costCurrency?: string | null;
  listPriceGbp?: string | null;
  supplierCode?: string | null;
  unitPrice?: string | null;
  uomBase: string;
  uomSecondary?: string | null;
  outputUom?: 'base' | 'each' | 'box' | null;
};

export type SearchItemsInput = {
  query?: string;
  itemTypes?: Array<'fg' | 'rm' | 'ingredient' | 'intermediate' | 'co_product' | 'byproduct' | 'packaging'>;
  limit?: number;
  supplierCode?: string;
  supplierId?: string;
};
