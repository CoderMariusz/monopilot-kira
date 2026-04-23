// ============ MAINT-004 Work Request List + MAINT-007 mWO List + MAINT-008 mWO Detail ============

// -------- MAINT-004 Work Request List (table + kanban toggle) --------
const MntWRList = ({ onNav, openModal, role }) => {
  const [view, setView] = React.useState(role === "Manager" ? "kanban" : "table");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [priFilter, setPriFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const isManager = role === "Manager" || role === "Admin";

  const visible = MNT_WRS.filter(w => {
    if (statusFilter !== "all" && w.status !== statusFilter) return false;
    if (priFilter !== "all" && w.pri !== priFilter) return false;
    if (search && !(w.wr.toLowerCase().includes(search.toLowerCase()) ||
                    w.asset.toLowerCase().includes(search.toLowerCase()) ||
                    w.reporter.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  const kanbanCols = [
    { k: "requested",   l: "Submitted",  items: visible.filter(w => w.status === "requested") },
    { k: "approved",    l: "Triaged",    items: visible.filter(w => ["approved","open","in_progress"].includes(w.status)) },
    { k: "completed",   l: "Scheduled / Done", items: visible.filter(w => w.status === "completed") },
    { k: "rejected",    l: "Rejected",   items: visible.filter(w => w.status === "rejected") },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · Work requests</div>
          <h1 className="page-title">Work requests</h1>
          <div className="muted" style={{fontSize:12}}>
            {MNT_WRS.length} requests · {MNT_WRS.filter(w=>w.status==="requested").length} awaiting triage · {MNT_WRS.filter(w=>w.status==="in_progress").length} in work
          </div>
        </div>
        <div className="row-flex">
          <input type="text" placeholder="Search WR#, asset, reporter…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}}/>
          <div className="pm-cal-toggle">
            <button className={view==="table"?"on":""} onClick={()=>setView("table")}>Table</button>
            <button className={view==="kanban"?"on":""} onClick={()=>setView("kanban")}>Kanban</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("wrCreate")}>＋ Submit Work Request</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>Status</label>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="requested">Submitted</option>
          <option value="approved">Triaged</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
        <label>Priority</label>
        <select value={priFilter} onChange={e=>setPriFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {view === "table" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead>
              <tr>
                <th>WR #</th><th>Asset</th><th>Reporter</th><th>Reported</th>
                <th>Priority</th><th>Status</th><th>Description</th>
                <th>Linked mWO</th><th style={{width:100}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(w => (
                <tr key={w.wr} style={{cursor:"pointer"}}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{w.wr}</td>
                  <td style={{fontSize:12}}>{w.asset}</td>
                  <td style={{fontSize:11}}>{w.reporter}</td>
                  <td className="mono" style={{fontSize:11}}>{w.reportedAt}</td>
                  <td><PriorityBadge p={w.pri}/></td>
                  <td><MwoStatus s={w.status}/></td>
                  <td style={{fontSize:11, maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}} title={w.desc}>{w.desc}</td>
                  <td>{w.mwo ? <span className="mono" style={{fontWeight:600, color:"var(--blue)"}} onClick={()=>onNav("mwo_detail")}>{w.mwo}</span> : <span className="badge badge-amber" style={{fontSize:9}}>Pending</span>}</td>
                  <td onClick={e=>e.stopPropagation()}>
                    {isManager && w.status === "requested" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("wrTriage", { wr: w.wr })}>Triage</button>}
                    {w.status !== "requested" && <button className="btn btn-ghost btn-sm" onClick={()=>onNav("mwo_detail")}>View</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "kanban" && (
        <div className="kanban">
          {kanbanCols.map(col => (
            <div key={col.k} className="kanban-col">
              <div className={"kanban-col-title " + (col.k === "requested" ? "submitted" : "")}>
                {col.l}
                <span className="kct-count">{col.items.length}</span>
              </div>
              {col.items.map(w => (
                <div key={w.wr} className="kanban-card" onClick={()=>{ if(col.k === "requested") openModal("wrTriage", { wr: w.wr }); else onNav("mwo_detail"); }}>
                  <div className="row-flex" style={{marginBottom:4}}>
                    <span className="kc-code">{w.wr}</span>
                    <span className="spacer"></span>
                    <PriorityBadge p={w.pri}/>
                  </div>
                  <div className="kc-asset">{w.asset}</div>
                  <div className="kc-meta">
                    <span>{w.reporter}</span>
                    <span className="mono">{w.reportedAt.slice(11)}</span>
                  </div>
                </div>
              ))}
              {col.items.length === 0 && (
                <div className="muted" style={{fontSize:11, textAlign:"center", padding:20}}>No items</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

// -------- MAINT-007 mWO List --------
const MntMWOList = ({ onNav, openModal, role }) => {
  const [tab, setTab] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [priFilter, setPriFilter] = React.useState("all");
  const [srcFilter, setSrcFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const isManager = role === "Manager" || role === "Admin";

  // §3.2 TabsCounted — semantic tones: overdue = bad, in_progress = info, requested = warn, completed = ok
  const tabs = [
    { key: "all",         label: "All",          count: MNT_MWOS.length,                                                                                                  tone: "neutral" },
    { key: "requested",   label: "Requested",    count: MNT_MWOS.filter(m=>m.status === "requested").length,                                                                tone: "warn" },
    { key: "open",        label: "Open",         count: MNT_MWOS.filter(m=>["open","approved","requested"].includes(m.status)).length,                                     tone: "info" },
    { key: "in_progress", label: "In Progress",  count: MNT_MWOS.filter(m=>m.status === "in_progress").length,                                                              tone: "info" },
    { key: "overdue",     label: "Overdue",      count: MNT_MWOS.filter(m=>m.status === "in_progress" && m.start < "2026-04-21 07:00").length,                             tone: "bad" },
    { key: "mine",        label: "My mWOs",      count: MNT_MWOS.filter(m=>m.tech === "M. Nowak").length,                                                                   tone: "neutral" },
    { key: "completed",   label: "Completed",    count: MNT_MWOS.filter(m=>m.status === "completed").length,                                                                tone: "ok" },
  ];

  const visible = MNT_MWOS.filter(m => {
    if (tab === "mine" && m.tech !== "M. Nowak") return false;
    if (tab === "requested" && m.status !== "requested") return false;
    if (tab === "open" && !["open","approved","requested"].includes(m.status)) return false;
    if (tab === "in_progress" && m.status !== "in_progress") return false;
    if (tab === "overdue" && !(m.status === "in_progress" && m.start < "2026-04-21 07:00")) return false;
    if (tab === "completed" && m.status !== "completed") return false;
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    if (priFilter !== "all" && m.pri !== priFilter) return false;
    if (srcFilter !== "all" && m.src !== srcFilter) return false;
    if (search && !(m.mwo.toLowerCase().includes(search.toLowerCase()) ||
                    m.asset.toLowerCase().includes(search.toLowerCase()) ||
                    (m.tech||"").toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  // §3.3 GHA-style group-by-status with auto-expand for overdue + in_progress.
  // Groups appear in priority order; overdue & in_progress open by default, others collapsed.
  const isOverdue = (m) => m.status === "in_progress" && m.start < "2026-04-21 07:00";
  const groupDefs = [
    { k: "overdue",     l: "Overdue",      tone: "bad",     defaultOpen: true,  filter: isOverdue },
    { k: "in_progress", l: "In Progress",  tone: "info",    defaultOpen: true,  filter: (m)=>m.status === "in_progress" && !isOverdue(m) },
    { k: "requested",   l: "Requested",    tone: "warn",    defaultOpen: false, filter: (m)=>m.status === "requested" },
    { k: "approved",    l: "Approved",     tone: "info",    defaultOpen: false, filter: (m)=>m.status === "approved" },
    { k: "open",        l: "Open",         tone: "info",    defaultOpen: false, filter: (m)=>m.status === "open" },
    { k: "completed",   l: "Completed",    tone: "ok",      defaultOpen: false, filter: (m)=>m.status === "completed" },
    { k: "cancelled",   l: "Cancelled",    tone: "neutral", defaultOpen: false, filter: (m)=>m.status === "cancelled" },
  ];
  const [groupOpen, setGroupOpen] = React.useState(() => {
    const init = {};
    groupDefs.forEach(g => { init[g.k] = g.defaultOpen; });
    return init;
  });
  const toggleGroup = (k) => setGroupOpen(prev => ({ ...prev, [k]: !prev[k] }));
  const groups = groupDefs
    .map(g => ({ ...g, items: visible.filter(g.filter) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Maintenance</a> · mWOs</div>
          <h1 className="page-title">Maintenance Work Orders (mWOs)</h1>
          <div className="muted" style={{fontSize:12}}>
            {MNT_MWOS.length} mWOs · {MNT_MWOS.filter(m=>m.status==="in_progress").length} in work · {MNT_MWOS.filter(m=>m.dtImpact==="Yes").length} impacting production
          </div>
        </div>
        <div className="row-flex">
          <input type="text" placeholder="Search mWO#, asset, tech…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("mwoCreate")}>＋ New mWO</button>}
        </div>
      </div>

      {/* Tabs — §3.2 TabsCounted primitive */}
      <div style={{marginBottom:10}}>
        <TabsCounted current={tab} tabs={tabs} onChange={setTab} ariaLabel="mWO status tabs"/>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <label>Type</label>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="reactive">Reactive</option>
          <option value="preventive">Preventive</option>
          <option value="calibration">Calibration</option>
          <option value="sanitation">Sanitation</option>
          <option value="inspection">Inspection</option>
        </select>
        <label>Priority</label>
        <select value={priFilter} onChange={e=>setPriFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label>Source</label>
        <select value={srcFilter} onChange={e=>setSrcFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="manual">Manual</option>
          <option value="pm_schedule">PM Schedule</option>
          <option value="auto_downtime">Auto-Downtime</option>
          <option value="oee_trigger">OEE Trigger</option>
          <option value="calibration_alert">Calibration alert</option>
        </select>
      </div>

      {/* §3.3 GHA-style grouped rows — overdue + in_progress auto-expanded */}
      {groups.length === 0 && (
        <div className="card">
          <EmptyState icon="🔧" title="No mWOs match your filters"
            body="Try clearing filters or broadening the tab selection."
            action={{label:"Clear filters", onClick: ()=>{setTab("all"); setTypeFilter("all"); setPriFilter("all"); setSrcFilter("all"); setSearch("");}}}/>
        </div>
      )}
      {groups.map(g => {
        const open = groupOpen[g.k];
        return (
          <div key={g.k} className="card" style={{padding:0, marginBottom:10}}>
            <div
              role="button"
              aria-expanded={open}
              onClick={()=>toggleGroup(g.k)}
              style={{display:"flex", alignItems:"center", gap:8, padding:"10px 14px", cursor:"pointer",
                      background: "var(--surface-2, #f1f5f9)", borderBottom: open ? "1px solid var(--border)" : "none",
                      fontSize:12, fontWeight:600}}
            >
              <span style={{display:"inline-block", width:12, color:"var(--muted)", transition:"transform .1s", transform: open ? "rotate(90deg)" : "rotate(0)"}}>▶</span>
              <span>{g.l}</span>
              <span className={"tabs-counted-pill tone-" + g.tone} style={{marginLeft:4}}>{g.items.length}</span>
              <span className="spacer" style={{flex:1}}></span>
              {g.defaultOpen && <span className="muted" style={{fontSize:10, fontWeight:400}}>auto-expanded</span>}
            </div>
            {open && (
              <table>
                <thead>
                  <tr>
                    <th>mWO #</th><th>Asset</th><th>Type</th><th>Priority</th><th>Status</th>
                    <th>Technician</th><th>Start</th><th>ETA</th><th>DT impact</th><th>Source</th>
                    <th style={{width:120}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map(m => (
                    <tr key={m.mwo} style={{cursor:"pointer"}} onClick={()=>onNav("mwo_detail")}>
                      <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{m.mwo}</td>
                      <td style={{fontSize:12}}>{m.asset}</td>
                      <td><MwoType t={m.type}/></td>
                      <td><PriorityBadge p={m.pri}/></td>
                      <td><MwoStatus s={m.status}/></td>
                      <td style={{fontSize:11}}>{m.tech || <span className="mono" style={{color:"var(--amber)", fontStyle:"italic"}}>Unassigned</span>}</td>
                      <td className="mono" style={{fontSize:11}}>{m.start}</td>
                      <td className="mono" style={{fontSize:11}}>{m.eta}</td>
                      <td>{m.dtImpact === "Yes" ? <span className="dt-impact">🔴 Yes</span> : <span className="dt-impact-none">—</span>}</td>
                      <td><MwoSource s={m.src}/></td>
                      <td onClick={e=>e.stopPropagation()}>
                        {m.status === "requested" && isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("wrTriage", { mwo: m.mwo })}>Triage</button>}
                        {m.status === "approved" && isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("mwoAssign", { mwo: m.mwo })}>Assign</button>}
                        {m.status === "open" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("stateTransition", { entity: m.mwo, to: "in_progress" })}>Start</button>}
                        {m.status === "in_progress" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("mwoComplete", { mwo: m.mwo })}>Complete</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </>
  );
};

// -------- MAINT-008 mWO Detail --------
const MntMWODetail = ({ onBack, onNav, openModal, role }) => {
  const [tab, setTab] = React.useState("overview");
  const m = MNT_MWO_DETAIL;
  const isManager = role === "Manager" || role === "Admin";

  const stateSteps = [
    { k: "requested",   l: "Requested" },
    { k: "approved",    l: "Approved" },
    { k: "open",        l: "Open" },
    { k: "in_progress", l: "In Progress" },
    { k: "completed",   l: "Completed" },
  ];
  const currentStateIdx = stateSteps.findIndex(s => s.k === m.state);
  const tasksDone = m.tasks.filter(t => t.done).length;

  const tabs = [
    { k: "overview",  l: "Overview" },
    { k: "tasks",     l: "Tasks", c: `${tasksDone}/${m.tasks.length}` },
    { k: "parts",     l: "Parts", c: m.plannedParts.length + m.unplannedParts.length },
    { k: "labor",     l: "Labor", c: m.labor.length },
    { k: "downtime",  l: "Downtime link" },
    { k: "signoff",   l: "Sign-off", c: m.signoffs.filter(s=>!s.pending).length + "/" + m.signoffs.length },
    { k: "history",   l: "History", c: m.history.length },
  ];

  return (
    <>
      {/* §3.4 sticky-form-header — tabs + tasks can be very tall */}
      <div className="page-head sticky-form-header" style={{padding:"10px 0"}}>
        <div>
          <div className="breadcrumb"><a onClick={onBack}>mWOs</a> · <span className="mono">{m.mwo}</span></div>
          <h1 className="page-title"><span className="mono">{m.mwo}</span> — {m.asset.name}</h1>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
          {m.state === "in_progress" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("mwoComplete", { mwo: m.mwo })}>Complete mWO</button>}
          {isManager && <button className="btn btn-secondary btn-sm">Edit</button>}
          {isManager && <button className="btn btn-danger btn-sm" onClick={()=>openModal("stateTransition", { entity: m.mwo, to: "cancelled" })}>Cancel mWO</button>}
        </div>
      </div>

      {/* State machine visual strip */}
      <div className="state-strip">
        {stateSteps.map((s, i) => (
          <React.Fragment key={s.k}>
            <span className={"ss-step " + (i < currentStateIdx ? "done" : (i === currentStateIdx ? "current" : ""))}>
              {i < currentStateIdx ? "✓" : i + 1}. {s.l}
            </span>
            {i < stateSteps.length - 1 && <span className="ss-arr">→</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Header metadata row */}
      <div className="card" style={{marginBottom:10, padding:"10px 14px"}}>
        <div className="row-flex" style={{fontSize:12}}>
          <MwoStatus s={m.state}/>
          <PriorityBadge p={m.pri}/>
          <MwoType t={m.type}/>
          <MwoSource s={m.src}/>
          <span className="mono" style={{color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("asset_detail")}>{m.asset.icon} {m.asset.name}</span>
          <Ltree path={m.asset.loc}/>
          <span className="spacer"></span>
          <span className="muted" style={{fontSize:11}}>Requested by {m.requester.name}</span>
        </div>
      </div>

      {/* LOTO warning banner */}
      {m.lotoActive && (
        <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>🔒</span>
          <div style={{flex:1}}>
            <b>LOTO Active</b> — {m.lotoProc} applied at {m.asset.loc[m.asset.loc.length-1]}. Work can proceed safely. LOTO must be cleared before state transition to Completed.
          </div>
          <button className="btn btn-sm btn-secondary" onClick={()=>onNav("loto")}>Go to LOTO →</button>
        </div>
      )}

      {/* Delayed production WOs cross-module banner */}
      {m.delayedWos && m.delayedWos.length > 0 && (
        <div className="alert-red alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>⚠</span>
          <div style={{flex:1}}>
            <b>Production impact:</b> {m.delayedWos.length} production WOs delayed by this downtime. Lost production visibility.
            {m.delayedWos.map((w,i) => (
              <span key={i} style={{marginLeft:8}}>
                <CmChip module="prod" label={w.wo}/>
                <span className="muted" style={{fontSize:10, marginLeft:4}}>(delayed {w.delay})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="lp-tabs">
        {tabs.map(t => (
          <button key={t.k} className={tab === t.k ? "on" : ""} onClick={()=>setTab(t.k)}>
            {t.l}
            {t.c !== undefined && <span className="tab-count">{t.c}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Problem & plan</h3></div>
            <table>
              <tbody>
                <tr><td className="muted" style={{width:140}}>Requester</td><td>{m.requester.name}</td></tr>
                <tr><td className="muted">Reported at</td><td className="mono">{m.requester.ts}</td></tr>
                <tr><td className="muted">Problem</td><td style={{fontSize:12}}>{m.problem}</td></tr>
                <tr><td className="muted">mWO type</td><td><MwoType t={m.type}/></td></tr>
                <tr><td className="muted">Priority</td><td><PriorityBadge p={m.pri}/></td></tr>
                <tr><td className="muted">Technician</td><td><span className="mono" style={{fontWeight:600}}>{m.tech.avatar}</span> {m.tech.name} <span className="muted" style={{fontSize:10}}>{m.tech.phone}</span></td></tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Schedule & cost</h3></div>
            <table>
              <tbody>
                <tr><td className="muted" style={{width:160}}>Scheduled start</td><td className="mono">{m.scheduledStart}</td></tr>
                <tr><td className="muted">Scheduled end / ETA</td><td className="mono">{m.scheduledEnd}</td></tr>
                <tr><td className="muted">Actual start</td><td className="mono" style={{color:"var(--blue)"}}>{m.actualStart}</td></tr>
                <tr><td className="muted">Estimated cost</td><td className="mono">€{m.estimatedCost.toFixed(2)}</td></tr>
                <tr><td className="muted">Actual cost</td><td className="mono">{m.actualCost ? "€" + m.actualCost.toFixed(2) : <span className="muted">— (computed on completion)</span>}</td></tr>
                <tr><td className="muted">Completion notes</td><td><textarea placeholder="Describe what was done, parts replaced, follow-ups…" style={{width:"100%", minHeight:60, fontSize:11}} disabled></textarea></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Checklist — {tasksDone} / {m.tasks.length} complete</h3>
              {isManager && <button className="btn btn-secondary btn-sm">＋ Add step</button>}
            </div>
            {m.tasks.map(t => (
              <div key={t.n} className={"chk-item " + (t.done ? "done" : "")}>
                <span className="ci-num">{t.done ? "✓" : t.n}</span>
                <div>
                  <div className="ci-desc">{t.desc}</div>
                  {t.done && <div className="ci-sub">Completed by {t.by} at {t.ts}</div>}
                  {t.measure && (
                    <div className="ci-sub mono">
                      Expected: {t.measure.expected}
                      {t.measure.actual && <> · Actual: <b style={{color: t.measure.pass === false ? "var(--red)" : "var(--green-700)"}}>{t.measure.actual}</b></>}
                      {t.measure.pass === false && <span className="badge badge-red" style={{fontSize:9, marginLeft:6}}>FAIL</span>}
                    </div>
                  )}
                </div>
                <div>
                  <span className="ci-type">{t.type}</span>
                </div>
                <div>
                  {!t.done && m.state === "in_progress" && (
                    <button className="btn btn-primary btn-sm" onClick={()=>openModal("taskCheckoff", { step: t })}>Complete</button>
                  )}
                  {t.done && <span className="badge badge-green" style={{fontSize:10}}>Done</span>}
                </div>
              </div>
            ))}
          </div>

          {m.tasks.filter(t => t.measure && t.measure.pass === false).length > 0 && (
            <div className="alert-red alert-box" style={{fontSize:12, marginTop:10}}>
              <span>⚠</span>
              <div>Task 5 measurement out of spec (runout 0.22mm vs {"<"}0.15mm). Consider raising a corrective follow-up mWO.</div>
            </div>
          )}
        </div>
      )}

      {tab === "parts" && (
        <div>
          <div className="card" style={{marginBottom:10}}>
            <div className="card-head"><h3 className="card-title">Planned parts</h3></div>
            <table>
              <thead><tr><th>Part</th><th>Description</th><th style={{textAlign:"right"}}>Plan</th><th style={{textAlign:"right"}}>Actual</th><th>Unit</th><th>Unit cost</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {m.plannedParts.map(p => (
                  <tr key={p.code}>
                    <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{p.code}</td>
                    <td style={{fontSize:11}}>{p.desc}</td>
                    <td className="num mono">{p.plan}</td>
                    <td className="num mono">{p.actual}</td>
                    <td className="mono" style={{fontSize:11}}>{p.unit}</td>
                    <td className="mono" style={{fontSize:11}}>€{p.cost.toFixed(2)}</td>
                    <td className="mono" style={{fontSize:11}}>€{(p.plan * p.cost).toFixed(2)}</td>
                    <td>{!p.consumed && <button className="btn btn-primary btn-sm" onClick={()=>openModal("partsConsume", { part: p })}>Consume</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Unplanned parts</h3>
              <button className="btn btn-secondary btn-sm">＋ Add part</button>
            </div>
            <table>
              <thead><tr><th>Part</th><th>Description</th><th style={{textAlign:"right"}}>Actual</th><th>Consumed at</th><th>By</th><th>Total</th></tr></thead>
              <tbody>
                {m.unplannedParts.map(p => (
                  <tr key={p.code}>
                    <td><span className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{p.code}</span> <span className="badge badge-amber" style={{fontSize:9, marginLeft:4}}>Unplanned</span></td>
                    <td style={{fontSize:11}}>{p.desc}</td>
                    <td className="num mono">{p.actual}</td>
                    <td className="mono" style={{fontSize:11}}>{p.consumedAt}</td>
                    <td style={{fontSize:11}}>{p.by}</td>
                    <td className="mono" style={{fontSize:11}}>€{(p.actual * p.cost).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="alert-amber alert-box" style={{fontSize:11, margin:"10px 0 4px"}}>
              <span>⚠</span>
              <div>SP-LUB-0042 is at 2 ea on hand — below reorder point (5 ea). Recommend reorder now.</div>
            </div>
          </div>
        </div>
      )}

      {tab === "labor" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Time entries</h3>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("logTime", { mwo: m.mwo })}>＋ Log time</button>
          </div>
          <table>
            <thead><tr><th>Technician</th><th>Start</th><th>End</th><th>Duration</th><th>Notes</th></tr></thead>
            <tbody>
              {m.labor.map((l,i)=>(
                <tr key={i}>
                  <td style={{fontSize:11}}>{l.tech}</td>
                  <td className="mono" style={{fontSize:11}}>{l.start}</td>
                  <td className="mono" style={{fontSize:11}}>{l.end || <span className="muted">(running)</span>}</td>
                  <td className="mono" style={{fontSize:11, fontWeight:600}}>{l.dur}</td>
                  <td style={{fontSize:11}}>{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{fontSize:11, padding:"10px 0 0"}}>
            Rate €32/h (M. Nowak) — Est. cost so far: <b className="mono">€44.80</b>
          </div>
        </div>
      )}

      {tab === "downtime" && (
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Downtime link</h3>
            {isManager && <button className="btn btn-ghost btn-sm">Unlink</button>}
          </div>
          <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
            <span>ⓘ</span>
            <div>This mWO is linked to production downtime event <b className="mono">{m.downtimeEvent.id}</b>.</div>
          </div>
          <table>
            <tbody>
              <tr><td className="muted" style={{width:180}}>Event ID</td><td className="mono" style={{color:"var(--blue)"}}>{m.downtimeEvent.id}</td></tr>
              <tr><td className="muted">Production line</td><td className="mono" style={{color:"var(--blue)"}}>{m.downtimeEvent.line}</td></tr>
              <tr><td className="muted">Event start</td><td className="mono">{m.downtimeEvent.start}</td></tr>
              <tr><td className="muted">Duration</td><td className="mono">{m.downtimeEvent.duration} min</td></tr>
              <tr><td className="muted">Cause category</td><td>{m.downtimeEvent.cause}</td></tr>
              <tr><td className="muted">Note</td><td style={{fontSize:11}}>{m.downtimeEvent.note}</td></tr>
            </tbody>
          </table>
          <div style={{marginTop:10}}>
            <button className="btn btn-secondary btn-sm">View in Production →</button>
          </div>
        </div>
      )}

      {tab === "signoff" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Sign-off</h3></div>
          <div className="muted" style={{fontSize:12, marginBottom:10}}>Your signature confirms this work has been completed safely and satisfactorily.</div>
          {m.signoffs.map((s,i)=>(
            <div key={i} className={"signoff-row " + (!s.pending ? "done" : "")}>
              <div className="so-avatar">{s.avatar || "?"}</div>
              <div>
                <div className="so-name">{s.name || <span className="muted">Pending</span>}</div>
                <div className="so-role">{s.role}{s.reason && <span style={{color:"var(--amber-700)", marginLeft:6}}>· {s.reason}</span>}</div>
              </div>
              {s.pending ? (
                <button className="btn btn-primary btn-sm">Sign off</button>
              ) : (
                <span className="so-time">{s.ts}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">History & audit</h3></div>
          <div className="activity-feed">
            {m.history.slice().reverse().map((h, i) => (
              <div key={i} className="tl-item">
                <span className={"tl-dot " + h.color}></span>
                <div>
                  <div style={{fontSize:12}}>{h.desc}</div>
                </div>
                <div className="tl-time mono">{h.t}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { MntWRList, MntMWOList, MntMWODetail });
