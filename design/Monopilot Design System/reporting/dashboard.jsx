// ============ RPT-HOME — Reporting Home / Dashboard Catalog ============

const RptHome = ({ role, onNav, openModal }) => {
  const [q, setQ] = React.useState("");
  const [domain, setDomain] = React.useState("All");
  const [phase, setPhase] = React.useState("All");
  const [week, setWeek] = React.useState("W/E 19/04/2026");

  const domains = ["All", "Production", "Quality", "Warehouse", "Operational", "Admin", "Finance"];

  const showAdmin = role === "Admin";

  const filtered = RPT_CATALOG.filter(c => {
    if (c.admin && !showAdmin) return false;
    if (q && !(c.name + c.desc + c.id).toLowerCase().includes(q.toLowerCase())) return false;
    if (domain !== "All" && c.domain !== domain) return false;
    if (phase !== "All" && c.phase !== phase) return false;
    return true;
  });

  const staleCount = RPT_CATALOG.filter(c => c.stale).length;
  const activeChips = [];
  if (domain !== "All") activeChips.push({ k: "domain", label: "Domain", value: domain });
  if (phase !== "All")  activeChips.push({ k: "phase",  label: "Phase",  value: phase });
  if (q)                activeChips.push({ k: "q",      label: "Search", value: q });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">Reporting</div>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Reporting</h1>
            {staleCount === 0
              ? <span className="badge badge-green" style={{fontSize:10}}>All views fresh</span>
              : <span className="badge badge-amber" style={{fontSize:10}}>{staleCount} view(s) stale</span>}
          </div>
          <div className="muted" style={{fontSize:12, marginTop:4}}>
            10 P1 dashboards · 7 P2 placeholders · Scoped to: <b>Main Site</b> · W16 2026
          </div>
        </div>
        <div className="row-flex">
          <WeekSelector value={week} onChange={setWeek}/>
          <button className="btn btn-secondary btn-sm" onClick={() => onNav("exports")}>⇪ Export History</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rpt-filter-bar">
        <input type="text" placeholder="Search dashboards…" value={q} onChange={e => setQ(e.target.value)} style={{width:240, padding:"5px 10px", fontSize:12}}/>
        <select value={domain} onChange={e => setDomain(e.target.value)} style={{fontSize:12, padding:"5px 8px"}}>
          {domains.map(d => <option key={d}>{d}</option>)}
        </select>
        <select value={phase} onChange={e => setPhase(e.target.value)} style={{fontSize:12, padding:"5px 8px"}}>
          <option>All</option>
          <option>P1</option>
          <option>P2</option>
        </select>
        {activeChips.map(c => (
          <span key={c.k} className="rpt-chip">
            <span>{c.label}: <b>{c.value}</b></span>
            <span className="x" onClick={() => {
              if (c.k === "domain") setDomain("All");
              if (c.k === "phase")  setPhase("All");
              if (c.k === "q")      setQ("");
            }}>×</span>
          </span>
        ))}
      </div>

      {/* Catalog grid */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="◐"
            title="No dashboards match your search"
            body="Clear the filters to see all 10 dashboards, or adjust the domain/phase filters."
            action={{ label: "Clear filters", onClick: () => { setQ(""); setDomain("All"); setPhase("All"); } }}
          />
        </div>
      ) : (
        <div className="rpt-cat-grid">
          {filtered.map(c => (
            <div key={c.id} className={"rpt-cat-card " + (c.phase === "P2" ? "p2" : "")}
                 onClick={() => c.phase === "P2" ? onNav("p2_placeholder:" + c.id) : onNav(c.key)}>
              <div className="rpt-cat-head">
                <span className="rpt-cat-icon">{c.ic}</span>
                <span className={"badge " + (c.domainClass || "badge-gray")} style={{fontSize:10}}>{c.domain}</span>
              </div>
              <div className="rpt-cat-name">{c.name}</div>
              <div className="mono" style={{fontSize:10, color:"var(--muted)"}}>{c.id}</div>
              <div className="rpt-cat-desc">{c.desc}</div>
              <div className="rpt-cat-divider"></div>
              <div className="rpt-cat-foot">
                <span className="refresh-meta">
                  {c.refreshedAt ? <>Refreshed <b className="mono">{c.refreshedAt}</b></> : <span style={{color:"var(--muted)"}}>—</span>}
                </span>
                <a>{c.phase === "P2" ? "Coming in Phase 2" : "View →"}</a>
              </div>
              {c.phase === "P2" && (
                <span className="badge badge-gray" style={{position:"absolute", top:10, right:10, fontSize:9}}>Coming in Phase 2</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{marginTop:14, fontSize:11, color:"var(--muted)"}}>
        Showing {filtered.length} of {RPT_CATALOG.length} dashboards · Catalog sourced from <span className="mono">dashboards_catalog</span> — metadata-driven per Strategic Decision #6.
      </div>
    </>
  );
};

// ============ Tune-6b §2.12.2 / BL-RPT-01 — P2 placeholder screen (EmptyState) ============
// Previously the P2 catalog card opened a toast. Per BL-RPT-01 we render a proper
// EmptyState screen with "Coming in Phase 2" + CTA back to catalog. Route shape is
// "p2_placeholder:<catalog-id>" so we can show the specific dashboard name.
const RptP2Placeholder = ({ role, onNav, openModal, screen }) => {
  const id = (screen || "").split(":")[1] || "";
  const card = RPT_CATALOG.find(c => c.id === id);
  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb
            trail={[{label:"Reporting", key:"home"}, {label: card ? card.name : "Phase 2 dashboard"}]}
            onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">{card ? card.name : "Phase 2 dashboard"}</h1>
            <span className="badge badge-gray" style={{fontSize:10}}>Coming in Phase 2</span>
          </div>
          {card && (
            <div className="muted" style={{fontSize:12, marginTop:4}}>
              {card.id} · {card.domain} · {card.desc}
            </div>
          )}
        </div>
      </div>
      <div className="card">
        <EmptyState
          icon={card ? card.ic : "🕒"}
          title={`${card ? card.name : "This dashboard"} is coming in Phase 2`}
          body={card
            ? `${card.desc} Scheduled for a future Phase 2 release — explore the live P1 dashboards in the meantime.`
            : "This dashboard is scheduled for Phase 2. Explore the P1 dashboards available today from the Reporting catalog."}
          action={{ label: "Back to catalog", onClick: () => onNav("home") }}
        />
      </div>
    </>
  );
};

Object.assign(window, { RptHome, RptP2Placeholder });
