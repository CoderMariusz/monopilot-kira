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
import { isUuid } from '../site-access';

type LaborAction = 'in' | 'out';
type LaborState = 'clocked_in' | 'clocked_out';
type LaborQueryClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

function isLaborAction(value: string | null): value is LaborAction {
  return value === 'in' || value === 'out';
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

async function canSeeWorkOrder(client: LaborQueryClient, woId: string): Promise<boolean | null> {
  const result = await client.query<{ allowed: boolean }>(
    `select app.user_can_see_site(wo.site_id) as allowed
       from public.work_orders wo
      where wo.org_id = app.current_org_id()
        and wo.id = $1::uuid
      limit 1`,
    [woId],
  );
  return result.rows[0]?.allowed ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const woId = new URL(request.url).searchParams.get('woId')?.trim() ?? null;
    if (!isUuid(woId)) return invalidRequest();

    const result = await requireScannerSession(request, null, 'scanner.labor', async ({ client, session }) =>
      withScannerOrg(client, session, async ({ client: scopedClient, session: scopedSession }) =>
        withTxnOrgContext(scopedClient, scopedSession.org_id, scopedSession.user_id, async () => {
          const allowed = await canSeeWorkOrder(scopedClient, woId);
          if (allowed === null) return jsonError('not_found', 404);
          if (!allowed) return jsonError('forbidden', 403);
          return NextResponse.json(
            await getCurrentLaborState(scopedClient, {
              userId: scopedSession.user_id,
              woId,
            }),
          );
        }),
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
          const allowed = await canSeeWorkOrder(scopedClient, woId);
          if (allowed === null) return jsonError('not_found', 404);
          if (!allowed) return jsonError('forbidden', 403);
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
