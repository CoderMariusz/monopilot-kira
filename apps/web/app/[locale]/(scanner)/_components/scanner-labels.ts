// ============================================================
// Scanner — server-resolved i18n labels (Lane B)
//
// The (scanner) group sits under NextIntlClientProvider, but the canonical
// keys for the scanner namespace are NOT yet merged into apps/web/messages/**
// (owned by a separate lane). To avoid inline strings in client components,
// server pages call getScannerLabels(locale) and pass the resolved object down.
// The exact same key tree is staged in _meta/i18n-staging/scanner.json
// (en + pl) for promotion into messages/** later.
//
// Only en + pl carry real copy per the project i18n policy; ro/uk mirror en
// at promotion time via the staging script.
// ============================================================

export type ScannerLocale = "pl" | "en";

type TileLabel = { title: string; desc: string };

interface ScannerLabelsShape {
  topbar: {
    back: string;
    profile: string;
    menu: string;
    syncTitle: string;
    online: string;
    queued: string;
    syncErr: string;
  };
  scanTools: { camera: string; manual: string };
  reasonSheet: { confirm: string; cancel: string; close: string; otherPlaceholder: string };
  language: { title: string; apply: string; cancel: string; close: string };
  logout: {
    title: string;
    bannerTitle: string;
    bannerBody: string;
    logout: string;
    cancel: string;
    close: string;
  };
  scanError: { retry: string; back: string; close: string; codeLabel: string };
  qtyKeypad: { title: string; maxLabel: string; confirm: string; close: string };
  block: { retry: string; backToMenu: string; codeLabel: string };
  login: {
    title: string;
    appName: string;
    appSub: string;
    emailLabel: string;
    emailPlaceholder: string;
    pinLabel: string;
    pinHint: string;
    submit: string;
    setupCta: string;
    version: string;
    errInvalidPin: string;
    errPinLocked: string;
    errNetwork: string;
    signingIn: string;
    backspace: string;
  };
  pinSetup: {
    titleSet: string;
    titleConfirm: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    hintSet: string;
    hintConfirm: string;
    step1: string;
    step2: string;
    digits: string;
    min: string;
    nextBtn: string;
    saveBtn: string;
    backspace: string;
    errMinLen: string;
    errWeak: string;
    errRepeat: string;
    errMismatch: string;
    errMissingCreds: string;
    errSaveFailed: string;
    saving: string;
  };
  site: {
    title: string;
    loggedIn: string;
    siteSection: string;
    lineSection: string;
    shiftSection: string;
    pickPrompt: string;
    start: string;
    loading: string;
    empty: string;
    errLoad: string;
    retry: string;
    saving: string;
    shiftMorning: string;
    shiftAfternoon: string;
    shiftNight: string;
  };
  home: {
    title: string;
    sectionProduction: string;
    sectionWarehouse: string;
    sectionQuality: string;
    comingSoon: string;
    footer: string;
    tiles: {
      wos: TileLabel;
      consume: TileLabel;
      output: TileLabel;
      receive: TileLabel;
      move: TileLabel;
      putaway: TileLabel;
      pick: TileLabel;
      qa: TileLabel;
      inquiry: TileLabel;
      settings: TileLabel;
    };
  };
  settings: {
    title: string;
    sessionSection: string;
    deviceMode: string;
    deviceModeValue: string;
    activeSession: string;
    noSession: string;
    languageSection: string;
    languageRow: string;
    securitySection: string;
    changePin: string;
    changePinDesc: string;
    accountSection: string;
    logout: string;
    footer: string;
    currentPin: string;
    newPin: string;
    confirmNewPin: string;
    save: string;
    pinChanged: string;
    pinChangeFailed: string;
    saving: string;
    errMismatch: string;
    errMinLen: string;
  };
  loading: string;
}

const en: ScannerLabelsShape = {
  // shell primitives
  topbar: {
    back: "Back",
    profile: "Profile",
    menu: "Menu",
    syncTitle: "Sync status",
    online: "ONLINE",
    queued: "QUEUED",
    syncErr: "SYNC ERR",
  },
  scanTools: { camera: "Camera", manual: "Manual" },
  // modals
  reasonSheet: {
    confirm: "Confirm",
    cancel: "Cancel",
    close: "Close",
    otherPlaceholder: "Describe the reason…",
  },
  language: {
    title: "Interface language",
    apply: "Apply",
    cancel: "Cancel",
    close: "Close",
  },
  logout: {
    title: "Log out?",
    bannerTitle: "Session will end",
    bannerBody: "Unsaved operations may be lost (P1 — no offline queue).",
    logout: "Log out",
    cancel: "Cancel",
    close: "Close",
  },
  scanError: {
    retry: "Try again",
    back: "Back",
    close: "Close",
    codeLabel: "Error code",
  },
  qtyKeypad: {
    title: "Enter quantity",
    maxLabel: "Max",
    confirm: "Confirm",
    close: "Close",
  },
  block: {
    retry: "Try again",
    backToMenu: "Back to menu",
    codeLabel: "Code",
  },
  // login
  login: {
    title: "Sign in",
    appName: "MonoPilot",
    appSub: "Scanner · MES System",
    emailLabel: "Email / Login",
    emailPlaceholder: "name@company.com",
    pinLabel: "PIN",
    pinHint: "Enter your 4–6 digit PIN",
    submit: "Sign in →",
    setupCta: "First time? Set up your PIN",
    version: "v3.0 · MonoPilot MES",
    errInvalidPin: "Invalid email or PIN.",
    errPinLocked: "PIN locked after too many attempts. Contact your supervisor.",
    errNetwork: "Connection error. Try again.",
    signingIn: "Signing in…",
    backspace: "Delete",
  },
  pinSetup: {
    titleSet: "Set PIN (first sign-in)",
    titleConfirm: "Confirm PIN",
    emailLabel: "Email / Login",
    emailPlaceholder: "name@company.com",
    passwordLabel: "Login password",
    passwordPlaceholder: "••••••••",
    hintSet: "Choose a 4–6 digit PIN. Avoid trivial sequences.",
    hintConfirm: "Re-enter the same PIN to confirm.",
    step1: "STEP 1 OF 2",
    step2: "STEP 2 OF 2",
    digits: "digits",
    min: "min",
    nextBtn: "Next → Confirm PIN",
    saveBtn: "Save PIN",
    backspace: "Delete",
    errMinLen: "PIN must be at least {min} digits",
    errWeak: "PIN too simple — choose another",
    errRepeat: "PIN cannot be all repeated digits",
    errMismatch: "PINs do not match — try again",
    errMissingCreds: "Enter email and login password first",
    errSaveFailed: "Could not save PIN. Check your credentials.",
    saving: "Saving…",
  },
  site: {
    title: "Start shift",
    loggedIn: "SIGNED IN",
    siteSection: "Site / company",
    lineSection: "Production line",
    shiftSection: "Shift",
    pickPrompt: "Choose site, line and shift",
    start: "▶ Start shift",
    loading: "Loading sites…",
    empty: "No sites available for your account.",
    errLoad: "Could not load sites. Try again.",
    retry: "Try again",
    saving: "Starting…",
    shiftMorning: "Morning",
    shiftAfternoon: "Afternoon",
    shiftNight: "Night",
  },
  home: {
    title: "Scanner",
    sectionProduction: "Production",
    sectionWarehouse: "Warehouse",
    sectionQuality: "Quality",
    comingSoon: "Coming soon",
    footer: "Scanner v3.0 · MonoPilot MES",
    tiles: {
      wos: { title: "Work Orders", desc: "Consume + output" },
      consume: { title: "Consume", desc: "Scan BOM materials" },
      output: { title: "Output", desc: "Register finished goods" },
      receive: { title: "Receive PO", desc: "Purchase order" },
      move: { title: "Move LP", desc: "Relocate a pallet" },
      putaway: { title: "Putaway", desc: "Put away LP (FEFO)" },
      pick: { title: "Pick for WO", desc: "Collect materials" },
      qa: { title: "QC Inspection", desc: "PASS / FAIL / HOLD" },
      inquiry: { title: "LP info", desc: "Look up a License Plate" },
      settings: { title: "Settings", desc: "Scanner preferences" },
    },
  },
  settings: {
    title: "Scanner settings",
    sessionSection: "Session",
    deviceMode: "Device mode",
    deviceModeValue: "Personal · 300s timeout",
    activeSession: "Active session",
    noSession: "No active session",
    languageSection: "Language",
    languageRow: "Interface language",
    securitySection: "Security",
    changePin: "Change PIN",
    changePinDesc: "Keep your PIN private",
    accountSection: "Account",
    logout: "Log out",
    footer: "MonoPilot MES · Scanner v3.0",
    // inline PIN change
    currentPin: "Current PIN",
    newPin: "New PIN",
    confirmNewPin: "Confirm new PIN",
    save: "Save new PIN",
    pinChanged: "PIN updated",
    pinChangeFailed: "Could not change PIN. Check your current PIN.",
    saving: "Saving…",
    errMismatch: "New PINs do not match",
    errMinLen: "PIN must be at least 4 digits",
  },
  loading: "Loading…",
} as const;

const pl: ScannerLabelsShape = {
  topbar: {
    back: "Wróć",
    profile: "Profil",
    menu: "Menu",
    syncTitle: "Status synchronizacji",
    online: "ONLINE",
    queued: "W KOLEJCE",
    syncErr: "BŁĄD SYNC",
  },
  scanTools: { camera: "Kamera", manual: "Ręcznie" },
  reasonSheet: {
    confirm: "Potwierdź",
    cancel: "Anuluj",
    close: "Zamknij",
    otherPlaceholder: "Opisz powód…",
  },
  language: {
    title: "Język interfejsu",
    apply: "Zastosuj",
    cancel: "Anuluj",
    close: "Zamknij",
  },
  logout: {
    title: "Wylogować się?",
    bannerTitle: "Sesja zostanie zakończona",
    bannerBody: "Niezapisane operacje mogą zostać utracone (P1 — brak offline queue).",
    logout: "Wyloguj",
    cancel: "Anuluj",
    close: "Zamknij",
  },
  scanError: {
    retry: "Spróbuj ponownie",
    back: "Wróć",
    close: "Zamknij",
    codeLabel: "Kod błędu",
  },
  qtyKeypad: {
    title: "Podaj ilość",
    maxLabel: "Maks",
    confirm: "Zatwierdź",
    close: "Zamknij",
  },
  block: {
    retry: "Spróbuj ponownie",
    backToMenu: "Wróć do menu",
    codeLabel: "Kod",
  },
  login: {
    title: "Zaloguj się",
    appName: "MonoPilot",
    appSub: "Scanner · System MES",
    emailLabel: "Email / Login",
    emailPlaceholder: "nazwa@firma.pl",
    pinLabel: "PIN",
    pinHint: "Wpisz swój 4–6 cyfrowy PIN",
    submit: "Zaloguj się →",
    setupCta: "Pierwszy raz? Ustaw PIN",
    version: "v3.0 · MonoPilot MES",
    errInvalidPin: "Nieprawidłowy email lub PIN.",
    errPinLocked: "PIN zablokowany po zbyt wielu próbach. Skontaktuj się z supervisorem.",
    errNetwork: "Błąd połączenia. Spróbuj ponownie.",
    signingIn: "Logowanie…",
    backspace: "Usuń",
  },
  pinSetup: {
    titleSet: "Ustaw PIN (pierwsze logowanie)",
    titleConfirm: "Potwierdź PIN",
    emailLabel: "Email / Login",
    emailPlaceholder: "nazwa@firma.pl",
    passwordLabel: "Hasło logowania",
    passwordPlaceholder: "••••••••",
    hintSet: "Wybierz 4–6 cyfrowy PIN. Unikaj trywialnych sekwencji.",
    hintConfirm: "Wpisz ponownie ten sam PIN, aby potwierdzić.",
    step1: "KROK 1 Z 2",
    step2: "KROK 2 Z 2",
    digits: "cyfr",
    min: "min",
    nextBtn: "Dalej → Potwierdź PIN",
    saveBtn: "Zapisz PIN",
    backspace: "Usuń",
    errMinLen: "PIN musi mieć min. {min} cyfr",
    errWeak: "PIN za prosty — wybierz inny",
    errRepeat: "PIN nie może być same powtórzone cyfry",
    errMismatch: "PIN-y nie są identyczne — wpisz ponownie",
    errMissingCreds: "Najpierw wpisz email i hasło logowania",
    errSaveFailed: "Nie udało się zapisać PIN. Sprawdź dane logowania.",
    saving: "Zapisywanie…",
  },
  site: {
    title: "Start zmiany",
    loggedIn: "ZALOG.",
    siteSection: "Zakład / firma",
    lineSection: "Linia produkcyjna",
    shiftSection: "Zmiana",
    pickPrompt: "Wybierz zakład, linię i zmianę",
    start: "▶ Rozpocznij zmianę",
    loading: "Ładowanie zakładów…",
    empty: "Brak dostępnych zakładów dla Twojego konta.",
    errLoad: "Nie udało się załadować zakładów. Spróbuj ponownie.",
    retry: "Spróbuj ponownie",
    saving: "Rozpoczynanie…",
    shiftMorning: "Ranna",
    shiftAfternoon: "Popołudniowa",
    shiftNight: "Nocna",
  },
  home: {
    title: "Scanner",
    sectionProduction: "Produkcja",
    sectionWarehouse: "Magazyn",
    sectionQuality: "Jakość",
    comingSoon: "Wkrótce",
    footer: "Skaner v3.0 · MonoPilot MES",
    tiles: {
      wos: { title: "Work Orders", desc: "Konsumpcja + wyrób" },
      consume: { title: "Konsumpcja", desc: "Skanuj materiały BOM" },
      output: { title: "Wyrób", desc: "Zarejestruj produkt" },
      receive: { title: "Przyjęcie PO", desc: "Zamówienie zakupu" },
      move: { title: "Przesuń LP", desc: "Przenieś paletę" },
      putaway: { title: "Putaway", desc: "Odłóż LP (FEFO)" },
      pick: { title: "Pick dla WO", desc: "Zbierz materiały" },
      qa: { title: "Inspekcja QC", desc: "PASS / FAIL / HOLD" },
      inquiry: { title: "LP info", desc: "Wyszukaj License Plate" },
      settings: { title: "Ustawienia", desc: "Preferencje skanera" },
    },
  },
  settings: {
    title: "Ustawienia skanera",
    sessionSection: "Sesja",
    deviceMode: "Tryb urządzenia",
    deviceModeValue: "Osobiste · 300s timeout",
    activeSession: "Aktywna sesja",
    noSession: "Brak aktywnej sesji",
    languageSection: "Język",
    languageRow: "Język interfejsu",
    securitySection: "Bezpieczeństwo",
    changePin: "Zmień PIN",
    changePinDesc: "Trzymaj swój PIN w tajemnicy",
    accountSection: "Konto",
    logout: "Wyloguj",
    footer: "MonoPilot MES · Skaner v3.0",
    currentPin: "Aktualny PIN",
    newPin: "Nowy PIN",
    confirmNewPin: "Potwierdź nowy PIN",
    save: "Zapisz nowy PIN",
    pinChanged: "PIN zaktualizowany",
    pinChangeFailed: "Nie udało się zmienić PIN. Sprawdź aktualny PIN.",
    saving: "Zapisywanie…",
    errMismatch: "Nowe PIN-y nie są identyczne",
    errMinLen: "PIN musi mieć min. 4 cyfry",
  },
  loading: "Ładowanie…",
};

const DICT: Record<ScannerLocale, ScannerLabelsShape> = { en, pl };

export type ScannerLabels = ScannerLabelsShape;

export function getScannerLabels(locale: string): ScannerLabels {
  return locale === "en" ? DICT.en : DICT.pl;
}

// Language sheet options (shared, locale-agnostic native names)
export const SCANNER_LANGUAGE_OPTIONS = [
  { id: "pl", flag: "🇵🇱", label: "Polski" },
  { id: "en", flag: "🇬🇧", label: "English" },
  { id: "uk", flag: "🇺🇦", label: "Українська" },
  { id: "ro", flag: "🇷🇴", label: "Română" },
];
