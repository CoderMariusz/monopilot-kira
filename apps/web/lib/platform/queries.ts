/**
 * Platform super-admin data readers.
 *
 * Every reader here runs on the OWNER pool (getOwnerPool — BYPASSRLS) because a
 * platform admin sits ABOVE tenant RLS: the console must see all organizations,
 * not just the admin's home org. This module lives under lib/platform, so the
 * ESLint owner-pool fence (apps/web/eslint.config.mjs) permits the getOwnerPool
 * import here.
 *
 * SECURITY: each reader FIRST resolves the verified Supabase user and calls
 * assertPlatformAdmin(userId), which throws unless the user is an un-revoked
 * row in app.platform_admins. A non-admin caller can never read cross-org data
 * through these functions — the guard runs before any query. Callers (the
 * console page/layout) additionally gate at the route level, but the guard here
 * is the authoritative, defence-in-depth check.
 *
 * All data is real (public.organizations + counts + last activity + app.
 * platform_audit + public.audit_events). No hardcoded rows. Columns that the
 * schema does not carry (an org "code", a first-class "status") are derived:
 *   - code   → uppercased organizations.slug, trimmed of the "org-" prefix
 *   - status → onboarding_completed_at + recent activity (see deriveStatus)
 */

import { randomUUID } from 'node:crypto';

import { getCachedUser } from '../auth/supabase-server';
import { getOwnerPool } from '../auth/with-org-context';
import { assertPlatformAdmin } from './platform-context';

export type PlatformOrgStatus = 'active' | 'trial' | 'onboarding';

export interface PlatformOrganization {
  id: string;
  /** Derived org short code (uppercased slug). */
  code: string;
  name: string;
  industry: string | null;
  userCount: number;
  siteCount: number;
  /** ISO date (yyyy-mm-dd) or null. */
  createdAt: string | null;
  /** ISO timestamp of the most recent user login in the org, or null. */
  lastActivityAt: string | null;
  status: PlatformOrgStatus;
}

export interface PlatformKpis {
  organizations: number;
  usersAllOrgs: number;
  active: number;
  trialOrOnboarding: number;
}

export type PlatformAuditKind = 'enter' | 'exit' | 'write' | 'admin';

export interface PlatformAuditEntry {
  id: string;
  /** ISO timestamp (UTC). */
  occurredAt: string;
  actorEmail: string | null;
  action: string;
  /** Visual grouping for the coloured chip. */
  kind: PlatformAuditKind;
  /** Target org code, or null when the action is org-less (e.g. admin.add). */
  orgCode: string | null;
  detail: string | null;
}

// ─── Query-client shape (avoids a direct pg type import) ──────────────────────

interface OwnerQueryClient {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

async function requirePlatformAdminReader(): Promise<OwnerQueryClient> {
  const { data, error } = await getCachedUser();
  if (error || !data?.user?.id) {
    throw new Error('platform reader requires a verified user');
  }
  await assertPlatformAdmin(data.user.id);
  return getOwnerPool() as unknown as OwnerQueryClient;
}

// ─── Derivations ──────────────────────────────────────────────────────────────

const ORG_SLUG_PREFIX = /^org[-_]/i;
const NON_ALNUM = /[^a-z0-9]+/gi;

/** Uppercased slug minus the synthetic "org-" prefix; falls back to id head. */
export function deriveOrgCode(slug: string | null | undefined, id: string): string {
  const raw = (slug ?? '').replace(ORG_SLUG_PREFIX, '').replace(NON_ALNUM, '').trim();
  if (raw.length > 0) return raw.toUpperCase().slice(0, 12);
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

interface StatusInput {
  onboardingCompletedAt: string | null;
  userCount: number;
  lastActivityAt: string | null;
}

/**
 * Status is not a first-class column, so derive it sensibly:
 *   - onboarding → onboarding not completed AND no users yet (fresh org shell)
 *   - trial      → onboarding not completed but users exist (kicking the tyres)
 *   - active     → onboarding completed
 * This mirrors the prototype's Active / Trial / Onboarding tri-state.
 */
export function deriveStatus(input: StatusInput): PlatformOrgStatus {
  if (input.onboardingCompletedAt) return 'active';
  if (input.userCount > 0) return 'trial';
  return 'onboarding';
}

function classifyAuditAction(action: string): PlatformAuditKind {
  if (action.includes('act_as.enter') || action.includes('act_as.entered')) return 'enter';
  if (action.includes('act_as.exit') || action.includes('act_as.exited')) return 'exit';
  if (action.startsWith('platform.admin') || action.includes('admin.add')) return 'admin';
  return 'write';
}

// ─── Readers ──────────────────────────────────────────────────────────────────

/**
 * All organizations for the platform console. Each row carries derived code +
 * status, live user/site counts and last-activity (max users.last_login_at).
 */
export async function listOrganizationsForPlatform(): Promise<PlatformOrganization[]> {
  const owner = await requirePlatformAdminReader();

  const { rows } = await owner.query<{
    id: string;
    slug: string | null;
    name: string;
    industry: string | null;
    created_at: string | null;
    onboarding_completed_at: string | null;
    user_count: string | number;
    site_count: string | number;
    last_activity_at: string | null;
  }>(
    `select
        o.id::text                              as id,
        o.slug                                  as slug,
        o.name                                  as name,
        coalesce(nullif(o.industry, ''), o.industry_code) as industry,
        to_char(o.created_at, 'YYYY-MM-DD')     as created_at,
        o.onboarding_completed_at::text         as onboarding_completed_at,
        coalesce(u.user_count, 0)               as user_count,
        coalesce(s.site_count, 0)               as site_count,
        u.last_activity_at::text                as last_activity_at
      from public.organizations o
      left join (
        select org_id, count(*)::int as user_count, max(last_login_at) as last_activity_at
          from public.users
         where deleted_at is null
         group by org_id
      ) u on u.org_id = o.id
      left join (
        select org_id, count(*)::int as site_count
          from public.sites
         where is_active
         group by org_id
      ) s on s.org_id = o.id
      order by o.created_at asc nulls last, o.name asc`,
  );

  return rows.map((r) => {
    const userCount = Number(r.user_count) || 0;
    const siteCount = Number(r.site_count) || 0;
    return {
      id: r.id,
      code: deriveOrgCode(r.slug, r.id),
      name: r.name,
      industry: r.industry ?? null,
      userCount,
      siteCount,
      createdAt: r.created_at,
      lastActivityAt: r.last_activity_at,
      status: deriveStatus({
        onboardingCompletedAt: r.onboarding_completed_at,
        userCount,
        lastActivityAt: r.last_activity_at,
      }),
    };
  });
}

/** Headline KPI tiles for the console (orgs / users-all-orgs / active / trial+onboarding). */
export async function getPlatformKpis(): Promise<PlatformKpis> {
  const orgs = await listOrganizationsForPlatform();
  return {
    organizations: orgs.length,
    usersAllOrgs: orgs.reduce((sum, o) => sum + o.userCount, 0),
    active: orgs.filter((o) => o.status === 'active').length,
    trialOrOnboarding: orgs.filter((o) => o.status !== 'active').length,
  };
}

/**
 * Recent platform audit — the cross-org control trail. Unions the private
 * app.platform_audit rows (act-as enter/exit, admin changes) with the
 * impersonation-attributed public.audit_events written inside an act-as
 * session, so a support "write" made while acting-as also shows here. Actor
 * emails are resolved from public.users.
 *
 * Graceful degradation: app.platform_audit does not exist until migration 410
 * is applied (the orchestrator owns that). If either source table is missing we
 * fall back to whatever IS present rather than throwing — the console renders
 * an empty (or partial) audit card instead of 500ing pre-migration.
 */
export async function listRecentPlatformAudit(limit = 12): Promise<PlatformAuditEntry[]> {
  const owner = await requirePlatformAdminReader();
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 200);

  const platformRows = await readPlatformAuditRows(owner, safeLimit);
  const impersonationRows = await readImpersonationAuditRows(owner, safeLimit);

  const merged = [...platformRows, ...impersonationRows]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0))
    .slice(0, safeLimit);

  return merged;
}

async function readPlatformAuditRows(
  owner: OwnerQueryClient,
  limit: number,
): Promise<PlatformAuditEntry[]> {
  try {
    const { rows } = await owner.query<{
      id: string;
      occurred_at: string;
      actor_email: string | null;
      action: string;
      target_slug: string | null;
      target_id: string | null;
      reason: string | null;
      metadata: unknown;
    }>(
      `select
          pa.id::text                    as id,
          pa.occurred_at::text           as occurred_at,
          actor.email::text              as actor_email,
          pa.action                      as action,
          torg.slug                      as target_slug,
          torg.id::text                  as target_id,
          pa.reason                      as reason,
          pa.metadata                    as metadata
        from app.platform_audit pa
        left join public.users actor on actor.id = pa.actor_user_id
        left join public.organizations torg on torg.id = pa.target_org_id
        order by pa.occurred_at desc
        limit $1`,
      [limit],
    );

    return rows.map((r) => ({
      id: `pa-${r.id}`,
      occurredAt: r.occurred_at,
      actorEmail: r.actor_email,
      action: r.action,
      kind: classifyAuditAction(r.action),
      orgCode: r.target_slug ? deriveOrgCode(r.target_slug, r.target_id ?? '') : null,
      detail: r.reason ?? metadataDetail(r.metadata),
    }));
  } catch {
    // app.platform_audit not present yet (pre-mig-410) → contribute nothing.
    return [];
  }
}

async function readImpersonationAuditRows(
  owner: OwnerQueryClient,
  limit: number,
): Promise<PlatformAuditEntry[]> {
  try {
    const { rows } = await owner.query<{
      id: string;
      occurred_at: string;
      actor_email: string | null;
      action: string;
      org_slug: string | null;
      org_id: string | null;
    }>(
      `select
          ae.id::text              as id,
          ae.occurred_at::text     as occurred_at,
          actor.email::text        as actor_email,
          ae.action                as action,
          org.slug                 as org_slug,
          org.id::text             as org_id
        from public.audit_events ae
        left join public.users actor on actor.id = ae.actor_user_id
        left join public.organizations org on org.id = ae.org_id
        where ae.actor_type = 'impersonation'
        order by ae.occurred_at desc
        limit $1`,
      [limit],
    );

    return rows.map((r) => ({
      id: `ae-${r.id}`,
      occurredAt: r.occurred_at,
      actorEmail: r.actor_email,
      action: r.action,
      kind: classifyAuditAction(r.action),
      orgCode: r.org_slug ? deriveOrgCode(r.org_slug, r.org_id ?? '') : null,
      detail: null,
    }));
  } catch {
    return [];
  }
}

function metadataDetail(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const record = metadata as Record<string, unknown>;
    const requested = record.requested_org_id;
    if (typeof requested === 'string') return `requested org ${requested}`;
  }
  return null;
}

/** Stable request id for callers that need to correlate a platform read. */
export function newPlatformReadId(): string {
  return randomUUID();
}
