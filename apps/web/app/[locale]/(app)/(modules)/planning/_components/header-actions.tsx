/**
 * P-L5 — Planning Dashboard header actions (parity: dashboard.jsx:25-29,53-60).
 *
 * Prototype header buttons: Create WO, Create PO, Create TO, Run sequencing,
 * Trigger D365 pull. Reality today:
 *   - Create WO  → links to /planning/work-orders?new=1 (the WO-list route is
 *                  owned by a sibling lane; the link is honest even if it 404s
 *                  for a few hours — noted in the lane report).
 *   - Create PO / Create TO / Run sequencing / Trigger D365 → disabled with a
 *     "Not available yet" title (the backing modules/tables don't exist).
 *
 * Pure presentational; the route href is composed upstream (locale-prefixed).
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
  labels,
}: {
  createWoHref: string;
  labels: PlanningHeaderLabels;
}) {
  const disabled = [
    { key: "createPo", label: labels.createPo },
    { key: "createTo", label: labels.createTo },
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
