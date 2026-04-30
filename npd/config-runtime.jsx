// ============================================================================
// NPD module · config-runtime.jsx — Active-config lookups + GenericDeptTab fallback
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// ============================================================================
// Config runtime — bridges NPD_CONFIG_TEMPLATES into live FG Detail UI.
//
// Exposes (on window):
//   - getActiveTemplate()              → resolved template object (active or fallback)
//   - getActiveDepartments()           → array of dept configs in order
//   - getDeptConfig(deptId)            → single dept config or null
//   - isDeptLocked(fa, deptId)         → true if blocking_deps not yet closed
//   - renderConfigField(field, fa)     → JSX <Field> rendered from config schema
//
// All read-only — Configuration tab (config-screens.jsx) is the only writer.
// ============================================================================

window.getActiveTemplate = function () {
  // Prefer existing helper; fall back to direct lookup or first template
  if (typeof window.NPD_GET_ACTIVE_CONFIG === "function") {
    return window.NPD_GET_ACTIVE_CONFIG();
  }
  const id = window.NPD_ACTIVE_CONFIG_ID || "tpl_bakery";
  const tpl = (window.NPD_CONFIG_TEMPLATES || []).find(t => t.id === id);
  return tpl || (window.NPD_CONFIG_TEMPLATES || [])[0] || null;
};

window.getActiveDepartments = function () {
  const tpl = window.getActiveTemplate();
  if (!tpl) return [];
  return [...tpl.departments].sort((a, b) => a.order - b.order);
};

window.getDeptConfig = function (deptId) {
  return window.getActiveDepartments().find(d => d.id === deptId) || null;
};

// Department is locked if any of its blocking_deps is not yet closed on this FG.
// closed flags follow the convention `closed_<deptId>` === "Yes"
window.isDeptLocked = function (fa, deptId) {
  const dept = window.getDeptConfig(deptId);
  if (!dept || !dept.blocking_deps || dept.blocking_deps.length === 0) return false;
  return dept.blocking_deps.some(prereq => fa["closed_" + prereq] !== "Yes");
};

// Closed-state helper (single source of truth)
window.isDeptClosed = function (fa, deptId) {
  return fa["closed_" + deptId] === "Yes";
};

// ----------------------------------------------------------------------------
// Field renderer — maps config field schema → JSX form input.
// Uses existing .field / .ff-help styles from monopilot.css.
// ----------------------------------------------------------------------------
window.ConfigField = function ConfigField({ field, fa }) {
  const value = fa[field.id];
  const required = field.required;
  const label = field.label + (required ? " *" : "");
  const helpText = field.help || (field.validation ? `${field.validation} validation applies.` : null);

  // computed → readonly green-bg
  if (field.type === "computed") {
    return (
      <div className="field">
        <label>{field.label} (auto)</label>
        <input className="mono" value={value || ""} readOnly style={{ background: "#E0FFE0" }} />
        {helpText && <div className="ff-help">{helpText}</div>}
      </div>
    );
  }

  // dropdown
  if (field.type === "dropdown") {
    return (
      <div className="field">
        <label>{label}</label>
        <select defaultValue={value || ""}>
          {!required && <option value="">— Select —</option>}
          {(field.values || []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {helpText && <div className="ff-help">{helpText}</div>}
      </div>
    );
  }

  // multiselect → simple checkbox list (simulated)
  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="field" style={{ gridColumn: "span 2" }}>
        <label>{label}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {(field.values || []).map(v => (
            <label key={v} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", background: selected.includes(v) ? "var(--blue-50, #dbeafe)" : "#fff" }}>
              <input type="checkbox" defaultChecked={selected.includes(v)} style={{ margin: 0 }} />
              {v}
            </label>
          ))}
        </div>
        {helpText && <div className="ff-help">{helpText}</div>}
      </div>
    );
  }

  // boolean → toggle
  if (field.type === "boolean") {
    return (
      <div className="field">
        <label>{label}</label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <input type="checkbox" defaultChecked={!!value} />
          <span style={{ fontSize: 12 }}>{value ? "Yes" : "No"}</span>
        </label>
        {helpText && <div className="ff-help">{helpText}</div>}
      </div>
    );
  }

  // file → upload stub
  if (field.type === "file") {
    return (
      <div className="field">
        <label>{label}</label>
        <input type="file" />
        {helpText && <div className="ff-help">{helpText}</div>}
      </div>
    );
  }

  // textarea
  if (field.type === "textarea") {
    return (
      <div className="field" style={{ gridColumn: "span 2" }}>
        <label>{label}</label>
        <textarea rows="2" defaultValue={value || ""}></textarea>
        {helpText && <div className="ff-help">{helpText}</div>}
      </div>
    );
  }

  // number
  if (field.type === "number") {
    return (
      <div className="field">
        <label>{label}</label>
        <input type="number" defaultValue={value ?? ""} />
        {helpText && <div className="ff-help">{helpText}</div>}
      </div>
    );
  }

  // date
  if (field.type === "date") {
    return (
      <div className="field">
        <label>{label}</label>
        <input type="date" defaultValue={value || ""} />
        {helpText && <div className="ff-help">{helpText}</div>}
      </div>
    );
  }

  // text (default) — fa_code is read-only
  const isReadOnly = field.id === "fa_code" || field.id === "fg_code";
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className={isReadOnly ? "mono" : ""}
        defaultValue={value || ""}
        readOnly={isReadOnly}
        style={isReadOnly ? { background: "var(--gray-100)" } : {}}
      />
      {helpText && <div className="ff-help">{helpText}</div>}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Generic department tab — renders any dept from config.
// Used as fallback when no custom <FACoreTab>/<FAPlanningTab>/etc. exists.
// ----------------------------------------------------------------------------
window.GenericDeptTab = function GenericDeptTab({ fa, deptId, openModal }) {
  const dept = window.getDeptConfig(deptId);
  if (!dept) {
    return (
      <div className="card">
        <div className="muted">No configuration found for "{deptId}". Open the Configuration tab to add this department.</div>
      </div>
    );
  }

  const closed = window.isDeptClosed(fa, deptId);
  const requiredFields = (dept.fields || []).filter(f => f.required);
  const allRequiredFilled = requiredFields.every(f => {
    const v = fa[f.id];
    return v !== undefined && v !== null && v !== "";
  });

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{dept.label} section</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {dept.fields.length} field{dept.fields.length === 1 ? "" : "s"}
            {dept.blocking_deps && dept.blocking_deps.length > 0 && (
              <> · Requires: {dept.blocking_deps.join(", ")}</>
            )}
            {dept.close_role && <> · Close role: {dept.close_role.join(" / ")}</>}
          </div>
        </div>
        {closed
          ? <span className="badge badge-green">✓ Closed</span>
          : <span className="badge badge-gray">Open</span>}
      </div>

      <div className="form-grid">
        {(dept.fields || []).map(f => (
          <window.ConfigField key={f.id} field={f} fa={fa} />
        ))}
      </div>

      {!allRequiredFilled && requiredFields.length > 0 && (
        <div className="alert alert-amber" style={{ marginTop: 10 }}>
          <strong>Required fields missing:</strong>{" "}
          {requiredFields.filter(f => !fa[f.id]).map(f => f.label).join(", ")} must be filled before closing.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button className="btn btn-secondary btn-sm">Save {dept.label}</button>
        <button
          className="btn btn-primary btn-sm"
          disabled={!allRequiredFilled || closed}
          onClick={() => openModal && openModal("deptClose", { fa, dept: dept.label })}
        >
          {closed ? `${dept.label} closed` : `Close ${dept.label} section`}
        </button>
      </div>
    </div>
  );
};
