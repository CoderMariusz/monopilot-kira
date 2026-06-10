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
  expectedVolume: string | null;
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

export type ProjectBriefLabels = {
  cardTitle: string;
  completed: string;
  fieldProductName: string;
  fieldCategory: string;
  fieldTargetLaunch: string;
  fieldTargetPrice: string;
  fieldPackFormat: string;
  fieldPackWeight: string;
  fieldSalesChannel: string;
  fieldExpectedVolume: string;
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
  errForbidden: string;
  errNotFound: string;
  errPersistence: string;
};

export type ProjectBriefScreenProps = {
  state: ProjectBriefState;
  data: ProjectBriefView | null;
  labels: ProjectBriefLabels;
  /** Server-resolved write capability (page.tsx) — never trusted from client. */
  canWrite?: boolean;
  /** Mutation Server Action passed across the RSC boundary (Next16 guard). */
  onUpdate?: (call: UpdateBriefCall) => Promise<UpdateBriefOutcome>;
};

type FormState = {
  productName: string;
  category: string;
  targetLaunchDate: string;
  targetRetailPriceEur: string;
  packFormat: string;
  packWeightG: string;
  salesChannel: string;
  expectedVolume: string;
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
    salesChannel: data.salesChannel ?? '',
    expectedVolume: data.expectedVolume ?? '',
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

function formToPatch(form: FormState): BriefPatch {
  return {
    productName: orNull(form.productName),
    category: orNull(form.category),
    targetLaunchDate: orNull(form.targetLaunchDate),
    packFormat: orNull(form.packFormat),
    packWeightG: orNull(form.packWeightG),
    expectedVolume: orNull(form.expectedVolume),
    marketingClaims: orNull(form.marketingClaims),
    targetRetailPriceEur: orNull(form.targetRetailPriceEur),
    salesChannel: orNull(form.salesChannel),
    targetAudience: orNull(form.targetAudience),
    constraints: orNull(form.constraints),
    notes: orNull(form.notes),
  };
}

// Prototype option lists (project.jsx:67-78). The CURRENT stored value is folded
// in when it falls outside the canonical list so the Select stays accurate.
const CATEGORY_OPTIONS = ['Meat · Cold cut', 'Meat · Smoked', 'Meat · Cured', 'Meat · Pâté', 'Fish · Smoked'];
const CHANNEL_OPTIONS = ['Retail', 'HoReCa', 'Industrial', 'Export'];

function withCurrent(canonical: string[], current: string): Array<{ value: string; label: string }> {
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
          <ReadField label={labels.fieldSalesChannel} value={data.salesChannel} placeholder={ph} />
          <ReadField label={labels.fieldExpectedVolume} value={data.expectedVolume} placeholder={ph} />
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
}: {
  data: ProjectBriefView;
  labels: ProjectBriefLabels;
  onUpdate: (call: UpdateBriefCall) => Promise<UpdateBriefOutcome>;
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
                options={withCurrent(CATEGORY_OPTIONS, form.category)}
              >
                <SelectTrigger aria-label={labels.fieldCategory} data-testid="brief-field-category">
                  <SelectValue placeholder={labels.fieldCategory} />
                </SelectTrigger>
                <SelectContent>
                  {withCurrent(CATEGORY_OPTIONS, form.category).map((o) => (
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
                inputMode="decimal"
                value={form.packWeightG}
                onChange={(e) => set('packWeightG', e.target.value)}
                data-testid="brief-field-packWeightG"
              />
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldSalesChannel}</span>
              <Select
                aria-label={labels.fieldSalesChannel}
                value={form.salesChannel}
                onValueChange={(v) => set('salesChannel', v)}
                options={withCurrent(CHANNEL_OPTIONS, form.salesChannel)}
              >
                <SelectTrigger aria-label={labels.fieldSalesChannel} data-testid="brief-field-salesChannel">
                  <SelectValue placeholder={labels.fieldSalesChannel} />
                </SelectTrigger>
                <SelectContent>
                  {withCurrent(CHANNEL_OPTIONS, form.salesChannel).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="field">
              <span className="field__label" style={{ textTransform: 'uppercase' }}>{labels.fieldExpectedVolume}</span>
              <Input
                value={form.expectedVolume}
                onChange={(e) => set('expectedVolume', e.target.value)}
                data-testid="brief-field-expectedVolume"
              />
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

export function ProjectBriefScreen({
  state,
  data,
  labels,
  canWrite = false,
  onUpdate,
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
        <EditBriefCard data={data} labels={labels} onUpdate={onUpdate!} />
      ) : (
        <ReadBriefCard data={data} labels={labels} />
      )}

      <Card data-testid="project-brief-attachments">
        <CardHeader className="card-head">
          <CardTitle>{labels.attachmentsTitle}</CardTitle>
          {/* Upload backend is not wired yet — rendered per prototype, not faked. */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled
            title={labels.uploadDisabledHint}
            data-testid="project-brief-upload"
          >
            {`+ ${labels.upload}`}
          </button>
        </CardHeader>
        <CardContent>
          <p className="muted" data-testid="project-brief-attachments-empty">
            {labels.attachmentsEmpty}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
