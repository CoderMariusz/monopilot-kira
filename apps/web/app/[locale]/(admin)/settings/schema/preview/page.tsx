import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';

import { publishDeptColumnDraft } from '../../../../../(settings)/schema/_actions/draft';

type PreviewSearchParams = Record<string, string | undefined>;

type PreviewPageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<PreviewSearchParams>;
};

type DraftColumn = {
  id: string;
  label: string;
  key: string;
  table: string;
  type: 'number' | 'text' | 'date';
  tier: 'L2' | 'L3';
  dept: string;
  required: boolean;
  sampleValue: string;
  schema: string;
};

type PreviewLabels = Record<keyof typeof DEFAULT_LABELS, string>;

type PublishResult = {
  success?: boolean;
  newSchemaVersion?: number;
  code?: string;
  message?: string;
  currentSchemaVersion?: number;
  attemptedSchemaVersion?: number;
};

export const dynamic = 'force-dynamic';

const DEFAULT_LABELS = {
  title: 'Schema shadow preview',
  subtitle: 'Dry-run a draft column in a simulated sample form. No production writes.',
  previewOnlyLead: 'Preview only.',
  previewOnlyBody:
    'This screen renders a draft column using generated sample data. No schema, migration or reference data is written.',
  previewOnlySaved: 'This is a preview only. No data is saved.',
  draftColumns: 'Draft columns',
  draftColumnSelector: 'Draft column selector',
  selectDraft: 'Select draft',
  draftColumn: 'Draft column',
  previewDraft: 'Preview draft',
  columnMetadata: 'Column metadata',
  code: 'Code',
  label: 'Label',
  table: 'Table',
  type: 'Type',
  tier: 'Tier',
  dept: 'Dept',
  required: 'Required',
  requiredYes: 'Yes',
  requiredNo: 'No',
  status: 'Status',
  draftStatus: 'draft',
  generatedRuntimeSchema: 'Generated runtime schema',
  sampleFormPreview: 'Sample form preview',
  renderedSampleForm: 'Rendered sample form',
  sampleFormDescription: 'Generated from sample data. Values are synthetic and not stored.',
  sampleData: 'Sample data',
  previewMeta: 'Preview',
  draftFieldNotice:
    'This field is in draft status. Not visible in production until published via Column Edit Wizard.',
  backToSchemaBrowser: 'Back to schema browser',
  publishThisColumn: 'Publish this Column',
  loading: 'Loading schema shadow preview…',
  noDrafts: 'No draft columns are available for shadow preview.',
  permissionDenied: 'Permission denied. This preview is read-only and cannot publish changes.',
  schemaGenerationErrorTitle: 'Schema generation error',
  schemaGenerationError:
    'Could not generate runtime schema for the selected draft column. No data was saved or published.',
  publishRejected: 'Publish was rejected by the existing schema publish path.',
  publishSuccessPrefix: 'Published column to schema version',
  concurrentEditPrefix: 'Concurrent edit detected',
  attemptedVersion: 'attempted version',
  currentVersion: 'current version',
  unknownVersion: 'unknown',
} as const;

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>;
const SUPPORTED_LOCALES = new Set(['en', 'pl', 'ro', 'uk']);

const DRAFT_COLUMNS: DraftColumn[] = [
  {
    id: 'draft-allergen-risk',
    label: 'Allergen Risk Score',
    key: 'allergen_risk_score',
    table: 'production_batch',
    type: 'number',
    tier: 'L2',
    dept: 'QC',
    required: false,
    sampleValue: '42',
    schema: 'allergen_risk_score: z.number().min(1).max(100)',
  },
  {
    id: 'draft-service-window',
    label: 'Service Window',
    key: 'service_window',
    table: 'partners',
    type: 'text',
    tier: 'L3',
    dept: 'Procurement',
    required: true,
    sampleValue: 'Dinner',
    schema: 'service_window: z.string().min(1)',
  },
  {
    id: 'draft-cert-expiry',
    label: 'Supplier cert expiry',
    key: 'supplier_cert_expiry',
    table: 'partners',
    type: 'date',
    tier: 'L3',
    dept: 'Procurement',
    required: true,
    sampleValue: '2026-06-15',
    schema: 'supplier_cert_expiry: z.coerce.date()',
  },
];

async function buildLabels(locale: string): Promise<PreviewLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.schema_preview' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as PreviewLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function publishShadowDraft(formData: FormData) {
  'use server';

  const draftId = String(formData.get('draftId') ?? '');
  const requestedLocale = String(formData.get('locale') ?? 'en');
  const locale = SUPPORTED_LOCALES.has(requestedLocale) ? requestedLocale : 'en';
  const result = (await publishDeptColumnDraft(draftId)) as PublishResult;
  const target = new URLSearchParams({ draftId });

  if (result.success) {
    target.set('publish', 'success');
    target.set('schemaVersion', String(result.newSchemaVersion ?? 'latest'));
  } else if (result.code === 'CONCURRENT_SCHEMA_VERSION') {
    target.set('publish', 'concurrent');
    target.set('attemptedSchemaVersion', String(result.attemptedSchemaVersion ?? 'unknown'));
    target.set('currentSchemaVersion', String(result.currentSchemaVersion ?? 'unknown'));
    if (result.message) target.set('publishMessage', result.message);
  } else {
    target.set('publish', 'error');
    if (result.message) target.set('publishMessage', result.message);
  }

  redirect(`/${locale}/settings/schema/preview?${target.toString()}`);
}

export default async function SchemaShadowPreviewPage({ params, searchParams }: PreviewPageProps) {
  const { locale } = await params;
  const query: PreviewSearchParams = searchParams ? await searchParams : {};
  const labels = await buildLabels(locale);
  const selectedDraft = DRAFT_COLUMNS.find((draft) => draft.id === query.draftId) ?? DRAFT_COLUMNS[0];

  return (
    <main aria-labelledby="schema-shadow-preview-title" className="settings-page settings-page--schema-preview">
      <header data-region="page-head" className="settings-page__head">
        <h1 id="schema-shadow-preview-title">{labels.title}</h1>
        <p>{labels.subtitle}</p>
      </header>

      {renderState(query, labels, selectedDraft, locale)}
    </main>
  );
}

function renderState(query: PreviewSearchParams, labels: PreviewLabels, selectedDraft: DraftColumn, locale: string) {
  if (query.state === 'loading') {
    return (
      <>
        <PreviewNotice labels={labels} />
        <Card aria-busy="true" data-testid="schema-shadow-preview-loading">
          <CardContent>{labels.loading}</CardContent>
        </Card>
      </>
    );
  }

  if (query.state === 'no-drafts') {
    return (
      <>
        <PreviewNotice labels={labels} />
        <Card>
          <CardContent role="status">{labels.noDrafts}</CardContent>
        </Card>
      </>
    );
  }

  if (query.state === 'permission-denied') {
    return (
      <>
        <PreviewNotice labels={labels} asAlert={false} />
        <Card>
          <CardContent role="alert">{labels.permissionDenied}</CardContent>
        </Card>
      </>
    );
  }

  if (query.state === 'schema-generation-error') {
    return (
      <>
        <PreviewNotice labels={labels} asAlert={false} />
        <Card>
          <CardHeader>
            <CardTitle>{labels.schemaGenerationErrorTitle}</CardTitle>
          </CardHeader>
          <CardContent role="alert" aria-label={labels.schemaGenerationErrorTitle}>
            {labels.schemaGenerationError}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PreviewNotice labels={labels} />
      <PublishStatus query={query} labels={labels} />
      <div
        data-testid="schema-shadow-preview-split-layout"
        className="settings-schema-preview__split"
        style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 16, alignItems: 'start' }}
      >
        <section aria-label={labels.draftColumnSelector} data-width="40%">
          <Card>
            <CardHeader>
              <CardTitle>{labels.draftColumns}</CardTitle>
            </CardHeader>
            <CardContent>
              <form method="get" aria-label={labels.selectDraft}>
                <label htmlFor="draft-column-select">{labels.selectDraft}</label>
                <select id="draft-column-select" name="draftId" defaultValue={selectedDraft.id} aria-label={labels.draftColumn}>
                  {DRAFT_COLUMNS.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.label}
                    </option>
                  ))}
                </select>
                <Button type="submit">{labels.previewDraft}</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{labels.columnMetadata}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <MetadataRow label={labels.code}>
                  <code>{selectedDraft.key}</code>
                </MetadataRow>
                <MetadataRow label={labels.label}>{selectedDraft.label}</MetadataRow>
                <MetadataRow label={labels.table}>
                  <Badge variant="secondary">{selectedDraft.table}</Badge>
                </MetadataRow>
                <MetadataRow label={labels.type}>
                  <Badge variant="secondary">{selectedDraft.type}</Badge>
                </MetadataRow>
                <MetadataRow label={labels.tier}>
                  <Badge variant={selectedDraft.tier === 'L3' ? 'warning' : 'success'}>{selectedDraft.tier}</Badge>
                </MetadataRow>
                <MetadataRow label={labels.dept}>{selectedDraft.dept}</MetadataRow>
                <MetadataRow label={labels.required}>
                  {selectedDraft.required ? labels.requiredYes : labels.requiredNo}
                </MetadataRow>
                <MetadataRow label={labels.status}>
                  <Badge variant="warning">{labels.draftStatus}</Badge>
                </MetadataRow>
              </dl>
            </CardContent>
          </Card>
        </section>

        <section aria-label={labels.renderedSampleForm} data-width="60%">
          <Card>
            <CardHeader>
              <CardTitle>{labels.sampleFormPreview}</CardTitle>
              <CardDescription>{labels.sampleFormDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <form aria-label={labels.sampleData} className="settings-schema-preview__sample-form">
                <label htmlFor={`sample-${selectedDraft.key}`}>
                  {selectedDraft.label}
                  {selectedDraft.required ? <span aria-hidden="true"> *</span> : null}
                </label>
                <Input
                  id={`sample-${selectedDraft.key}`}
                  name={selectedDraft.key}
                  type={selectedDraft.type}
                  value={selectedDraft.sampleValue}
                  readOnly
                />
                <p>
                  {labels.previewMeta} · {labels.tier} {selectedDraft.tier} ·{' '}
                  <code>
                    {selectedDraft.table}.{selectedDraft.key}
                  </code>
                </p>
              </form>

              <div className="alert alert-amber" role="status">
                {labels.draftFieldNotice}
              </div>

              <h2>{labels.generatedRuntimeSchema}</h2>
              <pre data-testid="generated-runtime-schema">{selectedDraft.schema}</pre>
            </CardContent>
            <CardFooter>
              <a className="btn btn-secondary" href={`/${locale}/settings/schema`}>
                ← {labels.backToSchemaBrowser}
              </a>
              <form action={publishShadowDraft} aria-label={labels.publishThisColumn}>
                <input type="hidden" name="draftId" value={selectedDraft.id} />
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit">{labels.publishThisColumn} →</Button>
              </form>
            </CardFooter>
          </Card>
        </section>
      </div>
    </>
  );
}

function PreviewNotice({ labels, asAlert = true }: { labels: PreviewLabels; asAlert?: boolean }) {
  return (
    <div className="alert alert-blue" role={asAlert ? 'alert' : 'note'}>
      <strong>{labels.previewOnlyLead}</strong> {labels.previewOnlyBody} {labels.previewOnlySaved}
    </div>
  );
}

function PublishStatus({ query, labels }: { query: PreviewSearchParams; labels: PreviewLabels }) {
  if (query.publish === 'success') {
    return (
      <div role="status" className="alert alert-green">
        {labels.publishSuccessPrefix} {query.schemaVersion ?? labels.unknownVersion}.
      </div>
    );
  }

  if (query.publish === 'concurrent') {
    return (
      <div role="alert" className="alert alert-amber">
        {labels.concurrentEditPrefix}: {labels.attemptedVersion} {query.attemptedSchemaVersion ?? labels.unknownVersion}{' '}
        {labels.currentVersion} {query.currentSchemaVersion ?? labels.unknownVersion}. {query.publishMessage ?? ''}
      </div>
    );
  }

  if (query.publish === 'error') {
    return (
      <div role="alert" className="alert alert-red">
        {query.publishMessage ?? labels.publishRejected}
      </div>
    );
  }

  return null;
}

function MetadataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-schema-preview__metadata-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
