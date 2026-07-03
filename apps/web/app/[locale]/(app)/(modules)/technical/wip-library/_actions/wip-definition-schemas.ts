import { z } from 'zod';

const uuidSchema = z.string().uuid();
// D42: base unit = creating process output unit. Mass units feed the v1 recipe picker;
// each/pack definitions are valid library entries but excluded from recipe search.
const baseUomSchema = z.enum(['kg', 'g', 'each', 'pack']);

export const wipDefinitionIngredientInputSchema = z.object({
  itemId: uuidSchema,
  qtyPerUnit: z.coerce.number().finite().nonnegative(),
  uom: z.string().trim().min(1).default('kg'),
  sequence: z.coerce.number().int().nonnegative().default(0),
});

export const wipDefinitionRoleInputSchema = z.object({
  roleGroup: z.string().trim().min(1),
  headcount: z.coerce.number().int().positive(),
  ratePerHour: z.coerce.number().finite().nonnegative().nullable().optional(),
});

export const wipDefinitionProcessInputSchema = z.object({
  id: uuidSchema.optional(),
  processName: z.string().trim().min(1),
  displayOrder: z.coerce.number().int().nonnegative().default(0),
  durationHours: z.coerce.number().finite().nonnegative().default(0),
  additionalCost: z.coerce.number().finite().nonnegative().default(0),
  throughputPerHour: z.coerce.number().finite().nonnegative().nullable().optional(),
  throughputUom: z.string().trim().min(1).nullable().optional(),
  setupCost: z.coerce.number().finite().nonnegative().default(0),
  roles: z.array(wipDefinitionRoleInputSchema).default([]),
});

export const listWipDefinitionsInputSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  reusable: z.boolean().optional(),
}).optional();

export const getWipDefinitionInputSchema = uuidSchema;

export const saveWipDefinitionInputSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  baseUom: baseUomSchema,
  yieldPct: z.coerce.number().finite().positive().max(100),
  reusable: z.boolean(),
  ingredients: z.array(wipDefinitionIngredientInputSchema),
  processes: z.array(wipDefinitionProcessInputSchema),
});

export const publishWipDefinitionFromComponentInputSchema = z.object({
  prodDetailId: uuidSchema,
  name: z.string().trim().min(1),
});

export const acceptWipDefinitionUpdateInputSchema = z.object({
  wipDefinitionId: uuidSchema,
  projectId: uuidSchema,
});

export const archiveWipDefinitionInputSchema = z.object({
  id: uuidSchema,
});

export const searchWipDefinitionsInputSchema = z.object({
  q: z.string().trim().optional().default(''),
});

export const listMyNotificationsInputSchema = z.object({
  unreadOnly: z.boolean().optional().default(false),
}).optional();

export const markNotificationReadInputSchema = z.object({
  id: uuidSchema,
});

export type ListWipDefinitionsInput = z.input<typeof listWipDefinitionsInputSchema>;
export type SaveWipDefinitionInput = z.input<typeof saveWipDefinitionInputSchema>;
export type PublishWipDefinitionFromComponentInput = z.input<typeof publishWipDefinitionFromComponentInputSchema>;
export type AcceptWipDefinitionUpdateInput = z.input<typeof acceptWipDefinitionUpdateInputSchema>;
export type ArchiveWipDefinitionInput = z.input<typeof archiveWipDefinitionInputSchema>;
export type SearchWipDefinitionsInput = z.input<typeof searchWipDefinitionsInputSchema>;
export type ListMyNotificationsInput = z.input<typeof listMyNotificationsInputSchema>;
export type MarkNotificationReadInput = z.input<typeof markNotificationReadInputSchema>;
