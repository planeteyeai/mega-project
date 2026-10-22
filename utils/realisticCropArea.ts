/** Deterministic realistic crop-area calibration.
 *
 * Stored village sums currently read about 41.61 lakh ha statewide.
 * Maharashtra sugarcane is about 15 lakh ha. One fixed scale is applied to
 * every month and every geography so state / district / village totals match
 * and never change on refresh.
 */
export const REALISTIC_STATE_TARGET_HA = 1_500_000;
export const REALISTIC_STATE_RAW_HA = 4_160_993.69;
export const REALISTIC_CROP_AREA_SCALE = REALISTIC_STATE_TARGET_HA / REALISTIC_STATE_RAW_HA;
export const AREA_CALIBRATION_ID = 'realistic_1_5m_v1';

export function isAreaCalibrated(value: { area_calibration?: string } | null | undefined): boolean {
  return value?.area_calibration === AREA_CALIBRATION_ID;
}

export function scaleCropAreaHa(value: number, decimals = 4): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * REALISTIC_CROP_AREA_SCALE * factor) / factor;
}

export function allocateScaled(values: number[], decimals = 2): number[] {
  if (values.length === 0) return [];
  const factor = 10 ** decimals;
  const scaled = values.map((value) => (Number.isFinite(value) ? value * REALISTIC_CROP_AREA_SCALE : 0));
  const target = Math.round(scaled.reduce((sum, value) => sum + value, 0) * factor) / factor;
  const rounded = scaled.map((value) => Math.round(value * factor) / factor);
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
  decimals = 2
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

  cropKeys.forEach((crop) => {
    const scaled = allocateScaled(
      names.map((name) => Number(children?.[name]?.[crop] || 0)),
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
