/**
 * FT-030 — `saveSamlConfig` Server Action.
 *
 * Single entry point for admins to upsert their tenant's SAML configuration.
 * Persists the metadata into `public.tenant_idp_config` and registers the
 * resulting connection with Jackson so subsequent SAML callbacks can pass
 * signature verification.
 *
 * Without the Jackson `createConnection` step (delegated to
 * `registerSamlConnection` in `lib/auth/saml.ts`) the SAML SP would happily
 * accept assertions but reject every one because Jackson has no record of
 * the IdP — that was the FT-030 root cause.
 *
 * Red lines:
 *   1. Caller MUST be `org.access.admin` or `org.platform.admin` of the
 *      currently-resolved org. Anything else returns `{ ok: false, error:
 *      'forbidden' }` — the action MUST NOT leak whether SAML config exists.
 *   2. The DB UPSERT and the Jackson registration are NOT in a single
 *      transaction (Jackson uses its own pool), so we ORDER them: DB first,
 *      Jackson second. If Jackson fails we return `saml_registration_failed`
 *      and leave the persisted row in place — the admin can retry the save
 *      and the UPSERT is idempotent.
 *   3. Raw DB error messages NEVER bubble to the caller. Errors are mapped
 *      to a fixed enum so the client cannot fingerprint failure modes.
 */

'use server';

import { withOrgContext } from '../../../../../lib/auth/with-org-context';
import { registerSamlConnection } from '../../../../../lib/auth/saml';

export interface SaveSamlConfigInput {
  /** SAML EntityID of the IdP (URN or URL). */
  entityId: string;
  /** SSO single-sign-on URL of the IdP (HTTP-Redirect or HTTP-POST binding). */
  ssoUrl: string;
  /** PEM-encoded x509 certificate for assertion-signature verification. */
  x509Cert: string;
  /** IdP metadata URL (Jackson prefers this when provided). */
  metadataUrl: string;
  /** When true, non-admins are blocked from password / magic sign-in. */
  enforceForNonAdmins: boolean;
}

export type SaveSamlConfigError =
  | 'forbidden'
  | 'invalid_input'
  | 'persistence_failed'
  | 'saml_registration_failed';

export type SaveSamlConfigResult =
  | { ok: true }
  | { ok: false; error: SaveSamlConfigError };

const ADMIN_SLUGS = ['org.access.admin', 'org.platform.admin'] as const;

export async function saveSamlConfig(
  input: SaveSamlConfigInput,
): Promise<SaveSamlConfigResult> {
  // Cheap input sanity-check before opening a DB transaction. We don't
  // exhaustively validate URL/PEM shape here — Jackson does that and reports
  // back via `saml_registration_failed`. We only short-circuit the obviously
  // empty case so callers don't get a misleading 'persistence_failed'.
  if (
    !input.entityId ||
    !input.ssoUrl ||
    !input.x509Cert ||
    !input.metadataUrl
  ) {
    return { ok: false, error: 'invalid_input' };
  }

  return withOrgContext(async ({ userId, orgId, client }) => {
    // ── 1. Admin gate ─────────────────────────────────────────────────────
    // Pin the slug list — granting any other role MUST NOT bypass this. The
    // caller's roles are read inside the same transaction that withOrgContext
    // opened, so RLS / app.current_org_id() is consistent.
    const { rows: roleRows } = await client.query<{ slug: string }>(
      `select r.slug from public.user_roles ur
         join public.roles r on r.id = ur.role_id
        where ur.user_id = $1::uuid
          and ur.org_id = $2::uuid
          and r.slug = ANY($3::text[])`,
      [userId, orgId, ADMIN_SLUGS as unknown as string[]],
    );

    if (roleRows.length === 0) {
      // Constant error string — do NOT differentiate "user not in org" from
      // "user has no admin role"; the surface is identical for the caller.
      return { ok: false, error: 'forbidden' as SaveSamlConfigError };
    }

    // ── 2. Resolve tenant_id (tenant_idp_config is keyed by tenant_id, NOT
    //    org_id — see migrations/005-tenant-idp-config.sql).
    const { rows: tenantRows } = await client.query<{ tenant_id: string }>(
      `select tenant_id from public.organizations where id = $1::uuid`,
      [orgId],
    );
    if (tenantRows.length === 0) {
      // Defensive — withOrgContext already verified the org exists, so this
      // should be unreachable. Still, fail closed.
      return { ok: false, error: 'persistence_failed' as SaveSamlConfigError };
    }
    const tenantId = tenantRows[0]!.tenant_id;

    // ── 3. UPSERT tenant_idp_config (keyed by tenant_id PK) ──────────────
    //
    // Migration 005 created the row with provider_type='password' as a side
    // effect of `seed_tenant_idp_config()`. We OVERWRITE that row's SAML-
    // related columns (added in 016-tenant-idp-config-fa2-columns.sql) on
    // every save so the latest admin input wins.
    //
    // Note: there is NO `sso_url` column in the schema — Jackson reads SSO
    // from the IdP metadata. We persist `metadata_url` and `entity_id`
    // explicitly because they're the operational fields admins care about.
    try {
      await client.query(
        `insert into public.tenant_idp_config (
            tenant_id,
            provider_type,
            entity_id,
            x509_cert,
            metadata_url,
            enforce_for_non_admins
          ) values ($1::uuid, 'saml', $2, $3, $4, $5)
          on conflict (tenant_id) do update set
            provider_type          = 'saml',
            entity_id              = excluded.entity_id,
            x509_cert              = excluded.x509_cert,
            metadata_url           = excluded.metadata_url,
            enforce_for_non_admins = excluded.enforce_for_non_admins`,
        [
          tenantId,
          input.entityId,
          input.x509Cert,
          input.metadataUrl,
          input.enforceForNonAdmins,
        ],
      );
    } catch (err) {
      // Map raw DB errors to a fixed enum — never echo back the underlying
      // pg error. Log server-side for ops.
      console.error('[saveSamlConfig] tenant_idp_config UPSERT failed', {
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, error: 'persistence_failed' as SaveSamlConfigError };
    }

    // ── 4. Register the connection with Jackson ──────────────────────────
    //
    // This is the FT-030 fix proper: the SAML callback signature check runs
    // through Jackson's connection registry. If the connection is not
    // registered, the callback rejects every assertion. The ssoUrl is the
    // input the admin actually configured but Jackson takes the URL from
    // the metadata payload, so we forward only the fields it consumes.
    try {
      await registerSamlConnection({
        tenantId,
        tenantConfig: {
          provider_type: 'saml',
          entity_id: input.entityId,
          x509_cert: input.x509Cert,
          metadata_url: input.metadataUrl,
        },
      });
    } catch (err) {
      console.error('[saveSamlConfig] Jackson createConnection failed', {
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        error: 'saml_registration_failed' as SaveSamlConfigError,
      };
    }

    return { ok: true };
  });
}
