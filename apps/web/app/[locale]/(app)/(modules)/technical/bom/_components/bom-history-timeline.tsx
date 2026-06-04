'use client';

/**
 * T-045 — UI: TEC-089 BOM Change History timeline.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:230-263
 *     (HistoryScreen — immutable revision-history list: per-entry time / tag badge
 *      / user / "act: obj")
 *
 * An audit timeline filtered to BOM changes for ONE BOM, built from REAL data
 * (the audit_log rows + bom_headers version history, loaded by getBomHistory under
 * RLS — no mocks). Each entry shows actor, action, the rendered delta summary
 * (status transition, target version) and the timestamp. An actor filter (shadcn
 * <Select>, raw <select> is a red-line) narrows the timeline client-side. The list
 * scrolls within a bounded region (the prototype's card list).
 *
 * Red-lines: org RLS is enforced in the loader (never query audit_log without it);
 * FG canonical (no FA labels); no inline layout styles (Tailwind only); no raw
 * <select>; every visible string is an injected i18n label.
 */

import React from 'react';

import { Badge, type BadgeVariant } from '@monopilot/ui/Badge';
import { Card } from '@monopilot/ui/Card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

export type HistoryEntryView = {
  id: string;
  occurredAt: string;
  tag: 'created' | 'approve' | 'release' | 'other';
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  version: number | null;
  deltaSummary: string | null;
};

export type HistoryActor = { id: string; name: string };

export type BomHistoryLabels = {
  title: string;
  subtitle: string;
  filterActorLabel: string;
  filterAllActors: string;
  empty: string;
  emptyFiltered: string;
  tagCreated: string;
  tagApprove: string;
  tagRelease: string;
  tagOther: string;
  /** "v{version}" target chip. */
  versionChip: string;
  unknownActor: string;
};

const TAG_VARIANT: Record<HistoryEntryView['tag'], BadgeVariant> = {
  created: 'info',
  approve: 'secondary',
  release: 'success',
  other: 'muted',
};

function tagLabel(tag: HistoryEntryView['tag'], labels: BomHistoryLabels): string {
  switch (tag) {
    case 'created':
      return labels.tagCreated;
    case 'approve':
      return labels.tagApprove;
    case 'release':
      return labels.tagRelease;
    case 'other':
      return labels.tagOther;
  }
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

function fmtDateTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().replace('T', ' ').slice(0, 16);
}

export function BomHistoryTimeline({
  entries,
  actors,
  labels,
}: {
  entries: HistoryEntryView[];
  actors: HistoryActor[];
  labels: BomHistoryLabels;
}) {
  const [actorFilter, setActorFilter] = React.useState<string>('all');

  const visible =
    actorFilter === 'all' ? entries : entries.filter((e) => e.actorUserId === actorFilter);

  return (
    <section data-testid="bom-history-timeline" className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        {actors.length > 0 ? (
          <div className="flex items-center gap-2">
            <span id="bom-history-actor-label" className="text-xs font-medium text-slate-700">
              {labels.filterActorLabel}
            </span>
            <Select
              value={actorFilter}
              onValueChange={setActorFilter}
              aria-labelledby="bom-history-actor-label"
            >
              <SelectTrigger aria-label={labels.filterActorLabel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{labels.filterAllActors}</SelectItem>
                {actors.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </header>

      {entries.length === 0 ? (
        <Card data-testid="bom-history-empty" className="rounded-xl border bg-white px-6 py-12 text-center text-sm text-muted-foreground">
          <span role="status">{labels.empty}</span>
        </Card>
      ) : visible.length === 0 ? (
        <Card data-testid="bom-history-empty-filtered" className="rounded-xl border bg-white px-6 py-12 text-center text-sm text-muted-foreground">
          <span role="status">{labels.emptyFiltered}</span>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-xl border bg-white p-0 shadow-sm">
          <ul data-testid="bom-history-list" className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {visible.map((e) => (
              <li
                key={e.id}
                data-testid="bom-history-entry"
                className="grid grid-cols-[10rem_5rem_9rem_1fr] items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{fmtDateTime(e.occurredAt)}</span>
                <span>
                  <Badge variant={TAG_VARIANT[e.tag]}>{tagLabel(e.tag, labels)}</Badge>
                </span>
                <span className="text-xs font-medium">{e.actorName ?? labels.unknownActor}</span>
                <span className="text-sm">
                  <span className="text-muted-foreground">{e.action}</span>
                  {e.deltaSummary ? <span className="ml-1 font-mono text-xs">· {e.deltaSummary}</span> : null}
                  {e.version != null ? (
                    <Badge variant="outline" className="ml-2">
                      {interpolate(labels.versionChip, { version: e.version })}
                    </Badge>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

export default BomHistoryTimeline;
