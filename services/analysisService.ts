// Service for fetching analysis data (Growth, Water Uptake, Soil Moisture)
import { Coordinate } from '../types';
import { createApiCache } from '../utils/apiCache';

const isDevelopment =
  Boolean(import.meta.env.DEV) ||
  (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      /^192\.168\./.test(window.location.hostname) ||
      /^10\./.test(window.location.hostname)));

/** Production Railway host (shown in error messages). */
const RAILWAY_HOST = 'https://web-production-72a7.up.railway.app';

/** In local dev, route via Vite `/railway` proxy to avoid CORS. Override with VITE_API_BASE_URL. */
const getBaseUrl = (): string => {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta.env.VITE_API_BASE_URL as string | undefined)
      : undefined;
  if (fromEnv?.trim()) {
    return fromEnv.trim().replace(/\/$/, '');
  }
  if (isDevelopment && typeof window !== 'undefined') {
    return `${window.location.origin}/railway`;
  }
  return RAILWAY_HOST;
};

/** GET with one retry on gateway/server errors (common when backend is busy). */
const getJsonWithRetry = async (
  url: string,
  headers: Record<string, string> = { accept: 'application/json' }
): Promise<Response> => {
  const doFetch = () => fetch(url, { method: 'GET', headers });
  let response = await doFetch();
  if ([500, 502, 503, 504].includes(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    response = await doFetch();
  }
  return response;
};

/** POST with one retry on gateway/server errors (common when backend is busy). */
const postJsonWithRetry = async (
  url: string,
  body = '',
  headers: Record<string, string> = { accept: 'application/json' }
): Promise<Response> => {
  const doFetch = () => fetch(url, { method: 'POST', headers, body });
  let response = await doFetch();
  if ([500, 502, 503, 504].includes(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    response = await doFetch();
  }
  return response;
};

/** Backend /api-stored/* returns { stored: [...], count: N }. Accept legacy array shapes too. */
export function unwrapStoredApiResponse<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.stored)) return o.stored as T[];
    if (Array.isArray(o.data)) return o.data as T[];
    if (Array.isArray(o.results)) return o.results as T[];
  }
  return [];
};

/** True when backend stripped polygon coords (slim stored / live classwise responses). */
export function isStrippedGeometry(geometry: unknown): boolean {
  if (!geometry || typeof geometry !== 'object') return false;
  const g = geometry as Record<string, unknown>;
  return Boolean(g.coordinates_stripped || g.coordinates_omitted) && !g.coordinates;
}

// Fetch list of talukas and their plots
export interface TalukaListResponse {
  [talukaName: string]: number[];
}

// OLD API - REMOVED: fetchTalukaList no longer used

// Fetch list of districts
export interface DistrictItem {
  district: string;
  geometry?: any;
}

export interface DistrictsResponse {
  districts: DistrictItem[] | string[];
}

// Fetch districts with full data (including geometry)
export const fetchDistricts = async (): Promise<DistrictItem[]> => {
  try {
    const url = `${getBaseUrl()}/districts`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: DistrictsResponse = await response.json();
    const districtsArray = data.districts || [];
    
    // Handle both formats: array of strings or array of objects
    if (districtsArray.length > 0 && typeof districtsArray[0] === 'object') {
      // Return full objects with geometry
      return districtsArray as DistrictItem[];
    } else {
      // Convert strings to objects (no geometry available)
      return (districtsArray as string[]).map(district => ({ district }));
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/districts`);
    }
    throw error;
  }
};

// Fetch subdistricts for a selected district
export interface SubdistrictItem {
  subdistrict: string;
  geometry?: {
    type: string;
    coordinates: any;
  };
}

export interface SubdistrictsResponse {
  district: string;
  subdistricts: SubdistrictItem[];
}

export const fetchSubdistricts = async (district: string): Promise<SubdistrictItem[]> => {
  try {
    const response = await fetch(`${getBaseUrl()}/subdistricts?district=${encodeURIComponent(district)}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: SubdistrictsResponse = await response.json();
    const subdistrictsArray = data.subdistricts || [];
    
    // Return subdistricts with geometry
    return subdistrictsArray.map(item => ({
      subdistrict: item.subdistrict,
      geometry: item.geometry
    }));
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/subdistricts`);
    }
    throw error;
  }
};

// Fetch villages for a selected subdistrict
export interface VillageItem {
  village: string;
  geom_type?: string;
  coordinates?: any;
  geometry?: {
    type: string;
    coordinates: any;
  };
}

export interface VillagesResponse {
  subdistrict: string;
  villages: VillageItem[];
}

/** Parse village polygon from /villages API item into [lng, lat][] rings */
export const parseVillageBoundaryCoordinates = (village: VillageItem): Coordinate[] => {
  if (!village) return [];

  if (village.coordinates && village.geom_type) {
    const coords = village.coordinates;
    const geomType = village.geom_type.toUpperCase();
    if (geomType === 'POLYGON' || geomType === 'MULTIPOLYGON') {
      if (Array.isArray(coords) && coords.length > 0) {
        if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
          const outerRing = coords[0] as number[][];
          return outerRing
            .filter((c): c is [number, number] => Array.isArray(c) && c.length >= 2)
            .map((c) => [c[0], c[1]] as Coordinate);
        }
        return (coords as number[][])
          .filter((c): c is [number, number] => Array.isArray(c) && c.length >= 2)
          .map((c) => [c[0], c[1]] as Coordinate);
      }
    }
  }

  if (village.geometry) {
    return parseGeometryToCoordinates(village.geometry);
  }

  return [];
};

export const fetchVillages = async (subdistrict: string): Promise<VillageItem[]> => {
  try {
    const response = await fetch(`${getBaseUrl()}/villages?subdistrict=${encodeURIComponent(subdistrict)}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: VillagesResponse | VillageItem[] = await response.json();
    const villagesArray = Array.isArray(data) ? data : (data.villages || []);
    
    return villagesArray
      .filter((item) => item.village && item.village.trim())
      .map((item) => ({
        village: item.village,
        geom_type: item.geom_type,
        coordinates: item.coordinates,
        geometry: item.geometry
      }))
      .sort((a, b) => a.village.localeCompare(b.village));
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/villages`);
    }
    throw error;
  }
};

const VILLAGE_OUTLINE_ID_PREFIX = 'outline:';
export const villageOutlinePlotId = (village: string) => `${VILLAGE_OUTLINE_ID_PREFIX}${village}`;
export const isVillageOutlinePlotId = (id: string) => id.startsWith(VILLAGE_OUTLINE_ID_PREFIX);

/** Numeric plot id from /field-boundaries (field_boundaries.id / plot_id), e.g. "159" or "159::0". */
export const parseFieldPlotId = (id: string): number | null => {
  const base = String(id || '').split('::')[0];
  if (!/^\d+$/.test(base)) return null;
  const n = Number(base);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const isFieldPlotId = (id: string) => parseFieldPlotId(id) != null;

/**
 * Analysis APIs expect field_boundaries.field_id, not plot_id (PK).
 * Map polygons use plot_id as `id`; the real field_id is on `fieldId`.
 */
export function resolveAnalysisFieldId(
  selectedPlotId: string | null | undefined,
  plots: Array<{ id?: string; fieldId?: string } | null | undefined>
): number | null {
  if (!selectedPlotId) return null;
  const selected = String(selectedPlotId);
  const base = selected.split('::')[0];
  for (const plot of plots) {
    if (!plot) continue;
    const pid = String(plot.id || '');
    const pidBase = pid.split('::')[0];
    if (pid !== selected && pidBase !== base && pid !== base) continue;
    const fieldId = parseFieldPlotId(String(plot.fieldId || ''));
    if (fieldId != null) return fieldId;
  }
  return null;
}

const ringFromLngLatPairs = (outerRing: unknown): Coordinate[] => {
  if (!Array.isArray(outerRing)) return [];
  return outerRing
    .filter((c): c is [number, number] => Array.isArray(c) && c.length >= 2)
    .map((c) => [c[0], c[1]] as Coordinate);
};

/** All outer rings from GeoJSON Polygon / MultiPolygon (fixes districts like Kolhapur with multiple parts). */
function ringsFromCoordinateArray(coords: unknown[]): Coordinate[][] {
  if (coords.length === 0) return [];
  const first = coords[0];
  // Ring: [[lng, lat], ...]
  if (Array.isArray(first) && typeof first[0] === 'number') {
    const ring = ringFromLngLatPairs(coords);
    return ring.length >= 3 ? [ring] : [];
  }
  // Polygon: [ring] or MultiPolygon: [[ring], ...]
  if (Array.isArray(first) && Array.isArray(first[0])) {
    if (typeof first[0][0] === 'number') {
      const ring = ringFromLngLatPairs(first);
      return ring.length >= 3 ? [ring] : [];
    }
    const rings: Coordinate[][] = [];
    coords.forEach((poly) => {
      const outer = Array.isArray(poly) ? poly[0] : null;
      const ring = ringFromLngLatPairs(outer);
      if (ring.length >= 3) rings.push(ring);
    });
    return rings;
  }
  return [];
}

export function parseGeometryToOuterRings(geometry: unknown): Coordinate[][] {
  if (geometry == null) return [];
  if (typeof geometry === 'string') {
    const trimmed = geometry.trim();
    if (!trimmed) return [];
    try {
      return parseGeometryToOuterRings(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }
  if (Array.isArray(geometry)) {
    return ringsFromCoordinateArray(geometry);
  }
  if (typeof geometry !== 'object') return [];
  const geom = geometry as {
    type?: string;
    coordinates?: unknown;
    coordinates_stripped?: boolean;
    coordinates_omitted?: boolean;
  };
  if (isStrippedGeometry(geom)) return [];
  const rings: Coordinate[][] = [];

  try {
    if (geom.type === 'Polygon') {
      const ring = ringFromLngLatPairs((geom.coordinates as number[][][])?.[0]);
      if (ring.length >= 3) rings.push(ring);
    } else if (geom.type === 'MultiPolygon') {
      const polys = geom.coordinates as number[][][][];
      if (Array.isArray(polys)) {
        polys.forEach((poly) => {
          const ring = ringFromLngLatPairs(poly?.[0]);
          if (ring.length >= 3) rings.push(ring);
        });
      }
    } else if (geom.coordinates) {
      const coords = geom.coordinates;
      if (Array.isArray(coords)) {
        return ringsFromCoordinateArray(coords);
      }
    }
  } catch {
    /* ignore malformed geometry */
  }

  return rings;
}

/** Single ring — uses the largest outer ring (main landmass) when geometry is MultiPolygon. */
export function parseGeometryToCoordinates(geometry: unknown): Coordinate[] {
  const rings = parseGeometryToOuterRings(geometry);
  if (rings.length === 0) return [];
  return rings.reduce((best, ring) => (ring.length > best.length ? ring : best), rings[0]);
}

/** One map plot per outer ring; multi-part boundaries get ids like `Kolhapur::part-1`. */
export function geometryToBoundaryPlots(baseId: string, geometry: unknown): FieldBoundaryPlot[] {
  const rings = parseGeometryToOuterRings(geometry);
  if (rings.length === 0) return [];
  if (rings.length === 1) {
    return [{ id: baseId, area_ha: '0', boundary: rings[0] }];
  }
  return rings.map((boundary, index) => ({
    id: `${baseId}::part-${index}`,
    area_ha: '0',
    boundary,
  }));
}

export function isAdminBoundaryPlotId(
  plotId: string,
  district: string,
  subdistrict: string,
  village: string
): boolean {
  return (
    plotId === district ||
    plotId.startsWith(`${district}::`) ||
    plotId === subdistrict ||
    plotId.startsWith(`${subdistrict}::`) ||
    plotId === village ||
    isVillageOutlinePlotId(plotId)
  );
}

/** Hide Field ID / Area only on pure admin-boundary views (no field polygons). */
export const shouldHideFieldIdAreaOnMap = (
  plots: Array<{ id: string }>,
  district: string,
  subdistrict: string,
  village: string
): boolean => {
  if (plots.some((plot) => isFieldPlotId(plot.id))) return false;
  return (
    plots.length >= 1 &&
    plots.some((plot) => isAdminBoundaryPlotId(plot.id, district, subdistrict, village))
  );
};
export interface FieldBoundariesResponse {
  district: string;
  subdistrict: string;
  village: string;
  count: number;
  /** Total fields in village (all pages). Present on the first page. */
  total_count?: number;
  limit?: number;
  offset?: number;
  after_id?: number;
  has_more?: boolean;
  /** Pass as after_id on the next request (keyset pagination). */
  next_after_id?: number | null;
  fields: Array<{
    id: number;
    field_id: number;
    village_id?: number;
    village_name?: string;
    sub_dist?: string;
    district?: string;
    state?: string;
    area_ha: number;
    geometry: {
      type: string;
      coordinates: number[][][]; // Polygon: [ ring ], ring = [ [lng, lat], ... ]
    };
  }>;
}

/** Page size for GET /field-boundaries (API max). ~150 pages for 3 lakh plots. */
export const FIELD_BOUNDARIES_PAGE_SIZE = 2000;

export type FieldBoundaryPlot = {
  id: string;
  fieldId?: string;
  area_ha: string;
  boundary: Coordinate[];
  cropColor?: string;
};

type FieldBoundaryFeature = {
  plotId: string;
  fieldId: string;
  area_ha: string;
  boundary: Coordinate[];
};

function parseFieldBoundaryFeatures(data: FieldBoundariesResponse): FieldBoundaryFeature[] {
  const payload = data as FieldBoundariesResponse & { plots?: FieldBoundariesResponse['fields'] };
  const fields = payload.fields ?? payload.plots ?? [];
  const out: FieldBoundaryFeature[] = [];
  fields.forEach((field, index) => {
    const geom = field.geometry ?? (field as { boundaries?: unknown }).boundaries;
    if (!geom || isStrippedGeometry(geom)) return;
    const rings = parseGeometryToOuterRings(geom);
    if (rings.length === 0) return;
    const plotId = String(field.id ?? field.field_id ?? `field-${index}`);
    const fieldId = String(field.field_id ?? field.id ?? plotId);
    const areaHa = field.area_ha != null ? String(field.area_ha) : '0';
    rings.forEach((boundary, ringIndex) => {
      if (boundary.length < 3) return;
      out.push({
        plotId: rings.length > 1 ? `${plotId}::${ringIndex}` : plotId,
        fieldId,
        area_ha: areaHa,
        boundary,
      });
    });
  });
  return out;
}

async function fetchFieldBoundariesPage(
  district: string,
  subdistrict: string,
  village: string,
  limit: number,
  offset: number,
  simplify = 0,
  afterId?: number
): Promise<FieldBoundariesResponse | null> {
  const params = new URLSearchParams({
    district,
    subdistrict,
    village,
    limit: String(limit),
  });
  if (afterId != null && afterId > 0) {
    params.set('after_id', String(afterId));
  } else if (offset > 0) {
    params.set('offset', String(offset));
  }
  if (simplify > 0) params.set('simplify', String(simplify));
  const url = `${getBaseUrl()}/field-boundaries?${params.toString()}`;
  const response = await getJsonWithRetry(url);
  if (!response.ok) {
    if (response.status === 404 || response.status >= 500) {
      console.warn(`field-boundaries ${response.status} for ${district}/${subdistrict}/${village}`);
      return null;
    }
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as FieldBoundariesResponse;
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function lastNumericFieldId(data: FieldBoundariesResponse): number | undefined {
  if (data.next_after_id != null && Number.isFinite(Number(data.next_after_id))) {
    return Number(data.next_after_id);
  }
  const fields = data.fields ?? [];
  for (let i = fields.length - 1; i >= 0; i -= 1) {
    const id = fields[i]?.id;
    if (id != null && Number.isFinite(Number(id))) return Number(id);
  }
  return undefined;
}

/**
 * Fetch all field-boundary pages for a village.
 * Loops while has_more is true until every page is loaded (including 3 lakh+ plots).
 * When ``onPage`` is provided, each page is delivered as soon as it arrives (progressive UI).
 */
async function fetchFieldBoundaryFeatures(
  district: string,
  subdistrict: string,
  village: string,
  options?: {
    pageSize?: number;
    simplify?: number;
    signal?: { cancelled?: boolean };
    collectAll?: boolean;
    onPage?: (pageFeatures: FieldBoundaryFeature[]) => void;
  }
): Promise<FieldBoundaryFeature[]> {
  const pageSize = options?.pageSize ?? FIELD_BOUNDARIES_PAGE_SIZE;
  const simplify = options?.simplify ?? 0;
  const collectAll = options?.collectAll !== false;
  const all: FieldBoundaryFeature[] = [];
  let afterId: number | undefined;
  let offset = 0;
  let loaded = 0;
  let totalCount: number | undefined;

  try {
    while (!options?.signal?.cancelled) {
      const data = await fetchFieldBoundariesPage(
        district,
        subdistrict,
        village,
        pageSize,
        offset,
        simplify,
        afterId
      );
      if (!data) break;

      if (typeof data.total_count === 'number') totalCount = data.total_count;

      const pageFeatures = parseFieldBoundaryFeatures(data);
      loaded += data.count ?? pageFeatures.length;
      if (collectAll) all.push(...pageFeatures);
      options?.onPage?.(pageFeatures);

      const hasMore =
        typeof data.has_more === 'boolean'
          ? data.has_more
          : pageFeatures.length >= pageSize &&
            (totalCount == null || loaded < totalCount);

      if (!hasMore || (data.count ?? pageFeatures.length) === 0) break;

      const nextId = lastNumericFieldId(data);
      if (nextId == null) break;
      afterId = nextId;
      offset += data.limit ?? pageSize;

      await yieldToUi();
    }
    return all;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/field-boundaries`);
    }
    throw error;
  }
}

// Fetch field boundaries for a village (district + subdistrict + village)
export const fetchFieldBoundaries = async (
  district: string,
  subdistrict: string,
  village: string
): Promise<FieldBoundaryPlot[]> => {
  const feats = await fetchFieldBoundaryFeatures(district, subdistrict, village);
  return feats.map((f) => ({
    id: f.plotId,
    fieldId: f.fieldId,
    area_ha: f.area_ha,
    boundary: f.boundary,
  }));
};

/**
 * Progressive load for map "Display boundary": calls onPage after each API page so the UI can append plots.
 * Loops until has_more is false (all pages, including 3 lakh+ plots).
 */
export const fetchFieldBoundariesProgressive = async (
  district: string,
  subdistrict: string,
  village: string,
  onPage: (pagePlots: FieldBoundaryPlot[]) => void,
  signal?: { cancelled?: boolean }
): Promise<void> => {
  await fetchFieldBoundaryFeatures(district, subdistrict, village, {
    signal,
    collectAll: false,
    onPage: (pageFeatures) => {
      if (!pageFeatures.length) return;
      onPage(pageFeatures.map((f) => ({
        id: f.plotId,
        fieldId: f.fieldId,
        area_ha: f.area_ha,
        boundary: f.boundary,
      })));
    },
  });
};

/** Maharashtra state code for village survey API */
const VILLAGE_DATA_STATE_CODE = '27';

/** Cloudflare tunnel — update VITE_VILLAGE_DATA_API_URL in .env when tunnel URL changes */
const DEFAULT_VILLAGE_DATA_API = 'https://web-production-72a7.up.railway.app';

const getVillageDataBaseUrl = (): string => {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta.env.VITE_VILLAGE_DATA_API_URL as string | undefined)
      : undefined;
  return (fromEnv || DEFAULT_VILLAGE_DATA_API).replace(/\/$/, '');
};

export interface VillagePlotOwner {
  surveyNo: string;
  totalArea: number;
  potKharaba: number;
  ownerName: string;
  khataNo: string;
}

export interface VillagePlotMeta {
  plotId: string;
  plotNo: string;
  info?: string;
  owners: VillagePlotOwner[];
}

/** Parse WKT MULTIPOLYGON outer ring → [lng, lat][] */
export const parseWktMultipolygonToRing = (wkt: string): Coordinate[] => {
  if (!wkt || typeof wkt !== 'string') return [];
  const match = wkt.trim().match(/\(\(\s*([^)]+)\s*\)\)/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((pair) => {
      const parts = pair.trim().split(/\s+/);
      if (parts.length < 2) return null;
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
      return [lng, lat] as Coordinate;
    })
    .filter((c): c is Coordinate => c !== null && c.length === 2);
};

export type VillageSurveyLoadResult = {
  plots: FieldBoundaryPlot[];
  plotMetaById: Record<string, VillagePlotMeta>;
};

/** Village cadastral plots from survey API (theGeom + owners). */
export const fetchVillageSurveyPlots = async (
  district: string,
  subdistrict: string,
  village: string,
  stateCode = VILLAGE_DATA_STATE_CODE
): Promise<VillageSurveyLoadResult> => {
  const params = new URLSearchParams({
    district: district.trim(),
    taluka: subdistrict.trim(),
    village: village.trim(),
    stateCode,
  });
  const url = `${getVillageDataBaseUrl()}/api/village-data?${params.toString()}`;
  const response = await getJsonWithRetry(url);
  if (!response.ok) {
    // Cadastral MySQL may be unavailable on Railway — optional overlay only.
    if (response.status === 404 || response.status === 503 || response.status >= 500) {
      console.warn(`village-data ${response.status} for ${district}/${subdistrict}/${village}`);
      return { plots: [], plotMetaById: {} };
    }
    throw new Error(`Village data API Error: ${response.status} ${response.statusText}`);
  }
  const raw = await response.json();
  const payload = raw?.data ?? raw;
  const apiPlots: unknown[] = payload?.village?.plots ?? [];
  const plots: FieldBoundaryPlot[] = [];
  const plotMetaById: Record<string, VillagePlotMeta> = {};

  apiPlots.forEach((item: any, index: number) => {
    const plotId = String(item?.plotId ?? item?.plotNo ?? `plot-${index}`);
    const plotNo = String(item?.plotNo ?? plotId);
    const boundary = parseWktMultipolygonToRing(String(item?.theGeom ?? ''));
    if (boundary.length < 3) return;

    const owners: VillagePlotOwner[] = Array.isArray(item?.owners)
      ? item.owners.map((o: any) => ({
          surveyNo: String(o?.surveyNo ?? ''),
          totalArea: Number(o?.totalArea ?? 0),
          potKharaba: Number(o?.potKharaba ?? 0),
          ownerName: String(o?.ownerName ?? ''),
          khataNo: String(o?.khataNo ?? ''),
        }))
      : [];

    const totalHa = owners.reduce((sum, o) => sum + (o.totalArea > 0 ? o.totalArea : 0), 0);
    plots.push({
      id: plotId,
      area_ha: totalHa > 0 ? String(totalHa) : '0',
      boundary,
    });
    plotMetaById[plotId] = {
      plotId,
      plotNo,
      info: typeof item?.info === 'string' ? item.info : undefined,
      owners,
    };
  });

  return { plots, plotMetaById };
};

// Predict-area API response (POST): crop predictions per crop type with field_id and field_area_ha
export interface PredictAreaIdentifiedField {
  field_id?: number;
  plot_id?: number;
  id?: number;
  field_area_ha: number;
  village?: string;
  village_name?: string;
  boundaries?: { type?: string; coordinates?: unknown };
}

export interface PredictAreaCropData {
  crop_name: string;
  crop_area_ha: number;
  sugarcane_area_ha?: number;
  color: string;
  identified_field_boundaries: Record<string, PredictAreaIdentifiedField>;
}

export interface PredictAreaVillageFields {
  village: string;
  sugarcane_fields?: PredictAreaIdentifiedField[];
  wheat_fields?: PredictAreaIdentifiedField[];
  onion_fields?: PredictAreaIdentifiedField[];
  banana_fields?: PredictAreaIdentifiedField[];
  mango_fields?: PredictAreaIdentifiedField[];
}

export interface PredictAreaResponse {
  district: string;
  subdistrict: string;
  village: string;
  month?: string;
  scope?: string;
  /** Present when API returns total predicted sugarcane area at root (see predict-area). */
  sugarcane_area_ha?: number;
  village_wise_fields?: PredictAreaVillageFields[];
  village_wise_summary?: Array<Record<string, unknown>>;
  field_boundaries_geojson?: { type: string; features: unknown[]; note?: string };
  [cropKey: string]: unknown; // e.g. "sugarcane": PredictAreaCropData
}

/** Unique map join key: field_boundaries.id (plot_id). Never use field_id alone at subdistrict scope. */
export function predictAreaPlotId(item: PredictAreaIdentifiedField | undefined | null): string | null {
  if (!item) return null;
  const raw = item.plot_id ?? item.id;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/** Query param crop keys in stored-responses body, e.g. wheat, sugarcane (lowercase). */
export function formatPredictAreaCropName(cropValue: string): string {
  const c = cropValue.trim().toLowerCase();
  if (!c) return '';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Local calendar month for predict-area `month=YYYY-MM` (defaults match API default). */
export function getCurrentPredictAreaMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Parse predict-area `field_boundaries_geojson` into map-ready field polygons (numeric field_id). */
export function parsePredictAreaFieldGeoJson(
  geojson: PredictAreaResponse['field_boundaries_geojson']
): FieldBoundaryPlot[] {
  if (!geojson || !Array.isArray(geojson.features)) return [];

  const plots: FieldBoundaryPlot[] = [];
  geojson.features.forEach((rawFeat: unknown, index: number) => {
    const feat = rawFeat as {
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    const geom = feat?.geometry;
    if (!geom?.type || !geom.coordinates) return;

    const props = feat.properties ?? {};
    const plotKey = props.plot_id ?? props.id;
    const fieldKey = props.field_id ?? props.fieldId;
    if (plotKey == null && fieldKey == null) return;
    const id = String(plotKey ?? fieldKey);
    const fieldId = fieldKey != null ? String(fieldKey) : undefined;

    let outerRing: number[][] = [];
    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      const ring = (geom.coordinates as number[][][])[0];
      if (Array.isArray(ring)) outerRing = ring;
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      const ring = (geom.coordinates as number[][][][])[0]?.[0];
      if (Array.isArray(ring)) outerRing = ring;
    }
    const boundary: Coordinate[] = outerRing
      .filter((c) => Array.isArray(c) && c.length >= 2)
      .map((c) => [c[0], c[1]] as Coordinate);
    if (boundary.length < 3) return;

    const areaRaw = props.area_ha ?? props.field_area_ha ?? props.area;
    const area_ha =
      areaRaw != null && !Number.isNaN(Number(areaRaw)) ? String(areaRaw) : '0';
    const cropColor = typeof props.color === 'string' ? props.color : undefined;
    plots.push({ id, fieldId, area_ha, boundary, cropColor });
  });

  return plots;
}

export function collectPredictAreaFieldIds(
  layers: Partial<Record<string, { areas: Record<string, number> }>>
): Set<string> {
  const ids = new Set<string>();
  Object.values(layers).forEach((layer) => {
    if (layer) Object.keys(layer.areas).forEach((id) => ids.add(id));
  });
  return ids;
}

function colorFromLayers(
  layers: Partial<Record<string, { areas: Record<string, number>; fills?: Record<string, string>; color?: string }>>,
  plotId: string,
  fieldId: string
): string | undefined {
  for (const layer of Object.values(layers)) {
    if (!layer) continue;
    const fill = layer.fills?.[plotId] || layer.fills?.[fieldId];
    if (fill) return fill;
    if (layer.areas[plotId] != null || layer.areas[fieldId] != null) return layer.color;
  }
  return Object.values(layers).find((layer) => layer?.color)?.color;
}

/** Field polygons for crop coloring — from predict-area geojson or inline boundaries only. */
export function extractPredictCropFieldPlots(
  res: PredictAreaResponse,
  layers: Partial<Record<string, { areas: Record<string, number>; fills?: Record<string, string>; color?: string }>>
): FieldBoundaryPlot[] {
  const fromGeo = parsePredictAreaFieldGeoJson(res.field_boundaries_geojson);
  if (fromGeo.length > 0) {
    return fromGeo.map((p) => ({
      ...p,
      cropColor: colorFromLayers(layers, p.id.split('::')[0], p.fieldId || p.id) || p.cropColor,
    }));
  }

  const fromInline = plotsFromIdentifiedBoundaries(res, collectPredictAreaFieldIds(layers));
  if (fromInline.length > 0) {
    return fromInline.map((p) => ({
      ...p,
      cropColor: colorFromLayers(layers, p.id.split('::')[0], p.fieldId || p.id),
    }));
  }

  return [];
}

export async function loadPredictCropFieldPlots(
  res: PredictAreaResponse,
  _district: string,
  _subdistrict: string,
  _village: string,
  layers: Partial<Record<string, { areas: Record<string, number>; fills?: Record<string, string>; color?: string }>>
): Promise<FieldBoundaryPlot[]> {
  return extractPredictCropFieldPlots(res, layers);
}

function plotsFromIdentifiedBoundaries(
  res: PredictAreaResponse,
  allowedIds: Set<string>
): FieldBoundaryPlot[] {
  const plots: FieldBoundaryPlot[] = [];
  const cropKeys = ['sugarcane', 'wheat', 'onion', 'banana', 'mango'];
  cropKeys.forEach((crop) => {
    const block = res[crop] as PredictAreaCropData | undefined;
    const ib = block?.identified_field_boundaries;
    if (!ib) return;
    Object.values(ib).forEach((fld) => {
      const pid = predictAreaPlotId(fld);
      if (!pid || (allowedIds.size > 0 && !allowedIds.has(pid))) return;
      const geom = fld.boundaries;
      if (!geom) return;
      const rings = parseGeometryToOuterRings(geom);
      rings.forEach((boundary, ringIndex) => {
        if (boundary.length < 3) return;
        plots.push({
          id: rings.length > 1 ? `${pid}::${ringIndex}` : pid,
          fieldId: fld.field_id != null ? String(fld.field_id) : undefined,
          area_ha: String(fld.field_area_ha ?? 0),
          boundary,
        });
      });
    });
  });
  return plots;
}

/** Load identified crop polygons for a whole subdistrict from predict-area payload only. */
export async function loadSubdistrictPredictCropFieldPlots(
  res: PredictAreaResponse,
  _district: string,
  _subdistrict: string,
  layers: Partial<Record<string, { areas: Record<string, number>; fills?: Record<string, string>; color?: string }>>
): Promise<FieldBoundaryPlot[]> {
  return extractPredictCropFieldPlots(res, layers);
}

export interface PredictAreaStoredVizResponse {
  count: number;
  total_count?: number;
  has_more?: boolean;
  limit?: number;
  offset?: number;
  district: string;
  subdistrict?: string;
  village?: string;
  month: string;
  data: PredictAreaResponse[];
}

const PREDICT_AREA_VIZ_PAGE_SIZE = 6
const PREDICT_AREA_VIZ_CONCURRENCY = 10

/** Run async tasks with a fixed concurrency limit. */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await fn(items[index], index);
      }
    })
  );

  return results;
}

/** GET /predict-area/stored-responses-viz — paginated villages + plot geometries. */
export const fetchPredictAreaStoredViz = async (
  district: string,
  month: string,
  options?: {
    subdistrict?: string | null;
    village?: string | null;
    cropName?: string | null;
    limit?: number;
    offset?: number;
  }
): Promise<PredictAreaStoredVizResponse> => {
  const params = new URLSearchParams({
    district: district.trim(),
    month: month.trim(),
  });
  const sub = (options?.subdistrict || '').trim();
  const vil = (options?.village || '').trim();
  const crop = (options?.cropName || '').trim();
  if (sub) params.set('subdistrict', sub);
  if (vil) params.set('village', vil);
  if (crop && crop.toLowerCase() !== 'all') params.set('crop_name', crop.toLowerCase());
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  const url = `${getBaseUrl()}/predict-area/stored-responses-viz?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(
      `Predict-area stored-responses-viz API Error: ${response.status} ${response.statusText}`
    );
  }
  return response.json();
};

/**
 * Page through stored-responses-viz in parallel (concurrency pool).
 * Fetches page 0 first for total_count, then loads remaining pages concurrently.
 * Calls onPage as each page completes for progressive map updates.
 */
export const fetchPredictAreaStoredVizProgressive = async (
  district: string,
  month: string,
  options?: {
    subdistrict?: string | null;
    village?: string | null;
    cropName?: string | null;
    limit?: number;
    concurrency?: number;
    onPage?: (page: PredictAreaStoredVizResponse) => void;
  }
): Promise<PredictAreaStoredVizResponse> => {
  const pageSize = options?.limit ?? PREDICT_AREA_VIZ_PAGE_SIZE;
  const concurrency = options?.concurrency ?? PREDICT_AREA_VIZ_CONCURRENCY;
  const fetchOpts = {
    subdistrict: options?.subdistrict,
    village: options?.village,
    cropName: options?.cropName,
    limit: pageSize,
  };

  const firstPage = await fetchPredictAreaStoredViz(district, month, {
    ...fetchOpts,
    offset: 0,
  });
  options?.onPage?.(firstPage);

  const merged: PredictAreaResponse[] = [...(firstPage.data || [])];
  const pageLimit = firstPage.limit ?? pageSize;
  const totalCount = firstPage.total_count ?? merged.length;

  if (!firstPage.has_more || totalCount <= merged.length) {
    return {
      ...firstPage,
      data: merged,
      count: merged.length,
      has_more: false,
    };
  }

  const remainingOffsets: number[] = [];
  for (let offset = pageLimit; offset < totalCount; offset += pageLimit) {
    remainingOffsets.push(offset);
  }

  const restPages = await runWithConcurrency(
    remainingOffsets,
    concurrency,
    async (offset) => {
      const page = await fetchPredictAreaStoredViz(district, month, {
        ...fetchOpts,
        offset,
      });
      options?.onPage?.(page);
      return page;
    }
  );

  restPages
    .sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0))
    .forEach((page) => {
      merged.push(...(page.data || []));
    });

  return {
    ...firstPage,
    data: merged,
    count: merged.length,
    has_more: false,
  };
};

export function extractPredictCropFieldPlotsFromViz(
  viz: PredictAreaStoredVizResponse,
  layers: Partial<Record<string, { areas: Record<string, number>; fills?: Record<string, string>; color?: string }>>
): FieldBoundaryPlot[] {
  const villages = Array.isArray(viz?.data) ? viz.data : [];
  return villages.flatMap((villageRes) => extractPredictCropFieldPlots(villageRes, layers));
}

export function formatPredictAreaMonthLabel(ym: string): string {
  const t = ym.trim();
  if (!/^\d{4}-\d{2}$/.test(t)) return ym;
  const [ys, ms] = t.split('-');
  const y = Number(ys);
  const mo = Number(ms);
  if (!y || mo < 1 || mo > 12) return ym;
  return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

/** GET /predict-area/stored-responses — crop areas + field IDs for map coloring */
export const fetchPredictArea = async (
  district: string,
  subdistrict: string,
  village: string,
  /** YYYY-MM; omit or invalid = API uses current month */
  month?: string | null,
  options?: {
    includeBoundaries?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<PredictAreaResponse> => {
  const params = new URLSearchParams({
    district,
    subdistrict,
    village,
    include_boundaries: String(options?.includeBoundaries ?? false),
    limit: String(options?.limit ?? 100),
    offset: String(options?.offset ?? 0),
  });
  if (month && /^\d{4}-\d{2}$/.test(month.trim())) {
    params.set('month', month.trim());
  }
  const url = `${getBaseUrl()}/predict-area/stored-responses?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Predict-area stored-responses API Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

/** GET /predict-area/stored-responses/subdistrict — all crops + plot_id for map join */
export const fetchPredictAreaSubdistrict = async (
  district: string,
  subdistrict: string,
  month: string,
  options?: {
    includeBoundaries?: boolean;
    cropName?: string | null;
  }
): Promise<PredictAreaResponse> => {
  const params = new URLSearchParams({
    district: district.trim(),
    subdistrict: subdistrict.trim(),
    month: month.trim(),
    include_boundaries: String(options?.includeBoundaries ?? false),
  });
  const crop = (options?.cropName || '').trim();
  if (crop && crop.toLowerCase() !== 'all') {
    params.set('crop_name', crop.toLowerCase());
  }
  const url = `${getBaseUrl()}/predict-area/stored-responses/subdistrict?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(
      `Predict-area subdistrict stored-responses API Error: ${response.status} ${response.statusText}`
    );
  }
  return response.json();
};

/** GET /predict-area/crop-areas — district rollup (subdistrict_wise) or village-wise for a subdistrict */
export interface PredictAreaCropAreasResponse {
  scope: string;
  district: string;
  subdistrict?: string | null;
  month: string;
  crop_name: string;
  metric?: string;
  unit?: string;
  totals: Record<string, number>;
  village_wise?: Record<string, Record<string, number>>;
  subdistrict_wise?: Record<string, Record<string, number>>;
  villages_with_data?: number;
  subdistricts_with_data?: number;
  source?: string;
  aggregation?: string;
}

export const fetchPredictAreaCropAreas = async (
  district: string,
  subdistrict: string | null | undefined,
  month: string,
  cropName?: string
): Promise<PredictAreaCropAreasResponse> => {
  const params = new URLSearchParams({
    district: district.trim(),
    month: month.trim(),
  });
  if (subdistrict?.trim()) {
    params.set('subdistrict', subdistrict.trim());
  }
  const crop = (cropName || '').trim();
  if (crop && crop.toLowerCase() !== 'all') {
    params.set('crop_name', crop.toLowerCase());
  }
  const url = `${getBaseUrl()}/predict-area/crop-areas?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Predict-area crop-areas API Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

/** Match village_wise API key to a /villages list item (case-insensitive). */
export function matchVillageItem(
  apiVillageName: string,
  villageList: VillageItem[]
): VillageItem | undefined {
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(apiVillageName);
  return (
    villageList.find((v) => norm(v.village) === target) ||
    villageList.find((v) => norm(v.village).replace(/\s+/g, '') === target.replace(/\s+/g, ''))
  );
}

// Fetch Growth Analysis for district/subdistrict/village
export interface GrowthPlotData {
  type?: string; // "Feature" for GeoJSON format
  geometry?: {
    type: string;
    coordinates: number[][][]; // [[[lng, lat], [lng, lat], ...]] for Polygon
  };
  properties?: {
    plot_id: string;
    area_acres: number;
    tile_url: string;
    start_date?: string;
    end_date?: string;
    data_source?: string;
    last_updated?: string;
  };
  // Direct format (for backward compatibility)
  plot_id?: string;
  area_acres?: number;
  tile_url?: string;
  coordinates?: number[][]; // [[lng, lat], [lng, lat], ...]
}

export interface GrowthPixelSummary {
  healthy_pixel_count?: number;
  healthy_pixel_percentage?: number;
  moderate_pixel_count?: number;
  moderate_pixel_percentage?: number;
  weak_pixel_count?: number;
  weak_pixel_percentage?: number;
  stress_pixel_count?: number;
  stress_pixel_percentage?: number;
  total_pixel_count?: number;
  [key: string]: any;
}

export interface GrowthAnalysisResponse {
  status?: string;
  district?: string;
  subdistrict?: string;
  village?: string;
  plots: GrowthPlotData[];
  pixel_summary?: GrowthPixelSummary;
  area_hectares?: number;
  [key: string]: any; // Allow additional properties
}

// Growth classwise API can return { current, stored } - current = latest analysis, stored = historical by year_month
export interface GrowthClasswiseApiCurrent {
  type?: string;
  features?: GrowthPlotData[];
  pixel_summary?: GrowthPixelSummary;
  classwise?: Array<{ class_id?: number; class_name?: string; color?: string; percentage?: number; area_hectares?: number; tile_url?: string }>;
  villages?: string[];
}

export interface GrowthClasswiseApiStoredItem {
  id?: number;
  district?: string;
  subdistrict?: string;
  village?: string | null;
  year_month: string;
  created_at?: string;
  response_data?: {
    type?: string;
    features?: GrowthPlotData[];
    pixel_summary?: GrowthPixelSummary & { area_hectares?: number };
    classwise?: Array<{ class_id?: number; class_name?: string; color?: string; percentage?: number; area_hectares?: number; tile_url?: string }>;
  };
  request_params?: Record<string, unknown>;
}

export interface GrowthAnalysisWithStoredResponse extends GrowthAnalysisResponse {
  stored?: GrowthStoredItem[];
}

/** Read total area (ha) from analyze_Growthclasswise response — prefers pixel_summary.area_hectares. */
export const extractGrowthAreaHectares = (response: unknown): number | null => {
  if (!response || typeof response !== 'object') return null;
  const r = response as Record<string, unknown>;
  const current = r.current as Record<string, unknown> | undefined;
  const candidates = [
    r.area_hectares,
    (r.pixel_summary as Record<string, unknown> | undefined)?.area_hectares,
    r.total_area_hectares,
    current?.pixel_summary && (current.pixel_summary as Record<string, unknown>).area_hectares,
  ];
  for (const value of candidates) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
};

/** Fetch location total area (ha) from analyze_Growthclasswise. */
export const fetchLocationTotalAreaHectares = async (
  district: string,
  subdistrict?: string,
  village?: string
): Promise<number | null> => {
  const response = await fetchGrowthAnalysis1(district, subdistrict, village);
  return extractGrowthAreaHectares(response);
};

export const fetchGrowthAnalysis1 = async (
  district: string,
  subdistrict?: string,
  village?: string,
  /** Optional field_boundaries.field_id — analyzes a single plot only */
  fieldId?: number | null
): Promise<GrowthAnalysisWithStoredResponse> => {
  try {
    let url = `${getBaseUrl()}/analyze_Growthclasswise?district=${encodeURIComponent(district)}`;
    if (subdistrict) {
      url += `&subdistrict=${encodeURIComponent(subdistrict)}`;
    }
    if (village) {
      url += `&village=${encodeURIComponent(village)}`;
    }
    if (fieldId != null && Number.isFinite(fieldId) && fieldId > 0) {
      url += `&field_id=${encodeURIComponent(String(Math.trunc(fieldId)))}`;
    }

    const response = await postJsonWithRetry(url);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const raw: { current?: GrowthClasswiseApiCurrent; stored?: GrowthClasswiseApiStoredItem[] } = await response.json();

    // New format: { current, stored }
    if (raw.current != null) {
      const current = raw.current;
      // Support both current.features (array) and current.feature (single Feature with geometry + tile_url)
      const plots =
        Array.isArray((current as any).features) && (current as any).features.length > 0
          ? (current as any).features
          : ((current as any).feature && (current as any).feature.type === 'Feature'
              ? [(current as any).feature]
              : []);
      const result: GrowthAnalysisWithStoredResponse = {
        plots,
        pixel_summary: current.pixel_summary,
        classwise: current.classwise,
        villages: current.villages,
        area_hectares: current.pixel_summary?.area_hectares
      };
      if (raw.stored && Array.isArray(raw.stored)) {
        result.stored = raw.stored.map((item: GrowthClasswiseApiStoredItem) => ({
          year_month: item.year_month,
          id: item.id,
          district: item.district,
          subdistrict: item.subdistrict,
          village: item.village,
          created_at: item.created_at,
          response_data: item.response_data,
          request_params: item.request_params
        })) as GrowthStoredItem[];
      }
      return result;
    }

    // Legacy: flat response (plots/pixel_summary at top level)
    return raw as unknown as GrowthAnalysisWithStoredResponse;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/analyze_Growthclasswise`);
    }
    throw error;
  }
};

// Fetch Water Uptake Analysis (same API shape as Growth: { current, stored })
export const fetchWaterUptakeAnalysis = async (
  district: string,
  subdistrict?: string,
  village?: string,
  /** Optional field_boundaries.field_id — analyzes a single plot only */
  fieldId?: number | null
): Promise<GrowthAnalysisWithStoredResponse> => {
  try {
    let url = `${getBaseUrl()}/wateruptakeclasswise?district=${encodeURIComponent(district)}`;
    if (subdistrict) {
      url += `&subdistrict=${encodeURIComponent(subdistrict)}`;
    }
    if (village) {
      url += `&village=${encodeURIComponent(village)}`;
    }
    if (fieldId != null && Number.isFinite(fieldId) && fieldId > 0) {
      url += `&field_id=${encodeURIComponent(String(Math.trunc(fieldId)))}`;
    }

    const response = await postJsonWithRetry(url);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const raw: { current?: GrowthClasswiseApiCurrent; stored?: GrowthClasswiseApiStoredItem[] } = await response.json();

    if (raw.current != null) {
      const current = raw.current;
      // Support both current.features (array) and current.feature (single Feature with geometry + properties.tile_url)
      const plots =
        Array.isArray((current as any).features) && (current as any).features.length > 0
          ? (current as any).features
          : ((current as any).feature && (current as any).feature.type === 'Feature'
              ? [(current as any).feature]
              : []);
      const result: GrowthAnalysisWithStoredResponse = {
        plots,
        pixel_summary: current.pixel_summary,
        classwise: current.classwise,
        villages: current.villages,
        area_hectares: current.pixel_summary?.area_hectares
      };
      if (raw.stored && Array.isArray(raw.stored)) {
        result.stored = raw.stored.map((item: GrowthClasswiseApiStoredItem) => ({
          year_month: item.year_month,
          id: item.id,
          district: item.district,
          subdistrict: item.subdistrict,
          village: item.village,
          created_at: item.created_at,
          response_data: item.response_data,
          request_params: item.request_params
        })) as GrowthStoredItem[];
      }
      return result;
    }

    return raw as unknown as GrowthAnalysisWithStoredResponse;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/wateruptakeclasswise`);
    }
    throw error;
  }
};

// Fetch Soil Moisture Analysis (same API shape as Growth: { current, stored })
export const fetchSoilMoistureAnalysis = async (
  district: string,
  subdistrict?: string,
  village?: string,
  /** Optional field_boundaries.field_id — analyzes a single plot only */
  fieldId?: number | null
): Promise<GrowthAnalysisWithStoredResponse> => {
  try {
    let url = `${getBaseUrl()}/SoilMoistureclasswise?district=${encodeURIComponent(district)}`;
    if (subdistrict) {
      url += `&subdistrict=${encodeURIComponent(subdistrict)}`;
    }
    if (village) {
      url += `&village=${encodeURIComponent(village)}`;
    }
    if (fieldId != null && Number.isFinite(fieldId) && fieldId > 0) {
      url += `&field_id=${encodeURIComponent(String(Math.trunc(fieldId)))}`;
    }

    const response = await postJsonWithRetry(url);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const raw: { current?: GrowthClasswiseApiCurrent; stored?: GrowthClasswiseApiStoredItem[] } = await response.json();

    if (raw.current != null) {
      const current = raw.current;
      // Support both current.features (array) and current.feature (single Feature)
      const plots =
        Array.isArray((current as any).features) && (current as any).features.length > 0
          ? (current as any).features
          : ((current as any).feature && (current as any).feature.type === 'Feature'
              ? [(current as any).feature]
              : []);
      const result: GrowthAnalysisWithStoredResponse = {
        plots,
        pixel_summary: current.pixel_summary,
        classwise: current.classwise,
        villages: current.villages,
        area_hectares: current.pixel_summary?.area_hectares
      };
      if (raw.stored && Array.isArray(raw.stored)) {
        result.stored = raw.stored.map((item: GrowthClasswiseApiStoredItem) => ({
          year_month: item.year_month,
          id: item.id,
          district: item.district,
          subdistrict: item.subdistrict,
          village: item.village,
          created_at: item.created_at,
          response_data: item.response_data,
          request_params: item.request_params
        })) as GrowthStoredItem[];
      }
      return result;
    }

    return raw as unknown as GrowthAnalysisWithStoredResponse;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/SoilMoistureclasswise`);
    }
    throw error;
  }
};

// Fetch Pest Detection Analysis – POST pest-detectionclasswise returns { current: { features, hierarchy }, stored: [{ year_month, response_data: { hierarchy, tile_url, total_area_ha } }] }
export const fetchPestDetectionAnalysis = async (
  district: string,
  subdistrict?: string,
  village?: string,
  coordinates?: number[][],
  /** Optional field_boundaries.field_id — analyzes a single plot only */
  fieldId?: number | null
): Promise<GrowthAnalysisWithStoredResponse & { hierarchy?: Record<string, { total_area_ha?: number; percentage?: number; children?: Record<string, unknown>; tile_url?: string }>; total_area_ha?: number }> => {
  try {
    let url = `${getBaseUrl()}/pest-detectionclasswise?district=${encodeURIComponent(district)}`;
    if (subdistrict) {
      url += `&subdistrict=${encodeURIComponent(subdistrict)}`;
    }
    if (village) {
      url += `&village=${encodeURIComponent(village)}`;
    }
    if (fieldId != null && Number.isFinite(fieldId) && fieldId > 0) {
      url += `&field_id=${encodeURIComponent(String(Math.trunc(fieldId)))}`;
    }
    // Request all stored results for time series (backend may support limit; default might return only a few)
    url += '&limit=100';

    let body = '';
    if (coordinates && coordinates.length > 0) {
      body = JSON.stringify({ coordinates });
    }

    const response = await postJsonWithRetry(
      url,
      body,
      body
        ? { accept: 'application/json', 'Content-Type': 'application/json' }
        : { accept: 'application/json' }
    );

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const raw: { current?: GrowthClasswiseApiCurrent & { hierarchy?: Record<string, { total_area_ha?: number; percentage?: number; children?: Record<string, unknown>; tile_url?: string }> }; stored?: GrowthClasswiseApiStoredItem[] } = await response.json();

    if (raw.current != null) {
      const current = raw.current;
      const plots =
        Array.isArray(current.features) && current.features.length > 0
          ? current.features
          : ((current as any).feature && (current as any).feature.type === 'Feature'
              ? [(current as any).feature]
              : []);
      const firstFeature = plots[0];
      const totalAreaHa = (firstFeature as any)?.properties?.total_area_ha ?? (current as any).total_area_ha;
      const result: GrowthAnalysisWithStoredResponse & { hierarchy?: Record<string, { total_area_ha?: number; percentage?: number; children?: Record<string, unknown>; tile_url?: string }>; total_area_ha?: number } = {
        plots,
        pixel_summary: current.pixel_summary,
        classwise: current.classwise,
        villages: current.villages,
        area_hectares: current.pixel_summary?.area_hectares,
        hierarchy: (current as any).hierarchy,
        total_area_ha: totalAreaHa
      };
      if (raw.stored && Array.isArray(raw.stored)) {
        result.stored = raw.stored.map((item: GrowthClasswiseApiStoredItem) => ({
          year_month: item.year_month,
          id: item.id,
          district: item.district,
          subdistrict: item.subdistrict,
          village: item.village,
          created_at: item.created_at,
          response_data: item.response_data,
          request_params: item.request_params
        })) as GrowthStoredItem[];
      }
      return result;
    }

    return raw as unknown as GrowthAnalysisWithStoredResponse;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/pest-detectionclasswise`);
    }
    throw error;
  }
};

// Stored Pest Detection (time series by year_month) - /api-stored/pest-detection
export interface PestStoredItem {
  year_month: string; // e.g. "2024-12"
  [key: string]: any; // other fields from API (tile_url, area_ha, etc.)
}

export type PestStoredResponse = PestStoredItem[];

/** Build query string for /api-stored/* endpoints (district required; subdistrict/village optional). */
function storedSeriesQuery(
  district: string,
  subdistrict?: string,
  village?: string,
  limit = 500
): string {
  const params = new URLSearchParams({ district, limit: String(limit) });
  if (subdistrict?.trim()) params.set('subdistrict', subdistrict.trim());
  if (village?.trim()) params.set('village', village.trim());
  return params.toString();
}

/** Try village → subdistrict → district until stored rows are found. */
export async function fetchStoredSeriesWithFallback<T>(
  fetcher: (
    district: string,
    subdistrict?: string,
    village?: string,
    limit?: number
  ) => Promise<T[]>,
  district: string,
  subdistrict?: string,
  village?: string,
  limit = 500
): Promise<T[]> {
  const attempts: Array<{ sub?: string; vil?: string }> = [];
  if (village?.trim() && subdistrict?.trim()) {
    attempts.push({ sub: subdistrict.trim(), vil: village.trim() });
  }
  if (subdistrict?.trim()) {
    attempts.push({ sub: subdistrict.trim(), vil: undefined });
  }
  attempts.push({ sub: undefined, vil: undefined });

  for (const { sub, vil } of attempts) {
    try {
      const rows = await fetcher(district, sub, vil, limit);
      if (rows.length > 0) return rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('404')) continue;
      throw err;
    }
  }
  return [];
}

async function fetchStoredJson<T>(
  url: string,
  label: string
): Promise<T[]> {
  const response = await getJsonWithRetry(url);
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  const raw = await response.json();
  return unwrapStoredApiResponse<T>(raw);
}

export const fetchPestStoredSeries = async (
  district: string,
  subdistrict?: string,
  village?: string,
  limit: number = 500
): Promise<PestStoredResponse> => {
  try {
    const url = `${getBaseUrl()}/api-stored/pest-detection?${storedSeriesQuery(district, subdistrict, village, limit)}`;
    return fetchStoredJson<PestStoredItem>(url, 'pest-detection');
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/api-stored/pest-detection`);
    }
    throw error;
  }
};

export const fetchPestStoredSeriesWithFallback = (
  district: string,
  subdistrict?: string,
  village?: string,
  limit = 500
) => fetchStoredSeriesWithFallback(fetchPestStoredSeries, district, subdistrict, village, limit);

// Stored Growth (time series by year_month) - /api-stored/growth
export interface GrowthStoredItem {
  year_month: string;
  request_params?: { start_date?: string; end_date?: string; [key: string]: unknown };
  response_data?: {
    total_area_ha?: number;
    pixel_summary?: { area_hectares?: number; analysis_start_date?: string; analysis_end_date?: string };
    classwise?: Array<{ area_hectares?: number }>;
    features?: Array<{ properties?: { area_ha?: number; area?: number; area_acres?: number; start_date?: string; end_date?: string } }>;
  };
  [key: string]: any;
}

export type GrowthStoredResponse = GrowthStoredItem[];

export const fetchGrowthStoredSeries = async (
  district: string,
  subdistrict?: string,
  village?: string,
  limit: number = 500
): Promise<GrowthStoredResponse> => {
  try {
    const url = `${getBaseUrl()}/api-stored/growth?${storedSeriesQuery(district, subdistrict, village, limit)}`;
    return fetchStoredJson<GrowthStoredItem>(url, 'growth');
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/api-stored/growth`);
    }
    throw error;
  }
};

export const fetchGrowthStoredSeriesWithFallback = (
  district: string,
  subdistrict?: string,
  village?: string,
  limit = 500
) => fetchStoredSeriesWithFallback(fetchGrowthStoredSeries, district, subdistrict, village, limit);

// Stored Water Uptake (time series by year_month) - /api-stored/water-uptake
export interface WaterUptakeStoredItem {
  year_month: string;
  response_data?: {
    total_area_ha?: number;
    pixel_summary?: { area_hectares?: number };
    classwise?: Array<{ area_hectares?: number; class_name?: string }>;
    features?: Array<{ properties?: { area_ha?: number; area?: number; area_acres?: number } }>;
  };
  [key: string]: any;
}
export type WaterUptakeStoredResponse = WaterUptakeStoredItem[];

export const fetchWaterUptakeStoredSeries = async (
  district: string,
  subdistrict?: string,
  village?: string,
  limit: number = 500
): Promise<WaterUptakeStoredResponse> => {
  try {
    const url = `${getBaseUrl()}/api-stored/water-uptake?${storedSeriesQuery(district, subdistrict, village, limit)}`;
    return fetchStoredJson<WaterUptakeStoredItem>(url, 'water-uptake');
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/api-stored/water-uptake`);
    }
    throw error;
  }
};

export const fetchWaterUptakeStoredSeriesWithFallback = (
  district: string,
  subdistrict?: string,
  village?: string,
  limit = 500
) => fetchStoredSeriesWithFallback(fetchWaterUptakeStoredSeries, district, subdistrict, village, limit);

// Stored Soil Moisture (time series by year_month) - /api-stored/soil-moisture
export interface SoilMoistureStoredItem {
  year_month: string;
  response_data?: {
    total_area_ha?: number;
    pixel_summary?: { area_hectares?: number };
    classwise?: Array<{ area_hectares?: number; class_name?: string }>;
    features?: Array<{ properties?: { area_ha?: number; area?: number; area_acres?: number } }>;
  };
  [key: string]: any;
}
export type SoilMoistureStoredResponse = SoilMoistureStoredItem[];

export const fetchSoilMoistureStoredSeries = async (
  district: string,
  subdistrict?: string,
  village?: string,
  limit: number = 500
): Promise<SoilMoistureStoredResponse> => {
  try {
    const url = `${getBaseUrl()}/api-stored/soil-moisture?${storedSeriesQuery(district, subdistrict, village, limit)}`;
    return fetchStoredJson<SoilMoistureStoredItem>(url, 'soil-moisture');
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/api-stored/soil-moisture`);
    }
    throw error;
  }
};

export const fetchSoilMoistureStoredSeriesWithFallback = (
  district: string,
  subdistrict?: string,
  village?: string,
  limit = 500
) => fetchStoredSeriesWithFallback(fetchSoilMoistureStoredSeries, district, subdistrict, village, limit);

/** GET /api-stored/districts/latest — district crop areas + classwise stored rows for splash/dashboard. */
export interface StoredDistrictCropAreasHa {
  sugarcane?: number;
  wheat?: number;
  onion?: number;
  banana?: number;
  mango?: number;
  [crop: string]: number | undefined;
}

export interface StoredDistrictCropwiseArea {
  district?: string;
  year_month?: string;
  is_current_month?: boolean;
  unit?: string;
  aggregation?: string;
  villages_counted?: number;
  subdistricts_with_data?: number;
  crop_areas_ha?: StoredDistrictCropAreasHa;
  total_crop_area_ha?: number;
}

export interface StoredDistrictClasswiseItem {
  color?: string;
  class_id?: number;
  class_name?: string;
  percentage?: number;
  area_hectares?: number;
}

export interface StoredDistrictAnalysisBlock {
  district?: string;
  year_month?: string;
  is_current_month?: boolean;
  obs_date?: string;
  created_at?: string;
  response_data?: {
    classwise?: StoredDistrictClasswiseItem[];
    pixel_summary?: Record<string, unknown>;
    hierarchy?: Record<
      string,
      {
        percentage?: number;
        total_area_ha?: number;
        children?: Record<string, { area_ha?: number; pct_of_parent?: number }>;
      }
    >;
    feature?: unknown;
    features?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface StoredDistrictLatestItem {
  district: string;
  cropwise_area?: StoredDistrictCropwiseArea | null;
  pest_detection?: StoredDistrictAnalysisBlock | null;
  growth?: StoredDistrictAnalysisBlock | null;
  water_uptake?: StoredDistrictAnalysisBlock | null;
  soil_moisture?: StoredDistrictAnalysisBlock | null;
}

export interface StoredDistrictsLatestResponse {
  month?: string;
  current_month?: string;
  districts_count?: number;
  note?: string;
  districts: StoredDistrictLatestItem[];
}

const districtsLatestCache = createApiCache<StoredDistrictsLatestResponse>();
const DISTRICTS_LATEST_TTL_MS = 10 * 60 * 1000;

export const fetchStoredDistrictsLatest = async (
  month: string,
  includeResponse = true
): Promise<StoredDistrictsLatestResponse> => {
  const m = (month || getCurrentPredictAreaMonth()).trim();
  const cacheKey = `districts-latest:${m}:${includeResponse ? '1' : '0'}`;
  return districtsLatestCache.getOrFetch(cacheKey, DISTRICTS_LATEST_TTL_MS, async () => {
    const params = new URLSearchParams({
      month: m,
      include_response: String(includeResponse),
    });
    const url = `${getBaseUrl()}/api-stored/districts/latest?${params.toString()}`;
    try {
      const response = await getJsonWithRetry(url);
      if (!response.ok) {
        throw new Error(
          `Districts latest API Error: ${response.status} ${response.statusText}`
        );
      }
      const raw = (await response.json()) as StoredDistrictsLatestResponse;
      return {
        ...raw,
        districts: Array.isArray(raw?.districts) ? raw.districts : [],
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error: Unable to connect to ${url}`);
      }
      throw error;
    }
  });
};

/** Start fetch before login so district splash has data ready. */
export function preloadStoredDistrictsLatest(month?: string): void {
  const m =
    month && /^\d{4}-\d{2}$/.test(month.trim())
      ? month.trim()
      : getCurrentPredictAreaMonth();
  void fetchStoredDistrictsLatest(m, true).catch(() => {
    /* preload is best-effort */
  });
}

/** Prefer class % by name (case-insensitive); falls back to 0. */
export function classwisePct(
  block: StoredDistrictAnalysisBlock | null | undefined,
  className: string
): number {
  const list = block?.response_data?.classwise;
  if (!Array.isArray(list)) return 0;
  const target = className.trim().toLowerCase();
  const hit = list.find((c) => (c.class_name || '').trim().toLowerCase() === target);
  const pct = hit?.percentage;
  return typeof pct === 'number' && !Number.isNaN(pct) ? pct : 0;
}

export function pestHealthyPct(
  block: StoredDistrictAnalysisBlock | null | undefined
): number {
  const pct = block?.response_data?.hierarchy?.healthy?.percentage;
  return typeof pct === 'number' && !Number.isNaN(pct) ? pct : 0;
}

// Dashboard indices store - POST returns stored indices for the given district, subdistrict, frequency
export type DashboardIndicesFrequency = 'weekly' | 'monthly' | 'yearly';

export interface DashboardIndicesStoredItem {
  index_name: string;
  period_date: string;
  frequency: string;
  value: number;
  created_at: string;
}

export interface DashboardIndicesStoreResponse {
  current?: { status?: string; from_cache?: boolean };
  stored?: DashboardIndicesStoredItem[];
  indices?: string[];
  /** Wide time series: one row per period with all index columns (API v2) */
  series?: Array<Record<string, unknown>>;
  count?: number;
  filters?: Record<string, unknown>;
  note?: string;
  croptype_applied?: boolean;
  data?: unknown;
  [key: string]: unknown;
}

const SERIES_ROW_META_KEYS = new Set(['period', 'period_date']);

function seriesRowsToStored(
  series: Array<Record<string, unknown>>,
  frequency: DashboardIndicesFrequency
): DashboardIndicesStoredItem[] {
  const stored: DashboardIndicesStoredItem[] = [];
  for (const row of series) {
    const period = String(row.period ?? row.period_date ?? '');
    for (const [k, v] of Object.entries(row)) {
      if (SERIES_ROW_META_KEYS.has(k.toLowerCase())) continue;
      if (typeof v === 'number' && !Number.isNaN(v)) {
        stored.push({
          index_name: k,
          period_date: period,
          frequency,
          value: v,
          created_at: '',
        });
      }
    }
  }
  return stored;
}

export const fetchDashboardIndicesStore = async (
  district: string,
  subdistrict: string,
  frequency: DashboardIndicesFrequency,
  village?: string
): Promise<DashboardIndicesStoreResponse> => {
  try {
    const params = new URLSearchParams();
    params.set('district', district);
    if (subdistrict) params.set('subdistrict', subdistrict);
    if (village) params.set('village', village);
    params.set('frequency', frequency);
    const url = `${getBaseUrl()}/indices/retrieve-aggregated?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    // GET /indices/retrieve-aggregated: long { indices: [...] } or wide { series: [...] } → { stored: [...] }
    const raw = data as {
      stored?: DashboardIndicesStoredItem[];
      indices?: Array<Record<string, unknown>>;
      series?: Array<Record<string, unknown>>;
    };
    // Wide `series` format (possibly empty): always materialize `stored` so the UI can render charts / empty state.
    if (Array.isArray(raw.series) && (!Array.isArray(raw.stored) || raw.stored.length === 0)) {
      const stored = seriesRowsToStored(raw.series, frequency);
      return { ...data, stored } as DashboardIndicesStoreResponse;
    }
    if (Array.isArray(raw.indices) && !Array.isArray(raw.stored)) {
      const stored = raw.indices.map((item: Record<string, unknown>) => ({
        index_name: String(item.index_name ?? item.indexName ?? ''),
        period_date: String(item.period_date ?? item.periodDate ?? ''),
        frequency: String(item.frequency ?? frequency),
        value: Number(item.value ?? 0),
        created_at: String(item.created_at ?? item.createdAt ?? ''),
      })) as DashboardIndicesStoredItem[];
      return { ...data, stored } as DashboardIndicesStoreResponse;
    }
    return data as DashboardIndicesStoreResponse;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/indices/retrieve-aggregated`);
    }
    throw error;
  }
};

// Pest detection classwise hierarchy response (plot-level / district-level)
export interface PestHierarchyChild {
  tile_url: string;
  area_ha: number;
  pct_of_parent: number;
}

export interface PestHierarchyNode {
  tile_url: string | null;
  total_area_ha: number;
  percentage: number;
  children: Record<string, PestHierarchyChild>;
}

export interface PestHierarchyResponse {
  plot?: string;
  total_area_ha: number;
  hierarchy: Record<string, PestHierarchyNode>;
}

// Analysis response types
export interface PixelSummary {
  total_pixel_count: number;
  healthy_pixel_count: number;
  healthy_pixel_percentage: number;
  moderate_pixel_count: number;
  moderate_pixel_percentage: number;
  weak_pixel_count: number;
  weak_pixel_percentage: number;
  stress_pixel_count: number;
  stress_pixel_percentage: number;
  analysis_start_date: string;
  analysis_end_date: string;
  latest_image_date: string;
}

export interface AnalysisFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    file_name: string;
    taluka_name: string;
    taluka_number: string;
    plot_id: number;
    area_ha: number;
    start_date: string;
    end_date: string;
    tile_url: string | null;
    data_source: string;
    latest_image_date: string;
    last_updated: string;
  };
}

export interface AnalysisResponse {
  type: 'FeatureCollection';
  features: AnalysisFeature[];
  pixel_summary: PixelSummary;
}

// Fetch Growth analysis
export const fetchGrowthAnalysis = async (
  talukaName: string,
  plotNo: number | string
): Promise<AnalysisResponse> => {
  try {
    const url = `${getBaseUrl()}/analyze_Growthclasswise?taluka_name=${encodeURIComponent(talukaName)}&plot_no=${plotNo}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json'
      },
      body: ''
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: AnalysisResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to Growth analysis API`);
    }
    throw error;
  }
};

// Fetch Water Uptake analysis
export interface WaterUptakePixelSummary {
  total_pixel_count: number;
  deficient_pixel_count: number;
  deficient_pixel_percentage: number;
  less_pixel_count: number;
  less_pixel_percentage: number;
  adequate_pixel_count: number;
  adequate_pixel_percentage: number;
  excellent_pixel_count: number;
  excellent_pixel_percentage: number;
  excess_pixel_count: number;
  excess_pixel_percentage: number;
  shallow_water_pixel_count: number;
  shallow_water_pixel_percentage: number;
  analysis_start_date: string;
  analysis_end_date: string;
  latest_image_date: string;
}

export interface WaterUptakeResponse {
  type: 'FeatureCollection';
  features: AnalysisFeature[];
  pixel_summary: WaterUptakePixelSummary;
}

export const fetchWaterUptake = async (
  talukaName: string,
  plotNo: number | string
): Promise<WaterUptakeResponse> => {
  try {
    // Correct endpoint name (double "ss") and query format:
    // /wateruptakeclasswise?taluka_name=...&plot_no=...
    const url = `${getBaseUrl()}/wateruptakeclasswise?taluka_name=${encodeURIComponent(talukaName)}&plot_no=${plotNo}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json'
      },
      body: ''
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: WaterUptakeResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to Water Uptake API`);
    }
    throw error;
  }
};

// Fetch Soil Moisture analysis
export interface SoilMoisturePixelSummary {
  total_pixel_count: number;
  very_dry_pixel_count: number;
  very_dry_pixel_percentage: number;
  dry_pixel_count: number;
  dry_pixel_percentage: number;
  optimal_pixel_count: number;
  optimal_pixel_percentage: number;
  wet_pixel_count: number;
  wet_pixel_percentage: number;
  very_wet_pixel_count: number;
  very_wet_pixel_percentage: number;
  analysis_start_date: string;
  analysis_end_date: string;
  latest_image_date: string;
}

export interface SoilMoistureResponse {
  type: 'FeatureCollection';
  features: AnalysisFeature[];
  pixel_summary: SoilMoisturePixelSummary;
}

export const fetchSoilMoisture = async (
  talukaName: string,
  plotNo: number | string
): Promise<SoilMoistureResponse> => {
  try {
    // Fix query-string format: /SoilMoistureclasswise?taluka_name=...&plot_no=...
    const url = `${getBaseUrl()}/SoilMoistureclasswise?taluka_name=${encodeURIComponent(talukaName)}&plot_no=${plotNo}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json'
      },
      body: ''
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: SoilMoistureResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to Soil Moisture API`);
    }
    throw error;
  }
};

// Fetch Pest Detection analysis
export interface PestDetectionPixelSummary {
  total_pixel_count: number;
  fungi_pixel_count: number;
  fungi_pixel_percentage: number;
  sucking_pixel_count: number;
  sucking_pixel_percentage: number;
  wilt_pixel_count: number;
  wilt_pixel_percentage: number;
  soilborn_pixel_count: number;
  soilborn_pixel_percentage: number;
  baseline_pixel_count: number;
  baseline_pixel_percentage: number;
  analysis_start_date: string;
  analysis_end_date: string;
  latest_image_date: string;
}

export interface PestDetectionResponse {
  type: 'FeatureCollection';
  features: AnalysisFeature[];
  pixel_summary: PestDetectionPixelSummary;
}

export const fetchPestDetection = async (
  talukaName: string,
  plotNo: number | string
): Promise<PestDetectionResponse> => {
  try {
    const url = `${getBaseUrl()}/pest-detectionclasswise?taluka_name=${encodeURIComponent(talukaName)}&plot_no=${plotNo}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json'
      },
      body: ''
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: PestDetectionResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to Pest Detection API`);
    }
    throw error;
  }
};

// Fetch taluka plot IDs using load-taluka endpoint
export interface LoadTalukaPlot {
  plot_id: string;
  geom_type?: string;
  coords?: number[][]; // [lng, lat] coordinates array
  [key: string]: any; // Allow additional properties
}

export interface LoadTalukaResponse {
  status: string;
  taluka: string;
  total_plots_loaded: number;
  plot_ids?: string[]; // For format with array of plot ID strings
  plots?: LoadTalukaPlot[]; // For format with array of plot objects with coordinates
}

export const loadTalukaPlots = async (talukaName: string): Promise<LoadTalukaResponse> => {
  try {
    const url = `${getBaseUrl()}/load-taluka?taluka_name=${encodeURIComponent(talukaName)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    // Try to parse the response, handling potential large response issues
    let data: any;
    try {
      const responseText = await response.text();
      
      // Check if response is too large or empty
      if (!responseText || responseText.length === 0) {
        throw new Error('Empty response from server');
      }
      
      // Parse JSON from text
      data = JSON.parse(responseText);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(`Failed to parse JSON response: ${parseError.message}`);
      } else if (parseError instanceof Error && parseError.message.includes('Invalid string length')) {
        throw new Error('Response is too large to parse. Please contact support.');
      }
      throw parseError;
    }
    
    if (data.status === 'success') {
      // Handle two possible response formats:
      // 1. Format with plot_ids array: { plot_ids: ["1", "2", ...] }
      // 2. Format with plots array: { plots: [{ plot_id: "1" }, { plot_id: "2" }, ...] }
      
      let plotIds: string[] = [];
      
      if (data.plot_ids && Array.isArray(data.plot_ids)) {
        // Format 1: plot_ids is an array of strings
        plotIds = data.plot_ids;
      } else if (data.plots && Array.isArray(data.plots)) {
        // Format 2: plots is an array of objects with plot_id
        plotIds = data.plots.map((plot: LoadTalukaPlot) => String(plot.plot_id));
      } else {
        throw new Error('Invalid response format: neither plot_ids array nor plots array found');
      }
      
      // Return normalized response with plot_ids array and plots array if available
      return {
        status: data.status,
        taluka: data.taluka,
        total_plots_loaded: data.total_plots_loaded || 0,
        plot_ids: plotIds,
        plots: data.plots || undefined // Include plots array if available (with coordinates)
      };
    } else {
      throw new Error(`Invalid response format: expected status "success", got "${data.status}"`);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/load-taluka`);
    }
    throw error;
  }
};

// Fetch all plots for a taluka
export interface TalukaPlotsResponse {
  status: string;
  file: string;
  total_features: number;
  geojson: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      geometry: {
        type: 'Polygon';
        coordinates: number[][][];
      };
      properties: {
        area_ha: string;
        plot_id: string;
        'system:index'?: string;
      };
    }>;
  };
}

/** Fetch admin boundary from /fetch-boundaries (replaces removed /get-geojson). */
export const fetchBoundaryGeoJSON = async (
  district: string,
  subdistrict?: string,
  village?: string
): Promise<FieldBoundaryPlot[]> => {
  try {
    const params = new URLSearchParams({ district });
    if (subdistrict) params.set('subdistrict', subdistrict);
    if (village) params.set('village', village);
    const url = `${getBaseUrl()}/fetch-boundaries?${params.toString()}`;
    const response = await getJsonWithRetry(url);
    if (!response.ok) return [];
    const data = await response.json();
    const label = village || subdistrict || district;
    if (data?.geometry) {
      return geometryToBoundaryPlots(label, data.geometry);
    }
    return [];
  } catch {
    return [];
  }
};

/**
 * Free-text geocoding (Nominatim) for map bounds when fetch-boundaries has no geometry.
 * Follow https://operations.osmfoundation.org/policies/nominatim/ — one request per user action is OK.
 * Returns south/north/west/east in WGS84 (degrees).
 */
export async function fetchNominatimBounds(
  freeTextQuery: string
): Promise<{ south: number; north: number; west: number; east: number } | null> {
  const q = encodeURIComponent(freeTextQuery.trim());
  if (!q) return null;
  const path = isDevelopment
    ? `/nominatim/search?q=${q}&format=json&limit=1&addressdetails=0`
    : `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&addressdetails=0`;
  try {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const b = data[0]?.boundingbox;
    if (!b || b.length < 4) return null;
    const south = parseFloat(b[0]);
    const north = parseFloat(b[1]);
    const west = parseFloat(b[2]);
    const east = parseFloat(b[3]);
    if (![south, north, west, east].every((n) => Number.isFinite(n))) return null;
    if (Math.abs(north - south) < 1e-6 || Math.abs(east - west) < 1e-6) return null;
    return { south, north, west, east };
  } catch {
    return null;
  }
}

export const fetchTalukaPlots = async (talukaName: string): Promise<Array<{id: string; area_ha: string; boundary: Coordinate[]}>> => {
  try {
    const url = isDevelopment
      ? `/api/get-geojson/${encodeURIComponent(talukaName)}`
      : `https://web-production-72a7.up.railway.app/get-geojson/${encodeURIComponent(talukaName)}`;
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      await response.text().catch(() => '');
      throw new Error(`API Error: ${response.status} ${response.statusText}. URL: ${url}`);
    }

    const apiResponse: TalukaPlotsResponse = await response.json();
    const data = apiResponse.geojson;
    
    // Validate response structure
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      throw new Error('Invalid response format: expected GeoJSON FeatureCollection');
    }

    // Transform GeoJSON features to Plot format
    const plots = data.features.map((feature) => {
      // Extract the outer ring coordinates (first array in coordinates)
      const outerRing = feature.geometry.coordinates[0] || [];
      
      // Ensure plot_id is converted to string
      const plotId = String(feature.properties.plot_id);
      
      return {
        id: plotId,
        area_ha: feature.properties.area_ha,
        boundary: outerRing as Coordinate[] // [lng, lat] coordinates
      };
    });

    return plots;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const url = isDevelopment
        ? `/api/get-geojson/${talukaName}`
        : `https://web-production-72a7.up.railway.app/get-geojson/${talukaName}`;
      throw new Error(`Network error: Unable to connect to ${url}. Check CORS settings and network connectivity.`);
    }
    throw error;
  }
};

// NDWI Detection Response Interface
// NDWI Detection Response - same format as GrowthAnalysisResponse
export interface NDWIDetectionResponse {
  status?: string;
  district?: string;
  subdistrict?: string;
  village?: string;
  plots: Array<{
    type?: string; // "Feature" for GeoJSON format
    geometry?: {
      type: string;
      coordinates: number[][][]; // [[[lng, lat], [lng, lat], ...]] for Polygon
    };
    properties?: {
      plot_id: string;
      plot_name?: string;
      tile_url: string;
      water_pixel_percentage: number;
      area_acres?: number;
    };
    // Direct format (for backward compatibility)
    plot_id?: string;
    plot_name?: string;
    coordinates?: number[][]; // [[lng, lat], [lng, lat], ...]
    tile_url?: string;
    water_pixel_percentage?: number;
  }>;
  pixel_summary?: {
    water_pixel_percentage?: number;
  };
  water_area_hectare?: number; // Total water area in hectares (root level, if available)
  area_summary?: {
    total_area_hectare?: number;
    water_area_hectare?: number;
    water_area_percentage?: number;
  };
}

// Fetch NDWI Detection data - same signature as other analysis functions
export const fetchNDWIDetection = async (
  district: string,
  subdistrict?: string,
  village?: string
): Promise<NDWIDetectionResponse> => {
  try {
    // Validate required parameter
    if (!district || district.trim() === '') {
      throw new Error('District parameter is required for NDWI Detection');
    }
    
    // Build URL with available parameters (same as other analysis endpoints)
    let url = `${getBaseUrl()}/NDWIDetection?district=${encodeURIComponent(district.trim())}`;
    if (subdistrict && subdistrict.trim() !== '') {
      url += `&subdistrict=${encodeURIComponent(subdistrict.trim())}`;
    }
    if (village && village.trim() !== '') {
      url += `&village=${encodeURIComponent(village.trim())}`;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json'
      },
      body: ''
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      
      // Try to parse error as JSON for more details
      let errorMessage = `NDWI API Error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail || errorJson.message || errorJson.error) {
          errorMessage += ` - ${errorJson.detail || errorJson.message || errorJson.error}`;
        }
      } catch (e) {
        // If not JSON, use the text as is
        if (errorText) {
          errorMessage += ` - ${errorText}`;
        }
      }
      
      throw new Error(errorMessage);
    }

    const data: NDWIDetectionResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/NDWIDetection`);
    }
    throw error;
  }
};

// Forest Canopy Height Age Structure Response
export interface ForestCanopyResponse {
  plot_name: string;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
  canopy_summary: {
    mean_height_m: number;
    min_height_m: number;
    max_height_m: number;
    p99_height_m: number;
  };
  age_classes: {
    young: {
      tile_url: string;
      area_hectares: number;
    };
    mid_age: {
      tile_url: string;
      area_hectares: number;
    };
    mature: {
      tile_url: string;
      area_hectares: number;
    };
    old_age: {
      tile_url: string;
      area_hectares: number;
    };
  };
  last_updated?: string;
}

// Processed Forest Response
export interface ProcessedForestResponse {
  plot_name: string;
  age_classes: {
    young: { tile_url: string; area_hectares: number };
    mid_age: { tile_url: string; area_hectares: number };
    mature: { tile_url: string; area_hectares: number };
    old_age: { tile_url: string; area_hectares: number };
  };
  district?: string;
  geometry?: { type: string; coordinates: unknown };
  canopy_summary?: ForestCanopyResponse['canopy_summary'];
}

// Fetch Forest Canopy Height Age Structure
export const fetchForestCanopy = async (
  district: string,
  subdistrict?: string,
  village?: string
): Promise<ProcessedForestResponse> => {
  try {
    let url = `${getBaseUrl()}/CanopyHeightAgeStructureclasswise?district=${encodeURIComponent(district)}`;
    if (subdistrict) {
      url += `&subdistrict=${encodeURIComponent(subdistrict)}`;
    }
    if (village) {
      url += `&village=${encodeURIComponent(village)}`;
    }

    const response = await postJsonWithRetry(url);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json();
    const current = (raw?.current ?? raw) as ForestCanopyResponse & {
      age_classes?: ProcessedForestResponse['age_classes'];
    };

    if (!current?.age_classes) {
      throw new Error('No age_classes found in response');
    }

    return {
      plot_name: current.plot_name ?? district,
      age_classes: current.age_classes,
      district,
      geometry: current.geometry,
      canopy_summary: current.canopy_summary,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/CanopyHeightAgeStructureclasswise`);
    }
    throw error;
  }
};

// NDVI Sugarcane Detection Response
export interface NDVISugarcaneResponse {
  plot_id: string;
  month: string;
  ndvi_range: number[];
  area_ha: number;
  tile_url: string;
  export: string;
  last_updated: string;
}

// Processed NDVI Sugarcane Response
export interface ProcessedNDVISugarcaneResponse {
  tile_url: string;
  area_ha: number;
  plot_id: string;
  district?: string;
  subdistrict?: string;
}

/**
 * Deployed API has no `/ndvi-sugarcane-detection` route (404). Use growth classwise tile for the same AOI.
 */
async function fetchSugarcaneTileFromGrowthFallback(
  district: string,
  subdistrict: string,
  village: string
): Promise<ProcessedNDVISugarcaneResponse> {
  const growth = await fetchGrowthAnalysis1(district, subdistrict, village);
  const plots = growth.plots ?? [];
  for (const p of plots) {
    const plot = p as GrowthPlotData;
    const props = plot.properties;
    const tileUrl = props?.tile_url ?? plot.tile_url;
    if (typeof tileUrl === 'string' && tileUrl.length > 0) {
      const plotId = String(props?.plot_id ?? plot.plot_id ?? 'growth-overlay');
      let areaHa: number | undefined = growth.area_hectares ?? growth.pixel_summary?.area_hectares;
      if (areaHa == null && props?.area_acres != null) {
        areaHa = Number(props.area_acres) * 0.404685;
      }
      return {
        tile_url: tileUrl,
        area_ha: typeof areaHa === 'number' && !Number.isNaN(areaHa) ? areaHa : 0,
        plot_id: plotId,
        district,
        subdistrict,
      };
    }
  }
  const cw = growth.classwise?.find(
    (c: NonNullable<GrowthAnalysisWithStoredResponse['classwise']>[number]) => c.tile_url
  );
  if (cw?.tile_url) {
    return {
      tile_url: cw.tile_url,
      area_ha: typeof cw.area_hectares === 'number' ? cw.area_hectares : 0,
      plot_id: 'growth-classwise',
      district,
      subdistrict,
    };
  }
  throw new Error(
    'No raster tile URL in growth analysis for this village. The backend does not expose /ndvi-sugarcane-detection.'
  );
}

/**
 * Sugarcane map overlay tile.
 * Deployed backend has no `/ndvi-sugarcane-detection`; when subdistrict + village are known, use
 * `analyze_Growthclasswise` directly (same tile) and avoid a redundant 404 in the Network tab.
 * Legacy path: try `/ndvi-sugarcane-detection` only when village is not yet selected.
 */
export const fetchNDVISugarcaneDetection = async (
  district: string,
  subdistrict?: string,
  village?: string
): Promise<ProcessedNDVISugarcaneResponse> => {
  if (subdistrict && village) {
    return fetchSugarcaneTileFromGrowthFallback(district, subdistrict, village);
  }

  const url = `${getBaseUrl()}/ndvi-sugarcane-detection?district=${encodeURIComponent(district)}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
      },
      body: '',
    });

    if (response.ok) {
      const data: NDVISugarcaneResponse = await response.json();
      if (!data.tile_url || data.area_ha === undefined || !data.plot_id) {
        throw new Error('Missing required fields in response: tile_url, area_ha, or plot_id');
      }
      return {
        tile_url: data.tile_url,
        area_ha: data.area_ha,
        plot_id: data.plot_id,
        district,
        subdistrict,
      };
    }

    if (response.status === 404 && subdistrict && village) {
      return fetchSugarcaneTileFromGrowthFallback(district, subdistrict, village);
    }

    if (response.status === 404) {
      throw new Error(
        'Sugarcane NDVI endpoint is not deployed (404). Choose subdistrict and village — the app will use the growth-analysis map tile instead.'
      );
    }

    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      if (subdistrict && village) {
        try {
          return await fetchSugarcaneTileFromGrowthFallback(district, subdistrict, village);
        } catch {
          /* fall through */
        }
      }
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/ndvi-sugarcane-detection`);
    }
    throw error;
  }
};

// Land Surface Temperature Response (legacy FeatureCollection + new flat payload)
export interface LandSurfaceTemperatureResponse {
  type?: string;
  plot_id?: string;
  geometry?: {
    type: string;
    coordinates: unknown;
  };
  /** New API field */
  lst_tile_url?: string;
  lst_class_combined_tile?: string;
  lst_class_tiles?: Record<string, string>;
  lst_classwise_area_hectare?: {
    type?: string;
    features?: Array<{
      type?: string;
      geometry?: unknown;
      properties?: {
        area_hectare?: number;
        class_id?: number;
        class_label?: string;
      };
    }>;
  };
  start_date?: string;
  end_date?: string;
  last_updated?: string;
  features?: Array<{
    type: string;
    geometry: {
      type: string;
      coordinates: number[][][];
    };
    properties: {
      plot_id?: string;
      tile_url?: string;
      lst_tile_url?: string;
      data_source?: string;
      start_date?: string;
      end_date?: string;
      last_updated?: string;
    };
  }>;
}

export interface LstClassAreaItem {
  class_id: number;
  class_label: string;
  area_hectare: number;
  tile_url?: string | null;
}

// Processed Land Surface Temperature Response
export interface ProcessedLandSurfaceTemperatureResponse {
  tile_url: string;
  district?: string;
  start_date?: string;
  end_date?: string;
  class_combined_tile?: string | null;
  class_tiles?: Record<string, string>;
  classwise: LstClassAreaItem[];
}

function normalizeLstResponse(
  data: LandSurfaceTemperatureResponse,
  district: string
): ProcessedLandSurfaceTemperatureResponse {
  const tileUrl =
    data.lst_tile_url ||
    data.lst_class_combined_tile ||
    data.features?.[0]?.properties?.lst_tile_url ||
    data.features?.[0]?.properties?.tile_url ||
    '';

  if (!tileUrl) {
    throw new Error('No tile_url found in response');
  }

  const classTiles = data.lst_class_tiles || {};
  const features = data.lst_classwise_area_hectare?.features || [];
  const classwise: LstClassAreaItem[] = features
    .map((f) => {
      const props = f.properties || {};
      const label = String(props.class_label || '').trim();
      if (!label) return null;
      return {
        class_id: Number(props.class_id ?? 0),
        class_label: label,
        area_hectare: Number(props.area_hectare ?? 0),
        tile_url: classTiles[label] || null,
      };
    })
    .filter((x): x is LstClassAreaItem => x != null)
    .sort((a, b) => a.class_id - b.class_id);

  return {
    tile_url: tileUrl,
    district: data.plot_id || district,
    start_date: data.start_date || data.features?.[0]?.properties?.start_date,
    end_date: data.end_date || data.features?.[0]?.properties?.end_date,
    class_combined_tile: data.lst_class_combined_tile || null,
    class_tiles: classTiles,
    classwise,
  };
}

// Fetch Land Surface Temperature (district / optional subdistrict / village)
export const fetchLandSurfaceTemperature = async (
  district: string,
  startDate: string = '2025-11-20',
  endDate: string = '2025-12-23',
  options?: { subdistrict?: string; village?: string }
): Promise<ProcessedLandSurfaceTemperatureResponse> => {
  try {
    const params = new URLSearchParams({
      district,
      start_date: startDate,
      end_date: endDate,
    });
    if (options?.subdistrict) params.set('subdistrict', options.subdistrict);
    if (options?.village) params.set('village', options.village);

    const url = `${getBaseUrl()}/land-surface-temperature?${params.toString()}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json'
      },
      body: ''
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: LandSurfaceTemperatureResponse = await response.json();
    return normalizeLstResponse(data, district);
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/land-surface-temperature`);
    }
    throw error;
  }
};

// ET (Evapotranspiration) Response
export interface ETResponse {
  date: string;
  hour: number;
  latitude: number;
  longitude: number;
  ET_current_hour_mm: number;
}

// Fetch ET data for a plot
export const fetchET = async (lat: number, lon: number): Promise<ETResponse> => {
  try {
    const url = `${getBaseUrl()}/compute-et?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const response = await getJsonWithRetry(url);
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: ETResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/compute-et`);
    }
    throw error;
  }
};

// Weather Response
export interface WeatherResponse {
  location: string;
  region: string;
  country: string;
  date: string;
  hour: number;
  temperature_c: number;
  humidity: number;
  wind_kph: number;
  precip_mm: number;
  condition: string;
}

// Fetch Weather data for a plot
export const fetchWeather = async (lat: number, lon: number): Promise<WeatherResponse> => {
  try {
    const url = `${getBaseUrl()}/current-weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const response = await getJsonWithRetry(url);
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data: WeatherResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to ${getBaseUrl()}/current-weather`);
    }
    throw error;
  }
};

export interface PlotEtWeatherBundle {
  et: ETResponse;
  weather: WeatherResponse;
}

const plotEtWeatherCache = createApiCache<PlotEtWeatherBundle>();

/** 20 min — ET/weather changes slowly; avoids repeat slow API calls per plot. */
const PLOT_ET_WEATHER_TTL_MS = 20 * 60 * 1000;

export const peekPlotEtWeather = (plotId: string): PlotEtWeatherBundle | null =>
  plotEtWeatherCache.peek(`plot-et-weather:v2:${plotId}`);

export const isPlotEtWeatherFresh = (plotId: string): boolean =>
  plotEtWeatherCache.isFresh(`plot-et-weather:v2:${plotId}`);

/** Cached ET + current weather for a plot (dedupes concurrent requests). */
export const fetchPlotEtWeather = async (
  plotId: string,
  latitude: number,
  longitude: number
): Promise<PlotEtWeatherBundle> => {
  const key = `plot-et-weather:v2:${plotId}`;
  return plotEtWeatherCache.getOrFetch(key, PLOT_ET_WEATHER_TTL_MS, async () => {
    const [et, weather] = await Promise.all([
      fetchET(latitude, longitude),
      fetchWeather(latitude, longitude),
    ]);
    return { et, weather };
  });
};

// Weather (daily) response: district/subdistrict/village
export interface WeatherDailyItem {
  date: string; // YYYY-MM-DD
  temp_max: number;
  temp_min: number;
  rainfall: number;
  wind_max: number;
}

export interface WeatherDailyResponse {
  level: 'district' | 'subdistrict' | 'village' | string;
  name: string;
  latitude: number;
  longitude: number;
  daily: WeatherDailyItem[];
}

// Fetch Daily Weather (district/subdistrict/village)
// In development we use Vite proxy (/railway -> Railway backend) to avoid CORS. In production we call BASE_URL directly.
const weatherDailyCache = createApiCache<WeatherDailyResponse>();

/** 1 h — daily weather series for dashboard charts. */
const WEATHER_DAILY_TTL_MS = 60 * 60 * 1000;

const fetchWeatherDailyFromNetwork = async (
  district: string,
  subdistrict?: string,
  village?: string
): Promise<WeatherDailyResponse> => {
  const districtQ = district.trim();
  const subdistrictQ = subdistrict?.trim() || '';
  const villageQ = village?.trim() || '';
  const query = `district=${encodeURIComponent(districtQ)}${
    subdistrictQ ? `&subdistrict=${encodeURIComponent(subdistrictQ)}` : ''
  }${villageQ ? `&village=${encodeURIComponent(villageQ)}` : ''}`;

  const tryUrl = (pathPrefix: string) => `${getBaseUrl()}${pathPrefix}/weather/daily?${query}`;
  const proxyUrl = typeof window !== 'undefined' ? `${window.location.origin}/railway/weather/daily?${query}` : '';

  const urlsToTry: string[] = isDevelopment && proxyUrl
    ? [proxyUrl, tryUrl(''), tryUrl('/api')]   // dev: try proxy first (avoids CORS)
    : [tryUrl(''), tryUrl('/api')];

  let lastError: Error | null = null;
  for (const url of urlsToTry) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        lastError = new Error(`API Error: ${response.status} ${response.statusText}. Tried: ${url}`);
        if (response.status === 404) continue;
        throw lastError;
      }
      lastError = null;

      const raw = await response.json();
      const dailyRaw = Array.isArray(raw?.daily) ? raw.daily : [];
      const data: WeatherDailyResponse = {
        level: String(raw?.level ?? ''),
        name: String(raw?.name ?? (villageQ || subdistrictQ || districtQ)),
        latitude: Number(raw?.latitude ?? 0),
        longitude: Number(raw?.longitude ?? 0),
        daily: dailyRaw.map((d: any) => ({
          date: String(d?.date ?? ''),
          temp_max: Number(d?.temp_max ?? d?.tempMax ?? 0),
          temp_min: Number(d?.temp_min ?? d?.tempMin ?? 0),
          rainfall: Number(d?.rainfall ?? d?.rain ?? 0),
          wind_max: Number(d?.wind_max ?? d?.windMax ?? 0),
        })),
      };
      return data;
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        lastError = err;
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Failed to fetch' || err instanceof TypeError) {
        lastError = new Error(`Cannot reach weather/daily API. Check: (1) Backend is running at ${getBaseUrl()}, (2) CORS allows your app origin, (3) Network/firewall. URL tried: ${url}`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error(`Weather daily API returned 404 for all paths. Backend must expose GET /weather/daily?district=... (or /api/weather/daily). Tried: ${urlsToTry.join(' ; ')}`);
};

// Fetch Daily Weather (district/subdistrict/village) — cached 1 h
export const fetchWeatherDaily = async (
  district: string,
  subdistrict?: string,
  village?: string
): Promise<WeatherDailyResponse> => {
  const cacheKey = `weather-daily:${district}:${subdistrict ?? ''}:${village ?? ''}`;
  return weatherDailyCache.getOrFetch(cacheKey, WEATHER_DAILY_TTL_MS, () =>
    fetchWeatherDailyFromNetwork(district, subdistrict, village)
  );
};

/** Open-Meteo wind AOI payload: polygon ring + sampled grid points with current wind/temp (GET /weather/wind-direct). */
export interface WindDirectLatLon {
  lat: number;
  lon: number;
}

export interface WindDirectBBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

export interface WindDirectSummary {
  avg_temperature_2m?: number;
  avg_wind_speed_10m?: number;
  avg_wind_direction_10m?: number;
  max_wind_speed_10m?: number;
}

export interface WindDirectPointWeather {
  latitude: number;
  longitude: number;
  temperature_2m?: number | null;
  wind_speed_10m?: number | null;
  wind_direction_10m?: number | null;
  wind_gusts_10m?: number | null;
  timestamp?: string | null;
}

export interface WindDirectResponse {
  points_count: number;
  centroid: WindDirectLatLon;
  bbox: WindDirectBBox;
  aoi_ring: WindDirectLatLon[];
  sampled_points?: WindDirectLatLon[];
  timestamp_utc?: string;
  summary: WindDirectSummary;
  points_weather: WindDirectPointWeather[];
}

/** Wind AOI for district / optional subdistrict / village (same query shape as /weather/daily). */
export const fetchWindDirect = async (
  district: string,
  subdistrict?: string,
  village?: string
): Promise<WindDirectResponse> => {
  const query = `district=${encodeURIComponent(district)}${subdistrict ? `&subdistrict=${encodeURIComponent(subdistrict)}` : ''}${village ? `&village=${encodeURIComponent(village)}` : ''}`;

  const tryUrl = (pathPrefix: string) => `${getBaseUrl()}${pathPrefix}/weather/wind-direct?${query}`;
  const proxyUrl = typeof window !== 'undefined' ? `${window.location.origin}/railway/weather/wind-direct?${query}` : '';

  const urlsToTry: string[] = isDevelopment && proxyUrl
    ? [proxyUrl, tryUrl(''), tryUrl('/api')]
    : [tryUrl(''), tryUrl('/api')];

  let lastError: Error | null = null;
  for (const url of urlsToTry) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        lastError = new Error(`API Error: ${response.status} ${response.statusText}. Tried: ${url}`);
        if (response.status === 404) continue;
        throw lastError;
      }
      lastError = null;

      const data: WindDirectResponse = await response.json();
      return data;
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        lastError = err;
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Failed to fetch' || err instanceof TypeError) {
        lastError = new Error(`Cannot reach weather/wind-direct API. Check backend and CORS. URL tried: ${url}`);
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error(`weather/wind-direct returned 404 for all paths. Tried: ${urlsToTry.join(' ; ')}`);
};

/** Key used in map tile URL maps for building built-up overlay */
export const BUILDING_BUILTUP_TILE_KEY = 'building-builtup';

export interface BuildingClasswiseItem {
  class_id: number;
  class_name: string;
  color: string;
  count: number;
  percentage: number;
  tile_url: string;
}

export interface BuildingSummary {
  total_buildings: number;
  confidence_0_65_0_70: number;
  confidence_0_70_0_75: number;
  confidence_gte_0_75: number;
  builtup_area_hectares: number;
  aoi_area_hectares: number;
  builtup_percentage: number;
}

export interface BuildingBuiltupResponse {
  type: string;
  features: Array<{
    type: string;
    geometry: unknown;
    properties: {
      plot_id: string;
      area_acres?: number;
      tile_url: string;
      data_source?: string;
      min_confidence?: number;
      last_updated?: string;
    };
  }>;
  building_summary?: BuildingSummary;
  classwise?: BuildingClasswiseItem[];
}

/** POST /buildingbuiltup — Google Open Buildings built-up layer (district / subdistrict / village). */
export const fetchBuildingBuiltup = async (
  district: string,
  subdistrict?: string,
  village?: string,
  minConfidence = 0.65
): Promise<BuildingBuiltupResponse> => {
  let url = `${getBaseUrl()}/buildingbuiltup?district=${encodeURIComponent(district.trim())}`;
  if (subdistrict?.trim()) {
    url += `&subdistrict=${encodeURIComponent(subdistrict.trim())}`;
  }
  if (village?.trim()) {
    url += `&village=${encodeURIComponent(village.trim())}`;
  }
  url += `&min_confidence=${encodeURIComponent(String(minConfidence))}`;

  const response = await postJsonWithRetry(url);
  if (!response.ok) {
    throw new Error(`Building built-up API Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
};
