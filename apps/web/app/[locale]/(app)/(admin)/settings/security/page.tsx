import { getTranslations } from 'next-intl/server';

import { upsertSecurityPolicy } from '../../../../../../actions/security/upsert-policy';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import SecurityScreen, {
  type AuditLogRow,
  type SecurityScreenData,
  type SecurityScreenLabels,
  type SaveSecuritySettings,
} from './security-screen.client';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';

export const dynamic = 'force-dynamic';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type PageProps = {
  params: Promise<{ locale: string }>;
};

type SecurityScreenReadResult =
  | { state: 'ready'; data: SecurityScreenData; canManageSecurity: boolean }
  | { state: 'permission-denied'; data: SecurityScreenData; canManageSecurity: false }
  | { state: 'error'; data: SecurityScreenData; canManageSecurity: false };

type IdpPolicyRow = {
  provider_type: string | null;
  enforce_for_non_admins: boolean | null;
  mfa_required: boolean | null;
  mfa_required_for_roles: string[] | null;
  mfa_allowed_methods: string[] | null;
  password_complexity: string | null;
  idle_timeout_min: number | string | null;
  session_max_h: number | string | null;
};

type PasswordPolicyRow = {
  password_min_length: number | string | null;
  password_complexity: string | null;
  password_expiry_days: number | string | null;
  password_history_count: number | string | null;
};

type ScimRow = { active_count: string | number };
type AuditRow = {
  id: string;
  occurred_at: string | Date;
  actor_name: string | null;
  action: string;
  ip_address: string | null;
  table_name: string;
};

type PermissionCheckRow = { ok: boolean };

const SECURITY_AUDIT_TABLES = [
  'org_security_policies',
  'org_sso_config',
  'scim_tokens',
] as const;

const SECURITY_VIEW_PERMISSIONS = [
  'settings.security.view',
  'settings.security.manage',
  'settings.security.edit',
  'org.access.admin',
  'owner',
  'admin',
] as const;

function mapComplexity(value: string | null | undefined): SecurityScreenData['passwordPolicy']['complexity'] {
  if (value === 'strong') return 'strong';
  if (value === 'basic') return 'basic';
  return 'medium';
}

function mapPasswordExpiry(value: number | string | null | undefined): SecurityScreenData['passwordPolicy']['expires'] {
  const days = Number(value ?? 0);
  if (days >= 180) return '180';
  if (days >= 90) return '90';
  return 'never';
}

function mapIdleTimeout(value: number | string | null | undefined): SecurityScreenData['sessionPolicy']['idleTimeout'] {
  const normalized = String(value ?? '60');
  if (normalized === '15' || normalized === '30' || normalized === '60') return normalized;
  if (normalized === '240' || normalized === '4h') return '4h';
  if (normalized === 'never' || normalized === '0') return 'never';
  return '60';
}

function mapMaxSession(value: number | string | null | undefined): SecurityScreenData['sessionPolicy']['maximumSessionLength'] {
  const normalized = String(value ?? '8');
  if (normalized === '4' || normalized === '4h') return '4h';
  if (normalized === '12' || normalized === '12h') return '12h';
  if (normalized === '24' || normalized === '24h') return '24h';
  return '8h';
}

function defaultData(labels: SecurityScreenLabels): SecurityScreenData {
  return {
    twoFactor: {
      enforceAdmins: true,
      enforceAllUsers: false,
      allowedMethods: ['totp', 'sms'],
    },
    sso: {
      connected: false,
      providerName: labels.provider,
      providerTenant: labels.notConfigured,
      enforceSso: false,
      metadataConfigured: false,
    },
    scim: { enabled: false },
    passwordPolicy: {
      minimumLength: 12,
      complexity: 'strong',
      expires: 'never',
      blockReuseCount: 5,
    },
    sessionPolicy: {
      idleTimeout: '60',
      maximumSessionLength: '8h',
    },
    auditLog: [],
  };
}

function toAuditRow(row: AuditRow, labels: SecurityScreenLabels): AuditLogRow {
  const occurredAt = row.occurred_at instanceof Date
    ? row.occurred_at.toISOString().slice(0, 16).replace('T', ' ')
    : String(row.occurred_at);
  return {
    id: String(row.id),
    occurredAt,
    actorName: row.actor_name ?? labels.auditSystemActor,
    action: row.action,
    ipAddress: row.ip_address,
    tableName: row.table_name,
  };
}

async function hasAnyPermission(client: QueryClient, userId: string, orgId: string) {
  const { rows } = await client.query<PermissionCheckRow>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = any($3::text[])
          or r.slug = any($3::text[])
          or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
        )
      limit 1`,
    [userId, orgId, SECURITY_VIEW_PERMISSIONS],
  );
  return rows.length > 0;
}

async function readSecurityScreenData(labels: SecurityScreenLabels): Promise<SecurityScreenReadResult> {
  const fallbackData = defaultData(labels);
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canManageSecurity = await hasAnyPermission(queryClient, userId, orgId);
      if (!canManageSecurity) {
        return { state: 'permission-denied' as const, data: fallbackData, canManageSecurity: false as const };
      }

      const [idpResult, scimResult, auditResult] = await Promise.all([
        queryClient.query<IdpPolicyRow>(
          `select cfg.provider_type,
                  cfg.enforce_for_non_admins,
                  cfg.mfa_required,
                  cfg.mfa_required_for_roles,
                  cfg.mfa_allowed_methods,
                  cfg.password_complexity,
                  cfg.idle_timeout_min,
                  cfg.session_max_h
             from public.organizations o
             left join lateral app.get_my_tenant_idp_config(o.tenant_id) cfg on true
            where o.id = $1::uuid
            limit 1`,
          [orgId],
        ),
        queryClient.query<ScimRow>(
          `select count(*)::int as active_count
             from public.scim_tokens
            where org_id = app.current_org_id()
              and revoked_at is null`,
        ),
        queryClient.query<AuditRow>(
          `select al.id::text as id,
                  to_char(al.occurred_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as occurred_at,
                  coalesce(u.name, u.email, initcap(al.actor_type)) as actor_name,
                  al.action,
                  null::text as ip_address,
                  al.resource_type as table_name
             from public.audit_log al
             left join public.users u on u.id = al.actor_user_id
            where al.org_id = app.current_org_id()
              and al.resource_type = any($1::text[])
            order by al.occurred_at desc
            limit 5`,
          [SECURITY_AUDIT_TABLES],
        ),
      ]);

      const idp = idpResult.rows[0];
      const mfaRoles = idp?.mfa_required_for_roles ?? [];
      const allowedMethods = idp?.mfa_allowed_methods?.length ? idp.mfa_allowed_methods : fallbackData.twoFactor.allowedMethods;
      const providerType = idp?.provider_type ?? 'password';
      const connected = providerType === 'saml' || providerType === 'oidc';

      // Real password policy from org_security_policies (min length, complexity,
      // history/reuse count) joined with tenant_idp_config (expiry days). Resilient:
      // if older schemas lack these columns the query degrades to NIST-safe defaults.
      let passwordPolicyRow: PasswordPolicyRow | undefined;
      try {
        const passwordPolicyResult = await queryClient.query<PasswordPolicyRow>(
          `select sp.password_min_length,
                  sp.password_complexity,
                  coalesce(idp.password_expiry_days, 0) as password_expiry_days,
                  sp.password_history_count
             from public.org_security_policies sp
             left join public.organizations o on o.id = sp.org_id
             left join public.tenant_idp_config idp on idp.tenant_id = o.tenant_id
            where sp.org_id = app.current_org_id()
            limit 1`,
        );
        passwordPolicyRow = passwordPolicyResult.rows[0];
      } catch (error) {
        console.error('[settings/security] password_policy_optional_load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
      }

      const minimumLength = Number(passwordPolicyRow?.password_min_length ?? fallbackData.passwordPolicy.minimumLength);
      const blockReuseCount = Number(passwordPolicyRow?.password_history_count ?? fallbackData.passwordPolicy.blockReuseCount);

      return {
        state: 'ready' as const,
        canManageSecurity: true as const,
        data: {
          twoFactor: {
            enforceAdmins: Boolean(idp?.mfa_required) || mfaRoles.includes('org.access.admin') || mfaRoles.includes('org.schema.admin'),
            enforceAllUsers: Boolean(idp?.mfa_required) && mfaRoles.length === 0,
            allowedMethods,
          },
          sso: {
            connected,
            providerName: connected ? labels.providerHint.replace(/\.$/, '') : labels.provider,
            providerTenant: labels.notConfigured,
            enforceSso: Boolean(idp?.enforce_for_non_admins),
            metadataConfigured: connected,
          },
          scim: { enabled: Number(scimResult.rows[0]?.active_count ?? 0) > 0 },
          passwordPolicy: {
            minimumLength: Number.isFinite(minimumLength) ? minimumLength : fallbackData.passwordPolicy.minimumLength,
            complexity: mapComplexity(passwordPolicyRow?.password_complexity ?? idp?.password_complexity),
            expires: mapPasswordExpiry(passwordPolicyRow?.password_expiry_days),
            blockReuseCount: Number.isFinite(blockReuseCount) ? blockReuseCount : fallbackData.passwordPolicy.blockReuseCount,
          },
          sessionPolicy: {
            idleTimeout: mapIdleTimeout(idp?.idle_timeout_min),
            maximumSessionLength: mapMaxSession(idp?.session_max_h),
          },
          auditLog: auditResult.rows.map((row) => toAuditRow(row, labels)),
        },
      };
    });
  } catch {
    return { state: 'error', data: fallbackData, canManageSecurity: false };
  }
}

async function buildLabels(locale: string): Promise<SecurityScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.security_screen' });
  // Disabled-control strings are pending the i18n-table pass
  // (owned by a separate lane). Until those keys land in i18n/*.json this falls
  // back to an English literal so the screen stays functional in all four locales.
  const tx = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    twoFactorTitle: t('two_factor_title'),
    twoFactorSub: t('two_factor_sub'),
    enforceAdmins: t('enforce_admins'),
    enforceAdminsHint: t('enforce_admins_hint'),
    enforceAllUsers: t('enforce_all_users'),
    allowedMethods: t('allowed_methods'),
    methodTotp: t('method_totp'),
    methodSms: t('method_sms'),
    methodWebauthn: t('method_webauthn'),
    webauthnTooltip: t('webauthn_tooltip'),
    passwordPolicyTitle: t('password_policy_title'),
    minimumLength: t('minimum_length'),
    complexity: t('complexity'),
    complexityStrong: t('complexity_strong'),
    complexityMedium: t('complexity_medium'),
    complexityBasic: t('complexity_basic'),
    passwordExpires: t('password_expires'),
    passwordExpiresHint: t('password_expires_hint'),
    expiresNever: t('expires_never'),
    expires90: t('expires_90'),
    expires180: t('expires_180'),
    blockReuse: t('block_reuse'),
    sessionTitle: t('session_title'),
    idleTimeout: t('idle_timeout'),
    idleTimeoutHint: t('idle_timeout_hint'),
    maximumSessionLength: t('maximum_session_length'),
    minutes15: t('minutes_15'),
    minutes30: t('minutes_30'),
    minutes60: t('minutes_60'),
    hours4: t('hours_4'),
    hours8: t('hours_8'),
    hours12: t('hours_12'),
    hours24: t('hours_24'),
    never: t('never'),
    ssoTitle: t('sso_title'),
    connected: t('connected'),
    provider: t('provider'),
    providerHint: t('provider_hint'),
    enforceSso: t('enforce_sso'),
    enforceSsoHint: t('enforce_sso_hint'),
    scimTitle: t('scim_title'),
    scimProvisioning: t('scim_provisioning'),
    notConfigured: t('not_configured'),
    close: t('close'),
    notAvailableYet: tx('not_available_yet', 'Not available yet'),
    auditLogTitle: t('audit_log_title'),
    viewFullLog: t('view_full_log'),
    auditTableLabel: t('audit_table_label'),
    auditWhen: t('audit_when'),
    auditWho: t('audit_who'),
    auditAction: t('audit_action'),
    auditIp: t('audit_ip'),
    auditSystemActor: t('audit_system_actor'),
    save: t('save'),
    saving: t('saving'),
    loadSecurity: t('load_security'),
    loading: t('loading'),
    empty: t('empty'),
    error: t('error'),
    permissionDenied: t('permission_denied'),
  };
}

const saveSecuritySettings: SaveSecuritySettings = async (data) => {
  'use server';

  if (data.sso.enforceSso && !data.sso.metadataConfigured) {
    return {
      ok: false,
      code: 'METADATA_REQUIRED',
      fieldErrors: { enforceSso: 'METADATA_REQUIRED' },
      data: { ...data, sso: { ...data.sso, enforceSso: false } },
    };
  }

  const policyResult = await upsertSecurityPolicy({
    mfa_requirement: data.twoFactor.enforceAllUsers
      ? 'required_all'
      : data.twoFactor.enforceAdmins
        ? 'required_admins'
        : 'optional',
    mfa_allowed_methods: data.twoFactor.allowedMethods,
    password_min_length: data.passwordPolicy.minimumLength,
    password_complexity: data.passwordPolicy.complexity === 'strong' ? 'strong' : 'standard',
  });

  if (!policyResult.ok) {
    return { ok: false, code: 'error' in policyResult ? policyResult.error : 'persistence_failed', data };
  }

  revalidateLocalized('/settings/security');
  return { ok: true, data };
};

export default async function SecurityPage({ params }: PageProps) {
  const { locale } = await params;
  const labels = await buildLabels(locale);
  const result = await readSecurityScreenData(labels);

  return (
    <SecurityScreen
      data={result.data}
      labels={labels}
      state={result.state === 'permission-denied' ? 'ready' : result.state}
      canManageSecurity={result.canManageSecurity}
      saveSecuritySettings={saveSecuritySettings}
      auditLogHref="/settings/audit"
    />
  );
}
