import { withOrgContext } from "../../../../../lib/auth/with-org-context";
import {
  PROJECT_VIEW_PERMISSION,
  hasPermission,
  type OrgContextLike,
} from "../../../../(npd)/pipeline/_actions/shared";

export type OwnerWorkloadRow = {
  owner: string;
  gate: string;
  count: number;
};

type OwnerWorkloadSqlRow = {
  owner: string | null;
  gate: string;
  count: string | number;
};

export async function getOwnerWorkload(): Promise<OwnerWorkloadRow[]> {
  "use server";

  try {
    return await withOrgContext<OwnerWorkloadRow[]>(async (ctx): Promise<OwnerWorkloadRow[]> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, PROJECT_VIEW_PERMISSION))) {
        return [];
      }

      const { rows } = await context.client.query<OwnerWorkloadSqlRow>(
        `select p.owner,
                p.current_gate as gate,
                count(*)::text as count
           from public.npd_projects p
          where p.org_id = app.current_org_id()
          group by p.owner, p.current_gate
          order by p.owner nulls last, p.current_gate`,
      );

      return rows.map((row) => ({
        owner: row.owner ?? "Unassigned",
        gate: row.gate,
        count: Number(row.count),
      }));
    });
  } catch (error) {
    console.error("[npd-owner-workload] org-scoped read failed:", error);
    throw error;
  }
}
