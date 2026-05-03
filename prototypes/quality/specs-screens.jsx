// ============ QA-003 Specifications + QA-003a Wizard + QA-003b Detail ============

const QaSpecsList = ({ onOpenSpec, onNav, onNewSpec, openModal }) => {
  const [status, setStatus] = React.useState("all");
  const [appliesTo, setAppliesTo] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const visible = QA_SPECS.filter(s =>
    (status === "all" || s.status === status) &&
    (appliesTo === "all" || s.appliesTo === appliesTo) &&
    (!search || s.product.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · Specifications</div>
          <h1 className="page-title">Specifications</h1>
          <div className="muted" style={{fontSize: 12}}>{QA_SPECS.length} specs · {QA_SPECS.filter(s => s.status === "active").length} active · {QA_SPECS.filter(s => s.status === "under_review").length} under review</div>
        </div>
        <div className="row-flex">
          <button className="btn btn-primary btn-sm" onClick={onNewSpec}>＋ Create Specification</button>
        </div>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search product, spec code, parameter…" value={search} onChange={e => setSearch(e.target.value)} style={{width: 260}}/>
        <div className="pills">
          {["all", "active", "draft", "under_review", "expired", "superseded"].map(s => (
            <button key={s} className={"pill " + (status === s ? "on" : "")} onClick={() => setStatus(s)}>{s === "all" ? "All" : s.replace("_", " ")}</button>
          ))}
        </div>
        <div className="pills">
          {["all", "incoming", "inprocess", "final"].map(a => (
            <button key={a} className={"pill " + (appliesTo === a ? "on" : "")} onClick={() => setAppliesTo(a)}>{a === "all" ? "All" : a}</button>
          ))}
        </div>
        <span className="spacer"></span>
        <button className="clear-all" onClick={() => { setSearch(""); setStatus("all"); setAppliesTo("all"); }}>Clear</button>
        <span className="muted" style={{fontSize: 12}}>{visible.length} rows</span>
      </div>

      <div className="card" style={{padding: 0}}>
        <table>
          <thead>
            <tr>
              <th>Product</th><th>Spec code</th><th>Version</th><th>Status</th>
              <th>Effective from</th><th>Effective until</th><th>Parameters</th>
              <th>Approved by</th><th>Regulation</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => {
              const expiringSoon = s.effUntil && s.effUntil < "2026-05-21" && s.status === "active";
              const isSuperseded = s.status === "superseded";
              return (
                <tr key={s.id} style={{opacity: isSuperseded ? 0.6 : 1, cursor: "pointer"}} onClick={() => onOpenSpec(s.id)}>
                  <td style={{fontSize: 11}}>{s.product}</td>
                  <td><span className="dcode">{s.id}</span></td>
                  <td className="mono" style={{textDecoration: isSuperseded ? "line-through" : "none", fontWeight: 600}}>v{s.version}</td>
                  <td><StatusBadge s={s.status}/></td>
                  <td className="mono" style={{fontSize: 11}}>{s.effFrom}</td>
                  <td className="mono" style={{fontSize: 11, color: expiringSoon ? "var(--amber-700)" : "var(--text)"}}>{s.effUntil || "—"}</td>
                  <td className="mono" style={{fontSize: 11}}>{s.params} <span style={{fontWeight: 700, color: s.critical > 0 ? "var(--red-700)" : "var(--muted)"}}>({s.critical} critical)</span></td>
                  <td style={{fontSize: 11}}>{s.approvedBy ? <><div>{s.approvedBy}</div><div className="muted" style={{fontSize: 10}}>{s.approvedAt}</div></> : <span className="muted">—</span>}</td>
                  <td><RegTags regs={s.regs}/></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onOpenSpec(s.id)}>View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

// ============ QA-003a Specification Wizard (3-step) ============
const QaSpecWizard = ({ onCancel, onNav, openModal }) => {
  const [step, setStep] = React.useState("header");
  const [completed, setCompleted] = React.useState(new Set());
  const [header, setHeader] = React.useState({
    product: "", specCode: "", appliesTo: "incoming", effFrom: "2026-04-21", effUntil: "",
    regs: new Set(["EU 1169"]), refDocs: "", notes: "",
  });
  const [params, setParams] = React.useState([]);
  const [newParam, setNewParam] = React.useState({ name: "", type: "Measurement", target: "", min: "", max: "", unit: "", method: "", equipment: "", critical: false });

  const steps = [{ key: "header", label: "1. Header" }, { key: "params", label: "2. Parameters" }, { key: "review", label: "3. Review" }];

  const toggleReg = r => {
    const n = new Set(header.regs); if (n.has(r)) n.delete(r); else n.add(r); setHeader({ ...header, regs: n });
  };

  const addParam = () => {
    if (!newParam.name || !newParam.method) return;
    setParams([...params, { ...newParam }]);
    setNewParam({ name: "", type: "Measurement", target: "", min: "", max: "", unit: "", method: "", equipment: "", critical: false });
  };
  const removeParam = i => setParams(params.filter((_, j) => j !== i));

  const minMaxInvalid = newParam.min && newParam.max && (+newParam.min > +newParam.max);
  const canAddParam = newParam.name && newParam.method && !minMaxInvalid;

  const headerValid = header.product && header.specCode && header.effFrom;
  const paramsValid = params.length > 0;

  const goNext = () => {
    setCompleted(new Set([...completed, step]));
    setStep(step === "header" ? "params" : "review");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · <a onClick={() => onNav("specs")}>Specifications</a> · New Specification</div>
          <h1 className="page-title">New Specification</h1>
        </div>
      </div>

      <div className="card" style={{padding: 18}}>
        <Stepper steps={steps} current={step} completed={completed}/>

        {step === "header" && (
          <div style={{marginTop: 14}}>
            <div className="ff-inline">
              <Field label="Product" required help="Select the product this specification applies to. One active spec per product per applies_to is allowed.">
                <select value={header.product} onChange={e => setHeader({...header, product: e.target.value, specCode: e.target.value ? `SPEC-${e.target.value.split(" ")[0]}-I` : ""})}>
                  <option value="">— Select product —</option>
                  <option>R-1001 Wieprzowina kl. II</option>
                  <option>R-1002 Słonina wieprzowa</option>
                  <option>R-1101 Wołowina gulaszowa</option>
                  <option>R-1201 Filet z kurczaka</option>
                  <option>R-1501 Mąka pszenna typ 500</option>
                  <option>R-1601 Jaja kurze (żółtka)</option>
                  <option>R-2101 Pieprz czarny mielony</option>
                  <option>FA5100 Kiełbasa śląska pieczona 450g</option>
                  <option>FA5200 Pasztet drobiowy z żurawiną 180g</option>
                  <option>FA5300 Pierogi z mięsem 400g</option>
                </select>
              </Field>
              <Field label="Spec code" required help="Auto-populated. Max 50 chars. Must be unique per product+applies_to.">
                <input value={header.specCode} onChange={e => setHeader({...header, specCode: e.target.value})} maxLength={50} className="mono"/>
              </Field>
            </div>

            {header.product && header.product.startsWith("FA") && (
              <div className="alert-box alert-green" style={{fontSize: 12, marginBottom: 12}}>
                <span>✓</span>
                <div>Allergen profile will be snapshotted at approval. Profile will include: gluten (cereals), eggs (yolk), milk (for some recipes).</div>
              </div>
            )}

            <div className="ff-inline">
              <Field label="Applies to" required>
                <div className="pills">
                  {["incoming", "inprocess", "final", "all"].map(a => (
                    <button key={a} className={"pill " + (header.appliesTo === a ? "on" : "")} onClick={() => setHeader({...header, appliesTo: a})}>{a}</button>
                  ))}
                </div>
              </Field>
              <Field label="Version"><input value="v1" readOnly className="mono" style={{background: "var(--gray-100)"}}/></Field>
            </div>

            <div className="ff-inline">
              <Field label="Effective from" required><input type="date" value={header.effFrom} onChange={e => setHeader({...header, effFrom: e.target.value})}/></Field>
              <Field label="Effective until (optional)"><input type="date" value={header.effUntil} onChange={e => setHeader({...header, effUntil: e.target.value})}/></Field>
            </div>

            <Field label="Regulation references" help="Select all regulations this spec is intended to satisfy. These tags appear on inspections and CoAs.">
              <div className="row-flex" style={{flexWrap: "wrap", gap: 6}}>
                {["EU FIC 1169/2011", "FSMA 204", "BRCGS Issue 10", "ISO 22000", "Codex HACCP", "21 CFR Part 11"].map(r => (
                  <button key={r} className={"pill " + (header.regs.has(r) ? "on" : "")} onClick={() => toggleReg(r)}>{r}</button>
                ))}
              </div>
            </Field>

            <Field label="Reference documents" help="Max 500 chars"><textarea value={header.refDocs} onChange={e => setHeader({...header, refDocs: e.target.value})} maxLength={500} placeholder="SOP numbers, supplier CoA references…"/></Field>
            <Field label="Notes (optional, max 1000)"><textarea value={header.notes} onChange={e => setHeader({...header, notes: e.target.value})} maxLength={1000}/></Field>

            <div style={{display: "flex", justifyContent: "space-between", marginTop: 14}}>
              <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={!headerValid} onClick={goNext}>Next: Parameters →</button>
            </div>
          </div>
        )}

        {step === "params" && (
          <div style={{marginTop: 14}}>
            <div style={{display: "grid", gridTemplateColumns: "1fr 360px", gap: 14}}>
              <div>
                <div className="label" style={{marginBottom: 6, fontSize: 11, fontWeight: 600, textTransform: "uppercase"}}>Parameters ({params.length})</div>
                <table>
                  <thead><tr><th style={{width: 24}}></th><th>Name</th><th>Type</th><th>Target / Min / Max</th><th>Unit</th><th>Critical</th><th></th></tr></thead>
                  <tbody>
                    {params.map((p, i) => (
                      <tr key={i} className={p.critical ? "spec-param-row critical" : "spec-param-row"}>
                        <td style={{cursor: "grab"}}>≡</td>
                        <td style={{fontSize: 11}}>{p.name}</td>
                        <td><span className="qa-badge badge-draft">{p.type}</span></td>
                        <td className="mono" style={{fontSize: 11}}>{p.target || "—"} / {p.min || "—"} / {p.max || "—"}</td>
                        <td className="mono" style={{fontSize: 11}}>{p.unit}</td>
                        <td>{p.critical ? <span className="param-critical">● Critical</span> : "—"}</td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => removeParam(i)}>🗑</button></td>
                      </tr>
                    ))}
                    {params.length === 0 && <tr><td colSpan={7} style={{textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 12}}>No parameters added. Use the panel → to add at least one.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="card" style={{padding: 14}}>
                <h4 style={{margin: "0 0 10px", fontSize: 12, textTransform: "uppercase"}}>Add Parameter</h4>
                <Field label="Name" required><input value={newParam.name} onChange={e => setNewParam({...newParam, name: e.target.value})} placeholder="e.g. Moisture content"/></Field>
                <Field label="Type" required>
                  <select value={newParam.type} onChange={e => setNewParam({...newParam, type: e.target.value})}>
                    <option>Visual</option><option>Measurement</option><option>Attribute</option><option>Microbiological</option><option>Chemical</option><option>Sensory</option><option>Equipment</option>
                  </select>
                </Field>
                {(newParam.type === "Measurement" || newParam.type === "Chemical" || newParam.type === "Microbiological") && (
                  <>
                    <div className="ff-inline">
                      <Field label="Target"><input type="number" value={newParam.target} onChange={e => setNewParam({...newParam, target: e.target.value})} step="0.01"/></Field>
                      <Field label="Unit"><input value={newParam.unit} onChange={e => setNewParam({...newParam, unit: e.target.value})} placeholder="°C / pH / %"/></Field>
                    </div>
                    <div className="ff-inline">
                      <Field label="Min" error={minMaxInvalid ? "Min must be ≤ Max" : null}><input type="number" value={newParam.min} onChange={e => setNewParam({...newParam, min: e.target.value})} step="0.01"/></Field>
                      <Field label="Max"><input type="number" value={newParam.max} onChange={e => setNewParam({...newParam, max: e.target.value})} step="0.01"/></Field>
                    </div>
                  </>
                )}
                <Field label="Test method" required help="Describe the test procedure. Required before approval. [V-QA-SPEC-002]">
                  <textarea value={newParam.method} onChange={e => setNewParam({...newParam, method: e.target.value})} maxLength={200} placeholder="e.g. ISO 1442 oven-dry method…"/>
                </Field>
                <Field label="Equipment required (optional)"><input value={newParam.equipment} onChange={e => setNewParam({...newParam, equipment: e.target.value})} placeholder="e.g. Memmert UN 55"/></Field>
                <Field label="Critical parameter" help="A FAIL on any critical param blocks release and auto-creates NCR.">
                  <label style={{fontSize: 12}}><input type="checkbox" checked={newParam.critical} onChange={e => setNewParam({...newParam, critical: e.target.checked})}/> Mark as critical</label>
                </Field>
                <button className="btn btn-primary btn-sm" style={{width: "100%"}} onClick={addParam} disabled={!canAddParam}>＋ Add Parameter</button>
              </div>
            </div>

            <div style={{display: "flex", justifyContent: "space-between", marginTop: 14}}>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep("header")}>← Back</button>
              <div>
                <button className="btn btn-secondary btn-sm" onClick={onCancel} style={{marginRight: 6}}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={!paramsValid} onClick={goNext}>Next: Review →</button>
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div style={{marginTop: 14}}>
            <Summary rows={[
              { label: "Product", value: header.product || "—", mono: false },
              { label: "Spec code", value: header.specCode, mono: true },
              { label: "Version", value: "v1", mono: true },
              { label: "Applies to", value: header.appliesTo, mono: false },
              { label: "Effective from", value: header.effFrom, mono: true },
              { label: "Effective until", value: header.effUntil || "Open-ended", mono: true },
              { label: "Parameters", value: params.length + " total (" + params.filter(p => p.critical).length + " critical)", emphasis: true, mono: false },
              { label: "Regulations", value: [...header.regs].join(", ") || "None", mono: false },
            ]}/>
            <div className="card" style={{padding: 0, marginTop: 10}}>
              <div style={{padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600}}>Parameters preview</div>
              <table>
                <thead><tr><th>Name</th><th>Type</th><th>Target (min–max)</th><th>Unit</th><th>Method</th><th>Critical</th></tr></thead>
                <tbody>
                  {params.map((p, i) => (
                    <tr key={i} className={p.critical ? "spec-param-row critical" : "spec-param-row"}>
                      <td style={{fontSize: 11}}>{p.name}</td>
                      <td><span className="qa-badge badge-draft">{p.type}</span></td>
                      <td className="mono" style={{fontSize: 11}}>{p.target || "—"} ({p.min || "—"}–{p.max || "—"})</td>
                      <td className="mono">{p.unit}</td>
                      <td style={{fontSize: 11}}>{p.method.substring(0, 40)}{p.method.length > 40 ? "…" : ""}</td>
                      <td>{p.critical ? <span className="param-critical">●</span> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{display: "flex", justifyContent: "space-between", marginTop: 14}}>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep("params")}>← Back</button>
              <div style={{display: "flex", gap: 6}}>
                <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
                <button className="btn btn-secondary btn-sm" onClick={onCancel}>Save as draft</button>
                <button className="btn btn-primary btn-sm" onClick={onCancel}>Submit for approval</button>
                <button className="btn btn-sm" style={{background: "#3730a3", color: "#fff", border: 0}} onClick={() => openModal("specSign")}>🔒 Approve immediately (e-sign)</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// ============ QA-003b Specification Detail ============
const QaSpecDetail = ({ specId, onBack, onNav, openModal }) => {
  const s = QA_SPECS.find(x => x.id === specId) || QA_SPECS[0];
  const d = s.id === QA_SPEC_DETAIL.id ? QA_SPEC_DETAIL : { ...QA_SPEC_DETAIL, id: s.id, product: { code: s.product.split(" ")[0], name: s.product }, version: s.version, status: s.status, regs: s.regs, approvedBy: s.approvedBy, approvedAt: s.approvedAt, effFrom: s.effFrom, effUntil: s.effUntil, parameters: QA_SPEC_DETAIL.parameters.slice(0, s.params) };
  const isSigned = s.status === "active";

  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav("dashboard")}>Quality</a> · <a onClick={onBack}>Specifications</a> · {s.id} v{s.version}</div>
          <h1 className="page-title" style={{display: "flex", alignItems: "center", gap: 10}}>
            <a onClick={onBack} style={{fontSize: 14, color: "var(--blue)", cursor: "pointer", fontWeight: 400}}>← Specs</a>
            <span>{s.product} — {s.id} v{s.version}</span>
            <StatusBadge s={s.status}/>
          </h1>
        </div>
        <div className="row-flex">
          <button className="btn btn-secondary btn-sm">Clone to new version</button>
          <button className="btn btn-secondary btn-sm">⎙ Download PDF</button>
          {s.status === "under_review" && <button className="btn btn-primary btn-sm" onClick={() => openModal("specSign")}>🔒 Approve Specification</button>}
        </div>
      </div>

      {isSigned && (
        <div className="signed-banner">
          <span className="sb-ic">🔒</span>
          <div>Approved by <b>{s.approvedBy}</b> on <b>{s.approvedAt}</b>. Immutable — 21 CFR Part 11: signed record cannot be modified.</div>
        </div>
      )}

      <div className="qa-detail-layout">
        <div>
          <div className="qa-detail-card">
            <h4>Header</h4>
            <div className="qa-detail-field"><span className="label">Product</span><span className="value"><a className="dcode">{d.product.code}</a> · {d.product.name}</span></div>
            <div className="qa-detail-field"><span className="label">Spec code</span><span className="value mono">{d.id}</span></div>
            <div className="qa-detail-field"><span className="label">Version</span><span className="value mono">v{d.version}</span></div>
            <div className="qa-detail-field"><span className="label">Applies to</span><span className="value">{d.appliesTo || s.appliesTo}</span></div>
            <div className="qa-detail-field"><span className="label">Effective</span><span className="value mono">{d.effFrom} → {d.effUntil || "open-ended"}</span></div>
            <div className="qa-detail-field"><span className="label">Regulations</span><span className="value"><RegTags regs={d.regs}/></span></div>
            <div className="qa-detail-field"><span className="label">Created by</span><span className="value">{d.createdBy || "—"} · <span className="mono">{d.createdAt || "—"}</span></span></div>
            {d.refDocs && <div className="qa-detail-field"><span className="label">Reference docs</span><span className="value" style={{fontSize: 11}}>{d.refDocs}</span></div>}
          </div>

          {/* Allergen profile */}
          {d.allergenProfile && (
            <div className="qa-detail-card">
              <h4>Allergen profile snapshot (at approval)</h4>
              <div style={{fontSize: 10, color: "var(--muted)", marginBottom: 6}}>Regulation: EU FIC 1169/2011 — 14 declared allergens</div>
              <div className="allergen-grid">
                {d.allergenProfile.map((a, i) => (
                  <div key={i} className="allergen-cell">
                    <span className="a-name">{a.name}</span>
                    <span className={"a-badge " + (a.present ? "present" : "absent")}>{a.present ? "Present" : "Absent"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="qa-detail-card">
            <h4>Parameters ({d.parameters.length})</h4>
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Target</th><th>Min</th><th>Max</th><th>Unit</th><th>Method</th><th>Critical</th></tr></thead>
              <tbody>
                {d.parameters.map((p, i) => (
                  <tr key={i} className={p.critical ? "spec-param-row critical" : "spec-param-row"}>
                    <td style={{fontSize: 11}}>{p.name}</td>
                    <td><span className="qa-badge badge-draft">{p.type}</span></td>
                    <td className="mono" style={{fontSize: 11}}>{p.target || "—"}</td>
                    <td className="mono" style={{fontSize: 11}}>{p.min ?? "—"}</td>
                    <td className="mono" style={{fontSize: 11}}>{p.max ?? "—"}</td>
                    <td className="mono" style={{fontSize: 11}}>{p.unit}</td>
                    <td style={{fontSize: 11, maxWidth: 280}} title={p.method}>{p.method.substring(0, 50)}{p.method.length > 50 ? "…" : ""}</td>
                    <td>{p.critical ? <span className="param-critical">●</span> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.notes && (
            <div className="qa-detail-card">
              <h4>Notes</h4>
              <div style={{fontSize: 12}}>{d.notes}</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="qa-detail-sidebar">
          <div className="qa-detail-card">
            <h4>Signature</h4>
            {isSigned ? (
              <>
                <div style={{fontSize: 12, marginBottom: 4}}><span className="qa-badge badge-signed">🔒 Signed</span></div>
                <div className="qa-detail-field"><span className="label">Approved by</span><span className="value">{d.approvedBy}</span></div>
                <div className="qa-detail-field"><span className="label">Approved at</span><span className="value mono">{d.approvedAt}</span></div>
                <div className="qa-detail-field"><span className="label">Meaning</span><span className="value">approved</span></div>
              </>
            ) : (
              <div style={{fontSize: 12, color: "var(--muted)"}}>Not yet signed.</div>
            )}
          </div>
          <div className="qa-detail-card" style={{fontSize: 10, color: "var(--muted)", lineHeight: 1.5}}>
            <b>V-QA-SPEC-002</b> — all measurement parameters must have a test_method.<br/>
            <b>V-QA-SPEC-003</b> — min ≤ target ≤ max.<br/>
            <b>V-QA-SPEC-005</b> — only quality_lead can approve.
          </div>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { QaSpecsList, QaSpecWizard, QaSpecDetail });
