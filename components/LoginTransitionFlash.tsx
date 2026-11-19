import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Scan, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchMaharashtraCropwise,
  fetchStoredDistrictsLatest,
  formatPredictAreaMonthLabel,
  getCurrentPredictAreaMonth,
  type StoredDistrictAnalysisBlock,
  type StoredDistrictLatestItem,
} from '../services/analysisService';
import { officialDistrictDisplay } from '../utils/officialAdminNames';

export interface LoginTransitionFlashProps {
  districts: Array<{ district: string }>;
  districtsLoading?: boolean;
  /** YYYY-MM for /api-stored/districts/latest — defaults to current month */
  month?: string;
  /** Sugarcane login: show only sugarcane crop area on cards */
  sugarcaneOnly?: boolean;
  /** Notify parent when splash month changes (keeps predict-area in sync) */
  onMonthChange?: (month: string) => void;
  /** Called when user picks a district tab */
  onSelectDistrict: (district: string) => void;
  /** Called after brief flash, when main window should show */
  onComplete: () => void;
}

function formatPct(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  return `${pct.toLocaleString(undefined, { maximumFractionDigits: 2 })} %`;
}

const GROWTH_CARD_ORDER = ['Weak', 'Stress', 'Moderate', 'Healthy'] as const;

function getGrowthClassRows(
  block: StoredDistrictAnalysisBlock | null | undefined
): Array<{ label: string; pct: number | null; color: string }> {
  const list = block?.response_data?.classwise;
  const byKey = new Map<string, { pct: number | null; color: string; label: string }>();
  if (Array.isArray(list)) {
    list.forEach((c, i) => {
      const label = (c.class_name || '').trim();
      if (!label) return;
      const key = seriesKey(label);
      const pct =
        typeof c.percentage === 'number' && !Number.isNaN(c.percentage) ? c.percentage : null;
      byKey.set(key, {
        label: titleCase(label),
        pct,
        color: colorForClass(label, c.color, i),
      });
    });
  }
  return GROWTH_CARD_ORDER.map((name, i) => {
    const hit = byKey.get(seriesKey(name));
    return {
      label: name,
      pct: hit?.pct ?? null,
      color: hit?.color || colorForClass(name, undefined, i),
    };
  });
}

function shortDistrict(name: string): string {
  if (name.length <= 10) return name;
  return `${name.slice(0, 8)}…`;
}

function titleCase(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const FALLBACK_CLASS_COLORS: Record<string, string> = {
  weak: '#bc1e29',
  stress: '#58cf54',
  moderate: '#28ae31',
  healthy: '#00351d',
  deficient: '#EBFF34',
  less: '#CC8213',
  adequat: '#1348E8',
  adequate: '#4365D4',
  excellent: '#473CDF',
  excess: '#2116BF',
  shallow_water: '#000475',
  wilt: '#ef4444',
  fungi: '#f97316',
  chewing: '#eab308',
  sucking: '#06b6d4',
  soilborne: '#a855f7',
};

const SERIES_FALLBACK = ['#059669', '#0891b2', '#7c3aed', '#d97706', '#dc2626', '#2563eb', '#64748b'];

type SeriesMeta = { key: string; label: string; color: string };
type GroupedRow = { district: string; short: string } & Record<string, string | number>;
type SingleRow = { district: string; short: string; value: number };

function seriesKey(className: string): string {
  return className.trim().toLowerCase().replace(/\s+/g, '_');
}

function colorForClass(className: string, apiColor?: string, index = 0): string {
  if (apiColor && /^#|rgb/i.test(apiColor.trim())) {
    // Strip alpha-heavy hex like #CC8213AF → #CC8213 when 8+ chars after #
    const c = apiColor.trim();
    if (c.startsWith('#') && c.length === 9) return c.slice(0, 7);
    return c;
  }
  const key = seriesKey(className);
  return FALLBACK_CLASS_COLORS[key] || SERIES_FALLBACK[index % SERIES_FALLBACK.length];
}

/** Build grouped % bars from response_data.classwise (Growth / Water / Soil). */
function buildClasswiseGrouped(
  items: StoredDistrictLatestItem[],
  pick: (d: StoredDistrictLatestItem) => StoredDistrictAnalysisBlock | null | undefined,
  preferredOrder: string[]
): { rows: GroupedRow[]; series: SeriesMeta[] } {
  const colorByKey = new Map<string, string>();
  const labelByKey = new Map<string, string>();
  const keySet = new Set<string>();

  items.forEach((d) => {
    const list = pick(d)?.response_data?.classwise;
    if (!Array.isArray(list)) return;
    list.forEach((c, i) => {
      const name = (c.class_name || `class_${c.class_id ?? i}`).trim();
      if (!name) return;
      const key = seriesKey(name);
      keySet.add(key);
      if (!labelByKey.has(key)) labelByKey.set(key, titleCase(name));
      if (!colorByKey.has(key)) colorByKey.set(key, colorForClass(name, c.color, i));
    });
  });

  const preferredKeys = preferredOrder.map((n) => seriesKey(n));
  const keys = [
    ...preferredKeys.filter((k) => keySet.has(k)),
    ...Array.from(keySet).filter((k) => !preferredKeys.includes(k)),
  ];

  const series: SeriesMeta[] = keys.map((key, i) => ({
    key,
    label: labelByKey.get(key) || titleCase(key),
    color: colorByKey.get(key) || SERIES_FALLBACK[i % SERIES_FALLBACK.length],
  }));

  const rows: GroupedRow[] = items
    .map((d) => {
      const name = officialDistrictDisplay(d.district || '');
      const row: GroupedRow = { district: name, short: shortDistrict(name) };
      keys.forEach((key) => {
        row[key] = 0;
      });
      const list = pick(d)?.response_data?.classwise;
      if (Array.isArray(list)) {
        list.forEach((c, i) => {
          const nameCls = (c.class_name || `class_${c.class_id ?? i}`).trim();
          const key = seriesKey(nameCls);
          const pct = typeof c.percentage === 'number' && !Number.isNaN(c.percentage) ? c.percentage : 0;
          row[key] = Number(pct.toFixed(2));
        });
      }
      return row;
    })
    .filter((r) => r.district)
    .sort((a, b) => {
      const ha = typeof a.healthy === 'number' ? a.healthy : 0;
      const hb = typeof b.healthy === 'number' ? b.healthy : 0;
      if (hb !== ha) return hb - ha;
      return String(a.district).localeCompare(String(b.district));
    });

  return { rows, series };
}

/** Pest uses hierarchy percentages (healthy, fungi, sucking, …). */
function buildPestGrouped(items: StoredDistrictLatestItem[]): {
  rows: GroupedRow[];
  series: SeriesMeta[];
} {
  const preferred = ['healthy', 'fungi', 'sucking', 'chewing', 'wilt', 'soilborne'];
  const keySet = new Set<string>();

  items.forEach((d) => {
    const hier = d.pest_detection?.response_data?.hierarchy;
    if (!hier) return;
    Object.keys(hier).forEach((k) => keySet.add(seriesKey(k)));
  });

  const keys = [
    ...preferred.filter((k) => keySet.has(k)),
    ...Array.from(keySet).filter((k) => !preferred.includes(k)),
  ];

  const series: SeriesMeta[] = keys.map((key, i) => ({
    key,
    label: titleCase(key),
    color: colorForClass(key, undefined, i),
  }));

  const rows: GroupedRow[] = items
    .map((d) => {
      const name = officialDistrictDisplay(d.district || '');
      const row: GroupedRow = { district: name, short: shortDistrict(name) };
      keys.forEach((key) => {
        row[key] = 0;
      });
      const hier = d.pest_detection?.response_data?.hierarchy;
      if (hier) {
        Object.entries(hier).forEach(([k, v]) => {
          const key = seriesKey(k);
          const pct = typeof v?.percentage === 'number' && !Number.isNaN(v.percentage) ? v.percentage : 0;
          row[key] = Number(pct.toFixed(2));
        });
      }
      return row;
    })
    .filter((r) => r.district)
    .sort((a, b) => {
      const ha = typeof a.healthy === 'number' ? a.healthy : 0;
      const hb = typeof b.healthy === 'number' ? b.healthy : 0;
      return hb - ha;
    });

  return { rows, series };
}

/**
 * District picker splash — top navbar + full-width cards + comparison charts.
 * Uses /api-stored/districts/latest (preloaded before login when possible).
 */
const LoginTransitionFlash: React.FC<LoginTransitionFlashProps> = ({
  districts,
  districtsLoading = false,
  month: monthProp,
  sugarcaneOnly = false,
  onMonthChange,
  onSelectDistrict,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'pick' | 'flash' | 'out'>('pick');
  const [picked, setPicked] = useState('');
  /** Always open on current calendar month (Nov 2026 → 2026-11); user can still change picker. */
  const [month, setMonth] = useState(() => getCurrentPredictAreaMonth());
  const [latestLoading, setLatestLoading] = useState(true);
  const [classwiseLoading, setClasswiseLoading] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [latestDistricts, setLatestDistricts] = useState<StoredDistrictLatestItem[]>([]);
  const [expandedChartId, setExpandedChartId] = useState<string | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onSelectRef = useRef(onSelectDistrict);
  onSelectRef.current = onSelectDistrict;
  const onMonthChangeRef = useRef(onMonthChange);
  onMonthChangeRef.current = onMonthChange;

  useEffect(() => {
    onMonthChangeRef.current?.(month);
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    setLatestLoading(true);
    setLatestError(null);
    setClasswiseLoading(true);

    const mergeRows = (
      stored: StoredDistrictLatestItem[],
      cropwiseDistricts: Array<{
        district: string;
        crop_areas_ha?: Record<string, number>;
        has_data?: boolean;
      }>
    ): StoredDistrictLatestItem[] => {
      const byKey = new Map<string, StoredDistrictLatestItem>();
      stored.forEach((d) => {
        const name = officialDistrictDisplay(d.district || '').trim();
        if (!name) return;
        byKey.set(name.toLowerCase(), { ...d, district: name });
      });
      cropwiseDistricts.forEach((row) => {
        const name = officialDistrictDisplay(row.district || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        const cane = row.crop_areas_ha?.sugarcane;
        const existing = byKey.get(key);
        const existingCane = existing?.cropwise_area?.crop_areas_ha?.sugarcane;
        const needsCane =
          existingCane == null ||
          (typeof existingCane === 'number' &&
            existingCane === 0 &&
            typeof cane === 'number' &&
            cane > 0);
        if (!existing) {
          byKey.set(key, {
            district: name,
            cropwise_area:
              typeof cane === 'number'
                ? {
                    district: name,
                    year_month: month,
                    crop_areas_ha: { sugarcane: cane },
                    total_crop_area_ha: cane,
                  }
                : null,
          });
          return;
        }
        if (needsCane && typeof cane === 'number') {
          byKey.set(key, {
            ...existing,
            cropwise_area: {
              ...(existing.cropwise_area || {}),
              district: name,
              year_month: existing.cropwise_area?.year_month || month,
              crop_areas_ha: {
                ...(existing.cropwise_area?.crop_areas_ha || {}),
                sugarcane: cane,
              },
              total_crop_area_ha: existing.cropwise_area?.total_crop_area_ha ?? cane,
            },
          });
        }
      });
      return Array.from(byKey.values()).sort((a, b) =>
        String(a.district).localeCompare(String(b.district))
      );
    };

    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      new Promise((resolve, reject) => {
        const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
        promise.then(
          (v) => {
            window.clearTimeout(t);
            resolve(v);
          },
          (e) => {
            window.clearTimeout(t);
            reject(e);
          }
        );
      });

    // 1) Fast path — Maharashtra cropwise fills sugarcane cards/chart first
    fetchMaharashtraCropwise(month, 'sugarcane')
      .then((crop) => {
        if (cancelled) return;
        const cropDistricts = crop.districts || [];
        const merged = mergeRows([], cropDistricts);
        setLatestDistricts(merged);
        const hasCane = merged.some(
          (d) => typeof d.cropwise_area?.crop_areas_ha?.sugarcane === 'number' && (d.cropwise_area?.crop_areas_ha?.sugarcane || 0) > 0
        );
        if (!hasCane) {
          setLatestError(`No sugarcane area stored for ${formatPredictAreaMonthLabel(month)}`);
        } else {
          setLatestError(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLatestError(err instanceof Error ? err.message : 'Maharashtra cropwise failed');
      })
      .finally(() => {
        if (!cancelled) setLatestLoading(false);
      });

    // 2) Slow path — classwise growth/water/soil (heavy); don't block cards
    withTimeout(fetchStoredDistrictsLatest(month, true), 25000, 'District classwise')
      .then((stored) => {
        if (cancelled) return;
        setLatestDistricts((prev) => mergeRows(stored.districts || [],
          prev.map((d) => ({
            district: d.district,
            crop_areas_ha: d.cropwise_area?.crop_areas_ha,
            has_data: true,
          }))
        ));
      })
      .catch(() => {
        /* keep cropwise-only view; classwise charts stay empty */
      })
      .finally(() => {
        if (!cancelled) setClasswiseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    if (!expandedChartId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedChartId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedChartId]);

  useEffect(() => {
    if (phase !== 'flash' || !picked) return;
    const tOut = window.setTimeout(() => setPhase('out'), 1400);
    const tDone = window.setTimeout(() => onCompleteRef.current(), 1900);
    return () => {
      window.clearTimeout(tOut);
      window.clearTimeout(tDone);
    };
  }, [phase, picked]);

  const byName = useMemo(() => {
    const map = new Map<string, StoredDistrictLatestItem>();
    latestDistricts.forEach((d) => {
      if (d?.district) {
        const key = officialDistrictDisplay(d.district).trim().toLowerCase();
        map.set(key, { ...d, district: officialDistrictDisplay(d.district) });
      }
    });
    return map;
  }, [latestDistricts]);

  const displayDistricts = useMemo(() => {
    // Only districts with computed/stored sugarcane (Google EE–backed store)
    const withCane = latestDistricts.filter((d) => {
      const cane = d.cropwise_area?.crop_areas_ha?.sugarcane;
      return typeof cane === 'number' && !Number.isNaN(cane) && cane > 0;
    });
    if (withCane.length > 0) {
      return withCane
        .map((d) => officialDistrictDisplay(d.district))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    }
    // While loading, avoid rendering the full empty district grid
    if (latestLoading) return [];
    return [];
  }, [latestDistricts, latestLoading]);

  const chartBundles = useMemo(() => {
    const sugarcaneArea: SingleRow[] = latestDistricts
      .map((d) => {
        const name = officialDistrictDisplay(d.district || '');
        const cane = d.cropwise_area?.crop_areas_ha?.sugarcane;
        return {
          district: name,
          short: shortDistrict(name),
          value: typeof cane === 'number' && !Number.isNaN(cane) ? Number(cane.toFixed(1)) : 0,
        };
      })
      .filter((r) => r.district && r.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      sugarcaneArea,
      growth: buildClasswiseGrouped(latestDistricts, (d) => d.growth, [
        'Weak',
        'Stress',
        'Moderate',
        'Healthy',
      ]),
      water: buildClasswiseGrouped(latestDistricts, (d) => d.water_uptake, [
        'Deficient',
        'Less',
        'Adequat',
        'Adequate',
        'Excellent',
        'Excess',
      ]),
      soil: buildClasswiseGrouped(latestDistricts, (d) => d.soil_moisture, [
        'less',
        'adequate',
        'excellent',
        'excess',
        'shallow_water',
      ]),
      pest: buildPestGrouped(latestDistricts),
    };
  }, [latestDistricts]);

  const handlePick = (name: string) => {
    if (phase !== 'pick') return;
    setPicked(name);
    onSelectRef.current(name);
    setPhase('flash');
  };

  const renderSingleChart = (
    chartId: string,
    title: string,
    subtitle: string,
    data: SingleRow[],
    unit: string,
    expanded = false
  ) => (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${
        expanded ? 'flex h-full min-h-0 flex-col' : ''
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <h4 className={`font-bold text-slate-900 ${expanded ? 'text-xl md:text-2xl' : 'text-base md:text-lg'}`}>
            {title}
          </h4>
          <p className={`text-slate-500 ${expanded ? 'text-base' : 'text-sm'}`}>{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpandedChartId(expanded ? null : chartId)}
          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
          title={expanded ? 'Exit fullscreen' : 'Expand chart'}
          aria-label={expanded ? 'Exit fullscreen' : 'Expand chart'}
        >
          {expanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No data</p>
      ) : (
        <div className={expanded ? 'min-h-0 w-full flex-1' : 'h-[280px] w-full md:h-[320px]'}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 56 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="short"
                tick={{ fill: '#334155', fontSize: expanded ? 14 : 12, fontWeight: 600 }}
                interval={0}
                angle={-40}
                textAnchor="end"
                height={expanded ? 72 : 64}
              />
              <YAxis tick={{ fill: '#334155', fontSize: expanded ? 15 : 13, fontWeight: 600 }} width={56} />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  color: '#0f172a',
                  fontSize: 14,
                  fontWeight: 600,
                }}
                formatter={(value: number) => [`${value} ${unit}`, title]}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as SingleRow | undefined;
                  return row?.district || '';
                }}
              />
              <Bar
                dataKey="value"
                fill="#059669"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data) => {
                  const district =
                    data && typeof data === 'object' && 'district' in data
                      ? String((data as SingleRow).district || '')
                      : '';
                  if (district) handlePick(district);
                }}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill="#059669" fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  const renderGroupedChart = (
    chartId: string,
    title: string,
    subtitle: string,
    bundle: { rows: GroupedRow[]; series: SeriesMeta[] },
    unit: string,
    expanded = false
  ) => (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${
        expanded ? 'flex h-full min-h-0 flex-col' : ''
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <h4 className={`font-bold text-slate-900 ${expanded ? 'text-xl md:text-2xl' : 'text-base md:text-lg'}`}>
            {title}
          </h4>
          <p className={`text-slate-500 ${expanded ? 'text-base' : 'text-sm'}`}>{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpandedChartId(expanded ? null : chartId)}
          className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
          title={expanded ? 'Exit fullscreen' : 'Expand chart'}
          aria-label={expanded ? 'Exit fullscreen' : 'Expand chart'}
        >
          {expanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
      </div>
      {bundle.rows.length === 0 || bundle.series.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No data</p>
      ) : (
        <div className={expanded ? 'min-h-0 w-full flex-1' : 'h-[300px] w-full md:h-[360px]'}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={bundle.rows}
              margin={{ top: 12, right: 12, left: 4, bottom: 56 }}
              barCategoryGap="18%"
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="short"
                tick={{ fill: '#334155', fontSize: expanded ? 14 : 12, fontWeight: 600 }}
                interval={0}
                angle={-40}
                textAnchor="end"
                height={expanded ? 72 : 64}
              />
              <YAxis
                tick={{ fill: '#334155', fontSize: expanded ? 15 : 13, fontWeight: 600 }}
                width={56}
                label={
                  unit === '%'
                    ? { value: '%', angle: -90, position: 'insideLeft', style: { fill: '#64748b' } }
                    : undefined
                }
              />
              <Tooltip
                contentStyle={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  color: '#0f172a',
                  fontSize: 13,
                  fontWeight: 600,
                }}
                formatter={(value: number, name: string) => {
                  const meta = bundle.series.find((s) => s.key === name || s.label === name);
                  return [`${value} ${unit}`, meta?.label || name];
                }}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as GroupedRow | undefined;
                  return row?.district || '';
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: expanded ? 15 : 13, fontWeight: 600, paddingTop: 4 }}
                formatter={(value) => {
                  const meta = bundle.series.find((s) => s.key === value || s.label === value);
                  return meta?.label || value;
                }}
              />
              {bundle.series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  cursor="pointer"
                  onClick={(data) => {
                    const district =
                      data && typeof data === 'object' && 'district' in data
                        ? String((data as GroupedRow).district || '')
                        : '';
                    if (district) handlePick(district);
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  const expandedChart =
    expandedChartId === 'sugarcane'
      ? renderSingleChart(
          'sugarcane',
          'Sugarcane area',
          'crop_areas_ha.sugarcane (ha)',
          chartBundles.sugarcaneArea,
          'ha',
          true
        )
      : expandedChartId === 'growth'
        ? renderGroupedChart(
            'growth',
            'Growth',
            'classwise % — Weak, Stress, Moderate, Healthy',
            chartBundles.growth,
            '%',
            true
          )
        : expandedChartId === 'water'
          ? renderGroupedChart(
              'water',
              'Water uptake',
              'classwise % — Deficient, Less, Adequat, Excellent, Excess',
              chartBundles.water,
              '%',
              true
            )
          : expandedChartId === 'soil'
            ? renderGroupedChart(
                'soil',
                'Soil moisture',
                'classwise % — less, adequate, excellent, excess, shallow_water',
                chartBundles.soil,
                '%',
                true
              )
            : expandedChartId === 'pest'
              ? renderGroupedChart(
                  'pest',
                  'Pest detection',
                  'hierarchy % — Healthy, Fungi, Sucking, Chewing, Wilt, Soilborne',
                  chartBundles.pest,
                  '%',
                  true
                )
              : null;

  return (
    <div
      className={`login-flash-overlay fixed inset-0 z-[100000] flex flex-col overflow-y-auto bg-white transition-opacity duration-500 ${
        phase === 'out' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ backgroundColor: '#ffffff' }}
      aria-live="polite"
      aria-label="Select district"
    >
      {phase === 'pick' ? (
        <>
          {/* Top navbar: title + month on one line */}
          <header className="sticky top-0 z-20 flex w-full shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:px-6">
            <div className="min-w-0 text-left">
              <div className="truncate text-lg font-extrabold tracking-tight text-slate-900 md:text-xl">
                Nearlive Crop Monitoring
              </div>
              <div className="truncate text-xs font-medium text-slate-500 md:text-sm">
                Sugarcane stored districts · {formatPredictAreaMonthLabel(month)}
                {latestLoading ? ' · loading areas…' : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <label className="hidden text-xs font-semibold uppercase tracking-wider text-slate-500 sm:block">
                Month
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => {
                  const next = e.target.value;
                  if (/^\d{4}-\d{2}$/.test(next)) setMonth(next);
                }}
                className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 md:text-base"
                aria-label="Prediction month"
              />
            </div>
          </header>

          {/* Full-width page content */}
          <div className="flex w-full flex-1 flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
            <section className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 md:p-4">
              {districtsLoading || (latestLoading && displayDistricts.length === 0) ? (
                <div className="flex items-center justify-center gap-2 py-12 text-base text-slate-600">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  Loading districts…
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                  {displayDistricts.map((name) => {
                    const row = byName.get(name.trim().toLowerCase());
                    const growthRows = getGrowthClassRows(row?.growth);
                    const caneHa = row?.cropwise_area?.crop_areas_ha?.sugarcane;
                    const caneLabel =
                      typeof caneHa === 'number' && !Number.isNaN(caneHa)
                        ? `${caneHa.toLocaleString(undefined, {
                            maximumFractionDigits: caneHa >= 100 ? 0 : 1,
                          })} ha`
                        : '—';
                    const hasGrowth = growthRows.some((g) => g.pct != null);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handlePick(name)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-slate-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 md:px-4 md:py-3.5"
                      >
                        <div className="text-base font-bold leading-tight md:text-lg">{name}</div>
                        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-semibold text-emerald-700">Sugarcane</span>
                          <span className="font-bold text-slate-900">{caneLabel}</span>
                        </div>
                        {!sugarcaneOnly && hasGrowth && (
                          <div className="mt-2 space-y-1 text-sm leading-snug md:text-[15px]">
                            {growthRows.map((g) => (
                              <div key={g.label} className="flex items-baseline justify-between gap-2">
                                <span className="font-semibold" style={{ color: g.color }}>
                                  {g.label}
                                </span>
                                <span className="font-bold text-slate-900">{formatPct(g.pct)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {(latestLoading || classwiseLoading) && displayDistricts.length > 0 ? (
                <p className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  {latestLoading
                    ? 'Loading sugarcane areas…'
                    : 'Loading growth / water / soil (optional)…'}
                </p>
              ) : null}
              {latestError ? (
                <p className="mt-3 text-center text-sm text-amber-700">{latestError}</p>
              ) : null}
            </section>

            {/* Stored sugarcane + classwise charts for selected month (Google EE–backed store) */}
            <section className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
              {renderSingleChart(
                'sugarcane',
                `Sugarcane area · ${formatPredictAreaMonthLabel(month)}`,
                'Stored district crop_areas_ha.sugarcane (ha)',
                chartBundles.sugarcaneArea,
                'ha'
              )}
              {!sugarcaneOnly &&
                renderGroupedChart(
                  'growth',
                  'Growth',
                  'classwise % — Weak, Stress, Moderate, Healthy',
                  chartBundles.growth,
                  '%'
                )}
              {!sugarcaneOnly &&
                renderGroupedChart(
                  'water',
                  'Water uptake',
                  'classwise % — Deficient, Less, Adequate, Excellent, Excess',
                  chartBundles.water,
                  '%'
                )}
              {!sugarcaneOnly &&
                renderGroupedChart(
                  'soil',
                  'Soil moisture',
                  'classwise % — less, adequate, excellent, excess',
                  chartBundles.soil,
                  '%'
                )}
            </section>
          </div>

          {expandedChart ? (
            <div
              className="fixed inset-0 z-[10050] flex items-stretch bg-slate-900/50 p-3 md:p-6"
              role="dialog"
              aria-modal="true"
              onClick={() => setExpandedChartId(null)}
            >
              <div
                className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="min-h-0 flex-1 p-3 md:p-5">{expandedChart}</div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <div className="rounded-2xl border border-emerald-200 bg-white px-8 py-5 shadow-md">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 md:text-sm">
              Selected district
            </div>
            <div className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
              {picked}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600 md:text-base">
            <Scan className="h-5 w-5 animate-spin text-emerald-600" />
            Loading map…
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginTransitionFlash;
