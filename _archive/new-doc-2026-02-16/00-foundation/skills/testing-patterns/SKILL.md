---
name: testing-patterns
description: Consolidated testing patterns for Monopilot stack — TDD workflow (RED/GREEN/REFACTOR), Vitest (mocks, spies, async, coverage), React Testing Library (accessible queries, userEvent), and MSW v2 (HTTP handlers, setupServer). Uses Vitest, NOT Jest.
tags: [testing, vitest, tdd, react-testing-library, msw]
---

## When to Use

Apply when writing unit, integration, or component tests in Monopilot — driving design via TDD, configuring Vitest, querying the DOM accessibly with React Testing Library, or mocking HTTP with MSW.

**CRITICAL: Vitest, NOT Jest.** User decision 2026-04-17. Vitest API is ~95% Jest-compatible (`vi.fn` ↔ `jest.fn`, `vi.mock` ↔ `jest.mock`). Code examples here use `vi.*` — when migrating from Jest-era docs, swap the prefix.

**Related**: `testing-playwright` is a separate skill for E2E (different framework, different scope).

---

## 1. TDD Workflow

### Red-Green-Refactor
```
RED:      Write failing test (describes what, not how)
GREEN:    Write minimal code to pass
REFACTOR: Improve structure, keep tests green
REPEAT:   Next behavior
```
Source: https://martinfowler.com/bliki/TestDrivenDevelopment.html

### AAA / Given-When-Then
```typescript
import { describe, it, expect } from 'vitest';

it('should calculate total with discount', () => {
  // Arrange (Given)
  const cart = new Cart();
  cart.add({ price: 100, quantity: 2 });

  // Act (When)
  const total = cart.calculateTotal(0.1);

  // Assert (Then)
  expect(total).toBe(180);
});
```

### One Assertion Per Behavior
```typescript
// GOOD
it('should add item to cart', () => {
  cart.add(item);
  expect(cart.items).toContain(item);
});

it('should update cart count', () => {
  cart.add(item);
  expect(cart.count).toBe(1);
});
```

### Test Naming
```typescript
// Format: should [expected behavior] when [condition]
it('should return 0 when cart is empty', () => {});
it('should apply discount when code is valid', () => {});
it('should throw error when quantity is negative', () => {});
```

### Outside-In TDD
1. Start with acceptance test (user story)
2. Discover collaborators through failing tests
3. Write unit tests for collaborators
4. Implement inside-out
5. Acceptance test passes

### TDD RED Phase Template (Monopilot)
```typescript
describe('Story XX.Y: {Feature Name}', () => {
  // AC-1: {description from story}
  describe('AC-1: {description}', () => {
    it('should {expected behavior}', async () => {
      // RED phase — intentionally fails
      expect(true).toBe(false); // PLACEHOLDER — remove when implementing
    });
  });
});
```

---

## 2. Vitest Patterns

### Core Imports
```typescript
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
```

### Mocks and Spies
```typescript
// Function mock
const mockFn = vi.fn();
mockFn.mockReturnValue('x');
mockFn.mockResolvedValue({ data: 'ok' });
expect(mockFn).toHaveBeenCalledWith(expect.any(String));

// Module mock
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(() => Promise.resolve(mockSupabaseClient)),
}));

// Partial mock with actual import
vi.mock('@/lib/utils', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/utils')>();
  return { ...actual, formatDate: vi.fn(() => '2026-04-17') };
});

// Spy without replacing
const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
```

### Reset Between Tests
```typescript
beforeEach(() => {
  vi.clearAllMocks();      // clears calls, keeps implementation
  // vi.resetAllMocks();   // clears + resets implementation to undefined
  // vi.restoreAllMocks(); // restores spyOn originals
});
```

### Async Testing
```typescript
it('fetches data', async () => {
  const result = await fetchUser('123');
  expect(result.id).toBe('123');
});

it('rejects on 500', async () => {
  await expect(fetchUser('bad')).rejects.toThrow('Server error');
});
```

### Coverage
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/node_modules/**', '**/*.test.{ts,tsx}'],
    },
  },
});
```

### Supabase Chainable Mock (Monopilot)
```typescript
function createChainableMock(): any {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: vi.fn((resolve) => resolve({ data: [], error: null })),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(() => Promise.resolve({
    from: vi.fn(() => createChainableMock()),
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: { id: 'test-user-id' } },
        error: null,
      })),
    },
  })),
}));
```

### API Route Test (Next.js 16 async params)
```typescript
import { NextRequest } from 'next/server';
import { GET } from '../route';

describe('GET /api/v1/module/resource', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 401 when unauthenticated', async () => {
    const request = new NextRequest('http://localhost/api/v1/module/resource');
    const response = await GET(request, { params: Promise.resolve({ id: 'x' }) });
    expect(response.status).toBe(401);
  });
});
```

### RLS Isolation Test
```typescript
it('enforces org_id isolation (RLS)', async () => {
  mockSupabase.from.mockReturnValue({
    ...createChainableMock(),
    single: vi.fn(() => Promise.resolve({
      data: null,
      error: { code: 'PGRST116', message: 'Row not found' }, // RLS miss
    })),
  });

  const request = new NextRequest('http://localhost/api/v1/module/resource');
  const response = await GET(request, { params: Promise.resolve({ id: 'other-org-id' }) });

  // 404 (not 403 — never leak resource existence across tenants)
  expect(response.status).toBe(404);
});
```

---

## 3. React Testing Library

### Basic Render + Query
```typescript
import { render, screen } from '@testing-library/react';

test('renders greeting', () => {
  render(<Greeting name="World" />);
  expect(screen.getByRole('heading')).toHaveTextContent('Hello, World');
  expect(screen.getByText(/hello/i)).toBeInTheDocument();
});
```

### Query Priority (most accessible first)
```typescript
// 1. getByRole — buttons, headings, links
screen.getByRole('button', { name: /submit/i });
screen.getByRole('heading', { level: 1 });

// 2. getByLabelText — form inputs
screen.getByLabelText(/email/i);

// 3. getByPlaceholderText — when no label available
screen.getByPlaceholderText('Enter email');

// 4. getByText — non-interactive elements
screen.getByText(/welcome/i);

// 5. getByTestId — last resort
screen.getByTestId('custom-element');
```

### User Interactions (`userEvent`)
```typescript
import userEvent from '@testing-library/user-event';

test('submits form', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn(); // Vitest — NOT jest.fn()

  render(<LoginForm onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText(/email/i), 'test@example.com');
  await user.type(screen.getByLabelText(/password/i), 'secret123');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'secret123',
  });
});
```

### Async Waiting
```typescript
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react';

test('loads data', async () => {
  render(<UserList />);
  await waitForElementToBeRemoved(() => screen.queryByText(/loading/i));
  expect(await screen.findByText('John Doe')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByRole('list').children).toHaveLength(3);
  });
});
```

### Query Variants
```typescript
screen.getByRole('button');       // throws if missing
screen.queryByRole('button');     // null if missing (for absence checks)
await screen.findByText(/loaded/i); // async, waits up to 1000ms
```

### Render with Providers (Monopilot custom render)
```typescript
// Import from @/test/test-utils (NOT from @testing-library/react directly)
// test-utils.tsx wraps in QueryClientProvider + other providers
import { render, screen } from '@/test/test-utils';
```

---

## 4. MSW v2 — HTTP Mocking

### Handler Definitions
```typescript
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () =>
    HttpResponse.json([
      { id: '1', name: 'John' },
      { id: '2', name: 'Jane' },
    ])
  ),
  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: '3', ...body }, { status: 201 });
  }),
];
```

### Test Setup
```typescript
// src/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

// vitest.setup.ts
import { server } from './src/mocks/server';
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Test-Specific Override
```typescript
import { http, HttpResponse } from 'msw';

test('handles server error', async () => {
  server.use(
    http.get('/api/users', () =>
      HttpResponse.json({ error: 'Server error' }, { status: 500 })
    )
  );

  render(<UserList />);
  expect(await screen.findByText(/error/i)).toBeInTheDocument();
});
```

### Request Body Assertions
```typescript
test('sends correct data', async () => {
  let capturedBody: unknown;
  server.use(
    http.post('/api/users', async ({ request }) => {
      capturedBody = await request.json();
      return HttpResponse.json({ id: '1' }, { status: 201 });
    })
  );

  render(<CreateUserForm />);
  await userEvent.type(screen.getByLabelText(/name/i), 'John');
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));

  await waitFor(() => expect(capturedBody).toEqual({ name: 'John' }));
});
```

### Simulated Latency
```typescript
import { http, HttpResponse, delay } from 'msw';

server.use(
  http.get('/api/users', async () => {
    await delay(100);
    return HttpResponse.json([{ id: '1', name: 'John' }]);
  })
);

test('shows loading state', async () => {
  render(<UserList />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
  expect(await screen.findByText('John')).toBeInTheDocument();
});
```

### Browser Worker (Development)
```typescript
// src/mocks/browser.ts
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
export const worker = setupWorker(...handlers);

// main.tsx
if (process.env.NODE_ENV === 'development') {
  const { worker } = await import('./mocks/browser');
  await worker.start();
}
```

---

## File Layout (Monopilot)

| Type | Path Pattern |
|---|---|
| Unit | `apps/frontend/__tests__/{module}/{feature}.test.ts` |
| API | `apps/frontend/__tests__/api/{module}/{feature}.test.ts` |
| Component | `apps/frontend/__tests__/components/{module}/{Feature}.test.tsx` |
| E2E | `apps/frontend/e2e/{module}/{feature}.spec.ts` (see `testing-playwright`) |
| Test utils | `apps/frontend/test/test-utils.tsx` |
| Vitest config | `apps/frontend/vitest.config.ts` |
| Vitest setup | `apps/frontend/vitest.setup.ts` |

---

## Anti-Patterns

- Test after code (loses TDD design value)
- Testing implementation details (internal methods, private state)
- Big RED-GREEN cycles (hours instead of minutes)
- Skipping REFACTOR step — debt accumulates
- Multiple assertions per test
- `jest.*` imports (use `vi.*`; Vitest, not Jest)
- Not resetting handlers between tests (leaking state)
- Global MSW mocks instead of `server.use()` for test-specific
- `container.querySelector` instead of accessible queries
- Not awaiting `userEvent` (it's async)
- `getBy*` for absence checks (use `queryBy*`)

## Verification Checklist

- [ ] Test written BEFORE implementation (TDD)
- [ ] Test fails for the right reason (RED)
- [ ] Minimal code to pass (GREEN)
- [ ] Refactor done, tests still green
- [ ] One behavior per test
- [ ] `vi.*` everywhere (no `jest.*`)
- [ ] Mocks cleared in `beforeEach`
- [ ] Async ops awaited (`findBy`, `waitFor`, `user.type`)
- [ ] Accessible queries preferred (`getByRole` > `getByTestId`)
- [ ] MSW handlers reset after each test
- [ ] Error states + loading states tested

## Related Skills

- `testing-playwright` — E2E (separate framework)
- `react-19-patterns` — component implementation tested here
- `typescript-zod` — schema validation tested
- `monopilot-patterns` — project conventions (Supabase mock, RLS test, error hierarchy)
