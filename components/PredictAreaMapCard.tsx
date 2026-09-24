import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import {
  CROP_SELECTION_OPTIONS,
  type CropSelectionKey,
  type CropSelectionState,
} from './CropDropdownChecklist';

function formatAreaHa(ha: number | null | undefined): string {
  if (ha == null || Number.isNaN(ha)) {
    return '—';
  }
  return `${ha.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

export interface PredictAreaMapCardProps {
  loading: boolean;
  /** e.g. village / subdistrict name under the title */
  regionLabel: string;
  cropAreas: Record<CropSelectionKey, number | null>;
  cropColors?: Partial<Record<CropSelectionKey, string>>;
  selectedCrops: CropSelectionState;
  onToggleCrop: (crop: CropSelectionKey) => void;
  /** When set, only these crops appear in the list */
  allowedCropKeys?: CropSelectionKey[] | null;
}

const PredictAreaMapCard: React.FC<PredictAreaMapCardProps> = ({
  loading,
  regionLabel,
  cropAreas,
  cropColors = {},
  selectedCrops,
  onToggleCrop,
  allowedCropKeys = null,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const options =
    allowedCropKeys && allowedCropKeys.length > 0
      ? CROP_SELECTION_OPTIONS.filter((o) => allowedCropKeys.includes(o.key))
      : CROP_SELECTION_OPTIONS;

  const rows = options.map((crop, index) => ({
    key: crop.key,
    index: index + 1,
    name: crop.label,
    color: cropColors[crop.key] ?? crop.color ?? '#166534',
    area: cropAreas[crop.key] ?? null,
  }));

  return (
    <div
      className="w-full min-w-[16rem] max-w-[18rem] rounded-md border border-gray-300 bg-white shadow-xl"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#111827' }}
    >
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold leading-tight text-gray-900">
              Total predicted crop area
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
        <div className="px-2 pb-2.5 max-h-[min(50vh,280px)] overflow-y-auto">
          {loading && rows.every((row) => row.area == null) ? (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-800">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-amber-500" />
              <span className="text-sm text-gray-800">Loading…</span>
            </div>
          ) : (
            <table className="w-full text-left text-[13px] text-gray-900">
              <thead>
                <tr>
                  <th className="w-8 py-1.5 pl-0.5 font-semibold text-gray-800">Show</th>
                  <th className="py-1.5 font-semibold text-gray-800">Crop</th>
                  <th className="py-1.5 pr-0.5 text-right font-semibold text-gray-800">Total area</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const checked = selectedCrops[row.key];
                  return (
                    <tr
                      key={row.key}
                      className={`border-t border-gray-200 ${checked ? 'bg-amber-50/60' : ''}`}
                    >
                      <td className="py-1.5 align-middle">
                        <label className="inline-flex cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleCrop(row.key)}
                            className="h-3.5 w-3.5 rounded border-gray-400 accent-amber-500"
                            aria-label={`Show ${row.name} on map`}
                          />
                        </label>
                      </td>
                      <td className="py-1.5 align-middle">
                        <label
                          className="flex cursor-pointer items-center gap-1.5"
                          onClick={() => onToggleCrop(row.key)}
                        >
                          <span
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-gray-300"
                            style={{ backgroundColor: row.color }}
                          />
                          <span
                            className={`font-medium text-gray-900 ${checked ? 'opacity-100' : 'opacity-70'}`}
                          >
                            {row.name}
                          </span>
                        </label>
                      </td>
                      <td className="py-1.5 text-right align-middle tabular-nums text-gray-900">
                        {row.area == null || Number.isNaN(row.area) ? '—' : formatAreaHa(row.area)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default PredictAreaMapCard;
