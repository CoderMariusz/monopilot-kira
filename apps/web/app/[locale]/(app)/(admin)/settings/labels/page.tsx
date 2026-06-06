import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import LabelsScreen, { type LabelsScreenLabels } from './labels-screen.client';
import { loadLabelTemplatesData } from './_actions/load-labels';
import {
  createLabelTemplate,
  duplicateLabelTemplate,
  updateLabelTemplate,
  type LabelTemplate,
  type LabelTemplateMutationResult,
  type LabelTemplateRow,
} from './_actions/label-templates';
import type { LabelTemplateElementsBlob } from './_actions/label-elements';

export const dynamic = 'force-dynamic';

type LabelsPageProps = {
  params?: Promise<{ locale: string }>;
  // Test/storybook injection. Production renders real Supabase data via
  // loadLabelTemplatesData() (withOrgContext / RLS) when no data props supplied.
  rows?: LabelTemplateRow[];
  state?: 'ready' | 'empty' | 'error';
  canEdit?: boolean;
};

async function buildLabels(locale: string): Promise<LabelsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.labels' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    importZpl: t('import_zpl'),
    newTemplate: t('new_template'),
    tableTitle: t('table_title'),
    duplicate: t('duplicate'),
    open: t('open'),
    emptyTitle: t('empty_title'),
    emptyBody: t('empty_body'),
    loadError: t('load_error'),
    permissionDenied: t('permission_denied'),
    actionError: t('action_error'),
    columns: {
      id: t('column_id'),
      name: t('column_name'),
      size: t('column_size'),
      usedOn: t('column_used_on'),
      updated: t('column_updated'),
      status: t('column_status'),
    },
    statusActive: t('status_active'),
    statusDraft: t('status_draft'),
    statusArchived: t('status_archived'),
    newTemplateName: t('new_template_name'),
    newTemplateSize: t('new_template_size'),
    editor: {
      breadcrumbSettings: t('editor.breadcrumb_settings'),
      breadcrumbList: t('editor.breadcrumb_list'),
      breadcrumbEdit: t('editor.breadcrumb_edit'),
      back: t('editor.back'),
      preview: t('editor.preview'),
      testPrint: t('editor.test_print'),
      save: t('editor.save'),
      saving: t('editor.saving'),
      saved: t('editor.saved'),
      saveError: t('editor.save_error'),
      permissionDenied: t('editor.permission_denied'),
      addElement: t('editor.add_element'),
      paletteText: t('editor.palette_text'),
      paletteBarcode: t('editor.palette_barcode'),
      paletteQr: t('editor.palette_qr'),
      paletteBox: t('editor.palette_box'),
      dataFields: t('editor.data_fields'),
      canvas: t('editor.canvas'),
      canvasHint: t('editor.canvas_hint'),
      elementText: t('editor.element_text'),
      elementBarcode: t('editor.element_barcode'),
      elementQr: t('editor.element_qr'),
      elementBox: t('editor.element_box'),
      delete: t('editor.delete'),
      posX: t('editor.pos_x'),
      posY: t('editor.pos_y'),
      width: t('editor.width'),
      height: t('editor.height'),
      dataField: t('editor.data_field'),
      previewValue: t('editor.preview_value'),
      fontSize: t('editor.font_size'),
      weight: t('editor.weight'),
      weightRegular: t('editor.weight_regular'),
      weightBold: t('editor.weight_bold'),
      monospace: t('editor.monospace'),
      symbology: t('editor.symbology'),
      templateSettings: t('editor.template_settings'),
      widthMm: t('editor.width_mm'),
      heightMm: t('editor.height_mm'),
      targetPrinter: t('editor.target_printer'),
      usedOn: t('editor.used_on'),
      inspectorEmptyHint: t('editor.inspector_empty_hint'),
      lastSaved: t('editor.last_saved'),
    },
  };
}

/** Fetch one full template (incl. the elements jsonb) for the editor. */
async function getTemplateById(id: string): Promise<LabelTemplate | null> {
  'use server';

  type Row = {
    id: string;
    org_id: string;
    name: string;
    size: string;
    used_on: string | null;
    elements: unknown;
    status: 'draft' | 'active' | 'archived';
    created_at: string | Date;
    updated_at: string | Date;
  };

  try {
    return await withOrgContext<LabelTemplate | null>(async (ctx) => {
      const context = ctx as { client: { query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> } };
      const { rows } = await context.client.query<Row>(
        `select id::text, org_id::text, name, size, used_on, elements, status, created_at, updated_at
           from public.label_templates
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      const toIso = (value: string | Date) => (value instanceof Date ? value.toISOString() : String(value));
      return {
        id: row.id,
        org_id: row.org_id,
        name: row.name,
        size: row.size,
        used_on: row.used_on ?? '',
        elements: (row.elements ?? []) as LabelTemplate['elements'],
        status: row.status,
        created_at: toIso(row.created_at),
        updated_at: toIso(row.updated_at),
      };
    });
  } catch {
    return null;
  }
}

async function createTemplateAction(input: { name: string; size: string }): Promise<LabelTemplateMutationResult> {
  'use server';
  return createLabelTemplate({ name: input.name, size: input.size, status: 'draft', elements: [] });
}

async function duplicateTemplateAction(id: string): Promise<LabelTemplateMutationResult> {
  'use server';
  return duplicateLabelTemplate(id);
}

async function updateTemplateAction(
  id: string,
  input: { elements: LabelTemplateElementsBlob },
): Promise<LabelTemplateMutationResult> {
  'use server';
  return updateLabelTemplate(id, { elements: input.elements as unknown as Record<string, unknown> });
}

export default async function LabelsSettingsPage(propsInput: LabelsPageProps = {}) {
  const { locale } = (await propsInput.params) ?? { locale: 'en' };
  const labels = await buildLabels(locale);

  const hasInjectedData =
    Object.prototype.hasOwnProperty.call(propsInput, 'rows') || propsInput.state !== undefined;

  if (hasInjectedData) {
    const rows = propsInput.rows ?? [];
    return (
      <LabelsScreen
        rows={rows}
        state={propsInput.state ?? (rows.length === 0 ? 'empty' : 'ready')}
        canEdit={propsInput.canEdit ?? false}
        labels={labels}
      />
    );
  }

  const loaded = await loadLabelTemplatesData();

  return (
    <LabelsScreen
      rows={loaded.templates}
      state={loaded.state}
      canEdit={loaded.canEdit}
      labels={labels}
      createTemplate={loaded.canEdit ? createTemplateAction : undefined}
      duplicateTemplate={loaded.canEdit ? duplicateTemplateAction : undefined}
      updateTemplate={loaded.canEdit ? updateTemplateAction : undefined}
      getTemplate={getTemplateById}
    />
  );
}
