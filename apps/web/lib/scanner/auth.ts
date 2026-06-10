import { setPin, verifyPin } from '../../../../packages/auth/src/verify-pin.js';

import type { QueryClient } from './db';

export type ScannerUser = {
  id: string;
  org_id: string;
  email: string;
  name: string | null;
};

export { setPin, verifyPin };

export async function findUserByEmail(client: QueryClient, email: string): Promise<ScannerUser | null> {
  const { rows } = await client.query<ScannerUser>(
    `select id, org_id, email::text as email, name
       from public.users
      where email = $1::citext
        and is_active = true
      limit 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function userHasPin(client: QueryClient, userId: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok from public.user_pins where user_id = $1::uuid limit 1`,
    [userId],
  );
  return rows.length > 0;
}

export async function verifySupabaseLoginPassword(email: string, password: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return false;

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
