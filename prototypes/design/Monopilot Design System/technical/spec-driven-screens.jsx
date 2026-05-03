// ============================================================
//  03-TECHNICAL — Dedicated spec-driven prototype surfaces
//  (Wave0 closure for TEC-014 / TEC-025 / TEC-031 / TEC-045 /
//   TEC-052 + FactorySpec+BOM bundle approval modal).
//
//  PRD/UX remains the canonical source of truth — these screens
//  exist so T3-ui parity AC anchors point at first-class layouts
//  rather than only adjacent layout primitives.
//
//  Red-line overlay applied here:
//   - FG / WIP naming (no FA, no PR-codes)
//   - factory_spec / internal_product_spec (Technical-owned)
//   - shared BOM SSOT, clone-on-write banners on snapshot views
//   - Quality owns lab_results lifecycle (Technical read-only)
//   - D365 is an optional side-effect / import source only
//
//  Primitives (Modal, Stepper, Field, ReasonInput, Summary) come
//  from _shared/modals.jsx; PageHeader is defined in other-screens.jsx;
//  KPI comes from _shared/primitives.jsx — do not redefine.
// ============================================================


// ============ TEC-014 · Bulk Import CSV (spec-driven wizard) ============

const BulkImportCsvScreen = ({ onBack }) => {
  const [step, setStep] = React.useState("upload");
  const [completed, setCompleted] = React.useState(new Set());
  const [scope, setScope] = React.useState("rm_supplier_specs");
  const [filename, setFilename] = React.useState("rm-2026-q2.csv");
  const [reason, setReason] = React.useState("");

  const steps = [
    { key: "upload",   label: "Upload" },
    { key: "validate", label: "Validate rows" },
    { key: "diff",     label: "Diff preview" },
    { key: "confirm",  label: "Confirm + audit" },
  ];

  const validation = [
    { row: 12, kind: "error",   col: "code",     msg: "Duplicate of existing FG5101 (org_id=ORG-001)." },
    { row: 17, kind: "warning", col: "supplier", msg: "Supplier S-202 not on approved supplier list — supplier_specs upload required first." },
    { row: 24, kind: "warning", col: "uom",      msg: "Trailing whitespace; will be normalised on import." },
    { row: 41, kind: "error",   col: "category", msg: "Unknown category 'cured-meet'; valid set: cured-meat, deli, ready-meal, frozen." },
    { row: 58, kind: "info",    col: "shelf",    msg: "Shelf-life 21 d matches PL deli-cured regulatory preset — no override needed." },
  ];

  const diffRows = [
    { code: "WIP-RO-0000017", op: "create", field: "—",                 was: "—",        next: "Mortadela półprodukt", srcCol: "B" },
    { code: "FG5117",         op: "create", field: "—",                 was: "—",        next: "Mortadela 200g",       srcCol: "B" },
    { code: "FG5101",         op: "update", field: "spec.shelfDays",    was: "21",       next: "23",                   srcCol: "M" },
    { code: "RM-1014",        op: "update", field: "supplier.primary",  was: "S-101",    next: "S-202",                srcCol: "Q" },
    { code: "RM-1014",        op: "update", field: "supplier_specs",    was: "—",        next: "Linked SUP-2026-04-12",srcCol: "R" },
    { code: "RM-3001",        op: "noop",   field: "cost",              was: "12.40 zł", next: "12.40 zł",             srcCol: "U" },
  ];

  const counts = {
    create: diffRows.filter(d => d.op === "create").length,
    update: diffRows.filter(d => d.op === "update").length,
    noop:   diffRows.filter(d => d.op === "noop").length,
    errors: validation.filter(v => v.kind === "error").length,
    warns:  validation.filter(v => v.kind === "warning").length,
  };

  const goNext = () => {
    setCompleted(new Set([...completed, step]));
    const order = ["upload", "validate", "diff", "confirm"];
    const i = order.indexOf(step);
    if (i < order.length - 1) setStep(order[i + 1]);
  };
  const goBack = () => {
    const order = ["upload", "validate", "diff", "confirm"];
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  const validateValid = counts.errors === 0;
  const confirmValid = reason.length >= 10 && validateValid;

  return (
    <div data-prototype-label="bulk_import_csv_screen">
      <PageHeader title="Bulk import (CSV)" breadcrumb={<><a onClick={onBack} style={{ cursor: "pointer" }}>Technical</a> › Items › Import</>}
        sub="Spec-driven Wave0 surface (TEC-014). Org-scoped wizard for FG / WIP / RM / supplier_specs rows. Source of truth: 03-TECHNICAL-PRD §6.5 and prototypes/design/03-TECHNICAL-UX.md."
        actions={<button className="btn btn-secondary btn-sm" onClick={onBack}>← Back to items</button>} />

      <Stepper steps={steps} current={step} completed={completed} />

      {step === "upload" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginTop: 14 }}>
          <Field label="Import scope" required help="Selects which template + validation profile is used. supplier_specs rows require supplier_spec.pdf upload before catalog rows can reference S-202.">
            <select value={scope} onChange={e => setScope(e.target.value)}>
              <option value="fg">FG catalog (FG-codes only)</option>
              <option value="wip">WIP / intermediates (WIP-&lt;suffix&gt;-NNN)</option>
              <option value="rm">RM (raw materials)</option>
              <option value="rm_supplier_specs">RM + supplier_specs (combined)</option>
            </select>
          </Field>
          <Field label="CSV file" required>
            <input value={filename} onChange={e => setFilename(e.target.value)} placeholder="filename.csv" style={{ fontFamily: "var(--font-mono)" }} />
          </Field>
          <div className="alert-blue alert-box" style={{ fontSize: 12 }}>
            <span>ⓘ</span>
            <div>
              Templates: <a style={{ color: "var(--blue)", cursor: "pointer" }}>FG.csv</a> · <a style={{ color: "var(--blue)", cursor: "pointer" }}>WIP.csv</a> · <a style={{ color: "var(--blue)", cursor: "pointer" }}>RM.csv</a> · <a style={{ color: "var(--blue)", cursor: "pointer" }}>supplier_specs.csv</a>.
              Imports are <b>org-scoped</b> — only the active org's catalog is touched.
              <b> No D365 dependency.</b>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={onBack}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={goNext}>Validate rows →</button>
          </div>
        </div>
      )}

      {step === "validate" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginTop: 14 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <KPI label="Rows in file"  value="61"             sub={filename}                     tone="default" />
            <KPI label="Errors"        value={counts.errors + ""} sub="must fix before import"     tone="red" />
            <KPI label="Warnings"      value={counts.warns + ""}  sub="review before continuing"   tone="amber" />
            <KPI label="Org scope"     value="ORG-001"        sub="active org_id"                tone="default" />
          </div>
          <table>
            <thead><tr>
              <th style={{ width: 70 }}>Row</th>
              <th style={{ width: 100 }}>Severity</th>
              <th style={{ width: 130 }}>Column</th>
              <th>Issue</th>
            </tr></thead>
            <tbody>
              {validation.map((v, i) => (
                <tr key={i} style={v.kind === "error" ? { background: "var(--red-050a)" } : v.kind === "warning" ? { background: "var(--amber-050a)" } : {}}>
                  <td className="mono">#{v.row}</td>
                  <td><span className={"badge " + (v.kind === "error" ? "badge-red" : v.kind === "warning" ? "badge-amber" : "badge-blue")}>{v.kind}</span></td>
                  <td className="mono" style={{ fontSize: 12 }}>{v.col}</td>
                  <td style={{ fontSize: 13 }}>{v.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
            <button className="btn btn-ghost btn-sm" onClick={goBack}>← Re-upload</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary btn-sm">⇩ Export errors CSV</button>
              <button className="btn btn-primary btn-sm" disabled={!validateValid} onClick={goNext}>Diff preview →</button>
            </div>
          </div>
        </div>
      )}

      {step === "diff" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginTop: 14 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <KPI label="Create" value={counts.create + ""} sub="new rows"     tone="green" />
            <KPI label="Update" value={counts.update + ""} sub="changed rows" tone="amber" />
            <KPI label="No-op"  value={counts.noop + ""}   sub="identical"    tone="default" />
          </div>
          <table>
            <thead><tr>
              <th style={{ width: 140 }}>Code</th>
              <th style={{ width: 90 }}>Op</th>
              <th style={{ width: 180 }}>Field</th>
              <th>Before → After</th>
              <th style={{ width: 80 }}>Src col</th>
            </tr></thead>
            <tbody>
              {diffRows.map((d, i) => (
                <tr key={i}>
                  <td className="mono">{d.code}</td>
                  <td><span className={"badge " + (d.op === "create" ? "badge-green" : d.op === "update" ? "badge-amber" : "badge-gray")}>{d.op}</span></td>
                  <td className="mono" style={{ fontSize: 12 }}>{d.field}</td>
                  <td style={{ fontSize: 13 }}>
                    <span className="mono" style={{ color: "var(--muted)" }}>{d.was}</span>
                    {" → "}
                    <span className="mono" style={{ fontWeight: 600 }}>{d.next}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{d.srcCol}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="alert-amber alert-box" style={{ marginTop: 12, fontSize: 12 }}>
            <span>△</span>
            <div>RM-1014 supplier swap to S-202 requires <b>supplier_spec.pdf</b> already uploaded for S-202. Catalog rows referencing missing supplier_specs are blocked at confirm.</div>
          </div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
            <button className="btn btn-ghost btn-sm" onClick={goBack}>← Re-validate</button>
            <button className="btn btn-primary btn-sm" onClick={goNext}>Confirm + audit →</button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 18, marginTop: 14 }}>
          <Summary rows={[
            { label: "Scope",       value: scope,                    mono: true },
            { label: "File",        value: filename,                 mono: true },
            { label: "Org",         value: "ORG-001",                mono: true },
            { label: "Create",      value: counts.create + " rows",  mono: true },
            { label: "Update",      value: counts.update + " rows",  mono: true },
            { label: "No-op",       value: counts.noop + " rows",    mono: true },
            { label: "D365",        value: "not contacted (local)",  mono: false },
          ]} />
          <Field label="Audit note" required help="Recorded in import audit trail; min 10 chars.">
            <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="np. Q2 refresh — szynka grupa, supplier swap S-101→S-202 (kontrakt 2026/04/12)." />
          </Field>
          <div className="alert-blue alert-box" style={{ fontSize: 12 }}>
            <span>ⓘ</span><div>Confirm runs server-side import behind RBAC <span className="mono">tech.import.bulk</span>; emits outbox event <span className="mono">tech.bulk_import.applied</span>. Reversible via undo-import within 24 h.</div>
          </div>
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
            <button className="btn btn-ghost btn-sm" onClick={goBack}>← Edit diff</button>
            <button className="btn btn-primary btn-sm" disabled={!confirmValid}>Apply import</button>
          </div>
        </div>
      )}
    </div>
  );
};


// ============ TEC-025 · BOM Snapshots Viewer (immutable WO snapshots) ============

const BomSnapshotsViewerScreen = ({ openModal }) => {
  const [filter, setFilter] = React.useState("all");
  const [woFilter, setWoFilter] = React.useState("");

  const snapshots = [
    { id: "SNAP-2026-04-19-001", bom: "B-0421", v: "v7", wo: "WO-12044", fg: "FG5101 Kiełbasa śląska 450g", taken: "2026-04-19 14:22", taker: "Planning auto-snapshot", lines: 11, status: "in_use" },
    { id: "SNAP-2026-04-18-014", bom: "B-0421", v: "v7", wo: "WO-12041", fg: "FG5101 Kiełbasa śląska 450g", taken: "2026-04-18 09:41", taker: "Planning auto-snapshot", lines: 11, status: "closed" },
    { id: "SNAP-2026-04-15-008", bom: "B-0443", v: "v3", wo: "WO-12030", fg: "FG5210 Szynka plastry 150g",  taken: "2026-04-15 16:08", taker: "Planning auto-snapshot", lines: 9,  status: "closed" },
    { id: "SNAP-2026-04-12-002", bom: "B-0421", v: "v6", wo: "WO-12012", fg: "FG5101 Kiełbasa śląska 450g", taken: "2026-04-12 11:55", taker: "Planning auto-snapshot", lines: 11, status: "orphaned" },
    { id: "SNAP-2026-04-08-019", bom: "B-0501", v: "v2", wo: "WO-11998", fg: "FG5301 Pasztet drobiowy 180g", taken: "2026-04-08 15:18", taker: "Planning auto-snapshot", lines: 14, status: "closed" },
  ];

  const rows = snapshots.filter(s => {
    if (filter !== "all" && s.status !== filter) return false;
    if (woFilter && !s.wo.toLowerCase().includes(woFilter.toLowerCase())) return false;
    return true;
  });

  const statusTone = { in_use: "badge-blue", closed: "badge-gray", orphaned: "badge-red" };

  return (
    <div data-prototype-label="bom_snapshots_viewer_screen">
      <PageHeader title="BOM snapshots" breadcrumb="Technical › BOMs › Snapshots"
        sub="Spec-driven Wave0 surface (TEC-025). Immutable Planning WO snapshots of shared BOM versions. Snapshots are read-only — never mutate the canonical BOM from this view." />

      <div className="alert-red alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>⚠</span>
        <div>
          <b>Immutable.</b> A snapshot is the BOM frozen at WO release. Editing a snapshot is forbidden — propose an ECO on the canonical BOM and trigger a clone-on-write on next WO.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <div className="pills">
          {[["all","All"],["in_use","In use"],["closed","Closed"],["orphaned","Orphaned"]].map(([k, lbl]) => (
            <button key={k} className={"pill " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>
              {lbl} <span style={{ opacity: 0.5, marginLeft: 4 }}>{k === "all" ? snapshots.length : snapshots.filter(s => s.status === k).length}</span>
            </button>
          ))}
        </div>
        <input value={woFilter} onChange={e => setWoFilter(e.target.value)} placeholder="Filter by WO-#####"
          style={{ marginLeft: "auto", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)", width: 220 }} />
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ width: 200 }}>Snapshot ID</th>
            <th style={{ width: 110 }}>BOM</th>
            <th style={{ width: 70 }}>Ver.</th>
            <th style={{ width: 110 }}>WO</th>
            <th>Finished good</th>
            <th style={{ width: 70, textAlign: "right" }}>Lines</th>
            <th style={{ width: 140 }}>Taken</th>
            <th style={{ width: 100 }}>Status</th>
            <th style={{ width: 100 }}></th>
          </tr></thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} style={s.status === "orphaned" ? { background: "var(--red-050a)" } : {}}>
                <td className="mono" style={{ fontSize: 12 }}>{s.id}</td>
                <td className="mono">{s.bom}</td>
                <td className="mono"><span className="badge badge-blue">{s.v}</span></td>
                <td className="mono">{s.wo}</td>
                <td style={{ fontSize: 13 }}>{s.fg}</td>
                <td className="num mono">{s.lines}</td>
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{s.taken}</td>
                <td><span className={"badge " + statusTone[s.status]}>{s.status}</span></td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => openModal && openModal("bomSnapshotDiff", s)}>Diff vs current →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 12 }}>
        <span>ⓘ</span><div>Orphaned = canonical BOM version was deleted; snapshot stays read-only for audit/traceability. Open the diff modal to see the frozen line-set.</div>
      </div>
    </div>
  );
};

// ---------- TEC-025 · Snapshot Diff Modal (immutable JSON-flatten diff) ----------

const BomSnapshotDiffModal = ({ open, onClose, data }) => {
  const snap = data || { id: "SNAP-2026-04-19-001", bom: "B-0421", v: "v7", wo: "WO-12044", taken: "2026-04-19 14:22" };
  const diff = [
    { kind: "noop", path: "lines[0].code",         frozen: "RM-1001",       current: "RM-1001" },
    { kind: "chg",  path: "lines[0].qty_per_unit", frozen: "0.540 kg",      current: "0.535 kg" },
    { kind: "noop", path: "lines[1].code",         frozen: "RM-1002",       current: "RM-1002" },
    { kind: "chg",  path: "lines[3].supplier",     frozen: "S-101",         current: "S-202" },
    { kind: "add",  path: "lines[10].code",        frozen: "—",             current: "RM-3100 (added in v8)" },
    { kind: "rem",  path: "process.smoke_ccp",     frozen: "72°C / 28 min", current: "(removed in v8)" },
  ];
  return (
    <Modal open={open} onClose={onClose} title={"Snapshot diff · " + snap.id} subtitle={snap.bom + " · frozen " + snap.v + " · vs current canonical BOM"} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        <button className="btn btn-secondary btn-sm">⇩ Export JSON</button>
      </>}>
      <div className="alert-red alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>⚠</span><div><b>Read-only.</b> Snapshot is immutable. To apply current canonical BOM to {snap.wo}, trigger clone-on-write on the next WO release — never mutate this snapshot.</div>
      </div>
      <Summary rows={[
        { label: "Snapshot",      value: snap.id,    mono: true },
        { label: "BOM / version", value: snap.bom + " · " + snap.v, mono: true },
        { label: "WO",            value: snap.wo,    mono: true },
        { label: "Taken at",      value: snap.taken, mono: true },
      ]} />
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ width: 80 }}>Kind</th>
            <th>Path</th>
            <th>Snapshot (frozen)</th>
            <th>Current BOM</th>
          </tr></thead>
          <tbody>
            {diff.map((d, i) => (
              <tr key={i} style={d.kind === "chg" ? { background: "var(--amber-050a)" } : d.kind === "add" ? { background: "var(--green-050a)" } : d.kind === "rem" ? { background: "var(--red-050a)" } : {}}>
                <td><span className={"badge " + (d.kind === "chg" ? "badge-amber" : d.kind === "add" ? "badge-green" : d.kind === "rem" ? "badge-red" : "badge-gray")}>{d.kind}</span></td>
                <td className="mono" style={{ fontSize: 11 }}>{d.path}</td>
                <td className="mono" style={{ fontSize: 12 }}>{d.frozen}</td>
                <td className="mono" style={{ fontSize: 12, fontWeight: d.kind !== "noop" ? 600 : 400 }}>{d.current}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};


// ============ TEC-031 · Regulatory Compliance Dashboard ============

const RegulatoryComplianceDashboardScreen = ({ openModal }) => {
  const regs = [
    { code: "EU 1169/2011", scope: "FIC labelling",          coverage: 96, gaps: 2,  source: "labels + spec module" },
    { code: "FSMA 204",     scope: "Traceability rule (US)", coverage: 88, gaps: 7,  source: "trace + LP module" },
    { code: "BRCGS v9",     scope: "GFSI audit baseline",    coverage: 91, gaps: 5,  source: "QA + Technical" },
    { code: "ISO 22000",    scope: "FSMS / HACCP",           coverage: 94, gaps: 3,  source: "Quality" },
    { code: "EU 2023/915",  scope: "Contaminants in food",   coverage: 82, gaps: 9,  source: "lab_results read model" },
  ];
  const flags = [
    { fg: "FG5101 Kiełbasa śląska 450g", reg: "EU 1169/2011", issue: "Salt declaration missing on label v3 (regulatory rounding 0.4 → 0.5 g)", severity: "medium", remediation: "Re-issue label v4 via 03-TECHNICAL ECO; route Labels QC re-approval." },
    { fg: "FG5210 Szynka plastry 150g",  reg: "FSMA 204",     issue: "KDE: 'Receiving' lot not linked to upstream supplier_spec lot.", severity: "high",   remediation: "Route to 09-QUALITY trace queue; link supplier_spec lot in supplier_specs admin." },
    { fg: "FG5301 Pasztet drobiowy 180g", reg: "BRCGS v9",    issue: "Allergen segregation cleaning record older than 30d on LINE-02.", severity: "medium", remediation: "Route to 09-QUALITY HACCP queue (Quality owns lifecycle); not auto-fixed here." },
    { fg: "FG5400 Klopsiki pomidorowe",   reg: "EU 2023/915", issue: "PAH lab result above advisory; needs re-test plan.",            severity: "high",   remediation: "Route to 09-QUALITY; Technical surfaces remediation plan link only." },
    { fg: "FG5117 Mortadela 200g",        reg: "ISO 22000",   issue: "Process parameters CCP-2 documentation gap on first pilot WO.", severity: "low",    remediation: "Route to 09-QUALITY; close via PAR-2026-04 worksheet." },
  ];
  const sevTone = { high: "badge-red", medium: "badge-amber", low: "badge-gray" };

  return (
    <div data-prototype-label="regulatory_compliance_dashboard_screen">
      <PageHeader title="Regulatory compliance dashboard" breadcrumb="Technical › Compliance"
        sub="Spec-driven Wave0 surface (TEC-031). At-a-glance status of FG portfolio against active regulations. Routing/remediation only — not legal advice." />

      <div className="alert-blue alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>ⓘ</span>
        <div>
          <b>Routing only.</b> This dashboard surfaces gaps and routes them to the owning module (09-QUALITY for lab/NCR lifecycle, Technical for spec/label rework). It does not replace legal review or HACCP team judgment.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 14 }}>
        {regs.map(r => (
          <KPI key={r.code}
            label={r.code}
            value={r.coverage + "%"}
            sub={r.gaps + " open gap" + (r.gaps === 1 ? "" : "s")}
            tone={r.coverage >= 95 ? "green" : r.coverage >= 88 ? "amber" : "red"} />
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16, marginBottom: 14 }}>
        <strong style={{ fontSize: 13 }}>Coverage by regulation</strong>
        <div style={{ marginTop: 10 }}>
          {regs.map(r => (
            <div key={r.code} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span><b className="mono">{r.code}</b> · <span style={{ color: "var(--muted)" }}>{r.scope}</span></span>
                <span className="mono"><b>{r.coverage}%</b> · <span style={{ color: "var(--muted)" }}>{r.source}</span></span>
              </div>
              <div style={{ height: 10, background: "var(--gray-100)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: r.coverage + "%", height: "100%", background: r.coverage >= 95 ? "var(--green)" : r.coverage >= 88 ? "var(--amber)" : "var(--red)" }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <span>Per-FG flags · {flags.length}</span>
          <span className="muted" style={{ fontSize: 11 }}>Click "Route" to dispatch to owning module — never auto-resolved here.</span>
        </div>
        <table>
          <thead><tr>
            <th style={{ width: 220 }}>Finished good</th>
            <th style={{ width: 130 }}>Regulation</th>
            <th>Issue</th>
            <th style={{ width: 90 }}>Severity</th>
            <th style={{ width: 110 }}></th>
          </tr></thead>
          <tbody>
            {flags.map((f, i) => (
              <tr key={i} style={f.severity === "high" ? { background: "var(--red-050a)" } : {}}>
                <td className="mono" style={{ fontSize: 12 }}>{f.fg}</td>
                <td className="mono" style={{ fontSize: 12 }}>{f.reg}</td>
                <td style={{ fontSize: 13 }}>
                  {f.issue}
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Remediation: {f.remediation}</div>
                </td>
                <td><span className={"badge " + sevTone[f.severity]}>{f.severity}</span></td>
                <td><button className="btn btn-ghost btn-sm">Route →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};


// ============ TEC-045 · Lab Results Log (Quality-owned read model) ============

const LabResultsLogScreen = () => {
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");

  const results = [
    { id: "LAB-2026-04-19-A", taken: "2026-04-19 09:14", fg: "FG5101 Kiełbasa śląska 450g", lot: "LOT-2026-04-19-001", test: "ATP RLU swab (LINE-02)",  rlu: 18,   threshold: 30, verdict: "pass", method: "Hygiena EnSURE" },
    { id: "LAB-2026-04-18-C", taken: "2026-04-18 14:32", fg: "FG5210 Szynka plastry 150g",   lot: "LOT-2026-04-18-014", test: "ATP RLU swab (CUT-02)",   rlu: 41,   threshold: 30, verdict: "fail", method: "Hygiena EnSURE" },
    { id: "LAB-2026-04-17-B", taken: "2026-04-17 11:08", fg: "FG5301 Pasztet drobiowy 180g", lot: "LOT-2026-04-17-008", test: "Listeria monocytogenes",  rlu: null, threshold: null, verdict: "pass", method: "ELISA 24h" },
    { id: "LAB-2026-04-16-A", taken: "2026-04-16 08:21", fg: "FG5101 Kiełbasa śląska 450g", lot: "LOT-2026-04-16-002", test: "ATP RLU swab (SMOKE-01)", rlu: 26,   threshold: 30, verdict: "pass", method: "Hygiena EnSURE" },
    { id: "LAB-2026-04-15-A", taken: "2026-04-15 16:47", fg: "FG5400 Klopsiki pomidorowe",   lot: "LOT-2026-04-15-019", test: "PAH (benzo[a]pyrene)",    rlu: null, threshold: null, verdict: "ncr",  method: "GC-MS external" },
  ];

  const rows = results.filter(r => {
    if (filter !== "all" && r.verdict !== filter) return false;
    if (q && !(r.fg.toLowerCase().includes(q.toLowerCase()) || r.lot.toLowerCase().includes(q.toLowerCase()) || r.id.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  const verdictTone = { pass: "badge-green", fail: "badge-red", ncr: "badge-red" };

  return (
    <div data-prototype-label="lab_results_log_screen">
      <PageHeader title="Lab results log (read-only)" breadcrumb="Technical › Lab results"
        sub="Spec-driven Wave0 surface (TEC-045). Quality-owned lab_results read model exposed in Technical for FG/spec context. Technical never writes lab_results — all entry, NCR lifecycle, sign-off and CoA happen in 09-QUALITY." />

      <div className="alert-amber alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>△</span>
        <div>
          <b>Read-only here.</b> To enter, edit, retest, sign-off, raise NCR or attach CoA — open <a style={{ color: "var(--blue)", cursor: "pointer" }}>09-QUALITY · Lab</a>. This Technical screen is a federated read model (Quality owns the lifecycle).
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <div className="pills">
          {[["all","All"],["pass","Pass"],["fail","Fail"],["ncr","NCR raised"]].map(([k, lbl]) => (
            <button key={k} className={"pill " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>
              {lbl} <span style={{ opacity: 0.5, marginLeft: 4 }}>{k === "all" ? results.length : results.filter(r => r.verdict === k).length}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by FG / lot / lab id"
          style={{ marginLeft: "auto", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)", width: 260 }} />
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table>
          <thead><tr>
            <th style={{ width: 160 }}>Lab ID</th>
            <th style={{ width: 140 }}>Taken</th>
            <th>FG / lot</th>
            <th>Test</th>
            <th style={{ width: 140 }}>Reading</th>
            <th style={{ width: 100 }}>Verdict</th>
            <th style={{ width: 110 }}></th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={r.verdict === "fail" || r.verdict === "ncr" ? { background: "var(--red-050a)" } : {}}>
                <td className="mono" style={{ fontSize: 12 }}>{r.id}</td>
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.taken}</td>
                <td style={{ fontSize: 13 }}>
                  {r.fg}
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.lot}</div>
                </td>
                <td style={{ fontSize: 12 }}>
                  {r.test}
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.method}</div>
                </td>
                <td>
                  {r.rlu !== null ? (
                    <div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: r.rlu > r.threshold ? "var(--red-700)" : "var(--green-700)" }}>{r.rlu} RLU</div>
                      <div style={{ height: 8, background: "var(--gray-100)", borderRadius: 2, marginTop: 3, overflow: "hidden", position: "relative" }}>
                        <div style={{ width: Math.min(100, (r.rlu / (r.threshold * 1.5)) * 100) + "%", height: "100%", background: r.rlu > r.threshold ? "var(--red)" : "var(--green)" }}></div>
                        <div style={{ position: "absolute", left: ((r.threshold / (r.threshold * 1.5)) * 100) + "%", top: 0, bottom: 0, width: 1, background: "var(--text)", opacity: 0.4 }}></div>
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>threshold {r.threshold} RLU</div>
                    </div>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>n/a (qualitative)</span>
                  )}
                </td>
                <td><span className={"badge " + verdictTone[r.verdict]}>{r.verdict}</span></td>
                <td><a style={{ color: "var(--blue)", fontSize: 12, cursor: "pointer" }}>Open in QA →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="alert-blue alert-box" style={{ marginTop: 12, fontSize: 12 }}>
        <span>ⓘ</span><div>Source: <span className="mono">quality.lab_results</span> projection (Quality-owned). Technical specs link results by <span className="mono">spec_id</span> for read-only context only.</div>
      </div>
    </div>
  );
};


// ============ TEC-052 · Cost Import from D365 (optional integration source) ============

const CostImportFromD365Screen = ({ onBack }) => {
  const [d365Enabled, setD365Enabled] = React.useState(true);
  const [reason, setReason] = React.useState("");

  const diffRows = [
    { code: "RM-1001", name: "Wieprzowina kl. II",  current: 8.40,  incoming: 8.65, delta: 2.98, source: "D365 PROD CT-EU · ItemPrice" },
    { code: "RM-1002", name: "Słonina wieprzowa",   current: 6.20,  incoming: 5.95, delta: -4.03, source: "D365 PROD CT-EU · ItemPrice" },
    { code: "RM-1014", name: "Sól peklująca",       current: 1.80,  incoming: 1.80, delta: 0,    source: "D365 PROD CT-EU · ItemPrice" },
    { code: "RM-3001", name: "Osłonka białkowa",    current: 12.40, incoming: 13.05, delta: 5.24, source: "D365 PROD CT-EU · ItemPrice" },
    { code: "RM-3100", name: "Dym płynny regal",    current: 22.10, incoming: 22.10, delta: 0,    source: "D365 PROD CT-EU · ItemPrice" },
  ];

  const counts = {
    changed: diffRows.filter(r => r.delta !== 0).length,
    over5: diffRows.filter(r => Math.abs(r.delta) >= 5).length,
    same: diffRows.filter(r => r.delta === 0).length,
  };
  const valid = d365Enabled && reason.length >= 10;

  return (
    <div data-prototype-label="cost_import_d365_screen">
      <PageHeader title="Cost import from D365" breadcrumb={<><a onClick={onBack} style={{ cursor: "pointer" }}>Technical</a> › Costs › D365 import</>}
        sub="Spec-driven Wave0 surface (TEC-052). Optional integration source — Monopilot local cost history remains source of truth. D365 disabled state must keep this UI usable read-only."
        actions={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setD365Enabled(!d365Enabled)}>
            {d365Enabled ? "Simulate D365 disabled" : "Simulate D365 enabled"}
          </button>
        </>} />

      {!d365Enabled && (
        <div className="alert-amber alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
          <span>△</span>
          <div>
            <b>D365 connector disabled for this org.</b> Cost import is unavailable. Local cost history (TEC-050) remains source of truth and is editable from <span className="mono">Technical › Costs</span>. Re-enable D365 in <span className="mono">Settings › Integrations</span> to fetch incoming prices.
          </div>
        </div>
      )}

      {d365Enabled && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
            <KPI label="Connector"     value="ok"            sub="D365 PROD CT-EU"        tone="green" />
            <KPI label="Items pulled"  value={diffRows.length + ""} sub="from incoming delta"   tone="default" />
            <KPI label="Changed"       value={counts.changed + ""}  sub="≠ current cost"        tone="amber" />
            <KPI label="|Δ| ≥ 5%"      value={counts.over5 + ""}    sub="needs sign-off"         tone="red" />
          </div>

          <div className="alert-blue alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
            <span>ⓘ</span>
            <div>
              <b>Local cost history is source of truth.</b> Importing from D365 creates a new local <span className="mono">cost_entry</span> snapshot tagged <span className="mono">source=d365</span>; never overwrites in-place. Items with |Δ| ≥ 5% require Technical sign-off. Reversible via undo-import within 24 h.
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 14 }}>
            <table>
              <thead><tr>
                <th style={{ width: 100 }}>Code</th>
                <th>Name</th>
                <th style={{ width: 110, textAlign: "right" }}>Current (zł)</th>
                <th style={{ width: 110, textAlign: "right" }}>Incoming (zł)</th>
                <th style={{ width: 90,  textAlign: "right" }}>Δ %</th>
                <th>Source</th>
              </tr></thead>
              <tbody>
                {diffRows.map(r => (
                  <tr key={r.code} style={Math.abs(r.delta) >= 5 ? { background: "var(--red-050a)" } : Math.abs(r.delta) > 0 ? { background: "var(--amber-050a)" } : {}}>
                    <td className="mono">{r.code}</td>
                    <td style={{ fontSize: 13 }}>{r.name}</td>
                    <td className="num mono">{r.current.toFixed(2)}</td>
                    <td className="num mono" style={{ fontWeight: r.delta !== 0 ? 600 : 400 }}>{r.incoming.toFixed(2)}</td>
                    <td className="num mono" style={{ color: r.delta > 0 ? "var(--red-700)" : r.delta < 0 ? "var(--green-700)" : "var(--muted)", fontWeight: 600 }}>
                      {r.delta > 0 ? "+" : ""}{r.delta.toFixed(2)}%
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
            <strong style={{ fontSize: 13 }}>Confirm import</strong>
            <div style={{ marginTop: 10 }}>
              <Field label="Sign-off reason" required help="Audit-logged with import. Required when |Δ| ≥ 5% on any row.">
                <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="np. Q2 cost refresh — surowiec po wzroście 5% na rynku, zatwierdzone przez Controlling 2026-04-30." />
              </Field>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-secondary btn-sm">⇩ Export diff CSV</button>
                <button className="btn btn-primary btn-sm" disabled={!valid}>Apply import</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};


// ============ T-090 · FactorySpec + BOM bundle approval modal ============

const FactorySpecBomBundleApprovalModal = ({ open, onClose, onConfirm, data }) => {
  const bundle = data || {
    fg: "FG5101 Kiełbasa śląska pieczona 450g",
    spec: { id: "FS-FG5101-v3", status: "in_review", owner: "Technical · A. Majewska", lastEdit: "2026-04-30 11:22" },
    bom:  { id: "B-0421",      v: "v8 draft",       status: "in_review", owner: "Technical · A. Majewska", clonedFrom: "v7 (in use by 3 open WO)" },
    blockers: [
      { kind: "rm",       msg: "RM-3001 supplier S-202 missing valid supplier_spec.pdf (required since 2026-03-01).", severity: "block" },
      { kind: "rbac",     msg: "Production-lead sign-off pending (cross-module 02-Settings policy).",                  severity: "warn" },
      { kind: "release",  msg: "Local Technical release independent of D365 — D365 sync is informational only.",        severity: "info" },
    ],
    history: [
      { t: "2026-04-30 11:22", who: "A. Majewska",   act: "Cloned BOM v7 → v8 draft (RM-3001 supplier swap)" },
      { t: "2026-04-30 09:01", who: "K. Lewandowska",act: "QA review notes added on factory_spec FS-FG5101-v3" },
      { t: "2026-04-29 16:40", who: "A. Majewska",   act: "Bundle moved to in_review" },
      { t: "2026-04-22 12:08", who: "P. Kowalski",   act: "Previous bundle approved (FS-FG5101-v2 + B-0421 v7)" },
    ],
  };

  const [action, setAction] = React.useState("approve");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { if (!open) { setAction("approve"); setReason(""); } }, [open]);

  const blockingIssues = bundle.blockers.filter(b => b.severity === "block");
  const canApprove = blockingIssues.length === 0;
  const valid = action === "approve" ? canApprove : reason.length >= 10;
  const sevTone = { block: "badge-red", warn: "badge-amber", info: "badge-blue" };

  return (
    <Modal open={open} onClose={onClose} title="Approve FactorySpec + BOM bundle" subtitle={bundle.fg + " · paired Technical release"} size="wide"
      foot={<>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        <button className={"btn btn-sm " + (action === "reject" ? "btn-danger" : "btn-primary")} disabled={!valid}
          data-prototype-label="factory_spec_bom_bundle_approve_action"
          onClick={() => { onConfirm && onConfirm({ action, reason, bundle }); onClose(); }}>
          {action === "approve"
            ? (canApprove ? "Approve bundle" : "Approve (blocked)")
            : "Reject bundle"}
        </button>
      </>}>

      <div data-prototype-label="factory_spec_bom_bundle_approval_modal">
      <div className="alert-amber alert-box" style={{ fontSize: 12, marginBottom: 12 }}>
        <span>△</span>
        <div>
          <b>Clone-on-write applied.</b> BOM v8 draft was cloned from v7 because v7 is referenced by open WO snapshots; existing snapshots stay immutable. Approving this bundle releases factory_spec FS-FG5101-v3 + BOM v8 to factory use locally — independent of D365.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>factory_spec</strong>
            <span className="badge badge-amber">{bundle.spec.status}</span>
          </div>
          <Summary rows={[
            { label: "Spec id",   value: bundle.spec.id,        mono: true },
            { label: "Owner",     value: bundle.spec.owner,     mono: false },
            { label: "Last edit", value: bundle.spec.lastEdit,  mono: true },
          ]} />
        </div>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>shared BOM</strong>
            <span className="badge badge-amber">{bundle.bom.status}</span>
          </div>
          <Summary rows={[
            { label: "BOM id",       value: bundle.bom.id,         mono: true },
            { label: "Version",      value: bundle.bom.v,          mono: true },
            { label: "Cloned from",  value: bundle.bom.clonedFrom, mono: false },
          ]} />
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>Blockers &amp; preflight</strong>
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {bundle.blockers.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, padding: "6px 8px", background: b.severity === "block" ? "var(--red-050a)" : b.severity === "warn" ? "var(--amber-050a)" : "var(--blue-050)", borderRadius: 3 }}>
              <span className={"badge " + sevTone[b.severity]} style={{ flexShrink: 0 }}>{b.severity}</span>
              <span style={{ fontSize: 12 }}><b className="mono" style={{ fontSize: 11, marginRight: 6 }}>{b.kind}</b>{b.msg}</span>
            </div>
          ))}
          {!canApprove && (
            <div style={{ fontSize: 11, color: "var(--red-700)", marginTop: 4 }}>
              Approve disabled — resolve <b>{blockingIssues.length}</b> blocker(s) above (supplier_spec upload, RBAC, release guard). Hovering "Approve" shows the exact reason via accessible label.
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>Approval / rejection history</strong>
        <div style={{ marginTop: 8 }}>
          {bundle.history.map((h, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 130px 1fr", gap: 8, padding: "5px 0", borderTop: i > 0 ? "1px solid var(--border)" : 0, fontSize: 12 }}>
              <div className="mono" style={{ color: "var(--muted)" }}>{h.t}</div>
              <div>{h.who}</div>
              <div>{h.act}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4, background: action === "approve" ? "var(--green-050a)" : "#fff" }}>
          <input type="radio" checked={action === "approve"} onChange={() => setAction("approve")} disabled={!canApprove} />
          <div>
            <b>Approve bundle</b>
            <div className="muted" style={{ fontSize: 11 }}>Releases factory_spec + BOM bundle to factory use. Local Technical release — D365 sync is optional/informational.</div>
          </div>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 4, background: action === "reject" ? "var(--red-050a)" : "#fff" }}>
          <input type="radio" checked={action === "reject"} onChange={() => setAction("reject")} />
          <div>
            <b>Reject bundle</b>
            <div className="muted" style={{ fontSize: 11 }}>Both artifacts return to draft; author is notified with the reason below.</div>
          </div>
        </label>
      </div>

      {action === "reject" && (
        <Field label="Reject reason" required help="Audit-logged, min 10 chars.">
          <ReasonInput value={reason} onChange={setReason} minLength={10} placeholder="np. Brak waliduowanego supplier_spec dla S-202 — wstrzymane do uzupełnienia dokumentu." />
        </Field>
      )}
      </div>
    </Modal>
  );
};


// ============ Registration ============

Object.assign(window, {
  BulkImportCsvScreen,
  BomSnapshotsViewerScreen, BomSnapshotDiffModal,
  RegulatoryComplianceDashboardScreen,
  LabResultsLogScreen,
  CostImportFromD365Screen,
  FactorySpecBomBundleApprovalModal,
});
