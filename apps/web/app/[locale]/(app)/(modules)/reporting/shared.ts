export const REPORTING_PERIODS = ['today', 'week', 'month', 'quarter', '7d', '30d', 'custom'] as const;

export type ReportingPeriod = (typeof REPORTING_PERIODS)[number];

export type ReportingSearchParams = Record<string, string | string[] | undefined>;

export type ReportingWindow = {
  period: ReportingPeriod;
  from: Date;
  to: Date;
};

export type ReportingLineOption = {
  id: string;
  code: string;
  name: string;
};

export type ReportingFilters = {
  period: ReportingPeriod;
  fromDate: string;
  toDate: string;
  lineId?: string;
  orderQuery?: string;
  window: ReportingWindow;
};

const MS_PER_DAY = 86_400_000;

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizePeriod(value: string | string[] | undefined): ReportingPeriod {
  const raw = firstSearchValue(value);
  return REPORTING_PERIODS.includes(raw as ReportingPeriod) ? (raw as ReportingPeriod) : '7d';
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfUtcDay(value: Date): Date {
  const start = startOfUtcDay(value);
  return new Date(start.getTime() + MS_PER_DAY - 1);
}

function startOfIsoWeekUtc(value: Date): Date {
  const start = startOfUtcDay(value);
  const day = start.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return new Date(start.getTime() - daysSinceMonday * MS_PER_DAY);
}

function parseIsoDateParam(value: string | undefined, boundary: 'start' | 'end'): Date | null {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return boundary === 'end' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? endOfUtcDay(parsed) : parsed;
}

/** Detect reversed custom range before computeReportingWindow silently falls back. */
export function detectCustomRangeError(
  searchParams: ReportingSearchParams | undefined,
): 'reversed' | null {
  const rawPeriod = firstSearchValue(searchParams?.period);
  if (rawPeriod !== 'custom') return null;
  const rawFrom = firstSearchValue(searchParams?.from);
  const rawTo = firstSearchValue(searchParams?.to);
  const from = parseIsoDateParam(rawFrom, 'start');
  const to = parseIsoDateParam(rawTo, 'end');
  if (from && to && from.getTime() > to.getTime()) return 'reversed';
  return null;
}

function dateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function reportingWindowDays(window: Pick<ReportingWindow, 'from' | 'to'>): number {
  const span = window.to.getTime() - window.from.getTime();
  if (!Number.isFinite(span) || span <= 0) return 1;
  return Math.max(1, Math.round(span / MS_PER_DAY));
}

export function computeReportingWindow(
  periodInput: string | string[] | undefined,
  input: { from?: string; to?: string; now?: Date } = {},
): ReportingWindow {
  const period = normalizePeriod(periodInput);
  const now = input.now ?? new Date();
  const todayStart = startOfUtcDay(now);

  switch (period) {
    case 'today':
      return { period, from: todayStart, to: endOfUtcDay(now) };
    case 'week': {
      const from = startOfIsoWeekUtc(now);
      return { period, from, to: new Date(from.getTime() + 7 * MS_PER_DAY - 1) };
    }
    case 'month': {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return { period, from, to: new Date(nextMonth.getTime() - 1) };
    }
    case 'quarter': {
      const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
      const from = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
      const nextQuarter = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth + 3, 1));
      return { period, from, to: new Date(nextQuarter.getTime() - 1) };
    }
    case '30d':
      return { period, from: new Date(now.getTime() - 30 * MS_PER_DAY), to: now };
    case 'custom': {
      const from = parseIsoDateParam(input.from, 'start');
      const to = parseIsoDateParam(input.to, 'end');
      if (from && to && from.getTime() <= to.getTime()) return { period, from, to };
      return computeReportingWindow('7d', { now });
    }
    case '7d':
    default:
      return { period: '7d', from: new Date(now.getTime() - 7 * MS_PER_DAY), to: now };
  }
}

export function parseReportingFilters(
  searchParams: ReportingSearchParams | undefined,
  now = new Date(),
): ReportingFilters {
  const period = normalizePeriod(searchParams?.period);
  const rawFrom = firstSearchValue(searchParams?.from);
  const rawTo = firstSearchValue(searchParams?.to);
  const window = computeReportingWindow(period, { from: rawFrom, to: rawTo, now });
  const lineId = firstSearchValue(searchParams?.line)?.trim();
  const orderQuery = firstSearchValue(searchParams?.q)?.trim();

  return {
    period: window.period,
    fromDate: window.period === 'custom' && rawFrom ? rawFrom : dateInputValue(window.from),
    toDate: window.period === 'custom' && rawTo ? rawTo : dateInputValue(window.to),
    lineId: lineId || undefined,
    orderQuery: orderQuery || undefined,
    window,
  };
}
