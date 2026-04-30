// ============================================================================
// NPD module · config-screens.jsx — Configuration list + detail (depts/fields/rules editor)
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// ============================================================================
// NPD Configuration screens
//
// Routes:
//   - "config"             → ConfigList: 3 templates + active marker + actions
//   - "config_detail"      → ConfigDetail: dept table + field editor + rules tabs
//
// Pattern:
//   Classic enterprise table with row-edit forms (no drag-drop).
//   Permissions: only role=admin can edit; npd_manager can "Request changes".
//
// Spec ref: 01-NPD-UX.md §8 (workflow builder per tenant)
// ============================================================================

// =============================================================================
// SCR-CONFIG-01 — Configuration list (template gallery + active marker)
// =============================================================================
const ConfigList = ({ onOpenConfig, openModal }) => {
  const [activeId, setActiveId] = React.useState(window.NPD_ACTIVE_CONFIG_ID);
  const canEdit = window.NPD_CONFIG_CAN_EDIT();

  // Refresh local state when modal commits the activation.
  React.useEffect(() => {
    const onChange = () => setActiveId(window.NPD_ACTIVE_CONFIG_ID);
    window.addEventListener("npd:config-activated", onChange);
    return () => window.removeEventListener("npd:config-activated", onChange);
  }, []);

  const handleActivate = (id) => {
    if (!canEdit) {
      alert("Only Admin role can activate templates. Switch role in the dev banner above.");
      return;
    }
    const tpl = window.NPD_CONFIG_TEMPLATES.find(t => t.id === id);
    openModal && openModal("activateTemplate", { tpl });
  };

  return (
    <>
      <div className="breadcrumb"><a>NPD</a> / Configuration</div>
      <div className="page-head">
        <div>
          <div className="page-title">NPD Configuration</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Workflow templates per tenant — define which departments take part in closing FAs and what fields each fills in
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!canEdit && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span className="badge badge-amber">🔒 Read-only · admin role required to edit</span>
            </div>
          )}
          {canEdit && <button className="btn btn-secondary">+ New from blank</button>}
        </div>
      </div>

      {/* Permission notice */}
      <div className="alert alert-blue" style={{ marginBottom: 14 }}>
        <strong>Two-step approval:</strong> Admin defines templates · NPD Manager can <em>Request changes</em> for review.
        Existing FAs keep their old schema (migration: removed fields hidden, new fields empty until filled).
      </div>

      {/* Template comparison table — enterprise feel */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Template</th>
              <th>Industry</th>
              <th>Based on</th>
              <th style={{ textAlign: "right" }}>Depts</th>
              <th style={{ textAlign: "right" }}>Fields</th>
              <th style={{ textAlign: "right" }}>Validations</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {window.NPD_CONFIG_TEMPLATES.map(t => {
              const fieldsCount = t.departments.reduce((s, d) => s + d.fields.length, 0);
              const isActive = t.id === activeId;
              return (
                <tr key={t.id} style={{ background: isActive ? "var(--blue-050, #eff6ff)" : undefined }}>
                  <td style={{ textAlign: "center", fontSize: 16 }}>
                    {isActive && <span title="Active template" style={{ color: "var(--blue)" }}>●</span>}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{t.description}</div>
                  </td>
                  <td className="muted">{t.industry}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{t.based_on}</td>
                  <td className="mono num" style={{ fontWeight: 600 }}>{t.departments_count}</td>
                  <td className="mono num">{fieldsCount}</td>
                  <td className="mono num">{t.validation_rules.length}</td>
                  <td>
                    {isActive
                      ? <span className="badge badge-blue">● Active</span>
                      : <span className="badge badge-gray">Available</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap", display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenConfig(t.id)}>Open</button>
                    {!isActive && canEdit && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleActivate(t.id)}>Activate</button>
                    )}
                    {canEdit && (
                      <button className="btn btn-ghost btn-sm" title="Duplicate as starting point for custom config">⎘ Clone</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quick stats — 3 cards at bottom */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Active template</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {window.NPD_GET_ACTIVE_CONFIG().name}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
            Used by all new FAs · existing FAs keep their schema
          </div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>FGs on this config</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {window.NPD_FAS.length}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>All currently active</div>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Last modified</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>—</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Built-in template (read-only)</div>
        </div>
      </div>
    </>
  );
};

// =============================================================================
// SCR-CONFIG-02 — Configuration detail (departments + fields + rules)
// =============================================================================
const ConfigDetail = ({ configId, onBack, openModal }) => {
  const tpl = window.NPD_CONFIG_TEMPLATES.find(t => t.id === configId)
           || window.NPD_CONFIG_TEMPLATES[0];
  const [tab, setTab] = React.useState("depts");
  const [selectedDept, setSelectedDept] = React.useState(tpl.departments[0].id);
  const isActive = tpl.id === window.NPD_ACTIVE_CONFIG_ID;
  const canEdit = window.NPD_CONFIG_CAN_EDIT();

  const dept = tpl.departments.find(d => d.id === selectedDept) || tpl.departments[0];

  return (
    <>
      <div className="sticky-form-header" style={{ padding: "10px 0", marginBottom: 10 }}>
        <div className="breadcrumb">
          <a onClick={onBack}>NPD</a> / <a onClick={onBack}>Configuration</a> / {tpl.name}
        </div>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{tpl.name}</div>
              {isActive && <span className="badge badge-blue">● Active</span>}
              <span className="badge badge-gray">{tpl.industry}</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {tpl.based_on} · {tpl.departments_count} departments · {tpl.departments.reduce((s, d) => s + d.fields.length, 0)} fields total
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!canEdit && (
              <button className="btn btn-secondary"
                      onClick={() => openModal && openModal("requestChanges", { tpl })}>
                📨 Request changes
              </button>
            )}
            {canEdit && !isActive && <button className="btn btn-secondary">⎘ Clone &amp; edit</button>}
            {canEdit && <button className="btn btn-primary">💾 Save changes</button>}
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="subnav-inline">
        <a className={tab === "depts"       ? "on" : ""} onClick={() => setTab("depts")}>Departments &amp; fields</a>
        <a className={tab === "rules"       ? "on" : ""} onClick={() => setTab("rules")}>Blocking rules</a>
        <a className={tab === "validations" ? "on" : ""} onClick={() => setTab("validations")}>Validations</a>
        <a className={tab === "permissions" ? "on" : ""} onClick={() => setTab("permissions")}>Permissions</a>
        <a className={tab === "preview"     ? "on" : ""} onClick={() => setTab("preview")}>Preview</a>
      </div>

      {tab === "depts" && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12 }}>
          {/* Left: department list */}
          <div className="card" style={{ margin: 0, padding: 0 }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Departments ({tpl.departments.length})</div>
              {canEdit && (
                <button className="btn btn-ghost btn-sm"
                        onClick={() => openModal && openModal("addDepartment", { tpl })}>+ Add</button>
              )}
            </div>
            {tpl.departments.map((d, i) => (
              <div
                key={d.id}
                onClick={() => setSelectedDept(d.id)}
                style={{
                  padding: "10px 12px",
                  borderBottom: i < tpl.departments.length - 1 ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                  background: selectedDept === d.id ? "var(--blue-050, #eff6ff)" : undefined,
                  borderLeft: selectedDept === d.id ? "3px solid var(--blue)" : "3px solid transparent"
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="mono muted" style={{ fontSize: 11, minWidth: 20 }}>{d.order}.</span>
                  <span style={{ fontWeight: selectedDept === d.id ? 600 : 500, fontSize: 13 }}>{d.label}</span>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2, paddingLeft: 28 }}>
                  {d.fields.length} fields · {d.fields.filter(f => f.required).length} required
                </div>
                {d.blocking_deps.length > 0 && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 2, paddingLeft: 28 }}>
                    🔒 blocked by: {d.blocking_deps.join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right: dept fields editor */}
          <DepartmentFieldEditor dept={dept} tpl={tpl} canEdit={canEdit} openModal={openModal} />
        </div>
      )}

      {tab === "rules" && <BlockingRulesView tpl={tpl} canEdit={canEdit} />}
      {tab === "validations" && <ValidationsView tpl={tpl} canEdit={canEdit} />}
      {tab === "permissions" && <PermissionsView tpl={tpl} canEdit={canEdit} />}
      {tab === "preview" && <PreviewView tpl={tpl} />}
    </>
  );
};

// =============================================================================
// Department field editor — table of fields per dept
// =============================================================================
const DepartmentFieldEditor = ({ dept, tpl, canEdit, openModal }) => {
  const [editingField, setEditingField] = React.useState(null);

  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-head">
        <div>
          <div className="card-title">{dept.label} — fields</div>
          <div className="muted" style={{ fontSize: 11 }}>
            Order #{dept.order} · close requires role: {dept.close_role.join(" or ")}
          </div>
        </div>
        {canEdit && (
          <button className="btn btn-secondary btn-sm"
                  onClick={() => openModal && openModal("addField", { dept, tpl })}>
            + Add field
          </button>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}>#</th>
            <th>Field ID</th>
            <th>Label</th>
            <th>Type</th>
            <th style={{ textAlign: "center" }}>Required</th>
            <th>Validation</th>
            <th>Cascade resets</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {dept.fields.map((f, i) => {
            const ft = window.NPD_FIELD_TYPES.find(t => t.id === f.type);
            return (
              <tr key={f.id}
                  style={{ cursor: canEdit ? "pointer" : "default", background: editingField === f.id ? "var(--blue-050, #eff6ff)" : undefined }}
                  onClick={() => canEdit && setEditingField(editingField === f.id ? null : f.id)}>
                <td className="mono muted">{i + 1}</td>
                <td className="mono" style={{ fontSize: 12 }}>{f.id}</td>
                <td style={{ fontWeight: 500 }}>{f.label}</td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span className="mono" style={{ width: 16, textAlign: "center", color: "var(--muted)" }}>{ft?.icon}</span>
                    {ft?.label || f.type}
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  {f.required
                    ? <span className="badge badge-red" style={{ fontSize: 9 }}>Required</span>
                    : <span className="muted" style={{ fontSize: 11 }}>Optional</span>}
                </td>
                <td>
                  {f.validation
                    ? <span className="badge badge-blue" style={{ fontSize: 9 }}>{f.validation}</span>
                    : <span className="muted" style={{ fontSize: 11 }}>—</span>}
                </td>
                <td className="muted" style={{ fontSize: 11 }}>
                  {f.cascade_resets?.length
                    ? <span title="Changing this field resets these">↻ {f.cascade_resets.join(", ")}</span>
                    : "—"}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  {canEdit && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" title="Edit field">✎</button>
                      <button className="btn btn-ghost btn-sm" title="Delete field" style={{ color: "var(--red)" }}>✕</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Inline field edit form (appears when row clicked) */}
      {editingField && canEdit && (
        <FieldEditForm field={dept.fields.find(f => f.id === editingField)} onClose={() => setEditingField(null)} />
      )}
    </div>
  );
};

// =============================================================================
// Inline field edit form — appears under selected row
// =============================================================================
const FieldEditForm = ({ field, onClose }) => {
  const ft = window.NPD_FIELD_TYPES.find(t => t.id === field.type);
  const hasValues = ["dropdown", "multiselect"].includes(field.type);

  return (
    <div style={{
      borderTop: "2px solid var(--blue)",
      background: "var(--blue-050, #eff6ff)",
      padding: 16,
      margin: "0 -14px -14px -14px"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Edit field: <span className="mono">{field.id}</span></div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
      </div>

      <div className="form-grid">
        <div className="field"><label>Field ID</label>
          <input className="mono" defaultValue={field.id} />
          <div className="ff-help">snake_case · cannot contain dots</div>
        </div>
        <div className="field"><label>Label (UI)</label>
          <input defaultValue={field.label} />
        </div>
        <div className="field"><label>Type</label>
          <select defaultValue={field.type}>
            {window.NPD_FIELD_TYPES.map(t => <option key={t.id} value={t.id}>{t.icon}  {t.label} — {t.desc}</option>)}
          </select>
        </div>
        <div className="field"><label>Required</label>
          <select defaultValue={field.required ? "yes" : "no"}>
            <option value="yes">Yes — must be filled before close</option>
            <option value="no">No — optional</option>
          </select>
        </div>
        <div className="field"><label>Validation rule</label>
          <select defaultValue={field.validation || ""}>
            <option value="">— None —</option>
            <option>V01 — FG Code format</option>
            <option>V02 — Required</option>
            <option>V04 — D365 lookup</option>
            <option>V07 — Allergen check</option>
            <option>V08 — Date constraint</option>
          </select>
        </div>
        <div className="field"><label>Help text</label>
          <input defaultValue={field.help || ""} placeholder="Shown under the input" />
        </div>

        {hasValues && (
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label>Allowed values ({field.values?.length || 0})</label>
            <textarea
              rows="3"
              defaultValue={field.values?.join("\n") || ""}
              placeholder="One value per line"
            />
            <div className="ff-help">For {field.type} fields. One value per line.</div>
          </div>
        )}

        {field.type === "computed" && (
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label>Computed from</label>
            <input className="mono" defaultValue={field.computed_from || ""} placeholder="e.g. finish_wip" />
            <div className="ff-help">Source field — value auto-derives on cascade</div>
          </div>
        )}

        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>Cascade resets</label>
          <input defaultValue={field.cascade_resets?.join(", ") || ""} placeholder="comma-separated field IDs" />
          <div className="ff-help">When this field changes, listed fields are cleared (e.g. pack_size → line, dieset)</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={onClose}>Save field</button>
      </div>
    </div>
  );
};

// =============================================================================
// Blocking rules view — visual matrix of "X blocks Y"
// =============================================================================
const BlockingRulesView = ({ tpl, canEdit }) => {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Blocking rules</div>
            <div className="muted" style={{ fontSize: 11 }}>
              "X blocks Y" — Y cannot be closed until X is closed. Drives the locked-tab UX in FG Detail.
            </div>
          </div>
          {canEdit && <button className="btn btn-secondary btn-sm">+ Add rule</button>}
        </div>

        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th>Cannot close until these are closed:</th>
              <th>Effect</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tpl.departments.map(d => (
              <tr key={d.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mono muted" style={{ fontSize: 11 }}>{d.order}.</span>
                    <span style={{ fontWeight: 500 }}>{d.label}</span>
                  </div>
                </td>
                <td>
                  {d.blocking_deps.length === 0
                    ? <span className="muted" style={{ fontSize: 12 }}>— No prerequisites (entry point) —</span>
                    : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {d.blocking_deps.map(dep => {
                          const blocker = tpl.departments.find(x => x.id === dep);
                          return (
                            <span key={dep} className="badge badge-amber" style={{ fontSize: 10 }}>
                              🔒 {blocker?.label || dep}
                            </span>
                          );
                        })}
                      </div>
                    )}
                </td>
                <td className="muted" style={{ fontSize: 11 }}>
                  {d.blocking_deps.length === 0
                    ? "Tab open from FG creation"
                    : `Tab locked until prereqs done`}
                </td>
                <td>
                  {canEdit && <button className="btn btn-ghost btn-sm">✎</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Visual flow diagram */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 10 }}>Visual flow</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "10px 0" }}>
          {tpl.departments.map((d, i) => (
            <React.Fragment key={d.id}>
              <div style={{
                padding: "8px 14px",
                background: d.blocking_deps.length === 0 ? "var(--green)" : "var(--blue-050, #eff6ff)",
                color: d.blocking_deps.length === 0 ? "#fff" : "var(--text)",
                border: d.blocking_deps.length === 0 ? "none" : "1px solid var(--blue)",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600
              }}>
                {d.order}. {d.label}
                {d.blocking_deps.length > 0 && (
                  <div className="muted" style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>
                    needs: {d.blocking_deps.join(", ")}
                  </div>
                )}
              </div>
              {i < tpl.departments.length - 1 && <span style={{ color: "var(--muted)", fontSize: 16 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Green = entry-point (no blockers) · Blue = waits for prerequisites
        </div>
      </div>
    </>
  );
};

// =============================================================================
// Validations view
// =============================================================================
const ValidationsView = ({ tpl, canEdit }) => (
  <div className="card">
    <div className="card-head">
      <div>
        <div className="card-title">Validation rules</div>
        <div className="muted" style={{ fontSize: 11 }}>
          Run on save / on close-section / on D365 build. Each rule reports pass | warn | fail in the FG right panel.
        </div>
      </div>
      {canEdit && <button className="btn btn-secondary btn-sm">+ Add rule</button>}
    </div>

    <table>
      <thead>
        <tr>
          <th style={{ width: 50 }}>ID</th>
          <th>Title</th>
          <th>Scope</th>
          <th>Applies to</th>
          <th>Regex / condition</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {tpl.validation_rules.map(r => (
          <tr key={r.id}>
            <td className="mono"><span className="badge badge-blue">{r.id}</span></td>
            <td style={{ fontWeight: 500 }}>{r.title}</td>
            <td>
              {r.scope === "field"   && <span className="badge badge-gray">field</span>}
              {r.scope === "section" && <span className="badge badge-amber">section</span>}
              {r.scope === "global"  && <span className="badge badge-violet">global</span>}
            </td>
            <td className="mono" style={{ fontSize: 11 }}>{r.applies_to || "—"}</td>
            <td className="mono" style={{ fontSize: 11 }}>{r.regex || <span className="muted">—</span>}</td>
            <td>{canEdit && <button className="btn btn-ghost btn-sm">✎</button>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// =============================================================================
// Permissions view — who can close each dept
// =============================================================================
const PermissionsView = ({ tpl, canEdit }) => {
  const allRoles = ["npd_manager", "core_user", "dept_manager", "dept_user", "admin", "viewer"];

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Close-section permissions</div>
          <div className="muted" style={{ fontSize: 11 }}>
            Which roles can press "Close section" for each department. Multiple roles = OR.
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Department</th>
            {allRoles.map(r => (
              <th key={r} style={{ textAlign: "center", fontSize: 10 }}>{r.replace("_", " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tpl.departments.map(d => (
            <tr key={d.id}>
              <td style={{ fontWeight: 500 }}>{d.label}</td>
              {allRoles.map(r => {
                const allowed = d.close_role.includes(r) || r === "admin";
                return (
                  <td key={r} style={{ textAlign: "center" }}>
                    {canEdit
                      ? <input type="checkbox" defaultChecked={allowed} disabled={r === "admin"} title={r === "admin" ? "Admin always has access" : ""} />
                      : (allowed ? <span style={{ color: "var(--green)" }}>✓</span> : <span className="muted">—</span>)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// =============================================================================
// Preview — shows how FG Detail tab strip would look with this config
// =============================================================================
const PreviewView = ({ tpl }) => (
  <>
    <div className="alert alert-blue">
      <strong>Live preview:</strong> this is how FG Detail will render with the {tpl.name} configuration. Use it to sanity-check before activating.
    </div>

    {/* Mock FG Detail header */}
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Mock FG — preview only</div>
          <div className="muted" style={{ fontSize: 11 }}>FA-DEMO · Sample product · Launch 2026-Q4</div>
        </div>
      </div>

      {/* Gate progress strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "10px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        {tpl.departments.map((d, i) => (
          <React.Fragment key={d.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: i === 0 ? "var(--green)" : "var(--gray-100)",
                color: i === 0 ? "#fff" : "var(--muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700
              }}>
                {i === 0 ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{d.label}</span>
            </div>
            {i < tpl.departments.length - 1 && <div style={{ flex: 1, height: 2, background: "var(--border)" }}></div>}
          </React.Fragment>
        ))}
      </div>

      {/* Tab strip */}
      <div className="subnav-inline" style={{ marginTop: 14 }}>
        {tpl.departments.map((d, i) => (
          <a key={d.id} className={i === 0 ? "on" : ""}
             style={{ opacity: d.blocking_deps.length > 0 && i > 0 ? 0.5 : 1 }}>
            {d.label}
            {d.blocking_deps.length > 0 && i > 0 && (
              <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 9 }}>Locked</span>
            )}
          </a>
        ))}
      </div>

      {/* First dept's fields rendered as preview */}
      <div style={{ padding: 14, borderTop: "1px solid var(--border)", marginTop: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>{tpl.departments[0].label} fields preview</div>
        <div className="form-grid">
          {tpl.departments[0].fields.slice(0, 8).map(f => (
            <div key={f.id} className="field">
              <label>{f.label}{f.required && <span style={{ color: "var(--red)" }}> *</span>}</label>
              {f.type === "dropdown" && (
                <select disabled>
                  <option>{f.values?.[0] || "—"}</option>
                </select>
              )}
              {f.type === "multiselect" && (
                <input disabled value={f.values?.slice(0, 2).join(", ") || ""} />
              )}
              {f.type === "boolean" && <input type="checkbox" disabled />}
              {f.type === "date" && <input type="date" disabled />}
              {f.type === "number" && <input type="number" disabled placeholder="0" />}
              {f.type === "file" && <input type="file" disabled />}
              {f.type === "computed" && <input className="mono" disabled value="(auto-derived)" style={{ background: "#E0FFE0" }} />}
              {(!["dropdown","multiselect","boolean","date","number","file","computed"].includes(f.type)) && <input disabled placeholder="text" />}
              {f.help && <div className="ff-help">{f.help}</div>}
            </div>
          ))}
        </div>
        {tpl.departments[0].fields.length > 8 && (
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            … and {tpl.departments[0].fields.length - 8} more fields
          </div>
        )}
      </div>
    </div>
  </>
);

Object.assign(window, {
  ConfigList,
  ConfigDetail,
  DepartmentFieldEditor,
  FieldEditForm,
  BlockingRulesView,
  ValidationsView,
  PermissionsView,
  PreviewView
});
