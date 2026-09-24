import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export const CROP_SELECTION_KEYS = ['sugarcane', 'wheat', 'Soyabean', 'Mango', 'Banana'] as const;
export type CropSelectionKey = (typeof CROP_SELECTION_KEYS)[number];
export type CropSelectionState = Record<CropSelectionKey, boolean>;

export const CROP_SELECTION_OPTIONS: {
  key: CropSelectionKey;
  label: string;
  color?: string;
}[] = [
  { key: 'sugarcane', label: 'Sugarcane', color: '#2563eb' },
  { key: 'wheat', label: 'Jawar', color: '#dc2626' },
  { key: 'Soyabean', label: 'Soyabean', color: '#16a34a' },
  { key: 'Mango', label: 'Mango', color: '#f97316' },
  { key: 'Banana', label: 'Banana', color: '#fbbf24' },
];

export const emptyCropSelection = (): CropSelectionState => ({
  sugarcane: false,
  wheat: false,
  Soyabean: false,
  Mango: false,
  Banana: false,
});

export function hasAnyCropSelected(crops: CropSelectionState): boolean {
  return CROP_SELECTION_KEYS.some((key) => crops[key]);
}

export function getPredictCropMode(crops: CropSelectionState): 'all' | 'sugarcane' | 'wheat' | null {
  if (crops.sugarcane && crops.wheat) return 'all';
  if (crops.sugarcane) return 'sugarcane';
  if (crops.wheat) return 'wheat';
  return null;
}

/** Login username that may only see / select Sugarcane. */
export const SUGARCANE_ONLY_USER = 'sugarcane';

export function isSugarcaneOnlyUser(user: string): boolean {
  return user.trim().toLowerCase() === SUGARCANE_ONLY_USER;
}

/** null = all crops allowed */
export function getAllowedCropKeys(user: string): CropSelectionKey[] | null {
  if (isSugarcaneOnlyUser(user)) return ['sugarcane'];
  return null;
}

export function sugarcaneOnlySelection(): CropSelectionState {
  return {
    sugarcane: true,
    wheat: false,
    Soyabean: false,
    Mango: false,
    Banana: false,
  };
}

function formatSummary(crops: CropSelectionState, options = CROP_SELECTION_OPTIONS): string {
  const picked = options.filter((o) => crops[o.key]).map((o) => o.label);
  if (picked.length === 0) return '-- Select Crop --';
  if (picked.length === options.length && options.length > 1) return 'All';
  if (picked.length <= 2) return picked.join(', ');
  return `${picked.length} crops selected`;
}

export interface CropDropdownChecklistProps {
  selectedCrops: CropSelectionState;
  onToggleCrop: (crop: CropSelectionKey) => void;
  onToggleAll: () => void;
  isDarkMode?: boolean;
  /** When set, only these crops appear in the dropdown */
  allowedCropKeys?: CropSelectionKey[] | null;
}

const CropDropdownChecklist: React.FC<CropDropdownChecklistProps> = ({
  selectedCrops,
  onToggleCrop,
  onToggleAll,
  isDarkMode = true,
  allowedCropKeys = null,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleOptions =
    allowedCropKeys && allowedCropKeys.length > 0
      ? CROP_SELECTION_OPTIONS.filter((o) => allowedCropKeys.includes(o.key))
      : CROP_SELECTION_OPTIONS;
  const visibleKeys = visibleOptions.map((o) => o.key);
  const allChecked =
    visibleKeys.length > 0 && visibleKeys.every((key) => selectedCrops[key]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
          isDarkMode
            ? 'border-gray-600 bg-gray-700 text-white'
            : 'border-emerald-100 bg-white text-slate-800'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{formatSummary(selectedCrops, visibleOptions)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-lg ${
            isDarkMode ? 'border-gray-600 bg-gray-800' : 'border-emerald-100 bg-white'
          }`}
          role="listbox"
        >
          {visibleOptions.map((crop) => (
            <label
              key={crop.key}
              className={`flex cursor-pointer items-center gap-2.5 border-b px-3 py-2.5 last:border-b-0 ${
                isDarkMode
                  ? 'border-gray-700 hover:bg-gray-700/80'
                  : 'border-emerald-50 hover:bg-emerald-50/60'
              } ${selectedCrops[crop.key] ? (isDarkMode ? 'bg-emerald-900/25' : 'bg-emerald-50') : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedCrops[crop.key]}
                onChange={() => onToggleCrop(crop.key)}
                className="h-4 w-4 rounded border-gray-500 accent-emerald-500"
              />
              {crop.color ? (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: crop.color }}
                />
              ) : null}
              <span className={`text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{crop.label}</span>
            </label>
          ))}
          {visibleKeys.length > 1 ? (
            <label
              className={`flex cursor-pointer items-center gap-2.5 border-t px-3 py-2.5 font-medium ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-900/50 hover:bg-gray-700/80'
                  : 'border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50'
              }`}
            >
              <input
                type="checkbox"
                checked={allChecked}
                onChange={onToggleAll}
                className="h-4 w-4 rounded border-gray-500 accent-emerald-500"
              />
              <span className={`text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>All</span>
            </label>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default CropDropdownChecklist;
