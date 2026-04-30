// =============================================================================
// Dashboard widgets — one component per department
// All read from window.DASH_* fixtures defined in data.jsx
// =============================================================================

// ----- shared widget shell -----
const Widget = ({ icon, iconClass, title, sub, link, children }) => (
  <div className="widget">
    <div className="widget-head">
      <div className="left" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className={`widget-icon ${iconClass}`}>{icon}</div>
        <div>
          <div className="widget-title">{title}</div>
          {sub && <div className="widget-sub">{sub}</div>}
        </div>
      </div>
      {link && <a className="widget-link" onClick={() => alert("Open " + link)}>Open →</a>}
    </div>
    {children}
  </div>
);

// ============================================================
// NPD WIDGET — projects per phase + risk + nearest launch
// ============================================================
const NpdWidget = () => {
  const d = window.DASH_NPD;
  return (
    <Widget icon="💡" iconClass="npd" title="NPD" sub={`${d.total} active projects · next launch in ${d.risk.next_launch_days} days`} link="/npd">
      <div className="mini-stats">
        <div className="mini-stat"><div className="mini-stat-v red">{d.risk.high}</div><div className="mini-stat-l">High risk</div></div>
        <div className="mini-stat"><div className="mini-stat-v amber">{d.risk.med}</div><div className="mini-stat-l">Medium risk</div></div>
        <div className="mini-stat"><div className="mini-stat-v">{d.risk.overdue}</div><div className="mini-stat-l">Overdue</div></div>
      </div>

      <div className="phases">
        {d.by_phase.map(p => (
          <div className="phase-row" key={p.name}>
            <span className="name">{p.name}</span>
            <div className="phase-bar"><i style={{ width: p.pct * 3 + "%" }} /></div>
            <span className="count">{p.count}</span>
          </div>
        ))}
      </div>

      <div className="alert-item" style={{ background: "var(--amber-050a)", borderColor: "var(--amber-050)" }}>
        <div className="ico amber">!</div>
        <div className="body">
          <div className="title">{d.hero_alert.fg} · {d.hero_alert.name}</div>
          <div className="meta">{d.hero_alert.issue}</div>
        </div>
        <div className="due" style={{ color: "var(--amber-700)" }}>{d.hero_alert.days_left}d left</div>
      </div>
    </Widget>
  );
};

// ============================================================
// TECHNICAL WIDGET — open audits + failures
// ============================================================
const TechnicalWidget = () => {
  const d = window.DASH_TECHNICAL;
  return (
    <Widget icon="🔧" iconClass="technical" title="Technical" sub={`${d.audits.open} open audits · ${d.specs.active} active specs`} link="/technical">
      <div className="mini-stats">
        <div className="mini-stat"><div className="mini-stat-v red">{d.audits.overdue}</div><div className="mini-stat-l">Overdue audits</div></div>
        <div className="mini-stat"><div className="mini-stat-v amber">{d.audits.this_week}</div><div className="mini-stat-l">Due this week</div></div>
        <div className="mini-stat"><div className="mini-stat-v">{d.specs.expiring_30d}</div><div className="mini-stat-l">Specs expire 30d</div></div>
      </div>

      <div className="alert-list">
        {d.failed_audits.map(a => (
          <div className="alert-item" key={a.id}>
            <div className={`ico ${a.severity === "high" ? "" : "amber"}`}>{a.severity === "high" ? "!" : "•"}</div>
            <div className="body">
              <div className="title">{a.scope}</div>
              <div className="meta"><span className="mono" style={{fontFamily:"var(--font-mono)"}}>{a.id}</span> · {a.owner}</div>
            </div>
            <div className="due" style={{ color: a.due.includes("overdue") ? "var(--red)" : "var(--amber-700)" }}>{a.due}</div>
          </div>
        ))}
      </div>
    </Widget>
  );
};

// ============================================================
// PRODUCTION WIDGET — yield trend + line counter
// ============================================================
const ProductionWidget = () => {
  const d = window.DASH_PRODUCTION;
  const max = Math.max(...d.trend_7d, d.target);
  return (
    <Widget icon="🏭" iconClass="production" title="Production" sub={`${d.cases_today.toLocaleString()} cases today · target ${d.cases_target.toLocaleString()}`} link="/production">
      <div className="mini-stats">
        <div className="mini-stat"><div className={`mini-stat-v ${d.today_yield >= d.target ? "green" : "amber"}`}>{d.today_yield}%</div><div className="mini-stat-l">Yield today · tgt {d.target}%</div></div>
        <div className="mini-stat"><div className="mini-stat-v">{d.cases_today.toLocaleString()}</div><div className="mini-stat-l">Cases produced</div></div>
        <div className="mini-stat"><div className="mini-stat-v amber">{d.waste_pct}%</div><div className="mini-stat-l">Waste</div></div>
      </div>

      {/* yield bars 7-day */}
      <div>
        <div className="yield-chart" style={{ marginTop: 16 }}>
          {d.trend_7d.map((v, i) => {
            const h = (v / max) * 100;
            const cls = v >= d.target ? "" : v >= d.target - 1.5 ? "low" : "crit";
            const today = i === d.today_idx ? " today" : "";
            return (
              <div key={i} className={`yield-bar ${cls}${today}`} style={{ height: h + "%" }}>
                {i === d.today_idx && <span className="v">{v}%</span>}
              </div>
            );
          })}
        </div>
        <div className="yield-axis">
          {d.trend_labels.map((l, i) => <span key={i} className={i === d.today_idx ? "today" : ""}>{l}</span>)}
        </div>
      </div>

      {/* line counter */}
      <div className="line-list" style={{ marginTop: 6 }}>
        {d.active_lines.map(l => (
          <div className="line-row" key={l.name}>
            <div className="lname">
              <span className={`running-dot ${l.state}`}></span>
              <span>{l.name}</span>
              <span className="muted" style={{fontSize:11, fontFamily:"var(--font-mono)"}}>{l.of}</span>
            </div>
            <div className={`lyield ${l.yield === null ? "" : l.yield >= 90 ? "green" : l.yield >= 86 ? "amber" : "red"}`}>
              {l.yield === null ? "—" : l.yield + "%"}
            </div>
            <div className="lcount">{l.count.toLocaleString()}/{l.target.toLocaleString()}</div>
            <div className="lstate">{l.state}</div>
          </div>
        ))}
      </div>
    </Widget>
  );
};

// ============================================================
// QUALITY WIDGET — holds + NCRs
// ============================================================
const QualityWidget = () => {
  const d = window.DASH_QUALITY;
  return (
    <Widget icon="✅" iconClass="quality" title="Quality" sub={`${d.releases_today} releases today`} link="/quality">
      <div className="mini-stats">
        <div className="mini-stat"><div className="mini-stat-v red">{d.holds}</div><div className="mini-stat-l">Holds</div></div>
        <div className="mini-stat"><div className="mini-stat-v amber">{d.open_ncrs}</div><div className="mini-stat-l">Open NCRs · {d.critical_ncrs} crit</div></div>
        <div className="mini-stat"><div className="mini-stat-v green">{d.releases_today}</div><div className="mini-stat-l">Released today</div></div>
      </div>

      <div className="alert-list">
        {d.recent_holds.map(h => (
          <div className="alert-item" key={h.lp}>
            <div className="ico">⏸</div>
            <div className="body">
              <div className="title"><span style={{fontFamily:"var(--font-mono)"}}>{h.lp}</span> · {h.reason}</div>
              <div className="meta">Batch {h.batch}</div>
            </div>
            <div className="due" style={{ color: "var(--gray-500)" }}>{h.age} ago</div>
          </div>
        ))}
      </div>
    </Widget>
  );
};

// ============================================================
// PLANNING WIDGET — POs / WOs
// ============================================================
const PlanningWidget = () => {
  const d = window.DASH_PLANNING;
  return (
    <Widget icon="📅" iconClass="planning" title="Planning" sub={`Next GRN ${d.next_grn.at} · ${d.next_grn.po}`} link="/planning">
      <div className="mini-stats">
        <div className="mini-stat"><div className="mini-stat-v">{d.active_pos}</div><div className="mini-stat-l">Active POs</div></div>
        <div className="mini-stat"><div className="mini-stat-v red">{d.overdue_pos}</div><div className="mini-stat-l">Overdue POs</div></div>
        <div className="mini-stat"><div className="mini-stat-v blue">{d.active_wos}</div><div className="mini-stat-l">Active WOs</div></div>
      </div>
      <div className="alert-item">
        <div className="ico blue">📦</div>
        <div className="body">
          <div className="title">Next inbound: {d.next_grn.po}</div>
          <div className="meta">{d.next_grn.supplier} · arrives {d.next_grn.at}</div>
        </div>
      </div>
    </Widget>
  );
};

Object.assign(window, { Widget, NpdWidget, TechnicalWidget, ProductionWidget, QualityWidget, PlanningWidget });
