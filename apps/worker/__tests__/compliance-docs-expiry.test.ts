import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js';

import {
  registerComplianceDocsExpiryScan,
  type ComplianceDocsExpiryEmailSender,
} from '../src/jobs/compliance-docs-expiry.js';
import { createWorkerRuntime, getRegistry } from '../src/index.js';
import { JobRegistry, type Logger } from '../src/registry.js';
import { ownerQueryWithInferredOrgContext } from '../src/__tests__/owner-org-context.js';

const run = process.env.DATABASE_URL ? describe : describe.skip;

const tenantId = '08500000-0000-4000-8000-000000000000';
const orgA = '08500000-0000-4000-8000-00000000000a';
const orgB = '08500000-0000-4000-8000-00000000000b';
const ownerA = '08500000-0000-4000-8000-0000000000aa';
const managerA = '08500000-0000-4000-8000-0000000000ab';
const ownerB = '08500000-0000-4000-8000-0000000000bb';
const managerB = '08500000-0000-4000-8000-0000000000bc';
const productA = 'FA-T085-A';
const productB = 'FA-T085-B';

function createLoggerStub(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

async function seedBase(pool: pg.Pool): Promise<void> {
  await pool.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-085 Tenant', 'eu', 'https://t085.example.test')
     on conflict (id) do update set name = excluded.name`,
    [tenantId],
  );
  await pool.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values
       ($1, $2, 'T-085 Org A', 'bakery'),
       ($3, $2, 'T-085 Org B', 'fmcg')
     on conflict (id) do update set tenant_id = excluded.tenant_id`,
    [orgA, tenantId, orgB],
  );
  const roleRows = await pool.query<{ id: string; org_id: string }>(
    `insert into public.roles (org_id, slug, system, code, name, permissions, is_system)
     values
       ($1, 'npd_manager', false, 'npd_manager', 'NPD Manager', '[]'::jsonb, true),
       ($2, 'npd_manager', false, 'npd_manager', 'NPD Manager', '[]'::jsonb, true)
     on conflict (org_id, code) do update
       set slug = excluded.slug,
           name = excluded.name
     returning id, org_id`,
    [orgA, orgB],
  );
  const roleA = roleRows.rows.find((row) => row.org_id === orgA)?.id;
  const roleB = roleRows.rows.find((row) => row.org_id === orgB)?.id;
  if (!roleA || !roleB) {
    throw new Error('Failed to seed NPD manager roles');
  }
  await pool.query(
    `insert into public.users (id, org_id, email, name, display_name, role_id)
     values
       ($1, $2, 'doc-owner-a@example.test', 'Doc Owner A', 'Doc Owner A', $5),
       ($3, $2, 'npd-manager-a@example.test', 'NPD Manager A', 'NPD Manager A', $5),
       ($6, $4, 'doc-owner-b@example.test', 'Doc Owner B', 'Doc Owner B', $8),
       ($7, $4, 'npd-manager-b@example.test', 'NPD Manager B', 'NPD Manager B', $8)
     on conflict (id) do update
       set org_id = excluded.org_id,
           email = excluded.email,
           name = excluded.name,
           role_id = excluded.role_id`,
    [ownerA, orgA, managerA, orgB, roleA, ownerB, managerB, roleB],
  );
  await pool.query(
    `insert into public.user_roles (user_id, role_id, org_id)
     values
       ($1, $2, $3),
       ($4, $5, $6)
     on conflict (user_id, role_id) do update set org_id = excluded.org_id`,
    [managerA, roleA, orgA, managerB, roleB, orgB],
  );
  await pool.query(`delete from public.product where product_code in ($1, $2)`, [
    productA,
    productB,
  ]);
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'T-085 Product A', 1, $3)
    `,
    [productA, orgA, ownerA],
  );
  await ownerQueryWithInferredOrgContext(pool,
    `
      insert into public.product (product_code, org_id, product_name, schema_version, created_by_user)
      values ($1, $2, 'T-085 Product B', 1, $3)
    `,
    [productB, orgB, ownerB],
  );
}

async function cleanup(pool: pg.Pool): Promise<void> {
  await pool.query(`delete from public.outbox_events where org_id in ($1, $2)`, [orgA, orgB]);
  await pool.query(`delete from public.email_delivery_log where org_id in ($1, $2)`, [orgA, orgB]);
  await pool.query(`delete from public.compliance_docs where org_id in ($1, $2)`, [orgA, orgB]);
  await pool.query(`delete from public.product where product_code in ($1, $2)`, [
    productA,
    productB,
  ]);
}

async function insertDoc(
  pool: pg.Pool,
  input: {
    orgId: string;
    productCode: string;
    title: string;
    filePath: string;
    expiresSql: string;
    uploadedBy: string;
    version: number;
  },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.compliance_docs
       (org_id, product_code, doc_type, title, file_path, mime_type, file_size_bytes, version_number, expires_at, uploaded_by_user)
     values
       ($1, $2, 'Spec', $3, $4, 'application/pdf', 2048, $5, ${input.expiresSql}, $6)
     returning id`,
    [
      input.orgId,
      input.productCode,
      input.title,
      input.filePath,
      input.version,
      input.uploadedBy,
    ],
  );

  return rows[0]!.id;
}

run('T-085 compliance docs expiry scan worker integration', () => {
  let owner: pg.Pool;

  beforeAll(async () => {
    owner = getOwnerConnection();
    await seedBase(owner);
  }, 120000);

  beforeEach(async () => {
    await cleanup(owner);
    await seedBase(owner);
  });

  afterAll(async () => {
    if (owner) {
      await cleanup(owner).catch(() => undefined);
      await owner.query(`delete from public.user_roles where org_id in ($1, $2)`, [orgA, orgB]);
      await owner.query(`delete from public.users where org_id in ($1, $2)`, [orgA, orgB]);
      await owner.query(`delete from public.roles where org_id in ($1, $2)`, [orgA, orgB]);
      await owner.query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB]);
      await owner.query(`delete from public.tenants where id = $1`, [tenantId]);
      await owner.end();
    }
  });

  it('registers the nightly compliance-docs-expiry-scan job during worker boot', async () => {
    const pool = { end: vi.fn(async () => undefined) } as unknown as pg.Pool;
    const runtime = createWorkerRuntime({ pool });

    expect(getRegistry().has('compliance-docs-expiry-scan')).toBe(true);

    await runtime.shutdown();
  });

  it('flags docs expiring within 30 days and emits exactly one expiring event', async () => {
    const expiringDocId = await insertDoc(owner, {
      orgId: orgA,
      productCode: productA,
      title: 'Expiring specification',
      filePath: `compliance/${randomUUID()}/expiring.pdf`,
      expiresSql: 'current_date + 25',
      uploadedBy: ownerA,
      version: 1,
    });
    await insertDoc(owner, {
      orgId: orgB,
      productCode: productB,
      title: 'Other org expiring specification',
      filePath: `compliance/${randomUUID()}/expiring-b.pdf`,
      expiresSql: 'current_date + 25',
      uploadedBy: ownerB,
      version: 1,
    });

    const sendEmail = vi.fn<ComplianceDocsExpiryEmailSender>();
    const registry = new JobRegistry({ pool: owner, logger: createLoggerStub() });
    registerComplianceDocsExpiryScan(registry, { sendEmail });

    await registry.runOnceForTest('compliance-docs-expiry-scan');
    await registry.runOnceForTest('compliance-docs-expiry-scan');

    const docs = await owner.query<{ expiry_state: string }>(
      `select expiry_state from public.compliance_docs where id = $1`,
      [expiringDocId],
    );
    expect(docs.rows[0]?.expiry_state).toBe('Expiring');

    const events = await owner.query<{ event_type: string; aggregate_id: string }>(
      `select event_type, aggregate_id
       from public.outbox_events
       where org_id = $1
         and aggregate_type = 'compliance_doc'
         and aggregate_id = $2
       order by id`,
      [orgA, expiringDocId],
    );
    expect(events.rows).toEqual([
      { event_type: 'compliance_doc.expiring', aggregate_id: expiringDocId },
    ]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('flags expired docs, emits expired event, and emails the doc owner plus NPD Manager once', async () => {
    const expiredDocId = await insertDoc(owner, {
      orgId: orgA,
      productCode: productA,
      title: 'Expired specification',
      filePath: `compliance/${randomUUID()}/expired.pdf`,
      expiresSql: 'current_date - 1',
      uploadedBy: ownerA,
      version: 2,
    });

    const sendEmail = vi.fn<ComplianceDocsExpiryEmailSender>(async () => ({ messageId: 'msg-085' }));
    const registry = new JobRegistry({ pool: owner, logger: createLoggerStub() });
    registerComplianceDocsExpiryScan(registry, { sendEmail });

    await registry.runOnceForTest('compliance-docs-expiry-scan');
    await registry.runOnceForTest('compliance-docs-expiry-scan');

    const docs = await owner.query<{ expiry_state: string; last_notified_at: Date | null }>(
      `select expiry_state, last_notified_at from public.compliance_docs where id = $1`,
      [expiredDocId],
    );
    expect(docs.rows[0]?.expiry_state).toBe('Expired');
    expect(docs.rows[0]?.last_notified_at).toBeInstanceOf(Date);

    const events = await owner.query<{ event_type: string; aggregate_id: string }>(
      `select event_type, aggregate_id
       from public.outbox_events
       where org_id = $1
         and aggregate_type = 'compliance_doc'
         and aggregate_id = $2
       order by id`,
      [orgA, expiredDocId],
    );
    expect(events.rows).toEqual([
      { event_type: 'compliance_doc.expired', aggregate_id: expiredDocId },
    ]);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: orgA,
        docId: expiredDocId,
        to: ['doc-owner-a@example.test', 'npd-manager-a@example.test'],
        subject: expect.stringContaining('Expired specification'),
      }),
    );

    const emailLogs = await owner.query<{ recipient_email: string; provider_message_id: string }>(
      `select recipient_email, provider_message_id
       from public.email_delivery_log
       where org_id = $1
         and trigger_code = 'compliance_doc.expired'
       order by recipient_email`,
      [orgA],
    );
    expect(emailLogs.rows).toEqual([
      { recipient_email: 'doc-owner-a@example.test', provider_message_id: 'msg-085' },
      { recipient_email: 'npd-manager-a@example.test', provider_message_id: 'msg-085' },
    ]);
  });
});
