// ============ Multi-Site module shell — sidebar, topbar w/ SITE SWITCHER, sub-nav, badges ============
// The SITE SWITCHER is the distinguishing pattern of Multi-Site. It lives in the topbar
// between the logo and the role/avatar, persists selection in localStorage (key: mp_site_context),
// and "All sites" flips dashboards/lists into aggregated mode (per §1.5 of spec).

const MS_SITE_OPTIONS = [
  { id: "ALL",        code: "ALL",            name: "All sites (aggregated)" },
  { id: "SITE-A",     code: "FRZ-UK",         name: "Factory-A · Apex Warsaw" },
  { id: "SITE-B",     code: "FRZ-DE",         name: "Factory-B · EDGE Germany" },
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
// Tune-6b §2.14.3 — degraded-sites count badge on the active Multi-Site sidebar item.
// Counts sites whose online state is "degraded" or fully offline (i.e. attention-worthy).
// D-MS-04 fix (UX §2.1): activation-state badge ("Setup" amber) coexists with degraded-count
// badge. When activationState is 'inactive' or 'wizard', show badge-amber "Setup" label.
// Both badges address different concerns and should always be shown together when applicable.
const MsSidebar = () => {
  const degraded = (typeof MS_SITES !== "undefined" ? MS_SITES : [])
    .filter(s => s.active && (s.onlineState === "degraded" || s.online === false))
    .length;
  const activationState = (typeof MS_SETTINGS !== "undefined" ? MS_SETTINGS.activationState : "activated");
  const showSetupBadge = activationState === "inactive" || activationState === "wizard";
  return (
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
      <div className="sidebar-item active">
        <span className="ic">🌐</span>
        <span>Multi-Site</span>
        {/* Degraded-sites count badge (red) — Tune-6b §2.14.3 */}
        {degraded > 0 && (
          <span
            className="sidebar-count-badge"
            title={`${degraded} site${degraded === 1 ? "" : "s"} degraded`}
          >{degraded}</span>
        )}
        {/* Activation-state badge (amber "Setup") — UX §2.1 / D-MS-04 fix.
            Shown when module is inactive or wizard-in-progress.
            Coexists with degraded-count badge — both are rendered if applicable. */}
        {showSetupBadge && (
          <span
            className="badge badge-amber"
            style={{fontSize:9, marginLeft: degraded > 0 ? 2 : "auto", padding:"1px 5px"}}
            title={`Multi-site activation: ${activationState === "wizard" ? "wizard in progress" : "not activated"}`}
          >Setup</span>
        )}
      </div>
    </div>
  );
};

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
// Tune-6b §2.14.3 — show a degraded-sites warning pill on the "Sites" sub-nav item.
const MsNav = ({ current, onNav, site }) => {
  const degraded = (typeof MS_SITES !== "undefined" ? MS_SITES : [])
    .filter(s => s.active && (s.onlineState === "degraded" || s.online === false))
    .length;
  return (
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
            {it.key === "sites" && degraded > 0 && (
              <span
                className="nav-count nav-count-warn"
                title={`${degraded} site${degraded === 1 ? "" : "s"} degraded`}
                style={{background:"var(--sem-warn-bg, #fef3c7)", color:"var(--amber-700, #b45309)"}}
              >{degraded} degraded</span>
            )}
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
};

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

// Tune-6b §2.14.1 — per-lane 8-IST run strip for MsLanesList.
// Derives {tone, title} per cell from the last 8 ISTs on this lane.
// data.jsx is frozen — we only read existing MS_ISTS fields (id, status,
// shippedDate). If fewer than 8 ISTs exist on a lane we pad the leading
// cells with the lane's own health tone so the strip still reads clearly.
const laneIstToTone = (t) => {
  if (!t) return "empty";
  if (t.status === "cancelled" || t.etaCls === "red") return "bad";
  if (t.status === "in_transit" || t.etaCls === "amber" || t.status === "shipped") return "warn";
  if (t.status === "closed" || t.status === "received") return "ok";
  return "ok";
};
const laneHealthToTone = (h) =>
  h === "failed" ? "bad" : h === "stale" ? "warn" : h === "active" ? "ok" : "empty";
const buildLaneRunCells = (lane) => {
  const onLane = (typeof MS_ISTS !== "undefined" ? MS_ISTS : [])
    .filter((t) => t.lane === lane.id)
    .slice(-8);
  const cells = onLane.map((t) => ({
    tone: laneIstToTone(t),
    title: `${t.id} · ${t.shippedDate || "pending"} · ${t.status}`,
  }));
  const padTone = laneHealthToTone(lane.health);
  while (cells.length < 8) {
    cells.unshift({ tone: padTone === "empty" ? "ok" : padTone, title: `${lane.id} · no IST yet · ${lane.health}` });
  }
  return cells;
};

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

// Tune-6b §2.14 / BL-MS-05 — inline SVG sparkline replacing the CSS .ms-line-chart
// placeholder. Renders a smooth polyline over 12 points with dot markers + month
// labels. Uses semantic tokens for stroke, matches prototype visual density.
const MsSparkline = ({
  data = [],
  labels = [],
  w = 360,
  h = 140,
  color = "var(--blue)",
  fill = "var(--blue-050, rgba(59,130,246,0.12))",
}) => {
  if (!data || data.length === 0) return null;
  const pad = { t: 10, r: 8, b: 22, l: 8 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = Math.max(0.001, max - min);
  const step = data.length > 1 ? iw / (data.length - 1) : iw;
  const pts = data.map((v, i) => [pad.l + i * step, pad.t + ih - ((v - min) / span) * ih]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pts[0][0]},${pad.t + ih} ${line} ${pts[pts.length - 1][0]},${pad.t + ih}`;
  return (
    <svg className="ms-sparkline" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Shipments trend">
      <polyline points={area} fill={fill} stroke="none"/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill={color}>
          <title>{(labels[i] || `#${i+1}`) + ": " + data[i]}</title>
        </circle>
      ))}
      {labels.map((lab, i) => (
        <text key={i} x={pad.l + i * step} y={h - 6} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{lab}</text>
      ))}
    </svg>
  );
};

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
  buildLaneRunCells, MsSparkline,
});
