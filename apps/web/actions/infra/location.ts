'use server';

import { hasPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';
import { z } from 'zod';

import { writeSettingsInfraOutbox } from './_shared/outbox';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type LocationRow = {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  code: string;
  name?: string;
  location_type?: string;
  level: number;
  path: string;
  barcode?: string | null;
  is_active?: boolean;
};

type ParsedLocationInput = {
  id: string | null;
  warehouseId: string;
  parentId: string | null;
  code: string;
  name: string;
  level: number;
  locationType: string;
  active: boolean;
  barcode: string | null;
};

type ParsedDeleteLocationInput = {
  locationId: string;
  warehouseId: string;
};

export type UpsertLocationResult =
  // `active` is the flag that was actually PERSISTED — it can differ from the requested one
  // (parent clamp / legacy carve-out below), and the screen must render this, not its own guess.
  | { ok: true; data: { id: string; path: string; level: number; active: boolean } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'invalid_parent_location'
        | 'invalid_parent_level'
        | 'depth_exceeded'
        | 'duplicate_code'
        | 'has_active_children'
        | 'has_stock'
        | 'persistence_failed';
      /** R08-01 — how many live LPs block the deactivation. Set only with 'has_stock'. */
      lpCount?: number;
    };

export type DeleteLocationResult =
  | { ok: true; data: { locationId: string; warehouseId: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'has_child_locations' | 'persistence_failed' };

const EDIT_PERMISSION = 'settings.infra.update';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().trim().regex(UUID_RE);
const locationCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/);
// location_type is a lowercase taxonomy (storage/transit/receiving/production_line/zone/
// aisle/rack/bin/…), NOT a code. The old schema reused locationCodeSchema and UPPERCASED
// it, so a saved 'STORAGE' never matched the lowercase dropdown option → the type looked
// un-editable. Preserve the value lowercase to match the seed/import convention.
const locationTypeSchema = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/),
);
const locationTextSchema = (max: number) => z.string().trim().min(1).max(max);
const optionalUuidSchema = z.preprocess((value) => (value === undefined || value === null || value === '' ? null : value), uuidSchema.nullable());
const optionalTextSchema = (max: number) => z.preprocess((value) => (value === undefined || value === null || value === '' ? null : value), locationTextSchema(max).nullable());

const locationInputSchema = z.object({
  id: optionalUuidSchema,
  warehouseId: uuidSchema,
  parentId: optionalUuidSchema,
  code: locationCodeSchema,
  name: locationTextSchema(128),
  level: z.coerce.number().int().min(1).max(4),
  locationType: locationTypeSchema,
  active: z.boolean().default(true),
  barcode: optionalTextSchema(128),
});

const deleteLocationInputSchema = z.object({
  locationId: uuidSchema,
  warehouseId: uuidSchema,
});

export async function upsertLocation(rawInput: unknown): Promise<UpsertLocationResult> {
  const input = parseLocationInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<UpsertLocationResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      // LOCK PROTOCOL (see rep-FIX-LOC.md) — every writer of public.locations takes row locks
      // ANCESTOR-FIRST: the parent row before the row being written. Reading the parent's
      // is_active without a lock let two transactions decide on the same stale snapshot (T1
      // counts 0 active children and switches the parent off while T2 reads that parent as
      // active and saves an active child under it), which re-created the exact R02-03 state the
      // clamp exists to prevent. `for update` holds until commit because withOrgContext wraps
      // the whole action in begin/commit. The CSV importer takes the same locks in the same
      // order, so the two paths serialise instead of deadlocking.
      let parent: LocationRow | null = null;
      if (input.parentId) {
        parent = await getLocation(client, input.parentId, true);
        if (!parent || parent.warehouse_id !== input.warehouseId) return { ok: false, error: 'invalid_parent_location' };
      }

      const existing = input.id ? await getLocation(client, input.id, true) : null;

      // Cycle guard: a node cannot be parented to itself or to one of its own descendants.
      if (parent && existing && (parent.id === existing.id || parent.path === existing.path || parent.path.startsWith(`${existing.path}.`))) {
        return { ok: false, error: 'invalid_parent_location' };
      }

      // Level + path are DERIVED from the parent — the client no longer has to send a
      // correct level. The old contract rejected a parent move whenever the client level
      // was stale (e.g. moving a level-2 node back to root kept level=2 → invalid_parent_level
      // → the generic "Location save failed" the owner hit). Depth cap = 3 (warehouse → zone → bin).
      const level = parent ? parent.level + 1 : 1;
      if (level > 3) return { ok: false, error: 'depth_exceeded' };
      const path = parent ? `${parent.path}.${input.code}` : input.code;

      // R02-03 — a location must never be active while its parent is inactive. The rule is
      // enforced by CLAMPING, not by rejecting: `active` is the meet of the requested flag and
      // the parent's, so a save is never refused for asking too much. is_active landed late
      // (mig 303), so a row without the flag counts as active. Only the immediate parent is
      // checked: the invariant is inductive, so if every parent link holds, every ancestor link
      // holds — see [L-5] in the report for what that assumption costs on legacy data.
      //
      // [L-1] CARVE-OUT — an EXISTING row that is already active under an inactive parent keeps
      // its own flag for as long as its parent link is untouched. Without this a plain rename of
      // such a row arrived as active:false (the dialog cannot render a tickable box under an
      // inactive parent), and when the row itself had active children the has_active_children
      // guard below then REJECTED the save: the record was not editable at all. Preserving the
      // flag makes metadata edits pass through unchanged and leaves the repair (reactivate the
      // parent) with the user, who is told about it in the dialog. Clamping still governs every
      // write that CREATES or MOVES a row — the only writes that can introduce a new violation.
      const parentInactive = parent?.is_active === false;
      const parentLinkUnchanged = existing ? (existing.parent_id ?? null) === input.parentId : false;
      const keepsLegacyActive = Boolean(existing && parentInactive && parentLinkUnchanged && existing.is_active !== false);
      const active = keepsLegacyActive ? true : input.active && !parentInactive;

      // The mirror image: switching an active node off would strand its active children under an
      // inactive parent — the same violation through the other door. Block that transition with a
      // named reason instead of cascading the deactivation downwards. A cascade is irreversible:
      // once the subtree is flattened to inactive, reactivating the parent cannot know which
      // descendants the user had deliberately switched off beforehand. Guarded on the TRANSITION
      // (was active → becomes inactive), so an already-inactive parent carrying legacy active
      // children never trips it and stays editable.
      if (existing && existing.is_active !== false && !active) {
        const { rows: activeChildRows } = await client.query<{ active_children: number | string }>(
          `select count(*)::integer as active_children
             from public.locations
            where org_id = app.current_org_id()
              and parent_id = $1::uuid
              and is_active`,
          [existing.id],
        );
        if (Number(activeChildRows[0]?.active_children ?? 0) > 0) return { ok: false, error: 'has_active_children' };

        // R08-01 — stock guard is scoped NARROWER than has_active_children. The children probe
        // must run for every path that lands inactive (including parent clamp on a MOVE), because
        // clamping an active intermediate under an inactive parent strands its active subtree.
        // Stock, by contrast, blocks only an EXPLICIT deactivation request (input.active=false):
        // a move that merely changes parent_id arrives with active:true and is clamped to
        // inactive without the operator asking to switch the row off — probing license_plates there
        // both over-blocks legal metadata/parent edits and steals the error slot from
        // has_active_children in the parent-row serialisation race below.
        //
        // Deactivating a location that still holds live license plates makes that stock
        // UNHANDLEABLE: the scanner refuses an inactive location as a move target
        // (lib/warehouse/scanner/movement.ts loadLocationScope → location_inactive 422), so the
        // LPs sitting there can no longer be moved out.
        //
        // "Live" is the definition this screen already counts with — the lp_counts CTE in
        // settings/infra/locations/page.tsx — and the one stock-move-actions.ts and scanner
        // movement.ts use: every status except the terminal four (license_plates_status_check
        // in mig 294: consumed/merged/shipped/destroyed no longer exist as handleable stock).
        // Keep the four in sync.
        if (input.active === false) {
          const { rows: liveLpRows } = await client.query<{ live_lps: number | string }>(
            `select count(*)::integer as live_lps
               from public.license_plates
              where org_id = app.current_org_id()
                and location_id = $1::uuid
                and status not in ('consumed', 'merged', 'shipped', 'destroyed')`,
            [existing.id],
          );
          const liveLps = Number(liveLpRows[0]?.live_lps ?? 0);
          // The exact dependency count travels with the error: "move 3 pallets first" is actionable,
          // "this location has stock" is not.
          if (liveLps > 0) return { ok: false, error: 'has_stock', lpCount: liveLps };
        }
      }

      const { rows } = await client.query<LocationRow>(
        `insert into public.locations
           (id, org_id, warehouse_id, parent_id, code, name, location_type, level, path, barcode, is_active)
         values (coalesce($1::uuid, gen_random_uuid()), app.current_org_id(), $2::uuid, $3::uuid, $4, $5, $6, $7::integer, $8, $9, $10::boolean)
         on conflict (id) do update set
           warehouse_id = excluded.warehouse_id,
           parent_id = excluded.parent_id,
           code = excluded.code,
           name = excluded.name,
           location_type = excluded.location_type,
           level = excluded.level,
           path = excluded.path,
           barcode = excluded.barcode,
           is_active = excluded.is_active
         returning id, warehouse_id, parent_id, code, name, location_type, level, path, barcode, is_active`,
        [input.id, input.warehouseId, input.parentId, input.code, input.name, input.locationType, level, path, input.barcode, active],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      // [L-4] Report the flag the DB actually holds. The clamp and the legacy carve-out both make
      // the stored value diverge from the requested one, and the caller used to echo its own
      // optimistic input back onto the screen — showing an activity the row does not have.
      const persistedActive = row.is_active !== false;

      // Keep descendant path/level consistent when an existing node was moved or its code
      // renamed — otherwise children keep the stale path prefix and the tree de-syncs.
      if (existing && existing.path !== path) {
        await client.query(
          `update public.locations
              set path = $1 || substring(path from char_length($2) + 1),
                  level = level + $3::int
            where org_id = app.current_org_id()
              and warehouse_id = $4::uuid
              and path like $2 || '.%'`,
          [path, existing.path, level - existing.level, input.warehouseId],
        );
      }

      await writeSettingsInfraOutbox(client, {
        orgId,
        eventType: 'settings.location.upserted',
        aggregateType: 'location',
        aggregateId: row.id,
        payload: { location_id: row.id, warehouse_id: input.warehouseId, path: row.path, level: row.level, active: persistedActive, barcode: input.barcode, actor_user_id: userId },
      });

      revalidateLocationsPath();

      return { ok: true, data: { id: row.id, path: row.path, level: row.level, active: persistedActive } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'duplicate_code' };
    console.error('[settings/infra/locations] upsert_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteLocation(rawInput: unknown): Promise<DeleteLocationResult> {
  const input = parseDeleteLocationInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<DeleteLocationResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      // Same lock protocol: the row is locked before its children are counted, so a concurrent
      // upsert that is adding a child under it (and holds/waits on this very row as its parent)
      // cannot slip between the count and the delete.
      const location = await getLocation(client, input.locationId, true);
      if (!location || location.warehouse_id !== input.warehouseId) return { ok: false, error: 'not_found' };

      const { rows: childRows } = await client.query<{ child_count: number | string }>(
        `select count(*)::integer as child_count
           from public.locations
          where org_id = app.current_org_id()
            and parent_id = $1::uuid`,
        [input.locationId],
      );
      if (Number(childRows[0]?.child_count ?? 0) > 0) return { ok: false, error: 'has_child_locations' };

      const { rows } = await client.query<LocationRow>(
        `delete from public.locations
          where org_id = app.current_org_id()
            and warehouse_id = $2::uuid
            and id = $1::uuid
        returning id, warehouse_id, parent_id, code, name, location_type, level, path`,
        [input.locationId, input.warehouseId],
      );
      const deleted = rows[0];
      if (!deleted) return { ok: false, error: 'not_found' };

      await writeSettingsInfraOutbox(client, {
        orgId,
        eventType: 'settings.location.deleted',
        aggregateType: 'location',
        aggregateId: deleted.id,
        payload: { location_id: deleted.id, warehouse_id: deleted.warehouse_id, path: deleted.path, actor_user_id: userId },
      });

      revalidateLocationsPath();

      return { ok: true, data: { locationId: deleted.id, warehouseId: deleted.warehouse_id } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

// Locale-aware revalidation. The page lives at app/[locale]/.../settings/infra/locations
// — route groups (app)/(admin) are not URL segments. The server action has no locale
// in scope, so we revalidate the dynamic [locale] segment with the 'page' type, which
// covers every locale variant (en/pl/ro/uk) instead of the old hardcoded /en/ path.
function revalidateLocationsPath(): void {
  try {
    revalidateLocalized('/settings/infra/locations', 'page');
  } catch (error) {
    console.warn('[settings/infra/locations] revalidate_skipped', error instanceof Error ? { message: error.message } : { message: String(error) });
  }
}

function parseLocationInput(raw: unknown): ParsedLocationInput | null {
  const parsed = locationInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

function parseDeleteLocationInput(raw: unknown): ParsedDeleteLocationInput | null {
  const parsed = deleteLocationInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

/**
 * `forUpdate` takes a row lock that survives until the surrounding withOrgContext transaction
 * commits. Callers that go on to DECIDE something from `is_active` (their own or the parent's)
 * must lock, otherwise a concurrent writer flips the flag between the read and the write.
 * Locks are always acquired ancestor-first — see the protocol note in upsertLocation.
 */
async function getLocation(client: QueryClient, id: string, forUpdate = false): Promise<LocationRow | null> {
  const { rows } = await client.query<LocationRow>(
    `select id, warehouse_id, parent_id, code, name, location_type, level, path, is_active
       from public.locations
      where org_id = app.current_org_id()
        and id::text = $1
      limit 1${forUpdate ? '\n      for update' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}
