/**
 * WH-010 — GRN list receive CTAs (prototype grn-screens.jsx:30-33).
 */
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GrnListReceiveActions } from '../grn-list-receive-actions';

const LABELS = {
  receiveFromPo: '+ Receive from PO',
  receiveFromTo: '+ Receive from TO',
};

describe('GrnListReceiveActions', () => {
  it('renders receive CTAs linking to inbound when the caller can receive', () => {
    render(<GrnListReceiveActions locale="en" labels={LABELS} canReceive />);

    expect(screen.getByTestId('grn-list-receive-actions')).toBeInTheDocument();
    expect(screen.getByTestId('grn-receive-from-po')).toHaveAttribute('href', '/en/warehouse/inbound');
    expect(screen.getByTestId('grn-receive-from-to')).toHaveAttribute('href', '/en/warehouse/inbound');
    expect(screen.getByTestId('grn-receive-from-po')).toHaveTextContent('+ Receive from PO');
  });

  it('renders nothing when receive permission is absent', () => {
    render(<GrnListReceiveActions locale="en" labels={LABELS} canReceive={false} />);
    expect(screen.queryByTestId('grn-list-receive-actions')).not.toBeInTheDocument();
  });
});
