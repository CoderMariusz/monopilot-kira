/**
 * Maps L8 action payloads (unknown / snake_case rows) into L10 UI contract types.
 */

import type {
  WipBaseUom,
  WipDefinitionDetail,
  WipDefinitionListItem,
  WipIngredientRow,
  WipProcessRow,
  WipProcessRoleRow,
  WipStatus,
  WipWhereUsedRow,
} from './wip-definition-contract';

const WIP_STATUSES = new Set<WipStatus>(['draft', 'active', 'archived']);
const MASS_UOMS = new Set<WipBaseUom>(['kg', 'g', 'each', 'pack']);

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapListItem(row: unknown): WipDefinitionListItem | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const status = asString(r.status) as WipStatus;
  if (!WIP_STATUSES.has(status)) return null;
  return {
    id: asString(r.id),
    name: asString(r.name),
    baseUom: asString(r.baseUom),
    version: asNumber(r.version, 1),
    status,
    reusable: Boolean(r.reusable),
    itemCode: r.itemCode ? asString(r.itemCode) : undefined,
    processCount: asNumber(r.processCount),
    referencingProjects: asNumber(r.referencingProjects),
  };
}

export function mapDefinition(row: unknown): WipDefinitionDetail | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const status = asString(r.status ?? r.status) as WipStatus;
  const rawUom = asString(r.baseUom ?? r.base_uom);
  const baseUom = (MASS_UOMS.has(rawUom as WipBaseUom) ? rawUom : 'kg') as WipBaseUom;
  if (!WIP_STATUSES.has(status)) return null;
  return {
    id: asString(r.id),
    name: asString(r.name),
    description: r.description == null ? null : asString(r.description),
    baseUom,
    yieldPct: asString(r.yieldPct ?? r.yield_pct ?? '100'),
    reusable: Boolean(r.reusable),
    status,
    version: asNumber(r.version, 1),
    itemCode: r.itemCode != null ? asString(r.itemCode) : r.item_code != null ? asString(r.item_code) : null,
    itemId: r.itemId != null ? asString(r.itemId) : r.item_id != null ? asString(r.item_id) : null,
  };
}

export function mapIngredient(row: unknown): WipIngredientRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const itemId = asString(r.itemId ?? r.item_id);
  if (!itemId) return null;
  return {
    itemId,
    itemCode: r.itemCode ? asString(r.itemCode) : r.item_code ? asString(r.item_code) : undefined,
    itemName: r.name ? asString(r.name) : r.itemName ? asString(r.itemName) : undefined,
    qtyPerUnit: asString(r.qtyPerUnit ?? r.qty_per_unit ?? '0'),
    uom: asString(r.uom || 'kg'),
    sequence: asNumber(r.sequence),
  };
}

function mapRole(row: unknown): WipProcessRoleRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const roleGroup = asString(r.roleGroup ?? r.role_group);
  if (!roleGroup) return null;
  return {
    roleGroup,
    headcount: asNumber(r.headcount, 1),
    ratePerHour: asNullableNumber(r.ratePerHour ?? r.rate_per_hour),
  };
}

export function mapProcess(row: unknown): WipProcessRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const processName = asString(r.processName ?? r.process_name);
  if (!processName) return null;
  const rolesRaw = Array.isArray(r.roles) ? r.roles : [];
  const roles = rolesRaw.map(mapRole).filter((role): role is WipProcessRoleRow => role !== null);
  return {
    id: r.id ? asString(r.id) : undefined,
    processName,
    displayOrder: asNumber(r.displayOrder ?? r.display_order),
    durationHours: asNumber(r.durationHours ?? r.duration_hours),
    additionalCost: asNumber(r.additionalCost ?? r.additional_cost),
    throughputPerHour: asNullableNumber(r.throughputPerHour ?? r.throughput_per_hour),
    throughputUom:
      r.throughputUom != null
        ? asString(r.throughputUom)
        : r.throughput_uom != null
          ? asString(r.throughput_uom)
          : null,
    setupCost: asNumber(r.setupCost ?? r.setup_cost),
    yieldPct: asNullableNumber(r.yieldPct ?? r.yield_pct) ?? undefined,
    roles,
  };
}

export function mapWhereUsed(row: unknown): WipWhereUsedRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const projectId = asString(r.projectId ?? r.project_id);
  if (!projectId) return null;
  return {
    projectId,
    projectName: asString(r.projectName ?? r.project_name),
    fgCode: asString(r.fgCode ?? r.fg_code ?? r.product_code),
    acceptedVersion: asNullableNumber(r.acceptedVersion ?? r.accepted_version),
  };
}

export function toSaveBaseUom(uom: WipBaseUom): WipBaseUom {
  return uom;
}

export function toSaveIngredients(rows: WipIngredientRow[]) {
  return rows.map((row, index) => ({
    itemId: row.itemId,
    qtyPerUnit: Number(row.qtyPerUnit) || 0,
    uom: row.uom,
    sequence: row.sequence ?? index,
  }));
}

export function toSaveProcesses(rows: WipProcessRow[]) {
  return rows.map((row) => ({
    id: row.id,
    processName: row.processName,
    displayOrder: row.displayOrder,
    durationHours: row.durationHours,
    additionalCost: row.additionalCost,
    throughputPerHour: row.throughputPerHour,
    throughputUom: row.throughputUom,
    setupCost: row.setupCost,
    yieldPct: row.yieldPct,
    roles: row.roles.map((role) => ({
      roleGroup: role.roleGroup,
      headcount: role.headcount,
      ratePerHour: role.ratePerHour,
    })),
  }));
}
