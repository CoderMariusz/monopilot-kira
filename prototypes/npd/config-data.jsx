// ============================================================================
// NPD module · config-data.jsx — Config templates seed + activation helpers
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// ============================================================================
// NPD Configuration data — workflow templates per tenant
//
// 3 starter templates, each defines:
//   - departments (id, label, order, fields[], blocking_deps[], close_role[])
//   - validation rules (id, title, when_to_check, applies_to_field)
//   - field types: text | number | date | boolean | dropdown | multiselect | file | computed
//   - cascade rules: when field A changes, reset fields [B, C, D]
//
// Schema lives in window.NPD_CONFIG_TEMPLATES; the active config is
// window.NPD_ACTIVE_CONFIG (mutable, persisted to localStorage).
// ============================================================================

// -------- Field-type catalog (used by builder dropdown) ----------
window.NPD_FIELD_TYPES = [
  { id: "text",        label: "Text",         icon: "Aa",   desc: "Single-line text input" },
  { id: "textarea",    label: "Long text",    icon: "¶",    desc: "Multi-line textarea" },
  { id: "number",      label: "Number",       icon: "#",    desc: "Numeric input with step" },
  { id: "date",        label: "Date",         icon: "📅",   desc: "Date picker (YYYY-MM-DD)" },
  { id: "boolean",     label: "Yes / No",     icon: "✓",    desc: "Checkbox or toggle" },
  { id: "dropdown",    label: "Dropdown",     icon: "▼",    desc: "Single-select from values list" },
  { id: "multiselect", label: "Multi-select", icon: "☑",    desc: "Multiple values (e.g. allergens)" },
  { id: "file",        label: "File upload",  icon: "↑",    desc: "PDF / image attachment" },
  { id: "computed",    label: "Computed",     icon: "ƒ",    desc: "Auto-derived from other fields (read-only)" }
];

// -------- 3 starter templates ----------
window.NPD_CONFIG_TEMPLATES = [
  // ============================================================
  // TEMPLATE 1 — BAKERY (current full template, industrial bread & buns)
  // ============================================================
  {
    id: "tpl_bakery",
    name: "Bakery — Full Production",
    based_on: "Pennine Bakery Ltd · industrial bread & buns (Yorkshire)",
    industry: "Food & Beverage · Bakery",
    departments_count: 7,
    description: "Full 7-department flow with D365 integration, allergen cascade, and retailer-facing FGs. Designed for industrial bakery manufacturers (sliced bread, buns, pastries).",
    departments: [
      {
        id: "core", label: "Core", order: 1,
        close_role: ["npd_manager", "core_user"],
        blocking_deps: [],
        fields: [
          { id: "fa_code",       label: "FA Code",       type: "text",     required: true, computed: false, validation: "V01" },
          { id: "product_name",  label: "Product Name",  type: "text",     required: true, validation: "V02" },
          { id: "pack_size",     label: "Pack Size",     type: "dropdown", required: true, validation: "V03",
            values: ["100g", "150g", "200g", "250g", "500g", "1kg"], cascade_resets: ["line", "dieset"] },
          { id: "number_of_cases", label: "Number of cases", type: "number", required: false },
          { id: "finish_wip",    label: "Finish WIP",    type: "text",     required: true,
            help: "Comma-separated WIP codes — format WIP-XX-NNNNNNN (e.g. WIP-PK-0003198)", cascade_resets: ["rm_code"] },
          { id: "rm_code",       label: "RM Code",       type: "computed", required: false,
            computed_from: "finish_wip", help: "Auto-derived from Finish WIP" },
          { id: "template",      label: "Template",      type: "dropdown", required: false,
            values: ["Single-component", "Multi-component", "Imported"] },
          { id: "volume",        label: "Volume",        type: "number",   required: false },
          { id: "dev_code",      label: "Dev Code",      type: "text",     required: false },
          { id: "weights",       label: "Weights (g)",   type: "number",   required: false },
          { id: "packs_per_case", label: "Packs per case", type: "number", required: false }
        ]
      },
      {
        id: "planning", label: "Planning", order: 2,
        close_role: ["npd_manager", "dept_user"],
        blocking_deps: ["core"],
        fields: [
          { id: "meat_pct",       label: "Meat %",            type: "number", required: true },
          { id: "runs_per_week",  label: "Runs per week",     type: "number", required: true },
          { id: "date_codes",     label: "Date codes / week", type: "text",   required: true,
            help: "Comma-separated, e.g. Mon,Wed,Fri" }
        ]
      },
      {
        id: "commercial", label: "Commercial", order: 3,
        close_role: ["npd_manager", "dept_user"],
        blocking_deps: ["core"],
        fields: [
          { id: "launch_date",   label: "Launch Date",        type: "date",   required: true, validation: "V08" },
          { id: "dept_number",   label: "Department number",  type: "text",   required: true },
          { id: "article_number",label: "Article number",     type: "text",   required: true },
          { id: "bar_codes",     label: "Bar codes (GS1)",    type: "text",   required: true },
          { id: "cases_w1",      label: "Cases / week W1",    type: "number", required: true },
          { id: "cases_w2",      label: "Cases / week W2",    type: "number", required: true },
          { id: "cases_w3",      label: "Cases / week W3",    type: "number", required: true }
        ]
      },
      {
        id: "production", label: "Production", order: 4,
        close_role: ["npd_manager", "dept_user"],
        blocking_deps: [], // per-field blocking instead (Pack_Size from Core)
        fields: [
          { id: "process_1",     label: "Process 1",   type: "dropdown", required: true,
            values: ["Mix", "Bulk Ferment", "Divide", "Prove", "Bake", "Cool", "Slice", "Pack", "MAP"] },
          { id: "yield_p1",      label: "Yield P1 %",  type: "number",   required: true },
          { id: "line",          label: "Line",        type: "dropdown", required: true,
            values: ["L1-Sliced", "L2-Sliced", "L3-Bun", "L4-Specialty", "L5-Griddle"] },
          { id: "dieset",        label: "Dieset",      type: "computed", required: false, computed_from: "line" },
          { id: "yield_line",    label: "Yield Line %",type: "number",   required: true, validation: "V06" },
          { id: "rate",          label: "Rate (kg/hr)",type: "number",   required: true },
          { id: "staffing",      label: "Staffing",    type: "text",     required: false }
        ]
      },
      {
        id: "technical", label: "Technical", order: 5,
        close_role: ["npd_manager", "dept_user"],
        blocking_deps: ["core"],
        fields: [
          { id: "shelf_life",    label: "Shelf life",         type: "text",        required: true, validation: "V07" },
          { id: "storage_temp",  label: "Storage temperature",type: "text",        required: false },
          { id: "allergens",     label: "Allergens",          type: "multiselect", required: true,
            values: ["Cereals/gluten", "Crustaceans", "Eggs", "Fish", "Peanuts", "Soybeans", "Milk",
                     "Nuts", "Celery", "Mustard", "Sesame", "Sulphites", "Lupin", "Molluscs"] }
        ]
      },
      {
        id: "mrp", label: "MRP", order: 6,
        close_role: ["npd_manager", "dept_user"],
        blocking_deps: ["core", "production"],
        fields: [
          { id: "box_code",      label: "Box code",           type: "text",   required: true, validation: "V04" },
          { id: "top_label",     label: "Top Label",          type: "text",   required: true },
          { id: "bottom_label",  label: "Bottom Label",       type: "text",   required: false },
          { id: "tara_weight",   label: "Tara weight (kg)",   type: "number", required: true },
          { id: "pallet_plan",   label: "Pallet stacking plan",type: "text",  required: true },
          { id: "box_dimensions",label: "Box dimensions",     type: "text",   required: true }
        ]
      },
      {
        id: "procurement", label: "Procurement", order: 7,
        close_role: ["npd_manager", "dept_user"],
        blocking_deps: ["core", "production"],
        fields: [
          { id: "price",            label: "Price (€/kg)",         type: "number", required: true, step: 0.01 },
          { id: "lead_time_days",   label: "Lead time (days)",     type: "number", required: true },
          { id: "supplier",         label: "Supplier",             type: "dropdown", required: true,
            values: ["ADM Milling UK", "Whitworth Bros.", "Carr's Flour Mills", "Lesaffre UK", "British Sugar plc"] },
          { id: "proc_shelf_life",  label: "Procurement shelf life", type: "number", required: true }
        ]
      }
    ],
    validation_rules: [
      { id: "V01", title: "FG Code format",        regex: "^FG[0-9]{4}$",  scope: "field", applies_to: "core.fa_code" },
      { id: "V02", title: "Product Name required", scope: "field",         applies_to: "core.product_name" },
      { id: "V03", title: "Pack Size in reference",scope: "field",         applies_to: "core.pack_size" },
      { id: "V04", title: "D365 material codes",   scope: "section",       applies_to: "mrp" },
      { id: "V05", title: "All depts closed",      scope: "global" },
      { id: "V06", title: "WIP Code suffix match", scope: "field",         applies_to: "production.yield_line" },
      { id: "V07", title: "Allergen declaration",  scope: "field",         applies_to: "technical.allergens" },
      { id: "V08", title: "Brief mapping",         scope: "field",         applies_to: "commercial.launch_date" }
    ]
  },

  // ============================================================
  // TEMPLATE 2 — ŁUKA (industrial gears, ~4 depts)
  // ============================================================
  {
    id: "tpl_luka",
    name: "Industrial — Gears & Transmissions",
    based_on: "Łuka Sp. z o.o. · przekładnie zębate",
    industry: "Industrial machining",
    departments_count: 4,
    description: "Streamlined 4-department flow for industrial parts: Engineering → Machining → Quality → Procurement. No retail/commercial step, no allergens, focus on tolerances and material certs.",
    departments: [
      {
        id: "engineering", label: "Engineering", order: 1,
        close_role: ["npd_manager", "core_user"],
        blocking_deps: [],
        fields: [
          { id: "part_number",    label: "Part Number",     type: "text",   required: true, validation: "V01" },
          { id: "part_name",      label: "Part Name",       type: "text",   required: true },
          { id: "module",         label: "Module (mm)",     type: "number", required: true, step: 0.1, help: "DIN 780 modulus" },
          { id: "teeth_count",    label: "Teeth count (z)", type: "number", required: true },
          { id: "pressure_angle", label: "Pressure angle",  type: "dropdown", required: true,
            values: ["14.5°", "20°", "25°"] },
          { id: "helix_angle",    label: "Helix angle (°)", type: "number", required: false },
          { id: "tolerance_class",label: "DIN tolerance",   type: "dropdown", required: true,
            values: ["DIN 6", "DIN 7", "DIN 8", "DIN 9", "DIN 10"] },
          { id: "cad_drawing",    label: "CAD drawing",     type: "file",   required: true, help: ".step or .pdf" },
          { id: "material_grade", label: "Material grade",  type: "dropdown", required: true,
            values: ["18CrNiMo7-6", "16MnCr5", "20MnCr5", "42CrMo4", "C45"], cascade_resets: ["heat_treatment"] }
        ]
      },
      {
        id: "machining", label: "Machining", order: 2,
        close_role: ["npd_manager", "dept_user"],
        blocking_deps: ["engineering"],
        fields: [
          { id: "machine",        label: "Machine",         type: "dropdown", required: true,
            values: ["Gleason 130GX", "Liebherr LC180", "DMG Mori NTX1000", "Höfler Helix 700"] },
          { id: "cutting_method", label: "Cutting method",  type: "dropdown", required: true,
            values: ["Hobbing", "Shaping", "Skiving", "Grinding", "Honing"] },
          { id: "heat_treatment", label: "Heat treatment",  type: "dropdown", required: true,
            values: ["Case hardening", "Through hardening", "Nitriding", "Induction hardening"] },
          { id: "surface_finish", label: "Surface finish (Ra μm)", type: "number", required: true, step: 0.1 },
          { id: "cycle_time_min", label: "Cycle time (min)",type: "number", required: true },
          { id: "setup_time_min", label: "Setup time (min)",type: "number", required: false }
        ]
      },
      {
        id: "quality", label: "Quality", order: 3,
        close_role: ["dept_manager"],
        blocking_deps: ["engineering", "machining"],
        fields: [
          { id: "inspection_plan", label: "Inspection plan", type: "file",   required: true, validation: "V07" },
          { id: "cmm_required",    label: "CMM measurement", type: "boolean", required: true },
          { id: "noise_test",      label: "Noise test (dB)", type: "number", required: false },
          { id: "runout_max_mm",   label: "Max runout (mm)", type: "number", required: true, step: 0.001 },
          { id: "material_cert",   label: "Material cert (3.1)", type: "file", required: true,
            help: "EN 10204 3.1 certificate per heat number" }
        ]
      },
      {
        id: "procurement", label: "Procurement", order: 4,
        close_role: ["dept_user"],
        blocking_deps: ["engineering", "machining"],
        fields: [
          { id: "price_per_unit", label: "Price (€/unit)",  type: "number", required: true, step: 0.01 },
          { id: "moq",            label: "MOQ (pcs)",       type: "number", required: true },
          { id: "lead_time_days", label: "Lead time (days)",type: "number", required: true },
          { id: "supplier",       label: "Approved supplier", type: "dropdown", required: true,
            values: ["Łuka in-house", "ZF Friedrichshafen", "Bonfiglioli", "Wikov", "Höfler"] }
        ]
      }
    ],
    validation_rules: [
      { id: "V01", title: "Part Number format",      regex: "^LK-[0-9]{4}-[A-Z]$", scope: "field", applies_to: "engineering.part_number" },
      { id: "V05", title: "All 4 depts closed",      scope: "global" },
      { id: "V07", title: "Inspection plan attached",scope: "field", applies_to: "quality.inspection_plan" }
    ]
  },

  // ============================================================
  // TEMPLATE 3 — CROSS UK (consumer bikes, 3 depts)
  // ============================================================
  {
    id: "tpl_crossuk",
    name: "Consumer Goods — Bicycles",
    based_on: "Cross UK Ltd · road & gravel bikes",
    industry: "Sporting goods · Consumer",
    departments_count: 3,
    description: "Lean 3-department flow for consumer bicycle assembly: Design → Sourcing → Compliance. Optimized for SKU launches with retailer specs and EN safety standards.",
    departments: [
      {
        id: "design", label: "Design", order: 1,
        close_role: ["npd_manager", "core_user"],
        blocking_deps: [],
        fields: [
          { id: "sku",             label: "SKU",                  type: "text",     required: true, validation: "V01" },
          { id: "model_name",      label: "Model name",           type: "text",     required: true },
          { id: "category",        label: "Category",             type: "dropdown", required: true,
            values: ["Road", "Gravel", "Hybrid", "MTB hardtail", "MTB full-sus", "City", "E-bike"] },
          { id: "frame_size",      label: "Frame size",           type: "multiselect", required: true,
            values: ["XS (48cm)", "S (52cm)", "M (54cm)", "L (56cm)", "XL (58cm)"] },
          { id: "frame_material",  label: "Frame material",       type: "dropdown", required: true,
            values: ["6061 Aluminium", "7005 Aluminium", "Carbon T700", "Carbon T800", "Steel Reynolds 853"],
            cascade_resets: ["frame_supplier"] },
          { id: "groupset",        label: "Groupset",             type: "dropdown", required: true,
            values: ["Shimano 105", "Shimano Ultegra", "Shimano GRX", "SRAM Rival", "SRAM Force AXS"] },
          { id: "weight_target_kg",label: "Target weight (kg)",   type: "number",   required: true, step: 0.1 },
          { id: "color_options",   label: "Color options",        type: "multiselect", required: true,
            values: ["Matte black", "Gloss white", "Forest green", "Burgundy", "Sky blue", "Sunset orange"] },
          { id: "tech_drawing",    label: "Technical drawing",    type: "file",     required: false }
        ]
      },
      {
        id: "sourcing", label: "Sourcing", order: 2,
        close_role: ["npd_manager", "dept_user"],
        blocking_deps: ["design"],
        fields: [
          { id: "frame_supplier",  label: "Frame supplier",       type: "dropdown", required: true,
            values: ["Giant (TWN)", "Merida (TWN)", "Topkey (TWN)", "Astro (TWN)", "Velocite (POL)"] },
          { id: "moq_per_size",    label: "MOQ per size",         type: "number",   required: true },
          { id: "fob_price_usd",   label: "FOB price (USD)",      type: "number",   required: true, step: 0.01 },
          { id: "rrp_gbp",         label: "RRP (£)",              type: "number",   required: true, step: 1 },
          { id: "container_qty",   label: "Container qty",        type: "number",   required: true,
            help: "Bikes per 40ft HC" },
          { id: "lead_time_weeks", label: "Lead time (weeks)",    type: "number",   required: true }
        ]
      },
      {
        id: "compliance", label: "Compliance", order: 3,
        close_role: ["dept_manager"],
        blocking_deps: ["design", "sourcing"],
        fields: [
          { id: "iso_4210",       label: "ISO 4210 test",         type: "file",     required: true, validation: "V07",
            help: "Bicycle safety test report" },
          { id: "en_14764",       label: "EN 14764 (city)",       type: "boolean",  required: false },
          { id: "ukca_marking",   label: "UKCA marking ready",    type: "boolean",  required: true },
          { id: "warranty_years", label: "Warranty (years)",      type: "number",   required: true,
            values: [1, 2, 3, 5, 10] },
          { id: "user_manual",    label: "User manual (PDF)",     type: "file",     required: true,
            help: "EN/CY/GA mandatory" },
          { id: "launch_date",    label: "Launch date",           type: "date",     required: true, validation: "V08" }
        ]
      }
    ],
    validation_rules: [
      { id: "V01", title: "SKU format",              regex: "^CRX-[0-9]{6}$", scope: "field", applies_to: "design.sku" },
      { id: "V05", title: "All 3 depts closed",     scope: "global" },
      { id: "V07", title: "ISO 4210 attached",      scope: "field", applies_to: "compliance.iso_4210" },
      { id: "V08", title: "Launch ≥ 12 weeks out",  scope: "field", applies_to: "compliance.launch_date" }
    ]
  }
];

// -------- Active config (persisted to localStorage) ----------
window.NPD_ACTIVE_CONFIG_ID = (() => {
  try {
    const stored = localStorage.getItem("npd-active-config");
    // Migrate old IDs
    if (stored === "tpl_forza") return "tpl_bakery";
    return stored || "tpl_bakery";
  } catch { return "tpl_bakery"; }
})();

window.NPD_GET_ACTIVE_CONFIG = () => {
  return window.NPD_CONFIG_TEMPLATES.find(t => t.id === window.NPD_ACTIVE_CONFIG_ID)
      || window.NPD_CONFIG_TEMPLATES[0];
};

window.NPD_SET_ACTIVE_CONFIG = (id) => {
  window.NPD_ACTIVE_CONFIG_ID = id;
  try { localStorage.setItem("npd-active-config", id); } catch {}
  // Notify listeners (config screens, FG detail) to re-render.
  try { window.dispatchEvent(new CustomEvent("npd:config-activated", { detail: { id } })); } catch {}
};

// -------- Permissions for config editing ----------
window.NPD_CONFIG_CAN_EDIT = () => {
  const role = window.NPD_CURRENT_ROLE || "npd_manager";
  // Admin: full edit. NPD Manager: can request changes (read-only + request modal).
  return role === "admin";
};

window.NPD_CONFIG_CAN_REQUEST = () => {
  const role = window.NPD_CURRENT_ROLE || "npd_manager";
  return role === "npd_manager" || role === "admin";
};
