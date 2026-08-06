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
// Fails CLOSED on a wrong/blank secret exactly like the real signEvent
// (EPinFailedError), so "signed off without a signature" cannot pass by omission.
// The literal must stay inline: vi.mock factories are hoisted above module consts.
vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async (input: { pin?: string }) => {
    if (input?.pin !== '1234') {
      const error = new Error('Invalid password or PIN');
      error.name = 'EPinFailedError';
      throw error;
    }
    return {
      signatureId: 'pg-test-signature',
      subjectHash: 'pg-test-hash',
      signedAt: new Date().toISOString(),
    };
  }),
}));

import { signEvent } from '@monopilot/e-sign';

import {
  overrideChangeoverValidation,
  recordChangeoverRetest,
  signChangeover,
} from './changeover-actions';

describe('signChangeover — ATP verdict on the allergen certificate (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let fixture: PgTestFixture;
  let orgId: string;
  let userId: string;
  let siteId: string;
  // Counter-control principal: a real operator in the SAME org who may write
  // changeovers and sign first, but holds NO supervisor grant. Deliberately not
  // `admin` — has-permission.ts:29-30 waves super-role CODES through, so an
  // admin-based denial proof would prove nothing.
  const operatorRoleId = randomUUID();
  const operatorUserId = randomUUID();
  /** Which principal the next action runs as; empty = the permitted fixture user. */
  let actingUserId = '';

  async function actingAs<T>(principalId: string, run: () => Promise<T>): Promise<T> {
    actingUserId = principalId;
    try {
      return await run();
    } finally {
      actingUserId = '';
    }
  }

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    await ensureAppUser(ownerPool);
    appPool = getAppConnection();

    fixture = await createPgTestFixture(ownerPool, {
      permissions: [
        'production.changeover.write',
        'production.allergen_gate.sign_first',
        'production.allergen_gate.sign_second',
      ],
    });
    ({ orgId, userId, siteId } = fixture);

    const operatorPermissions = ['production.changeover.write', 'production.allergen_gate.sign_first'];
    await ownerPool.query(
      `insert into public.roles
         (id, org_id, slug, system, code, name, permissions, is_system, display_order)
       values ($1::uuid, $2::uuid, $3, false, $3, 'PG Fixture Operator', $4::jsonb, false, 901)`,
      [operatorRoleId, orgId, `pg-operator-${operatorRoleId.slice(0, 8)}`, JSON.stringify(operatorPermissions)],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, display_name, name, role_id)
       values ($1::uuid, $2::uuid, $3, 'PG Fixture Operator', 'PG Fixture Operator', $4::uuid)`,
      [operatorUserId, orgId, `pg-operator-${operatorUserId}@example.test`, operatorRoleId],
    );
    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       select $1::uuid, permission from unnest($2::text[]) permission
       on conflict (role_id, permission) do nothing`,
      [operatorRoleId, operatorPermissions],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id) values ($1::uuid, $2::uuid, $3::uuid)`,
      [operatorUserId, operatorRoleId, orgId],
    );

    // required_signatures=1 → the FIRST signature completes the changeover, so a
    // single signer reaches the validation-row insert this test is about.
    await ownerPool.query(
      `insert into public.signoff_policies (org_id, signoff_type, required_signatures, allow_same_user)
       values ($1::uuid, 'production.changeover.allergen', 1, true)
       on conflict (org_id, signoff_type) do update set required_signatures = 1`,
      [orgId],
    );

    runActionWithOrg = async <T,>(action: (ctx: ActionContext) => Promise<T>): Promise<T> => {
      const principalId = actingUserId || userId;
      const sessionToken = randomUUID();
      await ownerPool.query(
        `insert into app.session_org_contexts (session_token, org_id, user_id)
         values ($1::uuid, $2::uuid, $3::uuid)`,
        [sessionToken, orgId, principalId],
      );
      const client = await appPool.connect();
      try {
        await client.query('begin');
        await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
        const result = await action({ userId: principalId, orgId, client });
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
    await ownerPool
      ?.query('delete from public.user_roles where user_id = $1::uuid', [operatorUserId])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.role_permissions where role_id = $1::uuid', [operatorRoleId])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.users where id = $1::uuid', [operatorUserId])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.roles where id = $1::uuid', [operatorRoleId])
      .catch(() => undefined);
    await fixture?.cleanup();
    await appPool?.end();
    await ownerPool?.end();
  });

  /** Creates a cleaned, high-risk changeover carrying `atp` (not yet signed off). */
  async function createChangeoverWith(atp: unknown): Promise<string> {
    const changeoverId = randomUUID();
    await ownerPool.query(
      `insert into public.changeover_events
         (id, org_id, site_id, line_id, risk_level, started_at,
          cleaning_completed, atp_required, atp_result)
       values ($1::uuid, $2::uuid, $3::uuid, $4, 'high', pg_catalog.now(), true, $5::boolean, $6::jsonb)`,
      [changeoverId, orgId, siteId, `LINE-${changeoverId.slice(0, 8)}`, atp != null, atp == null ? null : JSON.stringify(atp)],
    );
    return changeoverId;
  }

  /** Every certificate written for one changeover, oldest first. */
  async function certificates(changeoverId: string) {
    const result = await ownerPool.query<{
      id: string;
      validation_result: string;
      atp_evidence: unknown;
      cleaning_evidence: { supersedes?: string; attempt?: number; recleaned?: boolean };
      signatures: Array<{ slot?: string }>;
      override_by: string | null;
      override_reason: string | null;
    }>(
      `select id::text, validation_result, atp_evidence, cleaning_evidence, signatures,
              override_by::text, override_reason
         from public.allergen_changeover_validations
        where org_id = $1::uuid and changeover_event_id = $2::uuid
        order by validated_at asc, id asc`,
      [orgId, changeoverId],
    );
    return result.rows;
  }

  /** Creates a cleaned, high-risk changeover carrying `atp` and signs it off. */
  async function certifyWith(atp: unknown): Promise<{ validation_result: string; atp_evidence: unknown }> {
    const changeoverId = await createChangeoverWith(atp);

    const result = await signChangeover({ changeoverId, signature: { password: '1234' } });
    expect(result).toMatchObject({ ok: true });

    const rows = await certificates(changeoverId);
    expect(rows).toHaveLength(1);
    return rows[0];
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

  // ==========================================================================
  // RE-SWAB — the plant's natural recovery: re-clean, new swab, new reading.
  // Before recordChangeoverRetest, changeover_events.atp_result had exactly one
  // writer (createChangeoverEvent INSERT) and zero UPDATEs in the whole repo, so a
  // 'failed' certificate was a dead end with no edit path at all.
  // ==========================================================================

  /** Drives the whole owner scenario: FAIL certified, re-swabbed, PASS certified. */
  async function failThenRetest(retestValue: unknown) {
    const changeoverId = await createChangeoverWith('FAIL');
    expect(await signChangeover({ changeoverId, signature: { password: '1234' } })).toMatchObject({
      ok: true,
    });
    const before = await certificates(changeoverId);
    expect(before).toHaveLength(1);
    expect(before[0].validation_result).toBe('failed');

    const retest = await recordChangeoverRetest({
      changeoverId,
      atpResult: retestValue,
      signature: { password: '1234' },
    });
    return { changeoverId, retest, firstCertificateId: before[0].id };
  }

  it('re-swab clears a failed certificate — and the failed attempt is STILL in the data', async () => {
    const { changeoverId, retest, firstCertificateId } = await failThenRetest('PASS');
    expect(retest).toMatchObject({ ok: true, validationResult: 'passed', attempt: 2 });

    const rows = await certificates(changeoverId);
    // The whole point: the bad attempt was not overwritten, it was superseded.
    expect(rows).toHaveLength(2);
    expect(rows[0].validation_result).toBe('failed');
    expect(rows[0].atp_evidence).toBe('FAIL');
    expect(rows[1].validation_result).toBe('passed');
    expect(rows[1].atp_evidence).toBe('PASS');
    // ...and the new certificate names the one it replaces, so the order is provable.
    expect(rows[1].cleaning_evidence).toMatchObject({
      recleaned: true,
      attempt: 2,
      supersedes: firstCertificateId,
    });
    // V-PROD-08 (>= 2 signatures for high risk) still holds: the original signers
    // carry over and the re-swabber is appended.
    expect(rows[1].signatures.length).toBeGreaterThanOrEqual(3);
    expect(rows[1].signatures.at(-1)).toMatchObject({ slot: 'retest' });

    // The event now shows the current reading; the old one lives on in certificate #1.
    const event = await ownerPool.query<{ atp_result: unknown; atp_required: boolean }>(
      `select atp_result, atp_required from public.changeover_events where id = $1::uuid`,
      [changeoverId],
    );
    expect(event.rows[0]).toMatchObject({ atp_result: 'PASS', atp_required: true });
  });

  it('COUNTER-CONTROL: a re-swab that fails again certifies as failed (not rubber-stamped)', async () => {
    const { changeoverId, retest } = await failThenRetest('41 RLU');
    expect(retest).toMatchObject({ ok: true, validationResult: 'failed' });
    expect((await certificates(changeoverId)).map((row) => row.validation_result)).toEqual([
      'failed',
      'failed',
    ]);
  });

  it('a re-swab without a result, or without a signature, is rejected', async () => {
    const changeoverId = await createChangeoverWith('FAIL');
    await signChangeover({ changeoverId, signature: { password: '1234' } });

    expect(
      await recordChangeoverRetest({ changeoverId, atpResult: '  ', signature: { password: '1234' } }),
    ).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(
      await recordChangeoverRetest({ changeoverId, atpResult: 'PASS', signature: { password: '' } }),
    ).toMatchObject({ ok: false, error: 'invalid_input' });
    // a WRONG secret is rejected by e-sign itself, not silently accepted
    expect(
      await recordChangeoverRetest({ changeoverId, atpResult: 'PASS', signature: { password: '9999' } }),
    ).toMatchObject({ ok: false, error: 'esign_failed' });

    expect(await certificates(changeoverId)).toHaveLength(1);
  });

  // ==========================================================================
  // SUPERVISOR DEVIATION — override_by / override_reason have existed on the
  // certificate since migration 184 and had NO writer anywhere in the repo.
  // ==========================================================================

  async function failedCertificate(): Promise<string> {
    const changeoverId = await createChangeoverWith('FAIL');
    expect(await signChangeover({ changeoverId, signature: { password: '1234' } })).toMatchObject({
      ok: true,
    });
    return changeoverId;
  }

  it('a deviation without a real reason, or without a signature, is rejected', async () => {
    const changeoverId = await failedCertificate();

    for (const reason of ['', '   ', 'ok', 'brak']) {
      expect(
        await overrideChangeoverValidation({ changeoverId, reason, signature: { password: '1234' } }),
        `reason "${reason}" must not be accepted`,
      ).toMatchObject({ ok: false, error: 'invalid_input' });
    }
    expect(
      await overrideChangeoverValidation({
        changeoverId,
        reason: 'Linia zwolniona decyzja kierownika zmiany, produkt bezalergenowy',
        signature: { password: '' },
      }),
    ).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(
      await overrideChangeoverValidation({
        changeoverId,
        reason: 'Linia zwolniona decyzja kierownika zmiany, produkt bezalergenowy',
        signature: { password: '9999' },
      }),
    ).toMatchObject({ ok: false, error: 'esign_failed' });

    const [certificate] = await certificates(changeoverId);
    expect(certificate.override_by).toBeNull();
    expect(certificate.override_reason).toBeNull();
  });

  it('a deviation with a reason and a signature is recorded on the certificate', async () => {
    const changeoverId = await failedCertificate();
    const reason = 'Powtorne mycie potwierdzone wizualnie, wymaz ponowiony na kolejnej zmianie';

    const result = await overrideChangeoverValidation({
      changeoverId,
      reason,
      signature: { password: '1234' },
    });
    expect(result).toMatchObject({ ok: true, overrideBy: userId, overrideReason: reason });
    expect(vi.mocked(signEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'production.changeover.override', reason }),
      expect.anything(),
    );

    const [certificate] = await certificates(changeoverId);
    expect(certificate.override_by).toBe(userId);
    expect(certificate.override_reason).toBe(reason);
    // The verdict is NOT rewritten — the certificate keeps telling the truth about
    // the swab, and now also says who accepted the deviation and why.
    expect(certificate.validation_result).toBe('failed');

    // A second deviation cannot silently replace the first supervisor's reason.
    expect(
      await overrideChangeoverValidation({
        changeoverId,
        reason: 'Druga proba nadpisania cudzego uzasadnienia',
        signature: { password: '1234' },
      }),
    ).toMatchObject({ ok: false, error: 'invalid_state' });
    expect((await certificates(changeoverId))[0].override_reason).toBe(reason);
  });

  it('COUNTER-CONTROL: an operator WITHOUT production.allergen_gate.sign_second is refused', async () => {
    const changeoverId = await failedCertificate();

    // Same org, real user, holds production.changeover.write + sign_first — so the
    // refusal is about the supervisor grant, not about org scope or a missing user.
    const denied = await actingAs(operatorUserId, () =>
      overrideChangeoverValidation({
        changeoverId,
        reason: 'Operator probuje zaakceptowac odstepstwo bez uprawnienia',
        signature: { password: '1234' },
      }),
    );
    expect(denied).toMatchObject({ ok: false, error: 'forbidden' });

    const [certificate] = await certificates(changeoverId);
    expect(certificate.override_by).toBeNull();
    expect(certificate.override_reason).toBeNull();

    // ...and the same operator CAN re-swab (production.changeover.write), proving the
    // denial above is a targeted SoD refusal, not a blanket lockout.
    const retest = await actingAs(operatorUserId, () =>
      recordChangeoverRetest({ changeoverId, atpResult: 'PASS', signature: { password: '1234' } }),
    );
    expect(retest).toMatchObject({ ok: true, validationResult: 'passed' });
  });

  it('a deviation on a PASSING certificate is refused (nothing to deviate from)', async () => {
    const changeoverId = await createChangeoverWith('PASS');
    await signChangeover({ changeoverId, signature: { password: '1234' } });

    expect(
      await overrideChangeoverValidation({
        changeoverId,
        reason: 'Proba odstepstwa od swiadectwa ktore i tak przechodzi',
        signature: { password: '1234' },
      }),
    ).toMatchObject({ ok: false, error: 'invalid_state' });
  });
});
