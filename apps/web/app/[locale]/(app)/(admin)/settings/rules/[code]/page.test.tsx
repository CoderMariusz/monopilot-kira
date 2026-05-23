/**
 * @vitest-environment jsdom
 * T-064 / SET-041 — Rule detail screen RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:216-344.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../../../../../packages/ui/test/assertModalA11y';

type RuleVersion = {
  version: number;
  deployedAt: string;
  deployedBy: string;
  deployRef: string;
  current?: boolean;
};

type RuleDryRun = {
  ranAt: string;
  ranBy: string;
  result: 'pass' | 'warning' | 'fail';
  summary: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

type RuleDetailProps = {
  params?: Promise<{ locale: string; code: string }>;
  rule: {
    code: string;
    description: string;
    type: 'Transition' | 'Validation' | 'Calculation';
    tier: 'L1' | 'L2' | 'L3';
    status: 'active' | 'draft' | 'retired';
    version: number;
    effectiveFrom: string;
    deployRef: string;
    deployedBy: string;
  };
  dslSource?: Record<string, unknown> | null;
  versions: RuleVersion[];
  dryRuns: RuleDryRun[];
  consumers: string[];
  auditLog: Array<{ when: string; actor: string; action: string; deployRef: string; notes: string }>;
  compareVersions: (input: { ruleCode: string; fromVersion: number; toVersion: number }) => Promise<{
    ruleCode: string;
    fromVersion: number;
    toVersion: number;
    diff: Array<{ op: 'add' | 'remove' | 'replace'; path: string; before?: unknown; after?: unknown }>;
  }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
};

type RuleDetailPage = (props: RuleDetailProps) => React.ReactNode | Promise<React.ReactNode>;

const ruleFixture: RuleDetailProps['rule'] = {
  code: 'WO_CLOSEOUT',
  description: 'Requires reservation, QA hold clearance, and output capture before closeout.',
  type: 'Transition',
  tier: 'L2',
  status: 'active',
  version: 3,
  effectiveFrom: '2026-05-01',
  deployRef: '9c31ab2',
  deployedBy: 'rules-ci',
};

const dslFixture = {
  rule: 'WO_CLOSEOUT',
  when: { from: 'IN_PROGRESS', to: 'CLOSED' },
  guards: ['outputs_recorded', 'qa_holds_cleared'],
  actions: [{ emit: 'settings.rule.closeout_checked' }],
};

const versionsFixture: RuleVersion[] = [
  { version: 3, deployedAt: '2026-05-01', deployedBy: 'rules-ci', deployRef: '9c31ab2', current: true },
  { version: 2, deployedAt: '2026-04-18', deployedBy: 'system (CI/CD)', deployRef: '8bd9100' },
  { version: 1, deployedAt: '2026-03-22', deployedBy: 'system (CI/CD)', deployRef: '78ed001' },
];

const dryRunsFixture: RuleDryRun[] = [
  {
    ranAt: '2026-05-20T10:30:00.000Z',
    ranBy: 'qa.lead@example.test',
    result: 'warning',
    summary: 'QA hold guard warned because a sampled hold was pending.',
    input: { workOrder: 'WO-2026-00412' },
    output: { status: 'warning' },
  },
];

async function loadRuleDetailPage(): Promise<RuleDetailPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-041 rule detail page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as RuleDetailPage;
  } catch {
    return function MissingRuleDetailPage() {
      return React.createElement('main', { 'data-testid': 'missing-rule-detail-page' });
    };
  }
}

async function renderRuleDetailPage(overrides: Partial<RuleDetailProps> = {}) {
  const Page = await loadRuleDetailPage();
  const props: RuleDetailProps = {
    params: Promise.resolve({ locale: 'en', code: 'WO_CLOSEOUT' }),
    rule: ruleFixture,
    dslSource: dslFixture,
    versions: versionsFixture,
    dryRuns: dryRunsFixture,
    consumers: ['Production closeout', 'QA release gate'],
    auditLog: [
      {
        when: '2026-05-01',
        actor: 'rules-ci',
        action: 'rule_deploy',
        deployRef: '9c31ab2',
        notes: 'Promoted from staging',
      },
    ],
    compareVersions: vi.fn(async ({ ruleCode, fromVersion, toVersion }) => ({
      ruleCode,
      fromVersion,
      toVersion,
      diff: [
        { op: 'replace' as const, path: '/guards/1', before: 'qa_hold_clear', after: 'qa_holds_cleared' },
        { op: 'add' as const, path: '/actions/0/emit', after: 'settings.rule.closeout_checked' },
      ],
    })),
    ...overrides,
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return { props, ...render(React.createElement(Page as React.ComponentType<RuleDetailProps>, props)) };
}

function getRuleDetailRoot() {
  return screen.getByTestId('settings-rule-detail-screen');
}

function activeTab() {
  return screen.getAllByRole('tab').find((tab) => tab.getAttribute('aria-selected') === 'true');
}

describe('SET-041 rule_detail_screen prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/rules/WO_CLOSEOUT');
  });

  afterEach(() => {
    cleanup();
  });

  it('matches the prototype regions, labels, shadcn primitives, action order, focus order, RTL snapshot, and SM-01 modal wiring', async () => {
    const user = userEvent.setup();
    const { container } = await renderRuleDetailPage();

    const root = getRuleDetailRoot();
    expect(root).toHaveAttribute('data-prototype', 'rule_detail_screen');
    expect(screen.getByRole('heading', { name: 'WO_CLOSEOUT' })).toBeInTheDocument();
    expect(screen.getByText(/requires reservation, qa hold clearance/i)).toBeInTheDocument();

    const headerActions = within(root).getByRole('toolbar', { name: /rule actions/i });
    expect(within(headerActions).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      '← Back to registry',
      'Copy DSL',
      'Trigger dry-run',
    ]);
    for (const button of within(headerActions).getAllByRole('button')) {
      expect(button.closest('[data-slot="button"]')).toBeTruthy();
    }

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent(
      /settings\s*·\s*rules registry\s*·\s*WO_CLOSEOUT/i,
    );
    expect(screen.getByText('Transition')).toBeInTheDocument();
    expect(screen.getByText('L2')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText(/v3 · 2026-05-01 · 9c31ab2/i)).toBeInTheDocument();

    const tabsList = screen.getByRole('tablist', { name: /rule detail sections/i });
    expect(tabsList.closest('[data-slot="tabs-list"]')).toBeTruthy();
    expect(within(tabsList).getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
      'Definition',
      'Version history',
      'Dry-run results (1)',
      'Consumers',
      'Audit log',
    ]);
    expect(activeTab()).toHaveTextContent('Definition');

    const dslRegion = screen.getByRole('region', { name: /dsl source \(read-only\)/i });
    expect(dslRegion.closest('[data-slot="card"]')).toBeTruthy();
    expect(dslRegion).toHaveTextContent(/authored in the monopilot\/rules repo/i);
    expect(within(dslRegion).getByText('READ ONLY')).toBeInTheDocument();
    expect(within(dslRegion).getByTestId('rule-dsl-json')).toHaveTextContent('"WO_CLOSEOUT"');
    expect(within(dslRegion).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'Copy DSL to clipboard',
      'Download JSON',
      'Dry-run against sample input →',
    ]);
    expect(root.querySelectorAll('select, dialog').length).toBe(0);

    expect({
      rootTestId: root.getAttribute('data-testid'),
      heading: screen.getByRole('heading', { name: 'WO_CLOSEOUT' }).textContent,
      badges: ['Transition', 'L2', 'ACTIVE'],
      tabs: within(tabsList).getAllByRole('tab').map((tab) => tab.textContent?.trim()),
      initialRegion: dslRegion.getAttribute('aria-label') ?? dslRegion.textContent?.match(/DSL source \(read-only\)/)?.[0],
      definitionButtons: within(dslRegion).getAllByRole('button').map((button) => button.textContent?.trim()),
    }).toMatchInlineSnapshot(`
      {
        "badges": [
          "Transition",
          "L2",
          "ACTIVE",
        ],
        "definitionButtons": [
          "Copy DSL to clipboard",
          "Download JSON",
          "Dry-run against sample input →",
        ],
        "heading": "WO_CLOSEOUT",
        "initialRegion": "DSL source (read-only)",
        "rootTestId": "settings-rule-detail-screen",
        "tabs": [
          "Definition",
          "Version history",
          "Dry-run results (1)",
          "Consumers",
          "Audit log",
        ],
      }
    `);

    await user.tab();
    expect(within(headerActions).getByRole('button', { name: /back to registry/i })).toHaveFocus();
    await user.tab();
    expect(within(headerActions).getByRole('button', { name: /^copy dsl$/i })).toHaveFocus();
    await user.tab();
    const triggerDryRun = within(headerActions).getByRole('button', { name: /trigger dry-run/i });
    expect(triggerDryRun).toHaveFocus();

    await user.click(triggerDryRun);
    const dialog = await screen.findByRole('dialog', { name: /dry-run.*WO_CLOSEOUT/i });
    expect(dialog.closest('[data-testid="rule-dry-run-modal"]')).toBeTruthy();
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-01');
    await assertModalA11y(container);
  });

  it('activates Version history from the #versions deep link and enables non-current diff actions that render JSON deep-diff output', async () => {
    const user = userEvent.setup();
    const compareVersions = vi.fn(async () => ({
      ruleCode: 'WO_CLOSEOUT',
      fromVersion: 2,
      toVersion: 3,
      diff: [{ op: 'replace' as const, path: '/guards/1', before: 'qa_hold_clear', after: 'qa_holds_cleared' }],
    }));
    window.history.replaceState(null, '', '/en/settings/rules/WO_CLOSEOUT#versions');

    await renderRuleDetailPage({ compareVersions });

    expect(activeTab()).toHaveTextContent(/version history/i);
    const versionsTable = screen.getByRole('table', { name: /version history/i });
    for (const header of [/version/i, /deployed at/i, /deployed by/i, /deploy ref/i, /actions/i]) {
      expect(within(versionsTable).getByRole('columnheader', { name: header })).toBeInTheDocument();
    }

    const currentRow = within(versionsTable).getByRole('row', { name: /v3.*current/i });
    expect(within(currentRow).getByRole('button', { name: /diff vs current/i })).toBeDisabled();
    const versionTwoRow = within(versionsTable).getByRole('row', { name: /v2/i });
    const diffButton = within(versionTwoRow).getByRole('button', { name: /diff vs current/i });
    expect(diffButton).toBeEnabled();

    await user.click(diffButton);

    await waitFor(() => {
      expect(compareVersions).toHaveBeenCalledWith({ ruleCode: 'WO_CLOSEOUT', fromVersion: 2, toVersion: 3 });
    });
    const diffRegion = await screen.findByRole('region', { name: /version diff v2 → v3/i });
    expect(diffRegion).toHaveTextContent(/"op":\s*"replace"/i);
    expect(diffRegion).toHaveTextContent(/qa_hold_clear/i);
    expect(diffRegion).toHaveTextContent(/qa_holds_cleared/i);
  });

  it('renders loading, empty DSL, and error states loudly without silently skipping parity coverage', async () => {
    await renderRuleDetailPage({ state: 'loading' });
    expect(screen.getByTestId('settings-rule-detail-screen')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/loading rule detail/i);
    cleanup();

    await renderRuleDetailPage({ dslSource: null, dryRuns: [] });
    expect(screen.getByRole('region', { name: /^dsl source$/i })).toHaveTextContent(/dsl payload not yet indexed/i);
    expect(screen.getByRole('tab', { name: /dry-run results \(0\)/i })).toBeInTheDocument();
    cleanup();

    await renderRuleDetailPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load rule detail/i);
  });
});
