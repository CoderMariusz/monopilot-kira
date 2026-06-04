/**
 * @vitest-environment jsdom
 * T-058 — TEC-073 D365 DLQ Manager RTL tests (decision D-1: settings namespace).
 *
 * Prototype source:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:852-893 (DLQ table)
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:562-598 (resolve confirm modal)
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

import D365DlqPage from './page';
import type { DlqEntry } from './d365-dlq-screen.client';

// process.cwd() is apps/web under the UI vitest config; resolve route-relative.
const ROUTE = 'app/[locale]/(app)/(admin)/settings/integrations/d365/dlq';
const LEGACY = 'app/[locale]/(app)/(admin)/settings/d365-dlq/page.tsx';

function entry(over: Partial<DlqEntry> & { id: string }): DlqEntry {
  return {
    id: over.id,
    job_type: 'wo_confirmation',
    target_entity: 'wo_confirmation',
    direction: 'push',
    record_key: 'WO-1001',
    d365_item_id: null,
    error_message: 'D365 422 schema mismatch',
    error_detail: { code: 'SCHEMA', field: 'qty' },
    failed_payload: { wo_id: 'WO-1001', secret: 'redacted' },
    retry_count: 3,
    status: 'unresolved',
    failed_at: '2026-05-24T11:15:00.000Z',
    ...over,
  };
}

async function renderPage(props: Parameters<typeof D365DlqPage>[0] = {}) {
  const node = await D365DlqPage({ params: Promise.resolve({ locale: 'en' }), ...props });
  return render(React.createElement(React.Fragment, null, node));
}

afterEach(() => cleanup());

describe('T-058 DLQ Manager — route + server contract (decision D-1)', () => {
  it('lives under the canonical settings/integrations/d365/dlq AppShell namespace', () => {
    expect(existsSync(join(process.cwd(), ROUTE, 'page.tsx'))).toBe(true);
    expect(existsSync(join(process.cwd(), ROUTE, 'd365-dlq-screen.client.tsx'))).toBe(true);
    const legacySrc = readFileSync(join(process.cwd(), LEGACY), 'utf8');
    expect(legacySrc, 'legacy d365-dlq stub must redirect to the new namespace').toContain('redirect');
    expect(legacySrc).toContain('/settings/integrations/d365/dlq');
  });

  it('keeps page.tsx server-rendered and sources data via withOrgContext + d365_sync_dlq', () => {
    const src = readFileSync(join(process.cwd(), ROUTE, 'page.tsx'), 'utf8');
    expect(src.startsWith("'use client'")).toBe(false);
    expect(src).toContain("import { getTranslations } from 'next-intl/server'");
    expect(src).toContain('public.d365_sync_dlq');
    expect(src).toContain('hasD365SyncPermission');
    expect(src).not.toContain('React.useState');
  });
});

describe('T-058 DLQ Manager — behaviour', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the DLQ table with rows + payload viewer modal', async () => {
    await renderPage({ state: 'ready', canTrigger: true, entries: [entry({ id: 'a1' }), entry({ id: 'b2' })] });
    const root = screen.getByTestId('settings-d365-dlq-screen');
    expect(root).toHaveAttribute('data-route', '/settings/integrations/d365/dlq');
    expect(root).toHaveAttribute('data-prototype-source', expect.stringContaining('other-screens.jsx:852-893'));
    expect(screen.getAllByTestId('d365-dlq-row')).toHaveLength(2);

    const user = userEvent.setup();
    await user.click(within(screen.getAllByTestId('d365-dlq-row')[0]).getByRole('button', { name: /view payload/i }));
    const modal = await screen.findByTestId('d365-dlq-payload-modal');
    expect(within(modal).getByTestId('d365-dlq-payload-json')).toHaveAttribute('aria-readonly', 'true');
  });

  it('shows the threshold banner when unresolved DLQ depth > 50', async () => {
    const many = Array.from({ length: 51 }, (_, i) => entry({ id: `row-${i}` }));
    await renderPage({ state: 'ready', canTrigger: true, entries: many });
    expect(screen.getByTestId('d365-dlq-threshold-banner')).toHaveTextContent(/51/);
  });

  it('does NOT show the threshold banner at or below 50', async () => {
    const some = Array.from({ length: 50 }, (_, i) => entry({ id: `row-${i}` }));
    await renderPage({ state: 'ready', canTrigger: true, entries: some });
    expect(screen.queryByTestId('d365-dlq-threshold-banner')).not.toBeInTheDocument();
  });

  it('disables row actions when the caller lacks technical.d365.sync_trigger', async () => {
    await renderPage({ state: 'ready', canTrigger: false, entries: [entry({ id: 'a1' })] });
    const row = screen.getByTestId('d365-dlq-row');
    expect(within(row).getByRole('button', { name: /^retry/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: /^mark resolved/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: /^skip/i })).toBeDisabled();
  });

  it('calls the retry action after the confirm modal and optimistically updates status', async () => {
    const retry = vi.fn(async () => ({ ok: true as const }));
    await renderPage({
      state: 'ready',
      canTrigger: true,
      entries: [entry({ id: 'a1' })],
      actions: { retry, markResolved: vi.fn(async () => ({ ok: true as const })), skip: vi.fn(async () => ({ ok: true as const })) },
    });
    const user = userEvent.setup();
    await user.click(within(screen.getByTestId('d365-dlq-row')).getByRole('button', { name: /^retry/i }));
    const confirmModal = await screen.findByTestId('d365-dlq-confirm-modal');
    await user.click(within(confirmModal).getByRole('button', { name: /confirm retry/i }));
    expect(retry).toHaveBeenCalledWith('a1');
    expect(screen.getByTestId('d365-dlq-row')).toHaveAttribute('data-status', 'retried');
  });

  it('renders the permission-denied state', async () => {
    await renderPage({ state: 'forbidden', canTrigger: false, entries: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/sync_trigger|access denied/i);
  });

  it('renders the empty state', async () => {
    await renderPage({ state: 'ready', canTrigger: true, entries: [] });
    expect(screen.getByTestId('d365-dlq-empty')).toBeInTheDocument();
  });
});
