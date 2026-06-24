/**
 * @vitest-environment jsdom
 * T-079 / SET-013 — Audit log viewer RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/audit-log-full.jsx:54-251.
 * RED scope: tests only; missing production page falls back to an empty placeholder
 * so failures report the required UI/query behavior instead of module-resolution noise.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  cachedUserPromise: undefined as Promise<unknown> | undefined,
  topbarCalls: [] as Array<Record<string, unknown>>,
  sidebarCalls: [] as Array<Record<string, unknown>>,
  loadAuditCallerAccess: vi.fn(),
  queryPartitionAwareAuditLog: vi.fn(),
}));

// Mock the real-data loader so the production fallback path (no injected props)
// is observable: the page MUST resolve callerAccess + run the partition-aware
// query through these real entry points — never a forbidden-by-default sentinel
// or an empty fallback loader.
vi.mock('./audit-log-loader', () => ({
  loadAuditCallerAccess: mocks.loadAuditCallerAccess,
  queryPartitionAwareAuditLog: mocks.queryPartitionAwareAuditLog,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  usePathname: () => '/en/settings/audit',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('../../../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createCachedServerSupabaseClient: mocks.createServerSupabaseClient,
  getCachedUser: async () => {
    mocks.cachedUserPromise ??= Promise.resolve()
      .then(() => mocks.createServerSupabaseClient())
      .then((supabase) => supabase.auth.getUser());
    return mocks.cachedUserPromise;
  },
}));

vi.mock('../../../../../../components/shell/app-topbar', () => ({
  AppTopbar: async (props: Record<string, unknown>) => {
    mocks.topbarCalls.push(props);
    return (
      <header data-testid="app-topbar" data-locale={String(props.locale)} role="banner">
        Mock topbar
      </header>
    );
  },
}));

vi.mock('../../../../../../components/shell/app-sidebar', () => ({
  AppSidebar: (props: Record<string, unknown>) => {
    mocks.sidebarCalls.push(props);
    return (
      <aside data-testid="app-sidebar" data-locale={String(props.locale)} role="navigation">
        Mock sidebar
      </aside>
    );
  },
}));

type AuditAction = 'insert' | 'update' | 'delete' | 'schema_migrate' | 'rule_deploy' | 'tenant_variation_apply';

type AuditChange = {
  field: string;
  before: unknown;
  after: unknown;
};

type AuditLogEntry = {
  id: string;
  occurredAt: string;
  userName: string;
  userEmail?: string;
  action: AuditAction;
  tableName: string;
  recordId: string;
  changes: AuditChange[];
  ipAddress?: string | null;
  impersonating?: boolean;
};

type CallerAccess = {
  orgId: string;
  requestedOrgId: string;
  orgName: string;
  permissions: string[];
  roleCodes: string[];
};

type AuditQueryInput = {
  orgId: string;
  requestedOrgId: string;
  datePreset: 'today' | '7d' | '30d' | '90d' | 'custom';
  from: string;
  to: string;
  page: number;
  pageSize: number;
  user: string | 'all';
  action: AuditAction | 'all';
  tableContains: string;
  search: string;
};

type AuditQueryResult = {
  entries: AuditLogEntry[];
  totalCount: number;
  scannedPartitions: string[];
  explainText: string;
};

type AuditLogViewerProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  entries?: AuditLogEntry[];
  callerAccess?: CallerAccess;
  now?: string;
  pageSize?: number;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  queryAuditLog?: (input: AuditQueryInput) => Promise<AuditQueryResult>;
};

type AuditLogViewerPage = (props: AuditLogViewerProps) => React.ReactNode | Promise<React.ReactNode>;
type AppRouteGroupLayout = (props: {
  children: React.ReactNode;
  params: Promise<{ locale: 'en' | 'pl' | 'uk' | 'ro' }>;
}) => React.ReactNode | Promise<React.ReactNode>;

const auditReader: CallerAccess = {
  orgId: 'org-apex',
  requestedOrgId: 'org-apex',
  orgName: 'Apex Foods Sp. z o.o.',
  permissions: ['settings.audit.read'],
  roleCodes: ['settings_admin'],
};

const crossTenantReaderWithoutImpersonation: CallerAccess = {
  ...auditReader,
  requestedOrgId: 'org-other',
  permissions: ['settings.audit.read'],
  roleCodes: ['settings_admin'],
};

const roleNamedLikePermissionButNotGranted: CallerAccess = {
  ...auditReader,
  permissions: [],
  roleCodes: ['settings.audit.read', 'owner'],
};

const baseRows: AuditLogEntry[] = Array.from({ length: 52 }, (_, index) => ({
  id: `audit-${String(index + 1).padStart(3, '0')}`,
  occurredAt: index < 50 ? `2026-05-${String(24 - (index % 7)).padStart(2, '0')} 10:${String(index).padStart(2, '0')}` : '2026-04-15 09:00',
  userName: index % 2 === 0 ? 'Alicja Nowak' : 'Bogdan Ionescu',
  userEmail: index % 2 === 0 ? 'alicja@example.test' : 'bogdan@example.test',
  action: index % 5 === 0 ? 'insert' : index % 5 === 1 ? 'update' : index % 5 === 2 ? 'delete' : index % 5 === 3 ? 'schema_migrate' : 'rule_deploy',
  tableName: index % 3 === 0 ? 'role_permissions' : index % 3 === 1 ? 'org_security_policies' : 'rules_registry',
  recordId: `rec-${index + 1}`,
  changes: [
    { field: 'enabled', before: false, after: true },
    { field: 'updated_by', before: null, after: index % 2 === 0 ? 'Alicja Nowak' : 'Bogdan Ionescu' },
  ],
  ipAddress: index % 4 === 0 ? '192.168.1.42' : null,
  impersonating: index === 3,
}));

function setAuthenticatedShellUser() {
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'set-013-user',
        email: 'set-013@example.test',
        user_metadata: {
          name: 'SET-013 Tester',
          org_id: 'org-apex',
          org_name: 'Apex Foods Sp. z o.o.',
        },
      },
    },
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
}

async function loadAuditLogViewerPage(): Promise<AuditLogViewerPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = (await import(/* @vite-ignore */ pageModulePath)) as { default?: AuditLogViewerPage };
    expect(
      mod.default,
      'SET-013 audit log viewer must default-export a renderable Server Component at app/[locale]/(app)/(admin)/settings/audit/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as AuditLogViewerPage;
  } catch {
    return function MissingAuditLogViewerPage() {
      return <main data-testid="missing-audit-log-viewer-page" />;
    };
  }
}

async function loadAppRouteGroupLayout(): Promise<AppRouteGroupLayout> {
  const layoutModulePath = '../../../layout';
  const mod = (await import(/* @vite-ignore */ layoutModulePath)) as { default?: AppRouteGroupLayout };
  expect(mod.default, '/en/settings/audit must render through app/[locale]/(app)/layout.tsx').toEqual(
    expect.any(Function),
  );
  return mod.default as AppRouteGroupLayout;
}

async function renderAuditLogViewer(overrides: Partial<AuditLogViewerProps> = {}) {
  const Page = await loadAuditLogViewerPage();
  const node = await Page({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    entries: baseRows,
    callerAccess: auditReader,
    now: '2026-05-24T12:00:00.000Z',
    pageSize: 50,
    state: 'ready',
    ...overrides,
  });
  return render(<>{node}</>);
}

async function renderAuditLogRouteThroughAppShell(overrides: Partial<AuditLogViewerProps> = {}) {
  const Page = await loadAuditLogViewerPage();
  const Layout = await loadAppRouteGroupLayout();
  const pageNode = await Page({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    entries: baseRows,
    callerAccess: auditReader,
    now: '2026-05-24T12:00:00.000Z',
    pageSize: 50,
    state: 'ready',
    ...overrides,
  });
  const shellNode = await Layout({ children: pageNode, params: Promise.resolve({ locale: 'en' }) });
  return render(<>{shellNode}</>);
}

function auditRoot() {
  return screen.getByTestId('settings-audit-log-viewer-screen');
}

function auditTable() {
  return screen.getByRole('table', { name: /settings audit log/i });
}

describe('SET-013 audit log viewer prototype parity and partition-aware query', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.topbarCalls.length = 0;
    mocks.sidebarCalls.length = 0;
    mocks.cachedUserPromise = undefined;
    setAuthenticatedShellUser();
    window.history.replaceState(null, '', '/en/settings/audit');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders /en/settings/audit inside the localized AppShell with the prototype filter bar, org notice, table, and pagination structure', async () => {
    const { container } = await renderAuditLogRouteThroughAppShell();

    expect(mocks.createServerSupabaseClient, 'AppShell route evidence must authenticate before rendering settings').toHaveBeenCalledTimes(1);
    expect(mocks.getUser, 'AppShell route evidence must call auth.getUser before shell render').toHaveBeenCalledTimes(1);
    expect(mocks.topbarCalls).toEqual([expect.objectContaining({ locale: 'en' })]);
    expect(mocks.sidebarCalls).toEqual([expect.objectContaining({ locale: 'en' })]);
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('app-topbar')).toHaveAttribute('role', 'banner');
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('role', 'navigation');

    const main = screen.getByTestId('app-shell-main');
    expect(within(main).getByRole('heading', { name: /^Audit logs$/i })).toBeInTheDocument();
    expect(within(main).getByText(/partitioned monthly, retained 7 years/i)).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: /export filtered results/i })).toHaveAttribute('data-slot', 'button');
    expect(within(main).getByText(/Showing entries for/i)).toHaveTextContent(/Apex Foods Sp\. z o\.o\./i);
    expect(within(main).getByText(/impersonate\.tenant/i)).toBeInTheDocument();

    const filterRegion = within(main).getByRole('region', { name: /audit filters/i });
    expect(within(filterRegion).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'Today',
      'Last 7d',
      'Last 30d',
      'Last 90d',
      'Custom',
      'Reset',
    ]);
    expect(within(filterRegion).getByRole('combobox', { name: /user/i })).toHaveAttribute('data-slot', 'select-trigger');
    expect(within(filterRegion).getByRole('combobox', { name: /action/i })).toHaveAttribute('data-slot', 'select-trigger');
    expect(within(filterRegion).getByRole('textbox', { name: /table contains/i })).toHaveClass('font-mono');
    expect(within(filterRegion).getByRole('textbox', { name: /search field values/i })).toBeInTheDocument();
    expect(within(filterRegion).getByText(/~1 partition will be scanned/i)).toBeInTheDocument();

    const table = within(main).getByRole('table', { name: /settings audit log/i });
    expect(table).toHaveAttribute('data-slot', 'table');
    for (const header of ['Timestamp', 'User', 'Action', 'Table', 'Record ID', 'Changed fields', 'IP']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(within(main).getByText(/Page 1 of 2 · 50 rows per page/i)).toBeInTheDocument();
    expect(within(table).getAllByText('org_security_policies').length).toBeGreaterThan(0);
    expect(within(table).getByText('rec-50')).toBeInTheDocument();
    expect(within(main).getByRole('button', { name: /prev/i })).toBeDisabled();
    expect(within(main).getByRole('button', { name: /next/i })).toBeEnabled();
    expect(container.querySelector('[data-testid="missing-audit-log-viewer-page"]')).toBeNull();
  });

  it('filters by table/search terms, expands a row diff panel, and preserves the prototype keyboard focus order', async () => {
    const user = userEvent.setup();
    await renderAuditLogViewer();

    await user.type(screen.getByRole('textbox', { name: /table contains/i }), 'role_permissions');
    const filteredRows = within(auditTable()).getAllByRole('row').slice(1);
    expect(filteredRows.length).toBeGreaterThan(0);
    for (const row of filteredRows) {
      expect(row).toHaveTextContent(/role_permissions/i);
    }

    const firstDataRow = filteredRows[0];
    await user.click(firstDataRow);
    const diffPanel = screen.getByRole('region', { name: /field-level diff/i });
    expect(within(diffPanel).getByText('enabled')).toBeInTheDocument();
    expect(within(diffPanel).getByText(/before/i)).toBeInTheDocument();
    expect(within(diffPanel).getByText(/after/i)).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: /table contains/i }));
    await user.type(screen.getByRole('textbox', { name: /search field values/i }), 'no-such-audit-value');
    expect(screen.getByText(/No audit log entries for selected filters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset filters/i })).toHaveAttribute('data-slot', 'button');

    await user.click(screen.getByRole('button', { name: /reset filters/i }));
    await user.tab();
    expect(screen.getByRole('button', { name: /export filtered results/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /^Today$/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Last 7d/i })).toHaveFocus();
  });

  it('fails closed with neutral provenance when no live caller access is injected', async () => {
    const Page = await loadAuditLogViewerPage();
    const node = await Page({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) });
    render(<>{node}</>);

    expect(screen.getByRole('heading', { name: /403|forbidden|access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/settings\.audit\.read/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Apex Foods|org-apex/i);
    expect(screen.queryByTestId('settings-audit-log-viewer-screen')).not.toBeInTheDocument();
  });

  it('returns 403 for cross-org requests without impersonate.tenant and for role-code-only permission spoofing', async () => {
    await renderAuditLogViewer({ callerAccess: crossTenantReaderWithoutImpersonation });

    expect(screen.getByRole('heading', { name: /403|forbidden|access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/impersonate\.tenant/i)).toBeInTheDocument();
    expect(screen.getByText(/org_id/i)).toBeInTheDocument();
    expect(screen.queryByTestId('settings-audit-log-viewer-screen')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /settings audit log/i })).not.toBeInTheDocument();
    cleanup();

    await renderAuditLogViewer({ callerAccess: roleNamedLikePermissionButNotGranted });
    expect(screen.getByRole('heading', { name: /403|forbidden|access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/settings\.audit\.read/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /settings audit log/i })).not.toBeInTheDocument();
  });

  it('uses a last-7-days partition-aware query contract and exposes EXPLAIN evidence for 1-2 scanned monthly partitions', async () => {
    const queryAuditLog = vi.fn(async (input: AuditQueryInput): Promise<AuditQueryResult> => {
      expect(input).toEqual(
        expect.objectContaining({
          orgId: 'org-apex',
          requestedOrgId: 'org-apex',
          datePreset: '7d',
          from: '2026-05-17',
          to: '2026-05-24',
          page: 1,
          pageSize: 50,
          user: 'all',
          action: 'all',
        }),
      );
      return {
        entries: baseRows.slice(0, 2),
        totalCount: 2,
        scannedPartitions: ['audit_log_2026_05'],
        explainText: 'Append on audit_log  ->  Seq Scan on audit_log_2026_05',
      };
    });

    await renderAuditLogViewer({ entries: undefined, queryAuditLog });

    expect(queryAuditLog, 'page must query through the partition-aware audit loader, not hard-coded prototype data').toHaveBeenCalledTimes(1);
    expect(screen.getByText(/EXPLAIN verified/i)).toBeInTheDocument();
    expect(screen.getByText(/1 partition will be scanned/i)).toBeInTheDocument();
    expect(screen.queryByText(/audit_log_2026_04/i)).not.toBeInTheDocument();
  });

  it('captures a compact RTL parity snapshot of the ready-state audit viewer contract', async () => {
    const { container } = await renderAuditLogViewer();
    const root = container.querySelector('main, [data-screen="settings-audit-log-viewer"]');
    expect(root, 'ready-state snapshot must cover the audit log viewer root').not.toBeNull();
    expect(
      Array.from(root!.querySelectorAll('h1,h2,button,th,td,[data-slot="badge"],[role="alert"]'))
        .map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 45),
    ).toMatchInlineSnapshot(`
      [
        "Audit logs",
        "Export filtered results",
        "Showing entries for Apex Foods Sp. z o.o. (your org). Cross-tenant viewing requires impersonate.tenant — not granted to your role.",
        "Today",
        "Last 7d",
        "Last 30d",
        "Last 90d",
        "Custom",
        "All users⌄",
        "All actions⌄",
        "Reset",
        "Activity (50 entries)",
        "Timestamp",
        "User",
        "Action",
        "Table",
        "Record ID",
        "Changed fields",
        "IP",
        "▸",
        "2026-05-24 10:49",
        "Bogdan Ionescubogdan@example.test",
        "rule_deploy",
        "rule_deploy",
        "org_security_policies",
        "rec-50",
        "enabledupdated_by",
        "enabled",
        "updated_by",
        "—",
        "▸",
        "2026-05-24 10:42",
        "Alicja Nowakalicja@example.test",
        "delete",
        "delete",
        "role_permissions",
        "rec-43",
        "enabledupdated_by",
        "enabled",
        "updated_by",
        "—",
        "▸",
        "2026-05-24 10:35",
        "Bogdan Ionescubogdan@example.test",
        "insert",
      ]
    `);
  });
});

describe('SET-013 audit log viewer real-data wiring (no forbidden-by-default, no empty fallback)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.topbarCalls.length = 0;
    mocks.sidebarCalls.length = 0;
    mocks.cachedUserPromise = undefined;
    setAuthenticatedShellUser();
    window.history.replaceState(null, '', '/en/settings/audit');
  });

  afterEach(() => {
    cleanup();
  });

  it('resolves real caller access via loadAuditCallerAccess and runs the live partition-aware query when no props are injected', async () => {
    mocks.loadAuditCallerAccess.mockResolvedValue({
      orgId: 'org-apex',
      requestedOrgId: 'org-apex',
      orgName: 'Apex Foods Sp. z o.o.',
      permissions: ['settings.audit.read'],
      roleCodes: ['settings_admin'],
    });
    mocks.queryPartitionAwareAuditLog.mockResolvedValue({
      entries: baseRows.slice(0, 3),
      totalCount: 3,
      scannedPartitions: ['audit_log_2026_05'],
      explainText: 'Append on audit_log  ->  Index Scan on audit_log_2026_05',
    });

    const Page = await loadAuditLogViewerPage();
    // No callerAccess, no entries, no queryAuditLog injected → production path.
    // `now` pins the 7d window to the seeded rows' month so they pass the client filter.
    const node = await Page({ params: Promise.resolve({ locale: 'en' }), now: '2026-05-24T12:00:00.000Z' });
    render(<>{node}</>);

    // Real caller-access resolver was used (not a forbidden-by-default sentinel).
    expect(
      mocks.loadAuditCallerAccess,
      'page must populate callerAccess from the real withOrgContext loader, not DEFAULT_CALLER_ACCESS with permissions: []',
    ).toHaveBeenCalledTimes(1);

    // Real partition-aware query was used (not the deleted empty fallback loader).
    expect(
      mocks.queryPartitionAwareAuditLog,
      'page must query public.audit_log through queryPartitionAwareAuditLog, not an empty fallback',
    ).toHaveBeenCalledTimes(1);
    expect(mocks.queryPartitionAwareAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-apex',
        requestedOrgId: 'org-apex',
        datePreset: '7d',
        page: 1,
        pageSize: 50,
        user: 'all',
        action: 'all',
      }),
    );

    // Authorized caller renders the live screen — NOT a 403, NOT an empty placeholder.
    expect(screen.getByTestId('settings-audit-log-viewer-screen')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /403|forbidden|access denied/i })).toBeNull();
    expect(screen.getByRole('table', { name: /settings audit log/i })).toBeInTheDocument();
    // Honest partition-scan evidence from the real EXPLAIN result, not a stub string.
    expect(screen.getByText(/EXPLAIN verified/i)).toBeInTheDocument();
  });

  it('fails closed to 403 when the real loader cannot resolve caller access (unauthenticated / no org row)', async () => {
    mocks.loadAuditCallerAccess.mockResolvedValue(null);

    const Page = await loadAuditLogViewerPage();
    const node = await Page({ params: Promise.resolve({ locale: 'en' }) });
    render(<>{node}</>);

    expect(mocks.loadAuditCallerAccess).toHaveBeenCalledTimes(1);
    // Query must NOT run for an unresolved caller.
    expect(mocks.queryPartitionAwareAuditLog).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /403|forbidden|access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/settings\.audit\.read/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Apex Foods/i);
  });

  it('denies a genuinely unauthorized caller (resolved org context but missing settings.audit.read) without running the query', async () => {
    mocks.loadAuditCallerAccess.mockResolvedValue({
      orgId: 'org-apex',
      requestedOrgId: 'org-apex',
      orgName: 'Apex Foods Sp. z o.o.',
      permissions: ['settings.users.manage'],
      roleCodes: ['module_admin'],
    });

    const Page = await loadAuditLogViewerPage();
    const node = await Page({ params: Promise.resolve({ locale: 'en' }) });
    render(<>{node}</>);

    expect(mocks.loadAuditCallerAccess).toHaveBeenCalledTimes(1);
    expect(mocks.queryPartitionAwareAuditLog).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /403|forbidden|access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/settings\.audit\.read/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /settings audit log/i })).not.toBeInTheDocument();
  });
});
