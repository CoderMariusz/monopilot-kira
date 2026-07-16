/**
 * C020 — real Postgres backstop for NPD field catalog semantic uniqueness.
 * Requires DATABASE_URL — loud fail, no describe.skip.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  databaseUrl,
  makeIdentitySeed,
  seedIdentities,
  withActionActor,
} from '../../../../../../(npd)/brief/actions/__tests__/brief-integration-helpers';
import { createField, setFieldActive } from '../npd-field-config';

if (!databaseUrl) {
  throw new Error('npd-field-catalog-uniqueness.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

const seed = makeIdentitySeed();
const ownerFieldAId = randomUUID();
const ownerFieldBId = randomUUID();
const suffix = randomUUID().slice(0, 8);

let owner: pg.Pool;

async function cleanupCatalogRows(): Promise<void> {
  await owner.query(
    `delete from public.npd_department_field
      where field_id in (
        select id from public.npd_field_catalog
         where org_id = $1::uuid
           and code like $2
      )`,
    [seed.orgAId, `c020-${suffix}%`],
  );
  await owner.query(
    `delete from public.npd_field_catalog
      where org_id = $1::uuid
        and code like $2`,
    [seed.orgAId, `c020-${suffix}%`],
  );
}

describe('C020 — NPD field catalog semantic uniqueness (real Postgres)', () => {
  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: databaseUrl });
    await seedIdentities(owner, seed);
    await owner.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'npd.schema.edit')
       on conflict (role_id, permission) do nothing`,
      [seed.roleAId],
    );
  });

  afterAll(async () => {
    await cleanupCatalogRows().catch(() => undefined);
    await owner?.end();
  });

  it('dedup migration leaves at most one active semantic code duplicate per org', async () => {
    const codeA = `c020_${suffix}_peer`;
    const codeB = `c020-${suffix}-peer`;
    await owner.query(
      `insert into public.npd_field_catalog
         (id, org_id, code, label, data_type, active)
       values
         ($1::uuid, $2::uuid, $3, 'C020 dedup A', 'text', false),
         ($4::uuid, $2::uuid, $5, 'C020 dedup B', 'text', false)
       on conflict (id) do nothing`,
      [ownerFieldAId, seed.orgAId, codeA, ownerFieldBId, codeB],
    );

    const first = await withActionActor(seed.userAId, seed.orgAId, () =>
      setFieldActive(ownerFieldAId, true),
    );
    expect(first).toMatchObject({ active: true });

    const second = await withActionActor(seed.userAId, seed.orgAId, () =>
      setFieldActive(ownerFieldBId, true),
    );
    expect(second).toEqual({ ok: false, error: 'duplicate_code' });

    const { rows } = await owner.query<{ active: boolean }>(
      `select active
         from public.npd_field_catalog
        where org_id = $1::uuid
          and id in ($2::uuid, $3::uuid)
        order by id`,
      [seed.orgAId, ownerFieldAId, ownerFieldBId],
    );
    expect(rows.filter((row) => row.active).length).toBe(1);
  });

  it('rejects a second concurrent create with the same semantic code', async () => {
    const base = `c020-${suffix}-race`;
    const [first, second] = await Promise.allSettled([
      withActionActor(seed.userAId, seed.orgAId, () =>
        createField({
          code: `${base}_one`,
          label: `C020 race one ${suffix}`,
          data_type: 'text',
        }),
      ),
      withActionActor(seed.userAId, seed.orgAId, () =>
        createField({
          code: `${base}-one`,
          label: `C020 race two ${suffix}`,
          data_type: 'number',
        }),
      ),
    ]);

    const outcomes = [first, second].map((result) => {
      if (result.status === 'fulfilled') return { ok: true as const, value: result.value };
      return { ok: false as const, reason: result.reason };
    });
    const successes = outcomes.filter((outcome) => outcome.ok);
    const failures = outcomes.filter((outcome) => !outcome.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(String(failures[0]?.reason)).toContain('duplicate_code');

    const { rows } = await owner.query<{ count: string }>(
      `select count(*)::text as count
         from public.npd_field_catalog
        where org_id = $1::uuid
          and active = true
          and lower(regexp_replace(trim(code), '[^a-z0-9]+', '', 'g')) = $2`,
      [seed.orgAId, `${base}one`.toLowerCase()],
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('maps semantic label conflicts to semantic_duplicate_label', async () => {
    const code = `c020-${suffix}-label-peer`;
    await withActionActor(seed.userAId, seed.orgAId, () =>
      createField({
        code,
        label: `Shelf Life ${suffix}`,
        data_type: 'integer',
      }),
    );

    await expect(
      withActionActor(seed.userAId, seed.orgAId, () =>
        createField({
          code: `c020-${suffix}-label-new`,
          label: `shelf-life-${suffix}`,
          data_type: 'text',
        }),
      ),
    ).rejects.toThrow('semantic_duplicate_label');
  });
});
