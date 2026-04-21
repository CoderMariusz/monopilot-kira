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
  return (
    <>
      <Topbar title="Zaloguj się" showBack={false} syncState="online"/>
      <Content>
        <div className="sc-login-hero">
          <div className="sc-login-logo">🏭</div>
          <div className="sc-login-title">MonoPilot</div>
          <div className="sc-login-sub">Scanner · MES System</div>
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

Object.assign(window, { LoginScreen, PinScreen, SiteSelectScreen });
