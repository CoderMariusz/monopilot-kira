import { createRateLimiter, getClientIp, type RateLimiter } from './limiter.js';

export type RateLimitPresetName =
  | 'auth-login'
  | 'auth-magic-link'
  | 'saml-login'
  | 'scim-create'
  | 'pin-verify';

type PresetConfig = {
  name: RateLimitPresetName;
  capacity: number;
  windowSec: number;
  keyFn: (req: Request) => string;
  methods?: string[];
  retryAfterSeconds?: number;
};

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function headerValue(req: Request, name: string): string {
  return req.headers.get(name)?.trim() || 'unknown';
}

export async function magicLinkKey(req: Request): Promise<string> {
  const email = headerValue(req, 'x-monopilot-email');
  return `auth-magic-link:${await sha256Hex(email)}`;
}

export const presetConfigs: PresetConfig[] = [
  {
    name: 'auth-login',
    capacity: 5,
    windowSec: 60,
    methods: ['POST'],
    keyFn: (req) => `auth-login:${getClientIp(req)}`,
  },
  {
    name: 'auth-magic-link',
    capacity: 3,
    windowSec: 15 * 60,
    methods: ['POST'],
    keyFn: (req) => `auth-magic-link:${headerValue(req, 'x-monopilot-email-hash')}`,
  },
  {
    name: 'saml-login',
    capacity: 20,
    windowSec: 60,
    keyFn: (req) => `saml-login:${getClientIp(req)}`,
  },
  {
    name: 'scim-create',
    capacity: 60,
    windowSec: 60,
    methods: ['POST'],
    keyFn: (req) => `scim-create:${headerValue(req, 'x-monopilot-org-id')}`,
  },
  {
    name: 'pin-verify',
    capacity: 5,
    windowSec: 60,
    methods: ['POST'],
    retryAfterSeconds: 60,
    keyFn: (req) => `pin-verify:${headerValue(req, 'x-monopilot-user-id')}`,
  },
];

const presetLimiters = new Map<RateLimitPresetName, RateLimiter>();

export function getPreset(name: RateLimitPresetName): RateLimiter {
  const existing = presetLimiters.get(name);
  if (existing) return existing;

  const config = presetConfigs.find((candidate) => candidate.name === name);
  if (!config) throw new Error(`Unknown rate-limit preset: ${name}`);

  const limiter = createRateLimiter({
    name: config.name,
    limits: { capacity: config.capacity, refillPerSec: config.capacity / config.windowSec },
    keyFn: config.keyFn,
  });
  presetLimiters.set(name, limiter);
  return limiter;
}

export function matchPreset(req: Request): { limiter: RateLimiter; retryAfterSeconds?: number } | null {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  const config =
    pathname === '/api/auth/login'
      ? presetConfigs[0]
      : pathname === '/api/auth/magic-link'
        ? presetConfigs[1]
        : pathname.startsWith('/api/auth/saml/')
          ? presetConfigs[2]
          : pathname.startsWith('/api/scim/')
            ? presetConfigs[3]
            : null;

  if (!config) return null;
  if (config.methods && !config.methods.includes(method)) return null;

  return {
    limiter: getPreset(config.name),
    retryAfterSeconds: config.retryAfterSeconds,
  };
}

export const presets = new Proxy({} as Record<RateLimitPresetName, RateLimiter>, {
  get(_target, property) {
    return getPreset(property as RateLimitPresetName);
  },
});
