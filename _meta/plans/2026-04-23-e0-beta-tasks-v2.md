---
title: Phase E-0 Track β — 00-c + 00-d + 00-e (v2 ACP format)
date: 2026-04-23
sub-modules: 00-c, 00-d, 00-e
total_tasks: 16
format: v2 — full ACP Submit + ACP Prompt sections
---

# Phase E-0 Track β — Auth + RLS + Audit (v2 ACP format)

Sub-modules covered:
- **00-c** — Auth + session + `app.current_org_id` middleware (6 tasks)
- **00-d** — RLS baseline (5 tasks)
- **00-e** — Audit log infrastructure (5 tasks)

---

## T-00c-001 — Supabase Auth schema migration + `public.users` FK

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-c auth
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — Baseline migration `001-baseline.sql`]
- **Downstream (will consume this):** [T-00c-002 — Email+password Server Actions, T-00c-003 — Next.js middleware]
- **Parallel (can run concurrently):** [T-00d-001 — RLS policy generator helper, T-00e-001 — audit_log migration]

### GIVEN / WHEN / THEN
**GIVEN** Supabase local has `auth.users` (GoTrue schema) and `public.users` exists from baseline migration `001-baseline.sql`
**WHEN** migration `003-auth-users.sql` is applied
**THEN** `public.users` has a FK `auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`, a trigger `on_auth_user_created` mirrors `email` from `auth.users` into `public.users` on INSERT into `auth.users`, and the integration test confirms a GoTrue signup creates the matching `public.users` row

### ACP Prompt
````
# Task T-00c-001 — Supabase Auth schema migration + `public.users` FK

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00c-001` — auth schema migration spec
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00b-000` — baseline schema (public.users columns)
- `packages/db/schema/baseline.ts` → cały plik — istniejące typy Drizzle dla `public.users`

## Twoje zadanie
Bazowa tabela `public.users` istnieje z migracji `001-baseline.sql`. Musisz dowiązać ją do GoTrue `auth.users`:
1. Dodaj kolumnę `auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE` do `public.users`
2. Napisz trigger PL/pgSQL `on_auth_user_created()` który po INSERT do `auth.users` wstawia lub aktualizuje odpowiedni wiersz w `public.users` z polem `email = NEW.email`
3. Zaktualizuj Drizzle schema types żeby odzwierciedlały `auth_user_id`

## Implementacja
1. Utwórz `drizzle/migrations/003-auth-users.sql` z:
   ```sql
   ALTER TABLE public.users
     ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

   CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
   RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
   BEGIN
     INSERT INTO public.users (id, auth_user_id, email, tenant_id, created_at, schema_version)
     VALUES (
       gen_random_uuid(),
       NEW.id,
       NEW.email,
       (NEW.raw_user_meta_data->>'tenant_id')::uuid,
       now(),
       1
     )
     ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email;
     RETURN NEW;
   END;
   $$;

   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
   ```
2. Uruchom `pnpm drizzle-kit generate` aby wygenerować Drizzle migration diff — sprawdź że `auth_user_id` pojawia się w `packages/db/schema/baseline.ts`
3. Zmodyfikuj `packages/db/schema/baseline.ts` — dodaj `authUserId: uuid('auth_user_id').references(() => authUsers.id, { onDelete: 'cascade' })` do tabeli `users`
4. Napisz test integracyjny `tests/auth/auth-users.integration.test.ts`:
   - Wywołaj `supabase.auth.admin.createUser({ email: 'test@example.com', password: 'test1234', user_metadata: { tenant_id: '<seed-tenant-id>' } })`
   - Assercja: `SELECT * FROM public.users WHERE auth_user_id = '<new-auth-id>'` zwraca 1 wiersz z `email = 'test@example.com'`

## Files
**Create:** `drizzle/migrations/003-auth-users.sql`, `tests/auth/auth-users.integration.test.ts`
**Modify:** `packages/db/schema/baseline.ts` — dodaj `authUserId` column + export updated type

## Done when
- `vitest tests/auth/auth-users.integration.test.ts` PASS — sprawdza: GoTrue INSERT → public.users row created z email mirrored
- `pnpm test:smoke` green

## Rollback
`psql -c "DROP TRIGGER on_auth_user_created ON auth.users; DROP FUNCTION public.handle_new_auth_user(); ALTER TABLE public.users DROP COLUMN auth_user_id;"`
````

### Test gate (planning summary)
- **Integration:** `vitest tests/auth/auth-users.integration.test.ts` — covers: auth.users INSERT → public.users mirror trigger
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TRIGGER on_auth_user_created ON auth.users; DROP FUNCTION handle_new_auth_user(); ALTER TABLE public.users DROP COLUMN auth_user_id;`
## T-00c-002 — Email+password signup/login Server Actions

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-001 — Supabase Auth schema migration, T-00b-E01 — permissions.enum.ts lock, T-00b-E02 — events.enum.ts lock]
- **Downstream (will consume this):** [T-00c-004 — Login page UI, T-00c-005 — Logout Server Action]
- **Parallel (can run concurrently):** [T-00c-003 — Next.js middleware]

### GIVEN / WHEN / THEN
**GIVEN** `auth.users` ↔ `public.users` sync trigger exists and `outbox_events` table is available
**WHEN** `signupAction({ email, password, tenantId })` or `loginAction({ email, password })` is called from a Next.js Server Component
**THEN** on success: GoTrue session cookie is set via `@supabase/ssr` cookies helper, an `user.signed_up` or `user.logged_in` outbox event is emitted in the same DB transaction; on invalid input: Zod-typed errors are returned (no exception thrown); on GoTrue error: `{ error: string }` is returned

### ACP Prompt
````
# Task T-00c-002 — Email+password signup/login Server Actions

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00c-002` — Server Actions spec
- `lib/rbac/permissions.enum.ts` → lista permission strings
- `lib/outbox/events.enum.ts` → EventType enum values

## Twoje zadanie
Zaimplementuj dwa Next.js Server Actions (`"use server"`) dla auth:
- `signupAction` — rejestracja nowego użytkownika
- `loginAction` — logowanie istniejącego użytkownika

Oba muszą: walidować input Zod, wywoływać Supabase GoTrue, ustawiać cookie sesji przez `@supabase/ssr`, emitować outbox event.

## Implementacja
1. Utwórz `apps/web/actions/auth/signup.ts`:
   ```typescript
   "use server";
   import { z } from "zod";
   import { createServerClient } from "@supabase/ssr";
   import { cookies } from "next/headers";
   import { insertOutboxEvent } from "lib/outbox/insert-outbox-event";
   import { EventType } from "lib/outbox/events.enum";
   import { db } from "packages/db";

   const SignupSchema = z.object({
     email: z.string().email(),
     password: z.string().min(8),
     tenantId: z.string().uuid(),
   });

   export async function signupAction(input: unknown) {
     const parsed = SignupSchema.safeParse(input);
     if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
     const cookieStore = cookies();
     const supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       { cookies: { get: (n) => cookieStore.get(n)?.value, set: (n, v, o) => cookieStore.set(n, v, o), remove: (n, o) => cookieStore.delete({ name: n, ...o }) } }
     );
     const { data, error } = await supabase.auth.signUp({
       email: parsed.data.email,
       password: parsed.data.password,
       options: { data: { tenant_id: parsed.data.tenantId } },
     });
     if (error || !data.user) return { error: error?.message ?? "Signup failed" };
     await insertOutboxEvent(db, {
       tenantId: parsed.data.tenantId,
       eventType: EventType.USER_SIGNED_UP,
       aggregateType: "user",
       aggregateId: data.user.id,
       payload: { email: parsed.data.email },
     });
     return { success: true };
   }
   ```
2. Utwórz `apps/web/actions/auth/login.ts` analogicznie z:
   - Schema: `{ email: z.string().email(), password: z.string().min(1) }`
   - GoTrue call: `supabase.auth.signInWithPassword({ email, password })`
   - Outbox: `EventType.USER_LOGGED_IN` z `aggregateId = data.user.id`, `tenantId` z `data.user.user_metadata.tenant_id`
   - Return: `{ success: true }` lub `{ error: string }`
3. Utwórz `apps/web/actions/auth/signup.test.ts` i `login.test.ts`:
   - Happy path: mock GoTrue → assert cookie set + outbox insert called
   - Bad input: assert Zod errors returned, GoTrue not called
   - GoTrue error: assert `{ error: 'Invalid login credentials' }` returned

## Files
**Create:** `apps/web/actions/auth/signup.ts`, `apps/web/actions/auth/login.ts`, `apps/web/actions/auth/signup.test.ts`, `apps/web/actions/auth/login.test.ts`

## Done when
- `vitest apps/web/actions/auth/signup.test.ts` PASS — sprawdza: Zod validation + GoTrue call + outbox emit
- `vitest apps/web/actions/auth/login.test.ts` PASS — sprawdza: happy path + error path
- `pnpm test:smoke` green

## Rollback
`rm apps/web/actions/auth/signup.ts apps/web/actions/auth/login.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/actions/auth/signup.test.ts` + `login.test.ts` — covers: Zod validation, GoTrue call, outbox emit, error paths
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/actions/auth/signup.ts apps/web/actions/auth/login.ts`
## T-00c-003 — Next.js middleware: session extraction + `app.current_org_id` setter

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-001 — Supabase Auth schema migration, T-00b-006 — Supabase client singleton]
- **Downstream (will consume this):** [T-00d-002 — RLS baseline migration, T-00d-003 — LEAKPROOF wrappers, T-00c-006 — E2E auth flow]
- **Parallel (can run concurrently):** [T-00c-002 — signup/login Server Actions]

### GIVEN / WHEN / THEN
**GIVEN** a request arrives with a valid Supabase session cookie set by `@supabase/ssr`
**WHEN** `apps/web/middleware.ts` executes on any route under `/(app)/`
**THEN** (1) the active `org_id` is resolved from `user_tenants.tenant_id` WHERE `user_tenants.user_id = session.user.id LIMIT 1` (or from `active_org_id` cookie if present), (2) it is stashed in request header `x-org-id`, (3) a `withOrgContext(db, orgId)` call executes `SET LOCAL app.current_org_id = '<orgId>'` so RLS policies evaluate correctly; unauthenticated requests redirect to `/login`

### ACP Prompt
````
# Task T-00c-003 — Next.js middleware: session extraction + `app.current_org_id` setter

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00c-003` — middleware spec
- `packages/db/schema/baseline.ts` → tabele `user_tenants`, `users` — kolumny i relacje

## Twoje zadanie
Zaimplementuj `apps/web/middleware.ts` który:
1. Weryfikuje sesję Supabase
2. Jeśli nie ma sesji → redirect do `/login`
3. Jeśli sesja istnieje → rozwiązuje aktywny `org_id` użytkownika
4. Ustawia `x-org-id` w nagłówku requestu
5. Eksportuje pomocnik `withOrgContext(db, orgId)` dla Server Actions/Routes

## Implementacja
1. Utwórz `apps/web/middleware.ts`:
   ```typescript
   import { createServerClient } from "@supabase/ssr";
   import { NextResponse } from "next/server";
   import type { NextRequest } from "next/server";

   export async function middleware(request: NextRequest) {
     const response = NextResponse.next({
       request: { headers: request.headers },
     });
     const supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           get: (n) => request.cookies.get(n)?.value,
           set: (n, v, o) => { response.cookies.set({ name: n, value: v, ...o }); },
           remove: (n, o) => { response.cookies.delete({ name: n, ...o }); },
         },
       }
     );
     const { data: { session } } = await supabase.auth.getSession();
     if (!session) {
       return NextResponse.redirect(new URL("/login", request.url));
     }
     // Resolve active org_id
     const orgIdCookie = request.cookies.get("active_org_id")?.value;
     let orgId = orgIdCookie;
     if (!orgId) {
       const { data: tenantRow } = await supabase
         .from("user_tenants")
         .select("tenant_id")
         .eq("user_id", session.user.id)
         .limit(1)
         .single();
       orgId = tenantRow?.tenant_id;
     }
     if (!orgId) {
       return NextResponse.redirect(new URL("/login", request.url));
     }
     response.headers.set("x-org-id", orgId);
     response.headers.set("x-user-id", session.user.id);
     return response;
   }

   export const config = {
     matcher: ["/(app)/:path*", "/api/((?!auth).*)"],
   };
   ```
2. Utwórz `packages/db/rls-context.ts`:
   ```typescript
   import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
   import { sql } from "drizzle-orm";

   export async function withOrgContext<T>(
     db: PostgresJsDatabase,
     orgId: string,
     userId: string,
     fn: () => Promise<T>
   ): Promise<T> {
     return db.transaction(async (tx) => {
       await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
       await tx.execute(sql`SELECT set_config('app.current_actor_id', ${userId}, true)`);
       return fn();
     });
   }
   ```
3. Napisz `apps/web/middleware.test.ts`:
   - Scenario 1: no session cookie → expect redirect to `/login`
   - Scenario 2: valid session + `active_org_id` cookie → expect `x-org-id` header set
   - Scenario 3: valid session, no cookie, `user_tenants` row exists → expect `x-org-id` header set from DB lookup

## Files
**Create:** `apps/web/middleware.ts`, `apps/web/middleware.test.ts`, `packages/db/rls-context.ts`

## Done when
- `vitest apps/web/middleware.test.ts` PASS — sprawdza: unauthenticated redirect + org_id header injection
- `pnpm test:smoke` green

## Rollback
`rm apps/web/middleware.ts packages/db/rls-context.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/middleware.test.ts` — covers: unauthenticated redirect, org_id resolution from cookie, org_id from DB fallback
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/middleware.ts packages/db/rls-context.ts`
## T-00c-004 — Login page UI (shadcn Form + RHF + Zod)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 00-c auth
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-002 — signup/login Server Actions, T-00a-003 — shadcn/UI setup]
- **Downstream (will consume this):** [T-00c-006 — E2E auth flow]
- **Parallel (can run concurrently):** [T-00c-005 — Logout Server Action]

### GIVEN / WHEN / THEN
**GIVEN** `loginAction` Server Action exists and shadcn/ui is installed
**WHEN** a user navigates to `/login`
**THEN** a page renders with email input, password input, submit button; invalid input shows inline Zod field errors before submit; on submit a loading spinner replaces the button; on GoTrue error an `<Alert variant="destructive">` banner renders with the error message; on success Next.js `redirect('/app/dashboard')` fires

### ACP Prompt
````
# Task T-00c-004 — Login page UI (shadcn Form + RHF + Zod)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00c-004` — Login page UI spec
- `apps/web/actions/auth/login.ts` → sygnatura `loginAction` i kształt return

## Twoje zadanie
Zbuduj stronę `/login` z formularzem email+password używając:
- shadcn/ui primitives: `Form`, `FormField`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Alert`, `AlertDescription`
- React Hook Form z `zodResolver`
- `useFormState` / `useTransition` do wywołania Server Action

Validacja client-side (Zod) + server-side error display.

## Implementacja
1. Utwórz `apps/web/app/(auth)/login/page.tsx`:
   ```typescript
   import { LoginForm } from "@/components/auth/login-form";
   export default function LoginPage() {
     return (
       <div className="flex min-h-screen items-center justify-center">
         <div className="w-full max-w-sm space-y-6 p-8">
           <h1 className="text-2xl font-bold">Zaloguj się</h1>
           <LoginForm />
         </div>
       </div>
     );
   }
   ```
2. Utwórz `apps/web/components/auth/login-form.tsx`:
   ```typescript
   "use client";
   import { useForm } from "react-hook-form";
   import { zodResolver } from "@hookform/resolvers/zod";
   import { z } from "zod";
   import { useTransition } from "react";
   import { loginAction } from "@/actions/auth/login";
   import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
   import { Input } from "@/components/ui/input";
   import { Button } from "@/components/ui/button";
   import { Alert, AlertDescription } from "@/components/ui/alert";

   const LoginSchema = z.object({
     email: z.string().email("Podaj prawidłowy e-mail"),
     password: z.string().min(1, "Hasło jest wymagane"),
   });
   type LoginValues = z.infer<typeof LoginSchema>;

   export function LoginForm() {
     const [isPending, startTransition] = useTransition();
     const [serverError, setServerError] = useState<string | null>(null);
     const form = useForm<LoginValues>({ resolver: zodResolver(LoginSchema) });

     function onSubmit(values: LoginValues) {
       setServerError(null);
       startTransition(async () => {
         const result = await loginAction(values);
         if (result?.error) setServerError(result.error);
       });
     }

     return (
       <Form {...form}>
         {serverError && (
           <Alert variant="destructive">
             <AlertDescription>{serverError}</AlertDescription>
           </Alert>
         )}
         <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
           <FormField control={form.control} name="email" render={({ field }) => (
             <FormItem>
               <FormLabel>E-mail</FormLabel>
               <FormControl><Input type="email" placeholder="jan@firma.pl" {...field} /></FormControl>
               <FormMessage />
             </FormItem>
           )} />
           <FormField control={form.control} name="password" render={({ field }) => (
             <FormItem>
               <FormLabel>Hasło</FormLabel>
               <FormControl><Input type="password" {...field} /></FormControl>
               <FormMessage />
             </FormItem>
           )} />
           <Button type="submit" className="w-full" disabled={isPending}>
             {isPending ? <Skeleton className="h-4 w-16" /> : "Zaloguj"}
           </Button>
         </form>
       </Form>
     );
   }
   ```
3. Dodaj `useState` import do `apps/web/components/auth/login-form.tsx`
4. Napisz `apps/web/components/auth/login-form.test.tsx` (RTL):
   - render → form pojawia się
   - submit bez danych → inline Zod errors widoczne
   - mock `loginAction` returning `{ error: 'Invalid credentials' }` → Alert variant destructive renders

## Files
**Create:** `apps/web/app/(auth)/login/page.tsx`, `apps/web/components/auth/login-form.tsx`, `apps/web/components/auth/login-form.test.tsx`

## Prototype reference
Plik: `design/Monopilot Design System/scanner/login.jsx` linie 5-56
component_type: form
ui_pattern: crud-form-with-validation
shadcn_equivalent: Input, Button, Alert, AlertDescription, Form, FormField, FormItem, FormMessage
estimated_translation_time_min: 75
Translation checklist:
- [ ] Replace window.Modal → @radix-ui/react-dialog Dialog
- [ ] Convert useState form → useForm + zodResolver(loginSchema)
- [ ] Wire Server Action signInWithEmailPassword
- [ ] Error state → shadcn Alert variant="destructive" with FormMessage
- [ ] Replace hardcoded strings → next-intl keys

## Done when
- `vitest apps/web/components/auth/login-form.test.tsx` PASS — sprawdza: form renders, Zod errors visible, server error in Alert
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/app/(auth)/login apps/web/components/auth/login-form.tsx`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/auth/login-form.test.tsx` — covers: render, client Zod validation, server error display
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/app/(auth)/login apps/web/components/auth/login-form.tsx`
## T-00c-005 — Logout Server Action + session invalidation

**Type:** T2-api
**Context budget:** ~30k tokens
**Est time:** 25 min
**Parent feature:** 00-c auth
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-002 — signup/login Server Actions]
- **Downstream (will consume this):** [T-00c-006 — E2E auth flow]
- **Parallel (can run concurrently):** [T-00c-004 — Login page UI]

### GIVEN / WHEN / THEN
**GIVEN** an authenticated Supabase session cookie is present in the request
**WHEN** `logoutAction()` is called (Server Action, `"use server"`)
**THEN** `supabase.auth.signOut()` revokes the GoTrue session, the `sb-*` session cookie is deleted via `@supabase/ssr` cookies helper, a `user.logged_out` outbox event row is inserted with `aggregateType: 'user'` and `aggregateId: session.user.id`, and the caller receives `{ success: true }`

### ACP Prompt
````
# Task T-00c-005 — Logout Server Action + session invalidation

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00c-005` — Logout spec
- `lib/outbox/events.enum.ts` → EventType.USER_LOGGED_OUT value
- `apps/web/actions/auth/login.ts` → wzorzec tworzenia supabase client w Server Action

## Twoje zadanie
Jeden Server Action `logoutAction()` który:
1. Tworzy `@supabase/ssr` server client z `cookies()`
2. Pobiera aktualną sesję (dla `user.id` i `tenant_id` do outbox)
3. Wywołuje `supabase.auth.signOut()`
4. Emituje outbox event `EventType.USER_LOGGED_OUT`
5. Zwraca `{ success: true }` lub `{ error: string }`

## Implementacja
1. Utwórz `apps/web/actions/auth/logout.ts`:
   ```typescript
   "use server";
   import { createServerClient } from "@supabase/ssr";
   import { cookies } from "next/headers";
   import { insertOutboxEvent } from "lib/outbox/insert-outbox-event";
   import { EventType } from "lib/outbox/events.enum";
   import { db } from "packages/db";

   export async function logoutAction() {
     const cookieStore = cookies();
     const supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           get: (n) => cookieStore.get(n)?.value,
           set: (n, v, o) => cookieStore.set(n, v, o),
           remove: (n, o) => cookieStore.delete({ name: n, ...o }),
         },
       }
     );
     const { data: { session } } = await supabase.auth.getSession();
     if (!session) return { error: "No active session" };

     const tenantId = session.user.user_metadata?.tenant_id as string;
     const { error } = await supabase.auth.signOut();
     if (error) return { error: error.message };

     await insertOutboxEvent(db, {
       tenantId,
       eventType: EventType.USER_LOGGED_OUT,
       aggregateType: "user",
       aggregateId: session.user.id,
       payload: { email: session.user.email },
     });
     return { success: true };
   }
   ```
2. Napisz `apps/web/actions/auth/logout.test.ts`:
   - Happy path: mock GoTrue `signOut` → assert outbox `insertOutboxEvent` called with `eventType: 'user.logged_out'`
   - No session path: assert `{ error: 'No active session' }` returned, outbox NOT called
   - GoTrue error path: assert `{ error: '...' }` returned

## Files
**Create:** `apps/web/actions/auth/logout.ts`, `apps/web/actions/auth/logout.test.ts`

## Done when
- `vitest apps/web/actions/auth/logout.test.ts` PASS — sprawdza: session revoke + outbox emit + no-session error
- `pnpm test:smoke` green

## Rollback
`rm apps/web/actions/auth/logout.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/actions/auth/logout.test.ts` — covers: signOut call, outbox emit, no-session guard
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/actions/auth/logout.ts`
## T-00c-006 — E2E: login → middleware sets org_id → logout

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-003 — Next.js middleware, T-00c-004 — Login page UI, T-00c-005 — Logout Server Action, T-00i-005 — forza-baseline seed (or equivalent seed task)]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** a seeded `forza-baseline` DB with user `jan@forza.pl` / `Test1234!` belonging to tenant `forza-tenant-id`
**WHEN** Playwright navigates to `/login`, submits the known credentials, then calls `GET /api/whoami`, then clicks logout
**THEN** step 1: redirect to `/(app)/dashboard` (200, no redirect loop); step 2: `/api/whoami` returns JSON `{ userId: '<uuid>', orgId: 'forza-tenant-id' }` read from `current_setting('app.current_org_id')`; step 3: post-logout navigation to `/(app)/` redirects back to `/login`

### ACP Prompt
````
# Task T-00c-006 — E2E: login → middleware sets org_id → logout

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00c-006` — E2E spec
- `apps/web/middleware.ts` — jak ustawia x-org-id header
- `packages/db/rls-context.ts` — withOrgContext, set_config call

## Twoje zadanie
Dodaj route `GET /api/whoami` i Playwright spec `e2e/auth.spec.ts` który:
1. Loguje użytkownika przez UI
2. Sprawdza że middleware prawidłowo propaguje `app.current_org_id`
3. Weryfikuje logout flow

Seeded user: `email: 'jan@forza.pl'`, `password: 'Test1234!'`, `tenant_id: 'forza-tenant-id'` (z `forza-baseline` snapshot).

## Implementacja
1. Utwórz `apps/web/app/api/whoami/route.ts`:
   ```typescript
   import { NextResponse } from "next/server";
   import { headers } from "next/headers";
   import { db } from "packages/db";
   import { sql } from "drizzle-orm";
   import { withOrgContext } from "packages/db/rls-context";

   export async function GET() {
     const headersList = headers();
     const orgId = headersList.get("x-org-id");
     const userId = headersList.get("x-user-id");
     if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

     const result = await withOrgContext(db, orgId, userId, async () => {
       const [row] = await db.execute(sql`SELECT current_setting('app.current_org_id', true) as org_id`);
       return row;
     });
     return NextResponse.json({ userId, orgId: result.org_id });
   }
   ```
2. Utwórz `e2e/auth.spec.ts`:
   ```typescript
   import { test, expect } from "@playwright/test";

   test("login → whoami has org_id → logout redirects", async ({ page }) => {
     // Step 1: Login
     await page.goto("/login");
     await page.getByLabel("E-mail").fill("jan@forza.pl");
     await page.getByLabel("Hasło").fill("Test1234!");
     await page.getByRole("button", { name: "Zaloguj" }).click();
     await expect(page).toHaveURL(/\/app\/dashboard/);

     // Step 2: whoami returns correct org_id
     const resp = await page.request.get("/api/whoami");
     expect(resp.status()).toBe(200);
     const body = await resp.json();
     expect(body.orgId).toBe("forza-tenant-id");
     expect(body.userId).toMatch(/^[0-9a-f-]{36}$/);

     // Step 3: Logout redirects to /login
     await page.getByRole("button", { name: /logout|wyloguj/i }).click();
     await expect(page).toHaveURL("/login");

     // Step 4: Accessing protected route redirects back to /login
     await page.goto("/app/dashboard");
     await expect(page).toHaveURL("/login");
   });
   ```
3. Upewnij się że `playwright.config.ts` ma `baseURL: 'http://localhost:3000'` i `webServer` z `pnpm dev`

## Files
**Create:** `apps/web/app/api/whoami/route.ts`, `e2e/auth.spec.ts`
**Modify:** `playwright.config.ts` — dodaj webServer config jeśli brak

## Done when
- `playwright e2e/auth.spec.ts` PASS — sprawdza: login redirect + whoami org_id + logout redirect
- `pnpm test:smoke` green

## Rollback
`rm apps/web/app/api/whoami/route.ts e2e/auth.spec.ts`
````

### Test gate (planning summary)
- **E2E:** `playwright e2e/auth.spec.ts` — covers: full login → middleware → whoami → logout flow
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/app/api/whoami/route.ts e2e/auth.spec.ts`
## T-00d-001 — RLS policy generator helper (`policyFor(table)`)

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — Baseline migration `001-baseline.sql`]
- **Downstream (will consume this):** [T-00d-002 — RLS baseline migration]
- **Parallel (can run concurrently):** [T-00c-001 — Supabase Auth schema migration]

### GIVEN / WHEN / THEN
**GIVEN** baseline tables exist with `tenant_id UUID NOT NULL` column
**WHEN** `policyFor('fa')` is called
**THEN** it returns an object with 4 SQL fragment strings: `enableRls` (`ALTER TABLE fa ENABLE ROW LEVEL SECURITY`), `selectPolicy`, `insertPolicy`, `updateDeletePolicy` — all using `USING (tenant_id = current_setting('app.current_org_id', true)::uuid)` and `WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid)`

### ACP Prompt
````
# Task T-00d-001 — RLS policy generator helper (`policyFor(table)`)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00d-001` — policyFor spec

## Twoje zadanie
Napisz TypeScript helper `policyFor(tableName: string)` który generuje SQL fragmenty dla Row Level Security. Używamy `current_setting('app.current_org_id', true)::uuid` (drugi arg `true` = nie rzuca błędu gdy nieustalone — zwraca NULL, RLS policy naturalnie odmówi dostępu).

Generowane policies dla każdej tabeli:
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`
- SELECT policy: `USING (tenant_id = current_setting('app.current_org_id', true)::uuid)`
- INSERT policy: `WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid)`
- UPDATE policy: `USING (...) WITH CHECK (...)`
- DELETE policy: `USING (...)`

## Implementacja
1. Utwórz `packages/db/rls/policy-for.ts`:
   ```typescript
   export interface RlsPolicySql {
     enableRls: string;
     selectPolicy: string;
     insertPolicy: string;
     updatePolicy: string;
     deletePolicy: string;
   }

   const ORG_CHECK = `current_setting('app.current_org_id', true)::uuid`;

   export function policyFor(table: string): RlsPolicySql {
     return {
       enableRls: [
         `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
         `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`,
       ].join('\n'),
       selectPolicy: `
   CREATE POLICY "${table}_tenant_select" ON ${table}
     AS PERMISSIVE FOR SELECT
     TO app_role
     USING (tenant_id = ${ORG_CHECK});`,
       insertPolicy: `
   CREATE POLICY "${table}_tenant_insert" ON ${table}
     AS PERMISSIVE FOR INSERT
     TO app_role
     WITH CHECK (tenant_id = ${ORG_CHECK});`,
       updatePolicy: `
   CREATE POLICY "${table}_tenant_update" ON ${table}
     AS PERMISSIVE FOR UPDATE
     TO app_role
     USING (tenant_id = ${ORG_CHECK})
     WITH CHECK (tenant_id = ${ORG_CHECK});`,
       deletePolicy: `
   CREATE POLICY "${table}_tenant_delete" ON ${table}
     AS PERMISSIVE FOR DELETE
     TO app_role
     USING (tenant_id = ${ORG_CHECK});`,
     };
   }

   export function allPoliciesFor(table: string): string {
     const p = policyFor(table);
     return [p.enableRls, p.selectPolicy, p.insertPolicy, p.updatePolicy, p.deletePolicy].join('\n\n');
   }
   ```
2. Napisz `packages/db/rls/policy-for.test.ts`:
   - assert `policyFor('fa').enableRls` zawiera `ALTER TABLE fa ENABLE ROW LEVEL SECURITY`
   - assert `policyFor('fa').selectPolicy` zawiera `USING (tenant_id = current_setting('app.current_org_id', true)::uuid)`
   - assert `policyFor('fa').insertPolicy` zawiera `WITH CHECK`
   - assert `allPoliciesFor('fa')` jest non-empty string zawierający wszystkie 4 klauzule

## Files
**Create:** `packages/db/rls/policy-for.ts`, `packages/db/rls/policy-for.test.ts`

## Done when
- `vitest packages/db/rls/policy-for.test.ts` PASS — sprawdza: SQL shape dla wszystkich 4 policy types
- `pnpm test:smoke` green

## Rollback
`rm packages/db/rls/policy-for.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest packages/db/rls/policy-for.test.ts` — covers: SQL shape assertions for enable RLS + all 4 policy types
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm packages/db/rls/policy-for.ts`
## T-00d-002 — Migration `004-rls-baseline.sql` (enable RLS on 7 baseline tables)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00d-001 — policyFor helper, T-00c-003 — Next.js middleware (sets app.current_org_id)]
- **Downstream (will consume this):** [T-00d-004 — cross-tenant leak regression tests]
- **Parallel (can run concurrently):** [T-00d-003 — LEAKPROOF SECURITY DEFINER wrappers]

### GIVEN / WHEN / THEN
**GIVEN** baseline migration applied (tables: `tenants`, `users`, `user_tenants`, `roles`, `user_roles`, `modules`, `organization_modules`) and `policyFor()` helper exists
**WHEN** migration `004-rls-baseline.sql` runs
**THEN** all 7 baseline tables have `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` active, plus 4 policies each (select/insert/update/delete) scoped to `app.current_org_id`; a Postgres role `app_role` exists and is used by connection pool; direct superuser connections are NOT used in integration tests

### ACP Prompt
````
# Task T-00d-002 — Migration `004-rls-baseline.sql` (RLS on 7 baseline tables)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00d-002` — RLS baseline migration spec
- `packages/db/rls/policy-for.ts` → `allPoliciesFor(table)` helper

## Twoje zadanie
Napisz migration SQL `004-rls-baseline.sql` który:
1. Tworzy Postgres role `app_role` (jeśli nie istnieje)
2. Aktywuje RLS na 7 baseline tables
3. Instaluje 4 policies per table (select/insert/update/delete) z `tenant_id = current_setting('app.current_org_id', true)::uuid`

Baseline tables: `tenants`, `users`, `user_tenants`, `roles`, `user_roles`, `modules`, `organization_modules`

## Implementacja
1. Utwórz `drizzle/migrations/004-rls-baseline.sql` dla 7 baseline tables (`tenants`, `users`, `user_tenants`, `roles`, `user_roles`, `modules`, `organization_modules`) i uwzględnij inline kolumny R13 co najmniej `id`, `tenant_id`, `created_at` tam gdzie tabela je posiada:
   ```sql
   -- Create app_role if not exists
   DO $$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
       CREATE ROLE app_role LOGIN PASSWORD 'change_in_production';
     END IF;
   END $$;

   -- Grant schema usage
   GRANT USAGE ON SCHEMA public TO app_role;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

   -- tenants
   ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
   ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
   CREATE POLICY "tenants_tenant_select" ON tenants AS PERMISSIVE FOR SELECT TO app_role
     USING (id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "tenants_tenant_insert" ON tenants AS PERMISSIVE FOR INSERT TO app_role
     WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "tenants_tenant_update" ON tenants AS PERMISSIVE FOR UPDATE TO app_role
     USING (id = current_setting('app.current_org_id', true)::uuid)
     WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "tenants_tenant_delete" ON tenants AS PERMISSIVE FOR DELETE TO app_role
     USING (id = current_setting('app.current_org_id', true)::uuid);

   -- users (tenant_id column)
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE users FORCE ROW LEVEL SECURITY;
   CREATE POLICY "users_tenant_select" ON users AS PERMISSIVE FOR SELECT TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "users_tenant_insert" ON users AS PERMISSIVE FOR INSERT TO app_role
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "users_tenant_update" ON users AS PERMISSIVE FOR UPDATE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "users_tenant_delete" ON users AS PERMISSIVE FOR DELETE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);

   -- user_tenants
   ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
   ALTER TABLE user_tenants FORCE ROW LEVEL SECURITY;
   CREATE POLICY "user_tenants_tenant_select" ON user_tenants AS PERMISSIVE FOR SELECT TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "user_tenants_tenant_insert" ON user_tenants AS PERMISSIVE FOR INSERT TO app_role
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "user_tenants_tenant_update" ON user_tenants AS PERMISSIVE FOR UPDATE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "user_tenants_tenant_delete" ON user_tenants AS PERMISSIVE FOR DELETE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);

   -- roles
   ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
   ALTER TABLE roles FORCE ROW LEVEL SECURITY;
   CREATE POLICY "roles_tenant_select" ON roles AS PERMISSIVE FOR SELECT TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "roles_tenant_insert" ON roles AS PERMISSIVE FOR INSERT TO app_role
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "roles_tenant_update" ON roles AS PERMISSIVE FOR UPDATE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "roles_tenant_delete" ON roles AS PERMISSIVE FOR DELETE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);

   -- user_roles
   ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
   ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
   CREATE POLICY "user_roles_tenant_select" ON user_roles AS PERMISSIVE FOR SELECT TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "user_roles_tenant_insert" ON user_roles AS PERMISSIVE FOR INSERT TO app_role
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "user_roles_tenant_update" ON user_roles AS PERMISSIVE FOR UPDATE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "user_roles_tenant_delete" ON user_roles AS PERMISSIVE FOR DELETE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);

   -- modules (global table — no tenant_id, skip RLS or use superuser-only access)
   -- organization_modules
   ALTER TABLE organization_modules ENABLE ROW LEVEL SECURITY;
   ALTER TABLE organization_modules FORCE ROW LEVEL SECURITY;
   CREATE POLICY "org_modules_tenant_select" ON organization_modules AS PERMISSIVE FOR SELECT TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "org_modules_tenant_insert" ON organization_modules AS PERMISSIVE FOR INSERT TO app_role
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "org_modules_tenant_update" ON organization_modules AS PERMISSIVE FOR UPDATE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.current_org_id', true)::uuid);
   CREATE POLICY "org_modules_tenant_delete" ON organization_modules AS PERMISSIVE FOR DELETE TO app_role
     USING (tenant_id = current_setting('app.current_org_id', true)::uuid);
   ```
2. W `drizzle/migrations/004-rls-baseline.sql` sprawdź czy `modules` ma `tenant_id` — jeśli to tabela globalna (nie per-tenant), zastosuj tylko GRANT SELECT dla `app_role` bez RLS policy, i dodaj komentarz `-- global reference table, no tenant isolation`
3. Napisz integracyjny test `tests/rls/rls-baseline.integration.test.ts`:
   - Połącz jako `app_role` (nie superuser)
   - `SET LOCAL app.current_org_id = '<tenant-a-id>'`
   - SELECT z `users` → tylko wiersze tenant A
   - SELECT bez set_config → zero wierszy (NULL::uuid = tenant_id = false)
4. Zaktualizuj `supabase/config.toml` — dodaj `app_role` do sekcji `[db.roles]` lub `extra_search_path` jeśli potrzeba
5. Uruchom `pnpm drizzle-kit generate` aby Drizzle wiedział o zmianach (choć RLS nie jest w schema.ts — commit SQL ręcznie do `drizzle/migrations/`)

## Files
**Create:** `drizzle/migrations/004-rls-baseline.sql`, `tests/rls/rls-baseline.integration.test.ts`
**Modify:** `supabase/config.toml` — dodaj `app_role` config

## Done when
- `vitest tests/rls/rls-baseline.integration.test.ts` PASS — sprawdza: app_role widzi tylko swój tenant + bez set_config widzi zero wierszy
- `pnpm test:smoke` green

## Rollback
`psql $DATABASE_URL -c "ALTER TABLE tenants DISABLE ROW LEVEL SECURITY; ALTER TABLE organizations DISABLE ROW LEVEL SECURITY; ALTER TABLE users DISABLE ROW LEVEL SECURITY; ALTER TABLE sites DISABLE ROW LEVEL SECURITY; ALTER TABLE roles DISABLE ROW LEVEL SECURITY; ALTER TABLE role_assignments DISABLE ROW LEVEL SECURITY; ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;"`
````

### Test gate (planning summary)
- **Integration:** `vitest tests/rls/rls-baseline.integration.test.ts` — covers: app_role tenant isolation, NULL org_id → zero rows
- **CI gate:** `pnpm test:smoke` green

### Rollback
`psql $DATABASE_URL -c "ALTER TABLE tenants DISABLE ROW LEVEL SECURITY; ALTER TABLE organizations DISABLE ROW LEVEL SECURITY; ALTER TABLE users DISABLE ROW LEVEL SECURITY; ALTER TABLE sites DISABLE ROW LEVEL SECURITY; ALTER TABLE roles DISABLE ROW LEVEL SECURITY; ALTER TABLE role_assignments DISABLE ROW LEVEL SECURITY; ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;"`
## T-00d-003 — LEAKPROOF SECURITY DEFINER wrappers (`fn_current_org()`)

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-d RLS
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00d-001 — policyFor helper]
- **Downstream (will consume this):** [T-00d-004 — cross-tenant leak regression tests]
- **Parallel (can run concurrently):** [T-00d-002 — RLS baseline migration]

### GIVEN / WHEN / THEN
**GIVEN** policies currently call `current_setting('app.current_org_id', true)::uuid` inline
**WHEN** migration `005-rls-wrappers.sql` runs
**THEN** SQL functions `fn_current_org() RETURNS uuid` and `fn_current_actor() RETURNS uuid` exist, both marked `SECURITY DEFINER LEAKPROOF STABLE`, policies updated to call them instead; the query planner can push predicates across views safely (R3 compliance)

### ACP Prompt
````
# Task T-00d-003 — LEAKPROOF SECURITY DEFINER wrappers (`fn_current_org()`)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00d-003` — LEAKPROOF wrappers spec

## Twoje zadanie
Stwórz migration `005-rls-wrappers.sql` z funkcjami pomocniczymi RLS.
Dlaczego LEAKPROOF + SECURITY DEFINER: Postgres może optymalizować zapytania z LEAKPROOF funkcjami (nie martwi się o side effects). SECURITY DEFINER pozwala funkcji widzieć `current_setting` niezależnie od roli wywołującej.

## Implementacja
1. Utwórz `drizzle/migrations/005-rls-wrappers.sql`:
   ```sql
   CREATE OR REPLACE FUNCTION fn_current_org()
   RETURNS uuid
   LANGUAGE sql
   STABLE
   LEAKPROOF
   SECURITY DEFINER
   SET search_path = public
   AS $$
     SELECT current_setting('app.current_org_id', true)::uuid
   $$;

   CREATE OR REPLACE FUNCTION fn_current_actor()
   RETURNS uuid
   LANGUAGE sql
   STABLE
   LEAKPROOF
   SECURITY DEFINER
   SET search_path = public
   AS $$
     SELECT current_setting('app.current_actor_id', true)::uuid
   $$;

   -- Grant execute to app_role
   GRANT EXECUTE ON FUNCTION fn_current_org() TO app_role;
   GRANT EXECUTE ON FUNCTION fn_current_actor() TO app_role;

   -- Update existing policies to use wrapper functions instead of inline current_setting calls
   -- (Drop and recreate policies for users table as example — repeat for all 7 tables)
   DROP POLICY IF EXISTS "users_tenant_select" ON users;
   CREATE POLICY "users_tenant_select" ON users AS PERMISSIVE FOR SELECT TO app_role
     USING (tenant_id = fn_current_org());

   DROP POLICY IF EXISTS "users_tenant_insert" ON users;
   CREATE POLICY "users_tenant_insert" ON users AS PERMISSIVE FOR INSERT TO app_role
     WITH CHECK (tenant_id = fn_current_org());

   DROP POLICY IF EXISTS "users_tenant_update" ON users;
   CREATE POLICY "users_tenant_update" ON users AS PERMISSIVE FOR UPDATE TO app_role
     USING (tenant_id = fn_current_org()) WITH CHECK (tenant_id = fn_current_org());

   DROP POLICY IF EXISTS "users_tenant_delete" ON users;
   CREATE POLICY "users_tenant_delete" ON users AS PERMISSIVE FOR DELETE TO app_role
     USING (tenant_id = fn_current_org());

   -- Repeat DROP/CREATE pattern for: user_tenants, roles, user_roles, organization_modules, tenants
   -- (same pattern as above — replace table name)
   ```
2. Uruchom `pnpm drizzle-kit generate` z katalogu repo, aby uwzględnić `drizzle/migrations/005-rls-wrappers.sql` i ewentualne zmiany w `packages/db/schema/*.ts` zgodnie ze stackiem.
3. Napisz `tests/rls/rls-wrappers.integration.test.ts`:
   - `SELECT fn_current_org()` bez set_config → zwraca NULL (nie rzuca błędu)
   - `SET LOCAL app.current_org_id = '<uuid>'; SELECT fn_current_org()` → zwraca ten UUID
   - SELECT na `users` jako `app_role` z `fn_current_org()` w policy → tenant isolation działa
4. Zweryfikuj w `tests/rls/rls-wrappers.integration.test.ts` lub przez SQL uruchomiony dla `drizzle/migrations/005-rls-wrappers.sql`: `SELECT proname, proleakproof FROM pg_proc WHERE proname = 'fn_current_org'` → `proleakproof = true`

## Files
**Create:** `drizzle/migrations/005-rls-wrappers.sql`, `tests/rls/rls-wrappers.integration.test.ts`

## Done when
- `vitest tests/rls/rls-wrappers.integration.test.ts` PASS — sprawdza: fn_current_org() NULL safety + UUID return + policy enforcement
- `pnpm test:smoke` green

## Rollback
`DROP FUNCTION fn_current_org(); DROP FUNCTION fn_current_actor();` — przywraca inline `current_setting` calls w policies
````

### Test gate (planning summary)
- **Integration:** `vitest tests/rls/rls-wrappers.integration.test.ts` — covers: function existence, LEAKPROOF attribute, NULL safety, policy enforcement
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP FUNCTION fn_current_org() CASCADE; DROP FUNCTION fn_current_actor() CASCADE;`
## T-00d-004 — Integration test: cross-tenant leak regression suite

**Type:** T4-wiring+test
**Context budget:** ~65k tokens
**Est time:** 60 min
**Parent feature:** 00-d RLS
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00d-002 — RLS baseline migration, T-00d-003 — LEAKPROOF wrappers, T-00b-004 — seed factories (multi-tenant-3)]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00e-004 — Audit query API]

### GIVEN / WHEN / THEN
**GIVEN** `multi-tenant-3` snapshot seeded (3 tenants: `org-a-id`, `org-b-id`, `org-c-id`, each with users + roles rows)
**WHEN** the regression suite runs SELECT / INSERT / UPDATE / DELETE on every baseline table with `app.current_org_id = 'org-a-id'`
**THEN** zero rows belonging to `org-b-id` or `org-c-id` are ever returned or mutated; attempting a "would-leak" query (SET to org-a, SELECT without SET) returns 0 rows; the suite also verifies that `app_role` cannot ALTER TABLE or DROP

### ACP Prompt
````
# Task T-00d-004 — Cross-tenant leak regression suite

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00d-004` — cross-tenant leak spec
- `packages/db/rls-context.ts` → withOrgContext helper
- `packages/db/schema/baseline.ts` → lista tabel z tenant_id

## Twoje zadanie
Napisz suite integracyjną która gwarantuje że RLS nie przecieka danych między tenantami. Suite musi używać realnego Supabase local DB (zero mocków). Używaj `supabase` client zainicjalizowanego z service role do seedowania, ale do testów używaj połączenia jako `app_role`.

Tabele do przetestowania: `users`, `user_tenants`, `roles`, `user_roles`, `organization_modules`.
Snapshot `multi-tenant-3`: tenant A = `'11111111-1111-1111-1111-111111111111'`, tenant B = `'22222222-2222-2222-2222-222222222222'`.

## Implementacja
1. Utwórz `tests/rls/cross-tenant-leak.integration.test.ts`:
   ```typescript
   import { describe, it, expect, beforeAll } from "vitest";
   import { drizzle } from "drizzle-orm/postgres-js";
   import postgres from "postgres";
   import { sql } from "drizzle-orm";

   const ORG_A = "11111111-1111-1111-1111-111111111111";
   const ORG_B = "22222222-2222-2222-2222-222222222222";

   // Connect as app_role (not superuser)
   const appRoleClient = postgres(process.env.DATABASE_URL_APP_ROLE!);
   const db = drizzle(appRoleClient);

   async function setOrg(orgId: string) {
     await db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
   }

   async function clearOrg() {
     await db.execute(sql`SELECT set_config('app.current_org_id', '', true)`);
   }

   describe("RLS cross-tenant isolation", () => {
     const TABLES = ["users", "user_tenants", "roles", "user_roles", "organization_modules"];

     for (const table of TABLES) {
       describe(`Table: ${table}`, () => {
         it(`SELECT as org-A returns only org-A rows`, async () => {
           await setOrg(ORG_A);
           const rows = await db.execute(sql.raw(`SELECT tenant_id FROM ${table}`));
           for (const row of rows) {
             expect(row.tenant_id).toBe(ORG_A);
           }
         });

         it(`SELECT without set_config returns zero rows`, async () => {
           await clearOrg();
           const rows = await db.execute(sql.raw(`SELECT id FROM ${table}`));
           expect(rows.length).toBe(0);
         });

         it(`INSERT with wrong tenant_id is rejected`, async () => {
           await setOrg(ORG_A);
           await expect(
             db.execute(sql.raw(`INSERT INTO ${table} (id, tenant_id) VALUES (gen_random_uuid(), '${ORG_B}')`))
           ).rejects.toThrow();
         });
       });
     }

     it("app_role cannot ALTER TABLE", async () => {
       await expect(
         db.execute(sql`ALTER TABLE users ADD COLUMN leak_test TEXT`)
       ).rejects.toThrow();
     });
   });
   ```
2. Dodaj `DATABASE_URL_APP_ROLE` do `.env.test` jako connection string z `app_role` credentials
3. Dodaj script do `package.json`: `"test:rls": "vitest tests/rls/cross-tenant-leak.integration.test.ts"`
4. Upewnij się w `tests/rls/cross-tenant-leak.integration.test.ts` i/lub w snapshot fixture używanej przez `.env.test`, że `multi-tenant-3` snapshot istnieje, albo dodaj before hook seedujący 2 tenants + kilka wierszy w każdej tabeli

## Files
**Create:** `tests/rls/cross-tenant-leak.integration.test.ts`
**Modify:** `package.json` — dodaj `test:rls` script; `.env.test` — dodaj `DATABASE_URL_APP_ROLE`

## Done when
- `vitest tests/rls/cross-tenant-leak.integration.test.ts` PASS — sprawdza: SELECT isolation + zero-rows bez set_config + INSERT rejection + ALTER TABLE rejection
- `pnpm test:rls` green
- `pnpm test:smoke` green

## Rollback
`rm tests/rls/cross-tenant-leak.integration.test.ts`
````

### Test gate (planning summary)
- **Integration:** `vitest tests/rls/cross-tenant-leak.integration.test.ts` — covers: cross-tenant SELECT/INSERT/UPDATE isolation per table, zero-rows without set_config
- **CI gate:** `pnpm test:rls` green + `pnpm test:smoke` green

### Rollback
`rm tests/rls/cross-tenant-leak.integration.test.ts`
## T-00d-005 — `impersonating_as` flag plumbing (session + audit)

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-003 — Next.js middleware, T-00e-002 — audit trigger factory]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00d-004 — cross-tenant leak regression suite]

### GIVEN / WHEN / THEN
**GIVEN** a superadmin session (user with `Permission.IMPERSONATE_TENANT = 'impersonate.tenant'`)
**WHEN** they POST to `/api/impersonate` with body `{ targetOrgId: '<uuid>' }`
**THEN** the session gains a signed `impersonating_as` cookie set to `targetOrgId`, `withOrgContext` is extended to call `SET LOCAL app.current_actor_id = '<real-user-id>'` AND `SET LOCAL app.impersonating_as = '<targetOrgId>'`, and every resulting `audit_log` row contains both `actor` (real user) and `impersonating_as` (impersonated tenant) fields

### ACP Prompt
````
# Task T-00d-005 — `impersonating_as` flag plumbing (session + audit)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00d-005` — impersonation spec
- `lib/rbac/permissions.enum.ts` → `Permission.IMPERSONATE_TENANT = 'impersonate.tenant'`
- `packages/db/rls-context.ts` → istniejący `withOrgContext` helper — rozszerz go
- `apps/web/middleware.ts` → jak session cookie jest parsowany

## Twoje zadanie
Implementuj impersonation flow:
1. Server Action `startImpersonation(targetOrgId)` z RBAC guard `'impersonate.tenant'`
2. Signed cookie `impersonating_as` ustawiany w response
3. Rozszerzenie `withOrgContext` o set_config `app.impersonating_as`
4. Audit log rows automatycznie zawierają `impersonating_as` z `fn_audit_trigger()`

## Implementacja
1. Utwórz `apps/web/actions/impersonate.ts`:
   ```typescript
   "use server";
   import { z } from "zod";
   import { cookies, headers } from "next/headers";
   import { Permission } from "lib/rbac/permissions.enum";
   import { insertAuditLog } from "lib/audit/insert-audit-log";

   const ImpersonateSchema = z.object({ targetOrgId: z.string().uuid() });

   export async function startImpersonation(input: unknown) {
     const parsed = ImpersonateSchema.safeParse(input);
     if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

     const headersList = headers();
     const userId = headersList.get("x-user-id");
     const currentOrgId = headersList.get("x-org-id");
     if (!userId || !currentOrgId) return { error: "Unauthorized" };

     // RBAC guard — fetch user permissions from DB and check impersonate.tenant
     // (simplified: check user_roles → roles → permissions in DB)
     const hasPermission = await checkUserPermission(userId, Permission.IMPERSONATE_TENANT);
     if (!hasPermission) return { error: "Forbidden: requires impersonate.tenant permission" };

     const cookieStore = cookies();
     cookieStore.set("impersonating_as", parsed.data.targetOrgId, {
       httpOnly: true,
       secure: process.env.NODE_ENV === "production",
       sameSite: "lax",
       maxAge: 60 * 60, // 1 hour
     });

     await insertAuditLog({
       tenantId: currentOrgId,
       actor: userId,
       impersonatingAs: parsed.data.targetOrgId,
       action: "impersonation.started",
       resourceType: "tenant",
       resourceId: parsed.data.targetOrgId,
     });

     return { success: true };
   }

   async function checkUserPermission(userId: string, permission: string): Promise<boolean> {
     // Query: SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     //        WHERE ur.user_id = userId AND permission = ANY(r.permissions)
     // Implementation depends on roles schema — adapt as needed
     return true; // TODO: replace with real DB check
   }
   ```
2. Utwórz `apps/web/app/api/impersonate/route.ts`:
   ```typescript
   import { startImpersonation } from "@/actions/impersonate";
   import { NextRequest, NextResponse } from "next/server";
   export async function POST(req: NextRequest) {
     const body = await req.json();
     const result = await startImpersonation(body);
     if ('error' in result) return NextResponse.json(result, { status: 403 });
     return NextResponse.json(result);
   }
   ```
3. Zmodyfikuj `packages/db/rls-context.ts` — rozszerz `withOrgContext` o opcjonalny `impersonatingAs`:
   ```typescript
   export async function withOrgContext<T>(
     db: PostgresJsDatabase,
     orgId: string,
     userId: string,
     fn: () => Promise<T>,
     impersonatingAs?: string,
   ): Promise<T> {
     return db.transaction(async (tx) => {
       await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
       await tx.execute(sql`SELECT set_config('app.current_actor_id', ${userId}, true)`);
       if (impersonatingAs) {
         await tx.execute(sql`SELECT set_config('app.impersonating_as', ${impersonatingAs}, true)`);
       }
       return fn();
     });
   }
   ```
4. Napisz `apps/web/actions/impersonate.test.ts`:
   - No permission → `{ error: 'Forbidden' }`
   - Valid superadmin → cookie set + audit log emitted
   - `withOrgContext` with `impersonatingAs` → `app.impersonating_as` set in transaction

## Files
**Create:** `apps/web/actions/impersonate.ts`, `apps/web/app/api/impersonate/route.ts`, `apps/web/actions/impersonate.test.ts`
**Modify:** `packages/db/rls-context.ts` — dodaj `impersonatingAs` param

## Done when
- `vitest apps/web/actions/impersonate.test.ts` PASS — sprawdza: RBAC guard + cookie set + audit log with actor + impersonatingAs
- `pnpm test:smoke` green

## Rollback
`git revert HEAD --no-edit`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/actions/impersonate.test.ts` — covers: RBAC guard, cookie set, audit log actor+impersonatingAs fields
- **Integration:** `withOrgContext` with impersonatingAs → `app.impersonating_as` set in DB transaction
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert HEAD --no-edit`
## T-00e-001 — Migration `006-audit-log.sql` (partitioned append-only)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — Baseline migration `001-baseline.sql`]
- **Downstream (will consume this):** [T-00e-002 — audit trigger factory, T-00e-003 — outbox emission hook]
- **Parallel (can run concurrently):** [T-00c-001 — Supabase Auth schema migration, T-00d-001 — policyFor helper]

### GIVEN / WHEN / THEN
**GIVEN** baseline migration applied
**WHEN** `006-audit-log.sql` runs
**THEN** `audit_log` partitioned parent table exists with columns: `id BIGSERIAL`, `tenant_id UUID NOT NULL`, `actor UUID`, `impersonating_as UUID`, `entity_type TEXT NOT NULL`, `entity_id UUID`, `operation TEXT CHECK (operation IN ('INSERT','UPDATE','DELETE'))`, `before_data JSONB`, `after_data JSONB`, `app_version TEXT`, `created_at TIMESTAMPTZ DEFAULT now() NOT NULL`; partitioned by `RANGE (created_at)` monthly; `app_role` has GRANT INSERT only (UPDATE/DELETE revoked); index on `(tenant_id, entity_type, created_at DESC)`; initial 3 monthly partitions created

### ACP Prompt
````
# Task T-00e-001 — Migration `006-audit-log.sql` (partitioned append-only table)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00e-001` — audit_log migration spec

## Twoje zadanie
Stwórz migration SQL dla `audit_log` — append-only, partycjonowana miesięcznie, z RLS disabled (audit jest system-level, nie tenant-scoped), ale z `tenant_id` do filtrowania.

## Implementacja
1. Utwórz `drizzle/migrations/006-audit-log.sql` z kolumnami co najmniej `id`, `tenant_id`, `created_at` oraz pełnym audit payload:
   ```sql
   -- Parent partitioned table
   CREATE TABLE audit_log (
     id            BIGSERIAL,
     tenant_id     UUID NOT NULL,
     actor         UUID,
     impersonating_as UUID,
     entity_type   TEXT NOT NULL,
     entity_id     UUID,
     operation     TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
     before_data   JSONB,
     after_data    JSONB,
     app_version   TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   ) PARTITION BY RANGE (created_at);

   -- Initial 3 monthly partitions (current month - 1, current, next)
   CREATE TABLE audit_log_2026_03 PARTITION OF audit_log
     FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
   CREATE TABLE audit_log_2026_04 PARTITION OF audit_log
     FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
   CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
     FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

   -- Performance index
   CREATE INDEX idx_audit_log_tenant_entity_time
     ON audit_log (tenant_id, entity_type, created_at DESC);

   -- Append-only enforcement: revoke mutating operations from app_role
   REVOKE UPDATE, DELETE ON audit_log FROM app_role;
   GRANT INSERT ON audit_log TO app_role;
   GRANT SELECT ON audit_log TO app_role;

   -- RLS on audit_log (tenant scoped reads)
   ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "audit_log_tenant_select" ON audit_log AS PERMISSIVE FOR SELECT TO app_role
     USING (tenant_id = fn_current_org());
   -- INSERT allowed without RLS check (trigger inserts via SECURITY DEFINER)
   CREATE POLICY "audit_log_tenant_insert" ON audit_log AS PERMISSIVE FOR INSERT TO app_role
     WITH CHECK (tenant_id = fn_current_org());
   ```
2. Zaktualizuj `packages/db/schema/audit.ts` z Drizzle types:
   ```typescript
   import { pgTable, bigserial, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";
   export const auditLog = pgTable("audit_log", {
     id: bigserial("id", { mode: "number" }),
     tenantId: uuid("tenant_id").notNull(),
     actor: uuid("actor"),
     impersonatingAs: uuid("impersonating_as"),
     entityType: text("entity_type").notNull(),
     entityId: uuid("entity_id"),
     operation: text("operation").notNull(),
     beforeData: jsonb("before_data"),
     afterData: jsonb("after_data"),
     appVersion: text("app_version"),
     createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
   });
   ```
3. Uruchom `pnpm drizzle-kit generate` z katalogu repo, aby uwzględnić `drizzle/migrations/006-audit-log.sql` oraz zmiany w `packages/db/schema/audit.ts`.
4. Napisz `tests/audit/audit-log.integration.test.ts`:
   - INSERT jako `app_role` → sukces
   - UPDATE lub DELETE jako `app_role` → rzuca błąd (permission denied)
   - SELECT z `app.current_org_id` ustawionym → widzi tylko swój tenant
   - Sprawdź że `fn_current_org()` istnieje (lub pomiń ten check jeśli T-00d-003 jeszcze nie merged — dependency)

## Files
**Create:** `drizzle/migrations/006-audit-log.sql`, `tests/audit/audit-log.integration.test.ts`
**Modify:** `packages/db/schema/audit.ts` — dodaj/zaktualizuj Drizzle table definition

## Done when
- `vitest tests/audit/audit-log.integration.test.ts` PASS — sprawdza: INSERT OK, UPDATE/DELETE rejected, tenant-scoped SELECT
- `pnpm test:smoke` green

## Rollback
`DROP TABLE audit_log CASCADE;`
````

### Test gate (planning summary)
- **Integration:** `vitest tests/audit/audit-log.integration.test.ts` — covers: append-only enforcement (UPDATE/DELETE rejected), tenant-scoped SELECT, INSERT success
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TABLE audit_log CASCADE;`
## T-00e-002 — Generic audit trigger factory (`install_audit_trigger(table)`)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00e-001 — audit_log migration]
- **Downstream (will consume this):** [T-00e-003 — outbox emission hook, T-00d-005 — impersonation plumbing]
- **Parallel (can run concurrently):** [T-00e-004 — Audit query API]

### GIVEN / WHEN / THEN
**GIVEN** `audit_log` table exists
**WHEN** `SELECT install_audit_trigger('fa')` is called
**THEN** a trigger exists on table `fa` that fires AFTER INSERT OR UPDATE OR DELETE, and inserts a row into `audit_log` with: `entity_type = 'fa'`, `entity_id = NEW.id` (or `OLD.id` on DELETE), `operation = TG_OP`, `before_data = to_jsonb(OLD)`, `after_data = to_jsonb(NEW)`, `actor = current_setting('app.current_actor_id', true)::uuid`, `impersonating_as = current_setting('app.impersonating_as', true)::uuid`, `tenant_id = NEW.tenant_id` (or `OLD.tenant_id`)

### ACP Prompt
````
# Task T-00e-002 — Generic audit trigger factory (`install_audit_trigger`)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00e-002` — audit trigger factory spec
- `drizzle/migrations/006-audit-log.sql` → audit_log kolumny (entity_type, entity_id, operation, before_data, after_data, actor, impersonating_as, tenant_id)

## Twoje zadanie
Napisz dwie SQL funkcje:
1. `fn_audit_trigger()` — TRIGGER function wywoływana przez każdy trigger
2. `install_audit_trigger(table_name regclass)` — helper który instaluje trigger na wskazanej tabeli

Trigger musi obsłużyć INSERT (OLD=NULL), UPDATE (OLD+NEW), DELETE (NEW=NULL).

## Implementacja
1. Utwórz `drizzle/migrations/007-audit-triggers.sql`:
   ```sql
   -- Generic audit trigger function
   CREATE OR REPLACE FUNCTION fn_audit_trigger()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     _entity_id   UUID;
     _tenant_id   UUID;
     _before_data JSONB;
     _after_data  JSONB;
   BEGIN
     IF TG_OP = 'DELETE' THEN
       _entity_id   := OLD.id;
       _tenant_id   := OLD.tenant_id;
       _before_data := to_jsonb(OLD);
       _after_data  := NULL;
     ELSIF TG_OP = 'INSERT' THEN
       _entity_id   := NEW.id;
       _tenant_id   := NEW.tenant_id;
       _before_data := NULL;
       _after_data  := to_jsonb(NEW);
     ELSE -- UPDATE
       _entity_id   := NEW.id;
       _tenant_id   := NEW.tenant_id;
       _before_data := to_jsonb(OLD);
       _after_data  := to_jsonb(NEW);
     END IF;

     INSERT INTO audit_log (
       tenant_id, actor, impersonating_as,
       entity_type, entity_id, operation,
       before_data, after_data, app_version
     ) VALUES (
       _tenant_id,
       current_setting('app.current_actor_id', true)::uuid,
       NULLIF(current_setting('app.impersonating_as', true), '')::uuid,
       TG_TABLE_NAME,
       _entity_id,
       TG_OP,
       _before_data,
       _after_data,
       current_setting('app.app_version', true)
     );

     RETURN COALESCE(NEW, OLD);
   END;
   $$;

   -- Helper to install the trigger on any business table
   CREATE OR REPLACE FUNCTION install_audit_trigger(table_name regclass)
   RETURNS void
   LANGUAGE plpgsql
   AS $$
   BEGIN
     EXECUTE format(
       'DROP TRIGGER IF EXISTS audit_trigger ON %s;
        CREATE TRIGGER audit_trigger
          AFTER INSERT OR UPDATE OR DELETE ON %s
          FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger()',
       table_name, table_name
     );
   END;
   $$;

   -- Install on all baseline business tables
   SELECT install_audit_trigger('users');
   SELECT install_audit_trigger('user_tenants');
   SELECT install_audit_trigger('roles');
   SELECT install_audit_trigger('user_roles');
   SELECT install_audit_trigger('organization_modules');
   ```
2. Uruchom `pnpm drizzle-kit generate` z katalogu repo, aby uwzględnić `drizzle/migrations/007-audit-triggers.sql` i zsynchronizować artefakty migracji.
3. Napisz `tests/audit/audit-trigger.integration.test.ts`:
   ```typescript
   describe("audit trigger", () => {
     it("INSERT on users emits audit_log row with operation=INSERT", async () => {
       await db.execute(sql`SELECT set_config('app.current_org_id', ${TEST_ORG_ID}, true)`);
       await db.execute(sql`SELECT set_config('app.current_actor_id', ${TEST_USER_ID}, true)`);
       await db.insert(users).values({ id: uuid(), tenantId: TEST_ORG_ID, email: 'x@test.com', schemaVersion: 1 });
       const [auditRow] = await db.execute(sql`SELECT * FROM audit_log WHERE entity_type = 'users' ORDER BY id DESC LIMIT 1`);
       expect(auditRow.operation).toBe('INSERT');
       expect(auditRow.after_data).toMatchObject({ email: 'x@test.com' });
       expect(auditRow.before_data).toBeNull();
       expect(auditRow.actor).toBe(TEST_USER_ID);
     });
     it("UPDATE emits audit_log with before_data + after_data", async () => { /* ... */ });
     it("DELETE emits audit_log with before_data, after_data=NULL", async () => { /* ... */ });
   });
   ```
4. Potwierdź w `drizzle/migrations/007-audit-triggers.sql` lub przez check powiązany z `tests/audit/audit-trigger.integration.test.ts`, że `install_audit_trigger` jest dostępne w Supabase local: `SELECT proname FROM pg_proc WHERE proname = 'install_audit_trigger'`

## Files
**Create:** `drizzle/migrations/007-audit-triggers.sql`, `tests/audit/audit-trigger.integration.test.ts`

## Done when
- `vitest tests/audit/audit-trigger.integration.test.ts` PASS — sprawdza: INSERT/UPDATE/DELETE → audit_log row z poprawnym operation, before_data, after_data, actor
- `pnpm test:smoke` green

## Rollback
`DROP FUNCTION fn_audit_trigger() CASCADE; DROP FUNCTION install_audit_trigger(regclass);`
````

### Test gate (planning summary)
- **Integration:** `vitest tests/audit/audit-trigger.integration.test.ts` — covers: INSERT/UPDATE/DELETE emitting correct audit rows (operation, before_data, after_data, actor)
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP FUNCTION fn_audit_trigger() CASCADE; DROP FUNCTION install_audit_trigger(regclass);`
## T-00e-003 — `audit.recorded` outbox emission hook

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00e-002 — audit trigger factory, T-00f-002 — `insertOutboxEvent` helper, T-00b-E02 — events.enum.ts lock]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00e-004 — Audit query API]

### GIVEN / WHEN / THEN
**GIVEN** `fn_audit_trigger()` exists and `outbox_events` table exists with `insertOutboxEvent` SQL helper available
**WHEN** `fn_audit_trigger()` fires on any INSERT/UPDATE/DELETE on a business table
**THEN** in the same DB transaction: one `audit_log` row is inserted AND one `outbox_events` row with `event_type = 'audit.recorded'`, `aggregate_type = entity_type`, `aggregate_id = entity_id`, `tenant_id = tenant_id` is also inserted — if either insert fails both roll back atomically

### ACP Prompt
````
# Task T-00e-003 — `audit.recorded` outbox emission from audit trigger

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00e-003` — outbox emission spec
- `drizzle/migrations/007-audit-triggers.sql` → istniejący `fn_audit_trigger()` — rozszerz go
- `lib/outbox/events.enum.ts` → `EventType.AUDIT_RECORDED = 'audit.recorded'`
- `drizzle/migrations/010-outbox-events.sql` → kolumny `outbox_events`: id, tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at

## Twoje zadanie
Rozszerz `fn_audit_trigger()` aby po wstawieniu wiersza do `audit_log` również wstawiał wiersz do `outbox_events` w tej samej transakcji. Atomowość jest zapewniona przez fakt że trigger jest w tej samej transakcji co operacja na tabeli biznesowej.

## Implementacja
1. Utwórz `drizzle/migrations/008-audit-outbox.sql`:
   ```sql
   CREATE OR REPLACE FUNCTION fn_audit_trigger()
   RETURNS TRIGGER
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public
   AS $$
   DECLARE
     _entity_id   UUID;
     _tenant_id   UUID;
     _before_data JSONB;
     _after_data  JSONB;
     _audit_id    BIGINT;
   BEGIN
     IF TG_OP = 'DELETE' THEN
       _entity_id   := OLD.id;
       _tenant_id   := OLD.tenant_id;
       _before_data := to_jsonb(OLD);
       _after_data  := NULL;
     ELSIF TG_OP = 'INSERT' THEN
       _entity_id   := NEW.id;
       _tenant_id   := NEW.tenant_id;
       _before_data := NULL;
       _after_data  := to_jsonb(NEW);
     ELSE
       _entity_id   := NEW.id;
       _tenant_id   := NEW.tenant_id;
       _before_data := to_jsonb(OLD);
       _after_data  := to_jsonb(NEW);
     END IF;

     INSERT INTO audit_log (
       tenant_id, actor, impersonating_as,
       entity_type, entity_id, operation,
       before_data, after_data, app_version
     ) VALUES (
       _tenant_id,
       current_setting('app.current_actor_id', true)::uuid,
       NULLIF(current_setting('app.impersonating_as', true), '')::uuid,
       TG_TABLE_NAME,
       _entity_id,
       TG_OP,
       _before_data,
       _after_data,
       current_setting('app.app_version', true)
     ) RETURNING id INTO _audit_id;

     -- Outbox emission in same transaction
     INSERT INTO outbox_events (
       tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at
     ) VALUES (
       _tenant_id,
       'audit.recorded',
       TG_TABLE_NAME,
       _entity_id,
       jsonb_build_object(
         'audit_id', _audit_id,
         'operation', TG_OP,
         'entity_type', TG_TABLE_NAME
       ),
       now()
     );

     RETURN COALESCE(NEW, OLD);
   END;
   $$;
   ```
2. Uruchom `pnpm drizzle-kit generate` z katalogu repo, aby uwzględnić `drizzle/migrations/008-audit-outbox.sql` i zsynchronizować artefakty migracji.
3. Napisz `tests/audit/audit-outbox.integration.test.ts`:
   ```typescript
   it("INSERT on users → audit_log row + outbox_events row in same txn", async () => {
     await db.transaction(async (tx) => {
       await tx.execute(sql`SELECT set_config('app.current_org_id', ${ORG_ID}, true)`);
       await tx.execute(sql`SELECT set_config('app.current_actor_id', ${ACTOR_ID}, true)`);
       await tx.insert(users).values({ id: newId, tenantId: ORG_ID, schemaVersion: 1 });
     });
     const [auditRow] = await db.execute(sql`SELECT id FROM audit_log WHERE entity_id = ${newId}`);
     expect(auditRow).toBeTruthy();
     const [outboxRow] = await db.execute(
       sql`SELECT * FROM outbox_events WHERE event_type = 'audit.recorded' AND aggregate_id = ${newId}`
     );
     expect(outboxRow).toBeTruthy();
     expect(outboxRow.aggregate_type).toBe('users');
   });
   ```
4. Zweryfikuj w `tests/audit/audit-outbox.integration.test.ts` atomowość dla `drizzle/migrations/008-audit-outbox.sql`: zasymuluj błąd w outbox insert bez niszczenia schematu produkcyjnego (np. przez testowy stub / wymuszone exception w transakcji), aby potwierdzić że cały txn rollbackuje i `audit_log` nie zawiera wiersza

## Files
**Create:** `drizzle/migrations/008-audit-outbox.sql`, `tests/audit/audit-outbox.integration.test.ts`

## Done when
- `vitest tests/audit/audit-outbox.integration.test.ts` PASS — sprawdza: single business table op → audit_log row + outbox_events row both present; txn rollback removes both
- `pnpm test:smoke` green

## Rollback
`git revert HEAD --no-edit`
````

### Test gate (planning summary)
- **Integration:** `vitest tests/audit/audit-outbox.integration.test.ts` — covers: audit + outbox atomic co-insert, txn atomicity
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert HEAD --no-edit`
## T-00e-004 — Audit query API (`GET /api/audit?entity_type=…&entity_id=…`)

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 45 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00e-002 — audit trigger factory, T-00b-E01 — permissions.enum.ts lock]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00e-003 — outbox emission hook, T-00d-004 — cross-tenant leak suite]

### GIVEN / WHEN / THEN
**GIVEN** `audit_log` table is populated and RLS is active on it
**WHEN** a user with `Permission.AUDIT_READ = 'audit.read'` calls `GET /api/audit?entity_type=users&entity_id=<uuid>&limit=50&offset=0`
**THEN** returns JSON `{ data: AuditLogRow[], total: number }` scoped by RLS to their tenant, max 500 rows, sorted by `created_at DESC`; a user without `audit.read` permission gets HTTP 403; missing required params get HTTP 400 with Zod errors

### ACP Prompt
````
# Task T-00e-004 — Audit query API (`GET /api/audit`)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00e-004` — Audit query API spec
- `lib/rbac/permissions.enum.ts` → `Permission.AUDIT_READ = 'audit.read'`
- `packages/db/schema/audit.ts` → `auditLog` Drizzle table definition
- `packages/db/rls-context.ts` → `withOrgContext` helper

## Twoje zadanie
Zaimplementuj `GET /api/audit` route handler w Next.js App Router z:
- Zod validation query params
- RBAC guard `'audit.read'`
- Drizzle query na `audit_log` z RLS enforcement via `withOrgContext`
- Paginacja (max 500 rows, default limit 50)

## Implementacja
1. Utwórz `apps/web/app/api/audit/route.ts`:
   ```typescript
   import { NextRequest, NextResponse } from "next/server";
   import { z } from "zod";
   import { headers } from "next/headers";
   import { db } from "packages/db";
   import { auditLog } from "packages/db/schema/audit";
   import { eq, and, desc } from "drizzle-orm";
   import { withOrgContext } from "packages/db/rls-context";
   import { checkUserPermission } from "lib/rbac/check-permission";
   import { Permission } from "lib/rbac/permissions.enum";

   const QuerySchema = z.object({
     entity_type: z.string().min(1),
     entity_id: z.string().uuid().optional(),
     limit: z.coerce.number().int().min(1).max(500).default(50),
     offset: z.coerce.number().int().min(0).default(0),
   });

   export async function GET(req: NextRequest) {
     const headersList = headers();
     const orgId = headersList.get("x-org-id");
     const userId = headersList.get("x-user-id");
     if (!orgId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

     const hasPermission = await checkUserPermission(userId, Permission.AUDIT_READ);
     if (!hasPermission) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

     const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
     if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });

     const { entity_type, entity_id, limit, offset } = parsed.data;

     const data = await withOrgContext(db, orgId, userId, async () => {
       const conditions = [eq(auditLog.entityType, entity_type)];
       if (entity_id) conditions.push(eq(auditLog.entityId, entity_id));
       return db.select()
         .from(auditLog)
         .where(and(...conditions))
         .orderBy(desc(auditLog.createdAt))
         .limit(limit)
         .offset(offset);
     });

     return NextResponse.json({ data, total: data.length });
   }
   ```
2. Utwórz `lib/rbac/check-permission.ts` — helper sprawdzający uprawnienia z DB (jeśli nie istnieje):
   ```typescript
   import { db } from "packages/db";
   import { sql } from "drizzle-orm";
   export async function checkUserPermission(userId: string, permission: string): Promise<boolean> {
     const [row] = await db.execute(sql`
       SELECT 1 FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ${userId}::uuid
         AND ${permission} = ANY(r.permissions)
       LIMIT 1
     `);
     return !!row;
   }
   ```
3. Napisz `apps/web/app/api/audit/route.test.ts`:
   - No session headers → 401
   - No `audit.read` permission → 403
   - Missing `entity_type` → 400 z Zod errors
   - Valid request → 200 + `{ data: [], total: 0 }` (empty DB)
   - Valid request + DB rows → data returned, RLS scoped to correct tenant

## Files
**Create:** `apps/web/app/api/audit/route.ts`, `apps/web/app/api/audit/route.test.ts`
**Modify:** `lib/rbac/check-permission.ts` — utwórz jeśli nie istnieje

## Done when
- `vitest apps/web/app/api/audit/route.test.ts` PASS — sprawdza: 401 no auth, 403 no permission, 400 bad params, 200 scoped data
- `pnpm test:smoke` green

## Rollback
`rm apps/web/app/api/audit/route.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/api/audit/route.test.ts` — covers: auth guard (401), RBAC guard (403), Zod validation (400), tenant-scoped data return (200)
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/app/api/audit/route.ts`
## T-00e-005 — Retention policy config + partition maintenance cron

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00e-001 — audit_log migration, T-00f-003 — pg-boss worker config]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00e-004 — Audit query API]

### GIVEN / WHEN / THEN
**GIVEN** `audit_log` is partitioned by month and pg-boss worker is running
**WHEN** the monthly maintenance cron fires (first day of month, 02:00 UTC)
**THEN** (1) a new partition for the upcoming month is pre-created (`audit_log_YYYY_MM`), (2) partitions older than `retain_months` in `audit_retention_config` for the given `entity_type` are detached (NOT dropped), (3) a log entry is written; default `retain_months = 84` (7 years)

### ACP Prompt
````
# Task T-00e-005 — Retention policy config + partition maintenance cron

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/2026-04-22-foundation-merged-plan.md` → znajdź sekcję `### T-00e-005` — retention + partition maintenance spec
- `drizzle/migrations/006-audit-log.sql` → partition naming convention (`audit_log_YYYY_MM`)
- `packages/workers/` lub `apps/web/workers/` → gdzie żyją pg-boss jobs (sprawdź istniejącą strukturę)

## Twoje zadanie
1. Migration `009-audit-retention.sql` — tabela konfiguracji retention
2. TypeScript worker `partition-maintenance.ts` rejestrujący pg-boss cron job
3. Test integracyjny z time-travel (mock Date)

## Implementacja
1. Utwórz `drizzle/migrations/009-audit-retention.sql`:
   ```sql
   CREATE TABLE audit_retention_config (
     id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     entity_type    TEXT NOT NULL DEFAULT '*',  -- '*' = global default
     retain_months  INT NOT NULL DEFAULT 84,    -- 7 years
     created_at     TIMESTAMPTZ DEFAULT now(),
     UNIQUE (entity_type)
   );

   -- Default global retention
   INSERT INTO audit_retention_config (entity_type, retain_months) VALUES ('*', 84);
   ```
2. Utwórz `packages/db/scripts/partition-maintenance.ts`:
   ```typescript
   import type { PgBoss } from "pg-boss";
   import { db } from "packages/db";
   import { sql } from "drizzle-orm";
   import { format, addMonths, subMonths } from "date-fns";

   export function registerPartitionMaintenanceCron(boss: PgBoss) {
     // Run first day of each month at 02:00 UTC
     boss.schedule("audit-partition-maintenance", "0 2 1 * *", {});
     boss.work("audit-partition-maintenance", async () => {
       await runPartitionMaintenance();
     });
   }

   export async function runPartitionMaintenance(now = new Date()) {
     // 1. Pre-create next month's partition
     const nextMonth = addMonths(now, 1);
     const partName = `audit_log_${format(nextMonth, "yyyy_MM")}`;
     const fromDate = format(nextMonth, "yyyy-MM-01");
     const toDate = format(addMonths(nextMonth, 1), "yyyy-MM-01");
     await db.execute(sql`
       CREATE TABLE IF NOT EXISTS ${sql.raw(partName)} PARTITION OF audit_log
         FOR VALUES FROM (${fromDate}) TO (${toDate})
     `);

     // 2. Detach old partitions exceeding retention
     const [configRow] = await db.execute(
       sql`SELECT retain_months FROM audit_retention_config WHERE entity_type = '*'`
     );
     const retainMonths = configRow?.retain_months ?? 84;
     const cutoffDate = subMonths(now, retainMonths);
     const oldPartName = `audit_log_${format(cutoffDate, "yyyy_MM")}`;

     await db.execute(sql`
       ALTER TABLE audit_log DETACH PARTITION IF EXISTS ${sql.raw(oldPartName)}
     `);

     console.log(`[partition-maintenance] Created: ${partName}, detached: ${oldPartName}`);
   }
   ```
3. Napisz `tests/audit/partition-maintenance.test.ts`:
   ```typescript
   it("creates next month partition for given date", async () => {
     await runPartitionMaintenance(new Date("2026-04-01"));
     const [row] = await db.execute(sql`
       SELECT tablename FROM pg_tables WHERE tablename = 'audit_log_2026_05'
     `);
     expect(row).toBeTruthy();
   });
   it("does not detach partition within retention window (84 months)", async () => {
     // With 84 month retention, date 2026-04-01 → cutoff = 2019-04 → partition should not exist to detach
     // Just assert no error thrown
     await expect(runPartitionMaintenance(new Date("2026-04-01"))).resolves.not.toThrow();
   });
   ```

## Files
**Create:** `drizzle/migrations/009-audit-retention.sql`, `packages/db/scripts/partition-maintenance.ts`, `tests/audit/partition-maintenance.test.ts`

## Done when
- `vitest tests/audit/partition-maintenance.test.ts` PASS — sprawdza: next-month partition created, no error on detach within retention window
- `pnpm test:smoke` green

## Rollback
`git revert HEAD --no-edit`
````

### Test gate (planning summary)
- **Integration:** `vitest tests/audit/partition-maintenance.test.ts` — covers: next-month partition creation, retention window logic
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert HEAD --no-edit`
## Dependency table

| ID | Type | Upstream | Parallel |
|---|---|---|---|
| T-00c-001 | T1 | [T-00b-000] | [T-00d-001, T-00e-001] |
| T-00c-002 | T2 | [T-00c-001, T-00b-E01, T-00b-E02] | [T-00c-003] |
| T-00c-003 | T2 | [T-00c-001, T-00b-006] | [T-00c-002] |
| T-00c-004 | T3 | [T-00c-002, T-00a-003] | [T-00c-005] |
| T-00c-005 | T2 | [T-00c-002] | [T-00c-004] |
| T-00c-006 | T4 | [T-00c-003, T-00c-004, T-00c-005, T-00i-005] | [] |
| T-00d-001 | T2 | [T-00b-000] | [T-00c-001, T-00e-001] |
| T-00d-002 | T1 | [T-00d-001, T-00c-003] | [T-00d-003] |
| T-00d-003 | T1 | [T-00d-001] | [T-00d-002] |
| T-00d-004 | T4 | [T-00d-002, T-00d-003, T-00b-004] | [T-00e-004] |
| T-00d-005 | T2 | [T-00c-003, T-00e-002] | [T-00d-004] |
| T-00e-001 | T1 | [T-00b-000] | [T-00c-001, T-00d-001] |
| T-00e-002 | T1 | [T-00e-001] | [T-00e-004] |
| T-00e-003 | T2 | [T-00e-002, T-00f-002, T-00b-E02] | [T-00e-004] |
| T-00e-004 | T2 | [T-00e-002, T-00b-E01] | [T-00e-003, T-00d-004] |
| T-00e-005 | T2 | [T-00e-001, T-00f-003] | [T-00e-004] |

---

## Wave plan

### Wave 0 — Architect enum locks (HARD BLOCKERS — serial, dispatch first)
*These are in 00-b and must be done before any 00-c/00-d/00-e work begins.*
- T-00b-000 — Baseline migration (architect lock)
- T-00b-E01 — permissions.enum.ts lock
- T-00b-E02 — events.enum.ts lock

### Wave 1 — Foundation stubs (parallel, no inter-dependency among 00-c/00-d/00-e)
*Requires: Wave 0 complete*
- T-00c-001 — Supabase Auth schema migration (parallel with T-00d-001, T-00e-001)
- T-00d-001 — policyFor helper (parallel with T-00c-001, T-00e-001)
- T-00e-001 — audit_log migration (parallel with T-00c-001, T-00d-001)

### Wave 2 — Core implementations (parallel groups)
*Requires: Wave 1 complete*
- T-00c-002 — signup/login Server Actions (parallel with T-00c-003)
- T-00c-003 — Next.js middleware (parallel with T-00c-002)
- T-00d-002 — RLS baseline migration (requires T-00c-003, parallel with T-00d-003)
- T-00d-003 — LEAKPROOF wrappers (parallel with T-00d-002)
- T-00e-002 — audit trigger factory (requires T-00e-001)

### Wave 3 — Secondary implementations
*Requires: Wave 2 complete*
- T-00c-004 — Login page UI (requires T-00c-002)
- T-00c-005 — Logout Server Action (requires T-00c-002, parallel with T-00c-004)
- T-00e-003 — audit.recorded outbox hook (requires T-00e-002 + T-00f-002)
- T-00e-004 — Audit query API (requires T-00e-002)
- T-00d-005 — impersonation plumbing (requires T-00c-003 + T-00e-002)

### Wave 4 — Integration tests + cron (late gate)
*Requires: Wave 3 complete*
- T-00d-004 — Cross-tenant leak regression suite (requires T-00d-002 + T-00d-003 + seeds)
- T-00e-005 — Retention + partition cron (requires T-00e-001 + T-00f-003)
- T-00c-006 — E2E auth flow (requires T-00c-003 + T-00c-004 + T-00c-005 + seed)

---

## PRD coverage

```
✅ 00-c Auth signup/login → T-00c-001, T-00c-002
✅ 00-c Session + middleware → T-00c-003
✅ 00-c Login UI → T-00c-004
✅ 00-c Logout → T-00c-005
✅ 00-c E2E auth → T-00c-006
✅ 00-d RLS policy helper → T-00d-001
✅ 00-d RLS baseline migration → T-00d-002
✅ 00-d LEAKPROOF wrappers → T-00d-003
✅ 00-d Cross-tenant regression gate → T-00d-004
✅ 00-d Impersonation plumbing → T-00d-005
✅ 00-e audit_log table → T-00e-001
✅ 00-e Generic trigger factory → T-00e-002
✅ 00-e audit.recorded outbox hook → T-00e-003
✅ 00-e Audit query API → T-00e-004
✅ 00-e Retention + partition maintenance → T-00e-005
⚠️ 00-c OAuth/SSO → NOT COVERED (deferred to E-1 per ADR-032)
⚠️ 00-d Per-table custom RLS overrides → NOT COVERED (addressed per-table as business modules added)
```

---

## Task count summary

| Sub-module | T1 | T2 | T3 | T4 | T5 | Total |
|---|---|---|---|---|---|---|
| 00-c Auth | 1 | 3 | 1 | 1 | 0 | **6** |
| 00-d RLS | 2 | 2 | 0 | 1 | 0 | **5** |
| 00-e Audit | 2 | 3 | 0 | 0 | 0 | **5** |
| **TOTAL** | **5** | **8** | **1** | **2** | **0** | **16** |

**Estimated wall-clock (sequential):** ~12.5h
**Estimated wall-clock (fully parallel waves):** ~3.5h (Wave 0: 2.5h → Wave 1: 1.5h → Wave 2: 1.5h → Wave 3: 1.5h → Wave 4: 1.5h)
**Total context budget:** ~680k tokens (across all 16 tasks, ~42k avg per task)
