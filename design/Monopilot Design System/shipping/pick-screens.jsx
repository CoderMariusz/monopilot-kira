// ============ SHIP-012 Pick List + SHIP-013 Wave + SHIP-014 Pick Detail + SHIP-015 Scanner Card ============

const ShPickList = ({ onOpenPick, onNav, openModal }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const tabs = [
    { k: "all",      l: "All",        c: SH_PICKS.length },
    { k: "Pending",  l: "Pending",    c: SH_PICKS.filter(p => p.status === "Pending").length },
    { k: "Assigned", l: "Assigned",   c: SH_PICKS.filter(p => p.status === "Assigned").length },
    { k: "In Progress", l: "In progress", c: SH_PICKS.filter(p => p.status === "In Progress").length },
    { k: "Completed", l: "Completed", c: SH_PICKS.filter(p => p.status === "Completed").length },
  ];

  const visible = SH_PICKS.filter(p =>
    (tab === "all" ? true : p.status === tab) &&
    (!search || p.pl.toLowerCase().includes(search.toLowerCase()) || (p.picker || "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Pick lists</div>
          <h1 className="page-title">Pick lists</h1>
          <div className="muted" style={{fontSize:12}}>{SH_PICKS.length} pick lists · {SH_PICKS.filter(p => p.status === "In Progress").length} active · Pickers use Zebra TC52 scanner → 06-SCANNER-P1 (SCN-040)</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">Generate single</button>
          <button className="btn btn-primary btn-sm" onClick={()=>onNav("wave")}>◉ Build wave</button>
        </div>
      </div>

      {/* Scanner launch card */}
      <div className="scanner-card" style={{marginBottom:12}} onClick={()=>alert("Open scanner → /scanner/shipping/pick (06-SCANNER-P1 SCN-040)")}>
        <div className="scic">📱</div>
        <div className="scmeta">
          <h4>Pick with Scanner</h4>
          <p>Opens 06-SCANNER-P1 pick workflow (SCN-040 extension) · Zebra TC52 · scan location → scan LP → enter qty</p>
        </div>
        <span className="spacer"></span>
        <button className="btn btn-primary btn-sm">Open scanner →</button>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>{t.l} <span className="count">{t.c}</span></button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search PL#, picker, SO#…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
        <select style={{width:130}}><option>All types</option><option>Wave</option><option>Single</option></select>
        <select style={{width:140}}><option>All pickers</option><option>J.Nowak</option><option>K.Kowal</option><option>M.Wolski</option></select>
        <select style={{width:130}}><option>All priorities</option><option>1 Highest</option><option>2</option><option>3</option><option>4</option><option>5 Lowest</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear</button>
        <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th>PL#</th><th>Type</th><th>Priority</th><th>Status</th><th>Picker</th><th style={{textAlign:"right"}}>SOs</th><th style={{textAlign:"right"}}>Lines</th><th>Progress</th><th>Started</th><th>Wave</th><th style={{width:100}}></th></tr></thead>
          <tbody>
            {visible.map(p => (
              <tr key={p.pl} style={{cursor:"pointer"}} onClick={()=>onOpenPick(p.pl)}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{p.pl}</td>
                <td><span className="badge badge-gray" style={{fontSize:9}}>{p.type}</span></td>
                <td>
                  {[1,2,3,4,5].map(n => <span key={n} style={{color: n <= p.priority ? "var(--amber)" : "var(--gray-200)", fontSize:11}}>★</span>)}
                </td>
                <td><PickStatus s={p.status}/></td>
                <td style={{fontSize:11}}>{p.picker || <span className="muted">— unassigned</span>}</td>
                <td className="num mono">{p.sos}</td>
                <td className="num mono">{p.lines}</td>
                <td>
                  <Progress current={p.picked} total={p.lines}/>
                  <span className="mono" style={{fontSize:10, marginLeft:6}}>{p.picked}/{p.lines}</span>
                </td>
                <td className="mono" style={{fontSize:11}}>{p.startedAt || <span className="muted">—</span>}</td>
                <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{p.wave || <span className="muted">—</span>}</td>
                <td onClick={e=>e.stopPropagation()}>
                  {!p.picker && <button className="btn btn-primary btn-sm">Assign</button>}
                  {p.picker && <button className="btn btn-ghost btn-sm">View →</button>}
                  <button className="btn btn-ghost btn-sm">⋯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// =================================================================
// SHIP-013 Wave Picking Builder
// =================================================================
const ShWave = ({ onNav, openModal }) => {
  const [selectedSos, setSelectedSos] = React.useState(new Set());
  const [building, setBuilding] = React.useState(false);
  const [priority, setPriority] = React.useState(3);

  const toggle = id => { const n = new Set(selectedSos); if (n.has(id)) n.delete(id); else n.add(id); setSelectedSos(n); };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · <a onClick={()=>onNav("picks")}>Pick lists</a> · Wave builder</div>
          <h1 className="page-title">Wave picking builder</h1>
          <div className="muted" style={{fontSize:12}}>P1 · max 50 SOs per wave · manual zone grouping · Full route optimizer deferred to Phase 2 (EPIC 11-J)</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("picks")}>← Back to pick lists</button>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:12, fontSize:12}}>
        <span>ⓘ</span>
        <div><b>P1 wave grouping:</b> select allocated SOs in left panel, create waves, release to pickers. P2 (EPIC 11-J) will add route optimization, batch picking, and auto-wave creation by cutoff time.</div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"300px 1fr", gap:12, alignItems:"flex-start"}}>
        <div className="card" style={{padding:10}}>
          <div className="card-head" style={{marginBottom:8}}>
            <h3 className="card-title" style={{fontSize:12}}>Available SOs ({SH_AVAILABLE_SOS.length})</h3>
          </div>
          <div style={{fontSize:11, color:"var(--muted)", marginBottom:8}}>Fully-allocated SOs not yet in a pick list · sorted by ship date ASC</div>
          <div className="filter-bar" style={{marginBottom:8}}>
            <select style={{width:"100%", fontSize:11}}><option>All zones</option><option>Dispatch</option><option>Cold</option></select>
          </div>
          <table style={{fontSize:11}}>
            <thead><tr><th></th><th>SO</th><th>Customer</th><th>Ship</th></tr></thead>
            <tbody>
              {SH_AVAILABLE_SOS.map(s => (
                <tr key={s.so} style={{cursor:"pointer"}} onClick={()=>toggle(s.so)} className={selectedSos.has(s.so) ? "row-warning" : ""}>
                  <td><input type="checkbox" checked={selectedSos.has(s.so)} onChange={()=>toggle(s.so)}/></td>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{s.so}</td>
                  <td style={{fontSize:10}}>{s.customer}</td>
                  <td className="mono" style={{fontSize:10}}>{s.shipDate}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedSos.size > 0 && !building && (
            <div style={{marginTop:10}}>
              <button className="btn btn-primary btn-sm" style={{width:"100%"}} onClick={()=>setBuilding(true)}>＋ New wave ({selectedSos.size} SOs)</button>
            </div>
          )}

          {building && (
            <div className="card" style={{marginTop:10, padding:10, background:"var(--blue-050)"}}>
              <div className="label">Wave configuration</div>
              <Field label="Priority">
                <select value={priority} onChange={e=>setPriority(+e.target.value)}>
                  <option value="1">1 · Highest</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 · Lowest</option>
                </select>
              </Field>
              <Field label="Zone filter">
                <select><option>All zones</option><option>Dispatch only</option><option>Cold only</option></select>
              </Field>
              <label style={{fontSize:11, display:"flex", gap:6, marginTop:4}}><input type="checkbox"/> Release immediately</label>
              <div className="row-flex" style={{marginTop:10, gap:6}}>
                <button className="btn btn-secondary btn-sm" onClick={()=>setBuilding(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={()=>{ setBuilding(false); openModal("waveRelease"); }}>Create wave</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="wave-kanban">
            <WaveCol title="Unreleased" color="gray" waves={SH_WAVES.unreleased} onRelease={()=>openModal("waveRelease")} editable/>
            <WaveCol title="Released"   color="blue" waves={SH_WAVES.released}/>
            <WaveCol title="In Pick"    color="amber" waves={SH_WAVES.inPick}/>
            <WaveCol title="Completed"  color="green" waves={SH_WAVES.completed}/>
          </div>
        </div>
      </div>
    </>
  );
};

const WaveCol = ({ title, color, waves, editable, onRelease }) => (
  <div className="wave-col">
    <div className={"wave-col-head " + color}>
      <span>{title}</span>
      <span className="wch-count">{waves.length}</span>
    </div>
    {waves.length === 0 && <div style={{padding:20, textAlign:"center", fontSize:11, color:"var(--muted)"}}>—</div>}
    {waves.map(w => (
      <div key={w.wave} className="wave-card">
        <div className="wc-code">{w.wave}</div>
        <div className="wc-meta">
          {w.sos} SOs · {w.lines} lines · Pickers: {w.pickers || "—"} · Zones: {w.zones.join(", ")}
        </div>
        <div className="wc-stats">
          <span>{w.totalQty}</span>
          <span>ETA {w.eta}</span>
          {w.progress !== undefined && <span style={{color:"var(--amber-700)"}}>{w.progress}%</span>}
        </div>
        {editable && <div className="row-flex" style={{marginTop:8, gap:4}}>
          <button className="btn btn-primary btn-sm" onClick={onRelease}>Release</button>
          <button className="btn btn-ghost btn-sm">Edit</button>
          <button className="btn btn-ghost btn-sm">🗑</button>
        </div>}
        {!editable && title === "In Pick" && <div style={{marginTop:6}}><Progress current={w.progress || 0} total={100} wide/></div>}
      </div>
    ))}
  </div>
);

// =================================================================
// SHIP-014 Pick Desktop (Supervisor Progress)
// =================================================================
const ShPickDetail = ({ onBack, onNav, openModal }) => {
  const p = SH_PICK_DETAIL;
  const picked = p.lines.filter(l => l.status === "picked" || l.status === "overridden").length;
  const shorts = p.lines.filter(l => l.status === "short").length;
  const deviations = p.lines.filter(l => l.fefoDev).length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Shipping</a> · <a onClick={onBack}>Pick lists</a> · <span className="mono">{p.pl}</span></div>
          <h1 className="page-title"><span className="mono">{p.pl}</span> — supervisor progress</h1>
          <div className="muted" style={{fontSize:12}}>Wave <span className="mono">{p.wave}</span> · Picker <b>{p.picker}</b> · Started {p.startedAt} · ETA {p.eta}</div>
        </div>
        <div className="row-flex">
          <PickStatus s={p.status}/>
          <button className="btn btn-secondary btn-sm">🖨 Print route sheet</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>openModal("pickReassign")}>Reassign picker</button>
        </div>
      </div>

      {/* Scanner launch card for pickers */}
      <div className="scanner-card" style={{marginBottom:12}}>
        <div className="scic">📱</div>
        <div className="scmeta">
          <h4>Pick with Scanner (pickers)</h4>
          <p>Pickers use Zebra TC52 scanner · supervisors view progress here · Scanner workflow in 06-SCANNER-P1 SCN-040</p>
        </div>
        <span className="spacer"></span>
        <button className="btn btn-primary btn-sm">Open scanner →</button>
      </div>

      <div className="wo-summary-bar">
        <div className="wsb-item"><div className="wsb-label">Progress</div><div className="wsb-value">{picked}/{p.lines.length} · {Math.round(picked/p.lines.length*100)}%</div></div>
        <div className="wsb-item"><div className="wsb-label">SOs in pick</div><div className="wsb-value">{p.sos.length}</div></div>
        <div className="wsb-item"><div className="wsb-label">FEFO deviations</div><div className="wsb-value" style={{color: deviations > 0 ? "var(--amber-700)" : "var(--green-700)"}}>{deviations}</div></div>
        <div className="wsb-item"><div className="wsb-label">Short picks</div><div className="wsb-value" style={{color: shorts > 0 ? "var(--red-700)" : "var(--green-700)"}}>{shorts}</div></div>
        <div className="wsb-item"><div className="wsb-label">Priority</div><div className="wsb-value">{"★".repeat(p.priority)}</div></div>
      </div>

      {shorts > 0 && (
        <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>⚠</span>
          <div><b>{shorts} line short</b> — resolve before packing. Decide ship-short + backorder, substitute alternate LP, or wait for restock.</div>
          <button className="btn btn-sm btn-secondary" onClick={()=>openModal("shortPick")}>Resolve short pick</button>
        </div>
      )}

      <div style={{display:"grid", gridTemplateColumns:"1fr 300px", gap:12}}>
        <div className="card" style={{padding:0}}>
          <div className="card-head" style={{padding:"10px 14px"}}><h3 className="card-title">Pick lines ({p.lines.length})</h3></div>
          <table>
            <thead><tr><th>Seq</th><th>Product</th><th>Suggested LP</th><th>Actual LP</th><th>Location</th><th style={{textAlign:"right"}}>Req</th><th style={{textAlign:"right"}}>Picked</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {p.lines.map(l => (
                <tr key={l.seq} className={l.fefoDev ? "row-warning" : l.status === "short" ? "row-overdue" : ""} style={l.fefoDev ? {background:"#fffbeb"} : {}}>
                  <td className="mono" style={{color:"var(--muted)"}}>{l.seq}</td>
                  <td style={{fontSize:12}}>{l.product}</td>
                  <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{l.suggestedLp}</td>
                  <td className="mono" style={{fontSize:11, color: l.fefoDev ? "var(--amber-700)" : "var(--blue)", fontWeight: l.fefoDev ? 600 : 400}}>
                    {l.actualLp || <span className="muted">—</span>}
                  </td>
                  <td><Ltree path={l.loc}/></td>
                  <td className="num mono">{l.qtyReq}</td>
                  <td className="num mono" style={{color: l.status === "short" ? "var(--red-700)" : undefined}}>{l.qtyPicked}</td>
                  <td>
                    {l.status === "pending"    && <span className="badge badge-gray" style={{fontSize:9}}>Pending</span>}
                    {l.status === "picked"     && <span className="badge badge-green" style={{fontSize:9}}>✓ Picked</span>}
                    {l.status === "overridden" && <span className="badge badge-amber" style={{fontSize:9}}>FEFO override</span>}
                    {l.status === "short"      && <span className="badge badge-red" style={{fontSize:9}}>Short −{l.shortfall}</span>}
                  </td>
                  <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>
                    {l.overrideReason && "reason: " + l.overrideReason}
                    {l.shortReason && "reason: " + l.shortReason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head"><h3 className="card-title">Summary</h3></div>
          <Summary rows={[
            { label: "Pick list", value: p.pl },
            { label: "Wave", value: p.wave },
            { label: "Status", value: p.status, mono: false },
            { label: "Picker", value: p.picker, mono: false },
            { label: "Started", value: p.startedAt },
            { label: "ETA", value: p.eta },
            { label: "Lines picked", value: picked + " / " + p.lines.length },
            { label: "FEFO deviations", value: deviations + " (logged)" },
            { label: "Short picks", value: shorts },
          ]}/>

          <div className="label" style={{marginTop:14, marginBottom:6}}>SOs in this pick list</div>
          <div style={{fontSize:11}}>
            {p.sos.map(s => (
              <div key={s} className="mono" style={{padding:"4px 0", color:"var(--blue)", cursor:"pointer"}}>{s} →</div>
            ))}
          </div>

          <div className="label" style={{marginTop:14, marginBottom:6}}>Actions</div>
          <div style={{display:"flex", flexDirection:"column", gap:6}}>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("pickReassign")}>Reassign picker</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("shortPick")}>Resolve short pick</button>
            <button className="btn btn-ghost btn-sm">Force complete (admin)</button>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { ShPickList, ShWave, ShPickDetail });
