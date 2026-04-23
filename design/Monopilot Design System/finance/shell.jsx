// ============ Finance module shell — sidebar, topbar, sub-nav, badges, variance primitives ============

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
    <div className="sidebar-item active"><span className="ic">$</span>Finance</div>
    <div className="sidebar-item"><span className="ic">◉</span>OEE</div>
  </div>
);

const PTopbar = ({ role, onRole }) => (
  <div className="topbar">
    <div className="search"><input placeholder="Search standard costs, WOs, journal IDs, batches…"/></div>
    <div className="role-switch">
      {["Finance Manager","Finance Viewer","Plant Director","Admin"].map(r => (
        <button key={r} className={role === r ? "on" : ""} onClick={() => onRole(r)}>{r}</button>
      ))}
    </div>
    <div className="spacer"></div>
    <div className="refresh-bar">
      <span className="refresh-dot"></span>
      <span>Auto-refresh · <span className="mono">5min</span></span>
    </div>
    <div className="divider-v"></div>
    <button className="btn btn-secondary btn-sm">↻ Refresh now</button>
    <div className="avatar" title="Sarah McKenzie — Finance Manager · Forza Foods UK">SM</div>
  </div>
);

const FinNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {FIN_NAV.map(g => (
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
            {it.phase2 && <span className="badge badge-gray" style={{marginLeft:"auto", fontSize:9}}>Phase 2</span>}
          </div>
        ))}
      </React.Fragment>
    ))}
    <div className="prod-nav-footer">
      Finance · v1.0.0<br/>
      <strong style={{color:"var(--text)"}}>Forza Foods UK</strong> · Base GBP · FY2026<br/>
      <span style={{color:"var(--green)"}}>●</span> D365 F&amp;O posting: healthy<br/>
      <span style={{color:"var(--amber)"}}>●</span> Daily batch: next 23:00 UTC
    </div>
  </div>
);

// ============ Variance Badge — central visual language element (spec §10.1) ============
// Props: value (GBP, can be negative), percent (number), size (sm|md|lg), label
const VarBadge = ({ value, percent = 0, size = "md", showValue = true }) => {
  let cls = "neutral", label = "On Target", arrow = "●";
  if (value === 0) { cls = "neutral"; label = "On Target"; arrow = "●"; }
  else if (value < 0) { cls = "fav"; label = "Favorable"; arrow = "▼"; }
  else if (Math.abs(percent) >= 10) { cls = "crit"; label = "Critical"; arrow = "▲"; }
  else if (Math.abs(percent) >= 5) { cls = "warn"; label = "Warning"; arrow = "▲"; }
  else { cls = "warn"; label = "Warning"; arrow = "▲"; }
  const sizeCls = size === "sm" ? " var-sm" : size === "lg" ? " var-lg" : "";
  const pct = percent >= 0 ? `+${percent.toFixed(1)}%` : `${percent.toFixed(1)}%`;
  return (
    <span className={"var-badge " + cls + sizeCls} aria-label={`${label} variance`}>
      <span className="va-arrow">{arrow}</span>
      {showValue && size !== "sm" && <span>{fmtMoneySigned(value)}</span>}
      <span>({pct})</span>
    </span>
  );
};

// ============ Cost Status pill (WO Cost — spec §10.4) ============
const CostStatus = ({ variance, variancePct, hasProduction = true }) => {
  if (!hasProduction) return <span className="cost-status pending">⏱ Pending</span>;
  if (variance < 0) return <span className="cost-status favorable">▼ Favorable</span>;
  if (Math.abs(variancePct) >= 10) return <span className="cost-status over">‼ Over Budget</span>;
  if (Math.abs(variancePct) > 5) return <span className="cost-status warning">⚠ Warning</span>;
  return <span className="cost-status ontrack">✓ On Track</span>;
};

// ============ Standard cost status badge ============
// Standard cost lifecycle per PRD §6: draft → pending → approved →
// superseded / retired. The "active" legacy alias is retained only for
// safety when rendering older mock rows; canonical state is "approved".
const StdStatus = ({ s }) => {
  const map = {
    approved:   ["badge-green", "Approved"],
    active:     ["badge-green", "Approved"], // legacy alias — render as Approved
    draft:      ["badge-gray",  "Draft"],
    pending:    ["badge-amber", "Pending"],
    superseded: ["badge-gray",  "Superseded"],
    retired:    ["badge-gray",  "Retired"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

// ============ WO cost status badge ============
const WoCostStatus = ({ s }) => {
  const map = {
    open:     ["badge-amber", "Open"],
    closed:   ["badge-blue",  "Closed"],
    posted:   ["badge-green", "Posted"],
    reversed: ["badge-gray",  "Reversed"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

// ============ Item type badge ============
const ItemTypeBadge = ({ t }) => {
  const map = {
    RM:           ["badge-gray",   "RM"],
    Intermediate: ["badge-blue",   "Intermediate"],
    FA:           ["badge-violet", "FA"],
    "Co-product": ["badge-violet", "Co-product"],
    "By-product": ["badge-gray",   "By-product"],
  };
  const [cls, label] = map[t] || ["badge-gray", t];
  return <span className={"badge " + cls} style={{fontSize:9}}>{label}</span>;
};

// ============ Aging badge ============
const AgingBadge = ({ a }) => {
  const map = {
    "0-30d":  ["badge-green", "0–30d"],
    "30-60d": ["badge-amber", "30–60d"],
    "60-90d": ["badge-amber", "60–90d"],
    "90d+":   ["badge-red",   "90d+"],
  };
  const [cls, label] = map[a] || ["badge-gray", a];
  return <span className={"badge " + cls} style={{fontSize:9}}>{label}</span>;
};

// ============ D365 status badges ============
const D365BatchStatus = ({ s }) => {
  const map = {
    pending:    ["badge-gray",  "Pending"],
    dispatched: ["badge-blue",  "Dispatched"],
    delivered:  ["badge-green", "Delivered"],
    failed:     ["badge-red",   "Failed"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:9}}>{label}</span>;
};

const D365OutboxStatus = ({ s }) => {
  const map = {
    pending:      ["badge-gray",  "Pending"],
    consolidated: ["badge-blue",  "Consolidated"],
    delivered:    ["badge-green", "Delivered"],
    failed:       ["badge-red",   "Failed"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:9}}>{label}</span>;
};

const DlqCategoryBadge = ({ c }) => {
  const map = {
    transient:       ["badge-amber",  "transient"],
    permanent:       ["badge-red",    "permanent"],
    schema:          ["badge-violet", "schema"],
    d365_validation: ["badge-amber",  "d365_validation"],
  };
  const [cls, label] = map[c] || ["badge-gray", c];
  return <span className={"badge " + cls} style={{fontSize:9}}>{label}</span>;
};

const FxSourceBadge = ({ s }) => {
  const map = {
    base:   ["badge-gray",  "Base"],
    manual: ["badge-blue",  "Manual"],
    api:    ["badge-green", "API"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:9}}>{label}</span>;
};

// ============ Monetary formatters (en-GB) — spec §12.1 ============
const fmtMoney = (v, suffix = false) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = v < 0 ? `(£ ${formatted})` : `£ ${formatted}`;
  return suffix ? `${s} GBP` : s;
};
const fmtMoneySigned = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v > 0) return `£ +${formatted}`;
  if (v < 0) return `£ −${formatted}`;
  return `£ ${formatted}`;
};
const fmtUnit = (v) => v == null ? "—" : `£ ${v.toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/kg`;
const fmtRate = (v) => v == null ? "—" : v.toLocaleString("en-GB", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const fmtPct = (v) => v == null ? "—" : (v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`);
const fmtQty = (v, dp = 3) => v == null ? "—" : v.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });

// ============ Simple inline SVG trend line (cost trend) ============
const TrendChart = ({ series, colors, labels, height = 200, yMax }) => {
  const w = 640, h = height;
  const padL = 40, padR = 30, padT = 10, padB = 30;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const n = series[0].length;
  const maxY = yMax || Math.max(...series.flat()) * 1.1;
  const stepX = innerW / (n - 1);
  const yAt = v => padT + innerH - (v / maxY) * innerH;
  const path = arr => arr.map((v, i) => `${i === 0 ? "M" : "L"}${padL + i * stepX},${yAt(v)}`).join(" ");

  return (
    <div className="chart-box">
      <div className="chart-area" style={{height}}>
        <div className="chart-axis-y">
          <span>{Math.round(maxY / 1000)}K</span>
          <span>{Math.round(maxY * 0.75 / 1000)}K</span>
          <span>{Math.round(maxY * 0.50 / 1000)}K</span>
          <span>{Math.round(maxY * 0.25 / 1000)}K</span>
          <span>0</span>
        </div>
        <svg className="chart-svg" viewBox={`0 0 ${innerW} ${innerH}`} preserveAspectRatio="none" style={{width:"100%", height: innerH}}>
          {series.map((arr, i) => (
            <polyline key={i}
              points={arr.map((v, j) => `${j * (innerW / (n - 1))},${innerH - (v / maxY) * innerH}`).join(" ")}
              fill="none" stroke={colors[i]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          ))}
          {series.map((arr, i) => arr.map((v, j) => (
            <circle key={`${i}-${j}`} cx={j * (innerW / (n - 1))} cy={innerH - (v / maxY) * innerH} r="3" fill={colors[i]}/>
          )))}
        </svg>
        <div className="chart-axis-x">
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {
  PSidebar, PTopbar, FinNav,
  VarBadge, CostStatus, StdStatus, WoCostStatus, ItemTypeBadge, AgingBadge,
  D365BatchStatus, D365OutboxStatus, DlqCategoryBadge, FxSourceBadge,
  fmtMoney, fmtMoneySigned, fmtUnit, fmtRate, fmtPct, fmtQty,
  TrendChart,
});
