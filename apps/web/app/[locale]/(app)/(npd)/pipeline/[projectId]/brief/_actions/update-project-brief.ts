'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgContextLike,
} from '../../../../../../../(npd)/pipeline/_actions/shared';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import {
  boxesOutputUnitRequiresPackFactors,
  deriveFgNetQtyPerEachKg,
  deriveFgOutputUom,
  type NpdBriefOutputUnit,
  wantsBoxOutputUomUpgrade,
} from '../../../../../../../(npd)/pipeline/_actions/_lib/materialize-npd-bom';

const WRITE_PERMISSION = 'npd.core.write';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const optionalDecimal = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/)
  .nullable()
  .optional();

const optionalOutputUnit = z
  .enum(['kg', 'pieces', 'boxes'])
  .nullable()
  .optional();

const patchSchema = z
  .object({
    productName: optionalText(160),
    category: optionalText(120),
    targetLaunchDate: optionalDate,
    packFormat: optionalText(160),
    packWeightG: optionalDecimal,
    packsPerCase: z.number().int().min(0).nullable().optional(),
    outputUnit: optionalOutputUnit,
    weeklyVolumePacks: optionalDecimal,
    runsPerWeek: optionalDecimal,
    marketingClaims: optionalText(600),
    targetRetailPriceEur: optionalDecimal,
    salesChannel: optionalText(80),
    targetAudience: optionalText(400),
    constraints: optionalText(2000),
    notes: optionalText(2000),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), {
    message: 'At least one brief field is required.',
  });

const inputSchema = z.object({
  projectId: z.string().uuid(),
  patch: patchSchema,
});

type UpdateProjectBriefResult =
  | { ok: true; data: { projectId: string } }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED'; status: number };

type ProjectBriefAuditRow = {
  id: string;
  name: string | null;
  type: string | null;
  target_launch: string | null;
  pack_format: string | null;
  pack_weight_g: string | null;
  packs_per_case: number | null;
  output_unit: NpdBriefOutputUnit | null;
  weekly_volume_packs: string | null;
  runs_per_week: string | null;
  sales_channel: string | null;
  target_retail_price_eur: string | null;
  target_audience: string | null;
  marketing_claims: string | null;
  constraints: string | null;
  notes: string | null;
};

export async function updateProjectBrief(rawInput: unknown): Promise<UpdateProjectBriefResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext(async (ctx): Promise<UpdateProjectBriefResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, WRITE_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN', status: 403 };
      }

      const before = await context.client.query<ProjectBriefAuditRow>(
        `select id,
                name,
                type,
                target_launch::text           as target_launch,
                pack_format,
                pack_weight_g::text           as pack_weight_g,
                packs_per_case,
                output_unit,
                weekly_volume_packs::text as weekly_volume_packs,
                runs_per_week::text as runs_per_week,
                sales_channel,
                target_retail_price_eur::text as target_retail_price_eur,
                target_audience,
                marketing_claims,
                constraints,
                notes
           from public.npd_projects
          where id = $1::uuid
            and org_id = app.current_org_id()
          for update`,
        [parsed.data.projectId],
      );
      const beforeRow = before.rows[0];
      if (!beforeRow) return { ok: false, error: 'NOT_FOUND', status: 404 };

      const patch = parsed.data.patch;
      const effectiveOutputUnit =
        patch.outputUnit !== undefined ? patch.outputUnit : beforeRow.output_unit;
      const effectivePackWeightG =
        patch.packWeightG !== undefined ? patch.packWeightG : beforeRow.pack_weight_g;
      const effectivePacksPerCase =
        patch.packsPerCase !== undefined ? patch.packsPerCase : beforeRow.packs_per_case;
      if (
        boxesOutputUnitRequiresPackFactors({
          output_unit: effectiveOutputUnit,
          pack_weight_g: effectivePackWeightG,
          packs_per_case: effectivePacksPerCase,
        })
      ) {
        return { ok: false, error: 'INVALID_INPUT', status: 400 };
      }
      const updated = await context.client.query<ProjectBriefAuditRow>(
        `update public.npd_projects
            set name                    = case when $2::boolean then $3 else name end,
                type                    = case when $4::boolean then $5 else type end,
                target_launch           = case when $6::boolean then $7::date else target_launch end,
                pack_format             = case when $8::boolean then $9 else pack_format end,
                pack_weight_g           = case when $10::boolean then $11::numeric else pack_weight_g end,
                packs_per_case          = case when $12::boolean then $13::integer else packs_per_case end,
                output_unit             = case when $14::boolean then $15 else output_unit end,
                weekly_volume_packs     = case when $16::boolean then $17::numeric else weekly_volume_packs end,
                runs_per_week           = case when $18::boolean then $19::numeric else runs_per_week end,
                marketing_claims        = case when $20::boolean then $21 else marketing_claims end,
                target_retail_price_eur = case when $22::boolean then $23::numeric else target_retail_price_eur end,
                sales_channel           = case when $24::boolean then $25 else sales_channel end,
                target_audience         = case when $26::boolean then $27 else target_audience end,
                constraints             = case when $28::boolean then $29 else constraints end,
                notes                   = case when $30::boolean then $31 else notes end
          where id = $1::uuid
            and org_id = app.current_org_id()
          returning id,
                    name,
                    type,
                    target_launch::text           as target_launch,
                    pack_format,
                    pack_weight_g::text           as pack_weight_g,
                    packs_per_case,
                    output_unit,
                    weekly_volume_packs::text     as weekly_volume_packs,
                    runs_per_week::text           as runs_per_week,
                    sales_channel,
                    target_retail_price_eur::text as target_retail_price_eur,
                    target_audience,
                    marketing_claims,
                    constraints,
                    notes`,
        [
          parsed.data.projectId,
          patch.productName !== undefined,
          patch.productName ?? null,
          patch.category !== undefined,
          patch.category ?? null,
          patch.targetLaunchDate !== undefined,
          patch.targetLaunchDate ?? null,
          patch.packFormat !== undefined,
          patch.packFormat ?? null,
          patch.packWeightG !== undefined,
          patch.packWeightG ?? null,
          patch.packsPerCase !== undefined,
          patch.packsPerCase ?? null,
          patch.outputUnit !== undefined,
          patch.outputUnit ?? null,
          patch.weeklyVolumePacks !== undefined,
          patch.weeklyVolumePacks ?? null,
          patch.runsPerWeek !== undefined,
          patch.runsPerWeek ?? null,
          patch.marketingClaims !== undefined,
          patch.marketingClaims ?? null,
          patch.targetRetailPriceEur !== undefined,
          patch.targetRetailPriceEur ?? null,
          patch.salesChannel !== undefined,
          patch.salesChannel ?? null,
          patch.targetAudience !== undefined,
          patch.targetAudience ?? null,
          patch.constraints !== undefined,
          patch.constraints ?? null,
          patch.notes !== undefined,
          patch.notes ?? null,
        ],
      );
      const afterRow = updated.rows[0];
      if (!afterRow) return { ok: false, error: 'NOT_FOUND', status: 404 };

      if (patch.productName !== undefined) {
        await context.client.query(
          `update public.items i
              set name = $2,
                  updated_at = now()
             from public.npd_projects p
            where p.id = $1::uuid
              and p.org_id = app.current_org_id()
              and p.product_code = i.item_code
              and i.org_id = app.current_org_id()
              and i.item_type = 'fg'
              and i.name is distinct from $2`,
          [parsed.data.projectId, patch.productName],
        );
      }

      if (patch.targetRetailPriceEur !== undefined) {
        await context.client.query(
          `update public.formulation_versions fv
              set target_price_eur = $2::numeric
             from public.formulations f
            where f.id = fv.formulation_id
              and f.project_id = $1::uuid
              and f.org_id = app.current_org_id()
              and fv.id = f.current_version_id
              and fv.state = 'draft'`,
          [parsed.data.projectId, patch.targetRetailPriceEur ?? null],
        );
      }

      // Keep the FG item's pack hierarchy in sync when brief pack fields change
      // (mirrors materialize-npd-bom.ts) so WO snapshots are not stale post-handoff.
      if (
        patch.packWeightG !== undefined ||
        patch.packsPerCase !== undefined ||
        patch.outputUnit !== undefined
      ) {
        await syncFgOutputUomFromBrief(context, parsed.data.projectId, afterRow);
      }

      await context.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user', 'npd.project_brief.updated',
                 'npd_project', $2, $3::jsonb, $4::jsonb, $5::uuid, 'operational')`,
        [
          context.userId,
          parsed.data.projectId,
          JSON.stringify(beforeRow),
          JSON.stringify(afterRow),
          randomUUID(),
        ],
      );

      safeRevalidatePath(`/pipeline/${parsed.data.projectId}/brief`);
      return { ok: true, data: { projectId: parsed.data.projectId } };
    });
  } catch (error) {
    console.error('[updateProjectBrief] persistence_failed', {
      projectId: parsed.data.projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

async function syncFgOutputUomFromBrief(
  context: OrgContextLike,
  projectId: string,
  row: Pick<ProjectBriefAuditRow, 'pack_weight_g' | 'packs_per_case' | 'output_unit'>,
): Promise<void> {
  const outputUom = deriveFgOutputUom(row);
  const netQtyPerEach = deriveFgNetQtyPerEachKg(row.pack_weight_g);
  const packsPerCase = row.packs_per_case;
  const boxUpgrade = wantsBoxOutputUomUpgrade(row.output_unit);

  if (
    boxUpgrade &&
    outputUom === 'box' &&
    packsPerCase != null &&
    packsPerCase > 0 &&
    netQtyPerEach != null
  ) {
    await context.client.query(
      `update public.items
          set each_per_box = $2::int,
              net_qty_per_each = $3::numeric,
              output_uom = 'box'
        where org_id = app.current_org_id()
          and npd_project_id = $1::uuid
          and item_type = 'fg'
          and (coalesce(each_per_box, 0) <> $2
               or net_qty_per_each is distinct from $3::numeric
               or output_uom is distinct from 'box')`,
      [projectId, packsPerCase, netQtyPerEach],
    );
    return;
  }

  if (packsPerCase != null && packsPerCase > 0 && !boxUpgrade) {
    await context.client.query(
      `update public.items
          set each_per_box = $2::int,
              net_qty_per_each = coalesce(net_qty_per_each, $3::numeric)
        where org_id = app.current_org_id()
          and npd_project_id = $1::uuid
          and item_type = 'fg'
          and (coalesce(each_per_box, 0) <> $2
               or (net_qty_per_each is null and $3::numeric is not null))`,
      [projectId, packsPerCase, netQtyPerEach],
    );
  }

  await context.client.query(
    `update public.items
        set output_uom = $2,
            net_qty_per_each = $3::numeric
      where org_id = app.current_org_id()
        and npd_project_id = $1::uuid
        and item_type = 'fg'
        and (output_uom is distinct from $2
             or net_qty_per_each is distinct from $3::numeric)`,
    [projectId, outputUom, netQtyPerEach],
  );

  if (outputUom === 'each') {
    await context.client.query(
      `update public.items
          set output_uom = 'each'
        where org_id = app.current_org_id()
          and npd_project_id = $1::uuid
          and item_type = 'fg'
          and output_uom = 'base'
          and coalesce(each_per_box, 0) <= 0`,
      [projectId],
    );
  }
}
