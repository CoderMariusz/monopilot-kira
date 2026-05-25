import { getTranslations } from "next-intl/server";

// TODO(scanner-module): replace when scanner module lands. The (scanner) layout owns
// the single ScannerFrame device chrome; this harness supplies only inner content.
export default async function DevScannerPage() {
  const t = await getTranslations("Navigation.app.modules");
  const scannerLabel = t("scanner");

  return (
    <div style={{ display: "grid", gap: "14px" }}>
      <p style={{ margin: 0, color: "#93a4b8", fontSize: "12px", fontWeight: 700, letterSpacing: "0.16em" }}>
        T-134
      </p>
      <h1 style={{ margin: 0, color: "#f8fafc", fontSize: "28px", lineHeight: 1.1 }}>{scannerLabel}</h1>
      <div
        aria-hidden="true"
        style={{
          marginTop: "14px",
          height: "360px",
          borderRadius: "24px",
          border: "1px dashed rgba(147, 197, 253, 0.42)",
          background:
            "linear-gradient(135deg, rgba(37, 99, 235, 0.14), rgba(14, 165, 233, 0.06)), rgba(15, 23, 42, 0.72)",
        }}
      />
      <button
        type="button"
        aria-label={scannerLabel}
        style={{
          minHeight: "48px",
          width: "100%",
          border: "0",
          borderRadius: "16px",
          background: "#2563eb",
          color: "#eff6ff",
          fontSize: "15px",
          fontWeight: 700,
          letterSpacing: "0.01em",
        }}
      >
        {scannerLabel}
      </button>
    </div>
  );
}
