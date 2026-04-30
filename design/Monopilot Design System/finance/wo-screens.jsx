// ============ FIN-003a — WO Costs List + FIN-003b WO Cost Detail ============

const FinWoList = ({ role, onNav, onOpenWo, openModal }) => {
  const [tab, setTab] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [vFilter, setVFilter] = React.useState("all");

  const tabs = [
    { k: "all",     l: "All",      c: FIN_WOS.length },
    { k: "open",    l: "Open",     c: FIN_WOS.filter(r => r.status === "open").length },
    { k: "closed",  l: "Closed",   c: FIN_WOS.filter(r => r.status === "closed").length },
    { k: "posted",  l: "Posted",   c: FIN_WOS.filter(r => r.status === "posted").length },
  ];

  const visible = FIN_WOS.filter(r =>
    (tab === "all" || r.status === tab) &&
    (vFilter === "all" ||
      (vFilter === "fav" && r.variance < 0) ||
      (vFilter === "unfav" && r.variance > 0) ||
      (vFilter === "5" && Math.abs(r.variancePct) > 5) ||
      (vFilter === "10" && Math.abs(r.variancePct) > 10)) &&
    (!search ||
      r.wo.toLowerCase().includes(search.toLowerCase()) ||
      r.product.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · WO Costs</div>
          <h1 className="page-title">WO Costs</h1>
          <div className="muted" style={{fontSize:12}}>
            {FIN_WOS.length} WOs · {tabs.find(t=>t.k==="open").c} Open · {tabs.find(t=>t.k==="closed").c} Closed · {tabs.find(t=>t.k==="posted").c} Posted to D365
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("exportReport", { name: "WO Costs" })}>⇪ Export CSV</button>
        </div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button key={t.k} className={"tab-btn " + (tab === t.k ? "on" : "")} onClick={()=>setTab(t.k)}>
            {t.l} <span className="count">{t.c}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search WO# or product…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:240}}/>
        <input type="date" placeholder="From" style={{width:130}}/>
        <input type="date" placeholder="To" style={{width:130}}/>
        <select value={vFilter} onChange={e=>setVFilter(e.target.value)} style={{width:140}}>
          <option value="all">All variance</option>
          <option value="fav">Favorable</option>
          <option value="unfav">Unfavorable</option>
          <option value="5">&gt; 5%</option>
          <option value="10">&gt; 10%</option>
        </select>
        <select style={{width:130}}><option>All cost centers</option><option>FProd01</option><option>FProd02</option><option>FProd03</option><option>FProd04</option></select>
        <select style={{width:130}}><option>All lines</option><option>Line 1</option><option>Line 2</option><option>Line 3</option><option>Line 4</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear</button>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>WO Number</th>
              <th>Product</th>
              <th>Line</th>
              <th>Cost Center</th>
              <th style={{textAlign:"right"}}>Std Cost</th>
              <th style={{textAlign:"right"}}>Actual</th>
              <th style={{textAlign:"right"}}>Variance</th>
              <th>%</th>
              <th style={{textAlign:"right"}}>Unit (act)</th>
              <th>Status</th>
              <th>Costing Date</th>
              <th>D365 Journal</th>
              <th style={{width:80}}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.wo} style={{cursor:"pointer"}} onClick={()=>onOpenWo(r.wo)}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{r.wo}</td>
                <td><div style={{fontSize:12}}>{r.product}</div><div className="mono muted" style={{fontSize:10}}>{r.productCode}</div></td>
                <td style={{fontSize:11}}>{r.line}</td>
                <td className="mono" style={{fontSize:11}}>{r.cc}</td>
                <td className="money">{fmtMoney(r.stdCost)}</td>
                <td className="money" style={{fontWeight:600}}>{fmtMoney(r.actual)}</td>
                <td className={"money " + (r.variance < 0 ? "pos" : r.variance > 0 ? "neg" : "")}>{fmtMoneySigned(r.variance)}</td>
                <td><VarBadge value={r.variance} percent={r.variancePct} size="sm"/></td>
                <td className="money" style={{fontSize:11}}>£ {r.unitActual.toFixed(2)}/kg</td>
                <td><WoCostStatus s={r.status}/></td>
                <td className="mono" style={{fontSize:11}}>{r.costDate}</td>
                <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>{r.d365 || "—"}</td>
                <td onClick={e=>e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>onOpenWo(r.wo)}>View →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <div className="empty-panel">
          <div className="ep-ic">⚒</div>
          <div className="ep-head">No work orders match the current filters.</div>
          <div className="ep-body">Costs are calculated automatically when a work order is completed.</div>
          <div className="ep-ctas">
            <button className="btn btn-secondary btn-sm" onClick={()=>{setTab("all"); setSearch(""); setVFilter("all");}}>Clear Filters</button>
          </div>
        </div>
      )}
    </>
  );
};

// ============ FIN-003b — WO Cost Summary Detail ============
const FinWoDetail = ({ woId, role, onBack, onNav, openModal }) => {
  const d = woId === "WO-2026-0108" ? FIN_WO_DETAIL_KIELBASA : FIN_WO_DETAIL;
  const [expanded, setExpanded] = React.useState(new Set(["material"]));
  const toggle = (k) => {
    const next = new Set(expanded);
    if (next.has(k)) next.delete(k); else next.add(k);
    setExpanded(next);
  };

  const d365Badge = d.d365Status === "posted"
    ? { cls: "badge-green", text: "✓ Posted to D365" }
    : d.d365Status === "closed"
    ? { cls: "badge-amber", text: "⏱ Awaiting D365 batch consolidation — next run at 23:00 UTC" }
    : { cls: "badge-gray",  text: "WO not yet closed — costs accumulating" };

  const borderColor = d.variancePct >= 10 ? "var(--red)" : d.variancePct >= 5 ? "var(--amber)" : d.variance < 0 ? "var(--green)" : "var(--green)";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb">
            <a onClick={onBack}>Finance · WO Costs</a> · {d.wo}
          </div>
          <h1 className="page-title">{d.wo} — Cost Summary</h1>
          <div className="muted" style={{fontSize:12}}>
            {d.product.code} · {d.product.name} · {d.line} · {d.cc} · <a style={{color:"var(--blue)", cursor:"pointer"}}>Back to WO in Production →</a>
          </div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("varianceNote", { wo: d.wo, product: d.product.name })}>＋ Add Note</button>
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
          <button className="btn btn-primary btn-sm">↻ Recalculate</button>
        </div>
      </div>

      {/* Two-column grid */}
      <div style={{display:"grid", gridTemplateColumns:"360px 1fr", gap:14, alignItems:"flex-start"}}>

        {/* LEFT — WO Information */}
        <div className="card">
          <div className="card-head"><h3 className="card-title">WO Information</h3></div>
          <div style={{fontSize:12}}>
            <div style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em"}}>WO Number</div><div className="mono" style={{fontSize:14, fontWeight:700, color:"var(--blue)"}}>{d.wo}</div></div>
            <div style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em"}}>Product</div><div>{d.product.name}</div><div className="mono muted" style={{fontSize:10}}>{d.product.code}</div></div>
            <div style={{padding:"6px 0", borderBottom:"1px solid var(--border)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
              <div><div className="muted" style={{fontSize:10}}>PLANNED QTY</div><div className="mono">{fmtQty(d.plannedQty)} kg</div></div>
              <div><div className="muted" style={{fontSize:10}}>PRODUCED QTY</div><div className="mono">{fmtQty(d.producedQty)} kg</div></div>
            </div>
            <div style={{padding:"6px 0", borderBottom:"1px solid var(--border)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
              <div><div className="muted" style={{fontSize:10}}>YIELD</div><div className="mono" style={{fontWeight:600}}>{d.yield.toFixed(1)}%</div></div>
              <div><div className="muted" style={{fontSize:10}}>STATUS</div><WoCostStatus s={d.status}/></div>
            </div>
            <div style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><div className="muted" style={{fontSize:10}}>PRODUCTION LINE</div><div>{d.line}</div></div>
            <div style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><div className="muted" style={{fontSize:10}}>COST CENTER</div><div className="mono">{d.cc}</div></div>
            <div style={{padding:"6px 0", borderBottom:"1px solid var(--border)"}}><div className="muted" style={{fontSize:10}}>START</div><div className="mono" style={{fontSize:11}}>{d.startDate}</div></div>
            <div style={{padding:"6px 0"}}><div className="muted" style={{fontSize:10}}>ACTUAL END</div><div className="mono" style={{fontSize:11}}>{d.actualEnd}</div></div>
          </div>
          <div style={{marginTop:12, paddingTop:12, borderTop:"1px dashed var(--border)"}}>
            <a onClick={()=>onNav("wos")} style={{fontSize:11, color:"var(--blue)", cursor:"pointer"}}>← All WO Costs</a>
          </div>
        </div>

        {/* RIGHT — Cost Summary */}
        <div>
          <div className="card" style={{borderLeft:`4px solid ${borderColor}`}}>
            <div className="row-flex" style={{alignItems:"flex-start", marginBottom:8}}>
              <div style={{flex:1}}>
                <div className="muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em"}}>Actual Total Cost</div>
                <div className="money big" style={{fontSize:30}}>{fmtMoney(d.actualCost, true)}</div>
                <div style={{fontSize:12, color:"var(--muted)", marginTop:4}}>Standard: {fmtMoney(d.stdCost, true)}</div>
                <div style={{fontSize:13, marginTop:4}}>
                  Variance: <span className={d.variance < 0 ? "money pos" : "money neg"}>{fmtMoneySigned(d.variance)} ({fmtPct(d.variancePct)})</span>
                </div>
              </div>
              <CostStatus variance={d.variance} variancePct={d.variancePct}/>
            </div>
            <div style={{fontSize:12, paddingTop:8, borderTop:"1px solid var(--border)"}}>
              Unit Cost Actual: <b className="mono">£ {d.unitActual.toFixed(2)}/kg</b>
              <span style={{margin:"0 10px", color:"var(--gray-300)"}}>|</span>
              Standard: <b className="mono">£ {d.unitStd.toFixed(2)}/kg</b>
              <span style={{margin:"0 10px", color:"var(--gray-300)"}}>|</span>
              Produced: <b className="mono">{fmtQty(d.producedQty)} kg</b>
            </div>
            <div className="muted" style={{fontSize:11, marginTop:4, fontFamily:"var(--font-mono)"}}>Last calculated: {d.calculatedAt}</div>
          </div>

          {/* Cost Breakdown bars */}
          <div className="card">
            <div className="card-head"><h3 className="card-title">Cost Breakdown</h3></div>
            <div className="cost-breakdown">
              {d.breakdown.map(r => (
                <div key={r.cat} className="cost-row">
                  <span className="cr-label">{r.cat}</span>
                  <div className="cr-track"><span className={"cr-fill " + r.color} style={{width: (r.actual / d.actualCost * 100) + "%"}}/></div>
                  <span className="cr-val">{fmtMoney(r.actual)}</span>
                  <span className="cr-pct">{(r.actual / d.actualCost * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div className="stack-legend" style={{marginTop:12}}>
              <span className="sl-item"><span className="sl-dot mat"/> Material</span>
              <span className="sl-item"><span className="sl-dot lab"/> Labor</span>
              <span className="sl-item"><span className="sl-dot oh"/> Overhead</span>
              <span className="sl-item"><span className="sl-dot waste"/> Waste</span>
            </div>

            {/* Waterfall — std → actual */}
            <div className="fin-section" style={{marginTop:14}}>
              <div className="fin-section-title">Variance Waterfall — Standard → Actual</div>
              <div className="waterfall">
                <div className="waterfall-bar total"><span className="wf-label">Standard baseline</span><div className="wf-track"><span className="wf-fill" style={{width: (d.stdCost / d.actualCost * 100) + "%"}}/></div><span className="wf-val">{fmtMoney(d.stdCost)}</span></div>
                {d.breakdown.map(r => {
                  const cls = r.variance > 0 ? "unfav" : r.variance < 0 ? "fav" : "neutral";
                  const width = Math.min(90, Math.abs(r.variance / d.actualCost * 100 * 4));
                  return (
                    <div key={r.cat} className={"waterfall-bar " + cls}>
                      <span className="wf-label">{r.cat} variance</span>
                      <div className="wf-track"><span className="wf-fill" style={{width: width + "%"}}/></div>
                      <span className={"wf-val " + (r.variance > 0 ? "pos" : r.variance < 0 ? "neg" : "")}>{fmtMoneySigned(r.variance)}</span>
                    </div>
                  );
                })}
                <div className="waterfall-bar total"><span className="wf-label">Actual total</span><div className="wf-track"><span className="wf-fill" style={{width:"100%"}}/></div><span className="wf-val">{fmtMoney(d.actualCost)}</span></div>
              </div>
            </div>
          </div>

          {/* Variance Breakdown — expandable rows */}
          <div className="card" style={{padding:0}}>
            <div className="card-head" style={{padding:"12px 14px", marginBottom:0, borderBottom:"1px solid var(--border)"}}>
              <h3 className="card-title">Variance Breakdown</h3>
            </div>
            <div className="expand-row" onClick={()=>toggle("material")}>
              <span className="er-chev">{expanded.has("material") ? "▼" : "▶"}</span>
              <span className="er-label">Material Variance</span>
              <span className={"money " + (d.varianceDetail.material.total > 0 ? "neg" : "pos")}>{fmtMoneySigned(d.varianceDetail.material.total)}</span>
              <VarBadge value={d.varianceDetail.material.total} percent={(d.varianceDetail.material.total / d.breakdown.find(b=>b.cat==="Material").std * 100)} size="sm"/>
            </div>
            {expanded.has("material") && (
              <div className="expand-body">
                <div className="eb-sub">Price component (MPV): <span className="money neg">{fmtMoneySigned(d.varianceDetail.material.price)}</span> <span className="muted">— P2 full decomposition EPIC 10-I</span></div>
                <div className="eb-sub">Usage component (MQV): <span className="money neg">{fmtMoneySigned(d.varianceDetail.material.usage)}</span> <span className="muted">— P2</span></div>
                <div className="eb-sub" style={{marginTop:6}}><a onClick={()=>onNav("var_material")} style={{color:"var(--blue)", cursor:"pointer"}}>View material variance report →</a></div>
              </div>
            )}

            <div className="expand-row" onClick={()=>toggle("labor")}>
              <span className="er-chev">{expanded.has("labor") ? "▼" : "▶"}</span>
              <span className="er-label">Labor Variance</span>
              <span className={"money " + (d.varianceDetail.labor.total > 0 ? "neg" : "pos")}>{fmtMoneySigned(d.varianceDetail.labor.total)}</span>
              <VarBadge value={d.varianceDetail.labor.total} percent={(d.varianceDetail.labor.total / d.breakdown.find(b=>b.cat==="Labor").std * 100)} size="sm"/>
            </div>
            {expanded.has("labor") && (
              <div className="expand-body">
                <div className="eb-sub">Rate variance (LRV): <span className="money">{fmtMoneySigned(d.varianceDetail.labor.rate)}</span> <span className="muted">— P2</span></div>
                <div className="eb-sub">Efficiency variance (LEV): <span className="money neg">{fmtMoneySigned(d.varianceDetail.labor.efficiency)}</span> <span className="muted">— P2</span></div>
              </div>
            )}

            <div className="expand-row" onClick={()=>toggle("overhead")}>
              <span className="er-chev">{expanded.has("overhead") ? "▼" : "▶"}</span>
              <span className="er-label">Overhead Variance</span>
              <span className={"money " + (d.varianceDetail.overhead.total > 0 ? "neg" : "pos")}>{fmtMoneySigned(d.varianceDetail.overhead.total)}</span>
            </div>
            {expanded.has("overhead") && (
              <div className="expand-body">
                <div className="eb-sub">Allocated via Labor Hours basis. Full decomposition in Phase 2.</div>
              </div>
            )}

            {d.varianceDetail.waste.total > 0 && (
              <>
                <div className="expand-row" onClick={()=>toggle("waste")}>
                  <span className="er-chev">{expanded.has("waste") ? "▼" : "▶"}</span>
                  <span className="er-label">Waste Cost</span>
                  <span className="money neg">{fmtMoneySigned(d.varianceDetail.waste.total)}</span>
                  <span className="muted" style={{fontSize:11}}>{d.varianceDetail.waste.entries} waste log entries</span>
                </div>
                {expanded.has("waste") && (
                  <div className="expand-body">
                    <div className="eb-sub"><a style={{color:"var(--blue)", cursor:"pointer"}}>View waste log in 08-PRODUCTION →</a></div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Co-product Allocation — FIN-003b per PRD §9.3.
              Only rendered when WO BOM includes co-products. Formula:
              allocated_cost_i = total_cost × (basis_i ÷ Σ basis).
              Audit-4 finding A1 (HIGH) — required sub-table. */}
          {d.coProducts && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Co-product Cost Allocation</h3>
                <span className="badge badge-blue" style={{fontSize:10}}>FIN-003b · PRD §9.3</span>
              </div>
              <div style={{fontSize:12, padding:"0 0 10px", color:"var(--muted)"}}>
                Joint actual cost <b className="money">{fmtMoney(d.coProducts.totalAllocated, true)}</b> split across {d.coProducts.outputs.length} outputs using
                <span className="badge badge-gray" style={{fontSize:9, marginLeft:6, marginRight:6}}>{d.coProducts.method.replace(/_/g," ")}</span>
                allocation method.
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Co-product / Output</th>
                    <th style={{textAlign:"right"}}>Quantity</th>
                    <th style={{textAlign:"right"}}>Cost Basis</th>
                    <th>Allocation Method</th>
                    <th style={{textAlign:"right"}}>Allocation %</th>
                    <th style={{textAlign:"right"}}>Allocated Cost</th>
                    <th style={{textAlign:"right"}}>Per-unit Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {d.coProducts.outputs.map((o, i) => (
                    <tr key={o.code}>
                      <td>
                        <div style={{fontSize:12}}>{o.name}</div>
                        <div className="mono muted" style={{fontSize:10}}>{o.code} · <span className={"badge " + (o.type === "Co-product" ? "badge-purple" : "badge-gray")} style={{fontSize:9}}>{o.type}</span></div>
                      </td>
                      <td className="money">{fmtQty(o.qty)} {o.uom}</td>
                      <td className="money">{fmtMoney(o.basis)}</td>
                      <td><span className="badge badge-gray" style={{fontSize:9}}>{d.coProducts.method.replace(/_/g," ")}</span></td>
                      <td className="money">{o.allocPct.toFixed(1)}%</td>
                      <td className="money" style={{fontWeight:600}}>{fmtMoney(o.allocCost)}</td>
                      <td className="mono" style={{fontSize:11}}>£ {o.unitCost.toFixed(2)}/{o.uom.toLowerCase()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:"2px solid var(--border)", fontWeight:600}}>
                    <td>Total allocated</td>
                    <td></td>
                    <td className="money">{fmtMoney(d.coProducts.outputs.reduce((s,o)=>s+o.basis,0))}</td>
                    <td></td>
                    <td className="money">100.0%</td>
                    <td className="money">{fmtMoney(d.coProducts.totalAllocated, true)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <div className="muted" style={{fontSize:11, marginTop:6}}>{d.coProducts.note}</div>
            </div>
          )}

          {/* Cascade — only if child WOs */}
          {d.cascade && (
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Cascade Cost (includes child WOs)</h3>
                <span className="money" style={{fontWeight:600}}>Cascade Total: {fmtMoney(d.cascadeTotal, true)}</span>
              </div>
              <table>
                <thead><tr><th>WO Number</th><th>Role</th><th style={{textAlign:"right"}}>Own Cost</th><th style={{textAlign:"right"}}>Cascade Contribution</th></tr></thead>
                <tbody>
                  {d.cascade.map((c, i) => (
                    <tr key={i} className={"cascade-row " + c.role.toLowerCase()}>
                      <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{c.wo}</td>
                      <td><span className={"badge " + (c.role === "Parent" ? "badge-blue" : "badge-gray")} style={{fontSize:9}}>{c.role}</span></td>
                      <td className="money">{fmtMoney(c.own)}</td>
                      <td className="money">{fmtMoney(c.cascade)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="muted" style={{fontSize:11, marginTop:6}}>Cascade computed via recursive CTE DAG rollup from 04-PLANNING <span className="mono">wo_dependencies</span>.</div>
            </div>
          )}

          {/* Notes */}
          {d.notes && d.notes.length > 0 && (
            <div className="card">
              <div className="card-head"><h3 className="card-title">Variance Notes</h3></div>
              {d.notes.map((n, i) => (
                <div key={i} style={{borderLeft:"3px solid var(--blue)", padding:"8px 12px", background:"var(--gray-050)", marginBottom:6, fontSize:12}}>
                  <div style={{fontWeight:600}}>{n.author} <span className="badge badge-gray" style={{fontSize:9, marginLeft:6}}>{n.cat}</span></div>
                  <div className="muted" style={{fontSize:10, fontFamily:"var(--font-mono)"}}>{n.date}</div>
                  <div style={{marginTop:4}}>{n.text}</div>
                </div>
              ))}
            </div>
          )}

          {/* D365 posting status */}
          <div className="card" style={{padding:"10px 14px"}}>
            <div className="row-flex">
              <span className="fin-section-title" style={{margin:0}}>D365 Posting Status</span>
              <span className="spacer"/>
              <span className={"badge " + d365Badge.cls} style={{fontSize:11}}>{d365Badge.text}</span>
            </div>
            <div className="muted" style={{fontSize:11, marginTop:4}}>Costs are posted to D365 F&amp;O via a daily consolidated journal batch at 23:00 UTC (dataAreaId: FNOR, warehouse: ApexDG).</div>
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { FinWoList, FinWoDetail });
