'use client';

/**
 * Wave-shipping — Customer detail (client view).
 *
 * Prototype parity: customer-screens.jsx:134-236 (ShCustomerDetail) — profile +
 * addresses tabs, edit + deactivate, address table with default marker.
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { EmptyState } from '@monopilot/ui/EmptyState';

import { CustomerStatusBadge } from './customer-status-badge';
import { EditCustomerModal } from './edit-customer-modal';
import { CustomerAddressModal } from './customer-address-modal';
import type {
  AddressResult,
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressUpdateInput,
  CustomerDetail,
  UpdateCustomerInput,
  UpdateCustomerResult,
} from './customer-types';
import type { EditCustomerLabels } from './edit-customer-modal';
import type { CustomerAddressModalLabels } from './customer-address-modal';

type TabKey = 'profile' | 'addresses';

export type CustomerDetailLabels = {
  status: { active: string; inactive: string };
  category: Record<string, string>;
  tabs: Record<TabKey, string>;
  backToList: string;
  actions: {
    edit: string;
    deactivate: string;
    reactivate: string;
    pending: string;
  };
  profile: {
    identityTitle: string;
    statsTitle: string;
    fields: Record<string, string>;
    stats: { addressCount: string; shippingAddressCount: string };
    noLimit: string;
    yes: string;
    no: string;
  };
  addresses: {
    title: string;
    add: string;
    hint: string;
    empty: string;
    columns: Record<string, string>;
    type: Record<string, string>;
    defaultStar: string;
    notDefault: string;
    edit: string;
    deactivate: string;
    setDefault: string;
    pending: string;
    errors: Record<string, string>;
  };
  edit: EditCustomerLabels;
  addressModal: CustomerAddressModalLabels;
};

export type CustomerDetailViewProps = {
  locale: string;
  customer: CustomerDetail;
  labels: CustomerDetailLabels;
  updateCustomerAction: (input: UpdateCustomerInput) => Promise<UpdateCustomerResult>;
  setCustomerActiveAction: (input: { customerId: string; isActive: boolean }) => Promise<UpdateCustomerResult>;
  createAddressAction: (input: CustomerAddressInput) => Promise<AddressResult>;
  updateAddressAction: (input: CustomerAddressUpdateInput) => Promise<AddressResult>;
  deactivateAddressAction: (input: { customerId: string; addressId: string }) => Promise<AddressResult | { ok: true; data: { id: string } } | { ok: false; error: string }>;
  setDefaultShippingAddressAction: (input: { customerId: string; addressId: string }) => Promise<AddressResult>;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function CustomerDetailView({
  locale,
  customer,
  labels,
  updateCustomerAction,
  setCustomerActiveAction,
  createAddressAction,
  updateAddressAction,
  deactivateAddressAction,
  setDefaultShippingAddressAction,
}: CustomerDetailViewProps) {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>('profile');
  const [editOpen, setEditOpen] = React.useState(false);
  const [addressOpen, setAddressOpen] = React.useState(false);
  const [editingAddress, setEditingAddress] = React.useState<CustomerAddress | null>(null);
  const [pending, setPending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const shippingCount = customer.addresses.filter((a) => a.addressType === 'shipping').length;

  async function toggleActive() {
    setPending(true);
    setActionError(null);
    const result = await setCustomerActiveAction({ customerId: customer.id, isActive: !customer.isActive });
    setPending(false);
    if (!result.ok) {
      setActionError(labels.addresses.errors[result.error] ?? labels.addresses.errors.persistence_failed);
      return;
    }
    router.refresh();
  }

  async function onDeactivateAddress(addressId: string) {
    setPending(true);
    setActionError(null);
    const result = await deactivateAddressAction({ customerId: customer.id, addressId });
    setPending(false);
    if (!result.ok) {
      setActionError(labels.addresses.errors[(result as { error: string }).error] ?? labels.addresses.errors.persistence_failed);
      return;
    }
    router.refresh();
  }

  async function onSetDefault(addressId: string) {
    setPending(true);
    setActionError(null);
    const result = await setDefaultShippingAddressAction({ customerId: customer.id, addressId });
    setPending(false);
    if (!result.ok) {
      setActionError(labels.addresses.errors[result.error] ?? labels.addresses.errors.persistence_failed);
      return;
    }
    router.refresh();
  }

  function openCreateAddress() {
    setEditingAddress(null);
    setAddressOpen(true);
  }

  function openEditAddress(address: CustomerAddress) {
    setEditingAddress(address);
    setAddressOpen(true);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="customer-detail-view">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">
            <Link href={`/${locale}/shipping/customers`} className="text-blue-700 hover:underline">
              {labels.backToList}
            </Link>
            {' · '}
            <span className="font-mono">{customer.code}</span>
            {' · '}
            {labels.category[customer.category] ?? customer.category}
          </div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{customer.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CustomerStatusBadge active={customer.isActive} label={customer.isActive ? labels.status.active : labels.status.inactive} />
          <Button type="button" className="btn--secondary btn-sm" data-testid="customer-detail-edit" onClick={() => setEditOpen(true)}>
            {labels.actions.edit}
          </Button>
          <Button
            type="button"
            className="btn--ghost btn-sm"
            data-testid="customer-detail-toggle-active"
            disabled={pending}
            onClick={() => void toggleActive()}
          >
            {pending ? labels.actions.pending : customer.isActive ? labels.actions.deactivate : labels.actions.reactivate}
          </Button>
        </div>
      </div>

      {actionError ? (
        <div role="alert" data-testid="customer-detail-action-error" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      ) : null}

      <div role="tablist" className="flex flex-wrap gap-2" data-testid="customer-detail-tabs">
        {(['profile', 'addresses'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-testid={`customer-detail-tab-${key}`}
            onClick={() => setTab(key)}
            className={[
              'rounded-md px-3 py-1.5 text-sm font-medium',
              tab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {labels.tabs[key]}
            {key === 'addresses' ? (
              <span className="ml-1.5 rounded bg-slate-200/60 px-1.5 text-xs tabular-nums text-slate-700">{customer.addresses.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="customer-detail-profile">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800">{labels.profile.identityTitle}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                [labels.profile.fields.code, customer.code],
                [labels.profile.fields.name, customer.name],
                [labels.profile.fields.category, labels.category[customer.category] ?? customer.category],
                [labels.profile.fields.email, customer.email ?? '—'],
                [labels.profile.fields.phone, customer.phone ?? '—'],
                [labels.profile.fields.taxId, customer.taxId ?? '—'],
                [
                  labels.profile.fields.creditLimit,
                  customer.creditLimitGbp && Number(customer.creditLimitGbp) > 0
                    ? `£${Number(customer.creditLimitGbp).toLocaleString()}`
                    : labels.profile.noLimit,
                ],
                [labels.profile.fields.active, customer.isActive ? labels.profile.yes : labels.profile.no],
                [labels.profile.fields.createdAt, formatDate(customer.createdAt)],
                [labels.profile.fields.updatedAt, formatDate(customer.updatedAt)],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800">{labels.profile.statsTitle}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{labels.profile.stats.addressCount}</dt>
                <dd className="font-mono font-semibold">{customer.addressCount}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{labels.profile.stats.shippingAddressCount}</dt>
                <dd className="font-mono font-semibold">{shippingCount}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {tab === 'addresses' ? (
        <div className="rounded-xl border border-slate-200" data-testid="customer-detail-addresses">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">
              {labels.addresses.title.replace('{n}', String(customer.addresses.length))}
            </h3>
            <Button type="button" className="btn--primary btn-sm" data-testid="customer-address-add" onClick={openCreateAddress}>
              + {labels.addresses.add}
            </Button>
          </div>
          {customer.addresses.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon="◎"
                title={labels.addresses.empty}
                body={labels.addresses.hint}
                action={{ label: labels.addresses.add, onClick: openCreateAddress }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="customer-address-table">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">{labels.addresses.columns.type}</th>
                    <th className="px-3 py-2">{labels.addresses.columns.default}</th>
                    <th className="px-3 py-2">{labels.addresses.columns.line1}</th>
                    <th className="px-3 py-2">{labels.addresses.columns.city}</th>
                    <th className="px-3 py-2">{labels.addresses.columns.postal}</th>
                    <th className="px-3 py-2">{labels.addresses.columns.country}</th>
                    <th className="px-3 py-2">{labels.addresses.columns.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.addresses.map((a) => (
                    <tr key={a.id} data-testid={`customer-address-row-${a.id}`} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{labels.addresses.type[a.addressType] ?? a.addressType}</span>
                      </td>
                      <td className="px-3 py-2">{a.isDefault ? labels.addresses.defaultStar : labels.addresses.notDefault}</td>
                      <td className="px-3 py-2">{a.addressLine1}</td>
                      <td className="px-3 py-2">{a.city}</td>
                      <td className="px-3 py-2 font-mono text-xs">{a.postalCode}</td>
                      <td className="px-3 py-2 font-mono text-xs">{a.countryIso2}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button type="button" className="btn--ghost btn-sm" onClick={() => openEditAddress(a)}>
                            {labels.addresses.edit}
                          </Button>
                          {a.addressType === 'shipping' && !a.isDefault ? (
                            <Button type="button" className="btn--ghost btn-sm" disabled={pending} onClick={() => void onSetDefault(a.id)}>
                              {labels.addresses.setDefault}
                            </Button>
                          ) : null}
                          <Button type="button" className="btn--ghost btn-sm" disabled={pending} onClick={() => void onDeactivateAddress(a.id)}>
                            {labels.addresses.deactivate}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">{labels.addresses.hint}</div>
        </div>
      ) : null}

      <EditCustomerModal
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={customer}
        labels={labels.edit}
        updateCustomerAction={updateCustomerAction}
        onUpdated={() => router.refresh()}
      />

      <CustomerAddressModal
        open={addressOpen}
        onOpenChange={setAddressOpen}
        customerId={customer.id}
        address={editingAddress}
        labels={labels.addressModal}
        createAddressAction={createAddressAction}
        updateAddressAction={updateAddressAction}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
