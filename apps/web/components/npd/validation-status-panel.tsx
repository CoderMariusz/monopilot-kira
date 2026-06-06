/**
 * ValidationStatusPanel — reusable V01-V08 validation-status table (presentational).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:421-452
 *   (the SCR-03 right-panel "Validation status" card: a dense table of rule rows
 *    V01..V08, each row = mono id + title + a status glyph aligned right.)
 *   Glyph map (fa-screens.jsx:433-436):
 *     pass → ✓ var(--green) · fail → ✗ var(--red) ·
 *     warn → ⚠ var(--amber-700) · info → ⓘ var(--blue)
 *
 * PURE / SERVER-SAFE: presentational only — it receives an already-computed
 * `rules` array (id/title/status). The V01-V08 computation is done SERVER-SIDE
 * from the real product row (no functions / Server Actions passed in → safe for
 * a Next 16 Server Component render).
 *
 * REUSE: any screen that needs the V-NPD validation panel imports this with its
 * own server-computed rules array.
 *
 * Design tokens only (no inline hex).
 */

export type ValidationStatus = 'pass' | 'fail' | 'warn' | 'info';

export type ValidationRule = {
  /** e.g. 'V01'. */
  id: string;
  /** Human-readable rule title (already localized). */
  title: string;
  status: ValidationStatus;
};

export type ValidationStatusPanelProps = {
  /** Card heading (already localized). */
  title: string;
  rules: ValidationRule[];
  /** Accessible status names for the glyph aria-label ("V01: pass"). */
  statusLabels?: Partial<Record<ValidationStatus, string>>;
};

const GLYPH: Record<ValidationStatus, { char: string; color: string }> = {
  pass: { char: '✓', color: 'var(--green)' },
  fail: { char: '✗', color: 'var(--red)' },
  warn: { char: '⚠', color: 'var(--amber-700)' },
  info: { char: 'ⓘ', color: 'var(--blue)' },
};

export function ValidationStatusPanel({ title, rules, statusLabels }: ValidationStatusPanelProps) {
  return (
    <div
      className="card"
      data-slot="card"
      data-testid="fa-validation-status-panel"
      data-prototype-anchor="npd/fa-screens.jsx:421-452"
    >
      <div className="card-head">
        <h3 className="card-title">{title}</h3>
      </div>
      <table style={{ fontSize: 11, width: '100%' }}>
        <tbody>
          {rules.map((rule) => {
            const g = GLYPH[rule.status];
            const statusName = statusLabels?.[rule.status] ?? rule.status;
            return (
              <tr key={rule.id} data-testid={`fa-validation-${rule.id}`} data-status={rule.status}>
                <td className="mono" style={{ width: 38, verticalAlign: 'top' }}>
                  {rule.id}
                </td>
                <td>{rule.title}</td>
                <td style={{ width: 20, textAlign: 'right' }}>
                  <span
                    aria-label={`${rule.id}: ${statusName}`}
                    title={`${rule.id}: ${statusName}`}
                    style={{ color: g.color, fontWeight: 700 }}
                  >
                    {g.char}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ValidationStatusPanel;
