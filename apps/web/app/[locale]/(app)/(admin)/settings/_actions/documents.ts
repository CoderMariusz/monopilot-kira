'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

type DocumentSettingRow = {
  doc_type: 'po' | 'to' | 'wo';
  number_prefix: string;
  number_date_part: 'none' | 'YYYY' | 'YYYYMM' | 'YYYYMMDD';
  number_seq_padding: number | string;
  next_seq: number | string;
  archive_after_days: number | string | null;
  updated_at: string | Date;
};

type DocumentSetting = {
  docType: 'po' | 'to' | 'wo';
  numberPrefix: string;
  numberDatePart: 'none' | 'YYYY' | 'YYYYMM' | 'YYYYMMDD';
  numberSeqPadding: number;
  nextSeq: string;
  archiveAfterDays: number | null;
  updatedAt: string;
};

type SettingsError = 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed';

const READ_PERMISSION = 'settings.org.read';
const UPDATE_PERMISSION = 'settings.infra.update';

const updateInputSchema = z.object({
  docType: z.enum(['po', 'to', 'wo']),
  numberPrefix: z.string().trim().min(1).max(16),
  numberDatePart: z.enum(['none', 'YYYY', 'YYYYMM', 'YYYYMMDD']),
  numberSeqPadding: z.number().int().min(3).max(8),
  archiveAfterDays: z.number().int().positive().max(3650).nullable(),
});

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapSetting(row: DocumentSettingRow): DocumentSetting {
  return {
    docType: row.doc_type,
    numberPrefix: row.number_prefix,
    numberDatePart: row.number_date_part,
    numberSeqPadding: Number(row.number_seq_padding),
    nextSeq: String(row.next_seq),
    archiveAfterDays: row.archive_after_days === null ? null : Number(row.archive_after_days),
    updatedAt: toIso(row.updated_at),
  };
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

export async function readOrgDocumentSettings(): Promise<
  { ok: true; settings: DocumentSetting[] } | { ok: false; error: SettingsError }
> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<
      { ok: true; settings: DocumentSetting[] } | { ok: false; error: SettingsError }
    > => {
      const ctx = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, READ_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<DocumentSettingRow>(
        `select doc_type, number_prefix, number_date_part, number_seq_padding,
                next_seq, archive_after_days, updated_at
           from public.org_document_settings
          where org_id = app.current_org_id()
          order by array_position(array['po','to','wo'], doc_type)`,
      );
      return { ok: true, settings: rows.map(mapSetting) };
    });
  } catch (error) {
    console.error('[settings/documents] readOrgDocumentSettings failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateOrgDocumentSettings(
  rawInput: unknown,
): Promise<{ ok: true; setting: DocumentSetting } | { ok: false; error: SettingsError; message?: string }> {
  const parsed = updateInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<
      { ok: true; setting: DocumentSetting } | { ok: false; error: SettingsError; message?: string }
    > => {
      const ctx = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, UPDATE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<DocumentSettingRow>(
        `update public.org_document_settings
            set number_prefix = $2,
                number_date_part = $3,
                number_seq_padding = $4::integer,
                archive_after_days = $5::integer,
                updated_by = $6::uuid
          where org_id = app.current_org_id()
            and doc_type = $1
        returning doc_type, number_prefix, number_date_part, number_seq_padding,
                  next_seq, archive_after_days, updated_at`,
        [input.docType, input.numberPrefix, input.numberDatePart, input.numberSeqPadding, input.archiveAfterDays, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      return { ok: true, setting: mapSetting(row) };
    });
  } catch (error) {
    console.error('[settings/documents] updateOrgDocumentSettings failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
