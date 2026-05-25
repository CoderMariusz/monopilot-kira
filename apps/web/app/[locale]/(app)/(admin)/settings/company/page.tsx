import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import CompanyProfileScreen, {
  type CompanyProfile,
  type CompanyProfileScreenLabels,
  type SaveCompanyProfileInput,
  type SaveCompanyProfileResult,
} from './company-profile-screen.client';

export const dynamic = 'force-dynamic';

const UPDATE_PERMISSION = 'settings.org.update';
const OUTBOX_EVENT_TYPE = 'settings.org.updated';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type PageProps = {
  params?: Promise<{ locale: string }>;
};

type OrganizationRow = {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string | null;
  locale: string | null;
  currency: string | null;
  gs1_prefix: string | null;
  region: string | null;
  tier: string | null;
  seat_limit: number | null;
};

type ReadCompanyProfileResult =
  | { state: 'ready'; organization: CompanyProfile; canEdit: boolean }
  | { state: 'empty'; canEdit: boolean }
  | { state: 'error'; canEdit: false };

const serverFallbackOrganization: CompanyProfile = {
  id: 'org-current',
  tradingName: '',
  legalName: '',
  logoInitials: 'ORG',
  vat: '',
  regon: '',
  industry: 'Meat processing',
  street: '',
  city: '',
  zip: '',
  country: 'Poland',
  email: '',
  phone: '',
  website: '',
  currency: 'EUR',
  timezone: 'Europe/Warsaw',
  dateFormat: 'YYYY-MM-DD',
  region: 'eu-central',
};

function logoInitials(name: string) {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join('') || 'ORG').toUpperCase();
}

function toCompanyProfile(row: OrganizationRow, draft?: SaveCompanyProfileInput): CompanyProfile {
  return {
    ...serverFallbackOrganization,
    ...draft,
    id: row.id,
    tradingName: row.name,
    logoInitials: logoInitials(row.name),
    currency: row.currency ?? draft?.currency ?? serverFallbackOrganization.currency,
    timezone: row.timezone ?? draft?.timezone ?? serverFallbackOrganization.timezone,
    region: row.region ?? serverFallbackOrganization.region,
  };
}

async function hasOrgUpdatePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, UPDATE_PERMISSION],
  );
  return rows.length > 0;
}

async function readCompanyProfile(): Promise<ReadCompanyProfileResult> {
  try {
    return await withOrgContext<ReadCompanyProfileResult>(async (ctx): Promise<ReadCompanyProfileResult> => {
      const context = ctx as OrgContextLike;
      const canEdit = await hasOrgUpdatePermission(context);
      const { rows } = await context.client.query<OrganizationRow>(
        `select id, name, logo_url, timezone, locale, currency, gs1_prefix, region, tier, seat_limit
           from public.organizations
          where id = $1::uuid
          limit 1`,
        [context.orgId],
      );
      const row = rows[0];
      if (!row) return { state: 'empty', canEdit };
      return { state: 'ready', organization: toCompanyProfile(row), canEdit };
    });
  } catch (error) {
    console.error('[settings/company] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { state: 'error', canEdit: false };
  }
}

export async function saveCompanyProfile(input: SaveCompanyProfileInput): Promise<SaveCompanyProfileResult> {
  'use server';

  try {
    return await withOrgContext<SaveCompanyProfileResult>(async (ctx): Promise<SaveCompanyProfileResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasOrgUpdatePermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      const { rows } = await context.client.query<OrganizationRow>(
        `update public.organizations
            set name = $2,
                timezone = $3,
                currency = $4,
                updated_at = now()
          where id = $1::uuid
          returning id, name, logo_url, timezone, locale, currency, gs1_prefix, region, tier, seat_limit`,
        [context.orgId, input.tradingName, input.timezone, input.currency],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      await context.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, $2, 'organization', $1::uuid, $3::jsonb, 'settings-company-profile-v1')`,
        [
          context.orgId,
          OUTBOX_EVENT_TYPE,
          JSON.stringify({
            org_id: context.orgId,
            actor_user_id: context.userId,
            changed: { name: input.tradingName, timezone: input.timezone, currency: input.currency },
          }),
        ],
      );

      return { ok: true, organization: toCompanyProfile(row, input), outboxEventType: OUTBOX_EVENT_TYPE };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

async function buildLabels(locale: string): Promise<CompanyProfileScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.company_profile' });
  return {
    title: t('title'),
    subtitle: t('subtitle'),
    loading: t('loading'),
    empty: t('empty'),
    loadError: t('load_error'),
    saveError: t('save_error'),
    readOnlyLabel: t('read_only_label'),
    readOnlyNotice: t('read_only_notice'),
    sections: {
      identity: t('section_identity'),
      registeredAddress: t('section_registered_address'),
      contact: t('section_contact'),
      locale: t('section_locale'),
    },
    fields: {
      tradingName: t('field_trading_name'),
      legalName: t('field_legal_name'),
      logo: t('field_logo'),
      vat: t('field_vat'),
      regon: t('field_regon'),
      industry: t('field_industry'),
      street: t('field_street'),
      cityZip: t('field_city_zip'),
      city: t('field_city'),
      zip: t('field_zip'),
      country: t('field_country'),
      email: t('field_email'),
      phone: t('field_phone'),
      website: t('field_website'),
      defaultCurrency: t('field_default_currency'),
      timezone: t('field_timezone'),
      dateFormat: t('field_date_format'),
      region: t('field_region'),
    },
    hints: {
      upload: t('hint_upload'),
      region: t('region_tooltip'),
    },
    actions: {
      uploadNew: t('action_upload_new'),
      cancel: t('action_cancel'),
      saveChanges: t('action_save_changes'),
    },
  };
}

export default async function CompanyProfilePage({ params }: PageProps = {}) {
  const { locale } = (await params) ?? { locale: 'en' };
  const [labels, result] = await Promise.all([buildLabels(locale), readCompanyProfile()]);

  if (result.state === 'ready') {
    return (
      <CompanyProfileScreen
        organization={result.organization}
        canEdit={result.canEdit}
        labels={labels}
        saveCompanyProfile={saveCompanyProfile}
      />
    );
  }

  return <CompanyProfileScreen state={result.state} canEdit={result.canEdit} labels={labels} />;
}
