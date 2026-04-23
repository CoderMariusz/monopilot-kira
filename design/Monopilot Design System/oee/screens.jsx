// ============ OEE screens — line trend, heatmap, pareto, A/P/Q drill-ins, settings ============

// ============ OEE-001 — Per-line trend dashboard ============
const OeeLineTrend = ({ role, onNav, openModal, lineId, setLineId }) => {
  const [windowVal, setWindow] = React.useState("24h");
  const [shift, setShift] = React.useState("all");
  const [hlAll, setHlAll] = React.useState(false);

  const line = OEE_LINES_META.find(l => l.id === lineId) || OEE_LINES_META[0];
  const d = OEE_TODAY[line.id];
  const trend = OEE_TREND[line.id];
  const shifts = OEE_SHIFT_TODAY[line.id] || [];
  const top = OEE_DOWNTIME_TOP[line.id] || [];
  const latestCO = CHANGEOVER_EVENTS.find(c => c.line === line.id);
  const stale = false;
  const status = oeeStatus(d.oee);

  const dtMax = Math.max(...top.map(t => t.mins), 1);

  // For trend chart: downtime band for LINE-02 10:22 jam, changeover marker for LINE-04 09:14
  const bands = line.id === "LINE-02" ? [{start: 10, end: 13}] : [];
  const changeovers = line.id === "LINE-04" ? [{hour: 9, label: "Allergen CO · 56 min"}] : (line.id === "LINE-01" ? [{hour: 14, label: "Casing Ø26→Ø32 · 35 min"}] : []);

  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · <a onClick={() => onNav("line")}>Line Trend</a> · {line.id}</>}
        title={`${line.id} — ${line.name}`}
        subtitle={`Current WO: ${line.wo || "—"} · ${line.currentProduct} · target ${SUMMARY_KPIS_TODAY.target}% · world-class 85%`}
        right={<>
          <select value={line.id} onChange={e => setLineId(e.target.value)} style={{width:180}}>
            {OEE_LINES_META.map(l => <option key={l.id} value={l.id}>{l.id} · {l.name}</option>)}
          </select>
          <div className="pills">
            {["1h", "6h", "24h"].map(w => (
              <button key={w} className={"pill " + (windowVal === w ? "on" : "")} onClick={() => setWindow(w)}>{w}</button>
            ))}
          </div>
          <select value={shift} onChange={e => setShift(e.target.value)} style={{width:120}}>
            <option value="all">All shifts</option>
            <option value="AM">AM (00–08)</option>
            <option value="PM">PM (08–16)</option>
            <option value="Night">Night (16–00)</option>
          </select>
          <button className="btn btn-ghost btn-sm">↻ Refresh</button>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_line_trend", line: line.id, window: windowVal })}>⇪ Export</button>
        </>}
      />

      <Freshness stale={stale}/>

      {line.id === "LINE-02" && (
        <div className="alert-red alert-box" style={{marginBottom:10}}>
          <strong>Mixer M-002 auger jam at 10:22 — 78 min downtime</strong>
          <span className="muted">· Line resumed 11:40 · WO-2026-0038 impacted · Maintenance notified</span>
          <div className="alert-cta">
            <button className="btn btn-sm btn-secondary" onClick={() => openModal("annotateDowntime", OEE_DOWNTIME_EVENTS[0])}>Annotate →</button>
            <button className="btn btn-sm btn-secondary" onClick={() => window.alert("Cross-link → /production/downtime?line=LINE-02&date=2026-04-20")}>View in Production →</button>
          </div>
        </div>
      )}

      {/* Four-gauge header */}
      <div className="oee-gauge-row" onMouseEnter={() => setHlAll(true)} onMouseLeave={() => setHlAll(false)}>
        <div className="card gauge-card-oee">
          <ArcGauge pct={d.a}   color="#3b82f6" label="Availability"  target={OEE_THRESHOLDS.tenant.aMin} delta={d.deltaA}   deltaDir={d.deltaA > 0 ? "up" : "down"} highlighted={hlAll}/>
          <div className="gauge-sub">
            <span className="muted">Formula:</span> <span className="mono">(Planned − Downtime) / Planned</span>
          </div>
        </div>
        <div className="card gauge-card-oee">
          <ArcGauge pct={d.p}   color="#22c55e" label="Performance"   target={OEE_THRESHOLDS.tenant.pMin} delta={d.deltaP}   deltaDir={d.deltaP > 0 ? "up" : "down"} highlighted={hlAll}/>
          <div className="gauge-sub">
            <span className="muted">Formula:</span> <span className="mono">(Output × Ideal Cycle) / Runtime</span>
          </div>
        </div>
        <div className="card gauge-card-oee">
          <ArcGauge pct={d.q}   color="#f59e0b" label="Quality"       target={OEE_THRESHOLDS.tenant.qMin} delta={d.deltaQ}   deltaDir={d.deltaQ > 0 ? "up" : "down"} highlighted={hlAll}/>
          <div className="gauge-sub">
            <span className="muted">Formula:</span> <span className="mono">Good / Total Output</span>
          </div>
        </div>
        <div className="card gauge-card-oee primary">
          <ArcGauge pct={d.oee} color={status.color} label="OEE"      target={SUMMARY_KPIS_TODAY.target}  delta={d.deltaOEE} deltaDir={d.deltaOEE > 0 ? "up" : "down"} highlighted={hlAll}/>
          <div style={{textAlign:"center", marginTop:4}}>
            <OEEBadge v={d.oee}/>
          </div>
        </div>
        <div className="card shift-summary">
          <div className="card-title" style={{fontSize:12, marginBottom:8}}>Today by shift</div>
          {shifts.map(s => {
            const ss = oeeStatus(s.oee);
            return (
              <div key={s.shift} className="shift-row">
                <span className="mono" style={{fontWeight:600}}>{s.shift}</span>
                <span className={"badge badge-" + ss.cls} style={{fontSize:10}}>
                  {s.oee != null ? s.oee.toFixed(1) + "%" : "—"}
                </span>
                <Spark
                  data={trend.filter((_, i) => s.shift === "AM" ? i < 8 : s.shift === "PM" ? (i >= 8 && i < 16) : i >= 16).map(p => p.oee)}
                  color={ss.color} w={70} h={18}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend chart */}
      <div className="card" style={{marginTop:10}}>
        <div className="card-head">
          <h3 className="card-title">OEE Trend — {line.id} · {windowVal} window</h3>
          <div className="row-flex">
            <div className="pills">
              {["1h", "6h", "24h"].map(w => (
                <button key={w} className={"pill " + (windowVal === w ? "on" : "")} onClick={() => setWindow(w)}>{w}</button>
              ))}
            </div>
          </div>
        </div>
        <TrendChart data={trend} target={SUMMARY_KPIS_TODAY.target} worldClass={SUMMARY_KPIS_TODAY.worldClass} showDowntime={bands} showChangeover={changeovers}/>
      </div>

      {/* Bottom row — top downtime + changeover summary */}
      <div className="grid-2" style={{marginTop:10}}>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Top Downtime Causes — last 24h</h3>
            <a style={{fontSize:11, color:"var(--blue)", cursor:"pointer"}} onClick={() => window.alert("Cross-link → /production/downtime?line=" + line.id)}>
              View in Production →
            </a>
          </div>
          {top.length === 0 ? (
            <div className="alert-green alert-box">
              <span>✓</span><div>No downtime recorded in this window — line running to plan.</div>
            </div>
          ) : (
            <div style={{padding:"4px 0"}}>
              {top.map((t, i) => (
                <div key={i} className="pareto-bar" style={{gridTemplateColumns: "1fr 1fr 80px 70px"}}>
                  <div className="pb-label">
                    <span className={"badge badge-" + (t.group === "plant" ? "red" : t.group === "process" ? "amber" : "blue")} style={{fontSize:9, marginRight:6}}>{t.classLabel}</span>
                    {t.cat}
                  </div>
                  <div className="pb-track"><div className={"pb-fill " + t.group} style={{width: (t.mins/dtMax*100) + "%"}}></div></div>
                  <div className="pb-val">{t.mins} min</div>
                  <div className="pb-pct">{t.events} ev</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Changeover summary</h3>
            {latestCO && <span className="muted" style={{fontSize:11}}>Last: {latestCO.start}</span>}
          </div>
          {latestCO ? (
            <div style={{padding:"6px 0"}}>
              <div className="row-flex" style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                <span>Actual duration</span>
                <span className="spacer"></span>
                <span className="mono" style={{fontWeight:600}}>{latestCO.duration} min</span>
              </div>
              <div className="row-flex" style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                <span>Target</span>
                <span className="spacer"></span>
                <span className="mono">{latestCO.target} min</span>
              </div>
              <div className="row-flex" style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                <span>Variance</span>
                <span className="spacer"></span>
                <span className={"badge badge-" + (latestCO.variance > 0 ? "amber" : "green")} style={{fontSize:10}}>
                  {latestCO.variance > 0 ? "+" : ""}{latestCO.variance} min
                </span>
              </div>
              <div className="row-flex" style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                <span>Allergen risk</span>
                <span className="spacer"></span>
                <span className={"badge badge-" + (latestCO.allergen === "High" ? "red" : latestCO.allergen === "Medium" ? "amber" : "green")} style={{fontSize:10}}>
                  {latestCO.allergen} risk
                </span>
              </div>
              <div className="row-flex" style={{padding:"8px 0"}}>
                <span>WO transition</span>
                <span className="spacer"></span>
                <span className="mono" style={{fontSize:11}}>{latestCO.woFrom || "—"} → {latestCO.woTo}</span>
              </div>
              <div style={{marginTop:10}}>
                <button className="btn btn-secondary btn-sm" onClick={() => openModal("changeoverDetail", latestCO)}>View full record →</button>
              </div>
            </div>
          ) : (
            <div className="muted" style={{padding:10, fontSize:12}}>No changeover in this period.</div>
          )}
        </div>
      </div>

      <div className="oee-action-bar">
        <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_line_trend", line: line.id, window: windowVal })}>⇪ Export CSV</button>
        <button className="btn btn-secondary btn-sm">⇪ Export PDF</button>
        <button className="btn btn-ghost btn-sm" onClick={() => window.alert("Cross-link → /production/lines/" + line.id)}>View in 08-PRODUCTION →</button>
        <span className="spacer"></span>
        <span className="muted" style={{fontSize:11}}>Data source <span className="mono">oee_snapshots</span> · per-minute aggregate · P95 &lt; 400ms</span>
      </div>
    </>
  );
};

// ============ OEE-002 — Shift Heatmap ============
const OeeHeatmap = ({ onNav, openModal, onPickLine }) => {
  const [week] = React.useState("W/E 20/04/2026");
  const [lineFilter, setLineFilter] = React.useState("all");
  const [selected, setSelected] = React.useState({ line: "LINE-02", day: "sat", shift: "Night" });

  const visibleLines = lineFilter === "all" ? OEE_LINES_META : OEE_LINES_META.filter(l => l.id === lineFilter);

  const cell = HEATMAP[selected.line]?.[selected.day]?.[selected.shift];
  const dayLabel = HEATMAP_DAYS.find(d => d.k === selected.day)?.label;

  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Shift Heatmap</>}
        title="Shift OEE Heatmap"
        subtitle={`${week} · 7 days × 3 shifts × ${visibleLines.length} lines · cell colour: red <65%, amber 65–85%, green ≥85%`}
        right={<>
          <div className="pills">
            <button className="pill">◀</button>
            <button className="pill on">{week}</button>
            <button className="pill">▶</button>
          </div>
          <select value={lineFilter} onChange={e => setLineFilter(e.target.value)} style={{width:150}}>
            <option value="all">All lines</option>
            {OEE_LINES_META.map(l => <option key={l.id} value={l.id}>{l.id} {l.name}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_heatmap", week })}>⇪ Export</button>
        </>}
      />

      <Freshness lastAgg="14:30:05"/>

      {/* Weekly KPI row */}
      <div className="oee-kpi-row">
        <div className={`kpi ${oeeStatus(WEEK_KPIS.factoryOEE).cls}`}>
          <div className="kpi-label">Factory OEE — week avg</div>
          <div className="kpi-value">{WEEK_KPIS.factoryOEE}<span style={{fontSize:14, color:"var(--muted)"}}>%</span></div>
          <div className="kpi-sub">{WEEK_KPIS.totalLineShifts} line-shifts · {WEEK_KPIS.daysCovered} days</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">Best line (week)</div>
          <div className="kpi-value mono" style={{fontSize:18, marginTop:4}}>{WEEK_KPIS.bestLine}</div>
          <div className="kpi-change up">▲ {WEEK_KPIS.bestLineOEE}% avg</div>
          <div className="kpi-sub">Best shift: AM · 91.2%</div>
        </div>
        <div className="kpi red">
          <div className="kpi-label">Worst line (week)</div>
          <div className="kpi-value mono" style={{fontSize:18, marginTop:4}}>{WEEK_KPIS.worstLine}</div>
          <div className="kpi-change down">▼ {WEEK_KPIS.worstLineOEE}% avg</div>
          <div className="kpi-sub">Worst shift: Night · 55.2%</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Best shift factory-wide</div>
          <div className="kpi-value">{WEEK_KPIS.bestShift}<span style={{fontSize:14,color:"var(--muted)"}}> · {WEEK_KPIS.bestShiftOEE}%</span></div>
          <div className="kpi-sub">Across all lines</div>
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Shift OEE Heatmap — {week}</h3>
          <span className="muted" style={{fontSize:11}}>Click a cell to see shift details · Hover for tooltip</span>
        </div>

        <div className="heatmap-wrap" role="grid">
          <div className="heatmap-row heatmap-head">
            <div className="heatmap-corner">Line</div>
            {HEATMAP_DAYS.map(d => (
              <div key={d.k} className="heatmap-day-group">
                <div className="heatmap-day-label">{d.label}</div>
                <div className="heatmap-shift-labels">
                  {HEATMAP_SHIFTS.map(s => <div key={s} className="heatmap-shift-label">{s}</div>)}
                </div>
              </div>
            ))}
          </div>

          {visibleLines.length === 0 && (
            <EmptyState
              icon="📊"
              title="No lines match the current filter"
              body="Reset the line filter to see all production lines, or pick a specific line."
              action={{ label: "Reset filter", onClick: () => setLineFilter("all") }}
            />
          )}
          {visibleLines.map(l => {
            // Build last-7-shift outcome strip for this line (most-recent-last).
            // Per-cell title "Shift AM · Sun 20 · 86%" — TUNING-PATTERN §3.1.
            // NOTE: intentionally does NOT touch heatmap cell colour cells
            // (OEE §6 risk — heatColor palette preserved).
            const lineMap = HEATMAP[l.id] || {};
            const flat = [];
            HEATMAP_DAYS.forEach(d => {
              HEATMAP_SHIFTS.forEach(s => {
                flat.push({ day: d, shift: s, val: lineMap[d.k]?.[s] });
              });
            });
            const last7 = flat.slice(-7);
            const stripCells = last7.map(({ day, shift, val }) => {
              let tone;
              if (val == null) tone = "empty";
              else if (val < 65) tone = "bad";
              else if (val < 85) tone = "warn";
              else tone = "ok";
              const valStr = val == null ? "no data" : `${val.toFixed(0)}%`;
              return { tone, title: `Shift ${shift} · ${day.label} · ${valStr}` };
            });
            return (
              <div key={l.id} className="heatmap-row">
                <div className="heatmap-row-head" onClick={() => onPickLine(l.id)}>
                  <div className="mono" style={{fontWeight:700, fontSize:12}}>{l.id}</div>
                  <div className="muted" style={{fontSize:10}}>{l.name}</div>
                  <div style={{marginTop:4}}>
                    <RunStrip outcomes={stripCells} max={7} title={`Last 7 shifts — ${l.id}`} />
                  </div>
                </div>
                {HEATMAP_DAYS.map(d => (
                  <div key={d.k} className="heatmap-day-group">
                    {HEATMAP_SHIFTS.map(s => {
                      const val = HEATMAP[l.id]?.[d.k]?.[s];
                      const sel = selected.line === l.id && selected.day === d.k && selected.shift === s;
                      return (
                        <div key={s}
                             className={"heatmap-cell " + (sel ? "selected " : "") + (val == null ? "empty" : "")}
                             style={{background: heatColor(val)}}
                             title={`${l.id} · ${d.label} · ${s} · OEE ${val == null ? "no data" : val + "%"}`}
                             onClick={() => setSelected({ line: l.id, day: d.k, shift: s })}
                             role="gridcell" tabIndex="0"
                             aria-label={`${l.id} ${d.label} ${s}: OEE ${val ?? "no data"}`}>
                          <div className="hm-val">{val == null ? "—" : val.toFixed(0)}</div>
                          {val != null && (
                            <div className="hm-micro">
                              <span style={{width:"34%", background:"#3b82f6"}}></span>
                              <span style={{width:"34%", background:"#22c55e"}}></span>
                              <span style={{width:"32%", background:"#f59e0b"}}></span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="row-flex" style={{fontSize:11, padding:"10px 14px", borderTop:"1px solid var(--border)"}}>
          <span>Colour scale (fixed P1):</span>
          <span className="row-flex"><span className="legend-sq" style={{background:"#ef4444"}}></span>&lt;65% Red</span>
          <span className="row-flex"><span className="legend-sq" style={{background:"#f59e0b"}}></span>65–85% Amber</span>
          <span className="row-flex"><span className="legend-sq" style={{background:"#22c55e"}}></span>≥85% Green</span>
          <span className="spacer"></span>
          <span className="muted">P2: tenant-configurable via <span className="mono">oee_alert_thresholds</span></span>
        </div>
      </div>

      {/* Selected cell detail */}
      <div className="card" style={{marginTop:10}}>
        <div className="card-head">
          <h3 className="card-title">{selected.line} · {dayLabel} · {selected.shift} · OEE {cell == null ? "no data" : cell + "%"}</h3>
          <span className="muted" style={{fontSize:11}}>Click another cell to update</span>
        </div>
        {cell == null ? (
          <EmptyState
            icon="📭"
            title="No data for this shift"
            body={`${selected.line} · ${selected.shift} · ${dayLabel} — the aggregation window has no recorded snapshots.`}
            action={{ label: "Open Line Trend", onClick: () => onPickLine(selected.line) }}
          />
        ) : (
          <div className="cell-detail">
            <div className="cell-gauges">
              <ArcGauge pct={62} color="#3b82f6" label="A" size={90} target={70}/>
              <ArcGauge pct={93} color="#22c55e" label="P" size={90} target={80}/>
              <ArcGauge pct={99} color="#f59e0b" label="Q" size={90} target={95}/>
              <ArcGauge pct={cell} color={oeeStatus(cell).color} label="OEE" size={90} target={70}/>
            </div>
            <div className="cell-meta">
              <div><span className="muted">Top cause:</span> <b>Machine Fault — Mixer M-002 · 48 min</b></div>
              <div><span className="muted">vs 7-day avg for this shift:</span> <span className="badge badge-red" style={{fontSize:10}}>−14.8 pp</span></div>
              <div><span className="muted">Total output:</span> <span className="mono">210 kg</span></div>
              <div><span className="muted">Total downtime:</span> <span className="mono">88 min</span></div>
              <div><span className="muted">Snapshot count:</span> <span className="mono">432 / 480</span> <span className="badge badge-amber" style={{fontSize:9}}>1 gap</span></div>
            </div>
            <div className="cell-actions">
              <button className="btn btn-primary btn-sm" onClick={() => onPickLine(selected.line)}>Drill to Line Trend →</button>
              <button className="btn btn-secondary btn-sm" onClick={() => window.alert("Cross-link → /production/downtime?line=" + selected.line)}>View downtime events →</button>
            </div>
          </div>
        )}
      </div>

      <div className="oee-action-bar">
        <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_heatmap", week })}>⇪ Export CSV</button>
        <button className="btn btn-secondary btn-sm">⇪ Export PDF</button>
        <span className="spacer"></span>
        <span className="muted" style={{fontSize:11}}>Source <span className="mono">oee_shift_metrics</span> MV · refresh post-shift +5min</span>
      </div>
    </>
  );
};

// ============ OEE-P2-C — Downtime Pareto (80/20) ============
const OeePareto = ({ onNav, openModal }) => {
  // 80/20 cumulative on the Six Big Losses
  const sorted = [...SIX_BIG_LOSSES].sort((a, b) => b.mins - a.mins);
  const total = sorted.reduce((a, l) => a + l.mins, 0);
  let cum = 0;
  const withCum = sorted.map(l => { cum += l.mins; return { ...l, cum, cumPct: (cum / total) * 100 }; });
  const eightyLine = withCum.findIndex(l => l.cumPct >= 80);
  const max = sorted[0].mins;

  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Downtime Pareto</>}
        title="Downtime Pareto — 80/20"
        subtitle="Six Big Losses sorted by impact · cumulative curve highlights the top 80% of downtime"
        right={<>
          <div className="pills">
            <button className="pill on">Today</button>
            <button className="pill">This week</button>
            <button className="pill">30 days</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_pareto" })}>⇪ Export</button>
        </>}
      />

      <Freshness/>

      <div className="alert-blue alert-box" style={{marginBottom:10}}>
        <span>ⓘ</span>
        <div>
          <b>P2 preview:</b> full Pareto with drill-down is scheduled for Phase 2. P1 currently provides the <b>Six Big Losses</b> tab in OEE Daily Summary.
          <button className="btn btn-ghost btn-sm" style={{marginLeft:10}} onClick={() => onNav("summary")}>Go to Six Big Losses tab →</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3 className="card-title">Downtime Pareto — all lines</h3></div>
          <div style={{padding:"4px 0"}}>
            {withCum.map((l, i) => (
              <div key={i} className="pareto-bar" style={{gridTemplateColumns: "200px 1fr 80px 80px 60px"}}>
                <div className="pb-label">
                  <span className={"badge badge-" + (l.class === "plant" ? "red" : l.class === "process" ? "amber" : "blue")} style={{fontSize:9, marginRight:6}}>{i + 1}</span>
                  {l.label}
                </div>
                <div className="pb-track">
                  <div className={"pb-fill " + l.class} style={{width: (l.mins / max * 100) + "%"}}></div>
                </div>
                <div className="pb-val">{l.mins} min</div>
                <div className="pb-pct">{l.pct}%</div>
                <div className="pb-pct" style={{color: l.cumPct <= 80 ? "var(--red)" : "var(--muted)", fontWeight: l.cumPct <= 80 ? 600 : 400}}>
                  Σ {l.cumPct.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
          <div className="row-flex" style={{fontSize:11, padding:"10px 0 2px", borderTop:"1px solid var(--border)", marginTop:8}}>
            <span className="muted">Top <b style={{color:"var(--red)"}}>{eightyLine + 1}</b> causes drive 80% of downtime · focus Lean improvement here.</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3 className="card-title">Distribution by Lean class</h3></div>
          <div style={{padding:"6px 0"}}>
            {["plant", "process", "people"].map(group => {
              const mins = SIX_BIG_LOSSES.filter(l => l.class === group).reduce((a, l) => a + l.mins, 0);
              const pct = (mins / total * 100).toFixed(1);
              const color = group === "plant" ? "#ef4444" : group === "process" ? "#f59e0b" : "#3b82f6";
              return (
                <div key={group} className="row-flex" style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                  <span className="legend-sq" style={{background: color}}></span>
                  <span style={{textTransform:"capitalize"}}>{group}</span>
                  <span className="spacer"></span>
                  <span className="mono">{mins} min ({pct}%)</span>
                </div>
              );
            })}
            <div className="row-flex" style={{padding:"10px 0", borderTop:"2px solid var(--border)", fontWeight:600}}>
              <span>Total</span><span className="spacer"></span><span className="mono">{total} min</span>
            </div>
          </div>
          <div className="muted" style={{fontSize:11, marginTop:8}}>
            Top driver: <b style={{color:"var(--text)"}}>Plant — Equipment Failure</b> · 172 min (34.3%)
            <br/>4th P "Product" tracked as QA holds (see Quality module).
          </div>
        </div>
      </div>
    </>
  );
};

// ============ Availability deep-dive (component drill-in) ============
const OeeAvailability = ({ onNav, openModal, onPickLine }) => {
  const factoryA = SUMMARY_KPIS_TODAY.factoryA;
  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Availability deep-dive</>}
        title="Availability — A factor"
        subtitle="A = (Planned − Downtime) / Planned · affected by Equipment Failure + Setup (Six Big Losses)"
      />

      <Freshness/>

      <div className="grid-3" style={{marginTop:10}}>
        <div className="card gauge-card-oee primary" style={{padding:20}}>
          <ArcGauge pct={factoryA} color="#3b82f6" label="Factory Availability" target={70} size={160}/>
          <div style={{textAlign:"center", marginTop:6, fontSize:12}}>
            vs world-class 90% · <span className="badge badge-amber" style={{fontSize:10}}>−8.7 pp</span>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">A by line</h3></div>
          <table>
            <thead><tr><th>Line</th><th>A %</th><th>Downtime</th><th>7-day</th></tr></thead>
            <tbody>
              {OEE_LINES_META.map(l => {
                const d = OEE_TODAY[l.id];
                return (
                  <tr key={l.id} onClick={() => onPickLine(l.id)} style={{cursor:"pointer"}}>
                    <td className="mono" style={{fontWeight:600}}>{l.id}</td>
                    <td><CompBadge v={d.a} min={OEE_THRESHOLDS.tenant.aMin}/></td>
                    <td className="num mono">{d.downtime} min</td>
                    <td><Spark data={SPARK_7D[l.id].map(x => x * 1.1)} color="#3b82f6" w={70} h={20}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">Availability loss categories</h3></div>
          <div style={{padding:"4px 0"}}>
            {SIX_BIG_LOSSES.filter(l => l.impact === "A").map((l, i) => (
              <div key={i} className="pareto-bar" style={{gridTemplateColumns: "1fr 1fr 80px"}}>
                <div className="pb-label">{l.label}</div>
                <div className="pb-track"><div className={"pb-fill " + l.class} style={{width: (l.mins/180*100) + "%"}}></div></div>
                <div className="pb-val">{l.mins} min</div>
              </div>
            ))}
          </div>
          <div className="muted" style={{fontSize:11, marginTop:10}}>
            Biggest A driver: <b style={{color:"var(--text)"}}>MIX-04 on LINE-02</b> (MTBF 42h · 78 min fault today).
            <br/>
            <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={() => onNav("equipment")}>View Equipment Health (P2) →</a>
          </div>
        </div>
      </div>

      <div className="card" style={{marginTop:10}}>
        <div className="card-head"><h3 className="card-title">Availability 7-day trend — all lines</h3></div>
        <div style={{padding:14}}>
          {OEE_LINES_META.map(l => (
            <div key={l.id} className="row-flex" style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
              <span className="mono" style={{fontWeight:600, width:90}}>{l.id}</span>
              <Spark data={SPARK_7D[l.id].map(x => Math.min(100, x * 1.05))} color="#3b82f6" w={260} h={30} target={70} showTarget/>
              <span className="spacer"></span>
              <CompBadge v={OEE_TODAY[l.id].a} min={OEE_THRESHOLDS.tenant.aMin}/>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// ============ Performance deep-dive ============
const OeePerformance = ({ onNav, onPickLine }) => {
  const factoryP = SUMMARY_KPIS_TODAY.factoryP;
  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Performance deep-dive</>}
        title="Performance — P factor"
        subtitle="P = (Output × Ideal Cycle) / Runtime · affected by Idling + Reduced Speed (minor stops, jams)"
      />
      <Freshness/>
      <div className="grid-3" style={{marginTop:10}}>
        <div className="card gauge-card-oee primary" style={{padding:20}}>
          <ArcGauge pct={factoryP} color="#22c55e" label="Factory Performance" target={80} size={160}/>
          <div style={{textAlign:"center", marginTop:6, fontSize:12}}>
            vs world-class 95% · <span className="badge badge-red" style={{fontSize:10}}>−22.8 pp</span>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">P by line</h3></div>
          <table>
            <thead><tr><th>Line</th><th>P %</th><th>Micro stops</th><th>7-day</th></tr></thead>
            <tbody>
              {OEE_LINES_META.map(l => {
                const d = OEE_TODAY[l.id];
                return (
                  <tr key={l.id} onClick={() => onPickLine(l.id)} style={{cursor:"pointer"}}>
                    <td className="mono" style={{fontWeight:600}}>{l.id}</td>
                    <td><CompBadge v={d.p} min={OEE_THRESHOLDS.tenant.pMin}/></td>
                    <td className="num mono">{Math.round(d.downtime/8)} ev</td>
                    <td><Spark data={SPARK_7D[l.id]} color="#22c55e" w={70} h={20}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">P loss categories</h3></div>
          <div style={{padding:"4px 0"}}>
            {SIX_BIG_LOSSES.filter(l => l.impact === "P").map((l, i) => (
              <div key={i} className="pareto-bar" style={{gridTemplateColumns: "1fr 1fr 80px"}}>
                <div className="pb-label">{l.label}</div>
                <div className="pb-track"><div className={"pb-fill " + l.class} style={{width: (l.mins/180*100) + "%"}}></div></div>
                <div className="pb-val">{l.mins} min</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

// ============ Quality deep-dive ============
const OeeQuality = ({ onNav, onPickLine }) => {
  const factoryQ = SUMMARY_KPIS_TODAY.factoryQ;
  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Quality deep-dive</>}
        title="Quality — Q factor"
        subtitle="Q = Good / Total Output · affected by Process Defects + Startup Rejects · cross-reference 09-QUALITY"
      />
      <Freshness/>
      <div className="grid-3" style={{marginTop:10}}>
        <div className="card gauge-card-oee primary" style={{padding:20}}>
          <ArcGauge pct={factoryQ} color="#f59e0b" label="Factory Quality" target={95} size={160}/>
          <div style={{textAlign:"center", marginTop:6, fontSize:12}}>
            vs world-class 99.9% · <span className="badge badge-amber" style={{fontSize:10}}>−0.5 pp</span>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">Q by line</h3></div>
          <table>
            <thead><tr><th>Line</th><th>Q %</th><th>Rejects</th><th>7-day</th></tr></thead>
            <tbody>
              {OEE_LINES_META.map(l => {
                const d = OEE_TODAY[l.id];
                return (
                  <tr key={l.id} onClick={() => onPickLine(l.id)} style={{cursor:"pointer"}}>
                    <td className="mono" style={{fontWeight:600}}>{l.id}</td>
                    <td><CompBadge v={d.q} min={OEE_THRESHOLDS.tenant.qMin}/></td>
                    <td className="num mono">{Math.round(d.output * (1 - d.q/100))} kg</td>
                    <td><Spark data={SPARK_7D[l.id].map(x => Math.min(100, 99 + (x-80)*0.02))} color="#f59e0b" w={70} h={20}/></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="card-title">Q loss categories</h3></div>
          <div style={{padding:"4px 0"}}>
            {SIX_BIG_LOSSES.filter(l => l.impact === "Q").map((l, i) => (
              <div key={i} className="pareto-bar" style={{gridTemplateColumns: "1fr 1fr 80px"}}>
                <div className="pb-label">{l.label}</div>
                <div className="pb-track"><div className={"pb-fill " + l.class} style={{width: (l.mins/60*100) + "%"}}></div></div>
                <div className="pb-val">{l.mins} min</div>
              </div>
            ))}
          </div>
          <div className="alert-blue alert-box" style={{marginTop:10, fontSize:11}}>
            <span>ⓘ</span><div>QA holds that affect Q are owned by 09-QUALITY. Click any line to see related hold events.</div>
          </div>
        </div>
      </div>
    </>
  );
};

// ============ Standalone Changeover screen ============
const OeeChangeover = ({ onNav, openModal }) => {
  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Changeover</>}
        title="Changeover analysis"
        subtitle={`${CHANGEOVER_EVENTS.length} events · Target durations configured in 02-SETTINGS`}
        right={<>
          <div className="pills">
            <button className="pill on">Today</button>
            <button className="pill">This week</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "oee_changeover" })}>⇪ Export</button>
        </>}
      />
      <Freshness/>
      <ChangeoverTab date="2026-04-20" openModal={openModal}/>
    </>
  );
};

// ============ Standalone Six Big Losses screen ============
const OeeLosses = ({ onNav, openModal }) => {
  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Six Big Losses</>}
        title="Six Big Losses analysis"
        subtitle="Nakajima TPM framework · mapping configurable in OEE Settings"
        right={<>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("bigLossMapping")}>Mapping editor →</button>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("export", { dashboard: "six_big_losses" })}>⇪ Export</button>
        </>}
      />
      <Freshness/>
      <SixBigLossesTab date="2026-04-20" role="Prod Mgr" openModal={openModal}/>
    </>
  );
};

// ============ OEE-ADM-001 — Alert Thresholds ============
const OeeSettings = ({ role, onNav, openModal }) => {
  const [edit, setEdit] = React.useState(false);
  // BL-OEE-08: hydrate tenant threshold from localStorage on first render so
  // sidebar badge (PSidebar) reads the same persisted target value.
  const initialTenant = React.useMemo(() => {
    try {
      const raw = window.localStorage.getItem("oee.thresholds");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          return { ...OEE_THRESHOLDS.tenant, ...parsed };
        }
      }
    } catch (e) { /* ignore */ }
    return OEE_THRESHOLDS.tenant;
  }, []);
  const [thresh, setThresh] = React.useState(initialTenant);
  const isAdmin = role === "Admin";

  if (!isAdmin) {
    return (
      <>
        <PageHead breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Settings</>} title="Access denied"/>
        <div className="alert-red alert-box">
          <strong>Insufficient permissions</strong>
          <span>OEE settings requires <span className="mono">oee_admin</span> role. Switch role via topbar.</span>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Settings</>}
        title={<>OEE Alert Thresholds <span className="badge badge-blue" style={{fontSize:9, marginLeft:10}}>Admin Only</span></>}
        subtitle="Configure OEE target, A/P/Q minimums, anomaly detection (P2) · stored in 02-SETTINGS oee_alert_thresholds"
      />

      <div className="alert-blue alert-box" style={{marginBottom:14}}>
        <span>ⓘ</span>
        <div>
          These thresholds control colour coding across all OEE dashboards. Changes take effect on next dashboard refresh.
          Shift boundaries → <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={() => onNav("shifts")}>Shift Configs</a>.
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Tenant default thresholds</h3>
          {!edit
            ? <button className="btn btn-secondary btn-sm" onClick={() => setEdit(true)}>Edit</button>
            : <div className="row-flex">
                <button className="btn btn-ghost btn-sm" onClick={() => {setThresh(OEE_THRESHOLDS.tenant); setEdit(false);}}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={() => {
                  OEE_THRESHOLDS.tenant = thresh;
                  // BL-OEE-08 — persist across reloads (tiny tuning).
                  try {
                    window.localStorage.setItem("oee.thresholds", JSON.stringify(thresh));
                    if (typeof thresh.oeeTarget === "number") {
                      window.localStorage.setItem("oee.target", String(thresh.oeeTarget));
                    }
                  } catch (e) { /* quota / disabled — non-fatal */ }
                  setEdit(false);
                }}>Save</button>
              </div>
          }
        </div>
        <table>
          <thead><tr><th>Field</th><th>Value</th><th>Forza default</th><th>Notes</th></tr></thead>
          <tbody>
            {[
              {k: "oeeTarget",      label: "OEE Target %",           def: 70.0, note: "P1 Forza baseline · target line on charts (does not shift heatmap colour scale)"},
              {k: "aMin",           label: "Availability Minimum %", def: 70.0, note: "Below = red in A column badges"},
              {k: "pMin",           label: "Performance Minimum %",  def: 80.0, note: "Below = red in P column badges"},
              {k: "qMin",           label: "Quality Minimum %",      def: 95.0, note: "Below = red in Q column badges"},
            ].map(f => (
              <tr key={f.k}>
                <td>{f.label}</td>
                <td>
                  {edit
                    ? <input type="number" step="0.1" value={thresh[f.k]} onChange={e => setThresh({...thresh, [f.k]: parseFloat(e.target.value)})} style={{width:90}}/>
                    : <b className="mono">{thresh[f.k].toFixed(1)}%</b>}
                </td>
                <td className="muted mono">{f.def.toFixed(1)}%</td>
                <td className="muted" style={{fontSize:11}}>{f.note}</td>
              </tr>
            ))}
            <tr style={{opacity:0.5}}>
              <td>Anomaly EWMA Alpha <span className="badge badge-gray" style={{fontSize:9}}>P2</span></td>
              <td className="mono">0.30</td>
              <td className="muted mono">0.30</td>
              <td className="muted" style={{fontSize:11}}>Controls EWMA smoothing</td>
            </tr>
            <tr style={{opacity:0.5}}>
              <td>Anomaly Sigma Threshold <span className="badge badge-gray" style={{fontSize:9}}>P2</span></td>
              <td className="mono">2.0 σ</td>
              <td className="muted mono">2.0 σ</td>
              <td className="muted" style={{fontSize:11}}>Triggers anomaly alert</td>
            </tr>
            <tr style={{opacity:0.5}}>
              <td>Maintenance Trigger Availability % <span className="badge badge-gray" style={{fontSize:9}}>P2</span></td>
              <td className="mono">70.0%</td>
              <td className="muted mono">70.0%</td>
              <td className="muted" style={{fontSize:11}}>13-MAINT consumer · consecutive days</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:10}}>
        <div className="card-head">
          <h3 className="card-title">Per-line overrides</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("lineOverride")}>＋ Add line override</button>
        </div>
        <table>
          <thead><tr><th>Line</th><th>OEE target</th><th>A min</th><th>P min</th><th>Q min</th><th>Actions</th></tr></thead>
          <tbody>
            {OEE_THRESHOLDS.perLine.map(p => (
              <tr key={p.line}>
                <td className="mono" style={{fontWeight:600}}>{p.line}</td>
                <td className="mono">{p.oeeTarget.toFixed(1)}%</td>
                <td className="mono">{p.aMin.toFixed(1)}%</td>
                <td className="mono">{p.pMin.toFixed(1)}%</td>
                <td className="mono">{p.qMin.toFixed(1)}%</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal("lineOverride", p)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal("deleteOverride", p)} style={{color:"var(--red)"}}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:10}}>
        <div className="card-head">
          <h3 className="card-title">Six Big Losses — category mapping</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => openModal("bigLossMapping")}>Open mapping editor →</button>
        </div>
        <div className="alert-blue alert-box" style={{margin:"8px 14px", fontSize:12}}>
          <span>ⓘ</span><div>Controls how raw <span className="mono">downtime_reason_code</span> values classify into Six Big Losses. Changes apply immediately; historical data is re-classified dynamically.</div>
        </div>
        <table>
          <thead><tr><th>Reason code</th><th>Label</th><th>Big Loss category</th></tr></thead>
          <tbody>
            {BIG_LOSS_MAPPING.slice(0, 8).map(m => (
              <tr key={m.code}>
                <td className="mono" style={{fontSize:11}}>{m.code}</td>
                <td>{m.label}</td>
                <td><span className="badge badge-blue" style={{fontSize:10}}>{m.bigLoss}</span></td>
              </tr>
            ))}
            <tr><td colSpan="3" className="muted" style={{fontSize:11, textAlign:"center"}}>+ {BIG_LOSS_MAPPING.length - 8} more mappings · <a style={{color:"var(--blue)", cursor:"pointer"}} onClick={() => openModal("bigLossMapping")}>view all</a></td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ OEE-ADM-002 — Shift Configs (read-only) ============
const OeeShifts = ({ role, onNav }) => {
  if (role !== "Admin") {
    return (
      <>
        <PageHead breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Shift Configs</>} title="Access denied"/>
        <div className="alert-red alert-box">
          <strong>Insufficient permissions</strong>
          <span>Shift Config viewer requires <span className="mono">oee_admin</span> role.</span>
        </div>
      </>
    );
  }
  return (
    <>
      <PageHead
        breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Shift Configs</>}
        title={<>Shift Configuration <span className="badge badge-blue" style={{fontSize:9, marginLeft:10}}>Admin Only · Read-only</span></>}
        subtitle="Cross-link to 02-SETTINGS → Reference Tables → shift_configs · OEE consumes this for heatmap aggregation"
        right={<button className="btn btn-secondary btn-sm" onClick={() => window.alert("Cross-link → /settings/reference-tables/shift-configs")}>Edit in 02-SETTINGS →</button>}
      />

      <div className="alert-blue alert-box" style={{marginBottom:14}}>
        <span>ⓘ</span>
        <div>Shift configurations are owned by <span className="mono">02-SETTINGS</span>. To modify shift boundaries, use the authoritative 02-SETTINGS editor.</div>
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Active shift configurations</h3></div>
        <table>
          <thead><tr><th>Shift ID</th><th>Label</th><th>Start</th><th>End</th><th>Timezone</th><th>Active days</th><th>Sort</th><th>Status</th></tr></thead>
          <tbody>
            {SHIFT_CONFIGS.map(s => (
              <tr key={s.id}>
                <td className="mono" style={{fontWeight:700}}>{s.id}</td>
                <td>{s.label}</td>
                <td className="mono">{s.start}</td>
                <td className="mono">{s.end}</td>
                <td className="mono" style={{fontSize:11}}>{s.tz}</td>
                <td>{s.days}</td>
                <td className="mono">{s.sort}</td>
                <td><span className="badge badge-green" style={{fontSize:10}}>Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{marginTop:10}}>
        <div className="card-head"><h3 className="card-title">DSL rule status</h3></div>
        <div style={{padding:10, fontSize:12}}>
          <div className="row-flex" style={{padding:"6px 0"}}>
            <span className="mono" style={{fontWeight:600}}>shift_aggregator_v1</span>
            <span className="spacer"></span>
            <span className="badge badge-green" style={{fontSize:10}}>P1 · Active</span>
          </div>
          <div className="muted" style={{fontSize:11, marginBottom:10}}>
            Fires 5 minutes after each shift end-time · populates <span className="mono">oee_shift_metrics</span> MV.
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => window.alert("Cross-link → /reporting/rules-usage")}>Check Rule Status →</button>
        </div>
      </div>
    </>
  );
};

// ============ P2 Placeholder (shared shell) ============
const P2Placeholder = ({ title, description, relatedRule, featureFlag, alternativeLink, onNav, columns, data }) => (
  <>
    <PageHead
      breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · {title}</>}
      title={title}
      subtitle={<>Phase 2 · <span className="badge badge-gray" style={{fontSize:9}}>P2 · Coming</span></>}
    />
    <div className="card" style={{padding:30, textAlign:"center", maxWidth:720, margin:"20px auto"}}>
      <div style={{fontSize:48, marginBottom:10, color:"var(--muted)"}}>⏳</div>
      <h2 style={{marginBottom:10}}>{title} — Coming in Phase 2</h2>
      <p style={{color:"var(--muted)", fontSize:13, lineHeight:1.6, maxWidth:520, margin:"0 auto 20px"}}>{description}</p>
      {relatedRule && (
        <div style={{fontSize:12, color:"var(--muted)", marginBottom:10}}>
          Related rule: <span className="mono" style={{color:"var(--text)"}}>{relatedRule}</span>
        </div>
      )}
      {featureFlag && (
        <div style={{fontSize:12, color:"var(--muted)", marginBottom:20}}>
          Feature flag: <span className="mono" style={{color:"var(--text)"}}>{featureFlag}</span>
        </div>
      )}
      <div style={{display:"flex", gap:10, justifyContent:"center"}}>
        {alternativeLink && <button className="btn btn-primary btn-sm" onClick={alternativeLink.onClick}>{alternativeLink.label} →</button>}
        <button className="btn btn-secondary btn-sm" onClick={() => window.alert("Cross-link → /reporting/rules-usage")}>View Rule Config →</button>
        <button className="btn btn-ghost btn-sm" onClick={() => window.alert("Cross-link → /settings/feature-flags")}>Check Feature Flag →</button>
      </div>
    </div>

    {data && (
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Data preview (P1 stub — no data)</h3>
          <span className="muted" style={{fontSize:11}}>This table will populate when P2 ships.</span>
        </div>
        <table style={{opacity:0.6}}>
          <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>{columns.map((c, j) => <td key={j}>{typeof row[c.toLowerCase().replace(/\s+/g, "")] !== "undefined" ? row[c.toLowerCase().replace(/\s+/g, "")] : (row[j] ?? "—")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
);

// ============ P2 Screens — Anomalies, Equipment Health, TV ============
const OeeAnomalies = ({ onNav }) => (
  <>
    <PageHead
      breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Anomalies</>}
      title={<>Anomaly Detection <span className="badge badge-gray" style={{fontSize:9, marginLeft:10}}>P2</span></>}
      subtitle="EWMA α=0.30 · 2σ threshold · rolling 30-min window · alert latency &lt;60s"
    />
    <div className="alert-blue alert-box" style={{marginBottom:14}}>
      <span>ⓘ</span>
      <div>
        Rule <span className="mono">oee_anomaly_detector_v1</span> is registered as P2 stub in 02-SETTINGS §7.8.
        Enable via feature flag <span className="mono">oee.anomaly_detection_enabled</span>.
      </div>
    </div>
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Anomaly history (sample — will populate in P2)</h3>
      </div>
      <table>
        <thead>
          <tr>
            <th>Line</th><th>Detected</th><th>Actual</th><th>Expected</th><th>Deviation</th><th>Severity</th><th>Status</th><th>Ack by</th>
          </tr>
        </thead>
        <tbody>
          {ANOMALIES.map((a, i) => (
            <tr key={i} style={{opacity:0.75}}>
              <td className="mono" style={{fontWeight:600}}>{a.line}</td>
              <td className="mono" style={{fontSize:11}}>{a.detected}</td>
              <td className="mono">{a.actual}%</td>
              <td className="mono">{a.expected}%</td>
              <td className="mono">{a.sigma}σ</td>
              <td><span className={"badge badge-" + a.severity} style={{fontSize:10}}>{a.severity.toUpperCase()}</span></td>
              <td><span className={"badge badge-" + (a.status === "resolved" ? "green" : a.status === "ack" ? "blue" : "amber")} style={{fontSize:10}}>{a.status}</span></td>
              <td style={{fontSize:11}}>{a.ackBy || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted" style={{fontSize:11, padding:10, textAlign:"center"}}>
        P2: acknowledge + investigation workflow · in-app toast + daily email digest per OQ-OEE-08.
      </div>
    </div>
  </>
);

const OeeEquipmentHealth = ({ onNav }) => (
  <>
    <PageHead
      breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · Equipment Health</>}
      title={<>Equipment Health <span className="badge badge-gray" style={{fontSize:9, marginLeft:10}}>P2</span></>}
      subtitle="MTBF / MTTR analytics · cross-module with 13-MAINTENANCE"
    />
    <div className="alert-blue alert-box" style={{marginBottom:14}}>
      <span>ⓘ</span>
      <div>
        Requires <span className="mono">13-MAINTENANCE</span> module (Phase C5 Sesja 2). P2 rule <span className="mono">oee_maintenance_trigger_v1</span> creates PM work orders when A &lt;70% for 3 consecutive days.
      </div>
    </div>
    <div className="card">
      <div className="card-head"><h3 className="card-title">Equipment status (sample — will populate in P2)</h3></div>
      <table>
        <thead>
          <tr><th>Equipment</th><th>Line</th><th>MTBF</th><th>MTTR</th><th>30-day A%</th><th>Trend</th><th>Last fault</th></tr>
        </thead>
        <tbody>
          {EQUIPMENT_HEALTH.map((e, i) => (
            <tr key={i} style={{opacity:0.85}}>
              <td className="mono" style={{fontWeight:600}}>{e.equipment}</td>
              <td className="mono">{e.line}</td>
              <td className="mono">{e.mtbf}</td>
              <td className="mono">{e.mttr}</td>
              <td><CompBadge v={e.avail30d} min={70}/></td>
              <td>
                <span className={e.trend === "down" ? "mono" : e.trend === "up" ? "mono" : "mono"} style={{color: e.trend === "down" ? "var(--red)" : e.trend === "up" ? "var(--green)" : "var(--muted)"}}>
                  {e.trend === "down" ? "▼" : e.trend === "up" ? "▲" : "—"} {e.trend}
                </span>
              </td>
              <td className="mono" style={{fontSize:11}}>{e.lastFault}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

const OeeTV = ({ onNav }) => (
  <>
    <PageHead
      breadcrumb={<><a onClick={() => onNav("summary")}>OEE</a> · TV Dashboard</>}
      title={<>Plant-floor TV Dashboard <span className="badge badge-gray" style={{fontSize:9, marginLeft:10}}>P2</span></>}
      subtitle="1920×1080 kiosk · 30s auto-refresh · ColorBrewer RdYlGn · OS selection open (OQ-OEE-03)"
    />
    <div className="alert-blue alert-box" style={{marginBottom:14}}>
      <span>ⓘ</span>
      <div>
        OS kiosk decision open · options: Raspberry Pi / Windows kiosk / ChromeOS. Requires Forza IT hardware consultation.
      </div>
    </div>
    <div className="card" style={{padding:30, background:"#0f172a", color:"#f8fafc", aspectRatio:"16/9", display:"grid", gridTemplateColumns:"1fr 1fr", gap:20}}>
      <div>
        <div style={{fontSize:11, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.1em"}}>LINE-01 · Cured meats</div>
        <div style={{fontSize:96, fontWeight:700, lineHeight:1}}>86.5<span style={{fontSize:48, color:"#94a3b8"}}>%</span></div>
        <div style={{fontSize:14, marginTop:10, color:"#22c55e"}}>▲ On target · World-class</div>
        <div style={{marginTop:30, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14}}>
          {[{l:"A", v:94.2, c:"#3b82f6"},{l:"P", v:92.5, c:"#22c55e"},{l:"Q", v:99.3, c:"#f59e0b"}].map(g => (
            <div key={g.l} style={{textAlign:"center"}}>
              <div style={{fontSize:11, color:"#94a3b8"}}>{g.l}</div>
              <div style={{fontSize:36, fontWeight:600, color:g.c}}>{g.v}%</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{fontSize:11, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.1em"}}>Current WO</div>
        <div style={{fontSize:28, fontWeight:600, marginTop:4}}>WO-2026-0042</div>
        <div style={{fontSize:16, color:"#94a3b8"}}>Kielbasa krakowska sucha · 1,248 kg</div>

        <div style={{marginTop:30, fontSize:11, color:"#94a3b8", textTransform:"uppercase"}}>Shift AM — Elapsed 6h 12m</div>
        <div style={{fontSize:24, marginTop:6}}>Target 85% · Actual 91.2% · <span style={{color:"#22c55e"}}>▲ +6.2pp</span></div>

        <div style={{marginTop:30, fontSize:11, color:"#94a3b8"}}>Auto-refresh · 30s</div>
      </div>
    </div>
    <div className="muted" style={{fontSize:11, padding:10, textAlign:"center"}}>
      P2: font scaling 20px body / 48px values · color-blind safe · no interactive controls (read-only).
    </div>
  </>
);

Object.assign(window, {
  OeeLineTrend, OeeHeatmap, OeePareto,
  OeeAvailability, OeePerformance, OeeQuality,
  OeeChangeover, OeeLosses,
  OeeSettings, OeeShifts,
  OeeAnomalies, OeeEquipmentHealth, OeeTV,
  P2Placeholder,
});
