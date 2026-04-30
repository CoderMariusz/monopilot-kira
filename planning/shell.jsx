// ============ Planning module shell ============

const PSidebar = () => (
  <div id="sidebar">
    <div className="sidebar-logo">Monopilot <span>MES</span></div>
    <div className="sidebar-group">Core</div>
    <div className="sidebar-item"><span className="ic">◆</span>Dashboard</div>
    <div className="sidebar-item"><span className="ic">⚙</span>Settings</div>
    <div className="sidebar-group">Operations</div>
    <div className="sidebar-item active"><span className="ic">▤</span>Planning</div>
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
    <div className="search"><input placeholder="Search POs, TOs, WOs, items, suppliers…" /></div>
    <div className="role-switch">
      {["Purchaser","Planner","Prod Mgr","Admin"].map(r => (
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
    <div className="avatar" title="M. Krawczyk — Planner · Factory-A">MK</div>
  </div>
);

const PlanNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {PLAN_NAV.map(g => (
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
      Planning · v3.1.0<br/>
      <strong style={{color:"var(--text)"}}>Factory-A</strong> · 42 POs · 28 WOs<br/>
      <span style={{color:"var(--green)"}}>●</span> D365 SO trigger: enabled
    </div>
  </div>
);

// ============ Status badges (planning state machines) ============

// WO state machine
const WOPlanStatus = ({ s }) => {
  const map = {
    draft:       ["badge-gray",  "Draft"],
    planned:     ["badge-blue",  "Planned"],
    released:    ["badge-violet","Released"],
    in_progress: ["badge-green", "In progress"],
    on_hold:     ["badge-amber", "On hold"],
    completed:   ["badge-green", "Completed"],
    closed:      ["badge-gray",  "Closed"],
    cancelled:   ["badge-red",   "Cancelled"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

// PO state machine
const POStatus = ({ s }) => {
  const map = {
    draft:            ["badge-gray",  "Draft"],
    submitted:        ["badge-blue",  "Submitted"],
    pending_approval: ["badge-amber", "Pending approval"],
    confirmed:        ["badge-blue",  "Confirmed"],
    receiving:        ["badge-green", "Receiving"],
    closed:           ["badge-gray",  "Closed"],
    cancelled:        ["badge-red",   "Cancelled"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

// TO state machine
const TOStatus = ({ s }) => {
  const map = {
    draft:              ["badge-gray",  "Draft"],
    planned:            ["badge-blue",  "Planned"],
    partially_shipped:  ["badge-amber", "Partially shipped"],
    shipped:            ["badge-green", "Shipped"],
    partially_received: ["badge-amber", "Partially received"],
    received:           ["badge-green", "Received"],
    closed:             ["badge-gray",  "Closed"],
    cancelled:          ["badge-red",   "Cancelled"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

// Priority
const Priority = ({ p }) => {
  const map = {
    low:      ["badge-gray",  "Low"],
    normal:   ["badge-blue",  "Normal"],
    high:     ["badge-amber", "High"],
    critical: ["badge-red",   "Critical"],
    urgent:   ["badge-red",   "Urgent"],
  };
  const [cls, label] = map[p] || ["badge-gray", p];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

// Availability — green / yellow / red / produced
const Avail = ({ v, label }) => {
  const text = label || { green: "Available", yellow: "Borderline", red: "Insufficient", produced: "Produced" }[v] || v;
  return <span className={"avail " + v}><span className="avail-dot"></span>{text}</span>;
};

// Allergen cluster (list of family names)
const AllergenCluster = ({ families }) => {
  if (!families || !families.length) return <span className="muted">—</span>;
  const titles = families.join(", ");
  return (
    <span className="allergen-cluster" title={titles}>
      {families.map((f, i) => <span key={i} className={"ac-dot " + f}></span>)}
    </span>
  );
};

// Source badge (d365 / cascade / rework)
const SourceBadge = ({ s }) => {
  if (!s || s === "manual") return null;
  const label = { d365: "D365", cascade: "CASCADE", rework: "REWORK" }[s] || s.toUpperCase();
  return <span className={"source-badge " + s}>{label}</span>;
};

Object.assign(window, {
  PSidebar, PTopbar, PlanNav,
  WOPlanStatus, POStatus, TOStatus, Priority, Avail, AllergenCluster, SourceBadge,
});
