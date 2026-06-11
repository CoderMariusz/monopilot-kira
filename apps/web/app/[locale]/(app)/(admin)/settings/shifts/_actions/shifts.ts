'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';
const SHIFTS_ROUTE = '/settings/shifts';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type ShiftPatternRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: string[];
  site_id: string | null;
  site_name: string | null;
  line_id: string | null;
  line_label: string | null;
  org_id: string;
};

export type CalendarDayRow = {
  date: string;
  day: number;
  kind: 'working' | 'weekend' | 'holiday';
  reason: string | null;
  notes: string | null;
  site_id: string | null;
  org_id: string;
};

type ShiftPatternDbRow = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days_of_week: string[];
  site_id: string | null;
  site_name: string | null;
  line_id: string | null;
  line_label: string | null;
  org_id: string;
};

export type ShiftSiteOption = {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
};

export type ShiftLineOption = {
  id: string;
  code: string;
  name: string;
  site_id: string | null;
};

type NonProductionDayRow = {
  date: string | Date;
  reason: string | null;
  notes: string | null;
  site_id: string | null;
};

export type ShiftPatternMutationResult =
  | { ok: true; data: ShiftPatternRow }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export type ShiftsSettingsData = {
  org_id: string;
  shift_patterns: ShiftPatternRow[];
  calendar_days: CalendarDayRow[];
  sites: ShiftSiteOption[];
  lines: ShiftLineOption[];
  can_edit: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UuidInput = z.string().trim().regex(UUID_RE);
const OptionalUuidInput = z.preprocess((value) => (value === '' ? null : value), UuidInput.nullish());
const OptionalLineIdInput = z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().min(1).max(128).nullish(),
);
const TimeInput = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const DaysInput = z
  .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
  .min(1)
  .transform((days) => Array.from(new Set(days)));

const CreateShiftPatternInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    start_time: TimeInput,
    end_time: TimeInput,
    days_of_week: DaysInput,
    site_id: OptionalUuidInput,
    line_id: OptionalLineIdInput,
  })
  .strict();

const UpdateShiftPatternInput = CreateShiftPatternInput.extend({
  id: UuidInput,
}).strict();

export type CreateShiftPatternInput = z.input<typeof CreateShiftPatternInput>;
export type UpdateShiftPatternInput = z.input<typeof UpdateShiftPatternInput>;

function revalidateShiftsRoute() {
  try {
    revalidatePath(SHIFTS_ROUTE);
  } catch {
    /* no request store in unit tests */
  }
}

function normalizeTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function toDateString(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function toShiftPatternRow(row: ShiftPatternDbRow): ShiftPatternRow {
  return {
    id: row.id,
    name: row.name,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    days_of_week: row.days_of_week,
    site_id: row.site_id,
    site_name: row.site_name,
    line_id: row.line_id,
    line_label: row.line_label,
    org_id: row.org_id,
  };
}

async function hasSettingsUpdatePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, SETTINGS_UPDATE_PERMISSION],
  );
  return rows.length > 0;
}

async function queryShiftPatterns(context: OrgContextLike, orgId: string): Promise<ShiftPatternRow[]> {
  if (context.orgId !== orgId) return [];

  const { rows } = await context.client.query<ShiftPatternDbRow>(
    `select sp.id,
            coalesce(sc.shift_label, sp.shift_id) as name,
            coalesce(sp.start_time, sc.start_time)::text as start_time,
            coalesce(sp.end_time, sc.end_time)::text as end_time,
            coalesce(sp.days_active, sc.active_days) as days_of_week,
            sp.site_id::text as site_id,
            s.name as site_name,
            sp.line_id,
            concat_ws(' - ', pl.code, pl.name) as line_label,
            sp.org_id::text as org_id
       from public.shift_patterns sp
       join public.shift_configs sc
         on sc.org_id = sp.org_id
        and sc.shift_id = sp.shift_id
       left join public.sites s
         on s.id = sp.site_id
        and s.org_id = sp.org_id
       left join public.production_lines pl
         on pl.org_id = sp.org_id
        and (pl.id::text = sp.line_id or pl.code = sp.line_id)
      where sp.org_id = $1::uuid
        and sp.is_active = true
        and sc.is_active = true
      order by coalesce(sc.sort_order, 0), coalesce(sp.start_time, sc.start_time), sc.shift_label`,
    [orgId],
  );

  return rows.map(toShiftPatternRow);
}

async function queryShiftSites(context: OrgContextLike): Promise<ShiftSiteOption[]> {
  const { rows } = await context.client.query<ShiftSiteOption>(
    `select id::text, site_code as code, name, is_default
       from public.sites
      where org_id = app.current_org_id()
        and is_active = true
      order by is_default desc, lower(name), lower(site_code)`,
  );
  return rows;
}

async function queryShiftLines(context: OrgContextLike): Promise<ShiftLineOption[]> {
  const { rows } = await context.client.query<ShiftLineOption>(
    `select id::text, code, name, site_id::text as site_id
       from public.production_lines
      where org_id = app.current_org_id()
      order by lower(name), lower(code)`,
  );
  return rows;
}

async function queryCalendarData(context: OrgContextLike, orgId: string, year: number, month: number): Promise<CalendarDayRow[]> {
  const parsed = z
    .object({
      orgId: UuidInput,
      year: z.number().int().min(1900).max(9999),
      month: z.number().int().min(1).max(12),
    })
    .safeParse({ orgId, year, month });
  if (!parsed.success) return [];
  if (context.orgId !== parsed.data.orgId) return [];

  const monthStart = `${parsed.data.year}-${String(parsed.data.month).padStart(2, '0')}-01`;
  const { rows } = await context.client.query<NonProductionDayRow>(
    `select date::text as date, reason, notes, site_id::text as site_id
       from public.org_non_production_days
      where org_id = $1::uuid
        and date >= $2::date
        and date < ($2::date + interval '1 month')::date
      order by date`,
    [parsed.data.orgId, monthStart],
  );

  const closures = new Map(rows.map((row) => [toDateString(row.date), row]));
  const daysInMonth = new Date(Date.UTC(parsed.data.year, parsed.data.month, 0)).getUTCDate();

  return Array.from({ length: daysInMonth }, (_, index): CalendarDayRow => {
    const day = index + 1;
    const date = `${parsed.data.year}-${String(parsed.data.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const closure = closures.get(date);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    return {
      date,
      day,
      kind: closure ? 'holiday' : isWeekend ? 'weekend' : 'working',
      reason: closure?.reason ?? null,
      notes: closure?.notes ?? null,
      site_id: closure?.site_id ?? null,
      org_id: parsed.data.orgId,
    };
  });
}

export async function getShiftPatterns(orgId: string): Promise<ShiftPatternRow[]> {
  return withOrgContext<ShiftPatternRow[]>(async (ctx): Promise<ShiftPatternRow[]> =>
    queryShiftPatterns(ctx as OrgContextLike, orgId),
  );
}

export async function getCalendarData(orgId: string, year: number, month: number): Promise<CalendarDayRow[]> {
  return withOrgContext<CalendarDayRow[]>(async (ctx): Promise<CalendarDayRow[]> =>
    queryCalendarData(ctx as OrgContextLike, orgId, year, month),
  );
}

export async function readShiftsSettingsData(year: number, month: number): Promise<ShiftsSettingsData> {
  return withOrgContext<ShiftsSettingsData>(async (ctx): Promise<ShiftsSettingsData> => {
    const context = ctx as OrgContextLike;
    const [shiftPatterns, calendarDays, sites, lines, canEdit] = await Promise.all([
      queryShiftPatterns(context, context.orgId),
      queryCalendarData(context, context.orgId, year, month),
      queryShiftSites(context),
      queryShiftLines(context),
      hasSettingsUpdatePermission(context),
    ]);
    return { org_id: context.orgId, shift_patterns: shiftPatterns, calendar_days: calendarDays, sites, lines, can_edit: canEdit };
  });
}

export async function createShiftPattern(rawInput: unknown): Promise<ShiftPatternMutationResult> {
  const parsed = CreateShiftPatternInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<ShiftPatternMutationResult>(async (ctx): Promise<ShiftPatternMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const shiftId = crypto.randomUUID();
      await context.client.query(
        `insert into public.shift_configs
           (org_id, site_id, shift_id, shift_label, start_time, end_time, active_days, is_active, created_by, updated_by)
         values ($1::uuid, $2::uuid, $3, $4, $5::time, $6::time, $7::text[], true, $8::uuid, $8::uuid)`,
        [
          context.orgId,
          parsed.data.site_id ?? null,
          shiftId,
          parsed.data.name,
          parsed.data.start_time,
          parsed.data.end_time,
          parsed.data.days_of_week,
          context.userId,
        ],
      );

      const { rows } = await context.client.query<ShiftPatternDbRow>(
        `insert into public.shift_patterns
           (org_id, site_id, line_id, shift_id, start_time, end_time, days_active, is_active, created_by, updated_by)
         values ($1::uuid, $2::uuid, $3, $4, $5::time, $6::time, $7::text[], true, $8::uuid, $8::uuid)
         returning id,
                   $9::text as name,
                   start_time::text,
                   end_time::text,
                   days_active as days_of_week,
                   site_id::text as site_id,
                   null::text as site_name,
                   line_id,
                   null::text as line_label,
                   org_id::text as org_id`,
        [
          context.orgId,
          parsed.data.site_id ?? null,
          parsed.data.line_id ?? null,
          shiftId,
          parsed.data.start_time,
          parsed.data.end_time,
          parsed.data.days_of_week,
          context.userId,
          parsed.data.name,
        ],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      revalidateShiftsRoute();
      return { ok: true, data: toShiftPatternRow(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateShiftPattern(rawInput: unknown): Promise<ShiftPatternMutationResult> {
  const parsed = UpdateShiftPatternInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<ShiftPatternMutationResult>(async (ctx): Promise<ShiftPatternMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const existing = await context.client.query<{ shift_id: string }>(
        `select shift_id
           from public.shift_patterns
          where id = $1::uuid
            and org_id = $2::uuid
          limit 1`,
        [parsed.data.id, context.orgId],
      );
      const shiftId = existing.rows[0]?.shift_id;
      if (!shiftId) return { ok: false, error: 'not_found' };

      await context.client.query(
        `update public.shift_configs
            set site_id = $3::uuid,
                shift_label = $4,
                start_time = $5::time,
                end_time = $6::time,
                active_days = $7::text[],
                updated_by = $8::uuid,
                updated_at = now()
          where org_id = $1::uuid
            and shift_id = $2`,
        [
          context.orgId,
          shiftId,
          parsed.data.site_id ?? null,
          parsed.data.name,
          parsed.data.start_time,
          parsed.data.end_time,
          parsed.data.days_of_week,
          context.userId,
        ],
      );

      const { rows } = await context.client.query<ShiftPatternDbRow>(
        `update public.shift_patterns
            set site_id = $3::uuid,
                line_id = $4,
                start_time = $5::time,
                end_time = $6::time,
                days_active = $7::text[],
                updated_by = $8::uuid,
                updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
          returning id,
                    $9::text as name,
                    start_time::text,
                    end_time::text,
                    days_active as days_of_week,
                    site_id::text as site_id,
                    null::text as site_name,
                    line_id,
                    null::text as line_label,
                    org_id::text as org_id`,
        [
          parsed.data.id,
          context.orgId,
          parsed.data.site_id ?? null,
          parsed.data.line_id ?? null,
          parsed.data.start_time,
          parsed.data.end_time,
          parsed.data.days_of_week,
          context.userId,
          parsed.data.name,
        ],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateShiftsRoute();
      return { ok: true, data: toShiftPatternRow(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

const DeleteShiftPatternInput = z.object({ id: UuidInput }).strict();
export type DeleteShiftPatternInput = z.input<typeof DeleteShiftPatternInput>;

export type ShiftPatternDeleteResult =
  | { ok: true; id: string }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

/**
 * Soft-delete a shift pattern (and its paired shift_config): the read query
 * filters `is_active = true`, and create sets `is_active = true`, so retiring a
 * pattern means flipping `is_active = false` on both rows. Mirrors
 * createShiftPattern's permission gate + org scoping; never a hard delete.
 */
export async function deleteShiftPattern(rawInput: unknown): Promise<ShiftPatternDeleteResult> {
  const parsed = DeleteShiftPatternInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<ShiftPatternDeleteResult>(async (ctx): Promise<ShiftPatternDeleteResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<{ id: string; shift_id: string }>(
        `update public.shift_patterns
            set is_active = false,
                updated_by = $3::uuid,
                updated_at = now()
          where id = $1::uuid
            and org_id = $2::uuid
            and is_active = true
          returning id, shift_id`,
        [parsed.data.id, context.orgId, context.userId],
      );
      const deleted = rows[0];
      if (!deleted) return { ok: false, error: 'not_found' };

      await context.client.query(
        `update public.shift_configs
            set is_active = false,
                updated_by = $3::uuid,
                updated_at = now()
          where org_id = $1::uuid
            and shift_id = $2`,
        [context.orgId, deleted.shift_id, context.userId],
      );

      revalidateShiftsRoute();
      return { ok: true, id: deleted.id };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
