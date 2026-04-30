// ============================================================================
// NPD module · gate-screens.jsx — Department gate strip + advance/close UI
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// gate-screens.jsx — NPD-004 · NPD-005 · NPD-010 · NPD-011

const GATE_INFO = {
  G0: { label: "Idea",          next: "G1", nextLabel: "Feasibility",   requiresApproval: false },
  G1: { label: "Feasibility",   next: "G2", nextLabel: "Business Case", requiresApproval: false },
  G2: { label: "Business Case", next: "G3", nextLabel: "Development",   requiresApproval: false },
  G3: { label: "Development",   next: "G4", nextLabel: "Testing",       requiresApproval: true  },
  G4: { label: "Testing",       next: null, nextLabel: "Launched",      requiresApproval: true  },
};

const STAGE_TO_GATE = { brief: "G0", recipe: "G1", trial: "G2", approval: "G3", handoff: "G4" };
const GATE_ORDER = ["G0","G1","G2","G3","G4"];

const GATE_CHECKLISTS = {
  G0: { categories: [
    { id: "business", label: "BUSINESS", items: [
      { id: "g0-b1", text: "Product concept documented",        required: true,  done: true,  by: "K. Walker", at: "2025-10-01", file: null },
      { id: "g0-b2", text: "Market opportunity identified",     required: true,  done: true,  by: "K. Walker", at: "2025-10-03", file: null },
      { id: "g0-b3", text: "Preliminary cost target set",       required: false, done: true,  by: "T. Brown",  at: "2025-10-04", file: null },
    ]},
    { id: "technical", label: "TECHNICAL", items: [
      { id: "g0-t1", text: "Initial feasibility check",         required: true,  done: true,  by: "J. Lewis",  at: "2025-10-05", file: null },
    ]},
  ]},
  G1: { categories: [
    { id: "technical", label: "TECHNICAL", items: [
      { id: "g1-t1", text: "Technical feasibility confirmed",   required: true,  done: true,  by: "J. Lewis",  at: "2025-10-20", file: null },
      { id: "g1-t2", text: "Key ingredients identified",        required: true,  done: true,  by: "J. Lewis",  at: "2025-10-18", file: "ingredient_spec.pdf" },
      { id: "g1-t3", text: "Initial allergen assessment",       required: true,  done: true,  by: "A. Davis",  at: "2025-10-22", file: "allergen_assess_v1.pdf" },
    ]},
    { id: "business", label: "BUSINESS", items: [
      { id: "g1-b1", text: "Rough cost estimate",               required: true,  done: true,  by: "T. Brown",  at: "2025-10-25", file: "cost_estimate_prelim.xlsx" },
      { id: "g1-b2", text: "Competitor benchmark review",       required: false, done: true,  by: "K. Walker", at: "2025-10-23", file: "Cranswick-benchmark.xlsx" },
    ]},
  ]},
  G2: { categories: [
    { id: "technical", label: "TECHNICAL", items: [
      { id: "g2-t1", text: "Detailed ingredient specification", required: true,  done: true,  by: "J. Lewis",  at: "2025-11-05", file: "ingredient_spec_final.pdf" },
      { id: "g2-t2", text: "Shelf life assessment",             required: true,  done: true,  by: "J. Lewis",  at: "2025-11-08", file: null },
      { id: "g2-t3", text: "Packaging compatibility check",     required: false, done: false, by: null,        at: null,         file: null },
    ]},
    { id: "business", label: "BUSINESS", items: [
      { id: "g2-b1", text: "Business case documented",          required: true,  done: true,  by: "T. Brown",  at: "2025-11-10", file: "business_case.docx" },
      { id: "g2-b2", text: "Target cost approved",              required: true,  done: true,  by: "T. Brown",  at: "2025-11-12", file: null },
      { id: "g2-b3", text: "Target margin confirmed",           required: true,  done: false, by: null,        at: null,         file: null },
      { id: "g2-b4", text: "Resource plan approved",            required: true,  done: false, by: null,        at: null,         file: null },
      { id: "g2-b5", text: "Market research summary",           required: false, done: true,  by: "K. Walker", at: "2025-11-07", file: null },
    ]},
    { id: "compliance", label: "COMPLIANCE", items: [
      { id: "g2-c1", text: "Regulatory pathway identified",     required: true,  done: true,  by: "A. Davis",  at: "2025-11-06", file: null },
      { id: "g2-c2", text: "Initial label requirements",        required: false, done: true,  by: "A. Davis",  at: "2025-11-09", file: null },
      { id: "g2-c3", text: "Preliminary HACCP considerations",  required: false, done: false, by: null,        at: null,         file: null },
    ]},
  ]},
  G3: { categories: [
    { id: "technical", label: "TECHNICAL", items: [
      { id: "g3-t1", text: "Formulation created and locked",    required: true,  done: false, by: null, at: null, file: null },
      { id: "g3-t2", text: "Lab trial batches executed (min 3)",required: true,  done: false, by: null, at: null, file: null },
      { id: "g3-t3", text: "Allergen declaration validated",    required: true,  done: false, by: null, at: null, file: null },
      { id: "g3-t4", text: "Sensory evaluation passed",         required: true,  done: false, by: null, at: null, file: null },
    ]},
    { id: "business", label: "BUSINESS", items: [
      { id: "g3-b1", text: "Cost estimate within ±5% of target",required: true,  done: false, by: null, at: null, file: null },
      { id: "g3-b2", text: "Retailer specification confirmed",  required: false, done: false, by: null, at: null, file: null },
    ]},
    { id: "compliance", label: "COMPLIANCE", items: [
      { id: "g3-c1", text: "Nutrition declaration calculated",  required: true,  done: false, by: null, at: null, file: null },
      { id: "g3-c2", text: "Label copy approved by QA",         required: true,  done: false, by: null, at: null, file: null },
    ]},
  ]},
  G4: { categories: [
    { id: "technical", label: "TECHNICAL", items: [
      { id: "g4-t1", text: "Pilot run on production line",      required: true,  done: false, by: null, at: null, file: null },
      { id: "g4-t2", text: "Production yield ≥ target",         required: true,  done: false, by: null, at: null, file: null },
      { id: "g4-t3", text: "CCP log verified",                  required: true,  done: false, by: null, at: null, file: null },
    ]},
    { id: "compliance", label: "COMPLIANCE", items: [
      { id: "g4-c1", text: "Microbiological testing passed",    required: true,  done: false, by: null, at: null, file: null },
      { id: "g4-c2", text: "Shelf-life validation complete",    required: true,  done: false, by: null, at: null, file: null },
      { id: "g4-c3", text: "Final label approved (BRCGS)",      required: true,  done: false, by: null, at: null, file: null },
    ]},
    { id: "business", label: "BUSINESS", items: [
      { id: "g4-b1", text: "Commercial order placed",           required: true,  done: false, by: null, at: null, file: null },
      { id: "g4-b2", text: "Dispatch readiness confirmed",      required: false, done: false, by: null, at: null, file: null },
    ]},
  ]},
};

const APPROVAL_HISTORY_SAMPLE = [
  { id: "ah-2", gate: "G1", gateLabel: "Feasibility",   result: "approved", approver: "J. Lewis",    role: "NPD Lead",   date: "2025-10-28", eSigned: false, notes: "Technical feasibility confirmed. All ingredients commercially available within cost target. Proceed to business case." },
  { id: "ah-1", gate: "G0", gateLabel: "Idea",          result: "approved", approver: "K. Walker",   role: "NPD Manager", date: "2025-10-06", eSigned: false, notes: "Product concept approved. Market opportunity validated by commercial team." },
];

// ——— helper ———
const resolveItems = (gate, overrides) =>
  (GATE_CHECKLISTS[gate]?.categories || []).flatMap(c =>
    c.items.map(item => ({ ...item, done: overrides[item.id] !== undefined ? overrides[item.id] : item.done }))
  );

const getBlockers = (gate, overrides) =>
  resolveItems(gate, overrides).filter(i => i.required && !i.done);

// ——————————————————————————————————————————————————————
// NPD-004: GateChecklistPanel
// ——————————————————————————————————————————————————————
const GateChecklistPanel = ({ project, openModal }) => {
  const currentGate = STAGE_TO_GATE[project?.stage] || "G2";
  const currentGateIdx = GATE_ORDER.indexOf(currentGate);
  const [expanded, setExpanded] = React.useState(() => new Set([currentGate]));
  const [overrides, setOverrides] = React.useState({});

  const toggleExpand = (g) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(g) ? n.delete(g) : n.add(g);
    return n;
  });

  const toggleItem = (id, current) => setOverrides(prev => ({ ...prev, [id]: !current }));

  const allItems = GATE_ORDER.flatMap(g => resolveItems(g, overrides));
  const overallPct = allItems.length ? Math.round(allItems.filter(i => i.done).length / allItems.length * 100) : 0;
  const currentBlockers = getBlockers(currentGate, overrides);
  const info = GATE_INFO[currentGate];

  return (
    <div>
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Gate Checklist</div>
            <div className="muted" style={{ fontSize: 12 }}>Current gate: <strong>{currentGate} — {info.label}</strong></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Overall progress</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 160, height: 8, background: "var(--gray-100)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${overallPct}%`, height: "100%", background: overallPct === 100 ? "var(--green)" : "var(--blue)", transition: "width 0.3s" }} />
              </div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{overallPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* current + past gates, newest first */}
      {GATE_ORDER.slice(0, currentGateIdx + 1).slice().reverse().map(gateKey => {
        const isCurrent = gateKey === currentGate;
        const gateItems = resolveItems(gateKey, overrides);
        const done = gateItems.filter(i => i.done).length;
        const pct = gateItems.length ? Math.round(done / gateItems.length * 100) : 0;
        const blockers = getBlockers(gateKey, overrides);
        const isOpen = expanded.has(gateKey);

        return (
          <div key={gateKey} className="card" style={{ marginBottom: 8, border: isCurrent ? "2px solid var(--blue)" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => toggleExpand(gateKey)}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, background: pct === 100 ? "var(--green)" : isCurrent ? "var(--blue)" : "var(--gray-100)", color: pct === 100 || isCurrent ? "#fff" : "var(--muted)" }}>
                {pct === 100 ? "✓" : gateKey}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{gateKey}: {GATE_INFO[gateKey].label}</span>
                  {isCurrent && <span className="badge badge-blue">Current</span>}
                  {blockers.length > 0 && isCurrent && <span className="badge badge-amber">{blockers.length} blocking</span>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 100, height: 6, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--green)" : "var(--blue)" }} />
                </div>
                <span className="muted mono" style={{ fontSize: 11, minWidth: 52 }}>{done}/{gateItems.length}</span>
                <span className="muted" style={{ fontSize: 11 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                {(GATE_CHECKLISTS[gateKey]?.categories || []).map(cat => {
                  const catItems = cat.items.map(i => ({ ...i, done: overrides[i.id] !== undefined ? overrides[i.id] : i.done }));
                  return (
                    <div key={cat.id} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.8, marginBottom: 6 }}>
                        {cat.label} ({catItems.filter(x => x.done).length}/{catItems.length})
                      </div>
                      {catItems.map(item => {
                        const isBlocking = item.required && !item.done;
                        return (
                          <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", marginBottom: 4, borderRadius: 6, border: `1px solid ${isBlocking ? "#fca5a5" : "var(--border)"}`, background: isBlocking ? "#fef2f2" : item.done ? "#f0fdf4" : "#fafafa" }}>
                            <input type="checkbox" checked={item.done} onChange={() => toggleItem(item.id, item.done)} style={{ marginTop: 2, cursor: "pointer" }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: item.done ? 400 : 500, color: isBlocking ? "#991b1b" : undefined, textDecoration: item.done ? "line-through" : undefined, opacity: item.done ? 0.65 : 1 }}>
                                  {item.text}
                                </span>
                                <span className={`badge badge-${item.required ? "blue" : "gray"}`} style={{ fontSize: 10 }}>{item.required ? "Required" : "Optional"}</span>
                                {isBlocking && <span className="badge badge-red" style={{ fontSize: 10 }}>Blocking</span>}
                                {item.file && <span className="muted" style={{ fontSize: 11 }}>📎 {item.file}</span>}
                              </div>
                              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                                {item.done && item.by ? `Completed by ${item.by} · ${item.at}` : "Not started"}
                              </div>
                            </div>
                            {!item.done && (
                              <button className="btn btn-secondary btn-sm" style={{ fontSize: 11, flexShrink: 0 }} onClick={e => e.stopPropagation()}>+ Attach</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* future gates — grayed out */}
      {GATE_ORDER.slice(currentGateIdx + 1).map(gateKey => (
        <div key={gateKey} className="card" style={{ marginBottom: 8, opacity: 0.45 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "var(--gray-100)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{gateKey}</div>
            <span style={{ fontWeight: 500, color: "var(--muted)" }}>{gateKey}: {GATE_INFO[gateKey].label}</span>
            <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>Not started</span>
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="card" style={{ marginTop: 4 }}>
        {currentBlockers.length > 0 ? (
          <div className="alert alert-amber" style={{ marginBottom: 12 }}>
            ⚠ {currentBlockers.length} blocking {currentBlockers.length === 1 ? "item" : "items"} must be completed before advancing to {info.next}: {info.nextLabel}.
          </div>
        ) : info.next ? (
          <div className="alert alert-green" style={{ marginBottom: 12 }}>
            ✓ All required items for {currentGate} complete. Ready to advance to {info.nextLabel}.
          </div>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {info.next && (
            <button
              className={`btn ${currentBlockers.length === 0 ? "btn-primary" : "btn-secondary"}`}
              disabled={currentBlockers.length > 0}
              onClick={() => openModal && openModal(info.requiresApproval ? "gateApproval" : "advanceGate", { project })}>
              {info.requiresApproval ? "Request Approval →" : `Advance to ${info.next}: ${info.nextLabel} →`}
            </button>
          )}
          {!info.next && currentBlockers.length === 0 && (
            <button className="btn btn-primary">Mark as Launched ✓</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ——————————————————————————————————————————————————————
// NPD-005: AdvanceGateModal
// ——————————————————————————————————————————————————————
const AdvanceGateModal = ({ open, onClose, data }) => {
  const project = data?.project || {};
  const currentGate = STAGE_TO_GATE[project.stage] || "G2";
  const info = GATE_INFO[currentGate];
  const [notes, setNotes] = React.useState("");
  const [submitting, setSub] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const items = resolveItems(currentGate, {});
  const blockers = items.filter(i => i.required && !i.done);
  const requiredItems = items.filter(i => i.required);
  const requiredDone = requiredItems.filter(i => i.done).length;
  const pct = items.length ? Math.round(items.filter(i => i.done).length / items.length * 100) : 0;
  const canAdvance = blockers.length === 0 && notes.trim().length > 0;

  const handleSubmit = () => {
    setSub(true);
    setTimeout(() => { setDone(true); setTimeout(onClose, 1000); }, 800);
  };

  return (
    <Modal open={open} onClose={onClose} size="default" title="Advance Gate"
      foot={!done ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!canAdvance || submitting} onClick={handleSubmit}>
          {submitting ? "Processing…" : `Advance to ${info.next}: ${info.nextLabel}`}
        </button>
      </> : null}>

      {done ? (
        <div className="alert alert-green" style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div style={{ fontWeight: 600 }}>Gate advanced to {info.next}: {info.nextLabel}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Audit log updated</div>
        </div>
      ) : (
        <>
          {/* Gate transition */}
          <div style={{ background: "var(--gray-050,#f8fafc)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 18px", marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Gate Transition</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: 10, background: "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, margin: "0 auto 4px" }}>{currentGate}</div>
                <div className="muted" style={{ fontSize: 11 }}>{info.label}</div>
                <div className="muted" style={{ fontSize: 10 }}>Current</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", fontSize: 18, color: blockers.length ? "var(--amber)" : "var(--green)" }}>
                {blockers.length ? "- - - - >" : "══════>"}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: 10, background: "var(--gray-100)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, margin: "0 auto 4px" }}>{info.next}</div>
                <div className="muted" style={{ fontSize: 11 }}>{info.nextLabel}</div>
                <div className="muted" style={{ fontSize: 10 }}>Target</div>
              </div>
            </div>
            {info.requiresApproval && (
              <div className="alert alert-blue" style={{ marginTop: 10, fontSize: 12 }}>
                🛡 Approval Required — Manager/Director must sign off on this gate.
              </div>
            )}
          </div>

          {/* Checklist summary */}
          <div style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Checklist Summary — {currentGate}: {info.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 8, background: "var(--gray-100)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--green)" : "var(--blue)" }} />
              </div>
              <span className="mono" style={{ fontSize: 12 }}>{pct}%</span>
            </div>
            <div style={{ maxHeight: 150, overflowY: "auto" }}>
              {items.map(item => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13 }}>
                  <span style={{ color: item.done ? "var(--green)" : "#ef4444", fontWeight: 700 }}>{item.done ? "✓" : "✗"}</span>
                  <span style={{ flex: 1, color: item.done ? "var(--muted)" : undefined }}>{item.text}</span>
                  <span className={`badge badge-${item.done ? "green" : item.required ? "red" : "gray"}`} style={{ fontSize: 10 }}>
                    {item.done ? "Done" : item.required ? "Blocking" : "Optional"}
                  </span>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{requiredDone} of {requiredItems.length} required items complete</div>
          </div>

          {/* Blockers */}
          {blockers.length > 0 ? (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: "#991b1b", marginBottom: 6 }}>⚠ Blockers ({blockers.length})</div>
              {blockers.map(b => (
                <div key={b.id} style={{ fontSize: 12, color: "#7f1d1d", marginBottom: 3 }}>✗ {b.text}</div>
              ))}
            </div>
          ) : (
            <div className="alert alert-green" style={{ marginBottom: 16, fontSize: 12 }}>✓ No blockers — ready to advance!</div>
          )}

          {/* Notes */}
          <div className="field">
            <label>Gate Advancement Notes <span style={{ color: "var(--red)" }}>*</span></label>
            <textarea rows="3"
              placeholder="Summarise completion, conditions, or observations for the audit trail…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={blockers.length > 0}
              style={{ opacity: blockers.length > 0 ? 0.5 : 1 }} />
            <div className="muted" style={{ fontSize: 11 }}>Required for audit trail</div>
          </div>
        </>
      )}
    </Modal>
  );
};

// ——————————————————————————————————————————————————————
// NPD-010: GateApprovalModal
// ——————————————————————————————————————————————————————
const GateApprovalModal = ({ open, onClose, data }) => {
  const project = data?.project || {};
  const currentGate = STAGE_TO_GATE[project.stage] || "G3";
  const info = GATE_INFO[currentGate];
  const items = resolveItems(currentGate, {});
  const requiredItems = items.filter(i => i.required);
  const requiredDone = requiredItems.filter(i => i.done).length;
  const pct = items.length ? Math.round(items.filter(i => i.done).length / items.length * 100) : 0;

  const [decision, setDecision] = React.useState("approve");
  const [notes, setNotes] = React.useState("");
  const [eSigOpen, setESigOpen] = React.useState(false);
  const [eSigPwd, setESigPwd] = React.useState("");
  const [eSigConfirm, setESigConfirm] = React.useState(false);
  const [submitting, setSub] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const canSubmit = notes.trim().length >= 10;

  const handleSubmit = () => {
    if (decision === "approve") { setESigOpen(true); }
    else { setSub(true); setTimeout(() => { setDone(true); setTimeout(onClose, 1200); }, 800); }
  };

  const handleSign = () => {
    setESigOpen(false);
    setSub(true);
    setTimeout(() => { setDone(true); setTimeout(onClose, 1500); }, 800);
  };

  return (
    <Modal open={open} onClose={onClose} size="default" title="Gate Approval"
      foot={!eSigOpen && !done ? <>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className={`btn btn-sm`}
          style={decision === "reject" ? { background: "#ef4444", color: "#fff" } : { background: "var(--green)", color: "#fff" }}
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}>
          {submitting ? "Processing…" : decision === "approve" ? "Submit Approval" : "Submit Rejection"}
        </button>
      </> : null}>

      {done && (
        <div className="alert alert-green" style={{ textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{decision === "approve" ? "✓" : "✗"}</div>
          <div style={{ fontWeight: 600 }}>Gate advancement {decision === "approve" ? "approved" : "rejected"}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Notification sent · Audit log updated</div>
        </div>
      )}

      {eSigOpen && !done && (
        <div style={{ border: "2px solid var(--blue)", borderRadius: 10, padding: 20, background: "#eff6ff" }}>
          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>🔐 E-Signature Required</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>Confirm your identity. This creates a legally-binding audit record.</div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={eSigPwd} onChange={e => setESigPwd(e.target.value)} autoFocus placeholder="Enter your password" />
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginTop: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={eSigConfirm} onChange={e => setESigConfirm(e.target.checked)} style={{ marginTop: 2 }} />
            <span>I confirm this gate approval and understand it creates an auditable signature record.</span>
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setESigOpen(false)}>Back</button>
            <button className="btn btn-primary btn-sm" disabled={!eSigPwd || !eSigConfirm} onClick={handleSign}>Confirm & Sign</button>
          </div>
        </div>
      )}

      {!eSigOpen && !done && (
        <>
          {/* Project header */}
          <div style={{ background: "var(--gray-050,#f8fafc)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
            <div className="muted mono" style={{ fontSize: 11 }}>{project.code}</div>
            <div style={{ fontWeight: 600 }}>{project.name || "Project"}</div>
          </div>

          {/* Gate transition visual */}
          <div style={{ background: decision === "reject" ? "#fef2f2" : "var(--gray-050,#f8fafc)", border: `1px solid ${decision === "reject" ? "#fca5a5" : "var(--border)"}`, borderRadius: 8, padding: "12px 16px", marginBottom: 14 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Gate Transition</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: decision === "reject" ? "#ef4444" : "var(--blue)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, margin: "0 auto 4px" }}>{currentGate}</div>
                <div className="muted" style={{ fontSize: 11 }}>{info.label}</div>
              </div>
              <div style={{ flex: 1, textAlign: "center", fontSize: 16 }}>
                {decision === "approve" ? "══════>" : "— — X — —"}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--gray-100)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, margin: "0 auto 4px" }}>{info.next || "✓"}</div>
                <div className="muted" style={{ fontSize: 11 }}>{info.nextLabel}</div>
              </div>
            </div>
            {decision === "reject" && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#991b1b", fontWeight: 500 }}>⚠ Rejection — project remains at {currentGate}: {info.label}</div>
            )}
          </div>

          {/* Checklist status */}
          <div style={{ marginBottom: 14 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Checklist Completion</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, height: 6, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "var(--green)" : "var(--blue)" }} />
              </div>
              <span className="mono" style={{ fontSize: 12 }}>{pct}%</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>{requiredDone} of {requiredItems.length} required items complete</div>
          </div>

          {/* Decision radios */}
          <div style={{ marginBottom: 14 }}>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Decision</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { v: "approve", label: "Approve Gate Advancement", col: "var(--green)", bg: "#f0fdf4" },
                { v: "reject",  label: "Reject Gate Advancement",  col: "#ef4444",       bg: "#fef2f2" },
              ].map(opt => (
                <label key={opt.v} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: `2px solid ${decision === opt.v ? opt.col : "var(--border)"}`, borderRadius: 8, cursor: "pointer", background: decision === opt.v ? opt.bg : "#fff" }}>
                  <input type="radio" name="gate-decision" value={opt.v} checked={decision === opt.v} onChange={() => setDecision(opt.v)} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: decision === opt.v ? opt.col : undefined }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="field">
            <label>{decision === "approve" ? "Approval Notes" : "Rejection Reason"} <span style={{ color: "var(--red)" }}>*</span></label>
            <textarea rows="3"
              placeholder={decision === "approve" ? "Basis for approval (min 10 chars)…" : "Explain why this gate is being rejected and what must be addressed…"}
              value={notes}
              onChange={e => setNotes(e.target.value)} />
            {notes.length > 0 && notes.trim().length < 10 && (
              <div style={{ fontSize: 11, color: "var(--red)", marginTop: 2 }}>Minimum 10 characters required</div>
            )}
            <div className="muted" style={{ fontSize: 11 }}>Required for audit trail</div>
          </div>
        </>
      )}
    </Modal>
  );
};

// ——————————————————————————————————————————————————————
// NPD-011: ApprovalHistoryTimeline
// ——————————————————————————————————————————————————————
const ApprovalHistoryTimeline = ({ project }) => {
  const [sigExpanded, setSigExpanded] = React.useState(new Set());

  const toggleSig = (id) => setSigExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const history = APPROVAL_HISTORY_SAMPLE;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Approval History</div>
        <span className="muted" style={{ fontSize: 12 }}>{history.length} approval{history.length !== 1 ? "s" : ""} recorded</span>
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🕐</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No approvals recorded yet</div>
          <div className="muted" style={{ fontSize: 13 }}>Gate approvals will appear here as the project advances.</div>
        </div>
      ) : (
        <div style={{ position: "relative", paddingTop: 8 }}>
          {/* vertical line */}
          <div style={{ position: "absolute", left: 15, top: 24, bottom: 8, width: 2, background: "var(--border)", zIndex: 0 }} />

          {history.map(entry => {
            const approved = entry.result === "approved";
            const sigOpen = sigExpanded.has(entry.id);
            return (
              <div key={entry.id} style={{ display: "flex", gap: 16, marginBottom: 20, position: "relative" }}>
                {/* Icon */}
                <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, zIndex: 1, background: approved ? "var(--green)" : "#ef4444", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, boxShadow: "0 0 0 3px #fff" }}>
                  {approved ? "✓" : "✗"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600 }}>{entry.gateLabel} — {entry.gate}</span>
                    <span className={`badge badge-${approved ? "green" : "red"}`} style={{ fontSize: 11 }}>{approved ? "APPROVED" : "REJECTED"}</span>
                    {entry.eSigned && <span title="E-signed">🔐</span>}
                    <span className="muted mono" style={{ fontSize: 11, marginLeft: "auto" }}>{entry.date}</span>
                  </div>
                  <div style={{ background: approved ? "#f0fdf4" : "#fef2f2", border: `1px solid ${approved ? "#bbf7d0" : "#fca5a5"}`, borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{entry.approver}</span>
                      <span className="muted" style={{ fontSize: 12 }}>({entry.role})</span>
                      {entry.eSigned && <span className="muted" style={{ fontSize: 11 }}>· E-signed</span>}
                    </div>
                    <div style={{ fontSize: 13, color: approved ? "#166534" : "#991b1b" }}>{entry.notes}</div>
                    {entry.eSigned && (
                      <>
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, fontSize: 11, padding: "2px 8px" }} onClick={() => toggleSig(entry.id)}>
                          {sigOpen ? "Hide signature details ▲" : "View signature details ▼"}
                        </button>
                        {sigOpen && (
                          <div style={{ marginTop: 10, padding: "10px 12px", background: "#fff", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 8 }}>E-Signature Details</div>
                            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "4px 0" }}>
                              <span className="muted">Signer</span><span>{entry.approver}</span>
                              <span className="muted">Role</span><span>{entry.role}</span>
                              <span className="muted">Timestamp</span><span className="mono">{entry.date}T10:30:00Z</span>
                              <span className="muted">Certificate ID</span><span className="mono">SHA256:a8f3b2…c9012</span>
                              <span className="muted">Verification</span><span style={{ color: "var(--green)", fontWeight: 500 }}>✓ Valid — Signature verified</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

Object.assign(window, {
  GateChecklistPanel,
  AdvanceGateModal,
  GateApprovalModal,
  ApprovalHistoryTimeline,
  GATE_INFO,
  STAGE_TO_GATE,
  GATE_ORDER,
  GATE_CHECKLISTS,
});
