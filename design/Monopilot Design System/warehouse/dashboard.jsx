// ============ WH-001 — Warehouse Dashboard ============

const WhDashboard = ({ role, onNav, onOpenLp, openModal }) => {
  const [dismissed, setDismissed] = React.useState(new Set());
  const [feedFilter, setFeedFilter] = React.useState("all");

  const dismiss = (code) => {
    const next = new Set(dismissed); next.add(code); setDismissed(next);
  };
  const visibleAlerts = WH_ALERTS.filter(a => !dismissed.has(a.code));

  const canSeeValue = role === "Manager" || role === "Admin";

  const filteredFeed = feedFilter === "all" ? WH_ACTIVITY : WH_ACTIVITY.filter(e =>
    feedFilter === "split" ? e.desc.toLowerCase().includes("split") :
    feedFilter === "move" ? (e.desc.toLowerCase().includes("moved") || e.desc.toLowerCase().includes("putaway")) :
    feedFilter === "consume" ? e.desc.toLowerCase().includes("consumed") :
    feedFilter === "output" ? e.desc.toLowerCase().includes("output") :
    feedFilter === "receipt" ? e.desc.toLowerCase().includes("grn") :
    true
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Warehouse</a> · Dashboard</div>
          <h1 className="page-title">Warehouse — dashboard</h1>
          <div className="muted" style={{fontSize:12}}>WH-Factory-A · 1,247 active LPs · 83 SKUs · <b>Data refreshed 14s ago</b> · Cached 60s</div>
        </div>
        <div className="row-flex">
          <select style={{width:160}}><option>WH-Factory-A</option><option>WH-Factory-B</option><option>WH-DistCentral</option></select>
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("stockMove")}>＋ New Stock Movement</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("grnPO")}>＋ Receive Goods</button>
        </div>
      </div>

      {/* KPI row — 8 cards, 2 rows of 4 (WH-001 spec §KPI strip) */}
      <div className="kpi-row-8">
        {WH_KPIS.slice(0,4).map(k => {
          const restricted = k.restricted && !canSeeValue;
          return (
            <div key={k.k} className={"kpi " + k.accent + (restricted ? " kpi-locked" : "")} onClick={()=>!restricted && onNav(k.target)}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{restricted ? "🔒" : k.value}</div>
              <div className="kpi-sub">{restricted ? "Restricted to Manager / Admin" : k.sub}</div>
            </div>
          );
        })}
      </div>
      <div className="kpi-row-8">
        {WH_KPIS.slice(4).map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={()=>onNav(k.target)}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Main two-column: left=alerts+expiry, right=activity */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:12}}>
        {/* LEFT column */}
        <div>
          {/* Alerts panel */}
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">⚠ Alerts</h3>
              <span className="badge badge-gray" style={{fontSize:10}}>{visibleAlerts.length} active</span>
            </div>
            <div>
              {visibleAlerts.length === 0 && (
                <div className="alert-green alert-box" style={{fontSize:12}}>✓ No alerts. All systems nominal.</div>
              )}
              {visibleAlerts.map(a => (
                <div key={a.code} className={"alert-box alert-" + a.severity} style={{marginBottom:6, fontSize:12, padding:"8px 12px"}}>
                  <span>⚠</span>
                  <div style={{flex:1}}>
                    <div>{a.text}</div>
                    <div style={{fontSize:10, color:"var(--muted)", marginTop:3, fontFamily:"var(--font-mono)"}}>{a.code}</div>
                  </div>
                  <div className="alert-cta">
                    {a.cta && <button className="btn btn-sm btn-primary" onClick={()=>openModal("forceUnlock")}>{a.cta}</button>}
                    <button className="btn btn-sm btn-secondary" onClick={()=>onNav(a.link)}>View →</button>
                    <button className="btn btn-sm btn-ghost" onClick={()=>dismiss(a.code)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Expiry summary widget */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">⏰ Expiry summary</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("expiry")}>Open expiry dashboard →</button>
            </div>
            <div className="exp-strip">
              <div className="exp-card red" onClick={()=>onNav("expiry")} style={{cursor:"pointer"}}>
                <div className="ex-big">12</div>
                <div className="ex-lab">LP(s) expiring ≤ 7 days</div>
                <div className="ex-sub">Red tier · Review before picking</div>
              </div>
              <div className="exp-card amber" onClick={()=>onNav("expiry")} style={{cursor:"pointer"}}>
                <div className="ex-big">47</div>
                <div className="ex-lab">LP(s) expiring ≤ 30 days</div>
                <div className="ex-sub">Amber tier · FEFO priority</div>
              </div>
            </div>

            <div className="label" style={{marginBottom:6}}>Top 5 soonest-expiring</div>
            <table>
              <thead><tr><th>LP</th><th>Product</th><th>Batch</th><th>Expiry</th><th>Location</th><th>Status</th></tr></thead>
              <tbody>
                {WH_EXPIRY_TOP5.map(e => (
                  <tr key={e.lp} style={{cursor:"pointer"}} onClick={()=>onOpenLp(e.lp)}>
                    <td className="mono" style={{fontWeight:600}}>{e.lp}</td>
                    <td style={{fontSize:11}}>{e.product}</td>
                    <td className="mono" style={{fontSize:11}}>{e.batch}</td>
                    <td><ExpiryCell date={e.exp} days={e.days}/></td>
                    <td><Ltree path={["...",e.loc.split(" › ")[0], e.loc.split(" › ")[1]]}/></td>
                    <td><LPStatus s={e.status}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Intermediate buffer quick-widget */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">▤ Intermediate buffer (awaiting consumption)</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("inventory")}>Open inventory →</button>
            </div>
            <table>
              <thead><tr><th>LP</th><th>Product</th><th style={{textAlign:"right"}}>Qty</th><th>Location</th><th>Origin WO</th><th>Expires</th></tr></thead>
              <tbody>
                {WH_LPS.filter(l => l.itemType === "intermediate" && l.status === "available").map(l => (
                  <tr key={l.lp} style={{cursor:"pointer"}} onClick={()=>onOpenLp(l.lp)}>
                    <td className="mono" style={{fontWeight:600}}>{l.lp}</td>
                    <td style={{fontSize:11}}>{l.productName}</td>
                    <td className="num mono">{l.qty} {l.uom}</td>
                    <td><Ltree path={l.loc}/></td>
                    <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{l.woRef}</td>
                    <td><ExpiryCell date={l.expiry} days={3}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{fontSize:11, marginTop:6, padding:"6px 0 0"}}>
              Intermediate LPs always go to stock. Downstream WOs consume via scanner scan-to-WO — no reservation created.
            </div>
          </div>
        </div>

        {/* RIGHT column — Activity */}
        <div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Recent activity</h3>
              <select value={feedFilter} onChange={e=>setFeedFilter(e.target.value)} style={{width:"auto", fontSize:11, padding:"3px 6px"}}>
                <option value="all">All</option>
                <option value="split">Split / Merge</option>
                <option value="move">Move</option>
                <option value="consume">Consume</option>
                <option value="output">Output</option>
                <option value="receipt">Receipt</option>
              </select>
            </div>
            <div className="activity-feed">
              {filteredFeed.map((e, i) => (
                <div key={i} className="tl-item">
                  <span className={"tl-dot " + e.color}></span>
                  <div>
                    <div><span className="mono" style={{fontWeight:600, fontSize:11, color:"var(--blue)", cursor:"pointer"}} onClick={()=>onOpenLp(e.lp)}>{e.lp}</span> — {e.desc}</div>
                    <div className="tl-sub">{e.sub}</div>
                  </div>
                  <div className="tl-time">{e.t}</div>
                </div>
              ))}
              {filteredFeed.length === 0 && <div className="muted" style={{fontSize:12, textAlign:"center", padding:20}}>No events for this filter.</div>}
            </div>
            <div style={{textAlign:"center", padding:"10px 0 2px"}}>
              <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}}>View all activity →</a>
            </div>
          </div>

          {/* FEFO scoreboard card */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">FEFO override rate (7d)</h3>
              <span className="badge badge-amber" style={{fontSize:10}}>Above target</span>
            </div>
            <div style={{textAlign:"center", padding:"8px 0"}}>
              <div style={{fontSize:34, fontWeight:700, fontFamily:"var(--font-mono)", color:"var(--amber-700)"}}>11.3%</div>
              <div className="muted" style={{fontSize:11}}>Target &lt; 5% · 3 overrides in last 7 days</div>
            </div>
            <table>
              <thead><tr><th>LP</th><th>Reason</th><th>Δ days</th></tr></thead>
              <tbody>
                {WH_FEFO_OVERRIDES.slice(0,3).map((o,i)=>(
                  <tr key={i}><td className="mono" style={{fontSize:11}}>{o.lp}</td><td style={{fontSize:11}}>{o.reason}</td><td className="num mono">+{o.daysLater}d</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { WhDashboard });
