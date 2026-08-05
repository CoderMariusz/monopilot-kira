import type { PendingQualitySignoff } from '../_actions/quality-signoff-types';

export type PendingSignoffLabels = {
  title: string;
  signedBy: string;
  awaitingRole: string;
  anyAuthorizedSigner: string;
  submitSecond: string;
};

export function PendingQualitySignoffPanel({
  signoff,
  labels,
}: {
  signoff: PendingQualitySignoff;
  labels: PendingSignoffLabels;
}) {
  return (
    <div
      role="status"
      data-testid="pending-quality-signoff"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      <p className="font-semibold">{labels.title}</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <dt>{labels.signedBy}</dt>
        <dd className="font-medium" data-testid="pending-quality-signoff-signer">
          {signoff.firstSigner.displayName}
        </dd>
        <dt>{labels.awaitingRole}</dt>
        <dd className="font-medium" data-testid="pending-quality-signoff-role">
          {signoff.awaitingRole?.displayName ?? labels.anyAuthorizedSigner}
        </dd>
      </dl>
    </div>
  );
}
