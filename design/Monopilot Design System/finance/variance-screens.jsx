// ============ FIN-005 Inventory Valuation, FIN-006 FX, FIN-007 Material, FIN-008 Labor, FIN-010 Drill-down ============

// ---------- FIN-005 Inventory Valuation ----------
const FinInventoryValuation = ({ onNav, openModal }) => {
  const [method, setMethod] = React.useState("FIFO");
  const [search, setSearch] = React.useState("");
  const d = FIN_INV_VAL;

  const visible = d.rows.filter(r =>
    !search || r.code.toLowerCase().includes(search.toLowerCase()) || r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Inventory Valuation</div>
          <h1 className="page-title">Inventory Valuation</h1>
          <div className="muted" style={{fontSize:12}}>{d.itemCount} active items · Method: {method} · Valuation date {d.asOf}</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">↻ Recalculate</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("exportReport", { name: "Inventory Valuation" })}>⇪ Export</button>
        </div>
      </div>

      {/* Method selector */}
      <div className="card" style={{display:"flex", alignItems:"center", gap:16, padding:"14px 18px"}}>
        <div className="method-toggle">
          <button className={method === "FIFO" ? "on" : ""} onClick={()=>setMethod("FIFO")}>FIFO (First-In, First-Out)</button>
          <button className={method === "WAC" ? "on" : ""} onClick={()=>setMethod("WAC")}>Weighted Average Cost (WAC)</button>
        </div>
        <div className="row-flex">
          <label className="muted" style={{fontSize:11}}>Valuation Date</label>
          <input type="date" defaultValue={d.asOf} style={{width:140}}/>
          <button className="btn btn-primary btn-sm">Apply</button>
        </div>
        <span className="spacer"/>
        <span className="muted" style={{fontSize:11}}>Default method: FIFO (per <span className="mono">finance_settings.default_valuation_method</span>)</span>
      </div>

      {/* Summary KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
        <div className="kpi blue">
          <div className="kpi-label">Total Inventory Value</div>
          <div className="kpi-value" style={{fontSize:26, fontFamily:"var(--font-mono)"}}>{fmtMoney(d.totalValue, true)}</div>
          <div className="kpi-sub">{d.itemCount} active items · Method: {method} · As of {d.asOf}</div>
        </div>

        <div className="card" style={{margin:0}}>
          <div className="card-head"><h3 className="card-title">Value Distribution</h3></div>
          {d.distribution.map(dist => (
            <div key={dist.cat} className="inv-dist-row">
              <span style={{fontSize:12}}><span className="sl-dot" style={{display:"inline-block", marginRight:6, background: dist.color === "rm" ? "var(--blue)" : dist.color === "pkg" ? "var(--amber)" : dist.color === "wip" ? "var(--muted)" : "var(--green)"}}></span>{dist.cat}</span>
              <div className="idr-bar"><span className={"idr-fill " + dist.color} style={{width: dist.pct + "%"}}/></div>
              <span className="idr-pct">{dist.pct}%</span>
              <span className="idr-val">{fmtMoney(dist.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <input type="text" placeholder="Search by product code or name…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:260}}/>
        <select style={{width:140}}><option>All categories</option><option>RM</option><option>Intermediate</option><option>FA</option><option>Packaging</option></select>
        <select style={{width:160}}><option>All warehouses</option><option>WH-Factory-A</option></select>
        <select style={{width:130}}><option>All aging</option><option>0-30d</option><option>30-60d</option><option>60-90d</option><option>90d+</option></select>
        <input type="number" placeholder="Min value" style={{width:90}}/>
        <input type="number" placeholder="Max value" style={{width:90}}/>
        <span className="spacer"/>
        <button className="clear-all">Clear</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Type</th>
              <th style={{textAlign:"right"}}>Qty on Hand</th>
              <th>UOM</th>
              <th style={{textAlign:"right"}}>Avg Unit ({method})</th>
              <th style={{textAlign:"right"}}>Total Value</th>
              <th>Layers</th>
              <th>Aging</th>
              <th>Last Movement</th>
              <th style={{width:80}}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.code}>
                <td className="mono" style={{fontWeight:600}}>{r.code}</td>
                <td style={{fontSize:12}}>{r.name}</td>
                <td><ItemTypeBadge t={r.itemType}/></td>
                <td className="num mono">{fmtQty(r.qty)}</td>
                <td className="mono" style={{fontSize:11}}>{r.uom}</td>
                <td className="money">£ {r.avgCost.toFixed(4)}/{r.uom.toLowerCase()}</td>
                <td className="money" style={{fontWeight:600}}>{fmtMoney(r.value)}</td>
                <td><a style={{color:"var(--blue)", cursor:"pointer"}} onClick={()=>openModal("fifoLayers", r)}>{r.layers}</a></td>
                <td><AgingBadge a={r.aging}/></td>
                <td className="mono" style={{fontSize:11}}>{r.lastMove}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={()=>openModal("fifoLayers", r)}>View →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{padding:"10px 14px", fontSize:11, color:"var(--muted)", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between"}}>
          <span>Page total: {fmtMoney(visible.reduce((a,r)=>a+r.value, 0))}</span>
          <span>All pages total: <b>{fmtMoney(d.totalValue, true)}</b></span>
        </div>
      </div>
    </>
  );
};

// ---------- FIN-006 FX Rates ----------
const FinFxRates = ({ role, onNav, openModal }) => {
  const [selCurrency, setSelCurrency] = React.useState("EUR");
  const isManager = role === "Finance Manager" || role === "Admin";
  const staleRate = FIN_FX.find(r => r.ageDays && r.ageDays > 7 && r.status === "active");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · FX Rates</div>
          <h1 className="page-title">Currencies &amp; Exchange Rates</h1>
          <div className="muted" style={{fontSize:12}}>Base: GBP · {FIN_FX.filter(r => r.status === "active").length} active currencies</div>
        </div>
        <div className="row-flex">
          {isManager && <button className="btn btn-primary btn-sm" onClick={()=>openModal("fxOverride")}>＋ Add Currency</button>}
        </div>
      </div>

      {staleRate && (
        <div className="alert-amber alert-box" style={{marginBottom:10, fontSize:12, padding:"8px 12px"}}>
          <span>⚠</span>
          <div>Exchange rate for <b>{staleRate.code}</b> was last updated <b>{staleRate.ageDays} days ago</b>. Variance calculations may be inaccurate. (V-FIN-SETUP-03)</div>
          <div className="alert-cta">
            {isManager && <button className="btn btn-sm btn-primary" onClick={()=>openModal("fxOverride", staleRate)}>Update Rate</button>}
          </div>
        </div>
      )}

      {/* Base currency card */}
      <div className="card" style={{display:"flex", alignItems:"center", gap:16, background:"var(--blue-050)"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13, fontWeight:600}}>Base Currency: GBP — British Pound Sterling <span className="badge badge-blue" style={{fontSize:10, marginLeft:6}}>Base</span></div>
          <div className="muted" style={{fontSize:11, marginTop:4}}>All manufacturing costs are stored and reported in GBP. Multi-currency support is available in Phase 2.</div>
        </div>
        {isManager && <a style={{fontSize:12, color:"var(--red)", cursor:"pointer"}}>Change Base Currency</a>}
      </div>

      <div className="card" style={{padding:0}}>
        <div className="card-head" style={{padding:"12px 14px", marginBottom:0, borderBottom:"1px solid var(--border)"}}>
          <h3 className="card-title">Active Currencies</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>ISO Code</th>
              <th>Name</th>
              <th>Symbol</th>
              <th style={{textAlign:"right"}}>Exchange Rate (to GBP)</th>
              <th>Effective Date</th>
              <th>Source</th>
              <th>Rate Age</th>
              <th>Status</th>
              <th style={{width:200}}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {FIN_FX.map(r => (
              <tr key={r.code}>
                <td className="mono" style={{fontWeight:700}}>{r.code}</td>
                <td style={{fontSize:12}}>{r.name}</td>
                <td className="mono">{r.sym}</td>
                <td className="money">{fmtRate(r.rate)}</td>
                <td className="mono" style={{fontSize:11}}>{r.effDate || "—"}</td>
                <td><FxSourceBadge s={r.source}/></td>
                <td>
                  {r.ageDays == null ? <span className="rate-age fresh">—</span> :
                   r.ageDays > 7 ? <span className="rate-age expired">{r.ageDays}d</span> :
                   r.ageDays > 5 ? <span className="rate-age stale">{r.ageDays}d</span> :
                   <span className="rate-age fresh">{r.ageDays}d</span>}
                </td>
                <td><span className={"badge " + (r.status === "base" ? "badge-blue" : r.status === "active" ? "badge-green" : "badge-gray")} style={{fontSize:9}}>{r.status}</span></td>
                <td>
                  {!r.base && isManager && (
                    <div className="row-flex">
                      <button className="btn btn-secondary btn-sm" onClick={()=>openModal("fxOverride", r)}>Edit Rate</button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setSelCurrency(r.code)}>History</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rate history + trend */}
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12}}>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Exchange Rate History — {selCurrency}</h3>
            <select value={selCurrency} onChange={e=>setSelCurrency(e.target.value)} style={{width:100, padding:"3px 6px"}}>
              {FIN_FX.filter(r => !r.base).map(r => <option key={r.code}>{r.code}</option>)}
            </select>
          </div>
          <table>
            <thead><tr><th>Effective Date</th><th style={{textAlign:"right"}}>Rate</th><th>Source</th><th>Updated By</th><th>Reason</th></tr></thead>
            <tbody>
              {FIN_FX_HISTORY.map((h, i) => (
                <tr key={i}>
                  <td className="mono" style={{fontSize:11}}>{h.date}</td>
                  <td className="money">{fmtRate(h.rate)}</td>
                  <td><FxSourceBadge s={h.source}/></td>
                  <td style={{fontSize:11}}>{h.user}</td>
                  <td style={{fontSize:11, color:"var(--muted)"}}>{h.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Rate Trend — 30 Days</h3>
          </div>
          <TrendChart
            series={[
              FIN_FX_HISTORY.map(h => h.rate * 10000).reverse(),
              FIN_FX_HISTORY.map(h => 7900).reverse(), // USD mock constant
            ]}
            colors={["#1976D2", "#f59e0b"]}
            labels={FIN_FX_HISTORY.map(h => h.date.slice(5)).reverse()}
            yMax={10000}
          />
          <div className="chart-legend">
            <span className="cl-item"><span className="cl-dot" style={{background:"#1976D2"}}></span>EUR</span>
            <span className="cl-item"><span className="cl-dot" style={{background:"#f59e0b"}}></span>USD</span>
          </div>
        </div>
      </div>
    </>
  );
};

// ---------- FIN-007 Material Variance ----------
const FinVarMaterial = ({ onNav, onOpenWo, openModal }) => {
  const totals = {
    total: FIN_VAR_MATERIAL.reduce((a, r) => a + r.totalVar, 0),
    price: FIN_VAR_MATERIAL.reduce((a, r) => a + r.priceDelta * r.actualQty, 0),
    usage: FIN_VAR_MATERIAL.reduce((a, r) => a + r.usageDelta * r.stdUnit, 0),
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Variance · Material</div>
          <h1 className="page-title">Material Variance Report</h1>
          <div className="muted" style={{fontSize:12}}>Period: Apr 2026 MTD · {FIN_VAR_MATERIAL.length} items</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("exportReport", { name: "Material Variance" })}>⇪ Export CSV</button>
        </div>
      </div>

      <div className="filter-bar">
        <select style={{width:140}}><option>MTD</option><option>Last Month</option><option>QTD</option><option>YTD</option><option>Custom</option></select>
        <input type="date" placeholder="From" style={{width:130}}/>
        <input type="date" placeholder="To" style={{width:130}}/>
        <input type="text" placeholder="Item search…" style={{width:160}}/>
        <select style={{width:130}}><option>All item types</option><option>RM</option><option>Intermediate</option></select>
        <select style={{width:130}}><option>All cost centers</option></select>
        <select style={{width:130}}><option>All variance</option><option>Price</option><option>Usage</option><option>Both</option></select>
        <select style={{width:140}}><option>All significance</option><option>&gt; £500</option><option>&gt; 5%</option><option>&gt; 10%</option></select>
        <span className="spacer"/>
        <button className="clear-all">Clear</button>
      </div>

      {/* KPIs */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, marginBottom:12}}>
        <div className="kpi red">
          <div className="kpi-label">Total Material Variance MTD</div>
          <div className="kpi-value" style={{fontSize:22, fontFamily:"var(--font-mono)"}}>{fmtMoneySigned(totals.total)}</div>
          <div className="kpi-sub" style={{color:"var(--red-700)"}}>Unfavorable · ↑ 3.4% vs last month</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">Price Variance (MPV est.)</div>
          <div className="kpi-value" style={{fontSize:22, fontFamily:"var(--font-mono)"}}>{fmtMoneySigned(totals.price)}</div>
          <div className="kpi-sub muted">P2 — full decomposition EPIC 10-I</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">Usage Variance (MQV est.)</div>
          <div className="kpi-value" style={{fontSize:22, fontFamily:"var(--font-mono)"}}>{fmtMoneySigned(totals.usage)}</div>
          <div className="kpi-sub muted">P2 — full decomposition EPIC 10-I</div>
        </div>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Item Name</th>
              <th>Period</th>
              <th style={{textAlign:"right"}}>Std Qty</th>
              <th style={{textAlign:"right"}}>Actual Qty</th>
              <th style={{textAlign:"right"}}>Δ Usage</th>
              <th style={{textAlign:"right"}}>Std Unit</th>
              <th style={{textAlign:"right"}}>Act Unit</th>
              <th style={{textAlign:"right"}}>Δ Price</th>
              <th style={{textAlign:"right"}}>Total Var</th>
              <th>%</th>
              <th>WO Links</th>
              <th style={{width:100}}></th>
            </tr>
          </thead>
          <tbody>
            {FIN_VAR_MATERIAL.map(r => (
              <tr key={r.itemCode}>
                <td className="mono" style={{fontWeight:600}}>{r.itemCode}</td>
                <td style={{fontSize:12}}>{r.itemName}</td>
                <td className="mono" style={{fontSize:11}}>{r.period}</td>
                <td className="num mono">{fmtQty(r.stdQty)}</td>
                <td className="num mono">{fmtQty(r.actualQty)}</td>
                <td className={"money " + (r.usageDelta > 0 ? "neg" : r.usageDelta < 0 ? "pos" : "")}>{r.usageDelta > 0 ? "+" : ""}{fmtQty(r.usageDelta)} kg</td>
                <td className="money">£ {r.stdUnit.toFixed(2)}</td>
                <td className="money">£ {r.actualUnit.toFixed(2)}</td>
                <td className={"money " + (r.priceDelta > 0 ? "neg" : r.priceDelta < 0 ? "pos" : "")}>{r.priceDelta > 0 ? "+" : ""}£ {r.priceDelta.toFixed(2)}</td>
                <td className="money" style={{fontWeight:600}}><span className={r.totalVar > 0 ? "neg" : "pos"}>{fmtMoneySigned(r.totalVar)}</span></td>
                <td><VarBadge value={r.totalVar} percent={r.variancePct} size="sm"/></td>
                <td style={{fontSize:11}}><a style={{color:"var(--blue)", cursor:"pointer"}}>{r.woCount} WOs</a></td>
                <td>
                  <div className="row-flex">
                    <button className="btn btn-ghost btn-sm" onClick={()=>onNav("var_drilldown")}>Drill</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>openModal("varianceNote", { item: r.itemCode })}>Note</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{fontSize:11, marginTop:10}}>
        P1 shows total variance. Full MPV/MQV decomposition available in Phase 2 — EPIC 10-I Variance Decomposition.
      </div>
    </>
  );
};

// ---------- FIN-008 Labor Variance ----------
const FinVarLabor = ({ onNav, openModal }) => {
  const totalVar = FIN_VAR_LABOR.reduce((a, r) => a + r.variance, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Variance · Labor</div>
          <h1 className="page-title">Labor Variance Report</h1>
          <div className="muted" style={{fontSize:12}}>Period: Apr 2026 MTD · {FIN_VAR_LABOR.length} operations</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("exportReport", { name: "Labor Variance" })}>⇪ Export CSV</button>
        </div>
      </div>

      <div className="filter-bar">
        <select style={{width:140}}><option>MTD</option><option>Last Month</option><option>QTD</option></select>
        <input type="date" placeholder="From" style={{width:130}}/>
        <input type="date" placeholder="To" style={{width:130}}/>
        <select style={{width:130}}><option>All lines</option><option>Line 1</option><option>Line 2</option><option>Line 3</option><option>Line 4</option></select>
        <select style={{width:140}}><option>All cost centers</option></select>
        <select style={{width:140}}><option>All operations</option><option>Mixing</option><option>Grinding</option><option>Stuffing</option><option>Smoking</option><option>Forming</option></select>
        <select style={{width:140}}><option>Variance: All</option><option>Rate</option><option>Efficiency</option></select>
        <span className="spacer"/>
        <button className="clear-all">Clear</button>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, marginBottom:12}}>
        <div className="kpi red">
          <div className="kpi-label">Total Labor Variance MTD</div>
          <div className="kpi-value" style={{fontSize:22, fontFamily:"var(--font-mono)"}}>{fmtMoneySigned(totalVar)}</div>
          <div className="kpi-sub" style={{color:"var(--red-700)"}}>Unfavorable</div>
        </div>
        <div className="kpi gray">
          <div className="kpi-label">Rate Variance (LRV) <span className="badge badge-gray" style={{fontSize:9, marginLeft:6}}>Phase 2</span></div>
          <div className="kpi-value" style={{fontSize:18, color:"var(--muted)"}}>— </div>
          <div className="kpi-sub muted">Full rate vs efficiency decomposition in Phase 2</div>
        </div>
        <div className="kpi gray">
          <div className="kpi-label">Efficiency Variance (LEV) <span className="badge badge-gray" style={{fontSize:9, marginLeft:6}}>Phase 2</span></div>
          <div className="kpi-value" style={{fontSize:18, color:"var(--muted)"}}>— </div>
          <div className="kpi-sub muted">Full rate vs efficiency decomposition in Phase 2</div>
        </div>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>WO Number</th>
              <th>Operation</th>
              <th>Line</th>
              <th style={{textAlign:"right"}}>Std Hrs</th>
              <th style={{textAlign:"right"}}>Actual Hrs</th>
              <th style={{textAlign:"right"}}>Δ Hrs</th>
              <th style={{textAlign:"right"}}>Std Rate</th>
              <th style={{textAlign:"right"}}>Act Rate</th>
              <th style={{textAlign:"right"}}>Std Cost</th>
              <th style={{textAlign:"right"}}>Act Cost</th>
              <th style={{textAlign:"right"}}>Variance</th>
              <th>%</th>
              <th style={{width:80}}></th>
            </tr>
          </thead>
          <tbody>
            {FIN_VAR_LABOR.map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{r.wo}</td>
                <td style={{fontSize:12}}>{r.op}</td>
                <td style={{fontSize:11}}>{r.line}</td>
                <td className="num mono">{r.stdHrs.toFixed(3)}</td>
                <td className="num mono">{r.actualHrs.toFixed(3)}</td>
                <td className={"money " + (r.hrsDelta > 0 ? "neg" : r.hrsDelta < 0 ? "pos" : "")}>{r.hrsDelta > 0 ? "+" : ""}{r.hrsDelta.toFixed(3)} hrs</td>
                <td className="money">£ {r.stdRate.toFixed(2)}</td>
                <td className="money">£ {r.actualRate.toFixed(2)}</td>
                <td className="money">{fmtMoney(r.stdCost)}</td>
                <td className="money">{fmtMoney(r.actualCost)}</td>
                <td className="money" style={{fontWeight:600}}><span className={r.variance > 0 ? "neg" : "pos"}>{fmtMoneySigned(r.variance)}</span></td>
                <td><VarBadge value={r.variance} percent={r.variancePct} size="sm"/></td>
                <td><button className="btn btn-ghost btn-sm">View WO</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{fontSize:11, marginTop:10}}>
        Full rate vs efficiency decomposition (LRV / LEV) will be available in Phase 2 — EPIC 10-I Variance Decomposition.
      </div>
    </>
  );
};

// ---------- FIN-010 Variance Drill-down ----------
const FinVarDrilldown = ({ onNav, onOpenWo }) => {
  const [level, setLevel] = React.useState(0);
  const [selCat, setSelCat] = React.useState(null);
  const [selItem, setSelItem] = React.useState(null);
  const [selWo, setSelWo] = React.useState(null);

  const goL0 = () => { setLevel(0); setSelCat(null); setSelItem(null); setSelWo(null); };
  const goL1 = (cat) => { setLevel(1); setSelCat(cat); setSelItem(null); setSelWo(null); };
  const goL2 = (item) => { setLevel(2); setSelItem(item); setSelWo(null); };
  const goL3 = (wo) => { setLevel(3); setSelWo(wo); };
  const goL4 = () => { setLevel(4); };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Variance Drill-down</div>
          <h1 className="page-title">Variance Drill-down</h1>
          <div className="muted" style={{fontSize:12}}>Period: Apr 2026 MTD · Total variance {fmtMoney(FIN_DRILL.total, true)}</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
        </div>
      </div>

      {/* Breadcrumb trail */}
      <div className="drill-trail">
        <span className={"dt-step " + (level === 0 ? "on" : "")} onClick={goL0}>Total Variance</span>
        {level >= 1 && <><span className="dt-sep">›</span><span className={"dt-step " + (level === 1 ? "on" : "")} onClick={()=>{setLevel(1); setSelItem(null); setSelWo(null);}}>{selCat}</span></>}
        {level >= 2 && <><span className="dt-sep">›</span><span className={"dt-step " + (level === 2 ? "on" : "")} onClick={()=>{setLevel(2); setSelWo(null);}}>{selItem?.name}</span></>}
        {level >= 3 && <><span className="dt-sep">›</span><span className={"dt-step " + (level === 3 ? "on" : "")} onClick={()=>setLevel(3)}>{selWo}</span></>}
        {level >= 4 && <><span className="dt-sep">›</span><span className="dt-step on">Transaction TX-88901</span></>}
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 260px", gap:14}}>
        <div>
          {/* Level 0 */}
          {level === 0 && (
            <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginBottom:12}}>
              {FIN_DRILL.l0.map(t => (
                <div key={t.cat} className="card" style={{margin:0, padding:14, cursor:"pointer"}} onClick={()=>goL1(t.cat)}>
                  <div className="muted" style={{fontSize:10, textTransform:"uppercase"}}>{t.cat} Variance</div>
                  <div className="money big">{fmtMoneySigned(t.value)}</div>
                  <div className="muted" style={{fontSize:12, marginTop:8}}>Drill in →</div>
                </div>
              ))}
            </div>
          )}

          {/* Level 1: Category -> Item list */}
          {level === 1 && (
            <div className="card" style={{padding:0}}>
              <div className="card-head" style={{padding:"12px 14px", marginBottom:0, borderBottom:"1px solid var(--border)"}}>
                <h3 className="card-title">{selCat} — items ranked by absolute variance</h3>
              </div>
              {selCat === "Material" && FIN_DRILL.l1Material.map(r => (
                <div key={r.code} className="var-alert-row" onClick={()=>goL2(r)}>
                  <span className="mono" style={{fontWeight:600}}>{r.code}</span>
                  <span style={{fontSize:12}}>{r.name}</span>
                  <div className="rank-bar" style={{gridColumn:"3 / 5"}}><span className="rb-fill" style={{width: Math.min(100, Math.abs(r.variance / 1000 * 100)) + "%"}}/></div>
                  <span className="money neg">{fmtMoneySigned(r.variance)}</span>
                  <span className="money neg">{fmtPct(r.pct)}</span>
                </div>
              ))}
              {selCat !== "Material" && (
                <div className="empty-panel">
                  <div className="ep-ic">Δ</div>
                  <div className="ep-head">Drill-down data for {selCat}</div>
                  <div className="ep-body">Item-level contributions for {selCat} variance in this period.</div>
                </div>
              )}
            </div>
          )}

          {/* Level 2: Item -> WO list */}
          {level === 2 && selItem && (
            <div className="card" style={{padding:0}}>
              <div className="card-head" style={{padding:"12px 14px", marginBottom:0, borderBottom:"1px solid var(--border)"}}>
                <h3 className="card-title">{selItem.name} — consuming WOs</h3>
                <span className="muted" style={{fontSize:11}}>Total variance {fmtMoneySigned(selItem.variance)}</span>
              </div>
              <table>
                <thead><tr><th>WO Number</th><th>Date</th><th style={{textAlign:"right"}}>Qty Consumed</th><th style={{textAlign:"right"}}>Unit Used</th><th style={{textAlign:"right"}}>Std Unit</th><th style={{textAlign:"right"}}>Variance</th></tr></thead>
                <tbody>
                  {FIN_DRILL.l2Breast.map(r => (
                    <tr key={r.wo} style={{cursor:"pointer"}} onClick={()=>goL3(r.wo)}>
                      <td className="mono" style={{color:"var(--blue)", fontWeight:600}}>{r.wo}</td>
                      <td className="mono" style={{fontSize:11}}>{r.date}</td>
                      <td className="num mono">{fmtQty(r.qty)}</td>
                      <td className="money">£ {r.unitUsed.toFixed(4)}</td>
                      <td className="money">£ {r.unitStd.toFixed(4)}</td>
                      <td className="money neg" style={{fontWeight:600}}>{fmtMoneySigned(r.variance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Level 3: WO summary embedded */}
          {level === 3 && selWo && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">{selWo} — embedded cost summary</h3>
                <button className="btn btn-secondary btn-sm" onClick={()=>onOpenWo(selWo)}>View Full WO Cost Card →</button>
              </div>
              <div style={{fontSize:12, padding:"10px 0"}}>
                <div><b>Chicken Breast consumed:</b> 980.000 kg × £ 5.45 actual vs £ 5.20 standard = <span className="money neg">£ +245.00 variance</span></div>
                <div style={{marginTop:8}}><b>Transaction breakdown:</b></div>
                <div style={{marginTop:4, paddingLeft:14, fontFamily:"var(--font-mono)", fontSize:11}}>
                  <div style={{cursor:"pointer", color:"var(--blue)"}} onClick={goL4}>• TX-88901 · 2026-04-21 06:02 · LP-4431 · 420 kg · £ 5.45/kg (FIFO)</div>
                  <div>• TX-88902 · 2026-04-21 06:04 · LP-4432 · 560 kg · £ 5.45/kg (FIFO)</div>
                </div>
              </div>
            </div>
          )}

          {/* Level 4: Transaction */}
          {level === 4 && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Transaction TX-88901 — raw record</h3></div>
              <Summary rows={[
                { label: "Transaction ID", value: "TX-88901", mono: true },
                { label: "Timestamp", value: "2026-04-21 06:02:14 UTC", mono: true },
                { label: "LP consumed", value: "LP-4431 →", mono: true },
                { label: "Qty", value: "420.000 kg" },
                { label: "Unit cost", value: "£ 5.4500/kg" },
                { label: "Cost method", value: "FIFO (Layer #2)" },
                { label: "Source", value: "wo_consumption" },
                { label: "Linked WO", value: "WO-2026-0108", mono: true },
                { label: "Variance contribution", value: "£ +105.00", emphasis: true },
              ]}/>
              <div style={{fontSize:11, color:"var(--muted)", marginTop:8}}>Source: <span className="mono">material_consumption_costs</span> · Linked to <span className="mono">05-WH.license_plate_movements</span>.</div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div>
          <div className="card" style={{position:"sticky", top:100}}>
            <div className="fin-section-title">Drill path</div>
            <div style={{fontSize:12}}>
              <div style={{padding:"4px 0"}}>Period: <b>Apr 2026 MTD</b></div>
              {selCat && <div style={{padding:"4px 0"}}>Category: <b>{selCat}</b></div>}
              {selItem && <div style={{padding:"4px 0"}}>Item: <b>{selItem.code}</b></div>}
              {selWo && <div style={{padding:"4px 0"}}>WO: <b className="mono">{selWo}</b></div>}
            </div>
            <div className="fin-section" style={{marginTop:10}}>
              <div className="fin-section-title">Running variance</div>
              <div className="money big" style={{fontSize:20}}>
                {level === 0 ? fmtMoneySigned(FIN_DRILL.total) :
                 level === 1 && selCat === "Material" ? fmtMoneySigned(FIN_DRILL.l0[0].value) :
                 level === 2 ? fmtMoneySigned(selItem.variance) :
                 fmtMoneySigned(245.00)}
              </div>
            </div>
            <div className="fin-section">
              <div className="fin-section-title">Quick actions</div>
              <button className="btn btn-secondary btn-sm" style={{width:"100%", marginBottom:6}}>⇪ Export current level</button>
              <button className="btn btn-secondary btn-sm" style={{width:"100%"}}>＋ Add variance note</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { FinInventoryValuation, FinFxRates, FinVarMaterial, FinVarLabor, FinVarDrilldown });
