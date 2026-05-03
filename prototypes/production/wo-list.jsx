// ============ Work Orders list ============

const WOList = ({ onOpenWo, openModal }) => {
  const [tab, setTab] = React.useState("in_progress");
  const [search, setSearch] = React.useState("");

  const tabs = [
    { k: "all", l: "All", c: WOS.length },
    { k: "in_progress", l: "In progress", c: WOS.filter(w => w.status === "in_progress").length },
    { k: "paused", l: "Paused", c: WOS.filter(w => w.status === "paused").length },
    { k: "ready", l: "Ready", c: WOS.filter(w => w.status === "ready").length },
    { k: "completed", l: "Completed", c: WOS.filter(w => w.status === "completed").length },
    { k: "draft", l: "Draft", c: WOS.filter(w => w.status === "draft").length },
  ];

  const visible = WOS.filter(w => (tab === "all" || w.status === tab) && (!search || w.id.toLowerCase().includes(search.toLowerCase()) || w.name.toLowerCase().includes(search.toLowerCase())));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Production</a></div>
          <h1 className="page-title">Work orders</h1>
          <div className="muted" style={{fontSize:12}}>{WOS.length} orders · 2 require attention</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          {/* "+ Release WO" button removed — belongs in 04-PLANNING (DRAFT → READY). */}
          <span className="muted" style={{fontSize:11}}>Release WOs in <a style={{color:"var(--blue)", cursor:"pointer"}}>04-PLANNING</a> →</span>
        </div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>
            {t.l} <span className="count">{t.c}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{marginBottom:10, padding:"10px 12px"}}>
        <div className="row-flex">
          <input type="text" placeholder="Search WO id, product, item code…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:300}}/>
          <select style={{width:140}}><option>All lines</option><option>LINE-01</option><option>LINE-02</option><option>LINE-03</option><option>LINE-04</option><option>LINE-05</option></select>
          <select style={{width:140}}><option>Today</option><option>Yesterday</option><option>This week</option></select>
          <span className="spacer"></span>
          <span className="muted" style={{fontSize:12}}>{visible.length} rows</span>
        </div>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>WO</th>
              <th>Item · Product</th>
              <th>Line</th>
              <th>Status</th>
              <th style={{textAlign:"right"}}>Planned</th>
              <th>Progress</th>
              <th style={{textAlign:"right"}}>Output</th>
              <th>Start / end</th>
              <th style={{width:130}}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(w => {
              const pct = w.planned ? Math.min(100, w.consumed / w.planned * 100) : 0;
              const outPct = w.outputTarget ? Math.min(100, w.output / w.outputTarget * 100) : 0;
              return (
                <tr key={w.id} onClick={()=>onOpenWo(w.id)} style={{cursor:"pointer"}}>
                  <td className="mono" style={{fontWeight:600}}>{w.id}{w.allergenGate && <span className="badge badge-violet" style={{marginLeft:6, fontSize:10}}>⚠ allergen</span>}</td>
                  <td>
                    <div style={{fontWeight:500}}>{w.name}</div>
                    <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{w.item}</div>
                  </td>
                  <td className="mono">{w.line}</td>
                  <td><WOStatus s={w.status} /></td>
                  <td className="num mono">{w.planned} kg</td>
                  <td style={{minWidth:160}}>
                    <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{w.consumed} / {w.planned} kg ({pct.toFixed(0)}%)</div>
                    <div className="cell-bar green" style={{width:130}}><span style={{width:pct+"%"}}></span></div>
                  </td>
                  <td className="num mono">{w.output} / {w.outputTarget}</td>
                  <td className="mono" style={{fontSize:11, color:"var(--muted)"}}>
                    {w.startedAt}<br/>{w.plannedEnd}
                  </td>
                  <td onClick={e=>e.stopPropagation()}>
                    {w.status === "in_progress" && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("pauseLine", w)}>Pause</button>}
                    {w.status === "paused" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("resumeLine", w)}>Resume</button>}
                    {w.status === "ready" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("startWo", w)}>Start</button>}
                    {w.status === "draft" && <span className="badge badge-gray" style={{fontSize:10}} title="DRAFT → READY happens in 04-PLANNING">Release in planning</span>}
                    {w.status === "completed" && <button className="btn btn-ghost btn-sm">View</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

Object.assign(window, { WOList });
