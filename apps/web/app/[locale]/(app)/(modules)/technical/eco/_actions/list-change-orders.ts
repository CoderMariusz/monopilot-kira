'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  type EcoStatus,
  type EcoStatusTone,
  hasPermission,
  ListEcoInput,
  type ListEcoResult,
  type OrgActionContext,
  type QueryClient,
  ECO_WRITE_PERMISSION,
} from './shared';

type EcoRow = {
  id: string;
  code: string;
  title: string;
  status: string;
  status_tone: string;
  priority: string;
  change_type: string;
  target_item_id: string | null;
  target_bom_header_id: string | null;
  target_factory_spec_id: string | null;
  updated_at: string;
  line_count: string | number;
};

export async function listChangeOrders(rawInput: unknown = {}): Promise<ListEcoResult> {
  const parsed = ListEcoInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ListEcoResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ECO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const input = parsed.data;
      const { rows } = await qc.query<EcoRow>(
        `select co.id,
                co.code,
                co.title,
                co.status,
                co.status_tone,
                co.priority,
                co.change_type,
                co.target_item_id,
                co.target_bom_header_id,
                co.target_factory_spec_id,
                co.updated_at::text as updated_at,
                (select count(*) from public.technical_change_order_lines l
                  where l.org_id = app.current_org_id() and l.change_order_id = co.id) as line_count
           from public.technical_change_orders co
          where co.org_id = app.current_org_id()
            and ($1::text is null or co.status = $1)
            and ($2::uuid is null or co.target_item_id = $2::uuid)
          order by co.updated_at desc
          limit $3::integer`,
        [input.status ?? null, input.targetItemId ?? null, input.limit],
      );

      return {
        ok: true,
        data: {
          changeOrders: rows.map((row) => ({
            id: row.id,
            code: row.code,
            title: row.title,
            status: row.status as EcoStatus,
            statusTone: row.status_tone as EcoStatusTone,
            priority: row.priority,
            changeType: row.change_type,
            targetItemId: row.target_item_id,
            targetBomHeaderId: row.target_bom_header_id,
            targetFactorySpecId: row.target_factory_spec_id,
            updatedAt: row.updated_at,
            lineCount: Number(row.line_count),
          })),
        },
      };
    });
  } catch (error) {
    console.error('[technical/eco] listChangeOrders failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
