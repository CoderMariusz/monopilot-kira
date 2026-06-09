import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const storageUpload = vi.fn();
const storageCreateSignedUrl = vi.fn();
const storageCreateBucket = vi.fn();

vi.mock('../../../../../../../lib/auth/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    storage: {
      from: vi.fn(() => ({
        upload: storageUpload,
        createSignedUrl: storageCreateSignedUrl,
      })),
    },
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      createBucket: storageCreateBucket,
    },
  })),
}));

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const tenantId = randomUUID();
const orgAId = randomUUID();
const orgBId = randomUUID();
const userAId = randomUUID();
const userBId = randomUUID();
const roleAId = randomUUID();
const roleBId = randomUUID();
const productA = `T084-A-${randomUUID().slice(0, 8)}`;
const productB = `T084-B-${randomUUID().slice(0, 8)}`;

let owner: pg.Pool;

async function ensureAppUser() {
  await owner.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seed() {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-084 Docs Tenant', 'eu', 'https://t084.example.test')
     on conflict (id) do nothing`,
    [tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $3, 'T-084 Docs Org A', 'fmcg'),
            ($2, $3, 'T-084 Docs Org B', 'fmcg')
     on conflict (id) do nothing`,
    [orgAId, orgBId, tenantId],
  );
  await owner.query(
    `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system)
     values ($1, $2, 't084-doc-writer-a', false, 't084_doc_writer_a', 'T-084 Docs Writer A', '[]'::jsonb, false),
            ($3, $4, 't084-doc-writer-b', false, 't084_doc_writer_b', 'T-084 Docs Writer B', '[]'::jsonb, false)
     on conflict (id) do nothing`,
    [roleAId, orgAId, roleBId, orgBId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'npd.compliance_doc.write'), ($2, 'npd.compliance_doc.write')
     on conflict (role_id, permission) do nothing`,
    [roleAId, roleBId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, display_name, role_id, name)
     values ($1, $2, 't084-doc-a@example.test', 'T-084 Docs User A', $3, 'T-084 Docs User A'),
            ($4, $5, 't084-doc-b@example.test', 'T-084 Docs User B', $6, 'T-084 Docs User B')
     on conflict (id) do nothing`,
    [userAId, orgAId, roleAId, userBId, orgBId, roleBId],
  );
  await owner.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values ($1, $2, $3), ($4, $5, $6)
     on conflict (user_id, role_id) do nothing`,
    [userAId, roleAId, orgAId, userBId, roleBId, orgBId],
  );
  await owner.query(
    `insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
     values ($1, $2, 'T-084 Product A', 1, $3),
            ($4, $5, 'T-084 Product B', 1, $6)
     on conflict (org_id, product_code) do nothing`,
    [productA, orgAId, userAId, productB, orgBId, userBId],
  );
}

async function cleanup() {
  await owner.query(`delete from public.outbox_events where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
  await owner.query(`delete from public.audit_events where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
  await owner.query(`delete from public.compliance_docs where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]).catch(() => undefined);
  await owner.query(`delete from public.product where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]).catch(() => undefined);
  await owner.query(`delete from public.user_roles where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
  await owner.query(`delete from public.users where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
  await owner.query(`delete from public.role_permissions rp using public.roles r where rp.role_id = r.id and r.org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
  await owner.query(`delete from public.roles where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
  await owner.query(`delete from public.organizations where id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
  await owner.query(`delete from public.tenants where id = $1::uuid`, [tenantId]);
}

function formDataFor(file: File, overrides: Partial<Record<string, string>> = {}) {
  const form = new FormData();
  form.set('productCode', overrides.productCode ?? productA);
  form.set('docType', overrides.docType ?? 'Spec');
  form.set('title', overrides.title ?? 'Release Specification');
  form.set('file', file);
  return form;
}

run('T-084 compliance docs Server Actions — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for integration seed/cleanup
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userAId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgAId;
    await seed();
  }, 120000);

  beforeEach(async () => {
    storageUpload.mockReset();
    storageCreateSignedUrl.mockReset();
    storageCreateBucket.mockReset();
    storageUpload.mockResolvedValue({ data: { path: 'ok' }, error: null });
    storageCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/signed' }, error: null });
    storageCreateBucket.mockResolvedValue({ data: { name: 'bucket' }, error: null });
    await owner.query(`delete from public.outbox_events where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
    await owner.query(`delete from public.audit_events where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]);
    await owner.query(`delete from public.compliance_docs where org_id in ($1::uuid, $2::uuid)`, [orgAId, orgBId]).catch(() => undefined);
  });

  afterAll(async () => {
    await cleanup();
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await owner.end();
  }, 120000);

  it('rejects a 25 MB PDF before storage and inserts no compliance_docs row', async () => {
    const { uploadDoc } = await import('../upload-doc');
    const file = new File([new Uint8Array(25 * 1024 * 1024)], 'too-large.pdf', { type: 'application/pdf' });

    const result = await uploadDoc(formDataFor(file));

    expect(result).toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
    expect(storageUpload).not.toHaveBeenCalled();
    const count = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.compliance_docs where org_id = $1::uuid`,
      [orgAId],
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  it('creates signed URLs with TTL <= 900 seconds and writes audit_events', async () => {
    const { uploadDoc } = await import('../upload-doc');
    const { getSignedUrl } = await import('../get-signed-url');

    const upload = await uploadDoc(formDataFor(new File(['pdf'], 'spec.pdf', { type: 'application/pdf' })));
    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error(upload.code);

    const signed = await getSignedUrl({ productCode: productA, docId: upload.docId });

    expect(signed).toEqual({ ok: true, url: 'https://storage.example.test/signed', expiresInSeconds: 900 });
    expect(storageCreateSignedUrl).toHaveBeenCalledWith(expect.any(String), 900);
    const audit = await owner.query<{ action: string; resource_id: string }>(
      `select action, resource_id
         from public.audit_events
        where org_id = $1::uuid and action = 'compliance_doc.url_granted'`,
      [orgAId],
    );
    expect(audit.rows).toEqual([{ action: 'compliance_doc.url_granted', resource_id: upload.docId }]);
  });

  it('increments versions instead of overwriting same product/doc_type uploads', async () => {
    const { uploadDoc } = await import('../upload-doc');
    const { listDocs } = await import('../list-docs');

    const first = await uploadDoc(formDataFor(new File(['pdf-one'], 'spec-1.pdf', { type: 'application/pdf' })));
    const second = await uploadDoc(formDataFor(new File(['pdf-two'], 'spec-2.pdf', { type: 'application/pdf' })));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const listed = await listDocs({ productCode: productA });

    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error(listed.code);
    expect(listed.docs.map((doc) => doc.versionNumber).sort()).toEqual([1, 2]);
    expect(storageUpload).toHaveBeenCalledTimes(2);
    expect(storageUpload.mock.calls.every((call) => call[2]?.upsert === false)).toBe(true);
  });

  it('soft-deletes a doc, hides it from listDocs, and emits compliance_doc.deleted', async () => {
    const { uploadDoc } = await import('../upload-doc');
    const { softDeleteDoc } = await import('../soft-delete-doc');
    const { listDocs } = await import('../list-docs');
    const upload = await uploadDoc(formDataFor(new File(['pdf'], 'delete-me.pdf', { type: 'application/pdf' })));
    expect(upload.ok).toBe(true);
    if (!upload.ok) throw new Error(upload.code);

    const deleted = await softDeleteDoc({ productCode: productA, docId: upload.docId });
    const listed = await listDocs({ productCode: productA });

    expect(deleted).toEqual({ ok: true, docId: upload.docId });
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error(listed.code);
    expect(listed.docs).toHaveLength(0);
    const outbox = await owner.query<{ event_type: string; aggregate_id: string }>(
      `select event_type, aggregate_id
         from public.outbox_events
        where org_id = $1::uuid and event_type = 'compliance_doc.deleted'`,
      [orgAId],
    );
    expect(outbox.rows).toEqual([{ event_type: 'compliance_doc.deleted', aggregate_id: upload.docId }]);
  });

  it('enforces non-vacuous org RLS: other-org rows are invisible and WITH CHECK rejects cross-org insert', async () => {
    const { listDocs } = await import('../list-docs');
    await owner.query(
      `insert into public.compliance_docs
         (org_id, product_code, doc_type, title, file_path, mime_type, file_size_bytes, version_number, uploaded_by_user)
       values ($1::uuid, $2, 'Spec', 'Other Org Spec', 'org-b/spec.pdf', 'application/pdf', 123, 1, $3::uuid)`,
      [orgBId, productB, userBId],
    );

    const listed = await listDocs({ productCode: productA });

    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error(listed.code);
    expect(listed.docs).toHaveLength(0);

    const { withOrgContext } = await import('../../../../../../../lib/auth/with-org-context');
    await expect(
      withOrgContext(async ({ client }) =>
        client.query(
          `insert into public.compliance_docs
             (org_id, product_code, doc_type, title, file_path, mime_type, file_size_bytes, version_number, uploaded_by_user)
           values ($1::uuid, $2, 'Spec', 'Cross Org Spec', 'cross/spec.pdf', 'application/pdf', 123, 1, $3::uuid)`,
          [orgBId, productB, userAId],
        ),
      ),
    ).rejects.toThrow(/row-level security|violates row-level/i);
  });
});
