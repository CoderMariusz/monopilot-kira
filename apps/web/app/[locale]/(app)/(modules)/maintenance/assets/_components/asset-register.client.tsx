'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { toCsv } from '../../../../../../../lib/shared/download';
import type { EquipmentAssetRow } from '../_types/asset-schemas';
import { createEquipment } from '../_actions/asset-actions';
import { AssetFormModal, type AssetFormLabels } from './asset-form-modal';

export type AssetRegisterLabels = {
  searchPlaceholder: string;
  countLine: string;
  addAsset: string;
  exportCsv: string;
  emptyTitle: string;
  emptyBody: string;
  col: {
    code: string;
    name: string;
    type: string;
    loto: string;
    calibration: string;
    status: string;
  };
  lotoYes: string;
  lotoNo: string;
  calYes: string;
  calNo: string;
  statusActive: string;
  statusInactive: string;
  types: Record<string, string>;
  form: AssetFormLabels;
};

function buildCsvHref(rows: EquipmentAssetRow[], labels: AssetRegisterLabels): string {
  const csv = toCsv(
    [
      labels.col.code,
      labels.col.name,
      labels.col.type,
      labels.col.loto,
      labels.col.calibration,
      labels.col.status,
    ],
    rows.map((row) => [
      row.equipmentCode,
      row.name,
      labels.types[row.equipmentType] ?? row.equipmentType,
      row.requiresLoto ? labels.lotoYes : labels.lotoNo,
      row.requiresCalibration ? labels.calYes : labels.calNo,
      row.active ? labels.statusActive : labels.statusInactive,
    ]),
  );
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

export function AssetRegisterClient({
  rows,
  labels,
  canEdit,
}: {
  rows: EquipmentAssetRow[];
  labels: AssetRegisterLabels;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.equipmentCode.toLowerCase().includes(q) || row.name.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const lotoCount = rows.filter((row) => row.requiresLoto).length;
  const countLine = labels.countLine
    .replace('{total}', String(rows.length))
    .replace('{loto}', String(lotoCount));

  const csvHref = buildCsvHref(filtered, labels);

  return (
    <div data-testid="asset-register" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">{countLine}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={labels.searchPlaceholder}
            data-testid="asset-register-search"
            className="min-w-[220px] rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <a
            href={csvHref}
            download="maintenance-assets.csv"
            data-testid="asset-register-export"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {labels.exportCsv}
          </a>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              data-testid="asset-register-add"
              className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {labels.addAsset}
            </button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          data-testid="asset-register-empty"
          data-state={rows.length === 0 ? 'empty' : 'empty-filtered'}
          className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"
        >
          <h2 className="text-base font-semibold text-slate-900">{labels.emptyTitle}</h2>
          <p className="mt-2 text-sm text-slate-500">{labels.emptyBody}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table data-testid="asset-register-table" className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{labels.col.code}</th>
                <th className="px-4 py-3">{labels.col.name}</th>
                <th className="px-4 py-3">{labels.col.type}</th>
                <th className="px-4 py-3">{labels.col.loto}</th>
                <th className="px-4 py-3">{labels.col.calibration}</th>
                <th className="px-4 py-3">{labels.col.status}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`asset-row-${row.equipmentCode}`}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-800">{row.equipmentCode}</td>
                  <td className="px-4 py-3 text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {labels.types[row.equipmentType] ?? row.equipmentType}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.requiresLoto ? labels.lotoYes : labels.lotoNo}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.requiresCalibration ? labels.calYes : labels.calNo}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.active ? labels.statusActive : labels.statusInactive}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate ? (
        <AssetFormModal
          labels={labels.form}
          createEquipmentAction={createEquipment}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
