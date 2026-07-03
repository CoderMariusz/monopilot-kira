'use server';

import { AuthError, ValidationError } from '../../fa/actions/errors';
import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { deptCodeToCloseDept } from '../../../../lib/npd/stage-routes';
import {
  STAGE_DEPT_SECTIONS_READ_PERMISSION,
  type StageDeptField,
  type StageDeptSection,
  type StageDeptSectionsResult,
  type StageRequiredFieldsStatus,
} from './load-stage-dept-sections.types';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type CatalogRow = {
  dept_code: string | null;
  dept_name: string | null;
  dept_display_order: number | null;
  field_code: string | null;
  field_label: string | null;
  field_data_type: StageDeptField['dataType'] | string | null;
  df_required: boolean | null;
  df_display_order: number | null;
  field_is_auto: boolean | null;
  field_auto_source: string | null;
  dropdown_source: string | null;
};

type ProjectRow = { product_code: string | null };

const ALLOWED_STAGES = new Set([
  'brief',
  'recipe',
  'packaging',
  'costing_nutrition',
  'trial',
  'sensory',
  'pilot',
  'approval',
  'handoff',
]);

const DROPDOWN_SOURCE_TABLE: Record<string, { table: string; valueColumn: string }> = {
  PackSizes: { table: 'PackSizes', valueColumn: 'value' },
  Templates: { table: 'Templates', valueColumn: 'template_name' },
  Lines_By_PackSize: { table: 'Lines_By_PackSize', valueColumn: 'line' },
  Equipment_Setup_By_Line_Pack: { table: 'Equipment_Setup_By_Line_Pack', valueColumn: 'equipment_setup' },
  CloseConfirm: { table: 'CloseConfirm', valueColumn: 'value' },
  ManufacturingOperations: { table: 'ManufacturingOperations', valueColumn: 'operation_name' },
  Suppliers: { table: 'Suppliers', valueColumn: 'value' },
};

function normalizeProjectId(projectId: string): string {
  const normalized = (projectId ?? '').trim();
  if (!normalized) throw new ValidationError('INVALID_PROJECT_ID', 'projectId is required');
  return normalized;
}

function normalizeStage(stage: string): string {
  const normalized = (stage ?? '').trim().toLowerCase();
  if (!ALLOWED_STAGES.has(normalized)) throw new ValidationError('INVALID_STAGE', 'Unsupported NPD stage');
  return normalized;
}

async function resolveProjectProductCode(ctx: OrgContextLike, projectId: string): Promise<string | null> {
  const { rows } = await ctx.client.query<ProjectRow>(
    `select p.product_code
       from public.npd_projects p
      where p.id = $1::uuid
        and p.org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  if (rows.length === 0) throw new ValidationError('PROJECT_NOT_FOUND', 'Project is not visible in the current organization');
  return rows[0]?.product_code ?? null;
}

async function readCatalogRows(ctx: OrgContextLike, stage: string): Promise<CatalogRow[]> {
  const { rows } = await ctx.client.query<CatalogRow>(
    `select
        d.code                 as dept_code,
        d.name                 as dept_name,
        d.display_order        as dept_display_order,
        f.code                 as field_code,
        f.label                as field_label,
        f.data_type            as field_data_type,
        coalesce(f.is_auto, false) as field_is_auto,
        f.auto_source_field    as field_auto_source,
        f.dropdown_source      as dropdown_source,
        df.required            as df_required,
        df.display_order       as df_display_order
       from public.npd_departments d
       join public.npd_department_field df
         on df.department_id = d.id
        and df.org_id = d.org_id
       join public.npd_field_catalog f
         on f.id = df.field_id
        and f.org_id = df.org_id
      where d.org_id = app.current_org_id()
        and d.active = true
        and d.stage_code = $1::text
        and df.visible = true
        and f.active = true
      order by d.display_order asc, d.code asc, df.display_order asc, f.code asc`,
    [stage],
  );
  return rows;
}

async function readProductValues(
  ctx: OrgContextLike,
  productCode: string | null,
): Promise<Record<string, unknown>> {
  if (!productCode) return {};
  const { rows } = await ctx.client.query<{ product_json: Record<string, unknown> | null }>(
    `select to_jsonb(p.*) as product_json
       from public.product p
      where p.org_id = app.current_org_id()
        and p.product_code = $1::text
      limit 1`,
    [productCode],
  );
  return rows[0]?.product_json ?? {};
}

async function readDropdowns(
  ctx: OrgContextLike,
  rows: CatalogRow[],
): Promise<Record<string, string[]>> {
  const sources = new Set<string>();
  for (const row of rows) {
    const source = (row.dropdown_source ?? '').trim();
    if (source && DROPDOWN_SOURCE_TABLE[source]) sources.add(source);
  }

  const result: Record<string, string[]> = {};
  for (const source of sources) {
    const mapping = DROPDOWN_SOURCE_TABLE[source]!;
    const { rows: optionRows } = await ctx.client.query<{ value: string | null }>(
      `select ${mapping.valueColumn} as value
         from "Reference"."${mapping.table}"
        where org_id = app.current_org_id()
        order by ${mapping.valueColumn}`,
    );
    result[source] = optionRows
      .map((row) => (row.value == null ? '' : String(row.value)))
      .filter((value) => value.trim() !== '');
  }
  return result;
}

function normalizeDataType(value: string | null | undefined): StageDeptField['dataType'] {
  const normalized = (value ?? 'text').trim().toLowerCase();
  switch (normalized) {
    case 'number':
    case 'integer':
    case 'boolean':
    case 'date':
    case 'datetime':
    case 'dropdown':
    case 'formula':
    case 'json':
      return normalized;
    default:
      return 'text';
  }
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function buildSections(
  rows: CatalogRow[],
  productCode: string | null,
  values: Record<string, unknown>,
  dropdowns: Record<string, string[]>,
): StageDeptSection[] {
  const noFgLinked = productCode === null;
  const byDept = new Map<string, StageDeptSection>();

  for (const row of rows) {
    const deptCode = (row.dept_code ?? '').trim();
    const fieldCode = (row.field_code ?? '').trim().toLowerCase();
    if (!deptCode || !fieldCode) continue;

    let section = byDept.get(deptCode);
    if (!section) {
      section = {
        key: deptCode.toLowerCase(),
        label: (row.dept_name ?? deptCode).trim() || deptCode,
        deptCode,
        closeDeptValue: deptCodeToCloseDept(deptCode),
        readOnly: noFgLinked,
        no_fg_linked: noFgLinked ? true : undefined,
        fields: [],
      };
      byDept.set(deptCode, section);
    }

    const auto = row.field_is_auto === true;
    const autoSourceField =
      auto && (row.field_auto_source ?? '').trim() !== ''
        ? (row.field_auto_source as string).trim().toLowerCase()
        : undefined;
    const dataType = normalizeDataType(row.field_data_type);
    const value = autoSourceField && autoSourceField in values ? values[autoSourceField] : values[fieldCode];
    const dropdownSource = (row.dropdown_source ?? '').trim();
    section.fields.push({
      code: fieldCode,
      label: (row.field_label ?? fieldCode).trim() || fieldCode,
      dataType,
      required: row.df_required === true,
      deptCode,
      displayOrder: Number(row.df_display_order ?? 0),
      value: value ?? null,
      readOnly: noFgLinked || auto || dataType === 'formula',
      auto: auto || undefined,
      autoSourceField,
      dropdownOptions: dropdownSource ? dropdowns[dropdownSource] ?? [] : undefined,
    });
  }

  return [...byDept.values()].map((section) => {
    const fields = section.fields.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.code.localeCompare(b.code);
    });
    const requiredFields = fields.filter((field) => field.required);
    const allRequiredFilled =
      requiredFields.length === 0 || requiredFields.every((field) => isFilled(field.value));
    return {
      ...section,
      fields,
      allRequiredFilled,
    };
  });
}

async function loadStageDeptSectionsInContext(
  ctx: OrgContextLike,
  projectId: string,
  stage: string,
): Promise<StageDeptSectionsResult> {
  if (!(await hasPermission(ctx, STAGE_DEPT_SECTIONS_READ_PERMISSION))) {
    throw new AuthError(
      'FORBIDDEN',
      `${STAGE_DEPT_SECTIONS_READ_PERMISSION} is required to read stage department fields`,
    );
  }

  const [productCode, catalogRows] = await Promise.all([
    resolveProjectProductCode(ctx, projectId),
    readCatalogRows(ctx, stage),
  ]);
  const [values, dropdowns] = await Promise.all([
    readProductValues(ctx, productCode),
    readDropdowns(ctx, catalogRows),
  ]);
  const sections = buildSections(catalogRows, productCode, values, dropdowns);

  return {
    ok: true,
    projectId,
    stage,
    productCode,
    no_fg_linked: productCode === null ? true : undefined,
    sections,
  };
}

export async function loadStageDeptSections(input: {
  projectId: string;
  stage: string;
}): Promise<StageDeptSectionsResult> {
  const projectId = normalizeProjectId(input.projectId);
  const stage = normalizeStage(input.stage);

  return withOrgContext<StageDeptSectionsResult>(async (rawCtx) =>
    loadStageDeptSectionsInContext(rawCtx as OrgContextLike, projectId, stage),
  );
}

export async function getStageRequiredFieldsStatus(
  projectIdInput: string,
  stageInput: string,
): Promise<StageRequiredFieldsStatus> {
  const projectId = normalizeProjectId(projectIdInput);
  const stage = normalizeStage(stageInput);

  return withOrgContext<StageRequiredFieldsStatus>(async (rawCtx) => {
    const loaded = await loadStageDeptSectionsInContext(rawCtx as OrgContextLike, projectId, stage);
    const requiredFields = loaded.sections.flatMap((section) =>
      section.fields.filter((field) => field.required),
    );
    const missing = requiredFields
      .filter((field) => !isFilled(field.value))
      .map((field) => ({ deptCode: field.deptCode, fieldCode: field.code, label: field.label }));
    return {
      requiredTotal: requiredFields.length,
      requiredFilled: requiredFields.length - missing.length,
      missing,
    };
  });
}
