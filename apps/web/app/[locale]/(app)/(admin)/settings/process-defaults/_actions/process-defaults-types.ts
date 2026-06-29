export type ProcessDefaultRole = { roleGroup: string; defaultHeadcount: number };

export type ProcessDefaultRow = {
  operationId: string;
  operationName: string;
  standardCost: number;
  defaultDurationHours: number;
  roles: ProcessDefaultRole[];
};
