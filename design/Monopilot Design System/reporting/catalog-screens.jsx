// ============ Reporting — chart primitives + RPT-001 Factory Overview ============

// Simple SVG line/bar/combo chart helpers (inline, no D3 at runtime)

const ChartCombo = ({ data, xKey = "we", yLine = "yield", yBar = "variance", target, h = 280 }) => {
  // y1 = line (yield %), y2 = variance GBP magnitude signed
  const lineVals = data.map(d => d[yLine]);
  const barVals  = data.map(d => d[yBar]);
  const yMin = Math.min(...lineVals) - 2;
  const yMax = Math.max(...lineVals) + 2;
  const varMax = Math.max(...barVals.map(Math.abs), 1);

  const W = 800, H = h;
  const padL = 40, padR = 40, padT = 20, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const yBarH = (v) => (Math.abs(v) / varMax) * (innerH * 0.35);
  const yZero = padT + innerH * 0.65;

  const linePts = data.map((d, i) => `${x(i)},${y(d[yLine])}`).join(" ");
  const tgtY = target != null ? y(target) : null;

  return (
    <div className="rpt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + p * innerH} y2={padT + p * innerH} className="chart-grid"/>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} className="chart-axis"/>
        {/* variance bars */}
        {data.map((d, i) => {
          const val = d[yBar];
          const h = yBarH(val);
          const top = val < 0 ? yZero : yZero - h;
          return <rect key={i} x={x(i) - 14} y={top} width={28} height={h} fill={val < 0 ? "var(--green)" : "var(--red)"} opacity={0.55}/>;
        })}
        {/* target line */}
        {tgtY != null && <line x1={padL} x2={W - padR} y1={tgtY} y2={tgtY} className="chart-target"/>}
        {/* yield line */}
        <polyline fill="none" stroke="var(--green)" strokeWidth="2" points={linePts}/>
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d[yLine])} r={3} fill="var(--green)"/>
        ))}
        {/* x-axis labels */}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 10} textAnchor="middle" className="chart-label">{d[xKey]}</text>
        ))}
        {/* y-axis labels (yield) */}
        <text x={8} y={padT + 4} className="chart-label">{yMax.toFixed(0)}%</text>
        <text x={8} y={padT + innerH} className="chart-label">{yMin.toFixed(0)}%</text>
      </svg>
    </div>
  );
};

const ChartLine = ({ data, xKey, yKey, color = "var(--blue)", target, h = 220, yLabel = "%" }) => {
  const yVals = data.map(d => d[yKey]);
  const yMin = Math.min(...yVals) - 1;
  const yMax = Math.max(...yVals) + 1;
  const W = 800, H = h;
  const padL = 40, padR = 20, padT = 16, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const linePts = data.map((d, i) => `${x(i)},${y(d[yKey])}`).join(" ");
  const tgtY = target != null ? y(target) : null;
  return (
    <div className="rpt-chart-220" style={{height:h}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + p * innerH} y2={padT + p * innerH} className="chart-grid"/>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} className="chart-axis"/>
        {tgtY != null && <line x1={padL} x2={W - padR} y1={tgtY} y2={tgtY} className="chart-target"/>}
        <polyline fill="none" stroke={color} strokeWidth="2" points={linePts}/>
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d[yKey])} r={3} fill={color}/>
        ))}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">{d[xKey]}</text>
        ))}
        <text x={8} y={padT + 4} className="chart-label">{yMax.toFixed(1)}{yLabel}</text>
        <text x={8} y={padT + innerH} className="chart-label">{yMin.toFixed(1)}{yLabel}</text>
      </svg>
    </div>
  );
};

const ChartMultiLine = ({ data, xKey, series, target, h = 220, yLabel = "ms" }) => {
  // series = [{ key, label, color }]
  const allVals = data.flatMap(d => series.map(s => d[s.key] || 0));
  const yMin = 0;
  const yMax = Math.max(...allVals) * 1.1;
  const W = 800, H = h;
  const padL = 40, padR = 80, padT = 16, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i) => padL + (i / Math.max(1, data.length - 1)) * innerW;
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const tgtY = target != null ? y(target) : null;
  return (
    <div className="rpt-chart-220" style={{height:h}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + p * innerH} y2={padT + p * innerH} className="chart-grid"/>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} className="chart-axis"/>
        {tgtY != null && <line x1={padL} x2={W - padR} y1={tgtY} y2={tgtY} className="chart-target"/>}
        {series.map((s, si) => {
          const pts = data.map((d, i) => `${x(i)},${y(d[s.key] || 0)}`).join(" ");
          return <polyline key={s.key} fill="none" stroke={s.color} strokeWidth="2" points={pts}/>;
        })}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="chart-label">{d[xKey]}</text>
        ))}
        <text x={8} y={padT + 4} className="chart-label">{yMax.toFixed(0)}{yLabel}</text>
        <text x={8} y={padT + innerH} className="chart-label">0</text>
        {/* legend right */}
        {series.map((s, i) => (
          <g key={s.key} transform={`translate(${W - padR + 8}, ${padT + 14 + i * 18})`}>
            <rect width="10" height="2" y="4" fill={s.color}/>
            <text x="14" y="8" className="chart-label" style={{fill:"var(--text)"}}>{s.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const ChartGroupedBar = ({ data, groups, h = 280 }) => {
  // groups = [{ key, label, color }]
  const allVals = data.flatMap(d => groups.map(g => d[g.key] || 0));
  const yMax = Math.max(...allVals, 100) * 1.05;
  const W = 800, H = h;
  const padL = 40, padR = 20, padT = 20, padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const gw = innerW / data.length;
  const barW = Math.min(16, (gw - 12) / groups.length);
  const y = (v) => padT + (1 - v / yMax) * innerH;
  return (
    <div className="rpt-chart" style={{height:h}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <React.Fragment key={i}>
            <line x1={padL} x2={W - padR} y1={padT + p * innerH} y2={padT + p * innerH} className="chart-grid"/>
            <text x={8} y={padT + p * innerH + 4} className="chart-label">{Math.round((1 - p) * yMax)}</text>
          </React.Fragment>
        ))}
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} className="chart-axis"/>
        {/* 85% world-class line */}
        <line x1={padL} x2={W - padR} y1={y(85)} y2={y(85)} className="chart-target"/>
        <text x={W - padR + 4} y={y(85) + 4} className="chart-label" style={{fill:"var(--info)"}}>85%</text>
        {data.map((d, i) => {
          const gx = padL + i * gw + gw / 2 - (groups.length * barW) / 2;
          return (
            <g key={i}>
              {groups.map((g, gi) => {
                const v = d[g.key] || 0;
                const by = y(v);
                return <rect key={g.key} x={gx + gi * barW} y={by} width={barW - 2} height={padT + innerH - by} fill={g.color}/>;
              })}
              <text x={padL + i * gw + gw / 2} y={H - 20} textAnchor="middle" className="chart-label">{d.line}</text>
            </g>
          );
        })}
        {/* legend bottom */}
        {groups.map((g, i) => (
          <g key={g.key} transform={`translate(${padL + i * 110}, ${H - 6})`}>
            <rect width="10" height="10" fill={g.color}/>
            <text x="14" y="9" className="chart-label" style={{fill:"var(--text)"}}>{g.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const ChartStackedBarH = ({ data, segments, h = 200 }) => {
  // data = [{ cat, seg1: n, seg2: n, ... }]; segments = [{ key, label, color }]
  const W = 800, H = h;
  const padL = 140, padR = 20, padT = 16, padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const rowH = innerH / data.length;
  return (
    <div className="rpt-chart-200" style={{height:h}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const total = segments.reduce((a, s) => a + (d[s.key] || 0), 0) || 1;
          let xOffset = padL;
          return (
            <g key={i}>
              <text x={padL - 8} y={padT + i * rowH + rowH / 2 + 4} textAnchor="end" className="chart-label" style={{fill:"var(--text)"}}>{d.cat}</text>
              {segments.map(s => {
                const w = ((d[s.key] || 0) / total) * innerW;
                const rect = <rect key={s.key} x={xOffset} y={padT + i * rowH + 4} width={w} height={rowH - 8} fill={s.color}/>;
                xOffset += w;
                return rect;
              })}
            </g>
          );
        })}
        {/* legend bottom */}
        {segments.map((s, i) => (
          <g key={s.key} transform={`translate(${padL + i * 120}, ${H - 6})`}>
            <rect width="10" height="10" fill={s.color}/>
            <text x="14" y="9" className="chart-label" style={{fill:"var(--text)"}}>{s.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const ChartBarH = ({ data, labelKey, valueKey, color = "var(--blue)", h = 200, max }) => {
  const W = 800, H = h;
  const padL = 160, padR = 40, padT = 10, padB = 10;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const rowH = Math.min(32, innerH / data.length);
  const m = max || Math.max(...data.map(d => Math.abs(d[valueKey]))) * 1.1;
  return (
    <div className="rpt-chart-200" style={{height:h}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const v = d[valueKey];
          const w = (Math.abs(v) / m) * innerW;
          const fill = typeof color === "function" ? color(d) : color;
          return (
            <g key={i}>
              <text x={padL - 8} y={padT + i * rowH + rowH / 2 + 4} textAnchor="end" className="chart-label" style={{fill:"var(--text)", fontSize:11}}>{d[labelKey]}</text>
              <rect x={padL} y={padT + i * rowH + 4} width={w} height={rowH - 8} fill={fill}/>
              <text x={padL + w + 6} y={padT + i * rowH + rowH / 2 + 4} className="chart-label" style={{fill:"var(--text)", fontSize:11, fontFamily:"var(--font-mono)"}}>{typeof v === "number" ? v.toLocaleString() : v}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

Object.assign(window, { ChartCombo, ChartLine, ChartMultiLine, ChartGroupedBar, ChartStackedBarH, ChartBarH });

// ============ RPT-001 Factory Overview ============

const RptFactoryOverview = ({ role, onNav, openModal }) => {
  const [week, setWeek] = React.useState("W/E 19/04/2026");
  const [chips, setChips] = React.useState([{ k: "week", label: "Week", value: "W/E 19/04/2026" }]);

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Factory Overview"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Factory Overview</h1>
            <ScopePill site="Main Site"/>
          </div>
        </div>
        <div className="row-flex">
          <WeekSelector value={week} onChange={setWeek}/>
          <ExportDropdown openModal={openModal} dashboard="Factory Overview"/>
          <button className="btn btn-secondary btn-sm" title="Share" onClick={() => openModal("share", { dashboard: "Factory Overview" })}>⇗ Share</button>
        </div>
      </div>

      <FreshnessStrip at="14:32" cadence="2 min" onRefresh={() => openModal("refreshConfirm", { view: "mv_factory_overview_week" })}/>

      <FilterChips
        chips={chips}
        onRemove={(k) => setChips(chips.filter(c => c.k !== k))}
        onClearAll={() => setChips([])}
        onSavePreset={() => openModal("savePreset", { dashboard: "Factory Overview" })}
      />

      {/* KPI row */}
      <div className="kpi-row-5">
        {RPT_FO_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className={"kpi-change " + (k.changeCls || "")}>{k.change} <span className="kpi-sub">{k.sub}</span></div>
          </div>
        ))}
      </div>

      {/* OEE summary (embedded consumer of 15-OEE) */}
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">◉ OEE Summary (today, all lines)</h3>
          <div style={{marginLeft:"auto", display:"flex", gap:8}}>
            <span className="badge badge-blue" style={{fontSize:10}}>Consumer of 15-OEE</span>
            <a className="drill-arrow" onClick={() => onNav("oee_summary")}>Full OEE Dashboard →</a>
          </div>
        </div>
        <div className="oee-embed">
          <div className="oee-kpi"><div className="lbl">OEE</div><div className="val big amber">{RPT_FO_OEE.oee}%</div></div>
          <div className="oee-kpi"><div className="lbl">Availability</div><div className="val">{RPT_FO_OEE.avail}%</div></div>
          <div className="oee-kpi"><div className="lbl">Performance</div><div className="val">{RPT_FO_OEE.perf}%</div></div>
          <div className="oee-kpi"><div className="lbl">Quality</div><div className="val">{RPT_FO_OEE.qual}%</div></div>
          <div className="oee-link">
            <div style={{fontSize:10, color:"var(--muted)", textAlign:"right", marginBottom:4}}>7-day trend</div>
            <Spark data={RPT_FO_OEE.spark} color="var(--amber)" w={200} h={44}/>
          </div>
        </div>
      </div>

      {/* Two-column: trend + top 3 */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 360px", gap:12, marginTop:12}}>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">13-Week Trend — Yield % vs Variance GBP</h3>
            <span className="muted" style={{fontSize:10}}>Target: <span className="mono">91.0%</span></span>
          </div>
          <ChartCombo data={RPT_FO_TREND} target={91.0} h={280}/>
          <div style={{display:"flex", gap:14, fontSize:11, justifyContent:"center", marginTop:4, color:"var(--muted)"}}>
            <span><span style={{display:"inline-block", width:12, height:2, background:"var(--green)", verticalAlign:"middle", marginRight:4}}></span>Yield %</span>
            <span><span style={{display:"inline-block", width:12, height:8, background:"var(--green)", opacity:0.55, verticalAlign:"middle", marginRight:4}}></span>Favourable variance</span>
            <span><span style={{display:"inline-block", width:12, height:8, background:"var(--red)", opacity:0.55, verticalAlign:"middle", marginRight:4}}></span>Adverse variance</span>
            <span><span style={{display:"inline-block", width:12, height:2, background:"var(--info)", verticalAlign:"middle", marginRight:4, borderTop:"1px dashed var(--info)"}}></span>Target</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Top 3 Gains this week</h3>
          </div>
          <div className="rpt-top3">
            {RPT_FO_TOP3_GAINS.map((t, i) => (
              <div key={i} className="rpt-top3-row" onClick={() => onNav("yield_by_line")} style={{cursor:"pointer"}}>
                <div>
                  <div className="t3-line">{t.line}</div>
                  <div className="t3-prod">{t.product}</div>
                </div>
                <div><VarianceBadge gbp={-t.varGBP}/></div>
                <div className="t3-bar"><span className="fill g" style={{width: t.pct + "%"}}></span></div>
              </div>
            ))}
          </div>
          <div className="card-head" style={{marginTop:12}}>
            <h3 className="card-title">Top 3 Losses this week</h3>
          </div>
          <div className="rpt-top3">
            {RPT_FO_TOP3_LOSSES.map((t, i) => (
              <div key={i} className="rpt-top3-row" onClick={() => onNav("yield_by_line")} style={{cursor:"pointer"}}>
                <div>
                  <div className="t3-line">{t.line}</div>
                  <div className="t3-prod">{t.product}</div>
                </div>
                <div><VarianceBadge gbp={-t.varGBP}/></div>
                <div className="t3-bar"><span className="fill r" style={{width: t.pct + "%"}}></span></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* All Lines Summary */}
      <div className="card" style={{marginTop:12}}>
        <div className="card-head">
          <h3 className="card-title">All Lines Summary — {week}</h3>
          <span className="muted" style={{fontSize:11}}>Click a row to drill to Yield by Line</span>
        </div>
        <table>
          <thead><tr>
            <th>Line</th><th>Product</th>
            <th style={{textAlign:"right"}}>Yield %</th>
            <th style={{textAlign:"right"}}>Target %</th>
            <th style={{textAlign:"right"}}>Variance %</th>
            <th style={{textAlign:"right"}}>Variance GBP</th>
            <th>Grade</th>
            <th style={{width:90}}>Trend</th>
          </tr></thead>
          <tbody>
            {RPT_FO_LINES.map((l, i) => (
              <tr key={i} style={{cursor: l.factoryAvg ? "default" : "pointer", fontWeight: l.factoryAvg ? 700 : 400, borderTop: l.factoryAvg ? "2px solid var(--border)" : undefined}}
                  onClick={() => !l.factoryAvg && onNav("yield_by_line")}>
                <td style={{fontWeight: l.factoryAvg ? 700 : 500}}>{l.line}</td>
                <td style={{fontSize:11}}>{l.product}</td>
                <td className="col-yld"><YieldCell val={l.yield} target={l.target}/></td>
                <td className="col-yld"><span className="num-muted">{l.target.toFixed(1)}%</span></td>
                <td className="col-yld"><VariancePctBadge pct={l.varPct}/></td>
                <td className="col-yld"><VarianceBadge gbp={l.varGBP}/></td>
                <td>{l.factoryAvg ? <span className="badge badge-blue" style={{fontSize:10}}>AVG</span> : <GradeBadge g={l.grade}/>}</td>
                <td><Spark data={l.spark} color={l.factoryAvg ? "var(--blue)" : "var(--green)"} w={80} h={22}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ RPT-002 Yield by Line ============

const RptYieldByLine = ({ role, onNav, openModal }) => {
  const [week, setWeek] = React.useState("W/E 19/04/2026");
  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Factory Overview", key:"factory_overview"}, {label:"Yield by Line"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Yield by Line</h1>
            <ScopePill site="Main Site"/>
          </div>
        </div>
        <div className="row-flex">
          <WeekSelector value={week} onChange={setWeek}/>
          <ExportDropdown openModal={openModal} dashboard="Yield by Line"/>
        </div>
      </div>

      <FreshnessStrip at="14:32" cadence="2 min" onRefresh={() => openModal("refreshConfirm", { view: "mv_yield_by_line_week" })}/>

      <FilterChips
        chips={[]}
        onRemove={() => {}}
        onClearAll={() => {}}
        onSavePreset={() => openModal("savePreset", { dashboard: "Yield by Line" })}
      />

      <div className="kpi-row-3">
        {RPT_YBL_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Lines — {week}</h3>
          <span className="muted" style={{fontSize:11}}>Sort any column · Drill into SKU detail</span>
        </div>
        <table>
          <thead><tr>
            <th>Line</th>
            <th>Product Mix</th>
            <th style={{textAlign:"right"}}>KG Output</th>
            <th style={{textAlign:"right"}}>Yield %</th>
            <th style={{textAlign:"right"}}>Target %</th>
            <th style={{textAlign:"right"}}>Variance %</th>
            <th style={{textAlign:"right"}}>Variance GBP</th>
            <th>W/W Change</th>
            <th>Grade</th>
            <th style={{width:90}}>Trend</th>
            <th></th>
          </tr></thead>
          <tbody>
            {RPT_FO_LINES.filter(l => !l.factoryAvg).map((l, i) => (
              <tr key={i} style={{cursor:"pointer"}}>
                <td style={{fontWeight:500}}>{l.line}</td>
                <td style={{fontSize:11, color:"var(--muted)"}}>{l.product}</td>
                <td className="num mono">{(1200 + i * 180).toLocaleString()} kg</td>
                <td className="col-yld"><YieldCell val={l.yield} target={l.target}/></td>
                <td className="col-yld"><span className="num-muted">{l.target.toFixed(1)}%</span></td>
                <td className="col-yld"><VariancePctBadge pct={l.varPct}/></td>
                <td className="col-yld"><VarianceBadge gbp={l.varGBP}/></td>
                <td><WWChange pct={l.wwPct}/></td>
                <td><GradeBadge g={l.grade}/></td>
                <td><Spark data={l.spark} color="var(--green)"/></td>
                <td><a className="drill-arrow" onClick={() => onNav("yield_by_sku")}>Drill →</a></td>
              </tr>
            ))}
            <tr style={{borderTop:"2px solid var(--border)", fontWeight:700, background:"var(--gray-050)"}}>
              <td>Factory Average</td>
              <td style={{fontSize:11, color:"var(--muted)"}}>Weighted</td>
              <td className="num mono">7,180 kg</td>
              <td className="col-yld"><YieldCell val={91.3} target={91.4}/></td>
              <td className="col-yld"><span className="num-muted">91.4%</span></td>
              <td className="col-yld"><VariancePctBadge pct={-0.1}/></td>
              <td className="col-yld"><VarianceBadge gbp={-2340}/></td>
              <td><WWChange pct={0.5}/></td>
              <td><span className="badge badge-blue" style={{fontSize:10}}>AVG</span></td>
              <td><Spark data={[90.4,90.9,91.2,90.8,91.1,91.0,91.3]} color="var(--blue)"/></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ RPT-003 Yield by SKU ============

const RptYieldBySku = ({ role, onNav, openModal }) => {
  const [week, setWeek] = React.useState("W/E 19/04/2026");
  const [lineFilter, setLineFilter] = React.useState("All Lines");
  const [expanded, setExpanded] = React.useState(null);

  const rows = lineFilter === "All Lines" ? RPT_YBS_SKUS : RPT_YBS_SKUS.filter(s => s.lines === lineFilter);

  return (
    <>
      <div className="page-head">
        <div>
          <DrillCrumb trail={[{label:"Reporting", key:"home"}, {label:"Yield by Line", key:"yield_by_line"}, {label:"Yield by SKU"}]} onNav={onNav}/>
          <div className="row-flex" style={{alignItems:"center", gap:10}}>
            <h1 className="page-title">Yield by SKU</h1>
            <ScopePill site="Main Site"/>
          </div>
        </div>
        <div className="row-flex">
          <select value={lineFilter} onChange={e => setLineFilter(e.target.value)} style={{fontSize:12, padding:"4px 8px"}}>
            <option>All Lines</option><option>Line 1</option><option>Line 2</option><option>Line 3</option><option>Line 4</option><option>Line 5</option>
          </select>
          <WeekSelector value={week} onChange={setWeek}/>
          <ExportDropdown openModal={openModal} dashboard="Yield by SKU"/>
        </div>
      </div>

      <FreshnessStrip at="14:32" cadence="2 min"/>

      <FilterChips
        chips={lineFilter !== "All Lines" ? [{k:"line", label:"Line", value:lineFilter}] : []}
        onRemove={() => setLineFilter("All Lines")}
        onClearAll={() => setLineFilter("All Lines")}
        onSavePreset={() => openModal("savePreset", { dashboard: "Yield by SKU" })}
      />

      <div className="kpi-row-3">
        {RPT_YBS_KPIS.map(k => (
          <div key={k.k} className={"kpi " + k.accent}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub || "\u00A0"}</div>
          </div>
        ))}
      </div>

      {lineFilter !== "All Lines" && (
        <div className="card" style={{padding:"10px 14px", marginBottom:10, background:"var(--blue-050)"}}>
          <div className="row-flex" style={{fontSize:12}}>
            <b>{lineFilter}</b>
            <span style={{marginLeft:16}}>KG Output: <b className="mono">2,840 kg</b></span>
            <span style={{marginLeft:16}}>Weighted Yield: <YieldCell val={90.2} target={91.0}/></span>
            <span style={{marginLeft:16}}>Grade: <GradeBadge g="C"/></span>
            <span className="spacer"></span>
            <a style={{color:"var(--blue)", cursor:"pointer", fontSize:11}} onClick={() => setLineFilter("All Lines")}>Clear line filter</a>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">SKUs — {week}</h3>
          <span className="muted" style={{fontSize:11}}>Click a row to expand 13-week trend</span>
        </div>
        <table>
          <thead><tr>
            <th>SKU Code</th><th>Product Name</th><th>Line(s)</th>
            <th style={{textAlign:"right"}}>KG Output</th>
            <th style={{textAlign:"right"}}>Yield %</th>
            <th style={{textAlign:"right"}}>Target %</th>
            <th style={{textAlign:"right"}}>Variance %</th>
            <th style={{textAlign:"right"}}>Variance GBP</th>
            <th>Contribution</th>
            <th style={{width:90}}>Trend (13w)</th>
          </tr></thead>
          <tbody>
            {rows.map((s, i) => (
              <React.Fragment key={i}>
                <tr style={{cursor:"pointer"}} onClick={() => setExpanded(expanded === s.code ? null : s.code)}>
                  <td className="mono" style={{fontWeight:600}}>{s.code}</td>
                  <td style={{fontSize:11}}>{s.name}</td>
                  <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>{s.lines}</td>
                  <td className="num mono">{s.kg.toLocaleString()}</td>
                  <td className="col-yld"><YieldCell val={s.yield} target={s.target}/></td>
                  <td className="col-yld"><span className="num-muted">{s.target.toFixed(1)}%</span></td>
                  <td className="col-yld"><VariancePctBadge pct={s.varPct}/></td>
                  <td className="col-yld"><VarianceBadge gbp={s.varGBP}/></td>
                  <td><span className="contrib-bar"><span className="fill" style={{width: s.contrib + "%"}}></span></span> <span className="mono" style={{fontSize:10}}>{s.contrib}%</span></td>
                  <td><Spark data={s.spark} color="var(--green)"/></td>
                </tr>
                {expanded === s.code && (
                  <tr>
                    <td colSpan={10} style={{background:"var(--gray-050)", padding:14}}>
                      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:12}}>
                        <div>
                          <div className="label" style={{marginBottom:6}}>13-Week Yield Trend — {s.name}</div>
                          <ChartLine
                            data={Array.from({length:13}, (_, i) => ({ w: "W" + (i + 4), y: s.yield + (Math.sin(i) * 1.5) }))}
                            xKey="w" yKey="y" color="var(--green)" target={s.target} h={160}
                          />
                        </div>
                        <div>
                          <div className="label" style={{marginBottom:6}}>13-Week Summary</div>
                          <Summary rows={[
                            { label: "Best week",       value: (s.yield + 1.8).toFixed(1) + "%" },
                            { label: "Worst week",      value: (s.yield - 1.8).toFixed(1) + "%" },
                            { label: "Avg yield 13w",   value: s.yield.toFixed(1) + "%" },
                            { label: "Avg variance GBP", value: "£" + Math.abs(s.varGBP * 0.7).toFixed(0), emphasis: true },
                          ]}/>
                          <button className="btn btn-secondary btn-sm" style={{marginTop:8, width:"100%"}} onClick={(e) => { e.stopPropagation(); alert("Cross-module nav: /production/work-orders?product=" + s.code); }}>View all runs in Production →</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

Object.assign(window, { RptFactoryOverview, RptYieldByLine, RptYieldBySku });
