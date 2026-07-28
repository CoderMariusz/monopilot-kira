# FALA 9 — RECON FACTS (MRP / Transfer Orders / WO-chains / Scheduler)

Źródło: **owner-prod** (Supabase `khjvkhzwfzuwzrusgobp`, PostgreSQL 17.6), odczyt 2026-07-29, wyłącznie SELECT.
Zakres tabel wyprowadzony z `REPAIR-PLAN.md` §FALA 9 (PF-R09-01..05, PF-R10-01..03, PF-R11-01, PF-R12-01).

**Ten plik jest kontraktem. Nie wnioskuj typu kolumny z grepa — sprawdź tutaj.**

## Jak połączyć (potrzebne do odtworzenia każdego zapytania)

```bash
/usr/bin/grep DATABASE_URL_OWNER apps/web/.env.local     # → connection string
```

⚠️ **GOTCHA**: `.env.local` ma `sslmode=no-verify` — to wartość **node-postgres**, `psql`/libpq jej NIE zna
(`psql: error: invalid sslmode value: "no-verify"`). Dla psql podmień na `sslmode=require`
— w libpq `require` szyfruje **bez** weryfikacji łańcucha certyfikatów, czyli semantycznie **dokładnie** to samo
co `no-verify` w node. NIE używaj `verify-ca`/`verify-full` (self-signed → padnie).
Hasło zawiera `!!!!` — w URL-u zakoduj jako `%21%21%21%21`, inaczej zsh je zje.

```bash
export PGURL='postgresql://postgres.khjvkhzwfzuwzrusgobp:<hasło %-enc>@aws-1-eu-central-2.pooler.supabase.com:5432/postgres?sslmode=require'
```

Skrót używany niżej — `$TABLES`:

```
'mrp_runs','mrp_requirements','mrp_planned_orders','demand_forecasts','reorder_thresholds',
'transfer_orders','transfer_order_lines','transfer_order_line_lps',
'work_orders','work_order_items','wo_materials','wo_material_consumption','wo_outputs',
'wo_operations','wo_dependencies','wo_status_history','wo_executions',
'scheduler_runs','scheduler_assignments','scheduler_config','schedule_outputs','planning_capacity_blocks'
```

---

## 0. NAJWAŻNIEJSZE PUŁAPKI (czytaj zanim napiszesz linijkę)

| # | Fakt | Konsekwencja |
|---|---|---|
| P1 | `work_orders.yield_percent` to **GENERATED ALWAYS STORED** = `round(actual_qty/planned_quantity, 4)` | Każdy `INSERT`/`UPDATE` wpisujący tę kolumnę → **błąd 428C9**. Nie da się jej nadpisać. |
| P2 | `wo_outputs.registered_year` to **GENERATED ALWAYS STORED** = `EXTRACT(year FROM registered_at AT TIME ZONE 'UTC')` | To samo. Uwaga: rok liczony w **UTC**, nie lokalnie → wpis 31.12 23:30 Europe/Warsaw ląduje w roku poprzednim; wchodzi w unique `(org_id, batch_number, registered_year)`. |
| P3 | **Skale NUMERIC są NIEJEDNOLITE**: qty w MRP/TO = `numeric(18,6)`, qty w WO = `numeric(15,3)` / `(12,3)` / `(14,3)`, procenty = `(7,4)`, `allocation_pct` = `(5,2)`, `sequence_index`/`changeover_minutes`/`optimizer_score` = `(10,2)` | Przenoszenie wartości TO→WO **traci precyzję** (6 dp → 3 dp). Zaokrąglaj jawnie przez `microToFixed(m, 3)`, nigdy przez `Number()`. |
| P4 | `scheduler_assignments.line_id`, `scheduler_config.line_id` to **`text`**, a `scheduler_runs.line_ids` to **`ARRAY` (text[])** — podczas gdy `work_orders.production_line_id` to **`uuid`** | Join `scheduler_assignments.line_id = work_orders.production_line_id` wymaga rzutowania. Patrz też pamięć: `$2::uuid` przypina typ parametru dla całego zapytania → 42883 przy drugim użyciu na kolumnie `text`. |
| P5 | `demand_forecasts` i `reorder_thresholds` **MAJĄ** kolumnę `site_id` (nullable), ale ich klucze UNIQUE jej **NIE zawierają**: `(org_id, item_id, iso_week)` i `(org_id, item_id)` | To jest dokładnie PF-R09-03. Prognoza/próg są de facto **globalne per item**; dwa site'y nie mogą mieć własnych. Zmiana wymaga migracji unique-key, nie tylko filtra w SELECT. |
| P6 | `wo_status_history.from_status`/`to_status` (`varchar`) **NIE mają żadnego CHECK-a** | Baza nie waliduje przejść stanów WO. Cały kontrakt statusów żyje w kodzie. |
| P7 | `work_orders.status` używa **WERSALIKÓW** (`DRAFT`,`RELEASED`,…), a `wo_executions.status` **małych liter** (`planned`,`in_progress`,…) — to DWIE różne maszyny stanów na dwóch tabelach | Porównanie `work_orders.status = wo_executions.status` nigdy nie trafi. |
| P8 | `wo_outputs.qty_kg` i `wo_material_consumption.qty_consumed` mają CHECK **wymuszający znak zależny od `correction_of_id`**: bez korekty `> 0` / `>= 0`, z korektą **`< 0`** | Korekta MUSI być ujemna, zwykły zapis MUSI być dodatni. Nie ma „zerowej korekty". |
| P9 | `work_orders` ma trigger `BEFORE INSERT` `work_orders_default_site_id`, który **sam dopisuje `site_id`** z `production_lines.site_id` → `app.user_default_site()` → domyślny site org-u | Nie zakładaj, że `site_id` z INSERT-a to ten, który wyląduje w bazie. |
| P10 | `suppliers.lead_time_days` jest `integer NOT NULL`, ale kod (`mrp-compute.ts`) typuje `number \| null` — bo dochodzi przez **LEFT JOIN** przez `reorder_thresholds.preferred_supplier_id` | `null` = brak preferowanego dostawcy, nie brak lead-time'u. `product.lead_time` (VIEW, `numeric` bez precyzji) **NIE jest** używane przez MRP. |

---

## 1. TYPY KOLUMN (liczbowe / datowe / statusowe)

Zapytanie:

```sql
select table_name, ordinal_position, column_name, data_type,
       numeric_precision, numeric_scale, is_nullable
from information_schema.columns
where table_schema='public' and table_name in ($TABLES)
  and (data_type in ('numeric','integer','bigint','smallint','double precision','real','date',
                     'timestamp with time zone','timestamp without time zone',
                     'time without time zone','interval','boolean','USER-DEFINED')
       or column_name ~ 'status|state|_type|type_|kind|mode|reason|source|priority|direction|phase|stage')
order by table_name, ordinal_position;
```

Legenda: `prec/scale` — `-` = nie dotyczy. `NULL?` — `Y` = nullable.

### MRP

| Tabela | Kolumna | Typ | prec/scale | NULL? |
|---|---|---|---|---|
| mrp_runs | status | text | – | N |
| mrp_runs | demand_source | text | – | N |
| mrp_runs | horizon_start | date | – | N |
| mrp_runs | horizon_end | date | – | N |
| mrp_runs | bucket_days | integer | 32/0 | N |
| mrp_runs | requirement_count | integer | 32/0 | N |
| mrp_runs | planned_order_count | integer | 32/0 | N |
| mrp_runs | exception_count | integer | 32/0 | N |
| mrp_runs | started_at / completed_at | timestamptz | – | Y |
| mrp_runs | created_at / updated_at | timestamptz | – | N |
| mrp_requirements | bom_level | integer | 32/0 | N |
| mrp_requirements | bucket_date | **date** | – | N |
| mrp_requirements | gross_requirement | **numeric** | **18/6** | N |
| mrp_requirements | scheduled_receipts | **numeric** | **18/6** | N |
| mrp_requirements | projected_on_hand | **numeric** | **18/6** | N |
| mrp_requirements | net_requirement | **numeric** | **18/6** | N |
| mrp_requirements | source_type | text | – | N |
| mrp_requirements | source_reference | uuid | – | Y |
| mrp_requirements | exception_type | text | – | Y |
| mrp_requirements | created_at / updated_at | timestamptz | – | N |
| mrp_planned_orders | order_type | text | – | N |
| mrp_planned_orders | quantity | **numeric** | **18/6** | N |
| mrp_planned_orders | due_date | date | – | N |
| mrp_planned_orders | release_date | date | – | **Y** |
| mrp_planned_orders | release_status | text | – | N |
| mrp_planned_orders | created_at / updated_at | timestamptz | – | N |
| demand_forecasts | qty | **numeric** | **18/6** | N |
| demand_forecasts | source | text | – | N |
| demand_forecasts | created_at / updated_at | timestamptz | – | N |
| reorder_thresholds | min_qty | **numeric** | **18/6** | N |
| reorder_thresholds | reorder_qty | **numeric** | **18/6** | N |
| reorder_thresholds | created_at / updated_at | timestamptz | – | N |

`demand_forecasts.iso_week` jest `text` z CHECK-iem formatu (§2) — nie `date`.

### Transfer Orders

| Tabela | Kolumna | Typ | prec/scale | NULL? |
|---|---|---|---|---|
| transfer_orders | status | text | – | N |
| transfer_orders | scheduled_date | **date** | – | Y |
| transfer_orders | created_at / updated_at | timestamptz | – | N |
| transfer_order_lines | qty | **numeric** | **18/6** | N |
| transfer_order_lines | line_no | integer | 32/0 | N |
| transfer_order_lines | created_at / updated_at | timestamptz | – | N |
| transfer_order_line_lps | source_lp_id | uuid | – | N |
| transfer_order_line_lps | qty | **numeric** | **18/6** | N |
| transfer_order_line_lps | created_at / updated_at | timestamptz | – | N |

`uom` na obu liniach: `text NOT NULL`, **bez CHECK-a** i **bez DEFAULT-u** (patrz PF-R10-01 mixed-UoM).

### Work Orders + łańcuchy

| Tabela | Kolumna | Typ | prec/scale | NULL? |
|---|---|---|---|---|
| work_orders | item_type_at_creation | text | – | N |
| work_orders | factory_release_status_at_creation | varchar | – | Y |
| work_orders | planned_quantity | **numeric** | **15/3** | N |
| work_orders | produced_quantity | **numeric** | **15/3** | Y |
| work_orders | is_rework | boolean | – | N |
| work_orders | released_to_warehouse | boolean | – | N |
| work_orders | status | **varchar** | – | N |
| work_orders | planned_start_date / planned_end_date | timestamptz | – | Y |
| work_orders | scheduled_start_time / scheduled_end_time | timestamptz | – | Y |
| work_orders | priority | varchar | – | N |
| work_orders | source_of_demand | text | – | N |
| work_orders | source_reference | varchar | – | Y |
| work_orders | expiry_date | date | – | Y |
| work_orders | actual_qty | **numeric** | **15/3** | Y |
| work_orders | **yield_percent** | **numeric 9/4 — GENERATED ALWAYS** | 9/4 | Y |
| work_orders | started_at / completed_at / paused_at | timestamptz | – | Y |
| work_orders | pause_reason | text | – | Y |
| work_orders | schema_version | integer | 32/0 | N |
| work_orders | qty_entered | **numeric** | **14/3** | Y |
| work_orders | over_production_flagged | boolean | – | N |
| work_orders | over_production_flagged_at | timestamptz | – | Y |
| work_orders | created_at / updated_at | timestamptz | – | N |
| work_order_items | nominal_weight / actual_weight | **numeric** | **10/4** | Y |
| work_order_items | captured_at / created_at | timestamptz | – | N |
| wo_materials | required_qty | **numeric** | **15/3** | N |
| wo_materials | consumed_qty | **numeric** | **15/3** | N |
| wo_materials | reserved_qty | **numeric** | **15/3** | N |
| wo_materials | sequence | integer | 32/0 | N |
| wo_materials | consume_whole_lp / is_by_product | boolean | – | N |
| wo_materials | yield_percent | **numeric** | **7/4** | Y |
| wo_materials | scrap_percent | **numeric** | **7/4** | Y |
| wo_materials | bom_version | integer | 32/0 | Y |
| wo_materials | material_source | text | – | N |
| wo_materials | source_wo_id | uuid | – | Y |
| wo_materials | created_at / updated_at | timestamptz | – | N |
| wo_material_consumption | qty_consumed | **numeric** | **12/3** | N |
| wo_material_consumption | fefo_adherence_flag | boolean | – | N |
| wo_material_consumption | fefo_deviation_reason | text | – | Y |
| wo_material_consumption | over_consumption_flag | boolean | – | N |
| wo_material_consumption | over_consumption_approved_at | timestamptz | – | Y |
| wo_material_consumption | over_consumption_reason_code | text | – | Y |
| wo_material_consumption | consumed_at / created_at / updated_at | timestamptz | – | N |
| wo_outputs | output_type | text | – | N |
| wo_outputs | qty_kg | **numeric** | **12/3** | N |
| wo_outputs | qa_status | text | – | N |
| wo_outputs | expiry_date | date | – | Y |
| wo_outputs | label_printed_at | timestamptz | – | Y |
| wo_outputs | schema_version | integer | 32/0 | N |
| wo_outputs | registered_at | timestamptz | – | N |
| wo_outputs | **registered_year** | **integer — GENERATED ALWAYS** | 32/0 | Y |
| wo_outputs | qty_units | **numeric** | **14/3** | Y |
| wo_outputs | actual_weight_kg | **numeric** | **14/3** | Y |
| wo_outputs | created_at / updated_at | timestamptz | – | N |
| wo_operations | sequence | integer | 32/0 | N |
| wo_operations | expected_duration_minutes | integer | 32/0 | Y |
| wo_operations | expected_yield_percent | **numeric** | **7/4** | Y |
| wo_operations | actual_duration | integer | 32/0 | Y |
| wo_operations | actual_yield | **numeric** | **7/4** | Y |
| wo_operations | status | **varchar** | – | N |
| wo_operations | started_at / completed_at | timestamptz | – | Y |
| wo_operations | created_at / updated_at | timestamptz | – | N |
| wo_dependencies | required_qty | **numeric** | **12/3** | **Y** |
| wo_dependencies | created_at | timestamptz | – | N |
| wo_executions | status | text | – | N |
| wo_executions | version | integer | 32/0 | N |
| wo_executions | started_at / paused_at / resumed_at / completed_at / closed_at / cancelled_at | timestamptz | – | Y |
| wo_executions | schema_version | integer | 32/0 | N |
| wo_executions | created_at / updated_at | timestamptz | – | N |
| wo_status_history | from_status | **varchar** | – | Y |
| wo_status_history | to_status | **varchar** | – | N |
| wo_status_history | override_reason | text | – | Y |
| wo_status_history | occurred_at / created_at | timestamptz | – | N |

### Scheduler

| Tabela | Kolumna | Typ | prec/scale | NULL? |
|---|---|---|---|---|
| scheduler_runs | status | text | – | N |
| scheduler_runs | horizon_days | integer | 32/0 | N |
| scheduler_runs | run_type | text | – | N |
| scheduler_runs | solve_duration_ms | integer | 32/0 | Y |
| scheduler_runs | queued_at | timestamptz | – | N |
| scheduler_runs | started_at / completed_at | timestamptz | – | Y |
| scheduler_runs | created_at / updated_at | timestamptz | – | N |
| scheduler_runs | **line_ids** | **ARRAY (text[])** | – | Y |
| scheduler_assignments | status | text | – | N |
| scheduler_assignments | **line_id** | **text** | – | Y |
| scheduler_assignments | sequence_index | **numeric** | **10/2** | Y |
| scheduler_assignments | planned_start_at / planned_end_at | timestamptz | – | Y |
| scheduler_assignments | changeover_minutes | **numeric** | **10/2** | Y |
| scheduler_assignments | optimizer_score | **numeric** | **10/2** | Y |
| scheduler_assignments | override_original_start_at | timestamptz | – | Y |
| scheduler_assignments | override_original_line_id | **text** | – | Y |
| scheduler_assignments | override_reason_code | text | – | Y |
| scheduler_assignments | override_at / approved_at | timestamptz | – | Y |
| scheduler_assignments | created_at / updated_at | timestamptz | – | N |
| scheduler_config | default_horizon_days | integer | 32/0 | N |
| scheduler_config | **line_id** | **text** | – | Y |
| scheduler_config | capacity_hours_per_day | **numeric** | **8/2** | Y |
| scheduler_config | changeover_weight | **numeric** | **6/4** | N |
| scheduler_config | duedate_weight | **numeric** | **6/4** | N |
| scheduler_config | utilization_weight | **numeric** | **6/4** | N |
| scheduler_config | respect_pm_windows | boolean | – | N |
| scheduler_config | allow_alternate_routings | boolean | – | N |
| scheduler_config | created_at / updated_at | timestamptz | – | N |
| schedule_outputs | expected_qty | **numeric** | **12/3** | N |
| schedule_outputs | allocation_pct | **numeric** | **5/2** | N |
| schedule_outputs | created_at / updated_at | timestamptz | – | N |
| planning_capacity_blocks | block_date | date | – | N |
| planning_capacity_blocks | start_time / end_time | **time without time zone** | – | N |
| planning_capacity_blocks | block_type | text | – | N |
| planning_capacity_blocks | created_at / updated_at | timestamptz | – | N |

---

## 2. DOZWOLONE WARTOŚCI (CHECK) + ENUM

Zapytanie CHECK:

```sql
select c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c
join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and c.contype='c' and t.relname in ($TABLES)
order by 1,2;
```

Zapytanie ENUM:

```sql
select t.typname, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' group by 1 order by 1;
```

**ENUM-y: BRAK dla wszystkich tabel Fali 9.** W całym schemacie `public` istnieją tylko dwa typy enum —
`downtime_source_enum` (`'manual','wo_pause','plc_auto','changeover'`) i
`fa_allergen_override_action` (`'add','remove'`) — **żaden** nie jest użyty w tabelach Fali 9.
Wszystkie statusy to `text`/`varchar` + CHECK.

### 2a. Wartości statusów (dosłownie)

| Tabela.kolumna | Dozwolone wartości |
|---|---|
| `mrp_runs.status` | `'pending'`, `'running'`, `'completed'`, `'failed'`, `'cancelled'` |
| `mrp_runs.demand_source` | `'manual'`, `'forecast'`, `'d365_so'`, `'mps'` |
| `mrp_requirements.source_type` | `'independent'`, `'dependent'` |
| `mrp_requirements.exception_type` | NULL **lub** `'past_due'`, `'expedite'`, `'de_expedite'`, `'shortage'`, `'excess'` |
| `mrp_planned_orders.order_type` | `'po'`, `'to'`, `'wo'` (małe litery!) |
| `mrp_planned_orders.release_status` | `'suggested'`, `'firm'`, `'released'`, `'cancelled'` |
| `demand_forecasts.source` | `'manual'`, `'import'` |
| `transfer_orders.status` | `'draft'`, `'in_transit'`, `'partially_received'`, `'received'`, `'cancelled'` |
| `work_orders.status` | `'DRAFT'`, `'RELEASED'`, `'IN_PROGRESS'`, `'ON_HOLD'`, `'COMPLETED'`, `'CLOSED'`, `'CANCELLED'` — **WERSALIKI** |
| `work_orders.priority` | `'low'`, `'normal'`, `'high'`, `'critical'` |
| `work_orders.item_type_at_creation` | `'rm'`, `'ingredient'`, `'intermediate'`, `'fg'`, `'co_product'`, `'byproduct'`, `'packaging'` |
| `work_orders.source_of_demand` | `'manual'`, `'d365_so'`, `'forecast'`, `'rework'`, `'intermediate_cascade'` |
| `work_orders.disposition_policy` | `'to_stock'`, `'direct_continue'`, `'planner_decides'` |
| `work_orders.qty_entered_uom` | NULL **lub** `'base'`, `'each'`, `'box'` |
| `wo_executions.status` | `'planned'`, `'in_progress'`, `'paused'`, `'completed'`, `'closed'`, `'cancelled'` — **małe litery** |
| `wo_operations.status` | `'pending'`, `'in_progress'`, `'completed'`, `'skipped'` |
| `wo_outputs.output_type` | `'primary'`, `'co_product'`, `'by_product'` — **`by_product` z podkreślnikiem** |
| `wo_outputs.qa_status` | `'PENDING'`, `'PASSED'`, `'FAILED'`, `'ON_HOLD'`, `'RELEASED'` — **WERSALIKI** |
| `wo_outputs.units_uom` | NULL **lub** `'each'`, `'box'` |
| `wo_materials.material_source` | `'stock'`, `'upstream_wo_output'`, `'manual'` |
| `schedule_outputs.output_role` | `'primary'`, `'co_product'`, `'byproduct'` — **`byproduct` BEZ podkreślnika** (≠ `wo_outputs.output_type`!) |
| `schedule_outputs.disposition` | `'to_stock'`, `'direct_continue'`, `'pending_decision'` (≠ `work_orders.disposition_policy`, gdzie trzecia to `'planner_decides'`) |
| `scheduler_runs.status` | `'queued'`, `'running'`, `'completed'`, `'failed'`, `'cancelled'` — **`queued`, NIE `pending`** (mrp_runs ma `pending`!) |
| `scheduler_runs.run_type` | `'schedule'`, `'dry_run'`, `'what_if'` |
| `scheduler_assignments.status` | `'draft'`, `'approved'`, `'rejected'`, `'overridden'` |
| `scheduler_config.sequencing_strategy` | `'greedy'`, `'local_search'`, `'allergen_optimized'` |
| `planning_capacity_blocks.block_type` | **tylko** `'npd_trial'` (CHECK równościowy, nie lista) |
| `wo_status_history.from_status` / `.to_status` | **BRAK CHECK-a — baza przyjmie dowolny tekst** |
| `transfer_order_lines.uom`, `wo_materials.uom`, `mrp_*.uom`, `demand_forecasts.uom`, `schedule_outputs.uom` | **BRAK CHECK-a — dowolny tekst** |

### 2b. Pozostałe CHECK-i (zakresy / niezmienniki)

| Tabela | Constraint | Definicja |
|---|---|---|
| demand_forecasts | `..._iso_week_format_check` | `iso_week ~ '^\d{4}-W\d{2}$'` |
| demand_forecasts | `..._qty_nonnegative_check` | `qty >= 0` |
| mrp_runs | `..._bucket_days_check` | `bucket_days >= 1` |
| mrp_runs | `..._horizon_range_check` | `horizon_end >= horizon_start` |
| mrp_runs | `..._counts_nonnegative_check` | `requirement_count >= 0 AND planned_order_count >= 0 AND exception_count >= 0` |
| mrp_requirements | `..._bom_level_check` | `bom_level >= 0` |
| mrp_requirements | `..._gross_nonnegative_check` | `gross_requirement >= 0` |
| mrp_requirements | `..._receipts_nonnegative_check` | `scheduled_receipts >= 0` |
| mrp_requirements | — | **`projected_on_hand` i `net_requirement` NIE mają CHECK-a → mogą być ujemne** |
| mrp_planned_orders | `..._quantity_positive_check` | `quantity > 0` — **zero jest odrzucane** |
| mrp_planned_orders | `..._release_date_check` | `release_date IS NULL OR release_date <= due_date` |
| reorder_thresholds | `..._min_qty_nonnegative_check` / `..._reorder_qty_nonnegative_check` | `>= 0` |
| transfer_orders | `..._distinct_warehouses_check` | `from_warehouse_id IS NULL OR to_warehouse_id IS NULL OR from_warehouse_id <> to_warehouse_id` |
| transfer_order_lines | `..._qty_positive_check` | `qty > 0` |
| transfer_order_lines | `..._line_no_positive_check` | `line_no > 0` |
| transfer_order_line_lps | `..._qty_positive_check` | `qty > 0` |
| work_orders | `..._planned_quantity_positive_check` | `planned_quantity > 0` |
| work_orders | `..._actual_qty_nonneg_check` | `actual_qty IS NULL OR actual_qty >= 0` |
| work_orders | `..._produced_quantity_nonneg_check` | `produced_quantity IS NULL OR produced_quantity >= 0` |
| work_orders | `..._schema_version_check` | `schema_version >= 1` |
| wo_materials | `..._required/consumed/reserved_qty_nonneg_check` | `>= 0` |
| wo_material_consumption | `..._qty_consumed_positive_check` | `(correction_of_id IS NULL AND qty_consumed > 0) OR (correction_of_id IS NOT NULL AND qty_consumed < 0)` |
| wo_material_consumption | `chk_over_consumption_approval` | `over_consumption_flag = false OR over_consumption_approved_by IS NOT NULL` |
| wo_outputs | `..._qty_kg_nonneg_check` | `(correction_of_id IS NULL AND qty_kg >= 0) OR (correction_of_id IS NOT NULL AND qty_kg < 0)` |
| wo_outputs | `..._schema_version_check` | `schema_version >= 1` |
| wo_operations | `..._sequence_check` | `sequence >= 1` |
| wo_dependencies | `..._no_self_loop_check` | `parent_wo_id <> child_wo_id` — **tylko self-loop; cykl A→B→A baza PRZEPUŚCI** |
| wo_dependencies | `..._required_qty_nonneg_check` | `required_qty IS NULL OR required_qty >= 0` |
| wo_executions | `..._version_nonneg_check` | `version >= 0` |
| wo_executions | `..._schema_version_check` | `schema_version >= 1` |
| schedule_outputs | `..._expected_qty_nonneg_check` | `expected_qty >= 0` |
| schedule_outputs | `..._allocation_pct_range_check` | `allocation_pct >= 0 AND allocation_pct <= 100` |
| scheduler_runs | `..._horizon_days_check` | `horizon_days >= 1 AND horizon_days <= 30` — **twardy sufit 30 dni** |
| scheduler_runs | `..._solve_duration_nonneg_check` | `solve_duration_ms IS NULL OR solve_duration_ms >= 0` |
| scheduler_config | `..._horizon_check` | `default_horizon_days >= 1 AND default_horizon_days <= 30` |
| scheduler_config | `..._capacity_nonneg_check` | `capacity_hours_per_day IS NULL OR >= 0` |
| scheduler_assignments | `..._changeover_nonneg_check` | `changeover_minutes IS NULL OR >= 0` |
| scheduler_assignments | `..._time_order_check` | `planned_end_at IS NULL OR planned_start_at IS NULL OR planned_start_at <= planned_end_at` — **`<=`, więc zero-length slot PRZECHODZI** |
| planning_capacity_blocks | `..._time_order_check` | `end_time > start_time` (tu ostro) |

### 2c. UNIQUE (kolizje przy upsercie)

Zapytanie: `select c.conrelid::regclass, c.conname, pg_get_constraintdef(c.oid) from pg_constraint c ... where contype='u'`
oraz `select tablename, indexname, indexdef from pg_indexes where indexdef like '%UNIQUE%'`.

| Tabela | Klucz |
|---|---|
| mrp_runs | `(org_id, run_number)` |
| mrp_requirements | `(run_id, item_id, bucket_date, bom_level)` — **bez `org_id`, bez `site_id`** |
| mrp_planned_orders | **BRAK unique poza PK** |
| demand_forecasts | `(org_id, item_id, iso_week)` — **bez `site_id`** ⚠ |
| reorder_thresholds | `(org_id, item_id)` — **bez `site_id`** ⚠ |
| transfer_orders | `(org_id, to_number)` |
| transfer_order_lines | `(org_id, to_id, line_no)` |
| transfer_order_line_lps | `(org_id, to_line_id, source_lp_id)` |
| work_orders | `(org_id, wo_number)` |
| wo_dependencies | `(org_id, parent_wo_id, child_wo_id)` |
| wo_executions | `(org_id, wo_id)` — jeden execution na WO |
| wo_outputs | `(transaction_id)`; `(org_id, batch_number, registered_year)`; partial `(org_id, correction_of_id) WHERE correction_of_id IS NOT NULL`; partial `(org_id, wo_id, ext_jsonb->>'disassembly_input_lp_id') WHERE … IS NOT NULL` |
| schedule_outputs | partial `(org_id, planned_wo_id) WHERE output_role='primary'` — **jeden primary na planowane WO** |
| scheduler_config | `(org_id, line_id)` |
| scheduler_assignments | **BRAK unique poza PK** — nic nie broni dwóch assignmentów tego samego WO (istotne dla PF-R12-01) |
| wo_materials | **BRAK unique poza PK** |

---

## 3. TRIGGERY, DEFAULTY, KOLUMNY GENEROWANE

### 3a. Triggery

Zapytanie:

```sql
select c.relname, tg.tgname,
       case tg.tgtype & 1 when 1 then 'ROW' else 'STMT' end,
       case when (tg.tgtype & 2)>0 then 'BEFORE' when (tg.tgtype & 64)>0 then 'INSTEAD' else 'AFTER' end,
       array_to_string(array_remove(ARRAY[
         case when (tg.tgtype&4)>0 then 'INSERT' end, case when (tg.tgtype&8)>0 then 'DELETE' end,
         case when (tg.tgtype&16)>0 then 'UPDATE' end, case when (tg.tgtype&32)>0 then 'TRUNCATE' end],null),','),
       p.proname, tg.tgenabled
from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=tg.tgfoid
where not tg.tgisinternal and n.nspname='public' and c.relname in ($TABLES)
order by 1,2;
```

Wszystkie `tgenabled='O'` (włączone), wszystkie `ROW`.

| Tabela | Trigger | Kiedy | Funkcja |
|---|---|---|---|
| demand_forecasts | `demand_forecasts_set_updated_at` | BEFORE UPDATE | `planning_mrp_set_updated_at` |
| mrp_planned_orders | `mrp_planned_orders_set_updated_at` | BEFORE UPDATE | `planning_mrp_set_updated_at` |
| mrp_requirements | `mrp_requirements_set_updated_at` | BEFORE UPDATE | `planning_mrp_set_updated_at` |
| mrp_runs | `mrp_runs_set_updated_at` | BEFORE UPDATE | `planning_mrp_set_updated_at` |
| reorder_thresholds | `reorder_thresholds_set_updated_at` | BEFORE UPDATE | `planning_mrp_set_updated_at` |
| planning_capacity_blocks | `planning_capacity_blocks_set_updated_at` | BEFORE UPDATE | `planning_capacity_blocks_set_updated_at` |
| schedule_outputs | `schedule_outputs_set_updated_at` | BEFORE UPDATE | `schedule_outputs_set_updated_at` |
| scheduler_assignments | `scheduler_assignments_set_updated_at` | BEFORE UPDATE | `planning_ext_set_updated_at` |
| scheduler_config | `scheduler_config_set_updated_at` | BEFORE UPDATE | `planning_ext_set_updated_at` |
| scheduler_runs | `scheduler_runs_set_updated_at` | BEFORE UPDATE | `planning_ext_set_updated_at` |
| transfer_orders | `transfer_orders_set_updated_at` | BEFORE UPDATE | `planning_procurement_set_updated_at` |
| transfer_order_lines | `transfer_order_lines_set_updated_at` | BEFORE UPDATE | `planning_procurement_set_updated_at` |
| transfer_order_line_lps | `transfer_order_line_lps_set_updated_at` | BEFORE UPDATE | `planning_procurement_set_updated_at` |
| wo_executions | `wo_executions_set_updated_at` | BEFORE UPDATE | `wo_executions_set_updated_at` |
| wo_material_consumption | `wo_material_consumption_set_updated_at` | BEFORE UPDATE | `wo_outputs_set_updated_at` |
| wo_materials | `wo_materials_set_updated_at` | BEFORE UPDATE | `work_orders_set_updated_at` |
| wo_operations | `wo_operations_set_updated_at` | BEFORE UPDATE | `work_orders_set_updated_at` |
| wo_outputs | `wo_outputs_set_updated_at` | BEFORE UPDATE | `wo_outputs_set_updated_at` |
| **work_orders** | **`work_orders_default_site_id`** | **BEFORE INSERT** | **`work_orders_default_site_id`** |
| **work_orders** | **`work_orders_lock_item_type_freeze`** | **BEFORE INSERT, UPDATE** | **`items_lock_item_type_freeze_on_work_order`** |
| work_orders | `work_orders_set_updated_at` | BEFORE UPDATE | `work_orders_set_updated_at` |

Tabele **bez** triggera: `work_order_items`, `wo_dependencies`, `wo_status_history` (mają tylko `created_at DEFAULT now()`,
brak `updated_at`).

Dwa nietrywialne triggery (`select prosrc from pg_proc where proname = …`):

```sql
-- work_orders_default_site_id (BEFORE INSERT)
if new.site_id is null then
  new.site_id := coalesce(
    (select pl.site_id from public.production_lines pl
       where pl.id = new.production_line_id and pl.org_id = new.org_id),
    app.user_default_site(),
    (select s.id from public.sites s where s.org_id = new.org_id and s.is_default = true
       order by s.id limit 1));
end if; return new;
```

```sql
-- items_lock_item_type_freeze_on_work_order (BEFORE INSERT/UPDATE) — bierze advisory lock na produkcie
if tg_op = 'INSERT' then
  perform public.items_acquire_item_type_freeze_lock(new.product_id);
elsif new.product_id is distinct from old.product_id then
  perform public.items_acquire_item_type_freeze_lock(new.product_id);
  if old.product_id is not null then
    perform public.items_acquire_item_type_freeze_lock(old.product_id);
  end if;
end if; return new;
```

Konsekwencja: **każdy INSERT/UPDATE `work_orders` bierze lock na `product_id`.** Masowe tworzenie WO z MRP
(PF-R09/PF-R11) w jednej transakcji na tym samym produkcie serializuje się — kolejność lock-ów ma znaczenie
przy równoległych falach.

### 3b. Kolumny GENERATED ALWAYS

Zapytanie:

```sql
select table_name, column_name, is_generated, generation_expression, is_identity
from information_schema.columns
where table_schema='public' and (is_generated='ALWAYS' or is_identity='YES') and table_name in ($TABLES);
```

| Tabela | Kolumna | Wyrażenie |
|---|---|---|
| `work_orders` | `yield_percent` | `CASE WHEN actual_qty IS NULL OR planned_quantity = 0 THEN NULL ELSE round(actual_qty / planned_quantity, 4) END` |
| `wo_outputs` | `registered_year` | `(EXTRACT(year FROM registered_at AT TIME ZONE 'UTC'))::integer` |

Żadnych kolumn IDENTITY. Wszystkie PK to `uuid DEFAULT gen_random_uuid()`.

### 3c. DEFAULT-y

Zapytanie:

```sql
select table_name, column_name, column_default
from information_schema.columns
where table_schema='public' and column_default is not null and table_name in ($TABLES)
order by table_name, ordinal_position;
```

Pominięto powtarzalne `id → gen_random_uuid()` oraz `created_at/updated_at → now()` (są na **każdej** tabeli).

| Tabela | Kolumna | DEFAULT |
|---|---|---|
| demand_forecasts | source | `'manual'` |
| mrp_planned_orders | release_status | `'suggested'` |
| mrp_requirements | bom_level | `0` |
| mrp_requirements | gross_requirement / scheduled_receipts / projected_on_hand / net_requirement | `0` |
| mrp_requirements | source_type | `'dependent'` |
| mrp_runs | status | `'pending'` |
| mrp_runs | demand_source | `'manual'` |
| mrp_runs | **horizon_start** | **`CURRENT_DATE`** (server-side, UTC-owy dzień bazy) |
| mrp_runs | bucket_days | `1` |
| mrp_runs | params_jsonb | `'{}'::jsonb` |
| mrp_runs | requirement_count / planned_order_count / exception_count | `0` |
| planning_capacity_blocks | block_type | `'npd_trial'` |
| reorder_thresholds | min_qty / reorder_qty | `0` |
| schedule_outputs | disposition | `'to_stock'` |
| scheduler_assignments | status | `'draft'` |
| scheduler_assignments | ext | `'{}'::jsonb` |
| scheduler_config | default_horizon_days | `7` |
| scheduler_config | optimizer_version | `'v2'` |
| scheduler_config | sequencing_strategy | `'greedy'` |
| scheduler_config | changeover_weight / duedate_weight / utilization_weight | `1.0000` |
| scheduler_config | respect_pm_windows | `true` |
| scheduler_config | allow_alternate_routings | `false` |
| scheduler_config | params | `'{}'::jsonb` |
| scheduler_runs | status | `'queued'` |
| scheduler_runs | optimizer_version | `'v2'` |
| scheduler_runs | run_type | `'schedule'` |
| scheduler_runs | queued_at | `now()` |
| transfer_orders | status | `'draft'` |
| wo_executions | status | `'planned'`; version `0`; ext_jsonb `'{}'`; schema_version `1` |
| wo_material_consumption | uom | `'kg'`; over_consumption_flag `false`; ext_jsonb `'{}'`; consumed_at `now()` |
| wo_materials | consumed_qty / reserved_qty | `0` |
| wo_materials | sequence | `1` |
| wo_materials | consume_whole_lp / is_by_product | `false` |
| wo_materials | condition_flags | `'{}'::jsonb` |
| wo_materials | material_source | `'stock'` |
| wo_operations | status | `'pending'` |
| wo_outputs | uom | `'kg'`; qa_status `'PENDING'`; ext_jsonb `'{}'`; schema_version `1`; registered_at `now()` |
| wo_status_history | context_jsonb | `'{}'::jsonb`; occurred_at `now()` |
| work_order_items | captured_at | `now()` |
| work_orders | is_rework / released_to_warehouse / over_production_flagged | `false` |
| work_orders | status | `'DRAFT'` |
| work_orders | priority | `'normal'` |
| work_orders | source_of_demand | `'manual'` |
| work_orders | disposition_policy | `'to_stock'` |
| work_orders | ext_jsonb | `'{}'::jsonb`; schema_version `1` |

**`mrp_runs.horizon_end` NIE ma defaultu** — jest `NOT NULL`, musisz go podać (CHECK: `>= horizon_start`).

---

## 4. ISTNIEJĄCA ARYTMETYKA DZIESIĘTNA — UŻYWAJ TEGO, NIE `Number()`

### Moduł kanoniczny: `apps/web/lib/shared/decimal.ts`

Skala wewnętrzna = **micro, 6 dp** (`1 jednostka = 1_000_000n`). Wejście > 6 dp jest **obcinane** na 7. miejscu.
Nieparsowalne wejście → `0n` (**nie rzuca**, nie daje NaN).

```ts
export const MICRO_DP = 6;
export const MICRO_SCALE = 1_000_000n;
export const DECIMAL_QTY_RE: RegExp;   // /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/  — bez znaku, bez '01.5', bez '.5', bez '1.'

export function toMicro(value: string | number): bigint;
export function microToFixed(micro: bigint, dp: number): string;      // STAŁE dp (0..6), half-away-from-zero, nigdy "-0.000"
export function microToDecimal(micro: bigint): string;                // minimalny zapis, obcięte zera końcowe
export function formatDecimalString(value: string, maxDp?: number): string;   // maxDp domyślnie MICRO_DP
export function mulDecimalStrings(a: string, b: string): string;
export function mulMicro(a: bigint, b: bigint): bigint;               // zaokrągla do najbliższego micro
export function ceilMicroToWholeUnits(micro: bigint): bigint;         // ≤0 → 0n; ZWRACA CAŁE JEDNOSTKI, nie micro
export function ceilGapToLotMultiple(gapMicro: bigint, lotMicro: bigint): bigint;  // lotMicro ≤ 0 → ceil do całych × MICRO_SCALE
export function formatSuggestedQty(qtyMicro: bigint): string;
```

⚠ `ceilMicroToWholeUnits` zwraca liczbę **całych jednostek** (nie micro) — `ceilGapToLotMultiple` mnoży wynik
z powrotem przez `MICRO_SCALE`. Nie mieszaj tych dwóch skal.

⚠ Zapis do kolumny `numeric(_,3)` (WO, `schedule_outputs`, `wo_dependencies`) → `microToFixed(m, 3)`.
Zapis do `numeric(18,6)` (MRP, TO) → `microToDecimal(m)` lub `microToFixed(m, 6)`.

### Warstwa serwerowa (walidująca): `apps/web/lib/warehouse/receive-po-line-core.ts`

```ts
export type DecimalString = string;
export function parseDecimal(input: string): bigint;   // DECIMAL_QTY_RE else throw ReceivePoLineCoreError('invalid_qty', 400); potem toMicro
export const formatDecimal = microToDecimal;           // alias
```

`parseDecimal` = `toMicro` **z twardą walidacją** (rzuca zamiast dawać `0n`). Na granicy zaufania (wejście z formularza /
akcji serwerowej) używaj `parseDecimal`; wewnątrz obliczeń — `toMicro`.

### Konwersje UoM: `apps/web/lib/uom/convert.ts`

```ts
export type OutputUom = 'base' | 'each' | 'box';
export type UomSnapshot = { … };
export function toBaseQty(snap: UomSnapshot, qty: number, uom: OutputUom): number;              // FLOAT — nie używać do zapisu
export function toBaseQtyFromDecimal(snap: UomSnapshot, qty: string, uom: OutputUom): string;   // NUMERIC-exact, wynik na 3 dp
export function fromBaseQty(snap: UomSnapshot, baseQty: number, uom: OutputUom): number;        // FLOAT
export function snapshotFromItemRow(row: ItemLike): UomSnapshot;
export function packHierarchyComplete(snap: UomSnapshot): boolean;
export function snapshotDecimalString(value: string | number | null | undefined): string | null;
export function woSnapshotWacQtyFields(snapshot: Record<string, unknown> | null | undefined, fallbackUomBase: string):
  { uomBase: string; netQtyPerEach: string | null; eachPerBox: string | null };
```

Dla PF-R10-01 (mixed-UoM transfer) używaj **`toBaseQtyFromDecimal`**, nie `toBaseQty` — ta druga jest na `number`.
Uwaga: `toBaseQtyFromDecimal` zwraca **3 dp**, a `transfer_order_lines.qty` to `numeric(18,6)` — przy TO to utrata precyzji.

### Bucketowanie MRP: `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp-buckets.ts`

Istotne dla PF-R09-02 („pierwszy bucket jako pełny horyzont"):

```ts
export function isoWeekOf(date: Date): { year: number; week: number };
export function formatIsoWeek(year: number, week: number): string;
export function currentIsoWeek(now?: Date): string;
export function isoWeekStartDate(isoWeek: string): string;
export function addDaysIso(todayIso: string, days: number): string;
export function planningHorizonEnd(todayIso: string, horizonWeeks: number): string;
export const OUT_OF_HORIZON_BUCKET_INDEX = -1;
export function bucketHorizonEnd(bucketDates: readonly string[]): string | null;
export function buildMrpBucketDates(todayIso: string, horizonWeeks: number): string[];
export function dateToBucketIndex(dateIso: string, bucketDates: readonly string[]): number;
export function isoWeekToBucketIndex(isoWeek: string, bucketDates: readonly string[]): number;
```

`mrp-compute.ts` importuje z `lib/shared/decimal`: `MICRO_SCALE`, `ceilGapToLotMultiple`, `formatSuggestedQty`,
`microToFixed`, `mulMicro`, `toMicro` — trzymaj się tego zestawu.

### DŁUG: prywatny duplikat w Transfer Orders

`apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts:783-800` ma **własne, nieeksportowane**
`QTY_SCALE = 1_000_000n`, `toMicro6(decimal: string): bigint`, `microToText6(micro: bigint): string`.
Są funkcjonalnie równoważne `toMicro`/`microToDecimal`, ale `toMicro6` **nie waliduje wejścia** — na śmieciach rzuci
`SyntaxError` z `BigInt()`, zamiast zwrócić `0n`. Docstring `decimal.ts` wprost mówi, że to źródło wzorca i że ma zostać
scalone. **Nie kopiuj tych helperów dalej**; jeśli tor dotyka tego pliku — podmień na import z `lib/shared/decimal`.

---

## 5. NAJWYŻSZY NUMER MIGRACJI

```bash
/bin/ls packages/db/migrations | sed 's/-.*//' | sort -n | tail -3
# 525 / 526 / 527
```

| Fakt | Wartość |
|---|---|
| Najwyższa istniejąca migracja | **527** (`527-print-jobs-printer-type.sql`) |
| Pierwszy wolny numer dla Fali 9 | **528** |
| Liczba plików w katalogu | 503 |

**Serializuj numery między torami** — dwa tory z `528-*.sql` = konflikt. Przydziel zakresy z góry (T1→528, T2→529, …).
Przypomnienie z pamięci projektu: bramka migracyjna w CI jest martwa od mig 279, a Vercel build **auto-aplikuje**
migracje na live (`pnpm db:migrate` w buildCommand) — backup przed pushem.

---

## 6. NIEUSTALONE

- **Kolejność triggerów** przy tej samej fazie na `work_orders` (`work_orders_default_site_id` vs
  `work_orders_lock_item_type_freeze` na BEFORE INSERT) — Postgres odpala je alfabetycznie po `tgname`, więc
  `work_orders_default_site_id` < `work_orders_lock_item_type_freeze`, ale tego **nie zweryfikowałem eksperymentalnie**
  (wymagałoby zapisu).
- **Polityki RLS** na tych tabelach — nie były w zakresie zadania, nie sprawdzone. Jeśli tor pisze zapytania
  pod rolą aplikacyjną (nie owner), musi to sprawdzić osobno (`pg_policies`).
- **Klucze obce i ich `ON DELETE`** — nie sprawdzone (zadanie obejmowało CHECK/ENUM/trigger/default).
  Istotne dla PF-R10-03 (partial TO Cancel) — sprawdź `contype='f'` zanim założysz kaskadę.
- **Czy `wo_dependencies` ma jakąkolwiek ochronę przed cyklem dłuższym niż self-loop** — w bazie **NIE ma**
  (potwierdzone: jedyny CHECK to `parent_wo_id <> child_wo_id`). Czy taka ochrona istnieje w kodzie — nie sprawdzałem.
- **Realne dane produkcyjne** (ile jest wierszy, jakie statusy występują faktycznie) — nie odpytywałem;
  ten plik opisuje wyłącznie schemat.
