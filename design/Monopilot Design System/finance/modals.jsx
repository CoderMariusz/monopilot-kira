// ============================================================
// FINANCE MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Modal inventory (13 components + gallery):
//   MODAL-01 Standard Cost Create / Edit
//   MODAL-02 Approve Standard Cost (e-signature PIN)
//   MODAL-03 Cost History (version compare)
//   MODAL-04 Bulk Import CSV (3-step wizard)
//   MODAL-05 FX Rate Override
//   MODAL-06 FIFO Layer Drill-down
//   MODAL-07 Variance Note
//   MODAL-08 D365 DLQ Replay
//   MODAL-09 D365 DLQ Manual Resolve
//   MODAL-10 Export Report
//   MODAL-11 Supersede Standard Cost
//   MODAL-12 Fiscal Period Lock Confirmation
//   MODAL-13 Cost Center / GL Mapping Create / Edit
// ============================================================

// -------- MODAL-01: Standard Cost Create / Edit --------
const StdCostCreateModal = ({ open, onClose, data }) => {
  const editing = !!data && data.id;
  const [item, setItem] = React.useState(data?.itemCode || "");
  const [itemType, setItemType] = React.useState(data?.itemType || "FA");
  const [mat, setMat] = React.useState(data?.mat || 2.5);
  const [lab, setLab] = React.useState(data?.lab || 0.4);
  const [oh, setOh] = React.useState(data?.oh || 0.6);
  const [effFrom, setEffFrom] = React.useState(data?.effFrom || "2026-05-01");
  const [basis, setBasis] = React.useState(data?.basis || "Quoted");
  const [notes, setNotes] = React.useState(data?.notes || "");
  const total = +mat + +lab + +oh;
  const totalPct = total > 0 ? { mat: mat/total*100, lab: lab/total*100, oh: oh/total*100 } : { mat:0, lab:0, oh:0 };
  const changePct = data?.total ? ((total - data.total) / data.total * 100) : 0;
  const warnChange = Math.abs(changePct) > 20 && editing;
  const valid = item && total > 0 && effFrom;

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit Standard Cost — ${data?.itemName || item}` : "Create Standard Cost"} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-secondary btn-sm" disabled={!valid} onClick={onClose}>Save as Draft</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Save &amp; Submit for Approval</button>
      </>}>
      {warnChange && (
        <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:12}}>
          <span>⚠</span>
          <div>This cost is {changePct > 0 ? "+" : ""}{changePct.toFixed(1)}% vs the current approved standard (V-FIN-STD-06). A warning will be logged. Dual sign-off will be required in Phase 2.</div>
        </div>
      )}
      <div className="ff-inline">
        <Field label="Product / Item" required>
          <select value={item} onChange={e=>setItem(e.target.value)}>
            <option value="">— Select item —</option>
            <option value="FG-NUGGET-1K">FG-NUGGET-1K — Chicken Nuggets 1 kg (FA)</option>
            <option value="FG-FISH-500">FG-FISH-500 — Fish Fingers 500g (FA)</option>
            <option value="FG-PORK-500">FG-PORK-500 — Pork Sausages 500g (FA)</option>
            <option value="RM-BREAST-001">RM-BREAST-001 — Chicken Breast (RM)</option>
            <option value="RM-FLOUR-001">RM-FLOUR-001 — Wheat Flour (RM)</option>
          </select>
        </Field>
        <Field label="Item Type"><div style={{padding:"6px 0"}}><ItemTypeBadge t={itemType}/></div></Field>
      </div>
      <div className="ff-inline">
        <Field label="Effective From" required help="V-FIN-STD-01 — must not conflict with existing approved record for same item"><input type="date" value={effFrom} onChange={e=>setEffFrom(e.target.value)}/></Field>
        <Field label="Effective To" help="Leave blank for open-ended"><input type="date"/></Field>
      </div>
      <div className="ff-inline">
        <Field label="Currency" required><select defaultValue="GBP"><option>GBP — British Pound Sterling (base)</option></select></Field>
        <Field label="Unit of Measure" required><select defaultValue="KG"><option>KG</option><option>L</option><option>Pcs</option><option>g</option></select></Field>
      </div>
      <Field label="Cost Basis" required>
        <select value={basis} onChange={e=>setBasis(e.target.value)}>
          <option>Quoted</option><option>Historical</option><option>Calculated</option><option>Imported D365</option>
        </select>
      </Field>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10}}>
        <Field label="Material Cost" required><input type="number" step="0.0001" value={mat} onChange={e=>setMat(e.target.value)} className="num"/></Field>
        <Field label="Labor Cost" required><input type="number" step="0.0001" value={lab} onChange={e=>setLab(e.target.value)} className="num"/></Field>
        <Field label="Overhead Cost" required><input type="number" step="0.0001" value={oh} onChange={e=>setOh(e.target.value)} className="num"/></Field>
      </div>
      <Field label="Total Cost (calculated)">
        <div style={{padding:"8px 10px", background:"var(--gray-050)", borderRadius:4, fontFamily:"var(--font-mono)", fontSize:15, fontWeight:600}}>
          £ {total.toFixed(4)} GBP <span style={{fontSize:11, color:"var(--muted)", fontWeight:400, marginLeft:10}}>(material + labor + overhead)</span>
        </div>
      </Field>
      <Field label="Cost Breakdown">
        <div className="stack-bar">
          <span className="sb-seg mat" style={{width: totalPct.mat + "%"}}/>
          <span className="sb-seg lab" style={{width: totalPct.lab + "%"}}/>
          <span className="sb-seg oh"  style={{width: totalPct.oh  + "%"}}/>
        </div>
        <div className="stack-legend" style={{marginTop:6}}>
          <span className="sl-item"><span className="sl-dot mat"/> Mat {totalPct.mat.toFixed(0)}%</span>
          <span className="sl-item"><span className="sl-dot lab"/> Lab {totalPct.lab.toFixed(0)}%</span>
          <span className="sl-item"><span className="sl-dot oh"/> OH {totalPct.oh.toFixed(0)}%</span>
        </div>
      </Field>
      <Field label="Notes (optional, max 500)"><textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} placeholder="e.g. Q2 2026 standard cost — approved by treasury team."/></Field>
    </Modal>
  );
};

// -------- MODAL-02: Approve Standard Cost (e-signature) --------
const ApproveStdCostModal = ({ open, onClose, data }) => {
  const rec = data || FIN_STD_COSTS.find(r => r.status === "pending");
  const oldRec = FIN_STD_COSTS.find(r => r.itemCode === rec?.itemCode && r.status === "active");
  const [reason, setReason] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [ack, setAck] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const valid = reason.length >= 10 && pin.length === 6 && ack;

  const submit = () => setSubmitted(true);
  if (!rec) return null;

  return (
    <Modal open={open} onClose={onClose} title={data?.bulk ? `Bulk Approve Standard Costs (${data.bulk})` : `Approve Standard Cost — ${rec.itemName}`} size="default"
      foot={submitted ? <><button className="btn btn-primary btn-sm" onClick={onClose}>Close</button></> : <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={submit}>Approve</button>
      </>}>
      {submitted ? (
        <div style={{textAlign:"center", padding:30}}>
          <div style={{fontSize:44, color:"var(--green)"}}>✓</div>
          <div style={{fontSize:15, fontWeight:600, marginTop:10}}>Standard cost approved successfully</div>
          <div className="muted" style={{fontSize:12, marginTop:6}}>Effective from {rec.effFrom} · items.cost_per_kg updated to £ {rec.total.toFixed(4)} GBP</div>
          <div className="audit-hash" style={{marginTop:12}}>sha256:9f8e7d6c5b4a3210…</div>
        </div>
      ) : (
        <>
          <Summary rows={[
            { label: "Item",           value: `${rec.itemCode} · ${rec.itemName}` },
            { label: "Total Cost",     value: fmtMoney(rec.total, true), emphasis: true },
            { label: "Effective From", value: rec.effFrom },
            { label: "Effective To",   value: rec.effTo || "Open" },
            { label: "Cost Basis",     value: rec.basis },
          ]}/>
          <div className="fin-section">
            <div className="fin-section-title">Cost components</div>
            <div style={{fontSize:12}}>
              Material: {fmtMoney(rec.mat)} · Labor: {fmtMoney(rec.lab)} · Overhead: {fmtMoney(rec.oh)}
            </div>
          </div>
          {oldRec && (
            <div className="fin-section">
              <div className="fin-section-title">Old vs New cost</div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, fontSize:12}}>
                <div style={{padding:10, background:"var(--gray-050)", borderRadius:4}}>
                  <div className="muted">Current</div>
                  <div className="money">{fmtMoney(oldRec.total)}</div>
                </div>
                <div style={{padding:10, background:"var(--blue-050)", borderRadius:4}}>
                  <div className="muted">New</div>
                  <div className="money">{fmtMoney(rec.total)}</div>
                  <div className={"money " + (rec.total > oldRec.total ? "neg" : "pos")} style={{fontSize:11}}>
                    {rec.total > oldRec.total ? "+" : ""}{((rec.total - oldRec.total) / oldRec.total * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          )}
          <Field label="Approval Reason" required>
            <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="e.g. Annual cost review — raw material price update from supplier quote dated 2026-04-01."/>
          </Field>
          <Field label="Approval PIN" required help="Required for 21 CFR Part 11 e-signature compliance. The hash SHA-256(approver_id + record_id + timestamp + PIN) will be stored immutably.">
            <input type="password" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)} className="pin-input" placeholder="• • • • • •" autoComplete="off"/>
          </Field>
          <div style={{fontSize:12, padding:"10px 12px", background:"var(--blue-050)", borderRadius:4, marginTop:6}}>
            <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I confirm this standard cost is accurate and I am authorised to approve it.</label>
          </div>
        </>
      )}
    </Modal>
  );
};

// -------- MODAL-03: Cost History --------
const CostHistoryModal = ({ open, onClose, data }) => {
  const rec = data || FIN_STD_COSTS[0];
  const history = [
    { v: "v3.0", effFrom: rec.effFrom,  effTo: rec.effTo || "Present", mat: rec.mat,        lab: rec.lab,        oh: rec.oh,        total: rec.total,        status: rec.status, approvedBy: rec.approvedBy || "—", approvedAt: rec.approvedAt || "—", active: true },
    { v: "v2.0", effFrom: "2024-07-01", effTo: "2024-12-31",            mat: rec.mat*0.96,   lab: rec.lab*0.96,   oh: rec.oh*0.96,   total: rec.total*0.96,   status: "superseded", approvedBy: "Sarah McKenzie", approvedAt: "2024-06-25 09:10 UTC" },
    { v: "v1.0", effFrom: "2024-01-01", effTo: "2024-06-30",            mat: rec.mat*0.90,   lab: rec.lab*0.90,   oh: rec.oh*0.90,   total: rec.total*0.90,   status: "superseded", approvedBy: "Sarah McKenzie", approvedAt: "2023-12-20 14:00 UTC" },
  ];

  return (
    <Modal open={open} onClose={onClose} title={`Cost History — ${rec.itemName} (${rec.itemCode})`} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Create New Version</button>
      </>}>
      <div style={{padding:"10px 12px", background:"var(--blue-050)", borderRadius:4, marginBottom:12, fontSize:12}}>
        Current Active Cost: <b className="money">{fmtMoney(rec.total, true)}/KG</b> · Approved by {rec.approvedBy || "Sarah McKenzie"} on {rec.approvedAt?.split(" ")[0] || "2025-01-01"}
      </div>
      <table>
        <thead><tr><th>Version</th><th>Eff. From</th><th>Eff. To</th><th style={{textAlign:"right"}}>Material</th><th style={{textAlign:"right"}}>Labor</th><th style={{textAlign:"right"}}>Overhead</th><th style={{textAlign:"right"}}>Total</th><th>Status</th><th>Approved By</th><th>Approved At</th></tr></thead>
        <tbody>
          {history.map((h, i) => (
            <tr key={h.v} style={{borderLeft: h.active ? "3px solid var(--blue)" : "none"}}>
              <td className="mono" style={{fontWeight:600}}>{h.v}</td>
              <td className="mono" style={{fontSize:11}}>{h.effFrom}</td>
              <td className="mono" style={{fontSize:11}}>{h.effTo}</td>
              <td className="money">{fmtMoney(h.mat)}</td>
              <td className="money">{fmtMoney(h.lab)}</td>
              <td className="money">{fmtMoney(h.oh)}</td>
              <td className="money" style={{fontWeight:600}}>{fmtMoney(h.total)}</td>
              <td><StdStatus s={h.status}/></td>
              <td style={{fontSize:11}}>{h.approvedBy}</td>
              <td className="mono" style={{fontSize:10}}>{h.approvedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="fin-section" style={{marginTop:14}}>
        <div className="fin-section-title">Cost trend (over time)</div>
        <TrendChart
          series={[ history.map(h => h.total * 10000).reverse() ]}
          colors={["#1976D2"]}
          labels={history.map(h => h.v).reverse()}
          yMax={Math.max(...history.map(h=>h.total)) * 1.2 * 10000}
        />
      </div>

      <div className="fin-section">
        <div className="fin-section-title">Version Compare</div>
        <div className="row-flex" style={{marginBottom:10}}>
          <select style={{width:100}}><option>v2.0</option></select>
          <span>vs</span>
          <select style={{width:100}}><option>v3.0</option></select>
          <button className="btn btn-secondary btn-sm">Compare →</button>
        </div>
        <table>
          <thead><tr><th>Component</th><th style={{textAlign:"right"}}>v2.0 (Old)</th><th style={{textAlign:"right"}}>v3.0 (New)</th><th style={{textAlign:"right"}}>Change (GBP)</th><th>Change (%)</th></tr></thead>
          <tbody>
            <tr><td>Material</td><td className="money">{fmtMoney(history[1].mat)}</td><td className="money">{fmtMoney(history[0].mat)}</td><td className="money neg">+{fmtMoney(history[0].mat - history[1].mat)}</td><td className="money neg">+4.2%</td></tr>
            <tr><td>Labor</td><td className="money">{fmtMoney(history[1].lab)}</td><td className="money">{fmtMoney(history[0].lab)}</td><td className="money neg">+{fmtMoney(history[0].lab - history[1].lab)}</td><td className="money neg">+4.2%</td></tr>
            <tr><td>Overhead</td><td className="money">{fmtMoney(history[1].oh)}</td><td className="money">{fmtMoney(history[0].oh)}</td><td className="money neg">+{fmtMoney(history[0].oh - history[1].oh)}</td><td className="money neg">+4.2%</td></tr>
            <tr style={{fontWeight:600, background:"var(--gray-050)"}}><td>Total</td><td className="money">{fmtMoney(history[1].total)}</td><td className="money">{fmtMoney(history[0].total)}</td><td className="money neg">+{fmtMoney(history[0].total - history[1].total)}</td><td className="money neg">+4.2%</td></tr>
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

// -------- MODAL-04: Bulk Import CSV (3-step wizard) --------
const BulkImportModal = ({ open, onClose }) => {
  const [step, setStep] = React.useState("upload");
  const [completed, setCompleted] = React.useState(new Set());
  const [skipErrors, setSkipErrors] = React.useState(true);
  const [submitForApproval, setSubmitForApproval] = React.useState(false);

  const steps = [
    { key: "upload",   label: "Upload" },
    { key: "validate", label: "Map & Validate" },
    { key: "review",   label: "Review & Import" },
  ];
  const goNext = () => {
    setCompleted(new Set([...completed, step]));
    setStep(step === "upload" ? "validate" : step === "validate" ? "review" : "review");
  };
  const goBack = () => setStep(step === "review" ? "validate" : "upload");

  return (
    <Modal open={open} onClose={onClose} title="Bulk Import Standard Costs" size="wide"
      foot={step === "upload" ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={goNext}>Next →</button>
      </> : step === "validate" ? <>
        <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
        <span className="spacer"/>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={goNext}>Next →</button>
      </> : <>
        <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
        <span className="spacer"/>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Import</button>
      </>}>
      <Stepper steps={steps} current={step} completed={completed}/>

      {step === "upload" && (
        <div style={{marginTop:14}}>
          <div style={{border:"2px dashed var(--border)", borderRadius:6, padding:40, textAlign:"center", background:"var(--gray-050)"}}>
            <div style={{fontSize:40, opacity:0.3}}>⇪</div>
            <div style={{fontSize:14, fontWeight:500, marginTop:10}}>Drop CSV or Excel file here, or click to browse</div>
            <div className="muted" style={{fontSize:11, marginTop:4}}>Accepted: .csv, .xlsx · Max 500 rows per import</div>
            <button className="btn btn-secondary btn-sm" style={{marginTop:12}}>Browse files</button>
          </div>
          <div style={{marginTop:14}}>
            <a style={{fontSize:12, color:"var(--blue)", cursor:"pointer"}}>↓ Download Template CSV</a>
            <div className="muted" style={{fontSize:11, marginTop:6}}>
              Template columns: <span className="mono">item_code, item_type, effective_from, effective_to, material_cost, labor_cost, overhead_cost, currency_code, uom, cost_basis, notes</span>
            </div>
          </div>
        </div>
      )}

      {step === "validate" && (
        <div style={{marginTop:14}}>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14}}>
            <div className="card" style={{margin:0, padding:"10px 14px", borderLeft:"3px solid var(--green)"}}><div className="muted" style={{fontSize:11}}>Valid rows</div><div className="money big" style={{fontSize:20, color:"var(--green-700)"}}>48</div></div>
            <div className="card" style={{margin:0, padding:"10px 14px", borderLeft:"3px solid var(--red)"}}><div className="muted" style={{fontSize:11}}>Error rows</div><div className="money big" style={{fontSize:20, color:"var(--red-700)"}}>2</div></div>
            <div className="card" style={{margin:0, padding:"10px 14px", borderLeft:"3px solid var(--amber)"}}><div className="muted" style={{fontSize:11}}>Warnings</div><div className="money big" style={{fontSize:20, color:"var(--amber-700)"}}>3</div></div>
          </div>
          <table>
            <thead><tr><th>Row</th><th>Item Code</th><th>Type</th><th style={{textAlign:"right"}}>Total</th><th>Eff. From</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td className="mono">1</td><td className="mono">FG-NUGGET-1K</td><td><ItemTypeBadge t="FA"/></td><td className="money">{fmtMoney(3.80)}</td><td className="mono" style={{fontSize:11}}>2026-05-01</td><td><span className="badge badge-green" style={{fontSize:9}}>OK</span></td></tr>
              <tr><td className="mono">2</td><td className="mono">FG-FISH-500</td><td><ItemTypeBadge t="FA"/></td><td className="money">{fmtMoney(4.40)}</td><td className="mono" style={{fontSize:11}}>2026-05-01</td><td><span className="badge badge-green" style={{fontSize:9}}>OK</span></td></tr>
              <tr style={{background:"var(--red-050a)"}}><td className="mono">3</td><td className="mono">XX-UNKNOWN</td><td>—</td><td className="money">{fmtMoney(1.00)}</td><td className="mono" style={{fontSize:11}}>2026-05-01</td><td><span style={{fontSize:11, color:"var(--red-700)"}}>item_code not found</span></td></tr>
              <tr><td className="mono">4</td><td className="mono">RM-BREAST-001</td><td><ItemTypeBadge t="RM"/></td><td className="money">{fmtMoney(5.65)}</td><td className="mono" style={{fontSize:11}}>2026-05-01</td><td><span className="badge badge-amber" style={{fontSize:9}}>+8.6% vs current</span></td></tr>
              <tr><td className="mono">5</td><td className="mono">…</td><td>…</td><td className="money">…</td><td>…</td><td>…</td></tr>
            </tbody>
          </table>
          <div style={{marginTop:10, fontSize:12}}>
            <label><input type="checkbox" checked={skipErrors} onChange={e=>setSkipErrors(e.target.checked)}/> Skip error rows and import valid only (48 rows)</label>
          </div>
        </div>
      )}

      {step === "review" && (
        <div style={{marginTop:14}}>
          <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:12}}>
            <span>ⓘ</span>
            <div>
              <b>{skipErrors ? "48" : "50"} standard costs will be created as drafts</b> for review.
              {!skipErrors && " Any errors will fail the import."}
            </div>
          </div>
          <div className="muted" style={{fontSize:11, marginBottom:10}}>2 item_codes were not found in the system and will be skipped.</div>
          <div style={{fontSize:12, padding:"10px 12px", background:"var(--gray-050)", borderRadius:4}}>
            <label><input type="checkbox" checked={submitForApproval} onChange={e=>setSubmitForApproval(e.target.checked)}/> Submit all imported records for approval immediately (Finance Manager only)</label>
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- MODAL-05: FX Rate Override --------
const FxRateOverrideModal = ({ open, onClose, data }) => {
  const r = data || { code: "EUR", rate: 0.850000, sym: "€" };
  const [newRate, setNewRate] = React.useState(r.rate);
  const [effDate, setEffDate] = React.useState("2026-04-21");
  const [source, setSource] = React.useState("manual");
  const [reason, setReason] = React.useState("");
  const valid = newRate > 0 && effDate && (source !== "manual" || reason.length >= 20);

  return (
    <Modal open={open} onClose={onClose} title={`Update Exchange Rate — ${r.code}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Update Rate</button>
      </>}>
      <Summary rows={[
        { label: "Currency",  value: `${r.code} · ${r.name || r.code}` },
        { label: "Current Rate", value: `£ ${fmtRate(r.rate)}`, emphasis: true },
      ]}/>
      <Field label="New Rate (to GBP)" required>
        <input type="number" step="0.000001" value={newRate} onChange={e=>setNewRate(+e.target.value)} className="num mono" style={{fontSize:14}}/>
      </Field>
      <div className="ff-inline">
        <Field label="Effective Date" required help="The date from which this rate applies. Historical transactions are not recalculated."><input type="date" value={effDate} onChange={e=>setEffDate(e.target.value)}/></Field>
        <Field label="Source" required>
          <div className="row-flex">
            <label><input type="radio" name="src" checked={source === "manual"} onChange={()=>setSource("manual")}/> Manual</label>
            <label><input type="radio" name="src" checked={source === "api"} onChange={()=>setSource("api")}/> API Pull</label>
          </div>
        </Field>
      </div>
      {source === "manual" && (
        <Field label="Override Reason" required help="min 20 characters · audit field">
          <ReasonInput value={reason} onChange={setReason} minLength={20} placeholder="e.g. Monthly rate adjustment per treasury team (APR-2026)."/>
        </Field>
      )}
      <div className="muted" style={{fontSize:11, marginTop:8}}>
        This rate will apply to all new cost calculations from the effective date. Historical transactions are not recalculated.
      </div>
    </Modal>
  );
};

// -------- MODAL-06: FIFO Layer Drill-down --------
const FifoLayersModal = ({ open, onClose, data }) => {
  const itemRow = data || FIN_FIFO_LAYERS.item;
  const layers = FIN_FIFO_LAYERS.layers;

  return (
    <Modal open={open} onClose={onClose} title={`FIFO Cost Layers — ${itemRow.code} ${itemRow.name}`} size="wide"
      foot={<><button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button></>}>
      <Summary rows={[
        { label: "Total Qty on Hand", value: `${fmtQty(itemRow.qtyTotal || itemRow.qty)} kg` },
        { label: "Total Value",       value: fmtMoney(itemRow.valueTotal || itemRow.value, true), emphasis: true },
        { label: "Active Layers",     value: itemRow.active || itemRow.layers },
      ]}/>
      <div className="fin-section">
        <div className="fifo-row head">
          <div>#</div>
          <div>Receipt Date / Source</div>
          <div style={{textAlign:"right"}}>Qty In</div>
          <div style={{textAlign:"right"}}>Remaining</div>
          <div style={{textAlign:"right"}}>Unit Cost</div>
          <div style={{textAlign:"right"}}>Layer Value</div>
          <div>Status</div>
        </div>
        {layers.map((l, i) => (
          <div key={i} className={"fifo-row " + (l.exhausted ? "exhausted" : "")}>
            <span className={"fifo-layer-num " + (l.exhausted ? "ex" : "")}>{l.exhausted ? "✕" : l.n}</span>
            <div>
              <div className="mono" style={{fontSize:12}}>{l.date}</div>
              <div className="muted" style={{fontSize:10}}>{l.src} · <span style={{color:"var(--blue)"}}>{l.ref}</span></div>
            </div>
            <div className="money">{fmtQty(l.qtyIn)}</div>
            <div className="money fr-rem">{fmtQty(l.qtyRem)}</div>
            <div className="money">£ {l.unit.toFixed(4)}</div>
            <div className="money" style={{fontWeight:600}}>{fmtMoney(l.value)}</div>
            <div><span className={"badge " + (l.exhausted ? "badge-gray" : "badge-green")} style={{fontSize:9}}>{l.exhausted ? "Exhausted" : "Active"}</span></div>
          </div>
        ))}
      </div>
      <div className="muted" style={{fontSize:11, marginTop:10}}>
        Layers are consumed oldest-first per <span className="mono">receipt_date ASC</span> (FIFO). The next consume will draw from Layer 1 (oldest non-exhausted).
      </div>
    </Modal>
  );
};

// -------- MODAL-07: Variance Note --------
const VarianceNoteModal = ({ open, onClose, data }) => {
  const ctx = data || { wo: "WO-2026-0042", product: "Chicken Nuggets 1 kg" };
  const [cat, setCat] = React.useState("");
  const [note, setNote] = React.useState("");
  const valid = cat && note.length >= 20;

  return (
    <Modal open={open} onClose={onClose} title="Add Variance Note" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Save Note</button>
      </>}>
      <Summary rows={[
        ctx.wo ? { label: "WO", value: ctx.wo, mono: true } : { label: "Item", value: ctx.item || ctx.product },
        ctx.product && { label: "Product", value: ctx.product },
      ].filter(Boolean)}/>
      <Field label="Note Category" required>
        <select value={cat} onChange={e=>setCat(e.target.value)}>
          <option value="">— Select —</option>
          <option>Root Cause</option>
          <option>Supplier Issue</option>
          <option>Production Issue</option>
          <option>Quality Hold</option>
          <option>Planned</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="Note Text" required help="min 20 characters · max 1000">
        <ReasonInput value={note} onChange={setNote} minLength={20} placeholder="e.g. Supplier price increase — new PO price not yet reflected in standard cost. Recommend raising RM-BREAST-001 std cost from £ 5.20 to £ 5.45/kg in next cost roll."/>
      </Field>
    </Modal>
  );
};

// -------- MODAL-08: D365 DLQ Replay --------
const DlqReplayModal = ({ open, onClose, data }) => {
  const r = data || FIN_D365_DLQ[0];
  const [reason, setReason] = React.useState("");
  const valid = reason.length >= 20;
  const permanent = r.category === "permanent";

  return (
    <Modal open={open} onClose={onClose} title={`Replay DLQ Event — ${r.type}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Replay Event</button>
      </>}>
      {permanent && (
        <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:12}}>
          <span>⚠</span>
          <div>This event was categorized as a <b>permanent error (HTTP 4xx)</b>. Replaying may not succeed without fixing the underlying data. Review the error details before proceeding.</div>
        </div>
      )}
      <Summary rows={[
        { label: "DLQ ID",        value: r.id, mono: true },
        { label: "Event Type",    value: r.type, mono: true },
        { label: "Source Event",  value: r.sourceEv, mono: true },
        { label: "Error Category", value: <DlqCategoryBadge c={r.category}/>, mono: false },
        { label: "Attempts",      value: r.attempts },
        { label: "Moved to DLQ",  value: r.movedAt },
      ]}/>
      <Field label="Last Error">
        <div style={{background:"var(--gray-050)", border:"1px solid var(--border)", borderRadius:4, padding:"8px 10px", fontFamily:"var(--font-mono)", fontSize:11, maxHeight:100, overflowY:"auto", color:"var(--red-700)"}}>
          {r.error}
        </div>
      </Field>
      <Field label="Replay Reason" required help="min 20 characters · audit field">
        <ReasonInput value={reason} onChange={setReason} minLength={20} placeholder="e.g. D365 posting period reopened by finance team. Retrying original event."/>
      </Field>
      <div className="muted" style={{fontSize:11, marginTop:8}}>
        A new idempotency key (UUID v7) will be generated. The event will re-enter the outbox with status 'pending' and follow the 6-attempt retry schedule.
      </div>
    </Modal>
  );
};

// -------- MODAL-09: D365 DLQ Manual Resolve --------
const DlqResolveModal = ({ open, onClose, data }) => {
  const r = data || FIN_D365_DLQ[0];
  const [notes, setNotes] = React.useState("");
  const [ack, setAck] = React.useState(false);
  const valid = notes.length >= 30 && ack;

  return (
    <Modal open={open} onClose={onClose} title={`Manually Resolve DLQ Event — ${r.id}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Mark Resolved</button>
      </>}>
      <Summary rows={[
        { label: "DLQ ID",        value: r.id, mono: true },
        { label: "Event Type",    value: r.type, mono: true },
        { label: "Source Event",  value: r.sourceEv, mono: true },
      ]}/>
      <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:10}}>
        <span>ⓘ</span>
        <div>Use this action when the event has been handled manually in D365 (e.g. journal entry posted directly) and the DLQ record should be closed without system replay.</div>
      </div>
      <Field label="Resolution Notes" required help="min 30 characters · audit field">
        <ReasonInput value={notes} onChange={setNotes} minLength={30} placeholder="e.g. Journal MONO-MANUAL-20260421 posted directly in D365 by Finance Manager after reconciliation with ledger. Original batch ID B-6f3a9c21 line 23. No system retry required."/>
      </Field>
      <div style={{fontSize:12, padding:"10px 12px", background:"var(--red-050a)", borderRadius:4, marginTop:6}}>
        <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I confirm this event has been handled and no automatic retry is needed.</label>
      </div>
    </Modal>
  );
};

// -------- MODAL-10: Export Report --------
const ExportReportModal = ({ open, onClose, data }) => {
  const name = data?.name || data?.id || "Report";
  const [fmt, setFmt] = React.useState("CSV");
  const [range, setRange] = React.useState("MTD");

  return (
    <Modal open={open} onClose={onClose} title={`Export — ${name}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Export</button>
      </>}>
      <Field label="Format" required>
        <div className="row-flex">
          <label><input type="radio" name="fmt" checked={fmt === "CSV"} onChange={()=>setFmt("CSV")}/> CSV</label>
          <label><input type="radio" name="fmt" checked={fmt === "PDF"} onChange={()=>setFmt("PDF")}/> PDF</label>
        </div>
      </Field>
      <Field label="Date Range">
        <select value={range} onChange={e=>setRange(e.target.value)}>
          <option>MTD</option>
          <option>Last Month</option>
          <option>QTD</option>
          <option>YTD</option>
          <option>Custom</option>
        </select>
      </Field>
      {range === "Custom" && (
        <div className="ff-inline">
          <Field label="From"><input type="date" defaultValue="2026-04-01"/></Field>
          <Field label="To"><input type="date" defaultValue="2026-04-30"/></Field>
        </div>
      )}
      <Field label="Include filters">
        <div style={{fontSize:12}}>
          <label><input type="checkbox" defaultChecked/> Active cost centers only</label><br/>
          <label><input type="checkbox" defaultChecked/> Variance threshold &gt; £500</label>
        </div>
      </Field>
      <Field label="Notes/Comments (optional)" help="Appears as footer in PDF">
        <textarea placeholder="Any context to include in the export..."/>
      </Field>
      <div className="muted" style={{fontSize:11}}>Export runs asynchronously — you'll receive a download link when ready. Large date ranges may take up to 30 seconds.</div>
    </Modal>
  );
};

// -------- MODAL-11: Supersede Standard Cost --------
const SupersedeModal = ({ open, onClose, data }) => {
  const r = data || FIN_STD_COSTS.find(s => s.status === "active");
  const [supDate, setSupDate] = React.useState("2026-04-30");

  return (
    <Modal open={open} onClose={onClose} title={`Supersede Standard Cost — ${r?.itemName || ""}`} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>Confirm Supersede</button>
      </>}>
      <div className="alert-blue alert-box" style={{fontSize:12, marginBottom:12}}>
        <span>ⓘ</span>
        <div>Superseding will set the <b>effective_to</b> date on the current record and allow you to create a new draft as the replacement. The current record will be marked Superseded once the new record is approved.</div>
      </div>
      <Summary rows={[
        { label: "Item",        value: `${r?.itemCode} · ${r?.itemName}` },
        { label: "Current Cost", value: fmtMoney(r?.total, true) },
        { label: "Effective From", value: r?.effFrom },
        { label: "Status",      value: <StdStatus s={r?.status || "active"}/> },
      ]}/>
      <Field label="Supersede Effective Date" required help="The effective_to date for the current record. Defaults to today."><input type="date" value={supDate} onChange={e=>setSupDate(e.target.value)}/></Field>
      <div style={{fontSize:11, color:"var(--muted)", padding:"10px 12px", background:"var(--gray-050)", borderRadius:4, marginTop:8}}>
        Per 21 CFR Part 11, approved records cannot be modified — only superseded. The original approval record is retained in the audit trail permanently.
      </div>
    </Modal>
  );
};

// -------- MODAL-12: Fiscal Period Lock --------
const PeriodLockModal = ({ open, onClose }) => {
  const [period, setPeriod] = React.useState("March 2026");
  const [reason, setReason] = React.useState("");
  const [pin, setPin] = React.useState("");
  const valid = reason.length >= 20 && pin.length === 6;

  return (
    <Modal open={open} onClose={onClose} title="Lock Fiscal Period" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Lock Period</button>
      </>}>
      <div className="alert-amber alert-box" style={{fontSize:12, marginBottom:12}}>
        <span>⚠</span>
        <div>Locking a fiscal period prevents any new cost records from being created or modified for that period. <b>This action cannot be undone.</b></div>
      </div>
      <Field label="Period to Lock" required>
        <select value={period} onChange={e=>setPeriod(e.target.value)}>
          <option>January 2026</option>
          <option>February 2026</option>
          <option>March 2026</option>
        </select>
      </Field>
      <Field label="Lock Reason" required help="min 20 characters · audit field">
        <ReasonInput value={reason} onChange={setReason} minLength={20} placeholder="e.g. Q1 2026 period closed per statutory reporting deadline. All finance reviews complete."/>
      </Field>
      <Field label="Approval PIN" required help="Required for 21 CFR Part 11 e-signature compliance">
        <input type="password" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)} className="pin-input" placeholder="• • • • • •"/>
      </Field>
    </Modal>
  );
};

// -------- MODAL-13: Cost Center / GL Mapping Create / Edit --------
const CostCenterModal = ({ open, onClose, data }) => {
  const editing = !!data;
  const [code, setCode] = React.useState(data?.cat || "FProd01");
  const [dAccount, setDAccount] = React.useState(data?.dAccount || "5000-ForzDG-MAT");
  const [offset, setOffset] = React.useState(data?.offset || "1400-ForzDG-INV");
  const valid = code && dAccount && offset;

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit GL Mapping — ${data.cat}` : "Add GL Mapping"} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>{editing ? "Save changes" : "Create mapping"}</button>
      </>}>
      <Field label="Cost Category" required>
        <select value={code} onChange={e=>setCode(e.target.value)}>
          <option>Material</option>
          <option>Labor</option>
          <option>Overhead</option>
          <option>Waste</option>
          <option>Freight</option>
        </select>
      </Field>
      <Field label="D365 Account Code" required help="Format: ACCT-DIM1-DIM2"><input value={dAccount} onChange={e=>setDAccount(e.target.value)} className="mono"/></Field>
      <Field label="Offset Account Code" required><input value={offset} onChange={e=>setOffset(e.target.value)} className="mono"/></Field>
      <div className="ff-inline">
        <Field label="D365 Journal Name"><select defaultValue="PROD"><option>PROD</option><option>COGS</option><option>ADJ</option></select></Field>
        <Field label="Active"><label><input type="checkbox" defaultChecked/> Mapping active</label></Field>
      </div>
      <Field label="D365 Dimension Code (optional)"><input className="mono" placeholder="e.g. FProd01"/></Field>
    </Modal>
  );
};

// ============ MODAL GALLERY ============
const MODAL_CATALOG = [
  { key: "stdCostCreate",   name: "MODAL-01 · Standard Cost Create / Edit",     pattern: "Simple form + live total + breakdown bar + >20% warn",  comp: StdCostCreateModal },
  { key: "approveStdCost",  name: "MODAL-02 · Approve Standard Cost (PIN)",     pattern: "E-signature with PIN + audit hash",                      comp: ApproveStdCostModal },
  { key: "costHistory",     name: "MODAL-03 · Cost History + Version Compare",  pattern: "Read-only table + diff + trend chart",                   comp: CostHistoryModal },
  { key: "bulkImport",      name: "MODAL-04 · Bulk Import CSV",                  pattern: "3-step wizard (upload / validate / import)",            comp: BulkImportModal },
  { key: "fxOverride",      name: "MODAL-05 · FX Rate Override",                 pattern: "Simple form + reason (manual only)",                    comp: FxRateOverrideModal },
  { key: "fifoLayers",      name: "MODAL-06 · FIFO Layer Drill-down",            pattern: "Read-only stacked rows + exhausted strikethrough",      comp: FifoLayersModal },
  { key: "varianceNote",    name: "MODAL-07 · Variance Note",                    pattern: "Categorised note + audit",                              comp: VarianceNoteModal },
  { key: "dlqReplay",       name: "MODAL-08 · D365 DLQ Replay",                  pattern: "Destructive with reason + permanent warning",           comp: DlqReplayModal },
  { key: "dlqResolve",      name: "MODAL-09 · D365 DLQ Manual Resolve",          pattern: "Confirm + ack + 30-char reason",                        comp: DlqResolveModal },
  { key: "exportReport",    name: "MODAL-10 · Export Report",                    pattern: "Format/range picker + async download",                  comp: ExportReportModal },
  { key: "supersede",       name: "MODAL-11 · Supersede Standard Cost",          pattern: "Confirm + effective_to date (21 CFR)",                  comp: SupersedeModal },
  { key: "periodLock",      name: "MODAL-12 · Fiscal Period Lock",               pattern: "Destructive + PIN + reason + phase-2",                  comp: PeriodLockModal },
  { key: "costCenter",      name: "MODAL-13 · GL Mapping Create / Edit",         pattern: "Simple form (cost-center / GL account)",                comp: CostCenterModal },
];

const ModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={()=>onNav("dashboard")}>Finance</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery</h1>
          <div className="muted" style={{fontSize:12}}>{MODAL_CATALOG.length} components covering MODAL-01 through MODAL-13 · follows <span className="mono">MODAL-SCHEMA.md</span></div>
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
  StdCostCreateModal, ApproveStdCostModal, CostHistoryModal, BulkImportModal,
  FxRateOverrideModal, FifoLayersModal, VarianceNoteModal,
  DlqReplayModal, DlqResolveModal, ExportReportModal,
  SupersedeModal, PeriodLockModal, CostCenterModal,
  ModalGallery, MODAL_CATALOG,
});
