// ============ SCR-07-01 — Scheduler Dashboard (GanttView) ============
// Premium finite-capacity Gantt with optimizer integration, capacity conflict highlighting,
// pending review panel, and solver progress states.

// BL-PEXT-05 fix — zoom toggle was cosmetic only (label flipped but DAY_W was
// a module constant). Make Gantt layout react to zoom state by deriving DAY_W
// from a zoom factor. "day" = 220px/day (default), "hour" = 3× zoom to expose
// the 06·09·12·15·18·21 tick pattern at a readable width.
const DAY_W_DAY  = 220;
const DAY_W_HOUR = 660; // 3× — each 3h slot ~82px, readable at hour-level density
const ganttWidths = (zoom) => {
  const dw = zoom === "hour" ? DAY_W_HOUR : DAY_W_DAY;
  return { DAY_W: dw, HOUR_W: dw / 24, TOTAL_W: dw * 7 };
};
// Keep module constants for callers that still read them (back-compat).
const DAY_W = DAY_W_DAY;
const HOUR_W = DAY_W / 24;
const TOTAL_W = DAY_W * 7;

const PextDashboard = ({ role, onNav, openModal }) => {
  const [selectedAsn, setSelectedAsn] = React.useState(null);
  const [lineFilter, setLineFilter] = React.useState("all");
  const [shiftFilter, setShiftFilter] = React.useState("all");
  const [horizon, setHorizon] = React.useState("7d");
  const [runState, setRunState] = React.useState("idle"); // idle | running | done
  const [runProgress, setRunProgress] = React.useState(0);
  const [runPhase, setRunPhase] = React.useState(0); // 0=queue 1=greedy 2=refine 3=done
  const [pendingActions, setPendingActions] = React.useState({});  // id -> "approved"|"rejected"|"overridden"
  const [dismissed, setDismissed] = React.useState(new Set());
  const [zoom, setZoom] = React.useState("day");
  // Zoom-reactive widths (BL-PEXT-05 fix — visual-layer only)
  const { DAY_W, HOUR_W, TOTAL_W } = ganttWidths(zoom);

  const visibleAlerts = PEXT_ALERTS.filter(a => !dismissed.has(a.code));

  // Simulate solver progress
  const runScheduler = (opts) => {
    setRunState("running");
    setRunProgress(0);
    setRunPhase(0);
    let p = 0;
    const timer = setInterval(() => {
      p += 8;
      setRunProgress(Math.min(p, 100));
      if (p > 15) setRunPhase(1);
      if (p > 55) setRunPhase(2);
      if (p >= 100) {
        clearInterval(timer);
        setRunPhase(3);
        setRunState("done");
      }
    }, 260);
  };

  const canSeeRunBtn = role === "Planner" || role === "Admin";

  const effStatus = (a) => pendingActions[a.id] || a.status;

  const visibleAssignments = PEXT_ASSIGNMENTS.filter(a => lineFilter === "all" || a.line === lineFilter);
  const pending = PEXT_ASSIGNMENTS.filter(a => effStatus(a) === "draft");
  const pendingByRun = [{ runId: "OPT-0042", runShort: "OPT-0042", startedAt: "2026-04-21 06:12", rows: pending }];
  const approvedCount = PEXT_ASSIGNMENTS.filter(a => effStatus(a) === "approved").length;

  const approve = (id) => setPendingActions({ ...pendingActions, [id]: "approved" });
  const reject  = (id) => setPendingActions({ ...pendingActions, [id]: "rejected" });
  const override = (id) => { setPendingActions({ ...pendingActions, [id]: "overridden" }); setSelectedAsn(null); };
  const approveAll = () => {
    const next = { ...pendingActions };
    pending.forEach(a => next[a.id] = "approved");
    setPendingActions(next);
  };

  const dismiss = (code) => { const n = new Set(dismissed); n.add(code); setDismissed(n); };

  return (
    <>
      {/* ======= Zone A: Control Bar ======= */}
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Scheduler</a> · Dashboard (GanttView)</div>
          <h1 className="page-title">Planning+ — Scheduler Dashboard</h1>
          <div className="muted" style={{fontSize:12, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap"}}>
            Last run: <span className="mono" style={{color:"var(--text)"}}>{PEXT_LAST_RUN.id}</span> at <span className="mono">{PEXT_LAST_RUN.completedAt}</span>
            <span>by</span> <b>{PEXT_LAST_RUN.initiatedBy}</b>
            <RunStatus s={PEXT_LAST_RUN.status}/>
            <span>· {PEXT_LAST_RUN.duration}s · horizon {PEXT_LAST_RUN.horizon}</span>
            <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={()=>onNav("runs")}>View run history →</a>
          </div>
        </div>
        <div className="row-flex">
          <div className="horizon-pills">
            <button className={horizon === "7d" ? "on" : ""} onClick={()=>setHorizon("7d")}>7 days</button>
            <button className={"disabled"} title="14-day horizon requires feature flag scheduler.horizon_14d.enabled">14 days (P2)</button>
          </div>
          <button className="btn btn-secondary btn-sm" disabled={runState === "running"}>⇪ Export CSV</button>
          {/* §3.6 Dry-run preview (before commit) — fans out to 20+ assignments */}
          <DryRunButton
            label="Dry-run"
            disabled={!canSeeRunBtn || runState === "running"}
            title={!canSeeRunBtn ? "You do not have permission to run the scheduler"
              : "Preview proposed assignments, CO total, and utilisation before committing"}
            onClick={()=>openModal("runScheduler", { dryRun: true, onConfirm: runScheduler })}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={!canSeeRunBtn || runState === "running"}
            title={!canSeeRunBtn ? "You do not have permission to run the scheduler" : ""}
            onClick={()=>openModal("runScheduler", { onConfirm: runScheduler })}
          >
            {runState === "running" ? "Running…" : "↯ Run Optimizer"}
          </button>
        </div>
      </div>

      {/* Premium banner */}
      <div className="prem-strip">
        <b>Planning+ (Premium)</b> · Extends <a style={{color:"var(--blue)"}}>Planning</a> with finite-capacity solver, allergen optimizer v2, and capacity-conflict Gantt highlighting.
        <span className="spacer" style={{flex:1}}></span>
        <span className="mono" style={{fontSize:10, color:"#6d28d9"}}>{PEXT_RULES[1].id}</span>
      </div>

      {/* Run progress banner */}
      {runState === "running" && (
        <div className="alert-blue alert-box" style={{marginBottom:10, flexDirection:"column", alignItems:"stretch", padding:"12px 14px"}}>
          <div style={{display:"flex", alignItems:"center", gap:10, fontSize:12}}>
            <RunStatus s="running"/>
            <span><b>Scheduler run in progress</b> — <span className="mono">OPT-{(parseInt(PEXT_LAST_RUN.id.slice(4))+1).toString().padStart(4,"0")}</span> · Started a few seconds ago</span>
            <span className="spacer" style={{flex:1}}></span>
            <span className="mono">{runProgress}%</span>
            <button className="btn btn-sm btn-ghost">Cancel</button>
          </div>
          <div className="solver-progress"><span style={{width: runProgress + "%"}}></span></div>
          <div className="solver-phase">
            <div className={"sp-step " + (runPhase >= 1 ? "done" : runPhase === 0 ? "active" : "")}><span className="sp-dot"></span>Phase 1 — greedy seed</div>
            <div className={"sp-step " + (runPhase >= 2 ? "done" : runPhase === 1 ? "active" : "")}><span className="sp-dot"></span>Phase 2 — local-search refine (random-pair swap)</div>
            <div className={"sp-step " + (runPhase >= 3 ? "done" : runPhase === 2 ? "active" : "")}><span className="sp-dot"></span>Phase 3 — finalize + emit assignments</div>
          </div>
        </div>
      )}
      {runState === "done" && (
        <div className="alert-green alert-box" style={{marginBottom:10}}>
          <span>✓</span>
          <div><b>Scheduler run complete</b> — 23 WOs assigned in 41s. Review 7 pending assignments below.</div>
          <span className="spacer" style={{flex:1}}></span>
          <button className="btn btn-sm btn-ghost" onClick={()=>setRunState("idle")}>Dismiss</button>
        </div>
      )}

      {/* Alerts list */}
      {visibleAlerts.length > 0 && (
        <div className="card" style={{marginBottom:12}}>
          <div className="card-head">
            <h3 className="card-title">⚠ Alerts</h3>
            <span className="badge badge-gray" style={{fontSize:10}}>{visibleAlerts.length} active</span>
          </div>
          <div>
            {visibleAlerts.map(a => (
              <div key={a.code} className={"alert-box alert-" + a.severity} style={{marginBottom:6, fontSize:12, padding:"8px 12px"}}>
                <span>⚠</span>
                <div style={{flex:1}}>
                  <div>{a.text}</div>
                  <div style={{fontSize:10, color:"var(--muted)", marginTop:3, fontFamily:"var(--font-mono)"}}>{a.code}</div>
                </div>
                <div className="alert-cta">
                  <button className="btn btn-sm btn-secondary" onClick={()=>onNav(a.link)}>View →</button>
                  <button className="btn btn-sm btn-ghost" onClick={()=>dismiss(a.code)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======= Zone B: KPI Strip (5 cards) ======= */}
      <div className="kpi-row-5">
        {PEXT_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent} onClick={()=>onNav(k.target)}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ======= Zone C: Gantt Chart ======= */}
      <div className="gantt-plus-toolbar">
        <span className="toolbar-lbl">Lines:</span>
        <div className="pills">
          <button className={"pill " + (lineFilter === "all" ? "on" : "")} onClick={()=>setLineFilter("all")}>All</button>
          {PEXT_LINES.map(l => (
            <button key={l.id} className={"pill " + (lineFilter === l.id ? "on" : "")} onClick={()=>setLineFilter(l.id)}>{l.id}</button>
          ))}
        </div>
        <span className="toolbar-lbl">Shifts:</span>
        <select style={{width:120}} value={shiftFilter} onChange={e=>setShiftFilter(e.target.value)}>
          <option value="all">All shifts</option>
          <option value="A">Shift A (06-14)</option>
          <option value="B">Shift B (14-22)</option>
        </select>
        <span className="toolbar-lbl">Status:</span>
        <select style={{width:140}}><option>All</option><option>Draft only</option><option>Approved only</option><option>Overridden</option></select>
        <span className="spacer" style={{flex:1}}></span>
        <button className="btn btn-ghost btn-sm" onClick={()=>setZoom(zoom === "day" ? "hour" : "day")}>🔍 {zoom === "day" ? "Hour zoom" : "Day zoom"}</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>openModal("capacityDetail")}>View capacity projection</button>
      </div>

      {/* Allergen legend */}
      <div className="gantt-allergen-legend">
        <b style={{fontSize:11, color:"var(--muted)"}}>Allergen legend:</b>
        {Object.entries(PEXT_ALLERGEN_COLORS).slice(0,8).map(([k, c]) => (
          <span key={k} className="gal-chip"><span className="gal-dot" style={{background:c}}></span>{k}</span>
        ))}
        <span className="spacer" style={{flex:1}}></span>
        <span style={{fontSize:11, color:"var(--muted)"}}>Status:
          <span style={{marginLeft:6, opacity:0.7}}>◻ Draft</span>
          <span style={{marginLeft:6}}>■ Approved</span>
          <span style={{marginLeft:6, border:"1px dashed var(--amber)", padding:"0 4px", borderRadius:3}}>◫ Overridden</span>
          <span style={{marginLeft:6, border:"2px dashed var(--red)", padding:"0 4px", borderRadius:3}}>⚠ Cap conflict</span>
        </span>
      </div>

      <div className="gantt-scroll">
        <div className="gantt-grid" style={{minWidth: 200 + TOTAL_W, position:"relative"}}>
          {/* Header */}
          <div className="gantt-header" style={{gridTemplateColumns: `200px repeat(7, ${DAY_W}px)`}}>
            <div className="gh-lines">Production lines</div>
            {PEXT_DATES.map(d => (
              <div key={d.day} className={"gh-day " + (d.today ? "today" : "") + (d.weekend ? " weekend" : "")} style={{width: DAY_W}}>
                {d.label}
                <div className="gh-sub">06 · 09 · 12 · 15 · 18 · 21</div>
              </div>
            ))}
          </div>

          {/* Lanes */}
          {PEXT_LINES.filter(l => lineFilter === "all" || l.id === lineFilter).map(line => {
            const lineAsns = visibleAssignments.filter(a => a.line === line.id);
            const lineCo   = PEXT_COBLOCKS.filter(c => c.line === line.id);
            const lineMaint= PEXT_MAINT_BLOCKS.filter(m => m.line === line.id);
            // Line-level util (avg across days 0-3)
            const util = Math.round(lineAsns.reduce((s,a)=>s+(a.capPct||0)*100,0) / Math.max(lineAsns.length,1));
            const utilCls = util >= 100 ? "over" : util >= 90 ? "warn" : util >= 80 ? "ok" : "low";
            // Today marker ~10:30 Mon
            const todayX = 10.5 * HOUR_W;
            return (
              <div key={line.id} className="gantt-lane">
                <div className="gantt-lane-label">
                  <div style={{flex:1}}>
                    {line.id}
                    <small>{line.name}</small>
                    <div className={"gantt-lane-util " + utilCls}>avg util: {util}% · cap {line.cap_kg_h} kg/h</div>
                  </div>
                </div>
                <div className="gantt-lane-track" style={{minHeight: 72, width: TOTAL_W, position:"relative"}}>
                  {/* Weekend shading */}
                  {PEXT_DATES.filter(d=>d.weekend).map(d => (
                    <div key={d.day} className="gantt-weekend" style={{left: d.day * DAY_W, width: DAY_W}}></div>
                  ))}
                  {/* Shift boundaries @ 14:00 each day */}
                  {PEXT_DATES.map(d => (
                    <div key={d.day + "-sl"} className="gantt-shift-line" style={{left: d.day * DAY_W + 14 * HOUR_W}}>
                      <span className="sl-label">B</span>
                    </div>
                  ))}
                  {/* Today line */}
                  <div className="gantt-today" style={{left: todayX}}></div>

                  {/* Maintenance blocks */}
                  {lineMaint.map((m,i) => (
                    <div key={"m"+i} className="gantt-maint-block"
                         style={{left: m.day * DAY_W + m.start * HOUR_W, width: (m.end - m.start) * HOUR_W}}
                         title={m.label + " — " + m.ref}>
                      ⚒ {m.label}
                    </div>
                  ))}

                  {/* Changeover blocks */}
                  {lineCo.map((c,i) => (
                    <div key={"c"+i} className={"gantt-co-block " + (c.segregation ? "blocked" : c.risk)}
                         style={{left: c.day * DAY_W + c.start * HOUR_W, width: (c.end - c.start) * HOUR_W}}
                         title={`CO · ${c.minutes}min · ${c.from} → ${c.to} · clean=${c.clean} · atp=${c.atp}`}>
                      {c.segregation ? "⊘ BLKD" : `⇄ ${c.minutes}m`}
                    </div>
                  ))}

                  {/* Assignment WO bars */}
                  {lineAsns.map(a => {
                    const st = effStatus(a);
                    const left = a.day * DAY_W + a.start * HOUR_W;
                    const width = (a.end - a.start) * HOUR_W;
                    const cls = [
                      "gantt-bar",
                      st === "approved" ? "in_progress" :
                      st === "draft" ? "planned draft-opt" :
                      st === "overridden" ? "overridden" :
                      st === "rejected" ? "cancelled" : "planned",
                      a.conflict ? "cap-violation" : "",
                      st === "overridden" ? "overridden" : "",
                    ].join(" ");
                    return (
                      <div key={a.id} className={cls}
                           style={{
                             left, width,
                             background: PEXT_ALLERGEN_COLORS[a.allergen[0]] || "#64748b",
                           }}
                           onClick={e=>{ e.stopPropagation(); setSelectedAsn(a); }}
                           title={`${a.wo} · ${a.prod} · score ${a.score} · rank #${a.rank}`}>
                        <div className="gb-code">{a.wo}</div>
                        <div className="gb-name">{a.fa}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ======= Zone D: Pending Review Panel ======= */}
      {pending.length > 0 && (
        <div className="pending-panel">
          <div className="pending-panel-head">
            <span>⚡ Pending Review</span>
            <span className="badge badge-blue" style={{fontSize:10}}>{pending.length} assignments · {pendingByRun.length} run</span>
            <span className="pp-spacer" style={{flex:1}}></span>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("approveAll", { count: pending.length, onConfirm: approveAll })}>✓ Approve all</button>
            <button className="btn btn-ghost btn-sm">✕ Reject all</button>
          </div>
          {pendingByRun.map(grp => (
            <React.Fragment key={grp.runId}>
              <div className="pending-run-header">
                <span className="prh-code">{grp.runShort}</span>
                <span className="muted">Started {grp.startedAt}</span>
                <span className="spacer" style={{flex:1}}></span>
                <span className="muted">{grp.rows.length} assignments</span>
              </div>
              {grp.rows.map(a => {
                const st = effStatus(a);
                const rowCls = st === "approved" ? "pending-row approved" :
                               st === "rejected" ? "pending-row rejected" : "pending-row";
                return (
                  <div key={a.id} className={rowCls}>
                    <span className="pr-rank">#{a.rank}</span>
                    <span className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{a.wo}</span>
                    <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{a.fa} · {a.prod}</span>
                    <span className="mono" style={{fontSize:11}}>{a.line}</span>
                    <span className="mono" style={{fontSize:11}}>Shift {a.shift}</span>
                    <span className="mono" style={{fontSize:11}}>{PEXT_DATES[a.day].label} · {a.start}:00</span>
                    <span className="pr-score">{a.score}</span>
                    <span style={{display:"flex", gap:4}}>
                      {st === "draft" && <>
                        <button className="btn btn-sm btn-primary" onClick={()=>approve(a.id)}>Approve</button>
                        <button className="btn btn-sm btn-secondary" onClick={()=>reject(a.id)}>Reject</button>
                        <button className="btn btn-sm btn-ghost" onClick={()=>openModal("override", { wo: a, onConfirm: () => override(a.id) })}>…</button>
                      </>}
                      {st === "approved" && <span className="muted" style={{fontSize:10}}>Approved just now</span>}
                      {st === "rejected" && <span className="muted" style={{fontSize:10}}>Rejected</span>}
                      {st === "overridden" && <span className="muted" style={{fontSize:10}}>Overridden</span>}
                    </span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Assignment Detail Side Panel */}
      {selectedAsn && (
        <AssignmentSidePanel
          asn={selectedAsn}
          status={effStatus(selectedAsn)}
          onClose={()=>setSelectedAsn(null)}
          onApprove={()=>{ approve(selectedAsn.id); setSelectedAsn(null); }}
          onReject={()=>{ reject(selectedAsn.id); setSelectedAsn(null); }}
          onOverride={()=>openModal("override", { wo: selectedAsn, onConfirm: ()=>override(selectedAsn.id) })}
          onReschedule={()=>openModal("reschedule", { wo: selectedAsn, onConfirm: ()=>override(selectedAsn.id) })}
          onViewWo={()=>{ alert("→ Planning module — WO detail for " + selectedAsn.wo); }}
        />
      )}
    </>
  );
};

// ============ Assignment Detail Side Panel (§3.4) ============
const AssignmentSidePanel = ({ asn, status, onClose, onApprove, onReject, onOverride, onReschedule, onViewWo }) => {
  const line = PEXT_LINES.find(l => l.id === asn.line);
  const date = PEXT_DATES[asn.day];
  const duration = (asn.end - asn.start).toFixed(1);
  return (
    <div className="asn-side">
      <div className="asn-side-head">
        <div>
          <div className="asn-code">{asn.wo}</div>
          <div className="asn-prod">{asn.fa} · {asn.prod}</div>
          <div style={{marginTop:6}}><AssnStatus s={status}/></div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="asn-side-body">
        <div className="asn-section">
          <div className="asn-section-label">Assignment</div>
          <div className="asn-kv"><span className="k">Line</span><span className="v">{asn.line} · {line.name}</span></div>
          <div className="asn-kv"><span className="k">Shift</span><span className="v">Shift {asn.shift} · {asn.shift === "A" ? "06:00–14:00" : "14:00–22:00"}</span></div>
          <div className="asn-kv"><span className="k">Planned start</span><span className="v">{date.label} {asn.start}:00</span></div>
          <div className="asn-kv"><span className="k">Planned end</span><span className="v">{date.label} {asn.end}:00</span></div>
          <div className="asn-kv"><span className="k">Duration</span><span className="v">{duration}h</span></div>
          <div className="asn-kv"><span className="k">Qty</span><span className="v">{asn.qty} kg</span></div>
          <div className="asn-kv"><span className="k">Optimizer score</span><span className="v">{asn.score} / 100</span></div>
          <div className="asn-kv"><span className="k">Rank</span><span className="v">#{asn.rank} of 23</span></div>
          <div className="asn-kv"><span className="k">Capacity</span><span className="v" style={{color: asn.conflict ? "var(--red)" : "var(--text)"}}>{Math.round(asn.capPct*100)}% {asn.conflict ? "⚠ violation" : ""}</span></div>
        </div>

        <div className="asn-section">
          <div className="asn-section-label">Allergen / Changeover</div>
          <div className="asn-kv"><span className="k">Allergen group</span><span className="v"><AllergenPills codes={asn.allergen}/></span></div>
          <div className="asn-kv"><span className="k">CO before</span><span className="v">{asn.coBefore} min</span></div>
          <div className="asn-kv"><span className="k">CO after</span><span className="v">{asn.coAfter} min</span></div>
          <div className="asn-kv"><span className="k">Cleaning</span><span className="v">{asn.coBefore > 0 ? "Yes" : "—"}</span></div>
          <div className="asn-kv"><span className="k">ATP swab</span><span className="v">{asn.allergen.includes("PEANUT") ? "Yes (PEANUT line)" : "No"}</span></div>
        </div>

        <div className="asn-section">
          <div className="asn-section-label">Materials (from Planning)</div>
          <div style={{fontSize:11}}>
            <div className="row-flex" style={{marginBottom:4}}><span className="mono">R-1001 · Wieprzowina kl. II</span><span className="spacer"></span><span className="algn-pill ok">● 220.5 kg</span></div>
            <div className="row-flex" style={{marginBottom:4}}><span className="mono">R-1002 · Słonina wieprzowa</span><span className="spacer"></span><span className="algn-pill ok">● 148 kg</span></div>
            <div className="row-flex" style={{marginBottom:4}}><span className="mono">R-2101 · Pieprz czarny</span><span className="spacer"></span><span className="algn-pill warn">● 4.2 kg</span></div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{marginTop:6, fontSize:11}} onClick={onViewWo}>View full WO in Planning →</button>
        </div>

        <div className="asn-section">
          <div className="asn-section-label">DAG dependencies</div>
          <div style={{fontSize:11, color:"var(--muted)"}}>No cascade parent. 0 child WOs.</div>
        </div>

        {status === "approved" && (
          <div className="asn-section">
            <div className="asn-section-label">Approval</div>
            <div className="alert-green alert-box" style={{fontSize:11, alignItems:"center"}}>
              <div style={{flex:1}}>
                ✓ Approved by <b>Monika Nowak</b> at 2026-04-21 09:15 · <a style={{color:"var(--blue)", cursor:"pointer"}}>Undo approval</a>
              </div>
              {/* BL-PEXT-08 — 60s undo countdown ring (visual-only; decorative). */}
              <UndoCountdownRing seconds={59} total={60}/>
            </div>
          </div>
        )}

        {asn.conflict && (
          <div className="alert-red alert-box" style={{fontSize:11}}>
            <span>⚠</span>
            <div><b>V-SCHED-04 capacity conflict</b> — Assignment exceeds line capacity for shift window. Rescheduler suggestion: move to next day or split WO.</div>
          </div>
        )}
      </div>
      <div className="asn-side-foot">
        {status === "draft" && <>
          <button className="btn btn-primary btn-sm" onClick={onApprove} title="V-SCHED-07: requires Planner Advanced or Scheduling Officer">Approve</button>
          <button className="btn btn-secondary btn-sm" onClick={onReject}>Reject</button>
          <button className="btn btn-secondary btn-sm" onClick={onOverride}>Override…</button>
          <button className="btn btn-ghost btn-sm" onClick={onReschedule}>Reschedule WO</button>
        </>}
        {status === "approved" && <>
          <button className="btn btn-secondary btn-sm" onClick={onReschedule}>Reschedule WO</button>
          <button className="btn btn-ghost btn-sm" onClick={onViewWo}>View in Planning →</button>
        </>}
        {status === "overridden" && <>
          <button className="btn btn-ghost btn-sm" onClick={onViewWo}>View in Planning →</button>
        </>}
      </div>
    </div>
  );
};

// --------------------------------------------------------------
// UndoCountdownRing — 60s SVG ring for BL-PEXT-08.
// Visual-only decorative countdown. Animates a stroke-dashoffset
// across `total` seconds using CSS @keyframes defined in
// planning-ext.css. Initial remaining seconds shown numerically.
// --------------------------------------------------------------
const UndoCountdownRing = ({ seconds = 60, total = 60 }) => {
  const R = 11;
  const C = 2 * Math.PI * R;
  return (
    <span className="undo-ring" title={"Undo window: " + seconds + "s remaining"}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r={R} className="undo-ring-track"/>
        <circle
          cx="14" cy="14" r={R}
          className="undo-ring-fill"
          style={{
            strokeDasharray: C.toFixed(2),
            animationDuration: total + "s",
          }}
        />
      </svg>
      <span className="undo-ring-label mono">{seconds}s</span>
    </span>
  );
};

Object.assign(window, { PextDashboard, AssignmentSidePanel, UndoCountdownRing });
