/**
 * T-036 — Next.js Server Action wrappers for the schema-driven column
 * draft/publish flow.
 *
 * Thin wrappers around the lib in @monopilot/schema-driven. Resolves
 * actorUserId / orgId from the current session and forwards user input.
 *
 * The lib functions own all RBAC enforcement, transactional atomicity,
 * audit emission, and outbox emission — these wrappers MUST NOT replicate
 * any of that logic. Their only job is to bridge Next.js form/action
 * inputs to the lib's typed inputs.
 */

'use server';

import {
  upsertDeptColumnDraft as _upsertDeptColumnDraft,
  publishDeptColumnDraft as _publishDeptColumnDraft,
  type FieldType,
  type UpsertDeptColumnDraftResult,
  type PublishDeptColumnDraftResult,
} from '../../../../../../packages/schema-driven/src/actions/draft.js';
import { withOrgContext } from '../../../../lib/auth/with-org-context';

// ─── Session resolution (T-062) ───────────────────────────────────────────────
// All actor/org resolution is now delegated to `withOrgContext`, which:
//   1. Verifies the Supabase JWT (NOT just cookies),
//   2. Resolves org_id from public.users for the verified user, and
//   3. Wraps the action body in an app-role txn with app.set_org_context set.
//
// The previous env-stub path (NEXT_SERVER_ACTION_ACTOR_USER_ID / ORG_ID) is
// preserved ONLY in the test fallback inside withOrgContext (NODE_ENV=test
// AND VITEST set). Production never reads those envs.

// ─── upsertDeptColumnDraft (form-data wrapper) ────────────────────────────────

export async function upsertDeptColumnDraft(
  formData: FormData,
): Promise<UpsertDeptColumnDraftResult> {
  const deptId = String(formData.get('deptId') ?? '');
  const columnKey = String(formData.get('columnKey') ?? '');
  const fieldType = String(formData.get('fieldType') ?? '') as FieldType;

  const validationRaw = formData.get('validationJson');
  const presentationRaw = formData.get('presentationJson');
  const validationJson =
    typeof validationRaw === 'string' && validationRaw.length > 0
      ? JSON.parse(validationRaw)
      : {};
  const presentationJson =
    typeof presentationRaw === 'string' && presentationRaw.length > 0
      ? JSON.parse(presentationRaw)
      : {};

  return withOrgContext(async ({ userId, orgId, client }) =>
    // P1.6 — pass the in-transaction client from withOrgContext so the
    // schema-driven action runs inside the org-context txn (RLS sees the
    // correct `app.current_org_id()`). Without this the lib opens its own
    // owner-pool connection where the org context is unset.
    _upsertDeptColumnDraft({
      actorUserId: userId,
      orgId,
      deptId,
      columnKey,
      fieldType,
      validationJson,
      presentationJson,
      client,
    }),
  );
}

// ─── publishDeptColumnDraft (typed wrapper) ───────────────────────────────────

export async function publishDeptColumnDraft(
  draftId: string,
): Promise<PublishDeptColumnDraftResult> {
  return withOrgContext(async ({ userId, orgId, client }) =>
    // P1.6 — pass the in-transaction client so the publish steps run inside
    // the org-context txn (RLS preservation). The lib detects the passed
    // client and skips its own BEGIN/COMMIT — the outer txn owns the boundary.
    _publishDeptColumnDraft({ actorUserId: userId, orgId, draftId, client }),
  );
}
