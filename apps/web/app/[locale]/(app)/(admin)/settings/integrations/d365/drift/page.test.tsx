/**
 * @vitest-environment jsdom
 * T-059 — TEC-091 D365 Drift Resolution RTL tests (decision D-1: settings namespace).
 *
 * Prototype source:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:852-893 (drift table)
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:562-598 (resolve modal)
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

import D365DriftPage from './page';
import type { DriftEvent } from './d365-drift-screen.client';

// process.cwd() is apps/web under the UI vitest config; resolve route-relative.
const ROUTE = 'app/[locale]/(app)/(admin)/settings/integrations/d365/drift';

function ev(over: Partial<DriftEvent> & { id: string }): DriftEvent {
  return {
    id: over.id,
    occurred_at: '2026-05-24T11:15:00.000Z',
    resource_id: '00000000-0000-4000-8000-000000000099',
    entity: 'item.item_type',
    item_code: 'FG1001',
    mp_value: 'fg',
    d365_value: 'rm',
    ...over,
  };
}

async function renderPage(props: Parameters<typeof D365DriftPage>[0] = {}) {
  const node = await D365DriftPage({ params: Promise.resolve({ locale: 'en' }), ...props });
  return render(React.createElement(React.Fragment, null, node));
}

afterEach(() => cleanup());

describe('T-059 Drift Resolution — route + server contract (decision D-1)', () => {
  it('lives under the canonical settings/integrations/d365/drift AppShell namespace', () => {
    expect(existsSync(join(process.cwd(), ROUTE, 'page.tsx'))).toBe(true);
    expect(existsSync(join(process.cwd(), ROUTE, 'd365-drift-screen.client.tsx'))).toBe(true);
  });

  it('reads d365_drift audit_log rows via withOrgContext and is server-rendered', () => {
    const src = readFileSync(join(process.cwd(), ROUTE, 'page.tsx'), 'utf8');
    expect(src.startsWith("'use client'")).toBe(false);
    expect(src).toContain("import { getTranslations } from 'next-intl/server'");
    expect(src).toContain("action = 'd365_drift'");
    expect(src).toContain('hasD365SyncPermission');
    expect(src).not.toContain('React.useState');
  });

  it('forbids legacy FA-* vocabulary in the screen source', () => {
    const src = readFileSync(join(process.cwd(), ROUTE, 'd365-drift-screen.client.tsx'), 'utf8');
    expect(src).not.toMatch(/FA-\d|FA5\d{3}|Factory Article/);
  });
});

describe('T-059 Drift Resolution — behaviour', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the drift table with bulk action buttons disabled until rows selected', async () => {
    await renderPage({ state: 'ready', canTrigger: true, events: [ev({ id: 'aaaaaaaa-0000-4000-8000-000000000001' })] });
    const root = screen.getByTestId('settings-d365-drift-screen');
    expect(root).toHaveAttribute('data-route', '/settings/integrations/d365/drift');
    expect(screen.getAllByTestId('d365-drift-row')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /accept selected/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /reject selected/i })).toBeDisabled();
  });

  it('opens the per-row resolve modal with MP→D365 / D365→MP direction radios + reason min-10 gate', async () => {
    const resolve = vi.fn(async () => ({ ok: true as const }));
    await renderPage({
      state: 'ready', canTrigger: true,
      events: [ev({ id: 'aaaaaaaa-0000-4000-8000-000000000001' })],
      actions: { resolve, bulkResolve: vi.fn(async () => ({ ok: true as const, resolved: 0, blocked: 0, warnings: 0 })) },
    });
    const user = userEvent.setup();
    await user.click(within(screen.getByTestId('d365-drift-row')).getByRole('button', { name: /^resolve/i }));
    const modal = await screen.findByTestId('d365-drift-resolve-modal');
    expect(within(modal).getByRole('radio', { name: /MP → D365/i })).toBeInTheDocument();
    expect(within(modal).getByRole('radio', { name: /D365 → MP/i })).toBeInTheDocument();

    const apply = within(modal).getByRole('button', { name: /apply resolution/i });
    expect(apply).toBeDisabled(); // reason too short
    await user.type(within(modal).getByLabelText(/reason/i), 'corrected in MP per ECO-2044');
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      driftId: 'aaaaaaaa-0000-4000-8000-000000000001',
      resolution: 'accept',
      direction: 'mp_wins',
    }));
    // optimistic removal
    expect(screen.queryByTestId('d365-drift-row')).not.toBeInTheDocument();
  });

  it('bulk-accepts a selection of 3 rows via the resolve modal', async () => {
    const bulkResolve = vi.fn(async () => ({ ok: true as const, resolved: 3, blocked: 0, warnings: 0 }));
    const events = [1, 2, 3].map((n) => ev({ id: `aaaaaaaa-0000-4000-8000-00000000000${n}` }));
    await renderPage({
      state: 'ready', canTrigger: true, events,
      actions: { resolve: vi.fn(async () => ({ ok: true as const })), bulkResolve },
    });
    const user = userEvent.setup();
    for (const row of screen.getAllByTestId('d365-drift-row')) {
      await user.click(within(row).getByRole('checkbox'));
    }
    await user.click(screen.getByRole('button', { name: /accept selected/i }));
    const modal = await screen.findByTestId('d365-drift-resolve-modal');
    await user.type(within(modal).getByLabelText(/reason/i), 'bulk accept per audit review');
    await user.click(within(modal).getByRole('button', { name: /apply resolution/i }));
    expect(bulkResolve).toHaveBeenCalledWith(expect.objectContaining({
      resolution: 'accept',
      reason: 'bulk accept per audit review',
    }));
    expect(bulkResolve.mock.calls[0][0].drifts).toHaveLength(3);
  });

  it('disables bulk + row actions when the caller lacks technical.d365.sync_trigger', async () => {
    await renderPage({ state: 'ready', canTrigger: false, events: [ev({ id: 'aaaaaaaa-0000-4000-8000-000000000001' })] });
    expect(screen.getByRole('button', { name: /accept selected/i })).toBeDisabled();
    expect(within(screen.getByTestId('d365-drift-row')).getByRole('button', { name: /^resolve/i })).toBeDisabled();
    expect(within(screen.getByTestId('d365-drift-row')).getByRole('checkbox')).toBeDisabled();
  });

  it('renders permission-denied + empty states', async () => {
    const { unmount } = await renderPage({ state: 'forbidden', canTrigger: false, events: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/sync_trigger|access denied/i);
    unmount();
    await renderPage({ state: 'ready', canTrigger: true, events: [] });
    expect(screen.getByTestId('d365-drift-empty')).toBeInTheDocument();
  });
});
