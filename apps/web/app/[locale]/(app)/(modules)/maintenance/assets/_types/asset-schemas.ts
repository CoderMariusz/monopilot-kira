import { z } from 'zod';

export const EQUIPMENT_TYPES = [
  'mixer',
  'oven',
  'packer',
  'scale',
  'thermometer',
  'conveyor',
  'other',
] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const createEquipmentSchema = z.object({
  equipmentCode: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  equipmentType: z.enum(EQUIPMENT_TYPES),
  requiresLoto: z.boolean().default(false),
  requiresCalibration: z.boolean().default(false),
});

export type AssetPermissions = {
  canRead: boolean;
  canEdit: boolean;
};

export type EquipmentAssetRow = {
  id: string;
  equipmentCode: string;
  name: string;
  equipmentType: string;
  requiresLoto: boolean;
  requiresCalibration: boolean;
  active: boolean;
};
