// ============================================================================
// NPD module · data.jsx — Seed data — replace with API hydration in Phase B/C
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// =============================================================================
// NPD seed data — UK industrial bakery (sliced bread, rolls, buns, pastries)
//
// Tenant: "Pennine Bakery Ltd" — fictional Warburtons-style factory in Yorkshire.
// All product names, suppliers, raw material codes are English/UK-localised.
//
// Glossary (used throughout the app):
//   FG  = Finished Good       (the packaged SKU that ships to retailers)
//   WIP = Work In Progress    (intermediate stage between RM and FG, e.g. dough,
//                              pre-baked, proved — relevant to Recipe & Production tabs)
//   PR  = Procurement / Raw   (purchased material from supplier — flour, yeast,
//                              packaging, etc. — drives BOM, cost, allergen cascade)
//
// File defines (in window scope, consumed across the app):
//   NPD_FGS              — finished-good projects (the dashboard hero list)
//   NPD_PROJECTS         — alias for legacy "R&D pipeline" stage flow (same FGs)
//   NPD_BRIEFS           — pre-FG product briefs from Commercial
//   NPD_INGREDIENTS_DEFAULT — Recipe seed (FG hero: "White Sliced Loaf 800g")
//   NPD_FORMULATION_VERSIONS — version history per FG
//   NPD_ALLERGEN_CASCADE — RM → Process → FG allergen rollup
//   NPD_PROD_DETAIL      — multi-component build for FG with several WIPs
//   NPD_RISKS / DOCS / HISTORY  — per-FG side panels
//   NPD_D365_OUTPUT      — D365 build artefacts
//   NPD_VALIDATION_RULES — V01-V08 catalog
//   NPD_DEPT_SUMMARY     — dashboard dept matrix (driven by active config template)
//   NPD_REF              — reference values (pack sizes, lines, suppliers)
//
// Implementation note for backend (Phase B/C handoff):
//   • All `fa_code` keys SHOULD be renamed `fg_code` in the API contract.
//     UI still uses `faCode` props in some routes (legacy alias) — agents
//     should treat `fg_code` as canonical and accept `fa_code` as deprecated.
//   • WIP codes follow `WIP-{XX}-{NNNNNNN}` — process-driven.
//       XX = 2-letter process initial defined in Settings → Processes
//            (MX=Mix, BK=Bake, PR=Prove, SL=Slice, MP=MAP, DV=Divide, CO=Cool, PK=Pack…)
//       NNNNNNN = 7-digit sequential counter, auto-incremented per process.
//     Example chain:
//       RM0001 + RM0002              → MX → WIP-MX-0001247
//       WIP-MX-0001247 + ING001      → BK → WIP-BK-0000893
//       WIP-BK-0000893               → PK → FG-2401
//   • RM codes follow `RM<4-digit>` — internal procurement code.
// =============================================================================

window.NPD_PROJECTS = [
  {
    id: "FG-2401", code: "FG-2401", name: "White Sliced Loaf 800g",
    type: "Bread · Sliced", stage: "recipe", prio: "high",
    owner: "K. Walker", created: "2026-03-14", target: "2026-07-01",
    progress: 35, cost: 0.62, targetCost: 0.58, margin: -7,
    shelfLife: "7 days", yieldPct: 94,
    notes: "Premium plant-based emulsifier swap, soy-free reformulation."
  },
  {
    id: "FG-2402", code: "FG-2402", name: "Wholemeal Sliced 800g",
    type: "Bread · Sliced", stage: "trial", prio: "high",
    owner: "K. Walker", created: "2026-02-28", target: "2026-06-15",
    progress: 62, cost: 0.71, targetCost: 0.68, margin: 4,
    shelfLife: "7 days", yieldPct: 91,
    notes: "Stoneground flour upgrade, retailer trial Q3 with Tesco."
  },
  {
    id: "FG-2403", code: "FG-2403", name: "Brioche Burger Buns 6pk",
    type: "Buns · Sweet", stage: "approval", prio: "med",
    owner: "M. Johnson", created: "2026-01-15", target: "2026-05-20",
    progress: 85, cost: 0.94, targetCost: 0.98, margin: 4.0,
    shelfLife: "10 days", yieldPct: 88
  },
  {
    id: "FG-2404", code: "FG-2404", name: "Seeded Wholemeal Batch 600g",
    type: "Bread · Batch", stage: "handoff", prio: "normal",
    owner: "M. Johnson", created: "2025-12-02", target: "2026-04-18",
    progress: 98, cost: 0.85, targetCost: 0.90, margin: 5.6
  },
  {
    id: "FG-2405", code: "FG-2405", name: "Sourdough Boule 400g",
    type: "Bread · Specialty", stage: "brief", prio: "normal",
    owner: "T. Brown", created: "2026-04-01", target: "2026-08-10",
    progress: 8
  },
  {
    id: "FG-2406", code: "FG-2406", name: "Crumpets 6pk",
    type: "Bakery · Griddled", stage: "recipe", prio: "med",
    owner: "T. Brown", created: "2026-03-20", target: "2026-07-15",
    progress: 22
  },
  {
    id: "FG-2407", code: "FG-2407", name: "English Muffins 4pk",
    type: "Buns · Savoury", stage: "brief", prio: "low",
    owner: "A. Davis", created: "2026-04-05", target: "2026-09-01"
  }
];

window.NPD_STAGES = [
  { key: "brief",    label: "Brief" },
  { key: "recipe",   label: "Recipe" },
  { key: "packaging",label: "Packaging" },
  { key: "trial",    label: "Trial" },
  { key: "sensory",  label: "Sensory" },
  { key: "pilot",    label: "Pilot" },
  { key: "approval", label: "Approval" },
  { key: "handoff",  label: "Handoff" }
];

window.NPD_STAGE_DETAIL = [
  { key: "brief",      label: "Brief",             short: "Intake" },
  { key: "recipe",     label: "Recipe",            short: "Formulation" },
  { key: "packaging",  label: "Packaging",         short: "Pack & Print" },
  { key: "trial",      label: "Trial",             short: "Bench-Top" },
  { key: "sensory",    label: "Sensory",           short: "Panel" },
  { key: "pilot",      label: "Pilot",             short: "Line Run" },
  { key: "approval",   label: "Approval",          short: "Sign-off" },
  { key: "handoff",    label: "Handoff",           short: "To Production" }
];

// Recipe ingredients — FG hero "White Sliced Loaf 800g"
// WIP codes follow WIP-{XX}-{NNNNNNN}, RM codes are internal procurement (RM-XXXX).
window.NPD_INGREDIENTS_DEFAULT = [
  { id: 1, code: "RM-1001", name: "Strong White Flour, Type 55",  pct: 56.0, costPerKg: 0.42, allergen: "Gluten" },
  { id: 2, code: "RM-1002", name: "Water (filtered)",              pct: 34.5, costPerKg: 0.001, allergen: null },
  { id: 3, code: "RM-1101", name: "Fresh Yeast",                   pct: 1.8,  costPerKg: 2.10,  allergen: null },
  { id: 4, code: "RM-1102", name: "Salt (PDV)",                    pct: 1.0,  costPerKg: 0.18,  allergen: null },
  { id: 5, code: "RM-1201", name: "Sugar (caster)",                pct: 1.5,  costPerKg: 0.85,  allergen: null },
  { id: 6, code: "RM-1301", name: "Rapeseed Oil",                  pct: 2.0,  costPerKg: 1.80,  allergen: null },
  { id: 7, code: "RM-1401", name: "Vital Wheat Gluten",            pct: 1.2,  costPerKg: 1.60,  allergen: "Gluten" },
  { id: 8, code: "RM-1501", name: "Soya Flour, full-fat",          pct: 0.8,  costPerKg: 1.20,  allergen: "Soy" },
  { id: 9, code: "RM-1601", name: "Calcium Propionate (E282)",     pct: 0.3,  costPerKg: 4.50,  allergen: null },
  { id: 10,code: "RM-1602", name: "Mono- & Diglycerides (E471)",   pct: 0.6,  costPerKg: 6.20,  allergen: null },
  { id: 11,code: "RM-1701", name: "Dough Improver, EnzyMax-B",     pct: 0.3,  costPerKg: 9.40,  allergen: null }
];

window.NPD_ALLERGENS = [
  "Gluten", "Soy", "Milk", "Egg", "Celery", "Mustard", "Sulphites",
  "Fish", "Crustaceans", "Nuts", "Sesame", "Peanuts", "Lupin", "Molluscs"
];

window.NPD_SENSORY = [
  { attr: "Crust colour",   score: 7.6 },
  { attr: "Crumb structure",score: 8.4 },
  { attr: "Aroma",          score: 8.0 },
  { attr: "Bite / chew",    score: 7.9 },
  { attr: "Sweetness",      score: 6.8 },
  { attr: "Salt balance",   score: 7.5 },
  { attr: "Overall",        score: 7.8 }
];

window.NPD_TRIALS = [
  { id: "T-012", date: "2026-03-08", batch: "20 kg dough", result: "pass", yield: 91, notes: "Crust pale, increase steam injection on Line 1.", tech: "K. Walker" },
  { id: "T-013", date: "2026-03-11", batch: "20 kg dough", result: "pass", yield: 93, notes: "Crumb open and even. Approved for pilot.", tech: "K. Walker" },
  { id: "T-014", date: "2026-03-14", batch: "120 kg dough", result: "pass", yield: 94, notes: "Pilot run, 312 loaves. No QA failures.", tech: "M. Johnson" }
];

// =============================================================================
// FG list — hero list for FA Detail / Dashboard / list views
// (window.NPD_FAS retained as alias for legacy components; canonical = NPD_FGS)
// =============================================================================
//
// Dept completion per FG (depends on active config template — Pennine Bakery has 7).
// Values: "done" | "inprog" | "blocked" | "pending"
//
window.NPD_FGS = [
  {
    fg_code: "FG2401", product_name: "White Sliced Loaf 800g", pack_size: "800g", number_of_cases: 30,
    status_overall: "Alert", launch_date: "2026-07-01", days_left: 9, built: false,
    finish_wip: "WIP-PK-0003198", rm_code: "RM1001",
    template: "Single-component · Sliced bread", volume: 4800,
    dev_code: "DEV26-037", weights: 800, packs_per_case: 8, price_brief: "see recipe",
    closed_core: "Yes", closed_planning: "No", closed_commercial: "No", closed_production: "No",
    closed_technical: "No", closed_mrp: "No", closed_procurement: "No",
    owner: "K. Walker", brief_id: "BR-0101",
    dept: { core: "done", planning: "inprog", commercial: "inprog", production: "blocked", technical: "pending", mrp: "blocked", procurement: "pending" },
    missing_data: "MRP: Box. Tech: Shelf_Life.",
    flour_pct: 56, shelf_life: "",
    comments: "Reformulation — soy-free for Tesco own-label spec.",
    benchmark: "Hovis Soft White Medium 800g"
  },
  {
    fg_code: "FG2402", product_name: "Wholemeal Sliced 800g", pack_size: "800g", number_of_cases: 30,
    status_overall: "InProgress", launch_date: "2026-06-15", days_left: 23, built: false,
    finish_wip: "WIP-PK-0003199", rm_code: "RM1011",
    template: "Single-component · Sliced bread", volume: 3600,
    dev_code: "DEV26-041", weights: 800, packs_per_case: 8, price_brief: "0.74",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "Yes", closed_production: "No",
    closed_technical: "Yes", closed_mrp: "No", closed_procurement: "No",
    owner: "M. Johnson", brief_id: "BR-0102",
    dept: { core: "done", planning: "done", commercial: "done", production: "inprog", technical: "done", mrp: "inprog", procurement: "inprog" },
    missing_data: "Production: Yield_Line.",
    flour_pct: 92, shelf_life: "7 days ambient"
  },
  {
    fg_code: "FG2403", product_name: "Brioche Burger Buns 6pk", pack_size: "330g", number_of_cases: 24,
    status_overall: "Complete", launch_date: "2026-05-20", days_left: 41, built: false,
    finish_wip: "WIP-DV-0000338, WIP-EW-0000091, WIP-MP-0001872",
    rm_code: "RM1052, RM1053, RM1054",
    template: "Multi-component · Sweet bun",
    volume: 1600, dev_code: "DEV26-033", weights: 330, packs_per_case: 12, price_brief: "see recipe",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "Yes", closed_production: "Yes",
    closed_technical: "Yes", closed_mrp: "Yes", closed_procurement: "Yes",
    owner: "T. Brown", brief_id: "BR-0099",
    dept: { core: "done", planning: "done", commercial: "done", production: "done", technical: "done", mrp: "done", procurement: "done" },
    missing_data: "—", flour_pct: 48, shelf_life: "10 days ambient"
  },
  {
    fg_code: "FG2404", product_name: "Seeded Wholemeal Batch 600g", pack_size: "600g", number_of_cases: 30,
    status_overall: "Built", launch_date: "2026-04-18", days_left: -34, built: true,
    finish_wip: "WIP-PK-0003187", rm_code: "RM1021",
    template: "Single-component · Batch loaf", volume: 2400,
    dev_code: "DEV26-018", weights: 600, packs_per_case: 10, price_brief: "0.92",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "Yes", closed_production: "Yes",
    closed_technical: "Yes", closed_mrp: "Yes", closed_procurement: "Yes",
    owner: "M. Johnson", brief_id: "BR-0088",
    dept: { core: "done", planning: "done", commercial: "done", production: "done", technical: "done", mrp: "done", procurement: "done" },
    missing_data: "—", flour_pct: 86, shelf_life: "8 days ambient"
  },
  {
    fg_code: "FG2405", product_name: "Sourdough Boule 400g", pack_size: "400g", number_of_cases: 24,
    status_overall: "InProgress", launch_date: "2026-08-10", days_left: 34, built: false,
    finish_wip: "WIP-PK-0003200", rm_code: "RM1031",
    template: "Single-component · Specialty", volume: 800,
    dev_code: "DEV26-044", weights: 400, packs_per_case: 8, price_brief: "see recipe",
    closed_core: "Yes", closed_planning: "No", closed_commercial: "No", closed_production: "No",
    closed_technical: "No", closed_mrp: "No", closed_procurement: "No",
    owner: "A. Davis", brief_id: "BR-0103",
    dept: { core: "done", planning: "inprog", commercial: "pending", production: "pending", technical: "inprog", mrp: "pending", procurement: "pending" },
    missing_data: "Core: Line. Tech: Allergens.", flour_pct: 75
  },
  {
    fg_code: "FG2406", product_name: "Crumpets 6pk", pack_size: "300g", number_of_cases: 24,
    status_overall: "Pending", launch_date: null, days_left: null, built: false,
    finish_wip: "", rm_code: "", template: "Single-component · Griddled",
    volume: null, dev_code: "DEV26-048", weights: null, packs_per_case: null, price_brief: "",
    closed_core: "No", closed_planning: "No", closed_commercial: "No", closed_production: "No",
    closed_technical: "No", closed_mrp: "No", closed_procurement: "No",
    owner: "K. Walker", brief_id: "BR-0105",
    dept: { core: "inprog", planning: "blocked", commercial: "blocked", production: "blocked", technical: "blocked", mrp: "blocked", procurement: "blocked" },
    missing_data: "Core: Finish_WIP, Pack_Size."
  },
  {
    fg_code: "FG2407", product_name: "English Muffins 4pk", pack_size: "260g", number_of_cases: 24,
    status_overall: "Alert", launch_date: "2026-09-01", days_left: 11, built: false,
    finish_wip: "WIP-PK-0003194", rm_code: "RM1041",
    template: "Single-component · Savoury bun", volume: 1200,
    dev_code: "DEV26-029", weights: 260, packs_per_case: 12, price_brief: "0.68",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "No", closed_production: "Yes",
    closed_technical: "Yes", closed_mrp: "No", closed_procurement: "No",
    owner: "T. Brown", brief_id: "BR-0095",
    dept: { core: "done", planning: "done", commercial: "inprog", production: "done", technical: "done", mrp: "inprog", procurement: "inprog" },
    missing_data: "Commercial: Bar_Codes. MRP: Box.", flour_pct: 60, shelf_life: "12 days ambient"
  },
  {
    fg_code: "FG2408", product_name: "Hot Cross Buns 4pk", pack_size: "300g", number_of_cases: 30,
    status_overall: "Complete", launch_date: "2027-03-01", days_left: 71, built: false,
    finish_wip: "WIP-PK-0003196", rm_code: "RM1062",
    template: "Multi-component · Sweet bun seasonal", volume: 1800,
    dev_code: "DEV26-039", weights: 300, packs_per_case: 12, price_brief: "1.20",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "Yes", closed_production: "Yes",
    closed_technical: "Yes", closed_mrp: "Yes", closed_procurement: "Yes",
    owner: "A. Davis", brief_id: "BR-0100",
    dept: { core: "done", planning: "done", commercial: "done", production: "done", technical: "done", mrp: "done", procurement: "done" },
    missing_data: "—", flour_pct: 52, shelf_life: "8 days ambient"
  }
];

// Backward-compat alias — legacy components still read NPD_FAS.
// New code SHOULD use NPD_FGS. Each FG also exposes legacy `fa_code` getter.
window.NPD_FAS = window.NPD_FGS.map(fg => ({
  ...fg,
  fa_code: fg.fg_code, // legacy field name — DO NOT USE in new code
  finish_meat: fg.finish_wip, // legacy field name — UI uses `finish_meat` until rename pass
}));

// =============================================================================
// Briefs — pre-FG product briefs from Commercial / Marketing
// =============================================================================
window.NPD_BRIEFS = [
  { brief_id: "BR-0105", dev_code: "DEV26-048", product_name: "Crumpets 6pk",            template: "Single", status: "draft",     fg_code: "FG2406", created_at: "2026-04-14", owner: "K. Walker" },
  { brief_id: "BR-0103", dev_code: "DEV26-044", product_name: "Sourdough Boule 400g",     template: "Single", status: "converted", fg_code: "FG2405", created_at: "2026-03-29", owner: "A. Davis" },
  { brief_id: "BR-0102", dev_code: "DEV26-041", product_name: "Wholemeal Sliced 800g",    template: "Single", status: "converted", fg_code: "FG2402", created_at: "2026-03-12", owner: "M. Johnson" },
  { brief_id: "BR-0101", dev_code: "DEV26-037", product_name: "White Sliced Loaf 800g",   template: "Single", status: "converted", fg_code: "FG2401", created_at: "2026-02-26", owner: "K. Walker" },
  { brief_id: "BR-0100", dev_code: "DEV26-039", product_name: "Hot Cross Buns 4pk",        template: "Multi",  status: "converted", fg_code: "FG2408", created_at: "2026-03-04", owner: "A. Davis" },
  { brief_id: "BR-0099", dev_code: "DEV26-033", product_name: "Brioche Burger Buns 6pk",   template: "Multi",  status: "converted", fg_code: "FG2403", created_at: "2026-02-12", owner: "T. Brown" },
  { brief_id: "BR-0106", dev_code: "DEV26-050", product_name: "Croissants 4pk, all-butter",template: "Multi",  status: "complete",  fg_code: null,     created_at: "2026-04-17", owner: "T. Brown" },
  { brief_id: "BR-0107", dev_code: "DEV26-051", product_name: "Tiger Bloomer 800g",        template: "Single", status: "draft",     fg_code: null,     created_at: "2026-04-19", owner: "K. Walker" },
  { brief_id: "BR-0098", dev_code: "DEV26-024", product_name: "Gluten-free Multigrain",    template: "Single", status: "abandoned", fg_code: null,     created_at: "2026-01-22", owner: "T. Brown" }
];
// Alias — legacy keys
window.NPD_BRIEFS.forEach(b => { b.fa_code = b.fg_code; });

// =============================================================================
// ProdDetail — multi-component build for FG2403 (Brioche Burger Buns 6pk)
// 3 component chains, each ending with a process-keyed WIP code.
// New format: WIP-{XX}-{NNNNNNN} where XX is the process initial from
// Settings → Processes. The pr_code on each row is the WIP code of the
// LAST process in that row (i.e. the row's output, fed into the next row).
// =============================================================================
window.NPD_PROD_DETAIL = {
  FG2403: [
    { pr_code: "WIP-DV-0000338", component: "Brioche Dough", weight_g: 65,
      process_1: "Mix",     yield_p1: 99, process_2: "Bulk Ferment", yield_p2: 98,
      process_3: "Divide",  yield_p3: 97, process_4: "",  yield_p4: null,
      line: "L3-Bun", dieset: "DS-BUN-65g", yield_line: 95, staffing: "4 op · 1 QA", rate: 1100,
      pr_code_p1: "WIP-MX-0001245", pr_code_p2: "WIP-BF-0000176", pr_code_p3: "WIP-DV-0000338", pr_code_p4: "", pr_code_final: "WIP-DV-0000338", v06: "pass" },
    { pr_code: "WIP-EW-0000091", component: "Proved Bun", weight_g: 70,
      process_1: "Prove",   yield_p1: 96, process_2: "Egg Wash",     yield_p2: 99,
      process_3: "",        yield_p3: null, process_4: "",           yield_p4: null,
      line: "L3-Bun", dieset: "DS-BUN-70g", yield_line: 95, staffing: "4 op · 1 QA", rate: 1080,
      pr_code_p1: "WIP-PR-0000410", pr_code_p2: "WIP-EW-0000091", pr_code_p3: "", pr_code_p4: "", pr_code_final: "WIP-EW-0000091", v06: "pass" },
    { pr_code: "WIP-MP-0001872", component: "Baked Bun", weight_g: 55,
      process_1: "Bake",    yield_p1: 88, process_2: "Cool",         yield_p2: 99,
      process_3: "Pack 6pk",yield_p3: 99, process_4: "MAP",          yield_p4: 99,
      line: "L3-Bun", dieset: "DS-BUN-55g", yield_line: 86, staffing: "4 op · 1 QA", rate: 1040,
      pr_code_p1: "WIP-BK-0000891", pr_code_p2: "WIP-CO-0000654", pr_code_p3: "WIP-PK-0003197", pr_code_p4: "WIP-MP-0001872", pr_code_final: "WIP-MP-0001872", v06: "pass" }
  ]
};

// =============================================================================
// Formulation versions per FG
// =============================================================================
window.NPD_FORMULATION_VERSIONS = {
  FG2401: [
    { version: "v0.1", status: "draft",  effective_from: "2026-02-26", effective_to: "2026-03-08", items: 10, allergens: "Gluten",       created_by: "K. Walker", created_at: "2026-02-26", locked: false },
    { version: "v0.2", status: "locked", effective_from: "2026-03-08", effective_to: "2026-04-01", items: 11, allergens: "Gluten, Soy",  created_by: "K. Walker", created_at: "2026-03-08", locked: true  },
    { version: "v0.3", status: "draft",  effective_from: "2026-04-01", effective_to: null,         items: 11, allergens: "Gluten, Soy",  created_by: "K. Walker", created_at: "2026-04-01", locked: false }
  ]
};
// Legacy alias
window.NPD_FORMULATION_VERSIONS.FA5601 = window.NPD_FORMULATION_VERSIONS.FG2401;

// =============================================================================
// Allergen cascade — RM → Process → FG
// =============================================================================
window.NPD_ALLERGEN_CASCADE = {
  FG2401: {
    rm: [
      { rm: "RM1001", name: "Strong White Flour T55",   allergens: ["Gluten"] },
      { rm: "RM1002", name: "Water (filtered)",         allergens: [] },
      { rm: "RM1101", name: "Fresh Yeast",              allergens: [] },
      { rm: "RM1102", name: "Salt (PDV)",               allergens: [] },
      { rm: "RM1401", name: "Vital Wheat Gluten",       allergens: ["Gluten"] },
      { rm: "RM1501", name: "Soya Flour",               allergens: ["Soy"] },
      { rm: "RM1601", name: "Calcium Propionate",       allergens: [] }
    ],
    process: [
      { name: "Mix",         added: [] },
      { name: "Bulk ferment (may contain)", added: [], may: ["Sesame", "Mustard"] },
      { name: "Bake",        added: [] }
    ],
    final: {
      contains:    [
        { allergen: "Gluten", from: "RM1001 / RM1401",          manual: false },
        { allergen: "Soy",    from: "RM1501",                   manual: false }
      ],
      may_contain: [
        { allergen: "Sesame",  from: "Process: Bulk ferment",   manual: false },
        { allergen: "Mustard", from: "Process: Bulk ferment",   manual: false }
      ]
    }
  }
};
window.NPD_ALLERGEN_CASCADE.FA5601 = window.NPD_ALLERGEN_CASCADE.FG2401;

// =============================================================================
// Risk register per FG
// =============================================================================
window.NPD_RISKS = {
  FG2401: [
    { id: "RSK-01", description: "Soy-free reformulation may reduce dough machinability — check at scale.", likelihood: "Med",  impact: "High", score: 6, status: "Open",       owner: "M. Johnson",   mitigation: "Schedule pilot run T-018 with line operator sign-off." },
    { id: "RSK-02", description: "Vital wheat gluten supplier single-source.",                              likelihood: "Low",  impact: "Med",  score: 2, status: "Mitigated",  owner: "Procurement",  mitigation: "Secondary supplier (Roquette UK) qualified Apr 2026." },
    { id: "RSK-03", description: "Tesco artwork sign-off not received — risks Q3 launch slot.",            likelihood: "High", impact: "Med",  score: 6, status: "Open",       owner: "K. Walker",    mitigation: "Weekly call established with Tesco buyer; ETA artwork 30 May." }
  ]
};
window.NPD_RISKS.FA5601 = window.NPD_RISKS.FG2401;

// =============================================================================
// Docs per FG
// =============================================================================
window.NPD_DOCS = {
  FG2401: [
    { type: "Spec",      filename: "FG2401-spec-v0.3.pdf",                version: "v0.3", uploaded_by: "K. Walker",      date: "2026-04-01", size: "3.2 MB" },
    { type: "Artwork",   filename: "WhiteSliced-Tesco-artwork-v2.pdf",     version: "v2",   uploaded_by: "Tesco Brand Co.",date: "2026-03-22", size: "8.1 MB" },
    { type: "Benchmark", filename: "Hovis-comparison-Q1-2026.xlsx",         version: "v1",   uploaded_by: "K. Walker",      date: "2026-02-28", size: "112 KB" },
    { type: "Reg.",      filename: "Bread-and-Flour-Regs-1998-summary.pdf", version: "v1",   uploaded_by: "QA Team",        date: "2026-02-26", size: "620 KB" }
  ]
};
window.NPD_DOCS.FA5601 = window.NPD_DOCS.FG2401;

// =============================================================================
// FG history audit
// =============================================================================
window.NPD_HISTORY = {
  FG2401: [
    { when: "20 Apr 2026 14:32", who: "K. Walker",  type: "field_edit",        desc: "Production: Yield_Line changed from 92 to 94." },
    { when: "18 Apr 2026 09:11", who: "M. Johnson", type: "dept_closed",       desc: "Technical section closed (7/7 required filled)." },
    { when: "15 Apr 2026 16:44", who: "K. Walker",  type: "built_reset",       desc: "Edit reset Built flag (was Built=TRUE)." },
    { when: "15 Apr 2026 16:21", who: "K. Walker",  type: "built",             desc: "D365 Builder executed. 4 products generated." },
    { when: "12 Apr 2026 10:05", who: "System",     type: "allergen_changed",  desc: "Cascade: Soy detected from RM1501 Soya Flour." },
    { when: "08 Apr 2026 11:14", who: "K. Walker",  type: "create",            desc: "FG created from Brief DEV26-037 (White Sliced Loaf)." }
  ]
};
window.NPD_HISTORY.FA5601 = window.NPD_HISTORY.FG2401;

// =============================================================================
// D365 Builder output
// =============================================================================
window.NPD_D365_OUTPUT = {
  FG2403: {
    generated_at: "2026-04-21 09:02",
    filename: "Builder_FG2403.xlsx",
    built: true,
    tabs: [
      { tab: "D365_Data",          rows: 1  },
      { tab: "Formula_Version",    rows: 4  },
      { tab: "Formula_Lines",      rows: 12 },
      { tab: "Route_Headers",      rows: 4  },
      { tab: "Route_Versions",     rows: 4  },
      { tab: "Route_Operations",   rows: 6  },
      { tab: "Route_OpProperties", rows: 6  },
      { tab: "Resource_Req",       rows: 6  }
    ]
  }
};
window.NPD_D365_OUTPUT.FA5603 = window.NPD_D365_OUTPUT.FG2403;

// =============================================================================
// Validation rules catalog
// =============================================================================
window.NPD_VALIDATION_RULES = [
  { id: "V01", title: "FG Code format",          detail: "FG Code must start with 'FG' followed by digits (regex ^FG[0-9]{4}$)." },
  { id: "V02", title: "Product Name required",   detail: "Product Name cannot be empty (max 200 chars)." },
  { id: "V03", title: "Pack Size in reference",  detail: "Pack Size must be in Reference.PackSizes list." },
  { id: "V04", title: "D365 material codes",     detail: "Each material must exist in D365 with assigned cost." },
  { id: "V05", title: "Dept required fields",    detail: "All required fields per dept filled before Close Dept." },
  { id: "V06", title: "WIP Code suffix",          detail: "Last process initial in flow must match Finish_WIP prefix (e.g. last process Pack → WIP-PK-…)." },
  { id: "V07", title: "Allergen declaration",    detail: "All 14 EU allergens assessed; manual overrides have reason." },
  { id: "V08", title: "Brief mapping",           detail: "Brief → FG mapping complete, dev_code format valid." }
];

// =============================================================================
// D365 Constants — read-only reference for D365 Builder modal
// =============================================================================
window.NPD_D365_CONSTANTS = [
  { k: "PRODUCTIONSITEID",        v: "PNNN" },        // Pennine Bakery Yorkshire
  { k: "APPROVERPERSONNELNUMBER", v: "APX100048" },
  { k: "DEFAULTQTY",              v: "1" },
  { k: "OPERATIONNUMBER",         v: "10" },
  { k: "COSTGROUP",               v: "BAKE" },
  { k: "UNIT",                    v: "KG" }
];

// =============================================================================
// Dashboard dept matrix
// (When config template is changed, this is recomputed live by NpdDashboard
//  from active config + per-FG dept status — see config-data.jsx)
// =============================================================================
window.NPD_DEPT_SUMMARY = [
  { dept: "Core",        done: 7, pending: 1, blocked: 0 },
  { dept: "Planning",    done: 5, pending: 2, blocked: 1 },
  { dept: "Commercial",  done: 4, pending: 3, blocked: 1 },
  { dept: "Production",  done: 4, pending: 2, blocked: 2 },
  { dept: "Technical",   done: 5, pending: 2, blocked: 1 },
  { dept: "MRP",         done: 3, pending: 3, blocked: 2 },
  { dept: "Procurement", done: 4, pending: 2, blocked: 2 }
];

// =============================================================================
// Reference values — pack sizes, lines, suppliers
// (Bakery-specific; lines reflect Pennine factory layout)
// =============================================================================
window.NPD_REF = {
  pack_sizes: ["260g", "300g", "330g", "400g", "600g", "800g", "1.2kg"],
  lines:      ["L1-Sliced", "L2-Sliced", "L3-Bun", "L4-Specialty", "L5-Griddle"],
  processes:  ["Mix", "Bulk Ferment", "Divide", "Prove", "Bake", "Cool", "Slice", "Pack", "MAP", "Egg Wash", "Glaze", "Score"],
  templates:  ["Single-component · Sliced bread", "Single-component · Batch loaf", "Single-component · Specialty",
               "Single-component · Savoury bun", "Single-component · Griddled",
               "Multi-component · Sweet bun", "Multi-component · Sweet bun seasonal", "Multi-component · Pastry"],
  suppliers:  ["ADM Milling UK", "Whitworth Bros.", "Carr's Flour Mills", "Lesaffre UK", "British Sugar plc"]
};

Object.assign(window, {});
