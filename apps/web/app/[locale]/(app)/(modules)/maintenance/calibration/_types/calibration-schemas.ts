import { z } from 'zod';

export const INSTRUMENT_TYPES = ['scale', 'thermometer', 'ph_meter', 'other'] as const;
export const CALIBRATION_STANDARDS = ['ISO_9001', 'NIST', 'internal', 'other'] as const;
export const CALIBRATION_RESULTS = ['PASS', 'FAIL', 'OUT_OF_SPEC'] as const;

export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];
export type CalibrationStandard = (typeof CALIBRATION_STANDARDS)[number];
export type CalibrationResult = (typeof CALIBRATION_RESULTS)[number];

const uuidSchema = z.string().uuid();
const numericStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/)
  .optional();

const testPointSchema = z.object({
  reference: z.string().trim().min(1),
  measured: z.union([z.string(), z.number()]),
  tolerance_pct: z.number().optional(),
});

export const createInstrumentSchema = z.object({
  instrumentCode: z.string().trim().min(1).max(64),
  instrumentType: z.enum(INSTRUMENT_TYPES),
  standard: z.enum(CALIBRATION_STANDARDS),
  calibrationIntervalDays: z.number().int().min(1).max(3650),
  rangeMin: numericStringSchema,
  rangeMax: numericStringSchema,
  unitOfMeasure: z.string().trim().max(32).optional(),
});

export const updateInstrumentSchema = createInstrumentSchema.extend({
  instrumentId: uuidSchema,
});

export const deactivateInstrumentSchema = z.object({
  instrumentId: uuidSchema,
});

export const reactivateInstrumentSchema = z.object({
  instrumentId: uuidSchema,
});

export const recordCalibrationSchema = z.object({
  instrumentId: uuidSchema,
  calibratedAt: z.string().datetime({ offset: true }).or(z.string().date()),
  result: z.enum(CALIBRATION_RESULTS),
  testPoints: z.array(testPointSchema).max(50).optional(),
  notes: z.string().trim().max(4000).optional(),
  certificateRef: z.string().trim().max(500).optional(),
  signature: z.object({
    password: z.string().min(1),
    nonce: z.string().min(1).optional(),
  }),
  reviewerSignature: z.object({
    userId: uuidSchema,
    password: z.string().min(1),
    nonce: z.string().min(1).optional(),
  }),
});

export type CalibrationPermissions = {
  canRead: boolean;
  canEditInstrument: boolean;
  canDeactivateInstrument: boolean;
  canRecord: boolean;
};

export type CalibrationDueRow = {
  instrumentId: string;
  siteId: string | null;
  equipmentId: string | null;
  instrumentCode: string;
  instrumentType: string;
  standard: string;
  rangeMin: string | null;
  rangeMax: string | null;
  unitOfMeasure: string | null;
  calibrationIntervalDays: number;
  active: boolean;
  recordId: string | null;
  calibratedAt: string | null;
  calibratedBy: string | null;
  standardApplied: string | null;
  result: string | null;
  certificateFileUrl: string | null;
  nextDueDate: string | null;
  reviewerSignedBy: string | null;
  retentionUntil: string | null;
};

export type InstrumentOption = {
  id: string;
  instrumentCode: string;
  instrumentType: string;
  standard: string;
  calibrationIntervalDays: number;
  active: boolean;
};
