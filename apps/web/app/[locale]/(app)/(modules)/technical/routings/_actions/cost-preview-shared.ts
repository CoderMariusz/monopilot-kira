/**
 * 03-technical Routing cost preview (T-023): zod input + result types.
 *
 * Plain (non-`'use server'`) module so it can export the schema/types consumed by
 * both the action and the page. `volume` is REQUIRED — a missing volume is an
 * invalid_input (AC2: "missing volume param → 422").
 */

import { z } from 'zod';

import type { RoutingActionError } from './shared';

export const RoutingCostPreviewInput = z.object({
  routingId: z.string().uuid(),
  // Required (AC2). Accept string | number, bind ::numeric. Must be > 0 so a
  // run-cost computation is meaningful.
  volume: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
    .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, {
      message: 'volume is required and must be a positive number',
    }),
});
export type RoutingCostPreviewInputType = z.input<typeof RoutingCostPreviewInput>;

export type RoutingOpCost = {
  opNo: number;
  opCode: string;
  opName: string;
  /** NUMERIC, 2 dp, returned as string to preserve exactness. */
  setupCost: string;
  runCost: string;
  opCost: string;
};

export type RoutingCostPreviewResult =
  | {
      ok: true;
      data: {
        routingId: string;
        volume: string;
        operations: RoutingOpCost[];
        totalCost: string;
      };
    }
  | { ok: false; error: RoutingActionError; message?: string };
