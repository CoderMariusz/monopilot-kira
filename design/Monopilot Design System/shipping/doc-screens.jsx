// ============ SHIP-020 Slip + SHIP-021 BOL + SHIP-025 Doc Hub + Shipments + Carriers + RMA + Settings ============

// -------- SHIP-025 Documents Hub --------
const ShDocs = ({ onNav, openModal }) => {
  const [tab, setTab] = React.useState("slips");

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Documents</div>
          <h1 className="page-title">Documents hub — packing slips &amp; BOL</h1>
          <div className="muted" style={{fontSize:12}}>{SH_DOCS_SLIPS.length} slips · {SH_DOCS_BOLS.length} BOLs · BRCGS 7-year retention on signed BOL (V-SHIP-LBL-04)</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">Print all unprinted</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>openModal("bolSign")}>⇪ Upload signed BOL</button>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:12}}>
        <span>ⓘ</span>
        <div><b>BRCGS retention:</b> BOLs kept 7 years per BRCGS Issue 10 §3.4 (Supabase Storage). Deletion disabled once signed BOL uploaded · SHA-256 hash recorded on generation.</div>
      </div>

      <div className="tabs-bar">
        <button className={"tab-btn " + (tab === "slips" ? "on" : "")} onClick={()=>setTab("slips")}>Packing slips <span className="count">{SH_DOCS_SLIPS.length}</span></button>
        <button className={"tab-btn " + (tab === "bols" ? "on" : "")} onClick={()=>setTab("bols")}>Bills of Lading <span className="count">{SH_DOCS_BOLS.length}</span></button>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search shipment, SO, or customer…" style={{width:280}}/>
        <input type="date" placeholder="From" style={{width:130}}/>
        <input type="date" placeholder="To" style={{width:130}}/>
        <select style={{width:160}}><option>All customers</option></select>
        <select style={{width:140}}><option>All statuses</option><option>Printed</option><option>Pending</option><option>Stale</option></select>
        <span className="spacer"></span>
        <button className="clear-all">Clear</button>
      </div>

      {tab === "slips" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Shipment</th><th>SO</th><th>Customer</th><th>Generated</th><th>Version</th><th>Allergen labelled</th><th>Status</th><th>Hash</th><th style={{width:180}}></th></tr></thead>
            <tbody>
              {SH_DOCS_SLIPS.map(d => (
                <tr key={d.shipment} className={d.stale ? "row-warning" : ""}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{d.shipment}</td>
                  <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{d.so}</td>
                  <td style={{fontSize:12}}>{d.customer}</td>
                  <td className="mono" style={{fontSize:11}}>{d.generated}</td>
                  <td className="mono">v{d.version}{d.stale && <span className="badge badge-amber" style={{fontSize:9, marginLeft:4}}>Stale</span>}</td>
                  <td>{d.allergenLabelled ? <span className="badge badge-green" style={{fontSize:9}}>✓ Yes</span> : <span className="badge badge-gray" style={{fontSize:9}}>No</span>}</td>
                  <td>
                    {d.status === "printed" && <span className="badge badge-green" style={{fontSize:9}}>Printed</span>}
                    {d.status === "pending" && <span className="badge badge-amber" style={{fontSize:9}}>Pending</span>}
                    {d.status === "missing" && <span className="badge badge-gray" style={{fontSize:9}}>Not generated</span>}
                  </td>
                  <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>{d.hash ? d.hash + "…" : "—"}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={()=>onNav("doc_slip")}>Preview</button>
                    {d.status !== "missing" && <button className="btn btn-ghost btn-sm">Print</button>}
                    <button className="btn btn-ghost btn-sm" onClick={()=>openModal("slipRegen")}>Regen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "bols" && (
        <div className="card" style={{padding:0}}>
          <table>
            <thead><tr><th>Shipment</th><th>SO</th><th>Customer</th><th>Generated</th><th>BOL hash</th><th>Signed</th><th>Retained until</th><th style={{width:220}}></th></tr></thead>
            <tbody>
              {SH_DOCS_BOLS.map(d => (
                <tr key={d.shipment}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{d.shipment}</td>
                  <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{d.so}</td>
                  <td style={{fontSize:12}}>{d.customer}</td>
                  <td className="mono" style={{fontSize:11}}>{d.generated}</td>
                  <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>{d.hash || "—"}</td>
                  <td>
                    {d.signed === "signed"   && <span className="badge badge-green" style={{fontSize:9}}>Signed</span>}
                    {d.signed === "pending"  && <span className="badge badge-amber" style={{fontSize:9}}>Pending</span>}
                    {d.signed === "not_req"  && <span className="badge badge-gray" style={{fontSize:9}}>Not required</span>}
                  </td>
                  <td className="mono" style={{fontSize:11}}>{d.retainedUntil}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={()=>onNav("doc_bol")}>Preview</button>
                    <button className="btn btn-ghost btn-sm">Print</button>
                    {d.signed === "pending" && <button className="btn btn-primary btn-sm" onClick={()=>openModal("bolSign", d)}>Upload signed</button>}
                    {d.signed === "signed"  && <button className="btn btn-ghost btn-sm">⇪ Download</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// -------- SHIP-020 Packing Slip Preview --------
const ShDocSlip = ({ onBack, onNav, openModal }) => {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Shipping</a> · <a onClick={()=>onNav("docs")}>Documents</a> · Packing slip</div>
          <h1 className="page-title">Packing slip — <span className="mono">SH-2026-00046</span></h1>
          <div className="muted" style={{fontSize:12}}>EU 1169/2011 compliant · Allergens bold in PDF (V-SHIP-LBL-01)</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={()=>onBack()}>← Back</button>
        </div>
      </div>

      <div className="doc-layout">
        <div className="doc-controls">
          <div className="label" style={{marginBottom:8}}>Controls</div>
          <Summary rows={[
            { label: "Shipment", value: "SH-2026-00046" },
            { label: "SO", value: "SO-2026-2447" },
            { label: "Customer", value: "Biedronka (JMP)", mono: false },
          ]}/>
          <Field label="Template">
            <select><option>Default EU 1169/2011</option><option>Lidl PL retailer template</option><option>Custom upload</option></select>
          </Field>
          <Field label="Language" help="V-SHIP-LBL-05 — multi-language P2">
            <select><option>EN · English</option><option disabled>PL · Polish (P2)</option><option disabled>DE · German (P2)</option></select>
          </Field>
          <div style={{display:"flex", flexDirection:"column", gap:6, marginTop:10}}>
            <button className="btn btn-primary btn-sm" onClick={()=>openModal("slipRegen")}>Generate / regenerate</button>
            <button className="btn btn-secondary btn-sm">🖨 Print</button>
            <button className="btn btn-secondary btn-sm">⇪ Download PDF</button>
          </div>

          <div className="label" style={{marginTop:14, marginBottom:6}}>Version history</div>
          <div style={{fontSize:11, color:"var(--muted)"}}>
            <div>v1 · 2026-04-21 14:12 by m.krawczyk</div>
          </div>
        </div>

        <div className="doc-preview">
          <div className="doc-page">
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
              <div>
                <h2>PACKING SLIP</h2>
                <div style={{fontSize:10, color:"var(--muted)"}}>Forza Foods Sp. z o.o.</div>
              </div>
              <div style={{textAlign:"right", fontSize:11}}>
                <div className="mono">SH-2026-00046</div>
                <div>2026-04-21</div>
              </div>
            </div>

            <div className="doc-addr">
              <div><strong>Ship from</strong>Forza Foods Sp. z o.o.<br/>ul. Przemysłowa 12<br/>62-081 Przeźmierowo, PL<br/>VAT: PL7820030500</div>
              <div><strong>Ship to</strong>Biedronka DC Poznań<br/>ul. Logistyczna 8<br/>61-696 Poznań, PL<br/>Dock hours: 06:00–14:00</div>
            </div>

            <table>
              <thead><tr><th>Ref</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>Sales Order</td><td className="mono">SO-2026-2447</td></tr>
                <tr><td>Customer PO</td><td className="mono">JMP-2026-00447</td></tr>
                <tr><td>Order date</td><td>2026-04-21</td></tr>
                <tr><td>Ship date</td><td>2026-04-22</td></tr>
              </tbody>
            </table>

            <h3>Line items</h3>
            <table>
              <thead><tr><th>#</th><th>Code</th><th>Description</th><th>GTIN</th><th>Batch</th><th>Best before</th><th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Unit £</th><th style={{textAlign:"right"}}>Total £</th></tr></thead>
              <tbody>
                <tr><td>1</td><td className="mono">FA5100</td><td>Kiełbasa śląska pieczona 450g</td><td className="mono">05901234567801</td><td className="mono">WO-2026-0108-B1</td><td>2026-06-14</td><td className="num mono">120</td><td className="num mono">12.80</td><td className="num mono">1,536.00</td></tr>
                <tr><td>2</td><td className="mono">FA5200</td><td>Pasztet drobiowy z żurawiną 180g</td><td className="mono">05901234567814</td><td className="mono">WO-2026-0100-B1</td><td>2026-06-18</td><td className="num mono">80</td><td className="num mono">8.40</td><td className="num mono">672.00</td></tr>
                <tr><td>3</td><td className="mono">FA5301</td><td>Pierogi ruskie 1kg</td><td className="mono">05901234567828</td><td className="mono">WO-2026-0112-B1</td><td>2026-05-22</td><td className="num mono">20</td><td className="num mono">14.20</td><td className="num mono">284.00</td></tr>
              </tbody>
            </table>

            <div className="doc-allergen">
              <b>Per-product allergen declaration (EU 1169/2011):</b><br/>
              Line 1 contains: <strong>milk</strong><br/>
              Line 3 contains: <strong>gluten</strong>, <strong>milk</strong>, <strong>egg</strong><br/>
              ⚠ Customer allergen restrictions noted — segregation required.
            </div>

            <div style={{marginTop:14, fontSize:10}}>
              <b>This shipment contains:</b> <strong>gluten</strong>, <strong>milk</strong>, <strong>egg</strong>
            </div>

            <div style={{marginTop:14, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
              <div>
                <div style={{fontSize:10, color:"var(--muted)"}}>Subtotal</div>
                <div style={{fontSize:14, fontWeight:700}} className="mono">£2,492.00</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10, color:"var(--muted)"}}>Total (GBP)</div>
                <div style={{fontSize:18, fontWeight:700}} className="mono">£2,492.00</div>
              </div>
            </div>

            <div style={{marginTop:20, padding:10, background:"var(--gray-050)", textAlign:"center", fontSize:10}}>
              Barcode · SSCC 0 5012345 00000045 7 · <span className="mono">▏▎▌▎▏▏▌▎▍▎▏▏▎▌▎▏▏</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// -------- SHIP-021 BOL Preview --------
const ShDocBol = ({ onBack, onNav, openModal }) => {
  const [generated, setGenerated] = React.useState(true);
  const [signed, setSigned] = React.useState(false);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={onBack}>Shipping</a> · <a onClick={()=>onNav("docs")}>Documents</a> · Bill of Lading</div>
          <h1 className="page-title">Bill of Lading — <span className="mono">SH-2026-00045-BOL</span></h1>
          <div className="muted" style={{fontSize:12}}>BRCGS Issue 10 · SHA-256 immutability · 7-year retention</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
        </div>
      </div>

      <div className="doc-layout">
        <div className="doc-controls">
          <div className="label" style={{marginBottom:8}}>Shipment details</div>
          <Summary rows={[
            { label: "Shipment", value: "SH-2026-00045" },
            { label: "SO", value: "SO-2026-2445" },
            { label: "Customer", value: "Lidl Polska", mono: false },
            { label: "Status", value: "Shipped", mono: false },
          ]}/>

          <Field label="Carrier" required><input defaultValue="DHL Freight"/></Field>
          <Field label="Service level"><input defaultValue="Express 24h"/></Field>
          <Field label="Pro number"><input defaultValue="DHLPL44189" className="mono"/></Field>
          <Field label="Freight class" help="LTL P1 manual"><input defaultValue="LTL-65"/></Field>
          <Field label="HAZMAT"><label style={{fontSize:11}}><input type="checkbox" disabled/> HAZMAT (P2, FR-7.44)</label></Field>

          {generated && <div className="doc-hash-badge">🔒 SHA-256: <span className="mono">f3e1a9d2…</span> recorded</div>}
          {signed && <div className="doc-hash-badge signed">✓ Signed hash: <span className="mono">a12c78be…</span> · BRCGS 7y retention active</div>}

          <div style={{display:"flex", flexDirection:"column", gap:6, marginTop:10}}>
            <button className="btn btn-primary btn-sm" onClick={()=>setGenerated(true)}>Generate BOL</button>
            <button className="btn btn-secondary btn-sm">🖨 Print</button>
            <button className="btn btn-secondary btn-sm">⇪ Download PDF</button>
            <button className="btn btn-primary btn-sm" onClick={()=>openModal("bolSign")} disabled={signed}>⇪ Upload signed BOL</button>
          </div>
        </div>

        <div className="doc-preview">
          <div className="doc-page">
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
              <div><h2>BILL OF LADING</h2><div style={{fontSize:10, color:"var(--muted)"}}>Non-negotiable · BRCGS Issue 10</div></div>
              <div style={{textAlign:"right", fontSize:11}}>
                <div className="mono">SH-2026-00045-BOL</div>
                <div>2026-04-21</div>
                <div>Pro: <span className="mono">DHLPL44189</span></div>
              </div>
            </div>

            <div className="doc-addr">
              <div><strong>Ship from</strong>Forza Foods Sp. z o.o.<br/>ul. Przemysłowa 12<br/>62-081 Przeźmierowo, PL</div>
              <div><strong>Ship to</strong>Lidl DC Wrocław<br/>ul. Logistyczna 12<br/>54-512 Wrocław, PL</div>
            </div>

            <h3>Carrier</h3>
            <div style={{fontSize:11}}>DHL Freight · Express 24h · Pro DHLPL44189 · Driver: A. Kowalczyk</div>

            <h3>Shipment units</h3>
            <table>
              <thead><tr><th>Box</th><th>SSCC</th><th>Dims (cm)</th><th>Weight kg</th><th>GTINs</th><th>Qty units</th></tr></thead>
              <tbody>
                <tr><td>1</td><td className="mono">0 5012345 00000043 3</td><td>60×40×30</td><td className="num mono">31.2</td><td className="mono">05901234567801</td><td className="num mono">60</td></tr>
                <tr><td>2</td><td className="mono">0 5012345 00000044 0</td><td>60×40×30</td><td className="num mono">31.0</td><td className="mono">05901234567801</td><td className="num mono">60</td></tr>
                <tr><td>3</td><td className="mono">0 5012345 00000045 7</td><td>60×40×30</td><td className="num mono">32.0</td><td className="mono">05901234567814</td><td className="num mono">80</td></tr>
                <tr><td>4</td><td className="mono">0 5012345 00000046 4</td><td>60×40×30</td><td className="num mono">30.4</td><td className="mono">05901234567828</td><td className="num mono">40</td></tr>
              </tbody>
            </table>

            <div className="doc-allergen">
              <b>Aggregated allergens (EU 1169/2011):</b> This shipment contains <strong>gluten</strong>, <strong>milk</strong>, <strong>egg</strong>. Customer allergen restrictions: peanut restricted (segregation noted).
            </div>

            <h3>Special instructions</h3>
            <div style={{fontSize:10, lineHeight:1.6}}>Cold chain 0–4°C required. Dock window 06:00–14:00 Mon-Sat. EDI ASN sent 4h prior.</div>

            <div className="doc-sig">
              <div><div className="sig-block"></div><div>Driver name<br/><b>A. Kowalczyk</b></div><div>Date loaded: 2026-04-21 11:18</div></div>
              <div><div className="sig-block"></div><div>Consignee signature<br/>Date received: ____________</div></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// -------- Shipments list (combined with delivery tracker) --------
const ShShipments = ({ onNav, openModal }) => {
  const [expanded, setExpanded] = React.useState(new Set(["SH-2026-00044"]));
  const toggle = id => { const n = new Set(expanded); if (n.has(id)) n.delete(id); else n.add(id); setExpanded(n); };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Shipments</div>
          <h1 className="page-title">Shipments &amp; delivery tracker</h1>
          <div className="muted" style={{fontSize:12}}>{SH_SHIPMENTS.length} shipments · {SH_SHIPMENTS.filter(s=>s.status==="shipped").length} in transit · {SH_SHIPMENTS.filter(s=>s.status==="delivered").length} delivered · P1 manual POD · P2 carrier webhook</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={()=>openModal("shipConfirm")}>🚚 Confirm shipment</button>
        </div>
      </div>

      <div className="kpi-row-4">
        <div className="kpi amber"><div className="kpi-label">In packing</div><div className="kpi-value">{SH_SHIPMENTS.filter(s => s.status === "packing").length}</div><div className="kpi-sub">Active now</div></div>
        <div className="kpi blue"><div className="kpi-label">Packed · ready</div><div className="kpi-value">{SH_SHIPMENTS.filter(s => s.status === "packed").length}</div><div className="kpi-sub">Awaiting ship confirm</div></div>
        <div className="kpi"><div className="kpi-label">Shipped</div><div className="kpi-value">{SH_SHIPMENTS.filter(s => s.status === "shipped").length}</div><div className="kpi-sub">In transit</div></div>
        <div className="kpi green"><div className="kpi-label">Delivered today</div><div className="kpi-value">{SH_SHIPMENTS.filter(s => s.status === "delivered").length}</div><div className="kpi-sub">POD received</div></div>
      </div>

      <div className="card" style={{padding:0}}>
        <table>
          <thead><tr><th style={{width:20}}></th><th>Shipment</th><th>SO</th><th>Customer</th><th>Status</th><th>Boxes</th><th>Weight</th><th>Carrier</th><th>Pro#</th><th>BOL</th><th>Shipped / Delivered</th><th style={{width:120}}></th></tr></thead>
          <tbody>
            {SH_SHIPMENTS.map(s => {
              const isOpen = expanded.has(s.shipment);
              return (
                <React.Fragment key={s.shipment}>
                  <tr style={{cursor:"pointer"}} onClick={()=>toggle(s.shipment)}>
                    <td><span style={{color:"var(--muted)", fontSize:10}}>{isOpen ? "▼" : "▶"}</span></td>
                    <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{s.shipment}</td>
                    <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{s.so}</td>
                    <td style={{fontSize:12}}>{s.customer}</td>
                    <td><ShipStatus s={s.status}/></td>
                    <td className="mono" style={{fontSize:11}}>{s.boxes}</td>
                    <td className="num mono">{s.weight}</td>
                    <td style={{fontSize:11}}>{s.carrier}</td>
                    <td className="mono" style={{fontSize:11}}>{s.pro}</td>
                    <td>
                      {s.bolStatus === "signed"  && <span className="badge badge-green" style={{fontSize:9}}>Signed</span>}
                      {s.bolStatus === "pending" && <span className="badge badge-amber" style={{fontSize:9}}>Pending sig</span>}
                      {s.bolStatus === "—"       && <span className="muted" style={{fontSize:10}}>—</span>}
                    </td>
                    <td className="mono" style={{fontSize:10}}>
                      {s.shippedAt && <>🚚 {s.shippedAt}<br/></>}
                      {s.deliveredAt && <span style={{color:"var(--green-700)"}}>✓ {s.deliveredAt}</span>}
                    </td>
                    <td onClick={e=>e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>onNav("doc_bol")}>BOL</button>
                      <button className="btn btn-ghost btn-sm">⋯</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={12} className="sub-table" style={{padding:"14px 20px"}}>
                        <b style={{fontSize:12}}>Delivery tracking — {s.shipment}</b>

                        <div className="ship-timeline">
                          <div className={"ship-tl-step " + (s.status !== "packing" && s.status !== "packed" ? "done" : "")}>
                            <div className="stsc">1</div>Shipped
                            {s.shippedAt && <div className="mono" style={{fontSize:9, color:"var(--muted)"}}>{s.shippedAt}</div>}
                          </div>
                          <div className={"ship-tl-line " + (["shipped","delivered"].includes(s.status) ? "done" : "")}></div>
                          <div className={"ship-tl-step " + (s.status === "shipped" ? "current" : s.status === "delivered" ? "done" : "")}>
                            <div className="stsc">2</div>In transit
                          </div>
                          <div className={"ship-tl-line " + (s.status === "delivered" ? "done" : "")}></div>
                          <div className={"ship-tl-step " + (s.status === "delivered" ? "done" : "")}>
                            <div className="stsc">3</div>Out for delivery
                          </div>
                          <div className={"ship-tl-line " + (s.status === "delivered" ? "done" : "")}></div>
                          <div className={"ship-tl-step " + (s.status === "delivered" ? "done" : "")}>
                            <div className="stsc">4</div>Delivered
                            {s.deliveredAt && <div className="mono" style={{fontSize:9, color:"var(--muted)"}}>{s.deliveredAt}</div>}
                          </div>
                        </div>

                        {s.status !== "delivered" && (
                          <div style={{marginTop:10, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, fontSize:11}}>
                            <Field label="Current status"><select><option>In transit</option><option>Out for delivery</option><option>Delivered</option><option>Exception</option></select></Field>
                            <Field label="Estimated delivery"><input type="date" defaultValue="2026-04-22"/></Field>
                            <Field label="Tracking notes"><input placeholder="Optional note…"/></Field>
                          </div>
                        )}

                        {s.status === "delivered" && (
                          <div style={{fontSize:11, marginTop:10, padding:8, background:"var(--green-050a)", borderRadius:4, color:"var(--green-700)"}}>
                            ✓ POD uploaded · consignee M.Evans · <a style={{color:"var(--blue)", cursor:"pointer"}}>View signed document →</a>
                          </div>
                        )}

                        {/* TUNING-PATTERN §3.5 CompactActivity — group shipment events by SO correlation id */}
                        <div style={{marginTop:12}}>
                          <div style={{fontSize:11, color:"var(--muted)", marginBottom:6, textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600}}>Event timeline — grouped by {s.so}</div>
                          <CompactActivity groups={[{
                            id: s.shipment,
                            label: s.so + " · " + s.shipment,
                            defaultOpen: ["packing","shipped"].includes(s.status),
                            events: [
                              { ts: s.shippedAt ? s.shippedAt.split(" ")[0] : "—", msg: "SO allocated to shipment · " + s.boxes + " boxes planned", internal: true },
                              { ts: s.shippedAt ? s.shippedAt.split(" ")[0] : "—", msg: "SSCC labels generated (" + s.ssccGenerated + " of " + s.boxes.split("/")[1] + ")" },
                              { ts: s.shippedAt ? s.shippedAt.split(" ")[0] : "—", msg: "Boxes closed · total weight " + (s.weight || "—") },
                              ...(s.bolStatus === "signed" ? [{ ts: s.shippedAt || "—", msg: "BOL signed by carrier · " + s.carrier }] : []),
                              ...(s.bolStatus === "pending" ? [{ ts: s.shippedAt || "—", msg: "BOL printed · awaiting carrier signature" }] : []),
                              ...(s.shippedAt ? [{ ts: s.shippedAt, msg: "🚚 Shipped · PRO# " + s.pro }] : []),
                              ...(s.deliveredAt ? [{ ts: s.deliveredAt, msg: "✓ Delivered · POD received" }] : []),
                              { ts: "system", msg: "Webhook poll · status unchanged", internal: true },
                            ],
                          }]}/>
                        </div>

                        <div className="alert-blue alert-box" style={{fontSize:11, marginTop:8}}>
                          <span>ⓘ</span>
                          <div>P2: Carrier webhook integration (EPIC 11-F) will auto-update tracking status. P1: manual update only.</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

// -------- Carriers (SHIP-014b) --------
const ShCarriers = ({ onNav, openModal }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Carriers</div>
        <h1 className="page-title">Carrier configurations</h1>
        <div className="muted" style={{fontSize:12}}>{SH_CARRIERS.length} carriers · P1 manual BOL only · API integration deferred to Phase 2 (EPIC 11-F)</div>
      </div>
      <div className="row-flex">
        <button className="btn btn-primary btn-sm" onClick={()=>openModal("carrierEdit")}>＋ Add carrier</button>
      </div>
    </div>

    <div className="alert-blue alert-box" style={{marginBottom:12, fontSize:12}}>
      <span>ⓘ</span>
      <div><b>P2 notice:</b> Carrier API integration (rate shopping, label generation, tracking webhooks, POD) deferred to Phase 2 (EPIC 11-F). P1: manual BOL + packing slip only.</div>
    </div>

    <div className="card" style={{padding:0}}>
      <table>
        <thead><tr><th>Carrier</th><th>Service level</th><th>Rate basis</th><th>API</th><th>Default</th><th>Status</th><th>Tracking template</th><th style={{width:140}}></th></tr></thead>
        <tbody>
          {SH_CARRIERS.map(c => (
            <tr key={c.id}>
              <td style={{fontWeight:500, fontSize:12}}>{c.name}</td>
              <td style={{fontSize:11}}>{c.service}</td>
              <td><span className="badge badge-gray" style={{fontSize:9}}>{c.rateBasis}</span></td>
              <td><span className="badge badge-gray" style={{fontSize:9}}>{c.api}</span></td>
              <td>{c.isDefault ? <span style={{color:"var(--amber-700)"}}>★</span> : <span className="muted">—</span>}</td>
              <td>{c.active ? <span className="badge badge-green" style={{fontSize:9}}>Active</span> : <span className="badge badge-gray" style={{fontSize:9}}>Inactive</span>}</td>
              <td className="mono" style={{fontSize:10, color:"var(--muted)"}}>{c.trackingTemplate}</td>
              <td>
                <button className="btn btn-ghost btn-sm" onClick={()=>openModal("carrierEdit", c)}>Edit</button>
                <button className="btn btn-ghost btn-sm">Deactivate</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// -------- RMA (SHIP-026) --------
const ShRmas = ({ onNav, openModal }) => (
  <>
    <div className="page-head">
      <div>
        <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Returns (RMA)</div>
        <h1 className="page-title">Return merchandise authorisations</h1>
        <div className="muted" style={{fontSize:12}}>{SH_RMAS.length} RMAs · P1: create + list + QA disposition (restock/scrap/quality_hold) + credit note · Scanner-assisted receive via 06-SCANNER-P1</div>
      </div>
      <div className="row-flex">
        <button className="btn btn-primary btn-sm">＋ Create RMA</button>
      </div>
    </div>

    <div className="alert-blue alert-box" style={{marginBottom:12, fontSize:12}}>
      <span>ⓘ</span>
      <div><b>P1 Must (PRD §4.1 #7):</b> RMA QA disposition (<code className="mono">restock</code> / <code className="mono">scrap</code> / <code className="mono">quality_hold</code>), credit note generation, and re-stock to LP (05-WAREHOUSE) are all P1. Full RMA lifecycle: <code className="mono">pending → approved → receiving → received → processed → closed</code>.</div>
    </div>

    <div className="scanner-card" style={{marginBottom:12}}>
      <div className="scic">↩</div>
      <div className="scmeta">
        <h4>Receive returns with Scanner</h4>
        <p>SCN-072 return receive via 06-SCANNER-P1 · scan RMA → scan returned LP → condition + qty</p>
      </div>
      <span className="spacer"></span>
      <button className="btn btn-primary btn-sm">Open scanner →</button>
    </div>

    <div className="tabs-bar" title="rma_requests.status enum — PRD §9.1">
      <button className="tab-btn on">All <span className="count">{SH_RMAS.length}</span></button>
      <button className="tab-btn">Pending <span className="count">{SH_RMAS.filter(r=>r.status==="Pending"||r.status==="Open").length}</span></button>
      <button className="tab-btn">Approved <span className="count">{SH_RMAS.filter(r=>r.status==="Approved").length}</span></button>
      <button className="tab-btn">Receiving <span className="count">{SH_RMAS.filter(r=>r.status==="Receiving"||r.status==="In Transit").length}</span></button>
      <button className="tab-btn">Received <span className="count">{SH_RMAS.filter(r=>r.status==="Received").length}</span></button>
      <button className="tab-btn">Processed <span className="count">{SH_RMAS.filter(r=>r.status==="Processed").length}</span></button>
      <button className="tab-btn">Closed <span className="count">{SH_RMAS.filter(r=>r.status==="Closed").length}</span></button>
    </div>

    <div className="card" style={{padding:0}}>
      <table>
        <thead><tr><th>RMA#</th><th>Original SO</th><th>Customer</th><th>Reason</th><th style={{textAlign:"right"}}>Lines</th><th>Status</th><th>Created</th><th>QA disposition</th><th style={{width:100}}></th></tr></thead>
        <tbody>
          {SH_RMAS.map(r => (
            <tr key={r.rma} style={{cursor:"pointer"}}>
              <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{r.rma}</td>
              <td className="mono" style={{fontSize:11, color:"var(--blue)"}}>{r.so}</td>
              <td style={{fontSize:12}}>{r.customer}</td>
              <td><span className="badge badge-gray" style={{fontSize:9}}>{r.reason}</span></td>
              <td className="num mono">{r.lines}</td>
              <td>
                {(r.status === "Open" || r.status === "Pending")       && <span className="badge badge-amber" style={{fontSize:9}}>Pending</span>}
                {r.status === "Approved"                                && <span className="badge badge-blue"  style={{fontSize:9}}>Approved</span>}
                {(r.status === "In Transit" || r.status === "Receiving") && <span className="badge badge-blue"  style={{fontSize:9}}>Receiving</span>}
                {r.status === "Received"                                && <span className="badge badge-green" style={{fontSize:9}}>Received</span>}
                {r.status === "Processed"                               && <span className="badge badge-green" style={{fontSize:9}}>Processed</span>}
                {r.status === "Closed"                                  && <span className="badge badge-gray"  style={{fontSize:9}}>Closed</span>}
              </td>
              <td className="mono" style={{fontSize:11}}>{r.created}</td>
              <td>
                {r.disposition === "Pending" && <span className="badge badge-amber" style={{fontSize:9}}>Pending</span>}
                {r.disposition === "Pass" && <span className="badge badge-green" style={{fontSize:9}}>Pass</span>}
              </td>
              <td><button className="btn btn-ghost btn-sm">View →</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
);

// -------- Settings (SHIP-023) --------
const ShSettings = ({ role, onNav }) => {
  const [tab, setTab] = React.useState("allocation");
  const isAdmin = role === "Admin";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Shipping settings</div>
          <h1 className="page-title">Shipping settings</h1>
          <div className="muted" style={{fontSize:12}}>{isAdmin ? "Admin edit mode" : "Read-only — Admin role required"}</div>
        </div>
      </div>

      {!isAdmin && <div className="set-banner info">ⓘ You have read-only access. Contact your administrator to make changes.</div>}

      <div className="tabs-bar">
        <button className={"tab-btn " + (tab === "allocation" ? "on" : "")} onClick={()=>setTab("allocation")}>Allocation</button>
        <button className={"tab-btn " + (tab === "wave" ? "on" : "")} onClick={()=>setTab("wave")}>Wave &amp; picking</button>
        <button className={"tab-btn " + (tab === "labels" ? "on" : "")} onClick={()=>setTab("labels")}>Labels &amp; documents</button>
        <button className={"tab-btn " + (tab === "d365" ? "on" : "")} onClick={()=>setTab("d365")}>D365 integration</button>
        <button className={"tab-btn " + (tab === "advanced" ? "on" : "")} onClick={()=>setTab("advanced")}>Advanced</button>
      </div>

      <div className="card">
        {tab === "allocation" && (<>
          <div className="card-head"><h3 className="card-title">Allocation strategy</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
          <div className="set-form-grid">
            <Field label="Default strategy" help="FEFO reads from fefo_strategy_v1 (02-SETTINGS §7)"><select defaultValue={SH_SETTINGS.allocation.defaultStrategy} disabled={!isAdmin}><option>FEFO</option><option>FIFO</option><option>Manual</option></select></Field>
            <Field label="Auto-allocate on confirm" help="D-SHP-12 default ON"><label><input type="checkbox" defaultChecked={SH_SETTINGS.allocation.autoAllocateOnConfirm} disabled={!isAdmin}/> Enabled</label></Field>
            <Field label="Partial allocation allowed" help="D-SHP-10"><label><input type="checkbox" defaultChecked={SH_SETTINGS.allocation.partialAllocation} disabled={!isAdmin}/> Enabled</label></Field>
            <Field label="Auto-create backorder" help="D-SHP-10 default OFF"><label><input type="checkbox" defaultChecked={SH_SETTINGS.allocation.autoCreateBackorder} disabled={!isAdmin}/> Enabled</label></Field>
            <Field label="Expired LP override" help="Allow manager to override expired LP with reason"><label><input type="checkbox" defaultChecked={SH_SETTINGS.allocation.expiredLpOverride} disabled={!isAdmin}/> Enabled</label></Field>
            <div className="field-long">
              <div className="alert-blue alert-box" style={{fontSize:11}}>
                <span>ⓘ</span>
                <div><b>Rule registry:</b> <span className="mono">fefo_strategy_v1</span>, <span className="mono">allergen_cascade_v1</span> · dev-authored, deployed via PR · Admins view only. <a style={{color:"var(--blue)", cursor:"pointer"}}>View in 02-Settings →</a></div>
              </div>
            </div>
          </div>
        </>)}

        {tab === "wave" && (<>
          <div className="card-head"><h3 className="card-title">Wave &amp; picking</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
          <div className="set-form-grid">
            <Field label="Wave release cutoff time" help="Same-day pick cutoff"><input type="time" defaultValue={SH_SETTINGS.wave.waveReleaseCutoff} disabled={!isAdmin}/></Field>
            <Field label="Max SOs per wave" help="P1 default 50"><input type="number" defaultValue={SH_SETTINGS.wave.maxSosPerWave} min="1" max="200" disabled={!isAdmin}/></Field>
            <Field label="Default pick priority"><select defaultValue={SH_SETTINGS.wave.defaultPriority} disabled={!isAdmin}><option value="1">1 · Highest</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5 · Lowest</option></select></Field>
            <Field label="Short pick default"><select defaultValue={SH_SETTINGS.wave.shortPickDefault} disabled={!isAdmin}><option>Wait</option><option>Ship short</option><option>Prompt picker</option></select></Field>
          </div>
        </>)}

        {tab === "labels" && (<>
          <div className="card-head"><h3 className="card-title">Labels &amp; documents</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
          <div className="set-form-grid">
            <Field label="GS1 Company Prefix" required help="V-SHIP-PACK-03 — 7-10 digits"><input defaultValue={SH_SETTINGS.labels.gs1Prefix} disabled={!isAdmin} className="mono"/></Field>
            <Field label="SSCC extension digit"><input type="number" min="0" max="9" defaultValue={SH_SETTINGS.labels.ssccExtensionDigit} disabled={!isAdmin}/></Field>
            <Field label="Current SSCC sequence" help="Next atomic ID"><input value={String(SH_SETTINGS.labels.currentSequence).padStart(8, "0")} readOnly className="mono" style={{background:"var(--gray-100)"}}/></Field>
            <Field label="Label template"><select defaultValue={SH_SETTINGS.labels.labelTemplate} disabled={!isAdmin}><option>Default GS1-128</option><option>Custom ZPL</option></select></Field>
            <Field label="Packing slip template"><select defaultValue={SH_SETTINGS.labels.slipTemplate} disabled={!isAdmin}><option>Default EU 1169/2011</option><option>Lidl retailer</option></select></Field>
            <Field label="BOL template"><select defaultValue={SH_SETTINGS.labels.bolTemplate} disabled={!isAdmin}><option>Default BRCGS</option><option>Custom</option></select></Field>
            <div className="field-long">
              <button className="btn btn-secondary btn-sm" disabled={!isAdmin}>Test SSCC generation</button>
              <button className="btn btn-ghost btn-sm" disabled={!isAdmin} style={{marginLeft:6}}>Reset sequence (audit-logged)</button>
            </div>
            <div className="field-long">
              <div className="label" style={{marginBottom:6}}>Printers</div>
              <table>
                <thead><tr><th>Printer</th><th>IP</th><th>Status</th></tr></thead>
                <tbody>{SH_PRINTERS.map(p => <tr key={p.id}><td className="mono">{p.id} · {p.name}</td><td className="mono">{p.ip}</td><td>{p.online ? <span className="badge badge-green" style={{fontSize:9}}>● Online</span> : <span className="badge badge-red" style={{fontSize:9}}>● Offline</span>}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </>)}

        {tab === "d365" && (<>
          <div className="card-head"><h3 className="card-title">D365 integration (LEGACY-D365)</h3></div>
          <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:12}}>
            <span>ⓘ</span>
            <div>Constants are read-only here; edited in 02-SETTINGS §11. Admin-only.</div>
          </div>
          <div className="set-form-grid">
            <Field label="dataAreaId (FNOR)"><input value={SH_SETTINGS.d365.dataAreaId} readOnly className="mono" style={{background:"var(--gray-100)"}}/></Field>
            <Field label="Warehouse code (ForzDG)"><input value={SH_SETTINGS.d365.warehouse} readOnly className="mono" style={{background:"var(--gray-100)"}}/></Field>
            <Field label="GL account (FinGoods)"><input value={SH_SETTINGS.d365.glAccount} readOnly className="mono" style={{background:"var(--gray-100)"}}/></Field>
            <Field label="Approver (FOR100048)"><input value={SH_SETTINGS.d365.approver} readOnly className="mono" style={{background:"var(--gray-100)"}}/></Field>
            <Field label="Shipping push flag" help="d365_shipping_push_enabled — gates shipment.confirmed outbox event"><label><input type="checkbox" defaultChecked={SH_SETTINGS.d365.shippingFlag} disabled={!isAdmin}/> Enabled (push on confirm)</label></Field>
            <Field label="DLQ count (shipping)"><input value={SH_SETTINGS.d365.dlqCount} readOnly className="mono" style={{background:"var(--red-050a)", color:"var(--red-700)"}}/></Field>
            <div className="field-long">
              <div className="label" style={{marginBottom:6}}>P2 extension fields (disabled)</div>
              <div style={{opacity:0.6, fontSize:11}}>
                shipping_warehouse · customer_account_id_map · courier_default_carrier · courier_api_vault_key — <span className="badge badge-blue" style={{fontSize:9}}>Phase 2</span>
              </div>
            </div>
            <div className="field-long">
              <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}}>View D365 outbox DLQ → /admin/integrations/d365/dlq?source=shipping</a>
            </div>
          </div>
        </>)}

        {tab === "advanced" && (<>
          <div className="card-head"><h3 className="card-title">Advanced</h3><button className="btn btn-primary btn-sm" disabled={!isAdmin}>Save changes</button></div>
          <div className="set-form-grid">
            <Field label="Credit limit warning threshold %" help="P2 hard block (EPIC 11-C)"><input type="number" defaultValue={SH_SETTINGS.advanced.creditWarningPct} disabled={!isAdmin}/><span className="badge badge-blue" style={{fontSize:9, marginLeft:4}}>Phase 2</span></Field>
            <Field label="EUDR gate" help="Phase 2 · EPIC 11-H"><label><input type="checkbox" disabled/> Enabled <span className="badge badge-blue" style={{fontSize:9, marginLeft:4}}>P2</span></label></Field>
            <Field label="RLS debug mode" help="Show org_id on all records"><label><input type="checkbox" defaultChecked={SH_SETTINGS.advanced.rlsDebug} disabled={!isAdmin}/> Enabled</label></Field>
          </div>
        </>)}
      </div>
    </>
  );
};

Object.assign(window, { ShDocs, ShDocSlip, ShDocBol, ShShipments, ShCarriers, ShRmas, ShSettings });
