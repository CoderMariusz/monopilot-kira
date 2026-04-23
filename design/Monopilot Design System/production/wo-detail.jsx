// ============ WO Detail — the main operational screen ============

const WODetail = ({ onBack, openModal }) => {
  // Audit Fix-5b: WO Detail tab set extended from 6 → 8 tabs to match UX
  // SCR-08-02 spec (Overview + QA Results were missing). Default tab is now
  // Overview so the operator lands on the WO summary, not the ingredient
  // consumption grid.
  const [tab, setTab] = React.useState("overview");
  const w = WO_DETAIL;
  const consPct = (w.consumed / w.plannedQty * 100);
  const outPct = w.outputTarget ? (w.output / w.outputTarget * 100) : 0;

  return (
    <>
      {/* Header */}
      <div className="breadcrumb" style={{marginBottom:6}}>
        <a onClick={onBack}>Production</a> · <a onClick={onBack}>Work orders</a> · <span className="mono">{w.code}</span>
      </div>

      <div className="wo-head">
        <div className="wo-head-top">
          <div>
            <div className="wo-head-title">
              <span className="wo-head-code">{w.code}</span>
              <span className="wo-head-name">{w.name}</span>
              <WOStatus s={w.status} />
              <span className="badge badge-gray" style={{fontSize:10}}>{w.bomSnapshot}</span>
            </div>
            <div className="muted" style={{fontSize:12, marginTop:3}}>
              <span className="mono">{w.item}</span> · {w.line} · Shift {w.shift}
              &nbsp;·&nbsp; Operator <b>{w.operator}</b>
              &nbsp;·&nbsp; Meat-pct <b className="mono">{w.meatPct}%</b>
              &nbsp;·&nbsp; {w.allergens}
            </div>
            <div className="muted" style={{fontSize:12, marginTop:2}}>
              Planned {w.plannedStart} → {w.plannedEnd} &nbsp;·&nbsp;
              Actual start <b>{w.actualStart}</b> &nbsp;·&nbsp; Elapsed <b>{w.elapsed}</b> (paused {w.totalPause})
            </div>
          </div>
          <div className="wo-head-actions">
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("pauseLine", w)}>❚❚ Pause</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("waste", w)}>⌫ Waste</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>openModal("catchweight", w)}>⚖ Catch-weight</button>
            <button className="btn btn-primary btn-sm" onClick={()=>openModal("completeWo", w)}>✓ Complete</button>
          </div>
        </div>

        <div className="wo-head-progress">
          <div>
            <div className="prog-label"><span>Consumption progress</span><b className="mono">{w.consumed} / {w.plannedQty} kg ({consPct.toFixed(1)}%)</b></div>
            <div className="progress green"><span style={{width:consPct+"%"}}></span></div>
          </div>
          <div>
            <div className="prog-label"><span>Output registered</span><b className="mono">{w.output} / {w.outputTarget} kg ({outPct.toFixed(1)}%)</b></div>
            <div className="progress"><span style={{width:outPct+"%"}}></span></div>
          </div>
        </div>
      </div>

      {/* Over-consume notice */}
      <div className="alert-amber alert-box" style={{margin:"10px 0"}}>
        <span>⚠</span>
        <div>
          <b>Over-consumption pending approval</b> · R-3001 Osłonka Ø26 · +52m above BOM planned qty
          <div style={{fontSize:11, color:"var(--amber-700)"}}>Reason: Rework — 2 batches re-extruded. Awaiting Shift Lead digital sign-off (PIN).</div>
        </div>
        <div className="alert-cta">
          <button className="btn btn-sm btn-secondary">Reject</button>
          <button className="btn btn-sm btn-primary" onClick={()=>openModal("overConsume", w)}>Approve (PIN)</button>
        </div>
      </div>

      {/* Tabs — 8 tabs per UX SCR-08-02 */}
      <div className="tabs-bar" style={{marginTop:0}}>
        <button className={"tab-btn " + (tab==="overview"?"on":"")} onClick={()=>setTab("overview")}>Overview</button>
        <button className={"tab-btn " + (tab==="consumption"?"on":"")} onClick={()=>setTab("consumption")}>Consumption <span className="count">{w.bomComponents.length}</span></button>
        <button className={"tab-btn " + (tab==="output"?"on":"")} onClick={()=>setTab("output")}>Output & co-products</button>
        <button className={"tab-btn " + (tab==="waste"?"on":"")} onClick={()=>setTab("waste")}>Waste <span className="count">{w.wasteLog.length}</span></button>
        <button className={"tab-btn " + (tab==="downtime"?"on":"")} onClick={()=>setTab("downtime")}>Downtime</button>
        <button className={"tab-btn " + (tab==="qa"?"on":"")} onClick={()=>setTab("qa")}>QA results <span className="count">{WO_QA_SUMMARY.total}</span></button>
        <button className={"tab-btn " + (tab==="genealogy"?"on":"")} onClick={()=>setTab("genealogy")}>Genealogy</button>
        <button className={"tab-btn " + (tab==="history"?"on":"")} onClick={()=>setTab("history")}>Event log <span className="count">{w.history.length}</span></button>
      </div>

      {tab === "overview" && <OverviewTab w={w} consPct={consPct} outPct={outPct} />}
      {tab === "consumption" && <ConsumptionTab w={w} openModal={openModal} />}
      {tab === "output" && <OutputTab w={w} openModal={openModal} />}
      {tab === "waste" && <WasteTab w={w} openModal={openModal} />}
      {tab === "downtime" && <DowntimeTab w={w} openModal={openModal} />}
      {tab === "qa" && <QAResultsTab w={w} openModal={openModal} />}
      {tab === "genealogy" && <GenealogyTab w={w} />}
      {tab === "history" && <HistoryTab w={w} />}
    </>
  );
};

// ------ Overview (Tab 1 · new per audit fix-5b) ------
// Matches UX SCR-08-02 §Overview: WO summary card + right-column KPI mini-cards
// (consumption / output / waste) + D365 push status. Read-only; actions live
// in the WO header action bar (Pause / Waste / Catch-weight / Complete).
const OverviewTab = ({ w, consPct, outPct }) => {
  const wastedKg = (w.wasteLog || []).reduce((a, e) => a + (e.qty || 0), 0);
  const wastePct = w.consumed ? (wastedKg / w.consumed * 100) : 0;
  const downtimeMin = (w.downtimeOnWo || []).reduce((a, e) => a + (e.duration || 0), 0);
  return (
    <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:12, alignItems:"flex-start"}}>
      <div className="card">
        <div className="card-head"><h3 className="card-title">Work order summary</h3><span className="badge badge-gray" style={{fontSize:10}}>{w.bomSnapshot}</span></div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12, lineHeight:1.8}}>
          <div><span className="muted">WO code</span> <b className="mono" style={{marginLeft:6}}>{w.code}</b></div>
          <div><span className="muted">Item</span> <b className="mono" style={{marginLeft:6}}>{w.item}</b></div>
          <div><span className="muted">Product</span> <b style={{marginLeft:6}}>{w.name}</b></div>
          <div><span className="muted">Line</span> <b style={{marginLeft:6}}>{w.line}</b></div>
          <div><span className="muted">Shift</span> <b style={{marginLeft:6}}>{w.shift}</b></div>
          <div><span className="muted">Operator</span> <b style={{marginLeft:6}}>{w.operator}</b></div>
          <div><span className="muted">Planned qty</span> <b className="mono" style={{marginLeft:6}}>{w.plannedQty} {w.unit}</b></div>
          <div><span className="muted">Output target</span> <b className="mono" style={{marginLeft:6}}>{w.outputTarget} {w.unit}</b></div>
          <div><span className="muted">Planned window</span> <b className="mono" style={{marginLeft:6}}>{w.plannedStart} → {w.plannedEnd}</b></div>
          <div><span className="muted">Actual start</span> <b className="mono" style={{marginLeft:6}}>{w.actualStart}</b></div>
          <div><span className="muted">Elapsed</span> <b className="mono" style={{marginLeft:6}}>{w.elapsed}</b> <span className="muted" style={{fontSize:11}}>(paused {w.totalPause})</span></div>
          <div><span className="muted">Weight mode</span> <b style={{marginLeft:6}}>{w.weightMode === "catch" ? "Catch-weight (3103/3922)" : "Fixed"}</b></div>
          <div style={{gridColumn:"1 / span 2"}}><span className="muted">Allergens</span> <b style={{marginLeft:6}}>{w.allergens}</b></div>
        </div>
        <div style={{marginTop:14}}>
          <div className="prog-label"><span>Consumption</span><b className="mono">{w.consumed} / {w.plannedQty} kg ({consPct.toFixed(1)}%)</b></div>
          <div className="progress green"><span style={{width:consPct+"%"}}></span></div>
        </div>
        <div style={{marginTop:8}}>
          <div className="prog-label"><span>Output</span><b className="mono">{w.output} / {w.outputTarget} kg ({outPct.toFixed(1)}%)</b></div>
          <div className="progress"><span style={{width:outPct+"%"}}></span></div>
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">KPIs</h3></div>
          <div style={{display:"grid", gap:8, fontSize:12}}>
            <div style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
              <div className="muted" style={{fontSize:11, textTransform:"uppercase"}}>Consumption</div>
              <div style={{fontSize:18, fontWeight:600}} className="mono">{consPct.toFixed(1)}%</div>
              <div className="muted mono" style={{fontSize:11}}>{w.consumed} / {w.plannedQty} kg</div>
            </div>
            <div style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
              <div className="muted" style={{fontSize:11, textTransform:"uppercase"}}>Output</div>
              <div style={{fontSize:18, fontWeight:600}} className="mono">{outPct.toFixed(1)}%</div>
              <div className="muted mono" style={{fontSize:11}}>{w.output} / {w.outputTarget} kg</div>
            </div>
            <div style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
              <div className="muted" style={{fontSize:11, textTransform:"uppercase"}}>Waste</div>
              <div style={{fontSize:18, fontWeight:600, color: wastePct > 1.5 ? "var(--amber-700)" : "var(--text)"}} className="mono">{wastePct.toFixed(2)}%</div>
              <div className="muted mono" style={{fontSize:11}}>{wastedKg.toFixed(1)} kg · {w.wasteLog.length} events</div>
            </div>
            <div style={{padding:"8px 0"}}>
              <div className="muted" style={{fontSize:11, textTransform:"uppercase"}}>Downtime on WO</div>
              <div style={{fontSize:18, fontWeight:600}} className="mono">{downtimeMin}m</div>
              <div className="muted mono" style={{fontSize:11}}>{(w.downtimeOnWo||[]).length} event(s)</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3 className="card-title">D365 push status</h3></div>
          <div style={{fontSize:12, lineHeight:1.8}}>
            <div className="row-flex"><span className="muted">Current state</span><span className="spacer"></span><span className="badge badge-gray" style={{fontSize:10}}>Not pushed · WO in progress</span></div>
            <div className="row-flex"><span className="muted">Queue</span><span className="spacer"></span><span className="mono">outbox_events</span></div>
            <div className="row-flex"><span className="muted">On complete</span><span className="spacer"></span><span className="mono">wo.completed event</span></div>
            <div className="row-flex"><span className="muted">D365 journal</span><span className="spacer"></span><span className="mono">InventJournalTrans</span></div>
            <div className="muted" style={{fontSize:11, marginTop:4}}>D365 push is enqueued on Complete. Failures land in DLQ (Production → D365 DLQ).</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------ QA Results (Tab 6 · new per audit fix-5b) ------
// Matches UX SCR-08-02 §QA Results: linked qa_inspections for this WO,
// hold status aggregate, and a link to 09-QUALITY for inspection detail.
// Source: WO_QA_RESULTS + WO_QA_SUMMARY (data.jsx mocks).
const QAResultsTab = ({ w, openModal }) => {
  const tone = { pass: "badge-green", hold: "badge-amber", fail: "badge-red" };
  const s = WO_QA_SUMMARY;
  return (
    <div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginBottom:12}}>
        <div className="kpi"><div className="kpi-label">Total inspections</div><div className="kpi-value">{s.total}</div><div className="kpi-sub">linked to {w.code}</div></div>
        <div className="kpi green"><div className="kpi-label">Pass</div><div className="kpi-value">{s.pass}</div><div className="kpi-sub">auto + lab</div></div>
        <div className={"kpi " + (s.hold > 0 ? "amber" : "")}><div className="kpi-label">Hold</div><div className="kpi-value">{s.hold}</div><div className="kpi-sub">blocks release</div></div>
        <div className={"kpi " + (s.fail > 0 ? "red" : "")}><div className="kpi-label">Fail</div><div className="kpi-value">{s.fail}</div><div className="kpi-sub">CAPA required</div></div>
      </div>

      {s.hold > 0 && (
        <div className="alert-amber alert-box" style={{marginBottom:10}}>
          <span>⚠</span>
          <div>
            <b>{s.hold} QA hold active</b> — output release blocked until resolved in 09-QUALITY. WO can continue consumption; complete gate will fail closed_production_strict.
          </div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-secondary">Open 09-QUALITY</button>
            <button className="btn btn-sm btn-primary">Add corrective action</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Inspections on this WO</h3>
          <div className="row-flex">
            <span className="badge badge-gray" style={{fontSize:10}}>D365: {s.d365Push}</span>
            <button className="btn btn-secondary btn-sm">+ Add inspection</button>
          </div>
        </div>
        <table>
          <thead><tr>
            <th style={{width:110}}>QA id</th>
            <th style={{width:70}}>Time</th>
            <th>Test type</th>
            <th>Target / spec</th>
            <th>Result</th>
            <th style={{width:80}}>Status</th>
            <th>Inspector · method</th>
          </tr></thead>
          <tbody>
            {WO_QA_RESULTS.map(r => (
              <tr key={r.id}>
                <td className="mono" style={{fontWeight:600}}>{r.id}</td>
                <td className="mono">{r.t}</td>
                <td>
                  <div style={{fontWeight:500}}>{r.test_type.replace(/_/g, " ")}</div>
                  <div className="mono muted" style={{fontSize:11}}>sample {r.sample}</div>
                </td>
                <td style={{fontSize:12}}>{r.target}</td>
                <td className="mono" style={{fontSize:12, fontWeight:600}}>{r.result}</td>
                <td><span className={"badge " + tone[r.status]} style={{fontSize:10}}>{r.status}</span></td>
                <td style={{fontSize:12}}>
                  {r.inspector}
                  <div className="muted" style={{fontSize:11}}>{r.method}</div>
                  {r.note && <div style={{fontSize:11, color:"var(--amber-700)"}}>⚠ {r.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-blue alert-box" style={{marginTop:10, fontSize:11}}>
        <span>ⓘ</span>
        <div>CCP tests (allergen ATP, metal detection, temperature, weight) stream automatically from inline equipment. Protein / visual checks are lab-logged. Full inspection detail in 09-QUALITY.</div>
      </div>
    </div>
  );
};

// ------ Consumption ------
const ConsumptionTab = ({ w, openModal }) => (
  <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:12, alignItems:"flex-start"}}>
    <div className="bom-consumption">
      <table>
        <thead>
          <tr>
            <th style={{width:110}}>Code</th>
            <th>Component</th>
            <th style={{textAlign:"right"}}>Planned</th>
            <th style={{textAlign:"right"}}>Consumed</th>
            <th style={{textAlign:"right"}}>Remaining</th>
            <th>Progress</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {w.bomComponents.map(c => {
            const pct = c.planned ? Math.min(100, c.consumed / c.planned * 100) : 0;
            const isOver = c.over > 0;
            return (
              <tr key={c.code}>
                <td className="mono">{c.code}</td>
                <td>
                  <div style={{fontWeight:500}}>{c.name}</div>
                  <div className="muted" style={{fontSize:11}}>
                    {c.auto && <span className="badge badge-gray" style={{fontSize:9}}>Auto-consumed</span>}
                    {c.deviationNote && <span style={{color:"var(--amber-700)"}}> ⚠ FEFO deviation: {c.deviationNote}</span>}
                    {c.overPending && <span style={{color:"var(--amber-700)"}}> ⚠ Over-consumption +{c.over} {c.uom} awaiting approval</span>}
                  </div>
                </td>
                <td className="num qty-cell">{c.planned} <span className="muted" style={{fontSize:10}}>{c.uom}</span></td>
                <td className="num qty-cell" style={{fontWeight:600, color: isOver ? "var(--amber-700)" : "var(--text)"}}>
                  {c.consumed}{isOver && <span className="variance-neg"> (+{c.over})</span>}
                </td>
                <td className="num qty-cell">{c.remaining}</td>
                <td>
                  <div className="cell-bar green"><span style={{width:pct+"%"}}></span></div>
                  <div className="muted mono" style={{fontSize:10, marginTop:2}}>{pct.toFixed(0)}%</div>
                </td>
                <td>
                  {c.fefo === "ok" && <span className="badge badge-green" style={{fontSize:10}}>FEFO ✓</span>}
                  {c.fefo === "deviation" && <span className="badge badge-amber" style={{fontSize:10}}>FEFO ⚠</span>}
                  {c.fefo === "—" && <span className="muted" style={{fontSize:10}}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* LP consumption log */}
    <div>
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">LP consumption log</h3>
          <span className="badge badge-blue" style={{fontSize:10}}>{w.consumedLPs.length} scans</span>
        </div>
        <div>
          {w.consumedLPs.map((lp,i) => (
            <div key={i} style={{padding:"7px 0", borderBottom:"1px solid var(--border)", fontSize:12}}>
              <div className="row-flex">
                <span className="mono" style={{fontWeight:600}}>{lp.lp}</span>
                <span className="spacer"></span>
                <span className="mono">{lp.qty} kg</span>
              </div>
              <div className="muted" style={{fontSize:11, marginTop:1}}>
                {lp.component} · {lp.time} · {lp.operator} {lp.fefo ? <span className="badge badge-green" style={{fontSize:9, marginLeft:3}}>FEFO</span> : <span className="badge badge-amber" style={{fontSize:9, marginLeft:3}}>Deviation</span>}
              </div>
              {!lp.fefo && <div style={{fontSize:11, color:"var(--amber-700)"}}>Reason: {lp.reason}</div>}
            </div>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" style={{width:"100%", marginTop:10, justifyContent:"center"}} onClick={()=>openModal("scanner")}>🔲 Scan next LP</button>
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Operator hints</h3></div>
        <div style={{fontSize:12, lineHeight:1.6}}>
          <div className="row-flex"><span>🎯</span><span>Next FEFO pick: <b className="mono">LP-4502</b> · R-1001 · best before 2026-04-29</span></div>
          <div className="row-flex"><span>📦</span><span>Remaining BOM fits <b>1 more batch</b> of 200 kg</span></div>
          <div className="row-flex"><span>⏱</span><span>Est. completion <b className="mono">09:34</b> (+4 min vs plan)</span></div>
        </div>
      </div>
    </div>
  </div>
);

// ------ Output ------
const OutputTab = ({ w, openModal }) => (
  <div>
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Primary output</h3>
        <div className="row-flex">
          <span className="badge badge-blue" style={{fontSize:10}}>Fixed-weight</span>
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("catchweight")}>⚖ Switch to catch-weight capture</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("registerOutput")}>＋ Register output LP</button>
        </div>
      </div>
      <table>
        <thead><tr><th>LP</th><th>Item</th><th style={{textAlign:"right"}}>Qty</th><th>Batch/Lot</th><th>Expiry</th><th>QA</th><th>Label</th></tr></thead>
        <tbody>
          <tr>
            <td className="mono">LP-9001</td>
            <td>{w.item} · {w.name}</td>
            <td className="num mono">0 kg <span className="muted">/ 1000</span></td>
            <td className="mono">WO-2026-0042-OUT-001</td>
            <td className="mono">2026-04-27</td>
            <td><span className="badge badge-gray" style={{fontSize:10}}>Pending QA</span></td>
            <td><span className="badge badge-gray" style={{fontSize:10}}>—</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Co-products (planned)</h3>
        <span className="muted" style={{fontSize:11}}>Allocated from input value per BOM v7 rules</span>
      </div>
      <table>
        <thead><tr><th>Code</th><th>Name</th><th style={{textAlign:"right"}}>Alloc %</th><th style={{textAlign:"right"}}>Expected</th><th style={{textAlign:"right"}}>Registered</th><th></th></tr></thead>
        <tbody>
          {w.coProducts.map(c => (
            <tr key={c.code}>
              <td className="mono">{c.code}</td>
              <td>{c.name}</td>
              <td className="num">{c.alloc}%</td>
              <td className="num mono">{c.expected} kg</td>
              <td className="num mono">{c.registered} kg</td>
              <td><button className="btn btn-secondary btn-sm">＋ Register</button></td>
            </tr>
          ))}
          {w.byProducts.map(c => (
            <tr key={c.code}>
              <td className="mono">{c.code}</td>
              <td>{c.name} <span className="badge badge-gray" style={{fontSize:9}}>by-product</span></td>
              <td className="num">{c.alloc}%</td>
              <td className="num mono">{c.expected} kg</td>
              <td className="num mono">{c.registered} kg</td>
              <td><button className="btn btn-secondary btn-sm">＋ Register</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ------ Waste ------
const WasteTab = ({ w, openModal }) => (
  <div className="card">
    <div className="card-head">
      <h3 className="card-title">Waste events on this WO</h3>
      <button className="btn btn-primary btn-sm" onClick={()=>openModal("waste", w)}>＋ Log waste</button>
    </div>
    <table>
      <thead><tr><th>Time</th><th>Category</th><th style={{textAlign:"right"}}>Qty</th><th>Reason</th><th>Operator</th></tr></thead>
      <tbody>
        {w.wasteLog.map((ev,i) => (
          <tr key={i}>
            <td className="mono">{ev.t}</td>
            <td><span className="badge badge-amber" style={{fontSize:10}}>{ev.category}</span></td>
            <td className="num mono">{ev.qty} kg</td>
            <td>{ev.reason}</td>
            <td>{ev.operator}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="row-flex" style={{padding:"10px 0", fontSize:12}}>
      <span className="muted">Total: <b className="mono" style={{color:"var(--text)"}}>3.6 kg</b> · {(3.6/650*100).toFixed(2)}% of consumed</span>
      <span className="spacer"></span>
      <span className="muted">Yield loss: <span className="variance-neg">–0.55 pp</span></span>
    </div>
  </div>
);

// ------ Downtime ------
const DowntimeTab = ({ w, openModal }) => (
  <div className="card">
    <div className="card-head">
      <h3 className="card-title">Downtime events linked to this WO</h3>
      <button className="btn btn-secondary btn-sm" onClick={()=>openModal("pauseLine")}>＋ Log downtime</button>
    </div>
    <div style={{padding:"12px 0", textAlign:"center", color:"var(--muted)", fontSize:12}}>
      <div style={{fontSize:40, opacity:0.2}}>⏱</div>
      <div>1 event recorded on this WO — 6 min material wait at 06:44</div>
      <div className="mono" style={{fontSize:11, marginTop:4}}>Process — Material wait · casings delayed from warehouse</div>
    </div>
  </div>
);

// ------ Genealogy ------
const GenealogyTab = ({ w }) => (
  <div className="card">
    <div className="card-head">
      <h3 className="card-title">WO genealogy</h3>
      <div className="row-flex">
        <button className="btn btn-ghost btn-sm">◀ Backward (LP → batch → WO)</button>
        <button className="btn btn-ghost btn-sm on">▶ Forward (WO → LPs → shipments)</button>
        <button className="btn btn-secondary btn-sm">⇪ Export for mock recall</button>
      </div>
    </div>

    <div className="tree-root">{w.code} · {w.name}</div>

    <div className="tree-branch">
      <div className="tree-side">
        <div style={{fontSize:11, textTransform:"uppercase", fontWeight:600, color:"var(--muted)", marginBottom:8, letterSpacing:"0.06em"}}>Consumed inputs ({w.consumedLPs.length})</div>
        {w.consumedLPs.map((lp,i) => (
          <div key={i} className="tree-node">
            <div><span className="tn-name">{lp.component}</span><div className="tn-code">{lp.lp}</div></div>
            <span className="tn-qty">{lp.qty} kg</span>
          </div>
        ))}
      </div>

      <div className="tree-arrow">→</div>

      <div className="tree-side">
        <div style={{fontSize:11, textTransform:"uppercase", fontWeight:600, color:"var(--muted)", marginBottom:8, letterSpacing:"0.06em"}}>Output LPs ({w.outputs.length + w.coProducts.length})</div>
        {w.outputs.map((o,i) => (
          <div key={i} className="tree-node output">
            <div><span className="tn-name">{o.item}</span><div className="tn-code">{o.lp} · {o.batch}</div></div>
            <span className="tn-qty">{o.qty} kg</span>
          </div>
        ))}
        {w.coProducts.map((c,i) => (
          <div key={i} className="tree-node output" style={{opacity:0.6}}>
            <div><span className="tn-name">{c.name}</span><div className="tn-code">{c.code} · planned</div></div>
            <span className="tn-qty">{c.expected} kg</span>
          </div>
        ))}
      </div>
    </div>

    <div style={{marginTop:14, padding:"10px 12px", background:"var(--gray-100)", borderRadius:6, fontSize:12}}>
      <b>Shipment links (forward):</b> <span className="muted">Not yet shipped. Will update on LP allocation to a shipment.</span>
    </div>
  </div>
);

// ------ History ------
const HistoryTab = ({ w }) => (
  <div className="card">
    <div className="card-head">
      <h3 className="card-title">Event log (append-only)</h3>
      <div className="row-flex">
        <span className="badge badge-gray" style={{fontSize:10}}>{w.history.length} entries</span>
        <button className="btn btn-secondary btn-sm">⇪ Export JSON</button>
      </div>
    </div>
    <table>
      <thead><tr><th style={{width:110}}>Time</th><th>Actor</th><th>Event</th><th style={{textAlign:"right"}}>Tx</th></tr></thead>
      <tbody>
        {w.history.map((h,i) => (
          <tr key={i}>
            <td className="mono">{h.t}</td>
            <td>{h.actor}</td>
            <td>{h.event}</td>
            <td className="mono" style={{fontSize:10, textAlign:"right", color:"var(--muted)"}}>{h.tx}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

Object.assign(window, { WODetail, OverviewTab, QAResultsTab });
