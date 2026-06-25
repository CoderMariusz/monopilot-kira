'use server';

/**
 * NPD PILOT stage — `getPilotRun` read Server Action.
 *
 * Reads the (single, latest) pilot run for a project + its material reservations
 * and readiness checklist. Org-scoped via withOrgContext → RLS engaged with
 * app.current_org_id(). RBAC read gate = `npd.pilot.read` (BYTE-IDENTICAL to the
 * seeded permission string in migration 236).
 *
 * Money/qty columns are cast ::text in SQL and carried as decimal STRINGS — never
 * coerced to JS floats anywhere in this loader. Material status is computed here
 * (reserved >= required → 'reserved', else 'short') so the screen never re-derives
 * money/qty math.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

const Input = z.object({
  projectId: z.string().uuid(),
});
export type GetPilotRunInput = z.infer<typeof Input>;

export type PilotMaterialStatus = 'reserved' | 'short';

export type PilotMaterialDto = {
  id: string;
  ingredientCode: string;
  requiredKg: string | null;
  availableKg: string | null;
  reservedKg: string | null;
  status: PilotMaterialStatus;
  shortByKg: string | null;
};

export type PilotChecklistItemDto = {
  id: string;
  label: string;
  isChecked: boolean;
  displayOrder: number;
};

export type PilotRunDto = {
  id: string;
  projectId: string;
  plannedDate: string | null;
  line: string | null;
  batchSizeKg: string | null;
  expectedYieldPct: string | null;
  durationHours: string | null;
  supervisorUserId: string | null;
  supervisorName: string | null;
  status: 'planned' | 'in_progress' | 'completed';
};

export type PilotRunData = {
  run: PilotRunDto;
  materials: PilotMaterialDto[];
  checklist: PilotChecklistItemDto[];
  totalShortKg: string | null;
};

export type GetPilotRunError = 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed';

export type GetPilotRunResult =
  | { ok: true; data: PilotRunData }
  | { ok: false; error: GetPilotRunError; message?: string };

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

const READ_PERMISSION = 'npd.pilot.read';

export async function hasPilotPermission(
  ctx: { userId: string; orgId: string; client: QueryClient },
  permission: string,
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    // Dual-store RBAC: check the normalized role_permissions table AND the legacy
    // roles.permissions jsonb cache (mig 236 writes both). The prior inner-join on
    // role_permissions alone diverged from every sibling stage and denied pilot
    // access to any role granted only via the jsonb cache.
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

// ─── Exact decimal-string compare/subtract (no float coercion) ────────────────
const SCALE = 4n;
const FACTOR = 10n ** SCALE;

function parseDec(value: string | null): bigint {
  const trimmed = (value ?? '0').trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 0n;
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [int, fracRaw = ''] = unsigned.split('.');
  const frac = fracRaw.slice(0, Number(SCALE)).padEnd(Number(SCALE), '0');
  const scaled = BigInt(int + frac);
  return negative ? -scaled : scaled;
}

function formatDec(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const int = abs / FACTOR;
  const frac = (abs % FACTOR).toString().padStart(Number(SCALE), '0');
  return `${negative && scaled !== 0n ? '-' : ''}${int}.${frac}`;
}

type RunRow = {
  id: string;
  planned_date: string | null;
  line: string | null;
  batch_size_kg: string | null;
  expected_yield_pct: string | null;
  duration_hours: string | null;
  supervisor_user_id: string | null;
  supervisor_name: string | null;
  status: 'planned' | 'in_progress' | 'completed';
};

type MaterialRow = {
  id: string;
  ingredient_code: string;
  required_kg: string | null;
  available_kg: string | null;
  reserved_kg: string | null;
  status: PilotMaterialStatus;
};

type ChecklistRow = {
  id: string;
  label: string;
  is_checked: boolean;
  display_order: number;
};

/** Recompute status from numeric-exact reserved vs required (DB column is advisory). */
function computeMaterial(row: MaterialRow): PilotMaterialDto {
  const required = parseDec(row.required_kg);
  const reserved = parseDec(row.reserved_kg);
  const short = required > reserved;
  return {
    id: row.id,
    ingredientCode: row.ingredient_code,
    requiredKg: row.required_kg,
    availableKg: row.available_kg,
    reservedKg: row.reserved_kg,
    status: short ? 'short' : 'reserved',
    shortByKg: short ? formatDec(required - reserved) : null,
  };
}

export async function getPilotRun(raw: unknown): Promise<GetPilotRunResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const { projectId } = parsed.data;

  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

      if (!(await hasPilotPermission(ctx, READ_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const runRes = await ctx.client.query<RunRow>(
        `select pr.id,
                pr.planned_date::text          as planned_date,
                pr.line,
                pr.batch_size_kg::text         as batch_size_kg,
                pr.expected_yield_pct::text    as expected_yield_pct,
                pr.duration_hours::text        as duration_hours,
                pr.supervisor_user_id::text    as supervisor_user_id,
                coalesce(u.display_name, u.email::text) as supervisor_name,
                pr.status
           from public.pilot_runs pr
           left join public.users u
             on u.id = pr.supervisor_user_id
            and u.org_id = pr.org_id
          where pr.project_id = $1::uuid
            and pr.org_id = app.current_org_id()
          order by pr.planned_date desc nulls last, pr.created_at desc
          limit 1`,
        [projectId],
      );
      const run = runRes.rows[0];
      if (!run) {
        return { ok: false as const, error: 'not_found' as const };
      }

      const materialsRes = await ctx.client.query<MaterialRow>(
        `select id,
                ingredient_code,
                required_kg::text  as required_kg,
                available_kg::text as available_kg,
                reserved_kg::text  as reserved_kg,
                status
           from public.pilot_run_materials
          where pilot_run_id = $1::uuid
            and org_id = app.current_org_id()
          order by ingredient_code asc`,
        [run.id],
      );

      const checklistRes = await ctx.client.query<ChecklistRow>(
        `select id, label, is_checked, display_order
           from public.pilot_run_checklist_items
          where pilot_run_id = $1::uuid
            and org_id = app.current_org_id()
          order by display_order asc, label asc`,
        [run.id],
      );

      const materials = materialsRes.rows.map(computeMaterial);
      const totalShortScaled = materials.reduce(
        (acc, m) => (m.shortByKg ? acc + parseDec(m.shortByKg) : acc),
        0n,
      );

      return {
        ok: true as const,
        data: {
          run: {
            id: run.id,
            projectId,
            plannedDate: run.planned_date,
            line: run.line,
            batchSizeKg: run.batch_size_kg,
            expectedYieldPct: run.expected_yield_pct,
            durationHours: run.duration_hours,
            supervisorUserId: run.supervisor_user_id,
            supervisorName: run.supervisor_name,
            status: run.status,
          },
          materials,
          checklist: checklistRes.rows.map((c) => ({
            id: c.id,
            label: c.label,
            isChecked: c.is_checked,
            displayOrder: c.display_order,
          })),
          totalShortKg: totalShortScaled > 0n ? formatDec(totalShortScaled) : null,
        },
      };
    });
  } catch (error) {
    console.error('[getPilotRun] org-scoped read failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
