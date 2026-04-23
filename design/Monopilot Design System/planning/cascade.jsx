// ============ SCREEN-09 — Cascade DAG View (global) ============

const PlanCascadeDAG = ({ onNav, onOpenWo }) => {
  const [activeChain, setActiveChain] = React.useState("all");
  const [selectedNode, setSelectedNode] = React.useState(null);
  const [panelTab, setPanelTab] = React.useState("materials");
  const [dryRunOpen, setDryRunOpen] = React.useState(false);

  // Group by chain
  const chainsById = {};
  CASCADE_DAG.forEach(n => {
    if (!chainsById[n.chainId]) chainsById[n.chainId] = { id: n.chainId, rootFa: n.rootFa, rootName: n.rootName, nodes: [] };
    chainsById[n.chainId].nodes.push(n);
  });
  const chains = Object.values(chainsById);

  const visibleChains = activeChain === "all" ? chains : chains.filter(c => c.id === activeChain);

  // Stats
  const totalWos = CASCADE_DAG.length;
  const avgDepth = chains.length ? (chains.reduce((a,c) => a + (Math.max(...c.nodes.map(n => n.layer)) + 1), 0) / chains.length).toFixed(1) : 0;
  const conflicts = 0; // demo: no cycles

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Cascade DAG</div>
          <h1 className="page-title">Cascade DAG — intermediate production chains</h1>
          <div className="muted" style={{fontSize:12}}>
            {chains.length} active chains · {totalWos} total WOs · avg depth {avgDepth} layers · <span className="mono">{conflicts}</span> cycle conflicts
          </div>
        </div>
        <div className="row-flex">
          <DryRunButton
            label="Dry-run cascade"
            title="Preview affected WOs and lines before generating"
            onClick={() => setDryRunOpen(true)}
          />
          <button className="btn btn-primary btn-sm" title="Generate cascade WOs — preview first via Dry-run">＋ Generate cascade</button>
          <button className="btn btn-secondary btn-sm">⇪ Export PNG</button>
          <button className="btn btn-secondary btn-sm">⤢ Fit to screen</button>
          <button className="btn btn-secondary btn-sm">↻ Reset layout</button>
        </div>
      </div>

      <div className="cascade-toolbar">
        <select style={{width:220}} value={activeChain} onChange={e=>setActiveChain(e.target.value)}>
          <option value="all">All active chains</option>
          {chains.map(c => <option key={c.id} value={c.id}>{c.rootFa} — {c.rootName}</option>)}
        </select>
        <select style={{width:140}}><option>All statuses</option><option>Draft</option><option>Planned</option><option>Released</option><option>In progress</option></select>
        <select style={{width:140}}><option>Next 14 days</option><option>This week</option></select>
        <span className="spacer"></span>
        <div className="pills">
          <button className="pill on">Top → bottom</button>
          <button className="pill">Left → right</button>
        </div>
        <button className="btn btn-ghost btn-sm">–</button>
        <span className="mono" style={{fontSize:11, color:"var(--muted)"}}>100%</span>
        <button className="btn btn-ghost btn-sm">+</button>
      </div>

      <div className="cascade-stats">
        <div className="cs-stat"><div className="cs-label">Active chains</div><div className="cs-value">{chains.length}</div></div>
        <div className="cs-stat"><div className="cs-label">Total WOs</div><div className="cs-value">{totalWos}</div></div>
        <div className="cs-stat"><div className="cs-label">Avg depth</div><div className="cs-value">{avgDepth} layers</div></div>
        <div className="cs-stat"><div className="cs-label">Capacity conflicts</div><div className="cs-value">{conflicts}</div></div>
        <div className="cs-stat"><div className="cs-label">Cycle check</div><div className="cs-value" style={{color:"var(--green-700)"}}>✓ Pass</div></div>
      </div>

      <div className="cascade-canvas-wrap">
        <div className="cascade-chainlist">
          <div className="cascade-chainlist-head">Chains ({chains.length})</div>
          <div className={"chain-row " + (activeChain === "all" ? "on" : "")} onClick={()=>setActiveChain("all")}>
            <div className="chain-code">ALL</div>
            <div className="chain-name">Show all active chains</div>
            <div className="chain-meta">{totalWos} WOs · {chains.length} chains</div>
          </div>
          {chains.map(c => {
            const depth = Math.max(...c.nodes.map(n => n.layer)) + 1;
            return (
              <div key={c.id} className={"chain-row " + (activeChain === c.id ? "on" : "")} onClick={()=>setActiveChain(c.id)}>
                <div className="chain-code">{c.rootFa}</div>
                <div className="chain-name">{c.rootName}</div>
                <div className="chain-meta">{c.nodes.length} WOs · {depth} layers</div>
              </div>
            );
          })}
        </div>

        <div className="cascade-canvas">
          {visibleChains.map(chain => {
            const byLayer = {};
            chain.nodes.forEach(n => { byLayer[n.layer] = byLayer[n.layer] || []; byLayer[n.layer].push(n); });
            const layers = Object.keys(byLayer).map(n => parseInt(n)).sort((a,b) => a - b);
            const maxLayer = Math.max(...layers);

            return (
              <div key={chain.id} style={{marginBottom:40, paddingBottom:20, borderBottom: activeChain === "all" ? "1px dashed var(--border)" : "0"}}>
                {activeChain === "all" && (
                  <div style={{marginBottom:14, padding:"8px 12px", background:"#fff", borderRadius:4, border:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10}}>
                    <span className="mono" style={{fontWeight:600, fontSize:12}}>{chain.rootFa}</span>
                    <span style={{fontSize:12}}>{chain.rootName}</span>
                    <span className="spacer"></span>
                    <span className="muted" style={{fontSize:11, fontFamily:"var(--font-mono)"}}>{chain.nodes.length} WOs · {maxLayer + 1} layers</span>
                  </div>
                )}
                {layers.map(l => (
                  <React.Fragment key={l}>
                    <div className="cascade-layer">
                      <div className="cascade-layer-label">
                        {l === maxLayer ? "Layer " + (l+1) + " · Root FA" : "Layer " + (l+1) + " · Intermediate"}
                      </div>
                      <div className="cascade-layer-nodes">
                        {byLayer[l].map(n => (
                          <div key={n.code} className={"cascade-node " + n.status + (n.code === n.rootFa ? " current" : "")} onClick={()=>setSelectedNode(n)}>
                            <span className="cn-layer">L{l+1}</span>
                            <span className="cn-avail" style={{background: n.avail === "green" ? "var(--green)" : n.avail === "yellow" ? "var(--amber)" : n.avail === "red" ? "var(--red)" : n.avail === "produced" ? "var(--blue)" : "var(--gray-300)"}} title={n.avail}></span>
                            <div className="cn-code">{n.code}</div>
                            <div className="cn-name">{n.name}</div>
                            <div className="cn-qty">{n.qty} {n.uom} · <span className="mono">{n.product}</span></div>
                            <div className="cn-meta">
                              <WOPlanStatus s={n.status}/>
                              <Priority p={n.priority}/>
                            </div>
                            <div className="cn-allergens">
                              <span className="muted" style={{fontSize:10, marginRight:4}}>Allergen:</span>
                              <AllergenCluster families={n.allergens}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {l < maxLayer && (
                      <div className="cascade-arrow-down">
                        ↓
                        <div className="muted" style={{fontSize:10, marginTop:-4, fontFamily:"var(--font-mono)"}}>→ to_stock · scan-to-consume</div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            );
          })}

          <div className="dag-legend" style={{marginTop:14, padding:"10px 12px", background:"#fff", borderRadius:4, border:"1px solid var(--border)"}}>
            <b style={{fontSize:11, color:"var(--muted)"}}>Node status:</b>
            <span><span className="dag-legend-dot" style={{background:"var(--gray-300)"}}></span> Draft</span>
            <span><span className="dag-legend-dot" style={{background:"var(--blue)"}}></span> Planned</span>
            <span><span className="dag-legend-dot" style={{background:"#8b5cf6"}}></span> Released</span>
            <span><span className="dag-legend-dot" style={{background:"var(--green)"}}></span> In progress</span>
            <span><span className="dag-legend-dot" style={{background:"var(--gray-500)"}}></span> Completed</span>
          </div>
        </div>
      </div>

      {/* Side panel */}
      {selectedNode && (
        <div className="cascade-side-panel">
          <div className="cascade-side-panel-head">
            <div>
              <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{selectedNode.code}</div>
              <div style={{fontWeight:600, fontSize:14}}>{selectedNode.name}</div>
            </div>
            <button className="modal-close" onClick={()=>setSelectedNode(null)}>✕</button>
          </div>
          <div className="cascade-side-panel-body">
            <div style={{marginBottom:14, display:"grid", gap:6}}>
              <div className="row-flex"><span className="muted">Status</span><span className="spacer"></span><WOPlanStatus s={selectedNode.status}/></div>
              <div className="row-flex"><span className="muted">Priority</span><span className="spacer"></span><Priority p={selectedNode.priority}/></div>
              <div className="row-flex"><span className="muted">Qty</span><span className="spacer"></span><span className="mono">{selectedNode.qty} {selectedNode.uom}</span></div>
              <div className="row-flex"><span className="muted">Product</span><span className="spacer"></span><span className="mono">{selectedNode.product}</span></div>
              <div className="row-flex"><span className="muted">Layer</span><span className="spacer"></span><span className="mono">{selectedNode.layer + 1}</span></div>
              <div className="row-flex"><span className="muted">Availability</span><span className="spacer"></span><Avail v={selectedNode.avail}/></div>
            </div>

            <div className="tabs-bar" style={{marginBottom:10}}>
              <button className={"tab-btn " + (panelTab==="materials"?"on":"")} onClick={()=>setPanelTab("materials")}>Materials</button>
              <button className={"tab-btn " + (panelTab==="outputs"?"on":"")} onClick={()=>setPanelTab("outputs")}>Outputs</button>
              <button className={"tab-btn " + (panelTab==="deps"?"on":"")} onClick={()=>setPanelTab("deps")}>Deps</button>
            </div>

            {panelTab === "materials" && (
              <div style={{fontSize:12}}>
                {CASCADE_EDGES.filter(e => e.to === selectedNode.code).map((e,i) => {
                  const parent = CASCADE_DAG.find(n => n.code === e.from);
                  return (
                    <div key={i} style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                      <div className="row-flex">
                        <span className="mono" style={{fontWeight:600, color:"var(--blue)", cursor:"pointer"}}>{e.from}</span>
                        <span className="spacer"></span>
                        <span className="mono">{e.qty} {e.uom}</span>
                      </div>
                      <div className="muted" style={{fontSize:11}}>{parent ? parent.name : "—"} <span className="badge badge-amber" style={{fontSize:9, marginLeft:4}}>upstream WO</span></div>
                    </div>
                  );
                })}
                {CASCADE_EDGES.filter(e => e.to === selectedNode.code).length === 0 && (
                  <div className="muted" style={{padding:"12px 0"}}>No upstream WOs — this is a root RM consumer.</div>
                )}
              </div>
            )}
            {panelTab === "outputs" && (
              <div style={{fontSize:12}}>
                <div style={{padding:"8px 0", borderBottom:"1px solid var(--border)"}}>
                  <div className="row-flex">
                    <span className="badge badge-blue" style={{fontSize:10}}>Primary</span>
                    <span className="mono" style={{fontWeight:600, marginLeft:6}}>{selectedNode.product}</span>
                    <span className="spacer"></span>
                    <span className="mono">{selectedNode.qty} {selectedNode.uom}</span>
                  </div>
                  <div className="muted" style={{fontSize:11, marginTop:2}}>Disposition: <span className="mono">to_stock</span></div>
                </div>
              </div>
            )}
            {panelTab === "deps" && (
              <div style={{fontSize:12}}>
                <div className="label" style={{marginBottom:6}}>Parents (consumed by this WO)</div>
                {CASCADE_EDGES.filter(e => e.to === selectedNode.code).map((e,i) => (
                  <div key={i} className="row-flex" style={{padding:"4px 0"}}>
                    <span className="mono" style={{color:"var(--blue)", cursor:"pointer"}}>{e.from}</span>
                    <span className="spacer"></span>
                    <span className="mono">{e.qty} {e.uom}</span>
                  </div>
                ))}
                <div className="label" style={{marginTop:14, marginBottom:6}}>Children (consume this WO's output)</div>
                {CASCADE_EDGES.filter(e => e.from === selectedNode.code).map((e,i) => (
                  <div key={i} className="row-flex" style={{padding:"4px 0"}}>
                    <span className="mono" style={{color:"var(--blue)", cursor:"pointer"}}>{e.to}</span>
                    <span className="spacer"></span>
                    <span className="mono">{e.qty} {e.uom}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn-primary btn-sm" style={{marginTop:18, width:"100%", justifyContent:"center"}} onClick={()=>{ setSelectedNode(null); onOpenWo(selectedNode.code); }}>Open full detail →</button>
          </div>
        </div>
      )}

      {/* Dry-run preview — TUNING-PATTERN §3.6 (multi-object fan-out preview) */}
      {dryRunOpen && (() => {
        // Compute fan-out from the current chain selection (or all chains).
        const scopeChains = activeChain === "all" ? chains : chains.filter(c => c.id === activeChain);
        const scopeNodes = scopeChains.flatMap(c => c.nodes);
        const newWOCount = scopeNodes.filter(n => n.status === "draft" || n.status === "planned").length;
        const linesAffected = new Set(scopeNodes.map(n => n.line).filter(Boolean));
        const linesCount = linesAffected.size || scopeChains.length; // demo fallback
        const totalWOs = scopeNodes.length;
        return (
          <Modal
            open={true}
            onClose={() => setDryRunOpen(false)}
            title="Cascade generate — dry-run preview"
            subtitle="Review affected objects before committing"
            size="wide"
            foot={<>
              <button className="btn btn-secondary btn-sm" onClick={() => setDryRunOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => setDryRunOpen(false)}>Confirm — generate cascade</button>
            </>}>
            <div className="alert-blue alert-box" style={{marginBottom:12, fontSize:12}}>
              <span>ⓘ</span>
              <div>
                <b>Will create {newWOCount} WOs affecting {linesCount} line{linesCount === 1 ? "" : "s"}.</b>
                <div style={{fontSize:11, color:"var(--blue-700)"}}>
                  Scope: {activeChain === "all" ? `${chains.length} active chains` : `chain ${activeChain}`} · {totalWOs} total WOs in chain(s) · cycle-check ✓ pass
                </div>
              </div>
            </div>

            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:12}}>
              <div className="cs-stat"><div className="cs-label">New WOs</div><div className="cs-value mono">{newWOCount}</div></div>
              <div className="cs-stat"><div className="cs-label">Lines affected</div><div className="cs-value mono">{linesCount}</div></div>
              <div className="cs-stat"><div className="cs-label">Chain layers</div><div className="cs-value mono">{Math.max(1, ...scopeChains.map(c => Math.max(...c.nodes.map(n => n.layer)) + 1))}</div></div>
            </div>

            <div className="card" style={{padding:0}}>
              <div className="card-head" style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", marginBottom:0}}>
                <h3 className="card-title">Affected WOs</h3>
                <span className="muted" style={{fontSize:11}}>Read-only — nothing created yet</span>
              </div>
              <table>
                <thead><tr>
                  <th>Layer</th><th>WO</th><th>Product</th>
                  <th style={{textAlign:"right"}}>Qty</th><th>Status</th><th>Line</th>
                </tr></thead>
                <tbody>
                  {scopeNodes.map(n => (
                    <tr key={n.code}>
                      <td className="mono">L{n.layer + 1}</td>
                      <td className="mono" style={{fontWeight:600}}>{n.code}</td>
                      <td>{n.name}</td>
                      <td className="num mono">{n.qty} {n.uom}</td>
                      <td><WOPlanStatus s={n.status}/></td>
                      <td className="mono">{n.line || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                  {scopeNodes.length === 0 && (
                    <tr><td colSpan={6}><div className="muted" style={{padding:14, textAlign:"center"}}>Nothing in scope — select a chain.</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Modal>
        );
      })()}
    </>
  );
};

Object.assign(window, { PlanCascadeDAG });
