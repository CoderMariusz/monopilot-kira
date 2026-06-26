'use client';

/**
 * SensoryRecordControls — the client shell that owns the sensory write
 * affordances on the (server-rendered) sensory list page:
 *   - the toolbar "+ Record evaluation" button (CREATE)
 *   - per-row "Edit" buttons (prefill via getSensoryEvaluation → EDIT)
 *   - the RecordSensoryModal instance + its open/initial state
 *
 * Parity source = existing sensory READ screens + Technical modal conventions
 * (no standalone sensory JSX prototype exists). RBAC: the page only renders this
 * shell when the server resolved canWrite — there is no render-then-disable; the
 * action re-checks server-side.
 *
 * On a successful save we router.refresh() so the server list re-queries Supabase
 * (no client-side mutation of the read model).
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { getSensoryEvaluation } from '../_actions/get-sensory-evaluation';
import {
  RecordSensoryModal,
  type RecordSensoryInitial,
  type RecordSensoryLabels,
} from './record-sensory-modal.client';
import type { SensorySubjectTypeWrite, SensoryStatusWrite } from '../_actions/record-sensory-constants';

export type SensoryEditableRow = {
  id: string;
  subjectRef: string;
};

export function SensoryRecordControls({
  labels,
  editLabel,
  loadErrorLabel,
  editableRows,
}: {
  labels: RecordSensoryLabels;
  editLabel: string;
  loadErrorLabel: string;
  editableRows: SensoryEditableRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [initial, setInitial] = React.useState<RecordSensoryInitial | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Stable identity per render so the modal remounts (resets its internal state)
  // whenever we open a different subject. The key is derived in the page wrapper.
  const editById = React.useMemo(() => {
    const map = new Map<string, SensoryEditableRow>();
    for (const r of editableRows) map.set(r.id, r);
    return map;
  }, [editableRows]);

  function openCreate() {
    setLoadError(null);
    setInitial(null);
    setOpen(true);
  }

  async function openEdit(panelId: string) {
    setLoadError(null);
    const result = await getSensoryEvaluation(panelId);
    if (!result.ok) {
      setLoadError(loadErrorLabel);
      return;
    }
    const d = result.data;
    setInitial({
      panelId: d.panelId,
      subjectType: d.subjectType as SensorySubjectTypeWrite,
      subjectRef: d.subjectRef,
      subjectItemId: d.subjectItemId,
      status: d.status as SensoryStatusWrite,
      statusReason: d.statusReason,
      panelDate: d.panelDate,
      panelistCount: d.panelistCount,
      benchmarkProductCode: d.benchmarkProductCode,
      overallScore: d.overallScore,
      attributes: d.attributes.map((a) => ({
        attributeName: a.attributeName,
        scoreOutOf10: a.scoreOutOf10,
        vsBenchmark: a.vsBenchmark,
      })),
      comments: d.comments.map((c) => ({ panelistCode: c.panelistCode, comment: c.comment })),
    });
    setOpen(true);
  }

  function handleSaved() {
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          className="btn-primary btn-sm"
          data-testid="sensory-record-button"
          onClick={openCreate}
        >
          + {labels.titleCreate}
        </Button>
      </div>

      {loadError ? (
        <div role="alert" className="alert alert-red" data-testid="sensory-load-error">
          {loadError}
        </div>
      ) : null}

      {/* Per-row edit triggers. Rendered as a hidden control strip the page maps
          onto each row via data attributes; kept here so the modal/edit state is
          colocated with the controls. The page renders the edit button inline by
          referencing these ids — see SensoryEditButton below. */}
      {editById.size > 0 ? (
        <div hidden data-testid="sensory-edit-registry">
          {editableRows.map((r) => (
            <button
              key={r.id}
              type="button"
              data-sensory-edit-target={r.id}
              onClick={() => void openEdit(r.id)}
            />
          ))}
        </div>
      ) : null}

      {open ? (
        <RecordSensoryModal
          key={initial?.panelId ?? 'create'}
          open={open}
          onClose={() => setOpen(false)}
          onSaved={handleSaved}
          labels={labels}
          initial={initial}
        />
      ) : null}
    </>
  );
}

/**
 * A standalone edit trigger to drop into a server-rendered table row. It dispatches
 * a click on the matching hidden registry button (rendered by SensoryRecordControls)
 * so the edit flow stays in one client component without prop-drilling the loader.
 */
export function SensoryEditButton({ panelId, label }: { panelId: string; label: string }) {
  function handleClick() {
    const target = document.querySelector<HTMLButtonElement>(
      `[data-sensory-edit-target="${panelId}"]`,
    );
    target?.click();
  }
  return (
    <Button
      type="button"
      className="btn-secondary btn-sm"
      data-testid={`sensory-edit-${panelId}`}
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}

export default SensoryRecordControls;
