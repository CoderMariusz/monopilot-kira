'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthorizationError, ValidationError } from './errors';

const WRITE_PERMISSIONS = ['npd.allergen.write', 'technical.write', 'quality.write'] as const;

type OverrideAction = 'add' | 'remove';

type QueryClient = {
  query<T = unknown>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type PermissionContext = {
  client: QueryClient;
  userId: string;
  orgId: string;
};

type CurrentOverrideRow = {
  id: string;
};

type InsertedOverrideRow = {
  id: string;
  supersedes_id: string | null;
};

type CascadeRefreshRow = {
  allergens: string[];
  may_contain: string[];
  changed: boolean;
};

type PermissionRow = {
  actor_role: string;
};

const PG_INSUFFICIENT_PRIVILEGE = '42501';

export type SetAllergenOverrideResult = {
  ok: true;
  data: {
    id: string;
    supersedesId: string | null;
    cascadeChanged: boolean;
    allergens: string[];
    mayContain: string[];
  };
};

const inputSchema = z.object({
  productCode: z.string().trim().min(1),
  allergenCode: z.string().trim().min(1),
  action: z.enum(['add', 'remove']),
  reason: z.string().trim().min(10),
});

function parseInput(
  productCode: string,
  allergenCode: string,
  action: OverrideAction,
  reason: string,
): z.infer<typeof inputSchema> {
  const parsed = inputSchema.safeParse({ productCode, allergenCode, action, reason });

  if (parsed.success) {
    return parsed.data;
  }

  const reasonIssue = parsed.error.issues.find((issue) => issue.path[0] === 'reason');
  if (reasonIssue) {
    throw new ValidationError('REASON_TOO_SHORT', 'Allergen override reason must be at least 10 characters');
  }

  throw new ValidationError('INVALID_INPUT', 'Invalid allergen override input');
}

async function requireAllergenOverrideWrite({
  client,
  userId,
  orgId,
}: PermissionContext): Promise<string> {
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
  if (!actorRole) {
    throw new AuthorizationError();
  }
  return actorRole;
}

export async function setAllergenOverride(
  productCode: string,
  allergenCode: string,
  action: OverrideAction,
  reason: string,
): Promise<SetAllergenOverrideResult> {
  const input = parseInput(productCode, allergenCode, action, reason);

  return withOrgContext<SetAllergenOverrideResult>(async ({ client, userId, orgId }) => {
    const actorRole = await requireAllergenOverrideWrite({ client, userId, orgId });

    const { rows: productRows } = await client.query<{ product_code: string }>(
      `select product_code
         from public.product
        where org_id = $1::uuid
          and product_code = $2
        limit 1`,
      [orgId, input.productCode],
    );
    if (productRows.length === 0) {
      throw new ValidationError('PRODUCT_NOT_FOUND', 'Product is not visible in the current organization');
    }

    const { rows: currentRows } = await client.query<CurrentOverrideRow>(
      `select id::text
         from public.fa_allergen_overrides
        where org_id = $1::uuid
          and product_code = $2
          and allergen_code = $3
          and superseded_at is null
        order by created_at desc, id desc
        limit 1`,
      [orgId, input.productCode, input.allergenCode],
    );
    const supersedesId = currentRows[0]?.id ?? null;

    const { rows: insertedRows } = await client.query<InsertedOverrideRow>(
      `insert into public.fa_allergen_overrides
         (org_id, product_code, allergen_code, action, reason, actor_user_id, actor_role, supersedes_id)
       values ($1::uuid, $2, $3, $4::public.fa_allergen_override_action, $5, $6::uuid, $7, $8::uuid)
       returning id::text, supersedes_id::text`,
      [
        orgId,
        input.productCode,
        input.allergenCode,
        input.action,
        input.reason,
        userId,
        actorRole,
        supersedesId,
      ],
    );
    const inserted = insertedRows[0];
    if (!inserted) {
      throw new Error('Failed to insert allergen override');
    }
    if (supersedesId) {
      await markOverrideSuperseded(client, supersedesId);
    }

    const { rows: cascadeRows } = await client.query<CascadeRefreshRow>(
      `select allergens, may_contain, changed
         from public.update_fa_allergen_set($1)`,
      [input.productCode],
    );
    const cascade = cascadeRows[0];
    if (!cascade) {
      throw new Error('Failed to refresh allergen cascade');
    }

    return {
      ok: true,
      data: {
        id: inserted.id,
        supersedesId: inserted.supersedes_id,
        cascadeChanged: cascade.changed,
        allergens: cascade.allergens ?? [],
        mayContain: cascade.may_contain ?? [],
      },
    };
  });
}

async function markOverrideSuperseded(client: QueryClient, supersedesId: string): Promise<void> {
  try {
    await client.query(
      `update public.fa_allergen_overrides
          set superseded_at = coalesce(superseded_at, now())
        where id = $1::uuid
          and org_id = app.current_org_id()
          and superseded_at is null`,
      [supersedesId],
    );
  } catch (error) {
    if ((error as { code?: string })?.code !== PG_INSUFFICIENT_PRIVILEGE) {
      throw error;
    }
  }

  const { rows } = await client.query<{ superseded_at: string | Date | null }>(
    `select superseded_at
       from public.fa_allergen_overrides
      where id = $1::uuid
        and org_id = app.current_org_id()`,
    [supersedesId],
  );
  if (!rows[0]?.superseded_at) {
    throw new Error('Failed to supersede prior allergen override');
  }
}
