/**
 * SCN-QC — Scanner QC inspection screen RTL test.
 *
 * Parity: prototypes/design/Monopilot Design System/quality/inspection-screens.jsx
 *   (QaInspectionDetail PASS/FAIL/HOLD decision) in the scanner visual language.
 *
 * Covers the five states + the wire contract: scan LP → GET
 * /api/warehouse/scanner/lp?code=… (200 lp / 404 lp_not_found) → PASS/FAIL/HOLD →
 * POST /api/quality/scanner/inspect { clientOpId, lpId, decision, note? } →
 * { ok, inspectionId, qaStatus } → success banner with the new qaStatus + Scan next.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { QaScreen } from '../qa-screen';
import {
  ScannerSessionProvider,
  SCANNER_SESSION_STORAGE_KEY,
} from '../../../../_components/scanner-session';
import { getScannerLabels } from '../../../../_components/scanner-labels';

const replace = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  useParams: () => ({ locale: 'en' }),
}));

const labels = getScannerLabels('en');

function seedSession() {
  window.sessionStorage.setItem(
    SCANNER_SESSION_STORAGE_KEY,
    JSON.stringify({ token: 'tok-abc', user: { id: 'u1', name: 'QA One' } }),
  );
}

function renderScreen() {
  return render(
    <ScannerSessionProvider>
      <QaScreen locale="en" labels={labels} />
    </ScannerSessionProvider>,
  );
}

const LP = {
  id: 'lp-uuid-1',
  lpNumber: 'LP-4820',
  productCode: 'RM-1001',
  productName: 'Beef trim',
  quantity: '120',
  uom: 'kg',
  qaStatus: 'pending',
  expiryDate: '2026-05-10',
  locationCode: 'A-01-02',
};

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QaScreen (scanner QC)', () => {
  it('permission-denied: no session redirects to login', async () => {
    renderScreen();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/scanner/login'));
  });

  it('scans an LP, shows its summary, and submits a PASS decision with clientOpId + lpId', async () => {
    seedSession();
    const fetchMock = vi
      .fn()
      // GET lp lookup
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ lp: LP }) })
      // POST inspect
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, inspectionId: 'ins-1', qaStatus: 'released' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderScreen();
    await screen.findByTestId('qa-prompt');

    const input = screen.getByPlaceholderText(labels.qaScreen.scanPlaceholder);
    fireEvent.change(input, { target: { value: 'LP-4820' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await screen.findByTestId('qa-lp-summary');
    expect(screen.getByText('Beef trim')).toBeInTheDocument();

    // GET hit the documented endpoint
    expect(fetchMock.mock.calls[0][0]).toContain('/api/warehouse/scanner/lp?code=LP-4820');

    fireEvent.click(screen.getByTestId('qa-decide-pass'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [postUrl, postInit] = fetchMock.mock.calls[1];
    expect(postUrl).toBe('/api/quality/scanner/inspect');
    const body = JSON.parse((postInit as { body: string }).body);
    expect(body).toMatchObject({ lpId: 'lp-uuid-1', decision: 'pass' });
    expect(typeof body.clientOpId).toBe('string');
    expect(body.clientOpId.length).toBeGreaterThan(0);

    // success banner shows the new qaStatus + scan next
    await screen.findByTestId('qa-done');
    expect(within(screen.getByTestId('qa-new-status')).getByText('Released')).toBeInTheDocument();
    expect(screen.getByText(labels.qaScreen.scanNext)).toBeInTheDocument();
  });

  it('not-found: a 404 lp_not_found renders the not-found banner AND turns the scan ring red (field stays open)', async () => {
    seedSession();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'lp_not_found' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderScreen();
    await screen.findByTestId('qa-prompt');
    const input = screen.getByPlaceholderText(labels.qaScreen.scanPlaceholder);
    fireEvent.change(input, { target: { value: 'LP-NOPE' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await screen.findByTestId('qa-not-found');

    // the scan field stays visible and its ring turns RED (was a no-op tautology).
    const ringInput = screen.getByPlaceholderText(labels.qaScreen.scanPlaceholder);
    expect(ringInput).toBeInTheDocument();
    expect(ringInput).toHaveStyle({ border: '2px solid #ef4444' });

    // typing again clears the error ring (back to scan phase).
    fireEvent.change(ringInput, { target: { value: 'LP-RETRY' } });
    expect(screen.queryByTestId('qa-not-found')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.qaScreen.scanPlaceholder)).not.toHaveStyle({
      border: '2px solid #ef4444',
    });
  });

  it('error: a non-401 failure shows the error banner with retry AND a red scan ring', async () => {
    seedSession();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    renderScreen();
    await screen.findByTestId('qa-prompt');
    const input = screen.getByPlaceholderText(labels.qaScreen.scanPlaceholder);
    fireEvent.change(input, { target: { value: 'LP-X' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await screen.findByTestId('qa-error');
    expect(within(screen.getByTestId('qa-error')).getByText(labels.qaScreen.retry)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(labels.qaScreen.scanPlaceholder)).toHaveStyle({
      border: '2px solid #ef4444',
    });
  });
});
