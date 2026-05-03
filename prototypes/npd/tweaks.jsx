// ============================================================================
// NPD module · tweaks.jsx — Tweaks panel (persona switch, active config, mock states)
// ----------------------------------------------------------------------------
// Implementation contract: see ./SCHEMA.md · ./API.md · ./COMPONENT-INTERFACES.md
// Spec: design/01-NPD-UX.md
// ============================================================================

// ============ Tweaks panel ============

const TweaksPanel = ({ open, onClose, tweaks, setTweaks }) => {
  const update = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    // persist
    window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { [k]: v } }, "*");
  };

  const group = (label, key, opts) => (
    <div className="tweak-group">
      <label>{label}</label>
      <div className="tweak-radio">
        {opts.map(o => (
          <button key={o.v} className={tweaks[key] === o.v ? "on" : ""} onClick={() => update(key, o.v)}>{o.l}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div id="tweaks" className={open ? "open" : ""}>
      <div className="tweaks-head">
        Tweaks
        <button className="tweak-close" onClick={onClose}>✕</button>
      </div>
      <div className="tweaks-body">
        {group("Pipeline default view", "pipelineView", [
          { v: "kanban", l: "Kanban" }, { v: "table", l: "Table" }, { v: "split", l: "Split" }
        ])}
        {group("Recipe editor layout", "editorLayout", [
          { v: "simple", l: "Simple" }, { v: "deep", l: "Deep" }
        ])}
        {group("Approval mode", "approvalMode", [
          { v: "single", l: "Single" }, { v: "multi", l: "Multi-step" }
        ])}
        {group("Table density", "density", [
          { v: "comfortable", l: "Comfortable" }, { v: "compact", l: "Compact" }
        ])}
      </div>
    </div>
  );
};

Object.assign(window, { TweaksPanel });
