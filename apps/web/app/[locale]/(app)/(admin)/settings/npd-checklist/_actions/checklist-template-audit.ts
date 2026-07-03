import { randomUUID } from 'node:crypto';

import { DEFAULT_TEMPLATE_ID, NPD_CHECKLIST_PERMISSION } from './checklist-template-schema';
import type { OrgContextLike } from './checklist-template-auth';

export async function writeChecklistTemplateAudit(
  context: OrgContextLike,
  action: string,
  payload: unknown,
): Promise<void> {
  await context.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        after_state, request_id, retention_class)
     values (app.current_org_id(), $1::uuid, 'user', $2,
             'gate_checklist_template', $3, $4::jsonb, $5::uuid, 'operational')`,
    [
      context.userId,
      action,
      DEFAULT_TEMPLATE_ID,
      JSON.stringify({
        permission: NPD_CHECKLIST_PERMISSION,
        ...(typeof payload === 'object' && payload !== null ? payload : { payload }),
      }),
      randomUUID(),
    ],
  );
}
