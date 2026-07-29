/**
 * FALA 7/8 — receive-po lines screen: Banner must not duplicate title into children.
 * receive-po-item-screen was fixed in the prior round; this sibling route was missed.
 */
import '@testing-library/jest-dom/vitest';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { getScannerLabels } from '../../../../../_components/scanner-labels';
import { ReceivePoLinesScreen } from '../receive-po-lines-screen';

const replace = vi.fn();
const push = vi.fn();
const scannerFetch = vi.fn();
const mockSession = { token: 'tok', user: { id: 'user-1', name: 'Jan Kowalski' } };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
}));

vi.mock('../../../../../_components/scanner-session', () => ({
  useScannerSession: () => ({
    ready: true,
    session: mockSession,
    scannerFetch,
  }),
}));

const labels = getScannerLabels('en');
const L = labels.receivePo;

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  scannerFetch.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReceivePoLinesScreen — error banners render once', () => {
  it('shows not-found exactly once (not duplicated in title + body)', async () => {
    scannerFetch.mockImplementation((path: string) => {
      if (path.includes('/pos/missing')) {
        return jsonResponse({ ok: false, error: 'po_not_found' }, 404);
      }
      return jsonResponse({ ok: true, locations: [] });
    });

    render(<ReceivePoLinesScreen locale="en" poId="missing" labels={labels} />);

    await waitFor(() => expect(screen.getAllByText(L.poNotFound)).toHaveLength(1));
    expect(screen.queryByText(L.errorLoad)).not.toBeInTheDocument();
  });

  it('shows permission-denied exactly once', async () => {
    scannerFetch.mockImplementation(() => jsonResponse({}, 403));

    render(<ReceivePoLinesScreen locale="en" poId="po-1" labels={labels} />);

    await waitFor(() => expect(screen.getAllByText(L.permissionDenied)).toHaveLength(1));
  });

  it('shows load error exactly once', async () => {
    scannerFetch.mockImplementation(() => jsonResponse({ ok: false }, 500));

    render(<ReceivePoLinesScreen locale="en" poId="po-1" labels={labels} />);

    await waitFor(() => expect(screen.getAllByText(L.errorLoad)).toHaveLength(1));
  });
});
