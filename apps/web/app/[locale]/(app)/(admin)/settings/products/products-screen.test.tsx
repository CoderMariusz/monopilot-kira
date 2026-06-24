/**
 * @vitest-environment jsdom
 * Products & SKUs screen RTL test.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/data-screens.jsx:4-52.
 * Asserts the screen renders the PageHead (Import CSV / + New product actions),
 * the toolbar (count + category pills + search), the products table with status
 * badges, and the empty-state — all from real-data-shaped loader props
 * (ProductRow), composing the shared `.sg-*` primitive structure. No mocks.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ProductRow } from './_actions/products';
import ProductsScreen, { type ProductsScreenLabels } from './products-screen.client';

const labels: ProductsScreenLabels = {
  title: 'Products & SKUs',
  subtitle: 'Your sellable product catalog. SKUs link to BOMs and production lines.',
  importCsv: 'Import CSV',
  newProduct: '+ New product',
  productCount: '{count} products',
  searchPlaceholder: 'Search SKU or name…',
  categoryAll: 'All',
  empty: 'No products are configured yet.',
  emptyFiltered: 'No products match the current filters.',
  columns: {
    sku: 'SKU',
    name: 'Name',
    category: 'Category',
    unit: 'Unit',
    weight: 'Weight',
    bom: 'BOM',
    status: 'Status',
  },
  status: {
    active: 'Active',
    development: 'Development',
    pilot: 'Pilot',
    discontinued: 'Discontinued',
  },
};

// Real loader-shaped rows (the shape getProducts returns via toProductRow).
const products: ProductRow[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    sku: 'FG-1001',
    name: 'Strawberry Yogurt 150g',
    category: 'Yogurt',
    unit: 'EA',
    weight: '0.15',
    bomLink: 'BOM-A1B2C3D4',
    status: 'active',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    sku: 'FG-1002',
    name: 'Vanilla Pudding 200g',
    category: 'Pudding',
    unit: 'EA',
    weight: '0.2',
    bomLink: '',
    status: 'development',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    sku: 'FG-1003',
    name: 'Mango Smoothie 250ml',
    category: 'Yogurt',
    unit: 'L',
    weight: '0.25',
    bomLink: 'BOM-EE55FF66',
    status: 'pilot',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    sku: 'FG-0900',
    name: 'Legacy Kefir 500ml',
    category: 'Kefir',
    unit: 'L',
    weight: '0.5',
    bomLink: '',
    status: 'discontinued',
  },
];

function renderScreen(overrides: Partial<React.ComponentProps<typeof ProductsScreen>> = {}) {
  return render(<ProductsScreen products={products} labels={labels} {...overrides} />);
}

afterEach(() => cleanup());

describe('ProductsScreen', () => {
  it('keeps the prototype-source anchor on the screen root', () => {
    const { container } = renderScreen();
    const main = container.querySelector('main[data-prototype-source]');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('data-prototype-source')).toBe(
      'prototypes/design/Monopilot Design System/settings/data-screens.jsx:4-52',
    );
  });

  it('renders the page head with title, subtitle and the two head actions', () => {
    const { container } = renderScreen();
    expect(container.querySelector('.sg-head')).not.toBeNull();
    expect(container.querySelector('.sg-title')?.textContent).toBe('Products & SKUs');
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New product' })).toBeInTheDocument();
  });

  it('composes the shared .sg-* section structure', () => {
    const { container } = renderScreen();
    expect(container.querySelectorAll('.sg-section').length).toBe(1);
    expect(container.querySelectorAll('.sg-section-body').length).toBe(1);
    // Toolbar reuses the prototype `.sg-section-head` + `.sg-section-title`.
    expect(container.querySelector('.sg-section-head')).not.toBeNull();
    expect(container.querySelector('.sg-section-title')?.textContent).toBe('4 products');
  });

  it('renders the products table from real-data props with status badges', () => {
    renderScreen();
    const table = screen.getByTestId('products-table');

    ['SKU', 'Name', 'Category', 'Unit', 'Weight', 'BOM', 'Status'].forEach((header) => {
      expect(within(table).getByText(header)).toBeInTheDocument();
    });

    const activeRow = within(table).getByText('Strawberry Yogurt 150g').closest('tr')!;
    expect(within(activeRow).getByText('FG-1001')).toBeInTheDocument();
    expect(within(activeRow).getByText('BOM-A1B2C3D4')).toBeInTheDocument();
    const activeBadge = within(activeRow).getByText('● Active');
    expect(activeBadge).toHaveClass('badge', 'badge-green');

    const devBadge = within(table)
      .getByText('Vanilla Pudding 200g')
      .closest('tr')!
      .querySelector('[data-status="development"]')!;
    expect(devBadge).toHaveClass('badge', 'badge-blue');
    expect(devBadge.textContent).toContain('Development');

    const pilotBadge = within(table)
      .getByText('Mango Smoothie 250ml')
      .closest('tr')!
      .querySelector('[data-status="pilot"]')!;
    expect(pilotBadge).toHaveClass('badge', 'badge-amber');

    const discBadge = within(table)
      .getByText('Legacy Kefir 500ml')
      .closest('tr')!
      .querySelector('[data-status="discontinued"]')!;
    expect(discBadge).toHaveClass('badge', 'badge-gray');
  });

  it('renders category pills (All + distinct categories) and filters on click', () => {
    renderScreen();
    const pills = screen.getByTestId('products-category-pills');
    // All + Yogurt + Pudding + Kefir (distinct, first-seen order).
    ['All', 'Yogurt', 'Pudding', 'Kefir'].forEach((cat) => {
      expect(within(pills).getByText(cat)).toBeInTheDocument();
    });
    // "All" is active by default (the prototype `.pill.on`).
    expect(within(pills).getByText('All')).toHaveClass('pill', 'on');

    // Filtering by "Yogurt" keeps the 2 yogurt rows and drops the others.
    fireEvent.click(within(pills).getByText('Yogurt'));
    expect(within(pills).getByText('Yogurt')).toHaveClass('on');
    const table = screen.getByTestId('products-table');
    expect(within(table).getByText('Strawberry Yogurt 150g')).toBeInTheDocument();
    expect(within(table).getByText('Mango Smoothie 250ml')).toBeInTheDocument();
    expect(within(table).queryByText('Vanilla Pudding 200g')).not.toBeInTheDocument();
    expect(screen.getByTestId('products-count')).toHaveTextContent('2 products');
  });

  it('filters the table by SKU/name via the search box', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText('Search SKU or name…'), {
      target: { value: 'pudding' },
    });
    const table = screen.getByTestId('products-table');
    expect(within(table).getByText('Vanilla Pudding 200g')).toBeInTheDocument();
    expect(within(table).queryByText('Strawberry Yogurt 150g')).not.toBeInTheDocument();
    expect(screen.getByTestId('products-count')).toHaveTextContent('1 products');
  });

  it('renders the empty-state when there are no products', () => {
    renderScreen({ products: [] });
    expect(screen.getByTestId('products-empty')).toHaveTextContent(
      'No products are configured yet.',
    );
    expect(screen.queryByTestId('products-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('products-category-pills')).not.toBeInTheDocument();
    expect(screen.getByTestId('products-count')).toHaveTextContent('0 products');
  });

  it('renders a filtered-empty-state when no row matches the search', () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText('Search SKU or name…'), {
      target: { value: 'does-not-exist' },
    });
    expect(screen.getByTestId('products-empty-filtered')).toHaveTextContent(
      'No products match the current filters.',
    );
    expect(screen.queryByTestId('products-table')).not.toBeInTheDocument();
  });

  it('disables the head actions unless the user can edit', () => {
    renderScreen({ canEdit: false });
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ New product' })).toBeDisabled();
    cleanup();
    renderScreen({ canEdit: true });
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '+ New product' })).toBeEnabled();
  });
});
