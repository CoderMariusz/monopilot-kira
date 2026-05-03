// ============ OEE Daily Summary (OEE-003) — hero dashboard ============
// Route: /oee/summary
// Default date: yesterday (OQ-OEE-10). Tabs: OEE Summary / Six Big Losses / Changeover Analysis.

const OeeSummary = ({ role, onNav, openModal, onPickLine, initialTab }) => {
  const [date, setDate] = React.useState("2026-04-20"); // default yesterday
  const [lineFilter, setLineFilter] = React.useState("all");
  // Fix-2 audit §B drift: `initialTab` lets the old `losses` route deep-link into the
  // Six Big Losses tab within the canonical summary screen (PRD §4.1 #9).
  const [tab, setTab] = React.useState(initialTab || "summary"); // summary | losses | changeover
  const [sort, setSort] = React.useState({ col: "oee", dir: "desc" });

  const kpis = SUMMARY_KPIS_TODAY;
  const stale = false;

  const lines = OEE_LINES_META.filter(l => lineFilter === "all" || l.id === lineFilter);

  const sorted = [...lines].sort((a, b) => {
    const va = OEE_TODAY[a.id][sort.col] ?? -1;
    const vb = OEE_TODAY[b.id][sort.col] ?? -1;
    return sort.dir === "asc" ? va - vb : vb - va;
  });

  const toggleSort = (col) => setSort(s => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });

  // Factory averages for table footer
  const avgRow = {
    oee: (sorted.reduce((a,l) => a + (OEE_TODAY[l.id].oee || 0), 0) / Math.max(1, sorted.length)),
    a:   (sorted.reduce((a,l) => a + (OEE_TODAY[l.id].a   || 0), 0) / Math.max(1, sorted.length)),
    p:   (sorted.reduce((a,l) => a + (OEE_TODAY[l.id].p   || 0), 0) / Math.max(1, sorted.length)),
    q:   (sorted.reduce((a,l) => a + (OEE_TODAY[l.id].q   || 0), 0) / Math.max(1, sorted.length)),
    output: sorted.reduce((a,l) => a + (OEE_TODAY[l.id].output   || 0), 0),
    downtime: sorted.reduce((a,l) => a + (OEE_TODAY[l.id].downtime|| 0), 0),
  };

  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Daily Summary</>}
        title="OEE — Daily Summary"
        subtitle={`${date} · Apex Factory-A · target ${SUMMARY_KPIS_TODAY.target}% · world-class ${SUMMARY_KPIS_TODAY.worldClass}%`}
        right={<>
          <div className="oee-filter-bar">
            <button className="btn btn-ghost btn-sm" onClick={() => setDate("2026-04-21")}>Today</button>
            <button className="btn btn-ghost btn-sm on" onClick={() => setDate("2026-04-20")}>Yesterday</button>
            <div className="pills">
              <button className="pill">◀</button>
              <button className="pill on">{date}</button>
              <button className="pill">▶</button>
            </div>
            <select value={lineFilter} onChange={e => setLineFilter(e.target.value)} style={{width:150}}>
              <option value="all">All Lines</option>
              {OEE_LINES_META.map(l => <option key={l.id} value={l.id}>{l.id} {l.name}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_daily_summary", date, line: lineFilter })}>⇪ Export</button>
        </>}
      />

      <Freshness lastAgg="14:32:05" stale={stale} />

      {/* KPI row — five cards */}
      <div className="oee-kpi-row">
        <div className={`kpi ${oeeStatus(kpis.factoryOEE).cls}`} onClick={() => document.querySelector(".oee-summary-table")?.scrollIntoView()}>
          <div className="kpi-label">Factory OEE</div>
          <div className="kpi-value">{kpis.factoryOEE.toFixed(1)}<span style={{fontSize:14,color:"var(--muted)"}}>%</span></div>
          <div className="kpi-micro">
            <span>A <b>{kpis.factoryA}%</b></span>
            <span>P <b>{kpis.factoryP}%</b></span>
            <span>Q <b>{kpis.factoryQ}%</b></span>
          </div>
          <div className="kpi-sub">{kpis.linesActive} lines · {kpis.shiftsCompleted} shifts completed</div>
        </div>
        <div className="kpi green" onClick={() => onPickLine(kpis.bestLine)}>
          <div className="kpi-label">Best line</div>
          <div className="kpi-value mono" style={{fontSize:18, marginTop:4}}>{kpis.bestLine}</div>
          <div className="kpi-change up">▲ {kpis.bestLineOEE.toFixed(1)}% OEE</div>
          <div className="kpi-sub">Best shift: {kpis.bestLineShift} · {kpis.bestLineShiftOEE}%</div>
        </div>
        <div className="kpi red" onClick={() => onPickLine(kpis.worstLine)}>
          <div className="kpi-label">Worst line</div>
          <div className="kpi-value mono" style={{fontSize:18, marginTop:4}}>{kpis.worstLine}</div>
          <div className="kpi-change down">▼ {kpis.worstLineOEE.toFixed(1)}% OEE</div>
          <div className="kpi-sub">Worst shift: {kpis.worstLineShift} · {kpis.worstLineShiftOEE}%</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total output</div>
          <div className="kpi-value mono">{kpis.totalOutput.toLocaleString()} <span style={{fontSize:13,color:"var(--muted)"}}>kg</span></div>
          <div className="kpi-sub">All lines combined</div>
        </div>
        <div className="kpi amber" onClick={() => window.alert("Cross-link → /production/downtime?date=" + date)}>
          <div className="kpi-label">Total downtime</div>
          <div className="kpi-value mono">{Math.floor(kpis.totalDowntime / 60)}h {kpis.totalDowntime % 60}m</div>
          <div className="kpi-sub">Click to view causes in Production →</div>
        </div>
      </div>

      {/* Alerts */}
      <div className="alert-red alert-box" style={{marginBottom:8}}>
        <strong>LINE-02 below world-class for 3 consecutive days</strong>
        <span className="muted">· Availability trending down (−8.2 pp today)</span>
        <div className="alert-cta">
          <button className="btn btn-sm btn-secondary" onClick={() => onPickLine("LINE-02")}>Drill in →</button>
          <button className="btn btn-sm btn-secondary" onClick={() => setTab("losses")}>View losses</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-bar" style={{marginTop:8}}>
        <button className={"tab-btn " + (tab === "summary" ? "on" : "")} onClick={() => setTab("summary")}>OEE Summary</button>
        <button className={"tab-btn " + (tab === "losses" ? "on" : "")} onClick={() => setTab("losses")}>
          Six Big Losses <span className="count">6</span>
        </button>
        <button className={"tab-btn " + (tab === "changeover" ? "on" : "")} onClick={() => setTab("changeover")}>
          Changeover Analysis <span className="count">{CHANGEOVER_EVENTS.length}</span>
        </button>
      </div>

      {tab === "summary" && (
        <div className="card oee-summary-table">
          <div className="card-head">
            <h3 className="card-title">OEE by line — {date}</h3>
            <span className="muted" style={{fontSize:11}}>
              A/P/Q thresholds: A ≥{OEE_THRESHOLDS.tenant.aMin}% · P ≥{OEE_THRESHOLDS.tenant.pMin}% · Q ≥{OEE_THRESHOLDS.tenant.qMin}% · Click line to drill in
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th style={{cursor:"pointer"}} onClick={() => toggleSort("oee")}>OEE %{sort.col==="oee" && (sort.dir==="desc"?" ▼":" ▲")}</th>
                <th style={{cursor:"pointer"}} onClick={() => toggleSort("a")}>A %</th>
                <th style={{cursor:"pointer"}} onClick={() => toggleSort("p")}>P %</th>
                <th style={{cursor:"pointer"}} onClick={() => toggleSort("q")}>Q %</th>
                <th>Best shift</th>
                <th>Worst shift</th>
                <th>Top downtime</th>
                <th style={{textAlign:"right"}}>Output (kg)</th>
                <th>7-day trend</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(l => {
                const d = OEE_TODAY[l.id];
                const s = oeeStatus(d.oee);
                const sparkColor = s.color;
                return (
                  <tr key={l.id} style={{cursor:"pointer"}} onClick={() => onPickLine(l.id)}>
                    <td>
                      <div className="mono" style={{fontWeight:700}}>{l.id}</div>
                      <div className="muted" style={{fontSize:11}}>{l.name}</div>
                    </td>
                    <td>
                      <div className="oee-cell" style={{background: heatColor(d.oee)}}>
                        <b>{d.oee == null ? "—" : d.oee.toFixed(1)}%</b>
                      </div>
                    </td>
                    <td><CompBadge v={d.a} min={OEE_THRESHOLDS.tenant.aMin}/></td>
                    <td><CompBadge v={d.p} min={OEE_THRESHOLDS.tenant.pMin}/></td>
                    <td><CompBadge v={d.q} min={OEE_THRESHOLDS.tenant.qMin}/></td>
                    <td><span className="mono" style={{fontSize:11}}>{d.bestShift}</span> <span className="muted" style={{fontSize:10}}>({d.bestOee}%)</span></td>
                    <td><span className="mono" style={{fontSize:11}}>{d.worstShift}</span> <span className="muted" style={{fontSize:10}}>({d.worstOee != null ? d.worstOee+"%" : "—"})</span></td>
                    <td style={{fontSize:11}}>{d.topDowntime}</td>
                    <td className="num mono">{d.output.toLocaleString()}</td>
                    <td><Spark data={SPARK_7D[l.id]} color={sparkColor} w={90} h={26} target={kpis.target} showTarget/></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={(e) => {e.stopPropagation(); onPickLine(l.id);}}>→</button>
                    </td>
                  </tr>
                );
              })}
              <tr style={{borderTop: "2px solid var(--border)", fontWeight:600, background:"var(--gray-050)"}}>
                <td>Factory avg</td>
                <td className="mono">{avgRow.oee.toFixed(1)}%</td>
                <td className="mono">{avgRow.a.toFixed(1)}%</td>
                <td className="mono">{avgRow.p.toFixed(1)}%</td>
                <td className="mono">{avgRow.q.toFixed(1)}%</td>
                <td colSpan="3" className="muted" style={{fontSize:11}}>Weighted across lines</td>
                <td className="num mono">{avgRow.output.toLocaleString()}</td>
                <td colSpan="2" className="muted" style={{fontSize:11}}>{avgRow.downtime} min downtime</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "losses" && <SixBigLossesTab date={date} role={role} openModal={openModal}/>}
      {tab === "changeover" && <ChangeoverTab date={date} openModal={openModal}/>}

      <div className="oee-action-bar">
        <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_daily_summary", date })}>⇪ Export CSV</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_daily_summary", date, format: "pdf" })}>⇪ Export PDF</button>
        <button className="btn btn-ghost btn-sm" onClick={() => openModal("copyClipboard", { date })}>Copy to clipboard</button>
        <span className="spacer"></span>
        <span className="muted" style={{fontSize:11}}>Source: <span className="mono">oee_daily_summary</span> MV · refresh every 15 min · P95 &lt; 200ms</span>
      </div>
    </>
  );
};

// ============ Tab 2: Six Big Losses ============
const SixBigLossesTab = ({ date, role, openModal }) => {
  const total = SIX_BIG_LOSSES.reduce((a, l) => a + l.mins, 0);
  const max = Math.max(...SIX_BIG_LOSSES.map(l => l.mins));

  const aLoss = SIX_BIG_LOSSES.filter(l => l.impact === "A").reduce((a, l) => a + l.mins, 0);
  const pLoss = SIX_BIG_LOSSES.filter(l => l.impact === "P").reduce((a, l) => a + l.mins, 0);
  const qLoss = SIX_BIG_LOSSES.filter(l => l.impact === "Q").reduce((a, l) => a + l.mins, 0);

  const aPP = ((aLoss / (8 * 60 * 4)) * 100).toFixed(1);
  const pPP = ((pLoss / (8 * 60 * 4)) * 100).toFixed(1);
  const qPP = ((qLoss / (8 * 60 * 4)) * 100).toFixed(1);

  return (
    <>
      <div className="grid-2 oee-losses-grid">
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Six Big Losses — minutes breakdown</h3>
            <span className="muted" style={{fontSize:11}}>{total} min total · {date}</span>
          </div>
          <div style={{padding:"4px 0"}}>
            {SIX_BIG_LOSSES.map((l, i) => (
              <div key={i} className="pareto-bar" style={{gridTemplateColumns: "200px 1fr 80px 80px"}}>
                <div className="pb-label">
                  <span className={"badge badge-" + (l.class === "plant" ? "red" : l.class === "process" ? "amber" : "blue")} style={{fontSize:9, marginRight:6}}>{l.impact}</span>
                  {l.label}
                </div>
                <div className="pb-track"><div className={"pb-fill " + l.class} style={{width: (l.mins/max*100) + "%"}}></div></div>
                <div className="pb-val">{l.mins} min</div>
                <div className="pb-pct">{l.pct}% · {l.events} ev</div>
              </div>
            ))}
          </div>
          <div className="row-flex" style={{fontSize:11, padding:"10px 0 2px", borderTop:"1px solid var(--border)", marginTop:8}}>
            <span className="row-flex"><span className="legend-sq red"></span>Plant</span>
            <span className="row-flex"><span className="legend-sq amber"></span>Process</span>
            <span className="row-flex"><span className="legend-sq blue"></span>People</span>
            <span className="spacer"></span>
            <span className="muted">Lean class · Nakajima TPM</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3 className="card-title">OEE impact decomposition</h3></div>
          <pre className="oee-calc-block">
{`OEE impact — today ${date}

  Availability (A) loss: ${aPP}pp   ← Equipment Failure + Setup
  Performance  (P) loss: ${pPP}pp   ← Idling + Reduced Speed
  Quality      (Q) loss: ${qPP}pp   ← Defects + Startup Rejects
                        ─────────
  Total OEE loss:        ${(parseFloat(aPP)+parseFloat(pPP)+parseFloat(qPP)).toFixed(1)}pp
  OEE achieved:          ${(100-parseFloat(aPP)-parseFloat(pPP)-parseFloat(qPP)).toFixed(1)}% (target 85%)`}
          </pre>
          <div className="alert-blue alert-box" style={{marginTop:10, fontSize:12}}>
            <span>ⓘ</span>
            <div>
              Mapping from raw <span className="mono">downtime_categories</span> to Six Big Losses
              is admin-configurable in <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={() => openModal("bigLossMapping")}>OEE Settings → Big Loss Mapping</a>.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{marginTop: 10}}>
        <div className="card-head">
          <h3 className="card-title">Downtime events — annotate & classify</h3>
          <span className="muted" style={{fontSize:11}}>
            {role === "Operator" && "Annotate reason notes within 1h post-event. "}
            {(role === "Shift Supervisor" || role === "Admin") && "Supervisors can override category (audit-logged). "}
            Events from <span className="mono">08-PRODUCTION downtime_events</span>.
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Started</th><th>Line</th><th>Machine</th><th>Category</th>
              <th>Big Loss</th><th>WO</th><th>Reason</th><th>Reason notes</th>
              <th style={{textAlign:"right"}}>Duration</th><th></th>
            </tr>
          </thead>
          <tbody>
            {OEE_DOWNTIME_EVENTS.map(e => (
              <tr key={e.id}>
                <td className="mono" style={{fontSize:11}}>{e.t}</td>
                <td className="mono" style={{fontWeight:600}}>{e.line}</td>
                <td className="mono" style={{fontSize:11}}>{e.machine}</td>
                <td><span className={"badge badge-" + (e.group === "plant" ? "red" : e.group === "process" ? "amber" : "blue")} style={{fontSize:10}}>{e.cat}</span></td>
                <td style={{fontSize:11}}>{e.bigLoss}</td>
                <td className="mono" style={{fontSize:11}}>{e.wo}</td>
                <td style={{fontSize:11, maxWidth:220}}>{e.reason}</td>
                <td style={{fontSize:11, color:"var(--muted)"}}>
                  {e.notes || <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={() => openModal("annotateDowntime", e)}>[Add note]</a>}
                </td>
                <td className="num mono">{e.duration} min</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal("annotateDowntime", e)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ Tab 3: Changeover Analysis ============
const ChangeoverTab = ({ date, openModal }) => {
  const total = CHANGEOVER_EVENTS.reduce((a, c) => a + c.duration, 0);
  const avg  = total / CHANGEOVER_EVENTS.length;
  const overTarget = CHANGEOVER_EVENTS.filter(c => c.variance > 0).length;

  return (
    <>
      <div className="oee-kpi-row grid-4">
        <div className={`kpi ${total > 240 ? "red" : "amber"}`}>
          <div className="kpi-label">Total changeover</div>
          <div className="kpi-value">{Math.floor(total/60)}h {total%60}m</div>
          <div className="kpi-sub">{CHANGEOVER_EVENTS.length} events · {overTarget} over target</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg duration</div>
          <div className="kpi-value">{avg.toFixed(0)} min</div>
          <div className="kpi-change down">▼ +8 min vs 7-day avg</div>
        </div>
        <div className="kpi red">
          <div className="kpi-label">High-allergen COs</div>
          <div className="kpi-value">{CHANGEOVER_EVENTS.filter(c => c.allergen === "High").length}</div>
          <div className="kpi-sub">Two-person sign-off required</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">Longest today</div>
          <div className="kpi-value">{Math.max(...CHANGEOVER_EVENTS.map(c => c.duration))} min</div>
          <div className="kpi-sub">LINE-02 allergen — WO-2026-0031</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Changeover events — {date}</h3>
          <span className="muted" style={{fontSize:11}}>Target durations sourced from <span className="mono">02-SETTINGS changeover_target_duration_min</span></span>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Line</th><th>WO from</th><th>WO to</th><th>Started</th>
              <th style={{textAlign:"right"}}>Duration</th><th style={{textAlign:"right"}}>Target</th>
              <th>Variance</th><th>Allergen risk</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {CHANGEOVER_EVENTS.map(c => (
              <tr key={c.id}>
                <td className="mono" style={{fontSize:11, fontWeight:600}}>{c.id}</td>
                <td className="mono" style={{fontWeight:600}}>{c.line}</td>
                <td className="mono" style={{fontSize:11}}>{c.woFrom || "—"}</td>
                <td className="mono" style={{fontSize:11}}>{c.woTo}</td>
                <td className="mono" style={{fontSize:11}}>{c.start}</td>
                <td className="num mono">{c.duration} min</td>
                <td className="num mono">{c.target} min</td>
                <td>
                  <span className={"badge badge-" + (c.variance > 0 ? "amber" : c.variance === 0 ? "gray" : "green")} style={{fontSize:10}}>
                    {c.variance > 0 ? "+" : ""}{c.variance} min
                  </span>
                </td>
                <td>
                  <span className={"badge badge-" + (c.allergen === "High" ? "red" : c.allergen === "Medium" ? "amber" : "green")} style={{fontSize:10}}>
                    {c.allergen}
                  </span>
                </td>
                <td><span className="badge badge-green" style={{fontSize:10}}>{c.status}</span></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => openModal("changeoverDetail", c)}>View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-blue alert-box" style={{marginTop:10}}>
        <span>ⓘ</span>
        <div>
          Changeover <b>records</b> are owned by <span className="mono">08-PRODUCTION /production/changeover/:event_id</span>.
          Target durations are configured per line in <span className="mono">02-SETTINGS</span>.
          Allergen matrix is managed by 02-SETTINGS + 13-MAINTENANCE cleaning procedures.
        </div>
      </div>
    </>
  );
};

Object.assign(window, { OeeSummary, SixBigLossesTab, ChangeoverTab });
