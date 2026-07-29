import { z } from 'zod';

export const PM_SCHEDULE_TYPES = [
  'preventive',
  'calibration',
  'sanitation',
  'inspection',
] as const;

export const PM_INTERVAL_BASES = ['calendar_days', 'usage_hours', 'usage_cycles'] as const;

export const createPmScheduleSchema = z.object({
  equipmentId: z.string().uuid(),
  scheduleType: z.enum(PM_SCHEDULE_TYPES),
  intervalValue: z.number().int().min(1).max(3650),
  intervalBasis: z.literal('calendar_days').default('calendar_days'),
  warningDays: z.number().int().min(0).max(90).default(7),
  firstDueDate: z.string().date().optional(),
});

export const updatePmScheduleSchema = z.object({
  scheduleId: z.string().uuid(),
  intervalValue: z.number().int().min(1).max(3650).optional(),
  warningDays: z.number().int().min(0).max(90).optional(),
  nextDueDate: z.string().date().optional(),
  active: z.boolean().optional(),
});
