// ============================================================
// Scanner — mock data
// All product names in Polish to match Planning/Warehouse module.
// References: WO codes (Planning data.jsx), LP codes, PO/TO codes.
// ============================================================

const SCN_USER = {
  id: "op-jk",
  name: "Jan Kowalski",
  email: "j.kowalski@forza.pl",
  initials: "JK",
  avatar: "👷",
  role: "production.operator",
  roles: ["scanner.access", "production.operator", "warehouse.operator", "quality.inspector"],
  site: "FORZ",
  siteName: "Forza Foods · Grójec",
  line: "LINE-01",
  lineName: "Linia A",
  shift: "morning",
  shiftName: "Zmiana ranna",
  shiftHours: "06:00–14:00",
  loginAt: "09:41",
  lastPinChange: "2026-01-15",
  pinSet: true,
  deviceMode: "personal", // or "kiosk"
};

// WOs visible to operator
const SCN_WOS = [
  { code: "WO-2026-0108", product: "Kiełbasa śląska pieczona 450g", line: "LINE-01", status: "inprog", progress: 36, planned: 500, actual: 180, uom: "kg", startedAt: "09:00", operator: "Jan K.", batch: "", missing: [{ name: "Śmietana 36%", left: 4 }, { name: "Cukier waniliowy", left: 2 }] },
  { code: "WO-2026-0109", product: "Szynka wędzona plastry 150g", line: "LINE-01", status: "released", progress: 0, planned: 240, actual: 0, uom: "kg", startedAt: "—", operator: "—", batch: "" },
  { code: "WO-2026-0111", product: "Gulasz wołowy 350g", line: "LINE-02", status: "released", progress: 0, planned: 400, actual: 0, uom: "kg", startedAt: "—", operator: "—", batch: "" },
  { code: "WO-2026-0112", product: "Pasztet drobiowy 180g", line: "LINE-03", status: "planned", progress: 0, planned: 300, actual: 0, uom: "kg", startedAt: "—", operator: "—", batch: "" },
  { code: "WO-2026-0142", product: "Serek waniliowy 250g", line: "LINE-01", status: "inprog", progress: 64, planned: 500, actual: 320, uom: "kg", startedAt: "07:30", operator: "Jan K.", batch: "B-2026-A08", missing: [] },
];

// BOM for active WOs (by WO code)
const SCN_BOM = {
  "WO-2026-0108": [
    { line: 1, material: "Wieprzowina kl. II", qtyReq: 280, qtyDone: 280, uom: "kg", lp: "LP-04231", status: "ok", location: "LOC-A-01-02", batch: "B20260405", expiry: "2026-08-12" },
    { line: 2, material: "Tłuszcz wieprzowy", qtyReq: 70, qtyDone: 70, uom: "kg", lp: "LP-04232", status: "ok", location: "LOC-A-01-03", batch: "B20260405", expiry: "2026-08-12" },
    { line: 3, material: "Śmietana 36%", qtyReq: 12, qtyDone: 8, uom: "kg", lp: "LP-04470", status: "warn", location: "LOC-A-02-01", batch: "B20260410", expiry: "2026-05-01", lpSuggested: "LP-00245" },
    { line: 4, material: "Cukier waniliowy", qtyReq: 2, qtyDone: 0, uom: "kg", lp: "", status: "empty", location: "LOC-B-05-08", batch: "", expiry: "", lpSuggested: "LP-00601" },
  ],
  "WO-2026-0142": [
    { line: 1, material: "Twaróg naturalny", qtyReq: 50, qtyDone: 50, uom: "kg", lp: "LP-00234", status: "ok", location: "LOC-A-01-05", batch: "B20260105", expiry: "2026-06-02" },
    { line: 2, material: "Śmietana 36%", qtyReq: 12, qtyDone: 8, uom: "kg", lp: "LP-00245", status: "warn", location: "LOC-A-02-01", batch: "B20260401", expiry: "2026-05-01", lpSuggested: "LP-00245" },
    { line: 3, material: "Cukier waniliowy", qtyReq: 2, qtyDone: 0, uom: "kg", lp: "", status: "empty", location: "LOC-B-05-08", batch: "", expiry: "", lpSuggested: "LP-00602" },
  ],
};

// LPs in stock
const SCN_LPS = {
  "LP-00234": { lp: "LP-00234", product: "Twaróg naturalny", qty: 50, uom: "kg", batch: "B20260105", expiry: "2026-06-02", location: "LOC-A-01-05", status: "available", qaStatus: "released", datePolicy: "use_by" },
  "LP-00245": { lp: "LP-00245", product: "Śmietana 36%", qty: 18.5, uom: "kg", batch: "B20260401", expiry: "2026-05-01", location: "LOC-A-02-01", status: "available", qaStatus: "released", datePolicy: "use_by" },
  "LP-00287": { lp: "LP-00287", product: "Śmietana 36%", qty: 12.2, uom: "kg", batch: "B20260412", expiry: "2026-06-15", location: "LOC-A-02-04", status: "available", qaStatus: "released", datePolicy: "use_by" },
  "LP-00301": { lp: "LP-00301", product: "Serek waniliowy 250g", qty: 200, uom: "kg", batch: "B20260310", expiry: "2026-04-18", location: "LOC-QA-01", status: "qc_pending", qaStatus: "pending", datePolicy: "use_by", age: 4, woRef: "WO-2025-0138" },
  "LP-00303": { lp: "LP-00303", product: "Jogurt truskawkowy 150g", qty: 80, uom: "kg", batch: "B20260401", expiry: "2026-04-24", location: "LOC-B-03-01", status: "available", qaStatus: "pending", datePolicy: "best_before" },
  "LP-00401": { lp: "LP-00401", product: "Pierogi z mięsem 400g", qty: 120, uom: "kg", batch: "B20260301", expiry: "2026-09-10", location: "LOC-C-02-02", status: "available", qaStatus: "pending" },
  "LP-00567": { lp: "LP-00567", product: "Wiśniowy jogurt 150g", qty: 40, uom: "kg", batch: "B20260410", expiry: "2026-07-01", location: "", status: "available", qaStatus: "pending" },
  "LP-00601": { lp: "LP-00601", product: "Cukier waniliowy", qty: 15, uom: "kg", batch: "B20260215", expiry: "2027-02-15", location: "LOC-B-05-08", status: "available", qaStatus: "released" },
  "LP-04231": { lp: "LP-04231", product: "Wieprzowina kl. II", qty: 120, uom: "kg", batch: "B20260405", expiry: "2026-08-12", location: "LOC-A-01-02", status: "available", qaStatus: "released" },
  "LP-FA-0892":{ lp: "LP-FA-0892", product: "Serek waniliowy 250g", qty: 320, uom: "kg", batch: "BATCH-2026-A01", expiry: "2026-09-01", location: "LOC-FA-01-01", status: "available", qaStatus: "pending" },
};

// Pending POs
const SCN_POS = [
  { code: "PO-2026-0018", supplier: "Agro-Fresh Ltd.", eta: "2026-04-20", urgency: "red", status: "overdue", lines: [
    { id: 1, product: "Wiśniowy jogurt 150g", sku: "RM-JOG-015", gtin: "10012345678902", ordered: 100, received: 0, uom: "kg", isCW: false }
  ]},
  { code: "PO-2026-0021", supplier: "Baltic Pork Co.", eta: "2026-04-21", urgency: "amber", status: "due_today", lines: [
    { id: 1, product: "Wieprzowina kl. I", sku: "RM-PORK-A1", gtin: "10077334456781", ordered: 200, received: 80, uom: "kg", isCW: true },
    { id: 2, product: "Słonina surowa", sku: "RM-PORK-FAT", gtin: "10077334456798", ordered: 50, received: 50, uom: "kg", isCW: true },
  ]},
  { code: "PO-2026-0024", supplier: "Premium Dairy Ltd.", eta: "2026-04-23", urgency: "blue", status: "future", lines: [
    { id: 1, product: "Śmietana 36%", sku: "RM-DAIRY-036", gtin: "10099887712345", ordered: 60, received: 0, uom: "kg", isCW: false },
  ]},
];

// Pending TOs
const SCN_TOS = [
  { code: "TO-2026-042", from: "WH-Factory-B", fromName: "z FNOR Norwich", lines: 4, eta: "2026-04-21", status: "in_transit", lps: [
    { lp: "LP-03401", product: "Pierogi z mięsem 400g", qty: 120, uom: "kg", confirmed: false },
    { lp: "LP-03402", product: "Pierogi ruskie 400g", qty: 80, uom: "kg", confirmed: false },
    { lp: "LP-03403", product: "Sos pomidorowy 500g", qty: 40, uom: "kg", confirmed: false },
    { lp: "LP-03404", product: "Kopytka 500g", qty: 60, uom: "kg", confirmed: false },
  ]},
  { code: "TO-2026-043", from: "WH-Cold-01", fromName: "z Chłodni Centralnej", lines: 2, eta: "2026-04-22", status: "awaiting_receipt", lps: [
    { lp: "LP-03501", product: "Klopsiki w sosie pomidorowym 320g", qty: 200, uom: "kg", confirmed: false },
    { lp: "LP-03502", product: "Zupa pomidorowa 500ml", qty: 150, uom: "l", confirmed: false },
  ]},
];

// Pick lists (WOs that need material picking)
const SCN_PICK = [
  { wo: "WO-2026-0108", product: "Kiełbasa śląska pieczona 450g", line: "LINE-01", picked: 2, total: 4, status: "inprog" },
  { wo: "WO-2026-0109", product: "Szynka wędzona plastry 150g", line: "LINE-01", picked: 0, total: 3, status: "planned" },
  { wo: "WO-2026-0112", product: "Pasztet drobiowy 180g", line: "LINE-03", picked: 0, total: 5, status: "planned" },
];

// QA inspections pending
const SCN_QA = [
  { lp: "LP-00301", product: "Serek waniliowy 250g", batch: "B20260310", location: "LOC-QA-01", urgency: "red", age: "4 dni", woRef: "WO-2025-0138", inspection: "incoming" },
  { lp: "LP-00303", product: "Jogurt truskawkowy 150g", batch: "B20260401", location: "LOC-B-03-01", urgency: "amber", age: "2 dni", woRef: "", inspection: "periodic" },
  { lp: "LP-00407", product: "Kiełbasa śląska pieczona 450g", batch: "B20260418", location: "LOC-QA-02", urgency: "amber", age: "1 dzień", woRef: "WO-2026-0105", inspection: "incoming" },
  { lp: "LP-00408", product: "Pierogi z mięsem 400g", batch: "B20260419", location: "LOC-QA-02", urgency: "blue", age: "kilka godz.", woRef: "WO-2026-0107", inspection: "incoming" },
  { lp: "LP-00410", product: "Filet z kurczaka sous-vide", batch: "B20260419", location: "LOC-QA-03", urgency: "blue", age: "kilka godz.", woRef: "WO-2026-0107", inspection: "incoming" },
];

// QA fail reasons
const SCN_QA_REASONS = [
  { id: "contamination", icon: "🦠", label: "Zanieczyszczenie" },
  { id: "wrong_label",   icon: "🏷", label: "Błędna etykieta" },
  { id: "temperature",   icon: "🌡", label: "Temperatura" },
  { id: "visual_defect", icon: "👁", label: "Wada wizualna" },
  { id: "weight_var",    icon: "⚖", label: "Odchylenie wagi" },
  { id: "date_code",     icon: "📅", label: "Problem z datą" },
  { id: "other",         icon: "❓", label: "Inny powód" },
];

// Reason codes for various overrides
const SCN_REASONS_FEFO = [
  { id: "suggest_damaged", label: "Sugestia uszkodzona / niedostępna" },
  { id: "closer_location", label: "Bliższa lokalizacja" },
  { id: "closer_expiry",   label: "Bliska data sugestii — inna partia wybrana" },
  { id: "other_batch",     label: "Inna partia wybrana" },
  { id: "other",           label: "Inny powód" },
];
const SCN_REASONS_PUTAWAY = [
  { id: "suggested_full",  label: "Strefa pełna — sugestia niemożliwa" },
  { id: "urgent_other",    label: "Pilna potrzeba innej lokalizacji" },
  { id: "closer_available",label: "Bliższa lokalizacja dostępna" },
  { id: "product_better",  label: "Inna lokalizacja lepsza dla produktu" },
  { id: "other",           label: "Inny powód" },
];
const SCN_REASONS_PARTIAL = [
  { id: "planned_diff", label: "Planowa różnica (oversized batch)" },
  { id: "missing",      label: "Materiał niedostępny — uzupełnione później" },
  { id: "recipe",       label: "Zmiana receptury" },
  { id: "other",        label: "Inny powód" },
];

// Quick locations (by site/line context)
const SCN_QUICK_LOCS = [
  { code: "LOC-FA-01-01", zone: "Magazyn wyrobów gotowych A" },
  { code: "LOC-FA-01-02", zone: "Magazyn wyrobów gotowych A" },
  { code: "LOC-B-05-08",  zone: "Magazyn surowców B" },
  { code: "LOC-C-02-02",  zone: "Chłodnia C" },
];

// Waste categories
const SCN_WASTE_CATS = [
  { id: "fat",   label: "Tłuszcz / Fat", icon: "🥓", cls: "sc-cat-fat" },
  { id: "floor", label: "Odpady produkcyjne / Floor", icon: "🧹", cls: "sc-cat-floor" },
  { id: "over",  label: "Naddatek / Giveaway", icon: "📦", cls: "sc-cat-give" },
  { id: "rew",   label: "Do przeróbki / Rework", icon: "♻️", cls: "sc-cat-rew" },
  { id: "other", label: "Inne / Other", icon: "❓", cls: "sc-cat-oth" },
];

// Co-products available per WO
const SCN_COPRODUCTS = {
  "WO-2026-0108": [
    { id: "cp-skin", product: "Skóra wieprzowa", allocPct: 8 },
    { id: "cp-trim", product: "Obrzynki / odpady jadalne", allocPct: 3 },
  ],
  "WO-2026-0142": [
    { id: "cp-whey", product: "Serwatka", allocPct: 15 },
  ],
};

// Sites/lines/shifts for context picker
const SCN_SITES = [
  { code: "FORZ", name: "Forza Foods · Grójec", desc: "PL · Zakład główny" },
  { code: "FNOR", name: "Forza Norwich", desc: "GB · UK operations" },
];
const SCN_LINES = [
  { code: "LINE-01", name: "Linia A", desc: "Kiełbasy", status: "active" },
  { code: "LINE-02", name: "Linia B", desc: "Pasztety", status: "active" },
  { code: "LINE-03", name: "Linia C", desc: "Gulasze / sosy", status: "pause" },
  { code: "LINE-04", name: "Linia D", desc: "Pierogi / mrożone", status: "active" },
];
const SCN_SHIFTS = [
  { code: "morning",   name: "Ranna",       hours: "06:00–14:00" },
  { code: "afternoon", name: "Popołudniowa",hours: "14:00–22:00" },
  { code: "night",     name: "Nocna",       hours: "22:00–06:00" },
];

// Flow tiles for home (icon grid)
const SCN_TILES = [
  { key: "consume",  group: "produkcja", title: "Work Order",    desc: "Konsumpcja + wyrób",  icon: "🏭", cls: "sc-micon-blue",   badge: "2", perm: "production.operator" },
  { key: "pick",     group: "produkcja", title: "Pick dla WO",   desc: "Zbierz materiały",    icon: "🧺", cls: "sc-micon-purple", perm: "production.operator" },
  { key: "receive_po", group: "magazyn", title: "Przyjęcie PO",  desc: "Zamówienie zakupu",   icon: "📦", cls: "sc-micon-green",  perm: "warehouse.operator" },
  { key: "receive_to", group: "magazyn", title: "Przyjęcie TO",  desc: "Transfer Order",      icon: "🔄", cls: "sc-micon-cyan",   perm: "warehouse.operator" },
  { key: "putaway",  group: "magazyn", title: "Putaway",         desc: "Odłóż LP (FIFO/FEFO)",icon: "📍", cls: "sc-micon-green",  perm: "warehouse.operator" },
  { key: "move",     group: "magazyn", title: "Przesuń LP",      desc: "Przenieś paletę",     icon: "🚚", cls: "sc-micon-amber",  perm: "warehouse.operator" },
  { key: "split",    group: "magazyn", title: "Split LP",        desc: "Podziel License Plate",icon: "✂️", cls: "sc-micon-purple", perm: "warehouse.operator" },
  { key: "qa",       group: "jakosc",  title: "Inspekcja QC",    desc: "PASS / FAIL / HOLD",  icon: "🔍", cls: "sc-micon-red",    badge: "5", perm: "quality.inspector" },
  { key: "inquiry",  group: "jakosc",  title: "LP info",         desc: "Wyszukaj LP",         icon: "🔎", cls: "sc-micon-blue",   perm: "scanner.access" },
];

// Home menu groups
const SCN_HOME_GROUPS = [
  { key: "produkcja", label: "Produkcja" },
  { key: "magazyn",   label: "Magazyn" },
  { key: "jakosc",    label: "Jakość" },
];

Object.assign(window, {
  SCN_USER, SCN_WOS, SCN_BOM, SCN_LPS, SCN_POS, SCN_TOS, SCN_PICK, SCN_QA,
  SCN_QA_REASONS, SCN_REASONS_FEFO, SCN_REASONS_PUTAWAY, SCN_REASONS_PARTIAL,
  SCN_QUICK_LOCS, SCN_WASTE_CATS, SCN_COPRODUCTS, SCN_SITES, SCN_LINES, SCN_SHIFTS,
  SCN_TILES, SCN_HOME_GROUPS,
});
