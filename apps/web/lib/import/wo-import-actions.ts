'use server';

import { createWorkOrder } from '../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/createWorkOrder';
import type { ImportError } from './po-import-validator';
import type { PreviewWoRow } from './wo-import-validator';

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00.000Z`).toISOString();
  return value;
}

export async function confirmWoImport(rows: PreviewWoRow[]): Promise<{ created: number; errors: ImportError[] }> {
  const groups = new Map<string, PreviewWoRow[]>();
  for (const row of rows) {
    const key = row.woNumber ?? `__auto__:${row.rowNumber}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  let created = 0;
  const errors: ImportError[] = [];

  for (const groupRows of groups.values()) {
    const first = groupRows[0];
    if (!first) continue;

    const totalQty = groupRows
      .reduce((sum, row) => sum + Number(row.qty), 0)
      .toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 3 });
    const notes = [
      first.woNumber ? `Imported WO number: ${first.woNumber}` : undefined,
      first.routingId ? `Imported routing_id: ${first.routingId}` : undefined,
      ...groupRows.map((row) => row.notes).filter(Boolean),
    ]
      .filter(Boolean)
      .join('\n');

    const result = await createWorkOrder({
      productId: first.itemId,
      itemCode: first.itemCode,
      plannedQuantity: totalQty,
      quantityEntered: totalQty,
      quantityEnteredUom: 'base',
      scheduledStartTime: toIso(first.scheduledStartTime),
      notes: notes || undefined,
    });

    if (result.ok) {
      created += 1;
    } else {
      for (const row of groupRows) {
        errors.push({
          rowNumber: row.rowNumber,
          column: 'wo_number',
          message: `Could not create work order: ${result.error}.`,
        });
      }
    }
  }

  return { created, errors };
}
