// ============ Quality module — mock data ============
// Cross-refs:
//  • Warehouse LPs — LP-4431, LP-4432, LP-4470, LP-5582, LP00000122 (QA HOLD)
//  • Planning / Production WOs — WO-2026-0108 Kiełbasa, WO-2026-0042 Pasztet, WO-2026-0040 Pierogi
//  • GRNs from Warehouse — GRN-2026-00042, GRN-2026-00041, GRN-2026-00038
//  • Polish SKUs — Kiełbasa śląska pieczona 450g, Pierogi z mięsem 400g, Pasztet drobiowy z żurawiną 180g

const QA_NAV = [
  { group: "Overview", items: [
    { key: "dashboard", label: "Dashboard", ic: "◆", hero: true },
  ]},
  { group: "Holds & Release", items: [
    { key: "holds",     label: "Holds",            ic: "🔒", count: "8" },
    { key: "release",   label: "Batch Release",    ic: "✓", p2: true },
  ]},
  { group: "Specifications", items: [
    { key: "specs",     label: "Specifications",   ic: "▤", count: "24" },
    { key: "templates", label: "Test Templates",   ic: "▣", count: "7" },
    { key: "sampling",  label: "Sampling Plans",   ic: "⊞", count: "5" },
  ]},
  { group: "Inspections", items: [
    { key: "incoming",   label: "Incoming",    ic: "⇪", count: "12" },
    { key: "inprocess",  label: "In-Process",  ic: "⚒", p2: true },
    { key: "final",      label: "Final",       ic: "→",  p2: true },
  ]},
  { group: "NCR & CoA", items: [
    { key: "ncr",       label: "NCR",             ic: "⚠", count: "11" },
    { key: "coa",       label: "CoA",             ic: "⎙", p2: true },
  ]},
  { group: "HACCP / Food safety", items: [
    { key: "haccp",     label: "HACCP Plans",     ic: "⚕" },
    { key: "ccp",       label: "CCP Monitoring",  ic: "🌡", count: "3" },
    { key: "allergen",  label: "Allergen Gates",  ic: "⚡", count: "2" },
  ]},
  { group: "Evidence & Admin", items: [
    { key: "audit",     label: "Audit Trail",     ic: "📜" },
    { key: "scanner",   label: "Scanner QA",      ic: "📱" },
    { key: "settings",  label: "Quality Settings", ic: "⚙" },
    { key: "gallery",   label: "Modal Gallery",   ic: "▣" },
  ]},
];

// ----- Dashboard KPIs (QA-001) -----
const QA_KPIS = [
  { k: "active_holds",   label: "Active Holds",            value: 8,    accent: "amber", sub: "2 critical · 3 high · 2 medium · 1 low", target: "holds" },
  { k: "pending_insp",   label: "Pending Inspections",     value: 12,   accent: "red",   sub: "3 overdue · 4 urgent",                    target: "incoming" },
  { k: "open_ncrs",      label: "Open NCRs",               value: 11,   accent: "red",   sub: "2 critical · 4 major · 5 minor",         target: "ncr" },
  { k: "ccp_compl",      label: "CCP Compliance (today)",  value: "97.4%", accent: "amber", sub: "3 deviations in last 24h",             target: "ccp" },
  { k: "ftp_rate",       label: "First-Time Pass (30d)",   value: "93.8%", accent: "amber", sub: "Target ≥ 95% — below target",         target: "incoming" },
  { k: "allergen_gates", label: "Allergen Gates (today)",  value: 6,    accent: "amber", sub: "2 pending dual-sign",                    target: "allergen" },
];

// ----- Critical alerts (QA-001) -----
const QA_CRITICAL_ALERTS = [
  { type: "CCP deviation", text: "CCP-001 Pasteurisation Temp reading 68°C (limit: ≥72°C) on WO-2026-0108. NCR-2026-0091 auto-created.", link: "ccp_dev", severity: "critical" },
  { type: "Overdue inspection", text: "INS-2026-0478 Incoming inspection for GRN-2026-00043 Baltic Pork — 4h overdue.", link: "incoming", severity: "critical" },
  { type: "Aging hold", text: "QH-22 on LP00000122 R-1501 Mąka pszenna — open 52h (threshold 48h). Pending lab results from Eurofins.", link: "holds", severity: "high" },
  { type: "Failed inspection today", text: "INS-2026-0475 Incoming — Wieprzowina kl. II FAIL on moisture. LP-4820 auto-held.", link: "incoming", severity: "high" },
];

// ----- Holds list (QA-002) -----
const QA_HOLDS = [
  { id: "QH-23", refType: "LP",  refId: "LP00000122", product: "R-1501 Mąka pszenna typ 500",   reason: "Pending lab results (Salmonella)",   reasonCat: "Contamination",   priority: "high",     status: "investigating", daysHeld: 2, estRelease: "2026-04-23", createdBy: "QA.Wiśniewski", createdAt: "2026-04-19 11:02", holdQty: 200, notes: "Awaiting PCR result — Eurofins ref EF-2026-4412", linkedNcr: null,           signed: false },
  { id: "QH-22", refType: "LP",  refId: "LP00000122", product: "R-1501 Mąka pszenna typ 500",   reason: "Pending lab results",                 reasonCat: "Documentation",   priority: "medium",   status: "open",          daysHeld: 3, estRelease: "2026-04-21", createdBy: "QA.Wiśniewski", createdAt: "2026-04-18 09:15", holdQty: 200, notes: "Supplier CoA missing — Agro-Fresh follow-up sent", linkedNcr: null,     signed: false },
  { id: "QH-24", refType: "LP",  refId: "LP-4820",    product: "R-1001 Wieprzowina kl. II",     reason: "Moisture out of spec (measured 78% vs max 75%)", reasonCat: "Specification Deviation", priority: "critical", status: "open", daysHeld: 0, estRelease: "2026-04-23", createdBy: "QA.Inspector1", createdAt: "2026-04-21 08:40", holdQty: 160, notes: "Auto-created from INS-2026-0475 fail.", linkedNcr: "NCR-2026-0089", signed: false },
  { id: "QH-20", refType: "WO",  refId: "WO-2026-0108", product: "FA5100 Kiełbasa śląska pieczona 450g", reason: "CCP deviation — pasteurisation temp low", reasonCat: "Temperature", priority: "critical", status: "escalated", daysHeld: 0, estRelease: "2026-04-22", createdBy: "system (CCP rule)", createdAt: "2026-04-21 10:15", holdQty: 0, notes: "Auto-hold by ccp_deviation_escalation_v1 rule. WO paused awaiting hygiene_lead investigation.", linkedNcr: "NCR-2026-0091", signed: false },
  { id: "QH-19", refType: "GRN", refId: "GRN-2026-00043", product: "R-1001 Wieprzowina kl. II (Baltic Pork Co.)", reason: "Awaiting CoA from supplier", reasonCat: "Documentation",   priority: "medium",   status: "open",      daysHeld: 1, estRelease: "2026-04-22", createdBy: "QA.Wiśniewski", createdAt: "2026-04-20 14:22", holdQty: 420, notes: "",                                            linkedNcr: null,           signed: false },
  { id: "QH-18", refType: "LP",  refId: "LP00000019", product: "R-1301 Cebula drobna",           reason: "Foreign body suspected (metal)",       reasonCat: "Contamination",   priority: "critical", status: "investigating", daysHeld: 4, estRelease: "2026-04-20", createdBy: "QA.Inspector1", createdAt: "2026-04-17 16:11", holdQty: 35, notes: "Metal detector trigger at receiving. X-ray re-inspection scheduled.", linkedNcr: "NCR-2026-0085", signed: false },
  { id: "QH-16", refType: "LP",  refId: "LP00000045", product: "R-1001 Wieprzowina kl. II",      reason: "Temperature at receipt > 5°C",          reasonCat: "Temperature",     priority: "high",     status: "open",          daysHeld: 1, estRelease: "2026-04-22", createdBy: "QA.Inspector1", createdAt: "2026-04-20 06:14", holdQty: 120, notes: "",                                           linkedNcr: "NCR-2026-0087", signed: false },
  { id: "QH-15", refType: "Batch", refId: "B-2026-04-14", product: "R-1201 Filet z kurczaka",    reason: "Customer complaint — rework assessment", reasonCat: "Other",          priority: "medium",   status: "investigating", daysHeld: 2, estRelease: "2026-04-22", createdBy: "QA.Lead",       createdAt: "2026-04-19 09:05", holdQty: 120, notes: "ASDA complaint #CX-2026-991", linkedNcr: "NCR-2026-0086", signed: false },
  // Released / cancelled (historical)
  { id: "QH-14", refType: "LP",  refId: "LP-7100",    product: "R-1501 Mąka pszenna typ 500",   reason: "Lab cleared",                         reasonCat: "Documentation",   priority: "low",      status: "released",      daysHeld: 5, estRelease: "2026-04-19", createdBy: "QA.Wiśniewski", createdAt: "2026-04-14 10:02", holdQty: 150, notes: "Eurofins negative — cleared", linkedNcr: null,           signed: true, releasedAt: "2026-04-19 13:40", releasedBy: "QA.Lead", disposition: "release_as_is" },
  { id: "QH-13", refType: "LP",  refId: "LP-5020",    product: "R-1201 Filet z kurczaka",       reason: "Rework approved",                      reasonCat: "Specification Deviation", priority: "medium", status: "released",  daysHeld: 3, estRelease: "2026-04-18", createdBy: "QA.Inspector2", createdAt: "2026-04-15 14:11", holdQty: 360, notes: "Reworked on Line-3 — re-inspected PASS", linkedNcr: "NCR-2026-0080", signed: true, releasedAt: "2026-04-18 10:11", releasedBy: "QA.Lead", disposition: "rework" },
  { id: "QH-12", refType: "LP",  refId: "LP00000007", product: "R-1002 Słonina wieprzowa",      reason: "Use-by expired",                        reasonCat: "Other",           priority: "high",     status: "quarantined",   daysHeld: 6, estRelease: null,        createdBy: "system", createdAt: "2026-04-15 02:00", holdQty: 60, notes: "Expired 2026-04-15 — awaiting disposal", linkedNcr: null,           signed: false },
];

// ----- Hold detail subject (QH-24) -----
const QA_HOLD_DETAIL = {
  id: "QH-24",
  refType: "LP",
  refId: "LP-4820",
  product: { code: "R-1001", name: "Wieprzowina kl. II" },
  reason: "Moisture out of spec (measured 78% vs max 75%)",
  reasonCat: "Specification Deviation",
  priority: "critical",
  status: "open",
  createdBy: "QA.Inspector1",
  createdAt: "2026-04-21 08:40",
  daysHeld: 0,
  estRelease: "2026-04-23",
  disposition: "Pending",
  notes: "Auto-created from INS-2026-0475 fail. Moisture measured 78.2% against spec range 72–75%. Pending lab re-test before disposition.",
  linkedNcr: "NCR-2026-0089",
  sourceInsp: "INS-2026-0475",
  holdQty: 160,
  lps: 1,
  heldItems: [
    { lp: "LP-4820", qtyHeld: 160, qtyReleased: 0, status: "held", notes: "Batch B-2026-04-21" },
  ],
  events: [
    { t: "2026-04-21 08:40", type: "create",  user: "QA.Inspector1", op: "INSERT", fields: "hold_status, reason_code_id, priority, ref_id" },
    { t: "2026-04-21 08:41", type: "update",  user: "system",        op: "UPDATE", fields: "linked_ncr_id ← NCR-2026-0089" },
    { t: "2026-04-21 08:42", type: "update",  user: "QA.Inspector1", op: "UPDATE", fields: "notes (first draft)" },
  ],
};

// ----- Specifications list (QA-003) -----
const QA_SPECS = [
  { id: "SPEC-0142", product: "R-1001 Wieprzowina kl. II",         version: 3, status: "active",        effFrom: "2026-04-01", effUntil: "2027-04-01", params: 8, critical: 2, approvedBy: "QA.Lead",       approvedAt: "2026-03-28", regs: ["EU 1169", "BRCGS v10"], appliesTo: "incoming" },
  { id: "SPEC-0135", product: "R-1002 Słonina wieprzowa",          version: 2, status: "active",        effFrom: "2026-03-15", effUntil: "2027-03-15", params: 7, critical: 2, approvedBy: "QA.Lead",       approvedAt: "2026-03-14", regs: ["EU 1169", "BRCGS v10"], appliesTo: "incoming" },
  { id: "SPEC-0128", product: "R-1101 Wołowina gulaszowa",         version: 2, status: "active",        effFrom: "2026-02-01", effUntil: "2027-02-01", params: 9, critical: 3, approvedBy: "QA.Lead",       approvedAt: "2026-01-28", regs: ["EU 1169", "FSMA 204"], appliesTo: "incoming" },
  { id: "SPEC-0120", product: "R-1201 Filet z kurczaka",            version: 4, status: "active",        effFrom: "2026-03-10", effUntil: "2027-03-10", params: 11, critical: 4, approvedBy: "QA.Lead",      approvedAt: "2026-03-08", regs: ["EU 1169", "BRCGS v10", "FSMA 204"], appliesTo: "incoming" },
  { id: "SPEC-0118", product: "R-1501 Mąka pszenna typ 500",        version: 1, status: "active",        effFrom: "2025-11-01", effUntil: "2026-05-01", params: 6, critical: 1, approvedBy: "QA.Lead",       approvedAt: "2025-10-30", regs: ["EU 1169"], appliesTo: "incoming" },
  { id: "SPEC-0116", product: "R-1601 Jaja kurze (żółtka)",          version: 2, status: "active",        effFrom: "2026-01-15", effUntil: "2027-01-15", params: 7, critical: 3, approvedBy: "QA.Lead",       approvedAt: "2026-01-12", regs: ["EU 1169", "BRCGS v10"], appliesTo: "incoming" },
  { id: "SPEC-0112", product: "R-2101 Pieprz czarny mielony",       version: 1, status: "active",        effFrom: "2025-08-01", effUntil: "2026-08-01", params: 5, critical: 0, approvedBy: "QA.Lead",       approvedAt: "2025-07-28", regs: ["EU 1169"], appliesTo: "incoming" },
  { id: "SPEC-0108", product: "FA5100 Kiełbasa śląska pieczona 450g", version: 5, status: "active",      effFrom: "2026-02-15", effUntil: "2027-02-15", params: 14, critical: 5, approvedBy: "QA.Lead",      approvedAt: "2026-02-13", regs: ["EU 1169", "BRCGS v10", "FSMA 204"], appliesTo: "final" },
  { id: "SPEC-0107", product: "FA5200 Pasztet drobiowy z żurawiną 180g", version: 3, status: "active",    effFrom: "2026-01-20", effUntil: "2027-01-20", params: 12, critical: 4, approvedBy: "QA.Lead",     approvedAt: "2026-01-18", regs: ["EU 1169", "BRCGS v10"], appliesTo: "final" },
  { id: "SPEC-0106", product: "FA5300 Pierogi z mięsem 400g",       version: 2, status: "active",        effFrom: "2026-03-01", effUntil: "2027-03-01", params: 10, critical: 3, approvedBy: "QA.Lead",       approvedAt: "2026-02-28", regs: ["EU 1169", "BRCGS v10"], appliesTo: "final" },
  { id: "SPEC-0150", product: "IN1301 [INT] Farsz pierogowy mieszany", version: 1, status: "under_review", effFrom: "2026-04-25", effUntil: null,       params: 6, critical: 2, approvedBy: null,             approvedAt: null,         regs: ["BRCGS v10"], appliesTo: "inprocess" },
  { id: "SPEC-0151", product: "FA5400 Filet sous-vide 180g",         version: 1, status: "draft",         effFrom: "2026-05-01", effUntil: null,       params: 9, critical: 3, approvedBy: null,             approvedAt: null,         regs: ["EU 1169", "BRCGS v10"], appliesTo: "final" },
  { id: "SPEC-0100", product: "R-1001 Wieprzowina kl. II",         version: 2, status: "superseded",    effFrom: "2025-10-01", effUntil: "2026-04-01", params: 7, critical: 1, approvedBy: "QA.Lead",       approvedAt: "2025-09-28", regs: ["EU 1169"], appliesTo: "incoming" },
  { id: "SPEC-0115", product: "R-3001 Osłonka Ø26 (Viscofan)",     version: 1, status: "active",        effFrom: "2025-09-01", effUntil: "2026-05-15", params: 4, critical: 0, approvedBy: "QA.Lead",       approvedAt: "2025-08-28", regs: ["EU 1169"], appliesTo: "incoming" },
];

// ----- Spec detail subject (SPEC-0142 Wieprzowina v3) -----
const QA_SPEC_DETAIL = {
  id: "SPEC-0142",
  product: { code: "R-1001", name: "Wieprzowina kl. II" },
  version: 3,
  status: "active",
  appliesTo: "incoming",
  effFrom: "2026-04-01",
  effUntil: "2027-04-01",
  regs: ["EU 1169", "BRCGS v10", "FSMA 204"],
  approvedBy: "QA.Lead (Ewa Kowalska)",
  approvedAt: "2026-03-28 14:15",
  createdBy: "QA.Lead",
  createdAt: "2026-03-25",
  refDocs: "SOP-QA-017 rev. 4 · Supplier CoA template SUP-CoA-2026",
  notes: "Updated moisture range per BRCGS Issue 10 §3.7.2. Replaces SPEC-0100 v2.",
  parameters: [
    { name: "Visual — colour & appearance", type: "Visual",          target: null, min: null, max: null, unit: "",      method: "Visual inspection against colour chart VC-PORK-01. Reject if grey, mottled, or discoloured.", equipment: "Colour chart VC-PORK-01", critical: false },
    { name: "Temperature at receipt",         type: "Measurement",     target: 2,    min: 0,    max: 5,    unit: "°C",    method: "Probe thermometer in geometric centre of pallet. 3 points, mean value.", equipment: "Testo 104 thermometer", critical: true },
    { name: "pH",                             type: "Chemical",        target: 5.6,  min: 5.3,  max: 6.0,  unit: "pH",    method: "Horwitz pH meter, 30s stabilisation. 2 points, mean value.", equipment: "Hanna HI 99163", critical: false },
    { name: "Moisture content",               type: "Chemical",        target: 73.5, min: 72,   max: 75,   unit: "%",     method: "Oven-dry method ISO 1442, 105°C × 16h. Reported to 1 decimal.", equipment: "Memmert UN 55", critical: true },
    { name: "Microbiological — TVC",          type: "Microbiological", target: 5.0,  min: 0,    max: 6.0,  unit: "log CFU/g", method: "ISO 4833-1 pour-plate. Incubate 30°C × 72h.", equipment: "Eurofins outsource", critical: false },
    { name: "Microbiological — E.coli",       type: "Microbiological", target: 0,    min: 0,    max: 2.0,  unit: "log CFU/g", method: "ISO 16649-2 on TBX agar. Incubate 44°C × 24h.", equipment: "Eurofins outsource", critical: false },
    { name: "Weight per pallet (net)",        type: "Measurement",     target: 1000, min: 995,  max: 1005, unit: "kg",    method: "Calibrated platform scale per pallet.", equipment: "Mettler BBK 464", critical: false },
    { name: "Label compliance",               type: "Attribute",       target: null, min: null, max: null, unit: "",      method: "Check for: product name, supplier code, batch#, use-by date, origin, GTIN. All fields present and legible.", equipment: "Visual", critical: false },
  ],
  allergenProfile: [
    { name: "Gluten",          present: false }, { name: "Crustaceans",   present: false },
    { name: "Eggs",            present: false }, { name: "Fish",          present: false },
    { name: "Peanuts",         present: false }, { name: "Soybeans",      present: false },
    { name: "Milk",            present: false }, { name: "Nuts",          present: false },
    { name: "Celery",          present: false }, { name: "Mustard",       present: false },
    { name: "Sesame",          present: false }, { name: "Sulphites",     present: false },
    { name: "Lupin",           present: false }, { name: "Molluscs",      present: false },
  ],
};

// ----- Test Templates (QA-004) -----
const QA_TEMPLATES = [
  { id: "TT-001", name: "Standard microbiological panel",    category: "Microbiological", params: 5,  preview: ["TVC", "E.coli", "Salmonella", "Listeria", "Staphylococcus"], createdBy: "QA.Lead",       updated: "2026-02-12" },
  { id: "TT-002", name: "Incoming meat temperature check",    category: "Physical",        params: 3,  preview: ["Receipt temp", "Centre temp", "Surface temp"],                createdBy: "QA.Lead",       updated: "2026-03-02" },
  { id: "TT-003", name: "Weight & pallet integrity",          category: "Physical",        params: 4,  preview: ["Net weight", "Pallet count", "Label legibility", "Strapping"], createdBy: "QA.Lead",     updated: "2026-03-10" },
  { id: "TT-004", name: "Visual appearance — meat",           category: "Sensory",         params: 3,  preview: ["Colour", "Odour", "Surface"],                                createdBy: "QA.Inspector1", updated: "2026-03-15" },
  { id: "TT-005", name: "Moisture, pH, fat — pork",           category: "Chemical",        params: 4,  preview: ["Moisture", "pH", "Fat %", "Collagen"],                       createdBy: "QA.Lead",       updated: "2026-03-28" },
  { id: "TT-006", name: "Allergen swab panel (nuts/milk)",    category: "Chemical",        params: 3,  preview: ["ATP RLU", "Nuts ELISA", "Milk ELISA"],                       createdBy: "QA.Lead",       updated: "2026-04-05" },
  { id: "TT-007", name: "Metal detector verification",         category: "Physical",        params: 3,  preview: ["Fe 1.5mm", "Non-Fe 2.0mm", "SS 2.5mm"],                      createdBy: "QA.Inspector2", updated: "2026-04-10" },
];

// ----- Inspections queue (QA-005) -----
const QA_INSPECTIONS = [
  { id: "INS-2026-0478", grn: "GRN-2026-00043", po: "PO-2026-00042", product: "R-1001 Wieprzowina kl. II",  priority: "urgent",  status: "pending",    assignedTo: null,           scheduled: "2026-04-21 12:00", samplingPlan: "ISO-AQL-2.5-GII", urgency: "overdue",  spec: "SPEC-0142 v3" },
  { id: "INS-2026-0477", grn: "GRN-2026-00042", po: "PO-2026-00041", product: "R-1301 Cebula drobna",        priority: "normal",  status: "pending",    assignedTo: null,           scheduled: "2026-04-21 15:00", samplingPlan: "ISO-AQL-4.0-GII", urgency: "today",    spec: "—" },
  { id: "INS-2026-0476", grn: "GRN-2026-00042", po: "PO-2026-00041", product: "R-2101 Pieprz czarny mielony", priority: "normal",  status: "assigned",   assignedTo: "QA.Inspector1", scheduled: "2026-04-21 14:00", samplingPlan: "ISO-AQL-2.5-GII", urgency: "today",    spec: "SPEC-0112 v1" },
  { id: "INS-2026-0475", grn: "GRN-2026-00043", po: "PO-2026-00042", product: "R-1001 Wieprzowina kl. II",   priority: "urgent",  status: "completed",  assignedTo: "QA.Inspector1", scheduled: "2026-04-21 09:00", samplingPlan: "ISO-AQL-2.5-GII", urgency: "sched",    spec: "SPEC-0142 v3", result: "fail", signedAt: "2026-04-21 09:50" },
  { id: "INS-2026-0474", grn: "GRN-2026-00041", po: "PO-2026-00036", product: "R-1001 Wieprzowina kl. II",   priority: "high",    status: "in_progress", assignedTo: "QA.Inspector2", scheduled: "2026-04-21 10:30", samplingPlan: "ISO-AQL-2.5-GII", urgency: "sched",    spec: "SPEC-0142 v3" },
  { id: "INS-2026-0473", grn: "GRN-2026-00040", po: "PO-2026-00034", product: "R-2101 Pieprz czarny mielony", priority: "normal",  status: "completed",  assignedTo: "QA.Inspector2", scheduled: "2026-04-20 15:00", samplingPlan: "ISO-AQL-2.5-GII", urgency: "sched",    spec: "SPEC-0112 v1", result: "pass", signedAt: "2026-04-20 15:40" },
  { id: "INS-2026-0472", grn: "GRN-2026-00039", po: "TO-2026-00013", product: "R-1002 Słonina wieprzowa",    priority: "normal",  status: "completed",  assignedTo: "QA.Inspector1", scheduled: "2026-04-19 14:00", samplingPlan: "ISO-AQL-2.5-GII", urgency: "sched",    spec: "SPEC-0135 v2", result: "pass", signedAt: "2026-04-19 14:45" },
  { id: "INS-2026-0471", grn: "GRN-2026-00038", po: "PO-2026-00030", product: "R-1001 Wieprzowina kl. II",   priority: "normal",  status: "completed",  assignedTo: "QA.Inspector1", scheduled: "2026-04-19 10:00", samplingPlan: "ISO-AQL-2.5-GII", urgency: "sched",    spec: "SPEC-0142 v3", result: "pass", signedAt: "2026-04-19 10:52" },
  { id: "INS-2026-0470", grn: "GRN-2026-00037", po: "PO-2026-00031", product: "R-1501 Mąka pszenna typ 500", priority: "high",    status: "completed",  assignedTo: "QA.Inspector2", scheduled: "2026-04-18 14:00", samplingPlan: "ISO-AQL-4.0-GII", urgency: "sched",    spec: "SPEC-0118 v1", result: "fail", signedAt: "2026-04-18 14:55" },
  { id: "INS-2026-0469", grn: "GRN-2026-00036", po: "PO-2026-00028", product: "R-1501 Mąka pszenna typ 500", priority: "normal",  status: "completed",  assignedTo: "QA.Inspector2", scheduled: "2026-04-18 09:00", samplingPlan: "ISO-AQL-4.0-GII", urgency: "sched",    spec: "SPEC-0118 v1", result: "pass", signedAt: "2026-04-18 09:35" },
  { id: "INS-2026-0468", grn: "GRN-2026-00035", po: "PO-2026-00026", product: "R-1004 Masło śmietankowe",   priority: "urgent",  status: "pending",    assignedTo: null,            scheduled: "2026-04-21 11:00", samplingPlan: "ISO-AQL-2.5-GII", urgency: "overdue",  spec: "—" },
  { id: "INS-2026-0467", grn: "GRN-2026-00033", po: "PO-2026-00024", product: "R-1001 Wieprzowina kl. II",   priority: "normal",  status: "cancelled",  assignedTo: null,            scheduled: "2026-04-14 10:00", samplingPlan: "ISO-AQL-2.5-GII", urgency: "sched",    spec: "SPEC-0100 v2", result: null, notes: "Cancelled — GRN amended" },
];

// ----- Inspection detail subject (INS-2026-0474 — in progress, Wieprzowina) -----
const QA_INSPECTION_DETAIL = {
  id: "INS-2026-0474",
  grn: "GRN-2026-00041",
  po: "PO-2026-00036",
  supplier: "Baltic Pork Co.",
  receiptDate: "2026-04-20 09:30",
  product: { code: "R-1001", name: "Wieprzowina kl. II" },
  spec: { id: "SPEC-0142", version: 3, status: "active" },
  samplingPlan: { code: "ISO-AQL-2.5-GII", aql: 2.5, level: "GII", lotSize: 840, sampleSize: 32, accept: 2, reject: 3 },
  samplesTaken: 16,
  samplesRequired: 32,
  status: "in_progress",
  priority: "high",
  assignedTo: "QA.Inspector2",
  scheduled: "2026-04-21 10:30",
  startedAt: "2026-04-21 10:32",
  lps: [
    { lp: "LP-4431", qty: 220.5, loc: "Cold › B3" },
    { lp: "LP-4432", qty: 137.5, loc: "Cold › B3" },
  ],
  measurements: [
    { paramIdx: 0, name: "Visual — colour & appearance", type: "Visual",          measured: "Good — pink/red, no discolouration", result: "pass", critical: false },
    { paramIdx: 1, name: "Temperature at receipt",        type: "Measurement",     measured: 3.1,   unit: "°C",    target: 2, min: 0, max: 5, result: "pass", critical: true },
    { paramIdx: 2, name: "pH",                            type: "Chemical",        measured: 5.7,   unit: "pH",    target: 5.6, min: 5.3, max: 6.0, result: "pass", critical: false },
    { paramIdx: 3, name: "Moisture content",              type: "Chemical",        measured: null,  unit: "%",     target: 73.5, min: 72, max: 75, result: "pending", critical: true },
    { paramIdx: 4, name: "Microbiological — TVC",         type: "Microbiological", measured: null,  unit: "log CFU/g", target: 5.0, min: 0, max: 6.0, result: "pending", critical: false },
    { paramIdx: 5, name: "Microbiological — E.coli",      type: "Microbiological", measured: null,  unit: "log CFU/g", target: 0, min: 0, max: 2.0, result: "pending", critical: false },
    { paramIdx: 6, name: "Weight per pallet (net)",       type: "Measurement",     measured: 1001,  unit: "kg",    target: 1000, min: 995, max: 1005, result: "pass", critical: false },
    { paramIdx: 7, name: "Label compliance",              type: "Attribute",       measured: "All fields present and legible", result: "pass", critical: false },
  ],
};

// ----- Sampling Plans (QA-008) -----
const QA_SAMPLING_PLANS = [
  { code: "ISO-AQL-2.5-GII", type: "iso2859", aql: 2.5, level: "GII", lotMin: 501,   lotMax: 1200,  sampleSize: 32,  accept: 2, reject: 3, appliesTo: "incoming", status: "active" },
  { code: "ISO-AQL-2.5-GIII", type: "iso2859", aql: 2.5, level: "GIII", lotMin: 501,  lotMax: 1200,  sampleSize: 50,  accept: 3, reject: 4, appliesTo: "incoming", status: "active" },
  { code: "ISO-AQL-4.0-GII", type: "iso2859", aql: 4.0, level: "GII", lotMin: 501,   lotMax: 1200,  sampleSize: 32,  accept: 3, reject: 4, appliesTo: "incoming", status: "active" },
  { code: "ISO-AQL-1.0-SI",  type: "iso2859", aql: 1.0, level: "S-1", lotMin: 91,    lotMax: 150,   sampleSize: 8,   accept: 0, reject: 1, appliesTo: "final",    status: "active" },
  { code: "FORZA-10TH",      type: "custom",  aql: null, level: "—", lotMin: 1,     lotMax: 99999, sampleSize: null, accept: 0, reject: 1, appliesTo: "all",       status: "active", notes: "1-in-10 pallet sample — Forza internal policy" },
  { code: "ANSI-Z14-GII",    type: "ansi_z14", aql: 2.5, level: "GII", lotMin: 501,  lotMax: 1200,  sampleSize: 32,  accept: 2, reject: 3, appliesTo: "incoming", status: "archived" },
];

// ----- NCR list (QA-009) -----
const QA_NCRS = [
  { id: "NCR-2026-0091", title: "CCP deviation — Pasteurisation temp low on WO-2026-0108",     severity: "critical", type: "process",          status: "open",       source: { type: "CCP deviation",   ref: "CCP-001 reading #5821" }, detectedAt: "2026-04-21 10:15", daysAgo: 0, responseDue: "2026-04-22 10:15", assignedTo: "QA.Lead",      overdue: false, product: "FA5100 Kiełbasa śląska pieczona 450g" },
  { id: "NCR-2026-0090", title: "Moisture out of spec — Wieprzowina kl. II GRN-2026-00043",    severity: "major",    type: "quality",          status: "investigating", source: { type: "Inspection",     ref: "INS-2026-0475" },        detectedAt: "2026-04-21 09:50", daysAgo: 0, responseDue: "2026-04-23 09:50", assignedTo: "QA.Inspector1", overdue: false, product: "R-1001 Wieprzowina kl. II" },
  { id: "NCR-2026-0089", title: "Moisture out of spec — Wieprzowina LP-4820",                    severity: "major",    type: "quality",          status: "open",       source: { type: "Inspection",     ref: "INS-2026-0475" },        detectedAt: "2026-04-21 08:45", daysAgo: 0, responseDue: "2026-04-23 08:45", assignedTo: "QA.Inspector1", overdue: false, product: "R-1001 Wieprzowina kl. II" },
  { id: "NCR-2026-0088", title: "FEFO deviation rate 11.3% exceeds target 5% (7d window)",      severity: "minor",    type: "process",          status: "open",       source: { type: "Scanner",         ref: "FEFO override log" },   detectedAt: "2026-04-20 18:00", daysAgo: 1, responseDue: "2026-04-27 18:00", assignedTo: "QA.Lead",       overdue: false, product: "—" },
  { id: "NCR-2026-0087", title: "Temperature at receipt > 5°C — LP00000045",                    severity: "major",    type: "supplier",         status: "investigating", source: { type: "Hold",          ref: "QH-16" },                detectedAt: "2026-04-20 06:14", daysAgo: 1, responseDue: "2026-04-22 06:14", assignedTo: "QA.Lead",       overdue: false, product: "R-1001 Wieprzowina kl. II" },
  { id: "NCR-2026-0086", title: "Customer complaint CX-2026-991 (ASDA) — Filet z kurczaka off-odour", severity: "major", type: "complaint_related", status: "investigating", source: { type: "Complaint",   ref: "CX-2026-991" },          detectedAt: "2026-04-19 11:40", daysAgo: 2, responseDue: "2026-04-21 11:40", assignedTo: "QA.Lead",       overdue: true,  product: "R-1201 Filet z kurczaka" },
  { id: "NCR-2026-0085", title: "Foreign body — metal detected in Cebula drobna",                severity: "critical", type: "quality",          status: "investigating", source: { type: "Hold",        ref: "QH-18" },                detectedAt: "2026-04-17 16:15", daysAgo: 4, responseDue: "2026-04-18 16:15", assignedTo: "QA.Lead",       overdue: true,  product: "R-1301 Cebula drobna" },
  { id: "NCR-2026-0084", title: "Yield below target on WO-2026-0100 — Pasztet (actual 86% vs target 92%)", severity: "minor", type: "yield_issue", status: "closed",     source: { type: "Production",      ref: "WO-2026-0100" },         detectedAt: "2026-04-17 10:00", daysAgo: 4, responseDue: "2026-04-24 10:00", assignedTo: "QA.Lead",       overdue: false, product: "FA5200 Pasztet drobiowy", closedAt: "2026-04-18 16:20" },
  { id: "NCR-2026-0083", title: "Allergen deviation — nuts trace on allergen-free line, pre-shift",       severity: "major", type: "allergen_deviation", status: "closed", source: { type: "CCP deviation",   ref: "CCP-ATP swab #4412" }, detectedAt: "2026-04-15 06:30", daysAgo: 6, responseDue: "2026-04-17 06:30", assignedTo: "QA.Lead",       overdue: false, product: "FA5300 Pierogi z mięsem 400g", closedAt: "2026-04-16 14:00" },
  { id: "NCR-2026-0082", title: "Under-fill on Pasztet 180g — 3 jars in sample below 175g",      severity: "minor",    type: "quality",          status: "closed",     source: { type: "Inspection",      ref: "INS-2026-0460" },        detectedAt: "2026-04-14 13:00", daysAgo: 7, responseDue: "2026-04-21 13:00", assignedTo: "QA.Inspector2", overdue: false, product: "FA5200 Pasztet drobiowy", closedAt: "2026-04-16 11:00" },
  { id: "NCR-2026-0081", title: "Supplier batch SUP-AGRO-4600 — pH out of range",                severity: "major",    type: "supplier",         status: "closed",     source: { type: "Inspection",      ref: "INS-2026-0455" },        detectedAt: "2026-04-10 10:30", daysAgo: 11, responseDue: "2026-04-12 10:30", assignedTo: "QA.Lead",       overdue: false, product: "R-1001 Wieprzowina kl. II", closedAt: "2026-04-11 15:30" },
  { id: "NCR-2026-0080", title: "Filet z kurczaka — surface blemish on LP-5020",                 severity: "minor",    type: "quality",          status: "closed",     source: { type: "Hold",            ref: "QH-13" },               detectedAt: "2026-04-15 14:11", daysAgo: 6, responseDue: "2026-04-22 14:11", assignedTo: "QA.Inspector2", overdue: false, product: "R-1201 Filet z kurczaka", closedAt: "2026-04-18 10:11" },
];

// ----- NCR detail (NCR-2026-0091) -----
const QA_NCR_DETAIL = {
  id: "NCR-2026-0091",
  title: "CCP deviation — Pasteurisation temp low on WO-2026-0108",
  description: "At 10:15 on 2026-04-21, the CCP-001 Pasteurisation Temperature monitoring record for WO-2026-0108 recorded a reading of 68°C against a critical limit range of 72–75°C. The deviation was detected on the first reading after line start-up. Hygiene lead was notified; the work order was automatically placed on hold by the ccp_deviation_escalation_v1 DSL rule (severity: critical because hazard_type = biological).",
  severity: "critical",
  type: "process",
  status: "open",
  detectedBy: "system (ccp_deviation_escalation_v1)",
  detectedAt: "2026-04-21 10:15",
  detectedLocation: "WH-Factory-A › Production › Line-1",
  product: { code: "FA5100", name: "Kiełbasa śląska pieczona 450g" },
  affectedQty: 0,
  responseDue: "2026-04-22 10:15",
  assignedTo: "QA.Lead",
  rootCause: "",
  rootCauseCategory: "",
  immediateAction: "WO paused. Heating element inspected — thermostat drift detected (readings 4°C low). Calibration recertification initiated.",
  linkedHold: "QH-20",
  linkedInspection: null,
  linkedCcpDeviation: "CCP-001 reading #5821",
  linkedComplaint: null,
  events: [
    { t: "2026-04-21 10:15", type: "create",  user: "system",        op: "INSERT",   desc: "NCR auto-created by ccp_deviation_escalation_v1" },
    { t: "2026-04-21 10:15", type: "update",  user: "system",        op: "UPDATE",   desc: "Linked to hold QH-20 and CCP deviation #5821" },
    { t: "2026-04-21 10:22", type: "update",  user: "Hygiene.Lead",  op: "UPDATE",   desc: "Immediate action recorded: heating element inspected" },
  ],
};

// ----- HACCP plans (QA-013) -----
const QA_HACCP_PLANS = [
  { id: "HACCP-001", code: "HACCP-COOKED-MEAT", productFamily: "Cooked meats (Kiełbasa, Pasztet, Szynka)", version: 3, status: "active", effFrom: "2026-01-01", reviewedAt: "2026-01-15", approvedBy: "QA.Lead", ccps: ["CCP-001", "CCP-002", "CCP-003"] },
  { id: "HACCP-002", code: "HACCP-FROZEN-FILLS", productFamily: "Frozen fills (Pierogi, Farsz)",           version: 2, status: "active", effFrom: "2026-02-01", reviewedAt: "2026-02-10", approvedBy: "QA.Lead", ccps: ["CCP-004", "CCP-005"] },
  { id: "HACCP-003", code: "HACCP-ALLERGEN",     productFamily: "Allergen changeover — all lines",          version: 1, status: "active", effFrom: "2025-10-01", reviewedAt: "2025-10-15", approvedBy: "QA.Lead", ccps: ["CCP-006"] },
  { id: "HACCP-004", code: "HACCP-RAW-PORK",     productFamily: "Raw pork intake",                           version: 1, status: "draft",  effFrom: "2026-05-01", reviewedAt: null,         approvedBy: null,      ccps: ["CCP-007"] },
];

// ----- CCPs (full definitions) -----
const QA_CCPS = [
  { id: "CCP-001", planId: "HACCP-001", code: "CCP-001", step: "Pasteurisation Temperature", hazardType: "biological", hazardDesc: "Pathogen survival (Listeria, Salmonella) if cook temp insufficient", limitMin: 72, limitMax: 75, unit: "°C", monFreq: "Every 15 min during cook", monMethod: "Probe thermometer (validated)", corrective: "Re-cook batch until 72°C reached and held for 2 min. If impossible, batch is scrapped.", verification: "Monthly thermometer calibration", recordMethod: "desktop + scanner", deviationThreshold: 0, readings: [
    { t: "2026-04-21 11:02", v: 73.4, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-21 10:30", v: 72.8, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-21 10:15", v: 68.0, within: false, user: "Hygiene.Lead", ncrRef: "NCR-2026-0091" },
    { t: "2026-04-21 09:45", v: 73.1, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-21 09:15", v: 72.9, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-20 17:00", v: 73.0, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-20 16:45", v: 72.7, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-20 16:30", v: 73.2, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-20 16:15", v: 73.0, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-20 16:00", v: 72.9, within: true,  user: "Hygiene.Lead" },
  ]},
  { id: "CCP-002", planId: "HACCP-001", code: "CCP-002", step: "Chill to 4°C within 90 min", hazardType: "biological", hazardDesc: "Microbial growth during cooling phase", limitMin: 0,  limitMax: 4,  unit: "°C", monFreq: "At 90 min mark (end of cool phase)", monMethod: "IR + probe thermometer", corrective: "Extend cooling, re-verify. If > 4°C after 120 min, batch is quarantined.", verification: "Temperature logs reviewed daily", recordMethod: "desktop", deviationThreshold: 0, readings: [
    { t: "2026-04-21 12:30", v: 3.8, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-20 18:45", v: 3.5, within: true,  user: "Hygiene.Lead" },
    { t: "2026-04-20 15:30", v: 4.2, within: false, user: "Hygiene.Lead", ncrRef: null },
  ]},
  { id: "CCP-003", planId: "HACCP-001", code: "CCP-003", step: "Metal detection (post-pack)",  hazardType: "physical",   hazardDesc: "Metal fragments from equipment (blades, mesh)", limitMin: null, limitMax: null, unit: "—", monFreq: "Continuous (in-line detector)", monMethod: "Metal detector + test wands Fe 1.5, Non-Fe 2.0, SS 2.5 at shift start/end", corrective: "Reject pack to reject bin. Trace last OK pack — hold segment. Test wand verify.", verification: "Shift-start & shift-end wand tests", recordMethod: "scanner", deviationThreshold: 0, readings: [
    { t: "2026-04-21 06:30", v: "Pass (all 3 wands)", within: true,  user: "Line.Lead" },
    { t: "2026-04-20 14:00", v: "Pass (all 3 wands)", within: true,  user: "Line.Lead" },
  ]},
  { id: "CCP-004", planId: "HACCP-002", code: "CCP-004", step: "Blast freeze to -18°C",        hazardType: "biological", hazardDesc: "Microbial growth if freeze rate insufficient", limitMin: -999, limitMax: -18, unit: "°C", monFreq: "Per batch (at 4h mark)", monMethod: "Core probe thermometer", corrective: "Extend blast freeze, recheck at 6h", verification: "Daily calibration", recordMethod: "desktop", deviationThreshold: 0, readings: [
    { t: "2026-04-21 08:00", v: -19.2, within: true, user: "Line.Lead" },
    { t: "2026-04-20 08:00", v: -20.1, within: true, user: "Line.Lead" },
  ]},
  { id: "CCP-005", planId: "HACCP-002", code: "CCP-005", step: "Raw mince microbiology",       hazardType: "biological", hazardDesc: "Pathogens in raw mince input", limitMin: 0, limitMax: 6.0, unit: "log CFU/g", monFreq: "Per batch (incoming)", monMethod: "ISO 4833-1 pour-plate", corrective: "Reject batch if TVC > 6 log", verification: "Monthly lab audit", recordMethod: "desktop", deviationThreshold: 0, readings: [] },
  { id: "CCP-006", planId: "HACCP-003", code: "CCP-006", step: "ATP swab post-clean",           hazardType: "allergen",   hazardDesc: "Allergen cross-contact during changeover", limitMin: 0, limitMax: 10, unit: "RLU", monFreq: "Every changeover to allergen-free product", monMethod: "Hygiena EnSURE-GX", corrective: "Re-clean. Repeat swab until ≤ 10 RLU.", verification: "Validation study annually", recordMethod: "scanner", deviationThreshold: 0, readings: [
    { t: "2026-04-21 05:30", v: 6,  within: true,  user: "Shift.Lead" },
    { t: "2026-04-20 22:00", v: 8,  within: true,  user: "Shift.Lead" },
    { t: "2026-04-20 14:15", v: 14, within: false, user: "Shift.Lead", ncrRef: "NCR-2026-0083" },
  ]},
  { id: "CCP-007", planId: "HACCP-004", code: "CCP-007", step: "Raw pork pH on receipt",        hazardType: "chemical",   hazardDesc: "DFD/PSE meat indicator", limitMin: 5.3, limitMax: 6.0, unit: "pH", monFreq: "Per GRN", monMethod: "pH meter", corrective: "Reject or conditional accept under QA review", verification: "Monthly", recordMethod: "desktop", deviationThreshold: 0, readings: [] },
];

// ----- CCP Deviations (QA-015) derived from readings -----
const QA_DEVIATIONS = [
  { t: "2026-04-21 10:15", ccp: "CCP-001", step: "Pasteurisation Temperature", hazardType: "biological", v: 68,  limit: "72–75 °C", severity: "critical", ncr: "NCR-2026-0091", correctiveAction: "", recordedBy: "Hygiene.Lead", signed: false },
  { t: "2026-04-20 15:30", ccp: "CCP-002", step: "Chill to 4°C within 90 min",  hazardType: "biological", v: 4.2, limit: "0–4 °C",   severity: "critical", ncr: null,             correctiveAction: "Extended cool phase 20 min. Re-verified at 3.8°C.", recordedBy: "Hygiene.Lead", signed: true },
  { t: "2026-04-20 14:15", ccp: "CCP-006", step: "ATP swab post-clean",         hazardType: "allergen",    v: 14,  limit: "≤10 RLU",  severity: "critical", ncr: "NCR-2026-0083", correctiveAction: "Re-cleaned Line-3. Second swab 6 RLU (pass).", recordedBy: "Shift.Lead",   signed: true },
];

// ----- Allergen Changeover Gates (QA-016) -----
const QA_ALLERGEN_GATES = [
  { id: "ACG-2026-0042", woFrom: "WO-2026-0041", woTo: "WO-2026-0042", allergensRemoved: ["Nuts"], allergensAdded: [], riskLevel: "medium", cleaningComplete: true, atpRlu: 6, atpThreshold: 10, firstSigner: { user: "Shift.Lead1", at: "2026-04-21 05:28" }, secondSigner: null, status: "pending_second_sign" },
  { id: "ACG-2026-0041", woFrom: "WO-2026-0040", woTo: "WO-2026-0041", allergensRemoved: ["Milk"], allergensAdded: ["Nuts"], riskLevel: "high",   cleaningComplete: true, atpRlu: 8, atpThreshold: 10, firstSigner: { user: "Shift.Lead1", at: "2026-04-21 02:10" }, secondSigner: null, status: "pending_second_sign" },
  { id: "ACG-2026-0040", woFrom: "WO-2026-0039", woTo: "WO-2026-0040", allergensRemoved: ["Gluten"], allergensAdded: ["Milk"], riskLevel: "high", cleaningComplete: true, atpRlu: 4, atpThreshold: 10, firstSigner: { user: "Shift.Lead2", at: "2026-04-20 22:30" }, secondSigner: { user: "QA.Lead", at: "2026-04-20 23:02" }, status: "approved" },
  { id: "ACG-2026-0039", woFrom: "WO-2026-0038", woTo: "WO-2026-0039", allergensRemoved: [],          allergensAdded: ["Gluten"], riskLevel: "low",  cleaningComplete: true, atpRlu: 3, atpThreshold: 10, firstSigner: { user: "Shift.Lead2", at: "2026-04-20 18:15" }, secondSigner: { user: "QA.Lead", at: "2026-04-20 18:40" }, status: "approved" },
  { id: "ACG-2026-0038", woFrom: "WO-2026-0037", woTo: "WO-2026-0038", allergensRemoved: ["Nuts"],   allergensAdded: [],         riskLevel: "medium", cleaningComplete: true, atpRlu: 14, atpThreshold: 10, firstSigner: { user: "Shift.Lead2", at: "2026-04-20 13:00" }, secondSigner: null, status: "rejected", rejectReason: "ATP 14 RLU exceeds 10 RLU threshold. Line re-cleaned under ACG-2026-0043." },
  { id: "ACG-2026-0037", woFrom: "WO-2026-0036", woTo: "WO-2026-0037", allergensRemoved: [],          allergensAdded: [],         riskLevel: "low",    cleaningComplete: true, atpRlu: 2, atpThreshold: 10, firstSigner: { user: "Shift.Lead1", at: "2026-04-20 06:00" }, secondSigner: { user: "QA.Lead", at: "2026-04-20 06:20" }, status: "approved" },
];

// ----- Audit trail events (QA-021) -----
const QA_AUDIT = [
  { t: "2026-04-21 10:15:42", table: "ccp_monitoring_records", recordId: "#5821",          op: "INSERT",  user: "Hygiene.Lead",   fields: "within_limits, measured_value, deviation_id", ip: "10.1.1.22", oldData: null, newData: { measured_value: 68, within_limits: false, deviation_id: "DEV-2026-0148" } },
  { t: "2026-04-21 10:15:42", table: "ncr_reports",            recordId: "NCR-2026-0091", op: "INSERT",  user: "system",         fields: "status=draft, severity=critical, source_ccp_deviation_id", ip: "10.1.1.1", oldData: null, newData: { id: "NCR-2026-0091", status: "draft", severity: "critical" } },
  { t: "2026-04-21 10:15:42", table: "quality_holds",          recordId: "QH-20",         op: "INSERT",  user: "system",         fields: "hold_status=escalated, priority=critical, reason_code_id", ip: "10.1.1.1", oldData: null, newData: { id: "QH-20", hold_status: "escalated", priority: "critical" } },
  { t: "2026-04-21 09:50:15", table: "quality_inspections",    recordId: "INS-2026-0475", op: "SIGN",    user: "QA.Inspector1",  fields: "signed_at, signature_hash, result=fail",    ip: "10.1.1.45", oldData: { result: null, signed_at: null }, newData: { result: "fail", signed_at: "2026-04-21 09:50:15", signature_hash: "a3f9c2d1e4b7..." } },
  { t: "2026-04-21 09:50:15", table: "ncr_reports",            recordId: "NCR-2026-0089", op: "INSERT",  user: "system",         fields: "auto-created from inspection fail",         ip: "10.1.1.1",  oldData: null, newData: { id: "NCR-2026-0089", status: "draft", severity: "major" } },
  { t: "2026-04-21 08:40:03", table: "quality_holds",          recordId: "QH-24",         op: "INSERT",  user: "QA.Inspector1",  fields: "ref_type, ref_id, priority, reason",        ip: "10.1.1.45", oldData: null, newData: { id: "QH-24", ref_type: "LP", ref_id: "LP-4820", priority: "critical" } },
  { t: "2026-04-20 23:02:41", table: "allergen_changeover_validations", recordId: "ACG-2026-0040", op: "SIGN", user: "QA.Lead",  fields: "second_signed_by, second_signed_at, validation_result=approved", ip: "10.1.1.44", oldData: { validation_result: "pending_second_sign" }, newData: { validation_result: "approved", second_signed_by: "QA.Lead" } },
  { t: "2026-04-20 18:05:11", table: "quality_holds",          recordId: "QH-14",         op: "RELEASE", user: "QA.Lead",        fields: "hold_status=released, released_at, disposition, release_notes", ip: "10.1.1.44", oldData: { hold_status: "open" }, newData: { hold_status: "released", disposition: "release_as_is" } },
  { t: "2026-04-20 14:20:33", table: "ncr_reports",            recordId: "NCR-2026-0084", op: "CLOSE",   user: "QA.Lead",        fields: "status=closed, closed_at, closure_signature_hash", ip: "10.1.1.44", oldData: { status: "investigating" }, newData: { status: "closed", closed_at: "2026-04-20 14:20:33" } },
  { t: "2026-04-18 14:15:09", table: "quality_specifications", recordId: "SPEC-0142",     op: "APPROVE", user: "QA.Lead",        fields: "status=active, approved_by, approved_at, allergen_profile", ip: "10.1.1.44", oldData: { status: "under_review" }, newData: { status: "active", approved_by: "QA.Lead" } },
  { t: "2026-04-17 16:30:42", table: "quality_specifications", recordId: "SPEC-0100",     op: "UPDATE",  user: "system",         fields: "status=superseded, superseded_by=SPEC-0142", ip: "10.1.1.1", oldData: { status: "active" }, newData: { status: "superseded", superseded_by: "SPEC-0142" } },
  { t: "2026-04-17 10:05:21", table: "ncr_reports",            recordId: "NCR-2026-0085", op: "INSERT",  user: "QA.Inspector1",  fields: "severity=critical, source=hold QH-18", ip: "10.1.1.45", oldData: null, newData: { id: "NCR-2026-0085", severity: "critical" } },
  { t: "2026-04-15 02:00:01", table: "quality_holds",          recordId: "QH-12",         op: "INSERT",  user: "system (cron)",  fields: "auto-hold use_by expired LP00000007", ip: "10.1.1.1", oldData: null, newData: { id: "QH-12", ref_id: "LP00000007", hold_status: "quarantined" } },
];

// ----- Settings (QA-099) reference data -----
const QA_HOLD_REASONS = [
  { code: "contamination",   label: "Contamination (biological/chemical/physical)",   defaultDuration: 7, category: "Contamination" },
  { code: "temperature",     label: "Temperature excursion",                         defaultDuration: 2, category: "Temperature" },
  { code: "documentation",   label: "Documentation / CoA missing",                   defaultDuration: 5, category: "Documentation" },
  { code: "spec_deviation",  label: "Out of specification",                           defaultDuration: 5, category: "Specification Deviation" },
  { code: "allergen",        label: "Allergen suspicion / deviation",                defaultDuration: 7, category: "Allergen" },
  { code: "supplier",        label: "Supplier query / CoA pending",                  defaultDuration: 5, category: "Supplier" },
  { code: "customer_complaint", label: "Customer complaint investigation",            defaultDuration: 3, category: "Other" },
  { code: "other",           label: "Other (describe)",                               defaultDuration: 3, category: "Other" },
];

const QA_FAILURE_REASONS = [
  { code: "out_of_spec",     label: "Out of spec measurement" },
  { code: "contamination",   label: "Contamination (visual/chemical)" },
  { code: "foreign_body",    label: "Foreign body" },
  { code: "microbiological_failure", label: "Microbiological failure" },
  { code: "allergen_cross_contact", label: "Allergen cross-contact" },
  { code: "weight_below_min", label: "Weight below spec min" },
  { code: "other",           label: "Other (describe)" },
];

Object.assign(window, {
  QA_NAV, QA_KPIS, QA_CRITICAL_ALERTS,
  QA_HOLDS, QA_HOLD_DETAIL,
  QA_SPECS, QA_SPEC_DETAIL,
  QA_TEMPLATES,
  QA_INSPECTIONS, QA_INSPECTION_DETAIL,
  QA_SAMPLING_PLANS,
  QA_NCRS, QA_NCR_DETAIL,
  QA_HACCP_PLANS, QA_CCPS, QA_DEVIATIONS,
  QA_ALLERGEN_GATES,
  QA_AUDIT,
  QA_HOLD_REASONS, QA_FAILURE_REASONS,
});
