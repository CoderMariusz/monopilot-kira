// ============ Remaining production screens ============

// ---------- OEE ----------
const OEEScreen = () => {
  const plantA = 85, plantP = 88, plantQ = 99, plantOEE = 76.2;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Production</a> · OEE</div>
          <h1 className="page-title">OEE — Overall Equipment Effectiveness</h1>
          <div className="muted" style={{fontSize:12}}>Shift A · live · A × P × Q · target <b>80%</b></div>
        </div>
        <div className="row-flex">
          <div className="pills">
            <button className="pill on">Today</button><button className="pill">7 days</button><button className="pill">30 days</button>
          </div>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
        </div>
      </div>

      <div className="oee-gauges">
        <div className="gauge-card primary">
          <div className="gauge-label">Plant OEE</div>
          <div className="gauge-ring"><GaugeRing pct={plantOEE} color="var(--blue)" /></div>
          <div className="gauge-formula">A × P × Q</div>
          <div className="gauge-target">Target 80% · <span style={{color:"var(--amber)"}}>–3.8 pp</span></div>
        </div>
        <div className="gauge-card green">
          <div className="gauge-label">Availability</div>
          <div className="gauge-ring"><GaugeRing pct={plantA} color="var(--green)" /></div>
          <div className="gauge-formula">(Planned − Stops) / Planned</div>
          <div className="gauge-target">Target 92% · <span style={{color:"var(--red)"}}>–7 pp</span></div>
        </div>
        <div className="gauge-card amber">
          <div className="gauge-label">Performance</div>
          <div className="gauge-ring"><GaugeRing pct={plantP} color="var(--amber)" /></div>
          <div className="gauge-formula">(Produced × Cycle) / Runtime</div>
          <div className="gauge-target">Target 95% · <span style={{color:"var(--red)"}}>–7 pp</span></div>
        </div>
        <div className="gauge-card green">
          <div className="gauge-label">Quality</div>
          <div className="gauge-ring"><GaugeRing pct={plantQ} color="var(--green)" /></div>
          <div className="gauge-formula">Good / Produced</div>
          <div className="gauge-target">Target 98% · <span style={{color:"var(--green)"}}>+1 pp</span></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">OEE by line</h3>
          <div className="row-flex">
            <span className="muted" style={{fontSize:11}}>Red if {"<"} 65%, amber 65–80%, green ≥ 80%</span>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Line</th><th>Current WO</th><th>Status</th>
              <th style={{textAlign:"right"}}>Availability</th>
              <th style={{textAlign:"right"}}>Performance</th>
              <th style={{textAlign:"right"}}>Quality</th>
              <th style={{textAlign:"right"}}>OEE</th>
              <th>7-day trend</th>
            </tr>
          </thead>
          <tbody>
            {OEE_LINES.map(l => {
              const oeeColor = l.oee >= 80 ? "var(--green)" : l.oee >= 65 ? "var(--amber)" : "var(--red)";
              return (
                <tr key={l.line}>
                  <td className="mono" style={{fontWeight:600}}>{l.line}</td>
                  <td className="mono" style={{fontSize:11}}>{l.wo}</td>
                  <td><LineStatus s={l.status} /></td>
                  <td className="num mono">{l.a}%</td>
                  <td className="num mono">{l.p}%</td>
                  <td className="num mono">{l.q}%</td>
                  <td className="num mono" style={{fontWeight:700, color:oeeColor}}>{l.oee}%</td>
                  <td><Spark data={SPARK_OEE.map(v => v + (Math.sin(l.line.charCodeAt(5))*4))} color={oeeColor} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
        <div className="card">
          <div className="card-head"><h3 className="card-title">Performance loss — today</h3></div>
          <div style={{padding:"4px 0"}}>
            {[
              {l:"Speed losses (< cycle time)", v:"112 min", c:"amber"},
              {l:"Minor stops (< 5 min)", v:"38 min", c:"amber"},
              {l:"Reduced yield batches", v:"2 batches", c:"gray"},
            ].map((x,i)=>(
              <div key={i} className="row-flex" style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                <span>{x.l}</span><span className="spacer"></span>
                <span className={"badge badge-"+x.c} style={{fontSize:10}}>{x.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">Quality losses — today</h3></div>
          <div>
            {[
              {l:"QA holds resolved", v:"1 LP", c:"amber"},
              {l:"Rework batches", v:"2", c:"amber"},
              {l:"Scrap (waste)", v:"11.2 kg", c:"red"},
            ].map((x,i)=>(
              <div key={i} className="row-flex" style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                <span>{x.l}</span><span className="spacer"></span>
                <span className={"badge badge-"+x.c} style={{fontSize:10}}>{x.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

// ---------- Downtime ----------
const DowntimeScreen = ({ openModal }) => {
  const tot = DOWNTIME.reduce((a,d) => a+d.duration, 0);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Production</a> · Downtime</div>
          <h1 className="page-title">Downtime</h1>
          <div className="muted" style={{fontSize:12}}>{DOWNTIME.length} events · {Math.floor(tot/60)}h {tot%60}m total · Shift A + prior shift</div>
        </div>
        <div className="row-flex">
          <div className="pills">
            <button className="pill on">Today</button><button className="pill">This week</button><button className="pill">30 days</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("pauseLine")}>＋ Log downtime</button>
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:12}}>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Downtime Pareto — 4P categories</h3>
            <span className="muted" style={{fontSize:11}}>Sorted by minutes</span>
          </div>
          <div style={{padding:"4px 0"}}>
            {PARETO.map((p,i) => {
              const max = PARETO[0].min;
              const pct = (p.min / max * 100);
              return (
                <div key={i} className="pareto-bar">
                  <div className="pb-label">{p.cat}</div>
                  <div className="pb-track"><div className={"pb-fill "+p.group} style={{width:pct+"%"}}></div></div>
                  <div className="pb-val">{p.min} min</div>
                  <div className="pb-pct">{p.events} ev</div>
                </div>
              );
            })}
          </div>
          <div className="row-flex" style={{fontSize:11, padding:"10px 0 2px", borderTop:"1px solid var(--border)", marginTop:8}}>
            <span className="row-flex"><span style={{display:"inline-block", width:12, height:12, background:"var(--red)", borderRadius:2, marginRight:5}}></span>Plant</span>
            <span className="row-flex"><span style={{display:"inline-block", width:12, height:12, background:"var(--amber)", borderRadius:2, marginRight:5}}></span>Process</span>
            <span className="row-flex"><span style={{display:"inline-block", width:12, height:12, background:"var(--blue)", borderRadius:2, marginRight:5}}></span>People</span>
            <span className="spacer"></span>
            <span className="muted">4th P "Product" — tracked as QA holds (see Quality)</span>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">Distribution</h3></div>
          <div style={{fontSize:12, padding:"6px 0"}}>
            <div className="row-flex" style={{padding:"4px 0"}}><span>Plant</span><span className="spacer"></span><span className="mono">457 min (54%)</span></div>
            <div className="row-flex" style={{padding:"4px 0"}}><span>Process</span><span className="spacer"></span><span className="mono">260 min (31%)</span></div>
            <div className="row-flex" style={{padding:"4px 0"}}><span>People</span><span className="spacer"></span><span className="mono">130 min (15%)</span></div>
            <div className="row-flex" style={{padding:"8px 0", borderTop:"1px solid var(--border)", fontWeight:600}}><span>Total</span><span className="spacer"></span><span className="mono">847 min</span></div>
          </div>
          <div className="muted" style={{fontSize:11, marginTop:8}}>
            Top driver: <b style={{color:"var(--text)"}}>Plant — Breakdown</b> · 312 min (37%)
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Event log</h3>
          <div className="row-flex">
            <input type="text" placeholder="Search reason, line, WO…" style={{maxWidth:240}} />
            <select style={{width:120}}><option>All categories</option></select>
          </div>
        </div>
        <table>
          <thead><tr><th>Started</th><th>Line</th><th>Linked WO</th><th>Category</th><th>Reason</th><th>Operator</th><th style={{textAlign:"right"}}>Duration</th><th>Source</th></tr></thead>
          <tbody>
            {DOWNTIME.map((d,i) => (
              <tr key={i}>
                <td className="mono" style={{fontSize:11}}>{d.t}</td>
                <td className="mono">{d.line}</td>
                <td className="mono" style={{fontSize:11}}>{d.wo}</td>
                <td><span className={"badge badge-"+(d.group==="plant"?"red":d.group==="process"?"amber":"blue")} style={{fontSize:10}}>{d.cat}</span></td>
                <td>{d.reason}</td>
                <td>{d.by}</td>
                <td className="num mono">{d.duration} min</td>
                <td><span className="badge badge-gray" style={{fontSize:10}}>{d.source === "wo_pause" ? "Auto (WO pause)" : "Manual"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ---------- Shifts ----------
const ShiftsScreen = ({ openModal }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a>Production</a> · Shifts</div>
        <h1 className="page-title">Shifts &amp; crew</h1>
        <div className="muted" style={{fontSize:12}}>Shift A — 06:00 → 14:00 · 4 of 5 lines covered</div>
      </div>
      <div className="row-flex">
        <button className="btn btn-secondary btn-sm" onClick={()=>openModal("shiftStart")}>▶ Start shift</button>
        <button className="btn btn-secondary btn-sm" onClick={()=>openModal("shiftEnd")}>■ End shift</button>
        <button className="btn btn-primary btn-sm" onClick={()=>openModal("assignCrew")}>Re-assign crew</button>
      </div>
    </div>

    <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:12}}>
      <div className="card">
        <div className="card-head"><h3 className="card-title">Shift A — line assignments</h3></div>
        <table>
          <thead><tr><th>Line</th><th>Operator</th><th>Signed in</th><th>Status</th><th>Current WO</th><th></th></tr></thead>
          <tbody>
            {SHIFT_CREW.map(s => {
              const line = LINES.find(l => l.id === s.line);
              return (
                <tr key={s.line}>
                  <td className="mono" style={{fontWeight:600}}>{s.line}</td>
                  <td>
                    <div className="row-flex">
                      <span className="operator-av" style={{width:24, height:24, fontSize:10}}>{s.init}</span>
                      <span>{s.operator}</span>
                    </div>
                  </td>
                  <td className="mono">{s.start}</td>
                  <td>
                    {s.status === "active" && <span className="badge badge-green" style={{fontSize:10}}>Active</span>}
                    {s.status === "break" && <span className="badge badge-amber" style={{fontSize:10}}>On break</span>}
                    {s.status === "unassigned" && <span className="badge badge-gray" style={{fontSize:10}}>Unassigned</span>}
                  </td>
                  <td className="mono" style={{fontSize:11}}>{line?.wo || "—"}</td>
                  <td><button className="btn btn-ghost btn-sm">Re-assign</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">Shift handover notes</h3></div>
          <div style={{padding:"4px 0"}}>
            <div style={{padding:"8px 0", borderBottom:"1px solid var(--border)", fontSize:12}}>
              <div className="row-flex"><b>From: J. Dudek (Shift C)</b><span className="spacer"></span><span className="mono muted" style={{fontSize:11}}>05:54</span></div>
              <div className="muted" style={{fontSize:12, marginTop:4}}>Line 2 mixer showing elevated temperature last hour — flagged for maintenance. Line 3 casings low, restocked at 05:30.</div>
            </div>
            <div style={{padding:"8px 0", fontSize:12}}>
              <div className="row-flex"><b>From: M. Szymczak (Shift A)</b><span className="spacer"></span><span className="mono muted" style={{fontSize:11}}>10:24</span></div>
              <div className="muted" style={{fontSize:12, marginTop:4}}>Mixer fault confirmed on L2 — maintenance on-site, ETA 11:00. Raised FEFO deviation on L1 for pepper (packaging tear).</div>
            </div>
          </div>
          <textarea placeholder="Add handover note…" style={{marginTop:8}}/>
          <button className="btn btn-primary btn-sm" style={{marginTop:8}}>Post note</button>
        </div>

        <div className="card">
          <div className="card-head"><h3 className="card-title">Shift targets vs actual</h3></div>
          <div style={{fontSize:12}}>
            <div className="row-flex" style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><span>Output</span><span className="spacer"></span><span className="mono">3 842 / 4 211 kg</span></div>
            <div className="row-flex" style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><span>OEE</span><span className="spacer"></span><span className="mono">76.2% / 80%</span></div>
            <div className="row-flex" style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><span>Yield</span><span className="spacer"></span><span className="mono">93.2% / 94%</span></div>
            <div className="row-flex" style={{padding:"6px 0"}}><span>Waste</span><span className="spacer"></span><span className="mono">1.1% / 1.5%</span></div>
          </div>
        </div>
      </div>
    </div>
  </>
);

// ---------- Changeover ----------
const ChangeoverScreen = ({ openModal }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a>Production</a> · Allergen changeover</div>
        <h1 className="page-title">Allergen changeover — LINE-04</h1>
        <div className="muted" style={{fontSize:12}}>FA5301 Pierogi z mięsem → FA5302 Pierogi z grzybami · Risk level: <b style={{color:"var(--amber)"}}>medium</b></div>
      </div>
      <div className="row-flex">
        <button className="btn btn-secondary btn-sm">Cancel changeover</button>
        <button className="btn btn-primary btn-sm" disabled>Release next WO (locked)</button>
      </div>
    </div>

    <div className="alert-blue alert-box" style={{marginBottom:14}}>
      <span>⚠</span>
      <div>
        <b>Dual sign-off required</b> — Both Shift Lead and Quality must sign each gate with PIN before the next step unlocks.
        <br/>Allergens exiting: <b>—</b> · Allergens entering: <b>Gluten, celery</b>
      </div>
    </div>

    <div className="changeover-section done">
      <div className="changeover-head">
        <div><span className="step-num">1</span><b>WO-2026-0041 completed</b> · Line stopped, outputs labelled</div>
        <span className="badge badge-green">DONE · 07:58</span>
      </div>
    </div>

    <div className="changeover-section done">
      <div className="changeover-head">
        <div><span className="step-num">2</span><b>Line clearing</b> · Remove all ingredient LPs from previous product</div>
        <span className="badge badge-green">DONE · 08:04</span>
      </div>
    </div>

    <div className="changeover-section" style={{borderLeft:"3px solid var(--blue)"}}>
      <div className="changeover-head">
        <div><span className="step-num">3</span><b>Cleaning &amp; sanitation checklist</b> · Allergen-specific protocol</div>
        <span className="badge badge-blue">IN PROGRESS · 14 of 18 items</span>
      </div>
      <div className="changeover-body">
        {[
          {d:"Remove all product from hopper, feeders, augers", photo:true, ev:"✓ Photo LP-8841 · 08:06", done:true},
          {d:"Wet-clean all food-contact surfaces (detergent)", photo:true, ev:"✓ Photo LP-8842 · 08:12", done:true},
          {d:"Rinse with potable water", photo:false, ev:"✓ 08:15", done:true},
          {d:"Sanitize with approved sanitizer (60s contact)", photo:false, ev:"✓ 08:17", done:true},
          {d:"Visual inspection — no visible residue", photo:true, ev:"Needs photo of mixer M-004", done:false},
          {d:"ATP swab test — result ≤ 10 RLU (PRD default; configurable per line in 02-SETTINGS)", photo:false, ev:"Pending swab upload · locations: mixer M-004, conveyor C-04, filler F-04", done:false},
        ].map((it,i) => (
          <div key={i} className={"checklist-item "+(it.done?"done":"")}>
            <span className="check-num">{it.done ? "✓" : i+1}</span>
            <div className="check-body">
              <div className="check-desc">{it.d}</div>
              <div className="check-meta">{it.ev}</div>
            </div>
            {it.photo ? (
              <div className="check-photo" style={{textAlign:"center"}}>
                {it.done ? <><b>📷 Photo uploaded</b><br/><span className="mono" style={{fontSize:10}}>{it.ev.replace("✓ ", "")}</span></> : <><b>📷 Photo required</b></>}
              </div>
            ) : <div></div>}
          </div>
        ))}
      </div>
    </div>

    <div className="changeover-section locked">
      <div className="changeover-head">
        <div><span className="step-num">4</span><b>Dual sign-off</b> · Shift Lead + Quality PIN</div>
        <span className="badge badge-gray">LOCKED</span>
      </div>
      <div className="changeover-body">
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div className="sig-box">
            <h4>Shift Lead</h4>
            <div className="sig-name">M. Szymczak</div>
            <div className="sig-meta">Badge #SL-042 · Factory-A</div>
            <div className="sig-pin"><input placeholder="• • • •" maxLength={4} disabled/></div>
          </div>
          <div className="sig-box">
            <h4>Quality</h4>
            <div className="sig-name">—</div>
            <div className="sig-meta">Awaiting QA assignment</div>
            <div className="sig-pin"><input placeholder="• • • •" maxLength={4} disabled/></div>
          </div>
        </div>
      </div>
    </div>

    <div className="changeover-section locked">
      <div className="changeover-head">
        <div><span className="step-num">5</span><b>Release WO-2026-0046</b> · FA5302 · 800 kg planned</div>
        <span className="badge badge-gray">LOCKED</span>
      </div>
    </div>
  </>
);

// ---------- Analytics ----------
const AnalyticsScreen = () => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a>Production</a> · Analytics hub</div>
        <h1 className="page-title">Analytics</h1>
        <div className="muted" style={{fontSize:12}}>Plant-wide reporting · drill into OEE, yield, downtime, FPQ</div>
      </div>
      <div className="row-flex">
        <div className="pills"><button className="pill">Today</button><button className="pill on">7 days</button><button className="pill">30 days</button><button className="pill">Custom</button></div>
        <button className="btn btn-secondary btn-sm">⇪ Export PDF</button>
      </div>
    </div>

    <div className="kpi-row" style={{gridTemplateColumns:"repeat(4, 1fr)"}}>
      <div className="kpi green">
        <div className="kpi-label">OEE · 7 day avg</div>
        <div className="kpi-value">78.4%</div>
        <div className="kpi-change up">▲ 2.1 pp wk/wk</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">First-pass quality</div>
        <div className="kpi-value">97.8%</div>
        <div className="kpi-change up">▲ 0.4 pp</div>
      </div>
      <div className="kpi amber">
        <div className="kpi-label">Yield · 7 day</div>
        <div className="kpi-value">93.4%</div>
        <div className="kpi-change down">▼ 0.3 pp vs target</div>
      </div>
      <div className="kpi red">
        <div className="kpi-label">Waste · 7 day</div>
        <div className="kpi-value">1.7%</div>
        <div className="kpi-change down">▲ 0.2 pp vs target</div>
      </div>
    </div>

    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">OEE — 7 day trend</h3>
          <span className="muted" style={{fontSize:11}}>hourly buckets</span>
        </div>
        <div style={{padding:"10px 0"}}>
          <Spark data={SPARK_OEE} color="var(--blue)" w={600} h={120} />
        </div>
        <div className="row-flex" style={{fontSize:11, color:"var(--muted)", borderTop:"1px solid var(--border)", paddingTop:8}}>
          <span>Min 70% · Max 85% · Avg 78.4%</span>
          <span className="spacer"></span>
          <span>Target 80%</span>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3 className="card-title">Yield by line (7 day)</h3></div>
        <div style={{padding:"6px 0"}}>
          {[
            {l:"LINE-03", v:95.4, t:94, ok:true},
            {l:"LINE-01", v:94.1, t:94, ok:true},
            {l:"LINE-05", v:93.7, t:94, ok:false},
            {l:"LINE-04", v:92.8, t:94, ok:false},
            {l:"LINE-02", v:90.1, t:94, ok:false},
          ].map((y,i) => (
            <div key={i} className="pareto-bar">
              <div className="pb-label mono">{y.l}</div>
              <div className="pb-track">
                <div className={"pb-fill "+(y.ok?"people":"plant")} style={{width:(y.v/100*100)+"%", background: y.ok ? "var(--green)" : "var(--amber)"}}></div>
              </div>
              <div className="pb-val">{y.v}%</div>
              <div className="pb-pct">T {y.t}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Top downtime drivers — 30 day</h3>
        <button className="btn btn-ghost btn-sm">Drill down →</button>
      </div>
      <table>
        <thead><tr><th>Category</th><th>Line</th><th style={{textAlign:"right"}}>Events</th><th style={{textAlign:"right"}}>Minutes</th><th style={{textAlign:"right"}}>Avg</th><th>Top reason</th></tr></thead>
        <tbody>
          {[
            {cat:"Plant — Breakdown", line:"LINE-02", ev:18, min:842, reason:"Mixer M-002 auger"},
            {cat:"Process — Changeover", line:"LINE-04", ev:44, min:680, reason:"Allergen wet-clean"},
            {cat:"Plant — Breakdown", line:"LINE-04", ev:11, min:421, reason:"Sealing head temp"},
            {cat:"Plant — Cleaning", line:"LINE-01", ev:28, min:380, reason:"End-of-shift CIP"},
            {cat:"Process — Material wait", line:"LINE-03", ev:22, min:198, reason:"Casings delay"},
          ].map((r,i)=>(
            <tr key={i}>
              <td><span className={"badge badge-"+(r.cat.startsWith("Plant")?"red":r.cat.startsWith("Process")?"amber":"blue")} style={{fontSize:10}}>{r.cat}</span></td>
              <td className="mono">{r.line}</td>
              <td className="num mono">{r.ev}</td>
              <td className="num mono">{r.min}</td>
              <td className="num mono">{(r.min/r.ev).toFixed(0)} min</td>
              <td>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// ---------- DLQ ----------
const DLQScreen = ({ openModal }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a>Production</a> · D365 DLQ</div>
        <h1 className="page-title">D365 integration · Dead-letter queue</h1>
        <div className="muted" style={{fontSize:12}}>MES is the source of truth. D365 push is eventual — failed events land here for ops review.</div>
      </div>
      <div className="row-flex">
        <button className="btn btn-secondary btn-sm">Connector health</button>
        <button className="btn btn-primary btn-sm">Retry all open</button>
      </div>
    </div>

    <div className="dlq-health">
      <div><div className="dlq-stat-label">Connector</div><div className="dlq-stat-val" style={{color:"var(--green)"}}>● Connected</div></div>
      <div><div className="dlq-stat-label">Queue depth</div><div className="dlq-stat-val">12</div></div>
      <div><div className="dlq-stat-label">Events in DLQ</div><div className="dlq-stat-val" style={{color:"var(--red)"}}>2</div></div>
      <div><div className="dlq-stat-label">Oldest DLQ age</div><div className="dlq-stat-val">5h 12m</div></div>
    </div>

    <div className="tabs-bar">
      <button className="tab-btn on">DLQ <span className="count">2</span></button>
      <button className="tab-btn">Resolved <span className="count">14</span></button>
      <button className="tab-btn">All push events <span className="count">312</span></button>
    </div>

    <div className="card" style={{padding:0}}>
      <table>
        <thead>
          <tr><th>WO</th><th>Event</th><th>Error</th><th>Attempts</th><th>Moved at</th><th>Next retry</th><th></th></tr>
        </thead>
        <tbody>
          {DLQ.map(d => (
            <tr key={d.wo+d.movedAt}>
              <td className="mono" style={{fontWeight:600}}>{d.wo}</td>
              <td><span className="badge badge-blue" style={{fontSize:10}}>{d.event}</span></td>
              <td style={{maxWidth:340}}>{d.err}</td>
              <td className="mono">{d.attempts}</td>
              <td className="mono" style={{fontSize:11}}>{d.movedAt}</td>
              <td className="mono" style={{fontSize:11}}>{d.nextRetry}</td>
              <td>
                <button className="btn btn-secondary btn-sm" onClick={()=>openModal("dlqInspect", d)}>Inspect</button>
                <button className="btn btn-primary btn-sm" style={{marginLeft:4}}>Retry</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="alert-blue alert-box" style={{marginTop:12}}>
      <span>ℹ</span>
      <div>
        <b>Design principle:</b> MES never blocks on D365. WOs complete locally; the push happens in the background with exponential backoff (30s → 15m over 5 attempts), then moves to DLQ for manual retry. The connector health card shows current queue latency in real time.
      </div>
    </div>
  </>
);

// ---------- Settings ----------
const SettingsScreen = ({ openModal }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a>Production</a> · Settings</div>
        <h1 className="page-title">Production settings</h1>
        <div className="muted" style={{fontSize:12}}>Per-plant configuration · requires <b>Plant Manager</b> role</div>
      </div>
      <div className="row-flex">
        <button className="btn btn-primary btn-sm" onClick={()=>openModal && openModal("oeeTargetEdit")}>Edit OEE targets</button>
      </div>
    </div>

    <div className="set-card">
      <div className="set-card-head open">
        <div><b>Lines &amp; nominal cycle time</b><div className="set-hint" style={{fontSize:11}}>Used as denominator in Performance calc for OEE</div></div>
        <span className="muted">▾</span>
      </div>
      <div className="set-card-body">
        <table>
          <thead><tr><th>Line</th><th>Nominal cycle</th><th>Target OEE</th><th>Weighing mode</th><th></th></tr></thead>
          <tbody>
            {[
              {l:"LINE-01",c:"420 kg/h",o:"80%",w:"Fixed"},
              {l:"LINE-02",c:"300 kg/h",o:"75%",w:"Fixed"},
              {l:"LINE-03",c:"160 kg/h",o:"85%",w:"Catch-weight"},
              {l:"LINE-04",c:"180 kg/h",o:"75%",w:"Fixed"},
              {l:"LINE-05",c:"120 kg/h",o:"80%",w:"Catch-weight"},
            ].map((r,i) => (
              <tr key={i}>
                <td className="mono" style={{fontWeight:600}}>{r.l}</td>
                <td><input defaultValue={r.c} /></td>
                <td><input defaultValue={r.o} /></td>
                <td><select defaultValue={r.w}><option>Fixed</option><option>Catch-weight</option></select></td>
                <td><button className="btn btn-ghost btn-sm">Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="set-card">
      <div className="set-card-head open"><div><b>Downtime categories (4P)</b><div className="set-hint">Add/edit sub-categories · changes apply to future events</div></div><span className="muted">▾</span></div>
      <div className="set-card-body">
        <div className="row-flex" style={{flexWrap:"wrap", gap:6}}>
          {["Plant — Breakdown","Plant — Cleaning","Plant — PM","Process — Changeover","Process — Material wait","Process — Setup","People — Break","People — Training","People — Absence","Product — QA hold","Product — Rework"].map((c,i)=>(
            <span key={i} className="badge" style={{background:"#fff", border:"1px solid var(--border)", fontSize:11}}>{c}</span>
          ))}
        </div>
        <button className="btn btn-secondary btn-sm" style={{marginTop:10}}>＋ Add sub-category</button>
      </div>
    </div>

    <div className="set-card">
      <div className="set-card-head open"><div><b>Tolerances &amp; gates</b></div><span className="muted">▾</span></div>
      <div className="set-card-body">
        <div className="set-row"><div><div className="set-label">Consumption tolerance</div><div className="set-hint">% over BOM qty allowed without approval</div></div><input defaultValue="2%" style={{maxWidth:120}}/></div>
        <div className="set-row"><div><div className="set-label">Over-consumption approver</div><div className="set-hint">Role required to approve above tolerance</div></div><select style={{maxWidth:200}}><option>Shift Lead</option><option>Plant Manager</option></select></div>
        <div className="set-row"><div><div className="set-label">Waste capture mandatory</div><div className="set-hint">Block WO close if waste {"<"} expected</div></div><label className="toggle"><input type="checkbox" defaultChecked/><span className="slider"></span></label></div>
        <div className="set-row"><div><div className="set-label">Catch-weight lot size</div><div className="set-hint">Units per LP for variable-weight items</div></div><input defaultValue="24 units" style={{maxWidth:120}}/></div>
        <div className="set-row"><div><div className="set-label">Dual sign-off for allergen changeover</div><div className="set-hint">Shift Lead + Quality required</div></div><label className="toggle"><input type="checkbox" defaultChecked/><span className="slider"></span></label></div>
      </div>
    </div>

    <div className="set-card">
      <div className="set-card-head open"><div><b>Shift definitions</b></div><span className="muted">▾</span></div>
      <div className="set-card-body">
        <table>
          <thead><tr><th>Shift</th><th>Start</th><th>End</th><th>Planned downtime budget</th><th>Rollover rule</th><th></th></tr></thead>
          <tbody>
            <tr><td>A</td><td>06:00</td><td>14:00</td><td className="mono">150 min</td><td>Close WO at handover</td><td><button className="btn btn-ghost btn-sm">Edit</button></td></tr>
            <tr><td>B</td><td>14:00</td><td>22:00</td><td className="mono">150 min</td><td>Roll over to next shift</td><td><button className="btn btn-ghost btn-sm">Edit</button></td></tr>
            <tr><td>C</td><td>22:00</td><td>06:00</td><td className="mono">180 min</td><td>Roll over</td><td><button className="btn btn-ghost btn-sm">Edit</button></td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div className="set-card">
      <div className="set-card-head open"><div><b>D365 push</b></div><span className="muted">▾</span></div>
      <div className="set-card-body">
        <div className="set-row"><div><div className="set-label">Push mode</div></div><select style={{maxWidth:200}}><option>Event-driven (on WO complete)</option><option>Scheduled batch</option></select></div>
        <div className="set-row"><div><div className="set-label">Retry strategy</div></div><input defaultValue="5 attempts · 30s → 15m backoff"/></div>
        <div className="set-row"><div><div className="set-label">Auto-move to DLQ after</div></div><input defaultValue="5 attempts" style={{maxWidth:120}}/></div>
        <div className="set-row"><div><div className="set-label">Alert on DLQ entry</div></div><label className="toggle"><input type="checkbox" defaultChecked/><span className="slider"></span></label></div>
      </div>
    </div>
  </>
);

Object.assign(window, { OEEScreen, DowntimeScreen, ShiftsScreen, ChangeoverScreen, AnalyticsScreen, DLQScreen, SettingsScreen });
