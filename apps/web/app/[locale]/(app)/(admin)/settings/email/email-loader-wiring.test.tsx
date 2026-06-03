/**
 * @vitest-environment jsdom
 * Wave 2 SET-090 / SET-091 — real-data loader wiring.
 *
 * Asserts the production pages read REAL Supabase rows via withOrgContext (RLS),
 * not a DEFAULT_TEMPLATES/DEFAULT_GROUPS empty fallback. The loader is exercised
 * against a fake org-context client returning email_config reference_tables rows
 * and the merge-field domain registry.
 *
 * Loader: apps/web/actions/email/load-email-config.ts
 * Tables: public.reference_tables (table_code='email_config'), public.integration_settings
 * Registry: apps/web/actions/email/variable-registry.ts (real domain constant)
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

const harness = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  // Toggle: does the caller hold settings.email.* permission?
  grant: true,
  templateRows: [] as Array<Record<string, unknown>>,
}));

function makeClient() {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      harness.calls.push({ sql, params });
      const n = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (n.includes('from public.user_roles')) {
        return { rows: (harness.grant ? [{ ok: true }] : []) as T[], rowCount: harness.grant ? 1 : 0 };
      }
      if (n.includes("to_regclass('public.integration_settings')")) {
        return { rows: [{ ok: true }] as T[], rowCount: 1 };
      }
      if (n.includes('from public.integration_settings')) {
        return {
          rows: [{ provider: 'postmark', from_email: 'ops@acme.test', from_name: 'Acme Ops' }] as T[],
          rowCount: 1,
        };
      }
      if (n.includes('from public.reference_tables')) {
        return { rows: harness.templateRows as T[], rowCount: harness.templateRows.length };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (fn: (ctx: unknown) => Promise<unknown>) =>
    fn({ userId: 'u-1', orgId: 'o-1', sessionToken: 's-1', client: makeClient() }),
  ),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => '/en/settings/email',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function passthroughT(key: string, values?: Record<string, string | number>) {
  const labels: Record<string, string> = {
    title: 'Email templates',
    subtitle: 'Trigger-driven transactional templates consumed by Planning, Shipping, QA.',
    templatesTitle: 'Templates ({count})',
    testSend: 'Test send…',
    newTemplate: '+ New template',
  };
  return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
}

vi.mock('next-intl/server', () => ({ getTranslations: vi.fn(async () => passthroughT) }));
vi.mock('next-intl', () => ({ useTranslations: () => passthroughT }));

beforeEach(() => {
  harness.calls = [];
  harness.grant = true;
  harness.templateRows = [];
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/en/settings/email');
});

afterEach(() => cleanup());

describe('SET-090/091 real-data loader wiring (no DEFAULT_TEMPLATES/DEFAULT_GROUPS fallback)', () => {
  it('email templates page queries reference_tables(email_config) via withOrgContext and renders real rows', async () => {
    harness.templateRows = [
      {
        row_key: 'core_closed',
        row_data: {
          name: 'FA core closed',
          consumer: 'Production',
          subject_template: 'Core {{fa_code}} closed',
          body_template: 'Closed by {{closed_by}}',
          recipients_to: ['prod@acme.test'],
        },
        is_active: true,
      },
    ];

    const { default: Page } = (await import('./page')) as {
      default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode>;
    };
    render(<>{await Page({ params: Promise.resolve({ locale: 'en' }) })}</>);

    const refTableCall = harness.calls.find((c) => c.sql.toLowerCase().includes('from public.reference_tables'));
    expect(refTableCall, 'loader must query public.reference_tables for templates').toBeTruthy();
    expect(refTableCall?.params).toContain('email_config');

    const row = await screen.findByTestId('settings-email-template-row');
    expect(within(row).getByTestId('settings-email-template-code')).toHaveTextContent('core_closed');
    // Provider settings come from integration_settings, not a hardcoded Apex value.
    expect(document.body).not.toHaveTextContent(/apex|no-reply@monopilot\.apex\.pl/i);
  });

  it('email templates page renders permission_denied when the RBAC gate denies (no template rows leaked)', async () => {
    harness.grant = false;
    harness.templateRows = [{ row_key: 'core_closed', row_data: {}, is_active: true }];

    const { default: Page } = (await import('./page')) as {
      default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode>;
    };
    render(<>{await Page({ params: Promise.resolve({ locale: 'en' }) })}</>);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryAllByTestId('settings-email-template-row')).toHaveLength(0);
    // RBAC denied: loader must not have queried template rows.
    expect(harness.calls.some((c) => c.sql.toLowerCase().includes('from public.reference_tables'))).toBe(false);
  });

  it('email variables page renders the real merge-field registry groups via withOrgContext (not an empty DEFAULT_GROUPS)', async () => {
    vi.resetModules();
    const { default: VarPage } = (await import('./variables/page')) as {
      default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode>;
    };
    render(<>{await VarPage({ params: Promise.resolve({ locale: 'en' }) })}</>);

    // RBAC gate queried, then registry groups rendered (Factory acceptance / D365 sync).
    expect(harness.calls.some((c) => c.sql.toLowerCase().includes('from public.user_roles'))).toBe(true);
    const groups = await screen.findAllByTestId('settings-email-variable-group');
    expect(groups.length).toBeGreaterThan(0);
    expect(document.body).toHaveTextContent(/fa_code/i);
  });
});
