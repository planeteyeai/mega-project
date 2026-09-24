import React from 'react';
import type { CropSelectionKey } from './CropDropdownChecklist';
import { CROP_SELECTION_OPTIONS } from './CropDropdownChecklist';

export interface CropChecklistProps {
  checkedCrops: Record<CropSelectionKey, boolean>;
  onToggleCrop: (crop: CropSelectionKey) => void;
  isDarkMode?: boolean;
  allowedCropKeys?: CropSelectionKey[] | null;
}

const CropChecklist: React.FC<CropChecklistProps> = ({
  checkedCrops,
  onToggleCrop,
  isDarkMode = true,
  allowedCropKeys = null,
}) => {
  const options =
    allowedCropKeys && allowedCropKeys.length > 0
      ? CROP_SELECTION_OPTIONS.filter((o) => allowedCropKeys.includes(o.key))
      : CROP_SELECTION_OPTIONS;

  return (
  <div className="space-y-2">
    {options.map((crop) => (
      <label
        key={crop.key}
        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
          checkedCrops[crop.key]
            ? isDarkMode
              ? 'border-emerald-500/60 bg-emerald-900/20'
              : 'border-emerald-300 bg-emerald-50'
            : isDarkMode
              ? 'border-gray-600 bg-gray-700/50 hover:bg-gray-700'
              : 'border-emerald-100 bg-white hover:bg-emerald-50/50'
        }`}
      >
        <input
          type="checkbox"
          checked={checkedCrops[crop.key]}
          onChange={() => onToggleCrop(crop.key)}
          className="h-4 w-4 rounded border-gray-500 accent-emerald-500"
        />
        <span
          className="h-3 w-3 flex-shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: crop.color }}
        />
        <span className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
          {crop.label}
        </span>
      </label>
    ))}
  </div>
  );
};

export default CropChecklist;
