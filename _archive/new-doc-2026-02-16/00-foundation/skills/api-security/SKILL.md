---
name: api-security
description: API authentication and authorization patterns — JWT (RFC 8725 best practices), API keys, refresh token rotation, RBAC, and OWASP API Top 10 summary. For deeper backend security, see security-backend-checklist.
tags: [api, security, authentication, jwt, authorization]
---

## When to Use

Apply when implementing API authentication and authorization — JWT issuance/verification, session strategies, API key flows, role-based access control, or threat-model review against OWASP API Top 10.

**Scope**: This skill covers **API-specific** security (auth, authz, token handling). General backend security (input sanitation, CSRF, dependency audit, logging of security events) lives in `security-backend-checklist`.

---

## 1. Authentication

### JWT (RFC 7519 + RFC 8725 Best Practices)
```typescript
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '1h',      // RFC 8725: always set expiration
    issuer: 'myapp',
    algorithm: 'HS256',   // RFC 8725: explicitly specify algorithm
  });
}

function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!, {
    algorithms: ['HS256'], // RFC 8725: prevent algorithm confusion attacks
  }) as TokenPayload;
}
```

### Auth Middleware (Bearer Token)
```typescript
async function authMiddleware(req: NextRequest): Promise<TokenPayload | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await authMiddleware(req);
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
      { status: 401 }
    );
  }
  // user.userId, user.role available
}
```

### API Key Authentication
```typescript
async function apiKeyMiddleware(req: NextRequest): Promise<ApiClient | null> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) return null;

  // Keys stored HASHED, never plaintext
  const hashedKey = await hashApiKey(apiKey);
  const client = await db.apiClients.findUnique({ where: { keyHash: hashedKey } });
  if (!client || client.revokedAt) return null;

  await db.apiClients.update({
    where: { id: client.id },
    data: { lastUsedAt: new Date() },
  });

  return client;
}
```

### Refresh Token Rotation
```typescript
async function refreshTokens(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);

  const stored = await db.refreshTokens.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.revokedAt) throw new UnauthorizedError('Token revoked');

  // Rotate — invalidate old BEFORE issuing new
  await db.refreshTokens.update({
    where: { token: refreshToken },
    data: { revokedAt: new Date() },
  });

  const newAccessToken = generateToken({ userId: payload.userId });
  const newRefreshToken = generateRefreshToken({ userId: payload.userId });
  await db.refreshTokens.create({ data: { token: newRefreshToken, userId: payload.userId } });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
```

---

## 2. Authorization (RBAC)

### Role Check Middleware
```typescript
function requireRole(...roles: string[]) {
  return async (req: NextRequest) => {
    const user = await authMiddleware(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!roles.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return null;
  };
}

export async function DELETE(req: NextRequest) {
  const error = await requireRole('admin')(req);
  if (error) return error;
  // admin-only logic
}
```

**Monopilot note**: Uses permission service at `lib/services/permission-service.ts` with 10 roles (owner, admin, production_manager, quality_manager, warehouse_manager, production_operator, quality_inspector, warehouse_operator, planner, viewer) and pre-defined sets (`RoleSets.ADMIN_ONLY`, `RoleSets.WORK_ORDER_READ`, `RoleSets.WORK_ORDER_WRITE`). See `monopilot-patterns` Pattern 2 + 5.

---

## 3. API Security Checklist (OWASP API Top 10 — 2023/2025 RC)

Summary only — for full guidance see [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) and `security-backend-checklist`.

| # | Risk | Mitigation headline |
|---|---|---|
| API1 | Broken Object-Level Auth (BOLA) | Always check object ownership, not just authentication |
| API2 | Broken Authentication | JWT expiry, rotation, strong secrets, no tokens in localStorage |
| API3 | Broken Object Property-Level Auth | Filter response fields by role (no over-exposure) |
| API4 | Unrestricted Resource Consumption | Rate limit, request size caps, pagination limits |
| API5 | Broken Function-Level Auth | RBAC on every endpoint, not just the UI |
| API6 | Unrestricted Access to Sensitive Business Flows | Anti-automation (CAPTCHA), velocity checks |
| API7 | Server-Side Request Forgery (SSRF) | Allowlist outbound URLs, no user-controlled fetch targets |
| API8 | Security Misconfiguration | Hardened headers, secrets in env, minimal error disclosure |
| API9 | Improper Inventory Management | Document every endpoint, retire old versions |
| API10 | Unsafe Consumption of APIs | Validate third-party responses as untrusted input |

### RFC 8725 JWT Security Essentials
- Always set token expiration (access: 15m–1h, refresh: days)
- Explicitly specify algorithm (`algorithm: 'HS256'` on sign; `algorithms: ['HS256']` on verify)
- Reject `alg: none` — algorithm confusion attacks
- Use strong secrets (>= 256 bits for HS256; prefer asymmetric RS256/ES256 for multi-service)
- Rotate refresh tokens on use

---

## Anti-Patterns

- JWT in `localStorage` — use httpOnly cookies for web sessions
- No token expiration
- Plaintext API keys in the DB — always hash on write
- Reusing refresh tokens (no rotation)
- Missing algorithm validation on verify
- Generic "Unauthorized" leaking info (e.g. "user not found" vs "wrong password")
- Auth checks only in the UI — server MUST enforce
- Trusting client-supplied role / tenant ID claims without re-validating

## Verification Checklist

- [ ] Tokens always have expiration
- [ ] Algorithm explicitly pinned on sign AND verify
- [ ] Refresh tokens rotated on use
- [ ] API keys stored hashed
- [ ] Object-level auth (BOLA) checked, not just user auth
- [ ] RBAC enforced server-side on every privileged endpoint
- [ ] Rate limiting on auth endpoints and write operations
- [ ] Auth errors don't leak existence/type info
- [ ] Security headers set (via middleware/proxy)

## Related Skills

- `security-backend-checklist` — general backend security (OWASP Top 10 2021/2025 RC)
- `api-design` — error response format + status codes
- `monopilot-patterns` — project auth context + permission service
- `supabase-auth` — Supabase-specific flows
- `supabase-rls` — row-level authorization pattern
