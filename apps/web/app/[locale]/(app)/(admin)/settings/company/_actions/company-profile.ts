'use server';

/**
 * SET-010 — Company profile data layer (read + save Server Action).
 *
 * Extracted from page.tsx so the action is importable by node-environment
 * Vitest (the page module contains JSX the node transform can't parse) and so
 * the read/write share one canonical column list + row→profile mapper.
 *
 * Writes go through withOrgContext (RLS via app.current_org_id()) with runtime
 * zod validation, persist EVERY editable field to public.organizations
 * (migration 168 added legal_name/vat/regon/industry/address/contact columns),
 * emit the settings.org.updated outbox event, and revalidate the page.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type {
  CompanyProfile,
  SaveCompanyProfileInput,
  SaveCompanyProfileResult,
} from '../company-profile-screen.client';

const UPDATE_PERMISSION = 'settings.org.update';
const OUTBOX_EVENT_TYPE = 'settings.org.updated';
// Public URL path (route groups + [locale] are stripped from the served path),
// matching the sibling settings actions (e.g. /settings/units, /settings/quality).
const COMPANY_ROUTE = '/settings/company';

// revalidatePath must run inside a Next request/render store. The client also
// calls router.refresh() after a successful save, so cache invalidation is
// belt-and-suspenders — never let a missing store (e.g. unit/integration tests
// that invoke the action directly) turn a persisted write into a failure.
function revalidateCompanyRoute() {
  try {
    revalidatePath(COMPANY_ROUTE);
  } catch {
    /* no request store (test/non-request context) — router.refresh() covers reload */
  }
}

// Runtime validation for the save payload (closes the P2 nit: the action
// previously accepted a TYPED-but-UNPARSED SaveCompanyProfileInput). All
// editable profile fields are free-form trimmed strings; `region` is excluded
// at the type level (Omit) and re-asserted here by being absent from the schema.
const saveCompanyProfileSchema = z
  .object({
    tradingName: z.string().trim().min(1).max(200),
    legalName: z.string().trim().max(300),
    vat: z.string().trim().max(64),
    regon: z.string().trim().max(64),
    industry: z.string().trim().max(120),
    street: z.string().trim().max(300),
    city: z.string().trim().max(160),
    zip: z.string().trim().max(32),
    country: z.string().trim().max(120),
    email: z.string().trim().max(320),
    phone: z.string().trim().max(64),
    website: z.string().trim().max(300),
    currency: z.string().trim().min(1).max(3),
    timezone: z.string().trim().min(1).max(64),
    dateFormat: z.string().trim().min(1).max(32),
  })
  .strict();

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type OrganizationRow = {
  id: string;
  name: string;
  logo_url: string | null;
  timezone: string | null;
  locale: string | null;
  currency: string | null;
  date_format: string | null;
  gs1_prefix: string | null;
  region: string | null;
  tier: string | null;
  seat_limit: number | null;
  legal_name: string | null;
  vat: string | null;
  regon: string | null;
  industry: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
};

// The columns selected/returned everywhere a CompanyProfile is built from a row.
const ORGANIZATION_COLUMNS =
  'id, name, logo_url, timezone, locale, currency, date_format, gs1_prefix, region, tier, seat_limit, ' +
  'legal_name, vat, regon, industry, street, city, zip, country, email, phone, website';

export type ReadCompanyProfileResult =
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

function toCompanyProfile(row: OrganizationRow): CompanyProfile {
  // Map the persisted org row to the screen profile. Every editable field now
  // has a backing column (migration 168); fall back to the seed default only
  // when the column is null/empty so a freshly-bootstrapped org still renders.
  const text = (value: string | null, fallback: string) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : fallback;
  };
  return {
    id: row.id,
    tradingName: row.name,
    logoInitials: logoInitials(row.name),
    legalName: row.legal_name ?? '',
    vat: row.vat ?? '',
    regon: row.regon ?? '',
    industry: text(row.industry, serverFallbackOrganization.industry),
    street: row.street ?? '',
    city: row.city ?? '',
    zip: row.zip ?? '',
    country: text(row.country, serverFallbackOrganization.country),
    email: row.email ?? '',
    phone: row.phone ?? '',
    website: row.website ?? '',
    currency: text(row.currency, serverFallbackOrganization.currency),
    timezone: text(row.timezone, serverFallbackOrganization.timezone),
    dateFormat: text(row.date_format, serverFallbackOrganization.dateFormat),
    region: text(row.region, serverFallbackOrganization.region),
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

export async function readCompanyProfile(): Promise<ReadCompanyProfileResult> {
  try {
    return await withOrgContext<ReadCompanyProfileResult>(async (ctx): Promise<ReadCompanyProfileResult> => {
      const context = ctx as OrgContextLike;
      const canEdit = await hasOrgUpdatePermission(context);
      const { rows } = await context.client.query<OrganizationRow>(
        `select ${ORGANIZATION_COLUMNS}
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
    console.error(
      '[settings/company] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error', canEdit: false };
  }
}

export async function saveCompanyProfile(rawInput: SaveCompanyProfileInput): Promise<SaveCompanyProfileResult> {
  // Runtime validation BEFORE any data-plane work (P2 fix). A malformed/oversized
  // payload is rejected loudly instead of being trusted because it merely matched
  // the TS type at the call site.
  const parsed = saveCompanyProfileSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid' };
  }
  const input = parsed.data;

  try {
    return await withOrgContext<SaveCompanyProfileResult>(async (ctx): Promise<SaveCompanyProfileResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasOrgUpdatePermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      // Persist EVERY editable field. Previously only name/timezone/currency were
      // written, so legal name, VAT/NIP, REGON, industry, address, and contact
      // edits silently vanished on reload. `region` is not an org-row column and
      // is intentionally excluded.
      const { rows } = await context.client.query<OrganizationRow>(
        `update public.organizations
            set name       = $2,
                timezone   = $3,
                currency   = $4,
                date_format = $5,
                legal_name = $6,
                vat        = $7,
                regon      = $8,
                industry   = $9,
                street     = $10,
                city       = $11,
                zip        = $12,
                country    = $13,
                email      = $14,
                phone      = $15,
                website    = $16,
                updated_at = now()
          where id = $1::uuid
          returning ${ORGANIZATION_COLUMNS}`,
        [
          context.orgId,
          input.tradingName,
          input.timezone,
          input.currency,
          input.dateFormat,
          input.legalName,
          input.vat,
          input.regon,
          input.industry,
          input.street,
          input.city,
          input.zip,
          input.country,
          input.email,
          input.phone,
          input.website,
        ],
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
            changed: {
              name: input.tradingName,
              timezone: input.timezone,
              currency: input.currency,
              date_format: input.dateFormat,
              legal_name: input.legalName,
              vat: input.vat,
              regon: input.regon,
              industry: input.industry,
              street: input.street,
              city: input.city,
              zip: input.zip,
              country: input.country,
              email: input.email,
              phone: input.phone,
              website: input.website,
            },
          }),
        ],
      );

      // Invalidate the force-dynamic page cache so a navigation/refresh re-reads
      // the persisted row instead of a stale render.
      revalidateCompanyRoute();

      return { ok: true, organization: toCompanyProfile(row), outboxEventType: OUTBOX_EVENT_TYPE };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
