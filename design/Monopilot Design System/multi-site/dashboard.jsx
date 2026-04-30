// ============ MS-NET Network Dashboard ============
// Cross-site KPIs: Sites Online · Transfers In Transit · Replication Conflicts · Aggregated Inventory · Throughput.
// Network tree view (l0 org → l1 sites → l2 plants/buildings → l3 lines).
// Active transfers feed + Replication status panel.

const MsDashboard = ({ role, site, onNav, onOpenSite, onOpenIST, openModal }) => {
  const [view, setView] = React.useState("tree");    // tree | map
  const [dismissed, setDismissed] = React.useState(new Set());
  const dismiss = (c) => { const n = new Set(dismissed); n.add(c); setDismissed(n); };
  const visibleAlerts = MS_NET_ALERTS.filter(a => !dismissed.has(a.code));

  const canSeeValue = role === "Ops Director" || role === "Admin";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Network Dashboard
          </div>
          <h1 className="page-title">Network Dashboard</h1>
          <div className="muted" style={{fontSize:12}}>
            Monitor the health and activity of your entire site network in real time. · <b>Last updated 14s ago</b> · Auto-refresh 60s
          </div>
        </div>
        <div className="row-flex">
          <ActState s={MS_SETTINGS.activationState}/>
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("istCreate")}>＋ New Transfer</button>
          <button className="btn btn-secondary btn-sm">↻ Refresh</button>
        </div>
      </div>

      {/* KPI strip — 5 cards */}
      <div className="ms-kpi-row">
        {MS_NET_KPIS.map(k => {
          const restricted = k.restricted && !canSeeValue;
          return (
            <div key={k.k} className={"kpi " + k.accent + (restricted ? " kpi-locked" : "")} onClick={() => !restricted && onNav(k.target)} style={{cursor:"pointer"}}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{restricted ? "🔒" : k.value}</div>
              <div className="kpi-sub">{restricted ? "Ops Director / Admin only" : k.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Alerts strip */}
      {visibleAlerts.length > 0 && (
        <div className="card" style={{marginBottom:12}}>
          <div className="card-head">
            <h3 className="card-title">⚠ Network Alerts</h3>
            <span className="badge badge-gray" style={{fontSize:10}}>{visibleAlerts.length} active</span>
          </div>
          {visibleAlerts.map(a => (
            <div key={a.code} className={"alert-box alert-" + a.severity} style={{marginBottom:6, fontSize:12, padding:"8px 12px"}}>
              <span>⚠</span>
              <div style={{flex:1}}>
                <div>{a.text}</div>
                <div style={{fontSize:10, color:"var(--muted)", marginTop:3, fontFamily:"var(--font-mono)"}}>{a.code}</div>
              </div>
              <div className="alert-cta">
                <button className="btn btn-sm btn-secondary" onClick={() => onNav(a.link)}>View →</button>
                <button className="btn btn-sm btn-ghost" onClick={() => dismiss(a.code)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Two-column: network tree (left 65%) + transfers+replication (right 35%) */}
      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:12}}>
        {/* LEFT — network tree */}
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Network Overview</h3>
            <div className="pills">
              <button className={"pill " + (view === "tree" ? "on" : "")} onClick={() => setView("tree")}>Tree View</button>
              <button className={"pill " + (view === "map" ? "on" : "")} onClick={() => setView("map")}>Map View</button>
              {view === "map" && <span className="badge badge-amber" style={{fontSize:9}}>Soon</span>}
            </div>
          </div>

          {view === "tree" ? (
            <div className="ms-tree">
              {/* l0 root */}
              <div className="ms-tree-item l0">
                <span className="ms-tree-icon">🏢</span>
                <div className="ms-tree-main">
                  <div><span className="ms-tree-name">Apex Foods / EDGE Organization</span></div>
                  <span className="ms-tree-kpi">4 sites · 3 countries · 52 users · £2.44M aggregated inventory</span>
                </div>
                <div className="ms-tree-right">
                  <StatusDot state="online"/>
                </div>
              </div>

              {MS_SITES.map(s => (
                <React.Fragment key={s.id}>
                  <div className={"ms-tree-item l1 " + (site === s.id ? "on" : "")} onClick={() => onOpenSite(s.id)}>
                    <span className="ms-tree-icon">{s.type === "plant" ? "🏭" : s.type === "warehouse" ? "🏢" : s.type === "office" ? "🏬" : "📦"}</span>
                    <div className="ms-tree-main">
                      <div>
                        <span className="ms-tree-code">{s.code}</span> · <span className="ms-tree-name">{s.flag} {s.name}</span> <SiteTypeBadge t={s.type}/>
                      </div>
                      <span className="ms-tree-kpi">WO Active: {s.activeWOs} · Holds: {s.qualityHolds} · Inv: {s.invValueTxt} · {s.users} users</span>
                    </div>
                    <div className="ms-tree-right">
                      <StatusDot state={s.online ? "online" : (s.onlineState === "degraded" ? "degraded" : "offline")}/>
                      <span className="muted" style={{fontSize:10}}>sync {s.lastSync}</span>
                    </div>
                  </div>
                  {/* l2 sample (only for plants) */}
                  {s.type === "plant" && (
                    <>
                      <div className="ms-tree-item l2">
                        <span className="ms-tree-icon">🏗</span>
                        <div className="ms-tree-main"><span className="ms-tree-code">BLD-01</span> · Main Production Building</div>
                        <div className="ms-tree-right"><span className="muted" style={{fontSize:10}}>6 lines</span></div>
                      </div>
                      <div className="ms-tree-item l3">
                        <span className="ms-tree-icon">▤</span>
                        <div className="ms-tree-main"><span className="ms-tree-code">LINE-1</span> · Sausage line</div>
                        <div className="ms-tree-right"><span className="muted" style={{fontSize:10}}>OEE 86%</span></div>
                      </div>
                      <div className="ms-tree-item l3">
                        <span className="ms-tree-icon">▤</span>
                        <div className="ms-tree-main"><span className="ms-tree-code">LINE-4</span> · Pierogi line</div>
                        <div className="ms-tree-right"><span className="muted" style={{fontSize:10}}>OEE 74%</span></div>
                      </div>
                    </>
                  )}
                  {s.type === "warehouse" && (
                    <div className="ms-tree-item l2">
                      <span className="ms-tree-icon">❄</span>
                      <div className="ms-tree-main"><span className="ms-tree-code">BLD-COLD</span> · Cold storage hall</div>
                      <div className="ms-tree-right"><span className="muted" style={{fontSize:10}}>18 aisles · util 68%</span></div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div style={{padding:40, textAlign:"center", background:"var(--gray-050)", borderRadius:6}}>
              <div style={{fontSize:44, marginBottom:10}}>🗺</div>
              <div style={{fontSize:13, fontWeight:600}}>Map view is a P2 feature</div>
              <div className="muted" style={{fontSize:12, marginTop:6}}>Geographic rendering of 4 site pins (UK, DE). Map library choice deferred — see §9 Open Questions.</div>
              <button className="btn btn-secondary btn-sm" style={{marginTop:14}} onClick={()=>setView("tree")}>Switch to Tree View</button>
            </div>
          )}
        </div>

        {/* RIGHT — Active transfers + Replication */}
        <div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Active Transfers</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("transfers")}>View All →</button>
            </div>
            <div className="activity-feed">
              {MS_ACTIVE_ISTS.map(t => (
                <div key={t.id} className="tl-item" onClick={()=>onOpenIST(t.id)} style={{cursor:"pointer"}}>
                  <span className={"tl-dot " + (t.status === "in_transit" ? "amber" : "blue")}></span>
                  <div>
                    <div><span className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{t.id}</span> · <span className="mono">{t.from}</span> → <span className="mono">{t.to}</span> <ISTStatus s={t.status}/></div>
                    <div className="tl-sub">{t.lines} items · {t.qty}</div>
                  </div>
                  <div className="tl-time" style={{color: t.etaLate ? "var(--red-700)" : "var(--muted)"}}>{t.eta}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">Replication Health</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("replication")}>View Queue →</button>
            </div>
            <div style={{padding:"8px 4px"}}>
              <div style={{display:"flex", justifyContent:"space-around", padding:"12px 0"}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:22, fontWeight:700, color:"var(--green-700)", fontFamily:"var(--font-mono)"}}>{MS_MDS_KPIS.synced}</div>
                  <div className="muted" style={{fontSize:10, textTransform:"uppercase"}}>Synced</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:22, fontWeight:700, color:"var(--blue)", fontFamily:"var(--font-mono)"}}>{MS_MDS_KPIS.pending}</div>
                  <div className="muted" style={{fontSize:10, textTransform:"uppercase"}}>Pending</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:22, fontWeight:700, color:"var(--red-700)", fontFamily:"var(--font-mono)"}}>{MS_MDS_KPIS.conflict}</div>
                  <div className="muted" style={{fontSize:10, textTransform:"uppercase"}}>Conflicts</div>
                </div>
              </div>
              <div className="muted" style={{fontSize:11, padding:"6px 8px", borderTop:"1px solid var(--border)"}}>
                Last full replication: <b>2026-04-21 03:00 UTC</b> (REP-4900 · completed with 1 error)
              </div>
              {MS_MDS_KPIS.conflict > 0 && (
                <div className="alert-red alert-box" style={{marginTop:8, fontSize:11, padding:"6px 10px"}}>
                  <span>⚠</span>
                  <div>{MS_MDS_KPIS.conflict} conflicts require manual resolution.</div>
                  <button className="btn btn-sm btn-primary" onClick={()=>openModal("conflict")}>Resolve →</button>
                </div>
              )}
            </div>
          </div>

          {/* Site-down mini-widget */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head"><h3 className="card-title">Site Status</h3></div>
            <div style={{padding:"6px 4px"}}>
              {MS_SITES.map(s => (
                <div key={s.id} style={{display:"flex", gap:8, padding:"6px 10px", fontSize:12, alignItems:"center", borderBottom:"1px dashed var(--border)"}}>
                  <StatusDot state={s.online ? "online" : (s.onlineState === "degraded" ? "degraded" : "offline")}/>
                  <span className="mono" style={{fontSize:10.5, color:"var(--muted)", width:70}}>{s.code}</span>
                  <span style={{flex:1}}>{s.flag} {s.name.split(" — ")[0]}</span>
                  <span className="muted" style={{fontSize:10}}>{s.lastSync}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { MsDashboard });
