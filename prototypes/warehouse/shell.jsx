// ============ Warehouse module shell — sidebar, topbar, sub-nav, status badges ============

const PSidebar = () => (
  <div id="sidebar">
    <div className="sidebar-logo">Monopilot <span>MES</span></div>
    <div className="sidebar-group">Core</div>
    <div className="sidebar-item"><span className="ic">◆</span>Dashboard</div>
    <div className="sidebar-item"><span className="ic">⚙</span>Settings</div>
    <div className="sidebar-group">Operations</div>
    <div className="sidebar-item"><span className="ic">▤</span>Planning</div>
    <div className="sidebar-item"><span className="ic">⚒</span>Production</div>
    <div className="sidebar-item active"><span className="ic">▥</span>Warehouse</div>
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
    <div className="search"><input placeholder="Search LPs, batches, GRNs, movements, products…" /></div>
    <div className="role-switch">
      {["Operator","Manager","QA","Admin"].map(r => (
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
    <div className="avatar" title="J. Nowak — Warehouse Operator · WH-Factory-A">JN</div>
  </div>
);

const WhNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {WH_NAV.map(g => (
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
      Warehouse · v3.0.0<br/>
      <strong style={{color:"var(--text)"}}>WH-Factory-A</strong> · 1,247 active LPs · 8 GRNs<br/>
      <span style={{color:"var(--green)"}}>●</span> Expiry cron: 02:00 UTC daily<br/>
      <span style={{color:"var(--green)"}}>●</span> Printer ZPL-WH-01 online
    </div>
  </div>
);

// ============ Status badges — LP state, QA state, move type, GRN state, Shelf life mode ============

const LPStatus = ({ s }) => {
  const label = { available: "Available", reserved: "Reserved", blocked: "Blocked", consumed: "Consumed", shipped: "Shipped", merged: "Merged" }[s] || s;
  return <span className={"lp-status " + s}>{label}</span>;
};

const QAStatus = ({ s }) => {
  return <span className={"qa-status " + s}>{s}</span>;
};

const GRNStatus = ({ s }) => {
  const map = {
    draft:     ["badge-amber", "Draft"],
    completed: ["badge-green", "Completed"],
    cancelled: ["badge-gray",  "Cancelled"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

const MoveType = ({ t }) => (
  <span className={"mv-type " + t}>{t}</span>
);

const ShelfMode = ({ m }) => {
  if (m === "use_by") return <span className="badge badge-red" style={{fontSize:9}}>use_by</span>;
  if (m === "best_before") return <span className="badge badge-amber" style={{fontSize:9}}>best_before</span>;
  return <span className="muted" style={{fontSize:10}}>—</span>;
};

// Ltree path renderer — converts ["WH","Zone","Bin"] to "WH › Zone › Bin" with styling
const Ltree = ({ path }) => {
  if (!path || !path.length) return <span className="muted">—</span>;
  const last = path.length - 1;
  return (
    <span className="ltree">
      {path.map((p, i) => (
        <React.Fragment key={i}>
          <span className={i === last ? "l-leaf" : "l-anc"}>{p}</span>
          {i < last && <span className="l-sep">›</span>}
        </React.Fragment>
      ))}
    </span>
  );
};

// Expiry cell renderer — colour-coded against today (2026-04-21)
const ExpiryCell = ({ date, mode, days }) => {
  if (!date) return <span className="muted">—</span>;
  let cls = "exp-ok";
  if (days !== undefined) {
    if (days < 0 && mode === "use_by")      cls = "exp-expired";
    else if (days < 0)                      cls = "exp-best";
    else if (days <= 7)                     cls = "exp-red";
    else if (days <= 30)                    cls = "exp-amber";
  }
  return (
    <span className={cls} style={{fontFamily:"var(--font-mono)", fontSize:11}}>
      {date}
      {days !== undefined && days < 0 && <span style={{fontSize:9, marginLeft:4}}>· {Math.abs(days)}d ago</span>}
      {days !== undefined && days >= 0 && days <= 7 && <span style={{fontSize:9, marginLeft:4}}>· in {days}d</span>}
    </span>
  );
};

// Item type badge
const ItemTypeBadge = ({ t }) => {
  const map = {
    raw_material:     ["badge-gray", "raw material"],
    intermediate:     ["badge-blue", "intermediate"],
    finished_article: ["badge-violet", "FA"],
    co_product:       ["badge-violet", "co-product"],
    byproduct:        ["badge-gray", "byproduct"],
  };
  const [cls, label] = map[t] || ["badge-gray", t];
  return <span className={"badge " + cls} style={{fontSize:9}}>{label}</span>;
};

// Source badge (grn / wo_output / split / merge / adjustment)
const SourceChip = ({ s }) => {
  if (!s) return null;
  const label = { grn: "GRN", wo_output: "WO output", split: "Split", merge: "Merge", adjustment: "Adjust." }[s] || s;
  return <span className="badge badge-gray" style={{fontSize:9, marginLeft:4}}>{label}</span>;
};

Object.assign(window, {
  PSidebar, PTopbar, WhNav,
  LPStatus, QAStatus, GRNStatus, MoveType, ShelfMode,
  Ltree, ExpiryCell, ItemTypeBadge, SourceChip,
});
