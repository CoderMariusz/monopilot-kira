import { NextResponse, type NextRequest } from 'next/server';

import { requireScannerSession } from '../../../../lib/scanner/guard';
import {
  isRecord,
  jsonError,
  jsonOk,
  nullableStringField,
  readJson,
  stringField,
} from '../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../lib/scanner/with-scanner-org';

type LaborAction = 'in' | 'out';
type LaborState = 'clocked_in' | 'clocked_out';
type LaborQueryClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isLaborAction(value: string | null): value is LaborAction {
  return value === 'in' || value === 'out';
}

function isUuid(value: string | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function invalidRequest() {
  return jsonError('invalid_request', 400);
}

async function clockIn(
  client: LaborQueryClient,
  input: { userId: string; woId: string; lineId: string | null },
) {
  await client.query(
    `update public.wo_labor_log
        set ended_at = pg_catalog.now()
      where org_id = app.current_org_id()
        and user_id = $1::uuid
        and ended_at is null`,
    [input.userId],
  );

  await client.query(
    `insert into public.wo_labor_log
       (org_id, wo_id, user_id, line_id, source, started_at, ended_at)
     values (app.current_org_id(), $1::uuid, $2::uuid, $3, $4, pg_catalog.now(), null)`,
    [input.woId, input.userId, input.lineId, 'scanner'],
  );
}

async function clockOut(
  client: LaborQueryClient,
  input: { userId: string; woId: string },
) {
  await client.query(
    `update public.wo_labor_log
        set ended_at = pg_catalog.now()
      where org_id = app.current_org_id()
        and user_id = $1::uuid
        and wo_id = $2::uuid
        and ended_at is null`,
    [input.userId, input.woId],
  );
}

function toIsoTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

async function getCurrentLaborState(
  client: LaborQueryClient,
  input: { userId: string; woId: string },
): Promise<{ state: LaborState; since?: string }> {
  const result = await client.query<{ since: Date | string | null }>(
    `select started_at as since
       from public.wo_labor_log
      where org_id = app.current_org_id()
        and user_id = $1::uuid
        and wo_id = $2::uuid
        and ended_at is null
      order by started_at desc
      limit 1`,
    [input.userId, input.woId],
  );
  const row = result.rows[0];
  if (!row) return { state: 'clocked_out' };
  const since = toIsoTimestamp(row.since);
  return since ? { state: 'clocked_in', since } : { state: 'clocked_in' };
}

export async function GET(request: NextRequest) {
  try {
    const woId = new URL(request.url).searchParams.get('woId')?.trim() ?? null;
    if (!isUuid(woId)) return invalidRequest();

    const result = await requireScannerSession(request, null, 'scanner.labor', async ({ client, session }) =>
      withScannerOrg(client, session, async ({ client: scopedClient, session: scopedSession }) =>
        withTxnOrgContext(scopedClient, scopedSession.org_id, scopedSession.user_id, async () =>
          NextResponse.json(
            await getCurrentLaborState(scopedClient, {
              userId: scopedSession.user_id,
              woId,
            }),
          ),
        ),
      ),
    );

    if ('guardError' in result) return jsonError('unauthorized', 401);
    return result;
  } catch {
    return jsonError('labor_failed', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (!isRecord(body)) return invalidRequest();

    const action = stringField(body, 'action');
    const woId = stringField(body, 'woId');
    const lineId = nullableStringField(body, 'lineId');

    if (!isLaborAction(action) || !isUuid(woId) || (lineId === undefined && 'lineId' in body)) {
      return invalidRequest();
    }

    const result = await requireScannerSession(request, body, 'scanner.labor', async ({ client, session }) =>
      withScannerOrg(client, session, async ({ client: scopedClient, session: scopedSession }) =>
        withTxnOrgContext(scopedClient, scopedSession.org_id, scopedSession.user_id, async () => {
          if (action === 'in') {
            await clockIn(scopedClient, {
              userId: scopedSession.user_id,
              woId,
              lineId: lineId ?? null,
            });
            return jsonOk({ state: 'clocked_in' });
          }

          await clockOut(scopedClient, {
            userId: scopedSession.user_id,
            woId,
          });
          return jsonOk({ state: 'clocked_out' });
        }),
      ),
    );

    if ('guardError' in result) return jsonError('unauthorized', 401);
    return result;
  } catch {
    return jsonError('labor_failed', 500);
  }
}
