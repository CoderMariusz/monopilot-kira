// ============ Shipping module — mock data ============
// Cross-refs to Planning (demand DMD/WO chain, FA5100/FA5200/FA5301 products),
// Warehouse (LP-9120, LP-9121, LP-4431 FEFO reservations), TOs (TO-2026-00015),
// D365 outbox (shipment.confirmed push, flag-gated per 02-SETTINGS).

const SH_NAV = [
  { group: "Operations", items: [
    { key: "dashboard", label: "Dashboard", ic: "◆", hero: true },
    { key: "sos",       label: "Sales orders", ic: "▤", count: "28" },
    { key: "allocations", label: "Allocations", ic: "⚿", count: "6" },
  ]},
  { group: "Pick & Pack", items: [
    { key: "picks",     label: "Pick lists", ic: "⇣", count: "11" },
    { key: "wave",      label: "Wave builder", ic: "◉" },
    { key: "packing",   label: "Packing stations", ic: "▣" },
    { key: "sscc",      label: "SSCC labels", ic: "▥", count: "14" },
  ]},
  { group: "Dispatch", items: [
    { key: "docs",      label: "Documents", ic: "▦" },
    { key: "shipments", label: "Shipments", ic: "🚚", count: "9" },
    { key: "rma",       label: "Returns (RMA)", ic: "↩" },
  ]},
  { group: "Masters", items: [
    { key: "customers", label: "Customers", ic: "◎", count: "42" },
    { key: "carriers",  label: "Carriers", ic: "⇀" },
  ]},
  { group: "Admin", items: [
    { key: "settings",  label: "Shipping settings", ic: "⚙" },
    { key: "gallery",   label: "Modal gallery", ic: "▣" },
  ]},
];

// ----- Dashboard KPIs (SHIP-022) -----
const SH_KPIS_ROW1 = [
  { k: "sos_today",       label: "SOs today",           value: "28",  accent: "blue",  sub: "vs yesterday: +4",           target: "sos" },
  { k: "open_alloc",      label: "Open allocations",    value: "6",   accent: "amber", sub: "Confirmed but not allocated", target: "allocations" },
  { k: "short_picks",     label: "Short picks",         value: "3",   accent: "red",   sub: "Resolve before packing",      target: "picks" },
  { k: "pending_packs",   label: "Pending packs",       value: "5",   accent: "amber", sub: "Shipments in packing",        target: "packing" },
];
const SH_KPIS_ROW2 = [
  { k: "sscc_queued",     label: "SSCC queued",         value: "14",  accent: "blue",  sub: "Generated · not printed",     target: "sscc" },
  { k: "bol_pending",     label: "BOLs pending signature", value: "3", accent: "amber", sub: "BRCGS 48h target",           target: "docs" },
  { k: "otd_30d",         label: "On-time ship % (30d)", value: "96.4%", accent: "green", sub: "Target > 95%",              target: "shipments" },
  { k: "fulfill_today",   label: "Fulfillment rate (today)", value: "97.1%", accent: "green", sub: "qty shipped / ordered", target: "shipments" },
];

// ----- Dashboard alerts (SHIP-022) -----
const SH_ALERTS = [
  { severity: "red",   code: "ALLERGEN-HOLD",   text: "2 SO(s) on allergen hold — review required by shipping_qa.",         link: "sos",       cta: "Review" },
  { severity: "red",   code: "QA-CRITICAL",     text: "LP-9144 has a CRITICAL QA hold — ship confirm blocked for SH-2026-00047.", link: "shipments" },
  { severity: "amber", code: "CREDIT-HOLD",     text: "1 SO held for credit — Carrefour Polska (SO-2026-2449).",             link: "sos",       cta: "View" },
  { severity: "amber", code: "SHORT-PICK",      text: "3 pick list lines short — decide ship partial or wait.",              link: "picks" },
  { severity: "amber", code: "BOL-PENDING",     text: "3 BOLs awaiting signed upload — BRCGS 7y retention required.",        link: "docs" },
  { severity: "amber", code: "PRN-OFFLINE",     text: "SSCC printer ZPL-SH-02 offline — 6 labels queued.",                   link: "settings",  cta: "Retry" },
  { severity: "red",   code: "D365-DLQ",        text: "1 event in D365 outbox DLQ for shipping — manual intervention.",      link: "settings",  cta: "Open DLQ" },
  { severity: "blue",  code: "GS1-PREFIX-OK",   text: "GS1 Company Prefix 5012345 · next SSCC sequence 00000048.",            link: "settings" },
];

// ----- Recent activity feed (SHIP-022) -----
const SH_ACTIVITY = [
  { t: "2 min ago",  color: "green", ref: "SH-2026-00045", desc: "Shipped to Lidl Polska — 4 boxes, 124.6 kg", sub: "BOL SHA-256 recorded · D365 sync queued (outbox event o-20450)" },
  { t: "7 min ago",  color: "blue",  ref: "PL-2026-00042", desc: "Pick complete — ready for packing",           sub: "14/14 lines picked · 0 short · assigned to J.Nowak" },
  { t: "12 min ago", color: "amber", ref: "SO-2026-2451",  desc: "Short pick — 20 kg shortfall",                 sub: "Ship partial + backorder decision pending · FA5200" },
  { t: "19 min ago", color: "green", ref: "SO-2026-2448",  desc: "Fully allocated — 5 lines",                    sub: "FEFO compliant · LP-9120, LP-9121, LP-4431 locked" },
  { t: "24 min ago", color: "blue",  ref: "WV-2026-00015", desc: "Wave released to pickers",                     sub: "6 SOs, 22 lines · zones Cold/Dispatch · ETA 45 min" },
  { t: "32 min ago", color: "amber", ref: "SO-2026-2449",  desc: "Credit hold placed by A.Nowak",                sub: "Customer Carrefour Polska · credit balance 103% of limit" },
  { t: "41 min ago", color: "green", ref: "SH-2026-00044", desc: "POD uploaded — delivered to Tesco (Reading)",   sub: "Consignee: M.Evans · 2026-04-20 16:22" },
  { t: "56 min ago", color: "red",   ref: "SO-2026-2452",  desc: "Allergen conflict blocked SO confirm",          sub: "Product FA5301 contains wheat · Biedronka refuses wheat" },
  { t: "1h ago",     color: "blue",  ref: "SO-2026-2450",  desc: "Draft SO created — Sainsbury's UK",             sub: "5 lines · £4,280.00 · promised ship 2026-04-23" },
  { t: "1h ago",     color: "green", ref: "SH-2026-00043", desc: "SSCC generated — Box 3 of SH-2026-00043",       sub: "SSCC 0 5012345 00000045 7 · GS1-128 queued to ZPL-SH-01" },
];

// ----- Customers (SHIP-001) — mixed PL + UK retail -----
const SH_CUSTOMERS = [
  { id: "CUST-0012", name: "Lidl Polska Sp. z o.o.",  code: "CUST-0012", category: "Retail",       creditLimit: "£250,000", terms: "Net 30", allergens: 3, active: true, ordersOpen: 4, lastOrder: "2026-04-20" },
  { id: "CUST-0015", name: "Biedronka (Jeronimo Martins Polska)", code: "CUST-0015", category: "Retail", creditLimit: "£420,000", terms: "Net 45", allergens: 5, active: true, ordersOpen: 6, lastOrder: "2026-04-21" },
  { id: "CUST-0018", name: "Carrefour Polska Sp. z o.o.", code: "CUST-0018", category: "Retail",    creditLimit: "£180,000", terms: "Net 30", allergens: 2, active: true, ordersOpen: 3, lastOrder: "2026-04-19", creditStatus: "exceeded" },
  { id: "CUST-0022", name: "Auchan Polska",           code: "CUST-0022", category: "Retail",       creditLimit: "£160,000", terms: "Net 30", allergens: 1, active: true, ordersOpen: 2, lastOrder: "2026-04-18" },
  { id: "CUST-0025", name: "Żabka Polska Sp. z o.o.", code: "CUST-0025", category: "Retail",       creditLimit: "£90,000",  terms: "Net 15", allergens: 0, active: true, ordersOpen: 1, lastOrder: "2026-04-17" },
  { id: "CUST-0030", name: "Tesco Stores Ltd. (UK)",  code: "CUST-0030", category: "Retail",       creditLimit: "£500,000", terms: "Net 45", allergens: 4, active: true, ordersOpen: 5, lastOrder: "2026-04-20" },
  { id: "CUST-0033", name: "Sainsbury's Supermarkets Ltd.", code: "CUST-0033", category: "Retail", creditLimit: "£360,000", terms: "Net 45", allergens: 4, active: true, ordersOpen: 3, lastOrder: "2026-04-21" },
  { id: "CUST-0036", name: "Morrisons (WM Morrison PLC)", code: "CUST-0036", category: "Retail",   creditLimit: "£240,000", terms: "Net 30", allergens: 2, active: true, ordersOpen: 1, lastOrder: "2026-04-16" },
  { id: "CUST-0041", name: "Bidfood Warszawa",         code: "CUST-0041", category: "Wholesale",   creditLimit: "£80,000",  terms: "Net 30", allergens: 0, active: true, ordersOpen: 2, lastOrder: "2026-04-19" },
  { id: "CUST-0044", name: "Makro Cash & Carry Polska", code: "CUST-0044", category: "Wholesale",  creditLimit: "£140,000", terms: "Net 30", allergens: 1, active: true, ordersOpen: 1, lastOrder: "2026-04-15" },
  { id: "CUST-0050", name: "Eurocash Dystrybucja",     code: "CUST-0050", category: "Distributor", creditLimit: "£200,000", terms: "Net 45", allergens: 0, active: true, ordersOpen: 1, lastOrder: "2026-04-12" },
  { id: "CUST-0055", name: "Dino Polska SA",           code: "CUST-0055", category: "Retail",      creditLimit: "£120,000", terms: "Net 30", allergens: 0, active: false, ordersOpen: 0, lastOrder: "2026-03-10" },
];

// ----- Customer Detail subject (SHIP-002) — Lidl Polska -----
const SH_CUSTOMER_DETAIL = {
  id: "CUST-0012",
  name: "Lidl Polska Sp. z o.o.",
  tradingName: "Lidl Polska",
  code: "CUST-0012",
  category: "Retail",
  email: "zamowienia@lidl.pl",
  phone: "+48 22 556 55 00",
  taxId: "PL7820030500",
  gln: "5901234567890",
  creditLimit: 250000,
  creditUsed: 148320,
  terms: 30,
  active: true,
  notes: "Preferred dock: 08:00–14:00 Mon-Fri. All deliveries require EDI ASN notification 4h before arrival.",
  createdAt: "2024-11-02 10:14",
  updatedAt: "2026-03-18 15:22",
  addresses: [
    { id: 1, type: "billing",  isDefault: true,  line1: "ul. Poznańska 48", line2: "", city: "Jankowice", postal: "62-080", country: "PL", dock: "Mon-Fri 08:00-17:00" },
    { id: 2, type: "shipping", isDefault: true,  line1: "DC Wrocław — ul. Logistyczna 12", line2: "", city: "Wrocław", postal: "54-512", country: "PL", dock: "Mon-Sat 06:00-14:00" },
    { id: 3, type: "shipping", isDefault: false, line1: "DC Poznań — Aleja Solidarności 8", line2: "", city: "Poznań", postal: "61-696", country: "PL", dock: "Mon-Fri 07:00-16:00" },
    { id: 4, type: "shipping", isDefault: false, line1: "DC Katowice — ul. Przemysłowa 144", line2: "", city: "Katowice", postal: "40-020", country: "PL", dock: "Mon-Fri 05:00-13:00" },
  ],
  allergens: {
    refuses:       ["peanut", "sesame"],
    requires_decl: ["gluten", "milk", "egg"],
  },
  orders: [
    { so: "SO-2026-2451", date: "2026-04-21", status: "picking",   total: "£3,120.00", shipDate: "2026-04-22" },
    { so: "SO-2026-2448", date: "2026-04-21", status: "allocated", total: "£1,840.00", shipDate: "2026-04-22" },
    { so: "SO-2026-2432", date: "2026-04-20", status: "shipped",   total: "£2,450.00", shipDate: "2026-04-20" },
    { so: "SO-2026-2418", date: "2026-04-18", status: "delivered", total: "£1,680.00", shipDate: "2026-04-18" },
  ],
};

const SH_ALLERGENS = ["gluten", "crustaceans", "egg", "fish", "peanut", "soy", "milk", "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "mollusc"];

// ----- Sales Orders list (SHIP-005) -----
const SH_SOS = [
  { so: "SO-2026-2451", customer: "Lidl Polska Sp. z o.o.",   customerPO: "LIDL-PO-44821",     status: "picking",   shipDate: "2026-04-22", lines: 5, allocPct: 100, picked: "18/22", holds: [],             total: "£3,120.00", carrier: "DHL Freight" },
  { so: "SO-2026-2450", customer: "Sainsbury's Supermarkets", customerPO: "SB-25046-PO",       status: "draft",     shipDate: "2026-04-23", lines: 5, allocPct: 0,   picked: "0/0",   holds: [],             total: "£4,280.00", carrier: null },
  { so: "SO-2026-2449", customer: "Carrefour Polska",         customerPO: "CF-PL-2026-9912",   status: "confirmed", shipDate: "2026-04-22", lines: 3, allocPct: 0,   picked: "0/0",   holds: ["credit"],     total: "£1,940.00", carrier: null },
  { so: "SO-2026-2448", customer: "Lidl Polska Sp. z o.o.",   customerPO: "LIDL-PO-44820",     status: "allocated", shipDate: "2026-04-22", lines: 4, allocPct: 100, picked: "0/16",  holds: [],             total: "£1,840.00", carrier: "DHL Freight" },
  { so: "SO-2026-2447", customer: "Biedronka (JMP)",          customerPO: "JMP-2026-00447",    status: "packing",   shipDate: "2026-04-22", lines: 6, allocPct: 100, picked: "24/24", holds: [],             total: "£5,612.00", carrier: "Raben Polska" },
  { so: "SO-2026-2446", customer: "Tesco Stores Ltd.",        customerPO: "TESCO-2026-5512",   status: "packed",    shipDate: "2026-04-22", lines: 4, allocPct: 100, picked: "19/19", holds: [],             total: "£4,120.00", carrier: "Wincanton" },
  { so: "SO-2026-2445", customer: "Lidl Polska Sp. z o.o.",   customerPO: "LIDL-PO-44819",     status: "shipped",   shipDate: "2026-04-21", lines: 5, allocPct: 100, picked: "22/22", holds: [],             total: "£2,980.00", carrier: "DHL Freight" },
  { so: "SO-2026-2444", customer: "Morrisons",                customerPO: "MRR-26-1144",       status: "shipped",   shipDate: "2026-04-21", lines: 3, allocPct: 100, picked: "11/11", holds: [],             total: "£1,520.00", carrier: "Wincanton" },
  { so: "SO-2026-2443", customer: "Auchan Polska",            customerPO: "AUC-2026-0443",     status: "allocated", shipDate: "2026-04-23", lines: 2, allocPct: 100, picked: "0/8",   holds: [],             total: "£1,120.00", carrier: null },
  { so: "SO-2026-2452", customer: "Biedronka (JMP)",          customerPO: "JMP-2026-00452",    status: "held",      shipDate: "2026-04-23", lines: 4, allocPct: 0,   picked: "0/0",   holds: ["allergen"],   total: "£2,680.00", carrier: null },
  { so: "SO-2026-2442", customer: "Tesco Stores Ltd.",        customerPO: "TESCO-2026-5510",   status: "delivered", shipDate: "2026-04-20", lines: 3, allocPct: 100, picked: "14/14", holds: [],             total: "£3,280.00", carrier: "Wincanton" },
  { so: "SO-2026-2453", customer: "Żabka Polska",             customerPO: "ZABK-26-0031",      status: "draft",     shipDate: "2026-04-24", lines: 2, allocPct: 0,   picked: "0/0",   holds: [],             total: "£620.00",   carrier: null },
  { so: "SO-2026-2440", customer: "Makro Cash & Carry",       customerPO: "MAKRO-2026-0221",   status: "partial",   shipDate: "2026-04-20", lines: 4, allocPct: 75,  picked: "12/16", holds: [],             total: "£2,240.00", carrier: "Raben Polska", backorder: "SO-2026-2454" },
  { so: "SO-2026-2441", customer: "Sainsbury's Supermarkets", customerPO: "SB-25045-PO",       status: "shipped",   shipDate: "2026-04-20", lines: 6, allocPct: 100, picked: "28/28", holds: [],             total: "£5,140.00", carrier: "Wincanton" },
  { so: "SO-2026-2439", customer: "Bidfood Warszawa",         customerPO: "BID-2026-0019",     status: "cancelled", shipDate: "—",          lines: 0, allocPct: 0,   picked: "0/0",   holds: [],             total: "£0.00",     carrier: null },
];

// ----- SO Detail subject (SHIP-007) — SO-2026-2451 Lidl Polska -----
const SH_SO_DETAIL = {
  so: "SO-2026-2451",
  customer: { id: "CUST-0012", name: "Lidl Polska Sp. z o.o." },
  customerPO: "LIDL-PO-44821",
  status: "picking",
  orderDate: "2026-04-21",
  promisedShipDate: "2026-04-22",
  requiredDelivery: "2026-04-23",
  shippingAddress: "DC Wrocław — ul. Logistyczna 12, 54-512 Wrocław, PL",
  allergenValidated: true,
  notes: "Dock window 06:00–14:00. EDI ASN required 4h prior to arrival.",
  total: 3120.00,
  lines: [
    { line: 1, product: "FA5100 · Kiełbasa śląska pieczona 450g",  gtin: "05901234567801", qtyOrdered: 120, qtyAllocated: 120, qtyPicked: 48, qtyPacked: 0, qtyShipped: 0, unitPrice: 12.80, lineTotal: 1536.00, allergens: ["milk"] },
    { line: 2, product: "FA5200 · Pasztet drobiowy z żurawiną 180g", gtin: "05901234567814", qtyOrdered: 80,  qtyAllocated: 80,  qtyPicked: 80, qtyPacked: 0, qtyShipped: 0, unitPrice: 8.40,  lineTotal: 672.00,  allergens: [] },
    { line: 3, product: "FA5301 · Pierogi ruskie 1kg",             gtin: "05901234567828", qtyOrdered: 40,  qtyAllocated: 40,  qtyPicked: 40, qtyPacked: 0, qtyShipped: 0, unitPrice: 14.20, lineTotal: 568.00,  allergens: ["gluten","milk","egg"] },
    { line: 4, product: "FA5100 · Kiełbasa śląska pieczona 450g",  gtin: "05901234567801", qtyOrdered: 24,  qtyAllocated: 24,  qtyPicked: 0,  qtyPacked: 0, qtyShipped: 0, unitPrice: 12.80, lineTotal: 307.20,  allergens: ["milk"] },
    { line: 5, product: "FA5200 · Pasztet drobiowy z żurawiną 180g", gtin: "05901234567814", qtyOrdered: 5,   qtyAllocated: 5,   qtyPicked: 0,  qtyPacked: 0, qtyShipped: 0, unitPrice: 8.40,  lineTotal: 42.00,   allergens: [] },
  ],
  allocations: [
    { line: 1, lp: "LP-9120", location: "WH-Factory-A › Dispatch › FG-01", batch: "WO-2026-0108-B1", expiry: "2026-06-14", qty: 60, qa: "PASSED", fefoRank: 1 },
    { line: 1, lp: "LP-9121", location: "WH-Factory-A › Dispatch › FG-01", batch: "WO-2026-0108-B1", expiry: "2026-06-14", qty: 60, qa: "PASSED", fefoRank: 2 },
    { line: 2, lp: "LP-9140", location: "WH-Factory-A › Dispatch › FG-02", batch: "WO-2026-0100-B1", expiry: "2026-06-18", qty: 80, qa: "PASSED", fefoRank: 1 },
    { line: 3, lp: "LP-9182", location: "WH-Factory-A › Dispatch › FG-03", batch: "WO-2026-0112-B1", expiry: "2026-05-22", qty: 40, qa: "PASSED", fefoRank: 1 },
    { line: 4, lp: "LP-9122", location: "WH-Factory-A › Dispatch › FG-01", batch: "WO-2026-0108-B1", expiry: "2026-06-14", qty: 24, qa: "PASSED", fefoRank: 3 },
    { line: 5, lp: "LP-9141", location: "WH-Factory-A › Dispatch › FG-02", batch: "WO-2026-0100-B1", expiry: "2026-06-18", qty: 5,  qa: "PASSED", fefoRank: 2 },
  ],
  holds: [],
  picks: [
    { pl: "PL-2026-00042", type: "wave", status: "In Progress", priority: 2, assignedTo: "J.Nowak", startedAt: "2026-04-21 13:45", lines: "18/22" },
  ],
  shipments: [
    // Not yet packed
  ],
  history: [
    { t: "2026-04-21 13:45", user: "J.Nowak",      action: "pick_started",    old: "allocated",  newv: "picking",   reason: "wave_release" },
    { t: "2026-04-21 12:10", user: "m.krawczyk",   action: "wave_released",   old: null,         newv: "WV-2026-00015", reason: "manual_release" },
    { t: "2026-04-21 10:22", user: "m.krawczyk",   action: "allocation_done", old: "confirmed",  newv: "allocated", reason: "auto_allocate_on_confirm" },
    { t: "2026-04-21 10:20", user: "a.sales",      action: "so_confirmed",    old: "draft",      newv: "confirmed", reason: "manual_confirm" },
    { t: "2026-04-21 09:50", user: "a.sales",      action: "so_created",      old: null,         newv: "draft",     reason: "wizard_complete" },
  ],
};

// ----- Allocations table (SHIP-008 global view) -----
const SH_ALLOC_GLOBAL = [
  { so: "SO-2026-2451", customer: "Lidl Polska",          line: 1, product: "FA5100 · Kiełbasa śląska 450g", qtyOrdered: 120, qtyAllocated: 120, status: "full",  lps: 2, carriers: "DHL Freight" },
  { so: "SO-2026-2451", customer: "Lidl Polska",          line: 2, product: "FA5200 · Pasztet 180g",         qtyOrdered: 80,  qtyAllocated: 80,  status: "full",  lps: 1, carriers: "DHL Freight" },
  { so: "SO-2026-2450", customer: "Sainsbury's",          line: 1, product: "FA5100 · Kiełbasa śląska 450g", qtyOrdered: 200, qtyAllocated: 0,   status: "none",  lps: 0, carriers: null },
  { so: "SO-2026-2449", customer: "Carrefour Polska",     line: 1, product: "FA5200 · Pasztet 180g",         qtyOrdered: 60,  qtyAllocated: 0,   status: "hold",  lps: 0, carriers: null, holdType: "credit" },
  { so: "SO-2026-2448", customer: "Lidl Polska",          line: 1, product: "FA5200 · Pasztet 180g",         qtyOrdered: 60,  qtyAllocated: 60,  status: "full",  lps: 1, carriers: "DHL Freight" },
  { so: "SO-2026-2443", customer: "Auchan Polska",        line: 1, product: "FA5301 · Pierogi 1kg",          qtyOrdered: 40,  qtyAllocated: 30,  status: "short", lps: 1, carriers: null, shortfall: 10 },
  { so: "SO-2026-2452", customer: "Biedronka",            line: 1, product: "FA5301 · Pierogi 1kg",          qtyOrdered: 40,  qtyAllocated: 0,   status: "hold",  lps: 0, carriers: null, holdType: "allergen" },
];

// ----- FA products catalogue (for allocation LP candidates) -----
const SH_LP_CANDIDATES = [
  // For FA5100 — FEFO-sorted oldest first
  { product: "FA5100", lp: "LP-9120", loc: ["WH-Factory-A","Dispatch","FG-01"], batch: "WO-2026-0108-B1", expiry: "2026-06-14", qty: 60,  qa: "PASSED", fefoRank: 1, available: true },
  { product: "FA5100", lp: "LP-9121", loc: ["WH-Factory-A","Dispatch","FG-01"], batch: "WO-2026-0108-B1", expiry: "2026-06-14", qty: 60,  qa: "PASSED", fefoRank: 2, available: true },
  { product: "FA5100", lp: "LP-9122", loc: ["WH-Factory-A","Dispatch","FG-01"], batch: "WO-2026-0108-B1", expiry: "2026-06-14", qty: 24,  qa: "PASSED", fefoRank: 3, available: true },
  { product: "FA5100", lp: "LP-9128", loc: ["WH-Factory-A","Dispatch","FG-01"], batch: "WO-2026-0115-B1", expiry: "2026-07-02", qty: 100, qa: "PASSED", fefoRank: 4, available: true },
  { product: "FA5100", lp: "LP-9144", loc: ["WH-Factory-A","QA-Hold","Q-02"],   batch: "WO-2026-0115-B1", expiry: "2026-07-02", qty: 80,  qa: "HOLD",   fefoRank: "—", available: false, holdReason: "pending_lab_results", holdSeverity: "Major" },
  { product: "FA5100", lp: "LP-8901", loc: ["WH-Factory-A","Dispatch","FG-05"], batch: "WO-2026-0088-B1", expiry: "2026-04-18", qty: 40,  qa: "PASSED", fefoRank: "—", available: false, expired: true },
];

// ----- Pick Lists (SHIP-012) -----
const SH_PICKS = [
  { pl: "PL-2026-00042", type: "wave",   priority: 2, status: "In Progress", picker: "J.Nowak",    sos: 6, lines: 22, picked: 18, startedAt: "13:45", wave: "WV-2026-00015" },
  { pl: "PL-2026-00041", type: "single", priority: 3, status: "Pending",     picker: null,         sos: 1, lines: 4,  picked: 0,  startedAt: null,     wave: null },
  { pl: "PL-2026-00040", type: "wave",   priority: 1, status: "Completed",   picker: "K.Kowal",    sos: 3, lines: 14, picked: 14, startedAt: "11:20", wave: "WV-2026-00014", completedAt: "12:14" },
  { pl: "PL-2026-00039", type: "single", priority: 2, status: "Assigned",    picker: "M.Wolski",   sos: 1, lines: 6,  picked: 0,  startedAt: null,     wave: null },
  { pl: "PL-2026-00038", type: "wave",   priority: 4, status: "Completed",   picker: "J.Nowak",    sos: 4, lines: 18, picked: 18, startedAt: "08:45", wave: "WV-2026-00013", completedAt: "10:12" },
  { pl: "PL-2026-00043", type: "single", priority: 2, status: "In Progress", picker: "K.Kowal",    sos: 1, lines: 5,  picked: 2,  startedAt: "14:12", wave: null },
  { pl: "PL-2026-00037", type: "wave",   priority: 3, status: "Cancelled",   picker: null,         sos: 2, lines: 8,  picked: 0,  startedAt: null,     wave: "WV-2026-00012" },
];

// ----- Pick Detail subject (SHIP-014) — PL-2026-00042 -----
const SH_PICK_DETAIL = {
  pl: "PL-2026-00042",
  type: "wave",
  wave: "WV-2026-00015",
  priority: 2,
  status: "In Progress",
  picker: "J.Nowak",
  startedAt: "2026-04-21 13:45",
  eta: "2026-04-21 14:30",
  lines: [
    { seq: 1,  product: "FA5100 · Kiełbasa śląska 450g", suggestedLp: "LP-9120", actualLp: "LP-9120", qtyReq: 60, qtyPicked: 60, status: "picked",      loc: ["WH-Factory-A","Dispatch","FG-01"], fefoDev: false },
    { seq: 2,  product: "FA5100 · Kiełbasa śląska 450g", suggestedLp: "LP-9121", actualLp: "LP-9121", qtyReq: 60, qtyPicked: 60, status: "picked",      loc: ["WH-Factory-A","Dispatch","FG-01"], fefoDev: false },
    { seq: 3,  product: "FA5100 · Kiełbasa śląska 450g", suggestedLp: "LP-9122", actualLp: "LP-9128", qtyReq: 24, qtyPicked: 24, status: "overridden",  loc: ["WH-Factory-A","Dispatch","FG-01"], fefoDev: true, overrideReason: "physical_accessibility" },
    { seq: 4,  product: "FA5200 · Pasztet 180g",         suggestedLp: "LP-9140", actualLp: "LP-9140", qtyReq: 80, qtyPicked: 80, status: "picked",      loc: ["WH-Factory-A","Dispatch","FG-02"], fefoDev: false },
    { seq: 5,  product: "FA5301 · Pierogi 1kg",          suggestedLp: "LP-9182", actualLp: "LP-9182", qtyReq: 40, qtyPicked: 40, status: "picked",      loc: ["WH-Factory-A","Dispatch","FG-03"], fefoDev: false },
    { seq: 6,  product: "FA5200 · Pasztet 180g",         suggestedLp: "LP-9141", actualLp: null,      qtyReq: 5,  qtyPicked: 0,  status: "pending",     loc: ["WH-Factory-A","Dispatch","FG-02"], fefoDev: false },
    { seq: 7,  product: "FA5100 · Kiełbasa śląska 450g", suggestedLp: "LP-9129", actualLp: "LP-9129", qtyReq: 40, qtyPicked: 20, status: "short",       loc: ["WH-Factory-A","Dispatch","FG-01"], shortReason: "insufficient_stock_at_pick", shortfall: 20 },
  ],
  sos: ["SO-2026-2451","SO-2026-2448","SO-2026-2443","SO-2026-2447"],
};

// ----- Wave builder (SHIP-013) -----
const SH_AVAILABLE_SOS = [
  { so: "SO-2026-2450", customer: "Sainsbury's",          lines: 5, allocPct: 100, shipDate: "2026-04-23", zone: "Dispatch" },
  { so: "SO-2026-2443", customer: "Auchan Polska",        lines: 2, allocPct: 100, shipDate: "2026-04-23", zone: "Dispatch" },
  { so: "SO-2026-2454", customer: "Makro Cash & Carry",   lines: 1, allocPct: 100, shipDate: "2026-04-24", zone: "Dispatch" },
  { so: "SO-2026-2455", customer: "Tesco Stores Ltd.",    lines: 3, allocPct: 100, shipDate: "2026-04-24", zone: "Dispatch" },
  { so: "SO-2026-2456", customer: "Lidl Polska",          lines: 4, allocPct: 100, shipDate: "2026-04-24", zone: "Dispatch" },
];

const SH_WAVES = {
  unreleased: [
    { wave: "WV-2026-00017", sos: 2, lines: 7, pickers: 0, totalQty: "94 cwt", zones: ["Dispatch"], eta: "~25 min" },
  ],
  released: [
    { wave: "WV-2026-00016", sos: 3, lines: 11, pickers: 1, totalQty: "148 cwt", zones: ["Dispatch"], eta: "~45 min", releasedAt: "14:02" },
  ],
  inPick: [
    { wave: "WV-2026-00015", sos: 6, lines: 22, pickers: 1, totalQty: "312 cwt", zones: ["Dispatch","Cold"], eta: "~18 min", progress: 82 },
  ],
  completed: [
    { wave: "WV-2026-00014", sos: 3, lines: 14, pickers: 1, totalQty: "180 cwt", zones: ["Dispatch"], eta: "Done", completedAt: "12:14" },
    { wave: "WV-2026-00013", sos: 4, lines: 18, pickers: 2, totalQty: "240 cwt", zones: ["Dispatch","Cold"], eta: "Done", completedAt: "10:12" },
  ],
};

// ----- Packing stations (SHIP-017) -----
const SH_STATIONS = [
  { id: "PS-01", name: "Packing station 1 (Ambient)", zone: "Dispatch", printer: "ZPL-SH-01", online: true,  busy: true,  shipment: "SH-2026-00046", boxes: 2, totalBoxes: 4 },
  { id: "PS-02", name: "Packing station 2 (Cold)",    zone: "Cold",     printer: "ZPL-SH-02", online: false, busy: true,  shipment: "SH-2026-00047", boxes: 1, totalBoxes: 3 },
  { id: "PS-03", name: "Packing station 3 (Pallet)",  zone: "Dispatch", printer: "ZPL-SH-03", online: true,  busy: false, shipment: null, boxes: 0, totalBoxes: 0 },
];

// ----- Packing station subject (PS-01 packing SO-2026-2447 for Biedronka) -----
const SH_PACK_SESSION = {
  station: { id: "PS-01", name: "Packing station 1 (Ambient)", printer: "ZPL-SH-01" },
  shipment: "SH-2026-00046",
  so: "SO-2026-2447",
  customer: "Biedronka (JMP)",
  status: "packing",
  boxesPlanned: 4,
  boxesClosed: 2,
  totalWeight: 56.8,
  queue: [
    { lp: "LP-9155", product: "FA5200 · Pasztet 180g",  qty: 40, batch: "WO-2026-0100-B1", expiry: "2026-06-18", so: "SO-2026-2447", weight: 7.2 },
    { lp: "LP-9156", product: "FA5200 · Pasztet 180g",  qty: 40, batch: "WO-2026-0100-B1", expiry: "2026-06-18", so: "SO-2026-2447", weight: 7.2 },
    { lp: "LP-9160", product: "FA5100 · Kiełbasa 450g", qty: 24, batch: "WO-2026-0108-B1", expiry: "2026-06-14", so: "SO-2026-2447", weight: 10.8 },
    { lp: "LP-9161", product: "FA5100 · Kiełbasa 450g", qty: 24, batch: "WO-2026-0108-B1", expiry: "2026-06-14", so: "SO-2026-2447", weight: 10.8 },
    { lp: "LP-9170", product: "FA5301 · Pierogi 1kg",   qty: 20, batch: "WO-2026-0112-B1", expiry: "2026-05-22", so: "SO-2026-2447", weight: 20.0 },
  ],
  activeBox: {
    boxNum: 3,
    sscc: null,
    weight: 0,
    dims: { l: 60, w: 40, h: 30 },
    items: [
      { lp: "LP-9160", product: "FA5100 · Kiełbasa 450g", qty: 24, batch: "WO-2026-0108-B1", expiry: "2026-06-14", weightMode: "catch", nominalKg: 10.8, actualKg: 11.0 },
    ],
  },
  closedBoxes: [
    { boxNum: 1, sscc: "0 5012345 00000045 7", weight: 18.4, itemCount: 2, contents: "FA5200 × 80" },
    { boxNum: 2, sscc: "0 5012345 00000046 4", weight: 19.8, itemCount: 2, contents: "FA5200 × 40 + FA5301 × 10" },
  ],
};

// ----- Shipments list (SHIP-028 base + fleet) -----
const SH_SHIPMENTS = [
  { shipment: "SH-2026-00047", so: "SO-2026-2447", customer: "Biedronka (JMP)",   status: "packing",   boxes: "1/3", weight: "—",       carrier: "Raben Polska",    pro: "—",              ssccGenerated: 1, bolStatus: "—" },
  { shipment: "SH-2026-00046", so: "SO-2026-2447", customer: "Biedronka (JMP)",   status: "packing",   boxes: "2/4", weight: "56.8 kg", carrier: "Raben Polska",    pro: "—",              ssccGenerated: 2, bolStatus: "—" },
  { shipment: "SH-2026-00045", so: "SO-2026-2445", customer: "Lidl Polska",       status: "shipped",   boxes: "4/4", weight: "124.6 kg", carrier: "DHL Freight",    pro: "DHLPL44189",     ssccGenerated: 4, bolStatus: "signed", shippedAt: "2026-04-21 11:18" },
  { shipment: "SH-2026-00044", so: "SO-2026-2442", customer: "Tesco Stores Ltd.", status: "delivered", boxes: "3/3", weight: "86.4 kg",  carrier: "Wincanton",       pro: "WIN2026-5510",   ssccGenerated: 3, bolStatus: "signed", shippedAt: "2026-04-20 09:45", deliveredAt: "2026-04-20 16:22" },
  { shipment: "SH-2026-00043", so: "SO-2026-2444", customer: "Morrisons",         status: "shipped",   boxes: "2/2", weight: "52.0 kg",  carrier: "Wincanton",       pro: "WIN2026-5511",   ssccGenerated: 2, bolStatus: "pending", shippedAt: "2026-04-21 08:10" },
  { shipment: "SH-2026-00042", so: "SO-2026-2441", customer: "Sainsbury's",       status: "delivered", boxes: "6/6", weight: "142.4 kg", carrier: "Wincanton",       pro: "WIN2026-5509",   ssccGenerated: 6, bolStatus: "signed", shippedAt: "2026-04-20 07:30", deliveredAt: "2026-04-20 14:12" },
  { shipment: "SH-2026-00041", so: "SO-2026-2446", customer: "Tesco Stores Ltd.", status: "packed",    boxes: "4/4", weight: "92.6 kg",  carrier: "Wincanton",       pro: "—",              ssccGenerated: 4, bolStatus: "pending" },
];

// ----- SSCC queue (SHIP-019) -----
const SH_SSCCS = [
  { sscc: "0 5012345 00000048 1", shipment: "SH-2026-00046", box: 2, customer: "Biedronka (JMP)",   generatedAt: "2026-04-21 14:08", printed: false, printer: "ZPL-SH-01" },
  { sscc: "0 5012345 00000047 8", shipment: "SH-2026-00046", box: 1, customer: "Biedronka (JMP)",   generatedAt: "2026-04-21 14:05", printed: false, printer: "ZPL-SH-01" },
  { sscc: "0 5012345 00000046 4", shipment: "SH-2026-00045", box: 4, customer: "Lidl Polska",       generatedAt: "2026-04-21 11:00", printed: true,  printer: "ZPL-SH-01" },
  { sscc: "0 5012345 00000045 7", shipment: "SH-2026-00045", box: 3, customer: "Lidl Polska",       generatedAt: "2026-04-21 10:58", printed: true,  printer: "ZPL-SH-01" },
  { sscc: "0 5012345 00000044 0", shipment: "SH-2026-00045", box: 2, customer: "Lidl Polska",       generatedAt: "2026-04-21 10:55", printed: true,  printer: "ZPL-SH-01" },
  { sscc: "0 5012345 00000043 3", shipment: "SH-2026-00045", box: 1, customer: "Lidl Polska",       generatedAt: "2026-04-21 10:52", printed: true,  printer: "ZPL-SH-01" },
  { sscc: "0 5012345 00000042 5", shipment: "SH-2026-00041", box: 4, customer: "Tesco Stores Ltd.", generatedAt: "2026-04-21 09:44", printed: false, printer: "ZPL-SH-02", printError: true },
  { sscc: "0 5012345 00000041 8", shipment: "SH-2026-00041", box: 3, customer: "Tesco Stores Ltd.", generatedAt: "2026-04-21 09:42", printed: false, printer: "ZPL-SH-02", printError: true },
];

// ----- Documents hub (SHIP-025) -----
const SH_DOCS_SLIPS = [
  { shipment: "SH-2026-00045", so: "SO-2026-2445", customer: "Lidl Polska",       generated: "2026-04-21 11:05", version: 1, allergenLabelled: true,  status: "printed",   hash: "a3f7c2e8" },
  { shipment: "SH-2026-00044", so: "SO-2026-2442", customer: "Tesco Stores Ltd.", generated: "2026-04-20 09:50", version: 2, allergenLabelled: true,  status: "printed",   hash: "b5d912ff", stale: true },
  { shipment: "SH-2026-00042", so: "SO-2026-2441", customer: "Sainsbury's",       generated: "2026-04-20 07:35", version: 1, allergenLabelled: true,  status: "printed",   hash: "c8e033aa" },
  { shipment: "SH-2026-00043", so: "SO-2026-2444", customer: "Morrisons",         generated: "2026-04-21 08:15", version: 1, allergenLabelled: true,  status: "pending",   hash: "d0a14b22" },
  { shipment: "SH-2026-00041", so: "SO-2026-2446", customer: "Tesco Stores Ltd.", generated: "—",                version: 0, allergenLabelled: false, status: "missing",   hash: null },
];

const SH_DOCS_BOLS = [
  { shipment: "SH-2026-00045", so: "SO-2026-2445", customer: "Lidl Polska",       generated: "2026-04-21 11:10", signed: "signed", retainedUntil: "2033-04-21", hash: "f3e1a9d2", signedHash: "a12c78be" },
  { shipment: "SH-2026-00044", so: "SO-2026-2442", customer: "Tesco Stores Ltd.", generated: "2026-04-20 09:52", signed: "signed", retainedUntil: "2033-04-20", hash: "e4c2b801", signedHash: "9de110b7" },
  { shipment: "SH-2026-00042", so: "SO-2026-2441", customer: "Sainsbury's",       generated: "2026-04-20 07:38", signed: "signed", retainedUntil: "2033-04-20", hash: "d5b3cf12", signedHash: "82a904e1" },
  { shipment: "SH-2026-00043", so: "SO-2026-2444", customer: "Morrisons",         generated: "2026-04-21 08:18", signed: "pending", retainedUntil: "2033-04-21", hash: "c6a4ea23", signedHash: null },
  { shipment: "SH-2026-00041", so: "SO-2026-2446", customer: "Tesco Stores Ltd.", generated: "—",                signed: "not_req", retainedUntil: "—",         hash: null,       signedHash: null },
];

// ----- Carriers (SHIP-014b) -----
const SH_CARRIERS = [
  { id: 1, name: "DHL Freight",      service: "Express 24h",  rateBasis: "Weight", api: "Not connected (P2)", isDefault: true,  active: true,  trackingTemplate: "https://dhl.com/track/{pro}" },
  { id: 2, name: "Raben Polska",     service: "Economy 48h",  rateBasis: "Zone",   api: "Not connected (P2)", isDefault: false, active: true,  trackingTemplate: "https://raben.pl/track/{pro}" },
  { id: 3, name: "Wincanton",        service: "Next day",     rateBasis: "Manual", api: "Not connected (P2)", isDefault: false, active: true,  trackingTemplate: "—" },
  { id: 4, name: "Rohlig SUUS",      service: "Standard 72h", rateBasis: "Zone",   api: "Not connected (P2)", isDefault: false, active: true,  trackingTemplate: "—" },
  { id: 5, name: "DPD Polska",       service: "Next day",     rateBasis: "Weight", api: "Not connected (P2)", isDefault: false, active: false, trackingTemplate: "https://dpd.pl/track/{pro}" },
];

// ----- RMA (SHIP-026) -----
const SH_RMAS = [
  { rma: "RMA-2026-00012", so: "SO-2026-2432", customer: "Lidl Polska",       reason: "Damaged in transit", lines: 1, status: "Open",       created: "2026-04-21 11:00", disposition: "Pending" },
  { rma: "RMA-2026-00011", so: "SO-2026-2428", customer: "Biedronka",          reason: "Wrong item",          lines: 2, status: "In Transit", created: "2026-04-20 14:18", disposition: "Pending" },
  { rma: "RMA-2026-00010", so: "SO-2026-2420", customer: "Tesco Stores Ltd.", reason: "Quality issue",      lines: 1, status: "Received",   created: "2026-04-18 09:22", disposition: "Pending" },
  { rma: "RMA-2026-00009", so: "SO-2026-2410", customer: "Sainsbury's",       reason: "Overshipment",       lines: 1, status: "Closed",     created: "2026-04-10 10:00", disposition: "Pass" },
];

// ----- Shipping override reasons (02-SETTINGS §8 reference) -----
const SH_OVERRIDE_REASONS = {
  fefo_deviation:   ["physical_accessibility","batch_exhaustion","qa_release","customer_requested","other"],
  expired_lp:       ["supervisor_direction","customer_requested","sample_use","other"],
  quality_override: ["quality_override_approved","supervisor_direction","customer_requested","other"],
  short_pick:       ["insufficient_stock_at_pick","lp_damaged","lp_missing","other"],
  partial:          ["customer_requested","ops_decision","stock_out","other"],
  hold_place:       ["credit_limit_exceeded","credit_review","pending_allergen_review","qa_open_non_conformance","manual_manager","other"],
  hold_release:     ["credit_cleared","allergen_cleared","qa_cleared","manager_override","other"],
  cancel:           ["customer_request","duplicate_order","out_of_stock","pricing_error","supplier_issue","other"],
  reprint:          ["damage","lost","reissue","printer_error","other"],
};

// ----- Shipping settings (SHIP-023) -----
const SH_SETTINGS = {
  allocation: {
    defaultStrategy: "FEFO",
    autoAllocateOnConfirm: true,
    partialAllocation: true,
    autoCreateBackorder: false,
    expiredLpOverride: false,
  },
  wave: {
    waveReleaseCutoff: "14:00",
    maxSosPerWave: 50,
    defaultPriority: 3,
    shortPickDefault: "Prompt picker",
  },
  labels: {
    gs1Prefix: "5012345",
    ssccExtensionDigit: 0,
    currentSequence: 48,
    labelTemplate: "Default GS1-128",
    slipTemplate: "Default EU 1169/2011",
    bolTemplate: "Default BRCGS",
  },
  d365: {
    dataAreaId: "FNOR",
    warehouse: "ApexDG",
    glAccount: "FinGoods",
    approver: "APX100048",
    shippingFlag: true,
    dlqCount: 1,
  },
  advanced: {
    creditWarningPct: 80,
    eudrGate: false,
    rlsDebug: false,
  },
};

const SH_PRINTERS = [
  { id: "ZPL-SH-01", name: "ZPL Packing PS-01 (Ambient)", ip: "10.1.2.41", online: true },
  { id: "ZPL-SH-02", name: "ZPL Packing PS-02 (Cold)",    ip: "10.1.2.42", online: false },
  { id: "ZPL-SH-03", name: "ZPL Packing PS-03 (Pallet)",  ip: "10.1.2.43", online: true },
  { id: "ZPL-SH-04", name: "ZPL Dispatch BOL printer",    ip: "10.1.2.44", online: true },
];

Object.assign(window, {
  SH_NAV, SH_KPIS_ROW1, SH_KPIS_ROW2, SH_ALERTS, SH_ACTIVITY,
  SH_CUSTOMERS, SH_CUSTOMER_DETAIL, SH_ALLERGENS,
  SH_SOS, SH_SO_DETAIL, SH_ALLOC_GLOBAL, SH_LP_CANDIDATES,
  SH_PICKS, SH_PICK_DETAIL, SH_AVAILABLE_SOS, SH_WAVES,
  SH_STATIONS, SH_PACK_SESSION,
  SH_SHIPMENTS, SH_SSCCS, SH_DOCS_SLIPS, SH_DOCS_BOLS,
  SH_CARRIERS, SH_RMAS,
  SH_OVERRIDE_REASONS, SH_SETTINGS, SH_PRINTERS,
});
