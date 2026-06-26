export type DesktopReceiveInput = {
  poLineId: string;
  qty: string;
  batchNumber?: string | null;
  bestBefore?: string | null;
  toLocationId?: string | null;
  warehouseId?: string | null;
};

export type DesktopReceiveError =
  | 'forbidden'
  | 'not_found'
  | 'invalid_qty'
  | 'over_receive_cap'
  | 'no_warehouse'
  | 'invalid_location'
  | 'invalid_state'
  | 'error';

export type DesktopReceiveResult =
  | {
      ok: true;
      grnId: string;
      grnNumber: string;
      lpId: string;
      lpNumber: string;
      qty: string;
      uom: string;
      overReceived: boolean;
      poStatus: 'partially_received' | 'received';
      qcInspectionRequired: boolean;
      inspectionId: string | null;
    }
  | { ok: false; error: DesktopReceiveError };
