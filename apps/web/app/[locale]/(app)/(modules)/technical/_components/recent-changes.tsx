/**
 * TEC-080 Technical Dashboard — Recent Changes panel.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:283-299 ("Recent BOM changes" table). Translated to the
 * @monopilot/ui Card + Table primitives; the prototype's hardcoded VERSIONS rows
 * are replaced by real public.audit_log rows (Technical-owned resource types)
 * supplied by the RSC page. Empty state renders the prototype-equivalent muted
 * copy so a fresh org never shows a broken/blank panel.
 *
 * Presentational only — strings (labels, empty copy, formatted timestamps) are
 * passed in so the panel is RTL-testable and i18n is owned by the page.
 */
import { Badge } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

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
    <Card
      data-testid="technical-recent-changes"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">{title}</div>
      {rows.length === 0 ? (
        <p data-testid="technical-recent-changes-empty" className="px-4 py-8 text-center text-sm text-slate-500">
          {emptyCopy}
        </p>
      ) : (
        <Table aria-label={title}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{columnHeaders.when}</TableHead>
              <TableHead scope="col">{columnHeaders.resource}</TableHead>
              <TableHead scope="col">{columnHeaders.action}</TableHead>
              <TableHead scope="col">{columnHeaders.reference}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs text-slate-500">{row.when}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.resourceLabel}</Badge>
                </TableCell>
                <TableCell className="text-sm">{row.actionLabel}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">{row.reference}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
