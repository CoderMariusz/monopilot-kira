'use server';

/**
 * T-089 — GDPR right-to-erasure Server Action (admin only).
 *
 * Thin RBAC-gated wrapper over the NPD erasure path. The heavy lifting lives in
 * the SECURITY DEFINER SQL function `public.gdpr_redact_user_pii(target_user_id)`
 * (migration 115) which is also the body of the foundation `@monopilot/gdpr`
 * NPD handler (`packages/db/src/erasure/npd.ts`). This action exposes the same
 * org-scoped, audited erasure to the admin UI.
 *
 * Red lines:
 *  - Admin-only: callers without `gdpr.erasure.execute` get `{ ok: false, error: 'forbidden' }`.
 *  - Org-scoped + audited: the SQL function filters by `app.current_org_id()` and
 *    writes a `gdpr.erasure_executed` audit_events row.
 *  - Pseudonymise, never delete (enforced by the SQL function).
 */
import { withOrgContext } from '../../../../lib/auth/with-org-context';

const REQUIRED_PERMISSION = 'gdpr.erasure.execute' as const;

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type RedactUserInput = {
  targetUserId: string;
};

export type RedactUserResult =
  | { ok: true; data: { targetUserId: string; counts: Record<string, number> } }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hasGdprErasurePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, REQUIRED_PERMISSION],
  );
  return rows.length > 0;
}

export async function redactUser(input: RedactUserInput): Promise<RedactUserResult> {
  if (!input || typeof input.targetUserId !== 'string' || !UUID_RE.test(input.targetUserId)) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext<RedactUserResult>(async (ctx): Promise<RedactUserResult> => {
      const context = ctx as OrgContextLike;

      if (!(await hasGdprErasurePermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await context.client.query<{ counts: Record<string, number> }>(
        `select public.gdpr_redact_user_pii($1::uuid) as counts`,
        [input.targetUserId],
      );

      if (rows.length < 1) {
        return { ok: false, error: 'persistence_failed' };
      }

      return {
        ok: true,
        data: { targetUserId: input.targetUserId, counts: rows[0]!.counts },
      };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
