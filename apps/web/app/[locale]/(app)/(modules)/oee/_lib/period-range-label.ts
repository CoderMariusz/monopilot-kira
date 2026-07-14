import type { ReportingWindow } from '../../reporting/_lib/period';

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Human range phrase derived from the same window that drives the query. */
export function periodRangeLabel(window: ReportingWindow): string {
  switch (window.period) {
    case 'today':
      return 'today';
    case 'week':
      return 'this week';
    case 'month':
      return 'this month';
    case 'quarter':
      return 'this quarter';
    case '30d':
      return 'last 30 days';
    case 'custom':
      return `${isoDate(window.from)} – ${isoDate(window.to)}`;
    case '7d':
    default:
      return 'last 7 days';
  }
}

export function oeeLinesHeading(window: ReportingWindow): string {
  return `OEE by line — ${periodRangeLabel(window)}`;
}

export function oeeLinesEmpty(window: ReportingWindow): string {
  const range = periodRangeLabel(window);
  return window.period === 'today' || window.period === 'custom'
    ? `No snapshots for ${range}.`
    : `No snapshots in the ${range}.`;
}

export function analyticsTopDowntimeHeading(window: ReportingWindow): string {
  return `Top downtime drivers — ${periodRangeLabel(window)}`;
}

export function analyticsTrendHeading(window: ReportingWindow): string {
  return `OEE — ${periodRangeLabel(window)} trend`;
}

export function analyticsYieldHeading(window: ReportingWindow): string {
  return `Yield by line (${periodRangeLabel(window)})`;
}
