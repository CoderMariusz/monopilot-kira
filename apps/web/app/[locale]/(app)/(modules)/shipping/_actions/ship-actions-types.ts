export type ShipShipmentResult = { ok: true } | { ok: false; error: string };
export type SealShipmentResult = { ok: true } | { ok: false; error: string };

export type GenerateBolInput = {
  shipmentId: string;
  carrier?: string;
  serviceLevel?: string;
  trackingNumber?: string;
  /** CFR-21 Part 11 attestation reason passed to signEvent. */
  reason: string;
  signature: {
    password: string;
    nonce?: string | null;
  };
};
export type GenerateBolResult = { ok: true; bolRef: string } | { ok: false; error: string };

export type RecordPodInput = {
  shipmentId: string;
  /** BRCGS POD retention — required, validated server-side as a non-empty URL. */
  signedPdfUrl: string;
  /** CFR-21 Part 11 attestation reason passed to signEvent. */
  reason: string;
  signature: {
    password: string;
    nonce?: string | null;
  };
};
export type RecordPodResult = { ok: true } | { ok: false; error: string };
