import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import ProcessLoader from './ProcessLoader';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchMaharashtraCropwise,
  formatPredictAreaMonthLabel,
  type MaharashtraCropwiseResponse,
} from '../services/analysisService';

const CROP_LABELS: Record<string, string> = {
  sugarcane: 'Sugarcane',
  wheat: 'Jawar',
  onion: 'Soyabean',
  soyabean: 'Soyabean',
  mango: 'Mango',
  banana: 'Banana',
};

export interface StateCropAreaPageProps {
  isDarkMode: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  loading: boolean;
  error: string | null;
  data: MaharashtraCropwiseResponse | null;
  sidebarOpen: boolean;
}

function formatHa(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-IN');
}

function cropLabel(key: string): string {
  const normalized = key.trim().toLowerCase();
  return CROP_LABELS[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function monthsEndingAt(endYm: string, count: number): string[] {
  if (!/^\d{4}-\d{2}$/.test(endYm)) return [];
  const [yearText, monthText] = endYm.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(year, monthIndex - offset, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

interface DistrictMonthPoint {
  month: string;
  label: string;
  ha: number;
  plots: number;
}

function districtMonthPoint(
  response: MaharashtraCropwiseResponse,
  districtName: string
): DistrictMonthPoint | null {
  const target = districtName.trim().toLowerCase();
  const row = (response.districts || []).find(
    (district) => district.district.trim().toLowerCase() === target
  );
  if (!row || row.has_data === false) return null;
  const crop = (response.crop_name || 'sugarcane').trim().toLowerCase();
  const ha = row.crop_areas_ha?.[crop] ?? row.total_crop_area_ha;
  const plots = row.identified_plot_counts?.[crop] ?? row.total_identified_plots;
  if (typeof ha !== 'number' && typeof plots !== 'number') return null;
  const area = typeof ha === 'number' ? ha : 0;
  const plotCount = typeof plots === 'number' ? plots : 0;
  if (area <= 0 && plotCount <= 0) return null;
  return {
    month: response.month,
    label: formatPredictAreaMonthLabel(response.month),
    ha: area,
    plots: plotCount,
  };
}

const StateCropAreaPage: React.FC<StateCropAreaPageProps> = ({
  isDarkMode,
  month,
  onMonthChange,
  loading,
  error,
  data,
  sidebarOpen,
}) => {
  const monthHasData =
    !!data &&
    (data.districts_with_data ?? 0) > 0 &&
    (data.total_crop_area_ha ?? 0) > 0;

  const cropKey = (data?.crop_name || 'sugarcane').trim().toLowerCase();
  const rows = (data?.districts ?? [])
    .map((district) => ({
      district: district.district,
      ha: Number(district.total_crop_area_ha ?? district.crop_areas_ha?.[cropKey] ?? 0),
      plots: Number(district.total_identified_plots ?? district.identified_plot_counts?.[cropKey] ?? 0),
    }))
    .filter((row) => row.ha > 0)
    .sort((a, b) => b.ha - a.ha);

  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [monthSeries, setMonthSeries] = useState<DistrictMonthPoint[]>([]);
  const [monthSeriesLoading, setMonthSeriesLoading] = useState(false);
  const [monthSeriesError, setMonthSeriesError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDistrict) return;
    const crop = (data?.crop_name || 'sugarcane').trim();
    const months = monthsEndingAt(month, 12);
    if (months.length === 0) return;

    let cancelled = false;
    setMonthSeriesLoading(true);
    setMonthSeriesError(null);
    setMonthSeries([]);

    Promise.allSettled(months.map((item) => fetchMaharashtraCropwise(item, crop)))
      .then((settled) => {
        if (cancelled) return;
        const points = settled
          .filter((result): result is PromiseFulfilledResult<MaharashtraCropwiseResponse> => result.status === 'fulfilled')
          .map((result) => districtMonthPoint(result.value, selectedDistrict))
          .filter((point): point is DistrictMonthPoint => point != null)
          .sort((a, b) => a.month.localeCompare(b.month));
        setMonthSeries(points);
        if (points.length === 0) {
          setMonthSeriesError('Right now this district data is not available for these months.');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMonthSeries([]);
          setMonthSeriesError(err instanceof Error ? err.message : 'Failed to load district months');
        }
      })
      .finally(() => {
        if (!cancelled) setMonthSeriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDistrict, month, data?.crop_name]);

  const openDistrict = (districtName: string) => {
    if (districtName.trim()) setSelectedDistrict(districtName.trim());
  };

  const chartHeight = Math.max(420, rows.length * 28);
  const cardClass = isDarkMode
    ? 'border-gray-700 bg-gray-800/80'
    : 'border-emerald-100 bg-white shadow-sm';
  const titleClass = isDarkMode ? 'text-gray-100' : 'text-slate-800';
  const mutedClass = isDarkMode ? 'text-gray-400' : 'text-slate-500';

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-auto ${isDarkMode ? 'bg-gray-950' : 'bg-[#eaf6f0]'} ${
        sidebarOpen ? 'pl-[17.25rem]' : ''
      }`}
    >
      <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className={`text-xl font-bold ${titleClass}`}>
              {data?.state || 'Maharashtra'} crop area
            </h2>
            <p className={`mt-1 text-sm ${mutedClass}`}>
              District comparison · {cropLabel(cropKey)} · {formatPredictAreaMonthLabel(month)}
            </p>
          </div>
          <label className="block">
            <span className={`mb-1 block text-[11px] font-semibold uppercase tracking-wider ${mutedClass}`}>
              Month
            </span>
            <input
              type="month"
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
              className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                isDarkMode
                  ? 'border-gray-600 bg-gray-800 text-white [color-scheme:dark]'
                  : 'border-emerald-100 bg-white text-slate-800'
              }`}
            />
          </label>
        </div>

        {loading ? (
          <div className={`flex items-center justify-center rounded-xl border px-4 py-16 ${cardClass}`}>
            <ProcessLoader />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">{error}</div>
        ) : !monthHasData ? (
          <div className={`rounded-xl border px-6 py-10 text-center ${cardClass}`}>
            <p className={`text-base font-semibold ${titleClass}`}>
              Right now this month data is not available. Please select another month.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className={`rounded-xl border px-4 py-3 ${cardClass}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${mutedClass}`}>
                  {cropLabel(cropKey)} area
                </p>
                <p className={`mt-1 text-2xl font-bold ${titleClass}`}>
                  {formatHa(data?.total_crop_area_ha ?? 0)}
                  <span className={`ml-1 text-sm font-semibold ${mutedClass}`}>{data?.unit || 'ha'}</span>
                </p>
              </div>
              <div className={`rounded-xl border px-4 py-3 ${cardClass}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${mutedClass}`}>Identified plots</p>
                <p className={`mt-1 text-2xl font-bold ${titleClass}`}>
                  {formatCount(data?.total_identified_plots ?? 0)}
                </p>
              </div>
              <div className={`rounded-xl border px-4 py-3 ${cardClass}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${mutedClass}`}>Districts with data</p>
                <p className={`mt-1 text-2xl font-bold ${titleClass}`}>
                  {formatCount(data?.districts_with_data ?? 0)}
                  <span className={`ml-1 text-sm font-semibold ${mutedClass}`}>
                    / {formatCount(data?.districts_count ?? 0)}
                  </span>
                </p>
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${cardClass}`}>
              <h3 className={`mb-1 text-base font-bold ${titleClass}`}>District crop area (ha)</h3>
              <p className={`mb-3 text-xs ${mutedClass}`}>Click a district bar to open 12 months.</p>
              <div style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                    <XAxis type="number" tick={{ fill: isDarkMode ? '#d1d5db' : '#374151', fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="district"
                      width={120}
                      tick={{ fill: isDarkMode ? '#d1d5db' : '#374151', fontSize: 11 }}
                    />
                    <Tooltip formatter={(value: number) => [`${formatHa(Number(value))} ha`, 'Area']} />
                    <Bar
                      dataKey="ha"
                      fill="#2563eb"
                      radius={[0, 3, 3, 0]}
                      cursor="pointer"
                      onClick={(bar) => openDistrict(String(bar?.payload?.district || ''))}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={`rounded-xl border p-4 ${cardClass}`}>
              <h3 className={`mb-1 text-base font-bold ${titleClass}`}>District identified plots</h3>
              <p className={`mb-3 text-xs ${mutedClass}`}>Click a district bar to open 12 months.</p>
              <div style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...rows].sort((a, b) => b.plots - a.plots)}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                    <XAxis type="number" tick={{ fill: isDarkMode ? '#d1d5db' : '#374151', fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="district"
                      width={120}
                      tick={{ fill: isDarkMode ? '#d1d5db' : '#374151', fontSize: 11 }}
                    />
                    <Tooltip formatter={(value: number) => [formatCount(Number(value)), 'Plots']} />
                    <Bar
                      dataKey="plots"
                      fill="#0f766e"
                      radius={[0, 3, 3, 0]}
                      cursor="pointer"
                      onClick={(bar) => openDistrict(String(bar?.payload?.district || ''))}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>

      {selectedDistrict && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close district months"
            onClick={() => setSelectedDistrict(null)}
          />
          <div
            className={`relative z-[1] flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${
              isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-emerald-100 bg-white'
            }`}
          >
            <div className={`flex items-start justify-between gap-3 border-b px-5 py-4 ${isDarkMode ? 'border-gray-700' : 'border-emerald-100'}`}>
              <div>
                <h3 className={`text-lg font-bold ${titleClass}`}>{selectedDistrict}</h3>
                <p className={`mt-0.5 text-sm ${mutedClass}`}>
                  {cropLabel(cropKey)} · last 12 months ending {formatPredictAreaMonthLabel(month)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDistrict(null)}
                className={`rounded-lg p-1.5 ${isDarkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-slate-600 hover:bg-emerald-50'}`}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
              {monthSeriesLoading ? (
                <div className="flex items-center justify-center gap-3 py-16">
                  <Loader2 className={`animate-spin ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} size={22} />
                  <span className={`text-sm ${mutedClass}`}>Loading {selectedDistrict} months…</span>
                </div>
              ) : monthSeriesError ? (
                <p className={`py-10 text-center text-sm font-semibold ${titleClass}`}>{monthSeriesError}</p>
              ) : (
                <>
                  <div>
                    <h4 className={`mb-2 text-sm font-bold ${titleClass}`}>Crop area (ha)</h4>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthSeries} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                          <XAxis
                            dataKey="label"
                            interval={0}
                            angle={monthSeries.length > 6 ? -35 : 0}
                            textAnchor={monthSeries.length > 6 ? 'end' : 'middle'}
                            height={monthSeries.length > 6 ? 70 : 36}
                            tick={{ fill: isDarkMode ? '#d1d5db' : '#374151', fontSize: 11 }}
                          />
                          <YAxis tick={{ fill: isDarkMode ? '#d1d5db' : '#374151', fontSize: 11 }} />
                          <Tooltip formatter={(value: number) => [`${formatHa(Number(value))} ha`, 'Area']} />
                          <Bar dataKey="ha" fill="#2563eb" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <h4 className={`mb-2 text-sm font-bold ${titleClass}`}>Identified plots</h4>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthSeries} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                          <XAxis
                            dataKey="label"
                            interval={0}
                            angle={monthSeries.length > 6 ? -35 : 0}
                            textAnchor={monthSeries.length > 6 ? 'end' : 'middle'}
                            height={monthSeries.length > 6 ? 70 : 36}
                            tick={{ fill: isDarkMode ? '#d1d5db' : '#374151', fontSize: 11 }}
                          />
                          <YAxis tick={{ fill: isDarkMode ? '#d1d5db' : '#374151', fontSize: 11 }} />
                          <Tooltip formatter={(value: number) => [formatCount(Number(value)), 'Plots']} />
                          <Bar dataKey="plots" fill="#0f766e" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StateCropAreaPage;
