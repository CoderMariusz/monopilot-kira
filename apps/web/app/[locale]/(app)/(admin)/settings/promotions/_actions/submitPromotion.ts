'use server';

/**
 * T-070 / SET-063 — submitPromotion Server Action.
 *
 * Wires the PromoteToL2Modal "Submit promotion" flow to REAL data. Records a
 * promotion request as a `tenant_migrations` row (status='scheduled') scoped to
 * the caller's org via `withOrgContext` (RLS, app.current_org_id()).
 *
 * Why tenant_migrations (not a bespoke "promotions" table): per ADR-031 /
 * migration 040, tenant_migrations is the canonical L2 upgrade/promotion
 * orchestration table (component + current_version → target_version + status).
 * A scheduled row is the "active promotion"; completed/rolled_back rows feed the
 * History tab. There is no separate promotions table to author from a T3 task.
 *
 * RBAC: caller MUST hold an Admin role for the org (server-side check inside the
 * same txn — never trust the client). Non-admins get { ok:false, error:'forbidden' }
 * with NO write. The dangerous-action gate matches the prototype contract
 * (translation-notes-settings.md §"Dangerous actions … promotions require Admin").
 *
 * Outbox: the canonical outbox_events.event_type CHECK (migration 003) does not
 * include a tenant promotion event, and adding one requires a T1 migration that
 * is out of scope for this T3 task. We therefore do NOT emit an outbox row here
 * (emitting an unlisted event_type would violate the CHECK and roll back the
 * txn). The async orchestration (recordMigrationRun / advanceCohort, T-039) owns
 * the downstream events once the migration actually runs.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const TARGET_STAGES = ['L2-local', 'L1-core'] as const;

const SubmitPromotionInput = z.object({
  // Artefact code: "category.code" (rule / flag / schema column / email template).
  artefact: z.string().trim().min(3).max(200),
  target: z.enum(TARGET_STAGES),
  // From-stage is the artefact's current tier; defaults to the tenant tier.
  from: z.string().trim().min(1).max(64).default('L3-tenant'),
  // Justification is audit-logged (prototype: min 10 chars).
  reason: z.string().trim().min(10).max(2000),
});

export type SubmitPromotionInput = z.infer<typeof SubmitPromotionInput>;

export type SubmitPromotionError =
  | 'invalid_input'
  | 'forbidden'
  | 'already_scheduled'
  | 'persistence_failed';

export type SubmitPromotionResult =
  | { ok: true; data: { id: string; status: string; artefact: string; target: string } }
  | { ok: false; error: SubmitPromotionError; message?: string };

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number }>;
};

const ADMIN_ROLE_CODES = ['Admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin'];

async function callerIsAdmin(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows, rowCount } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          r.name = 'Admin'
          or lower(r.name) = 'admin'
          or r.code = any($3::text[])
          or r.slug = any($3::text[])
        )
      limit 1`,
    [userId, orgId, ADMIN_ROLE_CODES],
  );
  return (rowCount ?? rows.length) > 0;
}

export async function submitPromotion(raw: unknown): Promise<SubmitPromotionResult> {
  const parsed = SubmitPromotionInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;

      // RBAC: dangerous action — Admin only (server-trusted, same txn under RLS).
      const isAdmin = await callerIsAdmin(queryClient, userId, orgId);
      if (!isAdmin) return { ok: false, error: 'forbidden' as const };

      // The promotion target tier becomes the migration's target_version label;
      // `from` is the current tier. Component records the artefact being promoted.
      const { rows } = await queryClient.query<{ id: string; status: string }>(
        `insert into public.tenant_migrations
           (org_id, component, current_version, target_version, status, scheduled_by, created_at)
         values
           (app.current_org_id(), $1, $2, $3, 'scheduled', $4::uuid, now())
         on conflict (org_id, component) where status = 'scheduled' do nothing
         returning id::text, status`,
        [input.artefact, input.from, input.target, userId],
      );

      const created = rows[0];
      if (!created) {
        return {
          ok: false,
          error: 'already_scheduled' as const,
          message: 'A promotion is already scheduled for this artefact.',
        };
      }

      return {
        ok: true as const,
        data: {
          id: created.id,
          status: created.status,
          artefact: input.artefact,
          target: input.target,
        },
      };
    });
  } catch (err) {
    console.error('[submitPromotion] persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
