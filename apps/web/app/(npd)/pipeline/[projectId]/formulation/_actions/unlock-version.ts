'use server';

import { signEvent } from '@monopilot/e-sign';
import type { ESignTxOptions } from '@monopilot/e-sign';
import { createLogger } from '@monopilot/observability';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

const logger = createLogger({ name: 'npd-formulation-lifecycle' });

const inputSchema = z.object({
  projectId: z.string().uuid(),
  versionId: z.string().uuid(),
  pin: z.string().min(1),
  reason: z.string().optional(),
});

type VersionRow = {
  formulation_id: string;
  version_id: string;
  state: string;
  product_code: string | null;
};

type UnlockVersionResult =
  | { ok: true; data: { versionId: string } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'VERSION_NOT_LOCKED' | 'esign_failed' | 'persistence_failed';
    };

export async function unlockVersion(input: unknown): Promise<UnlockVersionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const { projectId, versionId, pin, reason } = parsed.data;

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'npd.formulation.unlock'))) return { ok: false, error: 'forbidden' };

      const loaded = await ctx.client.query<VersionRow>(
        `select
           f.id as formulation_id,
           fv.id as version_id,
           fv.state,
           f.product_code
         from public.formulations f
         join public.formulation_versions fv on fv.formulation_id = f.id
        where f.project_id = $1::uuid
          and f.org_id = app.current_org_id()
          and fv.id = $2::uuid
        for update of f, fv`,
        [projectId, versionId],
      );

      const row = loaded.rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      if (row.state !== 'locked') return { ok: false, error: 'VERSION_NOT_LOCKED' };

      try {
        await signEvent(
          {
            signerUserId: ctx.userId,
            pin,
            intent: 'formulation.unlocked',
            subject: {
              versionId,
              formulationId: row.formulation_id,
              productCode: row.product_code,
            },
            nonce: `formulation.unlocked:${versionId}:${Date.now()}`,
            reason,
          },
          { client: ctx.client as ESignTxOptions['client'] },
        );
      } catch {
        return { ok: false, error: 'esign_failed' };
      }

      await ctx.client.query(
        `update public.formulation_versions
            set state = 'draft'
          where id = $1::uuid
            and state = 'locked'`,
        [versionId],
      );
      await ctx.client.query(
        `update public.formulations
            set locked_at = null,
                locked_by_user = null
          where id = $1::uuid
            and current_version_id = $2::uuid
            and org_id = app.current_org_id()`,
        [row.formulation_id, versionId],
      );

      await ctx.client.query(
        `insert into public.formulation_audit_log
           (org_id, formulation_id, version_id, event_type, event_payload, actor_user_id)
         values (app.current_org_id(), $1::uuid, $2::uuid, 'formulation.unlocked', $3::jsonb, $4::uuid)`,
        [row.formulation_id, versionId, JSON.stringify({ productCode: row.product_code, reason }), ctx.userId],
      );
      // TODO(A6): emit formulation.unlocked once the outbox event_type CHECK includes it

      return { ok: true, data: { versionId } };
    });
  } catch (error) {
    logger.error(
      { err: error, projectId, versionId, action: 'unlockVersion' },
      'formulation lifecycle action failed',
    );
    return { ok: false, error: 'persistence_failed' };
  }
}
