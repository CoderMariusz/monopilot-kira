// ============================================================
// WAREHOUSE MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Modal inventory:
//   M-01 GRN from PO (3-step wizard, multi-LP per line)
//   M-02 GRN from TO (simple form)
//   M-03 Stock movement create (simple form + auto-split notice + >10% approval gate)
//   M-04 LP split (sum-validator)
//   M-05 LP merge (wizard-ish 2-step)
//   M-06 QA status change (dual-path)
//   M-07 Label print (preview + options)
//   M-08 Reserve hard-lock
//   M-09 Release reservation (destructive w/ reason)
//   M-10 FEFO deviation confirm (warn + reason, always proceed)
//   M-11 Destroy / scrap LP (destructive w/ reason + confirm)
//   M-12 Use_by block override (manager-only, high-audit)
//   M-13 Location create / edit
//   M-14 Cycle count (P1 stub + >10% approval gate)
//   M-15 State transition confirm
//   + ForceUnlockModal (scanner lock force-release)
// ============================================================

// -------- M-01: GRN from PO — 3-step wizard --------
const GRNFromPOModal = ({ open, onClose }) => {
  const [step, setStep] = React.useState("select");
  const [completed, setCompleted] = React.useState(new Set());
  const [po, setPo] = React.useState(null);
  const [lines, setLines] = React.useState({
    1: [{ qty: 40, batch: "B-2026-04-20", supplierBatch: "SUP-AGRO-4820", expiry: "2026-05-20", mfg: "2026-04-20", cw: 40.0, loc: "WH-Factory-A › Receiving › Dock-01", qa: "PENDING" },
        { qty: 60, batch: "B-2026-04-21", supplierBatch: "SUP-AGRO-4821", expiry: "2026-05-21", mfg: "2026-04-21", cw: 60.3, loc: "WH-Factory-A › Receiving › Dock-01", qa: "PENDING" }],
  });
  const [submitting, setSubmitting] = React.useState(false);
  // Force-close state — one entry per partially-received PO line that operator may close (FR-WH-008 / V-WH-GRN-008)
  const [forceClose, setForceClose] = React.useState({
    2: { checked: false, reasonCode: "", reasonText: "" },
    3: { checked: false, reasonCode: "", reasonText: "" },
  });
  const updateFc = (seq, field, val) => setForceClose(fc => ({ ...fc, [seq]: { ...fc[seq], [field]: val } }));

  const steps = [
    { key: "select",  label: "Select PO" },
    { key: "entry",   label: "Enter receipt lines" },
    { key: "review",  label: "Review & complete" },
  ];

  const goNext = () => {
    setCompleted(new Set([...completed, step]));
    setStep(step === "select" ? "entry" : step === "entry" ? "review" : "review");
  };
  const goBack = () => {
    setStep(step === "review" ? "entry" : "select");
  };

  const totalLPs = Object.values(lines).reduce((a, arr) => a + arr.length, 0);

  const addRow = (lineIdx) => {
    const next = { ...lines };
    next[lineIdx] = [...(next[lineIdx] || []), { qty: 0, batch: "", supplierBatch: "", expiry: "", mfg: "", cw: 0, loc: "WH-Factory-A › Receiving › Dock-01", qa: "PENDING" }];
    setLines(next);
  };
  const removeRow = (lineIdx, rowIdx) => {
    const next = { ...lines };
    next[lineIdx] = next[lineIdx].filter((_, i) => i !== rowIdx);
    setLines(next);
  };
  const updateRow = (lineIdx, rowIdx, k, v) => {
    const next = { ...lines };
    next[lineIdx] = next[lineIdx].map((r, i) => i === rowIdx ? { ...r, [k]: v } : r);
    setLines(next);
  };

  // sample PO lines used when a PO is selected
  const poLines = [
    { seq: 1, code: "R-1001", product: "Wieprzowina kl. II",  ordered: 400, received: 0, uom: "kg", status: "not_received" },
    { seq: 2, code: "R-2101", product: "Pieprz czarny mielony", ordered: 20, received: 0, uom: "kg", status: "not_received" },
    { seq: 3, code: "R-1301", product: "Cebula drobna",         ordered: 220, received: 0, uom: "kg", status: "not_received" },
    { seq: 4, code: "R-1002", product: "Słonina wieprzowa",     ordered: 200, received: 200, uom: "kg", status: "fully_received" },
  ];

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 900));
    setSubmitting(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Receive goods from Purchase Order" subtitle="Each row creates one License Plate" size="fullpage"
      foot={step === "select" ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!po} onClick={goNext}>Next: enter receipt lines →</button>
      </> : step === "entry" ? <>
        <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
        <span className="spacer"></span>
        <span className="muted" style={{fontSize:11, marginRight:10}}>{totalLPs} LP(s) to create</span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={totalLPs === 0} onClick={goNext}>Next: review →</button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>{submitting ? "Creating GRN…" : "Complete receipt"}</button>
      </>}>

      <Stepper steps={steps} current={step} completed={completed}/>

      {/* STEP 1 */}
      {step === "select" && (
        <div style={{marginTop:14}}>
          <div className="row-flex" style={{marginBottom:10}}>
            <input type="text" placeholder="Type PO number or scan barcode…" style={{flex:1}} autoFocus/>
            <button className="btn btn-secondary btn-sm">🔲 Scan</button>
            <select style={{width:160}}><option>All suppliers</option></select>
            <select style={{width:140}}><option>Due within 7d</option><option>30d</option><option>All</option></select>
          </div>
          <table>
            <thead><tr><th>PO</th><th>Supplier</th><th>Due date</th><th style={{textAlign:"right"}}>Lines</th><th>Progress</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {WH_POS_RECEIVING.map(p => (
                <tr key={p.id} className={po === p.id ? "row-warning" : ""} style={{cursor:"pointer"}} onClick={()=>setPo(p.id)}>
                  <td className="mono" style={{fontWeight:600}}>{p.id}</td>
                  <td>{p.supplier}</td>
                  <td>
                    <div className={"mono " + (p.overdue ? "exp-expired" : "")} style={{fontSize:11}}>{p.due}</div>
                    <div className="muted" style={{fontSize:10}}>{p.rel}</div>
                  </td>
                  <td className="num mono" style={{fontVariantNumeric:"tabular-nums"}}>{p.lines}</td>
                  <td style={{width:150}}>
                    <div className="grn-prog"><span style={{width: p.progress + "%"}}></span></div>
                    <span className="mono" style={{fontSize:10, color:"var(--muted)"}}>{p.progress}% received</span>
                  </td>
                  <td><span className={"badge " + (p.status === "confirmed" ? "badge-blue" : "badge-amber")} style={{fontSize:9}}>{p.status}</span></td>
                  <td><button className="btn btn-primary btn-sm" onClick={(e)=>{e.stopPropagation(); setPo(p.id);}}>Select →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {po && <div className="alert-green alert-box" style={{marginTop:10, fontSize:12}}><span>✓</span><div>Selected <b className="mono">{po}</b>. Click <b>Next</b> to enter receipt lines.</div></div>}
        </div>
      )}

      {/* STEP 2 */}
      {step === "entry" && (
        <div style={{marginTop:14}}>
          <div className="alert-blue alert-box" style={{marginBottom:10, fontSize:12}}>
            <span>ⓘ</span>
            <div>
              <b>Multi-LP flow:</b> click <b>＋ Add LP row</b> once per delivery unit. Example: 100 BOX in 2 batches on 2 pallets = 2 rows → 2 LPs. System never auto-splits.
            </div>
          </div>

          <div className="card" style={{padding:"10px 14px", marginBottom:10, background:"var(--gray-050)"}}>
            <div className="row-flex" style={{fontSize:12}}>
              <b className="mono">{po}</b> · Agro-Fresh Ltd. · Expected 2026-04-22 · WH-Factory-A
              <span className="spacer"></span>
              <a style={{color:"var(--blue)", cursor:"pointer", fontSize:11}}>View PO →</a>
            </div>
            <div className="grn-prog" style={{marginTop:8, maxWidth:"none"}}><span style={{width: "25%"}}></span></div>
            <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>1 of 4 lines covered — 25% of ordered qty</div>
          </div>

          <div className="ff-inline">
            <Field label="GRN number (auto)" help="Auto-generated — cannot be changed"><input value="GRN-2026-00043" readOnly style={{background:"var(--gray-100)", fontFamily:"var(--font-mono)"}}/></Field>
            <Field label="Receipt date" required><input type="date" defaultValue="2026-04-21"/></Field>
          </div>
          <Field label="Default receiving location"><select defaultValue="WH-Factory-A › Receiving › Dock-01"><option>WH-Factory-A › Receiving › Dock-01</option><option>WH-Factory-A › Receiving › Dock-02</option></select></Field>
          <Field label="Notes (optional, max 500)"><textarea placeholder="Visible on GRN detail" maxLength={500}/></Field>

          {poLines.map(pl => {
            const rows = lines[pl.seq] || [];
            const sum = rows.reduce((a, r) => a + (+r.qty || 0), 0);
            const remaining = pl.ordered - pl.received - sum;
            const totalCls = sum === pl.ordered - pl.received ? "ok" : sum > pl.ordered - pl.received ? "err" : rows.length > 0 ? "warn" : "";
            return (
              <div key={pl.seq} className="grn-line-card">
                <div className="grn-line-head">
                  <span className="glh-num">Line {pl.seq}</span>
                  <span className="glh-prod">{pl.product}</span>
                  <span className="glh-code">{pl.code}</span>
                  <span className="grn-badge ord">Ordered: {pl.ordered} {pl.uom}</span>
                  <span className={"grn-badge " + (pl.received === pl.ordered ? "full" : pl.received > 0 ? "rec" : "ord")}>Received: {pl.received}</span>
                  {pl.received < pl.ordered && <span className="grn-badge rem">Remaining: {pl.ordered - pl.received}</span>}
                  {pl.status === "fully_received" && <span className="badge badge-green" style={{fontSize:9}}>Fully received</span>}
                  <div className="glh-actions">
                    {pl.status !== "fully_received" && <button className="btn btn-secondary btn-sm" onClick={()=>addRow(pl.seq)}>＋ Add LP row</button>}
                  </div>
                </div>
                {pl.status !== "fully_received" && rows.length > 0 && (
                  <div className="grn-line-body">
                    <table>
                      <thead><tr><th style={{width:70}}>Qty</th><th style={{width:40}}>UoM</th><th>Batch</th><th>Supplier batch</th><th>Expiry *</th><th>Mfg date</th><th>Catch weight</th><th>Location</th><th>QA</th><th style={{width:30}}></th></tr></thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const overRem = +r.qty > (pl.ordered - pl.received);
                          return (
                            <tr key={i}>
                              <td>
                                <input type="number" value={r.qty} onChange={e=>updateRow(pl.seq, i, "qty", +e.target.value)} className={"num " + (overRem ? "" : "")} style={{width:60, borderColor: overRem ? "var(--red)" : undefined}}/>
                                {overRem && <div style={{fontSize:9, color:"var(--red-700)", marginTop:2}}>Exceeds remaining</div>}
                              </td>
                              <td className="mono" style={{color:"var(--muted)"}}>{pl.uom}</td>
                              <td><input value={r.batch} onChange={e=>updateRow(pl.seq, i, "batch", e.target.value)} placeholder="B-..."/>{r.batch && <span className="gs1-tag">GS1</span>}</td>
                              <td><input value={r.supplierBatch} onChange={e=>updateRow(pl.seq, i, "supplierBatch", e.target.value)} placeholder="SUP-…"/></td>
                              <td><input type="date" value={r.expiry} onChange={e=>updateRow(pl.seq, i, "expiry", e.target.value)}/></td>
                              <td><input type="date" value={r.mfg} onChange={e=>updateRow(pl.seq, i, "mfg", e.target.value)}/></td>
                              <td><input type="number" step="0.1" value={r.cw} onChange={e=>updateRow(pl.seq, i, "cw", +e.target.value)} className="num" style={{width:70}}/><span style={{fontSize:10, color:"var(--muted)", marginLeft:3}}>kg</span></td>
                              <td><select value={r.loc} onChange={e=>updateRow(pl.seq, i, "loc", e.target.value)}><option>WH-Factory-A › Receiving › Dock-01</option><option>WH-Factory-A › Cold › B3</option><option>WH-Factory-A › Dry › A2</option></select></td>
                              <td>
                                <select value={r.qa} onChange={e=>updateRow(pl.seq, i, "qa", e.target.value)} style={{fontSize:10}}><option>PENDING</option><option>PASSED</option><option>HOLD</option></select>
                              </td>
                              <td><button className="btn btn-ghost btn-sm" onClick={()=>removeRow(pl.seq, i)}>🗑</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {pl.status !== "fully_received" && (
                  <div className={"grn-line-total " + totalCls}>
                    {rows.length === 0
                      ? <span>No rows yet — click <b>＋ Add LP row</b> to begin.</span>
                      : <><span><b>This line:</b> {rows.map(r=>r.qty).join(" + ")} = <b>{sum}</b> / {pl.ordered - pl.received} {pl.uom}</span>
                          <span className="grn-prog"><span className={totalCls === "err" ? "err" : totalCls === "warn" ? "warn" : ""} style={{width: Math.min(100, (sum / (pl.ordered - pl.received || 1)) * 100) + "%"}}></span></span>
                          {totalCls === "ok" && <span>— Fully accounted for ✓</span>}
                          {totalCls === "warn" && <span>— {remaining} {pl.uom} remaining (partial GRN allowed)</span>}
                          {totalCls === "err" && <span>— Exceeds remaining by {Math.abs(remaining)} {pl.uom}</span>}
                        </>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* STEP 3 */}
      {step === "review" && (
        <div style={{marginTop:14}}>
          <Summary rows={[
            { label: "GRN number", value: "GRN-2026-00043" },
            { label: "Source PO", value: po, mono: true },
            { label: "Supplier", value: "Agro-Fresh Ltd.", mono: false },
            { label: "Total LPs to create", value: totalLPs + " LP(s)", emphasis: true },
            { label: "Receipt date", value: "2026-04-21" },
            { label: "Warehouse", value: "WH-Factory-A" },
          ]}/>

          <div className="card" style={{padding:0, marginTop:10}}>
            <div className="card-head" style={{padding:"10px 14px"}}><h3 className="card-title">LP preview</h3></div>
            <table>
              <thead><tr><th>Line</th><th>LP#</th><th>Product</th><th>Qty</th><th>Batch</th><th>Expiry</th><th>Location</th><th>QA</th></tr></thead>
              <tbody>
                {Object.entries(lines).flatMap(([li, arr]) => arr.map((r, i) => {
                  const p = poLines.find(pp => pp.seq === +li);
                  return (
                    <tr key={li + "-" + i}>
                      <td className="mono">{li}</td>
                      <td className="mono" style={{color:"var(--blue)"}}>LP{String(221 + i + (+li - 1) * 2).padStart(8, "0")} (preview)</td>
                      <td>{p?.product}</td>
                      <td className="num mono">{r.qty} {p?.uom}</td>
                      <td className="mono" style={{fontSize:11}}>{r.batch}</td>
                      <td className="mono" style={{fontSize:11}}>{r.expiry}</td>
                      <td className="mono" style={{fontSize:10}}>{r.loc}</td>
                      <td><QAStatus s={r.qa}/></td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>

          <div className="alert-blue alert-box" style={{marginTop:10, fontSize:12}}>
            <span>ⓘ</span>
            <div>Lines 2, 3 have no receipt rows and will remain pending.</div>
          </div>

          {/* Force-close section — UX WH-004-PO Step 3 / FR-WH-008 / V-WH-GRN-008 */}
          <div className="card" style={{padding:0, marginTop:10, borderColor:"var(--amber)"}}>
            <div className="card-head" style={{padding:"8px 14px", background:"var(--amber-050a)"}}>
              <h3 className="card-title" style={{color:"var(--amber-800)"}}>Lines to force-close</h3>
              <span className="muted" style={{fontSize:11}}>Partially-received lines only. V-WH-GRN-008</span>
            </div>
            <div style={{padding:"10px 14px"}}>
              <div style={{fontSize:12, color:"var(--muted)", marginBottom:10}}>
                Check any partially-received PO line you want to permanently close. A force-closed line is set to <span className="mono">partial → force_closed</span> — no further receipts will be accepted against it.
              </div>
              {[
                { seq: 2, product: "Pieprz czarny mielony", ordered: 20, received: 0, uom: "kg" },
                { seq: 3, product: "Cebula drobna",         ordered: 220, received: 0, uom: "kg" },
              ].map(({ seq, product, ordered, received: rcv, uom }) => {
                const fc = forceClose[seq];
                return (
                  <div key={seq} style={{borderBottom:"1px solid var(--border)", paddingBottom:10, marginBottom:10}}>
                    <div className="row-flex" style={{marginBottom:6}}>
                      <label style={{fontSize:12, display:"flex", alignItems:"center", gap:6}}>
                        <input type="checkbox" checked={fc.checked} onChange={e=>updateFc(seq, "checked", e.target.checked)}/>
                        <b>Line {seq}</b> — {product} · {rcv}/{ordered} {uom} received
                        <span className="badge badge-amber" style={{fontSize:9}}>partial</span>
                      </label>
                    </div>
                    {fc.checked && (
                      <div style={{paddingLeft:22}}>
                        <div className="ff-inline" style={{marginBottom:0}}>
                          <Field label="Reason code" required help="V-WH-GRN-008 — reason is audit-logged">
                            <select value={fc.reasonCode} onChange={e=>updateFc(seq, "reasonCode", e.target.value)}>
                              <option value="">— Select —</option>
                              <option value="under_delivery">under_delivery</option>
                              <option value="supplier_discontinued">supplier_discontinued</option>
                              <option value="quality_reject">quality_reject</option>
                              <option value="other">other</option>
                            </select>
                          </Field>
                          <Field label="Reason text" help={fc.reasonCode === "other" ? "Required for 'other'" : "Optional"}>
                            <textarea rows={2} value={fc.reasonText} onChange={e=>updateFc(seq, "reasonText", e.target.value)} placeholder="Describe why this PO line is being force-closed…" style={{width:"100%", fontSize:12, resize:"vertical"}}/>
                          </Field>
                        </div>
                        {fc.checked && !fc.reasonCode && (
                          <div style={{fontSize:11, color:"var(--red-700)", marginTop:4}}>Reason code required to force-close this line.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Field label="Print options">
            <label style={{fontSize:12}}><input type="checkbox" defaultChecked/> Print labels after receipt ({totalLPs} labels → ZPL-WH-01)</label>
            <label style={{fontSize:12, display:"block", marginTop:4}}><input type="checkbox" defaultChecked/> Email notification to warehouse manager</label>
          </Field>
        </div>
      )}
    </Modal>
  );
};

// -------- M-02: GRN from TO (simple form) --------
const GRNFromTOModal = ({ open, onClose }) => {
  const [received, setReceived] = React.useState(new Set());
  const transitLps = [
    { lp: "LP-9120", product: "FA5100 · Kiełbasa śląska", qty: 120, uom: "kg", batch: "WO-2026-0102-B1", expiry: "2026-05-02", loc: "WH-Factory-A › Transit" },
    { lp: "LP-9121", product: "FA5100 · Kiełbasa śląska", qty: 80,  uom: "kg", batch: "WO-2026-0102-B1", expiry: "2026-05-02", loc: "WH-Factory-A › Transit" },
    { lp: "LP-9140", product: "FA5200 · Pasztet drobiowy", qty: 80, uom: "kg", batch: "WO-2026-0098-B1", expiry: "2026-06-14", loc: "WH-Factory-A › Transit" },
  ];
  const toggle = lp => { const n = new Set(received); if (n.has(lp)) n.delete(lp); else n.add(lp); setReceived(n); };

  return (
    <Modal open={open} onClose={onClose} title="Receive goods from Transfer Order" subtitle="LPs already exist — mark as received into destination location" size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={received.size === 0} onClick={onClose}>Complete receipt ({received.size}/{transitLps.length})</button>
      </>}>
      <div className="card" style={{padding:"10px 14px", marginBottom:10, background:"var(--gray-050)"}}>
        <div className="row-flex" style={{fontSize:12}}>
          <b className="mono">TO-2026-00015</b> · WH-Factory-B → WH-Factory-A · Shipped 2026-04-20 · <span className="badge badge-green" style={{fontSize:9}}>shipped</span>
          <span className="spacer"></span>
          <a style={{color:"var(--blue)", cursor:"pointer", fontSize:11}}>View TO →</a>
        </div>
      </div>
      <Field label="Scan LP barcode to mark as received"><input placeholder="Scan or type LP number…" autoFocus/></Field>
      <table>
        <thead><tr><th style={{width:30}}>✓</th><th>LP</th><th>Product</th><th style={{textAlign:"right"}}>Qty</th><th>Batch</th><th>Expiry</th><th>Current location</th><th>Destination</th></tr></thead>
        <tbody>
          {transitLps.map(lp => (
            <tr key={lp.lp} className={received.has(lp.lp) ? "" : ""} style={{background: received.has(lp.lp) ? "var(--green-050a)" : undefined, cursor:"pointer"}} onClick={()=>toggle(lp.lp)}>
              <td><input type="checkbox" checked={received.has(lp.lp)} onChange={()=>toggle(lp.lp)}/></td>
              <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{lp.lp}</td>
              <td style={{fontSize:11}}>{lp.product}</td>
              <td className="num mono" style={{fontVariantNumeric:"tabular-nums"}}>{lp.qty} {lp.uom}</td>
              <td className="mono" style={{fontSize:11}}>{lp.batch}</td>
              <td><ExpiryCell date={lp.expiry} days={14}/></td>
              <td className="mono" style={{fontSize:11}}>{lp.loc}</td>
              <td onClick={e=>e.stopPropagation()}>
                {received.has(lp.lp) && <select style={{fontSize:11, padding:"2px 6px"}}><option>Cold › B3</option><option>Dispatch › FG-01</option></select>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{marginTop:10, fontSize:12}}>
        <b>Received: {received.size} of {transitLps.length}</b>
        <span className="muted" style={{marginLeft:8}}>· LP-less transit not configured · Mark damaged LPs for stock adjustment after receipt</span>
      </div>
    </Modal>
  );
};

// -------- M-03: Stock Movement Create (simple form + partial-split notice + >10% approval gate) --------
const StockMoveModal = ({ open, onClose, data }) => {
  const [form, setForm] = React.useState({
    lp: data?.lp || "",
    moveType: data?.mode || "transfer",
    qty: data?.qty || 100,
    cw: null,
    dest: "WH-Factory-A › Cold › B3",
    reason: "",
    reasonText: "",
    refType: "",
    refId: "",
  });
  const lpQty = data?.qty || 180;
  const isPartial = +form.qty < lpQty;
  const deltaPct = Math.abs(+form.qty - lpQty) / lpQty * 100;
  const needsApproval = form.moveType === "adjustment" && deltaPct > 10;
  const reasonRequired = form.moveType === "adjustment" || form.moveType === "quarantine" || form.moveType === "return";
  const reasonValid = !reasonRequired || form.reason;

  return (
    <Modal open={open} onClose={onClose} title="New stock movement" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className={"btn btn-sm " + (needsApproval ? "btn-danger" : "btn-primary")} disabled={!form.lp || !reasonValid} onClick={onClose}>
          {needsApproval ? "Submit for approval" : "Confirm move"}
        </button>
      </>}>
      {!form.lp && <div className="alert-blue alert-box" style={{marginBottom:12, fontSize:12}}><span>ⓘ</span><div>Select or scan an LP to begin.</div></div>}

      <Field label="LP" required help="V-WH-MOV-001 — only available or reserved LPs accepted">
        <div className="row-flex">
          <input value={form.lp} onChange={e=>setForm({...form, lp: e.target.value})} placeholder="Scan or type LP number…" style={{flex:1}}/>
          <button className="btn btn-secondary btn-sm">🔲 Scan</button>
        </div>
      </Field>

      {form.lp && (
        <div className="card" style={{padding:"10px 14px", marginBottom:10, background:"var(--gray-050)"}}>
          <div className="row-flex" style={{fontSize:12}}>
            <b className="mono">{form.lp}</b> · R-1001 Wieprzowina kl. II · {lpQty} kg · Batch B-2026-04-10
            <span className="spacer"></span>
            <LPStatus s="available"/>
          </div>
          <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>Current location: <Ltree path={["WH-Factory-A","Cold","B3"]}/></div>
        </div>
      )}

      <div className="ff-inline">
        <Field label="Move type" required>
          <select value={form.moveType} onChange={e=>setForm({...form, moveType: e.target.value})}>
            <option value="transfer">Transfer</option>
            <option value="putaway">Putaway</option>
            <option value="adjustment">Adjustment</option>
            <option value="return">Return</option>
            <option value="quarantine">Quarantine</option>
          </select>
        </Field>
        <Field label="Quantity to move" required help={form.lp ? `LP holds ${lpQty} kg` : ""}>
          <input type="number" value={form.qty} onChange={e=>setForm({...form, qty: +e.target.value})} className="num"/>
        </Field>
      </div>

      <Field label={form.moveType === "adjustment" ? "Destination (not applicable)" : "Destination location"} required={form.moveType !== "adjustment"}>
        <select value={form.dest} onChange={e=>setForm({...form, dest: e.target.value})} disabled={form.moveType === "adjustment"}>
          <option>WH-Factory-A › Cold › B3</option>
          <option>WH-Factory-A › Cold › B2</option>
          <option>WH-Factory-A › Dry › A2</option>
          <option>WH-Factory-A › Production › Line-1-Buffer</option>
          <option>WH-Factory-A › QA-Hold › Q-01</option>
        </select>
      </Field>

      {reasonRequired && (
        <>
          <Field label="Reason code" required>
            <select value={form.reason} onChange={e=>setForm({...form, reason: e.target.value})}>
              <option value="">— Select —</option>
              {form.moveType === "adjustment" && <>
                <option>damage</option><option>theft</option><option>counting_error</option><option>quality_issue</option><option>expired</option><option>other</option>
              </>}
              {form.moveType === "quarantine" && <>
                <option>qa_fail</option><option>contamination_risk</option><option>other</option>
              </>}
              {form.moveType === "return" && <>
                <option>production_return</option><option>shipment_return</option><option>other</option>
              </>}
            </select>
          </Field>
          {form.reason === "other" && (
            <Field label="Reason text" required help="V-WH-MOV-005 — min 10 chars">
              <ReasonInput value={form.reasonText} onChange={v=>setForm({...form, reasonText: v})} minLength={10} placeholder="Describe the reason in detail..."/>
            </Field>
          )}
        </>
      )}

      {isPartial && (form.moveType === "transfer" || form.moveType === "putaway") && (
        <div className="alert-blue alert-box" style={{fontSize:12}}>
          <span>ⓘ</span>
          <div>Entering a partial quantity will automatically split this LP. A new child LP will be created for the moved quantity. Original LP will retain <b>{lpQty - +form.qty} kg</b>.</div>
        </div>
      )}

      {needsApproval && (
        <div className="alert-amber alert-box" style={{fontSize:12}}>
          <span>⚠</span>
          <div><b>Δ {deltaPct.toFixed(1)}% exceeds 10% threshold — V-WH-MOV-004.</b><div style={{fontSize:11}}>This adjustment requires manager approval before taking effect.</div></div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-04: LP Split (sum-validator) --------
const LPSplitModal = ({ open, onClose, data }) => {
  const lp = data || { lp: "LP00000050", qty: 200, uom: "BOX", product: "R-1001 · Wieprzowina kl. II", batch: "B-2026-04-10", expiry: "2026-05-02", loc: ["WH-Factory-A","Cold","B3"] };
  const [rows, setRows] = React.useState([
    { qty: 60,  dest: "WH-Factory-A › Cold › B3", label: true },
    { qty: 140, dest: "WH-Factory-A › Production › Line-1-Buffer", label: true },
  ]);
  const sum = rows.reduce((a, r) => a + (+r.qty || 0), 0);
  const valid = sum === lp.qty;

  return (
    <Modal open={open} onClose={onClose} title={`Split License Plate — ${lp.lp}`} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid || rows.length < 2} onClick={onClose}>Confirm split ({rows.length} LPs)</button>
      </>}>
      <div className="card" style={{padding:"10px 14px", marginBottom:10, background:"var(--gray-050)"}}>
        <div style={{fontSize:12}}>
          <b className="mono" style={{fontSize:13}}>{lp.lp}</b> · {lp.product}<br/>
          Batch <span className="mono">{lp.batch}</span> · Expiry {lp.expiry} · <Ltree path={lp.loc}/>
        </div>
        <div style={{fontSize:18, fontWeight:700, marginTop:6, color:"var(--blue)"}}><span className="mono">{lp.qty} {lp.uom}</span> available to split</div>
      </div>

      <table>
        <thead><tr><th style={{width:40}}>#</th><th>Qty</th><th>UoM</th><th>Destination location</th><th>Label</th><th></th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="mono" style={{color:"var(--muted)"}}>{i+1}</td>
              <td><input type="number" value={r.qty} onChange={e=>setRows(rows.map((x,j)=>j===i?{...x, qty: +e.target.value}:x))} className="num" style={{width:90, fontVariantNumeric:"tabular-nums"}}/></td>
              <td className="mono">{lp.uom}</td>
              <td><select value={r.dest} onChange={e=>setRows(rows.map((x,j)=>j===i?{...x, dest: e.target.value}:x))}><option>WH-Factory-A › Cold › B3</option><option>WH-Factory-A › Cold › B2</option><option>WH-Factory-A › Production › Line-1-Buffer</option></select></td>
              <td><label style={{fontSize:11}}><input type="checkbox" checked={r.label} onChange={e=>setRows(rows.map((x,j)=>j===i?{...x, label: e.target.checked}:x))}/> Print</label></td>
              <td>{rows.length > 2 && <button className="btn btn-ghost btn-sm" onClick={()=>setRows(rows.filter((_,j)=>j!==i))}>🗑</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row-flex" style={{marginTop:8}}>
        <button className="btn btn-secondary btn-sm" onClick={()=>setRows([...rows, { qty: 0, dest: lp.loc.join(" › "), label: true }])}>＋ Add output LP</button>
      </div>

      <div className={"alert-box " + (valid ? "alert-green" : sum > lp.qty ? "alert-red" : "alert-amber")} style={{marginTop:12, fontSize:12}}>
        <span>{valid ? "✓" : "⚠"}</span>
        <div>
          <b>Allocated: <span className="mono">{sum}</span> / <span className="mono">{lp.qty}</span> {lp.uom}</b>
          {sum < lp.qty && <div style={{fontSize:11, color:"var(--amber-700)"}}>Remaining unallocated: {lp.qty - sum} {lp.uom}. All source qty must be allocated (V-WH-LP-003).</div>}
          {sum > lp.qty && <div style={{fontSize:11, color:"var(--red-700)"}}>Exceeds source quantity by {sum - lp.qty} {lp.uom}.</div>}
          {valid && <div style={{fontSize:11, color:"var(--green-700)"}}>Ready to split.</div>}
        </div>
      </div>

      <div style={{fontSize:11, color:"var(--muted)", marginTop:10, lineHeight:1.5}}>
        All output LPs inherit <b>batch</b>, <b>expiry</b>, <b>QA status</b>, and <b>GTIN</b> from the source LP. Catch weight is prorated proportionally. A genealogy record (<span className="mono">operation: split</span>) will be created linking source → all outputs.
      </div>
    </Modal>
  );
};

// -------- M-05: LP Merge (2-step wizard) --------
const LPMergeModal = ({ open, onClose }) => {
  const [step, setStep] = React.useState("primary");
  const [primary, setPrimary] = React.useState("");
  const [secondaries, setSecondaries] = React.useState([
    { lp: "LP00000045", valid: true,  qty: 40 },
    { lp: "LP00000046", valid: true,  qty: 60 },
  ]);
  const primaryQty = 80;
  const totalAfter = primaryQty + secondaries.filter(s => s.valid).reduce((a,s)=>a+s.qty,0);
  const validSecondaries = secondaries.filter(s => s.valid).length;
  const canConfirm = validSecondaries > 0;

  return (
    <Modal open={open} onClose={onClose} title="Merge License Plates" size="wide"
      foot={step === "primary" ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!primary} onClick={()=>setStep("secondary")}>Next: add LPs to merge →</button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={()=>setStep("primary")}>← Back</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!canConfirm} onClick={onClose}>Confirm merge ({validSecondaries} LPs)</button>
      </>}>
      <Stepper steps={[{key:"primary", label:"Select primary"}, {key:"secondary", label:"Add LPs to merge"}]} current={step} completed={new Set(step === "secondary" ? ["primary"] : [])}/>

      {step === "primary" && (
        <div style={{marginTop:14}}>
          <Field label="Primary LP (will survive after merge)" required help="V-WH-LP-005 — primary must be available status">
            <div className="row-flex"><input value={primary} onChange={e=>setPrimary(e.target.value)} placeholder="Scan or type LP#" style={{flex:1}}/><button className="btn btn-secondary btn-sm">🔲 Scan</button></div>
          </Field>
          {primary && (
            <div className="card" style={{padding:"10px 14px", background:"var(--green-050a)", borderColor:"var(--green)"}}>
              <div style={{fontSize:12}}><b className="mono">{primary}</b> · R-1501 Mąka pszenna typ 500 · <b>80 BOX</b> · B-2026-04-10 · <LPStatus s="available"/></div>
              <div style={{fontSize:11, color:"var(--green-700)", marginTop:4}}>✓ Validation passed — LP is available and eligible as merge primary.</div>
            </div>
          )}
        </div>
      )}

      {step === "secondary" && (
        <div style={{marginTop:14}}>
          <Field label="Scan or search LPs to merge into primary"><div className="row-flex"><input placeholder="Scan or type LP#…" style={{flex:1}}/><button className="btn btn-secondary btn-sm">🔲 Scan</button></div></Field>
          <div style={{fontSize:11, color:"var(--muted)", marginBottom:8, lineHeight:1.5}}>
            Validations per scan (V-WH-LP-004): same product, UoM, warehouse · same batch &amp; expiry within ±1 day · same QA status · status=available (not reserved).
          </div>
          <table>
            <thead><tr><th>LP</th><th style={{textAlign:"right"}}>Qty</th><th>Batch</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {secondaries.map((s, i) => (
                <tr key={s.lp} style={{background: s.valid ? "var(--green-050a)" : "var(--red-050a)"}}>
                  <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{s.lp}</td>
                  <td className="num mono" style={{fontVariantNumeric:"tabular-nums"}}>{s.qty} BOX</td>
                  <td className="mono" style={{fontSize:11}}>B-2026-04-10</td>
                  <td>{s.valid ? <span className="badge badge-green" style={{fontSize:9}}>✓ Valid</span> : <span className="badge badge-red" style={{fontSize:9}}>✕ Rejected</span>}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={()=>setSecondaries(secondaries.filter((_,j)=>j!==i))}>🗑</button></td>
                </tr>
              ))}
              <tr style={{background: "var(--red-050a)"}}>
                <td className="mono" style={{fontWeight:600}}>LP00000030</td>
                <td colSpan={3} style={{fontSize:11, color:"var(--red-700)"}}>✕ Rejected — different batch number (B-2026-03-01 vs B-2026-04-10). Batch must match to merge.</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <Summary rows={[
            { label: "Primary LP qty", value: primaryQty + " BOX" },
            { label: "Additional from " + validSecondaries + " LP(s)", value: secondaries.filter(s=>s.valid).map(s=>s.qty).join(" + ") + " BOX" },
            { label: "Total after merge", value: totalAfter + " BOX", emphasis: true },
          ]}/>

          <div style={{fontSize:11, color:"var(--muted)", marginTop:10, lineHeight:1.5}}>
            Secondary LPs will be set to status <span className="mono">merged</span>. A genealogy record (<span className="mono">operation: merge</span>) will be created for each secondary LP linking to the primary.
          </div>

          <div className="alert-amber alert-box" style={{marginTop:12, fontSize:12}}>
            <span>⚠</span>
            <div>
              <b>Irreversible action — audit-logged.</b> Secondary LPs cannot be un-merged after confirmation.
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-06: QA Status Change (dual-path) --------
const QAStatusModal = ({ open, onClose, data }) => {
  const lp = data || { lp: "LP-4431", qa: "PASSED" };
  const [target, setTarget] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const reasonTextRequired = reason === "other";
  const valid = target && reason && (!reasonTextRequired || reasonText.length >= 10);

  const transitions = { PASSED: ["HOLD"], HOLD: ["RELEASED","FAILED","QUARANTINED"], PENDING: ["PASSED","FAILED","HOLD"], FAILED: ["QUARANTINED","HOLD"], RELEASED: ["HOLD"], QUARANTINED: ["RELEASED","COND_APPROVED"], COND_APPROVED: ["HOLD","RELEASED"] };
  const options = transitions[lp.qa] || [];

  const primaryCls = target === "FAILED" ? "btn-danger" : target === "RELEASED" || target === "PASSED" ? "btn-primary" : "btn-primary";

  return (
    <Modal open={open} onClose={onClose} title={`Change QA status — ${lp.lp}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className={"btn btn-sm " + primaryCls} disabled={!valid} onClick={onClose}>Change status</button>
      </>}>
      <div style={{textAlign:"center", padding:"12px 0"}}>
        <div style={{fontSize:11, color:"var(--muted)", marginBottom:4}}>Current status</div>
        <QAStatus s={lp.qa}/>
        <div style={{fontSize:20, color:"var(--muted)", margin:"6px 0"}}>↓</div>
        <div style={{fontSize:11, color:"var(--muted)", marginBottom:4}}>Transition to</div>
      </div>

      <Field label="New QA status" required>
        <select value={target} onChange={e=>setTarget(e.target.value)}>
          <option value="">— Select —</option>
          {options.map(o => <option key={o} value={o}>{lp.qa} → {o}</option>)}
        </select>
      </Field>

      {target && (
        <Field label="Reason code" required>
          <select value={reason} onChange={e=>setReason(e.target.value)}>
            <option value="">— Select reason —</option>
            {target === "FAILED" && <>
              <option>contamination</option><option>foreign_body</option><option>out_of_spec</option><option>microbiological_failure</option><option>allergen_cross_contact</option><option>other</option>
            </>}
            {target === "HOLD" && <>
              <option>pending_lab_results</option><option>pending_paperwork</option><option>supplier_query</option><option>customer_complaint</option><option>other</option>
            </>}
            {target === "RELEASED" && <>
              <option>lab_cleared</option><option>visual_inspection_passed</option><option>documentation_complete</option><option>other</option>
            </>}
            {target === "QUARANTINED" && <>
              <option>immediate_safety_risk</option><option>regulatory_recall</option><option>other</option>
            </>}
            {target === "PASSED" && <><option>standard_release</option><option>other</option></>}
            {target === "COND_APPROVED" && <><option>conditional_lab_pass</option><option>other</option></>}
          </select>
        </Field>
      )}

      {reasonTextRequired && (
        <Field label="Reason text" required help="min 10 characters — logged to quality_status_history">
          <ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Explain reason..."/>
        </Field>
      )}

      {target === "COND_APPROVED" && (
        <div className="alert-amber alert-box" style={{fontSize:12}}>
          <span>⚠</span>
          <div><b>Conditionally Approved:</b> pick and consume allowed, but shipping to customers is blocked until full release.</div>
        </div>
      )}
      {target === "QUARANTINED" && (
        <div className="alert-blue alert-box" style={{fontSize:12}}>
          <span>ⓘ</span>
          <div>Consider moving this LP to a designated quarantine location. System will <b>NOT</b> move it automatically — use a separate stock movement to the quarantine zone after this status change.</div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-07: Label Print (preview + options) --------
const LabelPrintModal = ({ open, onClose, data }) => {
  const lp = data || WH_LP_DETAIL;
  const [template, setTemplate] = React.useState("std");
  const [printer, setPrinter] = React.useState("ZPL-WH-01");
  const [copies, setCopies] = React.useState(1);
  const [queue, setQueue] = React.useState(false);
  const sel = WH_PRINTERS.find(p => p.id === printer);
  const isExpired = lp.expiryDays < 0 && lp.shelfLifeMode === "use_by";

  return (
    <Modal open={open} onClose={onClose} title={`Print label — ${lp.lp}`} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!sel?.online && !queue} onClick={onClose}>{queue ? "Add to queue" : "Print"}</button>
      </>}>
      <div style={{display:"grid", gridTemplateColumns:"1fr 220px", gap:14}}>
        <div className="label-preview">
          <div className="lp-qr"></div>
          <div style={{fontFamily:"var(--font-mono)", fontSize:12, fontWeight:700}}>{lp.lp}</div>
          <div className="lp-barcode"></div>
          <div style={{fontSize:10, textAlign:"center", fontFamily:"var(--font-mono)"}}>▏▎▌▎▏▏▌▎▍▎▏▏</div>
          <div className="lp-field">
            <b>Product</b><span>{lp.product?.code || lp.product} — {lp.product?.name || lp.productName}</span>
            <b>Qty</b><span>{lp.qty} {lp.uom}</span>
            <b>Batch</b><span>{lp.batch}</span>
            <b>Expiry</b><span className={lp.expiryDays <= 7 ? "exp-red" : ""}>{lp.expiry} ({lp.shelfLifeMode || "use_by"})</span>
            <b>Location</b><span>{(lp.loc || ["WH","...","..."]).join(" › ")}</span>
            <b>Date code</b><span>{lp.dateCode || "—"}</span>
            <b>GTIN</b><span>{lp.gtin || "—"}</span>
          </div>
          {isExpired && <div className="lp-stamp">BLOCKED — DO NOT SHIP</div>}
        </div>
        <div>
          <Field label="Template">
            <select value={template} onChange={e=>setTemplate(e.target.value)}>
              <option value="std">Standard 4×6</option>
              <option value="mini">Mini 2×2</option>
              <option value="pallet" disabled>Pallet (P2 — disabled)</option>
            </select>
          </Field>
          <Field label="Printer" required help="V-WH-LABEL-003">
            <select value={printer} onChange={e=>setPrinter(e.target.value)}>
              {WH_PRINTERS.map(p => <option key={p.id} value={p.id} disabled={!p.online}>{p.id} · {p.name} · {p.online ? "● Online" : "● Offline"}</option>)}
            </select>
            {sel && <div style={{fontSize:11, marginTop:4, color: sel.online ? "var(--green-700)" : "var(--red-700)"}}>{sel.online ? "✓ Ready" : "⚠ Offline — use queue"}</div>}
          </Field>
          <Field label="Copies" required help="V-WH-LABEL-004">
            <input type="number" min="1" max="10" value={copies} onChange={e=>setCopies(+e.target.value)}/>
          </Field>
          <Field label="Options">
            <label style={{fontSize:11}}><input type="checkbox" checked={queue} onChange={e=>setQueue(e.target.checked)}/> Add to print queue (background)</label>
          </Field>
          {!sel?.online && !queue && (
            <div className="alert-red alert-box" style={{fontSize:11}}><span>⚠</span><div>Printer offline. Enable queue or choose another printer.</div></div>
          )}
        </div>
      </div>

      <div style={{marginTop:14}}>
        <div className="label">Reprint history</div>
        <table style={{marginTop:4}}>
          <thead><tr><th>Date</th><th>Template</th><th>Printer</th><th>Copies</th><th>By</th><th>Status</th></tr></thead>
          <tbody>
            {(lp.labels || []).slice(0, 3).map((l, i) => (
              <tr key={i}>
                <td className="mono" style={{fontSize:11}}>{l.t}</td>
                <td>{l.template}</td>
                <td className="mono" style={{fontSize:11}}>{l.printer}</td>
                <td className="num mono">{l.copies}</td>
                <td style={{fontSize:11}}>{l.user}</td>
                <td><span className="badge badge-green" style={{fontSize:9}}>✓</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

// -------- M-08: Reserve hard-lock --------
const ReserveModal = ({ open, onClose, data }) => {
  const wo = data?.wo || { id: "WO-2026-0108", product: "FA5100 · Kiełbasa śląska", status: "released", required: { code: "R-1001", name: "Wieprzowina kl. II", qty: 400, uom: "kg" } };
  const [lp, setLp] = React.useState("LP-4431");
  const [qty, setQty] = React.useState(220.5);
  const lpAvail = 220.5;
  const lpExp = "2026-05-02";
  const woEnd = "2026-04-21 18:00";
  const expBefore = lpExp < "2026-04-22";
  const conflict = false;
  const isIntermediate = false;

  return (
    <Modal open={open} onClose={onClose} title="Reserve LP for Work Order" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={conflict || isIntermediate} onClick={onClose}>Confirm reservation</button>
      </>}>
      <div className="card" style={{padding:"10px 14px", marginBottom:10, background:"var(--gray-050)"}}>
        <div style={{fontSize:12}}><b className="mono">{wo.id}</b> — {wo.product} · <span className="badge badge-violet" style={{fontSize:9}}>released</span></div>
        <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>Material line: {wo.required.code} · {wo.required.qty} {wo.required.uom} required</div>
      </div>

      <Field label="LP" required>
        <div className="row-flex"><input value={lp} onChange={e=>setLp(e.target.value)} style={{flex:1}}/><button className="btn btn-secondary btn-sm">Pick LP…</button></div>
      </Field>

      {lp && (
        <div className="card" style={{padding:"10px 14px", marginBottom:10}}>
          <div style={{fontSize:12}}><b className="mono">{lp}</b> · R-1001 Wieprzowina kl. II · <b>{lpAvail} kg</b> · B-2026-04-02 · Exp {lpExp}</div>
          <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}><Ltree path={["WH-Factory-A","Cold","B3"]}/></div>
        </div>
      )}

      <Field label="Reservation qty" required help={`Reserving ${qty} of ${lpAvail} available. Remaining after: ${(lpAvail - qty).toFixed(1)} kg`}>
        <input type="number" value={qty} onChange={e=>setQty(+e.target.value)} className="num"/>
      </Field>

      {expBefore && (
        <div className="alert-amber alert-box" style={{fontSize:12}}>
          <span>⚠</span>
          <div><b>Expiry ({lpExp}) is before planned WO end ({woEnd}).</b> Confirm this is acceptable.</div>
        </div>
      )}
      {conflict && (
        <div className="alert-red alert-box" style={{fontSize:12}}>
          <span>⚠</span>
          <div>This LP is already reserved for WO-2026-0109 (80 kg). Release existing reservation or choose different LP. <span className="mono">V-WH-FEFO-003</span></div>
        </div>
      )}
      {isIntermediate && (
        <div className="alert-red alert-box" style={{fontSize:12}}>
          <span>⚠</span>
          <div>Reservations are only available for raw material LPs (<span className="mono">material_source=stock</span>). Intermediate LPs are consumed via scanner scan-to-WO without pre-reservation. <span className="mono">V-WH-FEFO-005</span></div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-09: Release reservation (destructive with reason) --------
const ReleaseReservationModal = ({ open, onClose, data }) => {
  const r = data || { lp: "LP-4431", wo: "WO-2026-0108", qty: 220.5, reservedAt: "2026-04-21 05:58" };
  const [reason, setReason] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const textRequired = reason === "admin_override";
  const valid = reason && (!textRequired || reasonText.length >= 10);

  return (
    <Modal open={open} onClose={onClose} title="Release reservation" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Confirm release</button>
      </>}>
      <Summary rows={[
        { label: "LP", value: r.lp, mono: true },
        { label: "WO", value: r.wo, mono: true },
        { label: "Qty", value: r.qty + " kg", emphasis: true },
        { label: "Reserved at", value: r.reservedAt },
      ]}/>
      <div style={{fontSize:12, margin:"10px 0"}}>
        You are about to release the hard-lock reservation. The LP will return to <b>available</b> status and can be picked by other work orders.
      </div>
      <Field label="Release reason" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select reason —</option>
          <option value="consumed">consumed</option>
          <option value="cancelled">cancelled</option>
          <option value="wo_cancelled">wo_cancelled</option>
          <option value="admin_override">admin_override</option>
        </select>
      </Field>
      {textRequired && (
        <>
          <Field label="Reason text" required>
            <ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Explain admin override..."/>
          </Field>
          <div className="alert-amber alert-box" style={{fontSize:12}}>
            <span>⚠</span>
            <div><b>Admin override release is a high-visibility audit event.</b> This action is logged and will appear in compliance reports.</div>
          </div>
        </>
      )}
    </Modal>
  );
};

// -------- M-10: FEFO deviation confirm (warning, not block) --------
const FEFODeviationModal = ({ open, onClose }) => {
  const [reason, setReason] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const textRequired = reason === "other";
  const valid = reason && (!textRequired || reasonText.length >= 10);

  return (
    <Modal open={open} onClose={onClose} title="FEFO deviation — confirm pick" size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel — use FEFO suggestion</button>
        <button className="btn btn-sm" disabled={!valid} style={{background:"#f59e0b", color:"#fff", border:0}} onClick={onClose}>Confirm deviation</button>
      </>}>
      <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:12}}>
        <span>⚠</span>
        <div>You selected <b className="mono">LP-7400</b> but FEFO suggests <b className="mono">LP00000044</b>.</div>
      </div>

      <div className="fefo-compare">
        <div className="fc-card suggested">
          <div className="fc-head">Suggested by FEFO (rank #1)</div>
          <div className="fc-lp">LP00000044</div>
          <div className="fc-row">Batch <b className="mono">B-2026-04-10</b></div>
          <div className="fc-row">Expiry <b>2026-04-23</b> <span className="muted">(earliest)</span></div>
          <div className="fc-row">Location: <Ltree path={["WH-Factory-A","Dry","A2"]}/></div>
          <div className="fc-row">Qty: <b className="mono">180 kg</b></div>
        </div>
        <div className="fc-card selected">
          <div className="fc-head">Your selection</div>
          <div className="fc-lp">LP-7400</div>
          <div className="fc-row">Batch <b className="mono">B-2026-05-10</b></div>
          <div className="fc-row">Expiry <b>2026-09-15</b> <span className="muted">(+145 days later)</span></div>
          <div className="fc-row">Location: <Ltree path={["WH-Factory-A","Dry","A2"]}/></div>
          <div className="fc-row">Qty: <b className="mono">240 kg</b></div>
        </div>
      </div>
      <div style={{fontSize:12, marginBottom:10}}>Expiry difference: <b>+145 days</b> later than the FEFO-suggested LP.</div>

      <Field label="Reason code" required help="V-WH-FEFO-002">
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select —</option>
          <option value="batch_exhaustion">batch_exhaustion — FEFO LP does not have sufficient quantity</option>
          <option value="qa_release">qa_release — FEFO LP awaiting QA clearance</option>
          <option value="physical_accessibility">physical_accessibility — FEFO LP physically inaccessible</option>
          <option value="line_priority">line_priority — Operational priority on this line</option>
          <option value="operator_decision">operator_decision — Operator judgment</option>
          <option value="other">other — Requires text explanation</option>
        </select>
      </Field>
      {textRequired && (
        <Field label="Reason text" required>
          <ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Explain the FEFO deviation..."/>
        </Field>
      )}
      <div style={{fontSize:11, color:"var(--muted)", lineHeight:1.5}}>
        This deviation will be recorded in the FEFO override audit log. The override rate metric is monitored by your warehouse manager.
      </div>
    </Modal>
  );
};

// -------- M-11: Destroy / scrap LP (destructive with reason + confirm) --------
const DestroyLPModal = ({ open, onClose, data }) => {
  const lp = data || { lp: "LP00000045", qty: 24, uom: "kg", product: "R-1004 Masło", batch: "B-2026-03-20" };
  const [reason, setReason] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const [qtyToScrap, setQtyToScrap] = React.useState(lp.qty);
  const [refDoc, setRefDoc] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const valid = reason && reasonText.length >= 10 && confirmed;

  return (
    <Modal open={open} onClose={onClose} title={`Destroy / scrap — ${lp.lp}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Confirm scrap</button>
      </>}>
      <div className="alert-red alert-box" style={{fontSize:12, marginBottom:12}}>
        <span>⚠</span>
        <div>
          <b>Irreversible action.</b> {lp.qty} {lp.uom} will be permanently removed from inventory. A permanent audit record will be created.
        </div>
      </div>
      <Summary rows={[
        { label: "LP", value: lp.lp, mono: true },
        { label: "Product", value: lp.product, mono: false },
        { label: "Current qty", value: lp.qty + " " + lp.uom },
        { label: "Batch", value: lp.batch },
      ]}/>
      <div className="ff-inline">
        <Field label="Qty to scrap" required help={qtyToScrap < lp.qty ? "Partial scrap — LP will be split first" : ""}>
          <input type="number" value={qtyToScrap} onChange={e=>setQtyToScrap(+e.target.value)} className="num" max={lp.qty}/>
        </Field>
        <Field label="Reference doc (optional)"><input value={refDoc} onChange={e=>setRefDoc(e.target.value)} placeholder="e.g. QA report #QA-2026-0042"/></Field>
      </div>
      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select —</option>
          <option>damage</option><option>expired</option><option>quality_fail</option><option>contamination</option><option>other</option>
        </select>
      </Field>
      <Field label="Reason text" required help="min 10 characters">
        <ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Describe the scrap reason..."/>
      </Field>
      <div style={{fontSize:12}}>
        <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm this will be permanent and will be fully audit-logged.</label>
      </div>
    </Modal>
  );
};

// -------- M-12: Use_by block override (manager-only) --------
const UseByOverrideModal = ({ open, onClose, data, isManager = true }) => {
  const lp = data || { lp: "LP00000007", expiry: "2026-04-15" };
  const [reason, setReason] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const [ack, setAck] = React.useState(false);
  const valid = reason && reasonText.length >= 10 && ack;

  return (
    <Modal open={open} onClose={onClose} title="Expired LP — manager override required" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        {isManager && <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Override and proceed</button>}
      </>}>
      <div className="alert-red alert-box" style={{fontSize:12, marginBottom:14}}>
        <span>⚠</span>
        <div>
          <b className="mono">{lp.lp}</b> has passed its use-by date (<b>{lp.expiry}</b>). All operations are blocked to comply with <span className="mono">EU 1169/2011</span> food safety requirements.
        </div>
      </div>
      {!isManager && (
        <div style={{fontSize:13}}>This operation requires manager approval. Contact your warehouse manager.</div>
      )}
      {isManager && (
        <>
          <div style={{fontSize:12, marginBottom:10}}>You may override this block for specific operational reasons. This action is fully audited and will be included in compliance reports.</div>
          <Field label="Override reason" required>
            <select value={reason} onChange={e=>setReason(e.target.value)}>
              <option value="">— Select —</option>
              <option>operational_requirement</option><option>awaiting_disposal</option><option>controlled_use_under_qa</option><option>regulatory_exemption</option><option>other</option>
            </select>
          </Field>
          <Field label="Reason text" required help="min 10 characters">
            <ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Document the override rationale for compliance review..."/>
          </Field>
          <div style={{fontSize:12, padding:"10px 12px", background:"var(--red-050a)", borderRadius:4, marginTop:10}}>
            <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I understand this action overrides food safety controls and accept responsibility for the audit record.</label>
          </div>
        </>
      )}
    </Modal>
  );
};

// -------- M-13: Location create / edit --------
const LocationEditModal = ({ open, onClose, data }) => {
  const editing = !!data;
  const [form, setForm] = React.useState({ code: data?.code || "", name: data?.name || "", parent: data?.parent || "WH-Factory-A.Cold", type: data?.type || "storage", active: true, barcode: "" });
  const depthExceeded = form.parent.split(".").length >= 3;
  const valid = form.code && form.name && !depthExceeded;

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit location" : "Add location"} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>{editing ? "Save changes" : "Create location"}</button>
      </>}>
      <Field label="Code" required help="Alphanumeric + hyphen, max 20 chars, unique within warehouse">
        <input value={form.code} onChange={e=>setForm({...form, code: e.target.value.toUpperCase()})} maxLength={20} placeholder="Bin-C5" className="mono"/>
      </Field>
      <Field label="Name" required><input value={form.name} onChange={e=>setForm({...form, name: e.target.value})} maxLength={80} placeholder="Cold Storage Bin C5"/></Field>
      <div className="ff-inline">
        <Field label="Parent location" required help={depthExceeded ? "Max depth 3 reached" : ""} error={depthExceeded ? "Maximum location depth for this tenant is 3 levels (warehouse → zone → bin). Contact your administrator to increase the limit in Settings → Warehouse Settings." : null}>
          <select value={form.parent} onChange={e=>setForm({...form, parent: e.target.value})}>
            <option value="WH-Factory-A">WH-Factory-A</option>
            <option value="WH-Factory-A.Cold">WH-Factory-A › Cold</option>
            <option value="WH-Factory-A.Dry">WH-Factory-A › Dry</option>
            <option value="WH-Factory-A.Production">WH-Factory-A › Production</option>
            <option value="WH-Factory-A.Receiving">WH-Factory-A › Receiving</option>
          </select>
        </Field>
        <Field label="Type" required>
          <select value={form.type} onChange={e=>setForm({...form, type: e.target.value})}>
            <option>storage</option><option>transit</option><option>receiving</option><option>production_line</option>
          </select>
        </Field>
      </div>
      <Field label="Is active"><label><input type="checkbox" checked={form.active} onChange={e=>setForm({...form, active: e.target.checked})}/> Active</label></Field>
      <Field label="Barcode (optional)" help="Auto-generated if blank — for location QR / Code128 printing">
        <input value={form.barcode} onChange={e=>setForm({...form, barcode: e.target.value})} className="mono"/>
      </Field>
    </Modal>
  );
};

// -------- M-14: Cycle count / quick adjustment (P1 stub) --------
const CycleCountModal = ({ open, onClose, data }) => {
  const lp = data || { lp: "LP00000048", product: "R-1601 Jaja żółtka", qty: 60, uom: "kg" };
  const [actual, setActual] = React.useState(lp.qty);
  const [reason, setReason] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const delta = actual - lp.qty;
  const deltaPct = Math.abs(delta) / lp.qty * 100;
  const needsApproval = deltaPct > 10;
  const textReq = reason === "other";
  const valid = reason && (!textReq || reasonText.length >= 10);

  return (
    <Modal open={open} onClose={onClose} title="Quick stock adjustment (cycle count)" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className={"btn btn-sm " + (needsApproval ? "btn-danger" : "btn-primary")} disabled={!valid} onClick={onClose}>
          {needsApproval ? "Submit for approval" : "Record adjustment"}
        </button>
      </>}>
      <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:12}}>
        <span>ⓘ</span>
        <div>Full cycle count workflow is available in Phase 2. This is a basic quantity adjustment with mandatory reason.</div>
      </div>

      <div className="ff-inline">
        <Field label="LP (read-only)"><input value={lp.lp} readOnly className="mono" style={{background:"var(--gray-100)"}}/></Field>
        <Field label="Current qty (system)"><input value={lp.qty + " " + lp.uom} readOnly style={{background:"var(--gray-100)"}}/></Field>
      </div>
      <Field label="Actual qty (counted)" required>
        <input type="number" value={actual} onChange={e=>setActual(+e.target.value)} className="num"/>
      </Field>
      <Field label="Delta">
        <div className={"cc-delta " + (delta > 0 ? "pos" : delta < 0 ? "neg" : "zero")}>{delta > 0 ? "+" : ""}{delta.toFixed(1)} {lp.uom} ({deltaPct.toFixed(1)}%)</div>
      </Field>
      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select —</option>
          <option>counting_error</option><option>damage</option><option>other</option>
        </select>
      </Field>
      {textReq && (
        <Field label="Reason text" required>
          <ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Explain..."/>
        </Field>
      )}
      {needsApproval && (
        <div className="alert-amber alert-box" style={{fontSize:12}}>
          <span>⚠</span><div>This adjustment exceeds 10% and requires manager approval. (V-WH-MOV-004)</div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-15: State transition confirm (block/unblock) --------
const StateTransitionModal = ({ open, onClose, data }) => {
  const d = data || { lp: "LP00000045", from: "available", to: "blocked" };
  const [reason, setReason] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const textRequired = reason === "other";
  const valid = reason && (!textRequired || reasonText.length >= 10);
  const isDestructive = d.to === "blocked" || d.to === "consumed";

  return (
    <Modal open={open} onClose={onClose} title="Confirm status change" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className={"btn btn-sm " + (isDestructive ? "btn-danger" : "btn-primary")} disabled={!valid} onClick={onClose}>Confirm</button>
      </>}>
      <div style={{fontSize:13, marginBottom:12}}>
        Change <b className="mono">{d.lp}</b> status from <LPStatus s={d.from}/> to <LPStatus s={d.to}/>?
      </div>
      {d.to === "blocked" && <div className="alert-amber alert-box" style={{fontSize:12}}><span>⚠</span><div>Blocking this LP will prevent all picking and movement operations until unblocked.</div></div>}
      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select —</option>
          {d.to === "blocked" && <><option>damage</option><option>quality_concern</option><option>expiry_manual</option><option>other</option></>}
          {d.to === "available" && <><option>unblock_cleared</option><option>admin_override</option><option>other</option></>}
        </select>
      </Field>
      {textRequired && (
        <Field label="Reason text" required>
          <ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Describe..."/>
        </Field>
      )}
    </Modal>
  );
};

// -------- Force unlock scanner lock (dashboard alert CTA) --------
const ForceUnlockModal = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Force release scanner lock" size="sm"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-danger btn-sm" onClick={onClose}>Force release</button>
    </>}>
    <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:12}}>
      <span>⚠</span>
      <div>LP00000182 is locked by <b>K.Kowal</b> (7 minutes). Admin-level force release will invalidate the active scanner session.</div>
    </div>
    <Summary rows={[
      { label: "LP", value: "LP00000182", mono: true },
      { label: "Locked by", value: "K.Kowal", mono: false },
      { label: "Duration", value: "7 min · exceeds 5 min threshold" },
      { label: "Last location", value: "WH-Factory-A › Cold › B3" },
    ]}/>
    <div style={{fontSize:11, color:"var(--muted)"}}>This action is audit-logged.</div>
  </Modal>
);

// ============ MODAL GALLERY ============
const MODAL_CATALOG = [
  { key: "grnPO",              name: "M-01 · GRN from PO (multi-LP wizard)",  pattern: "Wizard (3 steps) + multi-row",         comp: GRNFromPOModal },
  { key: "grnTO",              name: "M-02 · GRN from TO",                    pattern: "Simple form (pre-existing LPs)",       comp: GRNFromTOModal },
  { key: "stockMove",          name: "M-03 · Stock movement create",          pattern: "Simple form + split + >10% approval",  comp: StockMoveModal },
  { key: "split",              name: "M-04 · LP split",                       pattern: "Multi-row + sum validator",            comp: LPSplitModal },
  { key: "merge",              name: "M-05 · LP merge",                       pattern: "2-step wizard + row validation",       comp: LPMergeModal },
  { key: "qaStatus",           name: "M-06 · QA status change",               pattern: "Dual-path (per transition)",           comp: QAStatusModal },
  { key: "labelPrint",         name: "M-07 · Label print",                    pattern: "Preview + options + reprint history",  comp: LabelPrintModal },
  { key: "reserve",            name: "M-08 · Reserve hard-lock",              pattern: "Picker-backed simple form",            comp: ReserveModal },
  { key: "releaseReservation", name: "M-09 · Release reservation",            pattern: "Destructive with reason",              comp: ReleaseReservationModal },
  { key: "fefoDeviation",      name: "M-10 · FEFO deviation confirm",         pattern: "Warning w/ compare + reason",          comp: FEFODeviationModal },
  { key: "destroy",            name: "M-11 · Destroy / scrap LP",             pattern: "Destructive w/ reason + confirm",      comp: DestroyLPModal },
  { key: "useByOverride",      name: "M-12 · Use_by block override",          pattern: "Manager-only high-audit",              comp: UseByOverrideModal },
  { key: "locationEdit",       name: "M-13 · Location create / edit",         pattern: "Simple form + depth validator",        comp: LocationEditModal },
  { key: "cycleCount",         name: "M-14 · Cycle count adjustment",         pattern: "Simple form + >10% approval",          comp: CycleCountModal },
  { key: "stateTransition",    name: "M-15 · State transition confirm",       pattern: "Confirm + reason",                     comp: StateTransitionModal },
  { key: "forceUnlock",        name: "Scanner lock force release",            pattern: "Admin confirm",                        comp: ForceUnlockModal },
];

const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Warehouse</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery</h1>
          <div className="muted" style={{fontSize:12}}>{MODAL_CATALOG.length} components covering M-01 through M-15 · follows <span className="mono">MODAL-SCHEMA.md</span></div>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> Each modal uses the shared primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>).
          <br/>Schema doc: <span className="mono">_shared/MODAL-SCHEMA.md</span> — read before adding new modals.
        </div>
      </div>

      <div className="gallery-grid">
        {MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={()=>setOpen(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}}>Open modal →</button>
          </div>
        ))}
      </div>

      {MODAL_CATALOG.map(m => (
        <m.comp key={m.key} open={open === m.key} onClose={()=>setOpen(null)}/>
      ))}
    </>
  );
};

Object.assign(window, {
  GRNFromPOModal, GRNFromTOModal, StockMoveModal,
  LPSplitModal, LPMergeModal, QAStatusModal, LabelPrintModal,
  ReserveModal, ReleaseReservationModal, FEFODeviationModal,
  DestroyLPModal, UseByOverrideModal, LocationEditModal,
  CycleCountModal, StateTransitionModal, ForceUnlockModal,
  ModalGallery, MODAL_CATALOG,
});
