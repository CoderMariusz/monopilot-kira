// ============ MS-PRM Permissions · MS-ANA Analytics · MS-CFG Settings · MS-ACT Activation ============

// -------- MS-PRM Permissions matrix --------
const MsPermissions = ({ role, site, onNav, openModal }) => {
  const [view, setView] = React.useState("matrix");
  const isAdmin = role === "Admin";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Permissions
          </div>
          <h1 className="page-title">Site Permissions</h1>
          <div className="muted" style={{fontSize:12}}>User × site access matrix. {MS_USERS.length} users · {MS_SITES.filter(s=>s.active).length} active sites · {MS_PERM_MATRIX.reduce((a,p)=>a+p.assignments.length,0)} assignments</div>
        </div>
        <div className="row-flex">
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={()=>openModal("assignUser")}>＋ Assign User to Site</button>}
        </div>
      </div>

      <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>ⓘ</span>
        <div>Users with the <b>super_admin</b> or <b>ops_director</b> role automatically have cross-site read access. They are not shown per-site in this matrix. <a style={{color:"var(--blue)", cursor:"pointer"}}>Learn More</a></div>
      </div>

      <div className="filter-bar">
        <input placeholder="Search user or site…" style={{width:240}}/>
        <div className="pills">
          <button className={"pill " + (view === "matrix" ? "on" : "")} onClick={()=>setView("matrix")}>Matrix View</button>
          <button className={"pill " + (view === "user" ? "on" : "")} onClick={()=>setView("user")}>User View</button>
          <button className={"pill " + (view === "site" ? "on" : "")} onClick={()=>setView("site")}>Site View</button>
        </div>
        <select style={{width:150}}><option>All roles</option><option>site_manager</option><option>planner</option><option>warehouse_operator</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear</button>
      </div>

      {view === "matrix" && (
        <div className="perm-matrix-wrap">
          <table className="perm-matrix">
            <thead>
              <tr>
                <th className="user-col">User</th>
                {MS_SITES.filter(s => s.active).map(s => (
                  <th key={s.id}>{s.code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MS_USERS.map(u => {
                const row = MS_PERM_MATRIX.find(p => p.user === u.id);
                return (
                  <tr key={u.id}>
                    <td className="user-cell">
                      {u.name}
                      <span className="pm-email">{u.email}</span>
                    </td>
                    {MS_SITES.filter(s => s.active).map(s => {
                      if (u.superAdmin) return <td key={s.id}><span className="pm-allsites">ALL</span></td>;
                      const a = row?.assignments.find(x => x.site === s.id);
                      if (!a) return <td key={s.id} className="pm-empty" onClick={()=>isAdmin && openModal("assignUser", {user: u, site: s})}></td>;
                      return (
                        <td key={s.id}>
                          <span className="badge badge-blue" style={{fontSize:9}}>{a.role}</span>
                          {a.primary && <span className="pm-star">⭐</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "user" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Site</th><th>Role at site</th><th>Primary</th><th>Granted</th><th></th></tr></thead>
            <tbody>
              {MS_PERM_MATRIX.flatMap(p => p.assignments.map(a => {
                const u = MS_USERS.find(x => x.id === p.user);
                const s = MS_SITES.find(x => x.id === a.site);
                return (
                  <tr key={p.user + a.site}>
                    <td><div className="avatar" style={{width:22, height:22, fontSize:10, marginRight:6, display:"inline-flex", verticalAlign:"middle"}}>{u?.avatar}</div> {u?.name}</td>
                    <td className="muted" style={{fontSize:11}}>{u?.email}</td>
                    <td><SiteRef id={s?.id}/></td>
                    <td><span className="badge badge-blue" style={{fontSize:9}}>{a.role}</span></td>
                    <td>{a.primary ? <span className="badge badge-green" style={{fontSize:9}}>⭐ Primary</span> : "—"}</td>
                    <td className="muted" style={{fontSize:11}}>3d ago</td>
                    <td>{isAdmin && <><button className="btn btn-ghost btn-sm">Edit</button><button className="btn btn-ghost btn-sm">Remove</button></>}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      )}

      {view === "site" && (
        <div>
          {MS_SITES.filter(s => s.active).map(s => {
            const users = MS_PERM_MATRIX.filter(p => p.assignments.some(a => a.site === s.id));
            return (
              <div key={s.id} className="card" style={{marginBottom:10}}>
                <div className="card-head">
                  <h3 className="card-title"><SiteRef id={s.id}/> <span className="muted" style={{fontSize:11, fontWeight:400}}>({users.length} users)</span></h3>
                  {isAdmin && <button className="btn btn-ghost btn-sm" onClick={()=>openModal("assignUser", {site: s})}>＋ Add User to {s.code}</button>}
                </div>
                <table>
                  <tbody>
                    {users.map(p => {
                      const u = MS_USERS.find(x => x.id === p.user);
                      const a = p.assignments.find(x => x.site === s.id);
                      return (
                        <tr key={p.user}>
                          <td style={{width:40}}><div className="avatar" style={{width:22, height:22, fontSize:10}}>{u?.avatar}</div></td>
                          <td>{u?.name}</td>
                          <td><span className="badge badge-blue" style={{fontSize:9}}>{a.role}</span></td>
                          <td>{a.primary && <span className="badge badge-green" style={{fontSize:9}}>⭐ Primary</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// -------- MS-ANA Analytics --------
const MsAnalytics = ({ role, site, onNav, openModal }) => {
  const [tab, setTab] = React.useState("inventory");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Analytics
          </div>
          <h1 className="page-title">Multi-Site Analytics</h1>
          <div className="muted" style={{fontSize:12}}>Cross-site inventory balance · shipping costs · lane utilization · conflict rate · per-site benchmark</div>
        </div>
        <div className="row-flex">
          <select style={{width:150}}><option>Last 30 days</option><option>7 days</option><option>90 days</option></select>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
        </div>
      </div>

      {site !== "ALL" && (
        <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>ⓘ</span><div>Multi-site analytics is best used in <b>All Sites</b> scope. Some widgets require cross-site data.</div>
          <button className="btn btn-sm btn-primary">Switch to All Sites</button>
        </div>
      )}

      <div className="ms-tabs">
        <button className={tab === "inventory" ? "on" : ""} onClick={()=>setTab("inventory")}>Inventory Balance</button>
        <button className={tab === "shipping" ? "on" : ""} onClick={()=>setTab("shipping")}>Shipping Costs</button>
        <button className={tab === "utilization" ? "on" : ""} onClick={()=>setTab("utilization")}>Lane Utilization</button>
        <button className={tab === "conflict" ? "on" : ""} onClick={()=>setTab("conflict")}>Conflict Rate</button>
        <button className={tab === "benchmark" ? "on" : ""} onClick={()=>setTab("benchmark")}>Per-Site Benchmark</button>
      </div>

      {tab === "inventory" && (
        <>
          <div className="ms-info-grid" style={{gridTemplateColumns:"repeat(3, 1fr)"}}>
            <div className="kpi blue"><div className="kpi-label">Network Inventory Value</div><div className="kpi-value">£2.44M</div><div className="kpi-sub">across 3 active sites</div></div>
            <div className="kpi green"><div className="kpi-label">Highest Site Inventory</div><div className="kpi-value" style={{fontSize:20}}>FRZ-UK</div><div className="kpi-sub">£1.24M (53%)</div></div>
            <div className="kpi amber"><div className="kpi-label">Lowest Site Inventory</div><div className="kpi-value" style={{fontSize:20}}>WH-COLD</div><div className="kpi-sub">£420k (14%)</div></div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Inventory Balance · % of network total</h3></div>
            <div className="ms-bar-chart">
              {MS_INV_BALANCE.map(r => (
                <div key={r.site} className="ms-bar-row">
                  <div className="ms-bar-label">{MS_SITES.find(s=>s.id===r.site)?.code}<span className="mono">{MS_SITES.find(s=>s.id===r.site)?.name.split(" — ")[0]}</span></div>
                  <div className="ms-bar-track"><div className={"ms-bar-fill " + (r.pct < 20 ? "low" : r.pct > 45 ? "high" : "")} style={{width: r.pct + "%"}}>{r.pct}%</div></div>
                  <div className="ms-bar-val">{r.valueTxt}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="ms-rebalance" style={{marginTop:12}}>
            <div className="ms-reb-head">Rebalance Suggestions</div>
            {MS_REBALANCE_SUGGESTIONS.map((r,i) => (
              <div key={i} className="ms-reb-item">
                <div>
                  <SiteRef id={r.from} compact/> → <SiteRef id={r.to} compact/> · <b>{r.item}</b> · {r.qty} · est. freight <span className="mono">{r.estCost}</span>
                </div>
                <button className="btn btn-primary btn-sm" onClick={()=>openModal("istCreate", {prefill: r})}>Create Suggested Transfer</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "shipping" && (
        <>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Monthly freight cost (last 6 months)</h3></div>
            <div className="ms-line-chart">
              {MS_SHIPPING_COST_MONTHLY.concat([{mo:"",cost:0},{mo:"",cost:0},{mo:"",cost:0},{mo:"",cost:0},{mo:"",cost:0},{mo:"",cost:0}]).slice(0,12).map((c,i) => (
                <div key={i} className="ms-bar" style={{height: (c.cost / 20) + "px", opacity: c.cost > 0 ? 0.85 : 0.15}} data-label={c.mo}></div>
              ))}
            </div>
          </div>

          <div className="card" style={{marginTop:12, padding:0}}>
            <div className="card-head" style={{padding:"10px 14px"}}><h3 className="card-title">Cost by lane</h3></div>
            <table>
              <thead><tr><th>Lane</th><th>From</th><th>To</th><th style={{textAlign:"right"}}>Shipments</th><th style={{textAlign:"right"}}>Total Freight</th><th style={{textAlign:"right"}}>Avg / Shipment</th><th style={{textAlign:"right"}}>% of Network</th></tr></thead>
              <tbody>
                {MS_LANE_COST.map(l => (
                  <tr key={l.lane}>
                    <td className="mono" style={{color:"var(--blue)"}}>{l.lane}</td>
                    <td className="mono" style={{fontSize:11}}>{l.from}</td>
                    <td className="mono" style={{fontSize:11}}>{l.to}</td>
                    <td className="num mono">{l.shipments}</td>
                    <td className="num mono">{l.totalFreight}</td>
                    <td className="num mono">{l.avg}</td>
                    <td className="num mono">{l.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "utilization" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}><h3 className="card-title">Lane utilization (last 30 days)</h3></div>
          <table>
            <thead><tr><th>Lane</th><th style={{textAlign:"right"}}>ISTs</th><th style={{textAlign:"right"}}>Avg Lead</th><th style={{textAlign:"right"}}>On-Time</th><th>Status</th></tr></thead>
            <tbody>
              {MS_LANE_UTIL.map(l => (
                <tr key={l.lane}>
                  <td className="mono" style={{color:"var(--blue)"}}>{l.lane}</td>
                  <td className="num mono">{l.ists30d}</td>
                  <td className="num mono">{l.avgLead}</td>
                  <td className="num mono" style={{color: parseFloat(l.onTime) >= 90 ? "var(--green-700)" : "var(--amber-700)"}}>{l.onTime}</td>
                  <td><LaneHealth s={l.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "conflict" && (
        <>
          <div className="ms-info-grid" style={{gridTemplateColumns:"repeat(3, 1fr)"}}>
            <div className="kpi blue"><div className="kpi-label">Conflicts (30d)</div><div className="kpi-value">7</div><div className="kpi-sub">detected across sites</div></div>
            <div className="kpi green"><div className="kpi-label">Resolved</div><div className="kpi-value">6</div><div className="kpi-sub">avg 4.2h to resolve</div></div>
            <div className="kpi red"><div className="kpi-label">Open</div><div className="kpi-value">1</div><div className="kpi-sub">PRD-0042 at FRZ-DE</div></div>
          </div>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Conflict rate (weekly)</h3></div>
            <div className="ms-line-chart">
              {MS_CONFLICT_TREND.map((w,i) => (
                <div key={i} className="ms-bar" style={{height: (w.count * 30 + 20) + "px", background: w.count > 2 ? "var(--red)" : "var(--blue)"}} data-label={w.week}></div>
              ))}
            </div>
          </div>
          <div className="card" style={{marginTop:12, padding:0}}>
            <div className="card-head" style={{padding:"10px 14px"}}><h3 className="card-title">Breakdown by entity type</h3></div>
            <table>
              <thead><tr><th>Entity Type</th><th style={{textAlign:"right"}}>Count</th><th style={{textAlign:"right"}}>Avg resolve (h)</th></tr></thead>
              <tbody>
                {MS_CONFLICT_BY_ENTITY.map(c => (
                  <tr key={c.entity}>
                    <td><span className="badge badge-blue" style={{fontSize:9}}>{c.entity}</span></td>
                    <td className="num mono">{c.count}</td>
                    <td className="num mono">{c.avgResolveHrs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "benchmark" && (
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}><h3 className="card-title">Per-site benchmark</h3></div>
          <table>
            <thead><tr>
              <th>Site</th>
              <th style={{textAlign:"right"}}>OEE %</th>
              <th style={{textAlign:"right"}}>On-Time Ship %</th>
              <th style={{textAlign:"right"}}>QA Pass %</th>
              <th style={{textAlign:"right"}}>Active WOs</th>
              <th style={{textAlign:"right"}}>Inventory Value</th>
              <th style={{textAlign:"right"}}>ISTs Sent</th>
              <th style={{textAlign:"right"}}>ISTs Received</th>
            </tr></thead>
            <tbody>
              {MS_BENCHMARK.map(b => (
                <tr key={b.site}>
                  <td className="mono" style={{fontWeight:600}}>{b.site}</td>
                  <td className="num mono" style={{color: b.cls.oee === "ok" ? "var(--green-700)" : b.cls.oee === "low" ? "var(--red-700)" : "var(--amber-700)"}}>{b.oee}</td>
                  <td className="num mono" style={{color: b.cls.onTime === "ok" ? "var(--green-700)" : b.cls.onTime === "low" ? "var(--red-700)" : "var(--amber-700)"}}>{b.onTime}</td>
                  <td className="num mono" style={{color: b.cls.qaPass === "ok" ? "var(--green-700)" : b.cls.qaPass === "low" ? "var(--red-700)" : "var(--amber-700)"}}>{b.qaPass}</td>
                  <td className="num mono">{b.activeWOs}</td>
                  <td className="num mono">{b.invValue}</td>
                  <td className="num mono">{b.istsSent}</td>
                  <td className="num mono">{b.istsRecv}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{fontSize:11, padding:"10px 14px", borderTop:"1px solid var(--border)"}}>
            OEE data requires the 15-OEE module enabled per site. Missing data shown as "—". Metrics calculated over the selected date range.
          </div>
        </div>
      )}
    </>
  );
};

// -------- MS-CFG Settings --------
const MsSettings = ({ role, site, onNav, openModal }) => {
  const isAdmin = role === "Admin";
  const [policy, setPolicy] = React.useState(MS_SETTINGS.conflictPolicy);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <SiteCrumb site={site}/>
            <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Settings
          </div>
          <h1 className="page-title">Multi-Site Settings</h1>
          <div className="muted" style={{fontSize:12}}>Global configuration for replication, conflict policy, timezone, currency, hierarchy.</div>
        </div>
      </div>

      {/* Section 1: Activation State */}
      <div className="card" style={{marginBottom:12}}>
        <div className="card-head">
          <h3 className="card-title">1 · Activation State</h3>
          <ActState s={MS_SETTINGS.activationState}/>
        </div>
        <div style={{padding:"6px 14px 14px"}}>
          <div className="muted" style={{fontSize:12, marginBottom:10}}>Multi-site mode is fully active. RLS policies are applied to 20 operational tables. Site-scoped data isolation is enforced.</div>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("activation")}>View Activation Log</button>
          <button className="btn btn-danger btn-sm" style={{marginLeft:6}} onClick={()=>openModal("rollback")}>Roll Back to Single-Site</button>
        </div>
      </div>

      {/* Section 2: Replication Cadence */}
      <div className="card" style={{marginBottom:12, padding:0}}>
        <div className="card-head" style={{padding:"10px 14px"}}><h3 className="card-title">2 · Replication Cadence</h3></div>
        <table>
          <thead><tr><th>Entity Type</th><th>Cadence</th><th>Last Run</th><th></th></tr></thead>
          <tbody>
            {MS_REP_SCHEDULE.map(s => (
              <tr key={s.entity}>
                <td><span className="badge badge-blue" style={{fontSize:9}}>{s.entity}</span></td>
                <td>{s.cadence}</td>
                <td className="muted mono" style={{fontSize:11}}>{s.last}</td>
                <td>{isAdmin && <button className="btn btn-ghost btn-sm">✏️ Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 3: Conflict Resolution Policy */}
      <div className="card" style={{marginBottom:12}}>
        <div className="card-head"><h3 className="card-title">3 · Conflict Resolution Policy</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save Policy</button></div>
        <div style={{padding:"6px 14px 14px"}}>
          <Field label="Default policy" help="Manual is recommended for master data integrity. Last-Writer-Wins may cause data loss.">
            <select value={policy} onChange={e=>setPolicy(e.target.value)}>
              <option value="manual">Manual (admin resolves each conflict)</option>
              <option value="lww">Last-Writer-Wins</option>
              <option value="source_of_truth">Source-of-Truth Site</option>
            </select>
          </Field>
          {policy === "source_of_truth" && (
            <Field label="Source-of-Truth Site">
              <select><option>FRZ-UK (Factory-A) — default</option>{MS_SITES.filter(s=>s.active).map(s => <option key={s.id}>{s.code}</option>)}</select>
            </Field>
          )}
        </div>
      </div>

      {/* Section 4: Timezone + Language */}
      <div className="card" style={{marginBottom:12}}>
        <div className="card-head"><h3 className="card-title">4 · Timezone & Language</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save Preferences</button></div>
        <div style={{padding:"6px 14px 14px"}}>
          <div style={{padding:"8px 0", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, borderBottom:"1px dashed var(--border)"}}>
            <div><b>Display all timestamps in user's local timezone</b><div className="muted" style={{fontSize:11}}>When OFF, timestamps display in the site's configured timezone.</div></div>
            <label style={{position:"relative", display:"inline-block"}}><input type="checkbox" defaultChecked={MS_SETTINGS.tzUserLocal}/> ON</label>
          </div>
          <div style={{padding:"8px 0", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12}}>
            <div><b>Site-specific UI language</b><div className="muted" style={{fontSize:11}}>When ON, UI language changes based on the active site's language setting (en/de/pl/ro).</div></div>
            <label style={{position:"relative", display:"inline-block"}}><input type="checkbox" defaultChecked={MS_SETTINGS.siteSpecificLang}/> ON</label>
          </div>
        </div>
      </div>

      {/* Section 5: Currency */}
      <div className="card" style={{marginBottom:12}}>
        <div className="card-head"><h3 className="card-title">5 · Currency Conversion</h3></div>
        <div style={{padding:"6px 14px 14px"}}>
          <div className="muted" style={{fontSize:12, marginBottom:8}}>Currency conversion rates are managed in <b>10-FINANCE</b>. <a style={{color:"var(--blue)", cursor:"pointer"}}>Open Finance FX Settings →</a></div>
          <table>
            <thead><tr><th>Pair</th><th>Status</th><th>Last updated</th></tr></thead>
            <tbody>
              {MS_SETTINGS.fxPairs.map(p => (
                <tr key={p.pair}>
                  <td className="mono">{p.pair}</td>
                  <td>{p.status === "active" ? <span className="badge badge-green" style={{fontSize:10}}>Active</span> : <span className="badge badge-red" style={{fontSize:10}}>Missing</span>}</td>
                  <td className="muted mono" style={{fontSize:11}}>{p.age}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {MS_SETTINGS.fxPairs.some(p => p.status === "missing") && (
            <div className="alert-amber alert-box" style={{fontSize:12, marginTop:10}}>
              <span>⚠</span><div>FX rate for GBP ↔ PLN is missing. Inter-site freight costs in mixed currencies cannot be calculated.</div>
              <button className="btn btn-sm btn-primary">Add FX Rate →</button>
            </div>
          )}
        </div>
      </div>

      {/* Section 6: Hierarchy */}
      <div className="card" style={{marginBottom:12}}>
        <div className="card-head"><h3 className="card-title">6 · Hierarchy Configuration</h3>{isAdmin && <button className="btn btn-secondary btn-sm">✏️ Edit Hierarchy</button>}</div>
        <div style={{padding:"6px 14px 14px", fontSize:12}}>
          <b>Depth:</b> {MS_SETTINGS.hierarchy.depth} · <b>Level names:</b> {MS_SETTINGS.hierarchy.levelNames.join(" → ")}
          <div className="muted" style={{fontSize:11, marginTop:6}}>Changing hierarchy depth affects how sites are displayed throughout the application. Existing data is not migrated.</div>
        </div>
      </div>

      {/* Replication/Promotion admin — L1 → L2 → L3 */}
      <div className="card" style={{marginBottom:12}}>
        <div className="card-head"><h3 className="card-title">7 · Config Environment Promotion (L1 → L2 → L3)</h3></div>
        <div style={{padding:"6px 14px 14px"}}>
          <div className="muted" style={{fontSize:12, marginBottom:8}}>Promote configuration changes through environments. L1 = org baseline, L2 = site override, L3 = line override (future).</div>
          <div className="env-ladder">
            {MS_ENV_LADDER.map((e,i) => (
              <React.Fragment key={e.level}>
                <div className={"env-rung " + (e.active ? "active" : "")}>
                  <div className="er-level">{e.level}</div>
                  <div className="er-name">{e.name}</div>
                  <div className="er-stats">{e.stats}</div>
                  {!e.active && <button className="btn btn-secondary btn-sm" style={{marginTop:8}} onClick={()=>openModal("promote", {level: e.level})}>Promote to {e.level}</button>}
                </div>
                {i < MS_ENV_LADDER.length - 1 && <div className="env-arrow">→</div>}
              </React.Fragment>
            ))}
          </div>

          <h4 style={{fontSize:12, marginTop:14, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.04em"}}>Recent promotions</h4>
          <table>
            <thead><tr><th>Time</th><th>Level</th><th>Entity</th><th>Site</th><th>User</th><th>Old → New</th><th>Status</th></tr></thead>
            <tbody>
              {MS_PROMOTIONS.map((p,i) => (
                <tr key={i}>
                  <td className="muted mono" style={{fontSize:11}}>{p.t}</td>
                  <td className="mono"><span className="badge badge-blue" style={{fontSize:9}}>{p.level}</span></td>
                  <td className="mono" style={{fontSize:11}}>{p.entity}</td>
                  <td><SiteRef id={p.site} compact/></td>
                  <td style={{fontSize:11}}>{p.user}</td>
                  <td className="mono" style={{fontSize:11}}>{p.oldV} → <b>{p.newV}</b></td>
                  <td><span className="badge badge-green" style={{fontSize:9}}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// -------- MS-ACT Activation Wizard --------
const MsActivation = ({ role, site, onNav, openModal }) => {
  const [step, setStep] = React.useState("sites");
  const [completed, setCompleted] = React.useState(new Set());
  const [sitesDraft, setSitesDraft] = React.useState(MS_ACT_SITES_DRAFT);
  const [checks, setChecks] = React.useState({ understand: false, assigned: false, reviewed: false });

  const steps = [
    { key: "sites",    label: "1 · Create Sites" },
    { key: "users",    label: "2 · Assign Users" },
    { key: "backfill", label: "3 · Backfill & Review" },
  ];

  const goNext = () => {
    setCompleted(new Set([...completed, step]));
    setStep(step === "sites" ? "users" : step === "users" ? "backfill" : "backfill");
  };
  const goBack = () => setStep(step === "backfill" ? "users" : "sites");

  const addSiteDraft = () => setSitesDraft([...sitesDraft, { code: "", name: "", type: "plant", country: "United Kingdom", tz: "Europe/London", isDefault: false }]);

  const allChecked = Object.values(checks).every(v => v);

  return (
    <div className="act-wizard-shell">
      <div className="breadcrumb" style={{maxWidth:760, margin:"0 auto 14px"}}>
        <SiteCrumb site={site}/>
        <a onClick={()=>onNav("dashboard")}>Multi-Site</a> · Activation Wizard
      </div>
      <div className="act-wizard-card">
        <h2>Activate Multi-Site</h2>
        <div className="act-wizard-sub">Step-by-step setup to safely activate multi-site mode. Follows the inactive → wizard → dual_run → activated state machine.</div>

        <Stepper steps={steps} current={step} completed={completed}/>

        {step === "sites" && (
          <div style={{marginTop:14}}>
            <div className="alert-blue alert-box" style={{fontSize:12}}>
              <span>ⓘ</span>
              <div>A <b>Default Site</b> will be created automatically from your existing configuration. Add one or more additional sites below.</div>
            </div>

            {sitesDraft.map((s, i) => (
              <div key={i} className="card" style={{padding:12, marginTop:10}}>
                <div className="ff-inline">
                  <Field label="Site Code" required help="Max 10 chars, uppercase, alphanumeric+hyphen">
                    <input value={s.code} maxLength={10} onChange={e=>{const n=[...sitesDraft];n[i]={...s,code:e.target.value.toUpperCase()};setSitesDraft(n);}}/>
                  </Field>
                  <Field label="Site Name" required>
                    <input value={s.name} onChange={e=>{const n=[...sitesDraft];n[i]={...s,name:e.target.value};setSitesDraft(n);}}/>
                  </Field>
                  <Field label="Type" required>
                    <select value={s.type} onChange={e=>{const n=[...sitesDraft];n[i]={...s,type:e.target.value};setSitesDraft(n);}}>
                      <option value="plant">Plant</option>
                      <option value="warehouse">Warehouse</option>
                      <option value="office">Office</option>
                      <option value="copack">Co-pack</option>
                    </select>
                  </Field>
                  <Field label="Country" required>
                    <select value={s.country} onChange={e=>{const n=[...sitesDraft];n[i]={...s,country:e.target.value};setSitesDraft(n);}}>
                      <option>United Kingdom</option><option>Germany</option><option>Poland</option><option>Romania</option>
                    </select>
                  </Field>
                  <Field label="Timezone" required>
                    <select value={s.tz} onChange={e=>{const n=[...sitesDraft];n[i]={...s,tz:e.target.value};setSitesDraft(n);}}>
                      <option>Europe/London</option><option>Europe/Berlin</option><option>Europe/Warsaw</option>
                    </select>
                  </Field>
                  <Field label="Set as Default">
                    <label style={{display:"inline-flex", gap:6}}><input type="radio" name="default" defaultChecked={s.isDefault}/> Default site</label>
                  </Field>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={()=>setSitesDraft(sitesDraft.filter((_,j)=>j!==i))}>✕ Remove</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}} onClick={addSiteDraft}>＋ Add Another Site</button>

            <div className="row-flex" style={{marginTop:20, paddingTop:14, borderTop:"1px solid var(--border)"}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("dashboard")}>Save & Exit</button>
              <span className="spacer"></span>
              <button className="btn btn-primary btn-sm" disabled={sitesDraft.length === 0 || !sitesDraft.every(s=>s.code && s.name)} onClick={goNext}>Continue →</button>
            </div>
          </div>
        )}

        {step === "users" && (
          <div style={{marginTop:14}}>
            <div className="alert-blue alert-box" style={{fontSize:12}}>
              <span>ⓘ</span><div>Each user must have at least one site assignment and exactly one primary site before activation.</div>
            </div>
            <div style={{fontSize:13, margin:"10px 0 6px"}}><b>6 of 8 users assigned.</b> 2 without assignment will lose access after activation.</div>

            <table>
              <thead><tr><th>User</th><th>Default Site</th><th>FRZ-DE</th><th>WH-COLD</th><th>Role</th><th>Primary</th><th>Status</th></tr></thead>
              <tbody>
                {MS_USERS.slice(0,7).map(u => (
                  <tr key={u.id}>
                    <td><div className="avatar" style={{width:22, height:22, fontSize:10, marginRight:6, display:"inline-flex", verticalAlign:"middle"}}>{u.avatar}</div> {u.name}</td>
                    <td><input type="checkbox" defaultChecked/></td>
                    <td><input type="checkbox"/></td>
                    <td><input type="checkbox"/></td>
                    <td><select><option>planner</option><option>site_manager</option><option>warehouse_operator</option></select></td>
                    <td><input type="radio" name={"prim-"+u.id} defaultChecked/></td>
                    <td><span className="badge badge-green" style={{fontSize:9}}>Ready</span></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="row-flex" style={{marginTop:20, paddingTop:14, borderTop:"1px solid var(--border)"}}>
              <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
              <span className="spacer"></span>
              <button className="btn btn-secondary btn-sm" onClick={goNext}>Skip (assign later)</button>
              <button className="btn btn-primary btn-sm" onClick={goNext}>Continue →</button>
            </div>
          </div>
        )}

        {step === "backfill" && (
          <div style={{marginTop:14}}>
            <div className="alert-amber alert-box" style={{fontSize:12}}>
              <span>⚠</span>
              <div>Review carefully. After activation, data will be isolated to the assigned site. Users not assigned to a site will lose access immediately.</div>
            </div>

            <h4 style={{fontSize:12, textTransform:"uppercase", color:"var(--muted)", letterSpacing:"0.04em", marginTop:14}}>Backfill preview</h4>
            <table className="backfill-tbl">
              <thead><tr><th>Table</th><th style={{textAlign:"right"}}>Rows to backfill</th><th>Target Site</th></tr></thead>
              <tbody>
                {MS_ACT_BACKFILL.map(r => (
                  <tr key={r.table}><td className="mono">{r.table}</td><td className="num mono">{r.rows.toLocaleString()}</td><td className="mono">{r.target}</td></tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{fontWeight:700}}><td>Total</td><td className="num mono">{MS_ACT_BACKFILL.reduce((a,r)=>a+r.rows, 0).toLocaleString()}</td><td></td></tr>
              </tfoot>
            </table>

            <div style={{marginTop:16, padding:12, border:"1px solid var(--border)", borderRadius:6, background:"var(--gray-050)"}}>
              <div style={{fontSize:12, marginBottom:8}}><b>Confirm the following before proceeding:</b></div>
              <label style={{display:"block", padding:"4px 0", fontSize:12}}><input type="checkbox" checked={checks.understand} onChange={e=>setChecks({...checks, understand: e.target.checked})}/> I understand that existing data will be assigned to the Default Site.</label>
              <label style={{display:"block", padding:"4px 0", fontSize:12}}><input type="checkbox" checked={checks.assigned} onChange={e=>setChecks({...checks, assigned: e.target.checked})}/> I have assigned all users to their correct sites.</label>
              <label style={{display:"block", padding:"4px 0", fontSize:12}}><input type="checkbox" checked={checks.reviewed} onChange={e=>setChecks({...checks, reviewed: e.target.checked})}/> I have reviewed the backfill preview above.</label>
            </div>

            <div className="row-flex" style={{marginTop:20, paddingTop:14, borderTop:"1px solid var(--border)"}}>
              <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
              <span className="spacer"></span>
              <button className="btn btn-danger btn-sm">Cancel & Exit</button>
              <button className="btn btn-primary btn-sm" disabled={!allChecked} onClick={()=>openModal("activationConfirm")}>Activate Multi-Site</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { MsPermissions, MsAnalytics, MsSettings, MsActivation });
