// ============ MS-SIT Sites List + MS-SIT-D Site Detail ============

// -------- MS-SIT Sites List --------
const MsSitesList = ({ role, site, onNav, onOpenSite, openModal }) => {
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("active");
  const [search, setSearch] = React.useState("");

  const isAdmin = role === "Admin";
  const filtered = MS_SITES.filter(s => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (statusFilter === "active" && !s.active) return false;
    if (statusFilter === "inactive" && s.active) return false;
    if (search && !(s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Sites
          </div>
          <h1 className="page-title">Sites</h1>
          <div className="muted" style={{fontSize:12}}>{filtered.length} of {MS_SITES.length} sites shown · manage your organization's site network</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={()=>openModal("siteCreate")}>＋ Add Site</button>}
        </div>
      </div>

      <AllSitesBanner site={site}/>

      <div className="filter-bar">
        <input placeholder="Search site name or code…" style={{width:280}} value={search} onChange={e=>setSearch(e.target.value)}/>
        <select style={{width:140}} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          <option value="plant">Plant</option>
          <option value="warehouse">Warehouse</option>
          <option value="office">Office</option>
          <option value="copack">Co-pack</option>
        </select>
        <select style={{width:140}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="spacer"></span>
        <button className="clear-all" onClick={()=>{setTypeFilter("all");setStatusFilter("active");setSearch("");}}>Clear</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr>
            <th>Site Code</th>
            <th>Name</th>
            <th>Type</th>
            <th>Country / TZ</th>
            <th>Status</th>
            <th>Last Sync</th>
            <th>Owner</th>
            <th style={{textAlign:"right"}}>Modules</th>
            <th style={{textAlign:"right"}}>Users</th>
            <th></th>
          </tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} style={{cursor:"pointer"}} onClick={()=>onOpenSite(s.id)}>
                <td className="mono" style={{fontWeight:700}}>{s.code}</td>
                <td style={{fontWeight:600}}>{s.name} {s.isDefault && <span className="badge badge-blue" style={{fontSize:9}}>Default</span>}</td>
                <td><SiteTypeBadge t={s.type}/></td>
                <td><span style={{fontSize:11}}>{s.flag} {s.country}</span><br/><span className="mono muted" style={{fontSize:10}}>{s.tz}</span></td>
                <td><span className={"badge " + (s.active ? "badge-green" : "badge-gray")} style={{fontSize:10}}>{s.active ? "Active" : "Inactive"}</span></td>
                <td className="muted" style={{fontSize:11}}>{s.lastSync}</td>
                <td style={{fontSize:11}}>{s.owner}</td>
                <td className="num mono">{s.modules} / 15</td>
                <td className="num mono">{s.users}</td>
                <td onClick={e=>e.stopPropagation()}>
                  {isAdmin && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("siteCreate", {edit: true, site: s})}>✏️</button>}
                  {isAdmin && !s.isDefault && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("decommission", s)} title="Decommission">⋮</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{padding:40, textAlign:"center"}}>
            <div className="muted">No sites match your filters. <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={()=>{setTypeFilter("all");setStatusFilter("active");setSearch("");}}>Clear filters</a></div>
          </div>
        )}
        <div style={{padding:"10px 14px", borderTop:"1px solid var(--border)", fontSize:11, color:"var(--muted)"}}>
          Showing {filtered.length} of {MS_SITES.length} sites
        </div>
      </div>
    </>
  );
};

// -------- MS-SIT-D Site Detail --------
const MsSiteDetail = ({ role, site, onNav, onBack, openModal, currentSiteId }) => {
  const [tab, setTab] = React.useState("overview");
  const subject = MS_SITES.find(s => s.id === currentSiteId) || MS_SITES[0];
  const isAdmin = role === "Admin";
  const isSiteManager = role === "Site Manager";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={onBack}>Multi-Site</a> · <a onClick={()=>onNav("sites")}>Sites</a> · {subject.name}
          </div>
          <h1 className="page-title" style={{display:"flex", alignItems:"center", gap:10}}>
            {subject.flag} {subject.name}
            <span className="mono" style={{fontSize:14, color:"var(--muted)", fontWeight:500}}>{subject.code}</span>
            <SiteTypeBadge t={subject.type}/>
            {subject.isDefault && <span className="badge badge-blue" style={{fontSize:10}}>Default</span>}
            <StatusDot state={subject.online ? "online" : (subject.onlineState === "degraded" ? "degraded" : "offline")}/>
          </h1>
          <div className="muted" style={{fontSize:12}}>{subject.legalEntity} · {subject.address}</div>
        </div>
        <div className="row-flex">
          {isAdmin && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("siteCreate", {edit: true, site: subject})}>✏️ Edit Site</button>}
          <button className="btn btn-secondary btn-sm">⌂ Switch to this Site</button>
          {isAdmin && !subject.isDefault && <button className="btn btn-danger btn-sm" onClick={()=>openModal("decommission", subject)}>Decommission</button>}
        </div>
      </div>

      <div className="ms-tabs">
        {[
          ["overview", "Overview"],
          ["config",   "Config (L2 Overrides)"],
          ["inventory","Inventory Snapshot"],
          ["production","Production Snapshot"],
          ["users",    "Users"],
          ["transfers","Transfers"],
          ["calendar", "Calendar"],
          ["docs",     "Docs"],
        ].map(([k,lab]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={()=>setTab(k)}>{lab}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ms-info-grid">
          <div className="ms-info-card">
            <h3>Site Identity</h3>
            <div className="ms-info-field"><span className="mif-label">Site Code</span>    <span className="mif-value mono">{subject.code}</span></div>
            <div className="ms-info-field"><span className="mif-label">Legal Entity</span> <span className="mif-value">{subject.legalEntity}</span></div>
            <div className="ms-info-field"><span className="mif-label">Country</span>      <span className="mif-value">{subject.flag} {subject.country}</span></div>
            <div className="ms-info-field"><span className="mif-label">Timezone</span>     <span className="mif-value mono">{subject.tz} ({subject.tzShort})</span></div>
            <div className="ms-info-field"><span className="mif-label">Currency</span>     <span className="mif-value mono">{subject.currency}</span></div>
            <div className="ms-info-field"><span className="mif-label">Data Residency</span><span className="mif-value"><span className="mono">{subject.region}</span> <span className={"badge " + (subject.residencyTier === "P1" ? "badge-blue" : "badge-amber")} style={{fontSize:9}}>{subject.residencyTier}</span></span></div>
            <div className="ms-info-field"><span className="mif-label">Hierarchy</span>    <span className="mif-value">{subject.levelNames}</span></div>
            <div className="ms-info-field"><span className="mif-label">Default Site</span> <span className="mif-value">{subject.isDefault ? <span className="badge badge-blue" style={{fontSize:10}}>Default</span> : "No"}</span></div>
            <div className="ms-info-field"><span className="mif-label">Activation</span>   <span className="mif-value mono">{subject.activationDate}</span></div>
            <div className="ms-info-field"><span className="mif-label">Created</span>      <span className="mif-value">{subject.createdAt} · by {subject.createdBy}</span></div>
          </div>
          <div className="ms-info-card">
            <h3>Status</h3>
            <div className="ms-info-field"><span className="mif-label">Status</span> <span className="mif-value"><span className={"badge " + (subject.active ? "badge-green" : "badge-gray")} style={{fontSize:10}}>{subject.active ? "Active" : "Inactive"}</span></span></div>
            <div className="ms-info-field"><span className="mif-label">Online</span> <span className="mif-value"><StatusDot state={subject.online ? "online" : "degraded"}/> {subject.online ? "Online" : "Degraded"}</span></div>
            <div className="ms-info-field"><span className="mif-label">Last Seen</span> <span className="mif-value">{subject.lastSync}</span></div>
            <div className="ms-info-field"><span className="mif-label">Site Owner</span><span className="mif-value">{subject.owner}</span></div>
            <div className="ms-info-field"><span className="mif-label">Modules</span> <span className="mif-value">{subject.modules} of 15 enabled</span></div>

            <div className="ms-mini-kpi">
              <div><div className="mmk-lab">Active WOs</div><div className="mmk-val">{subject.activeWOs}</div></div>
              <div><div className="mmk-lab">Quality holds</div><div className="mmk-val" style={{color: subject.qualityHolds > 0 ? "var(--amber-700)" : "var(--text)"}}>{subject.qualityHolds}</div></div>
              <div><div className="mmk-lab">Inventory value</div><div className="mmk-val" style={{fontSize:14}}>{subject.invValueTxt}</div></div>
              <div><div className="mmk-lab">Availability 7d</div><div className="mmk-val" style={{color:"var(--green-700)"}}>{subject.availability}</div></div>
            </div>
          </div>
        </div>
      )}

      {tab === "config" && (
        <>
          <div className="alert-blue alert-box" style={{marginBottom:12, fontSize:12}}>
            <span>ⓘ</span>
            <div>
              These settings override the L1 baseline for this site only. Changes take effect immediately on next request.
              <a style={{color:"var(--blue)", cursor:"pointer", marginLeft:6}}>View base config in Settings →</a>
            </div>
          </div>
          <div className="row-flex" style={{marginBottom:10}}>
            <b style={{fontSize:13}}>{subject.code} · L2 Configuration</b>
            <span className="spacer"></span>
            {(isAdmin || isSiteManager) && <button className="btn btn-primary btn-sm" onClick={()=>openModal("configOverride", {site: subject})}>＋ Add Override</button>}
          </div>
          <div className="card" style={{padding:0}}>
            <table>
              <thead><tr><th>Setting Key</th><th>L1 Base Value</th><th>Site Override</th><th>Source</th><th>Last Updated</th><th>Updated By</th><th></th></tr></thead>
              <tbody>
                {MS_SITE_CONFIG.map(c => (
                  <tr key={c.key}>
                    <td className="mono" style={{fontWeight:600, fontSize:11}}>{c.key}</td>
                    <td className="muted mono" style={{fontSize:11}}>{c.baseValue}</td>
                    <td className="mono" style={{fontSize:11, fontWeight: c.siteValue ? 600 : 400}}>{c.siteValue ?? "—"}</td>
                    <td>{c.source === "l2" ? <span className="badge badge-blue" style={{fontSize:9}}>L2 Override</span> : <span className="badge badge-gray" style={{fontSize:9}}>Base</span>}</td>
                    <td className="muted" style={{fontSize:11}}>{c.updated}</td>
                    <td style={{fontSize:11}}>{c.by}</td>
                    <td>
                      {(isAdmin || isSiteManager) && <>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openModal("configOverride", {site: subject, key: c.key})}>Edit</button>
                        {c.source === "l2" && <button className="btn btn-ghost btn-sm">Clear</button>}
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "inventory" && (
        <>
          <div className="ms-info-grid" style={{gridTemplateColumns:"repeat(3, 1fr)"}}>
            <div className="kpi blue"><div className="kpi-label">Total Active LPs</div><div className="kpi-value">1,247</div><div className="kpi-sub">at {subject.code}</div></div>
            <div className="kpi green"><div className="kpi-label">Total Stock Value</div><div className="kpi-value" style={{fontSize:22}}>{subject.invValueTxt}</div><div className="kpi-sub">83 unique SKUs</div></div>
            <div className="kpi blue"><div className="kpi-label">Locations</div><div className="kpi-value">18</div><div className="kpi-sub">3 zones · 15 bins</div></div>
          </div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Top-5 items by qty on hand</h3>
              <button className="btn btn-secondary btn-sm">Open Warehouse for {subject.code} →</button>
            </div>
            <table>
              <thead><tr><th>Item Code</th><th>Item Name</th><th style={{textAlign:"right"}}>Qty on Hand</th><th>Unit</th><th>Site</th></tr></thead>
              <tbody>
                <tr><td className="mono">R-1001</td><td>Wieprzowina kl. II</td><td className="num mono">758</td><td>kg</td><td><SiteRef id={subject.id} compact/></td></tr>
                <tr><td className="mono">R-1101</td><td>Wołowina gulaszowa</td><td className="num mono">840</td><td>kg</td><td><SiteRef id={subject.id} compact/></td></tr>
                <tr><td className="mono">R-3001</td><td>Osłonka Ø26</td><td className="num mono">800</td><td>m</td><td><SiteRef id={subject.id} compact/></td></tr>
                <tr><td className="mono">R-1501</td><td>Mąka pszenna typ 500</td><td className="num mono">380</td><td>kg</td><td><SiteRef id={subject.id} compact/></td></tr>
                <tr><td className="mono">IN1301</td><td>Farsz pierogowy mieszany</td><td className="num mono">420</td><td>kg</td><td><SiteRef id={subject.id} compact/></td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "production" && (
        <>
          <div className="ms-info-grid" style={{gridTemplateColumns:"repeat(3, 1fr)"}}>
            <div className="kpi blue"><div className="kpi-label">Active WOs</div><div className="kpi-value">{subject.activeWOs}</div><div className="kpi-sub">at {subject.code}</div></div>
            <div className="kpi green"><div className="kpi-label">Completed (7d)</div><div className="kpi-value">22</div><div className="kpi-sub">rolling 7-day</div></div>
            <div className="kpi blue"><div className="kpi-label">WIP Value</div><div className="kpi-value" style={{fontSize:22}}>£184k</div><div className="kpi-sub">Intermediate buffer + in-flight</div></div>
          </div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">5 most recent work orders</h3>
              <button className="btn btn-secondary btn-sm">Open Production for {subject.code} →</button>
            </div>
            <table>
              <thead><tr><th>WO#</th><th>Product</th><th>Status</th><th style={{textAlign:"right"}}>Planned Qty</th><th>Site</th></tr></thead>
              <tbody>
                <tr><td className="mono" style={{color:"var(--blue)"}}>WO-2026-0108</td><td>FA5100 Kiełbasa śląska 450g</td><td><span className="badge badge-blue" style={{fontSize:9}}>running</span></td><td className="num mono">1,800 kg</td><td><SiteRef id={subject.id} compact/></td></tr>
                <tr><td className="mono" style={{color:"var(--blue)"}}>WO-2026-0111</td><td>FA5021 Gulasz wołowy</td><td><span className="badge badge-amber" style={{fontSize:9}}>scheduled</span></td><td className="num mono">480 kg</td><td><SiteRef id={subject.id} compact/></td></tr>
                <tr><td className="mono" style={{color:"var(--blue)"}}>WO-2026-0115</td><td>FA5400 Filet sous-vide 180g</td><td><span className="badge badge-amber" style={{fontSize:9}}>draft</span></td><td className="num mono">120 kg</td><td><SiteRef id={subject.id} compact/></td></tr>
                <tr><td className="mono" style={{color:"var(--blue)"}}>WO-2026-0100</td><td>FA5200 Pasztet drob.</td><td><span className="badge badge-green" style={{fontSize:9}}>done</span></td><td className="num mono">212 kg</td><td><SiteRef id={subject.id} compact/></td></tr>
                <tr><td className="mono" style={{color:"var(--blue)"}}>WO-2026-0099</td><td>FA5400 Filet sous-vide</td><td><span className="badge badge-green" style={{fontSize:9}}>done</span></td><td className="num mono">360 kg</td><td><SiteRef id={subject.id} compact/></td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "users" && (
        <>
          <div className="row-flex" style={{marginBottom:10}}>
            <b style={{fontSize:13}}>Users assigned to {subject.code}</b>
            <span className="spacer"></span>
            {isAdmin && <button className="btn btn-primary btn-sm" onClick={()=>openModal("assignUser", {site: subject})}>＋ Assign User</button>}
          </div>
          <div className="card" style={{padding:0}}>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role at this site</th><th>Primary</th><th>Granted</th><th>Granted By</th><th></th></tr></thead>
              <tbody>
                {MS_PERM_MATRIX.flatMap(p => p.assignments.filter(a => a.site === subject.id).map(a => {
                  const u = MS_USERS.find(x => x.id === p.user);
                  return (
                    <tr key={p.user + a.site}>
                      <td><div className="avatar" style={{width:24, height:24, fontSize:10, marginRight:6, display:"inline-flex", verticalAlign:"middle"}}>{u?.avatar}</div> {u?.name}</td>
                      <td className="muted" style={{fontSize:11}}>{u?.email}</td>
                      <td><span className="badge badge-blue" style={{fontSize:9}}>{a.role}</span></td>
                      <td>{a.primary ? <span className="badge badge-green" style={{fontSize:9}}>⭐ Primary</span> : "—"}</td>
                      <td className="muted" style={{fontSize:11}}>3d ago</td>
                      <td style={{fontSize:11}}>admin</td>
                      <td>
                        {isAdmin && <><button className="btn btn-ghost btn-sm" onClick={()=>openModal("assignUser", {site: subject, user: u, edit: true})}>Edit</button><button className="btn btn-ghost btn-sm">Remove</button></>}
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "transfers" && (
        <>
          <div className="row-flex" style={{marginBottom:10}}>
            <b style={{fontSize:13}}>Transfers for {subject.code}</b>
            <span className="spacer"></span>
            <button className="btn btn-secondary btn-sm" onClick={()=>onNav("transfers")}>View All Transfers →</button>
          </div>
          <div className="ms-info-grid">
            <div className="card">
              <div className="card-head"><h3 className="card-title">Outbound (from {subject.code})</h3></div>
              <table>
                <thead><tr><th>IST#</th><th>To</th><th>Status</th><th>Shipped</th><th>ETA</th></tr></thead>
                <tbody>
                  {MS_ISTS.filter(t => t.from === subject.id).slice(0,5).map(t => (
                    <tr key={t.id}>
                      <td className="mono" style={{color:"var(--blue)"}}>{t.id}</td>
                      <td><SiteRef id={t.to} compact/></td>
                      <td><ISTStatus s={t.status}/></td>
                      <td className="muted" style={{fontSize:11}}>{t.shippedDate || "—"}</td>
                      <td className="mono" style={{fontSize:11}}>{t.eta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="card-head"><h3 className="card-title">Inbound (to {subject.code})</h3></div>
              <table>
                <thead><tr><th>IST#</th><th>From</th><th>Status</th><th>Shipped</th><th>ETA</th></tr></thead>
                <tbody>
                  {MS_ISTS.filter(t => t.to === subject.id).slice(0,5).map(t => (
                    <tr key={t.id}>
                      <td className="mono" style={{color:"var(--blue)"}}>{t.id}</td>
                      <td><SiteRef id={t.from} compact/></td>
                      <td><ISTStatus s={t.status}/></td>
                      <td className="muted" style={{fontSize:11}}>{t.shippedDate || "—"}</td>
                      <td className="mono" style={{fontSize:11}}>{t.eta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "calendar" && (
        <>
          <div className="row-flex" style={{marginBottom:10}}>
            <b style={{fontSize:13}}>Holidays · {subject.code} · May 2026</b>
            <span className="spacer"></span>
            {isAdmin && <button className="btn btn-primary btn-sm">＋ Add Holiday</button>}
          </div>
          <div className="card" style={{padding:14}}>
            <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:4, fontSize:11}}>
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => <div key={d} className="muted" style={{textAlign:"center", fontWeight:700, fontSize:10, padding:4}}>{d}</div>)}
              {[...Array(31).keys()].map(i => {
                const day = i + 1;
                const h = MS_HOLIDAYS_SITE_B.find(x => x.date === `2026-05-${String(day).padStart(2,"0")}`);
                return (
                  <div key={day} style={{border:"1px solid var(--border)", borderRadius:3, padding:6, minHeight:40, background: h ? "var(--amber-050a)" : "#fff"}}>
                    <div style={{fontWeight:600}}>{day}</div>
                    {h && <div style={{fontSize:9, color:"var(--amber-700)", marginTop:3}}>● {h.name}</div>}
                  </div>
                );
              })}
            </div>
            <div className="muted" style={{fontSize:11, marginTop:10, paddingTop:10, borderTop:"1px dashed var(--border)"}}>
              {MS_HOLIDAYS_SITE_B.length} holidays configured for this site. Public and company holidays propagate to Planning's shift pattern.
            </div>
          </div>
        </>
      )}

      {tab === "docs" && (
        <>
          <div className="row-flex" style={{marginBottom:10}}>
            <b style={{fontSize:13}}>Site documents</b>
            <span className="spacer"></span>
            <button className="btn btn-primary btn-sm">＋ Upload Document</button>
          </div>
          <div className="card" style={{padding:0}}>
            <table>
              <thead><tr><th>File Name</th><th>Type</th><th>Uploaded By</th><th>Uploaded At</th><th></th></tr></thead>
              <tbody>
                {MS_SITE_DOCS_B.map(d => (
                  <tr key={d.name}>
                    <td className="mono">{d.name}</td>
                    <td><span className="badge badge-gray" style={{fontSize:9}}>{d.type}</span></td>
                    <td>{d.by}</td>
                    <td className="muted" style={{fontSize:11}}>{d.at}</td>
                    <td><button className="btn btn-ghost btn-sm">⇩ Download</button><button className="btn btn-ghost btn-sm">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{fontSize:11, padding:"10px 14px", borderTop:"1px solid var(--border)"}}>
              Max 50MB per file. Accepts PDF, DOCX, XLSX, PNG, JPG.
            </div>
          </div>
        </>
      )}
    </>
  );
};

Object.assign(window, { MsSitesList, MsSiteDetail });
