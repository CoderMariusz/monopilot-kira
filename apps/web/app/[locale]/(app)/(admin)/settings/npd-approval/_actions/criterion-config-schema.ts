import { z } from 'zod';

export const NPD_APPROVAL_CRITERIA_PERMISSION = 'npd.schema.edit' as const;

export const NPD_APPROVAL_CRITERION_KEYS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'] as const;

export const criterionKeySchema = z
  .string()
  .regex(/^C[1-9][0-9]?$/)
  .refine(
    (value): value is (typeof NPD_APPROVAL_CRITERION_KEYS)[number] =>
      (NPD_APPROVAL_CRITERION_KEYS as readonly string[]).includes(value),
    'Criterion key must be one of C1..C7.',
  );

export const upsertCriterionConfigSchema = z
  .object({
    criterionKey: criterionKeySchema,
    required: z.boolean(),
  })
  .strict();
