import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import process from 'node:process';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../db/test-utils/test-pool.js';
import { persistDownloadable, type S3CompatibleStorageConfig } from '../src/builder-storage.js';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from './owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '04310000-0000-4000-8000-000000000000';
const orgA = '04310000-0000-4000-8000-00000000000a';
const orgB = '04310000-0000-4000-8000-00000000000b';
const orgAUser = '04310000-0000-4000-8000-0000000000aa';
const orgBUser = '04310000-0000-4000-8000-0000000000bb';
const orgARole = '04310000-0000-4000-8000-0000000001aa';
const orgBRole = '04310000-0000-4000-8000-0000000001bb';
const productA = 'FA-T043-STORAGE-A';
const productB = 'FA-T043-STORAGE-B';

type StoredObject = {
  body: Buffer;
  contentType: string | undefined;
};

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function createFakeS3() {
  const objects = new Map<string, StoredObject>();
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'PUT') {
      const body = await readRequestBody(request);
      objects.set(url.pathname, {
        body,
        contentType: request.headers['content-type'],
      });
      response.writeHead(200);
      response.end();
      return;
    }

    response.writeHead(404);
    response.end();
  });

  return {
    objects,
    async listen() {
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address() as AddressInfo;
      return `http://127.0.0.1:${address.port}`;
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

async function ensureAppUser(pool: pg.Pool) {
  await ensureAppUserWithAdvisoryLock(pool);
}

async function trustOrgContext(pool: pg.Pool, sessionToken: string, orgId: string) {
  await pool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function seedBaseRows(pool: pg.Pool) {
  await ensureAppUser(pool);
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Builder Storage Tenant', 'eu', 'https://builder-storage.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'Builder Storage Org A', 'bakery'),
             ($3, $2, 'Builder Storage Org B', 'fmcg')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgA, tenantId, orgB],
  );
  await pool.query(
    `
      insert into public.roles (id, org_id, code, name, permissions, is_system)
      values ($1, $2, 'builder_storage_user', 'Builder Storage Role A', '[]'::jsonb, true),
             ($3, $4, 'builder_storage_user', 'Builder Storage Role B', '[]'::jsonb, true)
      on conflict (org_id, code) do update
        set name = excluded.name,
            permissions = excluded.permissions,
            is_system = excluded.is_system
    `,
    [orgARole, orgA, orgBRole, orgB],
  );
  await pool.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 'builder-storage-a@example.test', 'Builder Storage User A', $3),
             ($4, $5, 'builder-storage-b@example.test', 'Builder Storage User B', $6)
      on conflict (id) do update
        set org_id = excluded.org_id,
            email = excluded.email,
            name = excluded.name,
            role_id = excluded.role_id
    `,
    [orgAUser, orgA, orgARole, orgBUser, orgB, orgBRole],
  );
  await pool.query('delete from public.fa_builder_outputs where product_code in ($1, $2)', [productA, productB]);
  await pool.query('delete from public.product where product_code in ($1, $2)', [productA, productB]);
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'Builder Storage Product A', true, 1, $3)
    `,
    [productA, orgA, orgAUser],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'Builder Storage Product B', true, 1, $3)
    `,
    [productB, orgB, orgBUser],
  );
}

runIntegrationTest('persistDownloadable', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let fakeS3: ReturnType<typeof createFakeS3>;
  let storageConfig: S3CompatibleStorageConfig;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    fakeS3 = createFakeS3();
    const endpoint = await fakeS3.listen();
    storageConfig = {
      endpoint,
      bucket: 'npd-builder',
      region: 'test-region-1',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    };
    await seedBaseRows(ownerPool);
  });

  afterAll(async () => {
    await fakeS3?.close();
    await appPool?.end();
    await ownerPool?.end();
  });

  it('uploads the buffer to an org-scoped builder object key and inserts metadata with a current timestamp', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    await ownerPool.query('delete from public.fa_builder_outputs where product_code = $1', [productA]);

    const before = Date.now();
    const result = await persistDownloadable(productA, Buffer.from('xlsx-one'), {
      orgId: orgA,
      generatedByUser: orgAUser,
      appVersion: 'test-storage-1',
      sessionToken,
      db: appPool,
      storage: storageConfig,
      now: () => new Date('2026-01-02T03:04:05.006Z'),
    });
    const after = Date.now();

    expect(result.filePath).toBe(`org/${orgA}/builder/FA${productA}-20260102T030405006Z.xlsx`);
    expect(result.signedUrl).toContain('/npd-builder/org/');
    expect(result.signedUrl).toContain('X-Amz-Expires=86400');
    expect(fakeS3.objects.get(`/npd-builder/${result.filePath}`)?.body.toString()).toBe('xlsx-one');

    const row = await ownerPool.query<{
      product_code: string;
      file_path: string;
      generated_by_user: string;
      app_version: string;
      generated_at: Date;
      superseded_at: Date | null;
    }>(
      `
        select product_code, file_path, generated_by_user, app_version, generated_at, superseded_at
        from public.fa_builder_outputs
        where id = $1
      `,
      [result.rowId],
    );
    expect(row.rows[0]).toMatchObject({
      product_code: productA,
      file_path: result.filePath,
      generated_by_user: orgAUser,
      app_version: 'test-storage-1',
      superseded_at: null,
    });
    expect(row.rows[0]?.generated_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.rows[0]?.generated_at.getTime()).toBeLessThanOrEqual(after + 1000);
  });

  it('supersedes the prior active row and returns a signed URL for the new object', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    await ownerPool.query('delete from public.fa_builder_outputs where product_code = $1', [productA]);

    const first = await persistDownloadable(productA, Buffer.from('first'), {
      orgId: orgA,
      generatedByUser: orgAUser,
      sessionToken,
      db: appPool,
      storage: storageConfig,
      now: () => new Date('2026-01-02T03:04:05.006Z'),
    });
    const second = await persistDownloadable(productA, Buffer.from('second'), {
      orgId: orgA,
      generatedByUser: orgAUser,
      sessionToken,
      db: appPool,
      storage: storageConfig,
      now: () => new Date('2026-01-02T04:05:06.007Z'),
    });

    expect(second.filePath).not.toBe(first.filePath);
    expect(decodeURIComponent(new URL(second.signedUrl).pathname)).toBe(`/npd-builder/${second.filePath}`);
    expect(fakeS3.objects.get(`/npd-builder/${second.filePath}`)?.body.toString()).toBe('second');

    const rows = await ownerPool.query<{ id: string; superseded_at: Date | null }>(
      `
        select id, superseded_at
        from public.fa_builder_outputs
        where id in ($1, $2)
        order by generated_at
      `,
      [first.rowId, second.rowId],
    );
    expect(rows.rows).toEqual([
      { id: first.rowId, superseded_at: expect.any(Date) },
      { id: second.rowId, superseded_at: null },
    ]);
  });

  it('rejects a cross-org product write before creating a bucket object', async () => {
    const sessionToken = randomUUID();
    await trustOrgContext(ownerPool, sessionToken, orgA);
    fakeS3.objects.clear();

    await expect(
      persistDownloadable(productB, Buffer.from('wrong-org'), {
        orgId: orgA,
        generatedByUser: orgAUser,
        sessionToken,
        db: appPool,
        storage: storageConfig,
        now: () => new Date('2026-01-02T05:06:07.008Z'),
      }),
    ).rejects.toThrow(/does not belong to current org|row-level security|violates/i);

    expect(fakeS3.objects.size).toBe(0);
  });
});
