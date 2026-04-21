---
name: typescript-patterns-v2
description: Consolidated TypeScript patterns — idioms (utility types, discriminated unions, type guards, const assertions), generics (constraints, conditional types, NoInfer), and API types (DTOs, response wrappers, endpoint maps).
tags: [typescript, types, generics]
---

## When to Use

Apply when writing TypeScript code requiring type safety — designing utility-type compositions, building reusable generic functions/components, or modeling API request/response types and DTOs.

**Related**: `typescript-zod` is a separate, validation-specific skill (Zod v4 schemas, `z.infer`, composition). This skill covers pure TypeScript patterns.

---

## 1. Idioms and Patterns

### Discriminated Unions
```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function handle<T>(result: Result<T>) {
  if (result.success) {
    console.log(result.data); // narrowed to T
  } else {
    console.log(result.error); // narrowed to string
  }
}
```
Source: https://www.typescriptlang.org/docs/handbook/2/narrowing.html

### Utility Types
```typescript
interface User { id: string; name: string; email: string; }

type CreateUser = Omit<User, 'id'>;
type UpdateUser = Partial<Omit<User, 'id'>>;
type UserKeys = keyof User;
type ReadonlyUser = Readonly<User>;
```

### Type Guards
```typescript
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```

### Mapped Types
```typescript
type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K]; };

interface Person { name: string; age: number; }
type PersonGetters = Getters<Person>;
// { getName: () => string; getAge: () => number; }
```

### `const` Assertions
```typescript
const routes = ['home', 'about', 'contact'] as const;
type Route = typeof routes[number]; // 'home' | 'about' | 'contact'
```

---

## 2. Generics

### Generic Function with Constraint
```typescript
interface HasId { id: string; }
function findById<T extends HasId>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id);
}
```

### Key Access with `keyof`
```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'John', age: 30 };
const name = getProperty(user, 'name'); // string
```

### Generic React Component
```typescript
interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string;
}

function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>{items.map(item => <li key={keyExtractor(item)}>{renderItem(item)}</li>)}</ul>
  );
}
```

### Conditional Types
```typescript
type ApiResponse<T> = T extends undefined
  ? { success: true }
  : { success: true; data: T };
```

### Generic Defaults
```typescript
interface PaginatedResult<T = unknown> {
  data: T[];
  page: number;
  total: number;
}
```

### `NoInfer` (TypeScript 5.4+)
```typescript
function createStreetLight<C extends string>(
  colors: C[],
  defaultColor?: NoInfer<C>
) {
  return { colors, defaultColor };
}

createStreetLight(['red', 'yellow', 'green'], 'red');    // OK
createStreetLight(['red', 'yellow', 'green'], 'blue');   // Error — blue not in inferred union
```

---

## 3. API Request/Response Types

### DTOs from Base Entity
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

type CreateUserDto = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
type UpdateUserDto = Partial<Omit<User, 'id'>> & Pick<User, 'id'>;
type UserResponse = Omit<User, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
```

### API Response Wrapper + Error
```typescript
interface ApiResponse<T> {
  data: T;
  meta?: { page?: number; limit?: number; total?: number };
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

type ApiResult<T> = ApiResponse<T> | ApiError;

function isApiError(result: ApiResult<unknown>): result is ApiError {
  return 'error' in result;
}
```

### Zod as Single Source (cross-reference to `typescript-zod`)
```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
});

type User = z.infer<typeof UserSchema>;
type CreateUserDto = z.infer<typeof UserSchema.omit({ id: true })>;
```

### API Endpoint Type Map
```typescript
interface ApiEndpoints {
  'GET /users': { response: User[] };
  'GET /users/:id': { params: { id: string }; response: User };
  'POST /users': { body: CreateUserDto; response: User };
  'PUT /users/:id': { params: { id: string }; body: UpdateUserDto; response: User };
  'DELETE /users/:id': { params: { id: string }; response: void };
}

async function api<K extends keyof ApiEndpoints>(
  endpoint: K,
  options?: Omit<ApiEndpoints[K], 'response'>
): Promise<ApiEndpoints[K]['response']> {
  // typed client
}
```

---

## Anti-Patterns

- `any` — use `unknown` + type guards
- Generic where not needed — don't abstract a single concrete type
- Too many generics (3+) — readability suffers
- No constraints on generics — add `extends` when structure is required
- Duplicate types frontend/backend — single source (Zod schema or shared package)
- Manual type assertions instead of type guards — skips runtime safety
- Missing `strict: true` in tsconfig
- Manual JSON date parsing — use consistent ISO strings throughout

## Verification Checklist

- [ ] `strict: true` in `tsconfig.json`
- [ ] No `any` without justification
- [ ] Type guards for runtime narrowing
- [ ] Utility types over manual definitions
- [ ] Generics have descriptive names (T, TItem, TResponse) and constraints
- [ ] DTOs derived from base entity (Omit / Pick / Partial)
- [ ] API response/error types centralized
- [ ] Zod inferred types — no duplication

## Related Skills

- `typescript-zod` — runtime schema validation (separate)
- `api-design` — REST + error + validation patterns using these types
- `schema-driven-design` — types derived from DB metadata
- `react-19-patterns` — generic hooks and components
