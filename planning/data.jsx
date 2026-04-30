// ============ Planning module data ============

const PLAN_NAV = [
  { group: "Operations", items: [
    { key: "dashboard", label: "Dashboard", ic: "◆", hero: true },
    { key: "suppliers", label: "Suppliers", ic: "◫", count: "6" },
    { key: "pos", label: "Purchase Orders", ic: "⇪", count: "42" },
    { key: "tos", label: "Transfer Orders", ic: "⇌", count: "11" },
  ]},
  { group: "Work Orders", items: [
    { key: "wos", label: "List", ic: "▦", count: "28" },
    { key: "gantt", label: "Gantt view", ic: "≡" },
    { key: "cascade", label: "Cascade DAG", ic: "⊶", count: "6" },
  ]},
  { group: "Planner tools", items: [
    { key: "reservations", label: "Reservations", ic: "◈" },
    { key: "sequencing", label: "Sequencing", ic: "↯" },
    { key: "d365_queue", label: "D365 SO queue", ic: "⇅", count: "3" },
  ]},
  { group: "Admin", items: [
    { key: "settings", label: "Planning settings", ic: "⚙" },
    { key: "gallery",  label: "Modal gallery", ic: "▣" },
  ]},
];

// ----- Supplier master (Fix-2: PRD §6.1 / §6.6 Must Have, FR-PLAN-001/002/003) -----
// Mirrors supplierCode values already used inline in PO screens so cross-links resolve.
const PLAN_SUPPLIERS = [
  { id: "SUP-0012", code: "SUP-0012", name: "Agro-Fresh Ltd.",      country: "GB", currency: "GBP", paymentTerms: "Net 30", email: "orders@agrofresh.co.uk",     phone: "+44 20 7946 0891", leadTime: 4, rating: 4.5, active: true,  d365Sync: "synced",   d365Id: "V-D365-SUP-0012", lastSync: "2026-04-21 02:00", openPOs: 3, ytdSpend: 48120, defaultProducts: 7,  certifications: ["BRC","IFS"],       notes: "Primary RM pork supplier — preferred on emergency restocks." },
  { id: "SUP-0018", code: "SUP-0018", name: "Baltic Pork Co.",      country: "PL", currency: "GBP", paymentTerms: "Net 45", email: "eksport@balticpork.pl",      phone: "+48 58 7410 222",  leadTime: 6, rating: 4.2, active: true,  d365Sync: "synced",   d365Id: "V-D365-SUP-0018", lastSync: "2026-04-21 02:00", openPOs: 2, ytdSpend: 61840, defaultProducts: 4,  certifications: ["BRC"],             notes: "Large-volume beef/pork carcass supplier, PL → APEX-A." },
  { id: "SUP-0022", code: "SUP-0022", name: "Spice Masters",        country: "GB", currency: "GBP", paymentTerms: "Net 30", email: "sales@spicemasters.co.uk",   phone: "+44 121 555 0144", leadTime: 5, rating: 4.8, active: true,  d365Sync: "synced",   d365Id: "V-D365-SUP-0022", lastSync: "2026-04-21 02:00", openPOs: 2, ytdSpend: 8440,  defaultProducts: 18, certifications: ["BRC","FSSC"],      notes: "Sole supplier for pieprz czarny + allergen-free premix range." },
  { id: "SUP-0031", code: "SUP-0031", name: "Viscofan S.A.",        country: "ES", currency: "GBP", paymentTerms: "Net 30", email: "sales.uk@viscofan.com",      phone: "+34 948 198 444",  leadTime: 10,rating: 4.6, active: true,  d365Sync: "synced",   d365Id: "V-D365-SUP-0031", lastSync: "2026-04-21 02:00", openPOs: 2, ytdSpend: 38480, defaultProducts: 3,  certifications: ["BRC","IFS","Halal"],notes: "Casings (Ø26, Ø32) — 10-day lead for non-stocked diameters." },
  { id: "SUP-0044", code: "SUP-0044", name: "Hellmann Logistics",   country: "DE", currency: "GBP", paymentTerms: "Net 14", email: "uk@hellmann.com",            phone: "+44 1753 893400",  leadTime: 2, rating: 3.9, active: true,  d365Sync: "drift",    d365Id: "V-D365-SUP-0044", lastSync: "2026-04-18 02:00", openPOs: 2, ytdSpend: 14260, defaultProducts: 0,  certifications: [],                  notes: "Logistics / packaging consumables. D365 drift on payment_terms — admin resolve pending." },
  { id: "SUP-0052", code: "SUP-0052", name: "Premium Dairy Ltd.",   country: "GB", currency: "GBP", paymentTerms: "Net 30", email: "accounts@premiumdairy.uk",   phone: "+44 1772 555 210", leadTime: 3, rating: 4.3, active: true,  d365Sync: "synced",   d365Id: "V-D365-SUP-0052", lastSync: "2026-04-21 02:00", openPOs: 2, ytdSpend: 10390, defaultProducts: 5,  certifications: ["BRC","Red Tractor"],notes: "Dairy RM — mleko, śmietana, masło. EUDR scope cross-check needed." },
  { id: "SUP-0067", code: "SUP-0067", name: "NordicPack AB",        country: "SE", currency: "GBP", paymentTerms: "Net 60", email: "uk@nordicpack.se",           phone: "+46 31 7202 100",  leadTime: 14,rating: 4.0, active: false, d365Sync: "local",    d365Id: null,              lastSync: null,              openPOs: 0, ytdSpend: 0,     defaultProducts: 0,  certifications: ["FSC"],             notes: "Inactive since 2026-02 — pricing uncompetitive vs Hellmann. Kept for audit trail per FR-PLAN-001 soft delete." },
];

// Supplier-product assignments (FR-PLAN-002: max 1 is_default per product)
const SUPPLIER_PRODUCTS = {
  "SUP-0012": [
    { product: "R-1001", name: "Wieprzowina kl. II",       unitPrice: 9.80,  discount: 0, leadTime: 4, isDefault: true  },
    { product: "R-1002", name: "Słonina wieprzowa",        unitPrice: 4.60,  discount: 0, leadTime: 4, isDefault: true  },
    { product: "R-1101", name: "Wołowina gulaszowa",       unitPrice: 12.40, discount: 0, leadTime: 5, isDefault: true  },
  ],
  "SUP-0018": [
    { product: "R-1001", name: "Wieprzowina kl. II",       unitPrice: 9.20,  discount: 2, leadTime: 6, isDefault: false },
    { product: "R-1105", name: "Karkówka wieprzowa",       unitPrice: 11.10, discount: 0, leadTime: 6, isDefault: true  },
  ],
  "SUP-0022": [
    { product: "R-2101", name: "Pieprz czarny",            unitPrice: 38.50, discount: 5, leadTime: 5, isDefault: true  },
    { product: "R-2102", name: "Papryka wędzona",          unitPrice: 24.20, discount: 0, leadTime: 5, isDefault: true  },
    { product: "R-2110", name: "Premix allergen-free v3",  unitPrice: 12.80, discount: 0, leadTime: 7, isDefault: true  },
  ],
  "SUP-0031": [
    { product: "R-3001", name: "Osłonka Ø26 (Viscofan)",   unitPrice: 7.60,  discount: 0, leadTime: 10,isDefault: true  },
    { product: "R-3002", name: "Osłonka Ø32 (Viscofan)",   unitPrice: 8.90,  discount: 0, leadTime: 10,isDefault: true  },
  ],
  "SUP-0044": [
    { product: "R-4001", name: "Folia termokurczliwa",     unitPrice: 2.40,  discount: 0, leadTime: 2, isDefault: true  },
  ],
  "SUP-0052": [
    { product: "R-1801", name: "Mleko 3.2%",               unitPrice: 1.20,  discount: 0, leadTime: 3, isDefault: true  },
    { product: "R-1802", name: "Śmietana 30%",             unitPrice: 3.40,  discount: 0, leadTime: 3, isDefault: true  },
  ],
  "SUP-0067": [],
};

// Supplier PO history (lazy-computed from PLAN_POS in SupplierDetail)


// ----- Dashboard KPIs -----
const PLAN_KPIS = [
  { k: "open_pos", label: "Open POs", value: 42, accent: "blue", sub: "Total value: £186 420", target: "pos" },
  { k: "pos_pending", label: "POs pending approval", value: 6, accent: "amber", sub: "Avg wait: 2.3 days · Target < 5", target: "pos" },
  { k: "pos_overdue", label: "Overdue POs", value: 3, accent: "red", sub: "Action required · Target 0", target: "pos" },
  { k: "open_tos", label: "Open TOs", value: 11, accent: "blue", sub: "Inter-warehouse transfers", target: "tos" },
  { k: "wos_today", label: "WOs scheduled today", value: 14, accent: "blue", sub: "On 5 production lines", target: "wos" },
  { k: "wos_inprogress", label: "WOs in progress", value: 8, accent: "green", sub: "Active on lines", target: "wos" },
  { k: "wos_hold", label: "WOs on hold > 24h", value: 2, accent: "red", sub: "Requires attention", target: "wos" },
  { k: "d365_depth", label: "D365 SO queue", value: 3, accent: "blue", sub: "Last pull: 4 min ago", target: "d365_queue" },
];

// ----- Alerts -----
const PO_ALERTS = [
  { code: "PO-2026-00028", supplier: "Agro-Fresh Ltd.", reason: "Overdue 4 days · expected 2026-04-17", severity: "red" },
  { code: "PO-2026-00031", supplier: "Hellmann Logistics", reason: "Overdue 2 days · expected 2026-04-19", severity: "red" },
  { code: "PO-2026-00034", supplier: "Spice Masters", reason: "Pending approval 3 days", severity: "amber" },
  { code: "PO-2026-00037", supplier: "Viscofan S.A.", reason: "Pending approval 2 days · £18 240", severity: "amber" },
];

const WO_ALERTS = [
  { code: "WO-2026-0103", product: "Kiełbasa śląska pieczona 450g", reason: "Material shortage · R-1001 Red availability", severity: "red" },
  { code: "WO-2026-0087", product: "Pasztet drobiowy 180g", reason: "On hold > 32h · awaiting BOM approval", severity: "amber" },
  { code: "WO-2026-0091", product: "Pierogi z mięsem 400g", reason: "Past scheduled end · 6h late", severity: "amber" },
];

const TO_ALERTS = [
  { code: "TO-2026-00014", from: "WH-Factory-A", to: "WH-DistCentral", reason: "Overdue 1 day · ship planned 2026-04-19", severity: "amber" },
];

// ----- Upcoming -----
const UPCOMING_POS = [
  { code: "PO-2026-00041", supplier: "Agro-Fresh Ltd.", exp: "2026-04-22", rel: "Tomorrow", lines: 4, status: "confirmed", total: "£3 420" },
  { code: "PO-2026-00042", supplier: "Baltic Pork Co.", exp: "2026-04-23", rel: "In 2 days", lines: 2, status: "confirmed", total: "£8 160" },
  { code: "PO-2026-00043", supplier: "Spice Masters", exp: "2026-04-24", rel: "In 3 days", lines: 8, status: "pending_approval", total: "£1 280" },
  { code: "PO-2026-00044", supplier: "Viscofan S.A.", exp: "2026-04-25", rel: "In 4 days", lines: 1, status: "submitted", total: "£18 240" },
  { code: "PO-2026-00045", supplier: "Hellmann Logistics", exp: "2026-04-28", rel: "In 7 days", lines: 3, status: "draft", total: "£4 820" },
  { code: "PO-2026-00046", supplier: "Premium Dairy Ltd.", exp: "2026-04-29", rel: "In 8 days", lines: 5, status: "confirmed", total: "£6 410", drift: true },
  { code: "PO-2026-00047", supplier: "Agro-Fresh Ltd.", exp: "2026-05-02", rel: "In 11 days", lines: 6, status: "confirmed", total: "£9 120" },
];

const UPCOMING_WOS = [
  { code: "WO-2026-0108", item: "FA5100", product: "Kiełbasa śląska pieczona 450g", date: "2026-04-21", rel: "Today 06:00", line: "LINE-01", status: "released", priority: "normal", avail: "green" },
  { code: "WO-2026-0109", item: "FA5102", product: "Szynka wędzona plastry 150g", date: "2026-04-21", rel: "Today 13:00", line: "LINE-01", status: "planned", priority: "high", avail: "yellow" },
  { code: "WO-2026-0111", item: "FA5021", product: "Gulasz wołowy 350g", date: "2026-04-21", rel: "Today 14:30", line: "LINE-02", status: "released", priority: "normal", avail: "green" },
  { code: "WO-2026-0112", item: "FA5200", product: "Pasztet drobiowy 180g", date: "2026-04-22", rel: "Tomorrow", line: "LINE-03", status: "planned", priority: "critical", avail: "red", source: "d365" },
  { code: "WO-2026-0113", item: "FA5301", product: "Pierogi z mięsem 400g", date: "2026-04-22", rel: "Tomorrow", line: "LINE-04", status: "planned", priority: "normal", avail: "green" },
  { code: "WO-2026-0114", item: "IN1301", product: "[INT] Farsz pierogowy mieszany", date: "2026-04-22", rel: "Tomorrow", line: "LINE-04", status: "planned", priority: "normal", avail: "yellow", source: "cascade" },
  { code: "WO-2026-0115", item: "FA5400", product: "Filet z kurczaka sous-vide", date: "2026-04-23", rel: "In 2 days", line: "LINE-05", status: "draft", priority: "normal", avail: "green" },
];

const UPCOMING_TOS = [
  { code: "TO-2026-00015", from: "WH-Factory-A", to: "WH-DistCentral", ship: "2026-04-21", recv: "2026-04-22", status: "planned" },
  { code: "TO-2026-00016", from: "WH-Factory-B", to: "WH-Factory-A", ship: "2026-04-22", recv: "2026-04-22", status: "shipped" },
  { code: "TO-2026-00017", from: "WH-Factory-A", to: "WH-DistNorth", ship: "2026-04-23", recv: "2026-04-24", status: "planned" },
  { code: "TO-2026-00018", from: "WH-Cold-01", to: "WH-Factory-A", ship: "2026-04-24", recv: "2026-04-24", status: "planned" },
];

const CASCADE_CHAINS = [
  { root: "WO-2026-0120", rootName: "Klopsiki w sosie pomidorowym 320g", depth: 3, total: 4, pct: 25 },
  { root: "WO-2026-0112", rootName: "Pasztet drobiowy z żurawiną 180g", depth: 2, total: 3, pct: 66 },
  { root: "WO-2026-0113", rootName: "Pierogi z mięsem 400g", depth: 2, total: 3, pct: 0 },
  { root: "WO-2026-0124", rootName: "Zupa pomidorowa 500ml", depth: 2, total: 2, pct: 50 },
];

const ACTIVITY_FEED = [
  { t: "2 min ago", color: "green", code: "WO-2026-0108", desc: "WO released to LINE-01", sub: "4 materials hard-locked · LP-4431, LP-4432, LP-4470, LP-5582" },
  { t: "8 min ago", color: "blue", code: "PO-2026-00042", desc: "PO confirmed by supplier", sub: "Agro-Fresh Ltd. · ETA 2026-04-23" },
  { t: "14 min ago", color: "amber", code: "WO-2026-0091", desc: "WO past scheduled end date", sub: "Pierogi z mięsem · LINE-04 · 6h late" },
  { t: "22 min ago", color: "blue", code: "TO-2026-00016", desc: "TO shipped from WH-Factory-B", sub: "Planned receive 2026-04-22" },
  { t: "31 min ago", color: "green", code: "WO-2026-0107", desc: "Cascade chain created (3 layers, 4 WOs)", sub: "Root: Klopsiki w sosie pomidorowym 320g" },
  { t: "48 min ago", color: "red", code: "WO-2026-0103", desc: "Material shortage alert raised", sub: "R-1001 Wieprzowina kl. II · 120kg short" },
  { t: "1 h ago", color: "blue", code: "PO-2026-00041", desc: "PO confirmed · smart defaults applied", sub: "4 lines · £3 420 total" },
  { t: "1 h ago", color: "green", code: "WO-2026-0100", desc: "WO completed · 98.2% yield", sub: "D365 push enqueued" },
  { t: "2 h ago", color: "amber", code: "PO-2026-00037", desc: "PO pending approval > 2 days", sub: "Viscofan S.A. · £18 240 · PM approval required" },
  { t: "2 h ago", color: "blue", code: "D365", desc: "D365 SO pull complete · 3 draft WOs generated", sub: "Planner review required" },
];

// ----- WO List -----
const PLAN_WOS = [
  { id: "WO-2026-0108", item: "FA5100", name: "Kiełbasa śląska pieczona 450g", status: "released", priority: "normal", qty: 1011, uom: "kg", date: "2026-04-21 06:00", rel: "Today 06:00", line: "LINE-01", allergens: ["free"], avail: "green", progress: 0, cascade: null, source: "manual" },
  { id: "WO-2026-0109", item: "FA5102", name: "Szynka wędzona plastry 150g", status: "planned", priority: "high", qty: 800, uom: "kg", date: "2026-04-21 13:00", rel: "Today 13:00", line: "LINE-01", allergens: ["free"], avail: "yellow", progress: 0, cascade: null, source: "manual" },
  { id: "WO-2026-0111", item: "FA5021", name: "Gulasz wołowy 350g (słoik)", status: "released", priority: "normal", qty: 1200, uom: "kg", date: "2026-04-21 14:30", rel: "Today 14:30", line: "LINE-02", allergens: ["gluten"], avail: "green", progress: 0, cascade: null, source: "manual" },
  { id: "WO-2026-0100", item: "FA5200", name: "Pasztet drobiowy z żurawiną 180g", status: "in_progress", priority: "normal", qty: 500, uom: "kg", date: "2026-04-21 04:30", rel: "Today 04:30", line: "LINE-03", allergens: ["free"], avail: "produced", progress: 76, cascade: null, source: "manual" },
  { id: "WO-2026-0112", item: "FA5200", name: "Pasztet drobiowy z żurawiną 180g", status: "planned", priority: "critical", qty: 420, uom: "kg", date: "2026-04-22 08:00", rel: "Tomorrow", line: "LINE-03", allergens: ["free"], avail: "red", progress: 0, cascade: null, source: "d365" },
  { id: "WO-2026-0113", item: "FA5301", name: "Pierogi z mięsem 400g", status: "planned", priority: "normal", qty: 800, uom: "kg", date: "2026-04-22 10:00", rel: "Tomorrow", line: "LINE-04", allergens: ["gluten", "egg"], avail: "green", progress: 0, cascade: { layer: 2, total: 3 }, source: "manual" },
  { id: "WO-2026-0114", item: "IN1301", name: "[INT] Farsz pierogowy mieszany 20kg", status: "planned", priority: "normal", qty: 160, uom: "kg", date: "2026-04-22 06:00", rel: "Tomorrow", line: "LINE-04", allergens: ["egg"], avail: "yellow", progress: 0, cascade: { layer: 1, total: 3 }, source: "cascade" },
  { id: "WO-2026-0103", item: "FA5100", name: "Kiełbasa śląska pieczona 450g", status: "on_hold", priority: "high", qty: 900, uom: "kg", date: "2026-04-20 06:00", rel: "Yesterday", line: null, allergens: ["free"], avail: "red", progress: 0, cascade: null, source: "manual", onHold: "32h" },
  { id: "WO-2026-0087", item: "FA5200", name: "Pasztet drobiowy 180g", status: "on_hold", priority: "normal", qty: 300, uom: "kg", date: "2026-04-19 12:00", rel: "2 days ago", line: "LINE-03", allergens: ["free"], avail: "yellow", progress: 0, cascade: null, source: "manual", onHold: "52h" },
  { id: "WO-2026-0120", item: "FA5023", name: "Klopsiki w sosie pomidorowym 320g", status: "draft", priority: "normal", qty: 900, uom: "kg", date: "2026-04-24 08:00", rel: "In 3 days", line: "LINE-02", allergens: ["gluten", "egg", "dairy"], avail: "green", progress: 0, cascade: { layer: 3, total: 4 }, source: "manual" },
  { id: "WO-2026-0100B", item: "FA5400", name: "Filet z kurczaka sous-vide 180g", status: "completed", priority: "normal", qty: 600, uom: "kg", date: "2026-04-19 22:10", rel: "Yesterday", line: "LINE-05", allergens: ["free"], avail: "produced", progress: 100, cascade: null, source: "d365" },
  { id: "WO-2026-0099", item: "FA5301-R", name: "Pierogi z mięsem 400g (rework)", status: "released", priority: "high", qty: 120, uom: "kg", date: "2026-04-21 16:00", rel: "Today 16:00", line: "LINE-04", allergens: ["gluten", "egg"], avail: "green", progress: 0, cascade: null, source: "rework" },
];

// ----- WO Detail (WO-2026-0113 — pierogi, cascade layer 2 of 3) -----
const PLAN_WO_DETAIL = {
  id: "WO-2026-0113",
  code: "WO-2026-0113",
  item: "FA5301",
  name: "Pierogi z mięsem 400g",
  status: "planned",
  statusLabel: "Planned",
  priority: "normal",
  source: "manual",
  cascadeLayer: 2,
  cascadeTotal: 3,
  cascadeRoot: "WO-2026-0113",
  plannedQty: 800,
  uom: "kg",
  plannedStart: "2026-04-22 10:00",
  plannedEnd: "2026-04-22 16:30",
  line: "LINE-04 — Pierogi",
  lineCode: "LINE-04",
  bomVersion: "v5",
  bomSnapshot: "BOM v5 · snapshot immutable · 2026-04-20 11:42",
  allergenProfile: ["gluten", "egg"],
  meatPct: "Chicken 85%, Pork 10%, Beef 5%",
  meatPctList: [{ type: "Chicken", pct: 85 }, { type: "Pork", pct: 10 }, { type: "Beef", pct: 5 }],
  yield: null,
  scheduledSlotConflict: false,

  materials: [
    { seq: 1, code: "R-1501", name: "Mąka pszenna typ 500", plannedQty: 180, consumed: 0, reserved: 180, reservedLP: "LP-7201", uom: "kg", source: "stock", avail: "green", allergen: "gluten" },
    { seq: 2, code: "IN1301", name: "[INT] Farsz pierogowy mieszany 20kg", plannedQty: 420, consumed: 0, reserved: 0, reservedLP: null, uom: "kg", source: "upstream_wo_output", upstreamWo: "WO-2026-0114", upstreamStatus: "planned", projectedQty: 420, projectedDate: "2026-04-22 06:30", avail: "yellow", allergen: null },
    { seq: 3, code: "R-1601", name: "Jaja kurze (żółtka)", plannedQty: 24, consumed: 0, reserved: 24, reservedLP: "LP-7305", uom: "kg", source: "stock", avail: "green", allergen: "egg" },
    { seq: 4, code: "R-1202", name: "Woda technologiczna", plannedQty: 80, consumed: 0, reserved: 0, reservedLP: null, uom: "kg", source: "manual", avail: "green", allergen: null },
    { seq: 5, code: "R-1201", name: "Sól kuchenna", plannedQty: 4, consumed: 0, reserved: 4, reservedLP: "LP-7410", uom: "kg", source: "stock", avail: "green", allergen: null },
  ],

  operations: [
    { seq: 10, op: "Mieszanie ciasta", machine: "MIX-04", expDur: 25, actDur: null, expYield: 99, status: "pending" },
    { seq: 20, op: "Formowanie pierogów", machine: "FORM-01", expDur: 180, actDur: null, expYield: 96, status: "pending" },
    { seq: 30, op: "Gotowanie", machine: "BOIL-02", expDur: 60, actDur: null, expYield: 98, status: "pending" },
    { seq: 40, op: "Schłodzenie i pakowanie", machine: "PACK-04", expDur: 90, actDur: null, expYield: 99, status: "pending" },
  ],

  outputs: [
    { role: "primary", code: "FA5301", name: "Pierogi z mięsem 400g", plannedQty: 712, actualQty: 0, allocPct: 100, disposition: "to_stock", outputLP: null },
    { role: "co_product", code: "FA5301-CO", name: "Pierogi deformowane (klasa B)", plannedQty: 40, actualQty: 0, allocPct: 5, disposition: "to_stock", outputLP: null },
    { role: "byproduct", code: "FA5301-BP", name: "Odciąg ciasta", plannedQty: 12, actualQty: 0, allocPct: 1.5, disposition: "to_stock", outputLP: null },
  ],

  dependencies: [
    { dir: "Parent", wo: "WO-2026-0114", product: "[INT] Farsz pierogowy mieszany", reqQty: 420, parentStatus: "planned", materialLink: "R-IN1301" },
    { dir: "Parent", wo: "WO-2026-0116", product: "[INT] Gotowe ciasto pierogowe", reqQty: 180, parentStatus: "released", materialLink: "R-IN1302" },
  ],

  dagNodes: [
    // layer 1 (parents)
    { layer: 1, code: "WO-2026-0114", name: "[INT] Farsz pierogowy mieszany", qty: 420, uom: "kg", status: "planned", current: false },
    { layer: 1, code: "WO-2026-0116", name: "[INT] Gotowe ciasto pierogowe", qty: 180, uom: "kg", status: "released", current: false },
    // layer 2 (current WO)
    { layer: 2, code: "WO-2026-0113", name: "Pierogi z mięsem 400g", qty: 800, uom: "kg", status: "planned", current: true },
    // layer 3 (no children in this example — just label the layer)
  ],

  reservations: [
    { material: "R-1501 · Mąka pszenna typ 500", lp: "LP-7201", qty: 180, uom: "kg", type: "hard_lock", reservedAt: null, reservedBy: null, releasedAt: null, releaseReason: null, pendingRelease: true, note: "Pending — created on RELEASE transition" },
    { material: "R-1601 · Jaja kurze (żółtka)", lp: "LP-7305", qty: 24, uom: "kg", type: "hard_lock", reservedAt: null, reservedBy: null, releasedAt: null, releaseReason: null, pendingRelease: true, note: "Pending — created on RELEASE transition" },
    { material: "R-1201 · Sól kuchenna", lp: "LP-7410", qty: 4, uom: "kg", type: "hard_lock", reservedAt: null, reservedBy: null, releasedAt: null, releaseReason: null, pendingRelease: true, note: "Pending — created on RELEASE transition" },
  ],

  sequencing: {
    line: "LINE-04 — Pierogi",
    position: 3,
    totalOnLine: 5,
    beforeWo: "WO-2026-0089",
    afterWo: "WO-2026-0117",
    override: false,
    overrideReason: null,
    allergenProfile: ["gluten", "egg"],
    changeoverCost: "low",
    changeoverNote: "Same allergen family as previous WO (gluten, egg) — no extra cleandown.",
  },

  statusHistory: [
    { from: null, to: "draft", t: "2026-04-20 08:14:22", user: "m.krawczyk", action: "create", overrideReason: null, context: { source: "manual", created_with_bom: "v5" } },
    { from: "draft", to: "planned", t: "2026-04-20 11:42:08", user: "m.krawczyk", action: "plan", overrideReason: null, context: { materials_checked: 5, availability: "mixed" } },
  ],

  d365: null, // populated only for d365_so source
};

// =========================================================
// Phase 2 — PO / TO / Gantt / Cascade data
// =========================================================

// ----- Purchase Orders -----
const PLAN_POS = [
  { id: "PO-2026-00041", supplier: "Agro-Fresh Ltd.", supplierCode: "SUP-0012", exp: "2026-04-22", rel: "Tomorrow", lines: 4, status: "confirmed", total: "£3 420", currency: "GBP", drift: false },
  { id: "PO-2026-00042", supplier: "Baltic Pork Co.", supplierCode: "SUP-0018", exp: "2026-04-23", rel: "In 2 days", lines: 2, status: "confirmed", total: "£8 160", currency: "GBP", drift: false },
  { id: "PO-2026-00043", supplier: "Spice Masters", supplierCode: "SUP-0022", exp: "2026-04-24", rel: "In 3 days", lines: 8, status: "pending_approval", total: "£1 280", currency: "GBP", drift: false },
  { id: "PO-2026-00044", supplier: "Viscofan S.A.", supplierCode: "SUP-0031", exp: "2026-04-25", rel: "In 4 days", lines: 1, status: "submitted", total: "£18 240", currency: "GBP", drift: false },
  { id: "PO-2026-00037", supplier: "Viscofan S.A.", supplierCode: "SUP-0031", exp: "2026-04-20", rel: "Yesterday", lines: 2, status: "pending_approval", total: "£18 240", currency: "GBP", drift: false, overdue: 1 },
  { id: "PO-2026-00034", supplier: "Spice Masters", supplierCode: "SUP-0022", exp: "2026-04-18", rel: "3 days ago", lines: 3, status: "pending_approval", total: "£4 120", currency: "GBP", drift: false, overdue: 3 },
  { id: "PO-2026-00028", supplier: "Agro-Fresh Ltd.", supplierCode: "SUP-0012", exp: "2026-04-17", rel: "4 days ago", lines: 5, status: "confirmed", total: "£7 840", currency: "GBP", drift: false, overdue: 4 },
  { id: "PO-2026-00031", supplier: "Hellmann Logistics", supplierCode: "SUP-0044", exp: "2026-04-19", rel: "2 days ago", lines: 2, status: "receiving", total: "£2 660", currency: "GBP", drift: false, overdue: 2 },
  { id: "PO-2026-00045", supplier: "Hellmann Logistics", supplierCode: "SUP-0044", exp: "2026-04-28", rel: "In 7 days", lines: 3, status: "draft", total: "£4 820", currency: "GBP", drift: false },
  { id: "PO-2026-00046", supplier: "Premium Dairy Ltd.", supplierCode: "SUP-0052", exp: "2026-04-29", rel: "In 8 days", lines: 5, status: "confirmed", total: "£6 410", currency: "GBP", drift: true },
  { id: "PO-2026-00030", supplier: "Agro-Fresh Ltd.", supplierCode: "SUP-0012", exp: "2026-04-16", rel: "5 days ago", lines: 4, status: "receiving", total: "£5 240", currency: "GBP", drift: false },
  { id: "PO-2026-00026", supplier: "Premium Dairy Ltd.", supplierCode: "SUP-0052", exp: "2026-04-15", rel: "6 days ago", lines: 3, status: "closed", total: "£3 980", currency: "GBP", drift: false },
  { id: "PO-2026-00024", supplier: "Baltic Pork Co.", supplierCode: "SUP-0018", exp: "2026-04-14", rel: "7 days ago", lines: 2, status: "closed", total: "£11 420", currency: "GBP", drift: false },
];

// PO Detail — PO-2026-00044 (Viscofan — high value, pending approval)
const PLAN_PO_DETAIL = {
  id: "PO-2026-00044",
  supplier: "Viscofan S.A.",
  supplierCode: "SUP-0031",
  supplierLink: "/technical/suppliers/SUP-0031",
  status: "pending_approval",
  orderDate: "2026-04-19",
  exp: "2026-04-25",
  warehouse: "WH-Factory-A",
  currency: "GBP",
  paymentTerms: "Net 30",
  sourceType: "manual",
  source: "Planner (m.krawczyk)",
  subtotal: 18240.00,
  tax: 3648.00,
  discountTotal: 0.00,
  total: 21888.00,
  notes: "Urgent restock — current stock level at 12% of safety. Prioritise delivery.",
  internalNotes: "Approved by commercial — see email dated 2026-04-18.",
  approvalRequired: true,
  approvalThreshold: 15000,
  approvalRole: "Production Manager",
  lines: [
    { seq: 1, code: "R-3001", product: "Osłonka Ø26 (Viscofan)", qty: 2400, uom: "m", unitPrice: 7.60, discount: 0, lineTotal: 18240.00, lineExp: "2026-04-25", received: 0, status: "not_received", eudr: false },
  ],
  statusHistory: [
    { from: null, to: "draft", t: "2026-04-19 11:02", user: "m.krawczyk", action: "create", notes: "Created via PO fast-flow" },
    { from: "draft", to: "submitted", t: "2026-04-19 11:08", user: "m.krawczyk", action: "submit", notes: "Submitted for approval — over threshold" },
    { from: "submitted", to: "pending_approval", t: "2026-04-19 11:08", user: "system", action: "auto", notes: "Approval required: total £21 888 > threshold £15 000" },
  ],
  d365: { synced: true, drift: false, lastSync: "2026-04-19 11:09", d365SupplierId: "V-D365-SUP-0031", d365Status: "synced" },
};

// ----- Transfer Orders -----
const PLAN_TOS = [
  { id: "TO-2026-00015", from: "WH-Factory-A", to: "WH-DistCentral", ship: "2026-04-21", shipRel: "Today", recv: "2026-04-22", recvRel: "Tomorrow", priority: "normal", status: "planned", lines: 3 },
  { id: "TO-2026-00016", from: "WH-Factory-B", to: "WH-Factory-A", ship: "2026-04-22", shipRel: "Tomorrow", recv: "2026-04-22", recvRel: "Tomorrow", priority: "high", status: "shipped", lines: 2 },
  { id: "TO-2026-00017", from: "WH-Factory-A", to: "WH-DistNorth", ship: "2026-04-23", shipRel: "In 2 days", recv: "2026-04-24", recvRel: "In 3 days", priority: "normal", status: "planned", lines: 5 },
  { id: "TO-2026-00018", from: "WH-Cold-01", to: "WH-Factory-A", ship: "2026-04-24", shipRel: "In 3 days", recv: "2026-04-24", recvRel: "In 3 days", priority: "urgent", status: "draft", lines: 1 },
  { id: "TO-2026-00014", from: "WH-Factory-A", to: "WH-DistCentral", ship: "2026-04-19", shipRel: "2 days ago", recv: "2026-04-20", recvRel: "Yesterday", priority: "normal", status: "partially_shipped", lines: 4, overdue: 1 },
  { id: "TO-2026-00013", from: "WH-Factory-B", to: "WH-DistSouth", ship: "2026-04-18", shipRel: "3 days ago", recv: "2026-04-19", recvRel: "2 days ago", priority: "normal", status: "received", lines: 6 },
  { id: "TO-2026-00012", from: "WH-Factory-A", to: "WH-Factory-B", ship: "2026-04-16", shipRel: "5 days ago", recv: "2026-04-16", recvRel: "5 days ago", priority: "low", status: "closed", lines: 2 },
  { id: "TO-2026-00011", from: "WH-Cold-01", to: "WH-Factory-B", ship: "2026-04-14", shipRel: "7 days ago", recv: "2026-04-14", recvRel: "7 days ago", priority: "normal", status: "closed", lines: 3 },
];

// TO Detail — TO-2026-00015 (planned, 3 lines, LP breakdown)
const PLAN_TO_DETAIL = {
  id: "TO-2026-00015",
  status: "planned",
  from: "WH-Factory-A",
  to: "WH-DistCentral",
  priority: "normal",
  plannedShip: "2026-04-21 14:00",
  plannedRecv: "2026-04-22 09:00",
  actualShip: null,
  actualRecv: null,
  shippedBy: null,
  receivedBy: null,
  notes: "Standard twice-weekly replenishment run.",
  lines: [
    { seq: 1, code: "FA5100", product: "Kiełbasa śląska pieczona 450g", qty: 200, uom: "kg", shipped: 0, received: 0, status: "pending" },
    { seq: 2, code: "FA5200", product: "Pasztet drobiowy z żurawiną 180g", qty: 80, uom: "kg", shipped: 0, received: 0, status: "pending" },
    { seq: 3, code: "FA5301", product: "Pierogi z mięsem 400g", qty: 120, uom: "kg", shipped: 0, received: 0, status: "pending" },
  ],
  lps: [
    { line: 1, lp: "LP-9120", qty: 120, status: "reserved" },
    { line: 1, lp: "LP-9121", qty: 80,  status: "reserved" },
    { line: 2, lp: "LP-9140", qty: 80,  status: "reserved" },
    { line: 3, lp: "LP-9160", qty: 120, status: "available" },
  ],
  history: [
    { from: null, to: "draft", t: "2026-04-20 09:12", user: "m.krawczyk", action: "create" },
    { from: "draft", to: "planned", t: "2026-04-20 14:08", user: "m.krawczyk", action: "plan", notes: "LPs reserved for 3 lines" },
  ],
};

// ----- Gantt View -----
// 5 production lines, today + 6 days
const GANTT_LINES = [
  { id: "LINE-01", name: "Line 1 — Cured meats" },
  { id: "LINE-02", name: "Line 2 — Ready meals" },
  { id: "LINE-03", name: "Line 3 — Deli" },
  { id: "LINE-04", name: "Line 4 — Pierogi" },
  { id: "LINE-05", name: "Line 5 — Sous-vide" },
];

// WO bars on gantt (day index 0..6, start hour 0..24)
// allergenPrimary determines bottom 4px color strip
const GANTT_BARS = [
  // LINE-01
  { line: "LINE-01", id: "WO-2026-0108", item: "FA5100", name: "Kiełbasa śląska", day: 0, start: 6,  end: 9.5,  status: "released",    priority: "normal", allergen: "free" },
  { line: "LINE-01", id: "WO-2026-0109", item: "FA5102", name: "Szynka plastry", day: 0, start: 13, end: 18,   status: "planned",     priority: "high",   allergen: "free" },
  { line: "LINE-01", id: "WO-2026-0130", item: "FA5100", name: "Kiełbasa",       day: 1, start: 6,  end: 10.5, status: "planned",     priority: "normal", allergen: "free" },
  { line: "LINE-01", id: "WO-2026-0135", item: "FA5105", name: "Boczek wędz.",   day: 2, start: 6,  end: 12,   status: "planned",     priority: "normal", allergen: "free" },
  { line: "LINE-01", id: "WO-2026-0141", item: "FA5110", name: "Szynka z miodem",day: 4, start: 6,  end: 10,   status: "planned",     priority: "normal", allergen: "free" },
  // LINE-02
  { line: "LINE-02", id: "WO-2026-0111", item: "FA5021", name: "Gulasz wołowy",  day: 0, start: 14.5, end: 20, status: "released",    priority: "normal", allergen: "gluten" },
  { line: "LINE-02", id: "WO-2026-0120", item: "FA5023", name: "Klopsiki",       day: 1, start: 8,  end: 15,   status: "draft",       priority: "normal", allergen: "gluten" },
  { line: "LINE-02", id: "WO-2026-0131", item: "FA5025", name: "Pulpety",        day: 2, start: 8,  end: 14,   status: "planned",     priority: "normal", allergen: "gluten" },
  { line: "LINE-02", id: "WO-2026-0136", item: "FA5026", name: "Bitka wołowa",   day: 3, start: 8,  end: 13,   status: "planned",     priority: "high",   allergen: "gluten" },
  { line: "LINE-02", id: "WO-2026-0142", item: "FA5027", name: "Gulasz mysliw.", day: 5, start: 8,  end: 14,   status: "planned",     priority: "normal", allergen: "gluten" },
  // LINE-03
  { line: "LINE-03", id: "WO-2026-0100", item: "FA5200", name: "Pasztet drob.",  day: 0, start: 4.5,end: 8,    status: "in_progress", priority: "normal", allergen: "free" },
  { line: "LINE-03", id: "WO-2026-0112", item: "FA5200", name: "Pasztet drob.",  day: 1, start: 8,  end: 12.5, status: "planned",     priority: "critical", allergen: "free", conflict: true },
  { line: "LINE-03", id: "WO-2026-0137", item: "FA5201", name: "Pasztet cielęcy",day: 3, start: 8,  end: 13,   status: "planned",     priority: "normal", allergen: "free" },
  // LINE-04
  { line: "LINE-04", id: "WO-2026-0114", item: "IN1301", name: "[INT] Farsz",    day: 1, start: 6,  end: 9,    status: "planned",     priority: "normal", allergen: "egg" },
  { line: "LINE-04", id: "WO-2026-0113", item: "FA5301", name: "Pierogi z mięs.",day: 1, start: 10, end: 16.5, status: "planned",     priority: "normal", allergen: "egg" },
  { line: "LINE-04", id: "WO-2026-0117", item: "FA5302", name: "Pierogi z kap.", day: 2, start: 8,  end: 13,   status: "planned",     priority: "normal", allergen: "gluten" },
  { line: "LINE-04", id: "WO-2026-0099", item: "FA5301", name: "Rework pierogi", day: 0, start: 16, end: 18,   status: "released",    priority: "high",   allergen: "egg" },
  { line: "LINE-04", id: "WO-2026-0145", item: "FA5303", name: "Uszka z mięs.",  day: 4, start: 8,  end: 13,   status: "planned",     priority: "normal", allergen: "egg" },
  // LINE-05
  { line: "LINE-05", id: "WO-2026-0115", item: "FA5400", name: "Filet sous-vide",day: 2, start: 10, end: 16,   status: "draft",       priority: "normal", allergen: "free" },
  { line: "LINE-05", id: "WO-2026-0143", item: "FA5401", name: "Karkówka s.v.",  day: 3, start: 10, end: 14,   status: "planned",     priority: "normal", allergen: "free" },
  { line: "LINE-05", id: "WO-2026-0150", item: "FA5400", name: "Filet sous-vide",day: 5, start: 10, end: 16,   status: "planned",     priority: "normal", allergen: "free" },
];

// DAG arrows in gantt — parent→child WO on same view
const GANTT_DEPS = [
  { parent: "WO-2026-0114", child: "WO-2026-0113", qty: 420, uom: "kg" },
];

// ----- Cascade DAG (global, 3 chains) -----
// Layered graph: layer = depth from deepest input (root FA at highest layer number)
const CASCADE_DAG = [
  // Chain 1 — Klopsiki (3 layers)
  { chainId: "chain-1", rootFa: "WO-2026-0120", rootName: "Klopsiki w sosie pomidorowym 320g", layer: 0, code: "WO-2026-0125", name: "[INT] Baza pomidorowa 10kg", product: "IN2001", status: "planned",     priority: "normal", allergens: ["free"], avail: "green", qty: 80,  uom: "kg" },
  { chainId: "chain-1", rootFa: "WO-2026-0120", rootName: "Klopsiki w sosie pomidorowym 320g", layer: 0, code: "WO-2026-0126", name: "[INT] Panierka ziołowa 5kg",   product: "IN2002", status: "planned",     priority: "normal", allergens: ["gluten"], avail: "yellow", qty: 30, uom: "kg" },
  { chainId: "chain-1", rootFa: "WO-2026-0120", rootName: "Klopsiki w sosie pomidorowym 320g", layer: 1, code: "WO-2026-0127", name: "[INT] Farsz klopsikowy 20kg",   product: "IN2003", status: "planned",     priority: "normal", allergens: ["gluten","egg","dairy"], avail: "yellow", qty: 180, uom: "kg" },
  { chainId: "chain-1", rootFa: "WO-2026-0120", rootName: "Klopsiki w sosie pomidorowym 320g", layer: 2, code: "WO-2026-0120", name: "Klopsiki w sosie pomidorowym 320g", product: "FA5023", status: "draft",       priority: "normal", allergens: ["gluten","egg","dairy"], avail: "green", qty: 900, uom: "kg" },
  // Chain 2 — Pierogi (2 layers)
  { chainId: "chain-2", rootFa: "WO-2026-0113", rootName: "Pierogi z mięsem 400g", layer: 0, code: "WO-2026-0114", name: "[INT] Farsz pierogowy 20kg", product: "IN1301", status: "planned", priority: "normal", allergens: ["egg"], avail: "yellow", qty: 420, uom: "kg" },
  { chainId: "chain-2", rootFa: "WO-2026-0113", rootName: "Pierogi z mięsem 400g", layer: 0, code: "WO-2026-0116", name: "[INT] Gotowe ciasto pierog.", product: "IN1302", status: "released", priority: "normal", allergens: ["gluten"], avail: "green", qty: 180, uom: "kg" },
  { chainId: "chain-2", rootFa: "WO-2026-0113", rootName: "Pierogi z mięsem 400g", layer: 1, code: "WO-2026-0113", name: "Pierogi z mięsem 400g", product: "FA5301", status: "planned", priority: "normal", allergens: ["gluten","egg"], avail: "green", qty: 800, uom: "kg" },
  // Chain 3 — Pasztet (2 layers)
  { chainId: "chain-3", rootFa: "WO-2026-0112", rootName: "Pasztet drobiowy 180g", layer: 0, code: "WO-2026-0128", name: "[INT] Masa pasztetowa 20kg", product: "IN1401", status: "in_progress", priority: "normal", allergens: ["free"], avail: "produced", qty: 60, uom: "kg" },
  { chainId: "chain-3", rootFa: "WO-2026-0112", rootName: "Pasztet drobiowy 180g", layer: 1, code: "WO-2026-0112", name: "Pasztet drobiowy z żurawiną 180g", product: "FA5200", status: "planned", priority: "critical", allergens: ["free"], avail: "red", qty: 420, uom: "kg" },
];

const CASCADE_EDGES = [
  // Chain 1
  { from: "WO-2026-0125", to: "WO-2026-0127", qty: 80,  uom: "kg" },
  { from: "WO-2026-0126", to: "WO-2026-0127", qty: 30,  uom: "kg" },
  { from: "WO-2026-0127", to: "WO-2026-0120", qty: 180, uom: "kg" },
  // Chain 2
  { from: "WO-2026-0114", to: "WO-2026-0113", qty: 420, uom: "kg" },
  { from: "WO-2026-0116", to: "WO-2026-0113", qty: 180, uom: "kg" },
  // Chain 3
  { from: "WO-2026-0128", to: "WO-2026-0112", qty: 60,  uom: "kg" },
];

// =========================================================
// Phase 3 — Reservations / Sequencing / Settings / D365 Queue
// =========================================================

const PLAN_RESERVATIONS = [
  { wo: "WO-2026-0108", woProduct: "FA5100 · Kiełbasa śląska", material: "R-1001 · Wieprzowina kl. II", lp: "LP-4431", reservedQty: 220.5, lpTotalQty: 220.5, type: "hard_lock", reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active" },
  { wo: "WO-2026-0108", woProduct: "FA5100 · Kiełbasa śląska", material: "R-1001 · Wieprzowina kl. II", lp: "LP-4432", reservedQty: 137.5, lpTotalQty: 137.5, type: "hard_lock", reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active" },
  { wo: "WO-2026-0108", woProduct: "FA5100 · Kiełbasa śląska", material: "R-1002 · Słonina wieprzowa", lp: "LP-4470", reservedQty: 148.0, lpTotalQty: 200.0, type: "hard_lock", reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active" },
  { wo: "WO-2026-0108", woProduct: "FA5100 · Kiełbasa śląska", material: "R-2101 · Pieprz czarny", lp: "LP-5582", reservedQty: 4.2, lpTotalQty: 25.0, type: "hard_lock", reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active" },
  { wo: "WO-2026-0111", woProduct: "FA5021 · Gulasz wołowy", material: "R-1101 · Wołowina gulaszowa", lp: "LP-4850", reservedQty: 480.0, lpTotalQty: 480.0, type: "hard_lock", reservedAt: "2026-04-21 06:20", reservedBy: "m.krawczyk", status: "active" },
  { wo: "WO-2026-0111", woProduct: "FA5021 · Gulasz wołowy", material: "R-1501 · Mąka pszenna", lp: "LP-7200", reservedQty: 96.0, lpTotalQty: 200.0, type: "hard_lock", reservedAt: "2026-04-21 06:20", reservedBy: "m.krawczyk", status: "active" },
  { wo: "WO-2026-0099", woProduct: "FA5301 · Pierogi z mięsem (rework)", material: "R-1501 · Mąka pszenna", lp: "LP-7201", reservedQty: 28.0, lpTotalQty: 180.0, type: "hard_lock", reservedAt: "2026-04-21 08:14", reservedBy: "m.krawczyk", status: "active" },
  { wo: "WO-2026-0100B", woProduct: "FA5400 · Filet sous-vide", material: "R-1201 · Filet z kurczaka", lp: "LP-5020", reservedQty: 360.0, lpTotalQty: 360.0, type: "hard_lock", reservedAt: "2026-04-19 21:30", reservedBy: "m.krawczyk", status: "consumed", releasedAt: "2026-04-20 02:18", releaseReason: "consumed" },
  { wo: "WO-2026-0090", woProduct: "FA5300 · Pierogi ruskie", material: "R-1501 · Mąka pszenna", lp: "LP-7100", reservedQty: 150.0, lpTotalQty: 180.0, type: "hard_lock", reservedAt: "2026-04-18 10:00", reservedBy: "k.kowal", status: "cancelled", releasedAt: "2026-04-19 15:40", releaseReason: "cancelled" },
];

const RES_AVAILABILITY = {
  product: "R-1501 · Mąka pszenna typ 500",
  lps: [
    { lp: "LP-7200", total: 200, reserved: 96, net: 104, expiry: "2026-08-14", status: "available" },
    { lp: "LP-7201", total: 180, reserved: 208, net: -28, expiry: "2026-09-02", status: "overcommitted" },
    { lp: "LP-7100", total: 180, reserved: 0, net: 180, expiry: "2026-07-10", status: "available" },
    { lp: "LP-7400", total: 240, reserved: 0, net: 240, expiry: "2026-09-15", status: "available" },
  ],
};

// ----- Sequencing View (LINE-04 — 8 WOs) -----
const SEQ_QUEUE = [
  { pos: 1, wo: "WO-2026-0155", product: "Pierogi ze szpinakiem 400g", allergens: ["free"],    priority: "normal",   start: "2026-04-22 06:00", dur: "3h 00m", group: "free" },
  { pos: 2, wo: "WO-2026-0117", product: "Pierogi z kapustą 400g",     allergens: ["gluten"],  priority: "normal",   start: "2026-04-22 09:00", dur: "3h 00m", group: "gluten" },
  { pos: 3, wo: "WO-2026-0113", product: "Pierogi z mięsem 400g",      allergens: ["gluten","egg"], priority: "normal", start: "2026-04-22 10:00", dur: "6h 30m", group: "multi", current: true },
  { pos: 4, wo: "WO-2026-0114", product: "[INT] Farsz pierogowy 20kg", allergens: ["egg"],     priority: "normal",   start: "2026-04-22 06:00", dur: "3h 00m", group: "egg" },
  { pos: 5, wo: "WO-2026-0089", product: "Klopsiki w sosie 320g",      allergens: ["gluten","dairy"], priority: "normal", start: "2026-04-23 08:00", dur: "4h 00m", group: "multi" },
  { pos: 6, wo: "WO-2026-0121", product: "Filet z kurczaka sous-vide", allergens: ["free"],    priority: "critical", start: "2026-04-23 12:00", dur: "4h 00m", group: "free", exempt: true },
  { pos: 7, wo: "WO-2026-0145", product: "Uszka z mięsem 300g",        allergens: ["gluten","egg"], priority: "normal", start: "2026-04-24 06:00", dur: "5h 00m", group: "multi" },
  { pos: 8, wo: "WO-2026-0146", product: "Pierogi z serem 400g",       allergens: ["gluten","dairy"], priority: "normal", start: "2026-04-24 11:00", dur: "3h 30m", group: "multi" },
];

const SEQ_KPIS = { changeovers: 4, baseline: 7, reductionPct: 43 };

// ----- Planning Settings -----
const PLAN_SETTINGS = {
  general: {
    defaultCurrency: "GBP", defaultIntermediateDisposition: "to_stock", cascadeMaxDepth: 10,
  },
  po: {
    autoNumber: true, prefix: "PO-", numberFormat: "PO-{YYYY}-{NNNNN}",
    requireApproval: true, approvalThreshold: 15000, approvalRoles: ["Production Manager"],
    autoCloseOnFullReceipt: true, defaultLeadTime: 7,
  },
  to: {
    autoNumber: true, prefix: "TO-", allowPartialShipments: true, requireLpSelection: false,
  },
  wo: {
    autoNumber: true, prefix: "WO-", numberFormat: "WO-{YYYYMMDD}-{NNNN}",
    autoSelectActiveBom: true, copyRouting: true, materialCheck: true, materialCheckBlocksRelease: false,
    requireBom: true, allowOverproduction: false, overproductionLimit: 5,
    requireReworkApproval: true, defaultPriority: "Normal", autoArchiveClosedDays: 90,
  },
  cascade: { maxDepth: 10, intermediateDisposition: "to_stock" },
  sequencing: { enabled: true, ruleVersion: "v1", target: "> 30% Apex baseline" },
  d365: {
    enabled: true, pullCron: "0 2 * * *", pullWindowDays: 14, soStatusFilter: ["Open","Confirmed"],
    lastPull: "2026-04-21 02:00", lastSoCount: 12, lastDraftWoCount: 5, lastErrors: 0,
  },
  statusDisplay: {
    po: [
      { key: "draft", labelEn: "Draft", labelPl: "Szkic", color: "#64748b", icon: "◦" },
      { key: "submitted", labelEn: "Submitted", labelPl: "Wysłano", color: "#1976D2", icon: "→" },
      { key: "pending_approval", labelEn: "Pending approval", labelPl: "Do zatwierdzenia", color: "#f59e0b", icon: "⏳" },
      { key: "confirmed", labelEn: "Confirmed", labelPl: "Potwierdzono", color: "#1976D2", icon: "✓" },
      { key: "receiving", labelEn: "Receiving", labelPl: "Odbiór", color: "#22c55e", icon: "▼" },
      { key: "closed", labelEn: "Closed", labelPl: "Zamknięto", color: "#64748b", icon: "●" },
      { key: "cancelled", labelEn: "Cancelled", labelPl: "Anulowano", color: "#ef4444", icon: "✕" },
    ],
  },
  fieldVisibility: [
    { entity: "PO", field: "supplier", Purchaser: true, Planner: true, ProdMgr: true, WhOp: false, required: true },
    { entity: "PO", field: "internalNotes", Purchaser: true, Planner: true, ProdMgr: true, WhOp: false, required: false },
    { entity: "PO", field: "approvalThreshold", Purchaser: true, Planner: false, ProdMgr: true, WhOp: false, required: false },
    { entity: "WO", field: "meatPct", Purchaser: false, Planner: true, ProdMgr: true, WhOp: true, required: false },
    { entity: "WO", field: "bomSnapshot", Purchaser: false, Planner: true, ProdMgr: true, WhOp: true, required: true },
    { entity: "WO", field: "cascadeLayer", Purchaser: false, Planner: true, ProdMgr: true, WhOp: false, required: false },
    { entity: "TO", field: "priority", Purchaser: false, Planner: true, ProdMgr: true, WhOp: true, required: true },
    { entity: "TO", field: "internalNotes", Purchaser: false, Planner: true, ProdMgr: true, WhOp: false, required: false },
  ],
};

// ----- D365 SO Queue -----
const D365_PULL_HISTORY = { lastRun: "2026-04-21 02:00:14", soCount: 12, draftWoCount: 5, errors: 1 };

const D365_DRAFT_WOS = [
  { soRef: "SO-00128-C1", wo: "WO-2026-0112", product: "Pasztet drobiowy z żurawiną 180g", item: "FA5200", qty: 420, uom: "kg", start: "2026-04-22 08:00", depth: 2, bom: "v3", status: "draft", pullDate: "2026-04-21 02:00" },
  { soRef: "SO-00129-A2", wo: "WO-2026-0153", product: "Kiełbasa wędzona 300g", item: "FA5103", qty: 600, uom: "kg", start: "2026-04-23 06:00", depth: 1, bom: "v2", status: "draft", pullDate: "2026-04-21 02:00" },
  { soRef: "SO-00130-B1", wo: "WO-2026-0154", product: "Klopsiki w sosie 320g", item: "FA5023", qty: 900, uom: "kg", start: "2026-04-24 08:00", depth: 3, bom: "v4", status: "released", pullDate: "2026-04-21 02:00", childWos: ["WO-2026-0125","WO-2026-0126","WO-2026-0127"] },
  { soRef: "SO-00131-C2", wo: "WO-2026-0156", product: "Pierogi z kapustą 400g", item: "FA5302", qty: 240, uom: "kg", start: "2026-04-22 14:00", depth: 1, bom: "v2", status: "draft", pullDate: "2026-04-21 02:00" },
  { soRef: "SO-00132-A1", wo: "WO-2026-0157", product: "Szynka plastry 150g", item: "FA5102", qty: 320, uom: "kg", start: "2026-04-23 13:00", depth: 1, bom: "v6", status: "draft", pullDate: "2026-04-21 02:00" },
];

const D365_PULL_ERRORS = [
  { soRef: "SO-00133-D4", errorType: "BOM_MISSING", message: "No active BOM for product FA9912 — cannot auto-select", t: "2026-04-21 02:00:14" },
];

// ----- Draft WO Review modal — per-WO material availability + cascade tree -----
// Keyed by WO id (the draft WO reviewed from D365 queue).
const D365_DRAFT_WO_REVIEW = {
  "WO-2026-0112": {
    materials: [
      { code: "R-1201", name: "Wątroba drobiowa", qty: 180, uom: "kg", avail: "red"   },
      { code: "R-1301", name: "Żurawina suszona", qty: 22,  uom: "kg", avail: "yellow" },
      { code: "R-1401", name: "Cebula",           qty: 30,  uom: "kg", avail: "green"  },
      { code: "R-1201b",name: "Masło extra",      qty: 12,  uom: "kg", avail: "green"  },
    ],
    cascadeChain: [
      { wo: "WO-2026-0128", product: "[INT] Masa pasztetowa 20kg", item: "IN1401", qty: 60,  uom: "kg", layer: 1, status: "in_progress" },
      { wo: "WO-2026-0112", product: "Pasztet drobiowy z żurawiną 180g", item: "FA5200", qty: 420, uom: "kg", layer: 2, status: "draft", root: true },
    ],
    line: "LINE-03",
    seqPosition: 2,
  },
  "WO-2026-0153": {
    materials: [
      { code: "R-1001", name: "Wieprzowina kl. II", qty: 480, uom: "kg", avail: "green"  },
      { code: "R-2101", name: "Pieprz czarny",      qty: 3,   uom: "kg", avail: "green"  },
      { code: "R-2102", name: "Papryka wędzona",    qty: 2.4, uom: "kg", avail: "yellow" },
    ],
    cascadeChain: [
      { wo: "WO-2026-0153", product: "Kiełbasa wędzona 300g", item: "FA5103", qty: 600, uom: "kg", layer: 1, status: "draft", root: true },
    ],
    line: "LINE-01",
    seqPosition: 4,
  },
  "WO-2026-0154": {
    materials: [
      { code: "R-1001", name: "Wieprzowina kl. II", qty: 540, uom: "kg", avail: "yellow" },
      { code: "R-1501", name: "Mąka pszenna typ 500", qty: 80,  uom: "kg", avail: "green"  },
      { code: "R-1701", name: "Pomidory krojone",   qty: 220, uom: "kg", avail: "green"  },
      { code: "R-1601", name: "Jaja kurze",         qty: 18,  uom: "kg", avail: "green"  },
      { code: "R-1801", name: "Mleko 3.2%",         qty: 24,  uom: "kg", avail: "red"    },
    ],
    cascadeChain: [
      { wo: "WO-2026-0125", product: "[INT] Baza pomidorowa 10kg", item: "IN2001", qty: 80,  uom: "kg", layer: 1, status: "planned" },
      { wo: "WO-2026-0126", product: "[INT] Panierka ziołowa 5kg", item: "IN2002", qty: 30,  uom: "kg", layer: 1, status: "planned" },
      { wo: "WO-2026-0127", product: "[INT] Farsz klopsikowy 20kg", item: "IN2003", qty: 180, uom: "kg", layer: 2, status: "planned" },
      { wo: "WO-2026-0154", product: "Klopsiki w sosie 320g", item: "FA5023", qty: 900, uom: "kg", layer: 3, status: "draft", root: true },
    ],
    line: "LINE-02",
    seqPosition: 1,
  },
  "WO-2026-0156": {
    materials: [
      { code: "R-1501", name: "Mąka pszenna typ 500", qty: 60,  uom: "kg", avail: "green"  },
      { code: "R-1902", name: "Kapusta kiszona",      qty: 120, uom: "kg", avail: "green"  },
      { code: "R-1601", name: "Jaja kurze",           qty: 8,   uom: "kg", avail: "green"  },
    ],
    cascadeChain: [
      { wo: "WO-2026-0156", product: "Pierogi z kapustą 400g", item: "FA5302", qty: 240, uom: "kg", layer: 1, status: "draft", root: true },
    ],
    line: "LINE-04",
    seqPosition: 3,
  },
  "WO-2026-0157": {
    materials: [
      { code: "R-1001", name: "Wieprzowina kl. II", qty: 240, uom: "kg", avail: "green" },
      { code: "R-2101", name: "Pieprz czarny",      qty: 2,   uom: "kg", avail: "green" },
    ],
    cascadeChain: [
      { wo: "WO-2026-0157", product: "Szynka plastry 150g", item: "FA5102", qty: 320, uom: "kg", layer: 1, status: "draft", root: true },
    ],
    line: "LINE-01",
    seqPosition: 2,
  },
};

Object.assign(window, {
  PLAN_NAV, PLAN_KPIS, PO_ALERTS, WO_ALERTS, TO_ALERTS,
  UPCOMING_POS, UPCOMING_WOS, UPCOMING_TOS, CASCADE_CHAINS, ACTIVITY_FEED,
  PLAN_WOS, PLAN_WO_DETAIL,
  PLAN_POS, PLAN_PO_DETAIL,
  PLAN_TOS, PLAN_TO_DETAIL,
  PLAN_SUPPLIERS, SUPPLIER_PRODUCTS,
  GANTT_LINES, GANTT_BARS, GANTT_DEPS,
  CASCADE_DAG, CASCADE_EDGES,
  PLAN_RESERVATIONS, RES_AVAILABILITY,
  SEQ_QUEUE, SEQ_KPIS,
  PLAN_SETTINGS,
  D365_PULL_HISTORY, D365_DRAFT_WOS, D365_PULL_ERRORS, D365_DRAFT_WO_REVIEW,
});
