'use client';

/**
 * WAREHOUSE INBOUND SCHEDULE — presentational client island.
 *
 * Owner-reported gap (no dedicated prototype): from the warehouse PC you cannot
 * see open POs / TOs / what arrives TODAY. There is no JSX prototype for this
 * screen, so the visual language is BASED ON the established warehouse dashboard
 * + GRN-list family (documented as the parity basis in inbound/page.tsx):
 *   - dense shadcn Table with mono doc links + status Badge   → grn-list.client.tsx
 *   - Card-wrapped sections with a counted header strip       → warehouse-dashboard
 *   - type chip via Badge, em-dash for absent values          → grn-list.client.tsx
 *
 * Presentational only: receives already-loaded, org-scoped + already-PARTITIONED
 * rows + resolved i18n labels from the RSC page. No data fetching, no permission
 * logic, no client-side date math beyond rendering the server-provided values
 * (the today/overdue/upcoming partition is computed server-side in page.tsx so a
 * client clock can never reshuffle the schedule). No raw <select>.
 */

import Link from 'next/link';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type InboundDocType = 'po' | 'to';

/** Uniform inbound row — a PO or a TO normalized to one renderable shape. */
export type InboundRow = {
  /** Stable React key + testid suffix. */
  id: string;
  type: InboundDocType;
  /** poNumber / toNumber (mono link). */
  docNumber: string;
  /** Detail route, locale-prefixed by the page. */
  href: string;
  /** Desktop GRN receive route for open POs / in-transit TOs (optional). */
  receiveHref?: string | null;
  /** Supplier (PO) or "FROM → TO" warehouse route (TO). */
  party: string;
  status: string;
  /** Expected date as YYYY-MM-DD, or null when the document carries no date. */
  expectedDate: string | null;
  /** Line count (POs only; TOs render an em-dash). */
  lineCount: number | null;
  /** Whole days overdue (>0) when the row sits in the overdue section, else 0. */
  overdueDays: number;
};

export type InboundLabels = {
  sections: {
    today: string;
    todaySub: string;
    overdue: string;
    overdueSub: string;
    upcoming: string;
    upcomingSub: string;
  };
  columns: { doc: string; type: string; party: string; expected: string; status: string; lines: string; receive: string };
  type: Record<InboundDocType, string>;
  status: Record<string, string>;
  noDate: string;
  overdueBy: string;
  todayMarker: string;
  empty: { today: string; overdue: string; upcoming: string; all: string };
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  // PO open statuses
  sent: 'info',
  confirmed: 'success',
  partially_received: 'warning',
  // TO open statuses
  draft: 'muted',
  in_transit: 'info',
};

type SectionKey = 'today' | 'overdue' | 'upcoming';

function InboundTable({
  rows,
  section,
  labels,
}: {
  rows: InboundRow[];
  section: SectionKey;
  labels: InboundLabels;
}) {
  return (
    <Table aria-label={labels.sections[section]}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{labels.columns.doc}</TableHead>
          <TableHead scope="col">{labels.columns.type}</TableHead>
          <TableHead scope="col">{labels.columns.party}</TableHead>
          <TableHead scope="col">{labels.columns.expected}</TableHead>
          <TableHead scope="col">{labels.columns.status}</TableHead>
          <TableHead scope="col" className="text-right">
            {labels.columns.lines}
          </TableHead>
          <TableHead scope="col" className="text-right">
            {labels.columns.receive}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} data-testid={`inbound-row-${r.id}`} data-section={section}>
            <TableCell className="font-mono text-sm font-semibold text-sky-700">
              <Link href={r.href} data-testid={`inbound-link-${r.id}`} className="hover:underline">
                {r.docNumber}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="muted" data-testid={`inbound-type-${r.id}`} className="text-[10px]">
                {labels.type[r.type]}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-slate-700">{r.party}</TableCell>
            <TableCell
              data-testid={`inbound-expected-${r.id}`}
              className={[
                'font-mono text-xs',
                section === 'overdue' ? 'font-semibold text-red-600' : 'text-slate-600',
              ].join(' ')}
            >
              {r.expectedDate ?? labels.noDate}
              {section === 'overdue' && r.overdueDays > 0 ? (
                <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                  {labels.overdueBy.replace('{days}', String(r.overdueDays))}
                </span>
              ) : null}
              {section === 'today' ? (
                <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  {labels.todayMarker}
                </span>
              ) : null}
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[r.status] ?? 'muted'} data-testid={`inbound-status-${r.id}`}>
                {labels.status[r.status] ?? r.status}
              </Badge>
            </TableCell>
            <TableCell
              className="text-right font-mono text-sm tabular-nums"
              data-testid={`inbound-lines-${r.id}`}
            >
              {r.lineCount === null ? '—' : r.lineCount}
            </TableCell>
            <TableCell className="text-right">
              {r.receiveHref ? (
                <Link
                  href={r.receiveHref}
                  data-testid={`inbound-receive-${r.id}`}
                  className="text-xs font-semibold text-sky-700 hover:underline"
                >
                  {labels.columns.receive}
                </Link>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Section({
  section,
  rows,
  title,
  sub,
  emptyText,
  labels,
  accent,
}: {
  section: SectionKey;
  rows: InboundRow[];
  title: string;
  sub: string;
  emptyText: string;
  labels: InboundLabels;
  accent: string;
}) {
  return (
    <Card
      data-testid={`inbound-section-${section}`}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-baseline gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className={['text-sm font-semibold', accent].join(' ')}>{title}</h2>
        <span
          data-testid={`inbound-count-${section}`}
          className="rounded-full bg-slate-100 px-2 text-[11px] tabular-nums text-slate-600"
        >
          {rows.length}
        </span>
        <span className="ml-auto hidden text-xs text-slate-400 sm:inline">{sub}</span>
      </div>
      {rows.length === 0 ? (
        <p data-testid={`inbound-empty-${section}`} className="px-4 py-8 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <InboundTable rows={rows} section={section} labels={labels} />
      )}
    </Card>
  );
}

export function InboundScheduleClient({
  today,
  overdue,
  upcoming,
  labels,
}: {
  today: InboundRow[];
  overdue: InboundRow[];
  upcoming: InboundRow[];
  labels: InboundLabels;
}) {
  const total = today.length + overdue.length + upcoming.length;

  // Global empty — no open inbound documents at all (honest, distinct from a
  // populated screen that merely has an empty section).
  if (total === 0) {
    return (
      <p
        data-testid="inbound-empty-all"
        className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center text-sm text-slate-500"
      >
        {labels.empty.all}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="inbound-schedule">
      <Section
        section="overdue"
        rows={overdue}
        title={labels.sections.overdue}
        sub={labels.sections.overdueSub}
        emptyText={labels.empty.overdue}
        labels={labels}
        accent="text-red-700"
      />
      <Section
        section="today"
        rows={today}
        title={labels.sections.today}
        sub={labels.sections.todaySub}
        emptyText={labels.empty.today}
        labels={labels}
        accent="text-emerald-700"
      />
      <Section
        section="upcoming"
        rows={upcoming}
        title={labels.sections.upcoming}
        sub={labels.sections.upcomingSub}
        emptyText={labels.empty.upcoming}
        labels={labels}
        accent="text-slate-900"
      />
    </div>
  );
}
