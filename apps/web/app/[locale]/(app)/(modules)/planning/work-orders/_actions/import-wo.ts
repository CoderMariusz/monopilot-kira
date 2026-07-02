'use server';

import {
  snapshotFromItemRow,
  toBaseQty,
  TypedError,
  type OutputUom,
} from '../../../../../../../lib/uom/convert';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { createWorkOrderCore } from './create-work-order-core';
import {
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  type OrgActionContext,
  type QueryClient,
} from './shared';

export type WoImportRow = {
  external_ref: string;
  fg_code: string;
  qty: number;
  uom: string;
  planned_date?: string;
  line_code?: string;
  priority?: string;
};

export type WoImportError = { column: string; message: string };

export type WoImportConversion = {
  enteredQty: string;
  enteredUom: string;
  baseQty: string;
  baseUom: string;
  display: string;
};

export type WoValidationResult = {
  rows: Array<{ rowNumber: number; ok: boolean; errors: WoImportError[]; convertedQty?: WoImportConversion }>;
  summary: { total: number; ok: number; failed: number };
};

export type WoImportResult = {
  created: Array<{ wo_number: string; external_ref: string }>;
  skipped: Array<{ external_ref: string; reason: string }>;
  failed: Array<{ rowNumber: number; errors: WoImportError[] }>;
};

type ItemLookupRow = {
  id: string;
  item_code: string;
  uom_base: string;
  uom_secondary: string | null;
  output_uom: string;
  net_qty_per_each: string | null;
  each_per_box: string | null;
  boxes_per_pallet: string | null;
  weight_mode: 'fixed' | 'catch';
};

type UnitLookupRow = { code: string };
type ProductionLineLookupRow = { id: string; code: string };
type ActiveBomLookupRow = { product_id: string };
type ExistingWorkOrderImportRefRow = { external_ref: string | null };

type ValidImportRow = {
  rowNumber: number;
  row: WoImportRow;
  externalRef: string;
  fgCode: string;
  uom: string;
  lineCode: string;
  priority: string | undefined;
};

type QuantityMapping = {
  plannedBaseQty: string;
  quantityEntered: string;
  quantityEnteredUom: OutputUom;
  enteredLabel: string;
  conversion?: WoImportConversion;
};

const PRIORITIES = new Set(['low', 'normal', 'high', 'critical']);

export async function validateWoImport(rows: WoImportRow[]): Promise<WoValidationResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<WoValidationResult> => {
    const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
    await requirePlanningWritePermission(ctx);
    return validateRows(ctx.client, rows);
  });
}

export async function commitWoImport(
  rows: WoImportRow[],
  options: { mode: 'all_or_nothing' | 'skip_invalid' },
): Promise<WoImportResult> {
  const validation = await validateWoImport(rows);
  const failed = validation.rows
    .filter((row) => !row.ok)
    .map((row) => ({ rowNumber: row.rowNumber, errors: row.errors }));

  if (options.mode === 'all_or_nothing' && failed.length > 0) {
    return { created: [], skipped: [], failed };
  }

  const validRows = rows
    .map((row, index): ValidImportRow | null => {
      const result = validation.rows[index];
      if (!result?.ok) return null;
      return {
        rowNumber: index + 1,
        row,
        externalRef: normalizeText(row.external_ref),
        fgCode: normalizeText(row.fg_code),
        uom: normalizeText(row.uom),
        lineCode: normalizeText(row.line_code),
        priority: normalizePriority(row.priority),
      };
    })
    .filter((row): row is ValidImportRow => row !== null);

  return withOrgContext(async ({ userId, orgId, client }): Promise<WoImportResult> => {
    const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
    await requirePlanningWritePermission(ctx);

    const created: WoImportResult['created'] = [];
    const skipped: WoImportResult['skipped'] = [];
    const runtimeFailed: WoImportResult['failed'] = [...failed];
    const processedRefs = new Set<string>();

    const existingRefs = await findExistingWorkOrderImportRefs(ctx.client, validRows.map((row) => row.externalRef));
    const rowsToCreate = validRows.filter((row) => {
      if (!existingRefs.has(row.externalRef) && !processedRefs.has(row.externalRef)) return true;
      skipped.push({ external_ref: row.externalRef, reason: `Work order already exists for external_ref "${row.externalRef}".` });
      return false;
    });

    const [items, activeBoms, lines, units] = await Promise.all([
      loadActiveFgItems(ctx.client, rowsToCreate.map((row) => row.fgCode)),
      loadActiveBomRefs(ctx.client, rowsToCreate.map((row) => row.fgCode)),
      loadProductionLines(ctx.client, rowsToCreate.map((row) => row.lineCode)),
      loadOrgUnits(ctx.client, rowsToCreate.map((row) => row.uom)),
    ]);

    for (const entry of rowsToCreate) {
      if (processedRefs.has(entry.externalRef)) {
        skipped.push({ external_ref: entry.externalRef, reason: `Work order already exists for external_ref "${entry.externalRef}".` });
        continue;
      }

      const item = items.get(entry.fgCode);
      if (!item) {
        runtimeFailed.push({
          rowNumber: entry.rowNumber,
          errors: [{ column: 'fg_code', message: `FG item code "${entry.fgCode}" is not an active finished good for this org.` }],
        });
        continue;
      }
      if (!activeBoms.has(entry.fgCode)) {
        runtimeFailed.push({ rowNumber: entry.rowNumber, errors: [{ column: 'fg_code', message: 'no active BOM' }] });
        continue;
      }

      const line = entry.lineCode ? lines.get(entry.lineCode) : null;
      if (entry.lineCode && !line) {
        runtimeFailed.push({
          rowNumber: entry.rowNumber,
          errors: [{ column: 'line_code', message: `Production line code "${entry.lineCode}" was not found for this org.` }],
        });
        continue;
      }

      const quantity = mapQuantity(entry.row, item, units);
      if ('error' in quantity) {
        runtimeFailed.push({ rowNumber: entry.rowNumber, errors: [quantity.error] });
        continue;
      }

      const result = await createWorkOrderCore(ctx, {
        productId: item.id,
        itemCode: item.item_code,
        plannedQuantity: quantity.plannedBaseQty,
        quantityEntered: quantity.quantityEntered,
        quantityEnteredUom: quantity.quantityEnteredUom,
        scheduledStartTime: plannedDateToIso(entry.row.planned_date),
        productionLineId: line?.id,
      });

      if (!result.ok) {
        runtimeFailed.push({
          rowNumber: entry.rowNumber,
          errors: [
            {
              column: 'external_ref',
              message: `Could not create work order for external_ref "${entry.externalRef}": ${result.error}.`,
            },
          ],
        });
        continue;
      }

      await annotateCreatedWorkOrder(ctx.client, {
        workOrderId: result.workOrder.id,
        externalRef: entry.externalRef,
        priority: entry.priority,
        userId,
      });
      created.push({ wo_number: result.workOrder.woNumber, external_ref: entry.externalRef });
      processedRefs.add(entry.externalRef);
    }

    await insertImportJob(ctx.client, {
      userId,
      total: validation.summary.total,
      createdCount: created.length,
      skippedCount: skipped.length,
      failedCount: runtimeFailed.length,
      createdExternalRefs: created.map((row) => row.external_ref),
    });

    return { created, skipped, failed: runtimeFailed };
  });
}

async function requirePlanningWritePermission(ctx: OrgActionContext): Promise<void> {
  if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) {
    throw new WoImportForbiddenError();
  }
}

async function validateRows(client: QueryClient, rows: WoImportRow[]): Promise<WoValidationResult> {
  const [items, activeBoms, lines, units] = await Promise.all([
    loadActiveFgItems(client, rows.map((row) => row.fg_code)),
    loadActiveBomRefs(client, rows.map((row) => row.fg_code)),
    loadProductionLines(client, rows.map((row) => row.line_code ?? '')),
    loadOrgUnits(client, rows.map((row) => row.uom)),
  ]);

  const results = rows.map((row, index) => {
    const { errors, conversion } = validateRow(row, items, activeBoms, lines, units);
    return { rowNumber: index + 1, ok: errors.length === 0, errors, convertedQty: conversion };
  });
  const ok = results.filter((row) => row.ok).length;
  return { rows: results, summary: { total: rows.length, ok, failed: rows.length - ok } };
}

function validateRow(
  row: WoImportRow,
  items: Map<string, ItemLookupRow>,
  activeBoms: Set<string>,
  lines: Map<string, ProductionLineLookupRow>,
  units: Set<string>,
): { errors: WoImportError[]; conversion?: WoImportConversion } {
  const errors: WoImportError[] = [];

  const externalRef = normalizeText(row.external_ref);
  if (!externalRef) errors.push({ column: 'external_ref', message: 'External reference is required.' });

  const fgCode = normalizeText(row.fg_code);
  const item = items.get(fgCode);
  if (!fgCode) {
    errors.push({ column: 'fg_code', message: 'FG item code is required.' });
  } else if (!item) {
    errors.push({ column: 'fg_code', message: `FG item code "${fgCode}" is not an active finished good for this org.` });
  } else if (!activeBoms.has(fgCode)) {
    errors.push({ column: 'fg_code', message: 'no active BOM' });
  }

  const lineCode = normalizeText(row.line_code);
  if (lineCode && !lines.has(lineCode)) {
    errors.push({ column: 'line_code', message: `Production line code "${lineCode}" was not found for this org.` });
  }

  const priority = normalizePriority(row.priority);
  if (normalizeText(row.priority) && !priority) {
    errors.push({ column: 'priority', message: `Priority "${normalizeText(row.priority)}" is not valid.` });
  }

  const plannedDate = normalizeText(row.planned_date);
  if (plannedDate && !isValidIsoDate(plannedDate)) {
    errors.push({ column: 'planned_date', message: `Planned date "${plannedDate}" must be a YYYY-MM-DD date.` });
  }

  let qtyValid = true;
  if (!Number.isFinite(row.qty) || row.qty <= 0) {
    errors.push({ column: 'qty', message: `Quantity "${String(row.qty)}" must be greater than 0.` });
    qtyValid = false;
  } else if (decimalPlaces(row.qty) > 3) {
    errors.push({ column: 'qty', message: `Quantity "${numberToPlainString(row.qty)}" must have at most 3 decimal places.` });
    qtyValid = false;
  }

  let conversion: WoImportConversion | undefined;
  if (item && qtyValid) {
    const quantity = mapQuantity(row, item, units);
    if ('error' in quantity) {
      errors.push(quantity.error);
    } else {
      conversion = quantity.conversion;
    }
  }

  return { errors, conversion };
}

async function loadActiveFgItems(client: QueryClient, rawCodes: string[]): Promise<Map<string, ItemLookupRow>> {
  const codes = uniqueNormalized(rawCodes);
  if (codes.length === 0) return new Map();
  const { rows } = await client.query<ItemLookupRow>(
    `select id, item_code, uom_base, uom_secondary, output_uom,
            net_qty_per_each::text as net_qty_per_each,
            each_per_box::text as each_per_box,
            boxes_per_pallet::text as boxes_per_pallet,
            weight_mode
       from public.items
      where org_id = app.current_org_id()
        and item_code = any($1::text[])
        and item_type = 'fg'
        and status = 'active'`,
    [codes],
  );
  return new Map(rows.map((row) => [row.item_code, row]));
}

async function loadActiveBomRefs(client: QueryClient, rawCodes: string[]): Promise<Set<string>> {
  const codes = uniqueNormalized(rawCodes);
  if (codes.length === 0) return new Set();
  const { rows } = await client.query<ActiveBomLookupRow>(
    `select distinct i.item_code as product_id
       from public.bom_headers bh
       join public.items i
         on i.org_id = bh.org_id
        and i.id = bh.item_id
      where bh.org_id = app.current_org_id()
        and i.item_code = any($1::text[])
        and bh.status = 'active'`,
    [codes],
  );
  return new Set(rows.map((row) => row.product_id));
}

async function loadProductionLines(client: QueryClient, rawCodes: string[]): Promise<Map<string, ProductionLineLookupRow>> {
  const codes = uniqueNormalized(rawCodes);
  if (codes.length === 0) return new Map();
  const { rows } = await client.query<ProductionLineLookupRow>(
    `select id, code
       from public.production_lines
      where org_id = app.current_org_id()
        and status = 'active'
        and code = any($1::text[])`,
    [codes],
  );
  return new Map(rows.map((row) => [row.code, row]));
}

async function loadOrgUnits(client: QueryClient, rawCodes: string[]): Promise<Set<string>> {
  const codes = uniqueNormalized(rawCodes);
  if (codes.length === 0) return new Set();
  const { rows } = await client.query<UnitLookupRow>(
    `select code
       from public.unit_of_measure
      where org_id = app.current_org_id()
        and deleted_at is null
        and code = any($1::text[])`,
    [codes],
  );
  return new Set(rows.map((row) => row.code));
}

async function findExistingWorkOrderImportRefs(client: QueryClient, rawRefs: string[]): Promise<Set<string>> {
  const refs = uniqueNormalized(rawRefs);
  if (refs.length === 0) return new Set();
  const { rows } = await client.query<ExistingWorkOrderImportRefRow>(
    `select external_ref
       from (
         select wo.ext_jsonb->>'import_external_ref' as external_ref
           from public.work_orders wo
          where wo.org_id = app.current_org_id()
            and wo.ext_jsonb->>'import_external_ref' = any($1::text[])
         union
         select jsonb_array_elements_text(coalesce(j.metadata->'created_external_refs', '[]'::jsonb)) as external_ref
           from public.import_export_jobs j
          where j.org_id = app.current_org_id()
            and j.kind = 'import'
            and j.target = 'work_orders'
       ) existing
      where external_ref = any($1::text[])`,
    [refs],
  );
  return new Set(rows.map((row) => normalizeText(row.external_ref)).filter((value) => value.length > 0));
}

async function annotateCreatedWorkOrder(
  client: QueryClient,
  input: { workOrderId: string; externalRef: string; priority: string | undefined; userId: string },
): Promise<void> {
  await client.query(
    `update public.work_orders
        set priority = coalesce($2::text, priority),
            ext_jsonb = jsonb_set(coalesce(ext_jsonb, '{}'::jsonb), '{import_external_ref}', to_jsonb($3::text), true),
            updated_by = $4::uuid,
            updated_at = now()
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [input.workOrderId, input.priority ?? null, input.externalRef, input.userId],
  );
}

async function insertImportJob(
  client: QueryClient,
  input: {
    userId: string;
    total: number;
    createdCount: number;
    skippedCount: number;
    failedCount: number;
    createdExternalRefs: string[];
  },
): Promise<void> {
  await client.query(
    `insert into public.import_export_jobs
       (org_id, kind, target, status, progress_processed, progress_total, download_url, created_by, completed_at, metadata)
     values
       (app.current_org_id(), 'import', 'work_orders', 'completed', $1::integer, $1::integer, null, $2::uuid, pg_catalog.now(), $3::jsonb)`,
    [
      input.total,
      input.userId,
      JSON.stringify({
        total: input.total,
        created_count: input.createdCount,
        skipped_count: input.skippedCount,
        failed_count: input.failedCount,
        created_external_refs: input.createdExternalRefs,
      }),
    ],
  );
}

function mapQuantity(
  row: WoImportRow,
  item: ItemLookupRow,
  units: Set<string>,
): QuantityMapping | { error: WoImportError } {
  const quantityEntered = numberToPlainString(row.qty);
  const uom = normalizeText(row.uom);
  if (!uom) return { error: { column: 'uom', message: 'UoM is required.' } };

  const resolved = resolveEnteredUom(uom, item, units);
  if ('error' in resolved) return { error: resolved.error };

  if (resolved.enteredUom === 'base') {
    return {
      plannedBaseQty: quantityEntered,
      quantityEntered,
      quantityEnteredUom: 'base',
      enteredLabel: resolved.enteredLabel,
    };
  }

  try {
    const snapshot = snapshotFromItemRow(item);
    const baseQty = toBaseQty(snapshot, row.qty, resolved.enteredUom).toFixed(3);
    return {
      plannedBaseQty: baseQty,
      quantityEntered,
      quantityEnteredUom: resolved.enteredUom,
      enteredLabel: resolved.enteredLabel,
      conversion: {
        enteredQty: quantityEntered,
        enteredUom: resolved.enteredLabel,
        baseQty,
        baseUom: normalizeText(item.uom_base),
        display: `${quantityEntered} ${resolved.enteredLabel} -> ${trimTrailingZeros(baseQty)} ${normalizeText(item.uom_base)}`,
      },
    };
  } catch (error) {
    if (error instanceof TypedError && error.code === 'uom_conversion_unavailable') {
      return {
        error: {
          column: 'uom',
          message: `UoM conversion is unavailable for item code "${item.item_code}".`,
        },
      };
    }
    throw error;
  }
}

function resolveEnteredUom(
  uom: string,
  item: ItemLookupRow,
  units: Set<string>,
): { enteredUom: OutputUom; enteredLabel: string } | { error: WoImportError } {
  const baseUom = normalizeText(item.uom_base);
  const secondaryUom = normalizeText(item.uom_secondary);
  const outputUom = normalizeOutputUom(item.output_uom);

  if (uom === baseUom || uom === 'base') return { enteredUom: 'base', enteredLabel: uom };
  if (uom === 'each') return { enteredUom: 'each', enteredLabel: uom };
  if (uom === 'box') return { enteredUom: 'box', enteredLabel: uom };
  if (uom === outputUom && outputUom !== 'base') return { enteredUom: outputUom, enteredLabel: uom };
  if (secondaryUom && uom === secondaryUom) {
    return { enteredUom: isBoxLabel(secondaryUom) ? 'box' : 'each', enteredLabel: uom };
  }

  if (!units.has(uom)) {
    return { error: { column: 'uom', message: `UoM "${uom}" was not found for this org.` } };
  }
  return { error: { column: 'uom', message: `UoM "${uom}" is not valid for FG item code "${item.item_code}".` } };
}

function normalizeOutputUom(value: string): OutputUom {
  return value === 'each' || value === 'box' ? value : 'base';
}

function isBoxLabel(value: string): boolean {
  return ['box', 'boxes', 'case', 'cases', 'carton', 'cartons'].includes(value.toLowerCase());
}

function normalizePriority(value: string | undefined): string | undefined {
  const priority = normalizeText(value).toLowerCase();
  if (!priority) return undefined;
  return PRIORITIES.has(priority) ? priority : undefined;
}

function plannedDateToIso(value: string | undefined): string | undefined {
  const date = normalizeText(value);
  if (!date) return undefined;
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

function normalizeText(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueNormalized(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeText).filter((value) => value.length > 0)));
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function decimalPlaces(value: number): number {
  const plain = numberToPlainString(value);
  const [, fraction = ''] = plain.split('.');
  return fraction.replace(/0+$/, '').length;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  return value.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
}

function trimTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

class WoImportForbiddenError extends Error {}
