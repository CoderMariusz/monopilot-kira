/**
 * @vitest-environment jsdom
 * UI-SET-007 / SET-050 — Rules registry + dry-run modal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-217
 * and settings/modals.jsx#rule_dry_run_modal.
 * RED scope: tests only; production route/component/action wiring is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RulesRegistryPage from './page';

type RuleRegistryRow = {
  code: string;
  type: 'workflow' | 'cascading' | 'conditional' | 'gate';
  tier: 'L1' | 'L2' | 'L3' | 'L4' | 'system';
  version: number;
  activeFrom: string;
  deployRef: string;
  lastDryRunAt?: string | null;
  consumers: string[];
  description?: string;
};

const dryRunHarness = vi.hoisted(() => ({
  runRuleDryRun: vi.fn(),
}));

vi.mock('../../../../../../actions/rules/dry-runs', () => ({
  runRuleDryRun: dryRunHarness.runRuleDryRun,
}));

const rulesFixture: RuleRegistryRow[] = [
  {
    code: 'wo_release_guard',
    type: 'workflow',
    tier: 'L2',
    version: 4,
    activeFrom: '2026-05-01T00:00:00.000Z',
    deployRef: 'git:rules-wo-v4',
    lastDryRunAt: '2026-05-20T08:00:00.000Z',
    consumers: ['production', 'planning'],
    description: 'Work order release requires reservation and crew checks.',
  },
  {
    code: 'quality_allergen_changeover_gate',
    type: 'gate',
    tier: 'L3',
    version: 2,
    activeFrom: '2026-04-14T00:00:00.000Z',
    deployRef: 'git:rules-qa-v2',
    lastDryRunAt: null,
    consumers: ['quality'],
    description: 'Blocks line release when allergen cleaning evidence is missing.',
  },
];

const passingDryRun = {
  status: 'pass' as const,
  warnings: ['crew calendar fallback used'],
  trace: ['guard: reservation_green → ✓', 'guard: crew_assigned → ✓'],
  evaluatedAt: '2026-05-25T10:15:00.000Z',
};

async function renderRulesRegistryPage(overrides: Record<string, unknown> = {}) {
  const node = await RulesRegistryPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    rules: rulesFixture,
    now: '2026-05-25T12:00:00.000Z',
    ...overrides,
  });

  return render(React.createElement(React.Fragment, null, node));
}

describe('UI-SET-007 rules registry route parity and modal wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dryRunHarness.runRuleDryRun.mockResolvedValue(passingDryRun);
    window.history.replaceState(null, '', '/en/settings/rules');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the prototype registry table with filters, coverage badges, live provenance, and localized detail links', async () => {
    await renderRulesRegistryPage();

    const root = screen.getByTestId('settings-rules-registry-screen');
    expect(root).toHaveAccessibleName('Rules registry');
    expect(screen.getByRole('heading', { name: 'Rules registry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dry-run all rules/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export all \(json\)/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/rule type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/coverage/i)).toBeInTheDocument();
    expect(screen.getByText('2 / 2 rules')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /deployed rules/i });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
      'Rule code',
      'Type',
      'Tier',
      'Version',
      'Active from',
      'Deploy ref',
      'Coverage',
      'Consumers',
      'Actions',
    ]);

    const coveredRow = within(table).getByText('wo_release_guard').closest('tr');
    const missingRow = within(table).getByText('quality_allergen_changeover_gate').closest('tr');
    expect(coveredRow, 'covered fixture row should render').toBeTruthy();
    expect(missingRow, 'missing-coverage fixture row should render').toBeTruthy();
    expect(within(coveredRow as HTMLElement).getByText('covered')).toHaveClass(/badge|success|green/i);
    expect(within(missingRow as HTMLElement).getByText(/missing/i)).toHaveClass(/badge|danger|red/i);
    expect(missingRow).toHaveClass(/missing-coverage|border-amber|bg-amber/i);

    expect(screen.getByText(/data source:.*listRules.*withOrgContext/i), 'live-data provenance must be explicit, not prototype mock data').toBeInTheDocument();
    expect(within(coveredRow as HTMLElement).getByRole('link', { name: /view wo_release_guard/i })).toHaveAttribute(
      'href',
      '/en/settings/rules/wo_release_guard',
    );
  });

  it('opens the shared RuleDryRunModal from the registry CTA and runs the real dry-run action contract', async () => {
    const user = userEvent.setup();
    await renderRulesRegistryPage();

    await user.click(screen.getByRole('button', { name: /dry-run all rules/i }));

    const dialog = await screen.findByRole('dialog', { name: /dry-run/i });
    expect(dialog.closest('[data-testid="rule-dry-run-modal"]'), 'registry CTA must open the shared RuleDryRunModal, not a static inline dialog').toBeTruthy();
    expect(within(dialog).getByRole('textbox', { name: /sample input \(json\)/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('region', { name: /^result$/i })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^run dry-run$/i }));

    await waitFor(() => expect(dryRunHarness.runRuleDryRun).toHaveBeenCalledTimes(1));
    expect(dryRunHarness.runRuleDryRun).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleCode: 'wo_release_guard',
        sampleInput: expect.any(Object),
      }),
    );
    await waitFor(() => expect(within(dialog).getByTestId('rule-dry-run-result-json')).toHaveTextContent('crew calendar fallback'));
  });

  it('has a complete rules_registry i18n namespace for en/pl/ro/uk so the route never falls back to raw or English copy', async () => {
    const locales = {
      en: (await import('../../../../../../messages/en/02-settings.json')).default,
      pl: (await import('../../../../../../messages/pl/02-settings.json')).default,
      ro: (await import('../../../../../../messages/ro/02-settings.json')).default,
      uk: (await import('../../../../../../messages/uk/02-settings.json')).default,
    } as const;
    const requiredKeys = [
      'title',
      'subtitle',
      'dryRunAllRules',
      'dryRunAllRulesTitle',
      'exportAllJson',
      'readOnlyNotice',
      'typeFilter',
      'coverageFilter',
      'allTypes',
      'workflow',
      'cascading',
      'conditional',
      'gate',
      'allCoverage',
      'covered30d',
      'missingCoverage',
      'deployedRules',
      'ruleCode',
      'type',
      'tier',
      'version',
      'activeFrom',
      'deployRef',
      'coverage',
      'consumers',
      'actions',
      'covered',
      'missingCoverageBadge',
      'moduleRefs',
      'viewRule',
      'loading',
      'empty',
      'error',
      'dryRunDialogTitle',
      'close',
      'filters',
      'rulesCount',
      'provenance',
    ];

    for (const [locale, messages] of Object.entries(locales)) {
      const namespace = (messages as Record<string, unknown>).rules_registry as Record<string, unknown> | undefined;
      expect(namespace, `${locale}/02-settings.json must define rules_registry`).toBeTruthy();
      for (const key of requiredKeys) {
        expect(namespace?.[key], `${locale}.rules_registry.${key} must be translated`).toEqual(expect.any(String));
        expect(String(namespace?.[key] ?? ''), `${locale}.rules_registry.${key} must not be an empty/raw key`).not.toMatch(/^$|rules_registry\./);
      }
    }
  });
});
