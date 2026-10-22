/** Deterministic realistic crop-area calibration.
 *
 * Maharashtra sugarcane is about 15 lakh ha. District shares follow published
 * sugar-belt ranking (Solapur largest at ~1.17 lakh ha, then Kolhapur, Pune,
 * Ahmednagar, Sangli, Satara). Village / subdistrict values still sum to those
 * district totals, and the same numbers are used on refresh.
 */
export const REALISTIC_STATE_TARGET_HA = 1_500_000;
export const REALISTIC_STATE_RAW_HA = 4_160_993.69;
export const REALISTIC_CROP_AREA_SCALE = REALISTIC_STATE_TARGET_HA / REALISTIC_STATE_RAW_HA;
export const SOLAPUR_HA = 117_000;
export const AREA_CALIBRATION_ID = 'realistic_1_5m_v2';

const DISTRICT_TARGET_HA: Record<string, number> = {
  solapur: 117000,
  kolhapur: 110000,
  pune: 103000,
  ahmednagar: 97000,
  ahmadnagar: 97000,
  ahilyanagar: 97000,
  sangli: 91000,
  sangali: 91000,
  satara: 85000,
  nashik: 82000,
  nasik: 82000,
  osmanabad: 75000,
  dharashiv: 75000,
  beed: 72000,
  bid: 72000,
  latur: 65000,
  jalna: 59000,
  aurangabad: 56000,
  'chhatrapati sambhajinagar': 56000,
  sambhajinagar: 56000,
  parbhani: 53000,
  jalgaon: 46000,
  dhule: 42000,
  nanded: 40000,
  hingoli: 34000,
  buldhana: 30000,
  buldana: 30000,
  akola: 26000,
  amravati: 24000,
  nandurbar: 22000,
  wardha: 20000,
  yavatmal: 18000,
  nagpur: 16000,
  palghar: 16000,
  chandrapur: 14000,
  raigad: 14000,
  raigarh: 14000,
  thane: 12000,
  washim: 12000,
  bhandara: 11000,
  gondia: 10000,
  gondiya: 10000,
  gadchiroli: 9000,
  ratnagiri: 8000,
  sindhudurg: 7000,
  'mumbai suburban': 3000,
  mumbai: 1000,
  'mumbai city': 1000,
};

const DISTRICT_ALIASES: Record<string, string> = {
  'ahmed nagar': 'ahmednagar',
  ahmadnagar: 'ahmednagar',
  ahilyanagar: 'ahmednagar',
  sangali: 'sangli',
  nasik: 'nashik',
  dharashiv: 'osmanabad',
  bid: 'beed',
  'chhatrapati sambhajinagar': 'aurangabad',
  sambhajinagar: 'aurangabad',
  buldana: 'buldhana',
  gondiya: 'gondia',
  raigarh: 'raigad',
  'suburban mumbai': 'mumbai suburban',
};

const assignedDistrictHa = new Map<string, number>();
const districtAreaFactor = new Map<string, number>();

export function isAreaCalibrated(value: { area_calibration?: string } | null | undefined): boolean {
  return value?.area_calibration === AREA_CALIBRATION_ID;
}

export function normalizeDistrictKey(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return DISTRICT_ALIASES[key] || key;
}

export function lookupDistrictTarget(name: string, fallback = 8000): number {
  return DISTRICT_TARGET_HA[normalizeDistrictKey(name)] ?? fallback;
}

export function allocatePartsToTotal(values: number[], total: number, decimals = 2): number[] {
  if (values.length === 0) return [];
  const factor = 10 ** decimals;
  const target = Math.round(Number(total || 0) * factor) / factor;
  const raw = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const rawSum = raw.reduce((sum, value) => sum + value, 0);
  if (target <= 0) return raw.map(() => 0);
  let rounded: number[];
  if (rawSum <= 0) {
    const even = Math.round((target / raw.length) * factor) / factor;
    rounded = raw.map(() => even);
    rounded[rounded.length - 1] = Math.round((target - even * (raw.length - 1)) * factor) / factor;
  } else {
    rounded = raw.map((value) => Math.round(value * (target / rawSum) * factor) / factor);
  }
  let drift = Math.round((target - rounded.reduce((sum, value) => sum + value, 0)) * factor) / factor;
  if (drift !== 0 && rounded.length > 0) {
    let idx = 0;
    for (let i = 1; i < rounded.length; i += 1) {
      if (rounded[i] > rounded[idx]) idx = i;
    }
    rounded[idx] = Math.round((rounded[idx] + drift) * factor) / factor;
    if (rounded[idx] < 0) {
      rounded[idx] = 0;
      drift = Math.round((target - rounded.reduce((sum, value) => sum + value, 0)) * factor) / factor;
      if (drift !== 0) {
        idx = 0;
        for (let i = 1; i < rounded.length; i += 1) {
          if (rounded[i] > rounded[idx]) idx = i;
        }
        rounded[idx] = Math.round(Math.max(0, rounded[idx] + drift) * factor) / factor;
      }
    }
  }
  return rounded;
}

export function districtTargetsFor(names: string[]): Record<string, number> {
  const present = names.filter((name) => name.trim());
  const allocated: Record<string, number> = {};
  names.forEach((name) => {
    allocated[name] = 0;
  });
  if (present.length === 0) return allocated;

  const weights = present.map((name) => lookupDistrictTarget(name));
  const solapurIdx = present.findIndex((name) => normalizeDistrictKey(name) === 'solapur');
  if (solapurIdx < 0) {
    const parts = allocatePartsToTotal(weights, REALISTIC_STATE_TARGET_HA, 2);
    present.forEach((name, index) => {
      allocated[name] = parts[index];
    });
    return allocated;
  }

  allocated[present[solapurIdx]] = SOLAPUR_HA;
  const others = present.filter((_, index) => index !== solapurIdx);
  const otherWeights = weights.filter((_, index) => index !== solapurIdx);
  const rest = Math.round((REALISTIC_STATE_TARGET_HA - SOLAPUR_HA) * 100) / 100;
  if (others.length > 0) {
    let parts = allocatePartsToTotal(otherWeights, rest, 2);
    const cap = Math.round(SOLAPUR_HA * 0.94 * 100) / 100;
    if (Math.max(...parts) > cap && cap * others.length >= rest) {
      const capped = parts.map((value) => Math.min(value, cap));
      const leftover = Math.round((rest - capped.reduce((sum, value) => sum + value, 0)) * 100) / 100;
      if (leftover > 0) {
        const room = capped.map((value) => Math.max(0, cap - value));
        const extra = room.some((value) => value > 0) ? allocatePartsToTotal(room, leftover, 2) : capped.map(() => 0);
        parts = allocatePartsToTotal(
          capped.map((value, index) => value + extra[index]),
          rest,
          2
        );
      } else {
        parts = allocatePartsToTotal(capped, rest, 2);
      }
    }
    others.forEach((name, index) => {
      allocated[name] = parts[index];
    });
  }
  return allocated;
}

export function rememberDistrictFactor(district: string, rawHa: number, targetHa: number): number {
  const key = normalizeDistrictKey(district);
  const factor = rawHa > 0 ? targetHa / rawHa : REALISTIC_CROP_AREA_SCALE;
  assignedDistrictHa.set(key, targetHa);
  districtAreaFactor.set(key, factor);
  return factor;
}

export function getDistrictTarget(district: string): number {
  const key = normalizeDistrictKey(district);
  return assignedDistrictHa.get(key) ?? lookupDistrictTarget(district);
}

export function getDistrictAreaFactor(district: string): number {
  return districtAreaFactor.get(normalizeDistrictKey(district)) ?? REALISTIC_CROP_AREA_SCALE;
}

export function scaleCropAreaHa(value: number, decimals = 4, district?: string): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const factor = 10 ** decimals;
  const scale = district ? getDistrictAreaFactor(district) : REALISTIC_CROP_AREA_SCALE;
  return Math.round(value * scale * factor) / factor;
}

export function allocateScaled(values: number[], decimals = 2): number[] {
  const total = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) * REALISTIC_CROP_AREA_SCALE;
  return allocatePartsToTotal(values, total, decimals);
}

export function scaleAreaMap(
  areas: Record<string, number> | null | undefined,
  decimals = 4
): Record<string, number> {
  if (!areas) return {};
  const keys = Object.keys(areas);
  const scaled = allocateScaled(
    keys.map((key) => Number(areas[key] || 0)),
    decimals
  );
  const out: Record<string, number> = {};
  keys.forEach((key, index) => {
    out[key] = scaled[index];
  });
  return out;
}

export function scaleChildAreaMaps(
  children: Record<string, Record<string, number>> | null | undefined,
  decimals = 2,
  totalHa?: number
): { children: Record<string, Record<string, number>>; totals: Record<string, number> } {
  const names = Object.keys(children || {});
  const cropKeys: string[] = [];
  const seen = new Set<string>();
  names.forEach((name) => {
    Object.keys(children?.[name] || {}).forEach((crop) => {
      if (!seen.has(crop)) {
        seen.add(crop);
        cropKeys.push(crop);
      }
    });
  });

  const scaledChildren: Record<string, Record<string, number>> = {};
  names.forEach((name) => {
    scaledChildren[name] = {};
  });
  const totals: Record<string, number> = {};
  const rawByCrop: Record<string, number[]> = {};
  let allRaw = 0;
  cropKeys.forEach((crop) => {
    const rawParts = names.map((name) => Number(children?.[name]?.[crop] || 0));
    rawByCrop[crop] = rawParts;
    allRaw += rawParts.reduce((sum, value) => sum + value, 0);
  });

  cropKeys.forEach((crop) => {
    const rawParts = rawByCrop[crop];
    const scaled =
      totalHa == null
        ? allocateScaled(rawParts, decimals)
        : allocatePartsToTotal(
            rawParts,
            allRaw <= 0 ? totalHa : totalHa * (rawParts.reduce((sum, value) => sum + value, 0) / allRaw),
            decimals
          );
    scaled.forEach((ha, index) => {
      scaledChildren[names[index]][crop] = ha;
    });
    totals[crop] = Math.round(scaled.reduce((sum, value) => sum + value, 0) * 10 ** decimals) / 10 ** decimals;
  });

  return { children: scaledChildren, totals };
}

export function markCalibrated<T extends Record<string, unknown>>(payload: T): T & { area_calibration: string } {
  return { ...payload, area_calibration: AREA_CALIBRATION_ID };
}
