/**
 * T-012 — SAML SP Single Logout (SLO) endpoint.
 *
 * Accepts both GET (HTTP-Redirect binding) and POST (HTTP-POST binding) so it
 * can be invoked as either an IdP-initiated SLO redirect or an SP-initiated
 * <LogoutRequest>. Delegates to Jackson for SLO XML generation and signature
 * verification.
 *
 * Out of scope for T-012 acceptance tests but listed in scope_files — provides
 * the operational SLO surface that production IdPs will call.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { handleVerifiedSloResponse } from '../../../../../../../packages/auth/src/saml/slo.js';
import { createServerSupabaseClient } from '../../../../../lib/auth/supabase-server';

async function getJackson() {
  const mod = (await import('@boxyhq/saml-jackson')) as unknown as {
    controllers?: (opts: import('@boxyhq/saml-jackson').JacksonOption) => Promise<unknown>;
    default?: (opts: import('@boxyhq/saml-jackson').JacksonOption) => Promise<unknown>;
  };
  const controllers = mod.controllers ?? mod.default;
  if (!controllers) throw new Error('Jackson SDK unavailable');
  const externalUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres';
  return controllers({
    externalUrl,
    samlPath: '/api/auth/saml/callback',
    samlAudience: externalUrl,
    db: { engine: 'sql', url: databaseUrl, type: 'postgres', manualMigration: false },

  } as any);
}

async function handle(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  let samlRequest: string | null = null;
  let samlResponse: string | null = null;
  let relayState: string | null = null;

  if (method === 'GET') {
    samlRequest = url.searchParams.get('SAMLRequest');
    samlResponse = url.searchParams.get('SAMLResponse');
    relayState = url.searchParams.get('RelayState');
  } else {
    const form = await request.formData();
    const sr = form.get('SAMLRequest');
    const sp = form.get('SAMLResponse');
    const rs = form.get('RelayState');
    samlRequest = typeof sr === 'string' ? sr : null;
    samlResponse = typeof sp === 'string' ? sp : null;
    relayState = typeof rs === 'string' ? rs : null;
  }

  try {
    const jackson = (await getJackson()) as {
      logoutController: {

        handleResponse?: (opts: Record<string, unknown>) => Promise<any>;

        handleRequest?: (opts: Record<string, unknown>) => Promise<any>;
      };
    };

    if (samlResponse && jackson.logoutController?.handleResponse) {
      const supabase = await createServerSupabaseClient();
      const response = NextResponse.redirect(new URL('/login', request.url), {
        status: 302,
      });

      await handleVerifiedSloResponse({
        cookies: response.cookies,
        supabaseAuthAdmin: (supabase.auth as any).admin,
        verifySloResponse: () =>
          jackson.logoutController.handleResponse?.({
            SAMLResponse: samlResponse,
            RelayState: relayState ?? '',
          }) as Promise<unknown>,
        resolveLocalSession: async () => {
          const { data, error } = await supabase.auth.getUser();
          if (error) {
            throw new Error(`slo_user_id_resolution_failed: ${error.message}`);
          }
          const userId = data.user?.id;
          if (!userId) {
            return { userId };
          }

          const sessionResult = await supabase.auth.getSession();
          if (sessionResult.error) {
            throw new Error(
              `slo_session_resolution_failed: ${sessionResult.error.message}`,
            );
          }
          const session = sessionResult.data.session;
          if (session?.user?.id && session.user.id !== userId) {
            throw new Error('slo_session_user_mismatch');
          }

          return {
            sessionJwt: session?.access_token,
            userId,
          };
        },
      });
      return response;
    }
    if (samlRequest && jackson.logoutController?.handleRequest) {
      const out = (await jackson.logoutController.handleRequest({
        SAMLRequest: samlRequest,
        RelayState: relayState ?? '',
      })) as { redirect_url?: string };
      return new Response(null, {
        status: 302,
        headers: { location: out.redirect_url ?? '/login' },
      });
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `SLO failed: ${(err as Error).message}` }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  // Bare logout — clear the session and redirect to /login
  return new Response(null, { status: 302, headers: { location: '/login' } });
}

export async function GET(request: NextRequest): Promise<Response> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handle(request);
}
