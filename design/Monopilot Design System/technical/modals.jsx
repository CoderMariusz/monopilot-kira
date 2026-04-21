// ==============================================================
// TECHNICAL MODALS — follows ../_shared/MODAL-SCHEMA.md
//
// Primitives (Modal, Stepper, Field, ReasonInput, Summary) come from
// ../_shared/modals.jsx and are globally available — do not redefine.
//
// 14 modals + ModalGallery screen. Grouped by entity:
//  1. Product      — ProductCreateModal, ArchiveProductModal
//  2. BOM          — BomVersionSaveModal, BomComponentAddModal, DeleteBomVersionModal
//  3. Routing      — RoutingStepAddModal
//  4. Allergen     — AllergenDeclarationModal
//  5. ECO          — EcoChangeRequestModal, EcoApprovalModal
//  6. Spec / life  — SpecReviewModal, ShelfLifeOverrideModal
//  7. Costing      — CostRollupRecomputeModal
//  8. D365         — D365ItemSyncConfirmModal, D365DriftResolveModal
//  9. Gallery      — TechModalGallery (manual QA)
// ==============================================================

// ============ 1. PRODUCT ============

// -------- MODAL-01: Product Create (wizard 3-step) --------
const ProductCreateModal = ({ open, onClose, onConfirm }) => {
  const [step, setStep] = React.useState("basic");
  const [completed, setCompleted] = React.useState(new Set());
  const [data, setData] = React.useState({ code: "", name: "", uom: "szt", category: "Cured meat", allergens: [], shelfMode: "use_by", shelfDays: 21 });
  const [submitting, setSubmitting] = React.useState(false);

  const steps = [
    { key: "basic",    label: "Basic info" },
    { key: "category", label: "Category & rules" },
    { key: "review",   label: "Review & create" },
  ];

  React.useEffect(() => {
    if (!open) { setStep("basic"); setCompleted(new Set()); }
  }, [open]);

  const goNext = () => {
    setCompleted(new Set([...completed, step]));
    setStep(step === "basic" ? "category" : "review");
  };
  const goBack = () => setStep(step === "review" ? "category" : "basic");

  const submit = async () => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    onConfirm && onConfirm(data);
    onClose();
  };

  const basicValid = data.code.trim().length >= 3 && data.name.trim().length >= 3;

  return (
    <Modal open={open} onClose={onClose} title="Create product" subtitle="Finished article — FA-code. Links to BOM, spec, allergen matrix." size="wide"
      foot={
        step === "basic" ? <>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!basicValid} onClick={goNext}>Next: category →</button>
        </> : step === "category" ? <>
          <button className="btn btn-ghost btn-sm" onClick={goBack}>← Back</button>
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={goNext}>Next: review →</button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={goBack}>← Edit</button>
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={submitting} onClick={submit}>{submitting ? "Creating…" : "Create product"}</button>
        </>
      }>
      <Stepper steps={steps} current={step} completed={completed} />

      {step === "basic" && (
        <div style={{ marginTop: 14 }}>
          <div className="ff-inline">
            <Field label="FA code" required help="Start with FA; 4 digits recommended.">
              <input value={data.code} onChange={e => setData({ ...data, code: e.target.value.toUpperCase() })} placeholder="FA5100" />
            </Field>
            <Field label="UoM" required>
              <select value={data.uom} onChange={e => setData({ ...data, uom: e.target.value })}>
                <option>szt</option><option>kg</option><option>opak</option>
              </select>
            </Field>
          </div>
          <Field label="Product name (PL)" required>
            <input value={data.name} onChange={e => setData({ ...data, name: e.target.value })} placeholder="np. Kiełbasa śląska pieczona 450g" />
          </Field>
          <Field label="Short description">
            <textarea placeholder="Opcjonalnie — na potrzeby katalogu handlowego." />
          </Field>
        </div>
      )}

      {step === "category" && (
        <div style={{ marginTop: 14 }}>
          <Field label="Category" required>
            <select value={data.category} onChange={e => setData({ ...data, category: e.target.value })}>
              <option>Cured meat</option><option>Deli</option><option>Ready meal</option><option>Frozen</option>
            </select>
          </Field>
          <div className="ff-inline">
            <Field label="Shelf-life mode" required>
              <select value={data.shelfMode} onChange={e => setData({ ...data, shelfMode: e.target.value })}>
                <option value="use_by">Use by</option>
                <option value="best_before">Best before</option>
              </select>
            </Field>
            <Field label="Shelf life (days)" required>
              <input type="number" value={data.shelfDays} onChange={e => setData({ ...data, shelfDays: +e.target.value })} />
            </Field>
          </div>
          <div className="alert-blue alert-box" style={{ fontSize: 12 }}>
            <span>ⓘ</span><div>BOM, spec and allergen matrix can be configured after the product is created.</div>
          </div>
        </div>
      )}

      {step === "review" && (
        <div style={{ marginTop: 14 }}>
          <Summary rows={[
            { label: "Code",        value: data.code, mono: true, emphasis: true },
            { label: "Name",        value: data.name, mono: false },
            { label: "UoM",         value: data.uom,  mono: true },
            { label: "Category",    value: data.category, mono: false },
            { label: "Shelf mode",  value: data.shelfMode, mono: true },
            { label: "Shelf days",  value: data.shelfDays + " d", mono: true },
          ]} />
          <div className="alert-green alert-box" style={{ fontSize: 12 }}>
            <span>✓</span><div>Ready to create. An audit record will be logged.</div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- MODAL-14: Archive Product (destructive with reason) --------
const ArchiveProductModal = ({ open, onClose, onConfirm, data }) => {
  const [reason, setReason] = React.useState("");
  const [ack, setAck] = React.useState(false);
  React.useEffect(() => { if (!open) { setReason(""); setAck(false); } }, [open]);
  const product = data?.name || "FA5100 Kiełbasa śląska pieczona 450g";
  const valid = reason.length >= 10 && ack;
  return (
    <Modal open={open} onClose={onClose} title="Archive product" subtitle="Removes from active catalogue — BOMs remain for audit." size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={() => { onConfirm && onConfirm({ reason }); onClose(); }}>Archive</button>
      </>}>
      <div className="alert-red alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>⚠</span><div><b>{product}</b> will be removed from active pick-lists. Open WOs continue; no new WOs can be created.</div>
      </div>
      <Field label="Reason" required help="Audit-logged, min 10 chars.">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="np. Wycofanie z rynku — decyzja handlowa Q2 2026." />
      </Field>
      <label style={{ display: "flex", gap: 8, fontSize: 13, marginTop: 8 }}>
        <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
        I understand this will hide the product from all create-flows.
      </label>
    </Modal>
  );
};

// ============ 2. BOM ============

// -------- MODAL-02: BOM Version Save --------
const BomVersionSaveModal = ({ open, onClose, onConfirm }) => {
  const [label, setLabel] = React.useState("v8");
  const [reason, setReason] = React.useState("");
  const valid = label.trim().length > 0 && reason.length >= 10;
  React.useEffect(() => { if (!open) { setReason(""); setLabel("v8"); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Save BOM version" subtitle="B-0421 Kiełbasa śląska pieczona 450g · current v7" size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={() => { onConfirm && onConfirm({ label, reason }); onClose(); }}>Save version</button>
      </>}>
      <Field label="Version label" required>
        <input value={label} onChange={e => setLabel(e.target.value)} />
      </Field>
      <Field label="Change reason" required help="Referenced from Planning WO snapshots — min 10 chars.">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="np. Aktualizacja % słoniny (22% → 21%) — ECO-2045." />
      </Field>
      <div className="alert-blue alert-box" style={{ fontSize: 12 }}>
        <span>ⓘ</span><div>Previous version (v7) stays available read-only for existing WOs.</div>
      </div>
    </Modal>
  );
};

// -------- MODAL-03: BOM Component Add (picker) --------
const BomComponentAddModal = ({ open, onClose, onConfirm }) => {
  const [search, setSearch] = React.useState("");
  const [picked, setPicked] = React.useState(null);
  const [qty, setQty] = React.useState(0.1);
  const [scrap, setScrap] = React.useState(1.0);
  React.useEffect(() => { if (!open) { setSearch(""); setPicked(null); setQty(0.1); } }, [open]);
  const options = (typeof MATERIALS !== "undefined" ? MATERIALS : []).filter(m =>
    !search || m.code.toLowerCase().includes(search.toLowerCase()) || m.name.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <Modal open={open} onClose={onClose} title="Add component to BOM" subtitle="Search the material master and set quantity / scrap" size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!picked || qty <= 0} onClick={() => { onConfirm && onConfirm({ material: picked, qty, scrap }); onClose(); }}>
          Add component
        </button>
      </>}>
      <input autoFocus placeholder="Search by code or name (R-, P-, I-…)" value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, fontFamily: "var(--font-mono)", marginBottom: 10 }} />

      <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
        {options.slice(0, 20).map(m => (
          <div key={m.code} onClick={() => setPicked(m)} style={{
            padding: "8px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer",
            display: "grid", gridTemplateColumns: "100px 1fr 80px 100px", gap: 8, alignItems: "center", fontSize: 13,
            background: picked?.code === m.code ? "var(--blue-050)" : "#fff"
          }}>
            <span className="mono">{m.code}</span>
            <span>{m.name}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{m.type}</span>
            <span className="mono num" style={{ color: "var(--muted)" }}>{m.cost.toFixed(2)} zł/{m.uom}</span>
          </div>
        ))}
        {options.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>No materials match.</div>}
      </div>

      {picked && (
        <div style={{ marginTop: 12 }}>
          <div className="ff-inline">
            <Field label={"Quantity (" + picked.uom + " per 1 pack)"} required>
              <input type="number" step="0.0001" value={qty} onChange={e => setQty(+e.target.value)} />
            </Field>
            <Field label="Scrap %">
              <input type="number" step="0.1" value={scrap} onChange={e => setScrap(+e.target.value)} />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- MODAL-13: Delete BOM Version (destructive type-to-confirm) --------
const DeleteBomVersionModal = ({ open, onClose, onConfirm, data }) => {
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => { if (!open) setTyped(""); }, [open]);
  const target = data?.v || "v7";
  const ok = typed === target;
  return (
    <Modal open={open} onClose={onClose} title="Delete BOM version" subtitle="Irreversible — breaks historical WO snapshots referencing this version." size="sm"
      dismissible={false}
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!ok} onClick={() => { onConfirm && onConfirm(); onClose(); }}>Delete version</button>
      </>}>
      <div className="alert-red alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>⚠</span><div>Version <b className="mono">{target}</b> will be permanently removed. Planning WO snapshots that reference this version will show as "orphaned".</div>
      </div>
      <Field label={"Type " + target + " to confirm"} required>
        <input value={typed} onChange={e => setTyped(e.target.value)} placeholder={target} style={{ fontFamily: "var(--font-mono)" }} />
      </Field>
    </Modal>
  );
};

// ============ 3. ROUTING ============

// -------- MODAL-04: Routing Step Add (simple form) --------
const RoutingStepAddModal = ({ open, onClose, onConfirm }) => {
  const [op, setOp] = React.useState("");
  const [wc, setWc] = React.useState("CUT-02");
  const [setup, setSetup] = React.useState(10);
  const [run, setRun] = React.useState(30);
  React.useEffect(() => { if (!open) { setOp(""); } }, [open]);
  const valid = op.trim().length >= 3;
  return (
    <Modal open={open} onClose={onClose} title="Add routing step" subtitle="Inserted after the selected operation — renumber happens automatically." size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={() => { onConfirm && onConfirm({ op, wc, setup, run }); onClose(); }}>Add step</button>
      </>}>
      <Field label="Operation name" required>
        <input value={op} onChange={e => setOp(e.target.value)} placeholder="np. Wędzenie — faza 2" />
      </Field>
      <Field label="Work center" required>
        <select value={wc} onChange={e => setWc(e.target.value)}>
          {(typeof WORK_CENTERS !== "undefined" ? WORK_CENTERS : []).map(w => (
            <option key={w.code} value={w.code}>{w.code} · {w.name}</option>
          ))}
        </select>
      </Field>
      <div className="ff-inline">
        <Field label="Setup (min)" required>
          <input type="number" value={setup} onChange={e => setSetup(+e.target.value)} />
        </Field>
        <Field label="Run (min)" required>
          <input type="number" value={run} onChange={e => setRun(+e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

// ============ 4. ALLERGEN ============

// -------- MODAL-05: Allergen Declaration (confirm w/ checklist) --------
const AllergenDeclarationModal = ({ open, onClose, onConfirm }) => {
  const list = ["Gluten", "Eggs", "Milk", "Soy", "Nuts", "Celery", "Mustard", "Sesame", "Fish", "Sulphites"];
  const [selected, setSelected] = React.useState(new Set(["Mustard"]));
  const [mayContain, setMayContain] = React.useState(new Set(["Milk"]));
  const toggle = (a, set, setSet) => {
    const next = new Set(set);
    if (next.has(a)) next.delete(a); else next.add(a);
    setSet(next);
  };
  return (
    <Modal open={open} onClose={onClose} title="Declare allergens" subtitle="B-0421 Kiełbasa śląska pieczona 450g · syncs to spec + label." size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={() => {
          onConfirm && onConfirm({ present: [...selected], mayContain: [...mayContain] }); onClose();
        }}>Save declaration</button>
      </>}>
      <div className="alert-blue alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>ⓘ</span><div>Auto-suggestions come from BOM component allergen flags. Override here to declare final product label.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 13 }}>
        <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>Allergen</div>
        <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>Present</div>
        <div style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase", color: "var(--muted)" }}>May contain</div>
        {list.map(a => (
          <React.Fragment key={a}>
            <div style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>{a}</div>
            <div style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
              <input type="checkbox" checked={selected.has(a)} onChange={() => toggle(a, selected, setSelected)} />
            </div>
            <div style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
              <input type="checkbox" checked={mayContain.has(a)} onChange={() => toggle(a, mayContain, setMayContain)} />
            </div>
          </React.Fragment>
        ))}
      </div>
    </Modal>
  );
};

// ============ 5. ECO ============

// -------- MODAL-06: ECO Change Request (wizard 2-step) --------
const EcoChangeRequestModal = ({ open, onClose, onConfirm }) => {
  const [step, setStep] = React.useState("changes");
  const [completed, setCompleted] = React.useState(new Set());
  const [data, setData] = React.useState({ title: "", impact: "Recipe + spec", description: "", priority: "normal", approvers: [] });
  React.useEffect(() => { if (!open) { setStep("changes"); setCompleted(new Set()); } }, [open]);
  const steps = [{ key: "changes", label: "Describe changes" }, { key: "approvers", label: "Approvers" }];
  const validChanges = data.title.trim().length >= 5 && data.description.length >= 10;
  const toggleApprover = (a) => {
    setData(d => ({ ...d, approvers: d.approvers.includes(a) ? d.approvers.filter(x => x !== a) : [...d.approvers, a] }));
  };
  return (
    <Modal open={open} onClose={onClose} title="Open ECO · Engineering Change Order" subtitle="Goes to reviewers after submission. Approvers defined per impact." size="wide"
      foot={
        step === "changes" ? <>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!validChanges} onClick={() => { setCompleted(new Set([...completed, "changes"])); setStep("approvers"); }}>Next: approvers →</button>
        </> : <>
          <button className="btn btn-ghost btn-sm" onClick={() => setStep("changes")}>← Back</button>
          <span className="spacer"></span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={data.approvers.length === 0} onClick={() => { onConfirm && onConfirm(data); onClose(); }}>Submit ECO</button>
        </>
      }>
      <Stepper steps={steps} current={step} completed={completed} />
      {step === "changes" && (
        <div style={{ marginTop: 14 }}>
          <Field label="Title" required>
            <input value={data.title} onChange={e => setData({ ...data, title: e.target.value })} placeholder="np. Redukcja soli w szynce plastrach −10%" />
          </Field>
          <div className="ff-inline">
            <Field label="Impact scope" required>
              <select value={data.impact} onChange={e => setData({ ...data, impact: e.target.value })}>
                <option>Recipe + spec</option><option>Packaging + label</option><option>Supplier + cost</option><option>Process + SOP</option><option>Obsolete / withdraw</option>
              </select>
            </Field>
            <Field label="Priority">
              <select value={data.priority} onChange={e => setData({ ...data, priority: e.target.value })}>
                <option>low</option><option>normal</option><option>high</option>
              </select>
            </Field>
          </div>
          <Field label="Description" required help="What is changing and why — min 10 chars.">
            <ReasonInput value={data.description} onChange={v => setData({ ...data, description: v })} minLength={10}
              placeholder="Opisz zmianę, powód biznesowy i spodziewany efekt." />
          </Field>
        </div>
      )}
      {step === "approvers" && (
        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Recipe + spec changes require QA + Technical sign-off.</div>
          <div style={{ display: "grid", gap: 8 }}>
            {["QA Manager (K. Lewandowska)", "Technical Lead (A. Majewska)", "Production Manager (T. Wiśniewski)", "R&D Lead (M. Szymczak)"].map(a => (
              <label key={a} style={{ display: "flex", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13 }}>
                <input type="checkbox" checked={data.approvers.includes(a)} onChange={() => toggleApprover(a)} />
                <span>{a}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

// -------- MODAL-07: ECO Approval (dual-path approve/reject) --------
const EcoApprovalModal = ({ open, onClose, onConfirm, data }) => {
  const [action, setAction] = React.useState("approve");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (!open) { setAction("approve"); setReason(""); } }, [open]);
  const eco = data || { id: "ECO-2044", title: "Redukcja soli w szynce plastrach −10%" };
  const rejectValid = action === "approve" || reason.length >= 10;
  return (
    <Modal open={open} onClose={onClose} title={"Review " + eco.id} subtitle={eco.title} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className={"btn btn-sm " + (action === "reject" ? "btn-danger" : "btn-primary")} disabled={!rejectValid}
          onClick={() => { onConfirm && onConfirm({ action, reason }); onClose(); }}>
          {action === "approve" ? "Approve ECO" : "Reject ECO"}
        </button>
      </>}>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4, background: action === "approve" ? "var(--green-050a)" : "#fff" }}>
          <input type="radio" checked={action === "approve"} onChange={() => setAction("approve")} />
          <div>
            <b>Approve</b>
            <div className="muted" style={{ fontSize: 11 }}>ECO moves to Implementing; changes publish on close.</div>
          </div>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4, background: action === "reject" ? "var(--red-050a)" : "#fff" }}>
          <input type="radio" checked={action === "reject"} onChange={() => setAction("reject")} />
          <div>
            <b>Reject</b>
            <div className="muted" style={{ fontSize: 11 }}>ECO closed; author is notified with reason.</div>
          </div>
        </label>
      </div>
      {action === "reject" && (
        <Field label="Reject reason" required help="Audit-logged, min 10 chars.">
          <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="np. Brak zgody QA na redukcję soli poniżej limitu mikrobiologicznego." />
        </Field>
      )}
    </Modal>
  );
};

// ============ 6. SPEC / SHELF-LIFE ============

// -------- MODAL-08: Spec Review (simple review) --------
const SpecReviewModal = ({ open, onClose, onConfirm, data }) => {
  const spec = data || { id: "SP-0421", name: "Kiełbasa śląska pieczona 450g", version: "v4" };
  return (
    <Modal open={open} onClose={onClose} title={"Review specification · " + spec.id} subtitle={spec.name + " · " + spec.version} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-primary btn-sm" onClick={() => { onConfirm && onConfirm(spec); onClose(); }}>Mark reviewed</button>
      </>}>
      <Summary rows={[
        { label: "Customer",       value: "Biedronka",        mono: false },
        { label: "Shelf life",     value: "21 dni",           mono: true },
        { label: "Storage",        value: "0–6°C",            mono: true },
        { label: "Net weight",     value: "450 g ± 2%",       mono: true },
        { label: "Pack format",    value: "MAP tray 180×140", mono: false },
        { label: "GS1 AIs",        value: "01, 17, 10, 21",   mono: true },
      ]} />
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: 12, marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
        <b>Nutritional claim:</b> "Źródło białka" (≥12% of energy from protein).<br/>
        <b>Marketing claim:</b> "Bez konserwantów dodanych" — azotyn naturalny z peklosoli.<br/>
        <b>Allergens on label:</b> gorczyca (ślad ryzyka).<br/>
      </div>
    </Modal>
  );
};

// -------- MODAL-09: Shelf-life Override (override with reason) --------
const ShelfLifeOverrideModal = ({ open, onClose, onConfirm, data }) => {
  const [newDays, setNewDays] = React.useState(data?.useBy || 21);
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (!open) { setReason(""); setNewDays(data?.useBy || 21); } }, [open, data]);
  const valid = reason.length >= 10 && newDays > 0;
  return (
    <Modal open={open} onClose={onClose} title="Override shelf life" subtitle={(data?.product || "FA5100 Kiełbasa śląska 450g") + " · regulatory preset: " + (data?.preset || "PL deli-cured")} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={() => { onConfirm && onConfirm({ newDays, reason }); onClose(); }}>Apply override</button>
      </>}>
      <div className="alert-amber alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>△</span><div><b>Override leaves the regulatory preset</b> — requires QA sign-off and is logged to the audit trail.</div>
      </div>
      <div className="ff-inline">
        <Field label="Current shelf life">
          <input value={(data?.useBy || 21) + " days"} readOnly style={{ background: "var(--gray-050)" }} />
        </Field>
        <Field label="New shelf life (days)" required>
          <input type="number" value={newDays} onChange={e => setNewDays(+e.target.value)} />
        </Field>
      </div>
      <Field label="Override reason" required help="Min 10 chars — audit-logged.">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="np. Zmiana parametrów MAP (30% CO₂) potwierdzona badaniem mikrobiologicznym nr 2026/04/17-A." />
      </Field>
    </Modal>
  );
};

// ============ 7. COSTING ============

// -------- MODAL-10: Cost Rollup Recompute (confirm non-destructive) --------
const CostRollupRecomputeModal = ({ open, onClose, onConfirm }) => (
  <Modal open={open} onClose={onClose} title="Recompute standard cost" subtitle="Re-roll BOM costs from current material & labor rates." size="sm"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={() => { onConfirm && onConfirm(); onClose(); }}>Recompute now</button>
    </>}>
    <div className="alert-blue alert-box" style={{ fontSize: 12, marginBottom: 10 }}>
      <span>ⓘ</span>
      <div>
        <b>Non-destructive</b> — creates a new snapshot alongside the existing std cost. Takes ~3 seconds for 42 BOMs.
      </div>
    </div>
    <Summary rows={[
      { label: "Products affected", value: "124",      mono: true },
      { label: "Active BOMs",       value: "42",       mono: true },
      { label: "Material rates",    value: "as of 2026-04-21", mono: true },
      { label: "Labor rates",       value: "2026 Q2",  mono: true },
    ]} />
  </Modal>
);

// ============ 8. D365 ============

// -------- MODAL-11: D365 Item Sync Confirm (confirm) --------
const D365ItemSyncConfirmModal = ({ open, onClose, onConfirm, data }) => (
  <Modal open={open} onClose={onClose} title="Run D365 delta sync" subtitle={data?.code ? ("Single item: " + data.code) : "All changed items since last delta"} size="default"
    foot={<>
      <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" onClick={() => { onConfirm && onConfirm(data); onClose(); }}>Run sync</button>
    </>}>
    <div className="alert-blue alert-box" style={{ fontSize: 12, marginBottom: 10 }}>
      <span>ⓘ</span>
      <div>This will push queued outbound items to <b>D365 PROD (CT-EU)</b>. You can monitor progress in the sync log.</div>
    </div>
    <Summary rows={[
      { label: "Queue size",   value: (D365_STATUS?.queueOut ?? 0) + " items", mono: true },
      { label: "Target env",   value: "D365 PROD (CT-EU)",                     mono: false },
      { label: "Last delta",   value: D365_STATUS?.lastDelta || "—",          mono: true },
      { label: "Connector",    value: "gateway v1.14.2",                      mono: true },
    ]} />
  </Modal>
);

// -------- MODAL-12: D365 Drift Resolve (destructive with reason) --------
const D365DriftResolveModal = ({ open, onClose, onConfirm, data }) => {
  const [direction, setDirection] = React.useState("mp_wins");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (!open) { setDirection("mp_wins"); setReason(""); } }, [open]);
  const drift = data || { id: "DRIFT-0413", entity: "Bom.lines[].qty", code: "B-0443", mp: "0.018", d365: "0.020" };
  const valid = reason.length >= 10;
  return (
    <Modal open={open} onClose={onClose} title="Resolve drift" subtitle={drift.id + " · " + drift.entity + " · " + drift.code} size="default"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger btn-sm" disabled={!valid} onClick={() => { onConfirm && onConfirm({ direction, reason, drift }); onClose(); }}>Apply resolution</button>
      </>}>
      <div className="alert-red alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>⚠</span><div>Destructive — the losing system will be overwritten on the next sync. Cannot be undone automatically.</div>
      </div>
      <Summary rows={[
        { label: "Entity",     value: drift.entity, mono: true },
        { label: "Item",       value: drift.code,   mono: true },
        { label: "MP value",   value: drift.mp,     mono: true },
        { label: "D365 value", value: drift.d365,   mono: true },
      ]} />
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <label style={{ display: "flex", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4, background: direction === "mp_wins" ? "var(--blue-050)" : "#fff" }}>
          <input type="radio" checked={direction === "mp_wins"} onChange={() => setDirection("mp_wins")} />
          <div><b>MP → D365</b><div className="muted" style={{ fontSize: 11 }}>Overwrite D365 with MonoPilot value.</div></div>
        </label>
        <label style={{ display: "flex", gap: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4, background: direction === "d365_wins" ? "var(--blue-050)" : "#fff" }}>
          <input type="radio" checked={direction === "d365_wins"} onChange={() => setDirection("d365_wins")} />
          <div><b>D365 → MP</b><div className="muted" style={{ fontSize: 11 }}>Pull D365 value into MonoPilot.</div></div>
        </label>
      </div>
      <Field label="Reason" required help="Audit-logged, min 10 chars.">
        <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="np. Pole skorygowane w MP — ECO-2044 czeka na synchronizację." />
      </Field>
    </Modal>
  );
};

// ============ 9. GALLERY ============

const TECH_MODAL_CATALOG = [
  { key: "productCreate",     name: "MODAL-01 · Product Create",             pattern: "Wizard (3 steps)",             comp: ProductCreateModal },
  { key: "bomVersionSave",    name: "MODAL-02 · BOM Version Save",           pattern: "Simple form w/ reason",        comp: BomVersionSaveModal },
  { key: "bomComponentAdd",   name: "MODAL-03 · BOM Component Add",          pattern: "Picker (search)",              comp: BomComponentAddModal },
  { key: "routingStepAdd",    name: "MODAL-04 · Routing Step Add",           pattern: "Simple form",                  comp: RoutingStepAddModal },
  { key: "allergenDecl",      name: "MODAL-05 · Allergen Declaration",       pattern: "Confirm w/ checklist",         comp: AllergenDeclarationModal },
  { key: "ecoChangeReq",      name: "MODAL-06 · ECO Change Request",         pattern: "Wizard (2 steps)",             comp: EcoChangeRequestModal },
  { key: "ecoApproval",       name: "MODAL-07 · ECO Approval",               pattern: "Dual-path (approve/reject)",   comp: EcoApprovalModal },
  { key: "specReview",        name: "MODAL-08 · Spec Review",                pattern: "Simple review",                comp: SpecReviewModal },
  { key: "shelfLifeOverride", name: "MODAL-09 · Shelf-life Override",        pattern: "Override with reason",         comp: ShelfLifeOverrideModal },
  { key: "costRollupRecompute", name: "MODAL-10 · Cost Rollup Recompute",    pattern: "Confirm non-destructive",      comp: CostRollupRecomputeModal },
  { key: "d365ItemSync",      name: "MODAL-11 · D365 Item Sync Confirm",     pattern: "Confirm (non-destructive)",    comp: D365ItemSyncConfirmModal },
  { key: "d365DriftResolve",  name: "MODAL-12 · D365 Drift Resolve",         pattern: "Destructive with reason",      comp: D365DriftResolveModal },
  { key: "deleteBomVersion",  name: "MODAL-13 · Delete BOM Version",         pattern: "Destructive type-to-confirm",  comp: DeleteBomVersionModal },
  { key: "archiveProduct",    name: "MODAL-14 · Archive Product",            pattern: "Destructive with reason",      comp: ArchiveProductModal },
];

const TechModalGallery = ({ onNav }) => {
  const [open, setOpen] = React.useState(null);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="breadcrumb"><a onClick={() => onNav && onNav("dashboard")} style={{ cursor: "pointer" }}>Technical</a> · Modal gallery</div>
          <h1 className="page-title">Modal gallery</h1>
          <div className="muted" style={{ fontSize: 12 }}>
            {TECH_MODAL_CATALOG.length} components implementing UX patterns · follows <span className="mono">_shared/MODAL-SCHEMA.md</span>
          </div>
        </div>
        <div>
          <span className="badge badge-blue" style={{ fontSize: 10 }}>Pattern reference</span>
        </div>
      </div>
      <div className="alert-blue alert-box" style={{ marginBottom: 14, fontSize: 12 }}>
        <span>ⓘ</span>
        <div>
          <b>Click any card to open the modal.</b> All modals share the same primitives (<span className="mono">Modal</span>, <span className="mono">Stepper</span>, <span className="mono">Field</span>, <span className="mono">ReasonInput</span>, <span className="mono">Summary</span>) from <span className="mono">_shared/modals.jsx</span>.
        </div>
      </div>
      <div className="gallery-grid">
        {TECH_MODAL_CATALOG.map(m => (
          <div key={m.key} className="gallery-card" onClick={() => setOpen(m.key)}>
            <div className="gallery-pattern">{m.pattern}</div>
            <div className="gallery-name">{m.name}</div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>Open modal →</button>
          </div>
        ))}
      </div>
      {TECH_MODAL_CATALOG.map(m => (
        <m.comp key={m.key} open={open === m.key} onClose={() => setOpen(null)} />
      ))}
    </>
  );
};

Object.assign(window, {
  ProductCreateModal, ArchiveProductModal,
  BomVersionSaveModal, BomComponentAddModal, DeleteBomVersionModal,
  RoutingStepAddModal,
  AllergenDeclarationModal,
  EcoChangeRequestModal, EcoApprovalModal,
  SpecReviewModal, ShelfLifeOverrideModal,
  CostRollupRecomputeModal,
  D365ItemSyncConfirmModal, D365DriftResolveModal,
  TechModalGallery, TECH_MODAL_CATALOG,
});
