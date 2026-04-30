// ============ WH-010 GRN List + GRN Detail ============

const WhGRNList = ({ onOpenGrn, onNav, openModal }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const tabs = [
    { k: "all",       l: "All",       c: WH_GRNS.length,                                          tone: "neutral" },
    { k: "draft",     l: "Draft",     c: WH_GRNS.filter(g => g.status === "draft").length,       tone: "warn" },
    { k: "completed", l: "Completed", c: WH_GRNS.filter(g => g.status === "completed").length,   tone: "ok" },
    { k: "cancelled", l: "Cancelled", c: WH_GRNS.filter(g => g.status === "cancelled").length,   tone: "neutral" },
  ];

  const visible = WH_GRNS.filter(g =>
    (tab === "all" || g.status === tab) &&
    (!search ||
      g.id.toLowerCase().includes(search.toLowerCase()) ||
      g.srcDoc.toLowerCase().includes(search.toLowerCase()) ||
      g.supplier.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Goods receipts</div>
          <h1 className="page-title">Goods receipts (GRN)</h1>
          <div className="muted" style={{fontSize:12}}>{WH_GRNS.length} GRNs · 1 draft · {WH_GRNS.filter(g=>g.status==="completed").length} completed · {WH_GRNS.filter(g=>g.srcType==="po").length} from PO, {WH_GRNS.filter(g=>g.srcType==="to").length} from TO</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("grnTO")}>＋ Receive from TO</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("grnPO")}>＋ Receive from PO</button>
        </div>
      </div>

      <TabsCounted
        current={tab}
        onChange={setTab}
        ariaLabel="GRN status filter"
        tabs={tabs.map(t => ({ key: t.k, label: t.l, count: t.c, tone: t.tone }))}
      />

      <div className="filter-bar">
        <input type="text" placeholder="Search GRN#, PO#, supplier…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
        <select style={{width:130}}><option>All sources</option><option>From PO</option><option>From TO</option><option>Return</option></select>
        <select style={{width:160}}><option>All warehouses</option><option>WH-Factory-A</option><option>WH-Factory-B</option></select>
        <input type="date" placeholder="From date" style={{width:130}}/>
        <input type="date" placeholder="To date" style={{width:130}}/>
        <select style={{width:160}}><option>All suppliers</option><option>Agro-Fresh Ltd.</option><option>Baltic Pork Co.</option><option>Spice Masters</option><option>Viscofan S.A.</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear filters</button>
        <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
      </div>

      {visible.length === 0 && (
        <div className="card" style={{padding:0}}>
          <EmptyState
            icon="📥"
            title="No goods receipts"
            body={search ? "Try clearing the search or pick a different tab." : "Receive goods from a PO or TO to create your first GRN."}
            action={{ label: "＋ Receive from PO", onClick: ()=>openModal("grnPO") }}
          />
        </div>
      )}
      {visible.length > 0 && (
      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th>GRN</th><th>Source</th><th>Source doc</th><th>Supplier / From</th><th>Receipt date</th><th>Warehouse</th><th>Status</th><th style={{textAlign:"right"}}>Lines</th><th style={{textAlign:"right"}}>Total qty</th><th>Received by</th></tr></thead>
          <tbody>
            {visible.map(g => (
              <tr key={g.id} style={{cursor:"pointer"}} onClick={()=>onOpenGrn(g.id)}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{g.id}</td>
                <td><span className="badge badge-gray" style={{fontSize:9}}>{g.srcType.toUpperCase()}</span></td>
                <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{g.srcDoc}</td>
                <td>{g.supplier}</td>
                <td className="mono" style={{fontSize:11}}>{g.receiptDate}</td>
                <td className="mono" style={{fontSize:11}}>{g.warehouse}</td>
                <td><GRNStatus s={g.status}/></td>
                <td className="num mono">{g.lines}</td>
                <td className="num mono">{g.totalQty}</td>
                <td style={{fontSize:11}}>{g.receivedBy}</td>
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
// GRN Detail — read-only snapshot of completed GRN
// =================================================================

const WhGRNDetail = ({ onBack, onNav, onOpenLp }) => {
  const g = WH_GRN_DETAIL;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Warehouse</a> · <a onClick={onBack}>Goods receipts</a> · <span className="mono">{g.id}</span></div>
          <h1 className="page-title"><span className="mono">{g.id}</span> — {g.supplier}</h1>
          <div className="muted" style={{fontSize:12}}>{g.srcType.toUpperCase()} <span className="mono">{g.srcDoc}</span> · Received {g.receiptDate} by {g.receivedBy} · {g.items.length} LPs created · {g.warehouse}</div>
        </div>
        <div className="row-flex">
          <GRNStatus s={g.status}/>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("lps")}>View all LPs from this GRN →</button>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
        </div>
      </div>

      <div className="wo-summary-bar">
        <div className="wsb-item"><div className="wsb-label">Source</div><div className="wsb-value">{g.srcType.toUpperCase()} · <span style={{color:"var(--blue)", cursor:"pointer"}}>{g.srcDoc}</span></div></div>
        <div className="wsb-item"><div className="wsb-label">Supplier</div><div className="wsb-value">{g.supplier} · {g.supplierCode}</div></div>
        <div className="wsb-item"><div className="wsb-label">Receipt date</div><div className="wsb-value">{g.receiptDate}</div></div>
        <div className="wsb-item"><div className="wsb-label">Default location</div><div className="wsb-value">{g.defaultLoc.join(" › ")}</div></div>
        <div className="wsb-item"><div className="wsb-label">Received by</div><div className="wsb-value">{g.receivedBy}</div></div>
      </div>

      {g.notes && (
        <div className="card" style={{padding:"10px 14px", marginBottom:10, fontSize:12, background:"var(--gray-050)"}}>
          <b>Notes:</b> {g.notes}
        </div>
      )}

      <div className="card" style={{padding:0, marginBottom:12}}>
        <div className="card-head">
          <h3 className="card-title">LPs created ({g.items.length})</h3>
        </div>
        <table>
          <thead><tr><th>Line</th><th>Product</th><th>LP created</th><th style={{textAlign:"right"}}>Qty</th><th>Batch</th><th>Supplier batch</th><th>Expiry</th><th>Location</th><th>QA</th><th style={{textAlign:"right"}}>Catch weight</th></tr></thead>
          <tbody>
            {g.items.map((it, i) => (
              <tr key={i} style={{cursor:"pointer"}} onClick={()=>onOpenLp(it.lp)}>
                <td className="mono">{it.line}</td>
                <td>{it.product}</td>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{it.lp}</td>
                <td className="num mono">{it.qty} {it.uom}</td>
                <td className="mono" style={{fontSize:11}}>{it.batch}</td>
                <td className="mono" style={{fontSize:11, color:"var(--muted)"}}>{it.supplierBatch}</td>
                <td><ExpiryCell date={it.expiry} days={30}/></td>
                <td><Ltree path={it.loc}/></td>
                <td><QAStatus s={it.qa}/></td>
                <td className="num mono">{it.cw ? it.cw + " kg" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Status history</h3></div>
        <div className="activity-feed">
          {g.statusHistory.map((h, i) => (
            <div key={i} className="tl-item">
              <span className={"tl-dot " + (h.to === "completed" ? "green" : "gray")}></span>
              <div>
                <div>Transitioned from <b className="mono">{h.from || "∅"}</b> to <b className="mono">{h.to}</b> by <b>{h.user}</b> — <span className="muted">{h.action}</span></div>
                {h.notes && <div className="tl-sub">{h.notes}</div>}
              </div>
              <div className="tl-time">{h.t}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

Object.assign(window, { WhGRNList, WhGRNDetail });
