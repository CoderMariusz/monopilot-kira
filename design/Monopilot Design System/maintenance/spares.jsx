// ============ MAINT-013 Spares List + MAINT-014 Spare Part Detail ============

const MntSparesList = ({ onOpenSpare, onNav, openModal, role }) => {
  const [catFilter, setCatFilter] = React.useState("all");
  const [critOnly, setCritOnly] = React.useState(false);
  const [lowOnly, setLowOnly] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const isManager = role === "Manager" || role === "Admin";

  const visible = MNT_SPARES.filter(s => {
    if (catFilter !== "all" && s.cat !== catFilter) return false;
    if (critOnly && !s.critical) return false;
    if (lowOnly && s.onHand > s.min) return false;
    if (search && !(s.code.toLowerCase().includes(search.toLowerCase()) ||
                    s.desc.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const belowReorderCount = MNT_SPARES.filter(s => s.onHand <= s.min).length;
  const critCount = MNT_SPARES.filter(s => s.critical).length;

  const cats = [...new Set(MNT_SPARES.map(s => s.cat))];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Spare parts</div>
          <h1 className="page-title">Spare parts</h1>
          <div className="muted" style={{fontSize:12}}>
            {MNT_SPARES.length} catalogued parts · {belowReorderCount} below reorder point · {critCount} critical parts
          </div>
        </div>
        <div className="row-flex">
          <input type="text" placeholder="Search part code, description…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
          <button className="btn btn-secondary btn-sm">⇪ Reorder report</button>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("assetEdit", { mode: "create" })}>＋ Add Part</button>}
        </div>
      </div>

      {/* Summary strip */}
      <div className="kpi-grid-6">
        <div className="kpi"><div className="kpi-label">Total parts</div><div className="kpi-value">{MNT_SPARES.length}</div><div className="kpi-sub">All categories</div></div>
        <div className="kpi red"><div className="kpi-label">Below reorder</div><div className="kpi-value">{belowReorderCount}</div><div className="kpi-sub">Reorder recommended</div></div>
        <div className="kpi amber"><div className="kpi-label">Critical parts</div><div className="kpi-value">{critCount}</div><div className="kpi-sub">High priority</div></div>
        <div className="kpi"><div className="kpi-label">Categories</div><div className="kpi-value">{cats.length}</div><div className="kpi-sub">Product families</div></div>
        <div className="kpi blue"><div className="kpi-label">Avg lead time</div><div className="kpi-value mono">5d</div><div className="kpi-sub">Across suppliers</div></div>
        <div className="kpi"><div className="kpi-label">Total value</div><div className="kpi-value">€4,220</div><div className="kpi-sub">Current stock</div></div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>Category</label>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
          <option value="all">All</option>
          {cats.map(c => <option key={c}>{c}</option>)}
        </select>
        <label style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="checkbox" checked={critOnly} onChange={e=>setCritOnly(e.target.checked)}/> Critical only
        </label>
        <label style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="checkbox" checked={lowOnly} onChange={e=>setLowOnly(e.target.checked)}/> Below reorder
        </label>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>Part code</th>
              <th>Description</th>
              <th>Category</th>
              <th>Unit</th>
              <th style={{textAlign:"right"}}>On hand</th>
              <th style={{textAlign:"right"}}>Min</th>
              <th style={{textAlign:"right"}}>Max</th>
              <th>Last used</th>
              <th>Lead time</th>
              <th>Unit cost</th>
              <th>WH ref</th>
              <th>Critical</th>
              <th style={{width:180}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => {
              const low = s.onHand <= s.min;
              return (
                <tr key={s.code} className={low ? "stock-low-row" : ""} style={{cursor:"pointer"}} onClick={()=>onOpenSpare(s.code)}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{s.code}</td>
                  <td style={{fontSize:11}}>{s.desc}</td>
                  <td style={{fontSize:11}}>{s.cat}</td>
                  <td className="mono" style={{fontSize:11}}>{s.unit}</td>
                  <td className={"num mono " + (low ? "qty-cell" : "")}>{s.onHand}</td>
                  <td className="num mono">{s.min}</td>
                  <td className="num mono">{s.max}</td>
                  <td className="mono" style={{fontSize:11}}>{s.lastUsed}</td>
                  <td className="mono" style={{fontSize:11}}>{s.leadTime}</td>
                  <td className="mono" style={{fontSize:11}}>€{s.unitCost.toFixed(2)}</td>
                  <td>{s.whLp ? <CmChip module="wh" label={s.whLp}/> : <span className="muted">—</span>}</td>
                  <td>{s.critical ? <span className="crit-part">⚡</span> : <span className="muted">—</span>}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    {low && <button className="btn btn-primary btn-sm" onClick={()=>openModal("sparReorder", { code: s.code })}>Reorder</button>}
                    {!low && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("sparAdjust", { code: s.code })}>Adjust</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ MAINT-014 Spare Part Detail ============
const MntSpareDetail = ({ onBack, onNav, openModal, role }) => {
  const s = MNT_SPARE_DETAIL;
  const isManager = role === "Manager" || role === "Admin";
  const low = s.onHand <= s.min;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Spare parts</a> · <span className="mono">{s.code}</span></div>
          <h1 className="page-title">{s.desc}</h1>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
          {low && <button className="btn btn-primary btn-sm" onClick={()=>openModal("sparReorder", { code: s.code })}>Reorder</button>}
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("sparAdjust", { code: s.code })}>Adjust stock</button>
          {isManager && <button className="btn btn-secondary btn-sm">Edit part</button>}
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:12}}>
        {/* LEFT — Stock & transactions */}
        <div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginBottom:12}}>
            <div className={"stock-card " + (low ? "low" : "")}>
              <div className="sc-label">On hand</div>
              <div className="sc-qty">{s.onHand} {s.unit}</div>
              <div className="sc-bar"><span style={{width: Math.min((s.onHand/s.max*100), 100)+"%"}}></span></div>
              <div className="muted" style={{fontSize:10, marginTop:4}}>{low ? "⚠ Below reorder point" : "Within target range"}</div>
            </div>
            <div className="stock-card">
              <div className="sc-label">Reorder point</div>
              <div className="sc-qty">{s.min} {s.unit}</div>
              <div className="muted" style={{fontSize:10, marginTop:4}}>Trigger for alert</div>
            </div>
            <div className="stock-card">
              <div className="sc-label">Max capacity</div>
              <div className="sc-qty">{s.max} {s.unit}</div>
              <div className="muted" style={{fontSize:10, marginTop:4}}>Storage limit</div>
            </div>
            <div className="stock-card">
              <div className="sc-label">Unit cost</div>
              <div className="sc-qty">€{s.unitCost.toFixed(2)}</div>
              <div className="muted" style={{fontSize:10, marginTop:4}}>Current value: €{(s.onHand * s.unitCost).toFixed(2)}</div>
            </div>
          </div>

          {/* Stock by warehouse location */}
          <div className="card">
            <div className="card-head"><h3 className="card-title">Stock by warehouse location</h3></div>
            <table>
              <thead><tr><th>Warehouse</th><th>Location</th><th style={{textAlign:"right"}}>Qty</th><th>Min</th><th>Last counted</th><th>Warehouse LP</th><th></th></tr></thead>
              <tbody>
                {s.stock.map((st,i)=>(
                  <tr key={i}>
                    <td className="mono" style={{fontSize:11}}>{st.wh}</td>
                    <td style={{fontSize:11}}><Ltree path={st.loc.split(" › ")}/></td>
                    <td className="num mono" style={{color: st.qty <= st.min ? "var(--red)" : "var(--text)", fontWeight:600}}>{st.qty} {s.unit}</td>
                    <td className="num mono">{st.min}</td>
                    <td className="mono" style={{fontSize:11}}>{st.lastCounted}</td>
                    <td>{st.lp ? <CmChip module="wh" label={st.lp}/> : <span className="muted">—</span>}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={()=>openModal("sparAdjust", { code: s.code })}>Adjust</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Transactions */}
          <div className="card" style={{marginTop:12}}>
            <div className="card-head">
              <h3 className="card-title">Consumption history ({s.transactions.length} transactions)</h3>
              <div className="row-flex">
                <select style={{fontSize:11, width:120}}>
                  <option>All types</option><option>Consume</option><option>Receipt</option><option>Adjust</option>
                </select>
              </div>
            </div>
            <table>
              <thead><tr><th>Date</th><th>Type</th><th style={{textAlign:"right"}}>Qty</th><th>Linked mWO</th><th>By</th><th>Notes</th></tr></thead>
              <tbody>
                {s.transactions.map((tx,i)=>(
                  <tr key={i}>
                    <td className="mono" style={{fontSize:11}}>{tx.t}</td>
                    <td><span className={"mv-type " + (tx.type === "consume" ? "consume" : tx.type === "receipt" ? "receipt" : "adjustment")}>{tx.type}</span></td>
                    <td className="num mono" style={{color: tx.qty < 0 ? "var(--red)" : "var(--green-700)", fontWeight:600}}>{tx.qty > 0 ? "+" : ""}{tx.qty}</td>
                    <td>{tx.mwo ? <span className="mono" style={{fontWeight:600, color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>{tx.mwo}</span> : <span className="muted">—</span>}</td>
                    <td style={{fontSize:11}}>{tx.by}</td>
                    <td style={{fontSize:11}}>{tx.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT — Master data + linked assets */}
        <div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Master data</h3></div>
            <table>
              <tbody>
                <tr><td className="muted" style={{width:140}}>Part code</td><td className="mono" style={{fontWeight:600}}>{s.code}</td></tr>
                <tr><td className="muted">Description</td><td>{s.desc}</td></tr>
                <tr><td className="muted">Category</td><td>{s.cat}</td></tr>
                <tr><td className="muted">Unit of measure</td><td className="mono">{s.unit}</td></tr>
                <tr><td className="muted">Supplier</td><td><a style={{color:"var(--blue)"}}>{s.supplier}</a></td></tr>
                <tr><td className="muted">Supplier code</td><td className="mono" style={{fontSize:11}}>{s.supplierCode}</td></tr>
                <tr><td className="muted">Shelf life</td><td className="mono">{s.shelfLifeDays} days</td></tr>
                <tr><td className="muted">Unit cost</td><td className="mono">€{s.unitCost.toFixed(2)}</td></tr>
                <tr><td className="muted">Critical part</td><td>{s.critical ? <span className="crit-part">⚡ Critical</span> : <span className="muted">No</span>}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card" style={{marginTop:12}}>
            <div className="card-head"><h3 className="card-title">Linked assets ({s.linkedAssets.length})</h3></div>
            <table>
              <thead><tr><th>Asset</th><th>Qty / service</th></tr></thead>
              <tbody>
                {s.linkedAssets.map(a => (
                  <tr key={a.id} style={{cursor:"pointer"}} onClick={()=>onNav("asset_detail")}>
                    <td><span className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{a.id}</span> {a.name}</td>
                    <td className="num mono">{a.plan} {s.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Architecture note */}
          <div className="alert-blue alert-box" style={{fontSize:11, marginTop:12}}>
            <span>ⓘ</span>
            <div>
              <b>Architecture note:</b> Spare parts use raw qty_on_hand tracking — no LP picker, no FEFO logic. Warehouse LP <CmChip module="wh" label={s.stock[0].lp}/> is a cross-link for location reference only.
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { MntSparesList, MntSpareDetail });
