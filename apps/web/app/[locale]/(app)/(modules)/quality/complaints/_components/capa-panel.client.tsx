'use client';

/**
 * Wave E11 — CAPA panel (client island) on the complaint detail page.
 *
 * Design-system conformance: a Card + dense Table mirroring the NCR detail
 * investigation/CAPA section and the CCP deviations list. Lists the CAPA actions
 * for this source (complaint), exposes a "+ Add CAPA action" header action opening
 * the add modal, and a per-OPEN-action [Resolve] button opening the e-sign modal.
 *
 * Presentational + owns ONLY the add/resolve modal open + target state. Data is
 * passed in from the RSC detail page (listCapaActions read server-side); the create
 * + resolve actions are passed in as props (imported from the reviewed backend,
 * never authored here). Resolve is gated on the server-resolved canManage flag and
 * keeps a tooltip when disabled. No raw UUID is rendered — the action TYPE +
 * description identify each row.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { CapaCreateModal } from './capa-create-modal.client';
import { CapaResolveModal } from './capa-resolve-modal.client';
import type {
  CapaActionRow,
  CapaStatus,
  CreateCapaActionAction,
  ResolveCapaActionAction,
} from './complaints-contracts';
import type { CapaPanelLabels } from './labels';

const STATUS_VARIANT: Record<CapaStatus, BadgeVariant> = {
  open: 'warning',
  in_progress: 'info',
  closed: 'success',
};

export function CapaPanel({
  sourceId,
  actions,
  labels,
  canManage,
  createCapaActionAction,
  resolveCapaActionAction,
}: {
  sourceId: string;
  actions: CapaActionRow[];
  labels: CapaPanelLabels;
  canManage: boolean;
  createCapaActionAction: CreateCapaActionAction;
  resolveCapaActionAction: ResolveCapaActionAction;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<CapaActionRow | null>(null);

  return (
    <Card
      data-testid="capa-panel"
      className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{labels.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{labels.subtitle}</p>
        </div>
        <button
          type="button"
          data-testid="capa-add-open"
          disabled={!canManage}
          title={!canManage ? labels.resolveDisabled : undefined}
          onClick={() => canManage && setAddOpen(true)}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + {labels.addAction}
        </button>
      </div>

      {actions.length === 0 ? (
        <p
          data-testid="capa-panel-empty"
          data-state="empty"
          className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500"
        >
          {labels.empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table aria-label={labels.title}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.actionType}</TableHead>
                <TableHead scope="col">{labels.columns.description}</TableHead>
                <TableHead scope="col">{labels.columns.owner}</TableHead>
                <TableHead scope="col">{labels.columns.due}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col">{labels.columns.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((a) => (
                <TableRow key={a.id} data-testid={`capa-row-${a.id}`}>
                  <TableCell>
                    <Badge variant="muted" data-testid={`capa-type-${a.id}`} className="text-[10px] capitalize">
                      {labels.actionTypeValues[a.actionType] ?? a.actionType}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-sm text-xs text-slate-700" title={a.description}>
                    {a.description}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600" data-testid={`capa-owner-${a.id}`}>
                    {labels.noOwner}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600" data-testid={`capa-due-${a.id}`}>
                    {a.dueDate ?? labels.noDue}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[a.status] ?? 'muted'} data-testid={`capa-status-${a.id}`}>
                      {labels.statusValues[a.status] ?? a.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.status !== 'closed' ? (
                      <button
                        type="button"
                        data-testid={`capa-resolve-open-${a.id}`}
                        disabled={!canManage}
                        title={!canManage ? labels.resolveDisabled : undefined}
                        onClick={() => canManage && setResolveTarget(a)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {labels.resolve}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">{labels.noDue}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CapaCreateModal
        open={addOpen}
        onOpenChange={setAddOpen}
        sourceType="complaint"
        sourceId={sourceId}
        labels={labels.addLabels}
        createCapaActionAction={createCapaActionAction}
        onCreated={() => {
          setAddOpen(false);
          router.refresh();
        }}
      />

      {resolveTarget ? (
        <CapaResolveModal
          open={resolveTarget !== null}
          onOpenChange={(o) => {
            if (!o) setResolveTarget(null);
          }}
          capa={resolveTarget}
          labels={labels.resolveLabels}
          resolveCapaActionAction={resolveCapaActionAction}
          onResolved={() => {
            setResolveTarget(null);
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}
