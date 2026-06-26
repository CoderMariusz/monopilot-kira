'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

const WRITE_PERMISSIONS = ['technical.write', 'quality.write'] as const;

const inputSchema = z.object({
  productCode: z.string().trim().min(1),
});

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type DeclarationResult =
  | { ok: true; productCode: string }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED' };

type PermissionRow = {
  actor_role: string;
};

type ProductStateRow = {
  product_code: string;
  allergens_declaration_accepted: boolean;
  allergens_declaration_accepted_by: string | null;
  allergens_declaration_accepted_at: Date | string | null;
};

type ProjectRow = {
  id: string;
};

export async function acceptAllergenDeclaration(input: { productCode: string }): Promise<DeclarationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };

  return updateAllergenDeclaration(parsed.data.productCode, true);
}

export async function revokeAllergenDeclaration(input: { productCode: string }): Promise<DeclarationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };

  return updateAllergenDeclaration(parsed.data.productCode, false);
}

async function updateAllergenDeclaration(productCode: string, accepted: boolean): Promise<DeclarationResult> {
  return withOrgContext<DeclarationResult>(async ({ client, userId, orgId }) => {
    const queryClient = client as QueryClient;

    try {
      const actorRole = await requireAllergenDeclarationWrite(queryClient, userId, orgId);
      const current = await queryClient.query<ProductStateRow>(
        `select product_code,
                allergens_declaration_accepted,
                allergens_declaration_accepted_by::text,
                allergens_declaration_accepted_at
           from public.product
          where product_code = $1
            and org_id = app.current_org_id()
            and deleted_at is null
          limit 1`,
        [productCode],
      );
      const before = current.rows[0];
      if (!before) return { ok: false, code: 'NOT_FOUND' };

      const updated = await queryClient.query<ProductStateRow>(
        accepted
          ? `update public.product
                set allergens_declaration_accepted = true,
                    allergens_declaration_accepted_by = $2::uuid,
                    allergens_declaration_accepted_at = now()
              where product_code = $1
                and org_id = app.current_org_id()
                and deleted_at is null
              returning product_code,
                        allergens_declaration_accepted,
                        allergens_declaration_accepted_by::text,
                        allergens_declaration_accepted_at`
          : `update public.product
                set allergens_declaration_accepted = false,
                    allergens_declaration_accepted_by = null,
                    allergens_declaration_accepted_at = null
              where product_code = $1
                and org_id = app.current_org_id()
                and deleted_at is null
              returning product_code,
                        allergens_declaration_accepted,
                        allergens_declaration_accepted_by::text,
                        allergens_declaration_accepted_at`,
        accepted ? [productCode, userId] : [productCode],
      );
      const after = updated.rows[0];
      if (!after) return { ok: false, code: 'NOT_FOUND' };

      await queryClient.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user', $2, 'product', $3, $4::jsonb, $5::jsonb, $6::uuid, 'operational')`,
        [
          userId,
          accepted ? 'product.allergens_declaration.accepted' : 'product.allergens_declaration.revoked',
          productCode,
          JSON.stringify({ ...before, actor_role: actorRole }),
          JSON.stringify({ ...after, actor_role: actorRole }),
          randomUUID(),
        ],
      );

      const project = await queryClient.query<ProjectRow>(
        `select id::text as id
           from public.npd_projects
          where product_code = $1
            and org_id = app.current_org_id()
          order by created_at desc
          limit 1`,
        [productCode],
      );

      safeRevalidatePath(`/npd/fa/${productCode}/allergens`);
      safeRevalidatePath(`/en/npd/fa/${productCode}/allergens`);
      const projectId = project.rows[0]?.id;
      if (projectId) {
        safeRevalidatePath(`/npd/pipeline/${projectId}/approval`);
        safeRevalidatePath(`/en/npd/pipeline/${projectId}/approval`);
      }

      return { ok: true, productCode };
    } catch (error) {
      if (error instanceof AuthorizationError) return { ok: false, code: 'FORBIDDEN' };
      return { ok: false, code: 'PERSISTENCE_FAILED' };
    }
  });
}

async function requireAllergenDeclarationWrite(
  client: QueryClient,
  userId: string,
  orgId: string,
): Promise<string> {
  const { rows } = await client.query<PermissionRow>(
    `select coalesce(r.code, r.slug) as actor_role
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          r.code = 'npd_manager'
          or r.slug = 'npd_manager'
          or rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
          or r.code = any($3::text[])
          or r.slug = any($3::text[])
        )
      order by case when r.code = 'npd_manager' or r.slug = 'npd_manager' then 0 else 1 end,
               r.code
      limit 1`,
    [userId, orgId, WRITE_PERMISSIONS],
  );

  const actorRole = rows[0]?.actor_role?.trim();
  if (!actorRole) throw new AuthorizationError();
  return actorRole;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

class AuthorizationError extends Error {}
