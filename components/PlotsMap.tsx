import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, Tooltip, useMap } from 'react-leaflet';
import { Coordinate, Plot, LeafletCoordinate } from '../types';
import L from 'leaflet';
import { isFieldPlotId, resolveMapTileUrl, type WindDirectResponse } from '../services/analysisService';
import WindFlowOverlay from './WindFlowOverlay';

const GEE_CLIP_PANE = 'gee-clipped';

const isGeeXyzUrl = (url: string | null | undefined): url is string =>
  !!url && url.includes('{z}') && url.includes('{x}') && url.includes('{y}');

/** Absolute Leaflet URL. Classwise STAC paths are prefixed with the API base. */
const leafletTileUrl = (url: string): string => resolveMapTileUrl(url) ?? url;

const isClasswiseTile = (url: string): boolean => url.includes('/classwise-tiles/');

const plotIsSelected = (plot: Plot, selectedPlotId: string | null): boolean => {
  if (!selectedPlotId) return false;
  const sel = String(selectedPlotId);
  const selBase = sel.split('::')[0];
  const plotBase = String(plot.id || '').split('::')[0];
  return (
    plot.id === sel ||
    plotBase === selBase ||
    String(plot.fieldId || '') === sel ||
    String(plot.fieldId || '') === selBase
  );
};

const pickSelectedPlotTileUrl = (
  allPlotsTileUrls: Record<string, string>,
  tileUrl: string | null | undefined,
  plot: Plot | undefined,
  selectedPlotId: string | null
): string | null => {
  const keys = [
    selectedPlotId,
    plot?.id,
    plot?.id?.split('::')[0],
    plot?.fieldId,
    plot?.fieldId ? `field_${plot.fieldId}` : null,
  ].filter((k): k is string => !!k);
  for (const key of keys) {
    if (isGeeXyzUrl(allPlotsTileUrls[key])) return allPlotsTileUrls[key];
  }
  for (const [id, url] of Object.entries(allPlotsTileUrls)) {
    if (id === 'waterUptakeClass' || id.startsWith('wu-')) continue;
    if (isGeeXyzUrl(url)) return url;
  }
  return isGeeXyzUrl(tileUrl || null) ? tileUrl! : null;
};

function ensureGeeClipPane(map: L.Map): HTMLElement | undefined {
  try {
    const existing = map.getPane(GEE_CLIP_PANE);
    if (existing) return existing;
    if (!map.getPane('mapPane') && !map.getContainer()) return undefined;
    const pane = map.createPane(GEE_CLIP_PANE);
    pane.style.zIndex = '350';
    pane.style.pointerEvents = 'none';
    return pane;
  } catch {
    return undefined;
  }
}

/** Create the clip pane before any TileLayer tries to append into it. */
const EnsureGeeClipPane: React.FC = () => {
  const map = useMap();
  useLayoutEffect(() => {
    ensureGeeClipPane(map);
  }, [map]);
  ensureGeeClipPane(map);
  return null;
};

/** GEE analysis tiles clipped to the clicked field so other crop fills stay visible. */
const ClippedGeeTileLayer: React.FC<{ url: string; boundary: Coordinate[] }> = ({
  url,
  boundary,
}) => {
  const map = useMap();
  const pane = ensureGeeClipPane(map);
  const [paneReady, setPaneReady] = useState(() => !!pane);
  const clipKey = useMemo(
    () => boundary.map((c) => `${c[0]},${c[1]}`).join('|'),
    [boundary]
  );

  useLayoutEffect(() => {
    const el = ensureGeeClipPane(map);
    setPaneReady(!!el);
  }, [map]);

  useEffect(() => {
    const applyClip = () => {
      const el = map.getPane(GEE_CLIP_PANE);
      if (!el) return;
      if (!boundary || boundary.length < 3) {
        el.style.clipPath = 'none';
        el.style.setProperty('-webkit-clip-path', 'none');
        return;
      }
      const pts = boundary
        .filter((c) => Array.isArray(c) && c.length >= 2)
        .map((c) => map.latLngToLayerPoint([c[1], c[0]]));
      if (pts.length < 3) {
        el.style.clipPath = 'none';
        el.style.setProperty('-webkit-clip-path', 'none');
        return;
      }
      const value = `polygon(${pts.map((p) => `${Math.round(p.x)}px ${Math.round(p.y)}px`).join(', ')})`;
      el.style.clipPath = value;
      el.style.setProperty('-webkit-clip-path', value);
    };

    applyClip();
    map.on('move zoom viewreset zoomend moveend', applyClip);
    return () => {
      map.off('move zoom viewreset zoomend moveend', applyClip);
      const el = map.getPane(GEE_CLIP_PANE);
      if (el) {
        el.style.clipPath = 'none';
        el.style.setProperty('-webkit-clip-path', 'none');
      }
    };
  }, [map, url, clipKey, boundary]);

  if (!paneReady || !map.getPane(GEE_CLIP_PANE)) {
    return null;
  }

  const src = leafletTileUrl(url);
  const classwise = isClasswiseTile(src);
  return (
    <TileLayer
      url={src}
      pane={GEE_CLIP_PANE}
      maxZoom={18}
      maxNativeZoom={classwise ? 18 : 15}
      opacity={0.92}
      zIndex={350}
      updateWhenZooming={false}
      updateWhenIdle={true}
      keepBuffer={2}
      attribution={classwise ? 'Sentinel (AWS STAC)' : 'Google Earth Engine'}
    />
  );
};

interface WaterSource {
  id: string;
  coordinates: number[][];
  tile_url: string;
  water_pixel_percentage: number;
}

/** Predict-area crop fields: dark green border and fill */
const PREDICT_AREA_FIELD_STROKE = '#ffffff';
const PREDICT_AREA_FIELD_FILL = '#ffffff';
/** Outer village/district outline + inner field boundaries */
const BOUNDARY_STROKE = '#ff000d';

/** Default map: continental India (matches typical “open on India” satellite view) */
const INDIA_DEFAULT_CENTER: LeafletCoordinate = [20.5937, 78.9629];
const INDIA_DEFAULT_ZOOM = 5;

interface PlotsMapProps {
  plots: Plot[];
  selectedPlotId: string | null;
  onSelectPlot: (id: string) => void;
  tileUrl?: string | null;
  plotBounds?: L.LatLngBounds | null;
  allPlotsTileUrls?: Record<string, string>;
  showTileLayers?: boolean;
  /** When true, clip GEE analysis tiles to the clicked field and hide that field's crop fill. */
  showSelectedFieldAnalysisTile?: boolean;
  waterSources?: WaterSource[];
  onSelectWaterSource?: (id: string, data: WaterSource) => void;
  /** When set (e.g. from predict-area for selected crop), plot boundaries use this color */
  cropColor?: string | null;
  /** field_id -> field_area_ha from predict-area; shown on hover and in popup */
  fieldAreaByFieldId?: Record<string, number>;
  /** field_id -> fill hex when multiple crops ("All"); overrides cropColor for that field */
  fieldFillByFieldId?: Record<string, string>;
  /** When true, do not show Field ID / Area tooltip or popup (e.g. for district/subdistrict boundary only) */
  hideFieldIdAreaCard?: boolean;
  /** Open-Meteo wind AOI payload; when set with showWindFlowLayer, draws particles + markers on the map */
  windDirectPayload?: WindDirectResponse | null;
  showWindFlowLayer?: boolean;
  /** Cadastral plot metadata (survey no + owners) from village-data API */
  villagePlotMetaById?: Record<
    string,
    { plotNo: string; owners: Array<{ surveyNo: string; ownerName: string; khataNo: string; totalArea: number; potKharaba: number }> }
  >;
  /** Show permanent owner name labels on cadastral plots (village-data API) */
  showOwnerLabels?: boolean;
}

// Helper component to fit bounds when plots change (only on initial load, not after user interaction)
const MapBounds: React.FC<{ plots: Plot[]; plotBounds?: L.LatLngBounds | null }> = ({ plots, plotBounds }) => {
  const map = useMap();
  const hasInitialized = React.useRef(false);
  const userHasInteracted = React.useRef(false);
  const lastPlotsHash = React.useRef<string>('');

  // Track user interaction (zoom/pan) to prevent auto-fitting after manual zoom
  useEffect(() => {
    const handleZoom = () => {
      userHasInteracted.current = true;
    };
    const handleMove = () => {
      userHasInteracted.current = true;
    };

    map.on('zoomstart', handleZoom);
    map.on('movestart', handleMove);

    return () => {
      map.off('zoomstart', handleZoom);
      map.off('movestart', handleMove);
    };
  }, [map]);

  useEffect(() => {
    // Create a hash of plot IDs to detect when plots actually change (not just re-render)
    const plotsHash = plots.map(p => p.id).sort().join(',');
    // New district / subdistrict / village → allow auto-fly again (selection changed)
    if (lastPlotsHash.current !== '' && plotsHash !== lastPlotsHash.current) {
      userHasInteracted.current = false;
    }
    // Only fit bounds if:
    // 1. We haven't initialized yet AND user hasn't interacted, OR
    // 2. The plots have actually changed (different IDs) AND user hasn't interacted
    const shouldFitBounds = (!hasInitialized.current || plotsHash !== lastPlotsHash.current) && !userHasInteracted.current;
    
    if (shouldFitBounds) {
      // If plotBounds is provided, use it (for single plot with tile overlay)
      if (plotBounds && plotBounds.isValid()) {
        map.fitBounds(plotBounds, { padding: [50, 50] });
        hasInitialized.current = true;
        lastPlotsHash.current = plotsHash;
      } else if (plots.length > 0) {
        // Otherwise, calculate bounds from all plots
        const bounds = L.latLngBounds([]);
        plots.forEach(plot => {
          plot.boundary.forEach(coord => {
            // Input is [Lng, Lat], Leaflet needs [Lat, Lng]
            bounds.extend([coord[1], coord[0]]);
          });
        });
        
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50] });
          hasInitialized.current = true;
          lastPlotsHash.current = plotsHash;
        }
      }
    }
  }, [plots, plotBounds, map]);

  return null;
};

/** Recompute tile layout when the map panel is resized (fixes thin “strip” map). */
const MapLayoutFix: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const lastSize = { w: 0, h: 0 };
    let raf = 0;
    const applyFloorHeight = () => {
      const h = el.getBoundingClientRect().height;
      if (h < 280) {
        const target = Math.max(400, Math.floor(window.innerHeight * 0.62));
        if (el.style.minHeight !== `${target}px`) {
          el.style.minHeight = `${target}px`;
        }
      }
    };
    const invalidate = () => {
      applyFloorHeight();
      const { width, height } = el.getBoundingClientRect();
      const w = Math.round(width);
      const h = Math.round(height);
      if (Math.abs(w - lastSize.w) < 2 && Math.abs(h - lastSize.h) < 2) return;
      lastSize.w = w;
      lastSize.h = h;
      map.invalidateSize({ animate: false });
    };
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(invalidate);
    };
    const onWinResize = () => schedule();
    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);
    const root = el.closest('[data-plots-map-root]');
    if (root) ro.observe(root);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', onWinResize);
    const t1 = window.setTimeout(invalidate, 0);
    const t2 = window.setTimeout(invalidate, 200);
    const t3 = window.setTimeout(invalidate, 800);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onWinResize);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [map]);
  return null;
};

/** No field polygons: keep the broad India view. */
const MapDefaultIndia: React.FC<{
  plotBounds?: L.LatLngBounds | null;
  hasPolygons: boolean;
}> = ({ plotBounds, hasPolygons }) => {
  const map = useMap();
  useEffect(() => {
    if (hasPolygons) return;
    if (plotBounds && plotBounds.isValid()) return;
    map.setView(INDIA_DEFAULT_CENTER, INDIA_DEFAULT_ZOOM, { animate: false });
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [map, hasPolygons, plotBounds]);
  return null;
};

const PlotsMap: React.FC<PlotsMapProps> = ({ 
  plots, 
  selectedPlotId, 
  onSelectPlot, 
  tileUrl, 
  plotBounds,
  allPlotsTileUrls = {},
  showTileLayers = true,
  showSelectedFieldAnalysisTile = false,
  waterSources = [],
  onSelectWaterSource,
  cropColor = null,
  fieldAreaByFieldId = {},
  fieldFillByFieldId = {},
  hideFieldIdAreaCard = false,
  windDirectPayload = null,
  showWindFlowLayer = false,
  villagePlotMetaById = {},
  showOwnerLabels = false,
}) => {
  const hasFieldPolygons = plots.some(
    (p) => p.boundary && Array.isArray(p.boundary) && p.boundary.length >= 3
  );
  const hasNumericFieldPlots = plots.some(
    (p) => isFieldPlotId(p.id) && p.boundary && Array.isArray(p.boundary) && p.boundary.length >= 3
  );
  const selectedPlot = selectedPlotId
    ? plots.find((p) => plotIsSelected(p, selectedPlotId))
    : undefined;
  const clipTileToSelectedField = !!(
    showSelectedFieldAnalysisTile &&
    selectedPlot &&
    isFieldPlotId(selectedPlot.id) &&
    selectedPlot.boundary &&
    selectedPlot.boundary.length >= 3
  );
  const selectedFieldTileUrl = clipTileToSelectedField
    ? pickSelectedPlotTileUrl(allPlotsTileUrls, tileUrl, selectedPlot, selectedPlotId)
    : null;
  
  return (
    <div
      className="plots-map-root relative z-0 flex w-full min-w-0 flex-1 flex-col"
      data-plots-map-root
    >
    <MapContainer 
      center={INDIA_DEFAULT_CENTER} 
      zoom={INDIA_DEFAULT_ZOOM} 
      scrollWheelZoom={true}
      zoomControl={false}
      className="z-0 h-full w-full min-h-0 min-w-0 flex-1"
      style={{ minHeight: 'max(45vh, 360px)' }}
    >
      <MapLayoutFix />
      <MapDefaultIndia plotBounds={plotBounds} hasPolygons={hasFieldPolygons} />
      <EnsureGeeClipPane />
      {/* Google Hybrid — satellite + labels */}
      <TileLayer
        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        maxZoom={20}
        attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
      />

      {/* Overlay tile layers from Google Earth Engine for all plots (like Streamlit) */}
      {showTileLayers && (
        <>
          {/* Clicked field: clip GEE tile to that plot only; other fields keep crop fill */}
          {clipTileToSelectedField && selectedFieldTileUrl && selectedPlot && (
            <ClippedGeeTileLayer
              key={`clipped-${selectedPlot.id}-${selectedFieldTileUrl.slice(-24)}`}
              url={selectedFieldTileUrl}
              boundary={selectedPlot.boundary}
            />
          )}
          {/* Village/district tiles — hide while a field is selected so the overlay stays inside the plot */}
          {!clipTileToSelectedField && tileUrl && isGeeXyzUrl(tileUrl) && (
            <TileLayer
              url={leafletTileUrl(tileUrl)}
              maxZoom={18}
              maxNativeZoom={isClasswiseTile(leafletTileUrl(tileUrl)) ? 18 : 15}
              opacity={0.65}
              zIndex={100}
              updateWhenZooming={false}
              updateWhenIdle={true}
              keepBuffer={2}
              attribution={isClasswiseTile(leafletTileUrl(tileUrl)) ? 'Sentinel (AWS STAC)' : 'Google Earth Engine'}
            />
          )}
          {Object.entries(allPlotsTileUrls).map(([plotId, url]) => {
            if (!url || typeof url !== 'string') {
              return null;
            }
            if (!url.includes('{z}') || !url.includes('{x}') || !url.includes('{y}')) {
              return null;
            }
            const isWaterClassOverlay = plotId === 'waterUptakeClass' || plotId.startsWith('wu-');
            if (clipTileToSelectedField && !isWaterClassOverlay) {
              return null;
            }
            const src = leafletTileUrl(url);
            const classwise = isClasswiseTile(src);
            return (
              <TileLayer
                key={isWaterClassOverlay ? `tile-water-class-${src.slice(-40)}` : `tile-${plotId}`}
                url={src}
                maxZoom={18}
                maxNativeZoom={classwise ? 18 : 15}
                minZoom={0}
                opacity={isWaterClassOverlay ? 0.78 : 0.6}
                zIndex={isWaterClassOverlay ? 2500 : 1000}
                updateWhenZooming={false}
                updateWhenIdle={true}
                keepBuffer={2}
                attribution={classwise ? 'Sentinel (AWS STAC)' : 'Google Earth Engine'}
                crossOrigin={true}
                errorTileUrl=""
              />
            );
          })}
        </>
      )}

      <MapBounds plots={plots} plotBounds={plotBounds} />

      {plots.map((plot) => {
        // Validate and convert coordinates: API returns [Lng, Lat], Leaflet needs [Lat, Lng]
        if (!plot.boundary || !Array.isArray(plot.boundary) || plot.boundary.length < 3) {
          return null;
        }

        // Convert GeoJSON-like [Lng, Lat] to Leaflet [Lat, Lng]
        const polygonCoords: LeafletCoordinate[] = plot.boundary
          .filter(coord => Array.isArray(coord) && coord.length >= 2)
          .map((coord) => [coord[1], coord[0]]); // Swap to [Lat, Lng]

        if (polygonCoords.length < 3) {
          return null;
        }

        const isSelected = plotIsSelected(plot, selectedPlotId);
        const isWaterSource = plot.id.startsWith('water-source-');
        const isFieldPlot = isFieldPlotId(plot.id);
        const villagePlotMeta = villagePlotMetaById[plot.id];
        const isVillageSurveyPlot = !!villagePlotMeta;
        const isOutlineBoundary = plot.id.startsWith('outline:');
        const plotIdBase = plot.id.split('::')[0];
        const plotCropColor = typeof plot.cropColor === 'string' ? plot.cropColor.trim() : '';
        // Color identified crop fields by plot_id, field_id, or the plot's own cropColor
        const isInIdentifiedBoundaries =
          plot.id in fieldAreaByFieldId ||
          plotIdBase in fieldAreaByFieldId ||
          plot.id in fieldFillByFieldId ||
          plotIdBase in fieldFillByFieldId ||
          (plot.fieldId ? plot.fieldId in fieldFillByFieldId : false) ||
          (plot.fieldId ? plot.fieldId in fieldAreaByFieldId : false) ||
          Boolean(plotCropColor);
        const showTileInsteadOfCrop =
          showSelectedFieldAnalysisTile && isSelected && isFieldPlot && !isWaterSource;
        const useCropColor =
          !showTileInsteadOfCrop && !isWaterSource && isFieldPlot && isInIdentifiedBoundaries;
        const displayAreaHa =
          fieldAreaByFieldId[plot.id] ??
          fieldAreaByFieldId[plotIdBase] ??
          (plot.area_ha ? Number(plot.area_ha) : undefined);
        const displayArea =
          displayAreaHa != null && !Number.isNaN(displayAreaHa)
            ? displayAreaHa
            : plot.area_ha
              ? Number(plot.area_ha)
              : 0;
        const fillFromPredict =
          fieldFillByFieldId[plot.id] ??
          fieldFillByFieldId[plotIdBase] ??
          plotCropColor ??
          cropColor ??
          '';
        const resolvedFillHex =
          typeof fillFromPredict === 'string' &&
          /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(fillFromPredict.trim())
            ? fillFromPredict.trim()
            : PREDICT_AREA_FIELD_FILL;
        const cropStroke = useCropColor ? resolvedFillHex : PREDICT_AREA_FIELD_STROKE;
        // Village / district outline only – not field polygons
        const isBoundaryOnly = isOutlineBoundary;
        const showFieldMeta = (isFieldPlot || isVillageSurveyPlot) && !isWaterSource;

        return (
          <Polygon
            key={plot.id}
            positions={polygonCoords}
            pathOptions={{
              // Boundary-only (district/subdistrict/village outer outline): green
              ...(isBoundaryOnly
                ? {
                    color: BOUNDARY_STROKE,
                    fillColor: BOUNDARY_STROKE,
                    fillOpacity: 0.06,
                    weight: 3,
                    opacity: 1,
                    interactive: !hasNumericFieldPlots,
                  }
                : {
                    // Clicked field: no crop fill so the analysis tile shows through; other fields keep crop color
                    color: isWaterSource
                      ? '#3b82f6'
                      : (showTileInsteadOfCrop
                        ? '#f8fafc'
                        : (useCropColor ? cropStroke : BOUNDARY_STROKE)),
                    fillColor: isWaterSource
                      ? '#3b82f6'
                      : (useCropColor ? resolvedFillHex : BOUNDARY_STROKE),
                    fillOpacity: isWaterSource ? 0.3 : (showTileInsteadOfCrop ? 0 : (useCropColor ? 0.88 : 0)),
                    weight: showTileInsteadOfCrop ? 3 : (isWaterSource ? 2 : useCropColor ? 3 : 1.5),
                    opacity: 1,
                  }),
            }}
            eventHandlers={{
              click: () => onSelectPlot(plot.id),
            }}
          >
            {/* Hover tooltip: survey + owner name (village-data) or field id + area */}
            {showFieldMeta && (
              <Tooltip
                direction="top"
                offset={[0, -8]}
                opacity={0.92}
                className={
                  showOwnerLabels && isVillageSurveyPlot
                    ? 'owner-plot-onmap-label'
                    : 'field-plot-onmap-label'
                }
              >
                {isVillageSurveyPlot ? (
                  <>
                    <span className="font-medium">Survey: {villagePlotMeta.plotNo}</span>
                    {villagePlotMeta.owners[0]?.ownerName ? (
                      <>
                        <br />
                        <span className="font-semibold">{villagePlotMeta.owners[0].ownerName}</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="font-medium">ID: {plot.fieldId || plot.id}</span>
                    <br />
                    <span className="text-emerald-600 font-semibold">{displayArea.toFixed(2)} ha</span>
                  </>
                )}
              </Tooltip>
            )}
            {showFieldMeta && (
            <Popup className="font-sans font-medium text-sm">
              <div className="text-center">
                {plot.id.startsWith('water-source-') ? (
                  // Water Source Popup
                  <>
                    <span className="block font-bold text-gray-700 uppercase mb-1">Water Source</span>
                    <span className="text-blue-600 font-semibold mb-2">{plot.id}</span>
                    {waterSources.find(ws => ws.id === plot.id) && (
                      <div className="mt-2 space-y-1 text-left">
                        <div>
                          <span className="text-xs text-gray-600">Water Percentage: </span>
                          <span className="text-blue-600 font-semibold">
                            {waterSources.find(ws => ws.id === plot.id)?.water_pixel_percentage.toFixed(2)}%
                          </span>
                        </div>
                        {waterSources.find(ws => ws.id === plot.id)?.tile_url && (
                          <div className="mt-1">
                            <span className="text-xs text-gray-600 block">Tile URL:</span>
                            <span className="text-xs text-gray-500 break-all">
                              {waterSources.find(ws => ws.id === plot.id)?.tile_url.substring(0, 50)}...
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : isVillageSurveyPlot ? (
                  <>
                    <span className="block font-bold text-gray-700 uppercase mb-1">
                      Survey No. {villagePlotMeta.plotNo}
                    </span>
                    <div className="mt-2 space-y-2 text-left max-h-40 overflow-y-auto">
                      {villagePlotMeta.owners.map((owner, oi) => (
                        <div key={`popup-owner-${oi}`} className="border-b border-gray-200 pb-1 last:border-0">
                          <div className="font-semibold text-emerald-700">{owner.ownerName || '—'}</div>
                          <div className="text-xs text-gray-600">
                            Survey: {owner.surveyNo} · Khata: {owner.khataNo}
                          </div>
                          <div className="text-xs text-gray-700">
                            Area: {owner.totalArea.toFixed(4)} ha
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  // Regular Plot Popup (click) – show Field ID and area (from predict-area or plot)
                  <>
                    <span className="block font-bold text-gray-700 uppercase mb-1">Field ID</span>
                    <span className="text-emerald-600 font-semibold">{plot.fieldId || plot.id}</span>
                    {(displayArea > 0) ? (
                      <div className="mt-2">
                        <span className="text-xs text-gray-600">Area: </span>
                        <span className="text-emerald-600 font-semibold">{displayArea.toFixed(2)} ha</span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </Popup>
            )}
          </Polygon>
        );
      }).filter((plot) => plot !== null)}

      {/* Water Sources from NDWI Detection */}
      {waterSources.map((waterSource) => {
        if (!waterSource.coordinates || !Array.isArray(waterSource.coordinates) || waterSource.coordinates.length < 3) {
          return null;
        }

        // Convert coordinates: API returns [Lng, Lat], Leaflet needs [Lat, Lng]
        const polygonCoords: LeafletCoordinate[] = waterSource.coordinates
          .filter(coord => Array.isArray(coord) && coord.length >= 2)
          .map((coord) => [coord[1], coord[0]]); // Swap to [Lat, Lng]

        if (polygonCoords.length < 3) {
          return null;
        }

        return (
          <Polygon
            key={`water-${waterSource.id}`}
            positions={polygonCoords}
            pathOptions={{
              color: '#3b82f6', // Blue color for water sources
              fillColor: '#3b82f6',
              fillOpacity: 0.3,
              weight: 2,
              opacity: 0.8
            }}
            eventHandlers={{
              click: () => {
                if (onSelectWaterSource) {
                  onSelectWaterSource(waterSource.id, waterSource);
                }
              },
            }}
          >
            <Popup className="font-sans font-medium text-sm">
              <div className="text-center">
                <span className="block font-bold text-gray-700 uppercase mb-1">Water Source</span>
                <span className="text-blue-600 font-semibold mb-2">{waterSource.id}</span>
                <div className="mt-2 space-y-1">
                  <div>
                    <span className="text-xs text-gray-600">Water Percentage: </span>
                    <span className="text-blue-600 font-semibold">{waterSource.water_pixel_percentage.toFixed(2)}%</span>
                  </div>
                  {waterSource.tile_url && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-600 block">Tile URL:</span>
                      <span className="text-xs text-gray-500 break-all">{waterSource.tile_url.substring(0, 50)}...</span>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Polygon>
        );
      }).filter((source) => source !== null)}

      {windDirectPayload &&
        showWindFlowLayer &&
        (windDirectPayload.points_weather?.length ?? 0) > 0 && (
          <WindFlowOverlay payload={windDirectPayload} particleCount={480} showMarkers />
        )}
    </MapContainer>
    </div>
  );
};

export default PlotsMap;