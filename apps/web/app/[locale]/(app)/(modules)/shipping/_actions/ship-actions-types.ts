export type ShipShipmentResult = { ok: true } | { ok: false; error: string };
export type SealShipmentResult = { ok: true } | { ok: false; error: string };

export type GenerateBolInput = {
  shipmentId: string;
  carrier?: string;
  serviceLevel?: string;
  trackingNumber?: string;
};
export type GenerateBolResult = { ok: true; bolRef: string } | { ok: false; error: string };

export type RecordPodInput = {
  shipmentId: string;
  signedPdfUrl?: string;
};
export type RecordPodResult = { ok: true } | { ok: false; error: string };
