// ============ Planning+ (07-PLANNING-EXT) module shell — sidebar, topbar, sub-nav, chips ============

const PSidebar = () => (
  <div id="sidebar">
    <div className="sidebar-logo">Monopilot <span>MES</span></div>
    <div className="sidebar-group">Core</div>
    <div className="sidebar-item"><span className="ic">◆</span>Dashboard</div>
    <div className="sidebar-item"><span className="ic">⚙</span>Settings</div>
    <div className="sidebar-group">Operations</div>
    <div className="sidebar-item"><span className="ic">▤</span>Planning</div>
    <div className="sidebar-item active premium">
      <span className="ic">≡</span>Planning+
      <span className="premium-badge">PRO</span>
    </div>
    <div className="sidebar-item"><span className="ic">⚒</span>Production</div>
    <div className="sidebar-item"><span className="ic">▥</span>Warehouse</div>
    <div className="sidebar-group">QA &amp; Shipping</div>
    <div className="sidebar-item"><span className="ic">✓</span>Quality</div>
    <div className="sidebar-item"><span className="ic">→</span>Shipping</div>
    <div className="sidebar-group">Premium</div>
    <div className="sidebar-item"><span className="ic">▦</span>Technical</div>
    <div className="sidebar-item"><span className="ic">★</span>NPD</div>
    <div className="sidebar-item"><span className="ic">$</span>Finance</div>
    <div className="sidebar-item"><span className="ic">◉</span>OEE</div>
  </div>
);

const PTopbar = ({ role, onRole }) => (
  <div className="topbar">
    <div className="search"><input placeholder="Search runs, assignments, scenarios, matrix cells…" /></div>
    <div className="role-switch">
      {["Planner","SchedOfc","Prod Mgr","Admin"].map(r => (
        <button key={r} className={role === r ? "on" : ""} onClick={() => onRole(r)}>{r}</button>
      ))}
    </div>
    <div className="spacer"></div>
    <div className="refresh-bar">
      <span className="refresh-dot"></span>
      <span>Auto-refresh · <span className="mono">60s</span></span>
    </div>
    <div className="divider-v"></div>
    <button className="btn btn-secondary btn-sm">↻ Refresh now</button>
    <div className="avatar" title="M. Nowak — Planner Advanced · Factory-A">MN</div>
  </div>
);

const PextNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {PEXT_NAV.map(g => (
      <React.Fragment key={g.group}>
        <div className="prod-nav-group">{g.group}</div>
        {g.items.map(it => (
          <div key={it.key}
               className={`prod-nav-item ${current === it.key ? "on" : ""}`}
               onClick={() => onNav(it.key)}>
            <span className="ic">{it.ic}</span>
            <span>{it.label}</span>
            {it.count && <span className="nav-count">{it.count}</span>}
            {it.hero && <span className="badge badge-blue" style={{marginLeft:"auto", fontSize:9}}>Live</span>}
          </div>
        ))}
      </React.Fragment>
    ))}
    <div className="prod-nav-footer">
      Planning+ · v1.0.0 <span className="premium-badge" style={{marginLeft:4}}>PRO</span><br/>
      <strong style={{color:"var(--text)"}}>Factory-A</strong> · 5 lines · 23 WOs queued<br/>
      <span style={{color:"var(--green)"}}>●</span> Solver: healthy · last run <span className="mono">OPT-0042 · 42s</span><br/>
      <span style={{color:"var(--blue)"}}>●</span> Matrix <span className="mono">v5</span> · v2 optimizer <b style={{color:"#6d28d9"}}>ON</b>
    </div>
  </div>
);

// ============ Reused from Planning: WO status, Priority, Allergen cluster ============
const WOPlanStatus = ({ s }) => {
  const map = {
    draft:       ["badge-gray",  "Draft"],
    planned:     ["badge-blue",  "Planned"],
    released:    ["badge-violet","Released"],
    in_progress: ["badge-green", "In progress"],
    on_hold:     ["badge-amber", "On hold"],
    completed:   ["badge-green", "Completed"],
    cancelled:   ["badge-red",   "Cancelled"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

const Priority = ({ p }) => {
  const map = {
    low:      ["badge-gray",  "Low"],
    normal:   ["badge-blue",  "Normal"],
    high:     ["badge-amber", "High"],
    critical: ["badge-red",   "Critical"],
  };
  const [cls, label] = map[p] || ["badge-gray", p];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

// Assignment status badges per §1.11
const AssnStatus = ({ s }) => {
  const map = {
    draft:      ["badge-blue",  "Draft"],
    approved:   ["badge-green", "Approved"],
    rejected:   ["badge-gray",  "Rejected"],
    overridden: ["badge-amber", "Overridden"],
    cancelled:  ["badge-gray",  "WO Cancelled"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

// Run status per §1.11
const RunStatus = ({ s }) => {
  const map = {
    queued:    { cls: "queued",    label: "Queued" },
    running:   { cls: "running",   label: "Running" },
    converged: { cls: "converged", label: "Converged" },
    completed: { cls: "completed", label: "Completed" },
    partial:   { cls: "partial",   label: "Partial (timeout)" },
    failed:    { cls: "failed",    label: "Failed" },
    preview:   { cls: "preview",   label: "Preview (dry-run)" },
    discarded: { cls: "discarded", label: "Discarded" },
    infeasible:{ cls: "infeasible",label: "Infeasible" },
  };
  const m = map[s] || { cls: "queued", label: s };
  const live = s === "running" || s === "queued";
  return (
    <span className={"solver-chip " + m.cls}>
      {live && <span className="pulse"></span>}
      {m.label}
    </span>
  );
};

// Allergen pill renderer — list of allergen codes with colour swatches
const AllergenPills = ({ codes }) => {
  if (!codes || !codes.length) return <span className="muted">—</span>;
  return (
    <span className="allergen-cluster" style={{gap:4}}>
      {codes.map(c => (
        <span key={c} className="mono" style={{fontSize:10, padding:"1px 6px", background:"var(--gray-100)", borderRadius:8, color:"var(--text)", display:"inline-flex", alignItems:"center", gap:4}}>
          <span className="sw" style={{width:8, height:8, borderRadius:"50%", background: PEXT_ALLERGEN_COLORS[c] || "#94a3b8"}}></span>
          {c}
        </span>
      ))}
    </span>
  );
};

// Source/forecast badge
const FcstSource = ({ s }) => {
  const map = {
    manual:     ["badge-blue",  "Manual"],
    prophet:    ["badge-green", "ML Prophet"],
    overridden: ["badge-amber", "Overridden"],
    stale:      ["badge-amber", "Stale"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:9}}>{label}</span>;
};

// Scenario archetype badge (aggressive/balanced/conservative)
const ScenarioType = ({ t }) => {
  const map = {
    aggressive:   ["badge-red",   "Aggressive"],
    balanced:     ["badge-blue",  "Balanced"],
    conservative: ["badge-gray",  "Conservative"],
  };
  const [cls, label] = map[t] || ["badge-gray", t];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

// CO-risk pill (low/medium/high/blocked)
const CORisk = ({ r }) => {
  const map = {
    none:    ["badge-gray",  "None"],
    low:     ["badge-green", "Low"],
    medium:  ["badge-amber", "Medium"],
    high:    ["badge-red",   "High"],
    blocked: ["badge-violet","BLOCKED"],
  };
  const [cls, label] = map[r] || ["badge-gray", r];
  const style = r === "blocked" ? { background: "#ede9fe", color: "#6d28d9" } : {};
  return <span className={"badge " + cls} style={{fontSize:10, ...style}}>{label}</span>;
};

Object.assign(window, {
  PSidebar, PTopbar, PextNav,
  WOPlanStatus, Priority, AssnStatus, RunStatus,
  AllergenPills, FcstSource, ScenarioType, CORisk,
});
