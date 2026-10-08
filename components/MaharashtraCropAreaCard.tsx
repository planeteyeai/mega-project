import React from 'react';
import { Sprout } from 'lucide-react';
import ProcessLoader from './ProcessLoader';

const CROP_META: Record<string, { label: string; color: string }> = {
  sugarcane: { label: 'Sugarcane', color: '#2563eb' },
  wheat: { label: 'Jawar', color: '#dc2626' },
  onion: { label: 'Soyabean', color: '#16a34a' },
  soyabean: { label: 'Soyabean', color: '#16a34a' },
  mango: { label: 'Mango', color: '#f97316' },
  banana: { label: 'Banana', color: '#eab308' },
};

export interface MaharashtraCropAreaRow {
  key: string;
  ha: number;
  plots: number | null;
}

export interface MaharashtraCropAreaCardProps {
  loading: boolean;
  error: string | null;
  stateName: string;
  monthLabel: string;
  unit: string;
  crops: MaharashtraCropAreaRow[];
  totalHa: number | null;
  totalPlots: number | null;
  districtsWithData: number | null;
  districtsCount: number | null;
  onClick?: () => void;
}

function formatHa(value: number): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-IN');
}

function cropMeta(key: string): { label: string; color: string } {
  return CROP_META[key.trim().toLowerCase()] ?? {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    color: '#059669',
  };
}

const MaharashtraCropAreaCard: React.FC<MaharashtraCropAreaCardProps> = ({
  loading,
  error,
  stateName,
  monthLabel,
  unit,
  crops,
  totalHa,
  totalPlots,
  districtsWithData,
  districtsCount,
  onClick,
}) => {
  const unitLabel = unit.trim() || 'ha';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-[18.5rem] overflow-hidden rounded-2xl border border-emerald-100 bg-white text-left shadow-2xl transition-transform hover:-translate-y-0.5"
      title="Open state crop area"
    >
      <div className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-600 px-4 py-3.5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
              {stateName || 'Maharashtra'}
            </p>
            <h3 className="mt-0.5 text-[16px] font-bold leading-tight">Total crop area</h3>
            {monthLabel ? (
              <p className="mt-1 text-[12px] text-emerald-50">{monthLabel}</p>
            ) : null}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Sprout size={18} strokeWidth={2.2} />
          </div>
        </div>
      </div>

      <div className="relative min-h-[148px] px-4 py-3.5">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <ProcessLoader />
          </div>
        ) : error && crops.length === 0 ? (
          <p className="py-4 text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="space-y-3">
              {crops.map((crop) => {
                const meta = cropMeta(crop.key);
                return (
                  <div key={crop.key}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="text-[13px] font-semibold text-slate-800">{meta.label}</span>
                    </div>
                    <p className="mt-1 pl-[18px] text-[22px] font-bold leading-none tracking-tight text-slate-900">
                      {formatHa(crop.ha)}
                      <span className="ml-1 text-[13px] font-semibold text-slate-500">{unitLabel}</span>
                    </p>
                    {crop.plots != null ? (
                      <p className="mt-1 pl-[18px] text-[12px] text-slate-500">
                        {formatCount(crop.plots)} identified plots
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {crops.length > 1 && totalHa != null ? (
              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">All crops</p>
                <p className="mt-0.5 text-[15px] font-bold text-slate-900">
                  {formatHa(totalHa)} {unitLabel}
                </p>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Plots</p>
                <p className="mt-0.5 text-[13px] font-bold text-slate-800">
                  {totalPlots != null ? formatCount(totalPlots) : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/80">Districts</p>
                <p className="mt-0.5 text-[13px] font-bold text-emerald-900">
                  {districtsWithData != null && districtsCount != null
                    ? `${formatCount(districtsWithData)} / ${formatCount(districtsCount)}`
                    : '—'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </button>
  );
};

export default MaharashtraCropAreaCard;
