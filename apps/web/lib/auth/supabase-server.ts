/**
 * Server-side Supabase client factory.
 *
 * Uses @supabase/ssr createServerClient which reads/writes cookies via
 * Next.js `cookies()` from `next/headers`.
 *
 * SECURITY NOTE: Access token TTL is 15 minutes (900s). Production deployment
 * MUST configure GoTrue JWT_EXP=900 in the Supabase project settings.
 * This cannot be enforced at the client level — it is a server-side Supabase
 * project configuration that must be applied before go-live.
 */

import { createServerClient } from '@supabase/ssr';

/**
 * Create a server-side Supabase client that reads cookies from the Next.js
 * request/response cycle.  When called without arguments the cookies are read
 * from the Next.js `next/headers` cookie store (App Router server components
 * and Server Actions).
 *
 * The client uses the public anon key (safe for server components — the anon
 * key is subject to RLS). For service-role operations (e.g. registering
 * session_org_contexts) use a separate service-role client.
 */
// MUST be async per Next 16 cookies() API — cookies() returns Promise<ReadonlyRequestCookies>
// in Next 16+. Calling it synchronously and using the result as a cookie store would call
// .getAll() on a Promise, which throws at runtime in production.
export async function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  // In test environments (no Next.js runtime), `cookies()` is unavailable.
  // We provide a no-op cookie adapter so the factory can be used in unit tests
  // where the cookie jar is irrelevant (tests mock the auth methods directly).
  let cookieAdapter: {
    getAll: () => { name: string; value: string }[];
    setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) => void;
  };

  try {
    // Dynamic require to avoid build-time errors in non-Next.js environments
    // (e.g. Vitest running in Node without a Next.js server context).

    const { cookies } = require('next/headers') as {
      cookies: () => Promise<{
        getAll: () => { name: string; value: string }[];
        set: (name: string, value: string, options?: Record<string, unknown>) => void;
      }>;
    };
    // MUST be awaited — Next 16 cookies() is async. Synchronous use would return a
    // Promise object, causing .getAll() to throw "not a function" at runtime.
    const cookieStore = await cookies();
    cookieAdapter = {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll may throw in Server Components where cookies are read-only.
          // This is expected — ignore the error.
        }
      },
    };
  } catch {
    // Not in a Next.js server context (e.g. unit test) — use no-op adapter.
    cookieAdapter = {
      getAll() { return []; },
      setAll() { /* no-op */ },
    };
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: cookieAdapter,
  });
}
