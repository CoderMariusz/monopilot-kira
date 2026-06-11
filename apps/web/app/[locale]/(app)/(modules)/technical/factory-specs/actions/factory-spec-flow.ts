'use server';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { guardBusinessFieldEdit, guardStatusTransition } from '../../../../../../../lib/technical/factory-spec-release-guards';
import { safeRevalidatePath } from '../_actions/revalidate';
import {
  canApproveFactorySpec,
  type OrgActionContext,
  type QueryClient,
} from '../_actions/shared';

const SubmitFactorySpecInput = z.object({
  specId: z.string().uuid(),
});

const LinkFactorySpecBomInput = z.object({
  specId: z.string().uuid(),
  bomHeaderId: z.string().uuid(),
});

export type SubmitFactorySpecForReviewResult =
  | { ok: true; data: { specId: string; status: 'in_review' } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'invalid_state' | 'persistence_failed';
      message?: string;
    };

export type LinkFactorySpecBomResult =
  | {
      ok: true;
      data: {
        specId: string;
        bomHeaderId: string;
        bomVersion: number;
        bomStatus: string;
      };
    }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'invalid_state'
        | 'product_mismatch'
        | 'persistence_failed';
      message?: string;
    };

type SpecRow = {
  id: string;
  status: string;
  fg_item_id: string;
  fg_item_code: string;
  bom_header_id: string | null;
  bom_version: number | null;
};

type BomRow = {
  id: string;
  product_id: string | null;
  version: number;
  status: string;
};

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

async function requireFactorySpec(
  client: QueryClient,
  specId: string,
): Promise<SpecRow | null> {
  const { rows } = await client.query<SpecRow>(
    `select fs.id,
            fs.status,
            fs.fg_item_id,
            i.item_code as fg_item_code,
            fs.bom_header_id,
            fs.bom_version
       from public.factory_specs fs
       join public.items i on i.id = fs.fg_item_id and i.org_id = fs.org_id
      where fs.id = $1::uuid
        and fs.org_id = app.current_org_id()
      limit 1`,
    [specId],
  );
  return rows[0] ?? null;
}

async function writeAuditEvent(
  client: QueryClient,
  params: {
    orgId: string;
    actorUserId: string;
    action: string;
    resourceId: string;
    beforeState: unknown;
    afterState: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       ($1::uuid, $2::uuid, 'user', $3, 'factory_spec', $4,
        $5::jsonb, $6::jsonb, $7::uuid, 'standard')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
      randomUUID(),
    ],
  );
}

export async function submitFactorySpecForReview(rawInput: unknown): Promise<SubmitFactorySpecForReviewResult> {
  const parsed = SubmitFactorySpecInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SubmitFactorySpecForReviewResult> => {
      const db = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: db };
      if (!(await canApproveFactorySpec(ctx))) return { ok: false, error: 'forbidden' };

      const spec = await requireFactorySpec(db, parsed.data.specId);
      if (!spec) return { ok: false, error: 'not_found' };
      if (spec.status !== 'draft') {
        return {
          ok: false,
          error: 'invalid_state',
          message: `factory_spec is ${spec.status}; expected draft`,
        };
      }

      const transition = guardStatusTransition(spec.status, 'in_review');
      if (!transition.ok) {
        return { ok: false, error: 'invalid_state', message: transition.message };
      }

      const { rows } = await db.query<{ id: string }>(
        `update public.factory_specs
            set status = 'in_review'
          where id = $1::uuid
            and org_id = app.current_org_id()
            and status = 'draft'
          returning id`,
        [spec.id],
      );
      if (!rows[0]) {
        return { ok: false, error: 'invalid_state', message: 'factory_spec no longer draft' };
      }

      await writeAuditEvent(db, {
        orgId,
        actorUserId: userId,
        action: 'factory_spec.submitted_for_review',
        resourceId: spec.id,
        beforeState: { status: spec.status },
        afterState: { status: 'in_review' },
      });

      safeRevalidatePath('/technical/factory-specs');
      return { ok: true, data: { specId: spec.id, status: 'in_review' } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_state' };
    console.error('[technical/factory-specs] submitFactorySpecForReview persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function linkFactorySpecBom(rawInput: unknown): Promise<LinkFactorySpecBomResult> {
  const parsed = LinkFactorySpecBomInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LinkFactorySpecBomResult> => {
      const db = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: db };
      if (!(await canApproveFactorySpec(ctx))) return { ok: false, error: 'forbidden' };

      const spec = await requireFactorySpec(db, parsed.data.specId);
      if (!spec) return { ok: false, error: 'not_found' };

      const editGuard = guardBusinessFieldEdit(spec.status);
      if (!editGuard.ok || !['draft', 'in_review'].includes(spec.status)) {
        return {
          ok: false,
          error: 'invalid_state',
          message: editGuard.ok
            ? `factory_spec is ${spec.status}; expected draft or in_review`
            : editGuard.message,
        };
      }

      const { rows: bomRows } = await db.query<BomRow>(
        `select id, product_id, version, status
           from public.bom_headers
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [parsed.data.bomHeaderId],
      );
      const bom = bomRows[0];
      if (!bom) return { ok: false, error: 'not_found', message: 'BOM header not found' };
      if (bom.product_id !== spec.fg_item_code) {
        return {
          ok: false,
          error: 'product_mismatch',
          message: `BOM product ${bom.product_id ?? 'none'} does not match factory_spec FG ${spec.fg_item_code}`,
        };
      }

      const { rows } = await db.query<{ id: string }>(
        `update public.factory_specs
            set bom_header_id = $2::uuid,
                bom_version = $3::integer
          where id = $1::uuid
            and org_id = app.current_org_id()
            and status in ('draft', 'in_review')
          returning id`,
        [spec.id, bom.id, bom.version],
      );
      if (!rows[0]) {
        return { ok: false, error: 'invalid_state', message: 'factory_spec no longer draft/in_review' };
      }

      await writeAuditEvent(db, {
        orgId,
        actorUserId: userId,
        action: 'factory_spec.bom_linked',
        resourceId: spec.id,
        beforeState: { bomHeaderId: spec.bom_header_id, bomVersion: spec.bom_version },
        afterState: { bomHeaderId: bom.id, bomVersion: bom.version, bomStatus: bom.status },
      });

      safeRevalidatePath('/technical/factory-specs');
      return {
        ok: true,
        data: {
          specId: spec.id,
          bomHeaderId: bom.id,
          bomVersion: Number(bom.version),
          bomStatus: bom.status,
        },
      };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'not_found' };
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_state' };
    console.error('[technical/factory-specs] linkFactorySpecBom persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
