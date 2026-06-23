import { z } from 'zod';

import type { ProcurementError } from './procurement-shared';

export type FreightError = ProcurementError;

export type FreightResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: FreightError; message?: string };

/** Transport modes shared by carriers + lanes (dropdown source). */
export const FREIGHT_MODES = ['road', 'sea', 'air', 'rail', 'parcel'] as const;
export type FreightMode = (typeof FREIGHT_MODES)[number];

/** How a lane's cost is expressed in the UI contract. */
export const COST_BASES = ['per_shipment', 'per_kg', 'per_km', 'per_pallet'] as const;
export type CostBasis = (typeof COST_BASES)[number];

const modeSchema = z.enum(FREIGHT_MODES);
const costBasisSchema = z.enum(COST_BASES);
const uuidSchema = z.string().uuid();
const costAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,4})?$/)
  .refine((v) => Number(v) >= 0, 'cost must be non-negative');

export type CarrierRow = {
  id: string;
  code: string;
  name: string;
  mode: FreightMode;
  contactEmail: string | null;
  contactPhone: string | null;
  isActive: boolean;
};

export type TransportLaneRow = {
  id: string;
  carrierId: string;
  carrierName: string;
  origin: string;
  destination: string;
  mode: FreightMode;
  costBasis: CostBasis;
  costAmount: string;
  currency: string;
  transitDays: number | null;
  isActive: boolean;
};

export type ScorecardPoRow = {
  id: string;
  poNumber: string;
  status: string;
  expectedDelivery: string | null;
  receivedAt: string | null;
  onTime: boolean | null;
  qtyVariancePct: number | null;
};

export type SupplierScorecard = {
  onTimePct: number | null;
  avgQtyVariancePct: number | null;
  ncrCount: number;
  openNcrCount: number;
  recentPos: ScorecardPoRow[];
};

export const CarrierUpsertSchema = z.object({
  id: uuidSchema.optional(),
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(255),
  mode: modeSchema,
  contactEmail: z.string().trim().email().max(255).optional().or(z.literal('').transform(() => undefined)),
  contactPhone: z.string().trim().max(64).optional().or(z.literal('').transform(() => undefined)),
  isActive: z.boolean().default(true),
});
export type CarrierUpsertInput = z.input<typeof CarrierUpsertSchema>;

export const TransportLaneUpsertSchema = z.object({
  id: uuidSchema.optional(),
  carrierId: uuidSchema,
  origin: z.string().trim().min(1).max(160),
  destination: z.string().trim().min(1).max(160),
  mode: modeSchema,
  costBasis: costBasisSchema,
  costAmount: costAmountSchema,
  currency: z.string().trim().length(3).default('EUR').transform((value) => value.toUpperCase()),
  transitDays: z.number().int().min(0).max(365).optional(),
  isActive: z.boolean().default(true),
});
export type TransportLaneUpsertInput = z.input<typeof TransportLaneUpsertSchema>;
