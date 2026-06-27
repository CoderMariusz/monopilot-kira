import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getScannerLabels } from '../../../../../_components/scanner-labels';
import { ReceivePoItemScreen } from './receive-po-item-screen';

const replace = vi.fn();
const push = vi.fn();
const scannerFetch = vi.fn();
const mockSession = { token: 'tok', user: { id: 'user-1', name: 'Jan Kowalski' } };
const noLocationsMessage =
  'No receiving location is configured for this scanner site. Ask a supervisor to add a location before receiving.';

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

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function poResponse() {
  return jsonResponse({
    ok: true,
    po: {
      id: 'po-1',
      poNumber: 'PO-1',
      supplierCode: 'SUP',
      supplierName: 'Supplier',
      expectedDelivery: '2026-06-20',
      status: 'confirmed',
      lineCount: 1,
      receivedLineCount: 0,
      lines: [
        {
          id: 'line-1',
          lineNo: 1,
          itemCode: 'RM-BEEF',
          itemName: 'Beef',
          qty: '10.5',
          receivedQty: '2',
          uom: 'kg',
        },
      ],
    },
  });
}

async function waitForReceiveEnabled() {
  const button = screen.getByRole('button', { name: 'Receive' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('ReceivePoItemScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scannerFetch.mockImplementation((path: string) => {
      if (path.includes('/pos/po-1')) return poResponse();
      if (path === '/api/warehouse/scanner/location') {
        return jsonResponse({
          ok: true,
          locations: [
            {
              id: 'loc-9',
              code: 'A-01-01',
              name: 'Rack A',
              warehouseId: 'wh-1',
              warehouseCode: 'WH1',
              locationType: 'rack',
            },
          ],
        });
      }
      // lane W9-L8: destination-location resolver (same route as putaway)
      if (path.includes('/api/warehouse/scanner/location')) {
        return jsonResponse({
          ok: true,
          location: {
            id: 'loc-9',
            code: 'A-01-01',
            name: 'Rack A',
            warehouseId: 'wh-1',
            warehouseCode: 'WH1',
            locationType: 'rack',
          },
        });
      }
      return jsonResponse({ ok: true, lpNumber: 'LP-1', qty: '8.5', uom: 'kg' });
    });
  });

  it('shows the locked line UoM and posts qty as a decimal string', async () => {
    render(<ReceivePoItemScreen locale="en" poId="po-1" lineId="line-1" labels={getScannerLabels('en')} />);

    expect(await screen.findByText('RM-BEEF')).toBeInTheDocument();
    expect(screen.getByTestId('receive-po-uom-label')).toHaveTextContent('kg');

    await userEvent.click(await waitForReceiveEnabled());

    await waitFor(() =>
      expect(scannerFetch.mock.calls.some((call) => call[0] === '/api/warehouse/scanner/receive-line')).toBe(true),
    );
    const receiveCall = scannerFetch.mock.calls.find((call) => call[0] === '/api/warehouse/scanner/receive-line');
    expect(receiveCall?.[1]).toEqual(
      expect.objectContaining({
        poLineId: 'line-1',
        qty: '8.5',
        toLocationId: 'loc-9',
      }),
    );
    expect(typeof receiveCall?.[1].qty).toBe('string');
  });

  it('shows the QC-hold info line when the receive response flags a required inspection', async () => {
    scannerFetch.mockImplementation((path: string) => {
      if (path.includes('/pos/po-1')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              po: {
                id: 'po-1',
                poNumber: 'PO-1',
                supplierCode: 'SUP',
                supplierName: 'Supplier',
                expectedDelivery: '2026-06-20',
                status: 'confirmed',
                lineCount: 1,
                receivedLineCount: 0,
                lines: [
                  {
                    id: 'line-1',
                    lineNo: 1,
                    itemCode: 'RM-BEEF',
                    itemName: 'Beef',
                    qty: '10.5',
                    receivedQty: '2',
                    uom: 'kg',
                  },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      if (path === '/api/warehouse/scanner/location') {
        return jsonResponse({
          ok: true,
          locations: [
            {
              id: 'loc-9',
              code: 'A-01-01',
              name: 'Rack A',
              warehouseId: 'wh-1',
              warehouseCode: 'WH1',
              locationType: 'rack',
            },
          ],
        });
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            lpNumber: 'LP-1',
            qty: '8.5',
            uom: 'kg',
            qcInspectionRequired: true,
            inspectionId: 'insp-1',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    render(<ReceivePoItemScreen locale="en" poId="po-1" lineId="line-1" labels={getScannerLabels('en')} />);

    expect(await screen.findByText('RM-BEEF')).toBeInTheDocument();
    await userEvent.click(await waitForReceiveEnabled());

    expect(await screen.findByText('QC inspection required — LP held as pending.')).toBeInTheDocument();
  });

  it('does not show the QC-hold info line when the flag is off (response without qcInspectionRequired)', async () => {
    render(<ReceivePoItemScreen locale="en" poId="po-1" lineId="line-1" labels={getScannerLabels('en')} />);

    expect(await screen.findByText('RM-BEEF')).toBeInTheDocument();
    await userEvent.click(await waitForReceiveEnabled());

    expect(await screen.findByText('LP-1')).toBeInTheDocument();
    expect(screen.queryByText('QC inspection required — LP held as pending.')).not.toBeInTheDocument();
  });

  // ── lane W9-L8: optional destination location ───────────────────────────

  it('resolves a typed destination location and sends its id as toLocationId', async () => {
    scannerFetch.mockImplementation((path: string) => {
      if (path.includes('/pos/po-1')) return poResponse();
      if (path === '/api/warehouse/scanner/location') {
        return jsonResponse({
          ok: true,
          locations: [
            {
              id: 'loc-8',
              code: 'B-01-01',
              name: 'Rack B',
              warehouseId: 'wh-1',
              warehouseCode: 'WH1',
              locationType: 'rack',
            },
            {
              id: 'loc-9',
              code: 'A-01-01',
              name: 'Rack A',
              warehouseId: 'wh-1',
              warehouseCode: 'WH1',
              locationType: 'rack',
            },
          ],
        });
      }
      if (path.includes('/api/warehouse/scanner/location')) {
        return jsonResponse({
          ok: true,
          location: {
            id: 'loc-9',
            code: 'A-01-01',
            name: 'Rack A',
            warehouseId: 'wh-1',
            warehouseCode: 'WH1',
            locationType: 'rack',
          },
        });
      }
      return jsonResponse({ ok: true, lpNumber: 'LP-1', qty: '8.5', uom: 'kg' });
    });
    render(<ReceivePoItemScreen locale="en" poId="po-1" lineId="line-1" labels={getScannerLabels('en')} />);

    expect(await screen.findByText('RM-BEEF')).toBeInTheDocument();
    const destInput = screen.getByLabelText('Destination location');
    await userEvent.type(destInput, 'A-01-01{Enter}');

    // resolved chip: label + code + name
    expect(await screen.findByText('Selected location')).toBeInTheDocument();
    expect(screen.getAllByText('A-01-01').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rack A').length).toBeGreaterThan(0);
    const lookupCall = scannerFetch.mock.calls.find((call) =>
      String(call[0]).startsWith('/api/warehouse/scanner/location?code='),
    );
    expect(lookupCall?.[0]).toBe('/api/warehouse/scanner/location?code=A-01-01');

    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));

    await waitFor(() =>
      expect(scannerFetch.mock.calls.some((call) => call[0] === '/api/warehouse/scanner/receive-line')).toBe(true),
    );
    const receiveCall = scannerFetch.mock.calls.find((call) => call[0] === '/api/warehouse/scanner/receive-line');
    expect(receiveCall?.[1]).toEqual(expect.objectContaining({ poLineId: 'line-1', toLocationId: 'loc-9' }));
  });

  it('auto-selects the only destination location and enables Receive without user action', async () => {
    render(<ReceivePoItemScreen locale="en" poId="po-1" lineId="line-1" labels={getScannerLabels('en')} />);

    expect(await screen.findByText('RM-BEEF')).toBeInTheDocument();
    expect(await screen.findByText('Selected location')).toBeInTheDocument();
    expect(screen.getByText('A-01-01')).toBeInTheDocument();
    await userEvent.click(await waitForReceiveEnabled());

    await waitFor(() =>
      expect(scannerFetch.mock.calls.some((call) => call[0] === '/api/warehouse/scanner/receive-line')).toBe(true),
    );
    const receiveCall = scannerFetch.mock.calls.find((call) => call[0] === '/api/warehouse/scanner/receive-line');
    expect(receiveCall?.[1].toLocationId).toBe('loc-9');
  });

  it('keeps Receive disabled and shows an inline error when no destination locations exist', async () => {
    scannerFetch.mockImplementation((path: string) => {
      if (path.includes('/pos/po-1')) return poResponse();
      if (path === '/api/warehouse/scanner/location') return jsonResponse({ ok: true, locations: [] });
      return jsonResponse({ ok: true, lpNumber: 'LP-1', qty: '8.5', uom: 'kg' });
    });

    render(<ReceivePoItemScreen locale="en" poId="po-1" lineId="line-1" labels={getScannerLabels('en')} />);

    expect(await screen.findByText('RM-BEEF')).toBeInTheDocument();
    expect(await screen.findByText(noLocationsMessage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    expect(scannerFetch.mock.calls.some((call) => call[0] === '/api/warehouse/scanner/receive-line')).toBe(false);
  });

  it('shows "Location not found." on a 404 resolve and blocks Receive while the destination is unresolved', async () => {
    scannerFetch.mockImplementation((path: string) => {
      if (path.includes('/pos/po-1')) return poResponse();
      if (path === '/api/warehouse/scanner/location') {
        return jsonResponse({
          ok: true,
          locations: [
            {
              id: 'loc-8',
              code: 'B-01-01',
              name: 'Rack B',
              warehouseId: 'wh-1',
              warehouseCode: 'WH1',
              locationType: 'rack',
            },
            {
              id: 'loc-9',
              code: 'A-01-01',
              name: 'Rack A',
              warehouseId: 'wh-1',
              warehouseCode: 'WH1',
              locationType: 'rack',
            },
          ],
        });
      }
      if (path.includes('/api/warehouse/scanner/location')) {
        return jsonResponse({ error: 'location_not_found' }, 404);
      }
      return jsonResponse({ ok: true, lpNumber: 'LP-1', qty: '8.5', uom: 'kg' });
    });

    render(<ReceivePoItemScreen locale="en" poId="po-1" lineId="line-1" labels={getScannerLabels('en')} />);

    expect(await screen.findByText('RM-BEEF')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Destination location'), 'ZZ-99{Enter}');

    expect(await screen.findByText('Location not found.')).toBeInTheDocument();
    // typed-but-unresolved destination must never silently go to the default
    expect(screen.getByRole('button', { name: 'Receive' })).toBeDisabled();
    expect(scannerFetch.mock.calls.some((call) => call[0] === '/api/warehouse/scanner/receive-line')).toBe(false);
  });
});
