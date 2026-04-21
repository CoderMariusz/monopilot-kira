// ============================================================================
// SCR-10 Compliance Docs (per-FA) + SCR-12 Risk Register (per-FA)
// Both embedded in SCR-03 FA Detail tabs but also reachable as sub-nav entries.
// ============================================================================

const ComplianceDocsScreen = ({ fa, openModal }) => {
  const docs = window.NPD_DOCS[fa.fa_code] || window.NPD_DOCS.FA5601;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Compliance documents</div>
          <div className="muted" style={{ fontSize: 11 }}>Read-only attachments (minimal v3.0 scope · extended set deferred to Quality Phase C4).</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => openModal("docUpload", { fa })}>+ Upload document</button>
      </div>
      <table>
        <thead><tr>
          <th>Type</th><th>File name</th><th>Version</th><th>Uploaded by</th><th>Date</th><th>Size</th><th>Actions</th>
        </tr></thead>
        <tbody>
          {docs.map((d, i) => (
            <tr key={i}>
              <td><span className="badge badge-gray">{d.type}</span></td>
              <td style={{ fontWeight: 500 }}><a style={{ color: "var(--blue)", cursor: "pointer" }}>📄 {d.filename}</a></td>
              <td className="mono">{d.version}</td>
              <td>{d.uploaded_by}</td>
              <td className="mono">{d.date}</td>
              <td className="mono num">{d.size}</td>
              <td style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-ghost btn-sm">Download</button>
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="alert alert-blue">
        File types: PDF, XLSX, DOCX. Max 20MB per upload. Full compliance doc workflow (approvals, versions) is deferred to Quality module Phase C4 — see <span className="mono">quality/</span>.
      </div>
    </div>
  );
};

// SCR-12 Risk Register
const RiskRegisterScreen = ({ fa, openModal }) => {
  const risks = window.NPD_RISKS[fa.fa_code] || window.NPD_RISKS.FA5601;
  const badge = (s) => s >= 6 ? <span className="badge badge-red">High · {s}</span>
                     : s >= 3 ? <span className="badge badge-amber">Med · {s}</span>
                     :          <span className="badge badge-gray">Low · {s}</span>;
  const statusBadge = (s) => s === "Open" ? <span className="badge badge-amber">Open</span>
                          : s === "Mitigated" ? <span className="badge badge-green">Mitigated</span>
                          : <span className="badge badge-gray">Closed</span>;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Risk register</div>
          <div className="muted" style={{ fontSize: 11 }}>Score = Likelihood × Impact (1=Low, 2=Med, 3=High).</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => openModal("riskAdd", { fa })}>+ Add risk</button>
      </div>
      <table>
        <thead><tr>
          <th>Score</th><th>Description</th><th>Likelihood</th><th>Impact</th><th>Status</th><th>Owner</th><th>Mitigation</th><th>Actions</th>
        </tr></thead>
        <tbody>
          {risks.map(r => (
            <tr key={r.id}>
              <td>{badge(r.score)}</td>
              <td style={{ fontWeight: 500 }}>{r.description}</td>
              <td>{r.likelihood}</td>
              <td>{r.impact}</td>
              <td>{statusBadge(r.status)}</td>
              <td className="muted" style={{ fontSize: 12 }}>{r.owner}</td>
              <td className="muted" style={{ fontSize: 12 }}>{r.mitigation}</td>
              <td style={{ display: "flex", gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openModal("riskAdd", { fa, risk: r })}>Edit</button>
                <button className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

Object.assign(window, { ComplianceDocsScreen, RiskRegisterScreen });
