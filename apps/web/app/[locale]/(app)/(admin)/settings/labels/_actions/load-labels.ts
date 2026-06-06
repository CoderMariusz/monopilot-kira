'use server';

/**
 * Real-data loader for the Settings → Label templates list + editor.
 *
 * Resolves the org context (withOrgContext / RLS) to (a) obtain the verified
 * `org_id` required by `getLabelTemplates(orgId)` and (b) compute whether the
 * caller may mutate templates (settings.org.update — the same permission the
 * label-templates.ts producers enforce). It then consumes the existing
 * `getLabelTemplates` producer so the list reads only real, org-scoped
 * `public.label_templates` rows. No mocks, no hardcoded templates.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getLabelTemplates, type LabelTemplateRow } from './label-templates';

const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type LabelsLoadResult = {
  state: 'ready' | 'empty' | 'error';
  templates: LabelTemplateRow[];
  canEdit: boolean;
};

async function hasSettingsUpdatePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, SETTINGS_UPDATE_PERMISSION],
  );
  return rows.length > 0;
}

export async function loadLabelTemplatesData(): Promise<LabelsLoadResult> {
  try {
    const { orgId, canEdit } = await withOrgContext<{ orgId: string; canEdit: boolean }>(async (ctx) => {
      const context = ctx as OrgContextLike;
      const canEdit = await hasSettingsUpdatePermission(context);
      return { orgId: context.orgId, canEdit };
    });

    const templates = await getLabelTemplates(orgId);
    return {
      state: templates.length > 0 ? 'ready' : 'empty',
      templates,
      canEdit,
    };
  } catch {
    return { state: 'error', templates: [], canEdit: false };
  }
}
