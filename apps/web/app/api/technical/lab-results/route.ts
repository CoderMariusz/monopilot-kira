/**
 * T-020 — Route Handler: GET/POST /api/technical/lab-results
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §5.5, §10.6, §10.8.
 *
 * GET  — Technical READ-ONLY read model over the Quality-owned `lab_results`
 *        table. Org-scoped under withOrgContext + RLS (app.current_org_id()),
 *        RBAC-gated on the Technical permission family. Optional filters:
 *        ?test_type=&result_status=&item_id=&limit=.
 *
 * POST — Technical has NO write path. The handler delegates to the Quality write
 *        BRIDGE; in Phase 1 no bridge exists so it returns HTTP 501
 *        QUALITY_BRIDGE_MISSING and writes nothing (AC2). It NEVER INSERTs into
 *        lab_results from Technical code.
 *
 * Red lines: lab_results is Quality-owned (read-only here); no external lab API
 * calls; FG canonical (no FA aliases).
 */

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  ALL_TECHNICAL_PERMISSIONS,
  type Permission,
} from '../../../../../../packages/rbac/src/permissions.enum.js';
import {
  buildLabResultsQuery,
  parseLabResultsFilter,
  toLabResultReadRow,
  type LabResultDbRow,
} from '../../../../lib/technical/lab/read-model';
import {
  QUALITY_BRIDGE_MISSING,
  submitLabResultViaBridge,
} from '../../../../lib/technical/lab/quality-bridge-client';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const TECHNICAL_PERMISSIONS = ALL_TECHNICAL_PERMISSIONS as readonly Permission[];

/**
 * Lab read is gated on holding ANY Technical permission (a Technical user). No
 * dedicated `technical.lab.read` enum string exists yet; minting one would
 * require an enum-lock + grant-seed migration out of T-020's scope. RLS still
 * scopes every row to the caller's org regardless.
 */
async function callerIsTechnical(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp
         on rp.role_id = r.id and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
        )
      limit 1`,
    [userId, orgId, TECHNICAL_PERMISSIONS as readonly string[]],
  );
  return rows.length > 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = parseLabResultsFilter(url.searchParams);
  if (!parsed.ok) {
    return json({ error: parsed.error, field: parsed.field }, 400);
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<Response> => {
      const c = client as QueryClient;
      if (!(await callerIsTechnical(c, userId, orgId))) {
        return json({ error: 'forbidden' }, 403);
      }

      const { text, values } = buildLabResultsQuery(parsed.filter);
      const { rows } = await c.query<LabResultDbRow>(text, values);
      const data = rows
        .map(toLabResultReadRow)
        .filter((r): r is NonNullable<typeof r> => r !== null);

      return json({ data, count: data.length }, 200);
    });
  } catch (err) {
    console.error('[technical/lab-results] GET load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return json({ error: 'persistence_failed' }, 500);
  }
}

/**
 * POST — Technical may NOT author lab_results. Delegate to the Quality bridge;
 * with no bridge registered (Phase 1) this is a hard 501 with no write (AC2).
 */
export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_input' }, 400);
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<Response> => {
      const c = client as QueryClient;
      if (!(await callerIsTechnical(c, userId, orgId))) {
        return json({ error: 'forbidden' }, 403);
      }

      const result = await submitLabResultViaBridge({
        orgId,
        actorUserId: userId,
        itemId: (body.item_id as string | undefined) ?? null,
        workOrderId: (body.work_order_id as string | undefined) ?? null,
        testType: String(body.test_type ?? ''),
        testCode: (body.test_code as string | undefined) ?? null,
        resultValue: (body.result_value as string | undefined) ?? null,
        resultUnit: (body.result_unit as string | undefined) ?? null,
        resultStatus: String(body.result_status ?? ''),
        thresholdRlu: (body.threshold_rlu as string | undefined) ?? null,
        testedAt: (body.tested_at as string | undefined) ?? null,
        labProvider: (body.lab_provider as string | undefined) ?? null,
        notes: (body.notes as string | undefined) ?? null,
      });

      if (!result.ok) {
        if (result.error === QUALITY_BRIDGE_MISSING) {
          return json({ error: QUALITY_BRIDGE_MISSING, message: result.message }, 501);
        }
        const status = result.error === 'forbidden' ? 403 : result.error === 'invalid_input' ? 400 : 500;
        return json({ error: result.error, message: result.message }, status);
      }

      return json({ data: { id: result.labResultId } }, 201);
    });
  } catch (err) {
    console.error('[technical/lab-results] POST bridge_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return json({ error: 'persistence_failed' }, 500);
  }
}
