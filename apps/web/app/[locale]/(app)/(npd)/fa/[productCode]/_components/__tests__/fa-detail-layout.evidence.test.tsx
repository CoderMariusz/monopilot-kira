/**
 * @vitest-environment jsdom
 *
 * T-138 — FA detail layout parity-evidence capture.
 *
 * Emits a DOM snapshot per wiring scenario into the task evidence dir so the
 * closeout has a structural parity-diff artifact for the two-column shell +
 * persistent right panel + modal routing. Live Playwright/axe parity is T-139
 * (the spec is authored + skips without PLAYWRIGHT_BASE_URL). Same org-context /
 * i18n boundary mocks as the behavior suite.
 */
import React from 'react';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import FaDetailLayout from '../../layout';

let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/fa/FA0043',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParams.toString()),
}));

const { withOrgContextMock } = vi.hoisted(() => ({ withOrgContextMock: vi.fn() }));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (req?: string | { locale?: string; namespace?: string }) => {
    const locale = typeof req === 'object' ? (req.locale ?? 'en') : 'en';
    const namespace = typeof req === 'object' ? (req.namespace ?? '') : (req ?? '');
    const file = path.resolve(__dirname, `../../../../../../../../i18n/${locale}.json`);
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

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: withOrgContextMock,
}));

const ROW = {
  product_code: 'FA0043',
  product_name: 'Smoked Almond Yoghurt',
  status_overall: 'Complete',
  built: false,
  days_to_launch: 42,
  launch_date: '2026-09-01',
  created_at: '2026-04-15T16:21:00.000Z',
};

function wire(opts: { canRead?: boolean; canClose?: boolean; row?: Record<string, unknown> | null } = {}) {
  const { canRead = true, canClose = true, row = ROW } = opts;
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        if (/permissions|user_roles/i.test(sql)) {
          const perm = String(params?.[2] ?? '');
          if (perm.includes('close')) return { rows: canClose ? [{ ok: true }] : [] };
          return { rows: canRead ? [{ ok: true }] : [] };
        }
        if (/from\s+public\.(product|fa)/i.test(sql)) return { rows: row ? [row] : [] };
        return { rows: [] };
      }),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

const Child = () => <div data-testid="layout-children">tab content</div>;

async function renderLayout(productCode = 'FA0043') {
  const ui = await FaDetailLayout({
    children: <Child />,
    params: Promise.resolve({ locale: 'en', productCode }),
  } as never);
  return render(ui as React.ReactElement);
}

const OUT = path.resolve(
  __dirname,
  '../../../../../../../../../../_meta/atomic-tasks/01-npd/evidence/T-138',
);

beforeEach(() => {
  searchParams = new URLSearchParams();
  vi.clearAllMocks();
  mkdirSync(OUT, { recursive: true });
});
afterEach(() => cleanup());

describe('T-138 evidence — DOM snapshots per wiring scenario', () => {
  it('captures shell / deptClose-open / d365Build-open / forbidden-actions / empty', async () => {
    const dump = (name: string, html: string) =>
      writeFileSync(path.join(OUT, `dom-${name}.html`), html, 'utf-8');

    // 1. Two-column shell: left children + sticky right panel + wired actions.
    wire();
    let r = await renderLayout();
    dump('shell', r.container.innerHTML);
    cleanup();

    // 2. ?modal=deptClose → Dept Close dialog open.
    searchParams = new URLSearchParams('modal=deptClose');
    wire();
    r = await renderLayout();
    dump('modal-deptClose', document.body.innerHTML);
    cleanup();

    // 3. ?modal=d365Build → D365 Build dialog open (FA Complete).
    searchParams = new URLSearchParams('modal=d365Build');
    wire();
    r = await renderLayout();
    dump('modal-d365Build', document.body.innerHTML);
    cleanup();

    // 4. No npd.fa.close permission → Dept Close action disabled (RBAC server-side).
    searchParams = new URLSearchParams();
    wire({ canClose: false });
    r = await renderLayout();
    dump('forbidden-actions', r.container.innerHTML);
    cleanup();

    // 5. FA core missing → right panel empty, children still render.
    wire({ row: null });
    r = await renderLayout('FA-MISSING');
    dump('empty', r.container.innerHTML);
  });
});
