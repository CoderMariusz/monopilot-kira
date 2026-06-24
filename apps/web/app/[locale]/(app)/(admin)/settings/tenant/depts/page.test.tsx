/**
 * @vitest-environment jsdom
 * T-101 / SET-061 — Dept Taxonomy Editor.
 *
 * RED phase: page-level RTL tests for prototypes/design/02-SETTINGS-UX.md
 * SET-061. A missing production page renders an empty placeholder so RED fails
 * on behavior assertions, not module-resolution noise.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ShellComponentCall = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createServerSupabaseClient: vi.fn(),
  getUser: vi.fn(),
  cachedUserPromise: undefined as Promise<unknown> | undefined,
  topbarCalls: [] as ShellComponentCall[],
  sidebarCalls: [] as ShellComponentCall[],
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  usePathname: () => '/en/settings/tenant/depts',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../../../../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createCachedServerSupabaseClient: mocks.createServerSupabaseClient,
  getCachedUser: async () => {
    mocks.cachedUserPromise ??= Promise.resolve()
      .then(() => mocks.createServerSupabaseClient())
      .then((supabase) => supabase.auth.getUser());
    return mocks.cachedUserPromise;
  },
}));

vi.mock('../../../../../../../components/shell/app-topbar', () => ({
  AppTopbar: async (props: ShellComponentCall) => {
    mocks.topbarCalls.push(props);
    return (
      <header data-testid="app-topbar" data-locale={String(props.locale)} role="banner">
        Mock topbar
      </header>
    );
  },
}));

vi.mock('../../../../../../../components/shell/app-sidebar', () => ({
  AppSidebar: (props: ShellComponentCall) => {
    mocks.sidebarCalls.push(props);
    return (
      <aside data-testid="app-sidebar" data-locale={String(props.locale)} role="navigation">
        Mock sidebar
      </aside>
    );
  },
}));

type Department = {
  code: string;
  name: string;
  assignedColumnCount: number;
  order: number;
  provenance: 'baseline' | 'tenant_variations.dept_overrides';
};

type SourceColumn = {
  code: string;
  label: string;
  departmentCode: string;
};

type DeptOverridePayload =
  | {
      action: 'split';
      source: string;
      targets: string[];
      columnMapping: Record<string, string>;
    }
  | {
      action: 'merge';
      sources: string[];
      target: string;
    }
  | {
      action: 'add';
      code: string;
      namePl: string;
      nameEn: string;
      displayOrder: number;
    };

type DeptTaxonomyPageProps = {
  params?: Promise<{ locale: string }>;
  departments: Department[];
  sourceColumns: SourceColumn[];
  selectedDeptCode?: string;
  canEdit: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
  submitDeptOverride: ReturnType<typeof vi.fn>;
};

type DeptTaxonomyPage = (props: DeptTaxonomyPageProps) => React.ReactNode | Promise<React.ReactNode>;

type AppRouteGroupLayout = (props: {
  children: React.ReactNode;
  params: Promise<{ locale: 'en' | 'pl' | 'uk' | 'ro' }>;
}) => React.ReactNode | Promise<React.ReactNode>;

const baselineDepartments: Department[] = [
  { code: 'core', name: 'Core', assignedColumnCount: 12, order: 10, provenance: 'baseline' },
  { code: 'technical', name: 'Technical', assignedColumnCount: 3, order: 20, provenance: 'baseline' },
  { code: 'packaging', name: 'Packaging', assignedColumnCount: 5, order: 30, provenance: 'baseline' },
  { code: 'mrp', name: 'MRP', assignedColumnCount: 8, order: 40, provenance: 'baseline' },
  { code: 'planning', name: 'Planning', assignedColumnCount: 9, order: 50, provenance: 'baseline' },
  { code: 'production', name: 'Production', assignedColumnCount: 14, order: 60, provenance: 'baseline' },
  { code: 'price', name: 'Price', assignedColumnCount: 2, order: 70, provenance: 'baseline' },
  {
    code: 'regulatory-affairs',
    name: 'Regulatory Affairs',
    assignedColumnCount: 0,
    order: 80,
    provenance: 'tenant_variations.dept_overrides',
  },
];

const sourceColumns: SourceColumn[] = [
  { code: 'tech.allergen_statement', label: 'Allergen statement', departmentCode: 'technical' },
  { code: 'tech.lab_release_rule', label: 'Lab release rule', departmentCode: 'technical' },
  { code: 'tech.food_safety_owner', label: 'Food safety owner', departmentCode: 'technical' },
];

const pagePath = join(__dirname, 'page.tsx');
const clientPath = join(__dirname, 'dept-taxonomy-screen.client.tsx');
const appLayoutPath = join(__dirname, '../../../..', 'layout.tsx');

function setAuthenticatedShellUser() {
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'set-061-user',
        email: 'set-061@example.test',
        user_metadata: {
          name: 'SET-061 Tester',
          org_id: 'org-set-061',
          org_name: 'SET-061 Org',
        },
      },
    },
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
}

async function loadAppRouteGroupLayout(): Promise<AppRouteGroupLayout> {
  const mod = (await import(/* @vite-ignore */ appLayoutPath)) as { default?: AppRouteGroupLayout };
  expect(mod.default, '/en/settings/tenant/depts must be rendered through app/[locale]/(app)/layout.tsx at runtime').toEqual(
    expect.any(Function),
  );
  return mod.default as AppRouteGroupLayout;
}

async function renderDeptTaxonomyRouteThroughAppShell(overrides: Partial<DeptTaxonomyPageProps> = {}) {
  const Page = await loadDeptTaxonomyPage();
  const Layout = await loadAppRouteGroupLayout();
  const pageNode = await Page({
    params: Promise.resolve({ locale: 'en' }),
    departments: baselineDepartments,
    sourceColumns,
    selectedDeptCode: 'technical',
    canEdit: true,
    state: 'ready',
    submitDeptOverride: vi.fn(async (payload: DeptOverridePayload) => ({
      ok: true as const,
      data: { storage: 'tenant_variations.dept_overrides', deptOverrides: { actions: { [payload.action]: payload } } },
    })),
    ...overrides,
  });
  const shellNode = await Layout({ children: pageNode, params: Promise.resolve({ locale: 'en' }) });
  return render(React.createElement(React.Fragment, null, shellNode));
}

async function loadDeptTaxonomyPage(): Promise<DeptTaxonomyPage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-061 dept taxonomy page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as DeptTaxonomyPage;
  } catch {
    return function MissingDeptTaxonomyPage() {
      return React.createElement('main', { 'data-testid': 'missing-dept-taxonomy-page' });
    };
  }
}

async function renderDeptTaxonomyPage(overrides: Partial<DeptTaxonomyPageProps> = {}) {
  const Page = await loadDeptTaxonomyPage();
  const props: DeptTaxonomyPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    departments: baselineDepartments,
    sourceColumns,
    selectedDeptCode: 'technical',
    canEdit: true,
    state: 'ready',
    submitDeptOverride: vi.fn(async (payload: DeptOverridePayload) => ({
      ok: true as const,
      data: {
        storage: 'tenant_variations.dept_overrides',
        deptOverrides: { actions: { [payload.action]: payload } },
      },
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

describe('SET-061 dept taxonomy editor UX route and structure', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.topbarCalls.length = 0;
    mocks.sidebarCalls.length = 0;
    mocks.cachedUserPromise = undefined;
    setAuthenticatedShellUser();
  });

  it('keeps the App Router page server-rendered and moves stateful wizard behavior into the client boundary', () => {
    const pageSource = readFileSync(pagePath, 'utf8');
    const clientSource = readFileSync(clientPath, 'utf8');

    expect(pageSource).not.toMatch(/^['"]use client['"]/m);
    expect(pageSource).not.toContain('React.useState');
    expect(pageSource).toContain("from './dept-taxonomy-screen.client'");
    expect(clientSource).toMatch(/^['"]use client['"]/m);
    expect(clientSource).toContain('React.useState');
  });

  it('renders /en/settings/tenant/depts through the real localized AppShell layout at runtime', async () => {
    const { container } = await renderDeptTaxonomyRouteThroughAppShell();

    expect(mocks.createServerSupabaseClient, 'runtime route evidence must authenticate through the AppShell layout').toHaveBeenCalledTimes(1);
    expect(mocks.getUser, 'runtime route evidence must call auth.getUser before shell render').toHaveBeenCalledTimes(1);
    expect(mocks.topbarCalls).toEqual([expect.objectContaining({ locale: 'en' })]);
    expect(mocks.sidebarCalls).toEqual([expect.objectContaining({ locale: 'en' })]);

    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('app-topbar')).toHaveAttribute('role', 'banner');
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('role', 'navigation');
    const main = screen.getByTestId('app-shell-main');
    expect(main.tagName.toLowerCase()).toBe('main');
    expect(within(main).getByRole('heading', { name: /department taxonomy/i })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="missing-dept-taxonomy-page"]')).toBeNull();
  });

  it('renders the UX-spec Department Taxonomy screen at the AppShell route, not a PromoteToL2 modal surrogate', async () => {
    const { container } = await renderDeptTaxonomyPage();

    expect(screen.getByRole('heading', { name: /department taxonomy/i })).toBeInTheDocument();
    expect(
      screen.getByText(/customize department structure for your organization/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/dept changes affect how columns and rules are grouped/i);

    const deptPanel = screen.getByRole('region', { name: /current dept list/i });
    expect(within(deptPanel).getByRole('button', { name: /add custom dept/i })).toHaveAttribute(
      'data-slot',
      'button',
    );
    expect(within(deptPanel).getAllByTestId('dept-row').map((row) => row.textContent)).toEqual([
      expect.stringContaining('core'),
      expect.stringContaining('technical'),
      expect.stringContaining('packaging'),
      expect.stringContaining('mrp'),
      expect.stringContaining('planning'),
      expect.stringContaining('production'),
      expect.stringContaining('price'),
      expect.stringContaining('regulatory-affairs'),
    ]);
    expect(within(deptPanel).getByText(/3 assigned columns/i)).toBeInTheDocument();

    const operations = screen.getByRole('region', { name: /operations/i });
    expect(within(operations).getByRole('radio', { name: /split technical into two departments/i })).toBeChecked();
    expect(within(operations).getByLabelText(/source dept/i)).toHaveValue('technical');
    expect(within(operations).getByLabelText(/target dept 1 name/i)).toBeInTheDocument();
    expect(within(operations).getByLabelText(/target dept 1 code/i)).toBeInTheDocument();
    expect(within(operations).getByLabelText(/target dept 2 name/i)).toBeInTheDocument();
    expect(within(operations).getByLabelText(/target dept 2 code/i)).toBeInTheDocument();
    for (const column of sourceColumns) {
      expect(within(operations).getByRole('combobox', { name: new RegExp(column.label, 'i') })).toBeInTheDocument();
    }
    expect(within(operations).getByRole('radio', { name: /merge selected depts into one/i })).toBeInTheDocument();
    expect(within(operations).getByRole('radio', { name: /add new department/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('button', { name: /discard/i })).toHaveAttribute('data-slot', 'button');

    expect(screen.queryByRole('dialog', { name: /promote to l2/i })).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="promote-to-l2-modal"]')).toBeNull();
  });

  it('blocks a split technical → food-safety + quality-lab submission without complete column mapping and surfaces COLUMN_MAPPING_REQUIRED (V-SET-30)', async () => {
    const user = userEvent.setup();
    const { props } = await renderDeptTaxonomyPage();

    await user.clear(screen.getByLabelText(/target dept 1 name/i));
    await user.type(screen.getByLabelText(/target dept 1 name/i), 'Food Safety');
    await user.clear(screen.getByLabelText(/target dept 1 code/i));
    await user.type(screen.getByLabelText(/target dept 1 code/i), 'food-safety');
    await user.clear(screen.getByLabelText(/target dept 2 name/i));
    await user.type(screen.getByLabelText(/target dept 2 name/i), 'Quality Lab');
    await user.clear(screen.getByLabelText(/target dept 2 code/i));
    await user.type(screen.getByLabelText(/target dept 2 code/i), 'quality-lab');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/COLUMN_MAPPING_REQUIRED/i)).toBeInTheDocument();
    expect(screen.getByText(/V-SET-30/i)).toBeInTheDocument();
    expect(props.submitDeptOverride).not.toHaveBeenCalled();
  });

  it('submits an Add operation for regulatory-affairs to tenant_variations.dept_overrides and shows confirmation provenance', async () => {
    const user = userEvent.setup();
    const { props } = await renderDeptTaxonomyPage({
      departments: baselineDepartments.filter((dept) => dept.code !== 'regulatory-affairs'),
    });

    await user.click(screen.getByRole('radio', { name: /add new department/i }));
    await user.clear(screen.getByLabelText(/^code$/i));
    await user.type(screen.getByLabelText(/^code$/i), 'regulatory-affairs');
    await user.clear(screen.getByLabelText(/name pl/i));
    await user.type(screen.getByLabelText(/name pl/i), 'Sprawy regulacyjne');
    await user.clear(screen.getByLabelText(/name en/i));
    await user.type(screen.getByLabelText(/name en/i), 'Regulatory Affairs');
    await user.clear(screen.getByLabelText(/display order/i));
    await user.type(screen.getByLabelText(/display order/i), '80');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(props.submitDeptOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'add',
        code: 'regulatory-affairs',
        namePl: 'Sprawy regulacyjne',
        nameEn: 'Regulatory Affairs',
        displayOrder: 80,
      }),
    );
    expect(await screen.findByRole('dialog', { name: /confirm department change/i })).toHaveTextContent(
      /tenant_variations\.dept_overrides/i,
    );
  });
});
