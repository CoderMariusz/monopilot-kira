// ============ Quality module shell — sidebar (QA active), topbar, sub-nav, status badges ============

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
    <div className="sidebar-group">QA &amp; Shipping</div>
    <div className="sidebar-item active"><span className="ic">✓</span>Quality</div>
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
    <div className="search"><input placeholder="Search holds, NCRs, inspections, specs, CCPs…" /></div>
    <div className="role-switch">
      {["QA Inspector", "Quality Lead", "Hygiene Lead", "Shift Lead", "Auditor"].map(r => (
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
    <div className="avatar" title="E. Kowalska — Quality Lead · WH-Factory-A">EK</div>
  </div>
);

const QaNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {QA_NAV.map(g => (
      <React.Fragment key={g.group}>
        <div className="prod-nav-group">{g.group}</div>
        {g.items.map(it => (
          <div key={it.key}
               className={`prod-nav-item ${current === it.key ? "on" : ""} ${it.p2 ? "p2" : ""}`}
               onClick={() => onNav(it.key)}
               style={it.p2 ? { opacity: 0.5 } : null}>
            <span className="ic">{it.ic}</span>
            <span>{it.label}</span>
            {it.count && <span className="nav-count">{it.count}</span>}
            {it.p2 && <span className="badge" style={{marginLeft: "auto", fontSize: 9, background: "#f1f5f9", color: "var(--muted)", padding: "1px 5px", borderRadius: 8}}>P2</span>}
            {it.hero && <span className="badge badge-blue" style={{marginLeft: "auto", fontSize: 9}}>Live</span>}
          </div>
        ))}
      </React.Fragment>
    ))}
    <div className="prod-nav-footer">
      Quality · v3.0.0<br/>
      <strong style={{color: "var(--text)"}}>WH-Factory-A</strong> · 8 active holds · 11 open NCRs<br/>
      <span style={{color: "var(--green)"}}>●</span> CCP rule: active<br/>
      <span style={{color: "var(--green)"}}>●</span> Retention cron: 02:00 UTC daily<br/>
      <span style={{color: "#3730a3"}}>●</span> Records signed today: 14
    </div>
  </div>
);

// ============ QA badge helpers ============

const QaBadge = ({ variant, label }) => (
  <span className={"qa-badge badge-" + variant}>{label || variant}</span>
);

const SeverityBadge = ({ s }) => {
  const map = { critical: "Critical", major: "Major", minor: "Minor" };
  return <span className={"qa-badge badge-" + s}>{map[s] || s}</span>;
};

const StatusBadge = ({ s }) => {
  const map = {
    open: ["open", "Open"],
    investigating: ["invest", "Investigating"],
    escalated: ["critical", "Escalated"],
    released: ["released", "Released"],
    quarantined: ["quarantined", "Quarantined"],
    cancelled: ["closed", "Cancelled"],
    closed: ["closed", "Closed"],
    draft: ["draft", "Draft"],
    pending: ["pending", "Pending"],
    assigned: ["pending", "Assigned"],
    in_progress: ["invest", "In progress"],
    completed: ["released", "Completed"],
    active: ["released", "Active"],
    under_review: ["pending", "Under review"],
    superseded: ["closed", "Superseded"],
    pending_second_sign: ["hold", "Awaiting 2nd sign"],
    approved: ["released", "Approved"],
    rejected: ["fail", "Rejected"],
    expired: ["fail", "Expired"],
    archived: ["closed", "Archived"],
  };
  const [variant, label] = map[s] || ["pending", s];
  return <span className={"qa-badge badge-" + variant}>{label}</span>;
};

const PriorityBadge = ({ p }) => {
  const map = {
    low: ["minor", "Low"],
    medium: ["pending", "Medium"],
    high: ["major", "High"],
    critical: ["critical", "Critical"],
    normal: ["pending", "Normal"],
    urgent: ["critical", "Urgent"],
  };
  const [variant, label] = map[p] || ["pending", p];
  return <span className={"qa-badge badge-" + variant}>{label}</span>;
};

const HazardBadge = ({ h }) => (
  <span className={"qa-badge hazard-" + h}>{h}</span>
);

const UrgencyBadge = ({ u }) => {
  const map = { overdue: "urgency-overdue Overdue", today: "urgency-today Today", sched: "urgency-sched Scheduled" };
  const [cls, label] = (map[u] || "urgency-sched —").split(" ");
  return <span className={"qa-badge " + cls}>{label}</span>;
};

const SignedIcon = ({ signed }) =>
  signed ? <span className="qa-badge badge-signed" title="Signed — 21 CFR Part 11">🔒 Signed</span>
         : <span style={{fontSize: 10, color: "var(--muted)"}}>—</span>;

const ResultBadge = ({ r }) => {
  if (!r) return <span style={{fontSize: 10, color: "var(--muted)"}}>—</span>;
  const map = { pass: "pass", fail: "fail", pending: "pending", cond: "cond", hold: "hold" };
  return <span className={"qa-badge badge-" + (map[r] || "pending")}>{r.toUpperCase()}</span>;
};

const RegTags = ({ regs }) => (
  <div className="reg-tags">
    {(regs || []).map((r, i) => <span key={i} className="reg-tag">{r}</span>)}
  </div>
);

Object.assign(window, {
  PSidebar, PTopbar, QaNav,
  QaBadge, SeverityBadge, StatusBadge, PriorityBadge, HazardBadge, UrgencyBadge,
  SignedIcon, ResultBadge, RegTags,
});
