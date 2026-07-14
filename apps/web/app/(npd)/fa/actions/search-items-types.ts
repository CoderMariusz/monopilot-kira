export type ItemPickerOption = {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  status: string;
  costPerKgEur: string | null;
  listPriceGbp?: string | null;
  supplierCode?: string | null;
  unitPrice?: string | null;
  uomBase: string;
};

export type SearchItemsInput = {
  query?: string;
  itemTypes?: Array<'fg' | 'rm' | 'ingredient' | 'intermediate' | 'co_product' | 'byproduct' | 'packaging'>;
  limit?: number;
  supplierCode?: string;
  supplierId?: string;
};
