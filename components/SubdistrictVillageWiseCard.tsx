import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { CROP_SELECTION_OPTIONS } from './CropDropdownChecklist';

export interface VillageCropAreaRow {
  village: string;
  crop: string;
  areaHa: number;
}

export interface SubdistrictVillageWiseCardProps {
  loading: boolean;
  regionLabel: string;
  rows: VillageCropAreaRow[];
  /** When set, only rows whose crop matches these keys/labels are shown */
  allowedCropKeys?: string[] | null;
  /** Card title — default "Village crop area" */
  title?: string;
  /** First column header — default "Village" */
  regionColumnLabel?: string;
}

function formatAreaHa(ha: number): string {
  return `${ha.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

function cropDisplayName(cropKey: string): string {
  const lower = cropKey.trim().toLowerCase();
  const opt = CROP_SELECTION_OPTIONS.find(
    (o) => o.key.toLowerCase() === lower || o.label.toLowerCase() === lower
  );
  if (opt) return opt.label;
  return cropKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function cropDotColor(cropKey: string): string {
  const lower = cropKey.trim().toLowerCase();
  const opt = CROP_SELECTION_OPTIONS.find(
    (o) => o.key.toLowerCase() === lower || o.label.toLowerCase() === lower
  );
  return opt?.color ?? '#a3a3a3';
}

const SubdistrictVillageWiseCard: React.FC<SubdistrictVillageWiseCardProps> = ({
  loading,
  regionLabel,
  rows,
  allowedCropKeys = null,
  title = 'Village crop area',
  regionColumnLabel = 'Village',
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const sortedRows = useMemo(() => {
    const allowed =
      allowedCropKeys && allowedCropKeys.length > 0
        ? new Set(allowedCropKeys.map((k) => k.trim().toLowerCase()))
        : null;
    const filtered = allowed
      ? rows.filter((r) => {
          const crop = r.crop.trim().toLowerCase();
          if (allowed.has(crop)) return true;
          const opt = CROP_SELECTION_OPTIONS.find(
            (o) => o.key.toLowerCase() === crop || o.label.toLowerCase() === crop
          );
          return opt ? allowed.has(opt.key.toLowerCase()) || allowed.has(opt.label.toLowerCase()) : false;
        })
      : rows;
    return [...filtered].sort((a, b) => {
      const v = a.village.localeCompare(b.village);
      if (v !== 0) return v;
      return a.crop.localeCompare(b.crop);
    });
  }, [rows, allowedCropKeys]);

  return (
    <div
      className="w-full min-w-[16rem] max-w-[18rem] rounded-md border border-gray-300 bg-white shadow-xl"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#111827' }}
    >
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold leading-tight text-gray-900">
              {title}
            </h3>
            <p className="mt-0.5 truncate text-[13px] text-gray-700" title={regionLabel}>
              {regionLabel || '—'}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="rounded p-0.5 text-gray-700 hover:bg-gray-100"
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? (
                <ChevronDown className="h-4 w-4" strokeWidth={2} />
              ) : (
                <ChevronUp className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
          </div>
        </div>
        <div className="mt-2 h-px w-full bg-amber-500" />
      </div>

      {!collapsed && (
        <div className="px-2 pb-2.5 max-h-[min(40vh,280px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-800">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-500" />
              <span className="text-sm text-gray-800">Loading…</span>
            </div>
          ) : sortedRows.length === 0 ? (
            <p className="py-3 text-center text-sm text-gray-600">No {regionColumnLabel.toLowerCase()} crop data</p>
          ) : (
            <table className="w-full table-fixed text-left text-[13px] text-gray-900">
              <thead>
                <tr>
                  <th className="w-[38%] py-1.5 pl-0.5 pr-2 font-semibold text-gray-800">{regionColumnLabel}</th>
                  <th className="w-[34%] py-1.5 pr-2 font-semibold text-gray-800">Crop</th>
                  <th className="w-[28%] py-1.5 pr-0.5 text-right font-semibold text-gray-800">Area</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={`${row.village}-${row.crop}`} className="border-t border-gray-200">
                    <td
                      className="py-1.5 pl-0.5 pr-2 align-middle font-medium text-gray-900"
                      title={row.village}
                    >
                      <span className="line-clamp-2">{row.village}</span>
                    </td>
                    <td className="py-1.5 pr-2 align-middle">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-gray-300"
                          style={{ backgroundColor: cropDotColor(row.crop) }}
                        />
                        <span className="whitespace-nowrap text-gray-900">
                          {cropDisplayName(row.crop)}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-0.5 text-right align-middle tabular-nums whitespace-nowrap text-gray-900">
                      {formatAreaHa(row.areaHa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default SubdistrictVillageWiseCard;
