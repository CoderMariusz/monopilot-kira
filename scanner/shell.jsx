// ============================================================
// Scanner — shell primitives
// ScannerFrame — 390×844 device chrome (notch, statusbar, root wrapper).
// Topbar       — 56px: back chevron | title | user badge | overflow.
// BottomActions (.sc-brow) — primary action anchored at bottom of the frame.
// Toast — top-toast above topbar for inline feedback.
// ============================================================

const ScannerFrame = ({ children }) => (
  <div className="scanner-app" role="application" aria-label="MonoPilot Scanner">
    <div className="sc-notch"/>
    <StatusBar/>
    {children}
  </div>
);

const StatusBar = () => {
  const [time, setTime] = React.useState(() => {
    const d = new Date(); return d.toTimeString().slice(0,5);
  });
  React.useEffect(() => {
    const t = setInterval(() => {
      const d = new Date(); setTime(d.toTimeString().slice(0,5));
    }, 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="sc-statusbar">
      <span>{time}</span>
      <span style={{color:"var(--sc-hint)", fontWeight:500, fontSize:11}}>MonoPilot MES</span>
      <span className="sc-statusbar-icons">📶 🔋</span>
    </div>
  );
};

const Topbar = ({ title, onBack, syncState = "online", onMenu, onAvatar, showBack = true }) => {
  const badgeCls =
    syncState === "queued" ? "sync-queued" :
    syncState === "err"    ? "sync-err"    : "sync-online";
  const badgeText =
    syncState === "queued" ? "QUEUED 3" :
    syncState === "err"    ? "SYNC ERR" : "ONLINE";
  return (
    <div className="sc-topbar">
      {showBack ? (
        <button className="sc-tbtn" onClick={onBack} aria-label="Wróć">←</button>
      ) : (
        <button className="sc-tbtn" aria-hidden="true" disabled style={{opacity:0}}>·</button>
      )}
      <div className="sc-ttitle">{title}</div>
      <span className={"sc-tbadge " + badgeCls} title="Status synchronizacji">{badgeText}</span>
      <button className="sc-tbtn" onClick={onAvatar} aria-label="Profil">
        <span style={{fontSize:11, fontWeight:700, color:"var(--sc-txt-2)"}}>{(window.SCN_USER && SCN_USER.initials) || "JK"}</span>
      </button>
      <button className="sc-tbtn" onClick={onMenu} aria-label="Menu">⋮</button>
    </div>
  );
};

const Content = ({ children, style }) => (
  <div className="sc-content" style={style}>{children}</div>
);

const BottomActions = ({ children, tall }) => (
  <div className={"sc-brow " + (tall ? "tall " : "")}>{children}</div>
);

const Btn = ({ variant = "p", onClick, children, disabled, style, ...rest }) => (
  <button className={"sc-btn sc-btn-" + variant} onClick={onClick} disabled={disabled} style={style} {...rest}>
    {children}
  </button>
);

const GhostBtn = ({ onClick, children, style }) => (
  <button className="sc-btn sc-btn-ghost" onClick={onClick} style={style}>{children}</button>
);

// Toast — appears inside device frame, top
const Toast = ({ type = "ok", children, onDismiss }) => {
  React.useEffect(() => {
    if (!onDismiss) return;
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  const cls = type === "err" ? "err" : type === "warn" ? "warn" : "";
  return <div className={"sc-toast " + cls}>{children}</div>;
};

// Scan input area: label + big auto-focus field + hint + camera/manual
const ScanInputArea = ({ label, placeholder, hint = "Skieruj czytnik lub wpisz ręcznie", value, onChange, onSubmit, autoFocus = true, state = "idle", extra }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);
  const cls =
    state === "err" ? "err" :
    state === "ok"  ? "ok"  : "";
  return (
    <div className="sc-sinput-area">
      {label && <div className="sc-sinput-label">{label}</div>}
      <input
        ref={ref}
        className={"sc-sinput " + cls}
        placeholder={placeholder}
        value={value || ""}
        onChange={e => onChange && onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && onSubmit) onSubmit(e.currentTarget.value); }}
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="sc-shint">{hint}</div>
      <div className="sc-sinput-tools">
        <button className="sc-sinput-tool"><span className="ico">📷</span> Kamera</button>
        <button className="sc-sinput-tool"><span className="ico">⌨</span> Ręcznie</button>
      </div>
      {extra}
    </div>
  );
};

// Small banner block
const Banner = ({ kind = "info", icon, title, children, onDismiss }) => {
  const cls = "sc-banner sc-" + kind;
  const ic = icon || (kind === "warn" ? "⚠️" : kind === "err" ? "✗" : kind === "success" ? "✓" : "💡");
  return (
    <div className={cls}>
      <span className="bicon">{ic}</span>
      <div style={{flex:1}}>
        {title && <div className="btitle">{title}</div>}
        <div className="btext">{children}</div>
      </div>
      {onDismiss && <button className="sc-tbtn" style={{width:24, height:24}} onClick={onDismiss}>×</button>}
    </div>
  );
};

// Status chip (shared with st-* classes)
const StatusChip = ({ status }) => {
  const map = {
    planned:    { cls: "st-planned",  label: "Zaplanowane" },
    released:   { cls: "st-released", label: "Zwolnione" },
    inprog:     { cls: "st-inprog",   label: "W toku" },
    onhold:     { cls: "st-onhold",   label: "Wstrzymane" },
    done:       { cls: "st-done",     label: "Gotowe" },
    blocked:    { cls: "st-blocked",  label: "Zablokowane" },
    in_transit: { cls: "st-transit",  label: "W tranzycie" },
    awaiting_receipt: { cls: "st-planned", label: "Oczekuje" },
    available:  { cls: "st-released", label: "Dostępne" },
    qc_pending: { cls: "st-onhold",   label: "Oczekuje QA" },
    overdue:    { cls: "st-blocked",  label: "Zaległe" },
    due_today:  { cls: "st-inprog",   label: "Dziś" },
    future:     { cls: "st-planned",  label: "Przyszłe" },
  };
  const m = map[status] || { cls: "st-planned", label: status };
  return <span className={"sc-status " + m.cls}>{m.label}</span>;
};

// Mini-grid component — renders 2-column grid of label/value cells
const MiniGrid = ({ rows }) => (
  <div className="sc-mini-grid">
    {rows.map((r, i) => (
      <div className="sc-mini-row" key={i}>
        <div className="sc-mini-cell">
          <div className="sc-mini-label">{r[0].label}</div>
          <div className={"sc-mini-val " + (r[0].cls || "")}>{r[0].value}</div>
        </div>
        {r[1] && (
          <div className="sc-mini-cell">
            <div className="sc-mini-label">{r[1].label}</div>
            <div className={"sc-mini-val " + (r[1].cls || "")}>{r[1].value}</div>
          </div>
        )}
      </div>
    ))}
  </div>
);

// Step indicator (scanner variant — 3px bars, not circles)
const StepsBar = ({ steps, current }) => {
  return (
    <>
      <div className="sc-steps">
        {steps.map((s, i) => {
          const cls = i < current ? "done" : i === current ? "active" : "";
          return <div key={i} className={"sc-step " + cls}/>;
        })}
      </div>
      <div className="sc-steps-label">
        {steps.map((s, i) => (
          <span key={i} style={{color: i === current ? "var(--sc-blue)" : i < current ? "var(--sc-green)" : undefined}}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
    </>
  );
};

Object.assign(window, {
  ScannerFrame, StatusBar, Topbar, Content, BottomActions, Btn, GhostBtn, Toast,
  ScanInputArea, Banner, StatusChip, MiniGrid, StepsBar,
});
