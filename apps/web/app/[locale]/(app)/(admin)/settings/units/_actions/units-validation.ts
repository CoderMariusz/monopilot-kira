/**
 * T-073 / R3.1 — shared zod validation for settings units (non-'use server').
 * Kept separate from manage-units.ts so schemas/constants can be imported by tests.
 */

import { z } from 'zod';

export const UNIT_CATEGORIES = ['mass', 'volume', 'count', 'length'] as const;
export type UnitCategory = (typeof UNIT_CATEGORIES)[number];

export const CreateUnitInput = z.object({
  category: z.enum(UNIT_CATEGORIES),
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_]+$/, 'code must be alphanumeric/underscore'),
  name: z.string().trim().min(1).max(120),
  factorToBase: z.coerce.number().positive().finite(),
  isBase: z.coerce.boolean().optional().default(false),
});
export type CreateUnitInputType = z.infer<typeof CreateUnitInput>;

export const UpdateUnitInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  factorToBase: z.coerce.number().positive().finite(),
});
export type UpdateUnitInputType = z.infer<typeof UpdateUnitInput>;
