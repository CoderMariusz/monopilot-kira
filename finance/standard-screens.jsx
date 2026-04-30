// ============ FIN-002 — Standard Cost List + FIN-002b Detail drawer ============

const FinStandardCosts = ({ role, onNav, openModal }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [expanded, setExpanded] = React.useState(new Set());

  const isManager = role === "Finance Manager" || role === "Admin";

  // FIN-002 status tabs per PRD §6 lifecycle (draft / pending / approved /
  // superseded / retired). Prior version used "active" which conflates
  // approved + effective and is not a valid lifecycle state in the
  // standard_costs DDL. Audit-4 finding C2 / A2.
  const tabs = [
    { k: "all",        l: "All",        c: FIN_STD_COSTS.length },
    { k: "draft",      l: "Draft",      c: FIN_STD_COSTS.filter(r => r.status === "draft").length },
    { k: "pending",    l: "Pending",    c: FIN_STD_COSTS.filter(r => r.status === "pending").length },
    { k: "approved",   l: "Approved",   c: FIN_STD_COSTS.filter(r => r.status === "approved").length },
    { k: "superseded", l: "Superseded", c: FIN_STD_COSTS.filter(r => r.status === "superseded").length },
    { k: "retired",    l: "Retired",    c: FIN_STD_COSTS.filter(r => r.status === "retired").length },
  ];

  const visible = FIN_STD_COSTS.filter(r =>
    (tab === "all" || r.status === tab) &&
    (!search ||
      r.itemCode.toLowerCase().includes(search.toLowerCase()) ||
      r.itemName.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleExpand = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };
  const toggleAll = () => {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(r => r.id)));
  };

  const coverageFa = FIN_STD_COSTS.filter(r => r.itemType === "FA" && r.status === "approved").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Standard Costs</div>
          <h1 className="page-title">Standard Costs</h1>
          <div className="muted" style={{fontSize:12}}>
            {FIN_STD_COSTS.length} records · {tabs.find(t=>t.k==="approved").c} Approved · {tabs.find(t=>t.k==="pending").c} Pending · {tabs.find(t=>t.k==="draft").c} Draft · Coverage {coverageFa}/24 FA items
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("bulkImport")}>⇪ Import CSV</button>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("stdCostCreate")}>＋ New Standard Cost</button>}
        </div>
      </div>

      {/* Coverage alert if < 100% FA */}
      {coverageFa < 24 && (
        <div className="alert-amber alert-box" style={{marginBottom:10, fontSize:12, padding:"8px 12px"}}>
          <span>⚠</span>
          <div style={{flex:1}}>
            {24 - coverageFa} FA items have no active standard cost. Variance tracking is incomplete.
          </div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-primary" onClick={()=>openModal("stdCostCreate")}>Create Missing Costs</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>
            {t.l} <span className="count">{t.c}</span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <input type="text" placeholder="Search by product code or name…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:280}}/>
        <select style={{width:140}}><option>All item types</option><option>RM</option><option>Intermediate</option><option>FA</option><option>Co-product</option><option>By-product</option></select>
        <input type="date" placeholder="Eff from" style={{width:130}}/>
        <input type="date" placeholder="Eff to" style={{width:130}}/>
        <select style={{width:150}}><option>All cost bases</option><option>Quoted</option><option>Historical</option><option>Calculated</option><option>Imported D365</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear Filters</button>
      </div>

      {/* Bulk-action bar */}
      {selected.size > 0 && (
        <div className="card" style={{padding:"10px 14px", marginBottom:10, background:"var(--blue-050)"}}>
          <div className="row-flex">
            <b style={{fontSize:12}}>{selected.size} selected</b>
            <span className="spacer"></span>
            {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("approveStdCost", { bulk: selected.size })}>Bulk Approve ({selected.size})</button>}
            <button className="btn btn-secondary btn-sm">⇪ Export Selected</button>
            {isManager && <button className="btn btn-danger btn-sm">Delete Selected</button>}
            <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th style={{width:28}}><input type="checkbox" checked={selected.size === visible.length && visible.length > 0} onChange={toggleAll}/></th>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Type</th>
              <th style={{textAlign:"right"}}>Material</th>
              <th style={{textAlign:"right"}}>Labor</th>
              <th style={{textAlign:"right"}}>Overhead</th>
              <th style={{textAlign:"right"}}>Total</th>
              <th>UOM</th>
              <th>Trend (8 wk)</th>
              <th>Eff. From</th>
              <th>Eff. To</th>
              <th>Status</th>
              <th style={{width:32}}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
              const isOpen = expanded.has(r.id);
              const cls = r.status === "draft" ? "std-row-draft" : r.status === "pending" ? "std-row-pending" : "";
              return (
                <React.Fragment key={r.id}>
                  <tr className={cls} style={{cursor:"pointer"}} onClick={()=>toggleExpand(r.id)}>
                    <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggle(r.id)}/></td>
                    <td className="mono" style={{fontWeight:600}}>{r.itemCode}</td>
                    <td style={{fontSize:12}}>{r.itemName}</td>
                    <td><ItemTypeBadge t={r.itemType}/></td>
                    <td className="money">{fmtMoney(r.mat)}</td>
                    <td className="money">{fmtMoney(r.lab)}</td>
                    <td className="money">{fmtMoney(r.oh)}</td>
                    <td className="money" style={{fontWeight:600}}>{fmtMoney(r.total)}</td>
                    <td className="mono" style={{fontSize:11}}>{r.uom}</td>
                    <td>
                      {/* TUNING-PATTERN.md §3.1 — 8-week trend per standard cost.
                          Derived from status/record id (data.jsx frozen) via
                          deriveRunHistory; per-cell title shows week + mock value
                          so the strip reads "Week N · £ X". */}
                      <RunStrip
                        outcomes={deriveRunHistory({ id: r.id, status: r.status === "approved" ? "ok" : r.status === "draft" ? "warning" : r.status === "pending" ? "warning" : r.status === "retired" ? "err" : "ok" })
                          .map((tone, i, arr) => {
                            const wk = arr.length - i;
                            return { tone, title: `Week -${wk} · ${fmtMoney(r.total)}` };
                          })}
                        max={8}
                        title={`${r.itemCode} · last 8 weeks`}
                      />
                    </td>
                    <td className="mono" style={{fontSize:11}}>{r.effFrom}</td>
                    <td className="mono" style={{fontSize:11, color: r.effTo ? "var(--text)" : "var(--green-700)"}}>{r.effTo || "Open"}</td>
                    <td><StdStatus s={r.status}/></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div className="row-flex" style={{gap:4}}>
                        {r.status === "pending" && isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("approveStdCost", r)}>Approve</button>}
                        {r.status === "draft" && isManager && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("stdCostCreate", r)}>Edit</button>}
                        <button className="btn btn-ghost btn-sm" onClick={()=>openModal("costHistory", r)}>History</button>
                        {r.status === "approved" && isManager && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("supersede", r)}>Supersede</button>}
                        {r.status === "approved" && isManager && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("supersede", { ...r, retire: true })}>Retire</button>}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={14} className="sub-table" style={{background:"var(--gray-050)", padding:"12px 18px"}}>
                        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
                          <div>
                            <div className="fin-section-title">Approval record</div>
                            {r.approvedAt ? (
                              <div className="audit-row" style={{borderBottom:"none"}}>
                                <span className="audit-avatar">{r.approvedBy.split(" ").map(n=>n[0]).join("")}</span>
                                <div>
                                  <div style={{fontSize:12}}><b>{r.approvedBy}</b> approved v{r.id.split("-").pop()}</div>
                                  <div className="muted" style={{fontSize:10, fontFamily:"var(--font-mono)"}}>{r.approvedAt}</div>
                                  {r.hash && <span className="audit-hash">{r.hash}</span>}
                                </div>
                              </div>
                            ) : (
                              <div className="muted" style={{fontSize:12}}>Not yet approved.</div>
                            )}
                          </div>
                          <div>
                            <div className="fin-section-title">Basis & Notes</div>
                            <div style={{fontSize:12}}>Cost basis: <span className="badge badge-gray">{r.basis}</span></div>
                            <div style={{fontSize:12, marginTop:4, color:"var(--muted)"}}>{r.notes || "No notes."}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <div style={{padding:"10px 14px", fontSize:11, color:"var(--muted)", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between"}}>
          <span>Showing 1–{visible.length} of {visible.length}</span>
          <span>Approved standard costs are immutable. Use <b>Supersede</b> to replace an active cost record (21 CFR Part 11).</span>
        </div>
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div className="empty-panel">
          <div className="ep-ic">🏷</div>
          <div className="ep-head">No standard costs match the current filters.</div>
          <div className="ep-body">Try widening your filters or clear them to see all records.</div>
          <div className="ep-ctas">
            <button className="btn btn-secondary btn-sm" onClick={()=>{setTab("all"); setSearch("");}}>Clear Filters</button>
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { FinStandardCosts });
