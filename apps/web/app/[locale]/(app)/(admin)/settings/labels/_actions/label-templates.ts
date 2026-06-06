'use server';

/**
 * FLAG(settings-label-templates-schema): local migration
 * packages/db/migrations/20260606_232_settings_import_export_labels.sql adds
 * public.label_templates. Do not apply remotely from Codex; this action is
 * wired to the assumed local schema so the Settings label-template list/editor
 * can read/write real Supabase data through withOrgContext/RLS.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const LABELS_ROUTE = '/settings/labels';
const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type LabelTemplateStatus = 'draft' | 'active' | 'archived';

export type LabelTemplateRow = {
  id: string;
  name: string;
  size: string;
  used_on: string;
  updated_at: string;
  status: LabelTemplateStatus;
};

export type JsonBlob = Record<string, unknown> | unknown[];

export type LabelTemplate = LabelTemplateRow & {
  org_id: string;
  elements: JsonBlob;
  created_at: string;
};

export type LabelTemplateMutationResult =
  | { ok: true; template: LabelTemplate }
  | { ok: false; error: 'invalid' | 'forbidden' | 'not_found' | 'persistence_failed' };

type LabelTemplateDbRow = {
  id: string;
  org_id: string;
  name: string;
  size: string;
  used_on: string | null;
  elements: JsonBlob | null;
  status: LabelTemplateStatus;
  created_at: string | Date;
  updated_at: string | Date;
};

const JsonBlobInput = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);

const LabelTemplateInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    size: z.string().trim().min(1).max(80),
    used_on: z.string().trim().max(160).optional().default(''),
    status: z.enum(['draft', 'active', 'archived']).default('draft'),
    elements: JsonBlobInput.default([]),
  })
  .strict();

const UpdateLabelTemplateInput = LabelTemplateInput.partial().strict();

export type CreateLabelTemplateInput = z.input<typeof LabelTemplateInput>;
export type UpdateLabelTemplateInput = z.input<typeof UpdateLabelTemplateInput>;

function revalidateLabelsRoute() {
  try {
    revalidatePath(LABELS_ROUTE);
  } catch {
    /* no request store in action unit tests */
  }
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toLabelTemplate(row: LabelTemplateDbRow): LabelTemplate {
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    size: row.size,
    used_on: row.used_on ?? '',
    elements: row.elements ?? [],
    status: row.status,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

function toLabelTemplateRow(row: LabelTemplateDbRow): LabelTemplateRow {
  const template = toLabelTemplate(row);
  return {
    id: template.id,
    name: template.name,
    size: template.size,
    used_on: template.used_on,
    updated_at: template.updated_at,
    status: template.status,
  };
}

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

export async function getLabelTemplates(orgId: string): Promise<LabelTemplateRow[]> {
  return withOrgContext<LabelTemplateRow[]>(async (ctx): Promise<LabelTemplateRow[]> => {
    const context = ctx as OrgContextLike;
    if (context.orgId !== orgId) return [];

    const { rows } = await context.client.query<LabelTemplateDbRow>(
      `select id::text,
              org_id::text,
              name,
              size,
              used_on,
              elements,
              status,
              created_at,
              updated_at
         from public.label_templates
        where org_id = app.current_org_id()
          and org_id = $1::uuid
        order by updated_at desc, name`,
      [orgId],
    );
    return rows.map(toLabelTemplateRow);
  });
}

export async function createLabelTemplate(rawInput: unknown): Promise<LabelTemplateMutationResult> {
  const parsed = LabelTemplateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  try {
    return await withOrgContext<LabelTemplateMutationResult>(async (ctx): Promise<LabelTemplateMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const input = parsed.data;
      const { rows } = await context.client.query<LabelTemplateDbRow>(
        `insert into public.label_templates
           (org_id, name, size, used_on, elements, status, created_by, updated_by)
         values ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7::uuid, $7::uuid)
         returning id::text, org_id::text, name, size, used_on, elements, status, created_at, updated_at`,
        [
          context.orgId,
          input.name,
          input.size,
          input.used_on,
          JSON.stringify(input.elements),
          input.status,
          context.userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      revalidateLabelsRoute();
      return { ok: true, template: toLabelTemplate(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateLabelTemplate(
  id: string,
  rawInput: unknown,
): Promise<LabelTemplateMutationResult> {
  const idParsed = z.string().uuid().safeParse(id);
  const parsed = UpdateLabelTemplateInput.safeParse(rawInput);
  if (!idParsed.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    return { ok: false, error: 'invalid' };
  }

  try {
    return await withOrgContext<LabelTemplateMutationResult>(async (ctx): Promise<LabelTemplateMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const input = parsed.data;
      const { rows } = await context.client.query<LabelTemplateDbRow>(
        `update public.label_templates
            set name = coalesce($3, name),
                size = coalesce($4, size),
                used_on = coalesce($5, used_on),
                elements = coalesce($6::jsonb, elements),
                status = coalesce($7, status),
                updated_by = $8::uuid,
                updated_at = now()
          where org_id = app.current_org_id()
            and org_id = $1::uuid
            and id = $2::uuid
          returning id::text, org_id::text, name, size, used_on, elements, status, created_at, updated_at`,
        [
          context.orgId,
          idParsed.data,
          input.name ?? null,
          input.size ?? null,
          input.used_on ?? null,
          input.elements === undefined ? null : JSON.stringify(input.elements),
          input.status ?? null,
          context.userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateLabelsRoute();
      return { ok: true, template: toLabelTemplate(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export type LabelTemplateDeleteResult =
  | { ok: true; id: string }
  | { ok: false; error: 'invalid' | 'forbidden' | 'not_found' | 'persistence_failed' };

export async function deleteLabelTemplate(id: string): Promise<LabelTemplateDeleteResult> {
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'invalid' };

  try {
    return await withOrgContext<LabelTemplateDeleteResult>(async (ctx): Promise<LabelTemplateDeleteResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<{ id: string }>(
        `delete from public.label_templates
          where org_id = app.current_org_id()
            and org_id = $1::uuid
            and id = $2::uuid
         returning id::text`,
        [context.orgId, idParsed.data],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateLabelsRoute();
      return { ok: true, id: row.id };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function duplicateLabelTemplate(id: string): Promise<LabelTemplateMutationResult> {
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) return { ok: false, error: 'invalid' };

  try {
    return await withOrgContext<LabelTemplateMutationResult>(async (ctx): Promise<LabelTemplateMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<LabelTemplateDbRow>(
        `insert into public.label_templates
           (org_id, name, size, used_on, elements, status, created_by, updated_by)
         select org_id,
                left(name || ' Copy', 160),
                size,
                used_on,
                elements,
                'draft',
                $3::uuid,
                $3::uuid
           from public.label_templates
          where org_id = app.current_org_id()
            and org_id = $1::uuid
            and id = $2::uuid
         returning id::text, org_id::text, name, size, used_on, elements, status, created_at, updated_at`,
        [context.orgId, idParsed.data, context.userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateLabelsRoute();
      return { ok: true, template: toLabelTemplate(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
