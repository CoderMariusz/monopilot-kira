// ============ Maintenance module shell — sidebar, topbar, sub-nav, status helpers ============

const PSidebar = () => (
  <div id="sidebar">
    <div className="sidebar-logo">Monopilot <span>MES</span></div>
    <div className="sidebar-group">Core</div>
    <div className="sidebar-item"><span className="ic">◆</span>Dashboard</div>
    <div className="sidebar-item"><span className="ic">⚙</span>Settings</div>
    <div className="sidebar-group">Operations</div>
    <div className="sidebar-item"><span className="ic">▤</span>Planning</div>
    <div className="sidebar-item"><span className="ic">⚒</span>Production</div>
    <div className="sidebar-item"><span className="ic">▥</span>Warehouse</div>
    <div className="sidebar-item active"><span className="ic">🔩</span>Maintenance</div>
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
    <div className="search"><input placeholder="Search assets, mWOs, PM schedules, spares, LOTO…" /></div>
    <div className="role-switch">
      {["Technician","Manager","Safety","Admin"].map(r => (
        <button key={r} className={role === r ? "on" : ""} onClick={() => onRole(r)}>{r}</button>
      ))}
    </div>
    <div className="spacer"></div>
    <div className="refresh-bar">
      <span className="refresh-dot"></span>
      <span>Auto-refresh · <span className="mono">30s</span></span>
    </div>
    <div className="divider-v"></div>
    <button className="btn btn-secondary btn-sm">↻ Refresh now</button>
    <div className="avatar" title="M. Nowak — Maintenance Technician · WH-Factory-A">MN</div>
  </div>
);

const MntNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {MNT_NAV.map(g => (
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
      Maintenance · v1.0.0<br/>
      <strong style={{color:"var(--text)"}}>WH-Factory-A</strong> · 15 assets · 23 PM schedules<br/>
      <span style={{color:"var(--green)"}}>●</span> PM engine: 06:00 UTC daily<br/>
      <span style={{color:"var(--amber)"}}>●</span> 2 LOTO active · 3 overdue PMs
    </div>
  </div>
);

// ============ Status badges ============

const MwoStatus = ({ s }) => {
  const label = { requested: "Requested", approved: "Approved", open: "Open", in_progress: "In Work", completed: "Completed", cancelled: "Cancelled" }[s] || s;
  return <span className={"mwo-status " + s}>{label}</span>;
};

const PriorityBadge = ({ p }) => {
  const label = { critical: "Critical", high: "High", medium: "Medium", low: "Low" }[p] || p;
  return <span className={"pri " + p}>{label}</span>;
};

const AssetStatus = ({ s }) => {
  const label = { operational: "Operational", scheduled: "Scheduled", due: "Due", overdue: "Overdue", in_work: "In Work", inactive: "Inactive" }[s] || s;
  return <span className={"ast-status " + s}>{label}</span>;
};

const LotoBadge = ({ active }) => {
  if (active) return <span className="loto-badge"><span className="loto-icon active">🔒</span>LOTO Active</span>;
  return <span className="loto-icon">🔒</span>;
};

const MwoType = ({ t }) => (
  <span className={"mwo-type " + t}>{t}</span>
);

const MwoSource = ({ s }) => {
  const label = { manual: "Manual", pm_schedule: "PM Schedule", auto_downtime: "Auto-DT", oee_trigger: "OEE Trigger", calibration_alert: "Cal. Alert" }[s] || s;
  return <span className={"mwo-src " + s}>{label}</span>;
};

const CalResult = ({ r }) => (
  <span className={"cal-result " + r}>{r}</span>
);

const CritBadge = ({ c }) => {
  if (!c) return null;
  return <span className={"pri " + c} style={{fontSize:9}}>{c}</span>;
};

// Ltree path renderer — same as warehouse pattern
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

// Due-date cell (amber if within warning window, red if overdue)
const DueCell = ({ date, days }) => {
  if (!date) return <span className="muted">—</span>;
  let cls = "exp-ok";
  if (days !== undefined && days !== null) {
    if (days < 0) cls = "exp-expired";
    else if (days <= 7) cls = "exp-red";
    else if (days <= 30) cls = "exp-amber";
  }
  return (
    <span className={cls} style={{fontFamily:"var(--font-mono)", fontSize:11}}>
      {date}
      {days !== undefined && days < 0 && <span style={{fontSize:9, marginLeft:4}}>· {Math.abs(days)}d ago</span>}
      {days !== undefined && days >= 0 && days <= 7 && <span style={{fontSize:9, marginLeft:4}}>· in {days}d</span>}
    </span>
  );
};

// Availability cell (color-coded)
const AvailCell = ({ pct }) => {
  if (pct === undefined || pct === null || pct === "—") return <span className="muted">—</span>;
  let cls = "exp-ok";
  if (pct < 90) cls = "exp-red";
  else if (pct < 95) cls = "exp-amber";
  return <span className={cls} style={{fontFamily:"var(--font-mono)"}}>{pct}%</span>;
};

// Cross-module link chip
const CmChip = ({ module, label, onClick }) => (
  <span className={"cm-chip " + (module || "")} onClick={onClick} style={{cursor: onClick ? "pointer" : "default"}}>
    {label}
  </span>
);

Object.assign(window, {
  PSidebar, PTopbar, MntNav,
  MwoStatus, PriorityBadge, AssetStatus, LotoBadge, MwoType, MwoSource, CalResult, CritBadge,
  Ltree, DueCell, AvailCell, CmChip,
});
