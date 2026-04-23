// ============ Warehouse module — mock data ============
// Cross-refs to Planning (WO-2026-0108 etc) integrated via reservations / hard-locks.

const WH_NAV = [
  { group: "Operations", items: [
    { key: "dashboard", label: "Dashboard", ic: "◆", hero: true },
    { key: "lps",       label: "License Plates", ic: "▥", count: "142" },
    { key: "inventory", label: "Inventory browser", ic: "▦" },
    { key: "grn",       label: "Goods receipts", ic: "⇪", count: "8" },
  ]},
  { group: "Stock movement", items: [
    { key: "movements", label: "Stock movements", ic: "⇌" },
    { key: "reservations", label: "Reservations", ic: "🔒", count: "4" },
  ]},
  { group: "Facility", items: [
    { key: "locations", label: "Locations", ic: "▤" },
    { key: "genealogy", label: "Genealogy", ic: "⊶" },
    { key: "expiry",    label: "Expiry", ic: "⏰", count: "12" },
  ]},
  { group: "Admin", items: [
    { key: "settings",  label: "Warehouse settings", ic: "⚙" },
    { key: "gallery",   label: "Modal gallery", ic: "▣" },
  ]},
];

// ----- Dashboard KPIs (WH-001) -----
const WH_KPIS = [
  { k: "active_lps",       label: "Active LPs",           value: "1,247", accent: "blue",  sub: "vs yesterday: +4",         target: "lps" },
  { k: "unique_skus",      label: "Unique SKUs",          value: "83",    accent: "blue",  sub: "In active LPs",            target: "inventory" },
  { k: "inv_value",        label: "Inventory value",      value: "£48,320", accent: "green", sub: "Manager/Admin only",    target: "inventory", restricted: true },
  { k: "expiring_7d",      label: "Expiring ≤7d",         value: "12",    accent: "red",   sub: "Red threshold",           target: "expiry" },
  { k: "expiring_30d",     label: "Expiring ≤30d",        value: "47",    accent: "amber", sub: "Amber threshold",         target: "expiry" },
  { k: "qc_hold",          label: "QC hold",              value: "8",     accent: "amber", sub: "PENDING + HOLD",          target: "lps" },
  { k: "blocked",          label: "Blocked LPs",          value: "3",     accent: "red",   sub: "2 expired use_by",        target: "lps" },
  { k: "intermediate_buf", label: "Intermediate buffer", value: "21",    accent: "blue",  sub: "Awaiting consumption",    target: "int_buffer" },
];

// ----- Dashboard alerts (WH-001) -----
const WH_ALERTS = [
  { severity: "red",   code: "EXP-AUTOBLOCK", text: "2 LP(s) auto-blocked by use_by expiry cron today.", link: "expiry" },
  { severity: "amber", code: "QC-HOLD-48H",   text: "3 LP(s) have been on QC Hold for more than 48 hours.", link: "lps" },
  { severity: "amber", code: "LOW-STOCK",     text: "Product R-1001 Wieprzowina kl. II: 280 kg remaining (threshold 400 kg).", link: "inventory" },
  { severity: "blue",  code: "SCANNER-LOCK",  text: "LP00000182 locked by K.Kowal for 7 minutes at Zone-Cold-B3.", link: "lps", cta: "Force release" },
  { severity: "amber", code: "FEFO-RATE",     text: "FEFO override rate is 11.3% in the last 7 days (target < 5%).", link: "movements" },
  { severity: "blue",  code: "D365-DRIFT",    text: "1 D365 sync conflict requires admin review — PO-2026-00046 Premium Dairy Ltd.", link: "settings" },
];

const WH_EXPIRY_TOP5 = [
  { lp: "LP00000007", product: "R-1002 · Słonina wieprzowa",       batch: "B-2026-02-01", exp: "2026-04-15", loc: "Cold › B2", status: "blocked", days: -6 },
  { lp: "LP00000031", product: "R-3001 · Osłonka Ø26 (Viscofan)",   batch: "B-2026-03-20", exp: "2026-04-22", loc: "Dry › A4",  status: "available", days: 1 },
  { lp: "LP00000044", product: "R-1501 · Mąka pszenna typ 500",     batch: "B-2026-04-10", exp: "2026-04-23", loc: "Dry › A2",  status: "available", days: 2 },
  { lp: "LP00000048", product: "R-1601 · Jaja kurze (żółtka)",      batch: "B-2026-04-02", exp: "2026-04-24", loc: "Cold › B1", status: "available", days: 3 },
  { lp: "LP00000052", product: "R-1201 · Filet z kurczaka",         batch: "B-2026-04-14", exp: "2026-04-26", loc: "Cold › C3", status: "reserved", days: 5 },
];

// ----- Activity feed (WH-001) -----
const WH_ACTIVITY = [
  { t: "1 min ago",  color: "green", lp: "LP00000221", desc: "GRN-2026-0042 received — 4 new LPs", sub: "PO-2026-00041 · Agro-Fresh Ltd. · 4 rows" },
  { t: "6 min ago",  color: "red",   lp: "LP-4431",    desc: "Consumed to WO-2026-0108",            sub: "−220.5 kg · Line-1 › Buffer · FEFO compliant" },
  { t: "12 min ago", color: "blue",  lp: "LP00000210", desc: "Moved Zone-Cold-B3 → Line-2-Buffer",  sub: "Putaway · by J.Nowak" },
  { t: "17 min ago", color: "amber", lp: "LP00000045", desc: "Split into 2 LPs",                    sub: "200 BOX → 60 + 140 (children LP00000225, LP00000226)" },
  { t: "22 min ago", color: "green", lp: "LP00000228", desc: "Output from WO-2026-0100",            sub: "Pasztet drob. 180g · 212 kg · PASSED · Line-3-Buffer" },
  { t: "28 min ago", color: "red",   lp: "LP00000007", desc: "Auto-blocked (use_by expired)",       sub: "Expiry cron · expiry 2026-04-15 · 6 days ago" },
  { t: "35 min ago", color: "amber", lp: "LP00000133", desc: "FEFO override recorded",              sub: "Reason: physical_accessibility · +34 days later than rank #1" },
  { t: "42 min ago", color: "blue",  lp: "LP00000140", desc: "Reserved for WO-2026-0111",           sub: "Hard lock · 480 kg Wołowina gulaszowa" },
  { t: "51 min ago", color: "amber", lp: "LP00000122", desc: "QA status FAILED → HOLD",             sub: "Reason: pending_lab_results · by QA.Wiśniewski" },
  { t: "1 h ago",    color: "red",   lp: "LP00000101", desc: "Destroyed (scrap)",                   sub: "Reason: damage · 24 BOX · by J.Nowak" },
];

// ----- License Plates list (WH-002) -----
const WH_LPS = [
  // PLANNING HARD-LOCK CROSS-REFS — WO-2026-0108 locked LPs
  { lp: "LP-4431",     product: "R-1001",   productName: "Wieprzowina kl. II",       itemType: "raw_material", qty: 220.5, uom: "kg", batch: "B-2026-04-02", expiry: "2026-05-02", status: "reserved", qa: "PASSED", loc: ["WH-Factory-A","Cold","B3"], strategy: "fefo", reservedWo: "WO-2026-0108", reservedQty: 220.5, lastMove: "2h ago", source: "grn", grnRef: "GRN-2026-00038" },
  { lp: "LP-4432",     product: "R-1001",   productName: "Wieprzowina kl. II",       itemType: "raw_material", qty: 137.5, uom: "kg", batch: "B-2026-04-02", expiry: "2026-05-02", status: "reserved", qa: "PASSED", loc: ["WH-Factory-A","Cold","B3"], strategy: "fefo", reservedWo: "WO-2026-0108", reservedQty: 137.5, lastMove: "2h ago", source: "grn", grnRef: "GRN-2026-00038" },
  { lp: "LP-4470",     product: "R-1002",   productName: "Słonina wieprzowa",        itemType: "raw_material", qty: 200.0, uom: "kg", batch: "B-2026-04-05", expiry: "2026-05-10", status: "reserved", qa: "PASSED", loc: ["WH-Factory-A","Cold","B2"], strategy: "fefo", reservedWo: "WO-2026-0108", reservedQty: 148.0, lastMove: "2h ago", source: "grn", grnRef: "GRN-2026-00039" },
  { lp: "LP-5582",     product: "R-2101",   productName: "Pieprz czarny mielony",    itemType: "raw_material", qty: 25.0,  uom: "kg", batch: "B-2026-02-18", expiry: "2027-02-18", status: "reserved", qa: "PASSED", loc: ["WH-Factory-A","Dry","A5"], strategy: "fifo", reservedWo: "WO-2026-0108", reservedQty: 4.2, lastMove: "2h ago", source: "grn", grnRef: "GRN-2026-00028" },
  // WO-2026-0111 reservation
  { lp: "LP-4850",     product: "R-1101",   productName: "Wołowina gulaszowa",       itemType: "raw_material", qty: 480.0, uom: "kg", batch: "B-2026-04-12", expiry: "2026-05-20", status: "reserved", qa: "PASSED", loc: ["WH-Factory-A","Cold","B1"], strategy: "fefo", reservedWo: "WO-2026-0111", reservedQty: 480.0, lastMove: "42min ago", source: "grn", grnRef: "GRN-2026-00041" },
  // raw materials — plain available
  { lp: "LP00000044",  product: "R-1501",   productName: "Mąka pszenna typ 500",     itemType: "raw_material", qty: 180.0, uom: "kg", batch: "B-2026-04-10", expiry: "2026-04-23", status: "available", qa: "PASSED", loc: ["WH-Factory-A","Dry","A2"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "1d ago", source: "grn", grnRef: "GRN-2026-00040" },
  { lp: "LP00000048",  product: "R-1601",   productName: "Jaja kurze (żółtka)",      itemType: "raw_material", qty: 60.0,  uom: "kg", batch: "B-2026-04-02", expiry: "2026-04-24", status: "available", qa: "PASSED", loc: ["WH-Factory-A","Cold","B1"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "5h ago", source: "grn", grnRef: "GRN-2026-00037" },
  { lp: "LP00000031",  product: "R-3001",   productName: "Osłonka Ø26 (Viscofan)",   itemType: "raw_material", qty: 800.0, uom: "m",  batch: "B-2026-03-20", expiry: "2026-04-22", status: "available", qa: "PASSED", loc: ["WH-Factory-A","Dry","A4"], strategy: "fifo", reservedWo: null, reservedQty: 0, lastMove: "3d ago", source: "grn", grnRef: "GRN-2026-00032" },
  { lp: "LP00000052",  product: "R-1201",   productName: "Filet z kurczaka",          itemType: "raw_material", qty: 120.0, uom: "kg", batch: "B-2026-04-14", expiry: "2026-04-26", status: "reserved", qa: "PASSED", loc: ["WH-Factory-A","Cold","C3"], strategy: "fefo", reservedWo: "WO-2026-0115", reservedQty: 120.0, lastMove: "6h ago", source: "grn", grnRef: "GRN-2026-00042" },
  // expired
  { lp: "LP00000007",  product: "R-1002",   productName: "Słonina wieprzowa",        itemType: "raw_material", qty: 60.0,  uom: "kg", batch: "B-2026-02-01", expiry: "2026-04-15", status: "blocked", qa: "QUARANTINED", loc: ["WH-Factory-A","Cold","B2"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "28min ago", source: "grn", grnRef: "GRN-2026-00021", blockedReason: "use_by expired", shelfLifeMode: "use_by" },
  { lp: "LP00000012",  product: "R-1004",   productName: "Masło śmietankowe",        itemType: "raw_material", qty: 24.0,  uom: "kg", batch: "B-2026-03-20", expiry: "2026-04-20", status: "available", qa: "PASSED", loc: ["WH-Factory-A","Cold","B2"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "18h ago", source: "grn", grnRef: "GRN-2026-00034", shelfLifeMode: "best_before" },
  // intermediate buffer
  { lp: "LP00000214",  product: "IN1301",   productName: "[INT] Farsz pierogowy mieszany 20kg", itemType: "intermediate", qty: 420.0, uom: "kg", batch: "WO-2026-0114-B1", expiry: "2026-04-24", status: "available", qa: "PASSED", loc: ["WH-Factory-A","Production","Line-4-Buffer"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "22min ago", source: "wo_output", woRef: "WO-2026-0114" },
  { lp: "LP00000215",  product: "IN1302",   productName: "[INT] Gotowe ciasto pierogowe 15kg",   itemType: "intermediate", qty: 180.0, uom: "kg", batch: "WO-2026-0116-B1", expiry: "2026-04-23", status: "available", qa: "PASSED", loc: ["WH-Factory-A","Production","Line-4-Buffer"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "1h ago", source: "wo_output", woRef: "WO-2026-0116" },
  { lp: "LP00000228",  product: "FA5200",   productName: "Pasztet drobiowy z żurawiną 180g",     itemType: "finished_article", qty: 212.0, uom: "kg", batch: "WO-2026-0100-B1", expiry: "2026-06-18", status: "available", qa: "PASSED", loc: ["WH-Factory-A","Dispatch","FG-01"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "22min ago", source: "wo_output", woRef: "WO-2026-0100" },
  // QC hold
  { lp: "LP00000122",  product: "R-1501",   productName: "Mąka pszenna typ 500",     itemType: "raw_material", qty: 200.0, uom: "kg", batch: "B-2026-04-08", expiry: "2026-10-08", status: "available", qa: "HOLD", loc: ["WH-Factory-A","Dry","A2"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "51min ago", source: "grn", grnRef: "GRN-2026-00036", holdReason: "pending_lab_results", holdAge: "52h" },
  { lp: "LP00000123",  product: "R-1101",   productName: "Wołowina gulaszowa",       itemType: "raw_material", qty: 360.0, uom: "kg", batch: "B-2026-04-13", expiry: "2026-05-22", status: "available", qa: "PENDING", loc: ["WH-Factory-A","Cold","Receiving"], strategy: "fefo", reservedWo: null, reservedQty: 0, lastMove: "3h ago", source: "grn", grnRef: "GRN-2026-00041", holdAge: "3h" },
  // partial reservation
  { lp: "LP00000099",  product: "R-2101",   productName: "Pieprz czarny mielony",    itemType: "raw_material", qty: 100.0, uom: "kg", batch: "B-2026-02-18", expiry: "2027-02-18", status: "reserved", qa: "PASSED", loc: ["WH-Factory-A","Dry","A5"], strategy: "fifo", reservedWo: "WO-2026-0109", reservedQty: 70.0, lastMove: "4h ago", source: "grn", grnRef: "GRN-2026-00028" },
];

// ----- LP Detail subject (WH-003) — LP-4431 (Planning hard-lock) -----
const WH_LP_DETAIL = {
  lp: "LP-4431",
  product: { code: "R-1001", name: "Wieprzowina kl. II" },
  itemType: "raw_material",
  qty: 220.5,
  uom: "kg",
  reservedQty: 220.5,
  availableQty: 0,
  reservedWo: "WO-2026-0108",
  batch: "B-2026-04-02",
  supplierBatch: "SUP-AGRO-4712",
  expiry: "2026-05-02",
  expiryDays: 11,
  shelfLifeMode: "use_by",
  mfg: "2026-04-02",
  dateCode: "2614",
  gtin: "05012345678901",
  loc: ["WH-Factory-A","Cold","B3"],
  warehouse: "WH-Factory-A",
  status: "reserved",
  qa: "PASSED",
  source: "grn",
  grnRef: "GRN-2026-00038",
  parentLp: null,
  lockedBy: null,
  createdAt: "2026-04-02 09:14",
  createdBy: "J.Nowak",
  lastUpdated: "2h ago",
  allowedActions: ["split","print","move","qa"],
  extFields: [
    { k: "Storage Temperature Zone",  v: "Cold 0-4°C" },
    { k: "Halal Batch Indicator",     v: "No" },
    { k: "Supplier Cert Ref",         v: "EU-AGR-0012-Q1-2026" },
  ],
  notes: "Pallet label intact on receipt. Temperature check: 3.2°C at receiving.",

  movements: [
    { t: "2026-04-21 06:02", type: "issue",    fromLoc: ["WH-Factory-A","Cold","B3"], toLoc: ["WH-Factory-A","Production","Line-1-Buffer"], qty: -60,   reason: "consume_to_wo", ref: "WO-2026-0108", user: "M.Kowalski" },
    { t: "2026-04-21 05:58", type: "receipt",  fromLoc: null, toLoc: ["WH-Factory-A","Cold","B3"], qty: 220.5, reason: null, ref: "GRN-2026-00038", user: "J.Nowak" },
  ],
  moveType: "partial_consume",

  genealogy: {
    upstream: [
      { level: 1, lp: null, op: "receipt",   label: "GRN-2026-00038 from PO-2026-00036", product: "R-1001", date: "2026-04-02 09:14", ref: "GRN-2026-00038", fefo: null },
    ],
    downstream: [
      { level: 1, lp: "WO-2026-0108 output", op: "consume", label: "Consumed by WO-2026-0108 Kiełbasa śląska", product: "FA5100", date: "2026-04-21 06:02", ref: "WO-2026-0108", fefo: "ok" },
    ],
  },

  reservations: [
    { wo: "WO-2026-0108", qty: 220.5, type: "hard_lock", reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active", releasedAt: null, releaseReason: null },
  ],

  stateHistory: [
    { from: null,        to: "available", t: "2026-04-02 09:14", user: "J.Nowak",     reason: "grn_receipt" },
    { from: "available", to: "reserved",  t: "2026-04-21 05:58", user: "m.krawczyk",  reason: "wo_release_hard_lock" },
  ],

  qaHistory: [
    { from: "PENDING", to: "PASSED", t: "2026-04-02 14:22", user: "QA.Wiśniewski", reason: "visual_inspection_passed" },
  ],

  labels: [
    { t: "2026-04-02 09:16", template: "Standard 4×6", printer: "ZPL-WH-01", copies: 1, user: "system (auto)", status: "success" },
    { t: "2026-04-02 11:30", template: "Standard 4×6", printer: "ZPL-WH-01", copies: 1, user: "J.Nowak", status: "success" },
  ],

  audit: [
    { t: "2026-04-21 05:58", field: "status",       old: "available", newv: "reserved",  user: "system", src: "api"     },
    { t: "2026-04-21 05:58", field: "reserved_for_wo_id", old: null,  newv: "WO-2026-0108", user: "m.krawczyk", src: "api" },
    { t: "2026-04-02 14:22", field: "qa_status",    old: "PENDING",   newv: "PASSED",    user: "QA.Wiśniewski", src: "api" },
    { t: "2026-04-02 09:14", field: "status",       old: null,        newv: "available", user: "J.Nowak", src: "api"    },
  ],
};

// ----- GRN List (WH-010) -----
const WH_GRNS = [
  { id: "GRN-2026-00042", srcType: "po", srcDoc: "PO-2026-00041", supplier: "Agro-Fresh Ltd.", receiptDate: "2026-04-21", warehouse: "WH-Factory-A", status: "completed", lines: 4, totalQty: "640 kg", receivedBy: "J.Nowak" },
  { id: "GRN-2026-00041", srcType: "po", srcDoc: "PO-2026-00036", supplier: "Baltic Pork Co.", receiptDate: "2026-04-20", warehouse: "WH-Factory-A", status: "completed", lines: 2, totalQty: "840 kg", receivedBy: "J.Nowak" },
  { id: "GRN-2026-00040", srcType: "po", srcDoc: "PO-2026-00034", supplier: "Spice Masters",   receiptDate: "2026-04-20", warehouse: "WH-Factory-A", status: "completed", lines: 3, totalQty: "180 kg", receivedBy: "M.Kowalski" },
  { id: "GRN-2026-00039", srcType: "to", srcDoc: "TO-2026-00013", supplier: "WH-Factory-B",    receiptDate: "2026-04-19", warehouse: "WH-Factory-A", status: "completed", lines: 6, totalQty: "920 kg", receivedBy: "K.Kowal" },
  { id: "GRN-2026-00038", srcType: "po", srcDoc: "PO-2026-00030", supplier: "Agro-Fresh Ltd.", receiptDate: "2026-04-19", warehouse: "WH-Factory-A", status: "completed", lines: 4, totalQty: "358 kg", receivedBy: "J.Nowak" },
  { id: "GRN-2026-00037", srcType: "po", srcDoc: "PO-2026-00031", supplier: "Hellmann Logistics", receiptDate: "2026-04-18", warehouse: "WH-Factory-A", status: "completed", lines: 2, totalQty: "120 kg", receivedBy: "J.Nowak" },
  { id: "GRN-2026-00043", srcType: "po", srcDoc: "PO-2026-00042", supplier: "Baltic Pork Co.",  receiptDate: "2026-04-21", warehouse: "WH-Factory-A", status: "draft",     lines: 2, totalQty: "— kg",  receivedBy: "M.Kowalski" },
  { id: "GRN-2026-00035", srcType: "po", srcDoc: "PO-2026-00026", supplier: "Premium Dairy Ltd.", receiptDate: "2026-04-15", warehouse: "WH-Factory-A", status: "completed", lines: 3, totalQty: "240 kg", receivedBy: "J.Nowak" },
  { id: "GRN-2026-00033", srcType: "po", srcDoc: "PO-2026-00024", supplier: "Baltic Pork Co.",  receiptDate: "2026-04-14", warehouse: "WH-Factory-A", status: "completed", lines: 2, totalQty: "600 kg", receivedBy: "K.Kowal" },
  { id: "GRN-2026-00030", srcType: "to", srcDoc: "TO-2026-00011", supplier: "WH-Cold-01",       receiptDate: "2026-04-12", warehouse: "WH-Factory-A", status: "cancelled", lines: 0, totalQty: "—",     receivedBy: "J.Nowak" },
];

// ----- GRN detail subject (GRN-2026-00042 — fresh receipt, 4 LPs, 2 PO lines split multi-LP) -----
const WH_GRN_DETAIL = {
  id: "GRN-2026-00042",
  status: "completed",
  srcType: "po",
  srcDoc: "PO-2026-00041",
  supplier: "Agro-Fresh Ltd.",
  supplierCode: "SUP-0012",
  receiptDate: "2026-04-21 08:42",
  warehouse: "WH-Factory-A",
  defaultLoc: ["WH-Factory-A","Receiving","Dock-01"],
  notes: "Two batches arrived on separate pallets. Temperature at receiving: 2.8°C.",
  receivedBy: "J.Nowak",
  items: [
    { line: 1, product: "R-1001 · Wieprzowina kl. II",  lp: "LP00000221", qty: 160, uom: "kg", batch: "B-2026-04-20", supplierBatch: "SUP-AGRO-4820", expiry: "2026-05-20", loc: ["WH-Factory-A","Cold","B3"], qa: "PENDING", cw: 160.0 },
    { line: 1, product: "R-1001 · Wieprzowina kl. II",  lp: "LP00000222", qty: 240, uom: "kg", batch: "B-2026-04-21", supplierBatch: "SUP-AGRO-4821", expiry: "2026-05-21", loc: ["WH-Factory-A","Cold","B3"], qa: "PENDING", cw: 239.4 },
    { line: 2, product: "R-2101 · Pieprz czarny mielony", lp: "LP00000223", qty: 20, uom: "kg", batch: "B-2026-04-15", supplierBatch: "SUP-AGRO-S20", expiry: "2027-04-15", loc: ["WH-Factory-A","Dry","A5"], qa: "PASSED", cw: null },
    { line: 3, product: "R-1301 · Cebula drobna",          lp: "LP00000224", qty: 220, uom: "kg", batch: "B-2026-04-19", supplierBatch: "SUP-AGRO-ON19", expiry: "2026-05-19", loc: ["WH-Factory-A","Dry","A8"], qa: "PASSED", cw: null },
  ],
  statusHistory: [
    { t: "2026-04-21 08:15", from: null,     to: "draft",     user: "J.Nowak", action: "create" },
    { t: "2026-04-21 08:42", from: "draft",  to: "completed", user: "J.Nowak", action: "complete", notes: "4 LPs created, labels printed." },
  ],
};

// POs available for GRN (WH-004 Step 1)
const WH_POS_RECEIVING = [
  { id: "PO-2026-00042", supplier: "Baltic Pork Co.",  due: "2026-04-23", lines: 2, progress: 0,  status: "confirmed", rel: "In 2 days" },
  { id: "PO-2026-00041", supplier: "Agro-Fresh Ltd.", due: "2026-04-22", lines: 4, progress: 100, status: "receiving", rel: "Tomorrow" },
  { id: "PO-2026-00031", supplier: "Hellmann Logistics", due: "2026-04-19", lines: 2, progress: 60, status: "receiving", rel: "2 days ago", overdue: 2 },
  { id: "PO-2026-00037", supplier: "Viscofan S.A.",    due: "2026-04-20", lines: 2, progress: 0,  status: "confirmed", rel: "Yesterday", overdue: 1 },
  { id: "PO-2026-00043", supplier: "Spice Masters",    due: "2026-04-24", lines: 8, progress: 0,  status: "confirmed", rel: "In 3 days" },
  { id: "PO-2026-00044", supplier: "Viscofan S.A.",    due: "2026-04-25", lines: 1, progress: 0,  status: "confirmed", rel: "In 4 days" },
];

// ----- Stock Movements (WH-006) -----
const WH_MOVEMENTS = [
  { id: "SM-2026-00318", t: "2026-04-21 14:35", type: "consume_to_wo", lp: "LP-4431",    product: "R-1001", qty: -60,  uom: "kg", fromLoc: ["WH-Factory-A","Cold","B3"], toLoc: ["WH-Factory-A","Production","Line-1-Buffer"], reason: null,              ref: "WO-2026-0108", user: "M.Kowalski" },
  { id: "SM-2026-00317", t: "2026-04-21 14:02", type: "transfer",      lp: "LP00000214", product: "IN1301", qty: 120, uom: "kg", fromLoc: ["WH-Factory-A","Production","Line-4-Buffer"], toLoc: ["WH-Factory-A","Production","Line-4-Consume"], reason: null, ref: "WO-2026-0113", user: "K.Kowal" },
  { id: "SM-2026-00316", t: "2026-04-21 13:22", type: "putaway",       lp: "LP00000221", product: "R-1001", qty: 160, uom: "kg", fromLoc: ["WH-Factory-A","Receiving","Dock-01"], toLoc: ["WH-Factory-A","Cold","B3"], reason: null, ref: "GRN-2026-00042", user: "J.Nowak" },
  { id: "SM-2026-00315", t: "2026-04-21 12:10", type: "adjustment",    lp: "LP00000045", product: "R-1001", qty: -2.0, uom: "kg", fromLoc: ["WH-Factory-A","Cold","B3"], toLoc: null, reason: "damage", ref: "CC-2026-014", user: "WH.Manager" },
  { id: "SM-2026-00314", t: "2026-04-21 11:48", type: "receipt",       lp: "LP00000221", product: "R-1001", qty: 160, uom: "kg", fromLoc: null, toLoc: ["WH-Factory-A","Receiving","Dock-01"], reason: null, ref: "GRN-2026-00042", user: "J.Nowak" },
  { id: "SM-2026-00313", t: "2026-04-21 11:00", type: "quarantine",    lp: "LP00000122", product: "R-1501", qty: 0,    uom: "kg", fromLoc: ["WH-Factory-A","Dry","A2"], toLoc: ["WH-Factory-A","QA-Hold","Q-01"], reason: "qa_fail", ref: "QA-2026-0042", user: "QA.Wiśniewski" },
  { id: "SM-2026-00312", t: "2026-04-21 10:38", type: "consume_to_wo", lp: "LP-4470",    product: "R-1002", qty: -148, uom: "kg", fromLoc: ["WH-Factory-A","Cold","B2"], toLoc: ["WH-Factory-A","Production","Line-1-Buffer"], reason: null, ref: "WO-2026-0108", user: "M.Kowalski" },
  { id: "SM-2026-00311", t: "2026-04-21 09:55", type: "transfer",      lp: "LP00000215", product: "IN1302", qty: 180, uom: "kg", fromLoc: ["WH-Factory-A","Production","Line-4-Buffer"], toLoc: ["WH-Factory-A","Dry","A2"], reason: null, ref: null, user: "K.Kowal" },
  { id: "SM-2026-00310", t: "2026-04-21 09:40", type: "receipt",       lp: "LP00000228", product: "FA5200", qty: 212, uom: "kg", fromLoc: null, toLoc: ["WH-Factory-A","Production","Line-3-Buffer"], reason: null, ref: "WO-2026-0100", user: "system" },
  { id: "SM-2026-00309", t: "2026-04-21 09:02", type: "adjustment",    lp: "LP00000007", product: "R-1002", qty: -60, uom: "kg", fromLoc: ["WH-Factory-A","Cold","B2"], toLoc: null, reason: "expired", ref: "auto_block_cron", user: "system" },
  { id: "SM-2026-00308", t: "2026-04-21 06:02", type: "consume_to_wo", lp: "LP-4431",    product: "R-1001", qty: -60, uom: "kg", fromLoc: ["WH-Factory-A","Cold","B3"], toLoc: ["WH-Factory-A","Production","Line-1-Buffer"], reason: null, ref: "WO-2026-0108", user: "M.Kowalski" },
  { id: "SM-2026-00307", t: "2026-04-21 05:58", type: "transfer",      lp: "LP-4431",    product: "R-1001", qty: 0,   uom: "kg", fromLoc: ["WH-Factory-A","Cold","B3"], toLoc: ["WH-Factory-A","Cold","B3"], reason: "reservation_created", ref: "WO-2026-0108", user: "m.krawczyk" },
  { id: "SM-2026-00306", t: "2026-04-20 17:14", type: "return",        lp: "LP00000099", product: "R-2101", qty: 2,   uom: "kg", fromLoc: ["WH-Factory-A","Production","Line-1-Buffer"], toLoc: ["WH-Factory-A","Dry","A5"], reason: "production_return", ref: "WO-2026-0100", user: "M.Kowalski" },
  { id: "SM-2026-00305", t: "2026-04-20 16:48", type: "adjustment",    lp: "LP00000048", product: "R-1601", qty: -4.0, uom: "kg", fromLoc: ["WH-Factory-A","Cold","B1"], toLoc: null, reason: "counting_error", ref: "CC-2026-013", user: "WH.Manager", deltaPct: 6.7 },
];

// ----- Reservations (WH-017 / WH-RES-003) -----
const WH_RESERVATIONS = [
  { wo: "WO-2026-0108", woProduct: "FA5100 · Kiełbasa śląska pieczona 450g", material: "R-1001 · Wieprzowina kl. II", matLine: 1, lp: "LP-4431", reservedQty: 220.5, lpQty: 220.5, expiry: "2026-05-02", loc: ["WH-Factory-A","Cold","B3"], reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active",   releasedAt: null,               releaseReason: null },
  { wo: "WO-2026-0108", woProduct: "FA5100 · Kiełbasa śląska pieczona 450g", material: "R-1001 · Wieprzowina kl. II", matLine: 1, lp: "LP-4432", reservedQty: 137.5, lpQty: 137.5, expiry: "2026-05-02", loc: ["WH-Factory-A","Cold","B3"], reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active",   releasedAt: null,               releaseReason: null },
  { wo: "WO-2026-0108", woProduct: "FA5100 · Kiełbasa śląska pieczona 450g", material: "R-1002 · Słonina wieprzowa", matLine: 2, lp: "LP-4470", reservedQty: 148.0, lpQty: 200.0, expiry: "2026-05-10", loc: ["WH-Factory-A","Cold","B2"], reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active",   releasedAt: null,               releaseReason: null },
  { wo: "WO-2026-0108", woProduct: "FA5100 · Kiełbasa śląska pieczona 450g", material: "R-2101 · Pieprz czarny",     matLine: 3, lp: "LP-5582", reservedQty:   4.2, lpQty:  25.0, expiry: "2027-02-18", loc: ["WH-Factory-A","Dry","A5"],  reservedAt: "2026-04-21 05:58", reservedBy: "m.krawczyk", status: "active",   releasedAt: null,               releaseReason: null },
  { wo: "WO-2026-0111", woProduct: "FA5021 · Gulasz wołowy",                  material: "R-1101 · Wołowina gulaszowa", matLine: 1, lp: "LP-4850", reservedQty: 480.0, lpQty: 480.0, expiry: "2026-05-20", loc: ["WH-Factory-A","Cold","B1"], reservedAt: "2026-04-21 06:20", reservedBy: "m.krawczyk", status: "active",   releasedAt: null,               releaseReason: null },
  { wo: "WO-2026-0115", woProduct: "FA5400 · Filet sous-vide 180g",           material: "R-1201 · Filet z kurczaka",  matLine: 1, lp: "LP00000052", reservedQty: 120.0, lpQty: 120.0, expiry: "2026-04-26", loc: ["WH-Factory-A","Cold","C3"], reservedAt: "2026-04-21 08:14", reservedBy: "m.krawczyk", status: "active",   releasedAt: null,               releaseReason: null },
  { wo: "WO-2026-0109", woProduct: "FA5102 · Szynka plastry 150g",            material: "R-2101 · Pieprz czarny",     matLine: 2, lp: "LP00000099", reservedQty:  70.0, lpQty: 100.0, expiry: "2027-02-18", loc: ["WH-Factory-A","Dry","A5"],  reservedAt: "2026-04-21 09:02", reservedBy: "m.krawczyk", status: "active",   releasedAt: null,               releaseReason: null },
  // historical
  { wo: "WO-2026-0100B", woProduct: "FA5400 · Filet sous-vide", material: "R-1201 · Filet z kurczaka", matLine: 1, lp: "LP-5020", reservedQty: 360.0, lpQty: 360.0, expiry: "2026-04-25", loc: ["WH-Factory-A","Cold","C2"], reservedAt: "2026-04-19 21:30", reservedBy: "m.krawczyk", status: "consumed",  releasedAt: "2026-04-20 02:18", releaseReason: "consumed" },
  { wo: "WO-2026-0090",  woProduct: "FA5300 · Pierogi ruskie",  material: "R-1501 · Mąka pszenna",     matLine: 1, lp: "LP-7100", reservedQty: 150.0, lpQty: 180.0, expiry: "2026-07-10", loc: ["WH-Factory-A","Dry","A2"],  reservedAt: "2026-04-18 10:00", reservedBy: "k.kowal",    status: "cancelled", releasedAt: "2026-04-19 15:40", releaseReason: "wo_cancelled" },
];

// ----- Locations tree (WH-018) -----
const WH_LOCATIONS = [
  { level: 0, code: "WH-Factory-A",  name: "Forza Foods — Factory A",   type: "storage",        lpCount: 142, key: "WH-Factory-A" },
  { level: 1, code: "Cold",          name: "Cold Storage (0–4°C)",      type: "storage",        lpCount: 58,  key: "WH-Factory-A.Cold", parent: "WH-Factory-A" },
  { level: 2, code: "B1",            name: "Cold Bin B1",               type: "storage",        lpCount: 12,  key: "WH-Factory-A.Cold.B1", parent: "WH-Factory-A.Cold", util: 0.82 },
  { level: 2, code: "B2",            name: "Cold Bin B2",               type: "storage",        lpCount: 8,   key: "WH-Factory-A.Cold.B2", parent: "WH-Factory-A.Cold", util: 0.45 },
  { level: 2, code: "B3",            name: "Cold Bin B3",               type: "storage",        lpCount: 15,  key: "WH-Factory-A.Cold.B3", parent: "WH-Factory-A.Cold", util: 0.92 },
  { level: 2, code: "C1",            name: "Cold Bin C1",               type: "storage",        lpCount: 7,   key: "WH-Factory-A.Cold.C1", parent: "WH-Factory-A.Cold", util: 0.30 },
  { level: 2, code: "C2",            name: "Cold Bin C2",               type: "storage",        lpCount: 6,   key: "WH-Factory-A.Cold.C2", parent: "WH-Factory-A.Cold", util: 0.28 },
  { level: 2, code: "C3",            name: "Cold Bin C3",               type: "storage",        lpCount: 10,  key: "WH-Factory-A.Cold.C3", parent: "WH-Factory-A.Cold", util: 0.58 },
  { level: 1, code: "Dry",           name: "Dry Storage (ambient)",     type: "storage",        lpCount: 62,  key: "WH-Factory-A.Dry",  parent: "WH-Factory-A" },
  { level: 2, code: "A2",            name: "Dry Bin A2",                type: "storage",        lpCount: 14,  key: "WH-Factory-A.Dry.A2", parent: "WH-Factory-A.Dry", util: 0.68 },
  { level: 2, code: "A4",            name: "Dry Bin A4",                type: "storage",        lpCount: 11,  key: "WH-Factory-A.Dry.A4", parent: "WH-Factory-A.Dry", util: 0.42 },
  { level: 2, code: "A5",            name: "Dry Bin A5",                type: "storage",        lpCount: 9,   key: "WH-Factory-A.Dry.A5", parent: "WH-Factory-A.Dry", util: 0.35 },
  { level: 2, code: "A8",            name: "Dry Bin A8",                type: "storage",        lpCount: 18,  key: "WH-Factory-A.Dry.A8", parent: "WH-Factory-A.Dry", util: 0.74 },
  { level: 1, code: "Production",    name: "Production Line Buffers",   type: "production_line", lpCount: 10, key: "WH-Factory-A.Production", parent: "WH-Factory-A" },
  { level: 2, code: "Line-1-Buffer", name: "Line 1 buffer",             type: "production_line", lpCount: 2,  key: "WH-Factory-A.Production.Line-1-Buffer", parent: "WH-Factory-A.Production", util: 0.12 },
  { level: 2, code: "Line-4-Buffer", name: "Line 4 buffer (Pierogi)",   type: "production_line", lpCount: 4,  key: "WH-Factory-A.Production.Line-4-Buffer", parent: "WH-Factory-A.Production", util: 0.35 },
  { level: 1, code: "Receiving",     name: "Receiving Zone",            type: "receiving",      lpCount: 4,   key: "WH-Factory-A.Receiving", parent: "WH-Factory-A" },
  { level: 2, code: "Dock-01",       name: "Dock 1",                    type: "receiving",      lpCount: 2,   key: "WH-Factory-A.Receiving.Dock-01", parent: "WH-Factory-A.Receiving", util: 0.15 },
  { level: 1, code: "Transit",       name: "Transit (incoming TO)",     type: "transit",        lpCount: 6,   key: "WH-Factory-A.Transit", parent: "WH-Factory-A" },
  { level: 1, code: "QA-Hold",       name: "QA Hold / Quarantine",      type: "storage",        lpCount: 2,   key: "WH-Factory-A.QA-Hold", parent: "WH-Factory-A" },
  { level: 1, code: "Dispatch",      name: "Dispatch FG",               type: "storage",        lpCount: 0,   key: "WH-Factory-A.Dispatch", parent: "WH-Factory-A" },
];

// ----- Genealogy sample tree (WH-014) — seeded by finished LP FA5100 for a full trace -----
const WH_GENEALOGY = {
  seed: { lp: "LP00000300", product: "FA5100 · Kiełbasa śląska pieczona 450g", batch: "WO-2026-0108-B1" },
  backward: [
    { depth: 0, lp: "LP00000300", op: "output",  product: "FA5100", batch: "WO-2026-0108-B1", date: "2026-04-21 14:45", ref: "WO-2026-0108", qty: "1,011 kg", fefo: null },
    { depth: 1, lp: "LP-4431",    op: "consume", product: "R-1001", batch: "B-2026-04-02",    date: "2026-04-21 06:02", ref: "WO-2026-0108", qty: "220.5 kg", fefo: "ok" },
    { depth: 1, lp: "LP-4432",    op: "consume", product: "R-1001", batch: "B-2026-04-02",    date: "2026-04-21 06:04", ref: "WO-2026-0108", qty: "137.5 kg", fefo: "ok" },
    { depth: 1, lp: "LP-4470",    op: "consume", product: "R-1002", batch: "B-2026-04-05",    date: "2026-04-21 06:06", ref: "WO-2026-0108", qty: "148.0 kg", fefo: "over" },
    { depth: 1, lp: "LP-5582",    op: "consume", product: "R-2101", batch: "B-2026-02-18",    date: "2026-04-21 06:08", ref: "WO-2026-0108", qty:   "4.2 kg", fefo: "ok" },
    { depth: 2, lp: "LP-4431",    op: "receipt", product: "R-1001", batch: "B-2026-04-02",    date: "2026-04-02 09:14", ref: "GRN-2026-00038", qty: "220.5 kg · SUP-AGRO-4712", fefo: null },
    { depth: 2, lp: "LP-4432",    op: "receipt", product: "R-1001", batch: "B-2026-04-02",    date: "2026-04-02 09:14", ref: "GRN-2026-00038", qty: "137.5 kg · SUP-AGRO-4712", fefo: null },
    { depth: 2, lp: "LP-4470",    op: "receipt", product: "R-1002", batch: "B-2026-04-05",    date: "2026-04-05 07:30", ref: "GRN-2026-00039", qty: "200.0 kg · SUP-BALT-2225", fefo: null },
    { depth: 2, lp: "LP-5582",    op: "receipt", product: "R-2101", batch: "B-2026-02-18",    date: "2026-02-18 11:02", ref: "GRN-2026-00028", qty: "25 kg · SUP-SPICE-P18",    fefo: null },
  ],
};

// ----- Inventory browser aggregates (WH-012) -----
const WH_INV_BY_PRODUCT = [
  { code: "R-1001", name: "Wieprzowina kl. II",        itemType: "raw_material",    total: 758.0, reserved: 358.0, available: 400.0, hold: 0,   lps: 3, earliest: "2026-05-02", locs: 1, strategy: "fefo", value: "£3,790" },
  { code: "R-1002", name: "Słonina wieprzowa",          itemType: "raw_material",    total: 260.0, reserved: 148.0, available:  52.0, hold: 60,  lps: 3, earliest: "2026-04-15", locs: 1, strategy: "fefo", value: "£1,040" },
  { code: "R-1101", name: "Wołowina gulaszowa",         itemType: "raw_material",    total: 840.0, reserved: 480.0, available: 360.0, hold: 360, lps: 2, earliest: "2026-05-20", locs: 1, strategy: "fefo", value: "£5,040" },
  { code: "R-1201", name: "Filet z kurczaka",            itemType: "raw_material",    total: 120.0, reserved: 120.0, available:   0.0, hold: 0,   lps: 1, earliest: "2026-04-26", locs: 1, strategy: "fefo", value: "£1,200" },
  { code: "R-1501", name: "Mąka pszenna typ 500",        itemType: "raw_material",    total: 380.0, reserved: 0.0,   available: 380.0, hold: 200, lps: 3, earliest: "2026-04-23", locs: 1, strategy: "fefo", value: "£380"   },
  { code: "R-1601", name: "Jaja kurze (żółtka)",          itemType: "raw_material",   total:  60.0, reserved: 0.0,   available:  60.0, hold: 0,   lps: 1, earliest: "2026-04-24", locs: 1, strategy: "fefo", value: "£480"   },
  { code: "R-2101", name: "Pieprz czarny mielony",       itemType: "raw_material",    total: 125.0, reserved:  74.2, available:  50.8, hold: 0,   lps: 2, earliest: "2027-02-18", locs: 1, strategy: "fifo", value: "£1,500" },
  { code: "R-3001", name: "Osłonka Ø26 (Viscofan)",     itemType: "raw_material",    total: 800.0, reserved:   0.0, available: 800.0, hold: 0,   lps: 1, earliest: "2026-04-22", locs: 1, strategy: "fifo", value: "£6,080", uom: "m" },
  { code: "IN1301", name: "[INT] Farsz pierogowy mieszany 20kg", itemType: "intermediate", total: 420.0, reserved: 0.0, available: 420.0, hold: 0, lps: 1, earliest: "2026-04-24", locs: 1, strategy: "fefo", value: "—" },
  { code: "IN1302", name: "[INT] Gotowe ciasto pierogowe 15kg",  itemType: "intermediate", total: 180.0, reserved: 0.0, available: 180.0, hold: 0, lps: 1, earliest: "2026-04-23", locs: 1, strategy: "fefo", value: "—" },
  { code: "FA5200", name: "Pasztet drobiowy z żurawiną 180g",    itemType: "finished_article", total: 212.0, reserved: 0.0, available: 212.0, hold: 0, lps: 1, earliest: "2026-06-18", locs: 1, strategy: "fefo", value: "£2,120" },
];

// ----- Expiry dashboard (WH-019) -----
const WH_EXPIRED = [
  { lp: "LP00000007", product: "R-1002 · Słonina wieprzowa",   batch: "B-2026-02-01", expiry: "2026-04-15", days: -6, mode: "use_by",      status: "blocked",   qty: "60 kg",  loc: ["WH-Factory-A","Cold","B2"],  autoBlocked: "2026-04-16 02:00" },
  { lp: "LP00000012", product: "R-1004 · Masło śmietankowe",  batch: "B-2026-03-20", expiry: "2026-04-20", days: -1, mode: "best_before", status: "available", qty: "24 kg",  loc: ["WH-Factory-A","Cold","B2"],  autoBlocked: null },
  { lp: "LP00000019", product: "R-1301 · Cebula drobna",       batch: "B-2026-04-05", expiry: "2026-04-19", days: -2, mode: "best_before", status: "available", qty: "35 kg",  loc: ["WH-Factory-A","Dry","A8"],   autoBlocked: null },
  { lp: "LP00000023", product: "R-1002 · Słonina wieprzowa",   batch: "B-2026-02-08", expiry: "2026-04-18", days: -3, mode: "use_by",      status: "blocked",   qty: "42 kg",  loc: ["WH-Factory-A","Cold","B2"],  autoBlocked: "2026-04-19 02:00" },
];

const WH_EXPIRING_SOON = [
  { lp: "LP00000031", product: "R-3001 · Osłonka Ø26 (Viscofan)",  batch: "B-2026-03-20", expiry: "2026-04-22", days: 1, mode: "best_before", qty: "800 m",  loc: ["WH-Factory-A","Dry","A4"] },
  { lp: "LP00000044", product: "R-1501 · Mąka pszenna typ 500",    batch: "B-2026-04-10", expiry: "2026-04-23", days: 2, mode: "best_before", qty: "180 kg", loc: ["WH-Factory-A","Dry","A2"] },
  { lp: "LP00000048", product: "R-1601 · Jaja kurze (żółtka)",     batch: "B-2026-04-02", expiry: "2026-04-24", days: 3, mode: "use_by",      qty: "60 kg",  loc: ["WH-Factory-A","Cold","B1"] },
  { lp: "LP00000052", product: "R-1201 · Filet z kurczaka",        batch: "B-2026-04-14", expiry: "2026-04-26", days: 5, mode: "use_by",      qty: "120 kg", loc: ["WH-Factory-A","Cold","C3"] },
  { lp: "LP00000214", product: "IN1301 · Farsz pierogowy",          batch: "WO-2026-0114-B1", expiry: "2026-04-24", days: 3, mode: "use_by",  qty: "420 kg", loc: ["WH-Factory-A","Production","Line-4-Buffer"] },
  { lp: "LP-4431",    product: "R-1001 · Wieprzowina kl. II",       batch: "B-2026-04-02", expiry: "2026-05-02", days: 11, mode: "use_by",    qty: "220.5 kg", loc: ["WH-Factory-A","Cold","B3"] },
  { lp: "LP-4470",    product: "R-1002 · Słonina wieprzowa",        batch: "B-2026-04-05", expiry: "2026-05-10", days: 19, mode: "use_by",    qty: "200 kg", loc: ["WH-Factory-A","Cold","B2"] },
];

// ----- Available LPs picker sample (WH-015) for R-1501 Mąka pszenna -----
const WH_PICKER_LPS = [
  { rank: 1, lp: "LP00000044", qty: 180.0, batch: "B-2026-04-10", expiry: "2026-04-23", loc: ["WH-Factory-A","Dry","A2"], qa: "PASSED",  fefo: true },
  { rank: 2, lp: "LP-7100",    qty: 180.0, batch: "B-2026-04-15", expiry: "2026-07-10", loc: ["WH-Factory-A","Dry","A2"], qa: "PASSED",  fefo: false },
  { rank: 3, lp: "LP-7200",    qty: 104.0, batch: "B-2026-05-01", expiry: "2026-08-14", loc: ["WH-Factory-A","Dry","A2"], qa: "PASSED",  fefo: false },
  { rank: 4, lp: "LP-7400",    qty: 240.0, batch: "B-2026-05-10", expiry: "2026-09-15", loc: ["WH-Factory-A","Dry","A2"], qa: "PASSED",  fefo: false },
  { rank: "—", lp: "LP00000122", qty: 200.0, batch: "B-2026-04-08", expiry: "2026-10-08", loc: ["WH-Factory-A","Dry","A2"], qa: "HOLD",   fefo: false, excluded: "QA Hold" },
];

// ----- FEFO overrides log -----
const WH_FEFO_OVERRIDES = [
  { t: "2026-04-21 10:15", lp: "LP00000133", suggested: "LP00000044", reason: "physical_accessibility", user: "M.Kowalski", wo: "WO-2026-0109", daysLater: 34 },
  { t: "2026-04-20 14:30", lp: "LP-7100",    suggested: "LP00000044", reason: "batch_exhaustion",       user: "K.Kowal",    wo: "WO-2026-0099", daysLater: 78 },
  { t: "2026-04-19 09:22", lp: "LP-7400",    suggested: "LP00000044", reason: "qa_release",             user: "M.Kowalski", wo: "WO-2026-0090", daysLater: 145 },
];

// ----- Warehouse settings (WH-020) -----
const WH_SETTINGS = {
  general: { name: "Forza Foods — Factory A", code: "WH-Factory-A", setAsDefault: true, archivalMonths: 12, dashboardCacheTtl: 60 },
  lpNumbering: { autoGenerate: true, prefix: "LP", seqLength: 8, allowManual: false, preview: "LP00000001" },
  grn: { requireBatch: true, requireExpiry: true, requireSupplierBatch: false, defaultQa: "PENDING", allowOverReceipt: false, overReceiptTolerance: 0 },
  picking: { enableFefo: true, enableFifoFallback: true, allowFefoOverride: true, requireOverrideReason: true },
  expiry: { redThreshold: 7, amberThreshold: 30, cronSchedule: "0 2 * * *", useByAutoBlock: true, useByAutoBlockLocked: true },
  labels: { printOnReceipt: true, defaultCopies: 1, defaultPrinter: "ZPL-WH-01" },
  scanner: { idleTimeout: 300, lockTimeout: 300, soundFeedback: true, vibrationOnScan: true },
};

// ----- Warehouse printer list (settings dropdown) -----
const WH_PRINTERS = [
  { id: "ZPL-WH-01", name: "ZPL Receiving Dock 1", ip: "10.1.1.41", online: true },
  { id: "ZPL-WH-02", name: "ZPL Dispatch",         ip: "10.1.1.42", online: true },
  { id: "ZPL-WH-03", name: "ZPL Production Line-1", ip: "10.1.1.43", online: false },
  { id: "ZPL-WH-04", name: "ZPL Production Line-4", ip: "10.1.1.44", online: true },
];

Object.assign(window, {
  WH_NAV, WH_KPIS, WH_ALERTS, WH_EXPIRY_TOP5, WH_ACTIVITY,
  WH_LPS, WH_LP_DETAIL,
  WH_GRNS, WH_GRN_DETAIL, WH_POS_RECEIVING,
  WH_MOVEMENTS,
  WH_RESERVATIONS,
  WH_LOCATIONS, WH_GENEALOGY,
  WH_INV_BY_PRODUCT,
  WH_EXPIRED, WH_EXPIRING_SOON,
  WH_PICKER_LPS, WH_FEFO_OVERRIDES,
  WH_SETTINGS, WH_PRINTERS,
});
