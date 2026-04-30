// ============ SCREEN-02 / SCREEN-03 — Purchase Orders ============

const PlanPOList = ({ onOpenPo, onNav }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());

  const tabs = [
    { k: "all",              l: "All",              c: PLAN_POS.length },
    { k: "draft",            l: "Draft",            c: PLAN_POS.filter(p => p.status === "draft").length },
    { k: "submitted",        l: "Submitted",        c: PLAN_POS.filter(p => p.status === "submitted").length },
    { k: "pending_approval", l: "Pending approval", c: PLAN_POS.filter(p => p.status === "pending_approval").length },
    { k: "confirmed",        l: "Confirmed",        c: PLAN_POS.filter(p => p.status === "confirmed").length },
    { k: "receiving",        l: "Receiving",        c: PLAN_POS.filter(p => p.status === "receiving").length },
    { k: "closed",           l: "Closed",           c: PLAN_POS.filter(p => p.status === "closed").length },
  ];

  const visible = PLAN_POS.filter(p =>
    (tab === "all" || p.status === tab) &&
    (!search || p.id.toLowerCase().includes(search.toLowerCase()) || p.supplier.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (id) => {
    const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(p => p.id)));
  };

  const overdueCount = PLAN_POS.filter(p => p.overdue).length;
  const pendingCount = PLAN_POS.filter(p => p.status === "pending_approval").length;
  const openCount = PLAN_POS.filter(p => !["closed","cancelled"].includes(p.status)).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Purchase orders</div>
          <h1 className="page-title">Purchase orders</h1>
          <div className="muted" style={{fontSize:12}}>{PLAN_POS.length} POs · {overdueCount} overdue · {pendingCount} pending approval</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Bulk import</button>
          <button className="btn btn-primary btn-sm">＋ Create PO</button>
        </div>
      </div>

      <div className="kpi-row-8">
        <div className="kpi"><div className="kpi-label">Open POs</div><div className="kpi-value">{openCount}</div><div className="kpi-sub">Total value: £186 420</div></div>
        <div className="kpi amber"><div className="kpi-label">Pending approval</div><div className="kpi-value">{pendingCount}</div><div className="kpi-sub">Avg wait: 2.3 days · Target &lt; 5</div></div>
        <div className="kpi red"><div className="kpi-label">Overdue</div><div className="kpi-value">{overdueCount}</div><div className="kpi-sub">Action required · Target 0</div></div>
        <div className="kpi"><div className="kpi-label">This month created</div><div className="kpi-value">24</div><div className="kpi-sub">+4 vs April 2025</div></div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>
            {t.l} <span className="count">{t.c}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search PO number, supplier…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:260}}/>
        <select style={{width:180}}><option>All suppliers</option><option>Agro-Fresh Ltd.</option><option>Baltic Pork Co.</option><option>Spice Masters</option><option>Viscofan S.A.</option><option>Hellmann Logistics</option><option>Premium Dairy Ltd.</option></select>
        <select style={{width:140}}><option>Next 14 days</option><option>Today</option><option>This week</option><option>Overdue</option><option>This month</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear all filters</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      {selected.size > 0 && (
        <div className="card" style={{padding:"8px 14px", marginBottom:10, background:"var(--blue-050)", borderColor:"var(--blue)"}}>
          <div className="row-flex">
            <b>{selected.size} selected</b>
            <span className="spacer"></span>
            <button className="btn btn-secondary btn-sm">Release selected</button>
            <button className="btn btn-secondary btn-sm">Export to Excel</button>
            <button className="btn btn-danger btn-sm">Cancel selected</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr>
            <th style={{width:34}}><input type="checkbox" checked={selected.size > 0 && selected.size === visible.length} onChange={toggleAll}/></th>
            <th>PO number</th>
            <th>Supplier</th>
            <th>Expected delivery</th>
            <th style={{textAlign:"right"}}>Lines</th>
            <th>Status</th>
            <th style={{textAlign:"right"}}>Total</th>
            <th style={{width:90}}></th>
          </tr></thead>
          <tbody>
            {visible.map(p => (
              <tr key={p.id} className={p.overdue ? "row-overdue" : ""} onClick={()=>onOpenPo(p.id)} style={{cursor:"pointer"}}>
                <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(p.id)} onChange={()=>toggle(p.id)}/></td>
                <td className="mono" style={{fontWeight:600}}>
                  {p.id}
                  {p.drift && <span className="drift-tag" title="Local edit differs from last D365 sync — admin resolve required">D365 drift</span>}
                </td>
                <td>
                  <div style={{fontWeight:500}}>{p.supplier}</div>
                  <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{p.supplierCode}</div>
                </td>
                <td className="mono" style={{fontSize:12}}>
                  {p.exp}
                  <div className={"muted " + (p.overdue ? "" : "")} style={{fontSize:10, color: p.overdue ? "var(--red-700)" : "var(--muted)"}}>
                    {p.overdue ? `Overdue ${p.overdue}d` : p.rel}
                  </div>
                </td>
                <td className="num mono">{p.lines}</td>
                <td><POStatus s={p.status}/></td>
                <td className="num mono">{p.total}</td>
                <td onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm">View</button>
                  <button className="btn btn-ghost btn-sm">⋯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-flex" style={{marginTop:10, fontSize:12, color:"var(--muted)"}}>
        <span>Showing {visible.length} of {PLAN_POS.length}</span>
        <span className="spacer"></span>
        <div className="row-flex">
          <button className="btn btn-ghost btn-sm">← Prev</button>
          <span className="mono">1</span> <span className="mono">2</span> <span className="mono muted">3</span>
          <button className="btn btn-ghost btn-sm">Next →</button>
        </div>
      </div>
    </>
  );
};

// ============ SCREEN-03 — PO Detail ============

const PlanPODetail = ({ onBack, onNav }) => {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const p = PLAN_PO_DETAIL;

  const actions = {
    draft:            [["Edit","secondary"],["Cancel","danger"],["Submit","primary"]],
    submitted:        [["Cancel","danger"]],
    pending_approval: [["Cancel","danger"],["Reject","danger"],["Approve","primary"]],
    confirmed:        [["Cancel","danger"]],
    receiving:        [["View GRNs →","primary"]],
    closed:           [["Duplicate","secondary"],["Download PDF","primary"]],
  }[p.status] || [];

  const receivedTotal = p.lines.reduce((a,l) => a + l.received, 0);
  const totalOrdered = p.lines.reduce((a,l) => a + l.qty, 0);
  const receivedPct = totalOrdered ? (receivedTotal / totalOrdered * 100) : 0;

  return (
    <>
      <div className="breadcrumb" style={{marginBottom:6}}>
        <a onClick={()=>onNav("dashboard")}>Planning</a> · <a onClick={onBack}>Purchase orders</a> · <span className="mono">{p.id}</span>
      </div>

      <div className="wo-head">
        <div className="wo-head-top">
          <div>
            <div className="wo-head-title">
              <span className="wo-head-code">{p.id}</span>
              <span className="wo-head-name">{p.supplier}</span>
              <POStatus s={p.status}/>
              <span className="badge badge-gray" style={{fontSize:10}}>Source: {p.sourceType}</span>
            </div>
            <div className="muted" style={{fontSize:12, marginTop:3}}>
              Order date <b>{p.orderDate}</b> &nbsp;·&nbsp; Expected <b>{p.exp}</b>
              &nbsp;·&nbsp; <span className="mono">{p.supplierCode}</span>
              &nbsp;·&nbsp; Warehouse <b className="mono">{p.warehouse}</b>
              &nbsp;·&nbsp; <b className="mono">{p.currency}</b> · {p.paymentTerms}
            </div>
          </div>
          <div className="wo-head-actions">
            {actions.map(([l, k]) => <button key={l} className={"btn btn-" + k + " btn-sm"}>{l}</button>)}
          </div>
        </div>
      </div>

      {p.status === "pending_approval" && (
        <div className="alert-amber alert-box" style={{marginBottom:12}}>
          <span>⏳</span>
          <div>
            <b>Awaiting approval · {p.approvalRole}</b>
            <div style={{fontSize:11, color:"var(--amber-700)"}}>Total £{p.total.toLocaleString()} exceeds threshold £{p.approvalThreshold.toLocaleString()} — approval gate V-PLAN-PO-005.</div>
          </div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-danger">Reject</button>
            <button className="btn btn-sm btn-primary">Approve</button>
          </div>
        </div>
      )}

      <div style={{display:"grid", gridTemplateColumns:"1fr 340px", gap:12, alignItems:"flex-start"}}>
        {/* Left: PO lines + notes */}
        <div>
          <div className="card" style={{padding:0}}>
            <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
              <h3 className="card-title">PO lines · {p.lines.length}</h3>
              <button className="btn btn-secondary btn-sm">＋ Add line</button>
            </div>
            <table>
              <thead><tr>
                <th style={{width:30}}>#</th><th>Product</th>
                <th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Unit price</th>
                <th style={{textAlign:"right"}}>Disc %</th><th style={{textAlign:"right"}}>Line total</th>
                <th>Expected</th><th>Received</th><th>Status</th>
              </tr></thead>
              <tbody>
                {p.lines.map(l => {
                  const recPct = l.qty ? (l.received / l.qty * 100) : 0;
                  return (
                    <tr key={l.seq}>
                      <td className="mono">{l.seq}</td>
                      <td>
                        <div style={{fontWeight:500}}>{l.product}</div>
                        <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>
                          {l.code}
                          {l.eudr && <span className="badge badge-amber" style={{fontSize:9, marginLeft:6}}>EUDR required</span>}
                        </div>
                      </td>
                      <td className="num mono">{l.qty} <span className="muted" style={{fontSize:10}}>{l.uom}</span></td>
                      <td className="num mono">£{l.unitPrice.toFixed(2)}</td>
                      <td className="num mono">{l.discount > 0 ? l.discount + "%" : <span className="muted">—</span>}</td>
                      <td className="num mono" style={{fontWeight:600}}>£{l.lineTotal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                      <td className="mono" style={{fontSize:11}}>{l.lineExp}</td>
                      <td style={{minWidth:100}}>
                        <div className="mono" style={{fontSize:11}}>{l.received} / {l.qty}</div>
                        <div className="cell-bar green" style={{width:80}}><span style={{width:recPct+"%"}}></span></div>
                      </td>
                      <td>
                        {l.status === "not_received" && <span className="badge badge-gray" style={{fontSize:10}}>Not received</span>}
                        {l.status === "partially_received" && <span className="badge badge-amber" style={{fontSize:10}}>Partial</span>}
                        {l.status === "fully_received" && <span className="badge badge-green" style={{fontSize:10}}>Full</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Notes</h3>
            </div>
            <div style={{fontSize:12}}>
              <div className="label" style={{marginBottom:4}}>Public notes</div>
              <div>{p.notes}</div>
              <div className="label" style={{marginTop:12, marginBottom:4}}>Internal notes</div>
              <div className="muted">{p.internalNotes}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-head" style={{cursor:"pointer"}} onClick={()=>setHistoryOpen(!historyOpen)}>
              <h3 className="card-title">{historyOpen ? "▾" : "▸"} Status history</h3>
              <span className="muted" style={{fontSize:11}}>{p.statusHistory.length} transitions</span>
            </div>
            {historyOpen && (
              <table>
                <thead><tr><th>From</th><th>To</th><th>Timestamp</th><th>User</th><th>Action</th><th>Notes</th></tr></thead>
                <tbody>
                  {p.statusHistory.map((h,i) => (
                    <tr key={i}>
                      <td>{h.from ? <POStatus s={h.from}/> : <span className="muted">—</span>}</td>
                      <td><POStatus s={h.to}/></td>
                      <td className="mono" style={{fontSize:11}}>{h.t}</td>
                      <td>{h.user}</td>
                      <td className="mono" style={{fontSize:11}}>{h.action}</td>
                      <td style={{fontSize:12}}>{h.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right column */}
        <div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">PO summary</h3></div>
            <div style={{fontSize:12, display:"grid", gap:8}}>
              <div className="row-flex"><span className="muted">Supplier</span><span className="spacer"></span><a style={{color:"var(--blue)", cursor:"pointer"}}>{p.supplier}</a></div>
              <div className="row-flex"><span className="muted">Source</span><span className="spacer"></span><span>{p.source}</span></div>
              <div className="row-flex"><span className="muted">Order date</span><span className="spacer"></span><span className="mono">{p.orderDate}</span></div>
              <div className="row-flex"><span className="muted">Expected</span><span className="spacer"></span><span className="mono">{p.exp}</span></div>
              <div className="row-flex"><span className="muted">Warehouse</span><span className="spacer"></span><span className="mono">{p.warehouse}</span></div>
              <div className="row-flex"><span className="muted">Currency</span><span className="spacer"></span><span className="mono">{p.currency}</span></div>
              <div className="row-flex"><span className="muted">Payment terms</span><span className="spacer"></span><span>{p.paymentTerms}</span></div>
              <div style={{borderTop:"1px solid var(--border)", paddingTop:10, marginTop:4}}>
                <div className="row-flex"><span className="muted">Subtotal</span><span className="spacer"></span><span className="mono">£{p.subtotal.toLocaleString()}</span></div>
                <div className="row-flex" style={{marginTop:4}}><span className="muted">Tax</span><span className="spacer"></span><span className="mono">£{p.tax.toLocaleString()}</span></div>
                <div className="row-flex" style={{marginTop:4}}><span className="muted">Discount</span><span className="spacer"></span><span className="mono">£{p.discountTotal.toLocaleString()}</span></div>
                <div className="row-flex" style={{marginTop:8, fontSize:14}}><b>Total</b><span className="spacer"></span><b className="mono">£{p.total.toLocaleString()}</b></div>
              </div>
              <div style={{borderTop:"1px solid var(--border)", paddingTop:10, marginTop:4}}>
                <div className="label" style={{marginBottom:6}}>GRN progress</div>
                <div className="mono" style={{fontSize:11, marginBottom:4}}>{receivedTotal} / {totalOrdered} {p.lines[0].uom} ({receivedPct.toFixed(0)}%)</div>
                <div className="cell-bar green" style={{width:"100%"}}><span style={{width:receivedPct+"%"}}></span></div>
              </div>
            </div>
          </div>

          {p.approvalRequired && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Approval</h3></div>
              <div style={{fontSize:12, display:"grid", gap:8}}>
                <div className="row-flex"><span className="muted">State</span><span className="spacer"></span><POStatus s={p.status}/></div>
                <div className="row-flex"><span className="muted">Approver role</span><span className="spacer"></span><span>{p.approvalRole}</span></div>
                <div className="row-flex"><span className="muted">Threshold</span><span className="spacer"></span><span className="mono">£{p.approvalThreshold.toLocaleString()}</span></div>
                <div className="row-flex"><span className="muted">This PO</span><span className="spacer"></span><span className="mono" style={{color:"var(--amber-700)", fontWeight:600}}>£{p.total.toLocaleString()}</span></div>
                <div style={{marginTop:6, display:"grid", gap:6}}>
                  <button className="btn btn-primary btn-sm" style={{justifyContent:"center"}}>Approve PO</button>
                  <button className="btn btn-danger btn-sm" style={{justifyContent:"center"}}>Reject PO</button>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head"><h3 className="card-title">D365 sync</h3></div>
            <div style={{fontSize:12, display:"grid", gap:8}}>
              <div className="row-flex"><span className="muted">Status</span><span className="spacer"></span>
                {p.d365.drift
                  ? <span className="badge badge-amber" style={{fontSize:10}}>Drift</span>
                  : <span className="badge badge-green" style={{fontSize:10}}>Synced</span>}
              </div>
              <div className="row-flex"><span className="muted">D365 supplier id</span><span className="spacer"></span><span className="mono" style={{fontSize:11}}>{p.d365.d365SupplierId}</span></div>
              <div className="row-flex"><span className="muted">Last synced</span><span className="spacer"></span><span className="mono" style={{fontSize:11}}>{p.d365.lastSync}</span></div>
              {p.d365.drift && (
                <div className="alert-amber alert-box" style={{marginTop:8, fontSize:11}}>
                  <div>Supplier record has drifted from D365. Admin resolve required.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { PlanPOList, PlanPODetail });
