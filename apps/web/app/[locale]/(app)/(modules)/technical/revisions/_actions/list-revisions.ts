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
        `select entity_type,
                entity_id,
                entity_code,
                entity_title,
                revision,
                status,
                status_tone,
                actor_user_id,
                occurred_at::text as occurred_at,
                action,
                payload
           from public.v_technical_revision_history
          where org_id = app.current_org_id()
            and ($1::text is null or entity_type = $1)
            and ($2::text is null or entity_id = $2)
            and (
              $3::text is null
              or entity_code ilike '%' || $3 || '%'
              or entity_title ilike '%' || $3 || '%'
              or action ilike '%' || $3 || '%'
            )
          order by occurred_at desc
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
