import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { getDepartmentFieldConfig } from './_actions/get-department-field-config';
import { listFieldCatalog } from './_actions/npd-field-config';
import NpdFieldsScreen, { type NpdFieldsScreenLabels } from './npd-fields-screen.client';

export const dynamic = 'force-dynamic';

const EDIT_PERMISSION = 'npd.schema.edit';

type PageProps = {
  params?: Promise<{ locale: string }>;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

async function canEditNpdSchema(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, EDIT_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

async function buildLabels(locale: string): Promise<NpdFieldsScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.npdFields' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    departmentsTitle: t('departments_title'),
    departmentsSubtitle: t('departments_subtitle'),
    selectedDepartment: t('selected_department'),
    assignedFieldsTitle: t('assigned_fields_title'),
    assignedFieldsSubtitle: t('assigned_fields_subtitle'),
    assignField: t('assign_field'),
    assignFieldPlaceholder: t('assign_field_placeholder'),
    assign: t('assign'),
    emptyDepartments: t('empty_departments'),
    emptyFields: t('empty_fields'),
    readOnlyNotice: t('read_only_notice'),
    active: t('active'),
    inactive: t('inactive'),
    remove: t('remove'),
    saving: t('saving'),
    error: t('error'),
    newField: t('new_field'),
    newDepartment: t('new_department'),
    editAction: t('edit_action'),
    save: t('save'),
    cancel: t('cancel'),
    create: t('create'),
    fieldCode: t('field_code'),
    fieldLabel: t('field_label'),
    fieldDepartment: t('field_department'),
    fieldDataType: t('field_data_type'),
    fieldRequired: t('field_required'),
    fieldHelpText: t('field_help_text'),
    departmentCode: t('department_code'),
    departmentName: t('department_name'),
    departmentDescription: t('department_description'),
    newFieldTitle: t('new_field_title'),
    newDepartmentTitle: t('new_department_title'),
    editFieldTitle: t('edit_field_title'),
    editDepartmentTitle: t('edit_department_title'),
    dataTypeText: t('data_type_text'),
    dataTypeNumber: t('data_type_number'),
    dataTypeDate: t('data_type_date'),
    deleteDepartmentUnavailable: t('delete_department_unavailable'),
    fieldAuto: t('field_auto'),
    fieldAutoHint: t('field_auto_hint'),
    fieldAutoSource: t('field_auto_source'),
    fieldAutoSourcePlaceholder: t('field_auto_source_placeholder'),
    autoBadge: t('auto_badge'),
    autoFrom: t('auto_from'),
    autoSourceErrors: {
      auto_source_self: t('auto_source_self'),
      auto_source_not_found: t('auto_source_not_found'),
      auto_source_cycle: t('auto_source_cycle'),
      auto_source_required: t('auto_source_required'),
    },
    columns: {
      field: t('column_field'),
      dataType: t('column_data_type'),
      required: t('column_required'),
      visible: t('column_visible'),
      stage: t('column_stage'),
      order: t('column_order'),
      actions: t('column_actions'),
    },
    stages: {
      brief: t('stage_brief'),
      recipe: t('stage_recipe'),
      packaging: t('stage_packaging'),
      trial: t('stage_trial'),
      sensory: t('stage_sensory'),
      pilot: t('stage_pilot'),
      approval: t('stage_approval'),
      handoff: t('stage_handoff'),
    },
  };
}

export default async function NpdFieldsSettingsPage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };

  // No prototype anchor — net-new admin screen; match existing settings screen structure
  const [labels, departments, fieldCatalog, canEdit] = await Promise.all([
    buildLabels(locale),
    getDepartmentFieldConfig(),
    listFieldCatalog(),
    canEditNpdSchema(),
  ]);

  return (
    <NpdFieldsScreen
      departments={departments}
      fieldCatalog={fieldCatalog}
      canEdit={canEdit}
      labels={labels}
    />
  );
}
