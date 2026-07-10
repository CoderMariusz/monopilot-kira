import type { z } from 'zod';

import type { PoImportError } from './import-po.types';
import { CreatePurchaseOrderInput } from './create-purchase-order-core';

type ImportGroupRow = {
  rowNumber: number;
  row: { notes?: string };
};

type ImportGroup = {
  externalRef: string;
  rows: ImportGroupRow[];
};

type CreatePurchaseOrderLinePayload = {
  itemId: string;
  qty: string;
  uom: string;
  unitPrice: string;
  lineNo: number;
};

const HEADER_COLUMN_MAP: Record<string, string> = {
  poNumber: 'external_ref',
  currency: 'currency',
  notes: 'notes',
  expectedDelivery: 'expected_delivery',
  supplierId: 'supplier_code',
  status: 'external_ref',
};

const LINE_COLUMN_MAP: Record<string, string> = {
  qty: 'qty',
  uom: 'uom',
  unitPrice: 'price',
  itemId: 'item_code',
  lineNo: 'item_code',
};

function issueMessage(issue: z.ZodIssue): string {
  return issue.message;
}

function rowErrorsForColumn(
  group: ImportGroup,
  column: string,
  message: string,
): Array<{ rowNumber: number; errors: PoImportError[] }> {
  if (column === 'notes') {
    const noteRows = group.rows.filter((entry) => typeof entry.row.notes === 'string' && entry.row.notes.trim().length > 0);
    const targets = noteRows.length > 0 ? noteRows : group.rows;
    return targets.map((entry) => ({
      rowNumber: entry.rowNumber,
      errors: [{ column, message }],
    }));
  }
  return group.rows.map((entry) => ({
    rowNumber: entry.rowNumber,
    errors: [{ column, message }],
  }));
}

export function mapZodIssuesToGroupRowErrors(
  issues: z.ZodIssue[],
  group: ImportGroup,
): Array<{ rowNumber: number; errors: PoImportError[] }> {
  const byRow = new Map<number, PoImportError[]>();

  function push(rowNumber: number, error: PoImportError) {
    const existing = byRow.get(rowNumber) ?? [];
    existing.push(error);
    byRow.set(rowNumber, existing);
  }

  for (const issue of issues) {
    const path = issue.path;
    const message = issueMessage(issue);

    if (path[0] === 'lines') {
      if (path.length === 1) {
        for (const entry of group.rows) {
          push(entry.rowNumber, { column: 'item_code', message });
        }
        continue;
      }
      if (typeof path[1] === 'number') {
        const entry = group.rows[path[1]];
        const field = path[2];
        const column =
          typeof field === 'string' ? (LINE_COLUMN_MAP[field] ?? 'item_code') : 'item_code';
        if (entry) {
          push(entry.rowNumber, { column, message });
        } else {
          for (const row of group.rows) {
            push(row.rowNumber, { column: 'item_code', message });
          }
        }
        continue;
      }
    }

    const headerKey = typeof path[0] === 'string' ? path[0] : 'external_ref';
    const column = HEADER_COLUMN_MAP[headerKey] ?? 'external_ref';
    for (const mapped of rowErrorsForColumn(group, column, message)) {
      for (const err of mapped.errors) {
        push(mapped.rowNumber, err);
      }
    }
  }

  return Array.from(byRow.entries()).map(([rowNumber, errors]) => ({ rowNumber, errors }));
}

export function validateImportGroupSchema(
  group: ImportGroup,
  input: {
    poNumber: string;
    supplierId: string;
    expectedDelivery?: string;
    currency: string;
    notes?: string;
    lines: CreatePurchaseOrderLinePayload[];
  },
): Array<{ rowNumber: number; errors: PoImportError[] }> {
  const parsed = CreatePurchaseOrderInput.safeParse({
    poNumber: input.poNumber,
    supplierId: input.supplierId,
    status: 'draft',
    expectedDelivery: input.expectedDelivery,
    currency: input.currency,
    notes: input.notes,
    lines: input.lines,
  });
  if (parsed.success) return [];
  return mapZodIssuesToGroupRowErrors(parsed.error.issues, group);
}
