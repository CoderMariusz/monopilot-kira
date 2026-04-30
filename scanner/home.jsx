// ============================================================
// SCN-home — Workflow Launcher + Settings
// Home uses the spec's section+mitem layout (not raw tiles) as
// the primary surface, matching scanner-kit.html.
// ============================================================

const HomeScreen = ({ onNav, onOpenFlow, onLogout }) => {
  const [showLogout, setShowLogout] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  const groups = SCN_HOME_GROUPS.map(g => ({
    ...g,
    items: SCN_TILES.filter(t => t.group === g.key),
  }));

  return (
    <>
      <Topbar
        title="Scanner"
        showBack={false}
        syncState="online"
        onMenu={() => onNav("settings")}
        onAvatar={() => setShowLogout(true)}
      />
      {toast && <Toast onDismiss={() => setToast(null)}>{toast}</Toast>}
      <Content>
        <div className="sc-ctx">
          <div className="sc-avatar">{SCN_USER.avatar}</div>
          <div className="sc-ctx-info">
            <div className="sc-ctx-name">{SCN_USER.name}</div>
            <div className="sc-ctx-line">{SCN_USER.lineName} · {SCN_USER.shiftName} · {SCN_USER.loginAt}</div>
          </div>
          <span className="sc-tbadge sync-online">ONLINE</span>
        </div>

        {groups.map(g => (
          <React.Fragment key={g.key}>
            <div className="sc-msec">{g.label}</div>
            {g.items.map(t => (
              <button key={t.key} className="sc-mitem" onClick={() => onOpenFlow(t.key)}>
                <div className={"sc-micon " + t.cls}>{t.icon}</div>
                <div className="sc-minfo">
                  <div className="sc-mtitle">{t.title}</div>
                  <div className="sc-mdesc">{t.desc}</div>
                </div>
                {t.badge
                  ? <span className="sc-mbadge">{t.badge}</span>
                  : <span className="sc-mchev">›</span>}
              </button>
            ))}
          </React.Fragment>
        ))}

        <div style={{padding:"20px 16px 10px", textAlign:"center"}}>
          <div style={{fontSize:10, color:"var(--sc-hint)"}}>Skaner v3.0 · MonoPilot MES v2.1</div>
        </div>
      </Content>
      <LogoutSheet open={showLogout} onClose={() => setShowLogout(false)} onConfirm={onLogout}/>
    </>
  );
};

const SettingsScreen = ({ onNav, onLogout }) => {
  const [sounds, setSounds] = React.useState(true);
  const [vibrate, setVibrate] = React.useState(true);
  const [autoAdv, setAutoAdv] = React.useState(true);
  const [scanMode, setScanMode] = React.useState("hardware");
  const [showLang, setShowLang] = React.useState(false);
  const [showLogout, setShowLogout] = React.useState(false);
  const [lang, setLang] = React.useState("pl");

  const Row = ({ title, desc, right }) => (
    <div className="sc-setting">
      <div>
        <div className="sn">{title}</div>
        {desc && <div className="sd">{desc}</div>}
      </div>
      {right}
    </div>
  );
  const Toggle = ({ on, onClick }) => (
    <button className={"sc-toggle " + (on ? "on" : "")} onClick={onClick}/>
  );

  return (
    <>
      <Topbar title="Ustawienia skanera" onBack={() => onNav("home")}/>
      <Content>
        <div className="sc-msec">Powiadomienia</div>
        <Row title="Dźwięki skanera" right={<Toggle on={sounds} onClick={() => setSounds(v => !v)}/>}/>
        <Row title="Wibracje" right={<Toggle on={vibrate} onClick={() => setVibrate(v => !v)}/>}/>

        <div className="sc-msec">Skanowanie</div>
        <Row title="Auto-advance po skanie" desc="Auto-krok 300ms" right={<Toggle on={autoAdv} onClick={() => setAutoAdv(v => !v)}/>}/>
        <div className="sc-pad" style={{borderBottom:"1px solid var(--sc-sep)"}}>
          <div className="sc-flabel">Preferowany tryb skanu</div>
          <div className="sc-segmented" style={{marginTop:8}}>
            <button className={"sc-seg " + (scanMode === "hardware" ? "on" : "")} onClick={() => setScanMode("hardware")}>Hardware</button>
            <button className={"sc-seg " + (scanMode === "camera" ? "on" : "")} onClick={() => setScanMode("camera")}>Kamera</button>
            <button className={"sc-seg " + (scanMode === "manual" ? "on" : "")} onClick={() => setScanMode("manual")}>Ręczny</button>
          </div>
        </div>

        <div className="sc-msec">Sesja</div>
        <Row title="Tryb urządzenia" desc="Osobiste · 300s timeout" right={<span style={{fontSize:11, color:"var(--sc-mute)"}}>admin</span>}/>
        <Row title="Aktywna sesja" desc={`${SCN_USER.lineName} · ${SCN_USER.shiftName} · ${SCN_USER.loginAt}`}/>

        <div className="sc-msec">Bezpieczeństwo</div>
        <button className="sc-setting" onClick={() => onNav("pin_change")} style={{background:"transparent", border:0, width:"100%", textAlign:"left", fontFamily:"inherit", color:"var(--sc-txt)"}}>
          <div>
            <div className="sn">Zmień PIN</div>
            <div className="sd">Ostatnia zmiana: {SCN_USER.lastPinChange} (89 dni temu)</div>
          </div>
          <span className="sc-mchev">›</span>
        </button>

        <div className="sc-msec">Język</div>
        <button className="sc-setting" onClick={() => setShowLang(true)} style={{background:"transparent", border:0, width:"100%", textAlign:"left", fontFamily:"inherit", color:"var(--sc-txt)"}}>
          <div>
            <div className="sn">Język interfejsu</div>
            <div className="sd">{lang === "pl" ? "🇵🇱 Polski" : lang === "en" ? "🇬🇧 English" : lang}</div>
          </div>
          <span className="sc-mchev">›</span>
        </button>

        <div className="sc-msec">Konto</div>
        <button className="sc-setting" onClick={() => setShowLogout(true)} style={{background:"transparent", border:0, width:"100%", textAlign:"left", fontFamily:"inherit", color:"var(--sc-red)"}}>
          <div>
            <div className="sn" style={{color:"var(--sc-red)"}}>Wyloguj</div>
          </div>
          <span className="sc-mchev">›</span>
        </button>

        <div style={{padding:"20px 16px", textAlign:"center", fontSize:10, color:"var(--sc-hint)"}}>
          MonoPilot MES v2.1.0 · Skaner v3.0
        </div>
      </Content>
      <LanguageSheet open={showLang} onClose={() => setShowLang(false)} value={lang} onApply={setLang}/>
      <LogoutSheet open={showLogout} onClose={() => setShowLogout(false)} onConfirm={onLogout}/>
    </>
  );
};

Object.assign(window, { HomeScreen, SettingsScreen });
