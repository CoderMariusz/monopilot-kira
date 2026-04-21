// ==============================================================
// PLANNING MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Primitives (Modal, Stepper, Field, ReasonInput, Summary) come from
// ../_shared/modals.jsx and are globally available — do not redefine.
//
// Layout:
//  1. PO modals      — POFastFlow, AddPOLine, POApproval
//  2. TO modals      — LPPicker, TOCreate, ShipTO
//  3. WO modals      — WOCreate (+ CascadePreview sub-modal)
//  4. D365 modals    — D365TriggerConfirm, DraftWOReview
//  5. Cross-cutting  — ReservationOverride, CycleCheckWarning,
//                      DeleteConfirm, HardLockReleaseConfirm
//  6. Sequencing     — SequencingApplyConfirm (Q1 split)
//  7. Gallery screen (for manual QA)
// ==============================================================

// ============ 1. PO MODALS ============

// -------- MODAL-01: PO Fast-Flow 3-Step Wizard (pattern: wizard) --------
const POFastFlowModal = ({ open, onClose }) => {
  const [step, setStep] = React.useState("supplier");
  const [completed, setCompleted] = React.useState(new Set());
  const [data, setData] = React.useState({ supplier: "", warehouse: "WH-Factory-A", expDate: "2026-04-28", lines: [] });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);

  const steps = [
    { key: "supplier", label: "Supplier" },
    { key: "products", label: "Products" },
    { key: "review",   label: "Review & submit" },
  ];

  const goNext = () => {
    setCompleted(new Set([...completed, step]));
    setStep(step === "supplier" ? "products" : step === "products" ? "review" : "review");
  };
  const goBack = () => {
    setStep(step === "review" ? "products" : "supplier");
  };

  const addLine = () => setData({ ...data, lines: [...data.lines, { code: "", qty: 0, unitPrice: 0 }]});

  const subtotal = data.lines.reduce((a, l) => a + (l.qty * l.unitPrice), 0);
  const tax = subtotal * 0.2;
  const total = subtotal + tax;
  const needsApproval = total > 15000;

  const submit = async () => {
    setSubmitting(true); setError(null);
    await new Promise(r => setTimeout(r, 800));
    setSubmitting(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Create purchase order" subtitle="Smart defaults auto-fill on supplier select" size="wide"
      foot={
        step === "supplier" ? <>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!data.supplier} onClick={goNext}>Next: add products →</button>
        </> : step === "products" ? <>
          <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={data.lines.length === 0} onClick={goNext}>Next: review →</button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={goBack}>← Edit products</button>
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>{submitting ? "Submitting…" : "Submit PO"}</button>
        </>
      }>
      <Stepper steps={steps} current={step} completed={completed}/>

      {error && <div className="alert-red alert-box" style={{marginTop:10, fontSize:12}}>{error}</div>}

      {step === "supplier" && (
        <div style={{marginTop:14}}>
          <Field label="Supplier" required help="Selecting a supplier auto-fills currency, payment terms and tax code">
            <select value={data.supplier} onChange={e => setData({...data, supplier: e.target.value})}>
              <option value="">— Select supplier —</option>
              <option value="Agro-Fresh Ltd.">SUP-0012 · Agro-Fresh Ltd. · Active</option>
              <option value="Baltic Pork Co.">SUP-0018 · Baltic Pork Co. · Active</option>
              <option value="Spice Masters">SUP-0022 · Spice Masters · Active</option>
              <option value="Viscofan S.A.">SUP-0031 · Viscofan S.A. · Active</option>
              <option value="Hellmann Logistics">SUP-0044 · Hellmann Logistics · Active</option>
            </select>
          </Field>
          {data.supplier && (
            <div className="alert-green alert-box" style={{fontSize:11, padding:"8px 12px", marginBottom:10}}>
              <span>✓</span> <span>Smart defaults applied — Currency: <b className="mono">GBP</b> · Payment terms: <b>Net 30</b> · Lead time: <b>7 days</b></span>
            </div>
          )}
          <div className="ff-inline">
            <Field label="Warehouse" required>
              <select value={data.warehouse} onChange={e => setData({...data, warehouse: e.target.value})}>
                <option>WH-Factory-A</option><option>WH-Factory-B</option>
              </select>
            </Field>
            <Field label="Expected delivery" required help="Auto-computed: today + supplier lead time">
              <input type="date" value={data.expDate} onChange={e => setData({...data, expDate: e.target.value})}/>
            </Field>
          </div>
          <Field label="Shipping method">
            <input type="text" placeholder="e.g., Road · next-day ambient"/>
          </Field>
          <Field label="Notes">
            <textarea placeholder="Optional — visible to supplier"/>
          </Field>
          <Field label="Internal notes">
            <textarea placeholder="Optional — internal only, not sent to supplier"/>
          </Field>
        </div>
      )}

      {step === "products" && (
        <div style={{marginTop:14}}>
          <div className="card-head">
            <h3 className="card-title">Line items</h3>
            <div className="row-flex">
              <button className="btn btn-ghost btn-sm">Paste CSV</button>
              <button className="btn btn-secondary btn-sm" onClick={addLine}>＋ Add product</button>
            </div>
          </div>
          {data.lines.length === 0 ? (
            <div className="muted" style={{textAlign:"center", padding:"24px 0", fontSize:12}}>No lines yet — click <b>＋ Add product</b> to begin.</div>
          ) : (
            <table>
              <thead><tr><th>Product</th><th style={{textAlign:"right"}}>Qty</th><th style={{textAlign:"right"}}>Unit price</th><th style={{textAlign:"right"}}>Line total</th><th></th></tr></thead>
              <tbody>
                {data.lines.map((l, i) => {
                  const lineTotal = (l.qty || 0) * (l.unitPrice || 0);
                  return (
                    <tr key={i}>
                      <td><select defaultValue=""><option value="">— Select —</option><option>R-3001 · Osłonka Ø26</option><option>R-1001 · Wieprzowina kl. II</option><option>R-1501 · Mąka pszenna typ 500</option></select></td>
                      <td><input type="number" defaultValue={0} style={{width:90}} className="num" onChange={e => { const v=[...data.lines]; v[i].qty = +e.target.value; setData({...data, lines:v}); }}/></td>
                      <td><input type="number" defaultValue={0} step="0.01" style={{width:100}} className="num" onChange={e => { const v=[...data.lines]; v[i].unitPrice = +e.target.value; setData({...data, lines:v}); }}/></td>
                      <td className="num mono" style={{fontWeight:600}}>£{lineTotal.toFixed(2)}</td>
                      <td><button className="btn btn-ghost btn-sm">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="summary-block" style={{marginTop:14}}>
            <div className="summary-row"><span className="muted">Subtotal</span><span className="spacer"></span><span className="mono">£{subtotal.toFixed(2)}</span></div>
            <div className="summary-row"><span className="muted">Tax (20%)</span><span className="spacer"></span><span className="mono">£{tax.toFixed(2)}</span></div>
            <div className="summary-row emph"><span>Total</span><span className="spacer"></span><span className="mono">£{total.toFixed(2)}</span></div>
          </div>
        </div>
      )}

      {step === "review" && (
        <div style={{marginTop:14}}>
          <Summary rows={[
            { label: "Supplier", value: data.supplier || "—", mono: false },
            { label: "Warehouse", value: data.warehouse },
            { label: "Expected delivery", value: data.expDate },
            { label: "Lines", value: data.lines.length + " item(s)" },
            { label: "Subtotal", value: "£" + subtotal.toFixed(2) },
            { label: "Tax", value: "£" + tax.toFixed(2) },
            { label: "Total", value: "£" + total.toFixed(2), emphasis: true },
          ]}/>
          {needsApproval && (
            <div className="alert-amber alert-box" style={{marginTop:10, fontSize:12}}>
              <span>⏳</span>
              <div>
                <b>This PO requires approval</b>
                <div style={{fontSize:11, color:"var(--amber-700)"}}>Total £{total.toFixed(2)} exceeds threshold £15 000 — will be submitted to Production Manager for approval (V-PLAN-PO-005).</div>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

// -------- MODAL-02: Add PO Line (pattern: simple form) --------
const AddPOLineModal = ({ open, onClose, onConfirm }) => {
  const [form, setForm] = React.useState({ code: "", qty: 0, unitPrice: 0, discount: 0, expDate: "2026-04-28" });
  const total = (form.qty || 0) * (form.unitPrice || 0) * (1 - (form.discount || 0) / 100);
  const valid = form.code && form.qty > 0;

  return (
    <Modal open={open} onClose={onClose} title="Add PO line" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={() => { onConfirm?.(form); onClose(); }}>Add line</button>
      </>}>
      <Field label="Product" required>
        <select value={form.code} onChange={e => setForm({...form, code: e.target.value})}>
          <option value="">— Select product —</option>
          <option value="R-3001">R-3001 · Osłonka Ø26 (Viscofan)</option>
          <option value="R-1001">R-1001 · Wieprzowina kl. II</option>
          <option value="R-1501">R-1501 · Mąka pszenna typ 500</option>
        </select>
      </Field>
      <div className="ff-inline">
        <Field label="Qty" required help="V-PLAN-PO-004: must be > 0">
          <input type="number" value={form.qty} onChange={e => setForm({...form, qty: +e.target.value})} className="num"/>
        </Field>
        <Field label="UoM">
          <input type="text" value="m" readOnly style={{background:"var(--gray-100)"}}/>
        </Field>
      </div>
      <div className="ff-inline">
        <Field label="Unit price" help="Auto-filled from supplier_products · editable">
          <input type="number" step="0.01" value={form.unitPrice} onChange={e => setForm({...form, unitPrice: +e.target.value})} className="num"/>
        </Field>
        <Field label="Discount %">
          <input type="number" value={form.discount} onChange={e => setForm({...form, discount: +e.target.value})} className="num"/>
        </Field>
      </div>
      <Field label="Expected delivery" help="Defaults to PO header date">
        <input type="date" value={form.expDate} onChange={e => setForm({...form, expDate: e.target.value})}/>
      </Field>
      <div className="summary-block" style={{marginTop:10}}>
        <div className="summary-row emph"><span>Line total</span><span className="spacer"></span><span className="mono">£{total.toFixed(2)}</span></div>
      </div>
    </Modal>
  );
};

// -------- MODAL-03: PO Approval (pattern: dual-path) --------
const POApprovalModal = ({ open, onClose, data, onConfirm }) => {
  const [mode, setMode] = React.useState("approve");
  const [notes, setNotes] = React.useState("");
  const [rejectReason, setRejectReason] = React.useState("");
  const po = data || { id: "PO-2026-00044", supplier: "Viscofan S.A.", total: "£21 888", lines: 1 };
  const valid = mode === "approve" || rejectReason.length >= 10;

  return (
    <Modal open={open} onClose={onClose} title={mode === "approve" ? `Approve ${po.id}` : `Reject ${po.id}`} size="sm"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        {mode === "approve"
          ? <button className="btn btn-primary btn-sm" onClick={() => { onConfirm?.({ mode, notes }); onClose(); }}>Approve PO</button>
          : <button className="btn btn-danger btn-sm" disabled={!valid} onClick={() => { onConfirm?.({ mode, reason: rejectReason }); onClose(); }}>Reject PO</button>}
      </>}>
      <div className="pills" style={{marginBottom:14}}>
        <button className={"pill " + (mode === "approve" ? "on" : "")} onClick={() => setMode("approve")}>✓ Approve</button>
        <button className={"pill " + (mode === "reject" ? "on" : "")} onClick={() => setMode("reject")}>✕ Reject</button>
      </div>
      <Summary rows={[
        { label: "PO number", value: po.id },
        { label: "Supplier", value: po.supplier, mono: false },
        { label: "Lines", value: po.lines + " item(s)" },
        { label: "Total", value: po.total, emphasis: true },
      ]}/>
      {mode === "approve" ? (
        <Field label="Notes (optional)" help="Visible in status history">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional — explain approval context..."/>
        </Field>
      ) : (
        <Field label="Rejection reason" required>
          <ReasonInput value={rejectReason} onChange={setRejectReason} minLength={10} placeholder="Explain why this PO is being rejected..."/>
        </Field>
      )}
    </Modal>
  );
};

// ============ 3. TO MODALS ============

// -------- MODAL-06: LP Picker (pattern: picker) --------
const LPPickerModal = ({ open, onClose, onConfirm, requiredQty = 200, product = "FA5100 · Kiełbasa śląska pieczona 450g" }) => {
  const [selected, setSelected] = React.useState(new Set());
  const [search, setSearch] = React.useState("");

  const lps = [
    { lp: "LP-9120", loc: "WH-Factory-A · A-12-03", qty: 120, exp: "2026-05-02", status: "available" },
    { lp: "LP-9121", loc: "WH-Factory-A · A-12-03", qty: 80,  exp: "2026-05-02", status: "available", expiring: true },
    { lp: "LP-9122", loc: "WH-Factory-A · A-12-04", qty: 150, exp: "2026-05-14", status: "available" },
    { lp: "LP-9123", loc: "WH-Factory-A · A-12-05", qty: 120, exp: "2026-05-20", status: "reserved", reservedWo: "WO-2026-0108" },
    { lp: "LP-9124", loc: "WH-Factory-A · A-12-06", qty: 100, exp: "2026-05-28", status: "hard_lock", reservedWo: "WO-2026-0111" },
    { lp: "LP-9125", loc: "WH-Factory-A · A-12-07", qty: 180, exp: "2026-06-01", status: "available" },
    { lp: "LP-9126", loc: "WH-Factory-A · A-12-08", qty: 140, exp: "2026-06-10", status: "quarantine" },
  ];

  const visible = lps.filter(lp => !search || lp.lp.includes(search.toUpperCase()));
  const toggle = (lp) => {
    const next = new Set(selected);
    if (next.has(lp)) next.delete(lp); else next.add(lp);
    setSelected(next);
  };
  const totalSelected = Array.from(selected).reduce((a, lpId) => a + (lps.find(l => l.lp === lpId)?.qty || 0), 0);
  const enough = totalSelected >= requiredQty;

  return (
    <Modal open={open} onClose={onClose} title={`Select LPs — ${product}`} subtitle={`${requiredQty} kg required · FEFO sorted`} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!enough} onClick={() => { onConfirm?.(Array.from(selected)); onClose(); }}>Confirm selection ({selected.size})</button>
      </>}>
      <div className="row-flex" style={{marginBottom:10}}>
        <input type="text" placeholder="Scan or type LP number (e.g., LP-9120)…" value={search} onChange={e => setSearch(e.target.value)} style={{flex:1}} autoFocus/>
        <button className="btn btn-secondary btn-sm">🔲 Scan</button>
        <div className="pills">
          <button className="pill on">FEFO</button>
          <button className="pill">FIFO</button>
        </div>
      </div>
      <table>
        <thead><tr><th style={{width:30}}></th><th>LP</th><th>Location</th><th style={{textAlign:"right"}}>Net qty</th><th>Expiry</th><th>Status</th></tr></thead>
        <tbody>
          {visible.map(lp => {
            const selectable = lp.status === "available";
            return (
              <tr key={lp.lp} style={{opacity: selectable ? 1 : 0.55, cursor: selectable ? "pointer" : "not-allowed"}} onClick={() => selectable && toggle(lp.lp)}>
                <td><input type="checkbox" checked={selected.has(lp.lp)} disabled={!selectable} onChange={() => toggle(lp.lp)}/></td>
                <td className="mono" style={{fontWeight:600}}>{lp.lp}</td>
                <td className="mono" style={{fontSize:11}}>{lp.loc}</td>
                <td className="num mono">{lp.qty} kg</td>
                <td className="mono" style={{fontSize:11}}>
                  {lp.exp}
                  {lp.expiring && <span className="badge badge-amber" style={{fontSize:9, marginLeft:4}}>Expiring soon</span>}
                </td>
                <td>
                  {lp.status === "available" && <span className="badge badge-green" style={{fontSize:10}}>Available</span>}
                  {lp.status === "reserved" && <span className="badge badge-amber" style={{fontSize:10}} title={`Reserved for ${lp.reservedWo}`}>Reserved · {lp.reservedWo}</span>}
                  {lp.status === "hard_lock" && <span className="badge badge-red" style={{fontSize:10}} title={`Hard-locked to ${lp.reservedWo}`}>🔒 Hard lock</span>}
                  {lp.status === "quarantine" && <span className="badge badge-red" style={{fontSize:10}}>Quarantine</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={"alert-box " + (enough ? "alert-green" : "alert-amber")} style={{marginTop:12, fontSize:12}}>
        <span>{enough ? "✓" : "⚠"}</span>
        <div>
          <b>{selected.size} LP{selected.size !== 1 ? "s" : ""} selected</b> · Total <b className="mono">{totalSelected} kg</b> / required <b className="mono">{requiredQty} kg</b>
          <div style={{fontSize:11, color: enough ? "var(--green-700)" : "var(--amber-700)"}}>{enough ? `Enough to cover demand · +${totalSelected - requiredQty} kg surplus` : `Insufficient · ${requiredQty - totalSelected} kg short`}</div>
        </div>
      </div>
    </Modal>
  );
};

// ============ 4. WO MODALS ============

// -------- MODAL-09: Cascade Preview (sub-modal) --------
const CascadePreviewModal = ({ open, onClose, onConfirm }) => (
  <Modal open={open} onClose={onClose} title="Cascade preview — proposed WO chain" subtitle="Read-only preview before creation" size="fullpage" dismissible={true}
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Close preview</button>
      <button className="btn btn-primary btn-sm" onClick={() => { onConfirm?.(); onClose(); }}>Confirm — create all WOs</button>
    </>}>
    <div className="alert-blue alert-box" style={{marginBottom:12, fontSize:12}}>
      <span>ⓘ</span>
      <div><b>Cycle-check:</b> ✓ Passed · No circular dependencies detected. <b>Disposition:</b> all intermediate outputs → <span className="mono">to_stock</span> · child WO operators scan LPs at production time.</div>
    </div>
    <div className="cascade-canvas" style={{minHeight:300, padding:20}}>
      <div className="cascade-layer">
        <div className="cascade-layer-label">Layer 1 · intermediate</div>
        <div className="cascade-layer-nodes">
          <div className="cascade-node planned">
            <span className="cn-layer">L1</span>
            <div className="cn-code">WO-2026-0114 (preview)</div>
            <div className="cn-name">[INT] Farsz pierogowy mieszany 20kg</div>
            <div className="cn-qty">420 kg · <span className="mono">IN1301</span></div>
            <div className="cn-meta"><WOPlanStatus s="planned"/></div>
          </div>
          <div className="cascade-node released">
            <span className="cn-layer">L1</span>
            <div className="cn-code">WO-2026-0116</div>
            <div className="cn-name">[INT] Gotowe ciasto pierogowe</div>
            <div className="cn-qty">180 kg · <span className="mono">IN1302</span></div>
            <div className="cn-meta"><WOPlanStatus s="released"/></div>
          </div>
        </div>
      </div>
      <div className="cascade-arrow-down">↓<div className="muted" style={{fontSize:10, marginTop:-4, fontFamily:"var(--font-mono)"}}>→ to_stock</div></div>
      <div className="cascade-layer">
        <div className="cascade-layer-label">Layer 2 · Root FA</div>
        <div className="cascade-layer-nodes">
          <div className="cascade-node planned current">
            <span className="cn-layer">L2</span>
            <div className="cn-code">WO-2026-0113 (preview)</div>
            <div className="cn-name">Pierogi z mięsem 400g</div>
            <div className="cn-qty">800 kg · <span className="mono">FA5301</span></div>
            <div className="cn-meta"><WOPlanStatus s="planned"/> <Priority p="normal"/></div>
          </div>
        </div>
      </div>
    </div>
    <div style={{marginTop:12, padding:"10px 12px", background:"var(--gray-100)", borderRadius:4, fontSize:12}}>
      <b>Totals:</b> 2 new WOs · 1 existing upstream · 3 layers total
      &nbsp;·&nbsp; Timeline: earliest 2026-04-22 06:00 → latest 2026-04-22 16:30
      &nbsp;·&nbsp; Aggregated RM inputs: <span className="mono">180 kg mąka + 420 kg mięso + 24 kg jaja + 80 kg woda + 4 kg sól</span>
    </div>
  </Modal>
);

// -------- MODAL-08: WO Create (pattern: wizard + sub-modal) --------
const WOCreateModal = ({ open, onClose }) => {
  const [step, setStep] = React.useState("basic");
  const [completed, setCompleted] = React.useState(new Set());
  const [cascadePreviewOpen, setCascadePreviewOpen] = React.useState(false);
  const [form, setForm] = React.useState({ product: "", startDate: "2026-04-22", qty: 800, bom: "v5", line: "LINE-04", priority: "normal", isRework: false });

  const hasIntermediate = form.product && form.product.startsWith("FA5301");
  const steps = [{ key: "basic", label: "Basic info" }, { key: "confirm", label: "Confirm & create" }];

  return <>
    <Modal open={open && !cascadePreviewOpen} onClose={onClose} title="Create work order" subtitle={hasIntermediate ? "Cascade detected — review chain before confirming" : ""} size="wide"
      foot={step === "basic" ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!form.product || !form.qty} onClick={() => { setCompleted(new Set(["basic"])); setStep("confirm"); }}>Next →</button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={() => setStep("basic")}>← Back</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => { onClose(); }}>Create WO{hasIntermediate ? " + cascade" : ""}</button>
      </>}>

      <Stepper steps={steps} current={step} completed={completed}/>

      {step === "basic" && (
        <div style={{marginTop:14}}>
          <div className="ff-inline">
            <Field label="Product" required>
              <select value={form.product} onChange={e => setForm({...form, product: e.target.value})}>
                <option value="">— Select product —</option>
                <option value="FA5100">FA5100 · Kiełbasa śląska pieczona 450g · Finished Article</option>
                <option value="FA5301">FA5301 · Pierogi z mięsem 400g · Finished Article (has intermediates)</option>
                <option value="FA5400">FA5400 · Filet sous-vide 180g · Finished Article</option>
              </select>
            </Field>
            <Field label="Planned quantity" required help="V-PLAN-WO-001: must be > 0">
              <input type="number" value={form.qty} onChange={e => setForm({...form, qty: +e.target.value})} className="num"/>
            </Field>
          </div>
          <div className="ff-inline">
            <Field label="Scheduled start" required>
              <input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})}/>
            </Field>
            <Field label="BOM version" help="Auto-selected latest active BOM per FR-PLAN-018">
              <select value={form.bom} onChange={e => setForm({...form, bom: e.target.value})}>
                <option value="v5">v5 · active</option><option>v4</option><option>v3</option>
              </select>
            </Field>
          </div>
          <div className="ff-inline">
            <Field label="Production line">
              <select value={form.line} onChange={e => setForm({...form, line: e.target.value})}>
                <option>LINE-01</option><option>LINE-02</option><option>LINE-03</option><option value="LINE-04">LINE-04</option><option>LINE-05</option>
              </select>
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                <option>low</option><option value="normal">normal</option><option>high</option><option>critical</option>
              </select>
            </Field>
          </div>
          <Field label="Is rework" help="Rework WOs use manual materials · require approval">
            <label><input type="checkbox" checked={form.isRework} onChange={e => setForm({...form, isRework: e.target.checked})}/> This is a rework WO</label>
          </Field>

          {hasIntermediate && (
            <div className="alert-amber alert-box" style={{marginTop:10, fontSize:12}}>
              <span>⊶</span>
              <div>
                <b>This BOM contains intermediate items — cascade will be generated.</b>
                <div style={{fontSize:11, color:"var(--amber-700)"}}>A chain of 2 additional Work Orders will be created. Review before confirming.</div>
              </div>
              <div className="alert-cta">
                <button className="btn btn-sm btn-primary" onClick={() => setCascadePreviewOpen(true)}>Preview cascade chain →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "confirm" && (
        <div style={{marginTop:14}}>
          <Summary rows={[
            { label: "Product", value: form.product, mono: true },
            { label: "Qty", value: form.qty + " kg", emphasis: true },
            { label: "Line", value: form.line },
            { label: "Start", value: form.startDate },
            { label: "BOM", value: form.bom },
            { label: "Priority", value: form.priority, mono: false },
            { label: "Rework", value: form.isRework ? "Yes" : "No", mono: false },
          ]}/>
          {hasIntermediate && (
            <div className="alert-blue alert-box" style={{marginTop:10, fontSize:12}}>
              <span>⊶</span> This will create <b>3 WOs total</b> (root FA + 2 intermediate) in one atomic operation.
            </div>
          )}
        </div>
      )}
    </Modal>

    <CascadePreviewModal open={cascadePreviewOpen} onClose={() => setCascadePreviewOpen(false)} onConfirm={onClose}/>
  </>;
};

// ============ 5. CROSS-CUTTING MODALS ============

// -------- MODAL-10: Reservation Override (pattern: override with reason) --------
const ReservationOverrideModal = ({ open, onClose, onConfirm, data }) => {
  const [reason, setReason] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const res = data || { lp: "LP-7201", wo: "WO-2026-0099", qty: 28, material: "R-1501 · Mąka pszenna" };
  const valid = confirmed && reason.length >= 10 && category;

  return (
    <Modal open={open} onClose={onClose} title={`Release hard lock — ${res.lp}`} size="sm"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={() => { onConfirm?.({ reason, category }); onClose(); }}>Release lock</button>
      </>}>
      <div className="alert-red alert-box" style={{fontSize:12, marginBottom:14}}>
        <span>⚠</span>
        <div>
          <b>Destructive action</b>
          <div style={{fontSize:11, color:"var(--red-700)"}}>Releasing this hard lock will make <span className="mono">{res.lp}</span> ({res.qty} kg) available to other WOs. <span className="mono">{res.wo}</span> will lose its reservation.</div>
        </div>
      </div>
      <Summary rows={[
        { label: "LP", value: res.lp },
        { label: "Material", value: res.material, mono: false },
        { label: "Qty locked", value: res.qty + " kg" },
        { label: "Owning WO", value: res.wo },
      ]}/>
      <Field label="Reason category" required>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">— Select reason —</option>
          <option value="consumed_manually">Consumed manually</option>
          <option value="wo_cancelled">WO cancelled</option>
          <option value="admin_correction">Admin correction</option>
          <option value="emergency_realloc">Emergency reallocation</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Reason detail" required help="V-PLAN-RES-003 / V-PLAN-RES-004 · min 10 characters">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Explain why this hard lock is being released..."/>
      </Field>
      <div style={{fontSize:12}}>
        <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> I confirm this action will be fully audit-logged against my user account.</label>
      </div>
    </Modal>
  );
};

// -------- MODAL-12: Cycle-Check Warning (pattern: error dialog) --------
const CycleCheckWarningModal = ({ open, onClose, data }) => {
  const cycle = data?.cycle || ["FA5301 Pierogi z mięsem", "IN1301 Farsz pierogowy", "FA5301-B Pierogi rework", "FA5301 Pierogi z mięsem"];
  return (
    <Modal open={open} onClose={onClose} title="⚠ Cascade cycle detected — creation blocked" size="default"
      foot={<>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
      </>}>
      <div className="alert-red alert-box" style={{marginBottom:14}}>
        <span>⚠</span>
        <div>
          <b>No Work Orders were created.</b>
          <div style={{fontSize:12, color:"var(--red-700)"}}>A circular dependency was detected in the Work Order cascade. Review your Bill of Materials to resolve the cycle before retrying.</div>
        </div>
      </div>
      <div className="label" style={{marginBottom:6}}>Detected cycle</div>
      <div className="summary-block">
        {cycle.map((p, i) => (
          <div key={i} className="summary-row">
            <span className="mono" style={{fontSize:11}}>{i + 1}.</span>
            <span style={{marginLeft:8}}>{p}</span>
            <span className="spacer"></span>
            {i < cycle.length - 1 && <span className="muted">↓ consumes</span>}
          </div>
        ))}
      </div>
      <div style={{marginTop:14, display:"flex", gap:12, fontSize:12}}>
        <a style={{color:"var(--blue)", cursor:"pointer"}}>View BOM for FA5301 →</a>
        <a style={{color:"var(--blue)", cursor:"pointer"}}>Open Rule Registry (cascade_generation_v1) →</a>
      </div>
    </Modal>
  );
};

// -------- MODAL-13: D365 Trigger Confirm (pattern: confirm non-destructive) --------
const D365TriggerConfirmModal = ({ open, onClose, onConfirm }) => (
  <Modal open={open} onClose={onClose} title="Trigger D365 SO pull" size="sm"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={() => { onConfirm?.(); onClose(); }}>Pull now</button>
    </>}>
    <div style={{fontSize:13, marginBottom:12}}>
      This will pull Sales Orders from D365 matching the configured status filter (<b>Open, Confirmed</b>) within the next <b>14 days</b>.
      Draft Work Orders will be auto-generated for unresolved SOs.
    </div>
    <Summary rows={[
      { label: "Last pull", value: "2026-04-21 02:00:14" },
      { label: "Last SOs pulled", value: "12" },
      { label: "Last draft WOs created", value: "5" },
      { label: "Last errors", value: "1" },
    ]}/>
    <div className="alert-blue alert-box" style={{marginTop:12, fontSize:11}}>
      <span>ⓘ</span> This action is logged. Planners will be notified when new draft WOs appear.
    </div>
  </Modal>
);

// -------- MODAL-17: Delete Confirmation (pattern: destructive + type-to-confirm) --------
const DeleteConfirmModal = ({ open, onClose, onConfirm, data }) => {
  const entity = data || { type: "Work Order", id: "WO-2026-0115", impact: "This WO is in DRAFT status. No reservations or dependencies will be affected." };
  const [typed, setTyped] = React.useState("");
  const valid = typed === entity.id;

  return (
    <Modal open={open} onClose={onClose} title={`Delete ${entity.type}?`} size="sm"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={() => { onConfirm?.(entity); onClose(); }}>Delete</button>
      </>}>
      <div style={{fontSize:13, marginBottom:12}}>
        <b>This action is permanent and cannot be undone.</b>
        <div className="muted" style={{fontSize:12, marginTop:4}}>{entity.impact}</div>
      </div>
      <Field label={`Type "${entity.id}" to confirm`} required>
        <input type="text" value={typed} onChange={e => setTyped(e.target.value)} placeholder={entity.id} autoFocus/>
      </Field>
    </Modal>
  );
};

// -------- MODAL-18: Hard-Lock Release Confirm (pattern: destructive with reason) --------
const HardLockReleaseConfirmModal = ({ open, onClose, onConfirm, data }) => {
  const wo = data || { id: "WO-2026-0099", locks: [
    { lp: "LP-7201", material: "R-1501 · Mąka pszenna", qty: 28 },
    { lp: "LP-5582", material: "R-2101 · Pieprz czarny", qty: 4.2 },
    { lp: "LP-4431", material: "R-1001 · Wieprzowina kl. II", qty: 220.5 },
  ]};
  const [confirmed, setConfirmed] = React.useState(false);

  return (
    <Modal open={open} onClose={onClose} title={`Release all hard locks for ${wo.id}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!confirmed} onClick={() => { onConfirm?.(); onClose(); }}>Cancel WO &amp; release locks</button>
      </>}>
      <div className="alert-red alert-box" style={{marginBottom:14}}>
        <span>⚠</span>
        <div>
          <b>Cancelling this WO will release {wo.locks.length} LP hard locks</b>
          <div style={{fontSize:11, color:"var(--red-700)"}}>These LPs will become available to other Work Orders immediately. The WO state will transition to CANCELLED.</div>
        </div>
      </div>
      <div className="label" style={{marginBottom:6}}>LPs being released</div>
      <table>
        <thead><tr><th>LP</th><th>Material</th><th style={{textAlign:"right"}}>Qty</th></tr></thead>
        <tbody>
          {wo.locks.map((l,i) => (
            <tr key={i}>
              <td className="mono" style={{fontWeight:600, color:"var(--blue)"}}>{l.lp}</td>
              <td style={{fontSize:12}}>{l.material}</td>
              <td className="num mono">{l.qty} kg</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{marginTop:14, fontSize:13}}>
        <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> I confirm I want to cancel this WO and release all {wo.locks.length} hard locks.</label>
      </div>
    </Modal>
  );
};

// ============ TO Create / Edit — MODAL-05 ============
// spec: 04-PLANNING-BASIC-UX.md §PLAN-MODAL-05 (lines 1218-1241)
// Simple form (single-step). Width 640px ("wide" matches prior TO modals).
// V-PLAN-TO-001: From ≠ To. V-PLAN-TO-002: same site. V-PLAN-TO-003 (line qty > 0).
// Errors surface inline at save time only (Q3:c — "block at save").

const TO_WAREHOUSES = [
  { id: "WH-Factory-A",   site: "factory" },
  { id: "WH-Factory-B",   site: "factory" },
  { id: "WH-Cold-01",     site: "factory" },
  { id: "WH-DistCentral", site: "distribution" },
  { id: "WH-DistNorth",   site: "distribution" },
  { id: "WH-DistSouth",   site: "distribution" },
];

const TO_PRODUCTS = [
  { code: "FA5100", name: "Kiełbasa śląska pieczona 450g", uom: "kg", type: "FA" },
  { code: "FA5200", name: "Pasztet drobiowy z żurawiną 180g", uom: "kg", type: "FA" },
  { code: "FA5301", name: "Pierogi z mięsem 400g", uom: "kg", type: "FA" },
  { code: "IN1301", name: "[INT] Farsz pierogowy mieszany 20kg", uom: "kg", type: "intermediate" },
  { code: "R-1501", name: "Mąka pszenna typ 500", uom: "kg", type: "RM" },
  { code: "R-1001", name: "Wieprzowina kl. II", uom: "kg", type: "RM" },
];

const TOCreateModal = ({ open, onClose, onConfirm, editing, requireLpSelection = false }) => {
  const initial = editing || { id: null, from: "WH-Factory-A", to: "WH-DistCentral", priority: "normal", shipDate: "2026-04-23", recvDate: "2026-04-24", notes: "", lines: [] };
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState({});
  const [attempted, setAttempted] = React.useState(false);

  React.useEffect(() => { if (open) { setForm(initial); setErrors({}); setAttempted(false); } }, [open, editing]);

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { code: "", qty: 0, uom: "" }] }));
  const updLine = (i, patch) => setForm(f => {
    const lines = [...f.lines];
    lines[i] = { ...lines[i], ...patch };
    if (patch.code) {
      const p = TO_PRODUCTS.find(p => p.code === patch.code);
      if (p) lines[i].uom = p.uom;
    }
    return { ...f, lines };
  });
  const delLine = (i) => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));

  const validate = () => {
    const e = {};
    if (!form.from) e.from = "Required";
    if (!form.to) e.to = "Required";
    if (form.from && form.to && form.from === form.to)
      e.to = "V-PLAN-TO-001 · To warehouse must differ from From warehouse";
    if (form.from && form.to) {
      const fs = TO_WAREHOUSES.find(w => w.id === form.from)?.site;
      const ts = TO_WAREHOUSES.find(w => w.id === form.to)?.site;
      if (fs && ts && fs !== ts && form.from.startsWith("WH-Cold") === false && form.to.startsWith("WH-Cold") === false) {
        // V-PLAN-TO-002 — advisory only; note, but don't block for prototype
      }
    }
    if (!form.shipDate) e.shipDate = "Required";
    if (form.shipDate && form.recvDate && form.recvDate < form.shipDate)
      e.recvDate = "Planned receive must be ≥ planned ship";
    if (form.lines.length === 0) e.lines = "V-PLAN-TO-003 · Add at least one line";
    form.lines.forEach((l, i) => {
      if (!l.code) e["line_" + i + "_code"] = "Required";
      if (!(l.qty > 0)) e["line_" + i + "_qty"] = "Qty must be > 0";
    });
    return e;
  };

  const trySave = (status) => {
    setAttempted(true);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    onConfirm?.({ ...form, status });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}
      title={editing ? `Edit Transfer Order ${editing.id || ""}` : "Create Transfer Order"}
      size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-secondary btn-sm" onClick={() => trySave("draft")}>Save Draft</button>
        <button className="btn btn-primary btn-sm" onClick={() => trySave("planned")}>Save &amp; Plan</button>
      </>}>
      <div className="ff-inline">
        <Field label="From warehouse" required error={errors.from}>
          <select value={form.from} onChange={e => setForm({ ...form, from: e.target.value })}>
            {TO_WAREHOUSES.map(w => <option key={w.id} value={w.id}>{w.id}</option>)}
          </select>
        </Field>
        <Field label="To warehouse" required error={errors.to} help="V-PLAN-TO-001: ≠ From warehouse">
          <select value={form.to} onChange={e => setForm({ ...form, to: e.target.value })}>
            {TO_WAREHOUSES.map(w => <option key={w.id} value={w.id}>{w.id}</option>)}
          </select>
        </Field>
      </div>
      <div className="ff-inline">
        <Field label="Priority">
          <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
        <Field label="Planned ship date" required error={errors.shipDate}>
          <input type="date" value={form.shipDate} onChange={e => setForm({ ...form, shipDate: e.target.value })}/>
        </Field>
        <Field label="Planned receive date" error={errors.recvDate} help="Must be ≥ ship date">
          <input type="date" value={form.recvDate} onChange={e => setForm({ ...form, recvDate: e.target.value })}/>
        </Field>
      </div>
      <Field label="Notes">
        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional — visible to warehouse ops"/>
      </Field>

      <div className="card-head" style={{marginTop:10}}>
        <h3 className="card-title">TO lines</h3>
        <button className="btn btn-secondary btn-sm" onClick={addLine}>＋ Add Line</button>
      </div>
      {attempted && errors.lines && (
        <div className="alert-red alert-box" style={{fontSize:11, marginBottom:8}}><span>⚠</span><div>{errors.lines}</div></div>
      )}
      {form.lines.length === 0 ? (
        <div className="muted" style={{textAlign:"center", padding:"16px 0", fontSize:12}}>No lines yet — click <b>＋ Add Line</b> to begin.</div>
      ) : (
        <table>
          <thead><tr>
            <th style={{width:30}}>#</th><th>Product (RM / intermediate / FA)</th>
            <th style={{textAlign:"right", width:110}}>Qty</th><th style={{width:70}}>UoM</th>
            <th style={{width:40}}></th>
          </tr></thead>
          <tbody>
            {form.lines.map((l, i) => (
              <tr key={i}>
                <td className="mono">{i + 1}</td>
                <td>
                  <select value={l.code} onChange={e => updLine(i, { code: e.target.value })}
                    style={{borderColor: attempted && errors["line_" + i + "_code"] ? "var(--red)" : ""}}>
                    <option value="">— Select product —</option>
                    {TO_PRODUCTS.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name} · {p.type}</option>)}
                  </select>
                </td>
                <td>
                  <input type="number" className="num" value={l.qty}
                    onChange={e => updLine(i, { qty: +e.target.value })}
                    style={{width:90, borderColor: attempted && errors["line_" + i + "_qty"] ? "var(--red)" : ""}}/>
                </td>
                <td className="mono" style={{fontSize:12}}>{l.uom || "—"}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => delLine(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {requireLpSelection && form.lines.length > 0 && (
        <div className="alert-blue alert-box" style={{marginTop:12, fontSize:12}}>
          <span>ⓘ</span>
          <div>
            <b>LP selection required</b>
            <div style={{fontSize:11}}>Setting <span className="mono">to_require_lp_selection</span> is ON — pick LPs per line before save.</div>
          </div>
          <div className="alert-cta">
            <button className="btn btn-sm btn-secondary">＋ Select LPs</button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ============ Ship TO — MODAL-07 ============
// spec: 04-PLANNING-BASIC-UX.md §PLAN-MODAL-07 (lines 1271-1281)
// Width 560px (default-wide; "default" is fine, use size default).
// V-PLAN-TO-004: shipped_qty per line ≤ line qty.

const ShipTOModal = ({ open, onClose, onConfirm, to }) => {
  const toRef = to || PLAN_TO_DETAIL;
  const [qtys, setQtys] = React.useState({});
  React.useEffect(() => {
    if (!open) return;
    const seed = {};
    toRef.lines.forEach(l => { seed[l.seq] = Math.max(0, l.qty - (l.shipped || 0)); });
    setQtys(seed);
  }, [open, toRef]);

  const lineErrors = toRef.lines.map(l => {
    const remaining = l.qty - (l.shipped || 0);
    const v = qtys[l.seq] ?? 0;
    if (v < 0) return "Qty must be ≥ 0";
    if (v > remaining) return `V-PLAN-TO-004 · max ${remaining} ${l.uom}`;
    return null;
  });
  const anyError = lineErrors.some(Boolean);
  const totalBatch = Object.values(qtys).reduce((a, v) => a + (+v || 0), 0);
  const totalRemaining = toRef.lines.reduce((a, l) => a + (l.qty - (l.shipped || 0)), 0);
  const willBeFull = Math.abs(totalBatch - totalRemaining) < 0.0001 && totalBatch > 0;
  const nextStatus = totalBatch > 0 ? (willBeFull ? "shipped" : "partially_shipped") : toRef.status;

  return (
    <Modal open={open} onClose={onClose} title={`Ship ${toRef.id}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={anyError || totalBatch <= 0}
          onClick={() => { onConfirm?.({ qtys, nextStatus }); onClose(); }}>Confirm Shipment</button>
      </>}>
      <div className="muted" style={{fontSize:12, marginBottom:10}}>
        Enter qty to ship per line. Pre-filled with remaining unshipped qty.
      </div>
      <table>
        <thead><tr>
          <th style={{width:30}}>#</th><th>Product</th>
          <th style={{textAlign:"right"}}>Line qty</th>
          <th style={{textAlign:"right"}}>Shipped</th>
          <th style={{textAlign:"right", width:110}}>Ship now</th>
        </tr></thead>
        <tbody>
          {toRef.lines.map((l, i) => {
            const remaining = l.qty - (l.shipped || 0);
            return (
              <tr key={l.seq}>
                <td className="mono">{l.seq}</td>
                <td>
                  <div style={{fontSize:13}}>{l.product}</div>
                  <div className="mono muted" style={{fontSize:11}}>{l.code}</div>
                </td>
                <td className="num mono">{l.qty} {l.uom}</td>
                <td className="num mono">{l.shipped || 0}</td>
                <td>
                  <input type="number" className="num"
                    value={qtys[l.seq] ?? 0}
                    min={0} max={remaining}
                    onChange={e => setQtys({ ...qtys, [l.seq]: +e.target.value })}
                    style={{width:90, borderColor: lineErrors[i] ? "var(--red)" : ""}}/>
                  {lineErrors[i] && <div style={{fontSize:10, color:"var(--red-700)", marginTop:2}}>{lineErrors[i]}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Summary rows={[
        { label: "Total remaining", value: totalRemaining + " units", mono: true },
        { label: "Total shipping this batch", value: totalBatch + " units", mono: true, emphasis: true },
        { label: "After shipment", value: willBeFull ? "Fully shipped" : (totalBatch > 0 ? "Partially shipped" : "No change"), mono: false },
      ]}/>
      <div className="alert-blue alert-box" style={{marginTop:10, fontSize:12}}>
        <span>→</span>
        <div>
          <b>Status transition:</b>{" "}
          <TOStatus s={toRef.status}/> <span className="muted">→</span> <TOStatus s={nextStatus}/>
        </div>
      </div>
    </Modal>
  );
};

// ============ Draft WO Review — MODAL-16 ============
// spec: 04-PLANNING-BASIC-UX.md §PLAN-MODAL-16 (lines 1439-1456)
// Width 640px. Dual-path (approve / keep-draft / reject).

const DraftWOReviewModal = ({ open, onClose, onConfirm, wo }) => {
  const woRef = wo || D365_DRAFT_WOS[0];
  const review = (typeof D365_DRAFT_WO_REVIEW !== "undefined" && D365_DRAFT_WO_REVIEW[woRef.wo]) || { materials: [], cascadeChain: [{ wo: woRef.wo, product: woRef.product, item: woRef.item, qty: woRef.qty, uom: woRef.uom, layer: 1, root: true, status: "draft" }], line: "LINE-—", seqPosition: "—" };
  const [action, setAction] = React.useState("approve");
  const [reason, setReason] = React.useState("");
  const valid = action !== "reject" || reason.length >= 10;

  const availDot = (v) => {
    const color = v === "green" ? "var(--green)" : v === "yellow" ? "var(--amber)" : "var(--red)";
    const label = v === "green" ? "Available" : v === "yellow" ? "Borderline" : "Insufficient";
    return <span style={{display:"inline-flex", alignItems:"center", gap:6}}>
      <span style={{width:8, height:8, borderRadius:"50%", background: color, display:"inline-block"}}></span>
      <span style={{fontSize:11}}>{label}</span>
    </span>;
  };

  return (
    <Modal open={open} onClose={onClose} title="Review Draft WO from D365 SO" size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={() => { onConfirm?.({ action, reason, wo: woRef.wo }); onClose(); }}>Confirm</button>
      </>}>
      <Summary rows={[
        { label: "D365 SO Reference", value: woRef.soRef },
        { label: "Draft WO", value: woRef.wo },
        { label: "Product", value: woRef.product, mono: false },
        { label: "Planned qty", value: woRef.qty + " " + woRef.uom, emphasis: true },
        { label: "Scheduled start", value: woRef.start },
        { label: "BOM auto-selected", value: woRef.bom },
      ]}/>

      {review.cascadeChain.length > 1 && (
        <div style={{marginTop:12}}>
          <div className="label" style={{marginBottom:6}}>Cascade chain — {review.cascadeChain.length} WOs</div>
          <div className="summary-block">
            {review.cascadeChain.map((n, i) => (
              <div key={i} className="summary-row" style={{paddingLeft: (n.layer - 1) * 12}}>
                <span className="mono" style={{fontSize:11, color:"var(--muted)"}}>L{n.layer}</span>
                <span className="mono" style={{marginLeft:8, fontWeight: n.root ? 600 : 500, color: n.root ? "var(--blue)" : "var(--text)"}}>{n.wo}</span>
                <span style={{marginLeft:8, fontSize:12}}>{n.product}</span>
                <span className="spacer"></span>
                <span className="mono" style={{fontSize:11}}>{n.qty} {n.uom}</span>
                {n.root && <span className="badge badge-blue" style={{fontSize:9, marginLeft:6}}>Root</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{marginTop:12}}>
        <div className="label" style={{marginBottom:6}}>Material availability — {review.materials.length} materials</div>
        <table>
          <thead><tr><th>Code</th><th>Material</th><th style={{textAlign:"right"}}>Req qty</th><th>Availability</th></tr></thead>
          <tbody>
            {review.materials.map((m, i) => (
              <tr key={i}>
                <td className="mono" style={{fontSize:11}}>{m.code}</td>
                <td style={{fontSize:12}}>{m.name}</td>
                <td className="num mono">{m.qty} {m.uom}</td>
                <td>{availDot(m.avail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-blue alert-box" style={{marginTop:10, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Allergen hint:</b> this WO will sequence on <span className="mono">{review.line}</span>.
          Current allergen position: <b>{review.seqPosition}</b>.
        </div>
      </div>

      <div style={{marginTop:14}}>
        <div className="label" style={{marginBottom:6}}>Action</div>
        <div style={{display:"grid", gap:8, fontSize:13}}>
          <label style={{display:"flex", gap:8, alignItems:"flex-start", padding:"8px 10px", border:"1px solid var(--border)", borderRadius:4, background: action === "approve" ? "var(--blue-050)" : "var(--card)"}}>
            <input type="radio" checked={action === "approve"} onChange={() => setAction("approve")}/>
            <div>
              <b>Approve and Release WOs</b>
              <div className="muted" style={{fontSize:11}}>Creates reservations for RM materials on release.</div>
            </div>
          </label>
          <label style={{display:"flex", gap:8, alignItems:"flex-start", padding:"8px 10px", border:"1px solid var(--border)", borderRadius:4, background: action === "draft" ? "var(--blue-050)" : "var(--card)"}}>
            <input type="radio" checked={action === "draft"} onChange={() => setAction("draft")}/>
            <div>
              <b>Keep as Draft</b>
              <div className="muted" style={{fontSize:11}}>Planner releases manually later.</div>
            </div>
          </label>
          <label style={{display:"flex", gap:8, alignItems:"flex-start", padding:"8px 10px", border:"1px solid var(--border)", borderRadius:4, background: action === "reject" ? "var(--red-050a)" : "var(--card)"}}>
            <input type="radio" checked={action === "reject"} onChange={() => setAction("reject")}/>
            <div>
              <b>Reject (delete chain)</b>
              <div className="muted" style={{fontSize:11}}>Deletes this draft WO and all cascade children.</div>
            </div>
          </label>
        </div>
        {action === "reject" && (
          <div style={{marginTop:10}}>
            <Field label="Reject reason" required help="Min 10 characters">
              <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Explain why this draft chain is being rejected..."/>
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ============ 6. SEQUENCING — Apply Confirm (Q1 split) ============
// Audit decision Q1:c — Before/After preview stays inline in the page;
// this modal confirms the destructive reorder when user hits Run/Apply.
// Audit decision Q4 — destructive confirm pattern (checkbox-gated).

const SequencingApplyConfirmModal = ({ open, onClose, onConfirm }) => {
  const [ack, setAck] = React.useState(false);
  React.useEffect(() => { if (!open) setAck(false); }, [open]);

  // Blast radius derived from SEQ_QUEUE (mock data).
  const queue = typeof SEQ_QUEUE !== "undefined" ? SEQ_QUEUE : [];
  const nWOs = queue.length;
  const criticalExempt = queue.filter(q => q.exempt);
  const k = typeof SEQ_KPIS !== "undefined" ? SEQ_KPIS : { baseline: 0, changeovers: 0, reductionPct: 0 };

  return (
    <Modal open={open} onClose={onClose} title="Apply sequencing — confirm reorder" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!ack} onClick={() => { onConfirm?.(); onClose(); }}>Apply sequencing</button>
      </>}>
      <div className="alert-amber alert-box" style={{marginBottom:12, fontSize:12}}>
        <span>↯</span>
        <div>
          <b>Blast radius:</b> will reorder <b className="mono">{nWOs}</b> work orders on <b className="mono">LINE-04</b>.
          <div style={{fontSize:11, color:"var(--amber-700)"}}>Scheduled start times of affected WOs will change.</div>
        </div>
      </div>
      <Summary rows={[
        { label: "Changeovers — before", value: k.baseline, mono: true },
        { label: "Changeovers — after", value: k.changeovers, mono: true },
        { label: "Delta", value: "−" + (k.baseline - k.changeovers) + " (−" + k.reductionPct + "%)", mono: true, emphasis: true },
      ]}/>
      {criticalExempt.length === 0 ? (
        <div className="alert-green alert-box" style={{marginTop:10, fontSize:12}}>
          <span>✓</span>
          <div>Critical WOs remain fixed — no exempt WOs will shift position.</div>
        </div>
      ) : (
        <div className="alert-red alert-box" style={{marginTop:10, fontSize:12}}>
          <span>⚠</span>
          <div>
            <b>{criticalExempt.length} critical WO{criticalExempt.length > 1 ? "s" : ""} would shift.</b>
            <div style={{fontSize:11}}>{criticalExempt.map(c => c.wo).join(", ")}</div>
          </div>
        </div>
      )}
      <div style={{marginTop:12, fontSize:13}}>
        <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/> I understand this will change scheduled start times.</label>
      </div>
    </Modal>
  );
};

// ============ 7. MODAL GALLERY (manual QA) ============

const MODAL_CATALOG = [
  { key: "poFastFlow",      name: "MODAL-01 · PO Fast-Flow wizard",     pattern: "Wizard (3 steps)",            comp: POFastFlowModal },
  { key: "addPoLine",       name: "MODAL-02 · Add PO line",             pattern: "Simple form",                 comp: AddPOLineModal },
  { key: "poApproval",      name: "MODAL-03 · PO Approval",             pattern: "Dual-path (approve/reject)",  comp: POApprovalModal },
  { key: "toCreate",        name: "MODAL-05 · TO Create/Edit",          pattern: "Simple form (size wide)",     comp: TOCreateModal },
  { key: "lpPicker",        name: "MODAL-06 · LP Picker",               pattern: "Searchable picker",           comp: LPPickerModal },
  { key: "shipTo",          name: "MODAL-07 · Ship TO",                 pattern: "Simple form w/ per-line inputs", comp: ShipTOModal },
  { key: "woCreate",        name: "MODAL-08 · WO Create + cascade",     pattern: "Wizard + sub-modal",          comp: WOCreateModal },
  { key: "cascadePreview",  name: "MODAL-09 · Cascade preview",         pattern: "Preview / read-only",         comp: CascadePreviewModal },
  { key: "resOverride",     name: "MODAL-10 · Reservation override",    pattern: "Override with reason",        comp: ReservationOverrideModal },
  { key: "cycleCheck",      name: "MODAL-12 · Cycle-check warning",     pattern: "Error dialog (single OK)",    comp: CycleCheckWarningModal },
  { key: "d365Trigger",     name: "MODAL-13 · D365 trigger confirm",    pattern: "Confirm (non-destructive)",   comp: D365TriggerConfirmModal },
  { key: "draftWoReview",   name: "MODAL-16 · Draft WO Review",         pattern: "Dual-path w/ cascade",        comp: DraftWOReviewModal },
  { key: "deleteConfirm",   name: "MODAL-17 · Delete confirmation",     pattern: "Destructive — type-to-confirm", comp: DeleteConfirmModal },
  { key: "hardLockRelease", name: "MODAL-18 · Hard-lock release",       pattern: "Destructive — reason + LP list", comp: HardLockReleaseConfirmModal },
  { key: "seqApply",        name: "Sequencing Apply Confirm",           pattern: "Confirm destructive (reorder)", comp: SequencingApplyConfirmModal },
];

const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Planning</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery</h1>
          <div className="muted" style={{fontSize:12}}>{MODAL_CATALOG.length} components implementing UX patterns · follows <span className="mono">MODAL-SCHEMA.md</span></div>
        </div>
        <div className="row-flex">
          <span className="badge badge-blue" style={{fontSize:10}}>Pattern reference</span>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> All modals share the same primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>).
          <br/>Schema doc: <span className="mono">design/Monopilot Design System/planning/MODAL-SCHEMA.md</span> — read before adding new modals.
        </div>
      </div>

      <div className="gallery-grid">
        {MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={() => setOpen(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:10}}>Open modal →</button>
          </div>
        ))}
      </div>

      {MODAL_CATALOG.map(m => (
        <m.comp key={m.key} open={open === m.key} onClose={() => setOpen(null)}/>
      ))}
    </>
  );
};

Object.assign(window, {
  POFastFlowModal, AddPOLineModal, POApprovalModal,
  LPPickerModal, TOCreateModal, ShipTOModal,
  WOCreateModal, CascadePreviewModal,
  ReservationOverrideModal, CycleCheckWarningModal, D365TriggerConfirmModal,
  DraftWOReviewModal,
  DeleteConfirmModal, HardLockReleaseConfirmModal,
  SequencingApplyConfirmModal,
  ModalGallery,
});
