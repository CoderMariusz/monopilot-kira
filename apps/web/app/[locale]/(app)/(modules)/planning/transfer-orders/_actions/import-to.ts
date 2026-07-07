'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { normalizePieceUom } from '../../../../../../../lib/uom/piece';
import { hasPlanningWritePermission, type OrgActionContext, type QueryClient } from '../../_actions/procurement-shared';
import { createTransferOrder } from './actions';

export type ToImportRow = {
  external_ref: string;
  from_warehouse_code: string;
  to_warehouse_code: string;
  item_code: string;
  qty: number;
  uom: string;
  date?: string;
};

export type ToImportError = { column: string; message: string };

export type ToValidationResult = {
  rows: Array<{ rowNumber: number; ok: boolean; errors: ToImportError[] }>;
  summary: { total: number; ok: number; failed: number };
};

export type ToImportResult = {
  created: Array<{ to_number: string; external_ref: string }>;
  skipped: Array<{ external_ref: string; reason: string }>;
  failed: Array<{ rowNumber: number; errors: ToImportError[] }>;
};

type WarehouseLookupRow = {
  id: string;
  code: string;
};

type ItemLookupRow = {
  id: string;
  item_code: string;
  uom_base: string;
  uom_secondary: string | null;
};

type UnitLookupRow = { code: string };
type ExistingTransferOrderRow = { to_number: string };

type ValidImportRow = {
  rowNumber: number;
  row: ToImportRow;
  externalRef: string;
  fromWarehouseCode: string;
  toWarehouseCode: string;
  itemCode: string;
  uom: string;
};

type ImportGroup = {
  fromWarehouseCode: string;
  toWarehouseCode: string;
  externalRef: string;
  rows: ValidImportRow[];
};

type CreateTransferOrderLinePayload = {
  itemId: string;
  qty: string;
  uom: string;
  lineNo: number;
};

export async function validateToImport(rows: ToImportRow[]): Promise<ToValidationResult> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<ToValidationResult> => {
    const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
    await requirePlanningWritePermission(ctx);
    return validateRows(ctx.client, rows);
  });
}

export async function commitToImport(
  rows: ToImportRow[],
  options: { mode: 'all_or_nothing' | 'skip_invalid' },
): Promise<ToImportResult> {
  const validation = await validateToImport(rows);
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
        fromWarehouseCode: normalizeText(row.from_warehouse_code),
        toWarehouseCode: normalizeText(row.to_warehouse_code),
        itemCode: normalizeText(row.item_code),
        uom: normalizeText(row.uom),
      };
    })
    .filter((row): row is ValidImportRow => row !== null);

  return withOrgContext(async ({ userId, orgId, client }): Promise<ToImportResult> => {
    const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
    await requirePlanningWritePermission(ctx);

    const created: ToImportResult['created'] = [];
    const skipped: ToImportResult['skipped'] = [];
    const skippedRefs = new Set<string>();
    const runtimeFailed: ToImportResult['failed'] = [...failed];

    const existingRefs = await findExistingTransferOrderRefs(ctx.client, validRows.map((row) => row.externalRef));
    const rowsToCreate = validRows.filter((row) => {
      if (!existingRefs.has(row.externalRef)) return true;
      if (!skippedRefs.has(row.externalRef)) {
        skipped.push({ external_ref: row.externalRef, reason: `Transfer order already exists for external_ref "${row.externalRef}".` });
        skippedRefs.add(row.externalRef);
      }
      return false;
    });

    const [warehouses, items] = await Promise.all([
      loadWarehouses(ctx.client, rowsToCreate.flatMap((row) => [row.fromWarehouseCode, row.toWarehouseCode])),
      loadActiveItems(ctx.client, rowsToCreate.map((row) => row.itemCode)),
    ]);

    for (const group of groupRows(rowsToCreate)) {
      const fromWarehouse = warehouses.get(group.fromWarehouseCode);
      const toWarehouse = warehouses.get(group.toWarehouseCode);
      if (!fromWarehouse) {
        failGroup(runtimeFailed, group, 'from_warehouse_code', `Warehouse code "${group.fromWarehouseCode}" was not found for this org.`);
        continue;
      }
      if (!toWarehouse) {
        failGroup(runtimeFailed, group, 'to_warehouse_code', `Warehouse code "${group.toWarehouseCode}" was not found for this org.`);
        continue;
      }
      if (fromWarehouse.id === toWarehouse.id) {
        failGroup(runtimeFailed, group, 'to_warehouse_code', 'Transfer source and destination warehouses must differ.');
        continue;
      }

      const lineInputs: CreateTransferOrderLinePayload[] = [];
      let groupHasLookupFailure = false;
      for (const entry of group.rows) {
        const item = items.get(entry.itemCode);
        if (!item) {
          runtimeFailed.push({
            rowNumber: entry.rowNumber,
            errors: [{ column: 'item_code', message: `Item code "${entry.itemCode}" is not an active item for this org.` }],
          });
          groupHasLookupFailure = true;
          continue;
        }
        lineInputs.push({
          itemId: item.id,
          qty: numberToPlainString(entry.row.qty),
          uom: entry.uom,
          lineNo: lineInputs.length + 1,
        });
      }
      if (groupHasLookupFailure) continue;

      const result = await createTransferOrder({
        toNumber: group.externalRef,
        fromWarehouseId: fromWarehouse.id,
        toWarehouseId: toWarehouse.id,
        status: 'draft',
        scheduledDate: firstText(group.rows, (entry) => entry.row.date),
        lines: lineInputs,
      });

      if (result.ok) {
        created.push({ to_number: result.data.toNumber, external_ref: group.externalRef });
        continue;
      }

      failGroup(
        runtimeFailed,
        group,
        'external_ref',
        `Could not create transfer order for external_ref "${group.externalRef}": ${result.message ?? result.error}.`,
      );
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
  if (!(await hasPlanningWritePermission(ctx))) {
    throw new ToImportForbiddenError();
  }
}

async function validateRows(client: QueryClient, rows: ToImportRow[]): Promise<ToValidationResult> {
  const [warehouses, items, units] = await Promise.all([
    loadWarehouses(client, rows.flatMap((row) => [row.from_warehouse_code, row.to_warehouse_code])),
    loadActiveItems(client, rows.map((row) => row.item_code)),
    loadOrgUnits(client, rows.map((row) => row.uom)),
  ]);

  const results = rows.map((row, index) => {
    const errors = validateRow(row, warehouses, items, units);
    return { rowNumber: index + 1, ok: errors.length === 0, errors };
  });
  const ok = results.filter((row) => row.ok).length;
  return { rows: results, summary: { total: rows.length, ok, failed: rows.length - ok } };
}

function validateRow(
  row: ToImportRow,
  warehouses: Map<string, WarehouseLookupRow>,
  items: Map<string, ItemLookupRow>,
  units: Set<string>,
): ToImportError[] {
  const errors: ToImportError[] = [];

  const externalRef = normalizeText(row.external_ref);
  if (!externalRef) errors.push({ column: 'external_ref', message: 'External reference is required.' });

  const fromWarehouseCode = normalizeText(row.from_warehouse_code);
  const toWarehouseCode = normalizeText(row.to_warehouse_code);
  const fromWarehouse = warehouses.get(fromWarehouseCode);
  const toWarehouse = warehouses.get(toWarehouseCode);
  if (!fromWarehouseCode) {
    errors.push({ column: 'from_warehouse_code', message: 'Source warehouse code is required.' });
  } else if (!fromWarehouse) {
    errors.push({ column: 'from_warehouse_code', message: `Warehouse code "${fromWarehouseCode}" was not found for this org.` });
  }
  if (!toWarehouseCode) {
    errors.push({ column: 'to_warehouse_code', message: 'Destination warehouse code is required.' });
  } else if (!toWarehouse) {
    errors.push({ column: 'to_warehouse_code', message: `Warehouse code "${toWarehouseCode}" was not found for this org.` });
  }
  if (fromWarehouse && toWarehouse && fromWarehouse.id === toWarehouse.id) {
    errors.push({ column: 'to_warehouse_code', message: 'Transfer source and destination warehouses must differ.' });
  }

  const itemCode = normalizeText(row.item_code);
  const item = items.get(itemCode);
  if (!itemCode) {
    errors.push({ column: 'item_code', message: 'Item code is required.' });
  } else if (!item) {
    errors.push({ column: 'item_code', message: `Item code "${itemCode}" is not an active item for this org.` });
  }

  const uom = normalizeText(row.uom);
  if (!uom) {
    errors.push({ column: 'uom', message: 'UoM is required.' });
  } else if (item && !isValidUomForItem(uom, item, units)) {
    errors.push({ column: 'uom', message: `UoM "${uom}" is not valid for item code "${itemCode}".` });
  }

  if (!Number.isFinite(row.qty) || row.qty <= 0) {
    errors.push({ column: 'qty', message: `Quantity "${String(row.qty)}" must be greater than 0.` });
  } else if (decimalPlaces(row.qty) > 3) {
    errors.push({ column: 'qty', message: `Quantity "${numberToPlainString(row.qty)}" must have at most 3 decimal places.` });
  }

  const date = normalizeText(row.date);
  if (date && !isValidIsoDate(date)) {
    errors.push({ column: 'date', message: `Date "${date}" must be a YYYY-MM-DD date.` });
  }

  return errors;
}

async function loadWarehouses(client: QueryClient, rawCodes: string[]): Promise<Map<string, WarehouseLookupRow>> {
  const codes = uniqueNormalized(rawCodes);
  if (codes.length === 0) return new Map();
  const { rows } = await client.query<WarehouseLookupRow>(
    `select id, code
       from public.warehouses
      where org_id = app.current_org_id()
        and code = any($1::text[])`,
    [codes],
  );
  return new Map(rows.map((row) => [row.code, row]));
}

async function loadActiveItems(client: QueryClient, rawCodes: string[]): Promise<Map<string, ItemLookupRow>> {
  const codes = uniqueNormalized(rawCodes);
  if (codes.length === 0) return new Map();
  const { rows } = await client.query<ItemLookupRow>(
    `select id, item_code, uom_base, uom_secondary
       from public.items
      where org_id = app.current_org_id()
        and item_code = any($1::text[])
        and status = 'active'`,
    [codes],
  );
  return new Map(rows.map((row) => [row.item_code, row]));
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

async function findExistingTransferOrderRefs(client: QueryClient, rawRefs: string[]): Promise<Set<string>> {
  const refs = uniqueNormalized(rawRefs);
  if (refs.length === 0) return new Set();
  const { rows } = await client.query<ExistingTransferOrderRow>(
    `select to_number
       from public.transfer_orders
      where org_id = app.current_org_id()
        and to_number = any($1::text[])`,
    [refs],
  );
  return new Set(rows.map((row) => row.to_number));
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
       (app.current_org_id(), 'import', 'transfer_orders', 'completed', $1::integer, $1::integer, null, $2::uuid, pg_catalog.now(), $3::jsonb)`,
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

function groupRows(rows: ValidImportRow[]): ImportGroup[] {
  const groups = new Map<string, ImportGroup>();
  for (const row of rows) {
    const key = `${row.fromWarehouseCode}\u0000${row.toWarehouseCode}\u0000${row.externalRef}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, {
        fromWarehouseCode: row.fromWarehouseCode,
        toWarehouseCode: row.toWarehouseCode,
        externalRef: row.externalRef,
        rows: [row],
      });
    }
  }
  return Array.from(groups.values());
}

function failGroup(
  failed: ToImportResult['failed'],
  group: ImportGroup,
  column: string,
  message: string,
): void {
  for (const row of group.rows) {
    failed.push({ rowNumber: row.rowNumber, errors: [{ column, message }] });
  }
}

function firstText(rows: ValidImportRow[], pick: (entry: ValidImportRow) => string | undefined): string | undefined {
  for (const row of rows) {
    const value = normalizeText(pick(row));
    if (value) return value;
  }
  return undefined;
}

function isValidUomForItem(uom: string, item: ItemLookupRow, units: Set<string>): boolean {
  const normalizedUom = normalizePieceUom(uom) ?? uom;
  const itemUoms = new Set(
    [normalizeText(item.uom_base), normalizeText(item.uom_secondary)]
      .filter((value) => value.length > 0)
      .map((value) => normalizePieceUom(value) ?? value),
  );
  const orgUnits = new Set([...units].map((code) => normalizePieceUom(code) ?? code));
  return itemUoms.has(normalizedUom) || orgUnits.has(normalizedUom);
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

class ToImportForbiddenError extends Error {}
