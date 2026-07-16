import type { ShipmentStatus } from './so-transitions';

export type ShipmentRow = {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  salesOrderNumber: string | null;
  customerName: string | null;
  customerCode: string | null;
  boxCount: number;
  createdAt: string;
  packedAt: string | null;
  shippedAt: string | null;
  bolPdfUrl?: string | null;
  /** SHA-256 of the signed BOL payload (persisted in ext_data.bol_sha256 by generateBol). */
  bolSha256?: string | null;
  bolSignedPdfUrl?: string | null;
  deliveredAt?: string | null;
  carrier?: string | null;
  serviceLevel?: string | null;
  trackingNumber?: string | null;
  totalWeightKg?: string | null;
  promisedShipDate?: string | null;
  requiredDeliveryDate?: string | null;
};

export type ShipmentBoxContentDetail = {
  lpCode: string;
  itemCode: string;
  itemName: string | null;
  qty: string;
};

export type ShipmentBoxDetail = {
  boxNumber: number;
  sscc: string | null;
  contents: ShipmentBoxContentDetail[];
};

export type ShipmentDetail = {
  shipment: ShipmentRow;
  boxes: ShipmentBoxDetail[];
};
