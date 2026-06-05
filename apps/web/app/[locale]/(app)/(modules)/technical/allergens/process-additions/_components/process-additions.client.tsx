'use client';

/**
 * Process allergen additions (ProcessAllergenScreen) — client island.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:1432-1484 (ProcessAllergenScreen). Admin-only config:
 *   manufacturing_operation_name → allergen_code mapping. The cascade rule merges
 *   these into FG allergen profiles (PRD §10.4). Table: operation code (mono) +
 *   name + allergen (mono code + name) + intensity badge + reason + edit/delete.
 *
 * Backed by the EXISTING manufacturing-op service via the load-config Server
 * Actions (saveMfgOpAddition / removeMfgOpAddition) — withOrgContext + RLS, no
 * mocks. Writes gated on technical.allergens.edit (re-checked server-side).
 *
 * Five UI states: loading / empty / error / permission-denied / ready (+optimistic
 * add via useTransition + router.refresh).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import type { AllergenRefCol, MfgOpAddition, MfgOpRow } from '../../../allergens-config/_actions/load-config';

export type ProcessAdditionsState = 'ready' | 'empty' | 'error' | 'denied';

export type ProcessAdditionsLabels = {
  infoNote: string;
  addCta: string;
  colOperation: string;
  colAllergen: string;
  colIntensity: string;
  colReason: string;
  colActions: string;
  intensityContains: string;
  delete: string;
  empty: string;
  emptyBody: string;
  error: string;
  denied: string;
  readOnlyTag: string;
  warnNote: string;
  modalTitle: string;
  modalOperation: string;
  modalAllergen: string;
  modalReason: string;
  modalReasonPlaceholder: string;
  modalSave: string;
  modalCancel: string;
  saveError: string;
  selectPlaceholder: string;
};

type SaveResult = { ok: true } | { ok: false; error: string };

export type ProcessAdditionsProps = {
  state: ProcessAdditionsState;
  additions: MfgOpAddition[];
  operations: MfgOpRow[];
  allergens: AllergenRefCol[];
  canEdit: boolean;
  labels: ProcessAdditionsLabels;
  saveAction: (input: {
    manufacturingOperationName: string;
    allergenCode: string;
    reason?: string;
  }) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  removeAction: (input: {
    manufacturingOperationName: string;
    allergenCode: string;
  }) => Promise<SaveResult>;
};

export function ProcessAdditions({
  state,
  additions,
  operations,
  allergens,
  canEdit,
  labels,
  saveAction,
  removeAction,
}: ProcessAdditionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [op, setOp] = useState('');
  const [allergen, setAllergen] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (state === 'denied') {
    return (
      <div role="alert" data-testid="process-additions-denied" className="alert alert-amber">
        <div className="alert-title">{labels.denied}</div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" data-testid="process-additions-error" className="alert alert-red">
        <div className="alert-title">{labels.error}</div>
      </div>
    );
  }

  const allergenName = (code: string) =>
    allergens.find((a) => a.allergenCode === code)?.allergenName ?? code;

  function resetModal() {
    setOp('');
    setAllergen('');
    setReason('');
    setError(null);
    setModalOpen(false);
  }

  function handleSave() {
    if (!op || !allergen) {
      setError(labels.saveError);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveAction({
        manufacturingOperationName: op,
        allergenCode: allergen,
        reason: reason || undefined,
      });
      if (result.ok) {
        resetModal();
        router.refresh();
      } else {
        setError(labels.saveError);
      }
    });
  }

  function handleDelete(addition: MfgOpAddition) {
    startTransition(async () => {
      const result = await removeAction({
        manufacturingOperationName: addition.manufacturingOperationName,
        allergenCode: addition.allergenCode,
      });
      if (result.ok) router.refresh();
      else setError(labels.saveError);
    });
  }

  return (
    <div data-testid="process-additions" data-state={state} className="flex flex-col gap-3">
      {/* Info note — the cascade-merge explanation. */}
      <div className="alert alert-blue" data-testid="process-additions-note">
        <span aria-hidden="true">ⓘ</span> {labels.infoNote}
      </div>

      <div className="flex items-center justify-between">
        {!canEdit ? (
          <Badge variant="muted" data-testid="process-additions-readonly">
            {labels.readOnlyTag}
          </Badge>
        ) : (
          <span />
        )}
        {canEdit ? (
          <Button
            type="button"
            className="btn-primary"
            data-testid="process-additions-add"
            onClick={() => setModalOpen(true)}
          >
            {labels.addCta}
          </Button>
        ) : null}
      </div>

      {error && !modalOpen ? (
        <p role="alert" className="alert alert-red">
          {error}
        </p>
      ) : null}

      {additions.length === 0 ? (
        <div data-testid="process-additions-empty" className="card">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">⊕</span>
            <p className="empty-state-title">{labels.empty}</p>
            <p className="empty-state-body">{labels.emptyBody}</p>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}
        >
          <Table aria-label={labels.colOperation} data-testid="process-additions-table">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.colOperation}</TableHead>
                <TableHead scope="col">{labels.colAllergen}</TableHead>
                <TableHead scope="col">{labels.colIntensity}</TableHead>
                <TableHead scope="col">{labels.colReason}</TableHead>
                {canEdit ? <TableHead scope="col">{labels.colActions}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {additions.map((m) => (
                <TableRow
                  key={`${m.manufacturingOperationName}-${m.allergenCode}`}
                  data-testid={`process-row-${m.manufacturingOperationName}-${m.allergenCode}`}
                >
                  <TableCell className="font-medium">{m.manufacturingOperationName}</TableCell>
                  <TableCell>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginRight: 4 }}>
                      {m.allergenCode}
                    </span>
                    {allergenName(m.allergenCode)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="danger">{labels.intensityContains}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.reason ?? '—'}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <Button
                        type="button"
                        className="btn-ghost btn-sm"
                        style={{ color: 'var(--red)' }}
                        disabled={pending}
                        aria-label={`${labels.delete} ${m.manufacturingOperationName} ${m.allergenCode}`}
                        data-testid={`process-delete-${m.manufacturingOperationName}-${m.allergenCode}`}
                        onClick={() => handleDelete(m)}
                      >
                        ✕
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* V-TEC-40 / V-TEC-41 warning footnote. */}
      <div className="alert alert-amber" data-testid="process-additions-warn">
        <span aria-hidden="true">△</span> {labels.warnNote}
      </div>

      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={labels.modalTitle}
          data-testid="process-additions-modal"
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(15,23,42,.45)' }}
        >
          <div className="card w-full max-w-md" style={{ margin: 0 }}>
            <div className="card-head">
              <h2 className="card-title">{labels.modalTitle}</h2>
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {labels.modalOperation}
                </span>
                <Select
                  value={op}
                  onValueChange={setOp}
                  options={operations.map((o) => ({ value: o.operationName, label: o.operationName }))}
                  placeholder={labels.selectPlaceholder}
                  aria-label={labels.modalOperation}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {labels.modalAllergen}
                </span>
                <Select
                  value={allergen}
                  onValueChange={setAllergen}
                  options={allergens.map((a) => ({
                    value: a.allergenCode,
                    label: `${a.allergenName} (${a.allergenCode})`,
                  }))}
                  placeholder={labels.selectPlaceholder}
                  aria-label={labels.modalAllergen}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {labels.modalReason}
                </span>
                <input
                  className="form-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={labels.modalReasonPlaceholder}
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="card-head mt-4 justify-end gap-2" style={{ marginBottom: 0 }}>
              <Button type="button" className="btn-secondary" onClick={resetModal} disabled={pending}>
                {labels.modalCancel}
              </Button>
              <Button
                type="button"
                className="btn-primary"
                data-testid="process-additions-modal-save"
                onClick={handleSave}
                disabled={pending}
              >
                {labels.modalSave}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
