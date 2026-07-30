/**
 * Direct test of the scanner authorization gate — NO mocks.
 *
 * `requireScannerSession` is the single auth gate in front of all 14 scanner
 * routes, and every one of those route tests mocks it away (correctly — a route
 * test isolates the route). The consequence was that mutating the gate itself
 * (401 -> 200, inverted token precedence) left the route suites fully green:
 * the gate's own logic was covered nowhere.
 *
 * So this file imports the real module and runs it against a real database:
 * real sha256 token hashing, real `expires_at > now()`, real audit insert. Both
 * directions are asserted everywhere — a refusal must refuse AND a valid token
 * must reach the handler.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '@monopilot/db/clients.js';

import { requireScannerSession } from '../guard';
import { hashScannerToken } from '../session';

import type { NextRequest } from 'next/server';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const orgId = randomUUID();
const userId = randomUUID();

/** The gate only reads `request.headers`, so a plain Request is enough. */
function request(authorization?: string): NextRequest {
  return new Request('https://scanner.test/api/scanner/context', {
    headers: authorization ? { authorization } : {},
  }) as unknown as NextRequest;
}

runPg('requireScannerSession — real gate, real database', () => {
  let pool: pg.Pool;

  const validToken = `valid-${randomUUID()}`;
  const otherToken = `other-${randomUUID()}`;
  const expiredToken = `expired-${randomUUID()}`;
  const unknownToken = `never-issued-${randomUUID()}`;

  let validSessionId = '';
  let otherSessionId = '';
  let expiredSessionId = '';

  async function seedSession(token: string, expiresAt: Date): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.scanner_sessions
         (org_id, user_id, mode, session_token_hash, expires_at)
       values ($1::uuid, $2::uuid, 'personal', $3, $4::timestamptz)
       returning id`,
      [orgId, userId, hashScannerToken(token), expiresAt.toISOString()],
    );
    return rows[0]!.id;
  }

  async function auditRows(operation: string) {
    const { rows } = await pool.query<{ session_id: string | null; result_code: string | null }>(
      `select session_id::text as session_id, result_code
         from public.scanner_audit_log
        where org_id = $1::uuid and operation = $2`,
      [orgId, operation],
    );
    return rows;
  }

  beforeAll(async () => {
    pool = getOwnerConnection();
    const hourAhead = new Date(Date.now() + 60 * 60 * 1000);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    validSessionId = await seedSession(validToken, hourAhead);
    otherSessionId = await seedSession(otherToken, hourAhead);
    expiredSessionId = await seedSession(expiredToken, hourAgo);
  });

  afterAll(async () => {
    await pool
      ?.query('delete from public.scanner_audit_log where org_id = $1::uuid', [orgId])
      .catch(() => undefined);
    await pool
      ?.query('delete from public.scanner_sessions where org_id = $1::uuid', [orgId])
      .catch(() => undefined);
    await pool?.end();
  });

  it('refuses a request with no token anywhere and never reaches the handler', async () => {
    let handlerRan = false;
    const result = await requireScannerSession(request(), {}, 'scanner.test.no-token', async () => {
      handlerRan = true;
      return 'handler-value';
    });

    expect(result).toEqual({ guardError: true, status: 401, error: 'missing_token' });
    expect(handlerRan).toBe(false);
  });

  it('refuses a token that was never issued', async () => {
    let handlerRan = false;
    const result = await requireScannerSession(
      request(`Bearer ${unknownToken}`),
      {},
      'scanner.test.unknown',
      async () => {
        handlerRan = true;
        return 'handler-value';
      },
    );

    expect(result).toEqual({ guardError: true, status: 401, error: 'invalid_session' });
    expect(handlerRan).toBe(false);
    // No session row carries that hash, so there is nothing to audit.
    expect(await auditRows('scanner.test.unknown')).toEqual([]);
  });

  it('refuses an expired session and audits the refusal against that session', async () => {
    let handlerRan = false;
    const result = await requireScannerSession(
      request(`Bearer ${expiredToken}`),
      {},
      'scanner.test.expired',
      async () => {
        handlerRan = true;
        return 'handler-value';
      },
    );

    expect(result).toEqual({ guardError: true, status: 401, error: 'invalid_session' });
    expect(handlerRan).toBe(false);
    expect(await auditRows('scanner.test.expired')).toEqual([
      { session_id: expiredSessionId, result_code: 'invalid_session' },
    ]);
  });

  it('admits a live session from the Authorization header and hands it to the handler', async () => {
    const result = await requireScannerSession(
      request(`Bearer ${validToken}`),
      {},
      'scanner.test.header-ok',
      async (ctx) => ({
        sessionId: ctx.session.id,
        orgId: ctx.session.org_id,
        token: ctx.token,
      }),
    );

    expect(result).toEqual({ sessionId: validSessionId, orgId, token: validToken });
    // A pass must not leave a failure audit behind.
    expect(await auditRows('scanner.test.header-ok')).toEqual([]);
  });

  it('accepts the header case-insensitively and with padding, but not a non-Bearer scheme', async () => {
    const loose = await requireScannerSession(
      request(`  bearer   ${validToken}  `),
      {},
      'scanner.test.loose-header',
      async (ctx) => ctx.session.id,
    );
    expect(loose).toBe(validSessionId);

    // A non-Bearer scheme is not a token: with no body token this is missing_token,
    // never a silent fallback to treating the whole header as the secret.
    const wrongScheme = await requireScannerSession(
      request(`Token ${validToken}`),
      {},
      'scanner.test.wrong-scheme',
      async (ctx) => ctx.session.id,
    );
    expect(wrongScheme).toEqual({ guardError: true, status: 401, error: 'missing_token' });
  });

  it('falls back to the body token when no Authorization header is present', async () => {
    const result = await requireScannerSession(
      request(),
      { token: validToken },
      'scanner.test.body-ok',
      async (ctx) => ctx.session.id,
    );

    expect(result).toBe(validSessionId);
  });

  it('lets the header win over the body when both carry a token', async () => {
    const result = await requireScannerSession(
      request(`Bearer ${otherToken}`),
      { token: validToken },
      'scanner.test.precedence',
      async (ctx) => ctx.session.id,
    );

    // Inverting precedence to `bodyToken ?? header` would return validSessionId.
    expect(result).toBe(otherSessionId);
    expect(result).not.toBe(validSessionId);
  });

  it('does not let a body token rescue a bad Authorization header', async () => {
    let handlerRan = false;
    const result = await requireScannerSession(
      request(`Bearer ${unknownToken}`),
      { token: validToken },
      'scanner.test.no-rescue',
      async () => {
        handlerRan = true;
        return 'handler-value';
      },
    );

    expect(result).toEqual({ guardError: true, status: 401, error: 'invalid_session' });
    expect(handlerRan).toBe(false);
  });

  it('ignores a non-string body token instead of coercing it', async () => {
    const result = await requireScannerSession(
      request(),
      { token: 12345 },
      'scanner.test.non-string-body',
      async (ctx) => ctx.session.id,
    );

    expect(result).toEqual({ guardError: true, status: 401, error: 'missing_token' });
  });
});
