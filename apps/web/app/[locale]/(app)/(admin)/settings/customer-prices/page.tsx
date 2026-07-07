/**
 * C7b — `/settings/customer-prices` Customer item prices settings page.
 *
 * Server Component: reads org-scoped customer_item_prices via listCustomerItemPrices
 * (settings.org.read). Mutations delegate to create/update/deactivate actions
 * (settings.org.update). canManage is resolved here so affordances render
 * honestly enabled/disabled.
 */
import React from 'react';
import { getTranslations } from 'next-intl/server';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  createCustomerItemPrice as persistCreateCustomerItemPrice,
  deactivateCustomerItemPrice as persistDeactivateCustomerItemPrice,
  listCustomerItemPrices,
  loadCustomerPriceFormOptions,
  updateCustomerItemPrice as persistUpdateCustomerItemPrice,
} from './_actions/customer-item-prices-actions';
import type {
  CustomerPriceFormOptions,
  CustomerPriceMutationResult,
  CustomerPriceRow,
} from './_actions/customer-item-prices-types';
import CustomerPricesScreen, {
  type CustomerPricesLabels,
  type PageState,
} from './customer-prices-screen.client';

export const dynamic = 'force-dynamic';

const MANAGE_PERMISSION = 'settings.org.update';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type CustomerPricesPageProps = {
  params?: Promise<{ locale: string }>;
  prices?: CustomerPriceRow[];
  formOptions?: CustomerPriceFormOptions;
  canManage?: boolean;
  state?: PageState;
  selectedCustomerId?: string | null;
  createCustomerItemPrice?: typeof persistCreateCustomerItemPrice;
  updateCustomerItemPrice?: typeof persistUpdateCustomerItemPrice;
  deactivateCustomerItemPrice?: typeof persistDeactivateCustomerItemPrice;
};

type LoaderResult = {
  state: PageState;
  prices: CustomerPriceRow[];
  formOptions: CustomerPriceFormOptions;
  canManage: boolean;
};

const LABEL_KEYS: Array<keyof CustomerPricesLabels> = [
  'eyebrow',
  'title',
  'subtitle',
  'sectionTitle',
  'provenance',
  'addPrice',
  'emptyCta',
  'filterAllCustomers',
  'filterCustomer',
  'columnCustomer',
  'columnItem',
  'columnUnitPrice',
  'columnCurrency',
  'columnEffectiveFrom',
  'columnEffectiveTo',
  'columnStatus',
  'columnActions',
  'editPrice',
  'deactivatePrice',
  'statusActive',
  'statusScheduled',
  'statusExpired',
  'dialogAddTitle',
  'dialogEditTitle',
  'fieldCustomer',
  'fieldItem',
  'fieldUnitPrice',
  'fieldCurrency',
  'fieldEffectiveFrom',
  'fieldEffectiveTo',
  'fieldEffectiveToHelp',
  'save',
  'savePending',
  'cancel',
  'createSuccess',
  'updateSuccess',
  'deactivateSuccess',
  'saveFailed',
  'invalidInput',
  'conflictError',
  'insufficientPermission',
  'loading',
  'empty',
  'error',
  'forbidden',
  'confirmDeactivate',
];

async function buildLabels(): Promise<CustomerPricesLabels> {
  const t = await getTranslations('settings.customerPrices');
  return LABEL_KEYS.reduce((labels, key) => {
    labels[key] = t(key);
    return labels;
  }, {} as CustomerPricesLabels);
}

async function resolveCanManage(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => hasPermission(rawCtx as OrgContextLike, MANAGE_PERMISSION));
  } catch {
    return false;
  }
}

async function loadCustomerPricesPageData(): Promise<LoaderResult> {
  const [listResult, optionsResult, canManage] = await Promise.all([
    listCustomerItemPrices(),
    loadCustomerPriceFormOptions(),
    resolveCanManage(),
  ]);

  if (!listResult.ok) {
    if (listResult.error === 'forbidden') {
      return {
        state: 'permission_denied',
        prices: [],
        formOptions: { customers: [], items: [] },
        canManage: false,
      };
    }
    return {
      state: 'error',
      prices: [],
      formOptions: optionsResult.ok ? optionsResult.options : { customers: [], items: [] },
      canManage,
    };
  }

  const formOptions = optionsResult.ok ? optionsResult.options : { customers: [], items: [] };
  return {
    state: listResult.prices.length === 0 ? 'empty' : 'ready',
    prices: listResult.prices,
    formOptions,
    canManage,
  };
}

async function createCustomerItemPriceAdapter(
  input: Parameters<typeof persistCreateCustomerItemPrice>[0],
): Promise<CustomerPriceMutationResult> {
  'use server';
  return persistCreateCustomerItemPrice(input);
}

async function updateCustomerItemPriceAdapter(
  input: Parameters<typeof persistUpdateCustomerItemPrice>[0],
): Promise<CustomerPriceMutationResult> {
  'use server';
  return persistUpdateCustomerItemPrice(input);
}

async function deactivateCustomerItemPriceAdapter(
  input: Parameters<typeof persistDeactivateCustomerItemPrice>[0],
): Promise<CustomerPriceMutationResult> {
  'use server';
  return persistDeactivateCustomerItemPrice(input);
}

export default async function CustomerPricesPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as CustomerPricesPageProps;
  const labels = await buildLabels();

  const hasInjected = Array.isArray(props.prices) || props.state != null;
  const loaded: LoaderResult = hasInjected
    ? {
        state: props.state ?? ((props.prices?.length ?? 0) === 0 ? 'empty' : 'ready'),
        prices: props.prices ?? [],
        formOptions: props.formOptions ?? { customers: [], items: [] },
        canManage: props.canManage ?? false,
      }
    : await loadCustomerPricesPageData();

  return (
    <CustomerPricesScreen
      initialPrices={loaded.prices}
      formOptions={props.formOptions ?? loaded.formOptions}
      labels={labels}
      canManage={props.canManage ?? loaded.canManage}
      state={props.state ?? loaded.state}
      selectedCustomerId={props.selectedCustomerId ?? null}
      createCustomerItemPrice={props.createCustomerItemPrice ?? createCustomerItemPriceAdapter}
      updateCustomerItemPrice={props.updateCustomerItemPrice ?? updateCustomerItemPriceAdapter}
      deactivateCustomerItemPrice={props.deactivateCustomerItemPrice ?? deactivateCustomerItemPriceAdapter}
    />
  );
}
