import React from 'react';

export type PageHeadProps = {
  /** Page title rendered in `.sg-title`. */
  title: string;
  /** Optional sub-line rendered in `.sg-sub`. */
  sub?: string;
  /** Optional action node(s) (e.g. buttons) rendered on the right of the head. */
  actions?: React.ReactNode;
};

/**
 * Settings page header. Mirrors the prototype `PageHead`
 * (prototypes/design/Monopilot Design System/settings/shell.jsx:61-69).
 *
 * Presentational + server-safe (no state / handlers). Emits the prototype
 * `.sg-head` / `.sg-title` / `.sg-sub` classes; layout/spacing comes from the
 * ported settings design-system CSS (A1), not Tailwind.
 */
export function PageHead({ title, sub, actions }: PageHeadProps) {
  return (
    <div className="sg-head">
      <div>
        <div className="sg-title">{title}</div>
        {sub ? <div className="sg-sub">{sub}</div> : null}
      </div>
      {actions ? <div className="sg-head-actions">{actions}</div> : null}
    </div>
  );
}

export default PageHead;
