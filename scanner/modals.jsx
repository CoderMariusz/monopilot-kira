// ============================================================
// Scanner — scanner-specific modals (bottom-sheet style in dark theme)
//
// Reuses the shared `Modal` primitive but with CSS overrides applied
// in scanner.css (the `.scanner-app .modal-box` cascade). All scanner
// modals slide up from the bottom, dark slate bg, gray handle pill.
//
// Modals:
//   ReasonPickerSheet    — generic reason-code bottom sheet (FEFO, putaway override, partial consume)
//   FefoDeviationSheet   — side-by-side LP compare + reason
//   BestBeforeSheet      — soft warn + reason
//   PartialConsumeSheet  — BOM deficits list + reason
//   PrinterPickerSheet   — P2 stub
//   LanguageSheet        — language picker
//   LogoutSheet          — logout confirm
//   ScanErrorSheet       — unrecoverable scan error
//   QtyKeypadSheet       — numeric keypad fallback
//   BlockFullscreen      — use_by hard block full-screen overlay
// ============================================================

const ReasonPickerSheet = ({ open, onClose, title, reasons = [], onConfirm }) => {
  const [sel, setSel] = React.useState(null);
  const [other, setOther] = React.useState("");
  const needsOther = sel === "other";
  const canSubmit = sel && (!needsOther || other.length >= 5);
  const foot = (
    <>
      <Btn variant="p" disabled={!canSubmit} onClick={() => { onConfirm({ id: sel, other }); onClose(); }}>Potwierdź</Btn>
      <Btn variant="sec" onClick={onClose}>Anuluj</Btn>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" foot={foot}>
      <div style={{display:"flex", flexDirection:"column", gap:8}}>
        {reasons.map(r => (
          <button key={r.id}
            className={"sc-reason-btn " + (sel === r.id ? "on" : "")}
            onClick={() => setSel(r.id)}>
            <span className="ri">{r.icon || "•"}</span>
            <span style={{flex:1}}>{r.label}</span>
            <span style={{color: sel === r.id ? "var(--sc-red)" : "var(--sc-elev)"}}>{sel === r.id ? "●" : "○"}</span>
          </button>
        ))}
        {needsOther && (
          <textarea className="sc-finput" style={{minHeight:72}}
            placeholder="Opisz powód…"
            value={other}
            onChange={e => setOther(e.target.value)}/>
        )}
      </div>
    </Modal>
  );
};

const FefoDeviationSheet = ({ open, onClose, suggested, chosen, onConfirm, onUseFefo }) => {
  const [reason, setReason] = React.useState(null);
  const [other, setOther] = React.useState("");
  const needsOther = reason === "other";
  const canConfirm = reason && (!needsOther || other.length >= 5);
  const foot = (
    <>
      <Btn variant="w" disabled={!canConfirm} onClick={() => { onConfirm({ reason, other }); onClose(); }}>
        Potwierdź z wybranym LP
      </Btn>
      <Btn variant="sec" onClick={() => { onUseFefo && onUseFefo(); onClose(); }}>Użyj FEFO</Btn>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Odchylenie FEFO" subtitle="Wybrany LP inny niż sugestia" foot={foot}>
      <div className="sc-cmp-grid">
        <div className="sc-cmp-card suggest">
          <div className="sc-cmp-label">Sugestia FEFO</div>
          <div className="sc-cmp-lp">{suggested.lp}</div>
          <div className="sc-cmp-exp">Expiry: {suggested.expiry}</div>
        </div>
        <div className="sc-cmp-card chosen">
          <div className="sc-cmp-label">Wybrany</div>
          <div className="sc-cmp-lp">{chosen.lp}</div>
          <div className="sc-cmp-exp">Expiry: {chosen.expiry}</div>
        </div>
      </div>
      <Field label="Powód odchylenia" required>
        <select className="sc-finput" value={reason || ""} onChange={e => setReason(e.target.value)}>
          <option value="">— wybierz —</option>
          {SCN_REASONS_FEFO.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Field>
      {needsOther && (
        <Field label="Opisz powód" required>
          <textarea className="sc-finput" value={other} onChange={e => setOther(e.target.value)} placeholder="Min. 5 znaków"/>
        </Field>
      )}
      <Banner kind="warn" title="Odchylenie zostanie zalogowane">
        Akcja zostanie zapisana do audit log z twoim loginem i powodem.
      </Banner>
    </Modal>
  );
};

const BestBeforeSheet = ({ open, onClose, lp, daysLeft, onConfirm }) => {
  const [reason, setReason] = React.useState(null);
  const canConfirm = !!reason;
  const foot = (
    <>
      <Btn variant="w" disabled={!canConfirm} onClick={() => { onConfirm({ reason }); onClose(); }}>Kontynuuj</Btn>
      <Btn variant="sec" onClick={onClose}>Użyj innego LP</Btn>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Data best before" subtitle={`${lp.lp} · ${lp.product}`} foot={foot}>
      <Banner kind="warn" title={`Za ${daysLeft} dni (${lp.expiry})`}>
        Ten LP zbliża się do daty best_before. Możesz kontynuować po wybraniu powodu.
      </Banner>
      <Field label="Powód akceptacji" required>
        <select className="sc-finput" value={reason || ""} onChange={e => setReason(e.target.value)}>
          <option value="">— wybierz —</option>
          <option value="planned">Planowe zużycie — produkt w dobrej jakości</option>
          <option value="inspected">Zweryfikowane wizualnie — OK</option>
          <option value="other">Inny powód</option>
        </select>
      </Field>
    </Modal>
  );
};

const PartialConsumeSheet = ({ open, onClose, missing = [], onConfirm }) => {
  const [reason, setReason] = React.useState(null);
  const canSubmit = !!reason;
  const foot = (
    <>
      <Btn variant="w" disabled={!canSubmit} onClick={() => { onConfirm({ reason }); onClose(); }}>Kontynuuj z audytem</Btn>
      <Btn variant="sec" onClick={onClose}>Anuluj</Btn>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Niepełna konsumpcja" subtitle="Nie wszystkie materiały BOM zeskanowane" foot={foot}>
      <Banner kind="warn" title="Brakuje materiałów:">
        <ul style={{margin:"4px 0 0 14px", padding:0}}>
          {missing.map((m, i) => (
            <li key={i} style={{fontSize:11, margin:"2px 0"}}>
              <strong>{m.name}</strong>: zeskanowano <span style={{color:"var(--sc-amber-2)"}}>{m.done}</span> / {m.req} {m.uom}
              <span style={{color:"var(--sc-red)", marginLeft:6}}>(brak {m.req - m.done} {m.uom})</span>
            </li>
          ))}
        </ul>
      </Banner>
      <Field label="Powód niepełnej konsumpcji" required>
        <select className="sc-finput" value={reason || ""} onChange={e => setReason(e.target.value)}>
          <option value="">— wybierz —</option>
          {SCN_REASONS_PARTIAL.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Field>
    </Modal>
  );
};

const PrinterPickerSheet = ({ open, onClose, onSkip }) => {
  const foot = (
    <>
      <Btn variant="p" disabled>Wydrukuj etykietę</Btn>
      <Btn variant="sec" onClick={() => { onSkip && onSkip(); onClose(); }}>Pomiń</Btn>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Drukarka etykiet" subtitle="Funkcja w wersji P2" foot={foot}>
      <Banner kind="info" title="P2">
        Drukowanie etykiet ze skanera dostępne w fazie P2. W P1 wydrukuj etykietę z pulpitu magazynowego lub linii produkcyjnej.
      </Banner>
      <div style={{padding:"8px 0"}}>
        <div style={{padding:"12px 10px", background:"var(--sc-bg)", borderRadius:10, border:"1px solid var(--sc-elev)", fontSize:12, opacity:0.6}}>
          <div style={{display:"flex", justifyContent:"space-between", marginBottom:6}}>
            <span>🖨 Zebra ZT411 · Linia A</span>
            <span style={{color:"var(--sc-green)", fontSize:10}}>● online</span>
          </div>
          <div style={{fontSize:11, color:"var(--sc-mute)"}}>Nieaktywne — funkcja P2</div>
        </div>
      </div>
    </Modal>
  );
};

const LanguageSheet = ({ open, onClose, value = "pl", onApply }) => {
  const [sel, setSel] = React.useState(value);
  const opts = [
    { id: "pl", flag: "🇵🇱", label: "Polski" },
    { id: "en", flag: "🇬🇧", label: "English" },
    { id: "uk", flag: "🇺🇦", label: "Українська" },
    { id: "ro", flag: "🇷🇴", label: "Română" },
  ];
  const foot = (
    <>
      <Btn variant="p" onClick={() => { onApply && onApply(sel); onClose(); }}>Zastosuj</Btn>
      <Btn variant="sec" onClick={onClose}>Anuluj</Btn>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Język interfejsu" foot={foot}>
      <div style={{display:"flex", flexDirection:"column", gap:8}}>
        {opts.map(o => (
          <button key={o.id}
            className={"sc-reason-btn " + (sel === o.id ? "on" : "")}
            onClick={() => setSel(o.id)}
            style={sel === o.id ? {background:"var(--sc-blue-bg)", borderColor:"var(--sc-blue)", color:"var(--sc-blue-2)"} : null}>
            <span className="ri" style={{fontSize:22}}>{o.flag}</span>
            <span style={{flex:1}}>{o.label}</span>
            <span>{sel === o.id ? "●" : "○"}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
};

const LogoutSheet = ({ open, onClose, onConfirm }) => {
  const foot = (
    <>
      <Btn variant="d" onClick={() => { onConfirm && onConfirm(); onClose(); }}>Wyloguj</Btn>
      <Btn variant="sec" onClick={onClose}>Anuluj</Btn>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Wylogować się?" foot={foot}>
      <Banner kind="info" title="Sesja zostanie zakończona">
        Niezapisane operacje mogą zostać utracone (P1 — brak offline queue).
      </Banner>
    </Modal>
  );
};

const ScanErrorSheet = ({ open, onClose, code, title, message, onRetry }) => {
  const foot = (
    <>
      {onRetry && <Btn variant="p" onClick={() => { onRetry(); onClose(); }}>Spróbuj ponownie</Btn>}
      <Btn variant="sec" onClick={onClose}>Wróć</Btn>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title={title || "Błąd skanowania"} foot={foot}>
      <Banner kind="err" title={title}>
        {message}
      </Banner>
      {code && (
        <div style={{fontSize:10, color:"var(--sc-hint)", textTransform:"uppercase", letterSpacing:"0.1em", marginTop:12, textAlign:"center"}}>
          Kod błędu: {code}
        </div>
      )}
    </Modal>
  );
};

const QtyKeypadSheet = ({ open, onClose, initial = "", max, uom = "kg", onConfirm }) => {
  const [val, setVal] = React.useState(String(initial || ""));
  React.useEffect(() => { if (open) setVal(String(initial || "")); }, [open, initial]);
  const press = (ch) => {
    if (ch === "⌫") setVal(v => v.slice(0, -1));
    else if (ch === ".") { if (!val.includes(".")) setVal(v => (v || "0") + "."); }
    else setVal(v => (v + ch).replace(/^0+(\d)/, "$1"));
  };
  const keys = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];
  const foot = (
    <Btn variant="p" onClick={() => { onConfirm && onConfirm(val); onClose(); }}>Zatwierdź</Btn>
  );
  return (
    <Modal open={open} onClose={onClose} title="Podaj ilość" subtitle={max != null ? `Maks: ${max} ${uom}` : null} foot={foot}>
      <div style={{textAlign:"center", fontSize:28, fontFamily:"'Courier New', monospace", fontWeight:700, padding:"14px 0", background:"var(--sc-bg)", borderRadius:10, border:"1px solid var(--sc-elev)", marginBottom:12}}>
        {val || "0"} <span style={{fontSize:14, color:"var(--sc-mute)", fontWeight:400}}>{uom}</span>
      </div>
      <div className="sc-numpad" style={{padding:0}}>
        {keys.map(k => (
          <button key={k} className={"sc-key " + (k === "⌫" ? "back" : "")} onClick={() => press(k)}>{k}</button>
        ))}
      </div>
    </Modal>
  );
};

// Full-screen hard-block overlay (use_by expired, session expired, LP locked, etc.)
const BlockFullscreen = ({ open, onClose, code, title, message, onRetry, retryLabel = "Spróbuj ponownie" }) => {
  if (!open) return null;
  return (
    <div style={{
      position:"absolute", inset:0, zIndex: 90,
      background:"var(--sc-bg)",
      display:"flex", flexDirection:"column",
      justifyContent:"center", alignItems:"center",
      padding:"40px 24px", textAlign:"center",
    }}>
      <div style={{fontSize:64, color:"var(--sc-red)", marginBottom:16}}>✗</div>
      <div style={{fontSize:22, fontWeight:700, color:"var(--sc-red)", marginBottom:8}}>{title}</div>
      <div style={{fontSize:14, color:"var(--sc-txt-2)", maxWidth:280, lineHeight:1.5, marginBottom:20}}>{message}</div>
      {code && <div style={{fontSize:10, color:"var(--sc-hint)", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:30}}>Kod: {code}</div>}
      <div style={{display:"flex", flexDirection:"column", gap:10, width:"100%"}}>
        {onRetry && <Btn variant="p" onClick={onRetry}>{retryLabel}</Btn>}
        <Btn variant="sec" onClick={onClose}>Wróć do menu</Btn>
      </div>
    </div>
  );
};

// LP-locked amber modal
const LpLockedSheet = ({ open, onClose, lp, lockedBy = "Marta W.", seconds = 140 }) => {
  const foot = <Btn variant="sec" onClick={onClose}>OK</Btn>;
  return (
    <Modal open={open} onClose={onClose} title="LP zablokowany" foot={foot}>
      <Banner kind="warn" title={`LP ${lp} używany`}>
        LP jest aktualnie używany przez <strong>{lockedBy}</strong>. Wygasa za {seconds}s. Odczekaj lub skontaktuj się z supervisorem.
      </Banner>
    </Modal>
  );
};

// ============================================================
// FR-SC-FE-007 — CameraScanner (viewfinder overlay)
//
// Full-screen camera scan overlay for 3-method input parity
// (hardware / camera / manual). Real impl uses `@zxing/browser`
// `BrowserMultiFormatReader` against a <video> element. The prototype
// renders a dark viewfinder + reticle + torch/flip controls and
// simulates decode via `setTimeout` + fake GS1/LP result, so the
// demo flow can be walked end-to-end without a real camera or TLS.
//
// Usage: CameraScanner({ onNav, returnTo, onResult }) — mounted as
// a top-level screen via app.jsx case "camera_scan". Scanner dark
// palette preserved: all colors use --sc-* tokens.
// ============================================================
const CameraScanner = ({ onNav, returnTo = "home", onResult }) => {
  const videoRef = React.useRef(null);
  const [facing, setFacing] = React.useState("environment"); // environment | user
  const [torch, setTorch] = React.useState(false);
  const [status, setStatus] = React.useState("scanning"); // scanning | found | error
  const [result, setResult] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const streamRef = React.useRef(null);

  // Attach real camera if available (HTTPS + getUserMedia). Fallback: show
  // simulated viewfinder backdrop. In the canonical implementation this is
  // replaced with a `BrowserMultiFormatReader` attached to videoRef.
  React.useEffect(() => {
    let cancelled = false;
    const startCam = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setErr("Kamera niedostępna — użyj trybu ręcznego lub hardware scannera.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        setErr("Brak uprawnień do kamery. Nadaj uprawnienia w ustawieniach urządzenia.");
      }
    };
    startCam();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [facing]);

  // Demo: simulate a zxing decode after 2.5s (or on demand via button).
  const simulateDecode = (fakeCode) => {
    const code = fakeCode || "LP-00287";
    setResult(code);
    setStatus("found");
    // small delay to show success state, then route back with result.
    setTimeout(() => {
      if (onResult) onResult(code);
      else onNav(returnTo, code);
    }, 600);
  };

  React.useEffect(() => {
    if (err) return;
    const t = setTimeout(() => {
      if (status === "scanning") simulateDecode("LP-00287");
    }, 2500);
    return () => clearTimeout(t);
  }, [status, err]);

  return (
    <>
      <Topbar title="Skanuj kamerą" onBack={() => onNav(returnTo)} syncState="online"/>
      <Content style={{padding:0, background:"#000"}}>
        <div style={{position:"relative", width:"100%", height:"100%", minHeight:460, overflow:"hidden", background:"#000"}}>
          {/* Video feed (real camera if available) */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", background:"#111"}}
          />
          {/* Dim overlay frame */}
          <div style={{position:"absolute", inset:0, background:"radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.75) 70%)"}}/>
          {/* Reticle */}
          <div style={{
            position:"absolute", top:"50%", left:"50%",
            transform:"translate(-50%, -50%)",
            width:240, height:160,
            border:"2px solid var(--sc-green)",
            borderRadius:12,
            boxShadow:"0 0 0 2000px rgba(0,0,0,0.35) inset",
          }}>
            {/* corner ticks */}
            {["tl","tr","bl","br"].map(c => (
              <span key={c} style={{
                position:"absolute",
                width:18, height:18,
                borderColor:"var(--sc-green)",
                borderStyle:"solid",
                ...(c==="tl" && {top:-2, left:-2, borderWidth:"3px 0 0 3px"}),
                ...(c==="tr" && {top:-2, right:-2, borderWidth:"3px 3px 0 0"}),
                ...(c==="bl" && {bottom:-2, left:-2, borderWidth:"0 0 3px 3px"}),
                ...(c==="br" && {bottom:-2, right:-2, borderWidth:"0 3px 3px 0"}),
              }}/>
            ))}
            {/* scanning line */}
            {status === "scanning" && (
              <div style={{
                position:"absolute",
                left:0, right:0, height:2,
                background:"linear-gradient(90deg, transparent, var(--sc-green), transparent)",
                top:"50%",
                animation:"sc-scan-line 1.2s linear infinite",
              }}/>
            )}
          </div>

          {/* Status label */}
          <div style={{position:"absolute", top:16, left:0, right:0, textAlign:"center", pointerEvents:"none"}}>
            <span className={"sc-tbadge " + (status === "found" ? "sync-online" : "sync-queued")} style={{fontSize:11}}>
              {status === "found" ? `✓ ${result}` : err ? "Brak kamery" : "Skanowanie…"}
            </span>
          </div>

          {/* Error message */}
          {err && (
            <div style={{
              position:"absolute", left:20, right:20, top:"40%",
              padding:"12px 14px",
              background:"var(--sc-bg)",
              border:"1px solid var(--sc-red)",
              borderRadius:10,
              color:"var(--sc-txt)",
              fontSize:12,
              textAlign:"center",
            }}>
              {err}
            </div>
          )}

          {/* Controls overlay (bottom) */}
          <div style={{
            position:"absolute",
            left:0, right:0, bottom:90,
            display:"flex",
            justifyContent:"center",
            gap:12,
            pointerEvents:"auto",
          }}>
            <button
              onClick={() => setTorch(t => !t)}
              aria-label="Latarka"
              style={{width:56, height:56, borderRadius:"50%", border:"1px solid var(--sc-elev)", background: torch ? "var(--sc-amber)" : "rgba(0,0,0,0.5)", color: torch ? "#000" : "var(--sc-txt)", fontSize:22, cursor:"pointer"}}
            >💡</button>
            <button
              onClick={() => setFacing(f => f === "environment" ? "user" : "environment")}
              aria-label="Zmień kamerę"
              style={{width:56, height:56, borderRadius:"50%", border:"1px solid var(--sc-elev)", background:"rgba(0,0,0,0.5)", color:"var(--sc-txt)", fontSize:22, cursor:"pointer"}}
            >🔄</button>
          </div>
        </div>
      </Content>
      <BottomActions>
        <Btn variant="p" onClick={() => simulateDecode("LP-00287")}>📷 Demo decode: LP-00287</Btn>
        <Btn variant="sec" onClick={() => onNav(returnTo)}>Anuluj</Btn>
      </BottomActions>
    </>
  );
};

Object.assign(window, {
  ReasonPickerSheet, FefoDeviationSheet, BestBeforeSheet, PartialConsumeSheet,
  PrinterPickerSheet, LanguageSheet, LogoutSheet, ScanErrorSheet, QtyKeypadSheet,
  BlockFullscreen, LpLockedSheet, CameraScanner,
});
