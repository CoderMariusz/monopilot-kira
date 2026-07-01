import { createHash } from 'node:crypto';

import { signEvent, type ESignReceipt, type ESignTxOptions } from '@monopilot/e-sign';

import {
  hasPermission,
  type ProductionContext,
  type QueryClient,
} from '../production/shared';

export const CORRECTION_REASON_CODES = [
  'entry_error',
  'wrong_quantity',
  'wrong_batch',
  'wrong_product',
  'other',
] as const;

export const CLOSED_WO_CORRECTION_PERMISSION = 'production.corrections.closed_wo';

export type CorrectionReasonCode = (typeof CORRECTION_REASON_CODES)[number];
export type CorrectionWoStatus = 'planned' | 'in_progress' | 'paused' | 'completed' | 'closed' | 'cancelled' | string | null;

export type CorrectionSignature = {
  pin: string;
  intent: string;
  reason?: string;
  nonce?: string;
  signerUserId?: string;
  subject?: Record<string, unknown>;
};

export type AssertCorrectionAllowedInput = {
  permission: string;
  woStatus?: CorrectionWoStatus;
  requireEsign?: boolean;
  signature?: CorrectionSignature;
};

export type AssertCorrectionAllowedResult = {
  signatureReceipt?: ESignReceipt;
};

export class CorrectionForbiddenError extends Error {
  readonly code = 'forbidden';

  constructor(message = 'forbidden') {
    super(message);
    this.name = 'CorrectionForbiddenError';
  }
}

export class CorrectionInvalidInputError extends Error {
  readonly code = 'invalid_input';

  constructor(message = 'invalid_input') {
    super(message);
    this.name = 'CorrectionInvalidInputError';
  }
}

export class CorrectionPersistenceError extends Error {
  readonly code = 'persistence_failed';

  constructor(message = 'persistence_failed') {
    super(message);
    this.name = 'CorrectionPersistenceError';
  }
}

export async function assertCorrectionAllowed(
  ctx: ProductionContext,
  input: AssertCorrectionAllowedInput,
): Promise<AssertCorrectionAllowedResult> {
  if (!(await hasPermission(ctx, input.permission))) {
    throw new CorrectionForbiddenError();
  }

  if (input.woStatus === 'closed' && !(await hasPermission(ctx, CLOSED_WO_CORRECTION_PERMISSION))) {
    throw new CorrectionForbiddenError('closed_wo_correction_forbidden');
  }

  if (input.woStatus === 'cancelled') {
    throw new CorrectionForbiddenError('cancelled_wo_correction_forbidden');
  }

  if (!input.requireEsign) return {};

  const signature = input.signature;
  if (!signature?.pin || !signature.intent) {
    throw new CorrectionInvalidInputError('signature_required');
  }

  const signatureReceipt = await signEvent(
    {
      signerUserId: signature.signerUserId ?? ctx.userId,
      pin: signature.pin,
      intent: signature.intent,
      reason: signature.reason,
      nonce: signature.nonce,
      subject: {
        correction_permission: input.permission,
        wo_status: input.woStatus ?? null,
        ...(signature.subject ?? {}),
      },
    },
    { client: ctx.client as ESignTxOptions['client'] },
  );

  return { signatureReceipt };
}

function deterministicUuid(seed: string): string {
  const hex = createHash('md5').update(seed).digest('hex');
  const v = hex.slice(0, 12) + '3' + hex.slice(13, 16) + ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 32);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

export function correctionTransactionId(params: {
  orgId: string;
  table: string;
  originalId: string;
  reasonCode: CorrectionReasonCode | string;
}): string {
  return deterministicUuid(`${params.orgId}:correction:${params.table}:${params.originalId}:${params.reasonCode}`);
}

function assertIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new CorrectionInvalidInputError(`invalid SQL identifier: ${identifier}`);
  }
  return identifier;
}

export type InsertCounterEntryInput = {
  table: string;
  originalId: string;
  reasonCode: CorrectionReasonCode | string;
  values: Record<string, unknown>;
  transactionIdColumn?: string;
  correctionOfColumn?: string;
  returning?: string;
};

export async function insertCounterEntry<TRow extends Record<string, unknown> = { id: string }>(
  ctx: { orgId: string; client: QueryClient },
  input: InsertCounterEntryInput,
): Promise<TRow> {
  const table = assertIdentifier(input.table);
  const correctionOfColumn = assertIdentifier(input.correctionOfColumn ?? 'correction_of_id');
  const returning = assertIdentifier(input.returning ?? 'id');
  const valueEntries = Object.entries(input.values);

  const columns = ['org_id', correctionOfColumn];
  const placeholders = ['app.current_org_id()', '$1::uuid'];
  const params: unknown[] = [input.originalId];

  if (input.transactionIdColumn) {
    columns.push(assertIdentifier(input.transactionIdColumn));
    params.push(correctionTransactionId({
      orgId: ctx.orgId,
      table,
      originalId: input.originalId,
      reasonCode: input.reasonCode,
    }));
    placeholders.push(`$${params.length}::uuid`);
  }

  for (const [column, value] of valueEntries) {
    columns.push(assertIdentifier(column));
    params.push(value);
    placeholders.push(`$${params.length}`);
  }

  const { rows } = await ctx.client.query<TRow>(
    `insert into public.${table}
       (${columns.join(', ')})
     values
       (${placeholders.join(', ')})
     returning ${returning}`,
    params,
  );

  const row = rows[0];
  if (!row) throw new CorrectionPersistenceError();
  return row;
}
