// ============ Multi-Site module — mock data ============
// Cross-refs: Planning (WO-2026-0108 distributed across sites, TO-2026-00016 is inter-factory),
// Warehouse (LP tags per site), Finance (JE-0091 inter-company charge).
//
// 4 sites modeled:
//   SITE-A   → FRZ-UK  Factory-A (main plant, production)      [default]
//   SITE-B   → FRZ-DE  Factory-B (KOBE Germany, co-pack)
//   SITE-WH-01 → WH-COLD Cold-storage warehouse (UK)
//   SITE-OFF   → FRZ-OFFICE-LND Office (London HQ)             [decommission candidate]

const MS_NAV = [
  { group: "Network", items: [
    { key: "dashboard",    label: "Network Dashboard",  ic: "◆", hero: true },
    { key: "sites",        label: "Sites",              ic: "⌂", count: "4" },
  ]},
  { group: "Operations", items: [
    { key: "transfers",    label: "Inter-Site Transfers", ic: "⇌", count: "7" },
    { key: "lanes",        label: "Transport Lanes",      ic: "⟶", count: "5" },
  ]},
  { group: "Master Data", items: [
    { key: "master_data",  label: "Master Data Sync",     ic: "⇵", count: "3" },
    { key: "replication",  label: "Replication Queue",    ic: "▤" },
  ]},
  { group: "Admin", items: [
    { key: "permissions",  label: "Permissions",          ic: "◉" },
    { key: "analytics",    label: "Analytics",            ic: "▥" },
    { key: "settings",     label: "Multi-Site Settings",  ic: "⚙" },
    { key: "activation",   label: "Activation Wizard",    ic: "★" },
    { key: "gallery",      label: "Modal gallery",        ic: "▣" },
  ]},
];

// ----- Sites -----
const MS_SITES = [
  {
    id: "SITE-A",
    code: "FRZ-UK",
    name: "Apex Warsaw — Factory A",
    type: "plant",
    country: "United Kingdom",
    flag: "🇬🇧",
    tz: "Europe/London",
    tzShort: "UTC+1 BST",
    currency: "GBP",
    region: "eu-west-2",
    residencyTier: "P1",
    levelNames: "Site → Plant → Line",
    active: true,
    online: true,
    lastSync: "2 min ago",
    owner: "J. Smith",
    modules: 14,
    users: 28,
    isDefault: true,
    activationDate: "2025-11-12",
    createdAt: "2025-11-12 09:10",
    createdBy: "admin",
    activeWOs: 9,
    qualityHolds: 2,
    invValue: 1240000,
    invValueTxt: "£1,240,000",
    availability: "96%",
    notes: "Main plant. Hosts Production, Warehouse, NPD, Technical, Finance.",
    legalEntity: "Apex Foods Ltd",
    address: "Manchester Industrial Park, M11 4TR",
  },
  {
    id: "SITE-B",
    code: "FRZ-DE",
    name: "KOBE Germany — Factory B",
    type: "copack",
    country: "Germany",
    flag: "🇩🇪",
    tz: "Europe/Berlin",
    tzShort: "UTC+2 CEST",
    currency: "EUR",
    region: "eu-central-1",
    residencyTier: "P2",
    levelNames: "Site → Plant → Line",
    active: true,
    online: true,
    lastSync: "4 min ago",
    owner: "H. Müller",
    modules: 11,
    users: 14,
    isDefault: false,
    activationDate: "2026-01-22",
    createdAt: "2026-01-22 11:30",
    createdBy: "admin",
    activeWOs: 4,
    qualityHolds: 1,
    invValue: 780000,
    invValueTxt: "€780,000",
    availability: "92%",
    notes: "Co-pack facility. FEFO strict override active (local override L2).",
    legalEntity: "KOBE GmbH",
    address: "Am Industriepark 7, 60439 Frankfurt",
  },
  {
    id: "SITE-WH-01",
    code: "WH-COLD",
    name: "Cold Storage — Harlow",
    type: "warehouse",
    country: "United Kingdom",
    flag: "🇬🇧",
    tz: "Europe/London",
    tzShort: "UTC+1 BST",
    currency: "GBP",
    region: "eu-west-2",
    residencyTier: "P1",
    levelNames: "Site → Building → Aisle",
    active: true,
    online: true,
    lastSync: "7 min ago",
    owner: "A. Patel",
    modules: 6,
    users: 8,
    isDefault: false,
    activationDate: "2026-02-03",
    createdAt: "2026-02-03 14:02",
    createdBy: "admin",
    activeWOs: 0,
    qualityHolds: 0,
    invValue: 420000,
    invValueTxt: "£420,000",
    availability: "99%",
    notes: "Pure warehouse. No production.",
    legalEntity: "Apex Foods Ltd",
    address: "Harlow Logistics Park, CM19 5AB",
  },
  {
    id: "SITE-OFF",
    code: "FRZ-OFFICE-LND",
    name: "London Office",
    type: "office",
    country: "United Kingdom",
    flag: "🇬🇧",
    tz: "Europe/London",
    tzShort: "UTC+1 BST",
    currency: "GBP",
    region: "eu-west-2",
    residencyTier: "P1",
    levelNames: "Site → Floor",
    active: true,
    online: false,                  // degraded to trigger offline banner
    onlineState: "degraded",
    lastSync: "2h ago",
    owner: "—",
    modules: 3,
    users: 2,
    isDefault: false,
    activationDate: "2026-02-20",
    createdAt: "2026-02-20",
    createdBy: "admin",
    activeWOs: 0,
    qualityHolds: 0,
    invValue: 0,
    invValueTxt: "—",
    availability: "100%",
    notes: "Administrative only. Candidate for decommission.",
    legalEntity: "Apex Foods Ltd",
    address: "40 Bank St, London, E14 5NR",
  },
];

// ----- Network dashboard KPIs -----
const MS_NET_KPIS = [
  { k: "sites_online",   label: "Sites Online",         value: "4",        accent: "green", sub: "of 4 total",              target: "sites" },
  { k: "in_transit",     label: "Transfers In Transit", value: "3",        accent: "amber", sub: "2 overdue ETA",            target: "transfers" },
  { k: "conflicts",      label: "Replication Conflicts",value: "1",        accent: "red",   sub: "1 requires action",        target: "replication" },
  { k: "inv_value",      label: "Aggregated Inventory", value: "£2.44M",   accent: "blue",  sub: "↑ 3% vs last week",       target: "analytics", restricted: true },
  { k: "throughput",     label: "Avg Throughput (7d)",  value: "1,240 u/d",accent: "blue",  sub: "across all sites",         target: "analytics" },
];

const MS_NET_ALERTS = [
  { severity: "red",   code: "REP-CONFLICT",   text: "1 replication conflict: items PRD-0042 at FRZ-DE (unit_cost variance). Resolution required.", link: "replication" },
  { severity: "amber", code: "IST-OVERDUE",    text: "IST-0038 is overdue by 1 day. Expected arrival was Apr 20 (FRZ-UK → FRZ-DE).", link: "transfers" },
  { severity: "amber", code: "LANE-STALE",     text: "Transport lane LN-004 (WH-COLD → FRZ-DE) has not received an IST in 35 days.", link: "lanes" },
  { severity: "amber", code: "FX-MISSING",     text: "FX rate for GBP → EUR last updated 26 hours ago. Check Finance FX settings.", link: "settings" },
  { severity: "blue",  code: "SITE-ONLINE-DEG",text: "Site FRZ-OFFICE-LND is degraded (heartbeat missed). Last seen 2h ago.", link: "sites" },
];

// ----- Active ISTs feed -----
const MS_ACTIVE_ISTS = [
  { id: "IST-0042", from: "FRZ-UK", to: "FRZ-DE",  status: "in_transit", eta: "in 1d",      etaLate: false, lines: 2, qty: "240 kg" },
  { id: "IST-0041", from: "FRZ-UK", to: "WH-COLD", status: "shipped",    eta: "in 2h",      etaLate: false, lines: 4, qty: "540 kg" },
  { id: "IST-0038", from: "FRZ-UK", to: "FRZ-DE",  status: "in_transit", eta: "overdue 1d", etaLate: true,  lines: 3, qty: "180 kg" },
  { id: "IST-0037", from: "WH-COLD",to: "FRZ-DE",  status: "planned",    eta: "in 3d",      etaLate: false, lines: 2, qty: "460 kg" },
  { id: "IST-0036", from: "FRZ-DE", to: "FRZ-UK",  status: "planned",    eta: "in 4d",      etaLate: false, lines: 1, qty: "80 kg"  },
];

// ----- ISTs full list (cross-refs Planning TO-2026-00016 inter-factory) -----
const MS_ISTS = [
  {
    id: "IST-0042", from: "SITE-A", to: "SITE-B", status: "in_transit",
    shippedDate: "2026-04-20", eta: "2026-04-22", etaCls: "amber",
    lane: "LN-001", items: 2, freight: "£340", freightCcy: "GBP", carrier: "DHL", carrierRef: "DHL-789012",
    allocation: "receiver", fromMgrApproved: true, toMgrApproved: false, financeStatus: "pending",
    relatedTO: "TO-2026-00016", relatedWO: null, createdAt: "2026-04-19 08:14", createdBy: "m.krawczyk",
  },
  {
    id: "IST-0041", from: "SITE-A", to: "SITE-WH-01", status: "shipped",
    shippedDate: "2026-04-21", eta: "2026-04-21", etaCls: "amber",
    lane: "LN-003", items: 4, freight: "£120", freightCcy: "GBP", carrier: "In-house", carrierRef: null,
    allocation: "sender", fromMgrApproved: true, toMgrApproved: true, financeStatus: "pending",
    relatedTO: null, relatedWO: null, createdAt: "2026-04-20 14:02", createdBy: "m.krawczyk",
  },
  {
    id: "IST-0038", from: "SITE-A", to: "SITE-B", status: "in_transit",
    shippedDate: "2026-04-18", eta: "2026-04-20", etaCls: "red",
    lane: "LN-001", items: 3, freight: "£280", freightCcy: "GBP", carrier: "DB Schenker", carrierRef: "SCH-4421",
    allocation: "split", splitRatio: 50, fromMgrApproved: true, toMgrApproved: true, financeStatus: "pending",
    relatedTO: null, relatedWO: "WO-2026-0108", createdAt: "2026-04-16 11:00", createdBy: "m.krawczyk",
  },
  {
    id: "IST-0037", from: "SITE-WH-01", to: "SITE-B", status: "planned",
    shippedDate: null, eta: "2026-04-24", etaCls: "green",
    lane: "LN-004", items: 2, freight: "£180", freightCcy: "GBP", carrier: "DHL", carrierRef: null,
    allocation: "receiver", fromMgrApproved: true, toMgrApproved: false, financeStatus: "pending",
    relatedTO: null, relatedWO: null, createdAt: "2026-04-21 09:10", createdBy: "planner",
  },
  {
    id: "IST-0036", from: "SITE-B", to: "SITE-A", status: "planned",
    shippedDate: null, eta: "2026-04-25", etaCls: "green",
    lane: "LN-002", items: 1, freight: "£90", freightCcy: "EUR", carrier: "DHL", carrierRef: null,
    allocation: "sender", fromMgrApproved: false, toMgrApproved: false, financeStatus: "pending",
    relatedTO: null, relatedWO: null, createdAt: "2026-04-21 10:30", createdBy: "planner",
  },
  {
    id: "IST-0034", from: "SITE-A", to: "SITE-B", status: "received",
    shippedDate: "2026-04-12", eta: "2026-04-14", etaCls: "ok", actualArrival: "2026-04-14",
    lane: "LN-001", items: 5, freight: "£420", freightCcy: "GBP", carrier: "DHL", carrierRef: "DHL-773500",
    allocation: "receiver", fromMgrApproved: true, toMgrApproved: true, financeStatus: "pending",
    relatedTO: null, relatedWO: null, createdAt: "2026-04-10 10:30", createdBy: "m.krawczyk",
  },
  {
    id: "IST-0031", from: "SITE-A", to: "SITE-WH-01", status: "closed",
    shippedDate: "2026-04-05", eta: "2026-04-06", etaCls: "ok", actualArrival: "2026-04-06",
    lane: "LN-003", items: 4, freight: "£120", freightCcy: "GBP", carrier: "In-house", carrierRef: null,
    allocation: "sender", fromMgrApproved: true, toMgrApproved: true, financeStatus: "posted",
    relatedTO: null, relatedWO: null, createdAt: "2026-04-04 09:02", createdBy: "m.krawczyk", closedAt: "2026-04-08",
    je: "JE-0091",
  },
  {
    id: "IST-0028", from: "SITE-A", to: "SITE-B", status: "cancelled",
    shippedDate: null, eta: "2026-04-03", etaCls: "ok",
    lane: "LN-001", items: 2, freight: "£0", freightCcy: "GBP", carrier: null, carrierRef: null,
    allocation: "none", fromMgrApproved: false, toMgrApproved: false, financeStatus: "voided",
    relatedTO: null, relatedWO: null, createdAt: "2026-03-30 14:20", createdBy: "planner",
    cancelReason: "Demand change", cancelledBy: "j.smith", cancelledAt: "2026-04-01",
  },
];

// ----- IST Detail (IST-0042 = in_transit, cross-refs Planning TO-2026-00016) -----
const MS_IST_DETAIL = {
  id: "IST-0042",
  status: "in_transit",
  fromSite: "SITE-A", toSite: "SITE-B",
  lane: "LN-001",
  plannedShipDate: "2026-04-20",
  actualShipDate: "2026-04-20 13:22",
  eta: "2026-04-22",
  carrier: "DHL",
  carrierRef: "DHL-789012",
  freight: "£340.00",
  costAllocation: "receiver",
  fromMgrApprovedBy: "J. Smith",
  fromMgrApprovedAt: "2026-04-19 09:02",
  toMgrApprovedBy: null, toMgrApprovedAt: null,
  createdBy: "m.krawczyk", createdAt: "2026-04-19 08:14",
  notes: "Two pallets. Temperature log attached.",
  reference: "TO-2026-00016 (inter-factory)",
  items: [
    { seq: 1, code: "R-1001", name: "Wieprzowina kl. II", plannedQty: 160, shippedQty: 160, receivedQty: null, uom: "kg", lps: ["LP-4431","LP-4432"], status: "shipped" },
    { seq: 2, code: "R-2101", name: "Pieprz czarny mielony", plannedQty: 20, shippedQty: 20, receivedQty: null, uom: "kg", lps: ["LP-5582"], status: "shipped" },
  ],
  timeline: [
    { t: "2026-04-19 08:14", user: "m.krawczyk", state: "draft",      color: "gray",  desc: "IST-0042 created (draft)." },
    { t: "2026-04-19 09:02", user: "J. Smith",   state: "planned",    color: "blue",  desc: "Approved as from-site manager." },
    { t: "2026-04-20 13:22", user: "J. Nowak",   state: "shipped",    color: "amber", desc: "Shipment confirmed. 180 kg dispatched from FRZ-UK dock-01." },
    { t: "2026-04-20 13:24", user: "system",     state: "in_transit", color: "amber", desc: "Auto-advanced to in_transit (cross-site)." },
  ],
  outbound: { so: "SH-2026-00134", bol: "BOL-2026-0551", shipDate: "2026-04-20" },
  inbound:  { grn: "GRN-PENDING-0042", status: "pending", receiver: null, receivedDate: null },
};

// ----- Transport Lanes -----
const MS_LANES = [
  { id: "LN-001", from: "SITE-A",    to: "SITE-B",    carriers: ["DHL","DB Schenker"], mode: "Road",  leadDays: 2.1, costKm: "£0.42", health: "active", distanceKm: 1210, hazmat: false, coldChain: true,  customs: true,  maxWeight: 5000, active: true, notes: "EU → Non-EU requires EUR.1 or T1" },
  { id: "LN-002", from: "SITE-B",    to: "SITE-A",    carriers: ["DHL"],                mode: "Road",  leadDays: 2.3, costKm: "£0.45", health: "active", distanceKm: 1210, hazmat: false, coldChain: true,  customs: true,  maxWeight: 5000, active: true, notes: "Reverse direction of LN-001" },
  { id: "LN-003", from: "SITE-A",    to: "SITE-WH-01",carriers: ["In-house"],           mode: "Road",  leadDays: 0.3, costKm: "£0.28", health: "active", distanceKm: 210,  hazmat: false, coldChain: true,  customs: false, maxWeight: 4500, active: true, notes: "Short domestic lane" },
  { id: "LN-004", from: "SITE-WH-01",to: "SITE-B",    carriers: ["DHL"],                mode: "Road",  leadDays: 2.5, costKm: "£0.46", health: "stale",  distanceKm: 1100, hazmat: false, coldChain: true,  customs: true,  maxWeight: 5000, active: true, notes: "No IST in 35d" },
  { id: "LN-005", from: "SITE-B",    to: "SITE-WH-01",carriers: ["DB Schenker"],        mode: "Road",  leadDays: 2.7, costKm: "£0.48", health: "failed", distanceKm: 1100, hazmat: false, coldChain: true,  customs: true,  maxWeight: 5000, active: true, notes: "Last IST had customs delay" },
];

// Lane rates table (LN-001 detail)
const MS_LANE_RATES = [
  { carrier: "DHL",          type: "per km",      rate: "£0.42", currency: "GBP", from: "2026-01-01", to: "Open-ended", status: "Active",  by: "admin" },
  { carrier: "DB Schenker",  type: "per km",      rate: "£0.40", currency: "GBP", from: "2026-01-01", to: "Open-ended", status: "Active",  by: "admin" },
  { carrier: "DHL",          type: "per kg",      rate: "£1.20", currency: "GBP", from: "2026-02-15", to: "2026-05-31", status: "Active",  by: "finance" },
  { carrier: "DHL",          type: "per shipment",rate: "£160",  currency: "GBP", from: "2025-11-01", to: "2026-01-31", status: "Expired", by: "admin" },
];

// ----- Master Data Sync -----
const MS_MDS_ROWS = [
  { entity: "Item",     code: "PRD-0042", name: "Chicken Nuggets 1kg", site: "SITE-B", status: "conflict", conflicts: 2, lastSync: "—",           nextSync: "Apr 22 03:00" },
  { entity: "Item",     code: "PRD-0042", name: "Chicken Nuggets 1kg", site: "SITE-A", status: "synced",   conflicts: 0, lastSync: "2 min ago",    nextSync: "Apr 22 03:00" },
  { entity: "Item",     code: "PRD-0050", name: "Chicken Wings 2kg",   site: "SITE-B", status: "pending",  conflicts: 0, lastSync: "—",           nextSync: "pending" },
  { entity: "BOM",      code: "BOM-0042", name: "Nuggets 1kg BOM",      site: "SITE-B", status: "synced",   conflicts: 0, lastSync: "12 min ago",   nextSync: "Apr 22 03:00" },
  { entity: "BOM",      code: "BOM-0042", name: "Nuggets 1kg BOM",      site: "SITE-WH-01", status: "synced",conflicts: 0, lastSync: "12 min ago",  nextSync: "Apr 22 03:00" },
  { entity: "Allergen", code: "ALG-GLU",  name: "Gluten",               site: "SITE-B", status: "synced",   conflicts: 0, lastSync: "1h ago",       nextSync: "Apr 22 03:00" },
  { entity: "Supplier", code: "SUP-0012", name: "Agro-Fresh Ltd",       site: "SITE-B", status: "synced",   conflicts: 0, lastSync: "3h ago",       nextSync: "Apr 21 18:00" },
  { entity: "Supplier", code: "SUP-0034", name: "Premium Dairy Ltd",    site: "SITE-B", status: "conflict", conflicts: 1, lastSync: "—",            nextSync: "Apr 22 03:00" },
  { entity: "Reference",code: "REF-CUR",  name: "Currency Codes",        site: "SITE-B", status: "synced",   conflicts: 0, lastSync: "18 min ago",   nextSync: "Apr 21 15:00" },
  { entity: "Customer", code: "CUS-0091", name: "KOBE Foods Retail",     site: "SITE-B", status: "synced",   conflicts: 0, lastSync: "3h ago",       nextSync: "Apr 21 18:00" },
];

const MS_MDS_KPIS = { synced: 71, pending: 1, conflict: 3 };

// Conflict detail for modal (PRD-0042 at SITE-B)
const MS_CONFLICT_DETAIL = {
  entity: "Item",
  code: "PRD-0042",
  name: "Chicken Nuggets 1kg",
  site: "SITE-B",
  detectedAt: "2026-04-21 03:02",
  fields: [
    { key: "unit_cost",       source: "£13.10",        site: "£11.95",        type: "currency" },
    { key: "allergen_flags",  source: "Milk, Gluten",  site: "Milk",          type: "text" },
  ],
};

// ----- Replication queue -----
const MS_REP_JOBS = [
  { id: "REP-4900", entity: "Items",     site: "SITE-B", status: "completed", count: 847, success: 846, failed: 1, retries: 0, startedAt: "2026-04-21 03:00", duration: "2m 14s" },
  { id: "REP-4901", entity: "Items",     site: "SITE-A", status: "completed", count: 847, success: 847, failed: 0, retries: 0, startedAt: "2026-04-21 03:00", duration: "2m 05s" },
  { id: "REP-4902", entity: "BOMs",      site: "SITE-B", status: "running",   count: 412, success: 180, failed: 0, retries: 0, startedAt: "2026-04-21 14:42", duration: "42s (running)" },
  { id: "REP-4903", entity: "Suppliers", site: "SITE-B", status: "failed",    count: 134, success: 120, failed: 14, retries: 2, startedAt: "2026-04-21 12:00", duration: "1m 50s" },
  { id: "REP-4904", entity: "Reference", site: "SITE-WH-01", status: "pending", count: 28, success: 0, failed: 0, retries: 0, startedAt: "—",                 duration: "—" },
  { id: "REP-4905", entity: "Customers", site: "SITE-B", status: "retrying",  count: 64, success: 0, failed: 0, retries: 1, startedAt: "2026-04-21 14:51", duration: "6s (running)" },
];

const MS_REP_HISTORICAL = [
  { id: "REP-4895", entity: "Items",     site: "SITE-B",    status: "completed",    count: 847, success: 847, failed: 0, startedAt: "2026-04-20 03:00", duration: "2m 03s" },
  { id: "REP-4894", entity: "BOMs",      site: "SITE-B",    status: "completed",    count: 412, success: 412, failed: 0, startedAt: "2026-04-20 03:00", duration: "1m 45s" },
  { id: "REP-4890", entity: "Suppliers", site: "SITE-WH-01",status: "completed",    count: 134, success: 134, failed: 0, startedAt: "2026-04-20 06:00", duration: "58s" },
  { id: "REP-4880", entity: "Items",     site: "SITE-B",    status: "cancelled",    count: 847, success: 200, failed: 0, startedAt: "2026-04-19 21:30", duration: "30s (cancelled)" },
];

const MS_REP_SCHEDULE = [
  { entity: "Items",     cadence: "Nightly 03:00 UTC",  last: "2026-04-21 03:00", next: "2026-04-22 03:00", sites: "All (3 active)" },
  { entity: "BOMs",      cadence: "Nightly 03:00 UTC",  last: "2026-04-21 03:00", next: "2026-04-22 03:00", sites: "All (3 active)" },
  { entity: "Allergens", cadence: "Nightly 03:00 UTC",  last: "2026-04-21 03:00", next: "2026-04-22 03:00", sites: "All (3 active)" },
  { entity: "Suppliers", cadence: "Every 6 hours",      last: "2026-04-21 12:00", next: "2026-04-21 18:00", sites: "All (3 active)" },
  { entity: "Customers", cadence: "Every 6 hours",      last: "2026-04-21 12:00", next: "2026-04-21 18:00", sites: "All (3 active)" },
  { entity: "Reference", cadence: "Hourly",             last: "2026-04-21 14:00", next: "2026-04-21 15:00", sites: "All (3 active)" },
];

// ----- Permissions (user × site) -----
const MS_USERS = [
  { id: "u-001", name: "J. Smith",      email: "j.smith@apex.com",     avatar: "JS" },
  { id: "u-002", name: "H. Müller",     email: "h.muller@kobe.de",      avatar: "HM" },
  { id: "u-003", name: "A. Patel",      email: "a.patel@apex.com",     avatar: "AP" },
  { id: "u-004", name: "M. Krawczyk",   email: "m.krawczyk@apex.com",  avatar: "MK" },
  { id: "u-005", name: "J. Nowak",      email: "j.nowak@apex.com",     avatar: "JN" },
  { id: "u-006", name: "K. Kowal",      email: "k.kowal@apex.com",     avatar: "KK" },
  { id: "u-007", name: "QA. Wiśniewski",email: "qa.wisniewski@apex.com",avatar:"QW" },
  { id: "u-008", name: "Admin User",    email: "admin@monopilot.com",   avatar: "AU", superAdmin: true },
];

const MS_PERM_MATRIX = [
  { user: "u-001", assignments: [ { site: "SITE-A", role: "site_manager", primary: true } ] },
  { user: "u-002", assignments: [ { site: "SITE-B", role: "site_manager", primary: true } ] },
  { user: "u-003", assignments: [ { site: "SITE-WH-01", role: "site_manager", primary: true } ] },
  { user: "u-004", assignments: [ { site: "SITE-A", role: "planner", primary: true }, { site: "SITE-B", role: "planner", primary: false }, { site: "SITE-WH-01", role: "planner", primary: false } ] },
  { user: "u-005", assignments: [ { site: "SITE-A", role: "warehouse_operator", primary: true } ] },
  { user: "u-006", assignments: [ { site: "SITE-A", role: "warehouse_operator", primary: true }, { site: "SITE-WH-01", role: "warehouse_operator", primary: false } ] },
  { user: "u-007", assignments: [ { site: "SITE-A", role: "quality_manager", primary: true }, { site: "SITE-B", role: "quality_manager", primary: false } ] },
  // u-008 is super_admin — handled specially in matrix view
];

// ----- Analytics -----
const MS_INV_BALANCE = [
  { site: "SITE-A",     code: "FRZ-UK",         value: 1240000, valueTxt: "£1,240,000", pct: 53 },
  { site: "SITE-B",     code: "FRZ-DE",         value: 780000,  valueTxt: "€780,000",   pct: 33 },
  { site: "SITE-WH-01", code: "WH-COLD",        value: 420000,  valueTxt: "£420,000",   pct: 14 },
];

const MS_REBALANCE_SUGGESTIONS = [
  { from: "SITE-A", to: "SITE-B", item: "PRD-0042 · Chicken Nuggets 1kg", qty: "300 pcs", estCost: "£180" },
  { from: "SITE-A", to: "SITE-WH-01", item: "R-1501 · Mąka pszenna typ 500", qty: "500 kg", estCost: "£80" },
];

const MS_SHIPPING_COST_MONTHLY = [
  { mo: "Nov", cost: 1100 }, { mo: "Dec", cost: 1340 }, { mo: "Jan", cost: 1620 }, { mo: "Feb", cost: 1180 }, { mo: "Mar", cost: 2010 }, { mo: "Apr", cost: 1740 },
];

const MS_LANE_COST = [
  { lane: "LN-001", from: "FRZ-UK",  to: "FRZ-DE",    shipments: 14, totalFreight: "£4,680", avg: "£334", pct: 48 },
  { lane: "LN-002", from: "FRZ-DE",  to: "FRZ-UK",    shipments:  6, totalFreight: "£1,920", avg: "£320", pct: 20 },
  { lane: "LN-003", from: "FRZ-UK",  to: "WH-COLD",   shipments: 22, totalFreight: "£2,640", avg: "£120", pct: 27 },
  { lane: "LN-004", from: "WH-COLD", to: "FRZ-DE",    shipments:  2, totalFreight: "£360",   avg: "£180", pct:  4 },
  { lane: "LN-005", from: "FRZ-DE",  to: "WH-COLD",   shipments:  1, totalFreight: "£120",   avg: "£120", pct:  1 },
];

const MS_LANE_UTIL = [
  { lane: "LN-001", ists30d: 14, avgLead: "2.1d", onTime: "92%", status: "active" },
  { lane: "LN-002", ists30d:  6, avgLead: "2.3d", onTime: "88%", status: "active" },
  { lane: "LN-003", ists30d: 22, avgLead: "0.3d", onTime: "99%", status: "active" },
  { lane: "LN-004", ists30d:  1, avgLead: "2.5d", onTime: "100%",status: "stale"  },
  { lane: "LN-005", ists30d:  1, avgLead: "2.7d", onTime:   "0%",status: "failed" },
];

const MS_CONFLICT_TREND = [
  { week: "W14", count: 3 }, { week: "W15", count: 1 }, { week: "W16", count: 2 }, { week: "W17", count: 0 }, { week: "W18", count: 1 },
];

const MS_CONFLICT_BY_ENTITY = [
  { entity: "Items",     count: 5, avgResolveHrs: 4.2 },
  { entity: "BOMs",      count: 1, avgResolveHrs: 2.0 },
  { entity: "Suppliers", count: 1, avgResolveHrs: 1.5 },
  { entity: "Customers", count: 0, avgResolveHrs: "—" },
];

const MS_BENCHMARK = [
  { site: "FRZ-UK",  oee: "86%", onTime: "92%", qaPass: "98.2%", activeWOs: 9,  invValue: "£1,240,000", istsSent: 14, istsRecv:  6, cls: { oee:"ok", onTime:"ok",  qaPass:"ok" } },
  { site: "FRZ-DE",  oee: "72%", onTime: "84%", qaPass: "96.1%", activeWOs: 4,  invValue: "€780,000",   istsSent:  6, istsRecv: 14, cls: { oee:"low", onTime:"mid", qaPass:"ok" } },
  { site: "WH-COLD", oee: "—",   onTime: "99%", qaPass: "—",     activeWOs: 0,  invValue: "£420,000",   istsSent:  2, istsRecv: 22, cls: { oee:"mid", onTime:"ok",  qaPass:"mid" } },
];

// ----- Module settings -----
const MS_SETTINGS = {
  activationState: "activated",        // inactive | wizard | dual_run | activated
  conflictPolicy:  "manual",           // manual | lww | source_of_truth
  sourceOfTruthSite: null,
  tzUserLocal: true,
  siteSpecificLang: true,
  hierarchy: { depth: 3, levelNames: ["Site","Plant","Line"] },
  fxPairs: [
    { pair: "GBP ↔ EUR", status: "active", age: "4h" },
    { pair: "GBP ↔ PLN", status: "missing", age: "—" },
  ],
};

// ----- Activation wizard defaults (for re-runnable demo) -----
const MS_ACT_SITES_DRAFT = [
  { code: "FRZ-DE", name: "KOBE Germany", type: "copack",    country: "Germany",        tz: "Europe/Berlin", isDefault: false },
  { code: "WH-COLD",name: "Cold Storage — Harlow", type: "warehouse", country: "United Kingdom", tz: "Europe/London", isDefault: false },
];

const MS_ACT_BACKFILL = [
  { table: "work_orders",     rows: 1243, target: "FRZ-DEFAULT" },
  { table: "license_plates",  rows: 4827, target: "FRZ-DEFAULT" },
  { table: "stock_movements", rows: 8901, target: "FRZ-DEFAULT" },
  { table: "grns",            rows:  642, target: "FRZ-DEFAULT" },
  { table: "transfer_orders", rows:  198, target: "FRZ-DEFAULT" },
  { table: "quality_checks",  rows: 3412, target: "FRZ-DEFAULT" },
  { table: "shifts",          rows:  140, target: "FRZ-DEFAULT" },
  { table: "maintenance_logs",rows:  228, target: "FRZ-DEFAULT" },
  { table: "finance_layers",  rows:  456, target: "FRZ-DEFAULT" },
];

// ----- Replication L1→L2→L3 promotion admin -----
const MS_ENV_LADDER = [
  { level: "L1", name: "Organization Baseline",  active: true,  stats: "1 org · 3 active sites · 71 entities synced" },
  { level: "L2", name: "Site-level Overrides",   active: false, stats: "SITE-B: 4 overrides · SITE-WH-01: 2 overrides" },
  { level: "L3", name: "Line-level Overrides",   active: false, stats: "No L3 overrides configured" },
];

const MS_PROMOTIONS = [
  { t: "2026-04-19 10:02", level: "L1→L2", entity: "fefo_strategy", site: "SITE-B", user: "admin", status: "applied", oldV: "fefo_advisory", newV: "fefo_strict" },
  { t: "2026-04-15 14:20", level: "L1→L2", entity: "quality_check_frequency", site: "SITE-B", user: "admin", status: "applied", oldV: "hourly", newV: "per-batch" },
  { t: "2026-04-12 09:14", level: "L1→L2", entity: "language", site: "SITE-B", user: "admin", status: "applied", oldV: "en", newV: "de" },
  { t: "2026-04-10 11:02", level: "L1→L2", entity: "shift_pattern", site: "SITE-WH-01", user: "admin", status: "applied", oldV: "3x8", newV: "2x12" },
];

// ----- L2 site config overrides (Config tab, SITE-B as subject) -----
const MS_SITE_CONFIG = [
  { key: "fefo_strategy",            baseValue: "fefo_advisory", siteValue: "fefo_strict", source: "l2", updated: "2d ago", by: "admin" },
  { key: "default_currency",         baseValue: "GBP",           siteValue: "EUR",         source: "l2", updated: "5d ago", by: "admin" },
  { key: "language",                 baseValue: "en",            siteValue: "de",          source: "l2", updated: "7d ago", by: "admin" },
  { key: "quality_check_frequency",  baseValue: "hourly",        siteValue: "per-batch",   source: "l2", updated: "4d ago", by: "h.muller" },
  { key: "shift_pattern",            baseValue: "3x8",           siteValue: null,          source: "base",updated: "—",      by: "—" },
  { key: "expiry_amber_threshold",   baseValue: "30",            siteValue: null,          source: "base",updated: "—",      by: "—" },
  { key: "expiry_red_threshold",     baseValue: "7",             siteValue: null,          source: "base",updated: "—",      by: "—" },
];

// ----- Site holidays calendar (SITE-B) -----
const MS_HOLIDAYS_SITE_B = [
  { date: "2026-05-01", name: "Tag der Arbeit",        type: "public" },
  { date: "2026-05-14", name: "Christi Himmelfahrt",  type: "public" },
  { date: "2026-05-25", name: "Pfingstmontag",         type: "public" },
  { date: "2026-06-12", name: "Company Picnic",        type: "company" },
];

// ----- Site docs (SITE-B) -----
const MS_SITE_DOCS_B = [
  { name: "ISO22000-2026.pdf", type: "Certificate", by: "h.muller", at: "2026-03-14" },
  { name: "FactoryB-Floorplan.pdf", type: "Floorplan", by: "h.muller", at: "2026-02-22" },
  { name: "IFS-Food-2026.pdf",  type: "Compliance", by: "qa.wisniewski", at: "2026-03-01" },
];

Object.assign(window, {
  MS_NAV, MS_SITES,
  MS_NET_KPIS, MS_NET_ALERTS, MS_ACTIVE_ISTS,
  MS_ISTS, MS_IST_DETAIL,
  MS_LANES, MS_LANE_RATES,
  MS_MDS_ROWS, MS_MDS_KPIS, MS_CONFLICT_DETAIL,
  MS_REP_JOBS, MS_REP_HISTORICAL, MS_REP_SCHEDULE,
  MS_USERS, MS_PERM_MATRIX,
  MS_INV_BALANCE, MS_REBALANCE_SUGGESTIONS,
  MS_SHIPPING_COST_MONTHLY, MS_LANE_COST, MS_LANE_UTIL,
  MS_CONFLICT_TREND, MS_CONFLICT_BY_ENTITY, MS_BENCHMARK,
  MS_SETTINGS,
  MS_ACT_SITES_DRAFT, MS_ACT_BACKFILL,
  MS_ENV_LADDER, MS_PROMOTIONS,
  MS_SITE_CONFIG, MS_HOLIDAYS_SITE_B, MS_SITE_DOCS_B,
});
