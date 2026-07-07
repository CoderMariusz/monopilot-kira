'use client';

/**
 * Minimal list footer — "Showing N of M" plus optional Previous/Next links.
 * Matches the supplier/customer list footer idiom (text-xs slate-500 row).
 */

import Link from 'next/link';

export type ListPaginationLabels = {
  showing: string;
  previous: string;
  next: string;
};

export type ListPaginationFooterProps = {
  shown: number;
  total: number;
  previousHref?: string | null;
  nextHref?: string | null;
  labels: ListPaginationLabels;
  testId?: string;
};

export function ListPaginationFooter({
  shown,
  total,
  previousHref,
  nextHref,
  labels,
  testId = 'list-pagination-footer',
}: ListPaginationFooterProps) {
  if (total <= 0) return null;

  const showingText = labels.showing
    .replace('{shown}', String(shown))
    .replace('{total}', String(total));

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500"
      data-testid={testId}
    >
      <span data-testid={`${testId}-showing`}>{showingText}</span>
      <div className="flex items-center gap-2">
        {previousHref ? (
          <Link
            href={previousHref}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            data-testid={`${testId}-prev`}
          >
            {labels.previous}
          </Link>
        ) : (
          <span
            className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-400"
            data-testid={`${testId}-prev-disabled`}
            aria-disabled="true"
          >
            {labels.previous}
          </span>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            data-testid={`${testId}-next`}
          >
            {labels.next}
          </Link>
        ) : (
          <span
            className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-400"
            data-testid={`${testId}-next-disabled`}
            aria-disabled="true"
          >
            {labels.next}
          </span>
        )}
      </div>
    </div>
  );
}
