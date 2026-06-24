'use client';

import React from 'react';

import { PageHead, Section } from '../_components';
import type { ProductRow, ProductStatus } from './_actions/products';

/**
 * Products & SKUs settings screen.
 *
 * Prototype parity:
 * prototypes/design/Monopilot Design System/settings/data-screens.jsx:4-52
 * (ProductsScreen) — PageHead ("Import CSV" / "+ New product" actions) + a
 * Section whose head carries "{n} products" + category pills (left) and a
 * SKU/name search box (right), over a table (SKU, Name, Category, Unit, Weight,
 * BOM, Status) with status badges
 * (Active green / Development blue / Pilot amber / Discontinued gray).
 *
 * Built from the shared settings primitives (`PageHead`, `Section`) so the
 * `.sg-*` structure stays in parity with the prototype; tables/badges/pills use
 * the global classes from `apps/web/app/globals.css`. All data is real
 * (Supabase rows loaded server-side via `_actions/products.ts`); no mocks.
 */

export type ProductsScreenLabels = {
  title: string;
  subtitle: string;
  importCsv: string;
  newProduct: string;
  productCount: string; // ICU message with {count}
  searchPlaceholder: string;
  categoryAll: string;
  empty: string;
  emptyFiltered: string;
  columns: {
    sku: string;
    name: string;
    category: string;
    unit: string;
    weight: string;
    bom: string;
    status: string;
  };
  status: Record<ProductStatus, string>;
};

export type ProductsScreenProps = {
  products: ProductRow[];
  canEdit?: boolean;
  labels: ProductsScreenLabels;
  onImportCsv?: () => void;
  onNewProduct?: () => void;
};

const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/data-screens.jsx:4-52';

const ALL_CATEGORY = '__all__';

// Status → (badge class, glyph) — matches the prototype glyphs exactly.
const STATUS_BADGE: Record<ProductStatus, { className: string; glyph: string }> = {
  active: { className: 'badge badge-green', glyph: '●' },
  development: { className: 'badge badge-blue', glyph: '◔' },
  pilot: { className: 'badge badge-amber', glyph: '⚑' },
  discontinued: { className: 'badge badge-gray', glyph: '✕' },
};

function StatusBadge({ status, label }: { status: ProductStatus; label: string }) {
  const { className, glyph } = STATUS_BADGE[status];
  return (
    <span className={className} data-status={status}>
      {glyph} {label}
    </span>
  );
}

export default function ProductsScreen({
  products,
  canEdit = false,
  labels,
  onImportCsv,
  onNewProduct,
}: ProductsScreenProps) {
  const [category, setCategory] = React.useState<string>(ALL_CATEGORY);
  const [search, setSearch] = React.useState<string>('');

  // Distinct categories, in first-seen order, for the pill filter.
  const categories = React.useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const product of products) {
      if (!seen.has(product.category)) {
        seen.add(product.category);
        ordered.push(product.category);
      }
    }
    return ordered;
  }, [products]);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== ALL_CATEGORY && product.category !== category) return false;
      if (needle && !`${product.sku} ${product.name}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [products, category, search]);

  const productCountLabel = labels.productCount.replace('{count}', String(filtered.length));
  const hasAnyProducts = products.length > 0;

  return (
    <main
      aria-label={labels.title}
      className="mx-auto grid max-w-5xl gap-3 p-6"
      data-prototype-source={PROTOTYPE_SOURCE}
    >
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={
          <>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!canEdit}
              onClick={() => onImportCsv?.()}
            >
              {labels.importCsv}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canEdit}
              onClick={() => onNewProduct?.()}
            >
              {labels.newProduct}
            </button>
          </>
        }
      />

      <Section>
        {/* Toolbar — mirrors the prototype `.sg-section-head`: count + category
            pills on the left, SKU/name search on the right. */}
        <div
          className="sg-section-head"
          data-testid="products-toolbar"
          style={{ padding: 0, border: 0, marginBottom: 12 }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="sg-section-title" data-testid="products-count">
              {productCountLabel}
            </div>
            {hasAnyProducts ? (
              <div className="pills" data-testid="products-category-pills">
                <button
                  type="button"
                  className={`pill ${category === ALL_CATEGORY ? 'on' : ''}`}
                  aria-pressed={category === ALL_CATEGORY}
                  onClick={() => setCategory(ALL_CATEGORY)}
                >
                  {labels.categoryAll}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`pill ${category === cat ? 'on' : ''}`}
                    aria-pressed={category === cat}
                    onClick={() => setCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ width: 220 }}>
            <input
              type="search"
              aria-label={labels.searchPlaceholder}
              placeholder={labels.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {!hasAnyProducts ? (
          <div className="muted" data-testid="products-empty" role="status">
            {labels.empty}
          </div>
        ) : filtered.length === 0 ? (
          <div className="muted" data-testid="products-empty-filtered" role="status">
            {labels.emptyFiltered}
          </div>
        ) : (
          <table data-testid="products-table">
            <thead>
              <tr>
                <th>{labels.columns.sku}</th>
                <th>{labels.columns.name}</th>
                <th>{labels.columns.category}</th>
                <th>{labels.columns.unit}</th>
                <th>{labels.columns.weight}</th>
                <th>{labels.columns.bom}</th>
                <th>{labels.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td className="mono">{product.sku}</td>
                  <td style={{ fontWeight: 500 }}>{product.name}</td>
                  <td className="muted">{product.category}</td>
                  <td className="mono">{product.unit}</td>
                  <td className="mono num">{product.weight || '—'}</td>
                  <td>
                    {product.bomLink ? (
                      <span className="mono" style={{ color: 'var(--blue)' }}>
                        {product.bomLink}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={product.status} label={labels.status[product.status]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </main>
  );
}
