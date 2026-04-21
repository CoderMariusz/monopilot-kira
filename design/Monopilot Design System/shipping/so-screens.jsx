// ============ SHIP-005 SO List + SHIP-007 SO Detail + SHIP-008 Allocation View ============

const ShSOList = ({ onOpenSO, onNav, openModal }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());

  const tabs = [
    { k: "all",       l: "All",       c: SH_SOS.length },
    { k: "draft",     l: "Draft",     c: SH_SOS.filter(s => s.status === "draft").length },
    { k: "confirmed", l: "Confirmed", c: SH_SOS.filter(s => s.status === "confirmed").length },
    { k: "allocated", l: "Allocated", c: SH_SOS.filter(s => s.status === "allocated").length },
    { k: "picking",   l: "Picking",   c: SH_SOS.filter(s => s.status === "picking").length },
    { k: "packing",   l: "Packing",   c: SH_SOS.filter(s => ["packing","packed"].includes(s.status)).length },
    { k: "shipped",   l: "Shipped",   c: SH_SOS.filter(s => ["shipped","delivered"].includes(s.status)).length },
    { k: "held",      l: "On hold",   c: SH_SOS.filter(s => s.holds.length > 0 || s.status === "held").length },
  ];

  const visible = SH_SOS.filter(s =>
    (tab === "all" ? true :
     tab === "packing" ? ["packing","packed"].includes(s.status) :
     tab === "shipped" ? ["shipped","delivered"].includes(s.status) :
     tab === "held" ? (s.holds.length > 0 || s.status === "held") :
     s.status === tab) &&
    (!search ||
      s.so.toLowerCase().includes(search.toLowerCase()) ||
      s.customer.toLowerCase().includes(search.toLowerCase()) ||
      (s.customerPO || "").toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = id => { const n = new Set(selected); if (n.has(id)) n.delete(id); else n.add(id); setSelected(n); };
  const toggleAll = () => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map(s => s.so)));

  const backorders = SH_SOS.filter(s => s.status === "partial").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Sales orders</div>
          <h1 className="page-title">Sales orders</h1>
          <div className="muted" style={{fontSize:12}}>{SH_SOS.length} SOs · {SH_SOS.filter(s=>s.holds.length).length} on hold · {backorders} partial · Today: <b>2026-04-21</b></div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("soCreate")}>＋ Create SO</button>
        </div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>{t.l} <span className="count">{t.c}</span></button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search SO#, customer, customer PO…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:280}}/>
        <select style={{width:180}}><option>All customers</option>{SH_CUSTOMERS.slice(0,6).map(c => <option key={c.id}>{c.name}</option>)}</select>
        <input type="date" placeholder="From" style={{width:130}}/>
        <input type="date" placeholder="To" style={{width:130}}/>
        <select style={{width:140}}><option>Hold: All</option><option>On hold</option><option>Clear</option></select>
        <select style={{width:140}}><option>All carriers</option>{SH_CARRIERS.filter(c=>c.active).map(c => <option key={c.id}>{c.name}</option>)}</select>
        <span className="spacer"></span>
        <button className="clear-all">Clear filters</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      {selected.size > 0 && (
        <div className="card" style={{padding:"8px 14px", marginBottom:10, background:"var(--blue-050)", borderColor:"var(--blue)"}}>
          <div className="row-flex">
            <b>{selected.size} selected</b>
            <span className="spacer"></span>
            <button className="btn btn-secondary btn-sm">Allocate</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>onNav("wave")}>Add to wave</button>
            <button className="btn btn-secondary btn-sm">Generate pick list</button>
            <button className="btn btn-secondary btn-sm">⇪ Export</button>
            <button className="btn btn-danger btn-sm" onClick={()=>openModal("soCancel")}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th style={{width:30}}><input type="checkbox" checked={selected.size > 0 && selected.size === visible.length} onChange={toggleAll}/></th>
              <th>SO#</th>
              <th>Customer</th>
              <th>Customer PO</th>
              <th>Status</th>
              <th>Target ship</th>
              <th>Alloc</th>
              <th>Picked</th>
              <th>Holds</th>
              <th style={{textAlign:"right"}}>Total</th>
              <th>Carrier</th>
              <th style={{width:100}}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => (
              <tr key={s.so} className={s.holds.length > 0 ? "row-warning" : s.status === "partial" ? "row-warning" : ""} style={{cursor:"pointer"}} onClick={()=>onOpenSO(s.so)}>
                <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(s.so)} onChange={()=>toggle(s.so)}/></td>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{s.so}</td>
                <td style={{fontSize:12}}>{s.customer}</td>
                <td className="mono" style={{fontSize:11, color:"var(--muted)"}}>{s.customerPO}</td>
                <td><SOStatus s={s.status}/></td>
                <td className="mono" style={{fontSize:11}}>{s.shipDate}</td>
                <td><AllocBar pct={s.allocPct}/></td>
                <td className="mono" style={{fontSize:11}}>{s.picked}</td>
                <td>
                  {s.holds.length === 0 ? <span className="muted" style={{fontSize:10}}>—</span> : s.holds.map(h => <HoldChip key={h} type={h}/>)}
                </td>
                <td className="num mono">{s.total}</td>
                <td style={{fontSize:11}}>{s.carrier || <span className="muted">—</span>}</td>
                <td onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" title="View">▸</button>
                  <button className="btn btn-ghost btn-sm" title="More">⋯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row-flex" style={{marginTop:10, fontSize:12, color:"var(--muted)"}}>
        <span>Showing 1–{visible.length} of {SH_SOS.length} · {backorders} partial backorder{backorders === 1 ? "" : "s"} pending — review allocation shortfalls</span>
        <span className="spacer"></span>
        <div className="row-flex">
          <select style={{fontSize:11, padding:"2px 6px", width:"auto"}}><option>50</option><option>25</option><option>100</option></select>
          <span style={{fontSize:11}}>per page</span>
          <button className="btn btn-ghost btn-sm">← Prev</button>
          <span className="mono">1</span>
          <button className="btn btn-ghost btn-sm">Next →</button>
        </div>
      </div>
    </>
  );
};

// =================================================================
// SHIP-007 SO Detail
// =================================================================
const ShSODetail = ({ onBack, onNav, openModal }) => {
  const so = SH_SO_DETAIL;
  const [tab, setTab] = React.useState("lines");
  const hasAllergenConflict = so.lines.some(l => l.allergens.some(a => SH_CUSTOMER_DETAIL.allergens.refuses.includes(a)));

  const tabs = [
    { k: "lines",       l: "Lines",         c: so.lines.length },
    { k: "allocation",  l: "Allocation",    c: so.allocations.length },
    { k: "holds",       l: "Holds",         c: so.holds.length },
    { k: "picks",       l: "Picks",         c: so.picks.length },
    { k: "packs",       l: "Packs",         c: so.shipments.length },
    { k: "documents",   l: "Documents" },
    { k: "history",     l: "History",       c: so.history.length },
  ];

  const canConfirm = so.status === "draft";
  const canAllocate = so.status === "confirmed";
  const canCancel = !["shipped","delivered","cancelled"].includes(so.status);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Shipping</a> · <a onClick={onBack}>Sales orders</a> · <span className="mono">{so.so}</span></div>
          <h1 className="page-title"><span className="mono">{so.so}</span> — {so.customer.name}</h1>
          <div className="muted" style={{fontSize:12}}>Customer PO <span className="mono">{so.customerPO}</span> · Ordered {so.orderDate} · Promised ship {so.promisedShipDate} · Required {so.requiredDelivery} · £{so.total.toFixed(2)}</div>
        </div>
        <div className="row-flex">
          <SOStatus s={so.status}/>
          {canConfirm && <button className="btn btn-primary btn-sm" disabled={!so.allergenValidated}>Confirm SO</button>}
          {canAllocate && <button className="btn btn-primary btn-sm">Allocate</button>}
          <button className="btn btn-secondary btn-sm">Print ▼</button>
          {canCancel && <button className="btn btn-danger btn-sm" onClick={()=>openModal("soCancel", so)}>Cancel</button>}
          <button className="btn btn-ghost btn-sm">⋯</button>
        </div>
      </div>

      {hasAllergenConflict && (
        <div className="alert-red alert-box" style={{marginBottom:10, fontSize:12}}>
          <span>⚠</span>
          <div><b>Allergen hold alert:</b> some line products contain allergens restricted by {so.customer.name}. Override requires shipping_qa approval with reason code.</div>
          <button className="btn btn-sm btn-danger" onClick={()=>openModal("allergenOverride")}>Review allergen conflicts</button>
        </div>
      )}

      <div className="wo-summary-bar">
        <div className="wsb-item"><div className="wsb-label">Status</div><div className="wsb-value"><SOStatus s={so.status}/></div></div>
        <div className="wsb-item"><div className="wsb-label">Lines</div><div className="wsb-value">{so.lines.length}</div></div>
        <div className="wsb-item"><div className="wsb-label">Allocated</div><div className="wsb-value">{so.allocations.length} LPs</div></div>
        <div className="wsb-item"><div className="wsb-label">Total</div><div className="wsb-value">£{so.total.toFixed(2)}</div></div>
        <div className="wsb-item"><div className="wsb-label">Ship to</div><div className="wsb-value" style={{fontSize:11}}>{so.shippingAddress.split(",")[0]}</div></div>
        <div className="wsb-item"><div className="wsb-label">Allergen validated</div><div className="wsb-value" style={{color: so.allergenValidated ? "var(--green-700)" : "var(--red-700)"}}>{so.allergenValidated ? "✓ Yes" : "✕ No"}</div></div>
      </div>

      <div className="lp-tabs">
        {tabs.map(t => (
          <button key={t.k} className={tab === t.k ? "on" : ""} onClick={()=>setTab(t.k)}>
            {t.l}{t.c !== undefined && <span className="tab-count">{t.c}</span>}
          </button>
        ))}
      </div>

      {/* LINES TAB */}
      {tab === "lines" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}>
            <h3 className="card-title">Order lines</h3>
            {so.status === "draft" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("soLineAdd")}>＋ Add line</button>}
          </div>
          <table>
            <thead><tr><th>Line</th><th>Product</th><th>GTIN</th><th style={{textAlign:"right"}}>Ordered</th><th style={{textAlign:"right"}}>Allocated</th><th style={{textAlign:"right"}}>Picked</th><th style={{textAlign:"right"}}>Packed</th><th style={{textAlign:"right"}}>Shipped</th><th style={{textAlign:"right"}}>Unit £</th><th style={{textAlign:"right"}}>Line £</th><th>Allergens</th></tr></thead>
            <tbody>
              {so.lines.map(l => (
                <tr key={l.line}>
                  <td className="mono">{l.line}</td>
                  <td style={{fontSize:12}}>{l.product}</td>
                  <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>{l.gtin}</td>
                  <td className="num mono">{l.qtyOrdered}</td>
                  <td className="num mono" style={{color: l.qtyAllocated === l.qtyOrdered ? "var(--green-700)" : "var(--amber-700)"}}>{l.qtyAllocated}</td>
                  <td className="num mono">{l.qtyPicked}</td>
                  <td className="num mono">{l.qtyPacked}</td>
                  <td className="num mono">{l.qtyShipped}</td>
                  <td className="num mono">£{l.unitPrice.toFixed(2)}</td>
                  <td className="num mono">£{l.lineTotal.toFixed(2)}</td>
                  <td><AllergenChips list={l.allergens}/></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:"10px 14px", fontSize:12, background:"var(--gray-050)", borderTop:"1px solid var(--border)"}}>
            <div className="row-flex"><b>Total lines: {so.lines.length}</b><span className="spacer"></span><b className="mono">£{so.total.toFixed(2)}</b></div>
            <div style={{fontSize:11, color:"var(--muted)", marginTop:3}}>
              Unit prices default to <span className="mono">products.default_sell_price</span> (03-TECHNICAL). Finished articles <span className="mono">FA5100 · FA5200 · FA5301</span> produced via Planning demand → WO chain.
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATION TAB */}
      {tab === "allocation" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}>
            <h3 className="card-title">Allocations ({so.allocations.length} LPs reserved)</h3>
            <div className="row-flex">
              <button className="btn btn-secondary btn-sm" onClick={()=>onNav("allocations")}>Open allocation wizard →</button>
              <button className="btn btn-danger btn-sm" onClick={()=>openModal("releaseAlloc")}>Release all</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Line</th><th>LP</th><th>Location</th><th>Batch</th><th>Expiry</th><th style={{textAlign:"right"}}>Qty</th><th>QA</th><th>FEFO rank</th><th></th></tr></thead>
            <tbody>
              {so.allocations.map((a, i) => (
                <tr key={i}>
                  <td className="mono">{a.line}</td>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{a.lp}</td>
                  <td><Ltree path={a.location.split(" › ")}/></td>
                  <td className="mono" style={{fontSize:11}}>{a.batch}</td>
                  <td className="mono" style={{fontSize:11}}>{a.expiry}</td>
                  <td className="num mono">{a.qty}</td>
                  <td><QAStatus s={a.qa}/></td>
                  <td><FefoRank rank={a.fefoRank}/></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={()=>openModal("releaseAlloc", a)}>Release</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:"10px 14px", fontSize:11, color:"var(--muted)", background:"var(--info-050a)"}}>
            ⓘ Allocation strategy: <b>FEFO</b> (<span className="mono">fefo_strategy_v1</span> from 02-SETTINGS §7) · Expiry ASC NULLS LAST → received_date ASC · Warehouse LPs hard-locked in 05-WAREHOUSE (SELECT FOR UPDATE).
          </div>
        </div>
      )}

      {/* HOLDS TAB */}
      {tab === "holds" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Holds on this order</h3>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("holdPlace")}>＋ Place hold</button>
          </div>
          {so.holds.length === 0 ? (
            <div className="alert-green alert-box" style={{fontSize:12}}><span>✓</span><div>No active holds on this order.</div></div>
          ) : (
            <table>
              <thead><tr><th>Type</th><th>Placed by</th><th>Placed at</th><th>Status</th><th>Reason</th><th></th></tr></thead>
              <tbody>{so.holds.map((h,i) => (<tr key={i}><td><HoldChip type={h.type}/></td><td>{h.placedBy}</td><td className="mono">{h.placedAt}</td><td>{h.status}</td><td>{h.reason}</td><td><button className="btn btn-primary btn-sm">Release</button></td></tr>))}</tbody>
            </table>
          )}
        </div>
      )}

      {/* PICKS TAB */}
      {tab === "picks" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}>
            <h3 className="card-title">Pick lists</h3>
            <button className="btn btn-primary btn-sm">Generate pick list</button>
          </div>
          <table>
            <thead><tr><th>PL#</th><th>Type</th><th>Status</th><th>Picker</th><th>Started</th><th>Lines</th><th></th></tr></thead>
            <tbody>
              {so.picks.map(p => (
                <tr key={p.pl} style={{cursor:"pointer"}} onClick={()=>onNav("pick_detail")}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{p.pl}</td>
                  <td><span className="badge badge-blue" style={{fontSize:9}}>{p.type}</span></td>
                  <td><PickStatus s={p.status}/></td>
                  <td style={{fontSize:11}}>{p.assignedTo}</td>
                  <td className="mono" style={{fontSize:11}}>{p.startedAt}</td>
                  <td className="mono" style={{fontSize:11}}>{p.lines}</td>
                  <td><button className="btn btn-ghost btn-sm">Open →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PACKS TAB */}
      {tab === "packs" && (
        <>
          {so.shipments.length === 0 && (
            <div className="card" style={{padding:40, textAlign:"center", color:"var(--muted)", fontSize:12}}>No shipments packed yet. Pick list must complete before packing station receives items.</div>
          )}
        </>
      )}

      {/* DOCUMENTS TAB */}
      {tab === "documents" && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Packing slips</h3></div>
            <div className="muted" style={{fontSize:12, padding:20, textAlign:"center"}}>No slips generated yet — confirm packing to generate slip.</div>
          </div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Bills of Lading</h3></div>
            <div className="muted" style={{fontSize:12, padding:20, textAlign:"center"}}>No BOLs generated yet — all boxes must be closed first (V-SHIP-SHIP-01).</div>
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Audit log ({so.history.length} entries)</h3><button className="btn btn-secondary btn-sm">⇪ Export CSV</button></div>
          <table>
            <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Old value</th><th>New value</th><th>Reason</th></tr></thead>
            <tbody>
              {so.history.map((h,i) => (
                <tr key={i}>
                  <td className="mono" style={{fontSize:11}}>{h.t}</td>
                  <td style={{fontSize:11}}>{h.user}</td>
                  <td className="mono" style={{fontSize:11}}>{h.action}</td>
                  <td className="mono" style={{fontSize:11, color:"var(--muted)"}}>{String(h.old)}</td>
                  <td className="mono" style={{fontSize:11, fontWeight:600}}>{String(h.newv)}</td>
                  <td className="mono" style={{fontSize:11}}>{h.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// =================================================================
// SHIP-008 Allocation view (global)
// =================================================================
const ShAllocation = ({ onNav, openModal, role }) => {
  const [mode, setMode] = React.useState("auto");
  const candidates = SH_LP_CANDIDATES.filter(lp => lp.product === "FA5100");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Allocations</div>
          <h1 className="page-title">Inventory allocation</h1>
          <div className="muted" style={{fontSize:12}}>{SH_ALLOC_GLOBAL.length} allocation rows · FEFO strategy (<span className="mono">fefo_strategy_v1</span> · 02-SETTINGS §7) · Warehouse LPs hard-locked on confirm</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("sos")}>← Back to SOs</button>
          <button className="btn btn-primary btn-sm">Auto-allocate all eligible</button>
        </div>
      </div>

      <div className="kpi-row-4">
        <div className="kpi green"><div className="kpi-label">Fully allocated</div><div className="kpi-value">{SH_ALLOC_GLOBAL.filter(a=>a.status==="full").length}</div><div className="kpi-sub">Ready for pick</div></div>
        <div className="kpi amber"><div className="kpi-label">Short</div><div className="kpi-value">{SH_ALLOC_GLOBAL.filter(a=>a.status==="short").length}</div><div className="kpi-sub">Partial fulfillment</div></div>
        <div className="kpi"><div className="kpi-label">Not allocated</div><div className="kpi-value">{SH_ALLOC_GLOBAL.filter(a=>a.status==="none").length}</div><div className="kpi-sub">Awaiting auto-alloc</div></div>
        <div className="kpi red"><div className="kpi-label">On hold</div><div className="kpi-value">{SH_ALLOC_GLOBAL.filter(a=>a.status==="hold").length}</div><div className="kpi-sub">Credit / allergen</div></div>
      </div>

      <div className="card" style={{padding:0, marginBottom:12}}>
        <div className="card-head" style={{padding:"10px 14px"}}>
          <h3 className="card-title">All open allocation rows</h3>
        </div>
        <table>
          <thead><tr><th>SO</th><th>Customer</th><th>Line</th><th>Product</th><th style={{textAlign:"right"}}>Ordered</th><th style={{textAlign:"right"}}>Allocated</th><th>Status</th><th>LPs</th><th>Carrier</th><th></th></tr></thead>
          <tbody>
            {SH_ALLOC_GLOBAL.map((a, i) => (
              <tr key={i} className={a.status === "short" ? "row-warning" : a.status === "hold" ? "row-overdue" : ""}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{a.so}</td>
                <td style={{fontSize:12}}>{a.customer}</td>
                <td className="mono">{a.line}</td>
                <td style={{fontSize:12}}>{a.product}</td>
                <td className="num mono">{a.qtyOrdered}</td>
                <td className="num mono" style={{color: a.status === "full" ? "var(--green-700)" : a.status === "short" ? "var(--amber-700)" : "var(--red-700)"}}>{a.qtyAllocated}</td>
                <td>
                  {a.status === "full"  && <span className="badge badge-green" style={{fontSize:9}}>Full</span>}
                  {a.status === "short" && <span className="badge badge-amber" style={{fontSize:9}}>Short −{a.shortfall}</span>}
                  {a.status === "none"  && <span className="badge badge-gray" style={{fontSize:9}}>Not allocated</span>}
                  {a.status === "hold"  && <span className="badge badge-red" style={{fontSize:9}}>Hold · {a.holdType}</span>}
                </td>
                <td className="mono" style={{fontSize:11}}>{a.lps}</td>
                <td style={{fontSize:11}}>{a.carriers || <span className="muted">—</span>}</td>
                <td>
                  {a.status === "none"  && <button className="btn btn-primary btn-sm">Allocate</button>}
                  {a.status === "short" && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("partialFulfil")}>Resolve</button>}
                  {a.status === "hold"  && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("holdRelease")}>Release hold</button>}
                  {a.status === "full"  && <button className="btn btn-ghost btn-sm">View</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Three-column allocator UI for product FA5100 */}
      <div className="card" style={{padding:"10px 14px", marginBottom:8, background:"var(--gray-050)"}}>
        <div className="row-flex">
          <b className="mono" style={{fontSize:13}}>SO-2026-2450</b> · Sainsbury's · line 1 · <b>FA5100 Kiełbasa śląska</b> · 200 kg required · <SOStatus s="confirmed"/>
          <span className="spacer"></span>
          <div className="pills">
            <button className={"pill " + (mode === "auto" ? "on" : "")} onClick={()=>setMode("auto")}>Auto (FEFO)</button>
            <button className={"pill " + (mode === "manual" ? "on" : "")} onClick={()=>setMode("manual")}>Manual select</button>
          </div>
        </div>
      </div>

      <div className="alloc-layout">
        <div className="alloc-col">
          <div className="ac-head">SO summary</div>
          <Summary rows={[
            { label: "Customer", value: "Sainsbury's", mono: false },
            { label: "Product", value: "FA5100" },
            { label: "Required qty", value: "200 kg" },
            { label: "Lines", value: "5" },
            { label: "Total order", value: "£4,280.00" },
            { label: "Ship date", value: "2026-04-23" },
            { label: "Shipping addr", value: "Sainsbury's DC Reading", mono: false },
          ]}/>
          <div className="alert-blue alert-box" style={{fontSize:11, marginTop:10}}>
            <span>ⓘ</span>
            <div>FEFO suggests LP-9120 (exp 2026-06-14, rank 1). Manual override requires reason.</div>
          </div>
        </div>

        <div className="alloc-col">
          <div className="ac-head">Available LP candidates — FA5100 (FEFO sorted)</div>
          <table>
            <thead><tr><th>{mode === "manual" && <input type="checkbox"/>}</th><th>LP</th><th>Loc</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>QA</th><th>FEFO</th></tr></thead>
            <tbody>
              {candidates.map(lp => (
                <tr key={lp.lp} className={lp.expired ? "alloc-row-expired" : lp.qa === "HOLD" ? "alloc-row-hold" : ""}>
                  <td>{mode === "manual" && <input type="checkbox" disabled={!lp.available}/>}</td>
                  <td className="mono" style={{fontWeight:600, color: lp.available ? "var(--blue)" : "var(--muted)"}}>
                    {lp.lp}
                    {lp.expired && <span className="badge badge-red" style={{fontSize:9, marginLeft:4}}>EXPIRED</span>}
                    {lp.qa === "HOLD" && <span className="badge badge-amber" style={{fontSize:9, marginLeft:4}}>HOLD {lp.holdSeverity}</span>}
                  </td>
                  <td><Ltree path={lp.loc}/></td>
                  <td className="mono" style={{fontSize:10}}>{lp.batch}</td>
                  <td className="mono" style={{fontSize:11, color: lp.expired ? "var(--red-700)" : undefined}}>{lp.expiry}</td>
                  <td className="num mono">{lp.qty}</td>
                  <td><QAStatus s={lp.qa}/></td>
                  <td><FefoRank rank={lp.fefoRank}/></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{marginTop:10, fontSize:11, color:"var(--muted)", lineHeight:1.6}}>
            <b>V-SHIP-ALLOC-01:</b> LP must be <span className="mono">status=available</span> in 05-WAREHOUSE · <b>V-SHIP-ALLOC-02:</b> FEFO rank 1 preferred · <b>V-SHIP-ALLOC-03:</b> expired LPs disabled unless admin toggle · <b>V-SHIP-ALLOC-04:</b> allergen conflict requires shipping_qa override.
          </div>
          <div className="row-flex" style={{marginTop:10}}>
            <button className="btn btn-primary btn-sm">Auto-allocate (FEFO)</button>
            {mode === "manual" && <button className="btn btn-secondary btn-sm">Allocate selected</button>}
            <button className="btn btn-ghost btn-sm" onClick={()=>openModal("allocOverride")}>Override…</button>
            <span className="spacer"></span>
            <span className="muted" style={{fontSize:11}}>Shortfall: 40 kg — partial fulfillment possible</span>
          </div>
        </div>

        <div className="alloc-col">
          <div className="ac-head">Current allocations (this SO)</div>
          <table>
            <thead><tr><th>LP</th><th>Qty</th><th></th></tr></thead>
            <tbody>
              <tr><td className="mono" style={{color:"var(--blue)"}}>—</td><td className="num mono muted">—</td><td></td></tr>
            </tbody>
          </table>
          <div className="muted" style={{fontSize:11, padding:10, textAlign:"center"}}>No LPs allocated to this SO yet.</div>

          <div className="alert-green alert-box" style={{fontSize:11, marginTop:10, display:"none"}}>
            <span>✓</span>
            <div>All lines fully allocated — ready to generate pick list.</div>
          </div>

          <div className="alert-amber alert-box" style={{fontSize:11, marginTop:10}}>
            <span>⚠</span>
            <div><b>Short: 144 kg available, 200 kg required.</b> Partial allocation possible — see Partial Fulfillment (SHIP-010).</div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { ShSOList, ShSODetail, ShAllocation });
