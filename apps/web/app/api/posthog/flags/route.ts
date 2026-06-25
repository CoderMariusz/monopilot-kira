/**
 * T-110 — read-through PostHog feature flags proxy.
 *
 * Server-only Route Handler: the PostHog project API key is read only from
 * process.env in this file and is never exposed to client modules.
 */

import 'server-only';

import { withOrgContext, type OrgContext } from '../../../../lib/auth/with-org-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const POSTHOG_TIMEOUT_MS = 5_000;
const DEFAULT_POSTHOG_HOST = 'https://app.posthog.com';

type FlagsPayload = {
  flags: Record<string, unknown>;
  fetched_at: string;
};

type CacheEntry = {
  payload: FlagsPayload;
  cachedAtMs: number;
};

type PostHogDecideResponse = {
  featureFlags?: unknown;
};

const cache = new Map<string, CacheEntry>();

export async function GET(_request: Request): Promise<Response> {
  let enteredOrgContext = false;

  try {
    return await withOrgContext(async (ctx) => {
      enteredOrgContext = true;
      return handleAuthenticatedFlagsRequest(ctx);
    });
  } catch {
    if (!enteredOrgContext) {
      return json({ error_code: 'UNAUTHENTICATED' }, 401);
    }
    return json({ error_code: 'POSTHOG_UPSTREAM_ERROR' }, 502);
  }
}

async function handleAuthenticatedFlagsRequest(ctx: OrgContext): Promise<Response> {
  const nowMs = Date.now();
  const cached = readCache(ctx.orgId, nowMs);
  if (cached) {
    return json(cached, 200);
  }

  const fetchedAt = new Date(nowMs).toISOString();
  const upstream = await fetchPostHogFlags(ctx.orgId);
  if (upstream.ok === false) {
    await writeUpstreamErrorAudit(ctx, upstream.status, upstream.reason);
    return json({ error_code: 'POSTHOG_UPSTREAM_ERROR' }, 502);
  }

  const payload: FlagsPayload = { flags: upstream.flags, fetched_at: fetchedAt };
  writeCache(ctx.orgId, payload, nowMs);
  return json(payload, 200);
}

function readCache(orgId: string, nowMs: number): FlagsPayload | null {
  const entry = cache.get(orgId);
  if (!entry) return null;
  if (nowMs - entry.cachedAtMs >= CACHE_TTL_MS) {
    cache.delete(orgId);
    return null;
  }

  cache.delete(orgId);
  cache.set(orgId, entry);
  return entry.payload;
}

function writeCache(orgId: string, payload: FlagsPayload, nowMs: number): void {
  cache.delete(orgId);
  cache.set(orgId, { payload, cachedAtMs: nowMs });

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    cache.delete(oldestKey);
  }
}

async function fetchPostHogFlags(
  orgId: string,
): Promise<
  | { ok: true; flags: Record<string, unknown> }
  | { ok: false; status: number | null; reason: string }
> {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  if (!apiKey) {
    return { ok: false, status: null, reason: 'missing_project_api_key' };
  }

  const host = (process.env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST).replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POSTHOG_TIMEOUT_MS);

  try {
    const response = await fetch(`${host}/decide/?v=3`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        distinct_id: orgId,
        groups: { organization: orgId },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, status: response.status, reason: `posthog_${response.status}` };
    }

    const body = (await response.json()) as PostHogDecideResponse;
    return { ok: true, flags: normalizeFlags(body.featureFlags) };
  } catch (error) {
    return {
      ok: false,
      status: null,
      reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'fetch_failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFlags(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

async function writeUpstreamErrorAudit(
  { client, orgId, userId }: OrgContext,
  upstreamStatus: number | null,
  reason: string,
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', 'settings.posthog_flags.upstream_error', 'posthog_flags', $1::uuid, '{}'::jsonb, $3::jsonb, 'security')`,
    [
      orgId,
      userId,
      JSON.stringify({
        provider: 'posthog',
        upstream_status: upstreamStatus,
        reason,
      }),
    ],
  );
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
