import { describe, expect, it } from 'vitest';

import {
  assertAllLinesFullyReceived,
  resolveTransferOrderStatusFromLines,
  type TransferOrderLineReceiveState,
} from '../to-conservation';

function line(
  lineMicro: bigint,
  receivedMicro: bigint,
  pendingMicro: bigint,
  lineId = 'line-1',
): TransferOrderLineReceiveState {
  return { lineId, lineMicro, receivedMicro, pendingMicro };
}

describe('transfer order receive status helpers (PF-R10-02)', () => {
  it('refuses header close when a line is short-received with no pending junction', () => {
    const check = assertAllLinesFullyReceived([
      line(6125000n, 6125000n, 0n),
      line(3875000n, 0n, 0n),
    ]);
    expect(check.ok).toBe(false);
    if (check.ok) throw new Error('expected incomplete');
    expect(check.message).toContain('not fully received');
  });

  it('allows close only when every line qty is materialized with no in-transit remainder', () => {
    expect(assertAllLinesFullyReceived([line(6125000n, 6125000n, 0n), line(3875000n, 3875000n, 0n)])).toEqual({
      ok: true,
    });
  });

  it('keeps partially_received while pending junction rows remain after one line is received', () => {
    expect(resolveTransferOrderStatusFromLines([line(1000000n, 1000000n, 0n), line(2000000n, 0n, 2000000n)])).toBe(
      'partially_received',
    );
  });

  it('closes remainder-cancelled partial fulfillment as received, not cancelled', () => {
    expect(resolveTransferOrderStatusFromLines([line(6125000n, 6125000n, 0n), line(3875000n, 0n, 0n)])).toBe('received');
  });
});
