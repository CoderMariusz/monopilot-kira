/**
 * DeptStatusStrip — reusable 7-department gate-progress strip (presentational).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/fa-screens.jsx:365-385
 *   (the "Gate progress strip — 7 dept circles": one circle per dept with a glyph
 *    keyed by status — done ✓ / inprog ◐ / blocked ⊘ / pending = 1-based index —
 *    plus a thin connector line between adjacent circles.)
 *
 * PURE / SERVER-SAFE: this is a presentational component. It receives a plain,
 * already-derived `items` array (no functions, no Server Action props) so it is
 * safe to render directly from a Server Component (Next 16 RSC → Client function
 * props would crash; this component is not 'use client' and takes only data).
 *
 * REUSE: the project-detail screen imports this same component with its own
 * server-derived items array — keep it presentational, never read data here.
 *
 * Design tokens only (no inline hex, no raw svg colors):
 *   done    → background var(--green), white glyph ✓
 *   inprog  → background var(--amber), white glyph ◐
 *   blocked → background var(--red),   white glyph ⊘
 *   pending → background var(--gray-100), muted index number
 *   connector → 2px var(--border)
 */

export type DeptStatus = 'done' | 'inprog' | 'blocked' | 'pending';

export type DeptStatusItem = {
  /** Machine dept key, e.g. 'core' / 'planning'. */
  dept: string;
  /** Human-readable label rendered under the circle (already localized). */
  label: string;
  status: DeptStatus;
  /** 1-based index shown inside a pending circle. */
  index: number;
};

export type DeptStatusStripProps = {
  items: DeptStatusItem[];
  /** Accessible label for the strip container (already localized). */
  ariaLabel?: string;
  /** Optional status-name lookup for the a11y title ("{dept}: {statusLabel}"). */
  statusLabels?: Partial<Record<DeptStatus, string>>;
};

const STATUS_BG: Record<DeptStatus, string> = {
  done: 'var(--green)',
  inprog: 'var(--amber)',
  blocked: 'var(--red)',
  pending: 'var(--gray-100)',
};

function glyph(status: DeptStatus, index: number): string {
  if (status === 'done') return '✓'; // ✓
  if (status === 'inprog') return '◐'; // ◐
  if (status === 'blocked') return '⊘'; // ⊘
  return String(index); // pending → 1-based index
}

export function DeptStatusStrip({ items, ariaLabel, statusLabels }: DeptStatusStripProps) {
  return (
    <div
      className="card"
      data-testid="fa-dept-status-strip"
      data-prototype-anchor="npd/fa-screens.jsx:365-385"
      style={{ padding: '10px 14px', marginBottom: 10 }}
    >
      <ul
        aria-label={ariaLabel}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {items.map((item, i) => {
          const statusName = statusLabels?.[item.status] ?? item.status;
          const title = `${item.label}: ${statusName}`;
          const bg = STATUS_BG[item.status];
          const color = item.status === 'pending' ? 'var(--muted)' : '#fff';
          return (
            <li
              key={item.dept}
              style={{ display: 'flex', alignItems: 'center', gap: 10, flex: i < items.length - 1 ? 1 : '0 0 auto' }}
            >
              <span
                title={title}
                aria-label={title}
                data-testid={`fa-dept-status-${item.dept}`}
                data-status={item.status}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: bg,
                    color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flex: '0 0 auto',
                  }}
                >
                  {glyph(item.status, item.index)}
                </span>
                <span style={{ fontSize: 11, textTransform: 'capitalize' }}>{item.label}</span>
              </span>
              {i < items.length - 1 ? (
                <span
                  aria-hidden="true"
                  style={{ flex: 1, height: 2, background: 'var(--border)' }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default DeptStatusStrip;
