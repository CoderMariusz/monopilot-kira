// ============ ADMIN / CROSS-MODULE DATA ============
// Mock data for the 10 cross-module settings screens (SET-040..SET-100).
// Every ID here is cross-referenced from other modules:
//   - integration.d365.so_trigger.enabled → Planning SCREEN-13 + D365 Queue
//   - wo_state_machine_v1 → Planning WO detail state history
//   - allergen_sequencing_heuristic_v1 → Planning Sequencing
//   - fefo_strategy_v1 → Warehouse FEFO panels
//   - reporting.custom_dsl_builder → Reporting custom report builder gate
//   - email templates → Planning PO-approval, Shipping delivery notifications

// ---------- Rules registry (SET-050 / SET-051) ----------
window.SETTINGS_RULES = [
  { code: "wo_state_machine_v1",              type: "workflow",   tier: "L1", version: 7, from: "2025-08-12", by: "system (CI/CD)", sha: "a1b2c3d", coverage: "covered",
    consumers: ["Planning › WO detail › State history", "Planning › WO list › Transition button"],
    desc: "Drives the allowed state transitions for Work Orders (DRAFT → PLANNED → RELEASED → STARTED → COMPLETED)." },
  { code: "cascade_generation_v1",            type: "cascading", tier: "L1", version: 4, from: "2025-09-02", by: "system (CI/CD)", sha: "b2c3d4e", coverage: "covered",
    consumers: ["Planning › WO create › Cascade preview", "Planning › WO detail › Child lock"],
    desc: "When a parent WO is created, cascades reservations and child WOs down the BOM tree." },
  { code: "allergen_sequencing_heuristic_v1", type: "conditional", tier: "L1", version: 11, from: "2025-11-04", by: "system (CI/CD)", sha: "c3d4e5f", coverage: "covered",
    consumers: ["Planning › Sequencing › Suggest order", "Planning › Sequencing override modal"],
    desc: "Scores WO ordering based on allergen changeover risk — lower score = better sequence." },
  { code: "allergen_cascade_v1",              type: "cascading", tier: "L1", version: 3, from: "2025-08-12", by: "system (CI/CD)", sha: "d4e5f60", coverage: "missing",
    consumers: ["Planning › Allergen map", "Production › Cleanup checklist"],
    desc: "Propagates allergen flags from ingredient BOM lines to finished-good WOs." },
  { code: "fefo_strategy_v1",                 type: "gate",       tier: "L1", version: 6, from: "2025-10-15", by: "system (CI/CD)", sha: "e5f6071", coverage: "covered",
    consumers: ["Warehouse › FEFO panel", "Warehouse › Reserve modal › Candidate picker", "Warehouse › Expiry screen"],
    desc: "Enforces First-Expiry-First-Out picking. Returns candidate LPs ordered by `use_by_date ASC`." },
  { code: "qa_block_gate_v1",                 type: "gate",       tier: "L1", version: 2, from: "2025-07-20", by: "system (CI/CD)", sha: "f607182", coverage: "covered",
    consumers: ["Warehouse › QA status modal", "Warehouse › Reserve modal"],
    desc: "Blocks reservation/consumption of LPs with qa_status != PASS." },
  { code: "cycle_count_variance_v1",          type: "conditional", tier: "L2", version: 1, from: "2026-01-05", by: "a.zajac", sha: "708293a", coverage: "missing",
    consumers: ["Warehouse › Cycle count modal"],
    desc: "Tenant override — triggers manager approval at >10% variance (default is 5%)." }
];

// Mock DSL payloads
window.SETTINGS_RULE_DSL = {
  wo_state_machine_v1: {
    rule_code: "wo_state_machine_v1",
    rule_type: "workflow",
    tier: "L1",
    version: 7,
    dsl: {
      type: "state_machine",
      entity: "work_order",
      states: ["DRAFT", "PLANNED", "RELEASED", "STARTED", "COMPLETED", "CANCELLED"],
      transitions: [
        { from: "DRAFT",    to: "PLANNED",   guards: ["has_bom", "has_line"] },
        { from: "PLANNED",  to: "RELEASED",  guards: ["reservation_green", "crew_assigned"] },
        { from: "RELEASED", to: "STARTED",   guards: ["operator_scanned_start"] },
        { from: "STARTED",  to: "COMPLETED", guards: ["production_qty > 0", "qa_checks_passed"] },
        { from: "DRAFT",    to: "CANCELLED", guards: [] },
        { from: "PLANNED",  to: "CANCELLED", guards: ["manager_approval", "reason_min_10"] }
      ]
    }
  },
  fefo_strategy_v1: {
    rule_code: "fefo_strategy_v1",
    rule_type: "gate",
    tier: "L1",
    version: 6,
    dsl: {
      type: "sorted_gate",
      source: "license_plates",
      filter: { qa_status: "PASS", status: ["RECEIVED", "AVAILABLE"] },
      sort: [{ field: "use_by_date", dir: "asc" }, { field: "received_at", dir: "asc" }],
      tie_breaker: "received_at",
      deviation_policy: "allow_with_reason"
    }
  },
  allergen_sequencing_heuristic_v1: {
    rule_code: "allergen_sequencing_heuristic_v1",
    rule_type: "conditional",
    tier: "L1",
    version: 11,
    dsl: {
      type: "scoring",
      weights: {
        allergen_changeover: 40,
        line_deadline: 25,
        cleaning_time: 20,
        setup_cost: 15
      },
      heuristic: "greedy_lowest_score"
    }
  }
};

// ---------- Rule dry-runs (for SET-051 Tab 3) ----------
window.SETTINGS_DRY_RUNS = {
  wo_state_machine_v1: [
    { ranAt: "2026-04-20 14:22", ranBy: "a.zajac",  result: "pass",    summary: "PLANNED → RELEASED with reservation green" },
    { ranAt: "2026-04-19 09:10", ranBy: "k.nowak",  result: "warning", summary: "DRAFT → CANCELLED without reason (edge case)" },
    { ranAt: "2026-04-15 11:44", ranBy: "system",   result: "pass",    summary: "Full happy-path trace 6 transitions" }
  ],
  fefo_strategy_v1: [
    { ranAt: "2026-04-20 08:02", ranBy: "system",   result: "pass",    summary: "12 candidates, top pick expires in 3d" },
    { ranAt: "2026-04-18 16:00", ranBy: "m.wisniewska", result: "fail", summary: "No AVAILABLE LPs for SKU-2108 — empty set" }
  ],
  allergen_sequencing_heuristic_v1: [
    { ranAt: "2026-04-20 06:30", ranBy: "system",   result: "pass",    summary: "8 WO sequence — score 142" }
  ]
};

// ---------- Feature flags (SET-060) ----------
window.SETTINGS_FLAGS = [
  { code: "maintenance_mode",                  desc: "Put app into read-only mode for all non-superadmin users.", on: false, rollout: 0,   updated: "2025-12-01", tenant: "L1-core" },
  { code: "integration.d365.enabled",          desc: "Enable D365 pull/push integration (requires 5 constants + passed test connection).", on: true, rollout: 100, updated: "2026-02-14", tenant: "L1-core" },
  { code: "integration.d365.so_trigger.enabled", desc: "Gate for auto-trigger of D365 SO on WO release. Consumed by Planning SCREEN-13 + D365 Queue.", on: true, rollout: 100, updated: "2026-03-05", tenant: "L1-core", consumers: ["Planning › SCREEN-13 D365 SO trigger", "Planning › D365 Queue"] },
  { code: "scanner.pwa.enabled",               desc: "Enable PWA scanner interface (Phase 1).", on: true, rollout: 100, updated: "2025-11-20", tenant: "L1-core" },
  { code: "npd.d365_builder.execute",          desc: "Allow NPD Manager to execute D365 Builder.", on: false, rollout: 0, updated: "2026-01-08", tenant: "L2-local" },
  { code: "reporting.custom_dsl_builder",      desc: "Feature gate for Reporting custom DSL builder. Consumed by Reporting module.", on: false, rollout: 25, updated: "2026-04-01", tenant: "L2-local", consumers: ["Reporting › Custom report builder"] },
  { code: "warehouse.map_view.enabled",        desc: "Warehouse visual bin map (beta).", on: false, rollout: 10, updated: "2026-03-28", tenant: "L2-local" },
  { code: "planning.cascade_auto_approve",     desc: "Auto-approve cascaded child WOs below 100 kg.", on: false, rollout: 0, updated: "2026-02-19", tenant: "L3-tenant" }
];

// ---------- Schema browser (SET-070) ----------
window.SETTINGS_SCHEMA = [
  { table: "main_table",         col: "product_code",        type: "text",    tier: "L1", req: true,  dept: "Core",       storage: "native",        status: "active", version: 1, label: "Product code" },
  { table: "main_table",         col: "pack_size",           type: "relation", tier: "L1", req: true,  dept: "Packaging",  storage: "native",        status: "active", version: 3, label: "Pack size" },
  { table: "main_table",         col: "shelf_life_days",     type: "number", tier: "L1", req: true,  dept: "Technical",  storage: "native",        status: "active", version: 2, label: "Shelf life (days)" },
  { table: "main_table",         col: "forza_dieset_code",   type: "text",   tier: "L3", req: false, dept: "Production", storage: "ext_jsonb",     status: "active", version: 1, label: "Dieset (Forza-only)" },
  { table: "main_table",         col: "nutri_score",         type: "enum",   tier: "L2", req: false, dept: "Technical",  storage: "ext_jsonb",     status: "active", version: 1, label: "Nutri-score" },
  { table: "bom",                col: "allergen_flags",      type: "text",   tier: "L1", req: true,  dept: "Technical",  storage: "native",        status: "active", version: 5, label: "Allergen flags" },
  { table: "license_plates",     col: "use_by_date",         type: "date",   tier: "L1", req: true,  dept: "Warehouse",  storage: "native",        status: "active", version: 1, label: "Use-by date" },
  { table: "license_plates",     col: "catch_weight_kg",     type: "number", tier: "L1", req: false, dept: "Warehouse",  storage: "native",        status: "active", version: 1, label: "Catch weight" },
  { table: "reference.pack_sizes", col: "display_order",     type: "number", tier: "L1", req: true,  dept: "Packaging",  storage: "native",        status: "active", version: 1, label: "Display order" },
  { table: "work_orders",        col: "sequencing_score",    type: "formula",tier: "L1", req: false, dept: "Planning",   storage: "native",        status: "active", version: 2, label: "Sequencing score" },
  { table: "work_orders",        col: "forza_cost_center",   type: "text",   tier: "L3", req: false, dept: "Finance",    storage: "private_jsonb", status: "draft",  version: 1, label: "Cost center (Forza)" }
];

// ---------- D365 connection config (SET-040) ----------
window.SETTINGS_D365 = {
  baseUrl:   "https://forza.operations.dynamics.com",
  env:       "Production",
  tenantId:  "3b1f5e2a-ac22-4b7f-9e01-88ba5c06efc9",
  clientId:  "e8a2-9a44-2c11-6f92",
  svcEmail:  "monopilot-svc@forz.pl",
  pollCron:  "0 2 * * *",
  enabled:   true,
  lastTest:  { at: "2026-04-20 14:03", ok: true, latency: 238, env: "Production" }
};

// D365 field mapping (SET-041)
window.SETTINGS_D365_MAPPING = [
  { d365: "InventTable.ItemId",           monopilot: "products.sku",              type: "text",   dir: "d365 → mp", transform: "none" },
  { d365: "InventTable.ItemName",         monopilot: "products.name",             type: "text",   dir: "d365 → mp", transform: "none" },
  { d365: "InventTable.UnitId",           monopilot: "products.base_uom",         type: "text",   dir: "d365 → mp", transform: "lowercase" },
  { d365: "PdsFormulaDesigner.Formula",   monopilot: "bom.recipe_id",             type: "text",   dir: "d365 → mp", transform: "none" },
  { d365: "VendTable.AccountNum",         monopilot: "partners.id",               type: "text",   dir: "d365 → mp", transform: "prefix:SUP-" },
  { d365: "VendTable.Name",               monopilot: "partners.name",             type: "text",   dir: "d365 → mp", transform: "none" },
  { d365: "VendTable.CurrencyCode",       monopilot: "partners.currency",         type: "enum",   dir: "d365 → mp", transform: "upper" },
  { d365: "SalesTable.SalesId",           monopilot: "planning.d365_so_ref",      type: "text",   dir: "mp → d365", transform: "prefix:SO-" },
  { d365: "ProdTable.ProdId",             monopilot: "work_orders.d365_ref",      type: "text",   dir: "mp → d365", transform: "none" }
];

// ---------- Reference data (SET-080) ----------
window.SETTINGS_REF_TABLES = [
  { code: "allergens_reference",  name: "Allergens reference",       marker: "UNIVERSAL",   rows: 14,  updated: "2026-02-11", desc: "A01–A14 + custom allergen families. Consumed by BOM allergen flags + Planning sequencing." },
  { code: "uom",                  name: "Units of measure",          marker: "UNIVERSAL",   rows: 9,   updated: "2025-10-01", desc: "Base + derived units. Conversion factor to base." },
  { code: "currencies",           name: "Currency codes (ISO 4217)", marker: "UNIVERSAL",   rows: 12,  updated: "2025-08-04", desc: "Active currencies this tenant transacts in." },
  { code: "countries",            name: "Country ISO codes",         marker: "UNIVERSAL",   rows: 28,  updated: "2025-06-12", desc: "ISO 3166-1 alpha-2. Consumed by Partners + Shipping." },
  { code: "pack_sizes",           name: "Pack sizes",                marker: "FORZA-CONFIG", rows: 18, updated: "2026-03-02", desc: "Forza-specific package sizes (regex ^\\d+x\\d+cm$)." },
  { code: "processes",            name: "Processes",                 marker: "FORZA-CONFIG", rows: 7,  updated: "2025-12-09", desc: "Single-letter process codes A–Z." },
  { code: "email_config",         name: "Email config",              marker: "UNIVERSAL",   rows: 6,   updated: "2026-04-10", desc: "Trigger → recipients + template. Used by SET-090." }
];

window.SETTINGS_ALLERGENS = [
  { code: "A01", name_en: "Cereals containing gluten", name_pl: "Zboża zawierające gluten",  active: true },
  { code: "A02", name_en: "Crustaceans",               name_pl: "Skorupiaki",                 active: true },
  { code: "A03", name_en: "Eggs",                      name_pl: "Jaja",                       active: true },
  { code: "A04", name_en: "Fish",                      name_pl: "Ryby",                       active: true },
  { code: "A05", name_en: "Peanuts",                   name_pl: "Orzeszki ziemne",            active: true },
  { code: "A06", name_en: "Soybeans",                  name_pl: "Soja",                       active: true },
  { code: "A07", name_en: "Milk",                      name_pl: "Mleko (w tym laktoza)",      active: true },
  { code: "A08", name_en: "Nuts",                      name_pl: "Orzechy",                    active: true },
  { code: "A09", name_en: "Celery",                    name_pl: "Seler",                      active: true },
  { code: "A10", name_en: "Mustard",                   name_pl: "Gorczyca",                   active: true },
  { code: "A11", name_en: "Sesame seeds",              name_pl: "Nasiona sezamu",             active: true },
  { code: "A12", name_en: "Sulphur dioxide / Sulphites", name_pl: "Dwutlenek siarki / Siarczyny", active: true },
  { code: "A13", name_en: "Lupin",                     name_pl: "Łubin",                      active: true },
  { code: "A14", name_en: "Molluscs",                  name_pl: "Mięczaki",                   active: true }
];

// ---------- Email templates (SET-090 / SET-091) ----------
window.SETTINGS_EMAIL_TEMPLATES = [
  { code: "po_to_supplier",   name: "Purchase order → Supplier",
    subject: "New PO {{po.id}} from {{org.name}}",
    body: "Hi {{supplier.contact}},\n\nPlease find attached PO {{po.id}} for delivery on {{po.due_date}}.\n\nTotal: {{po.total}} {{po.currency}}\nLines: {{po.line_count}}\n\nRegards,\n{{org.name}}",
    activeTo: ["procurement@supplier.com"], consumer: "Planning › PO approval + create flow", active: true },
  { code: "po_approval_request", name: "PO approval request",
    subject: "PO {{po.id}} requires your approval ({{po.total}} {{po.currency}})",
    body: "{{approver.name}},\n\nPO {{po.id}} for {{supplier.name}} is pending your approval.\n\nAmount: {{po.total}} {{po.currency}}\nRequested by: {{requester.name}}\n\nApprove: {{approve_url}}",
    activeTo: ["{{approver.email}}"], consumer: "Planning › PO flow", active: true },
  { code: "overdue_reminder",  name: "Overdue PO reminder",
    subject: "PO {{po.id}} is {{po.days_overdue}} days overdue",
    body: "{{supplier.contact}}, our PO {{po.id}} was due on {{po.due_date}} and is still open.\n\nExpected: {{po.qty}} {{po.uom}}\nReceived: {{po.received_qty}} {{po.uom}}",
    activeTo: ["{{supplier.email}}"], consumer: "Planning › Overdue PO cronjob", active: true },
  { code: "delivery_notification", name: "Delivery notification to customer",
    subject: "Your order {{shipment.so_id}} has shipped",
    body: "Hi {{customer.contact}},\n\nOrder {{shipment.so_id}} left our warehouse on {{shipment.ship_date}}.\n\nTracking: {{shipment.tracking_no}}\nCarrier: {{shipment.carrier}}",
    activeTo: ["{{customer.email}}"], consumer: "Shipping › Outbound delivery flow", active: true },
  { code: "qa_fail_alert",     name: "QA failure alert",
    subject: "QA failed for {{lp.id}} ({{lp.product_name}})",
    body: "QA test {{test.code}} failed for LP {{lp.id}}.\n\nSKU: {{lp.sku}}\nBatch: {{lp.batch}}\nReason: {{test.fail_reason}}",
    activeTo: ["qa@forz.pl"], consumer: "Quality › QA status change flow", active: true },
  { code: "wo_behind_schedule", name: "WO behind schedule",
    subject: "WO {{wo.id}} is behind schedule",
    body: "{{manager.name}},\n\nWO {{wo.id}} ({{wo.product}}) is tracking {{wo.hours_late}}h behind plan.\n\nStart: {{wo.started_at}}\nPlanned end: {{wo.planned_end}}",
    activeTo: ["planning@forz.pl"], consumer: "Planning › WO monitor cronjob", active: false }
];

window.SETTINGS_EMAIL_VARIABLES = [
  { group: "PO", vars: [
    { name: "{{po.id}}",        desc: "PO number",              example: "PO-2026-00342" },
    { name: "{{po.total}}",     desc: "Line total (numeric)",   example: "12,400.00" },
    { name: "{{po.currency}}",  desc: "ISO currency code",      example: "PLN" },
    { name: "{{po.due_date}}",  desc: "Expected delivery",       example: "2026-05-02" },
    { name: "{{po.line_count}}",desc: "Number of PO lines",     example: "4" },
    { name: "{{po.days_overdue}}", desc: "Integer days overdue", example: "3" }
  ]},
  { group: "Supplier / Customer / Partner", vars: [
    { name: "{{supplier.name}}",   desc: "Supplier name",       example: "Agro-Fresh Ltd." },
    { name: "{{supplier.contact}}",desc: "Primary contact",     example: "Jan Bąk" },
    { name: "{{supplier.email}}",  desc: "Primary email",        example: "jan@agrofresh.pl" },
    { name: "{{customer.name}}",   desc: "Customer name",       example: "Carrefour Polska" },
    { name: "{{customer.email}}",  desc: "Customer email",       example: "anna.kruk@carrefour.pl" }
  ]},
  { group: "Work Order / LP", vars: [
    { name: "{{wo.id}}",          desc: "WO identifier",         example: "WO-2026-00412" },
    { name: "{{wo.product}}",     desc: "Finished good name",    example: "Sliced Ham 200g" },
    { name: "{{wo.hours_late}}",  desc: "Hours behind plan",     example: "2.5" },
    { name: "{{lp.id}}",          desc: "License plate ID",      example: "LP-2026-00193" },
    { name: "{{lp.batch}}",       desc: "Batch code",            example: "B-2026-04-20" }
  ]},
  { group: "Org / Approver", vars: [
    { name: "{{org.name}}",       desc: "Organisation name",     example: "Forza Foods" },
    { name: "{{approver.name}}",  desc: "Approver display name", example: "Anna Zając" },
    { name: "{{approver.email}}", desc: "Approver email",         example: "a.zajac@forz.pl" },
    { name: "{{approve_url}}",    desc: "Deep-link to approval", example: "https://monopilot.app/po/…" }
  ]}
];

// ---------- L1→L2→L3 promotion (SET-100) ----------
window.SETTINGS_PROMOTIONS = [
  { id: "PR-2026-007", artefact: "rules.cycle_count_variance_v1",  from: "L2-local",  to: "L1-core", status: "pending",   requested: "2026-04-18", by: "a.zajac",
    affects: "12 tenants using default 5% variance", diff: "Upgrade variance threshold from 5% → 10% (align Forza standard across tenants)." },
  { id: "PR-2026-006", artefact: "schema.main_table.nutri_score",  from: "L3-tenant", to: "L2-local", status: "approved",  requested: "2026-04-12", by: "k.nowak",
    affects: "Tenant forza-foods only", diff: "Promote `nutri_score` column from tenant-private jsonb to shared L2 reference." },
  { id: "PR-2026-005", artefact: "flags.reporting.custom_dsl_builder", from: "L2-local", to: "L1-core", status: "running",  requested: "2026-04-08", by: "m.wisniewska",
    affects: "All tenants (rollout 25%)", diff: "Enable custom DSL builder flag across L1 after 90-day pilot." },
  { id: "PR-2026-004", artefact: "templates.email.qa_fail_alert",  from: "L3-tenant", to: "L2-local", status: "completed", requested: "2026-03-30", by: "a.zajac",
    affects: "3 tenants", diff: "Standardise QA failure alert subject/body across EMEA tenants." },
  { id: "PR-2026-003", artefact: "rules.allergen_cascade_v2",       from: "L3-tenant", to: "L1-core", status: "failed",    requested: "2026-03-22", by: "k.nowak",
    affects: "—", diff: "Rollback: migration failed on 2 tenants (missing A14 reference rows)." }
];

window.SETTINGS_PROMOTION_STAGES = [
  { key: "L3", label: "L3 · Tenant-private", desc: "Isolated to one tenant. Safe to experiment." },
  { key: "L2", label: "L2 · Shared local",    desc: "Shared within a partner/implementation group." },
  { key: "L1", label: "L1 · Core / universal", desc: "Ships to every tenant. Requires Monopilot SRE approval." }
];
