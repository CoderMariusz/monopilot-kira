import { getTranslations } from 'next-intl/server';

import { getProducts } from './_actions/products';
import ProductsScreen, { type ProductsScreenLabels } from './products-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

async function buildLabels(locale: string): Promise<ProductsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.products' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    importCsv: t('import_csv'),
    newProduct: t('new_product'),
    productCount: t('product_count'),
    searchPlaceholder: t('search_placeholder'),
    categoryAll: t('category_all'),
    empty: t('empty'),
    emptyFiltered: t('empty_filtered'),
    columns: {
      sku: t('column_sku'),
      name: t('column_name'),
      category: t('column_category'),
      unit: t('column_unit'),
      weight: t('column_weight'),
      bom: t('column_bom'),
      status: t('column_status'),
    },
    status: {
      active: t('status_active'),
      development: t('status_development'),
      pilot: t('status_pilot'),
      discontinued: t('status_discontinued'),
    },
  };
}

export default async function ProductsSettingsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };

  // `getProducts` loads org-scoped rows via `withOrgContext` (RLS) and already
  // swallows load failures into an empty array, which the screen renders as its
  // empty-state — so no separate error branch is needed here.
  const [labels, products] = await Promise.all([buildLabels(locale), getProducts()]);

  return <ProductsScreen products={products} labels={labels} />;
}
