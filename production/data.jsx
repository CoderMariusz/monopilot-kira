// ============ Production module data ============

const PROD_NAV = [
  { group: "Operations", items: [
    { key: "dashboard", label: "Dashboard", ic: "◆", hero: true },
    { key: "wos", label: "Work Orders", ic: "▦", count: "14" },
    { key: "lines", label: "Lines", ic: "▥", count: "5" },
  ]},
  { group: "Execution", items: [
    { key: "oee", label: "OEE", ic: "◉" },
    { key: "downtime", label: "Downtime", ic: "⏱", count: "3" },
    { key: "shifts", label: "Shifts", ic: "⎔" },
  ]},
  { group: "Quality gates", items: [
    { key: "changeover", label: "Allergen changeover", ic: "⚠", count: "1" },
    { key: "waste", label: "Waste analytics", ic: "◐" },
  ]},
  { group: "Reporting", items: [
    { key: "analytics", label: "Analytics hub", ic: "📈" },
    { key: "dlq", label: "D365 DLQ", ic: "⇅", count: "2" },
    { key: "settings", label: "Production settings", ic: "⚙" },
  ]},
  { group: "Admin", items: [
    { key: "gallery", label: "Modal gallery", ic: "▦" },
  ]},
];

// ----- Lines -----
const LINES = [
  { id: "LINE-01", name: "Line 1 — Cured meats", status: "running", operator: "M. Szymczak", opInit: "MS",
    wo: "WO-2026-0042", woItem: "FA5100", woName: "Kiełbasa śląska pieczona 450g",
    consumed: 650, planned: 1011, elapsed: "2h 15m", plannedTotal: "3h",
    yield: 96.2, waste: 0.8, downtime: 12,
    nextWo: "WO-2026-0043", nextItem: "FA5102", nextIn: "45m", nextAllergen: true,
  },
  { id: "LINE-02", name: "Line 2 — Ready meals", status: "down", operator: "K. Nowacki", opInit: "KN",
    wo: "WO-2026-0038", woItem: "FA5021", woName: "Gulasz wołowy 350g",
    consumed: 440, planned: 1200, elapsed: "1h 48m", plannedTotal: "4h",
    yield: 88.4, waste: 2.1, downtime: 23,
    downReason: "Machine fault — mixer M-002 jam",
    downSince: "10:22",
    nextWo: "WO-2026-0051", nextItem: "FA5023", nextIn: "2h 10m",
  },
  { id: "LINE-03", name: "Line 3 — Deli", status: "running", operator: "A. Majewska", opInit: "AM",
    wo: "WO-2026-0040", woItem: "FA5200", woName: "Pasztet drobiowy z żurawiną 180g",
    consumed: 380, planned: 500, elapsed: "3h 02m", plannedTotal: "3h 30m",
    yield: 94.1, waste: 1.2, downtime: 4,
    nextWo: "WO-2026-0047", nextItem: "FA5201", nextIn: "1h 20m",
  },
  { id: "LINE-04", name: "Line 4 — Pierogi", status: "changeover", operator: "P. Kowalski", opInit: "PK",
    wo: "WO-2026-0041", woItem: "FA5301", woName: "Pierogi z mięsem 400g",
    consumed: 0, planned: 800, elapsed: "0h 12m", plannedTotal: "4h 30m",
    yield: 0, waste: 0, downtime: 0,
    changeoverInfo: "Allergen changeover — awaiting dual sign-off",
    nextWo: "—", nextItem: "—", nextIn: "—",
  },
  { id: "LINE-05", name: "Line 5 — Sous-vide", status: "idle", operator: "—", opInit: "—",
    wo: "", woItem: "", woName: "",
    consumed: 0, planned: 0, elapsed: "", plannedTotal: "",
    yield: 0, waste: 0, downtime: 0,
    nextWo: "WO-2026-0049", nextItem: "FA5401", nextIn: "18m",
  },
];

// ----- Work orders -----
const WOS = [
  { id: "WO-2026-0042", line: "LINE-01", item: "FA5100", name: "Kiełbasa śląska pieczona 450g", status: "in_progress",
    planned: 1011, consumed: 650, output: 0, outputTarget: 1000, startedAt: "06:12", plannedEnd: "09:30" },
  { id: "WO-2026-0043", line: "LINE-01", item: "FA5102", name: "Szynka wędzona plastry 150g", status: "ready",
    planned: 800, consumed: 0, output: 0, outputTarget: 690, startedAt: "—", plannedEnd: "13:00", allergenGate: true },
  { id: "WO-2026-0038", line: "LINE-02", item: "FA5021", name: "Gulasz wołowy 350g (słoik)", status: "paused",
    planned: 1200, consumed: 440, output: 0, outputTarget: 1056, startedAt: "05:45", plannedEnd: "10:15" },
  { id: "WO-2026-0040", line: "LINE-03", item: "FA5200", name: "Pasztet drobiowy z żurawiną 180g", status: "in_progress",
    planned: 500, consumed: 380, output: 260, outputTarget: 470, startedAt: "04:30", plannedEnd: "08:00" },
  { id: "WO-2026-0041", line: "LINE-04", item: "FA5301", name: "Pierogi z mięsem 400g", status: "ready",
    planned: 800, consumed: 0, output: 0, outputTarget: 712, startedAt: "—", plannedEnd: "12:00" },
  { id: "WO-2026-0039", line: "LINE-05", item: "FA5400", name: "Filet z kurczaka sous-vide 180g", status: "completed",
    planned: 600, consumed: 612, output: 558, outputTarget: 558, startedAt: "2026-04-19 22:10", plannedEnd: "—" },
  { id: "WO-2026-0047", line: "LINE-03", item: "FA5201", name: "Pasztet cielęcy 180g", status: "ready",
    planned: 420, consumed: 0, output: 0, outputTarget: 395, startedAt: "—", plannedEnd: "12:40" },
  { id: "WO-2026-0051", line: "LINE-02", item: "FA5023", name: "Klopsiki w sosie pomidorowym 320g", status: "draft",
    planned: 900, consumed: 0, output: 0, outputTarget: 810, startedAt: "—", plannedEnd: "15:30" },
];

// ----- Detail WO (WO-2026-0042) -----
const WO_DETAIL = {
  id: "WO-2026-0042", code: "WO-2026-0042", item: "FA5100", name: "Kiełbasa śląska pieczona 450g",
  status: "in_progress", statusLabel: "In Progress",
  bomVersion: "v7", bomSnapshot: "BOM v7 · snapshot immutable",
  plannedQty: 1011, unit: "kg", line: "LINE-01 — Cured meats", lineCode: "LINE-01",
  shift: "A — 06:00–14:00", operator: "M. Szymczak (MS)",
  plannedStart: "2026-04-20 06:00", plannedEnd: "2026-04-20 09:30",
  actualStart: "2026-04-20 06:12", elapsed: "2h 14m", totalPause: "3m",
  allergens: "No allergens — Halal line",
  weightMode: "fixed",
  consumed: 650, output: 0, outputTarget: 1000,
  meatPct: 72.41,
  bomComponents: [
    { code: "R-1001", name: "Wieprzowina kl. II (łopatka)", uom: "kg", planned: 540, consumed: 358, remaining: 182, fefo: "ok", over: 0, meatPct: 96 },
    { code: "R-1002", name: "Słonina wieprzowa", uom: "kg", planned: 220, consumed: 148, remaining: 72, fefo: "ok", over: 0, meatPct: 0 },
    { code: "R-1201", name: "Sól peklująca (PP)", uom: "kg", planned: 18, consumed: 12.4, remaining: 5.6, fefo: "ok", over: 0 },
    { code: "R-1202", name: "Woda technologiczna", uom: "kg", planned: 40, consumed: 30, remaining: 10, fefo: "—", over: 0, auto: true },
    { code: "R-2101", name: "Pieprz czarny mielony", uom: "kg", planned: 6, consumed: 4.2, remaining: 1.8, fefo: "deviation", over: 0, deviationNote: "consumed LP-5582 exp 2026-06 instead of FEFO LP-5501 exp 2026-05 · damaged packaging" },
    { code: "R-2102", name: "Czosnek granulowany", uom: "kg", planned: 3, consumed: 2.1, remaining: 0.9, fefo: "ok", over: 0 },
    { code: "R-3001", name: "Osłonka Ø26 (Viscofan)", uom: "m", planned: 184, consumed: 128, remaining: 56, fefo: "ok", over: 52, overPending: true, overReason: "Rework — 2 batches re-extruded" },
  ],
  consumedLPs: [
    { lp: "LP-4431", component: "R-1001", qty: 220.5, time: "06:14:22", operator: "MS", fefo: true },
    { lp: "LP-4432", component: "R-1001", qty: 137.5, time: "06:31:08", operator: "MS", fefo: true },
    { lp: "LP-4470", component: "R-1002", qty: 148.0, time: "06:18:44", operator: "MS", fefo: true },
    { lp: "LP-5582", component: "R-2101", qty: 4.2, time: "07:02:11", operator: "MS", fefo: false, reason: "damaged packaging" },
  ],
  outputs: [
    { type: "primary", lp: "LP-9001", item: "FA5100", qty: 0, batch: "WO-2026-0042-OUT-001", expiry: "—", qa: "pending", label: false },
  ],
  coProducts: [
    { code: "FA5100-CO1", name: "Wędzonka wieprzowa trim", alloc: 8, expected: 80.9, registered: 0 },
  ],
  byProducts: [
    { code: "FA5100-BP1", name: "Tłuszcz odcedzony", alloc: 3, expected: 30.3, registered: 0 },
  ],
  downtimeOnWo: [
    { t: "06:44", category: "Process — Material wait", duration: 6, reason: "casings delayed from warehouse", operator: "MS" },
  ],
  wasteLog: [
    { t: "07:18", category: "Trim", qty: 3.2, operator: "MS", reason: "Casings cut loss" },
    { t: "06:48", category: "Spillage", qty: 0.4, operator: "MS", reason: "Slip on conveyor" },
  ],
  history: [
    { t: "06:12:02", actor: "M. Szymczak", event: "WO STARTED", tx: "tx_7f1a..." },
    { t: "06:14:22", actor: "scanner", event: "LP-4431 consumed · R-1001 · 220.5 kg", tx: "tx_7f1b..." },
    { t: "06:18:44", actor: "scanner", event: "LP-4470 consumed · R-1002 · 148.0 kg", tx: "tx_7f1c..." },
    { t: "06:31:08", actor: "scanner", event: "LP-4432 consumed · R-1001 · 137.5 kg", tx: "tx_7f1d..." },
    { t: "06:48:01", actor: "M. Szymczak", event: "Waste 0.4 kg · Spillage", tx: "tx_7f1e..." },
    { t: "07:02:11", actor: "scanner", event: "LP-5582 consumed · R-2101 · 4.2 kg · FEFO DEVIATION", tx: "tx_7f1f..." },
    { t: "07:02:25", actor: "M. Szymczak", event: "FEFO deviation reason: damaged packaging", tx: "tx_7f20..." },
    { t: "07:18:22", actor: "M. Szymczak", event: "Waste 3.2 kg · Trim", tx: "tx_7f21..." },
    { t: "07:44:03", actor: "scanner", event: "Over-consumption R-3001 +52 m · awaiting Shift Lead approval", tx: "tx_7f22..." },
  ],
};

// ----- Recent events feed -----
const EVENTS_FEED = [
  { t: "08:26", color: "blue", desc: "WO-2026-0047 READY on LINE-03 · FA5201", sub: "Released from planning" },
  { t: "08:22", color: "red", desc: "LINE-02 DOWN · Machine fault mixer M-002", sub: "Auto-paused WO-2026-0038" },
  { t: "08:14", color: "green", desc: "WO-2026-0039 COMPLETED on LINE-05 · 558 kg output", sub: "D365 push enqueued" },
  { t: "08:02", color: "amber", desc: "Over-consumption R-3001 +52m on WO-2026-0042", sub: "Shift Lead approval needed" },
  { t: "07:58", color: "violet", desc: "Allergen changeover started on LINE-04", sub: "FA5301 → FA5302 · medium risk" },
  { t: "07:44", color: "blue", desc: "Catch-weight capture · LP-8821 · 2.47 kg actual", sub: "WO-2026-0040" },
  { t: "07:32", color: "green", desc: "QA PASSED · LP-8820 · sample 12 of 12", sub: "WO-2026-0040" },
  { t: "07:02", color: "amber", desc: "FEFO deviation on WO-2026-0042 · R-2101", sub: "Reason: damaged packaging" },
  { t: "06:45", color: "red", desc: "QA HOLD · LP-8802 · protein 24.1% < spec 24.5%", sub: "WO-2026-0040 · resolved" },
  { t: "06:30", color: "blue", desc: "Shift A signed in · M. Szymczak + 3 ops", sub: "All 5 lines covered" },
  { t: "06:12", color: "blue", desc: "WO-2026-0042 STARTED on LINE-01", sub: "Op: M. Szymczak" },
];

// ----- OEE per line -----
const OEE_LINES = [
  { line: "LINE-01", wo: "WO-2026-0042", status: "running", a: 95, p: 92, q: 98, oee: 85.7 },
  { line: "LINE-02", wo: "WO-2026-0038", status: "down", a: 65, p: 82, q: 98, oee: 52.3 },
  { line: "LINE-03", wo: "WO-2026-0040", status: "running", a: 98, p: 94, q: 100, oee: 92.1 },
  { line: "LINE-04", wo: "WO-2026-0041", status: "changeover", a: 80, p: 0, q: 100, oee: 0 },
  { line: "LINE-05", wo: "—", status: "idle", a: 0, p: 0, q: 0, oee: 0 },
];

// ----- Downtime events -----
const DOWNTIME = [
  { t: "2026-04-20 10:22", line: "LINE-02", wo: "WO-2026-0038", cat: "Plant — Breakdown", group: "plant", source: "wo_pause", dur: null, duration: 23, reason: "Mixer M-002 auger jam — cleaning required", by: "K. Nowacki" },
  { t: "2026-04-20 09:14", line: "LINE-04", wo: "—", cat: "Process — Changeover", group: "process", source: "manual", duration: 32, reason: "Allergen changeover FA5301 → FA5302", by: "P. Kowalski" },
  { t: "2026-04-20 07:38", line: "LINE-03", wo: "WO-2026-0040", cat: "People — Operator break", group: "people", source: "manual", duration: 12, reason: "Statutory break", by: "A. Majewska" },
  { t: "2026-04-20 06:44", line: "LINE-01", wo: "WO-2026-0042", cat: "Process — Material wait", group: "process", source: "wo_pause", duration: 6, reason: "Casings delayed from warehouse", by: "M. Szymczak" },
  { t: "2026-04-19 22:10", line: "LINE-02", wo: "WO-2026-0037", cat: "Plant — Cleaning", group: "plant", source: "manual", duration: 45, reason: "End-of-shift CIP", by: "J. Dudek" },
  { t: "2026-04-19 18:02", line: "LINE-04", wo: "WO-2026-0036", cat: "Plant — Breakdown", group: "plant", source: "wo_pause", duration: 78, reason: "Sealing head temperature fault", by: "P. Kowalski" },
];

// ----- Pareto categories -----
const PARETO = [
  { cat: "Plant — Breakdown", group: "plant", min: 312, events: 8 },
  { cat: "Process — Changeover", group: "process", min: 188, events: 11 },
  { cat: "Plant — Cleaning", group: "plant", min: 145, events: 6 },
  { cat: "People — Break", group: "people", min: 96, events: 14 },
  { cat: "Process — Material wait", group: "process", min: 72, events: 9 },
  { cat: "People — Training", group: "people", min: 34, events: 3 },
];

// ----- Shift crew -----
const SHIFT_CREW = [
  { line: "LINE-01", operator: "M. Szymczak", start: "06:00", status: "active", init: "MS", color: "av-blue" },
  { line: "LINE-02", operator: "K. Nowacki", start: "06:00", status: "active", init: "KN", color: "av-green" },
  { line: "LINE-03", operator: "A. Majewska", start: "06:00", status: "active", init: "AM", color: "av-amber" },
  { line: "LINE-04", operator: "P. Kowalski", start: "06:08", status: "break", init: "PK", color: "av-violet" },
  { line: "LINE-05", operator: "—", start: "—", status: "unassigned", init: "—", color: "" },
];

// ----- DLQ events -----
const DLQ = [
  { wo: "WO-2026-0029", event: "wo.completed", err: "D365 JournalLines 409 — period closed", attempts: "5/5", movedAt: "2026-04-20 03:14", lastErr: "2026-04-20 03:42", nextRetry: "—", status: "open" },
  { wo: "WO-2026-0031", event: "wo.completed", err: "D365 HTTP 503 Service Unavailable", attempts: "4/5", movedAt: "2026-04-20 05:01", lastErr: "2026-04-20 05:09", nextRetry: "08:40", status: "open" },
  { wo: "WO-2026-0027", event: "wo.completed", err: "Schema validation — missing meat_pct", attempts: "5/5", movedAt: "2026-04-19 21:03", lastErr: "2026-04-19 21:33", nextRetry: "—", status: "resolved" },
];

// OEE sparkline data
const SPARK_OEE = [72, 75, 74, 78, 80, 76, 72, 70, 73, 78, 82, 84, 81, 79, 76, 74, 78, 82, 85, 83, 80, 77, 79, 82];

// ----- Waste analytics (PROD-010) -----
// Waste by category (Pareto)
const WASTE_PARETO = [
  { cat: "Trim", kg: 184.2, pct: 38, events: 42, group: "process" },
  { cat: "Spillage", kg: 96.5, pct: 20, events: 28, group: "people" },
  { cat: "Out-of-spec", kg: 82.1, pct: 17, events: 9, group: "plant" },
  { cat: "Packaging", kg: 54.6, pct: 11, events: 18, group: "process" },
  { cat: "Expired", kg: 38.0, pct: 8, events: 5, group: "plant" },
  { cat: "Rework scrap", kg: 28.4, pct: 6, events: 7, group: "process" },
];

// Waste trend — daily % of consumed, last 14 days
const WASTE_TREND = [1.9, 2.1, 1.8, 1.5, 1.7, 1.6, 1.4, 1.6, 1.8, 1.3, 1.5, 1.7, 1.4, 1.1];

// Waste events table
const WASTE_EVENTS = [
  { t: "2026-04-20 11:04", line: "LINE-01", wo: "WO-2026-0042", cat: "Trim", qty: 3.2, operator: "M. Szymczak", reason: "Casing cut loss" },
  { t: "2026-04-20 10:48", line: "LINE-02", wo: "WO-2026-0038", cat: "Spillage", qty: 0.8, operator: "K. Nowacki", reason: "Conveyor belt misalign" },
  { t: "2026-04-20 10:22", line: "LINE-03", wo: "WO-2026-0040", cat: "Packaging", qty: 1.2, operator: "A. Majewska", reason: "Film roll tear" },
  { t: "2026-04-20 09:58", line: "LINE-04", wo: "WO-2026-0041", cat: "Out-of-spec", qty: 4.6, operator: "P. Kowalski", reason: "Meat-pct 70.2% < target 72%" },
  { t: "2026-04-20 08:44", line: "LINE-01", wo: "WO-2026-0042", cat: "Spillage", qty: 0.4, operator: "M. Szymczak", reason: "Slip on conveyor" },
  { t: "2026-04-20 07:18", line: "LINE-01", wo: "WO-2026-0042", cat: "Trim", qty: 3.2, operator: "M. Szymczak", reason: "Casings cut loss" },
  { t: "2026-04-20 06:48", line: "LINE-01", wo: "WO-2026-0042", cat: "Spillage", qty: 0.4, operator: "M. Szymczak", reason: "Slip on conveyor" },
  { t: "2026-04-19 22:44", line: "LINE-05", wo: "WO-2026-0039", cat: "Rework scrap", qty: 2.1, operator: "J. Dudek", reason: "Sous-vide under-seal × 14 packs" },
];

// Waste by line
const WASTE_BY_LINE = [
  { line: "LINE-01", consumed: 4820, waste: 38.2, pct: 0.79, target: 1.5 },
  { line: "LINE-02", consumed: 2440, waste: 82.1, pct: 3.36, target: 1.5 },
  { line: "LINE-03", consumed: 3120, waste: 42.0, pct: 1.35, target: 1.5 },
  { line: "LINE-04", consumed: 1680, waste: 56.4, pct: 3.36, target: 1.5 },
  { line: "LINE-05", consumed: 960, waste: 12.8, pct: 1.33, target: 1.5 },
];

// ----- Line detail (PROD-013, LINE-01) -----
const LINE_DETAIL = {
  id: "LINE-01",
  name: "Line 1 — Cured meats",
  status: "running",
  operator: "M. Szymczak",
  opInit: "MS",
  shift: "A — 06:00–14:00",
  activeWo: "WO-2026-0042",
  activeWoItem: "FA5100 · Kiełbasa śląska pieczona 450g",
  todayOutput: 992,
  todayTarget: 1011,
  yieldRolling: [94.1, 95.2, 96.0, 96.2, 95.8, 96.4, 96.2],
  oeeA: 95, oeeP: 92, oeeQ: 98, oee: 85.7,
  nextWo: "WO-2026-0043",
  nextIn: "45m",
  events: [
    { t: "08:26", kind: "info", desc: "Shift lead ping · MS", sub: "1 min ago" },
    { t: "08:02", kind: "amber", desc: "Over-consumption R-3001 +52m", sub: "Awaiting approval" },
    { t: "07:44", kind: "blue", desc: "Catch-weight capture · LP-8821 · 2.47 kg", sub: "Unit 12 of 24" },
    { t: "07:18", kind: "amber", desc: "Waste 3.2 kg · Trim", sub: "Casings cut loss" },
    { t: "07:02", kind: "red", desc: "FEFO deviation · R-2101", sub: "Damaged packaging" },
    { t: "06:48", kind: "amber", desc: "Waste 0.4 kg · Spillage", sub: "Slip on conveyor" },
    { t: "06:31", kind: "blue", desc: "LP-4432 consumed · R-1001 · 137.5 kg", sub: "Scanner MS" },
    { t: "06:18", kind: "blue", desc: "LP-4470 consumed · R-1002 · 148.0 kg", sub: "Scanner MS" },
    { t: "06:14", kind: "blue", desc: "LP-4431 consumed · R-1001 · 220.5 kg", sub: "Scanner MS" },
    { t: "06:12", kind: "green", desc: "WO-2026-0042 STARTED", sub: "Operator M. Szymczak" },
  ],
  downtimeEvents: [
    { t: "06:44", cat: "Process — Material wait", duration: 6, reason: "Casings delayed from warehouse" },
  ],
  shiftLog: [
    { t: "06:00", actor: "M. Szymczak", event: "Shift A sign-in · PIN ✓" },
    { t: "06:04", actor: "M. Szymczak", event: "Handover note from J. Dudek (Shift C) reviewed" },
    { t: "06:12", actor: "M. Szymczak", event: "WO-2026-0042 started" },
    { t: "07:02", actor: "M. Szymczak", event: "FEFO deviation accepted — reason logged" },
    { t: "07:44", actor: "scanner", event: "Over-consumption flagged — escalated" },
    { t: "08:02", actor: "M. Szymczak", event: "Over-consumption reason: Rework, 2 re-extruded" },
  ],
};

// ----- Dashboard KPIs (PROD-001 spec) -----
// Audit Fix-5b: 6 KPIs replace the prior derived-from-LINES KPI set.
// Match UX spec PROD-001 §1: WOs in progress · Output vs target today ·
// OEE current shift · Downtime last 24h · QA Holds active · Next changeover.
const DASHBOARD_KPIS = {
  woInProgress: { value: 3, of: 5, sub: "1 paused · 1 changeover · idle on LINE-05" },
  outputVsTarget: { value: 91, sub: "3 842 / 4 211 kg", tone: "green" },
  oeeShift: { value: 76.2, a: 85, p: 88, q: 99 },
  downtime24h: { value: "4h 18m", sub: "14 events · plant 58% · oldest 6h", tone: "amber" },
  qaHolds: { value: 2, sub: "1 on WO-2026-0040 · 1 on WO-2026-0038", tone: "red" },
  nextChangeover: { value: "LINE-04", sub: "in 22m · FA5302 → FA5304 · allergen gate" },
};

// ----- QA Results (per WO, for WO Detail QA Results tab) -----
// Audit Fix-5b: new data model for SCR-08-02 Tab 6 (QA Results).
// References 09-QUALITY qa_inspections. 08-PRODUCTION shows the linked
// CCP results + hold status for the active WO.
const WO_QA_RESULTS = [
  { id: "QA-00142", t: "07:32", sample: "LP-9001", test_type: "weight_compliance", target: "450 g ±5%", result: "451.2 g", status: "pass", inspector: "A. Majewska", method: "auto checkweigher" },
  { id: "QA-00140", t: "07:14", sample: "LP-9001", test_type: "metal_detection", target: "Fe ≤ 2.0mm · NFe ≤ 2.5mm · SS ≤ 3.0mm", result: "no detect", status: "pass", inspector: "scanner", method: "inline MD" },
  { id: "QA-00139", t: "07:02", sample: "LP-9001", test_type: "protein_pct", target: "≥ 14.0% (LOC-0142 spec)", result: "14.6%", status: "pass", inspector: "J. Dudek", method: "Kjeldahl (lab)" },
  { id: "QA-00138", t: "06:58", sample: "LP-9001", test_type: "temperature_core", target: "≥ 72°C @ center", result: "74.3°C", status: "pass", inspector: "scanner", method: "probe P-04" },
  { id: "QA-00137", t: "06:50", sample: "LP-9001", test_type: "allergen_atp_swab", target: "≤ 10 RLU", result: "7 RLU", status: "pass", inspector: "J. Dudek", method: "ATP (Hygiena)" },
  { id: "QA-00136", t: "06:32", sample: "LP-9001", test_type: "visual_fill", target: "no blister · even seal", result: "1 seal flag", status: "hold", inspector: "A. Majewska", method: "visual", note: "LP-9001 held — seal anomaly; 3 packs out" },
];
const WO_QA_SUMMARY = { total: 6, pass: 5, hold: 1, fail: 0, d365Push: "1 pending (QA-00136 resolution required)" };

Object.assign(window, {
  PROD_NAV, LINES, WOS, WO_DETAIL, EVENTS_FEED, OEE_LINES, DOWNTIME, PARETO, SHIFT_CREW, DLQ, SPARK_OEE,
  WASTE_PARETO, WASTE_TREND, WASTE_EVENTS, WASTE_BY_LINE, LINE_DETAIL,
  DASHBOARD_KPIS, WO_QA_RESULTS, WO_QA_SUMMARY,
});
