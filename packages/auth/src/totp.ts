/**
 * T-015 — TOTP MFA enrolment
 *
 * Exports:
 *   enrollTotp(userId, opts): enroll user, encrypt secret, generate provisioning URI
 *   verifyTotp(userId, token, opts): decrypt secret, verify TOTP token
 *   enrollWebAuthn(_userId): Phase 3 deferred stub
 *
 * Security:
 *   - TOTP secret encrypted with libsodium secretbox (per-tenant HKDF-SHA256 derived key)
 *   - DO NOT import @simplewebauthn (Phase 3 deferral — red line)
 */

import { hkdf } from 'node:crypto';
import { promisify } from 'node:util';
import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';
import sodium from 'libsodium-wrappers';
import { getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js';

/** TOTP configuration — 30-second step, 6 digits (mutation guard) */
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6 as const;

const hkdfAsync = promisify(hkdf);

/**
 * Derive a 32-byte per-tenant key from the master key using HKDF-SHA256.
 * masterKey: 64-char hex string (32 bytes)
 * tenantId: used as HKDF salt
 */
async function deriveKey(masterKey: string, tenantId: string): Promise<Uint8Array> {
  const keyMaterial = Buffer.from(masterKey, 'hex');
  const salt = Buffer.from(tenantId, 'utf8');
  const info = Buffer.from('mfa-secret-key', 'utf8');
  const derived = await hkdfAsync('sha256', keyMaterial, salt, info, 32);
  return new Uint8Array(derived);
}

export interface EnrollTotpResult {
  secret: string;
  provisioningUri: string;
}

/**
 * Enroll a user for TOTP MFA.
 * Generates a base32 TOTP secret, encrypts it with libsodium secretbox,
 * upserts into mfa_secrets, and returns the plaintext secret + provisioning URI.
 */
export async function enrollTotp(
  userId: string,
  opts: { masterKey: string; tenantId: string },
): Promise<EnrollTotpResult> {
  await sodium.ready;

  const rawSecret = generateSecret();
  const key = await deriveKey(opts.masterKey, opts.tenantId);

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(sodium.from_string(rawSecret), nonce, key);

  // Store nonce + ciphertext concatenated, base64-encoded
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  const secretEncrypted = Buffer.from(combined).toString('base64');

  const pool = getOwnerConnection();
  try {
    await pool.query(
      `INSERT INTO public.mfa_secrets (user_id, secret_encrypted, enrolled_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE
         SET secret_encrypted = EXCLUDED.secret_encrypted,
             enrolled_at = now()`,
      [userId, secretEncrypted],
    );
  } finally {
    await pool.end();
  }

  const provisioningUri = generateURI({
    issuer: 'Monopilot',
    label: userId,
    secret: rawSecret,
    period: TOTP_PERIOD,
    digits: TOTP_DIGITS,
  });

  return { secret: rawSecret, provisioningUri };
}

/**
 * Verify a TOTP token for the given user.
 * Decrypts the stored secret and verifies the token against the current 30-second window.
 */
export async function verifyTotp(
  userId: string,
  token: string,
  opts: { masterKey: string; tenantId: string },
): Promise<boolean> {
  await sodium.ready;

  const pool = getOwnerConnection();
  let secretEncrypted: string;
  try {
    const result = await pool.query<{ secret_encrypted: string }>(
      `SELECT secret_encrypted FROM public.mfa_secrets WHERE user_id = $1`,
      [userId],
    );
    if (result.rows.length === 0) return false;
    secretEncrypted = result.rows[0].secret_encrypted;
  } finally {
    await pool.end();
  }

  const key = await deriveKey(opts.masterKey, opts.tenantId);
  const buf = Buffer.from(secretEncrypted, 'base64');
  const nonce = new Uint8Array(buf.buffer, buf.byteOffset, sodium.crypto_secretbox_NONCEBYTES);
  const ct = new Uint8Array(
    buf.buffer,
    buf.byteOffset + sodium.crypto_secretbox_NONCEBYTES,
    buf.length - sodium.crypto_secretbox_NONCEBYTES,
  );

  const rawSecretBytes = sodium.crypto_secretbox_open_easy(ct, nonce, key);
  const rawSecret = sodium.to_string(rawSecretBytes);

  const result = verifySync({ token, secret: rawSecret, period: TOTP_PERIOD, digits: TOTP_DIGITS });
  return result.valid;
}

/**
 * WebAuthn Phase 3 deferral stub.
 * MUST NOT import @simplewebauthn or make any network calls.
 */
export async function enrollWebAuthn(
  _userId: string,
): Promise<{ disabled: true; reason: 'phase_3_deferred' }> {
  return { disabled: true as const, reason: 'phase_3_deferred' as const };
}
