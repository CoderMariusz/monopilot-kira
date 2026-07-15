import type { SchedulerSettingsRow } from '../_actions/settings-loaders';

export type SettingsViewLabels = {
  defaultsNote: string;
  readOnlyNote: string;
  scopeOrg: string;
  scopeLine: string;
  scopeDefaults: string;
  yes: string;
  no: string;
  fields: {
    scope: string;
    horizon: string;
    strategy: string;
    optimizer: string;
    capacity: string;
    changeoverWeight: string;
    duedateWeight: string;
    utilizationWeight: string;
    respectPm: string;
    alternateRoutings: string;
  };
};

export function SettingsView({
  rows,
  showingDefaultsOnly,
  labels,
}: {
  rows: SchedulerSettingsRow[];
  showingDefaultsOnly: boolean;
  labels: SettingsViewLabels;
}) {
  return (
    <div className="flex flex-col gap-4">
      {showingDefaultsOnly ? (
        <div
          role="note"
          data-testid="scheduler-settings-defaults-note"
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
        >
          {labels.defaultsNote}
        </div>
      ) : (
        <p data-testid="scheduler-settings-readonly-note" className="text-sm text-slate-600">
          {labels.readOnlyNote}
        </p>
      )}

      <div className="grid gap-4">
        {rows.map((row) => {
          const scopeLabel =
            row.scope === 'org'
              ? labels.scopeOrg
              : row.scope === 'line'
                ? labels.scopeLine
                : labels.scopeDefaults;
          const key = row.id ?? `defaults-${row.scope}`;
          return (
            <section
              key={key}
              data-testid={`scheduler-settings-row-${row.scope}-${row.lineId ?? 'default'}`}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <h2 className="text-sm font-semibold text-slate-900">
                {scopeLabel}
                {row.lineLabel ? ` · ${row.lineLabel}` : ''}
              </h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.horizon}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {row.defaultHorizonDays} days
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.strategy}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {row.sequencingStrategy}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.optimizer}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {row.optimizerVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.capacity}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {row.capacityHoursPerDay === null
                      ? '—'
                      : `${row.capacityHoursPerDay} h/day`}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.changeoverWeight}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {row.changeoverWeight}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.duedateWeight}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">{row.duedateWeight}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.utilizationWeight}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {row.utilizationWeight}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.respectPm}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {row.respectPmWindows ? labels.yes : labels.no}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {labels.fields.alternateRoutings}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900">
                    {row.allowAlternateRoutings ? labels.yes : labels.no}
                  </dd>
                </div>
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}
