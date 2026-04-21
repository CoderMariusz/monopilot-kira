// ============ SCREEN-07 — WO Detail (Planning view) ============

const PlanWODetail = ({ onBack, onNav }) => {
  const [tab, setTab] = React.useState("overview");
  const w = PLAN_WO_DETAIL;

  // Contextual header actions by status
  const actions = {
    draft:       [["Edit","secondary"],["Delete","danger"],["Release","primary"]],
    planned:     [["Edit","secondary"],["Cancel","danger"],["Release","primary"]],
    released:    [["Cancel","danger"],["Release to warehouse","primary"]],
    in_progress: [["Pause (reason)","secondary"],["Complete","primary"]],
    on_hold:     [["Cancel","danger"],["Resume","primary"]],
    completed:   [["Duplicate","secondary"],["Close","primary"]],
  }[w.status] || [];

  return (
    <>
      <div className="breadcrumb" style={{marginBottom:6}}>
        <a onClick={()=>onNav("dashboard")}>Planning</a> · <a onClick={()=>onBack()}>Work orders</a> · <span className="mono">{w.code}</span>
      </div>

      {/* Header */}
      <div className="wo-head">
        <div className="wo-head-top">
          <div>
            <div className="wo-head-title">
              <span className="wo-head-code">{w.code}</span>
              <span className="wo-head-name">{w.name}</span>
              <WOPlanStatus s={w.status}/>
              <Priority p={w.priority}/>
              <SourceBadge s={w.source}/>
              {w.cascadeLayer && (
                <span className="cascade-layer-badge" style={{cursor:"pointer"}} onClick={()=>onNav("cascade")}>
                  ⊶ Cascade layer {w.cascadeLayer} of {w.cascadeTotal}
                </span>
              )}
              <span className="badge badge-gray" style={{fontSize:10}}>{w.bomSnapshot}</span>
            </div>
            <div className="muted" style={{fontSize:12, marginTop:3}}>
              <span className="mono">{w.item}</span> · {w.line} · <b className="mono">{w.plannedQty} {w.uom}</b>
              &nbsp;·&nbsp; Planned {w.plannedStart} → {w.plannedEnd}
            </div>
          </div>
          <div className="wo-head-actions">
            {actions.map(([label, kind]) => (
              <button key={label} className={"btn btn-" + kind + " btn-sm"}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="wo-summary-bar">
        <div className="wsb-item"><span className="wsb-label">Product</span><span className="wsb-value">{w.item}</span></div>
        <div className="wsb-item"><span className="wsb-label">Qty</span><span className="wsb-value">{w.plannedQty} {w.uom}</span></div>
        <div className="wsb-item"><span className="wsb-label">Scheduled start</span><span className="wsb-value">{w.plannedStart}</span></div>
        <div className="wsb-item"><span className="wsb-label">Scheduled end</span><span className="wsb-value">{w.plannedEnd}</span></div>
        <div className="wsb-item"><span className="wsb-label">Line</span><span className="wsb-value">{w.lineCode}</span></div>
        <div className="wsb-item"><span className="wsb-label">Priority</span><span className="wsb-value">{w.priority}</span></div>
        <div className="wsb-item"><span className="wsb-label">BOM version</span><span className="wsb-value">{w.bomVersion}</span></div>
      </div>

      {/* Cascade dependency banner */}
      {w.cascadeLayer && (
        <div className="alert-blue alert-box" style={{marginBottom:12}}>
          <span>⊶</span>
          <div>
            <b>This WO is part of an intermediate cascade chain</b>
            <div style={{fontSize:11, color:"var(--blue-700)"}}>Layer {w.cascadeLayer} of {w.cascadeTotal} · Upstream WOs must complete (or project available qty) before this can start.</div>
          </div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-secondary" onClick={()=>setTab("dependencies")}>View dependencies →</button>
            <button className="btn btn-sm btn-secondary" onClick={()=>onNav("cascade")}>Open full DAG →</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-bar" style={{marginTop:0}}>
        <button className={"tab-btn " + (tab==="overview"?"on":"")} onClick={()=>setTab("overview")}>Overview</button>
        <button className={"tab-btn " + (tab==="outputs"?"on":"")} onClick={()=>setTab("outputs")}>Outputs <span className="count">{w.outputs.length}</span></button>
        <button className={"tab-btn " + (tab==="dependencies"?"on":"")} onClick={()=>setTab("dependencies")}>Dependencies <span className="count">{w.dependencies.length}</span></button>
        <button className={"tab-btn " + (tab==="reservations"?"on":"")} onClick={()=>setTab("reservations")}>Reservations <span className="count">{w.reservations.length}</span></button>
        <button className={"tab-btn " + (tab==="sequencing"?"on":"")} onClick={()=>setTab("sequencing")}>Sequencing</button>
        <button className={"tab-btn " + (tab==="history"?"on":"")} onClick={()=>setTab("history")}>State history <span className="count">{w.statusHistory.length}</span></button>
        <button className={"tab-btn " + (tab==="d365"?"on":"")} onClick={()=>setTab("d365")}>D365 sync</button>
      </div>

      {tab === "overview" && <OverviewTab w={w}/>}
      {tab === "outputs" && <OutputsTab w={w}/>}
      {tab === "dependencies" && <DependenciesTab w={w} onNav={onNav}/>}
      {tab === "reservations" && <ReservationsTab w={w}/>}
      {tab === "sequencing" && <SequencingTab w={w}/>}
      {tab === "history" && <HistoryTab w={w}/>}
      {tab === "d365" && <D365Tab w={w}/>}
    </>
  );
};

// ---------- Overview ----------
const OverviewTab = ({ w }) => (
  <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:12, alignItems:"flex-start"}}>
    <div>
      {/* Materials */}
      <div className="card" style={{padding:0}}>
        <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
          <h3 className="card-title">Materials (BOM snapshot)</h3>
          <span className="muted" style={{fontSize:11}}>{w.materials.length} materials · {w.materials.filter(m=>m.source==="upstream_wo_output").length} upstream · {w.materials.filter(m=>m.source==="stock").length} stock</span>
        </div>
        <table>
          <thead><tr>
            <th style={{width:30}}>#</th><th>Material</th><th style={{textAlign:"right"}}>Required</th>
            <th>Reserved / Projected</th><th>Source</th><th>Availability</th><th>Allergen</th>
          </tr></thead>
          <tbody>
            {w.materials.map(m => (
              <tr key={m.seq}>
                <td className="mono">{m.seq}</td>
                <td>
                  <div style={{fontWeight:500}}>{m.name}</div>
                  <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{m.code}</div>
                </td>
                <td className="num mono">{m.plannedQty} {m.uom}</td>
                <td style={{fontSize:12}}>
                  {m.source === "stock" && m.reservedLP && (
                    <div>
                      <span className="mono" style={{fontWeight:600}}>{m.reservedLP}</span> · <span className="mono">{m.reserved} {m.uom}</span>
                      <div className="muted" style={{fontSize:10}}>Hard lock · pending RELEASE</div>
                    </div>
                  )}
                  {m.source === "upstream_wo_output" && (
                    <div>
                      <div><span className="mono" style={{color:"var(--blue)", cursor:"pointer"}}>{m.upstreamWo}</span> <span className="badge badge-blue" style={{fontSize:9, marginLeft:4}}>{m.upstreamStatus}</span></div>
                      <div className="mono muted" style={{fontSize:11}}>Projected {m.projectedQty} {m.uom} @ {m.projectedDate}</div>
                    </div>
                  )}
                  {m.source === "manual" && <span className="muted" style={{fontSize:11}}>Manual — no reservation</span>}
                </td>
                <td>
                  {m.source === "stock" && <span className="badge badge-blue" style={{fontSize:10}}>stock</span>}
                  {m.source === "upstream_wo_output" && <span className="badge badge-amber" style={{fontSize:10}}>upstream WO</span>}
                  {m.source === "manual" && <span className="badge badge-gray" style={{fontSize:10}}>manual</span>}
                </td>
                <td><Avail v={m.avail}/></td>
                <td>
                  {m.allergen ? <span className="allergen-cluster"><span className={"ac-dot " + m.allergen}></span> <span style={{fontSize:11}}>{m.allergen}</span></span> : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Meat-pct aggregation */}
      <div className="meat-pct" style={{marginTop:10}}>
        <div className="meat-pct-label">Meat-pct aggregation (FR-PLAN-026)</div>
        <div className="meat-pct-list">
          {w.meatPctList.map(m => <span key={m.type}>{m.type} <b>{m.pct}%</b></span>)}
        </div>
        <div className="muted" style={{fontSize:11, marginTop:4}}>Computed from BOM expand across multi-meat components · tooltip visible on D365 push</div>
      </div>

      {/* Operations */}
      <div className="card" style={{padding:0, marginTop:12}}>
        <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
          <h3 className="card-title">Operations (routing snapshot)</h3>
          <span className="muted" style={{fontSize:11}}>{w.operations.length} ops · expected total {w.operations.reduce((a,o)=>a+o.expDur,0)} min</span>
        </div>
        <table>
          <thead><tr>
            <th style={{width:30}}>#</th><th>Operation</th><th>Machine</th>
            <th style={{textAlign:"right"}}>Expected dur.</th><th style={{textAlign:"right"}}>Actual dur.</th>
            <th style={{textAlign:"right"}}>Expected yield</th><th>Status</th>
          </tr></thead>
          <tbody>
            {w.operations.map(o => (
              <tr key={o.seq}>
                <td className="mono">{o.seq}</td>
                <td>{o.op}</td>
                <td className="mono">{o.machine}</td>
                <td className="num mono">{o.expDur} min</td>
                <td className="num mono">{o.actDur ? o.actDur + " min" : <span className="muted">—</span>}</td>
                <td className="num mono">{o.expYield}%</td>
                <td>
                  {o.status === "pending" && <span className="badge badge-gray" style={{fontSize:10}}>Pending</span>}
                  {o.status === "in_progress" && <span className="badge badge-blue" style={{fontSize:10}}>In progress</span>}
                  {o.status === "completed" && <span className="badge badge-green" style={{fontSize:10}}>Completed</span>}
                  {o.status === "skipped" && <span className="badge badge-gray" style={{fontSize:10}}>Skipped</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Right column — sidecars */}
    <div>
      <div className="card">
        <div className="card-head"><h3 className="card-title">WO info</h3></div>
        <div style={{fontSize:12, display:"grid", gap:8}}>
          <div className="row-flex"><span className="muted">Source</span><span className="spacer"></span><span>{w.source}</span></div>
          <div className="row-flex"><span className="muted">Planned qty</span><span className="spacer"></span><span className="mono">{w.plannedQty} {w.uom}</span></div>
          <div className="row-flex"><span className="muted">Scheduled start</span><span className="spacer"></span><span className="mono">{w.plannedStart}</span></div>
          <div className="row-flex"><span className="muted">Scheduled end</span><span className="spacer"></span><span className="mono">{w.plannedEnd}</span></div>
          <div className="row-flex"><span className="muted">Production line</span><span className="spacer"></span><span className="mono">{w.lineCode}</span></div>
          <div className="row-flex"><span className="muted">Priority</span><span className="spacer"></span><Priority p={w.priority}/></div>
          <div className="row-flex"><span className="muted">Allergen profile</span><span className="spacer"></span><AllergenCluster families={w.allergenProfile}/></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Capacity</h3></div>
        <div style={{fontSize:12}}>
          <div className="row-flex"><span className="muted">Line</span><span className="spacer"></span><span className="mono">{w.lineCode}</span></div>
          <div className="row-flex" style={{marginTop:6}}><span className="muted">Slot</span><span className="spacer"></span><span className="mono">10:00 – 16:30</span></div>
          <div className="row-flex" style={{marginTop:6}}>
            <span className="muted">Conflict</span><span className="spacer"></span>
            {w.scheduledSlotConflict
              ? <span className="badge badge-amber" style={{fontSize:10}}>⚠ Slot overflow</span>
              : <span className="badge badge-green" style={{fontSize:10}}>No conflict</span>}
          </div>
          <div className="muted" style={{fontSize:11, marginTop:8}}>Greedy slot allocation · finite-capacity stub P1</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">BOM</h3></div>
        <div style={{fontSize:12}}>
          <div className="row-flex"><span className="muted">Version</span><span className="spacer"></span><span className="mono">{w.bomVersion}</span></div>
          <div className="row-flex" style={{marginTop:6}}><span className="muted">Effective from</span><span className="spacer"></span><span className="mono">2026-03-15</span></div>
          <div className="row-flex" style={{marginTop:6}}><span className="muted">Snapshot</span><span className="spacer"></span><span className="mono" style={{fontSize:11}}>Immutable</span></div>
          <a style={{display:"block", marginTop:8, fontSize:12, color:"var(--blue)", cursor:"pointer"}}>Open in Technical module →</a>
        </div>
      </div>
    </div>
  </div>
);

// ---------- Outputs ----------
const OutputsTab = ({ w }) => (
  <>
    <div className="alert-blue alert-box" style={{marginBottom:12}}>
      <span>ⓘ</span>
      <div>
        <b>All outputs go to stock in P1.</b>
        <div style={{fontSize:11}}>Child WOs consume intermediate LPs via Scanner scan-to-consume at production time. Direct-continue and planner-decides dispositions are deferred to P2.</div>
      </div>
    </div>

    <div className="card" style={{padding:0}}>
      <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
        <h3 className="card-title">WO outputs — primary + co-products + byproducts</h3>
      </div>
      <table>
        <thead><tr>
          <th>Role</th><th>Product</th><th style={{textAlign:"right"}}>Planned qty</th>
          <th style={{textAlign:"right"}}>Actual qty</th><th style={{textAlign:"right"}}>Allocation %</th>
          <th>Disposition</th><th>Output LP</th>
        </tr></thead>
        <tbody>
          {w.outputs.map((o,i) => (
            <tr key={i}>
              <td>
                {o.role === "primary" && <span className="badge badge-blue" style={{fontSize:10}}>Primary</span>}
                {o.role === "co_product" && <span className="badge badge-green" style={{fontSize:10}}>Co-product</span>}
                {o.role === "byproduct" && <span className="badge badge-gray" style={{fontSize:10}}>Byproduct</span>}
              </td>
              <td>
                <div style={{fontWeight:500}}>{o.name}</div>
                <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{o.code}</div>
              </td>
              <td className="num mono">{o.plannedQty} kg</td>
              <td className="num mono">{o.actualQty ? o.actualQty + " kg" : <span className="muted">—</span>}</td>
              <td className="num mono">{o.allocPct}%</td>
              <td>
                <span className="badge badge-blue" style={{fontSize:10}} title="Intermediate disposition is always to_stock in P1">to_stock</span>
              </td>
              <td>
                {o.outputLP ? <span className="mono">{o.outputLP}</span> : <span className="muted" style={{fontSize:11}}>Pending (put-away in 08-PRODUCTION)</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// ---------- Dependencies ----------
const DependenciesTab = ({ w, onNav }) => {
  const [view, setView] = React.useState("graph");

  // DAG rows grouped by layer
  const byLayer = {};
  w.dagNodes.forEach(n => { byLayer[n.layer] = byLayer[n.layer] || []; byLayer[n.layer].push(n); });
  const layers = Object.keys(byLayer).map(n => parseInt(n)).sort((a,b) => a - b);

  return (
    <>
      <div className="card-head">
        <div className="row-flex">
          <div className="pills">
            <button className={"pill " + (view === "graph" ? "on" : "")} onClick={()=>setView("graph")}>Graph</button>
            <button className={"pill " + (view === "list" ? "on" : "")} onClick={()=>setView("list")}>List</button>
          </div>
          <span className="muted" style={{fontSize:12}}>
            Chain depth: <b>{w.cascadeTotal}</b> layers · Total WOs in chain: <b>{w.cascadeTotal + 1}</b>
          </span>
        </div>
        <div className="row-flex">
          <span className="badge badge-green" style={{fontSize:10}}>✓ Cycle-check passed</span>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("cascade")}>Open full cascade →</button>
        </div>
      </div>

      {view === "graph" && (
        <div className="card" style={{padding:0}}>
          <div className="dag-canvas">
            {layers.map(l => (
              <React.Fragment key={l}>
                <div className="dag-row">
                  {byLayer[l].map(n => (
                    <div key={n.code} className={"dag-node " + n.status + (n.current ? " current" : "")}>
                      <div className="dag-code">{n.code}{n.current && <span className="badge badge-blue" style={{marginLeft:6, fontSize:9}}>This WO</span>}</div>
                      <div className="dag-name">{n.name}</div>
                      <div className="dag-meta">{n.qty} {n.uom} · {n.status}</div>
                    </div>
                  ))}
                </div>
                {l < Math.max(...layers) && (
                  <div style={{textAlign:"center", marginBottom:18, fontSize:22, color:"var(--gray-300)"}}>↓</div>
                )}
              </React.Fragment>
            ))}

            <div className="dag-legend">
              <span><span className="dag-legend-dot" style={{background:"var(--green)"}}></span> Completed</span>
              <span><span className="dag-legend-dot" style={{background:"var(--blue)"}}></span> In progress</span>
              <span><span className="dag-legend-dot" style={{background:"#8b5cf6"}}></span> Released</span>
              <span><span className="dag-legend-dot" style={{background:"var(--gray-300)"}}></span> Planned / Draft</span>
            </div>
          </div>
        </div>
      )}

      {view === "list" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr>
              <th>Direction</th><th>WO</th><th>Product</th>
              <th style={{textAlign:"right"}}>Required qty</th><th>Parent WO status</th><th>Material link</th>
            </tr></thead>
            <tbody>
              {w.dependencies.map((d,i) => (
                <tr key={i} style={{cursor:"pointer"}}>
                  <td><span className="badge badge-blue" style={{fontSize:10}}>{d.dir}</span></td>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{d.wo}</td>
                  <td>{d.product}</td>
                  <td className="num mono">{d.reqQty} kg</td>
                  <td><WOPlanStatus s={d.parentStatus}/></td>
                  <td className="mono" style={{fontSize:11}}>{d.materialLink}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ---------- Reservations ----------
const ReservationsTab = ({ w }) => (
  <>
    <div className="reservation-banner">
      <b>Reservations are created on RELEASED transition — for materials with source = 'stock' only.</b>
      <div style={{marginTop:3}}>Intermediate cascade materials (source = <span className="mono">upstream_wo_output</span>) are not reserved — consumed at production time by Scanner (M06). This WO is currently <b>Planned</b> — reservations are pending.</div>
    </div>

    <div className="card" style={{padding:0}}>
      <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
        <h3 className="card-title">Material reservations — hard lock (RM root only)</h3>
        <span className="muted" style={{fontSize:11}}>{w.reservations.length} pending · 0 active · 0 released</span>
      </div>
      <table>
        <thead><tr>
          <th>Material</th><th>LP</th><th style={{textAlign:"right"}}>Reserved qty</th>
          <th>Type</th><th>Reserved at</th><th>Reserved by</th>
          <th>Released at</th><th>Release reason</th><th style={{width:110}}></th>
        </tr></thead>
        <tbody>
          {w.reservations.map((r,i) => (
            <tr key={i}>
              <td>{r.material}</td>
              <td className="mono" style={{color:"var(--blue)"}}>{r.lp}</td>
              <td className="num mono">{r.qty} {r.uom}</td>
              <td><span className="badge badge-blue" style={{fontSize:10}}>Hard lock</span></td>
              <td className="mono" style={{fontSize:11}}>{r.reservedAt || <span className="muted">—</span>}</td>
              <td>{r.reservedBy || <span className="muted">—</span>}</td>
              <td className="mono" style={{fontSize:11}}>
                {r.releasedAt
                  ? r.releasedAt
                  : r.pendingRelease
                    ? <span className="badge badge-amber" style={{fontSize:10}}>Pending on RELEASE</span>
                    : <span className="badge badge-green" style={{fontSize:10}}>Active</span>}
              </td>
              <td>{r.releaseReason || <span className="muted">—</span>}</td>
              <td><button className="btn btn-ghost btn-sm" disabled title="Admin only — releases reservation">Release</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// ---------- Sequencing ----------
const SequencingTab = ({ w }) => {
  const s = w.sequencing;
  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Allergen sequencing — {s.line}</h3>
          <button className="btn btn-secondary btn-sm">Override sequencing position</button>
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:18}}>
          <div>
            <div className="label" style={{marginBottom:6}}>Allergen profile snapshot</div>
            <AllergenCluster families={s.allergenProfile}/>
            <div className="muted" style={{fontSize:11, marginTop:4}}>Captured at release · {s.allergenProfile.join(", ")}</div>

            <div className="label" style={{marginTop:14, marginBottom:6}}>Changeover cost</div>
            <span className={"badge " + (s.changeoverCost === "low" ? "badge-green" : s.changeoverCost === "medium" ? "badge-amber" : "badge-red")} style={{fontSize:10}}>{s.changeoverCost.toUpperCase()}</span>
            <div className="muted" style={{fontSize:11, marginTop:4}}>{s.changeoverNote}</div>
          </div>

          <div>
            <div className="label" style={{marginBottom:6}}>Position in queue</div>
            <div style={{fontSize:18, fontWeight:600}} className="mono">
              {s.position} <span className="muted" style={{fontSize:12}}>of {s.totalOnLine}</span>
            </div>
            <div className="muted" style={{fontSize:11, marginTop:4}}>On {s.line}</div>

            <div style={{marginTop:14, display:"grid", gap:6, fontSize:12}}>
              <div className="row-flex"><span className="muted">Before:</span><span className="mono" style={{color:"var(--blue)", cursor:"pointer"}}>{s.beforeWo}</span></div>
              <div className="row-flex"><span className="muted">After:</span><span className="mono" style={{color:"var(--blue)", cursor:"pointer"}}>{s.afterWo}</span></div>
            </div>
          </div>
        </div>

        {s.override && (
          <div className="alert-amber alert-box" style={{marginTop:14}}>
            <span>⚠</span>
            <div>
              <b>Sequencing override active on this WO.</b>
              <div style={{fontSize:11, color:"var(--amber-700)"}}>Reason: {s.overrideReason}</div>
            </div>
            <div className="alert-cta">
              <button className="btn btn-sm btn-secondary">Clear override</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Queue on {s.line} (next 5)</h3></div>
        <table>
          <thead><tr><th style={{width:40}}>#</th><th>WO</th><th>Product</th><th>Allergen</th><th>Change cost</th></tr></thead>
          <tbody>
            {[
              { pos:1, wo:"WO-2026-0111", product:"Gulasz wołowy 350g", allergens:["gluten"], cost:"low" },
              { pos:2, wo:"WO-2026-0089", product:"Klopsiki w sosie pomidorowym 320g", allergens:["gluten","dairy"], cost:"medium" },
              { pos:3, wo:"WO-2026-0113", product:"Pierogi z mięsem 400g  (← this WO)", allergens:["gluten","egg"], cost:"low", current:true },
              { pos:4, wo:"WO-2026-0117", product:"Pierogi z kapustą 400g", allergens:["gluten"], cost:"low" },
              { pos:5, wo:"WO-2026-0121", product:"Filet z kurczaka sous-vide 180g", allergens:["free"], cost:"high" },
            ].map((r,i) => (
              <tr key={i} style={r.current ? {background:"var(--blue-050)"} : {}}>
                <td className="mono">{r.pos}</td>
                <td className="mono" style={{fontWeight:600}}>{r.wo}</td>
                <td>{r.product}</td>
                <td><AllergenCluster families={r.allergens}/></td>
                <td><span className={"badge " + (r.cost === "low" ? "badge-green" : r.cost === "medium" ? "badge-amber" : "badge-red")} style={{fontSize:10}}>{r.cost}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ---------- State history ----------
const HistoryTab = ({ w }) => (
  <div className="card" style={{padding:0}}>
    <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
      <h3 className="card-title">State history (workflow-as-data)</h3>
      <div className="row-flex">
        <span className="badge badge-gray" style={{fontSize:10}}>{w.statusHistory.length} transitions</span>
        <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}}>View workflow rule in 02-SETTINGS §7 →</a>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>From</th><th>To</th><th>Timestamp</th><th>User</th>
        <th>Action</th><th>Override reason</th><th>Context</th>
      </tr></thead>
      <tbody>
        {w.statusHistory.map((h,i) => (
          <tr key={i}>
            <td>{h.from ? <WOPlanStatus s={h.from}/> : <span className="muted">—</span>}</td>
            <td><WOPlanStatus s={h.to}/></td>
            <td className="mono" style={{fontSize:11}}>{h.t}</td>
            <td>{h.user}</td>
            <td className="mono" style={{fontSize:11}}>{h.action}</td>
            <td>{h.overrideReason ? <span style={{color:"var(--amber-700)"}}>{h.overrideReason}</span> : <span className="muted">—</span>}</td>
            <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>{JSON.stringify(h.context)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------- D365 sync ----------
const D365Tab = ({ w }) => {
  if (!w.d365 && w.source !== "d365") {
    return (
      <div className="card" style={{padding:28, textAlign:"center", color:"var(--muted)"}}>
        <div style={{fontSize:40, opacity:0.25}}>⇅</div>
        <div style={{marginTop:8, fontSize:13}}>This WO was not created from a D365 Sales Order.</div>
        <div style={{fontSize:11, marginTop:4}}>Source: <span className="mono">{w.source}</span> — no D365 sync info to display.</div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-head"><h3 className="card-title">D365 sync</h3></div>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:12}}>
        <div><div className="label">D365 SO reference</div><div className="mono">SO-00128-C1</div></div>
        <div><div className="label">D365 SO status</div><div><span className="badge badge-green" style={{fontSize:10}}>Confirmed</span></div></div>
        <div><div className="label">Pulled at</div><div className="mono">2026-04-20 02:14:08</div></div>
        <div><div className="label">Push status</div><div><span className="badge badge-gray" style={{fontSize:10}}>Pending — WO not completed</span></div></div>
      </div>
      <div className="alert-blue alert-box" style={{marginTop:14}}>
        <span>ⓘ</span>
        <div>D365 production order confirmation will be pushed automatically when this WO transitions to COMPLETED.</div>
      </div>
    </div>
  );
};

Object.assign(window, { PlanWODetail });
