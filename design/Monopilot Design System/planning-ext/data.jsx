// ============ Planning+ (Advanced Scheduler / 07-PLANNING-EXT) — mock data ============
// Cross-refs to Planning (WO-2026-01xx codes, TO/PO, sequencing). Extends, does not duplicate.
// Domain: scheduler_runs (OPT-0042 etc.), scheduler_assignments, changeover_matrix_versions,
// demand_forecasts, scheduler_scenarios (SCN-0089 etc.), matrix_review_requests.

// ----- Sub-nav (sidebar of the Planning+ workspace) -----
const PEXT_NAV = [
  { group: "Operations", items: [
    { key: "dashboard",    label: "Dashboard (GanttView)", ic: "≡", hero: true },
    { key: "pending",      label: "Pending review",        ic: "◈", count: "7" },
    { key: "runs",         label: "Run history",           ic: "⎗", count: "42" },
  ]},
  { group: "Optimizer", items: [
    { key: "matrix",       label: "Changeover matrix",     ic: "▦" },
    { key: "sequencing",   label: "Allergen sequencing",   ic: "↯" },
    { key: "forecasts",    label: "Demand forecasts",      ic: "📈" },
  ]},
  { group: "Planner tools", items: [
    { key: "scenarios",    label: "What-if simulation",    ic: "⊕" },
    { key: "rules",        label: "Rule config",           ic: "⚙" },
  ]},
  { group: "Admin", items: [
    { key: "settings",     label: "Planning+ settings",    ic: "⚙" },
    { key: "gallery",      label: "Modal gallery",         ic: "▣" },
  ]},
];

// ----- Dashboard KPI strip (5 cards per §3.1 Zone B) -----
const PEXT_KPIS = [
  { k: "scheduled_wos",   label: "Scheduled WOs",     value: "23",       accent: "blue",  sub: "7 pending review",              target: "pending" },
  { k: "total_co",        label: "Total changeover",  value: "285 min",  accent: "green", sub: "−125 min vs v1 baseline",      target: "sequencing" },
  { k: "avg_util",        label: "Avg line util.",    value: "92.3%",    accent: "green", sub: "Target ≥90% · 5 of 5 lines on",target: "runs" },
  { k: "overdue_wos",     label: "Overdue WOs",       value: "2",        accent: "red",   sub: "Unscheduled past deadline",     target: "pending" },
  { k: "unscheduled",     label: "Unscheduled",       value: "3",        accent: "amber", sub: "Awaiting next scheduler run",   target: "pending" },
];

// ----- Solver status banner state -----
const PEXT_LAST_RUN = {
  id: "OPT-0042",
  uuid: "018e5a42-7c4e-7b1a-9a3e-e4a1b2c3d4e5",
  startedAt: "2026-04-21 06:12:04",
  completedAt: "2026-04-21 06:12:46",
  duration: 42,
  status: "converged",
  initiatedBy: "Monika Nowak",
  initiatedByEmail: "monika.nowak@forza.co.uk",
  horizon: "7d",
  linesCount: 5,
  woCount: 23,
  includeForecast: true,
  optimizerVersion: "allergen_sequencing_optimizer_v2",
  fallbackActivated: false,
};

// ----- Dashboard alerts -----
const PEXT_ALERTS = [
  { severity: "blue",  code: "RUN-COMPLETE", text: "Scheduler run OPT-0042 complete — 23 WOs assigned in 42s. Review 7 pending assignments.", link: "pending" },
  { severity: "amber", code: "CAP-VIOLATE",  text: "Capacity projection: LINE-03 Breaded is at 102% utilization Wed 23 Apr (shift A).", link: "dashboard" },
  { severity: "amber", code: "CO-HIGH",      text: "PEANUT→any changeover blocks detected on LINE-04 Tue 22 Apr — consider re-sequencing.", link: "sequencing" },
  { severity: "blue",  code: "MATRIX-REVIEW",text: "1 matrix review request pending: PEANUT→TREE cell BLOCKED (admin action required).", link: "matrix" },
];

// ============ GANTT — production lines and assignments ============
// Lines per §15.2 [FORZA-CONFIG]
const PEXT_LINES = [
  { id: "LINE-01", name: "Fresh Chicken",  cap_kg_h: 800,  allergen_constraints: ["PEANUT:segregated"], shiftA: true,  shiftB: true,  shiftC: false },
  { id: "LINE-02", name: "Cooked Products", cap_kg_h: 600, allergen_constraints: [], shiftA: true,  shiftB: true,  shiftC: false },
  { id: "LINE-03", name: "Breaded",         cap_kg_h: 500, allergen_constraints: [], shiftA: true,  shiftB: true,  shiftC: false },
  { id: "LINE-04", name: "Marinated",       cap_kg_h: 450, allergen_constraints: [], shiftA: true,  shiftB: true,  shiftC: false },
  { id: "LINE-05", name: "Packaging",       cap_kg_h: 1200,allergen_constraints: [], shiftA: true,  shiftB: true,  shiftC: false },
];

// Allergen palette (matches planning allergen-cluster dots but extended for this module)
const PEXT_ALLERGEN_COLORS = {
  NONE:    "#94a3b8",
  CEREAL:  "#f59e0b",   // gluten/orange
  MILK:    "#60a5fa",
  EGG:     "#a855f7",
  PEANUT:  "#b45309",   // brown
  TREE:    "#7c3aed",   // tree nut
  SOY:     "#0ea5e9",
  FISH:    "#06b6d4",
  MUSTARD: "#ca8a04",
  SESAME:  "#d97706",
  CELERY:  "#65a30d",
  SHELLFISH:"#0891b2",
};

// Scheduler assignments = WO blocks on Gantt. status: draft | approved | rejected | overridden
// day = 0 (Mon 2026-04-21) ... 6 (Sun). start/end in hours (0-24).
const PEXT_ASSIGNMENTS = [
  // LINE-01 Fresh Chicken
  { id: "A-0042", wo: "WO-2026-0108", fa: "FA5100", prod: "Kiełbasa śląska pieczona 450g", line: "LINE-01", shift: "A", day: 0, start: 6, end: 11.5, qty: 1011, allergen: ["CEREAL","MILK"], status: "approved",   score: 94.2, rank: 1, coBefore: 15, coAfter: 30, capPct: 0.82 },
  { id: "A-0044", wo: "WO-2026-0115", fa: "FA5400", prod: "Filet sous-vide 180g",            line: "LINE-01", shift: "A", day: 0, start: 12.5, end: 16, qty: 650, allergen: ["NONE"], status: "draft", score: 88.4, rank: 3, coBefore: 30, coAfter: 0, capPct: 0.56 },
  { id: "A-0045", wo: "WO-2026-0109", fa: "FA5102", prod: "Szynka wędzona plastry 150g",     line: "LINE-01", shift: "B", day: 1, start: 14, end: 19, qty: 820, allergen: ["MILK"],  status: "approved", score: 92.1, rank: 2, coBefore: 10, coAfter: 0, capPct: 0.68 },
  { id: "A-0046", wo: "WO-2026-0121", fa: "FA5103", prod: "Szynka kanapkowa 200g",            line: "LINE-01", shift: "A", day: 2, start: 7, end: 12, qty: 740, allergen: ["MILK"],  status: "draft", score: 87.5, rank: 5, coBefore: 0, coAfter: 0, capPct: 0.62 },
  { id: "A-0047", wo: "WO-2026-0122", fa: "FA5104", prod: "Kiełbasa toruńska 400g",            line: "LINE-01", shift: "A", day: 3, start: 6, end: 12, qty: 950, allergen: ["CEREAL","MILK"],  status: "draft", score: 85.2, rank: 9, coBefore: 20, coAfter: 0, capPct: 0.79 },

  // LINE-02 Cooked Products
  { id: "A-0050", wo: "WO-2026-0111", fa: "FA5021", prod: "Gulasz wołowy 350g",              line: "LINE-02", shift: "A", day: 0, start: 6.5, end: 10.5, qty: 520, allergen: ["NONE"], status: "approved", score: 91.4, rank: 2, coBefore: 0, coAfter: 15, capPct: 0.72 },
  { id: "A-0051", wo: "WO-2026-0123", fa: "FA5022", prod: "Bigos myśliwski 450g",             line: "LINE-02", shift: "B", day: 0, start: 14, end: 20, qty: 890, allergen: ["NONE"], status: "overridden", overriddenBy: "Monika Nowak", overrideReason: "customer_priority", score: 83.7, rank: 8, coBefore: 0, coAfter: 0, capPct: 0.99 },
  { id: "A-0052", wo: "WO-2026-0124", fa: "FA5023", prod: "Zupa pomidorowa 500ml",            line: "LINE-02", shift: "A", day: 1, start: 7, end: 11.5, qty: 600, allergen: ["CEREAL"], status: "draft", score: 86.9, rank: 7, coBefore: 15, coAfter: 0, capPct: 0.75 },
  { id: "A-0053", wo: "WO-2026-0125", fa: "FA5024", prod: "Fasolka po bretońsku 450g",        line: "LINE-02", shift: "A", day: 2, start: 8, end: 13.5, qty: 810, allergen: ["NONE"], status: "draft", score: 84.1, rank: 10, coBefore: 15, coAfter: 0, capPct: 0.91 },

  // LINE-03 Breaded — has capacity violation on Wed 23 Apr (conflict=true)
  { id: "A-0060", wo: "WO-2026-0113", fa: "FA5301", prod: "Pierogi z mięsem 400g",            line: "LINE-03", shift: "A", day: 1, start: 6, end: 12, qty: 780, allergen: ["CEREAL","EGG"], status: "approved", score: 90.8, rank: 3, coBefore: 0, coAfter: 45, capPct: 0.93 },
  { id: "A-0061", wo: "WO-2026-0114", fa: "IN1301", prod: "[INT] Farsz pierogowy mieszany",   line: "LINE-03", shift: "B", day: 1, start: 15, end: 21, qty: 420, allergen: ["EGG"], status: "approved", score: 89.2, rank: 4, coBefore: 10, coAfter: 0, capPct: 0.55 },
  { id: "A-0062", wo: "WO-2026-0126", fa: "FA5302", prod: "Nuggetsy z kurczaka 500g",         line: "LINE-03", shift: "A", day: 2, start: 6, end: 14, qty: 1040, allergen: ["CEREAL","EGG"], status: "draft", score: 78.3, rank: 15, coBefore: 15, coAfter: 0, capPct: 1.04, conflict: true },
  { id: "A-0063", wo: "WO-2026-0127", fa: "FA5303", prod: "Kotlety mielone panierowane 300g", line: "LINE-03", shift: "B", day: 2, start: 14, end: 22, qty: 1040, allergen: ["CEREAL","EGG","MILK"], status: "draft", score: 75.2, rank: 18, coBefore: 10, coAfter: 0, capPct: 1.07, conflict: true },

  // LINE-04 Marinated — MUSTARD + PEANUT = high CO pressure
  { id: "A-0070", wo: "WO-2026-0120", fa: "FA5401", prod: "Klopsiki w sosie pomidorowym 320g", line: "LINE-04", shift: "A", day: 0, start: 6, end: 14, qty: 980, allergen: ["MUSTARD"], status: "approved", score: 86.5, rank: 6, coBefore: 0, coAfter: 45, capPct: 0.88 },
  { id: "A-0071", wo: "WO-2026-0128", fa: "FA5402", prod: "Pikantne skrzydełka z masłem orzech.", line: "LINE-04", shift: "A", day: 1, start: 8, end: 16, qty: 560, allergen: ["PEANUT"], status: "draft", score: 71.8, rank: 20, coBefore: 90, coAfter: 90, capPct: 0.62 },
  { id: "A-0072", wo: "WO-2026-0129", fa: "FA5403", prod: "Marynata z musztardą i pieprzem",    line: "LINE-04", shift: "A", day: 3, start: 6, end: 12, qty: 650, allergen: ["MUSTARD"], status: "draft", score: 82.4, rank: 12, coBefore: 0, coAfter: 0, capPct: 0.72 },

  // LINE-05 Packaging
  { id: "A-0080", wo: "WO-2026-0130", fa: "FA5500", prod: "Multi-pack 5×180g pakowanie",        line: "LINE-05", shift: "A", day: 0, start: 9, end: 13, qty: 2400, allergen: ["NONE"], status: "approved", score: 89.9, rank: 5, coBefore: 0, coAfter: 0, capPct: 0.50 },
  { id: "A-0081", wo: "WO-2026-0131", fa: "FA5501", prod: "Tace dyspl. retail pakowanie",       line: "LINE-05", shift: "B", day: 1, start: 14, end: 19, qty: 3000, allergen: ["NONE"], status: "approved", score: 88.0, rank: 6, coBefore: 0, coAfter: 0, capPct: 0.50 },
];

// Changeover blocks — inserted between WOs. day/start in hours from start of day
const PEXT_COBLOCKS = [
  { line: "LINE-01", day: 0, start: 11.5, end: 12.5, from: "CEREAL+MILK", to: "NONE",     minutes: 30, risk: "medium", clean: true,  atp: false, reason: "Between WO-2026-0108 (Kiełbasa) and WO-2026-0115 (Filet)" },
  { line: "LINE-02", day: 0, start: 10.5, end: 11,   from: "NONE",       to: "NONE",     minutes: 0,  risk: "none",   clean: false, atp: false, reason: "Buffer" },
  { line: "LINE-03", day: 1, start: 12,   end: 12.75,from: "CEREAL+EGG", to: "EGG",      minutes: 45, risk: "high",   clean: true,  atp: false, reason: "Cross-allergen" },
  { line: "LINE-04", day: 0, start: 14,   end: 16,   from: "MUSTARD",    to: "PEANUT",   minutes: 120,risk: "blocked",clean: true,  atp: true,  reason: "BLOCKED — segregation pending", segregation: true },
  { line: "LINE-01", day: 2, start: 12,   end: 12.33,from: "MILK",       to: "CEREAL+MILK", minutes: 20, risk: "medium", clean: true,  atp: false, reason: "Matrix lookup" },
];

// Maintenance / down blocks (non-editable)
const PEXT_MAINT_BLOCKS = [
  { line: "LINE-04", day: 2, start: 14, end: 22, label: "Scheduled maintenance", ref: "MAINT-0017" },
  { line: "LINE-05", day: 5, start: 6,  end: 12, label: "Weekend partial close", ref: "MAINT-0018" },
];

// Dates shown in Gantt header (7-day horizon from Mon 2026-04-21)
const PEXT_DATES = [
  { day: 0, label: "Mon 21 Apr", iso: "2026-04-21", weekend: false, today: true },
  { day: 1, label: "Tue 22 Apr", iso: "2026-04-22", weekend: false, today: false },
  { day: 2, label: "Wed 23 Apr", iso: "2026-04-23", weekend: false, today: false },
  { day: 3, label: "Thu 24 Apr", iso: "2026-04-24", weekend: false, today: false },
  { day: 4, label: "Fri 25 Apr", iso: "2026-04-25", weekend: false, today: false },
  { day: 5, label: "Sat 26 Apr", iso: "2026-04-26", weekend: true,  today: false },
  { day: 6, label: "Sun 27 Apr", iso: "2026-04-27", weekend: true,  today: false },
];

// ============ CHANGEOVER MATRIX ============
// Allergen codes used in matrix grid — minimal subset per §15.2 seed
const PEXT_ALLERGEN_CODES = ["NONE","CEREAL","MILK","EGG","PEANUT","TREE","SOY","MUSTARD"];

// Matrix cell seed values (minutes). "BLKD" = segregation_required.
// Indexed as PEXT_MATRIX[from][to]
const PEXT_MATRIX = {
  NONE:    { NONE:0,  CEREAL:15, MILK:10, EGG:10, PEANUT:60,  TREE:"BLKD", SOY:15, MUSTARD:20 },
  CEREAL:  { NONE:20, CEREAL:0,  MILK:15, EGG:15, PEANUT:60,  TREE:"BLKD", SOY:15, MUSTARD:20 },
  MILK:    { NONE:25, CEREAL:20, MILK:0,  EGG:10, PEANUT:60,  TREE:"BLKD", SOY:20, MUSTARD:25 },
  EGG:     { NONE:20, CEREAL:15, MILK:10, EGG:0,  PEANUT:45,  TREE:"BLKD", SOY:15, MUSTARD:20 },
  PEANUT:  { NONE:90, CEREAL:90, MILK:90, EGG:90, PEANUT:0,   TREE:90,     SOY:90, MUSTARD:90 },
  TREE:    { NONE:"BLKD",CEREAL:"BLKD",MILK:"BLKD",EGG:"BLKD",PEANUT:90, TREE:0,      SOY:"BLKD", MUSTARD:"BLKD" },
  SOY:     { NONE:15, CEREAL:15, MILK:20, EGG:15, PEANUT:60,  TREE:"BLKD", SOY:0,  MUSTARD:20 },
  MUSTARD: { NONE:45, CEREAL:20, MILK:25, EGG:20, PEANUT:60,  TREE:"BLKD", SOY:20, MUSTARD:0  },
};

// Cells modified from seed (for blue-dot indicator)
const PEXT_MATRIX_MODIFIED = new Set(["CEREAL→MILK","MILK→CEREAL","MUSTARD→NONE"]);

// Per-line overrides
const PEXT_LINE_OVERRIDES = {
  "LINE-03": [
    { from: "CEREAL", to: "MILK", defaultMin: 15, overrideMin: 45, notes: "LINE-03 extended clean due to crumb residue" },
    { from: "EGG",    to: "CEREAL", defaultMin: 15, overrideMin: 25, notes: "Breading residue" },
    { from: "MILK",   to: "EGG", defaultMin: 10, overrideMin: 30, notes: "Breading line cross-contam" },
  ],
  "LINE-04": [
    { from: "MUSTARD", to: "NONE", defaultMin: 45, overrideMin: 60, notes: "Marinade vat rinse verification" },
  ],
};

// Version history
const PEXT_MATRIX_VERSIONS = [
  { v: "v5", active: true,  date: "2026-04-15", user: "Monika Nowak", notes: "Q2 2026 calibration — LINE-03 Breaded updated (+12 cells)", cellsChanged: 12 },
  { v: "v4", active: false, date: "2026-03-10", user: "Monika Nowak", notes: "Initial seed + Mustard addition after BRCGS audit", cellsChanged: 8 },
  { v: "v3", active: false, date: "2026-02-14", user: "m.krawczyk",   notes: "Post-audit correction — PEANUT pair times increased", cellsChanged: 6 },
  { v: "v2", active: false, date: "2026-01-10", user: "Monika Nowak", notes: "First production version", cellsChanged: 24 },
  { v: "v1", active: false, date: "2025-12-01", user: "system",       notes: "Automatic seed from allergen_cascade_rules",     cellsChanged: 0 },
];

// Matrix review requests (stub table per OQ-EXT-04)
const PEXT_MATRIX_REVIEWS = [
  { id: "MRR-0001", from: "PEANUT", to: "TREE", user: "Monika Nowak", when: "2026-04-20 14:22", status: "pending_admin", reason: "Process change — dedicated LINE-04 sanitization SOP now validated (SOP-0123). Request review to unblock this pair." },
  { id: "MRR-0002", from: "TREE",   to: "CEREAL", user: "m.krawczyk", when: "2026-04-18 09:12", status: "pending_admin", reason: "Cross-site validation shows 90min clean sufficient. Request admin unblock." },
];

// ============ DEMAND FORECASTS ============
const PEXT_FORECAST_STATUS = {
  source: "manual",
  lastUpload: "2026-04-18 11:34",
  lastUploadBy: "Monika Nowak",
  weeksCovered: 8,
  weekFrom: "2026-W17",
  weekTo:   "2026-W24",
  productsCovered: 42,
  p2Enabled: false,
};

// Weekly forecasts — 8-week horizon, sample of 10 products
const PEXT_FORECAST_WEEKS = ["2026-W17","2026-W18","2026-W19","2026-W20","2026-W21","2026-W22","2026-W23","2026-W24"];
const PEXT_FORECASTS = [
  { code: "FA5100", name: "Kiełbasa śląska pieczona 450g",        w: [1200, 1250, 1200, 1100, 1300, 1400, 1350, 1200], source: "manual" },
  { code: "FA5021", name: "Gulasz wołowy 350g",                    w: [ 520,  540,  500,  480,  520,  600,  550,  520], source: "manual" },
  { code: "FA5102", name: "Szynka wędzona plastry 150g",           w: [ 820,  800,  820,  790,  850,  900,  880,  820], source: "manual" },
  { code: "FA5301", name: "Pierogi z mięsem 400g",                 w: [ 780,  800,  820,  810,  780,  820,  850,  800], source: "manual" },
  { code: "FA5302", name: "Nuggetsy z kurczaka 500g",              w: [1040, 1080, 1020,  990, 1100, 1200, 1150, 1050], source: "manual" },
  { code: "FA5401", name: "Klopsiki w sosie pomidorowym 320g",      w: [ 980, 1000,  960,  940,  980, 1100, 1050,  980], source: "manual" },
  { code: "FA5022", name: "Bigos myśliwski 450g",                   w: [ 890,  900,  880,  860,  900, 1000,  950,  890], source: "overridden", overrideFrom: 820, overrideBy: "Monika Nowak", overrideDate: "2026-04-19" },
  { code: "FA5201", name: "Cooked Breast Strips 200g",              w: [ 420,  440,  420,  400,  430,  460,  450,  420], source: "prophet", smape: 12.4 },
  { code: "FA5400", name: "Filet sous-vide 180g",                   w: [ 650,  680,  650,  630,  660,  720,  700,  650], source: "prophet", smape: 18.2 },
  { code: "IN1301", name: "[INT] Farsz pierogowy mieszany",         w: [ 420,  440,  430,  420,  410,  440,  450,  430], source: "manual" },
];

// Forecaster health (P2)
const PEXT_FCST_HEALTH = {
  status: "healthy",
  lastRetrain: "2026-04-21 01:00 UTC",
  productsTrained: 42,
  duration: "12m 34s",
  smape30d: 14.2,
  staleDays: 0,
  degradedProducts: 2,
};

// ============ RUN HISTORY ============
// scheduler_runs — OPT-XXXX IDs, status converged|failed|partial|preview|discarded
const PEXT_RUNS = [
  { id: "OPT-0042", uuid: "018e5a42-7c4e-7b1a-9a3e-e4a1b2c3d4e5", started: "2026-04-21 06:12", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 42,  wos: 23, overrides: 2, coMinutes: 285, util: 92.3, status: "converged", type: "schedule", fallback: false },
  { id: "OPT-0041", uuid: "018e5a3e-6b2c-7c3d-8b1a-ff2a33445566", started: "2026-04-21 04:30", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 38,  wos: 22, overrides: 1, coMinutes: 305, util: 91.8, status: "converged", type: "schedule", fallback: false, superseded: true },
  { id: "OPT-0040", uuid: "018e5a3d-3a2b-7d4e-9c2b-112233445566", started: "2026-04-20 18:05", user: "m.krawczyk",   horizon: "7d", lines: "4/5", dur: 148, wos: 19, overrides: 0, coMinutes: 362, util: 78.4, status: "partial",   type: "schedule", fallback: false, error: "Solver timeout at 120s; 19 of 22 WOs assigned" },
  { id: "OPT-0039", uuid: "018e5a3c-8e1f-70a5-bb3c-aabbccddeeff", started: "2026-04-20 09:12", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 52,  wos: 24, overrides: 3, coMinutes: 298, util: 90.1, status: "converged", type: "schedule", fallback: false },
  { id: "OPT-0038", uuid: "018e5a3b-0c1d-72b6-ac4d-ddeeff001122", started: "2026-04-20 06:10", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 39,  wos: 21, overrides: 0, coMinutes: 320, util: 89.8, status: "converged", type: "schedule", fallback: true, fallbackRule: "allergen_sequencing_heuristic_v1" },
  { id: "OPT-0037", uuid: "018e5a3a-4f2e-7ac7-bd5e-332211009988", started: "2026-04-19 22:48", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 0,   wos: 0,  overrides: 0, coMinutes: 0,   util: 0,    status: "failed",    type: "schedule", fallback: false, error: "Solver service unreachable after 3 retries. Circuit breaker activated." },
  { id: "OPT-0036", uuid: "018e5a39-1d2c-7be8-ce6f-445566778899", started: "2026-04-19 10:05", user: "m.krawczyk",   horizon: "7d", lines: "3/5", dur: 85,  wos: 14, overrides: 0, coMinutes: 180, util: 85.5, status: "converged", type: "schedule", fallback: false },
  { id: "OPT-0035", uuid: "018e5a38-9a1b-7cf9-df70-556677889900", started: "2026-04-18 14:12", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 44,  wos: 26, overrides: 4, coMinutes: 340, util: 93.2, status: "converged", type: "schedule", fallback: false },
  { id: "OPT-0034", uuid: "018e5a37-7b2c-7d0a-e071-667788990011", started: "2026-04-18 06:10", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 41,  wos: 22, overrides: 1, coMinutes: 310, util: 90.4, status: "converged", type: "schedule", fallback: false },
  // Dry-run preview per §10.2 OQ-EXT-09
  { id: "OPT-0033", uuid: "018e5a36-5e3d-7e1b-f182-778899001122", started: "2026-04-18 03:20", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 38,  wos: 21, overrides: 0, coMinutes: 295, util: 89.0, status: "preview",   type: "dry_run",  fallback: false, expiresAt: "2026-04-19 03:20", note: "Dry-run (v2 preview — baseline comparison)" },
  { id: "OPT-0032", uuid: "018e5a35-2a4e-7f2c-0293-889900112233", started: "2026-04-17 19:55", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 46,  wos: 25, overrides: 2, coMinutes: 350, util: 88.9, status: "converged", type: "schedule", fallback: false },
  { id: "OPT-0031", uuid: "018e5a34-6f5a-7036-13a4-99aabbccdde0", started: "2026-04-17 11:02", user: "m.krawczyk",   horizon: "14d", lines: "5/5", dur: 72, wos: 38, overrides: 5, coMinutes: 620, util: 87.3, status: "converged", type: "schedule", fallback: false },
  { id: "OPT-0030", uuid: "018e5a33-3c6b-7147-24b5-aabbccdde0f1", started: "2026-04-17 06:13", user: "Monika Nowak", horizon: "7d", lines: "5/5", dur: 40,  wos: 22, overrides: 0, coMinutes: 305, util: 91.4, status: "converged", type: "schedule", fallback: false },
];

// Run history KPIs (top strip on Run History)
const PEXT_RUN_KPIS = [
  { k: "total_runs",  label: "Total runs",         value: "42",    accent: "blue",  sub: "13 this week" },
  { k: "avg_solve",   label: "Avg solve time",     value: "46s",   accent: "green", sub: "P95: 148s · Target <60s" },
  { k: "accept_rate", label: "Acceptance rate",    value: "87.4%", accent: "green", sub: "Target ≥85%" },
  { k: "override_rt", label: "Override rate",      value: "9.2%",  accent: "green", sub: "Target <15%" },
];

// Run detail — for OPT-0042
const PEXT_RUN_DETAIL = {
  id: "OPT-0042",
  uuid: "018e5a42-7c4e-7b1a-9a3e-e4a1b2c3d4e5",
  status: "converged",
  queuedAt:    "2026-04-21 06:11:58",
  startedAt:   "2026-04-21 06:12:04",
  completedAt: "2026-04-21 06:12:46",
  duration:    42,
  horizon:     "7d",
  lines:       ["LINE-01","LINE-02","LINE-03","LINE-04","LINE-05"],
  initiatedBy: "Monika Nowak",
  includeForecast: true,
  optimizerVersion: "allergen_sequencing_optimizer_v2",
  fallback: false,
  inputSnapshot: {
    woCount: 23,
    forecastWeekFrom: "2026-W17",
    forecastWeekTo:   "2026-W21",
    linesAvailability: { "LINE-01": "full", "LINE-02": "full", "LINE-03": "full", "LINE-04": "full", "LINE-05": "full" },
  },
  outputSummary: {
    scheduled: 23,
    total: 23,
    unscheduled: 0,
    coTotal: 285,
    coDelta: -20,
    utilAvg: 92.3,
    utilByLine: { "LINE-01": 88.0, "LINE-02": 94.5, "LINE-03": 96.2, "LINE-04": 85.1, "LINE-05": 97.8 },
    overrides: 2,
    fallback: false,
  },
  overrides: [
    { when: "2026-04-21 09:14", user: "Monika Nowak", wo: "WO-2026-0123", fa: "FA5022 Bigos myśliwski", from: { line: "LINE-02", shift: "A", time: "Mon 08:30" }, to:   { line: "LINE-02", shift: "B", time: "Mon 14:00" }, reason: "customer_priority", note: "Customer X delivery deadline brought forward by 4 hours" },
    { when: "2026-04-21 10:02", user: "m.krawczyk",   wo: "WO-2026-0128", fa: "FA5402 Pikantne skrzydełka", from: { line: "LINE-04", shift: "A", time: "Tue 08:00" }, to: { line: "LINE-04", shift: "A", time: "Tue 14:00" }, reason: "capacity_constraint", note: "LINE-04 MUSTARD→PEANUT CO requires 120min — defer start to allow full cleaning window" },
  ],
};

// ============ SCENARIOS (what-if, P2 preview UI) ============
const PEXT_SCENARIOS = [
  { id: "SCN-0089", name: "LINE-03 down 8h Wed 22 Apr", baseline: "OPT-0042", createdBy: "Monika Nowak", createdAt: "2026-04-21 09:45", type: "conservative", keyDelta: "+60 CO min / −3% util", modCount: 1, status: "saved" },
  { id: "SCN-0088", name: "Urgent customer X insert (Kiełbasa +500kg)", baseline: "OPT-0042", createdBy: "Monika Nowak", createdAt: "2026-04-21 08:30", type: "aggressive",   keyDelta: "−45 CO min / +4% util", modCount: 2, status: "saved" },
  { id: "SCN-0087", name: "Q2 shift B capacity +20%", baseline: "OPT-0041", createdBy: "m.krawczyk",     createdAt: "2026-04-20 15:12", type: "balanced",     keyDelta: "−120 CO min / +7% util", modCount: 1, status: "saved" },
  { id: "SCN-0086", name: "Remove PEANUT products from LINE-04", baseline: "OPT-0040", createdBy: "Monika Nowak", createdAt: "2026-04-19 11:40", type: "conservative", keyDelta: "−180 CO min / +2% util", modCount: 3, status: "archived" },
];

// Active scenario (for side-by-side view)
const PEXT_ACTIVE_SCENARIO = {
  id: "SCN-0089",
  name: "LINE-03 down 8h Wed 22 Apr",
  baseline: "OPT-0042",
  modifications: [
    { type: "line_down", line: "LINE-03", startTime: "Wed 22 Apr 06:00", durationHrs: 8, label: "LINE-03 down 08:00 Wed 22 Apr (8h)" },
  ],
  simulation: {
    coTotal: 345, util: 89.3, overdue: 5, unscheduled: 1,
  },
  baselineSnapshot: {
    coTotal: 285, util: 92.3, overdue: 2, unscheduled: 0,
  },
  deltaBadges: {
    co: { text: "+60 min", cls: "badge-red" },
    util: { text: "−3.0%", cls: "badge-amber" },
    overdue: { text: "+3", cls: "badge-red" },
    unscheduled: { text: "+1", cls: "badge-amber" },
  },
};

// Scenario presets (quick launch)
const PEXT_SCENARIO_PRESETS = [
  { key: "line_down",       label: "Line down 8h",          ic: "⚒", desc: "Model an unplanned line breakdown" },
  { key: "urgent_insert",   label: "Urgent customer WO",    ic: "⚡", desc: "Inject an ad-hoc priority WO" },
  { key: "capacity_boost",  label: "Shift capacity +20%",   ic: "↑", desc: "Model extended shift hours" },
  { key: "capacity_cut",    label: "Shift capacity −20%",   ic: "↓", desc: "Model absentee shift coverage" },
  { key: "remove_allergen", label: "Remove allergen bucket",ic: "⊘", desc: "Exclude a whole allergen family" },
];

// ============ SEQUENCING v2 (§10) ============
const PEXT_SEQUENCING_V2 = {
  enabled: true,
  ruleId: "allergen_sequencing_optimizer_v2",
  fallback: "allergen_sequencing_heuristic_v1",
  totalCoMinutes: 285,
  baselineCoMinutes: 410,
  savingPct: 30.5,
  crossLineMovedCount: 4,
};

// Baseline vs proposed sequence (for dry-run preview)
const PEXT_SEQ_BASELINE = [
  { rank: 1, wo: "WO-2026-0108", fa: "FA5100 Kiełbasa śląska", line: "LINE-01", allergen: "CEREAL+MILK", coBefore: 0 },
  { rank: 2, wo: "WO-2026-0111", fa: "FA5021 Gulasz wołowy", line: "LINE-02", allergen: "NONE", coBefore: 0 },
  { rank: 3, wo: "WO-2026-0113", fa: "FA5301 Pierogi z mięsem", line: "LINE-03", allergen: "CEREAL+EGG", coBefore: 0 },
  { rank: 4, wo: "WO-2026-0120", fa: "FA5401 Klopsiki", line: "LINE-04", allergen: "MUSTARD", coBefore: 0 },
  { rank: 5, wo: "WO-2026-0128", fa: "FA5402 Pikantne skrzydełka", line: "LINE-04", allergen: "PEANUT", coBefore: 90 },
  { rank: 6, wo: "WO-2026-0126", fa: "FA5302 Nuggetsy", line: "LINE-03", allergen: "CEREAL+EGG", coBefore: 45 },
  { rank: 7, wo: "WO-2026-0127", fa: "FA5303 Kotlety panier.", line: "LINE-03", allergen: "CEREAL+EGG+MILK", coBefore: 30 },
  { rank: 8, wo: "WO-2026-0115", fa: "FA5400 Filet sous-vide", line: "LINE-01", allergen: "NONE", coBefore: 25 },
];
const PEXT_SEQ_PROPOSED = [
  { rank: 1, wo: "WO-2026-0108", fa: "FA5100 Kiełbasa śląska", line: "LINE-01", allergen: "CEREAL+MILK", coBefore: 0,  moved: false },
  { rank: 2, wo: "WO-2026-0115", fa: "FA5400 Filet sous-vide", line: "LINE-01", allergen: "NONE", coBefore: 25,  moved: false },
  { rank: 3, wo: "WO-2026-0111", fa: "FA5021 Gulasz wołowy", line: "LINE-02", allergen: "NONE", coBefore: 0, moved: false },
  { rank: 4, wo: "WO-2026-0113", fa: "FA5301 Pierogi z mięsem", line: "LINE-03", allergen: "CEREAL+EGG", coBefore: 0, moved: false },
  { rank: 5, wo: "WO-2026-0126", fa: "FA5302 Nuggetsy", line: "LINE-03", allergen: "CEREAL+EGG", coBefore: 0,  moved: false },
  { rank: 6, wo: "WO-2026-0127", fa: "FA5303 Kotlety panier.", line: "LINE-03", allergen: "CEREAL+EGG+MILK", coBefore: 10, moved: false },
  { rank: 7, wo: "WO-2026-0120", fa: "FA5401 Klopsiki", line: "LINE-04", allergen: "MUSTARD", coBefore: 0, moved: false },
  { rank: 8, wo: "WO-2026-0128", fa: "FA5402 Pikantne skrzydełka", line: "LINE-04", allergen: "PEANUT", coBefore: 60, moved: true, savingMin: 30 },
];

// ============ SETTINGS / RULE REGISTRY (referenced screens) ============
const PEXT_RULES = [
  { id: "finite_capacity_solver_v1", title: "Finite-capacity solver (v1)", owner: "Dev", status: "active", phase: "P1", desc: "Two-phase solver: greedy by deadline/allergen/priority + local-search refine. FastAPI microservice wrapped in DSL rule.", lastInvoked: "2026-04-21 06:12", invokes7d: 13 },
  { id: "allergen_sequencing_optimizer_v2", title: "Allergen sequencing optimizer (v2)", owner: "Dev", status: "active", phase: "P1", desc: "Objective function component: per-pair changeover_matrix × penalty_weight. Minimized across all lines.", lastInvoked: "2026-04-21 06:12", invokes7d: 13 },
  { id: "allergen_sequencing_heuristic_v1", title: "Allergen heuristic (v1 fallback)", owner: "Dev", status: "standby", phase: "P1", desc: "Inherited from 04-PLANNING-BASIC. Used when v2 throws.", lastInvoked: "2026-04-20 06:10", invokes7d: 1 },
  { id: "forecast_driven_po_trigger_v1", title: "Forecast-driven PO trigger (P2)", owner: "Dev", status: "disabled", phase: "P2", desc: "Consumes scheduler.forecast.uploaded event; generates draft POs via 04-PLAN §5.", lastInvoked: null, invokes7d: 0 },
  { id: "disposition_bridge_v1", title: "Disposition bridge (P2)", owner: "Dev", status: "disabled", phase: "P2", desc: "Handles items.intermediate_disposition_mode = 'planner_decides'.", lastInvoked: null, invokes7d: 0 },
];

// Feature flags
const PEXT_FLAGS = [
  { key: "planning.allergen_optimizer.v2.enabled", on: true,  desc: "Turns on v2 allergen optimizer in sequencing view and solver runs", phase: "P1" },
  { key: "scheduler.what_if.enabled",              on: false, desc: "Enables full What-if Simulation screen (P2)", phase: "P2" },
  { key: "scheduler.horizon_14d.enabled",          on: false, desc: "Allows 14-day horizon option in Run Scheduler Modal", phase: "P2" },
  { key: "scheduler.prophet.enabled",              on: false, desc: "Enables Prophet ML forecaster + health dashboard", phase: "P2" },
  { key: "scheduler.auto_approve.enabled",         on: false, desc: "Auto-approves assignments if score ≥95 and no conflicts", phase: "P2" },
  { key: "scheduler.disposition_bridge.enabled",   on: false, desc: "Unlocks direct_continue + planner_decides disposition modes", phase: "P2" },
];

// Capacity projection (per-line, per-day, %)
const PEXT_CAPACITY_PROJECTION = [
  { line: "LINE-01", day: 0, pct: 82 },
  { line: "LINE-01", day: 1, pct: 68 },
  { line: "LINE-01", day: 2, pct: 62 },
  { line: "LINE-01", day: 3, pct: 79 },
  { line: "LINE-02", day: 0, pct: 99 },
  { line: "LINE-02", day: 1, pct: 75 },
  { line: "LINE-02", day: 2, pct: 91 },
  { line: "LINE-03", day: 1, pct: 93 },
  { line: "LINE-03", day: 2, pct: 104 },
  { line: "LINE-04", day: 0, pct: 88 },
  { line: "LINE-04", day: 1, pct: 62 },
  { line: "LINE-05", day: 0, pct: 50 },
];

// ============ MODAL CATALOG (used by gallery) — 12 modals ============
// (definitions live in modals.jsx; catalog is referenced from there too.)

Object.assign(window, {
  PEXT_NAV, PEXT_KPIS, PEXT_LAST_RUN, PEXT_ALERTS,
  PEXT_LINES, PEXT_ALLERGEN_COLORS, PEXT_ASSIGNMENTS, PEXT_COBLOCKS, PEXT_MAINT_BLOCKS, PEXT_DATES,
  PEXT_ALLERGEN_CODES, PEXT_MATRIX, PEXT_MATRIX_MODIFIED, PEXT_LINE_OVERRIDES, PEXT_MATRIX_VERSIONS, PEXT_MATRIX_REVIEWS,
  PEXT_FORECAST_STATUS, PEXT_FORECAST_WEEKS, PEXT_FORECASTS, PEXT_FCST_HEALTH,
  PEXT_RUNS, PEXT_RUN_KPIS, PEXT_RUN_DETAIL,
  PEXT_SCENARIOS, PEXT_ACTIVE_SCENARIO, PEXT_SCENARIO_PRESETS,
  PEXT_SEQUENCING_V2, PEXT_SEQ_BASELINE, PEXT_SEQ_PROPOSED,
  PEXT_RULES, PEXT_FLAGS, PEXT_CAPACITY_PROJECTION,
});
