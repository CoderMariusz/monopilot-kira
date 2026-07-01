/**
 * @vitest-environment jsdom
 * T-121 / SET-029 — real-data loader wiring.
 *
 * Asserts the production import/export hub reads REAL Supabase rows via
 * withOrgContext (RLS) — the org-scoped capability registry (capabilities.ts)
 * plus recent jobs from public.import_export_jobs — instead of the previous
 * injection-only "Live loader not configured" placeholder default.
 *
 * Loader: apps/web/actions/import-export/load-import-export.ts
 * Registry: apps/web/actions/import-export/capabilities.ts (listImportExportCapabilities)
 * Jobs table: public.import_export_jobs
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

const harness = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  // Permissions the fake caller holds (role_permissions rows). Empty = RBAC denied.
  grantedPermissions: new Set<string>(),
  jobRows: [] as Array<Record<string, unknown>>,
}));

function makeClient() {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      harness.calls.push({ sql, params });
      const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (n.includes('role_permissions')) {
        const permission = params[2];
        const ok = typeof permission === 'string' && harness.grantedPermissions.has(permission);
        return { rows: (ok ? [{ ok: true }] : []) as T[], rowCount: ok ? 1 : 0 };
      }
      if (n.includes('from public.import_export_jobs')) {
        return { rows: harness.jobRows as T[], rowCount: harness.jobRows.length };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

// load-import-export.ts and capabilities.ts both import ../../lib/auth/with-org-context
vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (fn: (ctx: unknown) => Promise<unknown>) =>
    fn({ userId: 'u-1', orgId: 'o-1', sessionToken: 's-1', client: makeClient() }),
  ),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => '/en/settings/import-export',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function passthroughT(key: string, values?: Record<string, string | number>) {
  const labels: Record<string, string> = {
    title: 'Import / Export',
    entity_label: 'Settings entity',
    'states.empty': 'No import or export jobs yet.',
    'states.error': 'Unable to load import/export configuration.',
    'jobs.table_label': 'Recent import and export jobs',
    'jobs.completed': 'completed',
    'jobs.failed': 'failed',
    'jobs.import_type': 'import',
    'jobs.export_type': 'export',
  };
  return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
}

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => passthroughT) }));
vi.mock('next-intl', () => ({ useTranslations: () => passthroughT }));

async function loadPage() {
  const mod = (await import('./page')) as {
    default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode>;
  };
  return mod.default;
}

beforeEach(() => {
  harness.calls = [];
  harness.grantedPermissions = new Set<string>();
  harness.jobRows = [];
  vi.clearAllMocks();
  vi.resetModules();
  window.history.replaceState(null, '', '/en/settings/import-export');
});

afterEach(() => cleanup());

function hub() {
  return screen.getByTestId('settings-import-export-screen');
}

describe('SET-029 real-data loader wiring (no injection-only placeholder default)', () => {
  it('queries the org-scoped capability registry + import_export_jobs via withOrgContext and renders real entities/jobs', async () => {
    harness.grantedPermissions = new Set(['settings.org.read', 'settings.authorization.view']);
    harness.jobRows = [
      {
        id: 'job-1',
        kind: 'export',
        target: 'users',
        status: 'completed',
        progress_processed: 42,
        progress_total: 42,
        metadata: { filters: {} },
      },
      {
        id: 'job-2',
        kind: 'import',
        target: 'authorization_policies',
        status: 'failed',
        progress_processed: 0,
        progress_total: 0,
        metadata: { auditReason: 'SoD migration' },
      },
    ];

    const Page = await loadPage();
    render(<>{await Page({ params: Promise.resolve({ locale: 'en' }) })}</>);

    // RBAC registry query ran (capabilities.ts resolves permissions via role_permissions).
    expect(
      harness.calls.some((c) => c.sql.toLowerCase().includes('role_permissions')),
      'loader must resolve capabilities through the org-scoped RBAC registry',
    ).toBe(true);

    // Recent jobs were read from the real table, org-scoped.
    const jobsCall = harness.calls.find((c) => c.sql.toLowerCase().includes('from public.import_export_jobs'));
    expect(jobsCall, 'loader must query public.import_export_jobs for recent jobs').toBeTruthy();
    expect(jobsCall?.sql).toContain('app.current_org_id()');

    // Real job rows render (not the placeholder, not demo IDs).
    const jobsTable = within(hub()).getByRole('table', { name: /recent import and export jobs/i });
    expect(jobsTable).toHaveTextContent('job-1');
    expect(jobsTable).toHaveTextContent('job-2');
    expect(jobsTable).toHaveTextContent('SoD migration');

    // The old injection-only placeholder copy must be gone.
    expect(hub()).not.toHaveTextContent(/live loader not configured|placeholder unavailable/i);
    // A real entity selector exists (capabilities produced visible entities).
    expect(within(hub()).getByRole('combobox', { name: /settings entity/i })).toBeInTheDocument();
  });

  it('renders the empty state (no entities, no jobs) when the caller holds no import/export permissions — no rows leaked', async () => {
    harness.grantedPermissions = new Set<string>();
    harness.jobRows = [
      { id: 'job-9', kind: 'export', target: 'users', status: 'completed', progress_processed: 1, progress_total: 1, metadata: null },
    ];

    const Page = await loadPage();
    render(<>{await Page({ params: Promise.resolve({ locale: 'en' }) })}</>);

    // No capability is supported → no visible entities → permission-denied placeholder.
    expect(within(hub()).queryByRole('combobox', { name: /settings entity/i })).not.toBeInTheDocument();
    expect(within(hub()).getByRole('status')).toBeInTheDocument();
    expect(hub()).not.toHaveTextContent(/live loader not configured/i);
  });

  it('surfaces the error state when the capability registry fails (persistence_failed)', async () => {
    // capabilities.ts wraps withOrgContext in try/catch → ok:false; the loader
    // propagates that as the error state. Mock the loader boundary the page imports.
    vi.doMock('../../../../../../actions/import-export/load-import-export', () => ({
      loadImportExportData: vi.fn(async () => ({ ok: false as const, state: 'error' as const })),
    }));

    const Page = await loadPage();
    render(<>{await Page({ params: Promise.resolve({ locale: 'en' }) })}</>);

    expect(within(hub()).getByRole('status')).toHaveTextContent(/unable to load import\/export configuration/i);

    vi.doUnmock('../../../../../../actions/import-export/load-import-export');
  });
});
