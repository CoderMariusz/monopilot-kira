// ============ OEE module — mock data ============
// Cross-refs to Production module (WO-2026-0042, LINE-01..05, DOWNTIME events).
// Date anchor: 2026-04-20 (yesterday per OQ-OEE-10) / 2026-04-21 (today).

const OEE_NAV = [
  { group: "Analytics", items: [
    { key: "summary",   label: "Daily summary",    ic: "▦", hero: true },
    { key: "heatmap",   label: "Shift heatmap",    ic: "▥" },
    { key: "line",      label: "Line trend",       ic: "◉", count: "5" },
  ]},
  { group: "Loss analysis", items: [
    { key: "pareto",    label: "Downtime Pareto",  ic: "▬" },
    { key: "losses",    label: "Six Big Losses",   ic: "▤" },
    { key: "changeover",label: "Changeover",       ic: "⇄", count: "7" },
  ]},
  { group: "Component deep-dive", items: [
    { key: "availability", label: "Availability",  ic: "A" },
    { key: "performance",  label: "Performance",   ic: "P" },
    { key: "quality",      label: "Quality",       ic: "Q" },
  ]},
  { group: "Admin", items: [
    { key: "settings",  label: "Alert thresholds", ic: "⚙" },
    { key: "shifts",    label: "Shift configs",    ic: "⏱" },
    { key: "gallery",   label: "Modal gallery",    ic: "▣" },
  ]},
  { group: "Phase 2", items: [
    { key: "anomalies", label: "Anomalies",        ic: "⚠", p2: true },
    { key: "equipment", label: "Equipment health", ic: "◆", p2: true },
    { key: "tv",        label: "TV dashboard",     ic: "▢", p2: true },
  ]},
];

// ----- Five production lines (mirrors production/data.jsx LINES) -----
const OEE_LINES_META = [
  { id: "LINE-01", name: "Cured meats",      shiftPattern: "AM/PM/Night", factory: "Factory-A", wo: "WO-2026-0042", currentProduct: "Kielbasa krakowska sucha" },
  { id: "LINE-02", name: "Ready meals",      shiftPattern: "AM/PM/Night", factory: "Factory-A", wo: "WO-2026-0038", currentProduct: "Gulasz wołowy 400g" },
  { id: "LINE-03", name: "Pasztet line",     shiftPattern: "AM/PM",       factory: "Factory-A", wo: "WO-2026-0040", currentProduct: "Pasztet drobiowy 180g" },
  { id: "LINE-04", name: "Pierogi line",     shiftPattern: "AM/PM/Night", factory: "Factory-A", wo: "WO-2026-0041", currentProduct: "Pierogi ruskie 500g" },
  { id: "LINE-05", name: "Sausage packing",  shiftPattern: "AM/PM",       factory: "Factory-A", wo: null,           currentProduct: "— idle" },
];

// ----- Today's (2026-04-21) summary per line, for OEE-001 gauge header + OEE-003 table -----
// LINE-01 world-class, LINE-02 problematic availability, LINE-03 mid-range,
// LINE-04 partial data, LINE-05 improving
const OEE_TODAY = {
  "LINE-01": { a: 94.2, p: 92.5, q: 99.3, oee: 86.5, output: 1248, downtime: 28,  bestShift: "AM",    bestOee: 91.2, worstShift: "Night", worstOee: 81.5, topDowntime: "Material Wait",       deltaA: 2.1,  deltaP: -1.0, deltaQ: 0.5,  deltaOEE: 1.8 },
  "LINE-02": { a: 62.1, p: 88.0, q: 98.8, oee: 53.9, output: 912,  downtime: 182, bestShift: "PM",    bestOee: 74.1, worstShift: "Night", worstOee: 52.3, topDowntime: "Machine Fault — Mixer M-002", deltaA: -8.2, deltaP: 0.4,  deltaQ: 0.0,  deltaOEE: -7.1 },
  "LINE-03": { a: 86.0, p: 90.2, q: 99.9, oee: 77.5, output: 1042, downtime: 62,  bestShift: "AM",    bestOee: 82.0, worstShift: "PM",    worstOee: 73.0, topDowntime: "Operator Break",       deltaA: 0.3,  deltaP: -0.8, deltaQ: 0.1,  deltaOEE: -0.5 },
  "LINE-04": { a: 78.2, p: 0.0,  q: 100,  oee: 0.0,  output: 380,  downtime: 95,  bestShift: "AM",    bestOee: 88.5, worstShift: "Night", worstOee: null, topDowntime: "Changeover — Allergen",deltaA: -4.2, deltaP: null, deltaQ: 0.0,  deltaOEE: null },
  "LINE-05": { a: 82.1, p: 86.5, q: 99.0, oee: 70.3, output: 608,  downtime: 48,  bestShift: "AM",    bestOee: 78.9, worstShift: "PM",    worstOee: 66.2, topDowntime: "First-off Reject",     deltaA: 3.5,  deltaP: 2.1,  deltaQ: 0.2,  deltaOEE: 4.0 },
};

// Deep 24h trend for OEE-001 per line (24 hourly points). Generated to feel realistic.
const mkTrend = (base, avar, pvar, qvar, dips = []) => {
  const pts = [];
  for (let h = 0; h < 24; h++) {
    let a = base.a + Math.sin(h/3) * avar + (h%5 === 0 ? -1.2 : 0);
    let p = base.p + Math.cos(h/4) * pvar - (h > 18 ? 2 : 0);
    let q = Math.min(100, base.q + Math.sin(h/6) * qvar);
    // force dip
    dips.forEach(d => { if (h >= d.start && h < d.end) { a = d.a ?? a; p = d.p ?? p; q = d.q ?? q; } });
    a = Math.max(0, Math.min(100, a));
    p = Math.max(0, Math.min(100, p));
    q = Math.max(0, Math.min(100, q));
    const oee = (a * p * q) / 10000;
    const hh = String(h).padStart(2, "0");
    pts.push({ t: `${hh}:00`, hour: h, a: +a.toFixed(1), p: +p.toFixed(1), q: +q.toFixed(1), oee: +oee.toFixed(1) });
  }
  return pts;
};

const OEE_TREND = {
  "LINE-01": mkTrend({a: 94, p: 92, q: 99}, 3, 4, 0.3, []),
  "LINE-02": mkTrend({a: 72, p: 88, q: 98}, 8, 5, 0.5, [{start:10, end:13, a: 38, p: 78}]), // M-002 jam 10:22
  "LINE-03": mkTrend({a: 86, p: 90, q: 99.9}, 4, 3, 0.2, []),
  "LINE-04": mkTrend({a: 82, p: 72, q: 100}, 5, 20, 0.1, [{start:9, end:11, a: 78, p: 0}]), // changeover
  "LINE-05": mkTrend({a: 80, p: 86, q: 99}, 4, 4, 0.5, []),
};

// Per-shift summary for LINE-01 sidebar (today)
const OEE_SHIFT_TODAY = {
  "LINE-01": [ { shift: "AM", oee: 91.2, status: "green" }, { shift: "PM", oee: 86.0, status: "green" }, { shift: "Night", oee: 81.5, status: "amber" } ],
  "LINE-02": [ { shift: "AM", oee: 65.0, status: "amber" }, { shift: "PM", oee: 74.1, status: "amber" }, { shift: "Night", oee: 52.3, status: "red"   } ],
  "LINE-03": [ { shift: "AM", oee: 82.0, status: "amber" }, { shift: "PM", oee: 73.0, status: "amber" }, { shift: "Night", oee: null, status: "gray"  } ],
  "LINE-04": [ { shift: "AM", oee: 88.5, status: "green" }, { shift: "PM", oee: 0.0,  status: "amber" }, { shift: "Night", oee: null, status: "gray"  } ],
  "LINE-05": [ { shift: "AM", oee: 78.9, status: "amber" }, { shift: "PM", oee: 66.2, status: "amber" }, { shift: "Night", oee: null, status: "gray"  } ],
};

// ----- Heatmap — 7 days × 3 shifts × 5 lines -----
// Week: 2026-W16 (Mon 2026-04-14 → Sun 2026-04-20)
const HEATMAP_DAYS = [
  { k: "mon", label: "Mon 14" },
  { k: "tue", label: "Tue 15" },
  { k: "wed", label: "Wed 16" },
  { k: "thu", label: "Thu 17" },
  { k: "fri", label: "Fri 18" },
  { k: "sat", label: "Sat 19" },
  { k: "sun", label: "Sun 20" },
];
const HEATMAP_SHIFTS = ["AM", "PM", "Night"];

// OEE matrix [line][day][shift]
const HEATMAP = {
  "LINE-01": { mon: {AM: 88.2, PM: 74.1, Night: 81.5}, tue: {AM: 85.3, PM: 87.0, Night: 82.1}, wed: {AM: 90.1, PM: 88.4, Night: 79.0}, thu: {AM: 87.8, PM: 84.2, Night: 80.6}, fri: {AM: 89.5, PM: 86.8, Night: 83.2}, sat: {AM: 86.4, PM: 82.0, Night: 79.0}, sun: {AM: 91.2, PM: 86.0, Night: 81.5} },
  "LINE-02": { mon: {AM: 62.1, PM: 91.0, Night: 77.8}, tue: {AM: 88.4, PM: 72.3, Night: 55.2}, wed: {AM: 74.2, PM: 85.1, Night: 64.8}, thu: {AM: 68.5, PM: 70.0, Night: 58.4}, fri: {AM: 80.0, PM: 78.4, Night: 62.1}, sat: {AM: 72.0, PM: 66.8, Night: 55.2}, sun: {AM: 65.0, PM: 74.1, Night: 52.3} },
  "LINE-03": { mon: {AM: 85.5, PM: 85.0, Night: 84.1}, tue: {AM: 89.2, PM: 82.0, Night: 86.3}, wed: {AM: 84.4, PM: 80.5, Night: 78.8}, thu: {AM: 86.7, PM: 83.1, Night: 81.0}, fri: {AM: 88.3, PM: 85.5, Night: null}, sat: {AM: 82.5, PM: null,  Night: null}, sun: {AM: 82.0, PM: 73.0, Night: null} },
  "LINE-04": { mon: {AM: null,  PM: 71.2, Night: null}, tue: {AM: 90.0, PM: 68.9, Night: 74.0}, wed: {AM: 85.5, PM: 80.2, Night: 72.1}, thu: {AM: null,  PM: 76.5, Night: 68.0}, fri: {AM: 82.0, PM: 79.0, Night: 70.5}, sat: {AM: null,  PM: null,  Night: null}, sun: {AM: 88.5, PM: 0.0,  Night: null} },
  "LINE-05": { mon: {AM: 68.0, PM: 70.5, Night: 71.0}, tue: {AM: 71.2, PM: 73.8, Night: 72.0}, wed: {AM: 73.5, PM: 75.0, Night: 74.1}, thu: {AM: 75.8, PM: 76.2, Night: null}, fri: {AM: 77.0, PM: 78.0, Night: null}, sat: {AM: 78.5, PM: 79.1, Night: null}, sun: {AM: 78.9, PM: 66.2, Night: null} },
};

// A/P/Q micro split for each heatmap cell (used in tooltip + micro-bar)
const HEATMAP_APQ = {
  "LINE-01": { sun: { AM: {a: 95, p: 96, q: 99.8, output: 420, downtime: 4}, PM: {a: 92, p: 93, q: 99.5, output: 418, downtime: 12}, Night: {a: 85, p: 96, q: 99.8, output: 410, downtime: 20} } },
  "LINE-02": { sat: { Night: {a: 60, p: 93, q: 99, output: 210, downtime: 88}, PM: {a: 75, p: 89, q: 99.5, output: 298, downtime: 52} } },
};

// ----- 7-day sparkline data for OEE-003 table -----
const SPARK_7D = {
  "LINE-01": [88.2, 85.3, 90.1, 87.8, 89.5, 86.4, 86.5],
  "LINE-02": [70.0, 72.0, 74.7, 65.6, 73.5, 64.7, 53.9],
  "LINE-03": [84.9, 85.8, 81.2, 83.6, 86.9, 82.5, 77.5],
  "LINE-04": [71.2, 77.6, 79.3, 72.3, 77.2, 0.0,  0.0 ],
  "LINE-05": [69.8, 72.3, 74.2, 76.0, 77.5, 78.8, 70.3],
};

// ----- Top downtime causes (aggregated, per OEE-001 bottom card) -----
const OEE_DOWNTIME_TOP = {
  "LINE-01": [
    { cat: "Material Wait",       group: "process", mins: 18, events: 2, classLabel: "Process" },
    { cat: "Operator Break",      group: "people",  mins: 6,  events: 1, classLabel: "People"  },
    { cat: "Minor Stop",          group: "process", mins: 4,  events: 1, classLabel: "Process" },
  ],
  "LINE-02": [
    { cat: "Machine Fault — M-002 Mixer", group: "plant",   mins: 78, events: 1, classLabel: "Plant",   related: "DOWNTIME@2026-04-20 10:22" },
    { cat: "Bearing Failure — PACK-01",   group: "plant",   mins: 62, events: 2, classLabel: "Plant" },
    { cat: "Material Wait",               group: "process", mins: 24, events: 3, classLabel: "Process" },
    { cat: "CIP End-of-shift",            group: "plant",   mins: 18, events: 1, classLabel: "Plant" },
  ],
  "LINE-03": [
    { cat: "Operator Break",      group: "people",  mins: 36, events: 3, classLabel: "People" },
    { cat: "Material Wait",       group: "process", mins: 14, events: 2, classLabel: "Process" },
    { cat: "First-off Reject",    group: "people",  mins: 12, events: 1, classLabel: "People" },
  ],
  "LINE-04": [
    { cat: "Changeover — Allergen", group: "plant",   mins: 56, events: 1, classLabel: "Plant" },
    { cat: "Sealing Head Temp Fault", group: "plant", mins: 24, events: 1, classLabel: "Plant" },
    { cat: "Material Wait",         group: "process", mins: 15, events: 2, classLabel: "Process" },
  ],
  "LINE-05": [
    { cat: "First-off Reject",    group: "people",  mins: 22, events: 2, classLabel: "People" },
    { cat: "Belt Slip",           group: "process", mins: 18, events: 1, classLabel: "Process" },
    { cat: "Minor Stop",          group: "process", mins: 8,  events: 2, classLabel: "Process" },
  ],
};

// ----- Changeover events (mirrors production/data.jsx DOWNTIME changeover rows) -----
const CHANGEOVER_EVENTS = [
  { id: "CO-2026-0201", line: "LINE-04", start: "2026-04-20 09:14", woFrom: "WO-2026-0035", woTo: "WO-2026-0041", duration: 56, target: 30, variance: 26, allergen: "High", status: "completed",  notes: "Allergen changeover FA5301 → FA5302" },
  { id: "CO-2026-0200", line: "LINE-01", start: "2026-04-20 14:10", woFrom: "WO-2026-0039", woTo: "WO-2026-0042", duration: 35, target: 30, variance: 5,  allergen: "Medium", status: "completed", notes: "Casing change Ø26 → Ø32" },
  { id: "CO-2026-0199", line: "LINE-03", start: "2026-04-20 11:40", woFrom: "WO-2026-0034", woTo: "WO-2026-0040", duration: 22, target: 25, variance: -3, allergen: "Low",    status: "completed", notes: "Label change only" },
  { id: "CO-2026-0198", line: "LINE-02", start: "2026-04-19 22:10", woFrom: "WO-2026-0037", woTo: "WO-2026-0038", duration: 45, target: 30, variance: 15, allergen: "Medium", status: "completed", notes: "End-of-shift CIP + allergen" },
  { id: "CO-2026-0197", line: "LINE-05", start: "2026-04-19 16:00", woFrom: "WO-2026-0032", woTo: "WO-2026-0033", duration: 28, target: 25, variance: 3,  allergen: "Low",    status: "completed", notes: "Standard pack format change" },
  { id: "CO-2026-0196", line: "LINE-04", start: "2026-04-19 06:00", woFrom: null,           woTo: "WO-2026-0036", duration: 18, target: 20, variance: -2, allergen: "Low",    status: "completed", notes: "Shift-start warm-up" },
  { id: "CO-2026-0195", line: "LINE-02", start: "2026-04-18 14:05", woFrom: "WO-2026-0030", woTo: "WO-2026-0031", duration: 62, target: 30, variance: 32, allergen: "High",   status: "completed", notes: "Allergen segregation — deep clean" },
];

// ----- Six Big Losses breakdown (aggregated today 2026-04-20 per-line or factory) -----
const SIX_BIG_LOSSES = [
  { key: "equipment",   label: "Equipment Failure",      class: "plant",   mins: 172, pct: 34.3, events: 4,  impact: "A" },
  { key: "setup",       label: "Setup & Adjustment",     class: "plant",   mins: 128, pct: 25.5, events: 7,  impact: "A" },
  { key: "idling",      label: "Idling & Minor Stops",   class: "process", mins: 82,  pct: 16.4, events: 18, impact: "P" },
  { key: "speed",       label: "Reduced Speed",          class: "process", mins: 58,  pct: 11.6, events: 9,  impact: "P" },
  { key: "defects",     label: "Process Defects",        class: "process", mins: 34,  pct: 6.8,  events: 5,  impact: "Q" },
  { key: "startup",     label: "Startup Rejects",        class: "people",  mins: 27,  pct: 5.4,  events: 4,  impact: "Q" },
];

// Downtime → Big Loss mapping (for OEE-ADM-001)
const BIG_LOSS_MAPPING = [
  { code: "MACH_FAULT",    label: "Machine fault",         bigLoss: "Equipment Failure" },
  { code: "BEARING_FAIL",  label: "Bearing failure",       bigLoss: "Equipment Failure" },
  { code: "MOTOR_FAULT",   label: "Motor fault",           bigLoss: "Equipment Failure" },
  { code: "PLC_ERROR",     label: "PLC error",             bigLoss: "Equipment Failure" },
  { code: "CHANGEOVER",    label: "Changeover",            bigLoss: "Setup/Adjustments" },
  { code: "CLEANING",      label: "Cleaning (CIP)",        bigLoss: "Setup/Adjustments" },
  { code: "LINE_SETUP",    label: "Line setup",            bigLoss: "Setup/Adjustments" },
  { code: "MAT_WAIT",      label: "Material wait",         bigLoss: "Idling/Minor Stops" },
  { code: "UPSTREAM_BLK",  label: "Upstream block",        bigLoss: "Idling/Minor Stops" },
  { code: "DOWNSTREAM_BLK",label: "Downstream block",      bigLoss: "Idling/Minor Stops" },
  { code: "SPEED_REST",    label: "Speed restriction",     bigLoss: "Reduced Speed" },
  { code: "PROD_JAM",      label: "Product jam",           bigLoss: "Reduced Speed" },
  { code: "BELT_SLIP",     label: "Belt slip",             bigLoss: "Reduced Speed" },
  { code: "QA_HOLD",       label: "Quality hold (in-process)", bigLoss: "Defects/Rework" },
  { code: "FIRST_OFF",     label: "First-off reject",      bigLoss: "Startup/Yield Losses" },
  { code: "WARM_UP",       label: "Line warm-up",          bigLoss: "Startup/Yield Losses" },
];

const BIG_LOSS_CATEGORIES = [
  "Equipment Failure", "Setup/Adjustments", "Idling/Minor Stops",
  "Reduced Speed", "Defects/Rework", "Startup/Yield Losses",
];

// ----- Downtime events for Six Big Losses drill / annotation modal -----
// Mirrors production DOWNTIME with extra fields for OEE context
const OEE_DOWNTIME_EVENTS = [
  { id: "DT-2026-2188", t: "2026-04-20 10:22", line: "LINE-02", wo: "WO-2026-0038", machine: "MIX-04", cat: "Machine Fault", code: "MACH_FAULT", group: "plant", bigLoss: "Equipment Failure", duration: 78, reason: "Mixer M-002 auger jam — cleaning required", notes: "",                                           endedAt: "2026-04-20 11:40", annotatedBy: null },
  { id: "DT-2026-2187", t: "2026-04-20 09:14", line: "LINE-04", wo: "—",            machine: "PACK-01", cat: "Changeover",    code: "CHANGEOVER",  group: "plant", bigLoss: "Setup/Adjustments", duration: 56, reason: "Allergen changeover FA5301 → FA5302",       notes: "Two-person sign-off complete at 10:08",      endedAt: "2026-04-20 10:10", annotatedBy: "P. Kowalski" },
  { id: "DT-2026-2186", t: "2026-04-20 07:38", line: "LINE-03", wo: "WO-2026-0040", machine: "—",      cat: "Operator Break", code: "OP_BREAK",     group: "people",bigLoss: "Startup/Yield Losses", duration: 12, reason: "Statutory break",                          notes: "",                                           endedAt: "2026-04-20 07:50", annotatedBy: null },
  { id: "DT-2026-2185", t: "2026-04-20 06:44", line: "LINE-01", wo: "WO-2026-0042", machine: "—",      cat: "Material Wait",  code: "MAT_WAIT",     group: "process",bigLoss: "Idling/Minor Stops", duration: 6,  reason: "Casings delayed from warehouse",           notes: "LP-4431 late putaway — see WH movement log", endedAt: "2026-04-20 06:50", annotatedBy: "M. Szymczak" },
  { id: "DT-2026-2184", t: "2026-04-19 22:10", line: "LINE-02", wo: "WO-2026-0037", machine: "—",      cat: "Cleaning",       code: "CLEANING",     group: "plant", bigLoss: "Setup/Adjustments", duration: 45, reason: "End-of-shift CIP",                         notes: "",                                           endedAt: "2026-04-19 22:55", annotatedBy: null },
  { id: "DT-2026-2183", t: "2026-04-19 18:02", line: "LINE-04", wo: "WO-2026-0036", machine: "SEAL-02", cat: "Machine Fault", code: "MACH_FAULT",   group: "plant", bigLoss: "Equipment Failure", duration: 78, reason: "Sealing head temperature fault",            notes: "Replaced thermocouple, verified 172°C set.",  endedAt: "2026-04-19 19:20", annotatedBy: "P. Kowalski" },
  { id: "DT-2026-2182", t: "2026-04-20 12:18", line: "LINE-05", wo: "—",            machine: "PACK-03", cat: "First-off Reject",code: "FIRST_OFF",  group: "people",bigLoss: "Startup/Yield Losses", duration: 22, reason: "First 4 packs out of weight tolerance",     notes: "",                                           endedAt: "2026-04-20 12:40", annotatedBy: null },
  { id: "DT-2026-2181", t: "2026-04-20 08:55", line: "LINE-02", wo: "WO-2026-0038", machine: "PACK-01", cat: "Bearing Failure",code: "BEARING_FAIL",group: "plant", bigLoss: "Equipment Failure", duration: 62, reason: "Bearing overheat alarm — replaced in-line", notes: "Verified torque 8.2 Nm post-replace",        endedAt: "2026-04-20 09:57", annotatedBy: "K. Nowacki" },
];

// ----- Alert thresholds (OEE-ADM-001 tenant default + per-line overrides) -----
const OEE_THRESHOLDS = {
  tenant: { oeeTarget: 70.0, aMin: 70.0, pMin: 80.0, qMin: 95.0, anomalyAlpha: 0.30, anomalySigma: 2.0, maintTrigger: 70.0, maintConsecDays: 3 },
  perLine: [
    { line: "LINE-01", oeeTarget: 85.0, aMin: 80.0, pMin: 85.0, qMin: 98.0 },
    { line: "LINE-02", oeeTarget: 65.0, aMin: 65.0, pMin: 75.0, qMin: 95.0 },
  ],
};

// ----- Shift configs (OEE-ADM-002) -----
const SHIFT_CONFIGS = [
  { id: "AM",    label: "Morning Shift",    start: "00:00", end: "08:00", tz: "UTC", days: "Mon–Sun", sort: 1, active: true },
  { id: "PM",    label: "Afternoon Shift",  start: "08:00", end: "16:00", tz: "UTC", days: "Mon–Sun", sort: 2, active: true },
  { id: "Night", label: "Night Shift",      start: "16:00", end: "00:00", tz: "UTC", days: "Mon–Sun", sort: 3, active: true },
];

// ----- KPI strip for summary / heatmap -----
const SUMMARY_KPIS_TODAY = {
  factoryOEE: 68.8,
  factoryA: 81.3,
  factoryP: 72.2,
  factoryQ: 99.4,
  bestLine: "LINE-01", bestLineOEE: 86.5, bestLineShift: "AM", bestLineShiftOEE: 91.2,
  worstLine: "LINE-02", worstLineOEE: 53.9, worstLineShift: "Night", worstLineShiftOEE: 52.3,
  totalOutput: 4190, // kg
  totalDowntime: 415, // min
  linesActive: 4,
  shiftsCompleted: 11,
  target: 70.0,
  worldClass: 85.0,
};

const WEEK_KPIS = {
  week: "W/E 20/04/2026",
  factoryOEE: 77.1,
  bestLine: "LINE-01", bestLineOEE: 86.4,
  worstLine: "LINE-02", worstLineOEE: 68.0,
  bestShift: "AM", bestShiftOEE: 82.0,
  totalLineShifts: 99,
  daysCovered: 7,
};

// ----- Anomalies (P2 stub) -----
const ANOMALIES = [
  { line: "LINE-02", detected: "2026-04-20 10:22", actual: 38.1, expected: 72.0, sigma: 3.2, severity: "red",   status: "unack" },
  { line: "LINE-04", detected: "2026-04-19 18:02", actual: 51.5, expected: 78.4, sigma: 2.8, severity: "amber", status: "ack", ackBy: "M. Szymczak" },
  { line: "LINE-05", detected: "2026-04-18 22:15", actual: 65.0, expected: 74.1, sigma: 2.1, severity: "amber", status: "resolved" },
];

// ----- Equipment Health (P2 stub) -----
const EQUIPMENT_HEALTH = [
  { equipment: "MIX-04",  line: "LINE-02", mtbf: "42h", mttr: "38min", avail30d: 81.2, trend: "down",  lastFault: "2026-04-20 10:22" },
  { equipment: "PACK-01", line: "LINE-02", mtbf: "68h", mttr: "22min", avail30d: 86.8, trend: "down",  lastFault: "2026-04-20 08:55" },
  { equipment: "SEAL-02", line: "LINE-04", mtbf: "120h",mttr: "45min", avail30d: 91.0, trend: "flat",  lastFault: "2026-04-19 18:02" },
  { equipment: "MIX-02",  line: "LINE-01", mtbf: "310h",mttr: "12min", avail30d: 97.2, trend: "up",    lastFault: "2026-04-11 14:00" },
  { equipment: "PACK-03", line: "LINE-05", mtbf: "198h",mttr: "18min", avail30d: 94.5, trend: "up",    lastFault: "2026-04-17 09:30" },
];

Object.assign(window, {
  OEE_NAV, OEE_LINES_META, OEE_TODAY, OEE_TREND, OEE_SHIFT_TODAY,
  HEATMAP_DAYS, HEATMAP_SHIFTS, HEATMAP, HEATMAP_APQ,
  SPARK_7D, OEE_DOWNTIME_TOP, CHANGEOVER_EVENTS, SIX_BIG_LOSSES,
  BIG_LOSS_MAPPING, BIG_LOSS_CATEGORIES, OEE_DOWNTIME_EVENTS,
  OEE_THRESHOLDS, SHIFT_CONFIGS, SUMMARY_KPIS_TODAY, WEEK_KPIS,
  ANOMALIES, EQUIPMENT_HEALTH,
});
