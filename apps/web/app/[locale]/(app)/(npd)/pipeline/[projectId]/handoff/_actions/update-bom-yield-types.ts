/**
 * NPD HANDOFF stage — `updateBomYield` schema + result types.
 *
 * Lives OUTSIDE the 'use server' module (`./update-bom-yield`) because a
 * 'use server' file may export only async functions — a zod schema or a type
 * alias exported from there is a Next 16 build error. The action imports these.
 */

import { z } from 'zod';

export const UpdateBomYieldInput = z.object({
  bomHeaderId: z.string().uuid(),
  /** Target/actual yield as a percentage (0.001–100). */
  yieldPct: z.number().min(0.001).max(100),
});

export type UpdateBomYieldInput = z.infer<typeof UpdateBomYieldInput>;

export type UpdateBomYieldCode =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'active_bom_requires_eco'
  | 'persistence_failed';

export type UpdateBomYieldResult =
  | { ok: true }
  | { ok: false; code: UpdateBomYieldCode };
