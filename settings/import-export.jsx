// =============================================================================
// Import / Export — bulk CSV operations across entities
// One-stop place to download/upload reference data and master records.
// =============================================================================

window.SETTINGS_IMPEX_ENTITIES = [
  { key: "fg",         icon: "▢", group: "Master data",
    label: "Finished goods (FG)",
    desc: "FG codes, descriptions, status, MOQ, allergens.",
    count: 248, fields: 14, lastExport: "2 days ago", lastImport: "12 May 2026 · K. Nowak", canImport: true },
  { key: "components", icon: "◇", group: "Master data",
    label: "Components & raw materials",
    desc: "Raw materials, packaging, sub-assemblies. Approved suppliers per item.",
    count: 1340, fields: 18, lastExport: "Today", lastImport: "Never", canImport: true },
  { key: "boms",       icon: "⛓", group: "Master data",
    label: "BOMs & recipes",
    desc: "Bill-of-materials with quantities, scaling factors, yield.",
    count: 412, fields: 9, lastExport: "Yesterday", lastImport: "08 May 2026 · M. Wiśniewska", canImport: true },
  { key: "suppliers",  icon: "↔", group: "Master data",
    label: "Suppliers & customers",
    desc: "Trade partners with addresses, contact, payment terms.",
    count: 156, fields: 22, lastExport: "1 week ago", lastImport: "Never", canImport: true },

  { key: "briefs",     icon: "✦", group: "NPD",
    label: "NPD briefs",
    desc: "Customer briefs incl. concept brief, customer requirements, target cost.",
    count: 64, fields: 31, lastExport: "Today", lastImport: "—", canImport: false },
  { key: "formulation", icon: "⚗", group: "NPD",
    label: "Formulation snapshots",
    desc: "Recipes per project (FA-…) with WIPs, ingredients, %.",
    count: 218, fields: 17, lastExport: "Yesterday", lastImport: "—", canImport: false },
  { key: "allergens",  icon: "⚠", group: "NPD",
    label: "Allergens matrix",
    desc: "Per-FG allergen presence + cross-contamination flags. Auditor-ready.",
    count: 248, fields: 16, lastExport: "Today", lastImport: "—", canImport: false },

  { key: "docs",       icon: "▭", group: "Documents",
    label: "Document register",
    desc: "All attached docs across modules (specs, COAs, certificates).",
    count: 3128, fields: 11, lastExport: "Today", lastImport: "—", canImport: false },
  { key: "users",      icon: "◉", group: "Access",
    label: "Users & roles",
    desc: "User accounts with role, site, status. Bulk-create from CSV.",
    count: 47, fields: 8, lastExport: "Today", lastImport: "12 May 2026 · A. Zając", canImport: true },
];

window.SETTINGS_IMPEX_RECENT = [
  { id: "JOB-2486", kind: "export", entity: "Finished goods", rows: 248, who: "K. Nowak",   when: "13 May · 14:22", status: "done"     },
  { id: "JOB-2485", kind: "import", entity: "Components",     rows: 32,  who: "M. Wiśniewska", when: "13 May · 11:08", status: "done"  },
  { id: "JOB-2484", kind: "import", entity: "BOMs & recipes", rows: 4,   who: "K. Nowak",   when: "13 May · 09:55", status: "warning",
    note: "4 rows imported, 2 rows skipped — duplicate FG codes." },
  { id: "JOB-2483", kind: "export", entity: "Allergens matrix", rows: 248, who: "A. Zając", when: "12 May · 17:30", status: "done"    },
  { id: "JOB-2482", kind: "import", entity: "Users & roles",  rows: 12,  who: "A. Zając",  when: "12 May · 16:14", status: "error",
    note: "Validation failed — 3 emails already exist. No rows imported." },
];

// ============================================================
// Import / Export screen
// ============================================================
const ImportExportScreen = () => {
  const [filter, setFilter] = React.useState("all");
  const groups = ["Master data", "NPD", "Documents", "Access"];
  const [drawer, setDrawer] = React.useState(null); // { mode: "import"|"export", entity }

  const visible = window.SETTINGS_IMPEX_ENTITIES.filter(e =>
    filter === "all" || (filter === "importable" ? e.canImport : e.group === filter)
  );

  return (
    <>
      <PageHead
        title="Import / Export"
        sub="Bulk-move data in and out of MonoPilot using CSV. Every job is logged in audit." />

      {/* Filter chips */}
      <div className="impex-filters">
        <button className={"impex-chip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>All entities</button>
        <button className={"impex-chip" + (filter === "importable" ? " active" : "")} onClick={() => setFilter("importable")}>Importable only</button>
        <span className="impex-divider" />
        {groups.map(g => (
          <button key={g} className={"impex-chip" + (filter === g ? " active" : "")} onClick={() => setFilter(g)}>{g}</button>
        ))}
      </div>

      {/* Entity table */}
      <div className="impex-table">
        <div className="impex-thead">
          <div>Entity</div>
          <div>Records</div>
          <div>Last export</div>
          <div>Last import</div>
          <div></div>
        </div>
        {visible.map(e => (
          <div key={e.key} className="impex-row">
            <div className="impex-entity">
              <div className="impex-ic">{e.icon}</div>
              <div>
                <div className="impex-label">{e.label}</div>
                <div className="impex-desc">{e.desc}</div>
                <div className="impex-meta">{e.fields} fields · group: {e.group}</div>
              </div>
            </div>
            <div className="impex-count">
              <div className="num">{e.count.toLocaleString()}</div>
              <div className="muted">records</div>
            </div>
            <div className="muted">{e.lastExport}</div>
            <div className="muted">{e.canImport ? e.lastImport : <span className="impex-badge gray">read-only</span>}</div>
            <div className="impex-actions">
              <button className="btn btn-secondary" onClick={() => setDrawer({ mode: "export", entity: e })}>↓ Export</button>
              {e.canImport && <button className="btn btn-primary" onClick={() => setDrawer({ mode: "import", entity: e })}>↑ Import</button>}
            </div>
          </div>
        ))}
      </div>

      {/* Recent jobs */}
      <Section title="Recent jobs" right={<a className="link">View all in audit log</a>}>
        <div className="impex-jobs">
          {window.SETTINGS_IMPEX_RECENT.map(j => (
            <div key={j.id} className={"impex-job impex-job-" + j.status}>
              <div className="impex-job-id mono">{j.id}</div>
              <div className={"impex-job-kind kind-" + j.kind}>{j.kind === "import" ? "↑ Import" : "↓ Export"}</div>
              <div className="impex-job-entity">{j.entity}</div>
              <div className="impex-job-rows mono">{j.rows} rows</div>
              <div className="impex-job-who muted">{j.who}</div>
              <div className="impex-job-when muted">{j.when}</div>
              <div className={"impex-job-status status-" + j.status}>
                {j.status === "done" ? "✓ Completed"
                  : j.status === "warning" ? "⚠ Completed with warnings"
                  : "✕ Failed"}
              </div>
              {j.note && <div className="impex-job-note">{j.note}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* Drawer */}
      {drawer && <ImpexDrawer drawer={drawer} onClose={() => setDrawer(null)} />}
    </>
  );
};

// ============================================================
// Drawer — Import wizard or Export config (lives in same shell)
// ============================================================
const ImpexDrawer = ({ drawer, onClose }) => {
  const { mode, entity } = drawer;
  return (
    <div className="impex-drawer-backdrop" onClick={onClose}>
      <div className="impex-drawer" onClick={e => e.stopPropagation()}>
        <div className="impex-drawer-head">
          <div>
            <div className="impex-drawer-kicker">{mode === "import" ? "Import CSV" : "Export CSV"}</div>
            <div className="impex-drawer-title">{entity.label}</div>
            <div className="muted" style={{ fontSize: 12 }}>{entity.count.toLocaleString()} records · {entity.fields} fields</div>
          </div>
          <button className="impex-drawer-close" onClick={onClose}>✕</button>
        </div>

        {mode === "export" ? <ExportPanel entity={entity} onClose={onClose} /> : <ImportPanel entity={entity} onClose={onClose} />}
      </div>
    </div>
  );
};

// ============================================================
// Export panel — pick fields + filters, produce file
// ============================================================
const ExportPanel = ({ entity, onClose }) => {
  const fields = window.SETTINGS_IMPEX_FIELDS[entity.key] || [];
  const [picked, setPicked] = React.useState(() => new Set(fields.filter(f => f.default).map(f => f.key)));
  const [format, setFormat] = React.useState("csv");
  const [scope, setScope] = React.useState("all");
  const [running, setRunning] = React.useState(false);

  const togglePick = (k) => {
    const next = new Set(picked);
    if (next.has(k)) next.delete(k); else next.add(k);
    setPicked(next);
  };

  return (
    <>
      <div className="impex-drawer-body">
        <div className="impex-section-h">Format</div>
        <div className="impex-radio-row">
          <label className={"impex-radio" + (format === "csv" ? " active" : "")}>
            <input type="radio" checked={format === "csv"} onChange={() => setFormat("csv")} />
            <div>
              <div className="impex-radio-t">CSV</div>
              <div className="impex-radio-d">UTF-8, comma-separated, quoted strings.</div>
            </div>
          </label>
          <label className={"impex-radio" + (format === "xlsx" ? " active" : "")}>
            <input type="radio" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
            <div>
              <div className="impex-radio-t">Excel (.xlsx)</div>
              <div className="impex-radio-d">Native Excel with column types.</div>
            </div>
          </label>
        </div>

        <div className="impex-section-h" style={{ marginTop: 20 }}>Scope</div>
        <div className="impex-radio-row">
          <label className={"impex-radio" + (scope === "all" ? " active" : "")}>
            <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />
            <div>
              <div className="impex-radio-t">All records</div>
              <div className="impex-radio-d">{entity.count.toLocaleString()} rows</div>
            </div>
          </label>
          <label className={"impex-radio" + (scope === "active" ? " active" : "")}>
            <input type="radio" checked={scope === "active"} onChange={() => setScope("active")} />
            <div>
              <div className="impex-radio-t">Active only</div>
              <div className="impex-radio-d">Excludes archived/inactive.</div>
            </div>
          </label>
        </div>

        <div className="impex-section-h" style={{ marginTop: 20 }}>
          Fields
          <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>{picked.size} of {fields.length} selected</span>
          <div className="impex-section-actions">
            <button className="link" onClick={() => setPicked(new Set(fields.map(f => f.key)))}>Select all</button>
            <button className="link" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        </div>
        <div className="impex-fields">
          {fields.map(f => (
            <label key={f.key} className={"impex-field" + (picked.has(f.key) ? " picked" : "") + (f.required ? " required" : "")}>
              <input type="checkbox" checked={picked.has(f.key)} disabled={f.required} onChange={() => togglePick(f.key)} />
              <div>
                <div className="impex-field-name">
                  {f.label}
                  {f.required && <span className="impex-field-tag">required</span>}
                </div>
                <div className="impex-field-key mono">{f.key}</div>
              </div>
              <div className="impex-field-type">{f.type}</div>
            </label>
          ))}
        </div>
      </div>

      <div className="impex-drawer-foot">
        <div className="muted">
          Will export <strong>{scope === "all" ? entity.count.toLocaleString() : Math.round(entity.count * 0.85).toLocaleString()}</strong> rows
          {' '}with <strong>{picked.size}</strong> columns.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={running || picked.size === 0} onClick={() => { setRunning(true); setTimeout(() => { setRunning(false); onClose(); }, 1100); }}>
            {running ? "Generating…" : `↓ Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </>
  );
};

// ============================================================
// Import panel — file picker → field mapping → preview → run
// ============================================================
const ImportPanel = ({ entity, onClose }) => {
  const [step, setStep] = React.useState(1); // 1 upload, 2 mapping, 3 preview
  const fields = window.SETTINGS_IMPEX_FIELDS[entity.key] || [];
  const sample = window.SETTINGS_IMPEX_SAMPLE[entity.key] || { headers: [], rows: [], filename: "import.csv" };
  const [mode, setMode] = React.useState("upsert");

  return (
    <>
      <div className="impex-drawer-body">
        <div className="impex-stepper">
          {["Upload file", "Map fields", "Review & run"].map((s, i) => (
            <div key={s} className={"impex-step" + (step === i + 1 ? " active" : "") + (step > i + 1 ? " done" : "")}>
              <div className="impex-step-n">{step > i + 1 ? "✓" : i + 1}</div>
              <span>{s}</span>
              {i < 2 && <div className="impex-step-line" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <div className="impex-dropzone" onClick={() => setStep(2)}>
              <div className="impex-drop-icon">⤓</div>
              <div className="impex-drop-t">Drop CSV or Excel file here</div>
              <div className="impex-drop-d">or click to browse · max 50 MB</div>
              <button className="btn btn-secondary" style={{ marginTop: 14 }}>Choose file…</button>
            </div>

            <div className="impex-help">
              <div className="impex-help-t">First time importing {entity.label}?</div>
              <div className="impex-help-d">Download our template — it has all required columns and example rows.</div>
              <button className="link">↓ Download template ({entity.fields} columns)</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="impex-uploaded">
              <div className="impex-uploaded-ic">📄</div>
              <div style={{ flex: 1 }}>
                <div className="impex-uploaded-name">{sample.filename}</div>
                <div className="muted" style={{ fontSize: 12 }}>{sample.rows.length} data rows · {sample.headers.length} columns · 24 KB</div>
              </div>
              <button className="link" onClick={() => setStep(1)}>Replace</button>
            </div>

            <div className="impex-section-h" style={{ marginTop: 20 }}>Map columns to fields</div>
            <div className="impex-mapping">
              <div className="impex-mapping-head">
                <div>CSV column</div>
                <div></div>
                <div>MonoPilot field</div>
                <div>Sample</div>
              </div>
              {sample.headers.map((h, i) => {
                const auto = fields.find(f => f.key === h || f.label.toLowerCase() === h.toLowerCase());
                return (
                  <div key={h} className={"impex-mapping-row" + (auto ? " auto" : " unmapped")}>
                    <div className="impex-csv-col mono">{h}</div>
                    <div className="impex-arrow">→</div>
                    <div>
                      <select defaultValue={auto?.key || ""}>
                        <option value="">— Skip column —</option>
                        {fields.map(f => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                      </select>
                      {auto && <div className="impex-auto">✓ Auto-matched</div>}
                    </div>
                    <div className="impex-csv-sample muted mono">{sample.rows[0]?.[i]}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="impex-section-h">Import behaviour</div>
            <div className="impex-radio-row">
              <label className={"impex-radio" + (mode === "upsert" ? " active" : "")}>
                <input type="radio" checked={mode === "upsert"} onChange={() => setMode("upsert")} />
                <div>
                  <div className="impex-radio-t">Upsert (recommended)</div>
                  <div className="impex-radio-d">Update existing records by key, create new ones.</div>
                </div>
              </label>
              <label className={"impex-radio" + (mode === "create" ? " active" : "")}>
                <input type="radio" checked={mode === "create"} onChange={() => setMode("create")} />
                <div>
                  <div className="impex-radio-t">Create only</div>
                  <div className="impex-radio-d">Skip rows whose key already exists.</div>
                </div>
              </label>
              <label className={"impex-radio" + (mode === "replace" ? " active" : "")}>
                <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                <div>
                  <div className="impex-radio-t">Replace all</div>
                  <div className="impex-radio-d">Delete records not in this file. Dangerous.</div>
                </div>
              </label>
            </div>

            <div className="impex-section-h" style={{ marginTop: 20 }}>Validation summary</div>
            <div className="impex-validation">
              <div className="impex-vstat ok">
                <div className="vstat-num">{sample.rows.length - 2}</div>
                <div className="vstat-l">Ready to import</div>
              </div>
              <div className="impex-vstat warn">
                <div className="vstat-num">2</div>
                <div className="vstat-l">Will overwrite existing</div>
              </div>
              <div className="impex-vstat err">
                <div className="vstat-num">0</div>
                <div className="vstat-l">Errors</div>
              </div>
            </div>

            <div className="impex-section-h" style={{ marginTop: 20 }}>Preview · first 5 rows</div>
            <div className="impex-preview">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {sample.headers.map(h => <th key={h}>{h}</th>)}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sample.rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      <td className="muted mono">{i + 1}</td>
                      {r.map((c, j) => <td key={j} className="mono">{c}</td>)}
                      <td><span className={"impex-row-status " + (i < 2 ? "warn" : "ok")}>{i < 2 ? "Update" : "Create"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="impex-drawer-foot">
        <button className="link" onClick={onClose}>Cancel</button>
        <div style={{ display: "flex", gap: 8 }}>
          {step > 1 && <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>← Back</button>}
          {step < 3 && <button className="btn btn-primary" onClick={() => setStep(step + 1)}>{step === 1 ? "Continue" : "Next: Review"}</button>}
          {step === 3 && <button className="btn btn-primary" onClick={onClose}>↑ Run import ({sample.rows.length} rows)</button>}
        </div>
      </div>
    </>
  );
};

// ============================================================
// Per-entity field definitions and sample CSVs
// ============================================================
window.SETTINGS_IMPEX_FIELDS = {
  fg: [
    { key: "fg_code",     label: "FG code",          type: "text",     required: true,  default: true },
    { key: "description", label: "Description",      type: "text",     required: true,  default: true },
    { key: "uom",         label: "Unit of measure",  type: "enum",     required: true,  default: true },
    { key: "status",      label: "Status",           type: "enum",     required: false, default: true },
    { key: "moq",         label: "MOQ",              type: "number",   required: false, default: true },
    { key: "shelf_life",  label: "Shelf life (days)",type: "number",   required: false, default: true },
    { key: "weight_g",    label: "Net weight (g)",   type: "number",   required: false, default: true },
    { key: "barcode",     label: "EAN-13 barcode",   type: "text",     required: false, default: true },
    { key: "category",    label: "Category",         type: "text",     required: false, default: false },
    { key: "brand",       label: "Brand",            type: "text",     required: false, default: false },
    { key: "country",     label: "Country of origin",type: "text",     required: false, default: false },
    { key: "tariff_code", label: "Tariff code",      type: "text",     required: false, default: false },
    { key: "allergens",   label: "Allergens (csv)",  type: "list",     required: false, default: true },
    { key: "vat_rate",    label: "VAT rate",         type: "number",   required: false, default: false },
  ],
  components: [
    { key: "code",        label: "Component code",   type: "text",     required: true,  default: true },
    { key: "description", label: "Description",      type: "text",     required: true,  default: true },
    { key: "type",        label: "Type",             type: "enum",     required: true,  default: true },
    { key: "uom",         label: "Unit of measure",  type: "enum",     required: true,  default: true },
    { key: "supplier",    label: "Default supplier", type: "text",     required: false, default: true },
    { key: "cost",        label: "Standard cost",    type: "money",    required: false, default: true },
    { key: "lead_time",   label: "Lead time (days)", type: "number",   required: false, default: true },
    { key: "allergens",   label: "Allergens",        type: "list",     required: false, default: true },
  ],
  boms: [
    { key: "fg_code",     label: "Parent FG code",   type: "text",     required: true,  default: true },
    { key: "version",     label: "Version",          type: "text",     required: true,  default: true },
    { key: "component",   label: "Component code",   type: "text",     required: true,  default: true },
    { key: "qty",         label: "Quantity",         type: "number",   required: true,  default: true },
    { key: "uom",         label: "UoM",              type: "enum",     required: true,  default: true },
    { key: "scrap_pct",   label: "Scrap %",          type: "number",   required: false, default: true },
  ],
  suppliers: [
    { key: "code",        label: "Partner code",     type: "text",     required: true,  default: true },
    { key: "name",        label: "Name",             type: "text",     required: true,  default: true },
    { key: "type",        label: "Type",             type: "enum",     required: true,  default: true },
    { key: "country",     label: "Country",          type: "text",     required: false, default: true },
    { key: "vat_id",      label: "VAT ID",           type: "text",     required: false, default: true },
    { key: "payment",     label: "Payment terms",    type: "text",     required: false, default: false },
  ],
  briefs: [
    { key: "brief_id",    label: "Brief ID",         type: "text",     required: true,  default: true },
    { key: "customer",    label: "Customer",         type: "text",     required: true,  default: true },
    { key: "fg_code",     label: "Target FG code",   type: "text",     required: false, default: true },
    { key: "target_cost", label: "Target cost",      type: "money",    required: false, default: true },
    { key: "deadline",    label: "Deadline",         type: "date",     required: false, default: true },
    { key: "status",      label: "Status",           type: "enum",     required: false, default: true },
  ],
  formulation: [
    { key: "fa_code",     label: "FA code",          type: "text",     required: true,  default: true },
    { key: "fg_code",     label: "FG code",          type: "text",     required: true,  default: true },
    { key: "wip_code",    label: "WIP code",         type: "text",     required: false, default: true },
    { key: "ingredient",  label: "Ingredient",       type: "text",     required: true,  default: true },
    { key: "pct",         label: "Percentage",       type: "number",   required: true,  default: true },
  ],
  allergens: [
    { key: "fg_code",     label: "FG code",          type: "text",     required: true,  default: true },
    { key: "gluten",      label: "Gluten",           type: "bool",     required: false, default: true },
    { key: "milk",        label: "Milk",             type: "bool",     required: false, default: true },
    { key: "egg",         label: "Egg",              type: "bool",     required: false, default: true },
    { key: "soy",         label: "Soy",              type: "bool",     required: false, default: true },
    { key: "nuts",        label: "Tree nuts",        type: "bool",     required: false, default: true },
  ],
  docs: [
    { key: "doc_id",      label: "Document ID",      type: "text",     required: true,  default: true },
    { key: "module",      label: "Module",           type: "enum",     required: true,  default: true },
    { key: "linked_to",   label: "Linked to",        type: "text",     required: false, default: true },
    { key: "filename",    label: "File name",        type: "text",     required: false, default: true },
  ],
  users: [
    { key: "email",       label: "Email",            type: "email",    required: true,  default: true },
    { key: "first_name",  label: "First name",       type: "text",     required: true,  default: true },
    { key: "last_name",   label: "Last name",        type: "text",     required: true,  default: true },
    { key: "role",        label: "Role",             type: "enum",     required: true,  default: true },
    { key: "site",        label: "Site",             type: "text",     required: false, default: true },
    { key: "status",      label: "Status",           type: "enum",     required: false, default: true },
  ],
};

// Sample uploaded files (used for the import preview)
window.SETTINGS_IMPEX_SAMPLE = {
  fg: {
    filename: "fg_q2_update.csv",
    headers: ["fg_code", "description", "uom", "status", "moq", "shelf_life", "weight_g", "barcode", "allergens"],
    rows: [
      ["FG2401", "White Sliced Loaf 800g",   "EA", "active",   "120", "5",  "800",  "5901234567890", "gluten"],
      ["FG2402", "Wholemeal Loaf 800g",      "EA", "active",   "120", "5",  "800",  "5901234567906", "gluten"],
      ["FG2511", "Multigrain Loaf 600g",     "EA", "draft",    "200", "6",  "600",  "5901234568002", "gluten,sesame"],
      ["FG2512", "Sourdough Boule 500g",     "EA", "draft",    "60",  "8",  "500",  "5901234568019", "gluten"],
      ["FG2513", "Brioche Buns 6pk",         "EA", "draft",    "240", "7",  "300",  "5901234568026", "gluten,milk,egg"],
      ["FG2514", "Rye Loaf 500g",            "EA", "draft",    "100", "9",  "500",  "5901234568033", "gluten"],
    ],
  },
  components: {
    filename: "components_may_intake.csv",
    headers: ["code", "description", "type", "uom", "supplier", "cost"],
    rows: [
      ["RM-FLOUR-T550", "Wheat flour T550",       "raw",  "kg", "Wessex Mills",   "0.42"],
      ["RM-YEAST-FRSH", "Fresh yeast",            "raw",  "kg", "Lallemand UK",   "2.10"],
      ["RM-SALT-FINE",  "Salt, fine table",       "raw",  "kg", "British Salt",   "0.18"],
      ["PK-BAG-800G",   "Polypropylene bag 800g", "pack", "EA", "Sealed Air",     "0.07"],
    ],
  },
  boms: {
    filename: "boms_v2_update.csv",
    headers: ["fg_code", "version", "component", "qty", "uom", "scrap_pct"],
    rows: [
      ["FG2401", "v2.1", "RM-FLOUR-T550", "0.520", "kg", "1.5"],
      ["FG2401", "v2.1", "RM-WATER",      "0.330", "kg", "0.0"],
      ["FG2401", "v2.1", "RM-YEAST-FRSH", "0.012", "kg", "0.0"],
      ["FG2401", "v2.1", "RM-SALT-FINE",  "0.010", "kg", "0.0"],
      ["FG2401", "v2.1", "PK-BAG-800G",   "1.000", "EA", "0.5"],
    ],
  },
  suppliers: {
    filename: "new_suppliers.csv",
    headers: ["code", "name", "type", "country", "vat_id"],
    rows: [
      ["SUP-0421", "Wessex Mills Ltd",      "supplier", "UK", "GB452367812"],
      ["SUP-0422", "Lallemand UK",          "supplier", "UK", "GB229874512"],
      ["CUS-1004", "Tesco Stores Ltd",      "customer", "UK", "GB220430270"],
    ],
  },
  users: {
    filename: "users_apex_h1.csv",
    headers: ["email", "first_name", "last_name", "role", "site"],
    rows: [
      ["t.brown@apex.pl",      "Tomasz",     "Brown",   "Operator", "Wrocław"],
      ["m.johnson@apex.pl",    "Magdalena",  "Johnson", "QA",       "Kraków HQ"],
      ["k.walker@apex.pl",     "Kasia",      "Walker",  "Manager",  "Kraków HQ"],
      ["p.evans@apex.pl",      "Piotr",      "Evans",   "Operator", "Wrocław"],
    ],
  },
  // Read-only / export-only entities — empty sample (won't be reached)
  briefs: { filename: "", headers: [], rows: [] },
  formulation: { filename: "", headers: [], rows: [] },
  allergens: { filename: "", headers: [], rows: [] },
  docs: { filename: "", headers: [], rows: [] },
};

Object.assign(window, { ImportExportScreen });
