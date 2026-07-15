'use server';

/**
 * F4 / P1-16 — read-only solver params for /scheduler/settings.
 * Surfaces rows from public.scheduler_config; when none exist, returns the
 * in-code DEFAULT_SEQUENCE_SOLVER_CONFIG values as a read-only defaults view.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  hasPermission,
  type OrgActionContext,
} from '../../../planning/work-orders/_actions/shared';
import { DEFAULT_SEQUENCE_SOLVER_CONFIG } from '../../_actions/sequence-solver';

const SCHEDULER_READ_PERMISSION = 'scheduler.run.read';

export type SchedulerSettingsRow = {
  id: string | null;
  scope: 'org' | 'line' | 'defaults';
  lineId: string | null;
  lineLabel: string | null;
  defaultHorizonDays: number;
  optimizerVersion: string;
  sequencingStrategy: string;
  capacityHoursPerDay: string | null;
  changeoverWeight: string;
  duedateWeight: string;
  utilizationWeight: string;
  respectPmWindows: boolean;
  allowAlternateRoutings: boolean;
  isPersisted: boolean;
};

export type LoadSchedulerSettingsResult =
  | { ok: true; rows: SchedulerSettingsRow[]; showingDefaultsOnly: boolean }
  | { ok: false; error: 'forbidden' | 'persistence_failed' };

type ConfigRow = {
  id: string;
  line_id: string | null;
  default_horizon_days: number;
  optimizer_version: string;
  sequencing_strategy: string;
  capacity_hours_per_day: string | null;
  changeover_weight: string;
  duedate_weight: string;
  utilization_weight: string;
  respect_pm_windows: boolean;
  allow_alternate_routings: boolean;
};

type LineRow = { id: string; code: string; name: string };

function defaultsRow(): SchedulerSettingsRow {
  const d = DEFAULT_SEQUENCE_SOLVER_CONFIG;
  return {
    id: null,
    scope: 'defaults',
    lineId: null,
    lineLabel: null,
    defaultHorizonDays: 7,
    optimizerVersion: 'v2',
    sequencingStrategy: d.sequencingStrategy,
    capacityHoursPerDay:
      d.capacityHoursPerDay === null ? null : String(d.capacityHoursPerDay),
    changeoverWeight: String(d.changeoverWeight),
    duedateWeight: String(d.duedateWeight),
    utilizationWeight: String(d.utilizationWeight),
    respectPmWindows: d.respectPmWindows,
    allowAlternateRoutings: false,
    isPersisted: false,
  };
}

export async function loadSchedulerSettings(): Promise<LoadSchedulerSettingsResult> {
  try {
    return await withOrgContext(async (ctx: OrgActionContext): Promise<LoadSchedulerSettingsResult> => {
      if (!(await hasPermission(ctx, SCHEDULER_READ_PERMISSION))) {
        return { ok: false, error: 'forbidden' };
      }

      const lines = await ctx.client.query<LineRow>(
        `select id::text, code, name
           from public.production_lines
          where org_id = app.current_org_id()`,
      );
      const lineById: Record<string, LineRow> = {};
      for (const row of lines.rows) lineById[row.id] = row;

      const { rows } = await ctx.client.query<ConfigRow>(
        `select
           id::text,
           line_id,
           default_horizon_days,
           optimizer_version,
           sequencing_strategy,
           capacity_hours_per_day::text,
           changeover_weight::text,
           duedate_weight::text,
           utilization_weight::text,
           respect_pm_windows,
           allow_alternate_routings
         from public.scheduler_config
        where org_id = app.current_org_id()
        order by line_id nulls first`,
      );

      if (rows.length === 0) {
        return { ok: true, rows: [defaultsRow()], showingDefaultsOnly: true };
      }

      return {
        ok: true,
        showingDefaultsOnly: false,
        rows: rows.map((row) => {
          const line = row.line_id ? lineById[row.line_id] : null;
          return {
            id: row.id,
            scope: row.line_id === null ? 'org' : 'line',
            lineId: row.line_id,
            lineLabel: line ? `${line.code} — ${line.name}` : row.line_id,
            defaultHorizonDays: row.default_horizon_days,
            optimizerVersion: row.optimizer_version,
            sequencingStrategy: row.sequencing_strategy,
            capacityHoursPerDay: row.capacity_hours_per_day,
            changeoverWeight: row.changeover_weight,
            duedateWeight: row.duedate_weight,
            utilizationWeight: row.utilization_weight,
            respectPmWindows: row.respect_pm_windows,
            allowAlternateRoutings: row.allow_alternate_routings,
            isPersisted: true,
          };
        }),
      };
    });
  } catch (error) {
    console.error('[scheduler/settings/loadSchedulerSettings] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
