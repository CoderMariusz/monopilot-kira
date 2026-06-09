/**
 * @vitest-environment jsdom
 * T-136 — parity evidence generator (RTL DOM artifacts).
 *
 * Renders the FA detail shell in each required UI state (ready / empty-not-found
 * / error / permission-denied; "loading" + "optimistic" notes below) and writes
 * per-state DOM HTML snapshots + a structural parity report to
 * apps/web/e2e/artifacts/T-136/ for the parity diff against:
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)
 *
 * Loading: the FA route is an RSC that awaits the org-context read; the shell has
 * no client-side fetch, so the loading state is the Next.js Suspense/streaming
 * boundary (no in-component skeleton to snapshot). Optimistic: the shell has no
 * mutation (tab switch is URL-driven, captured by the fa-tabs RTL test) — there
 * is no optimistic affordance in this deferred-content slice. Both are documented
 * in the closeout deviation log.
 *
 * Playwright pixel screenshots + @axe-core/playwright require a running app server
 * with an authenticated, RBAC-granted Supabase session (the FA route is org-scoped
 * and read-gated); that is not bootable inside this isolated worktree. Per
 * UI-PROTOTYPE-PARITY-POLICY.md the RTL DOM artifacts + structural mapping below
 * are the accepted fallback evidence, and the Playwright blocker is documented in
 * the closeout. (Mirrors the sibling T-027 fa-history evidence harness.)
 */
import React from 'react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path, { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { withOrgContextMock } = vi.hoisted(() => ({ withOrgContextMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/fa/FA0043',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: string | { locale?: string; namespace?: string }) => {
    const locale = typeof req === 'object' ? (req.locale ?? 'en') : 'en';
    const namespace = typeof req === 'object' ? (req.namespace ?? '') : (req ?? '');
    const file = path.resolve(THIS_DIR, `../../../../../../i18n/${locale}.json`);
    const messages = JSON.parse(readFileSync(file, 'utf-8'));
    const ns = namespace.split('.').reduce((acc: Record<string, unknown>, part: string) => {
      return (acc?.[part] as Record<string, unknown>) ?? {};
    }, messages);
    return (key: string) => {
      const value = key.split('.').reduce((acc: unknown, part: string) => {
        return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined;
      }, ns);
      return typeof value === 'string' ? value : key;
    };
  }),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({ withOrgContext: withOrgContextMock }));

import FaDetailPage from './page';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
// [productCode] → fa → (npd) → (app) → [locale] → app → web → e2e/artifacts/T-136
const evidenceDir = resolve(THIS_DIR, '../../../../../../e2e/artifacts/T-136');

const FA_ROW = {
  product_code: 'FA0043',
  product_name: 'Smoked Almond Yoghurt',
  status_overall: 'InProgress',
  built: false,
};

function wire(opts: { canRead?: boolean; faRow?: Record<string, unknown> | null; throws?: boolean } = {}) {
  const { canRead = true, faRow = FA_ROW, throws = false } = opts;
  if (throws) {
    withOrgContextMock.mockRejectedValue(new Error('boom'));
    return;
  }
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/role_permissions|user_roles/i.test(sql)) return { rows: canRead ? [{ ok: true }] : [] };
        if (/from\s+public\.product/i.test(sql)) return { rows: faRow ? [faRow] : [] };
        return { rows: [] };
      }),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

async function renderState(state: string, opts: Parameters<typeof wire>[0]) {
  wire(opts);
  const ui = await FaDetailPage({ params: Promise.resolve({ locale: 'en', productCode: 'FA0043' }) });
  const { container } = render(ui);
  writeFileSync(resolve(evidenceDir, `T-136-${state}.html`), container.innerHTML, 'utf-8');
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
  mkdirSync(evidenceDir, { recursive: true });
});
afterEach(() => cleanup());

describe('T-136 parity evidence — fa_detail shell states', () => {
  it('captures the ready (real-data header + tabs) state', async () => {
    const c = await renderState('ready', {});
    expect(c.querySelector('[data-slot="tabs-list"]')).not.toBeNull();
    expect(c.textContent).toContain('FA0043');
  });

  it('captures the empty / not-found state', async () => {
    const c = await renderState('empty', { faRow: null });
    expect(c.querySelector('[data-testid="fa-detail-empty"]')).not.toBeNull();
  });

  it('captures the permission-denied state', async () => {
    const c = await renderState('permission-denied', { canRead: false });
    expect(c.querySelector('[data-testid="fa-detail-forbidden"]')).not.toBeNull();
  });

  it('captures the error state', async () => {
    const c = await renderState('error', { throws: true });
    expect(c.querySelector('[data-testid="fa-detail-error"]')).not.toBeNull();
  });

  it('writes the structural parity report', async () => {
    const report = [
      '# T-136 FA detail shell — structural parity report',
      '',
      'Prototype anchor: prototypes/design/Monopilot Design System/npd/fa-screens.jsx:300-401 (fa_detail)',
      '',
      '| Prototype region (lines) | Production element |',
      '| --- | --- |',
      '| breadcrumb eyebrow (331) | section > div.text-xs uppercase (npd.faDetail.eyebrow) |',
      '| FA code mono (335) | span.font-mono.text-blue-700 |',
      '| product name (336) | h1 |',
      '| status_overall badge (337) | Badge[data-testid=fa-detail-status] (tone by status) |',
      '| ⚡ Built badge (338) | Badge[data-testid=fa-detail-built] |',
      '| subnav-inline tab bar (387-398) | FaTabs [data-slot=tabs-list] 8 dept triggers + read-only BOM |',
      '| tab bodies (402-413) | deferred-empty Card per tab; History = real FaHistoryTab (T-027); BOM = real FaBomTab (SCR-03h, Lane 12) |',
      '',
      'Deviations: 12-tab prototype reduced to 8 dept tabs + read-only BOM (SCR-03h, fa-screens.jsx:840-886) wired Lane 12; Formulations/Risks/Docs out of scope here; gate-progress strip + right panel are T-137/T-138.',
    ].join('\n');
    writeFileSync(resolve(evidenceDir, 'T-136-parity-report.md'), report, 'utf-8');
    expect(report).toContain('fa_detail');
  });
});
