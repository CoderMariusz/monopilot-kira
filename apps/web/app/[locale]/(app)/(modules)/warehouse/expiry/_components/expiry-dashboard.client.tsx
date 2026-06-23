'use client';

/**
 * WH-019 — Expiry management (client island: red-tier + amber-tier sections).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/warehouse/
 *   other-screens.jsx:375-508 (data-prototype-label: expiry_management_page):
 *     summary strip (red/amber count cards)   → other-screens.jsx:399-410
 *     tier sections + dense rows table         → other-screens.jsx:453-491
 *     per-row action column                    → other-screens.jsx:475-485
 *
 * Presentational only: receives already-loaded, org-scoped rows (getExpiryDashboard,
 * which already tiers each LP red/amber) + resolved i18n labels from the RSC page.
 * No data fetching, no permission logic (both resolved server-side).
 *
 * The prototype splits on use_by/best_before "mode"; the warehouse read action
 * exposes a computed FEFO `tier` (red = expired or within the warning window,
 * amber = within 30 days) instead, so we render the two tiers as the prototype's
 * red/amber sections — same density, same columns, same semantic colors.
 *
 * DEVIATIONS (red-lines):
 *   - Destroy / Manager-override actions (other-screens.jsx:475-485) remain
 *     deferred. "Force block" is live and reuses the LP-detail block Server Action.
 *   - Tabs (Expired / Expiring soon), mode pills, product/warehouse filter selects,
 *     "Run cron now" / Export, and the legal use_by/best_before footnote cards are
 *     deferred to a later lane (no backing read/action in scope).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { blockLp } from '../../license-plates/[lpId]/_actions/lp-detail-actions';
import { LpBlockModal, type LpBlockModalLabels } from '../../license-plates/[lpId]/_components/lp-block-modal.client';

export type ExpiryRow = {
  lpId: string;
  lpNumber: string;
  tier: 'red' | 'amber';
  itemCode: string | null;
  itemName: string | null;
  batchNumber: string | null;
  locationCode: string | null;
  warehouseCode: string | null;
  quantity: string;
  uom: string;
  expiryDate: string;
  daysLeft: number;
  status: string;
};

export type ExpiryLabels = {
  summary: { red: string; redSub: string; amber: string; amberSub: string };
  red: { title: string; empty: string };
  amber: { title: string; empty: string };
  columns: {
    lp: string;
    item: string;
    batch: string;
    expiry: string;
    daysLeft: string;
    location: string;
    status: string;
    action: string;
  };
  rows: string;
  daysLeft: string;
  expired: string;
  forceBlock: string;
  forceBlockComingSoon: string;
  blockModal: LpBlockModalLabels;
  none: string;
  empty: string;
  status: Record<string, string>;
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  reserved: 'info',
  allocated: 'info',
  received: 'secondary',
  quarantine: 'warning',
  blocked: 'danger',
};

function DaysLeftCell({ row, labels }: { row: ExpiryRow; labels: ExpiryLabels }) {
  if (row.daysLeft < 0) {
    return <span className="font-mono text-xs font-medium text-red-700">{labels.expired.replace('{days}', String(Math.abs(row.daysLeft)))}</span>;
  }
  const cls = row.daysLeft <= 7 ? 'text-red-700 font-medium' : 'text-amber-700';
  return <span className={`font-mono text-xs ${cls}`}>{labels.daysLeft.replace('{days}', String(row.daysLeft))}</span>;
}

function TierSection({
  testId,
  title,
  empty,
  rows,
  labels,
  locale,
  onForceBlock,
}: {
  testId: string;
  title: string;
  empty: string;
  rows: ExpiryRow[];
  labels: ExpiryLabels;
  locale: string;
  onForceBlock: (row: ExpiryRow) => void;
}) {
  return (
    <Card data-testid={testId} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span data-testid={`${testId}-count`} className="text-xs text-slate-500">
          {labels.rows.replace('{count}', String(rows.length))}
        </span>
      </div>
      {rows.length === 0 ? (
        <p data-testid={`${testId}-empty`} className="px-4 py-10 text-center text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <Table aria-label={title}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{labels.columns.lp}</TableHead>
              <TableHead scope="col">{labels.columns.item}</TableHead>
              <TableHead scope="col">{labels.columns.batch}</TableHead>
              <TableHead scope="col">{labels.columns.expiry}</TableHead>
              <TableHead scope="col">{labels.columns.daysLeft}</TableHead>
              <TableHead scope="col">{labels.columns.location}</TableHead>
              <TableHead scope="col">{labels.columns.status}</TableHead>
              <TableHead scope="col" className="text-right">{labels.columns.action}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.lpId} data-testid={`expiry-row-${row.lpId}`}>
                <TableCell className="font-mono text-sm font-semibold text-sky-700">
                  <Link
                    href={`/${locale}/warehouse/license-plates/${row.lpId}`}
                    data-testid={`expiry-link-${row.lpId}`}
                    className="hover:underline"
                  >
                    {row.lpNumber}
                  </Link>
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  <div className="flex flex-col">
                    <span className="text-sm text-slate-900">{row.itemName ?? labels.none}</span>
                    {row.itemCode ? <span className="font-mono text-[11px] text-slate-500">{row.itemCode}</span> : null}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-[11px] text-slate-600">{row.batchNumber ?? labels.none}</TableCell>
                <TableCell className="font-mono text-xs text-slate-600">{row.expiryDate.slice(0, 10)}</TableCell>
                <TableCell>
                  <DaysLeftCell row={row} labels={labels} />
                </TableCell>
                <TableCell className="font-mono text-[11px] text-slate-600">
                  {row.locationCode ?? labels.none}
                  {row.warehouseCode ? <span className="text-slate-400"> · {row.warehouseCode}</span> : null}
                </TableCell>
                <TableCell>
                  {row.status ? (
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'muted'} data-testid={`expiry-status-${row.lpId}`}>
                      {labels.status[row.status] ?? row.status}
                    </Badge>
                  ) : (
                    <span data-testid={`expiry-status-${row.lpId}`} className="text-slate-400">{labels.none}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    onClick={() => onForceBlock(row)}
                    data-testid={`expiry-force-block-${row.lpId}`}
                    className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    {labels.forceBlock}
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export function ExpiryDashboardClient({
  rows,
  redCount,
  amberCount,
  labels,
  locale,
  blockAction,
}: {
  rows: ExpiryRow[];
  redCount: number;
  amberCount: number;
  labels: ExpiryLabels;
  locale: string;
  blockAction: typeof blockLp;
}) {
  const redRows = rows.filter((r) => r.tier === 'red');
  const amberRows = rows.filter((r) => r.tier === 'amber');
  const [blockingRow, setBlockingRow] = useState<ExpiryRow | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6" data-testid="expiry-dashboard">
      {/* Summary strip — parity other-screens.jsx:399-410. */}
      <div className="grid gap-3 sm:grid-cols-2" data-testid="expiry-summary">
        <Card data-testid="expiry-summary-red" className="flex flex-col rounded-xl border border-red-200 bg-red-50 p-4">
          <span data-testid="expiry-summary-red-count" className="font-mono text-3xl font-bold text-red-700">
            {redCount.toLocaleString()}
          </span>
          <span className="mt-1 text-sm font-medium text-red-800">{labels.summary.red}</span>
          <span className="text-[11px] text-red-600">{labels.summary.redSub}</span>
        </Card>
        <Card data-testid="expiry-summary-amber" className="flex flex-col rounded-xl border border-amber-200 bg-amber-50 p-4">
          <span data-testid="expiry-summary-amber-count" className="font-mono text-3xl font-bold text-amber-700">
            {amberCount.toLocaleString()}
          </span>
          <span className="mt-1 text-sm font-medium text-amber-800">{labels.summary.amber}</span>
          <span className="text-[11px] text-amber-600">{labels.summary.amberSub}</span>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card data-testid="expiry-empty" className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm">
          {labels.empty}
        </Card>
      ) : (
        <>
          <TierSection
            testId="expiry-tier-red"
            title={labels.red.title}
            empty={labels.red.empty}
            rows={redRows}
            labels={labels}
            locale={locale}
            onForceBlock={setBlockingRow}
          />
          <TierSection
            testId="expiry-tier-amber"
            title={labels.amber.title}
            empty={labels.amber.empty}
            rows={amberRows}
            labels={labels}
            locale={locale}
            onForceBlock={setBlockingRow}
          />
        </>
      )}
      {blockingRow ? (
        <LpBlockModal
          open={Boolean(blockingRow)}
          onOpenChange={(next) => {
            if (!next) setBlockingRow(null);
          }}
          lpId={blockingRow.lpId}
          lpNumber={blockingRow.lpNumber}
          labels={labels.blockModal}
          blockAction={blockAction}
          onSuccess={() => {
            setBlockingRow(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
