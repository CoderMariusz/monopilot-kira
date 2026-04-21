---
name: nextjs-v16-patterns
description: Consolidated Next.js 16 patterns — App Router, React Server Components, Server Actions, and Middleware/Proxy. Covers async params, useActionState (React 19), RSC composition, and proxy.ts matcher rules.
tags: [nextjs, react, frontend, server-components, server-actions, middleware]
---

## When to Use

Apply when building Next.js 16 applications — choosing between server and client components, handling routing with async `params`/`searchParams`, wiring form mutations via Server Actions with `useActionState`, or adding middleware/proxy for auth, headers, or A/B testing.

**Version Context**: Next.js 16 + React 19. `params` and `searchParams` are now `Promise` (must be awaited). `useActionState` replaces deprecated `useFormState`. Next.js 16 introduces `proxy.ts` as the successor to `middleware.ts` (legacy `middleware.ts` still works — project convention decides; Monopilot keeps `middleware.ts`).

---

## 1. App Router

### Route Structure
```
app/
├── layout.tsx          # Root layout (required)
├── page.tsx            # Home page (/)
├── loading.tsx         # Loading UI
├── error.tsx           # Error boundary
├── dashboard/
│   ├── layout.tsx      # Nested layout
│   ├── page.tsx        # /dashboard
│   └── [id]/
│       └── page.tsx    # /dashboard/:id
└── api/
    └── users/
        └── route.ts    # API route /api/users
```
Source: https://nextjs.org/docs/app/building-your-application/routing

### Dynamic Route Params (Next.js 16 — async!)
```typescript
// app/posts/[id]/page.tsx
interface Props {
  params: Promise<{ id: string }>;
}

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  const post = await getPost(id);
  return <article>{post.content}</article>;
}
```
Source: https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes

### Search Params (also Promise in Next.js 16)
```typescript
interface Props {
  searchParams: Promise<{ sort?: string; page?: string }>;
}

export default async function ShopPage({ searchParams }: Props) {
  const { sort, page } = await searchParams;
  const products = await getProducts({ sort, page: Number(page) || 1 });
  return <ProductList products={products} />;
}
```
Source: https://nextjs.org/docs/messages/sync-dynamic-apis

### Metadata for SEO
```typescript
export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const post = await getPost(id);
  return { title: post.title, description: post.excerpt };
}
```

---

## 2. React Server Components (RSC)

### Default: Server Components
```tsx
// app/page.tsx — Server Component by default
async function Page() {
  const data = await db.query('SELECT * FROM posts');
  return <PostList posts={data} />;
}

// Direct DB/API access, secrets never sent to client, zero client JS
```

### Client Component (`'use client'`)
```tsx
'use client'
// Only add when you NEED:
// - useState, useEffect, useContext
// - Event handlers (onClick, onChange)
// - Browser APIs (localStorage, window)

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### Composition Pattern
```tsx
// Server component (parent) composes client + server children
async function Dashboard() {
  const user = await getUser();
  return (
    <div>
      <UserInfo user={user} />         {/* Server */}
      <InteractiveChart initialData={user} />  {/* Client, server data as props */}
    </div>
  );
}
```

### Parallel Data Fetching
```tsx
async function Page() {
  const [posts, user] = await Promise.all([getPosts(), getUser()]);
  return <Feed posts={posts} user={user} />;
}
```

---

## 3. Server Actions

### Basic Server Action
```typescript
// app/actions.ts
'use server'
import { revalidatePath } from 'next/cache';

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string;
  await db.insert({ title });
  revalidatePath('/posts');
}
```

### With Zod Validation
```typescript
'use server'
import { z } from 'zod';
import { redirect } from 'next/navigation';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function register(formData: FormData) {
  const result = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!result.success) {
    return { error: result.error.flatten() };
  }

  await createUser(result.data);
  redirect('/dashboard');
}
```

### `useActionState` (React 19 / Next.js 16+)
```tsx
'use client'
import { useActionState } from 'react';
import { register } from './actions';

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, null);

  return (
    <form action={action}>
      <input name="email" />
      {state?.error?.email && <p>{state.error.email}</p>}
      <button disabled={pending}>{pending ? 'Loading...' : 'Submit'}</button>
    </form>
  );
}
```

### Event Handler with `useTransition`
```tsx
'use client'
import { useTransition } from 'react';

export function ProfileButton() {
  const [isPending, startTransition] = useTransition();
  return (
    <button onClick={() => startTransition(async () => { await updateProfile(); })}>
      {isPending ? 'Saving...' : 'Update'}
    </button>
  );
}
```

**Monopilot note**: Monopilot uses **react-hook-form + zodResolver** for form handling, not Server Actions. Server Actions are used only for simple mutations (e.g. `revalidatePath` after a data change). See `monopilot-patterns` Pattern 7.

---

## 4. Middleware / Proxy

### Basic Proxy (Next.js 16+)
```typescript
// proxy.ts (project root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

### Legacy Middleware (Next.js 15 and earlier — still works in 16)
```typescript
// middleware.ts (project root)
export function middleware(request: NextRequest) {
  return NextResponse.next();
}
```

**Migration**: `npx @next/codemod@canary middleware-to-proxy .` auto-migrates.

### Auth Redirect
```typescript
export function proxy(request: NextRequest) {
  const token = request.cookies.get('session');
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}
```

### Security Headers
```typescript
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
```

### Matcher Patterns
```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',  // all except statics
    '/dashboard/:path*',
    {
      source: '/api/:path*',
      has: [{ type: 'header', key: 'Authorization' }],
      missing: [{ type: 'cookie', key: 'session' }],
    },
  ],
};
```

**Monopilot note**: Monopilot uses Next.js 16 with `middleware.ts` (legacy). Do NOT run the middleware-to-proxy codemod. Auth is handled via Supabase session cookies checked in the authenticated layout, not in middleware.

---

## Anti-Patterns (All Areas)

- `'use client'` on every component — defeats RSC benefits
- Fetching in client components when server RSC could do it
- Direct DB in client — use API routes or Server Actions
- Accessing `params`/`searchParams` without `await` (Next.js 16 breaks)
- Using `useFormState` in Next.js 16+ (deprecated — use `useActionState`)
- Heavy computation, DB calls, or large deps in middleware/proxy
- Missing `matcher` config (runs on ALL routes by default)
- Passing functions as props from Server → Client (non-serializable)
- Forgetting `revalidatePath`/`revalidateTag` after mutation

## Verification Checklist

- [ ] Server components for data fetching by default
- [ ] `'use client'` only where interactivity required
- [ ] `params` and `searchParams` awaited in Next.js 16
- [ ] `loading.tsx` for async pages
- [ ] `useActionState` (not `useFormState`) for Next 16+
- [ ] Server actions validate input with Zod
- [ ] `revalidatePath` / `revalidateTag` after mutations
- [ ] Middleware/proxy has `matcher` (not running on statics)
- [ ] No heavy DB work in middleware/proxy

## Related Skills

- `nextjs-api-routes` — route.ts handlers (separate skill)
- `nextjs-data-fetching` — cache & RSC data strategies
- `react-19-patterns` — hooks including `useActionState`, `useEffectEvent`
- `api-design` — REST + error handling + validation patterns for route handlers
- `monopilot-patterns` — project-specific wiring (auth context, error hierarchy)
