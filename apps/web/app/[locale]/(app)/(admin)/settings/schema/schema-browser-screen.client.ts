'use client';

import React, { createElement as h, useMemo, useState } from 'react';

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
};

export type SchemaBrowserProps = {
  columns: SchemaColumnRow[];
  labels: SchemaBrowserLabels;
  initialSearchParams: Record<string, string | undefined>;
  state: SchemaState;
  userRole: UserRole;
  openModal?: (modalId: 'schemaView' | 'promoteToL2', payload?: { col: SchemaColumnRow }) => void;
  onEditColumn?: (columnCode: string) => void;
};

function countText(template: string, count: number) {
  return template.includes('{count}') ? template.replace('{count}', String(count)) : `${count} columns`;
}

function badge(text: string, tone = 'muted') {
  return h('span', { 'data-slot': 'badge', 'data-tone': tone, 'data-variant': tone, className: `badge badge--${tone}` }, text);
}

function button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & Record<string, unknown>, label: string) {
  return h('button', { type: 'button', 'data-slot': 'button', className: 'btn', ...props }, label);
}

function option(value: string, label: string, choose: (value: string) => void) {
  return h('button', { key: value, type: 'button', role: 'option', tabIndex: -1, className: 'select__item', onClick: () => choose(value) }, label);
}

function filterSelect(label: string, value: string, opts: Array<{ value: string; label: string }>, choose: (value: string) => void) {
  const display = opts.find((item) => item.value === value)?.label ?? value;
  return h(
    'div',
    { 'data-slot': 'select', className: 'select' },
    h(
      'button',
      {
        type: 'button',
        role: 'combobox',
        'aria-label': label,
        'aria-expanded': 'false',
        'aria-haspopup': 'listbox',
        'data-slot': 'select-trigger',
        'data-state': 'closed',
        className: 'select__trigger',
      },
      h('span', { 'data-slot': 'select-value' }, display),
      h('span', { 'aria-hidden': true, 'data-slot': 'select-arrow' }, '⌄'),
    ),
    h('div', { role: 'listbox', 'data-slot': 'select-content', className: 'select__content' }, opts.map((item) => option(item.value, item.label, choose))),
  );
}

function stateCard(role: 'status' | 'alert', text: string) {
  return h('div', { 'data-slot': 'card', className: 'card settings-schema-browser__state' }, h('div', { 'data-slot': 'card-content', role }, text));
}

export default function SchemaBrowserScreen({ columns, labels, initialSearchParams, state, userRole, openModal, onEditColumn }: SchemaBrowserProps) {
  const [tableFilter, setTableFilter] = useState(initialSearchParams.table ?? 'all');
  const [tierFilter, setTierFilter] = useState(initialSearchParams.tier ?? 'all');
  const [query, setQuery] = useState(initialSearchParams.search ?? '');
  const [dialogColumn, setDialogColumn] = useState<SchemaColumnRow | null>(null);

  const tableOptions = useMemo(() => {
    const tables = Array.from(new Set(columns.map((row) => row.table))).sort();
    return [{ value: 'all', label: labels.allTables }, ...tables.map((table) => ({ value: table, label: table }))];
  }, [columns, labels.allTables]);

  const tierOptions = useMemo(
    () => [
      { value: 'all', label: labels.allTiers },
      { value: 'L1', label: 'L1' },
      { value: 'L2', label: 'L2' },
      { value: 'L3', label: 'L3' },
      { value: 'L4', label: 'L4' },
    ],
    [labels.allTiers],
  );

  const filtered = useMemo(
    () =>
      columns.filter((row) => {
        const q = query.toLowerCase();
        return (
          (tableFilter === 'all' || row.table === tableFilter) &&
          (tierFilter === 'all' || row.tier === tierFilter) &&
          (!q || row.col.toLowerCase().includes(q) || row.label.toLowerCase().includes(q))
        );
      }),
    [columns, query, tableFilter, tierFilter],
  );

  const readyChildren =
    state === 'ready'
      ? [
          h('div', { key: 'notice', 'data-region': 'promotion-notice', role: 'alert', className: 'alert alert-blue' }, labels.promotionNotice),
          h(
            'div',
            { key: 'filters', 'data-region': 'schema-filters', className: 'settings-schema-browser__filters' },
            filterSelect(labels.tableFilter, tableFilter, tableOptions, setTableFilter),
            filterSelect(labels.tierFilter, tierFilter, tierOptions, setTierFilter),
            h(
              'span',
              { 'data-slot': 'input', style: { display: 'contents' } },
              h('input', {
                type: 'search',
                'aria-label': labels.searchColumns,
                placeholder: labels.searchColumns,
                value: query,
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value.toLowerCase()),
                className: 'settings-schema-browser__search',
              }),
            ),
            h('span', { className: 'muted settings-schema-browser__count' }, countText(labels.columnCount, filtered.length)),
          ),
          h(
            'section',
            { key: 'table-section', 'data-region': 'column-definitions', 'aria-labelledby': 'schema-column-definitions-title' },
            h(
              'div',
              { 'data-slot': 'card', className: 'card' },
              h('div', { 'data-slot': 'card-header', className: 'card__header' }, h('h3', { id: 'schema-column-definitions-title', 'data-slot': 'card-title' }, labels.columnDefinitions)),
              h(
                'div',
                { 'data-slot': 'card-content', className: 'card__content' },
                h(
                  'table',
                  { 'data-slot': 'table', className: 'table', 'aria-label': labels.columnDefinitions },
                  h(
                    'thead',
                    { 'data-slot': 'table-header' },
                    h(
                      'tr',
                      { 'data-slot': 'table-row' },
                      [labels.columnCode, labels.label, labels.table, labels.dept, labels.type, labels.tier, labels.storage, labels.required, labels.status, labels.version, labels.actions].map((head) =>
                        h('th', { key: head, 'data-slot': 'table-head' }, head),
                      ),
                    ),
                  ),
                  h(
                    'tbody',
                    { 'data-slot': 'table-body' },
                    filtered.map((row) => {
                      const l1Disabled = userRole !== 'Admin' && row.tier === 'L1';
                      const descriptionId = `${row.col}-edit-description`;
                      return h(
                        'tr',
                        { key: `${row.table}-${row.col}`, 'data-slot': 'table-row' },
                        h('td', { 'data-slot': 'table-cell', className: 'mono', style: { fontWeight: 600 } }, row.col),
                        h('td', { 'data-slot': 'table-cell', style: { fontSize: 12 } }, row.label),
                        h('td', { 'data-slot': 'table-cell' }, badge(row.table)),
                        h('td', { 'data-slot': 'table-cell', className: 'muted', style: { fontSize: 11 } }, row.dept),
                        h('td', { 'data-slot': 'table-cell' }, badge(row.type)),
                        h('td', { 'data-slot': 'table-cell' }, badge(row.tier, row.tier === 'L1' ? 'danger' : row.tier === 'L2' ? 'warning' : row.tier === 'L3' ? 'info' : 'muted')),
                        h('td', { 'data-slot': 'table-cell', className: 'muted', style: { fontSize: 10 } }, row.storage),
                        h('td', { 'data-slot': 'table-cell' }, row.req ? h('span', { style: { color: 'var(--green-700)' } }, '✓') : h('span', { className: 'muted' }, '—')),
                        h('td', { 'data-slot': 'table-cell' }, badge(row.status, row.status === 'active' ? 'success' : 'warning')),
                        h('td', { 'data-slot': 'table-cell', className: 'mono num' }, `v${row.version}`),
                        h(
                          'td',
                          { 'data-slot': 'table-cell' },
                          button(
                            {
                              className: 'btn btn-secondary btn-sm',
                              'data-modal-id': 'schemaView',
                              onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                                event.currentTarget.blur();
                                openModal?.('schemaView', { col: row });
                                setDialogColumn(row);
                              },
                            },
                            labels.view,
                          ),
                          button(
                            {
                              className: 'btn btn-secondary btn-sm',
                              disabled: l1Disabled,
                              'aria-describedby': l1Disabled ? descriptionId : undefined,
                              onClick: () => {
                                if (onEditColumn) {
                                  onEditColumn(row.col);
                                  return;
                                }
                                const target = `/schema/wizard?table=${encodeURIComponent(row.table)}&column=${encodeURIComponent(row.col)}`;
                                window.location.assign(target);
                              },
                            },
                            labels.edit,
                          ),
                          l1Disabled ? h('span', { id: descriptionId, className: 'muted', role: 'tooltip' }, labels.usePromotionRequest) : null,
                        ),
                      );
                    }),
                  ),
                ),
              ),
            ),
          ),
        ]
      : [];

  return h(
    'main',
    { 'data-testid': 'settings-schema-browser-screen', 'aria-labelledby': 'settings-schema-browser-title', className: 'settings-page settings-schema-browser' },
    h(
      'header',
      { 'data-region': 'page-head', className: 'settings-page__head' },
      h('div', null, h('h1', { id: 'settings-schema-browser-title' }, labels.title), h('p', null, labels.subtitle)),
      button({ className: 'btn btn-secondary' }, labels.exportSchemaCsv),
    ),
    state === 'error' ? stateCard('alert', labels.error) : null,
    state === 'loading' ? stateCard('status', labels.loading) : null,
    state === 'empty' ? stateCard('status', labels.empty) : null,
    ...readyChildren,
    dialogColumn
      ? h(
          'div',
          { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'schema-view-dialog-title', className: 'settings-schema-browser__dialog' },
          h('h2', { id: 'schema-view-dialog-title' }, `${labels.columnDefinitions}: ${dialogColumn.col}`),
          h('p', null, dialogColumn.label),
          button({ onClick: () => setDialogColumn(null) }, labels.close),
        )
      : null,
  );
}
