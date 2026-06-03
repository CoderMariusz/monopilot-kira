import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_RELAY_STATE_TTL_SEC = 5 * 60;
const TEST_ONLY_SECRET = 'test-only-saml-relay-state-key-DO-NOT-USE-IN-PROD';

export type RelayStateError =
  | 'relay_state_invalid'
  | 'relay_state_expired'
  | 'relay_state_org_mismatch';

export interface SignRelayStateInput {
  orgId: string;
  nonce: string;
  expSec: number;
}

export interface RelayStateSecretOptions {
  secret?: string;
}

export type VerifyRelayStateResult =
  | { ok: true; orgId: string; nonce: string; expSec: number }
  | { ok: false; error: RelayStateError };

function getRelayStateSecret(options?: RelayStateSecretOptions): string {
  const secret =
    options?.secret ??
    process.env.SAML_RELAY_STATE_HMAC_KEY ??
    process.env.SAML_RELAY_STATE_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === 'production' && !process.env.VITEST) {
      throw new Error('SAML_RELAY_STATE_HMAC_KEY env var is required in production');
    }
    return TEST_ONLY_SECRET;
  }

  return secret;
}

function hmacPayload(payload: string, options?: RelayStateSecretOptions): Buffer {
  return createHmac('sha256', getRelayStateSecret(options)).update(payload).digest();
}

function decodePayload(payloadB64: string): SignRelayStateInput | null {
  const payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  const parts = payload.split('|');

  if (parts.length !== 3) return null;

  const [orgId, nonce, expRaw] = parts;
  const expSec = Number(expRaw);

  if (!orgId || !nonce || !Number.isSafeInteger(expSec)) {
    return null;
  }

  return { orgId, nonce, expSec };
}

export function signRelayState(
  input: SignRelayStateInput,
  options?: RelayStateSecretOptions,
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  if (input.expSec - nowSec > MAX_RELAY_STATE_TTL_SEC) {
    throw new Error('relay_state_exp_too_long');
  }

  const payload = `${input.orgId}|${input.nonce}|${input.expSec}`;
  const mac = hmacPayload(payload, options).toString('base64url');
  const payloadB64 = Buffer.from(payload).toString('base64url');

  return `${mac}.${payloadB64}`;
}

export function readRelayStateOrgId(relayState: string): string | null {
  const parts = relayState.split('.');
  if (parts.length !== 2) return null;

  return decodePayload(parts[1])?.orgId ?? null;
}

export function createRelayStateNonceGuard(): (nonce: string, expSec: number) => boolean {
  const consumedNonces = new Map<string, number>();

  return (nonce: string, expSec: number): boolean => {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const [storedNonce, storedExpSec] of consumedNonces) {
      if (storedExpSec < nowSec) {
        consumedNonces.delete(storedNonce);
      }
    }

    if (consumedNonces.has(nonce)) {
      return false;
    }

    consumedNonces.set(nonce, expSec);
    return true;
  };
}

export function verifyRelayState(
  relayState: string | null | undefined,
  expectedOrgId: string,
  options?: RelayStateSecretOptions,
): VerifyRelayStateResult {
  try {
    if (!relayState || !expectedOrgId) {
      return { ok: false, error: 'relay_state_invalid' };
    }

    const parts = relayState.split('.');
    if (parts.length !== 2) {
      return { ok: false, error: 'relay_state_invalid' };
    }

    const [macB64, payloadB64] = parts;
    const decoded = decodePayload(payloadB64);
    if (!decoded) {
      return { ok: false, error: 'relay_state_invalid' };
    }

    const payload = `${decoded.orgId}|${decoded.nonce}|${decoded.expSec}`;
    const presented = Buffer.from(macB64, 'base64url');
    const expected = hmacPayload(payload, options);
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      return { ok: false, error: 'relay_state_invalid' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (decoded.expSec < nowSec) {
      return { ok: false, error: 'relay_state_expired' };
    }

    if (decoded.orgId !== expectedOrgId) {
      return { ok: false, error: 'relay_state_org_mismatch' };
    }

    return { ok: true, orgId: decoded.orgId, nonce: decoded.nonce, expSec: decoded.expSec };
  } catch {
    return { ok: false, error: 'relay_state_invalid' };
  }
}
