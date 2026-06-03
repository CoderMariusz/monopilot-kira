import { describe, expect, it, vi } from 'vitest';

import {
  createRelayStateNonceGuard,
  signRelayState,
  verifyRelayState,
} from '../relay-state.js';

const SECRET = 'test-relay-state-secret-with-enough-entropy';

describe('SAML RelayState HMAC binding', () => {
  it('accepts a fresh RelayState for the same org_id within 60 seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'));
    try {
      const expSec = Math.floor(Date.now() / 1000) + 60;
      const relayState = signRelayState(
        {
          orgId: '11111111-1111-4111-8111-111111111111',
          nonce: 'nonce-1',
          expSec,
        },
        { secret: SECRET },
      );

      const result = verifyRelayState(
        relayState,
        '11111111-1111-4111-8111-111111111111',
        { secret: SECRET },
      );

      expect(result).toEqual({
        ok: true,
        orgId: '11111111-1111-4111-8111-111111111111',
        nonce: 'nonce-1',
        expSec,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a RelayState one second after expiry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00.000Z'));
    const relayState = signRelayState(
      {
        orgId: '11111111-1111-4111-8111-111111111111',
        nonce: 'nonce-2',
        expSec: Math.floor(Date.now() / 1000) + 60,
      },
      { secret: SECRET },
    );

    vi.setSystemTime(new Date('2026-06-03T12:01:01.000Z'));
    try {
      expect(
        verifyRelayState(relayState, '11111111-1111-4111-8111-111111111111', {
          secret: SECRET,
        }),
      ).toEqual({ ok: false, error: 'relay_state_expired' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a RelayState with a tampered HMAC', () => {
    const relayState = signRelayState(
      {
        orgId: '11111111-1111-4111-8111-111111111111',
        nonce: 'nonce-3',
        expSec: Math.floor(Date.now() / 1000) + 60,
      },
      { secret: SECRET },
    );
    const [mac, payload] = relayState.split('.');
    const tamperedMac = `${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`;

    expect(
      verifyRelayState(`${tamperedMac}.${payload}`, '11111111-1111-4111-8111-111111111111', {
        secret: SECRET,
      }),
    ).toEqual({ ok: false, error: 'relay_state_invalid' });
  });

  it('rejects a RelayState bound to org A when callback expects org B', () => {
    const relayState = signRelayState(
      {
        orgId: '11111111-1111-4111-8111-111111111111',
        nonce: 'nonce-4',
        expSec: Math.floor(Date.now() / 1000) + 60,
      },
      { secret: SECRET },
    );

    expect(
      verifyRelayState(relayState, '22222222-2222-4222-8222-222222222222', {
        secret: SECRET,
      }),
    ).toEqual({ ok: false, error: 'relay_state_org_mismatch' });
  });

  it('fails closed in production when the RelayState HMAC key is unset', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalKey = process.env.SAML_RELAY_STATE_HMAC_KEY;
    const originalLegacyKey = process.env.SAML_RELAY_STATE_SECRET;
    const originalVitest = process.env.VITEST;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SAML_RELAY_STATE_HMAC_KEY;
      delete process.env.SAML_RELAY_STATE_SECRET;
      delete process.env.VITEST;

      expect(() =>
        signRelayState({
          orgId: '11111111-1111-4111-8111-111111111111',
          nonce: 'nonce-5',
          expSec: Math.floor(Date.now() / 1000) + 60,
        }),
      ).toThrow(/SAML_RELAY_STATE_HMAC_KEY.*required.*production/i);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;

      if (originalKey === undefined) delete process.env.SAML_RELAY_STATE_HMAC_KEY;
      else process.env.SAML_RELAY_STATE_HMAC_KEY = originalKey;

      if (originalLegacyKey === undefined) delete process.env.SAML_RELAY_STATE_SECRET;
      else process.env.SAML_RELAY_STATE_SECRET = originalLegacyKey;

      if (originalVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = originalVitest;
    }
  });

  it('rejects replay of an already consumed RelayState nonce', () => {
    const rememberNonce = createRelayStateNonceGuard();
    const expSec = Math.floor(Date.now() / 1000) + 60;

    expect(rememberNonce('nonce-replay', expSec)).toBe(true);
    expect(rememberNonce('nonce-replay', expSec)).toBe(false);
  });
});
