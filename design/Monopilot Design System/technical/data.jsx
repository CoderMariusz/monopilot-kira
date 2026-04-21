// ============ Technical module data ============

const TECH_NAV = [
  { group: "Overview", items: [
    { key: "dashboard", label: "Dashboard", ic: "◇" },
  ]},
  { group: "Products", items: [
    { key: "boms", label: "BOMs & recipes", ic: "▦", hero: true },
    { key: "materials", label: "Materials", ic: "⬢" },
    { key: "specs", label: "Product specifications", ic: "☰" },
    { key: "nutrition", label: "Nutrition panel", ic: "♥" },
    { key: "allergens", label: "Allergen matrix", ic: "!" },
    { key: "shelflife", label: "Shelf life", ic: "⧗" },
  ]},
  { group: "Cost & trace", items: [
    { key: "costing", label: "Recipe costing", ic: "$" },
    { key: "costhist", label: "Cost history", ic: "∿" },
    { key: "trace", label: "Traceability search", ic: "⌕" },
  ]},
  { group: "Process", items: [
    { key: "routings", label: "Routings", ic: "→" },
    { key: "params", label: "Process parameters", ic: "◉" },
    { key: "workcenters", label: "Work centers", ic: "▣" },
  ]},
  { group: "Change & revision", items: [
    { key: "eco", label: "Change control (ECO)", ic: "⇄" },
    { key: "history", label: "Revision history", ic: "⧖" },
  ]},
  { group: "Equipment", items: [
    { key: "maintenance", label: "Maintenance plans", ic: "⚒" },
    { key: "tooling", label: "Tooling & consumables", ic: "◆" },
  ]},
  { group: "D365 integration", items: [
    { key: "d365status", label: "Sync status", ic: "◎" },
    { key: "d365fields", label: "Field mapping", ic: "⇌" },
    { key: "d365drift", label: "Drift resolution", ic: "△" },
    { key: "d365log", label: "Sync log", ic: "☷" },
  ]},
  { group: "Admin", items: [
    { key: "gallery", label: "Modal gallery", ic: "▢" },
  ]},
];

// --- BOM list (Polish product names; cured meats / ready meals plant) ---
const BOM_LIST = [
  { id: "B-0421", name: "Kiełbasa śląska pieczona 450g", category: "Cured meat", status: "active", version: "v7", levels: 4,
    comps: 14, cost: 11.82, yield: 0.91, updated: "2026-04-14", owner: "A. Majewska" },
  { id: "B-0412", name: "Pasztet drobiowy z żurawiną 180g", category: "Deli", status: "active", version: "v3", levels: 3,
    comps: 11, cost: 4.16, yield: 0.94, updated: "2026-04-02", owner: "P. Kowalski" },
  { id: "B-0407", name: "Gulasz wołowy 350g (słoik)", category: "Ready meal", status: "active", version: "v5", levels: 3,
    comps: 18, cost: 8.94, yield: 0.88, updated: "2026-03-28", owner: "K. Nowacki" },
  { id: "B-0443", name: "Szynka wędzona plastry 150g", category: "Cured meat", status: "draft", version: "v2", levels: 3,
    comps: 9, cost: 6.08, yield: 0.86, updated: "2026-04-18", owner: "A. Majewska" },
  { id: "B-0388", name: "Filet z kurczaka sous-vide 180g", category: "Deli", status: "active", version: "v4", levels: 2,
    comps: 7, cost: 5.42, yield: 0.93, updated: "2026-03-11", owner: "M. Szymczak" },
  { id: "B-0402", name: "Pierogi z mięsem 400g", category: "Ready meal", status: "active", version: "v9", levels: 4,
    comps: 22, cost: 6.71, yield: 0.89, updated: "2026-04-08", owner: "K. Nowacki" },
  { id: "B-0455", name: "Kabanosy wieprzowe 120g", category: "Cured meat", status: "review", version: "v1", levels: 3,
    comps: 10, cost: 4.78, yield: 0.62, updated: "2026-04-17", owner: "A. Majewska" },
  { id: "B-0381", name: "Klopsiki w sosie pomidorowym 320g", category: "Ready meal", status: "active", version: "v6", levels: 3,
    comps: 17, cost: 5.92, yield: 0.90, updated: "2026-02-20", owner: "M. Szymczak" },
  { id: "B-0420", name: "Boczek parzony plastry 200g", category: "Cured meat", status: "archived", version: "v12", levels: 3,
    comps: 12, cost: 7.33, yield: 0.87, updated: "2025-11-14", owner: "P. Kowalski" },
];

// --- BOM tree (multi-level) for B-0421 Kiełbasa śląska ---
// qty is per 1 kg finished product; scrap is % loss at that step
const BOM_TREE = {
  id: "B-0421", code: "B-0421", name: "Kiełbasa śląska pieczona 450g", yield: "450 g", batch: "100 kg",
  children: [
    { id: "SUB-001", code: "SUB-001", name: "Farsz wieprzowy bazowy", type: "sub-bom", qty: 0.780, uom: "kg", scrap: 1.2, cost: 5.42, level: 1,
      children: [
        { id: "R-1001", code: "R-1001", name: "Wieprzowina kl. II (łopatka)", type: "material", qty: 0.540, uom: "kg", scrap: 0.8, cost: 4.86, supplier: "PM Sokołów", allergen: [] },
        { id: "R-1002", code: "R-1002", name: "Słonina wieprzowa", type: "material", qty: 0.220, uom: "kg", scrap: 0.5, cost: 1.32, supplier: "PM Sokołów", allergen: [] },
        { id: "R-1201", code: "R-1201", name: "Sól peklująca (PP)", type: "material", qty: 0.018, uom: "kg", scrap: 0, cost: 0.12, supplier: "Brenntag", allergen: [], note: "Azotyn 0.6%" },
        { id: "R-1202", code: "R-1202", name: "Woda technologiczna", type: "material", qty: 0.040, uom: "kg", scrap: 0, cost: 0.00, auto: true },
      ] },
    { id: "SUB-002", code: "SUB-002", name: "Mieszanka przypraw A-17", type: "sub-bom", qty: 0.022, uom: "kg", scrap: 0.3, cost: 0.86, level: 1,
      children: [
        { id: "R-2101", code: "R-2101", name: "Pieprz czarny mielony", type: "material", qty: 0.006, uom: "kg", scrap: 0.2, cost: 0.28, supplier: "Kamis B2B", allergen: [] },
        { id: "R-2102", code: "R-2102", name: "Czosnek granulowany", type: "material", qty: 0.008, uom: "kg", scrap: 0.2, cost: 0.22, supplier: "Kamis B2B", allergen: [] },
        { id: "R-2103", code: "R-2103", name: "Gałka muszkatołowa", type: "material", qty: 0.002, uom: "kg", scrap: 0.1, cost: 0.06, supplier: "Kamis B2B", allergen: [] },
        { id: "R-2104", code: "R-2104", name: "Majeranek suszony", type: "material", qty: 0.004, uom: "kg", scrap: 0.1, cost: 0.08, supplier: "Kamis B2B", allergen: [] },
        { id: "R-2105", code: "R-2105", name: "Cukier", type: "material", qty: 0.002, uom: "kg", scrap: 0, cost: 0.02, supplier: "Pfeifer & Langen", allergen: [] },
      ] },
    { id: "R-3001", code: "R-3001", name: "Osłonka białkowa Ø26", type: "material", qty: 0.9, uom: "m", scrap: 2.5, cost: 0.34, supplier: "Viscofan", allergen: [], note: "Certyfikat Halal" },
    { id: "R-3100", code: "R-3100", name: "Dym płynny regal", type: "material", qty: 0.008, uom: "kg", scrap: 0, cost: 0.18, supplier: "Brenntag", allergen: [] },
    { id: "P-9001", code: "P-9001", name: "Folia PA/PE 150µm pakowanie", type: "packaging", qty: 0.045, uom: "kg", scrap: 1.8, cost: 0.22, supplier: "Schur Flexibles", allergen: [] },
    { id: "P-9002", code: "P-9002", name: "Etykieta przód 90×60", type: "packaging", qty: 1, uom: "szt", scrap: 0.8, cost: 0.04, supplier: "Zakład etykiet Łódź", allergen: [] },
    { id: "P-9003", code: "P-9003", name: "Karton zbiorczy 10×450g", type: "packaging", qty: 0.1, uom: "szt", scrap: 0.2, cost: 0.08, supplier: "Smurfit Kappa", allergen: [] },
  ]
};

// --- Routing (operation list) for B-0421 ---
const ROUTING = [
  { n: 10, op: "Rozmrażanie & przygotowanie", wc: "PREP-01", setup: 20, run: 45, uom: "min/batch", resource: "2 op." },
  { n: 20, op: "Rozdrabnianie (wilk Ø8)", wc: "CUT-02", setup: 10, run: 25, uom: "min/batch", resource: "Wilk W-20" },
  { n: 30, op: "Mieszanie z peklosolą", wc: "MIX-01", setup: 5, run: 18, uom: "min/batch", resource: "Mieszarka M-150" },
  { n: 40, op: "Kutrowanie farszu", wc: "CUT-05", setup: 15, run: 22, uom: "min/batch", resource: "Kuter K-2" },
  { n: 50, op: "Nadziewanie w osłonkę", wc: "STUFF-01", setup: 12, run: 55, uom: "min/batch", resource: "Nadziewarka N-300" },
  { n: 60, op: "Osadzanie 60 min 6°C", wc: "HOLD-A", setup: 0, run: 60, uom: "min", resource: "Komora A" },
  { n: 70, op: "Wędzenie (3 fazy)", wc: "SMOKE-01", setup: 20, run: 95, uom: "min", resource: "Wędzarnia W-2" },
  { n: 80, op: "Parzenie 72°C / 28 min", wc: "SMOKE-01", setup: 0, run: 28, uom: "min", resource: "Wędzarnia W-2" },
  { n: 90, op: "Chłodzenie prysznic + komora", wc: "CHILL-02", setup: 5, run: 90, uom: "min", resource: "Komora C-2" },
  { n: 100, op: "Pakowanie MAP + etykieta", wc: "PACK-03", setup: 15, run: 60, uom: "min", resource: "Pakowaczka MAP-2" },
  { n: 110, op: "Detekcja metalu + kontrola wagi", wc: "QC-01", setup: 0, run: 10, uom: "min", resource: "Linia inline" },
];

// --- Process parameters for B-0421 (critical points) ---
const PROCESS_PARAMS = [
  { step: 30, param: "Temperatura farszu przed mieszaniem", target: 2, min: 0, max: 4, uom: "°C", ccp: false },
  { step: 40, param: "Temperatura końcowa kutrowania", target: 10, min: 8, max: 12, uom: "°C", ccp: true },
  { step: 50, param: "Ciśnienie nadziewania", target: 2.2, min: 1.8, max: 2.6, uom: "bar", ccp: false },
  { step: 60, param: "Czas osadzania", target: 60, min: 50, max: 70, uom: "min", ccp: false },
  { step: 70, param: "Temperatura wędzenia — faza 3", target: 65, min: 60, max: 68, uom: "°C", ccp: false },
  { step: 80, param: "Temperatura w centrum produktu", target: 72, min: 72, max: 78, uom: "°C", ccp: true, note: "CCP-2" },
  { step: 80, param: "Czas parzenia po osiągnięciu temp.", target: 28, min: 25, max: 35, uom: "min", ccp: true, note: "CCP-2" },
  { step: 90, param: "Temperatura produktu po chłodzeniu", target: 4, min: 2, max: 6, uom: "°C", ccp: true, note: "CCP-3" },
  { step: 100, param: "Skład atmosfery (O₂)", target: 0.5, min: 0, max: 1, uom: "%", ccp: false },
  { step: 100, param: "Skład atmosfery (CO₂)", target: 30, min: 28, max: 35, uom: "%", ccp: false },
];

// --- Version history ---
const VERSIONS = [
  { v: "v7", date: "2026-04-14", author: "A. Majewska", eco: "ECO-2041", summary: "Zmiana dostawcy osłonek (Viscofan). Koszt −0.06/kg.", current: true },
  { v: "v6", date: "2026-01-22", author: "A. Majewska", eco: "ECO-2012", summary: "Nowy procent czosnku granulowanego (0.8% → 0.9%)." },
  { v: "v5", date: "2025-11-08", author: "P. Kowalski", eco: "ECO-1987", summary: "Aktualizacja parametrów wędzenia: 3 fazy zamiast 2." },
  { v: "v4", date: "2025-08-19", author: "P. Kowalski", eco: "ECO-1954", summary: "Zwiększenie ilości słoniny z 20% do 22%." },
  { v: "v3", date: "2025-05-12", author: "A. Majewska", eco: "ECO-1921", summary: "Zmiana gramatury: 500g → 450g (projekt F26-012)." },
  { v: "v2", date: "2025-02-06", author: "A. Majewska", eco: "ECO-1894", summary: "Korekta kosztu surowca (wieprzowina kl. II)." },
  { v: "v1", date: "2024-10-30", author: "M. Szymczak", eco: "ECO-1850", summary: "Wersja początkowa — transfer z NPD (projekt F25-004)." },
];

// --- Version diff: v6 → v7 ---
const VERSION_DIFF = [
  { kind: "change", field: "R-3001 · Osłonka Ø26 — dostawca", from: "Kalle GmbH", to: "Viscofan" },
  { kind: "change", field: "R-3001 · Osłonka Ø26 — koszt/m", from: "0.41 zł", to: "0.34 zł" },
  { kind: "change", field: "Koszt BOM (1 szt)", from: "11.88 zł", to: "11.82 zł" },
  { kind: "add", field: "Uwaga procesowa — krok 70", from: "—", to: "Test zgodności z nową osłonką potwierdzony (08.04)" },
  { kind: "rem", field: "Komentarz tymczasowy — R-2103", from: "Oczekuje na próbkę", to: "—" },
];

// --- Other data ---
const ROUTINGS_LIST = [
  { id: "RT-CM-01", name: "Kiełbasa parzona — standard", products: 14, steps: 11, updated: "2026-04-14" },
  { id: "RT-CM-02", name: "Kiełbasa pieczona — z dymem", products: 6, steps: 13, updated: "2026-04-14" },
  { id: "RT-CM-03", name: "Wędzonka plastry — sous-vide", products: 9, steps: 9, updated: "2026-03-28" },
  { id: "RT-RM-01", name: "Gulasz słoik — pasteryzacja", products: 5, steps: 14, updated: "2026-03-11" },
  { id: "RT-RM-02", name: "Pierogi mrożone — HP", products: 3, steps: 12, updated: "2026-04-02" },
  { id: "RT-DL-01", name: "Pasztet — autoklaw", products: 4, steps: 10, updated: "2026-04-02" },
];

const WORK_CENTERS = [
  { code: "CUT-02", name: "Wilk W-20", type: "Cutting", capacity: "420 kg/h", oee: 78, shift: "3×8h", status: "running" },
  { code: "CUT-05", name: "Kuter K-2", type: "Cutting", capacity: "220 kg/h", oee: 71, shift: "3×8h", status: "running" },
  { code: "MIX-01", name: "Mieszarka M-150", type: "Mixing", capacity: "600 kg/h", oee: 84, shift: "2×8h", status: "running" },
  { code: "STUFF-01", name: "Nadziewarka N-300", type: "Stuffing", capacity: "350 kg/h", oee: 82, shift: "2×8h", status: "running" },
  { code: "SMOKE-01", name: "Wędzarnia W-2", type: "Thermal", capacity: "500 kg/batch", oee: 68, shift: "3×8h", status: "running" },
  { code: "SMOKE-02", name: "Wędzarnia W-3", type: "Thermal", capacity: "500 kg/batch", oee: 61, shift: "3×8h", status: "maintenance" },
  { code: "CHILL-02", name: "Komora chłodnicza C-2", type: "Chilling", capacity: "—", oee: null, shift: "24/7", status: "running" },
  { code: "PACK-03", name: "Pakowaczka MAP-2", type: "Packaging", capacity: "60 opak/min", oee: 88, shift: "3×8h", status: "running" },
  { code: "QC-01", name: "Linia QC (metal + waga)", type: "Quality", capacity: "inline", oee: 96, shift: "3×8h", status: "running" },
];

const ECO_LIST = [
  { id: "ECO-2044", title: "Redukcja soli w szynce plastrach -10%", bom: "B-0443", author: "A. Majewska", status: "review", priority: "normal", opened: "2026-04-18", impact: "Recipe + spec" },
  { id: "ECO-2043", title: "Zmiana dostawcy pieprzu (cena +12%)", bom: "6 BOM-ów", author: "P. Kowalski", status: "approved", priority: "high", opened: "2026-04-15", impact: "Cost + audit" },
  { id: "ECO-2042", title: "Nowy format kartonu pierogów (12×)", bom: "B-0402", author: "K. Nowacki", status: "implementing", priority: "normal", opened: "2026-04-11", impact: "Packaging + label" },
  { id: "ECO-2041", title: "Osłonka Viscofan dla kiełbasy śląskiej", bom: "B-0421", author: "A. Majewska", status: "closed", priority: "normal", opened: "2026-04-02", impact: "Supplier + cost" },
  { id: "ECO-2040", title: "Aktualizacja procedury CCP-2 (72°C/28min)", bom: "12 BOM-ów", author: "QA team", status: "closed", priority: "high", opened: "2026-03-28", impact: "Process + SOP" },
  { id: "ECO-2039", title: "Wycofanie boczku parzonego 200g", bom: "B-0420", author: "M. Szymczak", status: "closed", priority: "low", opened: "2026-03-11", impact: "Obsolete" },
];

const SPECS = [
  { id: "SP-0421", name: "Kiełbasa śląska pieczona 450g", category: "Cured meat", version: "v4", customer: "Biedronka", shelf: "21 dni", storage: "0–6°C", status: "approved" },
  { id: "SP-0412", name: "Pasztet drobiowy z żurawiną 180g", category: "Deli", version: "v2", customer: "Generic retail", shelf: "90 dni", storage: "0–6°C", status: "approved" },
  { id: "SP-0407", name: "Gulasz wołowy 350g (słoik)", category: "Ready meal", version: "v3", customer: "Lidl PL", shelf: "18 mies.", storage: "5–25°C", status: "approved" },
  { id: "SP-0443", name: "Szynka wędzona plastry 150g", category: "Cured meat", version: "v1", customer: "Biedronka", shelf: "28 dni", storage: "0–6°C", status: "draft" },
  { id: "SP-0388", name: "Filet z kurczaka sous-vide 180g", category: "Deli", version: "v3", customer: "Kaufland", shelf: "45 dni", storage: "0–4°C", status: "review" },
];

const MAINT_PLANS = [
  { code: "SMOKE-01", name: "Wędzarnia W-2", kind: "Preventive — czyszczenie", interval: "tygodniowo", last: "2026-04-15", next: "2026-04-22", due: 2, owner: "Zespół UR" },
  { code: "SMOKE-01", name: "Wędzarnia W-2", kind: "Kalibracja czujników temp.", interval: "miesięcznie", last: "2026-03-28", next: "2026-04-28", due: 8, owner: "SKA Kalibracje" },
  { code: "CUT-02", name: "Wilk W-20", kind: "Wymiana noży", interval: "co 200h pracy", last: "2026-04-11", next: "2026-04-24", due: 4, owner: "Zespół UR" },
  { code: "CUT-05", name: "Kuter K-2", kind: "Przegląd łożysk", interval: "kwartalnie", last: "2026-02-14", next: "2026-05-14", due: 24, owner: "Serwis zew." },
  { code: "PACK-03", name: "Pakowaczka MAP-2", kind: "Kontrola szczelności komory", interval: "tygodniowo", last: "2026-04-14", next: "2026-04-21", due: 1, owner: "Operator zmiany" },
  { code: "MIX-01", name: "Mieszarka M-150", kind: "Smarowanie mechanizmu", interval: "miesięcznie", last: "2026-03-30", next: "2026-04-30", due: 10, owner: "Zespół UR" },
  { code: "QC-01", name: "Detektor metalu", kind: "Test karta Fe/SS 2.0/2.5", interval: "co zmianę", last: "2026-04-19", next: "2026-04-20", due: 0, owner: "QC", critical: true },
];

const TOOLING = [
  { id: "T-WK-08", name: "Nóż wilka Ø8mm", type: "Tooling", wc: "CUT-02", stock: 24, min: 10, life: "200h", cost: 180 },
  { id: "T-KT-02", name: "Głowica kutra K-2", type: "Tooling", wc: "CUT-05", stock: 3, min: 2, life: "6 mies.", cost: 4200 },
  { id: "T-ST-26", name: "Lej Ø26mm nadziewarki", type: "Tooling", wc: "STUFF-01", stock: 4, min: 2, life: "—", cost: 320 },
  { id: "C-FL-PA", name: "Folia PA/PE 150µm", type: "Consumable", wc: "PACK-03", stock: 128, min: 60, life: "—", cost: 88 },
  { id: "C-KR-10", name: "Karton zbiorczy 10×450g", type: "Consumable", wc: "PACK-03", stock: 840, min: 300, life: "—", cost: 1.2 },
  { id: "C-ET-90", name: "Etykieta przód 90×60 (blank)", type: "Consumable", wc: "PACK-03", stock: 12400, min: 5000, life: "—", cost: 0.03 },
  { id: "T-QC-FE", name: "Karta testowa Fe 2.0mm", type: "Tooling", wc: "QC-01", stock: 2, min: 1, life: "—", cost: 240 },
];

// ============ Extended data for TEC-003/004/009/013/014/015/016/017/070..073 ============

// --- Materials list (RM / intermediate / packaging) ---
const MATERIALS = [
  { code: "R-1001", name: "Wieprzowina kl. II (łopatka)", type: "RM",           uom: "kg",  cost: 9.00, supplier: "PM Sokołów",        updated: "2026-04-14", status: "active" },
  { code: "R-1002", name: "Słonina wieprzowa",            type: "RM",           uom: "kg",  cost: 6.00, supplier: "PM Sokołów",        updated: "2026-04-12", status: "active" },
  { code: "R-1101", name: "Pierś z kurczaka",             type: "RM",           uom: "kg",  cost: 14.20, supplier: "SuperDrob",        updated: "2026-04-11", status: "active" },
  { code: "R-1201", name: "Sól peklująca (PP)",           type: "RM",           uom: "kg",  cost: 6.80, supplier: "Brenntag",          updated: "2026-02-28", status: "active" },
  { code: "R-1501", name: "Wołowina kl. I",               type: "RM",           uom: "kg",  cost: 24.80, supplier: "ZM Kania",         updated: "2026-04-02", status: "active" },
  { code: "R-2101", name: "Pieprz czarny mielony",        type: "RM",           uom: "kg",  cost: 46.50, supplier: "Kamis B2B",        updated: "2026-04-15", status: "active" },
  { code: "R-2102", name: "Czosnek granulowany",          type: "RM",           uom: "kg",  cost: 27.50, supplier: "Kamis B2B",        updated: "2026-04-08", status: "active" },
  { code: "R-2105", name: "Cukier biały",                 type: "RM",           uom: "kg",  cost: 3.80, supplier: "Pfeifer & Langen",  updated: "2026-03-22", status: "active" },
  { code: "R-3001", name: "Osłonka białkowa Ø26",         type: "packaging",    uom: "m",   cost: 0.34, supplier: "Viscofan",          updated: "2026-04-02", status: "active" },
  { code: "R-3100", name: "Dym płynny regal",             type: "RM",           uom: "kg",  cost: 22.00, supplier: "Brenntag",         updated: "2026-03-18", status: "active" },
  { code: "I-5001", name: "Farsz wieprzowy bazowy",       type: "intermediate", uom: "kg",  cost: 5.42, supplier: "wewnętrzny (SUB-001)", updated: "2026-04-14", status: "active" },
  { code: "I-5002", name: "Mieszanka przypraw A-17",      type: "intermediate", uom: "kg",  cost: 39.10, supplier: "wewnętrzny (SUB-002)", updated: "2026-04-14", status: "active" },
  { code: "I-5003", name: "Marynata żurawinowa",          type: "intermediate", uom: "kg",  cost: 8.20, supplier: "wewnętrzny",       updated: "2026-03-30", status: "active" },
  { code: "P-9001", name: "Folia PA/PE 150µm",            type: "packaging",    uom: "kg",  cost: 4.90, supplier: "Schur Flexibles",   updated: "2026-04-09", status: "active" },
  { code: "P-9002", name: "Etykieta 90×60",               type: "packaging",    uom: "szt", cost: 0.04, supplier: "Zakład etykiet Łódź", updated: "2026-04-17", status: "active" },
  { code: "P-9003", name: "Karton zbiorczy 10×450g",      type: "packaging",    uom: "szt", cost: 1.20, supplier: "Smurfit Kappa",     updated: "2026-04-05", status: "active" },
  { code: "P-9004", name: "Taca MAP PP 180×140",          type: "packaging",    uom: "szt", cost: 0.28, supplier: "Schur Flexibles",   updated: "2026-04-07", status: "review" },
];

// --- Nutrition panel (per 100 g, B-0421 Kiełbasa śląska) ---
const NUTRITION = {
  product: "B-0421 Kiełbasa śląska pieczona 450g",
  basis: "per 100 g (analyzed + calculated)",
  macros: [
    { k: "Energy",       v: "1108 kJ / 267 kcal", dv: 13, source: "calc" },
    { k: "Fat",          v: "22.4 g",             dv: 32, source: "calc", hi: true },
    { k: "  of which saturates", v: "8.1 g",      dv: 41, source: "calc", indent: true, hi: true },
    { k: "Carbohydrates", v: "1.2 g",             dv: 0,  source: "calc" },
    { k: "  of which sugars",    v: "0.4 g",      dv: 0,  source: "calc", indent: true },
    { k: "Protein",       v: "15.8 g",            dv: 32, source: "analysis" },
    { k: "Salt",          v: "2.1 g",             dv: 35, source: "analysis", hi: true },
  ],
  allergens: [
    { a: "Gluten",    present: false, mayContain: false },
    { a: "Eggs",      present: false, mayContain: false },
    { a: "Milk",      present: false, mayContain: true,  source: "shared line" },
    { a: "Soy",       present: false, mayContain: false },
    { a: "Nuts",      present: false, mayContain: false },
    { a: "Celery",    present: false, mayContain: false },
    { a: "Mustard",   present: true,  mayContain: false, source: "R-2104 majeranek / cross-use" },
    { a: "Sesame",    present: false, mayContain: false },
    { a: "Fish",      present: false, mayContain: false },
    { a: "Sulphites", present: false, mayContain: false },
  ],
};

// --- Costing (TEC-013) roll-up for B-0421 ---
const COSTING = {
  product: "B-0421 Kiełbasa śląska pieczona 450g",
  stdCost: 11.82,
  target:  11.50,
  sellPrice: 19.90,
  yieldPct: 91,
  breakdown: [
    { cat: "Raw materials",   val: 7.62, pct: 64.5, tone: "blue" },
    { cat: "Packaging",       val: 0.56, pct:  4.7, tone: "gray" },
    { cat: "Direct labor",    val: 1.84, pct: 15.6, tone: "amber" },
    { cat: "Machine / energy",val: 0.92, pct:  7.8, tone: "violet" },
    { cat: "Overhead (FC)",   val: 0.88, pct:  7.4, tone: "red" },
  ],
};

// --- Shelf life rules (TEC-014) ---
const SHELF_LIFE = [
  { product: "FA5100 Kiełbasa śląska 450g",        useBy: 21, best: null, mode: "use_by",     storage: "0–6°C",  preset: "PL deli-cured",  reg: "Rozp. 1169/2011", notes: "Cured meat, perishable — use_by mandatory." },
  { product: "FA5200 Pasztet drobiowy 180g",        useBy: 90, best: null, mode: "use_by",     storage: "0–6°C",  preset: "PL deli-cured",  reg: "Rozp. 1169/2011", notes: "" },
  { product: "FA5301 Gulasz wołowy 350g słoik",     useBy: null, best: 540, mode: "best_before", storage: "5–25°C", preset: "Ambient pasteurized", reg: "Rozp. 1169/2011", notes: "Pasteurized glass jar, ambient stable." },
  { product: "FA5021 Filet kurczaka sous-vide 180g", useBy: 45, best: null, mode: "use_by",     storage: "0–4°C",  preset: "PL sous-vide",   reg: "GHP/GMP",         notes: "SV cook 65°C/90min; chill <4°C in 2h." },
  { product: "FA5400 Pierogi z mięsem 400g",        useBy: null, best: 180, mode: "best_before", storage: "-18°C",   preset: "Frozen",        reg: "Rozp. 1169/2011", notes: "Frozen product." },
  { product: "FA5410 Szynka wędzona plastry 150g",  useBy: 28, best: null, mode: "use_by",     storage: "0–6°C",  preset: "PL deli-cured",  reg: "Rozp. 1169/2011", notes: "MAP gas 30% CO₂." },
  { product: "FA5420 Klopsiki w sosie 320g",        useBy: null, best: 18,  mode: "best_before", storage: "5–25°C", preset: "Ambient pasteurized", reg: "Rozp. 1169/2011", notes: "18 mies. (słoik)." },
];

// --- Cost history (TEC-015) for B-0421 ---
const COST_HISTORY = [
  { date: "2024-10-30", cost: 12.08, delta:  0.00, reason: "Baseline v1 (transfer from NPD).",            src: "v1" },
  { date: "2025-02-06", cost: 12.24, delta: +1.3,  reason: "Raw-material correction (wieprzowina kl. II).", src: "v2" },
  { date: "2025-05-12", cost: 11.98, delta: -2.1,  reason: "Weight reduction 500→450g.",                   src: "v3" },
  { date: "2025-08-19", cost: 12.18, delta: +1.7,  reason: "Fat-ratio increase (słonina 20→22%).",         src: "v4" },
  { date: "2025-11-08", cost: 12.02, delta: -1.3,  reason: "Smoking cycle change (3-phase) — labor -.",    src: "v5" },
  { date: "2026-01-22", cost: 11.88, delta: -1.2,  reason: "Spice mix rebalance.",                         src: "v6" },
  { date: "2026-04-14", cost: 11.82, delta: -0.5,  reason: "Casing supplier switch (Kalle → Viscofan).",   src: "v7" },
];

// --- Traceability search (TEC-016) ---
const TRACE_SAMPLE = {
  query: "LP-2026-04-19-00142",
  product: "FA5100 Kiełbasa śląska pieczona 450g",
  woBatch: "WO-41228 / Batch B-20260419-02",
  forward: [
    { lp: "LP-2026-04-19-00142", qty: "108 kg", dest: "Customer DC Biedronka Tychy",       at: "2026-04-19 17:42", stage: "Shipped" },
    { lp: "LP-2026-04-19-00141", qty: "108 kg", dest: "Customer DC Biedronka Katowice",   at: "2026-04-19 17:42", stage: "Shipped" },
    { lp: "LP-2026-04-19-00140", qty:  "54 kg", dest: "Pending — dock 3",                  at: "2026-04-19 15:20", stage: "Staged" },
  ],
  backward: [
    { comp: "R-1001 Wieprzowina kl. II",     lot: "L-SOK-260415-01", supplier: "PM Sokołów",     qty: "178 kg", coa: "yes" },
    { comp: "R-1002 Słonina wieprzowa",      lot: "L-SOK-260415-02", supplier: "PM Sokołów",     qty:  "72 kg", coa: "yes" },
    { comp: "R-1201 Sól peklująca",          lot: "L-BR-260401-07",  supplier: "Brenntag",       qty:   "6 kg", coa: "yes" },
    { comp: "R-3001 Osłonka Ø26",            lot: "L-VIS-260318-11", supplier: "Viscofan",       qty: "300 m",  coa: "yes" },
    { comp: "R-2101..R-2105 Spices",         lot: "L-KAM-260310-A7", supplier: "Kamis B2B",      qty:   "7 kg", coa: "yes" },
    { comp: "P-9001 Folia PA/PE",            lot: "L-SCH-260402-09", supplier: "Schur Flexibles",qty:  "15 kg", coa: "n/a" },
  ],
};

// --- Technical dashboard KPIs (TEC-017) ---
const TEC_DASH_KPIS = [
  { label: "Active products",      value: "124", sub: "+4 last 30 days",    tone: "default" },
  { label: "Active BOMs",          value:  "42", sub: "6 drafts in review", tone: "default" },
  { label: "BOM changes (wk)",     value:   "9", sub: "3 approved / 6 pending", tone: "blue" },
  { label: "Cost-variance alerts", value:   "3", sub: "> ±5% vs std",       tone: "amber" },
  { label: "Allergen conflicts",   value:   "1", sub: "FA5200 vs line-02",  tone: "red" },
  { label: "D365 drift",           value:   "4", sub: "items out of sync",  tone: "amber" },
];

// --- D365 sync status (TEC-070) ---
const D365_STATUS = {
  env: "D365 PROD (CT-EU)",
  connector: "MonoPilot D365 Integration Gateway v1.14.2",
  lastFull: "2026-04-21 02:00 (nightly)",
  lastDelta:"2026-04-21 14:05",
  nextRun:  "2026-04-21 22:00",
  health:   "degraded",
  queueIn:  12,
  queueOut: 0,
  dlq:      2,
  driftOpen: 4,
};

// --- D365 field mapping (TEC-071) ---
const D365_FIELDS = [
  { mp: "Item.code",               d365: "ItemId",                       type: "string", direction: "push",   transform: "—",                  status: "ok" },
  { mp: "Item.name",               d365: "ProductName",                  type: "string", direction: "push",   transform: "truncate(60)",       status: "ok" },
  { mp: "Item.uom",                d365: "InventUnitSymbol",             type: "enum",   direction: "push",   transform: "uom_map",            status: "ok" },
  { mp: "Item.category",           d365: "ItemGroupId",                  type: "enum",   direction: "push",   transform: "cat_map",            status: "ok" },
  { mp: "Item.stdCost",            d365: "CostPrice",                    type: "decimal",direction: "push",   transform: "round(2)",           status: "warn" },
  { mp: "Item.sellingPrice",       d365: "SalesPrice",                   type: "decimal",direction: "pull",   transform: "—",                  status: "ok" },
  { mp: "Bom.versionLabel",        d365: "BOMVersion",                   type: "string", direction: "push",   transform: "—",                  status: "ok" },
  { mp: "Bom.lines[].qty",         d365: "BOMQty",                       type: "decimal",direction: "push",   transform: "round(4)",           status: "ok" },
  { mp: "Bom.lines[].scrap",       d365: "BOMScrapPct",                  type: "decimal",direction: "push",   transform: "pct",                status: "ok" },
  { mp: "Routing.op[].workCenter", d365: "OperationResourceId",          type: "string", direction: "push",   transform: "wc_map",             status: "warn" },
  { mp: "Routing.op[].setupMin",   d365: "SetupTime",                    type: "int",    direction: "push",   transform: "min→sec",            status: "ok" },
  { mp: "Routing.op[].runMin",     d365: "RunTime",                      type: "int",    direction: "push",   transform: "min→sec",            status: "ok" },
  { mp: "Item.allergens[]",        d365: "— (custom field AFC_Allergen)",type: "list",   direction: "push",   transform: "list→csv",           status: "unmapped" },
  { mp: "Item.shelfLifeDays",      d365: "ShelfLifeDays",                type: "int",    direction: "push",   transform: "—",                  status: "ok" },
];

// --- D365 drift items (TEC-072) ---
const D365_DRIFT = [
  { id: "DRIFT-0411", entity: "Item.stdCost",     code: "FA5100", mp: "11.82", d365: "11.88", delta: "-0.06", detected: "2026-04-21 02:03", severity: "low"    },
  { id: "DRIFT-0412", entity: "Item.stdCost",     code: "FA5200", mp:  "4.16", d365:  "4.28", delta: "-0.12", detected: "2026-04-21 02:03", severity: "medium" },
  { id: "DRIFT-0413", entity: "Bom.lines[].qty",  code: "B-0443", mp: "0.018", d365: "0.020", delta: "-0.002", detected: "2026-04-21 02:04", severity: "high", note: "ECO-2044 not yet synced" },
  { id: "DRIFT-0414", entity: "Item.category",    code: "FA5421", mp:  "Deli", d365: "Ready",  delta: "cat",    detected: "2026-04-20 22:11", severity: "medium" },
];

// --- D365 sync log (TEC-073) ---
const D365_LOG = [
  { t: "2026-04-21 14:05", kind: "delta", duration: "00:00:42", items: 18, ok: 18, err: 0, by: "scheduler" },
  { t: "2026-04-21 10:05", kind: "delta", duration: "00:00:29", items: 11, ok: 11, err: 0, by: "scheduler" },
  { t: "2026-04-21 06:05", kind: "delta", duration: "00:00:18", items:  4, ok:  4, err: 0, by: "scheduler" },
  { t: "2026-04-21 02:00", kind: "full",  duration: "00:08:12", items: 412, ok: 410, err: 2, by: "scheduler", note: "2 cost drift → DLQ" },
  { t: "2026-04-20 22:00", kind: "delta", duration: "00:01:04", items: 27, ok: 26, err: 1, by: "scheduler" },
  { t: "2026-04-20 18:02", kind: "manual",duration: "00:00:11", items:  3, ok:  3, err: 0, by: "A. Majewska", note: "B-0421 v7 publish" },
  { t: "2026-04-20 14:00", kind: "delta", duration: "00:00:22", items:  9, ok:  9, err: 0, by: "scheduler" },
  { t: "2026-04-20 02:00", kind: "full",  duration: "00:07:48", items: 411, ok: 411, err: 0, by: "scheduler" },
];

// --- Supplier list for material detail (TEC-004) ---
const MATERIAL_SUPPLIERS = [
  { mat: "R-1001", supplier: "PM Sokołów",    price: 9.00,  lead: "3 d", moq:  "200 kg", primary: true },
  { mat: "R-1001", supplier: "ZM Kania",      price: 9.40,  lead: "5 d", moq:  "500 kg", primary: false },
  { mat: "R-1001", supplier: "Animex",        price: 9.25,  lead: "4 d", moq:  "300 kg", primary: false },
];

const MATERIAL_SUBSTITUTES = [
  { mat: "R-1001", sub: "R-1003 Wieprzowina kl. III", note: "Technicznie zamienna, -6% yield", allowed: "requires QA approval" },
  { mat: "R-1001", sub: "R-1101 Pierś z kurczaka",    note: "Niezamienna (recipe category change)", allowed: "not permitted" },
];

const MATERIAL_COST_HISTORY = {
  "R-1001": [
    { date: "2025-10-01", price: 8.40 },
    { date: "2025-11-15", price: 8.60 },
    { date: "2026-01-10", price: 8.80 },
    { date: "2026-02-22", price: 9.10 },
    { date: "2026-04-14", price: 9.00 },
  ],
};

Object.assign(window, {
  TECH_NAV, BOM_LIST, BOM_TREE, ROUTING, PROCESS_PARAMS, VERSIONS, VERSION_DIFF,
  ROUTINGS_LIST, WORK_CENTERS, ECO_LIST, SPECS, MAINT_PLANS, TOOLING,
  MATERIALS, NUTRITION, COSTING, SHELF_LIFE, COST_HISTORY, TRACE_SAMPLE,
  TEC_DASH_KPIS, D365_STATUS, D365_FIELDS, D365_DRIFT, D365_LOG,
  MATERIAL_SUPPLIERS, MATERIAL_SUBSTITUTES, MATERIAL_COST_HISTORY,
});
