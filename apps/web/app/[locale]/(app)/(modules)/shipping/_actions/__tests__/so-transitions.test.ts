import { describe, expect, it } from 'vitest';

import {
  deriveSalesOrderStatusFromProgress,
  isLegalShipmentTransition,
  isLegalSoTransition,
  SHIPMENT_LEGAL_TRANSITIONS,
  SO_LEGAL_TRANSITIONS,
  type SalesOrderStatus,
  type ShipmentStatus,
} from '../so-transitions';

describe('SO_LEGAL_TRANSITIONS matrix', () => {
  const allSoStatuses = Object.keys(SO_LEGAL_TRANSITIONS) as SalesOrderStatus[];

  it('allows every declared legal transition', () => {
    for (const from of allSoStatuses) {
      for (const to of SO_LEGAL_TRANSITIONS[from]) {
        expect(isLegalSoTransition(from, to)).toBe(true);
      }
    }
  });

  it('rejects transitions not in the map', () => {
    expect(isLegalSoTransition('draft', 'shipped')).toBe(false);
    expect(isLegalSoTransition('shipped', 'allocated')).toBe(true);
    expect(isLegalSoTransition('cancelled', 'confirmed')).toBe(false);
  });

  it('never resurrects a cancelled sales order', () => {
    expect(SO_LEGAL_TRANSITIONS.cancelled).toEqual([]);
    for (const to of allSoStatuses) {
      expect(isLegalSoTransition('cancelled', to)).toBe(false);
    }
  });

  it('allows delivered unwind to shipped for void POD', () => {
    expect(isLegalSoTransition('delivered', 'shipped')).toBe(true);
  });

  it('allows deallocation regressions to confirmed from pre-pack states', () => {
    expect(isLegalSoTransition('allocated', 'confirmed')).toBe(true);
    expect(isLegalSoTransition('partially_picked', 'confirmed')).toBe(true);
    expect(isLegalSoTransition('picked', 'confirmed')).toBe(true);
    expect(isLegalSoTransition('packed', 'confirmed')).toBe(false);
  });
});

describe('SHIPMENT_LEGAL_TRANSITIONS matrix', () => {
  const allShipmentStatuses = Object.keys(SHIPMENT_LEGAL_TRANSITIONS) as ShipmentStatus[];

  it('allows every declared legal transition', () => {
    for (const from of allShipmentStatuses) {
      for (const to of SHIPMENT_LEGAL_TRANSITIONS[from]) {
        expect(isLegalShipmentTransition(from, to)).toBe(true);
      }
    }
  });

  it('rejects illegal shipment transitions', () => {
    expect(isLegalShipmentTransition('packing', 'shipped')).toBe(false);
    expect(isLegalShipmentTransition('delivered', 'cancelled')).toBe(false);
    expect(isLegalShipmentTransition('cancelled', 'packing')).toBe(false);
  });

  it('allows cancelling pre-ship and shipped shipments', () => {
    expect(isLegalShipmentTransition('packing', 'cancelled')).toBe(true);
    expect(isLegalShipmentTransition('packed', 'cancelled')).toBe(true);
    expect(isLegalShipmentTransition('manifested', 'cancelled')).toBe(true);
    expect(isLegalShipmentTransition('shipped', 'cancelled')).toBe(true);
  });
});

describe('deriveSalesOrderStatusFromProgress', () => {
  it('keeps shipped when a sibling shipment is still shipped after cancel', () => {
    expect(
      deriveSalesOrderStatusFromProgress({
        shipmentCount: 1,
        packingCount: 0,
        packedCount: 0,
        manifestedCount: 0,
        shippedCount: 1,
        deliveredCount: 0,
        liveAllocationCount: 0,
      }),
    ).toBe('shipped');
  });

  it('does not regress to confirmed when allocations are zero but a sibling is shipped', () => {
    const status = deriveSalesOrderStatusFromProgress({
      shipmentCount: 1,
      packingCount: 0,
      packedCount: 0,
      manifestedCount: 0,
      shippedCount: 1,
      deliveredCount: 0,
      liveAllocationCount: 0,
    });
    expect(status).not.toBe('confirmed');
  });
});
