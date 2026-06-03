export type SloCookieStore = {
  set: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      maxAge: number;
      path: string;
      sameSite: 'lax';
      secure: boolean;
    },
  ) => void;
};

export type SupabaseAuthAdmin = {
  signOut: (sessionJwt: string) => Promise<{ error?: { message?: string } | null } | void>;
};

export type SloLocalSession = {
  sessionJwt?: string | null;
  userId: string | null | undefined;
};

const SESSION_COOKIES = ['sb-access', 'sb-refresh'] as const;

export async function revokeLocalSession(
  userId: string | null | undefined,
  cookies: SloCookieStore,
  supabaseAuthAdmin: SupabaseAuthAdmin,
  opts: { sessionJwt?: string | null } = {},
): Promise<void> {
  if (!userId) {
    throw new Error('slo_user_id_required');
  }
  if (!opts.sessionJwt) {
    throw new Error('slo_session_jwt_required');
  }

  const result = await supabaseAuthAdmin.signOut(opts.sessionJwt);
  if (result && 'error' in result && result.error) {
    throw new Error(
      `slo_supabase_sign_out_failed: ${result.error.message ?? 'unknown error'}`,
    );
  }

  for (const name of SESSION_COOKIES) {
    cookies.set(name, '', {
      httpOnly: true,
      maxAge: 0,
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  }
}

export async function handleVerifiedSloResponse<TVerified>(opts: {
  cookies: SloCookieStore;
  resolveLocalSession: (verified: TVerified) => Promise<SloLocalSession> | SloLocalSession;
  supabaseAuthAdmin: SupabaseAuthAdmin;
  verifySloResponse: () => Promise<TVerified>;
}): Promise<TVerified> {
  const verified = await opts.verifySloResponse();
  const session = await opts.resolveLocalSession(verified);
  await revokeLocalSession(session.userId, opts.cookies, opts.supabaseAuthAdmin, {
    sessionJwt: session.sessionJwt,
  });
  return verified;
}
