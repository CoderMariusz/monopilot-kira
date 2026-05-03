// ============ MAINT-002 Asset List + MAINT-003 Asset Detail ============

const MntAssetList = ({ onOpenAsset, onNav, openModal, role }) => {
  const [search, setSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [critFilter, setCritFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [lotoOnly, setLotoOnly] = React.useState(false);
  const [calOnly, setCalOnly] = React.useState(false);
  const [selectedLine, setSelectedLine] = React.useState(null);
  const [expanded, setExpanded] = React.useState(new Set(MNT_ASSET_HIER.filter(n=>n.level<=1).map(n=>n.key)));

  const isManager = role === "Manager" || role === "Admin";

  const toggleExp = (key) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  };

  // Which hierarchy nodes are visible (children only shown if parent expanded)
  const visibleHier = MNT_ASSET_HIER.filter(n => {
    if (n.level === 0) return true;
    // find parent chain
    let parent = n.parent;
    while (parent) {
      if (!expanded.has(parent)) return false;
      const p = MNT_ASSET_HIER.find(x => x.key === parent);
      parent = p ? p.parent : null;
    }
    return true;
  });

  const visible = MNT_ASSETS.filter(a => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (critFilter !== "all" && a.criticality !== critFilter) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (lotoOnly && !a.loto) return false;
    if (calOnly && !a.cal) return false;
    if (selectedLine && a.line !== selectedLine) return false;
    if (search && !(a.name.toLowerCase().includes(search.toLowerCase()) ||
                    a.code.toLowerCase().includes(search.toLowerCase()) ||
                    a.id.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Assets</div>
          <h1 className="page-title">Assets</h1>
          <div className="muted" style={{fontSize:12}}>
            {MNT_ASSETS.length} assets · {MNT_ASSETS.filter(a=>a.criticality==="critical").length} critical · {MNT_ASSETS.filter(a=>a.loto).length} require LOTO · {MNT_ASSETS.filter(a=>a.cal).length} require calibration
          </div>
        </div>
        <div className="row-flex">
          <input type="text" placeholder="Search by ID, code, or name…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("assetEdit", { mode: "create" })}>＋ Add Asset</button>}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>Type</label>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="all">All</option>
          {["Mixer","Oven","Packer","Scale","Thermometer","pH Meter","CIP Unit","Conveyor","Compressor","Other"].map(t=> <option key={t}>{t}</option>)}
        </select>
        <label>Criticality</label>
        <select value={critFilter} onChange={e=>setCritFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label>Status</label>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="operational">Operational</option>
          <option value="scheduled">Scheduled</option>
          <option value="due">Due</option>
          <option value="overdue">Overdue</option>
          <option value="in_work">In Work</option>
        </select>
        <label style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="checkbox" checked={lotoOnly} onChange={e=>setLotoOnly(e.target.checked)}/> Requires LOTO
        </label>
        <label style={{display:"flex", alignItems:"center", gap:4}}>
          <input type="checkbox" checked={calOnly} onChange={e=>setCalOnly(e.target.checked)}/> Requires Calibration
        </label>
        {(typeFilter!=="all"||critFilter!=="all"||statusFilter!=="all"||lotoOnly||calOnly||selectedLine) && (
          <a style={{fontSize:11, color:"var(--blue)", cursor:"pointer", marginLeft:"auto"}} onClick={()=>{setTypeFilter("all");setCritFilter("all");setStatusFilter("all");setLotoOnly(false);setCalOnly(false);setSelectedLine(null);}}>
            Clear filters
          </a>
        )}
      </div>

      {/* Two-column: hierarchy tree + table */}
      <div style={{display:"grid", gridTemplateColumns:"280px 1fr", gap:12, alignItems:"flex-start"}}>
        {/* Asset hierarchy tree */}
        <div className="asset-hier">
          <div style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:700, color:"var(--muted)", padding:"4px 8px 8px", borderBottom:"1px solid var(--border)", marginBottom:6}}>
            Asset hierarchy
          </div>
          {visibleHier.map(n => (
            <div key={n.key}
                 className={"hier-node l" + n.level + " " + (selectedLine === n.name.split(" ")[0] ? "on" : "")}
                 onClick={()=>{
                   if (n.level === 1) setSelectedLine(selectedLine === n.name.split(" ")[0] ? null : n.name.split(" ")[0]);
                   if (n.level === 2) onOpenAsset(n.key);
                 }}>
              {n.level < 2 && (
                <span className="ln-tog" onClick={(e)=>{e.stopPropagation(); toggleExp(n.key);}}>
                  {expanded.has(n.key) ? "▾" : "▸"}
                </span>
              )}
              {n.level === 2 && <span style={{width:14, display:"inline-block"}}></span>}
              <span className="hn-ic">{n.ic}</span>
              <span style={{flex:1}}>{n.name}</span>
              {n.alerts !== undefined && n.alerts > 0 && <span className="hn-alerts">⚠{n.alerts}</span>}
              {n.count && <span className="hn-count">{n.count}</span>}
              {n.status && n.level === 2 && <AssetStatus s={n.status}/>}
            </div>
          ))}
        </div>

        {/* Asset table */}
        <div className="card" style={{padding:0}}>
          <table>
            <thead>
              <tr>
                <th style={{width:28}}><input type="checkbox"/></th>
                <th>Asset ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Location</th>
                <th>Line</th>
                <th>Criticality</th>
                <th>Status</th>
                <th>Last svc</th>
                <th>Next PM</th>
                <th style={{textAlign:"right"}}>Avail %</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(a => (
                <tr key={a.id}
                    className={a.loto && a.status === "in_work" ? "loto-row" : (a.status === "overdue" ? "row-overdue" : (a.status === "due" ? "row-due" : ""))}
                    style={{cursor:"pointer"}}
                    onClick={()=>onOpenAsset(a.id)}>
                  <td><input type="checkbox" onClick={e=>e.stopPropagation()}/></td>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{a.icon} {a.id}</td>
                  <td style={{fontSize:12}}>
                    {a.name}
                    {a.loto && <span className="loto-icon" style={{marginLeft:6}}>🔒</span>}
                    {a.cal && <span style={{marginLeft:4, fontSize:10}} title="Requires calibration">⚖</span>}
                  </td>
                  <td style={{fontSize:11}}>{a.type}</td>
                  <td><Ltree path={a.loc}/></td>
                  <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{a.line}</td>
                  <td><CritBadge c={a.criticality}/></td>
                  <td><AssetStatus s={a.status}/></td>
                  <td className="mono" style={{fontSize:11}}>{a.lastSvc}</td>
                  <td><DueCell date={a.nextPm}/></td>
                  <td style={{textAlign:"right"}}><AvailCell pct={a.avail}/></td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={11} style={{textAlign:"center", padding:40}}>
                  <div className="muted" style={{fontSize:14, marginBottom:8}}>No assets match your filters.</div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setSearch("");setTypeFilter("all");setCritFilter("all");setStatusFilter("all");setLotoOnly(false);setCalOnly(false);setSelectedLine(null);}}>Clear all filters</button>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// ============ MAINT-003 Asset Detail ============

// §3.1 deriveRunHistory (pure, reads nothing from data.jsx — maps service history records
// into 8 PM outcomes with per-cell tooltips). Preventive = ok, reactive = bad,
// calibration/inspection = warn, else neutral. Oldest-first on the left.
const deriveAssetRunHistory = (asset) => {
  const list = Array.isArray(asset && asset.history) ? asset.history : [];
  const pms = list.slice(0, 8).reverse(); // oldest first
  const cells = pms.map((h) => {
    const tone = h.type === "preventive" ? "ok"
              : h.type === "reactive"    ? "bad"
              : h.type === "calibration" || h.type === "inspection" ? "warn"
              : "ok";
    const d = (h.t || "").slice(0, 10);
    const label = (h.type || "service").charAt(0).toUpperCase() + (h.type || "service").slice(1);
    return { tone, title: `${label} · ${d} · ${h.mwo || "—"}` };
  });
  while (cells.length < 8) cells.unshift({ tone: "empty", title: "No PM" });
  return cells;
};

const MntAssetDetail = ({ onBack, onNav, openModal, role }) => {
  const [tab, setTab] = React.useState("overview");
  const a = MNT_ASSET_DETAIL;
  const isManager = role === "Manager" || role === "Admin";
  const runHistory = deriveAssetRunHistory(a);

  const tabs = [
    { k: "overview",  l: "Overview" },
    { k: "history",   l: "Service History", c: a.history.length },
    { k: "pm",        l: "PM Schedule", c: a.pmSchedules.length },
    { k: "cal",       l: "Calibration", hidden: !a.cal },
    { k: "spares",    l: "Spares BOM", c: a.spares.length },
    { k: "docs",      l: "Documents", c: a.documents.length },
    { k: "downtime",  l: "Downtime Events", c: a.downtime.length },
    { k: "sensors",   l: "Sensors", badge: "P2" },
  ];

  return (
    <>
      {/* §3.4 sticky-form-header — long form (multiple tabs, tall nameplate) */}
      <div className="page-head sticky-form-header" style={{padding:"10px 0"}}>
        <div>
          <div className="breadcrumb">
            <a onClick={onBack}>Assets</a> · <span className="mono">{a.id}</span>
          </div>
          <h1 className="page-title">{a.icon} {a.name}</h1>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back to assets</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("mwoCreate", { assetId: a.id })}>＋ Create mWO</button>
          {isManager && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("assetEdit", { assetId: a.id, mode: "edit" })}>Edit asset</button>}
          {isManager && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("critOverride", { assetId: a.id })}>Override criticality</button>}
          {isManager && <button className="btn btn-danger btn-sm" onClick={()=>openModal("deleteConfirm", { entity: "Asset", code: a.id })}>Deactivate</button>}
        </div>
      </div>

      {/* Header card */}
      <div className="ast-plate" style={{marginBottom:12}}>
        <div className="ast-plate-head">
          <div className="ast-plate-ic">{a.icon}</div>
          <div style={{flex:1}}>
            <div className="ast-plate-title">{a.name}</div>
            <div className="ast-plate-code">{a.code} · {a.type} · {a.manufacturer}</div>
            <div className="ast-plate-badges">
              <CritBadge c={a.criticality}/>
              <AssetStatus s={a.status}/>
              {a.loto && <LotoBadge/>}
              {a.cal && <span className="badge badge-green" style={{fontSize:9}}>Calibration required</span>}
              {a.active && <span className="badge badge-gray" style={{fontSize:9}}>Active</span>}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>Current mWO</div>
            <div className="mono" style={{fontSize:14, fontWeight:700, color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>{a.currentMwo}</div>
            <div className="muted" style={{fontSize:10}}>in progress — M. Nowak</div>
          </div>
        </div>

        {/* LOTO banner if active */}
        {a.loto && a.status === "in_work" && (
          <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
            <span>⚠</span>
            <div style={{flex:1}}>
              <b>LOTO Required</b> — equipment is currently under lockout/tagout procedure LOTO-2026-0089 since 07:02. Work in progress by M. Nowak + A. Kowalski (Safety).
            </div>
            <button className="btn btn-sm btn-secondary" onClick={()=>onNav("loto")}>View LOTO →</button>
          </div>
        )}

        {/* §3.1 RunStrip — last 8 PM outcomes for this asset */}
        <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10, padding:"8px 10px",
                     background:"var(--surface-2, #f1f5f9)", borderRadius:4, border:"1px solid var(--border-soft, #eef1f5)"}}>
          <span className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>Last 8 PMs</span>
          <RunStrip outcomes={runHistory} max={8} title="Last 8 PM outcomes — hover for date & mWO"/>
          <span className="muted" style={{fontSize:11}}>oldest → newest · hover a cell for PM date</span>
        </div>

        {/* Quick stats grid */}
        <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:10, fontSize:11}}>
          <div>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>Last service</div>
            <div className="mono" style={{fontSize:12, fontWeight:600}}>{a.lastSvc}</div>
          </div>
          <div>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>Next PM</div>
            <DueCell date={a.nextPm} days={a.nextPmDays}/>
          </div>
          <div>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>MTBF (30d)</div>
            <div className="mono" style={{fontSize:14, fontWeight:700, color:"var(--green-700)"}}>{a.mtbf30d}</div>
          </div>
          <div>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>MTTR (30d)</div>
            <div className="mono" style={{fontSize:14, fontWeight:700}}>{a.mttr30d}</div>
          </div>
          <div>
            <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>Availability (30d)</div>
            <AvailCell pct={a.availability30d}/>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="lp-tabs">
        {tabs.filter(t=>!t.hidden).map(t => (
          <button key={t.k} className={tab === t.k ? "on" : ""} onClick={()=>setTab(t.k)}>
            {t.l}
            {t.c !== undefined && <span className="tab-count">{t.c}</span>}
            {t.badge && <span className="badge badge-amber" style={{fontSize:9, marginLeft:6}}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Asset nameplate</h3></div>
            <table>
              <tbody>
                <tr><td className="muted">Asset code</td><td className="mono">{a.code}</td></tr>
                <tr><td className="muted">Name</td><td>{a.name}</td></tr>
                <tr><td className="muted">Equipment type</td><td>{a.type}</td></tr>
                <tr><td className="muted">Production line</td><td><a style={{color:"var(--blue)"}}>{a.line}</a></td></tr>
                <tr><td className="muted">Location path</td><td><Ltree path={a.loc}/></td></tr>
                <tr><td className="muted">Requires LOTO</td><td>{a.loto ? <span className="badge badge-green" style={{fontSize:9}}>Yes</span> : <span className="muted">No</span>}</td></tr>
                <tr><td className="muted">Requires calibration</td><td>{a.cal ? <span className="badge badge-green" style={{fontSize:9}}>Yes</span> : <span className="muted">No</span>}</td></tr>
                <tr><td className="muted">Manufacturer</td><td>{a.manufacturer}</td></tr>
                <tr><td className="muted">Model</td><td>{a.model}</td></tr>
                <tr><td className="muted">Serial number</td><td className="mono" style={{fontSize:11}}>{a.serial}</td></tr>
                <tr><td className="muted">Warranty expires</td><td className="mono">{a.warranty}</td></tr>
                <tr><td className="muted">Installed</td><td className="mono">{a.installedAt}</td></tr>
                <tr><td className="muted">Active</td><td><span className="badge badge-green" style={{fontSize:9}}>Active</span></td></tr>
              </tbody>
            </table>
          </div>

          <div>
            <div className="card">
              <div className="card-head"><h3 className="card-title">Current status</h3></div>
              <div style={{padding:"4px 0"}}>
                <div style={{marginBottom:8}}>
                  <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>Current mWO</div>
                  <div className="mono" style={{fontSize:13, fontWeight:600, color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>{a.currentMwo}</div>
                </div>
                <div className="gauge-row">
                  <span style={{width:120, fontSize:11}}>Availability (30d)</span>
                  <div className="gauge-bar"><span className={a.availability30d<90?"red":(a.availability30d<95?"amber":"")} style={{width:a.availability30d+"%"}}></span></div>
                  <span className="mono" style={{fontSize:11, width:60, textAlign:"right"}}>{a.availability30d}%</span>
                </div>
                <div className="gauge-row">
                  <span style={{width:120, fontSize:11}}>MTBF (30d)</span>
                  <div className="gauge-bar"><span style={{width: Math.min((parseInt(a.mtbf30d)/200*100), 100)+"%"}}></span></div>
                  <span className="mono" style={{fontSize:11, width:60, textAlign:"right"}}>{a.mtbf30d}</span>
                </div>
                <div className="gauge-row">
                  <span style={{width:120, fontSize:11}}>MTTR (30d)</span>
                  <div className="gauge-bar"><span className="amber" style={{width: Math.min((parseInt(a.mttr30d)/90*100), 100)+"%"}}></span></div>
                  <span className="mono" style={{fontSize:11, width:60, textAlign:"right"}}>{a.mttr30d}</span>
                </div>
              </div>
            </div>

            <div className="card" style={{marginTop:12}}>
              <div className="card-head"><h3 className="card-title">Mini alerts</h3></div>
              <div className="alert-amber alert-box" style={{fontSize:11, marginBottom:6}}>
                <span>⚠</span>
                <div>LOTO-2026-0089 active — work in progress.</div>
              </div>
              <div className="alert-amber alert-box" style={{fontSize:11, marginBottom:6}}>
                <span>⚠</span>
                <div>PM-0001 due in 10 days (2026-05-01).</div>
              </div>
              <div className="alert-blue alert-box" style={{fontSize:11}}>
                <span>ⓘ</span>
                <div>2 production WOs delayed by current downtime: WO-2026-0108, WO-2026-0111.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Service history — {a.history.length} records</h3>
            <div className="row-flex">
              <select style={{width:140, fontSize:11}}>
                <option>All types</option>
                <option>Preventive</option>
                <option>Reactive</option>
                <option>Calibration</option>
                <option>Inspection</option>
              </select>
              <input type="text" placeholder="Date range" style={{width:120, fontSize:11}}/>
            </div>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>mWO</th><th>Description</th><th>Technician</th><th>Duration</th><th>Cost</th></tr></thead>
            <tbody>
              {a.history.map((h,i) => (
                <tr key={i} style={{cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>
                  <td className="mono" style={{fontSize:11}}>{h.t}</td>
                  <td><MwoType t={h.type}/></td>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{h.mwo}</td>
                  <td style={{fontSize:11}}>{h.desc}</td>
                  <td style={{fontSize:11}}>{h.tech}</td>
                  <td className="mono" style={{fontSize:11}}>{h.duration}</td>
                  <td className="mono" style={{fontSize:11}}>{h.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{textAlign:"center", padding:10}}><button className="btn btn-ghost btn-sm">Load more</button></div>
        </div>
      )}

      {tab === "pm" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">PM schedules ({a.pmSchedules.length})</h3>
            {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("pmEdit", { assetId: a.id, mode: "create" })}>＋ Add PM Schedule</button>}
          </div>
          <table>
            <thead><tr><th>PM #</th><th>Type</th><th>Frequency</th><th>Last done</th><th>Next due</th><th>Technician</th><th>Template</th></tr></thead>
            <tbody>
              {a.pmSchedules.map(p => (
                <tr key={p.pm} style={{cursor:"pointer"}} onClick={()=>onNav("pm_schedules")}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{p.pm}</td>
                  <td><MwoType t={p.type}/></td>
                  <td style={{fontSize:11}}>{p.freq}</td>
                  <td className="mono" style={{fontSize:11}}>{p.lastDone}</td>
                  <td><DueCell date={p.nextDue}/></td>
                  <td style={{fontSize:11}}>{p.tech}</td>
                  <td style={{fontSize:11}}>{p.tmpl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "spares" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Spare parts BOM</h3>
            {isManager && <button className="btn btn-primary btn-sm">＋ Add part</button>}
          </div>
          <table>
            <thead><tr><th>Part code</th><th>Description</th><th>Unit</th><th style={{textAlign:"right"}}>Qty/service</th><th style={{textAlign:"right"}}>On hand</th><th>Last used</th><th>Unit cost</th></tr></thead>
            <tbody>
              {a.spares.map(s => (
                <tr key={s.code} className={s.low ? "stock-low-row" : ""} style={{cursor:"pointer"}} onClick={()=>onNav("spare_detail")}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{s.code}</td>
                  <td style={{fontSize:11}}>{s.desc}</td>
                  <td className="mono" style={{fontSize:11}}>{s.unit}</td>
                  <td className="num mono">{s.plan}</td>
                  <td className={"num mono " + (s.low ? "qty-cell" : "")}>{s.onHand}</td>
                  <td className="mono" style={{fontSize:11}}>{s.lastUsed}</td>
                  <td className="mono" style={{fontSize:11}}>{s.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "docs" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Documents ({a.documents.length})</h3>
            <button className="btn btn-secondary btn-sm">⇪ Upload document</button>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(240px, 1fr))", gap:10}}>
            {a.documents.map((d,i)=>(
              <div key={i} className="cert-card">
                <div className="cert-ic">📄</div>
                <div className="cert-meta">
                  <div className="cm-name">{d.name}</div>
                  <div className="muted" style={{fontSize:10, marginTop:2}}>{d.size} · {d.uploadedAt}</div>
                  <div className="muted" style={{fontSize:10}}>by {d.uploadedBy}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "downtime" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Downtime events ({a.downtime.length})</h3>
            <span className="muted" style={{fontSize:11}}>Sourced from 08-PRODUCTION · read-only</span>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Line</th><th style={{textAlign:"right"}}>Duration</th><th>Cause</th><th>Linked mWO</th><th>Source</th><th></th></tr></thead>
            <tbody>
              {a.downtime.map((d,i)=>(
                <tr key={i}>
                  <td className="mono" style={{fontSize:11}}>{d.t}</td>
                  <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{d.line}</td>
                  <td className="num mono">{d.dur} min</td>
                  <td style={{fontSize:11}}>{d.cat}</td>
                  <td>{d.mwo ? <span className="mono" style={{fontWeight:600, color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>{d.mwo}</span> : <span className="badge badge-amber" style={{fontSize:9}}>Unlinked</span>}</td>
                  <td><span className={"mwo-src " + (d.src === "auto" ? "auto_downtime" : d.src === "manual" ? "manual" : "")}>{d.src}</span></td>
                  <td>{!d.mwo && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("dtLink", { event: d })}>Link mWO</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sensors" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Sensors (P2)</h3>
            <span className="badge badge-amber" style={{fontSize:9}}>Phase 2</span>
          </div>
          <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:14}}>
            <span>ⓘ</span>
            <div>IoT sensor integration is available in Phase 2. Contact your administrator to enable sensor monitoring for this asset.</div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, opacity:0.4, pointerEvents:"none"}}>
            <div className="card" style={{padding:14}}>
              <div style={{fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>Temperature trend — 24h</div>
              <div style={{fontSize:28, fontWeight:700, fontFamily:"var(--font-mono)", marginTop:6}}>—</div>
              <div style={{height:60, background:"var(--gray-100)", borderRadius:4, marginTop:10}}></div>
            </div>
            <div className="card" style={{padding:14}}>
              <div style={{fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600}}>Vibration FFT — last 1h</div>
              <div style={{fontSize:28, fontWeight:700, fontFamily:"var(--font-mono)", marginTop:6}}>—</div>
              <div style={{height:60, background:"var(--gray-100)", borderRadius:4, marginTop:10}}></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { MntAssetList, MntAssetDetail });
