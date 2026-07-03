'use server';

import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { isLegacyProcessColumn } from '../../../[locale]/(app)/(npd)/fg/[productCode]/_components/legacy-process-column';
import type {
  FaProductionColumn,
  OperationOption,
  ProdDetailRow,
} from '../../../[locale]/(app)/(npd)/fg/[productCode]/_components/fa-production-tab';
import type { ComponentProcess, ComponentProcessBundle } from '../actions/map-definition-process-chain';
import { getComponentProcesses } from '../actions/get-component-processes';
import { listManufacturingOperations } from '../../../../actions/reference/manufacturing-ops/list';
import {
  addWipProcess,
  removeWipProcess,
  saveWipProcessRoles,
  updateWipProcess,
} from '../actions/wip-process-actions';
import { getProcessDefault } from '../../../[locale]/(app)/(admin)/settings/process-defaults/_actions/process-defaults-actions';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type DeptColumnRow = {
  column_key: string;
  physical_column: string;
  field_type: string | null;
  data_type: string | null;
  required_for_done: boolean | null;
  dropdown_source: string | null;
  blocking_rule: string | null;
  display_order: number | null;
  is_auto: boolean | null;
  auto_source_field: string | null;
};

const AUTO_DERIVED_KEYS = new Set<string>([
  'ingredient_codes',
  'dieset',
  'pr_code_p1',
  'pr_code_p2',
  'pr_code_p3',
  'pr_code_p4',
  'pr_code_final',
]);
const READONLY_ID_KEYS = new Set<string>(['product_code']);

const DROPDOWN_SOURCE_TABLE: Record<string, { table: string; valueColumn: string }> = {
  PackSizes: { table: 'PackSizes', valueColumn: 'value' },
  Templates: { table: 'Templates', valueColumn: 'template_name' },
  Lines_By_PackSize: { table: 'Lines_By_PackSize', valueColumn: 'line' },
  Equipment_Setup_By_Line_Pack: { table: 'Equipment_Setup_By_Line_Pack', valueColumn: 'equipment_setup' },
  CloseConfirm: { table: 'CloseConfirm', valueColumn: 'value' },
  ManufacturingOperations: { table: 'ManufacturingOperations', valueColumn: 'operation_name' },
  Suppliers: { table: 'Suppliers', valueColumn: 'value' },
};

function mapDeptColumn(row: DeptColumnRow, index: number): FaProductionColumn {
  const key = row.physical_column;
  const hasDropdown = !!row.dropdown_source && row.dropdown_source.trim() !== '';
  const ft = (row.data_type ?? row.field_type ?? 'string').toLowerCase();
  const dataType: FaProductionColumn['dataType'] = hasDropdown
    ? 'dropdown'
    : ft === 'number' || ft === 'integer'
      ? 'number'
      : ft === 'date' || ft === 'datetime' || ft === 'date-time'
        ? 'date'
        : ft === 'boolean'
          ? 'boolean'
          : ft === 'formula'
            ? 'formula'
            : 'text';
  const catalogAuto = row.is_auto === true;
  const auto = catalogAuto || AUTO_DERIVED_KEYS.has(key);
  const readOnly = auto || READONLY_ID_KEYS.has(key) || dataType === 'formula';
  return {
    key,
    dataType,
    required: row.required_for_done === true,
    readOnly,
    auto: auto || undefined,
    dropdownSource: hasDropdown ? (row.dropdown_source as string) : undefined,
    displayOrder: row.display_order ?? index,
  };
}

async function readDeptColumns(ctx: OrgContextLike, deptCode: string): Promise<FaProductionColumn[]> {
  const { rows } = await ctx.client.query<DeptColumnRow>(
    `select lower(f.code)          as physical_column,
            f.code                 as column_key,
            null::text             as field_type,
            f.data_type            as data_type,
            df.required            as required_for_done,
            f.dropdown_source      as dropdown_source,
            f.blocking_rule        as blocking_rule,
            df.display_order       as display_order,
            coalesce(f.is_auto, false) as is_auto,
            f.auto_source_field    as auto_source_field
       from public.npd_departments d
       join public.npd_department_field df on df.department_id = d.id and df.org_id = d.org_id and df.visible = true
       join public.npd_field_catalog f on f.id = df.field_id and f.org_id = df.org_id and f.active = true
      where d.org_id = app.current_org_id() and lower(d.code) = lower($1::text) and d.active = true
      order by df.display_order asc nulls last, f.code asc`,
    [deptCode],
  );
  return rows.map((row, i) => mapDeptColumn(row, i));
}

async function readProductValues(ctx: OrgContextLike, productCode: string): Promise<Record<string, unknown>> {
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

async function readProdDetailRows(ctx: OrgContextLike, productCode: string): Promise<ProdDetailRow[]> {
  const { rows } = await ctx.client.query<{ pd_json: Record<string, unknown> }>(
    `select to_jsonb(pd.*) as pd_json
       from public.prod_detail pd
      where pd.org_id = app.current_org_id()
        and pd.product_code = $1
      order by pd.component_index asc`,
    [productCode],
  );
  return rows.map((r) => {
    const json = r.pd_json ?? {};
    const id = String(json.id ?? json.component_index ?? '');
    const componentIndex = Number(json.component_index ?? 0);
    const weight = json.component_weight;
    return {
      id,
      componentIndex,
      intermediateCode: String(json.intermediate_code ?? ''),
      componentWeight: weight === null || weight === undefined ? null : Number(weight),
      v06Status: 'warn' as const,
      values: json,
    };
  });
}

async function readDropdowns(
  ctx: OrgContextLike,
  columns: FaProductionColumn[],
): Promise<Record<string, string[]>> {
  const sources = new Set<string>();
  for (const col of columns) {
    if (col.dropdownSource) sources.add(col.dropdownSource);
  }
  const result: Record<string, string[]> = {};
  for (const source of sources) {
    const mapping = DROPDOWN_SOURCE_TABLE[source];
    if (!mapping) continue;
    const { rows } = await ctx.client.query<{ value: string | null }>(
      `select ${mapping.valueColumn} as value
         from "Reference"."${mapping.table}"
        where org_id = app.current_org_id()
        order by ${mapping.valueColumn}`,
    );
    result[source] = rows
      .map((row) => (row.value == null ? '' : String(row.value)))
      .filter((value) => value.trim() !== '');
  }
  return result;
}

async function loadComponentProcesses(
  prodRows: ProdDetailRow[],
): Promise<Record<string, ComponentProcess[] | ComponentProcessBundle>> {
  const map: Record<string, ComponentProcess[] | ComponentProcessBundle> = {};
  const results = await Promise.all(
    prodRows.map(async (row) => {
      try {
        const res = await getComponentProcesses(row.id);
        if (!res.ok) return { id: row.id, data: [] as ComponentProcess[] };
        if (res.readOnly) {
          return {
            id: row.id,
            data: {
              processes: res.data,
              readOnly: true,
              definitionId: res.definitionId,
              definitionName: res.definitionName,
            } satisfies ComponentProcessBundle,
          };
        }
        return { id: row.id, data: res.data };
      } catch {
        return { id: row.id, data: [] as ComponentProcess[] };
      }
    }),
  );
  for (const r of results) map[r.id] = r.data;
  return map;
}

async function loadOperationOptions(): Promise<OperationOption[]> {
  try {
    const res = await listManufacturingOperations({});
    if (!res.ok) return [];
    return res.data.map((op) => ({ id: op.id, operationName: op.operation_name }));
  } catch {
    return [];
  }
}

export type FormulationWipPanelData =
  | { state: 'no_fg_linked' }
  | {
      state: 'ready';
      productCode: string;
      packSizeFilled: boolean;
      columns: FaProductionColumn[];
      rows: ProdDetailRow[];
      dropdowns: Record<string, string[]>;
      componentProcesses: Record<string, ComponentProcess[] | ComponentProcessBundle>;
      operationOptions: OperationOption[];
      canWrite: boolean;
      actions: {
        onAddProcess: typeof addWipProcess;
        onUpdateProcess: typeof updateWipProcess;
        onRemoveProcess: typeof removeWipProcess;
        onSaveProcessRoles: typeof saveWipProcessRoles;
        onGetProcessDefault: typeof getProcessDefault;
      };
    };

export async function loadFormulationWipPanel(projectId: string): Promise<FormulationWipPanelData> {
  return withOrgContext<FormulationWipPanelData>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    const { rows } = await ctx.client.query<{ product_code: string | null }>(
      `select product_code
         from public.npd_projects
        where id = $1::uuid
          and org_id = app.current_org_id()
        limit 1`,
      [projectId],
    );
    const productCode = rows[0]?.product_code ?? null;
    if (!productCode) return { state: 'no_fg_linked' };

    const [values, production, prodRows, canWrite] = await Promise.all([
      readProductValues(ctx, productCode),
      readDeptColumns(ctx, 'Production'),
      readProdDetailRows(ctx, productCode),
      hasPermission(ctx, 'npd.production.write'),
    ]);

    const productionFiltered = production.filter((col) => !isLegacyProcessColumn(col.key));
    const dropdowns = await readDropdowns(ctx, productionFiltered);
    const [componentProcesses, operationOptions] = await Promise.all([
      loadComponentProcesses(prodRows),
      loadOperationOptions(),
    ]);

    return {
      state: 'ready',
      productCode,
      packSizeFilled: String(values.pack_size ?? '').trim() !== '',
      columns: productionFiltered,
      rows: prodRows,
      dropdowns,
      componentProcesses,
      operationOptions,
      canWrite,
      actions: {
        onAddProcess: addWipProcess,
        onUpdateProcess: updateWipProcess,
        onRemoveProcess: removeWipProcess,
        onSaveProcessRoles: saveWipProcessRoles,
        onGetProcessDefault: getProcessDefault,
      },
    };
  });
}
