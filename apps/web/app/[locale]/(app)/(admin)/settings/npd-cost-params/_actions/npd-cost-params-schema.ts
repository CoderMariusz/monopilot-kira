import { z } from 'zod';

export const NPD_COST_PARAMS_PERMISSION = 'npd.schema.edit' as const;

const nonNegativeDecimal = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value !== '' && /^\d+(\.\d+)?$/.test(value), {
    message: 'Must be a non-negative decimal',
  });

export const upsertNpdCostParamsSchema = z
  .object({
    overheadPerKg: nonNegativeDecimal,
    logisticsPerBox: nonNegativeDecimal,
  })
  .strict();

export type UpsertNpdCostParamsInput = z.input<typeof upsertNpdCostParamsSchema>;
