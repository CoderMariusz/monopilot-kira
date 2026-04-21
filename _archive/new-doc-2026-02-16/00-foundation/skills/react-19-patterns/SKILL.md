---
name: react-19-patterns
description: Consolidated React 19 patterns — hooks (including useActionState, useEffectEvent), performance (React Compiler + manual memoization), forms (react-hook-form + Zod), and state management (Zustand client state, TanStack Query server state).
tags: [react, hooks, performance, forms, state, frontend]
---

## When to Use

Apply when writing React 19 functional components — managing state and effects, optimizing renders, building forms with validation, or deciding where state should live (local / lifted / context / Zustand / TanStack Query).

**React 19 context**: New hooks for forms/actions (`useActionState`, `useOptimistic`, `useFormStatus`) and effect events (`useEffectEvent` in 19.2). **React Compiler** (19+) automatically memoizes — profile first before adding manual `memo`/`useMemo`/`useCallback`.

---

## 1. Hooks

### `useState` with Objects
```typescript
interface FormState { name: string; email: string; }
const [form, setForm] = useState<FormState>({ name: '', email: '' });
setForm(prev => ({ ...prev, name: 'John' })); // Immutable update
```

### `useEffect` Cleanup
```typescript
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal }).then(r => r.json()).then(setData);
  return () => controller.abort();
}, [url]);
```

### `useCallback` for Stable References
```typescript
const handleSubmit = useCallback((data: FormData) => onSubmit(data), [onSubmit]);
```

### `useMemo` for Expensive Computations
```typescript
const sorted = useMemo(
  () => items.filter(i => i.active).sort((a, b) => a.name.localeCompare(b.name)),
  [items]
);
```

### Custom Hook Pattern
```typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

### `useRef` for DOM Access
```typescript
const inputRef = useRef<HTMLInputElement>(null);
return <input ref={inputRef} />;
```

### `useActionState` (React 19)
```typescript
import { useActionState } from 'react';

async function submitForm(prevState: any, formData: FormData) {
  return { success: true, name: formData.get('name') };
}

function MyForm() {
  const [state, action, isPending] = useActionState(submitForm, null);
  return (
    <form action={action}>
      <input name="name" disabled={isPending} />
      <button disabled={isPending}>Submit</button>
      {state?.success && <p>Success: {state.name}</p>}
    </form>
  );
}
```
Source: https://react.dev/blog/2024/12/05/react-19

### `useEffectEvent` (React 19.2) — non-reactive logic in effect
```typescript
import { useEffect, useEffectEvent } from 'react';

function Chat({ roomId, theme }) {
  const onConnected = useEffectEvent(() => showNotification('Connected!', theme));
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.on('connected', onConnected);
    connection.connect();
    return () => connection.disconnect();
  }, [roomId]); // theme does NOT trigger re-connect
}
```

---

## 2. Performance

### React Compiler (19+)
**When enabled, manual `memo`/`useMemo`/`useCallback` are usually unnecessary.** Profile first with React DevTools before adding manual optimizations. Still use manual memoization for: third-party libs requiring stable refs, edge cases compiler cannot optimize, React 17–18 projects without compiler.

### `React.memo` for Pure Components
```typescript
import { memo } from 'react';
const ListItem = memo(function ListItem({ id, title, onClick }: ItemProps) {
  return <li onClick={() => onClick(id)}>{title}</li>;
});
```

### Virtualization for Long Lists
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });
  return (
    <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(row => (
          <div key={row.key} style={{ transform: `translateY(${row.start}px)` }}>
            {items[row.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Lazy Loading
```typescript
import { lazy, Suspense } from 'react';
const HeavyChart = lazy(() => import('./HeavyChart'));

function Dashboard() {
  return <Suspense fallback={<Spinner />}><HeavyChart /></Suspense>;
}
```

---

## 3. Forms

### React Hook Form + Zod
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 characters'),
});
type FormData = z.infer<typeof schema>;

function Form() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  return (
    <form onSubmit={handleSubmit(data => console.log(data))}>
      <input {...register('email')} />
      {errors.email && <span>{errors.email.message}</span>}
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Field Array (Dynamic Fields)
```typescript
import { useFieldArray, useForm } from 'react-hook-form';

function DynamicForm() {
  const { control, register } = useForm({ defaultValues: { items: [{ name: '' }] } });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  return (
    <>
      {fields.map((field, i) => (
        <div key={field.id}>
          <input {...register(`items.${i}.name`)} />
          <button onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button onClick={() => append({ name: '' })}>Add</button>
    </>
  );
}
```

### Monopilot — ShadCN Form Pattern
```tsx
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const form = useForm<FormData>({ resolver: zodResolver(formSchema), defaultValues: { code: '', name: '' } });
const createMutation = useCreateSupplier();
const onSubmit = async (data: FormData) => {
  try {
    await createMutation.mutateAsync(data);
    toast({ title: 'Success', description: 'Created.' });
  } catch (e) {
    toast({ title: 'Error', description: e.message, variant: 'destructive' });
  }
};

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField control={form.control} name="code" render={({ field }) => (
      <FormItem>
        <FormLabel>Code</FormLabel>
        <FormControl><Input {...field} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
  </form>
</Form>
```

---

## 4. State Management

### Decision Tree
```
Local (useState)       — form inputs, UI state (open/closed, selected tab)
Lifted state           — shared between 2–3 siblings
Context                — theme, locale, auth status (rarely changing)
Zustand (client state) — cart, preferences, shared across routes
TanStack Query (server) — API data, caching, optimistic updates
```

### Zustand Store
```typescript
import { create } from 'zustand';

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  total: () => number;
}

const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  addItem: (item) => set(state => ({ items: [...state.items, item] })),
  total: () => get().items.reduce((sum, i) => sum + i.price, 0),
}));
```

### TanStack Query — Server State
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (user: NewUser) => fetch('/api/users', { method: 'POST', body: JSON.stringify(user) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

### Context for Theme/Auth
```typescript
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be within AuthProvider');
  return ctx;
};
```

---

## Anti-Patterns

- Hooks in conditions/loops — call at top level only
- Missing `useEffect` dependencies — include all used values (except `useEffectEvent` refs)
- Async function as `useEffect` callback — define inside, then call it
- Direct state mutation — always use setter + spread
- Manual `memo` everywhere with React Compiler on — redundant
- Inline `{}` / `[]` props to memoized children — new ref each render
- API data in Zustand — use TanStack Query
- Everything in global state — start local, lift only when needed
- Context for frequently-changing data — triggers full subtree re-renders
- Controlled input on every keystroke when RHF `register` (uncontrolled) would suffice

## Verification Checklist

- [ ] Hooks at top level
- [ ] All dependencies in dependency arrays
- [ ] Cleanup functions for subscriptions/timers
- [ ] `useEffectEvent` refs excluded from deps (19.2+)
- [ ] Profiled before manual `memo`/`useMemo`/`useCallback`
- [ ] Lists with 100+ items virtualized
- [ ] Forms use Zod schema; errors displayed near inputs
- [ ] Server state via TanStack Query; client state via Zustand
- [ ] Context only for stable global data

## Related Skills

- `nextjs-v16-patterns` — RSC + Server Actions composition with React 19
- `typescript-patterns-v2` — type patterns for generic hooks
- `typescript-zod` — schema validation (dedicated skill)
- `testing-patterns` — testing hooks + components with Vitest + RTL
