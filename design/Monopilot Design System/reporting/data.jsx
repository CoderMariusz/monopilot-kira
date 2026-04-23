// ============ Reporting module — mock data ============
// This module is a read-only consumer of every other module.
// Cross-module refs: WO-2026-0108 (Production), PO-2026-00041 (Planning), LP-4431 (Warehouse),
// QH-20260420-003 (Quality), PO aging (Planning), oee_daily_summary (15-OEE).

// -------- Sub-navigation --------
const RPT_NAV = [
  { group: "Overview", items: [
    { key: "home",             label: "Dashboards",           ic: "▤", hero: true },
  ]},
  { group: "Dashboards", items: [
    { key: "factory_overview", label: "Factory Overview",     ic: "◆" },
    { key: "yield_by_line",    label: "Yield by Line",        ic: "∥" },
    { key: "yield_by_sku",     label: "Yield by SKU",         ic: "◰" },
    { key: "qc_holds",         label: "QC Holds",             ic: "⚠", count: "6" },
    { key: "oee_summary",      label: "OEE Summary",          ic: "◉" },
    { key: "inventory_aging",  label: "Inventory Aging",      ic: "⏰" },
    { key: "wo_status",        label: "WO Status",            ic: "⚒" },
    { key: "shipment_otd",     label: "Shipment OTD",         ic: "→" },
    { key: "integration_health", label: "Integration Health", ic: "⇄", admin: true },
    { key: "rules_usage",      label: "Rules Usage",          ic: "ƒ", admin: true },
  ]},
  { group: "Workflow", items: [
    { key: "exports",          label: "Export History",       ic: "⇪" },
    { key: "saved_filters",    label: "Saved Filters",        ic: "★" },
    { key: "scheduled",        label: "Scheduled Reports",    ic: "⏲", badge: "P2" },
  ]},
  { group: "Admin", items: [
    { key: "settings",         label: "Reporting Settings",   ic: "⚙", admin: true },
    { key: "gallery",          label: "Modal gallery",        ic: "▣" },
  ]},
];

// -------- RPT-HOME: Dashboard catalog --------
const RPT_CATALOG = [
  { id: "RPT-001", key: "factory_overview", name: "Factory Overview", domain: "Production", domainClass: "rpt-domain-prod", ic: "◆", desc: "Executive summary: yield, giveaway, efficiency, variance with 13-week trend.", phase: "P1", refreshedAt: "14:32", cadence: "2 min" },
  { id: "RPT-002", key: "yield_by_line",    name: "Yield by Line",    domain: "Production", domainClass: "rpt-domain-prod", ic: "∥", desc: "Per-line breakdown vs target. Drill into SKU detail. Weekly granularity.", phase: "P1", refreshedAt: "14:32", cadence: "2 min" },
  { id: "RPT-003", key: "yield_by_sku",     name: "Yield by SKU",     domain: "Production", domainClass: "rpt-domain-prod", ic: "◰", desc: "Contribution % per SKU. 13-week per-SKU trend via expandable row.", phase: "P1", refreshedAt: "14:32", cadence: "2 min" },
  { id: "RPT-004", key: "qc_holds",         name: "QC Holds",         domain: "Quality",    domainClass: "rpt-domain-qual", ic: "⚠", desc: "Daily boxes held by reason / line / severity. AM vs PM split. Link to 09-QUALITY.", phase: "P1", refreshedAt: "14:30", cadence: "5 min" },
  { id: "RPT-005", key: "oee_summary",      name: "OEE Summary",      domain: "Production", domainClass: "rpt-domain-prod", ic: "◉", desc: "Consumer of 15-OEE daily summary. A/P/Q per line, trend, best/worst shift.", phase: "P1", refreshedAt: "14:31", cadence: "2 min", stale: false },
  { id: "RPT-006", key: "inventory_aging",  name: "Inventory Aging",  domain: "Warehouse",  domainClass: "rpt-domain-wh",   ic: "⏰", desc: "License plates by age bucket. Expiry alerts. Slow-moving SKU detection.", phase: "P1", refreshedAt: "14:28", cadence: "5 min" },
  { id: "RPT-007", key: "wo_status",        name: "WO Status",        domain: "Operational", domainClass: "rpt-domain-ops",  ic: "⚒", desc: "Real-time WO funnel. Active, paused, WIP by line. Links to Production.", phase: "P1", refreshedAt: "14:32", cadence: "2 min" },
  { id: "RPT-008", key: "shipment_otd",     name: "Shipment OTD",     domain: "Operational", domainClass: "rpt-domain-ops",  ic: "→", desc: "On-time delivery %, fulfillment rate, late shipments per customer.", phase: "P1", refreshedAt: "14:27", cadence: "5 min" },
  { id: "RPT-009", key: "integration_health", name: "Integration Health", domain: "Admin",  domainClass: "rpt-domain-adm",  ic: "⇄", desc: "D365 outbox health, DLQ depth, avg dispatch latency. Admin only.", phase: "P1", refreshedAt: "14:33", cadence: "2 min", admin: true },
  { id: "RPT-010", key: "rules_usage",      name: "Rules Usage",      domain: "Admin",      domainClass: "rpt-domain-adm",  ic: "ƒ", desc: "DSL rule evaluation count, trigger rate, orphan detection. Admin only.", phase: "P1", refreshedAt: "14:29", cadence: "5 min", admin: true },
  // P2 placeholders
  { id: "RPT-P2-001", key: "giveaway",       name: "Giveaway Analysis",  domain: "Production", domainClass: "rpt-domain-prod", ic: "◑", desc: "Per-line GA% trend, SKU drill-down, GA by supervisor.", phase: "P2" },
  { id: "RPT-P2-002", key: "leader_sc",      name: "Leader Scorecard",   domain: "Production", domainClass: "rpt-domain-prod", ic: "★", desc: "Per-leader A/B/C/D grade multi-component scoring.", phase: "P2" },
  { id: "RPT-P2-006", key: "period_reports", name: "Period Reports 4-4-5", domain: "Finance", domainClass: "rpt-domain-fin", ic: "Σ", desc: "P1–P13 fiscal period table with P/P and Y/Y comparison.", phase: "P2" },
  { id: "RPT-P2-007", key: "ncr_trend",      name: "NCR Trend",          domain: "Quality",    domainClass: "rpt-domain-qual", ic: "◑", desc: "NCRs per month rolling 13-month. Root cause breakdown.", phase: "P2" },
  { id: "RPT-P2-008", key: "lot_genealogy",  name: "Lot Genealogy (FSMA)", domain: "Warehouse", domainClass: "rpt-domain-wh",  ic: "⊶", desc: "Forward/backward trace CTE. PDF export for recall response.", phase: "P2" },
  { id: "RPT-P2-009", key: "wip_dashboard",  name: "WIP Dashboard",      domain: "Finance",    domainClass: "rpt-domain-fin", ic: "£", desc: "Per-line / per-product WIP value. 10-FINANCE consumer.", phase: "P2" },
  { id: "RPT-P2-013", key: "regulatory",     name: "Regulatory Export Pkg", domain: "Quality", domainClass: "rpt-domain-qual", ic: "✓", desc: "BRCGS audit bundle + FDA 483 + FSMA 204. e-signature required.", phase: "P2" },
];

// -------- RPT-001 Factory Overview KPIs --------
// invertedPolarity: true — lower value is favourable (e.g. Giveaway %, late shipments, holds)
// Used by buildKpiRunCells() to flip green/red tone mapping for these KPIs.
const RPT_FO_KPIS = [
  { k: "yield",      label: "Weighted Yield %",  value: "91.3%",    change: "↑ 0.5%", changeCls: "up",    sub: "vs last week",   accent: "green" },
  { k: "giveaway",   label: "Giveaway %",        value: "1.8%",     change: "↓ 0.2%", changeCls: "up",    sub: "vs last week",   accent: "green", invertedPolarity: true },
  { k: "efficiency", label: "Efficiency %",      value: "84.2%",    change: "↓ 0.9%", changeCls: "down",  sub: "vs target 85%",  accent: "amber" },
  { k: "cases",      label: "Total Cases",       value: "12,450",   change: "↑ 340",  changeCls: "up",    sub: "vs last week",   accent: "blue" },
  { k: "variance",   label: "Variance GBP",      value: "−£2,340",  change: "↑ £440", changeCls: "up",    sub: "favourable",     accent: "green" },
];

// Factory Overview — embedded OEE strip (consumer of 15-OEE oee_daily_summary)
const RPT_FO_OEE = { oee: 83.2, avail: 91.5, perf: 88.1, qual: 99.2, spark: [80.1, 82.4, 81.8, 83.0, 82.2, 83.5, 83.2] };

// 13-week yield / variance combo chart (trend)
const RPT_FO_TREND = [
  { we: "24/01", yield: 90.1, variance:  1.2 },
  { we: "31/01", yield: 90.8, variance:  0.4 },
  { we: "07/02", yield: 91.5, variance: -0.8 },
  { we: "14/02", yield: 90.3, variance:  1.6 },
  { we: "21/02", yield: 89.9, variance:  2.3 },
  { we: "28/02", yield: 91.1, variance: -0.6 },
  { we: "07/03", yield: 92.0, variance: -2.1 },
  { we: "14/03", yield: 91.4, variance: -1.1 },
  { we: "21/03", yield: 90.6, variance:  0.9 },
  { we: "28/03", yield: 91.9, variance: -1.5 },
  { we: "04/04", yield: 91.2, variance: -0.3 },
  { we: "11/04", yield: 90.8, variance:  0.6 },
  { we: "18/04", yield: 91.3, variance: -2.3 },
];

const RPT_FO_TOP3_GAINS = [
  { line: "Line 3 — Pasztet",     product: "FA5200 Pasztet drobiowy",      varGBP:  1200, pct: 100 },
  { line: "Line 4 — Pierogi",     product: "FA5300 Pierogi ruskie",         varGBP:   880, pct: 73 },
  { line: "Line 2 — Szynka",      product: "FA5102 Szynka plastry 150g",    varGBP:   520, pct: 43 },
];
const RPT_FO_TOP3_LOSSES = [
  { line: "Line 1 — Kiełbasa",    product: "FA5100 Kiełbasa śląska 450g",   varGBP: -1450, pct: 100 },
  { line: "Line 5 — Gulasz",      product: "FA5021 Gulasz wołowy",           varGBP:  -860, pct: 59 },
  { line: "Line 2 — Szynka",      product: "FA5110 Szynka śląska 500g",      varGBP:  -430, pct: 30 },
];

// Factory Overview — "All Lines" table with sparkline data
const RPT_FO_LINES = [
  { line: "Line 1 — Kiełbasa",  product: "FA5100 Kiełbasa śl. 450g",   yield: 88.4, target: 91.0, varPct: -2.6, varGBP: -1450, wwPct: -1.2, grade: "C", spark: [90.1,91.2,89.4,90.6,88.9,89.1,88.4] },
  { line: "Line 2 — Szynka",    product: "FA5102 Szynka plastry 150g", yield: 92.1, target: 92.0, varPct:  0.1, varGBP:    90, wwPct:  0.4, grade: "B", spark: [91.2,91.8,92.3,91.4,92.0,91.9,92.1] },
  { line: "Line 3 — Pasztet",   product: "FA5200 Pasztet drob.",       yield: 94.3, target: 92.5, varPct:  1.8, varGBP:  1200, wwPct:  0.8, grade: "A", spark: [92.5,93.1,93.6,94.0,93.8,94.1,94.3] },
  { line: "Line 4 — Pierogi",   product: "FA5300 Pierogi ruskie",      yield: 93.1, target: 91.5, varPct:  1.6, varGBP:   880, wwPct:  0.6, grade: "A", spark: [91.5,92.0,92.7,92.5,92.9,93.0,93.1] },
  { line: "Line 5 — Gulasz",    product: "FA5021 Gulasz wołowy",       yield: 87.4, target: 90.0, varPct: -2.6, varGBP:  -860, wwPct: -0.9, grade: "D", spark: [88.9,88.2,87.8,87.6,88.0,87.5,87.4] },
  { line: "Factory Average",    product: "—",                           yield: 91.3, target: 91.4, varPct: -0.1, varGBP: -2340, wwPct:  0.5, grade: "B", spark: [90.4,90.9,91.2,90.8,91.1,91.0,91.3], factoryAvg: true },
];

// -------- RPT-002 Yield by Line — summary KPIs + table --------
const RPT_YBL_KPIS = [
  { k: "factAvg", label: "Factory Avg Yield", value: "91.3%", change: "↑ 0.5%",  changeCls: "up",   accent: "green", sub: "W/W" },
  { k: "above",   label: "Lines Above Target", value: "3",    accent: "green", sub: "Line 2, 3, 4" },
  { k: "below",   label: "Lines Below Target", value: "2",    accent: "red",   sub: "Line 1, 5"   },
];

// -------- RPT-003 Yield by SKU --------
const RPT_YBS_KPIS = [
  { k: "total", label: "SKUs Active",     value: "24", accent: "blue",  sub: "Across 5 lines" },
  { k: "above", label: "Above Target",    value: "13", accent: "green" },
  { k: "below", label: "Below Target",    value: "11", accent: "red"   },
];
const RPT_YBS_SKUS = [
  { code: "FG-NUGGET-1K", name: "Chicken Nugget 1 kg",          lines: "Line 1",    kg: 2150, yield: 87.2, target: 90.0, varPct: -2.8, varGBP: -450, contrib: 18, spark: [88,89,87,88,87,86,87] },
  { code: "FA5100",        name: "Kiełbasa śląska 450g",        lines: "Line 1",    kg: 1840, yield: 88.4, target: 91.0, varPct: -2.6, varGBP: -1000, contrib: 42, spark: [90,91,89,90,88,89,88] },
  { code: "FA5102",        name: "Szynka plastry 150g",          lines: "Line 2",    kg: 1200, yield: 92.1, target: 92.0, varPct:  0.1, varGBP:    90, contrib:  2, spark: [91,92,92,91,92,92,92] },
  { code: "FA5200",        name: "Pasztet drobiowy 180g",        lines: "Line 3",    kg:  980, yield: 94.3, target: 92.5, varPct:  1.8, varGBP:  1200, contrib: 51, spark: [92,93,93,94,94,94,94] },
  { code: "FA5300",        name: "Pierogi ruskie 500g",          lines: "Line 4",    kg: 1340, yield: 93.1, target: 91.5, varPct:  1.6, varGBP:   880, contrib: 37, spark: [91,92,93,92,93,93,93] },
  { code: "FA5021",        name: "Gulasz wołowy",                lines: "Line 5",    kg:  620, yield: 87.4, target: 90.0, varPct: -2.6, varGBP:  -860, contrib: 36, spark: [88,88,87,87,88,87,87] },
  { code: "FA5110",        name: "Szynka śląska 500g",            lines: "Line 2",    kg:  480, yield: 89.3, target: 91.5, varPct: -2.2, varGBP:  -430, contrib: 18, spark: [90,90,89,89,89,89,89] },
  { code: "FA5400",        name: "Filet sous-vide 180g",          lines: "Line 4",    kg:  280, yield: 95.1, target: 93.0, varPct:  2.1, varGBP:   320, contrib: 13, spark: [93,94,94,95,95,95,95] },
];

// -------- RPT-004 QC Holds --------
// Cross-module link: QH-20260420-003 → 09-QUALITY
const RPT_QC_KPIS = [
  { k: "held",     label: "Boxes Held Today",     value: "128", accent: "amber", invertedPolarity: true },
  { k: "reject",   label: "Boxes Rejected",       value: "24",  accent: "red",   invertedPolarity: true },
  { k: "labour",   label: "Labour Hours",         value: "6.4", accent: "blue"  },
  { k: "critical", label: "Critical Holds",       value: "2",   accent: "red",   invertedPolarity: true },
];
const RPT_QC_HOLDS = [
  { holdId: "QH-20260420-003", line: "Line 2", product: "Chicken Nuggets",  reason: "Foreign Body",         severity: "critical", boxesHeld: 48, rejected: 12, staff: 3, timeMin: 42, labourHr: 2.1, shift: "AM", status: "open" },
  { holdId: "QH-20260420-004", line: "Line 1", product: "Kiełbasa śląska",  reason: "Label Misprint",       severity: "minor",    boxesHeld:  6, rejected:  0, staff: 1, timeMin: 10, labourHr: 0.2, shift: "AM", status: "released" },
  { holdId: "QH-20260420-005", line: "Line 4", product: "Pierogi ruskie",    reason: "Weight Out of Spec",  severity: "major",    boxesHeld: 32, rejected:  4, staff: 2, timeMin: 38, labourHr: 1.3, shift: "AM", status: "released" },
  { holdId: "QH-20260420-006", line: "Line 5", product: "Gulasz wołowy",     reason: "Temperature Drift",  severity: "critical", boxesHeld: 18, rejected:  8, staff: 3, timeMin: 56, labourHr: 2.8, shift: "PM", status: "review" },
  { holdId: "QH-20260420-007", line: "Line 3", product: "Pasztet drobiowy",  reason: "Visual Defect",       severity: "minor",    boxesHeld:  8, rejected:  0, staff: 1, timeMin:  8, labourHr: 0.1, shift: "AM", status: "released" },
  { holdId: "QH-20260420-008", line: "Line 2", product: "Szynka plastry",    reason: "Seal Integrity",      severity: "major",    boxesHeld: 16, rejected:  0, staff: 2, timeMin: 18, labourHr: 0.6, shift: "PM", status: "review" },
];

// -------- RPT-005 OEE Summary --------
const RPT_OEE_KPIS = [
  { k: "oee",    label: "Factory OEE Today", value: "83.2%", accent: "amber" },
  { k: "avail",  label: "Availability",       value: "91.5%", accent: "green" },
  { k: "perf",   label: "Performance",        value: "88.1%", accent: "green" },
  { k: "qual",   label: "Quality",            value: "99.2%", accent: "green" },
  { k: "best",   label: "Best Line Today",    value: "Line 3 · 92.1%", accent: "green" },
];
const RPT_OEE_BY_LINE = [
  { line: "Line 1", a: 88.4, p: 84.1, q: 97.8, oee: 72.7 },
  { line: "Line 2", a: 92.0, p: 89.3, q: 99.5, oee: 81.7 },
  { line: "Line 3", a: 95.2, p: 93.8, q: 99.6, oee: 89.0 },
  { line: "Line 4", a: 93.4, p: 90.1, q: 99.3, oee: 83.6 },
  { line: "Line 5", a: 89.0, p: 85.5, q: 98.2, oee: 74.7 },
];
const RPT_OEE_TREND = [
  { d: "15/04", oee: 81.4, a: 90.2, p: 87.4, q: 99.1, best: "Line 3", worst: "Line 1" },
  { d: "16/04", oee: 82.1, a: 90.8, p: 88.0, q: 99.0, best: "Line 3", worst: "Line 5" },
  { d: "17/04", oee: 80.9, a: 89.6, p: 87.2, q: 99.3, best: "Line 4", worst: "Line 1" },
  { d: "18/04", oee: 83.5, a: 92.0, p: 89.1, q: 99.2, best: "Line 3", worst: "Line 5" },
  { d: "19/04", oee: 82.7, a: 91.2, p: 88.4, q: 99.3, best: "Line 3", worst: "Line 1" },
  { d: "20/04", oee: 83.0, a: 91.4, p: 88.2, q: 99.4, best: "Line 3", worst: "Line 5" },
  { d: "21/04", oee: 83.2, a: 91.5, p: 88.1, q: 99.2, best: "Line 3", worst: "Line 1" },
];

// -------- RPT-006 Inventory Aging --------
// Cross-module: LP-4431, LP00000007 etc from Warehouse module
const RPT_INV_KPIS = [
  { k: "total",  label: "Total LPs",           value: "142", accent: "blue"  },
  { k: "fresh",  label: "Fresh (0–7d)",         value: "58",  accent: "green" },
  { k: "att",    label: "Attention (7–14d)",    value: "47",  accent: "blue"  },
  { k: "warn",   label: "Warning (14–30d)",     value: "25",  accent: "amber" },
  { k: "crit",   label: "Critical (>30d)",      value: "12",  accent: "red"   },
];
const RPT_INV_BY_CAT = [
  { cat: "Raw meat",        fresh: 42, att: 18, warn:  8, crit:  2 },
  { cat: "Packaging",       fresh:  8, att:  6, warn:  3, crit:  1 },
  { cat: "Spice & additive", fresh:  4, att:  2, warn:  1, crit:  0 },
  { cat: "Dairy",            fresh:  2, att:  3, warn:  2, crit:  1 },
  { cat: "Intermediate",     fresh:  2, att: 18, warn: 11, crit:  8 },
];
const RPT_INV_EXPIRING = [
  { lp: "LP00000007", product: "R-1002 Słonina wieprzowa",   qty: "60 kg",  expiry: "2026-04-15", daysRem: -6, loc: "Cold › B2", status: "blocked"   },
  { lp: "LP00000019", product: "R-1301 Cebula drobna",        qty: "35 kg",  expiry: "2026-04-19", daysRem: -2, loc: "Dry › A8",  status: "available" },
  { lp: "LP00000031", product: "R-3001 Osłonka Ø26",          qty: "800 m",  expiry: "2026-04-22", daysRem:  1, loc: "Dry › A4",  status: "available" },
  { lp: "LP00000044", product: "R-1501 Mąka pszenna typ 500", qty: "180 kg", expiry: "2026-04-23", daysRem:  2, loc: "Dry › A2",  status: "available" },
  { lp: "LP-4431",    product: "R-1001 Wieprzowina kl. II",   qty: "220.5 kg", expiry: "2026-05-02", daysRem: 11, loc: "Cold › B3", status: "reserved"  },
];
const RPT_INV_BY_PROD = [
  { code: "R-1001", name: "Wieprzowina kl. II",  cat: "Raw meat",   lps: 3, kg:  758, avgAge:  5, oldest: 11, kg7:  400, kg14:  220.5, kg30:  137.5, kg30p:   0 },
  { code: "R-1002", name: "Słonina wieprzowa",    cat: "Raw meat",   lps: 3, kg:  260, avgAge: 18, oldest: 92, kg7:    0, kg14:    0,   kg30:  200,   kg30p:  60 },
  { code: "R-1101", name: "Wołowina gulaszowa",   cat: "Raw meat",   lps: 2, kg:  840, avgAge:  6, oldest:  9, kg7:  360, kg14:  480,   kg30:    0,   kg30p:   0 },
  { code: "R-1501", name: "Mąka pszenna typ 500", cat: "Packaging",  lps: 3, kg:  380, avgAge: 11, oldest: 18, kg7:    0, kg14:  180,   kg30:  200,   kg30p:   0 },
  { code: "IN1301", name: "[INT] Farsz pierogowy", cat: "Intermediate", lps: 1, kg: 420, avgAge: 28, oldest: 32, kg7:    0, kg14:    0, kg30:  420,   kg30p:  50 },
  { code: "R-3001", name: "Osłonka Ø26 (Viscofan)", cat: "Packaging", lps: 1, kg:  800, avgAge: 32, oldest: 35, kg7:    0, kg14:    0,   kg30:    0,   kg30p: 800, uom: "m" },
];
const RPT_INV_SLOW = [
  { code: "R-3001", name: "Osłonka Ø26 (Viscofan)", kgOver14: 800, oldest: 35, action: "Review supplier lead time" },
  { code: "IN1301", name: "[INT] Farsz pierogowy",   kgOver14: 420, oldest: 32, action: "Schedule downstream WO" },
  { code: "R-1002", name: "Słonina wieprzowa",       kgOver14: 260, oldest: 92, action: "Manual QA inspect" },
];

// -------- RPT-007 WO Status --------
// Cross-module: WO-2026-0108 (Planning/Production)
const RPT_WO_KPIS = [
  { k: "active",  label: "Active WOs",         value: "7",   accent: "blue"  },
  { k: "wip",     label: "WIP Lines",           value: "4",   accent: "green" },
  { k: "paused",  label: "Paused WOs",          value: "1",   accent: "amber" },
  { k: "avgDur",  label: "Avg Duration Today",  value: "2h 14m", accent: "blue" },
];
const RPT_WO_FUNNEL = [
  { state: "draft",     count:  3 },
  { state: "released",  count:  4 },
  { state: "running",   count:  3 },
  { state: "paused",    count:  1 },
  { state: "completed", count: 12 },
];
const RPT_WO_ROWS = [
  { wo: "WO-2026-0108", product: "FA5100 Kiełbasa śl. 450g",  line: "Line 1", plannedKg: 1000, status: "running",   pStart: "06:00", aStart: "06:02", pDur: "4h 00m", elapsed: "2h 34m", yield: null },
  { wo: "WO-2026-0109", product: "FA5102 Szynka plastry",      line: "Line 2", plannedKg: 1200, status: "running",   pStart: "06:30", aStart: "06:35", pDur: "3h 30m", elapsed: "2h 00m", yield: null },
  { wo: "WO-2026-0111", product: "FA5021 Gulasz wołowy",       line: "Line 5", plannedKg:  800, status: "released",  pStart: "10:00", aStart: "—",     pDur: "3h 00m", elapsed: "—",    yield: null },
  { wo: "WO-2026-0114", product: "IN1301 Farsz pierogowy",     line: "Line 4", plannedKg:  600, status: "paused",    pStart: "07:00", aStart: "07:15", pDur: "2h 00m", elapsed: "1h 10m", yield: null },
  { wo: "WO-2026-0115", product: "FA5400 Filet sous-vide",     line: "Line 4", plannedKg:  400, status: "running",   pStart: "09:00", aStart: "09:08", pDur: "2h 30m", elapsed: "1h 26m", yield: null },
  { wo: "WO-2026-0100", product: "FA5200 Pasztet drobiowy",    line: "Line 3", plannedKg:  500, status: "completed", pStart: "05:00", aStart: "05:05", pDur: "3h 00m", elapsed: "2h 58m", yield: 94.3 },
  { wo: "WO-2026-0099", product: "FA5300 Pierogi ruskie",      line: "Line 4", plannedKg:  700, status: "completed", pStart: "04:00", aStart: "04:10", pDur: "3h 30m", elapsed: "3h 22m", yield: 93.1 },
];
const RPT_WIP_BY_LINE = [
  { line: "Line 1", runningWos: 1, plannedKg: 1000, reservedKg:  876, completion: 55 },
  { line: "Line 2", runningWos: 1, plannedKg: 1200, reservedKg:  700, completion: 58 },
  { line: "Line 3", runningWos: 0, plannedKg:    0, reservedKg:    0, completion:  0 },
  { line: "Line 4", runningWos: 2, plannedKg: 1000, reservedKg:  820, completion: 42 },
  { line: "Line 5", runningWos: 0, plannedKg:  800, reservedKg:  480, completion:  0 },
];

// -------- RPT-008 Shipment OTD --------
const RPT_OTD_KPIS = [
  { k: "otd",    label: "OTD %",          value: "96.2%", change: "↑ 0.8%", changeCls: "up", accent: "green" },
  { k: "fulfill",label: "Fulfillment",     value: "98.5%", accent: "green" },
  { k: "ontime", label: "On-Time Ships",   value: "142",   accent: "green" },
  { k: "late",   label: "Late Ships",      value: "6",     accent: "red",   invertedPolarity: true },
  { k: "pack",   label: "Avg Pack Time",   value: "42 min", accent: "blue" },
];
const RPT_OTD_TREND = [
  { we: "28/02", otd: 94.1 },
  { we: "07/03", otd: 95.2 },
  { we: "14/03", otd: 95.8 },
  { we: "21/03", otd: 93.9 },
  { we: "28/03", otd: 95.0 },
  { we: "04/04", otd: 96.1 },
  { we: "11/04", otd: 95.4 },
  { we: "18/04", otd: 96.2 },
];
const RPT_OTD_CUSTOMERS = [
  { name: "Tesco Stores Ltd.",      total: 48, onTime: 47, late: 1, otd: 97.9, fulfill: 99.2, packMin: 38, spark: [96,97,98,97,98,97,98,98] },
  { name: "Morrisons Distribution", total: 32, onTime: 30, late: 2, otd: 93.8, fulfill: 97.0, packMin: 45, spark: [94,93,95,92,94,93,93,94] },
  { name: "Sainsbury's Supply",     total: 28, onTime: 28, late: 0, otd: 100,  fulfill: 100,  packMin: 40, spark: [99,99,100,99,100,100,100,100] },
  { name: "Waitrose Partners",      total: 18, onTime: 18, late: 0, otd: 100,  fulfill: 100,  packMin: 35, spark: [100,99,100,100,100,100,100,100] },
  { name: "Asda Wholesale",         total: 14, onTime: 11, late: 3, otd: 78.6, fulfill: 94.4, packMin: 52, spark: [82,80,79,78,80,79,78,79] },
  { name: "Ocado Retail",           total:  8, onTime:  8, late: 0, otd: 100,  fulfill: 100,  packMin: 41, spark: [100,100,100,100,100,100,100,100] },
];
const RPT_OTD_LATE = [
  { ship: "SHP-2026-00412", customer: "Asda Wholesale",         product: "FA5100 Kiełbasa śl. 450g", qty: "240 cases", reqDate: "2026-04-19", actDate: "2026-04-20", daysLate: 1, reason: "Line 1 paused for QA hold — 4h delay" },
  { ship: "SHP-2026-00418", customer: "Asda Wholesale",         product: "FA5021 Gulasz wołowy",     qty: "120 cases", reqDate: "2026-04-20", actDate: "2026-04-21", daysLate: 1, reason: "Material short — PO-2026-00041 late" },
  { ship: "SHP-2026-00420", customer: "Morrisons Distribution", product: "FA5102 Szynka plastry",    qty:  "80 cases", reqDate: "2026-04-20", actDate: "2026-04-21", daysLate: 1, reason: "Carrier collection delay" },
];

// -------- RPT-009 Integration Health --------
const RPT_IH_KPIS = [
  { k: "pending", label: "Total Pending Events", value: "14",  accent: "blue"  },
  { k: "failed",  label: "Total Failed (24h)",    value: "3",   accent: "red",   invertedPolarity: true },
  { k: "dlq",     label: "DLQ Total Depth",       value: "3",   accent: "red",   invertedPolarity: true },
  { k: "latency", label: "Avg Latency (5m)",      value: "218ms", accent: "amber", invertedPolarity: true },
];
const RPT_IH_STAGES = [
  { stage: "Stage 1 — Items Pull",       target: "D365 Items Pull",    pending:  0, dispatching: 0, failed: 0, dlq: 0, latency: 142, status: "healthy",  phase: "P1" },
  { stage: "Stage 2 — WO Confirm",       target: "D365 WO Confirm",    pending:  2, dispatching: 1, failed: 3, dlq: 3, latency: 312, status: "critical", phase: "P1" },
  { stage: "Stage 3 — Invoice Pull",     target: "D365 Invoice Pull",  pending:  4, dispatching: 0, failed: 0, dlq: 0, latency:  88, status: "healthy",  phase: "P1" },
  { stage: "Stage 4 — EPCIS (Warehouse)", target: "Serialization",     pending: null, dispatching: null, failed: null, dlq: null, latency: null, status: "p2",      phase: "P2" },
  { stage: "Stage 5 — GRN Acknowledge",  target: "D365 GRN Ack",        pending:  8, dispatching: 0, failed: 0, dlq: 0, latency: 156, status: "warning",  phase: "P1" },
  { stage: "Stage 6 — RMA",               target: "D365 RMA",            pending: null, dispatching: null, failed: null, dlq: null, latency: null, status: "p2",      phase: "P2" },
];
const RPT_IH_LATENCY = [
  { h: "−24h", s1: 130, s2: 280, s3:  82, s5: 148 },
  { h: "−20h", s1: 134, s2: 295, s3:  85, s5: 150 },
  { h: "−16h", s1: 138, s2: 310, s3:  88, s5: 152 },
  { h: "−12h", s1: 144, s2: 340, s3:  92, s5: 154 },
  { h:  "−8h", s1: 142, s2: 325, s3:  90, s5: 155 },
  { h:  "−4h", s1: 140, s2: 315, s3:  86, s5: 158 },
  { h:    "0", s1: 142, s2: 312, s3:  88, s5: 156 },
];
const RPT_IH_DLQ = [
  { stage: "Stage 2 — WO Confirm", table: "d365_push_dlq", depth: 3, oldest: "2026-04-20 06:14", sample: "HTTP 503 — D365 endpoint unreachable after 5 retries" },
];

// -------- RPT-010 Rules Usage --------
const RPT_RU_KPIS = [
  { k: "total",    label: "Rules Registered",  value: "18", accent: "blue"  },
  { k: "active",   label: "Active (Period)",    value: "14", accent: "green" },
  { k: "orphan",   label: "Never Triggered",    value: "4",  accent: "amber" },
  { k: "latency",  label: "Avg Eval Latency",   value: "7.2ms", accent: "green" },
];
const RPT_RU_RULES = [
  { rule: "report_access_gate_v1",         owner: "12-REPORTING", desc: "Row-level security gate",               phase: "P1", evalCount: 18420, triggerRate: 0.4, latency:   4.1, lastFired: "14 min ago", status: "active" },
  { rule: "wo_release_hard_lock_v1",       owner: "04-PLANNING",  desc: "Reserve LPs on WO release",             phase: "P1", evalCount:    42, triggerRate:  100, latency:  12.4, lastFired:  "2 h ago",   status: "active" },
  { rule: "fefo_deviation_v1",             owner: "05-WAREHOUSE", desc: "Block over-age picks, require override", phase: "P1", evalCount:   218, triggerRate: 11.3, latency:   6.8, lastFired: "10 min ago", status: "active" },
  { rule: "use_by_auto_block_v1",          owner: "05-WAREHOUSE", desc: "Auto-block expired use_by LPs",         phase: "P1", evalCount:   142, triggerRate:  1.4, latency:   3.4, lastFired:  "3 h ago",   status: "active" },
  { rule: "qc_hold_cascade_v1",            owner: "09-QUALITY",   desc: "Cascade quality hold to sibling LPs",   phase: "P1", evalCount:    12, triggerRate:  16.7, latency:  14.1, lastFired:  "1 h ago",   status: "active" },
  { rule: "shipment_otd_late_v1",          owner: "11-SHIPPING",  desc: "Flag late shipments, escalate",          phase: "P1", evalCount:     8, triggerRate:  75.0, latency:   5.2, lastFired: "45 min ago", status: "active" },
  { rule: "scheduled_report_distribution_v1", owner: "12-REPORTING", desc: "pg_cron trigger for scheduled delivery", phase: "P2", evalCount: 0, triggerRate: 0, latency: 0, lastFired: "Never", status: "p2_stub" },
  { rule: "regulatory_signoff_v1",         owner: "12-REPORTING", desc: "e-signature guard for regulatory export", phase: "P2", evalCount: 0, triggerRate: 0, latency: 0, lastFired: "Never", status: "p2_stub" },
  { rule: "wo_variance_threshold_v1",      owner: "08-PRODUCTION", desc: "Auto-create variance record above threshold", phase: "P1", evalCount: 0, triggerRate: 0, latency: 0, lastFired: "Never", status: "orphan" },
  { rule: "cycle_count_approval_v1",       owner: "05-WAREHOUSE", desc: ">10% cycle count variance approval",    phase: "P1", evalCount: 2, triggerRate: 100, latency: 9.8, lastFired: "4 h ago", status: "active" },
];
const RPT_RU_LATENCY_TREND = [
  { d: "15/04", avg:  6.8 },
  { d: "16/04", avg:  7.1 },
  { d: "17/04", avg:  6.9 },
  { d: "18/04", avg:  7.4 },
  { d: "19/04", avg:  7.1 },
  { d: "20/04", avg:  7.0 },
  { d: "21/04", avg:  7.2 },
];

// -------- RPT-EXPORTS: Export History --------
const RPT_EXPORTS_KPIS = [
  { k: "total", label: "Exports (30d)", value: "42", accent: "blue"  },
  { k: "ok",    label: "Successful",    value: "40", accent: "green" },
  { k: "fail",  label: "Failed",        value: "2",  accent: "red"   },
];
const RPT_EXPORTS = [
  { id: "a8b4f1e2", dashboard: "Factory Overview",  fmt: "pdf",  range: "W/E 19/04/2026", at: "21/04/2026 14:18", size: "245 KB", status: "completed", sha: "a8b4f1e28f7d9c31", retain: "21/04/2033", archived: false, failed: false },
  { id: "RPT-0042", dashboard: "Yield by Line",      fmt: "csv",  range: "W/E 19/04/2026", at: "21/04/2026 13:42", size:  "32 KB", status: "completed", sha: "b3c8e5f1d02a4b29", retain: "21/04/2033", archived: false, failed: false, domainRef: true },
  { id: "c9d7a012", dashboard: "QC Holds",           fmt: "pdf",  range: "20/04/2026",     at: "21/04/2026 09:14", size: "180 KB", status: "completed", sha: "c9d7a012f3e58c01", retain: "21/04/2033", archived: false, failed: false },
  { id: "d1e3b724", dashboard: "Shipment OTD",       fmt: "csv",  range: "W/E 12/04/2026", at: "18/04/2026 17:30", size: "142 KB", status: "completed", sha: "d1e3b72498cf01a3", retain: "18/04/2033", archived: false, failed: false },
  { id: "e2f4c835", dashboard: "Inventory Aging",    fmt: "pdf",  range: "21/04/2026",     at: "21/04/2026 07:02", size: "420 KB", status: "failed",    sha: "—",                 retain: "—",          archived: false, failed: true,  errorCode: "PDF_TIMEOUT", errorMsg: "Puppeteer edge function timeout after 30s (V-RPT-EXPORT-7)" },
  { id: "f5g6h947", dashboard: "Factory Overview",   fmt: "pdf",  range: "W/E 22/01/2026", at: "25/01/2026 11:15", size: "238 KB", status: "completed", sha: "f5g6h947a2b1c438", retain: "25/01/2033", archived: true,  failed: false },
  { id: "g7h8i058", dashboard: "OEE Summary",        fmt: "csv",  range: "W/E 29/02/2026", at: "01/03/2026 08:45", size:  "88 KB", status: "completed", sha: "g7h8i058c9d2e1ab", retain: "01/03/2033", archived: true,  failed: false },
  { id: "h9i0j169", dashboard: "WO Status",          fmt: "pdf",  range: "19/04/2026",     at: "19/04/2026 19:28", size: "312 KB", status: "failed",    sha: "—",                 retain: "—",          archived: false, failed: true,  errorCode: "ROW_LIMIT", errorMsg: "Query returned 12,420 rows (exceeds 10,000 limit). Refine filters." },
];

// -------- RPT-SAVED: Saved filter presets --------
const RPT_SAVED = [
  { name: "Line 1 — This Week",          dashboard: "Yield by Line",    filters: "Line: Line 1, Week: Current",       createdBy: "m.krawczyk",       createdAt: "2 days ago",   lastUsed: "12 min ago",  visibility: "me"   },
  { name: "Critical QC Holds — Today",   dashboard: "QC Holds",         filters: "Severity: Critical, Shift: All",     createdBy: "QA.Wiśniewski",    createdAt: "5 days ago",   lastUsed:  "2 h ago",    visibility: "team" },
  { name: "Cold Store Expiry",           dashboard: "Inventory Aging",  filters: "Warehouse: WH-Factory-A, Cat: Raw meat", createdBy: "wh.manager",   createdAt: "1 week ago",   lastUsed:  "1 day ago",  visibility: "me"   },
  { name: "Asda OTD Weekly",             dashboard: "Shipment OTD",     filters: "Customer: Asda, Week: Current",      createdBy: "sales.ops",        createdAt: "3 weeks ago",  lastUsed:  "3 days ago", visibility: "team" },
  { name: "Period P04 2026 — All lines", dashboard: "Factory Overview", filters: "Week: 2026-W14..W17",                createdBy: "plant.director",   createdAt: "yesterday",    lastUsed:  "3 h ago",    visibility: "team" },
];

// -------- RPT-SCHED (P2) placeholder rows --------
const RPT_SCHED_KPIS = [
  { k: "active", label: "Active Schedules",  value: "5",  accent: "green" },
  { k: "paused", label: "Paused",            value: "1",  accent: "amber" },
  { k: "failed", label: "Failed (24h)",      value: "1",  accent: "red"   },
];
const RPT_SCHED_ROWS = [
  { id: "SCH-0089", name: "Weekly Factory Overview",   dashboard: "Factory Overview", cadence: "Every Mon at 07:00 BST",   nextRun: "27/04/2026 07:00", lastRun: "2 days ago",  outcome: "delivered", recipients: 3, format: "pdf", status: "active", failures: 0 },
  { id: "SCH-0090", name: "Daily QC Holds",            dashboard: "QC Holds",         cadence: "Daily at 19:00 GMT",        nextRun: "21/04/2026 19:00", lastRun: "yesterday",   outcome: "delivered", recipients: 5, format: "pdf", status: "active", failures: 0 },
  { id: "SCH-0091", name: "Weekly Yield by SKU",       dashboard: "Yield by SKU",     cadence: "Every Mon at 07:30 BST",   nextRun: "27/04/2026 07:30", lastRun: "2 days ago",  outcome: "delivered", recipients: 4, format: "csv", status: "active", failures: 0 },
  { id: "SCH-0092", name: "Daily Shipment OTD",        dashboard: "Shipment OTD",     cadence: "Daily at 08:00 BST",        nextRun: "22/04/2026 08:00", lastRun: "6 h ago",      outcome: "partial",   recipients: 6, format: "pdf", status: "active", failures: 2 },
  { id: "SCH-0093", name: "Period-End OEE",            dashboard: "OEE Summary",      cadence: "Period-End (4-4-5)",         nextRun: "30/04/2026 23:59", lastRun: "27 days ago", outcome: "delivered", recipients: 2, format: "pdf", status: "active", failures: 0 },
  { id: "SCH-0094", name: "Monthly WIP Dashboard",     dashboard: "WIP Dashboard (P2)", cadence: "1st of month 06:00",     nextRun: "01/05/2026 06:00", lastRun: "21 days ago", outcome: "delivered", recipients: 2, format: "pdf", status: "paused", failures: 0 },
  { id: "SCH-0095", name: "Asda OTD Daily (DLQ)",      dashboard: "Shipment OTD",     cadence: "Daily at 09:00 BST",        nextRun: "Past due",         lastRun: "3 h ago",      outcome: "failed",    recipients: 2, format: "csv", status: "dlq",    failures: 5 },
];

// -------- RPT-SETTINGS --------
const RPT_SETTINGS = {
  general: {
    timezone: "Europe/London",
    defaultWeek: "current",
    rowLimitDefault: 5000,
    freshnessAlertMin: 10,
    chartDataPointLimit: 10000,
  },
  exportLimits: {
    maxCsvRows: 10000,
    maxPdfRows: 500,
    maxFileSizeMb: 100,
    exportRateLimit: 1,
  },
  pdfBranding: {
    headerText: "Forza Foods Ltd — Confidential",
    footerText: "Generated by Monopilot MES — Page {n} of {N}",
    colorScheme: "Default Blue",
    primaryColor: "#1976D2",
    includeSha: true,
  },
};
const RPT_FLAGS = [
  { flag: "reporting.v2_dashboards",        state: "off", desc: "E3 Advanced Analytics rollout",      setAt: "PostHog" },
  { flag: "reporting.scheduled_delivery",   state: "on",  desc: "P2 cron email (Resend via 02-SETTINGS §13)", setAt: "PostHog" },
  { flag: "reporting.external_bi_embed",    state: "off", desc: "P2 Metabase/Grafana embed",           setAt: "PostHog" },
  { flag: "reporting.custom_dsl_builder",   state: "off", desc: "P2 SQL-like report builder",           setAt: "PostHog" },
  { flag: "reporting.leaderboard_anonymize", state: "on", desc: "GDPR: initials only in leaderboard",  setAt: "PostHog" },
  { flag: "reporting.ml_anomaly_detection", state: "off", desc: "P3 ML anomaly detection",             setAt: "PostHog" },
];
const RPT_DATA_SOURCES = [
  { view: "mv_factory_overview_week",   tables: "wo_completed, target_kpis, oee_daily_summary", cadence: "Every 2 min (pg_cron)", lastRefresh: "14:32", duration:  4200, rows:  1320, status: "healthy" },
  { view: "mv_yield_by_line_week",      tables: "wo_completed, target_kpis",                    cadence: "Every 2 min (pg_cron)", lastRefresh: "14:32", duration:  3800, rows:  1820, status: "healthy" },
  { view: "mv_yield_by_sku_week",       tables: "wo_completed, bom_expected_yield",             cadence: "Every 2 min (pg_cron)", lastRefresh: "14:32", duration:  5420, rows:  4120, status: "healthy" },
  { view: "mv_qc_holds_daily",          tables: "quality_holds, quality_hold_reasons",          cadence: "Every 5 min (pg_cron)", lastRefresh: "14:30", duration:  2140, rows:   418, status: "healthy" },
  { view: "mv_oee_summary",             tables: "oee_daily_summary",                            cadence: "Every 2 min (pg_cron)", lastRefresh: "14:31", duration:  1920, rows:    35, status: "healthy" },
  { view: "mv_inventory_aging",         tables: "license_plates, grn_lines",                    cadence: "Every 5 min (pg_cron)", lastRefresh: "14:28", duration:  6420, rows: 14200, status: "healthy" },
  { view: "mv_wo_status",               tables: "wo, wo_events",                                cadence: "Every 2 min (pg_cron)", lastRefresh: "14:32", duration:  2810, rows:  4820, status: "healthy" },
  { view: "mv_shipment_otd",            tables: "shipments, sales_orders",                      cadence: "Every 5 min (pg_cron)", lastRefresh: "14:27", duration:  3250, rows:   820, status: "healthy" },
  { view: "mv_integration_health",      tables: "outbox, outbox_dlq",                           cadence: "Every 2 min (pg_cron)", lastRefresh: "14:18", duration: 11820, rows:  1420, status: "stale" },
  { view: "mv_rules_usage",             tables: "rule_evaluations",                             cadence: "Every 5 min (pg_cron)", lastRefresh: "14:29", duration:  4120, rows:   142, status: "healthy" },
];

// -------- Shared chart-helper palette --------
const RPT_COLORS = {
  blue:   "#1976D2",
  green:  "#22c55e",
  amber:  "#f59e0b",
  red:    "#ef4444",
  info:   "#3b82f6",
  gray:   "#64748b",
};

Object.assign(window, {
  RPT_NAV, RPT_CATALOG,
  RPT_FO_KPIS, RPT_FO_OEE, RPT_FO_TREND, RPT_FO_TOP3_GAINS, RPT_FO_TOP3_LOSSES, RPT_FO_LINES,
  RPT_YBL_KPIS, RPT_YBS_KPIS, RPT_YBS_SKUS,
  RPT_QC_KPIS, RPT_QC_HOLDS,
  RPT_OEE_KPIS, RPT_OEE_BY_LINE, RPT_OEE_TREND,
  RPT_INV_KPIS, RPT_INV_BY_CAT, RPT_INV_EXPIRING, RPT_INV_BY_PROD, RPT_INV_SLOW,
  RPT_WO_KPIS, RPT_WO_FUNNEL, RPT_WO_ROWS, RPT_WIP_BY_LINE,
  RPT_OTD_KPIS, RPT_OTD_TREND, RPT_OTD_CUSTOMERS, RPT_OTD_LATE,
  RPT_IH_KPIS, RPT_IH_STAGES, RPT_IH_LATENCY, RPT_IH_DLQ,
  RPT_RU_KPIS, RPT_RU_RULES, RPT_RU_LATENCY_TREND,
  RPT_EXPORTS_KPIS, RPT_EXPORTS,
  RPT_SAVED,
  RPT_SCHED_KPIS, RPT_SCHED_ROWS,
  RPT_SETTINGS, RPT_FLAGS, RPT_DATA_SOURCES,
  RPT_COLORS,
});
