'use server';

/**
 * NPD HANDOFF stage — `getHandoff` read Server Action.
 *
 * Reads the (single, per-project) handoff checklist + its line items + the
 * destination-BOM facts surfaced on the screen (destination_bom_code, the
 * project's product code/SKU, promote_to_production_date, the destination
 * warehouse name, and the factory-release linkage if the project was already
 * released). Org-scoped via withOrgContext → RLS engaged with
 * app.current_org_id(). RBAC read gate = `npd.handoff.read` (BYTE-IDENTICAL to
 * the seeded permission string in migration 236).
 *
 * No mocks, no hard-coded rows. `ready` (the green "Ready to promote" bar) is
 * derived here as "every checklist item is checked" so the screen never
 * re-derives the gate.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  GATE_APPROVE_PERMISSION,
  seedHandoffChecklist,
} from '../../../../../../../(npd)/pipeline/_actions/_lib/gate-helpers';
import { probeReleaseGates, type ReleaseGateStatus } from './release-gate-status';

const Input = z.object({
  projectId: z.string().uuid(),
});
export type GetHandoffInput = z.infer<typeof Input>;

export type HandoffChecklistItemDto = {
  id: string;
  label: string;
  isChecked: boolean;
  displayOrder: number;
};

export type HandoffDestinationBomDto = {
  /** destination_bom_code (soft-ref to bom_headers, 03-technical). */
  bomCode: string | null;
  /** Product SKU = npd_projects.product_code. */
  productSku: string | null;
  /** Product display name (when the FG candidate is mapped). */
  productName: string | null;
  /** promote_to_production_date (date, nullable). */
  effectiveFrom: string | null;
  /** Destination warehouse name (resolved from destination_warehouse_id). */
  warehouseName: string | null;
  /** Factory-release linkage (set once the project is released to factory). */
  releaseStatus: string | null;
  releaseBomHeaderId: string | null;
};

export type HandoffData = {
  checklistId: string;
  projectId: string;
  bomVerificationStatus: string | null;
  promoteToProductionDate: string | null;
  /** True ⇔ a checklist exists with ≥1 item and every item is checked. */
  ready: boolean;
  /** True once the factory release has been recorded for this project. */
  promoted: boolean;
  /**
   * True when the project matches revertToNpd preconditions (release-locked wedge):
   * product npd_locked_for_release_at, handoff promoted markers, or factory release.
   */
  releaseLocked: boolean;
  /** True when the caller may revert a release-locked project (npd.gate.approve). */
  canRevertToNpd: boolean;
  checklist: HandoffChecklistItemDto[];
  destinationBom: HandoffDestinationBomDto;
  /**
   * Per-gate release-preflight status, surfaced so the user SEES why "Promote"
   * is blocked (the reported dead-end). Read-only mirror of runReleasePreflight;
   * the real promote still runs the authoritative preflight server-side.
   */
  releaseGates: ReleaseGateStatus[];
  /** True ⇔ every release gate is met (Promote precondition, in addition to the checklist). */
  releaseGatesMet: boolean;
};

export type GetHandoffError = 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed';

export type GetHandoffResult =
  | { ok: true; data: HandoffData }
  | { ok: false; error: GetHandoffError; message?: string };

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

const READ_PERMISSION = 'npd.handoff.read';

/**
 * Shared RBAC probe for the handoff stage. Checks BOTH normalized
 * role_permissions and the legacy roles.permissions jsonb cache (some orgs are
 * seeded only via the jsonb path — mirrors pipeline/_actions/shared.hasPermission).
 */
export async function hasHandoffPermission(
  ctx: { userId: string; orgId: string; client: QueryClient },
  permission: string,
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
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
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

type ChecklistRow = {
  id: string;
  bom_verification_status: string | null;
  destination_bom_code: string | null;
  destination_bom_display_code: string | null;
  promote_to_production_date: string | null;
  destination_warehouse_id: string | null;
};

type ItemRow = {
  id: string;
  label: string;
  is_checked: boolean;
  display_order: number;
};

type ProjectRow = {
  product_code: string | null;
  product_name: string | null;
  npd_locked_for_release_at: string | null;
};

type WarehouseRow = { name: string };

type ReleaseRow = {
  release_status: string | null;
  active_bom_header_id: string | null;
  /** Human-readable BOM identity resolved from bom_headers (fa_code / product_id
   *  + version) — bom_headers has NO `code` column, so this is the display id. */
  bom_display_code: string | null;
};

export async function getHandoff(raw: unknown): Promise<GetHandoffResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const { projectId } = parsed.data;

  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

      if (!(await hasHandoffPermission(ctx, READ_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const checklistRes = await ctx.client.query<ChecklistRow>(
        // NB: qualify EVERY select-list column with `hc.` — handoff_checklists and
        // bom_headers share columns (id, created_at, notes, org_id, updated_at), so a
        // bare `id`/`org_id` here is `42702: column reference "id" is ambiguous`. This is
        // a PLAN-time error (fires for any project, even zero rows), which is why the
        // handoff tab dead-ended ("Unable to load…") for every at/past-handoff project.
        `select hc.id,
                hc.bom_verification_status,
                hc.destination_bom_code,
                case
                  when hc.destination_bom_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then coalesce(bh.fa_code, bh.product_id) || ' v' || bh.version::text
                  else hc.destination_bom_code
                end as destination_bom_display_code,
                hc.promote_to_production_date::text as promote_to_production_date,
                hc.destination_warehouse_id
           from public.handoff_checklists hc
           left join public.bom_headers bh
             on bh.org_id = hc.org_id
            and hc.destination_bom_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and bh.id = hc.destination_bom_code::uuid
          where hc.project_id = $1::uuid
            and hc.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      let checklist = checklistRes.rows[0];
      if (!checklist) {
        // Self-heal (live deadlock 2026-06-10): projects that ENTERED handoff before
        // the advance-transition started seeding the checklist have no row and the
        // stage was a button-less dead end. Seed it here for at/past-handoff projects;
        // pre-handoff stages legitimately have none.
        const stageRes = await ctx.client.query<{ current_stage: string }>(
          `select current_stage
             from public.npd_projects
            where id = $1::uuid
              and org_id = app.current_org_id()
            limit 1`,
          [projectId],
        );
        const stage = stageRes.rows[0]?.current_stage;
        if (stage !== 'handoff' && stage !== 'launched') {
          return { ok: false as const, error: 'not_found' as const };
        }
        await seedHandoffChecklist(
          ctx as Parameters<typeof seedHandoffChecklist>[0],
          { id: projectId },
        );
        const reread = await ctx.client.query<ChecklistRow>(
          // Qualify select-list columns with `hc.` (see note on the first query above):
          // bare `id`/`org_id` are ambiguous against the joined bom_headers (42702).
          `select hc.id,
                  hc.bom_verification_status,
                  hc.destination_bom_code,
                  case
                    when hc.destination_bom_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      then coalesce(bh.fa_code, bh.product_id) || ' v' || bh.version::text
                    else hc.destination_bom_code
                  end as destination_bom_display_code,
                  hc.promote_to_production_date::text as promote_to_production_date,
                  hc.destination_warehouse_id
             from public.handoff_checklists hc
             left join public.bom_headers bh
               on bh.org_id = hc.org_id
              and hc.destination_bom_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and bh.id = hc.destination_bom_code::uuid
            where hc.project_id = $1::uuid
              and hc.org_id = app.current_org_id()
            limit 1`,
          [projectId],
        );
        checklist = reread.rows[0];
        if (!checklist) {
          return { ok: false as const, error: 'not_found' as const };
        }
      }

      const itemsRes = await ctx.client.query<ItemRow>(
        `select id, label, is_checked, display_order
           from public.handoff_checklist_items
          where handoff_checklist_id = $1::uuid
            and org_id = app.current_org_id()
          order by display_order asc, label asc`,
        [checklist.id],
      );

      const projectRes = await ctx.client.query<ProjectRow>(
        `select np.product_code,
                p.product_name,
                p.private_jsonb ->> 'npd_locked_for_release_at' as npd_locked_for_release_at
           from public.npd_projects np
           left join public.product p
             on p.product_code = np.product_code
            and p.org_id = np.org_id
          where np.id = $1::uuid
            and np.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const project = projectRes.rows[0] ?? {
        product_code: null,
        product_name: null,
        npd_locked_for_release_at: null,
      };

      let warehouseName: string | null = null;
      if (checklist.destination_warehouse_id) {
        const whRes = await ctx.client.query<WarehouseRow>(
          `select name
             from public.warehouses
            where id = $1::uuid
              and org_id = app.current_org_id()
            limit 1`,
          [checklist.destination_warehouse_id],
        );
        warehouseName = whRes.rows[0]?.name ?? null;
      }

      const releaseRes = await ctx.client.query<ReleaseRow>(
        `select frs.release_status,
                frs.active_bom_header_id,
                case
                  when bh.id is null then null
                  else coalesce(bh.fa_code, bh.product_id) || ' v' || bh.version::text
                end as bom_display_code
           from public.factory_release_status frs
           left join public.bom_headers bh
             on bh.id = frs.active_bom_header_id
            and bh.org_id = frs.org_id
          where frs.project_id = $1::uuid
            and frs.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const release = releaseRes.rows[0] ?? null;

      // Read-only release-gate probe — surfaces WHY Promote is blocked. Never
      // throws (probe returns all-unmet for a missing project), so a probe
      // failure can never turn the screen into a dead end.
      const releaseGates = await probeReleaseGates(ctx, projectId);
      const releaseGatesMet = releaseGates.length > 0 && releaseGates.every((g) => g.met);

      const items = itemsRes.rows.map((r) => ({
        id: r.id,
        label: r.label,
        isChecked: r.is_checked,
        displayOrder: r.display_order,
      }));
      const ready = items.length > 0 && items.every((i) => i.isChecked);
      const promoted =
        release?.release_status === 'released_to_factory' ||
        checklist.promote_to_production_date !== null;
      // Mirror revertToNpd releaseLocked — drives Revert-to-NPD visibility (C7a wedge).
      const releaseLocked =
        project.npd_locked_for_release_at !== null ||
        checklist.bom_verification_status === 'promoted' ||
        checklist.promote_to_production_date !== null ||
        release?.release_status === 'released_to_factory';
      const canRevertToNpd = await hasHandoffPermission(ctx, GATE_APPROVE_PERMISSION);

      return {
        ok: true as const,
        data: {
          checklistId: checklist.id,
          projectId,
          bomVerificationStatus: checklist.bom_verification_status,
          promoteToProductionDate: checklist.promote_to_production_date,
          ready,
          promoted,
          releaseLocked,
          canRevertToNpd,
          checklist: items,
          releaseGates,
          releaseGatesMet,
          destinationBom: {
            // Fallback resolves bom_headers to a HUMAN-READABLE identity (fa_code /
            // product code + version) — never the raw active_bom_header_id uuid.
            // When neither exists the screen renders its notSet em-dash.
            bomCode: checklist.destination_bom_display_code ?? checklist.destination_bom_code ?? release?.bom_display_code ?? null,
            productSku: project.product_code,
            productName: project.product_name,
            effectiveFrom: checklist.promote_to_production_date,
            warehouseName,
            releaseStatus: release?.release_status ?? null,
            releaseBomHeaderId: release?.active_bom_header_id ?? null,
          },
        },
      };
    });
  } catch (error) {
    // Surface the STRUCTURED pg error (code/detail/where) so a future failure of this
    // class (e.g. 42702 ambiguous column, 42P01 missing relation, 22P02 bad cast) is
    // root-causable from the logs instead of being flattened to a generic message.
    const pg = error as { code?: string; detail?: string; hint?: string; where?: string };
    console.error('[getHandoff] org-scoped read failed:', {
      projectId,
      code: pg.code,
      detail: pg.detail,
      hint: pg.hint,
      where: pg.where,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
