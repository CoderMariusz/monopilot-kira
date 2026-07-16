'use server';

import { z } from 'zod';

import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';
import { AuthError, ValidationError } from '../../fa/actions/errors';
import { updateFaCell } from '../../fa/actions/update-fa-cell';
import {
  APP_VERSION,
  FA_EDIT_EVENT,
  isAutoColumn,
  loadDeptColumn,
  permissionForDept,
  quoteIdentifier,
  validateValue,
  type OrgContextLike,
  type UpdateFaCellResult,
} from '../../fa/actions/_lib/fa-cell-shared';
import { syncLinkedFgNameFromProject } from './_lib/project-fg-sync';

type SaveStageDeptFieldInput = {
  projectId: string;
  productCode: string | null;
  fieldCode: string;
  value: unknown;
};

const inputSchema = z.object({
  projectId: z.string().uuid(),
  productCode: z.string().trim().optional().nullable(),
  fieldCode: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
  value: z.unknown(),
});

export async function saveStageDeptField(input: SaveStageDeptFieldInput) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid stage department field update input');
  }

  const productCode = (parsed.data.productCode ?? '').trim();
  if (
    productCode &&
    parsed.data.fieldCode === 'product_name'
  ) {
    return withOrgContext<UpdateFaCellResult>(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const column = await loadDeptColumn(ctx, parsed.data.fieldCode);
      const permission = permissionForDept(column.dept_code);
      if (!(await hasPermission(ctx, permission))) {
        throw new AuthError('FORBIDDEN', `${permission} is required to update ${parsed.data.fieldCode}`);
      }
      if (await isAutoColumn(ctx, column.column_key)) {
        throw new ValidationError('READ_ONLY_COLUMN', 'Auto-derived columns cannot be edited');
      }

      const linkedToProject = await isProductLinkedToProject(ctx, parsed.data.projectId, productCode);
      if (!linkedToProject) {
        return updateFaCell(productCode, parsed.data.fieldCode, parsed.data.value);
      }

      const newValue = await validateValue(ctx, column, parsed.data.value);
      await ctx.client.query(`select set_config('app.fa_actor_user_id', $1, true)`, [ctx.userId]);
      const result = await updateProjectName(ctx, parsed.data.projectId, newValue);
      await syncLinkedFgNameFromProject(
        ctx,
        parsed.data.projectId,
        typeof newValue === 'string' ? newValue : null,
      );
      await writeProjectEditOutbox(ctx, parsed.data.projectId, column.column_key, result);
      safeRevalidatePath(`/npd/pipeline/${parsed.data.projectId}`);
      return result;
    });
  }
  if (!productCode) {
    return withOrgContext<UpdateFaCellResult>(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const column = await loadDeptColumn(ctx, parsed.data.fieldCode);
      const permission = permissionForDept(column.dept_code);
      if (!(await hasPermission(ctx, permission))) {
        throw new AuthError('FORBIDDEN', `${permission} is required to update ${parsed.data.fieldCode}`);
      }
      if (await isAutoColumn(ctx, column.column_key)) {
        throw new ValidationError('READ_ONLY_COLUMN', 'Auto-derived columns cannot be edited');
      }

      const newValue = await validateValue(ctx, column, parsed.data.value);
      await ctx.client.query(`select set_config('app.fa_actor_user_id', $1, true)`, [ctx.userId]);
      const result = await updateProjectField(ctx, parsed.data.projectId, column.column_key, newValue);
      await writeProjectEditOutbox(ctx, parsed.data.projectId, column.column_key, result);
      safeRevalidatePath(`/npd/pipeline/${parsed.data.projectId}`);
      return result;
    });
  }
  return updateFaCell(productCode, parsed.data.fieldCode, parsed.data.value);
}

async function updateProjectField(
  ctx: OrgContextLike,
  projectId: string,
  columnName: string,
  value: string | number | boolean | Date | null,
): Promise<UpdateFaCellResult> {
  if (columnName === 'product_name') {
    const result = await updateProjectName(ctx, projectId, value);
    await syncLinkedFgNameFromProject(
      ctx,
      projectId,
      typeof value === 'string' ? value : null,
    );
    return result;
  }
  if (await isProjectColumn(ctx, columnName)) {
    return updateProjectColumn(ctx, projectId, columnName, value);
  }
  return updateProjectFieldValue(ctx, projectId, columnName, value);
}

async function isProjectColumn(ctx: OrgContextLike, columnName: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'npd_projects'
        and column_name = $1
      limit 1`,
    [columnName],
  );
  return rows[0]?.ok === true;
}

async function isProductLinkedToProject(
  ctx: OrgContextLike,
  projectId: string,
  productCode: string,
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.npd_projects
      where id = $1::uuid
        and org_id = app.current_org_id()
        and product_code = $2
      limit 1`,
    [projectId, productCode],
  );
  return rows.length > 0;
}

async function updateProjectName(
  ctx: OrgContextLike,
  projectId: string,
  value: string | number | boolean | Date | null,
): Promise<UpdateFaCellResult> {
  const { rows } = await ctx.client.query<{ previous_value: string | null; new_value: string | null }>(
    `with current_row as (
       select name::text as previous_value
         from public.npd_projects
        where id = $1::uuid
          and org_id = app.current_org_id()
     ),
     updated as (
       update public.npd_projects np
          set name = $2
         from current_row
        where np.id = $1::uuid
          and np.org_id = app.current_org_id()
        returning current_row.previous_value, np.name::text as new_value
     )
     select previous_value, new_value
       from updated`,
    [projectId, value],
  );
  const row = rows[0];
  if (!row) throw new ValidationError('PROJECT_NOT_FOUND', 'Project is not visible in the current organization');
  return { previousValue: row.previous_value, newValue: row.new_value, builtReset: false };
}

async function updateProjectColumn(
  ctx: OrgContextLike,
  projectId: string,
  columnName: string,
  value: string | number | boolean | Date | null,
): Promise<UpdateFaCellResult> {
  const quoted = quoteIdentifier(columnName);
  const { rows } = await ctx.client.query<{ previous_value: string | null; new_value: string | null }>(
    `with current_row as (
       select ${quoted}::text as previous_value
         from public.npd_projects
        where id = $1::uuid
          and org_id = app.current_org_id()
     ),
     updated as (
       update public.npd_projects np
          set ${quoted} = $2
         from current_row
        where np.id = $1::uuid
          and np.org_id = app.current_org_id()
        returning current_row.previous_value, np.${quoted}::text as new_value
     )
     select previous_value, new_value
       from updated`,
    [projectId, value],
  );
  const row = rows[0];
  if (!row) throw new ValidationError('PROJECT_NOT_FOUND', 'Project is not visible in the current organization');
  return { previousValue: row.previous_value, newValue: row.new_value, builtReset: false };
}

async function updateProjectFieldValue(
  ctx: OrgContextLike,
  projectId: string,
  columnName: string,
  value: string | number | boolean | Date | null,
): Promise<UpdateFaCellResult> {
  const { rows } = await ctx.client.query<{ previous_value: string | null; new_value: string | null }>(
    `with current_row as (
       select field_values ->> $2 as previous_value
         from public.npd_projects
        where id = $1::uuid
          and org_id = app.current_org_id()
     ),
     updated as (
       update public.npd_projects np
          -- $3 is cast to text in BOTH usages: an untyped parameter used only in
          -- "is null" + variadic jsonb_build_object gives Postgres no type context
          -- and fails with 42P18 (proven live via PREPARE before shipping).
          set field_values = case
                when $3::text is null then field_values - $2
                else field_values || jsonb_build_object($2, $3::text)
              end
         from current_row
        where np.id = $1::uuid
          and np.org_id = app.current_org_id()
        returning current_row.previous_value, np.field_values ->> $2 as new_value
     )
     select previous_value, new_value
       from updated`,
    [projectId, columnName, value],
  );
  const row = rows[0];
  if (!row) throw new ValidationError('PROJECT_NOT_FOUND', 'Project is not visible in the current organization');
  return { previousValue: row.previous_value, newValue: row.new_value, builtReset: false };
}

async function writeProjectEditOutbox(
  ctx: OrgContextLike,
  projectId: string,
  columnName: string,
  result: UpdateFaCellResult,
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'npd_project', $2, $3::jsonb, $4)`,
    [
      FA_EDIT_EVENT,
      projectId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        project_id: projectId,
        field_code: columnName,
        diff: {
          [columnName]: {
            prev: result.previousValue,
            next: result.newValue,
          },
        },
        built_reset: false,
      }),
      APP_VERSION,
    ],
  );
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
