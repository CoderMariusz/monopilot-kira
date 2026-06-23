/**
 * Wave-shipping — narrow client-facing seam result types for the ship / BOL / POD
 * controls. These MIRROR the reviewed ship-actions.ts result unions
 * (ShipShipmentResult / GenerateBolResult / RecordPodResult) without importing the
 * 'use server' module into a client component. The page wraps the real actions in
 * thin server adapters that satisfy these shapes. ship-actions.ts is owned by the
 * parallel lane and is NEVER modified here.
 */

export type ShipShipmentResult = { ok: true } | { ok: false; error: string };

export type GenerateBolResult = { ok: true; bolRef: string } | { ok: false; error: string };

export type RecordPodResult = { ok: true } | { ok: false; error: string };
