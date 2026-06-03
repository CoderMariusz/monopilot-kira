'use client';

/**
 * SET-032 — Schema Diff Viewer interactive island.
 * Prototype parity source:
 *   prototypes/design/Monopilot Design System/settings/schema-diff.jsx:107-262
 * Parity features (Wave 3 polish):
 *   - version SELECT pickers for arbitrary vN vs vM (replaces static badges,
 *     schema-diff.jsx:167-190); left options disabled when >= right
 *   - "Revert to vN" wired with a confirm Modal (schema-diff.jsx:243-260)
 *   - line-numbered before/after JSON panels + unified diff table
 */
import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type JsonRecord = Record<string, unknown>;
export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';
export type DiffRow = { path: string; before: unknown; after: unknown; status: DiffStatus };

export type DiffVersion = {
  version: number;
  json: JsonRecord;
  changedBy: string;
  changedAt: string;
  deployRef: string;
};

export type DiffLabels = Record<string, string>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatJson(value: unknown) {
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  return JSON.stringify(value, null, 2);
}

export function diffJson(before: unknown, after: unknown, prefix = ''): DiffRow[] {
  const beforeRecord = isRecord(before) ? before : null;
  const afterRecord = isRecord(after) ? after : null;
  if (!beforeRecord || !afterRecord) {
    return jsonEqual(before, after) ? [] : [{ path: prefix || '$', before, after, status: 'changed' }];
  }
  const keys = Array.from(new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])).sort();
  return keys.flatMap((key) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeRecord, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterRecord, key);
    if (!hasBefore) return [{ path, before: undefined, after: afterRecord[key], status: 'added' as const }];
    if (!hasAfter) return [{ path, before: beforeRecord[key], after: undefined, status: 'removed' as const }];
    if (isRecord(beforeRecord[key]) && isRecord(afterRecord[key])) return diffJson(beforeRecord[key], afterRecord[key], path);
    return jsonEqual(beforeRecord[key], afterRecord[key]) ? [] : [{ path, before: beforeRecord[key], after: afterRecord[key], status: 'changed' as const }];
  });
}

function countRows(rows: DiffRow[]) {
  return rows.reduce(
    (acc, row) => ({ ...acc, [row.status]: acc[row.status] + 1 }),
    { added: 0, removed: 0, changed: 0, unchanged: 0 } satisfies Record<DiffStatus, number>,
  );
}

function badgeVariant(status: DiffStatus) {
  if (status === 'added') return 'success' as const;
  if (status === 'removed') return 'danger' as const;
  if (status === 'changed') return 'warning' as const;
  return 'muted' as const;
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

function DiffValue({ value, status, side }: { value: unknown; status: DiffStatus; side: 'before' | 'after' }) {
  const removed = status === 'removed' && side === 'before';
  const addedOrChanged = (status === 'added' || status === 'changed') && side === 'after';
  return (
    <code
      className={[
        'settings-schema-diff__value',
        removed ? 'bg-red-50 text-red-800 line-through' : '',
        addedOrChanged ? 'bg-green-50 text-green-900' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {formatJson(value)}
    </code>
  );
}

function VersionPanel({
  title,
  version,
  rows,
  side,
}: {
  title: string;
  version: number;
  rows: DiffRow[];
  side: 'before' | 'after';
}) {
  return (
    <Card className="settings-schema-diff__panel">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Badge variant={side === 'before' ? 'muted' : 'success'}>v{version}</Badge>
      </CardHeader>
      <CardContent>
        <dl className="settings-schema-diff__json-list">
          {rows.map((row, i) => (
            <div key={`${side}-${row.path}`} className="settings-schema-diff__json-row" data-line-number={i + 1}>
              <dt>
                <span className="settings-schema-diff__gutter" aria-hidden="true">
                  {i + 1}
                </span>
                {row.path}
              </dt>
              <dd>
                <DiffValue value={side === 'before' ? row.before : row.after} status={row.status} side={side} />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function DiffViewer({
  versions,
  initialFrom,
  initialTo,
  tier,
  tableCode,
  columnCode,
  labels,
}: {
  versions: DiffVersion[];
  initialFrom: number;
  initialTo: number;
  tier: string;
  tableCode: string;
  columnCode: string;
  labels: DiffLabels;
}) {
  const [rightV, setRightV] = React.useState<number>(initialTo);
  const [leftV, setLeftV] = React.useState<number>(initialFrom);
  const [confirmRevert, setConfirmRevert] = React.useState(false);

  const rightVer = versions.find((v) => v.version === rightV) ?? versions.at(-1)!;
  const leftVer = versions.find((v) => v.version === leftV);

  const showNoPrior = !leftVer || rightV <= 1 || leftV >= rightV;
  const diffRows = !showNoPrior && rightVer && leftVer ? diffJson(leftVer.json, rightVer.json) : [];
  const counts = countRows(diffRows);

  const isL1 = tier === 'L1';
  const isRevertable = !isL1 && versions.length >= 2 && !!leftVer && rightVer.version - leftVer.version <= 3;

  const versionLabel = (v: DiffVersion) =>
    interpolate(labels.versionOption ?? 'v{version} — {date} by {author}', {
      version: v.version,
      date: (v.changedAt || '').split('T')[0] || v.changedAt,
      author: v.changedBy,
    });

  return (
    <>
      {/* Version selectors (parity: schema-diff.jsx:167-190) */}
      <section className="sg-section settings-schema-diff__selector" aria-label="Version comparison">
        <div className="flex flex-wrap items-center gap-3">
          <span className="muted text-sm" id="diff-from-label">
            {labels.compare}
          </span>
          <Select
            value={String(leftV)}
            onValueChange={(value) => setLeftV(Number(value))}
            aria-labelledby="diff-from-label"
          >
            <SelectTrigger aria-label={labels.selectVersionFrom ?? labels.compare}>
              <SelectValue placeholder={`v${leftV}`} />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.version} value={String(v.version)} disabled={v.version >= rightV}>
                  {versionLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="muted text-sm" id="diff-to-label">
            {labels.against}
          </span>
          <Select
            value={String(rightV)}
            onValueChange={(value) => setRightV(Number(value))}
            aria-labelledby="diff-to-label"
          >
            <SelectTrigger aria-label={labels.selectVersionAgainst ?? labels.against}>
              <SelectValue placeholder={`v${rightV}`} />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.version} value={String(v.version)}>
                  {versionLabel(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>{`v${leftV} → v${rightV}`}</span>
          <span className="muted mono text-xs">
            {tableCode} / {columnCode}
          </span>
        </div>
        {!showNoPrior ? (
          <div className="settings-schema-diff__badges flex flex-wrap gap-2" aria-label="Diff summary">
            <Badge variant="success">+ {interpolate(labels.added ?? '{count} added', { count: counts.added })}</Badge>
            <Badge variant="danger">− {interpolate(labels.removed ?? '{count} removed', { count: counts.removed })}</Badge>
            <Badge variant="warning">~ {interpolate(labels.changed ?? '{count} changed', { count: counts.changed })}</Badge>
            <Badge variant="muted">{interpolate(labels.unchanged ?? '{count} unchanged', { count: counts.unchanged })}</Badge>
          </div>
        ) : null}
      </section>

      {showNoPrior || !leftVer ? (
        <Card className="settings-schema-diff__state">
          <CardContent role="status">
            <strong>{labels.noPriorVersion}</strong>
            <p>{labels.noPriorVersionBody}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section
            className="settings-schema-diff__panels grid gap-3 md:grid-cols-2"
            aria-label="Side by side JSON panels"
          >
            <VersionPanel
              title={interpolate(labels.versionBeforeTitle ?? 'Version {version} (before)', { version: leftVer.version })}
              version={leftVer.version}
              rows={diffRows}
              side="before"
            />
            <VersionPanel
              title={interpolate(labels.versionAfterTitle ?? 'Version {version} (current)', { version: rightVer.version })}
              version={rightVer.version}
              rows={diffRows}
              side="after"
            />
          </section>

          <Card className="settings-schema-diff__metadata">
            <CardContent className="grid gap-3 md:grid-cols-4">
              <div>
                <div className="muted">{labels.changedBy}</div>
                <strong>{rightVer.changedBy}</strong>
              </div>
              <div>
                <div className="muted">{labels.changedAt}</div>
                <span className="mono">{rightVer.changedAt}</span>
              </div>
              <div>
                <div className="muted">{labels.tier}</div>
                <Badge variant={isL1 ? 'info' : 'success'}>{tier}</Badge>
              </div>
              <div>
                <div className="muted">{labels.deployRef}</div>
                <span className="mono">{rightVer.deployRef}</span>
              </div>
            </CardContent>
          </Card>

          <section data-region="primary-content" aria-labelledby="settings-schema-diff-table-title">
            <Card>
              <CardHeader>
                <CardTitle id="settings-schema-diff-table-title">{labels.unifiedDiff}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table aria-label={labels.unifiedDiff}>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.path}</TableHead>
                      <TableHead scope="col">
                        v{leftVer.version} / {labels.before}
                      </TableHead>
                      <TableHead scope="col">
                        v{rightVer.version} / {labels.current}
                      </TableHead>
                      <TableHead scope="col">{labels.change}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diffRows.map((row) => (
                      <TableRow key={row.path}>
                        <TableCell>
                          <code>{row.path}</code>
                        </TableCell>
                        <TableCell>
                          <DiffValue value={row.before} status={row.status} side="before" />
                        </TableCell>
                        <TableCell>
                          <DiffValue value={row.after} status={row.status} side="after" />
                        </TableCell>
                        <TableCell>
                          <Badge variant={badgeVariant(row.status)}>{row.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          <div className="flex items-center justify-between gap-3">
            <p className="muted text-sm">
              {isL1
                ? labels.revertUnavailableL1
                : !isRevertable
                  ? labels.revertUnavailableWindow
                  : labels.revertAvailable}
            </p>
            <Button
              type="button"
              className="btn-secondary"
              disabled={!isRevertable}
              aria-disabled={!isRevertable || undefined}
              onClick={() => setConfirmRevert(true)}
            >
              ↺ {interpolate(labels.revertToVersion ?? 'Revert to v{version}', { version: leftVer.version })}
            </Button>
          </div>

          {/* Confirm revert dialog (parity: schema-diff.jsx:243-260) */}
          <Modal open={confirmRevert} onOpenChange={setConfirmRevert} size="md" modalId="schema-diff-revert-confirm">
            <Modal.Header
              title={interpolate(labels.revertConfirmTitle ?? 'Revert {column} to v{version}?', {
                column: columnCode,
                version: leftVer.version,
              })}
            />
            <Modal.Body>
              <p>{interpolate(labels.revertConfirmBody ?? '', { version: leftVer.version })}</p>
              <div role="note" className="alert alert-amber mt-3 text-xs">
                {interpolate(labels.revertConfirmWarning ?? '', {
                  next: versions.length + 1,
                  current: rightVer.version,
                })}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmRevert(false)}>
                {labels.revertCancel}
              </Button>
              <Button
                type="button"
                className="btn-primary btn-sm settings-schema-diff__revert-confirm"
                onClick={() => setConfirmRevert(false)}
              >
                {labels.revertConfirm}
              </Button>
            </Modal.Footer>
          </Modal>
        </>
      )}
    </>
  );
}
