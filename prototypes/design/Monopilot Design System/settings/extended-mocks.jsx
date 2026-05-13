// ============================================================
// Mocks for SET-032, SET-033, SET-060, SET-056, SET-057, SET-025 (full audit)
// All data here is referenced by the new screen modules.
// ============================================================

// ---------- SET-032 Schema Diff: per-column version history ----------
// Three columns each at version 3 — diff is between v2 and v3.
// "shelf_life_no_history" is at v1 — empty state demo.
window.SETTINGS_SCHEMA_VERSIONS = {
  "shelf_life_days": {
    id: "shelf_life_days",
    table: "main_table",
    col: "shelf_life_days",
    tier: "L2",
    versions: [
      { v: 1, at: "2025-08-04 10:12", by: "M. Wiśniewska", deploy_ref: null,
        json: { col: "shelf_life_days", label: "Shelf life (days)", type: "number", required: false, range: { min: 1, max: 60 }, blocking: "none", dept: "core", section: "Storage", csv_export: true } },
      { v: 2, at: "2025-10-22 14:30", by: "K. Nowak", deploy_ref: null,
        json: { col: "shelf_life_days", label: "Shelf life (days)", type: "number", required: true, range: { min: 1, max: 90 }, blocking: "core_done", dept: "core", section: "Storage", csv_export: true } },
      { v: 3, at: "2026-05-13 14:02", by: "K. Nowak", deploy_ref: null,
        json: { col: "shelf_life_days", label: "Shelf life (days)", type: "number", required: true, range: { min: 1, max: 120 }, blocking: "core_production_done", dept: "core", section: "Storage", csv_export: true, regex: "^\\d+$" } },
    ],
  },
  "allergen_traces": {
    id: "allergen_traces",
    table: "main_table",
    col: "allergen_traces",
    tier: "L3",
    versions: [
      { v: 1, at: "2025-09-01 09:00", by: "M. Wiśniewska", deploy_ref: null,
        json: { col: "allergen_traces", label: "Allergen traces", type: "relation", required: false, dropdown_source: "reference.allergens_reference", dept: "technical_qa", section: "Allergens", csv_export: false } },
      { v: 2, at: "2025-12-12 11:18", by: "A. Zając", deploy_ref: null,
        json: { col: "allergen_traces", label: "Allergen traces", type: "relation", required: true, dropdown_source: "reference.allergens_reference", dept: "technical_qa", section: "Allergens", csv_export: true } },
      { v: 3, at: "2026-04-30 16:44", by: "K. Nowak", deploy_ref: null,
        json: { col: "allergen_traces", label: "Allergen traces", type: "relation", required: true, dropdown_source: "reference.allergens_reference", dept: "technical_qa", section: "Allergens", csv_export: true, d365_builder: true } },
    ],
  },
  "wip_code_override": {
    id: "wip_code_override",
    table: "main_table",
    col: "wip_code_override",
    tier: "L1",
    versions: [
      { v: 1, at: "2025-04-12 08:00", by: "system (CI/CD)", deploy_ref: "a1b2c3d",
        json: { col: "wip_code_override", label: "WIP code override", type: "text", required: false, regex: "^WIP-[A-Z]-\\d+$", dept: "production", section: "Production", csv_export: true } },
      { v: 2, at: "2026-01-08 12:00", by: "system (CI/CD)", deploy_ref: "9f8e7d6",
        json: { col: "wip_code_override", label: "WIP code override", type: "text", required: false, regex: "^WIP-[A-Z]{1,2}-\\d+$", dept: "production", section: "Production", csv_export: true } },
      { v: 3, at: "2026-03-21 09:42", by: "system (CI/CD)", deploy_ref: "e4d5c6b",
        json: { col: "wip_code_override", label: "WIP code override", type: "text", required: false, regex: "^WIP-[A-Z]{1,2}-\\d+$", dept: "production", section: "Production", csv_export: true, blocking: "line_filled" } },
    ],
  },
  "shelf_life_no_history": {
    id: "shelf_life_no_history",
    table: "main_table",
    col: "shelf_life_no_history",
    tier: "L3",
    versions: [
      { v: 1, at: "2026-05-13 09:00", by: "K. Nowak", deploy_ref: null,
        json: { col: "shelf_life_no_history", label: "Shelf life (no history)", type: "number", required: false, dept: "core", section: "Storage", csv_export: true } },
    ],
  },
};

// Map migration_id → schema column id (so route /settings/schema/diff/:id can resolve)
window.SETTINGS_DIFF_BY_MIGRATION = {
  "mig_2026_05_a1b2c3": "shelf_life_days",
  "mig_2026_04_e4d5c6": "allergen_traces",
  "mig_2026_03_e4d5c6b": "wip_code_override",
  "mig_2026_05_first":  "shelf_life_no_history",
};

// ---------- SET-033 Schema Migrations Queue ----------
window.SETTINGS_MIGRATIONS = [
  {
    id: "mig_2026_05_a1b2c3", table: "main_table", col: "shelf_life_days",
    action: "promote_l2_to_l1", requested_by: "K. Nowak", requested_at: "2026-05-13 14:02",
    approved_by: null, status: "pending",
    migration_script: "-- promote main_table.shelf_life_days from L2 to L1\nBEGIN;\nALTER TABLE main_table\n  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;\nUPDATE main_table SET shelf_life_days = ext_jsonb->>'shelf_life_days'::INT WHERE shelf_life_days IS NULL;\nALTER TABLE main_table ALTER COLUMN shelf_life_days SET NOT NULL;\nUPDATE reference_schemas SET tier = 'L1', version = version + 1 WHERE table_code = 'main_table' AND column_code = 'shelf_life_days';\nCOMMIT;",
    result_notes: null,
    timeline: [{ at: "2026-05-13 14:02", status: "pending", note: "Requested by K. Nowak" }],
  },
  {
    id: "mig_2026_05_b2c3d4", table: "main_table", col: "shelf_life_days",
    action: "promote_l2_to_l1", requested_by: "A. Zając", requested_at: "2026-05-10 09:15",
    approved_by: "Monopilot Superadmin", status: "approved",
    migration_script: "-- approved earlier — equivalent script",
    result_notes: "Approved by superadmin. Awaiting execution window.",
    timeline: [
      { at: "2026-05-10 09:15", status: "pending",  note: "Requested by A. Zając" },
      { at: "2026-05-12 11:00", status: "approved", note: "Approved by superadmin" },
    ],
  },
  {
    id: "mig_2026_05_c3d4e5", table: "main_table", col: "allergen_traces",
    action: "promote_l2_to_l1", requested_by: "M. Wiśniewska", requested_at: "2026-05-09 16:20",
    approved_by: "Monopilot Superadmin", status: "running",
    migration_script: "-- promote main_table.allergen_traces from L2 to L1\nBEGIN;\nALTER TABLE main_table ADD COLUMN IF NOT EXISTS allergen_traces UUID REFERENCES allergens_reference(id);\nUPDATE main_table SET allergen_traces = (ext_jsonb->>'allergen_traces')::UUID;\nCOMMIT;",
    result_notes: "Running… 87% complete. Backfilling 12 042 rows.",
    timeline: [
      { at: "2026-05-09 16:20", status: "pending",  note: "Requested" },
      { at: "2026-05-10 10:00", status: "approved", note: "Approved" },
      { at: "2026-05-13 13:30", status: "running",  note: "Migration job started" },
    ],
  },
  {
    id: "mig_2026_04_d4e5f6", table: "reference.pack_sizes", col: "pack_class",
    action: "add", requested_by: "K. Nowak", requested_at: "2026-04-22 12:00",
    approved_by: "Monopilot Superadmin", status: "completed",
    migration_script: "-- add reference.pack_sizes.pack_class\nALTER TABLE pack_sizes ADD COLUMN pack_class TEXT;\nUPDATE reference_schemas SET ... ;",
    result_notes: "Completed in 4.2 s. Affected rows: 1 044.",
    timeline: [
      { at: "2026-04-22 12:00", status: "pending",   note: "Requested" },
      { at: "2026-04-23 08:30", status: "approved",  note: "Approved" },
      { at: "2026-04-23 09:00", status: "running",   note: "Execution started" },
      { at: "2026-04-23 09:04", status: "completed", note: "Completed successfully" },
    ],
  },
  {
    id: "mig_2026_03_e5f6g7", table: "main_table", col: "wip_code_override",
    action: "edit", requested_by: "K. Nowak", requested_at: "2026-03-20 10:00",
    approved_by: "Monopilot Superadmin", status: "failed",
    migration_script: "-- modify regex on wip_code_override\nUPDATE reference_schemas SET ... ;",
    result_notes: "Failed: constraint violation on 4 rows where existing WIP codes don't match new regex. Rolling back.",
    timeline: [
      { at: "2026-03-20 10:00", status: "pending",  note: "Requested" },
      { at: "2026-03-20 14:00", status: "approved", note: "Approved" },
      { at: "2026-03-20 14:10", status: "running",  note: "Execution started" },
      { at: "2026-03-20 14:12", status: "failed",   note: "Constraint violation — rolled back" },
    ],
  },
  {
    id: "mig_2026_02_f6g7h8", table: "reference.processes", col: "legacy_field",
    action: "deprecate", requested_by: "A. Zając", requested_at: "2026-02-15 11:00",
    approved_by: "Monopilot Superadmin", status: "rolled_back",
    migration_script: "-- deprecate reference.processes.legacy_field\n-- rolled back per change request CR-1042",
    result_notes: "Rolled back per change request CR-1042 — field still in use by report-X.",
    timeline: [
      { at: "2026-02-15 11:00", status: "pending",     note: "Requested" },
      { at: "2026-02-15 13:00", status: "approved",    note: "Approved" },
      { at: "2026-02-15 13:30", status: "completed",   note: "Initial completion" },
      { at: "2026-02-18 09:00", status: "rolled_back", note: "Rolled back per CR-1042" },
    ],
  },
];

// ---------- SET-060 Tenant Variations Dashboard ----------
window.SETTINGS_TENANT = {
  dept_overrides: [
    { id: "do_1", action: "split", source: "technical", targets: ["technical_rd", "technical_qa"], updated: "2026-04-12", by: "K. Nowak", column_count: 12 },
    { id: "do_2", action: "add",   source: null,        targets: ["food_safety"],                  updated: "2026-03-08", by: "A. Zając", column_count: 4  },
  ],
  rule_variants: [
    { code: "allergen_changeover_gate",   current: "v2", available: ["v1", "v2", "v3"], last_changed: "2026-04-30" },
    { code: "wip_code_generator",         current: "v1", available: ["v1", "v2"],       last_changed: "2025-12-20" },
    { code: "bom_cost_rollup",             current: "v3", available: ["v1", "v2", "v3"], last_changed: "2026-05-02" },
  ],
  schema_extensions_l3: 7,
  last_upgrade: "2026-04-22",
  authorization_policies: [
    { id: "npd_post_release_edit",         label: "NPD post-release edit",            status: "Enabled",       desc: "Allow editing of recipes after the post-release lock.", updated: "2026-05-03", policy_route: "/settings/authorization" },
    { id: "technical_product_spec_approval", label: "Technical product spec approval", status: "Misconfigured", desc: "Workflow approval routing missing approver chain.",     updated: "2026-04-18", policy_route: "/settings/authorization" },
  ],
};

// ---------- T-078 / T-115 Manufacturing Operations ----------
window.SETTINGS_MANUFACTURING_OPS = [
  { id: "op_789", operation_name: "Slicing Line 3 — High-throughput",      process_suffix: "SL3",  dept: "production",  is_active: true,  created_at: "2025-08-04", updated_at: "2026-05-10", created_by: "K. Nowak",      capacity_per_hour: 1200, notes: "Optimised for 200g packs." },
  { id: "op_790", operation_name: "Packaging Line 1 — Premium tray",        process_suffix: "PL1P", dept: "packaging",   is_active: true,  created_at: "2025-09-12", updated_at: "2026-04-22", created_by: "A. Zając",       capacity_per_hour: 800,  notes: "Tray-seal with anti-allergen swap." },
  { id: "op_791", operation_name: "MAP Sealer Line 5",                       process_suffix: "MAP5", dept: "packaging",   is_active: true,  created_at: "2025-10-30", updated_at: "2026-03-15", created_by: "M. Wiśniewska",  capacity_per_hour: 600,  notes: "" },
  { id: "op_792", operation_name: "Cooking Vat — Batch retort",              process_suffix: "CV1",  dept: "production",  is_active: false, created_at: "2025-04-22", updated_at: "2026-01-10", created_by: "A. Zając",       capacity_per_hour: 450,  notes: "Out of service since Jan 2026." },
  { id: "op_793", operation_name: "QC Sampling Bench",                       process_suffix: "QC1",  dept: "technical_qa",is_active: true,  created_at: "2025-06-15", updated_at: "2026-05-04", created_by: "M. Wiśniewska",  capacity_per_hour: 60,   notes: "12 samples per batch." },
];

// Audit log entries for manufacturing operations (used by SET-057 + SET-013).
window.SETTINGS_MFG_AUDIT = [
  { id: "a_1001", at: "2025-08-04 10:00:12", user: "K. Nowak",      user_email: "k.nowak@apex.pl",        action: "create", entity_type: "manufacturing_operation", entity_id: "op_789", record_id: "op_789",
    table: "manufacturing_operations", ip: "192.168.1.42", changes: [
      { field: "operation_name",   from: null, to: "Slicing Line 3 — High-throughput" },
      { field: "process_suffix",   from: null, to: "SL3" },
      { field: "dept",             from: null, to: "production" },
      { field: "is_active",        from: null, to: true },
      { field: "capacity_per_hour",from: null, to: 1000 },
    ]},
  { id: "a_1002", at: "2026-02-14 11:18:42", user: "A. Zając",      user_email: "a.zajac@apex.pl",        action: "update", entity_type: "manufacturing_operation", entity_id: "op_789", record_id: "op_789",
    table: "manufacturing_operations", ip: "192.168.1.88", changes: [
      { field: "capacity_per_hour", from: 1000, to: 1200 },
      { field: "notes",             from: "Optimised for 100g.", to: "Optimised for 200g packs." },
    ]},
  { id: "a_1003", at: "2026-05-10 16:42:01", user: "K. Nowak",      user_email: "k.nowak@apex.pl",        action: "update", entity_type: "manufacturing_operation", entity_id: "op_789", record_id: "op_789",
    table: "manufacturing_operations", ip: "192.168.1.42", changes: [
      { field: "is_active", from: false, to: true },
    ]},
  { id: "a_1004", at: "2025-09-12 09:01:00", user: "A. Zając",      user_email: "a.zajac@apex.pl",        action: "create", entity_type: "manufacturing_operation", entity_id: "op_790", record_id: "op_790",
    table: "manufacturing_operations", ip: "192.168.1.88", changes: [
      { field: "operation_name", from: null, to: "Packaging Line 1 — Premium tray" },
      { field: "process_suffix", from: null, to: "PL1P" },
    ]},
  { id: "a_1005", at: "2026-01-10 13:22:11", user: "A. Zając",      user_email: "a.zajac@apex.pl",        action: "delete", entity_type: "manufacturing_operation", entity_id: "op_792", record_id: "op_792",
    table: "manufacturing_operations", ip: "192.168.1.88", changes: [
      { field: "is_active", from: true, to: false },
    ]},
];

// ---------- SET-013 Full Audit Log (broader set, partitioned monthly) ----------
window.SETTINGS_AUDIT_FULL = [
  { id: "al_2026_05_001", at: "2026-05-13 14:02:18", user: "K. Nowak",      user_email: "k.nowak@apex.pl", impersonating: null, action: "schema_migrate",   table: "reference_schemas",   record_id: "shelf_life_days", changes: [{ field: "tier", from: "L2", to: "L1" }, { field: "version", from: 2, to: 3 }, { field: "range_max", from: 90, to: 120 }, { field: "blocking", from: "core_done", to: "core_production_done" }], ip: "192.168.1.42" },
  { id: "al_2026_05_002", at: "2026-05-13 13:30:11", user: "M. Wiśniewska", user_email: "m.wisniewska@apex.pl", impersonating: null, action: "update",        table: "users",                record_id: "u_445",          changes: [{ field: "role", from: "viewer", to: "auditor" }], ip: "10.0.0.55" },
  { id: "al_2026_05_003", at: "2026-05-13 11:18:42", user: "A. Zając",      user_email: "a.zajac@apex.pl", impersonating: "tenant_demo", action: "rule_deploy",  table: "rule_definitions",    record_id: "allergen_changeover_gate", changes: [{ field: "version", from: 2, to: 3 }, { field: "deploy_ref", from: "9f8e7d6", to: "e4d5c6b" }], ip: "192.168.1.88" },
  { id: "al_2026_05_004", at: "2026-05-13 09:42:00", user: "system (CI/CD)", user_email: null, impersonating: null, action: "rule_deploy",                       table: "rule_definitions",    record_id: "wip_code_generator", changes: [{ field: "version", from: 1, to: 2 }], ip: null },
  { id: "al_2026_05_005", at: "2026-05-12 16:20:08", user: "K. Nowak",      user_email: "k.nowak@apex.pl", impersonating: null, action: "insert",            table: "reference_tables",     record_id: "ref_pack_2026_05", changes: [{ field: "pack_size", from: null, to: "30x50cm" }, { field: "display_order", from: null, to: 6 }], ip: "192.168.1.42" },
  { id: "al_2026_05_006", at: "2026-05-11 10:00:42", user: "A. Zając",      user_email: "a.zajac@apex.pl", impersonating: null, action: "tenant_variation_apply", table: "tenant_variations", record_id: "tv_2026_05_apex", changes: [{ field: "dept_overrides", from: "[]", to: "[split:technical]" }], ip: "192.168.1.88" },
  { id: "al_2026_05_007", at: "2026-05-10 14:12:00", user: "M. Wiśniewska", user_email: "m.wisniewska@apex.pl", impersonating: null, action: "delete",      table: "reference_tables",     record_id: "ref_old_001",     changes: [{ field: "is_active", from: true, to: false }], ip: "10.0.0.55" },
  { id: "al_2026_05_008", at: "2026-05-09 09:30:11", user: "K. Nowak",      user_email: "k.nowak@apex.pl", impersonating: null, action: "update",            table: "feature_flags_core",   record_id: "integration.d365.enabled", changes: [{ field: "is_enabled", from: false, to: true }, { field: "rollout", from: 0, to: 100 }], ip: "192.168.1.42" },
  { id: "al_2026_05_009", at: "2026-05-08 17:01:23", user: "A. Zając",      user_email: "a.zajac@apex.pl", impersonating: null, action: "update",            table: "organizations",         record_id: "org_apex",         changes: [{ field: "vat_id", from: "PL000111000", to: "PL000111222" }], ip: "192.168.1.88" },
  { id: "al_2026_05_010", at: "2026-05-08 11:42:00", user: "K. Nowak",      user_email: "k.nowak@apex.pl", impersonating: null, action: "insert",            table: "users",                record_id: "u_512",           changes: [{ field: "email", from: null, to: "j.kowalski@apex.pl" }, { field: "role", from: null, to: "viewer" }], ip: "192.168.1.42" },
  { id: "al_2026_04_011", at: "2026-04-30 08:50:33", user: "A. Zając",      user_email: "a.zajac@apex.pl", impersonating: null, action: "schema_migrate",    table: "reference_schemas",    record_id: "allergen_traces", changes: [{ field: "version", from: 2, to: 3 }, { field: "d365_builder", from: false, to: true }], ip: "192.168.1.88" },
  { id: "al_2026_04_012", at: "2026-04-22 12:00:11", user: "K. Nowak",      user_email: "k.nowak@apex.pl", impersonating: null, action: "schema_migrate",    table: "reference_schemas",    record_id: "pack_class",      changes: [{ field: "action", from: null, to: "add" }], ip: "192.168.1.42" },
  { id: "al_2026_04_013", at: "2026-04-12 14:30:00", user: "K. Nowak",      user_email: "k.nowak@apex.pl", impersonating: null, action: "tenant_variation_apply", table: "tenant_variations", record_id: "tv_2026_04_apex", changes: [{ field: "dept_overrides", from: "split:technical", to: "split:technical, add:food_safety" }], ip: "192.168.1.42" },
  { id: "al_2026_04_014", at: "2026-04-05 09:12:42", user: "M. Wiśniewska", user_email: "m.wisniewska@apex.pl", impersonating: null, action: "update",      table: "users",                record_id: "u_333",          changes: [{ field: "is_active", from: true, to: false }], ip: "10.0.0.55" },
  { id: "al_2026_04_015", at: "2026-04-02 15:18:01", user: "system (CI/CD)", user_email: null, impersonating: null, action: "rule_deploy",                       table: "rule_definitions",    record_id: "bom_cost_rollup", changes: [{ field: "version", from: 2, to: 3 }], ip: null },
  { id: "al_2026_03_016", at: "2026-03-21 09:42:11", user: "system (CI/CD)", user_email: null, impersonating: null, action: "schema_migrate",                  table: "reference_schemas",   record_id: "wip_code_override", changes: [{ field: "version", from: 2, to: 3 }, { field: "blocking", from: null, to: "line_filled" }], ip: null },
  { id: "al_2026_03_017", at: "2026-03-15 11:00:00", user: "A. Zając",      user_email: "a.zajac@apex.pl", impersonating: null, action: "delete",            table: "api_keys",             record_id: "ak_2024_004",     changes: [{ field: "is_active", from: true, to: false }], ip: "192.168.1.88" },
  { id: "al_2026_03_018", at: "2026-03-08 10:30:42", user: "K. Nowak",      user_email: "k.nowak@apex.pl", impersonating: null, action: "insert",            table: "reference_tables",     record_id: "ref_allergen_a15", changes: [{ field: "code", from: null, to: "A15" }, { field: "name_en", from: null, to: "Sesame seeds" }], ip: "192.168.1.42" },
];
