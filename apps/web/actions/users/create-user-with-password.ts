'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { isStrongPassword } from './password-policy';

/**
 * createUserWithPassword — admin-only "create a user directly with a password,
 * without sending an invite email".
 *
 * This is an ADDITIONAL admin option that lives alongside (and never weakens)
 * the email-invite path in `invite.ts`. Where `inviteUser` mints a Supabase
 * invite magic-link and provisions an INACTIVE `public.users` row carrying an
 * `invite_token`, this action:
 *
 *   1. Verifies the caller holds the SAME admin gate the invite path uses
 *      (`settings.users.invite`) in the caller's current org.
 *   2. Creates the auth user server-side with the SERVICE-ROLE admin client via
 *      `supabase.auth.admin.createUser({ email, password, email_confirm: true })`
 *      — `email_confirm: true` confirms the address WITHOUT sending any email.
 *   3. Provisions the matching ACTIVE `public.users` row (is_active = true, no
 *      invite_token) plus the `public.user_roles` junction row, org-scoped and
 *      RLS-safe, mirroring the invite + assign-role provisioning.
 *
 * SECURITY (critical):
 *   - The service-role key is read ONLY here, server-side; it is never exposed
 *     to the client. The action is a `'use server'` module.
 *   - The admin gate is checked INSIDE the org-context transaction BEFORE any
 *     auth user is created. A non-admin caller never reaches `createUser`.
 *   - The new user is scoped to the CALLER's org (resolved by withOrgContext),
 *     never an org supplied by the client.
 *   - If a Supabase auth user is created but DB provisioning fails, the orphan
 *     auth user is best-effort deleted so a half-provisioned identity cannot
 *     log in with no org row (withOrgContext would then reject it anyway).
 */

const CREATE_PERMISSION = 'settings.users.invite';
const SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT = new Set([
  'owner',
  'admin',
  'org_admin',
  'org.access.admin',
  'org.platform.admin',
  'org.schema.admin',
]);
const SUPER_ROLE_CODES = ['owner', 'admin', 'org_admin'] as const;

export type CreateUserWithPasswordInput = {
  email: string;
  password: string;
  name?: string;
  roleId?: string;
  language?: string;
};

export type CreateUserWithPasswordResult =
  | { ok: true; data: { email: string; userId: string } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'weak_password'
        | 'forbidden'
        | 'forbidden_role' // role is in SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT — valid UUID but not self-serveable
        | 'seat_limit_exceeded'
        | 'email_taken'
        | 'service_unavailable'
        | 'create_failed'
        | 'persistence_failed';
    };

type OrganizationSeatRow = { seat_limit: number | null };

type RoleRow = {
  id: string;
  org_id: string;
  code: string;
  is_system: boolean;
  display_order: number | null;
};

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Service-role Supabase admin client. Mirrors the canonical factory used by
 * `actions/onboarding/complete-onboarding.ts`. Reads the service-role key from
 * the server-only env var and disables session persistence/refresh (this is a
 * one-shot privileged call, not a user session).
 *
 * Throws when the service-role env is absent so the caller can surface
 * `service_unavailable` instead of silently degrading to the anon key (which
 * would make `auth.admin.createUser` fail closed in a confusing way).
 */
async function createSupabaseAuthAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('createUserWithPassword requires Supabase service-role env (SUPABASE_SERVICE_ROLE_KEY)');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function hasSuperRole(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (r.code = any($3::text[]) or r.slug = any($3::text[]))
      limit 1`,
    [userId, orgId, SUPER_ROLE_CODES],
  );
  return rows[0]?.ok === true;
}

async function readCallerPermissions(client: QueryClient, userId: string, orgId: string): Promise<Set<string>> {
  const { rows } = await client.query<{ permission: string }>(
    `select distinct permission
       from (
         select rp.permission
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           join public.role_permissions rp on rp.role_id = r.id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
         union
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
       ) grants
      where permission is not null`,
    [userId, orgId],
  );
  return new Set(rows.map((row) => row.permission));
}

async function readRolePermissions(client: QueryClient, roleId: string): Promise<string[]> {
  const { rows } = await client.query<{ permission: string }>(
    `select distinct permission
       from (
         select rp.permission
           from public.role_permissions rp
           join public.roles r on r.id = rp.role_id
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
         union
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           from public.roles r
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
       ) grants
      where permission is not null
      order by permission`,
    [roleId],
  );
  return rows.map((row) => row.permission);
}

export async function createUserWithPassword(
  input: CreateUserWithPasswordInput,
): Promise<CreateUserWithPasswordResult> {
  const email = normalizeEmail(input?.email);
  if (!email) {
    return { ok: false, error: 'invalid_input' };
  }

  const requestedRoleId = normalizeString(input?.roleId);
  if (!requestedRoleId) {
    return { ok: false, error: 'invalid_input' };
  }

  if (!isStrongPassword(input?.password)) {
    return { ok: false, error: 'weak_password' };
  }
  const password = input.password;

  const name = normalizeString(input?.name) ?? email;
  const language = normalizeString(input?.language) ?? 'pl';

  return withOrgContext(async ({ userId, orgId, client }) => {
    // ── Admin gate (same permission the invite path uses), checked BEFORE any
    //    auth user is created. Fail-closed: an explicit grant of
    //    settings.users.invite via role_permissions, role code/slug, or the
    //    role's jsonb permissions array. ───────────────────────────────────
    const { rows: permRows } = await client.query<{ ok: boolean }>(
      `select true as ok
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
         left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
        where ur.user_id = $1::uuid
          and ur.org_id = $2::uuid
          and (
            rp.permission is not null
            or r.code = $3
            or r.slug = $3
            or coalesce(r.permissions, '[]'::jsonb) ? $3
          )
        limit 1`,
      [userId, orgId, CREATE_PERMISSION],
    );
    if (permRows.length === 0) {
      return { ok: false, error: 'forbidden' };
    }

    // ── Resolve + validate the requested role belongs to the caller's org and
    //    is not a privileged system role that must not be self-served. ──────
    const { rows: roleRows } = await client.query<RoleRow>(
      `select id, org_id, code, is_system, display_order
         from public.roles
        where id = $1::uuid`,
      [requestedRoleId],
    );
    const role = roleRows[0];
    if (!role || role.org_id !== orgId) {
      return { ok: false, error: 'invalid_input' };
    }
    if (SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT.has(role.code)) {
      // Dedicated code so the UI can surface "this role cannot be self-served"
      // rather than the opaque invalid_input that gives no field-level guidance.
      return { ok: false, error: 'forbidden_role' };
    }
    const roleId = role.id;

    // Match the role editor's grantable-subset rule: super roles may assign any
    // non-system business role; other assigners may only assign roles whose
    // permissions are all already present in their own grant set.
    if (!(await hasSuperRole(client, userId, orgId))) {
      const [callerPermissions, targetPermissions] = await Promise.all([
        readCallerPermissions(client, userId, orgId),
        readRolePermissions(client, roleId),
      ]);
      if (targetPermissions.some((permission) => !callerPermissions.has(permission))) {
        return { ok: false, error: 'forbidden_role' };
      }
    }

    // ── Reject duplicate email within the org before touching Supabase Auth. ─
    const { rows: existingRows } = await client.query<{ id: string }>(
      `select id from public.users where org_id = $1::uuid and email = $2::citext limit 1`,
      [orgId, email],
    );
    if (existingRows.length > 0) {
      return { ok: false, error: 'email_taken' };
    }

    // ── Seat-limit pre-flight (mirror invite path): count active users. The
    //    new user is created ACTIVE, so it consumes a seat immediately. ──────
    const { rows: seatRows } = await client.query<OrganizationSeatRow>(
      `select seat_limit from public.organizations where id = $1::uuid`,
      [orgId],
    );
    const seatLimit = seatRows[0]?.seat_limit ?? null;
    const { rows: countRows } = await client.query<{ active_user_count: string | number }>(
      `select count(*) as active_user_count
         from public.users
        where org_id = $1::uuid
          and is_active = true`,
      [orgId],
    );
    const activeUserCount = Number(countRows[0]?.active_user_count ?? 0);
    if (seatLimit !== null && activeUserCount >= seatLimit) {
      return { ok: false, error: 'seat_limit_exceeded' };
    }

    // ── Create the auth user WITHOUT an invite email. email_confirm: true
    //    confirms the address so the account is usable immediately and no
    //    confirmation mail is dispatched. ────────────────────────────────────
    let supabase: Awaited<ReturnType<typeof createSupabaseAuthAdmin>>;
    try {
      supabase = await createSupabaseAuthAdmin();
    } catch {
      return { ok: false, error: 'service_unavailable' };
    }

    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { org_id: orgId, created_by: userId, name },
    });
    if (created.error || !created.data?.user?.id) {
      const message = created.error?.message?.toLowerCase() ?? '';
      if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
        return { ok: false, error: 'email_taken' };
      }
      return { ok: false, error: 'create_failed' };
    }
    const authUserId = created.data.user.id;

    try {
      const inserted = await client.query<{ id: string }>(
        `insert into public.users
           (org_id, email, name, role_id, language, is_active, invite_token, invite_token_expires_at, updated_at)
         values ($1::uuid, $2::citext, $3, $4::uuid, $5, true, null, null, now())
         returning id`,
        [orgId, email, name, roleId, language],
      );
      const newUserId = inserted.rows[0]?.id;
      if (!newUserId) {
        throw new Error('public.users insert returned no id');
      }

      await client.query(
        `insert into public.user_roles (user_id, role_id, org_id)
         values ($1::uuid, $2::uuid, $3::uuid)
         on conflict (user_id, role_id) do update set org_id = excluded.org_id`,
        [newUserId, roleId, orgId],
      );

      await client.query(
        `insert into public.audit_log
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
         values ($1::uuid, $2::uuid, 'user', $3, 'org_security_policies', $4, null, $5::jsonb, 'security')`,
        [
          orgId,
          userId,
          'settings.user.created_with_password',
          newUserId,
          JSON.stringify({
            org_id: orgId,
            email,
            role_id: roleId,
            created_by: userId,
            auth_user_id: authUserId,
            email_confirmed: true,
            invite_email_sent: false,
          }),
        ],
      );

      await client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'user', $3::uuid, $4::jsonb, 'settings-create-user-with-password-v1')`,
        [
          orgId,
          'settings.user.created_with_password',
          newUserId,
          JSON.stringify({
            org_id: orgId,
            email,
            created_by: userId,
            auth_user_id: authUserId,
            invite_email_sent: false,
          }),
        ],
      );

      return { ok: true, data: { email, userId: newUserId } };
    } catch {
      // DB provisioning failed AFTER the auth user was created. Best-effort
      // delete the orphan so a half-provisioned identity can't authenticate
      // against an org with no public.users row.
      try {
        await supabase.auth.admin.deleteUser(authUserId);
      } catch {
        /* noop — orphan cleanup is best-effort */
      }
      return { ok: false, error: 'persistence_failed' };
    }
  });
}
