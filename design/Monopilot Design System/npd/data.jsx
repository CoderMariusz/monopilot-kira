// ============ DATA for the NPD prototype ============
// Sample products use Monopilot customer conventions (Polish producers, meat focus)

window.NPD_PROJECTS = [
  {
    id: "NPD-024", code: "NPD-024", name: "Sliced Ham 200g",
    type: "Meat · Cold cut", stage: "recipe", prio: "high",
    owner: "K. Nowak", created: "2025-11-14", target: "2026-03-01",
    progress: 35, cost: 18.40, targetCost: 17.50, margin: -5,
    shelfLife: "28 days", yieldPct: 78,
    notes: "Premium line extension, 95% meat content, nitrite-reduced."
  },
  {
    id: "NPD-023", code: "NPD-023", name: "Sliced Roasted Chicken 160g",
    type: "Meat · Cold cut", stage: "trial", prio: "high",
    owner: "K. Nowak", created: "2025-10-28", target: "2026-02-15",
    progress: 62, cost: 21.10, targetCost: 22.00, margin: 4,
    shelfLife: "21 days", yieldPct: 71,
    notes: "Oven-roasted, no phosphates. Pilot on Line 2 scheduled Dec 20."
  },
  {
    id: "NPD-022", code: "NPD-022", name: "Pork Neck Smoked 250g",
    type: "Meat · Smoked", stage: "approval", prio: "med",
    owner: "M. Wiśniewska", created: "2025-09-15", target: "2026-01-20",
    progress: 85, cost: 26.80, targetCost: 27.50, margin: 2.5,
    shelfLife: "35 days", yieldPct: 66
  },
  {
    id: "NPD-021", code: "NPD-021", name: "Turkey Breast Pastrami 150g",
    type: "Meat · Cold cut", stage: "handoff", prio: "normal",
    owner: "M. Wiśniewska", created: "2025-08-02", target: "2025-12-18",
    progress: 98, cost: 24.20, targetCost: 25.00, margin: 3.2
  },
  {
    id: "NPD-020", code: "NPD-020", name: "Chicken Liver Pâté 120g",
    type: "Meat · Pâté", stage: "brief", prio: "normal",
    owner: "T. Kowalski", created: "2025-12-01", target: "2026-04-10",
    progress: 8
  },
  {
    id: "NPD-019", code: "NPD-019", name: "Beef Bresaola 100g",
    type: "Meat · Cured", stage: "recipe", prio: "med",
    owner: "T. Kowalski", created: "2025-11-20", target: "2026-05-15",
    progress: 22
  },
  {
    id: "NPD-018", code: "NPD-018", name: "Smoked Salmon Slices 100g",
    type: "Fish · Smoked", stage: "brief", prio: "low",
    owner: "A. Zając", created: "2025-12-05", target: "2026-06-01",
    progress: 4
  },
  {
    id: "NPD-017", code: "NPD-017", name: "Chorizo Picante 200g",
    type: "Meat · Cured", stage: "trial", prio: "med",
    owner: "A. Zając", created: "2025-10-10", target: "2026-03-20",
    progress: 48
  }
];

window.NPD_STAGES = [
  { key: "brief",    label: "Brief" },
  { key: "recipe",   label: "Recipe" },
  { key: "trial",    label: "Trial" },
  { key: "approval", label: "Approval" },
  { key: "handoff",  label: "Handoff" }
];

// Fix-1 NPD: removed `nutrition` (Nutri-Score hallucination → 09-QUALITY/03-TECHNICAL)
// and `costing` (cost waterfall hallucination → 10-FINANCE Phase C4) per PRD §1.2
// out-of-scope for 01-NPD Phase B.2.
window.NPD_STAGE_DETAIL = [
  { key: "brief",      label: "Brief",             short: "Intake" },
  { key: "recipe",     label: "Recipe",            short: "Formulation" },
  { key: "packaging",  label: "Packaging",         short: "Pack spec" },
  { key: "trial",      label: "Trial",             short: "Lab trials" },
  { key: "sensory",    label: "Sensory",           short: "Panel scores" },
  { key: "pilot",      label: "Pilot",             short: "Line pilot" },
  { key: "approval",   label: "Regulatory",        short: "Labels & approval" },
  { key: "handoff",    label: "Handoff",           short: "Promote to BOM" }
];

// Ingredients for the Sliced Ham 200g recipe (the hero flow)
window.NPD_INGREDIENTS_DEFAULT = [
  { id: 1, code: "RM-1001", name: "Pork Ham, trimmed",      pct: 82.0, costPerKg: 18.50, allergen: null },
  { id: 2, code: "RM-2014", name: "Water (brine)",          pct: 9.0,  costPerKg: 0.01,  allergen: null },
  { id: 3, code: "RM-3022", name: "Salt",                   pct: 1.8,  costPerKg: 0.80,  allergen: null },
  { id: 4, code: "RM-3045", name: "Dextrose",               pct: 0.6,  costPerKg: 1.40,  allergen: null },
  { id: 5, code: "RM-3101", name: "Sodium Nitrite (E250)",  pct: 0.015,costPerKg: 8.00,  allergen: null },
  { id: 6, code: "RM-3210", name: "Sodium Ascorbate",       pct: 0.05, costPerKg: 6.20,  allergen: null },
  { id: 7, code: "RM-3404", name: "Carrageenan",            pct: 0.35, costPerKg: 14.00, allergen: null },
  { id: 8, code: "RM-3501", name: "Soy Protein Isolate",    pct: 1.2,  costPerKg: 9.50,  allergen: "soy" },
  { id: 9, code: "RM-3620", name: "Natural Smoke Flavor",   pct: 0.08, costPerKg: 22.00, allergen: null },
  { id: 10,code: "RM-3712", name: "Spice Mix (Ham blend)",  pct: 0.9,  costPerKg: 12.40, allergen: null }
];

// Fix-1 NPD: removed `NPD_NUTRITION_TARGET` mock — Nutri-Score/Nutrition panel
// was a PRD hallucination (belongs to 09-QUALITY / 03-TECHNICAL, not 01-NPD).

window.NPD_ALLERGENS = [
  "Gluten", "Soy", "Milk", "Egg", "Celery", "Mustard", "Sulphites", "Fish", "Crustaceans", "Nuts", "Sesame"
];

window.NPD_SENSORY = [
  { attr: "Appearance", score: 7.8 },
  { attr: "Aroma",      score: 8.2 },
  { attr: "Texture",    score: 7.1 },
  { attr: "Taste",      score: 8.5 },
  { attr: "Saltiness",  score: 6.8 },
  { attr: "Aftertaste", score: 7.4 }
];

window.NPD_TRIALS = [
  { id: "T-012", date: "2025-12-02", batch: "5 kg", result: "pass", yield: 76, notes: "Too salty, reduce salt to 1.8%.", tech: "K. Nowak" },
  { id: "T-013", date: "2025-12-05", batch: "5 kg", result: "pass", yield: 78, notes: "Texture better, slight pink ring OK.", tech: "K. Nowak" },
  { id: "T-014", date: "2025-12-09", batch: "10 kg", result: "pass", yield: 78, notes: "Approved for sensory panel.", tech: "K. Nowak" },
  { id: "T-015", date: "2025-12-14", batch: "20 kg", result: "pending", yield: null, notes: "In progress — final lab trial before pilot.", tech: "K. Nowak" }
];

// =============================================================================
// SPEC (01-NPD-UX.md §3) data — Factory Article (FA) centric model
// Today's reference date: 2026-04-21. FA codes use FA56XX range (next free block
// after Planning/Warehouse FA5100..5400).
// =============================================================================

// Dept completion per FA (7 depts: Core, Planning, Commercial, Production, Technical, MRP, Procurement)
// Values: "done" | "inprog" | "blocked" | "pending"
window.NPD_FAS = [
  {
    fa_code: "FA5601", product_name: "Pulled Chicken Shawarma", pack_size: "200g", number_of_cases: 24,
    status_overall: "Alert", launch_date: "2026-04-30", days_left: 9, built: false,
    finish_meat: "PR1939H", rm_code: "RM1939", template: "Single Comp · Cold cut", volume: 1200,
    dev_code: "DEV26-037", weights: 200, packs_per_case: 12, price_brief: "see recipe",
    closed_core: "Yes", closed_planning: "No", closed_commercial: "No", closed_production: "No",
    closed_technical: "No", closed_mrp: "No", closed_procurement: "No",
    owner: "K. Nowak", brief_id: "BR-0101", dept: { core: "done", planning: "inprog", commercial: "inprog", production: "blocked", technical: "pending", mrp: "blocked", procurement: "pending" },
    missing_data: "MRP: Box. Tech: Shelf_Life.", meat_pct: 74, shelf_life: "",
    comments: "Re-launch of 2024 SKU · nitrite-reduced variant.", benchmark: "Sokołów Pulled Chicken 180g"
  },
  {
    fa_code: "FA5602", product_name: "Sliced Ham Premium", pack_size: "150g", number_of_cases: 24,
    status_overall: "InProgress", launch_date: "2026-05-14", days_left: 23, built: false,
    finish_meat: "PR2045A", rm_code: "RM2045", template: "Single Comp · Cold cut", volume: 900,
    dev_code: "DEV26-041", weights: 150, packs_per_case: 12, price_brief: "21.50",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "Yes", closed_production: "No",
    closed_technical: "Yes", closed_mrp: "No", closed_procurement: "No",
    owner: "M. Wiśniewska", brief_id: "BR-0102",
    dept: { core: "done", planning: "done", commercial: "done", production: "inprog", technical: "done", mrp: "inprog", procurement: "inprog" },
    missing_data: "Production: Yield_Line.", meat_pct: 95, shelf_life: "28 days chilled"
  },
  {
    fa_code: "FA5603", product_name: "Italian Platter Multi", pack_size: "220g", number_of_cases: 12,
    status_overall: "Complete", launch_date: "2026-06-01", days_left: 41, built: false,
    finish_meat: "PR1839H, PR1942G, PR2045A", rm_code: "RM1839, RM1942, RM2045", template: "Multi Comp · Platter",
    volume: 400, dev_code: "DEV26-033", weights: 220, packs_per_case: 10, price_brief: "see recipe",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "Yes", closed_production: "Yes",
    closed_technical: "Yes", closed_mrp: "Yes", closed_procurement: "Yes",
    owner: "T. Kowalski", brief_id: "BR-0099",
    dept: { core: "done", planning: "done", commercial: "done", production: "done", technical: "done", mrp: "done", procurement: "done" },
    missing_data: "—", meat_pct: 88, shelf_life: "21 days chilled"
  },
  {
    fa_code: "FA5604", product_name: "Smoked Turkey Pastrami", pack_size: "160g", number_of_cases: 24,
    status_overall: "Built", launch_date: "2026-03-18", days_left: -34, built: true,
    finish_meat: "PR2201A", rm_code: "RM2201", template: "Single Comp · Smoked", volume: 750,
    dev_code: "DEV26-018", weights: 160, packs_per_case: 12, price_brief: "18.90",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "Yes", closed_production: "Yes",
    closed_technical: "Yes", closed_mrp: "Yes", closed_procurement: "Yes",
    owner: "M. Wiśniewska", brief_id: "BR-0088",
    dept: { core: "done", planning: "done", commercial: "done", production: "done", technical: "done", mrp: "done", procurement: "done" },
    missing_data: "—", meat_pct: 92, shelf_life: "35 days chilled"
  },
  {
    fa_code: "FA5605", product_name: "Chorizo Picante Fuerte", pack_size: "180g", number_of_cases: 20,
    status_overall: "InProgress", launch_date: "2026-05-25", days_left: 34, built: false,
    finish_meat: "PR3101G", rm_code: "RM3101", template: "Single Comp · Cured", volume: 500,
    dev_code: "DEV26-044", weights: 180, packs_per_case: 10, price_brief: "see recipe",
    closed_core: "Yes", closed_planning: "No", closed_commercial: "No", closed_production: "No",
    closed_technical: "No", closed_mrp: "No", closed_procurement: "No",
    owner: "A. Zając", brief_id: "BR-0103",
    dept: { core: "done", planning: "inprog", commercial: "pending", production: "pending", technical: "inprog", mrp: "pending", procurement: "pending" },
    missing_data: "Core: Line. Tech: Allergens.", meat_pct: 85
  },
  {
    fa_code: "FA5606", product_name: "Chicken Breast Tandoori", pack_size: "200g", number_of_cases: 24,
    status_overall: "Pending", launch_date: null, days_left: null, built: false,
    finish_meat: "", rm_code: "", template: "Single Comp · Cold cut", volume: null,
    dev_code: "DEV26-048", weights: null, packs_per_case: null, price_brief: "",
    closed_core: "No", closed_planning: "No", closed_commercial: "No", closed_production: "No",
    closed_technical: "No", closed_mrp: "No", closed_procurement: "No",
    owner: "K. Nowak", brief_id: "BR-0105",
    dept: { core: "inprog", planning: "blocked", commercial: "blocked", production: "blocked", technical: "blocked", mrp: "blocked", procurement: "blocked" },
    missing_data: "Core: Finish_Meat, Pack_Size."
  },
  {
    fa_code: "FA5607", product_name: "Beef Bresaola Slices", pack_size: "100g", number_of_cases: 24,
    status_overall: "Alert", launch_date: "2026-05-02", days_left: 11, built: false,
    finish_meat: "PR3302C", rm_code: "RM3302", template: "Single Comp · Cured", volume: 300,
    dev_code: "DEV26-029", weights: 100, packs_per_case: 12, price_brief: "32.00",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "No", closed_production: "Yes",
    closed_technical: "Yes", closed_mrp: "No", closed_procurement: "No",
    owner: "T. Kowalski", brief_id: "BR-0095",
    dept: { core: "done", planning: "done", commercial: "inprog", production: "done", technical: "done", mrp: "inprog", procurement: "inprog" },
    missing_data: "Commercial: Bar_Codes. MRP: Box.", meat_pct: 98, shelf_life: "42 days chilled"
  },
  {
    fa_code: "FA5608", product_name: "Salmon Gravadlax 100g", pack_size: "100g", number_of_cases: 24,
    status_overall: "Complete", launch_date: "2026-07-01", days_left: 71, built: false,
    finish_meat: "PR4401F", rm_code: "RM4401", template: "Single Comp · Fish", volume: 200,
    dev_code: "DEV26-039", weights: 100, packs_per_case: 12, price_brief: "28.00",
    closed_core: "Yes", closed_planning: "Yes", closed_commercial: "Yes", closed_production: "Yes",
    closed_technical: "Yes", closed_mrp: "Yes", closed_procurement: "Yes",
    owner: "A. Zając", brief_id: "BR-0100",
    dept: { core: "done", planning: "done", commercial: "done", production: "done", technical: "done", mrp: "done", procurement: "done" },
    missing_data: "—", meat_pct: 96, shelf_life: "18 days chilled"
  }
];

// Briefs (§3 SCR-04, SCR-05)
window.NPD_BRIEFS = [
  { brief_id: "BR-0105", dev_code: "DEV26-048", product_name: "Chicken Breast Tandoori", template: "Single", status: "draft", fa_code: "FA5606", created_at: "2026-04-14", owner: "K. Nowak" },
  { brief_id: "BR-0103", dev_code: "DEV26-044", product_name: "Chorizo Picante Fuerte", template: "Single", status: "converted", fa_code: "FA5605", created_at: "2026-03-29", owner: "A. Zając" },
  { brief_id: "BR-0102", dev_code: "DEV26-041", product_name: "Sliced Ham Premium",      template: "Single", status: "converted", fa_code: "FA5602", created_at: "2026-03-12", owner: "M. Wiśniewska" },
  { brief_id: "BR-0101", dev_code: "DEV26-037", product_name: "Pulled Chicken Shawarma", template: "Single", status: "converted", fa_code: "FA5601", created_at: "2026-02-26", owner: "K. Nowak" },
  { brief_id: "BR-0100", dev_code: "DEV26-039", product_name: "Salmon Gravadlax 100g",   template: "Single", status: "converted", fa_code: "FA5608", created_at: "2026-03-04", owner: "A. Zając" },
  { brief_id: "BR-0099", dev_code: "DEV26-033", product_name: "Italian Platter Multi",   template: "Multi",  status: "converted", fa_code: "FA5603", created_at: "2026-02-12", owner: "T. Kowalski" },
  { brief_id: "BR-0106", dev_code: "DEV26-050", product_name: "Duck Rillettes 120g",     template: "Single", status: "complete", fa_code: null, created_at: "2026-04-17", owner: "T. Kowalski" },
  { brief_id: "BR-0107", dev_code: "DEV26-051", product_name: "Pork Belly Char Siu 200g", template: "Multi", status: "draft",    fa_code: null, created_at: "2026-04-19", owner: "K. Nowak" },
  { brief_id: "BR-0098", dev_code: "DEV26-024", product_name: "Vegetarian Ham Analog",   template: "Single", status: "abandoned", fa_code: null, created_at: "2026-01-22", owner: "T. Kowalski" }
];

// ProdDetail rows for a multi-component FA (FA5603 Italian Platter)
window.NPD_PROD_DETAIL = {
  FA5603: [
    { pr_code: "PR1839H", component: "Prosciutto Crudo", weight_g: 70,
      process_1: "Slice",  yield_p1: 96, process_2: "MAP",  yield_p2: 99,
      process_3: "",       yield_p3: null, process_4: "",   yield_p4: null,
      line: "L2", dieset: "DS-L2-70g", yield_line: 92, staffing: "3 op · 1 QA", rate: 1100,
      pr_code_p1: "PR1839H-SL", pr_code_p2: "PR1839H-MP", pr_code_p3: "", pr_code_p4: "", pr_code_final: "PR1839H-MP", v06: "pass" },
    { pr_code: "PR1942G", component: "Salami Milano", weight_g: 80,
      process_1: "Slice",  yield_p1: 94, process_2: "MAP",  yield_p2: 98,
      process_3: "",       yield_p3: null, process_4: "",   yield_p4: null,
      line: "L2", dieset: "DS-L2-80g", yield_line: 90, staffing: "3 op · 1 QA", rate: 1050,
      pr_code_p1: "PR1942G-SL", pr_code_p2: "PR1942G-MP", pr_code_p3: "", pr_code_p4: "", pr_code_final: "PR1942G-MP", v06: "pass" },
    { pr_code: "PR2045A", component: "Cooked Ham", weight_g: 70,
      process_1: "Slice",  yield_p1: 97, process_2: "MAP",  yield_p2: 99,
      process_3: "",       yield_p3: null, process_4: "",   yield_p4: null,
      line: "L2", dieset: "DS-L2-70g", yield_line: 93, staffing: "3 op · 1 QA", rate: 1120,
      pr_code_p1: "PR2045A-SL", pr_code_p2: "PR2045A-MP", pr_code_p3: "", pr_code_p4: "", pr_code_final: "PR2045A-MP", v06: "pass" }
  ]
};

// Formulation versions per FA
window.NPD_FORMULATION_VERSIONS = {
  FA5601: [
    { version: "v0.1", status: "draft",  effective_from: "2026-02-26", effective_to: "2026-03-08", items: 10, allergens: "None", created_by: "K. Nowak", created_at: "2026-02-26", locked: false },
    { version: "v0.2", status: "locked", effective_from: "2026-03-08", effective_to: "2026-04-01", items: 11, allergens: "Soy", created_by: "K. Nowak", created_at: "2026-03-08", locked: true },
    { version: "v0.3", status: "draft",  effective_from: "2026-04-01", effective_to: null,         items: 11, allergens: "Soy", created_by: "K. Nowak", created_at: "2026-04-01", locked: false }
  ]
};

// Allergen cascade preview for FA5601
window.NPD_ALLERGEN_CASCADE = {
  FA5601: {
    rm: [
      { rm: "RM1939", name: "Chicken Breast",    allergens: [] },
      { rm: "RM2014", name: "Water (brine)",      allergens: [] },
      { rm: "RM3022", name: "Salt",               allergens: [] },
      { rm: "RM3501", name: "Soy Protein Isolate", allergens: ["Soy"] },
      { rm: "RM3712", name: "Spice Mix",          allergens: [] }
    ],
    process: [
      { name: "Slice",  added: [] },
      { name: "Coat (may contain)", added: [], may: ["Mustard"] },
      { name: "MAP",    added: [] }
    ],
    final: {
      contains: [{ allergen: "Soy", from: "RM3501", manual: false }],
      may_contain: [{ allergen: "Mustard", from: "Process: Coat", manual: false }]
    }
  }
};

// Risk register per FA
window.NPD_RISKS = {
  FA5601: [
    { id: "RSK-01", description: "Nitrite reduction may shorten shelf life below 28 days.", likelihood: "Med", impact: "High", score: 6, status: "Open", owner: "M. Wiśniewska", mitigation: "Run accelerated shelf-life test T-021." },
    { id: "RSK-02", description: "Soy Protein supplier single-source risk.", likelihood: "Low", impact: "Med", score: 2, status: "Mitigated", owner: "Procurement", mitigation: "Secondary supplier qualified March 2026." },
    { id: "RSK-03", description: "Launch date slip pushes past Easter promo window.", likelihood: "High", impact: "Med", score: 6, status: "Open", owner: "K. Nowak", mitigation: "Priority queue on Line 2." }
  ]
};

// Docs per FA
window.NPD_DOCS = {
  FA5601: [
    { type: "Spec",  filename: "FA5601-spec-v0.3.pdf",         version: "v0.3", uploaded_by: "K. Nowak",       date: "2026-04-01", size: "3.2 MB" },
    { type: "Artwork", filename: "PullChicken-artwork-v2.pdf",  version: "v2",   uploaded_by: "Design Agency",  date: "2026-03-22", size: "8.1 MB" },
    { type: "Benchmark", filename: "Sokolow-benchmark.xlsx",   version: "v1",   uploaded_by: "K. Nowak",       date: "2026-02-28", size: "112 KB" },
    { type: "Reg.",  filename: "Nitrite-reduction-brief.pdf",  version: "v1",   uploaded_by: "QA Team",         date: "2026-02-26", size: "620 KB" }
  ]
};

// FA history audit
window.NPD_HISTORY = {
  FA5601: [
    { when: "20 Apr 2026 14:32", who: "K. Nowak",       type: "field_edit",  desc: "Production: Yield_Line changed from 76 to 78." },
    { when: "18 Apr 2026 09:11", who: "M. Wiśniewska",  type: "dept_closed", desc: "Technical section closed (7/7 required filled)." },
    { when: "15 Apr 2026 16:44", who: "K. Nowak",       type: "built_reset", desc: "Any edit reset Built flag (was Built=TRUE)." },
    { when: "15 Apr 2026 16:21", who: "K. Nowak",       type: "built",       desc: "D365 Builder executed. 4 products generated." },
    { when: "12 Apr 2026 10:05", who: "System",         type: "allergen_changed", desc: "Cascade: Soy detected from RM3501 Soy Protein." },
    { when: "08 Apr 2026 11:14", who: "K. Nowak",       type: "create",      desc: "FA created from Brief DEV26-037 (Pulled Chicken Shawarma)." }
  ]
};

// D365 Builder output tabs
window.NPD_D365_OUTPUT = {
  FA5603: {
    generated_at: "2026-04-21 09:02",
    filename: "Builder_FA5603.xlsx",
    built: true,
    tabs: [
      { tab: "D365_Data",        rows: 1 },
      { tab: "Formula_Version",  rows: 4 },
      { tab: "Formula_Lines",    rows: 12 },
      { tab: "Route_Headers",    rows: 4 },
      { tab: "Route_Versions",   rows: 4 },
      { tab: "Route_Operations", rows: 6 },
      { tab: "Route_OpProperties", rows: 6 },
      { tab: "Resource_Req",     rows: 6 }
    ]
  }
};

// V-NPD validation rules catalog (§3 Validation Status panel)
window.NPD_VALIDATION_RULES = [
  { id: "V01", title: "FA Code format",          detail: "FA Code must start with 'FA' followed by letters/digits (regex ^FA[A-Z0-9]+$)." },
  { id: "V02", title: "Product Name required",   detail: "Product Name cannot be empty (max 200 chars)." },
  { id: "V03", title: "Pack Size in reference",  detail: "Pack Size must be in Reference.PackSizes list." },
  { id: "V04", title: "D365 material codes",     detail: "Each material must exist in D365 with assigned cost." },
  { id: "V05", title: "Dept required fields",    detail: "All required fields per dept filled before Close Dept." },
  { id: "V06", title: "PR Code suffix",          detail: "Last process suffix must match Finish_Meat end letter." },
  { id: "V07", title: "Allergen declaration",    detail: "All 14 EU allergens assessed; manual overrides have reason." },
  { id: "V08", title: "Brief mapping",           detail: "Brief → FA mapping complete, dev_code format valid." }
];

// D365 Constants (read-only reference shown in modals)
window.NPD_D365_CONSTANTS = [
  { k: "PRODUCTIONSITEID",          v: "FNOR" },
  { k: "APPROVERPERSONNELNUMBER",   v: "FOR100048" },
  { k: "DEFAULTQTY",                v: "1" },
  { k: "OPERATIONNUMBER",           v: "10" },
  { k: "COSTGROUP",                 v: "MEAT" },
  { k: "UNIT",                      v: "KG" }
];

// Dept matrix for SCR-01 dashboard
window.NPD_DEPT_SUMMARY = [
  { dept: "Core",        done: 7, pending: 1, blocked: 0 },
  { dept: "Planning",    done: 5, pending: 2, blocked: 1 },
  { dept: "Commercial",  done: 4, pending: 3, blocked: 1 },
  { dept: "Production",  done: 4, pending: 2, blocked: 2 },
  { dept: "Technical",   done: 5, pending: 2, blocked: 1 },
  { dept: "MRP",         done: 3, pending: 3, blocked: 2 },
  { dept: "Procurement", done: 4, pending: 2, blocked: 2 }
];

// Reference packs / lines / processes
window.NPD_REF = {
  pack_sizes: ["100g", "120g", "150g", "160g", "180g", "200g", "220g", "250g"],
  lines:      ["L1", "L2", "L3", "L4-MAP", "L5-Smoked"],
  processes:  ["Slice", "MAP", "Tumble", "Inject", "Cook", "Smoke", "Coat", "Pack"],
  templates:  ["Single Comp · Cold cut", "Single Comp · Smoked", "Single Comp · Cured", "Single Comp · Fish", "Multi Comp · Platter"],
  suppliers:  ["Sokołów", "Tarczyński", "Animex", "Olewnik", "Indykpol"]
};

Object.assign(window, {});
