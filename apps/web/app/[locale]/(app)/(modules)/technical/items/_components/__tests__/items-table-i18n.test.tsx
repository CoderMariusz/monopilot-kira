/** @vitest-environment jsdom */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemsTableClient, type ItemsTableLabels } from '../items-table.client';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../../_actions/create-item', () => ({ createItem: vi.fn() })); vi.mock('../../_actions/update-item', () => ({ updateItem: vi.fn() }));
vi.mock('../../_actions/deactivate-item', () => ({ deactivateItem: vi.fn() })); vi.mock('../../_actions/transition-item-status', () => ({ transitionItemStatus: vi.fn() }));
const labels: ItemsTableLabels = {
  typeLabels: { rm: 'Surowiec', ingredient: 'Składnik', intermediate: 'Półprodukt', fg: 'Wyrób gotowy', co_product: 'Produkt uboczny', byproduct: 'Produkt odpadowy', packaging: 'Opakowanie' },
  statusLabels: { draft: 'Wersja robocza', active: 'Aktywny', deprecated: 'Wycofany', blocked: 'Zablokowany' },
  tabLabels: { all: 'Wszystkie', rm: 'Surowce', ingredient: 'Składniki', intermediate: 'Półprodukty', fg: 'Wyroby gotowe', co_product: 'Produkty uboczne', byproduct: 'Produkty odpadowe', packaging: 'Opakowania' },
  statusFilterLabels: { all: 'Wszystkie statusy', active: 'Aktywny', draft: 'Wersja robocza', deprecated: 'Wycofany', blocked: 'Zablokowany' },
  d365FilterLabels: { all: 'D365: wszystkie', synced: 'Zsynchronizowane', drift: 'Rozbieżność', unsynced: 'Niezsynchronizowane' },
  columns: { code: 'Kod', name: 'Nazwa', type: 'Typ', uom: 'JM', costPerKg: 'Koszt / kg (zł)', allergens: 'Alergeny', boms: 'BOM-y', updated: 'Aktualizacja', status: 'Status', actions: 'Akcje' },
  searchPlaceholder: 'Szukaj po kodzie lub nazwie…',
  footer: '{shown} z {total} pozycji',
  aria: { itemType: 'Typ pozycji', search: 'Szukaj po kodzie lub nazwie…', statusFilter: 'Status', d365Filter: 'Status D365', table: 'Pozycje' },
};
const item = { id: '1', itemCode: 'RM-1', name: 'Mąka', itemType: 'rm', status: 'active', description: null, productGroup: null, uomBase: 'kg', uomSecondary: null, gs1Gtin: null, weightMode: 'fixed', nominalWeight: null, tareWeight: null, grossWeightMax: null, varianceTolerancePct: null, shelfLifeDays: null, shelfLifeMode: null, outputUom: 'base', netQtyPerEach: null, eachPerBox: null, boxesPerPallet: null, costPerKg: '1.20', listPriceGbp: null, updatedAt: '2026-06-26T00:00:00.000Z', allergens: [], bomCount: 0, d365SyncStatus: null } as const;
describe('ItemsTableClient i18n', () => {
  it('renders translated list chrome instead of English literals', () => {
    render(<ItemsTableClient items={[item]} canEdit={false} canDeactivate={false} editLabel="Edytuj" deactivateLabel="Dezaktywuj" allergensLabel="Alergeny" filterEmptyTitle="Brak wyników" filterEmptyBody="Zmień filtry." labels={labels} wizardLabels={{} as never} deactivateLabels={{} as never} />);
    expect(screen.getByRole('table', { name: 'Pozycje' })).toBeInTheDocument(); expect(screen.getByRole('tab', { name: /Wszystkie/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Szukaj po kodzie lub nazwie…')).toBeInTheDocument(); expect(screen.queryByText('Raw materials')).not.toBeInTheDocument();
    expect(screen.queryByText('Search by code or name…')).not.toBeInTheDocument();
  });

  // F7 (2026-07-01) — 'szt' is the Polish storage value for each/piece. It must
  // NOT leak the Polish word into the list; the UoM cell renders "pcs" instead.
  it('renders the "szt" base UoM as "pcs" (no raw Polish word)', () => {
    const sztItem = { ...item, id: '2', itemCode: 'PKG-1', name: 'Box', itemType: 'packaging', uomBase: 'szt' } as const;
    render(<ItemsTableClient items={[sztItem]} canEdit={false} canDeactivate={false} editLabel="Edytuj" deactivateLabel="Dezaktywuj" allergensLabel="Alergeny" filterEmptyTitle="Brak wyników" filterEmptyBody="Zmień filtry." labels={labels} wizardLabels={{} as never} deactivateLabels={{} as never} />);
    expect(screen.getByText('pcs')).toBeInTheDocument();
    expect(screen.queryByText('szt')).not.toBeInTheDocument();
  });
});
