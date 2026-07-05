import { computeWipProcessCost } from '../../../../lib/npd/wip-cost';

export type ComponentProcessRole = { roleGroup: string; headcount: number; ratePerHour: number | null };
export type ComponentProcess = {
  id: string;
  processName: string;
  displayOrder: number;
  durationHours: number;
  additionalCost: number;
  createsWipItem: boolean;
  wipItemId: string | null;
  throughputPerHour: number;
  throughputUom: string;
  setupCost: number;
  yieldPct: number;
  roles: ComponentProcessRole[];
  processCost: number;
};

export type WipDefinitionRef = {
  id: string;
  name: string;
};

export type DefinitionProcessRow = {
  id: string;
  process_name: string;
  display_order: number | string;
  duration_hours: number | string;
  additional_cost: number | string;
  throughput_per_hour: number | string | null;
  throughput_uom: string | null;
  setup_cost: number | string | null;
};

export type DefinitionRoleRow = {
  process_id: string;
  role_group: string;
  headcount: number | string;
  rate_per_hour: number | string | null;
};

export type LaborRateRow = {
  role_group: string;
  rate_per_hour: number | string;
};

export function resolveWipDefinitionRef(input: {
  itemId: string | null;
  definitions: Array<WipDefinitionRef & { item_id?: string | null }>;
  linkedDefinitionIds: string[];
}): WipDefinitionRef | null {
  const { itemId, definitions, linkedDefinitionIds } = input;
  if (definitions.length === 0) return null;
  if (itemId) {
    const byItem = definitions.find((definition) => definition.item_id === itemId);
    if (byItem) return { id: byItem.id, name: byItem.name };
  }
  const linked = linkedDefinitionIds
    .map((id) => definitions.find((definition) => definition.id === id))
    .find((definition): definition is WipDefinitionRef & { item_id?: string | null } => Boolean(definition));
  if (linked) return { id: linked.id, name: linked.name };
  return null;
}

export function mapDefinitionProcessesToComponentProcesses(
  processes: DefinitionProcessRow[],
  roles: DefinitionRoleRow[],
  laborRates: LaborRateRow[],
): ComponentProcess[] {
  const latestRates = new Map(laborRates.map((rate) => [rate.role_group, Number(rate.rate_per_hour)]));
  const rolesByProcess = new Map<string, ComponentProcessRole[]>();
  for (const role of roles) {
    const ratePerHour =
      role.rate_per_hour === null ? (latestRates.get(role.role_group) ?? null) : Number(role.rate_per_hour);
    const mapped = {
      roleGroup: role.role_group,
      headcount: Number(role.headcount),
      ratePerHour,
    };
    rolesByProcess.set(role.process_id, [...(rolesByProcess.get(role.process_id) ?? []), mapped]);
  }

  return processes.map((process) => {
    const processRoles = rolesByProcess.get(process.id) ?? [];
    const durationHours = Number(process.duration_hours);
    const additionalCost = Number(process.additional_cost);
    return {
      id: process.id,
      processName: process.process_name,
      displayOrder: Number(process.display_order),
      durationHours,
      additionalCost,
      createsWipItem: false,
      wipItemId: null,
      throughputPerHour: Number(process.throughput_per_hour ?? 0),
      throughputUom: process.throughput_uom ?? 'kg',
      setupCost: Number(process.setup_cost ?? 0),
      yieldPct: 100,
      roles: processRoles,
      processCost: computeWipProcessCost(
        processRoles.map((role) => ({
          rolePerHour: role.ratePerHour ?? 0,
          headcount: role.headcount,
        })),
        durationHours,
        additionalCost,
      ),
    };
  });
}

export type ComponentProcessBundle = {
  processes: ComponentProcess[];
  readOnly?: boolean;
  definitionId?: string;
  definitionName?: string;
};

/** Normalize loader output — accepts legacy arrays or enriched bundles. */
export function resolveComponentProcessBundle(
  value: ComponentProcess[] | ComponentProcessBundle | undefined,
): ComponentProcessBundle {
  if (!value) return { processes: [] };
  if (Array.isArray(value)) return { processes: value };
  return value;
}
