// ============ Maintenance module — mock data ============
// Cross-module refs:
//   08-PRODUCTION: DOWNTIME events (LINE-02 mixer M-002 jam 10:22) mirror here as auto_downtime mWO source.
//   04-PLANNING: WO-2026-0108 etc — asset downtime delays production WOs.
//   05-WAREHOUSE: Spare part reservations reference LPs for maintenance consumables.
//   09-QUALITY: CCP-003 (Oven temp) blocked when CAL-TH-0012 overdue.
//   15-OEE: MTBF/MTTR fetched read-only from oee_shift_metrics.
// Today's date for downtime / overdue calcs: 2026-04-21.

// Fix-1 Maintenance IA: per PRD D-MNT-9 Work Requests and mWOs share a single
// unified `maintenance_work_requests` table. WR is the `requested` state of
// an mWO, not a separate entity. Removed the standalone "Work requests" nav
// node — requested items are now the "Requested" tab inside mWOs.
const MNT_NAV = [
  { group: "Operations", items: [
    { key: "dashboard",    label: "Dashboard",        ic: "◆", hero: true },
    { key: "assets",       label: "Assets",           ic: "⚙", count: "42" },
    { key: "mwos",         label: "Work orders",      ic: "🔧", count: "20" },
    { key: "sanitation",   label: "Sanitation",       ic: "🧼", count: "4" },
  ]},
  { group: "Planning", items: [
    { key: "pm_schedules", label: "PM schedules",     ic: "📅", count: "23" },
    { key: "calibration",  label: "Calibration",      ic: "⚖", count: "8" },
  ]},
  { group: "Resources", items: [
    { key: "spares",       label: "Spare parts",      ic: "📦", count: "87" },
    { key: "technicians",  label: "Technicians",      ic: "👷", count: "6" },
    { key: "loto",         label: "LOTO",             ic: "🔒", count: "2" },
  ]},
  { group: "Admin", items: [
    { key: "analytics",    label: "Analytics",        ic: "📊" },
    { key: "settings",     label: "Maintenance settings", ic: "⚙" },
    { key: "gallery",      label: "Modal gallery",    ic: "▣" },
  ]},
];

// ----- Dashboard KPIs (MAINT-001) -----
const MNT_KPIS = [
  { k: "pm_compliance", label: "PM compliance (30d)",  value: "87.4%", accent: "green", sub: "Target ≥ 85%",        target: "pm_schedules" },
  { k: "overdue_pm",    label: "Overdue PMs",           value: "3",    accent: "red",   sub: "Require attention",    target: "pm_schedules" },
  { k: "open_wr",       label: "Open work requests",    value: "6",    accent: "amber", sub: "Awaiting triage",      target: "mwos" },
  { k: "mwos_today",    label: "mWOs in progress today",value: "4",    accent: "blue",  sub: "Live now",             target: "mwos" },
  { k: "mtbf",          label: "MTBF (30d avg)",        value: "142h", accent: "green", sub: "Above target (120h)",  target: "analytics" },
  { k: "mttr",          label: "MTTR (30d avg)",        value: "48m",  accent: "green", sub: "Target < 60m",         target: "analytics" },
  { k: "loto_active",   label: "LOTO active now",       value: "2",    accent: "amber", sub: "See procedures",       target: "loto" },
  { k: "availability",  label: "Availability (30d)",    value: "94.1%",accent: "amber", sub: "Target ≥ 95%",         target: "analytics" },
];

// ----- Dashboard alerts -----
const MNT_ALERTS = [
  { severity: "red",   code: "CAL-OVERDUE-CCP", text: "CAL-TH-0012 (Line 1 Oven thermometer) is 1 day overdue — CCP-003 BLOCKED in Quality.", link: "calibration" },
  { severity: "red",   code: "MWO-SLA-BREACH",  text: "MWO-2026-0042 critical — not started 3h after creation (SLA 2h).", link: "mwos" },
  { severity: "amber", code: "LOTO-TIMEOUT",    text: "LOTO-2026-0088 on AST-1003 (Sealer SL-14) active for 9h — exceeds 8h timeout.", link: "loto" },
  { severity: "amber", code: "SPARE-LOW",       text: "SP-LUB-0042 Gearbox Lubricant 5L — 2 ea on hand, reorder point 5 ea.", link: "spares", cta: "Reorder" },
  { severity: "amber", code: "PM-DUE-7D",       text: "4 PM schedules due within 7 days on critical assets.", link: "pm_schedules" },
  { severity: "blue",  code: "DT-UNLINKED",     text: "Downtime event DT-2026-0891 (LINE-02, 23 min) has no linked mWO.", link: "mwos", cta: "Link mWO" },
];

// ----- Today's mWO list for dashboard -----
const MNT_TODAY_MWOS = [
  { mwo: "MWO-2026-0042", asset: "Mixer M-002",      type: "reactive",   pri: "critical", tech: "M. Nowak",   status: "in_progress", start: "07:00" },
  { mwo: "MWO-2026-0043", asset: "Sealer SL-14",     type: "reactive",   pri: "high",     tech: "K. Dudek",   status: "in_progress", start: "08:30" },
  { mwo: "MWO-2026-0040", asset: "Conveyor CONV-03", type: "preventive", pri: "medium",   tech: "M. Nowak",   status: "open",        start: "10:00" },
  { mwo: "MWO-2026-0041", asset: "Oven OV-05",       type: "calibration",pri: "high",     tech: null,         status: "approved",    start: "11:00" },
  { mwo: "MWO-2026-0045", asset: "Packer PK-08",     type: "preventive", pri: "low",      tech: "A. Majewska",status: "completed",   start: "06:30" },
  { mwo: "MWO-2026-0046", asset: "CIP Unit CIP-01",  type: "sanitation", pri: "high",     tech: "J. Wolak",   status: "in_progress", start: "05:00" },
];

// ----- Active LOTO procedures for dashboard panel -----
const MNT_ACTIVE_LOTO = [
  { proc: "LOTO-2026-0088", asset: "AST-1003 Sealer SL-14", appliedAt: "2026-04-20 23:14", tech: "K. Dudek",   mwo: "MWO-2026-0043", age: "9h 08m" },
  { proc: "LOTO-2026-0089", asset: "AST-1001 Mixer M-002",  appliedAt: "2026-04-21 07:02", tech: "M. Nowak",   mwo: "MWO-2026-0042", age: "1h 20m" },
];

// ============================================================
// ASSETS (MAINT-002 / MAINT-003)
// Hierarchy: WH-Factory-A (plant) → Line-01..05 → machine
// ============================================================
const MNT_ASSETS = [
  // Critical assets on LINE-01 (Kiełbasa)
  { id: "AST-1001", code: "EQ-2024-0042", name: "Mixer M-002",         icon: "⚙", type: "Mixer",       line: "LINE-01", loc: ["WH-Factory-A","LINE-01","Station-1"], criticality: "critical", status: "in_work",    loto: true,  cal: false, lastSvc: "2026-04-01", nextPm: "2026-05-01", avail: 91.2, mtbf: "118h", mttr: "52m", mfr: "GEA Polska", serial: "GEA-M002-2019", warranty: "2024-12-31" },
  { id: "AST-1002", code: "EQ-2024-0043", name: "Grinder GR-07",       icon: "⚙", type: "Mixer",       line: "LINE-01", loc: ["WH-Factory-A","LINE-01","Station-2"], criticality: "critical", status: "operational",loto: true,  cal: false, lastSvc: "2026-03-28", nextPm: "2026-04-28", avail: 96.4, mtbf: "168h", mttr: "42m" },
  { id: "AST-1003", code: "EQ-2024-0044", name: "Sealer SL-14",        icon: "📦", type: "Packer",     line: "LINE-01", loc: ["WH-Factory-A","LINE-01","Station-3"], criticality: "high",     status: "in_work",    loto: true,  cal: false, lastSvc: "2026-03-15", nextPm: "2026-05-15", avail: 93.8, mtbf: "135h", mttr: "58m" },
  { id: "AST-1004", code: "EQ-2024-0045", name: "Conveyor CONV-03",    icon: "➡", type: "Conveyor",    line: "LINE-01", loc: ["WH-Factory-A","LINE-01","Span-1"],    criticality: "medium",   status: "scheduled",  loto: false, cal: false, lastSvc: "2026-04-10", nextPm: "2026-05-10", avail: 98.1, mtbf: "220h", mttr: "28m" },
  // LINE-02 (Wołowina)
  { id: "AST-1020", code: "EQ-2024-0050", name: "Tumbler T-22",        icon: "⚙", type: "Mixer",       line: "LINE-02", loc: ["WH-Factory-A","LINE-02","Station-1"], criticality: "high",     status: "operational",loto: true,  cal: false, lastSvc: "2026-03-22", nextPm: "2026-04-22", avail: 94.5, mtbf: "158h", mttr: "45m" },
  { id: "AST-1021", code: "EQ-2024-0051", name: "Cooker CK-09",        icon: "🔥", type: "Oven",        line: "LINE-02", loc: ["WH-Factory-A","LINE-02","Station-2"], criticality: "critical", status: "operational",loto: true,  cal: true,  lastSvc: "2026-04-08", nextPm: "2026-05-08", avail: 97.2, mtbf: "245h", mttr: "38m" },
  { id: "AST-1022", code: "EQ-2024-0052", name: "Scale SC-04",         icon: "⚖", type: "Scale",       line: "LINE-02", loc: ["WH-Factory-A","LINE-02","Station-3"], criticality: "high",     status: "due",        loto: false, cal: true,  lastSvc: "2026-01-20", nextPm: "2026-04-20", avail: 99.2, mtbf: "—",    mttr: "—" },
  // LINE-03 (Kurczak)
  { id: "AST-1030", code: "EQ-2024-0060", name: "Oven OV-05",          icon: "🔥", type: "Oven",        line: "LINE-03", loc: ["WH-Factory-A","LINE-03","Station-1"], criticality: "critical", status: "due",        loto: true,  cal: true,  lastSvc: "2026-01-21", nextPm: "2026-04-21", avail: 95.6, mtbf: "198h", mttr: "60m" },
  { id: "AST-1031", code: "EQ-2024-0061", name: "Thermometer TH-12",   icon: "🌡", type: "Thermometer", line: "LINE-03", loc: ["WH-Factory-A","LINE-03","Station-1"], criticality: "critical", status: "overdue",    loto: false, cal: true,  lastSvc: "2026-01-15", nextPm: "2026-04-15", avail: 100.0, mtbf: "—",   mttr: "—" },
  { id: "AST-1032", code: "EQ-2024-0062", name: "Packer PK-08",        icon: "📦", type: "Packer",      line: "LINE-03", loc: ["WH-Factory-A","LINE-03","Station-3"], criticality: "high",     status: "operational",loto: true,  cal: false, lastSvc: "2026-04-05", nextPm: "2026-05-05", avail: 96.8, mtbf: "178h", mttr: "49m" },
  // LINE-04 (Pierogi)
  { id: "AST-1040", code: "EQ-2024-0070", name: "Dough Mixer DM-02",   icon: "⚙", type: "Mixer",       line: "LINE-04", loc: ["WH-Factory-A","LINE-04","Station-1"], criticality: "high",     status: "operational",loto: true,  cal: false, lastSvc: "2026-03-20", nextPm: "2026-04-20", avail: 98.2, mtbf: "210h", mttr: "35m" },
  { id: "AST-1041", code: "EQ-2024-0071", name: "Forming FM-11",       icon: "⚙", type: "Other",       line: "LINE-04", loc: ["WH-Factory-A","LINE-04","Station-2"], criticality: "medium",   status: "operational",loto: false, cal: false, lastSvc: "2026-03-30", nextPm: "2026-05-30", avail: 97.4, mtbf: "190h", mttr: "40m" },
  // LINE-05 / Utilities
  { id: "AST-1050", code: "EQ-2024-0080", name: "CIP Unit CIP-01",     icon: "🚿", type: "CIP Unit",    line: "LINE-05", loc: ["WH-Factory-A","LINE-05","Utilities"], criticality: "high",     status: "in_work",    loto: true,  cal: false, lastSvc: "2026-04-14", nextPm: "2026-04-28", avail: 94.0, mtbf: "145h", mttr: "65m" },
  { id: "AST-1051", code: "EQ-2024-0081", name: "Compressor CP-02",    icon: "💨", type: "Compressor",  line: "LINE-05", loc: ["WH-Factory-A","LINE-05","Utilities"], criticality: "critical", status: "operational",loto: true,  cal: false, lastSvc: "2026-03-10", nextPm: "2026-06-10", avail: 99.1, mtbf: "340h", mttr: "22m" },
  { id: "AST-1052", code: "EQ-2024-0082", name: "pH Meter PH-03",      icon: "🧪", type: "pH Meter",    line: "LINE-05", loc: ["WH-Factory-A","LINE-05","QA-Lab"],    criticality: "high",     status: "operational",loto: false, cal: true,  lastSvc: "2026-02-14", nextPm: "2026-05-14", avail: 100.0,mtbf: "—",   mttr: "—" },
];

// Asset hierarchy tree for MAINT-002 (plant → line → machine)
const MNT_ASSET_HIER = [
  { level: 0, key: "WH-Factory-A", name: "Forza Foods — Factory A", count: 15, ic: "🏭", alerts: 3 },
  { level: 1, key: "WH-Factory-A.LINE-01", name: "LINE-01 (Kiełbasa)", parent: "WH-Factory-A", count: 4, ic: "⚙", alerts: 1 },
  { level: 2, key: "AST-1001", name: "Mixer M-002",    parent: "WH-Factory-A.LINE-01", status: "in_work",    ic: "⚙", crit: "critical" },
  { level: 2, key: "AST-1002", name: "Grinder GR-07",  parent: "WH-Factory-A.LINE-01", status: "operational", ic: "⚙", crit: "critical" },
  { level: 2, key: "AST-1003", name: "Sealer SL-14",   parent: "WH-Factory-A.LINE-01", status: "in_work",    ic: "📦", crit: "high" },
  { level: 2, key: "AST-1004", name: "Conveyor CONV-03", parent: "WH-Factory-A.LINE-01", status: "scheduled", ic: "➡", crit: "medium" },
  { level: 1, key: "WH-Factory-A.LINE-02", name: "LINE-02 (Wołowina)", parent: "WH-Factory-A", count: 3, ic: "⚙", alerts: 0 },
  { level: 2, key: "AST-1020", name: "Tumbler T-22",   parent: "WH-Factory-A.LINE-02", status: "operational", ic: "⚙", crit: "high" },
  { level: 2, key: "AST-1021", name: "Cooker CK-09",   parent: "WH-Factory-A.LINE-02", status: "operational", ic: "🔥", crit: "critical" },
  { level: 2, key: "AST-1022", name: "Scale SC-04",    parent: "WH-Factory-A.LINE-02", status: "due",        ic: "⚖", crit: "high" },
  { level: 1, key: "WH-Factory-A.LINE-03", name: "LINE-03 (Kurczak)", parent: "WH-Factory-A", count: 3, ic: "⚙", alerts: 2 },
  { level: 2, key: "AST-1030", name: "Oven OV-05",     parent: "WH-Factory-A.LINE-03", status: "due",        ic: "🔥", crit: "critical" },
  { level: 2, key: "AST-1031", name: "Thermometer TH-12", parent: "WH-Factory-A.LINE-03", status: "overdue", ic: "🌡", crit: "critical" },
  { level: 2, key: "AST-1032", name: "Packer PK-08",   parent: "WH-Factory-A.LINE-03", status: "operational", ic: "📦", crit: "high" },
  { level: 1, key: "WH-Factory-A.LINE-04", name: "LINE-04 (Pierogi)", parent: "WH-Factory-A", count: 2, ic: "⚙", alerts: 0 },
  { level: 2, key: "AST-1040", name: "Dough Mixer DM-02", parent: "WH-Factory-A.LINE-04", status: "operational", ic: "⚙", crit: "high" },
  { level: 2, key: "AST-1041", name: "Forming FM-11",  parent: "WH-Factory-A.LINE-04", status: "operational", ic: "⚙", crit: "medium" },
  { level: 1, key: "WH-Factory-A.LINE-05", name: "LINE-05 / Utilities", parent: "WH-Factory-A", count: 3, ic: "💨", alerts: 1 },
  { level: 2, key: "AST-1050", name: "CIP Unit CIP-01", parent: "WH-Factory-A.LINE-05", status: "in_work",   ic: "🚿", crit: "high" },
  { level: 2, key: "AST-1051", name: "Compressor CP-02", parent: "WH-Factory-A.LINE-05", status: "operational", ic: "💨", crit: "critical" },
  { level: 2, key: "AST-1052", name: "pH Meter PH-03", parent: "WH-Factory-A.LINE-05", status: "operational", ic: "🧪", crit: "high" },
];

// Asset detail subject (AST-1001 Mixer M-002 — critical, LOTO, mid-service)
const MNT_ASSET_DETAIL = {
  id: "AST-1001",
  code: "EQ-2024-0042",
  name: "Mixer M-002",
  icon: "⚙",
  type: "Mixer",
  line: "LINE-01",
  loc: ["WH-Factory-A","LINE-01","Station-1"],
  criticality: "critical",
  status: "in_work",
  active: true,
  loto: true,
  cal: false,
  calInterval: null,
  manufacturer: "GEA Polska Sp. z o.o.",
  model: "M-002 Industrial Paddle Mixer",
  serial: "GEA-M002-2019-PL-00142",
  warranty: "2024-12-31",
  installedAt: "2019-06-14",
  lastSvc: "2026-04-01",
  nextPm: "2026-05-01",
  nextPmDays: 10,
  currentMwo: "MWO-2026-0042",
  mtbf: "118h",
  mtbf30d: "124h",
  mttr: "52m",
  mttr30d: "48m",
  availability30d: 91.2,
  availabilityTarget: 95,
  history: [
    { t: "2026-04-21 07:02", type: "reactive",   mwo: "MWO-2026-0042", desc: "Auger jam — cleaning + bearing check", tech: "M. Nowak",    duration: "in progress", cost: "—" },
    { t: "2026-04-01 09:14", type: "preventive", mwo: "MWO-2026-0020", desc: "Monthly lubrication + inspection",   tech: "A. Majewska", duration: "95 min", cost: "€72.40" },
    { t: "2026-03-12 11:30", type: "preventive", mwo: "MWO-2026-0009", desc: "Monthly lubrication + inspection",   tech: "M. Nowak",    duration: "88 min", cost: "€68.20" },
    { t: "2026-02-28 14:22", type: "reactive",   mwo: "MWO-2026-0003", desc: "Bearing replacement — rear shaft",    tech: "M. Nowak",    duration: "180 min", cost: "€248.50" },
    { t: "2026-02-12 08:02", type: "preventive", mwo: "MWO-2026-0001", desc: "Monthly lubrication + inspection",   tech: "A. Majewska", duration: "92 min", cost: "€70.10" },
  ],
  pmSchedules: [
    { pm: "PM-0001", type: "preventive", freq: "Every 30 days",  lastDone: "2026-04-01", nextDue: "2026-05-01", tech: "M. Nowak",    tmpl: "Monthly Lubrication Checklist" },
    { pm: "PM-0002", type: "inspection", freq: "Every 180 days", lastDone: "2026-01-15", nextDue: "2026-07-15", tech: "A. Majewska", tmpl: "Semi-annual gearbox inspection" },
  ],
  spares: [
    { code: "SP-BRG-0022", desc: "Bearing SKF 6205-2RS",        unit: "ea", plan: 1, onHand: 8,  lastUsed: "2026-02-28", cost: "€18.40" },
    { code: "SP-LUB-0042", desc: "Gearbox Lubricant 5L",         unit: "L",  plan: 5, onHand: 2,  lastUsed: "2026-04-01", cost: "€12.50", low: true },
    { code: "SP-SEA-0011", desc: "Auger seal ring",              unit: "ea", plan: 2, onHand: 14, lastUsed: "2026-03-12", cost: "€6.80" },
  ],
  documents: [
    { name: "GEA M-002 Operator Manual v3.pdf",     type: "pdf", uploadedAt: "2024-08-02", uploadedBy: "A. Majewska", size: "4.2 MB" },
    { name: "M-002 Lubrication SOP.pdf",             type: "pdf", uploadedAt: "2025-01-14", uploadedBy: "M. Nowak",    size: "640 KB" },
    { name: "Gearbox assembly drawing Rev.C.pdf",    type: "pdf", uploadedAt: "2024-08-02", uploadedBy: "A. Majewska", size: "1.1 MB" },
  ],
  // Downtime events linked to this asset — cross-ref to 08-PRODUCTION DOWNTIME
  downtime: [
    { t: "2026-04-20 10:22", line: "LINE-02", dur: 23, cat: "Plant — Breakdown", mwo: "MWO-2026-0042", src: "auto", note: "Mixer M-002 auger jam — cleaning required" },
    { t: "2026-04-15 14:12", line: "LINE-01", dur: 18, cat: "Plant — Breakdown", mwo: "MWO-2026-0030", src: "manual" },
    { t: "2026-04-08 08:44", line: "LINE-01", dur: 9,  cat: "Plant — Breakdown", mwo: null,            src: "unlinked", note: "Brief stall, auto-recovered" },
  ],
};

// ============================================================
// WORK REQUESTS (MAINT-004)
// ============================================================
const MNT_WRS = [
  { wr: "WR-2026-0891", asset: "Mixer M-002",      reporter: "K. Nowacki",   reportedAt: "2026-04-21 06:58", pri: "critical", status: "in_progress", desc: "Loud grinding noise from rear bearing, auger jammed during batch.", mwo: "MWO-2026-0042" },
  { wr: "WR-2026-0892", asset: "Sealer SL-14",     reporter: "P. Kowalski",  reportedAt: "2026-04-20 22:50", pri: "high",     status: "in_progress", desc: "Sealing head temperature fluctuates, leaving weak seams on packs.", mwo: "MWO-2026-0043" },
  { wr: "WR-2026-0893", asset: "Thermometer TH-12",reporter: "QA.Wiśniewski",reportedAt: "2026-04-21 05:15", pri: "critical", status: "approved",    desc: "Calibration overdue per QA scan — CCP-003 blocked.", mwo: "MWO-2026-0041" },
  { wr: "WR-2026-0894", asset: "Scale SC-04",      reporter: "A. Majewska",  reportedAt: "2026-04-21 07:30", pri: "medium",   status: "requested",   desc: "Tare drift 12g on repeat weigh — suspect load cell.", mwo: null },
  { wr: "WR-2026-0895", asset: "Conveyor CONV-03", reporter: "M. Szymczak",  reportedAt: "2026-04-21 08:02", pri: "low",      status: "requested",   desc: "Guard rubber strip flaking near Span-1.", mwo: null },
  { wr: "WR-2026-0896", asset: "CIP Unit CIP-01",  reporter: "J. Wolak",     reportedAt: "2026-04-21 08:44", pri: "medium",   status: "requested",   desc: "Nozzle 4 shows reduced flow during rinse cycle.", mwo: null },
  { wr: "WR-2026-0897", asset: "Dough Mixer DM-02",reporter: "M. Rogala",    reportedAt: "2026-04-21 09:00", pri: "low",      status: "requested",   desc: "Oil drip under gearbox — minor.", mwo: null },
  { wr: "WR-2026-0890", asset: "Mixer M-002",      reporter: "K. Nowacki",   reportedAt: "2026-04-20 12:10", pri: "medium",   status: "completed",   desc: "Vibration above normal on startup.", mwo: "MWO-2026-0038" },
  // Fix-1 Maintenance: `rejected` is not in PRD state machine (valid states:
  // requested/approved/open/in_progress/completed/cancelled). Mapped to `cancelled`
  // with a cancellation reason. Audit B1 / Section C state-machine alignment.
  { wr: "WR-2026-0889", asset: "Packer PK-08",     reporter: "P. Kowalski",  reportedAt: "2026-04-20 09:14", pri: "low",      status: "cancelled",   desc: "Packer beeps occasionally.", mwo: null, cancelReason: "Not a maintenance issue — operator training on beep codes scheduled." },
];

// ============================================================
// mWOs (MAINT-007)
// ============================================================
const MNT_MWOS = [
  { mwo: "MWO-2026-0042", asset: "Mixer M-002",       assetId: "AST-1001", type: "reactive",    pri: "critical", status: "in_progress", tech: "M. Nowak",    start: "2026-04-21 07:00", eta: "2026-04-21 10:00", dtImpact: "Yes", src: "auto_downtime",  delayedWos: ["WO-2026-0108","WO-2026-0111"] },
  { mwo: "MWO-2026-0043", asset: "Sealer SL-14",      assetId: "AST-1003", type: "reactive",    pri: "high",     status: "in_progress", tech: "K. Dudek",    start: "2026-04-20 23:00", eta: "2026-04-21 08:00", dtImpact: "Yes", src: "auto_downtime",  delayedWos: ["WO-2026-0100B"] },
  { mwo: "MWO-2026-0041", asset: "Thermometer TH-12", assetId: "AST-1031", type: "calibration", pri: "critical", status: "approved",    tech: null,          start: "2026-04-21 11:00", eta: "2026-04-21 12:30", dtImpact: "No",  src: "calibration_alert", delayedWos: [] },
  { mwo: "MWO-2026-0040", asset: "Conveyor CONV-03",  assetId: "AST-1004", type: "preventive",  pri: "medium",   status: "open",        tech: "M. Nowak",    start: "2026-04-21 10:00", eta: "2026-04-21 11:30", dtImpact: "No",  src: "pm_schedule",    delayedWos: [] },
  { mwo: "MWO-2026-0044", asset: "Scale SC-04",       assetId: "AST-1022", type: "calibration", pri: "high",     status: "approved",    tech: "A. Majewska", start: "2026-04-22 08:00", eta: "2026-04-22 09:30", dtImpact: "No",  src: "calibration_alert", delayedWos: [] },
  { mwo: "MWO-2026-0045", asset: "Packer PK-08",      assetId: "AST-1032", type: "preventive",  pri: "low",      status: "completed",   tech: "A. Majewska", start: "2026-04-21 06:30", eta: "2026-04-21 08:00", dtImpact: "No",  src: "pm_schedule",    delayedWos: [] },
  { mwo: "MWO-2026-0046", asset: "CIP Unit CIP-01",   assetId: "AST-1050", type: "sanitation",  pri: "high",     status: "in_progress", tech: "J. Wolak",    start: "2026-04-21 05:00", eta: "2026-04-21 09:00", dtImpact: "No",  src: "pm_schedule",    delayedWos: [], allergen: true },
  { mwo: "MWO-2026-0038", asset: "Mixer M-002",       assetId: "AST-1001", type: "reactive",    pri: "medium",   status: "completed",   tech: "M. Nowak",    start: "2026-04-20 13:00", eta: "2026-04-20 14:30", dtImpact: "Yes", src: "manual",         delayedWos: [] },
  { mwo: "MWO-2026-0039", asset: "Tumbler T-22",      assetId: "AST-1020", type: "inspection",  pri: "low",      status: "completed",   tech: "A. Majewska", start: "2026-04-20 09:00", eta: "2026-04-20 09:45", dtImpact: "No",  src: "pm_schedule",    delayedWos: [] },
  { mwo: "MWO-2026-0037", asset: "Oven OV-05",        assetId: "AST-1030", type: "preventive",  pri: "medium",   status: "cancelled",   tech: "M. Nowak",    start: "2026-04-19 14:00", eta: "2026-04-19 15:30", dtImpact: "No",  src: "pm_schedule",    delayedWos: [], cancelReason: "Line shutdown for allergen changeover — re-scheduled to 2026-04-24." },
  { mwo: "MWO-2026-0047", asset: "Compressor CP-02",  assetId: "AST-1051", type: "inspection",  pri: "medium",   status: "requested",   tech: null,          start: "2026-04-22 07:00", eta: "2026-04-22 08:00", dtImpact: "No",  src: "manual",         delayedWos: [] },
  { mwo: "MWO-2026-0048", asset: "Dough Mixer DM-02", assetId: "AST-1040", type: "preventive",  pri: "low",      status: "open",        tech: "K. Dudek",    start: "2026-04-22 13:00", eta: "2026-04-22 14:30", dtImpact: "No",  src: "pm_schedule",    delayedWos: [] },
  { mwo: "MWO-2026-0049", asset: "pH Meter PH-03",    assetId: "AST-1052", type: "calibration", pri: "medium",   status: "open",        tech: "A. Majewska", start: "2026-04-23 10:00", eta: "2026-04-23 11:00", dtImpact: "No",  src: "pm_schedule",    delayedWos: [] },
  { mwo: "MWO-2026-0050", asset: "Forming FM-11",     assetId: "AST-1041", type: "preventive",  pri: "low",      status: "open",        tech: "M. Nowak",    start: "2026-04-23 14:00", eta: "2026-04-23 15:30", dtImpact: "No",  src: "pm_schedule",    delayedWos: [] },
];

// mWO Detail subject — MWO-2026-0042 (reactive, critical, in_progress, LOTO active)
const MNT_MWO_DETAIL = {
  mwo: "MWO-2026-0042",
  state: "in_progress",
  type: "reactive",
  pri: "critical",
  src: "auto_downtime",
  asset: { id: "AST-1001", code: "EQ-2024-0042", name: "Mixer M-002", icon: "⚙", loc: ["WH-Factory-A","LINE-01","Station-1"] },
  requester: { name: "K. Nowacki (LINE-02 supervisor)", ts: "2026-04-21 06:58" },
  problem: "Loud grinding noise from rear bearing, auger jammed during batch. Operator stopped line LINE-02 and flagged via scanner QR.",
  tech: { name: "M. Nowak", avatar: "MN", phone: "+48 512 000 111" },
  scheduledStart: "2026-04-21 07:00",
  scheduledEnd:   "2026-04-21 10:00",
  actualStart:    "2026-04-21 07:04",
  estimatedCost:  240.00,
  actualCost:     null,
  completionNotes: "",
  downtimeEvent: { id: "DT-2026-0891", line: "LINE-02", start: "2026-04-20 10:22", duration: 23, cause: "Plant — Breakdown", note: "Auger jam" },
  lotoProc: "LOTO-2026-0089",
  lotoActive: true,
  lotoVerified: true,
  delayedWos: [
    { wo: "WO-2026-0108", product: "FA5100 · Kiełbasa śląska pieczona 450g", delay: "2h 15m", status: "paused" },
    { wo: "WO-2026-0111", product: "FA5021 · Gulasz wołowy",                  delay: "1h 40m", status: "queued" },
  ],
  tasks: [
    { n: 1, desc: "Lock out / tag out (LOTO) complete",                                                          type: "signoff", done: true,  by: "M. Nowak",    ts: "07:04", measure: null },
    { n: 2, desc: "Visual inspection of auger and jam cause",                                                    type: "check",   done: true,  by: "M. Nowak",    ts: "07:10", measure: null },
    { n: 3, desc: "Photograph jammed material before removal",                                                   type: "photo",   done: true,  by: "M. Nowak",    ts: "07:12", measure: null },
    { n: 4, desc: "Remove jam material (frozen pork fat chunk)",                                                 type: "check",   done: true,  by: "M. Nowak",    ts: "07:28", measure: null },
    { n: 5, desc: "Inspect rear bearing — measure runout",                                                       type: "measure", done: true,  by: "M. Nowak",    ts: "07:40", measure: { expected: "< 0.15 mm", actual: "0.22 mm", pass: false } },
    { n: 6, desc: "Replace rear bearing SKF 6205-2RS",                                                           type: "check",   done: false, by: null,          ts: null,    measure: null },
    { n: 7, desc: "Lubricate gearbox (5L Castrol EP2)",                                                          type: "check",   done: false, by: null,          ts: null,    measure: null },
    { n: 8, desc: "Verify auger rotation, no-load test",                                                         type: "measure", done: false, by: null,          ts: null,    measure: { expected: "< 60 dB @ 1m", actual: null, pass: null } },
    { n: 9, desc: "Clear LOTO after work complete",                                                              type: "signoff", done: false, by: null,          ts: null,    measure: null },
    { n: 10,desc: "Test run with 20 kg dummy load, sign off",                                                    type: "signoff", done: false, by: null,          ts: null,    measure: null },
  ],
  plannedParts: [
    { code: "SP-BRG-0022", desc: "Bearing SKF 6205-2RS",       plan: 1, actual: 0, unit: "ea", cost: 18.40, consumed: false },
    { code: "SP-LUB-0042", desc: "Gearbox Lubricant 5L",        plan: 1, actual: 0, unit: "L",  cost: 12.50, consumed: false },
  ],
  unplannedParts: [
    { code: "SP-SEA-0011", desc: "Auger seal ring",             plan: 0, actual: 2, unit: "ea", cost: 6.80,  consumed: true, consumedAt: "07:32", by: "M. Nowak" },
  ],
  labor: [
    { tech: "M. Nowak", start: "07:04", end: null, dur: "1h 24m", note: "Diagnosing and cleaning" },
  ],
  signoffs: [
    { role: "Technician",     name: "M. Nowak",     ts: null, pending: true, avatar: "MN" },
    { role: "Supervisor",     name: null,           ts: null, pending: true, avatar: null },
    { role: "Safety Officer", name: null,           ts: null, pending: true, avatar: null, required: true, reason: "LOTO active — safety officer sign-off required" },
  ],
  history: [
    { t: "2026-04-21 06:58", color: "blue",  desc: "WR WR-2026-0891 submitted by K. Nowacki" },
    { t: "2026-04-21 06:59", color: "blue",  desc: "Auto-linked to DT-2026-0891 (LINE-02 downtime event)" },
    { t: "2026-04-21 07:01", color: "blue",  desc: "Triaged by WH.Manager — approved, critical priority" },
    { t: "2026-04-21 07:02", color: "amber", desc: "LOTO LOTO-2026-0089 applied — 3 energy sources isolated" },
    { t: "2026-04-21 07:04", color: "blue",  desc: "State changed from open → in_progress by M. Nowak" },
    { t: "2026-04-21 07:12", color: "green", desc: "Task 3 completed — photo uploaded" },
    { t: "2026-04-21 07:28", color: "green", desc: "Task 4 completed — jam removed" },
    { t: "2026-04-21 07:32", color: "amber", desc: "Unplanned part consumed — SP-SEA-0011 × 2" },
    { t: "2026-04-21 07:40", color: "red",   desc: "Task 5 measurement FAIL — bearing runout 0.22mm (spec <0.15mm)" },
  ],
};

// ============================================================
// PM SCHEDULES (MAINT-009)
// ============================================================
const MNT_PM_SCHEDULES = [
  { pm: "PM-0001", asset: "Mixer M-002",       assetId: "AST-1001", type: "preventive",  freq: "Every 30 days",   lastDone: "2026-04-01", nextDue: "2026-05-01", days: 10,  tech: "M. Nowak",    tmpl: "Monthly Lubrication Checklist", auto: true, active: true },
  { pm: "PM-0002", asset: "Mixer M-002",       assetId: "AST-1001", type: "inspection",  freq: "Every 180 days",  lastDone: "2026-01-15", nextDue: "2026-07-15", days: 85,  tech: "A. Majewska", tmpl: "Semi-annual gearbox inspection", auto: true, active: true },
  { pm: "PM-0003", asset: "Grinder GR-07",     assetId: "AST-1002", type: "preventive",  freq: "Every 30 days",   lastDone: "2026-03-28", nextDue: "2026-04-27", days: 6,   tech: "M. Nowak",    tmpl: "Monthly Grinder Lubrication", auto: true, active: true },
  { pm: "PM-0004", asset: "Sealer SL-14",      assetId: "AST-1003", type: "preventive",  freq: "Every 30 days",   lastDone: "2026-03-15", nextDue: "2026-04-14", days: -7,  tech: "K. Dudek",    tmpl: "Monthly Sealer PM", auto: true, active: true },
  { pm: "PM-0005", asset: "Conveyor CONV-03",  assetId: "AST-1004", type: "preventive",  freq: "Every 30 days",   lastDone: "2026-04-10", nextDue: "2026-05-10", days: 19,  tech: "M. Nowak",    tmpl: "Belt inspection + alignment", auto: true, active: true },
  { pm: "PM-0006", asset: "Tumbler T-22",      assetId: "AST-1020", type: "preventive",  freq: "Every 30 days",   lastDone: "2026-03-22", nextDue: "2026-04-22", days: 1,   tech: "A. Majewska", tmpl: "Monthly Tumbler PM", auto: true, active: true },
  { pm: "PM-0007", asset: "Cooker CK-09",      assetId: "AST-1021", type: "preventive",  freq: "Every 30 days",   lastDone: "2026-04-08", nextDue: "2026-05-08", days: 17,  tech: "J. Wolak",    tmpl: "Steam cooker monthly", auto: true, active: true },
  { pm: "PM-0008", asset: "Cooker CK-09",      assetId: "AST-1021", type: "calibration", freq: "Every 90 days",   lastDone: "2026-03-01", nextDue: "2026-05-30", days: 39,  tech: "A. Majewska", tmpl: "Thermocouple calibration", auto: true, active: true },
  { pm: "PM-0009", asset: "Scale SC-04",       assetId: "AST-1022", type: "calibration", freq: "Every 90 days",   lastDone: "2026-01-20", nextDue: "2026-04-20", days: -1,  tech: "A. Majewska", tmpl: "Scale calibration 1kg/5kg/10kg", auto: true, active: true },
  { pm: "PM-0010", asset: "Oven OV-05",        assetId: "AST-1030", type: "preventive",  freq: "Every 30 days",   lastDone: "2026-03-22", nextDue: "2026-04-22", days: 1,   tech: "M. Nowak",    tmpl: "Monthly Oven PM", auto: true, active: true },
  { pm: "PM-0011", asset: "Thermometer TH-12", assetId: "AST-1031", type: "calibration", freq: "Every 90 days",   lastDone: "2026-01-15", nextDue: "2026-04-15", days: -6,  tech: "A. Majewska", tmpl: "Thermometer 3-point calibration", auto: true, active: true },
  { pm: "PM-0012", asset: "Packer PK-08",      assetId: "AST-1032", type: "preventive",  freq: "Every 30 days",   lastDone: "2026-04-05", nextDue: "2026-05-05", days: 14,  tech: "K. Dudek",    tmpl: "Packer head monthly", auto: true, active: true },
  { pm: "PM-0013", asset: "Dough Mixer DM-02", assetId: "AST-1040", type: "preventive",  freq: "Every 60 days",   lastDone: "2026-03-20", nextDue: "2026-05-19", days: 28,  tech: "M. Nowak",    tmpl: "Dough Mixer bi-monthly", auto: true, active: true },
  { pm: "PM-0014", asset: "CIP Unit CIP-01",   assetId: "AST-1050", type: "sanitation",  freq: "Every 7 days",    lastDone: "2026-04-14", nextDue: "2026-04-21", days: 0,   tech: "J. Wolak",    tmpl: "Weekly CIP sanitation + ATP", auto: true, active: true, allergen: true },
  { pm: "PM-0015", asset: "CIP Unit CIP-01",   assetId: "AST-1050", type: "inspection",  freq: "Every 14 days",   lastDone: "2026-04-14", nextDue: "2026-04-28", days: 7,   tech: "J. Wolak",    tmpl: "CIP nozzle inspection", auto: true, active: true },
  { pm: "PM-0016", asset: "Compressor CP-02",  assetId: "AST-1051", type: "preventive",  freq: "Every 90 days",   lastDone: "2026-03-10", nextDue: "2026-06-08", days: 48,  tech: "K. Dudek",    tmpl: "Quarterly compressor PM", auto: true, active: true },
  { pm: "PM-0017", asset: "pH Meter PH-03",    assetId: "AST-1052", type: "calibration", freq: "Every 90 days",   lastDone: "2026-02-14", nextDue: "2026-05-14", days: 23,  tech: "A. Majewska", tmpl: "pH buffer 4/7/10 calibration", auto: true, active: true },
  { pm: "PM-0018", asset: "Forming FM-11",     assetId: "AST-1041", type: "preventive",  freq: "Every 60 days",   lastDone: "2026-03-30", nextDue: "2026-05-29", days: 38,  tech: "M. Nowak",    tmpl: "Forming die inspection", auto: true, active: true },
  { pm: "PM-0019", asset: "Sealer SL-14",      assetId: "AST-1003", type: "sanitation",  freq: "Every 7 days",    lastDone: "2026-04-14", nextDue: "2026-04-21", days: 0,   tech: "K. Dudek",    tmpl: "Weekly sealer sanitation", auto: true, active: true },
  { pm: "PM-0020", asset: "Tumbler T-22",      assetId: "AST-1020", type: "preventive",  freq: "Every 90 days",   lastDone: "2026-02-22", nextDue: "2026-05-23", days: 32,  tech: "A. Majewska", tmpl: "Quarterly gearbox PM", auto: true, active: true },
  { pm: "PM-0021", asset: "Oven OV-05",        assetId: "AST-1030", type: "sanitation",  freq: "Every 14 days",   lastDone: "2026-04-07", nextDue: "2026-04-21", days: 0,   tech: "J. Wolak",    tmpl: "Oven interior sanitation", auto: true, active: true, allergen: true },
  { pm: "PM-0022", asset: "Mixer M-002",       assetId: "AST-1001", type: "sanitation",  freq: "Every 7 days",    lastDone: "2026-04-14", nextDue: "2026-04-21", days: 0,   tech: "J. Wolak",    tmpl: "Weekly mixer sanitation", auto: false,active: false },
  { pm: "PM-0023", asset: "Packer PK-08",      assetId: "AST-1032", type: "inspection",  freq: "Every 30 days",   lastDone: null,         nextDue: "2026-05-05", days: 14,  tech: null,          tmpl: null, auto: false, active: true },
];

// ============================================================
// CALIBRATION (MAINT-011)
// ============================================================
const MNT_INSTRUMENTS = [
  { code: "CAL-TH-0012", name: "Line 1 Oven Thermometer",     type: "Thermometer", std: "ISO 9001", acc: "±0.5°C (0–200°C)", lastCal: "2026-01-15", nextDue: "2026-04-15", days: -6,  result: "PASS",        ccp: "CCP-003 Oven Temp", ccpBlock: true,  linkedMwo: "MWO-2026-0041", assetId: "AST-1031" },
  { code: "CAL-TH-0013", name: "Line 2 Cooker Thermometer",   type: "Thermometer", std: "ISO 9001", acc: "±0.5°C (0–200°C)", lastCal: "2026-03-01", nextDue: "2026-05-30", days: 39,  result: "PASS",        ccp: "CCP-005 Cook Temp", ccpBlock: false, linkedMwo: null, assetId: "AST-1021" },
  { code: "CAL-SC-0004", name: "Line 2 Scale 1kg/5kg/10kg",    type: "Scale",       std: "NIST",      acc: "±0.02% FS",         lastCal: "2026-01-20", nextDue: "2026-04-20", days: -1,  result: "PASS",        ccp: "CCP-007 Weight",    ccpBlock: true,  linkedMwo: "MWO-2026-0044", assetId: "AST-1022" },
  { code: "CAL-SC-0005", name: "Dispatch Scale 25kg",          type: "Scale",       std: "NIST",      acc: "±0.05% FS",         lastCal: "2026-02-10", nextDue: "2026-05-10", days: 19,  result: "PASS",        ccp: null,                 ccpBlock: false, linkedMwo: null, assetId: null },
  { code: "CAL-PH-0003", name: "QA Lab pH Meter",              type: "pH Meter",    std: "Internal",  acc: "±0.01 pH",           lastCal: "2026-02-14", nextDue: "2026-05-14", days: 23,  result: "PASS",        ccp: "CCP-009 Acidity",   ccpBlock: false, linkedMwo: null, assetId: "AST-1052" },
  { code: "CAL-TH-0014", name: "Cold Store B3 Thermometer",   type: "Thermometer", std: "ISO 9001", acc: "±0.3°C",            lastCal: "2026-03-22", nextDue: "2026-06-20", days: 60,  result: "OUT_OF_SPEC", ccp: null,                 ccpBlock: false, linkedMwo: null, assetId: null },
  { code: "CAL-TH-0015", name: "Receiving Dock IR Gun",        type: "Thermometer", std: "Internal",  acc: "±1.0°C",            lastCal: "2026-04-01", nextDue: "2026-07-01", days: 71,  result: "PASS",        ccp: null,                 ccpBlock: false, linkedMwo: null, assetId: null },
  { code: "CAL-SC-0006", name: "Receiving Platform Scale 100kg", type: "Scale",     std: "NIST",      acc: "±0.1% FS",          lastCal: "2026-01-05", nextDue: "2026-04-05", days: -16, result: "FAIL",        ccp: null,                 ccpBlock: false, linkedMwo: "MWO-2026-0020", assetId: null },
];

const MNT_CAL_DETAIL = {
  code: "CAL-TH-0012",
  name: "Line 1 Oven Thermometer",
  type: "Thermometer",
  std: "ISO 9001",
  acc: "±0.5°C (0–200°C)",
  asset: { id: "AST-1031", name: "Thermometer TH-12" },
  interval: 90,
  active: true,
  ccp: "CCP-003 Oven Temp",
  ccpBlock: true,
  nextDue: "2026-04-15",
  days: -6,
  latestResult: "PASS",
  records: [
    { id: "CR-2026-0012", date: "2026-01-15 14:22", by: "A. Majewska", std: "ISO 9001", result: "PASS", points: 3, passCount: 3, nextDue: "2026-04-15", retentionUntil: "2033-04-15", mwo: "MWO-2025-0198", cert: "cert_cal_th_0012_2026q1.pdf", sha256: "8f4e7c2a1b9d6e3f..." },
    { id: "CR-2025-0089", date: "2025-10-17 10:45", by: "M. Nowak",    std: "ISO 9001", result: "PASS", points: 3, passCount: 3, nextDue: "2026-01-15", retentionUntil: "2032-10-15", mwo: "MWO-2025-0102", cert: "cert_cal_th_0012_2025q4.pdf", sha256: "3a1b5c7d9e2f4068..." },
    { id: "CR-2025-0045", date: "2025-07-18 09:12", by: "A. Majewska", std: "ISO 9001", result: "OUT_OF_SPEC", points: 3, passCount: 2, nextDue: "2025-10-18", retentionUntil: "2032-07-18", mwo: "MWO-2025-0067", cert: null,                              sha256: null },
  ],
  latestPoints: [
    { ref: "0.0 °C",   meas: "0.1 °C",   tol: "0.5", inSpec: true },
    { ref: "100.0 °C", meas: "99.6 °C",  tol: "0.5", inSpec: true },
    { ref: "180.0 °C", meas: "180.3 °C", tol: "0.5", inSpec: true },
  ],
};

// ============================================================
// SPARE PARTS (MAINT-013)
// Cross-ref Warehouse LPs for spare part reservations
// ============================================================
const MNT_SPARES = [
  { code: "SP-LUB-0042", desc: "Gearbox Lubricant 5L (Castrol EP2)", cat: "Lubricants",  unit: "L",   onHand: 2,   min: 5,  max: 25, lastUsed: "2026-04-01", leadTime: "3 days",  unitCost: 12.50, critical: true, supplier: "Castrol PL",    whLp: "LP00000340", whLoc: ["WH-Factory-A","Dry","A2"] },
  { code: "SP-BRG-0022", desc: "Bearing SKF 6205-2RS",                cat: "Bearings",    unit: "ea",  onHand: 8,   min: 4,  max: 15, lastUsed: "2026-02-28", leadTime: "5 days",  unitCost: 18.40, critical: true, supplier: "SKF Polska",    whLp: "LP00000341", whLoc: ["WH-Factory-A","Dry","A3"] },
  { code: "SP-SEA-0011", desc: "Auger seal ring (FPM Viton)",         cat: "Seals",       unit: "ea",  onHand: 14,  min: 6,  max: 30, lastUsed: "2026-04-21", leadTime: "2 days",  unitCost: 6.80,  critical: false, supplier: "EagleBurgmann", whLp: "LP00000342", whLoc: ["WH-Factory-A","Dry","A3"] },
  { code: "SP-BLT-0003", desc: "Conveyor belt 1200mm × 40m PU",        cat: "Belts",       unit: "m",   onHand: 24,  min: 15, max: 80, lastUsed: "2026-03-12", leadTime: "10 days", unitCost: 42.00, critical: true, supplier: "Habasit PL",    whLp: "LP00000343", whLoc: ["WH-Factory-A","Dry","B2"] },
  { code: "SP-HTE-0008", desc: "Heating element 2kW 230V (Sealer)",    cat: "Electrical",  unit: "ea",  onHand: 3,   min: 2,  max: 8,  lastUsed: "2026-03-20", leadTime: "7 days",  unitCost: 58.00, critical: true, supplier: "Watlow EU",     whLp: null,          whLoc: null },
  { code: "SP-OIL-0051", desc: "Hydraulic oil ISO VG46 5L",             cat: "Lubricants",  unit: "L",   onHand: 32,  min: 10, max: 60, lastUsed: "2026-03-10", leadTime: "4 days",  unitCost: 9.80,  critical: false, supplier: "Orlen Oil",     whLp: "LP00000344", whLoc: ["WH-Factory-A","Dry","A2"] },
  { code: "SP-FLT-0014", desc: "Air filter HEPA H13 (Compressor)",     cat: "Filters",     unit: "ea",  onHand: 6,   min: 4,  max: 12, lastUsed: "2026-03-10", leadTime: "5 days",  unitCost: 34.00, critical: true, supplier: "Camfil PL",     whLp: "LP00000345", whLoc: ["WH-Factory-A","Dry","B1"] },
  { code: "SP-FLT-0015", desc: "Water filter 5μm (CIP)",                cat: "Filters",     unit: "ea",  onHand: 18,  min: 10, max: 40, lastUsed: "2026-04-14", leadTime: "3 days",  unitCost: 7.20,  critical: false, supplier: "3M Polska",     whLp: "LP00000346", whLoc: ["WH-Factory-A","Dry","B1"] },
  { code: "SP-NOZ-0027", desc: "CIP spray nozzle stainless 45°",        cat: "CIP Parts",   unit: "ea",  onHand: 4,   min: 6,  max: 20, lastUsed: "2026-04-14", leadTime: "14 days", unitCost: 88.00, critical: true, supplier: "Lechler",       whLp: null,          whLoc: null },
  { code: "SP-GLK-0099", desc: "Glycol antifreeze 25L",                  cat: "Fluids",      unit: "L",   onHand: 0,   min: 10, max: 50, lastUsed: "2026-02-22", leadTime: "6 days",  unitCost: 5.20,  critical: false, supplier: "Chem-Most",     whLp: null,          whLoc: null },
  { code: "SP-GEA-0033", desc: "Gear oil SAE 90 20L drum",              cat: "Lubricants",  unit: "L",   onHand: 40,  min: 10, max: 100,lastUsed: "2026-01-30", leadTime: "4 days",  unitCost: 8.90,  critical: false, supplier: "Castrol PL",    whLp: "LP00000347", whLoc: ["WH-Factory-A","Dry","A2"] },
  { code: "SP-MOT-0007", desc: "Motor 7.5kW IE3 B5 flange",              cat: "Motors",      unit: "ea",  onHand: 1,   min: 1,  max: 2,  lastUsed: "2026-02-28", leadTime: "21 days", unitCost: 820.00,critical: true, supplier: "Siemens PL",    whLp: "LP00000348", whLoc: ["WH-Factory-A","Dry","B3"] },
];

// Spare part detail subject
const MNT_SPARE_DETAIL = {
  code: "SP-LUB-0042",
  desc: "Gearbox Lubricant 5L (Castrol EP2)",
  cat: "Lubricants",
  unit: "L",
  supplier: "Castrol PL",
  supplierCode: "CAS-EP2-5L",
  shelfLifeDays: 720,
  unitCost: 12.50,
  critical: true,
  onHand: 2,
  min: 5,
  max: 25,
  stock: [
    { wh: "WH-Factory-A", loc: "WH-Factory-A › Dry › A2", qty: 2, min: 5, lastCounted: "2026-04-14", lp: "LP00000340" },
  ],
  transactions: [
    { t: "2026-04-01 09:14", type: "consume", qty: -5,  mwo: "MWO-2026-0020", by: "A. Majewska", note: "Monthly PM lubrication" },
    { t: "2026-03-12 11:30", type: "consume", qty: -5,  mwo: "MWO-2026-0009", by: "M. Nowak",    note: "Monthly PM lubrication" },
    { t: "2026-02-10 14:22", type: "receipt", qty: 10, mwo: null,             by: "WH.Nowak",    note: "PO-2026-00026 receipt" },
    { t: "2026-02-12 08:02", type: "consume", qty: -5, mwo: "MWO-2026-0001", by: "A. Majewska", note: "Monthly PM lubrication" },
    { t: "2026-01-20 10:00", type: "receipt", qty: 10, mwo: null,             by: "WH.Nowak",    note: "PO-2026-00018 receipt" },
    { t: "2026-01-14 14:10", type: "adjust",  qty: -1, mwo: null,             by: "WH.Manager",  note: "Cycle count: -1" },
  ],
  linkedAssets: [
    { id: "AST-1001", name: "Mixer M-002",    plan: 5 },
    { id: "AST-1040", name: "Dough Mixer DM-02", plan: 5 },
    { id: "AST-1020", name: "Tumbler T-22",   plan: 5 },
  ],
};

// ============================================================
// TECHNICIANS (MAINT-015)
// ============================================================
const MNT_TECHNICIANS = [
  { id: "TEC-01", name: "M. Nowak",     email: "m.nowak@forza",     skill: "specialist", certs: ["IEC 60079","LOTO Cert.","Refrigeration L2","Food Safety L3"], certExp: "2027-02-20", onShift: true,  assignedMwos: 3, rate: 32.00, initials: "MN" },
  { id: "TEC-02", name: "A. Majewska",  email: "a.majewska@forza",  skill: "advanced",   certs: ["ISO 17025 Cal.","LOTO Cert."],                                 certExp: "2026-11-30", onShift: true,  assignedMwos: 2, rate: 28.00, initials: "AM" },
  { id: "TEC-03", name: "K. Dudek",     email: "k.dudek@forza",     skill: "advanced",   certs: ["LOTO Cert.","Welding Cert."],                                 certExp: "2026-06-15", onShift: true,  assignedMwos: 2, rate: 26.00, initials: "KD" },
  { id: "TEC-04", name: "J. Wolak",     email: "j.wolak@forza",     skill: "basic",      certs: ["Sanitation Cert.","LOTO Cert."],                              certExp: "2026-05-01", onShift: true,  assignedMwos: 2, rate: 22.00, initials: "JW" },
  { id: "TEC-05", name: "M. Rogala",    email: "m.rogala@forza",    skill: "basic",      certs: ["LOTO Cert."],                                                 certExp: "2026-08-12", onShift: false, assignedMwos: 0, rate: 22.00, initials: "MR" },
  { id: "TEC-06", name: "P. Szczurek",  email: "p.szczurek@forza",  skill: "specialist", certs: ["ATEX Cert.","LOTO Cert.","High-Voltage Cert.","ISO 17025"],    certExp: "2026-04-30", onShift: false, assignedMwos: 1, rate: 34.00, initials: "PS" },
];

const MNT_SKILLS = ["Mechanical", "Electrical", "Pneumatic", "Calibration", "LOTO", "Sanitation", "Welding", "Refrigeration", "Gearbox", "Hydraulic"];
const MNT_SKILL_MATRIX = {
  "TEC-01": { Mechanical:"specialist", Electrical:"has", Pneumatic:"has", Calibration:"has", LOTO:"specialist", Sanitation:"has", Welding:"has",       Refrigeration:"specialist", Gearbox:"specialist", Hydraulic:"has" },
  "TEC-02": { Mechanical:"has", Electrical:"has",           Pneumatic:"has", Calibration:"specialist", LOTO:"has", Sanitation:"has", Welding:"none",      Refrigeration:"none",       Gearbox:"has",        Hydraulic:"none" },
  "TEC-03": { Mechanical:"specialist", Electrical:"has",  Pneumatic:"has", Calibration:"none",       LOTO:"has", Sanitation:"none", Welding:"specialist",Refrigeration:"none",       Gearbox:"specialist", Hydraulic:"has" },
  "TEC-04": { Mechanical:"has", Electrical:"none",          Pneumatic:"none", Calibration:"none",      LOTO:"has", Sanitation:"specialist", Welding:"none", Refrigeration:"none",     Gearbox:"none",       Hydraulic:"none" },
  "TEC-05": { Mechanical:"has", Electrical:"has",           Pneumatic:"none", Calibration:"none",      LOTO:"has", Sanitation:"has", Welding:"none",      Refrigeration:"none",       Gearbox:"none",       Hydraulic:"has" },
  "TEC-06": { Mechanical:"has", Electrical:"specialist",  Pneumatic:"has", Calibration:"specialist",LOTO:"has", Sanitation:"none", Welding:"has",      Refrigeration:"has",        Gearbox:"has",        Hydraulic:"specialist" },
};

// ============================================================
// LOTO (MAINT-017)
// ============================================================
const MNT_LOTO_PROCS = [
  { proc: "LOTO-2026-0089", asset: "Mixer M-002",      assetId: "AST-1001", mwo: "MWO-2026-0042", nrg: 3, tags: 3, status: "active",  appliedBy: "M. Nowak",   appliedAt: "2026-04-21 07:02", expectedClear: "2026-04-21 10:00", verifiedBy: "A. Kowalski (Safety)", clearedBy: null },
  { proc: "LOTO-2026-0088", asset: "Sealer SL-14",     assetId: "AST-1003", mwo: "MWO-2026-0043", nrg: 2, tags: 2, status: "active",  appliedBy: "K. Dudek",   appliedAt: "2026-04-20 23:14", expectedClear: "2026-04-21 08:00", verifiedBy: "A. Kowalski (Safety)", clearedBy: null },
  { proc: "LOTO-2026-0087", asset: "Oven OV-05",       assetId: "AST-1030", mwo: "MWO-2026-0037", nrg: 4, tags: 4, status: "cleared", appliedBy: "M. Nowak",   appliedAt: "2026-04-19 13:58", expectedClear: "2026-04-19 16:00", verifiedBy: "A. Kowalski (Safety)", clearedBy: "M. Nowak" },
  { proc: "LOTO-2026-0086", asset: "Mixer M-002",      assetId: "AST-1001", mwo: "MWO-2026-0038", nrg: 3, tags: 3, status: "cleared", appliedBy: "M. Nowak",   appliedAt: "2026-04-20 13:00", expectedClear: "2026-04-20 14:30", verifiedBy: "A. Kowalski (Safety)", clearedBy: "A. Kowalski (Safety)" },
  { proc: "LOTO-2026-0085", asset: "Compressor CP-02", assetId: "AST-1051", mwo: "MWO-2026-0030", nrg: 5, tags: 5, status: "cleared", appliedBy: "K. Dudek",   appliedAt: "2026-04-18 09:00", expectedClear: "2026-04-18 12:00", verifiedBy: "A. Kowalski (Safety)", clearedBy: "K. Dudek" },
];

const MNT_LOTO_DETAIL = {
  proc: "LOTO-2026-0089",
  asset: { id: "AST-1001", name: "Mixer M-002", criticality: "critical" },
  mwo: "MWO-2026-0042",
  status: "active",
  appliedBy: "M. Nowak",
  appliedAt: "2026-04-21 07:02",
  zeroEnergyVerifiedBy: "M. Nowak",
  secondVerifier: "A. Kowalski (Safety)",
  energy: [
    { n: 1, desc: "Main electrical supply breaker",     iso: "Circuit breaker OFF + padlock", verifiedBy: "M. Nowak",    secondBy: "A. Kowalski", ts: "2026-04-21 07:00", done: true },
    { n: 2, desc: "Pneumatic air supply (6 bar)",       iso: "Ball valve CLOSED + lockout tag",verifiedBy: "M. Nowak",   secondBy: "A. Kowalski", ts: "2026-04-21 07:01", done: true },
    { n: 3, desc: "Residual mechanical (flywheel)",     iso: "Flywheel brake APPLIED + pin",  verifiedBy: "M. Nowak",    secondBy: "A. Kowalski", ts: "2026-04-21 07:02", done: true },
  ],
  tags: [
    { id: "TAG-R-001",  loc: "Main panel MCC-1", applied: "M. Nowak" },
    { id: "TAG-R-002",  loc: "Air shutoff valve",applied: "M. Nowak" },
    { id: "TAG-R-003",  loc: "Flywheel guard",   applied: "M. Nowak" },
  ],
};

// ============================================================
// ANALYTICS (MAINT-020)
// ============================================================
const MNT_ANALYTICS = {
  overview: {
    mtbf: "142h",       mtbfTrend: "+8h",
    mttr: "48m",        mttrTrend: "-6m",
    pmCompliance: 87.4, pmTrend: "+2.1pt",
    plannedRatio: 73,   plannedTrend: "+5pt",
    totalCost: "€24,850",   costTrend: "+€1,420",
    partsCost: "€8,420",    partsTrend: "+€980",
  },
  problemAssets: [
    { asset: "Sealer SL-14",   dtHours: 18.2, mwos: 9 },
    { asset: "Mixer M-002",    dtHours: 14.6, mwos: 7 },
    { asset: "Oven OV-05",     dtHours: 9.4,  mwos: 4 },
    { asset: "Conveyor CONV-03", dtHours: 7.1, mwos: 3 },
    { asset: "CIP Unit CIP-01", dtHours: 5.8, mwos: 5 },
  ],
  mtbfTrend: [130, 128, 135, 140, 138, 142, 145, 142, 140, 138, 142, 148, 142],
  mttrTrend: [62, 58, 54, 50, 48, 45, 52, 48, 50, 44, 48, 46, 48],
  pmCompliance: [
    { month: "Nov 25", compliance: 82 },
    { month: "Dec 25", compliance: 84 },
    { month: "Jan 26", compliance: 81 },
    { month: "Feb 26", compliance: 85 },
    { month: "Mar 26", compliance: 88 },
    { month: "Apr 26", compliance: 87 },
  ],
  pareto: [
    { cause: "Plant — Breakdown",      hours: 31.2, events: 8,  pct: 42 },
    { cause: "Process — Changeover",   hours: 18.8, events: 11, pct: 25 },
    { cause: "Plant — Cleaning",       hours: 14.5, events: 6,  pct: 19 },
    { cause: "People — Break",         hours: 6.0,  events: 14, pct: 8 },
    { cause: "Process — Material wait",hours: 4.2,  events: 9,  pct: 6 },
  ],
  techUtil: [
    { name: "M. Nowak",     hours: 168, avgPerMwo: "1h 24m", costYtd: "€5,376" },
    { name: "A. Majewska",  hours: 142, avgPerMwo: "1h 12m", costYtd: "€3,976" },
    { name: "K. Dudek",     hours: 118, avgPerMwo: "1h 38m", costYtd: "€3,068" },
    { name: "J. Wolak",     hours: 95,  avgPerMwo: "1h 48m", costYtd: "€2,090" },
    { name: "M. Rogala",    hours: 62,  avgPerMwo: "1h 10m", costYtd: "€1,364" },
    { name: "P. Szczurek",  hours: 108, avgPerMwo: "2h 00m", costYtd: "€3,672" },
  ],
};

// ============================================================
// SETTINGS
// ============================================================
const MNT_SETTINGS = {
  general: {
    pmLeadTimeDays: 7,
    calWarnDays: 30,
    calUrgentDays: 7,
    mtbfTarget: 120,
    availabilityBreach: 80,
    lotoDefaultOn: false,
  },
  autoWr: {
    enabled: true,
    dtThreshold: 15,
    antiDupWindow: 1,
  },
  sanitation: {
    atpRlu: 30,
    allergenDualSignoff: true,
  },
  loto: {
    twoPersonCritical: true,
    timeoutHours: 8,
    photoEvidence: "Recommended",
  },
  oeeTrigger: {
    enabled: false,
  },
  notifications: [
    { event: "PM overdue",                  freq: "Daily digest (07:00)", on: true },
    { event: "Calibration overdue",         freq: "Immediate",            on: true },
    { event: "WR SLA breach",               freq: "Immediate",            on: true },
    { event: "mWO scheduled today",         freq: "Morning digest",       on: true },
    { event: "LOTO timeout",                freq: "Immediate",            on: true },
    { event: "Spare below min",             freq: "Daily digest",         on: true },
    { event: "MTBF declining trend (>10%)", freq: "Weekly digest",        on: false },
    { event: "PM skipped",                  freq: "Immediate",            on: true },
    { event: "mWO assigned to me",          freq: "Immediate",            on: true },
  ],
  criticality: [
    { level: "Critical", desc: "Production-stopping failure. Halts a line or blocks a CCP." },
    { level: "High",     desc: "Significant impact on throughput or quality; requires same-shift response." },
    { level: "Medium",   desc: "Manageable impact; scheduled response within 24h." },
    { level: "Low",      desc: "Cosmetic or minor; fix at next planned opportunity." },
  ],
};

// ============================================================
// Checklist templates (for PM Template library preview)
// ============================================================
const MNT_TEMPLATES = [
  { name: "Monthly Lubrication Checklist",      steps: 8,  types: ["check","photo","signoff"] },
  { name: "Semi-annual gearbox inspection",     steps: 12, types: ["check","measure","photo","signoff"] },
  { name: "Weekly CIP sanitation + ATP",        steps: 9,  types: ["check","measure","signoff"] },
  { name: "Thermometer 3-point calibration",    steps: 5,  types: ["measure","signoff"] },
  { name: "Monthly Oven PM",                    steps: 10, types: ["check","measure","photo","signoff"] },
  { name: "Quarterly compressor PM",            steps: 14, types: ["check","measure","signoff"] },
];

// ============================================================
// SANITATION CHECKLISTS (MAINT-SAN) — D-MNT-14 + V-MNT-15..17
// Bound to PRD `sanitation_checklists` table (§9.14). Captures allergen
// dual sign-off, ATP result, product-type context, and prior allergen
// (allergens_removed JSONB). BRCGS 7-year retention.
// ============================================================
const MNT_SANITATION_CHECKLISTS = [
  {
    id: "SAN-2026-0104", mwo: "MWO-2026-0046", asset: "CIP Unit CIP-01", line: "LINE-05",
    status: "in_progress", startedAt: "2026-04-21 05:00", completedAt: null,
    productType: "allergen_changeover",
    allergenChangeFlag: true,
    allergensRemoved: ["Milk","Soy"],          // from previous batch on line
    priorProduct: "FA4210 · Serek premium (Milk, Soy)",
    nextProduct:  "FA5100 · Kiełbasa śląska (none)",
    // CIP measurements
    tempC: 82.4, concPct: 1.6, durationMin: 34, flowRateLpm: 185,
    // allergen validation
    atpRlu: null,                               // pending ATP swab
    firstSignedBy: "J. Wolak",  firstSignedAt: "2026-04-21 05:10",
    secondSignedBy: null,       secondSignedAt: null,     // QA dual sign-off pending
    retentionUntil: "2033-04-21",
  },
  {
    id: "SAN-2026-0103", mwo: "MWO-2026-0045", asset: "Packer PK-08", line: "LINE-03",
    status: "completed", startedAt: "2026-04-20 22:00", completedAt: "2026-04-20 22:48",
    productType: "routine_cip", allergenChangeFlag: false,
    allergensRemoved: [],
    priorProduct: "FA5100 · Kiełbasa śląska (none)",
    nextProduct:  "FA5100 · Kiełbasa śląska (none)",
    tempC: 78.9, concPct: 1.5, durationMin: 30, flowRateLpm: 180,
    atpRlu: 12,                                 // below 30 RLU threshold
    firstSignedBy: "A. Majewska", firstSignedAt: "2026-04-20 22:40",
    secondSignedBy: null, secondSignedAt: null, // non-allergen → no dual sign-off required
    retentionUntil: "2033-04-20",
  },
  {
    id: "SAN-2026-0102", mwo: "MWO-2026-0044", asset: "Tumbler T-22", line: "LINE-02",
    status: "completed", startedAt: "2026-04-20 18:00", completedAt: "2026-04-20 19:06",
    productType: "allergen_changeover", allergenChangeFlag: true,
    allergensRemoved: ["Mustard"],
    priorProduct: "FA5201 · Szynka musztardowa (Mustard)",
    nextProduct:  "FA5100 · Kiełbasa śląska (none)",
    tempC: 84.1, concPct: 1.8, durationMin: 42, flowRateLpm: 195,
    atpRlu: 8,
    firstSignedBy: "J. Wolak",      firstSignedAt: "2026-04-20 19:00",
    secondSignedBy: "QA.Wiśniewski",secondSignedAt: "2026-04-20 19:06",
    retentionUntil: "2033-04-20",
  },
  {
    id: "SAN-2026-0101", mwo: "MWO-2026-0042", asset: "Mixer M-002", line: "LINE-01",
    status: "failed", startedAt: "2026-04-20 03:00", completedAt: "2026-04-20 04:15",
    productType: "allergen_changeover", allergenChangeFlag: true,
    allergensRemoved: ["Soy"],
    priorProduct: "FA4210 · Serek premium (Soy)",
    nextProduct:  "FA5100 · Kiełbasa śląska (none)",
    tempC: 79.2, concPct: 1.4, durationMin: 28, flowRateLpm: 170,
    atpRlu: 48,                                 // FAIL: > 30 RLU → V-MNT-16 failure
    firstSignedBy: "K. Dudek",        firstSignedAt: "2026-04-20 04:10",
    secondSignedBy: "QA.Wiśniewski",  secondSignedAt: "2026-04-20 04:15",
    retentionUntil: "2033-04-20",
    failReason: "ATP 48 RLU above 30 RLU threshold — re-clean required before line release.",
  },
];

// Product-type options (V-MNT-16 validation domain) — stored as code list.
const MNT_SANITATION_PRODUCT_TYPES = [
  { key: "routine_cip",           label: "Routine CIP (same product)" },
  { key: "allergen_changeover",   label: "Allergen changeover" },
  { key: "product_changeover",    label: "Product changeover (non-allergen)" },
  { key: "end_of_shift",          label: "End-of-shift sanitation" },
  { key: "deep_clean",            label: "Deep clean / scheduled" },
];

Object.assign(window, {
  MNT_NAV, MNT_KPIS, MNT_ALERTS, MNT_TODAY_MWOS, MNT_ACTIVE_LOTO,
  MNT_ASSETS, MNT_ASSET_HIER, MNT_ASSET_DETAIL,
  MNT_WRS,
  MNT_MWOS, MNT_MWO_DETAIL,
  MNT_PM_SCHEDULES,
  MNT_INSTRUMENTS, MNT_CAL_DETAIL,
  MNT_SPARES, MNT_SPARE_DETAIL,
  MNT_TECHNICIANS, MNT_SKILLS, MNT_SKILL_MATRIX,
  MNT_LOTO_PROCS, MNT_LOTO_DETAIL,
  MNT_ANALYTICS,
  MNT_SETTINGS,
  MNT_TEMPLATES,
  MNT_SANITATION_CHECKLISTS, MNT_SANITATION_PRODUCT_TYPES,
});
