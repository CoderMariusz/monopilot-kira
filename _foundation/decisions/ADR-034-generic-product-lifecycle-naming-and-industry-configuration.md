# ADR-034 — Generic Product Lifecycle Naming & Industry Configuration

**Status:** Proposed (Phase B.2 architectural review)  
**Date:** 2026-04-30  
**Authors:** Claude Code (architecture review)  
**Affected Modules:** 01-NPD (primary), 02-SETTINGS, 00-FOUNDATION  
**Decision:** Generalize 01-NPD from domain-specific naming to multi-industry framework

---

## Problem

Current 01-NPD PRD v3.0 is deeply rooted in domain-specific semantics suitable for one industry. To support multiple industries (Bakery, Pharmacy, FMCG, etc.), naming and configuration must be generalized:

| Domain-specific | Context example | Generalization needed |
|---|---|---|
| **FA** (Factory Article) | Finished product code | Product/Finished Good (FG) — applies to bakery, pharma, FMCG, etc. |
| **PR** (Process Request / intermediate code) | Process step intermediate | WIP (Work-In-Progress) or Intermediate Product — universal manufacturing term |
| **Finish_Meat** | Recipe/formula listing | **Components/Recipe** — generic for any multi-component product |
| **RM_Code** | Raw Material codes | **Ingredient/Input codes** — materials suppliers, raw inputs |
| **Meat_Pct** | Primary ingredient percentage | **Main Component %** or **Primary Ingredient %** — varies by industry |
| **Processes** | Manufacturing steps | **Manufacturing operations** — baking, pharma synthesis, consumer goods packaging, etc. |
| **Dieset** | Equipment configuration | **Equipment setup** or **Line config** — generic tooling/resource setup |
| **Shelf_Life** | Product expiration | Product **shelf life / expiry** — applies to all food/pharma/consumer goods |

**Current state:** Seed data, Reference tables, validation rules, and naming conventions are hardcoded for a single domain.

**Goal:** 
1. Extract domain-specific items as `[ORG-CONFIG]` / `[INDUSTRY-CONFIG]`
2. Define `[UNIVERSAL]` generic patterns
3. Enable tenant/industry-level prefix configuration (FA vs FG vs PROD, PR vs WIP vs BATCH, etc.)
4. Make seed data (Processes, Lines, PackSizes, AlertThresholds, etc.) tenant-configurable
5. Support multiple industries: Bakery, Pharmacy, FMCG, and others

---

## Current Naming Scheme Conventions

### Entity & Code Prefixes (configurable per industry)

```
Product entity:       FA, FG, PROD (configurable prefix)
  Example (Bakery):   FG-2026-BRD-001 = "Sourdough Loaf 500g"
  Format:             Configurable via Reference.CodePrefixes
  
Intermediate/Process: PR, WIP, BATCH (configurable prefix)
  Example (Pharma):   BATCH-SYN-001 = Synthesis batch
  Format:             Configurable per tenant/industry
  
Raw Material:         RM, ING, API (configurable prefix)
  Example (FMCG):     ING-WATER, API-ASPIRIN
  Format:             Configurable via Reference.CodePrefixes
```

### Column Naming (generic, with industry-specific labels)

| Column | Generic name | Display label (Bakery) | Display label (Pharma) |
|---|---|---|---|
| `recipe_components` | Recipe components | Recipe Ingredients | Batch Components |
| `ingredient_codes` | Ingredient codes | Ingredient Codes | Active/Inactive Ingredients |
| `primary_ingredient_pct` | Primary ingredient % | Flour % | API Content % |
| `manufacturing_operation_1..4` | Mfg operations | Mix, Knead, Proof, Bake | Synthesis, Separation, Crystallization, Drying |
| `operation_yield_1..4` | Operation yields (%) | Yield % | Recovery % |
| `equipment_setup` | Equipment config | Oven setup | Reactor setup |
| `resource_requirement` | Resource needs | Staffing | Laboratory requirements |

---

## Proposed Generic Architecture

### 1. Configurable Prefix System (Reference.CodePrefixes)

**New table: `Reference.CodePrefixes`**

```sql
CREATE TABLE "Reference.CodePrefixes" (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    code_type       TEXT NOT NULL,        -- 'product' | 'intermediate' | 'ingredient'
    prefix          TEXT NOT NULL,        -- 'FA' | 'FG' | 'PROD' | 'PR' | 'WIP' | 'BATCH'
    description     TEXT,
    format_pattern  TEXT NOT NULL,        -- regex or template (e.g., "^{prefix}[A-Z0-9]+$")
    next_sequence   INT DEFAULT 1,        -- for auto-generation (Phase C)
    is_auto_generated BOOLEAN DEFAULT FALSE,
    marker          TEXT NOT NULL,        -- 'UNIVERSAL' | 'ORG-CONFIG'
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, code_type)
);
```

**Seed for Bakery:**
```json
[
  { "code_type": "product", "prefix": "FG", "format_pattern": "^FG[A-Z0-9]{4,}$", "marker": "ORG-CONFIG" },
  { "code_type": "intermediate", "prefix": "WIP", "format_pattern": "^WIP[A-Z0-9]+$", "marker": "ORG-CONFIG" },
  { "code_type": "ingredient", "prefix": "ING", "format_pattern": "^ING[0-9]+$", "marker": "ORG-CONFIG" }
]
```

**Seed for Pharmacy:**
```json
[
  { "code_type": "product", "prefix": "PROD", "format_pattern": "^PROD-[A-Z0-9]{4,}$", "marker": "ORG-CONFIG" },
  { "code_type": "intermediate", "prefix": "BATCH", "format_pattern": "^BATCH-[A-Z0-9]+$", "marker": "ORG-CONFIG" },
  { "code_type": "ingredient", "prefix": "API", "format_pattern": "^API-[A-Z0-9]+$", "marker": "ORG-CONFIG" }
]
```

**Seed for FMCG (Consumer Goods):**
```json
[
  { "code_type": "product", "prefix": "SKU", "format_pattern": "^SKU-[A-Z0-9]{4,}$", "marker": "ORG-CONFIG" },
  { "code_type": "intermediate", "prefix": "LOT", "format_pattern": "^LOT-[A-Z0-9]+$", "marker": "ORG-CONFIG" },
  { "code_type": "ingredient", "prefix": "MAT", "format_pattern": "^MAT-[A-Z0-9]+$", "marker": "ORG-CONFIG" }
]
```

### 2. Generic Column Naming Strategy

**Option A (recommended): Keep physical column names generic, add label mapping**

Core table `fa` (or renamed `product` in generic version):

```sql
-- Generic structure (Phase B.2 forward)
CREATE TABLE product (
    product_code        TEXT PRIMARY KEY,           -- configurable prefix (FA/FG/PROD)
    tenant_id           UUID NOT NULL,
    
    -- Core section (generic)
    product_name        TEXT,
    volume              NUMERIC,
    pack_size           TEXT,
    number_of_cases     NUMERIC,
    
    -- Recipe/Components section (renamed from Finish_Meat)
    recipe_components   TEXT,                       -- comma-sep codes (PR123A, WIP456B, etc.)
    ingredient_codes    TEXT,                       -- auto-derived (RM1939, ING2341, etc.)
    
    -- Planning section (renamed from Meat_Pct)
    primary_ingredient_pct NUMERIC,
    runs_per_week       NUMERIC,
    
    -- ... rest of columns (Production, Technical, MRP, Procurement unchanged)
    
    -- UI labels resolved from Reference.ColumnLabels per tenant
    created_at          TIMESTAMPTZ DEFAULT now()
);
```

**New table: `Reference.ColumnLabels`** (per-tenant label mapping)

```sql
CREATE TABLE "Reference.ColumnLabels" (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    column_name     TEXT NOT NULL,        -- e.g., 'product_code', 'recipe_components', 'primary_ingredient_pct'
    display_label   TEXT NOT NULL,        -- e.g., 'FA Code' (Apex) vs 'Product ID' (generic) vs 'Batch #' (Pharma)
    tooltip         TEXT,
    industry_code   TEXT,                 -- 'meat' | 'bakery' | 'pharma' | 'generic' (for default)
    lang            TEXT DEFAULT 'en',
    marker          TEXT NOT NULL,        -- 'UNIVERSAL' | 'ORG-CONFIG'
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, column_name, lang)
);
```

**Seed for Bakery:**
```json
[
  { "column_name": "product_code", "display_label": "Product ID", "industry_code": "bakery" },
  { "column_name": "recipe_components", "display_label": "Recipe Ingredients", "industry_code": "bakery" },
  { "column_name": "ingredient_codes", "display_label": "Ingredient Codes", "industry_code": "bakery" },
  { "column_name": "primary_ingredient_pct", "display_label": "Flour %", "industry_code": "bakery" },
  { "column_name": "manufacturing_operation_1", "display_label": "Mix Step", "industry_code": "bakery" }
]
```

**Seed for Pharmacy:**
```json
[
  { "column_name": "product_code", "display_label": "Product Code", "industry_code": "pharmacy" },
  { "column_name": "recipe_components", "display_label": "Batch Components", "industry_code": "pharmacy" },
  { "column_name": "ingredient_codes", "display_label": "Active/Inactive Ingredients", "industry_code": "pharmacy" },
  { "column_name": "primary_ingredient_pct", "display_label": "API Content %", "industry_code": "pharmacy" },
  { "column_name": "manufacturing_operation_1", "display_label": "Synthesis Step", "industry_code": "pharmacy" }
]
```

**Seed for FMCG (Consumer Goods):**
```json
[
  { "column_name": "product_code", "display_label": "SKU", "industry_code": "fmcg" },
  { "column_name": "recipe_components", "display_label": "Formula Components", "industry_code": "fmcg" },
  { "column_name": "ingredient_codes", "display_label": "Material Codes", "industry_code": "fmcg" },
  { "column_name": "primary_ingredient_pct", "display_label": "Base Material %", "industry_code": "fmcg" },
  { "column_name": "manufacturing_operation_1", "display_label": "Mixing Step", "industry_code": "fmcg" }
]
```

### 3. Industry-Configurable Seed Data

**Industry-Specific Reference Tables:**

| Reference table | Bakery seed | Pharmacy seed | FMCG seed |
|---|---|---|---|
| `Reference.Processes` | Mix, Knead, Proof, Bake, Cool, Decorate | Synthesis, Separation, Crystallization, Drying, Encapsulation | Mixing, Emulsification, Filling, Capping, Labeling |
| `Reference.Lines` | Oven 1, Oven 2, Cooling Tunnel, Packaging | Reactor 1, Reactor 2, Centrifuge, Dryer | Mixer, Homogenizer, Filling Line, Capper |
| `Reference.PackSizes` | 250g, 500g, 1kg, 1.5kg | 10ml, 30ml, 100ml, 1L (pharma units) | 100ml, 250ml, 500ml, 1L (cosmetics/beverages) |
| `Reference.Templates` | Mix-Knead-Proof-Bake, Simple Mix-Bake | Synthesis-Separation-Dry, Purification-Encapsulation | Mixing-Filling, Mixing-Emulsification-Filling |
| `Reference.AlertThresholds` | 12 weeks pre-launch, RED ≤5 days, YELLOW ≤14 days | 26 weeks pre-launch, RED ≤15 days, YELLOW ≤30 days | 8 weeks pre-launch, RED ≤7 days, YELLOW ≤14 days |

**Implementation:** 
- Each Reference table gets `industry_code` column
- Tenant creation selects industry → seeds appropriate data set
- Admin can customize per tenant (02-SETTINGS Phase C1)

### 4. Cascade Rules Generalization

**Current (Apex-specific):**
```
Chain 3: Finish_Meat → RM_Code + SyncProdDetailRows
  formula: "parse_pr_codes(fa.finish_meat).map(pr => 'RM' + extract_digits(pr)).join(', ')"
```

**Generic version (§6.3 in updated PRD):**
```
Chain 3: recipe_components → ingredient_codes + SyncComponentRows
  formula: Template-driven transformation based on Reference.CodePrefixes
  
  // Pseudocode
  recipe_codes = parse_codes(product.recipe_components, Reference.CodePrefixes.intermediate_prefix)
  ingredient_codes = recipe_codes.map(code => 
    Reference.CodePrefixes.ingredient_prefix + extract_digits(code)
  ).join(', ')
```

### 5. Validation Rules Generalization

**V01 (FA_Code format validation) → product_code format validation**
```
Current: FA_Code matches ^FA[A-Z0-9]+$
Generic: product_code matches Reference.CodePrefixes[product].format_pattern
```

**V06 (Finish_Meat suffix match) → recipe_component suffix match**
```
Current: UCase(Right(Finish_Meat_component, 1)) == UCase(last_process_suffix)
Generic: UCase(Right(recipe_component, 1)) == UCase(last_operation_suffix)
```

---

## Migration Strategy (Apex → Generic)

### Phase B.2.1 (Immediate)

1. **Rename physical columns in DB** (backward-compat via views):
   - `fa` → `product`
   - `finish_meat` → `recipe_components`
   - `rm_code` → `ingredient_codes`
   - `meat_pct` → `primary_ingredient_pct`
   - `process_1..4` → `manufacturing_operation_1..4`
   - `pr_code_*` → `intermediate_code_*`
   - `dieset` → `equipment_setup`
   - `staffing` → `resource_requirement`

2. **Create Reference.CodePrefixes** and seed Apex data

3. **Create Reference.ColumnLabels** with Apex/meat/en seed

4. **Update cascade engine** to use configurable prefixes

5. **Update all validation rules** to reference Reference.CodePrefixes instead of hardcoded regex

### Phase B.2.2 (PRD Update)

1. **Rename 01-NPD PRD sections** where appropriate (keep Apex examples, add generic descriptions)
2. **Add §A (Appendix): Industry Configuration** — examples for Bakery, Pharma
3. **Migrate markers:**
   - `[APEX-CONFIG]` → `[ORG-CONFIG]` (company/tenant-specific)
   - `[EVOLVING]` → `[INDUSTRY-CONFIG]` (meat/bakery/pharma-specific)
   - `[UNIVERSAL]` stays (7-dept workflow, cascading, etc.)

### Phase C1 (02-SETTINGS)

1. **Industry selection wizard** during tenant onboarding → auto-seeds Reference data
2. **Reference editor UI** for all configurable tables (Processes, Lines, PackSizes, AlertThresholds, CodePrefixes, ColumnLabels)
3. **Label customization UI** — edit display names per column per language

---

## Examples: Three Industries (Bakery, Pharmacy, FMCG)

### Example 1: Bakery

```
Product:      FG-2026-BRD-001 (Product ID, auto-generated)
Components:   "WIP001, WIP002" (Recipe Ingredients)
Ingredients:  "ING-FLOUR, ING-WATER, ING-SALT" (Ingredient Codes)
Content:      85% Flour (Flour % in Planning)
Operations:   Mix → Knead → Proof → Bake → Cool (Operations 1-5, templated)
Equipment:    Oven 1, Cooling Tunnel (line/config specific)
Shelf Life:   7 days (room temp) or 14 days (refrigerated)
Quality:      Moisture content, crumb structure, crust color standards
```

### Example 2: Pharmacy

```
Product:      PROD-PHM-024 (Product Code)
Components:   "BATCH-SYN-001, BATCH-FILT-002" (API synthesis + fillers)
Ingredients:  "API-ASPIRIN, FILLER-TALC" (Active Pharmaceutical Ingredients)
Potency:      500mg API per capsule
Operations:   Synthesis → Separation → Crystallization → Drying → Encapsulation (5 steps)
Equipment:    Reactor 1, Centrifuge, Rotary Dryer, Encapsulator
Shelf Life:   36 months (at 25°C/60% RH per ICH Q1A guidelines)
Regulatory:   GMP compliance (21 CFR 211), ICH stability studies, batch records, CoA documentation
Quality:      API assay (HPLC), purity, dissolution, hardness, moisture, microbial limits
```

### Example 3: FMCG (Consumer Goods)

```
Product:      SKU-2026-COS-042 (Product SKU)
Components:   "LOT-BASE-001, LOT-FRAG-002" (Formula Components)
Ingredients:  "MAT-WATER, MAT-GLYCERIN, MAT-FRAGRANCE" (Material Codes)
Content:      65% Base formulation (Base Material % in Planning)
Operations:   Mixing → Emulsification → Testing → Filling → Labeling (5 steps)
Equipment:    Mixer 2, Homogenizer, Filling Line, Labeler
Shelf Life:   18-24 months (room temp, 20-25°C)
Regulatory:   Product labeling compliance, allergen declarations, ingredient transparency
Quality:      Viscosity, pH, color consistency, microbiological safety, sensory evaluation
Examples:     Cosmetics (shampoo, lotion), beverages (juice, coffee), household (cleaner, detergent)
```

---

## Impact Analysis

### Database

- **Rename columns:** 8-10 column renames in `product` (formerly `fa`) table
- **New tables:** `Reference.CodePrefixes`, `Reference.ColumnLabels`, `Reference.IndustrySeeds`
- **Migration:** Add backward-compat views for renamed tables (for D365 Builder, external integrations)
- **RLS:** No change — tenant_id filtering still applies

### Code

- **Cascade engine:** Parameterize prefix extraction (currently hardcoded "RM", "PR" suffixes)
- **Validation rules:** Template-driven validation (V01, V06 become template-based DSL)
- **UI labels:** Load from Reference.ColumnLabels instead of hardcoded i18n keys
- **Seed data loaders:** Industry-aware seeding during tenant creation

### API & Events

- **Outbox events:** Rename `fa.*` → `product.*` (or keep as backward-compat aliases)
- **External integrations:** D365 Builder, ERP connectors may need mapping updates
- **GraphQL schema:** Generic names (product, intermediate_code) instead of fa, pr_code

### Documentation & Training

- **PRD 01-NPD v3.1:** Add Appendix with industry examples + configuration guide
- **Reference architecture:** Update 00-FOUNDATION with multi-industry pattern
- **Implementation guide:** Tenant setup wizard + industry selection flow

---

## Recommendation

**Proceed with Phase B.2.1 + PRD update (v3.1) immediately:**

1. **Database:** Rename columns now (easier before large data volumes; views provide backward compat)
2. **Reference tables:** Add CodePrefixes + ColumnLabels seed (Apex + Bakery + Pharma examples)
3. **Cascade engine:** Parameterize (1-2 day refactor)
4. **Validation:** Template-driven (leverages ADR-029 rule engine, already designed)
5. **PRD:** Document strategy in Appendix; prepare for Phase C1 industry config UI

**Apex launch unaffected:** Hard-code Apex prefixes during Phase B.2, switch to configurable in Phase C1.

**Outcome:**
- Generic 01-NPD ready for multiple industries by Phase C1
- Bakery as first production customer (comprehensive seed data mature)
- Pharmacy/FMCG add-on customers viable post-Phase C1

---

## Related Decisions

- **ADR-028** — Schema-driven column definition (Reference.DeptColumns) — extends to Reference.ColumnLabels
- **ADR-029** — Rule engine DSL (cascade + validation) — parameterized via Reference.CodePrefixes
- **ADR-030** — Configurable department taxonomy — extends to industry-specific department/role variations
- **ADR-031** — Schema variation per org — L2 level (Reference data), L3 level (ColumnLabels), L4 (custom extensions)

---

**Decision owner:** Architecture team  
**Approval:** Required before Phase B.2.2 PRD finalization

