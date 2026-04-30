// ============================================================
// SHIPPING MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Modal inventory:
//   M-01 Customer Create/Edit (simple form)
//   M-02 Address Create/Edit (simple form)
//   M-03 Allergen restriction add
//   M-04 SO Create (4-step wizard)
//   M-05 SO Line Add/Edit (simple form)
//   M-06 Allocation Override (FEFO deviation / expired LP / QA hold)
//   M-07 Hold Place (typed hold)
//   M-08 Hold Release (destructive w/ reason)
//   M-09 Partial Fulfillment Decision (3-choice)
//   M-10 Short Pick Resolve (3-choice)
//   M-11 Cancel SO (destructive w/ reason + confirm)
//   M-12 Wave Release Confirm
//   M-13 Pick Reassign
//   M-14 Pack Close Carton Confirm (generates SSCC)
//   M-15 Ship Confirm (guards checklist + D365 outbox preview)
//   M-16 SSCC Preview + Reprint
//   M-17 Packing Slip Regenerate
//   M-18 BOL Sign-off upload
//   M-19 Carrier create/edit
//   M-20 Release Allocation (destructive)
// ============================================================

// -------- M-01 Customer Create/Edit --------
const CustomerCreateModal = ({ open, onClose, data }) => {
  const [form, setForm] = React.useState({
    code: data?.code || "",
    name: data?.name || "",
    tradingName: data?.tradingName || "",
    category: data?.category || "Retail",
    email: data?.email || "",
    phone: data?.phone || "",
    terms: data?.terms || 30,
    active: data?.active ?? true,
  });
  const valid = form.name && form.email && form.category;
  const isEdit = !!data;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit customer — " + data?.name : "Create customer"} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>{isEdit ? "Save" : "Create customer"}</button>
      </>}>
      <div className="ff-inline">
        <Field label="Customer code" help="Auto-generated if blank · CUST-YYYY-NNNNN"><input value={form.code} onChange={e=>setForm({...form, code:e.target.value})} placeholder="CUST-2026-00123" className="mono"/></Field>
        <Field label="Category" required><select value={form.category} onChange={e=>setForm({...form, category:e.target.value})}><option>Retail</option><option>Wholesale</option><option>Distributor</option></select></Field>
      </div>
      <Field label="Full name" required><input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Lidl Polska Sp. z o.o." maxLength={100}/></Field>
      <Field label="Trading name"><input value={form.tradingName} onChange={e=>setForm({...form, tradingName:e.target.value})}/></Field>
      <div className="ff-inline">
        <Field label="Email" required><input type="email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} placeholder="zamowienia@customer.pl"/></Field>
        <Field label="Phone"><input type="tel" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})}/></Field>
      </div>
      <div className="ff-inline">
        <Field label="Tax ID (VAT/EIN)"><input placeholder="PL7820030500"/></Field>
        <Field label="Payment terms" required><select value={form.terms} onChange={e=>setForm({...form, terms:+e.target.value})}><option>7</option><option>15</option><option>30</option><option>45</option><option>60</option><option>90</option></select></Field>
      </div>
      <Field label="Credit limit (GBP)" help="Phase 2 field"><input type="number" placeholder="e.g. 250000"/></Field>
      <Field label="Active"><label style={{fontSize:12}}><input type="checkbox" checked={form.active} onChange={e=>setForm({...form, active:e.target.checked})}/> Customer is active (can receive orders)</label></Field>
      <Field label="Notes"><textarea placeholder="Dock hours, EDI requirements, special handling…" style={{minHeight:60}}/></Field>
    </Modal>
  );
};

// -------- M-02 Address Create/Edit --------
const AddressModal = ({ open, onClose, data }) => (
  <Modal open={open} onClose={onClose} title={data ? "Edit address" : "Add shipping address"} size="default"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>Save address</button>
    </>}>
    <div className="ff-inline">
      <Field label="Address type" required><select defaultValue={data?.type || "shipping"}><option>billing</option><option>shipping</option></select></Field>
      <Field label="Default"><label><input type="checkbox" defaultChecked={data?.isDefault}/> Use as default</label></Field>
    </div>
    <Field label="Address line 1" required><input defaultValue={data?.line1} maxLength={100} placeholder="ul. Logistyczna 12"/></Field>
    <Field label="Address line 2"><input defaultValue={data?.line2}/></Field>
    <div className="ff-inline">
      <Field label="City" required><input defaultValue={data?.city}/></Field>
      <Field label="Postal code" required><input defaultValue={data?.postal} className="mono" style={{width:120}}/></Field>
    </div>
    <div className="ff-inline">
      <Field label="County / State"><input/></Field>
      <Field label="Country" required><select defaultValue={data?.country || "PL"}><option>PL</option><option>GB</option><option>DE</option><option>CZ</option><option>SK</option></select></Field>
    </div>
    <Field label="Dock hours" help="Stored as JSON — placeholder Mon-Fri 08:00-17:00"><input defaultValue={data?.dock || "Mon-Fri 08:00-17:00"}/></Field>
    <Field label="Notes"><textarea placeholder="Gate code, contact, EDI ASN requirement…"/></Field>
    <div className="alert-blue alert-box" style={{fontSize:11}}><span>ⓘ</span><div>V-SHIP-SO-02: at least one shipping-type address required before SO confirmation.</div></div>
  </Modal>
);

// -------- M-03 Allergen restriction add --------
const AllergenRestrictionModal = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Add allergen restriction" size="default"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>Add restriction</button>
    </>}>
    <Field label="Allergen" required><select>{SH_ALLERGENS.map(a => <option key={a} style={{textTransform:"capitalize"}}>{a}</option>)}</select></Field>
    <Field label="Restriction type" required>
      <select>
        <option>Refuses — do not ship</option>
        <option>Requires declared — must label bold</option>
      </select>
    </Field>
    <Field label="Notes"><textarea placeholder="Optional notes…"/></Field>
    <div className="alert-blue alert-box" style={{fontSize:11}}><span>ⓘ</span><div>Restrictions are checked at SO wizard step 3 (allergen_cascade_v1) and flagged on packing slip / BOL per EU 1169/2011.</div></div>
  </Modal>
);

// -------- M-04 SO Create (4-step wizard) --------
const SoCreateModal = ({ open, onClose }) => {
  const [step, setStep] = React.useState("header");
  const [completed, setCompleted] = React.useState(new Set());
  const [customer, setCustomer] = React.useState("");
  const [lines, setLines] = React.useState([
    { product: "FA5100 · Kiełbasa śląska 450g", qty: 120, unitPrice: 12.80 },
    { product: "FA5200 · Pasztet 180g",         qty: 80,  unitPrice: 8.40 },
  ]);
  const [acknowledged, setAcknowledged] = React.useState(false);

  const steps = [
    { key: "header",   label: "Header" },
    { key: "lines",    label: "Lines" },
    { key: "allergen", label: "Allergen review" },
    { key: "review",   label: "Review" },
  ];

  const next = () => { setCompleted(new Set([...completed, step])); setStep({header:"lines", lines:"allergen", allergen:"review", review:"review"}[step]); };
  const back = () => setStep({lines:"header", allergen:"lines", review:"allergen"}[step] || "header");

  const hasAllergenConflict = lines.some(l => l.product.includes("FA5301"));
  const total = lines.reduce((a,l) => a + (+l.qty * +l.unitPrice), 0);

  return (
    <Modal open={open} onClose={onClose} title="Create sales order" subtitle="Customer → lines → allergen review → review" size="fullpage"
      foot={step === "header" ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!customer} onClick={next}>Next: lines →</button>
      </> : step === "lines" ? <>
        <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={lines.length === 0} onClick={next}>Next: allergen review →</button>
      </> : step === "allergen" ? <>
        <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={hasAllergenConflict && !acknowledged} onClick={next}>Next: review →</button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={back}>← Back</button>
        <span className="spacer"></span>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Create draft SO</button>
      </>}>
      <Stepper steps={steps} current={step} completed={completed}/>

      {step === "header" && (
        <div style={{marginTop:14}}>
          <Field label="Customer" required help="V-SHIP-SO-01 — inactive customers disabled">
            <select value={customer} onChange={e=>setCustomer(e.target.value)}>
              <option value="">— Select customer —</option>
              {SH_CUSTOMERS.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}{c.allergens > 0 ? "  ⚠ " + c.allergens + " allergen restrictions" : ""}</option>)}
            </select>
          </Field>
          <Field label="Customer PO"><input placeholder="LIDL-PO-44822" maxLength={50} className="mono"/></Field>
          <div className="ff-inline">
            <Field label="Order date" required><input type="date" defaultValue="2026-04-21"/></Field>
            <Field label="Promised ship date" required help="V-SHIP-SO-04 ≥ order date"><input type="date" defaultValue="2026-04-23"/></Field>
            <Field label="Required delivery"><input type="date" defaultValue="2026-04-24"/></Field>
          </div>
          <Field label="Shipping address" required help="V-SHIP-SO-02">
            <select disabled={!customer}>
              <option>DC Wrocław — ul. Logistyczna 12, 54-512 Wrocław, PL (default)</option>
              <option>DC Poznań — Aleja Solidarności 8, 61-696 Poznań, PL</option>
              <option>DC Katowice — ul. Przemysłowa 144, 40-020 Katowice, PL</option>
              <option>＋ Add new address…</option>
            </select>
          </Field>
          <Field label="Notes"><textarea placeholder="EDI ASN requirements, dock window…"/></Field>
        </div>
      )}

      {step === "lines" && (
        <div style={{marginTop:14}}>
          <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
            <span>ⓘ</span>
            <div>Unit prices auto-filled from <span className="mono">products.default_sell_price</span> (03-TECHNICAL). Editable — audit-logged on change.</div>
          </div>
          <table>
            <thead><tr><th>#</th><th>Product</th><th style={{width:80}}>Qty</th><th style={{width:90}}>Unit £</th><th style={{width:110}}>Line £</th><th style={{width:30}}></th></tr></thead>
            <tbody>
              {lines.map((l,i) => (
                <tr key={i}>
                  <td className="mono">{i+1}</td>
                  <td><input value={l.product} onChange={e=>{const x=[...lines]; x[i].product=e.target.value; setLines(x);}} style={{width:"100%"}}/></td>
                  <td><input type="number" value={l.qty} onChange={e=>{const x=[...lines]; x[i].qty=+e.target.value; setLines(x);}} className="num"/></td>
                  <td><input type="number" step="0.01" value={l.unitPrice} onChange={e=>{const x=[...lines]; x[i].unitPrice=+e.target.value; setLines(x);}} className="num"/></td>
                  <td className="num mono">£{(+l.qty * +l.unitPrice).toFixed(2)}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={()=>setLines(lines.filter((_,j)=>j!==i))}>🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-flex" style={{marginTop:10}}>
            <button className="btn btn-secondary btn-sm" onClick={()=>setLines([...lines, { product: "FA5301 · Pierogi 1kg", qty: 20, unitPrice: 14.20 }])}>＋ Add line</button>
            <span className="spacer"></span>
            <b className="mono" style={{fontSize:14}}>Total: £{total.toFixed(2)}</b>
          </div>
          <div style={{fontSize:11, color:"var(--muted)", marginTop:6}}>V-SHIP-SO-05: at least 1 line required · V-SHIP-SO-06: all qty {`>`} 0</div>
        </div>
      )}

      {step === "allergen" && (
        <div style={{marginTop:14}}>
          <div className="label" style={{marginBottom:6}}>Automatic allergen check (allergen_cascade_v1)</div>
          <table>
            <thead><tr><th>Line</th><th>Product</th><th>Customer restriction</th><th>Conflict</th></tr></thead>
            <tbody>
              {lines.map((l,i) => {
                const conflict = l.product.includes("FA5301") ? "gluten (declared req)" : null;
                return (
                  <tr key={i} className={conflict ? "row-overdue" : ""}>
                    <td className="mono">{i+1}</td>
                    <td style={{fontSize:11}}>{l.product}</td>
                    <td style={{fontSize:11}}>{conflict || <span className="muted">—</span>}</td>
                    <td>{conflict ? <span className="badge badge-amber" style={{fontSize:9}}>Conflict</span> : <span className="badge badge-green" style={{fontSize:9}}>✓ Clear</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasAllergenConflict ? (
            <>
              <div className="alert-red alert-box" style={{fontSize:12, marginTop:10}}>
                <span>⚠</span>
                <div><b>Allergen conflict detected.</b> SO can be saved as draft but <b>cannot be confirmed</b> until <b>shipping_qa</b> overrides with reason code.</div>
              </div>
              <label style={{fontSize:12, marginTop:10, display:"block"}}>
                <input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/> I acknowledge this conflict and will request QA override before confirming.
              </label>
            </>
          ) : (
            <div className="alert-green alert-box" style={{fontSize:12, marginTop:10}}><span>✓</span><div>All products clear for this customer's allergen profile.</div></div>
          )}
        </div>
      )}

      {step === "review" && (
        <div style={{marginTop:14}}>
          <Summary rows={[
            { label: "Customer", value: SH_CUSTOMERS.find(c => c.id === customer)?.name || "—", mono: false },
            { label: "Promised ship date", value: "2026-04-23" },
            { label: "Line count", value: lines.length },
            { label: "Allergen status", value: hasAllergenConflict ? "CONFLICT — requires override" : "Clear", emphasis: true, mono: false },
            { label: "Total", value: "£" + total.toFixed(2) },
            { label: "Shipping address", value: "DC Wrocław", mono: false },
          ]}/>
          <div className="alert-blue alert-box" style={{fontSize:11, marginTop:10}}>
            <span>ⓘ</span>
            <div>On <b>Create Draft SO</b>: SO record created with <span className="mono">status=draft</span>. Auto-allocate on confirm: <span className="mono">ON</span> — will reserve warehouse LPs via <span className="mono">fefo_strategy_v1</span>.</div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-05 SO Line Add/Edit --------
const SoLineAddModal = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Add order line" size="default"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>Add line</button>
    </>}>
    <Field label="Product" required help="Search by code or name — shows GTIN, allergens, default price">
      <select><option>FA5100 · Kiełbasa śląska pieczona 450g · GTIN 05901234567801 · £12.80 · contains: milk</option><option>FA5200 · Pasztet drobiowy z żurawiną 180g · GTIN 05901234567814 · £8.40</option><option>FA5301 · Pierogi ruskie 1kg · GTIN 05901234567828 · £14.20 · contains: gluten, milk, egg</option></select>
    </Field>
    <div className="ff-inline">
      <Field label="Quantity ordered" required help="V-SHIP-SO-06 must be > 0"><input type="number" defaultValue="40" className="num"/></Field>
      <Field label="Unit price (GBP)" required help="Auto-filled from products.default_sell_price"><input type="number" step="0.01" defaultValue="12.80" className="num"/></Field>
    </div>
    <Field label="Requested lot" help="Optional — customer-specific lot"><input placeholder="e.g. WO-2026-0108-B1" className="mono"/></Field>
    <Field label="Line notes"><textarea placeholder="Optional notes…"/></Field>
  </Modal>
);

// -------- M-06 Allocation Override --------
const AllocOverrideModal = ({ open, onClose }) => {
  const [reason, setReason] = React.useState("");
  const [reasonText, setReasonText] = React.useState("");
  const valid = reason && (reason !== "other" || reasonText.length >= 10);

  return (
    <Modal open={open} onClose={onClose} title="Allocation override — FA5100 Kiełbasa śląska" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Confirm override</button>
      </>}>
      <div className="fefo-compare">
        <div className="fc-card suggested">
          <div className="fc-head">FEFO suggested (rank 1)</div>
          <div className="fc-lp">LP-9120</div>
          <div className="fc-row"><b>Expiry:</b> 2026-06-14</div>
          <div className="fc-row"><b>Batch:</b> WO-2026-0108-B1</div>
          <div className="fc-row"><b>Location:</b> Dispatch › FG-01</div>
        </div>
        <div className="fc-card selected">
          <div className="fc-head">Selected override</div>
          <div className="fc-lp">LP-9128</div>
          <div className="fc-row"><b>Expiry:</b> 2026-07-02 <span style={{color:"var(--amber-700)"}}>(+18 days)</span></div>
          <div className="fc-row"><b>Batch:</b> WO-2026-0115-B1</div>
          <div className="fc-row"><b>Location:</b> Dispatch › FG-01</div>
        </div>
      </div>
      <Field label="Override type" required>
        <select defaultValue="fefo_deviation"><option value="fefo_deviation">FEFO deviation</option><option value="expired_lp">Expired LP</option><option value="quality_hold">Quality hold bypass</option></select>
      </Field>
      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select reason —</option>
          {SH_OVERRIDE_REASONS.fefo_deviation.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      {reason === "other" && (
        <Field label="Reason text" required help="min 10 chars — logged to pick_overrides">
          <ReasonInput value={reasonText} onChange={setReasonText} minLength={10} placeholder="Explain deviation..."/>
        </Field>
      )}
      <div className="alert-amber alert-box" style={{fontSize:11}}>
        <span>⚠</span>
        <div>This override will be logged to <span className="mono">pick_overrides</span> (D-SHP-13) and emits <span className="mono">shipping.fefo.overridden</span> event.</div>
      </div>
    </Modal>
  );
};

// -------- M-07 Hold Place --------
const HoldPlaceModal = ({ open, onClose }) => {
  const [type, setType] = React.useState("credit");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const valid = type && reason && notes.length >= 10;

  return (
    <Modal open={open} onClose={onClose} title="Place hold on SO-2026-2451" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Place hold</button>
      </>}>
      <Field label="Hold type" required>
        <select value={type} onChange={e=>setType(e.target.value)}>
          <option value="credit">Credit hold</option>
          <option value="qa">QA hold</option>
          <option value="allergen">Allergen hold</option>
          <option value="manual">Manual hold</option>
        </select>
      </Field>
      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select reason —</option>
          {SH_OVERRIDE_REASONS.hold_place.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Notes" required help="min 10 characters">
        <ReasonInput value={notes} onChange={setNotes} minLength={10} placeholder="Explain hold reason..."/>
      </Field>
      <div className="alert-blue alert-box" style={{fontSize:11}}>
        <span>ⓘ</span>
        <div>Hold will appear on SO detail Holds tab. Release requires matching role (credit_control for credit, shipping_qa for QA/allergen, shipping_manager for manual).</div>
      </div>
    </Modal>
  );
};

// -------- M-08 Hold Release --------
const HoldReleaseModal = ({ open, onClose }) => {
  const [reason, setReason] = React.useState("");
  const valid = reason;

  return (
    <Modal open={open} onClose={onClose} title="Release credit hold — SO-2026-2449" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-success btn-sm" disabled={!valid} onClick={onClose}>Release hold</button>
      </>}>
      <Summary rows={[
        { label: "Hold type", value: "Credit", mono: false },
        { label: "Placed by", value: "A.Nowak (credit_control)", mono: false },
        { label: "Placed at", value: "2026-04-21 09:15" },
        { label: "Reason", value: "credit_limit_exceeded", mono: true },
      ]}/>
      <Field label="Release reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select reason —</option>
          {SH_OVERRIDE_REASONS.hold_release.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Notes (optional)"><textarea placeholder="Additional context..."/></Field>
      <div className="alert-green alert-box" style={{fontSize:11}}>
        <span>✓</span>
        <div>On release: SO status progresses from <span className="mono">held</span> to <span className="mono">confirmed</span>. Audit entry created in <span className="mono">shipping_audit_log</span>.</div>
      </div>
    </Modal>
  );
};

// -------- M-09 Partial Fulfillment --------
const PartialFulfilModal = ({ open, onClose }) => {
  const [decision, setDecision] = React.useState("ship_partial");
  const [reason, setReason] = React.useState("");

  return (
    <Modal open={open} onClose={onClose} title="Partial fulfillment decision — SO-2026-2443" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Confirm decision</button>
      </>}>
      <div className="label" style={{marginBottom:6}}>Short lines</div>
      <table>
        <thead><tr><th>Product</th><th style={{textAlign:"right"}}>Ordered</th><th style={{textAlign:"right"}}>Available</th><th style={{textAlign:"right"}}>Shortfall</th></tr></thead>
        <tbody>
          <tr><td>FA5301 · Pierogi ruskie 1kg</td><td className="num mono">40</td><td className="num mono">30</td><td className="num mono" style={{color:"var(--red-700)"}}>10</td></tr>
        </tbody>
      </table>
      <Field label="Decision" required>
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          <label style={{fontSize:12}}><input type="radio" name="dec" value="ship_partial" checked={decision === "ship_partial"} onChange={e=>setDecision(e.target.value)}/> <b>Ship what is available now</b> — SO → <span className="mono">partial</span>, remaining stays on SO</label>
          <label style={{fontSize:12}}><input type="radio" name="dec" value="wait" checked={decision === "wait"} onChange={e=>setDecision(e.target.value)}/> <b>Wait for full stock</b> — hold SO until stock available</label>
          <label style={{fontSize:12}}><input type="radio" name="dec" value="backorder" checked={decision === "backorder"} onChange={e=>setDecision(e.target.value)}/> <b>Ship partial + create backorder SO</b> — auto-create new SO for shortfall qty</label>
        </div>
      </Field>
      {(decision === "ship_partial" || decision === "backorder") && (
        <Field label="Reason code" required>
          <select value={reason} onChange={e=>setReason(e.target.value)}>
            <option value="">— Select reason —</option>
            {SH_OVERRIDE_REASONS.partial.map(r => <option key={r}>{r}</option>)}
          </select>
        </Field>
      )}
      {decision === "backorder" && (
        <div className="alert-blue alert-box" style={{fontSize:11}}>
          <span>ⓘ</span>
          <div>Backorder <span className="mono">SO-2026-2454</span> will be created as <b>draft</b> with 10 units of FA5301 · Pierogi ruskie 1kg.</div>
        </div>
      )}
    </Modal>
  );
};

// -------- M-10 Short Pick --------
const ShortPickModal = ({ open, onClose }) => {
  const [decision, setDecision] = React.useState("ship_short");
  const [reason, setReason] = React.useState("");

  return (
    <Modal open={open} onClose={onClose} title="Short pick — FA5100 Kiełbasa śląska on SO-2026-2447" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Confirm</button>
      </>}>
      <Summary rows={[
        { label: "Requested qty", value: "40 kg" },
        { label: "Available at LP-9129", value: "20 kg" },
        { label: "Shortfall", value: "20 kg", emphasis: true },
      ]}/>
      <Field label="Decision" required>
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          <label style={{fontSize:12}}><input type="radio" name="sd" value="ship_short" checked={decision === "ship_short"} onChange={e=>setDecision(e.target.value)}/> <b>Ship short</b> — mark line short, partial flag on SO</label>
          <label style={{fontSize:12}}><input type="radio" name="sd" value="substitute" checked={decision === "substitute"} onChange={e=>setDecision(e.target.value)}/> <b>Substitute with alternate LP</b> — show other FEFO-sorted LPs</label>
          <label style={{fontSize:12}}><input type="radio" name="sd" value="wait" checked={decision === "wait"} onChange={e=>setDecision(e.target.value)}/> <b>Wait for restock</b> — line pending, wave continues</label>
        </div>
      </Field>
      {decision === "substitute" && (
        <div className="card" style={{marginTop:10, padding:0}}>
          <table>
            <thead><tr><th>LP</th><th>Batch</th><th>Expiry</th><th style={{textAlign:"right"}}>Qty</th><th>FEFO</th><th></th></tr></thead>
            <tbody>
              <tr><td className="mono" style={{color:"var(--blue)"}}>LP-9128</td><td className="mono" style={{fontSize:10}}>WO-2026-0115-B1</td><td className="mono" style={{fontSize:11}}>2026-07-02</td><td className="num mono">100</td><td><FefoRank rank={4}/></td><td><button className="btn btn-primary btn-sm">Select</button></td></tr>
            </tbody>
          </table>
        </div>
      )}
      {(decision === "ship_short" || decision === "wait") && (
        <Field label="Reason code" required>
          <select value={reason} onChange={e=>setReason(e.target.value)}>
            <option value="">— Select reason —</option>
            {SH_OVERRIDE_REASONS.short_pick.map(r => <option key={r}>{r}</option>)}
          </select>
        </Field>
      )}
      <div className="alert-amber alert-box" style={{fontSize:11}}>
        <span>⚠</span>
        <div><b>Downstream:</b> If ship-short, SO-2026-2447 → <span className="mono">partial</span>. Customer receives 20 kg instead of 40 kg. 1 backorder item queued.</div>
      </div>
    </Modal>
  );
};

// -------- M-11 Cancel SO --------
const SoCancelModal = ({ open, onClose }) => {
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const valid = reason && notes.length >= 10 && confirmed;

  return (
    <Modal open={open} onClose={onClose} title="Cancel sales order — SO-2026-2451" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Cancel order</button>
      </>}>
      <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span>
        <div><b>This will release all LP reservations (05-WAREHOUSE) and cannot be undone.</b> The SO record is preserved for audit. <b>6 LP(s)</b> will be released back to available inventory.</div>
      </div>
      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select reason —</option>
          {SH_OVERRIDE_REASONS.cancel.map(r => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Notes" required help="min 10 characters">
        <ReasonInput value={notes} onChange={setNotes} minLength={10} placeholder="Explain cancellation..."/>
      </Field>
      <label style={{fontSize:12, display:"block", marginTop:10}}>
        <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I understand this will release all inventory allocations.
      </label>
      <div style={{fontSize:11, color:"var(--muted)", marginTop:8, fontStyle:"italic"}}>V-SHIP-SO-07: cancel blocked once SO is shipped or delivered.</div>
    </Modal>
  );
};

// -------- M-12 Wave Release Confirm --------
const WaveReleaseModal = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Release wave WV-2026-00017 to pickers" size="default"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>Release to pickers</button>
    </>}>
    <Summary rows={[
      { label: "Wave", value: "WV-2026-00017" },
      { label: "Priority", value: "2", mono: false },
      { label: "SO count", value: "2" },
      { label: "Lines", value: "7" },
      { label: "Estimated pick time", value: "~25 min", mono: false },
      { label: "Zones", value: "Dispatch", mono: false },
    ]}/>
    <Field label="Assign picker(s) — optional"><select><option>Auto-assign (first available)</option><option>J.Nowak</option><option>K.Kowal</option><option>M.Wolski</option></select></Field>
    <label style={{fontSize:12, display:"block", marginTop:10}}>
      <input type="checkbox" defaultChecked/> Notify assigned pickers on scanner
    </label>
    <div className="alert-blue alert-box" style={{fontSize:11}}>
      <span>ⓘ</span>
      <div>Wave moves to <b>Released</b> column. Scanner pickers see it in their queue immediately via <span className="mono">/scanner/shipping/pick</span>.</div>
    </div>
  </Modal>
);

// -------- M-13 Pick Reassign --------
const PickReassignModal = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Reassign picker — PL-2026-00042" size="default"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>Reassign</button>
    </>}>
    <Field label="Current picker"><input value="J.Nowak" readOnly style={{background:"var(--gray-100)"}}/></Field>
    <Field label="New picker" required><select><option>K.Kowal (on shift)</option><option>M.Wolski (on shift)</option><option>P.Nowicki (available)</option></select></Field>
    <Field label="Reason"><textarea placeholder="Optional reason..."/></Field>
  </Modal>
);

// -------- M-14 Pack Close Carton --------
const PackCloseModal = ({ open, onClose }) => {
  const [confirmed, setConfirmed] = React.useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Close box — generate SSCC" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Keep open</button>
        <button className="btn btn-primary btn-sm" disabled={!confirmed} onClick={onClose}>Close box &amp; generate SSCC</button>
      </>}>
      <Summary rows={[
        { label: "Box", value: "Box 3 of 4" },
        { label: "Shipment", value: "SH-2026-00046" },
        { label: "Items in box", value: "1 LP (LP-9160, 24 ea)" },
        { label: "Total weight", value: "11.0 kg" },
        { label: "Dimensions", value: "60×40×30 cm", mono: false },
        { label: "Next SSCC (preview)", value: "0 5012345 00000048 1" },
      ]}/>
      <div className="alert-amber alert-box" style={{fontSize:11}}>
        <span>⚠</span>
        <div><b>Catch weight variance:</b> nominal 10.8 kg · actual 11.0 kg · +1.9% <span style={{color:"var(--green-700)"}}>✓ within tolerance (5%)</span></div>
      </div>
      <Field label="Confirm box weight (kg)" required help="V-SHIP-PACK-02"><input type="number" step="0.1" defaultValue="11.0" className="num"/></Field>
      <label style={{fontSize:12, display:"block", marginTop:10}}>
        <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm all items are correctly packed and weight is verified.
      </label>
      <div style={{fontSize:11, color:"var(--muted)", marginTop:8}}>
        On close: SSCC generated (atomic sequence + GS1 prefix + mod-10 check digit · V-SHIP-LBL-02) → ZPL label sent to <span className="mono">ZPL-SH-01</span>.
      </div>
    </Modal>
  );
};

// -------- M-15 Ship Confirm --------
const ShipConfirmModal = ({ open, onClose }) => {
  const [confirmed, setConfirmed] = React.useState(false);
  const [showPayload, setShowPayload] = React.useState(false);

  const checks = [
    { k: "boxes_sscc",  l: "All boxes have SSCC (V-SHIP-SHIP-01)", pass: true },
    { k: "bol",         l: "BOL generated (V-SHIP-SHIP-02)",        pass: true },
    { k: "bol_signed",  l: "BOL signed (optional P1)",                pass: false, optional: true },
    { k: "qa",          l: "No critical QA holds (V-SHIP-SHIP-03)",   pass: true },
    { k: "picks",       l: "All pick lines resolved",                 pass: true },
  ];
  const allPass = checks.filter(c => !c.optional).every(c => c.pass);

  return (
    <Modal open={open} onClose={onClose} title="Confirm shipment — SH-2026-00045" size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-success btn-sm" disabled={!allPass || !confirmed} onClick={onClose}>🚚 Confirm shipment</button>
      </>}>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <div>
          <div className="label" style={{marginBottom:6}}>Shipment summary</div>
          <Summary rows={[
            { label: "Shipment", value: "SH-2026-00045" },
            { label: "Sales order", value: "SO-2026-2445" },
            { label: "Customer", value: "Lidl Polska", mono: false },
            { label: "Carrier", value: "DHL Freight · Express 24h", mono: false },
            { label: "Boxes", value: "4 (all SSCC)" },
            { label: "Total weight", value: "124.6 kg" },
            { label: "BOL status", value: "Generated + Signed ✓", mono: false, emphasis: true },
            { label: "D365 push", value: "Will be queued on confirm", mono: false },
          ]}/>

          <Field label="Actual ship date" required><input type="date" defaultValue="2026-04-21"/></Field>
          <Field label="Carrier pro number"><input defaultValue="DHLPL44189" className="mono"/></Field>
          <Field label="Driver name"><input defaultValue="A. Kowalczyk"/></Field>
          <Field label="Notes"><textarea placeholder="Optional..."/></Field>
        </div>
        <div>
          <div className="label" style={{marginBottom:6}}>Pre-condition checklist</div>
          <div className="card" style={{padding:10}}>
            {checks.map(c => (
              <div key={c.k} className={"pack-checklist-row " + (c.pass ? "pass" : c.optional ? "" : "fail")}>
                <span className="pclh-ic">{c.pass ? "✓" : c.optional ? "○" : "✕"}</span>
                <span>{c.l}</span>
                {c.optional && !c.pass && <span style={{marginLeft:"auto", fontSize:10, color:"var(--muted)"}}>(optional P1)</span>}
              </div>
            ))}
          </div>

          <div className="alert-blue alert-box" style={{fontSize:11, marginTop:10}}>
            <span>ⓘ</span>
            <div>
              <b>On confirm (transactional):</b>
              <ol style={{marginTop:4, paddingLeft:16, fontSize:10, lineHeight:1.5}}>
                <li>shipments.status → <span className="mono">shipped</span>, shipped_at = NOW()</li>
                <li>license_plates → <span className="mono">status=shipped</span> (from 05-WAREHOUSE)</li>
                <li>INSERT <span className="mono">shipping_outbox_events</span> (R14 UUID v7 idempotency)</li>
                <li>Dispatcher worker → D365 OData (retry 5m/30m/2h/12h/24h)</li>
                <li>Flag-gated: <span className="mono">d365_shipping_push_enabled=ON</span></li>
              </ol>
            </div>
          </div>

          <button className="btn btn-ghost btn-sm" style={{marginTop:8}} onClick={()=>setShowPayload(!showPayload)}>{showPayload ? "▲ Hide" : "▼ Show"} D365 outbox payload preview</button>
          {showPayload && (
            <pre style={{marginTop:8, padding:10, background:"var(--gray-050)", fontSize:10, fontFamily:"var(--font-mono)", borderRadius:4, lineHeight:1.5, overflowX:"auto"}}>{`Event: shipment.confirmed
idempotencyKey: 018fa2b3-...-uuid-v7
dataAreaId: FNOR
shipmentId: SH-2026-00045
customerAccount: LIDL-PL-0012
warehouse: ApexDG
lines: [
  { lineNum:1, itemId:"FA5100", qty:120, unitId:"ea" },
  { lineNum:2, itemId:"FA5200", qty:80,  unitId:"ea" },
]
boxes: [
  { sscc:"005012345000000433", weight:31.2 },
  ...
]
shippedAt: 2026-04-21T11:18:00Z`}</pre>
          )}

          <label style={{fontSize:12, display:"block", marginTop:10}}>
            <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm this shipment is complete and ready for dispatch.
          </label>
        </div>
      </div>
    </Modal>
  );
};

// -------- M-16 SSCC Preview + Reprint --------
const SsccPreviewModal = ({ open, onClose, data }) => {
  const s = data || { sscc: "0 5012345 00000045 7", shipment: "SH-2026-00045", box: 3, customer: "Lidl Polska" };
  const [reason, setReason] = React.useState("");
  return (
    <Modal open={open} onClose={onClose} title={"SSCC label · " + s.sscc} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Reprint</button>
      </>}>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:14}}>
        <div>
          <SsccLabelPreview sscc={s.sscc} shipment={s.shipment} box={s.box} customer={s.customer} product="FA5100 Kiełbasa śląska 450g" batch="WO-2026-0108-B1" expiry="2026-06-14" weight={10.8} allergens={["milk"]}/>
        </div>
        <div>
          <Summary rows={[
            { label: "SSCC", value: s.sscc },
            { label: "Shipment", value: s.shipment },
            { label: "Box#", value: s.box },
            { label: "Customer", value: s.customer, mono: false },
            { label: "GS1 prefix", value: "5012345" },
            { label: "Check digit", value: s.sscc.slice(-1) + " (mod-10 valid ✓)" },
            { label: "Generated", value: "2026-04-21 10:58" },
          ]}/>
          <Field label="Reprint reason" required>
            <select value={reason} onChange={e=>setReason(e.target.value)}>
              <option value="">— Select reason —</option>
              {SH_OVERRIDE_REASONS.reprint.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Printer"><select>{SH_PRINTERS.map(p => <option key={p.id} disabled={!p.online}>{p.id} · {p.online ? "Online" : "Offline"}</option>)}</select></Field>
          <Field label="Copies"><input type="number" defaultValue="1" min="1" max="10" className="num"/></Field>
          <div style={{fontSize:11, color:"var(--muted)"}}>Reprint will be logged to <span className="mono">shipping_audit_log</span>.</div>
        </div>
      </div>
    </Modal>
  );
};

// -------- M-17 Packing Slip Regenerate --------
const SlipRegenModal = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Regenerate packing slip" size="sm"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>Regenerate</button>
    </>}>
    <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
      <span>⚠</span>
      <div><b>Regenerating will replace the current slip.</b> Previous version will be archived.</div>
    </div>
    <div style={{fontSize:12, padding:"8px 12px", background:"var(--gray-050)", borderRadius:4}}>
      <b>Stale reason:</b> Box 3 weight was updated after slip was generated (2026-04-21 14:12).
    </div>
    <Field label="Reason (optional)"><textarea placeholder="Optional context..."/></Field>
  </Modal>
);

// -------- M-18 BOL Sign-off upload --------
const BolSignModal = ({ open, onClose, data }) => {
  const [hasFile, setHasFile] = React.useState(false);
  return (
    <Modal open={open} onClose={onClose} title={"Upload signed BOL — " + (data?.shipment || "SH-2026-00043")} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!hasFile} onClick={onClose}>⇪ Upload &amp; hash</button>
      </>}>
      <div style={{border:"2px dashed var(--border)", borderRadius:6, padding:30, textAlign:"center", cursor:"pointer", background:"var(--gray-050)"}} onClick={()=>setHasFile(true)}>
        {!hasFile ? <>
          <div style={{fontSize:32}}>📄</div>
          <div style={{fontSize:13, marginTop:6}}>Drag &amp; drop signed BOL PDF / image</div>
          <div style={{fontSize:11, color:"var(--muted)", marginTop:4}}>Accepts PDF / JPG / PNG · max 10 MB</div>
        </> : <>
          <div style={{fontSize:32, color:"var(--green)"}}>✓</div>
          <div style={{fontSize:13, marginTop:6}}><b className="mono">signed_bol_SH-2026-00043.pdf</b> (1.2 MB)</div>
          <div style={{fontSize:11, color:"var(--green-700)", marginTop:4}}>File ready to upload</div>
        </>}
      </div>
      <div className="ff-inline" style={{marginTop:10}}>
        <Field label="Driver name" required><input defaultValue="A. Kowalczyk"/></Field>
        <Field label="Signature date" required><input type="date" defaultValue="2026-04-21"/></Field>
      </div>
      <Field label="Notes"><textarea placeholder="Optional..."/></Field>
      <div className="alert-blue alert-box" style={{fontSize:11}}>
        <span>ⓘ</span>
        <div><b>On upload:</b> SHA-256 hash computed server-side, stored in <span className="mono">shipments.bol_signed_pdf_hash</span> + Supabase Storage (BRCGS 7-year retention · <b>deletion disabled</b>). P2: 21 CFR Part 11 e-signature + PIN re-verify.</div>
      </div>
    </Modal>
  );
};

// -------- M-19 Carrier create/edit --------
const CarrierEditModal = ({ open, onClose, data }) => (
  <Modal open={open} onClose={onClose} title={data ? "Edit carrier — " + data.name : "Add carrier"} size="default"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>Save carrier</button>
    </>}>
    <Field label="Carrier name" required><input defaultValue={data?.name} placeholder="DHL Freight"/></Field>
    <Field label="Service levels" help="Comma-separated"><input defaultValue={data?.service || "Express 24h, Economy 48h"}/></Field>
    <Field label="Rate basis"><select defaultValue={data?.rateBasis || "Manual"}><option>Manual</option><option>Weight</option><option>Zone</option></select></Field>
    <Field label="Tracking URL template" help="Use {pro} placeholder"><input defaultValue={data?.trackingTemplate} className="mono" placeholder="https://track.dhl.com/{pro}"/></Field>
    <Field label="Default carrier"><label><input type="checkbox" defaultChecked={data?.isDefault}/> Use as default</label></Field>
    <Field label="Active"><label><input type="checkbox" defaultChecked={data?.active ?? true}/> Carrier is active</label></Field>
    <div className="alert-blue alert-box" style={{fontSize:11}}><span>ⓘ</span><div>API integration (rate shopping, label generation, tracking webhooks, POD) is Phase 2 (EPIC 11-F).</div></div>
  </Modal>
);

// -------- M-20 Release Allocation --------
const ReleaseAllocModal = ({ open, onClose, data }) => {
  const [reason, setReason] = React.useState("");
  return (
    <Modal open={open} onClose={onClose} title={"Release allocation" + (data?.lp ? " — " + data.lp : "")} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!reason} onClick={onClose}>Release allocation</button>
      </>}>
      <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span>
        <div>This will release the hard-lock on this LP. LP returns to <span className="mono">status=available</span> in 05-WAREHOUSE. Action is audit-logged.</div>
      </div>
      <Summary rows={[
        { label: "LP", value: data?.lp || "LP-9120" },
        { label: "Reserved qty", value: (data?.qty || 60) + " kg" },
        { label: "For SO line", value: "SO-2026-2451 line " + (data?.line || 1) },
      ]}/>
      <Field label="Reason code" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select reason —</option>
          <option>so_cancelled</option><option>allocation_correction</option><option>customer_change</option><option>other</option>
        </select>
      </Field>
    </Modal>
  );
};

// -------- M-21 Allergen override (hold release) --------
const AllergenOverrideModal = ({ open, onClose }) => {
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const valid = reason && notes.length >= 20;
  return (
    <Modal open={open} onClose={onClose} title="Allergen override — SO-2026-2452" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Override allergen hold</button>
      </>}>
      <div className="alert-red alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>⚠</span>
        <div><b>Allergen conflict:</b> Product <b>FA5301 Pierogi ruskie</b> contains <b>gluten</b>. Customer <b>Biedronka (JMP)</b> requires gluten declared bold on packing slip (V-SHIP-LBL-01).</div>
      </div>
      <Field label="QA approver (shipping_qa role)" required><input value="QA.Wiśniewski" readOnly style={{background:"var(--gray-100)"}}/></Field>
      <Field label="Override reason" required>
        <select value={reason} onChange={e=>setReason(e.target.value)}>
          <option value="">— Select —</option>
          <option>customer_accepts_declared_label</option>
          <option>supervisor_direction</option>
          <option>regulatory_exemption</option>
          <option>other</option>
        </select>
      </Field>
      <Field label="Notes" required help="min 20 characters — high-audit">
        <ReasonInput value={notes} onChange={setNotes} minLength={20} placeholder="Explain override rationale for compliance audit..."/>
      </Field>
      <div className="alert-blue alert-box" style={{fontSize:11}}>
        <span>ⓘ</span>
        <div>P1: reason code + notes. <b>P2:</b> 21 CFR Part 11 e-signature + PIN re-verify + SHA-256 audit_hash stored in <span className="mono">allergen_overrides</span> table.</div>
      </div>
    </Modal>
  );
};

// ============ MODAL GALLERY ============
const MODAL_CATALOG = [
  { key: "customerCreate",    name: "M-01 · Customer create / edit",        pattern: "Simple form",                              comp: CustomerCreateModal },
  { key: "address",           name: "M-02 · Address create / edit",         pattern: "Simple form",                              comp: AddressModal },
  { key: "allergen",          name: "M-03 · Allergen restriction add",      pattern: "Simple form",                              comp: AllergenRestrictionModal },
  { key: "soCreate",          name: "M-04 · SO create (4-step wizard)",     pattern: "Wizard + allergen gate",                   comp: SoCreateModal },
  { key: "soLineAdd",         name: "M-05 · SO line add / edit",            pattern: "Simple form + default price",              comp: SoLineAddModal },
  { key: "allocOverride",     name: "M-06 · Allocation override",           pattern: "FEFO compare + reason",                    comp: AllocOverrideModal },
  { key: "holdPlace",         name: "M-07 · Hold place",                    pattern: "Typed hold + reason",                      comp: HoldPlaceModal },
  { key: "holdRelease",       name: "M-08 · Hold release",                  pattern: "Destructive + reason + role gate",         comp: HoldReleaseModal },
  { key: "partialFulfil",     name: "M-09 · Partial fulfillment decision",  pattern: "Three-choice + downstream",                comp: PartialFulfilModal },
  { key: "shortPick",         name: "M-10 · Short pick resolve",            pattern: "Three-choice + sub-LP picker",             comp: ShortPickModal },
  { key: "soCancel",          name: "M-11 · Cancel SO",                     pattern: "Destructive + reason + LP release",        comp: SoCancelModal },
  { key: "waveRelease",       name: "M-12 · Wave release confirm",          pattern: "Summary + optional picker assign",         comp: WaveReleaseModal },
  { key: "pickReassign",      name: "M-13 · Pick reassign",                 pattern: "Simple form",                              comp: PickReassignModal },
  { key: "packClose",         name: "M-14 · Pack close carton",             pattern: "Summary + CW variance + SSCC gen",         comp: PackCloseModal },
  { key: "shipConfirm",       name: "M-15 · Confirm shipment",              pattern: "Guards checklist + D365 payload preview",  comp: ShipConfirmModal },
  { key: "ssccPreview",       name: "M-16 · SSCC preview + reprint",        pattern: "Label preview + reprint reason",           comp: SsccPreviewModal },
  { key: "slipRegen",         name: "M-17 · Packing slip regenerate",       pattern: "Warning + confirm",                        comp: SlipRegenModal },
  { key: "bolSign",           name: "M-18 · BOL sign-off upload",           pattern: "File upload + SHA-256 hash",               comp: BolSignModal },
  { key: "carrierEdit",       name: "M-19 · Carrier create / edit",         pattern: "Simple form",                              comp: CarrierEditModal },
  { key: "releaseAlloc",      name: "M-20 · Release allocation",            pattern: "Destructive + reason",                     comp: ReleaseAllocModal },
  { key: "allergenOverride",  name: "M-21 · Allergen override (QA)",        pattern: "High-audit + min-20 reason",               comp: AllergenOverrideModal },
];

const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Shipping</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery</h1>
          <div className="muted" style={{fontSize:12}}>{MODAL_CATALOG.length} components · follows <span className="mono">_shared/MODAL-SCHEMA.md</span> · SO lifecycle + allergen + allocation + pick/pack + dispatch</div>
        </div>
      </div>

      <div className="alert-blue alert-box" style={{marginBottom:14, fontSize:12}}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> Each uses shared primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>).
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
  CustomerCreateModal, AddressModal, AllergenRestrictionModal,
  SoCreateModal, SoLineAddModal,
  AllocOverrideModal, HoldPlaceModal, HoldReleaseModal,
  PartialFulfilModal, ShortPickModal, SoCancelModal,
  WaveReleaseModal, PickReassignModal,
  PackCloseModal, ShipConfirmModal,
  SsccPreviewModal, SlipRegenModal, BolSignModal,
  CarrierEditModal, ReleaseAllocModal, AllergenOverrideModal,
  ModalGallery, MODAL_CATALOG,
});
