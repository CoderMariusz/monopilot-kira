// =============================================================================
// Dashboard data — fixtures for adaptive hero + per-department widgets
// All data shaped to match upstream module specs (NPD, Technical, Production,
// Quality, Planning) so metrics stay consistent across the app.
// =============================================================================

window.DASH_USER = {
  name: "Anna Kowalska",
  initials: "AK",
  role: "Plant Manager",
  org: "Apex Foods Ltd",
  tenant: "apex"
};

// ----- Onboarding state — same shape as settings/onboarding-screens.jsx -----
window.DASH_ONBOARDING_STEPS = [
  { key: "org_profile",      num: 1, label: "Organization profile",   duration: "2 min", done: true,  current: false },
  { key: "users_invite",     num: 2, label: "Invite users",           duration: "3 min", done: true,  current: false },
  { key: "warehouses",       num: 3, label: "Create warehouses",      duration: "2 min", done: true,  current: false },
  { key: "first_product",    num: 4, label: "Create first product",   duration: "4 min", done: false, current: true  },
  { key: "first_wo",         num: 5, label: "Schedule first WO",      duration: "3 min", done: false, current: false },
  { key: "completion",       num: 6, label: "Go live",                duration: "1 min", done: false, current: false },
];

// Modules enabled for tenant — drives which widgets render
window.DASH_MODULES = {
  npd: true,
  technical: true,
  production: true,
  quality: true,
  planning: true,
  warehouse: false,  // not enabled for this tenant
};

// ===== NPD widget — projects in phases + risk =====
window.DASH_NPD = {
  total: 24,
  by_phase: [
    { name: "Brief",     count: 4, pct: 17 },
    { name: "Recipe",    count: 7, pct: 29 },
    { name: "Trial",     count: 6, pct: 25 },
    { name: "Approval",  count: 4, pct: 17 },
    { name: "Handoff",   count: 3, pct: 12 },
  ],
  risk: {
    high: 3, med: 6, low: 15,
    overdue: 2,
    next_launch_days: 9
  },
  hero_alert: {
    fg: "FG2401",
    name: "White Sliced Loaf 800g",
    days_left: 9,
    issue: "Cost overrun — £0.62 vs £0.58 target"
  }
};

// ===== Technical widget — failed audits / specs out of date =====
window.DASH_TECHNICAL = {
  audits: { open: 5, overdue: 2, this_week: 3 },
  failed_audits: [
    { id: "AUD-2026-018", scope: "BOM accuracy · L3 Bun line", severity: "high",  due: "2 days overdue", owner: "K. Walker" },
    { id: "AUD-2026-021", scope: "Allergen cascade · FG2403",   severity: "high",  due: "Due today",       owner: "M. Johnson" },
    { id: "AUD-2026-023", scope: "Supplier spec — Soya Flour",  severity: "med",   due: "Due in 4 days",   owner: "T. Brown" },
  ],
  specs: { active: 92, drafts: 4, expiring_30d: 6 }
};

// ===== Production widget — yields + run counter =====
// week-of-yield bars: today is Wed (idx 2)
window.DASH_PRODUCTION = {
  today_yield: 91.2,
  target: 92.0,
  trend_7d: [89.8, 90.4, 91.2, 92.1, 91.5, 90.9, 91.2],
  trend_labels: ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"],
  today_idx: 6,
  active_lines: [
    { name: "L1-Sliced",   state: "running", yield: 92.4, count: 1240, target: 1300, of: "WO-2614" },
    { name: "L2-Sliced",   state: "running", yield: 88.1, count: 980,  target: 1100, of: "WO-2615" },
    { name: "L3-Bun",      state: "alarm",   yield: 84.6, count: 420,  target: 800,  of: "WO-2618" },
    { name: "L4-Specialty",state: "idle",    yield: null, count: 0,    target: 0,    of: "—" },
  ],
  cases_today: 3840,
  cases_target: 4200,
  waste_pct: 2.3
};

// ===== Quality widget — holds + open NCRs =====
window.DASH_QUALITY = {
  holds: 2,
  open_ncrs: 5,
  critical_ncrs: 2,
  releases_today: 14,
  recent_holds: [
    { lp: "LP-8801", reason: "Metal-detect fail", batch: "B-1024", age: "2h" },
    { lp: "LP-8807", reason: "Pending micro test", batch: "B-1029", age: "45min" },
  ]
};

// ===== Planning widget — POs & WOs =====
window.DASH_PLANNING = {
  active_pos: 23,
  overdue_pos: 3,
  active_wos: 12,
  wos_today: 5,
  next_grn: { po: "PO-1124", supplier: "Wessex Mills", at: "14:30" }
};

Object.assign(window, {
  DASH_USER: window.DASH_USER,
  DASH_ONBOARDING_STEPS: window.DASH_ONBOARDING_STEPS,
  DASH_MODULES: window.DASH_MODULES,
  DASH_NPD: window.DASH_NPD,
  DASH_TECHNICAL: window.DASH_TECHNICAL,
  DASH_PRODUCTION: window.DASH_PRODUCTION,
  DASH_QUALITY: window.DASH_QUALITY,
  DASH_PLANNING: window.DASH_PLANNING,
});
