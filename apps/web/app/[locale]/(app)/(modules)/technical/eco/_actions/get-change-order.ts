'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  type EcoLine,
  type EcoStatus,
  type EcoStatusTone,
  GetEcoInput,
  type GetEcoResult,
  hasPermission,
  type OrgActionContext,
  type QueryClient,
  ECO_WRITE_PERMISSION,
} from './shared';

type EcoHeaderRow = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
  status_tone: string;
  priority: string;
  change_type: string;
  requester_user_id: string | null;
  approver_user_id: string | null;
  target_item_id: string | null;
  target_bom_header_id: string | null;
  target_factory_spec_id: string | null;
  impact_summary: string | null;
  requested_effective_at: string | null;
  approved_at: string | null;
  implementing_at: string | null;
  closed_at: string | null;
  updated_at: string;
};

type EcoLineRow = {
  id: string;
  line_no: number;
  action: string;
  target_type: string;
  target_id: string | null;
  field_name: string | null;
  before_value: unknown;
  after_value: unknown;
  rationale: string | null;
};

export async function getChangeOrder(rawInput: unknown): Promise<GetEcoResult> {
  const parsed = GetEcoInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<GetEcoResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ECO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await qc.query<EcoHeaderRow>(
        `select id,
                code,
                title,
                description,
                status,
                status_tone,
                priority,
                change_type,
                requester_user_id,
                approver_user_id,
                target_item_id,
                target_bom_header_id,
                target_factory_spec_id,
                impact_summary,
                requested_effective_at::text as requested_effective_at,
                approved_at::text as approved_at,
                implementing_at::text as implementing_at,
                closed_at::text as closed_at,
                updated_at::text as updated_at
           from public.technical_change_orders
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [parsed.data.id],
      );
      const header = rows[0];
      if (!header) return { ok: false, error: 'not_found' };

      const { rows: lineRows } = await qc.query<EcoLineRow>(
        `select id,
                line_no,
                action,
                target_type,
                target_id,
                field_name,
                before_value,
                after_value,
                rationale
           from public.technical_change_order_lines
          where org_id = app.current_org_id()
            and change_order_id = $1::uuid
          order by line_no`,
        [parsed.data.id],
      );

      const lines: EcoLine[] = lineRows.map((line) => ({
        id: line.id,
        lineNo: Number(line.line_no),
        action: line.action,
        targetType: line.target_type,
        targetId: line.target_id,
        fieldName: line.field_name,
        beforeValue: line.before_value,
        afterValue: line.after_value,
        rationale: line.rationale,
      }));

      return {
        ok: true,
        data: {
          id: header.id,
          code: header.code,
          title: header.title,
          description: header.description,
          status: header.status as EcoStatus,
          statusTone: header.status_tone as EcoStatusTone,
          priority: header.priority,
          changeType: header.change_type,
          requesterUserId: header.requester_user_id,
          approverUserId: header.approver_user_id,
          targetItemId: header.target_item_id,
          targetBomHeaderId: header.target_bom_header_id,
          targetFactorySpecId: header.target_factory_spec_id,
          impactSummary: header.impact_summary,
          requestedEffectiveAt: header.requested_effective_at,
          approvedAt: header.approved_at,
          implementingAt: header.implementing_at,
          closedAt: header.closed_at,
          updatedAt: header.updated_at,
          lineCount: lines.length,
          lines,
        },
      };
    });
  } catch (error) {
    console.error('[technical/eco] getChangeOrder failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
