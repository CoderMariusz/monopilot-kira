/**
 * @vitest-environment jsdom
 * T-108 / SET-042 — Rule Version Diff screen RED tests.
 * Source of truth: docs/prd/02-SETTINGS-PRD.md §7.6 and
 * prototypes/design/Monopilot Design System/settings/admin-screens.jsx:223-351.
 * RED scope: tests only; production diff page is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryResult<T = unknown> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query: (sql: string | { text?: string }, params?: readonly unknown[]) => Promise<QueryResult>;
};
type DiffPage = (props: {
  params?: Promise<{ locale: string; rule_code: string }>;
  searchParams?: Promise<{ from?: string; to?: string }>;
}) => React.ReactNode | Promise<React.ReactNode>;

const harness = vi.hoisted(() => ({
  client: undefined as QueryClient | undefined,
  permissionQueries: [] as unknown[][],
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
      title: 'Rule version diff',
      forbiddenTitle: '403 — Forbidden',
      forbiddenMessage: 'You do not have permission to read Settings rules.',
    };
    const template = labels[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? `{${name}}`));
  },
}));

const versionRows = [
  {
    rule_code: 'allergen_cascade_v1',
    version: 1,
    definition_json: {
      definition_json: {
        description: 'Original allergen cascade',
        legacyFlag: true,
        rules: { maxCases: 5 },
      },
    },
    active_from: '2026-05-01',
    deployed_by: 'rules-ci',
    deploy_ref: 'v1ref',
  },
  {
    rule_code: 'allergen_cascade_v1',
    version: 2,
    definition_json: {
      definition_json: {
        description: 'Updated allergen cascade',
        threshold: 0.85,
        rules: { maxCases: 6 },
      },
    },
    active_from: '2026-05-10',
    deployed_by: 'rules-ci',
    deploy_ref: 'v2ref',
  },
];

function sqlText(sql: string | { text?: string }) {
  return typeof sql === 'string' ? sql : sql.text ?? '';
}

function createClient({ allowRead }: { allowRead: boolean }) {
  return {
    query: vi.fn(async (sql: string | { text?: string }, params?: readonly unknown[]): Promise<QueryResult> => {
      const text = sqlText(sql).toLowerCase();
      const paramList = Array.isArray(params) ? params : [];

      if (text.includes('permission') || text.includes('user_roles') || text.includes('role_permissions') || text.includes('roles')) {
        harness.permissionQueries.push([...paramList]);
        return paramList.includes('settings.rules.read') && allowRead ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      if (text.includes('rule_definitions')) {
        return { rows: allowRead ? versionRows : [], rowCount: allowRead ? versionRows.length : 0 };
      }

      return { rows: [], rowCount: 0 };
    }),
  } satisfies QueryClient;
}

async function loadDiffPage(): Promise<DiffPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-042 rule version diff page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as DiffPage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Cannot find module|failed to load url|\.\/page\.tsx/i.test(message)) {
      throw error;
    }
    return function MissingRuleVersionDiffPage() {
      return React.createElement('main', { 'data-testid': 'missing-rule-version-diff-page' });
    };
  }
}

async function renderDiffPage({ allowRead = true }: { allowRead?: boolean } = {}) {
  harness.client = createClient({ allowRead });
  harness.permissionQueries = [];
  const Page = await loadDiffPage();
  const props = {
    params: Promise.resolve({ locale: 'en', rule_code: 'allergen_cascade_v1' }),
    searchParams: Promise.resolve({ from: '1', to: '2' }),
  };
  const node = await Page(props);
  return render(React.createElement(React.Fragment, null, node));
}

function expectDiffCell(path: string, side: 'left' | 'right', change: 'added' | 'removed' | 'changed' | 'unchanged') {
  const cell = screen.getByTestId(`diff-${side}-${path}`);
  expect(cell, `${side} cell for ${path} should be marked ${change}`).toHaveClass(`diff-cell--${change}`);
  expect(cell).toHaveAttribute('data-change-kind', change);
  return cell;
}

describe('SET-042 rule version diff page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/rules/allergen_cascade_v1/diff?from=1&to=2');
  });

  afterEach(() => {
    cleanup();
    harness.client = undefined;
    harness.permissionQueries = [];
  });

  it('renders a deterministic read-only side-by-side JSON deep diff with header counts for v1 to v2', async () => {
    await renderDiffPage({ allowRead: true });

    expect(harness.permissionQueries.flat(), 'page must authorize using settings.rules.read, not a role code or stale settings.rules.view permission').toContain('settings.rules.read');

    const root = screen.getByTestId('settings-rule-version-diff-screen');
    expect(root).toHaveAttribute('data-prototype', 'rule_version_diff_screen');
    expect(screen.getByRole('heading', { name: /allergen_cascade_v1/i })).toBeInTheDocument();
    expect(screen.getByText('v1 → v2')).toBeInTheDocument();
    expect(screen.getByText(/1\s+added/i)).toBeInTheDocument();
    expect(screen.getByText(/1\s+removed/i)).toBeInTheDocument();
    expect(screen.getByText(/1\s+changed/i)).toBeInTheDocument();

    const table = screen.getByRole('table', { name: /json deep diff/i });
    expect(within(table).getByRole('columnheader', { name: /path/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /v1/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /v2/i })).toBeInTheDocument();
    expect(within(table).getAllByRole('row').map((row) => row.getAttribute('data-diff-path')).filter(Boolean)).toEqual([
      'definition_json.description',
      'definition_json.legacyFlag',
      'definition_json.rules.maxCases',
      'definition_json.threshold',
    ]);
    expect(root.querySelectorAll('button, input, select, textarea').length).toBe(0);
  });

  it('highlights added, removed, and changed paths on the correct side only', async () => {
    await renderDiffPage({ allowRead: true });

    const addedLeft = expectDiffCell('definition_json.threshold', 'left', 'unchanged');
    expect(addedLeft).toHaveTextContent('—');
    expect(expectDiffCell('definition_json.threshold', 'right', 'added')).toHaveTextContent('0.85');

    expect(expectDiffCell('definition_json.legacyFlag', 'left', 'removed')).toHaveTextContent('true');
    const removedRight = expectDiffCell('definition_json.legacyFlag', 'right', 'unchanged');
    expect(removedRight).toHaveTextContent('—');

    expect(expectDiffCell('definition_json.rules.maxCases', 'left', 'changed')).toHaveTextContent('5');
    expect(expectDiffCell('definition_json.rules.maxCases', 'right', 'changed')).toHaveTextContent('6');
  });

  it('renders a 403 page when the caller lacks settings.rules.read', async () => {
    await renderDiffPage({ allowRead: false });

    expect(screen.getByRole('heading', { name: /403|forbidden/i })).toBeInTheDocument();
    expect(screen.getByText(/settings\.rules\.read|permission/i)).toBeInTheDocument();
    expect(screen.queryByTestId('settings-rule-version-diff-screen')).not.toBeInTheDocument();
  });
});
