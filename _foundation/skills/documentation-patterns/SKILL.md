---
name: documentation-patterns
description: Apply when writing code documentation (JSDoc, README, API docs, inline comments) OR writing Monopilot project documentation (PRDs, ADRs, module docs, reality-sources) — includes Monopilot migration markers (UNIVERSAL / APEX-CONFIG / EVOLVING / LEGACY-D365).
tags: [documentation, jsdoc, readme, monopilot, markers]
---

## When to Use

Apply when writing code documentation: JSDoc comments, README files, API documentation, and inline comments.

## Patterns

### Pattern 1: Function Documentation (JSDoc)
```typescript
// Source: https://jsdoc.app/
/**
 * Calculates the total price including tax and discounts.
 *
 * @param items - Array of cart items with price and quantity
 * @param taxRate - Tax rate as decimal (e.g., 0.1 for 10%)
 * @param discountCode - Optional discount code to apply
 * @returns Total price after tax and discounts
 * @throws {InvalidDiscountError} If discount code is invalid
 *
 * @example
 * const total = calculateTotal(
 *   [{ price: 100, quantity: 2 }],
 *   0.1,
 *   'SAVE10'
 * );
 * // Returns: 198 (200 - 10% discount + 10% tax)
 */
function calculateTotal(
  items: CartItem[],
  taxRate: number,
  discountCode?: string
): number {
  // ...
}
```

### Pattern 2: README Structure
```markdown
# Project Name

Brief description (1-2 sentences).

## Features
- Feature 1
- Feature 2

## Quick Start
\`\`\`bash
npm install
npm run dev
\`\`\`

## Usage
Basic usage example with code.

## API Reference
Link to detailed docs or brief overview.

## Configuration
Environment variables and options.

## Contributing
How to contribute.

## License
MIT
```

### Pattern 3: When to Comment
```typescript
// GOOD: Explain WHY, not WHAT
// Rate limit to prevent API abuse (max 100 req/min per user)
const rateLimiter = createRateLimiter({ max: 100, window: 60 });

// GOOD: Explain non-obvious behavior
// Sort descending because latest items should appear first
items.sort((a, b) => b.date - a.date);

// BAD: Obvious from code
// Increment counter by 1
counter++;

// BAD: Outdated comment (code changed, comment didn't)
// Check if user is admin  <-- comment says admin, code checks moderator
if (user.role === 'moderator') { }
```

### Pattern 4: Module/File Header
```typescript
/**
 * @fileoverview Authentication utilities for JWT token management.
 *
 * This module handles:
 * - Token generation and validation
 * - Refresh token rotation
 * - Session management
 *
 * @module auth/tokens
 * @see {@link https://jwt.io/introduction} for JWT spec
 */
```

### Pattern 5: TODO Comments
```typescript
// TODO: Implement caching - Issue #123
// FIXME: Race condition when multiple users update - urgent
// HACK: Workaround for library bug, remove after v2.0 upgrade
// NOTE: This relies on database trigger for audit log

// Include: action, context, reference (issue/ticket)
// TODO(john): Refactor after Q1 - JIRA-456
```

## Anti-Patterns

- **No documentation** - At minimum, public API needs docs
- **Obvious comments** - `i++ // increment i`
- **Stale comments** - Update when code changes
- **Comment instead of fix** - Don't comment bad code, fix it

## Verification Checklist

- [ ] Public functions have JSDoc
- [ ] README has quick start guide
- [ ] Complex logic has WHY comments
- [ ] No stale/outdated comments
- [ ] TODOs have issue references

---

## Project-Specific: Monopilot Documentation Markers

**Scope:** Obowiązkowe przy pisaniu **dokumentacji projektowej Monopilot** (nie dotyczy kodu/JSDoc): PRDs, ADRs, stories, moduły `NN-module/*`, reality-sources w `_meta/reality-sources/*`. Sekcja uzupełnia patterns 1–5 dla projektu migracji Monopilot.

### Purpose

Markery oznaczają **pochodzenie / stabilność / konfigurowalność** wymagania. Bez nich nie da się rozróżnić co jest fundamentem branży, co jest specyfiką Apexa, co się jeszcze zmienia, co zniknie po migracji D365.

### 4 markery

| Marker | Znaczenie | Kiedy użyć | Przykład |
|---|---|---|---|
| `[UNIVERSAL]` | Fundamentalne dla food-manufacturing MES, każdy klient to ma | Traceability lot, BOM structure, WO state machine, EU-14 allergens, GS1 format | "System MUSI zapewniać forward/backward traceability <30s `[UNIVERSAL]`" |
| `[APEX-CONFIG]` | Apex ustawiła tak, inny klient może mieć inaczej (konfigurowalne w Settings) | Departamenty, kolumny Main Table, cascading reguły, seed reference tables | "7 działów: Commercial, Development, Production, Quality, Planning, Procurement, MRP `[APEX-CONFIG]`" |
| `[EVOLVING]` | Projekt jeszcze się zmienia, nie stabilny — trzymamy w DB nawet jeśli dziś tylko Apex | MRP potencjalny split na 2 działy, niektóre walidacje w trakcie ewolucji | "MRP potencjalnie split na 2 działy `[EVOLVING]`" |
| `[LEGACY-D365]` | Istnieje tylko z powodu D365, zniknie po migracji (feature flag `integration.d365.enabled`) | D365 Builder logic, D365 ItemNumber format, D365 error codes | "Kolumna `D365_ItemNumber` `[LEGACY-D365]`" |

### Application rules

- **Obowiązkowe** na każdym *wymaganiu* / *kolumnie tabeli* / *regule walidacji* / *punkcie workflow* w nowych dokumentach (Phase A+).
- Marker pisany bezpośrednio po treści — na końcu linii lub w nawiasie po nazwie obiektu.
- **Brak markera w nowych dokumentach = blocker review** (nie przechodzi quality gate fazy).
- **Istniejące dokumenty (pre-Phase 0)** — progressive migration, nie big-bang. Markujemy przy każdej edycji istniejącego fragmentu.

### Conflict resolution

Gdy wymaganie jest *zarówno* uniwersalne jak i ma Apex-specific value: użyj `[UNIVERSAL]` dla *zasady*, `[APEX-CONFIG]` dla *wartości*.

Przykład: "System MUSI obsługiwać allergeny `[UNIVERSAL]`. Apex używa 14 EU allergens `[APEX-CONFIG]`."

### Domyślna asymetria (conservative universality)

Gdy niepewne czy `[UNIVERSAL]` czy `[APEX-CONFIG]` → domyślnie `[APEX-CONFIG]`. Promocja do `[UNIVERSAL]` wymaga review i cross-walk z innymi reality sources (zobacz `REALITY-SYNC.md` §4). Fałszywe `[UNIVERSAL]` propaguje błędne założenia do wszystkich 16 modułów; fałszywe `[APEX-CONFIG]` tylko opóźnia generalizację.

### Related

- [`META-MODEL.md`](../../decisions/META-MODEL.md) §6 — decision table markerów + conflict resolution
- [`REALITY-SYNC.md`](../../patterns/REALITY-SYNC.md) — markery są brainstormowane podczas Session B propagation
- Spec: [`docs/superpowers/specs/2026-04-17-monopilot-migration-design.md`](../../../../docs/superpowers/specs/2026-04-17-monopilot-migration-design.md) §4.2
- ADRs: ADR-028 (schema-driven — markery na kolumnach), ADR-030 (departments markery), ADR-031 (per-org variation)
