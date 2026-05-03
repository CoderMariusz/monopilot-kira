// ============ Shipping module shell — sidebar, topbar, sub-nav, status badges ============

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
    <div className="sidebar-item active"><span className="ic">🚚</span>Shipping</div>
    <div className="sidebar-group">Premium</div>
    <div className="sidebar-item"><span className="ic">▦</span>Technical</div>
    <div className="sidebar-item"><span className="ic">★</span>NPD</div>
    <div className="sidebar-item"><span className="ic">$</span>Finance</div>
    <div className="sidebar-item"><span className="ic">◉</span>OEE</div>
  </div>
);

const PTopbar = ({ role, onRole }) => (
  <div className="topbar">
    <div className="search"><input placeholder="Search SOs, customers, shipments, SSCC, LPs…" /></div>
    <div className="role-switch">
      {["Coordinator","Manager","Packer","QA","Admin"].map(r => (
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
    <div className="avatar" title="M. Krawczyk — Shipping Coordinator · DC-Factory-A">MK</div>
  </div>
);

const ShNav = ({ current, onNav }) => (
  <div className="prod-nav">
    {SH_NAV.map(g => (
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
      Shipping · v1.0.0<br/>
      <strong style={{color:"var(--text)"}}>DC-Factory-A</strong> · 28 open SOs · 9 live shipments<br/>
      <span style={{color:"var(--green)"}}>●</span> D365 outbox: 1 DLQ (admin)<br/>
      <span style={{color:"var(--amber)"}}>●</span> ZPL-SH-02 offline · 6 labels queued<br/>
      <span style={{color:"var(--green)"}}>●</span> GS1 prefix <span className="mono">5012345</span> · next SSCC #48
    </div>
  </div>
);

// ============ SO / Shipment / Pick / Hold badges ============

const SOStatus = ({ s }) => {
  const label = { draft:"Draft", confirmed:"Confirmed", allocated:"Allocated", short:"Short", picking:"Picking", packing:"Packing", packed:"Packed", shipped:"Shipped", delivered:"Delivered", partial:"Partial", cancelled:"Cancelled", held:"On Hold" }[s] || s;
  return <span className={"so-status " + s}>{label}</span>;
};

const ShipStatus = ({ s }) => {
  const label = { draft:"Draft", packing:"Packing", packed:"Packed", manifested:"Manifested", shipped:"Shipped", delivered:"Delivered" }[s] || s;
  return <span className={"so-status " + s}>{label}</span>;
};

const PickStatus = ({ s }) => {
  const map = {
    "Pending":     ["badge-gray",   "Pending"],
    "Assigned":    ["badge-blue",   "Assigned"],
    "In Progress": ["badge-amber",  "In Progress"],
    "Completed":   ["badge-green",  "Completed"],
    "Cancelled":   ["badge-gray",   "Cancelled"],
  };
  const [cls, label] = map[s] || ["badge-gray", s];
  return <span className={"badge " + cls} style={{fontSize:10}}>{label}</span>;
};

const HoldChip = ({ type }) => {
  const label = { credit:"Credit", qa:"QA", allergen:"Allergen", manual:"Manual" }[type] || type;
  const ic    = { credit:"£",     qa:"⚗",  allergen:"⚠",      manual:"✋" }[type] || "•";
  return <span className={"hold-chip " + type}><span>{ic}</span>{label}</span>;
};

const LPStatus = ({ s }) => {
  const label = { available:"Available", reserved:"Reserved", blocked:"Blocked", consumed:"Consumed", shipped:"Shipped" }[s] || s;
  const cls = { available:"badge-green", reserved:"badge-blue", blocked:"badge-red", consumed:"badge-gray", shipped:"badge-blue" }[s] || "badge-gray";
  return <span className={"badge " + cls} style={{fontSize:10, fontFamily:"var(--font-mono)"}}>{label}</span>;
};

const QAStatus = ({ s }) => (
  <span className={"badge " + ({PASSED:"badge-green",PENDING:"badge-amber",HOLD:"badge-amber",FAILED:"badge-red",QUARANTINED:"badge-red",RELEASED:"badge-green"}[s] || "badge-gray")} style={{fontSize:10, fontFamily:"var(--font-mono)"}}>{s}</span>
);

// Ltree path (warehouse-style)
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

// FEFO rank chip
const FefoRank = ({ rank }) => {
  if (rank === "—" || !rank) return <span className="muted">—</span>;
  return <span className={"fefo-rank " + (rank === 1 ? "top" : "")}>{rank}</span>;
};

// Progress bar
const Progress = ({ current, total, wide }) => {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const cls = pct === 100 ? "full" : "";
  return (
    <div className="pick-prog" style={wide ? {width:140} : {}}>
      <span className={cls} style={{width: pct + "%"}}></span>
    </div>
  );
};

// Allocation bar
const AllocBar = ({ pct }) => {
  const cls = pct === 100 ? "" : pct >= 50 ? "warn" : pct === 0 ? "err" : "warn";
  return (
    <span>
      <span className="alloc-prog"><span className={cls} style={{width: pct + "%"}}></span></span>
      <span className="mono" style={{fontSize:11}}>{pct}%</span>
    </span>
  );
};

// Allergen chips
const AllergenChips = ({ list }) => {
  if (!list || !list.length) return <span className="muted" style={{fontSize:10}}>—</span>;
  return (
    <span>
      {list.map(a => <span key={a} className="badge badge-amber" style={{fontSize:9, marginRight:3, textTransform:"uppercase"}}>{a}</span>)}
    </span>
  );
};

Object.assign(window, {
  PSidebar, PTopbar, ShNav,
  SOStatus, ShipStatus, PickStatus, HoldChip,
  LPStatus, QAStatus, Ltree, FefoRank, Progress, AllocBar, AllergenChips,
});
