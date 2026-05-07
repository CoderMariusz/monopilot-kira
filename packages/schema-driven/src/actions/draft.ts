/**
 * T-036 — Schema-driven column draft/publish Server Actions
 *
 * Public API:
 *   upsertDeptColumnDraft({ actorUserId, orgId, deptId, columnKey, fieldType,
 *                           validationJson, presentationJson? }):
 *     Inserts a row into public.dept_column_drafts with status='draft'.
 *     Enforces org.schema.admin RBAC; on miss writes a security audit row and
 *     returns { success: false, error: 'forbidden' }.
 *
 *   publishDeptColumnDraft({ actorUserId, orgId, draftId }):
 *     Single transaction:
 *       1. SELECT draft FOR UPDATE (idempotent fast-path if status='published')
 *       2. UPSERT Reference.DeptColumns (resolve dept_code via Reference.Departments)
 *       3. Bump schema_version by EXACTLY 1
 *       4. INSERT dept_column_migrations row (ON CONFLICT DO NOTHING — idempotent)
 *       5. UPDATE drafts SET status='published'
 *       6. Emit outbox 'audit.recorded' (retention_class='operational')
 *     Enforces org.schema.admin RBAC; on miss writes a security audit row.
 *
 * Connection choice: getOwnerConnection() — privileged operation crossing
 *   RLS-enabled tables (Reference.DeptColumns, dept_column_drafts,
 *   dept_column_migrations, audit_events, outbox_events). Mirrors the T-014
 *   grantRole pattern (BYPASSRLS owner pool for privileged writes that span
 *   contexts and can't rely on app.session_org_contexts being populated).
 *
 * Atomicity red line: ALL writes in publish run inside one BEGIN/COMMIT pair.
 *   Splitting them out, or bumping schema_version outside the txn, breaks the
 *   T-036 mutation experiments (see _meta/atomic-tasks/00-foundation/notes/T-036.md).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection } from '../../../db/src/clients.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldType = 'string' | 'number' | 'date' | 'enum' | 'formula' | 'relation';

export interface UpsertDeptColumnDraftInput {
  actorUserId: string;
  orgId: string;
  deptId: string;
  columnKey: string;
  fieldType: FieldType;
  validationJson: unknown;
  presentationJson?: unknown;
}

export type UpsertDeptColumnDraftResult =
  | { success: true; draftId: string }
  | { success: false; error: 'forbidden'; status?: number };

export interface PublishDeptColumnDraftInput {
  actorUserId: string;
  orgId: string;
  draftId: string;
}

export type PublishDeptColumnDraftResult =
  | {
      success: true;
      deptColumnId: string;
      newSchemaVersion: number;
      idempotent: boolean;
    }
  | { success: false; error: 'forbidden' | 'not_found' | 'dept_not_found'; status?: number };

// ─── RBAC helper ──────────────────────────────────────────────────────────────

const SCHEMA_ADMIN_SLUG = 'org.schema.admin';

async function callerHasSchemaAdmin(
  client: pg.PoolClient,
  actorUserId: string,
  orgId: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1
       FROM public.user_roles ur
       JOIN public.roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1
        AND ur.org_id  = $2
        AND r.slug     = $3
      LIMIT 1`,
    [actorUserId, orgId, SCHEMA_ADMIN_SLUG],
  );
  return rows.length > 0;
}

async function writeForbiddenAudit(
  client: pg.PoolClient,
  params: {
    orgId: string;
    actorUserId: string;
    action: 'dept_column.draft.denied' | 'dept_column.publish.denied';
    resourceId: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO public.audit_events
       (org_id, actor_user_id, actor_type, action,
        resource_type, resource_id, request_id, retention_class)
     VALUES ($1, $2, 'user', $3, 'dept_column_draft', $4, $5, 'security')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceId,
      randomUUID(),
    ],
  );
}

// ─── upsertDeptColumnDraft ────────────────────────────────────────────────────

export async function upsertDeptColumnDraft(
  input: UpsertDeptColumnDraftInput,
): Promise<UpsertDeptColumnDraftResult> {
  const {
    actorUserId,
    orgId,
    deptId,
    columnKey,
    fieldType,
    validationJson,
    presentationJson,
  } = input;

  const pool = getOwnerConnection();
  const client = await pool.connect();

  try {
    // RBAC guard
    const allowed = await callerHasSchemaAdmin(client, actorUserId, orgId);
    if (!allowed) {
      // Audit row outside any txn — the deny path is a single INSERT.
      await writeForbiddenAudit(client, {
        orgId,
        actorUserId,
        action: 'dept_column.draft.denied',
        resourceId: columnKey,
      });
      return { success: false, error: 'forbidden', status: 403 };
    }

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO public.dept_column_drafts
         (org_id, dept_id, column_key, field_type,
          validation_json, presentation_json, status, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'draft', $7)
       RETURNING id`,
      [
        orgId,
        deptId,
        columnKey,
        fieldType,
        JSON.stringify(validationJson ?? {}),
        JSON.stringify(presentationJson ?? {}),
        actorUserId,
      ],
    );

    return { success: true, draftId: rows[0]!.id };
  } finally {
    client.release();
  }
}

// ─── publishDeptColumnDraft ───────────────────────────────────────────────────

export async function publishDeptColumnDraft(
  input: PublishDeptColumnDraftInput,
): Promise<PublishDeptColumnDraftResult> {
  const { actorUserId, orgId, draftId } = input;

  const pool = getOwnerConnection();
  const client = await pool.connect();

  try {
    // RBAC guard FIRST — outside any transaction so the audit row commits
    // immediately (and an unauthorized caller cannot pollute the publish txn).
    const allowed = await callerHasSchemaAdmin(client, actorUserId, orgId);
    if (!allowed) {
      await writeForbiddenAudit(client, {
        orgId,
        actorUserId,
        action: 'dept_column.publish.denied',
        resourceId: draftId,
      });
      return { success: false, error: 'forbidden', status: 403 };
    }

    // ── Atomic publish: BEGIN ... COMMIT spans steps 1..6 ────────────────
    await client.query('BEGIN');
    try {
      // Step 1: SELECT draft FOR UPDATE
      const { rows: draftRows } = await client.query<{
        id: string;
        org_id: string;
        dept_id: string;
        column_key: string;
        field_type: string;
        validation_json: unknown;
        presentation_json: unknown;
        status: 'draft' | 'published';
      }>(
        `SELECT id, org_id, dept_id, column_key, field_type,
                validation_json, presentation_json, status
           FROM public.dept_column_drafts
          WHERE id = $1
          FOR UPDATE`,
        [draftId],
      );

      if (draftRows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'not_found', status: 404 };
      }

      const draft = draftRows[0]!;
      if (draft.org_id !== orgId) {
        await client.query('ROLLBACK');
        return { success: false, error: 'not_found', status: 404 };
      }

      // Resolve dept_code from dept_id via Reference.Departments.
      // Error choice: throw typed error so the transaction catches it and rolls
      // back cleanly; callers receive { success: false, error: 'dept_not_found' }
      // via the catch block below.
      const { rows: deptRows } = await client.query<{ code: string }>(
        `SELECT code FROM "Reference"."Departments"
          WHERE id = $1 AND org_id = $2
          LIMIT 1`,
        [draft.dept_id, orgId],
      );
      if (deptRows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'dept_not_found' };
      }
      const deptCode = deptRows[0]!.code;

      // Idempotent fast-path: draft already published → re-derive state, no writes.
      if (draft.status === 'published') {
        const { rows: dcRows } = await client.query<{
          id: string;
          schema_version: number;
        }>(
          `SELECT id, schema_version FROM "Reference"."DeptColumns"
            WHERE org_id = $1 AND dept_code = $2 AND column_key = $3`,
          [orgId, deptCode, draft.column_key],
        );
        if (dcRows.length === 0) {
          // Inconsistent state — draft says 'published' but no DeptColumns row.
          // Treat as not_found rather than silently re-publishing.
          await client.query('ROLLBACK');
          return { success: false, error: 'not_found', status: 404 };
        }
        await client.query('COMMIT');
        return {
          success: true,
          deptColumnId: dcRows[0]!.id,
          newSchemaVersion: Number(dcRows[0]!.schema_version),
          idempotent: true,
        };
      }

      // Step 2: UPSERT Reference.DeptColumns (insert or no-op).
      // NOTE: validation_dsl gets the draft's validation_json; field_type carries over.
      // We do NOT set schema_version here — step 3 owns the bump. On INSERT (new
      // row), schema_version defaults to 1; we then bump it to 2 to record the
      // publish event.
      await client.query(
        `INSERT INTO "Reference"."DeptColumns"
           (org_id, dept_code, column_key, field_type, is_required, validation_dsl)
         VALUES ($1, $2, $3, $4, false, $5::jsonb)
         ON CONFLICT (org_id, dept_code, column_key) DO UPDATE
           SET field_type     = EXCLUDED.field_type,
               validation_dsl = EXCLUDED.validation_dsl`,
        [
          orgId,
          deptCode,
          draft.column_key,
          draft.field_type,
          JSON.stringify(draft.validation_json ?? {}),
        ],
      );

      // Step 3: Bump schema_version by EXACTLY 1, capture prev/new + id.
      const { rows: bumpRows } = await client.query<{
        id: string;
        prev_version: number;
        new_version: number;
      }>(
        `UPDATE "Reference"."DeptColumns"
            SET schema_version = schema_version + 1
          WHERE org_id = $1 AND dept_code = $2 AND column_key = $3
          RETURNING id,
                    schema_version - 1 AS prev_version,
                    schema_version     AS new_version`,
        [orgId, deptCode, draft.column_key],
      );

      if (bumpRows.length === 0) {
        // Should never happen — UPSERT just ran. Defensive rollback.
        await client.query('ROLLBACK');
        return { success: false, error: 'not_found', status: 404 };
      }

      const bumped = bumpRows[0]!;
      const deptColumnId = bumped.id;
      const newSchemaVersion = Number(bumped.new_version);
      const prevSchemaVersion = Number(bumped.prev_version);

      // Step 4: INSERT dept_column_migrations row (idempotency safety net).
      // The unique index on (dept_column_id, new_version) makes this resilient
      // to retried publishes within a single transaction context.
      await client.query(
        `INSERT INTO public.dept_column_migrations
           (org_id, dept_column_id, prev_version, new_version)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (dept_column_id, new_version) DO NOTHING`,
        [orgId, deptColumnId, prevSchemaVersion, newSchemaVersion],
      );

      // Step 5: Flip draft status to 'published'
      await client.query(
        `UPDATE public.dept_column_drafts SET status = 'published' WHERE id = $1`,
        [draftId],
      );

      // Step 6: Emit outbox 'audit.recorded' (retention_class='operational')
      // App version pulled from env or pinned to 'unknown' for tests.
      const appVersion = process.env.APP_VERSION ?? 'unknown';
      await client.query(
        `INSERT INTO public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         VALUES ($1, 'audit.recorded', 'dept_column', $2,
                 jsonb_build_object(
                   'retention_class', 'operational',
                   'action',          'dept_column.published',
                   'actor_user_id',   $3::uuid,
                   'dept_column_id',  $2::uuid,
                   'prev_version',    $4::int,
                   'new_version',     $5::int,
                   'draft_id',        $6::uuid
                 ),
                 $7)`,
        [
          orgId,
          deptColumnId,
          actorUserId,
          prevSchemaVersion,
          newSchemaVersion,
          draftId,
          appVersion,
        ],
      );

      await client.query('COMMIT');

      return {
        success: true,
        deptColumnId,
        newSchemaVersion,
        idempotent: false,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    }
  } finally {
    client.release();
  }
}
