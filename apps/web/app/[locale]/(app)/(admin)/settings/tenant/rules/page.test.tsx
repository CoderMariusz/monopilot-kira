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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
}) => Promise<{ ok: true } | { ok: false; code: 'VARIANT_NOT_FOUND'; message: string }>;

type RuleVariantSelectorProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  rules?: RuleVariantRow[];
  saveRuleVariantOverrides?: SaveVariantOverrides;
  state?: 'ready' | 'loading' | 'empty' | 'error';
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
    saveRuleVariantOverrides: vi.fn(async () => ({ ok: true })),
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

describe('SET-062 rule variant selector UX contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/tenant/rules');
  });

  afterEach(() => {
    cleanup();
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

    await user.click(screen.getByRole('button', { name: /Save All Selections/i }));
    await waitFor(() => expect(saveRuleVariantOverrides).toHaveBeenCalledTimes(1));
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

    await user.click(screen.getByRole('button', { name: /Save All Selections/i }));
    await waitFor(() => expect(saveRuleVariantOverrides).toHaveBeenCalledTimes(1));
    expect(saveRuleVariantOverrides).toHaveBeenCalledWith({
      ruleVariantOverrides: {
        wo_release_gate: 'v999',
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/V-SET-31/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/variant must reference an existing rule_definitions\.version/i);
  });
});
