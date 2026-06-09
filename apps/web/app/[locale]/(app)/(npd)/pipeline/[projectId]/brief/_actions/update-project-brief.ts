'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgContextLike,
} from '../../../../../../../(npd)/pipeline/_actions/shared';

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

const patchSchema = z
  .object({
    productName: optionalText(160),
    category: optionalText(120),
    targetLaunchDate: optionalDate,
    packFormat: optionalText(160),
    packWeightG: optionalDecimal,
    expectedVolume: optionalText(120),
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
  sales_channel: string | null;
  expected_volume: string | null;
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
                sales_channel,
                expected_volume,
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
      const updated = await context.client.query<ProjectBriefAuditRow>(
        `update public.npd_projects
            set name                    = case when $2::boolean then $3 else name end,
                type                    = case when $4::boolean then $5 else type end,
                target_launch           = case when $6::boolean then $7::date else target_launch end,
                pack_format             = case when $8::boolean then $9 else pack_format end,
                pack_weight_g           = case when $10::boolean then $11::numeric else pack_weight_g end,
                expected_volume         = case when $12::boolean then $13 else expected_volume end,
                marketing_claims        = case when $14::boolean then $15 else marketing_claims end,
                target_retail_price_eur = case when $16::boolean then $17::numeric else target_retail_price_eur end,
                sales_channel           = case when $18::boolean then $19 else sales_channel end,
                target_audience         = case when $20::boolean then $21 else target_audience end,
                constraints             = case when $22::boolean then $23 else constraints end,
                notes                   = case when $24::boolean then $25 else notes end
          where id = $1::uuid
            and org_id = app.current_org_id()
          returning id,
                    name,
                    type,
                    target_launch::text           as target_launch,
                    pack_format,
                    pack_weight_g::text           as pack_weight_g,
                    sales_channel,
                    expected_volume,
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
          patch.expectedVolume !== undefined,
          patch.expectedVolume ?? null,
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
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
