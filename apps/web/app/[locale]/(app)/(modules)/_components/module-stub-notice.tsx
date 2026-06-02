type ModuleStubNoticeProps = {
  /** Already-localized "Walking Skeleton" badge text. */
  badge: string;
  /** Already-localized explanation that live data arrives with the module. */
  notice: string;
};

/**
 * Honest placeholder marker for module landing pages whose domain tables do
 * not exist yet (they ship in their own wave). Makes the "no live data here
 * yet" state explicit rather than implying the empty page is finished.
 */
export function ModuleStubNotice({ badge, notice }: ModuleStubNoticeProps) {
  return (
    <div
      data-testid="module-stub-notice"
      className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
        {badge}
      </span>
      <p className="mt-3 text-sm text-slate-600">{notice}</p>
    </div>
  );
}
