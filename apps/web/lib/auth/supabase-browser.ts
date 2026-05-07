/**
 * Browser-side Supabase client factory.
 *
 * Uses @supabase/ssr createBrowserClient which manages session persistence
 * via browser cookies automatically. Safe to call on the client side.
 *
 * The browser client uses the public anon key — it is subject to RLS and
 * the org context enforced by app.set_org_context. Never use the service-role
 * key on the client.
 */

import { createBrowserClient } from '@supabase/ssr';

let _client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Returns a singleton browser-side Supabase client.
 * Singleton avoids multiple GoTrue instances which can cause token refresh races.
 */
export function createBrowserSupabaseClient() {
  if (_client) return _client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  _client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return _client;
}
