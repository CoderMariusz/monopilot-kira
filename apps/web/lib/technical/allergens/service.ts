/**
 * T-017 — Allergen profile CRUD service.
 *
 * Backs POST/PUT/DELETE /api/technical/items/:item_code/allergens. The row is
 * identified by the composite natural key (org_id, item_id, allergen_code).
 *
 * Invariants (PRD §10.1/§10.3/§10.8, migration 161):
 *   - allergen_code must resolve to "Reference"."Allergens" (V-TEC-40).
 *   - source='manual_override' forces a non-empty manual_override_reason (V-TEC-42).
 *   - a manual override appends an immutable row to
 *     item_allergen_profile_overrides (append-only ledger) AND is recorded in
 *     audit_log with action 'allergen.override'.
 *   - cascaded rows are READ-ONLY here — a manual override never clears the
 *     cascade source silently; the cascade engine (T-024) is the only writer of
 *     source='cascaded' rows and it preserves manual_override rows.
 *
 * Permission: technical.allergens.edit (all writes).
 */

import {
  ALLERGENS_EDIT_PERMISSION,
  allergenCodeExists,
  type AllergenResult,
  CONFIDENCES,
  hasPermission,
  INTENSITIES,
  isPgError,
  type OrgActionContext,
  PROFILE_SOURCES,
  writeAudit,
} from './shared';
import { z } from 'zod';

// ── Inputs ────────────────────────────────────────────────────────────────────
// item_code identifies the item row (resolved to item_id internally). A
// manual_override demands a reason; we enforce it in zod (superRefine) so a
// clearly-invalid payload is rejected before any DB work (V-TEC-42).
const UpsertProfileBase = z.object({
  itemCode: z.string().trim().min(1).max(64),
  allergenCode: z.string().trim().min(1).max(64),
  source: z.enum(PROFILE_SOURCES),
  intensity: z.enum(INTENSITIES).optional().default('contains'),
  confidence: z.enum(CONFIDENCES).optional().default('declared'),
  reason: z.string().trim().min(1).max(2000).optional(),
});

export const UpsertProfileInput = UpsertProfileBase.superRefine((val, ctx) => {
  if (val.source === 'manual_override' && (!val.reason || val.reason.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'manual_override requires a non-empty reason (V-TEC-42)',
    });
  }
});
export type UpsertProfileInputType = z.input<typeof UpsertProfileBase>;

export const DeleteProfileInput = z.object({
  itemCode: z.string().trim().min(1).max(64),
  allergenCode: z.string().trim().min(1).max(64),
});
export type DeleteProfileInputType = z.input<typeof DeleteProfileInput>;

export type ProfileRow = {
  itemId: string;
  allergenCode: string;
  source: string;
  intensity: string;
  confidence: string;
  manualOverrideReason: string | null;
};

// ── Helper: resolve item_id from (org, item_code) under RLS ───────────────────
async function resolveItemId(ctx: OrgActionContext, itemCode: string): Promise<string | null> {
  const { rows } = await ctx.client.query<{ id: string }>(
    `select id from public.items where org_id = $1::uuid and item_code = $2 limit 1`,
    [ctx.orgId, itemCode],
  );
  return rows[0]?.id ?? null;
}

// ── Create / Update (upsert by composite key) ─────────────────────────────────
export async function upsertProfile(
  ctx: OrgActionContext,
  raw: unknown,
): Promise<AllergenResult<ProfileRow>> {
  const parsed = UpsertProfileInput.safeParse(raw);
  if (!parsed.success) {
    // Distinguish the V-TEC-42 override-reason failure so the route maps it to
    // 422 with the right code (vs a generic invalid_input).
    const overrideReasonIssue = parsed.error.issues.find((i) => i.path.includes('reason'));
    if (overrideReasonIssue) return { ok: false, error: 'override_reason_required' };
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  if (!(await hasPermission(ctx, ALLERGENS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

  // V-TEC-40: allergen_code must reference Reference."Allergens".
  if (!(await allergenCodeExists(ctx, input.allergenCode))) {
    return { ok: false, error: 'invalid_allergen_code' };
  }

  const itemId = await resolveItemId(ctx, input.itemCode);
  if (!itemId) return { ok: false, error: 'not_found' };

  try {
    // Read prior state (for audit before/after + to know create-vs-update).
    const { rows: priorRows } = await ctx.client.query<ProfileRow & { source: string }>(
      `select item_id as "itemId", allergen_code as "allergenCode", source,
              intensity, confidence, manual_override_reason as "manualOverrideReason"
         from public.item_allergen_profiles
        where org_id = $1::uuid and item_id = $2::uuid and allergen_code = $3`,
      [ctx.orgId, itemId, input.allergenCode],
    );
    const prior = priorRows[0] ?? null;
    const isOverride = input.source === 'manual_override';

    const { rows: upserted } = await ctx.client.query<ProfileRow>(
      `insert into public.item_allergen_profiles
         (org_id, item_id, allergen_code, source, intensity, confidence, manual_override_reason, declared_by)
       values (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6, $7::uuid)
       on conflict (org_id, item_id, allergen_code) do update
         set source = excluded.source,
             intensity = excluded.intensity,
             confidence = excluded.confidence,
             manual_override_reason = excluded.manual_override_reason,
             declared_by = excluded.declared_by,
             declared_at = pg_catalog.now()
       returning item_id as "itemId", allergen_code as "allergenCode", source,
                 intensity, confidence, manual_override_reason as "manualOverrideReason"`,
      [
        itemId,
        input.allergenCode,
        input.source,
        input.intensity,
        input.confidence,
        isOverride ? input.reason : null,
        ctx.userId,
      ],
    );
    const row = upserted[0];
    if (!row) return { ok: false, error: 'persistence_failed' };

    // A manual override appends to the immutable override-history ledger.
    if (isOverride) {
      await ctx.client.query(
        `insert into public.item_allergen_profile_overrides
           (org_id, item_id, allergen_code, action, intensity, confidence, reason, overridden_by)
         values (app.current_org_id(), $1::uuid, $2, 'set', $3, $4, $5, $6::uuid)`,
        [itemId, input.allergenCode, input.intensity, input.confidence, input.reason, ctx.userId],
      );
    }

    // Audit action label: create / update / override.
    const action = isOverride
      ? 'allergen.override'
      : prior
        ? 'allergen.update'
        : 'allergen.create';
    await writeAudit(ctx.client, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action,
      resourceType: 'item_allergen_profile',
      resourceId: `${itemId}:${input.allergenCode}`,
      beforeState: prior,
      afterState: row,
    });

    return { ok: true, data: row };
  } catch (err) {
    // 23514 check_violation — e.g. the V-TEC-42 DB-side override-reason CHECK.
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/allergens] upsertProfile persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
// Deleting a manual_override row records action='allergen.delete' with the old
// payload in audit_log. The override-history ledger is append-only, so the prior
// override rows remain (immutable trail); we additionally append a 'clear' ledger
// row so the deletion itself is captured with actor + ts.
export async function deleteProfile(
  ctx: OrgActionContext,
  raw: unknown,
): Promise<AllergenResult<{ itemId: string; allergenCode: string }>> {
  const parsed = DeleteProfileInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  if (!(await hasPermission(ctx, ALLERGENS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

  const itemId = await resolveItemId(ctx, input.itemCode);
  if (!itemId) return { ok: false, error: 'not_found' };

  try {
    const { rows: deleted } = await ctx.client.query<ProfileRow>(
      `delete from public.item_allergen_profiles
        where org_id = $1::uuid and item_id = $2::uuid and allergen_code = $3
        returning item_id as "itemId", allergen_code as "allergenCode", source,
                  intensity, confidence, manual_override_reason as "manualOverrideReason"`,
      [ctx.orgId, itemId, input.allergenCode],
    );
    const old = deleted[0];
    if (!old) return { ok: false, error: 'not_found' };

    // If the deleted row was a manual override, append a 'clear' ledger row so the
    // append-only trail captures the removal (reason carried over from the row).
    if (old.source === 'manual_override') {
      await ctx.client.query(
        `insert into public.item_allergen_profile_overrides
           (org_id, item_id, allergen_code, action, intensity, confidence, reason, overridden_by)
         values (app.current_org_id(), $1::uuid, $2, 'clear', $3, $4, $5, $6::uuid)`,
        [
          itemId,
          input.allergenCode,
          old.intensity,
          old.confidence,
          old.manualOverrideReason ?? 'manual override removed',
          ctx.userId,
        ],
      );
    }

    await writeAudit(ctx.client, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: 'allergen.delete',
      resourceType: 'item_allergen_profile',
      resourceId: `${itemId}:${input.allergenCode}`,
      beforeState: old,
      afterState: null,
    });

    return { ok: true, data: { itemId, allergenCode: input.allergenCode } };
  } catch (err) {
    console.error('[technical/allergens] deleteProfile persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

// ── List (for the route GET) ──────────────────────────────────────────────────
export async function listProfiles(
  ctx: OrgActionContext,
  itemCode: string,
): Promise<AllergenResult<ProfileRow[]>> {
  const itemId = await resolveItemId(ctx, itemCode);
  if (!itemId) return { ok: false, error: 'not_found' };
  const { rows } = await ctx.client.query<ProfileRow>(
    `select item_id as "itemId", allergen_code as "allergenCode", source,
            intensity, confidence, manual_override_reason as "manualOverrideReason"
       from public.item_allergen_profiles
      where org_id = $1::uuid and item_id = $2::uuid
      order by allergen_code asc`,
    [ctx.orgId, itemId],
  );
  return { ok: true, data: rows };
}
