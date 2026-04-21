// ============ SHIP-017 Packing Station + SHIP-019 SSCC Queue + SHIP-024 Ship Confirm ============

// -------- Station selector --------
const ShPackStations = ({ onOpenStation, onNav, openModal }) => {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Packing stations</div>
          <h1 className="page-title">Packing stations</h1>
          <div className="muted" style={{fontSize:12}}>{SH_STATIONS.length} stations · {SH_STATIONS.filter(s=>s.busy).length} busy · ZPL printers: {SH_PRINTERS.filter(p=>p.online).length}/{SH_PRINTERS.length} online</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("sscc")}>SSCC queue →</button>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:12, fontSize:12}}>
        <span>ⓘ</span>
        <div>Desktop primary · 10" tablet landscape supported for packers. Box-level mixed packing uses this workbench; pallet-level uses scanner (06-SCANNER-P1 SCN-050).</div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12}}>
        {SH_STATIONS.map(s => (
          <div key={s.id} className="card" style={{cursor:"pointer", borderLeft:"3px solid " + (s.online ? (s.busy ? "var(--amber)" : "var(--green)") : "var(--red)")}} onClick={()=>onOpenStation(s.id)}>
            <div className="card-head">
              <h3 className="card-title" style={{fontFamily:"var(--font-mono)"}}>{s.id}</h3>
              {s.online ? (s.busy ? <span className="badge badge-amber" style={{fontSize:9}}>Busy</span> : <span className="badge badge-green" style={{fontSize:9}}>Ready</span>) : <span className="badge badge-red" style={{fontSize:9}}>Printer offline</span>}
            </div>
            <div style={{fontSize:13, fontWeight:500, marginBottom:6}}>{s.name}</div>
            <div style={{fontSize:11, color:"var(--muted)", lineHeight:1.7}}>
              <div>Zone: <b>{s.zone}</b></div>
              <div>Printer: <span className="mono">{s.printer}</span> {s.online ? <span style={{color:"var(--green-700)"}}>● online</span> : <span style={{color:"var(--red-700)"}}>● offline</span>}</div>
              {s.shipment && <div>Active shipment: <span className="mono" style={{color:"var(--blue)"}}>{s.shipment}</span></div>}
              {s.shipment && <div>Boxes: {s.boxes}/{s.totalBoxes}</div>}
            </div>
            <div style={{marginTop:10}}>
              <button className="btn btn-primary btn-sm" style={{width:"100%"}}>{s.busy ? "Continue packing →" : "Open station →"}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

// -------- Packing station work bench (3-column) --------
const ShPackStation = ({ onBack, onNav, openModal }) => {
  const s = SH_PACK_SESSION;
  const [activeLp, setActiveLp] = React.useState(s.queue[0].lp);
  const totalPicked = s.queue.length;
  const boxWeight = s.activeBox.items.reduce((a,i) => a + i.actualKg, 0);
  const cwVar = s.activeBox.items[0] ? ((s.activeBox.items[0].actualKg - s.activeBox.items[0].nominalKg) / s.activeBox.items[0].nominalKg * 100).toFixed(1) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Shipping</a> · <a onClick={()=>onNav("packing")}>Packing stations</a> · {s.station.id}</div>
          <h1 className="page-title">{s.station.name} — <span className="mono">{s.shipment}</span></h1>
          <div className="muted" style={{fontSize:12}}>Packing <span className="mono" style={{color:"var(--blue)"}}>{s.so}</span> for <b>{s.customer}</b> · {s.boxesClosed}/{s.boxesPlanned} boxes closed · total {s.totalWeight} kg</div>
        </div>
        <div className="row-flex">
          <ShipStatus s={s.status}/>
          <button className="btn btn-secondary btn-sm" onClick={()=>onNav("packing")}>← Stations</button>
        </div>
      </div>

      {/* Scanner card */}
      <div className="scanner-card" style={{marginBottom:12}}>
        <div className="scic">📦</div>
        <div className="scmeta">
          <h4>Pack with Scanner (pallet level)</h4>
          <p>SCN-050 via 06-SCANNER-P1 · box-level mixed packing uses this desktop workbench</p>
        </div>
        <span className="spacer"></span>
        <button className="btn btn-primary btn-sm">Open scanner →</button>
      </div>

      <div className="pack-layout">
        {/* LEFT — Picked LPs queue */}
        <div className="pack-queue">
          <div className="label" style={{marginBottom:8}}>Picked LPs queue ({totalPicked})</div>
          <div style={{fontSize:10, color:"var(--muted)", marginBottom:8}}>Sorted FEFO · click or scan to move into active box</div>
          {s.queue.map(q => (
            <div key={q.lp} className={"pack-queue-row " + (q.lp === activeLp ? "active" : "")} onClick={()=>setActiveLp(q.lp)}>
              <div className="pqr-lp">{q.lp}</div>
              <div className="pqr-meta">{q.product}</div>
              <div className="pqr-meta">{q.qty} ea · {q.weight} kg · exp {q.expiry}</div>
              <div className="pqr-meta mono" style={{color:"var(--blue)"}}>{q.so}</div>
            </div>
          ))}
        </div>

        {/* MIDDLE — Active box builder */}
        <div>
          <div className="pack-box">
            <div className="pack-box-head">
              <div>
                <div className="pbh-code">Box {s.activeBox.boxNum} of {s.boxesPlanned}</div>
                <div style={{fontSize:11, color:"var(--muted)"}}>Shipment <span className="mono">{s.shipment}</span> · SSCC: <span className="mono">{s.activeBox.sscc || "not generated"}</span></div>
              </div>
              <div>
                <div style={{fontSize:10, color:"var(--muted)", textAlign:"right"}}>Running weight</div>
                <div className="pbh-weight">{boxWeight.toFixed(1)} kg</div>
              </div>
            </div>

            <input className="pack-scan-input" placeholder="Scan LP barcode or type LP#…" autoFocus/>

            <table>
              <thead><tr><th>LP</th><th>Product</th><th style={{textAlign:"right"}}>Qty</th><th>Batch</th><th>Expiry</th><th style={{textAlign:"right"}}>Nominal kg</th><th style={{textAlign:"right"}}>Actual kg</th><th>Variance</th><th></th></tr></thead>
              <tbody>
                {s.activeBox.items.map((item, i) => (
                  <tr key={i}>
                    <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{item.lp}</td>
                    <td style={{fontSize:11}}>{item.product}</td>
                    <td className="num mono">{item.qty} ea</td>
                    <td className="mono" style={{fontSize:10}}>{item.batch}</td>
                    <td className="mono" style={{fontSize:11}}>{item.expiry}</td>
                    <td className="num mono">{item.nominalKg}</td>
                    <td><input type="number" step="0.1" defaultValue={item.actualKg} className="num" style={{width:70, fontSize:11}}/></td>
                    <td><span className={"badge " + (Math.abs(cwVar) < 5 ? "badge-green" : Math.abs(cwVar) < 10 ? "badge-amber" : "badge-red")} style={{fontSize:9}}>{cwVar > 0 ? "+" : ""}{cwVar}% {Math.abs(cwVar) < 5 ? "✓" : "⚠"}</span></td>
                    <td><button className="btn btn-ghost btn-sm">🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="alert-blue alert-box" style={{fontSize:11, marginTop:10}}>
              <span>ⓘ</span>
              <div><b>Catch weight carve-out (D-SHP-17):</b> product <span className="mono">weight_mode=catch</span> — operator enters actual kg. Variance against nominal against <span className="mono">products.variance_tolerance_pct</span>.</div>
            </div>

            <div className="row-flex" style={{marginTop:10, gap:8}}>
              <Field label="Box dimensions (cm)">
                <div className="row-flex" style={{gap:4}}>
                  <input type="number" placeholder="L" defaultValue={s.activeBox.dims.l} className="num" style={{width:50}}/>
                  <input type="number" placeholder="W" defaultValue={s.activeBox.dims.w} className="num" style={{width:50}}/>
                  <input type="number" placeholder="H" defaultValue={s.activeBox.dims.h} className="num" style={{width:50}}/>
                </div>
              </Field>
              <Field label="Confirm box weight (kg)">
                <input type="number" step="0.1" defaultValue={boxWeight.toFixed(1)} className="num"/>
              </Field>
              <span className="spacer"></span>
              <button className="btn btn-secondary btn-sm">Keep open</button>
              <button className="btn btn-primary btn-sm" onClick={()=>openModal("packClose")}>Close box & generate SSCC →</button>
            </div>
          </div>

          {/* Closed boxes summary */}
          <div className="card" style={{marginTop:12, padding:0}}>
            <div className="card-head" style={{padding:"10px 14px"}}>
              <h3 className="card-title">Closed boxes ({s.closedBoxes.length})</h3>
            </div>
            <table>
              <thead><tr><th>Box</th><th>SSCC</th><th>Weight</th><th>Contents</th><th></th></tr></thead>
              <tbody>
                {s.closedBoxes.map(b => (
                  <tr key={b.boxNum}>
                    <td className="mono">Box {b.boxNum}</td>
                    <td className="mono" style={{color:"var(--blue)", fontSize:11, fontWeight:600}}>{b.sscc}</td>
                    <td className="num mono">{b.weight} kg</td>
                    <td style={{fontSize:11}}>{b.contents}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={()=>openModal("ssccReprint")}>Reprint</button>
                      <button className="btn btn-ghost btn-sm">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT — Shipment summary + actions */}
        <div className="pack-summary">
          <div className="label" style={{marginBottom:8}}>Shipment summary</div>
          <Summary rows={[
            { label: "Shipment", value: s.shipment },
            { label: "Sales order", value: s.so },
            { label: "Customer", value: s.customer, mono: false },
            { label: "Status", value: s.status, mono: false },
            { label: "Boxes closed", value: s.boxesClosed + " / " + s.boxesPlanned },
            { label: "Total weight", value: s.totalWeight + " kg" },
            { label: "Station", value: s.station.id },
            { label: "Printer", value: s.station.printer },
          ]}/>

          <div className="pack-checklist">
            <div className="label" style={{marginBottom:6}}>Ship-confirm checklist (V-SHIP-SHIP)</div>
            <div className={"pack-checklist-row " + (s.closedBoxes.length === s.boxesPlanned ? "pass" : "")}>
              <span className="pclh-ic">{s.closedBoxes.length === s.boxesPlanned ? "✓" : "○"}</span>
              <span>All boxes have SSCC (V-SHIP-SHIP-01)</span>
            </div>
            <div className="pack-checklist-row">
              <span className="pclh-ic">○</span>
              <span>BOL generated (V-SHIP-SHIP-02)</span>
            </div>
            <div className="pack-checklist-row pass">
              <span className="pclh-ic">✓</span>
              <span>No critical QA holds (V-SHIP-SHIP-03)</span>
            </div>
            <div className="pack-checklist-row pass">
              <span className="pclh-ic">✓</span>
              <span>All pick lines resolved</span>
            </div>
          </div>

          <div style={{marginTop:12, display:"flex", flexDirection:"column", gap:6}}>
            <button className="btn btn-secondary btn-sm" onClick={()=>onNav("doc_slip")}>Generate packing slip</button>
            <button className="btn btn-secondary btn-sm" onClick={()=>onNav("doc_bol")}>Generate BOL</button>
            <button className="btn btn-primary btn-sm" onClick={()=>openModal("shipConfirm")} disabled={s.closedBoxes.length < s.boxesPlanned}>🚚 Confirm shipment</button>
          </div>
        </div>
      </div>
    </>
  );
};

// =================================================================
// SHIP-019 SSCC Labels
// =================================================================
const ShSSCCQueue = ({ onNav, openModal }) => {
  const [selected, setSelected] = React.useState(new Set());
  const toggle = s => { const n = new Set(selected); if (n.has(s)) n.delete(s); else n.add(s); setSelected(n); };

  const pending = SH_SSCCS.filter(s => !s.printed);
  const errored = SH_SSCCS.filter(s => s.printError);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · SSCC labels</div>
          <h1 className="page-title">SSCC labels queue</h1>
          <div className="muted" style={{fontSize:12}}>GS1-128 barcodes · AI(00) · 18-digit · atomic sequence · Next: <span className="mono">00000048</span></div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">Print all unprinted</button>
          <button className="btn btn-primary btn-sm" disabled={selected.size === 0}>Print selected ({selected.size})</button>
        </div>
      </div>

      <div className="card" style={{padding:"10px 14px", marginBottom:12, background:"var(--blue-050)"}}>
        <div style={{fontSize:12}}>
          <b>SSCC-18 structure:</b> <span className="mono">Extension(1) + GS1 Company Prefix(7–10) + Serial(6–8) + Check digit(1) = 18 digits.</span> GS1-128 AI (00). Example: <span className="mono" style={{color:"var(--blue)"}}>0 5012345 00000042 5</span>
        </div>
      </div>

      <div className="kpi-row-4">
        <div className="kpi green"><div className="kpi-label">Printed today</div><div className="kpi-value">14</div><div className="kpi-sub">Across {SH_STATIONS.length} stations</div></div>
        <div className="kpi amber"><div className="kpi-label">Queued</div><div className="kpi-value">{pending.length}</div><div className="kpi-sub">Not yet printed</div></div>
        <div className="kpi red"><div className="kpi-label">Print errors</div><div className="kpi-value">{errored.length}</div><div className="kpi-sub">ZPL-SH-02 offline</div></div>
        <div className="kpi blue"><div className="kpi-label">Next sequence</div><div className="kpi-value mono" style={{fontSize:18}}>00000048</div><div className="kpi-sub">Atomic · V-SHIP-PACK-04</div></div>
      </div>

      {errored.length > 0 && (
        <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
          <span>⚠</span>
          <div><b>Printer ZPL-SH-02 offline — {errored.length} label(s) queued.</b> Labels will print automatically when printer reconnects. Or reassign to ZPL-SH-01 via reprint modal.</div>
          <button className="btn btn-sm btn-secondary" onClick={()=>onNav("settings")}>Printer settings →</button>
        </div>
      )}

      <div className="card" style={{padding:0}}>
        <table>
          <thead>
            <tr>
              <th style={{width:30}}><input type="checkbox"/></th>
              <th>SSCC</th>
              <th>Shipment</th>
              <th style={{textAlign:"right"}}>Box#</th>
              <th>Customer</th>
              <th>Generated at</th>
              <th>Printer</th>
              <th>Print status</th>
              <th style={{width:160}}></th>
            </tr>
          </thead>
          <tbody>
            {SH_SSCCS.map(s => (
              <tr key={s.sscc} className={s.printError ? "row-overdue" : ""}>
                <td onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(s.sscc)} onChange={()=>toggle(s.sscc)}/></td>
                <td className="mono" style={{fontWeight:600, color:"var(--blue)", letterSpacing:"0.05em"}}>{s.sscc}</td>
                <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{s.shipment}</td>
                <td className="num mono">{s.box}</td>
                <td style={{fontSize:12}}>{s.customer}</td>
                <td className="mono" style={{fontSize:11}}>{s.generatedAt}</td>
                <td className="mono" style={{fontSize:11}}>{s.printer}</td>
                <td>
                  {s.printed && <span className="badge badge-green" style={{fontSize:9}}>✓ Printed</span>}
                  {!s.printed && !s.printError && <span className="badge badge-amber" style={{fontSize:9}}>Queued</span>}
                  {s.printError && <span className="badge badge-red" style={{fontSize:9}}>Error</span>}
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={()=>openModal("ssccPreview", s)}>Preview</button>
                  {s.printed ? <button className="btn btn-ghost btn-sm" onClick={()=>openModal("ssccReprint", s)}>Reprint</button>
                             : <button className="btn btn-primary btn-sm">Print</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:14}}>
        <div className="label" style={{marginBottom:6}}>Example SSCC label preview</div>
        <SsccLabelPreview sscc="0 5012345 00000045 7" shipment="SH-2026-00045" box={3} customer="Lidl Polska" product="FA5100 Kiełbasa" batch="WO-2026-0108-B1" expiry="2026-06-14" weight={10.8} allergens={["milk"]}/>
      </div>
    </>
  );
};

// Reusable SSCC label preview component
const SsccLabelPreview = ({ sscc, shipment, box, customer, product, batch, expiry, weight, allergens }) => (
  <div className="sscc-label" style={{maxWidth:360}}>
    <div className="ssl-sub">GS1-128 · AI (00)</div>
    <div className="ssl-gs1"></div>
    <div className="ssl-code">{sscc}</div>
    <div className="ssl-sub">SSCC-18</div>
    <div style={{height:1, background:"var(--gray-300)", margin:"8px 0"}}></div>
    <div className="ssl-row"><b>AI (01) GTIN</b><span>05901234567801</span></div>
    <div className="ssl-row"><b>AI (10) Batch</b><span>{batch}</span></div>
    <div className="ssl-row"><b>AI (17) Use-by</b><span>{expiry} ({expiry.slice(2).replace(/-/g,"")})</span></div>
    <div className="ssl-row"><b>AI (3103) Net kg</b><span>{weight.toFixed(3)}</span></div>
    <div style={{height:1, background:"var(--gray-300)", margin:"6px 0"}}></div>
    <div className="ssl-row"><b>Product</b><span>{product}</span></div>
    <div className="ssl-row"><b>Shipment</b><span>{shipment} · box {box}</span></div>
    <div className="ssl-row"><b>Ship to</b><span>{customer}</span></div>
    {allergens && allergens.length > 0 && (
      <div className="ssl-allergens">Contains: {allergens.map((a,i) => <React.Fragment key={a}><strong>{a}</strong>{i < allergens.length-1 && ", "}</React.Fragment>)}</div>
    )}
  </div>
);

Object.assign(window, { ShPackStations, ShPackStation, ShSSCCQueue, SsccLabelPreview });
