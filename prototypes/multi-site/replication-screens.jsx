// ============ MS-MDS Master Data Sync + MS-REP Replication Queue ============

// -------- MS-MDS Master Data Sync --------
const MsMasterDataSync = ({ role, site, onNav, openModal }) => {
  const [expanded, setExpanded] = React.useState(new Set());
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [entityFilter, setEntityFilter] = React.useState("all");

  const isAdmin = role === "Admin";
  const filtered = MS_MDS_ROWS.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (entityFilter !== "all" && r.entity !== entityFilter) return false;
    if (site !== "ALL" && r.site !== site) return false;
    return true;
  });

  const toggle = (k) => {
    const n = new Set(expanded);
    if (n.has(k)) n.delete(k); else n.add(k);
    setExpanded(n);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Master Data Sync
          </div>
          <h1 className="page-title">Master Data Sync</h1>
          <div className="muted" style={{fontSize:12}}>View replication status of org-level master data across all sites. Identify conflicts and trigger manual runs.</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export Report</button>
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={()=>openModal("replicationRetry", {scope: "all"})}>↻ Run Sync Now</button>}
        </div>
      </div>

      <AllSitesBanner site={site}/>

      <div className="ms-info-grid" style={{gridTemplateColumns:"repeat(3, 1fr)"}}>
        <div className="kpi green"><div className="kpi-label">Synced</div><div className="kpi-value">{MS_MDS_KPIS.synced}</div><div className="kpi-sub">entities in sync</div></div>
        <div className="kpi blue"><div className="kpi-label">Pending</div><div className="kpi-value">{MS_MDS_KPIS.pending}</div><div className="kpi-sub">awaiting next run</div></div>
        <div className="kpi red"><div className="kpi-label">Conflicts</div><div className="kpi-value">{MS_MDS_KPIS.conflict}</div><div className="kpi-sub">require resolution</div></div>
      </div>

      <div className="filter-bar">
        <select style={{width:150}} value={entityFilter} onChange={e=>setEntityFilter(e.target.value)}>
          <option value="all">All Entities</option>
          <option value="Item">Items</option>
          <option value="BOM">BOMs</option>
          <option value="Allergen">Allergens</option>
          <option value="Supplier">Suppliers</option>
          <option value="Customer">Customers</option>
          <option value="Reference">Reference</option>
        </select>
        <select style={{width:150}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="synced">Synced</option>
          <option value="pending">Pending</option>
          <option value="conflict">Conflict</option>
        </select>
        <span className="spacer"></span>
        <button className="clear-all" onClick={()=>{setStatusFilter("all");setEntityFilter("all");}}>Clear</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr>
            <th style={{width:24}}></th>
            <th>Entity</th><th>Code</th><th>Name</th>
            {site === "ALL" && <th>Site</th>}
            <th>Status</th><th>Last Sync</th><th>Next</th>
            <th style={{textAlign:"right"}}>Conflicts</th>
            <th></th>
          </tr></thead>
          <tbody>
            {filtered.map((r, i) => {
              const key = r.code + r.site;
              const isOpen = expanded.has(key);
              return (
                <React.Fragment key={key}>
                  <tr style={{cursor:"pointer"}} onClick={()=>toggle(key)}>
                    <td><span className="inv-expand-ic">{isOpen ? "▼" : "▶"}</span></td>
                    <td><span className="badge badge-blue" style={{fontSize:9}}>{r.entity}</span></td>
                    <td className="mono" style={{fontWeight:600}}>{r.code}</td>
                    <td style={{fontSize:12}}>{r.name}</td>
                    {site === "ALL" && <td><SiteRef id={r.site} compact/></td>}
                    <td><RepStatus s={r.status}/></td>
                    <td className="muted mono" style={{fontSize:11}}>{r.lastSync}</td>
                    <td className="muted mono" style={{fontSize:11}}>{r.nextSync}</td>
                    <td className="num mono" style={{color: r.conflicts > 0 ? "var(--red-700)" : "var(--muted)"}}>{r.conflicts || "—"}</td>
                    <td onClick={e=>e.stopPropagation()}>
                      {r.status === "conflict" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("conflict", r)}>Resolve</button>}
                      {r.status !== "conflict" && isAdmin && <button className="btn btn-ghost btn-sm">↻ Sync</button>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={site === "ALL" ? 10 : 9} className="sub-table">
                        {r.status === "conflict" ? (
                          <>
                            <b style={{fontSize:11, fontFamily:"var(--font-mono)"}}>Conflicts for {r.code} at {r.site}:</b>
                            <table style={{marginTop:6}}>
                              <thead><tr><th>Field</th><th>Source Value (Org)</th><th>Site Value</th></tr></thead>
                              <tbody>
                                {MS_CONFLICT_DETAIL.fields.map(f => (
                                  <tr key={f.key}><td className="mono" style={{fontSize:11, color:"var(--muted)"}}>{f.key}</td><td className="mono">{f.source}</td><td className="mono">{f.site}</td></tr>
                                ))}
                              </tbody>
                            </table>
                            <button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={()=>openModal("conflict", r)}>Resolve now</button>
                          </>
                        ) : (
                          <>
                            <b style={{fontSize:11, fontFamily:"var(--font-mono)"}}>Last sync log:</b>
                            <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>Entity applied successfully at {r.lastSync}. No field-level changes since last run.</div>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

// -------- MS-REP Replication Queue --------
const MsReplicationQueue = ({ role, site, onNav, openModal }) => {
  const [tab, setTab] = React.useState("active");
  const [expanded, setExpanded] = React.useState(new Set());

  const isAdmin = role === "Admin";
  const toggle = (k) => {
    const n = new Set(expanded);
    if (n.has(k)) n.delete(k); else n.add(k);
    setExpanded(n);
  };

  const failedCount = MS_REP_JOBS.filter(j => j.status === "failed").length;
  const allGreen = failedCount === 0 && tab === "active";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Replication Queue
          </div>
          <h1 className="page-title">Replication Queue</h1>
          <div className="muted" style={{fontSize:12}}>DLQ-style pipeline view · Pattern inherited from 03-TECHNICAL and 10-FINANCE</div>
        </div>
        <div className="row-flex">
          {isAdmin && <button className="btn btn-primary btn-sm" disabled={failedCount === 0} onClick={()=>openModal("replicationRetry", {scope: "failed"})}>↻ Retry All Failed ({failedCount})</button>}
          {isAdmin && <button className="btn btn-secondary btn-sm">Run Full Sync Now</button>}
        </div>
      </div>

      <div className="ms-tabs">
        <button className={tab === "active" ? "on" : ""} onClick={()=>setTab("active")}>Active Jobs <span className="tab-count">{MS_REP_JOBS.length}</span></button>
        <button className={tab === "historical" ? "on" : ""} onClick={()=>setTab("historical")}>Historical <span className="tab-count">{MS_REP_HISTORICAL.length}</span></button>
        <button className={tab === "schedule" ? "on" : ""} onClick={()=>setTab("schedule")}>Schedule <span className="tab-count">{MS_REP_SCHEDULE.length}</span></button>
      </div>

      {tab === "active" && (
        <>
          <div className="filter-bar">
            <select style={{width:140}}><option>All Statuses</option><option>Running</option><option>Pending</option><option>Failed</option><option>Retrying</option></select>
            <select style={{width:160}}><option>All Entities</option><option>Items</option><option>BOMs</option><option>Suppliers</option></select>
            <select style={{width:160}}><option>All Sites</option>{MS_SITES.map(s=><option key={s.id}>{s.code}</option>)}</select>
            <span className="spacer"></span>
            <button className="clear-all">Clear</button>
          </div>

          {allGreen && (
            <div className="alert-green alert-box" style={{marginBottom:10, fontSize:12}}>
              <span>✓</span><div>All replication jobs completed. Master data is synchronized across all sites. Last full sync: <b>2026-04-21 03:00 UTC</b>.</div>
            </div>
          )}

          <div className="card" style={{padding:0}}>
            <table>
              <thead><tr>
                <th style={{width:24}}></th>
                <th>Job ID</th><th>Entity</th><th>Site</th><th>Status</th>
                <th style={{textAlign:"right"}}>Count</th>
                <th style={{textAlign:"right"}}>✓</th>
                <th style={{textAlign:"right"}}>✕</th>
                <th style={{textAlign:"right"}}>Retries</th>
                <th>Started</th><th>Duration</th><th></th>
              </tr></thead>
              <tbody>
                {MS_REP_JOBS.map(j => {
                  const isOpen = expanded.has(j.id);
                  return (
                    <React.Fragment key={j.id}>
                      <tr style={{cursor: j.failed > 0 ? "pointer" : "default"}} onClick={()=>j.failed > 0 && toggle(j.id)}>
                        <td>{j.failed > 0 && <span className="inv-expand-ic">{isOpen ? "▼" : "▶"}</span>}</td>
                        <td className="mono" style={{fontWeight:600}}>{j.id}</td>
                        <td><span className="badge badge-blue" style={{fontSize:9}}>{j.entity}</span></td>
                        <td><SiteRef id={j.site} compact/></td>
                        <td><RepStatus s={j.status}/></td>
                        <td className="num mono">{j.count}</td>
                        <td className="num mono" style={{color:"var(--green-700)"}}>{j.success}</td>
                        <td className="num mono" style={{color: j.failed > 0 ? "var(--red-700)" : "var(--muted)"}}>{j.failed}</td>
                        <td className="num mono">{j.retries}</td>
                        <td className="muted mono" style={{fontSize:11}}>{j.startedAt}</td>
                        <td className="mono" style={{fontSize:11}}>{j.duration} {j.status === "running" && <span className="sync-prog"><span className="spin"></span></span>}</td>
                        <td onClick={e=>e.stopPropagation()}>
                          {j.status === "failed" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("replicationRetry", j)}>↻ Retry</button>}
                          {j.status === "running" && <button className="btn btn-ghost btn-sm">Cancel</button>}
                          {j.status === "pending" && <button className="btn btn-ghost btn-sm">Cancel</button>}
                        </td>
                      </tr>
                      {isOpen && j.failed > 0 && (
                        <tr>
                          <td colSpan={12} className="sub-table">
                            <b style={{fontSize:11, fontFamily:"var(--font-mono)"}}>Failed entities ({j.failed}):</b>
                            <table style={{marginTop:6}}>
                              <thead><tr><th>Entity Code</th><th>Error Code</th><th>Error Message</th><th>Last Attempt</th></tr></thead>
                              <tbody>
                                <tr><td className="mono">SUP-0034</td><td className="mono" style={{color:"var(--red-700)"}}>CONFLICT_409</td><td style={{fontSize:11}}>Site override exists for payment_terms; manual resolution required.</td><td className="muted mono" style={{fontSize:11}}>2026-04-21 12:01</td></tr>
                                <tr><td className="mono">SUP-0045</td><td className="mono" style={{color:"var(--red-700)"}}>TIMEOUT</td><td style={{fontSize:11}}>API call exceeded 30s; site responded slowly.</td><td className="muted mono" style={{fontSize:11}}>2026-04-21 12:02</td></tr>
                              </tbody>
                            </table>
                            <button className="btn btn-primary btn-sm" style={{marginTop:10}} onClick={()=>openModal("replicationRetry", j)}>↻ Retry Failed Entities</button>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "historical" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Job ID</th><th>Entity</th><th>Site</th><th>Status</th><th style={{textAlign:"right"}}>Count</th><th style={{textAlign:"right"}}>✓</th><th style={{textAlign:"right"}}>✕</th><th>Started</th><th>Duration</th></tr></thead>
            <tbody>
              {MS_REP_HISTORICAL.map(j => (
                <tr key={j.id}>
                  <td className="mono" style={{fontWeight:600}}>{j.id}</td>
                  <td><span className="badge badge-blue" style={{fontSize:9}}>{j.entity}</span></td>
                  <td><SiteRef id={j.site} compact/></td>
                  <td><RepStatus s={j.status}/></td>
                  <td className="num mono">{j.count}</td>
                  <td className="num mono" style={{color:"var(--green-700)"}}>{j.success}</td>
                  <td className="num mono" style={{color: j.failed > 0 ? "var(--red-700)" : "var(--muted)"}}>{j.failed}</td>
                  <td className="muted mono" style={{fontSize:11}}>{j.startedAt}</td>
                  <td className="mono" style={{fontSize:11}}>{j.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "schedule" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Entity Type</th><th>Cadence</th><th>Last Successful</th><th>Next Scheduled</th><th>Sites Covered</th><th></th></tr></thead>
            <tbody>
              {MS_REP_SCHEDULE.map(s => (
                <tr key={s.entity}>
                  <td><span className="badge badge-blue" style={{fontSize:9}}>{s.entity}</span></td>
                  <td>{s.cadence}</td>
                  <td className="muted mono" style={{fontSize:11}}>{s.last}</td>
                  <td className="mono" style={{fontSize:11}}>{s.next}</td>
                  <td style={{fontSize:11}}>{s.sites}</td>
                  <td>{isAdmin && <button className="btn btn-ghost btn-sm">✏️ Edit Schedule</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

Object.assign(window, { MsMasterDataSync, MsReplicationQueue });
