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

describe('ReceivePoItemScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, lpNumber: 'LP-1', qty: '8.5', uom: 'kg' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });

  it('shows the locked line UoM and posts qty as a decimal string', async () => {
    render(<ReceivePoItemScreen locale="en" poId="po-1" lineId="line-1" labels={getScannerLabels('en')} />);

    expect(await screen.findByText('RM-BEEF')).toBeInTheDocument();
    expect(screen.getByTestId('receive-po-uom-label')).toHaveTextContent('kg');

    await userEvent.click(screen.getByRole('button', { name: 'Receive' }));

    await waitFor(() =>
      expect(scannerFetch.mock.calls.some((call) => call[0] === '/api/warehouse/scanner/receive-line')).toBe(true),
    );
    const receiveCall = scannerFetch.mock.calls.find((call) => call[0] === '/api/warehouse/scanner/receive-line');
    expect(receiveCall?.[1]).toEqual(
      expect.objectContaining({
        poLineId: 'line-1',
        qty: '8.5',
      }),
    );
    expect(typeof receiveCall?.[1].qty).toBe('string');
  });
});
