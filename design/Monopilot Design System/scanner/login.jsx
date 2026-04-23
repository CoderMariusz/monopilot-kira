// ============================================================
// SCN-010 / SCN-011 / SCN-012 — Login, PIN, Site/Line/Shift
// ============================================================

const LoginScreen = ({ onNav, onContextSet }) => {
  const [mode, setMode] = React.useState("badge"); // badge | pass | pin
  const [badge, setBadge] = React.useState("");
  const [email, setEmail] = React.useState("j.kowalski@forza.pl");
  const [pass, setPass] = React.useState("");
  const [err, setErr] = React.useState("");
  const tryLogin = () => {
    if (badge.length < 3 && !email) { setErr("Wpisz login lub zeskanuj kartę"); return; }
    onNav("login_pin");
  };
  // Derive last-8 session outcomes for the stored user (data.jsx frozen — derive
  // deterministically from SCN_USER.id via shared helper). Per-cell tooltip shows
  // a relative-day label so the 8-cell strip is self-explanatory.
  const recentOutcomes = deriveRunHistory(SCN_USER).map((tone, i, arr) => {
    const daysAgo = arr.length - 1 - i;
    const label = daysAgo === 0 ? "Dziś" : daysAgo === 1 ? "Wczoraj" : `${daysAgo} dni temu`;
    return { tone, title: `${label} · sesja ${tone === "ok" ? "zakończona" : tone === "warn" ? "z ostrzeżeniem" : "z błędem"}` };
  });
  return (
    <>
      <Topbar title="Zaloguj się" showBack={false} syncState="online"/>
      <Content>
        <div className="sc-login-hero">
          <div className="sc-login-logo">🏭</div>
          <div className="sc-login-title">MonoPilot</div>
          <div className="sc-login-sub">Scanner · MES System</div>
        </div>
        {/* Recent-activity strip: last 8 sesji for this device/user. */}
        <div style={{padding:"0 20px 12px", textAlign:"center"}}>
          <div style={{fontSize:10, color:"var(--sc-hint)", textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:700, marginBottom:6}}>Ostatnie 8 sesji</div>
          <RunStrip outcomes={recentOutcomes} max={8} title="Ostatnie 8 sesji"/>
        </div>
        <div className="sc-sinput-area" style={{background:"transparent", borderBottom:0}}>
          <div className="sc-sinput-label">Zeskanuj kartę pracownika</div>
          <input
            className="sc-sinput"
            placeholder="Skanuj kartę lub wpisz ID…"
            value={badge}
            onChange={e => setBadge(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") tryLogin(); }}
            autoFocus
            inputMode="text"
            autoComplete="off"
          />
          <div className="sc-shint">Przyłóż kartę do czytnika lub użyj skanera</div>
        </div>
        <div className="sc-divider">lub zaloguj ręcznie</div>
        <div className="sc-fgroup">
          <div className="sc-flabel">Email / Login</div>
          <input className="sc-finput" value={email} onChange={e => setEmail(e.target.value)} placeholder="nazwa@forza.pl" inputMode="email"/>
        </div>
        <div className="sc-fgroup">
          <div className="sc-flabel">Hasło</div>
          <input type="password" className="sc-finput" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••"/>
        </div>
        {err && <div className="sc-inline-err">{err}</div>}
        <div className="sc-app-version">v2.1.0 · MonoPilot MES</div>
      </Content>
      <BottomActions>
        <Btn variant="p" onClick={tryLogin}>Zaloguj się →</Btn>
        <GhostBtn onClick={() => onNav("login_pin")}>🔢 Zaloguj przez PIN</GhostBtn>
        <GhostBtn onClick={() => onNav("pin_setup")} style={{fontSize:11}}>Pierwszy raz? Ustaw PIN (SCN-011b)</GhostBtn>
      </BottomActions>
    </>
  );
};

const PinScreen = ({ onNav }) => {
  const [pin, setPin] = React.useState("");
  const [err, setErr] = React.useState(false);
  const [triesLeft, setTriesLeft] = React.useState(5);

  const press = (digit) => {
    if (err) setErr(false);
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 6) {
      setTimeout(() => {
        if (next === "142536" || next === "000000" || next === "123456") {
          onNav("site_select");
        } else {
          // Demo: accept anything to proceed. We'll accept 6 digits as "correct"
          onNav("site_select");
        }
      }, 300);
    }
  };
  const back = () => setPin(p => p.slice(0, -1));

  return (
    <>
      <Topbar title="Wpisz PIN" onBack={() => onNav("login")} syncState="online"/>
      <Content>
        <div style={{padding:"30px 16px 10px", textAlign:"center"}}>
          <div style={{fontSize:13, color:"var(--sc-mute)", marginBottom:8}}>Wpisz swój 6-cyfrowy PIN</div>
          <div className="sc-pin-dots">
            {Array.from({length:6}).map((_,i) => (
              <div key={i} className={"sc-pin-dot " + (i < pin.length ? "filled " : "") + (err ? "err" : "")}/>
            ))}
          </div>
          {err && (
            <div style={{color:"var(--sc-red)", fontSize:12, marginTop:4}}>
              Nieprawidłowy PIN. Pozostało prób: {triesLeft} z 5.
            </div>
          )}
        </div>
        <div className="sc-numpad">
          {["1","2","3","4","5","6","7","8","9"].map(k => (
            <button key={k} className="sc-key" onClick={() => press(k)}>{k}</button>
          ))}
          <button className="sc-key empty" disabled/>
          <button className="sc-key" onClick={() => press("0")}>0</button>
          <button className="sc-key back" onClick={back}>⌫</button>
        </div>
        <div style={{padding:"8px 0 20px", textAlign:"center"}}>
          <GhostBtn onClick={() => onNav("login")}>← Inne metody logowania</GhostBtn>
        </div>
      </Content>
    </>
  );
};

const SiteSelectScreen = ({ onNav }) => {
  const [site, setSite] = React.useState("FORZ");
  const [line, setLine] = React.useState("LINE-01");
  const [shift, setShift] = React.useState("morning");

  const canGo = site && line && shift;
  const summary = canGo
    ? `${site} · ${SCN_LINES.find(l => l.code === line).name} · ${SCN_SHIFTS.find(s => s.code === shift).name} · ${SCN_SHIFTS.find(s => s.code === shift).hours}`
    : "Wybierz zakład, linię i zmianę";

  return (
    <>
      <Topbar title="Start zmiany" onBack={() => onNav("login_pin")} syncState="online"/>
      <Content>
        <div className="sc-ctx">
          <div className="sc-avatar">{SCN_USER.avatar}</div>
          <div className="sc-ctx-info">
            <div className="sc-ctx-name">{SCN_USER.name}</div>
            <div className="sc-ctx-line">{SCN_USER.email} · {SCN_USER.role}</div>
          </div>
          <span className="sc-tbadge sync-online">ZALOG.</span>
        </div>

        <div className="sc-section-title">Zakład / firma</div>
        {SCN_SITES.map(s => (
          <button key={s.code} className={"sc-opt-card " + (site === s.code ? "on" : "")} onClick={() => setSite(s.code)}>
            <span className="oi">🏭</span>
            <span style={{flex:1}}>
              <span className="oc">{s.code} · {s.name}</span>
              <span className="od">{s.desc}</span>
            </span>
            {site === s.code && <span className="ocheck">✓</span>}
          </button>
        ))}

        <div className="sc-section-title">Linia produkcyjna</div>
        <div className="sc-opt-grid">
          {SCN_LINES.map(l => (
            <button key={l.code} className={"sc-opt-mini " + (line === l.code ? "on" : "")} onClick={() => setLine(l.code)}>
              <div>
                <span className={"dot " + (l.status === "active" ? "on-green" : "on-amber")}></span>
                <span className="omn">{l.name}</span>
              </div>
              <div className="omd">{l.desc}</div>
            </button>
          ))}
        </div>

        <div className="sc-section-title">Zmiana</div>
        <div className="sc-opt-shifts">
          {SCN_SHIFTS.map(s => (
            <button key={s.code} className={"sc-opt-mini " + (shift === s.code ? "on" : "")} onClick={() => setShift(s.code)}>
              <div className="omn">{s.name}</div>
              <div className="omd">{s.hours}</div>
            </button>
          ))}
        </div>

        <div style={{padding:"16px"}}/>
      </Content>
      <BottomActions>
        <div style={{fontSize:11, color:"var(--sc-mute)", textAlign:"center"}}>{summary}</div>
        <Btn variant="p" disabled={!canGo} onClick={() => onNav("home")}>▶ Rozpocznij zmianę</Btn>
      </BottomActions>
    </>
  );
};

// ============================================================
// SCN-011b — PIN First-Time Setup (forced at first login)
// Per PRD D8 / UX §3.3: 2-step set + confirm, policy validation
// (4-6 digit numeric, no trivial sequence like 000000 / 123456).
// ============================================================
const PinSetupScreen = ({ onNav, onDone }) => {
  const [stage, setStage] = React.useState("set"); // set | confirm
  const [pin, setPin] = React.useState("");
  const [firstPin, setFirstPin] = React.useState("");
  const [err, setErr] = React.useState(null);

  const minLen = 4, maxLen = 6;
  const weakPins = new Set(["0000", "1111", "1234", "12345", "123456", "000000", "111111"]);

  const validatePolicy = (p) => {
    if (p.length < minLen) return `PIN musi mieć min. ${minLen} cyfr`;
    if (weakPins.has(p)) return "PIN za prosty — wybierz inny";
    if (/^(\d)\1+$/.test(p)) return "PIN nie może być same powtórzone cyfry";
    return null;
  };

  const press = (d) => {
    if (err) setErr(null);
    if (pin.length >= maxLen) return;
    setPin(p => p + d);
  };
  const back = () => setPin(p => p.slice(0, -1));

  const submitStage = () => {
    const policyErr = validatePolicy(pin);
    if (policyErr) { setErr(policyErr); return; }
    if (stage === "set") {
      setFirstPin(pin);
      setPin("");
      setStage("confirm");
      return;
    }
    if (pin !== firstPin) {
      setErr("PIN-y nie są identyczne — wpisz ponownie");
      setPin("");
      return;
    }
    // Success → proceed to site selection (or callback)
    if (onDone) onDone(pin);
    else onNav("site_select");
  };

  const title = stage === "set" ? "Ustaw PIN (pierwsze logowanie)" : "Potwierdź PIN";
  const hint  = stage === "set"
    ? "Wybierz 4–6 cyfrowy PIN. Unikaj trywialnych sekwencji."
    : "Wpisz ponownie ten sam PIN, aby potwierdzić.";

  const canSubmit = pin.length >= minLen;

  return (
    <>
      <Topbar title={title} onBack={() => onNav("login")} syncState="online"/>
      <Content>
        <div style={{padding:"20px 16px 10px", textAlign:"center"}}>
          <div style={{fontSize:13, color:"var(--sc-mute)", marginBottom:8}}>{hint}</div>
          <div className="sc-pin-dots">
            {Array.from({length: maxLen}).map((_,i) => (
              <div key={i} className={"sc-pin-dot " + (i < pin.length ? "filled " : "") + (err ? "err" : "")}/>
            ))}
          </div>
          <div style={{fontSize:11, color:"var(--sc-hint)", marginTop:6}}>
            {pin.length}/{maxLen} cyfr · min {minLen}
          </div>
          {err && (
            <div style={{color:"var(--sc-red)", fontSize:12, marginTop:8}}>{err}</div>
          )}
          {stage === "set" && (
            <div style={{fontSize:10, color:"var(--sc-hint)", marginTop:10, letterSpacing:"0.05em"}}>
              KROK 1 Z 2
            </div>
          )}
          {stage === "confirm" && (
            <div style={{fontSize:10, color:"var(--sc-hint)", marginTop:10, letterSpacing:"0.05em"}}>
              KROK 2 Z 2
            </div>
          )}
        </div>
        <div className="sc-numpad">
          {["1","2","3","4","5","6","7","8","9"].map(k => (
            <button key={k} className="sc-key" onClick={() => press(k)}>{k}</button>
          ))}
          <button className="sc-key empty" disabled/>
          <button className="sc-key" onClick={() => press("0")}>0</button>
          <button className="sc-key back" onClick={back}>⌫</button>
        </div>
      </Content>
      <BottomActions>
        <Btn variant="p" disabled={!canSubmit} onClick={submitStage}>
          {stage === "set" ? "Dalej → Potwierdź PIN" : "Zapisz PIN"}
        </Btn>
      </BottomActions>
    </>
  );
};

// ============================================================
// SCN-011c — PIN Change (Self-service)
// Per UX §3.4: 3-step flow — old PIN → new PIN → confirm new.
// Settings → "Zmień PIN" row navigates here.
// ============================================================
const PinChangeScreen = ({ onNav }) => {
  const [stage, setStage] = React.useState("old"); // old | new | confirm
  const [pin, setPin] = React.useState("");
  const [newPin, setNewPin] = React.useState("");
  const [err, setErr] = React.useState(null);
  const [done, setDone] = React.useState(false);

  const minLen = 4, maxLen = 6;
  const weakPins = new Set(["0000", "1111", "1234", "12345", "123456", "000000", "111111"]);
  // Demo: current PIN is 142536 (same as PinScreen happy path).
  const CURRENT_PIN = "142536";

  const press = (d) => {
    if (err) setErr(null);
    if (pin.length >= maxLen) return;
    setPin(p => p + d);
  };
  const back = () => setPin(p => p.slice(0, -1));

  const validatePolicy = (p) => {
    if (p.length < minLen) return `PIN musi mieć min. ${minLen} cyfr`;
    if (weakPins.has(p)) return "PIN za prosty — wybierz inny";
    if (/^(\d)\1+$/.test(p)) return "PIN nie może być same powtórzone cyfry";
    return null;
  };

  const submit = () => {
    if (stage === "old") {
      if (pin !== CURRENT_PIN && !(pin.length === 6)) {
        // demo: strict check against 142536, accept any 6-digit for sandbox
        setErr("Niepoprawny aktualny PIN");
        setPin("");
        return;
      }
      setPin("");
      setStage("new");
      return;
    }
    if (stage === "new") {
      const policyErr = validatePolicy(pin);
      if (policyErr) { setErr(policyErr); return; }
      if (pin === CURRENT_PIN) {
        setErr("Nowy PIN nie może być taki sam jak poprzedni");
        setPin("");
        return;
      }
      setNewPin(pin);
      setPin("");
      setStage("confirm");
      return;
    }
    // confirm stage
    if (pin !== newPin) {
      setErr("PIN-y nie są identyczne");
      setPin("");
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <>
        <Topbar title="PIN zmieniony" onBack={() => onNav("settings")}/>
        <Content>
          <div className="sc-success-wrap">
            <div className="sc-success-icon" style={{color:"var(--sc-green)"}}>✅</div>
            <div className="sc-success-title">PIN zaktualizowany</div>
            <div className="sc-success-sub">Używaj nowego PIN-u przy następnym logowaniu</div>
          </div>
          <Banner kind="info" title="Zalogowano zdarzenie">Zmiana PIN zalogowana w audit log (SCN-AUDIT-PIN-CHANGE).</Banner>
        </Content>
        <BottomActions>
          <Btn variant="p" onClick={() => onNav("settings")}>Wróć do ustawień</Btn>
        </BottomActions>
      </>
    );
  }

  const titles = {
    old:     "Wpisz aktualny PIN",
    new:     "Ustaw nowy PIN",
    confirm: "Potwierdź nowy PIN",
  };
  const hints = {
    old:     "Podaj swój obecny PIN, aby potwierdzić tożsamość.",
    new:     "Wybierz 4–6 cyfrowy PIN. Unikaj trywialnych sekwencji.",
    confirm: "Wpisz ponownie nowy PIN, aby potwierdzić.",
  };
  const stepLabels = { old: "KROK 1 Z 3", new: "KROK 2 Z 3", confirm: "KROK 3 Z 3" };
  const canSubmit = pin.length >= minLen;

  return (
    <>
      <Topbar title={titles[stage]} onBack={() => onNav("settings")}/>
      <Content>
        <div style={{padding:"20px 16px 10px", textAlign:"center"}}>
          <div style={{fontSize:13, color:"var(--sc-mute)", marginBottom:8}}>{hints[stage]}</div>
          <div className="sc-pin-dots">
            {Array.from({length: maxLen}).map((_,i) => (
              <div key={i} className={"sc-pin-dot " + (i < pin.length ? "filled " : "") + (err ? "err" : "")}/>
            ))}
          </div>
          <div style={{fontSize:11, color:"var(--sc-hint)", marginTop:6}}>{pin.length}/{maxLen} cyfr · min {minLen}</div>
          {err && <div style={{color:"var(--sc-red)", fontSize:12, marginTop:8}}>{err}</div>}
          <div style={{fontSize:10, color:"var(--sc-hint)", marginTop:10, letterSpacing:"0.05em"}}>{stepLabels[stage]}</div>
        </div>
        <div className="sc-numpad">
          {["1","2","3","4","5","6","7","8","9"].map(k => (
            <button key={k} className="sc-key" onClick={() => press(k)}>{k}</button>
          ))}
          <button className="sc-key empty" disabled/>
          <button className="sc-key" onClick={() => press("0")}>0</button>
          <button className="sc-key back" onClick={back}>⌫</button>
        </div>
      </Content>
      <BottomActions>
        <Btn variant="p" disabled={!canSubmit} onClick={submit}>
          {stage === "old" ? "Weryfikuj →" : stage === "new" ? "Dalej → Potwierdź" : "Zapisz nowy PIN"}
        </Btn>
      </BottomActions>
    </>
  );
};

Object.assign(window, { LoginScreen, PinScreen, SiteSelectScreen, PinSetupScreen, PinChangeScreen });
