# Warehouse Module — Prototype → Production Translation Guide

**Generated:** 2026-04-23  
**Scope:** 38 reusable UI components indexed from warehouse prototype JSX  
**Target Stack:** Next.js 16 App Router + shadcn/ui + Server Actions + Zod validation  

---

## Quick Inventory

### Modals (M-01 through M-15, plus Force Unlock)
1. **M-01 GRN from PO** (3-step wizard, 120 min) — Multi-LP creation with dynamic rows
2. **M-02 GRN from TO** (simple form, 60 min) — Pre-existing LP receipt
3. **M-03 Stock Move** (form + approval gate, 80 min) — >10% delta requires approval
4. **M-04 LP Split** (multi-row validator, 90 min) — Sum must equal source qty
5. **M-05 LP Merge** (2-step wizard, 75 min) — Batch/expiry/QA validation
6. **M-06 QA Status Change** (dual-path, 70 min) — State machine transitions + reason codes
7. **M-07 Label Print** (preview + history, 85 min) — Printer selection + queue option
8. **M-08 Reserve** (hard-lock form, 65 min) — Expiry/conflict validation
9. **M-09 Release Reservation** (destructive, 60 min) — Reason enum + admin override path
10. **M-10 FEFO Deviation** (compare, 70 min) — Warning (not blocking) + reason codes
11. **M-11 Destroy / Scrap** (destructive + confirm, 75 min) — Partial scrap triggers split
12. **M-12 Use_by Override** (manager-only, 65 min) — High-audit compliance action
13. **M-13 Location Create/Edit** (simple form, 60 min) — Depth validator + hierarchy
14. **M-14 Cycle Count** (stub, 70 min) — P1 quick adjustment with approval gate
15. **M-15 State Transition** (confirm modal, 60 min) — LP state machine transitions
16. **Force Unlock** (admin modal, 40 min) — Scanner session termination

### Pages (9 major screens)
- **WH-002 LP List** (search-filter-list, 110 min) — Tabs, bulk actions, inline modals
- **WH-003 LP Detail** (7-tab composite, 140 min) — Overview, movements, genealogy, reservations, state, labels, audit
- **WH-010 GRN List & Detail** (list + readonly, 135 min) — Tab filtering + status history
- **WH-006 Stock Movements** (list + side panel, 90 min) — Movement history with detail slide-in
- **WH-017 Reservations** (list with summary, 75 min) — Hard-lock tracking per WO
- **WH-012 Inventory Browser** (3-view aggregation, 85 min) — By-product / by-location / by-batch
- **WH-018 Locations** (hierarchy browser, 100 min) — Tree + bin-occupancy grid + LPs table
- **WH-014 Genealogy** (tracer + visualization, 95 min) — Forward/backward/full trace with FSMA export
- **WH-019 Expiry** (management dashboard, 85 min) — Cron-triggered blocking + shelf-mode semantics
- **WH-020 Settings** (admin form, 120 min) — 9 configuration categories

### Dashboard (WH-001)
- KPI strip (8 cards, role-restricted)
- Alerts panel (dismissal, CTA buttons)
- Expiry summary (color-coded cards + top-5 table)
- Activity feed (type-filtered timeline)

---

## Key Translation Patterns

### 1. **Form State Management: useState → useForm**

**Prototype pattern:**
```jsx
const [form, setForm] = React.useState({
  lp: "", qty: 100, dest: "WH-Factory-A › Cold › B3", reason: "", reasonText: ""
});
// Manual field updates
<input value={form.lp} onChange={e => setForm({...form, lp: e.target.value})} />
```

**Production equivalent:**
```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const schema = z.object({
  lp: z.string().min(1, "LP required"),
  qty: z.number().positive("Qty must be positive"),
  dest: z.string().min(1, "Destination required"),
  reason: z.string().min(1, "Reason required"),
  reasonText: z.string().min(10, "Min 10 chars").optional(),
});

const form = useForm({ resolver: zodResolver(schema), defaultValues: { lp: "", qty: 100 } });
// Bind via Form / FormField / FormControl
<FormField control={form.control} name="lp" render={({ field }) => (
  <FormItem>
    <FormControl>
      <Input placeholder="Scan or type LP..." {...field} />
    </FormControl>
    <FormMessage />
  </FormItem>
)} />
```

**Gotchas:**
- Prototype uses raw onChange handlers; production uses react-hook-form's `watch()` / `control` for cross-field deps
- Zod schema must include `.optional()` / `.nullable()` for conditional fields
- Form.formState.isSubmitting gates the button during async action

---

### 2. **Modal State: window.Modal → @radix-ui/react-dialog**

**Prototype pattern:**
```jsx
<Modal open={open} onClose={onClose} title="..." size="wide|default|fullpage">
  {step === "select" && <div>Step 1</div>}
  {step === "entry" && <div>Step 2</div>}
  <Footer>{/* buttons */}</Footer>
</Modal>
```

**Production equivalent:**
```tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

<Dialog open={open} onOpenChange={onClose}>
  <DialogContent className={size === "wide" ? "max-w-2xl" : "max-w-lg"}>
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{subtitle}</DialogDescription>
    </DialogHeader>
    
    {step === "select" && <div>Step 1</div>}
    {step === "entry" && <div>Step 2</div>}
    
    <DialogFooter>
      {/* buttons */}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Gotchas:**
- Radix Dialog does NOT have built-in `size` prop; use `className` with `max-w-*` tailwind classes
- `onOpenChange` is a boolean callback (called with `true`/`false`), not `onClose` signature
- Modal footer buttons must be inside DialogFooter for proper right-alignment

---

### 3. **Validation Rules: Hardcoded JS → Server-Side Domain Service**

**Prototype pattern:**
```jsx
const needsApproval = form.moveType === "adjustment" && deltaPct > 10;
const reasonRequired = form.moveType === "adjustment" || form.moveType === "quarantine" || form.moveType === "return";
// Conditional UI rendering
{needsApproval && <button>Submit for approval</button>}
{!needsApproval && <button>Confirm move</button>}
```

**Production equivalent:**
```tsx
// Server domain service
// lib/domain/warehouse-rules.ts
export function checkApprovalRequired(moveType: string, deltaPct: number): boolean {
  return moveType === "adjustment" && deltaPct > 10;
}

export function checkReasonRequired(moveType: string): boolean {
  return ["adjustment", "quarantine", "return"].includes(moveType);
}

// Client-side form submission
async function onSubmit(data: z.infer<typeof schema>) {
  const result = await submitStockMovement(data); // Server Action
  if (result.requiresApproval) {
    // Route to approval workflow / show approval modal
    setRequiresApproval(true);
  } else {
    onClose(); // Success
  }
}
```

**Gotchas:**
- V-rules (V-WH-MOV-004, V-WH-FEFO-003) are NOT just UI logic — they are domain constraints that must be enforced on the server
- Prototype shows conditional UI; production must validate on server + reject if rule violated
- Use discriminated unions (TypeScript) to type different move types for better type safety

---

### 4. **Dynamic Field Visibility: Conditional Render → Form.watch()**

**Prototype pattern:**
```jsx
{reasonRequired && (
  <Field label="Reason code" required>
    <select value={form.reason} onChange={...}>
      {/* options */}
    </select>
  </Field>
)}
{form.reason === "other" && (
  <Field label="Reason text" required>
    <ReasonInput {...} />
  </Field>
)}
```

**Production equivalent:**
```tsx
const reasonRequired = watch("moveType") !== "transfer"; // or computed from schema
const isOtherReason = watch("reason") === "other";

<FormField control={control} name="reason" render={({ field }) => (
  reasonRequired ? (
    <FormItem>
      <FormControl>
        <Select value={field.value} onValueChange={field.onChange}>
          {/* options */}
        </Select>
      </FormControl>
    </FormItem>
  ) : null
)} />

<FormField control={control} name="reasonText" render={({ field }) => (
  isOtherReason && reasonRequired ? (
    <FormItem>
      <FormControl>
        <Textarea {...field} />
      </FormControl>
    </FormItem>
  ) : null
)} />
```

**Gotchas:**
- `.watch()` re-renders only the component calling it, not the entire form
- Conditional field rendering must handle missing Zod schema keys (use `.optional()`)
- Validation errors only show if field is actually in the form

---

### 5. **Multi-Row Editors: Array State → useFieldArray**

**Prototype pattern:**
```jsx
const [rows, setRows] = React.useState([
  { qty: 60, dest: "Cold › B3", label: true },
  { qty: 140, dest: "Production › Line-1", label: true },
]);
const sum = rows.reduce((a, r) => a + (+r.qty || 0), 0);
const valid = sum === lp.qty;

{rows.map((r, i) => (
  <tr key={i}>
    <td><input type="number" value={r.qty} onChange={e => {
      const next = [...rows];
      next[i] = {...r, qty: +e.target.value};
      setRows(next);
    }} /></td>
  </tr>
))}
<button onClick={() => setRows([...rows, { qty: 0, dest: "", label: true }])}>＋ Add row</button>
```

**Production equivalent:**
```tsx
import { useFieldArray } from "react-hook-form";

const { fields, append, remove } = useFieldArray({
  control,
  name: "outputs", // Array field in schema
});

const sum = watch("outputs").reduce((a, r) => a + (r.qty || 0), 0);

{fields.map((field, index) => (
  <tr key={field.id}>
    <td>
      <FormField control={control} name={`outputs.${index}.qty`} render={({ field: f }) => (
        <FormControl>
          <Input type="number" {...f} />
        </FormControl>
      )} />
    </td>
    <td>
      <Button onClick={() => remove(index)}>Delete</Button>
    </td>
  </tr>
))}
<Button onClick={() => append({ qty: 0, dest: "", label: true })}>＋ Add row</Button>
```

**Gotchas:**
- `useFieldArray` manages field IDs automatically; use `field.id` as key, not index
- `.watch()` on array fields triggers full re-render; use computed derivations outside the map
- Zod array schema: `z.array(z.object({ qty: z.number(), ... }))`

---

### 6. **Data Queries: Mock Arrays → Server Queries + Invalidation**

**Prototype pattern:**
```jsx
const visible = WH_LPS.filter(l =>
  (tab === "all" ? true : l.status === tab) &&
  (!search || l.lp.toLowerCase().includes(search.toLowerCase()) || ...)
);
```

**Production equivalent:**
```tsx
// Server Action
"use server";
export async function getLP(params: { tab: string; search: string; page: number }) {
  const session = await auth(); // RBAC gate
  const filter = {
    status: params.tab === "all" ? undefined : params.tab,
    // fulltext search via DB index
  };
  return db.query.lp.findMany({
    where: (lp) => and(
      params.tab === "all" ? undefined : eq(lp.status, params.tab),
      params.search ? like(lp.id, `%${params.search}%`) : undefined,
    ),
    limit: 50,
    offset: params.page * 50,
  });
}

// Client component
const [searchParams, setSearchParams] = useSearchParams();
const tab = searchParams.get("tab") ?? "all";
const search = searchParams.get("search") ?? "";
const page = parseInt(searchParams.get("page") ?? "0");

const { data, isPending } = useSuspenseQuery(
  ["lps", tab, search, page],
  () => getLP({ tab, search, page }),
);

// Invalidate on mutation
function onMovementCreated() {
  queryClient.invalidateQueries({ queryKey: ["lps"] });
}
```

**Gotchas:**
- Client-side filtering is fine for <500 rows; production uses DB indexing + cursor pagination
- `.watch()` on search input triggers queries; debounce the query call
- Always apply RBAC guard in Server Action before querying

---

### 7. **Alert / Banner Styling: CSS Classes → shadcn Alert**

**Prototype pattern:**
```jsx
<div className="alert-box alert-amber" style={{fontSize:12, marginBottom:10}}>
  <span>⚠</span>
  <div><b>This adjustment exceeds 10%.</b></div>
</div>
```

**Production equivalent:**
```tsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

<Alert variant="destructive"> {/* or "default" for info, construct variants as needed */}
  <AlertTriangle className="h-4 w-4" />
  <AlertTitle>This adjustment exceeds 10%</AlertTitle>
  <AlertDescription>Manager approval is required (V-WH-MOV-004).</AlertDescription>
</Alert>
```

**Gotchas:**
- shadcn Alert has built-in variants; prototype's `alert-amber` / `alert-red` map to custom variants
- Use lucide icons instead of emoji/unicode for consistency
- Alert variant="destructive" shows red; add custom variants for amber/blue as needed

---

### 8. **Tabs: Manual State → shadcn Tabs**

**Prototype pattern:**
```jsx
const [tab, setTab] = React.useState("overview");
{tab === "overview" && <div>Overview content</div>}
{tab === "movements" && <div>Movements content</div>}
<button onClick={() => setTab("overview")}>Overview</button>
```

**Production equivalent:**
```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

<Tabs value={tab} onValueChange={setTab} defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview{count && <span className="ml-2 text-xs">{count}</span>}</TabsTrigger>
    <TabsTrigger value="movements">Movements <span className="ml-2 text-xs">{movements.length}</span></TabsTrigger>
  </TabsList>
  
  <TabsContent value="overview">Overview content</TabsContent>
  <TabsContent value="movements">Movements content</TabsContent>
</Tabs>
```

**Gotchas:**
- Tab value must match TabsTrigger value exactly
- Tab count badges in trigger labels are custom (not built-in); use inline span

---

### 9. **Reason/Audit Fields: ReasonInput Helper → Textarea + Zod minLength**

**Prototype pattern:**
```jsx
<ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Explain..." />
```

**Production equivalent:**
```tsx
// _shared/ReasonInput is deprecated; use Textarea + FormMessage
<FormField control={control} name="reasonText" render={({ field }) => (
  <FormItem>
    <FormLabel>Reason text</FormLabel>
    <FormControl>
      <Textarea 
        placeholder="Explain the reason..." 
        {...field}
        className="min-h-[100px]"
      />
    </FormControl>
    <FormDescription>Minimum 10 characters — logged to audit trail</FormDescription>
    <FormMessage />
  </FormItem>
)} />
```

Schema:
```tsx
reasonText: z.string().min(10, "At least 10 characters required")
  .optional()
  .refine(val => !reasonRequired || val, "Required when reason='other'"),
```

**Gotchas:**
- Zod `.refine()` for cross-field logic (if reason='other', reasonText is required)
- FormDescription explains audit implications

---

### 10. **Status Badges: Inline Components → Consistent Primitive Map**

**Prototype pattern:**
```jsx
const LPStatus = ({ s }) => (
  <span className={"lp-status " + s}>{label}</span>
);
const QAStatus = ({ s }) => (
  <span className={"qa-status " + s}>{s}</span>
);
```

**Production equivalent:**
```tsx
// lib/components/status-badge.tsx
import { Badge } from "@/components/ui/badge";

export function LPStatus({ status }: { status: "available" | "reserved" | "blocked" | "consumed" | "shipped" | "merged" }) {
  const variantMap = {
    available: "default",
    reserved: "secondary",
    blocked: "destructive",
    consumed: "outline",
    shipped: "outline",
    merged: "outline",
  };
  const labelMap = {
    available: "Available",
    reserved: "Reserved",
    blocked: "Blocked",
    consumed: "Consumed",
    shipped: "Shipped",
    merged: "Merged",
  };
  return <Badge variant={variantMap[status]}>{labelMap[status]}</Badge>;
}

export function QAStatus({ status }: { status: string }) {
  const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    PASSED: "default",
    HOLD: "secondary",
    FAILED: "destructive",
    RELEASED: "default",
    PENDING: "outline",
    QUARANTINED: "destructive",
    COND_APPROVED: "secondary",
  };
  return <Badge variant={variantMap[status] ?? "outline"}>{status}</Badge>;
}
```

**Gotchas:**
- Extract status mappers into reusable functions in `/lib`
- Use TypeScript discriminated unions for type-safe status values

---

## Common Gotchas Across All Prototypes

### A. **Hard-Coded Data → Real Queries**
All `WH_*` arrays (WH_LPS, WH_GRNS, WH_MOVEMENTS, etc.) are mock data. Production:
- Use Drizzle ORM queries in Server Actions
- Implement row-level security (RLS) via RBAC checks
- Cache with `unstable_cache()` where appropriate (dashboard KPIs, inventory aggregates)

### B. **Hardcoded Polish Labels → next-intl**
```tsx
// Replace all hardcoded strings with i18n keys
<button>＋ Add LP row</button>

// Production:
import { useTranslations } from "next-intl";
const t = useTranslations("warehouse.modals.grn-from-po");
<button>{t("add-lp-row")}</button>
```

### C. **CSS Classes → Tailwind + shadcn**
Prototype uses custom CSS (`.alert-box`, `.grn-prog`, `.lp-status`, etc.). Production:
- Use shadcn primitives where available (Alert, Card, Badge, Button)
- Build custom styled components in `/components/ui/custom/` for warehouse-specific patterns
- Use `cn()` utility for conditional class composition

### D. **Alert Colors (Red/Amber/Blue) → Variants**
shadcn Alert has limited built-in variants. Create custom variants:
```tsx
// ui/alert.tsx: Add destructive (red), warning (amber), info (blue) variants
const alertVariants = cva("...", {
  variants: {
    variant: {
      default: "...",
      destructive: "border-red-500 bg-red-50 text-red-800",
      warning: "border-amber-500 bg-amber-50 text-amber-800",
      info: "border-blue-500 bg-blue-50 text-blue-800",
    },
  },
});
```

### E. **Approval Gates & Workflows**
Modals that submit for approval (M-03, M-14) don't have an approval workflow in the prototype. Production:
- Create separate approval queue table (adjustments_pending_approval)
- Manager dashboard shows approval tasks
- Approval action updates main table + audit log
- Use Outbox pattern to emit ApprovalRequested event

### F. **Scanner Integration**
Prototype has `<input placeholder="Scan or type LP...">` but no actual scanner. Production:
- Integrate with 06-Scanner module via MCP or API
- Scanner validates scanned barcode format (GS1-128, Code128, etc.)
- Return validation result to form (valid LP, duplicate, not found, etc.)

### G. **Genealogy Graph Visualization**
Prototype shows flat list of genealogy nodes. Production spec (WH-014) requires:
- Recursive CTE query to build DAG
- Tree visualization (react-flow or custom SVG)
- SVG edges with labels + thickness
- Cycle detection + red cycle nodes

This is deferred to Phase 2 (see BACKLOG.md BL-WH-05).

### H. **Label Printing (M-07)**
Prototype shows HTML preview; real printing:
- Generate ZPL (Zebra) / EPL (Intermec) format files
- Queue print jobs in print_jobs table
- Printer polling / webhook for job status
- Offline queue for unreachable printers

See BACKLOG.md BL-WH-04.

### I. **Date/Time Formatting**
All dates hardcoded as strings. Production:
```tsx
import { format } from "date-fns";
import { useLocale } from "next-intl";

const locale = useLocale();
const formatted = format(new Date(date), "dd MMM yyyy", { locale: getDateFnsLocale(locale) });
```

### J. **Search & Filter Debouncing**
Prototype filters on every keystroke. Production:
```tsx
const [searchInput, setSearchInput] = useState("");
const debouncedSearch = useDebounce(searchInput, 300);

useEffect(() => {
  refetch({ search: debouncedSearch, tab, page: 0 });
}, [debouncedSearch, tab]);
```

---

## Module-Wide Dependencies

### shadcn/ui Imports (Used Across All Components)
```tsx
// Form / Input components
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

// Dialog / Modal
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Data display
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Actions
import { Button } from "@/components/ui/button";

// Utilities
import { cn } from "@/lib/utils";
```

### External Libraries
```json
{
  "react-hook-form": "^7.51.0",
  "@hookform/resolvers": "^3.3.0",
  "zod": "^3.22.0",
  "date-fns": "^3.3.0",
  "next-intl": "^3.0.0",
  "lucide-react": "^0.376.0"
}
```

---

## Estimated Effort Summary

| Component Type | Count | Avg Time (min) | Category |
|---|---|---|---|
| Modal (forms) | 16 | 68 | Simple → Composite |
| Page (list/detail) | 9 | 92 | Medium → Large |
| **Total** | **25** | **~1,700 min** | **~28 hours** |

---

## Phase 2 Backlog Items Affecting Translation

- **BL-WH-01**: Full cycle count workflow (M-14 is stub)
- **BL-WH-04**: Label ZPL render (currently HTML preview)
- **BL-WH-05**: Inventory by-location hierarchical browser (currently flat)
- **BL-WH-06**: ext_jsonb schema extensions editor (currently read-only)

---

## QA Checklist Before Handoff to Production

- [ ] All modals pass Zod validation + display errors correctly
- [ ] Server Actions enforce RBAC + V-rules on every mutation
- [ ] Queries use Drizzle ORM (no raw SQL except CTE genealogy)
- [ ] Alert banners use consistent shadcn Alert with variants
- [ ] All hardcoded labels replaced with next-intl keys
- [ ] Timestamp rendering uses date-fns + locale
- [ ] Search/filter inputs debounced (300ms)
- [ ] Bulk actions correctly filter visible rows (not all rows)
- [ ] Tab counts match actual filtered data
- [ ] Approval gates trigger correct workflow (not just UI block)
- [ ] Outbox events emitted for async operations (GRN create, movement approval, etc.)
- [ ] Modal footer buttons match spec (Cancel/Confirm or Next/Back)
- [ ] Genealogy query uses CTE (max depth 10, query SLO <30s)
- [ ] Expiry cron scheduled correctly (default 02:00 UTC daily)

---

## References

- **Prototype schema:** `_shared/MODAL-SCHEMA.md` (part of prototype)
- **Domain rules:** V-WH-* validation rules in spec docs
- **Related modules:** 06-Scanner (barcode), 02-Settings (printer config), 04-Planning (WO links)
- **Shelf-life EU:** 1169/2011 food safety regulation (use_by auto-blocking, best_before warnings)
