/**
 * T-054 / SM-08 — D365TestConnectionModal RED tests.
 * Source of truth: prototypes/design/Monopilot Design System/settings/modals.jsx:450-489
 * RED scope: tests only; production component is intentionally not implemented here.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertModalA11y } from '../../../../../packages/ui/test/assertModalA11y';

type D365ConnectionResult =
  | { status: 'ok'; latencyMs: number; environment: string }
  | { status: 'error'; reason: string };

type D365TestConnectionModalProps = {
  defaultOpen?: boolean;
  environmentUrl: string;
  testConnection: () => Promise<D365ConnectionResult>;
  onOpenChange?: (open: boolean) => void;
};

const environmentUrl = 'https://apex.operations.dynamics.com';

async function loadD365TestConnectionModal() {
  const target = './d365-test-connection-modal';
  const module = await import(/* @vite-ignore */ target).catch(() => null);

  expect(
    module,
    'apps/web/components/settings/modals/d365-test-connection-modal.tsx should exist and export SM-08 D365TestConnectionModal',
  ).not.toBeNull();

  const component = module?.D365TestConnectionModal ?? module?.default;
  expect(component, 'D365TestConnectionModal must be exported as a renderable React component').toEqual(
    expect.any(Function),
  );

  return component as React.ComponentType<D365TestConnectionModalProps>;
}

async function renderD365TestConnectionModal(overrides: Partial<D365TestConnectionModalProps> = {}) {
  const D365TestConnectionModal = await loadD365TestConnectionModal();
  const props: D365TestConnectionModalProps = {
    defaultOpen: true,
    environmentUrl,
    testConnection: vi.fn().mockResolvedValue({ status: 'ok', latencyMs: 238, environment: 'Production' }),
    onOpenChange: vi.fn(),
    ...overrides,
  };

  const rtl = render(<D365TestConnectionModal {...props} />);
  return { ...rtl, props };
}

function getDialog() {
  return screen.getByRole('dialog', { name: /test d365 connection/i });
}

function visibleFooterButtonNames(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('button')
    .map((button: HTMLElement) => button.textContent?.trim() || button.getAttribute('aria-label') || '')
    .filter((name: string) => !/^close dialog$/i.test(name));
}

function modalOutline(dialog: HTMLElement) {
  const scoped = within(dialog);
  return {
    testId: dialog.closest('[data-testid="d365-test-connection-modal"]')?.getAttribute('data-testid'),
    modalId: dialog.getAttribute('data-modal-id'),
    size: dialog.getAttribute('data-size'),
    title: scoped.getByRole('heading', { name: /test d365 connection/i }).textContent,
    regionLabels: within(dialog)
      .getAllByRole('status')
      .map((region) => region.getAttribute('aria-label') || region.textContent?.replace(/\s+/g, ' ').trim()),
    environmentUrl: scoped.getByText(environmentUrl).textContent,
    footerButtons: visibleFooterButtonNames(dialog),
    rawHtmlDrift: dialog.querySelectorAll('select, dialog').length,
    buttonPrimitiveSlots: within(dialog)
      .getAllByRole('button')
      .map((button) => button.closest('[data-slot="button"]')?.getAttribute('data-slot') ?? null),
  };
}

describe('SM-08 D365TestConnectionModal prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens from the SM-08 trigger and matches the running-state structure, primitives, footer order, focus order, RTL snapshot, and a11y contract', async () => {
    const user = userEvent.setup();
    let resolveConnection!: (value: D365ConnectionResult) => void;
    const testConnection = vi.fn(
      () =>
        new Promise<D365ConnectionResult>((resolve) => {
          resolveConnection = resolve;
        }),
    );
    const { container } = await renderD365TestConnectionModal({ defaultOpen: false, testConnection });

    const trigger = screen.getByRole('button', { name: /^test connection$/i });
    expect(trigger).toHaveAttribute('aria-controls', 'SM-08');
    expect(trigger).toHaveAttribute('data-modal-trigger', 'SM-08');

    await user.click(trigger);
    const dialog = getDialog();
    const scoped = within(dialog);

    await waitFor(() => expect(testConnection).toHaveBeenCalledTimes(1));
    expect(scoped.getByRole('status', { name: /connecting to d365 environment/i })).toHaveTextContent(
      /connecting to d365 environment/i,
    );
    expect(scoped.getByText('⟳')).toHaveAttribute('aria-hidden', 'true');
    expect(scoped.getByRole('button', { name: /^cancel$/i })).toBeEnabled();
    expect(scoped.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();

    expect(modalOutline(dialog)).toMatchInlineSnapshot(`
      {
        "buttonPrimitiveSlots": [
          "button",
        ],
        "environmentUrl": "https://apex.operations.dynamics.com",
        "footerButtons": [
          "Cancel",
        ],
        "modalId": "SM-08",
        "rawHtmlDrift": 0,
        "regionLabels": [
          "Connecting to D365 environment… https://apex.operations.dynamics.com",
        ],
        "size": "sm",
        "testId": "d365-test-connection-modal",
        "title": "Test D365 connection",
      }
    `);

    expect(scoped.getByRole('button', { name: /^cancel$/i })).toHaveFocus();
    await user.tab();
    expect(scoped.getByRole('button', { name: /^cancel$/i })).toHaveFocus();

    await assertModalA11y(container);
    resolveConnection({ status: 'ok', latencyMs: 238, environment: 'Production' });
  });

  it('renders the successful result state with latency and environment provenance from the Server Action result', async () => {
    const testConnection = vi.fn().mockResolvedValue({ status: 'ok', latencyMs: 238, environment: 'Production' });
    await renderD365TestConnectionModal({ testConnection });

    const dialog = getDialog();
    const scoped = within(dialog);

    await waitFor(() => expect(testConnection).toHaveBeenCalledTimes(1));
    expect(await scoped.findByText('Connection successful')).toBeInTheDocument();
    expect(scoped.getByText('✓')).toHaveClass(expect.stringMatching(/green|success/i));
    expect(scoped.getByText(/latency:/i)).toHaveTextContent('Latency: 238ms · Environment: Production');
    expect(scoped.getByRole('button', { name: /^close$/i })).toBeEnabled();
    expect(scoped.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it('shows {status:error, reason} on failure and enables Retry to run the test again', async () => {
    const user = userEvent.setup();
    const testConnection = vi
      .fn<() => Promise<D365ConnectionResult>>()
      .mockResolvedValueOnce({ status: 'error', reason: 'ERR_AAD_TOKEN_INVALID' })
      .mockResolvedValueOnce({ status: 'ok', latencyMs: 241, environment: 'Production' });

    await renderD365TestConnectionModal({ testConnection });
    const dialog = getDialog();
    const scoped = within(dialog);

    await waitFor(() => expect(testConnection).toHaveBeenCalledTimes(1));
    expect(await scoped.findByText('Connection failed')).toBeInTheDocument();
    expect(scoped.getByRole('alert')).toHaveTextContent('ERR_AAD_TOKEN_INVALID');
    expect(scoped.getByText(/check tenant id and client secret, then retry/i)).toBeInTheDocument();

    const retry = scoped.getByRole('button', { name: /^retry$/i });
    expect(retry).toBeEnabled();
    expect(visibleFooterButtonNames(dialog)).toEqual(['Close', 'Retry']);

    await user.click(retry);
    expect(scoped.getByRole('status', { name: /connecting to d365 environment/i })).toBeInTheDocument();
    await waitFor(() => expect(testConnection).toHaveBeenCalledTimes(2));
    expect(await scoped.findByText('Connection successful')).toBeInTheDocument();
  });
});
