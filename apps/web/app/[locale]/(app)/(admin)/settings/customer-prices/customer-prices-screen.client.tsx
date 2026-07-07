'use client';

/**
 * C7b — Customer item prices settings screen (client island).
 *
 * Lists per-customer sell price overrides (customer_item_prices) with add/edit/
 * deactivate affordances. RBAC (settings.org.update) is resolved server-side;
 * the action re-checks regardless.
 */
import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type {
  CustomerPriceFormOptions,
  CustomerPriceMutationResult,
  CustomerPriceOption,
  CustomerPriceRow,
} from './_actions/customer-item-prices-types';

export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type CustomerPricesLabels = {
  eyebrow: string;
  title: string;
  subtitle: string;
  sectionTitle: string;
  provenance: string;
  addPrice: string;
  emptyCta: string;
  filterAllCustomers: string;
  filterCustomer: string;
  columnCustomer: string;
  columnItem: string;
  columnUnitPrice: string;
  columnCurrency: string;
  columnEffectiveFrom: string;
  columnEffectiveTo: string;
  columnStatus: string;
  columnActions: string;
  editPrice: string;
  deactivatePrice: string;
  statusActive: string;
  statusScheduled: string;
  statusExpired: string;
  dialogAddTitle: string;
  dialogEditTitle: string;
  fieldCustomer: string;
  fieldItem: string;
  fieldUnitPrice: string;
  fieldCurrency: string;
  fieldEffectiveFrom: string;
  fieldEffectiveTo: string;
  fieldEffectiveToHelp: string;
  save: string;
  savePending: string;
  cancel: string;
  createSuccess: string;
  updateSuccess: string;
  deactivateSuccess: string;
  saveFailed: string;
  invalidInput: string;
  conflictError: string;
  insufficientPermission: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  confirmDeactivate: string;
};

const CURRENCIES = ['GBP', 'USD', 'EUR', 'PLN'] as const;

type Draft = {
  customerId: string;
  itemId: string;
  unitPrice: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
};

type CustomerPricesScreenProps = {
  initialPrices: CustomerPriceRow[];
  formOptions: CustomerPriceFormOptions;
  labels: CustomerPricesLabels;
  canManage: boolean;
  state?: PageState;
  selectedCustomerId?: string | null;
  createCustomerItemPrice: (input: {
    customerId: string;
    itemId: string;
    unitPrice: number;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }) => Promise<CustomerPriceMutationResult>;
  updateCustomerItemPrice: (input: {
    id: string;
    customerId: string;
    itemId: string;
    unitPrice: number;
    currency: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }) => Promise<CustomerPriceMutationResult>;
  deactivateCustomerItemPrice: (input: { id: string }) => Promise<CustomerPriceMutationResult>;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    customerId: '',
    itemId: '',
    unitPrice: '',
    currency: 'GBP',
    effectiveFrom: todayIso(),
    effectiveTo: '',
  };
}

function formatOptionLabel(option: CustomerPriceOption): string {
  return `${option.code} — ${option.name}`;
}

function priceStatus(
  row: CustomerPriceRow,
  today: string,
): 'active' | 'scheduled' | 'expired' {
  if (row.effectiveFrom > today) return 'scheduled';
  if (row.effectiveTo != null && row.effectiveTo < today) return 'expired';
  return 'active';
}

function StateNotice({ state, labels }: { state: PageState; labels: CustomerPricesLabels }) {
  if (state === 'loading') return <div role="status" aria-live="polite">{labels.loading}</div>;
  if (state === 'empty') return <div role="status">{labels.empty}</div>;
  if (state === 'error') return <div role="alert">{labels.error}</div>;
  if (state === 'permission_denied') return <div role="alert">{labels.forbidden}</div>;
  return null;
}

export default function CustomerPricesScreen({
  initialPrices,
  formOptions,
  labels,
  canManage,
  state = 'ready',
  selectedCustomerId = null,
  createCustomerItemPrice,
  updateCustomerItemPrice,
  deactivateCustomerItemPrice,
}: CustomerPricesScreenProps) {
  const [rows, setRows] = React.useState<CustomerPriceRow[]>(() => [...initialPrices]);
  const [customerFilter, setCustomerFilter] = React.useState<string>(selectedCustomerId ?? 'all');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogMode, setDialogMode] = React.useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [pending, setPending] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const today = todayIso();

  const filteredRows = React.useMemo(() => {
    if (customerFilter === 'all') return rows;
    return rows.filter((row) => row.customerId === customerFilter);
  }, [rows, customerFilter]);

  const effectiveState: PageState = state === 'empty' && filteredRows.length > 0 ? 'ready' : state;
  const moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  function openAdd() {
    if (!canManage) return;
    setDialogMode('add');
    setEditingId(null);
    const customerId =
      customerFilter !== 'all'
        ? customerFilter
        : formOptions.customers.length === 1
          ? formOptions.customers[0]!.id
          : '';
    const itemId = formOptions.items.length === 1 ? formOptions.items[0]!.id : '';
    setDraft({
      ...emptyDraft(),
      customerId,
      itemId,
    });
    setActionError(null);
    setDialogOpen(true);
  }

  function openEdit(row: CustomerPriceRow) {
    if (!canManage) return;
    setDialogMode('edit');
    setEditingId(row.id);
    setDraft({
      customerId: row.customerId,
      itemId: row.itemId,
      unitPrice: String(row.unitPrice),
      currency: row.currency,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo ?? '',
    });
    setActionError(null);
    setDialogOpen(true);
  }

  async function submitDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || pending) return;

    const unitPrice = Number(draft.unitPrice);
    if (
      draft.customerId === ''
      || draft.itemId === ''
      || !Number.isFinite(unitPrice)
      || unitPrice < 0
      || draft.effectiveFrom === ''
      || !CURRENCIES.includes(draft.currency as (typeof CURRENCIES)[number])
    ) {
      setActionError(labels.invalidInput);
      return;
    }
    if (draft.effectiveTo !== '' && draft.effectiveTo < draft.effectiveFrom) {
      setActionError(labels.invalidInput);
      return;
    }

    setPending(true);
    setActionError(null);
    setStatusMessage(null);

    const payload = {
      customerId: draft.customerId,
      itemId: draft.itemId,
      unitPrice,
      currency: draft.currency,
      effectiveFrom: draft.effectiveFrom,
      effectiveTo: draft.effectiveTo === '' ? null : draft.effectiveTo,
    };

    try {
      const result =
        dialogMode === 'edit' && editingId
          ? await updateCustomerItemPrice({ id: editingId, ...payload })
          : await createCustomerItemPrice(payload);

      if (!result.ok) {
        if (result.error === 'invalid_input') setActionError(labels.invalidInput);
        else if (result.error === 'conflict') setActionError(labels.conflictError);
        else setActionError(labels.saveFailed);
        return;
      }

      const customer = formOptions.customers.find((c) => c.id === payload.customerId);
      const item = formOptions.items.find((i) => i.id === payload.itemId);
      const saved: CustomerPriceRow = {
        id: result.id,
        customerId: payload.customerId,
        customerCode: customer?.code ?? '',
        customerName: customer?.name ?? '',
        itemId: payload.itemId,
        itemCode: item?.code ?? '',
        itemName: item?.name ?? '',
        unitPrice: payload.unitPrice,
        currency: payload.currency,
        effectiveFrom: payload.effectiveFrom,
        effectiveTo: payload.effectiveTo,
      };

      setRows((current) => {
        const without = current.filter((row) => row.id !== saved.id);
        return [saved, ...without].sort(
          (a, b) =>
            a.customerCode.localeCompare(b.customerCode)
            || a.itemCode.localeCompare(b.itemCode)
            || b.effectiveFrom.localeCompare(a.effectiveFrom),
        );
      });
      setStatusMessage(dialogMode === 'edit' ? labels.updateSuccess : labels.createSuccess);
      setDialogOpen(false);
      setDialogMode('add');
      setEditingId(null);
      setDraft(emptyDraft());
    } catch {
      setActionError(labels.saveFailed);
    } finally {
      setPending(false);
    }
  }

  async function handleDeactivate(row: CustomerPriceRow) {
    if (!canManage || pending) return;
    if (!window.confirm(labels.confirmDeactivate.replace('{item}', `${row.itemCode} — ${row.customerCode}`))) {
      return;
    }
    setPending(true);
    setActionError(null);
    setStatusMessage(null);
    try {
      const result = await deactivateCustomerItemPrice({ id: row.id });
      if (!result.ok) {
        setActionError(labels.saveFailed);
        return;
      }
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setStatusMessage(labels.deactivateSuccess);
    } catch {
      setActionError(labels.saveFailed);
    } finally {
      setPending(false);
    }
  }

  const statusLabel = (status: 'active' | 'scheduled' | 'expired') => {
    if (status === 'active') return labels.statusActive;
    if (status === 'scheduled') return labels.statusScheduled;
    return labels.statusExpired;
  };

  return (
    <main
      data-testid="settings-customer-prices-screen"
      data-screen="settings-customer-prices-list"
      aria-labelledby="settings-customer-prices-title"
      className="settings-screen settings-screen--customer-prices space-y-4"
    >
      <header className="flex items-start justify-between gap-4" data-region="page-head">
        <div>
          <p className="settings-eyebrow">{labels.eyebrow}</p>
          <h1 id="settings-customer-prices-title">{labels.title}</h1>
          <p className="muted">{labels.subtitle}</p>
        </div>
        <Button
          type="button"
          className="btn-primary"
          disabled={!canManage}
          title={!canManage ? labels.insufficientPermission : undefined}
          aria-label={canManage ? labels.addPrice : `${labels.addPrice} — ${labels.insufficientPermission}`}
          onClick={openAdd}
        >
          + {labels.addPrice}
        </Button>
      </header>

      {statusMessage ? (
        <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
          {statusMessage}
        </section>
      ) : null}

      <section
        className="settings-section rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        aria-labelledby="customer-prices-section-title"
      >
        <div className="settings-section__head flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="customer-prices-section-title">{labels.sectionTitle}</h2>
            <p className="muted text-sm">{labels.provenance}</p>
          </div>
          <div className="min-w-[220px]">
            <label htmlFor="customer-prices-filter" className="mb-1 block text-xs font-medium text-slate-600">
              {labels.filterCustomer}
            </label>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger id="customer-prices-filter" aria-label={labels.filterCustomer}>
                <SelectValue placeholder={labels.filterAllCustomers} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{labels.filterAllCustomers}</SelectItem>
                {formOptions.customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {formatOptionLabel(customer)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {actionError ? <div role="alert" className="mt-3 text-sm text-red-700">{actionError}</div> : null}
      </section>

      {dialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-price-dialog-title"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="customer-price-dialog-title" className="text-lg font-semibold text-slate-950">
                {dialogMode === 'edit' ? labels.dialogEditTitle : labels.dialogAddTitle}
              </h2>
              <Button
                type="button"
                variant="dry-run"
                aria-label={labels.cancel}
                onClick={() => {
                  setDialogOpen(false);
                  setDialogMode('add');
                  setEditingId(null);
                }}
                disabled={pending}
              >
                x
              </Button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={submitDraft}>
              <div>
                <label htmlFor="customer-price-customer" className="mb-1 block text-sm font-medium">
                  {labels.fieldCustomer}
                </label>
                <Select
                  value={draft.customerId}
                  onValueChange={(value) => setDraft((current) => ({ ...current, customerId: value }))}
                  disabled={dialogMode === 'edit'}
                >
                  <SelectTrigger id="customer-price-customer" aria-label={labels.fieldCustomer}>
                    <SelectValue placeholder={labels.fieldCustomer} />
                  </SelectTrigger>
                  <SelectContent>
                    {formOptions.customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {formatOptionLabel(customer)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="customer-price-item" className="mb-1 block text-sm font-medium">
                  {labels.fieldItem}
                </label>
                <Select
                  value={draft.itemId}
                  onValueChange={(value) => setDraft((current) => ({ ...current, itemId: value }))}
                  disabled={dialogMode === 'edit'}
                >
                  <SelectTrigger id="customer-price-item" aria-label={labels.fieldItem}>
                    <SelectValue placeholder={labels.fieldItem} />
                  </SelectTrigger>
                  <SelectContent>
                    {formOptions.items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {formatOptionLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="customer-price-unit-price" className="mb-1 block text-sm font-medium">
                    {labels.fieldUnitPrice}
                  </label>
                  <Input
                    id="customer-price-unit-price"
                    type="number"
                    min="0"
                    step="0.0001"
                    value={draft.unitPrice}
                    onChange={(event) => setDraft((current) => ({ ...current, unitPrice: event.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="customer-price-currency" className="mb-1 block text-sm font-medium">
                    {labels.fieldCurrency}
                  </label>
                  <Select
                    value={draft.currency}
                    onValueChange={(value) => setDraft((current) => ({ ...current, currency: value }))}
                  >
                    <SelectTrigger id="customer-price-currency" aria-label={labels.fieldCurrency}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="customer-price-effective-from" className="mb-1 block text-sm font-medium">
                    {labels.fieldEffectiveFrom}
                  </label>
                  <Input
                    id="customer-price-effective-from"
                    type="date"
                    value={draft.effectiveFrom}
                    onChange={(event) => setDraft((current) => ({ ...current, effectiveFrom: event.target.value }))}
                  />
                </div>
                <div>
                  <label htmlFor="customer-price-effective-to" className="mb-1 block text-sm font-medium">
                    {labels.fieldEffectiveTo}
                  </label>
                  <Input
                    id="customer-price-effective-to"
                    type="date"
                    value={draft.effectiveTo}
                    onChange={(event) => setDraft((current) => ({ ...current, effectiveTo: event.target.value }))}
                  />
                  <p className="mt-1 text-xs text-slate-500">{labels.fieldEffectiveToHelp}</p>
                </div>
              </div>
              {actionError ? <div role="alert" className="text-sm text-red-700">{actionError}</div> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="dry-run" onClick={() => setDialogOpen(false)} disabled={pending}>
                  {labels.cancel}
                </Button>
                <Button type="submit" className="btn-primary" disabled={pending}>
                  {pending ? labels.savePending : labels.save}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {effectiveState !== 'ready' ? (
        <StateNotice state={effectiveState} labels={labels} />
      ) : (
        <section className="settings-section rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {filteredRows.length === 0 ? (
            <div role="status" className="text-sm text-slate-600">
              {labels.empty}{' '}
              {canManage ? (
                <Button type="button" className="btn-primary" onClick={openAdd}>
                  {labels.emptyCta}
                </Button>
              ) : null}
            </div>
          ) : (
            <Table aria-label={labels.sectionTitle}>
              <TableHeader>
                <TableRow>
                  <TableHead>{labels.columnCustomer}</TableHead>
                  <TableHead>{labels.columnItem}</TableHead>
                  <TableHead className="text-right">{labels.columnUnitPrice}</TableHead>
                  <TableHead>{labels.columnCurrency}</TableHead>
                  <TableHead>{labels.columnEffectiveFrom}</TableHead>
                  <TableHead>{labels.columnEffectiveTo}</TableHead>
                  <TableHead>{labels.columnStatus}</TableHead>
                  <TableHead>{labels.columnActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const status = priceStatus(row, today);
                  const rowLabel = `${row.customerCode} ${row.itemCode}`;
                  return (
                    <TableRow key={row.id} data-testid="settings-customer-price-row">
                      <TableCell>
                        <span className="font-medium">{row.customerCode}</span>
                        <span className="muted block text-xs">{row.customerName}</span>
                      </TableCell>
                      <TableCell>
                        <span className="mono">{row.itemCode}</span>
                        <span className="muted block text-xs">{row.itemName}</span>
                      </TableCell>
                      <TableCell className="mono num text-right">{moneyFmt.format(row.unitPrice)}</TableCell>
                      <TableCell className="mono">{row.currency}</TableCell>
                      <TableCell className="mono">{row.effectiveFrom}</TableCell>
                      <TableCell className="mono">{row.effectiveTo ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={status === 'active' ? 'success' : status === 'scheduled' ? 'info' : 'secondary'}>
                          {statusLabel(status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="dry-run"
                            className="btn-secondary btn-sm"
                            disabled={!canManage}
                            aria-label={`${labels.editPrice} ${rowLabel}`}
                            onClick={() => openEdit(row)}
                          >
                            {labels.editPrice}
                          </Button>
                          <Button
                            type="button"
                            variant="dry-run"
                            className="btn-secondary btn-sm text-red-700"
                            disabled={!canManage}
                            aria-label={`${labels.deactivatePrice} ${rowLabel}`}
                            onClick={() => void handleDeactivate(row)}
                          >
                            {labels.deactivatePrice}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </main>
  );
}
