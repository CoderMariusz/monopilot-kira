'use client';

/**
 * RecordSensoryModal — the sensory panel CREATE + EDIT form (first sensory write
 * affordance in the app).
 *
 * Parity source = the existing sensory READ screens (technical/sensory list +
 * NPD pipeline sensory-screen.tsx / sensory-radar.tsx) + Technical create-modal
 * conventions (allergen-override-modal.tsx, supplier-spec edit modal). There is
 * NO standalone sensory JSX prototype (confirmed by grep) — this mirrors the
 * @monopilot/ui Modal + Field shell those modals use.
 *
 * The attribute seed rows reuse the SAME canonical names the radar reads
 * (Appearance / Aroma / Texture / Flavour / Aftertaste / Overall) so a recorded
 * panel renders on the radar.
 *
 * RBAC: this modal is only mounted from a write-permitted surface (the page omits
 * the trigger when !canWrite). The authoritative check lives server-side inside
 * recordSensoryEvaluation (FORBIDDEN); on { ok:false } we surface an inline
 * role="alert" and never throw.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import Modal from '@monopilot/ui/Modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';
import Textarea from '@monopilot/ui/Textarea';

import {
  recordSensoryEvaluation,
  type RecordSensoryEvaluationInput,
  type RecordSensoryEvaluationResult,
} from '../_actions/record-sensory-evaluation';
import {
  DEFAULT_SENSORY_ATTRIBUTES,
  SENSORY_STATUSES,
  SENSORY_SUBJECT_TYPES,
  type SensoryStatusWrite,
  type SensorySubjectTypeWrite,
} from '../_actions/record-sensory-constants';

export type RecordSensoryLabels = {
  titleCreate: string;
  titleEdit: string;
  subjectType: string;
  subjectRef: string;
  subjectItemId: string;
  panelDate: string;
  panelistCount: string;
  benchmark: string;
  overallScore: string;
  status: string;
  statusReason: string;
  attributesTitle: string;
  attributeName: string;
  score: string;
  vsBenchmark: string;
  addAttribute: string;
  removeRow: string;
  commentsTitle: string;
  panelistCode: string;
  comment: string;
  addComment: string;
  cancel: string;
  save: string;
  saving: string;
  errorInvalid: string;
  errorForbidden: string;
  errorNotFound: string;
  errorPersist: string;
  required: string;
  subjectTypes: Record<SensorySubjectTypeWrite, string>;
  statuses: Record<SensoryStatusWrite, string>;
};

export type RecordSensoryInitial = {
  panelId?: string;
  subjectType: SensorySubjectTypeWrite;
  subjectRef: string;
  subjectItemId: string | null;
  status: SensoryStatusWrite;
  statusReason: string | null;
  panelDate: string | null;
  panelistCount: number | null;
  benchmarkProductCode: string | null;
  overallScore: string | null;
  attributes: Array<{ attributeName: string; scoreOutOf10: string | null; vsBenchmark: string | null }>;
  comments: Array<{ panelistCode: string; comment: string }>;
};

type AttributeRow = { attributeName: string; score: string; vsBenchmark: string };
type CommentRow = { panelistCode: string; comment: string };

const VERDICT_REASON_STATUSES = new Set<SensoryStatusWrite>(['fail', 'hold']);

function seedAttributes(): AttributeRow[] {
  return DEFAULT_SENSORY_ATTRIBUTES.map((name) => ({ attributeName: name, score: '', vsBenchmark: '' }));
}

function toNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function errorMessage(
  code: Extract<RecordSensoryEvaluationResult, { ok: false }>['code'],
  labels: RecordSensoryLabels,
): string {
  switch (code) {
    case 'INVALID_INPUT':
      return labels.errorInvalid;
    case 'FORBIDDEN':
      return labels.errorForbidden;
    case 'NOT_FOUND':
      return labels.errorNotFound;
    default:
      return labels.errorPersist;
  }
}

export function RecordSensoryModal({
  open,
  onClose,
  onSaved,
  labels,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  labels: RecordSensoryLabels;
  initial?: RecordSensoryInitial | null;
}) {
  const isEdit = Boolean(initial?.panelId);

  const [subjectType, setSubjectType] = React.useState<SensorySubjectTypeWrite>(
    initial?.subjectType ?? 'product',
  );
  const [subjectRef, setSubjectRef] = React.useState(initial?.subjectRef ?? '');
  const [subjectItemId, setSubjectItemId] = React.useState(initial?.subjectItemId ?? '');
  const [panelDate, setPanelDate] = React.useState(initial?.panelDate ?? '');
  const [panelistCount, setPanelistCount] = React.useState(
    initial?.panelistCount != null ? String(initial.panelistCount) : '',
  );
  const [benchmark, setBenchmark] = React.useState(initial?.benchmarkProductCode ?? '');
  const [overallScore, setOverallScore] = React.useState(initial?.overallScore ?? '');
  const [status, setStatus] = React.useState<SensoryStatusWrite>(initial?.status ?? 'pending');
  const [statusReason, setStatusReason] = React.useState(initial?.statusReason ?? '');
  const [attributes, setAttributes] = React.useState<AttributeRow[]>(
    initial?.attributes && initial.attributes.length > 0
      ? initial.attributes.map((a) => ({
          attributeName: a.attributeName,
          score: a.scoreOutOf10 ?? '',
          vsBenchmark: a.vsBenchmark ?? '',
        }))
      : seedAttributes(),
  );
  const [comments, setComments] = React.useState<CommentRow[]>(
    initial?.comments && initial.comments.length > 0
      ? initial.comments.map((c) => ({ panelistCode: c.panelistCode, comment: c.comment }))
      : [],
  );

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [clientError, setClientError] = React.useState<string | null>(null);

  const showReason = VERDICT_REASON_STATUSES.has(status);

  function updateAttribute(index: number, patch: Partial<AttributeRow>) {
    setAttributes((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addAttribute() {
    setAttributes((rows) => [...rows, { attributeName: '', score: '', vsBenchmark: '' }]);
  }
  function removeAttribute(index: number) {
    setAttributes((rows) => rows.filter((_, i) => i !== index));
  }

  function updateComment(index: number, patch: Partial<CommentRow>) {
    setComments((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addComment() {
    setComments((rows) => [...rows, { panelistCode: '', comment: '' }]);
  }
  function removeComment(index: number) {
    setComments((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    setClientError(null);

    if (subjectRef.trim() === '') {
      setClientError(labels.errorInvalid);
      return;
    }

    // Only persist attribute/comment rows the user actually filled.
    const cleanAttributes = attributes
      .filter((a) => a.attributeName.trim() !== '')
      .map((a) => ({
        attributeName: a.attributeName.trim(),
        scoreOutOf10: toNumberOrNull(a.score),
        vsBenchmark: toNumberOrNull(a.vsBenchmark),
      }));
    const cleanComments = comments
      .filter((c) => c.panelistCode.trim() !== '' && c.comment.trim() !== '')
      .map((c) => ({ panelistCode: c.panelistCode.trim(), comment: c.comment.trim() }));

    const input: RecordSensoryEvaluationInput = {
      ...(initial?.panelId ? { panelId: initial.panelId } : {}),
      subjectType,
      subjectRef: subjectRef.trim(),
      subjectItemId: subjectItemId.trim() === '' ? null : subjectItemId.trim(),
      status,
      statusReason: showReason && statusReason.trim() !== '' ? statusReason.trim() : null,
      panelDate: panelDate.trim() === '' ? null : panelDate.trim(),
      panelistCount: toNumberOrNull(panelistCount) === null ? null : Math.trunc(Number(panelistCount)),
      benchmarkProductCode: benchmark.trim() === '' ? null : benchmark.trim(),
      overallScore: toNumberOrNull(overallScore),
      attributes: cleanAttributes,
      comments: cleanComments,
    };

    try {
      setSubmitting(true);
      const result = await recordSensoryEvaluation(input);
      if (!result.ok) {
        setServerError(errorMessage(result.code, labels));
        return;
      }
      onSaved();
      onClose();
    } catch {
      setServerError(labels.errorPersist);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      size="lg"
      modalId="recordSensory"
    >
      <Modal.Header title={isEdit ? labels.titleEdit : labels.titleCreate} />
      <form onSubmit={handleSubmit} noValidate data-testid="record-sensory-form">
        <Modal.Body>
          {/* Subject */}
          <div className="ff">
            <label id="sensory-subject-type-label">
              {labels.subjectType} <span className="req" aria-label={labels.required}>*</span>
            </label>
            <Select
              value={subjectType}
              onValueChange={(v) => setSubjectType(v as SensorySubjectTypeWrite)}
            >
              <SelectTrigger aria-labelledby="sensory-subject-type-label" data-testid="sensory-subject-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENSORY_SUBJECT_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {labels.subjectTypes[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ff">
            <label htmlFor="sensory-subject-ref">
              {labels.subjectRef} <span className="req" aria-label={labels.required}>*</span>
            </label>
            <Input
              id="sensory-subject-ref"
              data-testid="sensory-subject-ref"
              value={subjectRef}
              onChange={(e) => setSubjectRef(e.target.value)}
              required
            />
          </div>

          <div className="ff">
            <label htmlFor="sensory-subject-item-id">{labels.subjectItemId}</label>
            <Input
              id="sensory-subject-item-id"
              data-testid="sensory-subject-item-id"
              value={subjectItemId}
              onChange={(e) => setSubjectItemId(e.target.value)}
              placeholder="UUID"
            />
          </div>

          {/* Panel meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="ff">
              <label htmlFor="sensory-panel-date">{labels.panelDate}</label>
              <Input
                id="sensory-panel-date"
                data-testid="sensory-panel-date"
                type="date"
                value={panelDate}
                onChange={(e) => setPanelDate(e.target.value)}
              />
            </div>
            <div className="ff">
              <label htmlFor="sensory-panelist-count">{labels.panelistCount}</label>
              <Input
                id="sensory-panelist-count"
                data-testid="sensory-panelist-count"
                type="number"
                min={0}
                step={1}
                value={panelistCount}
                onChange={(e) => setPanelistCount(e.target.value)}
              />
            </div>
            <div className="ff">
              <label htmlFor="sensory-benchmark">{labels.benchmark}</label>
              <Input
                id="sensory-benchmark"
                data-testid="sensory-benchmark"
                value={benchmark}
                onChange={(e) => setBenchmark(e.target.value)}
              />
            </div>
            <div className="ff">
              <label htmlFor="sensory-overall-score">{labels.overallScore}</label>
              <Input
                id="sensory-overall-score"
                data-testid="sensory-overall-score"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={overallScore}
                onChange={(e) => setOverallScore(e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div className="ff">
            <label id="sensory-status-label">
              {labels.status} <span className="req" aria-label={labels.required}>*</span>
            </label>
            <Select value={status} onValueChange={(v) => setStatus(v as SensoryStatusWrite)}>
              <SelectTrigger aria-labelledby="sensory-status-label" data-testid="sensory-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENSORY_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {labels.statuses[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showReason ? (
            <div className="ff">
              <label htmlFor="sensory-status-reason">{labels.statusReason}</label>
              <Textarea
                id="sensory-status-reason"
                data-testid="sensory-status-reason"
                rows={2}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
              />
            </div>
          ) : null}

          {/* Attributes table */}
          <fieldset className="ff" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
            <legend style={{ fontWeight: 600, fontSize: 13 }}>{labels.attributesTitle}</legend>
            <table className="table" data-testid="sensory-attributes" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th scope="col">{labels.attributeName}</th>
                  <th scope="col">{labels.score}</th>
                  <th scope="col">{labels.vsBenchmark}</th>
                  <th scope="col" aria-label={labels.removeRow} />
                </tr>
              </thead>
              <tbody>
                {attributes.map((row, index) => (
                  <tr key={`attr-${index}`} data-testid="sensory-attr-input-row">
                    <td>
                      <Input
                        aria-label={`${labels.attributeName} ${index + 1}`}
                        data-testid={`sensory-attr-name-${index}`}
                        value={row.attributeName}
                        onChange={(e) => updateAttribute(index, { attributeName: e.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        aria-label={`${labels.score} ${index + 1}`}
                        data-testid={`sensory-attr-score-${index}`}
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={row.score}
                        onChange={(e) => updateAttribute(index, { score: e.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        aria-label={`${labels.vsBenchmark} ${index + 1}`}
                        data-testid={`sensory-attr-vs-${index}`}
                        type="number"
                        min={-10}
                        max={10}
                        step={0.1}
                        value={row.vsBenchmark}
                        onChange={(e) => updateAttribute(index, { vsBenchmark: e.target.value })}
                      />
                    </td>
                    <td>
                      <Button
                        type="button"
                        className="btn-secondary btn-sm"
                        data-testid={`sensory-attr-remove-${index}`}
                        aria-label={labels.removeRow}
                        onClick={() => removeAttribute(index)}
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="sensory-add-attribute"
              onClick={addAttribute}
            >
              + {labels.addAttribute}
            </Button>
          </fieldset>

          {/* Comments list */}
          <fieldset className="ff" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
            <legend style={{ fontWeight: 600, fontSize: 13 }}>{labels.commentsTitle}</legend>
            {comments.map((row, index) => (
              <div
                key={`comment-${index}`}
                data-testid="sensory-comment-input-row"
                style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 8, marginBottom: 8 }}
              >
                <Input
                  aria-label={`${labels.panelistCode} ${index + 1}`}
                  data-testid={`sensory-comment-code-${index}`}
                  value={row.panelistCode}
                  onChange={(e) => updateComment(index, { panelistCode: e.target.value })}
                  placeholder={labels.panelistCode}
                />
                <Input
                  aria-label={`${labels.comment} ${index + 1}`}
                  data-testid={`sensory-comment-text-${index}`}
                  value={row.comment}
                  onChange={(e) => updateComment(index, { comment: e.target.value })}
                  placeholder={labels.comment}
                />
                <Button
                  type="button"
                  className="btn-secondary btn-sm"
                  data-testid={`sensory-comment-remove-${index}`}
                  aria-label={labels.removeRow}
                  onClick={() => removeComment(index)}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="sensory-add-comment"
              onClick={addComment}
            >
              + {labels.addComment}
            </Button>
          </fieldset>

          {clientError ? (
            <div role="alert" className="alert alert-red" data-testid="sensory-client-error">
              {clientError}
            </div>
          ) : null}
          {serverError ? (
            <div role="alert" className="alert alert-red" data-testid="sensory-server-error">
              {serverError}
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
            {labels.cancel}
          </Button>
          <Button
            type="submit"
            className="btn-primary btn-sm"
            data-testid="sensory-submit"
            disabled={submitting}
          >
            {submitting ? labels.saving : labels.save}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default RecordSensoryModal;
