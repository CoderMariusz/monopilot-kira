// Shared schema/types for saveCostingInputs. Lives OUTSIDE the 'use server'
// module: a 'use server' file may only export async functions — exporting the
// zod schema object from there breaks `next build` (invalid-use-server-value)
// while passing tsc/vitest. See memory: use-server-export-type-deploy-break.
import { z } from 'zod';

const optionalNumericString = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).trim();
    return normalized === '' ? null : normalized;
  })
  .refine((value) => value === null || /^-?\d+(\.\d+)?$/.test(value), {
    message: 'Must be a valid decimal number',
  });

export const saveCostingInputsSchema = z
  .object({
    projectId: z.string().uuid(),
    avgBatchQty: optionalNumericString,
    overheadPerKgOverride: optionalNumericString,
    logisticsPerBoxOverride: optionalNumericString,
  })
  .strict();

export type SaveCostingInputsInput = z.input<typeof saveCostingInputsSchema>;

export type SaveCostingInputsResult =
  | { ok: true }
  | { ok: false; error: string; code?: 'forbidden' | 'not_found' | 'invalid_input' };

