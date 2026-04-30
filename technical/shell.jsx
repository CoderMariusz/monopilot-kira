// ============ Technical module shell ============

const TSidebar = () => (
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
    <div className="sidebar-item"><span className="ic">✓</span>Quality</div>
    <div className="sidebar-item"><span className="ic">→</span>Shipping</div>
    <div className="sidebar-group">Premium</div>
    <div className="sidebar-item active"><span className="ic">▦</span>Technical</div>
    <div className="sidebar-item"><span className="ic">★</span>NPD</div>
    <div className="sidebar-item"><span className="ic">$</span>Finance</div>
    <div className="sidebar-item"><span className="ic">◉</span>OEE</div>
  </div>
);

const TTopbar = () => (
  <div className="topbar">
    <div className="search"><input placeholder="Search BOMs, recipes, specs, ECO…" /></div>
    <div className="spacer"></div>
    <button className="btn btn-secondary btn-sm">⇪ Import</button>
    <button className="btn btn-secondary btn-sm">Export</button>
    <div className="avatar">AM</div>
  </div>
);

const TechNav = ({ current, onNav }) => (
  <div className="tech-nav">
    {TECH_NAV.map(g => (
      <React.Fragment key={g.group}>
        <div className="tech-nav-group">{g.group}</div>
        {g.items.map(it => (
          <div key={it.key}
               className={`tech-nav-item ${current === it.key ? "on" : ""}`}
               onClick={() => onNav(it.key)}>
            <span className="ic">{it.ic}</span>
            <span>{it.label}</span>
            {it.hero && <span style={{ marginLeft: "auto" }} className="badge badge-blue">Hero</span>}
          </div>
        ))}
      </React.Fragment>
    ))}
    <div style={{ padding: 14, marginTop: 20, borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--muted)" }}>
      Technical module · v2.14.3<br/>
      <strong style={{ color: "var(--text)" }}>42 BOMs</strong> · 18 specs · 6 open ECO
    </div>
  </div>
);

// Compact status badge
const Status = ({ s }) => {
  const map = {
    active: ["badge-green", "Active"],
    draft: ["badge-gray", "Draft"],
    review: ["badge-amber", "In review"],
    archived: ["badge-gray", "Archived"],
    approved: ["badge-green", "Approved"],
    implementing: ["badge-blue", "Implementing"],
    closed: ["badge-gray", "Closed"],
    running: ["badge-green", "Running"],
    maintenance: ["badge-amber", "Maintenance"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

Object.assign(window, { TSidebar, TTopbar, TechNav, Status });
