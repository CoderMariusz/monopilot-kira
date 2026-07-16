'use server';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { guardBusinessFieldEdit } from '../../../../../../../lib/technical/factory-spec-release-guards';
import { safeRevalidatePath } from '../_actions/revalidate';
import {
  canApproveFactorySpec,
  type OrgActionContext,
  type QueryClient,
} from '../_actions/shared';

const UpdateFactorySpecInput = z.object({
  specId: z.string().uuid(),
  specCode: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const DeleteFactorySpecInput = z.object({
  specId: z.string().uuid(),
});

const SaveFactorySpecVersionInput = z.object({
  specId: z.string().uuid(),
  specCode: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).optional().nullable(),
  changeReason: z.string().trim().min(10).max(2000),
});

type LifecycleError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'invalid_state'
  | 'referenced'
  | 'persistence_failed';

type LifecycleResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: LifecycleError; message?: string };

type SpecRow = {
  id: string;
  status: string;
  fg_item_id: string;
  spec_code: string;
  version: number;
  source: string;
  bom_header_id: string | null;
  bom_version: number | null;
  notes: string | null;
};

function isPgError(err: unknown): err is { code: string; message?: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

async function requireMutableSpec(client: QueryClient, specId: string): Promise<SpecRow | null> {
  const { rows } = await client.query<SpecRow>(
    `select fs.id,
            fs.status,
            fs.fg_item_id,
            fs.spec_code,
            fs.version,
            fs.source,
            fs.bom_header_id,
            fs.bom_version,
            fs.notes
       from public.factory_specs fs
      where fs.org_id = app.current_org_id()
        and fs.id = $1::uuid
      for update`,
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

export async function updateFactorySpec(rawInput: unknown): Promise<LifecycleResult<{ id: string }>> {
  const parsed = UpdateFactorySpecInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LifecycleResult<{ id: string }>> => {
      const db = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: db };
      if (!(await canApproveFactorySpec(ctx))) return { ok: false, error: 'forbidden' };

      const spec = await requireMutableSpec(db, parsed.data.specId);
      if (!spec) return { ok: false, error: 'not_found' };

      const guard = guardBusinessFieldEdit(spec.status);
      if (!guard.ok) {
        return { ok: false, error: 'invalid_state', message: guard.message };
      }

      await db.query(
        `update public.factory_specs
            set spec_code = $2,
                notes = $3
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [parsed.data.specId, parsed.data.specCode, parsed.data.notes ?? null],
      );

      await writeAuditEvent(db, {
        orgId,
        actorUserId: userId,
        action: 'factory_spec.updated',
        resourceId: spec.id,
        beforeState: { specCode: spec.spec_code, notes: spec.notes },
        afterState: { specCode: parsed.data.specCode, notes: parsed.data.notes ?? null },
      });

      safeRevalidatePath('/technical/factory-specs');
      return { ok: true, data: { id: spec.id } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') {
      return { ok: false, error: 'invalid_state', message: err.message };
    }
    console.error('[technical/factory-specs] updateFactorySpec persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteFactorySpec(rawInput: unknown): Promise<LifecycleResult<{ id: string }>> {
  const parsed = DeleteFactorySpecInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LifecycleResult<{ id: string }>> => {
      const db = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: db };
      if (!(await canApproveFactorySpec(ctx))) return { ok: false, error: 'forbidden' };

      const spec = await requireMutableSpec(db, parsed.data.specId);
      if (!spec) return { ok: false, error: 'not_found' };
      if (!['draft', 'in_review'].includes(spec.status)) {
        return {
          ok: false,
          error: 'invalid_state',
          message: 'Only draft or in_review specifications can be deleted',
        };
      }

      const { rows: woRefs } = await db.query<{ id: string }>(
        `select id
           from public.work_orders
          where org_id = app.current_org_id()
            and active_factory_spec_id = $1::uuid
          limit 1`,
        [parsed.data.specId],
      );
      if (woRefs[0]) {
        return {
          ok: false,
          error: 'referenced',
          message: 'Cannot delete — this specification is referenced by a work order snapshot',
        };
      }

      const { rows: releaseRefs } = await db.query<{ product_code: string }>(
        `select product_code
           from public.factory_release_status
          where org_id = app.current_org_id()
            and active_factory_spec_id = $1::uuid
          limit 1`,
        [parsed.data.specId],
      );
      if (releaseRefs[0]) {
        return {
          ok: false,
          error: 'referenced',
          message: 'Cannot delete — this specification is the active factory release for a product',
        };
      }

      const { rows: supersedeRefs } = await db.query<{ id: string }>(
        `select id
           from public.factory_specs
          where org_id = app.current_org_id()
            and supersedes_factory_spec_id = $1::uuid
          limit 1`,
        [parsed.data.specId],
      );
      if (supersedeRefs[0]) {
        return {
          ok: false,
          error: 'referenced',
          message: 'Cannot delete — a newer specification version supersedes this row',
        };
      }

      await db.query(
        `delete from public.factory_specs
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [parsed.data.specId],
      );

      await writeAuditEvent(db, {
        orgId,
        actorUserId: userId,
        action: 'factory_spec.deleted',
        resourceId: spec.id,
        beforeState: {
          specCode: spec.spec_code,
          version: spec.version,
          status: spec.status,
        },
        afterState: null,
      });

      safeRevalidatePath('/technical/factory-specs');
      return { ok: true, data: { id: spec.id } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23503') {
      return {
        ok: false,
        error: 'referenced',
        message: 'Cannot delete — this specification is still referenced',
      };
    }
    console.error('[technical/factory-specs] deleteFactorySpec persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function saveFactorySpecVersion(
  rawInput: unknown,
): Promise<LifecycleResult<{ id: string; version: number }>> {
  const parsed = SaveFactorySpecVersionInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<LifecycleResult<{ id: string; version: number }>> => {
      const db = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: db };
      if (!(await canApproveFactorySpec(ctx))) return { ok: false, error: 'forbidden' };

      const spec = await requireMutableSpec(db, parsed.data.specId);
      if (!spec) return { ok: false, error: 'not_found' };
      if (!['draft', 'in_review'].includes(spec.status)) {
        return {
          ok: false,
          error: 'invalid_state',
          message: 'Only draft or in_review specifications can be versioned in place',
        };
      }

      await db.query(
        `select pg_advisory_xact_lock(hashtextextended($1::text || ':factory-spec-version:' || $2::text, 0))`,
        [orgId, spec.fg_item_id],
      );

      const { rows: versionRows } = await db.query<{ next_version: number | string }>(
        `select coalesce(max(version), 0) + 1 as next_version
           from public.factory_specs
          where org_id = app.current_org_id()
            and fg_item_id = $1::uuid`,
        [spec.fg_item_id],
      );
      const nextVersion = Number(versionRows[0]?.next_version ?? spec.version + 1);
      const versionNotes = [parsed.data.notes?.trim() || spec.notes, parsed.data.changeReason.trim()]
        .filter((part) => part && part.length > 0)
        .join(' — ');

      const { rows: inserted } = await db.query<{ id: string }>(
        `insert into public.factory_specs
           (org_id, fg_item_id, spec_code, version, status, source, bom_header_id, bom_version,
            notes, created_by, supersedes_factory_spec_id)
         values
           (app.current_org_id(), $1::uuid, $2, $3::integer, 'draft', $4, $5::uuid, $6::integer,
            $7, $8::uuid, $9::uuid)
         returning id`,
        [
          spec.fg_item_id,
          parsed.data.specCode,
          nextVersion,
          spec.source,
          spec.bom_header_id,
          spec.bom_version,
          versionNotes || null,
          userId,
          spec.id,
        ],
      );
      const newSpec = inserted[0];
      if (!newSpec) return { ok: false, error: 'persistence_failed' };

      await db.query(
        `update public.factory_specs
            set status = 'archived'
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [spec.id],
      );

      await writeAuditEvent(db, {
        orgId,
        actorUserId: userId,
        action: 'factory_spec.version_saved',
        resourceId: newSpec.id,
        beforeState: {
          sourceSpecId: spec.id,
          version: spec.version,
          status: spec.status,
        },
        afterState: {
          version: nextVersion,
          status: 'draft',
          changeReason: parsed.data.changeReason,
        },
      });

      safeRevalidatePath('/technical/factory-specs');
      return { ok: true, data: { id: newSpec.id, version: nextVersion } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23505') {
      return { ok: false, error: 'persistence_failed', message: 'duplicate specification version' };
    }
    if (isPgError(err) && err.code === '23514') {
      return { ok: false, error: 'invalid_state', message: err.message };
    }
    console.error('[technical/factory-specs] saveFactorySpecVersion persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
