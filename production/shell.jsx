// ============ Production module shell ============

const PSidebar = () => (
  <div id="sidebar">
    <div className="sidebar-logo">Monopilot <span>MES</span></div>
    <div className="sidebar-group">Core</div>
    <div className="sidebar-item"><span className="ic">◆</span>Dashboard</div>
    <div className="sidebar-item"><span className="ic">⚙</span>Settings</div>
    <div className="sidebar-group">Operations</div>
    <div className="sidebar-item"><span className="ic">▤</span>Planning</div>
    <div className="sidebar-item active"><span className="ic">⚒</span>Production</div>
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
    <div className="search"><input placeholder="Search WOs, lines, items, LPs…" /></div>
    <div className="role-switch">
      {["Operator","Shift Lead","Plant Mgr","Quality"].map(r => (
        <button key={r} className={role === r ? "on" : ""} onClick={() => onRole(r)}>{r}</button>
      ))}
    </div>
    <div className="spacer"></div>
    <div className="refresh-bar">
      <span className="refresh-dot"></span>
      <span>Live · <span className="mono">2s</span> refresh</span>
    </div>
    <div className="divider-v"></div>
    <button className="btn btn-secondary btn-sm">⇪ Export shift report</button>
    <div className="avatar" title="M. Szymczak — Shift Lead · Factory-A">MS</div>
  </div>
);

const ProdNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {PROD_NAV.map(g => (
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
      Production · v3.2.1<br/>
      <strong style={{color:"var(--text)"}}>Factory-A</strong> · Shift A · 4 of 5 lines active<br/>
      <span style={{color:"var(--green)"}}>●</span> D365: connected
    </div>
  </div>
);

// Status badge
const WOStatus = ({ s }) => {
  const map = {
    draft: ["badge-gray", "Draft"],
    ready: ["badge-blue", "Ready"],
    in_progress: ["badge-green", "In progress"],
    paused: ["badge-amber", "Paused"],
    completed: ["badge-gray", "Completed"],
    qa_hold: ["badge-red", "QA hold"],
    cancelled: ["badge-gray", "Cancelled"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

// Line status pill
const LineStatus = ({ s }) => {
  const map = {
    running: ["badge-green", "● Running"],
    paused: ["badge-amber", "❚❚ Paused"],
    down: ["badge-red", "⚠ Down"],
    changeover: ["badge-violet", "⇄ Changeover"],
    idle: ["badge-gray", "○ Idle"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls}>{label}</span>;
};

// Sparkline
const Spark = ({ data, color = "var(--blue)", w = 80, h = 22 }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 2) - 1}`).join(" ");
  return (
    <svg className="spark-svg" width={w} height={h}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
};

// Gauge ring (SVG)
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

// Modal primitive
const Modal = ({ open, onClose, title, children, foot, wide }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={"modal-box " + (wide ? "wide" : "")} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
};

Object.assign(window, { PSidebar, PTopbar, ProdNav, WOStatus, LineStatus, Spark, GaugeRing, Modal });
