// ==============================================================
// SHARED MODAL PRIMITIVES — used by every MonoPilot prototype module
// See ./MODAL-SCHEMA.md for the full pattern doc.
//
// Primitives defined here:
//   Modal         — base wrapper (backdrop, ESC, size tokens, a11y)
//   Stepper       — wizard step indicator
//   Field         — form field wrapper (label + required + help + error)
//   ReasonInput   — textarea with min-length counter
//   Summary       — read-only review block (key/value rows)
//
// Each module's `modals.jsx` imports these via global window assignment
// (prototype-only — real code uses ES modules).
// ==============================================================

const Modal = ({ open, onClose, title, subtitle, size = "default", foot, children, dismissible = true }) => {
  React.useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (dismissible && e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose, dismissible]);

  if (!open) return null;

  const widthMap = { sm: 420, default: 560, wide: 760, fullpage: 900 };
  const width = widthMap[size] || 560;

  return (
    <div className="modal-overlay" onClick={() => dismissible && onClose()} role="dialog" aria-modal="true">
      <div className={"modal-box " + (size === "wide" || size === "fullpage" ? "wide" : "")} style={{width}} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="muted" style={{fontSize:11, marginTop:2}}>{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
};

const Stepper = ({ steps, current, completed }) => (
  <div className="wiz-stepper">
    {steps.map((s, i) => {
      const isDone = completed.has(s.key);
      const isCurrent = s.key === current;
      return (
        <React.Fragment key={s.key}>
          <div className={"wiz-step " + (isDone ? "done " : "") + (isCurrent ? "current" : "")}>
            <span className="wiz-step-num">{isDone ? "✓" : i + 1}</span>
            <span className="wiz-step-label">{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className={"wiz-step-line " + (isDone ? "done" : "")}></div>}
        </React.Fragment>
      );
    })}
  </div>
);

const Field = ({ label, required, help, error, children }) => (
  <div className="ff">
    <label>{label} {required && <span className="req">*</span>}</label>
    {children}
    {error && <div className="ff-error">{error}</div>}
    {help && !error && <div className="ff-help">{help}</div>}
  </div>
);

const ReasonInput = ({ value, onChange, minLength = 10, placeholder = "Enter reason...", error }) => {
  const len = (value || "").length;
  const valid = len >= minLength;
  return (
    <>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{minHeight: 70}} />
      <div className="ff-help" style={{display:"flex", justifyContent:"space-between"}}>
        <span>{error ? <span style={{color:"var(--red)"}}>{error}</span> : "This reason will be audit-logged."}</span>
        <span className="mono" style={{color: valid ? "var(--green-700)" : "var(--muted)"}}>{len} / {minLength}{valid ? " ✓" : " min"}</span>
      </div>
    </>
  );
};

const Summary = ({ rows }) => (
  <div className="summary-block">
    {rows.map((r, i) => (
      <div key={i} className={"summary-row " + (r.emphasis ? "emph" : "")}>
        <span className="muted">{r.label}</span>
        <span className="spacer"></span>
        <span className={r.mono !== false ? "mono" : ""} style={{fontWeight: r.emphasis ? 700 : 500}}>{r.value}</span>
      </div>
    ))}
  </div>
);

Object.assign(window, { Modal, Stepper, Field, ReasonInput, Summary });
