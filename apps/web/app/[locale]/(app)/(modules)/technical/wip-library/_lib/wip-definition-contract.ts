/**
 * W3 L10 — Type contract for L8's wip-definition-actions (F-NPD-3).
 * Plain module (no 'use server') so client islands can import shapes without
 * pulling Server Actions. Signatures mirror _meta/plans/2026-07-03-w3-execution-contract.md.
 */

export const WIP_CREATE_PERMISSION = 'technical.wip.create';
export const WIP_EDIT_PERMISSION = 'technical.wip.edit';
export const WIP_DEACTIVATE_PERMISSION = 'technical.wip.deactivate';

export const WIP_BASE_UOMS = ['kg', 'g', 'each', 'pack'] as const;
export type WipBaseUom = (typeof WIP_BASE_UOMS)[number];

export const WIP_STATUSES = ['draft', 'active', 'archived'] as const;
export type WipStatus = (typeof WIP_STATUSES)[number];

export type WipDefinitionListItem = {
  id: string;
  name: string;
  baseUom: string;
  version: number;
  status: WipStatus;
  reusable: boolean;
  itemCode?: string;
  processCount: number;
  referencingProjects: number;
};

export type WipDefinitionDetail = {
  id: string;
  name: string;
  description: string | null;
  baseUom: WipBaseUom;
  yieldPct: string;
  reusable: boolean;
  status: WipStatus;
  version: number;
  itemCode?: string | null;
  itemId?: string | null;
};

export type WipIngredientRow = {
  itemId: string;
  itemCode?: string;
  itemName?: string;
  qtyPerUnit: string;
  uom: string;
  sequence: number;
};

export type WipProcessRoleRow = {
  roleGroup: string;
  headcount: number;
  ratePerHour: number | null;
};

export type WipProcessRow = {
  id?: string;
  processName: string;
  displayOrder: number;
  durationHours: number;
  additionalCost: number;
  throughputPerHour: number | null;
  throughputUom: string | null;
  setupCost: number;
  roles: WipProcessRoleRow[];
};

export type WipWhereUsedRow = {
  projectId: string;
  projectName: string;
  fgCode: string;
  acceptedVersion: number | null;
};

export type SaveWipDefinitionInput = {
  id?: string;
  name: string;
  description?: string | null;
  baseUom: WipBaseUom;
  yieldPct: string;
  reusable: boolean;
  ingredients: WipIngredientRow[];
  processes: WipProcessRow[];
};

export type ListWipDefinitionsFilter = {
  status?: 'active' | 'archived';
};

export type OperationOption = { id: string; operationName: string };
