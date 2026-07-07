import { z } from 'zod';

export const addWipProcessSchema = z.object({
  prodDetailId: z.string().uuid(),
  processName: z.string().trim().min(1),
  durationHours: z.coerce.number().finite().nonnegative().optional().default(0),
  additionalCost: z.coerce.number().finite().nonnegative().optional().default(0),
  createsWipItem: z.boolean().optional().default(false),
  throughputPerHour: z.coerce.number().finite().nonnegative().optional().default(0),
  throughputUom: z.enum(['kg', 'pack', 'each', 'l']).optional().default('kg'),
  setupCost: z.coerce.number().finite().nonnegative().optional().default(0),
  yieldPct: z.coerce.number().finite().positive().max(100).optional().default(100),
  lineId: z.string().uuid().nullable().optional(),
});

export const updateWipProcessSchema = z.object({
  id: z.string().uuid(),
  processName: z.string().trim().min(1).optional(),
  durationHours: z.coerce.number().finite().nonnegative().optional(),
  additionalCost: z.coerce.number().finite().nonnegative().optional(),
  createsWipItem: z.boolean().optional(),
  throughputPerHour: z.coerce.number().finite().nonnegative().optional(),
  throughputUom: z.enum(['kg', 'pack', 'each', 'l']).optional(),
  setupCost: z.coerce.number().finite().nonnegative().optional(),
  yieldPct: z.coerce.number().finite().positive().max(100).optional(),
  lineId: z.string().uuid().nullable().optional(),
});

export const removeWipProcessSchema = z.object({
  id: z.string().uuid(),
});

const roleInputSchema = z.object({
  roleGroup: z.string().trim().min(1),
  headcount: z.coerce.number().int().positive(),
  ratePerHour: z.coerce.number().finite().nonnegative().optional(),
});

export const saveWipProcessRolesSchema = z
  .object({
    processId: z.string().uuid(),
    roles: z.array(roleInputSchema),
  })
  .refine(
    (input) => new Set(input.roles.map((r) => r.roleGroup.trim())).size === input.roles.length,
    { message: 'duplicate role_group in roles' },
  );

export type AddWipProcessInput = z.input<typeof addWipProcessSchema>;
export type UpdateWipProcessInput = z.input<typeof updateWipProcessSchema>;
export type RemoveWipProcessInput = z.input<typeof removeWipProcessSchema>;
export type SaveWipProcessRolesInput = z.input<typeof saveWipProcessRolesSchema>;
