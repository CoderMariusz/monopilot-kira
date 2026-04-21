// ============ SCREEN-01 — Planning Dashboard ============

const PlanDashboard = ({ onNav, onOpenWo }) => {
  const [upTab, setUpTab] = React.useState("wos");
  const [dismissed, setDismissed] = React.useState(new Set());

  const dismiss = (key) => {
    const next = new Set(dismissed);
    next.add(key);
    setDismissed(next);
  };
  const visiblePo = PO_ALERTS.filter(a => !dismissed.has("po:" + a.code));
  const visibleWo = WO_ALERTS.filter(a => !dismissed.has("wo:" + a.code));
  const visibleTo = TO_ALERTS.filter(a => !dismissed.has("to:" + a.code));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Planning</a> · Dashboard</div>
          <h1 className="page-title">Planning — dashboard</h1>
          <div className="muted" style={{fontSize:12}}>Factory-A · 42 POs · 11 TOs · 28 WOs · <b>Data refreshed 14s ago</b> · Cached 1 min</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("sequencing")}>Run sequencing</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("d365_queue")}>Trigger D365 pull</button>
          <button className="btn btn-primary btn-sm" onClick={()=>onNav("wos")}>＋ Create WO</button>
        </div>
      </div>

      {/* KPI row — 8 cards, 2 rows of 4 */}
      <div className="kpi-row-8">
        {PLAN_KPIS.slice(0,4).map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={()=>onNav(k.target)}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="kpi-row-8">
        {PLAN_KPIS.slice(4).map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={()=>onNav(k.target)}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="quick-strip">
        <button className="btn btn-secondary btn-sm" onClick={()=>onNav("pos")}>＋ Create PO</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>onNav("tos")}>＋ Create TO</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>onNav("wos")}>＋ Create WO</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>onNav("pos")}>⇪ Bulk import PO</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>onNav("sequencing")}>↯ Run sequencing</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>onNav("d365_queue")}>⇅ Trigger D365 pull</button>
      </div>

      {/* Alert columns — 3 col */}
      <div className="alert-cols">
        <div className="alert-col red">
          <div className="alert-col-head">
            <span>⚠</span> PO alerts
            <span className="ac-count">{visiblePo.length}</span>
          </div>
          <div className="alert-col-body">
            {visiblePo.length === 0 && <div className="alert-col-empty">✓ No PO alerts</div>}
            {visiblePo.map(a => (
              <div key={a.code} className="alert-item">
                <div>
                  <div className="ai-code">{a.code}</div>
                  <div className="ai-sub">{a.supplier}</div>
                  <div className="ai-reason" style={{color: a.severity === "red" ? "var(--red-700)" : "var(--amber-700)"}}>{a.reason}</div>
                  <div className="ai-link" onClick={()=>onNav("pos")}>View PO →</div>
                </div>
                <button className="ai-dismiss" onClick={()=>dismiss("po:"+a.code)} title="Dismiss">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="alert-col amber">
          <div className="alert-col-head">
            <span>⚠</span> WO alerts
            <span className="ac-count">{visibleWo.length}</span>
          </div>
          <div className="alert-col-body">
            {visibleWo.length === 0 && <div className="alert-col-empty">✓ No WO alerts</div>}
            {visibleWo.map(a => (
              <div key={a.code} className="alert-item">
                <div>
                  <div className="ai-code">{a.code}</div>
                  <div className="ai-sub">{a.product}</div>
                  <div className="ai-reason" style={{color: a.severity === "red" ? "var(--red-700)" : "var(--amber-700)"}}>{a.reason}</div>
                  <div className="ai-link" onClick={()=>onOpenWo(a.code)}>View WO →</div>
                </div>
                <button className="ai-dismiss" onClick={()=>dismiss("wo:"+a.code)} title="Dismiss">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="alert-col orange">
          <div className="alert-col-head">
            <span>⚠</span> TO alerts
            <span className="ac-count">{visibleTo.length}</span>
          </div>
          <div className="alert-col-body">
            {visibleTo.length === 0 && <div className="alert-col-empty">✓ No TO alerts</div>}
            {visibleTo.map(a => (
              <div key={a.code} className="alert-item">
                <div>
                  <div className="ai-code">{a.code}</div>
                  <div className="ai-sub">{a.from} → {a.to}</div>
                  <div className="ai-reason" style={{color:"var(--amber-700)"}}>{a.reason}</div>
                  <div className="ai-link" onClick={()=>onNav("tos")}>Track →</div>
                </div>
                <button className="ai-dismiss" onClick={()=>dismiss("to:"+a.code)} title="Dismiss">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* D365 drift alert (info band) */}
      <div className="alert-blue alert-box" style={{marginBottom:12}}>
        <strong>1 D365 sync conflict requires admin review</strong>
        <span className="muted">· PO-2026-00046 Premium Dairy Ltd. — local edit after last sync</span>
        <div className="alert-cta">
          <button className="btn btn-sm btn-secondary">Dismiss</button>
          <button className="btn btn-sm btn-primary" onClick={()=>onNav("settings")}>Open D365 admin →</button>
        </div>
      </div>

      {/* Upcoming + Recent activity — two columns */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:12}}>
        <div className="card">
          <div className="card-head" style={{marginBottom:0, paddingBottom:0}}>
            <div className="upcoming-tabs" style={{border:0, margin:0, padding:0}}>
              <button className={upTab==="pos"?"on":""} onClick={()=>setUpTab("pos")}>PO calendar <span className="count-chip">{UPCOMING_POS.length}</span></button>
              <button className={upTab==="wos"?"on":""} onClick={()=>setUpTab("wos")}>WO schedule <span className="count-chip">{UPCOMING_WOS.length}</span></button>
              <button className={upTab==="tos"?"on":""} onClick={()=>setUpTab("tos")}>TO timeline <span className="count-chip">{UPCOMING_TOS.length}</span></button>
              <button className={upTab==="cascade"?"on":""} onClick={()=>setUpTab("cascade")}>Cascade chains <span className="count-chip">{CASCADE_CHAINS.length}</span></button>
            </div>
            <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          </div>

          {upTab === "pos" && (
            <table>
              <thead><tr><th>PO</th><th>Supplier</th><th>Expected</th><th style={{textAlign:"right"}}>Lines</th><th>Status</th><th style={{textAlign:"right"}}>Total</th><th></th></tr></thead>
              <tbody>
                {UPCOMING_POS.map(p => (
                  <tr key={p.code} style={{cursor:"pointer"}} onClick={()=>onNav("pos")}>
                    <td className="mono" style={{fontWeight:600}}>{p.code}{p.drift && <span className="drift-tag">D365 drift</span>}</td>
                    <td>{p.supplier}</td>
                    <td>
                      <div className="mono" style={{fontSize:12}}>{p.exp}</div>
                      <div className="muted" style={{fontSize:11}}>{p.rel}</div>
                    </td>
                    <td className="num mono">{p.lines}</td>
                    <td><POStatus s={p.status} /></td>
                    <td className="num mono">{p.total}</td>
                    <td onClick={e=>e.stopPropagation()}><button className="btn btn-ghost btn-sm">⋯</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {upTab === "wos" && (
            <table>
              <thead><tr><th>WO</th><th>Product</th><th>Scheduled</th><th>Line</th><th>Status</th><th>Priority</th><th>Avail.</th></tr></thead>
              <tbody>
                {UPCOMING_WOS.map(w => (
                  <tr key={w.code} style={{cursor:"pointer"}} onClick={()=>onOpenWo(w.code)}>
                    <td className="mono" style={{fontWeight:600}}>{w.code}<SourceBadge s={w.source} /></td>
                    <td>
                      <div style={{fontWeight:500, fontSize:13}}>{w.product}</div>
                      <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{w.item}</div>
                    </td>
                    <td>
                      <div className="mono" style={{fontSize:12}}>{w.date.slice(11)}</div>
                      <div className="muted" style={{fontSize:11}}>{w.rel}</div>
                    </td>
                    <td className="mono">{w.line}</td>
                    <td><WOPlanStatus s={w.status} /></td>
                    <td><Priority p={w.priority} /></td>
                    <td><Avail v={w.avail} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {upTab === "tos" && (
            <table>
              <thead><tr><th>TO</th><th>From</th><th>To</th><th>Ship</th><th>Receive</th><th>Status</th></tr></thead>
              <tbody>
                {UPCOMING_TOS.map(t => (
                  <tr key={t.code} style={{cursor:"pointer"}} onClick={()=>onNav("tos")}>
                    <td className="mono" style={{fontWeight:600}}>{t.code}</td>
                    <td className="mono">{t.from}</td>
                    <td className="mono">{t.to}</td>
                    <td className="mono">{t.ship}</td>
                    <td className="mono">{t.recv}</td>
                    <td><TOStatus s={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {upTab === "cascade" && (
            <div style={{padding:"8px 0"}}>
              {CASCADE_CHAINS.map(c => (
                <div key={c.root} className="cascade-tile" onClick={()=>onNav("cascade")}>
                  <div className="cascade-head">
                    <span className="cascade-root">{c.root}</span>
                    <span style={{fontSize:12}}>{c.rootName}</span>
                    <span className="cascade-pct">{c.pct}% · {c.total} WOs · {c.depth} layers</span>
                  </div>
                  <div className="cascade-bar"><span style={{width: c.pct + "%"}}></span></div>
                  <div className="cascade-meta">Root FA · depth {c.depth} · {c.total} work orders in chain</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Recent activity */}
        <div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Recent activity</h3>
              <span className="badge badge-gray" style={{fontSize:10}}>Last 10</span>
            </div>
            <div className="activity-feed">
              {ACTIVITY_FEED.map((e,i) => (
                <div key={i} className="tl-item">
                  <span className={"tl-dot " + e.color}></span>
                  <div>
                    <div><span className="mono" style={{fontWeight:600, fontSize:11}}>{e.code}</span> — {e.desc}</div>
                    <div className="tl-sub">{e.sub}</div>
                  </div>
                  <div className="tl-time">{e.t}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:"center", padding:"10px 0 2px"}}>
              <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}}>View all activity →</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { PlanDashboard });
