import type { Pool } from 'pg';
import * as cascadeHandlerModule from './cascade-handler.js';

export interface DispatchCascadeMessage {
  orgId?: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
}

export interface DispatchCascadeOptions {
  pool: Pool;
}

const CASCADE_EVENT = 'fg.intermediate_code_changed';

export function isCascadeEvent(eventType: string): boolean {
  return (
    eventType.includes('manufacturing_operation') ||
    eventType.includes('cascade') ||
    eventType === CASCADE_EVENT
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseOperationFieldIndex(
  msg: DispatchCascadeMessage,
): 1 | 2 | 3 | 4 {
  const explicit = msg.payload.operation_field_index ?? msg.payload.operationFieldIndex;
  if (typeof explicit === 'number' && Number.isInteger(explicit)) {
    if (explicit >= 1 && explicit <= 4) return explicit as 1 | 2 | 3 | 4;
  }
  if (typeof explicit === 'string' && /^[1-4]$/.test(explicit)) {
    return Number.parseInt(explicit, 10) as 1 | 2 | 3 | 4;
  }

  const column = stringValue(msg.payload.column);
  const columnMatch = column?.match(/^intermediate_code_p([1-4])$/);
  if (columnMatch?.[1]) {
    return Number.parseInt(columnMatch[1], 10) as 1 | 2 | 3 | 4;
  }

  const eventMatch = msg.eventType.match(/manufacturing_operation_([1-4])/);
  if (eventMatch?.[1]) {
    return Number.parseInt(eventMatch[1], 10) as 1 | 2 | 3 | 4;
  }

  return 1;
}

function parseOperationName(
  msg: DispatchCascadeMessage,
  operationFieldIndex: 1 | 2 | 3 | 4,
): string | undefined {
  return (
    stringValue(msg.payload.operation_name) ??
    stringValue(msg.payload.operationName) ??
    stringValue(msg.payload[`manufacturing_operation_${operationFieldIndex}`])
  );
}

/**
 * Dispatch a cascade outbox message to the canonical rule-engine cascade
 * handler. Non-cascade messages intentionally no-op.
 */
export async function dispatchCascade(
  msg: DispatchCascadeMessage,
  opts: DispatchCascadeOptions,
): Promise<void> {
  if (!isCascadeEvent(msg.eventType)) {
    return;
  }

  const orgId = stringValue(msg.payload.org_id) ?? stringValue(msg.payload.orgId) ?? msg.orgId;
  const fgId =
    stringValue(msg.payload.fg_id) ??
    stringValue(msg.payload.fgId) ??
    (msg.aggregateType === 'fg' ? msg.aggregateId : undefined);
  const operationFieldIndex = parseOperationFieldIndex(msg);
  const operationName = parseOperationName(msg, operationFieldIndex);

  if (!orgId) {
    throw new Error('cascade_dispatch_missing_org_id');
  }
  if (!fgId) {
    throw new Error('cascade_dispatch_missing_fg_id');
  }
  if (!operationName) {
    throw new Error('cascade_dispatch_missing_operation_name');
  }

  await cascadeHandlerModule.runCascade({
    orgId,
    fgId,
    operationFieldIndex,
    operationName,
    pool: opts.pool,
    dryRun: false,
  });
}
