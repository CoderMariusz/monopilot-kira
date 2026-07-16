import {
  computeReportingWindow,
  detectCustomRangeError,
  reportingWindowDays,
  REPORTING_PERIODS,
  type ReportingPeriod,
  type ReportingSearchParams,
  type ReportingWindow,
} from '../shared';

export {
  computeReportingWindow,
  detectCustomRangeError,
  reportingWindowDays,
  REPORTING_PERIODS,
  type ReportingPeriod,
  type ReportingSearchParams,
  type ReportingWindow,
};

export type PeriodFilterSelection = {
  period: ReportingPeriod;
  fromDate: string;
  toDate: string;
  window: ReportingWindow;
  /** Set when custom period params are present but invalid (from > to). */
  rangeError: 'reversed' | null;
};

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function dateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parsePeriodSearchParams(
  searchParams: ReportingSearchParams | undefined,
  now = new Date(),
): PeriodFilterSelection {
  const rawPeriod = firstSearchValue(searchParams?.period);
  const rawFrom = firstSearchValue(searchParams?.from);
  const rawTo = firstSearchValue(searchParams?.to);
  const window = computeReportingWindow(rawPeriod, { from: rawFrom, to: rawTo, now });
  const rangeError = detectCustomRangeError(searchParams);
  const period = rawPeriod === 'custom' ? 'custom' : window.period;

  return {
    period,
    fromDate: rawPeriod === 'custom' && rawFrom ? rawFrom : dateInputValue(window.from),
    toDate: rawPeriod === 'custom' && rawTo ? rawTo : dateInputValue(window.to),
    window,
    rangeError,
  };
}
