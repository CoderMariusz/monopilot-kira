// ============ Newly built screens: Waste Analytics (PROD-010) + Line Detail (PROD-013) ============

// ---------- Waste analytics (PROD-010) ----------
const WasteAnalyticsScreen = ({ openModal }) => {
  const topCat = WASTE_PARETO[0];
  const totalKg = WASTE_PARETO.reduce((a, p) => a + p.kg, 0);
  const rollingPct = 1.4;
  const target = 1.5;
  const trendAvg = (WASTE_TREND.reduce((a, v) => a + v, 0) / WASTE_TREND.length).toFixed(2);
  const [catFilter, setCatFilter] = React.useState("all");
  const [lineFilter, setLineFilter] = React.useState("all");

  const filtered = WASTE_EVENTS.filter(e =>
    (catFilter === "all" || e.cat === catFilter) &&
    (lineFilter === "all" || e.line === lineFilter)
  );

  // Sparkline bounds for waste trend (green if under target, else amber)
  const trendColor = rollingPct <= target ? "var(--green)" : "var(--amber)";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a>Production</a> · Waste analytics</div>
          <h1 className="page-title">Waste analytics</h1>
          <div className="muted" style={{fontSize:12}}>Consolidated cross-line view · rolling 14-day window · target <b>{target}%</b> of consumed</div>
        </div>
        <div className="row-flex">
          <div className="pills">
            <button className="pill">Today</button>
            <button className="pill on">14 days</button>
            <button className="pill">30 days</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => openModal && openModal("waste")}>＋ Log waste event</button>
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
        </div>
      </div>

      {/* KPI row — 4 cards */}
      <div className="kpi-row" style={{gridTemplateColumns:"repeat(4, 1fr)"}}>
        <div className={"kpi " + (rollingPct <= target ? "green" : "amber")}>
          <div className="kpi-label">Waste · rolling 14d</div>
          <div className="kpi-value">{rollingPct}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
          <div className="kpi-sub">Target ≤ {target}% · {totalKg.toFixed(0)} kg total</div>
        </div>
        <div className={"kpi " + (rollingPct <= target ? "green" : "red")}>
          <div className="kpi-label">Waste vs target</div>
          <div className="kpi-value">{(target - rollingPct).toFixed(2)}<span style={{fontSize:14, color:"var(--muted)"}}> pp</span></div>
          <div className={"kpi-change " + (rollingPct <= target ? "up" : "down")}>
            {rollingPct <= target ? "▼" : "▲"} {Math.abs(target - rollingPct).toFixed(2)} pp vs target
          </div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">Top category</div>
          <div className="kpi-value" style={{fontSize:18}}>{topCat.cat}</div>
          <div className="kpi-sub mono">{topCat.kg} kg · {topCat.pct}% of waste · {topCat.events} ev</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">Trend · 14d avg</div>
          <div className="kpi-value">{trendAvg}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
          <div className="kpi-change up">▼ 0.3 pp vs prior 14d</div>
        </div>
      </div>

      {/* Pareto + trend charts */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Waste Pareto — by category</h3>
            <span className="muted" style={{fontSize:11}}>Sorted by kilograms · 14 days</span>
          </div>
          <div style={{padding:"4px 0"}}>
            {WASTE_PARETO.map((p, i) => {
              const maxKg = WASTE_PARETO[0].kg;
              const barPct = (p.kg / maxKg) * 100;
              return (
                <div key={i} className="pareto-bar">
                  <div className="pb-label">{p.cat}</div>
                  <div className="pb-track"><div className={"pb-fill " + p.group} style={{width: barPct + "%"}}></div></div>
                  <div className="pb-val">{p.kg} kg</div>
                  <div className="pb-pct">{p.events} ev</div>
                </div>
              );
            })}
          </div>
          <div className="row-flex" style={{fontSize:11, padding:"10px 0 2px", borderTop:"1px solid var(--border)", marginTop:8}}>
            <span className="muted">Cumulative 80%: <b style={{color:"var(--text)"}}>Trim + Spillage + Out-of-spec</b> drive 75% of plant waste</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Trend — 14-day % of consumed</h3>
            <span className="muted" style={{fontSize:11}}>daily bucket · target {target}%</span>
          </div>
          <div style={{padding:"14px 4px 6px", position:"relative"}}>
            <Spark data={WASTE_TREND} color={trendColor} w={440} h={100} />
            <div style={{borderTop:"1px dashed var(--amber)", position:"absolute", left:4, right:4, top:"50%", opacity:0.5}}/>
            <div style={{position:"absolute", right:6, top:"46%", fontSize:10, color:"var(--amber)", background:"#fff", padding:"0 4px"}}>target {target}%</div>
          </div>
          <div className="row-flex" style={{fontSize:11, color:"var(--muted)", borderTop:"1px solid var(--border)", paddingTop:8, marginTop:6}}>
            <span>Min {Math.min(...WASTE_TREND)}% · Max {Math.max(...WASTE_TREND)}% · Avg {trendAvg}%</span>
            <span className="spacer"></span>
            <span>Last: <b style={{color: WASTE_TREND[WASTE_TREND.length-1] <= target ? "var(--green)" : "var(--amber)", fontFamily:"var(--font-mono)"}}>{WASTE_TREND[WASTE_TREND.length-1]}%</b></span>
          </div>
        </div>
      </div>

      {/* Waste by line */}
      <div className="card" style={{marginBottom:12}}>
        <div className="card-head">
          <h3 className="card-title">Waste by line — % of consumed</h3>
          <span className="muted" style={{fontSize:11}}>Target ≤ {target}% plant-wide · red if &gt; 2%</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th style={{textAlign:"right"}}>Consumed (kg)</th>
              <th style={{textAlign:"right"}}>Waste (kg)</th>
              <th style={{textAlign:"right"}}>% of consumed</th>
              <th>vs target</th>
              <th>Bar</th>
            </tr>
          </thead>
          <tbody>
            {WASTE_BY_LINE.map(r => {
              const over = r.pct > r.target;
              const way = r.pct > 2;
              const color = way ? "var(--red)" : over ? "var(--amber)" : "var(--green)";
              const barPct = Math.min(100, (r.pct / 4) * 100);
              return (
                <tr key={r.line}>
                  <td className="mono" style={{fontWeight:600}}>{r.line}</td>
                  <td className="num mono">{r.consumed.toLocaleString()}</td>
                  <td className="num mono">{r.waste.toFixed(1)}</td>
                  <td className="num mono" style={{fontWeight:700, color}}>{r.pct.toFixed(2)}%</td>
                  <td>
                    {way
                      ? <span className="badge badge-red" style={{fontSize:10}}>▲ {(r.pct - r.target).toFixed(2)} pp</span>
                      : over
                        ? <span className="badge badge-amber" style={{fontSize:10}}>▲ {(r.pct - r.target).toFixed(2)} pp</span>
                        : <span className="badge badge-green" style={{fontSize:10}}>▼ {(r.target - r.pct).toFixed(2)} pp</span>}
                  </td>
                  <td style={{width:160}}>
                    <div className="cell-bar" style={{width:140}}>
                      <span style={{width: barPct + "%", background: color}}></span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Waste events table */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Waste events ({filtered.length})</h3>
          <div className="row-flex">
            <select value={lineFilter} onChange={e => setLineFilter(e.target.value)} style={{width:140}}>
              <option value="all">All lines</option>
              {LINES.map(l => <option key={l.id} value={l.id}>{l.id}</option>)}
            </select>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{width:160}}>
              <option value="all">All categories</option>
              {WASTE_PARETO.map(p => <option key={p.cat} value={p.cat}>{p.cat}</option>)}
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Line</th>
              <th>WO</th>
              <th>Category</th>
              <th style={{textAlign:"right"}}>Qty (kg)</th>
              <th>Operator</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={i}>
                <td className="mono" style={{fontSize:11}}>{e.t}</td>
                <td className="mono">{e.line}</td>
                <td className="mono" style={{fontSize:11}}>{e.wo}</td>
                <td><span className="badge badge-amber" style={{fontSize:10}}>{e.cat}</span></td>
                <td className="num mono">{e.qty.toFixed(1)}</td>
                <td>{e.operator}</td>
                <td style={{maxWidth:260}}>{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-blue alert-box" style={{marginTop:12}}>
        <span>ℹ</span>
        <div>
          <b>Waste policy:</b> events are captured via the "Log waste" modal (dashboard quick-actions, line card, or WO detail). Each event must include category + reason. Pareto drives continuous-improvement focus — top 3 categories typically account for &gt;75% of plant waste.
        </div>
      </div>
    </>
  );
};

// ---------- Line Detail (PROD-013) ----------
const LineDetail = ({ lineId, onBack, onOpenWo, openModal }) => {
  const [tab, setTab] = React.useState("current_wo");
  const l = LINES.find(x => x.id === lineId) || LINES[0];
  const d = LINE_DETAIL;

  const statusClass = {
    running: ["var(--green)", "● RUNNING"],
    paused: ["var(--amber)", "❚❚ PAUSED"],
    down: ["var(--red)", "⚠ DOWN"],
    changeover: ["#a855f7", "⇄ CHANGEOVER"],
    idle: ["var(--gray-300)", "○ IDLE"],
  };
  const [rcolor, rtext] = statusClass[l.status] || statusClass.idle;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack} style={{cursor:"pointer"}}>Production</a> · <a onClick={onBack} style={{cursor:"pointer"}}>Lines</a> · {l.id}</div>
          <h1 className="page-title">{l.name}</h1>
          <div className="muted" style={{fontSize:12}}>
            Operator <b style={{color:"var(--text)"}}>{l.operator}</b> · Shift A (06:00–14:00) · Factory-A
          </div>
        </div>
        <div className="row-flex">
          {l.status === "running" && <button className="btn btn-secondary btn-sm" onClick={() => openModal("pauseLine", l)}>❚❚ Pause line</button>}
          {l.status === "down" && <button className="btn btn-primary btn-sm" onClick={() => openModal("resumeLine", l)}>▶ Resume line</button>}
          {l.wo && <button className="btn btn-secondary btn-sm" onClick={() => onOpenWo(l.wo)}>Open WO →</button>}
          <button className="btn btn-secondary btn-sm">⇪ Export shift</button>
        </div>
      </div>

      {/* Status ribbon */}
      <div className="status-ribbon" style={{background: rcolor + "14", color: rcolor, border:"1px solid " + rcolor}}>
        <span style={{fontWeight:700, letterSpacing:"0.06em"}}>{rtext}</span>
        <span className="spacer"></span>
        {l.status === "running" && <span>Active WO <b className="mono">{l.wo}</b> · Elapsed {l.elapsed} / {l.plannedTotal}</span>}
        {l.status === "down" && <span><b>{l.downReason}</b> · Since {l.downSince}</span>}
        {l.status === "changeover" && <span>{l.changeoverInfo}</span>}
        {l.status === "idle" && <span>No active WO · Next: <b className="mono">{l.nextWo}</b> in {l.nextIn}</span>}
      </div>

      {/* KPI strip */}
      <div className="kpi-row" style={{gridTemplateColumns:"repeat(5, 1fr)"}}>
        <div className="kpi">
          <div className="kpi-label">Active WO</div>
          <div className="kpi-value" style={{fontSize:16}}>{l.wo || "—"}</div>
          <div className="kpi-sub">{l.woItem}</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">OEE · today</div>
          <div className="kpi-value">{d.oee}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
          <div className="kpi-micro"><span>A <b>{d.oeeA}%</b></span><span>P <b>{d.oeeP}%</b></span><span>Q <b>{d.oeeQ}%</b></span></div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Output today</div>
          <div className="kpi-value mono">{d.todayOutput.toLocaleString()}</div>
          <div className="kpi-sub">/ {d.todayTarget.toLocaleString()} kg target</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">Yield (rolling 4h)</div>
          <div className="kpi-value">{l.yield.toFixed(1)}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
          <div>
            <Spark data={d.yieldRolling} color="var(--green)" w={120} h={20}/>
          </div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">Downtime · shift</div>
          <div className="kpi-value">{l.downtime}<span style={{fontSize:14, color:"var(--muted)"}}>m</span></div>
          <div className="kpi-sub">{d.downtimeEvents.length} events</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-bar">
        {[
          { k: "current_wo", label: "Current WO" },
          { k: "output", label: "Today's output" },
          { k: "yield", label: "Yield · rolling 4h" },
          { k: "downtime", label: "Downtime events", count: d.downtimeEvents.length },
          { k: "oee", label: "OEE breakdown" },
          { k: "shift_log", label: "Operator shift log" },
        ].map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={() => setTab(t.k)}>
            {t.label}
            {t.count ? <span className="count">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 340px", gap:12}}>
        {/* Tab content */}
        <div>
          {tab === "current_wo" && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Active work order — <span className="mono">{l.wo}</span></h3>
                <button className="btn btn-ghost btn-sm" onClick={() => onOpenWo(l.wo)}>Open full WO detail →</button>
              </div>
              <div style={{padding:10, background:"var(--gray-050)", borderRadius:6, fontSize:13, lineHeight:1.6}}>
                <div><b>Item:</b> <span className="mono">{l.woItem}</span> — {l.woName}</div>
                <div><b>Planned:</b> {l.planned} kg · <b>Consumed:</b> {l.consumed} kg ({((l.consumed / Math.max(1,l.planned)) * 100).toFixed(0)}%)</div>
                <div><b>Elapsed:</b> {l.elapsed} / {l.plannedTotal}</div>
                <div><b>Operator:</b> {l.operator} ({l.opInit})</div>
                <div><b>Started:</b> 06:12 · <b>Planned end:</b> 09:30</div>
              </div>
              <div className="progress green" style={{marginTop:12}}>
                <span style={{width: ((l.consumed / Math.max(1, l.planned)) * 100) + "%"}}></span>
              </div>
              {l.nextAllergen && (
                <div className="alert-amber alert-box" style={{marginTop:10, fontSize:12}}>
                  <span>⚠</span>
                  <div>Next WO <b>{l.nextWo}</b> has allergen change — dual sign-off required at handover.</div>
                </div>
              )}
            </div>
          )}

          {tab === "output" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Today's output</h3></div>
              <table>
                <thead><tr><th>Time</th><th>LP</th><th>Item</th><th style={{textAlign:"right"}}>Qty</th><th>QA</th></tr></thead>
                <tbody>
                  {[
                    { t: "07:12", lp: "LP-9001", item: "FA5100", qty: "120 kg", qa: "ok" },
                    { t: "07:44", lp: "LP-9002", item: "FA5100", qty: "148 kg", qa: "ok" },
                    { t: "08:02", lp: "LP-9003", item: "FA5100", qty: "132 kg", qa: "pending" },
                    { t: "08:18", lp: "LP-9004", item: "FA5100", qty: "164 kg", qa: "ok" },
                  ].map((r, i) => (
                    <tr key={i}>
                      <td className="mono" style={{fontSize:11}}>{r.t}</td>
                      <td className="mono">{r.lp}</td>
                      <td className="mono">{r.item}</td>
                      <td className="num mono">{r.qty}</td>
                      <td>
                        {r.qa === "ok"
                          ? <span className="badge badge-green" style={{fontSize:10}}>✓ Released</span>
                          : <span className="badge badge-amber" style={{fontSize:10}}>Pending sample</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "yield" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Yield — rolling 4h hourly buckets</h3></div>
              <div style={{padding:"18px 4px"}}>
                <Spark data={d.yieldRolling} color="var(--green)" w={640} h={120}/>
              </div>
              <div className="row-flex" style={{fontSize:11, color:"var(--muted)", borderTop:"1px solid var(--border)", paddingTop:8}}>
                <span>Min {Math.min(...d.yieldRolling)}% · Max {Math.max(...d.yieldRolling)}% · Avg {(d.yieldRolling.reduce((a,v)=>a+v,0)/d.yieldRolling.length).toFixed(1)}%</span>
                <span className="spacer"></span>
                <span>Target ≥ 94%</span>
              </div>
            </div>
          )}

          {tab === "downtime" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Downtime events — this shift</h3></div>
              {d.downtimeEvents.length === 0
                ? <div style={{padding:20, textAlign:"center", color:"var(--muted)"}}>No downtime events recorded</div>
                : (
                  <table>
                    <thead><tr><th>Started</th><th>Category</th><th>Reason</th><th style={{textAlign:"right"}}>Duration</th></tr></thead>
                    <tbody>
                      {d.downtimeEvents.map((e, i) => (
                        <tr key={i}>
                          <td className="mono" style={{fontSize:11}}>{e.t}</td>
                          <td><span className="badge badge-amber" style={{fontSize:10}}>{e.cat}</span></td>
                          <td>{e.reason}</td>
                          <td className="num mono">{e.duration} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          )}

          {tab === "oee" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">OEE breakdown — A × P × Q</h3></div>
              <div className="oee-gauges" style={{margin:12, gridTemplateColumns:"repeat(4, 1fr)"}}>
                <div className="gauge-card primary">
                  <div className="gauge-label">Line OEE</div>
                  <div className="gauge-ring"><GaugeRing pct={d.oee} color="var(--blue)" /></div>
                  <div className="gauge-formula">A × P × Q</div>
                  <div className="gauge-target">Target 80%</div>
                </div>
                <div className="gauge-card green">
                  <div className="gauge-label">Availability</div>
                  <div className="gauge-ring"><GaugeRing pct={d.oeeA} color="var(--green)" /></div>
                  <div className="gauge-formula">(Planned − Stops)/Planned</div>
                </div>
                <div className="gauge-card amber">
                  <div className="gauge-label">Performance</div>
                  <div className="gauge-ring"><GaugeRing pct={d.oeeP} color="var(--amber)" /></div>
                  <div className="gauge-formula">(Produced × Cycle)/Runtime</div>
                </div>
                <div className="gauge-card green">
                  <div className="gauge-label">Quality</div>
                  <div className="gauge-ring"><GaugeRing pct={d.oeeQ} color="var(--green)" /></div>
                  <div className="gauge-formula">Good / Produced</div>
                </div>
              </div>
            </div>
          )}

          {tab === "shift_log" && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Operator shift log</h3></div>
              <div>
                {d.shiftLog.map((e, i) => (
                  <div key={i} className="tl-item">
                    <span className="tl-dot blue"></span>
                    <div>
                      <div>{e.event}</div>
                      <div className="tl-sub">by {e.actor}</div>
                    </div>
                    <div className="tl-time">{e.t}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live event stream sidebar */}
        <div>
          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Live event stream</h3>
              <span className="refresh-bar"><span className="refresh-dot"></span><span style={{fontSize:11}}>Live</span></span>
            </div>
            <div>
              {d.events.map((e, i) => (
                <div key={i} className="tl-item">
                  <span className={"tl-dot " + (e.kind === "info" ? "blue" : e.kind)}></span>
                  <div>
                    <div style={{fontSize:12}}>{e.desc}</div>
                    <div className="tl-sub">{e.sub}</div>
                  </div>
                  <div className="tl-time">{e.t}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Line health</h3></div>
            <div style={{fontSize:12}}>
              <div className="row-flex" style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><span>Waste %</span><span className="spacer"></span><span className="mono" style={{color:"var(--green)"}}>{l.waste.toFixed(1)}%</span></div>
              <div className="row-flex" style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><span>Yield %</span><span className="spacer"></span><span className="mono" style={{color:"var(--green)"}}>{l.yield.toFixed(1)}%</span></div>
              <div className="row-flex" style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><span>Downtime (min)</span><span className="spacer"></span><span className="mono">{l.downtime}</span></div>
              <div className="row-flex" style={{padding:"6px 0"}}><span>Next WO</span><span className="spacer"></span><span className="mono">{l.nextWo}</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { WasteAnalyticsScreen, LineDetail });
