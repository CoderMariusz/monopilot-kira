// ============ Reporting module shell — sidebar, topbar, sub-nav, reusable widgets ============

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
    <div className="sidebar-item"><span className="ic">✓</span>Quality</div>
    <div className="sidebar-item"><span className="ic">→</span>Shipping</div>
    <div className="sidebar-group">Premium</div>
    <div className="sidebar-item"><span className="ic">▦</span>Technical</div>
    <div className="sidebar-item"><span className="ic">★</span>NPD</div>
    <div className="sidebar-item"><span className="ic">$</span>Finance</div>
    <div className="sidebar-item"><span className="ic">◉</span>OEE</div>
    <div className="sidebar-group">Analytics</div>
    <div className="sidebar-item active"><span className="ic">▤</span>Reporting</div>
  </div>
);

const PTopbar = ({ role, onRole }) => (
  <div className="topbar">
    <div className="search"><input placeholder="Search dashboards, exports, scheduled reports…" /></div>
    <div className="role-switch">
      {["Viewer","Operator","Manager","Admin"].map(r => (
        <button key={r} className={role === r ? "on" : ""} onClick={() => onRole(r)}>{r}</button>
      ))}
    </div>
    <div className="spacer"></div>
    <div className="refresh-bar">
      <span className="refresh-dot"></span>
      <span>Auto-refresh · <span className="mono">2 min</span></span>
    </div>
    <div className="divider-v"></div>
    <button className="btn btn-secondary btn-sm">↻ Refresh now</button>
    <div className="avatar" title="M. Krawczyk — Reporting Manager · Main Site">MK</div>
  </div>
);

const RptNav = ({ current, onNav, role }) => {
  const showAdmin = role === "Admin";
  return (
    <div className="prod-nav">
      {RPT_NAV.map(g => (
        <React.Fragment key={g.group}>
          <div className="prod-nav-group">{g.group}</div>
          {g.items.filter(it => !it.admin || showAdmin).map(it => (
            <div key={it.key}
                 className={`prod-nav-item ${current === it.key ? "on" : ""}`}
                 onClick={() => onNav(it.key)}>
              <span className="ic">{it.ic}</span>
              <span>{it.label}</span>
              {it.count && <span className="nav-count">{it.count}</span>}
              {it.badge && <span className="badge badge-gray" style={{marginLeft:"auto", fontSize:9}}>{it.badge}</span>}
              {it.hero && <span className="badge badge-blue" style={{marginLeft:"auto", fontSize:9}}>Live</span>}
            </div>
          ))}
        </React.Fragment>
      ))}
      <div className="prod-nav-footer">
        Reporting · v1.0.0<br/>
        <strong style={{color:"var(--text)"}}>Main Site</strong> · 10 P1 dashboards · W16 2026<br/>
        <span style={{color:"var(--green)"}}>●</span> All MVs fresh · last 14:32<br/>
        <span style={{color:"var(--green)"}}>●</span> Delivery flag ON
      </div>
    </div>
  );
};

// ============ KPI RunStrip helper — derives 8-period {tone, title} cells from KPI ============
// Reporting KPIs share shape: { k, label, value, change, changeCls, accent, sub }.
// Tune-6b §2.12: "RunStrip on every KPI card, 8-period trend, per-cell title for tooltip."
// data.jsx is frozen (TUNING-PLAN §4.5) — derive deterministically from fields that exist.
const kpiAccentToTone = (accent) => {
  if (accent === "green") return "ok";
  if (accent === "amber") return "warn";
  if (accent === "red")   return "bad";
  if (accent === "blue")  return "info";
  return "ok";
};
const buildKpiRunCells = (k, opts = {}) => {
  // Deterministic scatter per KPI key — so repeated cards differ visually.
  const key = String(k.k || k.label || "x");
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const latest = kpiAccentToTone(k.accent);
  const down = k.changeCls === "down";
  const cells = [];
  for (let i = 0; i < 8; i++) {
    const bit = (h >> i) & 7;
    let tone;
    if (i === 7) tone = latest;
    else if (latest === "bad") tone = bit === 0 ? "ok" : bit === 1 ? "warn" : "bad";
    else if (latest === "warn") tone = bit < 2 ? "warn" : "ok";
    else if (latest === "info") tone = bit === 0 ? "warn" : "info";
    else tone = (down && bit === 0) ? "warn" : "ok";
    const wk = 16 - (7 - i);
    const title = `W${String(wk).padStart(2,"0")} · ${k.value || ""}`.trim();
    cells.push({ tone, title });
  }
  return cells;
};

// ============ Sparkline (borrowed from production/shell.jsx pattern) ============
const Spark = ({ data, color = "var(--blue)", w = 80, h = 22 }) => {
  if (!data || !data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const span = Math.max(0.001, max - min);
  const pts = data.map((v, i) => `${(i / (data.length - 1 || 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(" ");
  return (
    <svg className="spark-svg" width={w} height={h} style={{verticalAlign:"middle"}}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
};

// ============ GaugeRing — percentage donut ============
const GaugeRing = ({ pct, color = "var(--blue)", size = 120 }) => {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--gray-100)" strokeWidth="10" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${c}`} strokeDashoffset="0" strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + 2} textAnchor="middle" dominantBaseline="middle"
        fontSize="22" fontWeight="700" fill="var(--text)">{Math.round(pct)}<tspan fontSize="13" fill="var(--muted)">%</tspan></text>
    </svg>
  );
};

// ============ Reusable reporting widgets ============

const ScopePill = ({ site = "Main Site" }) => (
  <span className="rpt-scope-pill"><span className="sp-ic">⦿</span>Scoped to: {site}</span>
);

const DrillCrumb = ({ trail, onNav }) => (
  <div className="rpt-drill-crumb">
    {trail.map((t, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="sep">›</span>}
        {i < trail.length - 1 ? (
          <a onClick={() => t.key && onNav && onNav(t.key)}>{t.label}</a>
        ) : (
          <span className="current">{t.label}</span>
        )}
      </React.Fragment>
    ))}
  </div>
);

const FreshnessStrip = ({ at = "14:32", cadence = "2 min", stale = false, staleMin = 0, onRefresh }) => (
  <div className="rpt-fresh-strip">
    <span className="fresh-left">
      <span>Data as of: <b className="mono fresh-ok">{at}</b></span>
      <span className="refresh-ic" title="Refresh now" onClick={onRefresh}>↻</span>
      {stale && <span className="badge badge-amber" style={{fontSize:10}}>Data stale — {staleMin} min ago</span>}
    </span>
    <span className="fresh-right">Refreshes every {cadence}</span>
  </div>
);

const WeekSelector = ({ value = "W/E 19/04/2026", onChange }) => {
  const [open, setOpen] = React.useState(false);
  const weeks = [
    "W/E 19/04/2026",
    "W/E 12/04/2026",
    "W/E 05/04/2026",
    "W/E 29/03/2026",
    "W/E 22/03/2026",
  ];
  return (
    <div style={{position:"relative"}}>
      <button className="rpt-week-btn" onClick={() => setOpen(!open)}>
        <span>📅</span>
        <span>{value}</span>
        <span style={{color:"var(--muted)"}}>▾</span>
      </button>
      {open && (
        <div className="rpt-week-pop" onClick={e => e.stopPropagation()}>
          <div className="wp-nav">
            <button>←</button>
            <span className="lbl">April 2026</span>
            <button>→</button>
          </div>
          <div style={{padding:"6px 0"}}>
            {weeks.map(w => (
              <div key={w} className={"wp-wk " + (w === value ? "on" : "")}
                   onClick={() => { onChange && onChange(w); setOpen(false); }}>{w}</div>
            ))}
          </div>
          <a style={{fontSize:11, color:"var(--blue)", cursor:"pointer", display:"block", padding:"4px 8px"}}>Older weeks…</a>
          <button className="btn btn-secondary btn-sm" style={{width:"100%", marginTop:4}} onClick={() => { onChange && onChange("W/E 19/04/2026"); setOpen(false); }}>This week</button>
        </div>
      )}
    </div>
  );
};

const ExportDropdown = ({ openModal, dashboard = "Factory Overview" }) => {
  const [open, setOpen] = React.useState(false);
  const choose = (fmt) => { setOpen(false); openModal && openModal("export", { dashboard, fmt }); };
  return (
    <div className="rpt-export-split">
      <button className="btn btn-secondary btn-sm split-l" onClick={() => choose("pdf")}>⇪ Export</button>
      <button className="btn btn-secondary btn-sm split-r" onClick={() => setOpen(!open)}>▾</button>
      {open && (
        <div className="rpt-export-dd" onClick={e => e.stopPropagation()}>
          <div onClick={() => choose("pdf")}><span>📄</span>Export as PDF</div>
          <div onClick={() => choose("csv")}><span>📊</span>Export as CSV</div>
          <div onClick={() => choose("copy")}><span>⧉</span>Copy to Clipboard</div>
          <div className="sep"></div>
          <div className="disabled"><span>📈</span>Export as XLSX <span className="badge badge-gray" style={{fontSize:9, marginLeft:"auto"}}>Phase 2</span></div>
        </div>
      )}
    </div>
  );
};

const FilterChips = ({ chips, onRemove, onClearAll, onSavePreset, canSavePreset = true }) => (
  <div className="rpt-filter-bar">
    {chips.map(c => (
      <span key={c.k} className="rpt-chip">
        <span>{c.label}: <b>{c.value}</b></span>
        <span className="x" onClick={() => onRemove(c.k)}>×</span>
      </span>
    ))}
    {chips.length > 0 && (
      <a className="rpt-chip-clear" onClick={onClearAll}>Clear all</a>
    )}
    {canSavePreset && (
      <a className="rpt-chip-save" onClick={onSavePreset}>★ Save as preset</a>
    )}
  </div>
);

// ============ Yield cell helper — colour-coded by delta vs target ============
const YieldCell = ({ val, target, suffix = "%" }) => {
  const delta = val - target;
  let cls = "yld-ok";
  if (delta < -3) cls = "yld-bad";
  else if (delta < 0) cls = "yld-warn";
  return <span className={cls}>{val.toFixed(1)}{suffix}</span>;
};

// ============ Variance badge ============
const VarianceBadge = ({ gbp }) => {
  const favourable = gbp <= 0; // negative = saving
  const cls = favourable ? "badge badge-green" : "badge badge-red";
  const sign = gbp < 0 ? "−£" : "+£";
  return <span className={cls} style={{fontSize:10, fontFamily:"var(--font-mono)"}}>{sign}{Math.abs(gbp).toLocaleString()}</span>;
};

const VariancePctBadge = ({ pct }) => {
  const favourable = pct >= 0;
  const cls = favourable ? "badge badge-green" : "badge badge-red";
  const sign = pct >= 0 ? "+" : "−";
  return <span className={cls} style={{fontSize:10, fontFamily:"var(--font-mono)"}}>{sign}{Math.abs(pct).toFixed(1)}%</span>;
};

// ============ Grade circle (A/B/C/D) ============
const GradeBadge = ({ g }) => <span className={"rpt-grade " + g}>{g}</span>;

// ============ WW change arrow cell ============
const WWChange = ({ pct }) => {
  if (pct === 0) return <span className="muted">→ 0.0%</span>;
  const up = pct > 0;
  return <span style={{color: up ? "var(--green)" : "var(--red)", fontWeight:600, fontSize:11, fontFamily:"var(--font-mono)"}}>{up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%</span>;
};

// ============ Status helpers ============
const HoldSeverity = ({ s }) => {
  const map = { critical: ["badge-red","Critical"], major: ["badge-amber","Major"], minor: ["badge-gray","Minor"] };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

const HoldStatus = ({ s }) => {
  const map = { open: ["badge-red","Open"], released: ["badge-green","Released"], review: ["badge-amber","Under Review"] };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

const ShiftBadge = ({ s }) => {
  const cls = s === "AM" ? "badge-blue" : "badge-gray";
  return <span className={"badge " + cls} style={{fontSize:10, fontFamily:"var(--font-mono)"}}>{s}</span>;
};

const WOStatusBadge = ({ s }) => {
  const map = {
    draft:     ["badge-gray",  "Draft"],
    released:  ["badge-blue",  "Released"],
    running:   ["badge-green", "Running"],
    paused:    ["badge-amber", "Paused"],
    completed: ["badge-gray",  "Completed"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

const StageStatus = ({ s }) => {
  const map = {
    healthy:  ["badge-green", "Healthy"],
    warning:  ["badge-amber", "Warning"],
    critical: ["badge-red",   "Critical"],
    p2:       ["badge-gray",  "P2 — Not Active"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

const RuleStatus = ({ s }) => {
  const map = {
    active:  ["badge-green", "Active"],
    orphan:  ["badge-amber", "Orphan"],
    p2_stub: ["badge-gray",  "P2 Stub"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

const FmtBadge = ({ fmt }) => {
  const map = { pdf: ["badge-red","PDF"], csv: ["badge-green","CSV"], xlsx: ["badge-blue","XLSX"] };
  const [cls, label] = map[fmt] || ["badge-gray", fmt];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

Object.assign(window, {
  PSidebar, PTopbar, RptNav,
  Spark, GaugeRing,
  ScopePill, DrillCrumb, FreshnessStrip, WeekSelector, ExportDropdown, FilterChips,
  YieldCell, VarianceBadge, VariancePctBadge, GradeBadge, WWChange,
  HoldSeverity, HoldStatus, ShiftBadge, WOStatusBadge, StageStatus, RuleStatus, FmtBadge,
  buildKpiRunCells, kpiAccentToTone,
});
