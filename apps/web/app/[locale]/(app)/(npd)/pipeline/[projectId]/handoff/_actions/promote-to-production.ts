'use server';

/**
 * NPD HANDOFF stage — `promoteToProduction` Server Action.
 *
 * The "✓ Promote to production BOM" footer button. Gate = `npd.handoff.promote`
 * (BYTE-IDENTICAL to the seeded permission string in migration 236).
 *
 * Order of operations (all inside ONE org-scoped transaction so any failure
 * rolls back atomically):
 *   1. RBAC — npd.handoff.promote (else `forbidden`).
 *   2. Load the project's handoff checklist + items (else `not_found`).
 *   3. Gate: the checklist must be COMPLETE (≥1 item, every item checked) — else
 *      `checklist_incomplete`. The screen also disables the button, but the
 *      server is the source of truth and never trusts the client.
 *   4. REUSE the existing factory-release flow (T-096
 *      `releaseNpdProjectToFactory`) — this is the real initial-BOM / factory
 *      release path. We do NOT author a new BOM-creation path here. Its own
 *      preflight (G4, FG candidate, active shared BOM, factory-spec) and its own
 *      RBAC (`npd.gate.approve`) still apply; a release blocker surfaces as
 *      `release_blocked` and a release-RBAC failure as `forbidden`.
 *   5. Record the handoff as promoted: set promote_to_production_date = today,
 *      bom_verification_status = 'promoted', stamp the destination_bom_code from
 *      the release result when present, + an append-only audit_events row.
 *
 * If the release flow reports it is not callable (e.g. preflight blockers), we do
 * NOT fake a BOM — we surface `release_blocked` honestly and leave the handoff
 * un-promoted.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { releaseNpdProjectToFactory } from '../../../../../../../(npd)/builder/_actions/release-npd-project-to-factory';
import { hasHandoffPermission } from './get-handoff';

const Input = z.object({
  projectId: z.string().uuid(),
});

export type PromoteToProductionInput = z.infer<typeof Input>;

export type PromoteToProductionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'checklist_incomplete'
  | 'release_blocked'
  | 'persistence_failed';

export type PromoteToProductionResult =
  | {
      ok: true;
      data: {
        projectId: string;
        destinationBomCode: string | null;
        promoteToProductionDate: string;
        /** True when the real factory-release flow committed the release. */
        releasedToFactory: boolean;
      };
    }
  | { ok: false; error: PromoteToProductionError; message?: string };

const PROMOTE_PERMISSION = 'npd.handoff.promote';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type ChecklistRow = { id: string; destination_bom_code: string | null };
type ItemCountRow = { total: string | number; checked: string | number };

export async function promoteToProduction(raw: unknown): Promise<PromoteToProductionResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const { projectId } = parsed.data;

  // The factory-release flow opens its own org-scoped txn (its own preflight +
  // RBAC). We call it BEFORE recording the handoff promotion so a release blocker
  // (or release-RBAC failure) aborts without faking a BOM. Authorization for the
  // handoff itself is checked first below.
  let releaseDestinationBom: string | null = null;
  let releasedToFactory = false;

  try {
    // 1–3: handoff RBAC + checklist-complete gate (own txn so we fail fast and
    // never invoke the release flow for an unauthorized / incomplete handoff).
    const gate = await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

      if (!(await hasHandoffPermission(ctx, PROMOTE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const checklistRes = await ctx.client.query<ChecklistRow>(
        `select id, destination_bom_code
           from public.handoff_checklists
          where project_id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const checklist = checklistRes.rows[0];
      if (!checklist) return { ok: false as const, error: 'not_found' as const };

      const countRes = await ctx.client.query<ItemCountRow>(
        `select count(*) as total,
                count(*) filter (where is_checked) as checked
           from public.handoff_checklist_items
          where handoff_checklist_id = $1::uuid
            and org_id = app.current_org_id()`,
        [checklist.id],
      );
      const total = Number(countRes.rows[0]?.total ?? 0);
      const checked = Number(countRes.rows[0]?.checked ?? 0);
      if (total === 0 || checked < total) {
        return { ok: false as const, error: 'checklist_incomplete' as const };
      }

      return { ok: true as const, checklistId: checklist.id, destinationBomCode: checklist.destination_bom_code };
    });

    if (!gate.ok) return gate;

    // 4: REUSE the real factory-release flow (T-096). It performs its own
    // preflight, RBAC (npd.gate.approve), outbox `fg.released_to_factory`, and
    // factory_release_status upsert. We never reimplement BOM creation here.
    const release = await releaseNpdProjectToFactory(projectId);
    if (!release.ok) {
      if (release.error === 'INVALID_INPUT') {
        return { ok: false, error: 'invalid_input' };
      }
      if (release.error === 'FORBIDDEN') {
        return { ok: false, error: 'forbidden' };
      }
      if (release.error === 'PRECONDITION_BLOCKERS') {
        // Honest: do NOT fake a BOM. The release pipeline is the BOM owner.
        return {
          ok: false,
          error: 'release_blocked',
          message: release.blockers?.map((b) => b.code).join(',') ?? undefined,
        };
      }
      return { ok: false, error: 'persistence_failed' };
    }
    releasedToFactory = true;
    releaseDestinationBom = release.data.activeBomHeaderId ?? gate.destinationBomCode ?? null;

    // 5: record the handoff promotion + audit (separate org-scoped txn).
    const recorded = await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

      const updated = await ctx.client.query<{ id: string; promote_to_production_date: string }>(
        `update public.handoff_checklists
            set bom_verification_status = 'promoted',
                promote_to_production_date = coalesce(promote_to_production_date, current_date),
                destination_bom_code = coalesce($2, destination_bom_code),
                updated_by = $3::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()
          returning id, promote_to_production_date::text as promote_to_production_date`,
        [gate.checklistId, releaseDestinationBom, ctx.userId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false as const, error: 'persistence_failed' as const };

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 'npd.handoff.promoted', 'handoff_checklist', $2,
                 $3::jsonb, gen_random_uuid(), 'security')`,
        [
          ctx.userId,
          row.id,
          JSON.stringify({
            projectId,
            destinationBomCode: releaseDestinationBom,
            releasedToFactory,
            promoteToProductionDate: row.promote_to_production_date,
          }),
        ],
      );

      return { ok: true as const, promoteToProductionDate: row.promote_to_production_date };
    });

    if (!recorded.ok) return { ok: false, error: 'persistence_failed' };

    safeRevalidatePath(`/[locale]/(app)/(npd)/pipeline/${projectId}/handoff`);

    return {
      ok: true,
      data: {
        projectId,
        destinationBomCode: releaseDestinationBom,
        promoteToProductionDate: recorded.promoteToProductionDate,
        releasedToFactory,
      },
    };
  } catch (error) {
    console.error('[promoteToProduction] persistence_failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path, 'page');
  } catch {
    // Vitest imports Server Actions outside a Next request store.
  }
}
