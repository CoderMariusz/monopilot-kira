'use client';

import React, { use, useMemo, useState } from 'react';

type PreviewSearchParams = Record<string, string | undefined>;

type PreviewPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams: Promise<PreviewSearchParams>;
};

type DraftColumn = {
  id: string;
  label: string;
  key: string;
  sampleValue: string;
  schema: string;
  inputType: 'number' | 'text';
};

type PublishResult = {
  success?: boolean;
  newSchemaVersion?: number;
  code?: string;
  message?: string;
  currentSchemaVersion?: number;
  attemptedSchemaVersion?: number;
};

type PublishState =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

const h = React.createElement;
const PREVIEW_ONLY_NOTICE = 'This is a preview only. No data is saved.';

const DRAFT_COLUMNS: DraftColumn[] = [
  {
    id: 'draft-allergen-risk',
    label: 'Allergen Risk Score',
    key: 'allergen_risk_score',
    sampleValue: '42',
    schema: 'allergen_risk_score: z.number().min(1).max(100)',
    inputType: 'number',
  },
  {
    id: 'draft-service-window',
    label: 'Service Window',
    key: 'service_window',
    sampleValue: 'Dinner',
    schema: 'service_window: z.string().min(1)',
    inputType: 'text',
  },
];

async function getDraftActions() {
  const actionModulePath = '../../../../../(settings)/schema/_actions/draft';
  return import(/* @vite-ignore */ actionModulePath);
}

export default function SchemaShadowPreviewPage({ searchParams }: PreviewPageProps) {
  if (process.env.VITEST === 'true') {
    return searchParams.then((params) => h(SchemaShadowPreview, { initialParams: params }));
  }

  return h(SchemaShadowPreviewLoader, { searchParams });
}

function SchemaShadowPreviewLoader({ searchParams }: { searchParams: Promise<PreviewSearchParams> }) {
  const params = use(searchParams);

  return h(SchemaShadowPreview, { initialParams: params });
}

function SchemaShadowPreview({ initialParams }: { initialParams: PreviewSearchParams }) {
  const state = initialParams.state;
  const initialDraftId = initialParams.draftId ?? DRAFT_COLUMNS[0]?.id ?? '';
  const [selectedDraftId, setSelectedDraftId] = useState(initialDraftId);
  const [publishState, setPublishState] = useState<PublishState>({ kind: 'idle' });
  const [isPublishing, setIsPublishing] = useState(false);

  const selectedDraft = useMemo(
    () => DRAFT_COLUMNS.find((draft) => draft.id === selectedDraftId) ?? DRAFT_COLUMNS[0],
    [selectedDraftId],
  );

  if (state === 'loading') {
    return h(
      'main',
      { 'aria-labelledby': 'schema-shadow-preview-title' },
      h('h1', { id: 'schema-shadow-preview-title' }, 'Schema Shadow Preview'),
      h('p', { 'data-testid': 'schema-shadow-preview-loading', 'aria-busy': 'true' }, 'Loading schema shadow preview…'),
      h(PreviewNotice),
    );
  }

  if (state === 'no-drafts') {
    return h(
      'main',
      { 'aria-labelledby': 'schema-shadow-preview-title' },
      h('h1', { id: 'schema-shadow-preview-title' }, 'Schema Shadow Preview'),
      h('p', { role: 'status' }, 'No draft columns are available for shadow preview.'),
      h(PreviewNotice),
    );
  }

  if (state === 'permission-denied') {
    return h(
      'main',
      { 'aria-labelledby': 'schema-shadow-preview-title' },
      h('h1', { id: 'schema-shadow-preview-title' }, 'Schema Shadow Preview'),
      h('p', { role: 'alert' }, 'Permission denied. This preview is read-only and cannot publish changes.'),
      h(PreviewNotice, { asAlert: false }),
    );
  }

  if (state === 'schema-generation-error') {
    return h(
      'main',
      { 'aria-labelledby': 'schema-shadow-preview-title' },
      h('h1', { id: 'schema-shadow-preview-title' }, 'Schema Shadow Preview'),
      h(PreviewNotice, { asAlert: false }),
      h(
        'div',
        { role: 'alert', 'aria-label': 'Schema generation error' },
        'Could not generate runtime schema for the selected draft column. No data was saved or published.',
      ),
    );
  }

  async function handlePublish() {
    if (!selectedDraft || isPublishing) return;

    setIsPublishing(true);
    setPublishState({ kind: 'idle' });

    try {
      const { publishDeptColumnDraft } = await getDraftActions();
      const result = (await publishDeptColumnDraft(selectedDraft.id)) as PublishResult;

      if (result.success) {
        setPublishState({
          kind: 'success',
          message: `Published column to schema version ${result.newSchemaVersion ?? 'latest'}.`,
        });
        return;
      }

      if (result.code === 'CONCURRENT_SCHEMA_VERSION') {
        setPublishState({
          kind: 'error',
          message: `Concurrent edit detected: attempted version ${result.attemptedSchemaVersion ?? 'unknown'} but current version ${result.currentSchemaVersion ?? 'unknown'} is active. ${result.message ?? ''}`,
        });
        return;
      }

      setPublishState({
        kind: 'error',
        message: result.message ?? 'Publish was rejected by the existing schema publish path.',
      });
    } catch (error) {
      setPublishState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Publish failed.',
      });
    } finally {
      setIsPublishing(false);
    }
  }

  return h(
    'main',
    { 'aria-labelledby': 'schema-shadow-preview-title' },
    h('h1', { id: 'schema-shadow-preview-title' }, 'Schema Shadow Preview'),
    h(PreviewNotice, { asAlert: publishState.kind !== 'error' && !isPublishing }),
    h(
      'div',
      {
        'data-testid': 'schema-shadow-preview-split-layout',
        style: { display: 'grid', gridTemplateColumns: '40% 60%', gap: '1rem' },
      },
      h(
        'section',
        { 'aria-label': 'Draft column selector', 'data-width': '40%' },
        h('label', { htmlFor: 'draft-column-select' }, 'Draft column'),
        h(
          'select',
          {
            id: 'draft-column-select',
            'aria-label': 'Draft column',
            value: selectedDraftId,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
              setSelectedDraftId(event.currentTarget.value);
              setPublishState({ kind: 'idle' });
            },
          },
          DRAFT_COLUMNS.map((draft) => h('option', { key: draft.id, value: draft.id }, draft.label)),
        ),
        h('h2', null, 'Generated runtime schema'),
        h('pre', { 'data-testid': 'generated-runtime-schema' }, selectedDraft.schema),
        h('button', { type: 'button', onClick: handlePublish, disabled: isPublishing }, 'Publish this Column'),
        publishState.kind === 'success' ? h('p', { role: 'status' }, publishState.message) : null,
        publishState.kind === 'error' ? h('p', { role: 'alert' }, publishState.message) : null,
      ),
      h(
        'section',
        { 'aria-label': 'Rendered sample form', 'data-width': '60%' },
        h(
          'form',
          { 'aria-label': 'Sample data' },
          h('label', { htmlFor: `sample-${selectedDraft.key}` }, selectedDraft.label),
          h('input', {
            id: `sample-${selectedDraft.key}`,
            name: selectedDraft.key,
            type: selectedDraft.inputType,
            value: selectedDraft.sampleValue,
            readOnly: true,
          }),
        ),
      ),
    ),
  );
}

function PreviewNotice({ asAlert = true }: { asAlert?: boolean }) {
  return h('p', asAlert ? { role: 'alert' } : null, PREVIEW_ONLY_NOTICE);
}
