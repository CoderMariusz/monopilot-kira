import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { writeScannerSessionAudit } from '../../../../lib/scanner/audit';
import { requireScannerSession } from '../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../lib/scanner/route-utils';
import { ProductionActionError, QualityHoldError } from '../../../../lib/production/shared';

import type { NextRequest } from 'next/server';
import type { QueryClient } from '../../../../lib/scanner/db';
import type { ScannerSessionRow } from '../../../../lib/scanner/session';

export const SCANNER_P1_AUTH_HEADER = 'P1 scanner auth: valid bearer scanner session; no permission bag.';

export type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export type DecimalString = string;

export function isDecimalString(value: unknown): value is DecimalString {
  return typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim());
}

export async function readRecordBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await readJson(request);
  return isRecord(body) ? body : null;
}

export async function getWoId(context: RouteContext): Promise<string> {
  const params = await context.params;
  return params.id;
}

export function scannerOk<T extends Record<string, unknown>>(body: T, status = 200): NextResponse {
  const response = jsonOk(body, status);
  response.headers.set('x-monopilot-scanner-auth', SCANNER_P1_AUTH_HEADER);
  return response;
}

export function scannerError(error: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  const response = jsonError(error, status, extra);
  response.headers.set('x-monopilot-scanner-auth', SCANNER_P1_AUTH_HEADER);
  return response;
}

export async function scannerValidationError(
  request: NextRequest,
  body: unknown,
  operation: string,
  resultCode: string,
  status: number,
  ext?: Record<string, unknown>,
): Promise<NextResponse> {
  const result = await requireScannerSession(request, body, operation, async ({ client, session }) => {
    await auditAttempt(client, session, operation, resultCode, ext);
    return scannerError(resultCode, status, ext);
  });
  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}

export function uuidFromSeed(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${(
    (parseInt(h.slice(16, 18), 16) & 0x3f) |
    0x80
  )
    .toString(16)
    .padStart(2, '0')}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export function scannerTransactionId(kind: 'output' | 'waste' | 'start', clientOpId: string): string {
  return uuidFromSeed(`scanner.production.${kind}:${clientOpId}`);
}

export function productionErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProductionActionError) {
    return scannerError(error.code, error.status, error.details ?? {});
  }
  if (error instanceof QualityHoldError) {
    return scannerError(error.code, error.status, error.details ?? {});
  }
  throw error;
}

export async function auditAttempt(
  client: QueryClient,
  session: ScannerSessionRow,
  operation: string,
  resultCode: string,
  ext?: Record<string, unknown>,
): Promise<void> {
  await writeScannerSessionAudit(client, session, operation, resultCode, ext);
}

export function requiredClientOpId(body: Record<string, unknown>): string | null {
  return stringField(body, 'clientOpId');
}

export type ParsedClientOpId =
  | { ok: true; clientOpId: string }
  | { ok: false; error: 'missing_fields' | 'invalid_client_op_id' };

/** Trimmed, non-empty clientOpId capped at 120 chars (receive-po contract). */
export function parseRequiredClientOpId(body: Record<string, unknown>): ParsedClientOpId {
  const raw = body.clientOpId;
  if (typeof raw !== 'string') return { ok: false, error: 'missing_fields' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'missing_fields' };
  if (trimmed.length > 120) return { ok: false, error: 'invalid_client_op_id' };
  return { ok: true, clientOpId: trimmed };
}
