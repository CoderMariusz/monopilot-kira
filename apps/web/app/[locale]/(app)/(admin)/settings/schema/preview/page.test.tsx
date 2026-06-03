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
      draftLoadErrorTitle: 'Could not load draft columns',
      draftLoadError:
        'The draft columns could not be loaded from the schema store. No data was saved or published. Try again.',
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

/**
 * Real-data fixture: rows as they would come back from the draft-store query
 * against public.dept_column_drafts (status='draft') joined to
 * "Reference"."Departments" + "Reference"."DeptColumns". The page maps these
 * to its DraftColumn shape — there is NO hardcoded SHADOW_PREVIEW_DRAFTS array
 * any more, so the selector/metadata/sample-value all derive from these rows.
 */
const DRAFT_STORE_ROWS = [
  {
    id: 'draft-allergen-risk',
    dept_id: '00000000-0000-0000-0000-0000000000a1',
    column_key: 'allergen_risk_score',
    field_type: 'number',
    validation_json: { range: { min: 1, max: 100 } },
    presentation_json: {
      label: 'Allergen Risk Score',
      table: 'production_batch',
      tier: 'L2',
      sampleValue: '42',
    },
    dept_code: 'QC',
    dept_display_name: 'Quality Control',
    current_schema_version: 7,
  },
  {
    id: 'draft-inline-ph',
    dept_id: '00000000-0000-0000-0000-0000000000a1',
    column_key: 'inline_ph',
    field_type: 'number',
    validation_json: { range: { min: 0, max: 14 } },
    presentation_json: {
      label: 'Inline pH',
      table: 'production_batch',
      tier: 'L2',
      sampleValue: '7.2',
    },
    dept_code: 'QC',
    dept_display_name: 'Quality Control',
    current_schema_version: 8,
  },
];

function isDraftStoreQuery(normalizedSql: string): boolean {
  return normalizedSql.includes('dept_column_drafts') && normalizedSql.includes("status = 'draft'");
}

function isPermissionQuery(normalizedSql: string): boolean {
  return normalizedSql.includes('role_permissions') || normalizedSql.includes('permissions ?');
}

type ContextOptions = {
  allowed?: boolean;
  /** Override the draft rows returned by the store query (default fixture). */
  draftRows?: unknown[];
  /** When set, the draft-store query throws — exercises the load-error state. */
  draftQueryThrows?: boolean;
};

function setupPublishPermissionContext(allowedOrOpts: boolean | ContextOptions = true) {
  const opts: ContextOptions =
    typeof allowedOrOpts === 'boolean' ? { allowed: allowedOrOpts } : allowedOrOpts;
  const allowed = opts.allowed ?? true;
  const draftRows = opts.draftRows ?? DRAFT_STORE_ROWS;

  const permissionQueries: PermissionQueryCall[] = [];
  const draftQueries: PermissionQueryCall[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();

      if (isDraftStoreQuery(normalizedSql)) {
        draftQueries.push({ sql, params });
        if (opts.draftQueryThrows) {
          throw new Error('draft store unavailable');
        }
        return { rows: draftRows, rowCount: draftRows.length };
      }

      permissionQueries.push({ sql, params });
      const checksRegisteredPermission = isPermissionQuery(normalizedSql);
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

  return { client, permissionQueries, draftQueries };
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

  it('loads draft columns from the real draft store (no hardcoded SHADOW_PREVIEW_DRAFTS array)', async () => {
    const { draftQueries } = setupPublishPermissionContext({ allowed: true });

    await renderPreview();

    // The page must have queried the real draft store inside withOrgContext.
    expect(mocks.withOrgContext, 'page must read drafts via withOrgContext (RLS-scoped)').toHaveBeenCalled();
    expect(draftQueries.length, 'page must SELECT from public.dept_column_drafts').toBeGreaterThan(0);
    const draftQuerySql = draftQueries[0]!.sql.replace(/\s+/g, ' ').toLowerCase();
    expect(draftQuerySql).toContain('dept_column_drafts');
    expect(draftQuerySql).toContain("status = 'draft'");

    // Selector + metadata derive from the queried rows, not a fixed in-memory list.
    const combo = screen.getByRole('combobox', { name: /draft column/i });
    expect(within(combo).getByRole('option', { name: /allergen risk score/i })).toBeInTheDocument();
    expect(within(combo).getByRole('option', { name: /inline ph/i })).toBeInTheDocument();
  });

  it('renders the honest empty state when the draft store returns no draft rows', async () => {
    setupPublishPermissionContext({ allowed: true, draftRows: [] });

    await renderPreview();

    expect(screen.getByRole('status')).toHaveTextContent(/no draft columns/i);
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /draft column/i })).not.toBeInTheDocument();
  });

  it('renders a non-mutating error state when the draft store query fails', async () => {
    setupPublishPermissionContext({ allowed: true, draftQueryThrows: true });

    await renderPreview();

    expect(screen.getByRole('alert')).toHaveTextContent(/could not load draft columns|draft columns could not be loaded/i);
    expect(screen.queryByRole('button', { name: /publish this column/i })).not.toBeInTheDocument();
    expect(mocks.publishDeptColumnDraft).not.toHaveBeenCalled();
    expect(mocks.upsertDeptColumnDraft).not.toHaveBeenCalled();
  });

  it('keeps the page server-rendered, i18n-backed, shadcn-composed, and wired to the existing publish module', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/schema/preview/page.tsx'),
        'utf8',
      ),
    );

    expect(source).not.toMatch(/^['"]use client['"]/);
    expect(source).toContain("getTranslations({ locale, namespace: 'settings.schema_preview' })");
    expect(source).toContain("from '@monopilot/ui/Card'");
    expect(source).toContain("from '@monopilot/ui/Button'");
    expect(source).toContain("from '../../../../../../(settings)/schema/_actions/draft'");
    const hasRuntimeImport = source.includes("from '../../../../../../../lib/schema/zod-runtime'");
    const hasHardcodedDraftRows = source.includes('const DRAFT_COLUMNS');
    // Real-data gate: the prior hardcoded in-memory draft array is gone, and the
    // page reads the real draft store table inside withOrgContext.
    const hasHardcodedShadowArray = source.includes('SHADOW_PREVIEW_DRAFTS');
    const queriesRealDraftStore = source.includes('public.dept_column_drafts');
    const usesOrgContext = source.includes('withOrgContext');
    expect(hasRuntimeImport, 'page must consume the shared zod runtime schema helper').toBe(true);
    expect(hasHardcodedDraftRows, 'preview must not duplicate draft rows in page source').toBe(false);
    expect(hasHardcodedShadowArray, 'preview must not keep the hardcoded SHADOW_PREVIEW_DRAFTS array').toBe(false);
    expect(queriesRealDraftStore, 'preview must query the real dept_column_drafts store').toBe(true);
    expect(usesOrgContext, 'draft load must be RLS-scoped via withOrgContext').toBe(true);
    expect(source).not.toContain('import(/* @vite-ignore */');
  });
});
