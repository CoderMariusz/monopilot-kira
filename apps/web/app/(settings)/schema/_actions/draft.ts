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

// ─── Session resolver ─────────────────────────────────────────────────────────
// Resolves (actorUserId, orgId) from the current request session. Replace the
// stub below with the real Supabase session adapter once the auth wiring lands.

async function resolveSessionContext(): Promise<{ actorUserId: string; orgId: string }> {
  const actorUserId = process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
  const orgId = process.env.NEXT_SERVER_ACTION_ORG_ID;
  if (!actorUserId || !orgId) {
    throw new Error(
      'session context unavailable: actorUserId/orgId not resolved (T-036 wrapper)',
    );
  }
  return { actorUserId, orgId };
}

// ─── upsertDeptColumnDraft (form-data wrapper) ────────────────────────────────

export async function upsertDeptColumnDraft(
  formData: FormData,
): Promise<UpsertDeptColumnDraftResult> {
  const { actorUserId, orgId } = await resolveSessionContext();

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

  return _upsertDeptColumnDraft({
    actorUserId,
    orgId,
    deptId,
    columnKey,
    fieldType,
    validationJson,
    presentationJson,
  });
}

// ─── publishDeptColumnDraft (typed wrapper) ───────────────────────────────────

export async function publishDeptColumnDraft(
  draftId: string,
): Promise<PublishDeptColumnDraftResult> {
  const { actorUserId, orgId } = await resolveSessionContext();
  return _publishDeptColumnDraft({ actorUserId, orgId, draftId });
}
