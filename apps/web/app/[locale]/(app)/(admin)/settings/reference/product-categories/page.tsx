import { getTranslations } from 'next-intl/server';

import { createProductCategory } from '../../../../../../../actions/reference/product-categories/create';
import { listProductCategories } from '../../../../../../../actions/reference/product-categories/list';
import { updateProductCategory } from '../../../../../../../actions/reference/product-categories/update';
import ProductCategoriesScreen, {
  type ProductCategoriesScreenLabels,
  type ProductCategoryRow,
} from './product-categories-screen.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

const LABEL_KEYS = [
  'breadcrumb_settings',
  'breadcrumb_reference_tables',
  'breadcrumb_product_categories',
  'set_reference',
  'title',
  'subtitle',
  'notice',
  'loading',
  'error',
  'permission_denied',
  'add_new',
  'show_inactive',
  'column_code',
  'column_label',
  'column_display_order',
  'column_status',
  'column_actions',
  'status_active',
  'status_inactive',
  'edit_category',
  'deactivate_category',
  'activate_category',
  'empty',
  'add_dialog_title',
  'field_code',
  'field_label',
  'field_display_order',
  'field_active',
  'create',
  'creating',
  'duplicate_code',
  'create_failed',
  'cancel',
  'edit_dialog_title',
  'save',
  'saving',
  'update_failed',
  'immutable_field',
  'deactivate_dialog_title',
  'deactivate_dialog_body',
  'activate_dialog_title',
  'activate_dialog_body',
  'confirm_deactivate',
  'confirm_activate',
  'toggling',
  'toggle_failed',
] as const;

type LabelKey = (typeof LABEL_KEYS)[number];
type LabelCamelKey = keyof ProductCategoriesScreenLabels;

const LABEL_MAP: Record<LabelKey, LabelCamelKey> = {
  breadcrumb_settings: 'breadcrumbSettings',
  breadcrumb_reference_tables: 'breadcrumbReferenceTables',
  breadcrumb_product_categories: 'breadcrumbProductCategories',
  set_reference: 'setReference',
  title: 'title',
  subtitle: 'subtitle',
  notice: 'notice',
  loading: 'loading',
  error: 'error',
  permission_denied: 'permissionDenied',
  add_new: 'addNew',
  show_inactive: 'showInactive',
  column_code: 'columnCode',
  column_label: 'columnLabel',
  column_display_order: 'columnDisplayOrder',
  column_status: 'columnStatus',
  column_actions: 'columnActions',
  status_active: 'statusActive',
  status_inactive: 'statusInactive',
  edit_category: 'editCategory',
  deactivate_category: 'deactivateCategory',
  activate_category: 'activateCategory',
  empty: 'empty',
  add_dialog_title: 'addDialogTitle',
  field_code: 'fieldCode',
  field_label: 'fieldLabel',
  field_display_order: 'fieldDisplayOrder',
  field_active: 'fieldActive',
  create: 'create',
  creating: 'creating',
  duplicate_code: 'duplicateCode',
  create_failed: 'createFailed',
  cancel: 'cancel',
  edit_dialog_title: 'editDialogTitle',
  save: 'save',
  saving: 'saving',
  update_failed: 'updateFailed',
  immutable_field: 'immutableField',
  deactivate_dialog_title: 'deactivateDialogTitle',
  deactivate_dialog_body: 'deactivateDialogBody',
  activate_dialog_title: 'activateDialogTitle',
  activate_dialog_body: 'activateDialogBody',
  confirm_deactivate: 'confirmDeactivate',
  confirm_activate: 'confirmActivate',
  toggling: 'toggling',
  toggle_failed: 'toggleFailed',
};

const EN_LABEL_FALLBACKS: Record<LabelKey, string> = {
  breadcrumb_settings: 'Settings',
  breadcrumb_reference_tables: 'Reference Tables',
  breadcrumb_product_categories: 'Product categories',
  set_reference: 'SET-REFERENCE / W5-T7',
  title: 'Product categories',
  subtitle: 'Org-scoped NPD and Technical item categories — code, label, display order, and active state.',
  notice: 'Categories feed the NPD project wizard, project brief, and Technical item master. Codes are immutable after creation; deactivate instead of deleting.',
  loading: 'Loading product categories…',
  error: 'Unable to load product categories.',
  permission_denied: 'You do not have permission to manage product categories.',
  add_new: 'Add category',
  show_inactive: 'Show inactive',
  column_code: 'Code',
  column_label: 'Label',
  column_display_order: 'Order',
  column_status: 'Status',
  column_actions: 'Actions',
  status_active: 'Active',
  status_inactive: 'Inactive',
  edit_category: 'Edit {category}',
  deactivate_category: 'Deactivate {category}',
  activate_category: 'Activate {category}',
  empty: 'No product categories match the current filters.',
  add_dialog_title: 'Add product category',
  field_code: 'Code',
  field_label: 'Label',
  field_display_order: 'Display order',
  field_active: 'Active',
  create: 'Create',
  creating: 'Creating…',
  duplicate_code: 'A category with this code already exists.',
  create_failed: 'Unable to create product category.',
  cancel: 'Cancel',
  edit_dialog_title: 'Edit product category',
  save: 'Save',
  saving: 'Saving…',
  update_failed: 'Unable to update product category.',
  immutable_field: 'Category code is immutable after creation.',
  deactivate_dialog_title: 'Deactivate product category',
  deactivate_dialog_body: 'Deactivate "{category}"? It will no longer appear in NPD or item pickers. Existing records keep their stored value.',
  activate_dialog_title: 'Activate product category',
  activate_dialog_body: 'Activate "{category}" so it appears in NPD and item pickers again.',
  confirm_deactivate: 'Deactivate',
  confirm_activate: 'Activate',
  toggling: 'Saving…',
  toggle_failed: 'Unable to update category status.',
};

async function buildLabels(locale: string): Promise<ProductCategoriesScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.product_categories' });
  const has = typeof t.has === 'function' ? t.has.bind(t) : null;
  return LABEL_KEYS.reduce((acc, key) => {
    acc[LABEL_MAP[key]] = has?.(key) ? t(key) : EN_LABEL_FALLBACKS[key];
    return acc;
  }, {} as ProductCategoriesScreenLabels);
}

function normalizeRows(rows: ProductCategoryRow[]): ProductCategoryRow[] {
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    is_active: row.is_active,
    display_order: row.display_order,
  }));
}

async function addCategory(input: { code: string; label: string; displayOrder: number; isActive: boolean }) {
  'use server';
  return createProductCategory({
    code: input.code,
    label: input.label,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
  });
}

async function editCategory(input: { id: string; label?: string; displayOrder?: number; isActive?: boolean }) {
  'use server';
  const result = await updateProductCategory(input);
  if (!result.ok) return result;
  return { ok: true as const, data: normalizeRows([result.data])[0]! };
}

export default async function ProductCategoriesPage({ params }: PageProps) {
  const { locale } = await params;
  const labels = await buildLabels(locale);
  const result = await listProductCategories({ includeInactive: true });

  if (result.ok === false) {
    return (
      <ProductCategoriesScreen
        labels={labels}
        categories={[]}
        error={result.error === 'forbidden' ? null : labels.error}
        canManage={result.error === 'forbidden' ? false : true}
        createCategory={addCategory}
        updateCategory={editCategory}
      />
    );
  }

  return (
    <ProductCategoriesScreen
      labels={labels}
      categories={normalizeRows(result.data)}
      createCategory={addCategory}
      updateCategory={editCategory}
    />
  );
}
