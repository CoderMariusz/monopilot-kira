/**
 * @vitest-environment jsdom
 *
 * T-137 — FA right panel parity-evidence capture.
 *
 * Emits a DOM snapshot per required UI state into the task evidence dir so the
 * closeout has a structural parity-diff artifact (Playwright/axe is deferred to
 * T-138/T-139 wiring — this component is not yet route-mounted). The same
 * org-context/i18n boundary mocks as the behavior suite are used.
 */
import React from 'react';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import { FaRightPanel, FaRightPanelSkeleton } from '../fa-right-panel';

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

const READY_ROW = {
  product_code: 'FA0043',
  product_name: 'Smoked Almond Yoghurt',
  status_overall: 'InProgress',
  built: false,
  days_to_launch: 42,
  launch_date: '2026-09-01',
  created_at: '2026-04-15T16:21:00.000Z',
};

function wire(opts: { canRead?: boolean; row?: Record<string, unknown> | null } = {}) {
  const { canRead = true, row = READY_ROW } = opts;
  withOrgContextMock.mockImplementation(async (cb: (ctx: unknown) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/permissions|user_roles/i.test(sql)) return { rows: canRead ? [{ ok: true }] : [] };
        if (/from\s+public\.(product|fa)/i.test(sql)) return { rows: row ? [row] : [] };
        return { rows: [] };
      }),
    };
    return cb({ userId: 'u1', orgId: 'o1', client });
  });
}

const OUT = path.resolve(__dirname, '../../../../../../../../../../_meta/atomic-tasks/01-npd/evidence/T-137');

beforeEach(() => {
  vi.clearAllMocks();
  mkdirSync(OUT, { recursive: true });
});
afterEach(() => cleanup());

describe('T-137 evidence — DOM snapshots per state', () => {
  it('captures ready / built / empty / forbidden / error / loading', async () => {
    const dump = (name: string, html: string) =>
      writeFileSync(path.join(OUT, `dom-${name}.html`), html, 'utf-8');

    wire();
    let r = render(await FaRightPanel({ locale: 'en', productCode: 'FA0043' }));
    dump('ready', r.container.innerHTML);
    cleanup();

    wire({ row: { ...READY_ROW, built: true, status_overall: 'Built' } });
    r = render(await FaRightPanel({ locale: 'en', productCode: 'FA0043' }));
    dump('built', r.container.innerHTML);
    cleanup();

    wire({ row: null });
    r = render(await FaRightPanel({ locale: 'en', productCode: 'FA-MISSING' }));
    dump('empty', r.container.innerHTML);
    cleanup();

    wire({ canRead: false });
    r = render(await FaRightPanel({ locale: 'en', productCode: 'FA0043' }));
    dump('forbidden', r.container.innerHTML);
    cleanup();

    withOrgContextMock.mockRejectedValue(new Error('boom'));
    r = render(await FaRightPanel({ locale: 'en', productCode: 'FA0043' }));
    dump('error', r.container.innerHTML);
    cleanup();

    r = render(<FaRightPanelSkeleton />);
    dump('loading', r.container.innerHTML);
  });
});
