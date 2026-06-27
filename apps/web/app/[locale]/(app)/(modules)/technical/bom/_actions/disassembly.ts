import 'server-only';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  APP_VERSION,
  AUDIT_BOM_CREATED,
  BOM_CREATE_PERMISSION,
  EVENT_BOM_VERSION_SUBMITTED,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  writeAudit,
  writeOutbox,
} from './shared';

export type DisassemblyAllocationInput = {
  allocation_pct?: string | number | null;
  allocationPct?: string | number | null;
};

export type ValidateDisassemblyAllocationResult =
  | { ok: true; allocation_sum: string }
  | { ok: false; error: string; allocation_sum: string };

export type CreateDisassemblyBomDraftResult =
  | { ok: true; data: { id: string; version: number } }
  | { ok: false; error: string };

export type DisassemblyBomView = {
  header: {
    bom_type: 'disassembly';
    product_code: string;
    status: string;
    version: number;
    yield_pct: string;
    effective_from: string;
    effective_to: string | null;
    notes: string | null;
  };
  input_item: {
    code: string;
    name: string | null;
    quantity: string;
    uom: string;
  };
  outputs: Array<{
    code: string;
    name: string | null;
    quantity: string;
    uom: string;
    allocation_pct: string;
    expected_yield_pct: string;
  }>;
  allocation_sum: string;
};

export type GetDisassemblyBomResult =
  | { ok: true; data: DisassemblyBomView }
  | { ok: false; error: 'not_found' | 'load_failed' };

type NormalizedLine = {
  itemId: string | null;
  componentCode: string;
  componentType: string | null;
  quantity: string;
  uom: string;
  scrapPct: string;
  manufacturingOperationName: string | null;
  sequence: number | null;
  isPhantom: boolean;
};

type NormalizedCoProduct = {
  itemId: string;
  quantity: string;
  uom: string;
  allocationPct: string;
  expectedYieldPct: string;
};

type NormalizedDisassemblyInput = {
  bom_type: 'disassembly';
  productId: string;
  yieldPct: string;
  effectiveFrom: string | null;
  notes: string | null;
  inputLine: NormalizedLine;
  coProducts: NormalizedCoProduct[];
};

type HeaderRow = {
  product_id: string;
  status: string;
  version: number;
  yield_pct: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  notes: string | null;
};

type InputLineRow = {
  component_code: string;
  item_code: string | null;
  item_name: string | null;
  quantity: string;
  uom: string;
};

type OutputRow = {
  item_code: string;
  item_name: string | null;
  quantity: string;
  uom: string;
  allocation_pct: string;
  expected_yield_pct: string;
};

const ALLOCATION_TARGET_THOUSANDTHS = 100_000;
const ALLOCATION_TOLERANCE_THOUSANDTHS = 10;

export function validateDisassemblyAllocation(
  coProducts: readonly DisassemblyAllocationInput[],
): ValidateDisassemblyAllocationResult {
  let sum = 0;
  for (const cp of coProducts) {
    const value = decimalToThousandths(cp.allocation_pct ?? cp.allocationPct);
    if (value == null) {
      const allocation_sum = formatThousandths(sum);
      return {
        ok: false,
        error: `V-TEC-12: allocation_pct must be a numeric percent for every co-product`,
        allocation_sum,
      };
    }
    sum += value;
  }

  const allocation_sum = formatThousandths(sum);
  if (Math.abs(sum - ALLOCATION_TARGET_THOUSANDTHS) > ALLOCATION_TOLERANCE_THOUSANDTHS) {
    return {
      ok: false,
      error: `V-TEC-12: co-product allocation_pct sums to ${allocation_sum}, must equal 100 +/- 0.01`,
      allocation_sum,
    };
  }

  return { ok: true, allocation_sum };
}

export async function createDisassemblyBomDraft(
  params: unknown,
  supabaseClient?: QueryClient,
): Promise<CreateDisassemblyBomDraftResult> {
  const parsed = normalizeDisassemblyInput(params);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const input = parsed.input;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CreateDisassemblyBomDraftResult> => {
      const c = supabaseClient ?? (client as QueryClient);
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_CREATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows: verRows } = await c.query<{ next_version: number }>(
        `select coalesce(max(version), 0) + 1 as next_version
           from public.bom_headers
          where org_id = app.current_org_id() and product_id = $1`,
        [input.productId],
      );
      const version = Number(verRows[0]?.next_version ?? 1);

      const { rows: headerRows } = await c.query<{ id: string }>(
        `insert into public.bom_headers
           (org_id, product_id, item_id, origin_module, status, version, yield_pct, effective_from, notes, created_by_user, app_version, bom_type)
         values
           (app.current_org_id(), $1, (select id from public.items where org_id = app.current_org_id() and item_code = $1), 'technical', 'draft', $2, $3::numeric, coalesce($4::date, current_date), $5, $6::uuid, $7, $8)
         returning id`,
        [
          input.productId,
          version,
          input.yieldPct,
          input.effectiveFrom,
          input.notes,
          userId,
          APP_VERSION,
          input.bom_type,
        ],
      );
      const headerId = headerRows[0]?.id;
      if (!headerId) return { ok: false, error: 'persistence_failed' };

      await c.query(
        `insert into public.bom_lines
           (org_id, bom_header_id, line_no, item_id, component_code, component_type, quantity, uom, scrap_pct,
            manufacturing_operation_name, sequence, is_phantom)
         values
           (app.current_org_id(), $1::uuid, 1, $2::uuid, $3, $4, $5::numeric, $6, $7::numeric, $8, $9, $10)`,
        [
          headerId,
          input.inputLine.itemId,
          input.inputLine.componentCode,
          input.inputLine.componentType,
          input.inputLine.quantity,
          input.inputLine.uom,
          input.inputLine.scrapPct,
          input.inputLine.manufacturingOperationName,
          input.inputLine.sequence,
          input.inputLine.isPhantom,
        ],
      );

      for (const cp of input.coProducts) {
        await c.query(
          `insert into public.bom_co_products
             (org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, expected_yield_pct, is_byproduct)
           values
             (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, $4, $5::numeric, $6::numeric, false)`,
          [headerId, cp.itemId, cp.quantity, cp.uom, cp.allocationPct, cp.expectedYieldPct],
        );
      }

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_CREATED,
        resourceId: headerId,
        beforeState: null,
        afterState: {
          productId: input.productId,
          version,
          status: 'draft',
          bomType: input.bom_type,
          inputLineCount: 1,
          coProductCount: input.coProducts.length,
        },
      });

      await writeOutbox(c, {
        orgId,
        eventType: EVENT_BOM_VERSION_SUBMITTED,
        aggregateType: 'bom_header',
        aggregateId: headerId,
        payload: {
          product_id: input.productId,
          version,
          status: 'draft',
          bom_type: input.bom_type,
          actor_user_id: userId,
        },
      });

      safeRevalidatePath('/technical/bom');
      return { ok: true, data: { id: headerId, version } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'conflict: duplicate BOM version' };
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'invalid reference' };
    console.error('[technical/bom] createDisassemblyBomDraft persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getDisassemblyBom(
  bomHeaderId: string,
  supabaseClient?: QueryClient,
): Promise<GetDisassemblyBomResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<GetDisassemblyBomResult> => {
      const c = supabaseClient ?? (client as QueryClient);
      const { rows: headerRows } = await c.query<HeaderRow>(
        `select h.product_id, h.status, h.version, h.yield_pct::text as yield_pct,
                h.effective_from, h.effective_to, h.notes
           from public.bom_headers h
          where h.org_id = app.current_org_id()
            and h.id = $1::uuid
            and h.bom_type = 'disassembly'
          limit 1`,
        [bomHeaderId],
      );
      const header = headerRows[0];
      if (!header) return { ok: false, error: 'not_found' };

      const [{ rows: inputRows }, { rows: outputRows }] = await Promise.all([
        c.query<InputLineRow>(
          `select bl.component_code,
                  coalesce(i.item_code, bl.component_code) as item_code,
                  i.name as item_name,
                  bl.quantity::text as quantity,
                  bl.uom
             from public.bom_lines bl
             left join public.items i
               on i.org_id = bl.org_id
              and i.id = bl.item_id
            where bl.org_id = app.current_org_id()
              and bl.bom_header_id = $1::uuid
            order by bl.line_no asc`,
          [bomHeaderId],
        ),
        c.query<OutputRow>(
          `select i.item_code,
                  i.name as item_name,
                  cp.quantity::text as quantity,
                  cp.uom,
                  cp.allocation_pct::text as allocation_pct,
                  cp.expected_yield_pct::text as expected_yield_pct
             from public.bom_co_products cp
             join public.items i
               on i.org_id = cp.org_id
              and i.id = cp.co_product_item_id
            where cp.org_id = app.current_org_id()
              and cp.bom_header_id = $1::uuid
            order by i.item_code asc`,
          [bomHeaderId],
        ),
      ]);

      const inputLine = inputRows[0];
      if (!inputLine) return { ok: false, error: 'not_found' };

      const allocationSum = outputRows.reduce(
        (acc, row) => acc + (decimalToThousandths(row.allocation_pct) ?? 0),
        0,
      );

      return {
        ok: true,
        data: {
          header: {
            bom_type: 'disassembly',
            product_code: header.product_id,
            status: header.status,
            version: Number(header.version),
            yield_pct: String(header.yield_pct),
            effective_from: toIso(header.effective_from) ?? '',
            effective_to: toIso(header.effective_to),
            notes: header.notes,
          },
          input_item: {
            code: inputLine.item_code ?? inputLine.component_code,
            name: inputLine.item_name,
            quantity: String(inputLine.quantity),
            uom: inputLine.uom,
          },
          outputs: outputRows.map((row) => ({
            code: row.item_code,
            name: row.item_name,
            quantity: String(row.quantity),
            uom: row.uom,
            allocation_pct: String(row.allocation_pct),
            expected_yield_pct: String(row.expected_yield_pct),
          })),
          allocation_sum: formatThousandths(allocationSum),
        },
      };
    });
  } catch (err) {
    console.error('[technical/bom] getDisassemblyBom load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}

function normalizeDisassemblyInput(
  value: unknown,
): { ok: true; input: NormalizedDisassemblyInput } | { ok: false; error: string } {
  const root = asRecord(value);
  if (!root) return validationError('payload must be an object');

  const bomType = getString(root, 'bom_type', 'bomType') ?? 'disassembly';
  if (bomType !== 'disassembly') return validationError('bom_type must be disassembly');

  const rawLines = getArray(root, 'lines', 'input_lines', 'inputLines');
  if (rawLines.length !== 1) return validationError('disassembly BOM requires exactly one input line');

  const rawCoProducts = getArray(root, 'coProducts', 'co_products', 'outputs');
  if (rawCoProducts.length === 0) return validationError('disassembly BOM requires at least one co-product');

  const lineRecord = asRecord(rawLines[0]);
  if (!lineRecord) return validationError('input line must be an object');

  const productId =
    getString(root, 'productId', 'product_id') ??
    getString(lineRecord, 'componentCode', 'component_code', 'itemCode', 'item_code');
  if (!productId) return validationError('productId or input component code is required');

  const inputLine = normalizeInputLine(lineRecord, productId);
  if (!inputLine) return validationError('input line is invalid');

  const coProducts: NormalizedCoProduct[] = [];
  for (const raw of rawCoProducts) {
    const record = asRecord(raw);
    if (!record) return validationError('co-product must be an object');
    const cp = normalizeCoProduct(record, inputLine.uom);
    if (!cp) return validationError('co-product item, allocation_pct, and expected_yield_pct are required');
    coProducts.push(cp);
  }

  const allocation = validateDisassemblyAllocation(
    coProducts.map((cp) => ({ allocation_pct: cp.allocationPct })),
  );
  if (!allocation.ok) return { ok: false, error: allocation.error };

  return {
    ok: true,
    input: {
      bom_type: 'disassembly',
      productId,
      yieldPct: normalizeDecimal(getValue(root, 'yieldPct', 'yield_pct')) ?? '100',
      effectiveFrom: getString(root, 'effectiveFrom', 'effective_from'),
      notes: getString(root, 'notes'),
      inputLine,
      coProducts,
    },
  };
}

function normalizeInputLine(record: Record<string, unknown>, productId: string): NormalizedLine | null {
  const componentCode = getString(record, 'componentCode', 'component_code', 'itemCode', 'item_code') ?? productId;
  const quantity = normalizeDecimal(getValue(record, 'quantity', 'qty')) ?? '1';
  const uom = getString(record, 'uom', 'unit') ?? 'each';
  const scrapPct = normalizeDecimal(getValue(record, 'scrapPct', 'scrap_pct')) ?? '0';
  return {
    itemId: getString(record, 'itemId', 'item_id'),
    componentCode,
    componentType: getString(record, 'componentType', 'component_type'),
    quantity,
    uom,
    scrapPct,
    manufacturingOperationName: getString(record, 'manufacturingOperationName', 'manufacturing_operation_name'),
    sequence: getInteger(record, 'sequence'),
    isPhantom: getBoolean(record, 'isPhantom', 'is_phantom') ?? false,
  };
}

function normalizeCoProduct(record: Record<string, unknown>, fallbackUom: string): NormalizedCoProduct | null {
  const itemId = getString(record, 'itemId', 'item_id', 'coProductItemId', 'co_product_item_id');
  const allocationPct = normalizeDecimal(getValue(record, 'allocationPct', 'allocation_pct'));
  const expectedYieldPctValue = getValue(record, 'expectedYieldPct', 'expected_yield_pct');
  const expectedYieldPct = normalizeDecimal(expectedYieldPctValue);
  if (!itemId || !allocationPct || expectedYieldPctValue == null || !expectedYieldPct) return null;

  return {
    itemId,
    quantity: normalizeDecimal(getValue(record, 'quantity', 'qty')) ?? '1',
    uom: getString(record, 'uom', 'unit') ?? fallbackUom,
    allocationPct,
    expectedYieldPct,
  };
}

function validationError(message: string): { ok: false; error: string } {
  return { ok: false, error: `V-TEC-12: ${message}` };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getArray(record: Record<string, unknown>, ...keys: string[]): unknown[] {
  const value = getValue(record, ...keys);
  return Array.isArray(value) ? value : [];
}

function getValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  }
  return undefined;
}

function getString(record: Record<string, unknown>, ...keys: string[]): string | null {
  const value = getValue(record, ...keys);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | null {
  const value = getValue(record, ...keys);
  return typeof value === 'boolean' ? value : null;
}

function getInteger(record: Record<string, unknown>, ...keys: string[]): number | null {
  const value = getValue(record, ...keys);
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(number) ? number : null;
}

function normalizeDecimal(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? String(value) : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d+(?:\.\d+)?$/.test(trimmed) ? trimmed : null;
}

function decimalToThousandths(value: unknown): number | null {
  const decimal = normalizeDecimal(value);
  if (!decimal) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!match) return null;
  const whole = Number(match[1]);
  if (!Number.isSafeInteger(whole)) return null;
  const fraction = match[2] ?? '';
  const padded = `${fraction}0000`;
  const firstThree = Number(padded.slice(0, 3));
  const roundDigit = Number(padded.slice(3, 4));
  return whole * 1000 + firstThree + (roundDigit >= 5 ? 1 : 0);
}

function formatThousandths(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 1000);
  const fraction = String(abs % 1000).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

function toIso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
