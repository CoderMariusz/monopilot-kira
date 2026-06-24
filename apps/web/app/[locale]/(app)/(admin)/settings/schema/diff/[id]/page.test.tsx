/**
 * @vitest-environment jsdom
 * T-098 / SET-032 — Schema Diff Viewer RED tests.
 * Source of truth: prototypes/design/02-SETTINGS-UX.md SET-032 / schema-diff.
 * RED scope: tests only; production diff page is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult<T = unknown> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query: (sql: string | { text?: string }, params?: readonly unknown[]) => Promise<QueryResult>;
};
type SchemaDiffPage = (props: {
  params?: Promise<{ locale: string; id: string }>;
  searchParams?: Promise<{ from?: string; to?: string }>;
}) => React.ReactNode | Promise<React.ReactNode>;

const harness = vi.hoisted(() => ({
  client: undefined as QueryClient | undefined,
  queryParams: [] as unknown[][],
}));

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (callback: (ctx: { userId: string; orgId: string; client: QueryClient }) => unknown) => {
    if (!harness.client) throw new Error('RED harness did not install a query client');
    return callback({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: harness.client,
    });
  },
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      title: 'Schema diff',
      subtitle: 'Side-by-side comparison of schema versions for a specific column.',
      unifiedDiff: 'Unified JSON deep diff',
      noPriorVersion: 'No prior version',
      noPriorVersionBody: 'This column is at version 1. There is nothing to compare against yet.',
      added: '{count} added',
      removed: '{count} removed',
      changed: '{count} changed',
      unchanged: '{count} unchanged',
      changedBy: 'Changed by',
      changedAt: 'Changed at',
      deployRef: 'Deploy ref',
      revertToPrevious: 'Revert to Version N-1',
      backToSchemaBrowser: 'Back to schema browser',
      forbiddenTitle: '403 — Forbidden',
      compare: 'Compare',
      against: 'against',
      tier: 'Tier',
      path: 'Path',
      before: 'before',
      current: 'current',
      change: 'Change',
      selectVersionFrom: 'Compare version',
      selectVersionAgainst: 'Against version',
      versionOption: 'v{version} — {date} by {author}',
      versionBeforeTitle: 'Version {version} (before)',
      versionAfterTitle: 'Version {version} (current)',
      revertToVersion: 'Revert to v{version}',
      revertConfirmTitle: 'Revert {column} to v{version}?',
      revertConfirmBody: 'This creates a new version restoring the JSON shape from v{version}.',
      revertConfirmWarning: 'Reverting will increment the version to v{next}. The current v{current} is preserved.',
      revertConfirm: 'Confirm revert',
      revertCancel: 'Cancel',
      revertUnavailableL1: 'L1 columns cannot be reverted from this screen.',
      revertUnavailableWindow: 'Revert is available only for the last 3 versions.',
      revertAvailable: 'Reverting will create a new version restoring the Before JSON.',
    };
    const template = labels[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? `{${name}}`));
  },
}));

const REQUIRED_SCHEMA_DIFF_I18N_KEYS = [
  'title',
  'subtitle',
  'unifiedDiff',
  'noPriorVersion',
  'noPriorVersionBody',
  'added',
  'removed',
  'changed',
  'unchanged',
  'changedBy',
  'changedAt',
  'deployRef',
  'revertToPrevious',
  'backToSchemaBrowser',
  'forbiddenTitle',
  'forbiddenBody',
  'unableToLoadTitle',
  'unableToLoadBody',
  'unavailableTitle',
  'noVersionsBody',
  'compare',
  'against',
  'tier',
  'path',
  'before',
  'current',
  'change',
  'settingsCrumb',
  'schemaBrowserCrumb',
] as const;

const versionRows = [
  {
    migration_id: 'migration-001',
    column_id: 'col-shelf-life',
    schema_column_id: 'col-shelf-life',
    column_code: 'shelf_life_days',
    col: 'shelf_life_days',
    table_code: 'products',
    table: 'products',
    dept_code: 'npd',
    tier: 'L2',
    version: 1,
    v: 1,
    schema_version: 1,
    definition_json: {
      data_type: 'integer',
      required: true,
      validation: { min: 0, max: 180 },
      presentation: { label: 'Shelf life days' },
    },
    json: {
      data_type: 'integer',
      required: true,
      validation: { min: 0, max: 180 },
      presentation: { label: 'Shelf life days' },
    },
    changed_by: 'schema-admin',
    deployed_by: 'schema-admin',
    by: 'schema-admin',
    changed_at: '2026-05-01T10:00:00Z',
    deployed_at: '2026-05-01T10:00:00Z',
    at: '2026-05-01T10:00:00Z',
    deploy_ref: 'schema-v1',
  },
  {
    migration_id: 'migration-001',
    column_id: 'col-shelf-life',
    schema_column_id: 'col-shelf-life',
    column_code: 'shelf_life_days',
    col: 'shelf_life_days',
    table_code: 'products',
    table: 'products',
    dept_code: 'npd',
    tier: 'L2',
    version: 2,
    v: 2,
    schema_version: 2,
    definition_json: {
      data_type: 'integer',
      required: true,
      validation: { min: 0, max: 365 },
      presentation: { label: 'Shelf life days' },
    },
    json: {
      data_type: 'integer',
      required: true,
      validation: { min: 0, max: 365 },
      presentation: { label: 'Shelf life days' },
    },
    changed_by: 'schema-admin',
    deployed_by: 'schema-admin',
    by: 'schema-admin',
    changed_at: '2026-05-02T10:00:00Z',
    deployed_at: '2026-05-02T10:00:00Z',
    at: '2026-05-02T10:00:00Z',
    deploy_ref: 'schema-v2',
  },
  {
    migration_id: 'migration-001',
    column_id: 'col-shelf-life',
    schema_column_id: 'col-shelf-life',
    column_code: 'shelf_life_days',
    col: 'shelf_life_days',
    table_code: 'products',
    table: 'products',
    dept_code: 'npd',
    tier: 'L2',
    version: 3,
    v: 3,
    schema_version: 3,
    definition_json: {
      data_type: 'integer',
      required: false,
      validation: { min: 0 },
      presentation: { label: 'Shelf life days', helpText: 'Use current packaging shelf-life value.' },
    },
    json: {
      data_type: 'integer',
      required: false,
      validation: { min: 0 },
      presentation: { label: 'Shelf life days', helpText: 'Use current packaging shelf-life value.' },
    },
    changed_by: 'schema-admin',
    deployed_by: 'schema-admin',
    by: 'schema-admin',
    changed_at: '2026-05-03T10:00:00Z',
    deployed_at: '2026-05-03T10:00:00Z',
    at: '2026-05-03T10:00:00Z',
    deploy_ref: 'schema-v3',
  },
];

function sqlText(sql: string | { text?: string }) {
  return typeof sql === 'string' ? sql : sql.text ?? '';
}

function createClient() {
  return {
    query: vi.fn(async (sql: string | { text?: string }, params?: readonly unknown[]): Promise<QueryResult> => {
      const text = sqlText(sql).toLowerCase();
      const paramList = Array.isArray(params) ? params : [];
      harness.queryParams.push([...paramList]);

      if (text.includes('permission') || text.includes('user_roles') || text.includes('role_permissions') || text.includes('roles')) {
        return paramList.includes('settings.schema.read') || paramList.includes('settings.schema.admin')
          ? { rows: [{ ok: true, allowed: true, is_admin: true }], rowCount: 1 }
          : { rows: [{ ok: true, allowed: true, is_admin: true }], rowCount: 1 };
      }

      if (text.includes('schema') || text.includes('dept_column') || text.includes('reference')) {
        return { rows: versionRows, rowCount: versionRows.length };
      }

      return { rows: [], rowCount: 0 };
    }),
  } satisfies QueryClient;
}

async function loadSchemaDiffPage(): Promise<SchemaDiffPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-032 schema diff page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as SchemaDiffPage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Cannot find module|failed to load url|\.\/page\.tsx/i.test(message)) {
      throw error;
    }
    return function MissingSchemaDiffPage() {
      return React.createElement('main', { 'data-testid': 'missing-schema-diff-page' });
    };
  }
}

async function renderSchemaDiff(searchParams: { from?: string; to?: string } = { from: '2', to: '3' }) {
  harness.client = createClient();
  harness.queryParams = [];
  const Page = await loadSchemaDiffPage();
  const node = await Page({
    params: Promise.resolve({ locale: 'en', id: 'migration-001' }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(React.createElement(React.Fragment, null, node));
}

describe('SET-032 localized Schema Diff Viewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/schema/diff/migration-001?from=2&to=3');
  });

  afterEach(() => {
    cleanup();
    harness.client = undefined;
    harness.queryParams = [];
  });

  it('has schema_diff i18n messages for every supported locale and state', async () => {
    const locales = ['en', 'pl', 'ro', 'uk'] as const;

    for (const locale of locales) {
      const filePath = path.join(process.cwd(), 'messages', locale, '02-settings.json');
      const messages = JSON.parse(await readFile(filePath, 'utf8')) as { schema_diff?: Record<string, unknown> };
      expect(
        messages.schema_diff,
        `${locale}/02-settings.json must define settings.schema_diff so the page does not fall back to English defaults or raw keys`,
      ).toBeDefined();
      for (const key of REQUIRED_SCHEMA_DIFF_I18N_KEYS) {
        expect(messages.schema_diff?.[key], `${locale}/02-settings.json missing schema_diff.${key}`).toEqual(
          expect.any(String),
        );
      }
    }
  });

  it('is implemented only at the localized AppShell route /settings/schema/diff/:id', async () => {
    await expect(access(path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/schema/diff/[id]/page.tsx'))).resolves.toBeUndefined();
    await expect(access(path.join(process.cwd(), 'app/[locale]/(admin)/settings/schema/[tableCode]/[columnCode]/diff/page.tsx'))).rejects.toThrow();
    await expect(access(path.join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/schema/[tableCode]/[columnCode]/diff/page.tsx'))).rejects.toThrow();
  });

  it('renders v2 vs v3 as a unified JSON deep-diff with added, removed, and changed badges', async () => {
    await renderSchemaDiff({ from: '2', to: '3' });

    expect(harness.queryParams.flat(), 'page must load data by the route id migration-001 instead of hard-coded prototype data').toContain('migration-001');
    const root = screen.getByTestId('settings-schema-diff-screen');
    expect(root).toHaveAttribute('data-route-template', '/settings/schema/diff/:id');
    expect(screen.getByRole('heading', { name: /schema diff.*shelf_life_days/i })).toBeInTheDocument();
    expect(screen.getByText(/v2\s*(→|->|to|against)\s*v3/i)).toBeInTheDocument();
    expect(screen.getByText(/products\s*\/\s*shelf_life_days|shelf_life_days.*products/i)).toBeInTheDocument();

    expect(screen.getByText(/1\s+added/i)).toBeInTheDocument();
    expect(screen.getByText(/1\s+removed/i)).toBeInTheDocument();
    expect(screen.getByText(/1\s+changed/i)).toBeInTheDocument();

    const diffTable = screen.getByRole('table', { name: /unified json deep diff|json deep diff/i });
    expect(within(diffTable).getByRole('columnheader', { name: /path/i })).toBeInTheDocument();
    expect(within(diffTable).getByRole('columnheader', { name: /v2|before/i })).toBeInTheDocument();
    expect(within(diffTable).getByRole('columnheader', { name: /v3|current|after/i })).toBeInTheDocument();
    expect(within(diffTable).getByRole('columnheader', { name: /change/i })).toBeInTheDocument();

    expect(within(diffTable).getByText(/presentation\.helpText/i).closest('tr')).toHaveTextContent(/added/i);
    expect(within(diffTable).getByText(/validation\.max/i).closest('tr')).toHaveTextContent(/removed/i);
    expect(within(diffTable).getByText(/required/i).closest('tr')).toHaveTextContent(/changed/i);
    // "schema-admin" now also appears inside the parity version-picker option labels,
    // so assert at least one occurrence (metadata strip + selects).
    expect(screen.getAllByText(/schema-admin/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/schema-v3/i)).toBeInTheDocument();
  });

  it('shows a no-prior-version empty state when v1 is selected instead of fabricating a diff', async () => {
    await renderSchemaDiff({ to: '1' });

    expect(screen.getByRole('heading', { name: /schema diff.*shelf_life_days/i })).toBeInTheDocument();
    expect(screen.getByText(/no prior version/i)).toBeInTheDocument();
    expect(screen.getByText(/version 1|nothing to compare/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /json deep diff/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revert to version/i })).not.toBeInTheDocument();
  });

  it('exposes shadcn version SELECT pickers for arbitrary vN vs vM (parity: schema-diff.jsx:167-190) and recomputes the diff on change', async () => {
    const user = userEvent.setup();
    await renderSchemaDiff({ from: '2', to: '3' });

    // Two comboboxes (shadcn Select), NOT static badges.
    const fromSelect = screen.getByRole('combobox', { name: /compare version/i });
    const againstSelect = screen.getByRole('combobox', { name: /against version/i });
    expect(fromSelect).toBeInTheDocument();
    expect(againstSelect).toBeInTheDocument();

    // Switch the "compare" version from v2 to v1 and confirm the summary updates.
    await user.click(fromSelect);
    const v1Option = screen.getByRole('option', { name: /^v1 /i });
    await user.click(v1Option);
    expect(screen.getByText(/v1\s*→\s*v3/i)).toBeInTheDocument();
  });

  it('wires "Revert to vN" to a confirm dialog (parity: schema-diff.jsx:243-260) for revertable L2/L3 versions', async () => {
    const user = userEvent.setup();
    await renderSchemaDiff({ from: '2', to: '3' });

    const revertButton = screen.getByRole('button', { name: /revert to v2/i });
    expect(revertButton).toBeEnabled();
    expect(screen.queryByRole('dialog', { name: /revert .*to v2/i })).not.toBeInTheDocument();

    await user.click(revertButton);
    const dialog = await screen.findByRole('dialog', { name: /revert .*to v2/i });
    expect(dialog).toHaveTextContent(/restoring the json shape from v2/i);
    expect(within(dialog).getByRole('button', { name: /confirm revert/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
