// ============ SCREEN-04 / SCREEN-05 — Transfer Orders ============

const PlanTOList = ({ onOpenTo, onNav }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [modal, setModal] = React.useState(null);

  const tabs = [
    { k: "all",               l: "All",               c: PLAN_TOS.length },
    { k: "draft",             l: "Draft",             c: PLAN_TOS.filter(t => t.status === "draft").length },
    { k: "planned",           l: "Planned",           c: PLAN_TOS.filter(t => t.status === "planned").length },
    { k: "partially_shipped", l: "Partially shipped", c: PLAN_TOS.filter(t => t.status === "partially_shipped").length },
    { k: "shipped",           l: "Shipped",           c: PLAN_TOS.filter(t => t.status === "shipped").length },
    { k: "received",          l: "Received",          c: PLAN_TOS.filter(t => t.status === "received").length },
    { k: "closed",            l: "Closed",            c: PLAN_TOS.filter(t => t.status === "closed").length },
  ];

  const visible = PLAN_TOS.filter(t =>
    (tab === "all" || t.status === tab) &&
    (!search || t.id.toLowerCase().includes(search.toLowerCase()))
  );

  const openCount = PLAN_TOS.filter(t => !["closed","cancelled","received"].includes(t.status)).length;
  const inTransit = PLAN_TOS.filter(t => ["shipped","partially_shipped","partially_received"].includes(t.status)).length;
  const overdueCount = PLAN_TOS.filter(t => t.overdue).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Transfer orders</div>
          <h1 className="page-title">Transfer orders</h1>
          <div className="muted" style={{fontSize:12}}>{PLAN_TOS.length} TOs · {inTransit} in transit · {overdueCount} overdue</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setModal("toCreate")}>＋ Create TO</button>
        </div>
      </div>

      <TOCreateModal open={modal === "toCreate"} onClose={()=>setModal(null)}/>

      <div className="kpi-row-8">
        <div className="kpi"><div className="kpi-label">Open TOs</div><div className="kpi-value">{openCount}</div><div className="kpi-sub">Inter-warehouse transfers</div></div>
        <div className="kpi green"><div className="kpi-label">In transit</div><div className="kpi-value">{inTransit}</div><div className="kpi-sub">Shipped / partial</div></div>
        <div className="kpi red"><div className="kpi-label">Overdue</div><div className="kpi-value">{overdueCount}</div><div className="kpi-sub">Past ship date</div></div>
        <div className="kpi"><div className="kpi-label">This week</div><div className="kpi-value">{PLAN_TOS.length}</div><div className="kpi-sub">Created 2026-W17</div></div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>
            {t.l} <span className="count">{t.c}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search TO number…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
        <select style={{width:160}}><option>All from warehouses</option><option>WH-Factory-A</option><option>WH-Factory-B</option><option>WH-Cold-01</option></select>
        <select style={{width:160}}><option>All to warehouses</option><option>WH-DistCentral</option><option>WH-DistNorth</option><option>WH-DistSouth</option><option>WH-Factory-A</option><option>WH-Factory-B</option></select>
        <select style={{width:130}}><option>All priorities</option><option>Urgent</option><option>High</option><option>Normal</option><option>Low</option></select>
        <select style={{width:140}}><option>Next 7 days</option><option>Today</option><option>This week</option><option>Overdue</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear all filters</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr>
            <th>TO number</th><th>From</th><th>To</th>
            <th>Planned ship</th><th>Planned receive</th>
            <th>Priority</th><th>Status</th><th style={{textAlign:"right"}}>Lines</th>
            <th style={{width:90}}></th>
          </tr></thead>
          <tbody>
            {visible.map(t => (
              <tr key={t.id} className={t.overdue ? "row-overdue" : ""} onClick={()=>onOpenTo(t.id)} style={{cursor:"pointer"}}>
                <td className="mono" style={{fontWeight:600}}>{t.id}</td>
                <td className="mono">{t.from}</td>
                <td className="mono">{t.to}</td>
                <td className="mono" style={{fontSize:12}}>{t.ship}<div className="muted" style={{fontSize:10, color: t.overdue ? "var(--red-700)" : "var(--muted)"}}>{t.overdue ? `Overdue ${t.overdue}d` : t.shipRel}</div></td>
                <td className="mono" style={{fontSize:12}}>{t.recv}<div className="muted" style={{fontSize:10}}>{t.recvRel}</div></td>
                <td><Priority p={t.priority}/></td>
                <td><TOStatus s={t.status}/></td>
                <td className="num mono">{t.lines}</td>
                <td onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm">View</button>
                  <button className="btn btn-ghost btn-sm">⋯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ SCREEN-05 — TO Detail ============

const PlanTODetail = ({ onBack, onNav }) => {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [lpOpen, setLpOpen] = React.useState(true);
  const [modal, setModal] = React.useState(null);
  const t = PLAN_TO_DETAIL;

  const actions = {
    draft:              [["Edit","secondary"],["Cancel","danger"]],
    planned:            [["Edit","secondary"],["Cancel","danger"],["Ship","primary"]],
    partially_shipped:  [["Ship remaining","primary"],["Receive","secondary"]],
    shipped:            [["Receive","primary"]],
    partially_received: [["Receive remaining","primary"]],
  }[t.status] || [];

  return (
    <>
      <div className="breadcrumb" style={{marginBottom:6}}>
        <a onClick={()=>onNav("dashboard")}>Planning</a> · <a onClick={onBack}>Transfer orders</a> · <span className="mono">{t.id}</span>
      </div>

      <div className="wo-head">
        <div className="wo-head-top">
          <div>
            <div className="wo-head-title">
              <span className="wo-head-code">{t.id}</span>
              <span className="wo-head-name">{t.from} → {t.to}</span>
              <TOStatus s={t.status}/>
              <Priority p={t.priority}/>
            </div>
            <div className="muted" style={{fontSize:12, marginTop:3}}>
              Planned ship <b className="mono">{t.plannedShip}</b>
              &nbsp;·&nbsp; Planned receive <b className="mono">{t.plannedRecv}</b>
              &nbsp;·&nbsp; {t.lines.length} lines
            </div>
          </div>
          <div className="wo-head-actions">
            {actions.map(([l, k]) => {
              const handler =
                l === "Edit" ? () => setModal("toEdit") :
                l === "Ship" ? () => setModal("shipTo") :
                l === "Ship remaining" ? () => setModal("shipTo") :
                undefined;
              return <button key={l} className={"btn btn-" + k + " btn-sm"} onClick={handler}>{l}</button>;
            })}
          </div>
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 340px", gap:12, alignItems:"flex-start"}}>
        <div>
          <div className="card" style={{padding:0}}>
            <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
              <h3 className="card-title">TO lines · {t.lines.length}</h3>
              <button className="btn btn-secondary btn-sm">＋ Add line</button>
            </div>
            <table>
              <thead><tr>
                <th style={{width:30}}>#</th><th>Product</th>
                <th style={{textAlign:"right"}}>Qty</th><th>UoM</th>
                <th>Shipped</th><th>Received</th><th>Status</th>
              </tr></thead>
              <tbody>
                {t.lines.map(l => {
                  const shipPct = l.qty ? (l.shipped / l.qty * 100) : 0;
                  const recPct = l.shipped ? (l.received / l.shipped * 100) : 0;
                  return (
                    <tr key={l.seq}>
                      <td className="mono">{l.seq}</td>
                      <td>
                        <div style={{fontWeight:500}}>{l.product}</div>
                        <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{l.code}</div>
                      </td>
                      <td className="num mono">{l.qty}</td>
                      <td className="mono">{l.uom}</td>
                      <td style={{minWidth:120}}>
                        <div className="mono" style={{fontSize:11}}>{l.shipped} / {l.qty}</div>
                        <div className="cell-bar green" style={{width:100}}><span style={{width:shipPct+"%"}}></span></div>
                      </td>
                      <td style={{minWidth:120}}>
                        <div className="mono" style={{fontSize:11}}>{l.received} / {l.shipped}</div>
                        <div className="cell-bar green" style={{width:100}}><span style={{width:recPct+"%"}}></span></div>
                      </td>
                      <td>
                        {l.status === "pending" && <span className="badge badge-gray" style={{fontSize:10}}>Pending</span>}
                        {l.status === "partially_shipped" && <span className="badge badge-amber" style={{fontSize:10}}>Partially shipped</span>}
                        {l.status === "shipped" && <span className="badge badge-green" style={{fontSize:10}}>Shipped</span>}
                        {l.status === "received" && <span className="badge badge-green" style={{fontSize:10}}>Received</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-head" style={{cursor:"pointer"}} onClick={()=>setLpOpen(!lpOpen)}>
              <h3 className="card-title">{lpOpen ? "▾" : "▸"} LP breakdown</h3>
              <div className="row-flex">
                <span className="muted" style={{fontSize:11}}>{t.lps.length} LPs reserved</span>
                <button className="btn btn-secondary btn-sm" onClick={e=>e.stopPropagation()}>＋ Add LP</button>
              </div>
            </div>
            {lpOpen && (
              <table>
                <thead><tr><th>TO line</th><th>LP number</th><th style={{textAlign:"right"}}>Qty</th><th>LP status</th></tr></thead>
                <tbody>
                  {t.lps.map((lp,i) => (
                    <tr key={i}>
                      <td className="mono">Line {lp.line}</td>
                      <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{lp.lp}</td>
                      <td className="num mono">{lp.qty} kg</td>
                      <td>
                        {lp.status === "reserved"
                          ? <span className="badge badge-blue" style={{fontSize:10}}>Reserved</span>
                          : <span className="badge badge-green" style={{fontSize:10}}>Available</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Notes</h3></div>
            <div style={{fontSize:12}}>{t.notes}</div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">TO summary</h3></div>
            <div style={{fontSize:12, display:"grid", gap:8}}>
              <div className="row-flex"><span className="muted">TO number</span><span className="spacer"></span><span className="mono" style={{fontWeight:600}}>{t.id}</span></div>
              <div className="row-flex"><span className="muted">From</span><span className="spacer"></span><span className="mono">{t.from}</span></div>
              <div className="row-flex"><span className="muted">To</span><span className="spacer"></span><span className="mono">{t.to}</span></div>
              <div className="row-flex"><span className="muted">Priority</span><span className="spacer"></span><Priority p={t.priority}/></div>
              <div className="row-flex"><span className="muted">Planned ship</span><span className="spacer"></span><span className="mono">{t.plannedShip}</span></div>
              <div className="row-flex"><span className="muted">Planned receive</span><span className="spacer"></span><span className="mono">{t.plannedRecv}</span></div>
              <div className="row-flex"><span className="muted">Actual ship</span><span className="spacer"></span>{t.actualShip ? <span className="mono">{t.actualShip}</span> : <span className="muted">—</span>}</div>
              <div className="row-flex"><span className="muted">Actual receive</span><span className="spacer"></span>{t.actualRecv ? <span className="mono">{t.actualRecv}</span> : <span className="muted">—</span>}</div>
              <div className="row-flex"><span className="muted">Shipped by</span><span className="spacer"></span>{t.shippedBy || <span className="muted">—</span>}</div>
              <div className="row-flex"><span className="muted">Received by</span><span className="spacer"></span>{t.receivedBy || <span className="muted">—</span>}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head" style={{cursor:"pointer"}} onClick={()=>setHistoryOpen(!historyOpen)}>
              <h3 className="card-title">{historyOpen ? "▾" : "▸"} Status history</h3>
              <span className="muted" style={{fontSize:11}}>{t.history.length} events</span>
            </div>
            {historyOpen && (
              <div style={{fontSize:12}}>
                {t.history.map((h,i) => (
                  <div key={i} style={{padding:"8px 0", borderBottom: i < t.history.length - 1 ? "1px solid var(--border)" : "0"}}>
                    <div className="row-flex">
                      {h.from ? <TOStatus s={h.from}/> : <span className="muted">—</span>}
                      <span style={{color:"var(--muted)"}}>→</span>
                      <TOStatus s={h.to}/>
                      <span className="spacer"></span>
                      <span className="mono" style={{fontSize:11, color:"var(--muted)"}}>{h.t}</span>
                    </div>
                    <div className="muted" style={{fontSize:11, marginTop:2}}>{h.user} · {h.action}{h.notes ? ` · ${h.notes}` : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <TOCreateModal open={modal === "toEdit"} onClose={()=>setModal(null)} editing={t}/>
      <ShipTOModal open={modal === "shipTo"} onClose={()=>setModal(null)} to={t}/>
    </>
  );
};

Object.assign(window, { PlanTOList, PlanTODetail });
