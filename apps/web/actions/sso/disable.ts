'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

export type DisableSsoResult =
  | { ok: true; data: { orgId: string; enabled: false } }
  | { ok: false; error: 'not_found' | 'persistence_failed' };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function disableSso(): Promise<DisableSsoResult> {
  return withOrgContext(async ({ orgId, client }: { orgId: string; client: QueryClient }) => {
    try {
      const { rows, rowCount } = await client.query<{ org_id: string; enabled: false }>(
        `update public.org_sso_config
            set enabled = false,
                updated_at = now()
          where org_id = app.current_org_id()
        returning org_id, enabled`,
      );
      if ((rowCount ?? rows.length) < 1) return { ok: false, error: 'not_found' };
      return { ok: true, data: { orgId: rows[0]?.org_id ?? orgId, enabled: false } };
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }
  });
}
