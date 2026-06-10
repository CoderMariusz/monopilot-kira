/**
 * P-L5 — Planning Dashboard header actions (parity: dashboard.jsx:25-29,53-60).
 *
 * Prototype header buttons: Create WO, Create PO, Create TO, Run sequencing,
 * Trigger D365 pull. Reality today:
 *   - Create WO  → links to /planning/work-orders?new=1
 *   - Create PO  → links to /planning/purchase-orders (tables landed in mig 262)
 *   - Create TO  → links to /planning/transfer-orders (mig 263)
 *   - Run sequencing / Trigger D365 → disabled with a "Not available yet"
 *     title (no sequencing/D365 backend exists).
 *
 * Pure presentational; the route hrefs are composed upstream (locale-prefixed).
 */
import Link from "next/link";

export type PlanningHeaderLabels = {
  createWo: string;
  createPo: string;
  createTo: string;
  runSequencing: string;
  triggerD365: string;
  notAvailable: string;
};

export function PlanningHeaderActions({
  createWoHref,
  createPoHref,
  createToHref,
  labels,
}: {
  createWoHref: string;
  createPoHref: string;
  createToHref: string;
  labels: PlanningHeaderLabels;
}) {
  const disabled = [
    { key: "runSequencing", label: labels.runSequencing },
    { key: "triggerD365", label: labels.triggerD365 },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="planning-header-actions">
      <Link
        href={createWoHref}
        prefetch={false}
        data-testid="planning-action-createWo"
        className="btn btn-primary"
      >
        + {labels.createWo}
      </Link>
      <Link
        href={createPoHref}
        prefetch={false}
        data-testid="planning-action-createPo"
        className="btn btn-secondary"
      >
        + {labels.createPo}
      </Link>
      <Link
        href={createToHref}
        prefetch={false}
        data-testid="planning-action-createTo"
        className="btn btn-secondary"
      >
        + {labels.createTo}
      </Link>
      {disabled.map((action) => (
        <button
          key={action.key}
          type="button"
          disabled
          title={labels.notAvailable}
          data-testid={`planning-action-${action.key}`}
          className="btn btn-secondary cursor-not-allowed opacity-50"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
