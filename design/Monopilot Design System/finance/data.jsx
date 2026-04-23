// ============ Finance module — mock data ============
// Cross-refs to Planning WOs (WO-2026-0042, WO-2026-0108) and POs (PO-2026-00044 Viscofan, PO-2026-00041 Agro-Fresh) integrated via WO cost card + material variance + D365 outbox.

const FIN_NAV = [
  { group: "Overview", items: [
    { key: "dashboard",         label: "Dashboard",            ic: "◆", hero: true },
  ]},
  { group: "Costing", items: [
    { key: "standard_costs",    label: "Standard Costs",        ic: "£", count: "156" },
    { key: "wos",               label: "WO Costs",              ic: "⚒", count: "12" },
    { key: "bom_costing",       label: "BOM Costing",           ic: "▦", phase2: true },
    { key: "simulation",        label: "Simulation",            ic: "⇅", phase2: true },
  ]},
  { group: "Inventory", items: [
    { key: "inventory_val",     label: "Inventory Valuation",   ic: "▥" },
  ]},
  { group: "Variance", items: [
    { key: "var_material",      label: "Variance — Material",   ic: "Δ" },
    { key: "var_labor",         label: "Variance — Labor",      ic: "Δ" },
    { key: "var_realtime",      label: "Variance — Real-time",  ic: "●", phase2: true },
    { key: "var_drilldown",     label: "Variance — Drill-down", ic: "⇲" },
  ]},
  { group: "Analysis", items: [
    { key: "margin",            label: "Margin Analysis",       ic: "%", phase2: true },
    { key: "budgets",           label: "Budgets",               ic: "$", phase2: true },
  ]},
  { group: "Admin", items: [
    { key: "fx",                label: "FX Rates",              ic: "€" },
    { key: "reports",           label: "Reports",               ic: "☷" },
    { key: "d365",              label: "D365 Integration",      ic: "⇄", count: "47" },
    { key: "settings",          label: "Finance Settings",      ic: "⚙" },
    { key: "gallery",           label: "Modal gallery",         ic: "▣" },
  ]},
];

// ----- Dashboard KPIs (FIN-001) -----
const FIN_KPIS = [
  { k: "total_mtd",    label: "Total Production Cost MTD", value: "£ 245,680.50", accent: "blue",  sub: "↑ 5.2% vs last month",        trend: "up",  trendBad: true,  target: "wos" },
  { k: "variance_mtd", label: "Cost Variance MTD",         value: "£ +12,340.00", accent: "red",   sub: "Unfavorable +5.1%",            trend: "up",  trendBad: true,  target: "var_drilldown", badge: "unfav" },
  { k: "inv_value",    label: "Inventory Value",           value: "£ 1,234,500.00", accent: "blue", sub: "Updated: 10 min ago",        target: "inventory_val" },
  { k: "uncosted_wos", label: "Uncosted WOs",              value: "3",            accent: "amber", sub: "Pending close",               target: "wos" },
  { k: "dlq",          label: "D365 DLQ Open",             value: "0",            accent: "green", sub: "All clear",                   target: "d365" },
  { k: "yield_loss",   label: "Yield Loss MTD",            value: "£ 4,820.00",   accent: "amber", sub: "09-QA yield issues",          target: "reports" },
];

// ----- Dashboard variance alerts -----
const FIN_ALERTS = [
  { sev: "critical", type: "Material Price", wo: "WO-2026-0042", amt:  1250.00, pct: 15.2, product: "Chicken Nuggets 1 kg",         item: "RM-BREAST-001" },
  { sev: "critical", type: "Material Usage", wo: "WO-2026-0108", amt:   982.50, pct: 12.4, product: "Kiełbasa śląska pieczona 450g", item: "R-1001" },
  { sev: "warning",  type: "Labor Efficiency", wo: "WO-2026-0044", amt:  340.80, pct:  7.2, product: "Pork Sausages 500g",            item: "Line 1" },
  { sev: "warning",  type: "Overhead Rate",  wo: "WO-2026-0043", amt:  195.60, pct:  6.1, product: "Fish Fingers 500g",             item: "Line 2" },
  { sev: "warning",  type: "Material Price", wo: "WO-2026-0114", amt:  410.20, pct:  5.4, product: "Farsz pierogowy",               item: "R-1501" },
];

// ----- Page-level inline alerts (FIN-001) -----
const FIN_INLINE_ALERTS = [
  { sev: "blue",  code: "D365-BATCH", text: "Last D365 consolidation posted 47 lines (£ 48,320.50) at 23:04 UTC.", link: "d365" },
  { sev: "amber", code: "COV-GAP",   text: "9 of 24 FA items have no active standard cost. Variance tracking incomplete.", link: "standard_costs" },
  { sev: "amber", code: "UNCOST-24H", text: "3 work orders completed more than 24h ago but not yet costed.", link: "wos" },
];

// ----- Top Variance Contributors (FIN-001 panel) -----
const FIN_TOP_CONTRIB = [
  { rank: 1,  product: "Chicken Nuggets 1 kg", code: "FG-NUGGET-1K", variance:  4250.00, pctOfTotal: 34.4, dir: "unfav" },
  { rank: 2,  product: "Pork Sausages 500g",   code: "FG-PORK-500",  variance:  2180.00, pctOfTotal: 17.7, dir: "unfav" },
  { rank: 3,  product: "Fish Fingers 500g",    code: "FG-FISH-500",  variance:  1820.00, pctOfTotal: 14.7, dir: "unfav" },
  { rank: 4,  product: "Pasztet drobiowy",     code: "FA5200",       variance:  1240.00, pctOfTotal: 10.0, dir: "unfav" },
  { rank: 5,  product: "Kiełbasa śląska",      code: "FA5100",       variance:   982.50, pctOfTotal:  8.0, dir: "unfav" },
  { rank: 6,  product: "Pierogi ruskie",       code: "FA5300",       variance:   620.00, pctOfTotal:  5.0, dir: "unfav" },
  { rank: 7,  product: "Filet sous-vide",      code: "FA5400",       variance:   420.00, pctOfTotal:  3.4, dir: "unfav" },
  { rank: 8,  product: "Gulasz wołowy",        code: "FA5021",       variance:  -240.00, pctOfTotal: -1.9, dir: "fav" },
  { rank: 9,  product: "Szynka plastry",       code: "FA5102",       variance:   210.00, pctOfTotal:  1.7, dir: "unfav" },
  { rank: 10, product: "Wieprzowina mielona",  code: "FA5010",       variance:   180.00, pctOfTotal:  1.5, dir: "unfav" },
];

// ----- Cost breakdown (MTD) bars for FIN-001 -----
const FIN_COST_BREAKDOWN = { mat: 60.1, lab: 14.9, oh: 19.5, waste: 5.5, total: 245680.50 };

// ----- Cost trend 6 months (FIN-001 chart) -----
const FIN_COST_TREND = [
  { m: "Nov", mat: 208000, lab: 48000, oh: 58000 },
  { m: "Dec", mat: 221500, lab: 49500, oh: 62400 },
  { m: "Jan", mat: 214800, lab: 48100, oh: 60000 },
  { m: "Feb", mat: 218600, lab: 47200, oh: 61500 },
  { m: "Mar", mat: 229100, lab: 49800, oh: 63700 },
  { m: "Apr", mat: 147640, lab: 36605, oh: 47835 }, // MTD partial
];

// ----- Yield Loss NCR summary (FIN-001) -----
const FIN_YIELD_LOSS = [
  { month: "Apr 2026", product: "Chicken Nuggets 1 kg", incidents: 2, lossKg:   80.0, lossGbp: 280.00 },
  { month: "Apr 2026", product: "Fish Fingers 500g",    incidents: 1, lossKg:   42.0, lossGbp: 176.40 },
  { month: "Apr 2026", product: "Pork Sausages 500g",   incidents: 3, lossKg:  135.0, lossGbp: 391.50 },
  { month: "Mar 2026", product: "Chicken Nuggets 1 kg", incidents: 1, lossKg:   50.0, lossGbp: 175.00 },
  { month: "Mar 2026", product: "Kiełbasa śląska",      incidents: 2, lossKg:  110.0, lossGbp: 418.00 },
  { month: "Mar 2026", product: "Pasztet drobiowy",     incidents: 4, lossKg:   88.0, lossGbp: 352.00 },
];

// ----- Standard Costs (FIN-002) -----
const FIN_STD_COSTS = [
  // Approved / Active FA
  { id: "SC-2026-101", itemCode: "FG-NUGGET-1K",  itemName: "Chicken Nuggets 1 kg",   itemType: "FA",  mat: 2.5000, lab: 0.4000, oh: 0.6000, total: 3.5000, uom: "KG", effFrom: "2025-01-01", effTo: null, status: "approved",   approvedBy: "Sarah McKenzie", approvedAt: "2025-01-01 10:32 UTC", hash: "sha256:a1b2c3d4e5f6…", basis: "quoted",      notes: "Q1 2025 initial cost" },
  { id: "SC-2026-102", itemCode: "FG-FISH-500",   itemName: "Fish Fingers 500g",      itemType: "FA",  mat: 3.2000, lab: 0.4500, oh: 0.5500, total: 4.2000, uom: "KG", effFrom: "2025-01-01", effTo: null, status: "approved",   approvedBy: "Sarah McKenzie", approvedAt: "2025-01-01 10:33 UTC", hash: "sha256:b2c3d4e5f6a7…", basis: "quoted",      notes: "Q1 2025 initial cost" },
  { id: "SC-2026-103", itemCode: "FG-PORK-500",   itemName: "Pork Sausages 500g",     itemType: "FA",  mat: 2.0500, lab: 0.3500, oh: 0.5000, total: 2.9000, uom: "KG", effFrom: "2025-01-01", effTo: null, status: "approved",   approvedBy: "Sarah McKenzie", approvedAt: "2025-01-01 10:35 UTC", hash: "sha256:c3d4e5f6a7b8…", basis: "quoted",      notes: "Q1 2025 initial cost" },
  { id: "SC-2026-110", itemCode: "FA5100",        itemName: "Kiełbasa śląska pieczona 450g", itemType: "FA", mat: 4.1200, lab: 0.5800, oh: 0.6800, total: 5.3800, uom: "KG", effFrom: "2025-03-01", effTo: null, status: "approved", approvedBy: "Sarah McKenzie", approvedAt: "2025-02-20 14:08 UTC", hash: "sha256:d4e5f6a7b8c9…", basis: "calculated",  notes: "Rolled from BOM v2.1" },
  { id: "SC-2026-111", itemCode: "FA5200",        itemName: "Pasztet drobiowy z żurawiną 180g", itemType: "FA", mat: 3.9000, lab: 0.4600, oh: 0.6200, total: 4.9800, uom: "KG", effFrom: "2025-02-01", effTo: null, status: "approved", approvedBy: "Sarah McKenzie", approvedAt: "2025-01-24 11:15 UTC", hash: "sha256:e5f6a7b8c9d0…", basis: "calculated",  notes: "BOM rolled" },
  // Raw materials
  { id: "SC-2026-201", itemCode: "RM-BREAST-001", itemName: "Chicken Breast",         itemType: "RM",  mat: 5.2000, lab: 0,      oh: 0,      total: 5.2000, uom: "KG", effFrom: "2025-01-01", effTo: null, status: "approved",   approvedBy: "Sarah McKenzie", approvedAt: "2025-01-01 09:45 UTC", hash: "sha256:f6a7b8c9d0e1…", basis: "quoted",      notes: "Supplier price list Q1" },
  { id: "SC-2026-202", itemCode: "RM-FLOUR-001",  itemName: "Wheat Flour",            itemType: "RM",  mat: 0.9500, lab: 0,      oh: 0,      total: 0.9500, uom: "KG", effFrom: "2025-01-01", effTo: null, status: "approved",   approvedBy: "Sarah McKenzie", approvedAt: "2025-01-01 09:48 UTC", hash: "sha256:a7b8c9d0e1f2…", basis: "quoted",      notes: null },
  { id: "SC-2026-203", itemCode: "RM-SEASON-001", itemName: "Seasoning Mix",          itemType: "RM",  mat: 12.4000, lab: 0,     oh: 0,      total: 12.4000, uom: "KG", effFrom: "2025-01-01", effTo: null, status: "approved",  approvedBy: "Sarah McKenzie", approvedAt: "2025-01-01 09:51 UTC", hash: "sha256:b8c9d0e1f2a3…", basis: "quoted",      notes: null },
  { id: "SC-2026-204", itemCode: "R-1001",        itemName: "Wieprzowina kl. II",     itemType: "RM",  mat: 5.0000, lab: 0,      oh: 0,      total: 5.0000, uom: "KG", effFrom: "2025-02-01", effTo: null, status: "approved",   approvedBy: "Sarah McKenzie", approvedAt: "2025-01-28 13:22 UTC", hash: "sha256:c9d0e1f2a3b4…", basis: "quoted",      notes: "Baltic Pork Co. Q1 contract" },
  { id: "SC-2026-205", itemCode: "R-3001",        itemName: "Osłonka Ø26 (Viscofan)", itemType: "RM",  mat: 7.6000, lab: 0,      oh: 0,      total: 7.6000, uom: "KG", effFrom: "2025-01-15", effTo: null, status: "approved",   approvedBy: "Sarah McKenzie", approvedAt: "2025-01-10 09:00 UTC", hash: "sha256:d0e1f2a3b4c5…", basis: "quoted",      notes: "PO-2026-00044 reference price" },
  // Pending (awaiting approval)
  { id: "SC-2026-301", itemCode: "FG-NUGGET-1K",  itemName: "Chicken Nuggets 1 kg",   itemType: "FA",  mat: 2.7500, lab: 0.4200, oh: 0.6300, total: 3.8000, uom: "KG", effFrom: "2026-05-01", effTo: null, status: "pending",    approvedBy: null,              approvedAt: null,                   hash: null,                  basis: "quoted",      notes: "Supplier Q2 price increase – review" },
  { id: "SC-2026-302", itemCode: "R-1501",        itemName: "Mąka pszenna typ 500",   itemType: "RM",  mat: 1.0500, lab: 0,      oh: 0,      total: 1.0500, uom: "KG", effFrom: "2026-05-01", effTo: null, status: "pending",    approvedBy: null,              approvedAt: null,                   hash: null,                  basis: "quoted",      notes: "Imported D365 master" },
  // Draft
  { id: "SC-2026-401", itemCode: "FA5400",        itemName: "Filet sous-vide 180g",   itemType: "FA",  mat: 6.2000, lab: 0.8000, oh: 1.0500, total: 8.0500, uom: "KG", effFrom: "2026-05-15", effTo: null, status: "draft",      approvedBy: null,              approvedAt: null,                   hash: null,                  basis: "calculated",  notes: "BOM roll pending technical sign-off" },
  { id: "SC-2026-402", itemCode: "FA5300",        itemName: "Pierogi ruskie",         itemType: "FA",  mat: 2.1000, lab: 0.3200, oh: 0.4800, total: 2.9000, uom: "KG", effFrom: "2026-06-01", effTo: null, status: "draft",      approvedBy: null,              approvedAt: null,                   hash: null,                  basis: "historical",  notes: null },
  // Superseded (old version)
  { id: "SC-2026-099", itemCode: "FG-NUGGET-1K",  itemName: "Chicken Nuggets 1 kg",   itemType: "FA",  mat: 2.4000, lab: 0.3800, oh: 0.5800, total: 3.3600, uom: "KG", effFrom: "2024-07-01", effTo: "2024-12-31", status: "superseded", approvedBy: "Sarah McKenzie", approvedAt: "2024-06-25 09:10 UTC", hash: "sha256:090a1b2c3d4e…", basis: "quoted",      notes: "H2 2024 cost — superseded Jan 2025" },
  // Retired (item discontinued) — PRD §6 lifecycle terminal state
  { id: "SC-2025-050", itemCode: "FA4800",        itemName: "Krokiety z kapustą 200g (discontinued)", itemType: "FA", mat: 2.3000, lab: 0.4000, oh: 0.5000, total: 3.2000, uom: "KG", effFrom: "2024-01-01", effTo: "2025-06-30", status: "retired",    approvedBy: "Sarah McKenzie", approvedAt: "2023-12-18 10:00 UTC", hash: "sha256:retired050abc…", basis: "historical",  notes: "SKU discontinued 2025-06-30 — retired per PRD §6 lifecycle." },
];

// ----- WO Cost list (FIN-003a) -----
const FIN_WOS = [
  { wo: "WO-2026-0042", product: "Chicken Nuggets 1 kg", productCode: "FG-NUGGET-1K", line: "Line 1", cc: "FProd01", stdCost:  350.00, actual:  425.50, variance:   75.50, variancePct:  21.6, unitActual: 5.01, unitStd: 4.12, produced: 85.0, status: "closed",   costDate: "2026-04-20", d365: "MONO-PROD-20260419" },
  { wo: "WO-2026-0043", product: "Fish Fingers 500g",    productCode: "FG-FISH-500",  line: "Line 2", cc: "FProd02", stdCost:  420.00, actual:  410.80, variance:   -9.20, variancePct:  -2.2, unitActual: 4.11, unitStd: 4.20, produced: 100.0, status: "open",     costDate: "2026-04-21", d365: null },
  { wo: "WO-2026-0044", product: "Pork Sausages 500g",   productCode: "FG-PORK-500",  line: "Line 1", cc: "FProd01", stdCost:  290.00, actual:  315.80, variance:   25.80, variancePct:   8.9, unitActual: 3.15, unitStd: 2.90, produced: 100.0, status: "posted",   costDate: "2026-04-19", d365: "MONO-PROD-20260419" },
  { wo: "WO-2026-0100", product: "Pasztet drobiowy",     productCode: "FA5200",       line: "Line 3", cc: "FProd03", stdCost: 1055.76, actual: 1101.40, variance:   45.64, variancePct:   4.3, unitActual: 5.20, unitStd: 4.98, produced: 212.0, status: "posted",   costDate: "2026-04-18", d365: "MONO-PROD-20260418" },
  { wo: "WO-2026-0108", product: "Kiełbasa śląska pieczona 450g", productCode: "FA5100", line: "Line 1", cc: "FProd01", stdCost: 5438.18, actual: 6420.70, variance: 982.52, variancePct:  18.1, unitActual: 6.35, unitStd: 5.38, produced: 1011.0, status: "closed",  costDate: "2026-04-21", d365: null },
  { wo: "WO-2026-0109", product: "Szynka plastry 150g",  productCode: "FA5102",       line: "Line 1", cc: "FProd01", stdCost:  820.00, actual:  810.00, variance:  -10.00, variancePct:  -1.2, unitActual: 3.24, unitStd: 3.28, produced: 250.0, status: "open",     costDate: "2026-04-21", d365: null },
  { wo: "WO-2026-0111", product: "Gulasz wołowy",         productCode: "FA5021",       line: "Line 2", cc: "FProd02", stdCost: 3648.00, actual: 3408.00, variance: -240.00, variancePct:  -6.6, unitActual: 7.10, unitStd: 7.60, produced: 480.0, status: "closed",   costDate: "2026-04-20", d365: "MONO-PROD-20260420" },
  { wo: "WO-2026-0114", product: "Farsz pierogowy 20kg",  productCode: "IN1301",       line: "Line 4", cc: "FProd04", stdCost:  840.00, actual:  878.40, variance:   38.40, variancePct:   4.6, unitActual: 2.09, unitStd: 2.00, produced: 420.0, status: "closed",   costDate: "2026-04-20", d365: null },
  { wo: "WO-2026-0115", product: "Filet sous-vide 180g",  productCode: "FA5400",       line: "Line 4", cc: "FProd04", stdCost:  966.00, actual:  986.40, variance:   20.40, variancePct:   2.1, unitActual: 8.22, unitStd: 8.05, produced: 120.0, status: "open",     costDate: "2026-04-21", d365: null },
  { wo: "WO-2026-0116", product: "Ciasto pierogowe 15kg",  productCode: "IN1302",       line: "Line 4", cc: "FProd04", stdCost:  522.00, actual:  541.80, variance:   19.80, variancePct:   3.8, unitActual: 3.01, unitStd: 2.90, produced: 180.0, status: "closed",  costDate: "2026-04-20", d365: null },
  { wo: "WO-2026-0090", product: "Pierogi ruskie",         productCode: "FA5300",       line: "Line 4", cc: "FProd04", stdCost: 1740.00, actual: 1825.00, variance:   85.00, variancePct:   4.9, unitActual: 3.04, unitStd: 2.90, produced: 600.0, status: "posted",   costDate: "2026-04-15", d365: "MONO-PROD-20260415" },
  { wo: "WO-2026-0099", product: "Pierogi mięsne",         productCode: "FA5301",       line: "Line 4", cc: "FProd04", stdCost: 1450.00, actual: 1495.50, variance:   45.50, variancePct:   3.1, unitActual: 2.99, unitStd: 2.90, produced: 500.0, status: "posted",   costDate: "2026-04-16", d365: "MONO-PROD-20260416" },
];

// ----- WO Cost detail subject (WO-2026-0042 — Chicken Nuggets, variance +21.6%) -----
const FIN_WO_DETAIL = {
  wo: "WO-2026-0042",
  product: { code: "FG-NUGGET-1K", name: "Chicken Nuggets 1 kg" },
  line: "Line 1",
  cc: "FProd01",
  plannedQty: 100.0,
  producedQty: 85.0,
  yield: 85.0,
  status: "closed",
  startDate: "2026-04-20 06:00",
  targetEnd: "2026-04-20 14:00",
  actualEnd: "2026-04-20 14:32",
  // cost summary
  stdCost: 350.00,
  actualCost: 425.50,
  variance: 75.50,
  variancePct: 21.6,
  unitActual: 5.01,
  unitStd: 4.12,
  calculatedAt: "2026-04-20 14:32 UTC",
  d365Status: "closed", // closed | posted | open
  breakdown: [
    { cat: "Material", std: 250.00, actual: 295.50, variance: 45.50, pct: 69.4, color: "mat" },
    { cat: "Labor",    std:  40.00, actual:  48.48, variance:  8.48, pct: 11.4, color: "lab" },
    { cat: "Overhead", std:  60.00, actual:  69.52, variance:  9.52, pct: 16.3, color: "oh" },
    { cat: "Waste",    std:   0.00, actual:  12.00, variance: 12.00, pct:  2.8, color: "waste" },
  ],
  varianceDetail: {
    material: { total: 45.50, price: 20.00, usage: 25.50 },
    labor:    { total:  8.48, rate:  0.00, efficiency: 8.48 },
    overhead: { total:  9.52 },
    waste:    { total: 12.00, entries: 3 },
  },
  cascade: null,   // no child WOs
  coProducts: null, // no co-products defined
  notes: [],
  auditExport: null,
};

// ----- Kiełbasa śląska WO-2026-0108 alternate subject with cascade + large unfavourable variance -----
const FIN_WO_DETAIL_KIELBASA = {
  wo: "WO-2026-0108",
  product: { code: "FA5100", name: "Kiełbasa śląska pieczona 450g" },
  line: "Line 1",
  cc: "FProd01",
  plannedQty: 1100.0,
  producedQty: 1011.0,
  yield: 91.9,
  status: "closed",
  startDate: "2026-04-21 05:58",
  targetEnd: "2026-04-21 14:45",
  actualEnd: "2026-04-21 14:45",
  stdCost: 5438.18,
  actualCost: 6420.70,
  variance: 982.52,
  variancePct: 18.1,
  unitActual: 6.35,
  unitStd: 5.38,
  calculatedAt: "2026-04-21 14:45 UTC",
  d365Status: "closed",
  breakdown: [
    { cat: "Material", std: 4165.00, actual: 4948.00, variance: 783.00, pct: 77.1, color: "mat" },
    { cat: "Labor",    std:  586.00, actual:  648.60, variance:  62.60, pct: 10.1, color: "lab" },
    { cat: "Overhead", std:  687.18, actual:  759.10, variance:  71.92, pct: 11.8, color: "oh" },
    { cat: "Waste",    std:    0.00, actual:   65.00, variance:  65.00, pct:  1.0, color: "waste" },
  ],
  varianceDetail: {
    material: { total: 783.00, price: 420.00, usage: 363.00 },
    labor:    { total:  62.60, rate:  0.00, efficiency: 62.60 },
    overhead: { total:  71.92 },
    waste:    { total:  65.00, entries: 2 },
  },
  cascade: [
    { wo: "WO-2026-0108", role: "Parent", own:  6420.70, cascade: 6420.70 },
    { wo: "WO-2026-0116", role: "Child",  own:   541.80, cascade:  541.80 },
    { wo: "WO-2026-0114", role: "Child",  own:   878.40, cascade:  878.40 },
  ],
  cascadeTotal: 7840.90,
  coProducts: null,
  notes: [
    { date: "2026-04-21 15:02 UTC", author: "Sarah McKenzie", cat: "Supplier Issue", text: "Supplier price increase — new PO price £5.45/kg vs standard £5.20. Raise standard cost for RM-BREAST-001." },
  ],
};

// ----- Inventory Valuation (FIN-005) -----
const FIN_INV_VAL = {
  asOf: "2026-04-20",
  method: "FIFO",
  totalValue: 1234567.89,
  itemCount: 856,
  distribution: [
    { cat: "Raw Materials",    pct: 45, value:  555555.55, color: "rm" },
    { cat: "Packaging",        pct: 15, value:  185185.18, color: "pkg" },
    { cat: "WIP",              pct: 25, value:  308641.97, color: "wip" },
    { cat: "Finished Goods",   pct: 15, value:  185185.18, color: "fa" },
  ],
  rows: [
    { code: "FG-NUGGET-1K", name: "Chicken Nuggets 1 kg", itemType: "FA", qty: 1500.000, uom: "KG", avgCost: 3.5000, value:  5250.00,  layers: 4, aging: "0-30d", lastMove: "2026-04-19" },
    { code: "FG-FISH-500",  name: "Fish Fingers 500g",    itemType: "FA", qty:  820.000, uom: "KG", avgCost: 4.2000, value:  3444.00,  layers: 2, aging: "0-30d", lastMove: "2026-04-18" },
    { code: "FG-PORK-500",  name: "Pork Sausages 500g",   itemType: "FA", qty: 1200.000, uom: "KG", avgCost: 2.9000, value:  3480.00,  layers: 3, aging: "0-30d", lastMove: "2026-04-17" },
    { code: "FA5100",       name: "Kiełbasa śląska 450g", itemType: "FA", qty: 1011.000, uom: "KG", avgCost: 6.3500, value:  6419.85,  layers: 1, aging: "0-30d", lastMove: "2026-04-21" },
    { code: "FA5200",       name: "Pasztet drobiowy 180g", itemType: "FA", qty: 212.000, uom: "KG", avgCost: 5.2000, value:  1102.40,  layers: 1, aging: "0-30d", lastMove: "2026-04-21" },
    { code: "FA5400",       name: "Filet sous-vide 180g", itemType: "FA", qty:  120.000, uom: "KG", avgCost: 8.2200, value:   986.40,  layers: 1, aging: "0-30d", lastMove: "2026-04-21" },
    { code: "R-1001",       name: "Wieprzowina kl. II",   itemType: "RM", qty:  758.000, uom: "KG", avgCost: 5.0000, value:  3790.00,  layers: 3, aging: "0-30d", lastMove: "2026-04-21" },
    { code: "R-1002",       name: "Słonina wieprzowa",    itemType: "RM", qty:  260.000, uom: "KG", avgCost: 4.0000, value:  1040.00,  layers: 3, aging: "30-60d", lastMove: "2026-04-21" },
    { code: "R-1101",       name: "Wołowina gulaszowa",   itemType: "RM", qty:  840.000, uom: "KG", avgCost: 6.0000, value:  5040.00,  layers: 2, aging: "0-30d", lastMove: "2026-04-12" },
    { code: "R-1201",       name: "Filet z kurczaka",     itemType: "RM", qty:  120.000, uom: "KG", avgCost:10.0000, value:  1200.00,  layers: 1, aging: "0-30d", lastMove: "2026-04-14" },
    { code: "R-1501",       name: "Mąka pszenna typ 500", itemType: "RM", qty:  380.000, uom: "KG", avgCost: 1.0000, value:   380.00,  layers: 3, aging: "0-30d", lastMove: "2026-04-10" },
    { code: "R-2101",       name: "Pieprz czarny mielony", itemType: "RM", qty: 125.000, uom: "KG", avgCost:12.0000, value:  1500.00,  layers: 2, aging: "60-90d", lastMove: "2026-02-18" },
    { code: "R-3001",       name: "Osłonka Ø26 (Viscofan)", itemType: "RM", qty: 800.000, uom: "M",  avgCost: 7.6000, value:  6080.00,  layers: 1, aging: "30-60d", lastMove: "2026-03-20" },
    { code: "RM-BREAST-001", name: "Chicken Breast",       itemType: "RM", qty: 2450.000, uom: "KG", avgCost: 5.4500, value: 13352.50,  layers: 3, aging: "0-30d", lastMove: "2026-04-20" },
    { code: "RM-FLOUR-001", name: "Wheat Flour",          itemType: "RM", qty: 3820.000, uom: "KG", avgCost: 0.9500, value:  3629.00,  layers: 4, aging: "0-30d", lastMove: "2026-04-18" },
    { code: "RM-SEASON-001", name: "Seasoning Mix",       itemType: "RM", qty:  280.000, uom: "KG", avgCost:12.4000, value:  3472.00,  layers: 2, aging: "90d+", lastMove: "2026-01-14" },
    { code: "IN1301",       name: "Farsz pierogowy 20kg", itemType: "Intermediate", qty: 420.000, uom: "KG", avgCost: 2.0900, value: 877.80, layers: 1, aging: "0-30d", lastMove: "2026-04-20" },
    { code: "IN1302",       name: "Ciasto pierogowe 15kg", itemType: "Intermediate", qty: 180.000, uom: "KG", avgCost: 3.0100, value: 541.80, layers: 1, aging: "0-30d", lastMove: "2026-04-20" },
  ],
};

// ----- FIFO Layers (FIN-005 modal subject for RM-BREAST-001) -----
const FIN_FIFO_LAYERS = {
  item: { code: "RM-BREAST-001", name: "Chicken Breast", qtyTotal: 2450.000, valueTotal: 13352.50, active: 3 },
  layers: [
    { n: 1, date: "2026-04-02", src: "PO Receipt", ref: "GRN-2026-00038", qtyIn:  800.000, qtyRem:  250.000, unit: 5.2000, value:  1300.00, exhausted: false },
    { n: 2, date: "2026-04-10", src: "PO Receipt", ref: "GRN-2026-00040", qtyIn: 1200.000, qtyRem: 1200.000, unit: 5.4500, value:  6540.00, exhausted: false },
    { n: 3, date: "2026-04-20", src: "PO Receipt", ref: "GRN-2026-00042", qtyIn: 1000.000, qtyRem: 1000.000, unit: 5.5125, value:  5512.50, exhausted: false },
    { n: 0, date: "2026-03-15", src: "PO Receipt", ref: "GRN-2026-00030", qtyIn:  500.000, qtyRem:    0.000, unit: 5.1000, value:     0.00, exhausted: true },
  ],
};

// ----- FX Rates (FIN-006) -----
const FIN_FX = [
  { code: "GBP", name: "British Pound Sterling", sym: "£", rate: 1.000000, effDate: null,         source: "base",   ageDays: null, status: "base",     base: true },
  { code: "EUR", name: "Euro",                    sym: "€", rate: 0.850000, effDate: "2026-04-20", source: "manual", ageDays: 1,    status: "active",   base: false },
  { code: "USD", name: "US Dollar",               sym: "$", rate: 0.790000, effDate: "2026-04-20", source: "manual", ageDays: 1,    status: "active",   base: false },
  { code: "PLN", name: "Polish Złoty",            sym: "zł", rate: 0.195000, effDate: "2026-04-13", source: "manual", ageDays: 8,    status: "active",   base: false },
  { code: "CHF", name: "Swiss Franc",             sym: "Fr", rate: 0.900000, effDate: "2025-12-12", source: "manual", ageDays: 130,  status: "inactive", base: false },
];

// FX history for EUR
const FIN_FX_HISTORY = [
  { date: "2026-04-20", rate: 0.850000, source: "manual", user: "Sarah McKenzie", reason: "Monthly rate adjustment per treasury team." },
  { date: "2026-03-20", rate: 0.853000, source: "manual", user: "Sarah McKenzie", reason: "Monthly treasury update."                    },
  { date: "2026-02-20", rate: 0.848000, source: "manual", user: "Sarah McKenzie", reason: "Monthly treasury update."                    },
  { date: "2026-01-20", rate: 0.851000, source: "manual", user: "Sarah McKenzie", reason: "Q1 treasury roll."                           },
  { date: "2025-12-20", rate: 0.849000, source: "manual", user: "Sarah McKenzie", reason: "Monthly treasury update."                    },
];

// ----- Material variance (FIN-007) -----
const FIN_VAR_MATERIAL = [
  { itemCode: "RM-BREAST-001", itemName: "Chicken Breast",        period: "Apr 2026", stdQty: 2250.000, actualQty: 2310.000, usageDelta:  60.000, stdUnit: 5.20, actualUnit: 5.45, priceDelta: 0.25, totalVar:  887.50, variancePct:  7.8, woCount: 4 },
  { itemCode: "R-1001",        itemName: "Wieprzowina kl. II",     period: "Apr 2026", stdQty: 1800.000, actualQty: 1820.000, usageDelta:  20.000, stdUnit: 5.00, actualUnit: 5.20, priceDelta: 0.20, totalVar:  460.00, variancePct:  5.1, woCount: 3 },
  { itemCode: "R-1002",        itemName: "Słonina wieprzowa",      period: "Apr 2026", stdQty:  450.000, actualQty:  468.000, usageDelta:  18.000, stdUnit: 4.00, actualUnit: 4.10, priceDelta: 0.10, totalVar:  118.80, variancePct:  6.6, woCount: 2 },
  { itemCode: "RM-FLOUR-001",  itemName: "Wheat Flour",            period: "Apr 2026", stdQty: 3200.000, actualQty: 3180.000, usageDelta: -20.000, stdUnit: 0.95, actualUnit: 0.95, priceDelta: 0.00, totalVar:  -19.00, variancePct: -0.6, woCount: 4 },
  { itemCode: "R-3001",        itemName: "Osłonka Ø26 (Viscofan)", period: "Apr 2026", stdQty:  100.000, actualQty:  104.000, usageDelta:   4.000, stdUnit: 7.60, actualUnit: 7.65, priceDelta: 0.05, totalVar:   30.50, variancePct:  4.1, woCount: 1 },
  { itemCode: "R-1501",        itemName: "Mąka pszenna typ 500",   period: "Apr 2026", stdQty:  900.000, actualQty:  912.000, usageDelta:  12.000, stdUnit: 1.00, actualUnit: 1.05, priceDelta: 0.05, totalVar:   57.60, variancePct:  6.3, woCount: 3 },
  { itemCode: "R-2101",        itemName: "Pieprz czarny mielony",  period: "Apr 2026", stdQty:   30.000, actualQty:   32.000, usageDelta:   2.000, stdUnit:12.00, actualUnit:12.20, priceDelta: 0.20, totalVar:   30.40, variancePct:  8.3, woCount: 3 },
  { itemCode: "RM-SEASON-001", itemName: "Seasoning Mix",          period: "Apr 2026", stdQty:   85.000, actualQty:   88.000, usageDelta:   3.000, stdUnit:12.40, actualUnit:12.45, priceDelta: 0.05, totalVar:   42.65, variancePct:  4.0, woCount: 2 },
];

// ----- Labor variance (FIN-008) -----
const FIN_VAR_LABOR = [
  { wo: "WO-2026-0042", op: "Mixing",       line: "Line 1", stdHrs:  2.000, actualHrs: 2.350, hrsDelta:  0.350, stdRate: 18.50, actualRate: 18.50, stdCost: 37.00, actualCost: 43.48, variance:  6.48, variancePct: 17.5 },
  { wo: "WO-2026-0042", op: "Forming",      line: "Line 1", stdHrs:  1.000, actualHrs: 1.100, hrsDelta:  0.100, stdRate: 18.50, actualRate: 18.50, stdCost: 18.50, actualCost: 20.35, variance:  1.85, variancePct: 10.0 },
  { wo: "WO-2026-0108", op: "Grinding",     line: "Line 1", stdHrs:  4.000, actualHrs: 4.300, hrsDelta:  0.300, stdRate: 18.50, actualRate: 18.50, stdCost: 74.00, actualCost: 79.55, variance:  5.55, variancePct:  7.5 },
  { wo: "WO-2026-0108", op: "Stuffing",     line: "Line 1", stdHrs:  3.500, actualHrs: 3.650, hrsDelta:  0.150, stdRate: 19.00, actualRate: 19.00, stdCost: 66.50, actualCost: 69.35, variance:  2.85, variancePct:  4.3 },
  { wo: "WO-2026-0108", op: "Smoking",      line: "Line 1", stdHrs: 10.000, actualHrs: 10.200, hrsDelta:  0.200, stdRate: 18.50, actualRate: 18.50, stdCost:185.00, actualCost:188.70, variance:  3.70, variancePct:  2.0 },
  { wo: "WO-2026-0044", op: "Mixing",       line: "Line 1", stdHrs:  2.000, actualHrs: 2.200, hrsDelta:  0.200, stdRate: 18.50, actualRate: 18.50, stdCost: 37.00, actualCost: 40.70, variance:  3.70, variancePct: 10.0 },
  { wo: "WO-2026-0100", op: "Blending",     line: "Line 3", stdHrs:  3.000, actualHrs: 2.900, hrsDelta: -0.100, stdRate: 18.50, actualRate: 18.50, stdCost: 55.50, actualCost: 53.65, variance: -1.85, variancePct: -3.3 },
  { wo: "WO-2026-0111", op: "Cooking",      line: "Line 2", stdHrs:  6.000, actualHrs: 5.800, hrsDelta: -0.200, stdRate: 19.50, actualRate: 19.50, stdCost:117.00, actualCost:113.10, variance: -3.90, variancePct: -3.3 },
];

// ----- Variance drill-down subject (FIN-010) -----
const FIN_DRILL = {
  l0: [
    { cat: "Material", value:  8240.00, link: "material" },
    { cat: "Labor",    value:  2850.00, link: "labor" },
    { cat: "Overhead", value:  1200.00, link: "overhead" },
    { cat: "Waste",    value:   780.00, link: "waste" },
  ],
  total: 13070.00,
  l1Material: [
    { code: "RM-BREAST-001", name: "Chicken Breast",       variance:  887.50, pct: 10.8 },
    { code: "R-1001",        name: "Wieprzowina kl. II",    variance:  460.00, pct:  5.6 },
    { code: "R-1002",        name: "Słonina wieprzowa",     variance:  118.80, pct:  1.4 },
    { code: "R-1501",        name: "Mąka pszenna typ 500",  variance:   57.60, pct:  0.7 },
    { code: "R-2101",        name: "Pieprz czarny mielony", variance:   30.40, pct:  0.4 },
    { code: "RM-SEASON-001", name: "Seasoning Mix",         variance:   42.65, pct:  0.5 },
  ],
  l2Breast: [
    { wo: "WO-2026-0042", date: "2026-04-20", qty:  420.000, unitUsed: 5.45, unitStd: 5.20, variance: 105.00 },
    { wo: "WO-2026-0108", date: "2026-04-21", qty:  980.000, unitUsed: 5.45, unitStd: 5.20, variance: 245.00 },
    { wo: "WO-2026-0044", date: "2026-04-19", qty:  360.000, unitUsed: 5.45, unitStd: 5.20, variance:  90.00 },
    { wo: "WO-2026-0114", date: "2026-04-20", qty:  550.000, unitUsed: 5.45, unitStd: 5.20, variance: 137.50 },
  ],
};

// ----- Cost Reports (FIN-011) -----
const FIN_REPORTS = [
  { id: "R1", name: "Cost by Product (MTD)",        desc: "Total actual vs standard cost per FA item, current month.",            lastRun: "2026-04-21 08:02 UTC", freq: "Manual",  system: true },
  { id: "R2", name: "Cost by Period (Monthly)",     desc: "12-month rolling cost breakdown by category.",                          lastRun: "2026-04-20 23:40 UTC", freq: "Monthly", system: true },
  { id: "R3", name: "Yield Loss Summary",            desc: "NCR yield issues joined with cost data, GBP impact.",                  lastRun: "2026-04-19 10:15 UTC", freq: "Weekly",  system: true },
  { id: "R4", name: "WO Variance Summary",           desc: "All closed WOs with variance, filtered by period.",                    lastRun: "2026-04-21 06:30 UTC", freq: "Manual",  system: true },
  { id: "R5", name: "Inventory Valuation Snapshot",  desc: "Current inventory value by item type and location.",                   lastRun: "2026-04-20 23:10 UTC", freq: "Monthly", system: true },
  { id: "R6", name: "D365 Export Audit",             desc: "All outbox events with posted status and journal IDs.",                lastRun: "2026-04-21 03:04 UTC", freq: "Weekly",  system: true },
  { id: "U1", name: "Q1 Variance Deep-Dive",         desc: "Custom: Q1 2026 variance by product line. Saved for CFO review.",     lastRun: "2026-04-02 11:30 UTC", freq: "Manual",  system: false, author: "Sarah McKenzie" },
  { id: "U2", name: "Baltic Pork Supplier Tracking", desc: "Custom: PO + variance for Baltic Pork Co. since Jan 2026.",            lastRun: "2026-04-15 14:22 UTC", freq: "Monthly", system: false, author: "Sarah McKenzie" },
];

// ----- Export queue (FIN-011 Queue tab) -----
const FIN_EXPORT_QUEUE = [
  { id: "EXP-2026-00201", name: "WO Variance Summary",         reqBy: "Sarah McKenzie", fmt: "CSV", status: "complete",   createdAt: "2026-04-21 08:10 UTC" },
  { id: "EXP-2026-00200", name: "Cost by Product (MTD)",       reqBy: "Sarah McKenzie", fmt: "PDF", status: "complete",   createdAt: "2026-04-21 08:02 UTC" },
  { id: "EXP-2026-00199", name: "Inventory Valuation Snapshot", reqBy: "Mark Thompson",  fmt: "CSV", status: "processing", createdAt: "2026-04-21 14:40 UTC" },
  { id: "EXP-2026-00198", name: "D365 Export Audit",           reqBy: "Sarah McKenzie", fmt: "CSV", status: "failed",     createdAt: "2026-04-21 03:04 UTC" },
  { id: "EXP-2026-00197", name: "Yield Loss Summary",          reqBy: "Plant Director", fmt: "PDF", status: "complete",   createdAt: "2026-04-19 10:15 UTC" },
];

// ----- D365 Integration (FIN-016) -----
const FIN_D365 = {
  connected: true,
  env: "Production",
  instance: "FNOR",
  dataAreaId: "FNOR",
  warehouse: "ForzDG",
  cutoff: "23:00 UTC",
  uptime: "99.8%",
  lastPost: "2026-04-20 23:04 UTC",
  summary: {
    pending: 3,
    batchesLast30d: 29,
    linesLast: 47,
    dlqOpen: 2,
  },
};

const FIN_D365_BATCHES = [
  { date: "2026-04-20", id: "B-6f3a9c21", status: "delivered", lines: 47, totalDr: 48320.50, journal: "MONO-PROD-20260420", postedAt: "2026-04-20 23:04 UTC", reconciled: true },
  { date: "2026-04-19", id: "B-5e2a8b10", status: "delivered", lines: 42, totalDr: 41280.20, journal: "MONO-PROD-20260419", postedAt: "2026-04-19 23:03 UTC", reconciled: true },
  { date: "2026-04-18", id: "B-4d1a7a09", status: "delivered", lines: 38, totalDr: 37820.00, journal: "MONO-PROD-20260418", postedAt: "2026-04-18 23:04 UTC", reconciled: true },
  { date: "2026-04-17", id: "B-3c0a6909", status: "failed",    lines: 41, totalDr: 40110.00, journal: null,                 postedAt: null,                    reconciled: false },
  { date: "2026-04-16", id: "B-2b9a5808", status: "delivered", lines: 39, totalDr: 39200.50, journal: "MONO-PROD-20260416", postedAt: "2026-04-16 23:05 UTC", reconciled: true },
  { date: "2026-04-15", id: "B-1a8a4707", status: "delivered", lines: 40, totalDr: 40040.00, journal: "MONO-PROD-20260415", postedAt: "2026-04-15 23:04 UTC", reconciled: true },
];

const FIN_D365_OUTBOX = [
  { id: "EV-88901-4c", type: "finance.wo_cost.closed",    wo: "WO-2026-0108", status: "pending",       attempts: "0/6", nextRetry: "—",                   lastError: null,                                                   enqueuedAt: "2026-04-21 14:45 UTC" },
  { id: "EV-88900-3b", type: "finance.wo_cost.closed",    wo: "WO-2026-0111", status: "pending",       attempts: "0/6", nextRetry: "—",                   lastError: null,                                                   enqueuedAt: "2026-04-21 14:32 UTC" },
  { id: "EV-88899-2a", type: "finance.wo_cost.closed",    wo: "WO-2026-0042", status: "consolidated",  attempts: "1/6", nextRetry: "—",                   lastError: null,                                                   enqueuedAt: "2026-04-20 22:58 UTC" },
  { id: "EV-88898-19", type: "finance.daily_journal.ready", wo: "—",          status: "delivered",     attempts: "1/6", nextRetry: "—",                   lastError: null,                                                   enqueuedAt: "2026-04-20 23:00 UTC" },
  { id: "EV-88897-08", type: "finance.wo_cost.closed",    wo: "WO-2026-0090", status: "delivered",     attempts: "1/6", nextRetry: "—",                   lastError: null,                                                   enqueuedAt: "2026-04-15 22:58 UTC" },
  { id: "EV-88880-aa", type: "finance.wo_cost.reversed",  wo: "WO-2026-0077", status: "failed",        attempts: "3/6", nextRetry: "2026-04-21 16:15 UTC", lastError: "D365 service unavailable (HTTP 503).",                 enqueuedAt: "2026-04-21 14:10 UTC" },
];

const FIN_D365_DLQ = [
  { id: "DLQ-2026-031", sourceEv: "EV-88701-c2", type: "finance.wo_cost.closed",    category: "d365_validation", error: "Closed posting period 2026-03-31.",                         attempts: "6/6", movedAt: "2026-04-01 04:12 UTC", resolvedAt: null, resolvedBy: null },
  { id: "DLQ-2026-030", sourceEv: "EV-88650-ab", type: "finance.daily_journal.ready", category: "permanent",       error: "HTTP 400 — GL account 5000-ForzDG-MAT is inactive in D365.", attempts: "6/6", movedAt: "2026-03-28 04:08 UTC", resolvedAt: null, resolvedBy: null },
];

const FIN_D365_GL_MAPPING = [
  { cat: "Material", dAccount: "5000-ForzDG-MAT",  offset: "1400-ForzDG-INV",  journal: "PROD", updatedAt: "2026-01-15", updatedBy: "Sarah McKenzie" },
  { cat: "Labor",    dAccount: "5100-ForzDG-LAB",  offset: "1400-ForzDG-INV",  journal: "PROD", updatedAt: "2026-01-15", updatedBy: "Sarah McKenzie" },
  { cat: "Overhead", dAccount: "5200-ForzDG-OH",   offset: "1400-ForzDG-INV",  journal: "PROD", updatedAt: "2026-01-15", updatedBy: "Sarah McKenzie" },
  { cat: "Waste",    dAccount: "5300-ForzDG-WSTE", offset: "1400-ForzDG-INV",  journal: "PROD", updatedAt: "2026-01-15", updatedBy: "Sarah McKenzie" },
];

// ----- Onboarding checklist (FIN-001 empty/first-run) -----
const FIN_ONBOARD = [
  { k: "curr",  label: "Configure base currency (GBP)",                            done: true,  link: "fx" },
  { k: "std",   label: "Define standard costs for all FA items (15 / 24 complete)", done: false, link: "standard_costs" },
  { k: "gl",    label: "Map GL accounts to cost categories",                       done: true,  link: "d365" },
  { k: "d365",  label: "Enable D365 F&O integration",                              done: true,  link: "settings" },
  { k: "first", label: "Complete first work order with material consumption",     done: true,  link: "wos" },
];

Object.assign(window, {
  FIN_NAV, FIN_KPIS, FIN_ALERTS, FIN_INLINE_ALERTS, FIN_TOP_CONTRIB,
  FIN_COST_BREAKDOWN, FIN_COST_TREND, FIN_YIELD_LOSS,
  FIN_STD_COSTS,
  FIN_WOS, FIN_WO_DETAIL, FIN_WO_DETAIL_KIELBASA,
  FIN_INV_VAL, FIN_FIFO_LAYERS,
  FIN_FX, FIN_FX_HISTORY,
  FIN_VAR_MATERIAL, FIN_VAR_LABOR, FIN_DRILL,
  FIN_REPORTS, FIN_EXPORT_QUEUE,
  FIN_D365, FIN_D365_BATCHES, FIN_D365_OUTBOX, FIN_D365_DLQ, FIN_D365_GL_MAPPING,
  FIN_ONBOARD,
});
