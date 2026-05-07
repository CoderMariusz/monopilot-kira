/**
 * T-016 — Verify-PIN step-up auth (argon2id) — RED phase tests
 *
 * Migration: packages/db/migrations/019-pins.sql (NOT 008 — 008 reserved for T-013 SCIM Wave C)
 * Table: user_pins(user_id uuid PK, pin_hash text, attempts_count int, locked_until timestamptz, last_attempt_at timestamptz)
 *
 * Acceptance criteria:
 * AC1: setPin(userId, pin) → verifyPin same plaintext → true; DB stores ONLY argon2id hash
 *      ($argon2id$ prefix assertion via direct SELECT)
 * AC2: 5 wrong attempts in 10-min window → 6th returns 'locked'; locked_until = now+15min
 *      Exactly 5 failures → NOT locked; 6th → locked. Duration window: [14min, 16min].
 * AC3: Hash parameters encoded in hash string: m=65536, t=3, p=1 (parsed from $argon2id$ format)
 *
 * Implicit AC4: after locked_until expires (15 min via fake timers), attempts_count resets,
 *               valid PIN returns true again.
 *
 * Mutation experiments (documented per quality bar):
 * - AC1 mutation: store plaintext PIN → fails on $argon2id$ prefix assertion
 * - AC2 mutation: hardcode 'locked' always → fails because 4th wrong attempt must NOT lock
 * - AC2 mutation: hardcode locked=never → fails because 6th attempt must return 'locked'
 * - AC2 mutation: lockout 5min instead of 15min → fails on locked_until - now < 14min check
 * - AC3 mutation: argon2id m=4096 → fails on parsed m=65536
 *
 * Risk red lines:
 * - PIN NEVER stored plaintext or reversible encryption
 * - Lockout enforced server-side only
 * - No PIN reset UI coupling (server-side library only)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { getOwnerConnection, getAppConnection } from '@monopilot/db/test-utils/test-pool.js';
import type pg from 'pg';

// The module under test — does NOT exist yet (RED phase)
import { setPin, verifyPin } from '../verify-pin.js';

// ---------------------------------------------------------------------------
// DB guard — skip all integration tests when no DATABASE_URL is configured
// ---------------------------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
const skipIfNoDb = databaseUrl ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_USER_ID = '00000000-0000-4000-a000-000000000016'; // deterministic UUID for T-016
const VALID_PIN = '123456';
const WRONG_PIN = '000000';

// ---------------------------------------------------------------------------
// DB helpers: apply migration + seed user before tests, tear down after
// ---------------------------------------------------------------------------

let ownerConn: pg.Pool;
let appConn: pg.Pool;

beforeAll(async () => {
  if (!databaseUrl) return;
  ownerConn = await getOwnerConnection();
  appConn = await getAppConnection();

  // Apply migration 019-pins.sql via owner connection (DDL)
  // The migration file does not exist yet (created in GREEN) — the test referencing the
  // schema-level objects will fail with relation-not-found in RED, which is correct.
  //
  // Seed a tenant + org + user row so FK constraints satisfy.
  // Use owner connection for DDL; app connection for DML assertions.
  await ownerConn.query(`
    DO $$
    BEGIN
      -- Minimal seed: insert test tenant, org, user if not present
      INSERT INTO public.tenants (id, name, region_cluster, data_plane_url)
        VALUES ('00000000-0000-4000-b000-000000000016', 't016-tenant', 'eu', 'https://t016.test.invalid')
        ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.organizations (id, tenant_id, name, industry_code)
        VALUES (
          '00000000-0000-4000-c000-000000000016',
          '00000000-0000-4000-b000-000000000016',
          'T016 Org', 'generic'
        )
        ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.users (id, org_id, email)
        VALUES (
          '00000000-0000-4000-a000-000000000016',
          '00000000-0000-4000-c000-000000000016',
          'pin-test-user@t016.test'
        )
        ON CONFLICT (id) DO NOTHING;
    END
    $$;
  `);
});

afterAll(async () => {
  vi.useRealTimers();
  if (!ownerConn) return;
  // Clean up test data via owner connection
  await ownerConn.query(
    `DELETE FROM public.user_pins WHERE user_id = $1`,
    [TEST_USER_ID],
  );
  await ownerConn.query(
    `DELETE FROM public.users WHERE id = $1`,
    [TEST_USER_ID],
  );
});

beforeEach(async () => {
  vi.useRealTimers();
  if (!ownerConn) return;
  // Reset pin state between tests
  await ownerConn.query(
    `DELETE FROM public.user_pins WHERE user_id = $1`,
    [TEST_USER_ID],
  );
});

// ---------------------------------------------------------------------------
// AC1 — setPin / verifyPin round-trip + argon2id hash stored (no plaintext)
// ---------------------------------------------------------------------------

skipIfNoDb('AC1: setPin stores argon2id hash; verifyPin returns true for correct PIN', () => {
  it('verifyPin returns true when called with the same plaintext PIN used in setPin', async () => {
    await setPin(TEST_USER_ID, VALID_PIN);
    const result = await verifyPin(TEST_USER_ID, VALID_PIN);
    expect(result).toBe(true);
  });

  it('verifyPin returns false for an incorrect PIN', async () => {
    await setPin(TEST_USER_ID, VALID_PIN);
    const result = await verifyPin(TEST_USER_ID, WRONG_PIN);
    expect(result).toBe(false);
  });

  it('DB stores ONLY the argon2id hash — no plaintext PIN in user_pins.pin_hash', async () => {
    await setPin(TEST_USER_ID, VALID_PIN);

    // Direct SELECT via app connection proves no plaintext was persisted
    const { rows } = await appConn.query<{ pin_hash: string }>(
      `SELECT pin_hash FROM public.user_pins WHERE user_id = $1`,
      [TEST_USER_ID],
    );

    expect(rows).toHaveLength(1);
    // AC1 mutation guard: if implementation stores plaintext this assertion fails
    expect(rows[0].pin_hash).toMatch(/^\$argon2id\$/);
  });

  it('pin_hash column does NOT equal the plaintext PIN', async () => {
    await setPin(TEST_USER_ID, VALID_PIN);

    const { rows } = await appConn.query<{ pin_hash: string }>(
      `SELECT pin_hash FROM public.user_pins WHERE user_id = $1`,
      [TEST_USER_ID],
    );

    expect(rows[0].pin_hash).not.toBe(VALID_PIN);
  });
});

// ---------------------------------------------------------------------------
// AC2 — Lockout policy: 5 wrong attempts in 10 min → 6th returns 'locked'
// ---------------------------------------------------------------------------

skipIfNoDb('AC2: 5 wrong attempts in 10-minute window → 6th attempt returns locked with locked_until +15 min', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Set PIN fresh for each lockout test
    await setPin(TEST_USER_ID, VALID_PIN);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('4 wrong attempts do NOT trigger lockout (below threshold)', async () => {
    for (let i = 0; i < 4; i++) {
      const result = await verifyPin(TEST_USER_ID, WRONG_PIN);
      // Must return false (not 'locked') — mutation guard: hardcode-locked-always fails here
      expect(result).toBe(false);
    }
  });

  it('exactly 5 wrong attempts do NOT yet lock the account', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await verifyPin(TEST_USER_ID, WRONG_PIN);
      // 5th attempt itself should not return 'locked' — lockout triggers on the 6th
      expect(result).toBe(false);
    }
  });

  it('6th wrong attempt within 10-minute window returns exactly "locked"', async () => {
    for (let i = 0; i < 5; i++) {
      await verifyPin(TEST_USER_ID, WRONG_PIN);
    }
    const result = await verifyPin(TEST_USER_ID, WRONG_PIN);
    // Exact string match — toBeDefined() is forbidden per quality bar
    // Mutation guard: hardcode-never-locked fails here
    expect(result).toBe('locked');
  });

  it('locked_until is set approximately 15 minutes ahead (between 14 and 16 minutes from now)', async () => {
    const beforeLockMs = Date.now();

    for (let i = 0; i < 6; i++) {
      await verifyPin(TEST_USER_ID, WRONG_PIN);
    }

    const { rows } = await ownerConn.query<{ locked_until: Date }>(
      `SELECT locked_until FROM public.user_pins WHERE user_id = $1`,
      [TEST_USER_ID],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].locked_until).not.toBeNull();

    const lockedUntilMs = rows[0].locked_until.getTime();
    const diffMinutes = (lockedUntilMs - beforeLockMs) / 1000 / 60;

    // Mutation guard: 5-min lockout → diffMinutes ≈ 5, fails < 14 check
    expect(diffMinutes).toBeGreaterThan(14);
    expect(diffMinutes).toBeLessThan(16);
  });

  it('subsequent attempts after 6th also return "locked" while locked_until is in the future', async () => {
    for (let i = 0; i < 6; i++) {
      await verifyPin(TEST_USER_ID, WRONG_PIN);
    }
    // 7th attempt: still locked
    const result = await verifyPin(TEST_USER_ID, WRONG_PIN);
    expect(result).toBe('locked');
  });

  it('correct PIN after lockout returns "locked" (not true) while lock is active', async () => {
    for (let i = 0; i < 6; i++) {
      await verifyPin(TEST_USER_ID, WRONG_PIN);
    }
    // Even the correct PIN must return 'locked' while the lock is in effect
    const result = await verifyPin(TEST_USER_ID, VALID_PIN);
    expect(result).toBe('locked');
  });

  it('5 wrong attempts outside the 10-minute window do NOT trigger lockout (window resets)', async () => {
    // Make 5 failed attempts, then advance time past the 10-minute window
    for (let i = 0; i < 5; i++) {
      await verifyPin(TEST_USER_ID, WRONG_PIN);
    }

    // Advance fake time by 11 minutes — outside the counting window
    vi.advanceTimersByTime(11 * 60 * 1000);

    // A 6th attempt in the NEW window should NOT be locked (only 1 attempt in new window)
    const result = await verifyPin(TEST_USER_ID, WRONG_PIN);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC3 — argon2id hash parameters: m=65536, t=3, p=1
// ---------------------------------------------------------------------------

skipIfNoDb('AC3: argon2id hash parameters m=65536 (64MiB), t=3, p=1', () => {
  it('stored hash encodes $argon2id$ variant, v=19, m=65536, t=3, p=1', async () => {
    await setPin(TEST_USER_ID, VALID_PIN);

    const { rows } = await appConn.query<{ pin_hash: string }>(
      `SELECT pin_hash FROM public.user_pins WHERE user_id = $1`,
      [TEST_USER_ID],
    );

    const hash = rows[0].pin_hash;

    // Format: $argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>
    // Mutation guard: m=4096 → regex fails on m=65536 segment
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  });

  it('parsed memory_cost equals 65536 (64 MiB)', async () => {
    await setPin(TEST_USER_ID, VALID_PIN);

    const { rows } = await appConn.query<{ pin_hash: string }>(
      `SELECT pin_hash FROM public.user_pins WHERE user_id = $1`,
      [TEST_USER_ID],
    );

    const hash = rows[0].pin_hash;
    const mMatch = hash.match(/\$m=(\d+)/);
    expect(mMatch).not.toBeNull();
    // Mutation guard: m=4096 → parseInt('4096') !== 65536
    expect(parseInt(mMatch![1], 10)).toBe(65536);
  });

  it('parsed time_cost equals 3', async () => {
    await setPin(TEST_USER_ID, VALID_PIN);

    const { rows } = await appConn.query<{ pin_hash: string }>(
      `SELECT pin_hash FROM public.user_pins WHERE user_id = $1`,
      [TEST_USER_ID],
    );

    const hash = rows[0].pin_hash;
    const tMatch = hash.match(/,t=(\d+)/);
    expect(tMatch).not.toBeNull();
    expect(parseInt(tMatch![1], 10)).toBe(3);
  });

  it('parsed parallelism equals 1', async () => {
    await setPin(TEST_USER_ID, VALID_PIN);

    const { rows } = await appConn.query<{ pin_hash: string }>(
      `SELECT pin_hash FROM public.user_pins WHERE user_id = $1`,
      [TEST_USER_ID],
    );

    const hash = rows[0].pin_hash;
    const pMatch = hash.match(/,p=(\d+)/);
    expect(pMatch).not.toBeNull();
    expect(parseInt(pMatch![1], 10)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Implicit AC4 — Lockout recovery: after 15 min, lock expires + valid PIN works
// ---------------------------------------------------------------------------

skipIfNoDb('lockout unlock after 15 min', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await setPin(TEST_USER_ID, VALID_PIN);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('after locked_until expires (15 min via fake timers), valid PIN returns true', async () => {
    // Trigger lockout
    for (let i = 0; i < 6; i++) {
      await verifyPin(TEST_USER_ID, WRONG_PIN);
    }

    // Confirm locked
    const lockedResult = await verifyPin(TEST_USER_ID, VALID_PIN);
    expect(lockedResult).toBe('locked');

    // Advance fake time past the 15-minute lockout window
    vi.advanceTimersByTime(16 * 60 * 1000);

    // Lock should have expired — correct PIN now returns true
    const unlockedResult = await verifyPin(TEST_USER_ID, VALID_PIN);
    expect(unlockedResult).toBe(true);
  });

  it('after lockout expires, attempts_count resets so a fresh 5-failure window applies', async () => {
    // Trigger lockout
    for (let i = 0; i < 6; i++) {
      await verifyPin(TEST_USER_ID, WRONG_PIN);
    }

    // Advance past lockout
    vi.advanceTimersByTime(16 * 60 * 1000);

    // Fresh window: 5 wrong attempts should NOT lock again immediately
    for (let i = 0; i < 5; i++) {
      const result = await verifyPin(TEST_USER_ID, WRONG_PIN);
      expect(result).toBe(false);
    }
  });

  it('wrong PIN just before lock expires still returns "locked"', async () => {
    // Trigger lockout
    for (let i = 0; i < 6; i++) {
      await verifyPin(TEST_USER_ID, WRONG_PIN);
    }

    // Advance to just before the lock expires (14 min)
    vi.advanceTimersByTime(14 * 60 * 1000);

    const result = await verifyPin(TEST_USER_ID, WRONG_PIN);
    expect(result).toBe('locked');
  });
});
