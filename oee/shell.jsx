// ============ OEE module shell — sidebar (OEE active), topbar, sub-nav, widgets ============

const PSidebar = () => {
  // Sidebar count badge — lines below the OEE target (TUNING-PATTERN §3.7).
  // Persists to localStorage (BL-OEE-08 tiny tuning) so the label matches whatever
  // numeric target the user last saved, defaulting to SUMMARY_KPIS_TODAY.target.
  const storedTarget = (() => {
    try { return parseFloat(window.localStorage.getItem("oee.target")) || null; }
    catch (e) { return null; }
  })();
  const target = storedTarget || (typeof SUMMARY_KPIS_TODAY !== "undefined" ? SUMMARY_KPIS_TODAY.target : 70);
  const belowTarget = (typeof OEE_TODAY !== "undefined")
    ? Object.values(OEE_TODAY).filter(l => l.oee != null && l.oee < target).length
    : 0;
  return (
    <div id="sidebar">
      <div className="sidebar-logo">Monopilot <span>MES</span></div>
      <div className="sidebar-group">Core</div>
      <div className="sidebar-item"><span className="ic">◆</span>Dashboard</div>
      <div className="sidebar-item"><span className="ic">⚙</span>Settings</div>
      <div className="sidebar-group">Operations</div>
      <div className="sidebar-item"><span className="ic">▤</span>Planning</div>
      <div className="sidebar-item"><span className="ic">⚒</span>Production</div>
      <div className="sidebar-item active" title={`${belowTarget} line${belowTarget === 1 ? "" : "s"} below ${target}% target`}>
        <span className="ic">◉</span>OEE
        {belowTarget > 0 && (
          <span className="nav-count" style={{background:"var(--sem-bad-bg, var(--red-050))", color:"var(--sem-bad, var(--red-700))", marginLeft:"auto", fontWeight:600}}>
            {belowTarget}
          </span>
        )}
      </div>
      <div className="sidebar-item"><span className="ic">▥</span>Warehouse</div>
      <div className="sidebar-group">QA &amp; Shipping</div>
      <div className="sidebar-item"><span className="ic">✓</span>Quality</div>
      <div className="sidebar-item"><span className="ic">→</span>Shipping</div>
      <div className="sidebar-group">Premium</div>
      <div className="sidebar-item"><span className="ic">▦</span>Technical</div>
      <div className="sidebar-item"><span className="ic">★</span>NPD</div>
      <div className="sidebar-item"><span className="ic">$</span>Finance</div>
      <div className="sidebar-item"><span className="ic">▬</span>Reporting</div>
    </div>
  );
};

const PTopbar = ({ role, onRole }) => (
  <div className="topbar">
    <div className="search"><input placeholder="Search lines, shifts, downtime causes, changeovers…" /></div>
    <div className="role-switch">
      {["Operator", "Shift Supervisor", "Prod Mgr", "CI Engineer", "Admin"].map(r => (
        <button key={r} className={role === r ? "on" : ""} onClick={() => onRole(r)}>{r}</button>
      ))}
    </div>
    <div className="spacer"></div>
    <div className="refresh-bar">
      <span className="refresh-dot"></span>
      <span>Auto-refresh · <span className="mono">60s</span></span>
    </div>
    <div className="divider-v"></div>
    <button className="btn btn-secondary btn-sm">⇪ Export shift report</button>
    <div className="avatar" title="M. Szymczak — Shift Supervisor · Factory-A">MS</div>
  </div>
);

const OeeNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {OEE_NAV.map(g => (
      <React.Fragment key={g.group}>
        <div className="prod-nav-group">{g.group}</div>
        {g.items.map(it => (
          <div key={it.key}
               className={`prod-nav-item ${current === it.key ? "on" : ""} ${it.p2 ? "p2" : ""}`}
               onClick={() => onNav(it.key)}>
            <span className="ic">{it.ic}</span>
            <span>{it.label}</span>
            {it.count && <span className="nav-count">{it.count}</span>}
            {it.hero && <span className="badge badge-blue" style={{marginLeft:"auto", fontSize:9}}>Hero</span>}
            {it.p2 && <span className="badge badge-gray" style={{marginLeft:"auto", fontSize:9}}>P2</span>}
          </div>
        ))}
      </React.Fragment>
    ))}
    <div className="prod-nav-footer">
      OEE · v1.0.0<br/>
      <strong style={{color:"var(--text)"}}>Factory-A</strong> · 5 lines · AM / PM / Night<br/>
      <span style={{color:"var(--green)"}}>●</span> Last aggregation <span className="mono">14:32:05</span><br/>
      <span style={{color:"var(--green)"}}>●</span> MV refresh cron: every 15 min<br/>
      Target <b className="mono">70%</b> · World-class <b className="mono">85%</b>
    </div>
  </div>
);

// ============ SHARED CHART / GAUGE WIDGETS ============

// Sparkline — copied from production/shell.jsx
const Spark = ({ data, color = "var(--blue)", w = 80, h = 22, target, showTarget }) => {
  const clean = data.filter(v => v !== null && !isNaN(v));
  if (!clean.length) return <span className="muted" style={{fontSize:10}}>—</span>;
  const max = Math.max(...clean, target || 0), min = Math.min(...clean, 0);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => {
    if (v === null) return null;
    return `${(i / Math.max(1, data.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`;
  }).filter(Boolean).join(" ");
  const tY = showTarget && target != null ? h - ((target - min) / span) * (h - 2) - 1 : null;
  return (
    <svg className="spark-svg" width={w} height={h}>
      {tY !== null && <line x1="0" x2={w} y1={tY} y2={tY} stroke="var(--info, #3b82f6)" strokeDasharray="2 2" strokeWidth="1" opacity="0.4" />}
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
};

// Gauge ring — full circle (from production/shell.jsx)
const GaugeRing = ({ pct, color = "var(--blue)", size = 120, label, target }) => {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, pct || 0)) / 100) * c;
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--gray-100)" strokeWidth="10" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${c}`} strokeDashoffset="0" strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2 + 2} textAnchor="middle" dominantBaseline="middle"
        fontSize="22" fontWeight="700" fill="var(--text)">
        {pct == null ? "—" : Math.round(pct)}<tspan fontSize="13" fill="var(--muted)">{pct != null && "%"}</tspan>
      </text>
    </svg>
  );
};

// Semi-circle arc gauge (OEE-specific, §1.4) — for the A/P/Q/OEE header row
const ArcGauge = ({ pct, color = "#3b82f6", size = 120, label, target = 85, delta, deltaDir = "up", highlighted }) => {
  const cx = size / 2;
  const cy = size * 0.72;
  const r = size / 2 - 10;
  const startAngle = Math.PI;
  const endAngle = 0;
  const valid = pct != null && !isNaN(pct);
  const pctClamped = valid ? Math.max(0, Math.min(100, pct)) : 0;
  const pctAngle = startAngle + (endAngle - startAngle) * (pctClamped / 100);

  const polar = (angle, rr) => [cx + rr * Math.cos(angle), cy + rr * Math.sin(angle)];
  const arcPath = (a1, a2, rr) => {
    const [x1, y1] = polar(a1, rr);
    const [x2, y2] = polar(a2, rr);
    const large = Math.abs(a2 - a1) > Math.PI ? 1 : 0;
    const sweep = a2 < a1 ? 0 : 1;
    return `M ${x1} ${y1} A ${rr} ${rr} 0 ${large} ${sweep} ${x2} ${y2}`;
  };
  const tAngle = startAngle + (endAngle - startAngle) * (Math.max(0, Math.min(100, target)) / 100);
  const [tx1, ty1] = polar(tAngle, r - 6);
  const [tx2, ty2] = polar(tAngle, r + 8);

  const valueText = valid ? `${pct.toFixed(1)}` : "—";

  return (
    <div className={"arc-gauge " + (highlighted ? "hl" : "")} aria-label={`${label}: ${valid ? pct.toFixed(1) : "—"}%, target ${target}%`} role="img">
      <svg width={size} height={size * 0.8}>
        <path d={arcPath(startAngle, endAngle, r)} stroke="#e2e8f0" strokeWidth="12" fill="none" strokeLinecap="round" />
        {valid && <path d={arcPath(startAngle, pctAngle, r)} stroke={color} strokeWidth="12" fill="none" strokeLinecap="round" />}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#3b82f6" strokeWidth="2" strokeDasharray="2 2" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text)">
          {valueText}
          {valid && <tspan fontSize="13" fill="var(--muted)">%</tspan>}
        </text>
      </svg>
      <div className="arc-label">{label}</div>
      {delta != null && valid && (
        <div className={"arc-delta " + (deltaDir === "up" ? "up" : deltaDir === "down" ? "down" : "")}>
          {deltaDir === "up" ? "▲" : deltaDir === "down" ? "▼" : "·"} {Math.abs(delta).toFixed(1)}pp vs prev
        </div>
      )}
    </div>
  );
};

// Multi-line trend chart (OEE-001) — four lines A/P/Q/OEE + reference line + hover crosshair
const TrendChart = ({ data, w = 820, h = 280, target = 70, worldClass = 85, showDowntime = [], showChangeover = [] }) => {
  const pad = { t: 16, r: 20, b: 26, l: 36 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const [hoverIdx, setHoverIdx] = React.useState(null);

  const x = (i) => pad.l + (i / Math.max(1, data.length - 1)) * iw;
  const y = (v) => pad.t + ih - (v / 100) * ih;

  const lineFor = (key, color, w) => {
    const pts = data.map((d, i) => `${x(i)},${y(d[key])}`).join(" ");
    return <polyline points={pts} fill="none" stroke={color} strokeWidth={w} />;
  };

  const xTicks = [0, 6, 12, 18, 23];

  return (
    <div className="trend-chart-wrap">
      <svg className="trend-chart" width={w} height={h}
           onMouseLeave={() => setHoverIdx(null)}
           onMouseMove={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const px = e.clientX - rect.left;
             const i = Math.round(((px - pad.l) / iw) * (data.length - 1));
             if (i >= 0 && i < data.length) setHoverIdx(i);
           }}>
        {/* Grid */}
        {[0, 20, 40, 60, 80, 100].map(g => (
          <g key={g}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeDasharray={g === 0 ? "0" : "2 3"} />
            <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{g}%</text>
          </g>
        ))}
        {xTicks.map(i => (
          <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{data[i]?.t}</text>
        ))}

        {/* Downtime bands */}
        {showDowntime.map((d, i) => (
          <rect key={i} x={x(d.start)} y={pad.t} width={Math.max(2, x(d.end) - x(d.start))} height={ih}
                fill="rgba(239,68,68,0.1)" />
        ))}
        {/* Changeover markers */}
        {showChangeover.map((c, i) => (
          <line key={i} x1={x(c.hour)} x2={x(c.hour)} y1={pad.t} y2={pad.t + ih}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
        ))}

        {/* World-class line */}
        <line x1={pad.l} x2={pad.l + iw} y1={y(worldClass)} y2={y(worldClass)}
              stroke="#22c55e" strokeDasharray="4 3" strokeWidth="1" opacity="0.6" />
        <text x={pad.l + iw - 4} y={y(worldClass) - 3} textAnchor="end" fontSize="9" fill="#16a34a" fontWeight="600">
          World-class 85%
        </text>
        {/* Target line */}
        <line x1={pad.l} x2={pad.l + iw} y1={y(target)} y2={y(target)}
              stroke="#3b82f6" strokeDasharray="5 3" strokeWidth="1" />
        <text x={pad.l + iw - 4} y={y(target) - 3} textAnchor="end" fontSize="9" fill="#3b82f6" fontWeight="600">
          Target {target}%
        </text>

        {/* Lines */}
        {lineFor("a", "#3b82f6", 1.5)}
        {lineFor("p", "#22c55e", 1.5)}
        {lineFor("q", "#f59e0b", 1.5)}
        {lineFor("oee", "#000000", 2.5)}

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <>
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={pad.t} y2={pad.t + ih} stroke="#64748b" strokeDasharray="2 2" />
            <circle cx={x(hoverIdx)} cy={y(data[hoverIdx].oee)} r="3" fill="#000" />
          </>
        )}
      </svg>
      {hoverIdx !== null && (
        <div className="trend-tooltip" style={{left: Math.min(iw - 150, x(hoverIdx) + 12), top: 10}}>
          <div className="mono" style={{fontSize:11, fontWeight:600}}>{data[hoverIdx].t}</div>
          <div><span className="dot" style={{background:"#3b82f6"}}></span>A {data[hoverIdx].a}%</div>
          <div><span className="dot" style={{background:"#22c55e"}}></span>P {data[hoverIdx].p}%</div>
          <div><span className="dot" style={{background:"#f59e0b"}}></span>Q {data[hoverIdx].q}%</div>
          <div style={{borderTop:"1px solid var(--border)", paddingTop:4, marginTop:3}}>
            <span className="dot" style={{background:"#000"}}></span><b>OEE {data[hoverIdx].oee}%</b>
          </div>
        </div>
      )}
      <div className="trend-legend">
        <span className="lg"><span className="dot" style={{background:"#3b82f6"}}></span>Availability</span>
        <span className="lg"><span className="dot" style={{background:"#22c55e"}}></span>Performance</span>
        <span className="lg"><span className="dot" style={{background:"#f59e0b"}}></span>Quality</span>
        <span className="lg"><span className="dot" style={{background:"#000", width:10, height:2, borderRadius:0}}></span><b>OEE</b></span>
        <span className="lg muted" style={{marginLeft:"auto"}}>Avg 74.8% · Best 88.5% · Worst 52.1% · vs Target −10.2pp</span>
      </div>
    </div>
  );
};

// Pareto bar (reuses production/production.css .pareto-bar)
const ParetoBar = ({ cat, group, mins, events, maxMins, badge }) => {
  const pct = (mins / maxMins) * 100;
  return (
    <div className="pareto-bar">
      <div className="pb-label">{cat}</div>
      <div className="pb-track"><div className={"pb-fill " + group} style={{width: pct + "%"}}></div></div>
      <div className="pb-val">{mins} min</div>
      <div className="pb-pct">{events} ev</div>
    </div>
  );
};

// Helper — OEE status classification & badge
const oeeStatus = (v) => {
  if (v == null || isNaN(v)) return { cls: "gray",  label: "No data",   color: "#64748b" };
  if (v === 100)             return { cls: "purple",label: "Investigate", color: "#a855f7" };
  if (v >= 85)               return { cls: "green", label: "On target", color: "#22c55e" };
  if (v >= 65)               return { cls: "amber", label: "Below target", color: "#f59e0b" };
  return                           { cls: "red",   label: "Action required", color: "#ef4444" };
};

// Colour interpolator for heatmap cells
const heatColor = (v) => {
  if (v == null || isNaN(v)) return "#e2e8f0";
  if (v <= 0) return "#cbd5e1";
  if (v < 65) {
    const t = v / 65;
    return `rgb(${Math.round(239 + (245-239)*t)}, ${Math.round(68 + (158-68)*t)}, ${Math.round(68 + (11-68)*t)})`;
  }
  if (v < 85) {
    const t = (v - 65) / 20;
    return `rgb(${Math.round(245 + (34-245)*t)}, ${Math.round(158 + (197-158)*t)}, ${Math.round(11 + (94-11)*t)})`;
  }
  const t = Math.min(1, (v - 85) / 15);
  return `rgb(${Math.round(34 - 12*t)}, ${Math.round(197 - 34*t)}, ${Math.round(94 - 20*t)})`;
};

// Freshness indicator (§1.6)
const Freshness = ({ lastAgg = "14:32:05", stale = false }) => (
  <div className={"oee-fresh " + (stale ? "stale" : "")}>
    <span className="muted">Last aggregation:</span> <span className="mono">{lastAgg}</span>
    {stale && <span className="badge badge-amber" style={{marginLeft:8, fontSize:9}}>Data stale</span>}
    <span className="oee-autorefresh">
      <span className="refresh-dot"></span>
      Auto-refresh 60s
    </span>
  </div>
);

// Page header (breadcrumb + title + right-aligned actions)
const PageHead = ({ breadcrumb, title, subtitle, right }) => (
  <div className="page-head">
    <div>
      {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
      <h1 className="page-title">{title}</h1>
      {subtitle && <div className="muted" style={{fontSize:12}}>{subtitle}</div>}
    </div>
    {right && <div className="row-flex">{right}</div>}
  </div>
);

// OEE badge
const OEEBadge = ({ v, size = "normal" }) => {
  const s = oeeStatus(v);
  return <span className={`badge badge-${s.cls}`} style={{fontSize: size==="sm"?9:10}}>{s.label}</span>;
};

// Component min-threshold badge (A/P/Q columns)
const CompBadge = ({ v, min }) => {
  if (v == null) return <span className="muted">—</span>;
  const cls = v >= min * 1.05 ? "green" : v >= min ? "amber" : "red";
  return <span className={`badge badge-${cls}`} style={{fontSize:10, fontFamily:"var(--font-mono)"}}>{v.toFixed(1)}%</span>;
};

Object.assign(window, {
  PSidebar, PTopbar, OeeNav,
  Spark, GaugeRing, ArcGauge, TrendChart, ParetoBar,
  oeeStatus, heatColor, Freshness, PageHead, OEEBadge, CompBadge,
});
