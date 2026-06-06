'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import * as InputModule from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import SchemaViewModal from '../../../../../../components/settings/modals/schema-view-modal';

const Input = ((InputModule as typeof InputModule & { Input?: typeof InputModule.default }).Input ?? InputModule.default) as typeof InputModule.default;

export type Tier = 'L1' | 'L2' | 'L3' | 'L4';
export type UserRole = 'Admin' | 'Operator' | 'Viewer';
export type SchemaState = 'ready' | 'loading' | 'empty' | 'error';

export type SchemaColumnRow = {
  col: string;
  label: string;
  table: string;
  dept: string;
  type: string;
  tier: Tier;
  storage: string;
  req: boolean;
  status: 'active' | 'draft' | 'deprecated';
  version: number;
};

export type SchemaBrowserLabels = {
  title: string;
  subtitle: string;
  exportSchemaCsv: string;
  promotionNotice: string;
  promotionWizard: string;
  tableFilter: string;
  tierFilter: string;
  allTables: string;
  allTiers: string;
  searchColumns: string;
  columnCount: string;
  columnDefinitions: string;
  columnCode: string;
  label: string;
  table: string;
  dept: string;
  type: string;
  tier: string;
  storage: string;
  required: string;
  status: string;
  version: string;
  actions: string;
  view: string;
  edit: string;
  loading: string;
  empty: string;
  error: string;
  usePromotionRequest: string;
  close: string;
  previewSchema?: string;
  newSchemaColumn?: string;
};

export type SchemaBrowserProps = {
  columns: SchemaColumnRow[];
  labels: SchemaBrowserLabels;
  initialSearchParams: Record<string, string | undefined>;
  state: SchemaState;
  userRole: UserRole;
  openModal?: (modalId: 'schemaView' | 'promoteToL2', payload?: { col: SchemaColumnRow }) => void;
  onEditColumn?: (columnCode: string) => void;
  locale?: string;
};

type Option = { value: string; label: string };

function countText(template: string, count: number) {
  return template.includes('{count}') ? template.replace('{count}', String(count)) : `${count} columns`;
}

function tierVariant(tier: Tier) {
  if (tier === 'L1') return 'danger' as const;
  if (tier === 'L2') return 'warning' as const;
  if (tier === 'L3') return 'info' as const;
  return 'muted' as const;
}

function SchemaStateCard({ role, children }: { role: 'status' | 'alert'; children: string }) {
  return (
    <Card className="settings-schema-browser__state">
      <CardContent role={role}>{children}</CardContent>
    </Card>
  );
}

export default function SchemaBrowserScreen({
  columns,
  labels,
  initialSearchParams,
  state,
  userRole,
  openModal,
  onEditColumn,
  locale = 'en',
}: SchemaBrowserProps) {
  const [tableFilter, setTableFilter] = React.useState(initialSearchParams.table ?? 'all');
  const [tierFilter, setTierFilter] = React.useState(initialSearchParams.tier ?? 'all');
  const [query, setQuery] = React.useState(initialSearchParams.search ?? '');
  const [tableOpen, setTableOpen] = React.useState(false);
  const [tierOpen, setTierOpen] = React.useState(false);
  const [dialogColumn, setDialogColumn] = React.useState<SchemaColumnRow | null>(null);
  const schemaBaseHref = `/${locale}/settings/schema`;

  const tableOptions = React.useMemo(() => {
    const tables = Array.from(new Set(columns.map((row) => row.table))).sort();
    return [{ value: 'all', label: labels.allTables }, ...tables.map((table) => ({ value: table, label: table }))];
  }, [columns, labels.allTables]);

  const tierOptions = React.useMemo(
    () => [
      { value: 'all', label: labels.allTiers },
      { value: 'L1', label: 'L1' },
      { value: 'L2', label: 'L2' },
      { value: 'L3', label: 'L3' },
      { value: 'L4', label: 'L4' },
    ],
    [labels.allTiers],
  );

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase();
    return columns.filter(
      (row) =>
        (tableFilter === 'all' || row.table === tableFilter) &&
        (tierFilter === 'all' || row.tier === tierFilter) &&
        (!q || row.col.toLowerCase().includes(q) || row.label.toLowerCase().includes(q)),
    );
  }, [columns, query, tableFilter, tierFilter]);

  const exportVisibleColumns = () => {
    const headers = ['col', 'label', 'table', 'dept', 'type', 'tier', 'storage', 'req', 'status', 'version'];
    const escapeCell = (value: string | number | boolean) => {
      const text = String(value);
      const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replaceAll('"', '""')}"`;
    };
    const lines = [
      headers.join(','),
      ...filtered.map((row) =>
        [row.col, row.label, row.table, row.dept, row.type, row.tier, row.storage, row.req, row.status, row.version].map(escapeCell).join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'schema-columns.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main
      data-testid="settings-schema-browser-screen"
      aria-labelledby="settings-schema-browser-title"
      className="settings-page settings-schema-browser space-y-4"
    >
      <header data-region="page-head" className="settings-page__head">
        <div>
          <h1 id="settings-schema-browser-title">{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        <div className="settings-page__actions flex flex-wrap items-center gap-2">
          <a className="btn btn-secondary" href={`${schemaBaseHref}/preview`} tabIndex={-1}>
            {labels.previewSchema ?? 'Schema shadow preview'}
          </a>
          <a className="btn btn-secondary" href={`${schemaBaseHref}/new`} tabIndex={-1}>
            {labels.newSchemaColumn ?? 'New schema column'}
          </a>
          <Button type="button" className="btn-secondary" onClick={exportVisibleColumns}>
            {labels.exportSchemaCsv}
          </Button>
        </div>
      </header>

      {state === 'error' ? <SchemaStateCard role="alert">{labels.error}</SchemaStateCard> : null}
      {state === 'loading' ? <SchemaStateCard role="status">{labels.loading}</SchemaStateCard> : null}
      {state === 'empty' ? <SchemaStateCard role="status">{labels.empty}</SchemaStateCard> : null}

      {state === 'ready' ? (
        <>
          <div data-region="promotion-notice" role="alert" className="alert alert-blue text-xs">
            {labels.promotionNotice}
          </div>

          <section data-region="schema-filters" aria-label="Schema filters" className="settings-schema-browser__filters flex flex-wrap items-center gap-2">
            <Select value={tableFilter} options={tableOptions} onValueChange={setTableFilter}>
              <SelectTrigger
                {...({
                  'aria-label': labels.tableFilter,
                  'data-slot': 'select-trigger',
                  className: 'min-w-40',
                  onClick: () => setTableOpen((open) => !open),
                } as React.ComponentProps<typeof SelectTrigger> & { 'data-slot': string; onClick: () => void })}
              >
                <SelectValue />
              </SelectTrigger>
              <div hidden={!tableOpen}>
                <SelectContent>
                  {tableOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </div>
            </Select>

            <Select value={tierFilter} options={tierOptions} onValueChange={setTierFilter}>
              <SelectTrigger
                {...({
                  'aria-label': labels.tierFilter,
                  'data-slot': 'select-trigger',
                  className: 'min-w-36',
                  onClick: () => setTierOpen((open) => !open),
                } as React.ComponentProps<typeof SelectTrigger> & { 'data-slot': string; onClick: () => void })}
              >
                <SelectValue />
              </SelectTrigger>
              <div hidden={!tierOpen}>
                <SelectContent>
                  {tierOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </div>
            </Select>

            <Input
              type="search"
              role="searchbox"
              aria-label={labels.searchColumns}
              placeholder={labels.searchColumns}
              value={query}
              data-slot="input"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value.toLowerCase())}
              className="settings-schema-browser__search min-w-64"
            />

            <span className="muted settings-schema-browser__count text-xs" aria-live="polite">
              {countText(labels.columnCount, filtered.length)}
            </span>

          </section>

          <section data-region="column-definitions" aria-labelledby="schema-column-definitions-title">
            <Card>
              <CardHeader>
                <CardTitle id="schema-column-definitions-title">{labels.columnDefinitions}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table aria-label={labels.columnDefinitions} data-slot="table">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">{labels.columnCode}</TableHead>
                      <TableHead scope="col">{labels.label}</TableHead>
                      <TableHead scope="col">{labels.table}</TableHead>
                      <TableHead scope="col">{labels.dept}</TableHead>
                      <TableHead scope="col">{labels.type}</TableHead>
                      <TableHead scope="col">{labels.tier}</TableHead>
                      <TableHead scope="col">{labels.storage}</TableHead>
                      <TableHead scope="col">{labels.required}</TableHead>
                      <TableHead scope="col">{labels.status}</TableHead>
                      <TableHead scope="col">{labels.version}</TableHead>
                      <TableHead scope="col">{labels.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => {
                      const l1EditDisabled = userRole !== 'Admin' && row.tier === 'L1';
                      const descriptionId = `${row.col}-edit-description`;
                      return (
                        <TableRow key={`${row.table}-${row.col}`}>
                          <TableCell className="mono font-semibold">{row.col}</TableCell>
                          <TableCell className="text-xs">{row.label}</TableCell>
                          <TableCell><Badge variant="secondary">{row.table}</Badge></TableCell>
                          <TableCell className="muted text-xs">{row.dept}</TableCell>
                          <TableCell><Badge variant="secondary">{row.type}</Badge></TableCell>
                          <TableCell><Badge variant={tierVariant(row.tier)}>{row.tier}</Badge></TableCell>
                          <TableCell className="muted text-[10px]">{row.storage}</TableCell>
                          <TableCell>{row.req ? <span style={{ color: 'var(--green-700)' }}>✓</span> : <span className="muted">—</span>}</TableCell>
                          <TableCell><Badge variant={row.status === 'active' ? 'success' : 'warning'}>{row.status}</Badge></TableCell>
                          <TableCell className="mono num">v{row.version}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              className="btn-secondary btn-sm"
                              data-modal-id="schemaView"
                              onClick={(event) => {
                                event.currentTarget.blur();
                                if (openModal) {
                                  openModal('schemaView', { col: row });
                                  return;
                                }
                                setDialogColumn(row);
                              }}
                            >
                              {labels.view}
                            </Button>
                            <Button
                              type="button"
                              className="btn-secondary btn-sm"
                              disabled={l1EditDisabled}
                              aria-describedby={l1EditDisabled ? descriptionId : undefined}
                              onClick={() => {
                                if (onEditColumn) {
                                  onEditColumn(row.col);
                                  return;
                                }
                                window.location.assign(`/schema/wizard?table=${encodeURIComponent(row.table)}&column=${encodeURIComponent(row.col)}`);
                              }}
                            >
                              {labels.edit}
                            </Button>
                            {l1EditDisabled ? (
                              <span id={descriptionId} role="tooltip" className="muted text-xs">
                                {labels.usePromotionRequest}
                              </span>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}

      <SchemaViewModal
        open={dialogColumn !== null}
        column={dialogColumn}
        onOpenChange={(open) => {
          if (!open) setDialogColumn(null);
        }}
      />
    </main>
  );
}
