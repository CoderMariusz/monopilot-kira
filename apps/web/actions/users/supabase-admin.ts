/**
 * Service-role Supabase admin client factory — shared by the privileged user
 * actions (create-with-password, invite link generation). Lives OUTSIDE any
 * 'use server' module so it can be a plain export.
 *
 * Reads the service-role key from the server-only env var and disables session
 * persistence/refresh (one-shot privileged calls, not a user session). Throws
 * when the env is absent so callers surface `service_unavailable` instead of
 * silently degrading to the anon key (which makes `auth.admin.*` fail closed
 * in a confusing way — the wave-F4 live invite 403 `not_admin` class).
 */
export async function createSupabaseAuthAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('privileged user actions require Supabase service-role env (SUPABASE_SERVICE_ROLE_KEY)');
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Symmetric with deactivateUser's `ban_duration: '876000h'` — lifts the auth ban. */
export async function liftAuthBan(
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const supabase = await createSupabaseAuthAdmin();
    const { error } = await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
    if (error) {
      console.error('[liftAuthBan] auth unban failed (public.users may already be active)', {
        targetUserId,
        message: error.message,
      });
      return { ok: false, error };
    }
    return { ok: true };
  } catch (error) {
    console.error('[liftAuthBan] auth unban failed (public.users may already be active)', {
      targetUserId,
      error,
    });
    return { ok: false, error };
  }
}
