/**
 * @vitest-environment jsdom
 * T-063 / SET-040 — Rules Registry screen.
 *
 * RED phase: these RTL tests specify the localized AppShell-backed production
 * page contract from prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-210.
 * The test file lives at the ACP-scoped RED path, but it intentionally loads the
 * canonical browser-visible route under app/[locale]/(app)/(admin)/settings/rules.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    const labels: Record<string, string> = {
      title: 'Rules registry',
      subtitle: 'Read-only browser of deployed business rules (DSL-driven).',
      dryRunAllRules: 'Dry-run all rules',
      dryRunAllRulesTitle: 'Preview affected objects across all rules before activation',
      exportAllJson: 'Export all (JSON)',
      readOnlyNotice:
        'Rules are authored by developers and deployed via CI/CD. This view is read-only — contact your Monopilot implementation team to request rule changes.',
      typeFilter: 'Rule type',
      coverageFilter: 'Coverage',
      allTypes: 'All types',
      workflow: 'Workflow',
      cascading: 'Cascading',
      conditional: 'Conditional',
      gate: 'Gate',
      allCoverage: 'All coverage',
      covered30d: 'Covered (dry-run < 30d)',
      missingCoverage: 'Missing coverage',
      deployedRules: 'Deployed rules',
      ruleCode: 'Rule code',
      type: 'Type',
      tier: 'Tier',
      version: 'Version',
      activeFrom: 'Active from',
      deployRef: 'Deploy ref',
      coverage: 'Coverage',
      consumers: 'Consumers',
      actions: 'Actions',
      covered: 'covered',
      missingCoverageBadge: 'missing coverage',
      moduleRefs: '{count} module refs',
      viewRule: 'View rule',
      loading: 'Loading rules registry…',
      empty: 'No deployed rules found.',
      error: 'Unable to load deployed rules.',
      dryRunDialogTitle: 'Dry-run all rules',
      close: 'Close',
    };
    return labels[key] ?? key;
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

type RuleType = 'workflow' | 'cascading' | 'conditional' | 'gate';
type RuleTier = 'L1' | 'L2' | 'system';

type RuleRegistryRow = {
  code: string;
  type: RuleType;
  tier: RuleTier;
  version: number;
  activeFrom: string;
  deployRef: string;
  lastDryRunAt?: string | null;
  consumers: string[];
  description?: string;
};

type RulesPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  rules?: RuleRegistryRow[];
  now?: string;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  openModal?: (modalId: 'ruleDryRun') => void;
  onOpenRule?: (ruleCode: string) => void;
};

type RulesPage = (props: RulesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const rules: RuleRegistryRow[] = [
  {
    code: 'QA_ALLERGEN_APPROVAL_GATE',
    type: 'gate',
    tier: 'L2',
    version: 7,
    activeFrom: '2026-04-01',
    deployRef: 'a1b2c3d',
    lastDryRunAt: '2026-04-23T00:00:00.000Z',
    consumers: ['quality', 'production'],
  },
  {
    code: 'NPD_SPEC_CASCADE',
    type: 'cascading',
    tier: 'L1',
    version: 3,
    activeFrom: '2026-05-05',
    deployRef: 'd4e5f6a',
    lastDryRunAt: '2026-05-20T00:00:00.000Z',
    consumers: ['npd'],
  },
  {
    code: 'WO_RELEASE_WORKFLOW',
    type: 'workflow',
    tier: 'system',
    version: 12,
    activeFrom: '2026-05-10',
    deployRef: 'beef042',
    lastDryRunAt: '2026-05-22T00:00:00.000Z',
    consumers: ['production', 'planning'],
  },
];

async function loadRulesPage(): Promise<RulesPage> {
  try {
    const canonicalRouteModule = '../../../(app)/(admin)/settings/rules/page';
    const mod = await import(/* @vite-ignore */ canonicalRouteModule);
    expect(mod.default, 'SET-040 rules registry page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as RulesPage;
  } catch {
    return function MissingRulesRegistryPage() {
      return React.createElement('main', { 'data-testid': 'missing-rules-registry-page' });
    };
  }
}

async function renderRulesPage(overrides: Partial<RulesPageProps> = {}) {
  const Page = await loadRulesPage();
  const props: RulesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    rules,
    now: '2026-05-24T00:00:00.000Z',
    state: 'ready',
    openModal: vi.fn(),
    onOpenRule: vi.fn(),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function regionOrder() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
    region.getAttribute('data-region'),
  );
}

function rulesTable() {
  return screen.getByRole('table', { name: /deployed rules/i });
}

function bodyRows(table = rulesTable()) {
  return within(table).getAllByRole('row').slice(1);
}

function structuralSnapshot() {
  const table = rulesTable();
  return {
    regions: regionOrder(),
    actions: screen.getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean),
    filters: screen.getAllByRole('combobox').map((combobox) => combobox.getAttribute('aria-label')),
    headers: within(table).getAllByRole('columnheader').map((header) => header.textContent?.trim()),
    rows: bodyRows(table).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent?.trim())),
  };
}

async function chooseTypeFilter(value: string, label: RegExp) {
  const user = userEvent.setup();
  const typeFilter = screen.getByRole('combobox', { name: /rule type/i });
  if (typeFilter.tagName === 'SELECT') {
    await user.selectOptions(typeFilter, value);
    return;
  }
  await user.click(typeFilter);
  await user.click(screen.getByRole('option', { name: label }));
}

function assertModalA11y(dialog: HTMLElement) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(/dry-run all rules/i);
  expect(within(dialog).getByRole('button', { name: /close/i })).toBeInTheDocument();
}

describe('SET-040 rules registry prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the prototype sections, shadcn primitives, action order, filters, table columns, and keyboard order', async () => {
    const user = userEvent.setup();
    await renderRulesPage();

    expect(screen.getByTestId('settings-rules-registry-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^rules registry$/i })).toBeInTheDocument();
    expect(screen.getByText(/read-only browser of deployed business rules/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/authored by developers and deployed via ci\/cd/i);

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "actions": [
          "Dry-run all rules",
          "Export all (JSON)",
          "View →",
          "View →",
          "View →",
        ],
        "filters": [
          "Rule type",
          "Coverage",
        ],
        "headers": [
          "Rule code",
          "Type",
          "Tier",
          "Version",
          "Active from",
          "Deploy ref",
          "Coverage",
          "Consumers",
          "Actions",
        ],
        "regions": [
          "page-head",
          "read-only-notice",
          "rules-filters",
          "deployed-rules",
        ],
        "rows": [
          [
            "QA_ALLERGEN_APPROVAL_GATE",
            "Gate",
            "L2",
            "v7",
            "2026-04-01",
            "a1b2c3d",
            "missing coverage",
            "2 module refs",
            "View →",
          ],
          [
            "NPD_SPEC_CASCADE",
            "Cascading",
            "L1",
            "v3",
            "2026-05-05",
            "d4e5f6a",
            "covered",
            "1 module refs",
            "View →",
          ],
          [
            "WO_RELEASE_WORKFLOW",
            "Workflow",
            "system",
            "v12",
            "2026-05-10",
            "beef042",
            "covered",
            "2 module refs",
            "View →",
          ],
        ],
      }
    `);

    expect(document.querySelectorAll('select')).toHaveLength(0);
    expect(document.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(2);
    expect(document.querySelector('[data-slot="table"]')).toBeInTheDocument();
    expect(screen.getByText('3 / 3 rules')).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /dry-run all rules/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /export all/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: /rule type/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: /coverage/i })).toHaveFocus();
  });

  it("filters to only gate-type rules when type='gate' is selected", async () => {
    await renderRulesPage();

    await chooseTypeFilter('gate', /^gate$/i);

    expect(screen.getByText('1 / 3 rules')).toBeInTheDocument();
    const visibleRows = bodyRows();
    expect(visibleRows).toHaveLength(1);
    expect(within(visibleRows[0]).getByText('QA_ALLERGEN_APPROVAL_GATE')).toBeInTheDocument();
    expect(screen.queryByText('NPD_SPEC_CASCADE')).not.toBeInTheDocument();
    expect(screen.queryByText('WO_RELEASE_WORKFLOW')).not.toBeInTheDocument();
  });

  it("marks a rule with last_dry_run_at 31d old as highlighted missing coverage", async () => {
    await renderRulesPage();

    const staleRow = bodyRows().find((row) => row.textContent?.includes('QA_ALLERGEN_APPROVAL_GATE'));
    expect(staleRow, 'Expected old dry-run rule row to render').toBeTruthy();
    expect(staleRow!.className).toMatch(/missing-coverage/);
    expect(within(staleRow!).getByText(/missing coverage/i)).toBeInTheDocument();
  });

  it('opens the SM-01 rule dry-run modal trigger accessibly and renders loading, empty, and error states loudly', async () => {
    const user = userEvent.setup();
    const openModal = vi.fn();
    await renderRulesPage({ openModal });

    const dryRun = screen.getByRole('button', { name: /dry-run all rules/i });
    expect(dryRun).toHaveAttribute('data-modal-id', 'ruleDryRun');
    await user.click(dryRun);
    expect(openModal).toHaveBeenCalledWith('ruleDryRun');

    const dialog = screen.queryByRole('dialog');
    if (dialog) assertModalA11y(dialog);

    cleanup();
    await renderRulesPage({ state: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent(/loading rules registry/i);

    cleanup();
    await renderRulesPage({ state: 'empty', rules: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/no deployed rules/i);

    cleanup();
    await renderRulesPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load deployed rules/i);
  });
});
