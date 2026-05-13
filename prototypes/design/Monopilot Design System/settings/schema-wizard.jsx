// ============================================================
// SET-031 — Column Edit Wizard (Schema Admin Wizard)
// route: /settings/schema/new (new) or /settings/schema/edit/:id (edit)
// spec: design/02-SETTINGS-UX.md §SET-031 (line 588)
// 8-step guided flow to add or edit a schema column for L2/L3 scope.
// ============================================================

// ---------- Mock data: orgs resolved dept list (from tenant_variations.dept_overrides) ----------
// Apex baseline = 7 depts. Tenant has split "Technical" into "Technical R&D" + "Technical QA".
window.SETTINGS_DEPT_RESOLVED = [
  { code: "core",         label: "Core",            note: "Baseline" },
  { code: "technical_rd", label: "Technical R&D",   note: "Tenant override (split from Technical)" },
  { code: "technical_qa", label: "Technical QA",    note: "Tenant override (split from Technical)" },
  { code: "packaging",    label: "Packaging",       note: "Baseline" },
  { code: "mrp",          label: "MRP",             note: "Baseline" },
  { code: "planning",     label: "Planning",        note: "Baseline" },
  { code: "production",   label: "Production",      note: "Baseline" },
  { code: "price",        label: "Price",           note: "Baseline" },
];

// Tables list (from spec)
window.SETTINGS_WIZ_TABLES = [
  { value: "main_table",                       label: "main_table",                         note: "Primary product table" },
  { value: "bom",                              label: "bom",                                note: "Bill of materials" },
  { value: "reference.pack_sizes",             label: "reference.pack_sizes",               note: "Reference table" },
  { value: "reference.templates",              label: "reference.templates",                note: "Reference table" },
  { value: "reference.processes",              label: "reference.processes",                note: "Reference table" },
  { value: "reference.allergens_reference",    label: "reference.allergens_reference",      note: "Reference table" },
  { value: "reference.alert_thresholds",       label: "reference.alert_thresholds",         note: "Reference table" },
  { value: "reference.d365_constants",         label: "reference.d365_constants",           note: "Reference table" },
  { value: "reference.email_config",           label: "reference.email_config",             note: "Reference table" },
  { value: "reference.dieset_by_line_pack",    label: "reference.dieset_by_line_pack",      note: "Reference table" },
  { value: "reference.lines_by_pack_size",     label: "reference.lines_by_pack_size",       note: "Reference table" },
  { value: "reference.close_confirm",          label: "reference.close_confirm",            note: "Reference table" },
];

// Reference codes for dropdown source selector (Step 4)
window.SETTINGS_REF_CODES = [
  "reference.pack_sizes", "reference.templates", "reference.processes",
  "reference.allergens_reference", "reference.alert_thresholds",
  "reference.d365_constants", "reference.email_config",
  "reference.dieset_by_line_pack", "reference.lines_by_pack_size",
  "reference.close_confirm", "reference.tax_codes",
];

// ---------- Helpers ----------
const WIZ_STEPS = [
  { n: 1, key: "table",        label: "Pick Table",          short: "Table" },
  { n: 2, key: "dept",         label: "Pick Department",     short: "Department" },
  { n: 3, key: "type",         label: "Pick Data Type",      short: "Type" },
  { n: 4, key: "validation",   label: "Validation Rules",    short: "Validation" },
  { n: 5, key: "blocking",     label: "Blocking Rule",       short: "Blocking" },
  { n: 6, key: "done_req",     label: "Required for Done",   short: "Done" },
  { n: 7, key: "presentation", label: "Presentation",        short: "Presentation" },
  { n: 8, key: "preview",      label: "Preview & Save",      short: "Preview" },
];

const TYPE_OPTIONS = [
  { code: "text",     ic: "Aa", label: "Text",     desc: "Free text, short or long" },
  { code: "number",   ic: "#",  label: "Number",   desc: "Integer or decimal, supports range validation" },
  { code: "date",     ic: "▦",  label: "Date",     desc: "Date or date-time value" },
  { code: "enum",     ic: "≣",  label: "Enum",     desc: "Fixed list of options (dropdown)" },
  { code: "formula",  ic: "ƒ",  label: "Formula",  desc: "Calculated from other fields" },
  { code: "relation", ic: "⇄",  label: "Relation", desc: "Reference to another table row" },
];

const BLOCKING_OPTIONS = [
  { code: "none",                 label: "None",                          note: "Field can be empty at any stage. Default." },
  { code: "core_done",             label: "core_done",                    note: "Must be filled before Core dept marks the row complete." },
  { code: "pack_size_filled",      label: "pack_size_filled",             note: "Must be filled once pack_size is set." },
  { code: "line_filled",           label: "line_filled",                  note: "Must be filled once production line is assigned." },
  { code: "core_production_done",  label: "core_production_done",         note: "Must be filled before Core + Production both close." },
];

const ROLE_OPTIONS = [
  "owner", "admin", "module_admin", "npd_manager", "planner",
  "production_lead", "quality_lead", "warehouse_operator", "auditor", "viewer",
];

// Defaults for fresh wizard state
const initialWizardState = () => ({
  table: "",
  dept: "",
  type: "",
  validation: {
    required: false,
    unique_per_org: false,
    regex_on: false, regex: "", regex_test: "",
    range_on: false, range_min: "", range_max: "",
    dropdown_on: false, dropdown_source: "",
  },
  blocking: "none",
  done_required: false,
  presentation: {
    section_label: "",
    order_within: 10,
    list_column: false,
    list_header: "",
    roles_visibility: "all", // 'all' | 'specific'
    roles_specific: [],
    csv_export: true,
    d365_builder: false,
  },
  // Tier scope picked in step 8
  scope: "tenant", // 'tenant' (L2) | 'org_specific' (L3) | 'universal' (L1-promotion)
});

const computeTier = (s) => {
  if (s.scope === "universal")    return { tier: "L1", badge: "badge-blue",  reason: "Universal scope — affects all tenants. Requires L1 promotion request." };
  if (s.scope === "org_specific") return { tier: "L3", badge: "badge-amber", reason: "Organisation-specific — extends the schema only for this org." };
  return { tier: "L2", badge: "badge-green", reason: "Tenant-shared — applied across this tenant, shareable with sibling orgs." };
};

const SAMPLE_COLUMN_FOR_CONFLICT = {
  col: "shelf_life_days",
  table: "main_table",
  diff_migration_id: "mig_2026_05_a1b2c3",
  conflicting_admin: "K. Nowak",
  conflicting_at: "2026-05-13 14:02",
};

// ============================================================
// Sub-step components
// ============================================================

const StepHead = ({ step, title, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <div className="muted mono" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Step {step.n} of 8 · {step.short}</div>
    <h2 style={{ margin: "4px 0 4px", fontSize: 18, fontWeight: 600 }}>{title}</h2>
    {sub && <div className="muted" style={{ fontSize: 13 }}>{sub}</div>}
  </div>
);

// Step 1
const Step1Table = ({ value, onChange, error }) => (
  <div>
    <StepHead step={WIZ_STEPS[0]} title="Which table does this column belong to?" sub="Choose the parent table. Reference tables skip the Department step." />
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "8px 10px", fontSize: 14 }}>
      <option value="">— Select a table —</option>
      {window.SETTINGS_WIZ_TABLES.map((t) => (
        <option key={t.value} value={t.value}>{t.label}</option>
      ))}
    </select>
    {error && <div style={{ color: "var(--red-700)", fontSize: 12, marginTop: 8 }}>{error}</div>}
    <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
      {value === "main_table" ? "Next: pick the department that owns this column." :
        (value && value.startsWith("reference.")) ? "Reference tables skip department selection — they are universal." :
        "Tables in the catalog cover all known scopes."}
    </div>
  </div>
);

// Step 2
const Step2Dept = ({ value, onChange, error }) => {
  const depts = window.SETTINGS_DEPT_RESOLVED;
  return (
    <div>
      <StepHead step={WIZ_STEPS[1]} title="Which department owns this column?" sub="Source: tenant_variations.dept_overrides (8 depts resolved — 6 baseline + 2 tenant overrides)." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {depts.map((d) => {
          const on = value === d.code;
          return (
            <label key={d.code} className="sg-radio-card" data-on={on}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid " + (on ? "var(--blue)" : "var(--border)"),
                       borderRadius: "var(--radius)", cursor: "pointer", background: on ? "var(--blue-050)" : "#fff",
                       textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text)", margin: 0 }}>
              <input type="radio" name="dept" checked={on} onChange={() => onChange(d.code)} style={{ marginTop: 3 }} />
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{d.label}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{d.note}</div>
              </div>
            </label>
          );
        })}
      </div>
      {error && <div style={{ color: "var(--red-700)", fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
};

// Step 3
const Step3Type = ({ value, onChange, error }) => (
  <div>
    <StepHead step={WIZ_STEPS[2]} title="What type of data does this column hold?" sub="The data type controls which validation rules are available later." />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
      {TYPE_OPTIONS.map((t) => {
        const on = value === t.code;
        return (
          <label key={t.code} className="sg-radio-card"
            style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px",
                     border: "1px solid " + (on ? "var(--blue)" : "var(--border)"),
                     borderRadius: "var(--radius)", cursor: "pointer", background: on ? "var(--blue-050)" : "#fff" }}>
            <input type="radio" name="type" checked={on} onChange={() => onChange(t.code)} style={{ marginTop: 4 }} />
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1 }}>
              <div style={{ width: 32, height: 32, background: on ? "var(--blue)" : "var(--gray-100)", color: on ? "#fff" : "var(--text)",
                            borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{t.ic}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{t.label}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{t.desc}</div>
              </div>
            </div>
          </label>
        );
      })}
    </div>
    {error && <div style={{ color: "var(--red-700)", fontSize: 12, marginTop: 8 }}>{error}</div>}
  </div>
);

// Step 4
const Step4Validation = ({ value, type, onChange }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  const showRange = type === "number" || type === "date";

  // Regex live preview
  let regexResult = null;
  if (value.regex_on && value.regex) {
    try {
      const re = new RegExp(value.regex);
      regexResult = re.test(value.regex_test) ? "match" : "fail";
    } catch (e) { regexResult = "invalid"; }
  }

  return (
    <div>
      <StepHead step={WIZ_STEPS[3]} title="Set validation rules for this column." sub="Toggle one or more rules. Available rules depend on the data type chosen in step 3." />

      <div className="sg-section" style={{ marginBottom: 0 }}>
        <div className="sg-section-body" style={{ padding: 0 }}>
          {/* Required */}
          <div className="sg-row" style={{ padding: "12px 16px" }}>
            <div>
              <div className="sg-label">Required</div>
              <div className="sg-hint">Cannot be saved empty.</div>
            </div>
            <div className="sg-field"><Toggle on={value.required} onChange={(v) => set({ required: v })} /></div>
          </div>

          {/* Unique */}
          <div className="sg-row" style={{ padding: "12px 16px" }}>
            <div>
              <div className="sg-label">Unique per org</div>
              <div className="sg-hint">No two rows in this org may share the same value.</div>
            </div>
            <div className="sg-field"><Toggle on={value.unique_per_org} onChange={(v) => set({ unique_per_org: v })} /></div>
          </div>

          {/* Regex */}
          <div className="sg-row" style={{ padding: "12px 16px", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="sg-label">Regex pattern</div>
                <div className="sg-hint">JavaScript-style regex. Test it below before publishing.</div>
              </div>
              <Toggle on={value.regex_on} onChange={(v) => set({ regex_on: v })} />
            </div>
            {value.regex_on && (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <input className="mono" placeholder="^[A-Z]{3}-\d{4}$" value={value.regex} onChange={(e) => set({ regex: e.target.value })} style={{ fontSize: 12 }} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input placeholder="Test string…" value={value.regex_test} onChange={(e) => set({ regex_test: e.target.value })} style={{ flex: 1, fontSize: 12 }} />
                  {regexResult === "match"   && <span className="badge badge-green" style={{ fontSize: 10 }}>● match</span>}
                  {regexResult === "fail"    && <span className="badge badge-red"   style={{ fontSize: 10 }}>✕ fail</span>}
                  {regexResult === "invalid" && <span className="badge badge-amber" style={{ fontSize: 10 }}>⚠ invalid regex</span>}
                </div>
              </div>
            )}
          </div>

          {/* Range */}
          <div className="sg-row" style={{ padding: "12px 16px", display: "block", opacity: showRange ? 1 : 0.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="sg-label">Range (min / max)</div>
                <div className="sg-hint">{showRange ? "Available for number and date types." : "Not available — choose a number or date type in step 3."}</div>
              </div>
              <Toggle on={value.range_on && showRange} onChange={(v) => showRange && set({ range_on: v })} />
            </div>
            {value.range_on && showRange && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <input placeholder="min" value={value.range_min} onChange={(e) => set({ range_min: e.target.value })} style={{ width: 140, fontSize: 12 }} />
                <span className="muted" style={{ alignSelf: "center", fontSize: 12 }}>to</span>
                <input placeholder="max" value={value.range_max} onChange={(e) => set({ range_max: e.target.value })} style={{ width: 140, fontSize: 12 }} />
              </div>
            )}
          </div>

          {/* Dropdown source */}
          <div className="sg-row" style={{ padding: "12px 16px", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="sg-label">Dropdown source</div>
                <div className="sg-hint">Bind values to a reference table.</div>
              </div>
              <Toggle on={value.dropdown_on} onChange={(v) => set({ dropdown_on: v })} />
            </div>
            {value.dropdown_on && (
              <div style={{ marginTop: 10 }}>
                <select value={value.dropdown_source} onChange={(e) => set({ dropdown_source: e.target.value })} style={{ width: "100%", fontSize: 12 }}>
                  <option value="">— Select a reference table —</option>
                  {window.SETTINGS_REF_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Step 5
const Step5Blocking = ({ value, onChange }) => (
  <div>
    <StepHead step={WIZ_STEPS[4]} title="When is this column required to be filled?" sub="Blocking rules gate a row from transitioning into the next state until this column is filled." />
    <div style={{ display: "grid", gap: 8 }}>
      {BLOCKING_OPTIONS.map((b) => {
        const on = value === b.code;
        return (
          <label key={b.code} className="sg-radio-card"
            style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px",
                     border: "1px solid " + (on ? "var(--blue)" : "var(--border)"),
                     borderRadius: "var(--radius)", cursor: "pointer", background: on ? "var(--blue-050)" : "#fff" }}>
            <input type="radio" name="blocking" checked={on} onChange={() => onChange(b.code)} style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }} className="mono">{b.label}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{b.note}</div>
            </div>
          </label>
        );
      })}
    </div>
  </div>
);

// Step 6
const Step6Done = ({ value, onChange }) => (
  <div>
    <StepHead step={WIZ_STEPS[5]} title="Is this column required before marking the product / WO as 'Done'?" />
    <div className="sg-section" style={{ marginBottom: 0 }}>
      <div className="sg-section-body">
        <div className="sg-row" style={{ padding: 0 }}>
          <div>
            <div className="sg-label">Required for Done</div>
            <div className="sg-hint">When ON, this field appears in the Done checklist and blocks completion if empty.</div>
          </div>
          <div className="sg-field"><Toggle on={value} onChange={onChange} /></div>
        </div>
      </div>
    </div>
    <div className={"alert " + (value ? "alert-blue" : "alert-gray")} style={{ marginTop: 12, fontSize: 12 }}>
      {value
        ? "The Done checklist on /production will surface this column. Empty values will block Mark-as-Done."
        : "No Done-gating. Empty values will not affect WO closure."}
    </div>
  </div>
);

// Step 7
const Step7Presentation = ({ value, onChange }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div>
      <StepHead step={WIZ_STEPS[6]} title="How should this column appear in the UI?" sub="Form section, ordering, list visibility, role visibility, and export behaviour." />
      <div className="sg-section" style={{ marginBottom: 0 }}>
        <div className="sg-section-body" style={{ padding: 0 }}>
          <div className="sg-row" style={{ padding: "12px 16px" }}>
            <div><div className="sg-label">Section label in form</div><div className="sg-hint">e.g. "Packaging Details"</div></div>
            <div className="sg-field"><input value={value.section_label} onChange={(e) => set({ section_label: e.target.value })} placeholder="Packaging Details" style={{ width: 260 }} /></div>
          </div>
          <div className="sg-row" style={{ padding: "12px 16px" }}>
            <div><div className="sg-label">Order within section</div><div className="sg-hint">1–99. Lower numbers appear first.</div></div>
            <div className="sg-field"><input type="number" min="1" max="99" value={value.order_within} onChange={(e) => set({ order_within: e.target.value })} style={{ width: 80 }} /></div>
          </div>
          <div className="sg-row" style={{ padding: "12px 16px", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div className="sg-label">Show as list column</div><div className="sg-hint">Show this column in the products / BOMs list view.</div></div>
              <Toggle on={value.list_column} onChange={(v) => set({ list_column: v })} />
            </div>
            {value.list_column && (
              <div style={{ marginTop: 10 }}>
                <input value={value.list_header} onChange={(e) => set({ list_header: e.target.value })} placeholder="Column header label" style={{ width: 260 }} />
              </div>
            )}
          </div>
          <div className="sg-row" style={{ padding: "12px 16px", display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div><div className="sg-label">Visible to roles</div><div className="sg-hint">All roles, or restrict to specific ones.</div></div>
              <select value={value.roles_visibility} onChange={(e) => set({ roles_visibility: e.target.value })} style={{ width: 160 }}>
                <option value="all">All roles</option>
                <option value="specific">Specific roles…</option>
              </select>
            </div>
            {value.roles_visibility === "specific" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {ROLE_OPTIONS.map((r) => {
                  const on = value.roles_specific.includes(r);
                  return (
                    <label key={r} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "3px 8px",
                      border: "1px solid " + (on ? "var(--blue)" : "var(--border)"), borderRadius: 12,
                      background: on ? "var(--blue-050)" : "#fff", color: on ? "var(--blue-700)" : "var(--text)", cursor: "pointer", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                      <input type="checkbox" checked={on} onChange={(e) => {
                        const next = e.target.checked ? [...value.roles_specific, r] : value.roles_specific.filter(x => x !== r);
                        set({ roles_specific: next });
                      }} style={{ display: "none" }} />
                      {r}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="sg-row" style={{ padding: "12px 16px" }}>
            <div><div className="sg-label">Include in CSV export</div></div>
            <div className="sg-field"><Toggle on={value.csv_export} onChange={(v) => set({ csv_export: v })} /></div>
          </div>
          <div className="sg-row" style={{ padding: "12px 16px" }}>
            <div><div className="sg-label">Include in D365 Builder output</div><div className="sg-hint">Only relevant if D365 integration is enabled for this tenant.</div></div>
            <div className="sg-field"><Toggle on={value.d365_builder} onChange={(v) => set({ d365_builder: v })} /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Step 8 — Preview & Save (renders summary + sample form + tier badge)
const Step8Preview = ({ state, onChangeScope, columnCode, onChangeColumnCode }) => {
  const tier = computeTier(state);

  // Render a simulated form field based on type
  const renderSampleField = () => {
    const placeholder = "Sample value…";
    switch (state.type) {
      case "text":     return <input placeholder={placeholder} style={{ width: 280 }} />;
      case "number":   return <input type="number" placeholder="0" style={{ width: 120 }} />;
      case "date":     return <input type="date" style={{ width: 160 }} />;
      case "enum":     return <select style={{ width: 200 }}><option>Option A</option><option>Option B</option><option>Option C</option></select>;
      case "formula":  return <div className="mono" style={{ fontSize: 12, padding: "6px 10px", background: "var(--gray-050)", borderRadius: 4, border: "1px dashed var(--border)", display: "inline-block" }}>= [a] + [b]</div>;
      case "relation": return <select style={{ width: 220 }}><option>— Select row —</option></select>;
      default:         return <span className="muted" style={{ fontSize: 12 }}>(type not chosen)</span>;
    }
  };

  const yes = <span style={{ color: "var(--green-700)" }}>✓</span>;
  const no = <span className="muted">—</span>;

  return (
    <div>
      <StepHead step={WIZ_STEPS[7]} title="Review your column definition." sub="Live preview of the form field, summary of every choice, and the auto-computed tier." />

      {/* Column code input */}
      <div className="sg-section" style={{ marginBottom: 12 }}>
        <div className="sg-section-body">
          <div className="sg-row" style={{ padding: 0 }}>
            <div><div className="sg-label">Column code</div><div className="sg-hint">snake_case identifier — used in the database column and API contract.</div></div>
            <div className="sg-field"><input className="mono" value={columnCode} onChange={(e) => onChangeColumnCode(e.target.value)} placeholder="shelf_life_days" style={{ width: 240 }} /></div>
          </div>
        </div>
      </div>

      {/* Scope chooser (drives tier) */}
      <div className="sg-section" style={{ marginBottom: 12 }}>
        <div className="sg-section-head">
          <div>
            <div className="sg-section-title">Scope</div>
            <div className="sg-section-sub">Determines tier and publish path.</div>
          </div>
          <span className={"badge " + tier.badge} style={{ fontSize: 11 }}>Auto: {tier.tier}</span>
        </div>
        <div className="sg-section-body" style={{ padding: 0 }}>
          {[
            { code: "tenant",       label: "Tenant-shared",      note: "Applies to this tenant only. Sharable with sibling orgs. → L2", tier: "L2" },
            { code: "org_specific", label: "Organisation-specific", note: "Only for this org. → L3", tier: "L3" },
            { code: "universal",    label: "Universal (all tenants)", note: "Affects every tenant. Requires L1 promotion approval. → L1", tier: "L1" },
          ].map((s) => {
            const on = state.scope === s.code;
            return (
              <label key={s.code} className="sg-radio-card"
                style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 16px",
                         borderTop: "1px solid var(--border)", cursor: "pointer",
                         background: on ? "var(--blue-050)" : "#fff" }}>
                <input type="radio" name="scope" checked={on} onChange={() => onChangeScope(s.code)} style={{ marginTop: 3 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{s.label}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{s.note}</div>
                </div>
                <span className={"badge " + (s.tier === "L1" ? "badge-blue" : s.tier === "L2" ? "badge-green" : "badge-amber")} style={{ fontSize: 9, height: "fit-content", alignSelf: "center" }}>{s.tier}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Sample form field */}
      <Section title="Live preview" sub="How this column will appear in the form, given the type + presentation settings.">
        <div style={{ padding: "8px 0" }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
            {state.presentation.section_label || "Untitled section"}
          </div>
          <label style={{ display: "block", marginBottom: 6, textTransform: "none", letterSpacing: 0, fontWeight: 500, fontSize: 13, color: "var(--text)" }}>
            {columnCode || <span className="muted">(column code)</span>}
            {state.validation.required && <span style={{ color: "var(--red)" }}> *</span>}
          </label>
          {renderSampleField()}
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Sample data — saving the form has no effect on production.</div>
        </div>
      </Section>

      {/* Summary table */}
      <Section title="Summary of choices">
        <table style={{ width: "100%" }}>
          <tbody>
            <tr><td className="muted" style={{ width: 200 }}>Table</td><td className="mono">{state.table || "—"}</td></tr>
            {state.table === "main_table" && <tr><td className="muted">Department</td><td>{state.dept || "—"}</td></tr>}
            <tr><td className="muted">Type</td><td><span className="badge badge-gray" style={{ fontSize: 9 }}>{state.type || "—"}</span></td></tr>
            <tr><td className="muted">Required</td><td>{state.validation.required ? yes : no}</td></tr>
            <tr><td className="muted">Unique per org</td><td>{state.validation.unique_per_org ? yes : no}</td></tr>
            <tr><td className="muted">Regex</td><td className="mono" style={{ fontSize: 12 }}>{state.validation.regex_on ? (state.validation.regex || "(empty)") : "—"}</td></tr>
            <tr><td className="muted">Range</td><td className="mono" style={{ fontSize: 12 }}>{state.validation.range_on ? `${state.validation.range_min || "?"} → ${state.validation.range_max || "?"}` : "—"}</td></tr>
            <tr><td className="muted">Dropdown source</td><td className="mono" style={{ fontSize: 12 }}>{state.validation.dropdown_on ? (state.validation.dropdown_source || "(empty)") : "—"}</td></tr>
            <tr><td className="muted">Blocking</td><td className="mono" style={{ fontSize: 12 }}>{state.blocking}</td></tr>
            <tr><td className="muted">Required for Done</td><td>{state.done_required ? yes : no}</td></tr>
            <tr><td className="muted">Section label</td><td>{state.presentation.section_label || "—"}</td></tr>
            <tr><td className="muted">Order</td><td className="mono">{state.presentation.order_within}</td></tr>
            <tr><td className="muted">List column</td><td>{state.presentation.list_column ? <span>{yes} <span className="muted" style={{ fontSize: 11 }}>· header: "{state.presentation.list_header || "(empty)"}"</span></span> : no}</td></tr>
            <tr><td className="muted">Visible to</td><td>{state.presentation.roles_visibility === "all" ? "All roles" : (state.presentation.roles_specific.length ? state.presentation.roles_specific.join(", ") : "(no roles selected)")}</td></tr>
            <tr><td className="muted">CSV export</td><td>{state.presentation.csv_export ? yes : no}</td></tr>
            <tr><td className="muted">D365 Builder</td><td>{state.presentation.d365_builder ? yes : no}</td></tr>
            <tr><td className="muted">Computed tier</td><td><span className={"badge " + tier.badge} style={{ fontSize: 10 }}>{tier.tier}</span> <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{tier.reason}</span></td></tr>
          </tbody>
        </table>
      </Section>
    </div>
  );
};

// ============================================================
// Wizard host
// ============================================================

const SchemaColumnWizard = ({ openModal, onExit }) => {
  const [step, setStep] = React.useState(1);
  const [state, setState] = React.useState(initialWizardState);
  const [columnCode, setColumnCode] = React.useState("");
  const [errors, setErrors] = React.useState({});

  // Mock published state, post-publish banner, conflict state.
  const [postPublish, setPostPublish] = React.useState(false);
  const [conflict, setConflict]       = React.useState(false);
  const [toast, setToast]             = React.useState(null);
  const [diffModalOpen, setDiffModalOpen] = React.useState(false);

  // Step 2 auto-skip when not main_table
  React.useEffect(() => {
    if (step === 2 && state.table && state.table !== "main_table") {
      setStep(3);
    }
  }, [step, state.table]);

  const tier = computeTier(state);

  const validateAdvance = () => {
    const e = {};
    if (step === 1 && !state.table)              e.table = "Pick a table to continue.";
    if (step === 2 && state.table === "main_table" && !state.dept) e.dept = "Pick the owning department.";
    if (step === 3 && !state.type)               e.type  = "Pick a data type.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateAdvance()) return;
    setStep(Math.min(8, step + 1));
  };
  const back = () => setStep(Math.max(1, step - 1));
  const goTo = (n) => {
    // Allow jumping back, and forward only to visited steps for now
    if (n <= step) setStep(n);
  };

  const publish = () => {
    // Mock concurrent edit hit for first publish attempt
    if (!conflict && state.scope !== "universal" && Math.random() > 0) {
      // Deterministic: always show conflict on first publish to demo the state.
      setConflict(true);
      return;
    }
    setPostPublish(true);
    setToast(state.scope === "universal" ? "L1 promotion request submitted." : `Column published as ${tier.tier}. Zod schema regenerating…`);
    setTimeout(() => setToast(null), 5000);
  };

  const requestL1 = () => {
    openModal && openModal("promoteL2", { promotion: { from: "L2", to: "L1", col: columnCode || "shelf_life_days", table: state.table } });
  };

  const saveDraft = () => {
    setToast("Saved as draft. No runtime effect.");
    setTimeout(() => setToast(null), 4000);
  };

  // Determine which steps are reachable
  const isStepDisabled = (n) => n > step;
  const isStepComplete = (n) => n < step;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12 }}>
        <div>
          <div className="muted mono" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>
            <span style={{ cursor: "pointer" }} onClick={onExit}>Settings</span>
            {" / "}
            <span style={{ cursor: "pointer" }} onClick={onExit}>Schema browser</span>
            {" / "}
            <span>Column wizard</span>
          </div>
          <h1 className="sg-title" style={{ margin: "4px 0 0" }}>Add or edit a schema column</h1>
          <div className="sg-sub" style={{ fontSize: 13 }}>8-step guided flow. L1 columns require a promotion request before publish.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={onExit}>Cancel</button>
          <button className="btn btn-secondary" onClick={saveDraft}>Save as draft</button>
        </div>
      </div>

      {/* Concurrent edit conflict banner — links to SET-032 */}
      {conflict && (
        <div className="alert alert-amber" style={{ marginBottom: 12, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <strong>Another admin published a newer version while you were editing.</strong>{" "}
            {SAMPLE_COLUMN_FOR_CONFLICT.conflicting_admin} published v{4} of <span className="mono">{SAMPLE_COLUMN_FOR_CONFLICT.col}</span> at {SAMPLE_COLUMN_FOR_CONFLICT.conflicting_at}.
            Review the diff and republish.
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setDiffModalOpen(true)}>View diff →</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setConflict(false); setToast("Reloaded latest version. Re-merge your changes."); setTimeout(() => setToast(null), 4000); }}>Reload latest</button>
          </div>
        </div>
      )}

      {/* Post-publish banner */}
      {postPublish && (
        <div className="alert alert-blue" style={{ marginBottom: 12, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Schema regenerating… changes will be live in ~5 seconds.</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setPostPublish(false)}>Dismiss</button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="alert alert-green" style={{ marginBottom: 12, fontSize: 13 }}>{toast}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, alignItems: "flex-start" }}>
        {/* Vertical step list */}
        <div className="sg-section" style={{ position: "sticky", top: 80, marginBottom: 0 }}>
          <div className="sg-section-head" style={{ padding: "12px 14px" }}>
            <div>
              <div className="sg-section-title" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)" }}>Wizard steps</div>
            </div>
          </div>
          <div style={{ padding: "8px 0" }}>
            {WIZ_STEPS.map((s) => {
              const skipped = s.n === 2 && state.table && state.table !== "main_table";
              const complete = isStepComplete(s.n);
              const current = s.n === step;
              const disabled = isStepDisabled(s.n);
              return (
                <div key={s.n} onClick={() => !disabled && !skipped && goTo(s.n)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                    cursor: disabled || skipped ? "default" : "pointer",
                    background: current ? "var(--blue-050)" : "transparent",
                    borderLeft: current ? "3px solid var(--blue)" : "3px solid transparent",
                    opacity: disabled ? 0.5 : (skipped ? 0.4 : 1),
                  }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 11, fontSize: 11, fontWeight: 600,
                    background: complete ? "var(--green)" : current ? "var(--blue)" : "var(--gray-100)",
                    color: complete || current ? "#fff" : "var(--muted)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>{complete ? "✓" : s.n}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: current ? 600 : 400, color: current ? "var(--blue-700)" : "var(--text)" }}>{s.short}</div>
                    {skipped && <div className="muted" style={{ fontSize: 10 }}>Skipped (reference table)</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wizard card */}
        <div className="sg-section" style={{ maxWidth: 680, marginBottom: 0 }}>
          {/* Horizontal stepper */}
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {WIZ_STEPS.map((s, i) => {
                const complete = isStepComplete(s.n);
                const current = s.n === step;
                return (
                  <React.Fragment key={s.n}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 11, fontSize: 11, fontWeight: 600,
                      background: complete ? "var(--green)" : current ? "var(--blue)" : "var(--gray-100)",
                      color: complete || current ? "#fff" : "var(--muted)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>{complete ? "✓" : s.n}</div>
                    {i < WIZ_STEPS.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: complete ? "var(--green)" : "var(--gray-100)" }}></div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Step body */}
          <div className="sg-section-body" style={{ padding: "20px 24px" }}>
            {step === 1 && <Step1Table value={state.table} onChange={(v) => setState({ ...state, table: v })} error={errors.table} />}
            {step === 2 && <Step2Dept value={state.dept} onChange={(v) => setState({ ...state, dept: v })} error={errors.dept} />}
            {step === 3 && <Step3Type value={state.type} onChange={(v) => setState({ ...state, type: v })} error={errors.type} />}
            {step === 4 && <Step4Validation value={state.validation} type={state.type} onChange={(v) => setState({ ...state, validation: v })} />}
            {step === 5 && <Step5Blocking value={state.blocking} onChange={(v) => setState({ ...state, blocking: v })} />}
            {step === 6 && <Step6Done value={state.done_required} onChange={(v) => setState({ ...state, done_required: v })} />}
            {step === 7 && <Step7Presentation value={state.presentation} onChange={(v) => setState({ ...state, presentation: v })} />}
            {step === 8 && <Step8Preview state={state} onChangeScope={(s) => setState({ ...state, scope: s })} columnCode={columnCode} onChangeColumnCode={setColumnCode} />}
          </div>

          {/* Step foot */}
          <div className="sg-section-foot" style={{ justifyContent: "space-between" }}>
            <div>
              <button className="btn btn-ghost btn-sm" onClick={back} disabled={step === 1}>← Back</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {step < 8 && <button className="btn btn-primary btn-sm" onClick={next}>Next →</button>}
              {step === 8 && state.scope === "universal" && (
                <button className="btn btn-amber btn-sm" onClick={requestL1}>Request L1 Promotion</button>
              )}
              {step === 8 && state.scope !== "universal" && (
                <button className="btn btn-primary btn-sm" onClick={publish}>Publish Column</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightweight diff modal — pattern only, links to full SET-032 */}
      {diffModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDiffModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: 720, maxWidth: "90vw", borderRadius: "var(--radius)", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Concurrent edit conflict — diff preview</div>
                <div className="muted" style={{ fontSize: 11 }}>Migration <span className="mono">{SAMPLE_COLUMN_FOR_CONFLICT.diff_migration_id}</span></div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setDiffModalOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Yours (in-progress) <span className="badge badge-gray" style={{ fontSize: 9, marginLeft: 4 }}>v3 — draft</span></div>
                <pre className="mono" style={{ fontSize: 11, padding: 10, background: "var(--gray-050)", border: "1px solid var(--border)", borderRadius: 4, margin: 0, whiteSpace: "pre-wrap" }}>
{`{
  "col": "shelf_life_days",
  "type": "number",
  "required": true,
  "range": { "min": 1, "max": 90 },
  "blocking": "core_done"
}`}
                </pre>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Latest published <span className="badge badge-green" style={{ fontSize: 9, marginLeft: 4 }}>v4 — by {SAMPLE_COLUMN_FOR_CONFLICT.conflicting_admin}</span></div>
                <pre className="mono" style={{ fontSize: 11, padding: 10, background: "var(--green-050a)", border: "1px solid var(--green-050)", borderRadius: 4, margin: 0, whiteSpace: "pre-wrap" }}>
{`{
  "col": "shelf_life_days",
  "type": "number",
  "required": true,
  "range": { "min": 1, "max": 120 },
  "blocking": "core_production_done",
  "regex": "^\\\\d+$"
}`}
                </pre>
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--gray-050)" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDiffModalOpen(false)}>Cancel</button>
              <div style={{ display: "flex", gap: 8 }}>
                <a className="btn btn-secondary btn-sm" href="#" onClick={(e) => { e.preventDefault(); setDiffModalOpen(false); setToast("Open SET-032 — full diff viewer (not wired in this session)."); setTimeout(() => setToast(null), 4000); }}>Open full diff (SET-032) →</a>
                <button className="btn btn-primary btn-sm" onClick={() => { setDiffModalOpen(false); setConflict(false); setToast("Reloaded latest version. Re-merge your changes."); setTimeout(() => setToast(null), 4000); }}>Reload latest</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { SchemaColumnWizard });
