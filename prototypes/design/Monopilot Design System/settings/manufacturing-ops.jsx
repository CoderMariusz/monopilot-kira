// ============================================================
// SET-055 Manufacturing Operations List (host for T-078 modal + T-115 link)
// SET-056 Manufacturing Operation Edit Modal (T-078)
// SET-057 Manufacturing Operation Audit Trail (T-115)
// spec: PRD 02-SETTINGS §8.9 (Manufacturing Operations)
// ============================================================

// Validation contract V-SET-MFG (per task T-078):
//   V-SET-MFG-01: process_suffix — uppercase alphanumeric only (regex ^[A-Z0-9]+$)
//   V-SET-MFG-02: operation_name — required, 3..120 chars
//   V-SET-MFG-03: dept — required, must be in resolved dept list
//   V-SET-MFG-04: capacity_per_hour — optional, positive integer if set
//   V-SET-MFG-05: process_suffix — unique per org (mock check against existing rows)

const MFG_DEPTS = [
  { code: "core",         label: "Core" },
  { code: "production",   label: "Production" },
  { code: "packaging",    label: "Packaging" },
  { code: "technical_rd", label: "Technical R&D" },
  { code: "technical_qa", label: "Technical QA" },
];

const validateMfgOp = (form, mode, existing) => {
  const errors = {};
  // V-SET-MFG-02
  if (mode === "create") {
    if (!form.operation_name || form.operation_name.trim().length < 3)
      errors.operation_name = "Required. 3–120 chars.";
    else if (form.operation_name.length > 120)
      errors.operation_name = "Max 120 chars.";
    // V-SET-MFG-01
    if (!form.process_suffix)
      errors.process_suffix = "Required.";
    else if (!/^[A-Z0-9]+$/.test(form.process_suffix))
      errors.process_suffix = "V-SET-MFG-01: uppercase alphanumeric only.";
    else {
      // V-SET-MFG-05
      const dupe = (existing || []).some((e) => e.process_suffix === form.process_suffix);
      if (dupe) errors.process_suffix = "V-SET-MFG-05: this suffix is already in use.";
    }
  }
  // V-SET-MFG-03
  if (!form.dept) errors.dept = "Required. Pick a department.";
  // V-SET-MFG-04
  if (form.capacity_per_hour !== "" && form.capacity_per_hour != null) {
    const n = Number(form.capacity_per_hour);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n))
      errors.capacity_per_hour = "V-SET-MFG-04: positive integer only.";
  }
  return errors;
};

// ---------- T-078: Manufacturing Operation Edit Modal ----------
const ManufacturingOpEditModal = ({ open, onClose, data }) => {
  if (!open) return null;
  const mode = data?.mode || "edit";
  const original = data?.op || null;
  const existing = (window.SETTINGS_MANUFACTURING_OPS || []).filter(o => !original || o.id !== original.id);

  const [form, setForm] = React.useState({
    operation_name: original?.operation_name || "",
    process_suffix: original?.process_suffix || "",
    dept: original?.dept || "",
    is_active: original?.is_active ?? true,
    capacity_per_hour: original?.capacity_per_hour ?? "",
    notes: original?.notes || "",
  });
  const [submitted, setSubmitted] = React.useState(false);

  const errors = validateMfgOp(form, mode, existing);
  const set = (k, v) => setForm({ ...form, [k]: v });

  const save = () => {
    setSubmitted(true);
    if (Object.keys(errors).length === 0) {
      // mock save
      onClose();
    }
  };

  // In Edit mode operation_name + process_suffix are READ-ONLY (per §8.9.4).
  const editLockedField = (label, value) => (
    <div className="sg-row" style={{ padding: "12px 16px" }}>
      <div><div className="sg-label">{label}</div><div className="sg-hint">Read-only after creation.</div></div>
      <div className="sg-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="mono" style={{ fontSize: 13 }}>{value}</span>
        <span className="badge badge-gray" style={{ fontSize: 9 }}>locked</span>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: 560, maxWidth: "92vw", borderRadius: "var(--radius)", boxShadow: "0 16px 48px rgba(0,0,0,0.2)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {mode === "create" ? "Add manufacturing operation" : `Edit operation`}
            </div>
            {mode === "edit" && original && <div className="muted mono" style={{ fontSize: 11 }}>{original.id}</div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <div className="sg-section-body" style={{ padding: 0 }}>
            {/* operation_name */}
            {mode === "edit"
              ? editLockedField("Operation name", original?.operation_name)
              : (
                <div className="sg-row" style={{ padding: "12px 16px" }}>
                  <div><div className="sg-label">Operation name *</div><div className="sg-hint">3–120 chars.</div></div>
                  <div className="sg-field" style={{ width: "100%" }}>
                    <input value={form.operation_name} onChange={(e) => set("operation_name", e.target.value)} placeholder="Slicing Line 3 — High-throughput" style={{ width: "100%" }} />
                    {submitted && errors.operation_name && <div style={{ color: "var(--red-700)", fontSize: 11, marginTop: 4 }}>{errors.operation_name}</div>}
                  </div>
                </div>
              )}

            {/* process_suffix */}
            {mode === "edit"
              ? editLockedField("Process suffix", original?.process_suffix)
              : (
                <div className="sg-row" style={{ padding: "12px 16px" }}>
                  <div><div className="sg-label">Process suffix *</div><div className="sg-hint">Uppercase letters/digits only. Used in WIP code generation (V-SET-MFG-01).</div></div>
                  <div className="sg-field" style={{ width: "100%" }}>
                    <input className="mono" value={form.process_suffix} onChange={(e) => set("process_suffix", e.target.value)} placeholder="SL3" style={{ width: "100%" }} />
                    {submitted && errors.process_suffix && <div style={{ color: "var(--red-700)", fontSize: 11, marginTop: 4 }}>{errors.process_suffix}</div>}
                  </div>
                </div>
              )}

            {/* dept */}
            <div className="sg-row" style={{ padding: "12px 16px" }}>
              <div><div className="sg-label">Department *</div><div className="sg-hint">Which dept owns this op.</div></div>
              <div className="sg-field" style={{ width: "100%" }}>
                <select value={form.dept} onChange={(e) => set("dept", e.target.value)} style={{ width: "100%" }}>
                  <option value="">— Select department —</option>
                  {MFG_DEPTS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                </select>
                {submitted && errors.dept && <div style={{ color: "var(--red-700)", fontSize: 11, marginTop: 4 }}>{errors.dept}</div>}
              </div>
            </div>

            {/* capacity_per_hour */}
            <div className="sg-row" style={{ padding: "12px 16px" }}>
              <div><div className="sg-label">Capacity per hour</div><div className="sg-hint">Optional. Positive integer.</div></div>
              <div className="sg-field">
                <input type="number" value={form.capacity_per_hour} onChange={(e) => set("capacity_per_hour", e.target.value)} placeholder="1200" style={{ width: 120 }} />
                {submitted && errors.capacity_per_hour && <div style={{ color: "var(--red-700)", fontSize: 11, marginTop: 4 }}>{errors.capacity_per_hour}</div>}
              </div>
            </div>

            {/* is_active */}
            <div className="sg-row" style={{ padding: "12px 16px" }}>
              <div><div className="sg-label">Active</div><div className="sg-hint">Inactive ops are hidden from line assignment dropdowns.</div></div>
              <div className="sg-field"><Toggle on={form.is_active} onChange={(v) => set("is_active", v)} /></div>
            </div>

            {/* notes */}
            <div className="sg-row" style={{ padding: "12px 16px", display: "block" }}>
              <div style={{ marginBottom: 6 }}><div className="sg-label">Notes</div><div className="sg-hint">Internal context. Visible to module admins only.</div></div>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Optional notes…" style={{ width: "100%", padding: 8, fontSize: 12, fontFamily: "inherit" }} />
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--gray-050)" }}>
          {mode === "edit" && (
            <div className="muted" style={{ fontSize: 11 }}>
              Created {original?.created_at} by {original?.created_by}. Last updated {original?.updated_at}.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save}>
              {mode === "create" ? "Create operation" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- T-077-ish: Manufacturing Operations LIST (host for the modal + history link) ----------
const ManufacturingOpsScreen = ({ openModal, onOpenHistory }) => {
  const ops = window.SETTINGS_MANUFACTURING_OPS;
  const [editOp, setEditOp] = React.useState(null);
  const [mode, setMode]     = React.useState("edit"); // 'create' | 'edit'

  const openEdit   = (op) => { setEditOp(op);  setMode("edit"); };
  const openCreate = () => { setEditOp({});   setMode("create"); };
  const close = () => setEditOp(null);

  return (
    <>
      <PageHead
        title="Manufacturing operations"
        sub="Process catalog — each op has a unique uppercase suffix used in WIP code generation."
        actions={<>
          <button className="btn btn-secondary btn-sm">Import CSV</button>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Add operation</button>
        </>}
      />

      <div className="alert alert-blue" style={{ marginBottom: 12, fontSize: 12 }}>
        Operations are referenced by routings, line assignments, and WIP code generators. The <span className="mono">process_suffix</span> is immutable after creation.
      </div>

      <Section title={`${ops.length} operations`}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Suffix</th>
              <th>Department</th>
              <th>Capacity / h</th>
              <th>Status</th>
              <th>Updated</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ops.map((o) => (
              <tr key={o.id}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{o.operation_name}</div>
                  <div className="muted mono" style={{ fontSize: 10 }}>{o.id}</div>
                </td>
                <td><span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{o.process_suffix}</span></td>
                <td><span className="badge badge-gray" style={{ fontSize: 9 }}>{(MFG_DEPTS.find(d => d.code === o.dept) || {}).label || o.dept}</span></td>
                <td className="mono num">{o.capacity_per_hour || <span className="muted">—</span>}</td>
                <td>{o.is_active ? <span className="badge badge-green" style={{ fontSize: 9 }}>● Active</span> : <span className="badge badge-gray" style={{ fontSize: 9 }}>○ Inactive</span>}</td>
                <td className="mono muted" style={{ fontSize: 11 }}>{o.updated_at}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(o)} title="Edit">✎ Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onOpenHistory && onOpenHistory(o.id)} title="View history" style={{ marginLeft: 4 }}>⟲ History</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <ManufacturingOpEditModal open={!!editOp} onClose={close} data={{ op: editOp, mode }} />
    </>
  );
};

// ---------- T-115: SET-057 Manufacturing Operation Audit Trail ----------
const FieldDiff = ({ change }) => {
  const fmt = (v) => v === null || v === undefined ? <span className="muted">∅ (none)</span>
                  : typeof v === "boolean" ? <span className={"badge " + (v ? "badge-green" : "badge-gray")} style={{ fontSize: 9 }}>{v ? "true" : "false"}</span>
                  : <span className="mono">{String(v)}</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 24px 1fr", gap: 10, alignItems: "center", padding: "6px 12px", borderBottom: "1px dashed var(--border)" }}>
      <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{change.field}</div>
      <div style={{ background: "var(--red-050a)", padding: "3px 8px", borderRadius: 3, fontSize: 12 }}>{fmt(change.from)}</div>
      <div style={{ textAlign: "center", color: "var(--muted)" }}>→</div>
      <div style={{ background: "var(--green-050a)", padding: "3px 8px", borderRadius: 3, fontSize: 12 }}>{fmt(change.to)}</div>
    </div>
  );
};

const MfgActionBadge = ({ action }) => {
  const map = { create: "badge-green", update: "badge-blue", delete: "badge-red" };
  return <span className={"badge " + (map[action] || "badge-gray")} style={{ fontSize: 10, textTransform: "uppercase" }}>{action}</span>;
};

const ManufacturingOpHistoryScreen = ({ operationId, onExit, role }) => {
  // RBAC mock: settings.audit.read AND manufacturing_operations.view.
  // Admin role => granted. user role => 403.
  const hasAccess = role === "admin";

  // Mock 'user filter' options come from unique users in audit list
  const [filterUser, setFilterUser] = React.useState("all");
  const [filterFrom, setFilterFrom] = React.useState("");
  const [filterTo, setFilterTo]     = React.useState("");
  const [filterName, setFilterName] = React.useState(""); // operation_name search
  const [expanded, setExpanded] = React.useState(null);

  if (!hasAccess) {
    return (
      <>
        <PageHead title="Manufacturing operation history" />
        <div className="alert alert-red" style={{ fontSize: 13 }}>
          <strong>403 — Access denied.</strong> Requires <span className="mono">manufacturing_operations.view</span> and <span className="mono">settings.audit.read</span>.
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onExit}>← Back</button>
      </>
    );
  }

  const op = (window.SETTINGS_MANUFACTURING_OPS || []).find(o => o.id === operationId)
          || window.SETTINGS_MANUFACTURING_OPS[0];

  const allEntries = (window.SETTINGS_MFG_AUDIT || []).filter(e => e.entity_type === "manufacturing_operation" && e.entity_id === op.id);
  const users = Array.from(new Set(allEntries.map(e => e.user)));

  const entries = allEntries
    .filter(e => filterUser === "all" || e.user === filterUser)
    .filter(e => !filterFrom || e.at.split(" ")[0] >= filterFrom)
    .filter(e => !filterTo   || e.at.split(" ")[0] <= filterTo)
    .filter(e => !filterName || op.operation_name.toLowerCase().includes(filterName.toLowerCase()))
    .sort((a, b) => b.at.localeCompare(a.at)); // DESC

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
        <div>
          <div className="muted mono" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>
            <span style={{ cursor: "pointer" }} onClick={onExit}>Settings</span>
            {" / "}
            <span style={{ cursor: "pointer" }} onClick={onExit}>Manufacturing operations</span>
            {" / "}
            <span>History: {op.operation_name}</span>
          </div>
          <h1 className="sg-title" style={{ margin: "4px 0 4px" }}>History — <span className="mono">{op.process_suffix}</span></h1>
          <div className="sg-sub" style={{ fontSize: 13 }}>
            Per-operation audit trail. Showing every create / update / delete event.
            <span className="muted mono" style={{ fontSize: 11, marginLeft: 8 }}>{op.id}</span>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onExit}>← Back</button>
      </div>

      {/* Filter toolbar */}
      <div className="sg-section" style={{ marginBottom: 12 }}>
        <div style={{ padding: "10px 14px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Search by operation name…" value={filterName} onChange={(e) => setFilterName(e.target.value)} style={{ width: 240, fontSize: 12 }} />
          <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} style={{ fontSize: 12 }}>
            <option value="all">All users</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 11 }}>Date</span>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} style={{ fontSize: 12 }} />
          <span className="muted" style={{ fontSize: 11 }}>to</span>
          <input type="date" value={filterTo}   onChange={(e) => setFilterTo(e.target.value)}   style={{ fontSize: 12 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterUser("all"); setFilterFrom(""); setFilterTo(""); setFilterName(""); }}>Reset</button>
          <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>{entries.length} of {allEntries.length} entries</span>
        </div>
      </div>

      <Section title="Audit log entries">
        {entries.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center", fontSize: 13 }}>No entries match the current filters.</div>
        ) : (
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Changed fields</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const open = expanded === e.id;
                return (
                  <React.Fragment key={e.id}>
                    <tr style={{ cursor: "pointer", background: open ? "var(--blue-050)" : undefined }} onClick={() => setExpanded(open ? null : e.id)}>
                      <td><span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.1s", color: "var(--muted)" }}>▸</span></td>
                      <td className="mono" style={{ fontSize: 11 }}>{e.at}</td>
                      <td style={{ fontSize: 12 }}>
                        <div style={{ fontWeight: 500 }}>{e.user}</div>
                        {e.user_email && <div className="muted mono" style={{ fontSize: 10 }}>{e.user_email}</div>}
                      </td>
                      <td><MfgActionBadge action={e.action} /></td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {e.changes.slice(0, 4).map((c, i) => <span key={i} className="badge badge-gray" style={{ fontSize: 9 }}>{c.field}</span>)}
                          {e.changes.length > 4 && <span className="badge badge-gray" style={{ fontSize: 9 }}>+{e.changes.length - 4} more</span>}
                        </div>
                      </td>
                      <td className="mono muted" style={{ fontSize: 11 }}>{e.ip || "—"}</td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, background: "var(--gray-100)" }}>
                          <div style={{ padding: "10px 16px" }}>
                            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)", fontWeight: 600, marginBottom: 6 }}>Field diff (old → new)</div>
                            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                              {e.changes.map((c, i) => <FieldDiff key={i} change={c} />)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
};

Object.assign(window, { ManufacturingOpsScreen, ManufacturingOpEditModal, ManufacturingOpHistoryScreen });
