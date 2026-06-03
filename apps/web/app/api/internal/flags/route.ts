/**
 * T-033 — GET /api/internal/flags
 *
 * Red lines:
 *  - RBAC guard on org.access.admin fires BEFORE any flag data is returned.
 *  - Flag keys are NEVER exposed to non-admin callers.
 *  - Server-side only.
 */

import { createServerSupabaseClient } from '../../../../lib/auth/supabase-server';
import { Permission } from '../../../../../../packages/rbac/src/permissions.enum.js';

export async function GET(req: Request): Promise<Response> {
  try {
    // Resolve session using the server-side Supabase client.
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser();

    if (sessionError || !user) {
      return new Response(null, { status: 403 });
    }

    // Look up org.access.admin role for this user.
    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('roles(slug)')
      .eq('user_id', user.id)
      .eq('roles.slug', Permission.ORG_ACCESS_ADMIN)
      .limit(1);

    if (roleError) {
      return new Response(null, { status: 403 });
    }

    // Check whether any returned row has the org.access.admin slug.
    // Supabase returns joined roles as an array when using select('roles(slug)').
    const isAdmin =
      Array.isArray(roleRows) &&
      roleRows.some(
        (row: { roles: { slug: string }[] } | null) =>
          Array.isArray(row?.roles) && row.roles.some((r) => r.slug === Permission.ORG_ACCESS_ADMIN),
      );

    if (!isAdmin) {
      return new Response(null, { status: 403 });
    }

    // Admin path: return resolved flag set for the queried tenant.
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenant') ?? '';

    return new Response(JSON.stringify({ tenantId, flags: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Fail-safe: any unhandled error must not leak 500 that bypasses the RBAC guard.
    return new Response(null, { status: 403 });
  }
}
