'use server';

import { getOwnerConnection } from '@monopilot/db/clients';
import { SYSTEM_ROLE_SEEDS } from '../../../../packages/rbac/src/role-seed';

export type CreateOrganizationInput = {
  slug: string;
  name: string;
  timezone?: string;
  locale?: string;
  currency?: string;
  region?: 'eu' | 'us';
  tier?: 'L1' | 'L2' | 'L3' | 'L4';
};

export type CreateOrganizationResult =
  | { ok: true; data: { orgId: string; slug: string } }
  | { ok: false; error: 'INVALID_INPUT' | 'SLUG_TAKEN' | 'PERSISTENCE_FAILED' };

type QueryableClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
  release: () => void;
};

type InsertedOrganizationRow = {
  id: string;
  slug: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const supportedRegions = new Set(['eu', 'us']);
const supportedTiers = new Set(['L1', 'L2', 'L3', 'L4']);

const createOrganizationInputSchema = {
  safeParse(input: unknown):
    | { success: true; data: Required<CreateOrganizationInput> }
    | { success: false } {
    if (!isRecord(input)) {
      return { success: false };
    }

    const slug = normalizeString(input.slug);
    const name = normalizeString(input.name);
    const timezone = normalizeString(input.timezone) ?? 'Europe/Warsaw';
    const locale = normalizeString(input.locale) ?? 'pl';
    const currency = normalizeString(input.currency) ?? 'GBP';
    const region = normalizeString(input.region) ?? 'eu';
    const tier = normalizeString(input.tier) ?? 'L2';

    if (!slug || !name || !SLUG_PATTERN.test(slug)) {
      return { success: false };
    }
    if (!supportedRegions.has(region) || !supportedTiers.has(tier)) {
      return { success: false };
    }

    return {
      success: true,
      data: {
        slug,
        name,
        timezone,
        locale,
        currency,
        region: region as Required<CreateOrganizationInput>['region'],
        tier: tier as Required<CreateOrganizationInput>['tier'],
      },
    };
  },
};

export async function createOrganization(rawInput: unknown): Promise<CreateOrganizationResult> {
  const parsed = createOrganizationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  const input = parsed.data;
  const pool = getOwnerConnection();
  const client = (await pool.connect()) as QueryableClient;

  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `insert into public.organizations
         (slug, name, timezone, locale, currency, region, tier, onboarding_state, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, now(), now())
       returning id, slug`,
      [input.slug, input.name, input.timezone, input.locale, input.currency, input.region, input.tier],
    );
    const organization = inserted.rows[0] as InsertedOrganizationRow | undefined;
    if (!organization?.id || !organization.slug) {
      throw new Error('createOrganization did not return an organization row');
    }

    await client.query(
      `insert into public.roles (org_id, code, name, permissions, is_system, display_order)
       select
         $1::uuid,
         role_seed.code,
         role_seed.name,
         role_seed.permissions::jsonb,
         true,
         role_seed.display_order
       from jsonb_to_recordset($2::jsonb) as role_seed(
         code text,
         name text,
         permissions jsonb,
         display_order int
       )`,
      [organization.id, JSON.stringify(buildRoleSeedRows())],
    );

    await client.query(
      `insert into public.tenant_variations
         (org_id, dept_overrides, rule_variant_overrides, feature_flags, schema_extensions_count)
       values ($1::uuid, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 0)`,
      [organization.id],
    );

    await client.query(
      `insert into public.outbox_events
         (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
       values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
      [
        organization.id,
        'org.created',
        'org',
        organization.id,
        JSON.stringify({ org_id: organization.id, slug: organization.slug }),
        'settings-create-organization-v1',
      ],
    );

    await client.query('COMMIT');
    return { ok: true, data: { orgId: organization.id, slug: organization.slug } };
  } catch (error) {
    await rollbackQuietly(client);
    if (isDuplicateSlugError(error)) {
      return { ok: false, error: 'SLUG_TAKEN' };
    }
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  } finally {
    client.release();
  }
}

function buildRoleSeedRows(): { code: string; name: string; permissions: readonly string[]; display_order: number }[] {
  return SYSTEM_ROLE_SEEDS.map((role, index) => ({
    code: role.code,
    name: role.name,
    permissions: role.permissions,
    display_order: index + 1,
  }));
}

async function rollbackQuietly(client: QueryableClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the original error/result mapping.
  }
}

function isDuplicateSlugError(error: unknown): boolean {
  return (
    isRecord(error) &&
    error.code === '23505' &&
    (error.constraint === 'organizations_slug_unique' || String(error.message ?? '').includes('organizations_slug_unique'))
  );
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
