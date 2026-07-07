export type CustomerPriceRow = {
  id: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  /** NUMERIC(12,4) — decimal string end-to-end (never a JS float). */
  unitPrice: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type CustomerPriceOption = {
  id: string;
  code: string;
  name: string;
};

export type CustomerPriceFormOptions = {
  customers: CustomerPriceOption[];
  items: CustomerPriceOption[];
};

export type CustomerPriceMutationResult =
  | { ok: true; id: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'not_found' | 'persistence_failed' | 'conflict' };

export type ListCustomerItemPricesResult =
  | { ok: true; prices: CustomerPriceRow[] }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

export type LoadCustomerPriceFormOptionsResult =
  | { ok: true; options: CustomerPriceFormOptions }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };
