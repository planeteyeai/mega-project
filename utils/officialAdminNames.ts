/** Current Maharashtra LGD / gazette display names for districts and talukas. */

const norm = (value: string | null | undefined): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const DISTRICT_DISPLAY: Record<string, string> = {
  ahmadnagar: 'Ahilyanagar',
  ahmednagar: 'Ahilyanagar',
  'ahmed nagar': 'Ahilyanagar',
  ahilyanagar: 'Ahilyanagar',
  'ahilya nagar': 'Ahilyanagar',
  aurangabad: 'Chhatrapati Sambhajinagar',
  'chhatrapati sambhajinagar': 'Chhatrapati Sambhajinagar',
  'chhatrapati sambhaji nagar': 'Chhatrapati Sambhajinagar',
  sambhajinagar: 'Chhatrapati Sambhajinagar',
  'sambhaji nagar': 'Chhatrapati Sambhajinagar',
  osmanabad: 'Dharashiv',
  usmanabad: 'Dharashiv',
  dharashiv: 'Dharashiv',
  buldana: 'Buldhana',
  buldhana: 'Buldhana',
  gondiya: 'Gondia',
  gondia: 'Gondia',
  raigarh: 'Raigad',
  raigad: 'Raigad',
  sangali: 'Sangli',
  sangli: 'Sangli',
  nasik: 'Nashik',
  nashik: 'Nashik',
};

const SUBDISTRICT_DISPLAY: Record<string, string> = {
  nagar: 'Ahilyanagar',
  ahmadnagar: 'Ahilyanagar',
  ahmednagar: 'Ahilyanagar',
  ahilyanagar: 'Ahilyanagar',
  aurangabad: 'Chhatrapati Sambhajinagar',
  osmanabad: 'Dharashiv',
  usmanabad: 'Dharashiv',
  dharashiv: 'Dharashiv',
  nasik: 'Nashik',
  peint: 'Peth',
  fulambari: 'Phulambri',
  khuldabad: 'Khultabad',
  soygaon: 'Soegaon',
  chikli: 'Chikhli',
  'deulgaon-raja': 'Deulgaon Raja',
  'deulgaon raja': 'Deulgaon Raja',
  'jalgaon-jamod': 'Jalgaon Jamod',
  'jalgaon jamod': 'Jalgaon Jamod',
  'sindkhed-raja': 'Sindkhed Raja',
  'sindkhed raja': 'Sindkhed Raja',
  buldana: 'Buldhana',
  tirora: 'Tiroda',
  edlabad: 'Muktainagar',
  dahanau: 'Dahanu',
  vada: 'Wada',
  guhaghar: 'Guhagar',
  sangmeshwar: 'Sangameshwar',
  savantwadi: 'Sawantwadi',
  malwan: 'Malvan',
  mahableshwar: 'Mahabaleshwar',
  kalmnuri: 'Kalamnuri',
  aundha: 'Aundha Nagnath',
  kamthi: 'Kamptee',
  saoner: 'Savner',
  umrer: 'Umred',
  kalmeshwar: 'Kalameshwar',
  mauda: 'Mouda',
  bhamaragad: 'Bhamragad',
  bramhapuri: 'Brahmapuri',
  nagbhir: 'Nagbhid',
  manwat: 'Manwath',
  akarni: 'Akrani',
  hatkalangale: 'Hatkanangale',
  'gagan-bawada': 'Gaganbawada',
  'gagan bawada': 'Gaganbawada',
  ambarnath: 'Ambernath',
  deglur: 'Degloor',
  mahur: 'Mahoor',
  'zari zamni': 'Zari Jamni',
  'zari-jamni': 'Zari Jamni',
  rahta: 'Rahata',
  jat: 'Jath',
};

/** Cache namespace bump after the LGD rename so stale district lists are dropped. */
export const ADMIN_NAMES_CACHE_VERSION = 'v7-lgd-rename';

export function officialDistrictDisplay(name: string | null | undefined): string {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return DISTRICT_DISPLAY[norm(raw)] || raw;
}

export function officialSubdistrictDisplay(name: string | null | undefined): string {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return SUBDISTRICT_DISPLAY[norm(raw)] || raw;
}

export function withOfficialDistrictName<T extends { district?: string }>(row: T): T {
  if (!row?.district) return row;
  return { ...row, district: officialDistrictDisplay(row.district) };
}

export function withOfficialSubdistrictName<T extends { subdistrict?: string }>(row: T): T {
  if (!row?.subdistrict) return row;
  return { ...row, subdistrict: officialSubdistrictDisplay(row.subdistrict) };
}
