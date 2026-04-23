// ============ WH-012 Inventory Browser ============

const WhInventory = ({ role, onNav, onOpenLp }) => {
  const [view, setView] = React.useState("product");
  const [expanded, setExpanded] = React.useState(new Set());
  const canSeeValue = role === "Manager" || role === "Admin";

  const toggle = (k) => {
    const next = new Set(expanded);
    if (next.has(k)) next.delete(k); else next.add(k);
    setExpanded(next);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Inventory browser</div>
          <h1 className="page-title">Inventory browser</h1>
          <div className="muted" style={{fontSize:12}}>{WH_INV_BY_PRODUCT.length} SKUs · aggregated view across {WH_LPS.length} active LPs · value visible to Manager/Admin</div>
        </div>
        <div className="row-flex">
          <div className="pills">
            <button className={"pill " + (view === "product" ? "on" : "")} onClick={()=>setView("product")}>By product</button>
            <button className={"pill " + (view === "location" ? "on" : "")} onClick={()=>setView("location")}>By location</button>
            <button className={"pill " + (view === "batch" ? "on" : "")} onClick={()=>setView("batch")}>By batch</button>
          </div>
          <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
        </div>
      </div>

      <div className="filter-bar">
        <select style={{width:160}}><option>All warehouses</option><option>WH-Factory-A</option></select>
        <select style={{width:160}}><option>All item types</option><option>raw_material</option><option>intermediate</option><option>finished_article</option></select>
        <select style={{width:150}}><option>All QA statuses</option><option>PASSED</option><option>HOLD</option></select>
        <select style={{width:160}}><option>All locations (subtree)</option><option>Cold (all bins)</option><option>Dry (all bins)</option></select>
        <select style={{width:140}}><option>All statuses</option><option>available</option><option>reserved</option><option>blocked</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear</button>
      </div>

      {view === "product" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th style={{width:24}}></th><th>Product</th><th>Type</th><th style={{textAlign:"right"}}>Total</th><th style={{textAlign:"right"}}>Reserved</th><th style={{textAlign:"right"}}>Available</th><th style={{textAlign:"right"}}>QC hold</th><th style={{textAlign:"right"}}>LPs</th><th>Earliest expiry</th><th style={{textAlign:"right"}}>Locations</th><th>Strategy</th><th style={{textAlign:"right"}}>Value (GBP)</th></tr></thead>
            <tbody>
              {WH_INV_BY_PRODUCT.map(p => {
                const isOpen = expanded.has(p.code);
                const lpsForProduct = WH_LPS.filter(l => l.product === p.code);
                return (
                  <React.Fragment key={p.code}>
                    <tr style={{cursor:"pointer"}} onClick={()=>toggle(p.code)}>
                      <td><span className="inv-expand-ic">{isOpen ? "▼" : "▶"}</span></td>
                      <td>
                        <div className="mono" style={{fontSize:11, fontWeight:600}}>{p.code}</div>
                        <div style={{fontSize:11}}>{p.name}</div>
                      </td>
                      <td><ItemTypeBadge t={p.itemType}/></td>
                      <td className="num mono">{p.total} {p.uom || "kg"}</td>
                      <td className="num mono muted">{p.reserved}</td>
                      <td className="num mono" style={{color: p.available < 50 ? "var(--red-700)" : "var(--text)"}}>{p.available}</td>
                      <td className="num mono" style={{color: p.hold > 0 ? "var(--amber-700)" : "var(--muted)"}}>{p.hold}</td>
                      <td className="num mono">{p.lps}</td>
                      <td><ExpiryCell date={p.earliest} days={10}/></td>
                      <td className="num mono">{p.locs}</td>
                      <td><span className="badge badge-gray" style={{fontSize:9}}>{p.strategy}</span></td>
                      <td className="num mono">{canSeeValue ? p.value : "🔒"}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={12} className="sub-table">
                          <b style={{fontSize:11, fontFamily:"var(--font-mono)"}}>LPs for {p.code} ({lpsForProduct.length}):</b>
                          <table style={{marginTop:6}}>
                            <thead><tr><th>LP</th><th>Qty</th><th>Batch</th><th>Expiry</th><th>Location</th><th>Status</th><th>QA</th></tr></thead>
                            <tbody>
                              {lpsForProduct.map(l => (
                                <tr key={l.lp} onClick={()=>onOpenLp(l.lp)} style={{cursor:"pointer"}}>
                                  <td className="mono" style={{color:"var(--blue)"}}>{l.lp}</td>
                                  <td className="num mono">{l.qty} {l.uom}</td>
                                  <td className="mono">{l.batch}</td>
                                  <td><ExpiryCell date={l.expiry} days={15}/></td>
                                  <td><Ltree path={l.loc}/></td>
                                  <td><LPStatus s={l.status}/></td>
                                  <td><QAStatus s={l.qa}/></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <a style={{fontSize:11, color:"var(--blue)", cursor:"pointer"}}>View all LPs filtered by product →</a>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "location" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Location path</th><th style={{textAlign:"right"}}>LPs</th><th>Top products</th><th>Utilization</th></tr></thead>
            <tbody>
              {WH_LOCATIONS.filter(l => l.level === 2).map(l => (
                <tr key={l.key} style={{cursor:"pointer"}} onClick={()=>onNav("locations")}>
                  <td><Ltree path={l.key.split(".")}/></td>
                  <td className="num mono">{l.lpCount}</td>
                  <td style={{fontSize:11}}>{WH_LPS.filter(lp => lp.loc.join(".") === l.key).slice(0,2).map(x=>x.product).join(", ") || "—"}</td>
                  <td style={{width:140}}>
                    <div style={{width:100, height:6, background:"var(--gray-100)", borderRadius:3, overflow:"hidden"}}>
                      <span style={{display:"block", height:"100%", width:((l.util||0)*100)+"%", background: (l.util||0) > 0.9 ? "var(--red)" : (l.util||0) > 0.7 ? "var(--amber)" : "var(--green)"}}></span>
                    </div>
                    <span className="mono" style={{fontSize:10, color:"var(--muted)"}}>{Math.round((l.util||0)*100)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "batch" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Batch</th><th>Supplier batch</th><th>Product</th><th style={{textAlign:"right"}}>Total qty</th><th style={{textAlign:"right"}}>LPs</th><th>Earliest expiry</th><th>QA (majority)</th><th>Received</th></tr></thead>
            <tbody>
              {["B-2026-04-02","B-2026-04-05","B-2026-04-10","B-2026-04-12","B-2026-04-14","B-2026-04-20","B-2026-04-21","B-2026-02-18"].map(b => {
                const lps = WH_LPS.filter(l => l.batch === b);
                if (lps.length === 0) return null;
                const total = lps.reduce((a,l) => a+l.qty, 0);
                return (
                  <tr key={b} style={{cursor:"pointer"}}>
                    <td className="mono" style={{fontWeight:600}}>{b}</td>
                    <td className="mono" style={{fontSize:11, color:"var(--muted)"}}>SUP-{b.slice(-4)}</td>
                    <td><div className="mono" style={{fontSize:11, fontWeight:600}}>{lps[0].product}</div><div style={{fontSize:11}}>{lps[0].productName}</div></td>
                    <td className="num mono">{total} {lps[0].uom}</td>
                    <td className="num mono">{lps.length}</td>
                    <td><ExpiryCell date={lps[0].expiry} days={15}/></td>
                    <td><QAStatus s={lps[0].qa}/></td>
                    <td className="mono" style={{fontSize:11}}>—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ============ WH-018 Locations hierarchy ============

const WhLocations = ({ role, onNav, onOpenLp, openModal }) => {
  const [selected, setSelected] = React.useState("WH-Factory-A.Cold.B3");
  const isAdmin = role === "Admin";
  const sel = WH_LOCATIONS.find(l => l.key === selected) || WH_LOCATIONS[0];
  const childLps = WH_LPS.filter(l => l.loc.join(".").startsWith(sel.key));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Locations</div>
          <h1 className="page-title">Locations hierarchy</h1>
          <div className="muted" style={{fontSize:12}}>Backed by <span className="mono">ltree</span> column · depth {WH_SETTINGS.general && 3} max · Forza default: warehouse → zone → bin</div>
        </div>
        <div className="row-flex">
          {isAdmin && <button className="btn btn-primary btn-sm" onClick={()=>openModal("locationEdit")}>＋ Add location</button>}
          {!isAdmin && <span className="badge badge-gray" style={{fontSize:10}}>Read-only — Admin required to edit</span>}
        </div>
      </div>

      <div className="loc-layout">
        <div className="loc-tree">
          {WH_LOCATIONS.map(l => {
            const typeIc = { storage: "▭", transit: "🚚", receiving: "📦", production_line: "⚙" }[l.type] || "•";
            return (
              <div key={l.key}
                   className={"loc-node l" + l.level + " " + (selected === l.key ? "on" : "")}
                   onClick={()=>setSelected(l.key)}>
                <span className="ln-tog">{l.level < 2 ? "▸" : ""}</span>
                <span className="ln-type-ic">{typeIc}</span>
                <span style={{fontFamily:"var(--font-mono)", fontSize:11, fontWeight:l.level === 0 ? 700 : l.level === 1 ? 600 : 500}}>{l.code}</span>
                <span style={{fontSize:11, color:"var(--muted)", marginLeft:6}}>{l.name}</span>
                <span className="ln-count">{l.lpCount}</span>
              </div>
            );
          })}
        </div>

        <div>
          <div className="card">
            <div className="card-head">
              <div>
                <h3 className="card-title" style={{fontFamily:"var(--font-mono)"}}>{sel.code} — {sel.name}</h3>
                <div style={{fontSize:11, color:"var(--muted)", marginTop:2}} className="mono">{sel.key.replace(/\./g, " › ")}</div>
              </div>
              <div className="row-flex">
                <span className="badge badge-gray" style={{fontSize:10}}>{sel.type}</span>
                <span className="badge badge-green" style={{fontSize:10}}>● Active</span>
                {isAdmin && <><button className="btn btn-ghost btn-sm" onClick={()=>openModal("locationEdit", sel)}>Edit</button><button className="btn btn-ghost btn-sm" onClick={()=>openModal("locationEdit")}>＋ Child</button><button className="btn btn-ghost btn-sm">Deactivate</button></>}
              </div>
            </div>

            <div className="wo-summary-bar">
              <div className="wsb-item"><div className="wsb-label">LPs here</div><div className="wsb-value">{sel.lpCount}</div></div>
              <div className="wsb-item"><div className="wsb-label">Parent</div><div className="wsb-value mono">{sel.parent || "—"}</div></div>
              <div className="wsb-item"><div className="wsb-label">Depth level</div><div className="wsb-value">L{sel.level}</div></div>
              <div className="wsb-item"><div className="wsb-label">Utilization</div><div className="wsb-value">{sel.util ? Math.round(sel.util*100) + "%" : "—"}</div></div>
            </div>
          </div>

          {/* Bin occupancy mini-grid */}
          {sel.level === 1 && (() => {
            const bins = WH_LOCATIONS.filter(l => l.parent === sel.key);
            return (
              <div className="card" style={{marginTop:12}}>
                <div className="card-head">
                  <h3 className="card-title">Bin occupancy ({sel.name})</h3>
                  <span className="muted" style={{fontSize:11}}>Green &lt; 40% · Amber 40–80% · Red &gt; 80% full</span>
                </div>
                {bins.length === 0 ? (
                  <EmptyState
                    icon="▦"
                    title="No bins in this zone"
                    body={isAdmin ? "Add bins as children of this zone to start tracking occupancy." : "This zone has no bins yet. Contact your administrator to add bins."}
                    action={isAdmin ? { label: "＋ Add bin", onClick: ()=>openModal("locationEdit") } : undefined}
                  />
                ) : (
                  <div className="bin-grid">
                    {bins.map(b => {
                      const cls = !b.util ? "empty" : b.util > 0.8 ? "full" : b.util > 0.4 ? "med" : "low";
                      return (
                        <div key={b.key} className={"bin-cell " + cls} onClick={()=>setSelected(b.key)}>
                          <div className="bc-code">{b.code}</div>
                          <div className="bc-util">{b.lpCount} LPs · {Math.round((b.util||0)*100)}%</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="card" style={{padding:0, marginTop:12}}>
            <div className="card-head" style={{padding:"10px 14px"}}>
              <h3 className="card-title">LPs at this location ({childLps.length})</h3>
              <button className="btn btn-ghost btn-sm" onClick={()=>onNav("lps")}>Open full LP list →</button>
            </div>
            <table>
              <thead><tr><th>LP</th><th>Product</th><th style={{textAlign:"right"}}>Qty</th><th>Batch</th><th>Expiry</th><th>Status</th><th>QA</th></tr></thead>
              <tbody>
                {childLps.slice(0,25).map(l => (
                  <tr key={l.lp} style={{cursor:"pointer"}} onClick={()=>onOpenLp(l.lp)}>
                    <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{l.lp}</td>
                    <td><div style={{fontSize:11, fontWeight:500}}>{l.productName}</div><div className="mono" style={{fontSize:10, color:"var(--muted)"}}>{l.product}</div></td>
                    <td className="num mono">{l.qty} {l.uom}</td>
                    <td className="mono" style={{fontSize:11}}>{l.batch}</td>
                    <td><ExpiryCell date={l.expiry} days={15}/></td>
                    <td><LPStatus s={l.status}/></td>
                    <td><QAStatus s={l.qa}/></td>
                  </tr>
                ))}
                {childLps.length === 0 && <tr><td colSpan={7} className="muted" style={{textAlign:"center", padding:30}}>No LPs at this location.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

// ============ WH-014 Genealogy ============

const WhGenealogy = ({ onNav, onOpenLp }) => {
  const [queried, setQueried] = React.useState(true);
  const [mode, setMode] = React.useState("backward");
  const g = WH_GENEALOGY;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Genealogy</div>
          <h1 className="page-title">Lot genealogy &amp; traceability</h1>
          <div className="muted" style={{fontSize:12}}>FSMA 204 compliant · recursive CTE · max depth 10 · query SLO &lt; 30s</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">⇪ Export trace report</button>
        </div>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search by LP#, batch#, supplier batch…" defaultValue={g.seed.lp} style={{width:280}}/>
        <button className="btn btn-secondary btn-sm">🔲 Scan</button>
        <div className="pills">
          <button className={"pill " + (mode === "forward" ? "on" : "")} onClick={()=>setMode("forward")}>Forward</button>
          <button className={"pill " + (mode === "backward" ? "on" : "")} onClick={()=>setMode("backward")}>Backward</button>
          <button className={"pill " + (mode === "full" ? "on" : "")} onClick={()=>setMode("full")}>Full trace</button>
        </div>
        <label style={{fontSize:11, display:"inline-flex", alignItems:"center", gap:6}}>
          Depth: <input type="range" min="1" max="10" defaultValue="10" style={{width:100}}/> <span className="mono" style={{fontSize:11}}>10</span>
        </label>
        <span className="spacer"></span>
        <button className="btn btn-primary btn-sm" onClick={()=>setQueried(true)}>Trace</button>
      </div>

      {!queried && (
        <div className="card" style={{padding:60, textAlign:"center"}}>
          <div style={{fontSize:48, opacity:0.22}}>⊶</div>
          <div style={{fontSize:14, marginTop:12, fontWeight:500}}>Enter an LP number, batch number, or scan a barcode to trace its genealogy.</div>
          <div style={{fontSize:12, color:"var(--muted)", marginTop:8, maxWidth:520, marginLeft:"auto", marginRight:"auto", lineHeight:1.6}}>
            <b>Forward trace:</b> track a recalled ingredient to all affected finished products.<br/>
            <b>Backward trace:</b> identify all raw materials in a finished product.
          </div>
        </div>
      )}

      {queried && (
        <>
          <div className="wo-summary-bar">
            <div className="wsb-item"><div className="wsb-label">Seed LP</div><div className="wsb-value mono" style={{color:"var(--blue)"}}>{g.seed.lp}</div></div>
            <div className="wsb-item"><div className="wsb-label">Product</div><div className="wsb-value">{g.seed.product}</div></div>
            <div className="wsb-item"><div className="wsb-label">Batch</div><div className="wsb-value mono">{g.seed.batch}</div></div>
            <div className="wsb-item"><div className="wsb-label">Trace mode</div><div className="wsb-value">{mode}</div></div>
            <div className="wsb-item"><div className="wsb-label">Nodes found</div><div className="wsb-value">{g.backward.length}</div></div>
            <div className="wsb-item"><div className="wsb-label">Query time</div><div className="wsb-value">0.42s</div></div>
          </div>

          <div className="alert-green alert-box" style={{marginBottom:10, fontSize:12}}>
            <span>✓</span>
            <div>
              <b>Trace complete — {g.backward.length} nodes across {Math.max(...g.backward.map(n=>n.depth))+1} depth levels.</b>
              <div style={{fontSize:11}}>All upstream GRN references resolved · FEFO compliance: 3 compliant, 1 override (physical_accessibility).</div>
            </div>
          </div>

          <div className="gen-canvas">
            {g.backward.map((n, i) => (
              <div key={i} className={"gen-node l" + n.depth + (n.depth === 0 ? " root" : "")}>
                <span className={"gen-op-icon " + n.op}>{n.op === "receipt" ? "◯" : n.op === "output" ? "→" : "←"}</span>
                <div>
                  <div className="gn-code" onClick={()=>onOpenLp(n.lp)}>
                    {n.lp}
                    <span style={{fontSize:10, color:"var(--muted)", marginLeft:8, textTransform:"uppercase", fontWeight:400, letterSpacing:"0.05em"}}>D{n.depth} · {n.op}</span>
                  </div>
                  <div className="gn-prod">{n.product} — {n.batch}</div>
                  <div className="gn-meta">{n.qty} · {n.date} · Ref <span style={{color:"var(--blue)"}}>{n.ref}</span></div>
                </div>
                {n.fefo && <span className={"gn-fefo " + n.fefo}>{n.fefo === "ok" ? "FEFO ✓" : "Override"}</span>}
              </div>
            ))}
          </div>

          <div className="row-flex" style={{marginTop:14}}>
            <button className="btn btn-secondary btn-sm">Collapse all</button>
            <button className="btn btn-secondary btn-sm">Expand all</button>
            <span className="spacer"></span>
            <button className="btn btn-primary btn-sm">⇪ Export FSMA 204 trace report (PDF)</button>
            <button className="btn btn-secondary btn-sm">⇪ Export CSV</button>
          </div>
        </>
      )}
    </>
  );
};

// ============ WH-019 Expiry dashboard ============

const WhExpiry = ({ role, onNav, onOpenLp, openModal }) => {
  const [tab, setTab] = React.useState("expired");
  const [modeFilter, setModeFilter] = React.useState("all");
  const isAdmin = role === "Admin";
  const expired = WH_EXPIRED.filter(e => modeFilter === "all" || e.mode === modeFilter);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Expiry</div>
          <h1 className="page-title">Expiry management</h1>
          <div className="muted" style={{fontSize:12}}>Last auto-run: <b>2026-04-21 02:00 UTC</b> · 2 LPs auto-blocked today · Cron schedule <span className="mono">0 2 * * *</span></div>
        </div>
        <div className="row-flex">
          {isAdmin && <button className="btn btn-secondary btn-sm">▶ Run cron now</button>}
          <button className="btn btn-secondary btn-sm">⇪ Export</button>
        </div>
      </div>

      <div className="exp-strip">
        <div className="exp-card red">
          <div className="ex-big">{WH_EXPIRED.filter(e => e.mode === "use_by" && e.status === "blocked").length}</div>
          <div className="ex-lab">LPs past use_by date — blocked</div>
          <div className="ex-sub"><b>Immediate action required.</b> Pick / consume / ship disabled.</div>
        </div>
        <div className="exp-card amber">
          <div className="ex-big">{WH_EXPIRED.filter(e => e.mode === "best_before").length}</div>
          <div className="ex-lab">LPs past best_before — warnings active</div>
          <div className="ex-sub">Operations allowed with operator confirmation. Suitable for secondary use.</div>
        </div>
      </div>

      <div className="tabs-bar">
        <button className={"tab-btn " + (tab === "expired" ? "on" : "")} onClick={()=>setTab("expired")}>Expired <span className="count">{WH_EXPIRED.length}</span></button>
        <button className={"tab-btn " + (tab === "expiring" ? "on" : "")} onClick={()=>setTab("expiring")}>Expiring soon <span className="count">{WH_EXPIRING_SOON.length}</span></button>
      </div>

      <div className="filter-bar">
        {tab === "expired" && (
          <>
            <div className="pills">
              <button className={"pill " + (modeFilter === "all" ? "on" : "")} onClick={()=>setModeFilter("all")}>All modes</button>
              <button className={"pill " + (modeFilter === "use_by" ? "on" : "")} onClick={()=>setModeFilter("use_by")}>use_by</button>
              <button className={"pill " + (modeFilter === "best_before" ? "on" : "")} onClick={()=>setModeFilter("best_before")}>best_before</button>
            </div>
          </>
        )}
        {tab === "expiring" && (
          <>
            <div className="pills">
              <button className="pill on">≤ 7 days (red)</button>
              <button className="pill">≤ 30 days (amber)</button>
              <button className="pill">Custom range</button>
            </div>
          </>
        )}
        <select style={{width:180}}><option>All products</option></select>
        <select style={{width:160}}><option>All warehouses</option></select>
        <span className="spacer"></span>
        <span className="muted" style={{fontSize:12}}>{tab === "expired" ? expired.length : WH_EXPIRING_SOON.length} rows</span>
      </div>

      {(tab === "expired" ? expired : WH_EXPIRING_SOON).length === 0 && (
        <div className="card" style={{padding:0}}>
          <EmptyState
            icon="⏰"
            title={tab === "expired" ? "No expired LPs" : "No LPs expiring soon"}
            body={tab === "expired"
              ? "Great — nothing has passed its use-by or best-before date. The daily 02:00 UTC cron checks automatically."
              : "Nothing nearing expiry in the selected range. FEFO priority is maintained."}
          />
        </div>
      )}
      {(tab === "expired" ? expired : WH_EXPIRING_SOON).length > 0 && (
      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th>LP</th><th>Product</th><th>Batch</th><th>Expiry</th><th>Mode</th><th>Status</th><th style={{textAlign:"right"}}>Qty</th><th>Location</th>
              {tab === "expired" && <th>Auto-blocked</th>}
              <th style={{width:200}}>Action</th>
            </tr>
          </thead>
          <tbody>
            {(tab === "expired" ? expired : WH_EXPIRING_SOON).map(e => (
              <tr key={e.lp} style={{cursor:"pointer"}} onClick={()=>onOpenLp(e.lp)}>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{e.lp}</td>
                <td style={{fontSize:12}}>{e.product}</td>
                <td className="mono" style={{fontSize:11}}>{e.batch}</td>
                <td><ExpiryCell date={e.expiry} mode={e.mode} days={e.days}/></td>
                <td><ShelfMode m={e.mode}/></td>
                <td>{e.status ? <LPStatus s={e.status}/> : <LPStatus s="available"/>}</td>
                <td className="num mono">{e.qty}</td>
                <td><Ltree path={e.loc}/></td>
                {tab === "expired" && <td className="mono" style={{fontSize:11}}>{e.autoBlocked || <span className="muted">No</span>}</td>}
                <td onClick={ev=>ev.stopPropagation()}>
                  {tab === "expired" && e.mode === "use_by" && <>
                    <button className="btn btn-danger btn-sm" onClick={()=>openModal("destroy", e)}>Destroy</button>
                    {isAdmin && <button className="btn btn-secondary btn-sm" onClick={()=>openModal("useByOverride", e)}>Manager override</button>}
                  </>}
                  {tab === "expired" && e.mode === "best_before" && <>
                    <button className="btn btn-secondary btn-sm" onClick={()=>openModal("stateTransition", { lp: e.lp, from: "available", to: "blocked" })}>Block</button>
                    <button className="btn btn-danger btn-sm" onClick={()=>openModal("destroy", e)}>Destroy</button>
                  </>}
                  {tab === "expiring" && <button className="btn btn-ghost btn-sm" onClick={()=>onOpenLp(e.lp)}>View LP →</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:14}}>
        <div className="card" style={{borderLeft:"4px solid var(--red)"}}>
          <div className="label"><b>use_by</b> — EU 1169/2011</div>
          <div style={{fontSize:12, lineHeight:1.5, marginTop:6}}>
            LP expired → <b>automatically blocked</b> by daily cron. All operations (pick, consume, ship) prevented. Manager override requires mandatory reason code and creates a compliance audit record.
          </div>
        </div>
        <div className="card" style={{borderLeft:"4px solid var(--amber)"}}>
          <div className="label"><b>best_before</b></div>
          <div style={{fontSize:12, lineHeight:1.5, marginTop:6}}>
            LP expired → status remains unchanged. Operations allowed with a warning banner. Operator confirms before proceeding. Suitable for secondary use / donation.
          </div>
        </div>
      </div>
    </>
  );
};

// ============ WH-020 Warehouse Settings ============

const WhSettings = ({ role, onNav }) => {
  const [cat, setCat] = React.useState("general");
  const [dirty, setDirty] = React.useState(false);
  const isAdmin = role === "Admin";
  const cats = [
    { k: "general",   l: "General" },
    { k: "numbering", l: "LP numbering" },
    { k: "grn",       l: "Receiving (GRN)" },
    { k: "picking",   l: "Picking & strategy" },
    { k: "expiry",    l: "Expiry & shelf life" },
    { k: "labels",    l: "Labels & printing" },
    { k: "scanner",   l: "Scanner" },
    { k: "locations", l: "Locations" },
    { k: "integr",    l: "Integrations" },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Warehouse settings</div>
          <h1 className="page-title">Warehouse settings</h1>
          <div className="muted" style={{fontSize:12}}>{isAdmin ? "Admin edit mode" : "Read-only — Admin role required to change settings"}</div>
        </div>
      </div>

      {!isAdmin && <div className="set-banner info">ⓘ You have read-only access to warehouse settings. Contact your administrator to make changes.</div>}
      {dirty && <div className="set-unsaved">⚠ Unsaved changes — <button className="btn btn-primary btn-sm" onClick={()=>setDirty(false)}>Save category</button> <button className="btn btn-ghost btn-sm" onClick={()=>setDirty(false)}>Discard</button></div>}

      <div style={{display:"grid", gridTemplateColumns:"200px 1fr", gap:14, alignItems:"flex-start"}}>
        <div className="loc-tree" style={{position:"sticky", top:100}}>
          {cats.map(c => (
            <div key={c.k}
                 className={"loc-node l0 " + (cat === c.k ? "on" : "")}
                 onClick={()=>setCat(c.k)}>
              <span style={{fontSize:12}}>{c.l}</span>
            </div>
          ))}
        </div>
        <div className="card">
          {cat === "general" && (<>
            <div className="card-head"><h3 className="card-title">General settings</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin} onClick={()=>setDirty(true)}>Save changes</button></div>
            <div className="set-form-grid">
              <Field label="Warehouse name"><input value={WH_SETTINGS.general.name} readOnly={!isAdmin} style={{background:"var(--gray-100)"}}/></Field>
              <Field label="Warehouse code"><input value={WH_SETTINGS.general.code} readOnly style={{background:"var(--gray-100)", fontFamily:"var(--font-mono)"}}/></Field>
              <Field label="Set as default" help="Default for new users"><label><input type="checkbox" defaultChecked={WH_SETTINGS.general.setAsDefault} disabled={!isAdmin}/> Use as tenant default</label></Field>
              <Field label="Archival retention (months)" help="LPs in consumed/shipped status auto-archived after N months"><input type="number" defaultValue={WH_SETTINGS.general.archivalMonths} disabled={!isAdmin}/></Field>
              <Field label="Dashboard cache TTL (s)" help="Redis TTL for dashboard KPIs"><input type="number" defaultValue={WH_SETTINGS.general.dashboardCacheTtl} disabled={!isAdmin}/></Field>
            </div>
          </>)}

          {cat === "numbering" && (<>
            <div className="card-head"><h3 className="card-title">LP numbering</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
            <div className="set-form-grid">
              <Field label="Auto-generate LP number"><label><input type="checkbox" defaultChecked={WH_SETTINGS.lpNumbering.autoGenerate} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Prefix" help="Forza default: LP"><input defaultValue={WH_SETTINGS.lpNumbering.prefix} disabled={!isAdmin} className="mono"/></Field>
              <Field label="Sequence length (digits, 4–12)"><input type="number" min="4" max="12" defaultValue={WH_SETTINGS.lpNumbering.seqLength} disabled={!isAdmin}/></Field>
              <Field label="Preview"><input value={WH_SETTINGS.lpNumbering.preview} readOnly style={{background:"var(--gray-100)", fontFamily:"var(--font-mono)"}}/></Field>
              <Field label="Allow manual LP number" help="When ON, operators can enter custom LP numbers (e.g. from supplier GS1 labels). Uniqueness enforced."><label><input type="checkbox" defaultChecked={WH_SETTINGS.lpNumbering.allowManual} disabled={!isAdmin}/> Enabled</label></Field>
            </div>
          </>)}

          {cat === "grn" && (<>
            <div className="card-head"><h3 className="card-title">Receiving (GRN)</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
            <div className="set-form-grid">
              <Field label="Require batch on receipt" help="V-WH-GRN-003"><label><input type="checkbox" defaultChecked={WH_SETTINGS.grn.requireBatch} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Require expiry date on receipt" help="V-WH-GRN-004"><label><input type="checkbox" defaultChecked={WH_SETTINGS.grn.requireExpiry} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Require supplier batch"><label><input type="checkbox" defaultChecked={WH_SETTINGS.grn.requireSupplierBatch} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Default QA status on receipt"><select defaultValue={WH_SETTINGS.grn.defaultQa} disabled={!isAdmin}><option>PENDING</option><option>PASSED</option></select></Field>
              <Field label="Allow over-receipt"><label><input type="checkbox" defaultChecked={WH_SETTINGS.grn.allowOverReceipt} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Over-receipt tolerance (%)"><input type="number" min="0" max="50" defaultValue={WH_SETTINGS.grn.overReceiptTolerance} disabled={!isAdmin}/></Field>
            </div>
          </>)}

          {cat === "picking" && (<>
            <div className="card-head"><h3 className="card-title">Picking &amp; strategy</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
            <div className="set-form-grid">
              <Field label="Enable FEFO" help="First Expired First Out — default for food (EU 1169/2011)"><label><input type="checkbox" defaultChecked={WH_SETTINGS.picking.enableFefo} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Enable FIFO fallback" help="For products without expiry date"><label><input type="checkbox" defaultChecked={WH_SETTINGS.picking.enableFifoFallback} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Allow FEFO override" help="Operators may deviate from FEFO with reason code"><label><input type="checkbox" defaultChecked={WH_SETTINGS.picking.allowFefoOverride} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Require override reason" help="Locked ON when Allow FEFO Override is ON"><label><input type="checkbox" defaultChecked={WH_SETTINGS.picking.requireOverrideReason} disabled/> Enabled (locked)</label></Field>
              <div className="field-long">
                <div className="alert-blue alert-box" style={{fontSize:12}}>
                  <span>ⓘ</span>
                  <div>
                    <b>FEFO rule registry:</b> <span className="mono">fefo_strategy_v1</span> · <a style={{color:"var(--blue)", cursor:"pointer"}}>View in Settings → Rule Registry →</a><br/>
                    <b>LP state machine:</b> <span className="mono">lp_state_machine_v1</span> · <a style={{color:"var(--blue)", cursor:"pointer"}}>View →</a><br/>
                    Rules are dev-authored and deployed via PR. Admins can view and audit here but not edit.
                  </div>
                </div>
              </div>
            </div>
          </>)}

          {cat === "expiry" && (<>
            <div className="card-head"><h3 className="card-title">Expiry &amp; shelf life</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
            <div className="set-form-grid">
              <Field label="Red threshold (days)"><input type="number" defaultValue={WH_SETTINGS.expiry.redThreshold} disabled={!isAdmin}/></Field>
              <Field label="Amber threshold (days)"><input type="number" defaultValue={WH_SETTINGS.expiry.amberThreshold} disabled={!isAdmin}/></Field>
              <Field label="Expiry cron schedule" help="Next 3 runs: 2026-04-22 02:00 · 2026-04-23 02:00 · 2026-04-24 02:00"><input defaultValue={WH_SETTINGS.expiry.cronSchedule} disabled={!isAdmin} className="mono"/></Field>
              <Field label="use_by auto-block on cron" help="🔒 Required for EU 1169/2011 compliance for food tenants"><label><input type="checkbox" defaultChecked={true} disabled/> Enabled (locked for food tenants)</label></Field>
            </div>
          </>)}

          {cat === "labels" && (<>
            <div className="card-head"><h3 className="card-title">Labels &amp; printing</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
            <div className="set-form-grid">
              <Field label="Print label on receipt"><label><input type="checkbox" defaultChecked={WH_SETTINGS.labels.printOnReceipt} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Default copies"><input type="number" min="1" max="10" defaultValue={WH_SETTINGS.labels.defaultCopies} disabled={!isAdmin}/></Field>
              <Field label="Default printer"><select disabled={!isAdmin} defaultValue={WH_SETTINGS.labels.defaultPrinter}>{WH_PRINTERS.map(p => <option key={p.id} value={p.id}>{p.id} · {p.name} · {p.online ? "Online" : "Offline"}</option>)}</select></Field>
              <Field label="Label templates" help="Managed in 02-Settings → Label Templates"><input value="Standard 4×6, Mini 2×2" readOnly style={{background:"var(--gray-100)"}}/></Field>
              <div className="field-long"><a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}}>Go to Printer settings (02-Settings) →</a></div>
            </div>
          </>)}

          {cat === "scanner" && (<>
            <div className="card-head"><h3 className="card-title">Scanner</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
            <div className="set-form-grid">
              <Field label="Scanner idle timeout (s)"><input type="number" defaultValue={WH_SETTINGS.scanner.idleTimeout} disabled={!isAdmin}/></Field>
              <Field label="Scanner lock timeout (s)"><input type="number" defaultValue={WH_SETTINGS.scanner.lockTimeout} disabled={!isAdmin}/></Field>
              <Field label="Sound feedback"><label><input type="checkbox" defaultChecked={WH_SETTINGS.scanner.soundFeedback} disabled={!isAdmin}/> Enabled</label></Field>
              <Field label="Vibration on scan"><label><input type="checkbox" defaultChecked={WH_SETTINGS.scanner.vibrationOnScan} disabled={!isAdmin}/> Enabled</label></Field>
              <div className="field-long" style={{fontSize:11, color:"var(--muted)"}}>Scanner authentication (PIN setup) is managed in <a style={{color:"var(--blue)", cursor:"pointer"}}>User management → Scanner PIN</a>.</div>
            </div>
          </>)}

          {cat === "locations" && (
            <ScaffoldedScreen
              breadcrumb={<span>Warehouse settings · Locations</span>}
              title="Locations (settings view)"
              spec="See WH-018 Locations hierarchy (main nav) for the full editor."
              phase="In prototype"
              notes="Settings page sketch only — full CRUD is in the Locations hierarchy view. This tab shows tenant-level depth limits and defaults."/>
          )}

          {cat === "integr" && (
            <ScaffoldedScreen
              breadcrumb={<span>Warehouse settings · Integrations</span>}
              title="Integrations (D365, SAP, etc.)"
              spec="05-WAREHOUSE-UX.md §1 notes D365 drift. Integration admin UX is shared with Planning Settings."
              phase="Phase 2"
              notes="Designed — not yet built. Integration configuration (D365 endpoints, credentials, pull windows) is owned by the Settings module; warehouse surfaces read-only status here." />
          )}
        </div>
      </div>
    </>
  );
};

Object.assign(window, { WhInventory, WhLocations, WhGenealogy, WhExpiry, WhSettings });
