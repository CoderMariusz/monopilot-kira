export type PoSupplierOption = {
  id: string;
  code: string;
  name: string;
  currency: string;
};

export type ItemSupplierPrice = {
  unitPrice: string | null;
  currency: string | null;
  source: 'spec' | 'list_price' | 'none';
};
