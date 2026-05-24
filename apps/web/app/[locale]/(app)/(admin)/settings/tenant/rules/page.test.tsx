/**
 * @vitest-environment jsdom
 * T-102 / SET-062 — Rule Variant Selector RED tests.
 * Source of truth: prototypes/design/02-SETTINGS-UX.md SET-062 / rule-variant.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const withOrgContextHarness = vi.hoisted(() => ({
  handler: undefined as
    | undefined
    | ((callback: (context: unknown) => Promise<unknown> | unknown) => Promise<unknown> | unknown),
  calls: [] as Array<(context: unknown) => Promise<unknown> | unknown>,
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn((callback: (context: unknown) => Promise<unknown> | unknown) => {
    withOrgContextHarness.calls.push(callback);
    if (!withOrgContextHarness.handler) {
      throw new Error('withOrgContext harness was not configured for this test');
    }
    return withOrgContextHarness.handler(callback);
  }),
}));

type RuleVariant = {
  version: 'v1' | 'v2' | `v${number}`;
  label?: string;
  requiresNewVersion?: boolean;
  technicalApprovalRequired?: boolean;
};

type RuleVariantRow = {
  code: string;
  ruleType: 'gate' | 'workflow' | 'validation' | 'calculation';
  availableVariants: RuleVariant[];
  currentVariant: string;
  lastChangedAt: string | null;
  readOnly?: boolean;
  linkedAuthorizationPolicyHref?: string;
};

type SaveVariantOverrides = (input: {
  ruleVariantOverrides: Record<string, string>;
}) => Promise<{ ok: true } | { ok: false; code: 'VARIANT_NOT_FOUND' | 'FORBIDDEN' | string; message: string }>;

type RuleVariantSelectorProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  rules?: RuleVariantRow[];
  saveRuleVariantOverrides?: SaveVariantOverrides;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

type RuleVariantSelectorPage = (
  props: RuleVariantSelectorProps,
) => React.ReactNode | Promise<React.ReactNode>;

const variantRows: RuleVariantRow[] = [
  {
    code: 'wo_release_gate',
    ruleType: 'workflow',
    availableVariants: [
      { version: 'v1', label: 'Default workflow' },
      { version: 'v2', label: 'Extended QA hold workflow' },
    ],
    currentVariant: 'v1',
    lastChangedAt: '2026-05-20T09:00:00.000Z',
  },
  {
    code: 'technical_product_spec_approval_gate_v1',
    ruleType: 'gate',
    availableVariants: [
      {
        version: 'v1',
        label: 'Technical approval required',
        requiresNewVersion: true,
        technicalApprovalRequired: true,
      },
    ],
    currentVariant: 'v1',
    lastChangedAt: null,
    readOnly: true,
    linkedAuthorizationPolicyHref: '/en/settings/authorization?policy=technical_product_spec_approval',
  },
];

async function loadRuleVariantSelectorPage(): Promise<RuleVariantSelectorPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(
      mod.default,
      'SET-062 rule variant selector page must default-export a renderable React component at the AppShell route',
    ).toEqual(expect.any(Function));
    return mod.default as RuleVariantSelectorPage;
  } catch {
    return function MissingRuleVariantSelectorPage() {
      return React.createElement('main', { 'data-testid': 'missing-rule-variant-selector-page' });
    };
  }
}

async function renderRuleVariantSelectorPage(overrides: Partial<RuleVariantSelectorProps> = {}) {
  const Page = await loadRuleVariantSelectorPage();
  const props: RuleVariantSelectorProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    rules: variantRows,
    state: 'ready',
    saveRuleVariantOverrides: vi.fn(async () => ({ ok: true as const })) as SaveVariantOverrides,
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function selectorRoot() {
  return screen.getByTestId('settings-rule-variant-selector-screen');
}

function selectorTable() {
  return screen.getByRole('table', { name: /rule variant selections/i });
}

function rowFor(ruleCode: string) {
  return within(selectorTable())
    .getAllByRole('row')
    .find((row) => within(row).queryByText(ruleCode));
}

function forbidRuleVariantDomIdLookup() {
  const originalGetElementById = document.getElementById.bind(document);
  return vi.spyOn(document, 'getElementById').mockImplementation((id: string) => originalGetElementById(id));
}



type MockQueryCall = {
  sql: string;
  params?: readonly unknown[];
};

const orgContextIds = {
  userId: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
};

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

async function renderRuleVariantSelectorPageWithLiveOrgContext({
  deniedPermissions = [],
}: {
  deniedPermissions?: string[];
} = {}) {
  const queryCalls: MockQueryCall[] = [];
  const denied = new Set(deniedPermissions);
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    queryCalls.push({ sql: normalizeSql(sql), params });
    if (sql.includes('from public.user_roles')) {
      const permission = params?.[2];
      return denied.has(String(permission)) ? { rows: [], rowCount: 0 } : { rows: [{ ok: true }], rowCount: 1 };
    }
    if (sql.includes('from public.rule_definitions') && sql.includes('order by rule_code')) {
      return {
        rows: [
          { rule_code: 'wo_release_gate', rule_type: 'workflow', version: 1, active_to: null },
          { rule_code: 'wo_release_gate', rule_type: 'workflow', version: 2, active_to: null },
        ],
        rowCount: 2,
      };
    }
    if (sql.includes('from public.tenant_variations') && sql.includes('select rule_variant_overrides')) {
      return { rows: [{ rule_variant_overrides: { wo_release_gate: 'v1' } }], rowCount: 1 };
    }
    if (sql.includes('from public.rule_definitions') && sql.includes('rule_code = $1') && sql.includes('version = $2')) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }
    if (sql.includes('update public.tenant_variations')) {
      return { rows: [{ rule_variant_overrides: { wo_release_gate: 'v2' } }], rowCount: 1 };
    }
    if (sql.includes('insert into public.audit_log')) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query in tenant rules RBAC test: ${normalizeSql(sql)}`);
  });
  withOrgContextHarness.calls = [];
  withOrgContextHarness.handler = async (callback) => callback({ ...orgContextIds, client: { query } });

  const pageModulePath: string = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  const Page = (mod as unknown as { default: RuleVariantSelectorPage }).default;
  const node = await Page({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) });
  const rendered = render(React.createElement(React.Fragment, null, node));
  return { ...rendered, withOrgContextCalls: withOrgContextHarness.calls, query, queryCalls };
}
function expectNoRuleVariantDomIdLookup(domLookup: ReturnType<typeof forbidRuleVariantDomIdLookup>) {
  expect(
    domLookup,
    'Tenant rules feedback must be rendered from React state/action results, not document.getElementById().',
  ).not.toHaveBeenCalledWith(expect.stringMatching(/^rule-variant-selector-/));
}

describe('SET-062 rule variant selector UX contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withOrgContextHarness.handler = undefined;
    withOrgContextHarness.calls = [];
    window.history.replaceState(null, '', '/en/settings/tenant/rules');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the server component/action source free of browser globals used for feedback', () => {
    const source = readFileSync('app/[locale]/(app)/(admin)/settings/tenant/rules/page.tsx', 'utf8');

    expect(
      source,
      'Server Components and Server Actions must not branch on or access browser globals; feedback belongs in a client state/useActionState island.',
    ).not.toMatch(/\b(?:typeof\s+)?(?:document|window)\b/);
  });

  it('renders the spec-driven AppShell page regions, blue advisory, variant table, and read-only technical approval gate link', async () => {
    await renderRuleVariantSelectorPage();

    const root = selectorRoot();
    expect(root).toHaveAttribute('data-route', '/settings/tenant/rules');
    expect(root).toHaveAttribute('data-screen', 'rule-variant-selector');
    expect(root).toHaveAttribute('data-ux-source', 'SET-062');
    expect(screen.getByRole('heading', { name: /^Rule Variant Selection$/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Some rules have multiple versions\. Select the variant that applies to your organization\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Rule variants are tested configurations\. Contact your implementation team before switching from the default\./i,
    );

    expect(
      within(selectorTable()).getAllByRole('columnheader').map((header) => header.textContent?.trim()),
    ).toEqual(['Rule Code', 'Rule Type', 'Available Variants', 'Current Selection', 'Last Changed']);

    const workflowRow = rowFor('wo_release_gate');
    expect(workflowRow, 'tenant rule rows must render live Server Component data, not the RulesRegistryScreen').toBeTruthy();
    expect(within(workflowRow!).getByRole('radio', { name: /wo_release_gate v1/i })).toBeChecked();
    expect(within(workflowRow!).getByRole('radio', { name: /wo_release_gate v2/i })).not.toBeChecked();

    const technicalGateRow = rowFor('technical_product_spec_approval_gate_v1');
    expect(technicalGateRow).toBeTruthy();
    expect(within(technicalGateRow!).getByText(/read-only gate/i)).toBeInTheDocument();
    expect(within(technicalGateRow!).getByText(/requires_new_version/i)).toBeInTheDocument();
    expect(within(technicalGateRow!).getByText(/technical approval required/i)).toBeInTheDocument();
    expect(within(technicalGateRow!).getByRole('link', { name: /authorization policies/i })).toHaveAttribute(
      'href',
      '/en/settings/authorization?policy=technical_product_spec_approval',
    );
    for (const radio of within(technicalGateRow!).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }

    expect(screen.getByRole('button', { name: /Save All Selections/i })).toBeEnabled();
    expect(root.querySelector('[data-testid="settings-rules-registry-screen"]')).not.toBeInTheDocument();
  });

  it("batches radio changes only on Save All Selections and persists tenant_variations.rule_variant_overrides[rule_code]='v2'", async () => {
    const user = userEvent.setup();
    const saveRuleVariantOverrides = vi.fn(async () => ({ ok: true as const }));
    await renderRuleVariantSelectorPage({ saveRuleVariantOverrides });

    await user.click(screen.getByRole('radio', { name: /wo_release_gate v2/i }));
    expect(saveRuleVariantOverrides).not.toHaveBeenCalled();

    const domLookup = forbidRuleVariantDomIdLookup();
    await user.click(screen.getByRole('button', { name: /Save All Selections/i }));
    await waitFor(() => expect(saveRuleVariantOverrides).toHaveBeenCalledTimes(1));
    expectNoRuleVariantDomIdLookup(domLookup);
    expect(saveRuleVariantOverrides).toHaveBeenCalledWith({
      ruleVariantOverrides: {
        wo_release_gate: 'v2',
      },
    });
    expect(screen.getByText(/Rule variant selections saved/i)).toBeInTheDocument();
  });

  it('surfaces VARIANT_NOT_FOUND (V-SET-31) when a non-existent version is forced through URL state and the action rejects it', async () => {
    const user = userEvent.setup();
    const saveRuleVariantOverrides = vi.fn(async () => ({
      ok: false as const,
      code: 'VARIANT_NOT_FOUND' as const,
      message: 'V-SET-31: variant must reference an existing rule_definitions.version',
    }));

    await renderRuleVariantSelectorPage({
      searchParams: Promise.resolve({ rule_code: 'wo_release_gate', variant: 'v999' }),
      saveRuleVariantOverrides,
    });

    const domLookup = forbidRuleVariantDomIdLookup();
    await user.click(screen.getByRole('button', { name: /Save All Selections/i }));
    await waitFor(() => expect(saveRuleVariantOverrides).toHaveBeenCalledTimes(1));
    expectNoRuleVariantDomIdLookup(domLookup);
    expect(saveRuleVariantOverrides).toHaveBeenCalledWith({
      ruleVariantOverrides: {
        wo_release_gate: 'v999',
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/V-SET-31/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/variant must reference an existing rule_definitions\.version/i);
  });

  it('surfaces permission failures from the save action without imperative DOM feedback mutation', async () => {
    const user = userEvent.setup();
    const saveRuleVariantOverrides = vi.fn(async () => ({
      ok: false as const,
      code: 'FORBIDDEN',
      message: 'settings.org.update permission is required to change rule variants',
    }));

    await renderRuleVariantSelectorPage({ saveRuleVariantOverrides });
    await user.click(screen.getByRole('radio', { name: /wo_release_gate v2/i }));

    const domLookup = forbidRuleVariantDomIdLookup();
    await user.click(screen.getByRole('button', { name: /Save All Selections/i }));
    await waitFor(() => expect(saveRuleVariantOverrides).toHaveBeenCalledTimes(1));
    expectNoRuleVariantDomIdLookup(domLookup);
    expect(saveRuleVariantOverrides).toHaveBeenCalledWith({
      ruleVariantOverrides: {
        wo_release_gate: 'v2',
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/FORBIDDEN/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.org\.update permission is required/i);
  });

  it('executes the default save action through withOrgContext and settings.org.update before mutating tenant_variations', async () => {
    const user = userEvent.setup();
    const { queryCalls, withOrgContextCalls } = await renderRuleVariantSelectorPageWithLiveOrgContext();

    expect(withOrgContextCalls.length, 'initial Server Component load must enter org context before reading scoped rules').toBe(1);
    expect(queryCalls.some((call) => call.params?.[2] === 'settings.rules.view')).toBe(true);

    await user.click(screen.getByRole('radio', { name: /wo_release_gate v2/i }));
    await user.click(screen.getByRole('button', { name: /Save All Selections/i }));
    await waitFor(() =>
      expect(queryCalls.some((call) => call.sql.startsWith('update public.tenant_variations'))).toBe(true),
    );

    expect(withOrgContextCalls.length, 'default Server Action must enter org context again for the write path').toBe(2);
    const updatePermissionIndex = queryCalls.findIndex((call) => call.params?.[2] === 'settings.org.update');
    const mutationIndex = queryCalls.findIndex((call) => call.sql.startsWith('update public.tenant_variations'));
    const auditIndex = queryCalls.findIndex((call) => call.sql.startsWith('insert into public.audit_log'));
    expect(updatePermissionIndex, 'write path must check settings.org.update, not a role code or client flag').toBeGreaterThan(-1);
    expect(mutationIndex, 'write path must persist to tenant_variations after authorization').toBeGreaterThan(updatePermissionIndex);
    expect(auditIndex, 'authorized writes must still emit the audit_log entry after persistence').toBeGreaterThan(mutationIndex);
    expect(queryCalls[mutationIndex].params?.[0]).toBe(JSON.stringify({ wo_release_gate: 'v2' }));
  });

  it('renders permission-denied feedback and performs no write when the live save action lacks settings.org.update', async () => {
    const user = userEvent.setup();
    const { queryCalls, withOrgContextCalls } = await renderRuleVariantSelectorPageWithLiveOrgContext({
      deniedPermissions: ['settings.org.update'],
    });

    await user.click(screen.getByRole('radio', { name: /wo_release_gate v2/i }));
    await user.click(screen.getByRole('button', { name: /Save All Selections/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/FORBIDDEN/i));
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.org\.update permission is required/i);
    expect(withOrgContextCalls.length, 'read path and denied write path must both use withOrgContext').toBe(2);
    expect(queryCalls.some((call) => call.params?.[2] === 'settings.org.update')).toBe(true);
    expect(queryCalls.some((call) => call.sql.startsWith('update public.tenant_variations'))).toBe(false);
    expect(queryCalls.some((call) => call.sql.startsWith('insert into public.audit_log'))).toBe(false);
  });
});
