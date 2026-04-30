// ============================================================================
// FA-centric screens — matches 01-NPD-UX.md §3 SCR-01 / SCR-02 / SCR-02b / SCR-03
// Jane is the NPD Manager; dept users fill their tab sections gated by blocking
// rules described in the spec.
// ============================================================================

const alertBadge = (status, days) => {
  if (status === "Alert" || status === "Built" && false) return <span className="badge badge-red">Alert</span>;
  if (status === "Complete") return <span className="badge badge-green">Complete</span>;
  if (status === "Built")    return <span className="badge badge-blue">Built</span>;
  if (status === "InProgress") return <span className="badge badge-amber">In progress</span>;
  if (status === "Pending")   return <span className="badge badge-gray">Pending</span>;
  if (status === "Alert")     return <span className="badge badge-red">Alert</span>;
  return <span className="badge badge-gray">{status}</span>;
};

const daysCell = (d) => {
  if (d === null || d === undefined) return <span className="muted">No date set</span>;
  const color = d <= 10 ? "var(--red)" : d <= 21 ? "var(--amber-700, #b45309)" : "var(--muted)";
  const prefix = d < 0 ? "overdue by " : "";
  return <span className="mono" style={{ color, fontWeight: d <= 21 ? 600 : 400 }}>{prefix}{Math.abs(d)}d</span>;
};

const deptIcon = (s) => {
  if (s === "done")   return <span title="Done"     style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>;
  if (s === "inprog") return <span title="In progress" style={{ color: "var(--amber-700, #b45309)" }}>◐</span>;
  if (s === "blocked")return <span title="Blocked — blocking rule not met" style={{ color: "var(--red)" }}>⊘</span>;
  return <span title="Pending" style={{ color: "var(--gray-300, #cbd5e1)" }}>–</span>;
};

// ===== SCR-01 — NPD Dashboard =====================================================
const NpdDashboard = ({ openModal, onOpenFA }) => {
  const fas = window.NPD_FAS;
  const totalActive = fas.filter(f => !f.built).length;
  const complete    = fas.filter(f => f.status_overall === "Complete").length;
  const inProgress  = fas.filter(f => ["InProgress", "Pending", "Alert"].includes(f.status_overall)).length;
  const built       = fas.filter(f => f.built).length;

  const [showBuilt, setShowBuilt] = React.useState(false);
  const rows = (showBuilt ? fas : fas.filter(f => !f.built))
    .sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999));

  return (
    <>
      <div className="breadcrumb"><a>NPD</a> / Dashboard</div>
      <div className="page-head">
        <div>
          <div className="page-title">NPD Dashboard</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Jane Nowak · NPD Manager — Pipeline overview across 7 departments · reference date 2026-04-21
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => openModal("refreshD365")}>↻ Refresh D365 cache</button>
          {window.npd_can('fa.create') && <button className="btn btn-primary" onClick={() => openModal("faCreate")}>+ Create FA</button>}
        </div>
      </div>

      {/* KPI row — §3.1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--blue)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Total active FAs</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{totalActive}</div>
          <div className="muted" style={{ fontSize: 11 }}>COUNT(*) where built=FALSE</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--green)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Fully complete</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--green)" }}>{complete}</div>
          <div className="muted" style={{ fontSize: 11 }}>Ready for D365 build</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--amber)" }}>
          <div className="muted" style={{ fontSize: 11 }}>In progress / pending</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--amber-700, #b45309)" }}>{inProgress}</div>
          <div className="muted" style={{ fontSize: 11 }}>Awaiting dept fill</div>
        </div>
        <div className="card" style={{ margin: 0, borderBottom: "3px solid var(--blue)" }}>
          <div className="muted" style={{ fontSize: 11 }}>Built for D365</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--blue)" }}>{built}</div>
          <div className="muted" style={{ fontSize: 11 }}>Awaiting retailer approval</div>
        </div>
      </div>

      {/* Department progress + alert legend */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 14 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Department progress</div>
            <div className="muted" style={{ fontSize: 11 }}>7 depts × {totalActive} active FAs</div>
          </div>
          <table>
            <thead><tr><th>Department</th><th style={{ textAlign: "right" }}>Done</th><th style={{ textAlign: "right" }}>Pending</th><th style={{ textAlign: "right" }}>Blocked</th><th>Progress</th></tr></thead>
            <tbody>
              {window.NPD_DEPT_SUMMARY.map(r => {
                const total = r.done + r.pending + r.blocked;
                const pct = total ? (r.done / total) * 100 : 0;
                return (
                  <tr key={r.dept}>
                    <td style={{ fontWeight: 500 }}>{r.dept}</td>
                    <td className="mono num">{r.done}</td>
                    <td className="mono num">{r.pending}</td>
                    <td className="mono num" style={{ color: r.blocked ? "var(--red)" : undefined }}>{r.blocked}</td>
                    <td style={{ minWidth: 160 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--amber)" : "var(--red)" }}></div>
                        </div>
                        <span className="mono" style={{ fontSize: 11, minWidth: 32 }}>{Math.round(pct)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 10 }}>Launch alert legend</div>
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div><span className="badge badge-red" style={{ marginRight: 8 }}>Red</span> days_left &le; 10, or missing required fields</div>
            <div><span className="badge badge-amber" style={{ marginRight: 8 }}>Amber</span> days_left &le; 21 AND missing_data not empty</div>
            <div><span className="badge badge-green" style={{ marginRight: 8 }}>Green</span> on track · no data gaps</div>
          </div>
          <div className="alert alert-blue" style={{ marginTop: 14, fontSize: 12 }}>
            <strong>V-NPD-LAUNCH-001</strong> · Row-level alert badge recalculates on load (polls every 30s).
            Sort defaults to <span className="mono">days_left ASC</span>.
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
            <input type="checkbox" checked={showBuilt} onChange={e => setShowBuilt(e.target.checked)} />
            Show Built FAs (hidden by default)
          </label>
        </div>
      </div>

      {/* Launch alerts table */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Launch alerts</div>
          <div className="muted" style={{ fontSize: 11 }}>Sort: days_left ASC · V05 check drives "Missing Data"</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>FA Code</th><th>Product</th><th>Launch date</th><th>Days left</th>
              <th>Alert</th><th>Missing data</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(f => {
              const alert = f.days_left === null ? "red" : f.days_left <= 10 ? "red" : (f.days_left <= 21 && f.missing_data !== "—") ? "amber" : "green";
              const borderCol = alert === "red" ? "var(--red)" : alert === "amber" ? "var(--amber)" : "transparent";
              const rowBg    = alert === "red" ? "#FEF2F2" : alert === "amber" ? "#FFFBEB" : undefined;
              return (
                <tr key={f.fa_code} style={{ background: rowBg, borderLeft: `4px solid ${borderCol}` }}>
                  <td><a className="mono" style={{ cursor: "pointer", color: "var(--blue)" }} onClick={() => onOpenFA(f.fa_code)}>{f.fa_code}</a></td>
                  <td style={{ fontWeight: 500 }}>{f.product_name}</td>
                  <td className="mono">{f.launch_date || <span className="muted">—</span>}</td>
                  <td>{daysCell(f.days_left)}</td>
                  <td>
                    {alert === "red"   && <span className="badge badge-red">● Red</span>}
                    {alert === "amber" && <span className="badge badge-amber">● Amber</span>}
                    {alert === "green" && <span className="badge badge-green">● Green</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{f.missing_data}</td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => onOpenFA(f.fa_code)}>Open FA →</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ===== SCR-02 / SCR-02b — FA List (table + kanban) ================================
const FAList = ({ onOpenFA, openModal, initialView = "table" }) => {
  const [view, setView]       = React.useState(initialView);
  const [search, setSearch]   = React.useState("");
  const [deptFilter, setDept] = React.useState("All");
  const [statusFilter, setSF] = React.useState("All");
  const fas = window.NPD_FAS;

  const filtered = fas.filter(f => {
    if (search && !(f.fa_code.toLowerCase().includes(search.toLowerCase()) || f.product_name.toLowerCase().includes(search.toLowerCase()))) return false;
    if (statusFilter !== "All" && f.status_overall !== statusFilter) return false;
    return true;
  });

  const kanbanCols = ["Pending", "InProgress", "Alert", "Complete", "Built"];

  return (
    <>
      <div className="breadcrumb"><a>NPD</a> / Factory Articles</div>
      <div className="page-head">
        <div>
          <div className="page-title">Factory Articles</div>
          <div className="muted" style={{ fontSize: 12 }}>All FAs · filter by status or department · {filtered.length} of {fas.length} visible</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="pills">
            <button className={`pill ${view === "table" ? "on" : ""}`} onClick={() => setView("table")}>≡ Table</button>
            <button className={`pill ${view === "kanban" ? "on" : ""}`} onClick={() => setView("kanban")}>▦ Kanban</button>
          </div>
          {window.npd_can('fa.create') && <button className="btn btn-primary" onClick={() => openModal("faCreate")}>+ Create FA</button>}
        </div>
      </div>

      <div className="card" style={{ padding: "10px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Search FA code or name…" style={{ flex: "1 1 240px", minWidth: 240 }} value={search} onChange={e => setSearch(e.target.value)} />
          <select value={deptFilter} onChange={e => setDept(e.target.value)} style={{ width: "auto" }}>
            <option>All depts</option><option>Core</option><option>Planning</option><option>Commercial</option>
            <option>Production</option><option>Technical</option><option>MRP</option><option>Procurement</option>
          </select>
          <select value={statusFilter} onChange={e => setSF(e.target.value)} style={{ width: "auto" }}>
            <option>All</option><option>Pending</option><option>InProgress</option><option>Alert</option><option>Complete</option><option>Built</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setDept("All"); setSF("All"); }}>Clear filters</button>
        </div>
      </div>

      {view === "table" && (
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>FA Code</th><th>Product Name</th><th>Pack</th><th>Status</th>
                <th>Launch</th><th>Days left</th>
                <th title="Core">Co</th><th title="Planning">Pl</th><th title="Commercial">Cm</th>
                <th title="Production">Pr</th><th title="Technical">Tc</th><th title="MRP">Mr</th><th title="Procurement">Pc</th>
                <th>Built</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.fa_code} style={{ cursor: "pointer" }} onClick={() => onOpenFA(f.fa_code)}>
                  <td className="mono"><a style={{ color: "var(--blue)" }}>{f.fa_code}</a></td>
                  <td style={{ fontWeight: 500 }}>{f.product_name}</td>
                  <td className="mono">{f.pack_size}</td>
                  <td>{alertBadge(f.status_overall)}</td>
                  <td className="mono">{f.launch_date || <span className="muted">—</span>}</td>
                  <td>{daysCell(f.days_left)}</td>
                  <td style={{ textAlign: "center" }}>{deptIcon(f.dept.core)}</td>
                  <td style={{ textAlign: "center" }}>{deptIcon(f.dept.planning)}</td>
                  <td style={{ textAlign: "center" }}>{deptIcon(f.dept.commercial)}</td>
                  <td style={{ textAlign: "center" }}>{deptIcon(f.dept.production)}</td>
                  <td style={{ textAlign: "center" }}>{deptIcon(f.dept.technical)}</td>
                  <td style={{ textAlign: "center" }}>{deptIcon(f.dept.mrp)}</td>
                  <td style={{ textAlign: "center" }}>{deptIcon(f.dept.procurement)}</td>
                  <td style={{ textAlign: "center" }}>{f.built ? <span style={{ color: "var(--blue)", fontWeight: 700 }}>⚡</span> : <span className="muted">—</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenFA(f.fa_code)}>Open</button>
                    {f.status_overall === "Complete" && <button className="btn btn-secondary btn-sm" onClick={() => openModal("d365Build", { fa: f })}>D365</button>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={15} style={{ textAlign: "center", padding: 30, color: "var(--muted)" }}>
                  No FAs match your filters. <a style={{ cursor: "pointer", color: "var(--blue)" }} onClick={() => { setSearch(""); setDept("All"); setSF("All"); }}>Clear filters</a>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "kanban" && (
        <div className="kanban">
          {kanbanCols.map(col => {
            const items = filtered.filter(f => f.status_overall === col);
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-head">
                  <span>{col}</span>
                  <span className="count">{items.length}</span>
                </div>
                {items.map(f => (
                  <div key={f.fa_code} className="kanban-card" onClick={() => onOpenFA(f.fa_code)}>
                    <div className="muted mono" style={{ fontSize: 10 }}>{f.fa_code}</div>
                    <div className="kanban-card-title">{f.product_name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{f.pack_size} · {f.owner}</div>
                    <div className="kanban-card-meta">
                      <span>{Object.values(f.dept).filter(v => v === "done").length}/7 depts</span>
                      <span>{f.launch_date ? daysCell(f.days_left) : "No date"}</span>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="muted" style={{ padding: 14, textAlign: "center", fontSize: 12 }}>—</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// ===== SCR-03 — FA Detail ========================================================
const FADetail = ({ faCode, onBack, openModal }) => {
  const fa = window.NPD_FAS.find(f => f.fa_code === faCode) || window.NPD_FAS[0];
  const [tab, setTab] = React.useState("core");
  const coreDone = fa.closed_core === "Yes";
  const prodDone = fa.closed_production === "Yes";

  const TABS = [
    { key: "core",        label: "Core",        locked: false },
    { key: "planning",    label: "Planning",    locked: !coreDone },
    { key: "commercial",  label: "Commercial",  locked: !coreDone },
    { key: "production",  label: "Production",  locked: false /* uses per-field block */ },
    { key: "technical",   label: "Technical",   locked: !coreDone },
    { key: "mrp",         label: "MRP",         locked: !coreDone || !prodDone },
    { key: "procurement", label: "Procurement", locked: !coreDone },
    { key: "bom",         label: "BOM",         locked: false },
    { key: "formulations",label: "Formulations",locked: false },
    { key: "risks",       label: "Risks",       locked: false },
    { key: "docs",        label: "Docs",        locked: false },
    { key: "history",     label: "History",     locked: false }
  ];

  return (
    <>
      <div className="breadcrumb"><a onClick={onBack}>NPD</a> / <a onClick={onBack}>Factory Articles</a> / {fa.fa_code}</div>
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--blue)" }}>{fa.fa_code}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{fa.product_name}</div>
            {alertBadge(fa.status_overall)}
            {fa.built && <span className="badge badge-blue">⚡ Built</span>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Launch {fa.launch_date || "—"} · {daysCell(fa.days_left)} · Owner {fa.owner} · Brief {fa.brief_id}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {window.npd_can('fa.delete') && <button className="btn btn-danger" onClick={() => openModal("faDelete", { fa })}>Delete FA</button>}
          <button className="btn btn-primary"
                  disabled={fa.status_overall !== "Complete"}
                  onClick={() => openModal("d365Build", { fa })}
                  title={fa.status_overall !== "Complete" ? "FA must be Complete first (all 7 depts closed)" : "Build D365 output"}>
            Build D365 →
          </button>
        </div>
      </div>

      {/* Gate progress strip — 7 dept circles */}
      <div className="card" style={{ padding: "10px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {["core","planning","commercial","production","technical","mrp","procurement"].map((k, i) => {
            const s = fa.dept[k];
            const bg = s === "done" ? "var(--green)" : s === "inprog" ? "var(--amber)" : s === "blocked" ? "var(--red)" : "var(--gray-100)";
            const col = s === "pending" ? "var(--muted)" : "#fff";
            return (
              <React.Fragment key={k}>
                <div title={`${k}: ${s}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: bg, color: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                    {s === "done" ? "✓" : s === "inprog" ? "◐" : s === "blocked" ? "⊘" : i+1}
                  </div>
                  <span style={{ fontSize: 11, textTransform: "capitalize" }}>{k}</span>
                </div>
                {i < 6 && <div style={{ flex: 1, height: 2, background: "var(--border)" }}></div>}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Tab bar */}
      <div className="subnav-inline">
        {TABS.map(t => (
          <a key={t.key}
             className={tab === t.key ? "on" : ""}
             onClick={() => !t.locked && setTab(t.key)}
             style={{ cursor: t.locked ? "not-allowed" : "pointer", opacity: t.locked ? 0.5 : 1 }}
             title={t.locked ? "Locked — requires Core closed" : undefined}>
            {t.label}{t.locked && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 9 }}>Locked</span>}
          </a>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12 }}>
        <div>
          {tab === "core"        && <FACoreTab fa={fa} openModal={openModal} />}
          {tab === "planning"    && <FAPlanningTab fa={fa} openModal={openModal} />}
          {tab === "commercial"  && <FACommercialTab fa={fa} openModal={openModal} />}
          {tab === "production"  && <FAProductionTab fa={fa} openModal={openModal} />}
          {tab === "technical"   && <FATechnicalTab fa={fa} openModal={openModal} />}
          {tab === "mrp"         && <FAMRPTab fa={fa} openModal={openModal} />}
          {tab === "procurement" && <FAProcurementTab fa={fa} openModal={openModal} />}
          {tab === "bom"         && <FABOMTab fa={fa} openModal={openModal} />}
          {tab === "formulations"&& <FAFormulationsTab fa={fa} openModal={openModal} />}
          {tab === "risks"       && <RiskRegisterScreen fa={fa} openModal={openModal} />}
          {tab === "docs"        && <ComplianceDocsScreen fa={fa} openModal={openModal} />}
          {tab === "history"     && <FAHistoryTab fa={fa} />}
        </div>
        <FARightPanel fa={fa} />
      </div>
    </>
  );
};

// ===== SCR-03 right panel — Validation Status + Built status =====================
const FARightPanel = ({ fa }) => {
  const results = {
    V01: fa.fa_code.match(/^FA[A-Z0-9]+$/) ? "pass" : "fail",
    V02: fa.product_name ? "pass" : "fail",
    V03: fa.pack_size ? "pass" : "fail",
    V04: fa.rm_code ? "warn" : "fail",
    V05: fa.status_overall === "Complete" || fa.status_overall === "Built" ? "pass" : "info",
    V06: "pass",
    V07: fa.closed_technical === "Yes" ? "pass" : "warn",
    V08: fa.brief_id ? "pass" : "info"
  };
  const icon = (s) => s === "pass" ? <span style={{ color: "var(--green)" }}>✓</span>
                    : s === "fail" ? <span style={{ color: "var(--red)" }}>✗</span>
                    : s === "warn" ? <span style={{ color: "var(--amber-700, #b45309)" }}>⚠</span>
                    : <span style={{ color: "var(--blue)" }}>ⓘ</span>;
  return (
    <div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Validation status</div>
        <table style={{ fontSize: 11 }}>
          <tbody>
            {window.NPD_VALIDATION_RULES.map(r => (
              <tr key={r.id}>
                <td className="mono" style={{ width: 38, verticalAlign: "top" }}>{r.id}</td>
                <td>{r.title}</td>
                <td style={{ width: 20, textAlign: "right" }}>{icon(results[r.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 8 }}>Built status</div>
        {fa.built ? (
          <>
            <div><span className="badge badge-blue">⚡ Built</span></div>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Last build: 2026-04-15 16:21</div>
            <a style={{ fontSize: 12, color: "var(--blue)", cursor: "pointer" }}>Download last build →</a>
          </>
        ) : (
          <div><span className="badge badge-gray">Not built</span>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Any edit resets the Built flag.</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ----- SCR-03a Core tab -----
const FACoreTab = ({ fa, openModal }) => {
  const [closed, setClosed] = React.useState(fa.closed_core);
  const allCoreFilled = fa.product_name && fa.pack_size && fa.finish_meat;

  return (
    <>
      {fa.status_overall === "Pending" && (
        <div className="alert alert-blue">Fill Core section first — other departments unlock after Core is closed.</div>
      )}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Core section</div>
          {closed === "Yes" ? <span className="badge badge-green">✓ Closed</span> : <span className="badge badge-gray">Open</span>}
        </div>
        <div className="form-grid">
          <div className="field"><label>FA Code</label>
            <input className="mono" value={fa.fa_code} readOnly style={{ background: "var(--gray-100)" }} />
            <div className="ff-help">V01 · Read-only after create.</div>
          </div>
          <div className="field"><label>Product Name *</label><input defaultValue={fa.product_name} /></div>
          <div className="field"><label>Pack Size *</label>
            <select defaultValue={fa.pack_size}>{window.NPD_REF.pack_sizes.map(p => <option key={p}>{p}</option>)}</select>
            <div className="ff-help">Cascade: clears Line + Dieset on change.</div>
          </div>
          <div className="field"><label>Number of cases</label><input type="number" defaultValue={fa.number_of_cases} /></div>
          <div className="field"><label>Finish Meat *</label>
            <input defaultValue={fa.finish_meat} placeholder="e.g. PR1939H, PR2045A" />
            <div className="ff-help">Comma-separated PR codes. Cascade: auto-builds RM Code + syncs ProdDetail rows.</div>
          </div>
          <div className="field"><label>RM Code (auto)</label>
            <input className="mono" value={fa.rm_code} readOnly style={{ background: "#E0FFE0" }} />
            <div className="ff-help">Auto-derived from Finish Meat.</div>
          </div>
          <div className="field"><label>Template</label>
            <select defaultValue={fa.template}>{window.NPD_REF.templates.map(t => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="field"><label>Volume</label><input type="number" defaultValue={fa.volume || ""} /></div>
          <div className="field"><label>Dev Code</label><input className="mono" defaultValue={fa.dev_code} /></div>
          <div className="field"><label>Weights (g)</label><input type="number" defaultValue={fa.weights || ""} /></div>
          <div className="field"><label>Packs per case</label><input type="number" defaultValue={fa.packs_per_case || ""} /></div>
          <div className="field"><label>Benchmark</label><input defaultValue={fa.benchmark || ""} /></div>
          <div className="field"><label>Price (Brief)</label><input defaultValue={fa.price_brief || ""} /></div>
        </div>
        <div className="field"><label>Comments</label>
          <textarea rows="2" defaultValue={fa.comments || ""}></textarea>
        </div>

        {!allCoreFilled && (
          <div className="alert alert-amber">
            <strong>V05 Core:</strong> Required fields missing — Product Name, Pack Size, Finish Meat must all be filled before Close Core.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm">Save Core</button>
          <button className="btn btn-primary btn-sm" disabled={!allCoreFilled} onClick={() => openModal("deptClose", { fa, dept: "Core" })}>
            Close Core section
          </button>
        </div>
      </div>
    </>
  );
};

// ----- SCR-03b Planning tab -----
const FAPlanningTab = ({ fa, openModal }) => (
  <div className="card">
    <div className="card-head">
      <div className="card-title">Planning section</div>
      {fa.closed_planning === "Yes" ? <span className="badge badge-green">✓ Closed</span> : <span className="badge badge-gray">Open</span>}
    </div>
    <div className="form-grid">
      <div className="field"><label>Meat % *</label><input type="number" defaultValue={fa.meat_pct || ""} /></div>
      <div className="field"><label>Runs per week *</label><input type="number" defaultValue={4} /></div>
      <div className="field"><label>Date codes per week *</label><input defaultValue="Mon,Wed,Fri" /></div>
    </div>
    <div className="alert alert-blue">
      When FA is launched it transitions to <strong>Technical BOM v1</strong> adopted by the Planning module (see Planning / Products).
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
      <button className="btn btn-secondary btn-sm">Save Planning</button>
      <button className="btn btn-primary btn-sm" onClick={() => openModal("deptClose", { fa, dept: "Planning" })}>Close Planning section</button>
    </div>
  </div>
);

// ----- SCR-03c Commercial tab -----
const FACommercialTab = ({ fa, openModal }) => {
  const earliest = "2026-09-25";
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Commercial section</div>
        {fa.closed_commercial === "Yes" ? <span className="badge badge-green">✓ Closed</span> : <span className="badge badge-gray">Open</span>}
      </div>
      {fa.brief_id && (
        <div className="alert alert-blue">V08 · Launch Date must be ≥ 24 weeks from Brief handoff. Earliest: {earliest}.</div>
      )}
      <div className="form-grid">
        <div className="field"><label>Launch Date *</label><input type="date" defaultValue={fa.launch_date || ""} /></div>
        <div className="field"><label>Department number *</label><input defaultValue="PL-D-4120" /></div>
        <div className="field"><label>Article number *</label><input defaultValue="ART-10821" /></div>
        <div className="field"><label>Bar codes (GS1) *</label><input className="mono" defaultValue="5901234561234" /></div>
        <div className="field"><label>Cases / week W1 *</label><input type="number" defaultValue={120} /></div>
        <div className="field"><label>Cases / week W2 *</label><input type="number" defaultValue={180} /></div>
        <div className="field"><label>Cases / week W3 *</label><input type="number" defaultValue={220} /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button className="btn btn-secondary btn-sm">Save Commercial</button>
        <button className="btn btn-primary btn-sm" onClick={() => openModal("deptClose", { fa, dept: "Commercial" })}>Close Commercial section</button>
      </div>
    </div>
  );
};

// ----- SCR-03d Production tab -----
const FAProductionTab = ({ fa, openModal }) => {
  const rows = window.NPD_PROD_DETAIL[fa.fa_code] || [
    { pr_code: fa.finish_meat || "—", component: "(single component)", weight_g: fa.weights,
      process_1: "Slice", yield_p1: 95, process_2: "MAP", yield_p2: 99, process_3: "", yield_p3: null, process_4: "", yield_p4: null,
      line: "L2", dieset: "DS-L2", yield_line: 92, staffing: "3 op", rate: 1100,
      pr_code_p1: (fa.finish_meat||"PR")+"-SL", pr_code_p2: (fa.finish_meat||"PR")+"-MP",
      pr_code_p3: "", pr_code_p4: "", pr_code_final: (fa.finish_meat||"PR")+"-MP", v06: "pass" }
  ];
  const locked = !fa.pack_size;

  return (
    <>
      {locked && <div className="alert alert-amber"><strong>Blocked:</strong> Pack_Size must be filled in Core before Process/Yield fields become editable.</div>}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Production detail — {rows.length} component{rows.length > 1 ? "s" : ""}</div>
            <div className="muted" style={{ fontSize: 11 }}>Edits reset Built flag automatically.</div>
          </div>
          <button className="btn btn-ghost btn-sm">+ Add component</button>
        </div>

        {rows.map((r, idx) => (
          <div key={idx} style={{ borderTop: idx ? "1px solid var(--border)" : "none", padding: "12px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span className="mono" style={{ fontWeight: 600, color: "var(--blue)" }}>{r.pr_code}</span>
              <span className="muted">{r.component}</span>
              <span className="muted mono">{r.weight_g}g</span>
              <span style={{ marginLeft: "auto" }}>{r.v06 === "pass" ? <span className="badge badge-green">V06 ✓</span> : <span className="badge badge-amber">V06 ⚠</span>}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, fontSize: 12 }}>
              {[1, 2, 3, 4].map(i => (
                <React.Fragment key={i}>
                  <div className="field"><label>Process {i}</label>
                    <select defaultValue={r["process_" + i]} disabled={locked}>
                      <option value="">—</option>
                      {window.NPD_REF.processes.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Yield P{i} %</label>
                    <input type="number" defaultValue={r["yield_p" + i] || ""} disabled={locked} />
                  </div>
                  <div className="field"><label>PR code P{i} (auto)</label>
                    <input className="mono" value={r["pr_code_p" + i] || ""} readOnly style={{ background: "#E0FFE0" }} />
                  </div>
                  <div></div>
                </React.Fragment>
              ))}
              <div className="field"><label>Line *</label>
                <select defaultValue={r.line} disabled={locked}>
                  {window.NPD_REF.lines.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div className="field"><label>Dieset (auto)</label>
                <input className="mono" value={r.dieset} readOnly style={{ background: "#E0FFE0" }} />
              </div>
              <div className="field"><label>Yield Line % *</label><input type="number" defaultValue={r.yield_line} disabled={locked} /></div>
              <div className="field"><label>Staffing</label><input defaultValue={r.staffing} disabled={locked} /></div>
              <div className="field"><label>Rate *</label><input type="number" defaultValue={r.rate} disabled={locked} /></div>
              <div className="field"><label>PR Code Final (auto)</label>
                <input className="mono" value={r.pr_code_final} readOnly style={{ background: "#E0FFE0" }} />
              </div>
            </div>
          </div>
        ))}

        {rows.length > 1 && (
          <div style={{ background: "#E0FFE0", padding: 10, borderRadius: 6, fontSize: 12, marginTop: 8 }}>
            <strong>Aggregate (read-only):</strong> Line: {[...new Set(rows.map(r => r.line))].join(", ")} ·
            Dieset: {[...new Set(rows.map(r => r.dieset))].join(", ")} ·
            PR Codes Final: {rows.map(r => r.pr_code_final).join(", ")}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm">Save Production</button>
          <button className="btn btn-primary btn-sm" onClick={() => openModal("deptClose", { fa, dept: "Production" })}>Close Production section</button>
        </div>
      </div>
    </>
  );
};

// ----- SCR-03e Technical tab (with Allergen widget) -----
const FATechnicalTab = ({ fa, openModal }) => {
  const cascade = window.NPD_ALLERGEN_CASCADE[fa.fa_code] || window.NPD_ALLERGEN_CASCADE.FA5601;
  const allAllergens = ["Cereals/gluten", "Crustaceans", "Eggs", "Fish", "Peanuts", "Soybeans", "Milk", "Nuts", "Celery", "Mustard", "Sesame", "Sulphites", "Lupin", "Molluscs"];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Technical section</div>
          {fa.closed_technical === "Yes" ? <span className="badge badge-green">✓ Closed</span> : <span className="badge badge-gray">Open</span>}
        </div>
        <div className="form-grid">
          <div className="field"><label>Shelf life *</label><input defaultValue={fa.shelf_life || "28 days chilled"} /></div>
          <div className="field"><label>Storage temperature</label><input defaultValue="0–4 °C" /></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Allergen declaration</div>
            <div className="muted" style={{ fontSize: 11 }}>Regulation: EU FIC 1169/2011 · 14 mandatory allergens</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("allergenRefresh", { fa })}>↻ Refresh allergens</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Contains</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cascade.final.contains.map(a => (
              <span key={a.allergen} className="badge" style={{ background: "#fee2e2", color: "#991b1b", border: a.manual ? "1px solid var(--amber)" : "none" }}
                    title={`From ${a.from}${a.manual ? " (manual override)" : ""}`}>
                🔒 {a.allergen} {a.manual && "· Manual"}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>May contain</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cascade.final.may_contain.map(a => (
              <span key={a.allergen} className="badge badge-amber" title={`ⓘ From ${a.from}`}>ⓘ {a.allergen}</span>
            ))}
          </div>
        </div>

        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          All 14 EU allergens (override controls)
        </div>
        <table style={{ fontSize: 12 }}>
          <thead><tr><th>Allergen</th><th>Auto-cascade status</th><th>Source</th><th>Override</th></tr></thead>
          <tbody>
            {allAllergens.map(al => {
              const inContains = cascade.final.contains.find(a => a.allergen.toLowerCase() === al.toLowerCase().replace(/.*\//, "").replace("ybeans", "y"));
              const inMay      = cascade.final.may_contain.find(a => a.allergen.toLowerCase() === al.toLowerCase());
              const state = inContains ? "contains" : inMay ? "may" : "absent";
              return (
                <tr key={al}>
                  <td>{al}</td>
                  <td>
                    {state === "contains" && <span className="badge badge-red">Contains</span>}
                    {state === "may"      && <span className="badge badge-amber">May contain</span>}
                    {state === "absent"   && <span className="badge badge-gray">Absent</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 11 }}>
                    {inContains?.from || inMay?.from || "—"}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openModal("allergenOverride", { fa, allergen: al, current: state })}>Override</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="alert alert-blue">
          V07 · All 14 allergens assessed. Manual overrides require a reason &amp; are audit-logged.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={() => openModal("deptClose", { fa, dept: "Technical" })}>Close Technical section</button>
        </div>
      </div>
    </>
  );
};

// ----- SCR-03f MRP tab -----
const FAMRPTab = ({ fa, openModal }) => {
  const cell = (val, status) => {
    const colors = { found: "#DCFCE7", nocost: "#FEF3C7", missing: "#FEE2E2" };
    const labels = { found: "Found", nocost: "No cost", missing: "Missing" };
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input defaultValue={val || ""} style={{ flex: 1, background: status === "missing" ? "#FEF2F2" : undefined }} />
        <span className="badge" style={{ background: colors[status], color: "#1e293b", fontSize: 9 }} title={status === "nocost" ? "Price missing in D365" : status === "missing" ? "Material not in D365 — request creation" : ""}>
          {labels[status]}
        </span>
      </div>
    );
  };
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">MRP section</div>
        <button className="btn btn-ghost btn-sm">↻ Refresh D365 cache</button>
      </div>
      <div className="alert alert-blue">V04 · Each material validated against D365 master data. Green = Found + costed · Amber = No cost · Red = Missing.</div>
      <div className="form-grid">
        <div className="field"><label>Box *</label>{cell("BX-PL-240x180x80", "found")}</div>
        <div className="field"><label>Top Label *</label>{cell("LBL-PL-TOP-60x40", "found")}</div>
        <div className="field"><label>Bottom Label</label>{cell("LBL-PL-BOT-60x40", "nocost")}</div>
        <div className="field"><label>Web</label>{cell("WEB-PET-300", "found")}</div>
        <div className="field"><label>MRP Box *</label>{cell("MRP-BX-001", "found")}</div>
        <div className="field"><label>MRP Labels *</label>{cell("MRP-LBL-001", "found")}</div>
        <div className="field"><label>MRP Films *</label>{cell("MRP-FLM-005", "missing")}</div>
        <div className="field"><label>MRP Sleeves</label>{cell("", "missing")}</div>
        <div className="field"><label>MRP Cartons</label>{cell("MRP-CRT-012", "nocost")}</div>
        <div className="field"><label>Tara weight *</label><input type="number" defaultValue={0.42} /></div>
        <div className="field"><label>Pallet stacking plan *</label><input defaultValue="6x9x1 · Euro pallet" /></div>
        <div className="field"><label>Box dimensions *</label><input defaultValue="400x300x200mm" /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button className="btn btn-secondary btn-sm">Save MRP</button>
        <button className="btn btn-primary btn-sm" onClick={() => openModal("deptClose", { fa, dept: "MRP" })}>Close MRP section</button>
      </div>
    </div>
  );
};

// ----- SCR-03g Procurement tab -----
const FAProcurementTab = ({ fa, openModal }) => {
  const priceBlocked = fa.closed_core !== "Yes" || fa.closed_production !== "Yes";
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Procurement section</div>
        {fa.closed_procurement === "Yes" ? <span className="badge badge-green">✓ Closed</span> : <span className="badge badge-gray">Open</span>}
      </div>
      {priceBlocked && (
        <div className="alert alert-amber">
          <strong>V-NPD-PROC-001:</strong> Price entry unlocks after Core AND Production are both closed. Business rule: price depends on final components.
        </div>
      )}
      <div className="form-grid">
        <div className="field"><label>Price (€/kg) *</label>
          <input type="number" step="0.01" defaultValue={18.40} disabled={priceBlocked} style={{ background: priceBlocked ? "#D0D0D0" : undefined }} />
        </div>
        <div className="field"><label>Lead time (days) *</label><input type="number" defaultValue={14} /></div>
        <div className="field"><label>Supplier *</label>
          <select defaultValue={window.NPD_REF.suppliers[0]}>
            {window.NPD_REF.suppliers.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>Proc. shelf life (days) *</label><input type="number" defaultValue={60} /></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button className="btn btn-secondary btn-sm">Save Procurement</button>
        <button className="btn btn-primary btn-sm" onClick={() => openModal("deptClose", { fa, dept: "Procurement" })}>Close Procurement section</button>
      </div>
    </div>
  );
};

// ----- SCR-03h BOM tab -----
const FABOMTab = ({ fa, openModal }) => {
  const rows = [
    { type: "RM", code: fa.rm_code || "RM1939", name: "Main component", qty: 1.0, stage: "Input",     source: "Core",       d365: "found" },
    { type: "RM", code: "RM3501",               name: "Soy Protein",      qty: 0.012, stage: "Process 1", source: "ProdDetail", d365: "found" },
    { type: "RM", code: "RM3022",               name: "Salt",             qty: 0.018, stage: "Process 1", source: "ProdDetail", d365: "found" },
    { type: "PM", code: "BX-PL-240x180x80",     name: "Box",              qty: 1,     stage: "Pack",      source: "MRP",        d365: "found" },
    { type: "PM", code: "LBL-PL-TOP-60x40",     name: "Top Label",        qty: 1,     stage: "Pack",      source: "MRP",        d365: "found" },
    { type: "PM", code: "MRP-FLM-005",          name: "Film",             qty: 0.06,  stage: "Pack",      source: "MRP",        d365: "missing" }
  ];
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">BOM (computed view)</div>
          <div className="muted" style={{ fontSize: 11 }}>Read-only union of FA + ProdDetail + MRP material lists. Rebuild sends updated BOM to D365.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-ghost btn-sm">Export BOM CSV</button>
          <button className="btn btn-primary btn-sm"
                  disabled={fa.status_overall !== "Complete"}
                  onClick={() => openModal("d365Build", { fa })}>Build D365 →</button>
        </div>
      </div>
      <table>
        <thead><tr><th>Type</th><th>Code</th><th>Name</th><th>Qty</th><th>Stage</th><th>Source</th><th>D365 status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><span className={`badge ${r.type === "RM" ? "badge-blue" : "badge-violet"}`} style={{ fontSize: 9 }}>{r.type}</span></td>
              <td className="mono">{r.code}</td>
              <td>{r.name}</td>
              <td className="mono num">{r.qty}</td>
              <td className="muted">{r.stage}</td>
              <td className="muted">{r.source}</td>
              <td>
                {r.d365 === "found"   && <span className="badge badge-green">✓ Found</span>}
                {r.d365 === "nocost"  && <span className="badge badge-amber">⚠ No cost</span>}
                {r.d365 === "missing" && <span className="badge badge-red">✗ Missing</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ----- SCR-06 Formulations tab (reuses SCR-08 Version Timeline rendering) -----
const FAFormulationsTab = ({ fa, openModal }) => {
  const versions = window.NPD_FORMULATION_VERSIONS[fa.fa_code] || window.NPD_FORMULATION_VERSIONS.FA5601;
  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Formulation versions</div>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("versionSave", { fa })}>+ New draft</button>
        </div>
        <table>
          <thead><tr><th>Version</th><th>Status</th><th>Effective from</th><th>Effective to</th><th>Items</th><th>Allergens</th><th>Actions</th></tr></thead>
          <tbody>
            {versions.map(v => (
              <tr key={v.version}>
                <td className="mono" style={{ fontWeight: 600 }}>{v.version}</td>
                <td>{v.status === "locked" ? <span className="badge badge-green">🔒 Locked</span> : <span className="badge badge-amber">Draft</span>}</td>
                <td className="mono">{v.effective_from}</td>
                <td className="mono">{v.effective_to || <span className="muted">— (current)</span>}</td>
                <td className="mono num">{v.items}</td>
                <td>{v.allergens}</td>
                <td style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-ghost btn-sm">View</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal("versionCompare", { fa, base: v })}>Compare</button>
                  {v.status === "draft" && <button className="btn btn-secondary btn-sm" onClick={() => openModal("formulationLock", { fa, version: v.version })}>Lock</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SCR-08 Version timeline */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 10 }}>Version timeline</div>
        <div style={{ position: "relative", paddingLeft: 20 }}>
          {versions.map((v, i) => (
            <div key={v.version} style={{ position: "relative", paddingBottom: 14, borderLeft: v.status === "locked" ? "3px solid var(--blue)" : "3px dashed var(--border)", paddingLeft: 14 }}>
              <div style={{ position: "absolute", left: -8, top: 2, width: 14, height: 14, borderRadius: "50%", background: v.status === "locked" ? "var(--blue)" : "var(--amber)" }}></div>
              <div style={{ fontWeight: 600 }}>{v.version} · {v.status === "locked" ? "Locked" : "Draft"}</div>
              <div className="muted" style={{ fontSize: 11 }}>{v.effective_from} → {v.effective_to || "current"} · {v.created_by}</div>
              <div className="muted" style={{ fontSize: 11 }}>{v.items} items · allergens: {v.allergens}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// ----- SCR-03i History tab -----
const FAHistoryTab = ({ fa }) => {
  const events = window.NPD_HISTORY[fa.fa_code] || window.NPD_HISTORY.FA5601;
  const [filter, setFilter] = React.useState("All");
  const types = ["All", "field_edit", "dept_closed", "built", "built_reset", "allergen_changed", "create"];
  const rows = filter === "All" ? events : events.filter(e => e.type === filter);

  const icon = (t) => ({ create: "＋", field_edit: "✎", dept_closed: "🔒", built: "⚡", built_reset: "↺", allergen_changed: "⚠" })[t] || "·";

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">History</div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: "auto" }}>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        {rows.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none", alignItems: "flex-start" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--gray-100)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>{icon(e.type)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{e.desc}</div>
              <div className="muted" style={{ fontSize: 11 }}>{e.when} · {e.who} · <span className="mono">{e.type}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

Object.assign(window, {
  NpdDashboard, FAList, FADetail,
  FACoreTab, FAPlanningTab, FACommercialTab, FAProductionTab, FATechnicalTab,
  FAMRPTab, FAProcurementTab, FABOMTab, FAFormulationsTab, FAHistoryTab, FARightPanel,
  alertBadge, daysCell, deptIcon
});
