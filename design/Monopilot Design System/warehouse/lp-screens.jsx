// ============ WH-002 LP List + WH-003 LP Detail ============

const WhLPList = ({ onOpenLp, onNav, openModal }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [showMore, setShowMore] = React.useState(false);

  const tabs = [
    { k: "all",       l: "All",       c: WH_LPS.length,                                                                   tone: "neutral" },
    { k: "available", l: "Available", c: WH_LPS.filter(l => l.status === "available").length,                             tone: "ok" },
    { k: "reserved",  l: "Reserved",  c: WH_LPS.filter(l => l.status === "reserved").length,                              tone: "info" },
    { k: "blocked",   l: "Blocked",   c: WH_LPS.filter(l => l.status === "blocked").length,                               tone: "bad" },
    { k: "hold",      l: "QC Hold",   c: WH_LPS.filter(l => l.qa === "HOLD" || l.qa === "PENDING").length,                tone: "warn" },
    { k: "intermediate", l: "Intermediate", c: WH_LPS.filter(l => l.itemType === "intermediate").length,                  tone: "neutral" },
  ];

  const visible = WH_LPS.filter(l =>
    (tab === "all" ? true :
     tab === "hold" ? (l.qa === "HOLD" || l.qa === "PENDING") :
     tab === "intermediate" ? l.itemType === "intermediate" :
     l.status === tab) &&
    (!search ||
      l.lp.toLowerCase().includes(search.toLowerCase()) ||
      l.product.toLowerCase().includes(search.toLowerCase()) ||
      l.productName.toLowerCase().includes(search.toLowerCase()) ||
      (l.batch || "").toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(l => l.lp)));
  };

  // derive expiry days vs today 2026-04-21
  const expiryDays = (date) => {
    const today = new Date("2026-04-21");
    const exp = new Date(date);
    return Math.floor((exp - today) / (1000 * 60 * 60 * 24));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · License plates</div>
          <h1 className="page-title">License plates</h1>
          <div className="muted" style={{fontSize:12}}>{WH_LPS.length} LPs · {WH_LPS.filter(l=>l.status==="reserved").length} reserved · {WH_LPS.filter(l=>l.qa==="HOLD").length} on QC hold · {WH_LPS.filter(l=>l.status==="blocked").length} blocked</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("stockMove", { mode: "adjustment_in" })}>＋ New LP (adjustment)</button>
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("grnPO")}>＋ Receive goods</button>
        </div>
      </div>

      {/* Mini KPI strip */}
      <div className="kpi-row-8">
        <div className="kpi green"><div className="kpi-label">Available</div><div className="kpi-value">{WH_LPS.filter(l=>l.status==="available").length}</div><div className="kpi-sub">Ready for pick / move</div></div>
        <div className="kpi"><div className="kpi-label">Reserved</div><div className="kpi-value">{WH_LPS.filter(l=>l.status==="reserved").length}</div><div className="kpi-sub">Hard-locked to WOs</div></div>
        <div className="kpi amber"><div className="kpi-label">QC Hold</div><div className="kpi-value">{WH_LPS.filter(l=>l.qa==="HOLD" || l.qa==="PENDING").length}</div><div className="kpi-sub">Pending release</div></div>
        <div className="kpi red"><div className="kpi-label">Blocked</div><div className="kpi-value">{WH_LPS.filter(l=>l.status==="blocked").length}</div><div className="kpi-sub">Use_by expired</div></div>
      </div>

      {/* Tabs */}
      <TabsCounted
        current={tab}
        onChange={setTab}
        ariaLabel="LP status filter"
        tabs={tabs.map(t => ({ key: t.k, label: t.l, count: t.c, tone: t.tone }))}
      />

      {/* Filter bar */}
      <div className="filter-bar">
        <input type="text" placeholder="Search LP#, product, batch… (press / to focus)" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
        <select style={{width:140}}><option>All statuses</option><option>Available</option><option>Reserved</option><option>Blocked</option><option>Consumed</option><option>Shipped</option><option>Merged</option></select>
        <select style={{width:140}}><option>All QA statuses</option><option>PENDING</option><option>PASSED</option><option>HOLD</option><option>FAILED</option><option>RELEASED</option><option>COND_APPROVED</option><option>QUARANTINED</option></select>
        <button className="btn btn-ghost btn-sm" onClick={()=>setShowMore(!showMore)}>{showMore ? "▲ Fewer filters" : "▼ More filters"}</button>
        <span className="spacer"></span>
        <button className="clear-all">Clear all filters</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      {showMore && (
        <div className="filter-bar" style={{marginTop:-8}}>
          <select style={{width:160}}><option>All warehouses</option><option>WH-Factory-A</option><option>WH-Factory-B</option><option>WH-DistCentral</option></select>
          <select style={{width:160}}><option>All locations</option><option>Cold › B1</option><option>Cold › B2</option><option>Cold › B3</option><option>Dry › A2</option><option>Dry › A4</option><option>Dry › A5</option></select>
          <select style={{width:150}}><option>All products</option><option>R-1001 Wieprzowina</option><option>R-1501 Mąka</option><option>IN1301 Farsz</option></select>
          <select style={{width:140}}><option>All item types</option><option>raw_material</option><option>intermediate</option><option>finished_article</option><option>co_product</option><option>byproduct</option></select>
          <input type="date" placeholder="Expiry from" style={{width:130}}/>
          <input type="date" placeholder="Expiry to" style={{width:130}}/>
          <select style={{width:130}}><option>All strategies</option><option>fefo</option><option>fifo</option><option>manual</option></select>
          <label style={{fontSize:11, display:"inline-flex", alignItems:"center", gap:4}}><input type="checkbox"/> Show only reserved</label>
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="card" style={{padding:"8px 14px", marginBottom:10, background:"var(--blue-050)", borderColor:"var(--blue)"}}>
          <div className="row-flex">
            <b>{selected.size} selected</b>
            <span className="spacer"></span>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("labelPrint")}>🏷 Print labels</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("stockMove")}>↔ Move</button>
            <button className="btn btn-secondary btn-sm">⇪ Export to Excel</button>
            <button className="btn btn-danger btn-sm" onClick={()=>openModal("destroy")}>Destroy / Scrap</button>
          </div>
        </div>
      )}

      {visible.length === 0 && (
        <div className="card" style={{padding:0}}>
          <EmptyState
            icon="📦"
            title="No license plates match this filter"
            body={search ? "Try clearing the search or pick a different tab." : "Register a new LP from the Scanner or receive goods to create your first LP."}
            action={{ label: "＋ Receive goods", onClick: ()=>openModal("grnPO") }}
          />
        </div>
      )}
      {visible.length > 0 && (
      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th style={{width:30}}><input type="checkbox" checked={selected.size > 0 && selected.size === visible.length} onChange={toggleAll}/></th>
              <th>LP</th>
              <th>Product</th>
              <th style={{textAlign:"right"}}>Qty</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th>Status</th>
              <th>QA</th>
              <th>Location</th>
              <th>Strategy</th>
              <th>Reserved</th>
              <th>Last move</th>
              <th style={{width:110}}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(l => {
              const days = expiryDays(l.expiry);
              const isExpired = days < 0;
              const isUrgent = days <= 7 && days >= 0;
              const rowCls = l.status === "blocked" ? "row-overdue" : (isUrgent ? "row-warning" : "");
              return (
                <tr key={l.lp} className={rowCls} style={{cursor:"pointer"}} onClick={()=>onOpenLp(l.lp)}>
                  <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(l.lp)} onChange={()=>toggle(l.lp)}/></td>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>
                    {l.lp}
                    <SourceChip s={l.source}/>
                  </td>
                  <td>
                    <div style={{fontWeight:500, fontSize:12}}>{l.productName}</div>
                    <div className="mono" style={{fontSize:10, color:"var(--muted)"}}>{l.product} · <ItemTypeBadge t={l.itemType}/></div>
                  </td>
                  <td className="num mono">{l.qty} {l.uom}</td>
                  <td className="mono" style={{fontSize:11}}>{l.batch}</td>
                  <td>
                    <ExpiryCell date={l.expiry} mode={l.shelfLifeMode || "use_by"} days={days}/>
                    {l.shelfLifeMode === "best_before" && <div style={{fontSize:9, color:"var(--amber-700)"}}>best_before</div>}
                  </td>
                  <td><LPStatus s={l.status}/></td>
                  <td><QAStatus s={l.qa}/>{l.holdAge && <div style={{fontSize:9, color:"var(--muted)", marginTop:2}}>{l.holdAge}</div>}</td>
                  <td><Ltree path={l.loc}/></td>
                  <td><span className="badge badge-gray" style={{fontSize:9}}>{l.strategy}</span></td>
                  <td>
                    {l.reservedWo ? (
                      <>
                        <div className="mono" style={{fontSize:11, color:"var(--blue)", fontWeight:600}}>{l.reservedWo}</div>
                        {l.reservedQty < l.qty && <div style={{fontSize:10, color:"var(--muted)"}}>{l.reservedQty}/{l.qty} {l.uom}</div>}
                      </>
                    ) : <span className="muted" style={{fontSize:10}}>—</span>}
                  </td>
                  <td className="muted" style={{fontSize:11}}>{l.lastMove}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    {(l.status === "available" || l.status === "reserved") && (
                      <button className="btn btn-ghost btn-sm" title="Split" onClick={()=>openModal("split", l)}>✂</button>
                    )}
                    <button className="btn btn-ghost btn-sm" title="Print label" onClick={()=>openModal("labelPrint", l)}>🏷</button>
                    <button className="btn btn-ghost btn-sm" title="More">⋯</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div className="row-flex" style={{marginTop:10, fontSize:12, color:"var(--muted)"}}>
        <span>Showing 1–{visible.length} of {WH_LPS.length}</span>
        <span className="spacer"></span>
        <div className="row-flex">
          <select style={{fontSize:11, padding:"2px 6px", width:"auto"}}><option>50</option><option>25</option><option>100</option></select>
          <span style={{fontSize:11, color:"var(--muted)"}}>per page</span>
          <button className="btn btn-ghost btn-sm">← Prev</button>
          <span className="mono">1</span>
          <button className="btn btn-ghost btn-sm">Next →</button>
        </div>
      </div>
    </>
  );
};

// =================================================================
// WH-003 LP Detail
// =================================================================

const WhLPDetail = ({ onBack, onNav, openModal }) => {
  const lp = WH_LP_DETAIL;
  const [tab, setTab] = React.useState("overview");

  const tabs = [
    { k: "overview",    l: "Overview" },
    { k: "movements",   l: "Movements",     c: lp.movements.length },
    { k: "genealogy",   l: "Genealogy",     c: lp.genealogy.upstream.length + lp.genealogy.downstream.length },
    { k: "reservations", l: "Reservations", c: lp.reservations.length },
    { k: "state",       l: "State history", c: lp.stateHistory.length },
    { k: "labels",      l: "Labels",        c: lp.labels.length },
    { k: "audit",       l: "Audit",         c: lp.audit.length },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Warehouse</a> · <a onClick={onBack}>License plates</a> · <span className="mono">{lp.lp}</span></div>
          <h1 className="page-title"><span className="mono">{lp.lp}</span> — {lp.product.name}</h1>
          <div className="muted" style={{fontSize:12}}>{lp.qty} {lp.uom} · Batch <span className="mono">{lp.batch}</span> · Expiry {lp.expiry} ({lp.expiryDays} days) · <SourceChip s={lp.source}/></div>
        </div>
        <div className="row-flex">
          <LPStatus s={lp.status}/>
          <QAStatus s={lp.qa}/>
        </div>
      </div>

      {/* Expiry / status banner */}
      {lp.expiryDays <= 7 && lp.status === "available" && (
        <div className="lp-expiry-banner amber">
          <span>⚠</span>
          <div><b>This LP expires in {lp.expiryDays} days on {lp.expiry}.</b> Review before picking — FEFO priority.</div>
        </div>
      )}

      <div className="lp-layout">
        {/* Identity card */}
        <div className="lp-id-card">
          <div className="lp-id-head">
            <div className="lih-code">{lp.lp}</div>
            <div className="lih-badges">
              <LPStatus s={lp.status}/>
              <QAStatus s={lp.qa}/>
              <ItemTypeBadge t={lp.itemType}/>
            </div>
          </div>

          <div className="lp-id-field">
            <div className="lif-label">Product</div>
            <div className="lif-value"><b className="mono">{lp.product.code}</b> — {lp.product.name}</div>
          </div>
          <div className="lp-id-field">
            <div className="lif-label">Quantity</div>
            <div className="lif-value mono" style={{fontSize:14, fontWeight:600}}>{lp.qty} {lp.uom}</div>
          </div>
          {lp.reservedQty > 0 && (
            <div className="lp-id-field">
              <div className="lif-label">Reserved</div>
              <div className="lif-value" style={{fontSize:11}}><b className="mono">{lp.reservedQty} {lp.uom}</b> → <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={()=>alert("Jump to Planning WO "+lp.reservedWo)} className="mono">{lp.reservedWo}</a></div>
              <div style={{fontSize:10, color:"var(--muted)", marginTop:2}}>Available: {lp.availableQty} {lp.uom}</div>
            </div>
          )}
          <div className="lp-id-field">
            <div className="lif-label">Batch</div>
            <div className="lif-value mono" style={{cursor:"pointer"}} title="Click to copy">{lp.batch}</div>
            <div style={{fontSize:10, color:"var(--muted)", marginTop:2}}>Supplier batch: <span className="mono">{lp.supplierBatch || "—"}</span></div>
          </div>
          <div className="lp-id-field">
            <div className="lif-label">Expiry date ({lp.shelfLifeMode})</div>
            <div className="lif-value mono"><ExpiryCell date={lp.expiry} mode={lp.shelfLifeMode} days={lp.expiryDays}/></div>
          </div>
          <div className="lp-id-field">
            <div className="lif-label">Mfg date · Date code · GTIN</div>
            <div className="lif-value mono" style={{fontSize:11}}>{lp.mfg}  ·  DC <b>{lp.dateCode}</b>  ·  {lp.gtin}</div>
          </div>
          <div className="lp-id-field">
            <div className="lif-label">Location</div>
            <div className="lif-value"><Ltree path={lp.loc}/></div>
          </div>
          <div className="lp-id-field">
            <div className="lif-label">Source</div>
            <div className="lif-value" style={{fontSize:11}}>
              <SourceChip s={lp.source}/>
              {lp.grnRef && <> · <a className="mono" style={{color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("grn")}>{lp.grnRef} →</a></>}
              {lp.woRef && <> · <a className="mono" style={{color:"var(--blue)", cursor:"pointer"}}>{lp.woRef} →</a></>}
            </div>
          </div>
          <div className="lp-id-field">
            <div className="lif-label">Created / updated</div>
            <div className="lif-value" style={{fontSize:11}}>{lp.createdAt} by <b>{lp.createdBy}</b></div>
            <div style={{fontSize:10, color:"var(--muted)"}}>Updated {lp.lastUpdated}</div>
          </div>

          <div className="lp-id-actions">
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("split", lp)}>✂ Split</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("labelPrint", lp)}>🏷 Print label</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("stockMove", lp)}>↔ Move</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("stateTransition", { lp: lp.lp, from: lp.status, to: "blocked" })}>⊘ Block</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("qaStatus", lp)}>⚗ Change QA status</button>
            <button className="btn btn-danger btn-sm" onClick={()=>openModal("destroy", lp)}>🔥 Destroy / scrap</button>
          </div>
          <div className="lp-id-rule-note">
            Available actions are determined by the LP state machine rule <span className="mono">lp_state_machine_v1</span>. Contact your administrator to review transitions in Settings → Rule Registry.
          </div>
        </div>

        {/* Right side — tabs */}
        <div>
          <div className="lp-tabs">
            {tabs.map(t => (
              <button key={t.k} className={tab === t.k ? "on" : ""} onClick={()=>setTab(t.k)}>
                {t.l}{t.c !== undefined && <span className="tab-count">{t.c}</span>}
              </button>
            ))}
          </div>

          {/* Tab 1 — Overview */}
          {tab === "overview" && (
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              <div className="card">
                <div className="card-head" style={{marginBottom:8}}><h3 className="card-title">Identity snapshot</h3></div>
                <Summary rows={[
                  { label: "Product", value: lp.product.code + " — " + lp.product.name, mono: false },
                  { label: "Item type", value: lp.itemType, mono: true },
                  { label: "Quantity", value: lp.qty + " " + lp.uom },
                  { label: "Reserved qty", value: lp.reservedQty + " " + lp.uom },
                  { label: "Available qty", value: lp.availableQty + " " + lp.uom },
                  { label: "Batch", value: lp.batch },
                  { label: "Supplier batch", value: lp.supplierBatch || "—" },
                  { label: "Expiry", value: lp.expiry + " (" + lp.shelfLifeMode + ")", emphasis: true },
                  { label: "Mfg date", value: lp.mfg },
                  { label: "Date code", value: lp.dateCode },
                  { label: "GTIN", value: lp.gtin },
                  { label: "Location", value: lp.loc.join(" › ") },
                  { label: "Warehouse", value: lp.warehouse },
                  { label: "Source", value: lp.source + " · " + lp.grnRef },
                  { label: "Parent LP", value: lp.parentLp || "—" },
                ]}/>
              </div>
              <div className="card">
                <div className="card-head" style={{marginBottom:8}}><h3 className="card-title">Custom fields (ext_jsonb)</h3></div>
                {lp.extFields.length === 0 && <div className="muted" style={{fontSize:12, padding:20, textAlign:"center"}}>No custom fields configured. Add via Settings → Schema Extensions.</div>}
                {lp.extFields.length > 0 && (
                  <table>
                    <tbody>
                      {lp.extFields.map((f, i) => (
                        <tr key={i}>
                          <td style={{color:"var(--muted)", width:"40%", fontSize:11}}>{f.k}</td>
                          <td style={{fontSize:12, fontWeight:500}}>{f.v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="label" style={{marginTop:14, marginBottom:6}}>Notes</div>
                <div style={{fontSize:12, padding:"10px 12px", background:"var(--gray-050)", borderRadius:4, lineHeight:1.5}}>{lp.notes}</div>
              </div>
            </div>
          )}

          {/* Tab 2 — Movements */}
          {tab === "movements" && (
            <div className="card" style={{padding:0}}>
              <table>
                <thead><tr><th>Timestamp</th><th>Type</th><th>From</th><th>To</th><th style={{textAlign:"right"}}>Qty</th><th>Reason</th><th>Reference</th><th>By</th></tr></thead>
                <tbody>
                  {lp.movements.map((m, i) => (
                    <tr key={i}>
                      <td className="mono" style={{fontSize:11}}>{m.t}</td>
                      <td><MoveType t={m.type}/></td>
                      <td><Ltree path={m.fromLoc}/></td>
                      <td><Ltree path={m.toLoc}/></td>
                      <td className="num mono" style={{color: m.qty < 0 ? "var(--red-700)" : "var(--green-700)", fontWeight:600}}>{m.qty > 0 ? "+" : ""}{m.qty}</td>
                      <td className="mono" style={{fontSize:11}}>{m.reason || "—"}</td>
                      <td className="mono" style={{fontSize:11, color:"var(--blue)", cursor:"pointer"}}>{m.ref}</td>
                      <td style={{fontSize:11}}>{m.user}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 3 — Genealogy */}
          {tab === "genealogy" && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Genealogy — this LP</h3>
                <button className="btn btn-secondary btn-sm" onClick={()=>onNav("genealogy")}>🔍 View full genealogy →</button>
              </div>

              <div className="gen-section-label">Upstream (what produced this LP)</div>
              <div className="gen-canvas">
                <div className="gen-node root">
                  <span className="gen-op-icon receipt">◯</span>
                  <div>
                    <div className="gn-code">{lp.lp}</div>
                    <div className="gn-prod">{lp.product.code} · {lp.product.name}</div>
                    <div className="gn-meta">{lp.qty} {lp.uom} · Batch {lp.batch} · Exp {lp.expiry}</div>
                  </div>
                  <span className="badge badge-blue" style={{fontSize:9}}>This LP</span>
                </div>
                {lp.genealogy.upstream.map((n, i) => (
                  <div key={i} className={"gen-node l" + n.level}>
                    <span className={"gen-op-icon " + n.op}>{n.op === "receipt" ? "◯" : n.op === "consume" ? "←" : "→"}</span>
                    <div>
                      <div className="gn-code">{n.label}</div>
                      <div className="gn-meta">{n.product} · {n.date} · Ref {n.ref}</div>
                    </div>
                    {n.fefo && <span className={"gn-fefo " + n.fefo}>{n.fefo === "ok" ? "FEFO-compliant" : "Override"}</span>}
                  </div>
                ))}
              </div>

              <div className="gen-section-label" style={{marginTop:14}}>Downstream (where this LP went)</div>
              <div className="gen-canvas">
                {lp.genealogy.downstream.map((n, i) => (
                  <div key={i} className={"gen-node l" + n.level}>
                    <span className={"gen-op-icon " + n.op}>{n.op === "consume" ? "→" : "◯"}</span>
                    <div>
                      <div className="gn-code">{n.label}</div>
                      <div className="gn-meta">{n.product} · {n.date} · Ref {n.ref}</div>
                    </div>
                    {n.fefo && <span className={"gn-fefo " + n.fefo}>{n.fefo === "ok" ? "FEFO-compliant" : "Override"}</span>}
                  </div>
                ))}
              </div>

              <div style={{marginTop:14, display:"flex", gap:12}}>
                <button className="btn btn-secondary btn-sm">⇪ Export trace report (FSMA 204)</button>
                <span className="muted" style={{fontSize:11, alignSelf:"center"}}>Building full 10-depth graph may take up to 30 seconds.</span>
              </div>
            </div>
          )}

          {/* Tab 4 — Reservations */}
          {tab === "reservations" && (
            <div className="card" style={{padding:0}}>
              {lp.reservations.length === 0 && <div className="muted" style={{padding:40, textAlign:"center"}}>No reservations for this LP.</div>}
              {lp.reservations.length > 0 && (
                <>
                  <table>
                    <thead><tr><th>WO</th><th style={{textAlign:"right"}}>Reserved</th><th>Type</th><th>Reserved at</th><th>By</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {lp.reservations.map((r, i) => (
                        <tr key={i}>
                          <td className="mono" style={{fontWeight:600, color:"var(--blue)", cursor:"pointer"}}>{r.wo}</td>
                          <td className="num mono">{r.qty} {lp.uom}</td>
                          <td><span className="badge badge-blue" style={{fontSize:9}}>{r.type}</span></td>
                          <td className="mono" style={{fontSize:11}}>{r.reservedAt}</td>
                          <td style={{fontSize:11}}>{r.reservedBy}</td>
                          <td>{r.status === "active" ? <span className="badge badge-green" style={{fontSize:9}}>Active</span> : <span className="badge badge-gray" style={{fontSize:9}}>Released</span>}</td>
                          <td>{r.status === "active" && <button className="btn btn-danger btn-sm" onClick={()=>openModal("releaseReservation", r)}>Release</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{padding:"10px 14px", fontSize:11, color:"var(--muted)", background:"var(--info-050a)"}}>
                    ⓘ Reservations are only created for raw material LPs allocated to work orders. Intermediate LPs are consumed via scanner scan-to-WO without pre-reservation.
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 5 — State history */}
          {tab === "state" && (
            <div className="card">
              <div className="label" style={{marginBottom:6}}>LP status transitions</div>
              <div className="activity-feed">
                {lp.stateHistory.map((h, i) => (
                  <div key={i} className="tl-item">
                    <span className={"tl-dot " + (h.to === "available" ? "green" : h.to === "reserved" ? "blue" : h.to === "blocked" ? "red" : "amber")}></span>
                    <div>
                      <div>Transitioned from <b className="mono">{h.from || "∅"}</b> to <b className="mono">{h.to}</b> by <b>{h.user}</b></div>
                      <div className="tl-sub">Reason: <span className="mono">{h.reason || "—"}</span></div>
                    </div>
                    <div className="tl-time">{h.t}</div>
                  </div>
                ))}
              </div>

              <div className="label" style={{marginTop:14, marginBottom:6}}>QA status history</div>
              <div className="activity-feed">
                {lp.qaHistory.map((h, i) => (
                  <div key={i} className="tl-item">
                    <span className={"tl-dot " + (h.to === "PASSED" || h.to === "RELEASED" ? "green" : h.to === "FAILED" || h.to === "QUARANTINED" ? "red" : "amber")}></span>
                    <div>
                      <div>QA changed from <b className="mono">{h.from}</b> to <b className="mono">{h.to}</b> by <b>{h.user}</b></div>
                      <div className="tl-sub">Reason: <span className="mono">{h.reason}</span></div>
                    </div>
                    <div className="tl-time">{h.t}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 6 — Labels */}
          {tab === "labels" && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Print history</h3>
                <button className="btn btn-primary btn-sm" onClick={()=>openModal("labelPrint", lp)}>🏷 Print label</button>
              </div>
              <table>
                <thead><tr><th>Printed at</th><th>Template</th><th>Printer</th><th style={{textAlign:"right"}}>Copies</th><th>By</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {lp.labels.map((l, i) => (
                    <tr key={i}>
                      <td className="mono" style={{fontSize:11}}>{l.t}</td>
                      <td>{l.template}</td>
                      <td className="mono" style={{fontSize:11}}>{l.printer}</td>
                      <td className="num mono">{l.copies}</td>
                      <td style={{fontSize:11}}>{l.user}</td>
                      <td>{l.status === "success" ? <span className="badge badge-green" style={{fontSize:9}}>✓ Success</span> : <span className="badge badge-red" style={{fontSize:9}}>Failed</span>}</td>
                      <td><button className="btn btn-ghost btn-sm">Reprint</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 7 — Audit */}
          {tab === "audit" && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Full audit log</h3>
                <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
              </div>
              <table>
                <thead><tr><th>Timestamp</th><th>Field</th><th>Old value</th><th>New value</th><th>By</th><th>Source</th></tr></thead>
                <tbody>
                  {lp.audit.map((a, i) => (
                    <tr key={i}>
                      <td className="mono" style={{fontSize:11}}>{a.t}</td>
                      <td className="mono" style={{fontSize:11}}>{a.field}</td>
                      <td className="mono" style={{fontSize:11, color:"var(--muted)"}}>{String(a.old)}</td>
                      <td className="mono" style={{fontSize:11, fontWeight:600}}>{String(a.newv)}</td>
                      <td style={{fontSize:11}}>{a.user}</td>
                      <td><span className="badge badge-gray" style={{fontSize:9}}>{a.src}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

Object.assign(window, { WhLPList, WhLPDetail });
