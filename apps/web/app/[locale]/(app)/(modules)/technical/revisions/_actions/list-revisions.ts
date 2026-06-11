'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const EntityTypes = ['item', 'bom', 'factory_spec', 'eco'] as const;

const ListTechnicalRevisionsInput = z.object({
  entityType: z.enum(EntityTypes).optional(),
  entityId: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().min(1).max(128).optional(),
  limit: z.number().int().min(1).max(200).optional().default(100),
});
type ListTechnicalRevisionsInputType = z.input<typeof ListTechnicalRevisionsInput>;

type TechnicalRevisionRow = {
  entityType: string;
  entityId: string;
  entityCode: string | null;
  entityTitle: string | null;
  revision: number | null;
  status: string | null;
  statusTone: 'success' | 'warning' | 'danger' | 'info' | 'muted';
  actorUserId: string | null;
  /** Resolved from public.users (name/display_name + email) — never render the uuid. */
  actorName: string | null;
  actorEmail: string | null;
  occurredAt: string;
  action: string;
  payload: unknown;
};

type ListTechnicalRevisionsResult =
  | { ok: true; data: { revisions: TechnicalRevisionRow[] } }
  | { ok: false; error: 'invalid_input' | 'persistence_failed'; message?: string };

type RevisionDbRow = {
  entity_type: string;
  entity_id: string;
  entity_code: string | null;
  entity_title: string | null;
  revision: number | null;
  status: string | null;
  status_tone: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  occurred_at: string;
  action: string;
  payload: unknown;
};

export async function listTechnicalRevisions(rawInput: unknown = {}): Promise<ListTechnicalRevisionsResult> {
  const parsed = ListTechnicalRevisionsInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ client }): Promise<ListTechnicalRevisionsResult> => {
      const qc = client as QueryClient;
      const { rows } = await qc.query<RevisionDbRow>(
        `select r.entity_type,
                r.entity_id,
                r.entity_code,
                r.entity_title,
                r.revision,
                r.status,
                r.status_tone,
                r.actor_user_id,
                coalesce(u.name, u.display_name) as actor_name,
                u.email::text as actor_email,
                r.occurred_at::text as occurred_at,
                r.action,
                r.payload
           from public.v_technical_revision_history r
           left join public.users u
             on u.id = r.actor_user_id
            and u.org_id = app.current_org_id()
          where r.org_id = app.current_org_id()
            and ($1::text is null or r.entity_type = $1)
            and ($2::text is null or r.entity_id = $2)
            and (
              $3::text is null
              or r.entity_code ilike '%' || $3 || '%'
              or r.entity_title ilike '%' || $3 || '%'
              or r.action ilike '%' || $3 || '%'
            )
          order by r.occurred_at desc
          limit $4::integer`,
        [input.entityType ?? null, input.entityId ?? null, input.search ?? null, input.limit],
      );

      return {
        ok: true,
        data: {
          revisions: rows.map((row) => ({
            entityType: row.entity_type,
            entityId: row.entity_id,
            entityCode: row.entity_code,
            entityTitle: row.entity_title,
            revision: row.revision === null ? null : Number(row.revision),
            status: row.status,
            statusTone: row.status_tone as TechnicalRevisionRow['statusTone'],
            actorUserId: row.actor_user_id,
            actorName: row.actor_name,
            actorEmail: row.actor_email,
            occurredAt: row.occurred_at,
            action: row.action,
            payload: row.payload,
          })),
        },
      };
    });
  } catch (error) {
    console.error('[technical/revisions] listTechnicalRevisions failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
