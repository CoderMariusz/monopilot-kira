/**
 * T-073 / R3.1 — shared zod validation for settings units (non-'use server').
 * Kept separate from manage-units.ts so schemas/constants can be imported by tests.
 */

import { z } from 'zod';

export const UNIT_CATEGORIES = ['mass', 'volume', 'count', 'length'] as const;
export type UnitCategory = (typeof UNIT_CATEGORIES)[number];

export const FACTOR_TO_BASE_MIN_EXCLUSIVE = 0;

export const CreateUnitInput = z.object({
  category: z.enum(UNIT_CATEGORIES),
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_]+$/, 'code must be alphanumeric/underscore'),
  name: z.string().trim().min(1).max(120),
  factorToBase: z.coerce
    .number()
    .finite()
    .gt(FACTOR_TO_BASE_MIN_EXCLUSIVE, 'factorToBase must be greater than zero'),
  isBase: z.coerce.boolean().optional().default(false),
});
export type CreateUnitInputType = z.infer<typeof CreateUnitInput>;

export type UnitsActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'already_exists'
  | 'not_found'
  | 'invalid_reference'
  | 'in_use'
  | 'persistence_failed';

export type CreateUnitResult =
  | { ok: true; data: { id: string; code: string; category: UnitCategory } }
  | { ok: false; error: UnitsActionError; message?: string };

export const UpdateUnitInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});
export type UpdateUnitInputType = z.infer<typeof UpdateUnitInput>;
