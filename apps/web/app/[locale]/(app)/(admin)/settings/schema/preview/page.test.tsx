/**
 * @vitest-environment jsdom
 * T-128 / SET-034 — localized Schema Shadow Preview screen.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  getZodRuntimeSchema: vi.fn(),
  publishDeptColumnDraft: vi.fn(),
  upsertDeptColumnDraft: vi.fn(),
  redirect: vi.fn(),
  withOrgContext: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    const labels: Record<string, string> = {
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
    };
    return labels[key] ?? key;
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('../../../../../../(settings)/schema/_actions/draft', () => ({
  publishDeptColumnDraft: mocks.publishDeptColumnDraft,
  upsertDeptColumnDraft: mocks.upsertDeptColumnDraft,
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: mocks.withOrgContext,
}));

vi.mock('../../../../../../../lib/schema/zod-runtime', () => ({
  getZodRuntimeSchema: mocks.getZodRuntimeSchema,
}));

type PreviewPageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
};

type PreviewPage = (props: PreviewPageProps) => React.ReactNode | Promise<React.ReactNode>;

async function loadPreviewPage(): Promise<PreviewPage> {
  const mod = await import('./page.jsx');
  return mod.default as unknown as PreviewPage;
}

const SCHEMA_SHADOW_PUBLISH_PERMISSION = 'org.schema.admin';

type PermissionQueryCall = {
  sql: string;
  params?: readonly unknown[];
};

function setupPublishPermissionContext(allowed: boolean) {
  const permissionQueries: PermissionQueryCall[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      permissionQueries.push({ sql, params });
      const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();
      const checksRegisteredPermission =
        normalizedSql.includes('role_permissions') || normalizedSql.includes('permissions ?');
      const checksSchemaAdminPermission = params?.includes(SCHEMA_SHADOW_PUBLISH_PERMISSION) ?? false;
      return allowed && checksRegisteredPermission && checksSchemaAdminPermission
        ? { rows: [{ ok: true }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }),
  };

  mocks.withOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: 'user-rbac-subject',
      orgId: 'org-rbac-subject',
      sessionToken: 'session-rbac-subject',
      client,
    }),
  );

  return { client, permissionQueries };
}

async function renderPreview(searchParams: Record<string, string | undefined> = {}) {
  const Page = await loadPreviewPage();
  const node = await Page({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  });

  return render(React.createElement(React.Fragment, null, node));
}

describe('SET-034 localized Schema Shadow Preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getZodRuntimeSchema.mockResolvedValue(
      z.object({ inline_ph: z.number().min(0).max(14) }),
    );
    setupPublishPermissionContext(true);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders split layout with draft selector, rendered sample form, metadata, and preview-only notice', async () => {
    await renderPreview();

    expect(screen.getByRole('heading', { name: /schema shadow preview/i })).toBeInTheDocument();

    const splitLayout = screen.getByTestId('schema-shadow-preview-split-layout');
    const draftPanel = within(splitLayout).getByRole('region', { name: /draft column selector/i });
    const formPanel = within(splitLayout).getByRole('region', { name: /rendered sample form/i });

    expect(draftPanel).toHaveAttribute('data-width', '40%');
    expect(formPanel).toHaveAttribute('data-width', '60%');
    expect(within(draftPanel).getByRole('combobox', { name: /draft column/i })).toBeInTheDocument();
    expect(within(formPanel).getByRole('form', { name: /sample data/i })).toBeInTheDocument();
    expect(screen.getByText(/column metadata/i)).toBeInTheDocument();
    expect(screen.getAllByText(/production_batch/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('alert')).toHaveTextContent(/preview only/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/no data is saved/i);
  });

  it('selecting a draft by route state renders generated runtime schema and sample data without production writes', async () => {
    await renderPreview({ draftId: 'draft-allergen-risk' });

    const sampleForm = screen.getByRole('form', { name: /sample data/i });
    expect(within(sampleForm).getByLabelText(/allergen risk score/i)).toHaveDisplayValue('42');
    expect(screen.getByTestId('generated-runtime-schema')).toHaveTextContent(
      /allergen_risk_score.*z\.number\(\).*min\(1\).*max\(100\)/is,
    );
    expect(mocks.upsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mocks.publishDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('selects a live draft and generates the sample form through the shared runtime schema helper', async () => {
    await renderPreview({ draftId: 'draft-inline-ph' });

    expect(mocks.getZodRuntimeSchema).toHaveBeenCalledWith(
      expect.objectContaining({
        tableCode: 'production_batch',
        schemaVersion: expect.any(Number),
        loadColumns: expect.any(Function),
      }),
    );
    const sampleForm = screen.getByRole('form', { name: /sample data/i });
    expect(within(sampleForm).getByLabelText(/inline ph/i)).toHaveDisplayValue('7.2');
    expect(screen.getByTestId('generated-runtime-schema')).toHaveTextContent(/inline_ph.*z\.number/i);
    expect(mocks.upsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mocks.publishDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('hands Publish this Column to the existing publish action and routes concurrent edits back to the preview', async () => {
    const user = userEvent.setup();
    mocks.publishDeptColumnDraft.mockResolvedValue({
      success: false,
      code: 'CONCURRENT_SCHEMA_VERSION',
      message: 'Schema changed before publish.',
      currentSchemaVersion: 8,
      attemptedSchemaVersion: 7,
    });

    await renderPreview({ draftId: 'draft-allergen-risk' });
    await user.click(screen.getByRole('button', { name: /publish this column/i }));

    await waitFor(() => expect(mocks.publishDeptColumnDraft).toHaveBeenCalledWith('draft-allergen-risk'));
    expect(mocks.publishDeptColumnDraft).toHaveBeenCalledTimes(1);
    expect(mocks.upsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining(
        '/en/settings/schema/preview?draftId=draft-allergen-risk&publish=concurrent&attemptedSchemaVersion=7&currentSchemaVersion=8',
      ),
    );

    cleanup();
    await renderPreview({
      draftId: 'draft-allergen-risk',
      publish: 'concurrent',
      attemptedSchemaVersion: '7',
      currentSchemaVersion: '8',
      publishMessage: 'Schema changed before publish.',
    });
    const concurrentAlert = screen.getByText(/concurrent edit/i).closest('[role="alert"]');
    expect(concurrentAlert).toHaveTextContent(/version\s+7/i);
    expect(concurrentAlert).toHaveTextContent(/version\s+8/i);
  });

  it('denies schema shadow publish before delegating to the mutating publish action when schema admin permission is missing', async () => {
    const user = userEvent.setup();
    const { permissionQueries } = setupPublishPermissionContext(false);
    mocks.publishDeptColumnDraft.mockResolvedValue({ success: true, newSchemaVersion: 99 });

    await renderPreview({ draftId: 'draft-allergen-risk' });
    await user.click(screen.getByRole('button', { name: /publish this column/i }));

    await waitFor(() => expect(mocks.redirect).toHaveBeenCalled());
    expect(
      mocks.publishDeptColumnDraft,
      'unauthorized caller must be denied before the state-changing publish action is invoked',
    ).not.toHaveBeenCalled();
    expect(permissionQueries.length, 'publishShadowDraft must query RBAC in the current org context').toBeGreaterThan(0);
    expect(permissionQueries.some((query) => query.params?.includes(SCHEMA_SHADOW_PUBLISH_PERMISSION))).toBe(true);
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/en/settings/schema/preview?draftId=draft-allergen-risk&state=permission-denied'),
    );
  });

  it('allows schema shadow publish only after the current org/user has the schema admin permission', async () => {
    const user = userEvent.setup();
    const { client, permissionQueries } = setupPublishPermissionContext(true);
    mocks.publishDeptColumnDraft.mockResolvedValue({ success: true, newSchemaVersion: 9 });

    await renderPreview({ draftId: 'draft-inline-ph' });
    await user.click(screen.getByRole('button', { name: /publish this column/i }));

    await waitFor(() => expect(mocks.publishDeptColumnDraft).toHaveBeenCalledWith('draft-inline-ph'));
    expect(permissionQueries.some((query) => query.params?.includes(SCHEMA_SHADOW_PUBLISH_PERMISSION))).toBe(true);
    expect(client.query.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.publishDeptColumnDraft.mock.invocationCallOrder[0],
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/en/settings/schema/preview?draftId=draft-inline-ph&publish=success&schemaVersion=9'),
    );
  });

  it('renders loading, no-draft, permission-denied, and schema-generation error states as non-mutating', async () => {
    await renderPreview({ state: 'loading' });
    expect(screen.getByTestId('schema-shadow-preview-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    cleanup();

    await renderPreview({ state: 'no-drafts' });
    expect(screen.getByRole('status')).toHaveTextContent(/no draft columns/i);
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    cleanup();

    await renderPreview({ state: 'permission-denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/permission denied/i);
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    cleanup();

    await renderPreview({ state: 'schema-generation-error', draftId: 'draft-bad-formula' });
    expect(screen.getByRole('alert', { name: /schema generation error/i })).toHaveTextContent(
      /could not generate runtime schema/i,
    );
    expect(screen.getByRole('note')).toHaveTextContent(/preview only/i);
    expect(screen.getByRole('note')).toHaveTextContent(/no data is saved/i);

    expect(mocks.upsertDeptColumnDraft).not.toHaveBeenCalled();
    expect(mocks.publishDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('keeps the page server-rendered, i18n-backed, shadcn-composed, and wired to the existing publish module', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/schema/preview/page.tsx'),
        'utf8',
      ),
    );

    expect(source).not.toMatch(/^['\"]use client['\"]/);
    expect(source).toContain("getTranslations({ locale, namespace: 'settings.schema_preview' })");
    expect(source).toContain("from '@monopilot/ui/Card'");
    expect(source).toContain("from '@monopilot/ui/Button'");
    expect(source).toContain("from '../../../../../../(settings)/schema/_actions/draft'");
    const hasRuntimeImport = source.includes("from '../../../../../../../lib/schema/zod-runtime'");
    const hasHardcodedDraftRows = source.includes('const DRAFT_COLUMNS');
    expect(hasRuntimeImport, 'page must consume the shared zod runtime schema helper').toBe(true);
    expect(hasHardcodedDraftRows, 'preview must not duplicate draft rows in page source').toBe(false);
    expect(source).not.toContain('import(/* @vite-ignore */');
  });
});
