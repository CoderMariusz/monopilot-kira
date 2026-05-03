// ============================================================================
// NPD modals — matches 01-NPD-UX.md §4 MODAL-01..MODAL-10
// Uses shared primitives: Modal, Stepper, Field, ReasonInput, Summary
// Pattern A state wiring: triggered from app.jsx via openModal(name, data).
// Every modal follows MODAL-SCHEMA.md (sizing, footer, naming).
// ============================================================================

// -------- MODAL-01 — FACreateModal (Create Factory Article) ------------------
const FACreateModal = ({ open, onClose }) => {
  const [faCode, setFaCode]   = React.useState("FA");
  const [name, setName]       = React.useState("");
  const [devCode, setDevCode] = React.useState("");
  const [submitting, setSub]  = React.useState(false);

  const v01Valid = /^FA[A-Z0-9]+$/.test(faCode);
  const v02Valid = name.trim().length > 0 && name.length <= 200;
  const duplicate = window.NPD_FAS.some(f => f.fa_code === faCode);
  const valid = v01Valid && v02Valid && !duplicate;

  return (
    <Modal open={open} onClose={onClose} size="default" title="Create factory article"
      subtitle="V01 · FA Code format validated on blur. V02 · Product Name required."
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid || submitting} onClick={() => { setSub(true); setTimeout(() => { setSub(false); onClose(); }, 600); }}>
          {submitting ? "Creating…" : "Create FA"}
        </button>
      </>}>
      <Field label="FA Code" required error={!v01Valid && faCode !== "FA" ? "Must start with 'FA' followed by uppercase letters/digits (e.g. FA5609)." : duplicate ? "FA Code already exists. Choose a different code." : null}>
        <input className="mono" value={faCode} onChange={e => setFaCode(e.target.value.toUpperCase())} placeholder="FA5609" autoFocus />
      </Field>
      <Field label="Product Name" required help="Max 200 chars" error={name.length > 200 ? "Too long (max 200)." : null}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pulled Chicken Shawarma" />
      </Field>
      <Field label="Dev Code" help="Optional · Format DEV<YY><MM>-<seq>">
        <input className="mono" value={devCode} onChange={e => setDevCode(e.target.value)} placeholder="DEV26-052" />
      </Field>
      <div className="alert alert-blue" style={{ marginTop: 10 }}>
        Next FA will redirect to <span className="mono">/npd/fa/{faCode || "FA…"}</span> (Core tab). Ranges: <span className="mono">FA5600</span>+ is reserved for 2026 NPD pipeline.
      </div>
    </Modal>
  );
};

// -------- MODAL-02 — BriefCreateModal ---------------------------------------
const BriefCreateModal = ({ open, onClose }) => {
  const [tmpl, setTmpl]       = React.useState("single");
  const [name, setName]       = React.useState("");
  const [devCode, setDevCode] = React.useState("DEV26-052");
  const [volume, setVol]      = React.useState("");

  const valid = name.trim() && /^DEV\d{4}-\d+$/.test(devCode) && Number(volume) > 0;

  return (
    <Modal open={open} onClose={onClose} size="default" title="New brief"
      subtitle="Creates a Brief record · redirects to Brief editor (SCR-05)."
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Create brief</button>
      </>}>
      <Field label="Template" required>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {[
            { k: "single", label: "Single component", hint: "One Finish Meat / one component" },
            { k: "multi",  label: "Multi component",  hint: "Platters, mixed packs (2+ components)" }
          ].map(t => (
            <div key={t.k} onClick={() => setTmpl(t.k)}
                 style={{ flex: 1, padding: 12, border: `2px solid ${tmpl === t.k ? "var(--blue)" : "var(--border)"}`, borderRadius: 6, cursor: "pointer", background: tmpl === t.k ? "var(--blue-050)" : "#fff" }}>
              <div style={{ fontWeight: 600 }}>{t.label}</div>
              <div className="muted" style={{ fontSize: 11 }}>{t.hint}</div>
            </div>
          ))}
        </div>
      </Field>
      <Field label="Product name" required>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Duck Rillettes 120g" autoFocus />
      </Field>
      <Field label="Dev Code" required help="V08 · Format DEV<YY><MM>-<seq>" error={devCode && !/^DEV\d{4}-\d+$/.test(devCode) ? "Invalid format." : null}>
        <input className="mono" value={devCode} onChange={e => setDevCode(e.target.value)} />
      </Field>
      <Field label="Volume (pcs/week)" help="Must be > 0">
        <input type="number" value={volume} onChange={e => setVol(e.target.value)} placeholder="e.g. 1200" />
      </Field>
    </Modal>
  );
};

// -------- MODAL-03 — BriefConvertModal (Convert brief to FA) -----------------
const BriefConvertModal = ({ open, onClose, data }) => {
  const brief = data?.brief || { dev_code: "DEV26-050", product_name: "Duck Rillettes 120g", brief_id: "BR-0106" };
  const [faCode, setFaCode] = React.useState("FA5609");
  const v01Valid = /^FA[A-Z0-9]+$/.test(faCode);
  const duplicate = window.NPD_FAS.some(f => f.fa_code === faCode);

  return (
    <Modal open={open} onClose={onClose} size="wide"
      title={`Convert brief ${brief.dev_code} to factory article`}
      subtitle="Gate checks pass — brief is complete and required fields are filled."
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-success btn-sm" disabled={!v01Valid || duplicate} onClick={onClose}>Convert →</button>
      </>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div className="alert alert-green" style={{ marginBottom: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Gate checks</div>
          <div style={{ fontSize: 12 }}>
            <div>✓ Brief status = complete</div>
            <div>✓ All required fields filled</div>
            <div>✓ Dev code format valid (V08)</div>
            <div>✓ No existing FA linked</div>
          </div>
        </div>
        <Field label="Target FA Code" required help="V01 · Proposed from next free FA56XX range." error={!v01Valid ? "Invalid format." : duplicate ? "Already exists." : null}>
          <input className="mono" value={faCode} onChange={e => setFaCode(e.target.value.toUpperCase())} />
        </Field>
      </div>

      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Pre-populated into Core</div>
      <table style={{ fontSize: 12 }}>
        <thead><tr><th>FA field</th><th>Value from brief</th></tr></thead>
        <tbody>
          <tr><td className="muted">Product Name</td><td>{brief.product_name}</td></tr>
          <tr><td className="muted">Volume</td><td className="mono">1,200</td></tr>
          <tr><td className="muted">Dev Code</td><td className="mono">{brief.dev_code}</td></tr>
          <tr><td className="muted">Finish Meat</td><td className="mono">(generated from components)</td></tr>
          <tr><td className="muted">RM Code</td><td className="mono">(auto-derived)</td></tr>
          <tr><td className="muted">Weights</td><td className="mono">120g</td></tr>
          <tr><td className="muted">Packs per case</td><td className="mono">12</td></tr>
          <tr><td className="muted">Allergens (seed)</td><td>From RM cascade (Soy, Mustard may-contain)</td></tr>
          <tr><td className="muted">Web</td><td className="mono">WEB-PET-300</td></tr>
          <tr><td className="muted">MRP Sleeves</td><td className="mono">MRP-CRT-012</td></tr>
        </tbody>
      </table>

      <div className="alert alert-amber" style={{ fontSize: 12 }}>
        Brief will be set to <strong>Converted</strong> and locked. FA pre-fill is editable after creation.
      </div>
    </Modal>
  );
};

// -------- MODAL-04 — DeptCloseModal (Advance Gate variant) -------------------
const DeptCloseModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS[0];
  const dept = data?.dept || "Core";
  const [note, setNote] = React.useState("");

  // Fake checklist based on dept
  const checklists = {
    Core:        [["Product Name", true], ["Pack Size", true], ["Finish Meat", true], ["Template", true], ["Dev Code", true]],
    Planning:    [["Meat %", true], ["Runs per week", true], ["Date codes per week", false]],
    Commercial:  [["Launch Date", true], ["Department number", true], ["Article number", true], ["Bar codes", false]],
    Production:  [["Pack_Size filled", true], ["Yield P1-P4", true], ["Line filled", true], ["Dieset derived", true], ["Rate", true]],
    Technical:   [["Shelf life", true], ["Allergens assessed", true]],
    MRP:         [["Box", true], ["Top Label", true], ["MRP Films", false], ["Tara weight", true], ["Pallet plan", true]],
    Procurement: [["Price", true], ["Lead time", true], ["Supplier", true], ["Proc shelf life", true]]
  };
  const items = checklists[dept] || checklists.Core;
  const allPass = items.every(([_, ok]) => ok);

  return (
    <Modal open={open} onClose={onClose} size="default" title={`Close ${dept} section`}
      subtitle={`FA ${fa.fa_code} · ${fa.product_name}`}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-success btn-sm" disabled={!allPass} onClick={onClose}>✓ Confirm close</button>
      </>}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>V05 · Required field check</div>
      <div style={{ marginBottom: 10 }}>
        {items.map(([label, ok], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12 }}>
            <span style={{ color: ok ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{ok ? "✓" : "✗"}</span>
            <span style={{ color: ok ? undefined : "var(--red)" }}>{label}</span>
          </div>
        ))}
      </div>

      {allPass ? (
        <div className="alert alert-green">All required fields filled — safe to close.</div>
      ) : (
        <div className="alert alert-amber">
          <strong>Cannot close:</strong> Fill all required fields before closing this section. <a style={{ color: "var(--blue)", cursor: "pointer" }}>View missing →</a>
        </div>
      )}

      <Field label="Closing note (optional)">
        <textarea rows="2" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a comment for the audit trail…" />
      </Field>
    </Modal>
  );
};

// -------- MODAL-05 — D365BuildModal (Gate approval / MFA) -------------------
const D365BuildModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS.find(f => f.status_overall === "Complete") || window.NPD_FAS[2];
  const [code, setCode]   = React.useState("");
  const [attempts, setA]  = React.useState(0);
  const [running, setRun] = React.useState(false);
  const valid = code.length === 6 && /^\d+$/.test(code);

  const build = () => {
    if (code !== "424242") { setA(a => a + 1); return; }
    setRun(true);
    setTimeout(() => { setRun(false); onClose(); }, 1500);
  };
  const locked = attempts >= 3;

  return (
    <Modal open={open} onClose={onClose} size="default" dismissible={!running}
      title="Build D365 output — final confirmation"
      subtitle="MFA re-authentication required · generates paste-ready Excel"
      foot={<>
        <button className="btn btn-secondary btn-sm" disabled={running} onClick={onClose}>Cancel</button>
        <button className="btn btn-success btn-sm" disabled={!valid || locked || running} onClick={build}>
          {running ? "Generating…" : "✓ Confirm & build"}
        </button>
      </>}>
      <div className="alert alert-amber">
        This action generates <span className="mono">Builder_{fa.fa_code}.xlsx</span> for D365 import. Ensure all data is correct before proceeding.
      </div>

      <Summary rows={[
        { label: "FA Code",         value: fa.fa_code },
        { label: "Product",         value: fa.product_name, mono: false },
        { label: "Status",          value: fa.status_overall, mono: false },
        { label: "Finish Meat",     value: fa.finish_meat || "—" },
        { label: "N+1 products",    value: `${(fa.finish_meat || "").split(",").length + 1} (PR codes + FA final)`, mono: false, emphasis: true }
      ]} />

      <Field label="MFA code" required help="6-digit code from your authenticator app (hint: 424242)"
             error={attempts > 0 && !locked ? `Incorrect code. ${3 - attempts} attempts left.` : locked ? "Too many attempts — locked 60s." : null}>
        <input className="mono" maxLength={6} value={code} onChange={e => setCode(e.target.value)} placeholder="______"
               style={{ textAlign: "center", fontSize: 20, letterSpacing: 8 }} disabled={locked || running} />
      </Field>

      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
        After successful build: <span className="mono">item.created_from_npd = true</span> flag pushed to D365. Built flag saved locally.
      </div>
    </Modal>
  );
};

// -------- MODAL-06 — VersionCompareModal ------------------------------------
const VersionCompareModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS[0];
  const versions = window.NPD_FORMULATION_VERSIONS[fa.fa_code] || window.NPD_FORMULATION_VERSIONS.FA5601;
  const [a, setA] = React.useState(versions[0]?.version);
  const [b, setB] = React.useState(versions[versions.length - 1]?.version);
  const vA = versions.find(v => v.version === a) || versions[0];
  const vB = versions.find(v => v.version === b) || versions[versions.length - 1];

  const rows = [
    ["Status",          vA.status, vB.status],
    ["Items count",     vA.items, vB.items],
    ["Allergens",       vA.allergens, vB.allergens],
    ["Effective from",  vA.effective_from, vB.effective_from],
    ["Effective to",    vA.effective_to || "—", vB.effective_to || "—"],
    ["Created by",      vA.created_by, vB.created_by]
  ];

  return (
    <Modal open={open} onClose={onClose} size="wide" title="Compare formulation versions"
      subtitle={`FA ${fa.fa_code} · side-by-side diff`}
      foot={<button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <Field label="Version A">
          <select value={a} onChange={e => setA(e.target.value)}>
            {versions.map(v => <option key={v.version}>{v.version}</option>)}
          </select>
        </Field>
        <Field label="Version B">
          <select value={b} onChange={e => setB(e.target.value)}>
            {versions.map(v => <option key={v.version}>{v.version}</option>)}
          </select>
        </Field>
      </div>
      <table style={{ fontSize: 12 }}>
        <thead><tr><th>Field</th><th>Version {a}</th><th>Version {b}</th><th>Changed?</th></tr></thead>
        <tbody>
          {rows.map(([k, av, bv]) => {
            const changed = String(av) !== String(bv);
            return (
              <tr key={k} style={{ background: changed ? "#FFFBEB" : undefined }}>
                <td className="muted">{k}</td>
                <td>{av}</td>
                <td>{bv}</td>
                <td>{changed ? <span className="badge badge-amber">● Yes</span> : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
};

// -------- MODAL-07 — RiskAddModal (Add / Edit Risk) --------------------------
const RiskAddModal = ({ open, onClose, data }) => {
  const existing = data?.risk;
  const [desc, setDesc]       = React.useState(existing?.description || "");
  const [likelihood, setL]    = React.useState(existing?.likelihood || "Med");
  const [impact, setI]        = React.useState(existing?.impact || "Med");
  const [mitigation, setM]    = React.useState(existing?.mitigation || "");
  const [status, setS]        = React.useState(existing?.status || "Open");
  const [owner, setO]         = React.useState(existing?.owner || "");

  const nmap = { Low: 1, Med: 2, High: 3 };
  const score = nmap[likelihood] * nmap[impact];
  const scoreBadge = score >= 6 ? "badge-red" : score >= 3 ? "badge-amber" : "badge-gray";

  const valid = desc.trim().length > 0 && desc.length <= 300 && mitigation.length <= 500;

  return (
    <Modal open={open} onClose={onClose} size="default" title={existing ? "Edit risk" : "Add risk"}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>{existing ? "Save" : "Add risk"}</button>
      </>}>
      <Field label="Description" required help="Max 300 chars" error={desc.length > 300 ? "Too long." : null}>
        <textarea rows="2" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the risk and business impact." />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Likelihood" required>
          <select value={likelihood} onChange={e => setL(e.target.value)}><option>Low</option><option>Med</option><option>High</option></select>
        </Field>
        <Field label="Impact" required>
          <select value={impact} onChange={e => setI(e.target.value)}><option>Low</option><option>Med</option><option>High</option></select>
        </Field>
      </div>
      <div style={{ padding: "10px 14px", background: "var(--gray-050)", borderRadius: 6, marginBottom: 10 }}>
        Risk score: <span className={`badge ${scoreBadge}`}>{score} ({likelihood} × {impact})</span>
      </div>
      <Field label="Mitigation plan" help="Max 500 chars" error={mitigation.length > 500 ? "Too long." : null}>
        <textarea rows="2" value={mitigation} onChange={e => setM(e.target.value)} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Status" required>
          <select value={status} onChange={e => setS(e.target.value)}><option>Open</option><option>Mitigated</option><option>Closed</option></select>
        </Field>
        <Field label="Owner">
          <input value={owner} onChange={e => setO(e.target.value)} placeholder="e.g. K. Nowak" />
        </Field>
      </div>
    </Modal>
  );
};

// -------- MODAL-08 — FADeleteModal (Destructive with type-to-confirm) -------
const FADeleteModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS[0];
  const [typed, setTyped] = React.useState("");
  const valid = typed === fa.fa_code;

  return (
    <Modal open={open} onClose={onClose} size="default" dismissible={false}
      title={`Delete FA ${fa.fa_code}?`}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>Delete permanently</button>
      </>}>
      <div className="alert alert-red" style={{ background: "#FEE2E2", border: "1px solid var(--red)", color: "#991b1b" }}>
        <strong>This action is permanent and cannot be undone.</strong>
      </div>
      <Summary rows={[
        { label: "FA Code",     value: fa.fa_code },
        { label: "Product",     value: fa.product_name, mono: false },
        { label: "Brief",       value: fa.brief_id || "—" },
        { label: "Status",      value: fa.status_overall, mono: false },
        { label: "Built?",      value: fa.built ? "Yes · output archived" : "No", mono: false }
      ]} />
      <div style={{ fontSize: 12, marginBottom: 10 }}>
        Related data that will be deleted:
        <ul style={{ marginTop: 4, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>ProdDetail rows ({(window.NPD_PROD_DETAIL[fa.fa_code]||[]).length || 1} components)</li>
          <li>Linked Brief association (Brief status reverts to complete)</li>
          <li>Builder outputs ({fa.built ? "1 archive" : "none"})</li>
          <li>Audit history (migrated to "deleted FA" archive)</li>
          <li>Formulation versions ({(window.NPD_FORMULATION_VERSIONS[fa.fa_code]||[]).length || 0})</li>
        </ul>
      </div>
      <Field label={`Type ${fa.fa_code} to confirm`} required error={typed && !valid ? "Does not match FA Code." : null}>
        <input className="mono" value={typed} onChange={e => setTyped(e.target.value.toUpperCase())} placeholder={fa.fa_code} />
      </Field>
    </Modal>
  );
};

// -------- MODAL-09 — AllergenOverrideModal ----------------------------------
const AllergenOverrideModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS[0];
  const allergen = data?.allergen || "Soy";
  const current = data?.current || "may";
  const [mode, setMode]     = React.useState(current === "contains" ? "exclude" : "include");
  const [reason, setReason] = React.useState("");
  const valid = reason.length >= 10 && reason.length <= 500;

  return (
    <Modal open={open} onClose={onClose} size="default"
      title={`Override allergen: ${allergen}`}
      subtitle={`FA ${fa.fa_code} · auto-cascade status: ${current}`}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Save override</button>
      </>}>
      <div className="alert alert-amber">
        Overriding auto-cascaded allergen status requires a reason. This override will be audit-logged with your name and timestamp, and flagged for review on next cascade refresh.
      </div>
      <Field label="Allergen">
        <input value={allergen} readOnly style={{ background: "var(--gray-100)" }} />
      </Field>
      <Field label="Current auto-cascade">
        <input value={current} readOnly style={{ background: "var(--gray-100)" }} />
      </Field>
      <Field label="Override to" required>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {["include", "exclude"].map(m => (
            <button key={m} className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-secondary"}`} onClick={() => setMode(m)} style={{ flex: 1 }}>
              {m === "include" ? "✓ Include (Contains)" : "✗ Exclude (Not present)"}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Reason" required error={reason && !valid ? "Min 10 chars, max 500." : null}>
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="Explain why auto-cascade is overridden…" />
      </Field>
    </Modal>
  );
};

// -------- MODAL-10 — D365WizardModal (Guided 8-step build) ------------------
const D365WizardModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS.find(f => f.status_overall === "Complete") || window.NPD_FAS[2];
  const [step, setStep]  = React.useState(0);
  const [done, setDone]  = React.useState(new Set());
  const [code, setCode]  = React.useState("");
  const [exec, setExec]  = React.useState(0);

  const steps = [
    { key: "validate",  label: "Validate"   },
    { key: "data",      label: "Data review"},
    { key: "bom",       label: "BOM preview"},
    { key: "allergen",  label: "Allergens"  },
    { key: "constants", label: "D365 consts"},
    { key: "nplus1",    label: "N+1 preview"},
    { key: "mfa",       label: "MFA"        },
    { key: "execute",   label: "Execute"    }
  ];
  const current = steps[step];

  // Auto-advance in exec step
  React.useEffect(() => {
    if (current?.key !== "execute" || !open) return;
    if (exec >= 6) return;
    const t = setTimeout(() => setExec(e => e + 1), 500);
    return () => clearTimeout(t);
  }, [current?.key, exec, open]);

  const next = () => { setDone(s => new Set([...s, current.key])); setStep(s => Math.min(7, s + 1)); };
  const prev = () => setStep(s => Math.max(0, s - 1));

  const foot = current.key === "execute" ? (
    exec >= 6 ? <>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>View FA</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>↓ Download</button>
    </> : null
  ) : (
    <>
      {step > 0 && <button className="btn btn-secondary btn-sm" onClick={prev}>← Back</button>}
      <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      {step < 7 && <button className="btn btn-primary btn-sm" onClick={next} disabled={current.key === "mfa" && code !== "424242"}>Next →</button>}
    </>
  );

  return (
    <Modal open={open} onClose={onClose} size="wide" dismissible={exec < 6}
      title={`Guided D365 build — ${fa.fa_code}`}
      subtitle={`Step ${step + 1} of 8 · ${current.label}`}
      foot={foot}>
      <Stepper steps={steps} current={current.key} completed={done} />

      {current.key === "validate" && (
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>V01-V08 all PASS/WARN required before Next.</div>
          <table style={{ fontSize: 12 }}>
            <tbody>
              {window.NPD_VALIDATION_RULES.map(r => (
                <tr key={r.id}><td className="mono" style={{ width: 36 }}>{r.id}</td><td>{r.title}</td><td style={{ textAlign: "right" }}><span className="badge badge-green">✓ PASS</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {current.key === "data" && (
        <Summary rows={[
          { label: "FA Code",     value: fa.fa_code },
          { label: "Product",     value: fa.product_name, mono: false },
          { label: "Finish Meat", value: fa.finish_meat || "—" },
          { label: "RM Code",     value: fa.rm_code || "—" },
          { label: "Process 1..4",value: "Slice / MAP / — / —", mono: false },
          { label: "Line",        value: "L2" },
          { label: "Dieset",      value: "DS-L2-220g" },
          { label: "Yield Line",  value: "92%", mono: false },
          { label: "Rate",        value: "1,100 pk/h", mono: false }
        ]}/>
      )}

      {current.key === "bom" && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Formula_Lines tab preview — all materials D365 status.</div>
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td className="mono">RM1839</td><td>RM</td><td className="mono num">0.070</td><td><span className="badge badge-green">✓</span></td></tr>
              <tr><td className="mono">RM1942</td><td>RM</td><td className="mono num">0.080</td><td><span className="badge badge-green">✓</span></td></tr>
              <tr><td className="mono">RM2045</td><td>RM</td><td className="mono num">0.070</td><td><span className="badge badge-green">✓</span></td></tr>
              <tr><td className="mono">BX-PL-240x180x80</td><td>PM</td><td className="mono num">1</td><td><span className="badge badge-green">✓</span></td></tr>
              <tr><td className="mono">WEB-PET-300</td><td>PM</td><td className="mono num">0.060</td><td><span className="badge badge-green">✓</span></td></tr>
            </tbody>
          </table>
        </>
      )}

      {current.key === "allergen" && (
        <>
          <div className="muted" style={{ fontSize: 11 }}>Regulatory: EU FIC 1169/2011 · 14 mandatory allergens</div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Contains</div>
            <span className="badge" style={{ background: "#fee2e2", color: "#991b1b" }}>Soy</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>May contain</div>
            <span className="badge badge-amber">Mustard</span>
          </div>
        </>
      )}

      {current.key === "constants" && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Read-only — edit requires admin (Settings Phase C1).</div>
          <table style={{ fontSize: 12 }}>
            <tbody>
              {window.NPD_D365_CONSTANTS.map(c => (
                <tr key={c.k}><td className="mono" style={{ width: 240 }}>{c.k}</td><td className="mono" style={{ color: "var(--blue)", fontWeight: 600 }}>{c.v}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {current.key === "nplus1" && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Builder generates N+1 products: one per finished PR code + FA final.</div>
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>Product code</th><th>Type</th><th>Processes</th><th>OP</th></tr></thead>
            <tbody>
              <tr><td className="mono">PR1839H-MP</td><td>Intermediate</td><td>Slice → MAP</td><td className="mono">10</td></tr>
              <tr><td className="mono">PR1942G-MP</td><td>Intermediate</td><td>Slice → MAP</td><td className="mono">10</td></tr>
              <tr><td className="mono">PR2045A-MP</td><td>Intermediate</td><td>Slice → MAP</td><td className="mono">10</td></tr>
              <tr style={{ background: "#dbeafe" }}><td className="mono">{fa.fa_code}</td><td>Finished Article</td><td>Pack</td><td className="mono">10</td></tr>
            </tbody>
          </table>
        </>
      )}

      {current.key === "mfa" && (
        <>
          <div className="alert alert-amber">Enter your 6-digit MFA code (hint: 424242)</div>
          <Field label="MFA code" required>
            <input className="mono" maxLength={6} value={code} onChange={e => setCode(e.target.value)}
                   style={{ textAlign: "center", fontSize: 20, letterSpacing: 8 }} placeholder="______" />
          </Field>
        </>
      )}

      {current.key === "execute" && (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Sequential build steps (transactional — rollback on any error):</div>
          {["Generating Formula_Version…", "Generating Formula_Lines…", "Generating Route tabs…", "Writing Excel file…", "Storing artifact…", "Setting Built=TRUE…"].map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <span style={{ color: exec > i ? "var(--green)" : "var(--muted)", fontWeight: 700 }}>{exec > i ? "✓" : exec === i ? "⟳" : "○"}</span>
              <span style={{ color: exec > i ? "var(--text)" : "var(--muted)" }}>{label}</span>
            </div>
          ))}
          {exec >= 6 && (
            <div className="alert alert-green" style={{ marginTop: 10 }}>
              <strong>Builder_{fa.fa_code}.xlsx ready.</strong>
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

// -------- Extras — simple auxiliary modals that support the spec -----------
const VersionSaveModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS[0];
  const [label, setLabel] = React.useState("v0.4");
  const valid = /^v\d+\.\d+$/.test(label);
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Save new draft version"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Save draft</button>
      </>}>
      <Field label="Version label" required help="Format v<major>.<minor>" error={label && !valid ? "Invalid format." : null}>
        <input className="mono" value={label} onChange={e => setLabel(e.target.value)} />
      </Field>
      <div className="muted" style={{ fontSize: 12 }}>FA {fa.fa_code} · branch current recipe into a new editable draft.</div>
    </Modal>
  );
};

const FormulationLockModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS[0];
  const version = data?.version || "v0.3";
  const [reason, setReason] = React.useState("");
  const valid = reason.length >= 10;
  return (
    <Modal open={open} onClose={onClose} size="default" dismissible={false}
      title={`Lock formulation ${version}`}
      subtitle={`FA ${fa.fa_code} · locking is destructive`}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={onClose}>🔒 Lock version</button>
      </>}>
      <div className="alert alert-amber">
        <strong>Locking {version}</strong> will prevent any further edits. A new draft must be created to change ingredients, yields, or allergens going forward.
      </div>
      <Summary rows={[
        { label: "Version",  value: version },
        { label: "FA",       value: fa.fa_code },
        { label: "Status before", value: "Draft", mono: false },
        { label: "Status after",  value: "Locked", mono: false, emphasis: true }
      ]} />
      <Field label="Reason" required>
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="E.g. approved by QA for pilot run…" />
      </Field>
    </Modal>
  );
};

const AllergenRefreshModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS[0];
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Refresh allergen cascade"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>↻ Refresh</button>
      </>}>
      <div style={{ fontSize: 12, marginBottom: 10 }}>
        Recalculates allergen declaration for <strong>{fa.fa_code}</strong> from:
        <ul style={{ marginTop: 4, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Raw material supplier specs (RM* codes)</li>
          <li>Process additions (Coat, glaze, etc.)</li>
          <li>Line 24h changeover history (may-contain)</li>
        </ul>
      </div>
      <div className="alert alert-blue" style={{ fontSize: 12 }}>
        Manual overrides are preserved but flagged for review.
      </div>
    </Modal>
  );
};

const DocUploadModal = ({ open, onClose, data }) => {
  const fa = data?.fa || window.NPD_FAS[0];
  const [type, setType] = React.useState("Spec");
  const [file, setFile] = React.useState("");
  const valid = file.length > 0;
  return (
    <Modal open={open} onClose={onClose} size="default" title="Upload compliance document"
      subtitle={`FA ${fa.fa_code}`}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={onClose}>Upload</button>
      </>}>
      <Field label="Document type" required>
        <select value={type} onChange={e => setType(e.target.value)}>
          <option>Spec</option><option>Artwork</option><option>Benchmark</option><option>Reg.</option><option>QA report</option>
        </select>
      </Field>
      <Field label="File" required help="PDF, XLSX, DOCX · max 20MB">
        <input type="text" value={file} onChange={e => setFile(e.target.value)} placeholder="Click to browse (prototype: type filename)" />
      </Field>
    </Modal>
  );
};

const RefreshD365Modal = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} size="sm" title="Refresh D365 cache"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={onClose}>↻ Refresh</button>
    </>}>
    <div style={{ fontSize: 12 }}>
      Re-syncs <span className="mono">d365_import_cache</span> to refresh V04 material status checks. Typically runs in background every 4h; manual refresh pulls the latest master data.
    </div>
    <div className="alert alert-blue" style={{ marginTop: 10, fontSize: 12 }}>
      Last sync: <span className="mono">2026-04-21 08:00</span> · 12,341 materials synced · 8 with missing cost.
    </div>
  </Modal>
);

// ============ MODAL CATALOG + ModalGallery =====================================
const NPD_MODAL_CATALOG = [
  { key: "faCreate",           name: "MODAL-01 · Create FA",                  pattern: "Simple form + V01 regex", comp: FACreateModal },
  { key: "briefCreate",        name: "MODAL-02 · New Brief",                  pattern: "Simple form + template choice", comp: BriefCreateModal },
  { key: "briefConvert",       name: "MODAL-03 · Convert Brief to FA",        pattern: "Confirm non-destructive + preview", comp: BriefConvertModal },
  { key: "deptClose",          name: "MODAL-04 · Close Dept (Advance Gate)",  pattern: "Confirm with V05 checklist", comp: DeptCloseModal },
  { key: "d365Build",          name: "MODAL-05 · D365 Build (MFA gate)",      pattern: "Confirm with MFA code", comp: D365BuildModal },
  { key: "versionCompare",     name: "MODAL-06 · Compare formulation versions", pattern: "Preview / compare", comp: VersionCompareModal },
  { key: "riskAdd",            name: "MODAL-07 · Add / edit risk",            pattern: "Simple form + auto-computed score", comp: RiskAddModal },
  { key: "faDelete",           name: "MODAL-08 · Delete FA",                  pattern: "Destructive + type-to-confirm", comp: FADeleteModal },
  { key: "allergenOverride",   name: "MODAL-09 · Allergen override",          pattern: "Override with reason (min 10)", comp: AllergenOverrideModal },
  { key: "d365Wizard",         name: "MODAL-10 · D365 Guided build (8-step)", pattern: "Wizard + MFA + execution", comp: D365WizardModal },
  { key: "versionSave",        name: "Extra · Save new draft version",        pattern: "Simple form", comp: VersionSaveModal },
  { key: "formulationLock",    name: "Extra · Lock formulation version",      pattern: "Destructive with reason", comp: FormulationLockModal },
  { key: "allergenRefresh",    name: "Extra · Refresh allergen cascade",      pattern: "Confirm", comp: AllergenRefreshModal },
  { key: "docUpload",          name: "Extra · Upload compliance doc",         pattern: "Simple form", comp: DocUploadModal },
  { key: "refreshD365",        name: "Extra · Refresh D365 cache",            pattern: "Confirm", comp: RefreshD365Modal }
];

const NpdModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="breadcrumb"><a onClick={() => onNav && onNav("dashboard")}>NPD</a> / Admin / Modal gallery</div>
      <div className="page-head">
        <div>
          <div className="page-title">Modal gallery</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {NPD_MODAL_CATALOG.length} components covering MODAL-01 through MODAL-10 + extras · follows <span className="mono">_shared/MODAL-SCHEMA.md</span>
          </div>
        </div>
      </div>

      <div className="alert alert-blue" style={{ marginBottom: 14, fontSize: 12 }}>
        <strong>Click any card to open the modal.</strong> All modals use the shared primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>).
        Schema doc: <span className="mono">_shared/MODAL-SCHEMA.md</span> — read before adding new modals.
      </div>

      <div className="gallery-grid">
        {NPD_MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={() => setOpen(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>Open modal →</button>
          </div>
        ))}
      </div>

      {NPD_MODAL_CATALOG.map(m => (
        <m.comp key={m.key} open={open === m.key} onClose={() => setOpen(null)} />
      ))}
    </>
  );
};

Object.assign(window, {
  FACreateModal, BriefCreateModal, BriefConvertModal, DeptCloseModal, D365BuildModal,
  VersionCompareModal, RiskAddModal, FADeleteModal, AllergenOverrideModal, D365WizardModal,
  VersionSaveModal, FormulationLockModal, AllergenRefreshModal, DocUploadModal, RefreshD365Modal,
  NpdModalGallery, NPD_MODAL_CATALOG
});
