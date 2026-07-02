/**
 * Wave-shipping — Customer detail route (/shipping/customers/[customerId]).
 *
 * Prototype parity: customer-screens.jsx:134-236 (ShCustomerDetail).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getCustomer, updateCustomer, setCustomerActive } from '../_actions/customer-actions';
import {
  createCustomerAddress,
  updateCustomerAddress,
  deactivateCustomerAddress,
  setDefaultShippingAddress,
} from '../_actions/customer-address-actions';
import { CustomerDetailView } from '../_components/customer-detail-view';
import { buildCustomerDetailLabels } from '../_components/customer-detail-labels';
import { ShippingTabs } from '../../shipments/_components/shipping-tabs';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; customerId: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="customer-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function DetailContent({ locale, customerId }: { locale: string; customerId: string }) {
  const t = await getTranslations('Shipping.customers');
  const result = await getCustomer(customerId);

  if (!result.ok) {
    if (result.error === 'not_found') {
      return (
        <div data-testid="customer-detail-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-600">
          <p>{t('detail.notFound')}</p>
          <Link href={`/${locale}/shipping/customers`} className="mt-3 inline-block text-blue-700 hover:underline">
            {t('detail.backToList')}
          </Link>
        </div>
      );
    }
    return (
      <div role="alert" data-testid="customer-detail-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <CustomerDetailView
      locale={locale}
      customer={result.data}
      labels={buildCustomerDetailLabels((key) => t(key))}
      updateCustomerAction={updateCustomer}
      setCustomerActiveAction={setCustomerActive}
      createAddressAction={createCustomerAddress}
      updateAddressAction={updateCustomerAddress}
      deactivateAddressAction={deactivateCustomerAddress}
      setDefaultShippingAddressAction={setDefaultShippingAddress}
    />
  );
}

export default async function ShippingCustomerDetailPage({ params }: PageProps) {
  const { locale, customerId } = await params;
  const t = await getTranslations('Shipping.customers');
  const tShip = await getTranslations('Shipping.shipments');

  return (
    <main
      data-screen="shipping-customer-detail"
      data-prototype-label="customer_detail_page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('detail.title')}
        subtitle={t('detail.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.shipping'), href: `/${locale}/shipping` },
          { label: t('breadcrumb.customers'), href: `/${locale}/shipping/customers` },
          { label: t('detail.breadcrumbCurrent') },
        ]}
      />
      <ShippingTabs
        locale={locale}
        labels={{
          salesOrders: tShip('tabs.salesOrders'),
          shipments: tShip('tabs.shipments'),
          customers: tShip('tabs.customers'),
        }}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} customerId={customerId} />
      </Suspense>
    </main>
  );
}
