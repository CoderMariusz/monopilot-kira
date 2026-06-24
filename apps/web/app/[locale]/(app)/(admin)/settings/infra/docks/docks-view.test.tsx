/**
 * @vitest-environment jsdom
 * WAVE E5 — /settings/infra/docks RTL tests (jsdom, vitest.ui.config.ts).
 *
 * Exercises the dock-door management view against injected seams + server-
 * resolved state: list render, server-resolved permission-denied / empty,
 * the add/edit dialog upserting a dock door, and the RBAC affordance gate.
 */
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The view now builds its labels client-side via useTranslations('Yard'); mock
// next-intl with a translator backed by the real Yard namespace so the rendered
// strings stay the real i18n values (no server→client function-prop boundary).
vi.mock('next-intl', () => {
  const tree = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'i18n', 'en.json'), 'utf8'),
  ) as Record<string, unknown>;
  function translatorFor(namespace?: string) {
    const root = namespace
      ? (namespace.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], tree))
      : tree;
    return (key: string, values?: Record<string, string | number>) => {
      const raw = key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)?.[k], root);
      if (typeof raw !== 'string') return `${namespace ?? ''}.${key}`;
      return values ? raw.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`)) : raw;
    };
  }
  return { useTranslations: (namespace?: string) => translatorFor(namespace) };
});

import { DocksView } from './docks-view.client';
import type { DockDoorRow } from '../../../../(modules)/yard/_components/yard-shared';

const DOCK: DockDoorRow = {
  id: 'd-1',
  siteId: null,
  warehouseId: 'wh-1',
  code: 'DOCK-1',
  name: 'North bay',
  direction: 'inbound',
  isActive: true,
};

function renderView(over: Partial<React.ComponentProps<typeof DocksView>> = {}) {
  return render(
    <DocksView
      initialDocks={[DOCK]}
      warehouses={[{ id: 'wh-1', name: 'Raw materials' }]}
      canManage
      upsertDockDoorAction={vi.fn(async () => DOCK)}
      state="ready"
      {...over}
    />,
  );
}

describe('/settings/infra/docks — DocksView', () => {
  it('lists dock doors with direction + warehouse + status', () => {
    renderView();
    const row = screen.getByTestId('dock-row-DOCK-1');
    expect(row).toHaveTextContent('DOCK-1');
    expect(row).toHaveTextContent('North bay');
    expect(row).toHaveTextContent('Inbound');
    expect(row).toHaveTextContent('Raw materials');
    expect(row).toHaveTextContent('Active');
  });

  it('renders the server-resolved permission-denied note', () => {
    renderView({ state: 'forbidden', initialDocks: [] });
    expect(screen.getByTestId('docks-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('docks-table')).toBeNull();
  });

  it('renders the server-resolved empty state', () => {
    renderView({ state: 'empty', initialDocks: [] });
    expect(screen.getByTestId('docks-empty')).toBeInTheDocument();
  });

  it('requires a code before submitting the add dialog', async () => {
    const upsertDockDoorAction = vi.fn(async () => DOCK);
    renderView({ upsertDockDoorAction });

    fireEvent.click(screen.getByTestId('docks-add'));
    await waitFor(() => expect(screen.getByTestId('dock-form')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('dock-submit'));
    await waitFor(() => expect(screen.getByTestId('dock-form-error')).toBeInTheDocument());
    expect(screen.getByTestId('dock-form-error')).toHaveTextContent('Code is required.');
    expect(upsertDockDoorAction).not.toHaveBeenCalled();
  });

  it('upserts a new dock door with the chosen direction + warehouse', async () => {
    const created: DockDoorRow = { ...DOCK, id: 'd-2', code: 'DOCK-2', name: 'South bay', direction: 'outbound' };
    const upsertDockDoorAction = vi.fn(async () => created);
    renderView({ upsertDockDoorAction });

    fireEvent.click(screen.getByTestId('docks-add'));
    await waitFor(() => expect(screen.getByTestId('dock-form')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('dock-code'), { target: { value: 'DOCK-2' } });
    fireEvent.change(screen.getByTestId('dock-name'), { target: { value: 'South bay' } });
    fireEvent.click(screen.getByTestId('dock-submit'));

    await waitFor(() =>
      expect(upsertDockDoorAction).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'DOCK-2', name: 'South bay', direction: 'inbound', isActive: true }),
      ),
    );
    // The new row joins the table after the upsert resolves.
    await waitFor(() => expect(screen.getByTestId('dock-row-DOCK-2')).toBeInTheDocument());
  });

  it('maps a forbidden upsert rejection to the inline forbidden error', async () => {
    const upsertDockDoorAction = vi.fn(async () => {
      throw new Error('forbidden');
    });
    renderView({ upsertDockDoorAction });

    fireEvent.click(screen.getByTestId('docks-add'));
    await waitFor(() => expect(screen.getByTestId('dock-form')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('dock-code'), { target: { value: 'DOCK-3' } });
    fireEvent.click(screen.getByTestId('dock-submit'));

    await waitFor(() => expect(screen.getByTestId('dock-form-error')).toBeInTheDocument());
    expect(screen.getByTestId('dock-form-error')).toHaveTextContent('You do not have permission to edit dock doors.');
  });

  it('disables the add affordance when the caller cannot manage docks', () => {
    renderView({ canManage: false });
    const add = screen.getByTestId('docks-add');
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute('aria-label', expect.stringContaining('permission'));
  });
});
