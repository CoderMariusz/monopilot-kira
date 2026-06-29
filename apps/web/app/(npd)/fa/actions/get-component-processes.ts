'use server';

import { computeWipProcessCost } from '../../../../lib/npd/wip-cost';
import { withOrgContext } from '../../../../lib/auth/with-org-context';

export type ComponentProcessRole = { roleGroup: string; headcount: number; ratePerHour: number | null };
export type ComponentProcess = {
  id: string; processName: string; displayOrder: number; durationHours: number;
  additionalCost: number; createsWipItem: boolean; wipItemId: string | null;
  roles: ComponentProcessRole[]; processCost: number;
};

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type ProcessRow = {
  id: string;
  process_name: string;
  display_order: number | string;
  duration_hours: number | string;
  additional_cost: number | string;
  creates_wip_item: boolean;
  wip_item_id: string | null;
};

type RoleRow = {
  process_id: string;
  role_group: string;
  headcount: number | string;
  rate_per_hour: number | string | null;
};

type LaborRateRow = {
  role_group: string;
  rate_per_hour: number | string;
};

export async function getComponentProcesses(prodDetailId: string): Promise<
  { ok: true; data: ComponentProcess[] } | { ok: false; error: string }> {
  try {
    return await withOrgContext<{ ok: true; data: ComponentProcess[] } | { ok: false; error: string }>(
      async (rawCtx) => {
        const ctx = rawCtx as OrgContextLike;
        const processes = await ctx.client.query<ProcessRow>(
          `select id,
                  process_name,
                  display_order,
                  duration_hours,
                  additional_cost,
                  creates_wip_item,
                  wip_item_id
             from public.npd_wip_processes
            where org_id = $2::uuid
              and prod_detail_id = $1::uuid
            order by display_order asc`,
          [prodDetailId, ctx.orgId],
        );

        const processIds = processes.rows.map((process) => process.id);
        if (processIds.length === 0) return { ok: true, data: [] };

        const roles = await ctx.client.query<RoleRow>(
          `select process_id,
                  role_group,
                  headcount,
                  rate_per_hour
             from public.npd_wip_process_roles
            where org_id = $2::uuid
              and process_id = any($1::uuid[])
            order by process_id asc, role_group asc`,
          [processIds, ctx.orgId],
        );

        const roleGroups = [...new Set(roles.rows.map((role) => role.role_group))];
        const laborRates = roleGroups.length > 0
          ? await ctx.client.query<LaborRateRow>(
            `select distinct on (role_group)
                    role_group,
                    rate_per_hour
               from public.labor_rates
              where org_id = $2::uuid
                and role_group = any($1::text[])
                and effective_from <= current_date
              order by role_group asc, effective_from desc`,
            [roleGroups, ctx.orgId],
          )
          : { rows: [] };

        const latestRates = new Map(
          laborRates.rows.map((rate) => [rate.role_group, Number(rate.rate_per_hour)]),
        );
        const rolesByProcess = new Map<string, ComponentProcessRole[]>();
        for (const role of roles.rows) {
          const ratePerHour = role.rate_per_hour === null
            ? latestRates.get(role.role_group) ?? null
            : Number(role.rate_per_hour);
          const mapped = {
            roleGroup: role.role_group,
            headcount: Number(role.headcount),
            ratePerHour,
          };
          rolesByProcess.set(role.process_id, [...(rolesByProcess.get(role.process_id) ?? []), mapped]);
        }

        const data = processes.rows.map((process) => {
          const processRoles = rolesByProcess.get(process.id) ?? [];
          const durationHours = Number(process.duration_hours);
          const additionalCost = Number(process.additional_cost);
          return {
            id: process.id,
            processName: process.process_name,
            displayOrder: Number(process.display_order),
            durationHours,
            additionalCost,
            createsWipItem: process.creates_wip_item,
            wipItemId: process.wip_item_id,
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

        return { ok: true, data };
      },
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not load component processes' };
  }
}
