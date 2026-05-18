// ============================================================
// SET-032 — Schema Diff Viewer
// route: /settings/schema/diff/:migration_id
// spec: design/02-SETTINGS-UX.md §SET-032 (line 670)
// Side-by-side comparison of schema version N vs N-1 for a specific column.
// ============================================================

// ---------- Helpers ----------

// JSON deep-diff producing flat field list with status:
//   - 'added'   (in newer, not in older)
//   - 'removed' (in older, not in newer)
//   - 'changed' (different value)
//   - 'unchanged'
const diffJson = (a, b) => {
  a = a || {}; b = b || {};
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  return keys.sort().map((k) => {
    const av = a[k]; const bv = b[k];
    const has_a = Object.prototype.hasOwnProperty.call(a, k);
    const has_b = Object.prototype.hasOwnProperty.call(b, k);
    if (!has_a && has_b)  return { field: k, status: "added",   from: undefined, to: bv };
    if ( has_a && !has_b) return { field: k, status: "removed", from: av,        to: undefined };
    if (JSON.stringify(av) !== JSON.stringify(bv))
      return { field: k, status: "changed", from: av, to: bv };
    return { field: k, status: "unchanged", from: av, to: bv };
  });
};

const fmtJsonValue = (v) => {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string") return `"${v}"`;
  return String(v);
};

const DiffBadge = ({ status }) => {
  if (status === "added")     return <span className="badge badge-green" style={{ fontSize: 9 }}>+ added</span>;
  if (status === "removed")   return <span className="badge badge-red"   style={{ fontSize: 9 }}>− removed</span>;
  if (status === "changed")   return <span className="badge badge-amber" style={{ fontSize: 9 }}>~ changed</span>;
  return null;
};

// ---------- Diff Panel (side) ----------
const DiffSide = ({ title, headerBadge, version, rows, side, meta }) => (
  <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "#fff", overflow: "hidden" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--gray-100)" }}>
      <div>
        <span className={"badge " + headerBadge} style={{ fontSize: 10, marginRight: 8 }}>{title}</span>
        <span className="muted" style={{ fontSize: 11 }}>{version ? `v${version}` : "—"}</span>
      </div>
      <div className="muted mono" style={{ fontSize: 11 }}>{meta || ""}</div>
    </div>
    <div style={{ padding: 0 }}>
      {rows.map((r) => {
        const isThisSide = side === "left" ? (r.status === "removed" || r.status === "changed" || r.status === "unchanged") : (r.status === "added" || r.status === "changed" || r.status === "unchanged");
        if (!isThisSide && r.status !== "added" && r.status !== "removed") return null;

        const value = side === "left" ? r.from : r.to;
        const isHighlight = (side === "left" && (r.status === "removed" || r.status === "changed"))
                         || (side === "right" && (r.status === "added"   || r.status === "changed"));

        const bg = side === "right" && (r.status === "added" || r.status === "changed") ? "var(--green-050a)"
                 : side === "left"  && (r.status === "removed" || r.status === "changed") ? "var(--red-050a)"
                 : "transparent";

        const textDecoration = side === "left" && r.status === "removed" ? "line-through" : "none";

        // Skip the slot if this side doesn't have a value (so two panels align by field name)
        return (
          <div key={r.field}
               data-field={r.field}
               style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 8, alignItems: "center",
                        padding: "8px 14px", borderBottom: "1px solid var(--border)",
                        background: bg }}>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{r.field}</div>
            <div className="mono" style={{ fontSize: 12, textDecoration, color: textDecoration === "line-through" ? "var(--red-700)" : "var(--text)", overflowWrap: "anywhere" }}>
              {fmtJsonValue(value)}
            </div>
            <div style={{ minWidth: 60, textAlign: "right" }}>{isHighlight && <DiffBadge status={r.status} />}</div>
          </div>
        );
      })}
    </div>
  </div>
);

// ---------- Empty state for v1 (no prior version) ----------
const NoPriorEmptyState = ({ onClose }) => (
  <div className="sg-section" style={{ marginBottom: 0 }}>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", textAlign: "center", gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: 28, background: "var(--gray-050)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "var(--muted)" }}>◧</div>
      <div style={{ fontWeight: 600, fontSize: 16 }}>No prior version</div>
      <div className="muted" style={{ fontSize: 13, maxWidth: 400 }}>
        This column is at version 1. There is nothing to compare against yet — future edits will appear here as v2, v3, etc.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>← Back to schema browser</button>
        <button className="btn btn-ghost btn-sm">View column definition</button>
      </div>
    </div>
  </div>
);

// ---------- Main screen ----------
const SchemaDiffViewer = ({ migrationId, columnId, openModal, onExit }) => {
  // Resolve column from either migration id or direct column id.
  const resolvedColumnId = columnId
    || (migrationId && window.SETTINGS_DIFF_BY_MIGRATION[migrationId])
    || "shelf_life_days";

  const col = window.SETTINGS_SCHEMA_VERSIONS[resolvedColumnId];
  if (!col) {
    return (
      <>
        <PageHead title="Schema diff" sub={`No column found for migration ${migrationId || "(none)"}.`} />
        <div className="alert alert-red" style={{ fontSize: 13 }}>Migration id not found.</div>
        <button className="btn btn-secondary btn-sm" onClick={onExit}>← Back</button>
      </>
    );
  }

  const versions = col.versions; // sorted v1..vN by structure
  const latest = versions[versions.length - 1];
  const prior  = versions.length >= 2 ? versions[versions.length - 2] : null;

  const [rightV, setRightV] = React.useState(latest.v);
  const [leftV,  setLeftV]  = React.useState(prior ? prior.v : 1);

  const rightVer = versions.find((v) => v.v === rightV);
  const leftVer  = versions.find((v) => v.v === leftV);

  // Empty state — v1 selected on the right with no prior available
  const showEmpty = !prior || (rightV === 1);

  const diffRows = !showEmpty && rightVer && leftVer ? diffJson(leftVer.json, rightVer.json) : [];
  const counts = diffRows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  const isL1 = col.tier === "L1";
  const isRevertable = !isL1 && versions.length >= 2 && (versions.length - leftVer?.v) < 3;

  const [confirmRevert, setConfirmRevert] = React.useState(false);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
        <div>
          <div className="muted mono" style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>
            <span style={{ cursor: "pointer" }} onClick={onExit}>Settings</span>
            {" / "}
            <span style={{ cursor: "pointer" }} onClick={onExit}>Schema browser</span>
            {" / "}
            <span>Diff: <span className="mono">{col.col}</span></span>
          </div>
          <h1 className="sg-title" style={{ margin: "4px 0 4px" }}>Schema diff — <span className="mono">{col.col}</span></h1>
          <div className="sg-sub" style={{ fontSize: 13 }}>
            Side-by-side comparison of two versions. Changes highlight in green (added/changed) and red (removed).
            <span className="muted mono" style={{ marginLeft: 8, fontSize: 11 }}>migration_id: {migrationId || "(direct)"} · table: {col.table}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={onExit}>← Back</button>
        </div>
      </div>

      {/* Version selectors */}
      <div className="sg-section" style={{ marginBottom: 12 }}>
        <div style={{ padding: "12px 16px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12 }}>Compare</span>
            <select value={leftV} onChange={(e) => setLeftV(parseInt(e.target.value, 10))} style={{ fontSize: 12 }}>
              {versions.map((v) => <option key={v.v} value={v.v} disabled={v.v >= rightV}>v{v.v} — {v.at.split(" ")[0]} by {v.by}</option>)}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>against</span>
            <select value={rightV} onChange={(e) => setRightV(parseInt(e.target.value, 10))} style={{ fontSize: 12 }}>
              {versions.map((v) => <option key={v.v} value={v.v}>v{v.v} — {v.at.split(" ")[0]} by {v.by}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}></div>
          {!showEmpty && (
            <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
              <span className="badge badge-green" style={{ fontSize: 10 }}>+ {counts.added || 0} added</span>
              <span className="badge badge-amber" style={{ fontSize: 10 }}>~ {counts.changed || 0} changed</span>
              <span className="badge badge-red"   style={{ fontSize: 10 }}>− {counts.removed || 0} removed</span>
              <span className="badge badge-gray"  style={{ fontSize: 10 }}>{counts.unchanged || 0} unchanged</span>
            </div>
          )}
        </div>
      </div>

      {showEmpty ? (
        <NoPriorEmptyState onClose={onExit} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <DiffSide
              title="Before"
              headerBadge="badge-gray"
              version={leftVer.v}
              rows={diffRows}
              side="left"
              meta={leftVer.at}
            />
            <DiffSide
              title="After"
              headerBadge="badge-green"
              version={rightVer.v}
              rows={diffRows}
              side="right"
              meta={rightVer.at}
            />
          </div>

          {/* Metadata strip */}
          <div className="sg-section" style={{ marginBottom: 12 }}>
            <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, fontSize: 12 }}>
              <div><div className="muted">Changed by</div><div style={{ fontWeight: 500 }}>{rightVer.by}</div></div>
              <div><div className="muted">At</div><div className="mono">{rightVer.at}</div></div>
              <div><div className="muted">Tier</div><div><span className={"badge " + (col.tier === "L1" ? "badge-blue" : col.tier === "L2" ? "badge-green" : "badge-amber")} style={{ fontSize: 10 }}>{col.tier}</span></div></div>
              <div><div className="muted">Deploy ref</div><div className="mono">{rightVer.deploy_ref || "—"}</div></div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {isL1
                ? "L1 columns cannot be reverted from this screen. Use the L1 promotion flow to roll back."
                : !isRevertable
                  ? "Revert is available only for the last 3 versions."
                  : "Reverting will create a new version restoring the “Before” JSON."}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              disabled={isL1 || !isRevertable}
              onClick={() => setConfirmRevert(true)}>
              ↺ Revert to v{leftVer.v}
            </button>
          </div>
        </>
      )}

      {/* Confirm revert modal */}
      {confirmRevert && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirmRevert(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: 480, borderRadius: "var(--radius)", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>Revert <span className="mono">{col.col}</span> to v{leftVer.v}?</div>
            <div style={{ padding: 18, fontSize: 13 }}>
              This creates a new version restoring the JSON shape from v{leftVer.v}. Existing rows are not migrated.
              <div className="alert alert-amber" style={{ marginTop: 12, fontSize: 12 }}>
                Reverting will increment the version to v{versions.length + 1}. The current v{rightVer.v} is preserved in history.
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--gray-050)" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRevert(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => { setConfirmRevert(false); }} style={{ background: "var(--amber)", borderColor: "var(--amber)" }}>Confirm revert</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

Object.assign(window, { SchemaDiffViewer, _settingsDiffJson: diffJson });
