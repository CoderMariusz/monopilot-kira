// ============ Multi-Site module shell — sidebar, topbar w/ SITE SWITCHER, sub-nav, badges ============
// The SITE SWITCHER is the distinguishing pattern of Multi-Site. It lives in the topbar
// between the logo and the role/avatar, persists selection in localStorage (key: mp_site_context),
// and "All sites" flips dashboards/lists into aggregated mode (per §1.5 of spec).

const MS_SITE_OPTIONS = [
  { id: "ALL",        code: "ALL",            name: "All sites (aggregated)" },
  { id: "SITE-A",     code: "FRZ-UK",         name: "Factory-A · Forza Warsaw" },
  { id: "SITE-B",     code: "FRZ-DE",         name: "Factory-B · KOBE Germany" },
  { id: "SITE-WH-01", code: "WH-COLD",        name: "WH-Cold-01 · Harlow" },
];

// Site switcher dropdown — lives in topbar (signature Multi-Site pattern)
const MsSiteSwitcher = ({ site, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = MS_SITE_OPTIONS.find(o => o.id === site) || MS_SITE_OPTIONS[0];
  const isAll = site === "ALL";

  const pick = (opt) => {
    onChange(opt.id);
    setOpen(false);
  };

  return (
    <div className="site-switcher" ref={ref}>
      <button className={"site-switcher-trigger " + (open ? "open " : "") + (isAll ? "all " : "")} onClick={() => setOpen(!open)}>
        <span className="ss-globe">{isAll ? "🌐" : "⌂"}</span>
        <span className="ss-code">{current.code}</span>
        <span className="ss-name">{current.name}</span>
        <span className="ss-chev">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="site-switcher-panel">
          <div className="ss-section-head">Scope</div>
          <div className={"ss-row all-sites " + (site === "ALL" ? "on" : "")} onClick={() => pick(MS_SITE_OPTIONS[0])}>
            <span className="ss-row-code">🌐 ALL</span>
            <span className="ss-row-name">All sites (aggregated)</span>
            <span></span>
            <span className="ss-row-check">{site === "ALL" ? "✓" : ""}</span>
          </div>

          <div className="ss-section-head">Active sites ({MS_SITES.filter(s => s.active).length})</div>
          {MS_SITES.filter(s => s.active).map(s => (
            <div key={s.id} className={"ss-row " + (site === s.id ? "on" : "")} onClick={() => pick({ id: s.id })}>
              <span className="ss-row-code">{s.code}</span>
              <span className="ss-row-name">{s.name}</span>
              <span className={"site-type " + s.type}>{s.type === "copack" ? "Co-pack" : s.type.charAt(0).toUpperCase() + s.type.slice(1)}</span>
              <span className="ss-row-check">{site === s.id ? "✓" : ""}</span>
            </div>
          ))}

          <div className="ss-foot">
            <a>Manage Sites →</a>
            <span className="mono" style={{fontSize:10, color:"var(--muted)"}}>mp_site_context</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ Sidebar ============
const MsSidebar = () => (
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
    <div className="sidebar-item"><span className="ic">▦</span>Technical</div>
    <div className="sidebar-item"><span className="ic">★</span>NPD</div>
    <div className="sidebar-item"><span className="ic">$</span>Finance</div>
    <div className="sidebar-item"><span className="ic">◉</span>OEE</div>
    <div className="sidebar-group">NEW</div>
    <div className="sidebar-item active"><span className="ic">🌐</span>Multi-Site</div>
  </div>
);

// ============ Topbar (SITE SWITCHER lives here) ============
const MsTopbar = ({ role, onRole, site, onSite }) => (
  <div className="topbar">
    <MsSiteSwitcher site={site} onChange={onSite}/>
    <div className="divider-v" style={{margin:"0 8px"}}></div>
    <div className="search" style={{maxWidth:340}}>
      <input placeholder="Search sites, ISTs, lanes, entities..." />
    </div>
    <div className="role-switch">
      {["Ops Director","Site Manager","Planner","Admin"].map(r => (
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
    <div className="avatar" title={role}>A</div>
  </div>
);

// ============ Sub-nav (sidebar-to-main column) ============
const MsNav = ({ current, onNav, site }) => (
  <div className="prod-nav">
    {MS_NAV.map(g => (
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
      Multi-Site · v1.0.0<br/>
      <strong style={{color:"var(--text)"}}>Scope:</strong> <span className="mono" style={{color:"var(--blue)"}}>{site === "ALL" ? "ALL" : (MS_SITES.find(s => s.id === site)?.code || "—")}</span><br/>
      <span style={{color:"var(--green)"}}>●</span> Replication: 3:00 UTC nightly<br/>
      <span style={{color:"var(--amber)"}}>●</span> 1 conflict unresolved<br/>
      <span style={{color:"var(--green)"}}>●</span> Activation: <b>activated</b>
    </div>
  </div>
);

// ============ Site breadcrumb prefix ============
// Every screen uses this to show "Factory-A / [screen]" or "ALL / [screen]"
const SiteCrumb = ({ site }) => {
  if (site === "ALL") return <span className="site-crumb all">🌐 ALL</span>;
  const s = MS_SITES.find(x => x.id === site);
  if (!s) return null;
  return <span className="site-crumb">{s.flag} {s.code}</span>;
};

// ============ Badges ============
const SiteTypeBadge = ({ t }) => {
  const map = { plant: "Plant", warehouse: "Warehouse", office: "Office", copack: "Co-pack" };
  return <span className={"site-type " + t}>{map[t] || t}</span>;
};

const ISTStatus = ({ s }) => {
  const label = { draft: "Draft", planned: "Planned", shipped: "Shipped", in_transit: "In Transit", received: "Received", closed: "Closed", cancelled: "Cancelled" }[s] || s;
  const cls = "ist-status " + s + (s === "in_transit" ? " badge-pulsing" : "");
  return <span className={cls}>{label}</span>;
};

const RepStatus = ({ s }) => {
  const label = { synced: "Synced", pending: "Pending", conflict: "Conflict", running: "Running", failed: "Failed", retrying: "Retrying", completed: "Completed", cancelled: "Cancelled" }[s] || s;
  return <span className={"rep-status " + s}>{label}</span>;
};

const LaneHealth = ({ s }) => <span className={"lane-health " + s}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>;

const ActState = ({ s }) => {
  const label = { inactive: "Inactive", wizard: "Wizard In Progress", dual_run: "Dual Run", activated: "Activated" }[s] || s;
  return <span className={"act-state " + s}>{label}</span>;
};

// Site ref renderer — shows code + name + type chip; link wraps navigate to site detail
const SiteRef = ({ id, onOpen, compact }) => {
  const s = MS_SITES.find(x => x.id === id);
  if (!s) return <span className="muted">—</span>;
  if (compact) return <span className="mono" style={{fontSize:11, color:"var(--blue)", cursor:"pointer", fontWeight:600}} onClick={() => onOpen && onOpen(id)}>{s.code}</span>;
  return (
    <span style={{display:"inline-flex", gap:6, alignItems:"center", cursor: onOpen ? "pointer" : "default"}} onClick={() => onOpen && onOpen(id)}>
      <span className="mono" style={{fontSize:11, color:"var(--blue)", fontWeight:600}}>{s.code}</span>
      <span style={{fontSize:11}}>{s.name.split(" — ")[0]}</span>
      <SiteTypeBadge t={s.type}/>
    </span>
  );
};

// Status dot
const StatusDot = ({ state }) => <span className={"ms-status-dot " + state}></span>;

// Aggregated-view banner (shown when site === 'ALL' on list screens)
const AllSitesBanner = ({ site }) => {
  if (site !== "ALL") return null;
  return (
    <div className="all-sites-banner">
      🌐 <span className="mono">ALL SITES</span> scope active — data aggregated across {MS_SITES.filter(s => s.active).length} sites. <span className="muted" style={{fontSize:11}}>Switch to a single site to see site-exclusive screens.</span>
    </div>
  );
};

Object.assign(window, {
  MS_SITE_OPTIONS,
  MsSidebar, MsTopbar, MsNav, MsSiteSwitcher,
  SiteCrumb, SiteTypeBadge, ISTStatus, RepStatus, LaneHealth, ActState,
  SiteRef, StatusDot, AllSitesBanner,
});
