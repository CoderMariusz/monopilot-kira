'use client';

/**
 * Project-stage Brief screen.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:45-105 (BriefScreen)
 *     - "Project brief" card (58-91): card-head + green "✓ Completed" badge,
 *       two-column form-grid (Product name / Category·select / Target launch date /
 *       Target retail price (EUR) / Pack format / Pack weight (g) / Sales
 *       channel·select / Expected volume / Target audience), full-width Marketing
 *       claims, Constraints & requirements (textarea) + Notes (textarea).
 *     - "Attachments" card (93-102): card-head + "+ Upload" + table rows.
 *
 * The prototype BriefScreen is itself a LIVE inline editable form (every field is
 * bound to `setForm`), so this island mirrors that for users who CAN write: the
 * ready view renders editable controls bound to local state with a "Save changes"
 * primary button (dirty-gated, with saving/saved/error states) that calls the
 * existing `updateProjectBrief` Server Action (passed as `onUpdate`). Read-only
 * users (no write grant) keep the static read view. There is no longer a separate
 * "Edit brief" modal — editing happens inline (matches the prototype).
 *
 * Decimal values arrive as STRINGS from the server loader and are rendered /
 * persisted verbatim (never coerced to floats; empty → null per the action's
 * optionalText/-Decimal contract).
 *
 * RBAC (`permission_denied`) is resolved server-side in page.tsx; this island is
 * never trusted for the gate. No raw function props cross the RSC boundary
 * (Next16 guard) — only serialisable data + labels + the injected Server Action.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

import type { ProjectBriefState, ProjectBriefView } from '../_actions/read-project-brief';

/** Mirrors the reviewed updateProjectBrief zod patch field names exactly. */
export type BriefPatch = {
  productName: string | null;
  category: string | null;
  targetLaunchDate: string | null;
  packFormat: string | null;
  packWeightG: string | null;
  /**
   * Packs per case — non-negative integer. OPTIONAL on the patch: omitted entirely
   * when the input is empty so an existing value is never clobbered to null (the
   * other optional brief fields send null on empty; this one stays untouched).
   */
  packsPerCase?: number | null;
  outputUnit?: 'kg' | 'pieces' | 'boxes' | null;
  weeklyVolumePacks: string | null;
  runsPerWeek: string | null;
  marketingClaims: string | null;
  targetRetailPriceEur: string | null;
  salesChannel: string | null;
  targetAudience: string | null;
  constraints: string | null;
  notes: string | null;
};

export type UpdateBriefCall = { projectId: string; patch: BriefPatch };
export type UpdateBriefOutcome =
  | { ok: true }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED' };

// ── Attachments (npd-attachments bucket, mig 279) ─────────────────────────────
export type BriefAttachmentItem = {
  /** Storage object name inside the project prefix (delete handle). */
  objectName: string;
  /** Display name (uuid prefix stripped server-side). */
  fileName: string;
  sizeBytes: number;
  /** ISO timestamp. */
  uploadedAt: string;
  /** Short-lived signed download URL. */
  signedUrl: string;
};

export type AttachmentErrorCode =
  | 'INVALID_INPUT'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MIME_TYPE'
  | 'FORBIDDEN'
  | 'PROJECT_NOT_FOUND'
  | 'STORAGE_FAILED'
  | 'PERSISTENCE_FAILED';

export type UploadAttachmentOutcome = { ok: true } | { ok: false; error: AttachmentErrorCode };
export type DeleteAttachmentOutcome = { ok: true } | { ok: false; error: AttachmentErrorCode };

export type ProjectBriefLabels = {
  cardTitle: string;
  completed: string;
  fieldProductName: string;
  fieldCategory: string;
  fieldTargetLaunch: string;
  fieldTargetPrice: string;
  fieldPackFormat: string;
  fieldPackWeight: string;
  fieldPacksPerCase: string;
  fieldOutputUnit: string;
  fieldOutputUnitKg: string;
  fieldOutputUnitPieces: string;
  fieldOutputUnitBoxes: string;
  fieldWeeklyVolumePacks: string;
  fieldRunsPerWeek: string;
  fieldRunsPerWeekHelp: string;
  fieldSalesChannel: string;
  fieldTargetAudience: string;
  fieldMarketingClaims: string;
  fieldConstraints: string;
  fieldNotes: string;
  attachmentsTitle: string;
  upload: string;
  uploadDisabledHint: string;
  attachmentsEmpty: string;
  notProvided: string;
  loading: string;
  empty: string;
  emptyBody: string;
  error: string;
  forbidden: string;
  // Inline-edit affordance (additive).
  editBrief: string;
  editModalTitle: string;
  save: string;
  saving: string;
  cancel: string;
  // Inline-form affordance (additive).
  saveChanges: string;
  saved: string;
  errInvalidInput: string;
  errOutputUnitBoxesPackFactors: string;
  errForbidden: string;
  errNotFound: string;
  errPersistence: string;
  // Attachments backend (additive — wired to the npd-attachments bucket).
  uploading: string;
  attachColName: string;
  attachColSize: string;
  attachColUploaded: string;
  attachDownload: string;
  attachDelete: string;
  attachDeleteConfirm: string;
  attachTooLarge: string;
  attachUnsupportedType: string;
  attachUploadFailed: string;
  attachDeleteFailed: string;
};

export type ProjectBriefScreenProps = {
  state: ProjectBriefState;
  data: ProjectBriefView | null;
  labels: ProjectBriefLabels;
  /** Server-resolved write capability (page.tsx) — never trusted from client. */
  canWrite?: boolean;
  /** Mutation Server Action passed across the RSC boundary (Next16 guard). */
  onUpdate?: (call: UpdateBriefCall) => Promise<UpdateBriefOutcome>;
  /** Server-loaded attachments (npd-attachments bucket; signed URLs, 15 min). */
  attachments?: BriefAttachmentItem[];
  /** Attachment Server Actions (RSC boundary). Upload stays disabled without them. */
  onUploadAttachment?: (form: FormData) => Promise<UploadAttachmentOutcome>;
  onDeleteAttachment?: (call: {
    projectId: string;
    objectName: string;
  }) => Promise<DeleteAttachmentOutcome>;
  /** Active org product categories (label values for npd_projects.type). */
  categoryOptions?: CategoryOption[];
};

type FormState = {
  productName: string;
  category: string;
  targetLaunchDate: string;
  targetRetailPriceEur: string;
  packFormat: string;
  packWeightG: string;
  packsPerCase: string;
  outputUnit: string;
  weeklyVolumePacks: string;
  runsPerWeek: string;
  salesChannel: string;
  targetAudience: string;
  marketingClaims: string;
  constraints: string;
  notes: string;
};

function viewToForm(data: ProjectBriefView): FormState {
  return {
    productName: data.productName ?? '',
    category: data.category ?? '',
    targetLaunchDate: data.targetLaunchDate ?? '',
    targetRetailPriceEur: data.targetRetailPriceEur ?? '',
    packFormat: data.packFormat ?? '',
    packWeightG: data.packWeightG ?? '',
    // number|null → string for the input ('' when unset).
    packsPerCase: data.packsPerCase != null ? String(data.packsPerCase) : '',
    outputUnit: data.outputUnit ?? '',
    weeklyVolumePacks: data.weeklyVolumePacks ?? '',
    runsPerWeek: data.runsPerWeek ?? '',
    salesChannel: data.salesChannel ?? '',
    targetAudience: data.targetAudience ?? '',
    marketingClaims: data.marketingClaims ?? '',
    constraints: data.constraints ?? '',
    notes: data.notes ?? '',
  };
}

/** Trim → null for empty (the action's optionalText/-Decimal contract). */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Spread helper for "Packs per case". Unlike the other optional fields it is
 * OMITTED (not sent as null) when empty so an existing value is never clobbered
 * to null on a brief save. A valid non-negative integer is sent as a number
 * (the zod patch expects `z.number().int().min(0).nullable().optional()`).
 * A non-empty but invalid value is also omitted (server never receives garbage).
 */
function packsPerCasePatch(value: string): { packsPerCase?: number } {
  const trimmed = value.trim();
  if (trimmed === '') return {};
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 ? { packsPerCase: parsed } : {};
}

function outputUnitPatch(value: string): { outputUnit?: 'kg' | 'pieces' | 'boxes' } {
  const trimmed = value.trim();
  if (trimmed === '') return {};
  if (trimmed === 'kg' || trimmed === 'pieces' || trimmed === 'boxes') return { outputUnit: trimmed };
  return {};
}

function formToPatch(form: FormState): BriefPatch {
  return {
    productName: orNull(form.productName),
    category: orNull(form.category),
    targetLaunchDate: orNull(form.targetLaunchDate),
    packFormat: orNull(form.packFormat),
    packWeightG: orNull(form.packWeightG),
    // Omitted when empty (never null) → an existing value is preserved on save.
    ...packsPerCasePatch(form.packsPerCase),
    ...outputUnitPatch(form.outputUnit),
    weeklyVolumePacks: orNull(form.weeklyVolumePacks),
    runsPerWeek: orNull(form.runsPerWeek),
    marketingClaims: orNull(form.marketingClaims),
    targetRetailPriceEur: orNull(form.targetRetailPriceEur),
    salesChannel: orNull(form.salesChannel),
    targetAudience: orNull(form.targetAudience),
    constraints: orNull(form.constraints),
    notes: orNull(form.notes),
  };
}

export type CategoryOption = { value: string; label: string };

const CHANNEL_OPTIONS = ['Retail', 'HoReCa', 'Industrial', 'Export'];

const OUTPUT_UNIT_VALUES = ['kg', 'pieces', 'boxes'] as const;

function outputUnitLabel(value: string, labels: ProjectBriefLabels): string {
  switch (value) {
    case 'kg':
      return labels.fieldOutputUnitKg;
    case 'pieces':
      return labels.fieldOutputUnitPieces;
    case 'boxes':
      return labels.fieldOutputUnitBoxes;
    default:
      return value;
  }
}

function withCurrent(canonical: CategoryOption[], current: string): CategoryOption[] {
  const values = canonical.map((o) => o.value);
  if (current && !values.includes(current)) {
    return [{ value: current, label: current }, ...canonical];
  }
  return canonical;
}

function withCurrentStrings(canonical: string[], current: string): Array<{ value: string; label: string }> {
  const values = current && !canonical.includes(current) ? [current, ...canonical] : canonical;
  return values.map((v) => ({ value: v, label: v }));
}

function errorMessage(
  error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED',
  labels: ProjectBriefLabels,
): string {
  switch (error) {
    case 'INVALID_INPUT':
      return labels.errInvalidInput;
    case 'FORBIDDEN':
      return labels.errForbidden;
    case 'NOT_FOUND':
      return labels.errNotFound;
    default:
      return labels.errPersistence;
  }
}

function ReadField({ label, value, placeholder }: { label: string; value: string | null; placeholder: string }) {
  const hasValue = value !== null && value !== undefined && value.trim() !== '';
  return (
    <div className="field" data-testid={`project-brief-field-${slug(label)}`}>
      <label className="field__label" style={{ textTransform: 'uppercase' }}>
        {label}
      </label>
      <p className="field__value" data-empty={!hasValue}>
        {hasValue ? value : placeholder}
      </p>
    </div>
  );
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function StatePanel({ testId, title, body }: { testId: string; title: string; body?: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent>
        <p className="state-panel__title">{title}</p>
        {body ? <p className="state-panel__body muted">{body}</p> : null}
      </CardContent>
    </Card>
  );
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Read-only static brief card (no write grant). Matches the legacy read view. */
function ReadBriefCard({ data, labels }: { data: ProjectBriefView; labels: ProjectBriefLabels }) {
  const ph = labels.notProvided;
  return (
    <Card>
      <CardHeader className="card-head">
        <CardTitle data-testid="project-brief-card-title">{labels.cardTitle}</CardTitle>
        <Badge variant="success" data-testid="project-brief-completed-badge">
          {`✓ ${labels.completed}`}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="form-grid">
          <ReadField label={labels.fieldProductName} value={data.productName} placeholder={ph} />
          <ReadField label={labels.fieldCategory} value={data.category} placeholder={ph} />
          <ReadField label={labels.fieldTargetLaunch} value={data.targetLaunchDate} placeholder={ph} />
          <ReadField label={labels.fieldTargetPrice} value={data.targetRetailPriceEur} placeholder={ph} />
          <ReadField label={labels.fieldPackFormat} value={data.packFormat} placeholder={ph} />
          <ReadField label={labels.fieldPackWeight} value={data.packWeightG} placeholder={ph} />
          <ReadField
            label={labels.fieldPacksPerCase}
            value={data.packsPerCase != null ? String(data.packsPerCase) : null}
            placeholder={ph}
          />
          <ReadField
            label={labels.fieldOutputUnit}
            value={data.outputUnit ? outputUnitLabel(data.outputUnit, labels) : null}
            placeholder={ph}
          />
          <ReadField label={labels.fieldWeeklyVolumePacks} value={data.weeklyVolumePacks} placeholder={ph} />
          <ReadField label={labels.fieldRunsPerWeek} value={data.runsPerWeek} placeholder={ph} />
          <ReadField label={labels.fieldSalesChannel} value={data.salesChannel} placeholder={ph} />
          <ReadField label={labels.fieldTargetAudience} value={data.targetAudience} placeholder={ph} />
        </div>
        <ReadField label={labels.fieldMarketingClaims} value={data.marketingClaims} placeholder={ph} />
        <ReadField label={labels.fieldConstraints} value={data.constraints} placeholder={ph} />
        <ReadField label={labels.fieldNotes} value={data.notes} placeholder={ph} />
      </CardContent>
    </Card>
  );
}

/**
 * Editable inline brief card (write grant). The whole ready view is the form —
 * "Save changes" persists the current values via the injected `updateProjectBrief`
 * Server Action and refreshes the RSC loader on success.
 */
function EditBriefCard({
  data,
  labels,
  onUpdate,
  categoryOptions = [],
}: {
  data: ProjectBriefView;
  labels: ProjectBriefLabels;
  onUpdate: (call: UpdateBriefCall) => Promise<UpdateBriefOutcome>;
  categoryOptions?: CategoryOption[];
}) {
  const router = useRouter();
  // Re-seed local form state whenever the persisted brief changes (after a
  // successful save the action revalidatePath'd and router.refresh re-runs the
  // RSC loader, so `data` arrives fresh). `pristine` is the baseline we diff
  // against to gate the "Save changes" button (dirty).
  const pristine = React.useMemo(() => viewToForm(data), [data]);
  const [form, setForm] = React.useState<FormState>(pristine);
  const [status, setStatus] = React.useState<SaveStatus>('idle');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setForm(pristine);
    setStatus('idle');
    setError(null);
  }, [pristine]);

  const dirty = React.useMemo(
    () => (Object.keys(form) as Array<keyof FormState>).some((k) => form[k] !== pristine[k]),
    [form, pristine],
  );

  const set = React.useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // A fresh edit clears the "Saved" / error indicator.
    setStatus((s) => (s === 'idle' || s === 'saving' ? s : 'idle'));
    setError(null);
  }, []);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (status === 'saving' || !dirty) return;
      if (
        form.outputUnit === 'boxes' &&
        (form.packWeightG.trim() === '' ||
          form.packsPerCase.trim() === '' ||
          Number(form.packsPerCase) <= 0)
      ) {
        setStatus('error');
        setError(labels.errOutputUnitBoxesPackFactors);
        return;
      }
      setStatus('saving');
      setError(null);
      try {
        const result = await onUpdate({ projectId: data.briefId, patch: formToPatch(form) });
        if (result.ok) {
          setStatus('saved');
          // RSC loader re-runs; the useEffect above re-seeds the form from fresh data.
          router.refresh();
        } else {
          setStatus('error');
          setError(errorMessage(result.error, labels));
        }
      } catch {
        setStatus('error');
        setError(labels.errPersistence);
      }
    },
    [status, dirty, onUpdate, data.briefId, form, router, labels],
  );

  const saveLabel =
    status === 'saving' ? labels.saving : status === 'saved' && !dirty ? labels.saved : labels.saveChanges;

  return (
    <Card>
      <form onSubmit={handleSubmit} data-testid="brief-inline-form">
        <CardHeader className="card-head">
          <CardTitle data-testid="project-brief-card-title">{labels.cardTitle}</CardTitle>
          <div className="card-head__actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Badge variant="success" data-testid="project-brief-completed-badge">
              {`✓ ${labels.completed}`}
            </Badge>
            <Button
              type="submit"
              className="btn-primary btn-sm"
              disabled={status === 'saving' || !dirty}
              data-status={status}
              data-testid="brief-save"
            >
              {saveLabel}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="form-grid">
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldProductName}</span>
              <Input
                value={form.productName}
                onChange={(e) => set('productName', e.target.value)}
                data-testid="brief-field-productName"
              />
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldCategory}</span>
              <Select
                aria-label={labels.fieldCategory}
                value={form.category}
                onValueChange={(v) => set('category', v)}
                options={withCurrent(categoryOptions, form.category)}
              >
                <SelectTrigger aria-label={labels.fieldCategory} data-testid="brief-field-category">
                  <SelectValue placeholder={labels.fieldCategory} />
                </SelectTrigger>
                <SelectContent>
                  {withCurrent(categoryOptions, form.category).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldTargetLaunch}</span>
              <Input
                type="date"
                value={form.targetLaunchDate}
                onChange={(e) => set('targetLaunchDate', e.target.value)}
                data-testid="brief-field-targetLaunchDate"
              />
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldTargetPrice}</span>
              <Input
                inputMode="decimal"
                value={form.targetRetailPriceEur}
                onChange={(e) => set('targetRetailPriceEur', e.target.value)}
                data-testid="brief-field-targetRetailPriceEur"
              />
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldPackFormat}</span>
              <Input
                value={form.packFormat}
                onChange={(e) => set('packFormat', e.target.value)}
                data-testid="brief-field-packFormat"
              />
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldPackWeight}</span>
              <Input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={form.packWeightG}
                onChange={(e) => set('packWeightG', e.target.value)}
                data-testid="brief-field-packWeightG"
              />
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldPacksPerCase}</span>
              <Input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={form.packsPerCase}
                onChange={(e) => set('packsPerCase', e.target.value)}
                data-testid="brief-field-packsPerCase"
              />
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldOutputUnit}</span>
              <Select
                aria-label={labels.fieldOutputUnit}
                value={form.outputUnit}
                onValueChange={(v) => set('outputUnit', v)}
                options={OUTPUT_UNIT_VALUES.map((value) => ({
                  value,
                  label: outputUnitLabel(value, labels),
                }))}
              >
                <SelectTrigger aria-label={labels.fieldOutputUnit} data-testid="brief-field-outputUnit">
                  <SelectValue placeholder={labels.fieldOutputUnit} />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_UNIT_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {outputUnitLabel(value, labels)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>
                {labels.fieldWeeklyVolumePacks}
                <span className="req" aria-label="required"> *</span>
              </span>
              <Input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                required
                value={form.weeklyVolumePacks}
                onChange={(e) => set('weeklyVolumePacks', e.target.value)}
                data-testid="brief-field-weeklyVolumePacks"
              />
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>
                {labels.fieldRunsPerWeek}
                <span className="req" aria-label="required"> *</span>
              </span>
              <Input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                required
                value={form.runsPerWeek}
                onChange={(e) => set('runsPerWeek', e.target.value)}
                data-testid="brief-field-runsPerWeek"
              />
              <p className="muted text-xs" data-testid="brief-field-runsPerWeek-help">
                {labels.fieldRunsPerWeekHelp}
              </p>
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldSalesChannel}</span>
              <Select
                aria-label={labels.fieldSalesChannel}
                value={form.salesChannel}
                onValueChange={(v) => set('salesChannel', v)}
                options={withCurrentStrings(CHANNEL_OPTIONS, form.salesChannel)}
              >
                <SelectTrigger aria-label={labels.fieldSalesChannel} data-testid="brief-field-salesChannel">
                  <SelectValue placeholder={labels.fieldSalesChannel} />
                </SelectTrigger>
                <SelectContent>
                  {withCurrentStrings(CHANNEL_OPTIONS, form.salesChannel).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldTargetAudience}</span>
              <Input
                value={form.targetAudience}
                onChange={(e) => set('targetAudience', e.target.value)}
                data-testid="brief-field-targetAudience"
              />
            </label>
          </div>

          <label className="field">
            <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldMarketingClaims}</span>
            <Input
              value={form.marketingClaims}
              onChange={(e) => set('marketingClaims', e.target.value)}
              data-testid="brief-field-marketingClaims"
            />
          </label>
          <label className="field">
            <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldConstraints}</span>
            <textarea
              rows={2}
              value={form.constraints}
              onChange={(e) => set('constraints', e.target.value)}
              data-testid="brief-field-constraints"
            />
          </label>
          <label className="field">
            <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldNotes}</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              data-testid="brief-field-notes"
            />
          </label>

          {error ? (
            <div role="alert" className="alert alert-red" data-testid="brief-form-error">
              {error}
            </div>
          ) : null}

          <span aria-live="polite" className="sr-only" data-testid="brief-save-status">
            {status === 'saving' ? labels.saving : status === 'saved' && !dirty ? labels.saved : ''}
          </span>
        </CardContent>
      </form>
    </Card>
  );
}

// ── Attachments card (brief "+ Upload" — npd-attachments bucket backend) ──────

const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx';
const ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedAt(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function attachmentErrorMessage(code: AttachmentErrorCode, labels: ProjectBriefLabels): string {
  switch (code) {
    case 'FILE_TOO_LARGE':
      return labels.attachTooLarge;
    case 'UNSUPPORTED_MIME_TYPE':
      return labels.attachUnsupportedType;
    case 'FORBIDDEN':
      return labels.errForbidden;
    default:
      return labels.attachUploadFailed;
  }
}

function AttachmentsCard({
  projectId,
  attachments,
  labels,
  canWrite,
  onUploadAttachment,
  onDeleteAttachment,
}: {
  projectId: string;
  attachments: BriefAttachmentItem[];
  labels: ProjectBriefLabels;
  canWrite: boolean;
  onUploadAttachment?: (form: FormData) => Promise<UploadAttachmentOutcome>;
  onDeleteAttachment?: (call: { projectId: string; objectName: string }) => Promise<DeleteAttachmentOutcome>;
}) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState<'idle' | 'uploading' | 'deleting'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const uploadEnabled = canWrite && !!onUploadAttachment;

  const handlePick = React.useCallback(() => {
    setError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFile = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Allow re-selecting the same file later.
      event.target.value = '';
      if (!file || !onUploadAttachment) return;
      // Honest client-side pre-checks (server revalidates — never trusted alone).
      if (file.size > ATTACHMENT_MAX_BYTES) {
        setError(labels.attachTooLarge);
        return;
      }
      if (!ATTACHMENT_MIME_TYPES.has(file.type)) {
        setError(labels.attachUnsupportedType);
        return;
      }
      setBusy('uploading');
      setError(null);
      try {
        const form = new FormData();
        form.set('projectId', projectId);
        form.set('file', file);
        const result = await onUploadAttachment(form);
        if (result.ok) {
          router.refresh();
        } else {
          setError(attachmentErrorMessage(result.error, labels));
        }
      } catch {
        setError(labels.attachUploadFailed);
      } finally {
        setBusy('idle');
      }
    },
    [onUploadAttachment, projectId, router, labels],
  );

  const handleDelete = React.useCallback(
    async (objectName: string) => {
      if (!onDeleteAttachment) return;
      if (typeof window !== 'undefined' && !window.confirm(labels.attachDeleteConfirm)) return;
      setBusy('deleting');
      setError(null);
      try {
        const result = await onDeleteAttachment({ projectId, objectName });
        if (result.ok) {
          router.refresh();
        } else {
          setError(labels.attachDeleteFailed);
        }
      } catch {
        setError(labels.attachDeleteFailed);
      } finally {
        setBusy('idle');
      }
    },
    [onDeleteAttachment, projectId, router, labels],
  );

  return (
    <Card data-testid="project-brief-attachments">
      <CardHeader className="card-head">
        <CardTitle>{labels.attachmentsTitle}</CardTitle>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!uploadEnabled || busy === 'uploading'}
          title={uploadEnabled ? undefined : labels.uploadDisabledHint}
          onClick={handlePick}
          data-testid="project-brief-upload"
        >
          {busy === 'uploading' ? labels.uploading : `+ ${labels.upload}`}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleFile}
          data-testid="project-brief-upload-input"
          aria-hidden="true"
          tabIndex={-1}
        />
      </CardHeader>
      <CardContent>
        {error ? (
          <div role="alert" className="alert alert-red" data-testid="project-brief-attachments-error">
            {error}
          </div>
        ) : null}
        {attachments.length === 0 ? (
          <p className="muted" data-testid="project-brief-attachments-empty">
            {labels.attachmentsEmpty}
          </p>
        ) : (
          <table className="table" data-testid="project-brief-attachments-table">
            <thead>
              <tr>
                <th>{labels.attachColName}</th>
                <th>{labels.attachColSize}</th>
                <th>{labels.attachColUploaded}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {attachments.map((attachment) => (
                <tr key={attachment.objectName} data-testid="project-brief-attachment-row">
                  <td style={{ fontWeight: 500 }}>
                    <a
                      href={attachment.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="project-brief-attachment-download"
                      title={labels.attachDownload}
                    >
                      {attachment.fileName}
                    </a>
                  </td>
                  <td className="mono num">{formatFileSize(attachment.sizeBytes)}</td>
                  <td className="muted">{formatUploadedAt(attachment.uploadedAt)}</td>
                  <td>
                    {canWrite && onDeleteAttachment ? (
                      <Button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={busy !== 'idle'}
                        onClick={() => handleDelete(attachment.objectName)}
                        data-testid="project-brief-attachment-delete"
                      >
                        {labels.attachDelete}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function ProjectBriefScreen({
  state,
  data,
  labels,
  canWrite = false,
  onUpdate,
  attachments = [],
  onUploadAttachment,
  onDeleteAttachment,
  categoryOptions = [],
}: ProjectBriefScreenProps) {
  if (state === 'loading') {
    return (
      <Card data-testid="project-brief-loading" aria-busy="true">
        <CardContent>
          <div className="skeleton" style={{ height: 18, width: '40%' }} />
          <div className="skeleton" style={{ height: 120, marginTop: 12 }} />
        </CardContent>
      </Card>
    );
  }

  if (state === 'permission_denied') {
    return <StatePanel testId="project-brief-forbidden" title={labels.forbidden} />;
  }

  if (state === 'error') {
    return <StatePanel testId="project-brief-error" title={labels.error} />;
  }

  if (state === 'empty' || !data) {
    return <StatePanel testId="project-brief-empty" title={labels.empty} body={labels.emptyBody} />;
  }

  const editable = canWrite && !!onUpdate;

  return (
    <div data-testid="project-brief-screen">
      {editable ? (
        <EditBriefCard data={data} labels={labels} onUpdate={onUpdate!} categoryOptions={categoryOptions} />
      ) : (
        <ReadBriefCard data={data} labels={labels} />
      )}

      <AttachmentsCard
        projectId={data.briefId}
        attachments={attachments}
        labels={labels}
        canWrite={canWrite}
        onUploadAttachment={onUploadAttachment}
        onDeleteAttachment={onDeleteAttachment}
      />
    </div>
  );
}
