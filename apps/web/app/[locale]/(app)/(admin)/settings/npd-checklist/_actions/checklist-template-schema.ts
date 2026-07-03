import { z } from 'zod';

export const NPD_CHECKLIST_PERMISSION = 'npd.schema.edit' as const;

export const DEFAULT_TEMPLATE_ID = 'APEX_DEFAULT' as const;

export const GATE_CODES = ['G0', 'G1', 'G2', 'G3', 'G4'] as const;
export const CATEGORY_CODES = ['business', 'technical', 'compliance'] as const;

export type GateCode = (typeof GATE_CODES)[number];
export type CategoryCode = (typeof CATEGORY_CODES)[number];

export const gateCodeSchema = z.enum(GATE_CODES);
export const categoryCodeSchema = z.enum(CATEGORY_CODES);

export const templateItemKeySchema = z
  .object({
    gateCode: gateCodeSchema,
    sequence: z.number().int().positive(),
    templateId: z.string().min(1).default(DEFAULT_TEMPLATE_ID),
  })
  .strict();

export const addTemplateItemSchema = z
  .object({
    gateCode: gateCodeSchema,
    categoryCode: categoryCodeSchema,
    itemText: z.string().trim().min(1, 'Item text is required.'),
    required: z.boolean(),
    templateId: z.string().min(1).default(DEFAULT_TEMPLATE_ID),
  })
  .strict();

export const updateTemplateItemSchema = z
  .object({
    gateCode: gateCodeSchema,
    sequence: z.number().int().positive(),
    templateId: z.string().min(1).default(DEFAULT_TEMPLATE_ID),
    itemText: z.string().trim().min(1, 'Item text is required.').optional(),
    categoryCode: categoryCodeSchema.optional(),
    required: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.itemText !== undefined || value.categoryCode !== undefined || value.required !== undefined,
    'At least one field must be updated.',
  );

export const deleteTemplateItemSchema = templateItemKeySchema;

export const reorderTemplateItemSchema = z
  .object({
    gateCode: gateCodeSchema,
    sequence: z.number().int().positive(),
    direction: z.enum(['up', 'down']),
    templateId: z.string().min(1).default(DEFAULT_TEMPLATE_ID),
  })
  .strict();

export const propagateTemplateSchema = z
  .object({
    templateId: z.string().min(1).default(DEFAULT_TEMPLATE_ID),
  })
  .strict();

export type ChecklistTemplateItem = {
  templateId: string;
  gateCode: GateCode;
  sequence: number;
  categoryCode: CategoryCode;
  itemText: string;
  required: boolean;
};

export type ChecklistTemplatesByGate = Record<GateCode, ChecklistTemplateItem[]>;
