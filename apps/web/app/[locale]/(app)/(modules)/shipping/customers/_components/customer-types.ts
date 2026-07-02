/**
 * Wave-shipping — client-side type mirrors of the reviewed customer actions.
 */

export type CustomerCategory = 'retail' | 'wholesale' | 'distributor';
export type CustomerAddressType = 'billing' | 'shipping';

export type CustomerError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'already_exists'
  | 'address_in_use'
  | 'persistence_failed';

export type Customer = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  category: CustomerCategory;
  creditLimitGbp: string | null;
  isActive: boolean;
  addressCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomerAddress = {
  id: string;
  customerId: string;
  addressType: CustomerAddressType;
  isDefault: boolean;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  countryIso2: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDetail = Customer & {
  addresses: CustomerAddress[];
};

export type CustomerResult<T> =
  | ({ ok: true; data: T } & (T extends Customer ? { id: string } : object))
  | { ok: false; error: CustomerError; message?: string };

export type ListCustomersResult = CustomerResult<Customer[]>;
export type CreateCustomerResult = CustomerResult<Customer>;
export type GetCustomerResult = CustomerResult<CustomerDetail>;
export type UpdateCustomerResult = CustomerResult<Customer>;
export type AddressResult = CustomerResult<CustomerAddress>;

export type CreateCustomerInput = {
  code?: string;
  name: string;
  category: CustomerCategory;
  email?: string;
  phone?: string;
  taxId?: string;
  creditLimitGbp?: string;
  isActive: boolean;
};

export type UpdateCustomerInput = {
  customerId: string;
  code: string;
  name: string;
  category: CustomerCategory;
  email?: string;
  phone?: string;
  taxId?: string;
  creditLimitGbp?: string;
  isActive: boolean;
};

export type CustomerAddressInput = {
  customerId: string;
  addressType: CustomerAddressType;
  isDefault: boolean;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  countryIso2: string;
  notes?: string;
};

export type CustomerAddressUpdateInput = CustomerAddressInput & {
  addressId: string;
};
