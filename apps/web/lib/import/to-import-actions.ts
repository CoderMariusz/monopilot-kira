'use server';

import { createTransferOrder } from '../../app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions';
import type { ImportError } from './po-import-validator';
import type { PreviewToRow } from './to-import-validator';

export async function confirmToImport(rows: PreviewToRow[]): Promise<{ created: number; errors: ImportError[] }> {
  const groups = new Map<string, PreviewToRow[]>();
  for (const row of rows) {
    const key = row.toNumber ?? `__auto__:${row.rowNumber}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  let created = 0;
  const errors: ImportError[] = [];

  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    if (!first) continue;

    const result = await createTransferOrder({
      toNumber: first.toNumber,
      fromWarehouseId: first.fromSiteId,
      toWarehouseId: first.toSiteId,
      status: 'draft',
      scheduledDate: first.scheduledDate,
      notes: groupRows.map((row) => row.notes).filter(Boolean).join('\n') || undefined,
      lines: groupRows.map((row, index) => ({
        itemId: row.itemId,
        qty: row.qty,
        uom: row.uom,
        lineNo: index + 1,
      })),
    });

    if (result.ok) {
      created += 1;
    } else {
      for (const row of groupRows) {
        errors.push({
          rowNumber: row.rowNumber,
          column: 'to_number',
          message: `Could not create transfer order: ${result.message ?? result.error}.`,
        });
      }
    }
  }

  return { created, errors };
}
