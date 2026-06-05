/**
 * TEC-080 Technical Dashboard — Recent Changes panel.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:283-299 ("Recent BOM changes" table). Conformance to the
 * locked design system: `.card` head + dense raw `.table` (no `@monopilot/ui`
 * wrapper, no shadow), leading cell timestamp in `.mono`, reference code in
 * `.mono`, resource type as a neutral `.badge-gray` tone. The prototype's
 * hardcoded VERSIONS rows are replaced by real public.audit_log rows
 * (Technical-owned resource types) supplied by the RSC page. Empty list renders
 * the canonical `.empty-state` (icon + title + body) so a fresh org never shows
 * a blank `<tbody>`.
 *
 * Presentational only — strings (labels, empty copy, formatted timestamps) are
 * passed in so the panel is RTL-testable and i18n is owned by the page.
 */
export type RecentChangeRow = {
  id: string;
  /** Pre-formatted, locale-aware timestamp string. */
  when: string;
  /** Human label for resource_type (resolved/i18n'd by the page). */
  resourceLabel: string;
  /** Human label for the action. */
  actionLabel: string;
  /** Short id reference for the changed resource (may be '—'). */
  reference: string;
};

export function RecentChangesPanel({
  title,
  rows,
  emptyCopy,
  columnHeaders,
}: {
  title: string;
  rows: RecentChangeRow[];
  emptyCopy: string;
  columnHeaders: { when: string; resource: string; action: string; reference: string };
}) {
  return (
    <div data-testid="technical-recent-changes" className="card" style={{ padding: 0, marginBottom: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <div data-testid="technical-recent-changes-empty" className="empty-state">
          <div className="empty-state-icon">🗂️</div>
          <div className="empty-state-body" style={{ marginBottom: 0 }}>
            {emptyCopy}
          </div>
        </div>
      ) : (
        <table aria-label={title}>
          <thead>
            <tr>
              <th scope="col" style={{ width: 140 }}>
                {columnHeaders.when}
              </th>
              <th scope="col" style={{ width: 120 }}>
                {columnHeaders.resource}
              </th>
              <th scope="col">{columnHeaders.action}</th>
              <th scope="col" style={{ width: 110 }}>
                {columnHeaders.reference}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="mono" style={{ color: 'var(--muted)' }}>
                  {row.when}
                </td>
                <td>
                  <span className="badge badge-gray">{row.resourceLabel}</span>
                </td>
                <td style={{ fontSize: 13 }}>{row.actionLabel}</td>
                <td className="mono" style={{ color: 'var(--muted)' }}>
                  {row.reference}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
