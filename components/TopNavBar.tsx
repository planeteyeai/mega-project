import React from 'react';
import { CloudSun, Droplets, Download, FileSpreadsheet, FileText, Loader2, ArrowLeft, Map, LayoutDashboard, Landmark, Wind, Thermometer } from 'lucide-react';
import type { WeatherDailyResponse } from '../services/analysisService';

export type TopNavView = 'map' | 'dashboard' | 'state';

export interface TopNavBarProps {
  isDarkMode: boolean;
  activeView: TopNavView;
  onMapExplore: () => void;
  onDashboard: () => void;
  onState: () => void;
  weatherData: WeatherDailyResponse | null;
  weatherLoading: boolean;
  weatherError: string | null;
  weatherLocation: string;
  showDownloadMenu: boolean;
  onToggleDownloadMenu: () => void;
  onDownloadPdf: () => void;
  onDownloadExcel: () => void;
  /** Return to district selection splash */
  onBack: () => void;
}

function todayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatWeatherDay(dateStr: string): string {
  const parts = (dateStr || '').split('-');
  if (parts.length !== 3) return dateStr || '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = Number(parts[1]) - 1;
  const month = months[monthIdx] || parts[1];
  return `${Number(parts[2])} ${month}`;
}

function formatNum(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(digits);
}

const TopNavBar: React.FC<TopNavBarProps> = ({
  isDarkMode,
  activeView,
  onMapExplore,
  onDashboard,
  onState,
  weatherData,
  weatherLoading,
  weatherError,
  weatherLocation,
  showDownloadMenu,
  onToggleDownloadMenu,
  onDownloadPdf,
  onDownloadExcel,
  onBack,
}) => {
  const locationLabel =
    (weatherData?.name && String(weatherData.name).trim()) ||
    (weatherLocation && weatherLocation !== '—' ? weatherLocation : '');

  const todayKey = todayDateKey();
  const today =
    weatherData?.daily?.find((d) => d.date === todayKey) ??
    weatherData?.daily?.[0] ??
    null;

  const navBtn = (active: boolean) =>
    `px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      active
        ? isDarkMode
          ? 'bg-emerald-500 text-gray-900'
          : 'bg-emerald-600 text-white shadow-sm'
        : isDarkMode
          ? 'text-gray-300 hover:bg-gray-700/80'
          : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'
    }`;

  const valueColor = isDarkMode ? 'text-white' : 'text-black';
  const mutedColor = isDarkMode ? 'text-gray-400' : 'text-black/70';

  const renderMarqueePass = (suffix: string) => {
    if (!today) return null;
    return (
      <span
        key={suffix}
        className={`inline-flex items-center gap-3.5 whitespace-nowrap pr-14 text-sm md:text-base font-medium ${valueColor}`}
      >
        {locationLabel ? (
          <span className={`text-base md:text-lg font-bold ${valueColor}`}>
            {locationLabel}
          </span>
        ) : null}
        {locationLabel ? <span className={isDarkMode ? 'text-gray-500' : 'text-black/30'}>•</span> : null}
        <span className={mutedColor}>{formatWeatherDay(today.date)}</span>
        <span className={`inline-flex items-center gap-1.5 ${valueColor}`}>
          <Thermometer size={22} className="text-orange-500 shrink-0" />
          {formatNum(today.temp_max)}°/{formatNum(today.temp_min)}°C
        </span>
        <span className={`inline-flex items-center gap-1.5 ${valueColor}`}>
          <Droplets size={22} className="text-sky-500 shrink-0" />
          {formatNum(today.rainfall)} mm
        </span>
        <span className={`inline-flex items-center gap-1.5 ${valueColor}`}>
          <Wind size={22} className="text-emerald-500 shrink-0" />
          {formatNum(today.wind_max)}
        </span>
      </span>
    );
  };

  return (
    <header
      className={`flex-shrink-0 z-30 grid grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1.4fr)] items-center gap-2 md:gap-3 px-3 md:px-6 h-16 border-b ${
        isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-emerald-100 bg-white shadow-sm'
      }`}
    >
      {/* Left — project branding */}
      <div className="min-w-0 justify-self-start">
        <div className="leading-tight">
          <div className={`text-xl md:text-2xl font-extrabold tracking-tight truncate brand-name-blink ${isDarkMode ? 'text-white' : 'text-emerald-900'}`}>
            <span className={isDarkMode ? 'text-emerald-400' : 'text-emerald-800'}>Nearlive</span>{' '}
            <span className={isDarkMode ? 'text-emerald-300' : 'text-emerald-600'}>Crop Monitoring</span>
          </div>
          <div className={`text-[11px] md:text-xs tracking-[0.28em] font-semibold uppercase ${isDarkMode ? 'text-gray-500' : 'text-slate-400'}`}>
            Precision Intelligence
          </div>
        </div>
      </div>

      {/* Center — navigation */}
      <nav
        className={`justify-self-center flex items-center gap-1 p-1 rounded-xl border shrink-0 ${
          isDarkMode ? 'border-gray-700 bg-gray-800/80' : 'border-emerald-100 bg-emerald-50/60'
        }`}
      >
        <button type="button" onClick={onMapExplore} className={navBtn(activeView === 'map')}>
          <span className="inline-flex items-center gap-1.5">
            <Map size={15} />
            Map explore
          </span>
        </button>
        <button type="button" onClick={onDashboard} className={navBtn(activeView === 'dashboard')}>
          <span className="inline-flex items-center gap-1.5">
            <LayoutDashboard size={15} />
            Dashboard
          </span>
        </button>
        <button type="button" onClick={onState} className={navBtn(activeView === 'state')}>
          <span className="inline-flex items-center gap-1.5">
            <Landmark size={15} />
            State
          </span>
        </button>
      </nav>

      {/* Right — weather marquee + utilities */}
      <div className="justify-self-end flex items-center gap-2 md:gap-3 min-w-0 w-full max-w-full">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 px-1">
          <CloudSun size={26} className={isDarkMode ? 'text-sky-400 shrink-0' : 'text-sky-600 shrink-0'} />
          <div className="min-w-0 flex-1 overflow-hidden">
            {weatherLoading ? (
              <div className={`flex items-center gap-1.5 text-sm ${isDarkMode ? 'text-gray-400' : 'text-black'}`}>
                <Loader2 size={16} className="animate-spin" />
                Loading weather…
              </div>
            ) : weatherError ? (
              <div className="text-sm text-red-500 truncate">Weather unavailable</div>
            ) : today ? (
              <div className="weather-marquee">
                <div className="weather-marquee-track">
                  {renderMarqueePass('a')}
                  {renderMarqueePass('b')}
                </div>
              </div>
            ) : (
              <div className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-black/60'}`}>
                Select district / subdistrict / village
              </div>
            )}
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={onToggleDownloadMenu}
            className={`p-2 rounded-lg border transition-colors ${
              isDarkMode
                ? 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700'
                : 'border-emerald-100 bg-white text-gray-700 hover:bg-emerald-50'
            }`}
            title="Download"
          >
            <Download size={18} />
          </button>
          {showDownloadMenu && (
            <>
              <div className="fixed inset-0 z-[998]" onClick={onToggleDownloadMenu} />
              <div
                className={`absolute right-0 top-full mt-2 rounded-lg border shadow-xl overflow-hidden z-[1000] min-w-[120px] ${
                  isDarkMode ? 'border-gray-600 bg-gray-900' : 'border-emerald-100 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={onDownloadPdf}
                  className={`w-full px-3 py-2 flex items-center justify-center gap-2 text-xs transition-colors ${
                    isDarkMode ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-900 hover:bg-emerald-50'
                  }`}
                >
                  <FileText size={16} />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={onDownloadExcel}
                  className={`w-full px-3 py-2 flex items-center justify-center gap-2 text-xs border-t transition-colors ${
                    isDarkMode ? 'text-gray-200 hover:bg-gray-800 border-gray-700' : 'text-gray-900 hover:bg-emerald-50 border-emerald-100'
                  }`}
                >
                  <FileSpreadsheet size={16} />
                  Excel
                </button>
              </div>
            </>
          )}
        </div>
{/* 
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-semibold transition-colors shrink-0 ${
            isDarkMode
              ? 'border-gray-600 bg-gray-800 text-gray-200 hover:bg-gray-700 hover:border-emerald-500'
              : 'border-emerald-100 bg-white text-gray-700 hover:bg-emerald-50 hover:border-emerald-300'
          }`}
          title="Back to district list"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline"></span>
        </button> */}
      </div>
    </header>
  );
};

export default TopNavBar;
