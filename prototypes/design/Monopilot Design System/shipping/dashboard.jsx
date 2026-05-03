// ============ SHIP-022 — Shipping Dashboard ============

const ShDashboard = ({ role, onNav, openModal }) => {
  const [dismissed, setDismissed] = React.useState(new Set());
  const [feedFilter, setFeedFilter] = React.useState("all");

  const dismiss = (code) => { const n = new Set(dismissed); n.add(code); setDismissed(n); };
  const visibleAlerts = SH_ALERTS.filter(a => !dismissed.has(a.code));

  const filteredFeed = feedFilter === "all" ? SH_ACTIVITY : SH_ACTIVITY.filter(e =>
    feedFilter === "ship" ? (e.desc.toLowerCase().includes("ship") || e.desc.toLowerCase().includes("pod")) :
    feedFilter === "pick" ? e.desc.toLowerCase().includes("pick") :
    feedFilter === "pack" ? e.desc.toLowerCase().includes("pack") :
    feedFilter === "hold" ? e.desc.toLowerCase().includes("hold") :
    feedFilter === "alloc" ? e.desc.toLowerCase().includes("alloc") :
    true
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Shipping</a> · Dashboard</div>
          <h1 className="page-title">Shipping — dashboard</h1>
          <div className="muted" style={{fontSize:12}}>DC-Factory-A · 28 open SOs · 9 live shipments · <b>Data refreshed 8s ago</b> · Cached 30s · Today: <b>2026-04-21</b></div>
        </div>
        <div className="row-flex">
          <select style={{width:140}}><option>Today</option><option>Last 7 days</option><option>Last 30 days</option></select>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("wave")}>◉ Build wave</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("soCreate")}>＋ Create SO</button>
        </div>
      </div>

      {/* KPI row 1 */}
      <div className="kpi-row-4">
        {SH_KPIS_ROW1.map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={()=>onNav(k.target)}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="kpi-row-4">
        {SH_KPIS_ROW2.map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={()=>onNav(k.target)}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Main two-column: left=alerts + charts, right=activity */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:12}}>
        <div>
          {/* Alerts panel */}
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">⚠ Alerts</h3>
              <span className="badge badge-gray" style={{fontSize:10}}>{visibleAlerts.length} active</span>
            </div>
            <div>
              {visibleAlerts.length === 0 && (
                <div className="alert-green alert-box" style={{fontSize:12}}>✓ All clear.</div>
              )}
              {visibleAlerts.map(a => (
                <div key={a.code} className={"alert-box alert-" + a.severity} style={{marginBottom:6, fontSize:12, padding:"8px 12px"}}>
                  <span>⚠</span>
                  <div style={{flex:1}}>
                    <div>{a.text}</div>
                    <div style={{fontSize:10, color:"var(--muted)", marginTop:3, fontFamily:"var(--font-mono)"}}>{a.code}</div>
                  </div>
                  <div className="alert-cta">
                    {a.cta && <button className="btn btn-sm btn-primary" onClick={()=>onNav(a.link)}>{a.cta}</button>}
                    {!a.cta && <button className="btn btn-sm btn-secondary" onClick={()=>onNav(a.link)}>View →</button>}
                    <button className="btn btn-sm btn-ghost" onClick={()=>dismiss(a.code)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Charts row — 3 cards */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:12}}>
            <div className="card">
              <div className="card-head"><h3 className="card-title">Orders by status</h3></div>
              <div style={{fontSize:11}}>
                {[
                  { s:"draft",     n: 3,  cls:"badge-gray"   },
                  { s:"confirmed", n: 2,  cls:"badge-blue"   },
                  { s:"allocated", n: 4,  cls:"so-status allocated"   },
                  { s:"picking",   n: 2,  cls:"so-status picking"     },
                  { s:"packing",   n: 2,  cls:"so-status packing"     },
                  { s:"packed",    n: 1,  cls:"so-status packed"     },
                  { s:"shipped",   n: 3,  cls:"so-status shipped"    },
                  { s:"delivered", n: 2,  cls:"so-status delivered"  },
                ].map(b => (
                  <div key={b.s} style={{display:"flex", alignItems:"center", gap:8, marginBottom:5}}>
                    <span style={{width:70, fontSize:10, textTransform:"capitalize", color:"var(--muted)"}}>{b.s}</span>
                    <div style={{flex:1, height:14, background:"var(--gray-100)", borderRadius:3, overflow:"hidden"}}>
                      <span style={{display:"block", height:"100%", width:(b.n*12)+"%", background:"var(--blue)"}}></span>
                    </div>
                    <span className="mono" style={{fontSize:10, width:20, textAlign:"right"}}>{b.n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h3 className="card-title">Shipments by day (7d)</h3></div>
              <div style={{display:"flex", gap:6, alignItems:"flex-end", height:120, padding:"10px 6px"}}>
                {[6,4,7,5,8,3,9].map((n,i) => (
                  <div key={i} style={{flex:1, textAlign:"center"}}>
                    <div style={{background:"var(--blue)", height:n*10, borderRadius:"3px 3px 0 0"}}></div>
                    <div style={{fontSize:9, color:"var(--muted)", marginTop:3, fontFamily:"var(--font-mono)"}}>{["M","T","W","T","F","S","S"][i]}</div>
                    <div style={{fontSize:9, fontFamily:"var(--font-mono)", fontWeight:600}}>{n}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:10, color:"var(--muted)", textAlign:"center"}}>Avg 6.0/day · today trending up</div>
            </div>
            <div className="card">
              <div className="card-head"><h3 className="card-title">On-time delivery % (30d)</h3></div>
              <div style={{position:"relative", height:120, padding:"10px 6px"}}>
                <svg viewBox="0 0 280 100" style={{width:"100%", height:"100%"}}>
                  <line x1="0" y1="25" x2="280" y2="25" stroke="var(--green)" strokeDasharray="3,3" strokeWidth="1"/>
                  <text x="4" y="22" fill="var(--green)" fontSize="8" fontFamily="monospace">95%</text>
                  <polyline points="0,35 40,42 80,28 120,32 160,22 200,18 240,22 280,20" fill="none" stroke="var(--blue)" strokeWidth="2"/>
                  {[0,40,80,120,160,200,240,280].map((x,i)=>(
                    <circle key={i} cx={x} cy={[35,42,28,32,22,18,22,20][i]} r="2.5" fill="var(--blue)"/>
                  ))}
                </svg>
              </div>
              <div style={{fontSize:10, color:"var(--muted)", textAlign:"center"}}>Current: 96.4% · trending above target</div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">Quick actions</h3>
            </div>
            <div className="row-flex" style={{gap:8, flexWrap:"wrap"}}>
              <button className="btn btn-secondary btn-sm" onClick={()=>openModal("soCreate")}>＋ Create SO</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>onNav("wave")}>◉ Build wave</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>onNav("packing")}>▣ Open packing</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>onNav("sscc")}>🏷 Print SSCC queue</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>openModal("bolSign")}>⇪ Upload signed BOL</button>
              <button className="btn btn-secondary btn-sm" onClick={()=>openModal("customerCreate")}>＋ Add customer</button>
            </div>
          </div>
        </div>

        {/* Right column — Activity */}
        <div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Recent activity</h3>
              <select value={feedFilter} onChange={e=>setFeedFilter(e.target.value)} style={{width:"auto", fontSize:11, padding:"3px 6px"}}>
                <option value="all">All</option>
                <option value="ship">Ship / POD</option>
                <option value="pick">Pick</option>
                <option value="pack">Pack</option>
                <option value="alloc">Allocate</option>
                <option value="hold">Hold</option>
              </select>
            </div>
            <div className="activity-feed">
              {filteredFeed.map((e, i) => (
                <div key={i} className="tl-item">
                  <span className={"tl-dot " + e.color}></span>
                  <div>
                    <div><span className="mono" style={{fontWeight:600, fontSize:11, color:"var(--blue)", cursor:"pointer"}}>{e.ref}</span> — {e.desc}</div>
                    <div className="tl-sub">{e.sub}</div>
                  </div>
                  <div className="tl-time">{e.t}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:"center", padding:"10px 0 2px"}}>
              <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}}>View full audit log →</a>
            </div>
          </div>

          {/* D365 outbox card */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">D365 outbox</h3>
              <span className="badge badge-amber" style={{fontSize:10}}>1 DLQ</span>
            </div>
            <div style={{fontSize:11, lineHeight:1.7}}>
              <div className="row-flex"><span>Queued events (shipping)</span><span className="spacer"></span><b className="mono">3</b></div>
              <div className="row-flex"><span>Published today</span><span className="spacer"></span><b className="mono" style={{color:"var(--green-700)"}}>18</b></div>
              <div className="row-flex"><span>Failed (in retry)</span><span className="spacer"></span><b className="mono" style={{color:"var(--amber-700)"}}>1</b></div>
              <div className="row-flex"><span>Dead-letter queue</span><span className="spacer"></span><b className="mono" style={{color:"var(--red-700)"}}>1</b></div>
            </div>
            <div style={{fontSize:10, color:"var(--muted)", marginTop:8, padding:"6px 8px", background:"var(--gray-050)", borderRadius:4}}>
              Stage 3 dispatcher · Retry 5m / 30m / 2h / 12h / 24h · Adapter <span className="mono">@monopilot/d365-shipping-adapter</span> · Flag <span className="mono">d365_shipping_push_enabled=ON</span>
            </div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:8, width:"100%"}} onClick={()=>onNav("settings")}>Open D365 settings →</button>
          </div>

          {/* GS1 & printers status */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">Label infrastructure</h3>
            </div>
            <div style={{fontSize:11, lineHeight:1.8}}>
              <div className="row-flex"><span>GS1 Company Prefix</span><span className="spacer"></span><b className="mono">5012345</b></div>
              <div className="row-flex"><span>Next SSCC sequence</span><span className="spacer"></span><b className="mono">00000048</b></div>
              <div className="row-flex"><span>Labels printed today</span><span className="spacer"></span><b className="mono">14</b></div>
              <div className="row-flex"><span>Labels queued</span><span className="spacer"></span><b className="mono" style={{color:"var(--amber-700)"}}>6</b></div>
            </div>
            <div style={{fontSize:11, marginTop:8, padding:"6px 8px", background:"var(--amber-050a)", borderRadius:4, color:"var(--amber-700)"}}>
              ⚠ Printer <b className="mono">ZPL-SH-02</b> offline (Cold zone) — 6 labels queued.
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { ShDashboard });
