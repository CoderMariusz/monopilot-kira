// ============ WH-006 Stock Movements List (with side-panel detail) ============

const WhMovementList = ({ onNav, onOpenLp, openModal }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selectedMv, setSelectedMv] = React.useState(null);

  const tabs = [
    { k: "all",           l: "All",           c: WH_MOVEMENTS.length },
    { k: "receipts",      l: "Receipts",      c: WH_MOVEMENTS.filter(m => m.type === "receipt").length },
    { k: "consume",       l: "Consume to WO", c: WH_MOVEMENTS.filter(m => m.type === "consume_to_wo").length },
    { k: "transfers",     l: "Transfers",     c: WH_MOVEMENTS.filter(m => m.type === "transfer" || m.type === "putaway").length },
    { k: "adjustments",   l: "Adjustments",   c: WH_MOVEMENTS.filter(m => m.type === "adjustment").length },
    { k: "approvals",     l: "Manager approvals", c: 1 },
  ];

  const visible = WH_MOVEMENTS.filter(m =>
    (tab === "all" ? true :
     tab === "receipts" ? m.type === "receipt" :
     tab === "consume" ? m.type === "consume_to_wo" :
     tab === "transfers" ? (m.type === "transfer" || m.type === "putaway") :
     tab === "adjustments" ? m.type === "adjustment" :
     true) &&
    (!search || m.id.toLowerCase().includes(search.toLowerCase()) || (m.lp||"").toLowerCase().includes(search.toLowerCase()) || (m.ref||"").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Stock movements</div>
          <h1 className="page-title">Stock movements</h1>
          <div className="muted" style={{fontSize:12}}>{WH_MOVEMENTS.length} movements in last 24h · 3 consume-to-WO · 2 adjustments · 1 awaiting manager approval</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("stockMove")}>＋ New movement</button>
        </div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>
            {t.l} <span className="count">{t.c}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search SM#, LP#, product, WO…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
        <select style={{width:150}}><option>All move types</option><option>receipt</option><option>putaway</option><option>transfer</option><option>consume_to_wo</option><option>adjustment</option><option>quarantine</option><option>return</option></select>
        <input type="date" placeholder="From" style={{width:130}}/>
        <input type="date" placeholder="To" style={{width:130}}/>
        <select style={{width:160}}><option>All locations</option><option>Cold › B3</option><option>Line-1-Buffer</option></select>
        <input type="text" placeholder="LP#" style={{width:120}}/>
        <input type="text" placeholder="WO#" style={{width:130}}/>
        <select style={{width:120}}><option>All users</option><option>J.Nowak</option><option>M.Kowalski</option><option>K.Kowal</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear filters</button>
      </div>

      {tab === "approvals" && (
        <div className="alert-amber alert-box" style={{marginBottom:10, fontSize:12}}>
          <span>⚠</span>
          <div>
            <b>1 adjustment over 10% awaiting manager approval</b>
            <div style={{fontSize:11}}>SM-2026-00315 · LP00000045 · damage · −2.0 kg (submitted by J.Nowak)</div>
          </div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-primary">Review & approve →</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th>Timestamp</th><th>Move #</th><th>Type</th><th>LP</th><th>Product</th><th style={{textAlign:"right"}}>Qty</th><th>From</th><th>To</th><th>Reason</th><th>Reference</th><th>By</th></tr></thead>
          <tbody>
            {visible.map(m => (
              <tr key={m.id} style={{cursor:"pointer"}} onClick={()=>setSelectedMv(m)}>
                <td className="mono" style={{fontSize:11}}>{m.t}</td>
                <td className="mono" style={{fontSize:11, fontWeight:600}}>{m.id}</td>
                <td><MoveType t={m.type}/></td>
                <td className="mono" style={{fontSize:11, color:"var(--blue)", cursor:"pointer"}} onClick={e=>{e.stopPropagation(); onOpenLp(m.lp);}}>{m.lp}</td>
                <td className="mono" style={{fontSize:11}}>{m.product}</td>
                <td className="num mono" style={{color: m.qty < 0 ? "var(--red-700)" : m.qty > 0 ? "var(--green-700)" : "var(--muted)", fontWeight:600}}>{m.qty > 0 ? "+" : ""}{m.qty} {m.uom}</td>
                <td><Ltree path={m.fromLoc}/></td>
                <td><Ltree path={m.toLoc}/></td>
                <td>{m.reason ? <span className="badge badge-gray" style={{fontSize:9}}>{m.reason}</span> : <span className="muted" style={{fontSize:10}}>—</span>}</td>
                <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{m.ref || "—"}</td>
                <td style={{fontSize:11}}>{m.user}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedMv && (
        <div className="mv-side">
          <div className="mv-side-head">
            <div>
              <div className="mono" style={{fontWeight:700, fontSize:14}}>{selectedMv.id}</div>
              <div style={{fontSize:11, marginTop:2}}><MoveType t={selectedMv.type}/></div>
            </div>
            <button className="modal-close" onClick={()=>setSelectedMv(null)}>✕</button>
          </div>
          <div className="mv-side-body">
            <Summary rows={[
              { label: "Timestamp", value: selectedMv.t },
              { label: "Type", value: selectedMv.type },
              { label: "LP", value: selectedMv.lp, mono: true },
              { label: "Product", value: selectedMv.product, mono: true },
              { label: "Quantity", value: (selectedMv.qty > 0 ? "+" : "") + selectedMv.qty + " " + selectedMv.uom, emphasis: true },
              { label: "From", value: selectedMv.fromLoc ? selectedMv.fromLoc.join(" › ") : "—" },
              { label: "To", value: selectedMv.toLoc ? selectedMv.toLoc.join(" › ") : "—" },
              { label: "Reason", value: selectedMv.reason || "—" },
              { label: "Reference", value: selectedMv.ref || "—" },
              { label: "By", value: selectedMv.user, mono: false },
            ]}/>
            <div className="row-flex" style={{marginTop:10}}>
              <button className="btn btn-secondary btn-sm" onClick={()=>onOpenLp(selectedMv.lp)}>Open LP →</button>
              {selectedMv.ref && selectedMv.ref.startsWith("WO-") && <button className="btn btn-secondary btn-sm">Open WO →</button>}
              {selectedMv.ref && selectedMv.ref.startsWith("GRN-") && <button className="btn btn-secondary btn-sm" onClick={()=>onNav("grn")}>Open GRN →</button>}
            </div>
            {selectedMv.type === "adjustment" && selectedMv.deltaPct && selectedMv.deltaPct > 10 && (
              <div className="alert-amber alert-box" style={{marginTop:12, fontSize:12}}>
                <span>⚠</span>
                <div><b>Δ {selectedMv.deltaPct}% exceeded 10% threshold</b><div style={{fontSize:11}}>Manager approval was required (V-WH-MOV-004).</div></div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// ============ Reservations list / WH-017 / WH-RES-003 — standalone page ============

const WhReservations = ({ onNav, onOpenLp, openModal }) => {
  const [tab, setTab] = React.useState("active");
  const tabs = [
    { k: "active",    l: "Active",    c: WH_RESERVATIONS.filter(r => r.status === "active").length },
    { k: "consumed",  l: "Consumed",  c: WH_RESERVATIONS.filter(r => r.status === "consumed").length },
    { k: "cancelled", l: "Cancelled", c: WH_RESERVATIONS.filter(r => r.status === "cancelled").length },
    { k: "all",       l: "All",       c: WH_RESERVATIONS.length },
  ];
  const visible = WH_RESERVATIONS.filter(r => tab === "all" ? true : r.status === tab);

  const totalActiveKg = WH_RESERVATIONS.filter(r => r.status === "active").reduce((a,r) => a + r.reservedQty, 0);
  const lockedLps = new Set(WH_RESERVATIONS.filter(r => r.status === "active").map(r => r.lp)).size;
  const activeWos = new Set(WH_RESERVATIONS.filter(r => r.status === "active").map(r => r.wo)).size;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Reservations</div>
          <h1 className="page-title">Reservations (LP hard-locks)</h1>
          <div className="muted" style={{fontSize:12}}>Hard-locks created on WO release in Planning · cross-module view of lp_reservations</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("reserve")}>＋ Create reservation</button>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
        </div>
      </div>

      <div className="res-summary-strip">
        <div><div className="rs-label">Active locks</div><div className="rs-value">{lockedLps}</div></div>
        <div><div className="rs-label">Total kg locked</div><div className="rs-value">{totalActiveKg.toFixed(1)}</div></div>
        <div><div className="rs-label">WOs holding locks</div><div className="rs-value">{activeWos}</div></div>
        <div><div className="rs-label">Pending release</div><div className="rs-value">0</div></div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Hard-locks are auto-created at WO release.</b> Intermediate LPs are <b>never</b> reserved — they are consumed at scan time. Release reason is audit-logged.
        </div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>{t.l} <span className="count">{t.c}</span></button>
        ))}
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr>
            <th>WO</th><th>Material line</th><th>LP</th><th style={{textAlign:"right"}}>Reserved</th><th style={{textAlign:"right"}}>LP total</th><th>Expiry</th><th>Location</th><th>Reserved at</th><th>By</th><th>Status</th><th>Release reason</th><th></th>
          </tr></thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)", cursor:"pointer"}}>{r.wo}</td>
                <td style={{fontSize:11}}>{r.material}</td>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)", cursor:"pointer"}} onClick={()=>onOpenLp(r.lp)}>{r.lp}</td>
                <td className="num mono">{r.reservedQty} kg</td>
                <td className="num mono muted">{r.lpQty} kg</td>
                <td><ExpiryCell date={r.expiry} days={30}/></td>
                <td><Ltree path={r.loc}/></td>
                <td className="mono" style={{fontSize:11}}>{r.reservedAt}</td>
                <td style={{fontSize:11}}>{r.reservedBy}</td>
                <td>
                  {r.status === "active" && <span className="badge badge-green" style={{fontSize:9}}>Active</span>}
                  {r.status === "consumed" && <span className="badge badge-gray" style={{fontSize:9}}>Consumed</span>}
                  {r.status === "cancelled" && <span className="badge badge-gray" style={{fontSize:9}}>Cancelled</span>}
                </td>
                <td className="mono" style={{fontSize:11, color:"var(--muted)"}}>{r.releaseReason || "—"}</td>
                <td>{r.status === "active" && <button className="btn btn-danger btn-sm" onClick={()=>openModal("releaseReservation", r)}>Release</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

Object.assign(window, { WhMovementList, WhReservations });
