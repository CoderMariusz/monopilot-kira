'use server';

/**
 * 03-technical BOM Generator — batch enqueue Server Action (T-016).
 *
 * POST equivalent for `/api/technical/bom-generator`. Resolves the eligible FG set
 * (V-TEC-15: product.status_overall = 'Complete'), then ENQUEUES exactly one async
 * `bom_generator_jobs` row (status 'queued') carrying the resolved scope + output
 * mode. Returns expected_count synchronously; the XLSX is built later by
 * generator-worker.ts (red-line: NEVER generate XLSX inside the request).
 *
 * RBAC: technical.bom.generate_batch. Audit action='bom_batch_generate'.
 * Internal BOM explode/compose — distinct from NPD's D365 Builder. WIP/intermediate
 * records are NOT created here (NPD Builder owns that before Technical handoff).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import { buildJobPayload, type FgCandidate, resolveEligibleFgs } from './generator';
import {
  AUDIT_BOM_BATCH_GENERATE,
  BOM_GENERATE_BATCH_PERMISSION,
  BomGeneratorInput,
  type BomGeneratorResult,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  writeAudit,
} from './shared';

export async function generateBomBatch(rawInput: unknown): Promise<BomGeneratorResult> {
  const parsed = BomGeneratorInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<BomGeneratorResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_GENERATE_BATCH_PERMISSION))) return { ok: false, error: 'forbidden' };

      // Candidate FGs (org-scoped). V-TEC-15 'Complete' filter applied in pure logic.
      const { rows } = await c.query<{ product_code: string; status_overall: string | null }>(
        `select product_code, status_overall
           from public.product
          where org_id = app.current_org_id()`,
      );
      const candidates: FgCandidate[] = rows.map((r) => ({
        productCode: r.product_code,
        statusOverall: r.status_overall,
      }));

      const eligible = resolveEligibleFgs(candidates, input.scope, input.productCodes);
      const payload = buildJobPayload(eligible, input.outputMode);

      // Enqueue ONE async job row (status 'queued'). XLSX is built by the worker.
      const { rows: jobRows } = await c.query<{ id: string }>(
        `insert into public.bom_generator_jobs
           (org_id, scope, output_mode, status, expected_count, payload, created_by)
         values
           (app.current_org_id(), $1, $2, 'queued', $3, $4::jsonb, $5::uuid)
         returning id`,
        [input.scope, input.outputMode, payload.expectedCount, JSON.stringify(payload), userId],
      );
      const jobId = jobRows[0]?.id;
      if (!jobId) return { ok: false, error: 'persistence_failed' };

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_BATCH_GENERATE,
        resourceId: jobId,
        beforeState: null,
        afterState: {
          scope: input.scope,
          outputMode: input.outputMode,
          expectedCount: payload.expectedCount,
          productCodes: eligible,
        },
      });

      safeRevalidatePath('/technical/bom');
      return { ok: true, data: { jobId, expectedCount: payload.expectedCount, productCodes: eligible } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/bom] generateBomBatch persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
