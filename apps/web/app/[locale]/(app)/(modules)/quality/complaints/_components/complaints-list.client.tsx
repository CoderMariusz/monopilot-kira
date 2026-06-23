'use client';

/**
 * Wave E11 — Complaints register list (client island).
 *
 * Design-system conformance: there is NO dedicated complaints prototype JSX, so
 * this mirrors the sibling QA-009 NCR list (ncr-list.client.tsx) and the CCP
 * deviations list (deviations-list.client.tsx) 1:1 — a "+ New complaint" header
 * action opening a shadcn Modal, a search box, a shadcn status Select (NO raw
 * <select>), a dense table (complaint # mono link → detail, customer, batch/LP ref,
 * severity badge, status badge, opened date), and the empty / empty-filtered states.
 *
 * Presentational + owns ONLY the client filter state (status / search) and the
 * create-modal open state. No data fetching, no permission logic — both resolved
 * server-side; the create action is passed in as a prop (imported from the reviewed
 * backend, never authored here). The complaint NUMBER is shown, never a raw UUID
 * (the complaint id lives only in the detail-link href).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { ComplaintCreateModal } from './complaint-create-modal.client';
import {
  COMPLAINT_FILTER_STATUSES,
  type ComplaintRow,
  type ComplaintSeverity,
  type ComplaintStatus,
  type CreateComplaintAction,
} from './complaints-contracts';
import type { ComplaintListLabels } from './labels';

const SEVERITY_VARIANT: Record<ComplaintSeverity, BadgeVariant> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'muted',
};
const STATUS_VARIANT: Record<ComplaintStatus, BadgeVariant> = {
  open: 'warning',
  investigating: 'info',
  converted: 'success',
  closed: 'muted',
};

function refDisplay(r: ComplaintRow): string | null {
  return r.batchDisplay ?? r.batchRef ?? r.lpCode ?? null;
}

export function ComplaintsListClient({
  rows,
  labels,
  locale,
  canManage,
  createComplaintAction,
}: {
  rows: ComplaintRow[];
  labels: ComplaintListLabels;
  locale: string;
  canManage: boolean;
  createComplaintAction: CreateComplaintAction;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ComplaintStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === 'all' || r.status === status) &&
        (q === '' ||
          (r.complaintNumber ?? '').toLowerCase().includes(q) ||
          (r.customerDisplay ?? '').toLowerCase().includes(q) ||
          (refDisplay(r) ?? '').toLowerCase().includes(q)),
    );
  }, [rows, status, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header action — opens the create modal (gated on the server-resolved write flag). */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          data-testid="complaint-create-open"
          disabled={!canManage}
          title={!canManage ? labels.newComplaintDisabled : undefined}
          onClick={() => canManage && setCreateOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + {labels.newComplaint}
        </button>
      </div>

      {/* Filter bar. */}
      <Card className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          data-testid="complaints-list-search"
          className="w-full max-w-xs rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
        />

        {/* Status filter — shadcn Select (NO raw <select>). */}
        <div data-testid="complaints-filter-status" className="min-w-[160px]">
          <Select
            aria-label={labels.statusLabel}
            value={status}
            onValueChange={(v) => setStatus(v as ComplaintStatus | 'all')}
            options={[
              { value: 'all', label: labels.statusAll },
              ...COMPLAINT_FILTER_STATUSES.map((s) => ({ value: s, label: labels.statusValues[s] })),
            ]}
          />
        </div>

        <span className="ml-auto text-xs text-slate-500" data-testid="complaints-list-rows">
          {labels.rowsLabel.replace('{count}', String(visible.length))}
        </span>
      </Card>

      {/* Table / empty states. */}
      <Card
        data-testid="complaints-list-table-card"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        {rows.length === 0 ? (
          <p
            data-testid="complaints-list-empty"
            data-state="empty"
            className="px-4 py-10 text-center text-sm text-slate-500"
          >
            {labels.emptyAll}
          </p>
        ) : visible.length === 0 ? (
          <p
            data-testid="complaints-list-empty-filtered"
            className="px-4 py-10 text-center text-sm text-slate-500"
          >
            {labels.emptyFiltered}
          </p>
        ) : (
          <Table aria-label={labels.columns.complaintNumber}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.complaintNumber}</TableHead>
                <TableHead scope="col">{labels.columns.customer}</TableHead>
                <TableHead scope="col">{labels.columns.ref}</TableHead>
                <TableHead scope="col">{labels.columns.severity}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col">{labels.columns.openedAt}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const ref = refDisplay(r);
                return (
                  <TableRow key={r.id} data-testid={`complaint-row-${r.id}`}>
                    {/* Complaint NUMBER (mono) deep-linked to detail; the id is in the href only. */}
                    <TableCell className="font-mono text-sm font-semibold text-sky-700">
                      <Link
                        href={`/${locale}/quality/complaints/${r.id}`}
                        data-testid={`complaint-link-${r.id}`}
                        className="hover:underline"
                      >
                        {r.complaintNumber ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell
                      className="max-w-xs truncate text-xs text-slate-700"
                      data-testid={`complaint-customer-${r.id}`}
                      title={r.customerDisplay ?? undefined}
                    >
                      {r.customerDisplay ?? <span className="text-slate-400">{labels.noCustomer}</span>}
                    </TableCell>
                    <TableCell
                      className="font-mono text-[11px] text-slate-600"
                      data-testid={`complaint-ref-${r.id}`}
                    >
                      {ref ?? <span className="text-slate-400">{labels.noRef}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={SEVERITY_VARIANT[r.severity] ?? 'muted'}
                        data-testid={`complaint-severity-${r.id}`}
                      >
                        {labels.severityValues[r.severity] ?? r.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[r.status] ?? 'muted'}
                        data-testid={`complaint-status-${r.id}`}
                      >
                        {labels.statusValues[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {r.openedAt.slice(0, 10)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <ComplaintCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        labels={labels.createLabels}
        createComplaintAction={createComplaintAction}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
