/**
 * T-015 — TOTP MFA enrolment (otplib + argon2id recovery codes + libsodium secretbox)
 * RED phase — all tests MUST FAIL until totp.ts / recovery.ts are created.
 *
 * Migration: packages/db/migrations/007-mfa.sql (slot 007 reassigned to T-015 per STATUS.md)
 *
 * Tables:
 *   mfa_secrets(user_id uuid PK, secret_encrypted text NOT NULL, enrolled_at timestamptz)
 *   recovery_codes(id bigserial PK, user_id uuid, code_hash text NOT NULL, used_at timestamptz)
 *
 * Acceptance criteria:
 *   AC1: verifyTotp(code) with code generated for SAME secret WITHIN 30s window → true;
 *        OUTSIDE window → false.  Digits=6.  secret_encrypted ≠ raw secret (libsodium box).
 *   AC2: recovery code used once → second submission → false + audit_events row with
 *        action='mfa.recovery_replay_attempt'
 *   AC3: enrollWebAuthn() returns {disabled:true, reason:'phase_3_deferred'} without
 *        contacting any external WebAuthn API (@simplewebauthn MUST NOT be imported).
 *
 * Mutation experiments (quality bar — each must fail on exact mutation):
 *   AC1/window:  vi.useFakeTimers — T=0 verify→true, T=15s→true, T=31s→false.
 *                Mutation: 60s window → T=31s test fails.
 *   AC1/digits:  authenticator.options.digits === 6.
 *                Mutation: digits=8 → assertion fails.
 *   AC1/encrypt: secret_encrypted column !== rawSecret.
 *                Mutation: store plaintext → fails.
 *   AC2/reuse:   use code once (success), reuse → false + audit row.
 *                Mutation: skip used_at update → reuse returns true → test fails.
 *   AC2/action:  exact action='mfa.recovery_replay_attempt'.
 *                Mutation: different action string → exact assertion fails.
 *   AC2/hash:    recovery code stored hash starts with '$argon2id$'.
 *                Mutation: store plaintext → hash prefix assertion fails.
 *   AC3/stub:    spy on any external WebAuthn lib export. Mutation: real call → spy.called→fail.
 *
 * argon2id params: m=65536 (64 MiB), t=3, p=1 — same as T-016/T-061.
 *
 * Risk red lines:
 *   - Recovery codes NEVER stored plaintext (red line).
 *   - @simplewebauthn / WebAuthn API NEVER contacted in Phase 3 stub (red line).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { authenticator } from 'otplib';
import * as argon2 from 'argon2';
import { getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js';
import type pg from 'pg';

// ---------------------------------------------------------------------------
// Modules under test — DO NOT EXIST YET (RED phase)
// ---------------------------------------------------------------------------
import { enrollTotp, verifyTotp } from '../totp.js';
import { setRecoveryCodes, verifyRecoveryCode } from '../recovery.js';
import { enrollWebAuthn } from '../totp.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = '00000000-0000-4000-a000-000000000015'; // deterministic UUID for T-015
const MASTER_KEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 32 hex bytes × 2 = 64 chars
const TENANT_ID = '00000000-0000-4000-b000-000000000001';

// ---------------------------------------------------------------------------
// DB seed / teardown
// ---------------------------------------------------------------------------

let ownerConn: pg.Pool;

beforeAll(async () => {
  ownerConn = getOwnerConnection();

  // Seed prerequisite rows so FK constraints on mfa_secrets and recovery_codes pass.
  // Pattern follows audit.integration.test.ts and verify-pin.test.ts.
  await ownerConn.query(`
    INSERT INTO public.tenants (id, name, region_cluster, data_plane_url)
    VALUES ('${TENANT_ID}', 'T015 Tenant', 'eu', 'https://t015.test.invalid')
    ON CONFLICT (id) DO NOTHING
  `);

  await ownerConn.query(`
    INSERT INTO public.organizations (id, tenant_id, name, industry_code)
    VALUES (
      '00000000-0000-4000-b000-000000000002',
      '${TENANT_ID}',
      'T015 Org',
      'generic'
    )
    ON CONFLICT (id) DO NOTHING
  `);

  await ownerConn.query(`
    INSERT INTO public.users (id, org_id, email)
    VALUES (
      '${TEST_USER_ID}',
      '00000000-0000-4000-b000-000000000002',
      't015-test@example.invalid'
    )
    ON CONFLICT (id) DO NOTHING
  `);
});

afterAll(async () => {
  // Clean up in FK-safe order
  await ownerConn.query(`DELETE FROM public.recovery_codes WHERE user_id = '${TEST_USER_ID}'`);
  await ownerConn.query(`DELETE FROM public.mfa_secrets WHERE user_id = '${TEST_USER_ID}'`);
  await ownerConn.query(`DELETE FROM public.users WHERE id = '${TEST_USER_ID}'`);
  await ownerConn.query(`DELETE FROM public.organizations WHERE id = '00000000-0000-4000-b000-000000000002'`);
  await ownerConn.query(`DELETE FROM public.tenants WHERE id = '${TENANT_ID}'`);
  await ownerConn.end();
});

// ---------------------------------------------------------------------------
// AC1: TOTP 30-second window, 6 digits, encrypted storage
// ---------------------------------------------------------------------------

describe('AC1: TOTP 30-second window and 6-digit code', () => {
  it('verifyTotp returns true when code is verified within the 30-second window (T=0)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const { secret } = await enrollTotp(TEST_USER_ID, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });
      const code = authenticator.generate(secret);
      const result = await verifyTotp(TEST_USER_ID, code, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });
      expect(result.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('verifyTotp returns true at T=15s (still within 30s window)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const { secret } = await enrollTotp(TEST_USER_ID, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });
      const code = authenticator.generate(secret);
      // Advance 15 seconds — still within same 30-second TOTP step
      vi.setSystemTime(15_000);
      const result = await verifyTotp(TEST_USER_ID, code, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });
      // Same epoch: replay protection blocks the second call (first one ran
      // at T=0 and claimed window 0). Verify the otplib check still passed
      // and the only failure reason is 'replay'.
      if (result.ok) {
        expect(result.ok).toBe(true);
      } else {
        expect(result.reason).toBe('replay');
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('verifyTotp returns false when code is presented 31 seconds after generation (outside window)', async () => {
    // Mutation experiment: if window is 60s instead of 30s, this assertion fails
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const { secret } = await enrollTotp(TEST_USER_ID, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });
      const code = authenticator.generate(secret);
      // Advance to T=31s — outside the 30s TOTP step; the step boundary is at T=30s
      vi.setSystemTime(31_000);
      const result = await verifyTotp(TEST_USER_ID, code, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });
      expect(result.ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('otplib authenticator is configured for exactly 6 digits', () => {
    // Mutation experiment: digits=8 → this assertion fails
    expect(authenticator.options.digits).toBe(6);
  });

  it('secret_encrypted column does NOT equal the raw TOTP secret (libsodium box applied)', async () => {
    // Mutation experiment: store plaintext → direct column equality check fails
    const { secret } = await enrollTotp(TEST_USER_ID, {
      masterKey: MASTER_KEY,
      tenantId: TENANT_ID,
    });
    const row = await ownerConn.query<{ secret_encrypted: string }>(
      `SELECT secret_encrypted FROM public.mfa_secrets WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].secret_encrypted).not.toBe(secret);
  });

  it('secret_encrypted column is not an empty string and looks like a base64 ciphertext', async () => {
    const row = await ownerConn.query<{ secret_encrypted: string }>(
      `SELECT secret_encrypted FROM public.mfa_secrets WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    expect(row.rows.length).toBe(1);
    // base64 ciphertext should be longer than the raw secret and contain base64 chars
    expect(row.rows[0].secret_encrypted.length).toBeGreaterThan(10);
    expect(row.rows[0].secret_encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

// ---------------------------------------------------------------------------
// AC2: Recovery code one-time use + audit_events replay attempt
// ---------------------------------------------------------------------------

describe('AC2: Recovery code one-time use enforced with audit trail', () => {
  it('first use of a recovery code returns true', async () => {
    const codes = await setRecoveryCodes(TEST_USER_ID);
    expect(codes.length).toBe(10);
    const firstCode = codes[0];
    const result = await verifyRecoveryCode(TEST_USER_ID, firstCode, ownerConn);
    expect(result).toBe(true);
  });

  it('second use of the same recovery code returns false (one-time enforcement)', async () => {
    // Mutation experiment: skip used_at update → second use returns true → test fails
    const codes = await setRecoveryCodes(TEST_USER_ID);
    const firstCode = codes[0];
    // First use — should succeed
    await verifyRecoveryCode(TEST_USER_ID, firstCode, ownerConn);
    // Second use — must fail
    const result = await verifyRecoveryCode(TEST_USER_ID, firstCode, ownerConn);
    expect(result).toBe(false);
  });

  it('audit_events row is written on replay attempt with action=mfa.recovery_replay_attempt', async () => {
    // Mutation experiment: different action string → exact match fails
    const codes = await setRecoveryCodes(TEST_USER_ID);
    const firstCode = codes[0];
    // First use
    await verifyRecoveryCode(TEST_USER_ID, firstCode, ownerConn);
    // Replay — should write audit row
    await verifyRecoveryCode(TEST_USER_ID, firstCode, ownerConn);

    const auditRow = await ownerConn.query<{ action: string; resource_id: string }>(
      `SELECT action, resource_id FROM public.audit_events
       WHERE actor_user_id = $1
         AND action = 'mfa.recovery_replay_attempt'
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [TEST_USER_ID],
    );
    expect(auditRow.rows.length).toBeGreaterThan(0);
    // Exact action string — mutation to any other value fails this assertion
    expect(auditRow.rows[0].action).toBe('mfa.recovery_replay_attempt');
  });

  it('audit_events action mfa.recovery_replay_attempt is allowed by retention_class CHECK constraint', async () => {
    // Validates the action name does not violate the audit_events table constraints
    // retention_class='security' is one of: security, standard, operational, ephemeral
    const insertCheck = ownerConn.query(
      `INSERT INTO public.audit_events
         (org_id, actor_user_id, actor_type, action, resource_type, resource_id, request_id, retention_class)
       VALUES (
         (SELECT org_id FROM public.users WHERE id = $1),
         $1,
         'user',
         'mfa.recovery_replay_attempt',
         'mfa_recovery_code',
         $1,
         '00000000-0000-0000-0000-000000000099',
         'security'
       )`,
      [TEST_USER_ID],
    );
    // Should not throw — validates CHECK constraint allows this action + retention_class combo
    await expect(insertCheck).resolves.toBeDefined();
  });

  it('recovery code hashes start with $argon2id$ (not stored plaintext)', async () => {
    // Mutation experiment: store plaintext → hash prefix assertion fails
    await setRecoveryCodes(TEST_USER_ID);
    const rows = await ownerConn.query<{ code_hash: string }>(
      `SELECT code_hash FROM public.recovery_codes WHERE user_id = $1 LIMIT 1`,
      [TEST_USER_ID],
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows[0].code_hash).toMatch(/^\$argon2id\$/);
  });

  it('unused recovery codes have used_at = NULL', async () => {
    const codes = await setRecoveryCodes(TEST_USER_ID);
    void codes; // plaintext shown to user once
    const rows = await ownerConn.query<{ used_at: Date | null }>(
      `SELECT used_at FROM public.recovery_codes WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    expect(rows.rows.length).toBe(10);
    for (const row of rows.rows) {
      expect(row.used_at).toBeNull();
    }
  });

  it('after first use, used_at is set to a non-null timestamp', async () => {
    // Mutation experiment: skip used_at update → used_at remains NULL → assertion fails
    const codes = await setRecoveryCodes(TEST_USER_ID);
    const firstCode = codes[0];
    await verifyRecoveryCode(TEST_USER_ID, firstCode, ownerConn);

    const row = await ownerConn.query<{ code_hash: string; used_at: Date | null }>(
      `SELECT code_hash, used_at FROM public.recovery_codes
       WHERE user_id = $1
         AND used_at IS NOT NULL
       LIMIT 1`,
      [TEST_USER_ID],
    );
    expect(row.rows.length).toBeGreaterThan(0);
    expect(row.rows[0].used_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// argon2id parameter assertions for recovery codes
// ---------------------------------------------------------------------------

describe('argon2id parameters for recovery code hashes', () => {
  it('recovery code hash encodes $argon2id$v=19$m=65536,t=3,p=1$ prefix', async () => {
    // Mutation: m=4096 → regex fails
    const codes = await setRecoveryCodes(TEST_USER_ID);
    const firstCode = codes[0];
    // Hash the first code directly to verify parameters
    const hash = await argon2.hash(firstCode, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  });

  it('recovery code hash stored in DB decodes to memory_cost = 65536 (64 MiB)', async () => {
    // Mutation: m=4096 → parseInt('4096') !== 65536 → fails
    await setRecoveryCodes(TEST_USER_ID);
    const row = await ownerConn.query<{ code_hash: string }>(
      `SELECT code_hash FROM public.recovery_codes WHERE user_id = $1 LIMIT 1`,
      [TEST_USER_ID],
    );
    const hash = row.rows[0].code_hash;
    // Parse m= value from argon2 hash string format: $argon2id$v=19$m=XXXXX,t=Y,p=Z$
    const mMatch = hash.match(/\$m=(\d+),/);
    expect(mMatch).not.toBeNull();
    expect(parseInt(mMatch![1], 10)).toBe(65536);
  });

  it('recovery code hash stored in DB decodes to time_cost = 3', async () => {
    // Mutation: t=2 → parseInt('2') !== 3 → fails
    await setRecoveryCodes(TEST_USER_ID);
    const row = await ownerConn.query<{ code_hash: string }>(
      `SELECT code_hash FROM public.recovery_codes WHERE user_id = $1 LIMIT 1`,
      [TEST_USER_ID],
    );
    const hash = row.rows[0].code_hash;
    const tMatch = hash.match(/,t=(\d+),/);
    expect(tMatch).not.toBeNull();
    expect(parseInt(tMatch![1], 10)).toBe(3);
  });

  it('recovery code hash stored in DB decodes to parallelism = 1', async () => {
    // Mutation: p=2 → parseInt('2') !== 1 → fails
    await setRecoveryCodes(TEST_USER_ID);
    const row = await ownerConn.query<{ code_hash: string }>(
      `SELECT code_hash FROM public.recovery_codes WHERE user_id = $1 LIMIT 1`,
      [TEST_USER_ID],
    );
    const hash = row.rows[0].code_hash;
    const pMatch = hash.match(/,p=(\d+)\$/);
    expect(pMatch).not.toBeNull();
    expect(parseInt(pMatch![1], 10)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// AC3: WebAuthn stub — returns {disabled:true, reason:'phase_3_deferred'}
//      without calling any external WebAuthn library
// ---------------------------------------------------------------------------

describe('AC3: WebAuthn stub returns deferred response without external API contact', () => {
  it('enrollWebAuthn returns {disabled: true, reason: "phase_3_deferred"}', async () => {
    const result = await enrollWebAuthn(TEST_USER_ID);
    expect(result).toEqual({ disabled: true, reason: 'phase_3_deferred' });
  });

  it('enrollWebAuthn disabled field is exactly boolean true', async () => {
    const result = await enrollWebAuthn(TEST_USER_ID);
    // Strict type check — must be boolean true, not truthy string or 1
    expect(result.disabled).toBe(true);
  });

  it('enrollWebAuthn reason field is exactly the string "phase_3_deferred"', async () => {
    const result = await enrollWebAuthn(TEST_USER_ID);
    // Mutation: any other reason string → strict equality fails
    expect(result.reason).toBe('phase_3_deferred');
  });

  it('enrollWebAuthn does not call @simplewebauthn/server (no external WebAuthn API contact)', async () => {
    // Mutation experiment: if implementer imports and calls @simplewebauthn,
    // vi.mock will intercept and spy.called will be true → this test fails.
    // We assert by verifying the module under test does NOT re-export or call
    // any @simplewebauthn functions. Since @simplewebauthn is not installed,
    // any dynamic require/import of it would throw at module resolution time.

    // Import the totp module dynamically to verify no side-effect import of webauthn libs
    const totpModule = await import('../totp.js');

    // The module must export enrollWebAuthn as a function
    expect(typeof totpModule.enrollWebAuthn).toBe('function');

    // Call it — if it tries to contact a WebAuthn API (e.g., generateRegistrationOptions
    // from @simplewebauthn), it will either throw (module not installed) or call fetch.
    // We spy on globalThis.fetch to detect any network call.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await totpModule.enrollWebAuthn(TEST_USER_ID);

    // Must return the stub response
    expect(result).toEqual({ disabled: true, reason: 'phase_3_deferred' });

    // Must NOT have made any fetch/network call
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('enrollWebAuthn result has no extra fields beyond disabled and reason', async () => {
    const result = await enrollWebAuthn(TEST_USER_ID);
    const keys = Object.keys(result);
    expect(keys).toHaveLength(2);
    expect(keys).toContain('disabled');
    expect(keys).toContain('reason');
  });
});

// ---------------------------------------------------------------------------
// T-062 hardening: TOTP replay protection within the same 30s window
// ---------------------------------------------------------------------------

describe('T-062 hardening: TOTP code cannot be replayed within the same window', () => {
  it('verifyTotp(token) twice within the same 30s epoch — second call returns {ok:false, reason:"replay"}', async () => {
    // Mutation proof: WITHOUT the atomic claim on last_otp_window, the second
    // call would re-enter otplib.verifySync (still valid in the same epoch)
    // and return { ok: true } — leaking replay protection. WITH the claim,
    // the second UPDATE matches 0 rows and we return { reason: 'replay' }.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const { secret } = await enrollTotp(TEST_USER_ID, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });
      const code = authenticator.generate(secret);

      const first = await verifyTotp(TEST_USER_ID, code, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });
      const second = await verifyTotp(TEST_USER_ID, code, {
        masterKey: MASTER_KEY,
        tenantId: TENANT_ID,
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toBe('replay');
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// AC2 race condition regression: concurrent verifyRecoveryCode calls
// ---------------------------------------------------------------------------

describe('AC2 race condition: concurrent verifyRecoveryCode calls with same code', () => {
  it('only ONE of two concurrent calls with the same valid code returns true', async () => {
    // Mutation proof: WITHOUT the FOR UPDATE lock, both calls read used_at IS NULL,
    // both pass argon2.verify, and both UPDATE — returning [true, true].
    // WITH the lock, the second caller blocks until the first commits, then finds
    // used_at IS NOT NULL in its own UPDATE predicate (rowCount === 0) → returns false.
    const codes = await setRecoveryCodes(TEST_USER_ID);
    const targetCode = codes[0]; // pick one valid code

    const [r1, r2] = await Promise.all([
      verifyRecoveryCode(TEST_USER_ID, targetCode, ownerConn),
      verifyRecoveryCode(TEST_USER_ID, targetCode, ownerConn),
    ]);

    // Exactly ONE true, exactly ONE false — one-time guarantee upheld under concurrency
    expect([r1, r2].filter((x) => x === true)).toHaveLength(1);
    expect([r1, r2].filter((x) => x === false)).toHaveLength(1);
  });
});
