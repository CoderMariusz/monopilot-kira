import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GET as getServiceProviderConfig } from '../../../../../apps/web/app/api/scim/v2/ServiceProviderConfig/route';
import {
  getScimOwnerPool,
  verifyScimBearer,
} from '../../../../../apps/web/lib/scim/middleware';

const databaseUrl = process.env.DATABASE_URL;
const runIfDb = databaseUrl ? it : it.skip;

const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const TOKEN_A = randomUUID();
const TOKEN_B = randomUUID();
const REQUEST_AMBIGUOUS = randomUUID();
const REQUEST_SINGLE = randomUUID();
const SCIM_BEARER = `scim_t089_${randomUUID().replace(/-/g, '')}`;

let ownerPool: import('pg').Pool;
let matchingHash: string;

describe('T-089 SCIM cross-tenant ambiguity guard', () => {
  beforeAll(async () => {
    if (!databaseUrl) return;

    const { getOwnerConnection } = await import('../../../../db/test-utils/test-pool.js');
    ownerPool = getOwnerConnection();
    matchingHash = await argon2.hash(SCIM_BEARER, ARGON2_OPTS);

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-089 Tenant A', 'eu', 'https://t089-a.test.invalid'),
              ($2, 'T-089 Tenant B', 'eu', 'https://t089-b.test.invalid')
       on conflict (id) do nothing`,
      [TENANT_A, TENANT_B],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'T-089 Org A', 'generic'),
              ($3, $4, 'T-089 Org B', 'generic')
       on conflict (id) do nothing`,
      [ORG_A, TENANT_A, ORG_B, TENANT_B],
    );
  });

  afterAll(async () => {
    if (!databaseUrl) return;

    await ownerPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [ORG_A, ORG_B]);
    await ownerPool.query(`delete from public.audit_events where request_id in ($1, $2)`, [
      REQUEST_AMBIGUOUS,
      REQUEST_SINGLE,
    ]);
    await ownerPool.query(`delete from public.scim_tokens where id in ($1, $2)`, [TOKEN_A, TOKEN_B]);
    await ownerPool.query(`delete from public.organizations where id in ($1, $2)`, [ORG_A, ORG_B]);
    await ownerPool.query(`delete from public.tenants where id in ($1, $2)`, [TENANT_A, TENANT_B]);
    await getScimOwnerPool().end();
    await ownerPool.end();
  });

  runIfDb('returns 401 and audits ambiguity when two scim_tokens rows verify the bearer', async () => {
    await seedScimTokens([TOKEN_A, TOKEN_B]);

    const response = await getServiceProviderConfig(scimRequest(REQUEST_AMBIGUOUS));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({
      status: '401',
      detail: 'Invalid or missing bearer token',
    });

    const audit = await ownerPool.query<{ after_state: { reason?: string } | null }>(
      `select after_state
         from public.audit_events
        where request_id = $1
          and action = 'scim.invalid_token'
          and actor_type = 'scim'
          and retention_class = 'security'
        order by occurred_at desc
        limit 1`,
      [REQUEST_AMBIGUOUS],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.after_state?.reason).toBe('cross_tenant_ambiguity');
  });

  runIfDb('resolves the tenant and org when exactly one scim_tokens row verifies the bearer', async () => {
    await seedScimTokens([TOKEN_A]);

    const context = await verifyScimBearer(scimRequest(REQUEST_SINGLE));

    expect(context).toMatchObject({
      tenantId: TENANT_A,
      orgId: ORG_A,
    });
    expect(context?.sessionToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    if (context?.sessionToken) {
      await ownerPool.query(`delete from app.session_org_contexts where session_token = $1`, [
        context.sessionToken,
      ]);
    }
  });
});

async function seedScimTokens(tokenIds: string[]): Promise<void> {
  await ownerPool.query(`delete from app.session_org_contexts where org_id in ($1, $2)`, [ORG_A, ORG_B]);
  await ownerPool.query(`delete from public.audit_events where request_id in ($1, $2)`, [
    REQUEST_AMBIGUOUS,
    REQUEST_SINGLE,
  ]);
  await ownerPool.query(`delete from public.scim_tokens where id in ($1, $2)`, [TOKEN_A, TOKEN_B]);

  if (tokenIds.includes(TOKEN_A)) {
    await ownerPool.query(
      `insert into public.scim_tokens (id, org_id, label, scim_token_hash, scim_token_last_four)
       values ($1, $2, 'T-089 shared token A', $3, $4)`,
      [TOKEN_A, ORG_A, matchingHash, SCIM_BEARER.slice(-4)],
    );
  }

  if (tokenIds.includes(TOKEN_B)) {
    await ownerPool.query(
      `insert into public.scim_tokens (id, org_id, label, scim_token_hash, scim_token_last_four)
       values ($1, $2, 'T-089 shared token B', $3, $4)`,
      [TOKEN_B, ORG_B, matchingHash, SCIM_BEARER.slice(-4)],
    );
  }
}

function scimRequest(requestId: string): Request {
  return new Request('https://web.test/scim/v2/ServiceProviderConfig', {
    method: 'GET',
    headers: {
      authorization: `Bearer ${SCIM_BEARER}`,
      'x-request-id': requestId,
    },
  });
}
