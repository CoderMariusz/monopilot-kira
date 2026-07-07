'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { validateEcoSupersessionLink } from '../../../../../../../lib/technical/eco-apply-service';
import {
  ECO_EXT_SUPERSEDING_BOM_HEADER_ID,
  ECO_EXT_SUPERSEDING_FACTORY_SPEC_ID,
  ECO_WRITE_PERMISSION,
  hasPermission,
  type MutateEcoResult,
  type OrgActionContext,
  type QueryClient,
  LinkEcoSupersessionInput,
  writeEcoAudit,
} from './shared';

export async function linkEcoSupersession(rawInput: unknown): Promise<MutateEcoResult> {
  const parsed = LinkEcoSupersessionInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<MutateEcoResult> => {
      const qc = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: qc };
      if (!(await hasPermission(ctx, ECO_WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows: statusRows } = await qc.query<{ id: string; status: string }>(
        `select id, status
           from public.technical_change_orders
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [parsed.data.id],
      );
      const current = statusRows[0];
      if (!current) return { ok: false, error: 'not_found' };
      if (current.status !== 'implementing') return { ok: false, error: 'invalid_state' };

      const validation = await validateEcoSupersessionLink(qc, {
        changeOrderId: parsed.data.id,
        supersedingBomHeaderId: parsed.data.supersedingBomHeaderId,
        supersedingFactorySpecId: parsed.data.supersedingFactorySpecId,
      });
      if (!validation.ok) {
        return {
          ok: false,
          error: validation.error === 'invalid_state' ? 'invalid_state' : 'supersession_invalid',
          message: validation.message,
        };
      }

      const patch: Record<string, string> = {};
      if (parsed.data.supersedingBomHeaderId) {
        patch[ECO_EXT_SUPERSEDING_BOM_HEADER_ID] = parsed.data.supersedingBomHeaderId;
      }
      if (parsed.data.supersedingFactorySpecId) {
        patch[ECO_EXT_SUPERSEDING_FACTORY_SPEC_ID] = parsed.data.supersedingFactorySpecId;
      }

      const { rows } = await qc.query<{ id: string; status: string }>(
        `update public.technical_change_orders
            set ext_jsonb = ext_jsonb || $2::jsonb,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'implementing'
          returning id, status`,
        [parsed.data.id, JSON.stringify(patch), userId],
      );
      const order = rows[0];
      if (!order) return { ok: false, error: 'invalid_state' };

      await writeEcoAudit(qc, {
        orgId,
        changeOrderId: order.id,
        actorUserId: userId,
        action: 'eco.supersession_linked',
        fromStatus: 'implementing',
        toStatus: 'implementing',
        payload: patch,
      });

      return { ok: true, data: { id: order.id, status: 'implementing' } };
    });
  } catch (error) {
    console.error('[technical/eco] linkEcoSupersession failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
