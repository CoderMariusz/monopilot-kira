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
    menu: string;
    syncTitle: string;
    online: string;
    queued: string;
    syncErr: string;
  };
  scanTools: { camera: string; manual: string };
  cameraScanner: {
    title: string;
    scanning: string;
    found: string;
    cancel: string;
    torch: string;
    flip: string;
    permissionDenied: string;
    noCameraFound: string;
    manualFallback: string;
  };
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
  labor: { clockIn: string; clockOut: string; clockedIn: string; clockedOut: string };
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
      ship: TileLabel;
      qa: TileLabel;
      inquiry: TileLabel;
      settings: TileLabel;
    };
  };
  receivePo: {
    listTitle: string;
    scanLabel: string;
    scanPlaceholder: string;
    scanHint: string;
    emptyTitle: string;
    emptyBody: string;
    noMatchBody: string;
    supplier: string;
    expected: string;
    lines: string;
    receivedLines: string;
    linesTitle: string;
    qtyTitle: string;
    ordered: string;
    received: string;
    remaining: string;
    batch: string;
    batchPlaceholder: string;
    bestBefore: string;
    qty: string;
    receive: string;
    receiving: string;
    overTitle: string;
    overBody: string;
    qcHoldTitle: string;
    qcHoldBody: string;
    doneTitle: string;
    doneSub: string;
    newLp: string;
    scannerPrintLabel: string;
    scannerPrinting: string;
    scannerPrinted: string;
    scannerPrintError: string;
    nextLine: string;
    backToList: string;
    loadingPo: string;
    loadingLines: string;
    errorLoad: string;
    permissionDenied: string;
    retry: string;
    destinationLabel: string;
    destinationPlaceholder: string;
    destinationHint: string;
    resolving: string;
    locationNotFound: string;
    resolvedLabel: string;
    unsupportedCurrency: string;
    unknownCurrency: string;
    status: Record<string, string>;
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
  putawayScreen: {
    title: string;
    doneTitle: string;
    scanLabel: string;
    scanPlaceholder: string;
    scanHint: string;
    lookingUp: string;
    lpNotFound: string;
    scanInvalid: string;
    cardProduct: string;
    cardQty: string;
    cardBatch: string;
    cardExpiry: string;
    cardCurrentLoc: string;
    cardStatus: string;
    cardQa: string;
    noLocation: string;
    suggestTitle: string;
    suggestLoading: string;
    suggestEmpty: string;
    suggestError: string;
    reasonSameProduct: string;
    reasonEmpty: string;
    reasonDefault: string;
    chooseSuggestion: string;
    confirm: string;
    confirming: string;
    successTitle: string;
    successTo: string;
    nextLp: string;
    backToMenu: string;
    errNotMovable: string;
    errInvalid: string;
    errGeneric: string;
    retry: string;
    permissionDenied: string;
    manualGap: string;
    manualLabel: string;
    manualPlaceholder: string;
    manualHint: string;
    resolving: string;
    locationNotFound: string;
    resolvedLabel: string;
  };
  moveScreen: {
    title: string;
    doneTitle: string;
    scanLabel: string;
    scanPlaceholder: string;
    scanHint: string;
    lookingUp: string;
    lpNotFound: string;
    cardProduct: string;
    cardQty: string;
    cardBatch: string;
    cardExpiry: string;
    cardCurrentLoc: string;
    cardStatus: string;
    cardQa: string;
    noLocation: string;
    destLabel: string;
    destPlaceholder: string;
    destHint: string;
    suggestionsTitle: string;
    suggestionsLoading: string;
    sameLocation: string;
    reasonLabel: string;
    reasonRelocation: string;
    reasonConsolidation: string;
    reasonDamage: string;
    reasonOther: string;
    confirm: string;
    confirming: string;
    successTitle: string;
    successFrom: string;
    successTo: string;
    nextLp: string;
    backToMenu: string;
    errNotMovable: string;
    errInvalid: string;
    errGeneric: string;
    retry: string;
    permissionDenied: string;
    resolving: string;
    locationNotFound: string;
    resolvedLabel: string;
  };
  pickScreen: {
    title: string;
    searchLabel: string;
    searchPlaceholder: string;
    searchHint: string;
    line: string;
    loadingWos: string;
    emptyTitle: string;
    emptyBody: string;
    noMatchBody: string;
    errorLoad: string;
    permissionDenied: string;
    retry: string;
    materialsTitle: string;
    materialsEmpty: string;
    needed: string;
    done: string;
    lpTitle: string;
    lpLoading: string;
    lpEmpty: string;
    lpError: string;
    lpSuggested: string;
    lpExpiry: string;
    lpLocation: string;
    confirm: string;
    confirming: string;
    destinationLabel: string;
    destinationPlaceholder: string;
    destinationHint: string;
    destinationRequired: string;
    destResolving: string;
    destNotFound: string;
    destResolvedLabel: string;
    err409: string;
    lpNotReleased: string;
    errGeneric: string;
    doneTitle: string;
    doneBody: string;
    pickNext: string;
    backToWo: string;
    stepMaterial: string;
    stepLp: string;
    stepConfirm: string;
    status: Record<string, string>;
  };
  lpInfoScreen: {
    title: string;
    scanLabel: string;
    scanPlaceholder: string;
    scanHint: string;
    promptTitle: string;
    promptBody: string;
    loading: string;
    notFound: string;
    errorLoad: string;
    permissionDenied: string;
    product: string;
    quantity: string;
    reserved: string;
    available: string;
    statusLabel: string;
    qaStatusLabel: string;
    expiry: string;
    expiryPast: string;
    batch: string;
    location: string;
    warehouse: string;
    lastMove: string;
    genealogyTitle: string;
    parents: string;
    children: string;
    noParents: string;
    noChildren: string;
    scanNext: string;
    backToMenu: string;
    statusValues: Record<string, string>;
    qaValues: Record<string, string>;
  };
  qaScreen: {
    title: string;
    scanLabel: string;
    scanPlaceholder: string;
    scanHint: string;
    promptTitle: string;
    promptBody: string;
    loadingLp: string;
    notFoundTitle: string;
    notFoundBody: string;
    errorLoad: string;
    permissionDenied: string;
    retry: string;
    product: string;
    quantity: string;
    location: string;
    expiry: string;
    qaStatus: string;
    decisionPrompt: string;
    pass: string;
    fail: string;
    hold: string;
    noteLabel: string;
    notePlaceholder: string;
    submitting: string;
    doneTitle: string;
    doneBody: string;
    newQaStatus: string;
    scanNext: string;
    backToMenu: string;
    errGeneric: string;
    statusValues: Record<string, string>;
  };
  shipScreen: {
    title: string;
    listTitle: string;
    selectPrompt: string;
    loadingList: string;
    emptyTitle: string;
    emptyBody: string;
    errorLoad: string;
    permissionDenied: string;
    retry: string;
    soLabel: string;
    customerLabel: string;
    noCustomer: string;
    boxes: string;
    packedSoFar: string;
    scanLabel: string;
    scanPlaceholder: string;
    scanHint: string;
    packed: string;
    packedCountLabel: string;
    errBlocked: string;
    errNotAllocated: string;
    errLpNotFound: string;
    errAlreadyPacked: string;
    errInvalidState: string;
    errGeneric: string;
    backToList: string;
    backToMenu: string;
  };
  loading: string;
}

const en: ScannerLabelsShape = {
  // shell primitives
  topbar: {
    back: "Back",
    menu: "Menu",
    syncTitle: "Sync status",
    online: "ONLINE",
    queued: "QUEUED",
    syncErr: "SYNC ERR",
  },
  scanTools: { camera: "Camera", manual: "Manual" },
  cameraScanner: {
    title: "Scan with camera",
    scanning: "Scanning…",
    found: "Scanned",
    cancel: "Cancel",
    torch: "Torch",
    flip: "Flip camera",
    permissionDenied: "Camera access denied. Allow the camera in your device settings, or enter the code manually.",
    noCameraFound: "No camera available on this device. Enter the code manually.",
    manualFallback: "Enter manually",
  },
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
  labor: {
    clockIn: "Clock In",
    clockOut: "Clock Out",
    clockedIn: "Clocked In",
    clockedOut: "Clocked Out",
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
      consume: { title: "Consume", desc: "Pick a work order to scan BOM" },
      output: { title: "Output", desc: "Pick a work order to register goods" },
      receive: { title: "Receive PO", desc: "Purchase order" },
      move: { title: "Move LP", desc: "Relocate a pallet" },
      putaway: { title: "Putaway", desc: "Put away LP (FEFO)" },
      pick: { title: "Pick for WO", desc: "Collect materials" },
      ship: { title: "Pack for SO", desc: "Scan FG into a shipment" },
      qa: { title: "QC Inspection", desc: "PASS / FAIL / HOLD" },
      inquiry: { title: "LP info", desc: "Look up a License Plate" },
      settings: { title: "Settings", desc: "Scanner preferences" },
    },
  },
  receivePo: {
    listTitle: "Receive PO",
    scanLabel: "Scan PO number",
    scanPlaceholder: "PO-XXXX or type…",
    scanHint: "Scan the supplier delivery document",
    emptyTitle: "No POs to receive",
    emptyBody: "There are no open purchase orders for your organization.",
    noMatchBody: "No purchase order matches the search.",
    supplier: "Supplier",
    expected: "Expected",
    lines: "Lines",
    receivedLines: "Received lines",
    linesTitle: "PO lines",
    qtyTitle: "Receiving",
    ordered: "Ordered",
    received: "Received",
    remaining: "Remaining",
    batch: "Batch / serial",
    batchPlaceholder: "B-...",
    bestBefore: "Best before",
    qty: "Quantity",
    receive: "Receive",
    receiving: "Receiving…",
    overTitle: "Over-receive",
    overBody: "This receipt exceeds the ordered quantity but is within the 10% tolerance.",
    qcHoldTitle: "QC inspection required",
    qcHoldBody: "QC inspection required — LP held as pending.",
    doneTitle: "Received",
    doneSub: "New license plate created",
    newLp: "New LP",
    scannerPrintLabel: "Print label",
    scannerPrinting: "Printing...",
    scannerPrinted: "Printed",
    scannerPrintError: "Could not print label.",
    nextLine: "Next PO line",
    backToList: "Back to PO list",
    loadingPo: "Loading purchase orders…",
    loadingLines: "Loading PO lines…",
    errorLoad: "Could not load data.",
    permissionDenied: "Session expired or permission denied.",
    retry: "Try again",
    destinationLabel: "Destination location",
    destinationPlaceholder: "LOC-XXX-XX-XX…",
    destinationHint: "Scan a location code or leave empty to receive into the default location",
    resolving: "Resolving location…",
    locationNotFound: "Location not found.",
    resolvedLabel: "Selected location",
    unsupportedCurrency:
      "Receipt blocked — this PO is not in GBP. Change the PO currency to GBP before receiving.",
    unknownCurrency: "Receipt blocked — the purchase order currency is missing or invalid.",
    status: {
      sent: "Sent",
      confirmed: "Confirmed",
      partially_received: "Partially received",
      received: "Received",
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
  putawayScreen: {
    title: "Putaway",
    doneTitle: "Putaway complete",
    scanLabel: "Scan LP to put away",
    scanPlaceholder: "LP-XXXXX or type…",
    scanHint: "Scan the label from the receiving document",
    lookingUp: "Looking up license plate…",
    lpNotFound: "License plate not found.",
    scanInvalid: "Enter a license plate code.",
    cardProduct: "Product",
    cardQty: "Quantity",
    cardBatch: "Batch",
    cardExpiry: "Expiry",
    cardCurrentLoc: "Current location",
    cardStatus: "Status",
    cardQa: "QA status",
    noLocation: "No location",
    suggestTitle: "Suggested locations",
    suggestLoading: "Finding suggestions…",
    suggestEmpty: "No location suggestions. Pick one from the list once available.",
    suggestError: "Could not load suggestions.",
    reasonSameProduct: "Same product",
    reasonEmpty: "Empty",
    reasonDefault: "Default",
    chooseSuggestion: "Choose a location",
    confirm: "Confirm putaway",
    confirming: "Saving…",
    successTitle: "LP put away",
    successTo: "Moved to",
    nextLp: "Next LP",
    backToMenu: "Back to menu",
    errNotMovable: "This LP cannot be moved right now.",
    errInvalid: "Invalid putaway request.",
    errGeneric: "Could not complete putaway. Try again.",
    retry: "Try again",
    permissionDenied: "Session expired or permission denied.",
    manualGap: "Manual location entry is unavailable — pick a suggested location.",
    manualLabel: "Or scan / type a location",
    manualPlaceholder: "LOC-XXX-XX-XX…",
    manualHint: "Scan a location code or pick a suggestion above",
    resolving: "Resolving location…",
    locationNotFound: "Location not found.",
    resolvedLabel: "Selected location",
  },
  moveScreen: {
    title: "Move LP",
    doneTitle: "Moved",
    scanLabel: "Scan LP to move",
    scanPlaceholder: "LP-XXXXX or type…",
    scanHint: "Scan the LP label",
    lookingUp: "Looking up license plate…",
    lpNotFound: "License plate not found.",
    cardProduct: "Product",
    cardQty: "Quantity",
    cardBatch: "Batch",
    cardExpiry: "Expiry",
    cardCurrentLoc: "Current location",
    cardStatus: "Status",
    cardQa: "QA status",
    noLocation: "No location",
    destLabel: "Destination location",
    destPlaceholder: "LOC-XXX-XX-XX…",
    destHint: "Scan a location or pick a suggestion below",
    suggestionsTitle: "Suggestions",
    suggestionsLoading: "Finding suggestions…",
    sameLocation: "LP is already in this location.",
    reasonLabel: "Reason (optional)",
    reasonRelocation: "Relocation",
    reasonConsolidation: "Consolidation",
    reasonDamage: "Damage",
    reasonOther: "Other",
    confirm: "Move",
    confirming: "Saving…",
    successTitle: "LP moved",
    successFrom: "From",
    successTo: "To",
    nextLp: "Move another",
    backToMenu: "Back to menu",
    errNotMovable: "This LP cannot be moved right now.",
    errInvalid: "Invalid move request.",
    errGeneric: "Could not complete move. Try again.",
    retry: "Try again",
    permissionDenied: "Session expired or permission denied.",
    resolving: "Resolving location…",
    locationNotFound: "Location not found.",
    resolvedLabel: "Selected location",
  },
  pickScreen: {
    title: "Pick for WO",
    searchLabel: "Search work order",
    searchPlaceholder: "WO-XXXX or product…",
    searchHint: "Scan or type a work order number",
    line: "Line",
    loadingWos: "Loading work orders…",
    emptyTitle: "Nothing to pick",
    emptyBody: "There are no released work orders awaiting picking.",
    noMatchBody: "No work order matches the search.",
    errorLoad: "Could not load work orders.",
    permissionDenied: "Session expired or permission denied.",
    retry: "Try again",
    materialsTitle: "BOM materials",
    materialsEmpty: "This work order has no materials to pick.",
    needed: "needed",
    done: "Picked",
    lpTitle: "Choose a license plate",
    lpLoading: "Finding FEFO candidates…",
    lpEmpty: "No available license plates for this material.",
    lpError: "Could not load license plates.",
    lpSuggested: "FEFO",
    lpExpiry: "Exp",
    lpLocation: "Loc",
    confirm: "Confirm pick",
    confirming: "Saving…",
    destinationLabel: "Staging location",
    destinationPlaceholder: "LOC-XXX-XX-XX…",
    destinationHint: "Scan or type the staging location for this material",
    destinationRequired: "A staging location is required for this pick.",
    destResolving: "Looking up location…",
    destNotFound: "Location not found.",
    destResolvedLabel: "Staging location",
    err409: "This material has already been picked. Reloading…",
    lpNotReleased: "This LP is not QA-released and cannot be picked.",
    errGeneric: "Could not complete pick. Try again.",
    doneTitle: "Material staged",
    doneBody: "The license plate was moved to staging.",
    pickNext: "Pick next material",
    backToWo: "Back to materials",
    stepMaterial: "Material",
    stepLp: "License plate",
    stepConfirm: "Confirm",
    status: {
      released: "Released",
      inprog: "In progress",
      in_progress: "In progress",
      scheduled: "Scheduled",
      planned: "Planned",
    },
  },
  lpInfoScreen: {
    title: "LP info",
    scanLabel: "Scan any license plate",
    scanPlaceholder: "LP-XXXXX…",
    scanHint: "Scan or type a license plate code",
    promptTitle: "Scan a license plate",
    promptBody: "Look up product, quantity, status and genealogy for any LP.",
    loading: "Looking up license plate…",
    notFound: "License plate not found.",
    errorLoad: "Could not look up the license plate.",
    permissionDenied: "Session expired or permission denied.",
    product: "Product",
    quantity: "Quantity",
    reserved: "Reserved",
    available: "Available",
    statusLabel: "Status",
    qaStatusLabel: "QA status",
    expiry: "Expiry",
    expiryPast: "Expired",
    batch: "Batch",
    location: "Location",
    warehouse: "Warehouse",
    lastMove: "Last move",
    genealogyTitle: "Genealogy",
    parents: "Parents",
    children: "Children",
    noParents: "No parent LPs",
    noChildren: "No child LPs",
    scanNext: "Scan next",
    backToMenu: "Back to menu",
    statusValues: {
      available: "Available",
      reserved: "Reserved",
      consumed: "Consumed",
      shipped: "Shipped",
      on_hold: "On hold",
      quarantine: "Quarantine",
      destroyed: "Destroyed",
    },
    qaValues: {
      passed: "Passed",
      pending: "Pending",
      hold: "Hold",
      failed: "Failed",
      none: "—",
    },
  },
  qaScreen: {
    title: "QC Inspection",
    scanLabel: "Scan a license plate",
    scanPlaceholder: "LP-XXXXX…",
    scanHint: "Scan or type the LP to inspect",
    promptTitle: "Scan a license plate",
    promptBody: "Look up an LP, then record a PASS / FAIL / HOLD decision.",
    loadingLp: "Looking up license plate…",
    notFoundTitle: "License plate not found",
    notFoundBody: "No LP matches that code. Check the code and scan again.",
    errorLoad: "Could not look up the license plate.",
    permissionDenied: "Session expired or permission denied.",
    retry: "Try again",
    product: "Product",
    quantity: "Quantity",
    location: "Location",
    expiry: "Expiry",
    qaStatus: "QA status",
    decisionPrompt: "Record decision",
    pass: "PASS",
    fail: "FAIL",
    hold: "HOLD",
    noteLabel: "Note (optional)",
    notePlaceholder: "Add a note for this decision…",
    submitting: "Recording…",
    doneTitle: "Decision recorded",
    doneBody: "The QC decision was saved.",
    newQaStatus: "New QA status",
    scanNext: "Scan next",
    backToMenu: "Back to menu",
    errGeneric: "Could not record the decision. Try again.",
    statusValues: {
      passed: "Passed",
      pending: "Pending",
      hold: "Hold",
      on_hold: "On hold",
      failed: "Failed",
      released: "Released",
      none: "—",
    },
  },
  shipScreen: {
    title: "Pack for SO",
    listTitle: "Open shipments",
    selectPrompt: "Pick a shipment to pack into",
    loadingList: "Loading shipments…",
    emptyTitle: "Nothing to pack",
    emptyBody: "There are no open (packing) shipments. Create one from a Sales Order first.",
    errorLoad: "Could not load shipments.",
    permissionDenied: "Session expired or permission denied.",
    retry: "Try again",
    soLabel: "Order",
    customerLabel: "Customer",
    noCustomer: "—",
    boxes: "Boxes",
    packedSoFar: "Packed",
    scanLabel: "Scan FG license plate",
    scanPlaceholder: "LP-XXXXX or type…",
    scanHint: "Scan a finished-good LP allocated to this order",
    packed: "Packed",
    packedCountLabel: "Packed this session",
    errBlocked: "Blocked — LP is on a quality hold, not QA-released, or expired.",
    errNotAllocated: "This LP is not allocated to this sales order.",
    errLpNotFound: "License plate not found.",
    errAlreadyPacked: "This LP is already packed into a shipment.",
    errInvalidState: "This shipment can no longer be packed.",
    errGeneric: "Could not pack the LP. Try again.",
    backToList: "Back to shipments",
    backToMenu: "Back to menu",
  },
  loading: "Loading…",
} as const;

const pl: ScannerLabelsShape = {
  topbar: {
    back: "Wróć",
    menu: "Menu",
    syncTitle: "Status synchronizacji",
    online: "ONLINE",
    queued: "W KOLEJCE",
    syncErr: "BŁĄD SYNC",
  },
  scanTools: { camera: "Kamera", manual: "Ręcznie" },
  cameraScanner: {
    title: "Skanuj kamerą",
    scanning: "Skanowanie…",
    found: "Zeskanowano",
    cancel: "Anuluj",
    torch: "Latarka",
    flip: "Zmień kamerę",
    permissionDenied: "Brak uprawnień do kamery. Nadaj uprawnienia w ustawieniach urządzenia lub wpisz kod ręcznie.",
    noCameraFound: "Brak kamery na tym urządzeniu. Wpisz kod ręcznie.",
    manualFallback: "Wpisz ręcznie",
  },
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
  labor: {
    clockIn: "Zaloguj się",
    clockOut: "Wyloguj się",
    clockedIn: "Zalogowano",
    clockedOut: "Wylogowano",
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
      consume: { title: "Konsumpcja", desc: "Wybierz zlecenie, aby skanować BOM" },
      output: { title: "Wyrób", desc: "Wybierz zlecenie, aby zarejestrować wyrób" },
      receive: { title: "Przyjęcie PO", desc: "Zamówienie zakupu" },
      move: { title: "Przesuń LP", desc: "Przenieś paletę" },
      putaway: { title: "Putaway", desc: "Odłóż LP (FEFO)" },
      pick: { title: "Pick dla WO", desc: "Zbierz materiały" },
      ship: { title: "Pakuj dla SO", desc: "Skanuj wyrób do wysyłki" },
      qa: { title: "Inspekcja QC", desc: "PASS / FAIL / HOLD" },
      inquiry: { title: "LP info", desc: "Wyszukaj License Plate" },
      settings: { title: "Ustawienia", desc: "Preferencje skanera" },
    },
  },
  receivePo: {
    listTitle: "Przyjęcie PO",
    scanLabel: "Zeskanuj numer PO",
    scanPlaceholder: "PO-XXXX lub wpisz…",
    scanHint: "Skanuj kod z dokumentu dostawy",
    emptyTitle: "Brak PO do przyjęcia",
    emptyBody: "Nie ma oczekujących zamówień dla Twojej organizacji.",
    noMatchBody: "Żadne PO nie pasuje do wyszukiwania.",
    supplier: "Dostawca",
    expected: "Planowana",
    lines: "Linie",
    receivedLines: "Przyjęte linie",
    linesTitle: "Pozycje PO",
    qtyTitle: "Przyjęcie",
    ordered: "Zamówiono",
    received: "Przyjęto",
    remaining: "Pozostało",
    batch: "Partia / numer serii",
    batchPlaceholder: "B-...",
    bestBefore: "Najlepiej przed",
    qty: "Ilość",
    receive: "Przyjmij",
    receiving: "Przyjmowanie…",
    overTitle: "Przekroczenie zamówienia",
    overBody: "To przyjęcie przekracza ilość zamówioną, ale mieści się w tolerancji 10%.",
    qcHoldTitle: "Wymagana kontrola jakości",
    qcHoldBody: "Wymagana kontrola jakości — LP oczekuje na zwolnienie.",
    doneTitle: "Przyjęto",
    doneSub: "Utworzono nowy License Plate",
    newLp: "Nowy LP",
    scannerPrintLabel: "Drukuj etykietę",
    scannerPrinting: "Drukowanie...",
    scannerPrinted: "Wydrukowano",
    scannerPrintError: "Nie udało się wydrukować etykiety.",
    nextLine: "Następna pozycja PO",
    backToList: "Wróć do listy PO",
    loadingPo: "Ładowanie PO…",
    loadingLines: "Ładowanie pozycji PO…",
    errorLoad: "Nie udało się załadować danych.",
    permissionDenied: "Sesja wygasła lub brak uprawnień.",
    retry: "Spróbuj ponownie",
    destinationLabel: "Lokalizacja docelowa",
    destinationPlaceholder: "LOC-XXX-XX-XX…",
    destinationHint: "Zeskanuj kod lokalizacji lub pozostaw puste, aby przyjąć do lokalizacji domyślnej",
    resolving: "Wyszukiwanie lokalizacji…",
    locationNotFound: "Nie znaleziono lokalizacji.",
    resolvedLabel: "Wybrana lokalizacja",
    unsupportedCurrency:
      "Przyjęcie zablokowane — to ZZ nie jest w GBP. Zmień walutę ZZ na GBP przed przyjęciem.",
    unknownCurrency: "Przyjęcie zablokowane — waluta zamówienia jest brakująca lub nieprawidłowa.",
    status: {
      sent: "Wysłane",
      confirmed: "Potwierdzone",
      partially_received: "Częściowo przyjęte",
      received: "Przyjęte",
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
  putawayScreen: {
    title: "Putaway",
    doneTitle: "Putaway gotowe",
    scanLabel: "Zeskanuj LP do odłożenia",
    scanPlaceholder: "LP-XXXXX lub wpisz…",
    scanHint: "Skanuj etykietę z dokumentu przyjęcia",
    lookingUp: "Wyszukiwanie License Plate…",
    lpNotFound: "Nie znaleziono License Plate.",
    scanInvalid: "Wpisz kod License Plate.",
    cardProduct: "Produkt",
    cardQty: "Ilość",
    cardBatch: "Partia",
    cardExpiry: "Termin ważności",
    cardCurrentLoc: "Obecna lokalizacja",
    cardStatus: "Status",
    cardQa: "Status QA",
    noLocation: "Bez lokalizacji",
    suggestTitle: "Sugerowane lokalizacje",
    suggestLoading: "Szukanie sugestii…",
    suggestEmpty: "Brak sugestii lokalizacji. Wybierz z listy, gdy będą dostępne.",
    suggestError: "Nie udało się załadować sugestii.",
    reasonSameProduct: "Ten sam produkt",
    reasonEmpty: "Pusta",
    reasonDefault: "Domyślna",
    chooseSuggestion: "Wybierz lokalizację",
    confirm: "Potwierdź odłożenie",
    confirming: "Zapisywanie…",
    successTitle: "LP odłożony",
    successTo: "Przeniesiono do",
    nextLp: "Następny LP",
    backToMenu: "Wróć do menu",
    errNotMovable: "Tego LP nie można teraz przenieść.",
    errInvalid: "Nieprawidłowe żądanie odłożenia.",
    errGeneric: "Nie udało się odłożyć LP. Spróbuj ponownie.",
    retry: "Spróbuj ponownie",
    permissionDenied: "Sesja wygasła lub brak uprawnień.",
    manualGap: "Ręczne wpisanie lokalizacji niedostępne — wybierz sugerowaną lokalizację.",
    manualLabel: "Lub zeskanuj / wpisz lokalizację",
    manualPlaceholder: "LOC-XXX-XX-XX…",
    manualHint: "Zeskanuj kod lokalizacji lub wybierz sugestię powyżej",
    resolving: "Wyszukiwanie lokalizacji…",
    locationNotFound: "Nie znaleziono lokalizacji.",
    resolvedLabel: "Wybrana lokalizacja",
  },
  moveScreen: {
    title: "Przesuń LP",
    doneTitle: "Przeniesiono",
    scanLabel: "Zeskanuj LP do przeniesienia",
    scanPlaceholder: "LP-XXXXX lub wpisz…",
    scanHint: "Skanuj etykietę LP",
    lookingUp: "Wyszukiwanie License Plate…",
    lpNotFound: "Nie znaleziono License Plate.",
    cardProduct: "Produkt",
    cardQty: "Ilość",
    cardBatch: "Partia",
    cardExpiry: "Termin ważności",
    cardCurrentLoc: "Obecna lokalizacja",
    cardStatus: "Status",
    cardQa: "Status QA",
    noLocation: "Bez lokalizacji",
    destLabel: "Lokalizacja docelowa",
    destPlaceholder: "LOC-XXX-XX-XX…",
    destHint: "Skanuj lokalizację lub wybierz sugestię poniżej",
    suggestionsTitle: "Sugestie",
    suggestionsLoading: "Szukanie sugestii…",
    sameLocation: "LP już jest w tej lokalizacji.",
    reasonLabel: "Powód (opcjonalnie)",
    reasonRelocation: "Relokacja",
    reasonConsolidation: "Konsolidacja",
    reasonDamage: "Uszkodzenie",
    reasonOther: "Inny",
    confirm: "Przenieś",
    confirming: "Zapisywanie…",
    successTitle: "LP przeniesiony",
    successFrom: "Z",
    successTo: "Do",
    nextLp: "Przesuń kolejny",
    backToMenu: "Wróć do menu",
    errNotMovable: "Tego LP nie można teraz przenieść.",
    errInvalid: "Nieprawidłowe żądanie przeniesienia.",
    errGeneric: "Nie udało się przenieść LP. Spróbuj ponownie.",
    retry: "Spróbuj ponownie",
    permissionDenied: "Sesja wygasła lub brak uprawnień.",
    resolving: "Wyszukiwanie lokalizacji…",
    locationNotFound: "Nie znaleziono lokalizacji.",
    resolvedLabel: "Wybrana lokalizacja",
  },
  pickScreen: {
    title: "Pick dla WO",
    searchLabel: "Szukaj zlecenia",
    searchPlaceholder: "WO-XXXX lub produkt…",
    searchHint: "Zeskanuj lub wpisz numer zlecenia",
    line: "Linia",
    loadingWos: "Ładowanie zleceń…",
    emptyTitle: "Brak pozycji do zebrania",
    emptyBody: "Nie ma wydanych zleceń oczekujących na kompletację.",
    noMatchBody: "Żadne zlecenie nie pasuje do wyszukiwania.",
    errorLoad: "Nie udało się załadować zleceń.",
    permissionDenied: "Sesja wygasła lub brak uprawnień.",
    retry: "Spróbuj ponownie",
    materialsTitle: "Komponenty BOM",
    materialsEmpty: "To zlecenie nie ma materiałów do zebrania.",
    needed: "potrzeba",
    done: "Zebrano",
    lpTitle: "Wybierz License Plate",
    lpLoading: "Wyszukiwanie kandydatów FEFO…",
    lpEmpty: "Brak dostępnych License Plate dla tego materiału.",
    lpError: "Nie udało się załadować License Plate.",
    lpSuggested: "FEFO",
    lpExpiry: "Ważn.",
    lpLocation: "Lok.",
    confirm: "Zatwierdź pobranie",
    confirming: "Zapisywanie…",
    destinationLabel: "Lokalizacja kompletacji",
    destinationPlaceholder: "LOC-XXX-XX-XX…",
    destinationHint: "Zeskanuj lub wpisz lokalizację kompletacji dla tego materiału",
    destinationRequired: "Dla tego pobrania wymagana jest lokalizacja kompletacji.",
    destResolving: "Wyszukiwanie lokalizacji…",
    destNotFound: "Nie znaleziono lokalizacji.",
    destResolvedLabel: "Lokalizacja kompletacji",
    err409: "Ten materiał został już zebrany. Odświeżanie…",
    lpNotReleased: "Ten LP nie ma zwolnienia QA i nie może zostać pobrany.",
    errGeneric: "Nie udało się wykonać pobrania. Spróbuj ponownie.",
    doneTitle: "Materiał skompletowany",
    doneBody: "License Plate został przeniesiony do strefy kompletacji.",
    pickNext: "Zbierz kolejny materiał",
    backToWo: "Wróć do materiałów",
    stepMaterial: "Materiał",
    stepLp: "License Plate",
    stepConfirm: "Potwierdź",
    status: {
      released: "Wydane",
      inprog: "W toku",
      in_progress: "W toku",
      scheduled: "Zaplanowane",
      planned: "Zaplanowane",
    },
  },
  lpInfoScreen: {
    title: "LP info",
    scanLabel: "Zeskanuj dowolny License Plate",
    scanPlaceholder: "LP-XXXXX…",
    scanHint: "Zeskanuj lub wpisz kod License Plate",
    promptTitle: "Zeskanuj License Plate",
    promptBody: "Sprawdź produkt, ilość, status i genealogię dowolnego LP.",
    loading: "Wyszukiwanie License Plate…",
    notFound: "Nie znaleziono License Plate.",
    errorLoad: "Nie udało się wyszukać License Plate.",
    permissionDenied: "Sesja wygasła lub brak uprawnień.",
    product: "Produkt",
    quantity: "Ilość",
    reserved: "Zarezerwowane",
    available: "Dostępne",
    statusLabel: "Status",
    qaStatusLabel: "Status QA",
    expiry: "Ważność",
    expiryPast: "Przeterminowane",
    batch: "Partia",
    location: "Lokalizacja",
    warehouse: "Magazyn",
    lastMove: "Ostatni ruch",
    genealogyTitle: "Genealogia",
    parents: "Rodzice",
    children: "Dzieci",
    noParents: "Brak nadrzędnych LP",
    noChildren: "Brak podrzędnych LP",
    scanNext: "Skanuj kolejny",
    backToMenu: "Wróć do menu",
    statusValues: {
      available: "Dostępny",
      reserved: "Zarezerwowany",
      consumed: "Zużyty",
      shipped: "Wysłany",
      on_hold: "Wstrzymany",
      quarantine: "Kwarantanna",
      destroyed: "Zniszczona",
    },
    qaValues: {
      passed: "Zaakceptowany",
      pending: "Oczekuje",
      hold: "Wstrzymany",
      failed: "Odrzucony",
      none: "—",
    },
  },
  qaScreen: {
    title: "Inspekcja QC",
    scanLabel: "Zeskanuj License Plate",
    scanPlaceholder: "LP-XXXXX…",
    scanHint: "Zeskanuj lub wpisz LP do inspekcji",
    promptTitle: "Zeskanuj License Plate",
    promptBody: "Wyszukaj LP, a następnie zarejestruj decyzję PASS / FAIL / HOLD.",
    loadingLp: "Wyszukiwanie License Plate…",
    notFoundTitle: "Nie znaleziono License Plate",
    notFoundBody: "Żaden LP nie pasuje do tego kodu. Sprawdź kod i zeskanuj ponownie.",
    errorLoad: "Nie udało się wyszukać License Plate.",
    permissionDenied: "Sesja wygasła lub brak uprawnień.",
    retry: "Spróbuj ponownie",
    product: "Produkt",
    quantity: "Ilość",
    location: "Lokalizacja",
    expiry: "Ważność",
    qaStatus: "Status QA",
    decisionPrompt: "Zarejestruj decyzję",
    pass: "PASS",
    fail: "FAIL",
    hold: "HOLD",
    noteLabel: "Notatka (opcjonalnie)",
    notePlaceholder: "Dodaj notatkę do tej decyzji…",
    submitting: "Rejestrowanie…",
    doneTitle: "Decyzja zapisana",
    doneBody: "Decyzja QC została zapisana.",
    newQaStatus: "Nowy status QA",
    scanNext: "Skanuj kolejny",
    backToMenu: "Wróć do menu",
    errGeneric: "Nie udało się zapisać decyzji. Spróbuj ponownie.",
    statusValues: {
      passed: "Zaakceptowany",
      pending: "Oczekuje",
      hold: "Wstrzymany",
      on_hold: "Wstrzymany",
      failed: "Odrzucony",
      released: "Zwolniony",
      none: "—",
    },
  },
  shipScreen: {
    title: "Pakuj dla SO",
    listTitle: "Otwarte wysyłki",
    selectPrompt: "Wybierz wysyłkę do pakowania",
    loadingList: "Ładowanie wysyłek…",
    emptyTitle: "Brak wysyłek do pakowania",
    emptyBody: "Nie ma otwartych (pakowanych) wysyłek. Najpierw utwórz wysyłkę z Zamówienia sprzedaży.",
    errorLoad: "Nie udało się załadować wysyłek.",
    permissionDenied: "Sesja wygasła lub brak uprawnień.",
    retry: "Spróbuj ponownie",
    soLabel: "Zamówienie",
    customerLabel: "Klient",
    noCustomer: "—",
    boxes: "Kartony",
    packedSoFar: "Spakowano",
    scanLabel: "Zeskanuj LP wyrobu gotowego",
    scanPlaceholder: "LP-XXXXX lub wpisz…",
    scanHint: "Zeskanuj LP wyrobu przypisany do tego zamówienia",
    packed: "Spakowano",
    packedCountLabel: "Spakowano w tej sesji",
    errBlocked: "Zablokowane — LP na wstrzymaniu jakości, niezwolniony przez QA lub przeterminowany.",
    errNotAllocated: "Ten LP nie jest przypisany do tego zamówienia sprzedaży.",
    errLpNotFound: "Nie znaleziono License Plate.",
    errAlreadyPacked: "Ten LP jest już spakowany do wysyłki.",
    errInvalidState: "Tej wysyłki nie można już pakować.",
    errGeneric: "Nie udało się spakować LP. Spróbuj ponownie.",
    backToList: "Wróć do wysyłek",
    backToMenu: "Wróć do menu",
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
