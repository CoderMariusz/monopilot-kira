/**
 * @vitest-environment jsdom
 *
 * Platform audit log page — parity + states + i18n + RBAC (guarded reader) + pagination.
 *
 * Parity anchor:
 *   prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 *   .plat-top topbar (82-90), audit table + coloured .audit-action chips
 *   (104-108, 302-315), .btn-secondary back/pager (40-41).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../i18n/en.json';

const platformMessages = (enMessages as { platform: Record<string, string> }).platform;

function translate(key: string, values?: Record<string, string | number>): string {
  const template = platformMessages[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(values?.[k] ?? ''));
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => translate),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

const state = vi.hoisted(() => ({
  page: {
    entries: [] as unknown[],
    page: 1,
    hasNext: false,
  },
  throws: false,
}));

vi.mock('../../../../../lib/platform/queries', () => ({
  listPlatformAuditPage: vi.fn(async () => {
    if (state.throws) throw new Error('boom');
    return state.page;
  }),
}));

const pagePath = path.resolve(process.cwd(), 'app/[locale]/(platform)/platform/audit/page.tsx');

async function renderPage(pageParam?: string) {
  const mod = (await import(/* @vite-ignore */ pagePath)) as {
    default: (props: {
      params: Promise<{ locale: 'en' }>;
      searchParams: Promise<{ page?: string }>;
    }) => Promise<React.ReactNode>;
  };
  const node = await mod.default({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(pageParam ? { page: pageParam } : {}),
  });
  return render(<>{node}</>);
}

const ENTRY = {
  id: 'pa-9',
  occurredAt: '2026-07-02T09:41:00.000Z',
  actorEmail: 'owner@monopilot.test',
  action: 'platform.admin.added',
  kind: 'admin' as const,
  orgCode: null,
  detail: 'Added platform admin kim@acme.com',
};

beforeEach(() => {
  state.page = { entries: [], page: 1, hasNext: false };
  state.throws = false;
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('Platform audit log — chrome + parity', () => {
  it('renders the dark platform topbar and a back link to the console', async () => {
    state.page = { entries: [ENTRY], page: 1, hasNext: false };
    await renderPage();

    const topbar = screen.getByTestId('platform-audit-topbar');
    expect(within(topbar).getByText('PLATFORM')).toBeInTheDocument();
    expect(screen.getByTestId('platform-audit-back')).toHaveAttribute('href', '/en/platform');
  });

  it('renders a row per audit entry with the coloured action chip + detail', async () => {
    state.page = { entries: [ENTRY], page: 1, hasNext: false };
    await renderPage();

    const row = screen.getByTestId('platform-audit-log-row-pa-9');
    expect(within(row).getByText('platform.admin.added')).toBeInTheDocument();
    expect(within(row).getByText('owner@monopilot.test')).toBeInTheDocument();
    expect(within(row).getByText('Added platform admin kim@acme.com')).toBeInTheDocument();
    expect(within(row).getByText('2026-07-02 09:41')).toBeInTheDocument();
  });
});

describe('Platform audit log — states', () => {
  it('renders the empty state when there are no entries', async () => {
    await renderPage();
    expect(screen.getByTestId('platform-audit-log-empty')).toBeInTheDocument();
  });

  it('renders the error state when the guarded reader throws', async () => {
    state.throws = true;
    await renderPage();
    expect(screen.getByTestId('platform-audit-log-error')).toBeInTheDocument();
  });
});

describe('Platform audit log — pagination', () => {
  it('links to the next page and disables prev on page 1 when hasNext', async () => {
    state.page = { entries: [ENTRY], page: 1, hasNext: true };
    await renderPage('1');

    expect(screen.getByTestId('platform-audit-next')).toHaveAttribute('href', '/en/platform/audit?page=2');
    expect(screen.getByTestId('platform-audit-prev-disabled')).toBeInTheDocument();
    expect(screen.queryByTestId('platform-audit-prev')).not.toBeInTheDocument();
    expect(screen.getByTestId('platform-audit-page-indicator')).toHaveTextContent('Page 1');
  });

  it('links to the previous page and disables next on the last page (!hasNext)', async () => {
    state.page = { entries: [ENTRY], page: 3, hasNext: false };
    await renderPage('3');

    expect(screen.getByTestId('platform-audit-prev')).toHaveAttribute('href', '/en/platform/audit?page=2');
    expect(screen.getByTestId('platform-audit-next-disabled')).toBeInTheDocument();
    expect(screen.queryByTestId('platform-audit-next')).not.toBeInTheDocument();
  });

  it('renders the empty state (no crash) beyond the last page', async () => {
    // Out-of-range page: reader returns no rows + hasNext false at that offset.
    state.page = { entries: [], page: 9, hasNext: false };
    await renderPage('9');

    expect(screen.getByTestId('platform-audit-log-empty')).toBeInTheDocument();
    // Prev remains available so the admin can walk back; Next is disabled.
    expect(screen.getByTestId('platform-audit-prev')).toHaveAttribute('href', '/en/platform/audit?page=8');
    expect(screen.getByTestId('platform-audit-next-disabled')).toBeInTheDocument();
  });
});

describe('Platform audit log — i18n', () => {
  it('defines the audit-log keys in all four locales', () => {
    const keys = ['auditLogTitle', 'auditLogBack', 'auditLogPrev', 'auditLogNext', 'auditLogPage'];
    for (const locale of ['en', 'pl', 'ro', 'uk'] as const) {
      const filePath = path.resolve(process.cwd(), `i18n/${locale}.json`);
      expect(existsSync(filePath), `${locale}.json`).toBe(true);
      const messages = JSON.parse(readFileSync(filePath, 'utf8')) as { platform?: Record<string, string> };
      for (const k of keys) {
        expect(typeof messages.platform?.[k], `${locale}.platform.${k}`).toBe('string');
      }
    }
  });
});
