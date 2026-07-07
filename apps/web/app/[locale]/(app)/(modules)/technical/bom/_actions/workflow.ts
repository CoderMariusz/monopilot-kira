'use server';

/**
 * 03-technical shared BOM SSOT — approve + publish Server Actions (T-014).
 *
 * The version state machine (PRD §7.4/§7.6): draft -> technical_approved -> active,
 * superseding any prior active version atomically.
 *
 *   approveBom  : draft|in_review -> technical_approved. Requires technical.bom.approve.
 *                 Re-validates cycle-freeness at approve time (red-line) and stamps
 *                 approved_by/approved_at (DB CHECK requires both for the approved status).
 *                 Audit action='bom.approve'.
 *   publishBom  : technical_approved -> active. Requires technical.bom.version_publish.
 *                 V-TEC-10: a non-approved version cannot publish (-> validation_failed).
 *                 Prior active version for the same product flips to 'superseded' in the
 *                 SAME txn (atomic supersede). Audit action='bom.publish'; emits
 *                 fg.bom.released.
 *
 * Clone-on-write red-line: we NEVER mutate approved/active CONTENT — only the status
 * column transitions (the migration-090 immutability trigger permits status-only moves).
 * Rollback to a prior version = re-running publishBom on that version.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { publishBomVersion } from '../../../../../../../lib/technical/bom-publish-service';
import { safeRevalidatePath } from './revalidate';
import {
  AUDIT_BOM_APPROVE,
  BOM_APPROVE_PERMISSION,
  BOM_VERSION_PUBLISH_PERMISSION,
  type BomWorkflowResult,
  BomVersionRefInput,
  EVENT_FG_BOM_RELEASED,
  formatRmUsabilityFailures,
  hasPermission,
  isPgError,
  type OrgActionContext,
  type QueryClient,
  validateBomApprovalGuards,
  writeAudit,
} from './shared';

type HeaderState = { id: string; status: string; product_id: string | null };

async function loadVersion(c: QueryClient, productId: string, version: number): Promise<HeaderState | null> {
  const { rows } = await c.query<HeaderState>(
    `select h.id, h.status, i.item_code as product_id
       from public.bom_headers h
       join public.items i on i.id = h.item_id and i.org_id = h.org_id
      where h.org_id = app.current_org_id()
        and h.item_id = (select id from public.items where org_id = app.current_org_id() and item_code = $1)
        and h.version = $2`,
    [productId, version],
  );
  return rows[0] ?? null;
}

export async function approveBom(rawInput: unknown): Promise<BomWorkflowResult> {
  const parsed = BomVersionRefInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const { productId, version } = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<BomWorkflowResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_APPROVE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const header = await loadVersion(c, productId, version);
      if (!header) return { ok: false, error: 'not_found' };
      if (header.status === 'technical_approved' || header.status === 'active') {
        return { ok: false, error: 'conflict', message: `version already ${header.status}` };
      }
      if (header.status !== 'draft' && header.status !== 'in_review') {
        return { ok: false, error: 'conflict', message: `cannot approve from status ${header.status}` };
      }

      const { rows: thisLines } = await c.query<{ item_id: string | null; component_code: string }>(
        `select item_id, component_code from public.bom_lines
          where org_id = app.current_org_id() and bom_header_id = $1`,
        [header.id],
      );
      const guard = await validateBomApprovalGuards(
        c,
        productId,
        thisLines.map((l) => ({ itemId: l.item_id, componentCode: l.component_code })),
        { cycleBlockedMessage: 'BOM has a cycle; cannot approve' },
      );
      if (!guard.ok) {
        return {
          ok: false,
          error: 'validation_failed',
          code: guard.code,
          message: guard.message,
          ...(guard.rmUsabilityFailures ? { rmUsabilityFailures: guard.rmUsabilityFailures } : {}),
        };
      }

      const { rows: updated } = await c.query<{ version: number }>(
        `update public.bom_headers
            set status = 'technical_approved', approved_by = $2::uuid, approved_at = pg_catalog.now()
          where org_id = app.current_org_id() and id = $1::uuid and status in ('draft', 'in_review')
          returning version`,
        [header.id, userId],
      );
      if (updated.length === 0) return { ok: false, error: 'conflict' };

      await writeAudit(c, {
        orgId,
        actorUserId: userId,
        action: AUDIT_BOM_APPROVE,
        resourceId: header.id,
        beforeState: { status: header.status },
        afterState: { status: 'technical_approved', productId, version },
      });

      safeRevalidatePath('/technical/bom');
      return { ok: true, data: { id: header.id, status: 'technical_approved', version } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/bom] approveBom persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function publishBom(rawInput: unknown): Promise<BomWorkflowResult> {
  const parsed = BomVersionRefInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const { productId, version } = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<BomWorkflowResult> => {
      const c = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: c };
      if (!(await hasPermission(ctx, BOM_VERSION_PUBLISH_PERMISSION))) return { ok: false, error: 'forbidden' };

      const header = await loadVersion(c, productId, version);
      if (!header) return { ok: false, error: 'not_found' };

      const published = await publishBomVersion(ctx, {
        bomHeaderId: header.id,
        productId,
        version,
      });
      if (!published.ok) {
        if (published.error === 'forbidden') return { ok: false, error: 'forbidden' };
        if (published.error === 'validation_failed') {
          return {
            ok: false,
            error: 'validation_failed',
            code: published.code,
            message: published.message,
          };
        }
        if (published.error === 'conflict') {
          return { ok: false, error: 'conflict', message: published.message };
        }
        return { ok: false, error: published.error };
      }

      safeRevalidatePath('/technical/bom');
      return { ok: true, data: { id: header.id, status: 'active', version } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'conflict', message: 'another active version exists' };
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/bom] publishBom persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
