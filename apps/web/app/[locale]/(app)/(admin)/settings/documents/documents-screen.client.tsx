'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { PageHead, Section, SelectField, SettingField, SRow } from '../_components';

/**
 * Settings -> Documents screen.
 *
 * Parity basis: there is NO dedicated prototype JSX for document numbering. This
 * screen mirrors the visual language of the sibling settings screens that ARE
 * built from the shared `.sg-*` primitives — specifically `settings/company`
 * (org-screens.jsx PageHead + Section + SRow card chrome) and `settings/processes`
 * (UoM-style closed-enum dropdowns for the date-part / padding enumerations).
 * Same density, spacing, component family, and `region`/`alert`/`note` semantic
 * states as those screens. Deviation log: card-per-doc-type with an inline LIVE
 * PREVIEW line + per-card Save — no prototype to diff against, so this is a
 * spec-driven layout reusing the established settings primitives 1:1.
 *
 * Data is real (Supabase rows from `_actions/documents.ts`); no mocks.
 */

const PARITY_SOURCE =
  'spec-driven (no dedicated prototype): mirrors settings/company + settings/processes .sg-* primitives';

export type DocType = 'po' | 'to' | 'wo';
export type DatePart = 'none' | 'YYYY' | 'YYYYMM' | 'YYYYMMDD';

export type DocumentSetting = {
  docType: DocType;
  numberPrefix: string;
  numberDatePart: DatePart;
  numberSeqPadding: number;
  /** Next sequence number as a string ("7"); used for an honest preview. */
  nextSeq: string;
  archiveAfterDays: number | null;
  updatedAt: string;
};

export type UpdateDocumentInput = {
  docType: DocType;
  numberPrefix: string;
  numberDatePart: DatePart;
  numberSeqPadding: number;
  archiveAfterDays: number | null;
};

export type UpdateDocumentResult =
  | { ok: true; setting: DocumentSetting }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed'; message?: string };

export type DocumentsScreenLabels = {
  title: string;
  subtitle: string;
  loading: string;
  empty: string;
  loadError: string;
  deniedTitle: string;
  deniedBody: string;
  readOnlyLabel: string;
  readOnlyNotice: string;
  docTypeNames: Record<DocType, string>;
  fieldPrefix: string;
  fieldPrefixHint: string;
  fieldDatePart: string;
  fieldPadding: string;
  fieldArchive: string;
  fieldArchiveHint: string;
  datePartOptions: Record<DatePart, string>;
  previewLabel: string;
  previewExample: string;
  archiveNever: string;
  save: string;
  saving: string;
  saved: string;
  saveError: string;
  invalidInput: string;
};

export type DocumentsScreenProps = {
  settings?: DocumentSetting[];
  canEdit?: boolean;
  /** read-forbidden is surfaced as a dedicated denied panel. */
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'denied';
  labels: DocumentsScreenLabels;
  /** Frozen "now" for deterministic preview rendering; defaults to new Date(). */
  now?: Date;
  updateDocumentAction?: (input: UpdateDocumentInput) => Promise<UpdateDocumentResult>;
};

const DOC_TYPE_ORDER: DocType[] = ['po', 'to', 'wo'];
const DATE_PART_ORDER: DatePart[] = ['none', 'YYYY', 'YYYYMM', 'YYYYMMDD'];
const PADDING_OPTIONS = [3, 4, 5, 6, 7, 8] as const;

function datePartString(part: DatePart, now: Date): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  switch (part) {
    case 'YYYY':
      return yyyy;
    case 'YYYYMM':
      return `${yyyy}${mm}`;
    case 'YYYYMMDD':
      return `${yyyy}${mm}${dd}`;
    default:
      return '';
  }
}

/**
 * Compose the next document number client-side from the live field values, the
 * current date, and the next sequence. Pure + exported so the RTL test can pin
 * the composition contract directly.
 */
export function composeDocumentNumber(
  fields: { numberPrefix: string; numberDatePart: DatePart; numberSeqPadding: number },
  seq: number,
  now: Date,
): string {
  const padding = Math.min(8, Math.max(3, Math.trunc(fields.numberSeqPadding) || 3));
  const seqPart = String(Math.max(1, Math.trunc(seq) || 1)).padStart(padding, '0');
  const datePart = datePartString(fields.numberDatePart, now);
  const segments = [fields.numberPrefix.trim(), datePart, seqPart].filter((segment) => segment.length > 0);
  return segments.join('-');
}

type CardDraft = {
  numberPrefix: string;
  numberDatePart: DatePart;
  numberSeqPadding: number;
  archiveAfterDays: string;
};

function toDraft(setting: DocumentSetting): CardDraft {
  return {
    numberPrefix: setting.numberPrefix,
    numberDatePart: setting.numberDatePart,
    numberSeqPadding: setting.numberSeqPadding,
    archiveAfterDays: setting.archiveAfterDays === null ? '' : String(setting.archiveAfterDays),
  };
}

function StateShell({
  labels,
  children,
}: {
  labels: DocumentsScreenLabels;
  children: React.ReactNode;
}) {
  return (
    <main
      aria-label={labels.title}
      className="mx-auto grid max-w-5xl gap-3 p-6"
      data-screen="settings-documents"
      data-prototype-source={PARITY_SOURCE}
    >
      <PageHead title={labels.title} sub={labels.subtitle} />
      {children}
    </main>
  );
}

function DocumentCard({
  setting,
  canEdit,
  labels,
  now,
  updateDocumentAction,
  onSaved,
}: {
  setting: DocumentSetting;
  canEdit: boolean;
  labels: DocumentsScreenLabels;
  now: Date;
  updateDocumentAction?: DocumentsScreenProps['updateDocumentAction'];
  onSaved: () => void;
}) {
  const [saved, setSaved] = React.useState<DocumentSetting>(setting);
  const [draft, setDraft] = React.useState<CardDraft>(() => toDraft(setting));
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSaved(setting);
    setDraft(toDraft(setting));
    setMessage(null);
    setError(null);
    setArchiveError(null);
  }, [setting]);

  const docType = setting.docType;
  const controlsDisabled = !canEdit || pending;
  const idPrefix = `doc-${docType}`;

  // Honest preview: prefer the real next_seq from the loader; else fall back to
  // an explicitly-labelled example sequence (1).
  const hasRealSeq = setting.nextSeq != null && setting.nextSeq !== '' && Number(setting.nextSeq) > 0;
  const previewSeq = hasRealSeq ? Number(setting.nextSeq) : 1;
  const previewNumber = composeDocumentNumber(
    {
      numberPrefix: draft.numberPrefix,
      numberDatePart: draft.numberDatePart,
      numberSeqPadding: draft.numberSeqPadding,
    },
    previewSeq,
    now,
  );

  function parseArchive(): { ok: true; value: number | null } | { ok: false } {
    const raw = draft.archiveAfterDays.trim();
    if (raw === '') return { ok: true, value: null };
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) return { ok: false };
    return { ok: true, value: parsed };
  }

  function update<K extends keyof CardDraft>(key: K, value: CardDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage(null);
    setError(null);
    setArchiveError(null);
  }

  const isDirty =
    draft.numberPrefix !== saved.numberPrefix ||
    draft.numberDatePart !== saved.numberDatePart ||
    draft.numberSeqPadding !== saved.numberSeqPadding ||
    (draft.archiveAfterDays.trim() === '' ? null : Number(draft.archiveAfterDays)) !== saved.archiveAfterDays;

  async function handleSave() {
    if (!canEdit || pending || !updateDocumentAction) return;
    const archive = parseArchive();
    if (!archive.ok) {
      setArchiveError(labels.invalidInput);
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await updateDocumentAction({
      docType,
      numberPrefix: draft.numberPrefix.trim(),
      numberDatePart: draft.numberDatePart,
      numberSeqPadding: draft.numberSeqPadding,
      archiveAfterDays: archive.value,
    });
    setPending(false);

    if (!result.ok) {
      if (result.error === 'invalid_input') {
        setError(labels.invalidInput);
      } else {
        setError(labels.saveError);
      }
      return;
    }
    setSaved(result.setting);
    setDraft(toDraft(result.setting));
    setMessage(labels.saved);
    onSaved();
  }

  return (
    <Section
      title={labels.docTypeNames[docType]}
      foot={
        canEdit ? (
          <Button
            className="btn-primary"
            type="button"
            disabled={controlsDisabled || !isDirty}
            data-testid={`${idPrefix}-save`}
            onClick={() => void handleSave()}
          >
            {pending ? labels.saving : labels.save}
          </Button>
        ) : null
      }
    >
      <div data-testid={`${idPrefix}-card`} className="grid gap-0">
        <SettingField
          id={`${idPrefix}-prefix`}
          label={labels.fieldPrefix}
          hint={labels.fieldPrefixHint}
          value={draft.numberPrefix}
          disabled={controlsDisabled}
          readOnly={!canEdit}
          onChange={(value) => update('numberPrefix', value)}
        />
        <SelectField
          id={`${idPrefix}-date-part`}
          label={labels.fieldDatePart}
          options={DATE_PART_ORDER.map((part) => ({ value: part, label: labels.datePartOptions[part] }))}
          value={draft.numberDatePart}
          disabled={controlsDisabled}
          onChange={(value) => update('numberDatePart', value as DatePart)}
        />
        <SelectField
          id={`${idPrefix}-padding`}
          label={labels.fieldPadding}
          options={PADDING_OPTIONS.map((padding) => ({ value: String(padding), label: String(padding) }))}
          value={String(draft.numberSeqPadding)}
          disabled={controlsDisabled}
          onChange={(value) => update('numberSeqPadding', Number(value))}
        />
        <SRow label={labels.previewLabel}>
          <div className="flex items-center gap-2">
            <code data-testid={`${idPrefix}-preview`} className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {previewNumber}
            </code>
            {!hasRealSeq ? (
              <span className="badge" data-testid={`${idPrefix}-preview-example`} style={{ fontSize: 11 }}>
                {labels.previewExample}
              </span>
            ) : null}
          </div>
        </SRow>
        <SettingField
          id={`${idPrefix}-archive`}
          label={labels.fieldArchive}
          hint={labels.fieldArchiveHint}
          type="number"
          value={draft.archiveAfterDays}
          placeholder={labels.archiveNever}
          disabled={controlsDisabled}
          readOnly={!canEdit}
          onChange={(value) => update('archiveAfterDays', value)}
        />
        {archiveError ? (
          <div role="alert" className="alert alert-red" data-testid={`${idPrefix}-archive-error`}>
            {archiveError}
          </div>
        ) : null}
        {message ? (
          <div role="status" className="alert alert-green" data-testid={`${idPrefix}-saved`}>
            {message}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="alert alert-red" data-testid={`${idPrefix}-error`}>
            {error}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

export default function DocumentsScreen({
  settings = [],
  canEdit = false,
  state = 'ready',
  labels,
  now,
  updateDocumentAction,
}: DocumentsScreenProps) {
  const router = useRouter();
  const frozenNow = now ?? new Date();

  if (state === 'denied') {
    return (
      <StateShell labels={labels}>
        <div className="alert alert-red" role="alert" data-testid="documents-denied">
          <div className="alert-title">{labels.deniedTitle}</div>
          {labels.deniedBody}
        </div>
      </StateShell>
    );
  }

  if (state === 'loading') {
    return (
      <StateShell labels={labels}>
        <div className="sg-section" data-testid="documents-loading" role="status">
          <div className="sg-section-body">
            <span className="muted">{labels.loading}</span>
          </div>
        </div>
      </StateShell>
    );
  }

  if (state === 'error') {
    return (
      <StateShell labels={labels}>
        <div className="alert alert-red" role="alert" data-testid="documents-error">
          {labels.loadError}
        </div>
      </StateShell>
    );
  }

  const ordered = DOC_TYPE_ORDER.map((docType) => settings.find((setting) => setting.docType === docType)).filter(
    (setting): setting is DocumentSetting => Boolean(setting),
  );

  if (state === 'empty' || ordered.length === 0) {
    return (
      <StateShell labels={labels}>
        <div className="empty-state card" role="status" data-testid="documents-empty">
          <div className="empty-state-icon">▦</div>
          <div className="empty-state-body">{labels.empty}</div>
        </div>
      </StateShell>
    );
  }

  return (
    <StateShell labels={labels}>
      {!canEdit ? (
        <div aria-label={labels.readOnlyLabel} className="alert alert-amber" role="note" data-testid="documents-readonly">
          <div className="alert-title">{labels.readOnlyLabel}</div>
          {labels.readOnlyNotice}
        </div>
      ) : null}

      {ordered.map((setting) => (
        <DocumentCard
          key={setting.docType}
          setting={setting}
          canEdit={canEdit}
          labels={labels}
          now={frozenNow}
          updateDocumentAction={updateDocumentAction}
          onSaved={() => router.refresh?.()}
        />
      ))}
    </StateShell>
  );
}
