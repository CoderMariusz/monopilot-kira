// ============ Settings DATA ============

window.SETTINGS_NAV = [
  { group: "Organization", admin: true, items: [
    { key: "profile",    label: "Company profile", ic: "◆" },
    { key: "sites",      label: "Sites & lines",   ic: "▤" },
    { key: "warehouses", label: "Warehouses",      ic: "▥" },
    { key: "shifts",     label: "Shifts & calendar", ic: "⧗" }
  ]},
  { group: "Data", admin: true, items: [
    { key: "products",  label: "Products & SKUs", ic: "▢" },
    { key: "boms",      label: "BOMs & recipes",  ic: "⛓" },
    { key: "partners",  label: "Suppliers & customers", ic: "↔" },
    { key: "units",     label: "Units & conversions", ic: "⚖" }
  ]},
  { group: "Access", admin: true, items: [
    { key: "users",     label: "Users & roles",   ic: "◉" },
    { key: "security",  label: "Security",        ic: "🔒" }
  ]},
  { group: "Operations", admin: true, items: [
    { key: "devices",   label: "Scanner devices", ic: "📱" },
    { key: "notifications", label: "Notifications", ic: "◔" },
    { key: "features",  label: "Feature flags",   ic: "◨" }
  ]},
  { group: "Integrations", admin: true, items: [
    { key: "integrations", label: "Integrations", ic: "⇄" }
  ]},
  { group: "Document templates", admin: true, items: [
    { key: "labels",    label: "Label templates", ic: "▭", highlight: true }
  ]},
  { group: "Onboarding", admin: true, items: [
    { key: "onboarding",     label: "Onboarding wizard",  ic: "✦", highlight: true }
  ]},
  { group: "Admin", admin: true, items: [
    { key: "d365-conn",      label: "D365 connection",    ic: "⇆" },
    { key: "d365-mapping",   label: "D365 field mapping", ic: "↔" },
    { key: "d365-dlq",       label: "D365 DLQ (shipping)", ic: "!" },
    { key: "rules",          label: "Rules registry",     ic: "✦" },
    { key: "flags",          label: "Feature flags (L)",  ic: "◨" },
    { key: "schema",         label: "Schema browser",     ic: "▦" },
    { key: "reference",      label: "Reference data",     ic: "⚙" },
    { key: "email-config",   label: "Email templates",    ic: "✉" },
    { key: "email-vars",     label: "Email variables",    ic: "§" },
    { key: "ship-override-reasons", label: "Shipping override reasons", ic: "≡" },
    { key: "gallery",        label: "Modal gallery",      ic: "◇" }
  ]},
  { group: "My account", admin: false, items: [
    { key: "my-profile",       label: "My profile",       ic: "◯" },
    { key: "my-notifications", label: "Notifications",    ic: "◔" }
  ]}
];

// Users for the Users screen
window.SETTINGS_USERS = [
  { id: 1, name: "Krzysztof Nowak",     email: "k.nowak@forz.pl",        role: "Admin",    status: "active", site: "Kraków HQ", last: "2h ago",  init: "KN", color: "av-blue" },
  { id: 2, name: "Magdalena Wiśniewska", email: "m.wisniewska@forz.pl",  role: "Manager",  status: "active", site: "Kraków HQ", last: "1h ago",  init: "MW", color: "av-violet" },
  { id: 3, name: "Tomasz Kowalski",      email: "t.kowalski@forz.pl",    role: "Manager",  status: "active", site: "Wrocław",   last: "Today",   init: "TK", color: "av-green" },
  { id: 4, name: "Anna Zając",           email: "a.zajac@forz.pl",       role: "Manager",  status: "active", site: "Kraków HQ", last: "Yesterday", init: "AZ", color: "av-amber" },
  { id: 5, name: "Jan Lewandowski",      email: "j.lewandowski@forz.pl", role: "Operator", status: "active", site: "Kraków HQ", last: "30m ago", init: "JL", color: "av-teal" },
  { id: 6, name: "Ewa Piotrowska",       email: "e.piotrowska@forz.pl",  role: "Operator", status: "active", site: "Wrocław",   last: "4h ago",  init: "EP", color: "av-pink" },
  { id: 7, name: "Paweł Szymański",      email: "p.szymanski@forz.pl",   role: "Operator", status: "active", site: "Wrocław",   last: "Today",   init: "PS", color: "av-blue" },
  { id: 8, name: "Barbara Woźniak",      email: "b.wozniak@forz.pl",     role: "Viewer",   status: "active", site: "Kraków HQ", last: "3d ago",  init: "BW", color: "av-violet" },
  { id: 9, name: "Marek Dąbrowski",      email: "m.dabrowski@forz.pl",   role: "Operator", status: "invited", site: "Kraków HQ", last: "—",      init: "MD", color: "av-green" },
  { id: 10, name: "Katarzyna Nowacka",   email: "k.nowacka@forz.pl",     role: "Viewer",   status: "disabled", site: "Wrocław", last: "62d ago", init: "KN", color: "av-amber" }
];

// Sites
window.SETTINGS_SITES = [
  { id: "S1", name: "Kraków HQ",   addr: "ul. Zakładowa 12, Kraków, PL", lines: 4, workers: 48, primary: true, x: 60, y: 55 },
  { id: "S2", name: "Wrocław Plant", addr: "ul. Produkcyjna 8, Wrocław, PL", lines: 2, workers: 22, primary: false, x: 32, y: 45 }
];

window.SETTINGS_LINES = [
  { id: "L1", site: "S1", name: "Line 1 — Nuggets & breaded", type: "Meat processing", workers: 12, status: "active" },
  { id: "L2", site: "S1", name: "Line 2 — Slicing & MAP",     type: "Cold cuts",       workers: 10, status: "active" },
  { id: "L3", site: "S1", name: "Line 3 — Smokehouse",         type: "Smoked",          workers: 8,  status: "active" },
  { id: "L4", site: "S1", name: "Line 4 — Pâté & jars",        type: "Pâté",            workers: 6,  status: "maintenance" },
  { id: "L5", site: "S2", name: "Line A — Dairy mix",          type: "Dairy",           workers: 11, status: "active" },
  { id: "L6", site: "S2", name: "Line B — Yogurt filling",     type: "Dairy",           workers: 7,  status: "active" }
];

// Integrations — per 02-SETTINGS PRD §11 (D365) and §4 (API keys)
// Prunes prior catalog (SAP/Xero/Shopify/etc.) that had no PRD backing.
window.SETTINGS_INTEGRATIONS = [
  { cat: "ERP", items: [
    { name: "Microsoft Dynamics 365",
      desc: "Items + BOM pull (nightly), production confirmations + shipment + finance push (outbox). Constants: FNOR / ForzDG / FinGoods / FOR100048 / FProd01.",
      status: "connected", logo: "D365", color: "#7719aa" }
  ]},
  { cat: "Invoicing", items: [
    { name: "Peppol / EU e-invoicing",
      desc: "Outbound e-invoice endpoint (10-FIN Phase 2). Provisioned via D365 customer master.",
      status: "available", logo: "Pep", color: "#b11e78" }
  ]},
  { cat: "Developer", items: [
    { name: "API keys",
      desc: "HMAC-signed tokens + scoped webhooks (SET-023). Rotation + delivery log.",
      status: "connected", logo: "API", color: "#374151" }
  ]}
];

// Label template elements (for the editor)
window.SETTINGS_LABEL_ELEMENTS_DEFAULT = [
  { id: "e1", type: "text",    x: 12, y: 12, w: 260, h: 22, content: "{{product.name}}",       font: 16, weight: 700 },
  { id: "e2", type: "text",    x: 12, y: 38, w: 180, h: 18, content: "Net weight: {{weight}}g", font: 11, weight: 400 },
  { id: "e3", type: "barcode", x: 12, y: 90, w: 220, h: 58, content: "{{sku}}" },
  { id: "e4", type: "text",    x: 12, y: 160, w: 260, h: 16, content: "Best before: {{bbd}}",  font: 10, weight: 500 },
  { id: "e5", type: "text",    x: 12, y: 180, w: 260, h: 16, content: "Lot: {{lot}}",          font: 10, weight: 400 },
  { id: "e6", type: "qr",      x: 240, y: 90, w: 50,  h: 50, content: "{{url}}" },
  { id: "e7", type: "logo",    x: 240, y: 12, w: 50,  h: 50, content: "Monopilot" }
];

window.SETTINGS_LABEL_TEMPLATES = [
  { id: "LT-001", name: "Standard pack label", size: "60×40mm", updated: "2025-11-20", used: 12 },
  { id: "LT-002", name: "Cold cut slim pack",  size: "80×30mm", updated: "2025-12-02", used: 5 },
  { id: "LT-003", name: "Pallet label",         size: "105×148mm", updated: "2025-10-14", used: 8 },
  { id: "LT-004", name: "Case label (DHL)",     size: "100×150mm", updated: "2025-12-09", used: 3 }
];

// Role perms matrix
window.SETTINGS_ROLES = ["Admin", "Manager", "Operator", "Viewer"];
window.SETTINGS_MODULES = [
  "Dashboard", "Planning", "Production", "Warehouse", "Scanner", "Quality", "Shipping", "NPD", "Finance", "OEE", "Settings"
];
window.SETTINGS_PERMS = {
  // module: { Admin, Manager, Operator, Viewer }
  "Dashboard":   { Admin: "admin", Manager: "rw", Operator: "r", Viewer: "r" },
  "Planning":    { Admin: "admin", Manager: "rw", Operator: "r", Viewer: "r" },
  "Production":  { Admin: "admin", Manager: "rw", Operator: "rw", Viewer: "r" },
  "Warehouse":   { Admin: "admin", Manager: "rw", Operator: "rw", Viewer: "r" },
  "Scanner":     { Admin: "admin", Manager: "rw", Operator: "rw", Viewer: "none" },
  "Quality":     { Admin: "admin", Manager: "rw", Operator: "r", Viewer: "r" },
  "Shipping":    { Admin: "admin", Manager: "rw", Operator: "r", Viewer: "r" },
  "NPD":         { Admin: "admin", Manager: "rw", Operator: "none", Viewer: "r" },
  "Finance":     { Admin: "admin", Manager: "r", Operator: "none", Viewer: "r" },
  "OEE":         { Admin: "admin", Manager: "rw", Operator: "r", Viewer: "r" },
  "Settings":    { Admin: "admin", Manager: "none", Operator: "none", Viewer: "none" }
};

window.SETTINGS_SHIFTS = [
  { id: "SH1", name: "Morning",   time: "06:00 – 14:00", days: "Mon–Fri", workers: 24 },
  { id: "SH2", name: "Afternoon", time: "14:00 – 22:00", days: "Mon–Fri", workers: 18 },
  { id: "SH3", name: "Night",     time: "22:00 – 06:00", days: "Mon–Thu", workers: 10 },
  { id: "SH4", name: "Weekend",   time: "08:00 – 16:00", days: "Sat–Sun", workers: 6 }
];

window.SETTINGS_DEVICES = [
  { id: "DEV-001", name: "Handheld #01", model: "Zebra TC22", site: "Kraków HQ", line: "Line 1", user: "J. Lewandowski", last: "2m ago",  battery: 78, status: "online" },
  { id: "DEV-002", name: "Handheld #02", model: "Zebra TC22", site: "Kraków HQ", line: "Line 2", user: "—",             last: "18m ago", battery: 52, status: "idle" },
  { id: "DEV-003", name: "Handheld #03", model: "Zebra TC22", site: "Kraków HQ", line: "Warehouse", user: "E. Piotrowska", last: "1m ago", battery: 91, status: "online" },
  { id: "DEV-004", name: "Handheld #04", model: "Honeywell CK65", site: "Wrocław", line: "Line A", user: "P. Szymański", last: "5m ago", battery: 63, status: "online" },
  { id: "DEV-005", name: "Tablet #01",   model: "Samsung Tab A8", site: "Kraków HQ", line: "Line 3", user: "—",           last: "3d ago",  battery: 0,  status: "offline" }
];

window.SETTINGS_FEATURES = [
  { key: "npd",       label: "NPD module",             desc: "New product development pipeline with recipe formulation.",   on: true,  premium: true },
  { key: "oee",       label: "OEE analytics",           desc: "Overall equipment effectiveness tracking & charts.",         on: true,  premium: true },
  { key: "finance",   label: "Finance module",          desc: "COGS, invoicing export, cost centers.",                      on: true,  premium: true },
  { key: "sensory",   label: "Sensory panel",           desc: "Tasting & scoring tools (inside NPD).",                      on: false, premium: true },
  { key: "traceability", label: "Advanced traceability", desc: "Forward/backward trace across batches.",                   on: true,  premium: false },
  { key: "map_view",  label: "Warehouse map view",       desc: "Visual bin map for the warehouse screen (beta).",           on: false, premium: false, beta: true },
  { key: "ai_forecast", label: "AI demand forecast",     desc: "ML-based 4-week production forecast (early access).",       on: false, premium: true, beta: true },
  { key: "mobile_ops", label: "Mobile ops approvals",    desc: "Approve WOs and POs from mobile app.",                     on: true,  premium: false }
];

window.SETTINGS_NOTIFICATION_RULES = [
  { id: 1, trigger: "WO behind schedule",          channel: ["email", "in-app"], audience: "Planning managers",   on: true },
  { id: 2, trigger: "Material shortage forecast",  channel: ["email"],           audience: "Warehouse + Planning", on: true },
  { id: 3, trigger: "Quality test failed",         channel: ["email", "in-app", "SMS"], audience: "QA team",     on: true },
  { id: 4, trigger: "NPD approval requested",      channel: ["email", "in-app"], audience: "NPD manager",         on: true },
  { id: 5, trigger: "Device offline > 30 min",     channel: ["in-app"],          audience: "IT / Admin",          on: false },
  { id: 6, trigger: "Daily production summary",    channel: ["email"],           audience: "Plant director",      on: true },
  { id: 7, trigger: "Pallet near expiry (7 days)", channel: ["email"],           audience: "Warehouse",           on: true },
  { id: 8, trigger: "Failed login attempts ≥ 5",   channel: ["email"],           audience: "Admins",              on: true }
];

window.SETTINGS_UOM = [
  { code: "kg", name: "Kilogram", cat: "Weight",  base: true, factor: 1 },
  { code: "g",  name: "Gram",     cat: "Weight",  base: false, factor: 0.001 },
  { code: "t",  name: "Tonne",    cat: "Weight",  base: false, factor: 1000 },
  { code: "l",  name: "Litre",    cat: "Volume",  base: true,  factor: 1 },
  { code: "ml", name: "Millilitre", cat: "Volume", base: false, factor: 0.001 },
  { code: "pc", name: "Piece",    cat: "Count",   base: true,  factor: 1 },
  { code: "pk", name: "Pack",     cat: "Count",   base: false, factor: 1 },
  { code: "crt",name: "Crate",    cat: "Count",   base: false, factor: 12 },
  { code: "plt",name: "Pallet",   cat: "Count",   base: false, factor: 540 }
];

window.SETTINGS_PARTNERS = [
  { id: "SUP-101", type: "Supplier", name: "Polskie Mięso Sp. z o.o.", contact: "Jan Bąk",     email: "jan.bak@polmieso.pl",  country: "PL", since: "2018", status: "active" },
  { id: "SUP-102", type: "Supplier", name: "Przyprawy Nowak",         contact: "Ewa Nowak",    email: "ewa@przyprawynowak.pl", country: "PL", since: "2020", status: "active" },
  { id: "SUP-103", type: "Supplier", name: "Coveris Polska",           contact: "Marcin Ziel", email: "m.ziel@coveris.com",   country: "PL", since: "2019", status: "active" },
  { id: "SUP-104", type: "Supplier", name: "Amcor Flexibles",          contact: "Sophie Klein", email: "s.klein@amcor.com",   country: "DE", since: "2021", status: "active" },
  { id: "CUS-201", type: "Customer", name: "Carrefour Polska",         contact: "Anna Kruk",    email: "anna.kruk@carrefour.pl", country: "PL", since: "2019", status: "active" },
  { id: "CUS-202", type: "Customer", name: "Auchan PL",                contact: "Tomasz Bień",  email: "t.bien@auchan.pl",      country: "PL", since: "2020", status: "active" },
  { id: "CUS-203", type: "Customer", name: "Lidl PL",                  contact: "Piotr Maj",    email: "p.maj@lidl.pl",         country: "PL", since: "2022", status: "active" },
  { id: "CUS-204", type: "Customer", name: "HoReCa Direct",            contact: "—",            email: "orders@horecadirect.pl", country: "PL", since: "2023", status: "active" }
];

window.SETTINGS_PRODUCTS = [
  { sku: "SKU-2451", name: "Sliced Ham 200g",                cat: "Cold cut",   uom: "pk", weight: "200g", bom: "BOM-238", status: "active",  line: "Line 2" },
  { sku: "SKU-2317", name: "Sliced Roasted Chicken 160g",    cat: "Cold cut",   uom: "pk", weight: "160g", bom: "BOM-221", status: "development", line: "Line 2" },
  { sku: "SKU-2108", name: "Chicken Nuggets 1kg",            cat: "Breaded",    uom: "pk", weight: "1kg",  bom: "BOM-180", status: "active",  line: "Line 1" },
  { sku: "SKU-2109", name: "Chicken Nuggets 500g",           cat: "Breaded",    uom: "pk", weight: "500g", bom: "BOM-181", status: "active",  line: "Line 1" },
  { sku: "SKU-2033", name: "Pork Sausages 500g",             cat: "Sausage",    uom: "pk", weight: "500g", bom: "BOM-150", status: "active",  line: "Line 2" },
  { sku: "SKU-2205", name: "Fish Fingers 500g",              cat: "Breaded",    uom: "pk", weight: "500g", bom: "BOM-192", status: "active",  line: "Line 2" },
  { sku: "SKU-3112", name: "Turkey Breast Pastrami 150g",    cat: "Cold cut",   uom: "pk", weight: "150g", bom: "BOM-225", status: "active",  line: "Line 2" },
  { sku: "SKU-3114", name: "Pork Neck Smoked 250g",          cat: "Smoked",     uom: "pk", weight: "250g", bom: "BOM-230", status: "pilot",   line: "Line 3" }
];

window.SETTINGS_BOMS = [
  { id: "BOM-238", product: "Sliced Ham 200g",           version: "v1",  ingredients: 10, updated: "2025-12-14", status: "active" },
  { id: "BOM-221", product: "Sliced Roasted Chicken 160g", version: "v0.4 draft", ingredients: 8, updated: "2025-12-12", status: "draft" },
  { id: "BOM-180", product: "Chicken Nuggets 1kg",       version: "v3",  ingredients: 14, updated: "2025-10-02", status: "active" },
  { id: "BOM-181", product: "Chicken Nuggets 500g",      version: "v3",  ingredients: 14, updated: "2025-10-02", status: "active" },
  { id: "BOM-150", product: "Pork Sausages 500g",        version: "v2",  ingredients: 11, updated: "2025-08-18", status: "active" }
];
