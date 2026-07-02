import { z } from 'zod';

export const TraceInputSchema = z.object({
  inputType: z.enum(['lp', 'batch', 'item']),
  inputRef: z.string().trim().min(1).max(160),
  direction: z.enum(['backward', 'forward', 'both']),
});

export const StartRecallDrillSchema = TraceInputSchema.extend({
  is_drill: z.boolean().optional().default(true),
});

export const UuidSchema = z.string().uuid();
