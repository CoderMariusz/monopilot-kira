---
name: api-design
description: Consolidated API design patterns — RESTful design (RFC 9110), error handling (RFC 9457 Problem Details), and request validation (Zod v4). Covers resource naming, status codes, error hierarchy, global handlers, and middleware validation.
tags: [api, rest, backend, error-handling, validation]
---

## When to Use

Apply when designing and implementing HTTP APIs — defining resource URLs, choosing status codes, formatting consistent success/error responses, validating inputs with Zod, and building an error class hierarchy with a global handler.

**Standards**: RFC 9110 (HTTP semantics), RFC 9457 (Problem Details for HTTP APIs), Zod v4.

---

## 1. RESTful Design (RFC 9110)

### Resource Naming
```
GOOD
GET    /users              # List
GET    /users/123          # Single
POST   /users              # Create
PUT    /users/123          # Update (full)
PATCH  /users/123          # Update (partial)
DELETE /users/123          # Delete
GET    /users/123/orders   # Nested resource

BAD
GET    /getUsers           # Verb in URL
POST   /createUser         # Verb in URL
GET    /user/123           # Singular (use plural)
```

### HTTP Status Codes
```
Success
200 OK              GET/PUT/PATCH success with body
201 Created         POST success (include Location header)
204 No Content      DELETE success, no body

Client Errors
400 Bad Request     Invalid input/payload
401 Unauthorized    Missing/invalid auth
403 Forbidden       Auth valid, no permission
404 Not Found       Resource doesn't exist
409 Conflict        Resource state conflict
422 Unprocessable   Validation failed

Server Errors
500 Internal        Unexpected server error
503 Unavailable     Service temporarily down
```

### Response Format
```json
// Success
{
  "data": { "id": 123, "name": "John" },
  "meta": { "timestamp": "2026-04-17T12:00:00Z" }
}

// List with pagination
{
  "data": [...],
  "meta": { "total": 100, "page": 1, "limit": 20 }
}
```

### Filtering, Sorting, Pagination
```
GET /users?status=active&role=admin
GET /users?sort=created_at:desc
GET /users?page=2&limit=20
GET /users?fields=id,name,email
```

### Versioning
```
URL path (recommended):
GET /api/v1/users

Header (alternative):
Accept: application/vnd.api+json;version=1
```

---

## 2. Error Handling (RFC 9457)

### Standard Error Response Format
```typescript
interface ApiError {
  error: {
    code: string;              // Machine-readable
    message: string;           // Human-readable
    details?: ErrorDetail[];   // Field-level
    requestId?: string;        // For debugging
  };
}

interface ErrorDetail { field: string; message: string; code?: string; }
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "message": "Invalid email format", "code": "INVALID_FORMAT" }
    ],
    "requestId": "req_abc123"
  }
}
```

### Error Class Hierarchy
```typescript
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: ErrorDetail[]
  ) {
    super(message);
    this.name = 'AppError';
  }
}

class ValidationError extends AppError {
  constructor(details: ErrorDetail[]) {
    super('VALIDATION_ERROR', 'Validation failed', 400, details);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor() { super('UNAUTHORIZED', 'Authentication required', 401); }
}
```

### Global Error Handler (Express / Next.js)
```typescript
function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('Error:', { message: err.message, stack: err.stack, requestId: req.headers['x-request-id'] });

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.headers['x-request-id'],
      },
    });
  }

  // Unknown — never leak details
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: req.headers['x-request-id'] },
  });
}
```

### Error Code Constants
```typescript
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
```

### Frontend Error Handling
```typescript
async function apiCall<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const err = await response.json();
    throw new ApiError(err.error.code, err.error.message, err.error.details);
  }
  return response.json();
}

try {
  const user = await apiCall<User>('/api/users/123');
} catch (error) {
  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
    setFormErrors(error.details);
  }
}
```

**Monopilot note**: Uses a concrete hierarchy at `lib/errors/` (`AppError` abstract → `UnauthorizedError`, `ForbiddenError`, `NotFoundError`) plus `AuthError` (separate) at `lib/api/auth-helpers.ts`. Central `handleApiError()` + `successResponse()` at `lib/api/error-handler.ts`. Postgres `23505` = unique violation. See `monopilot-patterns` Pattern 3.

---

## 3. Validation (Zod v4)

### Zod Schema Validation
```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters'),
  name: z.string().min(1, 'Name required').max(100),
  role: z.enum(['user', 'admin']).default('user'),
});

type CreateUserDto = z.infer<typeof CreateUserSchema>;
```

### Request Handler with Validation
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = CreateUserSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: result.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }, { status: 400 });
  }

  const user = await createUser(result.data); // fully typed
  return NextResponse.json(user, { status: 201 });
}
```

### Query Params with Coercion
```typescript
const ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const result = ListQuerySchema.safeParse(params);
  if (!result.success) return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  const { page, limit, sort, search } = result.data;
  // ...
}
```

### Reusable Field Schemas
```typescript
const EmailSchema = z.string().email();
const UUIDSchema = z.string().uuid();
const DateStringSchema = z.string().datetime();
const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

### Validation Middleware
```typescript
function validate<T extends z.ZodSchema>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: result.error.issues } });
    }
    req.validated = result.data;
    next();
  };
}
```

### Zod v4 Migration Notes
- `.nonempty()` — inferred type is now `string[]` (not `[string, ...string[]]`)
- `error.errors` renamed → `error.issues` (both work in v4 transition)
- Format validators (`.email()`, `.uuid()`, `.datetime()`) unchanged
- More descriptive error messages by default

---

## Anti-Patterns

- Verbs in URLs (`/getUsers`, `/createUser`)
- Wrong status codes (200 for errors, 404 for permission denied)
- Inconsistent response shapes across endpoints
- Missing pagination on list endpoints
- No API versioning strategy
- Exposing stack traces in production
- Generic "Error occurred" messages
- Trusting TypeScript types for runtime input — always validate
- Client-only validation — server MUST validate too

## Verification Checklist

- [ ] Resource URLs plural nouns, correct HTTP methods
- [ ] Status codes match semantic intent
- [ ] All responses same shape (success / error)
- [ ] Error code + message + optional details[] + requestId
- [ ] Stack traces hidden in production
- [ ] All endpoints validate input via Zod
- [ ] Query params coerced (`z.coerce`)
- [ ] Default values for optional fields
- [ ] Pagination on list endpoints
- [ ] Versioning strategy defined

## Related Skills

- `typescript-zod` — deeper Zod patterns (discriminated unions, refinements, transforms)
- `api-security` — authentication, JWT, RBAC, OWASP API Top 10
- `typescript-patterns-v2` — DTO and API endpoint type patterns
- `schema-driven-design` — validation schemas derived from DB metadata
- `monopilot-patterns` — project wiring (`handleApiError`, `successResponse`)
