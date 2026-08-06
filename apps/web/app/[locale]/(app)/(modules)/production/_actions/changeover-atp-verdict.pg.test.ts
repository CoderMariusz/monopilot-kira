/**
 * C4/F3b — the allergen changeover certificate must not lie about the ATP swab.
 *
 * REGRESSION: atpPassish() inspected the ATP evidence only when it was an OBJECT,
 * but the create modal sends a plain STRING, so an operator typing the literal
 * "FAIL" still produced allergen_changeover_validations.validation_result='passed'
 * — a BRCGS evidence row claiming a pass over a failed swab.
 *
 * Real Postgres on purpose: the fix reads the org ATP threshold through
 * public.atp_swab_threshold_rlu(...) INSIDE the FOR UPDATE select, which the pg
 * mock in changeover-actions.test.ts cannot execute or type-check.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../../../../../../../../packages/db/src/clients.js';
import {
  createPgTestFixture,
  ensureAppUser,
  type PgTestFixture,
} from '../../../../../../tests/helpers/owner-org-context.js';

// A *.pg.test.ts that silently describe.skip()s is a green-by-omission lie —
// this suite fails loudly instead (see the F3b evidence requirement).
if (!process.env.DATABASE_URL) {
  throw new Error('changeover-atp-verdict.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

type ActionContext = { userId: string; orgId: string; client: pg.PoolClient };

let runActionWithOrg: <T>(action: (ctx: ActionContext) => Promise<T>) => Promise<T> = async () => {
  throw new Error('test org context is not initialized');
};

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(<T,>(action: (ctx: ActionContext) => Promise<T>) => runActionWithOrg(action)),
}));
vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: 'pg-test-signature',
    subjectHash: 'pg-test-hash',
    signedAt: new Date().toISOString(),
  })),
}));

import { signChangeover } from './changeover-actions';

describe('signChangeover — ATP verdict on the allergen certificate (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let fixture: PgTestFixture;
  let orgId: string;
  let userId: string;
  let siteId: string;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    await ensureAppUser(ownerPool);
    appPool = getAppConnection();

    fixture = await createPgTestFixture(ownerPool, {
      permissions: ['production.allergen_gate.sign_first', 'production.allergen_gate.sign_second'],
    });
    ({ orgId, userId, siteId } = fixture);

    // required_signatures=1 → the FIRST signature completes the changeover, so a
    // single signer reaches the validation-row insert this test is about.
    await ownerPool.query(
      `insert into public.signoff_policies (org_id, signoff_type, required_signatures, allow_same_user)
       values ($1::uuid, 'production.changeover.allergen', 1, true)
       on conflict (org_id, signoff_type) do update set required_signatures = 1`,
      [orgId],
    );

    runActionWithOrg = async <T,>(action: (ctx: ActionContext) => Promise<T>): Promise<T> => {
      const sessionToken = randomUUID();
      await ownerPool.query(
        `insert into app.session_org_contexts (session_token, org_id, user_id)
         values ($1::uuid, $2::uuid, $3::uuid)`,
        [sessionToken, orgId, userId],
      );
      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
        const result = await action({ userId, orgId, client });
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
        await ownerPool
          .query('delete from app.session_org_contexts where session_token = $1::uuid', [sessionToken])
          .catch(() => undefined);
      }
    };
  });

  afterAll(async () => {
    await ownerPool
      ?.query('delete from public.allergen_changeover_validations where org_id = $1::uuid', [orgId])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.changeover_events where org_id = $1::uuid', [orgId])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.signoff_policies where org_id = $1::uuid', [orgId])
      .catch(() => undefined);
    await fixture?.cleanup();
    await appPool?.end();
    await ownerPool?.end();
  });

  /** Creates a cleaned, high-risk changeover carrying `atp` and signs it off. */
  async function certifyWith(atp: unknown): Promise<{ validation_result: string; atp_evidence: unknown }> {
    const changeoverId = randomUUID();
    await ownerPool.query(
      `insert into public.changeover_events
         (id, org_id, site_id, line_id, risk_level, started_at,
          cleaning_completed, atp_required, atp_result)
       values ($1::uuid, $2::uuid, $3::uuid, $4, 'high', pg_catalog.now(), true, $5::boolean, $6::jsonb)`,
      [changeoverId, orgId, siteId, `LINE-${changeoverId.slice(0, 8)}`, atp != null, atp == null ? null : JSON.stringify(atp)],
    );

    const result = await signChangeover({ changeoverId, signature: { password: '1234' } });
    expect(result).toMatchObject({ ok: true });

    const row = await ownerPool.query<{ validation_result: string; atp_evidence: unknown }>(
      `select validation_result, atp_evidence
         from public.allergen_changeover_validations
        where org_id = $1::uuid and changeover_event_id = $2::uuid`,
      [orgId, changeoverId],
    );
    expect(row.rowCount).toBe(1);
    return row.rows[0];
  }

  it('a literal "FAIL" typed into the ATP field does NOT certify as passed', async () => {
    const row = await certifyWith('FAIL');
    expect(row.validation_result).not.toBe('passed');
    // the operator's words are still kept verbatim as the audit evidence
    expect(row.atp_evidence).toBe('FAIL');
  });

  it('lowercase / spaced / Polish fail wordings also do not certify as passed', async () => {
    for (const value of ['fail', ' Failed ', 'NOK', 'nie', 'NIEZALICZONE']) {
      const row = await certifyWith(value);
      expect(row.validation_result, `ATP "${value}" must not pass`).not.toBe('passed');
    }
  });

  it('COUNTER-CONTROL: "PASS" still certifies as passed (the gate is not broken shut)', async () => {
    expect((await certifyWith('PASS')).validation_result).toBe('passed');
    expect((await certifyWith('ok')).validation_result).toBe('passed');
    expect((await certifyWith('zaliczone')).validation_result).toBe('passed');
  });

  it('COUNTER-CONTROL: a normal RLU reading under the org threshold still passes', async () => {
    // Placeholder shape the operators are asked for ("np. 7 RLU"); org threshold
    // resolves through public.atp_swab_threshold_rlu (default 10).
    expect((await certifyWith('7 RLU')).validation_result).toBe('passed');
    expect((await certifyWith({ rlu: 4 })).validation_result).toBe('passed');
  });

  it('an RLU reading OVER the org threshold does not certify as passed', async () => {
    expect((await certifyWith('41 RLU')).validation_result).not.toBe('passed');
  });

  it('no ATP evidence at all still passes (atp_required=false → no swab was demanded)', async () => {
    expect((await certifyWith(null)).validation_result).toBe('passed');
  });

  it('an unreadable ATP value does not certify as passed (fail-safe on unknown)', async () => {
    expect((await certifyWith('swab wg karty 12/B')).validation_result).not.toBe('passed');
  });
});
