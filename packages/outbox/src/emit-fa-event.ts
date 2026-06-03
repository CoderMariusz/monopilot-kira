import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import type { TablesRelationalConfig } from 'drizzle-orm/relations';
import { outboxEvents } from '@monopilot/db';
import type { FaEventType } from './event-types.js';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface EmitFaEventContext {
  orgId: string;
  appVersion: string;
  dedupKey?: string;
}

type OutboxTx<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> = PgTransaction<NodePgQueryResultHKT, TFullSchema, TSchema>;

function aggregateTypeFor(eventType: FaEventType): 'fa' | 'brief' {
  return eventType === 'brief.converted' ? 'brief' : 'fa';
}

export async function emitFaEvent<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
>(
  tx: OutboxTx<TFullSchema, TSchema>,
  eventType: FaEventType,
  aggregateId: string,
  payload: JsonValue,
  ctx: EmitFaEventContext,
): Promise<void> {
  const values = {
    orgId: ctx.orgId,
    eventType,
    aggregateType: aggregateTypeFor(eventType),
    aggregateId,
    payload,
    appVersion: ctx.appVersion,
    dedupKey: ctx.dedupKey,
  };

  if (ctx.dedupKey) {
    await tx.insert(outboxEvents).values(values).onConflictDoNothing({
      target: [outboxEvents.orgId, outboxEvents.dedupKey],
      where: sql`${outboxEvents.dedupKey} is not null`,
    });
    return;
  }

  await tx.insert(outboxEvents).values(values);
}
