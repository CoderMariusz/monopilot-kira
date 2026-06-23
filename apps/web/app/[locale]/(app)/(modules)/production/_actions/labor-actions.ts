'use server';

import { Dec } from '@monopilot/domain';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type ProductionContext,
  type QueryClient,
} from '../../../../../../lib/production/shared';

const PRODUCTION_LABOR_WRITE_PERMISSION = 'production.consumption.write';
const PRODUCTION_VIEW_PERMISSION = 'production.oee.read';
const SETTINGS_READ_PERMISSION = 'settings.org.read';
const SETTINGS_WRITE_PERMISSION = 'settings.org.update';
const DEFAULT_CURRENCY = 'USD';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ClockInToWoInput = {
  woId: string;
  lineId?: string | null;
  source: 'scanner' | 'desktop';
};

export type ClockInToWoResult =
  | { ok: true; logId: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type ClockOutFromWoInput = {
  woId?: string | null;
};

export type ClockOutFromWoResult =
  | { ok: true; count: number }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type WoLaborSummaryEntry = {
  userName: string;
  hours: number;
  ratePerHour: number;
  cost: number;
  noRate?: boolean;
};

export type WoLaborSummary = {
  totalHours: number;
  totalCost: number;
  currency: string;
  entries: WoLaborSummaryEntry[];
};

export type WoLaborSummaryResult =
  | { ok: true; data: WoLaborSummary }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type UpsertLaborRateInput = {
  id?: string | null;
  roleGroup: string;
  ratePerHour: number;
  currency?: string | null;
  effectiveFrom?: string | null;
};

export type UpsertLaborRateResult =
  | { ok: true; id: string }
  | { ok: false; error: 'forbidden' | 'invalid_input' | 'persistence_failed' };

export type LaborRateRow = {
  id: string;
  siteId: string | null;
  roleGroup: string;
  ratePerHour: number;
  currency: string;
  effectiveFrom: string;
};

export type ListLaborRatesResult =
  | { ok: true; rates: LaborRateRow[] }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

type LaborLogInsertRow = { id: string };
type LaborRateExistingRow = { id: string; effective_from: string };
type LaborRateDbRow = {
  id: string;
  site_id: string | null;
  role_group: string;
  rate_per_hour: string;
  currency: string;
  effective_from: string;
};
type LaborSummaryRow = {
  log_id: string;
  user_key: string;
  user_name: string;
  started_at: string | Date;
  ended_at: string | Date | null;
  rate_per_hour: string | null;
  currency: string | null;
};

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: string | null | undefined, fallback: string): string | null {
  const candidate = value == null || value.trim() === '' ? fallback : value.trim();
  if (!DATE_RE.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function normalizeCurrency(value: string | null | undefined): string | null {
  const currency = value == null || value.trim() === '' ? DEFAULT_CURRENCY : value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizeRate(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) return null;
  return value.toFixed(4);
}

function toNumber(value: Dec, dp: number): number {
  return Number(value.toFixed(dp));
}

function timestampMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function asProductionContext(ctx: { userId: string; orgId: string; client: QueryClient }): ProductionContext {
  return { userId: ctx.userId, orgId: ctx.orgId, client: ctx.client };
}

function mapLaborRate(row: LaborRateDbRow): LaborRateRow {
  return {
    id: row.id,
    siteId: row.site_id,
    roleGroup: row.role_group,
    ratePerHour: Number(Dec.from(row.rate_per_hour).toFixed(4)),
    currency: row.currency,
    effectiveFrom: row.effective_from,
  };
}

export async function clockInToWo(input: ClockInToWoInput): Promise<ClockInToWoResult> {
  const woId = isUuid(input?.woId) ? input.woId : null;
  const lineId = normalizeOptionalText(input?.lineId, 128);
  const source = input?.source;
  if (!woId || (source !== 'scanner' && source !== 'desktop')) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ClockInToWoResult> => {
      const ctx = asProductionContext({ userId, orgId, client: client as QueryClient });
      if (!(await hasPermission(ctx, PRODUCTION_LABOR_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      await ctx.client.query(
        `update public.wo_labor_log
            set ended_at = pg_catalog.now()
          where org_id = app.current_org_id()
            and user_id = $1::uuid
            and ended_at is null`,
        [userId],
      );

      const inserted = await ctx.client.query<LaborLogInsertRow>(
        `insert into public.wo_labor_log
           (org_id, wo_id, user_id, line_id, source, started_at, ended_at)
         values (app.current_org_id(), $1::uuid, $2::uuid, $3, $4, pg_catalog.now(), null)
         returning id::text as id`,
        [woId, userId, lineId, source],
      );
      const logId = inserted.rows[0]?.id;
      if (!logId) return { ok: false, error: 'persistence_failed' };
      return { ok: true, logId };
    });
  } catch (error) {
    console.error('[production/labor] clockInToWo failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function clockOutFromWo(input: ClockOutFromWoInput = {}): Promise<ClockOutFromWoResult> {
  const woId = input?.woId == null ? null : isUuid(input.woId) ? input.woId : undefined;
  if (woId === undefined) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ClockOutFromWoResult> => {
      const ctx = asProductionContext({ userId, orgId, client: client as QueryClient });
      if (!(await hasPermission(ctx, PRODUCTION_LABOR_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const closed = await ctx.client.query<{ id: string }>(
        `update public.wo_labor_log
            set ended_at = pg_catalog.now()
          where org_id = app.current_org_id()
            and user_id = $1::uuid
            and ended_at is null
            and ($2::uuid is null or wo_id = $2::uuid)
         returning id::text as id`,
        [userId, woId],
      );
      return { ok: true, count: closed.rows.length };
    });
  } catch (error) {
    console.error('[production/labor] clockOutFromWo failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getWoLaborSummary(woId: string): Promise<WoLaborSummaryResult> {
  if (!isUuid(woId)) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WoLaborSummaryResult> => {
      const ctx = asProductionContext({ userId, orgId, client: client as QueryClient });
      if (!(await hasPermission(ctx, PRODUCTION_VIEW_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await ctx.client.query<LaborSummaryRow>(
        `select l.id::text as log_id,
                coalesce(l.user_id::text, 'deleted:' || l.id::text) as user_key,
                coalesce(nullif(u.display_name, ''), nullif(u.name, ''), u.email::text, 'Unknown user') as user_name,
                l.started_at,
                l.ended_at,
                rate.rate_per_hour::text as rate_per_hour,
                rate.currency
           from public.wo_labor_log l
           left join public.users u
             on u.id = l.user_id and u.org_id = app.current_org_id()
           left join lateral (
             select lr.rate_per_hour, lr.currency
               from public.labor_rates lr
              where lr.org_id = app.current_org_id()
                and lr.effective_from <= current_date
                and (
                  lr.role_group = l.user_id::text
                  or exists (
                    select 1
                      from public.user_roles ur
                      join public.roles r
                        on r.id = ur.role_id and r.org_id = ur.org_id
                     where ur.user_id = l.user_id
                       and ur.org_id = app.current_org_id()
                       and lower(lr.role_group) = any(array[lower(r.slug), lower(r.code), lower(r.name)])
                  )
                  or exists (
                    select 1
                      from public.roles r
                     where r.id = u.role_id
                       and r.org_id = app.current_org_id()
                       and lower(lr.role_group) = any(array[lower(r.slug), lower(r.code), lower(r.name)])
                  )
                )
              order by lr.effective_from desc, lr.created_at desc
              limit 1
           ) rate on true
          where l.org_id = app.current_org_id()
            and l.wo_id = $1::uuid
          order by l.started_at asc, l.id asc`,
        [woId],
      );

      const nowMs = Date.now();
      const byUser = new Map<
        string,
        { userName: string; hours: Dec; rate: Dec; cost: Dec; noRate: boolean; currency: string }
      >();
      let currency = DEFAULT_CURRENCY;

      for (const row of rows) {
        const startedMs = timestampMs(row.started_at);
        if (!Number.isFinite(startedMs)) continue;
        const endedMs = row.ended_at == null ? nowMs : timestampMs(row.ended_at);
        if (!Number.isFinite(endedMs)) continue;

        const durationMs = Math.max(0, endedMs - startedMs);
        const hours = Dec.from(String(durationMs)).div(Dec.from('3600000'));
        const noRate = row.rate_per_hour == null;
        const rate = noRate ? Dec.zero() : Dec.from(row.rate_per_hour);
        const cost = hours.mul(rate);
        const rowCurrency = row.currency ?? DEFAULT_CURRENCY;
        if (!noRate && currency === DEFAULT_CURRENCY) currency = rowCurrency;

        const existing = byUser.get(row.user_key);
        if (existing) {
          byUser.set(row.user_key, {
            ...existing,
            hours: existing.hours.add(hours),
            cost: existing.cost.add(cost),
            noRate: existing.noRate && noRate,
          });
        } else {
          byUser.set(row.user_key, {
            userName: row.user_name || 'Unknown user',
            hours,
            rate,
            cost,
            noRate,
            currency: rowCurrency,
          });
        }
      }

      const summarizedUsers = Array.from(byUser.values());
      const entries = summarizedUsers
        .sort((a, b) => a.userName.localeCompare(b.userName))
        .map((entry): WoLaborSummaryEntry => ({
          userName: entry.userName,
          hours: toNumber(entry.hours, 6),
          ratePerHour: toNumber(entry.rate, 4),
          cost: toNumber(entry.cost, 4),
          ...(entry.noRate ? { noRate: true } : {}),
        }));

      const totalHours = summarizedUsers.reduce((acc, entry) => acc.add(entry.hours), Dec.zero());
      const totalCost = summarizedUsers.reduce((acc, entry) => acc.add(entry.cost), Dec.zero());

      return {
        ok: true,
        data: {
          totalHours: toNumber(totalHours, 6),
          totalCost: toNumber(totalCost, 4),
          currency,
          entries,
        },
      };
    });
  } catch (error) {
    console.error('[production/labor] getWoLaborSummary failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function upsertLaborRate(input: UpsertLaborRateInput): Promise<UpsertLaborRateResult> {
  const id = input?.id == null || input.id.trim() === '' ? null : isUuid(input.id) ? input.id : undefined;
  const roleGroup = normalizeOptionalText(input?.roleGroup, 128);
  const rate = normalizeRate(input?.ratePerHour);
  const currency = normalizeCurrency(input?.currency);
  const today = todayIso();
  const effectiveFrom = normalizeDate(input?.effectiveFrom, today);
  if (id === undefined || !roleGroup || !rate || !currency || !effectiveFrom) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<UpsertLaborRateResult> => {
      const ctx = asProductionContext({ userId, orgId, client: client as QueryClient });
      if (!(await hasPermission(ctx, SETTINGS_WRITE_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      let existing: LaborRateExistingRow | null = null;
      if (id) {
        const existingRes = await ctx.client.query<LaborRateExistingRow>(
          `select id::text as id, to_char(effective_from, 'YYYY-MM-DD') as effective_from
             from public.labor_rates
            where org_id = app.current_org_id()
              and id = $1::uuid
            limit 1`,
          [id],
        );
        existing = existingRes.rows[0] ?? null;
      }

      if (existing !== null && existing.effective_from >= today && effectiveFrom >= today) {
        const updated = await ctx.client.query<{ id: string }>(
          `update public.labor_rates
              set role_group = $2,
                  rate_per_hour = $3::numeric,
                  currency = $4,
                  effective_from = $5::date
            where org_id = app.current_org_id()
              and id = $1::uuid
          returning id::text as id`,
          [existing.id, roleGroup, rate, currency, effectiveFrom],
        );
        const updatedId = updated.rows[0]?.id;
        if (!updatedId) return { ok: false, error: 'persistence_failed' };
        return { ok: true, id: updatedId };
      }

      const inserted = await ctx.client.query<{ id: string }>(
        `insert into public.labor_rates
           (org_id, role_group, rate_per_hour, currency, effective_from, created_by)
         values (app.current_org_id(), $1, $2::numeric, $3, $4::date, $5::uuid)
         returning id::text as id`,
        [roleGroup, rate, currency, effectiveFrom, userId],
      );
      const insertedId = inserted.rows[0]?.id;
      if (!insertedId) return { ok: false, error: 'persistence_failed' };
      return { ok: true, id: insertedId };
    });
  } catch (error) {
    console.error('[production/labor] upsertLaborRate failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function listLaborRates(): Promise<ListLaborRatesResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListLaborRatesResult> => {
      const ctx = asProductionContext({ userId, orgId, client: client as QueryClient });
      if (!(await hasPermission(ctx, SETTINGS_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await ctx.client.query<LaborRateDbRow>(
        `select id::text as id,
                site_id::text as site_id,
                role_group,
                rate_per_hour::text as rate_per_hour,
                currency,
                to_char(effective_from, 'YYYY-MM-DD') as effective_from
           from public.labor_rates
          where org_id = app.current_org_id()
          order by role_group asc, effective_from desc`,
      );

      return { ok: true, rates: rows.map(mapLaborRate) };
    });
  } catch (error) {
    console.error('[production/labor] listLaborRates failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
