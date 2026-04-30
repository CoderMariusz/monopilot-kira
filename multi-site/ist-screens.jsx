// ============ MS-IST Inter-Site Transfers list + MS-IST-D detail + MS-IST-N create ============
// Cross-module: IST-0042 references Planning TO-2026-00016 (inter-factory),
// IST-0038 references Planning WO-2026-0108.

// -------- MS-IST list --------
// Tune-6b §2.14.2 — GHA auto-expand: in_transit and cancelled groups default-open,
// other status groups default-collapsed. Mirrors GitHub Actions job-list behaviour.
const IST_STATUS_DEFAULT_OPEN = { in_transit: true, cancelled: true, shipped: true };
const IST_STATUS_ORDER = ["in_transit", "cancelled", "shipped", "planned", "draft", "received", "closed"];
const IST_STATUS_LABEL = {
  in_transit: "In Transit", cancelled: "Cancelled", shipped: "Shipped",
  planned: "Planned", draft: "Draft", received: "Received", closed: "Closed",
};

const MsISTList = ({ role, site, onNav, onOpenIST, openModal }) => {
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [routeFilter, setRouteFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");
  // Tune-6b: track which status groups the user has toggled vs defaults.
  const [groupOpen, setGroupOpen] = React.useState(() => ({ ...IST_STATUS_DEFAULT_OPEN }));
  const toggleGroup = (st) => setGroupOpen(m => ({ ...m, [st]: !m[st] }));

  const isOperator = role === "Warehouse Operator" || role === "Operator";

  const filtered = MS_ISTS.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (routeFilter !== "all" && `${t.from}→${t.to}` !== routeFilter) return false;
    if (search && !t.id.toLowerCase().includes(search.toLowerCase())) return false;
    // Global site selector effect — when scope is single site, pre-filter to that site
    if (site !== "ALL" && t.from !== site && t.to !== site) return false;
    return true;
  });

  const routes = [...new Set(MS_ISTS.map(t => `${t.from}→${t.to}`))];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Inter-Site Transfers
          </div>
          <h1 className="page-title">Inter-Site Transfers</h1>
          <div className="muted" style={{fontSize:12}}>
            {filtered.length} transfers · {filtered.filter(t => t.status === "in_transit").length} currently in transit
            · cross-module: <span className="mono">IST-0042 → TO-2026-00016</span>, <span className="mono">IST-0038 → WO-2026-0108</span>
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("istCreate")}>＋ New Transfer</button>
        </div>
      </div>

      <AllSitesBanner site={site}/>

      <div className="filter-bar">
        <input placeholder="Search IST number, site, or item…" style={{width:260}} value={search} onChange={e=>setSearch(e.target.value)}/>
        {site === "ALL" && (
          <select style={{width:170}} value={routeFilter} onChange={e=>setRouteFilter(e.target.value)}>
            <option value="all">All Routes</option>
            {routes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <select style={{width:140}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="planned">Planned</option>
          <option value="shipped">Shipped</option>
          <option value="in_transit">In Transit</option>
          <option value="received">Received</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="spacer"></span>
        <button className="clear-all" onClick={()=>{setStatusFilter("all");setRouteFilter("all");setSearch("");}}>Clear</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr>
            <th>IST #</th>
            <th>From</th>
            <th>To</th>
            <th>Status</th>
            <th>Shipped</th>
            <th>ETA</th>
            <th>Lane</th>
            <th style={{textAlign:"right"}}>Items</th>
            {!isOperator && <th style={{textAlign:"right"}}>Freight</th>}
            <th>Linked</th>
            <th></th>
          </tr></thead>
          <tbody>
            {IST_STATUS_ORDER.map(st => {
              const groupRows = filtered.filter(t => t.status === st);
              if (groupRows.length === 0) return null;
              const isOpen = groupOpen[st];
              const tone = st === "in_transit" ? "warn" : st === "cancelled" ? "bad" : st === "closed" || st === "received" ? "ok" : "info";
              const colSpan = !isOperator ? 11 : 10;
              return (
                <React.Fragment key={st}>
                  <tr
                    className="ist-group-head"
                    onClick={(e) => { e.stopPropagation(); toggleGroup(st); }}
                    style={{cursor:"pointer", background:"var(--gray-050)"}}
                  >
                    <td colSpan={colSpan} style={{padding:"6px 10px", fontSize:11, fontWeight:600, color:"var(--muted)"}}>
                      <span style={{display:"inline-block", width:12, color:"var(--muted)"}}>{isOpen ? "▾" : "▸"}</span>
                      <span className={"badge tone-" + tone} style={{fontSize:10, marginRight:6, padding:"1px 7px", borderRadius:10, background: tone === "bad" ? "var(--sem-bad-bg, #fee2e2)" : tone === "warn" ? "var(--sem-warn-bg, #fef3c7)" : tone === "ok" ? "var(--sem-ok-bg, #dcfce7)" : "var(--sem-info-bg, #dbeafe)"}}>
                        {IST_STATUS_LABEL[st] || st}
                      </span>
                      <span className="mono" style={{fontWeight:500}}>{groupRows.length} transfer{groupRows.length === 1 ? "" : "s"}</span>
                      {(st === "in_transit" || st === "cancelled") && !isOpen && (
                        <span className="muted" style={{marginLeft:8, fontSize:10, fontStyle:"italic"}}>auto-expand off</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && groupRows.map(t => (
                    <tr key={t.id} className={t.status === "in_transit" ? "ist-row-in-transit" : ""} style={{cursor:"pointer"}} onClick={()=>onOpenIST(t.id)}>
                      <td className="mono" style={{fontWeight:700, color:"var(--blue)"}}>{t.id}</td>
                      <td><SiteRef id={t.from}/></td>
                      <td><SiteRef id={t.to}/></td>
                      <td><ISTStatus s={t.status}/></td>
                      <td className="muted mono" style={{fontSize:11}}>{t.shippedDate || "—"}</td>
                      <td><span className={"mono"} style={{fontSize:11, color: t.etaCls === "red" ? "var(--red-700)" : t.etaCls === "amber" ? "var(--amber-700)" : "var(--text)"}}>{t.eta}{t.etaCls === "red" && <span className="badge badge-red" style={{fontSize:9, marginLeft:4}}>Overdue</span>}</span></td>
                      <td className="mono" style={{fontSize:11}}>{t.lane}</td>
                      <td className="num mono">{t.items} items</td>
                      {!isOperator && <td className="num mono">{t.freight}</td>}
                      <td>
                        {t.relatedTO && <span className="mono" style={{fontSize:10, color:"var(--blue)"}}>TO {t.relatedTO.slice(-5)}</span>}
                        {t.relatedWO && <span className="mono" style={{fontSize:10, color:"var(--blue)"}}>WO {t.relatedWO.slice(-5)}</span>}
                        {!t.relatedTO && !t.relatedWO && <span className="muted" style={{fontSize:10}}>—</span>}
                      </td>
                      <td onClick={e=>e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>onOpenIST(t.id)}>👁️</button>
                        {(t.status === "draft" || t.status === "planned") && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("istAmend", t)}>✎</button>}
                        {t.status !== "closed" && t.status !== "cancelled" && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("istCancel", t)}>✕</button>}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <EmptyState
            icon="🏭"
            title="No transfers match your filters"
            body="Create your first inter-site transfer to move goods between sites, or clear the filters to see all records."
            action={{ label: "＋ New Transfer", onClick: () => openModal("istCreate") }}
          />
        )}
      </div>
    </>
  );
};

// -------- MS-IST-D detail --------
const MsISTDetail = ({ role, site, onNav, onBack, openModal }) => {
  const [tab, setTab] = React.useState("overview");
  const ist = MS_IST_DETAIL;
  const isFromMgr = role === "Site Manager";

  const states = ["draft","planned","shipped","in_transit","received","closed"];
  const curIdx = states.indexOf(ist.status);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={onBack}>Multi-Site</a> · <a onClick={()=>onNav("transfers")}>Transfers</a> · {ist.id}
          </div>
          <h1 className="page-title" style={{display:"flex", alignItems:"center", gap:10}}>
            <span className="mono">{ist.id}</span>
            <ISTStatus s={ist.status}/>
            <SiteRef id={ist.fromSite} compact/> → <SiteRef id={ist.toSite} compact/>
          </h1>
          <div className="muted" style={{fontSize:12}}>
            Lane <span className="mono">{ist.lane}</span> · Planned <span className="mono">{ist.plannedShipDate}</span> · ETA <span className="mono">{ist.eta}</span>
            {ist.reference && <> · Ref <span className="mono" style={{color:"var(--blue)"}}>{ist.reference}</span></>}
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("istAmend", ist)}>✎ Amend</button>
          <button className="btn btn-danger btn-sm" onClick={()=>openModal("istCancel", ist)}>Cancel</button>
          {ist.status === "draft" && <button className="btn btn-primary btn-sm">Submit for Approval</button>}
          {ist.status === "in_transit" && <button className="btn btn-primary btn-sm">Receive Goods (GRN)</button>}
          {ist.status === "received" && <button className="btn btn-primary btn-sm">Close IST</button>}
        </div>
      </div>

      {/* State machine progress bar */}
      <div className="ist-state-bar">
        {states.map((st, i) => (
          <React.Fragment key={st}>
            <div className={"ist-state-step " + (i < curIdx ? "done " : "") + (i === curIdx ? "current" : "")}>
              <div className="ist-state-circle">{i < curIdx ? "✓" : i + 1}</div>
              <div className="ist-state-label">{st.replace("_"," ")}</div>
            </div>
            {i < states.length - 1 && <div className={"ist-state-line " + (i < curIdx ? "done" : "")}></div>}
          </React.Fragment>
        ))}
      </div>

      {/* Approval widgets */}
      <div className="ms-info-grid">
        <div className="ms-info-card">
          <h3>From-Site Approval (FRZ-UK)</h3>
          {ist.fromMgrApprovedBy ? (
            <div style={{padding:"6px 0"}}>
              <div className="badge badge-green" style={{fontSize:10}}>✓ Approved</div>
              <div style={{fontSize:12, marginTop:6}}><b>{ist.fromMgrApprovedBy}</b> · <span className="muted mono">{ist.fromMgrApprovedAt}</span></div>
            </div>
          ) : (
            <div>
              <div className="badge badge-amber" style={{fontSize:10}}>Awaiting Approval</div>
              {isFromMgr && <button className="btn btn-primary btn-sm" style={{marginTop:8}}>Approve (From Site)</button>}
            </div>
          )}
        </div>
        <div className="ms-info-card">
          <h3>To-Site Approval (FRZ-DE)</h3>
          {ist.toMgrApprovedBy ? (
            <div><div className="badge badge-green" style={{fontSize:10}}>✓ Approved</div></div>
          ) : (
            <div>
              <div className="badge badge-amber" style={{fontSize:10}}>Awaiting Approval</div>
              <div className="muted" style={{fontSize:11, marginTop:6}}>The to-site manager (H. Müller) will be notified when goods arrive.</div>
              {isFromMgr && <button className="btn btn-secondary btn-sm" style={{marginTop:8}}>Pre-approve Receipt</button>}
            </div>
          )}
        </div>
      </div>

      <div className="ms-tabs">
        {[
          ["overview", "Overview"],
          ["items",    "Items & LPs", ist.items.length],
          ["outbound", "Outbound Shipping"],
          ["inbound",  "Inbound GRN"],
          ["docs",     "Docs"],
          ["audit",    "Audit", ist.timeline.length],
          ["finance",  "Finance"],
        ].map(([k,lab,c]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={()=>setTab(k)}>{lab} {c && <span className="tab-count">{c}</span>}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ms-info-grid">
          <div className="ms-info-card">
            <h3>IST Identity</h3>
            <div className="ms-info-field"><span className="mif-label">IST Number</span>    <span className="mif-value mono">{ist.id}</span></div>
            <div className="ms-info-field"><span className="mif-label">Status</span>        <span className="mif-value"><ISTStatus s={ist.status}/></span></div>
            <div className="ms-info-field"><span className="mif-label">From</span>          <span className="mif-value"><SiteRef id={ist.fromSite}/></span></div>
            <div className="ms-info-field"><span className="mif-label">To</span>            <span className="mif-value"><SiteRef id={ist.toSite}/></span></div>
            <div className="ms-info-field"><span className="mif-label">Lane</span>          <span className="mif-value mono">{ist.lane}</span></div>
            <div className="ms-info-field"><span className="mif-label">Carrier</span>       <span className="mif-value">{ist.carrier} · <span className="mono" style={{fontSize:10}}>{ist.carrierRef}</span></span></div>
            <div className="ms-info-field"><span className="mif-label">Planned Ship</span>  <span className="mif-value mono">{ist.plannedShipDate}</span></div>
            <div className="ms-info-field"><span className="mif-label">Actual Ship</span>   <span className="mif-value mono">{ist.actualShipDate}</span></div>
            <div className="ms-info-field"><span className="mif-label">ETA</span>           <span className="mif-value mono">{ist.eta}</span></div>
            <div className="ms-info-field"><span className="mif-label">Freight</span>       <span className="mif-value mono">{ist.freight} · {ist.costAllocation}</span></div>
            <div className="ms-info-field"><span className="mif-label">Internal Notes</span><span className="mif-value">{ist.notes}</span></div>
            <div className="ms-info-field"><span className="mif-label">Reference</span>     <span className="mif-value mono" style={{color:"var(--blue)"}}>{ist.reference}</span></div>
            <div className="ms-info-field"><span className="mif-label">Created By</span>    <span className="mif-value">{ist.createdBy} · <span className="muted mono">{ist.createdAt}</span></span></div>
          </div>
          <div className="ms-info-card">
            <h3>Documents</h3>
            <div style={{padding:"10px 0", display:"flex", flexDirection:"column", gap:6}}>
              <div style={{fontSize:12}}>📄 Packing slip — <a style={{color:"var(--blue)", cursor:"pointer"}}>PS-{ist.id}.pdf</a></div>
              <div style={{fontSize:12}}>📄 BOL — <a style={{color:"var(--blue)", cursor:"pointer"}}>{ist.outbound.bol}.pdf</a></div>
              <div style={{fontSize:12}}>📄 Temperature log — <a style={{color:"var(--blue)", cursor:"pointer"}}>TempLog-2026-04-20.pdf</a></div>
              <button className="btn btn-secondary btn-sm" style={{marginTop:8, alignSelf:"flex-start"}}>＋ Attach document</button>
            </div>
          </div>
        </div>
      )}

      {tab === "items" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>#</th><th>Item Code</th><th>Item Name</th><th style={{textAlign:"right"}}>Planned</th><th style={{textAlign:"right"}}>Shipped</th><th style={{textAlign:"right"}}>Received</th><th>Unit</th><th>LP(s)</th><th>Status</th></tr></thead>
            <tbody>
              {ist.items.map(i => (
                <tr key={i.seq}>
                  <td className="num mono">{i.seq}</td>
                  <td className="mono" style={{fontWeight:600}}>{i.code}</td>
                  <td>{i.name}</td>
                  <td className="num mono">{i.plannedQty}</td>
                  <td className="num mono">{i.shippedQty ?? "—"}</td>
                  <td className="num mono">{i.receivedQty ?? "—"}</td>
                  <td>{i.uom}</td>
                  <td>{i.lps.map(lp => <span key={lp} className="mono" style={{fontSize:10, color:"var(--blue)", marginRight:4, background:"var(--blue-050)", padding:"1px 6px", borderRadius:3}}>{lp}</span>)}</td>
                  <td><span className={"badge " + (i.status === "shipped" ? "badge-amber" : i.status === "received" ? "badge-blue" : "badge-gray")} style={{fontSize:9}}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "outbound" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Outbound shipping ({ist.outbound.so})</h3><button className="btn btn-secondary btn-sm">View Full Shipment →</button></div>
          <div className="ms-info-card" style={{border:0, padding:0}}>
            <div className="ms-info-field"><span className="mif-label">Shipment #</span><span className="mif-value mono">{ist.outbound.so}</span></div>
            <div className="ms-info-field"><span className="mif-label">Carrier</span><span className="mif-value">{ist.carrier}</span></div>
            <div className="ms-info-field"><span className="mif-label">BOL</span><span className="mif-value mono">{ist.outbound.bol}</span></div>
            <div className="ms-info-field"><span className="mif-label">Ship Date</span><span className="mif-value mono">{ist.outbound.shipDate}</span></div>
            <div className="ms-info-field"><span className="mif-label">Inter-Site Flag</span><span className="mif-value"><span className="badge badge-blue" style={{fontSize:9}}>inter_site=true</span></span></div>
          </div>
          <div className="muted" style={{fontSize:11, marginTop:10, padding:"8px 0", borderTop:"1px dashed var(--border)"}}>
            This outbound shipment was auto-generated by IST creation. Full shipping document lives in <b>11-SHIPPING</b>.
          </div>
        </div>
      )}

      {tab === "inbound" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Inbound GRN</h3><button className="btn btn-secondary btn-sm">Open GRN →</button></div>
          <div className="alert-amber alert-box" style={{fontSize:12}}>
            <span>⏳</span><div>GRN placeholder <b className="mono">{ist.inbound.grn}</b> is pending. It will become fully editable at destination once the IST is marked as received.</div>
          </div>
        </div>
      )}

      {tab === "docs" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Documents</h3><button className="btn btn-primary btn-sm">＋ Upload</button></div>
          <table>
            <thead><tr><th>Document Name</th><th>Type</th><th>Uploaded At</th><th></th></tr></thead>
            <tbody>
              <tr><td className="mono">PS-IST-0042.pdf</td><td>Packing slip</td><td className="muted" style={{fontSize:11}}>2026-04-19 16:02</td><td><button className="btn btn-ghost btn-sm">⇩</button><button className="btn btn-ghost btn-sm">Delete</button></td></tr>
              <tr><td className="mono">BOL-2026-0551.pdf</td><td>BOL</td><td className="muted" style={{fontSize:11}}>2026-04-20 13:22</td><td><button className="btn btn-ghost btn-sm">⇩</button><button className="btn btn-ghost btn-sm">Delete</button></td></tr>
              <tr><td className="mono">TempLog-2026-04-20.pdf</td><td>Temp log</td><td className="muted" style={{fontSize:11}}>2026-04-20 18:44</td><td><button className="btn btn-ghost btn-sm">⇩</button><button className="btn btn-ghost btn-sm">Delete</button></td></tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Audit timeline ({ist.timeline.length})</h3><button className="btn btn-secondary btn-sm">⇪ Export Audit PDF</button></div>
          <div className="activity-feed ms-audit-list">
            {ist.timeline.slice().reverse().map((e, i) => (
              <div key={i} className="tl-item">
                <span className={"tl-dot " + e.color}></span>
                <div>
                  <div><b>{e.user}</b> · {e.desc}</div>
                  <div className="tl-sub">State: <span className="mono">{e.state}</span></div>
                </div>
                <div className="tl-time">{e.t}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "finance" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Inter-Company Finance Charge</h3>{role === "Admin" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("postCharge", ist)}>Post Inter-Company Charge</button>}</div>
          <div className="ms-info-card" style={{border:0, padding:0}}>
            <div className="ms-info-field"><span className="mif-label">Freight Cost</span>     <span className="mif-value mono">{ist.freight}</span></div>
            <div className="ms-info-field"><span className="mif-label">Allocation</span>      <span className="mif-value">Receiver (to-site bears cost)</span></div>
            <div className="ms-info-field"><span className="mif-label">From Account</span>    <span className="mif-value mono">CC-FRZ-UK-WH</span></div>
            <div className="ms-info-field"><span className="mif-label">To Account</span>      <span className="mif-value mono">CC-FRZ-DE-WH</span></div>
            <div className="ms-info-field"><span className="mif-label">Finance Status</span>  <span className="mif-value"><span className="badge badge-amber" style={{fontSize:10}}>Pending</span></span></div>
            <div className="ms-info-field"><span className="mif-label">Journal Entry</span>   <span className="mif-value muted">(not yet posted)</span></div>
          </div>
          <div className="muted" style={{fontSize:11, marginTop:10}}>Posting will create a journal entry in both sites' ledgers (10-FINANCE) and mark this transfer as financially closed.</div>
        </div>
      )}
    </>
  );
};

// -------- MS-IST-N create (single-page form with progressive disclosure) --------
const MsISTCreate = ({ site, onNav, onBack }) => {
  const [fromSite, setFromSite] = React.useState("SITE-A");
  const [toSite, setToSite] = React.useState("SITE-B");
  const [lane, setLane] = React.useState("LN-001");
  const [shipDate, setShipDate] = React.useState("2026-04-22");
  const [eta, setEta] = React.useState("2026-04-24");
  const [freight, setFreight] = React.useState(340);
  const [allocation, setAllocation] = React.useState("receiver");
  const [items, setItems] = React.useState([
    { item: "PRD-0042", name: "Chicken Nuggets 1kg", qty: 500, uom: "pcs", availability: "green", lps: ["LP-0083","LP-0084"] },
    { item: "PRD-0050", name: "Chicken Wings 2kg",   qty: 100, uom: "pcs", availability: "amber", lps: [] },
  ]);

  const sameSite = fromSite === toSite;
  const etaAfter = eta > shipDate;

  const addItem = () => setItems([...items, { item: "", name: "", qty: 0, uom: "kg", availability: "green", lps: [] }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={onBack}>Multi-Site</a> · <a onClick={()=>onNav("transfers")}>Transfers</a> · New
          </div>
          <h1 className="page-title">New Inter-Site Transfer</h1>
          <div className="muted" style={{fontSize:12}}>Create a new IST. On save, outbound shipping record + inbound GRN placeholder are auto-generated. Source LPs are hard-locked.</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>Cancel</button>
        </div>
      </div>

      <div className="card" style={{padding:"20px 24px"}}>
        {/* Section 1 — Route */}
        <h3 className="card-title" style={{marginBottom:10}}>1. Route</h3>
        <div className="ff-inline">
          <Field label="From Site" required error={sameSite ? "From site and To site cannot be the same." : null}>
            <select value={fromSite} onChange={e=>setFromSite(e.target.value)}>
              {MS_SITES.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </Field>
          <Field label="To Site" required>
            <select value={toSite} onChange={e=>setToSite(e.target.value)}>
              {MS_SITES.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </Field>
        </div>
        {!sameSite && (
          <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:14}}>
            <span>ⓘ</span>
            <div>Route: <b className="mono">{fromSite} → {toSite}</b> · Default Lane: <b className="mono">{lane}</b> · Avg Lead Time: <b>2 days</b></div>
          </div>
        )}

        {/* Section 2 — Transport */}
        <h3 className="card-title" style={{marginBottom:10, marginTop:20, paddingTop:14, borderTop:"1px solid var(--border)"}}>2. Transport</h3>
        <div className="ff-inline">
          <Field label="Transport Lane" help="Auto-suggested based on sites chosen">
            <select value={lane} onChange={e=>setLane(e.target.value)}>
              {MS_LANES.filter(l => l.from === fromSite && l.to === toSite).map(l => <option key={l.id} value={l.id}>{l.id} — {l.carriers.join(", ")}</option>)}
              {MS_LANES.filter(l => l.from !== fromSite || l.to !== toSite).map(l => <option key={l.id} value={l.id}>{l.id} (alt route)</option>)}
            </select>
          </Field>
          <Field label="Planned Ship Date" required>
            <input type="date" value={shipDate} onChange={e=>setShipDate(e.target.value)}/>
          </Field>
          <Field label="Expected Arrival (ETA)" required error={!etaAfter ? "ETA must be after planned ship date." : null}>
            <input type="date" value={eta} onChange={e=>setEta(e.target.value)}/>
          </Field>
          <Field label="Carrier Reference">
            <input placeholder="DHL-789012" maxLength={100}/>
          </Field>
          <Field label="Freight Cost (£)">
            <input type="number" value={freight} onChange={e=>setFreight(+e.target.value)} min={0} step="0.01"/>
          </Field>
          <Field label="Cost Allocation" required>
            <select value={allocation} onChange={e=>setAllocation(e.target.value)}>
              <option value="sender">Sender</option>
              <option value="receiver">Receiver</option>
              <option value="split">Split (ratio below)</option>
              <option value="none">None</option>
            </select>
          </Field>
        </div>
        {freight > 0 && allocation === "none" && (
          <div className="alert-amber alert-box" style={{fontSize:12}}><span>⚠</span><div>Freight cost is set but allocation method is "None". The cost will not be allocated to either site.</div></div>
        )}

        {/* Section 3 — Items */}
        <h3 className="card-title" style={{marginBottom:10, marginTop:20, paddingTop:14, borderTop:"1px solid var(--border)"}}>3. Items ({items.length})</h3>
        <table>
          <thead><tr>
            <th>Item</th><th>Description</th>
            <th style={{textAlign:"right"}}>Qty</th>
            <th>Unit</th><th>Planned LP(s)</th><th>Availability</th><th></th>
          </tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td><input value={it.item} onChange={e=>{ const n=[...items]; n[i]={...it, item: e.target.value}; setItems(n); }} placeholder="Search product…" style={{width:120, fontFamily:"var(--font-mono)", fontSize:11}}/></td>
                <td style={{fontSize:11}}>{it.name || <span className="muted">Auto-filled</span>}</td>
                <td><input type="number" value={it.qty} onChange={e=>{ const n=[...items]; n[i]={...it, qty: +e.target.value}; setItems(n); }} style={{width:80, textAlign:"right", fontFamily:"var(--font-mono)"}}/></td>
                <td>{it.uom}</td>
                <td>{it.lps.map(lp => <span key={lp} className="mono" style={{fontSize:10, marginRight:4, background:"var(--blue-050)", padding:"1px 6px", borderRadius:3, color:"var(--blue)"}}>🔒 {lp}</span>)}
                    <button className="btn btn-ghost btn-sm">＋ LP</button>
                </td>
                <td>
                  {it.availability === "green" && <span className="badge badge-green" style={{fontSize:9}}>● Available</span>}
                  {it.availability === "amber" && <span className="badge badge-amber" style={{fontSize:9}}>● Borderline</span>}
                  {it.availability === "red"   && <span className="badge badge-red" style={{fontSize:9}}>● Insufficient</span>}
                </td>
                <td><button className="btn btn-ghost btn-sm" onClick={()=>removeItem(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-secondary btn-sm" style={{marginTop:8}} onClick={addItem}>＋ Add Item</button>

        {items.some(i => i.availability === "red") && (
          <div className="alert-amber alert-box" style={{fontSize:12, marginTop:10}}><span>⚠</span><div>One or more items have insufficient stock at the source site. The IST will be created but LPs cannot be pre-locked for those items.</div></div>
        )}

        {/* Section 4 — Notes */}
        <h3 className="card-title" style={{marginBottom:10, marginTop:20, paddingTop:14, borderTop:"1px solid var(--border)"}}>4. Notes</h3>
        <div className="ff-inline">
          <Field label="Internal Notes">
            <textarea placeholder="Visible to internal users only…" maxLength={1000} style={{minHeight:60}}/>
          </Field>
          <Field label="Reference (PO / WO / TO)">
            <input placeholder="e.g., TO-2026-00016"/>
          </Field>
        </div>

        {/* Form actions */}
        <div className="row-flex" style={{marginTop:20, paddingTop:14, borderTop:"1px solid var(--border)"}}>
          <span className="muted" style={{fontSize:11}}>On Create Transfer: outbound shipment + inbound GRN auto-generated. LPs hard-locked.</span>
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm">Save as Draft</button>
          <button className="btn btn-primary btn-sm" disabled={sameSite || !etaAfter}>Create Transfer</button>
        </div>
      </div>
    </>
  );
};

// -------- MS-LANE list + detail --------
const MsLanesList = ({ role, site, onNav, onOpenLane, openModal }) => {
  const isAdmin = role === "Admin";
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Transport Lanes
          </div>
          <h1 className="page-title">Transport Lanes</h1>
          <div className="muted" style={{fontSize:12}}>{MS_LANES.length} lanes configured · {MS_LANES.filter(l=>l.health==="active").length} active · {MS_LANES.filter(l=>l.health==="stale").length} stale · {MS_LANES.filter(l=>l.health==="failed").length} failed</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={()=>openModal("laneCreate")}>＋ Add Lane</button>}
        </div>
      </div>

      <div className="filter-bar">
        <input placeholder="Search lane code or sites…" style={{width:260}}/>
        <select style={{width:170}}><option>All From Sites</option>{MS_SITES.map(s=><option key={s.id}>{s.code}</option>)}</select>
        <select style={{width:170}}><option>All To Sites</option>{MS_SITES.map(s=><option key={s.id}>{s.code}</option>)}</select>
        <select style={{width:140}}><option>Active</option><option>Inactive</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr>
            <th>Lane #</th><th>From</th><th>To</th><th>Carriers</th>
            <th style={{textAlign:"right"}}>Lead Time</th><th style={{textAlign:"right"}}>Cost/km</th>
            <th>Health</th><th style={{width:120}}>Last 8 ISTs</th><th></th>
          </tr></thead>
          <tbody>
            {MS_LANES.map(l => (
              <tr key={l.id} style={{cursor:"pointer"}} onClick={()=>onOpenLane(l.id)}>
                <td className="mono" style={{fontWeight:700, color:"var(--blue)"}}>{l.id}</td>
                <td><SiteRef id={l.from}/></td>
                <td><SiteRef id={l.to}/></td>
                <td style={{fontSize:11}}>{l.carriers.join(", ")}</td>
                <td className="num mono">{l.leadDays}d</td>
                <td className="num mono">{l.costKm}</td>
                <td><LaneHealth s={l.health}/></td>
                <td><RunStrip outcomes={buildLaneRunCells(l)}/></td>
                <td onClick={e=>e.stopPropagation()}>
                  {isAdmin && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("laneCreate", {edit: true, lane: l})}>✏️</button>}
                  <button className="btn btn-ghost btn-sm" onClick={()=>openModal("rateCard", l)}>⇪ Rate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const MsLaneDetail = ({ role, site, onBack, onNav, openModal, laneId }) => {
  const [tab, setTab] = React.useState("overview");
  const lane = MS_LANES.find(l => l.id === laneId) || MS_LANES[0];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={onBack}>Multi-Site</a> · <a onClick={()=>onNav("lanes")}>Lanes</a> · {lane.id}
          </div>
          <h1 className="page-title">Lane {lane.id}: <SiteRef id={lane.from} compact/> → <SiteRef id={lane.to} compact/></h1>
          <div className="muted" style={{fontSize:12}}><LaneHealth s={lane.health}/> · {lane.distanceKm} km · {lane.mode}</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("laneCreate", {edit: true, lane})}>✏️ Edit Lane</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("rateCard", lane)}>⇪ Upload Rate Card</button>
          <button className="btn btn-danger btn-sm">Deactivate</button>
        </div>
      </div>

      <div className="ms-tabs">
        {[["overview","Overview"],["rates","Rates", MS_LANE_RATES.length],["history","History"],["constraints","Constraints"]].map(([k,lab,c]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={()=>setTab(k)}>{lab} {c && <span className="tab-count">{c}</span>}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ms-info-grid">
          <div className="ms-info-card">
            <h3>Lane Identity</h3>
            <div className="ms-info-field"><span className="mif-label">Lane #</span>        <span className="mif-value mono">{lane.id}</span></div>
            <div className="ms-info-field"><span className="mif-label">From Site</span>     <span className="mif-value"><SiteRef id={lane.from}/></span></div>
            <div className="ms-info-field"><span className="mif-label">To Site</span>       <span className="mif-value"><SiteRef id={lane.to}/></span></div>
            <div className="ms-info-field"><span className="mif-label">Distance</span>      <span className="mif-value mono">{lane.distanceKm} km</span></div>
            <div className="ms-info-field"><span className="mif-label">Transit Time</span>  <span className="mif-value mono">{lane.leadDays} days (scheduled)</span></div>
            <div className="ms-info-field"><span className="mif-label">Mode</span>          <span className="mif-value">{lane.mode}</span></div>
            <div className="ms-info-field"><span className="mif-label">Active</span>        <span className="mif-value"><span className={"badge " + (lane.active ? "badge-green" : "badge-gray")} style={{fontSize:10}}>{lane.active ? "Active" : "Inactive"}</span></span></div>
          </div>
          <div className="ms-info-card">
            <h3>Health</h3>
            <div className="ms-info-field"><span className="mif-label">Last IST</span>      <span className="mif-value mono" style={{color:"var(--blue)"}}>IST-0034</span></div>
            <div className="ms-info-field"><span className="mif-label">Avg Lead Time</span> <span className="mif-value mono">{lane.leadDays}d</span></div>
            <div className="ms-info-field"><span className="mif-label">On-Time %</span>     <span className="mif-value mono">92%</span></div>
            <div className="ms-info-field"><span className="mif-label">Status</span>        <span className="mif-value"><LaneHealth s={lane.health}/></span></div>
          </div>
        </div>
      )}

      {tab === "rates" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}>
            <h3 className="card-title">Rate cards</h3>
            <div className="row-flex">
              <button className="btn btn-secondary btn-sm">＋ Add Rate</button>
              <button className="btn btn-primary btn-sm" onClick={()=>openModal("rateCard", lane)}>⇪ Upload CSV</button>
            </div>
          </div>
          <table>
            <thead><tr><th>Carrier</th><th>Type</th><th style={{textAlign:"right"}}>Rate</th><th>Currency</th><th>From</th><th>To</th><th>Status</th><th>Uploaded By</th><th></th></tr></thead>
            <tbody>
              {MS_LANE_RATES.map((r,i) => (
                <tr key={i}>
                  <td>{r.carrier}</td>
                  <td>{r.type}</td>
                  <td className="num mono">{r.rate}</td>
                  <td className="mono">{r.currency}</td>
                  <td className="muted mono" style={{fontSize:11}}>{r.from}</td>
                  <td className="muted mono" style={{fontSize:11}}>{r.to}</td>
                  <td><span className={"badge " + (r.status === "Active" ? "badge-green" : "badge-gray")} style={{fontSize:10}}>{r.status}</span></td>
                  <td style={{fontSize:11}}>{r.by}</td>
                  <td><button className="btn btn-ghost btn-sm">⇩</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "history" && (
        <>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Shipments per month (last 12)</h3></div>
            <div style={{padding:"10px 14px 4px"}}>
              <MsSparkline
                data={[4,6,3,5,8,7,9,10,6,8,14,12]}
                labels={["M","J","J","A","S","O","N","D","J","F","M","A"]}
                color="var(--blue)"
              />
            </div>
          </div>
          <div className="card" style={{marginTop:12}}>
            <div className="card-head"><h3 className="card-title">Recent ISTs on this lane</h3></div>
            <table>
              <thead><tr><th>IST#</th><th>Status</th><th>Shipped</th><th style={{textAlign:"right"}}>Freight</th><th>Lead Actual</th></tr></thead>
              <tbody>
                {MS_ISTS.filter(t => t.lane === lane.id).slice(0,8).map(t => (
                  <tr key={t.id}><td className="mono" style={{color:"var(--blue)"}}>{t.id}</td><td><ISTStatus s={t.status}/></td><td className="muted mono" style={{fontSize:11}}>{t.shippedDate || "—"}</td><td className="num mono">{t.freight}</td><td className="mono">2.1d</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "constraints" && (
        <div className="card" style={{padding:20}}>
          <table style={{fontSize:13}}>
            <tbody>
              <tr><td style={{width:240, color:"var(--muted)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600}}>HAZMAT Allowed</td><td>{lane.hazmat ? <span className="badge badge-red" style={{fontSize:10}}>Yes</span> : <span className="badge badge-gray" style={{fontSize:10}}>No</span>}</td></tr>
              <tr><td style={{color:"var(--muted)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600}}>Cold Chain Required</td><td>{lane.coldChain ? <span className="badge badge-blue" style={{fontSize:10}}>Yes</span> : <span className="badge badge-gray" style={{fontSize:10}}>No</span>}</td></tr>
              <tr><td style={{color:"var(--muted)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600}}>Max Shipment Weight</td><td className="mono">{lane.maxWeight.toLocaleString()} kg</td></tr>
              <tr><td style={{color:"var(--muted)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600}}>Customs Required</td><td>{lane.customs ? <span className="badge badge-amber" style={{fontSize:10}}>Yes</span> : <span className="badge badge-gray" style={{fontSize:10}}>No</span>}</td></tr>
              <tr><td style={{color:"var(--muted)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600}}>Customs Notes</td><td style={{fontSize:12}}>{lane.notes}</td></tr>
              <tr><td style={{color:"var(--muted)", fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600}}>Carriers</td><td>{lane.carriers.map(c => <span key={c} className="badge badge-gray" style={{fontSize:10, marginRight:4}}>{c}</span>)}</td></tr>
            </tbody>
          </table>
          <button className="btn btn-secondary btn-sm" style={{marginTop:14}}>✏️ Edit Constraints</button>
        </div>
      )}
    </>
  );
};

Object.assign(window, { MsISTList, MsISTDetail, MsISTCreate, MsLanesList, MsLaneDetail });
