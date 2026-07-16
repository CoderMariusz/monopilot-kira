'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { normalizePieceUom } from '../../../../../../../lib/uom/piece';
import { requireActionPermission, PLANNING_PO_MANAGE_PERMISSION, type OrgActionContext, type QueryClient } from '../../_actions/procurement-shared';
import { createPurchaseOrderCore } from './create-purchase-order-core';
import { validateImportGroupSchema } from './import-po-schema';
import { PoImportAllOrNothingError } from './po-import-errors';
import type {
  PoImportError,
  PoImportResponse,
  PoImportResult,
  PoImportRow,
  PoValidationResponse,
  PoValidationResult,
} from './import-po.types';

type SupplierLookupRow = {
  id: string;
  code: string;
  currency: string | null;
};

type ItemLookupRow = {
  id: string;
  item_code: string;
  uom_base: string;
  uom_secondary: string | null;
};

type UnitLookupRow = { code: string };
type ExistingPurchaseOrderRow = { po_number: string };

type ValidImportRow = {
  rowNumber: number;
  row: PoImportRow;
  externalRef: string;
  supplierCode: string;
  itemCode: string;
  uom: string;
};

type ImportGroup = {
  supplierCode: string;
  externalRef: string;
  rows: ValidImportRow[];
};

type CreatePurchaseOrderLinePayload = {
  itemId: string;
  qty: string;
  uom: string;
  unitPrice: string;
  taxPct: string;
  lineNo: number;
};

export async function validatePoImport(rows: PoImportRow[]): Promise<PoValidationResponse> {
  return withOrgContext(async ({ userId, orgId, client }): Promise<PoValidationResponse> => {
    const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
    const perm = await requireActionPermission(ctx, PLANNING_PO_MANAGE_PERMISSION);
    if (!perm.ok) return { ok: false, error: 'forbidden' };
    return validateRows(ctx.client, rows);
  });
}

export async function commitPoImport(
  rows: PoImportRow[],
  options: { mode: 'all_or_nothing' | 'skip_invalid' },
): Promise<PoImportResponse> {
  const validation = await validatePoImport(rows);
  if ('error' in validation) return validation;

  const failed = validation.rows
    .filter((row) => !row.ok)
    .map((row) => ({ rowNumber: row.rowNumber, errors: row.errors }));

  if (options.mode === 'all_or_nothing' && failed.length > 0) {
    return { created: [], skipped: [], failed };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<PoImportResponse> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      const perm = await requireActionPermission(ctx, PLANNING_PO_MANAGE_PERMISSION);
      if (!perm.ok) return { ok: false, error: 'forbidden' };

      const revalidation = await validateRows(ctx.client, rows);
      const revalidationFailed = revalidation.rows
        .filter((row) => !row.ok)
        .map((row) => ({ rowNumber: row.rowNumber, errors: row.errors }));
      if (options.mode === 'all_or_nothing' && revalidationFailed.length > 0) {
        throw new PoImportAllOrNothingError(revalidationFailed);
      }

      const created: PoImportResult['created'] = [];
      const skipped: PoImportResult['skipped'] = [];
      const skippedRefs = new Set<string>();
      const runtimeFailed: PoImportResult['failed'] = [
        ...failed,
        ...(options.mode === 'skip_invalid' ? revalidationFailed : []),
      ];

      const revalidatedValidRows = rows
        .map((row, index): ValidImportRow | null => {
          const result = revalidation.rows[index];
          if (!result?.ok) return null;
          return {
            rowNumber: index + 1,
            row,
            externalRef: normalizeText(row.external_ref),
            supplierCode: normalizeText(row.supplier_code),
            itemCode: normalizeText(row.item_code),
            uom: normalizeText(row.uom),
          };
        })
        .filter((row): row is ValidImportRow => row !== null);

      const existingRefs = await findExistingPurchaseOrderRefs(
        ctx.client,
        revalidatedValidRows.map((row) => row.externalRef),
      );
      const rowsToCreate = revalidatedValidRows.filter((row) => {
        if (!existingRefs.has(row.externalRef)) return true;
        if (!skippedRefs.has(row.externalRef)) {
          skipped.push({ external_ref: row.externalRef, reason: `Purchase order already exists for external_ref "${row.externalRef}".` });
          skippedRefs.add(row.externalRef);
        }
        return false;
      });

      const [suppliers, items] = await Promise.all([
        loadSuppliers(ctx.client, rowsToCreate.map((row) => row.supplierCode)),
        loadActiveItems(ctx.client, rowsToCreate.map((row) => row.itemCode)),
      ]);

      for (const group of groupRows(rowsToCreate)) {
        const alreadyExists = await checkPoNumberExists(ctx.client, group.externalRef);
        if (alreadyExists) {
          const groupFailed = failGroup(runtimeFailed, group, 'po_number', `Purchase order number "${group.externalRef}" already exists (duplicate_po_number).`);
          if (options.mode === 'all_or_nothing') throw new PoImportAllOrNothingError(groupFailed);
          continue;
        }

        const supplier = suppliers.get(group.supplierCode);
        if (!supplier) {
          const groupFailed = failGroup(
            runtimeFailed,
            group,
            'supplier_code',
            `Supplier code "${group.supplierCode}" was not found for this org.`,
          );
          if (options.mode === 'all_or_nothing') throw new PoImportAllOrNothingError(groupFailed);
          continue;
        }

        const lineInputs: CreatePurchaseOrderLinePayload[] = [];
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
            unitPrice: numberToPlainString(entry.row.price ?? 0),
            taxPct: '0',
            lineNo: lineInputs.length + 1,
          });
        }
        if (groupHasLookupFailure) {
          const groupFailed = group.rows
            .filter((entry) =>
              runtimeFailed.some(
                (failure) =>
                  failure.rowNumber === entry.rowNumber &&
                  failure.errors.some((err) => err.column === 'item_code'),
              ),
            )
            .map((entry) => ({
              rowNumber: entry.rowNumber,
              errors: runtimeFailed.find((failure) => failure.rowNumber === entry.rowNumber)?.errors ?? [],
            }));
          if (options.mode === 'all_or_nothing') throw new PoImportAllOrNothingError(groupFailed);
          continue;
        }

        const schemaErrors = validateImportGroupSchema(group, {
          poNumber: group.externalRef,
          supplierId: supplier.id,
          expectedDelivery: firstText(group.rows, (entry) => entry.row.expected_delivery),
          currency: firstText(group.rows, (entry) => entry.row.currency) ?? supplier.currency ?? 'GBP',
          notes: joinNotes(group.rows),
          lines: lineInputs,
        });
        if (schemaErrors.length > 0) {
          for (const rowError of schemaErrors) {
            runtimeFailed.push(rowError);
          }
          if (options.mode === 'all_or_nothing') throw new PoImportAllOrNothingError(schemaErrors);
          continue;
        }

        const result = await createPurchaseOrderCore(ctx, {
          poNumber: group.externalRef,
          supplierId: supplier.id,
          status: 'draft',
          expectedDelivery: firstText(group.rows, (entry) => entry.row.expected_delivery),
          currency: firstText(group.rows, (entry) => entry.row.currency) ?? supplier.currency ?? 'GBP',
          notes: joinNotes(group.rows),
          lines: lineInputs,
        });

        if (result.ok) {
          created.push({ po_number: result.data.poNumber, external_ref: group.externalRef });
          continue;
        }

        const groupFailed = failGroup(
          runtimeFailed,
          group,
          'external_ref',
          `Could not create purchase order for external_ref "${group.externalRef}": ${result.error}.`,
        );
        if (options.mode === 'all_or_nothing') throw new PoImportAllOrNothingError(groupFailed);
      }

      await insertImportJob(ctx.client, {
        userId,
        total: validation.summary.total,
        createdCount: created.length,
        skippedCount: skipped.length,
        failedCount: runtimeFailed.length,
      });

      return { created, skipped, failed: runtimeFailed };
    });
  } catch (err) {
    if (err instanceof PoImportAllOrNothingError) {
      return { created: [], skipped: [], failed: err.failed };
    }
    throw err;
  }
}

async function validateRows(client: QueryClient, rows: PoImportRow[]): Promise<PoValidationResult> {
  const [suppliers, items, units] = await Promise.all([
    loadSuppliers(client, rows.map((row) => row.supplier_code)),
    loadActiveItems(client, rows.map((row) => row.item_code)),
    loadOrgUnits(client, rows.map((row) => row.uom)),
  ]);

  const results = rows.map((row, index) => {
    const error = validateRow(row, suppliers, items, units);
    return { rowNumber: index + 1, ok: error === null, errors: error ? [error] : [] };
  });
  const ok = results.filter((row) => row.ok).length;
  return { rows: results, summary: { total: rows.length, ok, failed: rows.length - ok } };
}

function validateRow(
  row: PoImportRow,
  suppliers: Map<string, SupplierLookupRow>,
  items: Map<string, ItemLookupRow>,
  units: Set<string>,
): PoImportError | null {
  const externalRef = normalizeText(row.external_ref);
  if (!externalRef) return { column: 'external_ref', message: 'External reference is required.' };

  const supplierCode = normalizeText(row.supplier_code);
  if (!supplierCode) return { column: 'supplier_code', message: 'Supplier code is required.' };
  if (!suppliers.has(supplierCode)) {
    return { column: 'supplier_code', message: `Supplier code "${supplierCode}" was not found for this org.` };
  }

  const itemCode = normalizeText(row.item_code);
  if (!itemCode) return { column: 'item_code', message: 'Item code is required.' };
  const item = items.get(itemCode);
  if (!item) return { column: 'item_code', message: `Item code "${itemCode}" is not an active item for this org.` };

  const uom = normalizeText(row.uom);
  if (!uom) return { column: 'uom', message: 'UoM is required.' };
  if (!isValidUomForItem(uom, item, units)) {
    return { column: 'uom', message: `UoM "${uom}" is not valid for item code "${itemCode}".` };
  }

  if (!Number.isFinite(row.qty) || row.qty <= 0) {
    return { column: 'qty', message: `Quantity "${String(row.qty)}" must be greater than 0.` };
  }
  if (decimalPlaces(row.qty) > 3) {
    return { column: 'qty', message: `Quantity "${numberToPlainString(row.qty)}" must have at most 3 decimal places.` };
  }

  if (row.price !== undefined) {
    if (!Number.isFinite(row.price) || row.price < 0) {
      return { column: 'price', message: `Price "${String(row.price)}" must be greater than or equal to 0.` };
    }
    if (decimalPlaces(row.price) > 4) {
      return { column: 'price', message: `Price "${numberToPlainString(row.price)}" must have at most 4 decimal places.` };
    }
  }

  const expectedDelivery = normalizeText(row.expected_delivery);
  if (expectedDelivery) {
    if (!isValidIsoDate(expectedDelivery)) {
      return { column: 'expected_delivery', message: `Expected delivery "${expectedDelivery}" must be a YYYY-MM-DD date.` };
    }
    if (expectedDelivery < todayUtcDate()) {
      return { column: 'expected_delivery', message: `Expected delivery "${expectedDelivery}" must not be in the past.` };
    }
  }

  return null;
}

async function loadSuppliers(client: QueryClient, rawCodes: string[]): Promise<Map<string, SupplierLookupRow>> {
  const codes = uniqueNormalized(rawCodes);
  if (codes.length === 0) return new Map();
  const { rows } = await client.query<SupplierLookupRow>(
    `select id, code, currency
       from public.suppliers
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

async function checkPoNumberExists(client: QueryClient, poNumber: string): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `select exists(
       select 1 from public.purchase_orders
        where org_id = app.current_org_id()
          and po_number = $1
     ) as exists`,
    [poNumber],
  );
  return rows[0]?.exists === true;
}

async function findExistingPurchaseOrderRefs(client: QueryClient, rawRefs: string[]): Promise<Set<string>> {
  const refs = uniqueNormalized(rawRefs);
  if (refs.length === 0) return new Set();
  const { rows } = await client.query<ExistingPurchaseOrderRow>(
    `select po_number
       from public.purchase_orders
      where org_id = app.current_org_id()
        and po_number = any($1::text[])`,
    [refs],
  );
  return new Set(rows.map((row) => row.po_number));
}

async function insertImportJob(
  client: QueryClient,
  input: { userId: string; total: number; createdCount: number; skippedCount: number; failedCount: number },
): Promise<void> {
  await client.query(
    `insert into public.import_export_jobs
       (org_id, kind, target, status, progress_processed, progress_total, download_url, created_by, completed_at, metadata)
     values
       (app.current_org_id(), 'import', 'purchase_orders', 'completed', $1::integer, $1::integer, null, $2::uuid, pg_catalog.now(), $3::jsonb)`,
    [
      input.total,
      input.userId,
      JSON.stringify({
        total: input.total,
        created_count: input.createdCount,
        skipped_count: input.skippedCount,
        failed_count: input.failedCount,
      }),
    ],
  );
}

function groupRows(rows: ValidImportRow[]): ImportGroup[] {
  const groups = new Map<string, ImportGroup>();
  for (const row of rows) {
    const key = `${row.supplierCode}\u0000${row.externalRef}`;
    const group = groups.get(key);
    if (group) {
      group.rows.push(row);
    } else {
      groups.set(key, { supplierCode: row.supplierCode, externalRef: row.externalRef, rows: [row] });
    }
  }
  return Array.from(groups.values());
}

function failGroup(
  failed: PoImportResult['failed'],
  group: ImportGroup,
  column: string,
  message: string,
): PoImportResult['failed'] {
  const groupFailed: PoImportResult['failed'] = [];
  for (const row of group.rows) {
    const entry = { rowNumber: row.rowNumber, errors: [{ column, message }] };
    failed.push(entry);
    groupFailed.push(entry);
  }
  return groupFailed;
}

function firstText(rows: ValidImportRow[], pick: (entry: ValidImportRow) => string | undefined): string | undefined {
  for (const row of rows) {
    const value = normalizeText(pick(row));
    if (value) return value;
  }
  return undefined;
}

function joinNotes(rows: ValidImportRow[]): string | undefined {
  const notes = rows.map((entry) => normalizeText(entry.row.notes)).filter((note) => note.length > 0);
  return notes.length > 0 ? notes.join('\n') : undefined;
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

function todayUtcDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
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
