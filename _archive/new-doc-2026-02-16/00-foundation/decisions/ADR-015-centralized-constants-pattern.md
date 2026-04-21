# ADR-015: Centralized Constants Pattern

**Status:** Accepted
**Date:** 2025-12-29
**Context:** Story 02.5b (BOM Items Phase 1B Refactoring)
**Deciders:** SENIOR-DEV, ARCHITECT

---

## Context and Problem Statement

During Phase 1B implementation, duplicate constants were found across multiple components:
- `DEFAULT_FLAGS` array defined in 3 locations
- `FLAG_COLORS` object duplicated
- Magic numbers for validation limits (500, 6 decimals, etc.)
- CSV template configuration spread across modal and tests

**Problem:** Duplicate constants lead to:
- Inconsistency when values need to change
- Larger bundle size (same data shipped multiple times)
- Maintenance burden (update in multiple places)
- Risk of copy-paste errors

**Question:** How should we organize constants in a React/Next.js application to ensure DRY, maintainability, and type safety?

---

## Decision Drivers

- **DRY Principle:** Single source of truth for all constants
- **Type Safety:** TypeScript inference for constants
- **Maintainability:** Easy to find and update constants
- **Bundle Size:** Shared constants reduce duplication
- **Developer Experience:** Clear import paths, good IntelliSense
- **Scalability:** Pattern works for multiple modules

---

## Considered Options

### Option 1: Inline Constants in Each Component
**Current state before refactoring**

```tsx
// Component1.tsx
const DEFAULT_FLAGS = [
  { id: 'f-1', code: 'organic', name: 'Organic' },
  // ...
]

// Component2.tsx
const DEFAULT_FLAGS = [
  { id: 'f-1', code: 'organic', name: 'Organic' },
  // ...
]
```

**Pros:**
- Simple, no additional files
- Clear what constants belong to component

**Cons:**
- ❌ Duplication (same constants in multiple files)
- ❌ Inconsistency risk (update one, forget others)
- ❌ Larger bundle size
- ❌ Hard to find all usages

---

### Option 2: Single Global Constants File
**All constants in one file**

```tsx
// lib/constants.ts
export const DEFAULT_CONDITIONAL_FLAGS = [...]
export const BOM_ITEM_DEFAULTS = {...}
export const PRODUCTION_LINE_DEFAULTS = {...}
export const QUALITY_CHECK_DEFAULTS = {...}
// ... hundreds of constants
```

**Pros:**
- Single source of truth
- Easy to find (`constants.ts`)

**Cons:**
- ❌ Monolithic file (becomes huge over time)
- ❌ Import entire file even if using one constant
- ❌ Merge conflicts in team environment
- ❌ Hard to navigate (hundreds of exports)

---

### Option 3: Module-Specific Constants Files ✅ **SELECTED**
**One constants file per feature/module**

```tsx
// lib/constants/bom-items.ts
export const BOM_ITEM_DEFAULTS = {...}
export const BOM_ITEM_LIMITS = {...}
export const DEFAULT_CONDITIONAL_FLAGS = [...]

// lib/constants/production-lines.ts
export const PRODUCTION_LINE_DEFAULTS = {...}
```

**Pros:**
- ✅ Organized by feature/domain
- ✅ Small, focused files
- ✅ Tree-shakeable (only import what you need)
- ✅ Easy to find (constants/[feature].ts)
- ✅ Scales well with project growth
- ✅ Clear ownership (matches feature structure)

**Cons:**
- More files to manage (minor)
- Need naming convention

---

### Option 4: Constants in Types Files
**Co-locate constants with type definitions**

```tsx
// lib/types/bom-items.ts
export interface BOMItem {...}
export const BOM_ITEM_DEFAULTS = {...}
```

**Pros:**
- Co-located with related types

**Cons:**
- ❌ Mixes data and types (confusing)
- ❌ Types files become large
- ❌ Violates single responsibility principle

---

## Decision Outcome

**Chosen Option: Module-Specific Constants Files (Option 3)**

Create `lib/constants/[module].ts` files for each feature module.

### Implementation Structure

```
lib/
  constants/
    bom-items.ts        # BOM items constants
    production-lines.ts # Production line constants
    quality-checks.ts   # Quality check constants
    index.ts            # Optional: re-export commonly used constants
```

### Naming Convention

**File Names:** `kebab-case.ts` matching feature name
**Constant Names:** `SCREAMING_SNAKE_CASE` for primitive constants
**Object Names:** `PascalCase` with `DEFAULTS` or `LIMITS` suffix

**Examples:**
```tsx
export const MAX_BULK_IMPORT = 500  // Primitive
export const BOM_ITEM_DEFAULTS = { ... }  // Object
export const BOM_ITEM_LIMITS = { ... }  // Object
```

### Constant Categories

Each constants file should export:

1. **Defaults** - Default values for fields
   ```tsx
   export const BOM_ITEM_DEFAULTS = {
     CONSUME_WHOLE_LP: false,
     LINE_IDS: null,
     SEQUENCE_INCREMENT: 10,
   } as const
   ```

2. **Limits** - Validation limits
   ```tsx
   export const BOM_ITEM_LIMITS = {
     MAX_BULK_IMPORT: 500,
     MAX_QUANTITY_DECIMALS: 6,
   } as const
   ```

3. **Enums/Options** - Dropdown options, flag lists
   ```tsx
   export const DEFAULT_CONDITIONAL_FLAGS = [
     { id: 'f-1', code: 'organic', name: 'Organic' },
   ] as const
   ```

4. **Helper Functions** - Pure functions using constants
   ```tsx
   export function getFlagColor(code: string): string {
     return FLAG_COLORS[code] || FLAG_COLORS.default
   }
   ```

---

## Usage Examples

### Before Refactoring (Duplicate Constants)

```tsx
// ConditionalFlagsSelect.tsx
const DEFAULT_FLAGS = [
  { id: 'f-1', code: 'organic', name: 'Organic' },
  { id: 'f-2', code: 'vegan', name: 'Vegan' },
]

const FLAG_COLORS = {
  organic: 'bg-green-100 text-green-800',
  vegan: 'bg-emerald-100 text-emerald-800',
}

// BOMBulkImportModal.tsx (duplicate!)
const DEFAULT_FLAGS = [
  { id: 'f-1', code: 'organic', name: 'Organic' },
  { id: 'f-2', code: 'vegan', name: 'Vegan' },
]
```

### After Refactoring (Centralized)

```tsx
// lib/constants/bom-items.ts
export const DEFAULT_CONDITIONAL_FLAGS = [
  { id: 'f-1', code: 'organic', name: 'Organic', is_active: true },
  { id: 'f-2', code: 'vegan', name: 'Vegan', is_active: true },
] as const

export const FLAG_COLORS = {
  organic: 'bg-green-100 text-green-800 border-green-200',
  vegan: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  default: 'bg-gray-100 text-gray-800 border-gray-200',
} as const

export function getFlagColor(code: string): string {
  return FLAG_COLORS[code as keyof typeof FLAG_COLORS] || FLAG_COLORS.default
}

// ConditionalFlagsSelect.tsx
import { DEFAULT_CONDITIONAL_FLAGS, getFlagColor } from '@/lib/constants/bom-items'

export function ConditionalFlagsSelect() {
  const flags = DEFAULT_CONDITIONAL_FLAGS
  const colorClass = getFlagColor(flag.code)
  // ...
}

// BOMBulkImportModal.tsx
import { DEFAULT_CONDITIONAL_FLAGS, BOM_ITEM_LIMITS } from '@/lib/constants/bom-items'

if (items.length > BOM_ITEM_LIMITS.MAX_BULK_IMPORT) {
  throw new Error(`Maximum ${BOM_ITEM_LIMITS.MAX_BULK_IMPORT} items allowed`)
}
```

---

## TypeScript Benefits

### Type Inference with `as const`

```tsx
export const BOM_ITEM_DEFAULTS = {
  CONSUME_WHOLE_LP: false,
  LINE_IDS: null,
  SEQUENCE_INCREMENT: 10,
} as const

// TypeScript infers:
// BOM_ITEM_DEFAULTS.CONSUME_WHOLE_LP is `false` (literal type, not boolean)
// BOM_ITEM_DEFAULTS.SEQUENCE_INCREMENT is `10` (literal type, not number)
```

### Readonly Arrays

```tsx
export const DEFAULT_CONDITIONAL_FLAGS = [
  { id: 'f-1', code: 'organic', name: 'Organic' },
] as const

// TypeScript prevents:
DEFAULT_CONDITIONAL_FLAGS.push(...) // Error: readonly array
DEFAULT_CONDITIONAL_FLAGS[0].code = 'vegan' // Error: readonly object
```

### Exported Types

```tsx
// Auto-generate types from constants
export type ConditionalFlagCode = typeof DEFAULT_CONDITIONAL_FLAGS[number]['code']
// Type is: 'organic' | 'vegan' | 'gluten_free' | 'kosher' | 'halal'
```

---

## Consequences

### Positive

- ✅ **DRY:** Single source of truth for all constants
- ✅ **Type Safety:** `as const` provides literal types
- ✅ **Maintainability:** Update in one place
- ✅ **Bundle Size:** Shared constants, tree-shakeable
- ✅ **Developer Experience:** Clear import paths, good IntelliSense
- ✅ **Scalability:** Pattern works for all modules
- ✅ **Testability:** Easy to mock constants in tests

### Negative

- ⚠️ **File Count:** More files to manage (minor - organized structure mitigates)
- ⚠️ **Learning Curve:** New developers need to learn pattern (minor - documented here)

### Neutral

- 🔷 Requires discipline to use constants instead of inline values
- 🔷 Need occasional cleanup to remove unused constants

---

## Compliance

### Where to Use This Pattern

✅ **Use centralized constants for:**
- Dropdown options (flags, statuses, types)
- Validation limits (max length, max decimals)
- Default values for form fields
- Magic numbers used in multiple places
- Configuration values (API endpoints, timeouts)
- UI constants (colors, sizes for specific domain objects)

❌ **Don't use centralized constants for:**
- Component-specific UI values (padding, margins) - use Tailwind
- One-off values used in single location
- Environment-specific values (use env variables)
- Values that change frequently based on user data

### Migration Strategy

1. Identify duplicate constants across components
2. Create `lib/constants/[module].ts` file
3. Export constants with `as const`
4. Add helper functions if needed
5. Update components to import from centralized file
6. Remove inline constant definitions
7. Run tests to verify no regressions

---

## Related Decisions

- **ADR-016:** CSV Parsing Utility Pattern (uses BOM_ITEM constants)
- **ADR-017:** React.memo Usage (stable constants enable effective memoization)

---

## References

- [TypeScript const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions)
- [React Best Practices: Constants](https://react.dev/learn/sharing-state-between-components#where-to-live-state)
- [Clean Code: Magic Numbers](https://refactoring.guru/replace-magic-number-with-symbolic-constant)

---

**Reviewed by:** ARCHITECT
**Approved by:** TECH-LEAD
**Implementation:** Story 02.5b (Phase 1B Refactoring)

---

## Status Update — 2026-04-17 (Monopilot Migration Phase 0)

**Relationship:** PARTIALLY SUPERSEDED by [ADR-028 Schema-driven column definition](ADR-028-schema-driven-column-definition.md).

See [`META-MODEL.md`](META-MODEL.md) for the broader meta-model context.

**What remains:** Centralized constants pattern (`types/constants.ts`) pozostaje w mocy dla **code-level constants** — enumy niekonfigurowalne per user (HTTP status codes, regulatoryjne stałe jak GS1 format ID, EU-14 allergen codes, internal system enums, magic numbers dla matematyki BOM). To obszar META-MODEL §3 (Code-driven domain, YAGNI).

**What changes:** Dla **user-editable constants** (kolumny tabel głównych, reference tables per-org, nazwy działów, status colors, workflow stage names, notification templates) przechodzimy na schema-driven storage (ADR-028). Nie żyją już w `types/constants.ts` — żyją w config tables w DB, edytowalne przez Settings UI, filtrowane przez RLS per org.

Praktyczna zasada rozstrzygania: jeśli *inna firma* mogłaby tego potrzebować inaczej → schema-driven (ADR-028). Jeśli to *regulatoryjne / matematyczne / infra* → code-driven (ADR-015 pozostaje).
