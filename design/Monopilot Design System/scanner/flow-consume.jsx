// ============================================================
// SCN-080 / 081 — WO list, WO detail, WO Execute, Consume scan
// Hard-lock consumption path + use_by hard block + best_before warn +
// FEFO deviation reason.
// Integration: WO codes match Planning data (WO-2026-0108, etc.)
// ============================================================

const WoListScreen = ({ onNav, onOpenWo }) => {
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState("my_line");
  let wos = SCN_WOS;
  if (filter === "my_line") wos = wos.filter(w => w.line === SCN_USER.line);
  if (filter === "active") wos = wos.filter(w => w.status === "inprog");
  if (q) wos = wos.filter(w => (w.code + " " + w.product).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Topbar title="Work Orders" onBack={() => onNav("home")}/>
      <Content>
        <div className="sc-sbar">
          <input className="sc-sinp2" placeholder="Skanuj WO lub wpisz…" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
        <div className="sc-pills">
          <button className={"sc-pill " + (filter === "all" ? "on" : "")} onClick={() => setFilter("all")}>Wszystkie</button>
          <button className={"sc-pill " + (filter === "my_line" ? "on" : "")} onClick={() => setFilter("my_line")}>Moja linia</button>
          <button className={"sc-pill " + (filter === "active" ? "on" : "")} onClick={() => setFilter("active")}>Aktywne</button>
        </div>
        {wos.length === 0 && (
          <EmptyState dark icon="📭" title="Brak aktywnych WO"
            body="Czekaj na zwolnienie WO przez planistę."/>
        )}
        {wos.map(w => (
          <button key={w.code} className="sc-litem" onClick={() => onOpenWo(w.code)}>
            <div className="sc-licon">🏭</div>
            <div className="sc-linfo">
              <div className="sc-ltitle" style={{fontFamily:"'Courier New', monospace", letterSpacing:0.5}}>{w.code}</div>
              <div className="sc-lsub">{w.product} · {w.line}</div>
              <div style={{marginTop:4}}><StatusChip status={w.status}/></div>
            </div>
            <div className="sc-lright">
              <div style={{fontSize:12, color:"var(--sc-green)", fontWeight:700}}>{w.actual} / {w.planned} {w.uom}</div>
              <div style={{marginTop:4}}>
                <div className="sc-cbar" style={{width:60}}>
                  <div style={{width: w.progress + "%"}}/>
                </div>
              </div>
            </div>
            <span className="sc-lchev">›</span>
          </button>
        ))}
      </Content>
    </>
  );
};

const WoDetailScreen = ({ woCode, onNav, onExecute }) => {
  const wo = SCN_WOS.find(w => w.code === woCode) || SCN_WOS[0];
  const bom = SCN_BOM[wo.code] || [];
  return (
    <>
      <Topbar title={wo.code} onBack={() => onNav("wos")}/>
      <Content>
        <div className="sc-wo-card">
          <div className="sc-wo-top">
            <div>
              <div className="sc-wo-num">{wo.code}</div>
              <div className="sc-wo-prod">{wo.product} · <span style={{color:"var(--sc-blue-2)"}}>{wo.line}</span></div>
              <div style={{marginTop:8}}><StatusChip status={wo.status}/></div>
            </div>
            <div style={{textAlign:"right", fontSize:10, color:"var(--sc-hint)"}}>
              {SCN_USER.shiftName}
              <div style={{color:"var(--sc-amber)", fontWeight:700, marginTop:2}}>Wysoki priorytet</div>
            </div>
          </div>
          <div className="sc-wo-meta">
            <div className="sc-wm"><div className="sc-wm-label">Cel</div><div className="sc-wm-val blue">{wo.planned} {wo.uom}</div></div>
            <div className="sc-wm"><div className="sc-wm-label">Wyprod.</div><div className="sc-wm-val green">{wo.actual} {wo.uom}</div></div>
            <div className="sc-wm"><div className="sc-wm-label">Start</div><div className="sc-wm-val">{wo.startedAt}</div></div>
            <div className="sc-wm"><div className="sc-wm-label">Operator</div><div className="sc-wm-val">{wo.operator}</div></div>
          </div>
        </div>

        <div className="sc-pad" style={{paddingTop:4, paddingBottom:4}}>
          <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:"var(--sc-mute)"}}>
            <span>Postęp WO</span>
            <span style={{color:"var(--sc-green)", fontWeight:700}}>{wo.progress}%</span>
          </div>
        </div>
        <div className="sc-pbar">
          <div className="sc-pbar-fill" style={{width: wo.progress + "%"}}/>
        </div>

        <div className="sc-section-title">Komponenty (BOM)</div>
        {bom.map((c, i) => (
          <div className="sc-crow" key={i}>
            <div className={"sc-ccheck cck-" + (c.status === "ok" ? "ok" : c.status === "warn" ? "warn" : "empty")}>
              {c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "○"}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div className="sc-cname">{c.material}</div>
              <div className="sc-cdet">
                {c.lp ? `${c.lp} · Partia ${c.batch}` : "— nie zeskanowano —"}
              </div>
            </div>
            <div>
              <div className="sc-cqty-val" style={{color: c.status === "ok" ? "var(--sc-green)" : c.status === "warn" ? "var(--sc-amber)" : "var(--sc-elev)"}}>{c.qtyDone}</div>
              <div className="sc-cqty-of">/ {c.qtyReq} {c.uom}</div>
            </div>
          </div>
        ))}
      </Content>
      <BottomActions tall>
        <Btn variant="p" onClick={() => onExecute(wo.code)}>▶ Kontynuuj produkcję</Btn>
        <div className="sc-brow sc-brow-2" style={{padding:0, border:0}}>
          <Btn variant="sec">⏸ Wstrzymaj</Btn>
          <Btn variant="sec">📋 Szczegóły BOM</Btn>
        </div>
      </BottomActions>
    </>
  );
};

const WoExecuteScreen = ({ woCode, onNav, onScanComponent, onOutput, onCoproduct, onWaste }) => {
  const wo = SCN_WOS.find(w => w.code === woCode) || SCN_WOS[0];
  const bom = SCN_BOM[wo.code] || [];
  const scanned = bom.filter(c => c.status === "ok" || c.status === "warn");
  const missing = bom.filter(c => c.qtyDone < c.qtyReq);
  const [tab, setTab] = React.useState("components");
  const nextMaterial = bom.find(c => c.qtyDone < c.qtyReq);

  return (
    <>
      <Topbar title={wo.code + " · Wykonaj"} onBack={() => onNav("wo_detail", wo.code)}/>
      <Content>
        <div className="sc-progress-strip">
          <span className="ps-lbl">{wo.product}</span>
          <span className="ps-val">{wo.actual} / {wo.planned} {wo.uom} ({wo.progress}%)</span>
        </div>
        <div className="sc-pbar"><div className="sc-pbar-fill" style={{width: wo.progress + "%"}}/></div>

        {missing.length > 0 && (
          <Banner kind="warn" title="Niepełna konsumpcja materiałów">
            Brakuje: {missing.map(m => `${m.material} (${m.qtyReq - m.qtyDone} ${m.uom})`).join(", ")}. Zeskanuj przed rejestracją wyrobu.
          </Banner>
        )}

        {nextMaterial && (
          <div className="sc-next-sug">
            <span style={{fontSize:18}}>💡</span>
            <div style={{flex:1}}>
              <div className="nlabel">Następny do zeskanowania</div>
              <div className="nname">{nextMaterial.material} · potrzeba jeszcze {nextMaterial.qtyReq - nextMaterial.qtyDone} {nextMaterial.uom}</div>
            </div>
          </div>
        )}

        <div className="sc-tabs">
          <button className={"sc-tab " + (tab === "components" ? "on" : "")} onClick={() => setTab("components")}>
            📦 Komponenty [{bom.length}]
          </button>
          <button className={"sc-tab " + (tab === "scanned" ? "on" : "")} onClick={() => setTab("scanned")}>
            ✅ Zeskanowane [{scanned.length}]
          </button>
        </div>

        {tab === "components" && bom.map((c, i) => (
          <button className="sc-crow" key={i} onClick={() => onScanComponent(wo.code, c.line)}>
            <div className={"sc-ccheck cck-" + (c.status === "ok" ? "ok" : c.status === "warn" ? "warn" : "empty")}>
              {c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "○"}
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div className="sc-cname">{c.material}</div>
              <div className="sc-cdet">{c.location} · sugestia: {c.lpSuggested || c.lp || "—"}</div>
              <div className="sc-cbar" style={{width:120, marginTop:4}}>
                <div style={{width: Math.min(100, (c.qtyDone / c.qtyReq) * 100) + "%"}}/>
              </div>
            </div>
            <div>
              <div className="sc-cqty-val" style={{color: c.status === "ok" ? "var(--sc-green)" : c.status === "warn" ? "var(--sc-amber)" : "var(--sc-elev)"}}>{c.qtyDone}</div>
              <div className="sc-cqty-of">/ {c.qtyReq} {c.uom}</div>
            </div>
          </button>
        ))}

        {tab === "scanned" && (
          <>
            {scanned.length === 0 && (
              <Banner kind="info" title="Brak konsumpcji">Nie zeskanowano jeszcze żadnego LP dla tego WO.</Banner>
            )}
            {scanned.map((c, i) => (
              <div className="sc-srow" key={i}>
                <div className="sc-srow-icon">✓</div>
                <div style={{flex:1, minWidth:0}}>
                  <div className="sc-ltitle">{c.lp}</div>
                  <div className="sc-lsub">{c.material} · Partia {c.batch}</div>
                </div>
                <div className="sc-sqty">{c.qtyDone} <span style={{fontSize:10, color:"var(--sc-mute)"}}>{c.uom}</span></div>
              </div>
            ))}
          </>
        )}
      </Content>
      <BottomActions tall>
        <Btn variant="p" onClick={() => onScanComponent(wo.code, nextMaterial ? nextMaterial.line : 1)}>📷 Skanuj komponent</Btn>
        <Btn variant="s" onClick={() => onOutput(wo.code)}>✅ Wyrób gotowy</Btn>
        <div className="sc-brow sc-brow-2" style={{padding:0, border:0}}>
          <Btn variant="v" onClick={() => onCoproduct(wo.code)}>⚡ Co-product</Btn>
          <Btn variant="w" onClick={() => onWaste(wo.code)}>🗑 Odpad</Btn>
        </div>
      </BottomActions>
    </>
  );
};

// SCN-080-scan — Scan component → identify LP → FEFO / use_by / best_before → qty
const ConsumeScanScreen = ({ woCode, bomLine, onNav, onDone }) => {
  const wo = SCN_WOS.find(w => w.code === woCode) || SCN_WOS[0];
  const bom = SCN_BOM[wo.code] || [];
  const line = bom.find(b => b.line === bomLine) || bom[0] || {};

  const [step, setStep] = React.useState(0);
  const [scanVal, setScanVal] = React.useState("");
  const [lp, setLp] = React.useState(null);
  const [qty, setQty] = React.useState("");
  const [scanState, setScanState] = React.useState("idle");
  const [inlineErr, setInlineErr] = React.useState(null);

  const [showFefo, setShowFefo] = React.useState(false);
  const [showBb, setShowBb] = React.useState(false);
  const [showBlock, setShowBlock] = React.useState(null);
  const [showLocked, setShowLocked] = React.useState(false);
  const [showError, setShowError] = React.useState(null);
  const [showKeypad, setShowKeypad] = React.useState(false);
  const [fefoNote, setFefoNote] = React.useState(null);
  const [bbNote, setBbNote] = React.useState(null);

  const submitScan = (val) => {
    const code = (val || scanVal).trim().toUpperCase();
    setInlineErr(null);
    if (!code) { setInlineErr("Wpisz lub zeskanuj kod LP"); setScanState("err"); return; }
    if (!code.startsWith("LP")) {
      setShowError({ code:"SC_INVALID_BARCODE", title:"Nierozpoznany kod", message:`Kod "${code}" nie pasuje do formatu LP-XXXXX.` });
      setScanState("err");
      return;
    }
    const lpData = SCN_LPS[code];
    if (!lpData) {
      setShowError({ code:"SC_LP_NOT_FOUND", title:"LP nie znaleziony", message:`LP "${code}" nie istnieje w systemie. Sprawdź etykietę lub użyj wyszukiwania ręcznego.` });
      setScanState("err");
      return;
    }
    if (lpData.status === "consumed") {
      setShowError({ code:"SC_LP_CONSUMED", title:"LP już skonsumowany", message:"Ten LP został w pełni skonsumowany i nie jest dostępny. Wybierz inny LP." });
      return;
    }
    if (lpData.qaStatus === "hold" || lpData.qaStatus === "failed") {
      setShowError({ code:"SC_LP_QA_HOLD", title:"LP na wstrzymaniu QA", message:"Ten LP jest wstrzymany do inspekcji QA. Nie można wykonać operacji." });
      return;
    }
    // FR-SC-BE-030/031: consume is LP-modifying → acquire lease before mutation.
    // acquireLpLock is defined in flow-other.jsx (exposed via window).
    const lockFn = (window.acquireLpLock || (() => ({ status: "acquired" })));
    const lockResult = lockFn(lpData);
    if (lockResult && lockResult.status === "locked_by_other") {
      setShowLocked(true);
      setShowError({
        code: "SC_LP_LOCKED",
        title: "LP zablokowany",
        message: `LP jest aktualnie używany przez ${lockResult.lockedBy}. Lease wygasa za ${lockResult.expiresIn}s.`,
      });
      return;
    }
    // use_by gate
    const today = new Date("2026-04-21");
    const exp = new Date(lpData.expiry);
    if (lpData.datePolicy === "use_by" && exp <= today) {
      setShowBlock({
        code: "SC_LP_USE_BY_EXPIRED",
        title: "LP po dacie USE BY",
        message: `Konsumpcja niemożliwa. use_by: ${lpData.expiry}. Wybierz inny LP lub skontaktuj się z supervisorem.`,
      });
      return;
    }
    // best_before: 7-day warning window
    const daysLeft = Math.round((exp - today) / 86400000);
    if (lpData.datePolicy === "best_before" && daysLeft <= 7) {
      setLp(lpData);
      setShowBb({ daysLeft });
      setScanState("ok");
      return;
    }
    // FEFO deviation check
    const suggestedLp = line.lpSuggested ? SCN_LPS[line.lpSuggested] : null;
    if (suggestedLp && suggestedLp.lp !== lpData.lp && new Date(suggestedLp.expiry) < exp) {
      setLp(lpData);
      setShowFefo({ suggested: suggestedLp, chosen: lpData });
      setScanState("ok");
      return;
    }
    setLp(lpData);
    setQty(String(Math.min(lpData.qty, line.qtyReq - line.qtyDone || lpData.qty)));
    setScanState("ok");
    setStep(2);
  };

  const confirmQty = () => {
    onDone({ lp: lp.lp, qty, fefoNote, bbNote });
  };

  return (
    <>
      <Topbar title={wo.code + " · Konsumpcja"} onBack={() => onNav("wo_execute", wo.code)}/>
      <Content>
        <StepsBar steps={["Skanuj LP", "Weryfikacja", "Ilość"]} current={step}/>

        {step === 0 && (
          <>
            {line.material && (
              <div className="sc-next-sug" style={{marginTop:12}}>
                <span style={{fontSize:18}}>💡</span>
                <div style={{flex:1}}>
                  <div className="nlabel">Proponowany składnik</div>
                  <div className="nname">{line.material} · potrzeba {line.qtyReq - line.qtyDone} {line.uom}</div>
                </div>
              </div>
            )}
            <ScanInputArea
              label="Zeskanuj LP składnika"
              placeholder="LP-XXXXX lub skanuj…"
              hint="Skanuj etykietę z opakowania lub palety"
              value={scanVal}
              onChange={setScanVal}
              onSubmit={submitScan}
              state={scanState}
              extra={
                <div style={{display:"flex", gap:8, marginTop:10}}>
                  <Btn variant="sec" onClick={() => submitScan("LP-00287")} style={{flex:1, height:40, fontSize:12}}>Demo: LP-00287 (FEFO dev)</Btn>
                  <Btn variant="sec" onClick={() => submitScan("LP-00301")} style={{flex:1, height:40, fontSize:12}}>Demo: LP-00301 (use_by)</Btn>
                </div>
              }
            />
            {inlineErr && <div className="sc-inline-err">{inlineErr}</div>}
          </>
        )}

        {step === 2 && lp && (
          <>
            <MiniGrid rows={[
              [{ label: "Produkt", value: lp.product }, { label: "Partia", value: lp.batch, cls:"mono" }],
              [{ label: "Dostępne", value: `${lp.qty} ${lp.uom}` }, { label: "Expiry", value: lp.expiry }],
              [{ label: "Lokalizacja", value: lp.location || "—", cls:"mono" }, { label: "BOM match", value: "✓ Zgodny", cls:"green" }],
            ]}/>
            {fefoNote && <Banner kind="warn" title="Odchylenie FEFO zalogowane">Powód: {fefoNote}</Banner>}
            {bbNote && <Banner kind="warn" title="Best-before zaakceptowane">Powód: {bbNote}</Banner>}
            <div className="sc-fgroup">
              <div className="sc-flabel">Ilość do konsumpcji <span className="req">*</span></div>
              <input
                className="sc-finput big"
                value={qty}
                onChange={e => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
                onClick={() => setShowKeypad(true)}
                readOnly
                style={{cursor:"pointer"}}
              />
              <div className="sc-fhint">Dostępne: {lp.qty} {lp.uom} · Potrzeba {line.qtyReq - line.qtyDone} {lp.uom}</div>
            </div>
            <div className="sc-fgroup">
              <div className="sc-flabel">Partia (z LP)</div>
              <div className="sc-fvalue" style={{fontFamily:"'Courier New', monospace"}}>{lp.batch}</div>
            </div>
          </>
        )}
      </Content>
      {step === 2 && (
        <BottomActions>
          <Btn variant="s" onClick={confirmQty} disabled={!qty || Number(qty) <= 0 || Number(qty) > lp.qty}>Potwierdź konsumpcję</Btn>
        </BottomActions>
      )}

      <FefoDeviationSheet
        open={!!showFefo}
        onClose={() => setShowFefo(false)}
        suggested={showFefo ? showFefo.suggested : { lp:"", expiry:"" }}
        chosen={showFefo ? showFefo.chosen : { lp:"", expiry:"" }}
        onConfirm={({ reason, other }) => { setFefoNote(reason === "other" ? other : reason); setStep(2); setQty(String(lp.qty)); }}
        onUseFefo={() => { setScanVal(line.lpSuggested || ""); setLp(SCN_LPS[line.lpSuggested]); setStep(2); setQty(String(SCN_LPS[line.lpSuggested].qty)); }}
      />
      <BestBeforeSheet
        open={!!showBb}
        onClose={() => setShowBb(false)}
        lp={lp || {}}
        daysLeft={showBb ? showBb.daysLeft : 0}
        onConfirm={({ reason }) => { setBbNote(reason); setStep(2); setQty(String(lp.qty)); }}
      />
      <BlockFullscreen
        open={!!showBlock}
        onClose={() => { setShowBlock(null); onNav("wo_execute", wo.code); }}
        code={showBlock ? showBlock.code : ""}
        title={showBlock ? showBlock.title : ""}
        message={showBlock ? showBlock.message : ""}
        onRetry={() => { setShowBlock(null); setScanVal(""); setStep(0); setScanState("idle"); }}
        retryLabel="Skanuj inny LP"
      />
      <ScanErrorSheet
        open={!!showError}
        onClose={() => setShowError(null)}
        code={showError ? showError.code : ""}
        title={showError ? showError.title : ""}
        message={showError ? showError.message : ""}
        onRetry={() => { setShowError(null); setScanVal(""); setScanState("idle"); }}
      />
      <QtyKeypadSheet
        open={showKeypad}
        onClose={() => setShowKeypad(false)}
        initial={qty}
        max={lp ? lp.qty : 0}
        uom={lp ? lp.uom : "kg"}
        onConfirm={v => setQty(v)}
      />
      <LpLockedSheet open={showLocked} onClose={() => setShowLocked(false)} lp=""/>
    </>
  );
};

// SCN-080-done — consume confirmed
const ConsumeDoneScreen = ({ detail, onNav, woCode }) => (
  <>
    <Topbar title="Zeskanowano" onBack={() => onNav("wo_execute", woCode)}/>
    <Content>
      <div className="sc-success-wrap">
        <div className="sc-success-icon" style={{color:"var(--sc-green)"}}>✅</div>
        <div className="sc-success-title">Konsumpcja zapisana</div>
        <div className="sc-success-sub">{detail.lp} · {detail.qty} kg</div>
      </div>
      {detail.fefoNote && <Banner kind="warn" title="Odchylenie FEFO">Powód: {detail.fefoNote} — zalogowane w audit log.</Banner>}
      {detail.bbNote && <Banner kind="warn" title="Best-before">Powód: {detail.bbNote} — zalogowane.</Banner>}
      <Banner kind="success" title="BOM zaktualizowany">Postęp WO odświeżony. Kontynuuj lub zarejestruj wyrób gotowy.</Banner>
    </Content>
    <BottomActions>
      <Btn variant="p" onClick={() => onNav("consume_scan", woCode)}>📷 Skanuj kolejny</Btn>
      <Btn variant="sec" onClick={() => onNav("wo_execute", woCode)}>Wróć do WO</Btn>
    </BottomActions>
  </>
);

Object.assign(window, { WoListScreen, WoDetailScreen, WoExecuteScreen, ConsumeScanScreen, ConsumeDoneScreen });
